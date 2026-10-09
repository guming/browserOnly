# Task Automation replay v2

New Operator recordings retain the complete original instruction and successful replay steps. `replayFormat: steps-v2` opts into Automation-specific locator execution and bounded selector repair. Existing recordings and office templates remain on their previous path. Operator ExecutionEngine and interactionTools are unchanged.

## Behavior

- Preparation and screenshots are omitted from executable steps. Reads and repeated writes are retained.
- Entry URL is inferred from the first page-dependent event. A prior page read preserves the source dependency.
- New-tab startup performs entry navigation once; the run snapshot omits a matching first navigation step.
- Click/type require one visible enabled target. Ambiguity fails. Repaired selectors must uniquely match visible identifying text or aria-label.
- Each step can request one repair, with at most three requests per run. Repair calls do not use Operator conversation state.
- Uncertain actions are checked against recorded postconditions. Missing verification stops execution without replaying the action.
- Successful repairs generate suggestion versions. Activation is explicit and transactional. Old-format repair activation remains unchanged.
- Final assertions distinguish verified results from merely completed steps. A previous successful click does not establish product identity or business success.
- Existing tasks can explicitly create a replay version in the detail view; users supply the full instruction and review the origin/steps.

## Reproducible checks

Run `npx jest tests/workflows tests/unit/agent/tools tests/office tests/unit/agent/approvalManager.test.ts --runInBand --silent` and `npm run build`.

Run `node scripts/prepare-replay-browser-check.mjs`, serve the printed temporary directory on localhost using `python3 -m http.server 8767 --bind 127.0.0.1 --directory <directory>`, then open `http://127.0.0.1:8767/check.html`. Use a fresh localhost port/browser origin for each migration check (the fixture initially opens schema v1). The page must show seven PASS results for database compatibility, atomic activation and rollback, trace ordering/redaction, actual DOM search/cart execution and ambiguity rejection. This uses a DOM adapter, not a running extension.

## Runtime acceptance still required

Reload the built extension in a test browser. Run Operator navigation/type/click/screenshot/approval/cancel; then run and cancel an Automation and confirm Operator remains usable. Record a JD task from an unrelated source page, confirm its saved entry is JD, run it from a different tab and inspect the cart result and model-call count. Login/CAPTCHA must be completed by the user. Automated local tests do not prove a live JD cart change.

Screenshot references are transient. Raw HTML/images are not persisted in execution traces. Trace storage failure is explicitly marked in the run.
