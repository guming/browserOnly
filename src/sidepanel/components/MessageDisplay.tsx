import React, { useState } from 'react';
import { Message } from '../types';
import { LlmContent } from './LlmContent';
import { ScreenshotMessage } from './ScreenshotMessage';
import { WorkflowChatCard } from './WorkflowChatCard';
import { WorkflowSaveOfferCard } from './WorkflowSaveOfferCard';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MarkdownTable } from './MarkdownTable';
import { executionGroups } from './executionGroups';
import { RunDuration } from './RunDuration';

interface MessageDisplayProps {
  messages: Message[];
  streamingSegments: Record<number, string>;
  isStreaming: boolean;
  onOpenWorkflow?: (workflowId: string, mode?: 'run') => void;
}

function CollapsibleCard({ title, children }: { title: string; children: React.ReactNode }) {
  const [expanded, setExpanded] = useState(true);
  return <section className="overflow-hidden rounded-lg border border-stone-200 bg-white">
    <div className="flex items-center gap-2 border-b border-stone-100 px-3 py-2">
      <button type="button" aria-expanded={expanded} aria-label={`${expanded ? 'Collapse' : 'Expand'} ${title}`} onClick={() => setExpanded(value => !value)} className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-stone-500 hover:bg-stone-100" title={expanded ? 'Collapse' : 'Expand'}>
        <svg aria-hidden="true" viewBox="0 0 20 20" className={`h-4 w-4 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m7 4 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <span className="text-xs font-semibold text-stone-700">{title}</span>
    </div>
    {expanded && <div>{children}</div>}
  </section>;
}

export const MessageDisplay: React.FC<MessageDisplayProps> = ({
  messages,
  streamingSegments,
  isStreaming,
  onOpenWorkflow
}) => {
  // Always show all messages
  const filteredMessages = messages;
  const runs = executionGroups(messages);
  const activeRun = [...runs.values()].find(group => group.activity.activity?.status === 'running');
  const renderStreaming = () => isStreaming && Object.entries(streamingSegments).map(([id, content]) => (
    <div key={`segment-${id}`} className="mb-2 animate-pulse"><LlmContent content={content} /></div>
  ));

  if (filteredMessages.length === 0 && Object.keys(streamingSegments).length === 0) {
    return <p className="text-gray-500">No output yet</p>;
  }

  const isToolCall = (message: Message) => message.type === 'system' && /^🕹️ tool: /.test(message.content);
  const activityGroups: Array<{ start: number; end: number; tools: number; messages: Message[] }> = [];
  for (let index = 0; index < filteredMessages.length;) {
    const startsWithTool = isToolCall(filteredMessages[index]);
    const startsWithIntermediateReply = filteredMessages[index].type === 'llm' && index + 1 < filteredMessages.length && isToolCall(filteredMessages[index + 1]);
    if (!startsWithTool && !startsWithIntermediateReply) { index++; continue; }
    const start = index;
    let tools = 0;
    while (index < filteredMessages.length) {
      if (isToolCall(filteredMessages[index])) { tools++; index++; continue; }
      if (filteredMessages[index].type === 'llm' && index + 1 < filteredMessages.length && isToolCall(filteredMessages[index + 1])) { index++; continue; }
      break;
    }
    activityGroups.push({ start, end: index, tools, messages: filteredMessages.slice(start, index) });
  }
  const groupAt = new Map(activityGroups.map(group => [group.start, group]));

  const renderMessage = (msg: Message, index: number) => (
    <div key={`msg-${index}`} className="mb-2">
      {msg.type === 'workflow' && msg.workflowId ? (
        <CollapsibleCard title={msg.content || 'Workflow'}><WorkflowChatCard workflowId={msg.workflowId} fallbackName={msg.content} onOpenWorkflow={onOpenWorkflow} /></CollapsibleCard>
      ) : msg.type === 'workflow_offer' && msg.workflowOfferId ? (
        <CollapsibleCard title="Save as workflow"><WorkflowSaveOfferCard workflowId={msg.workflowOfferId} onOpenWorkflow={onOpenWorkflow} /></CollapsibleCard>
      ) : msg.type === 'task_complete' ? (
        <div role="status" className="my-2 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800"><span aria-hidden="true">✓</span>{msg.content}</div>
      ) : msg.type === 'llm' && msg.content.trim() === 'Execution cancelled by user.' ? (
        <div role="status" className="rounded-lg bg-stone-100 px-3 py-2 text-sm text-stone-600">Execution cancelled</div>
      ) : msg.type === 'ocr' || msg.type === 'image_analysis' ? (
        <LlmContent imageTitle={msg.type === 'ocr' ? 'Text in image' : 'Image understanding'} content={msg.content} />
      ) : msg.type === 'system' && (/^(?:Executing prompt:|New .+ prompt:)/.test(msg.content) || msg.content.length > 240) ? (
        <details className="rounded-lg border border-stone-200 bg-stone-50 text-xs text-stone-600">
          <summary className="cursor-pointer px-3 py-2 font-medium text-stone-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#315a78]">{msg.content.startsWith('Executing prompt:') ? 'Executing request' : msg.content.startsWith('New ') ? 'Request submitted' : 'Activity details'} · Show details</summary>
          <div className="max-h-48 overflow-y-auto border-t border-stone-200 px-3 py-2 whitespace-pre-wrap break-words">{msg.content}</div>
        </details>
      ) : msg.type === 'system' ? (
        <div className="bg-base-200 px-3 py-1 rounded text-gray-500 text-sm">{msg.content}</div>
      ) : msg.type === 'screenshot' && msg.imageData ? (
        <CollapsibleCard title="Screenshot captured"><ScreenshotMessage imageData={msg.imageData} mediaType={msg.mediaType} /></CollapsibleCard>
      ) : (
        <LlmContent content={msg.content} />
      )}
    </div>
  );

  return (
    <div>
      {filteredMessages.map((msg, index) => {
        const run = msg.runId && runs.get(msg.runId);
        if (run) {
          if (!msg.activity) return null;
          const activity = msg.activity;
          return <details key={msg.runId} className="my-2 rounded-lg border border-stone-200 bg-stone-50 text-xs text-stone-600" open={activity.status === 'running' ? true : undefined}>
            <summary className="cursor-pointer px-3 py-2 font-medium">{activity.steps.length} steps · {activity.status}<RunDuration activity={activity} /></summary>
            <div className="max-h-96 overflow-y-auto space-y-2 border-t border-stone-200 px-3 py-2">
              <ol className="space-y-1">{activity.steps.map((step, at) => <li key={`${step.executionId}-${at}`} className="flex justify-between gap-2"><span>{at + 1}. {step.toolName.replace(/^browser_/, '').replace(/_/g, ' ')}</span><span>{step.status}{step.durationMs === undefined ? '' : ` · ${(step.durationMs / 1000).toFixed(2)}s`}</span></li>)}</ol>
              {run.messages.map((item, at) => item.type === 'llm'
                ? <div key={`progress-${at}`} className="whitespace-pre-wrap break-words"><ReactMarkdown remarkPlugins={[remarkGfm]}>{item.content}</ReactMarkdown></div>
                : renderMessage(item, at))}
              {run === activeRun && isStreaming && Object.entries(streamingSegments).map(([id, content]) =>
                <div key={`progress-stream-${id}`} className="whitespace-pre-wrap break-words animate-pulse">{content}</div>)}
            </div>
          </details>;
        }
        const group = groupAt.get(index);
        if (group) return <details key={`activity-${index}`} className="my-2 rounded-lg border border-stone-200 bg-stone-50 text-xs text-stone-600">
          <summary className="cursor-pointer list-none px-3 py-2 font-medium text-stone-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#315a78]">▸ {group.tools} tool {group.tools === 1 ? 'step' : 'steps'} · Show activity</summary>
          <div className="max-h-72 space-y-2 overflow-y-auto border-t border-stone-200 px-3 py-2">{group.messages.map((item, offset) => renderMessage(item, index + offset))}</div>
        </details>;
        if (activityGroups.some(activity => index > activity.start && index < activity.end)) return null;
        return renderMessage(msg, index);
      })}
      
      {/* Render currently streaming segments at the end */}
      {!activeRun && renderStreaming()}
    </div>
  );
};
