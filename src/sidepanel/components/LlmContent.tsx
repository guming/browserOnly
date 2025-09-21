import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { NotionSDKClient } from '../../agent/notionClient';

interface LlmContentProps {
  content: string;
  notionDatabaseId?: string;
}

export const LlmContent: React.FC<LlmContentProps> = ({ 
  content, 
  notionDatabaseId 
}) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [notionToken, setNotionToken] = useState<string | null>(null);
  const [notionClient, setNotionClient] = useState<NotionSDKClient | null>(null);
  const [availableDatabases, setAvailableDatabases] = useState<Array<{id: string, title: string}>>([]);
  const [isLoadingDatabases, setIsLoadingDatabases] = useState(false);
  const [showDatabaseSelector, setShowDatabaseSelector] = useState(false);
  const [selectedDatabaseId, setSelectedDatabaseId] = useState<string | null>(null);

  // Load Notion token from Chrome storage on component mount
  useEffect(() => {
    const loadNotionConfig = async () => {
      try {
        const result = await chrome.storage.sync.get(['notionBearerToken', 'notionDatabaseId']);
        const token = result.notionBearerToken;
        
        if (token) {
          setNotionToken(token);
          setNotionClient(new NotionSDKClient({ auth: token }));
        }

        const databaseId = notionDatabaseId || result.notionDatabaseId;
        if (databaseId) {
          setSelectedDatabaseId(databaseId);
        }
      } catch (error) {
        console.error('Error loading Notion config from storage:', error);
      }
    };

    loadNotionConfig();
  }, [notionDatabaseId]);

  // Load available databases from Notion
  const loadAvailableDatabases = async () => {
    if (!notionClient) return;

    setIsLoadingDatabases(true);
    try {
      const response = await notionClient.search({
        filter: {
          property: 'object',
          value: 'database'
        },
        page_size: 50
      });

      const databases = response.results
        .filter((item: any) => item.object === 'database')
        .map((db: any) => ({
          id: db.id,
          title: db.title?.[0]?.plain_text || 'Untitled Database'
        }));

      setAvailableDatabases(databases);
    } catch (error) {
      console.error('Error loading databases:', error);
      alert('Failed to load databases. Make sure your integration has access to them.');
    } finally {
      setIsLoadingDatabases(false);
    }
  };

  // Select a database and save to storage
  const selectDatabase = async (databaseId: string) => {
    try {
      await chrome.storage.sync.set({ 'notionDatabaseId': databaseId });
      setSelectedDatabaseId(databaseId);
      setShowDatabaseSelector(false);
    } catch (error) {
      console.error('Error saving database ID:', error);
    }
  };

  // Convert markdown content to Notion blocks
  const convertToNotionBlocks = (markdownContent: string) => {
    const blocks: any[] = [];
    const lines = markdownContent.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (!line) {
        continue;
      }
      
      // Headers
      if (line.startsWith('### ')) {
        blocks.push({
          object: 'block',
          type: 'heading_3',
          heading_3: {
            rich_text: [{
              type: 'text',
              text: { content: line.substring(4) }
            }]
          }
        });
      } else if (line.startsWith('## ')) {
        blocks.push({
          object: 'block',
          type: 'heading_2',
          heading_2: {
            rich_text: [{
              type: 'text',
              text: { content: line.substring(3) }
            }]
          }
        });
      } else if (line.startsWith('# ')) {
        blocks.push({
          object: 'block',
          type: 'heading_1',
          heading_1: {
            rich_text: [{
              type: 'text',
              text: { content: line.substring(2) }
            }]
          }
        });
      }
      // Code blocks
      else if (line.startsWith('```')) {
        const language = line.substring(3);
        const codeLines = [];
        i++;
        
        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        
        blocks.push({
          object: 'block',
          type: 'code',
          code: {
            rich_text: [{
              type: 'text',
              text: { content: codeLines.join('\n') }
            }],
            language: language || 'plain text'
          }
        });
      }
      // Bullet points
      else if (line.startsWith('- ') || line.startsWith('* ')) {
        blocks.push({
          object: 'block',
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [{
              type: 'text',
              text: { content: line.substring(2) }
            }]
          }
        });
      }
      // Numbered lists
      else if (/^\d+\.\s/.test(line)) {
        blocks.push({
          object: 'block',
          type: 'numbered_list_item',
          numbered_list_item: {
            rich_text: [{
              type: 'text',
              text: { content: line.replace(/^\d+\.\s/, '') }
            }]
          }
        });
      }
      // Regular paragraphs
      else {
        blocks.push({
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{
              type: 'text',
              text: { content: line }
            }]
          }
        });
      }
    }
    
    return blocks;
  };

  // Get text-only content for copying
  const getTextContent = () => {
    const parts = extractTextParts();
    return parts.map(part => part.content).join('\n\n');
  };

  // Copy content to clipboard
  const copyToClipboard = async () => {
    try {
      const textContent = getTextContent();
      await navigator.clipboard.writeText(textContent);
      // Show temporary success feedback
      const originalStatus = syncStatus;
      setSyncStatus('success');
      setTimeout(() => setSyncStatus(originalStatus), 1500);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      alert('Failed to copy to clipboard');
    }
  };

  // Sync content to Notion
  const syncToNotion = async () => {
    if (!notionClient) {
      alert('Notion token not configured');
      return;
    }

    if (!selectedDatabaseId) {
      alert('Please select a database first');
      return;
    }

    setIsSyncing(true);
    setSyncStatus('idle');

    try {
      const textContent = getTextContent();
      const blocks = convertToNotionBlocks(textContent);
      const timestamp = new Date().toISOString();
      console.log(await notionClient.queryDatabase(selectedDatabaseId));
      await notionClient.createPage({
        parent: { database_id: selectedDatabaseId },
        properties: {
          Name: {
            title: [{
              type: 'text',
              text: { content: `LLM Response - ${new Date().toLocaleDateString()}` }
            }]
          }
        },
        children: blocks
      });

      setSyncStatus('success');
      setTimeout(() => setSyncStatus('idle'), 3000);
    } catch (error) {
      console.error('Error syncing to Notion:', error);
      setSyncStatus('error');
      setTimeout(() => setSyncStatus('idle'), 3000);
    } finally {
      setIsSyncing(false);
    }
  };

  // Extract text parts (excluding tool calls)
  const extractTextParts = () => {
    const parts: Array<{ type: 'text' | 'tool', content: string }> = [];
    
    const combinedToolCallRegex = /(```(?:xml|bash)\s*)?<tool>(.*?)<\/tool>\s*<input>([\s\S]*?)<\/input>(?:\s*<requires_approval>(.*?)<\/requires_approval>)?(\s*```)?/g;
    let lastIndex = 0;
    
    const contentCopy = content.toString();
    combinedToolCallRegex.lastIndex = 0;
    
    let match;
    while ((match = combinedToolCallRegex.exec(contentCopy)) !== null) {
      if (match.index > lastIndex) {
        const textContent = contentCopy.substring(lastIndex, match.index).trim();
        if (textContent) {
          parts.push({
            type: 'text',
            content: textContent
          });
        }
      }
      
      parts.push({
        type: 'tool',
        content: match[0]
      });
      
      lastIndex = match.index + match[0].length;
    }
    
    if (lastIndex < contentCopy.length) {
      const remainingContent = contentCopy.substring(lastIndex).trim();
      if (remainingContent) {
        parts.push({
          type: 'text',
          content: remainingContent
        });
      }
    }

    if (parts.length === 0 && content.trim()) {
      parts.push({
        type: 'text',
        content: content.trim()
      });
    }

    return parts.filter(part => part.type === 'text');
  };

  const textParts = extractTextParts();
  const hasTextContent = textParts.length > 0;

  return (
    <div className="llm-content">
      {/* LLM Response Container */}
      {hasTextContent && (
        <div className="llm-response-container border border-base-300 rounded-lg p-4 mb-4 bg-base-50">
          {/* Header with controls */}
          <div className="flex justify-between items-center mb-3 pb-2 border-b border-base-300">
            <div className="text-sm font-medium text-base-content/80">
              🤖 LLM Response
            </div>
            <div className="flex gap-2">
              <button
                onClick={copyToClipboard}
                className="btn btn-xs btn-outline"
                title="Copy to clipboard"
              >
                📋 Copy
              </button>
              
              {/* Notion Sync Button */}
              <button
                onClick={syncToNotion}
                disabled={isSyncing || !notionToken || !selectedDatabaseId}
                className={`btn btn-xs ${
                  syncStatus === 'success' ? 'btn-success' :
                  syncStatus === 'error' ? 'btn-error' :
                  'btn-primary'
                }`}
                title="Sync to Notion"
              >
                {isSyncing ? (
                  <>
                    <span className="loading loading-spinner loading-xs"></span>
                    Syncing...
                  </>
                ) : syncStatus === 'success' ? (
                  <>✓ Synced</>
                ) : syncStatus === 'error' ? (
                  <>✗ Failed</>
                ) : (
                  <>📝 Notion</>
                )}
              </button>

              {/* Database selector */}
              {notionToken && (
                <button
                  onClick={() => {
                    setShowDatabaseSelector(!showDatabaseSelector);
                    if (!showDatabaseSelector && availableDatabases.length === 0) {
                      loadAvailableDatabases();
                    }
                  }}
                  className="btn btn-xs btn-ghost"
                  disabled={isLoadingDatabases}
                  title="Select database"
                >
                  {isLoadingDatabases ? (
                    <span className="loading loading-spinner loading-xs"></span>
                  ) : (
                    '⚙️'
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Status indicators */}
          <div className="mb-3">
            {!notionToken && (
              <div className="text-xs text-warning mb-1">
                ⚠️ Notion token not configured
              </div>
            )}
            
            {notionToken && !selectedDatabaseId && (
              <div className="text-xs text-warning mb-1">
                ⚠️ No database selected
              </div>
            )}

            {selectedDatabaseId && (
              <div className="text-xs text-success mb-1">
                ✅ Database configured
              </div>
            )}
          </div>

          {/* Database selector dropdown */}
          {showDatabaseSelector && (
            <div className="border border-base-300 rounded p-3 mb-3 bg-base-100">
              <div className="text-sm font-medium mb-2">Select Database:</div>
              
              {availableDatabases.length > 0 ? (
                <div className="max-h-32 overflow-y-auto">
                  {availableDatabases.map((db) => (
                    <button
                      key={db.id}
                      onClick={() => selectDatabase(db.id)}
                      className={`block w-full text-left p-2 hover:bg-base-200 rounded text-sm mb-1 ${
                        selectedDatabaseId === db.id ? 'bg-primary/10 border border-primary' : ''
                      }`}
                    >
                      📄 {db.title}
                      {selectedDatabaseId === db.id && <span className="text-primary ml-2">✓</span>}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-base-content/70 py-2">
                  No databases found. 
                  <a 
                    href="https://www.notion.so/help/add-and-manage-connections-with-the-api" 
                    target="_blank" 
                    className="text-primary underline ml-1"
                  >
                    Learn more →
                  </a>
                </div>
              )}

              <button
                onClick={() => setShowDatabaseSelector(false)}
                className="btn btn-xs btn-ghost mt-2"
              >
                Close
              </button>
            </div>
          )}

          {/* Response content */}
          <div className="llm-response-content">
            {textParts.map((part, index) => (
              <ReactMarkdown 
                key={index}
                remarkPlugins={[remarkGfm]}
                components={{
                  p: ({node, ...props}) => <p className="mb-2" {...props} />,
                  h1: ({node, ...props}) => <h1 className="text-xl font-bold mb-2" {...props} />,
                  h2: ({node, ...props}) => <h2 className="text-lg font-bold mb-2" {...props} />,
                  h3: ({node, ...props}) => <h3 className="text-md font-bold mb-2" {...props} />,
                  ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-2" {...props} />,
                  ol: ({node, ...props}) => <ol className="list-decimal pl-5 mb-2" {...props} />,
                  li: ({node, ...props}) => <li className="mb-1" {...props} />,
                  a: ({node, ...props}) => <a className="text-primary underline" {...props} target="_blank"/>,
                  code: ({node, className, children, ...props}) => {
                    const match = /language-(\w+)/.exec(className || '');
                    const codeText = String(children).trim();
                    const copyCodeToClipboard = () => {
                      navigator.clipboard.writeText(codeText).catch((err) => {
                        console.error('Copy failed', err);
                      });
                    };
                    
                    if (match?.[1] === 'mermaid') {
                      const mermaidRef = useRef<HTMLDivElement>(null);
                      const mermaidId = useRef(`mermaid-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
                      const [isRendered, setIsRendered] = useState(false);

                      useEffect(() => {
                        const renderMermaid = async () => {
                          if (mermaidRef.current && (window as any).mermaid) {
                            try {
                              mermaidRef.current.innerHTML = codeText;
                              mermaidRef.current.className = 'mermaid mb-2';
                              mermaidRef.current.setAttribute('data-id', mermaidId.current);
                              
                              await (window as any).mermaid.init(undefined, mermaidRef.current);
                              setIsRendered(true);
                            } catch (error) {
                              console.error('Mermaid rendering failed:', error);
                              setIsRendered(false);
                            }
                          }
                        };
                        
                        renderMermaid();
                      }, [part.content, codeText]);

                      const exportToSVG = async () => {
                        try {
                          let svgData = '';
                          
                          const currentSvg = mermaidRef.current?.querySelector('svg');
                          if (currentSvg) {
                            svgData = currentSvg.outerHTML;
                          } else if ((window as any).mermaid.render) {
                            const { svg } = await (window as any).mermaid.render(mermaidId.current + '-export', codeText);
                            svgData = svg;
                          } else {
                            console.error('No SVG available to export');
                            return;
                          }

                          const blob = new Blob([svgData], { type: 'image/svg+xml' });
                          const reader = new FileReader();
                          reader.onload = () => {
                            const dataUrl = reader.result as string;
                            chrome.downloads.download({
                              url: dataUrl,
                              filename: 'mermaid-diagram.svg',
                              saveAs: true
                            });
                          };
                          reader.readAsDataURL(blob);
                        } catch (error) {
                          console.error('Error exporting SVG:', error);
                          alert('Export failed. Please try again.');
                        }
                      };

                      return (
                        <div className="mermaid-container">
                          <div ref={mermaidRef} className="mermaid mb-2">{codeText}</div>
                          <div className="flex gap-2">
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={exportToSVG}
                              disabled={!isRendered && !codeText}
                            >
                              Download SVG
                            </button>
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => {
                                try {
                                  const blob = new Blob([codeText], { type: 'text/plain' });
                                  const reader = new FileReader();
                                  reader.onload = () => {
                                    const dataUrl = reader.result as string;
                                    chrome.downloads.download({
                                      url: dataUrl,
                                      filename: 'mermaid-diagram.mmd',
                                      saveAs: true
                                    });
                                  };
                                  reader.readAsDataURL(blob);
                                } catch (error) {
                                  console.error('Error downloading source:', error);
                                  alert('Download failed. Please try again.');
                                }
                              }}
                            >
                              Download Source
                            </button>
                          </div>
                        </div>
                      );
                    }   
                    
                    const isInline = !match && !className;
                    return isInline 
                      ? <code className="bg-base-300 px-1 rounded text-sm" {...props}>{children}</code>
                      : 
                      <>
                        <button
                          onClick={copyCodeToClipboard}
                          className="text-xs bg-primary text-white px-2 py-1 rounded hover:bg-primary/80"
                        >
                          Copy
                        </button>
                        <pre className="bg-base-300 p-2 rounded text-sm overflow-auto my-2">
                          <code {...props}>{children}</code>
                        </pre>
                      </>;
                  },
                  blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-base-300 pl-4 italic my-2" {...props} />,
                  table: ({node, ...props}) => <table className="border-collapse table-auto w-full my-2" {...props} />,
                  th: ({node, ...props}) => <th className="border border-base-300 px-4 py-2 text-left" {...props} />,
                  td: ({node, ...props}) => <td className="border border-base-300 px-4 py-2" {...props} />,
                }}
              >
                {part.content}
              </ReactMarkdown>
            ))}
          </div>
        </div>
      )}

      {/* Tool calls rendering (if any) */}
      {content && !hasTextContent && (
        <div className="text-sm text-base-content/60 italic">
          No text content to display (tool calls only)
        </div>
      )}
    </div>
  );
};