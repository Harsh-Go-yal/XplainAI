import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Plus, Paperclip, ArrowUp, Square } from 'lucide-react';

export default function ChatArea({ messages, isThinking, activeStage, pipelineState, sendMessage, resumeMessage, stopMessage, conversationId, onThinkingStart, onViewTree }) {
  const [query, setQuery] = useState('');
  const [answers, setAnswers] = useState({});
  const [mode, setMode] = useState('Moderate');
  const [showModeMenu, setShowModeMenu] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState('');
  const [uploadedFilePath, setUploadedFilePath] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);
  const endOfMessagesRef = useRef(null);
  
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setIsUploading(true);
    setUploadedFileName(file.name);
    
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      const res = await fetch('http://127.0.0.1:8000/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      setUploadedFilePath(data.document_path);
    } catch (err) {
      console.error("Upload failed", err);
      setUploadedFileName('Upload failed');
    } finally {
      setIsUploading(false);
    }
  };
  
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!query.trim() || isThinking || isUploading) return;
    
    onThinkingStart();
    const options = {
      mode: mode.toLowerCase()
    };
    
    if (mode === 'Deep Research') {
      options.research_enabled = true;
    } else if (mode === 'Reverse Mind') {
      options.reverse_mind = true;
    }
    
    if (uploadedFilePath || mode === 'Document Analysis') {
      options.document_uploaded = true;
      options.document_path = uploadedFilePath || 'EduRAG_Manuscript.pdf';
    }
    
    sendMessage(query, options);
    setQuery('');
    setShowModeMenu(false);
  };

  const handleRetry = (idx) => {
    const lastUserMsg = messages.slice(0, idx).reverse().find(m => m.role === 'user');
    if (lastUserMsg) {
      onThinkingStart();
      sendMessage(lastUserMsg.content);
    }
  };

  const [feedback, setFeedback] = useState({});
  const handleFeedback = async (idx, type) => {
    setFeedback(prev => {
      if (prev[idx] === type) {
        const next = { ...prev };
        delete next[idx];
        return next;
      }
      return { ...prev, [idx]: type };
    });

    if (conversationId) {
      const msg = messages[idx];
      try {
        await fetch('http://127.0.0.1:8000/api/chat/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversation_id: conversationId,
            message_index: idx,
            type: type,
            message_text: msg.content
          })
        });
      } catch (err) {
        console.error("Failed to send feedback", err);
      }
    }
  };

  const handleClarificationSubmit = (e) => {
    e.preventDefault();
    if (isThinking) return;

    const additionalContext = Object.entries(answers)
      .map(([q, a]) => `- ${q} -> ${a}`)
      .join('\n');
    
    onThinkingStart();
    setAnswers({});
    
    if (resumeMessage) {
        resumeMessage(additionalContext);
    }
  };

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking, activeStage]);

  const STAGE_LABELS = {
    'query_analysis': 'Analyzing your query...',
    'missing_context_detector': 'Checking for missing context...',
    'reasoning_evidence_planner': 'Formulating a reasoning plan...',
    'source_selection': 'Selecting information sources...',
    'tool_execution': 'Executing external tools...',
    'evidence_aggregation': 'Aggregating evidence...',
    'candidate_generation': 'Generating clinical approaches...',
    'evaluation': 'Evaluating safety and feasibility...',
    'select_best': 'Selecting the safest approach...',
    'final_answer': 'Drafting recommendation...',
    'explainability': 'Building explainability report...',
    'reasoning_tree': 'Constructing reasoning tree...',
    'summary': 'Finalizing summary...'
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      
      <div style={{ flexGrow: 1, padding: '2rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {messages.length === 0 ? (
          <div style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center', marginTop: '15vh' }}>
            <h1 style={{ 
              fontSize: '3rem',
              fontWeight: '700',
              marginBottom: '1rem', 
              color: '#ffffff',
              letterSpacing: '-0.02em',
              lineHeight: '1.2'
            }}>
              XplainAI
            </h1>
            <p style={{ 
              fontSize: '1.25rem',
              color: 'var(--text-secondary)', 
              fontWeight: '400',
              letterSpacing: '0.01em',
              maxWidth: '600px',
              margin: '0 auto 3rem auto',
              lineHeight: '1.6'
            }}>
              Experience AI that thinks out loud.
            </p>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div 
              key={idx} 
              className="message-enter"
              style={{ 
                maxWidth: '800px', 
                margin: '0 auto', 
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start'
              }}
            >
              <div 
                className={msg.role === 'user' ? 'user-message' : 'glass-card'}
                style={{ 
                  padding: '1rem 1.5rem', 
                  borderRadius: '1.2rem',
                  maxWidth: '85%',
                  color: msg.role === 'user' ? 'white' : 'var(--text-primary)',
                  borderBottomRightRadius: msg.role === 'user' ? '0.2rem' : '1.2rem',
                  borderBottomLeftRadius: msg.role === 'ai' ? '0.2rem' : '1.2rem'
                }}
              >
                {msg.role === 'ai' ? (
                  <div className="markdown-body">
                    {msg.isError ? (
                      <div style={{ color: '#ff6b6b', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '1.2rem' }}>⚠️</span>
                          <span>{msg.content}</span>
                        </div>
                        <div style={{ borderTop: '1px solid rgba(255, 107, 107, 0.3)', paddingTop: '1rem' }}>
                          <button 
                            onClick={() => handleRetry(idx)}
                            className="glass-button"
                            style={{ background: 'rgba(255, 107, 107, 0.1)', border: '1px solid #ff6b6b', color: '#ff6b6b', padding: '0.5rem 1rem', borderRadius: '0.5rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
                          >
                            <span style={{ fontSize: '1.2rem' }}>↻</span> Retry Generation
                          </button>
                        </div>
                      </div>
                    ) : (
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {msg.document_uploaded && msg.document_path && (
                      <div style={{ 
                        background: 'rgba(255,255,255,0.1)', 
                        padding: '0.5rem 0.75rem', 
                        borderRadius: '0.5rem',
                        fontSize: '0.85rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        wordBreak: 'break-all'
                      }}>
                        <span>📎</span>
                        <span style={{ opacity: 0.9 }}>
                          {msg.document_path.split(/[\\/]/).pop()}
                        </span>
                      </div>
                    )}
                    <div>{msg.content}</div>
                    {msg.created_at && (
                      <div style={{ fontSize: '0.75rem', opacity: 0.7, marginTop: '0.25rem', textAlign: 'right' }}>
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              {/* Feedback Icons and View Tree Button for successful AI messages */}
              {msg.role === 'ai' && !msg.isError && (
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', alignSelf: 'flex-start', marginLeft: '1rem', alignItems: 'center' }}>
                  <button 
                    onClick={() => handleFeedback(idx, 'up')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: feedback[idx] === 'up' ? 1 : 0.5, filter: feedback[idx] === 'up' ? 'none' : 'grayscale(100%)', transition: 'all 0.2s', padding: '4px' }}
                    title="Good response"
                  >
                    👍
                  </button>
                  <button 
                    onClick={() => handleFeedback(idx, 'down')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: feedback[idx] === 'down' ? 1 : 0.5, filter: feedback[idx] === 'down' ? 'none' : 'grayscale(100%)', transition: 'all 0.2s', padding: '4px' }}
                    title="Bad response"
                  >
                    👎
                  </button>
                  {msg.full_state && onViewTree && (
                    <button 
                      onClick={() => onViewTree(msg.full_state)}
                      style={{ 
                        background: 'rgba(255,255,255,0.05)', 
                        border: '1px solid var(--border-color)', 
                        color: 'var(--text-secondary)',
                        cursor: 'pointer', 
                        padding: '4px 10px', 
                        borderRadius: '12px',
                        fontSize: '0.8rem',
                        marginLeft: '10px',
                        transition: 'all 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.target.style.background = 'rgba(255,255,255,0.1)';
                        e.target.style.color = 'var(--text-primary)';
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.background = 'rgba(255,255,255,0.05)';
                        e.target.style.color = 'var(--text-secondary)';
                      }}
                      title="View XAI Reasoning Tree"
                    >
                      🌳 View Tree
                    </button>
                  )}
                </div>
              )}
            </div>
          ))
        )}

        {isThinking && (
          <div style={{ maxWidth: '800px', margin: '0 auto', width: '100%' }}>
            <div className="glass-card" style={{ padding: '1rem 1.5rem', display: 'inline-block', borderRadius: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div className="animate-spin-slow" style={{ width: '20px', height: '20px', border: '2px solid var(--accent-primary)', borderTopColor: 'transparent', borderRadius: '50%' }} />
                <span style={{ color: 'var(--text-secondary)' }}>
                  {activeStage ? STAGE_LABELS[activeStage] || 'Thinking...' : 'Thinking...'}
                </span>
              </div>
            </div>
          </div>
        )}

        {!isThinking && pipelineState?.needs_clarification && pipelineState?.clarification_questions && (
          <div style={{ maxWidth: '800px', margin: '0 auto', width: '100%' }}>
            <div className="glass-card" style={{ padding: '1.5rem', borderRadius: '1rem', border: '1px solid var(--accent-primary)' }}>
              <h3 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>Clarification Needed</h3>
              <p style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)' }}>
                The system needs a few more details before it can answer accurately:
              </p>
              <form onSubmit={handleClarificationSubmit}>
                {pipelineState.clarification_questions.map((q, idx) => (
                  <div key={idx} style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>{q}</label>
                    <input
                      type="text"
                      required
                      className="glass-input"
                      value={answers[q] || ''}
                      onChange={(e) => setAnswers({ ...answers, [q]: e.target.value })}
                      style={{ width: '100%', padding: '0.75rem', borderRadius: '0.5rem' }}
                    />
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                  <button type="submit" className="glass-button" style={{ padding: '0.75rem 1.5rem', borderRadius: '0.5rem', cursor: 'pointer', border: 'none' }}>
                    Submit Answers
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <div ref={endOfMessagesRef} />
      </div>

      <div style={{ padding: '1.5rem', background: 'linear-gradient(to top, var(--color-bg-primary) 50%, transparent)' }}>
        <form 
          onSubmit={handleSubmit}
          style={{ maxWidth: '800px', margin: '0 auto', position: 'relative', display: 'flex', alignItems: 'center' }}
        >
          <div style={{ position: 'relative', flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
            {/* Premium Mode Tag Above Input */}
            <div style={{ 
              position: 'absolute', 
              top: '-2.2rem', 
              left: '50%', 
              transform: 'translateX(-50%)',
              fontSize: '0.75rem', 
              fontWeight: '600',
              letterSpacing: '0.5px',
              textTransform: 'uppercase',
              background: 'rgba(15, 23, 42, 0.6)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              color: 'var(--text-primary)',
              padding: '6px 16px',
              borderRadius: '20px',
              border: '1px solid rgba(14, 165, 233, 0.3)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3), 0 0 15px rgba(14, 165, 233, 0.15)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              zIndex: 5,
              transition: 'all 0.3s ease'
            }}>
              <div style={{ 
                width: '8px', 
                height: '8px', 
                borderRadius: '50%', 
                background: 'var(--accent-primary)', 
                boxShadow: '0 0 10px var(--accent-primary)'
              }} />
              <span style={{ color: 'var(--text-primary)', textShadow: '0 0 10px rgba(14, 165, 233, 0.4)' }}>
                {mode}
              </span>
            </div>

            {uploadedFileName && (
              <div style={{ 
                fontSize: '0.75rem', 
                fontWeight: '500',
                color: 'var(--accent-primary)', 
                position: 'absolute', 
                top: '-2.2rem', 
                left: '1rem',
                zIndex: 5,
                background: 'rgba(14, 165, 233, 0.1)',
                backdropFilter: 'blur(8px)',
                padding: '6px 12px',
                borderRadius: '16px',
                border: '1px solid rgba(14, 165, 233, 0.2)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <Paperclip size={14} /> {isUploading ? 'Uploading...' : uploadedFileName}
              </div>
            )}
            
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
              
              {/* Left Icons inside the input box visually */}
              <div style={{ 
                position: 'absolute', 
                left: '0.5rem', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.2rem',
                zIndex: 2,
                paddingRight: '0.5rem',
                borderRight: '1px solid rgba(255, 255, 255, 0.1)',
                height: '60%'
              }}>
                <button
                  type="button"
                  onClick={() => setShowModeMenu(!showModeMenu)}
                  disabled={isThinking}
                  title="Select Mode"
                  style={{
                    background: showModeMenu ? 'var(--color-bg-tertiary)' : 'transparent',
                    border: 'none',
                    color: showModeMenu ? 'var(--accent-primary)' : 'var(--text-secondary)',
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: isThinking ? 'default' : 'pointer',
                    fontSize: '1.4rem',
                    transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                    opacity: isThinking ? 0.5 : 1
                  }}
                  onMouseEnter={(e) => { if(!isThinking) { e.target.style.background = 'rgba(255,255,255,0.05)'; e.target.style.color = 'var(--text-primary)'; e.target.style.transform = 'scale(1.05)'; } }}
                  onMouseLeave={(e) => { if(!showModeMenu && !isThinking) { e.target.style.background = 'transparent'; e.target.style.color = 'var(--text-secondary)'; e.target.style.transform = 'scale(1)'; } }}
                >
                  <Plus size={20} />
                </button>
                
                {showModeMenu && (
                  <div style={{
                    position: 'absolute',
                    bottom: '120%',
                    left: '0',
                    background: 'rgba(15, 23, 42, 0.85)',
                    backdropFilter: 'blur(24px)',
                    WebkitBackdropFilter: 'blur(24px)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '12px',
                    padding: '0.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    minWidth: '180px',
                    zIndex: 20,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)'
                  }}>
                    {['Fast', 'Moderate', 'Complex', 'Deep Research', 'Document Analysis', 'Reverse Mind'].map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => { setMode(m); setShowModeMenu(false); }}
                        style={{
                          background: mode === m ? 'rgba(14, 165, 233, 0.15)' : 'transparent',
                          border: 'none',
                          color: mode === m ? 'var(--accent-primary)' : 'var(--text-primary)',
                          padding: '0.6rem 0.8rem',
                          textAlign: 'left',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '0.9rem',
                          fontWeight: mode === m ? '500' : '400',
                          transition: 'all 0.2s',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px'
                        }}
                        onMouseEnter={(e) => {
                          if (mode !== m) {
                            e.target.style.background = 'rgba(255,255,255,0.05)';
                            e.target.style.transform = 'translateX(4px)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (mode !== m) {
                            e.target.style.background = 'transparent';
                            e.target.style.transform = 'translateX(0)';
                          }
                        }}
                      >
                        {mode === m && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'currentColor' }} />}
                        <span style={{ marginLeft: mode === m ? '0' : '14px' }}>{m}</span>
                      </button>
                    ))}
                  </div>
                )}
                
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: 'none' }}
                  onChange={handleFileUpload}
                  accept=".pdf,.doc,.docx,.ppt,.pptx,.mp3,.mp4,.wav,.avi,.mkv,.mov,.m4a"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isThinking || isUploading}
                  title="Upload Document or Media"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: uploadedFilePath ? 'var(--accent-primary)' : 'var(--text-secondary)',
                    fontSize: '1.2rem',
                    cursor: (isThinking || isUploading) ? 'default' : 'pointer',
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                    opacity: (isThinking || isUploading) ? 0.5 : 1,
                  }}
                  onMouseEnter={(e) => { if (!isThinking && !isUploading) { e.target.style.background = 'rgba(255,255,255,0.05)'; e.target.style.color = 'var(--text-primary)'; e.target.style.transform = 'scale(1.05)'; } }}
                  onMouseLeave={(e) => { e.target.style.background = 'transparent'; e.target.style.color = uploadedFilePath ? 'var(--accent-primary)' : 'var(--text-secondary)'; e.target.style.transform = 'scale(1)'; }}
                >
                  <Paperclip size={20} />
                </button>
              </div>

              <input
                type="text"
                className="glass-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={isThinking}
                placeholder="Ask a question..."
                style={{ 
                  width: '100%', 
                  padding: '1.2rem 3.5rem 1.2rem 6.5rem',
                  fontSize: '1.05rem',
                  opacity: isThinking ? 0.7 : 1,
                  letterSpacing: '0.2px'
                }}
              />
              {isThinking ? (
                <button 
                  type="button"
                  onClick={stopMessage}
                  style={{ 
                    position: 'absolute', 
                    right: '0.75rem', 
                    top: '50%', 
                    transform: 'translateY(-50%)',
                    background: 'var(--color-bg-tertiary)',
                    color: 'var(--text-secondary)',
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s ease',
                    border: '1px solid rgba(255,255,255,0.1)',
                    cursor: 'pointer'
                  }}
                  title="Stop generating"
                  onMouseEnter={(e) => { e.target.style.background = 'rgba(239, 68, 68, 0.2)'; e.target.style.color = '#ef4444'; e.target.style.borderColor = 'rgba(239, 68, 68, 0.4)'; }}
                  onMouseLeave={(e) => { e.target.style.background = 'var(--color-bg-tertiary)'; e.target.style.color = 'var(--text-secondary)'; e.target.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                >
                  <Square size={14} fill="currentColor" />
                </button>
              ) : (
                <button 
                  type="submit"
                  disabled={!query.trim()}
                  style={{ 
                    position: 'absolute', 
                    right: '0.75rem', 
                    top: '50%', 
                    transform: 'translateY(-50%)',
                    background: 'var(--accent-gradient)',
                    color: 'white',
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                    border: 'none',
                    cursor: !query.trim() ? 'default' : 'pointer',
                    opacity: !query.trim() ? 0.5 : 1,
                    boxShadow: !query.trim() ? 'none' : '0 4px 12px rgba(14, 165, 233, 0.3)'
                  }}
                  onMouseEnter={(e) => { if (query.trim()) { e.target.style.transform = 'translateY(-50%) scale(1.1)'; e.target.style.boxShadow = '0 6px 16px rgba(14, 165, 233, 0.5)'; } }}
                  onMouseLeave={(e) => { if (query.trim()) { e.target.style.transform = 'translateY(-50%) scale(1)'; e.target.style.boxShadow = '0 4px 12px rgba(14, 165, 233, 0.3)'; } }}
                >
                  <ArrowUp size={20} strokeWidth={3} />
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
