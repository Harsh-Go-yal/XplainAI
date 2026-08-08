import React, { useState } from 'react';
import { Handle, Position } from 'reactflow';

export default function StageNode({ data }) {
  const [isHovered, setIsHovered] = useState(false);
  const isProcessing = data.status === 'processing';
  
  return (
    <div 
      className="glass-card pill-node" 
      style={{ padding: '0.75rem 1.5rem', width: '280px', display: 'flex', alignItems: 'center', gap: '0.75rem', border: isProcessing ? '1px solid var(--color-accent-glow)' : '1px solid var(--border-color)', cursor: 'pointer', position: 'relative' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
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
      
      {/* Hover Tooltip */}
      {isHovered && data.details && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          marginTop: '12px',
          background: 'rgba(15, 23, 42, 0.95)',
          border: '1px solid var(--accent-primary)',
          padding: '8px 12px',
          borderRadius: '8px',
          width: 'max-content',
          zIndex: 1000,
          boxShadow: '0 8px 30px rgba(0,0,0,0.6)',
          color: 'var(--text-secondary)',
          fontSize: '0.75rem',
          textAlign: 'center'
        }}>
          Click to know more about <strong style={{ color: 'var(--text-primary)' }}>{data.label}</strong>
        </div>
      )}

      {isProcessing && (
        <div className="animate-spin-slow" style={{ marginLeft: 'auto', width: '12px', height: '12px', border: '2px solid var(--color-accent-primary)', borderTopColor: 'transparent', borderRadius: '50%' }} />
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
