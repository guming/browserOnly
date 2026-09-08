# Workflow 新标签页执行技术方案

## 1. 背景

当前用户在 Side Panel 的 Automation 列表点击 `Run` 后，系统会把当前活动标签页的 `tabId` 传给后台。`handleRunWorkflow` 随后 attach 到该标签页，并在这个页面中执行 Workflow。

这种方式会直接导航和修改用户正在浏览的页面。用户既容易丢失当前阅读位置，也不容易分辨哪些操作来自自己、哪些操作来自 Automation。

本方案将默认行为调整为：用户点击 `Run` 后，BrowserOnly 打开并激活一个新的浏览器标签页，Workflow 在该标签页中以可见方式完成导航、输入、点击和结果页跳转，原标签页不被修改。

示例：

```text
用户点击“Google 搜索 JVM” → Run
  → Chrome 打开并切换到一个新标签页
  → 新标签页访问 https://www.google.com
  → 输入 jvm 并提交搜索
  → 点击第一个搜索结果
  → 最终页面保留，用户可以继续浏览
```

## 2. 目标与非目标

### 2.1 目标

- Automation 默认在新建、可见、激活的标签页中运行。
- 原始标签页保持不变。
- 一次 Run 的所有步骤绑定到明确的执行标签页，不受用户后续切换标签页影响。
- 同标签页导航后继续执行，无需重新 attach。
- 网站点击链接并创建新标签页时，可以识别并选择是否接管新页面。
- Side Panel 能持续展示运行状态、审批请求和失败信息。
- 成功或失败后保留最终页面，方便用户查看结果或接管操作。
- 保留在当前标签页运行的兼容能力。

### 2.2 非目标

- 第一版不支持一个 Workflow 并行控制多个标签页。
- 第一版不支持后台无界面运行。
- 第一版不自动关闭成功或失败后的执行标签页。
- 第一版不恢复已被用户关闭的执行标签页。
- 第一版不改变 Workflow 的录制、编译和 AI 修复模型。
- 第一版不解决跨浏览器窗口编排。

## 3. 设计原则

1. **执行上下文显式化**：Run 必须持有 `ownerTabId` 与 `executionTabId`，不能在步骤执行期间通过“当前活动标签页”推断目标。
2. **用户可见**：创建执行标签页时将其激活，让用户看到 Automation 正在做什么。
3. **原页面安全**：默认不导航、不输入、不点击发起 Run 的标签页。
4. **结果可接管**：运行结束后保留执行页，用户可以继续手动操作。
5. **运行 UI 跟随窗口**：执行发生在哪个标签页，不应决定 Side Panel 是否能收到运行状态和审批。
6. **一次 Run、一个主 Page**：如果链接打开新页，只允许一个页面接棒成为主执行页。

## 4. 当前实现与差距

### 4.1 已有能力

- `src/background/tabManager.ts` 已提供 `createNewTab(windowId, url)`，通过 Playwright-CRX 创建页面并获得 Chrome `tabId`。
- `WorkflowService.run` 已接收一个明确的 Playwright `Page`。
- `WorkflowRunnerOptions.context` 已支持 `tabId` 和 `windowId`。
- `WorkflowRunner` 的域名判断和写操作审批已经能够使用指定的 `tabId`。
- Manifest 已声明 `tabs`、`debugger`、`activeTab` 和 `<all_urls>` 权限。

### 4.2 主要差距

1. `WorkflowListView` 当前把活动标签页作为 Workflow 的执行标签页传入后台。
2. `handleRunWorkflow` 当前直接 attach 到消息中的 `tabId`，没有创建专用标签页。
3. Workflow 只有 `triggerDomains`，没有可靠的启动 URL。
4. UI 消息以 `tabId` 路由，而 `useChromeMessaging` 会过滤其他标签页的消息。新标签页激活后 Side Panel 的当前 `tabId` 也会切换，因此仅投递给原标签页或执行标签页都不稳定。
5. `WorkflowRun` 没有记录发起标签页和执行标签页，无法诊断运行现场。
6. 页面点击后如果打开新标签页，Runner 没有主 Page 接棒规则。

## 5. 用户体验

### 5.1 启动

Run 对话框显示：

```text
Run “Google 搜索 JVM”

This automation will open and operate in a new tab.

[Cancel] [Open new tab and run]
```

用户确认后：

1. 记录当前标签页为 `ownerTabId`。
2. 在同一 Chrome 窗口创建一个新标签页并切换过去。
3. 新标签页先显示 Workflow 的 `startUrl`。
4. 页面可操作后开始执行第一步。

### 5.2 运行中

- 标签页中的页面变化对用户可见。
- Side Panel 显示当前步骤，例如 `Step 2/4 · Search for jvm`。
- 用户可以切换到其他标签页；Workflow 仍固定操作 `executionTabId`。
- 涉及发送、购买、删除等动作时暂停，并在 Side Panel 显示审批。
- 用户可以取消运行；取消后停止后续步骤，但不关闭页面。

### 5.3 结束

- 成功：保留最终页面，Run 状态为 `succeeded`。
- 失败：保留失败现场，展示失败步骤与错误，并提供“查看执行页面”。
- 用户关闭执行标签页：Run 状态变为 `cancelled`，错误原因记录为 `EXECUTION_TAB_CLOSED`。

## 6. 数据模型

### 6.1 Workflow 启动配置

在 `Workflow` 中增加：

```ts
export type WorkflowExecutionMode = 'new_tab' | 'current_tab';

export interface Workflow {
  // existing fields...
  startUrl?: string;
  executionMode?: WorkflowExecutionMode;
}
```

约定：

- 新建 Workflow 默认 `executionMode = 'new_tab'`。
- `new_tab` 模式必须有合法的 `http:` 或 `https:` `startUrl`。
- `current_tab` 模式允许没有 `startUrl`，从当前页面状态开始。
- 字段先保持可选，以兼容 IndexedDB 中的旧数据。
- 旧 Workflow 的读取默认值为 `current_tab`，避免升级后改变既有自动化行为；用户再次保存后可明确选择 `new_tab`。

### 6.2 Run 执行上下文

在 `WorkflowRun` 中增加：

```ts
export interface WorkflowRun {
  // existing fields...
  ownerTabId?: number;
  executionTabId?: number;
  executionWindowId?: number;
}
```

- `ownerTabId`：用户点击 Run 时的标签页，用于来源记录和返回原页。
- `executionTabId`：当前主执行页，用于工具调用、断言和取消监听。
- `executionWindowId`：用于新页面关联和故障诊断。

Chrome 的标签页 ID 仅作为运行时诊断信息，不作为跨浏览器重启后恢复执行的依据。

### 6.3 消息协议

调整 `RunWorkflowMessage`：

```ts
export interface RunWorkflowMessage {
  action: 'runWorkflow';
  workflowId: string;
  versionId: string;
  variables?: Record<string, unknown>;
  ownerTabId?: number;
  ownerWindowId?: number;
  executionMode?: WorkflowExecutionMode;
}
```

运行状态消息增加 `runId`、`workflowId`、`executionTabId` 和 `windowId`。Workflow 运行类消息以 `runId + windowId` 判断归属，不使用当前活动 `tabId` 过滤；普通 Agent 消息继续保持现有的 tab 级路由。

## 7. 核心架构

```text
WorkflowListView
    │ runWorkflow(ownerTabId, ownerWindowId)
    ▼
messageHandler.handleRunWorkflow
    │
    ├─ resolve workflow + version
    ├─ resolve execution mode + start URL
    ├─ create/attach execution tab
    ├─ create RunExecutionContext
    ▼
WorkflowService
    │ fixed Page + executionTabId
    ▼
WorkflowRunner
    │ step callbacks / approval / assertions
    ▼
UI messages → runId + ownerWindowId → Side Panel
```

引入仅在后台使用的运行上下文：

```ts
interface RunExecutionContext {
  runId: string;
  ownerTabId: number;
  ownerWindowId: number;
  executionTabId: number;
  executionWindowId: number;
  page: Page;
}
```

它是单次 Run 的权威上下文。任何步骤都不得重新查询 active tab 来决定执行目标。

## 8. 执行流程

### 8.1 `new_tab` 模式

1. Side Panel 查询当前标签页，发送为 `ownerTabId` 和 `ownerWindowId`。
2. 后台校验 Workflow、版本、变量与 `startUrl`。
3. 后台使用 Playwright-CRX 在 `ownerWindowId` 创建新 Page，并导航到 `startUrl`。
4. 通过新 Page 获取 `executionTabId`，并登记到 tab manager。
5. 将新标签页激活。若 `newPage` 的行为不能保证激活，则补充 `chrome.tabs.update(executionTabId, { active: true })`。
6. 等待 DOM 可交互，不等待无限期的 `networkidle`；默认等待 `domcontentloaded`，具体步骤继续使用现有 timeout。
7. 创建 Run，并保存 owner/execution 标签页信息。
8. 将固定 Page 传给 `WorkflowService.run`。
9. 所有进度和审批消息携带 `runId`，按 `ownerWindowId` 投递给该窗口的 Side Panel。
10. 结束后保留执行标签页并清理运行时监听器。

### 8.2 `current_tab` 模式

兼容当前行为：

1. `ownerTabId` 同时作为 `executionTabId`。
2. 如果没有 Page，调用 `attachToTab`。
3. 其余步骤与 `new_tab` 共用同一执行路径。

### 8.3 页面内导航

同一标签页中的 URL 跳转不会更换 Playwright `Page`。Runner 继续使用原 Page，`executionTabId` 保持不变。

### 8.4 点击打开新标签页

点击可能产生三种结果：

- 当前页导航：继续使用当前 Page。
- 创建一个新 Page：新 Page 接棒成为主执行页。
- 同时创建多个 Page：停止运行，错误码为 `AMBIGUOUS_NEW_TABS`，避免猜测目标。

接棒规则：

1. 只在执行动作的短时间窗口内监听当前 browser context 的 `page` 事件。
2. 新 Page 的 opener 必须是当前主 Page。
3. 等待新 Page 到达 `domcontentloaded`。
4. 更新内存中的 `page` 和 `executionTabId`。
5. 更新 `WorkflowRun.executionTabId`。
6. 后续工具、断言和审批全部绑定新 Page。
7. 原 Page 保留，不自动关闭。

第一版若现有 `WorkflowService` 工具闭包无法动态更换 Page，则暂不实现自动接棒：检测到新 Page 后给出明确失败 `NEW_TAB_HANDOFF_UNSUPPORTED`。不允许继续在旧 Page 上执行造成误操作。自动接棒可作为同一方案的第二个独立版本交付。

## 9. 消息与 Side Panel 路由

当前 `useChromeMessaging` 按 `message.tabId === selected tabId` 过滤消息。新执行页被激活后，`currentSelectedTabId` 会更新为执行页；如果消息固定发送给原页会被过滤，固定发送给执行页又会在用户切换其他页后被过滤。

本方案规定：

- `runId` 是运行 UI 的稳定归属，`ownerWindowId` 是消息投递范围。
- `ownerTabId` 只记录运行来源，并支持“返回原页面”。
- `executionTabId` 只表示浏览器操作目标。
- Workflow 的 `updateOutput`、`processingComplete`、`requestApproval` 等消息附带 `runId`、`workflowId`、`windowId` 与 `executionTabId`。
- `useChromeMessaging` 对带 `runId` 的 Workflow 消息按当前窗口过滤，并绕过活动标签页过滤；没有 `runId` 的普通 Agent 消息维持现状。
- Side Panel 用 `activeWorkflowRunId` 将进度归入对应 Run，不能把它混入当前标签页的普通对话。
- Side Panel 切换标签页后，仍可通过 IndexedDB 中的 Run 状态恢复展示；不能只依赖一次性 runtime message。

审批请求同样按 `runId + windowId` 路由。审批内容应显示当前执行域名和执行标签页标题，避免用户误判操作对象。

## 10. 标签页生命周期与并发

### 10.1 生命周期状态

```text
creating → attaching → running → succeeded
                         ├──────→ failed
                         └──────→ cancelled
```

- `creating`、`attaching` 可以先作为内部状态，不必扩展公开的 `WorkflowRunStatus`。
- Page 创建失败时不产生可执行 Run，返回启动错误。
- Run 已创建后发生的 Page 关闭或 attach 丢失必须落盘为失败或取消。

### 10.2 标签页关闭

运行期间监听 `chrome.tabs.onRemoved`：

- 关闭 `executionTabId`：调用 Runner cancel，Run 记为 `cancelled`。
- 关闭 `ownerTabId`：Workflow 可以继续执行，运行 UI 仍由同一窗口的 Side Panel 和 `runId` 承载；“返回原页面”操作失效。
- 正常结束后移除监听器，避免全局监听器累积。

### 10.3 并发运行

允许不同 Workflow 或同一 Workflow 创建多个 Run，但每个 Run 必须拥有独立执行页与取消控制器。当前 `WorkflowRunner` 把 `cancelled` 存在实例字段中，因此每次 Run 必须创建独立 Runner 实例，不能复用单例。

第一版建议同一 `workflowId` 最多一个 `running` Run。重复点击 Run 时聚焦已有执行页并提示“Automation is already running”，避免重复提交写操作。

## 11. 安全与权限

- `startUrl` 仅允许 `http:` 和 `https:`。
- 新标签页启动前校验 URL hostname 是否属于 `triggerDomains`；用户显式从当前页运行不能绕过新标签页启动校验。
- Workflow 后续跨域导航沿用既有策略。若未来启用严格域名白名单，应在每次导航后校验，而不是只检查起始页。
- 写入和不可逆步骤继续调用 `requestApproval`。
- 审批信息显示 Workflow 名称、步骤、目标域名和动作输入摘要。
- Secret 变量继续禁止进入日志和消息正文。
- 不支持 `chrome://`、`chrome-extension://`、`file://` 等受限启动地址。

## 12. 失败处理

| 场景 | 行为 | 错误码 |
| --- | --- | --- |
| 启动 URL 无效 | 不创建标签页，Run 启动失败 | `INVALID_START_URL` |
| 创建标签页失败 | 保留原页并提示错误 | `TAB_CREATE_FAILED` |
| 新页无法 attach | 保留新页，Run 失败 | `TAB_ATTACH_FAILED` |
| 用户关闭执行页 | 取消后续步骤 | `EXECUTION_TAB_CLOSED` |
| 页面跳转超时 | 保留现场，按步骤失败 | `NAVIGATION_TIMEOUT` |
| 同时打开多个候选页 | 停止，避免选错页面 | `AMBIGUOUS_NEW_TABS` |
| 所属窗口或 Side Panel 不可用且需要审批 | 等待审批超时后失败 | `APPROVAL_UI_UNAVAILABLE` |
| 执行中切换活动标签页 | 无影响，继续固定执行页 | 无 |

所有启动阶段错误和运行阶段错误都应包含 `workflowId`、`runId`、`ownerTabId`、`executionTabId` 以及失败阶段，但不得包含 secret 输入。

## 13. 兼容与迁移

- 不升级 IndexedDB schema 版本也可以添加可选字段；现有对象读取后按默认规则补齐。
- 旧 Workflow 默认保持 `current_tab`，确保升级不产生意外的新页面和跨域导航。
- Workflow 编辑页增加“Run in”设置。用户将旧 Workflow 保存为 `new_tab` 时必须填写 `startUrl`。
- 新录制 Workflow 从录制轨迹的首个稳定 HTTP(S) URL 生成 `startUrl`，默认选择 `new_tab`。
- 导入包缺少新字段时按旧 Workflow 处理。

## 14. 分阶段实施

### 阶段一：单执行标签页

该阶段可独立发布并覆盖主要体验：

- 增加 `startUrl`、`executionMode` 和 Run 标签页字段。
- Run 对话框说明会打开新标签页。
- 创建、激活、attach 新标签页。
- Workflow 固定在新 Page 中执行。
- 状态和审批按 `runId + ownerWindowId` 路由。
- 成功、失败或取消后保留执行页。
- 检测执行页被关闭并取消 Run。
- 新链接若打开额外标签页则明确停止，不自动接棒。

### 阶段二：新页面接棒

该阶段同样可独立发布：

- 为 `WorkflowService` 引入可变的主 Page 引用。
- 在动作步骤窗口内检测由当前 Page 打开的新 Page。
- 唯一新 Page 自动接棒，更新 `executionTabId`。
- 多候选页面停止并提供诊断信息。

阶段一即能完整支持“Google 搜索 JVM 并点击普通结果”的场景，因为搜索结果通常在当前标签页导航。阶段二覆盖 `target="_blank"` 和 `window.open` 场景。

## 15. 代码改动范围

预计修改：

- `src/workflows/types.ts`
  - 新增执行模式、启动 URL 和 Run 标签页字段。
- `src/sidepanel/components/WorkflowListView.tsx`
  - 发送 owner 上下文，更新 Run 文案。
- `src/sidepanel/components/WorkflowDetailView.tsx`
  - 编辑 `startUrl` 与 `executionMode`。
- `src/background/types.ts`
  - 调整运行和状态消息协议。
- `src/background/messageHandler.ts`
  - 创建执行页、构建 Run 上下文、统一 UI 路由和清理。
- `src/background/tabManager.ts`
  - 确保创建页可选择激活，并暴露稳定的 Page/tabId 获取结果。
- `src/workflows/WorkflowService.ts`
  - 接受完整执行上下文；阶段二支持 Page 接棒。
- `src/workflows/WorkflowRunner.ts`
  - 在 Run 中落盘标签页信息；审批区分 owner 与 execution。
- `src/sidepanel/hooks/useChromeMessaging.ts`
  - 支持 run 级消息及 owner 路由。
- Workflow 与 background 对应测试文件
  - 增加标签页生命周期、路由和取消测试。

该方案预计影响 8 个以上文件，但不新增服务、不引入第三方依赖，也不增加新的运行时或语言。

## 16. 测试方案

### 16.1 单元测试

- 新 Workflow 默认使用 `new_tab`。
- 旧 Workflow 缺少字段时使用 `current_tab`。
- `startUrl` 协议和域名校验。
- `ownerTabId` 与 `executionTabId` 分离。
- Workflow UI 消息按 `runId + windowId` 路由，切换活动标签页后仍能收到。
- execution 页关闭会取消正确的 Run，不影响其他 Run。
- 同一 Workflow 重复运行被拒绝或聚焦现有运行。
- secret 不出现在运行日志和错误中。

### 16.2 集成测试

1. 从任意页面运行 Google 搜索 Workflow。
2. 确认原页面 URL 和 DOM 没有变化。
3. 确认新标签页被创建并激活。
4. 确认搜索、点击和最终导航发生在新页。
5. 运行过程中手动切换标签页，确认执行目标不改变。
6. 运行过程中关闭执行页，确认 Run 变为 `cancelled`。
7. 触发写操作审批，确认审批出现在发起 Run 的 Side Panel。
8. 触发 `target="_blank"`：阶段一应安全停止；阶段二应唯一接棒。

### 16.3 手工验收

以“访问 Google，搜索 jvm，点击第一个结果”为基准：

- 点击 Run 后 1 秒级出现一个可见的新标签页。
- 用户原标签页不发生跳转。
- Automation 的全部页面操作可观察。
- 最终结果页停留在新标签页。
- Runs 中显示正确状态和执行页信息。
- 用户无需预先手动打开 google.com。

## 17. 发布与回滚

- 先以可选 `executionMode` 发布，不批量迁移旧 Workflow。
- 新建 Workflow 使用 `new_tab`，旧 Workflow 保持原行为。
- 若新标签页模式出现兼容问题，可在 UI 中切回 `current_tab`；无需回滚数据。
- 新字段均为可选，旧版本读取存储数据时会忽略它们。
- 不自动删除已创建页面，因此失败不会造成不可恢复的用户页面丢失。

## 18. 最终决策

采用“新建并激活专用标签页”作为新 Workflow 的默认执行方式，同时保留 `current_tab` 兼容模式。第一阶段先保证单页面流程、稳定消息路由和安全取消；第二阶段再加入由点击产生的新标签页接棒。

该方案假设 Workflow 可以从确定的 `startUrl` 重建初始状态。如果流程依赖当前页面未保存的表单、临时 DOM、文件选择器或一次性会话状态，则必须使用 `current_tab`，不能强制迁移到新标签页。
