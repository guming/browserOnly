import React, { useState } from 'react';
import { Message } from '../types';
import { LlmContent } from './LlmContent';
import { ScreenshotMessage } from './ScreenshotMessage';
import { WorkflowChatCard } from './WorkflowChatCard';
import { WorkflowSaveOfferCard } from './WorkflowSaveOfferCard';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MarkdownTable } from './MarkdownTable';

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

function ImageResultCard({ title, content, onCopy }: { title: string; content: string; onCopy: () => void }) {
  const [expanded, setExpanded] = useState(true);
  return <section className="overflow-hidden rounded-lg border border-stone-200 bg-white">
    <div className="flex items-center justify-between gap-2 border-b border-stone-100 px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <button type="button" aria-expanded={expanded} aria-label={`${expanded ? 'Collapse' : 'Expand'} ${title}`} onClick={() => setExpanded(value => !value)} className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-stone-500 hover:bg-stone-100" title={expanded ? 'Collapse' : 'Expand'}>
          <svg aria-hidden="true" viewBox="0 0 20 20" className={`h-4 w-4 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m7 4 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <span className="truncate text-xs font-semibold text-stone-700">{title}</span>
      </div>
      {expanded && <button type="button" className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-[#315a78] hover:bg-[#eaf2f7]" onClick={onCopy}>Copy text</button>}
    </div>
    {expanded && <div className="max-h-96 overflow-auto px-3 py-3 text-sm leading-6 text-stone-800 [&_h1]:mb-2 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:font-semibold [&_li]:ml-4 [&_li]:list-disc [&_p]:mb-2 [&_table]:min-w-full [&_table]:border-collapse [&_td]:border [&_td]:border-stone-200 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-stone-200 [&_th]:bg-stone-50 [&_th]:px-2 [&_th]:py-1">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ table: ({ children }) => <MarkdownTable>{children}</MarkdownTable> }}>{content}</ReactMarkdown>
    </div>}
  </section>;
}

export const MessageDisplay: React.FC<MessageDisplayProps> = ({
  messages,
  streamingSegments,
  isStreaming,
  onOpenWorkflow
}) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  // Always show all messages
  const filteredMessages = messages;

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
        <ImageResultCard title={msg.type === 'ocr' ? 'Text in image' : 'Image understanding'} content={msg.content} onCopy={() => void navigator.clipboard.writeText(msg.content).then(() => setCopiedIndex(index)).catch(() => setCopiedIndex(null))} />
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
        const group = groupAt.get(index);
        if (group) return <details key={`activity-${index}`} className="my-2 rounded-lg border border-stone-200 bg-stone-50 text-xs text-stone-600">
          <summary className="cursor-pointer list-none px-3 py-2 font-medium text-stone-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#315a78]">▸ {group.tools} tool {group.tools === 1 ? 'step' : 'steps'} · Show activity</summary>
          <div className="max-h-72 space-y-2 overflow-y-auto border-t border-stone-200 px-3 py-2">{group.messages.map((item, offset) => renderMessage(item, index + offset))}</div>
        </details>;
        if (activityGroups.some(activity => index > activity.start && index < activity.end)) return null;
        return renderMessage(msg, index);
      })}
      
      {/* Render currently streaming segments at the end */}
      {isStreaming && Object.entries(streamingSegments).map(([id, content]) => (
        <div key={`segment-${id}`} className="mb-2 animate-pulse">
          <LlmContent content={content} />
        </div>
      ))}
    </div>
  );
};
