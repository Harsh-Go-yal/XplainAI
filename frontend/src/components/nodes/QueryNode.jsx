import React from 'react';
import { Handle, Position } from 'reactflow';

export default function QueryNode({ data }) {
  return (
    <div className="glass-card" style={{ padding: '1.5rem', width: '320px', border: '2px solid var(--color-accent-secondary)', boxShadow: '0 0 25px rgba(139, 92, 246, 0.4)' }}>
      <div style={{ fontSize: '0.8rem', color: 'var(--color-accent-secondary)', fontWeight: 'bold', marginBottom: '0.5rem' }}>User Query</div>
      <div style={{ fontSize: '0.9rem', color: 'var(--color-text-primary)' }}>{data.label}</div>
      <Handle type="source" position={Position.Bottom} style={{ background: 'var(--color-accent-secondary)' }} />
    </div>
  );
}
