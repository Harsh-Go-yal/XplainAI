import React, { useMemo, useEffect } from 'react';
import ReactFlow, { 
  Background, 
  Controls,
  useReactFlow,
  ReactFlowProvider,
  getNodesBounds,
  getViewportForBounds
} from 'reactflow';
import 'reactflow/dist/style.css';
import { toPng } from 'html-to-image';
import { jsPDF } from "jspdf";

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

function DownloadListener() {
  const { getNodes } = useReactFlow();

  useEffect(() => {
    const handleDownload = () => {
      const nodes = getNodes();
      if (nodes.length === 0) {
        alert("No tree to download yet!");
        return;
      }
      
      const nodesBounds = getNodesBounds(nodes);
      const padding = 100;
      const width = nodesBounds.width + padding * 2;
      const height = nodesBounds.height + padding * 2;
      const viewport = getViewportForBounds(nodesBounds, width, height, 0.1, 2, padding);

      const flowViewport = document.querySelector('.react-flow__viewport');
      if (flowViewport) {
        toPng(flowViewport, {
          backgroundColor: '#ffffff',
          width: width,
          height: height,
          pixelRatio: 2,
          style: {
            width: `${width}px`,
            height: `${height}px`,
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
          },
        }).then((dataUrl) => {
          const pdf = new jsPDF({
            orientation: width > height ? 'landscape' : 'portrait',
            unit: 'px',
            format: [width, height]
          });
          pdf.addImage(dataUrl, 'PNG', 0, 0, width, height);
          pdf.save('reasoning_architecture.pdf');
        }).catch(err => {
          console.error("Failed to download image", err);
        });
      }
    };

    document.addEventListener('download-reasoning-tree', handleDownload);
    return () => document.removeEventListener('download-reasoning-tree', handleDownload);
  }, [getNodes]);

  return null;
}

export default function ReasoningTree({ pipelineState, activeStage, onNodeClick }) {

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => transformStateToFlow(pipelineState, activeStage),
    [pipelineState, activeStage]
  );

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlowProvider>
        <DownloadListener />
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
