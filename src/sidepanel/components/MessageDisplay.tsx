import React from 'react';
import { Message } from '../types';
import { LlmContent } from './LlmContent';
import { ScreenshotMessage } from './ScreenshotMessage';
import { WorkflowChatCard } from './WorkflowChatCard';
import { WorkflowSaveOfferCard } from './WorkflowSaveOfferCard';

interface MessageDisplayProps {
  messages: Message[];
  streamingSegments: Record<number, string>;
  isStreaming: boolean;
  onOpenWorkflow?: (workflowId: string, mode?: 'run') => void;
}

export const MessageDisplay: React.FC<MessageDisplayProps> = ({
  messages,
  streamingSegments,
  isStreaming,
  onOpenWorkflow
}) => {
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
        <WorkflowChatCard workflowId={msg.workflowId} fallbackName={msg.content} onOpenWorkflow={onOpenWorkflow} />
      ) : msg.type === 'workflow_offer' && msg.workflowOfferId ? (
        <WorkflowSaveOfferCard workflowId={msg.workflowOfferId} onOpenWorkflow={onOpenWorkflow} />
      ) : msg.type === 'task_complete' ? (
        <div role="status" className="my-2 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800"><span aria-hidden="true">✓</span>{msg.content}</div>
      ) : msg.type === 'system' ? (
        <div className="bg-base-200 px-3 py-1 rounded text-gray-500 text-sm">{msg.content}</div>
      ) : msg.type === 'screenshot' && msg.imageData ? (
        <ScreenshotMessage imageData={msg.imageData} mediaType={msg.mediaType} />
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
