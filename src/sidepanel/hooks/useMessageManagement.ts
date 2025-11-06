import { useState, useRef, useEffect } from 'react';
import { Message } from '../types';
import { ConversationStorageService } from '../../storage/conversationStorage';

export const useMessageManagement = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingSegments, setStreamingSegments] = useState<Record<number, string>>({});
  const [currentSegmentId, setCurrentSegmentId] = useState<number>(0);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const storageService = useRef(ConversationStorageService.getInstance());

  // Auto-scroll to bottom when messages or streaming segments change
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [messages, streamingSegments]);

  const addMessage = (message: Message) => {
    setMessages(prev => [...prev, { ...message, isComplete: true }]);
  };

  const addSystemMessage = (content: string) => {
    addMessage({ type: 'system', content });
  };

  const updateStreamingChunk = (content: string) => {
    setIsStreaming(true);
    setStreamingSegments(prev => ({
      ...prev,
      [currentSegmentId]: (prev[currentSegmentId] || '') + content
    }));
  };

  const finalizeStreamingSegment = (id: number, content: string) => {
    // Add the finalized segment as a complete message
    addMessage({
      type: 'llm',
      content,
      segmentId: id
    });

    // Remove the segment from streaming segments
    setStreamingSegments(prev => {
      const newSegments = { ...prev };
      delete newSegments[id];
      return newSegments;
    });
  };

  const startNewSegment = (id: number) => {
    setCurrentSegmentId(id);
  };

  const completeStreaming = () => {
    setIsStreaming(false);
    setStreamingSegments({});
  };

  const clearMessages = () => {
    setMessages([]);
    setStreamingSegments({});
  };

  /**
   * Load conversation history from storage for a specific URL
   */
  const loadConversation = async (url: string, tabTitle?: string) => {
    try {
      const conversation = await storageService.current.loadConversation(url);
      if (conversation) {
        setMessages(conversation.messages);

        // Convert streaming segments from array to Record
        const segmentsRecord: Record<number, string> = {};
        conversation.streamingSegments.forEach(segment => {
          if (!segment.isComplete) {
            segmentsRecord[segment.id] = segment.content;
          }
        });
        setStreamingSegments(segmentsRecord);

        console.log(`Loaded conversation for ${tabTitle || url}: ${conversation.messages.length} messages`);
      } else {
        // No conversation found, start fresh
        setMessages([]);
        setStreamingSegments({});
      }
    } catch (error) {
      console.error('Failed to load conversation:', error);
    }
  };

  /**
   * Save current conversation to storage
   */
  const saveConversation = async (url: string, tabTitle?: string) => {
    try {
      // Convert streaming segments Record to array
      const segmentsArray = Object.entries(streamingSegments).map(([id, content]) => ({
        id: parseInt(id),
        content,
        isComplete: false
      }));

      await storageService.current.saveConversation(
        url,
        messages,
        segmentsArray,
        tabTitle
      );
    } catch (error) {
      console.error('Failed to save conversation:', error);
    }
  };

  /**
   * Delete conversation for a specific URL
   */
  const deleteConversation = async (url: string) => {
    try {
      await storageService.current.deleteConversation(url);
      console.log(`Deleted conversation for URL: ${url}`);
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    }
  };

  return {
    messages,
    streamingSegments,
    isStreaming,
    isProcessing,
    setIsProcessing,
    outputRef,
    addMessage,
    addSystemMessage,
    updateStreamingChunk,
    finalizeStreamingSegment,
    startNewSegment,
    completeStreaming,
    clearMessages,
    currentSegmentId,
    loadConversation,
    saveConversation,
    deleteConversation,
    setMessages
  };
};
