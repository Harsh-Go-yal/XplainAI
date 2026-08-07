import React from 'react';
import { Handle, Position } from 'reactflow';

export default function StageNode({ data }) {
  const isProcessing = data.status === 'processing';
  
  return (
    <div className="glass-card pill-node" style={{ padding: '0.75rem 1.5rem', width: '280px', display: 'flex', alignItems: 'center', gap: '0.75rem', border: isProcessing ? '1px solid var(--color-accent-glow)' : '1px solid var(--border-color)', cursor: 'pointer' }}>
      <Handle type="target" position={Position.Top} />
      <div style={{ fontSize: '1.2rem' }}>{data.icon}</div>
      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-primary)', flexGrow: 1, minWidth: 0 }}>
        <div style={{ fontWeight: '500' }}>{data.label}</div>
        {data.details && (
          <div style={{ fontSize: '0.65rem', color: 'var(--color-text-tertiary)', marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {Object.entries(data.details)
              .filter(([k, v]) => typeof v === 'string' || typeof v === 'number')
              .slice(0, 2)
              .map(([k, v]) => `${k.replace('_', ' ')}: ${v}`)
              .join(', ')}
          </div>
        )}
      </div>
      {isProcessing && (
        <div className="animate-spin-slow" style={{ marginLeft: 'auto', width: '12px', height: '12px', border: '2px solid var(--color-accent-primary)', borderTopColor: 'transparent', borderRadius: '50%' }} />
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
