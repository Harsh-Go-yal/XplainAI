import React, { useState } from 'react';
import { Handle, Position } from 'reactflow';

export default function ApproachNode({ data }) {
  const [isHovered, setIsHovered] = useState(false);
  const { approach, evaluation, isSelected, isRejected } = data;
  
  let borderColor = 'var(--border-color)';
  let opacity = 1;
  let boxShadow = 'none';

  if (isSelected) {
    borderColor = 'var(--color-success)';
    boxShadow = '0 0 10px var(--color-success-dim)';
  } else if (isRejected) {
    borderColor = 'var(--color-danger)';
    opacity = 0.6;
  }

  const confValue = approach.estimated_confidence > 1 ? approach.estimated_confidence : approach.estimated_confidence * 100;
  const confPercent = Math.round(confValue);
  const confColor = confPercent > 80 ? 'var(--color-success)' : confPercent > 60 ? 'var(--color-warning)' : 'var(--color-danger)';

  return (
    <div 
      className="glass-card" 
      style={{ padding: '1.5rem', width: '300px', border: `2px solid ${borderColor}`, opacity, boxShadow, transition: 'all 0.3s ease', cursor: 'pointer', position: 'relative' }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Handle type="target" position={Position.Top} />
      
      <div style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'var(--color-text-primary)', marginBottom: '0.5rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {approach.title}
      </div>
      
      <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem', height: '3em', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}>
        {approach.description}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem' }}>
        <span style={{ color: 'var(--color-text-tertiary)' }}>Conf:</span>
        <div style={{ flexGrow: 1, height: '4px', background: 'var(--color-bg-tertiary)', borderRadius: '2px', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${confPercent}%`, background: confColor }} />
        </div>
        <span style={{ color: confColor, minWidth: '35px', textAlign: 'right' }}>{confPercent}%</span>
      </div>

      {evaluation && (
        <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--border-color)', fontSize: '0.75rem', color: 'var(--color-text-secondary)', textAlign: 'center' }}>
          Eval Score: {evaluation.overall_score}
        </div>
      )}

      {/* Hover Tooltip */}
      {isHovered && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: '50%',
          transform: 'translateX(-50%)',
          marginTop: '12px',
          background: 'rgba(15, 23, 42, 0.95)',
          border: `1px solid ${borderColor}`,
          padding: '8px 12px',
          borderRadius: '8px',
          width: 'max-content',
          zIndex: 1000,
          boxShadow: '0 8px 30px rgba(0,0,0,0.6)',
          color: 'var(--text-secondary)',
          fontSize: '0.75rem',
          textAlign: 'center'
        }}>
          Click to know more about <strong style={{ color: 'var(--text-primary)' }}>{approach.title}</strong>
        </div>
      )}

      {isSelected && (
        <div style={{ position: 'absolute', top: '-10px', right: '-10px', background: 'var(--color-success)', color: 'white', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', boxShadow: '0 0 10px rgba(0,0,0,0.5)' }}>
          ✓
        </div>
      )}

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
