import { DynamicTool } from "langchain/tools";
import type { Page } from "playwright-crx";
import { ToolFactory } from "./types";
import { installDialogListener, lastDialog, resetDialog, withActivePage } from "./utils";
import { parseTarget, resolveTarget, readTargetState, targetFailure, TargetError, validateTarget, type ClickVerification } from "./semanticLocator";

export const browserClick: ToolFactory = (page: Page) =>
  new DynamicTool({
    name: "browser_click",
    description:
      'Click a unique visible target. Legacy CSS/text strings supported (text is exact). JSON: {text}|{role,name?,scope?,exact?}|{selector,scope?}; optional verify:{target?: target object,state:"checked"|"selected"|"expanded"|"visible",expected:boolean,timeoutMs?:0..10000}. Ambiguous matches return at most five candidates without clicking. Click dispatch alone does not verify task success.',
    func: async (input: string) => {
      let dispatched = false;
      try {
        const raw = input.trimStart().startsWith('{') ? JSON.parse(input) : undefined;
        const target = parseTarget(input);
        const verify = raw?.verify as ClickVerification | undefined;
        if (verify !== undefined) {
          if (!verify || typeof verify !== 'object' || !['checked', 'selected', 'expanded', 'visible'].includes(verify.state) || typeof verify.expected !== 'boolean' || (verify.timeoutMs !== undefined && (!Number.isInteger(verify.timeoutMs) || verify.timeoutMs < 0 || verify.timeoutMs > 10000))) throw new TargetError('INVALID_ARGUMENT', 'Invalid verification condition');
          if (verify.target) validateTarget(verify.target);
        }
        return await withActivePage(page, async active => {
          const locator = await resolveTarget(active, target, true);
          const before = await readTargetState(locator);
          if (verify && !verify.target && verify.state !== 'visible' && before[verify.state] === verify.expected) return JSON.stringify({ ok: true, data: { dispatched: false, verified: true, alreadySatisfied: true, state: before } });
          if (before.disabled) throw new TargetError('TARGET_DISABLED', 'The unique target is disabled');
          // Never retry a click after dispatch begins: an exception can occur after side effects.
          dispatched = true;
          await locator.click({ timeout: 5000 });
          if (!verify) return JSON.stringify({ ok: true, data: { dispatched: true, verified: false } });
          const deadline = Date.now() + (verify.timeoutMs ?? 3000);
          let state: Record<string, unknown> | undefined;
          do {
            try {
              state = await readTargetState(await resolveTarget(active, verify.target ?? target));
              if (state[verify.state] === verify.expected) return JSON.stringify({ ok: true, data: { dispatched: true, verified: true, state } });
            } catch (error) {
              if (!(error instanceof TargetError) || error.code !== 'TARGET_NOT_FOUND') throw error;
              if (verify.state === 'visible' && !verify.expected) return JSON.stringify({ ok: true, data: { dispatched: true, verified: true, state: { visible: false } } });
            }
            if (Date.now() >= deadline) break;
            await new Promise(resolve => setTimeout(resolve, Math.min(100, Math.max(0, deadline - Date.now()))));
          } while (Date.now() <= deadline);
          return JSON.stringify({ ok: false, data: { dispatched: true, verified: false, state }, error: { code: 'VERIFICATION_UNKNOWN', message: 'Click dispatched, but the requested state was not verified. Inspect the state before any further action; do not automatically click again.', repairable: false } });
        });
      } catch (error) {
        return targetFailure(error instanceof SyntaxError ? new TargetError('INVALID_ARGUMENT', error.message) : error, dispatched);
      }
    },
  });

  export const browser_select: ToolFactory = (page: Page) =>
    new DynamicTool({
      name: "browser_select",
      description:
        "click the select  and choose the option base on the input item. Input may be a CSS selector or literal text to match on the page.",
      func: async (input: string) => {
        try {
          console.log("browser_select input",input);
          return await withActivePage(page, async (activePage) => {
            if (/[#.\[]/.test(input)) {
              await activePage.selectOption(input,'Relevance');
              return `Clicked selector: ${input}`;
            }
            await activePage.selectOption(input,'-submitted_date');
            return `Clicked element containing text: ${input}`;
          });
        } catch (error) {
          return `Error clicking '${input}': ${
            error instanceof Error ? error.message : String(error)
          }`;
        }
      },
    });

export const browserType: ToolFactory = (page: Page) =>
  new DynamicTool({
    name: "browser_type",
    description:
      "Type text. Format: selector|text (e.g. input[name=\"q\"]|hello)",
    func: async (input: string) => {
      try {
        return await withActivePage(page, async (activePage) => {
          const [selector, text] = input.split("|");
          if (!selector || !text) {
            return "Error: expected 'selector|text'";
          }
          await activePage.fill(selector, text);
          return `Typed "${text}" into ${selector}`;
        });
      } catch (error) {
        return `Error typing into '${input}': ${
          error instanceof Error ? error.message : String(error)
        }`;
      }
    },
  });

export const browserHandleDialog: ToolFactory = (page: Page) => {
  // Install dialog listener with the active page
  installDialogListener(page);

  return new DynamicTool({
    name: "browser_handle_dialog",
    description:
      "Accept or dismiss the most recent alert/confirm/prompt dialog.\n" +
      "Input `accept` or `dismiss`. For prompt dialogs you may append `|text` to supply response text.",
    func: async (input: string) => {
      try {
        if (!lastDialog)
          return "Error: no dialog is currently open or was detected.";
        const [action, text] = input.split("|").map(s => s.trim().toLowerCase());
        if (action !== "accept" && action !== "dismiss")
          return "Error: first part must be `accept` or `dismiss`.";
        if (action === "accept")
          await lastDialog.accept(text || undefined);
        else await lastDialog.dismiss();
        const type = lastDialog.type();
        resetDialog();
        return `${action === "accept" ? "Accepted" : "Dismissed"} ${type} dialog.`;
      } catch (err) {
        return `Error handling dialog: ${
          err instanceof Error ? err.message : String(err)
        }`;
      }
    },
  });
};
