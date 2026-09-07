# Replayable Workflow

## 1. 产品定义

Replayable Workflow 将一次成功的自然语言浏览任务沉淀为可编辑、可审计、可重复运行的本地 Workflow：

```text
自然语言完成一次任务
        ↓
自动生成可编辑 Workflow
        ↓
下次低成本或零 LLM 重放
        ↓
网页变化导致失败
        ↓
AI 只修复失败步骤并生成新版本
```

核心承诺：**Teach once. Run locally. Fix itself.**

第一版不把现有 Memory 直接改造成 Workflow。当前 Memory 主要保存供 LLM 参考的字符串序列，缺少结构化输入、断言、权限和版本，因此 Workflow 使用独立的数据模型和 IndexedDB。

## 2. 范围

### Building

- 任务执行轨迹的结构化录制；
- 成功任务自动生成 Workflow 候选；
- Workflow 步骤、变量、断言和审批策略编辑；
- 直接调用 ToolManager 的确定性重放；
- 步骤级运行记录、成本和耗时；
- 可修复失败的最小范围 AI 修复；
- 不可变版本、修复 diff、接受、拒绝和回滚；
- Side Panel 中的 Tasks、Workflows、Runs 三种工作视图。

### Not building

- 云端 Workflow Runner；
- 多用户协作和 SSO；
- 节点连线式低代码画布；
- 第一版的循环、并行和复杂条件表达式；
- 自动绕过 CAPTCHA；
- AI 任意改写整个 Workflow；
- 未经审批的自动购买、发送和删除；
- Skill 市场和跨设备同步。

## 3. UI 方向

### 3.1 视觉与交互原则

当前 Side Panel 应保持浅色、温和、工具型的视觉方向，但从“多个独立卡片”收敛为“一个连续的工作台”。只保留四个层级：

```text
App Header
Workspace Header
Content
Prompt + Model Status
```

减少重复圆角卡片、固定高度和大标题。颜色语义固定为：蓝色表示当前操作，绿色表示成功，琥珀色表示等待审批，红色表示失败或危险，灰色表示历史和次要信息。

### 3.2 Side Panel 布局

不增加固定的三段式导航行。三种视图使用紧凑的 Workspace 选择器，复用现有 Output 标题栏位置：

```text
BrowserOnly                         [当前网页 / Tab 状态] [•••]
Browser assistant
────────────────────────────────────────
Tasks ▾                             [Reflect] [Clear] [Expand]
────────────────────────────────────────
当前视图内容
────────────────────────────────────────
[Model ▾]              [$0.0124 · 3.8k tokens]
┌──────────────────────────────────────┐
│ Type your message                 Send│
└──────────────────────────────────────┘
```

点击 `Tasks ▾` 展开：

```text
✓ Tasks
  Workflows                         3
  Runs                              1 failed
```

规则：

- Tasks 是默认首页；
- Workflows 数量显示已保存 Workflow 数；
- Runs 显示未读失败数，而不是总运行数；
- 当前 Tab 状态始终保留在 App Header；
- Settings 和 Help 移到 Header 的 `•••` 菜单；
- 导航切换不打开新 Chrome Tab；
- 第一版使用 React state，不引入 URL 路由。

### 3.3 Tasks 视图

Tasks 保留当前对话和 Agent 执行能力：

- 当前对话、流式输出和截图；
- Approval Request 始终显示在 Prompt 上方；
- 执行状态显示为 `Ready`、`Running`、`Ready to save`、`Completed`；
- 任务成功后才显示 `Save as Workflow`；
- 失败任务可以保存为草稿，但不能自动生成 active Workflow；
- Prompt 输入固定在底部。

Output 标题不再使用泛化的 `Output`，改为 `Tasks` 或当前任务名称。

### 3.4 Workflows 视图

Workflows 是资产列表，不复用聊天卡片样式：

```text
Workflows                         [+ New]
────────────────────────────────────────
每周收集职位
linkedin.com · 5 steps · Last run 2 min ago       [Run] [•••]

整理 Gmail 未读邮件
gmail.com · 4 steps · Needs repair                 [Run] [•••]
```

列表页只显示名称、域名、步骤数、最近状态和主要操作。Edit、Duplicate、Export、Archive 放到 `•••` 菜单。

Workflow 详情使用纵向步骤列表，不做第一版节点画布：

```text
← Workflows
每周收集职位                                      [Run]

Variables
keyword       [AI engineer]
location      [Shanghai]

Steps
1. 打开招聘网站                                  ✓
2. 搜索 {{keyword}}                              ✓
3. 设置地区 {{location}}                         ✓
4. 提取职位列表                                  ✓
5. 验证结果数量 > 0                              ✓

Version: v3 active
```

### 3.5 Runs 视图

Runs 是执行历史和故障诊断，不隐藏在 Workflow 详情中：

```text
Runs                                  [Filter]
────────────────────────────────────────
⚠ 每周收集职位
  Failed · 2 min ago · 8.4s · $0.0021

✓ 整理 Gmail 未读邮件
  Succeeded · 1 h ago · 4.2s · $0.0000
```

Run 详情使用时间线：

```text
← Runs
每周收集职位 · Failed

1. 打开招聘网站                  1.2s ✓
2. 搜索 AI engineer              2.1s ✓
3. 设置地区 Shanghai             0.8s ⚠
   Element not found
   [Repair] [View screenshot]

Repair diff
- locator: text("上海")
+ locator: label("工作地点")

Cost: $0.0021   LLM calls: 1   Duration: 8.4s
```

### 3.6 Model Status Bar

底部模型和费用合并为一个 32 至 36px 高的状态栏：

```text
[Claude Sonnet 4 ▾]              $0.0124 · 3.8k tokens [ⓘ]
```

规则：

- 模型是主信息；
- 当前任务费用保持可见；
- Token 数是辅助信息；
- 详细 input、output、cache token 通过 Popover 查看；
- Provider 名称和完整模型 ID不默认展开；
- 不再使用独立灰色 Token 卡片；
- Settings、Provider configuration、Help 放入 Header 菜单。

## 4. User Stories

### Epic A：录制任务

#### US-A1 自动记录成功任务

作为用户，我希望 Agent 执行时自动记录有效步骤，以便任务成功后生成 Workflow。

验收标准：

- 记录工具名、结构化输入、结果、URL、标签页、时间和执行状态；
- 记录动作前后的轻量页面状态；
- 密码、银行卡、验证码等敏感值不落盘；
- 取消或失败任务不自动生成 active Workflow；
- 用户可以将失败任务保存为 draft。

#### US-A2 确认任务成功

作为用户，我希望系统有明确的成功依据，避免保存表面完成但实际失败的流程。

验收标准：

- 成功任务至少有一个结束断言；
- 断言可以是 URL、文本、元素、结果行数或下载文件；
- 无法生成断言时要求用户确认；
- 付款、发送、删除等操作不能仅凭工具无报错判定成功。

#### US-A3 查看并保存候选

作为用户，我希望看到 Workflow 名称、域名、步骤数、变量、敏感动作和预计 LLM 调用次数，然后选择保存、编辑或忽略。

### Epic B：编辑 Workflow

#### US-B1 编译稳定步骤

系统应移除失败尝试和重复观察，优先生成语义 locator、等待条件和断言。无法确定化的步骤必须标记为 `ai_step`，不能伪装成确定性步骤。

#### US-B2 编辑步骤

首版支持修改名称、删除和禁用步骤、调整顺序、修改变量、locator、断言和审批要求。首版不做节点画布。

#### US-B3 参数化

支持 `string`、`number`、`date`、`boolean`、`secret` 五类变量。Secret 不进入日志、导出包或 LLM 上下文。

### Epic C：重放

#### US-C1 零 LLM 重放

确定性步骤直接通过 ToolManager 执行，不重新提交用户 Prompt。运行时显示当前步骤、耗时、状态、LLM 次数和成本。

#### US-C2 安全审批

所有写入和不可逆步骤保留审批策略。导入 Workflow 后，第一次执行写操作必须重新审批。

#### US-C3 可恢复执行

每次运行产生独立 Run。状态包括 `running`、`succeeded`、`failed`、`cancelled`、`repairing`。支持从安全检查点继续，写操作失败后默认停止。

### Epic D：AI 修复

#### US-D1 识别可修复错误

可修复：元素找不到、定位歧义、等待超时、页面结构变化、断言失败。不可修复：未登录、CAPTCHA、权限不足、支付失败、网络不可用和目标失效。

#### US-D2 最小范围修复

修复上下文只包含失败步骤、相邻步骤、页面状态、错误和允许工具。AI 只能修改 locator、等待和断言，最多尝试两次。

#### US-D3 版本化

原版本保持不变。用户可以选择仅本次采用、保存新版本或拒绝修改。新版本记录修复原因、置信度和来源 Run，并支持回滚。

## 5. 技术设计

### 5.1 模块边界

```text
ExecutionEngine
      │ ToolExecutionEvent
      ▼
TraceRecorder ──▶ WorkflowCompiler ──▶ WorkflowStore
                                          │
                              WorkflowRunner ◀── UI
                                    │
                            ToolManager / AssertionEngine
                                    │
                              Browser / Playwright
                                    │ failure
                                    ▼
                           RepairCoordinator ──▶ LLM
                                    │
                              WorkflowVersion
```

`WorkflowRunner` 不通过自然语言重新进入 Agent 循环，确保确定性执行不消耗 LLM。`RepairCoordinator` 只在可修复失败时调用 LLM。

### 5.2 核心数据模型

```typescript
type WorkflowStatus = 'draft' | 'active' | 'archived';

interface Workflow {
  id: string;
  name: string;
  description: string;
  schemaVersion: 1;
  status: WorkflowStatus;
  triggerDomains: string[];
  variables: WorkflowVariable[];
  activeVersionId: string;
  createdAt: number;
  updatedAt: number;
}

interface WorkflowVersion {
  id: string;
  workflowId: string;
  version: number;
  source: 'recording' | 'manual_edit' | 'ai_repair';
  sourceRunId?: string;
  steps: WorkflowStep[];
  finalAssertions: Assertion[];
  createdAt: number;
}

interface WorkflowVariable {
  key: string;
  label: string;
  type: 'string' | 'number' | 'date' | 'boolean' | 'secret';
  required: boolean;
  defaultValue?: unknown;
}

interface StableLocator {
  role?: string;
  accessibleName?: string;
  label?: string;
  text?: string;
  testId?: string;
  css?: string;
  framePath?: string[];
  fallbackOrder: Array<'role' | 'label' | 'text' | 'testId' | 'css'>;
}

interface Assertion {
  type: 'url_matches' | 'element_visible' | 'element_absent' |
    'text_present' | 'value_equals' | 'row_count' | 'download_exists';
  expected: unknown;
  locator?: StableLocator;
  timeoutMs: number;
}
```

WorkflowStep 至少包含 `id`、`label`、`enabled`、`timeoutMs`、`retryPolicy`、`onFailure`。ActionStep 还包含 `toolName`、结构化 `input`、locator、前置断言、后置断言和 `risk`。

### 5.3 结构化工具结果

新增统一结果协议，并通过 `ToolResultNormalizer` 兼容现有字符串工具：

```typescript
interface ToolExecutionResult {
  ok: boolean;
  data?: unknown;
  error?: {
    code: 'ELEMENT_NOT_FOUND' | 'AMBIGUOUS_ELEMENT' | 'TIMEOUT' |
      'NAVIGATION_FAILED' | 'AUTH_REQUIRED' | 'CAPTCHA' |
      'PERMISSION_DENIED' | 'NETWORK_ERROR' | 'UNKNOWN';
    message: string;
    retryable: boolean;
    repairable: boolean;
  };
  pageState?: { url: string; title: string };
}
```

`ExecutionCallbacks` 增加：

```typescript
interface ToolExecutionEvent {
  executionId: string;
  toolName: string;
  input: unknown;
  result?: ToolExecutionResult;
  startedAt: number;
  endedAt?: number;
  tabId?: number;
  windowId?: number;
}
```

### 5.4 IndexedDB

使用独立数据库 `BrowserOnly-workflows`，避免影响现有 `BrowserOnly-memories`。

Object stores：

- `workflows`：元数据；
- `versions`：不可变版本；
- `runs`：运行记录；
- `stepRuns`：步骤运行详情；
- `traces`：原始录制，默认保留 30 天。

Secret 实际值使用 `chrome.storage.local`，Workflow 导出不包含 Secret、Cookie、页面正文或截图。

### 5.5 编译

第一层使用规则编译：移除失败步骤、合并观察、识别变量候选、增加断言和保留审批边界。第二层可选使用 LLM 生成可读名称、变量建议和 `ai_step` 标记。LLM 不得扩大域名、工具、风险等级或审批范围。

### 5.6 Runner 与修复

Runner 状态：`IDLE → VALIDATING → RUNNING_STEP → CHECKING_POSTCONDITION → ... → SUCCEEDED/FAILED`。每步执行前持久化状态，写操作失败默认停止，扩展重启后只自动恢复只读流程。

修复只接收受限 Patch：

```typescript
interface WorkflowPatch {
  targetStepId: string;
  changes: {
    locator?: StableLocator;
    timeoutMs?: number;
    preconditions?: Assertion[];
    postconditions?: Assertion[];
  };
  reason: string;
  confidence: number;
}
```

Patch 通过 schema、权限范围、单步骤验证、后置断言和最终断言后，才允许创建新版本。不得修改工具名、业务输入、变量值、风险等级、审批要求或目标域名。

## 6. TODO

### Phase 1：录制、生成和手动重放

这是第一个可独立发布的版本。

- [ ] 新建 `src/workflows/types.ts`；
- [ ] 新建 `src/workflows/WorkflowStore.ts` 和 IndexedDB schema；
- [ ] 实现 Workflow、Version、Run、StepRun CRUD；
- [ ] 扩展 `ExecutionCallbacks`，发出结构化工具事件；
- [ ] 新建 `ToolResultNormalizer`；
- [ ] 新建 `TraceRecorder`，实现敏感输入脱敏；
- [ ] 新建规则型 `WorkflowCompiler`；
- [ ] 新建 `WorkflowRunner` 和 `AssertionEngine`；
- [ ] 实现变量替换、超时、取消和只读重试；
- [ ] 保留写操作审批，不自动重试副作用不明的步骤；
- [ ] 新建 `TasksView`、`WorkflowsView`、`WorkflowDetailView`、`RunsView`；
- [ ] 新建 `PrimaryWorkspaceSwitcher`，使用紧凑下拉而非固定三段导航；
- [ ] 新建 `ModelStatusBar` 和费用详情 Popover；
- [ ] 将 Settings、Help 移到 Header 菜单；
- [ ] 实现候选保存、列表、编辑、复制、导入导出和归档；
- [ ] 编写搜索、表单、审批和零 LLM 重放测试；
- [ ] 运行 `npm test`、`npm run lint`、`npm run build`。

Phase 1 验收：稳定搜索任务可保存并零 LLM 重放，表单可参数化，写操作仍需审批，失败步骤可定位，导出不包含 Secret。

### Phase 2：稳定定位与检查点

- [ ] 为 click/type 工具补充结构化 locator；
- [ ] 实现 role、label、text、testId、CSS 多级定位；
- [ ] 拒绝仅依赖 XY 坐标的步骤；
- [ ] 保存轻量 DOM fingerprint；
- [ ] 增加元素缺失、值匹配、行数和文件断言；
- [ ] 写操作前建立检查点；
- [ ] 实现域名白名单和导入权限审查；
- [ ] 实现浏览器重启后的只读恢复；
- [ ] 统计 locator 成功率；
- [ ] 测试无关 DOM、CSS class 和层级变化。

### Phase 3：AI 自愈与版本管理

- [ ] 新建 `RepairCoordinator`；
- [ ] 实现错误分类和 repairable 判断；
- [ ] 生成最小修复上下文；
- [ ] 对各 Provider 增加 `WorkflowPatch` schema 校验；
- [ ] 实现 Patch 权限差异检查；
- [ ] 在单步骤沙箱中验证 Patch；
- [ ] 支持从检查点继续；
- [ ] 限制每次 Run 最多两次修复；
- [ ] 实现版本 diff、接受、拒绝和回滚；
- [ ] 支持仅使用本地模型修复；
- [ ] 统计修复成功率和后续回归。

## 7. 验收指标

- 稳定页面重放成功率 ≥ 90%；
- 可确定化步骤的 LLM 调用次数为 0；
- 第二次运行成本相比首次降低 ≥ 80%；
- 可修复定位失败的修复成功率 ≥ 70%；
- 写操作重复执行事故为 0；
- 用户能在首次任务后的 5 分钟内完成保存和第二次运行。

## 8. 关键风险与前提

最脆弱的前提是现有工具调用具有足够确定性。如果工具仍大量依赖自由文本、绝对坐标或无断言执行，Workflow 层无法提供稳定重放。因此 Phase 1 必须先完成结构化工具结果、事件记录和最小断言，Phase 3 的 AI 自愈不能替代这些基础能力。

