import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { NotionSDKClient } from '../../agent/notionClient';
import { OfficeResponseCard, parseOfficeReportResponse } from './office/OfficeResponseCard';
import { MarkdownTable } from './MarkdownTable';

interface LlmContentProps {
  content: string;
  notionDatabaseId?: string;
}

export const LlmContent: React.FC<LlmContentProps> = ({ 
  content, 
  notionDatabaseId 
}) => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [notionToken, setNotionToken] = useState<string | null>(null);
  const [notionClient, setNotionClient] = useState<NotionSDKClient | null>(null);
  const [availableDatabases, setAvailableDatabases] = useState<Array<{id: string, title: string}>>([]);
  const [isLoadingDatabases, setIsLoadingDatabases] = useState(false);
  const [showDatabaseSelector, setShowDatabaseSelector] = useState(false);
  const [selectedDatabaseId, setSelectedDatabaseId] = useState<string | null>(null);
  const [selectedDatabaseName, setSelectedDatabaseName] = useState('');
  const [databaseError, setDatabaseError] = useState('');
  const [slackConfig, setSlackConfig] = useState<{ token: string; channel: string }>({ token: '', channel: '' });
  const [slackStatus, setSlackStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [slackError, setSlackError] = useState('');

  useEffect(() => {
    const loadSlackConfig = () => {
      chrome.storage.local.get({ slackBotToken: '', slackChannel: 'auto-web' }, result => {
        setSlackConfig({ token: result.slackBotToken || '', channel: result.slackChannel || 'auto-web' });
      });
    };
    loadSlackConfig();
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && (changes.slackBotToken || changes.slackChannel)) loadSlackConfig();
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  // Load Notion token from Chrome storage on component mount
  useEffect(() => {
    const loadNotionConfig = async () => {
      try {
        const result = await chrome.storage.sync.get(['notionBearerToken', 'notionDatabaseId', 'notionDatabaseName']);
        const token = result.notionBearerToken;
        
        if (token) {
          setNotionToken(token);
          setNotionClient(new NotionSDKClient({ auth: token }));
        }

        const databaseId = notionDatabaseId || result.notionDatabaseId;
        if (databaseId) {
          setSelectedDatabaseId(databaseId);
          setSelectedDatabaseName(result.notionDatabaseName || '');
        }
      } catch (error) {
        console.error('Error loading Notion config from storage:', error);
      }
    };

    loadNotionConfig();
  }, [notionDatabaseId]);

  useEffect(() => {
    const onChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'sync' || (!changes.notionDatabaseId && !changes.notionDatabaseName && !changes.notionBearerToken)) return;
      if (changes.notionBearerToken) {
        const token = changes.notionBearerToken.newValue || '';
        setNotionToken(token || null);
        setNotionClient(token ? new NotionSDKClient({ auth: token }) : null);
        setSelectedDatabaseName('');
        setDatabaseError('');
      }
      if (changes.notionDatabaseId) setSelectedDatabaseId(changes.notionDatabaseId.newValue || null);
      if (changes.notionDatabaseName) setSelectedDatabaseName(changes.notionDatabaseName.newValue || '');
      else if (changes.notionDatabaseId) setSelectedDatabaseName('');
      if (changes.notionDatabaseId) setDatabaseError('');
    };
    chrome.storage.onChanged.addListener(onChanged);
    return () => chrome.storage.onChanged.removeListener(onChanged);
  }, []);

  useEffect(() => {
    if (!notionClient || !selectedDatabaseId) return;
    let cancelled = false;
    void notionClient.getDatabase(selectedDatabaseId).then(database => {
      if (cancelled) return;
      setSelectedDatabaseName(database.title?.map((item: { plain_text?: string }) => item.plain_text ?? '').join('') || 'Untitled database');
      setDatabaseError('');
    }).catch(error => {
      if (cancelled) return;
      const status = typeof error?.status === 'number' ? `HTTP ${error.status}: ` : '';
      setDatabaseError(`${status}${error instanceof Error ? error.message : String(error)}`);
    });
    return () => { cancelled = true; };
  }, [notionClient, selectedDatabaseId]);

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
  const selectDatabase = async (databaseId: string, databaseName: string) => {
    try {
      await chrome.storage.sync.set({ notionDatabaseId: databaseId, notionDatabaseName: databaseName });
      setSelectedDatabaseId(databaseId);
      setSelectedDatabaseName(databaseName);
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
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 1500);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      alert('Failed to copy to clipboard');
    }
  };

  const sendToSlack = async () => {
    if (!slackConfig.token.trim() || !slackConfig.channel.trim()) {
      setSlackStatus('error');
      return;
    }
    setSlackStatus('sending');
    setSlackError('');
    try {
      const channel = slackConfig.channel.trim().replace(/^#/, '');
      const response = await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: { Authorization: `Bearer ${slackConfig.token.trim()}`, 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ channel: `#${channel}`, text: getTextContent().slice(0, 40_000) }),
      });
      const result = await response.json() as { ok?: boolean; error?: string };
      if (!response.ok || !result.ok) throw new Error(result.error ?? `Slack returned HTTP ${response.status}`);
      setSlackStatus('success');
      setTimeout(() => setSlackStatus('idle'), 2500);
    } catch (error) {
      console.error('Error sending response to Slack:', error);
      setSlackError(error instanceof Error ? error.message : String(error));
      setSlackStatus('error');
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
        <div className="llm-response-container mb-3 rounded-lg border border-stone-200 bg-white px-3 py-3 shadow-sm">
          {/* Header with controls */}
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-stone-500">
              <button
                type="button"
                aria-expanded={!isCollapsed}
                aria-label={isCollapsed ? 'Expand response' : 'Collapse response'}
                onClick={() => setIsCollapsed(value => !value)}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-stone-500 hover:bg-stone-100"
                title={isCollapsed ? 'Expand response' : 'Collapse response'}
              >
                <svg aria-hidden="true" viewBox="0 0 20 20" className={`h-4 w-4 transition-transform ${isCollapsed ? '' : 'rotate-90'}`} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m7 4 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              Response
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <button
                onClick={copyToClipboard}
                className="min-h-8 rounded-md px-2 text-xs font-medium text-[#315a78] hover:bg-[#eaf2f7]"
                title="Copy to clipboard"
              >
                {isCopied ? 'Copied' : 'Copy'}
              </button>
              
              {/* Notion Sync Button */}
              <button
                onClick={syncToNotion}
                disabled={isSyncing || !notionToken || !selectedDatabaseId}
                className={`min-h-8 rounded-md px-2 text-xs font-medium hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40 ${syncStatus === 'error' ? 'text-red-700' : 'text-stone-600'}`}
                title={selectedDatabaseId ? `Save to Notion database: ${selectedDatabaseName || 'Loading name'}` : 'Select a Notion database first'}
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
                  <>Save to Notion</>
                )}
              </button>

              <button
                onClick={sendToSlack}
                disabled={slackStatus === 'sending' || !slackConfig.token.trim() || !slackConfig.channel.trim()}
                className={`min-h-8 rounded-md px-2 text-xs font-medium hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40 ${slackStatus === 'error' ? 'text-red-700' : 'text-stone-600'}`}
                title={slackStatus === 'error' ? `Slack send failed: ${slackError}` : slackConfig.token ? `Send this response to #${slackConfig.channel.replace(/^#/, '')}` : 'Configure Slack Bot Token in Settings → Connections'}
              >
                {slackStatus === 'sending' ? <><span className="loading loading-spinner loading-xs" /> Sending…</> : slackStatus === 'success' ? '✓ Slack' : slackStatus === 'error' ? '✗ Slack' : 'Slack'}
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
                  className="min-h-8 rounded-md px-2 text-xs font-medium text-stone-500 hover:bg-stone-100"
                  disabled={isLoadingDatabases}
                  title="Choose Notion database"
                >
                  {isLoadingDatabases ? (
                    <span className="loading loading-spinner loading-xs"></span>
                  ) : (
                    'Database'
                  )}
                </button>
              )}
            </div>
          </div>

          <div hidden={isCollapsed}>
          {notionToken && <p className="mb-3 text-xs text-stone-500">Notion database: <span className="font-medium text-stone-700">{selectedDatabaseId ? selectedDatabaseName || (databaseError ? 'Unavailable' : 'Loading name…') : 'Choose a database'}</span>{databaseError && <span className="ml-2 text-red-700" title={databaseError}>({databaseError})</span>}</p>}

          {/* Database selector dropdown */}
          {showDatabaseSelector && (
            <div className="mb-3 rounded-lg border border-stone-200 bg-stone-50 p-3">
              <div className="mb-2 text-xs font-semibold text-stone-700">Save responses to</div>
              
              {isLoadingDatabases ? <p role="status" className="px-2 py-3 text-xs text-stone-500">Loading databases…</p> : availableDatabases.length > 0 ? (
                <div className="max-h-40 space-y-1 overflow-y-auto">
                  {availableDatabases.map((db) => (
                    <button
                      key={db.id}
                      onClick={() => selectDatabase(db.id, db.title)}
                      aria-pressed={selectedDatabaseId === db.id}
                      className={`flex min-h-9 w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-white ${
                        selectedDatabaseId === db.id ? 'bg-white font-medium text-[#315a78] shadow-sm' : 'text-stone-700'
                      }`}
                    >
                      <span className="min-w-0 truncate">{db.title}</span>
                      {selectedDatabaseId === db.id && <span className="shrink-0 text-xs">Selected ✓</span>}
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

              <button onClick={() => setShowDatabaseSelector(false)} className="mt-2 rounded-md px-2 py-1 text-xs font-medium text-stone-500 hover:bg-white">Close</button>
            </div>
          )}

          {/* Response content */}
          <div className="llm-response-content">
            {textParts.map((part, index) => {
              const officeResponse = parseOfficeReportResponse(part.content);
              if (officeResponse) {
                const prefix = part.content.slice(0, officeResponse.start).trim();
                return <React.Fragment key={index}>
                  {prefix && <p className="mb-2">{prefix}</p>}
                  <OfficeResponseCard report={officeResponse.report} rawJson={officeResponse.raw} />
                </React.Fragment>;
              }
              return <ReactMarkdown 
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
                  table: ({children}) => <MarkdownTable>{children}</MarkdownTable>,
                  th: ({node, ...props}) => <th className="border border-base-300 px-4 py-2 text-left" {...props} />,
                  td: ({node, ...props}) => <td className="border border-base-300 px-4 py-2" {...props} />,
                }}
              >
                {part.content}
              </ReactMarkdown>;
            })}
          </div>
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
