# BrowserOnly 网页测试 V1 技术方案

状态：设计待确认。本文只定义方案，不改变运行代码。

## 1. 目标与边界

V1 在同一个 Chrome Profile 内提供两个入口：导入用例运行，以及访问站点生成用例草稿。一个测试集可以并行运行多个页面。每个用例有自己的执行标签页、结果和证据。测试运行与现有聊天、Workflow、监控的记录和状态分开。

完成标准：用户可以导入一个包含至少四条用例的文件，选择其中若干条，以默认并发 2 运行，看到逐步报告；也可以从站点和测试目标生成草稿，确认预期并试运行、保存。失败、受阻、取消与通过有可核查的区分。

V1 不提供跨 Profile 统一调度、CI、跨浏览器、后台定时测试、任意脚本执行、API 数据准备/清理、视觉 AI 断言、Midscene 文件兼容。扩展仍只操作用户当前 Profile 的 Chrome。Chrome 进程不是隔离单位。

## 2. 现状依据与最小改动原则

- `src/background/messageHandler.ts` 的 `handleRunWorkflow` 用 `runningWorkflowWindows` 与窗口 Agent 状态限制同窗口只运行一个任务。保持这条现有约束，不将测试用例变成 `runWorkflow` 消息。
- `src/background/tabManager.ts` 已按 `tabId` 持有 `Page`，但也有全局 `currentTabId`。测试执行只通过显式的 `Page` 与 `tabId` 访问页面，不调用依赖当前标签页的工具。
- `src/workflows/WorkflowRunner.ts` 的运行结果、修复与断言服务于 Workflow。测试复用稳定定位和浏览器连接能力，不复用其状态机、自动修复或 `evaluateAssertion`。该断言函数目前吞掉异常、部分检查依赖当前活动标签页，不能给出可信的测试失败详情。
- `src/workflows/WorkflowStore.ts` 的 IndexedDB 仅保存 Workflow。测试使用独立数据库，避免版本升级或清理误伤既有数据。
- `src/sidepanel/components/RunDetailView.tsx` 展示 Workflow 运行。测试报告独立呈现，避免改变既有运行记录的语义。

### 依赖关系

```text
Tests UI ──> Tests message endpoint ──> TestSuiteCoordinator ──> TestCaseRunner
   │                                      │                         │
   └─────────────> TestStore <────────────┘                         │
                                                                  ▼
                                                    explicit Page / tabId
                                                    locator + action adapter
                                                    assertion probe
```

测试模块只向浏览器能力层依赖。Workflow 不依赖测试模块；测试模块不调用 WorkflowRunner，避免循环依赖。

## 3. 数据契约

### 测试集与用例

文件格式为 BrowserOnly YAML，`schemaVersion: 1`。导入时解析为内部结构，保存时保留原始用例顺序。顶层字段为稳定的 `suiteId`、`name`、`site`、`allowedDomains`、`cases`。每条用例包含在测试集内唯一且稳定的 `id`（例如 `case-1`）、名称、可选说明、`steps`。每步是以下之一：

| 步骤 | 必填数据 | 首版执行语义 |
|---|---|---|
| `navigate` | HTTP(S) URL | 在该用例的标签页打开页面 |
| `click` | `target` | 点击唯一命中的可见目标 |
| `fill` | `target`、字符串 `value` | 填写输入框，不保存敏感明文到报告 |
| `press` | 已允许的键名 | 向当前目标发送按键 |
| `assert` | `type`、`expected`、`timeoutMs` | 持续探测直到通过或超时 |

`target` 可选择 role+name、label、testId 或 CSS，必须唯一命中。断言类型：`url_matches`、`element_visible`、`element_absent`、`text_present`、`value_equals`。不提供 JavaScript、表达式求值、任意工具名、正则输入或外部文件路径。URL 匹配首版使用明确的字符串匹配策略，不直接执行用户提供的正则，以免出现灾难性回溯与歧义。

参数规则：最多 1 MB、50 条用例、每条 40 步、单步超时 1–30 秒、单用例总超时 3 分钟。文件和域名校验必须在任何网页打开之前完成。未知字段报错而不是忽略；导入成功先保存为草稿，不自动运行。YAML 解析器需要声明为直接依赖，并关闭自定义标签/对象构造能力；即使当前锁文件有传递依赖，也不能依赖其偶然存在。

用例可在界面编辑与导出。用户生成的预期结果标记为 `needsReview`，经用户确认后才可运行并算作正式测试。用例执行时固定读取一个不可变快照，编辑不会改变正在执行的测试。

### 已上传用例的维护

点击测试集中的 `case-1` 打开独立的 BrowserOnly Test Editor View，定位到该用例。承载方式参照现有 `public/pdf-viewer.html`：专门的扩展页面在单独 Chrome 标签页中显示，拥有自己的页面入口和生命周期；不塞进 Side Panel，也不嵌入 PDF.js。Side Panel 只保留用例列表、摘要、运行和报告。编辑器支持语法高亮、行号、搜索、折叠、格式化和错误定位；右侧同时显示验证错误与当前版本差异。用户可直接修改名称、步骤、定位目标、输入值、预期和超时，也可复制或移动步骤。首版不做双向同步的可视化表单编辑器。

编辑器维护完整测试集文件，但“保存并启用”按用例粒度提交：只创建发生变化且通过校验的用例版本，并更新各自的 activeVersionId。例如只改 `case-1` 就只生成它的 v3，`case-2` 保持原版本。用例 ID 是只读身份字段：如果编辑器检测到改动已有 ID，阻止启用并提示通过“复制为新用例”创建新 ID。用户可以试运行当前草稿或选中的单条用例；旧版本可查看并恢复，恢复仍生成新版本，不覆盖历史。

编辑文本自动保存为本地草稿，但**不自动启用**。解析错误时保留原文与光标位置，同时禁用试运行和启用；修复错误后重新校验。导航离开编辑器不会丢失草稿。多编辑器窗口同时打开时采用乐观版本号：第二个窗口保存前若基线已变化，显示差异并要求选择采用哪一版，不静默覆盖。

同一个测试集再次上传时，先预览导入差异：按 `suiteId + case.id` 匹配，分别列出新增、内容变化、无变化、文件中缺失的用例。默认仅新增并将变化项保存为草稿；缺失项保持不变，不自动删除。用户逐项选择“采用上传版本”后，才提升对应用例的 activeVersionId。若重新上传文件没有稳定 ID，不靠名称猜测映射；界面要求用户手动选择匹配目标，或作为新测试集导入。导出文件总是包含稳定 ID，便于后续维护。

运行报告始终指向当时的 `caseVersionId`。例如 `case-1` v2 跑失败，后来修成 v3，旧报告仍展示 v2 的步骤、预期和截图；报告可显示“当前版本 v3”并提供“对比版本”，但不得用 v3 的内容重写旧报告。正在运行的 v2 不会被中途编辑替换。报告里的“重跑失败用例”默认使用当前生效版本，并明确显示版本号；如需复现历史结果，用户可以显式选择旧版本运行。

### 运行记录

独立的 TestStore 包含 `suites`、`cases`、`caseVersions`、`suiteRuns`、`caseRuns`、`stepResults`、`evidence` 七个存储区。`cases` 保存稳定 ID、所属 suite、activeVersionId 与草稿 ID；`caseVersions` 是不可变内容。一个 suiteRun 固定引用每条用例的版本；报告不会因后来修改用例而变化。保存版本与切换 activeVersionId 必须在一个 IndexedDB 事务内完成，失败时两个操作都回滚。

状态：

| 层级 | 状态 |
|---|---|
| SuiteRun | queued、running、completed、cancelled、interrupted |
| CaseRun | queued、running、passed、failed、blocked、cancelled、skipped |
| StepResult | passed、failed、blocked、cancelled、skipped |

报告存预期、实际的短文本、错误码、时间、URL、标签页 ID 和证据 ID。失败截图单独存储，不放在消息总线或用例记录里。截图缺失时仍保留失败结果，并显示“证据保存失败”。默认保留最近 30 天的运行证据；删除测试集前列明关联运行，删除动作应在同一存储事务或可重试的清理流程中完成。导出报告默认不含截图与敏感值。

## 4. 执行与并发

### SuiteCoordinator

一次点击运行只创建一个 suiteRun。协调器维护待运行队列、最多 N 个 worker、活动 caseRun 与取消信号；N 默认 2，界面可设 1–3。每个 worker 创建一个新标签页，执行一条用例，结束后释放槽位。用例步骤串行，断言异步轮询。队列顺序就是文件顺序。一个 Profile 同一时刻只允许一个活动 suiteRun，避免多个 Side Panel 重复发起同一测试集；再次点击运行返回当前 suiteRun ID。

一个 worker 始终持有自己明确的 `Page`、`tabId`、`windowId`，禁止使用 `getCurrentTabId()`、`browser_get_active_tab`、标签页选择工具或共享 Agent 对话历史。创建标签页时设为非激活，原用户页面不被切换；用户手动切换仍不影响 worker 的 Page 引用。页面弹出新标签时，首版将该步骤标记为 blocked（`POPUP_UNSUPPORTED`），保留弹出页，不静默切换测试目标。

### 与现有任务的资源协调

V1 测试集在用户发起的窗口内创建执行标签页。运行前协调器检查该窗口是否有 Workflow 或 Agent 正在运行；若有则拒绝启动并给出当前任务链接。测试启动后取得该窗口的独占任务租约：阻止该窗口新建 Agent/Workflow 任务，但协调器内部允许 1–3 个 TestCaseRunner 并行。测试标签页本身不使用窗口 Agent。租约由一个很小的共享资源协调模块管理；把现有 `runningWorkflowWindows` 判断改为调用该模块，但保持 Workflow 的锁时机、错误语义和释放时机不变。其他 Chrome 窗口原有 Workflow 行为不受影响。

同站点、同账号的并行用例共享 Cookie、LocalStorage 和后端数据。V1 默认只允许无副作用用例并行；包含提交、删除或其他写入的用例自动进入串行通道，运行前显示审批。无法准确识别副作用的点击必须按写入处理，宁可多一次审批。V1 不承诺用例间的数据隔离。

### 生命周期

在每条用例开始、每步开始与结束、每条用例结束时持久化状态。取消单条只中止该 worker；取消全部清空队列并中止所有 worker，已完成记录保留。用户关闭测试标签页，该用例为 blocked（`TAB_CLOSED`），其他用例继续。扩展 service worker 意外重启后，启动时把旧的 running 状态转为 interrupted/blocked，并释放孤儿租约；不自动重放任何操作。

为了避免把测试输入当成网页指令，页面文字仅作为断言观测值，不能改写允许域名、步骤或预期。每次跳转前后验证目标 URL 是否位于 allowedDomains；重定向越界则 blocked（`DOMAIN_EXIT`）并停止该用例。

## 5. 断言与失败归因

AssertionProbe 直接查询该 worker 的 Page。轮询间隔 200–500ms，有总超时，不按固定 sleep 判定异步页面。每次探测返回结构化的“是否满足、观测值、定位数量、当前 URL”。超时报告最后一次观测值与预期。定位为零、定位多个、元素不可见分别给出不同错误码。`element_absent` 必须确认页面已进入可检查状态，不能在导航尚未完成时瞬间判定通过。

动作执行失败和断言不符均为 failed；未登录、验证码、权限不足、页面不可达、调试连接断开、手动关闭标签页或越界跳转为 blocked。失败分类不依赖模型猜测；未能确定原因则显示 `UNKNOWN`，附底层错误。首版不自动“修复”测试用例的 locator 或预期，因为自动改写预期会掩盖产品回归。用户可以在报告中复制失败用例为新草稿并手动修订。

## 6. 访问站点生成用例

生成过程是独立的交互式设计会话，不占用测试运行队列。用户输入站点和测试目标；Agent 可以读取页面、尝试探索路径，提出操作步骤、候选定位和可观察断言。生成器只输出符合测试协议的草稿，随后通过同一 schema 校验器检查。所有业务预期默认标为待确认；当前页面显示的文案不自动成为“正确预期”。用户确认后才能保存正式版本并试运行。

生成操作可能影响站点时沿用现有审批。模型不可生成域名外步骤、任意脚本或扩大文件权限。生成失败保留可编辑草稿与诊断，不保存为通过用例。API/Ollama 模型能力不足时明确提示；不自动切换模型提供商或上传更多页面数据。

## 7. UI 与消息接口

在现有 `WorkspaceSwitcher` 增加 Tests，保留 Tasks、Automations、Monitors、Runs 的行为。静态原型位于 `mockups/web-testing-entry.html`，独立编辑 View 原型位于 `mockups/web-testing-editor.html`。Tests 下有测试集列表、导入差异预览、运行态、报告详情；点击“编辑 YAML”打开独立扩展页面标签页，提供足够宽度的代码编辑、校验与版本差异。编辑页通过 suiteId 与 caseId 读取 TestStore，不把完整 YAML 放在 URL 中。测试集列表中的每条用例有“编辑 YAML”“运行”和“历史版本”入口；上传后的文件不再是只读附件。运行态显示活动/等待数量、每条用例所在 tabId、当前步骤、停止单条与停止全部。报告列表显示通过/失败/受阻/取消数量；失败详情优先展示预期、实际、错误和截图。

Side Panel 到后台新增独立消息族：`testSuiteStart`、`testCaseCancel`、`testSuiteCancel`、`testSuiteStatus`。消息返回 suiteRun ID 后，页面可按 ID 从 TestStore 恢复状态；实时事件只是 UI 加速，不作为唯一事实来源。事件带 suiteRunId、caseRunId、tabId、windowId，避免多窗口串线。文件读取与导入预览在 Side Panel 完成，编辑在独立扩展页面完成；两处调用同一 YAML schema 校验模块。后台只接收已持久化的测试集版本 ID，再重新校验版本及域名。

## 8. 改动范围和交付切片

预计新增超过 8 个文件，但修改既有模块保持为薄接缝：

| 范围 | 工作 |
|---|---|
| `src/testing/` 新目录 | 协议、校验、存储、资源租约、协调器、用例执行器、动作适配、断言探测、报告归一化 |
| `src/background/types.ts`、`messageHandler.ts` | 新增消息类型和独立分发；现有 Workflow 分支不改执行语义 |
| `src/background/tabManager.ts` | 提供明确 Page/tabId 的非激活测试标签页创建与释放接口，不改变现有 Workflow 建页默认值 |
| `src/sidepanel/`、独立测试编辑页 | Tests 入口、导入预览、运行与报告；`public/test-editor.html` 与单独的编辑器入口负责 YAML 编辑 |
| `package.json` | 增加直接 YAML 解析依赖；不引入 Node 服务或第二运行时 |
| `tests/testing/` | 协议、并发、取消、故障恢复与 UI 验证 |

交付 A：导入、编辑、运行与报告，含并发 1–3 和失败证据，可以独立使用。交付 B：访问站点生成草稿、预期确认、试运行与保存，复用 A 的全部契约。B 不更改 A 的执行状态机。

## 9. 验证与回归门槛

单元与集成场景：非法 YAML/超限/越界 URL；解析错误后草稿和光标仍保留；编辑 `case-1` 不改变 `case-2`；已有 ID 被改动时阻止启用；两个编辑器窗口冲突不静默覆盖；编辑中运行保持旧快照；重新上传按 ID 产生正确差异且不删除缺失用例；无 ID 文件不误合并；版本恢复保留历史报告；同窗两个测试 worker 各自操作正确标签页；两个 Side Panel 同时点击运行只生成一个 suiteRun；一个用例失败不停止其他用例；写入用例串行并审批；取消单条/全部；关闭执行标签页；service worker 重启后的 interrupted；截图保存失败；敏感字段导出脱敏。

现有功能回归：同窗口 Workflow 仍拒绝第二个 Workflow；不同窗口 Workflow 仍可运行；聊天 Agent 的状态与历史不受测试事件影响；监控、下载、审批和侧栏导航保持原行为。运行 `npm test`、`npm run lint`、`npm run build`，并在加载 `dist/` 的 Chrome 中手动跑两个并发页面的 smoke test。

发布可回退性：Tests 入口可由本地功能开关隐藏；独立 TestStore 可保留数据供后续恢复。关闭功能不迁移或删除 Workflow 数据。若测试期间浏览器连接不稳定，系统降低到并发 1 并在报告里明确显示，而不是静默丢失用例。

## 10. 关键风险与取舍

最脆弱的前提是 `playwright-crx` 在同一窗口多个非激活 Page 上能稳定并发操作。若验证不成立，V1 必须固定并发 1；同一套用例、存储和报告协议仍可交付。第二个风险是同 Profile 共享登录状态与服务端数据；V1 通过只读并行、写入串行和审批降低互相干扰，不宣称完全隔离。第三个风险是扩展后台生命周期；状态持久化与中断归因优先于自动恢复，以避免重复提交。

不采用“直接调用 WorkflowRunner 跑每条用例”：它有窗口锁、当前标签页依赖、任务成功语义和自动修复路径，改到满足测试隔离会扩大现有功能回归面。也不直接嵌入 `@midscene/test`：它需要另一个测试项目运行时，且协议仍处 Beta。V1 借鉴声明式用例和逐步报告即可。
