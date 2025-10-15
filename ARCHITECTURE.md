# BrowserOnly Architecture

This document provides a detailed overview of BrowserOnly's architecture, component structure, and code organization.

## Overview

BrowserOnly is a privacy-first Chrome extension (Manifest V3) that enables browser automation through natural language. It uses a modular agent architecture with five key modules:

- **Agent Module** – Processes user instructions and maps them to browser actions
- **Background Module** – Manages tab control, messaging, and task streaming
- **UI Module** – Provides a clean sidebar interface for interaction and configuration
- **Models Module** – Provides a flexible interface for multiple LLM providers
- **PDF Viewer Module** – Built-in PDF viewer with intelligent text extraction and AI assistant

## Extension Configuration

### Manifest V3 Setup (public/manifest.json)

**Core Configuration**:
- **Version**: 0.4.0
- **Background Service Worker**: `background.js` (ES module)
- **Side Panel**: `sidepanel.html` (default UI)
- **Options Page**: `options.html` (configuration interface)
- **Content Scripts**: `pdfInterceptor.js` (injected at document_start for all URLs)

**Permissions**:
- `debugger`: Required for Chrome DevTools Protocol (CDP) access
- `tabs`: Tab management and navigation
- `sidePanel`: Side panel API for UI
- `storage`: Configuration and memory persistence
- `activeTab`: Access to active tab content
- `commands`: Keyboard shortcuts
- `downloads`: File download capability
- `contextMenus`: Context menu integration

**Host Permissions**: `<all_urls>` - Full access required for browser automation

**Web Accessible Resources**:
- PDF.js viewer files (`viewer.mjs`, `pdf.mjs`, `pdf.worker.mjs`)
- PDF enhancement scripts (`pdf-text-extract.js`, `pdf-ai-assistant.js`)
- Styling (`viewer.css`, `pdf-text-extract.css`)
- Libraries (`marked.min.js` for markdown, `mermaid.min.js` for diagrams)

**Keyboard Shortcuts**:
- **Alt+Shift+B** (Windows/Linux/Mac): Open BrowserOnly side panel

**Content Security Policy**:
- Allows `'wasm-unsafe-eval'` for PDF.js WebAssembly execution

## Detailed Architecture

### Models Module

The Models Module provides a flexible, provider-agnostic interface for multiple LLM providers using the Factory and Adapter patterns.

#### Core Interfaces (models/providers/types.ts)

- **`LLMProvider`**: Main interface that all providers must implement
  - `streamCompletion()`: Streaming responses
  - `chat()`: Non-streaming responses
  - `getModelInfo()`: Model metadata
  - `getProviderName()`: Provider identification

- **`ModelInfo`**: Model metadata
  - Name, pricing (input/output per token)
  - Context window size
  - Capabilities (vision, streaming, etc.)

- **`ProviderOptions`**: Configuration
  - API key, model ID, base URL
  - Custom settings (thinking budget, temperature, etc.)

- **`StreamChunk`**: Normalized streaming format
  - Content, tool calls, finish reason
  - Usage statistics

#### Provider Implementations

**1. Anthropic Claude** (models/providers/anthropic.ts)
- Full support for Claude 3.x models
- Extended thinking mode with configurable token budget
- Tool/function calling support
- Streaming with proper chunk handling
- Vision capabilities (image analysis)

**2. OpenAI GPT** (models/providers/openai.ts)
- GPT-3.5, GPT-4, GPT-4 Turbo support
- Standard OpenAI API integration
- Function calling and tools
- Streaming responses
- Vision capabilities (GPT-4 Vision)

**3. Google Gemini** (models/providers/gemini.ts)
- Gemini Pro and Ultra models
- Gemini-specific API format
- Tool usage support
- Streaming capabilities
- Multimodal support

**4. Ollama** (models/providers/ollama.ts)
- Local model execution
- No API key required
- Browser-compatible Ollama library
- Custom model configuration
- Streaming support
- CORS-enabled endpoint required
- Format transformer for message conversion

**5. OpenAI-Compatible** (models/providers/openai-compatible.ts)
- Support for OpenAI-compatible endpoints
- Custom base URL configuration
- Model list management
- Used for third-party providers with OpenAI API

**6. DeepSeek** (models/providers/deepseek.ts)
- DeepSeek API integration
- Reasoning model support
- Compatible with OpenAI format

#### Provider Factory (models/providers/factory.ts)

**`createProvider(providerName, options)`**:
- Factory function that instantiates the correct provider
- Validates configuration requirements
- Returns initialized LLMProvider instance
- Handles provider-specific setup

#### Message Format Transformers

**ollama-format.ts**: Converts between formats
- Anthropic message format → Ollama format
- Handles tool definitions
- Manages image content
- Preserves conversation context

### Agent Module

The Agent Module is the core orchestrator responsible for processing user instructions and executing browser automation tasks through Playwright.

#### Core Class: BrowserAgent (agent/AgentCore.ts)

**Responsibilities**:
- Coordinates all agent components
- Manages Playwright page context
- Initializes tools and components
- Provides execution interface

**Architecture**:
```typescript
class BrowserAgent {
  private llmProvider: LLMProvider;        // Multi-provider LLM interface
  private toolManager: ToolManager;        // Tool execution and health checks
  private promptManager: PromptManager;    // System prompt generation
  private memoryManager: MemoryManager;    // Memory lookup and integration
  private errorHandler: ErrorHandler;      // Cancellation and error handling
  private executionEngine: ExecutionEngine; // Execution orchestration
  private notionClient: NotionSDKClient;   // Optional Notion integration
}
```

**Key Methods**:
- `executePrompt()`: Non-streaming execution
- `executePromptWithFallback()`: Streaming with fallback
- `cancel()`: Cancel current execution
- `resetCancel()`: Reset cancellation flag
- `isStreamingSupported()`: Check streaming capability

**Tool Conversion**:
- Converts `DynamicTool` → `BrowserTool` format
- Handles tool format variations
- Provides error handling wrapper
- Supports dynamic tool addition (e.g., Notion tools)

**Factory Functions**:
- `createBrowserAgent(page, apiKey)`: Creates configured agent
- `needsReinitialization(agent, config)`: Checks if reinit needed
- `executePrompt()` / `executePromptWithFallback()`: Execution helpers

#### Specialized Components

**1. ToolManager** (agent/ToolManager.ts)
- Wraps browser tools with health checks
- Validates tool inputs
- Handles tool execution errors
- Provides tool discovery interface
- Supports dynamic tool registration

**2. PromptManager** (agent/PromptManager.ts)
- Generates system prompts with tool descriptions
- Maintains context about available tools
- Updates prompts when tools change
- Includes role-specific instructions (operator, researcher, etc.)

**3. TokenManager** (agent/TokenManager.ts)
- Estimates token usage for messages
- Trims message history to fit context window
- Prioritizes recent and important messages
- Prevents context overflow errors

**4. MemoryManager** (agent/MemoryManager.ts)
- Looks up relevant memories from IndexedDB
- Integrates memories into system prompt
- Filters by domain/URL relevance
- Provides memory context to agent

**5. ExecutionEngine** (agent/ExecutionEngine.ts)
- **Provider-agnostic execution**
- Streaming and non-streaming modes
- Handles tool calls from LLM responses
- Manages conversation flow
- Implements retry logic
- Fallback to non-streaming on errors

**6. ErrorHandler** (agent/ErrorHandler.ts)
- Cancellation flag management
- Error recovery strategies
- Streaming capability detection
- Graceful degradation

**7. ApprovalManager** (agent/approvalManager.ts)
- User approval workflow for sensitive actions
- Request queuing and tracking
- Response handling
- Timeout management

**8. SubAgent** (agent/SubAgent.ts)
- Creates specialized sub-agents for tasks
- Inherits tools from parent agent
- Focused on specific subtasks
- Used for reflection and learning

**9. SimpleChatAgent** (agent/SimpleChatAgent.ts)
- Lightweight chat interface without tools
- Used for PDF AI assistant
- Maintains conversation history
- Synchronous and streaming modes

**10. Notion Client** (agent/notionClient.ts)
- Notion API integration
- Database and page operations
- Connection management
- Tool generation for Notion operations

#### Browser Tools (agent/tools/)

**Tool Categories**:

**Navigation Tools** (navigationTools.ts):
- `browser_navigate`: Navigate to URL
- `browser_wait_for_navigation`: Wait for network idle
- `browser_navigate_back`: Go back in history
- `browser_navigate_forward`: Go forward in history
- `browser_refresh`: Refresh current page

**Interaction Tools** (interactionTools.ts):
- `browser_click`: Click elements by selector or text
- `browser_type`: Type text into input fields
- `browser_scroll`: Scroll page
- `browser_handle_dialog`: Handle alerts/confirms/prompts

**Observation Tools** (observationTools.ts):
- `browser_get_title`: Get page title
- `browser_snapshot_dom`: Capture DOM structure
- `browser_query`: Query elements with CSS selector
- `browser_accessible_tree`: Get accessibility tree
- `browser_read_text`: Extract visible text
- `browser_screenshot`: Take page screenshot

**Mouse Tools** (mouseTools.ts):
- `browser_move_mouse`: Move cursor to coordinates
- `browser_click_xy`: Click at absolute position
- `browser_drag`: Drag and drop operations

**Keyboard Tools** (keyboardTools.ts):
- `browser_press_key`: Press single key
- `browser_keyboard_type`: Type text at focus

**Tab Tools** (tabTools.ts):
- `browser_tab_list`: List all open tabs
- `browser_tab_new`: Create new tab
- `browser_tab_select`: Switch to tab by index
- `browser_tab_close`: Close tab
- `browser_get_active_tab`: Get current tab info
- `browser_navigate_tab`: Navigate specific tab
- `browser_screenshot_tab`: Screenshot specific tab

**Memory Tools** (memoryTools.ts):
- `save_memory`: Store task sequence memory
- `lookup_memories`: Find memories for domain
- `get_all_memories`: Retrieve all memories
- `delete_memory`: Remove specific memory
- `clear_all_memories`: Clear all memories

**Notion Tools** (notionTools.ts) - Optional:
- `notion_search`: Search Notion workspace
- `notion_create_page`: Create new page
- `notion_update_page`: Update existing page
- `notion_query_database`: Query database
- Dynamically added when Notion configured

**Tool Architecture**:
- **BrowserTool** interface: `name`, `description`, `func(input, context)`
- **ToolExecutionContext**: Provides page, agent, and environment access
- **Health checks**: Validates tool functionality
- **Error handling**: Graceful failures with error messages

### Background Module

The Background Module is the central nervous system of the extension, managing all background processes, tab control, agent lifecycle, and inter-component communication.

#### Message Handler (background/messageHandler.ts)

**Core Message Router**: Handles 20+ message types through a centralized handler:

**Primary Messages**:
- `executePrompt`: Execute user instructions with the agent
- `cancelExecution`: Stop current agent execution
- `clearHistory`: Reset conversation and token tracking
- `initializeTab`: Attach debugger to tab and initialize agent
- `switchToTab`: Focus specific tab
- `refreshTab`: Refresh tab connection
- `getTokenUsage`: Fetch current token usage statistics

**Agent Management**:
- `checkAgentStatus`: Verify agent health and status
- `forceResetPlaywright`: Reset Playwright instance
- `approvalResponse`: Handle user approval/rejection
- `reflectAndLearn`: Trigger memory reflection process

**PDF Viewer Messages**:
- `pdfAiChat`: Process PDF AI assistant chat requests
- `togglePdfInterception`: Enable/disable PDF viewer
- `checkPdfUrl`: Verify if URL is a PDF
- `fetchPdfAsBlob`: Fetch PDF file (bypass CORS)

**Broadcast Messages**:
- `tokenUsageUpdated`: Token usage updates to UI
- `updateOutput`: Send messages to UI
- `providerConfigChanged`: Notify config changes
- `tabStatusChanged`: Tab state updates
- `targetCreated/Destroyed/Changed`: Playwright target events
- `tabTitleChanged`: Tab title updates
- `pageDialog/Console/Error`: Page event notifications

**Message Flow**:
1. Validates message type with type guard
2. Routes to specific handler function
3. Handles async operations with proper response
4. Broadcasts updates to all listening components
5. Error handling with graceful degradation

#### Tab Manager (background/tabManager.ts)

**Responsibilities**:
- Chrome DevTools Protocol (CDP) attachment
- Tab lifecycle management
- Playwright page context maintenance
- Multi-window support

**Key Functions**:
- `attachToTab(tabId, windowId)`: Attach debugger to tab
  - Initializes CDP connection
  - Creates Playwright page context
  - Stores tab state by window
- `detachFromTab(tabId)`: Cleanup and detach
- `getTabState(tabId)`: Retrieve current state
- `getWindowForTab(tabId)`: Get window ID
- `forceResetPlaywright()`: Force reset Playwright instance

**State Management**:
- Maintains per-window agent instances
- Tracks tab titles and URLs
- Manages Playwright page contexts
- Handles tab closure cleanup

#### Agent Controller (background/agentController.ts)

**Agent Lifecycle Management**:
- `initializeAgent(tabId)`: Create BrowserAgent instance
  - Gets provider configuration
  - Creates LLM provider
  - Initializes with Playwright page
  - Stores agent by window ID
- `executePrompt(prompt, tabId, streaming, role, selectedTabIds?)`: Execute instruction
  - Retrieves or creates agent
  - Sets up execution callbacks
  - Handles streaming/non-streaming
  - Manages multi-tab analysis
- `cancelExecution(tabId)`: Cancel running execution
- `clearMessageHistory(tabId, windowId)`: Reset conversation
- `getAgentStatus(windowId)`: Check agent health

**Multi-Tab Analysis**:
- Supports analyzing multiple tabs in a single prompt
- Researcher role for comprehensive analysis
- Aggregates information from selected tabs

**Execution Callbacks**:
- `onOutput`: Send messages to UI
- `onTokenUsage`: Update token tracking
- `onRequestApproval`: Request user approval
- `onError`: Handle execution errors

#### Streaming Manager (background/streamingManager.ts)

**Streaming Response Handling**:
- Manages chunked response streaming
- Segments responses for UI display
- Controls streaming state
- Handles streaming errors and fallback

**Features**:
- Progressive message delivery
- Tool call segmentation
- Thinking/reasoning separation
- Buffer management for smooth display

#### Config Manager (background/configManager.ts)

**Singleton Pattern**: Global configuration access

**Responsibilities**:
- Store/retrieve provider configuration
- Validate provider requirements
- Manage API keys and settings
- Notion integration configuration
- PDF viewer settings

**Storage**:
- Uses Chrome storage API (`chrome.storage.sync`)
- Persistent across sessions
- Synced across devices (when enabled)

**Configuration Types**:
- `ProviderConfig`: LLM provider settings
  - Provider name, API key, model ID
  - Base URL, thinking budget
  - Custom model configurations
- `NotionConfig`: Notion integration
  - Bearer token, enabled flag
- `PdfViewerConfig`: PDF settings
  - Interception enabled flag

#### Reflection Controller (background/reflectionController.ts)

**Memory Reflection Process**:
- Analyzes successful task completions
- Extracts learnings and patterns
- Stores memories for future use
- Uses SubAgent for reflection

**Workflow**:
1. Triggered after task completion
2. Reviews conversation history
3. Identifies key action sequences
4. Generates memory summary
5. Stores in IndexedDB via MemoryService

#### Utility Modules

**background/types.ts**:
- Type definitions for all messages
- `BackgroundMessage` union type
- Execution callback interfaces
- Tab state interfaces

**background/utils.ts**:
- `logWithTimestamp()`: Structured logging
- `handleError()`: Error message formatting
- `getBrowserInfo()`: Browser metadata
- Helper functions for common tasks

### UI Module

The UI Module provides the user interface for interacting with the extension.

#### Side Panel

The Side Panel is the main interface for interacting with BrowserOnly. It has been refactored into a modular component structure:

- **sidepanel/SidePanel.tsx**: Main component that orchestrates the UI
  - Composes all UI components
  - Coordinates state and functionality through hooks
  - Manages overall layout and structure

- **sidepanel/types.ts**: Type definitions for the side panel
  - Message types and interfaces
  - Chrome message interfaces
  - Other shared types

- **sidepanel/components/**: Modular UI components
  - **LlmContent.tsx**: Renders LLM content with tool calls
    - Processes and displays markdown content
    - Handles special formatting for tool calls
    - Applies styling to different content elements
  - **ScreenshotMessage.tsx**: Renders screenshot images
    - Displays base64-encoded screenshots
    - Handles image formatting and sizing
  - **MessageDisplay.tsx**: Handles rendering of different message types
    - Manages message filtering
    - Coordinates rendering of system, LLM, and screenshot messages
    - Handles streaming segments
  - **OutputHeader.tsx**: Manages the output section header with toggle controls
    - Provides controls for clearing history
    - Manages system message visibility toggle
  - **PromptForm.tsx**: Handles the input form and submission
    - Manages prompt input
    - Handles form submission
    - Provides cancel functionality during processing
  - **TabStatusBar.tsx**: Displays the current tab information
    - Shows active tab ID and title
    - Indicates connection status
  - **TokenUsageDisplay.tsx**: Displays token usage and provider information
    - Shows current LLM provider and model
    - Tracks input and output tokens
    - Displays estimated cost

- **sidepanel/hooks/**: Custom React hooks for state and functionality
  - **useTabManagement.ts**: Manages tab-related functionality
    - Handles tab connection
    - Tracks tab state
    - Updates tab information
  - **useMessageManagement.ts**: Handles message state and processing
    - Manages message history
    - Controls streaming state
    - Provides message manipulation functions
  - **useChromeMessaging.ts**: Manages communication with the Chrome extension API
    - Listens for Chrome messages
    - Sends messages to background script
    - Handles message processing

#### Options Page

- **options/Options.tsx**: Main component that orchestrates the options UI
  - Manages state and configuration
  - Composes all options components
- **options/index.tsx**: Entry point for the options page
- **options/components/**: Modular UI components for the options page
  - **AboutSection.tsx**: Displays the "About" information
  - **ProviderSelector.tsx**: Handles provider selection
  - **AnthropicSettings.tsx**, **OpenAISettings.tsx**, **GeminiSettings.tsx**, **OllamaSettings.tsx**: Provider-specific settings
  - **OpenAICompatibleSettings.tsx**: Settings for OpenAI-compatible providers
  - **ModelList.tsx**: Manages model list for OpenAI-compatible providers
  - **OllamaModelList.tsx**: Manages custom model list for Ollama provider
  - **ModelPricingTable.tsx**: Displays model pricing information
  - **MemoryManagement.tsx**: Handles memory export/import functionality
  - **SaveButton.tsx**: Manages settings saving functionality
  - **LLMProviderConfig.tsx**: Combines provider selection and settings
  - **ProviderSettings.tsx**: Renders the appropriate provider settings component

### Tracking Module

The Tracking Module handles memory storage, token tracking, and other tracking-related functionality.

- **tracking/memoryService.ts**: Manages storage and retrieval of agent memories
  - Handles IndexedDB operations
  - Provides memory storage and retrieval
  - Includes self-healing database functionality
- **tracking/tokenTrackingService.ts**: Tracks token usage for API calls
- **tracking/screenshotManager.ts**: Manages screenshot storage and retrieval
- **tracking/domainUtils.ts**: Utilities for working with domains

### PDF Viewer Module

The PDF Viewer Module provides a fully-featured PDF viewing experience with advanced text extraction and AI assistant capabilities. It intercepts PDF URLs and provides a custom viewer interface.

#### Core Components

- **content/pdfInterceptor.ts**: Intercepts PDF navigation and redirects to custom viewer
  - Detects PDF file requests
  - Redirects to built-in PDF viewer
  - Preserves original URL for loading

- **public/pdf-viewer.html**: Main PDF viewer HTML interface
  - Based on Mozilla's PDF.js viewer
  - Customized toolbar with text extraction button
  - Tab-based panel for text extraction and AI assistant
  - Dark mode support with theme variables

- **public/pdf-text-extract.js**: Text extraction engine with intelligent filtering
  - **Two-pass extraction algorithm**:
    - First pass: Analyzes all pages to identify repetitive elements
    - Second pass: Extracts text with filtering and structure preservation
  - **Header/Footer Detection**: Identifies and filters repetitive elements
    - Detects text in top/bottom 10% of pages
    - Marks text appearing on 30%+ of pages as repetitive
    - Filters common page number patterns
  - **Paragraph Detection**: Preserves document structure
    - Detects paragraph breaks based on vertical spacing
    - Maintains line breaks within paragraphs
    - Uses font height and position for intelligent spacing
  - **Region Filtering**: Focuses on main content
    - Excludes headers (top 10% of page)
    - Excludes footers and page numbers (bottom 10%)
    - Extracts only body content (middle 80%)
  - **Export Options**:
    - Copy as plain text (strips markdown)
    - Copy as markdown (preserves formatting)
  - **Progress Tracking**: Visual feedback during extraction

- **public/pdf-ai-assistant.js**: AI assistant for PDF document analysis
  - **Chat Interface**: Interactive Q&A with PDF content
    - Send custom questions about document
    - Context-aware responses using extracted text
    - Message history management
  - **Summarization Features**:
    - Summarize current page
    - Summarize entire document
    - Extract key insights
  - **Integration with Background Service**:
    - Communicates via chrome.runtime.sendMessage
    - Uses SimpleChatAgent for LLM interactions
    - Passes extracted text as context
  - **Tab Management**: Switch between text extraction and AI chat
  - **Session State**: Preserves chat history during session

- **public/pdf-text-extract.css**: Styling for PDF viewer enhancements
  - **Dark Mode Support**: Uses CSS variables for theme adaptation
    - `--main-color`, `--body-bg-color`, `--field-bg-color`
    - `--separator-color`, `--link-color`
    - Seamless adaptation to PDF.js theme settings
  - **Tab Navigation**: Styled tabs for switching between features
  - **Message Bubbles**: Modern chat interface styling
    - User messages: Field background with borders
    - Assistant messages: Accent color background
    - Proper contrast in all themes
  - **Action Buttons**: Gradient-styled buttons for actions
    - Summarize page: Green gradient
    - Summarize all: Pink/yellow gradient
    - Clear chat: Gray gradient
  - **Responsive Design**: Adapts to different screen sizes

- **public/images/**: Icon assets for PDF viewer
  - Toolbar icons (search, bookmark, download, etc.)
  - Tree navigation icons (collapsed/expanded)
  - Loading spinner animation

#### Text Extraction Algorithm

The text extraction uses a sophisticated algorithm to produce clean, structured output:

1. **Collection Phase**:
   - Iterates through all pages
   - Collects text items with position metadata
   - Tracks page dimensions for normalization

2. **Analysis Phase**:
   - Identifies repetitive elements across pages
   - Detects headers/footers by position consistency
   - Recognizes page number patterns

3. **Extraction Phase**:
   - Filters out identified repetitive elements
   - Groups text into paragraphs using spacing heuristics
   - Preserves semantic structure with proper line breaks

4. **Post-Processing**:
   - Formats as markdown for readability
   - Renders in styled container
   - Provides copy options

#### AI Assistant Integration

The AI assistant provides intelligent document analysis:

1. **Context Injection**: Extracted text is passed as context to LLM
2. **System Prompt**: Specialized prompt for PDF document assistance
3. **Streaming Responses**: Real-time response display
4. **Tool Integration**: Leverages main agent's LLM provider configuration

#### PDF Interception Flow

1. User navigates to a PDF URL
2. Content script intercepts the navigation
3. Redirects to custom viewer: `pdf-viewer.html?file=<url>`
4. PDF.js loads and displays the document
5. User can extract text or chat with AI assistant

## Data Flow

1. User enters a prompt in the Side Panel
2. The prompt is sent to the Background Module
3. The Background Module initializes the Agent with the configured LLM provider
4. The Agent processes the prompt and executes browser actions:
   - TokenManager handles token estimation and history trimming
   - PromptManager generates the system prompt
   - ExecutionEngine manages the execution flow
   - ToolManager provides access to browser tools
   - MemoryManager integrates relevant memories
   - ErrorHandler manages error conditions
5. Results are streamed back to the Side Panel
6. The Side Panel displays the results to the user

## Component Relationships

- The Side Panel communicates with the Background Module through Chrome messaging
- The Background Module manages the Agent and coordinates its actions
- The Agent Core coordinates the specialized components (TokenManager, ToolManager, etc.)
- Each specialized component handles a specific aspect of the agent's functionality
- The Agent uses tools to interact with the browser
- The Tracking Module provides persistence and monitoring services
- The Options Page configures the extension settings used by the Background Module
- The Models Module provides a flexible interface for multiple LLM providers
- The PDF Viewer Module operates independently but leverages the Background Module's LLM configuration
- The PDF Interceptor (content script) redirects PDF navigations to the custom viewer
- The PDF AI Assistant communicates with the Background Module for LLM interactions

## Provider System

## Ollama Integration

The Ollama integration allows users to connect to locally running Ollama models:

1. **Browser Compatibility**: Uses the browser-compatible version of the Ollama library
2. **API Key Optional**: Unlike other providers, Ollama doesn't require an API key
3. **CORS Configuration**: Requires CORS to be enabled on the Ollama server
4. **Custom Models**: Supports user-defined custom models with configurable context windows
5. **Configuration Requirements**: Requires both a base URL and at least one custom model to be configured
6. **Privacy-Focused**: Provides a privacy-focused alternative to cloud-based LLM providers

The provider system follows these design patterns:

1. **Interface Segregation**: Each provider implements a common interface
2. **Factory Pattern**: A factory function creates the appropriate provider
3. **Adapter Pattern**: Each provider adapts its specific API to the common interface
4. **Strategy Pattern**: Different providers can be swapped at runtime
5. **Singleton Pattern**: The ConfigManager provides a single point of access to configuration

## File Organization

The project follows a modular structure with clear separation of concerns:

- Each module has its own directory
- Components are organized by functionality
- Types are defined close to where they are used
- Hooks encapsulate related state and functionality
- Utility functions are separated into dedicated files

## Design Principles

1. **Separation of Concerns**: Each component and module has a single responsibility
2. **Modularity**: Components and modules can be developed and tested independently
3. **Reusability**: Common functionality is extracted into reusable components and hooks
4. **Type Safety**: TypeScript is used throughout the project for type safety
5. **Maintainability**: Code is organized to be easy to understand and maintain
6. **Resilience**: Self-healing mechanisms are implemented for critical components
7. **Lifecycle Management**: Extension installation, updates, and uninstallation are properly handled
8. **Provider Abstraction**: LLM providers are abstracted behind a common interface
