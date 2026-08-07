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

  const handleDownloadJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(pipelineState, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href",     dataStr);
    downloadAnchorNode.setAttribute("download", "reasoning_tree.json");
    document.body.appendChild(downloadAnchorNode); // required for firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleDownloadImage = async () => {
    alert("To enable PNG downloads, please run 'npm install html-to-image' in the frontend folder. Once installed, we can add the code back!");
  };

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlowProvider>
        <div style={{ position: 'absolute', top: '10px', right: '10px', zIndex: 10, display: 'flex', gap: '8px' }}>
          <button onClick={handleDownloadJSON} style={{ background: 'var(--color-bg-panel)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem' }}>
            📥 JSON
          </button>
          <button onClick={handleDownloadImage} style={{ background: 'var(--color-accent-primary)', border: 'none', color: 'white', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', boxShadow: '0 2px 8px rgba(0,0,0,0.2)' }}>
            📥 PNG Image
          </button>
        </div>
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
