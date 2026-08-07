import os
import json
import re
from typing import TypedDict, List, Dict, Any, Optional
from dotenv import load_dotenv, find_dotenv

from langgraph.graph import StateGraph, START, END
from langgraph.types import interrupt
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_core.tools import tool
import requests
from langchain_community.tools import DuckDuckGoSearchResults
from langchain_community.document_loaders import PyPDFLoader, Docx2txtLoader, UnstructuredPowerPointLoader
from langchain_core.documents import Document
from langchain_community.vectorstores import FAISS
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_google_genai import GoogleGenerativeAIEmbeddings

# Robustly find .env in parent directories
load_dotenv(find_dotenv())
api_key = os.getenv("OPENAI_API_KEY")

llm = ChatOpenAI(
    model="gpt-5-mini",
    api_key=api_key,
    temperature=0.0
)

embeddings = GoogleGenerativeAIEmbeddings(model="gemini-embedding-2-preview")

def _strip_code_fence(text):
    text = text.strip()
    match = re.search(r"```(?:json)?\s*(\{.*\}|\[.*\])\s*```", text, re.DOTALL)
    if match:
        return match.group(1).strip()
    for open_ch, close_ch in (("{", "}"), ("[", "]")):
        start = text.find(open_ch)
        if start == -1: continue
        depth = 0
        for i in range(start, len(text)):
            if text[i] == open_ch: depth += 1
            elif text[i] == close_ch:
                depth -= 1
                if depth == 0: return text[start:i + 1]
    return text

NEWSDATA_API_KEY = "pub_1f6e2cc488e9463fbc42eb71bc75ecfe"
ALPHA_VANTAGE_API_KEY = "10AGWWBLI1BDVB3Z"
OPENWEATHER_API_KEY = "57419a34cdcc2831dc657294bc919862"

search_tool = DuckDuckGoSearchResults(region="us-en")

@tool
def calculator(num1: float, num2: float, op: str) -> dict:
    """Perform basic arithmetic operations on two numbers. Supported operations: add, subtract, multiply, divide"""
    try:
        if op == "add": result = num1 + num2
        elif op == "subtract": result = num1 - num2
        elif op == "multiply": result = num1 * num2
        elif op == "divide":
            if num2 == 0: return {"error": "Cannot divide by zero"}
            result = num1 / num2
        else: return {"error": f"Unsupported operation '{op}'"}
        return {"num1": num1, "num2": num2, "operation": op, "result": result}
    except Exception as e:
        return {"error": str(e)}

@tool
def get_stock_price(symbol: str) -> dict:
    """Fetch latest stock price for a given symbol using Alpha Vantage. 
    IMPORTANT: For Indian stocks, you MUST append '.BSE' to the symbol (e.g., 'TCS.BSE', 'RELIANCE.BSE'). Do not use '.NSE' or '.NS'."""
    url = f"https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol={symbol}&apikey={ALPHA_VANTAGE_API_KEY}"
    return requests.get(url, timeout=15).json()

@tool
def get_weather(city: str) -> dict:
    """Fetch current weather for a given city using OpenWeatherMap."""
    url = f"https://api.openweathermap.org/data/2.5/weather?q={city}&appid={OPENWEATHER_API_KEY}&units=metric"
    return requests.get(url, timeout=15).json()

@tool
def get_news(query: str) -> dict:
    """Fetch latest news articles related to a query using NewsData.io."""
    url = "https://newsdata.io/api/1/latest"
    return requests.get(url, params={"apikey": NEWSDATA_API_KEY, "q": query}, timeout=15).json()

available_tools = [search_tool, calculator, get_stock_price, get_weather, get_news]

PLANNER_TOOL_MAP = {
    "DuckDuckGo Search": search_tool,
    "News API": get_news,
    "Stock Market API": get_stock_price,
}

def parse_json_response(response):
    content = response.content
    if isinstance(content, str):
        text = content
    elif isinstance(content, list):
        text = "".join(
            item.get("text", "")
            for item in content
            if isinstance(item, dict)
        )
    else:
        raise ValueError(f"Unsupported response type: {type(content)}")

    text = _strip_code_fence(text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        print("Raw LLM Output:")
        print(text)
        raise ValueError("LLM did not return valid JSON.")

class State(TypedDict):
    user_query: str
    chat_history: List[Dict]
    original_query: str
    query_analysis: Dict
    missing_context: Dict
    # Node 1.75 - Reasoning & Evidence Planner
    reasoning_plan: Dict
    
    # --- new: document / RAG flow ---
    document_uploaded: Optional[bool]
    document_path: Optional[str]
    pdf_context: List[str]

    # --- new: Research Agent ---
    research_enabled: Optional[bool]
    research_findings: Dict
    mode: Optional[str]

    # Reinforcement Learning
    rl_profile: Optional[str]
    reverse_mind: Optional[bool]

    # Node 2
    source_selection: Dict
    tool_results: List[Dict]
    evidence: Dict
    candidate_approaches: List[Dict]
    evaluations: List[Dict]
    selected_approach: Dict
    rejected_approaches: List[Dict]
    answer: str
    explainability: Dict
    reasoning_tree: Dict
    summary: Dict

MISSING_CONTEXT_PROMPT = """
You are the Missing Context Detector for an Explainable AI system.
You are given the user's query and its Query Analysis.
Your job is to decide whether the system needs to ask the user follow-up questions before it can answer safely and accurately.
Use the "ambiguity" field from the Query Analysis as your primary signal,
but also use your own judgement (e.g. missing patient details for a medical
question, missing location for a weather question, missing symbol for a
stock question, missing timeframe for a news question).
If ANY of these details are missing, you MUST set "needs_clarification": true and ask for them.
Rules:
- Ask AT MOST 4 questions.
- Only ask questions that materially change the answer.
- Questions must be short, specific, and directly answerable by the user.
- Do NOT answer the user's original query.
- Assume the user's premise is correct (e.g., if they ask about a product, assume it exists and is released). Do not fact-check them using internal knowledge.
- IMPORTANT: If Document Uploaded is true, the user has already provided the file. Do NOT ask them to provide a file, a link, or ask for basic details about the document like its language or topic. Only ask questions if strictly necessary to clarify their specific question, otherwise set needs_clarification to false.
- Return ONLY valid JSON exactly in this format:
{
    "needs_clarification": false,
    "questions": []
}
"""

def missing_context_detector(state: State) -> dict:
    if "Additional details provided by the user:" in state.get("user_query", ""):
        return {"missing_context": {"needs_clarification": False, "questions": []}}

    history_str = json.dumps(state.get("chat_history", []), indent=2)
    human_prompt = f"""
Chat History:
{history_str}

User Query:
{state["user_query"]}

Query Analysis:
{json.dumps(state.get("query_analysis", {}), indent=2)}

Document Uploaded:
{state.get("document_uploaded", False)}
"""
    response = llm.invoke([
        SystemMessage(content=MISSING_CONTEXT_PROMPT),
        HumanMessage(content=human_prompt)
    ])
    result = parse_json_response(response)
    
    if result.get("needs_clarification") and result.get("questions"):
        # Pause execution and send questions to the user
        user_answers = interrupt(result["questions"])
        
        # When resumed, user_answers will contain the user's responses
        new_query = state["user_query"] + f"\n\nAdditional details provided by the user:\n{user_answers}"
        return {
            "user_query": new_query,
            "missing_context": {"needs_clarification": False, "questions": []}
        }
        
    return {"missing_context": result}

REASONING_EVIDENCE_PLANNER_PROMPT = """
You are the Reasoning & Evidence Planner of an Explainable AI system.
Your responsibility is to determine the most effective reasoning strategy before generating any answer.
Inputs: User Query, Query Analysis, Missing Context Result
Available Tools:
- LLM (Reasoning and knowledge synthesis)
- DuckDuckGo Search (General web search)
- News API (Latest news and current events)
- Stock Market API (Financial and market data)
Tasks:
1. Analyze the query complexity
2. Determine the reasoning strategy
3. Select ONLY the tools that add meaningful value. If none needed, use only LLM.
Return ONLY valid JSON exactly in this format:
{
  "query_complexity": "",
  "reasoning_strategy": "",
  "selected_tools": [
    {
      "tool_name": "",
      "priority": 95,
      "expected_contribution": 40,
      "expected_trust": 98,
      "reason_for_selection": ""
    }
  ],
  "ignored_tools": [],
  "minimum_evidence_sources": 1,
  "candidate_approaches": 5,
  "expected_confidence": 95,
  "planning_summary": ""
}
"""

def reasoning_evidence_planner(state: State) -> State:
    history_str = json.dumps(state.get("chat_history", []), indent=2)
    human_prompt = f"""
Chat History:
{history_str}

User Query:
{state["user_query"]}

Query Analysis:
{json.dumps(state.get("query_analysis", {}), indent=2)}
"""
    response = llm.invoke([
        SystemMessage(content=REASONING_EVIDENCE_PLANNER_PROMPT),
        HumanMessage(content=human_prompt)
    ])
    state["reasoning_plan"] = parse_json_response(response)
    return state

def query_analysis(state: State) -> State:
    query = state["user_query"]
    system_prompt = """
You are the Query Analysis Engine for an Explainable AI system.
Analyze the user's query.
Return ONLY valid JSON.
{
    "intent": "",
    "domain": "",
    "query_type": "",
    "complexity": "",
    "ambiguity": {
        "is_ambiguous": false,
        "reason": ""
    },
    "entities": [],
    "keywords": [],
    "required_knowledge": [],
    "possible_user_goal": "",
    "constraints": [],
    "reasoning_type": "",
    "risk_level": "",
    "confidence": 0,
    "analysis_summary": ""
}
Rules:
- Do NOT answer the user's question.
- Only analyze the query.
- Assume the user's premise is correct (e.g., if they ask about a product, assume it exists and is released). Do not mark a query as ambiguous just because your internal knowledge cutoff thinks a product is unreleased.
- Return ONLY valid JSON.
"""
    history_str = json.dumps(state.get("chat_history", []), indent=2)
    human_prompt = f"Chat History:\n{history_str}\n\nUser Query:\n{query}"
    
    response = llm.invoke([
        SystemMessage(content=system_prompt),
        HumanMessage(content=human_prompt)
    ])
    state["query_analysis"] = parse_json_response(response)
    return state

def source_selection(state: State) -> State:
    SOURCE_SELECTION_PROMPT = """
You are the Source Selection Engine for an Explainable AI system.
Your task is to determine whether answering the user's query requires external information.
Available Sources:
1. LLM Internal Knowledge
2. Google Search
3. Wikipedia
4. Research Papers
5. Government Websites
6. Official Documentation
7. News Articles
8. Books
9. Stack Overflow
10. GitHub
Instructions:
- Does the query require external sources?
- Which sources should be used?
- Why should each source be used?
- Assign a priority (1 = highest).
- Assign a confidence score (0-100).
Do NOT answer the user's question.
Return ONLY valid JSON.
{
  "requires_external_sources": true,
  "selected_sources": [
    {
      "source": "",
      "priority": 1,
      "confidence": 95,
      "reason": ""
    }
  ],
  "source_summary": ""
}
"""
    human_prompt = f"""
User Query:
{state["user_query"]}

Query Analysis:
{json.dumps(state.get("query_analysis", {}), indent=2)}
"""
    response = llm.invoke([
        SystemMessage(content=SOURCE_SELECTION_PROMPT),
        HumanMessage(content=human_prompt)
    ])
    state["source_selection"] = parse_json_response(response)
    return state

TOOL_ROUTING_PROMPT = """
You are the Tool Execution Router for an Explainable AI system.
The Reasoning & Evidence Planner has already decided WHICH tools are worth calling.
Call those tools with the right arguments. If none are useful, call none.
"""

def tool_execution(state: State) -> dict:
    plan = state.get("reasoning_plan", {}) or {}
    selected = plan.get("selected_tools", []) or []
    planned_tools = []
    for entry in selected:
        name = entry.get("tool_name", "")
        mapped = PLANNER_TOOL_MAP.get(name)
        if mapped is not None and mapped not in planned_tools:
            planned_tools.append(mapped)
            
    if not planned_tools:
        planned_tools = available_tools
        scoped_llm_with_tools = llm.bind_tools(planned_tools)
    else:
        # Force the model to use at least one tool since the planner explicitly requested it
        scoped_llm_with_tools = llm.bind_tools(planned_tools, tool_choice="any")
        
    human_prompt = f"""
User Query:
{state["user_query"]}

Reasoning & Evidence Plan:
{json.dumps(plan, indent=2)}

You MUST call the tools selected in the Reasoning Plan to fetch live data. Do NOT answer the user's query here.
"""
    response = scoped_llm_with_tools.invoke([
        SystemMessage(content="You are the Tool Execution Router. You MUST execute the requested tools."),
        HumanMessage(content=human_prompt)
    ])
    
    tool_results = []
    for call in getattr(response, "tool_calls", None) or []:
        name = call["name"]
        args = call.get("args", {})
        matching_tool = next((t for t in planned_tools if t.name == name), None)
        if matching_tool is None:
            tool_results.append({"tool": name, "input": args, "output": {"error": f"Unknown tool '{name}'"}})
            continue
        try:
            output = matching_tool.invoke(args)
        except Exception as e:
            output = {"error": str(e)}
        tool_results.append({"tool": name, "input": args, "output": output})
        
    return {"tool_results": tool_results}

_vector_store_cache: Dict[str, Any] = {}

def process_media_file(file_path: str) -> List[Document]:
    import openai
    import tempfile
    import subprocess
    
    client = openai.OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
    
    ext = file_path.lower().split('.')[-1]
    audio_path = file_path
    
    # If it's a video, extract audio first
    if ext in ['mp4', 'mov', 'avi', 'mkv']:
        audio_path = file_path + ".mp3"
        subprocess.run([
            "ffmpeg", "-i", file_path, "-q:a", "0", "-map", "a", audio_path, "-y"
        ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
    with open(audio_path, "rb") as audio_file:
        transcript = client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_file
        )
        
    # Cleanup temp audio if we created it
    if audio_path != file_path:
        os.remove(audio_path)
        
    return [Document(page_content=transcript.text, metadata={"source": file_path})]

def _get_retriever_for_document(document_path: str):
    if document_path not in _vector_store_cache:
        ext = document_path.lower().split('.')[-1]
        
        if ext == 'pdf':
            loader = PyPDFLoader(document_path)
            docs = loader.load()
        elif ext in ['doc', 'docx']:
            loader = Docx2txtLoader(document_path)
            docs = loader.load()
        elif ext in ['ppt', 'pptx']:
            loader = UnstructuredPowerPointLoader(document_path)
            docs = loader.load()
        elif ext in ['mp3', 'wav', 'mp4', 'mov', 'avi', 'mkv', 'm4a']:
            docs = process_media_file(document_path)
        else:
            raise ValueError(f"Unsupported file type: {ext}")
            
        chunks = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200).split_documents(docs)
        vector_store = FAISS.from_documents(chunks, embeddings)
        _vector_store_cache[document_path] = vector_store
    return _vector_store_cache[document_path].as_retriever(search_type="similarity", search_kwargs={"k": 4})

def rag_node(state: State) -> dict:
    document_path = state.get("document_path")
    if not document_path:
        return {"pdf_context": []}

    retriever = _get_retriever_for_document(document_path)
    results = retriever.invoke(state["user_query"])
    return {"pdf_context": [doc.page_content for doc in results]}

RESEARCH_SOURCE_SITES = [
    "arxiv.org", "pubmed.ncbi.nlm.nih.gov", "scholar.google.com",
    "ieeexplore.ieee.org", "dl.acm.org", "link.springer.com", "sciencedirect.com", "nature.com",
]

RESEARCH_SUMMARY_PROMPT = """
You are the Research Agent of an Explainable AI system.

You are given the user's query and raw search results scoped to trusted
research sources (arXiv, PubMed, Google Scholar, IEEE, ACM, Springer,
ScienceDirect, Nature).

Your task:
- Identify the core topic.
- Extract key findings from up to 5 of the most relevant results.
- Note agreements and contradictions between them, if any.
- Produce a short structured summary of the evidence.

Rules:
- Do NOT fabricate papers or findings not present in the raw results.
- Do NOT answer the user's query.
- Return ONLY valid JSON.

Format:
{
    "core_topic": "",
    "key_findings": [
        {"title": "", "summary": "", "url": ""}
    ],
    "agreements": [],
    "contradictions": [],
    "evidence_summary": ""
}
"""

def research_node(state: State) -> State:
    query = state["user_query"]
    scoped_query = query + " " + " OR ".join(f"site:{s}" for s in RESEARCH_SOURCE_SITES)

    try:
        raw_results = search_tool.invoke(scoped_query)
    except Exception as e:
        raw_results = {"error": str(e)}

    human_prompt = f"""
User Query:
{query}

Raw Research Search Results:
{raw_results}
"""

    response = llm.invoke([
        SystemMessage(content=RESEARCH_SUMMARY_PROMPT),
        HumanMessage(content=human_prompt)
    ])

    state["research_findings"] = parse_json_response(response)
    return state


EVIDENCE_AGGREGATION_PROMPT = """
You are the Evidence Aggregation Engine.
Turn the raw tool outputs and document context into a structured evidence list.
For each piece of evidence, extract: source, title, summary, url, trust_score, relevance_score.
Return ONLY valid JSON exactly in this format:
{
  "evidence": [
    {
      "source": "", "title": "", "summary": "", "url": "", "trust_score": 0, "relevance_score": 0
    }
  ],
  "tool_errors": [],
  "evidence_summary": ""
}
"""

def evidence_aggregation(state: State) -> State:
    human_prompt = f"""
User Query:
{state["user_query"]}

Raw Tool Results:
{json.dumps(state.get("tool_results", []), indent=2, default=str)}

Document Context:
{json.dumps(state.get("pdf_context", []), indent=2, default=str)}
"""
    response = llm.invoke([
        SystemMessage(content=EVIDENCE_AGGREGATION_PROMPT),
        HumanMessage(content=human_prompt)
    ])
    state["evidence"] = parse_json_response(response)
    return state

def generate_candidate_approaches(state: State) -> State:
    plan = state.get("reasoning_plan", {}) or {}
    approach_count = plan.get("candidate_approaches", 5)
    if not isinstance(approach_count, int) or approach_count < 1:
        approach_count = 5
    prompt = f"""
You are the Candidate Strategy Generator for an Explainable AI system.
You are given: User Query, Query Analysis, Source Selection, Reasoning & Evidence Plan, Aggregated Evidence, Research Findings.
Generate EXACTLY {approach_count} unique candidate approaches.
Ground your approaches in the Aggregated Evidence and Research Findings where relevant.
For each approach provide:
- approach_id
- title
- description
- reasoning_type
- advantages
- disadvantages
- estimated_confidence
Return ONLY valid JSON in exactly this format with NO EXTRA FIELDS and ALL KEYS in double quotes:
{{
    "candidate_approaches": [
        {{
            "approach_id": 1,
            "title": "",
            "description": "",
            "reasoning_type": "",
            "advantages": [],
            "disadvantages": [],
            "estimated_confidence": 0
        }}
    ]
}}
Do NOT include any extra fields (like "_comment") or comments inside the JSON.
"""
    history_str = json.dumps(state.get("chat_history", []), indent=2)
    human_prompt = f"""
Chat History:
{history_str}

User Query:
{state['user_query']}

Query Analysis:
{json.dumps(state.get('query_analysis', {}), indent=2)}

Source Selection:
{json.dumps(state.get('source_selection', {}), indent=2)}

Reasoning & Evidence Plan:
{json.dumps(plan, indent=2)}

Aggregated Evidence:
{json.dumps(state.get('evidence', {}), indent=2)}
"""
    response = llm.invoke([
        SystemMessage(content=prompt),
        HumanMessage(content=human_prompt)
    ])
    data = parse_json_response(response)
    if isinstance(data, list):
        candidate_approaches = data
    elif isinstance(data, dict) and "candidate_approaches" in data:
        candidate_approaches = data["candidate_approaches"]
    else:
        raise ValueError(f"Unexpected candidate_approaches response shape: {data}")
    state["candidate_approaches"] = candidate_approaches
    return state

def evaluate_candidate_approaches(state: State) -> State:
    system_prompt = """
You are the Evaluation Engine of an Explainable AI system.
Evaluate EVERY approach independently.
Scoring Criteria:
1. Feasibility Score (0-100)
2. Relevance Score (0-100)
3. Completeness Score (0-100)
4. Source Support Score (0-100)
5. Overall Score (0-100)
Rules:
- Evaluate ALL approaches.
- Be objective.
- Do NOT generate the final answer.
- Do NOT select the best approach.
- Return ONLY valid JSON.
{
    "evaluations":[
        {
            "approach_id":1,
            "title":"",
            "feasibility_score":0,
            "relevance_score":0,
            "completeness_score":0,
            "source_support_score":0,
            "strengths":[],
            "weaknesses":[],
            "assumptions":[],
            "limitations":[],
            "overall_score":0,
            "evaluation_summary":""
        }
    ]
}
"""
    human_prompt = f"""
User Query:
{state["user_query"]}

Query Analysis:
{json.dumps(state["query_analysis"], indent=2)}

Source Selection:
{json.dumps(state["source_selection"], indent=2)}

Candidate Approaches:
{json.dumps(state["candidate_approaches"], indent=2)}
"""
    response = llm.invoke([
        SystemMessage(content=system_prompt),
        HumanMessage(content=human_prompt)
    ])
    result = parse_json_response(response)
    if "evaluations" not in result:
        raise ValueError("Missing 'evaluations' in LLM response.")
    state["evaluations"] = result["evaluations"]
    return state

def select_best_approach(state: State):
    SELECT_BEST_PROMPT = """
You are the Decision Selection Engine.
Select the single best approach based on evaluations.
Explain why selected and why others rejected.
Do NOT answer the query.
Return ONLY valid JSON.
{
"selected_approach": {
    "approach_id": 0,
    "title": "",
    "selection_reason": "",
    "overall_confidence": 0
},
"rejected_approaches": [
    {
    "approach_id": 0,
    "reason_for_rejection": ""
    }
]
}
"""
    human_prompt = f"""
User Query:
{state["user_query"]}

Query Analysis:
{json.dumps(state["query_analysis"], indent=2)}

Candidate Approaches:
{json.dumps(state["candidate_approaches"], indent=2)}

Evaluations:
{json.dumps(state["evaluations"], indent=2)}
"""
    response = llm.invoke([
        SystemMessage(content=SELECT_BEST_PROMPT),
        HumanMessage(content=human_prompt)
    ])
    result = parse_json_response(response)
    state["selected_approach"] = result["selected_approach"]
    state["rejected_approaches"] = result.get("rejected_approaches", [])
    return state

def generate_final_answer(state: State) -> State:

    # Reinforcement Learning Profile Injection
    rl_instructions = ""
    if state.get("rl_profile") and not state.get("reverse_mind"):
        rl_instructions = f"\n\n[USER PREFERENCES FROM REINFORCEMENT LEARNING]\nThe following are specific instructions derived from user feedback (thumbs up/down). You MUST follow these rules when drafting your answer:\n{state['rl_profile']}\n[END OF USER PREFERENCES]\n"

    ANSWER_GENERATION_PROMPT = f"""
You are an expert AI assistant.
You will receive: User Query, Query Analysis, Source Selection, Selected Approach, Evaluation Results, Aggregated Evidence, Research Findings.
Your task is to generate the final answer using ONLY the selected approach and taking into account the Chat History if relevant.
If Aggregated Evidence or Research Findings contains relevant facts, USE them and cite the source inline, e.g. "(Source: <name>, <url>)". Only cite a URL that actually appears in Aggregated Evidence or Research Findings - never invent one.
If both are empty or irrelevant, answer from your own knowledge.
{rl_instructions}
Produce a concise but complete response.
Return ONLY valid JSON.
Format:
{{
    "answer":""
}}
"""
    human_prompt = f"""
User Query:
{state["user_query"]}

Chat History:
{json.dumps(state.get("chat_history", []), indent=2)}

Selected Approach:
{json.dumps(state["selected_approach"], indent=2)}

Aggregated Evidence:
{json.dumps(state.get("evidence", {}), indent=2)}

Research Findings:
{json.dumps(state.get("research_findings", {}), indent=2)}
"""
    response = llm.invoke([
        SystemMessage(content=ANSWER_GENERATION_PROMPT),
        HumanMessage(content=human_prompt)
    ])
    result = parse_json_response(response)
    if "answer" not in result:
        raise ValueError("Missing 'answer' in LLM response.")
    state["answer"] = result["answer"]
    return state

def generate_explainability(state: State) -> State:
    EXPLAINABILITY_PROMPT = """
You are the Explainability Engine of an Explainable AI system.
Your task is to generate a human-understandable explanation of how the final answer was produced.
In "sources_used", list any external evidence actually used, including its name and URL/link exactly as it appears in Aggregated Evidence or Research Findings. If no external evidence was used, this can be an empty list.
Mention whether the Research Agent ran, and why or why not.
Return ONLY valid JSON in exactly this format with NO EXTRA FIELDS and ALL KEYS in double quotes:
{{
    "why_this_answer":"",
    "why_selected":"",
    "why_other_approaches_not_selected":[],
    "sources_used":[],
    "key_decision_factors":[],
    "confidence_score":0,
    "confidence_reason":"",
    "assumptions":[],
    "uncertainties":[],
    "limitations":[],
    "risk_level":"",
    "verification_suggestion":"",
    "follow_up_questions":[],
    "decision_flow":[]
}}
Do NOT include any extra fields (like "_comment") or comments inside the JSON.
"""
    human_prompt = f"""
User Query:
{state["user_query"]}

Selected Approach:
{json.dumps(state["selected_approach"], indent=2)}

Final Answer:
{state["answer"]}

Aggregated Evidence:
{json.dumps(state.get("evidence", {}), indent=2)}

Research Findings:
{json.dumps(state.get("research_findings", {}), indent=2)}
"""
    response = llm.invoke([
        SystemMessage(content=EXPLAINABILITY_PROMPT),
        HumanMessage(content=human_prompt)
    ])
    state["explainability"] = parse_json_response(response)
    return state

def generate_reasoning_tree(state: State) -> State:
    REASONING_TREE_PROMPT = """
You are the Reasoning Tree Generator.
Generate an interactive reasoning tree.
Each candidate approach becomes one node.
Also generate one Final Answer node connected only to the selected approach.
Return ONLY valid JSON in exactly this format with NO EXTRA FIELDS and ALL KEYS in double quotes:
{{
    "root":{{
        "id":"query",
        "label":"User Query"
    }},
    "nodes":[
        {{
            "id":"",
            "parent":"",
            "title":"",
            "confidence":0,
            "selected":false,
            "why":"",
            "strengths":[],
            "weaknesses":[],
            "assumptions":[],
            "limitations":[]
        }}
    ],
    "final_node":{{
        "id":"final",
        "parent":"",
        "label":"Final Answer"
    }}
}}
Do NOT include any extra fields (like "_comment") or comments inside the JSON.
"""
    human_prompt = f"""
User Query:
{state["user_query"]}

Candidate Approaches:
{json.dumps(state["candidate_approaches"], indent=2)}

Evaluations:
{json.dumps(state["evaluations"], indent=2)}

Selected Approach:
{json.dumps(state["selected_approach"], indent=2)}

Explainability:
{json.dumps(state["explainability"], indent=2)}
"""
    response = llm.invoke([
        SystemMessage(content=REASONING_TREE_PROMPT),
        HumanMessage(content=human_prompt)
    ])
    state["reasoning_tree"] = parse_json_response(response)
    return state

def generate_summary(state: State) -> State:
    SUMMARY_PROMPT = """
You are the Summary Engine.
Generate a concise summary of the AI decision.
Return ONLY valid JSON in exactly this format with NO EXTRA FIELDS and ALL KEYS in double quotes:
{{
    "summary":{{
        "selected_approach":"",
        "why_selected":"",
        "confidence":0,
        "sources_used":[],
        "key_decision_factors":[],
        "limitations":[],
        "risk_level":"",
        "verification_suggestion":"",
        "final_answer":""
    }}
}}
Do NOT include any extra fields (like "_comment") or comments inside the JSON.
"""
    human_prompt = f"""
Answer:
{state["answer"]}

Selected Approach:
{json.dumps(state["selected_approach"], indent=2)}

Explainability:
{json.dumps(state["explainability"], indent=2)}

Source Selection:
{json.dumps(state["source_selection"], indent=2)}
"""
    response = llm.invoke([
        SystemMessage(content=SUMMARY_PROMPT),
        HumanMessage(content=human_prompt)
    ])
    state["summary"] = parse_json_response(response)
    return state

def route_after_source_selection(state: State) -> list[str]:
    branches = []
    if state.get("document_uploaded"):
        branches.append("rag_node")
    
    # Fast mode explicitly skips tools and research to ensure low latency
    if state.get("mode") == "fast":
        return branches or ["evidence_aggregation"]
        
    complexity = (state.get("reasoning_plan", {}) or {}).get("query_complexity", "Moderate")
    if complexity != "Simple":
        branches.append("tool_execution")
    return branches or ["evidence_aggregation"]

def route_after_evidence_aggregation(state: State) -> str:
    mode = state.get("mode", "moderate")
    
    # Fast or Moderate modes explicitly skip deep research
    if mode in ["fast", "moderate"]:
        return "candidate_generation"
        
    # Complex mode triggers the research agent conditionally based on the planner
    if mode == "complex":
        complexity = (state.get("reasoning_plan", {}) or {}).get("query_complexity", "Moderate")
        if complexity == "Complex":
            return "research_node"
            
    return "candidate_generation"

def build_graph():
    builder = StateGraph(State)

    builder.add_node("query_analysis", query_analysis)
    builder.add_node("missing_context_detector", missing_context_detector)
    builder.add_node("reasoning_evidence_planner", reasoning_evidence_planner)
    builder.add_node("source_selection", source_selection)
    
    # New nodes
    builder.add_node("rag_node", rag_node)
    builder.add_node("tool_execution", tool_execution)
    builder.add_node("evidence_aggregation", evidence_aggregation)
    builder.add_node("research_node", research_node)
    
    builder.add_node("candidate_generation", generate_candidate_approaches)
    builder.add_node("evaluation", evaluate_candidate_approaches)
    builder.add_node("select_best", select_best_approach)
    builder.add_node("final_answer", generate_final_answer)
    builder.add_node("explainability", generate_explainability)
    builder.add_node("reasoning_tree", generate_reasoning_tree)
    builder.add_node("summary", generate_summary)

    builder.add_edge(START, "query_analysis")
    builder.add_edge("query_analysis", "missing_context_detector")
    builder.add_edge("missing_context_detector", "reasoning_evidence_planner")
    builder.add_edge("reasoning_evidence_planner", "source_selection")
    
    # Conditional branching after source_selection
    builder.add_conditional_edges(
        "source_selection",
        route_after_source_selection,
        ["rag_node", "tool_execution", "evidence_aggregation"],
    )
    builder.add_edge("rag_node", "evidence_aggregation")
    builder.add_edge("tool_execution", "evidence_aggregation")
    
    # Conditional branching after evidence_aggregation
    builder.add_conditional_edges(
        "evidence_aggregation",
        route_after_evidence_aggregation,
        ["research_node", "candidate_generation"],
    )
    builder.add_edge("research_node", "candidate_generation")
    
    builder.add_edge("candidate_generation", "evaluation")
    builder.add_edge("evaluation", "select_best")
    builder.add_edge("select_best", "final_answer")
    builder.add_edge("final_answer", "explainability")
    builder.add_edge("explainability", "reasoning_tree")
    builder.add_edge("reasoning_tree", "summary")
    builder.add_edge("summary", END)

    return builder

builder = build_graph()
