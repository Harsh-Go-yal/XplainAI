import React from 'react';
import { Handle, Position } from 'reactflow';
import ReactMarkdown from 'react-markdown';

export default function FinalAnswerNode({ data }) {
  return (
    <div className="glass-card" style={{ padding: '1.5rem', width: '350px', border: '2px solid var(--color-warning)', boxShadow: '0 0 15px rgba(245, 158, 11, 0.3)' }}>
      <Handle type="target" position={Position.Top} />
      
      <div style={{ fontSize: '0.8rem', color: 'var(--color-warning)', fontWeight: 'bold', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span>📝</span> Final Answer
      </div>
      
      <div className="markdown-body" style={{ fontSize: '0.8rem', color: 'var(--color-text-primary)', maxHeight: '150px', overflowY: 'auto' }}>
        {data.answer ? (
          <ReactMarkdown>{data.answer}</ReactMarkdown>
        ) : (
          <div style={{ color: 'var(--color-text-tertiary)' }}>Drafting answer...</div>
        )}
      </div>

    </div>
  );
}
