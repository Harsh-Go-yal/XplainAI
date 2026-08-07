import React, { useMemo } from 'react';
import ReactFlow, { 
  Background, 
  Controls,
  useReactFlow,
  ReactFlowProvider
} from 'reactflow';
import 'reactflow/dist/style.css';

import { transformStateToFlow } from '../utils/transformToFlow';
import QueryNode from './nodes/QueryNode';
import StageNode from './nodes/StageNode';
import ApproachNode from './nodes/ApproachNode';
import FinalAnswerNode from './nodes/FinalAnswerNode';

const nodeTypes = {
  queryNode: QueryNode,
  stageNode: StageNode,
  approachNode: ApproachNode,
  finalAnswerNode: FinalAnswerNode
};

export default function ReasoningTree({ pipelineState, activeStage, onNodeClick }) {

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => transformStateToFlow(pipelineState, activeStage),
    [pipelineState, activeStage]
  );

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlowProvider>

        <ReactFlow
          nodes={initialNodes}
          edges={initialEdges}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          fitView
          minZoom={0.1}
          maxZoom={1.5}
          attributionPosition="bottom-right"
        >
          <Background color="#333" gap={16} size={1} />
          <Controls style={{ background: 'var(--color-bg-panel)', border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius-sm)', overflow: 'hidden' }} showInteractive={false} />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  );
}
