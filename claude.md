# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Commands

### Development
```bash
npm run dev              # Start dev mode with auto-rebuild and watch
npm run build            # Production build (outputs to dist/)
npm run copy-static      # Copy public/ files to dist/
```

### Testing
```bash
npm test                           # Run all 548 tests
npm run test:watch                 # Watch mode for TDD
npm run test:coverage              # Generate coverage report
npm test -- PageContextManager     # Run specific test file
npm test -- --testPathPattern="agent/tools"  # Run tests in directory
```

### Code Quality
```bash
npm run lint             # Run ESLint
npm run lint:fix         # Auto-fix ESLint issues
npx tsc --noEmit        # TypeScript type checking
```

### Extension Development Workflow
1. Run `npm run dev` in terminal
2. Load `dist/` folder as unpacked extension in `chrome://extensions/`
3. Make code changes in `src/`
4. Vite auto-rebuilds on save
5. Click refresh icon on extension card in Chrome
6. Changes are live

**Critical**: playwright-crx cannot be minified (see vite.config.ts line 16)

## Architecture Overview

### Five Core Modules

**1. Agent Module** (`src/agent/`)
- `AgentCore.ts`: Main BrowserAgent class orchestrating execution
- `ExecutionEngine.ts`: Agentic loop with streaming LLM responses and tool execution
- `ToolManager.ts`: Tool registration, health checks, and dynamic addition (e.g., Notion)
- `PromptManager.ts`: System prompts per role (operator, researcher, dataAnalyst, etc.)
- `MemoryManager.ts`: Domain-based memory lookup and integration
- `TokenManager.ts`: Token estimation and history trimming to fit context window
- `tools/`: 25+ browser automation tools organized by category

**2. Background Module** (`src/background/`)
- `messageHandler.ts`: Central message router for all chrome.runtime.sendMessage calls
- `agentController.ts`: Agent lifecycle (create, execute, cancel per window)
- `tabManager.ts`: Chrome DevTools Protocol (CDP) attachment and Playwright page context
- `streamingManager.ts`: Buffers and segments streaming LLM output
- `configManager.ts`: Singleton for provider config (stored in chrome.storage.sync)

**3. Models Module** (`src/models/providers/`)
- `factory.ts`: Creates LLM provider instances based on config
- Providers: anthropic, openai, gemini, ollama, deepseek, openai-compatible
- All implement unified `LLMProvider` interface with `createMessage()` returning `AsyncGenerator<StreamChunk>`

**4. UI Module** (`src/sidepanel/`, `src/options/`)
- `SidePanel.tsx`: Main UI composing components and hooks
- `hooks/`: useChromeMessaging, useTabManagement, useMessageManagement
- `components/`: Modular UI pieces (PromptForm, MessageDisplay, TokenUsageDisplay, etc.)

**5. Tracking Module** (`src/tracking/`)
- `memoryService.ts`: IndexedDB for agent memories (domain-based patterns)
- `vectorService.ts`: Vector database with cosine similarity search
- `embeddingService.ts`: HuggingFace transformers.js (Xenova/all-MiniLM-L6-v2, 384-dim)
- `pageVectorizationService.ts`: Chunks and vectorizes page content

### Key Execution Flow

```
User prompt in UI
  ↓ chrome.runtime.sendMessage({action: 'executePrompt', ...})
Background messageHandler routes to agentController
  ↓ Gets/creates BrowserAgent for window
ExecutionEngine.executePromptWithFallback() starts loop:
  1. Add user message to history
  2. Lookup domain memories (MemoryManager)
  3. Stream LLM response (llmProvider.createMessage())
  4. Parse tool calls from <tool>...</tool> XML
  5. Execute tool via ToolManager
  6. Add result to history
  7. Repeat until complete
  ↓ Callbacks send updates to UI
UI receives via useChromeMessaging hook and re-renders
```

### Message Passing Architecture

All chrome.runtime.sendMessage calls use typed messages from `background/types.ts`:
- **UI → Background**: executePrompt, cancelExecution, initializeTab, getTokenUsage
- **Background → UI**: updateOutput, updateStreamingChunk, tokenUsageUpdated, requestApproval

Messages include `tabId` and `windowId` for multi-window isolation. Background broadcasts to all listeners; UI filters by its tabId.

### Tool System

Tools defined in `src/agent/tools/*.ts` as DynamicTool objects:
```typescript
{
  name: 'tool_name',
  description: 'Detailed description including input format',
  func: async (input: string, context?) => Promise<string>
}
```

Tools exported from `tools/index.ts` via `getAllTools(page)`. BrowserAgent converts to BrowserTool format and passes to ToolManager. LLM calls tools using XML:
```xml
<tool>tool_name</tool>
<input>{"arg": "value"}</input>
<requires_approval>false</requires_approval>
```

ExecutionEngine parses XML, validates tool exists, requests approval if needed, executes, and adds result to message history.

### Memory & Vector Storage

**Memory System** (IndexedDB "BrowserOnly-memories"):
- Stores domain-specific patterns: {domain, taskDescription, toolSequence, createdAt}
- MemoryManager looks up memories at task start and adds to initial messages
- LLM uses past patterns as suggestions for current task
- `save_memory` tool stores new patterns after successful completion

**Vector System** (IndexedDB "BrowserBeeVectorDB"):
- Collections contain VectorDocuments with embeddings (384-dim)
- Cosine similarity search returns topK most relevant chunks
- HuggingFace embeddings generated in Offscreen document (non-blocking)
- PageVectorizationService chunks and vectorizes web pages
- Agent uses `searchVectors` tool for semantic search

### Provider System

Factory pattern in `models/providers/factory.ts` creates LLM provider instances:
- Anthropic: Supports prompt caching, extended thinking (thinkingBudget), streaming
- OpenAI: Standard OpenAI API with function calling
- Gemini: Google Gemini API with native tool calling
- Ollama: Local execution, custom models from storage, no API key
- DeepSeek/OpenAI-Compatible: Alternative endpoints

All providers implement `LLMProvider` interface returning `AsyncGenerator<StreamChunk>`. ExecutionEngine handles streaming uniformly with fallback to non-streaming on errors.

## Critical Implementation Details

### Multi-Window Support
- Each Chrome window has its own BrowserAgent instance
- TabManager maps tabId → windowId → agent
- Messages filtered by windowId to prevent cross-window interference
- Agent state (IDLE, RUNNING, CANCELLED) tracked per window

### Tool Approval Flow
1. Tool marked with `<requires_approval>true</requires_approval>`
2. ExecutionEngine sends `requestApproval` message to UI
3. UI shows approval dialog
4. User approves/rejects via `approvalResponse` message
5. ExecutionEngine waits for response before executing tool

### Streaming with Fallback
- `ExecutionEngine.executePromptWithFallback()` tries streaming first
- On error (rate limit, overload), falls back to non-streaming
- Implements exponential backoff with max 5 retries
- StreamingManager buffers chunks and segments output for smooth UI

### Token Management
- TokenManager estimates tokens using rough heuristics (4 chars ≈ 1 token)
- `trimHistory()` removes old messages when approaching context limit
- Prioritizes recent messages and tool results
- TokenTrackingService tracks input/output/cache tokens per window
- Calculates cost: (tokens × price_per_million) and broadcasts to UI

### Health Checks
- ToolManager wraps tools with try-catch and connection detection
- page.evaluate() calls detect CDP disconnection
- On error, sends error message instead of crashing
- Agent can request tab refresh via `refreshTab` message

### PDF Viewer Integration
- Content script (`pdfInterceptor.ts`) intercepts PDF navigations
- Redirects to custom viewer: `pdf-viewer.html?file=<url>`
- PDF.js extracts text with intelligent filtering (removes headers/footers/page numbers)
- SimpleChatAgent (lightweight, no tools) powers PDF AI assistant
- Background service provides LLM access via `pdfAiChat` message

## Adding New Features

### Adding a New Tool
1. Define in `src/agent/tools/mytools.ts`:
   ```typescript
   export const myTool = (page: Page): DynamicTool => ({
     name: 'my_tool',
     description: 'Detailed description for LLM',
     func: async (input: string) => {
       // Use page.evaluate(), page.click(), etc.
       return JSON.stringify(result);
     }
   });
   ```
2. Export from `tools/index.ts` in `getAllTools()`
3. Tool automatically available to agent

### Adding a New LLM Provider
1. Create `src/models/providers/myprovider.ts` implementing `LLMProvider`
2. Add case to `factory.ts` switch statement
3. Create UI settings component in `src/options/components/`
4. Update `ProviderSettings.tsx` to include new component
5. Add to `ProviderSelector.tsx` dropdown

### Adding a New Agent Role
1. Create prompt in `src/agent/prompts/myRolePrompt.ts`
2. Export from `prompts/index.ts`
3. Add role to `PromptManager.getSystemPrompt()` switch
4. Update UI dropdown in `SidePanel.tsx`

### Modifying Message Types
1. Add type to `src/background/types.ts` BackgroundMessage union
2. Add handler case in `messageHandler.ts`
3. Update `useChromeMessaging.ts` to handle new message
4. Ensure type guards cover new message

## Testing Guidelines

### Test Structure (548 tests across 18 suites)
- **Agent Core** (275+ tests): AgentCore, ExecutionEngine, MemoryManager, PromptManager, TokenManager
- **Agent Tools** (260+ tests): All browser tools (click, type, navigate, memory, vector, etc.)
- **Infrastructure** (13+ tests): ConfigManager, provider factories

### Writing Tests
- Use mocks from `tests/mocks/` (playwright, chrome APIs, fetch)
- Put test data in `tests/fixtures/`
- Follow pattern in `tests/unit/agent/**/*.test.ts`
- Mock Playwright page methods and chrome APIs
- Test both success and error scenarios

Example:
```typescript
import { createMockPage } from '../../mocks/playwright';

describe('MyComponent', () => {
  let mockPage: any;

  beforeEach(() => {
    mockPage = createMockPage();
    jest.clearAllMocks();
  });

  it('should handle operation', async () => {
    mockPage.evaluate.mockResolvedValue('result');
    // test implementation
  });
});
```

### CI/CD
- GitHub Actions runs on every push/PR
- Must pass: ESLint, TypeScript compilation, all tests, build
- Tests on Node.js 18 and 20
- Build artifacts saved for 7 days

## Important Constraints

### Build Configuration (vite.config.ts)
- **playwright-crx cannot be minified** (line 16: `minify: false`)
- Sourcemaps enabled for debugging
- Multiple entry points: background, sidepanel, options, pdfInterceptor, offscreen, data-story
- CSS concatenated to single `assets/styles.css`

### Extension Manifest (public/manifest.json)
- Manifest V3 service worker
- Requires `debugger` permission for CDP
- All URLs host permission for automation
- CSP allows `wasm-unsafe-eval` for PDF.js and DuckDB

### IndexedDB Databases
- "BrowserOnly-memories": Agent memories by domain
- "BrowserBeeVectorDB": Vector embeddings with metadata
- Both use self-healing logic on database errors

### Chrome Storage
- Provider config in `chrome.storage.sync` (synced across devices)
- Notion config, PDF viewer settings also in sync storage
- Token usage per window in service worker memory (not persisted)

## Project-Specific Patterns

### Agent Cancellation
- User clicks cancel → UI sends `cancelExecution` message
- Background calls `agent.cancel()` which sets `this.errorHandler.cancelled = true`
- ExecutionEngine checks `this.errorHandler.cancelled` in loop
- Throws `AgentError` to exit cleanly
- Agent state set to IDLE

### Memory Reflection
- After task completion, UI can trigger `reflectAndLearn`
- ReflectionController creates SubAgent to analyze conversation
- SubAgent extracts patterns: task description + tool sequence
- Stores in MemoryService with domain from current URL
- Future tasks on same domain get these patterns as context

### Specialized Agents
- **BrowserAgent**: Full automation with all tools (main agent)
- **SimpleChatAgent**: Lightweight chat without tools (PDF viewer)
- **DataAnalystAgent**: SQL analysis with DuckDB tools and table schema context

### Role-Based Prompts
Roles significantly change agent behavior:
- **operator**: General automation, browser control
- **researcher**: Multi-tab analysis, information aggregation
- **dataAnalyst**: SQL queries, data visualization
- **lawyer**: Legal document analysis
- **trader**: Financial data analysis
- **books/munger/notebooklm**: Book-based learning with specific methodologies

## Common Gotchas

1. **Tab attachment**: Can't attach to chrome://, chrome-extension://, or about:blank URLs
2. **Streaming errors**: LLM streaming can fail due to rate limits → fallback handles this
3. **Tool input format**: Always JSON string, even for simple values
4. **Message filtering**: UI must filter messages by tabId to avoid cross-tab pollution
5. **Agent reinitialization**: Provider config change requires creating new agent instance
6. **IndexedDB access**: All database operations must be async and handle connection errors
7. **Playwright page**: page object becomes invalid if tab closes → health checks detect this
8. **Memory format**: Memories stored per normalized domain (strip subdomain for consistency)
9. **Vector dimension**: All embeddings must be 384-dim to match model
10. **Token tracking**: Token counts are estimates, not exact (affects cost calculations)

## Key Files to Understand

For a complete mental model, read these in order:
1. `src/background/types.ts` - All message types
2. `src/background/messageHandler.ts` - Message routing
3. `src/agent/AgentCore.ts` - Agent initialization
4. `src/agent/ExecutionEngine.ts` - Core execution loop
5. `src/models/providers/types.ts` - LLM provider interface
6. `src/agent/tools/index.ts` - Tool registration
7. `src/tracking/memoryService.ts` - Memory storage
8. `src/tracking/vectorService.ts` - Vector storage

## Resources

- Architecture details: `ARCHITECTURE.md`
- Development setup: `DEVELOPMENT.md`
- Contributing guide: `CONTRIBUTING.md`
- Data analysis: `docs/DATA_ANALYST_AGENT_DESIGN.md`
- Vector embeddings: `docs/VECTOR_EMBEDDING_README.md`
