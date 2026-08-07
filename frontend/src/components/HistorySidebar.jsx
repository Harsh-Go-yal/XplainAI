import React, { useState } from 'react';

export default function HistorySidebar({ conversations, activeId, onSelect, onNewChat, onDeleteChat }) {
  const [hoveredId, setHoveredId] = useState(null);

  return (
    <div style={{ padding: '1rem', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <button 
        style={{ 
          padding: '0.75rem 1rem', 
          marginBottom: '1.5rem', 
          width: '100%', 
          textAlign: 'left', 
          fontWeight: '500',
          background: 'transparent',
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: '0.5rem',
          color: 'var(--text-primary)',
          cursor: 'pointer',
          transition: 'background 0.2s ease',
          fontSize: '0.875rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}
        onMouseEnter={(e) => e.target.style.background = 'rgba(255,255,255,0.05)'}
        onMouseLeave={(e) => e.target.style.background = 'transparent'}
        onClick={onNewChat}
      >
        <span style={{ fontSize: '1.1rem' }}>+</span> New Chat
      </button>
      
      <div style={{ flexGrow: 1, overflowY: 'auto', paddingRight: '0.5rem' }}>
        {conversations.length === 0 ? (
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', textAlign: 'center', marginTop: '2rem' }}>
            No history yet
          </div>
        ) : (
          conversations.map(conv => (
            <div 
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              style={{
                padding: '0.6rem 0.75rem',
                marginBottom: '0.2rem',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                background: activeId === conv.id ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                color: activeId === conv.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                transition: 'background 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
              onMouseEnter={(e) => { 
                setHoveredId(conv.id);
                if (activeId !== conv.id) e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
              }}
              onMouseLeave={(e) => { 
                setHoveredId(null);
                if (activeId !== conv.id) e.currentTarget.style.background = 'transparent';
              }}
            >
              <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.875rem', flexGrow: 1, marginRight: '0.5rem' }}>
                {conv.preview || 'New Conversation'}
              </div>
              
              {(hoveredId === conv.id || activeId === conv.id) && (
                <button
                  onClick={(e) => onDeleteChat(conv.id, e)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    padding: '2px',
                    display: 'flex',
                    alignItems: 'center',
                    opacity: 0.7,
                    transition: 'opacity 0.2s ease'
                  }}
                  onMouseEnter={(e) => { e.target.style.opacity = 1; e.target.style.color = '#ff6b6b'; }}
                  onMouseLeave={(e) => { e.target.style.opacity = 0.7; e.target.style.color = 'var(--text-secondary)'; }}
                  title="Delete chat"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18"></path>
                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                  </svg>
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
