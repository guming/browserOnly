# PDF Viewer UI/UX Optimization Task Breakdown

> Scope: visual and interaction convergence for the BrowserOnly PDF reader.
>
> Direction: a quiet research reader with a light-gray canvas, white document surface, BrowserOnly blue as the single accent, restrained borders, and low-noise AI controls.

## 1. Purpose

This document turns the PDF Viewer UI/UX plan into independently trackable implementation tasks. The first release focuses on visual consistency, layout stability, panel interaction, accessibility, and verification. Bookmarks, annotations, text-selection actions, and page-cited AI answers remain out of scope.

## 2. Status and priority conventions

### Requirement

- **Required:** must be complete for the milestone listed in the task.
- **Optional:** useful enhancement, but not part of the P0/P1 release gate.

### Priority

- **P0:** visible structural or interaction issue that blocks a coherent reader experience.
- **P1:** responsive, accessibility, lifecycle, or verification hardening.
- **P2:** low-risk reader polish that can follow the first release.

### Tracking status

Every task uses exactly one status:

- `Not started`
- `In progress`
- `Blocked`
- `In review`
- `Done`

A task is `Done` only after its acceptance criteria and the relevant visual verification are complete.

## 3. Milestone overview

| Milestone | Scope | Tasks | Exit condition |
| --- | --- | --- | --- |
| M1 | Visual foundation and outer shell | PV01–PV03 | Shell, tokens, toolbar hierarchy, and fixed-height issues are addressed. |
| M2 | Assistant panel and AI experience | PV04–PV06 | Text extraction and AI panels share one visual and interaction language. |
| M3 | Responsive, accessible, verified reader | PV07–PV10 | P0/P1 behavior passes build checks and Chrome viewport acceptance. |
| M4 | Optional reader polish | PV11–PV12 | Appearance preferences and low-frequency help are independently shippable. |

## 4. Dependency overview

```text
PV01
├─► PV02 ─► PV07
├─► PV03 ─► PV04
└─► PV04
    ├─► PV05 ─► PV08
    ├─► PV06 ─► PV09
    └──────────► PV07

PV07/PV08/PV09 ─► PV10 ─► PV11/PV12
```

## 5. M1: Visual foundation and outer shell

### PV01 — Establish PDF Viewer design tokens

- **Requirement:** Required
- **Priority:** P0
- **Status:** In review
- **Dependencies:** None
- **Target files:** `src/index.css`, `public/pdf-text-extract.css`
- **Description:** Reuse the existing BrowserOnly palette, font stack, border, radius, focus, shadow, and spacing language. Define `--bo-pdf-*` tokens for the React shell and static PDF viewer. Keep PDF.js vendor CSS intact and apply custom overrides after it.
- **Expected outcome:** All custom PDF surfaces use one restrained visual vocabulary.
- **Acceptance criteria:**
  - No custom PDF surface uses blue-green, pink-yellow, or purple gradients.
  - Primary accent is BrowserOnly blue `#315a78` with `#274a64` hover.
  - Adjacent light surfaces remain distinguishable through background steps, borders, or documented elevation.
  - Custom buttons use the shared small radius and visible focus treatment.

### PV02 — Rebuild the SidePanel PDF shell

- **Requirement:** Required
- **Priority:** P0
- **Status:** In review
- **Dependencies:** PV01
- **Target files:** `src/sidepanel/components/PdfViewer.tsx`
- **Description:** Replace the empty document placeholder with a real PDF icon, compact title/source header, restrained action buttons, and a full-height flex content region. Preserve copy URL, open in new tab, download, close, and retry behavior.
- **Expected outcome:** The outer reader feels like a document workspace rather than a framed iframe placeholder.
- **Acceptance criteria:**
  - Header title is 14px–16px and long titles do not break the action group.
  - Loading state uses a document icon, progress cue, and concise status copy.
  - Error state offers Try again and Open in new tab without an empty 128px placeholder.
  - iframe height is derived from the flex layout, not a fixed 500px value.
  - Ordinary and expanded modes do not create avoidable blank space or nested scrolling.

### PV03 — Clarify the PDF.js toolbar hierarchy

- **Requirement:** Required
- **Priority:** P0
- **Status:** In review
- **Dependencies:** PV01
- **Target files:** `public/pdf-viewer.html`, `public/pdf-text-extract.css`
- **Description:** Make the custom reading assistant entry understandable, preserve search/page/zoom as primary controls, keep low-frequency actions in the secondary toolbar, and align custom icon states with PDF.js.
- **Expected outcome:** The toolbar communicates reading actions in priority order without adding visual noise.
- **Acceptance criteria:**
  - Reading assistant button has a meaningful title, accessible name, and expanded state.
  - Custom controls use SVG or mask icons rather than emoji.
  - Toolbar does not clip or overlap at 1280px, 768px, or 375px widths.
  - Search, page navigation, and zoom remain discoverable.

## 6. M2: Assistant panel and AI experience

### PV04 — Rebuild the assistant panel container and Tab semantics

- **Requirement:** Required
- **Priority:** P0
- **Status:** In review
- **Dependencies:** PV01, PV03
- **Target files:** `public/pdf-viewer.html`, `public/pdf-text-extract.css`, `public/pdf-text-extract.js`
- **Description:** Turn the right-side assistant into a bounded dock/overlay with a responsive width, toolbar-relative positioning, backdrop, Escape handling, focus restoration, and correct dialog/tab semantics. Preserve `pdfTextPanelOpen`.
- **Expected outcome:** Opening the assistant feels intentional and does not leave the user unsure how to return to the document.
- **Acceptance criteria:**
  - Panel width is capped at 420px and becomes full-width on narrow screens.
  - Positioning uses `var(--toolbar-height, 32px)` instead of a hard-coded top offset.
  - Backdrop click and Escape close the panel.
  - Focus moves into the panel on open and returns to the trigger on close.
  - Tabs expose `tablist`, `tab`, `tabpanel`, `aria-selected`, and keyboard navigation.

### PV05 — Improve the extracted-text reading surface

- **Requirement:** Required
- **Priority:** P0
- **Status:** In review
- **Dependencies:** PV04
- **Target files:** `public/pdf-viewer.html`, `public/pdf-text-extract.css`
- **Description:** Reduce paper padding, remove decorative emoji and heavy shadows, use lightweight page separators, and consolidate copy actions into one primary action with a secondary menu.
- **Expected outcome:** Extracted text remains readable inside a 400px panel and does not look like a second unrelated product.
- **Acceptance criteria:**
  - Body text keeps a comfortable reading width at 400px.
  - Page headings use typography and dividers instead of emoji markers.
  - Copy text is the primary action; Markdown is available through the secondary menu.
  - Long paragraphs, code, and localized text do not overflow horizontally.
  - Empty, loading, error, and copied states have distinct visible feedback.

### PV06 — Rebuild the AI Assistant conversation layout

- **Requirement:** Required
- **Priority:** P0
- **Status:** In review
- **Dependencies:** PV04
- **Target files:** `public/pdf-text-extract.css`, `public/pdf-ai-assistant.js`, `public/pdf-viewer.html`
- **Description:** Separate user and assistant message alignment and treatment, replace high-saturation action buttons with quiet shortcuts, keep the composer pinned, and standardize loading/error/disabled feedback without changing the existing `pdfAiChat` message contract.
- **Expected outcome:** Users can scan the conversation, understand who said what, and continue after an error.
- **Acceptance criteria:**
  - User messages align right and assistant messages align left.
  - Each message has a visible role label and distinct surface treatment.
  - Summarize page is the primary shortcut; summarize document and clear chat are secondary.
  - Composer supports Enter to send and Shift+Enter for a newline.
  - Loading and error states do not remove the ability to type or retry.

## 7. M3: Responsive, accessible, and verified reader

### PV07 — Fix sizing, scrolling, and responsive behavior

- **Requirement:** Required
- **Priority:** P1
- **Status:** In progress
- **Dependencies:** PV02, PV04, PV05, PV06
- **Target files:** `src/sidepanel/components/PdfViewer.tsx`, `public/pdf-text-extract.css`
- **Description:** Consolidate scroll ownership, remove fixed height assumptions, use a full-width sheet on narrow screens, and keep custom targets at least 40px high.
- **Expected outcome:** The reader remains usable in SidePanel and expanded layouts without clipped content or competing scrollbars.
- **Acceptance criteria:**
  - 360px, 420px, 768px, and desktop widths have no horizontal overflow.
  - Only the intended PDF canvas, panel content, or chat message area scrolls.
  - Long titles, Chinese strings, narrow buttons, and long AI responses remain usable.
  - Expanded mode uses available viewport height rather than fixed offset calculations.

### PV08 — Complete extraction lifecycle feedback

- **Requirement:** Required
- **Priority:** P1
- **Status:** In review
- **Dependencies:** PV05
- **Target files:** `public/pdf-text-extract.js`, `public/pdf-text-extract.css`
- **Description:** Keep the existing two-pass extraction but show a stable pending state, page-level progress, retryable errors, and a real no-readable-text state. Cache completed extraction without flashing an empty paper surface.
- **Expected outcome:** Long extraction is understandable and never looks like an accidental empty result.
- **Acceptance criteria:**
  - Pending state is visible before extraction starts rendering.
  - Progress reports current page, total pages, and percentage.
  - No-readable-text PDFs show an explicit empty state.
  - Failed extraction leaves a visible retry path.
  - Completed extraction is reused without duplicate loading flashes.

### PV09 — Complete accessibility and keyboard interaction

- **Requirement:** Required
- **Priority:** P1
- **Status:** In review
- **Dependencies:** PV04, PV06
- **Target files:** `public/pdf-viewer.html`, `public/pdf-text-extract.js`, `public/pdf-text-extract.css`
- **Description:** Add accessible names, live-region semantics, focus rings, keyboard panel navigation, reduced-motion behavior, and stable focus restoration.
- **Expected outcome:** The custom viewer controls are operable without a mouse and communicate state changes to assistive technology.
- **Acceptance criteria:**
  - Icon-only buttons have accessible names.
  - Panel, tabs, textarea, loading, and toast states expose appropriate semantics.
  - Keyboard users can open, switch, copy, send, and close without focus loss.
  - `prefers-reduced-motion` disables nonessential motion.
  - Focus order and contrast are verified in the rendered surface.

### PV10 — Establish the PDF Viewer visual acceptance matrix

- **Requirement:** Required
- **Priority:** P1
- **Status:** In progress
- **Dependencies:** PV07, PV08, PV09
- **Target files:** `docs/pdf-viewer-ui-optimization-tasks.md`
- **Description:** Record the real Chrome extension acceptance matrix for PDF content, panel states, AI states, viewport sizes, themes, motion preferences, and keyboard operation.
- **Expected outcome:** P0/P1 UI work is marked Done only with evidence from the rendered extension.
- **Acceptance criteria:**
  - Matrix covers single-page, multi-page, long-title, no-text, failed extraction, failed AI, and unconfigured-model cases.
  - Matrix covers 375px, 420px, 768px, and 1280px widths.
  - Matrix covers light mode, dark mode, reduced motion, and keyboard-only use.
  - Build, lint, unit tests, diff check, and manual visual checks are recorded.

## 8. M4: Optional reader polish

### PV11 — Add reading appearance preferences

- **Requirement:** Optional
- **Priority:** P2
- **Status:** Not started
- **Dependencies:** PV10
- **Target files:** `public/pdf-viewer.html`, `public/pdf-text-extract.css`, `public/pdf-text-extract.js`
- **Description:** Add light, dark, and sepia reading backgrounds with persisted preference without changing PDF content.
- **Expected outcome:** Long reading sessions can use a preferred canvas treatment while keeping text, selection, and AI surfaces legible.
- **Acceptance criteria:**
  - Preference can be changed without reloading the document.
  - Preference persists for the next PDF viewer session.
  - Text layer, selected text, controls, and assistant panel preserve contrast.

### PV12 — Consolidate low-frequency actions and shortcut help

- **Requirement:** Optional
- **Priority:** P2
- **Status:** Not started
- **Dependencies:** PV10
- **Target files:** `public/pdf-viewer.html`, `public/pdf-text-extract.css`
- **Description:** Keep the core toolbar compact by grouping low-frequency actions and exposing a small keyboard-shortcut help surface.
- **Expected outcome:** The first viewport stays focused while advanced actions remain discoverable.
- **Acceptance criteria:**
  - No new core toolbar button is added for a low-frequency action.
  - Help surface is keyboard reachable and dismissible with Escape.
  - Narrow layouts keep the grouped actions accessible.

## 9. Compatibility contract

- No new background API, Chrome message action, database, or storage schema is required.
- Preserve these DOM IDs: `extractTextButton`, `textExtractionPanel`, `aiChatMessages`, `aiChatInput`, and `aiSendBtn`.
- Preserve the `pdfTextPanelOpen` localStorage key.
- Preserve the `pdfAiChat` request and response payload shape.
- New CSS classes, ARIA attributes, and wrapper elements are internal PDF Viewer contracts.
- Full localization is deferred; this pass keeps the existing English UI copy while removing emoji-based labels.

## 10. Verification commands

```text
npm run build
npm run lint
npm test
git diff --check
node --check public/pdf-text-extract.js
node --check public/pdf-ai-assistant.js
```

## 11. Definition of Done

A Required task is complete only when its acceptance criteria are demonstrably satisfied, the relevant automated checks pass, and the rendered Chrome extension has been checked at the required viewport and state combinations. A code-only change is `In review` until visual verification evidence is recorded.
