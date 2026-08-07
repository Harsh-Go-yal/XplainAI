import os
import json
import asyncio
from typing import Dict, Any, List
from fastapi import FastAPI, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse
from pydantic import BaseModel
import uuid

# Set dotenv path before importing graph
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

from graph import builder
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from langgraph.types import Command

app = FastAPI(title="ReasonLens API")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development; restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Database
import database
database.init_db()

class ChatRequest(BaseModel):
    query: str
    conversation_id: str | None = None
    document_uploaded: bool = False
    document_path: str | None = None
    mode: str = "moderate"
    research_enabled: bool | None = None
    reverse_mind: bool = False

rl_profiles: Dict[str, str] = {}

class FeedbackRequest(BaseModel):
    conversation_id: str
    message_index: int
    type: str  # 'up' or 'down'
    message_text: str

@app.post("/api/chat/feedback")
async def handle_feedback(req: FeedbackRequest):
    current_profile = rl_profiles.get(req.conversation_id, "")
    
    # Simple reinforcement loop using the LLM to extract preference rules
    try:
        from langchain_core.messages import HumanMessage
        from graph import llm
        
        if req.type == 'down':
            prompt = f"The user disliked this response: '{req.message_text[:200]}...'\nWrite a strict 1-sentence instruction on what NOT to do based on this."
            res = await llm.ainvoke([HumanMessage(content=prompt)])
            rule = res.content.strip()
            rl_profiles[req.conversation_id] = current_profile + f"\n- AVOID: {rule}"
            
        elif req.type == 'up':
            prompt = f"The user liked this response: '{req.message_text[:200]}...'\nWrite a 1-sentence instruction on what TO do based on this."
            res = await llm.ainvoke([HumanMessage(content=prompt)])
            rule = res.content.strip()
            rl_profiles[req.conversation_id] = current_profile + f"\n- PREFER: {rule}"
    except Exception as e:
        print(f"Failed to update RL profile: {e}")

    return {"status": "ok", "profile": rl_profiles.get(req.conversation_id, "")}

@app.post("/api/chat")
async def chat(request: ChatRequest):
    conv_id = request.conversation_id or str(uuid.uuid4())
    query = request.query
    
    # Ensure conversation exists
    database.create_conversation(conv_id)
        
    # Add user message
    database.add_message(conv_id, "user", query)

    return {"conversation_id": conv_id, "query": query}

@app.post("/api/upload")
async def upload_document(file: UploadFile = File(...)):
    uploads_dir = os.path.join(os.path.dirname(__file__), "uploads")
    os.makedirs(uploads_dir, exist_ok=True)
    
    file_path = os.path.join(uploads_dir, file.filename)
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)
        
    return {"status": "ok", "document_path": file_path}

@app.get("/api/chat/stream/{conversation_id}")
async def stream_chat(
    conversation_id: str, 
    query: str,
    document_uploaded: bool = False,
    document_path: str | None = None,
    mode: str = "moderate",
    research_enabled: bool | None = None,
    reverse_mind: bool = False
):
    async def event_generator():
        # Fetch chat history, excluding the current query which was just added
        conv = database.get_conversation(conversation_id)
        chat_history = []
        if conv and "messages" in conv:
            for msg in conv["messages"][:-1]:
                chat_history.append({"role": msg["role"], "content": msg["content"]})
                
        state = {
            "user_query": query, 
            "chat_history": chat_history,
            "document_uploaded": document_uploaded,
            "document_path": document_path,
            "mode": mode,
            "research_enabled": research_enabled,
            "reverse_mind": reverse_mind,
            "rl_profile": rl_profiles.get(conversation_id, "")
        }
        config = {"configurable": {"thread_id": conversation_id}}
        
        try:
            async with AsyncSqliteSaver.from_conn_string("graph_state.db") as saver:
                graph = builder.compile(checkpointer=saver)
                
                async for step in graph.astream(state, config=config):
                    for node_name, node_state in step.items():
                        if node_name == "__interrupt__":
                            # LangGraph yields an interrupt!
                            questions = node_state[0].value
                            yield {
                                "event": "clarification_required",
                                "data": json.dumps({"questions": questions})
                            }
                            return
                            
                        yield {
                            "event": "stage_complete",
                            "data": json.dumps({"stage": node_name, "result": node_state})
                        }
                        state.update(node_state)
                
                # Check if it was interrupted (fallback check)
                snap = await graph.aget_state(config)
                if snap.tasks and snap.tasks[0].interrupts:
                    yield {
                        "event": "clarification_required",
                        "data": json.dumps({"questions": snap.tasks[0].interrupts[0].value})
                    }
                    return

                # Send completion event
                yield {
                    "event": "complete",
                    "data": json.dumps({"status": "done"})
                }
                
                # Save the AI response to conversation history
                final_state = snap.values
                database.add_message(
                    conversation_id, 
                    "ai", 
                    final_state.get("answer", ""), 
                    final_state
                )
                
        except Exception as e:
            print(f"Error in stream: {e}")
            yield {
                "event": "error",
                "data": json.dumps({"error": str(e)})
            }
            
    return EventSourceResponse(event_generator())

class ResumeRequest(BaseModel):
    conversation_id: str
    answers: str

@app.post("/api/chat/resume")
async def resume_chat(request: ResumeRequest):
    # Log user answers to database for history
    database.add_message(request.conversation_id, "user", f"Answers to clarification:\n{request.answers}")
    return {"status": "ok"}

@app.get("/api/chat/resume_stream/{conversation_id}")
async def resume_stream(conversation_id: str, answers: str):
    async def event_generator():
        config = {"configurable": {"thread_id": conversation_id}}
        
        try:
            async with AsyncSqliteSaver.from_conn_string("graph_state.db") as saver:
                graph = builder.compile(checkpointer=saver)
                
                # Resume execution with Command
                async for step in graph.astream(Command(resume=answers), config=config):
                    for node_name, node_state in step.items():
                        if node_name == "__interrupt__":
                            questions = node_state[0].value
                            yield {
                                "event": "clarification_required",
                                "data": json.dumps({"questions": questions})
                            }
                            return
                            
                        yield {
                            "event": "stage_complete",
                            "data": json.dumps({"stage": node_name, "result": node_state})
                        }
                
                snap = await graph.aget_state(config)
                
                # Send completion event
                yield {
                    "event": "complete",
                    "data": json.dumps({"status": "done"})
                }
                
                # Save the AI response to conversation history
                final_state = snap.values
                database.add_message(
                    conversation_id, 
                    "ai", 
                    final_state.get("answer", ""), 
                    final_state
                )
                
        except Exception as e:
            import traceback
            traceback.print_exc()
            yield {
                "event": "error",
                "data": json.dumps({"error": str(e)})
            }
            
    return EventSourceResponse(event_generator())

@app.get("/api/history")
async def get_history():
    return database.get_history()

@app.get("/api/conversation/{conversation_id}")
async def get_conversation(conversation_id: str):
    conv = database.get_conversation(conversation_id)
    if not conv:
        return {"error": "Conversation not found"}
    return conv

@app.delete("/api/conversation/{conversation_id}")
async def delete_conversation(conversation_id: str):
    database.delete_conversation(conversation_id)
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
