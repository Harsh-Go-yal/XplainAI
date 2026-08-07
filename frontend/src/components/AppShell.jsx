import React, { useState, useEffect } from 'react';
import HistorySidebar from './HistorySidebar';
import ChatArea from './ChatArea';
import XAIPanel from './XAIPanel';
import { useSSE } from '../hooks/useSSE';

export default function AppShell() {
  const [xaiPanelWidth, setXaiPanelWidth] = useState(0); // 0 means collapsed
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [isSidebarResizing, setIsSidebarResizing] = useState(false);
  const [historicalPipelineState, setHistoricalPipelineState] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [activeConversationId, setActiveConversationId] = useState(null);

  const { messages, isThinking, activeStage, pipelineState, sendMessage, resumeMessage, stopMessage, conversationId } = useSSE(activeConversationId, setActiveConversationId);

  // Auto-clear historical tree when a new response starts
  useEffect(() => {
    if (isThinking) {
      setHistoricalPipelineState(null);
    }
  }, [isThinking]);

  const loadHistory = React.useCallback(async () => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/history');
      const data = await res.json();
      setConversations(data);
    } catch (err) {
      console.error('Failed to load history', err);
    }
  }, []);

  const handleDeleteChat = async (id, e) => {
    e.stopPropagation();
    try {
      await fetch(`http://127.0.0.1:8000/api/conversation/${id}`, { method: 'DELETE' });
      if (activeConversationId === id) {
        setActiveConversationId(null);
      }
      loadHistory();
    } catch (err) {
      console.error('Failed to delete chat', err);
    }
  };

  // Fetch history on mount and when new messages are added
  useEffect(() => {
    loadHistory();
  }, [loadHistory, messages.length]);

  // Load width from local storage or set default
  useEffect(() => {
    const savedWidth = localStorage.getItem('xaiPanelWidth');
    let widthToSet = 400; // default
    if (savedWidth) {
      widthToSet = parseInt(savedWidth, 10);
    }
    
    // Clamp to max 60% of screen width to prevent layout breaking
    const maxWidth = document.body.clientWidth * 0.6;
    if (widthToSet > maxWidth) {
      widthToSet = maxWidth;
    }
    if (widthToSet < 200) {
      widthToSet = 200;
    }
    
    setXaiPanelWidth(widthToSet);
  }, []);

  const startResizing = React.useCallback(() => {
    setIsResizing(true);
  }, []);

  const stopResizing = React.useCallback(() => {
    setIsResizing(false);
    setIsSidebarResizing(false);
  }, []);

  const startSidebarResizing = React.useCallback(() => {
    setIsSidebarResizing(true);
  }, []);

  const resize = React.useCallback(
    (mouseMoveEvent) => {
      if (isResizing) {
        const newWidth = document.body.clientWidth - mouseMoveEvent.clientX;
        const maxWidth = document.body.clientWidth * 0.6; // Max 60% of screen
        if (newWidth > 200 && newWidth < maxWidth) {
          setXaiPanelWidth(newWidth);
          localStorage.setItem('xaiPanelWidth', newWidth);
        }
      }
      if (isSidebarResizing) {
        const newWidth = mouseMoveEvent.clientX;
        if (newWidth > 150 && newWidth < 500) {
          setSidebarWidth(newWidth);
        }
      }
    },
    [isResizing, isSidebarResizing]
  );

  useEffect(() => {
    window.addEventListener('mousemove', resize);
    window.addEventListener('mouseup', stopResizing);
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [resize, stopResizing]);

  const togglePanel = () => {
    setIsPanelOpen(!isPanelOpen);
  };

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      
      {/* Sidebar - Resizable Width */}
      <div style={{ width: `${sidebarWidth}px`, flexShrink: 0, borderRight: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', position: 'relative' }}>
        <HistorySidebar 
          conversations={conversations} 
          activeId={activeConversationId} 
          onSelect={setActiveConversationId}
          onNewChat={() => setActiveConversationId(null)}
          onDeleteChat={handleDeleteChat}
        />
        {/* Sidebar Resizer Handle */}
        <div 
          className="resizer"
          onMouseDown={startSidebarResizing}
          style={{ 
            position: 'absolute',
            right: '-5px',
            top: 0,
            bottom: 0,
            width: '10px', 
            cursor: 'col-resize', 
            background: isSidebarResizing ? 'var(--color-accent-primary)' : 'transparent',
            zIndex: 10
          }} 
          onMouseEnter={(e) => { if (!isSidebarResizing) e.target.style.background = 'rgba(100, 100, 100, 0.2)'; }}
          onMouseLeave={(e) => { if (!isSidebarResizing) e.target.style.background = 'transparent'; }}
        />
      </div>

      {/* Main Chat Area - Flex Grow */}
      <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        <ChatArea 
          messages={messages}
          isThinking={isThinking}
          activeStage={activeStage}
          pipelineState={pipelineState}
          sendMessage={sendMessage}
          stopMessage={stopMessage}
          resumeMessage={resumeMessage}
          conversationId={conversationId}
          onThinkingStart={() => setIsPanelOpen(true)}
          onViewTree={(state) => {
            setHistoricalPipelineState(state);
            setIsPanelOpen(true);
          }}
        />
      </div>

      {/* Resizer Handle for XAI Panel */}
      {isPanelOpen && (
        <div 
          className="resizer"
          onMouseDown={startResizing}
          style={{ 
            width: '10px', 
            cursor: 'col-resize', 
            background: isResizing ? 'var(--color-accent-primary)' : 'transparent',
            zIndex: 10,
            marginLeft: '-5px',
            marginRight: '-5px'
          }}
          onMouseEnter={(e) => { if (!isResizing) e.target.style.background = 'rgba(100, 100, 100, 0.2)'; }}
          onMouseLeave={(e) => { if (!isResizing) e.target.style.background = 'transparent'; }}
        />
      )}

      {/* XAI Panel - Resizable */}
      {isPanelOpen && (
        <div 
          style={{ 
            width: `${xaiPanelWidth}px`, 
            flexShrink: 0, 
            borderLeft: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative'
          }}
          className="glass-panel"
        >
          <button 
            onClick={togglePanel}
            style={{ position: 'absolute', left: '-30px', top: '10px', background: 'var(--color-bg-panel)', padding: '5px', borderRadius: '4px 0 0 4px', border: '1px solid var(--border-color)'}}
          >
            ▶
          </button>
          {historicalPipelineState && (
            <div style={{ position: 'absolute', top: '10px', left: '50%', transform: 'translateX(-50%)', background: 'var(--color-accent-primary)', color: 'white', padding: '4px 12px', borderRadius: '12px', fontSize: '0.8rem', zIndex: 20, boxShadow: '0 4px 12px rgba(0,0,0,0.3)', pointerEvents: 'none' }}>
              Viewing Historical Tree
            </div>
          )}
          <XAIPanel width={xaiPanelWidth} pipelineState={historicalPipelineState || pipelineState} isThinking={isThinking && !historicalPipelineState} activeStage={historicalPipelineState ? 'summary' : activeStage} />
        </div>
      )}
      
      {/* Toggle button if closed */}
      {!isPanelOpen && (
        <button 
          onClick={togglePanel}
          style={{ position: 'absolute', right: '0', top: '10px', background: 'var(--color-bg-panel)', padding: '10px', borderRadius: '4px 0 0 4px', border: '1px solid var(--border-color)', zIndex: 10}}
        >
          ◀ XAI
        </button>
      )}
    </div>
  );
}
