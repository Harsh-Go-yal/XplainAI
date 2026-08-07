// Transforms the pipeline state into nodes and edges for React Flow
export function transformStateToFlow(state, activeStage) {
  const nodes = [];
  const edges = [];
  let yOffset = 0;
  const X_CENTER = 400;

  // 1. Root Node (User Query)
  if (state.user_query) {
    nodes.push({
      id: 'node-query',
      type: 'queryNode',
      position: { x: X_CENTER - 150, y: yOffset },
      data: { 
        label: state.user_query,
        analysis: state.query_analysis 
      },
    });
    
    // Dynamically calculate the vertical space needed based on text length and newlines
    const textLength = state.user_query.length;
    const newlines = (state.user_query.match(/\n/g) || []).length;
    const estimatedHeight = 140 + Math.floor(textLength / 40) * 20 + (newlines * 20);
    
    yOffset += estimatedHeight;
  }

  // 2. Linear Stages (Query Analysis, Source Selection, etc)
  const linearStages = [
    { id: 'query_analysis', stateKey: 'query_analysis', label: 'Query Analysis', icon: '🔍' },
    { id: 'missing_context_detector', stateKey: 'missing_context', label: 'Missing Context', icon: '❓' },
    { id: 'reasoning_evidence_planner', stateKey: 'reasoning_plan', label: 'Reasoning Plan', icon: '🗺️' },
    { id: 'source_selection', stateKey: 'source_selection', label: 'Source Selection', icon: '📚' },
    { id: 'tool_execution', stateKey: 'tool_results', label: 'Tool Execution', icon: '⚙️' },
    { id: 'evidence_aggregation', stateKey: 'evidence', label: 'Evidence Aggregation', icon: '📊' }
  ];

  let prevNodeId = 'node-query';

  linearStages.forEach((stage) => {
    // Check if the key exists in the object, handling null/undefined/empty gracefully
    const hasData = stage.stateKey in state && state[stage.stateKey] !== null;
    const isCompleted = (state.completed_stages && state.completed_stages[stage.id]) || hasData;
    
    // Debug log to trace what is being processed
    console.log(`[Flow] Stage ${stage.id}: hasData=${hasData}, isCompleted=${isCompleted}, stateKey=${stage.stateKey} in state=${stage.stateKey in state}`);
    
    if (isCompleted || activeStage === stage.id) {
      const nodeId = `node-${stage.id}`;
      nodes.push({
        id: nodeId,
        type: 'stageNode',
        position: { x: X_CENTER - 100, y: yOffset },
        data: { 
          label: stage.label, 
          icon: stage.icon,
          status: isCompleted ? 'complete' : 'processing',
          details: state[stage.stateKey] || null
        },
      });

      edges.push({
        id: `edge-${prevNodeId}-${nodeId}`,
        source: prevNodeId,
        target: nodeId,
        animated: !isCompleted,
      });

      prevNodeId = nodeId;
      yOffset += 100;
    }
  });

  // 3. Candidate Approaches (Branching)
  if (state.candidate_approaches || (state.completed_stages && state.completed_stages['candidate_generation']) || activeStage === 'candidate_generation') {
    const approachesNodeId = 'node-candidates';
    
    nodes.push({
      id: approachesNodeId,
      type: 'stageNode',
      position: { x: X_CENTER - 100, y: yOffset },
      data: { 
        label: 'Candidate Generation', 
        icon: '💡',
        status: state.candidate_approaches ? 'complete' : 'processing' 
      },
    });
    
    edges.push({
      id: `edge-${prevNodeId}-${approachesNodeId}`,
      source: prevNodeId,
      target: approachesNodeId,
      animated: !state.candidate_approaches
    });
    
    yOffset += 120;
    
    // Add individual approach nodes if available
    if (state.candidate_approaches && state.candidate_approaches.length > 0) {
      const approaches = state.candidate_approaches;
      const count = approaches.length;
      const spread = 340;
      const startX = X_CENTER - ((count - 1) * spread) / 2;

      approaches.forEach((app, idx) => {
        const appId = `node-approach-${app.approach_id}`;
        
        // Check if we have evaluations for this approach
        const evaluation = state.evaluations?.find(e => e.approach_id === app.approach_id);
        
        // Check if selected
        const isSelected = state.selected_approach?.approach_id === app.approach_id;
        const isRejected = state.rejected_approaches?.some(r => r.approach_id === app.approach_id);
        
        nodes.push({
          id: appId,
          type: 'approachNode',
          position: { x: startX + (idx * spread) - 100, y: yOffset },
          data: {
            approach: app,
            evaluation: evaluation,
            isSelected,
            isRejected,
            status: evaluation ? 'evaluated' : 'generated'
          }
        });
        
        edges.push({
          id: `edge-${approachesNodeId}-${appId}`,
          source: approachesNodeId,
          target: appId,
          animated: !evaluation
        });
      });
      
      yOffset += 180;
    }
  }

  // 4. Final Answer
  if (state.answer || (state.completed_stages && state.completed_stages['final_answer']) || activeStage === 'final_answer') {
    const finalNodeId = 'node-final-answer';
    
    nodes.push({
      id: finalNodeId,
      type: 'finalAnswerNode',
      position: { x: X_CENTER - 150, y: yOffset },
      data: {
        answer: state.answer,
        explainability: state.explainability,
        summary: state.summary,
        status: state.answer ? 'complete' : 'processing'
      }
    });

    // Connect ONLY from the selected approach if available
    if (state.selected_approach) {
      edges.push({
        id: `edge-approach-${state.selected_approach.approach_id}-${finalNodeId}`,
        source: `node-approach-${state.selected_approach.approach_id}`,
        target: finalNodeId,
        animated: !state.answer
      });
    } else {
      // Fallback connect to center
      edges.push({
        id: `edge-fallback-${finalNodeId}`,
        source: 'node-candidates',
        target: finalNodeId,
        animated: true
      });
    }
  }

  return { nodes, edges };
}
