import {
  createModePrompts,
  ModePrompts,
  MULTITAB_OPERATION_INSTRUCTIONS,
  CANONICAL_SEQUENCE,
  MEMORY_FORMAT,
} from "./prompts";
import { BrowserTool } from "./tools/types";

/**
 * PromptManager handles system prompt generation and prompt templates.
 */
export class PromptManager {
  private tools: BrowserTool[];
  private modePrompts: ModePrompts;
  
  // Store the current page context
  private currentPageContext: string = "";

  constructor(tools: BrowserTool[]) {
    this.tools = tools;
    this.modePrompts = createModePrompts();
  }
  
  /**
   * Set the current page context
   */
  setCurrentPageContext(url: string, title: string): void {
    this.currentPageContext = `You are currently on ${url} (${title}).
    
If the user's request seems to continue a previous task (like asking to "summarize options" after a search), interpret it in the context of what you've just been doing.

If the request seems to start a new task that requires going to a different website, you should navigate there on the new tab.

Use your judgment to determine whether the request is meant to be performed on the current page or requires navigation elsewhere.

Remember to follow the verification-first workflow: navigate → observe → analyze → act

## Special Commands:

- If request starts with:
  • #s-book → Call <tool>lookup_memories</tool> with the domain libgen.li  
  • #s-paper → Call <tool>lookup_memories</tool> with the domain arxiv.org  
  • #s-seed → Call <tool>lookup_memories</tool> with the domain 1lou.pro  
  • #f-movies → Call <tool>lookup_memories</tool> with the domain iyf.tv  
  • #f-sports → Call <tool>lookup_memories</tool> with the domain 88zhibo.tv
  • #scrape → Call <tool>start_extract</tool>

If a request matches any Special Command, skip planning and tool selection. Immediately emit the predefined tool call with its fixed arguments.`;

  }
  
  /**
   * Build the fixed system prompt for the agent.
   */
 getSystemPrompt(mode: string): string {
  const basePrompt = this.modePrompts[mode];
  console.log("basePrompt is ", basePrompt, mode);

  // If mode is 'munger', return only the basePrompt
  if (mode === 'munger') {
    return basePrompt;
  }

  // For all other modes, include the full system prompt with tools and instructions
  const toolDescriptions = this.tools
    .map(t => `${t.name}: ${t.description}`)
    .join("\n\n");
  
  // Include the current page context if available
  const pageContextSection = this.currentPageContext ?
    `\n\n## CURRENT PAGE CONTEXT\n${this.currentPageContext}\n` : "";

  return `${basePrompt}

You have access to these tools:

${toolDescriptions}${pageContextSection}

────────────────────────────────────────
${MULTITAB_OPERATION_INSTRUCTIONS}

────────────────────────────────────────
${CANONICAL_SEQUENCE}

────────────────────────────────────────
${MEMORY_FORMAT}

────────────────────────────────────────
Always wait for each tool result before the next step.  
Think step-by-step and finish with a concise summary.`;
}
  
  /**
   * Update the tools used by the PromptManager
   */
  updateTools(tools: BrowserTool[]): void {
    this.tools = tools;
  }
}
