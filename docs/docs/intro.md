---
sidebar_position: 1
---

# Introduction to BrowserOnly

Welcome to the BrowserOnly documentation. BrowserOnly is an open-source Chrome extension for understanding and operating the web with natural language.

## What is BrowserOnly?

BrowserOnly runs as an extension in your browser. It uses the LLM provider you configure, keeps browser sessions and local feature data in browser storage, and can use Playwright-based tools to carry out requested actions.

## Two ways to work

**Operator mode** is for action: inspect pages, navigate, click, type, scroll, manage tabs, and complete multi-step tasks. BrowserOnly can request approval before sensitive actions.

**Ask mode** is for understanding: ask about the current tab, use Books for a standalone conversation, or choose an Expert for structured analysis. Ask mode does not automatically inspect the active tab unless the selected context calls for it.

Since BrowserOnly runs entirely within your browser (with the exception of the LLM), it can interact with logged-in websites, like your social media accounts or email, without compromising security or requiring backend infrastructure. This makes it more convenient for personal use than other "browser use" type products out there.

## Key Features

- **Natural Language Control**: Control your browser with simple, natural language commands
- **Multiple LLM Support**: Configure Anthropic, OpenAI, Gemini, DeepSeek, Ollama, or an OpenAI-compatible provider
- **Page Translation**: Translate full pages or selected text in bilingual, translation-only, or original mode
- **PDF Viewer**: Extract structured text, copy Markdown, summarize pages, and ask questions about PDFs
- **Token Tracking**: Tracks **token use** and **price** so you know how much you're spending on each task
- **Browser Tools**: Has access to a wide range of browser tools for interacting and understanding browser state
- **Playwright Integration**: Uses **Playwright** in the background which is a robust browser automation tool
- **Memory Feature**: Captures useful tool use sequences and stores them locally to make future use more efficient
- **User Approval**: The agent knows when to ask for user's approval, e.g. for purchases or posting updates on social media

## Use Cases

- **Social media butler**: Checks your social media accounts, summarizes notifications and messages, and helps you respond.
- **News curator**: Gathers and summarizes the latest headlines from your preferred news sources and blogs, giving you a quick, personalized briefing.
- **Personal assistant**: Helps with everyday tasks like reading and sending emails and messages, booking flights, finding products, and more.
- **Research assistant**: Assists with deep dives into topics like companies, job listings, market trends, and academic publications by gathering and organizing information.
- **Knowledge bookmarking & summarization**: Quickly summarizes articles, extracts key information, and saves useful insights for later reference.

## Installation

1. Clone the repository
   ```bash
   git clone https://github.com/gumingcn/BrowserOnly.git
   cd BrowserOnly
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Build the extension
   ```bash
   npm run build
   ```

4. Load the extension in Chrome:
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" and select the `dist` directory
   - Set your LLM API key(s) for Anthropic, OpenAI, Gemini, and/or configure Ollama in the options page that pops up

## Basic Usage

1. Click the BrowserOnly icon in your Chrome toolbar to open the side panel
2. Type your instruction (e.g., *"Go to Google, search for Cicero, and click the first result"*)
3. Hit Enter and watch BrowserOnly go to work 🤖️

## Next Steps

- Check out the [Architecture](./architecture.md) to understand how BrowserOnly works
- Read the [User Guide](./user-guide.md) to learn how to use BrowserOnly effectively
- Read the [Contributing Guide](./contributing.md) if you want to contribute to the project
