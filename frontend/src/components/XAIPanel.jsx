import React, { useState } from 'react';
import ReasoningTree from './ReasoningTree';

const NodeSummarizer = ({ node }) => {
  if (!node || !node.data) return null;
  const data = node.data.details || node.data.approach || node.data;
  const type = node.type; 
  const id = node.id; 

  if (type === 'queryNode') {
    return <p>The user asked: "{data.label}".</p>;
  }

  if (type === 'finalAnswerNode') {
    return <p>{data.summary || "Generated the final detailed answer for the user."}</p>;
  }

  if (type === 'approachNode') {
    const evalData = node.data.evaluation;
    let text = `Proposed Approach: ${data.title}. ${data.description}`;
    if (evalData) {
      text += ` It was evaluated with a score of ${evalData.score}/100.`;
    }
    if (node.data.isSelected) text += " This approach was ultimately selected as the best path forward.";
    if (node.data.isRejected) text += " This approach was rejected in favor of a better alternative.";
    return <p>{text}</p>;
  }

  // Stage Nodes
  if (id === 'node-query_analysis') {
    return <p>{data.analysis_summary || "Analyzed the query to understand intent and context."}</p>;
  }
  if (id === 'node-missing_context_detector') {
    return <p>{data.missing_context_summary || "Checked if any critical context was missing from the user's prompt."}</p>;
  }
  if (id === 'node-reasoning_evidence_planner') {
    return <p>{data.planning_summary || "Formulated a step-by-step plan and selected tools to gather evidence."}</p>;
  }
  if (id === 'node-source_selection') {
    return <p>{data.source_summary || "Evaluated internal vs external knowledge sources to determine the best domains to query."}</p>;
  }
  if (id === 'node-evidence_aggregation') {
    return <p>{data.evidence_summary || "Aggregated all collected data from various sources into a cohesive body of evidence."}</p>;
  }
  if (id === 'node-tool_execution') {
    if (!Array.isArray(data)) return <p>Executed selected tools to gather live information.</p>;
    if (data.length === 0) return <p>No tools were required or executed for this query.</p>;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <p>Successfully executed {data.length} tools to gather live data:</p>
        {data.map((t, idx) => (
          <div key={idx} style={{ background: 'rgba(255,255,255,0.05)', padding: '1rem', borderRadius: '0.5rem', border: '1px solid var(--glass-border)' }}>
            <div style={{ fontWeight: 'bold', color: 'var(--accent-primary)', marginBottom: '0.5rem' }}>🛠️ {t.tool}</div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
              <strong>Input:</strong> {JSON.stringify(t.input)}
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxHeight: '150px', overflowY: 'auto', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
              <strong>Output:</strong> {typeof t.output === 'object' ? JSON.stringify(t.output, null, 2) : t.output}
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (id === 'node-candidates') {
    return <p>Generated multiple diverse candidate approaches and hypotheses to solve the user's query.</p>;
  }

  // Fallback
  return <p>Successfully completed this step in the reasoning pipeline.</p>;
};


const STAGES = [
  { id: 'query_analysis', icon: '🔍', label: 'Analysis' },
  { id: 'missing_context_detector', icon: '❓', label: 'Context' },
  { id: 'reasoning_evidence_planner', icon: '🗺️', label: 'Planning' },
  { id: 'source_selection', icon: '📚', label: 'Sources' },
  { id: 'tool_execution', icon: '⚙️', label: 'Tools' },
  { id: 'evidence_aggregation', icon: '📊', label: 'Evidence' },
  { id: 'candidate_generation', icon: '💡', label: 'Candidates' },
  { id: 'evaluation', icon: '⚖️', label: 'Evaluation' },
  { id: 'select_best', icon: '✅', label: 'Selection' },
  { id: 'final_answer', icon: '📝', label: 'Answer' },
  { id: 'explainability', icon: '🧠', label: 'Explainability' },
  { id: 'reasoning_tree', icon: '🌳', label: 'Tree' },
  { id: 'summary', icon: '📋', label: 'Summary' }
];

export default function XAIPanel({ width, pipelineState = {}, isThinking, activeStage }) {
  const [selectedNode, setSelectedNode] = useState(null);

  const getStageStatus = (stageId) => {
    if (pipelineState.completed_stages && pipelineState.completed_stages[stageId]) return 'complete';
    if (activeStage === stageId) return 'active';
    return 'pending';
  };

  const handleNodeClick = (event, node) => {
    setSelectedNode(node);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        {STAGES.map((stage) => {
          const status = getStageStatus(stage.id);
          return (
            <div key={stage.id} 
              title={stage.label}
              style={{ 
                width: '36px', height: '36px', 
                borderRadius: '50%', 
                background: status === 'active' ? 'rgba(99, 102, 241, 0.2)' : status === 'complete' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                border: `1px solid ${status === 'active' ? 'var(--accent-primary)' : status === 'complete' ? 'rgba(16, 185, 129, 0.4)' : 'var(--glass-border)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1rem',
                opacity: status === 'pending' ? 0.5 : 1,
                boxShadow: status === 'active' ? '0 0 12px rgba(99, 102, 241, 0.4)' : 'none',
                transition: 'all 0.3s ease'
              }}>
              {stage.icon}
            </div>
          )
        })}
      </div>

      <div style={{ flexGrow: 1, padding: '1rem', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        {width < 250 ? (
          <div style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', marginTop: '2rem' }}>
            <p>XAI</p>
          </div>
        ) : (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <h3 style={{ marginBottom: '0.5rem' }}>Reasoning Tree</h3>
            
            <div style={{ 
              flexGrow: 1,
              minHeight: '300px',
              background: 'rgba(15, 23, 42, 0.4)',
              borderRadius: '0.75rem',
              border: '1px solid var(--glass-border)',
              position: 'relative'
            }}>
              {Object.keys(pipelineState).length === 0 && !isThinking ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-tertiary)' }}>
                  Waiting for query...
                </div>
              ) : (
                <ReasoningTree pipelineState={pipelineState} activeStage={activeStage} onNodeClick={handleNodeClick} />
              )}
            </div>

            {selectedNode && (
              <div className="glass-card" style={{ padding: '1rem', flexShrink: 0, maxHeight: '250px', overflowY: 'auto', position: 'relative' }}>
                <button 
                  onClick={() => setSelectedNode(null)}
                  style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
                >
                  ✕
                </button>
                <h4 style={{ marginBottom: '0.5rem', color: 'var(--accent-primary)' }}>{selectedNode.data?.label || selectedNode.data?.approach?.title || 'Node Details'}</h4>
                <div style={{ 
                  fontSize: '0.9rem', 
                  color: 'var(--text-primary)',
                  marginTop: '1rem',
                  lineHeight: '1.6'
                }}>
                  <NodeSummarizer node={selectedNode} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
