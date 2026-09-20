# Web Monitoring P0 Task Breakdown

> Source design: [`web-monitoring-p0-design.md`](./web-monitoring-p0-design.md)

## 1. Purpose

This document turns the approved Web Monitoring P0 design into discrete, trackable implementation tasks. Each task has one primary outcome, explicit dependencies, required/optional status, and verifiable completion criteria.

The task list defines three independently mergeable milestones:

- **M1 — Text Monitor MVP:** a complete local text-monitoring loop;
- **M2 — Typed Monitoring:** price and stock monitoring added without migrating M1 data;
- **M3 — Full P0:** page-text monitoring, persisted screenshot evidence, privacy documentation, and release validation.

M1 is independently usable. M2 is independently releasable after M1. M3 completes every promise in the P0 design.

## 2. Status and priority conventions

### Requirement

- **Required:** must be complete for the milestone listed in the task.
- **Optional:** useful enhancement, but not part of the P0 release gate and must not block required work.

### Tracking status

Every task should use exactly one status:

- `Not started`
- `In progress`
- `Blocked`
- `In review`
- `Done`

A task is `Done` only when its expected outcome and acceptance criteria are both satisfied. Creating files or opening a PR is not sufficient.

## 3. Dependency overview

### Current implementation progress

| Tasks | Status | Evidence |
| --- | --- | --- |
| T01–T14 | In review | Core modules, background integration, permissions, and Side Panel flows implemented. |
| T15 | In progress | Deterministic fixture and core/locator unit tests added; browser-backed integration coverage remains. |
| T16 | Blocked | Built `dist/` starts in an extension-enabled Chrome smoke session and the fixture is reachable; the automation driver cannot expose Side Panel UI, so clean-profile manual acceptance remains required. |
| T17–T20 | In review | Price/stock normalizers, diff/trigger behavior, typed Runner path, UI controls, and deterministic tests implemented. |
| T21–T24 | In review | Page-text extraction/diff, baseline/change screenshots, evidence UI, and bounded retention implemented. |
| T25 | In review | Local-only execution, prohibited-field rejection, bounded notification content, and sanitized errors implemented. |
| T26 | In progress | Monitoring suites and build pass; full clean-profile and scale verification remain. |
| T27 | In review | README, privacy policy, and user guide updated with permissions and operating limits. |
| T28 | Blocked | Requires the planned 24-hour real-browser soak and rollback drill; the extension-enabled fixture smoke test does not substitute for this gate. |
| O01–O03 | Not started | Explicitly outside the P0 critical path. |

```text
T01 Contract
 ├─► T02 Store ───────────────┐
 ├─► T03 Locator metadata ─► T04 Picker ─► T10 Create flow
 ├─► T05 Text normalizer ─┐                    │
 └─► T06 Text diff ───────┼─► T07 Trigger ────┤
                         │                    │
T02 ─► T08 Runner ───────┴─► T09 Scheduler ──┤
                                              ▼
                             T11 Background integration
                                      │
                  ┌───────────────────┴───────────────────┐
                  ▼                                       ▼
             T12 List UI                            T13 Detail UI
                  └───────────────────┬───────────────────┘
                                      ▼
                         T14 Failure handling
                                      ▼
                       T15 M1 automated verification
                                      ▼
                         T16 M1 manual acceptance

T05/T06/T07/T08 ─► T17 Price ─┐
                               ├─► T19 Typed UI ─► T20 M2 verification
T05/T06/T07/T08 ─► T18 Stock ─┘

T05/T06/T08 ─► T21 Page text ───────────────┐
T02/T08 ─────► T22 Screenshot persistence ──┼─► T23 Diff evidence UI
T02 ─────────► T24 Retention cleanup ────────┤
T11/T14 ─────► T25 Privacy hardening ────────┤
                                               ▼
                              T26 Full P0 automated verification
                                               ▼
                                   T27 Release documentation
                                               ▼
                                    T28 24-hour release soak
```

The graph is acyclic. Tasks may run in parallel when all listed dependencies are complete.

## 4. Milestone M1 — Text Monitor MVP

### T01 — Define monitoring contracts

- **Requirement:** Required
- **Status:** Not started
- **Dependencies:** None
- **Target files:** `src/monitoring/types.ts`, `src/monitoring/index.ts`
- **Description:** Add the public discriminated unions and interfaces for Monitor, Trigger, Snapshot, Diff, Run, readiness, normalization, and the fixed error-code set defined by the design. Export only types and stable constants from the module entry point.
- **Expected outcome:** All later monitoring components compile against one explicit contract; invalid kind/trigger combinations can be rejected without string conventions.
- **Acceptance criteria:**
  - The four monitor kinds and three monitor statuses are represented exactly.
  - Schedule constants encode default 30 minutes, minimum 1 minute, and maximum 43,200 minutes.
  - Run and error status types cover every state named in the design.
  - No monitoring type imports Agent, React, or storage implementation details.
  - TypeScript build passes.

### T02 — Implement MonitorStore schema and CRUD

- **Requirement:** Required
- **Status:** Not started
- **Dependencies:** T01
- **Target files:** `src/monitoring/MonitorStore.ts`, `src/monitoring/__tests__/MonitorStore.test.ts`
- **Description:** Create IndexedDB database `BrowserOnly-monitors` version 1 with stores and indexes for monitors, runs, snapshots, diffs, and screenshots. Implement typed CRUD, due-monitor queries, latest-successful-snapshot lookup, and transactional cascade deletion.
- **Expected outcome:** Monitoring state persists across service-worker and browser restarts and can be queried without whole-database scans.
- **Acceptance criteria:**
  - Every object store and index from the design exists.
  - `listDueMonitors(now)` uses the `nextRunAt`/status indexes.
  - Latest successful snapshot is returned deterministically by observation time.
  - Deleting a Monitor removes all associated records in one transaction.
  - Store tests cover creation, update, indexed query, restart/reopen, and cascade deletion.

### T03 — Extend stable locator construction

- **Requirement:** Required
- **Status:** Not started
- **Dependencies:** T01
- **Target files:** `src/workflows/locator.ts`, `src/workflows/__tests__/locator.test.ts`
- **Description:** Add an element-metadata input path to the existing locator builder. Generate ordered candidates using role/accessibility name, label, test id, stable id, short text, and CSS fallback.
- **Expected outcome:** Element selection and MonitorRunner use the same deterministic locator contract without breaking existing Workflow callers.
- **Acceptance criteria:**
  - Existing string-based `buildStableLocator` behavior remains compatible.
  - Generated CSS avoids `nth-child` unless no unique stable alternative exists.
  - Password and payment inputs are reported as prohibited targets.
  - Unit tests cover priority order, missing metadata, duplicate text, and CSS fallback.

### T04 — Build the one-shot element picker

- **Requirement:** Required
- **Status:** Not started
- **Dependencies:** T03
- **Target files:** `src/monitoring/elementPicker.ts`, `src/monitoring/__tests__/elementPicker.test.ts`
- **Description:** Implement an injectable page-side picker that highlights the hovered element, captures one click without activating the page action, returns sanitized element metadata and a sample value, then removes all overlays and listeners.
- **Expected outcome:** A user can safely select a page element and return a stable locator candidate to the extension UI.
- **Acceptance criteria:**
  - Only one overlay exists at a time and page DOM content is not rewritten.
  - Selection prevents the selected click's default action and propagation.
  - Escape cancels selection and performs cleanup.
  - Successful selection and cancellation both remove listeners and overlay.
  - Prohibited password/payment fields cannot be returned as valid selections.

### T05 — Implement deterministic text normalization

- **Requirement:** Required
- **Status:** Not started
- **Dependencies:** T01
- **Target files:** `src/monitoring/normalizers.ts`, `src/monitoring/__tests__/normalizers.test.ts`
- **Description:** Implement the P0 text normalization rules: NFC Unicode, non-breaking-space conversion, zero-width-character removal, whitespace collapse, trimming, and length limits.
- **Expected outcome:** Equivalent visible text produces the same normalized value and content hash.
- **Acceptance criteria:**
  - Normalization is deterministic and does not depend on locale defaults.
  - Element values are limited to 20,000 characters.
  - Tests cover Chinese and Latin text, composed/decomposed Unicode, zero-width characters, multiline whitespace, empty content, and truncation.

### T06 — Implement text DiffEngine

- **Requirement:** Required
- **Status:** Not started
- **Dependencies:** T01, T05
- **Target files:** `src/monitoring/DiffEngine.ts`, `src/monitoring/__tests__/DiffEngine.test.ts`
- **Description:** Compare the latest successful normalized text snapshot with the current value. Produce unchanged, appeared, disappeared, or text-changed diffs with bounded added/removed text.
- **Expected outcome:** Monitor history has structured, size-bounded evidence rather than an opaque changed flag.
- **Acceptance criteria:**
  - Equal hashes return `unchanged` without expensive diff work.
  - Empty-to-value and value-to-empty produce appeared/disappeared.
  - Added/removed payloads remain within 100 items and 20,000 total characters.
  - First observation returns baseline behavior rather than a change Diff.
  - Tests cover replacements, additions, removals, large content, and unchanged values.

### T07 — Implement TriggerEvaluator state machine

- **Requirement:** Required
- **Status:** Not started
- **Dependencies:** T01, T06
- **Target files:** `src/monitoring/TriggerEvaluator.ts`, `src/monitoring/__tests__/TriggerEvaluator.test.ts`
- **Description:** Evaluate `changed`, `text_appears`, and `text_disappears`, including edge-triggered notification state. Return the next `triggerActive` state separately from notification intent.
- **Expected outcome:** A condition sends one notification when it becomes true, stays quiet while true, and can notify again after recovery.
- **Acceptance criteria:**
  - The sequence `false → true → true → false → true` notifies exactly twice.
  - `changed` behaves as a one-run event and does not remain active.
  - Case-sensitive and case-insensitive keyword rules work as configured.
  - Baseline creation never requests a notification.

### T08 — Implement MonitorRunner for text extraction

- **Requirement:** Required
- **Status:** Not started
- **Dependencies:** T02, T03, T05, T06, T07
- **Target files:** `src/monitoring/MonitorRunner.ts`, `src/monitoring/MonitorExtractor.ts`, `src/monitoring/__tests__/MonitorRunner.test.ts`
- **Description:** Execute one Monitor in an inactive new tab: navigate, wait for readiness, detect auth/CAPTCHA states, resolve locator fallbacks, normalize text, create Snapshot and Diff, evaluate trigger, persist Run, and close the tab.
- **Expected outcome:** One deterministic service call performs a complete text-monitor check without constructing BrowserAgent or invoking an LLM.
- **Acceptance criteria:**
  - Navigation timeout is 30 seconds, followed by the defined one-second quiet period.
  - Optional `waitForText` waits at most 15 additional seconds.
  - Locator failure creates a failed Run and no Snapshot/Diff.
  - The first successful Run stores a baseline without notification.
  - Every exit path attempts to close the execution tab.
  - No model provider, knowledge graph, Notion, or Agent registry is imported.

### T09 — Implement Scheduler and stale-run recovery

- **Requirement:** Required
- **Status:** Not started
- **Dependencies:** T02, T08
- **Target files:** `src/monitoring/MonitorScheduler.ts`, `src/monitoring/__tests__/MonitorScheduler.test.ts`
- **Description:** Run a single global minute alarm, query due monitors, enforce concurrency two, claim monitors against duplicate execution, calculate the next run from completion time, and recover runs left active for more than ten minutes.
- **Expected outcome:** Due monitors run reliably on a best-effort schedule without duplicate execution or failure hot loops.
- **Acceptance criteria:**
  - At most two monitors run concurrently.
  - Repeated ticks cannot claim the same monitor twice in one worker lifetime.
  - Successful and failed runs both set the next run from `endedAt`.
  - Runs stale for ten minutes become failed with `TAB_CLOSED`.
  - Startup and install paths recreate the global alarm.

### T10 — Build the text-monitor creation flow

- **Requirement:** Required
- **Status:** Not started
- **Dependencies:** T04, T07, T08
- **Target files:** `src/sidepanel/components/monitors/MonitorCreateView.tsx`
- **Description:** Add the creation form for a Text Monitor: name, current URL, element selection, sample, changed/appears/disappears trigger, interval, optional wait-for-text, and the local best-effort disclosure.
- **Expected outcome:** Users can configure a valid Text Monitor and establish a successful baseline before it becomes active.
- **Acceptance criteria:**
  - Save remains disabled until URL, name, locator, trigger, and interval are valid.
  - The interval enforces the 1–43,200-minute bounds and defaults to 30.
  - Failed baseline execution keeps form input and displays structured error code/message.
  - Successful baseline creates an active Monitor and returns to its detail view.

### T11 — Integrate background messages, permissions, alarm, and notifications

- **Requirement:** Required
- **Status:** Not started
- **Dependencies:** T09, T10
- **Target files:** `public/manifest.json`, `src/background.ts`, `src/monitoring/NotificationService.ts`, `src/monitoring/__tests__/NotificationService.test.ts`
- **Description:** Add `alarms` and `notifications` permissions; register monitor message handlers, alarm/startup/install listeners, run-update broadcasts, notification display, and notification-click navigation.
- **Expected outcome:** Side Panel commands reach monitoring services, scheduled runs wake correctly, and trigger events produce navigable browser notifications.
- **Acceptance criteria:**
  - Every message action in the design returns the structured success/error envelope.
  - Notification text uses truncated summaries and never includes complete page bodies.
  - Notification click retains the target diff ID even when direct side-panel opening is unavailable.
  - Existing Workflow and Agent message handling remains functional.
  - Production manifest contains both new permissions exactly once.

### T12 — Add Monitor workspace and list management

- **Requirement:** Required
- **Status:** Not started
- **Dependencies:** T02, T10, T11
- **Target files:** `src/sidepanel/SidePanel.tsx`, `src/sidepanel/components/WorkspaceSwitcher.tsx`, `src/sidepanel/components/monitors/MonitorListView.tsx`
- **Description:** Add the Monitors workspace, active/needs-attention count, empty state, monitor cards, Run now, Pause, Resume, Edit, and confirmed Delete actions.
- **Expected outcome:** Users can find and manage all Monitor lifecycle actions without leaving the Side Panel.
- **Acceptance criteria:**
  - Count excludes paused monitors.
  - Needs-attention monitors have a distinct repair affordance.
  - Delete confirmation states that history and screenshots are removed.
  - UI refreshes on `monitorRunUpdated` without reloading the extension.

### T13 — Add Monitor detail and run timeline

- **Requirement:** Required
- **Status:** Not started
- **Dependencies:** T02, T11, T12
- **Target files:** `src/sidepanel/components/monitors/MonitorDetailView.tsx`, `src/sidepanel/components/monitors/MonitorDiffView.tsx`
- **Description:** Display current value, planned and actual run time, status, trigger, schedule, successful changes, unchanged runs, and failures. Add a text Diff view showing old/new values and bounded additions/removals.
- **Expected outcome:** A user can distinguish a page change from an execution failure and audit what changed.
- **Acceptance criteria:**
  - Baseline, unchanged, changed, and failed entries use distinct labels.
  - Failures show error code/message and never present as content disappearance.
  - Diff view resolves both snapshot IDs and handles a missing historical record gracefully.
  - Planned time and actual execution time are both visible.

### T14 — Implement failure threshold and recovery UX

- **Requirement:** Required
- **Status:** Not started
- **Dependencies:** T08, T09, T11, T12, T13
- **Target files:** `src/monitoring/MonitorRunner.ts`, `src/monitoring/MonitorScheduler.ts`, `src/sidepanel/components/monitors/MonitorDetailView.tsx`
- **Description:** Count consecutive failures, transition to `needs_attention` after the third failure, send one fault notification, support re-picking the element, and require explicit Resume after a successful manual check.
- **Expected outcome:** Broken monitors stop consuming resources and cannot silently generate false change alerts.
- **Acceptance criteria:**
  - Failure counts one and two leave the monitor active.
  - Failure three pauses future scheduling and emits one fault notification.
  - Additional manual failures do not repeat that notification.
  - A successful Run now resets the counter but does not implicitly resume scheduling.
  - Re-picking an element updates locator and sample without deleting prior history.

### T15 — Add M1 automated verification

- **Requirement:** Required
- **Status:** Not started
- **Dependencies:** T02–T14
- **Target files:** `test/fixtures/monitoring.html`, monitoring unit/integration test files
- **Description:** Add the deterministic fixture page and automated tests for text changes, delayed rendering, DOM rearrangement, locator failure, auth/CAPTCHA detection, scheduling, notifications, storage restart, and deletion.
- **Expected outcome:** The complete M1 behavior is reproducible without relying on external websites.
- **Acceptance criteria:**
  - Fixture can simulate every M1 state without network access.
  - Tests prove locator failure does not become text disappearance.
  - Tests prove baseline and unchanged runs do not notify.
  - `npm test -- --runInBand`, `npm run lint`, and `npm run build` pass.

### T16 — Complete M1 manual acceptance gate

- **Requirement:** Required
- **Status:** Not started
- **Dependencies:** T15
- **Target files:** No production-code target; record results in the implementation PR or release checklist.
- **Description:** Load the unpacked extension in a clean Chrome profile and execute the M1 manual acceptance paths from the design.
- **Expected outcome:** Text Monitor MVP is independently releasable and safe to merge even if M2/M3 never ship.
- **Acceptance criteria:**
  - Create, baseline, change, no-repeat notification, recovery, restart persistence, pause, resume, delete, and concurrency paths pass.
  - New permission prompt is reviewed in a clean profile.
  - No regression is observed in Tasks, Automations, or Runs workspaces.

## 5. Milestone M2 — Typed Monitoring

### T17 — Add price normalization, diff, and triggers

- **Requirement:** Required
- **Status:** Not started
- **Dependencies:** T05, T06, T07, T08, T16
- **Target files:** `src/monitoring/normalizers.ts`, `src/monitoring/DiffEngine.ts`, `src/monitoring/TriggerEvaluator.ts`, related tests
- **Description:** Support CNY, USD, EUR, GBP, JPY, KRW, untyped prices, thousand/decimal separators, from/range qualifiers, increase/decrease diffs, and above/below thresholds without exchange-rate conversion.
- **Expected outcome:** A Price Monitor compares numeric meaning rather than display strings.
- **Acceptance criteria:**
  - Parsing covers all formats enumerated in the design tests.
  - Parse failure during creation recommends Text Monitor and does not activate.
  - Runtime parse failure preserves the previous successful snapshot.
  - Currency mismatch does not trigger a threshold alert.
  - Numeric delta and percentage delta are correct, including old value zero.

### T18 — Add stock normalization, diff, and triggers

- **Requirement:** Required
- **Status:** Not started
- **Dependencies:** T05, T06, T07, T08, T16
- **Target files:** `src/monitoring/normalizers.ts`, `src/monitoring/DiffEngine.ts`, `src/monitoring/TriggerEvaluator.ts`, related tests
- **Description:** Add user-confirmed indicator semantics and produce in-stock, out-of-stock, or unknown values from indicator presence/text.
- **Expected outcome:** A Stock Monitor alerts on confirmed state transitions without treating ambiguous extraction as availability.
- **Acceptance criteria:**
  - Creation requires the user to identify whether the selected indicator means in stock or out of stock.
  - Indicator presence/absence maps to opposite definite states as designed.
  - Multiple matches or conflicting evidence returns unknown.
  - Unknown never generates a stock-change notification.

### T19 — Extend creation and history UI for price and stock

- **Requirement:** Required
- **Status:** Not started
- **Dependencies:** T17, T18
- **Target files:** `src/sidepanel/components/monitors/MonitorCreateView.tsx`, `MonitorListView.tsx`, `MonitorDetailView.tsx`, `MonitorDiffView.tsx`
- **Description:** Add Price and Stock type selection, type-valid trigger controls, current-value previews, numeric deltas, currency labels, and stock-state history.
- **Expected outcome:** Users can create and understand typed monitors without entering invalid trigger combinations.
- **Acceptance criteria:**
  - UI only offers triggers valid for the selected kind.
  - Price threshold inputs require finite numeric values.
  - Stock setup requires explicit indicator meaning.
  - List and history render typed values without falling back to raw JSON.

### T20 — Complete M2 verification gate

- **Requirement:** Required
- **Status:** Not started
- **Dependencies:** T17, T18, T19
- **Target files:** `test/fixtures/monitoring.html`, related test files
- **Description:** Extend the deterministic fixture and automated/manual matrix with price drops/rises, currency mismatch, price parse failure, stock transitions, unknown state, and notification deduplication.
- **Expected outcome:** Typed Monitoring is independently releasable without weakening M1 behavior.
- **Acceptance criteria:**
  - All price and stock scenarios pass in automated tests.
  - Existing text-monitor records open without migration or data loss.
  - Full test, lint, and build commands pass.
  - Manual price-drop and back-in-stock flows each produce exactly one notification.

## 6. Milestone M3 — Full P0

### T21 — Add page-text extraction and diff

- **Requirement:** Required
- **Status:** Not started
- **Dependencies:** T05, T06, T08, T20
- **Target files:** `src/monitoring/MonitorExtractor.ts`, `src/monitoring/normalizers.ts`, `src/monitoring/DiffEngine.ts`, related tests
- **Description:** Extract main page content using the ordered container rules, remove excluded/hidden nodes and low-value timestamp/ad blocks, apply the 200,000-character limit, and calculate line/word diff with significance.
- **Expected outcome:** Page Text Monitor detects meaningful content updates with substantially less layout noise than HTML comparison.
- **Acceptance criteria:**
  - Container selection follows the exact design order.
  - Script, style, noscript, nav, footer, hidden, and aria-hidden content is excluded.
  - Truncation is recorded and comparison remains deterministic.
  - Change ratio below 1% is low significance; at or above 1% is high.
  - UI creation path does not require an element locator.

### T22 — Persist screenshot evidence

- **Requirement:** Required
- **Status:** Not started
- **Dependencies:** T02, T08, T20
- **Target files:** `src/monitoring/MonitorRunner.ts`, `src/monitoring/MonitorStore.ts`, screenshot tests
- **Description:** Capture and persist JPEG quality-70 evidence for the first successful baseline and real changes only. Treat screenshot failure as non-fatal.
- **Expected outcome:** Baselines and changes have visual evidence without capturing every unchanged check.
- **Acceptance criteria:**
  - Unchanged and failed runs do not create screenshots.
  - Screenshot records link to Monitor and Snapshot.
  - Capture failure still completes Snapshot/Diff persistence.
  - Binary data is stored in IndexedDB and not emitted into logs.

### T23 — Complete evidence-oriented Diff UI

- **Requirement:** Required
- **Status:** Not started
- **Dependencies:** T13, T21, T22
- **Target files:** `src/sidepanel/components/monitors/MonitorDiffView.tsx`, `MonitorDetailView.tsx`
- **Description:** Add page-text added/removed sections, significance, source URL, observation timestamp, and screenshot viewer to change history.
- **Expected outcome:** Every retained change answers when, from what, to what, and with what visual evidence.
- **Acceptance criteria:**
  - Text is escaped and cannot inject page HTML into the extension UI.
  - Missing/failed screenshots degrade to textual evidence without breaking the view.
  - Long diffs are bounded and expandable without rendering the complete page body by default.

### T24 — Enforce retention and incremental cleanup

- **Requirement:** Required
- **Status:** Not started
- **Dependencies:** T02, T22
- **Target files:** `src/monitoring/MonitorStore.ts`, `src/monitoring/__tests__/MonitorStore.test.ts`
- **Description:** After each successful run, incrementally enforce 100 Runs, 50 successful Snapshots, and 20 Screenshots per Monitor while retaining referential consistency among Diffs and evidence.
- **Expected outcome:** Long-running monitors have bounded local storage use and no dangling UI references.
- **Acceptance criteria:**
  - Cleanup operates only on the completed Monitor, not by scanning unrelated records.
  - Removing an old Snapshot also removes or safely retires dependent Diff records.
  - Boundary tests cover exactly-at-limit and one-over-limit cases.
  - Deleting one Monitor cannot remove another Monitor's history.

### T25 — Apply privacy and logging hardening

- **Requirement:** Required
- **Status:** Not started
- **Dependencies:** T11, T14, T22
- **Target files:** monitoring services, `src/background.ts`, related tests
- **Description:** Redact URL query parameters and monitored content from logs, keep notification summaries bounded, reject prohibited field types, and verify no monitoring payload is passed to model or third-party integrations.
- **Expected outcome:** The local-only privacy claim is enforced by code paths rather than documentation alone.
- **Acceptance criteria:**
  - Error logs contain monitor/run IDs and error codes, not full URL queries or page values.
  - Notifications cannot reveal a complete body or oversized element value.
  - Password, OTP, CVV, and credit-card autocomplete fields are rejected.
  - A dependency/import audit confirms no provider or external-client path from Monitoring.

### T26 — Complete Full P0 automated verification

- **Requirement:** Required
- **Status:** Not started
- **Dependencies:** T21, T22, T23, T24, T25
- **Target files:** `test/fixtures/monitoring.html`, all monitoring test suites
- **Description:** Run the full happy-path, error, privacy, storage, restart, scale, and regression matrix for all four Monitor kinds.
- **Expected outcome:** Full P0 behavior is protected by repeatable automated verification.
- **Acceptance criteria:**
  - All unit and fixture-backed integration cases from the design are covered.
  - A 100-Monitor synthetic scheduling test demonstrates concurrency two and indexed due selection.
  - Existing Workflow tests pass unchanged.
  - `npm test -- --runInBand`, `npm run lint`, and `npm run build` all pass.

### T27 — Update release and privacy documentation

- **Requirement:** Required
- **Status:** Not started
- **Dependencies:** T26
- **Target files:** `README.md`, `docs/docs/privacy-policy.md`, `docs/docs/user-guide.md`
- **Description:** Document local storage, screenshot behavior, permissions, browser-running requirement, best-effort schedule, supported Monitor types, failure states, and data deletion.
- **Expected outcome:** Product claims match actual P0 behavior and users understand its operating limits before enabling monitors.
- **Acceptance criteria:**
  - Privacy policy explicitly covers values, diffs, URLs, and screenshots.
  - User guide covers create, pause, resume, run now, re-pick, and delete.
  - Documentation does not claim cloud execution, real-time SLA, or CAPTCHA bypass.
  - Permission rationale includes alarms and notifications.

### T28 — Run the 24-hour release soak and rollback drill

- **Requirement:** Required
- **Status:** Not started
- **Dependencies:** T27
- **Target files:** No production-code target; record results in release checklist.
- **Description:** Run at least one public product page, one authenticated page, and one dynamic SPA for 24 hours. Exercise locator failure, auth expiration, CAPTCHA classification, browser restart, and the operational rollback path.
- **Expected outcome:** Full P0 is release-ready under realistic local-browser conditions and can be disabled without deleting user history.
- **Acceptance criteria:**
  - All three monitors retain a coherent run timeline for 24 hours.
  - No locator/navigation failure is recorded as a content change.
  - Restart produces no duplicate concurrent run.
  - Disabling alarm registration and pausing active monitors stops execution while preserving IndexedDB history.
  - Observed limitations are documented as release notes, not left as implicit behavior.

## 7. Optional, non-blocking tasks

Optional tasks must not be inserted into the critical path or delay M1–M3 acceptance.

### O01 — Export one Monitor and its history

- **Requirement:** Optional
- **Status:** Not started
- **Dependencies:** T24
- **Description:** Export one Monitor's configuration, snapshots, and diffs as a local JSON file, excluding screenshot binary data by default.
- **Expected outcome:** Users can audit or back up structured monitoring history outside the extension.
- **Acceptance criteria:** Exported JSON has a schema version, contains no secret fields, and can be produced without network access.

### O02 — Add reduced-motion and keyboard picker polish

- **Requirement:** Optional
- **Status:** Not started
- **Dependencies:** T04, T10
- **Description:** Improve picker accessibility with keyboard traversal, reduced-motion styling, and richer screen-reader status announcements beyond the required Escape-to-cancel behavior.
- **Expected outcome:** Element selection is more usable for keyboard and assistive-technology users.
- **Acceptance criteria:** Picker can select and cancel without a pointer, focus is restored, and reduced-motion preference is honored.

### O03 — Add an explicit “Explain this change” AI action

- **Requirement:** Optional
- **Status:** Not started
- **Dependencies:** T23, T25
- **Description:** Add a user-initiated action that sends only the selected old/new diff to the configured model and never runs during scheduled monitoring.
- **Expected outcome:** Users can request an interpretation without adding LLM cost or nondeterminism to the monitoring hot path.
- **Acceptance criteria:** The action requires an explicit click, previews transmitted content, and scheduled runs remain provider-free.

## 8. Milestone exit gates

| Milestone | Required tasks | Exit condition |
| --- | --- | --- |
| M1 Text Monitor MVP | T01–T16 | Text monitoring is independently releasable and all M1 verification passes. |
| M2 Typed Monitoring | T17–T20 | Price and stock flows pass without migration or regression to text monitors. |
| M3 Full P0 | T21–T28 | All four kinds, evidence retention, privacy docs, automated checks, and soak test pass. |

Optional tasks O01–O03 are excluded from every milestone gate.

## 9. Recommended execution order

1. Complete T01 first to freeze the contract.
2. Run T02, T03, and T05 in parallel.
3. After T03, complete T04; after T05, complete T06 and then T07.
4. Complete T08, then T09 and T10.
5. Integrate through T11, then run T12 and T13 in parallel.
6. Complete T14–T16 sequentially and release or merge M1.
7. Run T17 and T18 in parallel, followed by T19–T20.
8. Run T21, T22, and T25 in parallel after M2; then complete T23 and T24.
9. Complete T26–T28 sequentially for the Full P0 release gate.

## 10. Global Definition of Done

A required task is complete only when:

- its acceptance criteria are demonstrably satisfied;
- new logic has proportionate tests;
- TypeScript, lint, and relevant tests pass;
- error paths produce structured Monitor errors rather than unhandled exceptions;
- no scheduled path invokes an LLM or third-party integration;
- related user-visible behavior is documented by T27 before Full P0 release;
- implementation stays within the approved design or the design document is explicitly revised and re-approved first.
