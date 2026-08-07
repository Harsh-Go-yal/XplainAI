import { useState, useEffect, useCallback, useRef } from 'react';

export function useSSE(activeConversationId = null, onConversationCreated = null) {
  const [messages, setMessages] = useState([]);
  const [isThinking, setIsThinking] = useState(false);
  const [activeStage, setActiveStage] = useState(null);
  const [pipelineState, setPipelineState] = useState({});
  const eventSourceRef = useRef(null);

  const [conversationId, setConversationId] = useState(null);

  useEffect(() => {
    if (activeConversationId) {
      if (activeConversationId !== conversationId) {
        // Fetch conversation messages
        setConversationId(activeConversationId);
        setIsThinking(true);
        fetch(`http://127.0.0.1:8000/api/conversation/${activeConversationId}`)
          .then(res => res.json())
          .then(data => {
            if (data && data.messages) {
              setMessages(data.messages);
            }
            setIsThinking(false);
          })
          .catch(err => {
            console.error(err);
            setIsThinking(false);
          });
      }
    } else {
      // New Chat
      if (conversationId !== null) {
        setConversationId(null);
        setMessages([]);
        setPipelineState({});
        setActiveStage(null);
      }
    }
  }, [activeConversationId]);

  const sendMessage = useCallback(async (query, options = {}) => {
    setIsThinking(true);
    setPipelineState({});
    
    // Add user message to UI immediately
    setMessages(prev => [...prev, { 
      role: 'user', 
      content: query, 
      created_at: new Date().toISOString(),
      document_uploaded: options.document_uploaded,
      document_path: options.document_path
    }]);

    try {
      // 1. Init chat
      const res = await fetch('http://127.0.0.1:8000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query, 
          conversation_id: conversationId,
          document_uploaded: options.document_uploaded || false,
          document_path: options.document_path || null,
          mode: options.mode || "moderate",
          research_enabled: options.research_enabled !== undefined ? options.research_enabled : null,
          reverse_mind: options.reverse_mind || false
        })
      });
      const data = await res.json();
      const convId = data.conversation_id;
      setConversationId(convId);
      if (onConversationCreated) {
        onConversationCreated(convId);
      }

      // 2. Connect SSE
      let sseUrl = `http://127.0.0.1:8000/api/chat/stream/${convId}?query=${encodeURIComponent(query)}`;
      if (options.document_uploaded) sseUrl += `&document_uploaded=true`;
      if (options.document_path) sseUrl += `&document_path=${encodeURIComponent(options.document_path)}`;
      if (options.mode) sseUrl += `&mode=${options.mode}`;
      if (options.research_enabled !== undefined && options.research_enabled !== null) sseUrl += `&research_enabled=${options.research_enabled}`;
      if (options.reverse_mind) sseUrl += `&reverse_mind=true`;
      const es = new EventSource(sseUrl);
      eventSourceRef.current = es;

      let currentPipeline = {};

      es.addEventListener('stage_complete', (e) => {
        const payload = JSON.parse(e.data);
        setActiveStage(payload.stage);
        setPipelineState(prev => {
          const next = { 
            ...prev, 
            ...payload.result,
            completed_stages: { ...(prev.completed_stages || {}), [payload.stage]: true }
          };
          currentPipeline = next;
          return next;
        });
      });

      es.addEventListener('clarification_required', (e) => {
        const payload = JSON.parse(e.data);
        setIsThinking(false);
        setActiveStage(null);
        es.close();
        
        setPipelineState(prev => ({
          ...prev,
          needs_clarification: true,
          clarification_questions: payload.questions
        }));
      });

      es.addEventListener('complete', () => {
        setIsThinking(false);
        setActiveStage(null);
        es.close();
        
        if (currentPipeline.answer) {
          setMessages(m => [...m, { role: 'ai', content: currentPipeline.answer, fullState: currentPipeline, created_at: new Date().toISOString() }]);
        }
      });

      es.addEventListener('error', (e) => {
        console.error('SSE Error:', e);
        setIsThinking(false);
        setActiveStage(null);
        es.close();
        setMessages(m => [...m, { role: 'ai', isError: true, content: 'An error occurred while generating the response. Please try again.' }]);
      });

    } catch (err) {
      console.error('Chat error:', err);
      setIsThinking(false);
      setMessages(m => [...m, { role: 'ai', isError: true, content: 'Failed to connect to the server.' }]);
    }
  }, [conversationId, onConversationCreated]);

  const resumeMessage = useCallback(async (answersString) => {
    if (!conversationId) return;
    
    setIsThinking(true);
    setPipelineState(prev => ({
      ...prev,
      needs_clarification: false,
      clarification_questions: null
    }));
    
    try {
      // 1. Post to resume endpoint
      await fetch('http://127.0.0.1:8000/api/chat/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conversationId, answers: answersString })
      });

      // 2. Connect SSE for resume
      const sseUrl = `http://127.0.0.1:8000/api/chat/resume_stream/${conversationId}?answers=${encodeURIComponent(answersString)}`;
      const es = new EventSource(sseUrl);
      eventSourceRef.current = es;

      let currentPipeline = pipelineState;

      es.addEventListener('stage_complete', (e) => {
        const payload = JSON.parse(e.data);
        setActiveStage(payload.stage);
        setPipelineState(prev => {
          const next = { 
            ...prev, 
            ...payload.result,
            completed_stages: { ...(prev.completed_stages || {}), [payload.stage]: true }
          };
          currentPipeline = next;
          return next;
        });
      });

      es.addEventListener('clarification_required', (e) => {
        const payload = JSON.parse(e.data);
        setIsThinking(false);
        setActiveStage(null);
        es.close();
        
        setPipelineState(prev => ({
          ...prev,
          needs_clarification: true,
          clarification_questions: payload.questions
        }));
      });

      es.addEventListener('complete', () => {
        setIsThinking(false);
        setActiveStage(null);
        es.close();
        
        if (currentPipeline.answer) {
          setMessages(m => [...m, { role: 'ai', content: currentPipeline.answer, fullState: currentPipeline, created_at: new Date().toISOString() }]);
        }
      });

      es.addEventListener('error', (e) => {
        console.error('SSE Error:', e);
        setIsThinking(false);
        setActiveStage(null);
        es.close();
        setMessages(m => [...m, { role: 'ai', isError: true, content: 'An error occurred while resuming the response. Please try again.' }]);
      });

    } catch (err) {
      console.error('Resume error:', err);
      setIsThinking(false);
      setMessages(m => [...m, { role: 'ai', isError: true, content: 'Failed to connect to the server.' }]);
    }
  }, [conversationId, pipelineState]);

  const stopMessage = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsThinking(false);
    setActiveStage(null);
  }, []);

  return { messages, isThinking, activeStage, pipelineState, sendMessage, resumeMessage, stopMessage, conversationId };
}
