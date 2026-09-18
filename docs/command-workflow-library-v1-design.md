# BrowserOnly 命令与 Workflow 能力 V1 设计实现文档

> 状态：待评审  
> 目标版本：V1  
> 涉及范围：命令与 Workflow 模板库、快捷页面操作、结构化提取、Web Session Connections  
> 优先级：P0 + P1

## 1. 背景

BrowserOnly 已经具备自然语言浏览器操作、页面读取、网页翻译、Workflow 录制与重放、变量输入、执行记录和风险审批等能力。当前主要问题不是缺少底层执行能力，而是用户很难发现这些能力，也难以把一次成功操作快速转化为可重复使用的工具。

本版本将三个能力收敛成一套统一体验：

1. 命令与 Workflow 模板库：让用户能搜索、预览、配置并运行现成 Workflow。
2. 快捷页面操作：让用户从当前网页或选中文本直接发起常用动作。
3. 结构化提取：让用户描述字段，将网页内容转换为表格、CSV 或 JSON，并保存为可重放 Workflow。
4. Web Session Connections：让用户复用浏览器中现有的 ChatGPT、Claude 或 Gemini 登录状态和订阅权益，无需配置 API Key。

三个功能共用模板、参数、执行和结果模型，避免形成三套互不兼容的功能。

## 2. 产品目标

### 2.1 核心目标

- 用户无需先理解 Agent 或 Workflow 概念，也能在 10 秒内找到并运行一个常用动作。
- 用户能够判断模板会读取什么、操作什么、输出什么，再决定是否运行。
- 用户能够把一次结构化提取或快捷操作保存成 Workflow，并在下次低成本重放。
- 用户可以从模板库、Tasks 输入框、网页右键菜单三个入口进入同一套执行流程。
- 延续 BrowserOnly 的本地优先、显式页面上下文和敏感操作审批原则。
- 降低首次使用门槛，让已有 ChatGPT Plus、Claude Pro 或 Gemini Advanced 订阅的用户直接使用账号可用模型。

### 2.2 成功指标

- 新用户首次安装后，50% 以上能在 3 分钟内完成一次模板运行。
- 模板预览到运行的转化率达到 40%。
- 成功运行后保存为 Workflow 的比例达到 15%。
- 快捷页面操作从触发到结果展示的中位时间低于 8 秒，不含模型响应时间。
- 结构化提取的有效结果率达到 80%，有效指字段基本完整且可以正常导出。

## 3. 非目标

V1 不包含以下内容：

- 在线模板市场、评分、评论和作者主页。
- 模板云同步、付费模板和多人协作。
- 节点连线式低代码画布。
- 社区模板自动执行或远程更新。
- 复杂循环、并行分支和通用条件表达式。
- 未经确认的表单提交、发送消息、购买和删除操作。
- 面向任意网页的长期后台监控与定时调度。
- 读取、导出或持久化用户 Cookie、Session Token 或 Authorization Header。
- 调用通过逆向工程获得的 AI 服务私有接口。
- 绕过验证码、速率限制、地区限制、模型权限或平台安全措施。
- 承诺 Web Session 与 API 具备完全相同的稳定性、配额、参数控制或后台运行能力。

## 4. 设计原则

### 4.1 一个执行模型

模板、快捷操作和结构化提取最终都转换成以下两类执行单元之一：

- `Workflow`：可版本化、可保存、可重复运行的确定性步骤。
- `InstantAction`：一次性动作。运行成功后可转换为 Workflow。

不新增第二套 Workflow Runner。需要浏览器操作的能力继续由现有 `WorkflowService` 和 `WorkflowRunner` 执行。

### 4.2 搜索优先，分类辅助

模板库首先解决“我想完成什么”，因此搜索框是主入口。分类只用于缩小范围，不采用多层目录。

### 4.3 当前页面优先

系统根据当前域名、页面类型、是否存在选中文本和可识别内容，优先展示适用于当前页面的操作和模板。

### 4.4 运行前可预期

任何动作在运行前都应说明：

- 将读取哪些页面或选中文本。
- 是否会打开新标签页。
- 是否包含写入或不可逆操作。
- 将产生何种输出。

### 4.5 渐进披露

首屏只呈现名称、用途和主要动作。步骤、权限、变量和输出格式在预览或参数页面展开，避免侧栏过载。

## 5. 信息架构

顶级工作区保持不变：

```text
Tasks | Automations | More
```

`Automations` 内部增加两个视图：

```text
Automations
[ My workflows ] [ Templates ]
```

- `My workflows`：用户已保存的 Workflow。
- `Templates`：内置模板和快捷能力目录。
- 快捷页面操作不新增顶级页面，通过右键菜单、页面操作栏和 Tasks 输入框触发。
- 结构化提取既是快捷操作，也是一类可保存模板。

## 6. 统一用户流程

```text
模板库 / 斜杠命令 / 网页右键菜单
                  ↓
             Action Resolver
                  ↓
       预览或参数确认，需要时显示
                  ↓
     Workflow Run / Instant Action Run
                  ↓
          Result View + Run Record
                  ↓
       Save as Workflow，可选操作
```

### 6.1 Action Resolver

`Action Resolver` 是 UI 层的统一解析器，负责将入口事件解析成标准动作：

```ts
type ActionSource = 'template_library' | 'slash_menu' | 'context_menu' | 'page_actions';

interface ActionInvocation {
  actionId: string;
  source: ActionSource;
  tabId: number;
  windowId: number;
  pageUrl?: string;
  pageTitle?: string;
  selectionText?: string;
  presetValues?: Record<string, unknown>;
}
```

它只负责路由和填充上下文，不直接执行浏览器操作。

内置命令和用户 Workflow 统一注册到 Action Registry。`/` 选择器读取 Registry，而不是维护另一份命令列表：

```ts
type ActionKind = 'built_in' | 'workflow';
type ActionRunBehavior = 'direct' | 'configure' | 'confirm';

interface ActionDefinition {
  id: string;
  kind: ActionKind;
  slashCommand: string;
  name: string;
  description: string;
  keywords: string[];
  runBehavior: ActionRunBehavior;
  supportedContexts: Array<'page' | 'selection' | 'tabs'>;
  workflowId?: string;
}
```

`ActionDefinition` 只描述发现和启动方式。实际执行仍由对应的内置 Action Handler 或 Workflow Runner 完成。

## 7. P0：命令与 Workflow 模板库

### 7.1 用户故事

- 作为新用户，我希望看到当前网页能使用的模板，而不是面对空白输入框。
- 作为熟练用户，我希望通过搜索或 `/` 快速找到模板并用键盘运行。
- 作为谨慎用户，我希望运行前看到步骤、权限和输入参数。
- 作为重复任务用户，我希望把模板保存为自己的 Workflow 并继续编辑。

### 7.2 页面结构

#### 7.2.1 My workflows

```text
Automations                                      [+ New]

[ Search workflows and templates...                  ]

[ My workflows ]  [ Templates ]

RECENT
──────────────────────────────────────────────────────
Weekly job search
linkedin.com · 5 steps · Ran 2h ago              [Run]

Summarize unread emails
gmail.com · 4 steps · Needs review                [Run]
```

交互规则：

- 默认进入 `My workflows`。
- 搜索框同时搜索用户 Workflow 和模板。
- `Run` 是列表中的唯一常驻强操作。
- `Edit`、`Duplicate`、`Export`、`Archive` 收入行尾 `More` 菜单。
- Workflow 使用连续列表和分隔线，不使用多层独立卡片。

#### 7.2.2 Templates

```text
Templates

[ Search templates...                                 ]

[For this page] [Research] [Shopping] [Data] [Writing]

RECOMMENDED FOR GITHUB.COM
──────────────────────────────────────────────────────
Summarize this repository
Understand structure, setup and key files         [Use]

Review a pull request
Summarize changes and possible risks              [Use]

POPULAR
──────────────────────────────────────────────────────
Compare products across tabs
Research · Opens new tabs                         [Use]
```

展示规则：

- `For this page` 根据当前域名和页面能力动态计算。
- 用户进入模板页时默认选中 `For this page`。无匹配模板时退回 `All`。
- 分类使用单层横向筛选标签，允许横向滚动。
- 模板项只显示名称、价值描述、运行环境和 `Use`。
- 分类、搜索词和当前域名共同参与过滤。

### 7.3 模板预览

```text
Back to Templates

Compare products across tabs

Collect product name, price, rating and shipping
information from selected product tabs.

Works with
Most product pages

What it will do
1. Read product information from selected tabs
2. Normalize prices and ratings
3. Build a comparison table
4. Highlight the best options

Inputs
Tabs                                      3 selected
Maximum results                                  10

Permissions
Reads selected tabs
Does not submit forms
Does not send messages

                              [Customize] [Run now]
```

行为定义：

- 点击模板主体或 `Use` 都进入预览页。
- `Run now` 打开参数页或直接执行无参数模板。
- `Customize` 将模板实例化为草稿 Workflow，并进入现有 Workflow 编辑器。
- 模板自身不可编辑，用户编辑的是本地副本。
- 模板包含写入或不可逆步骤时，必须明确显示风险，并沿用现有审批机制。

### 7.4 参数表单

参数表单使用侧栏内页面，不使用居中 Modal：

```text
Back to Compare products

Set up this run

Product tabs *
[ Amazon: Sony WH-1000XM6                         x ]
[ Amazon: Bose QuietComfort                       x ]
[ Add current tab                                   ]

Maximum results
[ 10                                                ]

Output format
[ Table ] [ CSV ] [ JSON ]

Run in
New background tab

──────────────────────────────────────────────────────
                                         [Run workflow]
```

字段映射：

| 类型 | 控件 | 校验 |
|---|---|---|
| `string` | 单行输入 | 必填、最大长度、可选正则 |
| `number` | 数字输入 | 最小值、最大值、步长 |
| `date` | 日期选择器 | 最早、最晚日期 |
| `boolean` | 开关 | 无 |
| `secret` | 密码输入 | 不进入日志，不写入模板 |
| `enum` | 下拉或单选 | 必须来自候选值 |
| `url` | URL 输入 | `http` 或 `https` |
| `tab` | 标签页选择器 | 标签页仍存在且可访问 |
| `tabs` | 多标签页选择器 | 至少选择一个标签页 |
| `fields` | 字段编辑器 | 至少一个有效字段 |

现有 `WorkflowVariableType` 需要新增 `enum`、`url`、`tab`、`tabs` 和 `fields`。老数据继续按原有类型读取。

### 7.5 斜杠命令

Tasks 输入框支持通过 `/` 选择内置命令和用户 Workflow。输入框默认提示：

```text
Ask anything, or type / for quick actions
```

用户输入 `/` 后显示命令面板：

```text
/sum

QUICK ACTIONS
/summarize       Summarize the current page
/translate       Translate the current page
/extract         Extract structured data
/compare         Compare selected tabs

WORKFLOWS
/weekly-jobs     Weekly job search
/product-table   Extract product information

↑↓ Select · Enter Confirm · Esc Close
```

规则：

- `/` 打开面板，继续输入进行模糊搜索。
- 内置命令和用户 Workflow 在同一面板中展示，但分别归入 `Quick actions` 和 `Workflows`。
- V1 内置命令至少包含 `/summarize`、`/translate`、`/extract` 和 `/compare`。
- 命令同时匹配别名、名称、描述和关键词，例如 `/sum` 可以匹配 `/summarize`。
- 排序依次考虑当前上下文可用性、当前页面匹配度、名称匹配度、最近使用时间和使用次数。
- 当前上下文不可用的命令不显示。例如没有可比较标签页时隐藏 `/compare`。
- 支持方向键选择、Enter 确认、Escape 关闭。
- 用户 Workflow 使用稳定的本地别名。重名时在别名后追加短标识，并在界面中显示完整名称。
- `/` 是结构化 Action 选择器，不向 textarea 插入普通提示词。

#### 7.5.1 选择后的命令块

选择内置命令后，textarea 上方显示可移除的命令块，textarea 保留给用户输入补充要求：

```text
[ Summarize current page  x ]

[ Focus on prices, limitations and risks...          ]
```

命令块保存 `actionId` 和已解析的页面上下文。用户看到的是可读名称，不显示内部 ID 或技术参数。删除命令块后恢复普通聊天输入。

用户选择命令后仍可补充自然语言。例如选择 `Summarize current page` 后输入“重点总结价格、限制条件和风险”。补充文字作为该 Action 的 `instruction`，不重新解析成另一条命令。

#### 7.5.2 运行行为

| 命令类型 | 选择后行为 |
|---|---|
| `/summarize` | 可直接发送，也可补充总结重点 |
| `/translate` | 使用默认翻译设置直接执行 |
| `/extract` | 打开字段和输出格式配置页 |
| `/compare` | 打开标签页选择器和比较维度配置 |
| 无参数用户 Workflow | 显示简短运行确认 |
| 有参数用户 Workflow | 打开统一参数页 |
| 包含写入或不可逆操作的 Workflow | 显示风险说明，执行到风险步骤时继续使用现有审批机制 |

#### 7.5.3 新用户提示

提示采用渐进方式，不长期占用侧栏空间：

1. 新用户前 3 次聚焦输入框时，在输入框上方显示 `Tip: Type / to choose a quick action`。
2. 输入框长期使用占位文案 `Ask anything, or type / for quick actions`。
3. 中文界面对应文案为 `输入 / 选择快捷操作`。
4. 用户首次成功通过 `/` 执行命令后，不再显示聚焦提示。
5. 提示不使用弹窗、红点或强制教学遮罩。

提示状态保存在 `chrome.storage.local`：

```ts
interface SlashCommandHintState {
  focusHintCount: number;
  hasCompletedSlashAction: boolean;
}
```

### 7.6 新建菜单

`+ New` 菜单调整为：

```text
From template
Describe a workflow
Record current task
Blank workflow
```

- `From template`：打开模板库。
- `Describe a workflow`：切换到 Tasks，并预填 Workflow 创建意图。
- `Record current task`：仅在存在成功执行轨迹时可用。
- `Blank workflow`：创建空白草稿并进入编辑器。

### 7.7 模板数据模型

模板使用只读静态目录。V1 跟随扩展版本发布，不依赖远程服务。

```ts
type TemplateCategory = 'page' | 'research' | 'shopping' | 'productivity' | 'data' | 'writing';
type TemplateRisk = 'read' | 'write' | 'irreversible';

interface WorkflowTemplate {
  id: string;
  schemaVersion: 1;
  name: string;
  description: string;
  category: TemplateCategory;
  tags: string[];
  icon: string;
  triggerDomains: string[];
  pageMatchers?: Array<{
    urlPattern?: string;
    requiredSignals?: string[];
  }>;
  risk: TemplateRisk;
  executionMode: WorkflowExecutionMode;
  variables: WorkflowTemplateVariable[];
  version: Omit<WorkflowVersion, 'id' | 'workflowId' | 'createdAt'>;
  output?: ActionOutputDefinition;
}

interface WorkflowTemplateVariable extends WorkflowVariable {
  description?: string;
  placeholder?: string;
  options?: Array<{ label: string; value: string }>;
  validation?: {
    min?: number;
    max?: number;
    maxLength?: number;
    pattern?: string;
  };
}
```

### 7.8 模板服务

新增 `TemplateCatalog`，职责包括：

- 加载和校验内置模板。
- 按分类、搜索词、域名和页面信号过滤。
- 计算当前页面推荐分数。
- 将模板实例化为本地 Workflow。
- 记录最近使用时间和使用次数。

模板实例化后生成新的 `workflowId` 和 `versionId`，并将来源记录为 `template`。因此 `WorkflowVersion.source` 需要新增 `template`。

## 8. P1：快捷页面操作

### 8.1 入口

V1 提供三个入口：

1. 选中文本后的 Chrome 右键菜单。
2. 页面空白区域的 Chrome 右键菜单。
3. Side Panel 中当前页面操作栏。

不在网页 DOM 内注入悬浮按钮。这样可以减少页面样式冲突、误触和内容遮挡。

### 8.2 右键菜单设计

选中文本时：

```text
BrowserOnly
  Summarize selection
  Translate selection
  Extract from selection...
  Run workflow...
  Send to BrowserOnly
```

页面空白区域时：

```text
BrowserOnly
  Summarize this page
  Translate this page
  Extract structured data...
  Run workflow...
```

实现要求：

- 使用一个父菜单 `BrowserOnly`，避免占满 Chrome 一级右键菜单。
- 菜单项根据 `selection` 和 `page` context 分别注册。
- `Run workflow...` 打开 Side Panel，并显示当前页面适用的 Workflow 列表。
- `Extract...` 打开结构化提取字段配置页。
- `Translate selection` 继续复用现有翻译链路。
- 所有菜单点击都创建标准 `ActionInvocation`，通过统一消息进入 Side Panel。

### 8.3 页面操作栏

在 Tasks 顶部、当前标签页状态下方显示一行低强调操作：

```text
Current page
[Summarize] [Translate] [Extract] [Workflows]
```

规则：

- 只在当前标签页可读取时显示。
- Side Panel 宽度不足时保留前三项，将其余动作收入 `More`。
- 操作栏不使用彩色大按钮，选中状态和主要动作才使用品牌蓝色。
- `Workflows` 展开当前域名适用 Workflow，不直接进入完整模板库。

### 8.4 快捷操作行为

| 操作 | 默认输入 | 默认输出 | 是否直接执行 |
|---|---|---|---|
| 总结选中文本 | `selectionText` | Markdown 摘要 | 是 |
| 总结当前页面 | 当前页主要内容 | Markdown 摘要 | 是 |
| 翻译选中文本 | `selectionText` | 页面内翻译或结果卡片 | 是 |
| 翻译当前页面 | 当前页 | 双语页面 | 是 |
| 结构化提取 | 当前页或选中文本 | 表格 | 否，先配置字段 |
| 执行 Workflow | 当前页和匹配模板 | 取决于 Workflow | 否，先选择 Workflow |

### 8.5 Side Panel 接收状态

右键动作触发后：

1. 打开 Side Panel。
2. 切换到 Tasks。
3. 显示一条本地动作消息，例如 `Summarize selected text`。
4. 对需要参数的动作进入参数页。
5. 执行后以标准消息或结果表格展示。

不得把大段选中文本直接写入输入框。输入框只显示动作名称，完整文本保存在临时调用上下文中，避免误编辑和隐私暴露。

### 8.6 消息协议

新增消息类型：

```ts
interface InvokeActionMessage {
  action: 'invokeAction';
  invocation: ActionInvocation;
}

interface PendingActionMessage {
  action: 'getPendingAction';
  tabId: number;
  windowId: number;
}
```

Service Worker 将待处理动作按 `windowId + tabId` 暂存。Side Panel 初始化后读取并消费，消费后立即删除。

## 9. P1：结构化提取

### 9.1 用户故事

- 作为用户，我希望用自然语言描述需要的字段，而不是编写 CSS 选择器。
- 作为数据用户，我希望先预览结果，再导出 CSV 或 JSON。
- 作为重复任务用户，我希望把本次提取保存成 Workflow。
- 作为谨慎用户，我希望知道数据来自当前页面、选中文本还是多个标签页。

### 9.2 字段配置页

```text
Back

Extract structured data

Source
[ Current page ] [ Selected text ] [ Open tabs ]

Describe what you need
[ Product name, current price, rating and stock status ]

Fields
Product name       text       required
Price              number     required
Rating             number     optional
In stock           boolean    optional

[ Add field ]                     [Suggest fields]

Output
[ Table ] [ CSV ] [ JSON ]

                                      [Extract data]
```

支持两种字段创建方式：

- 用户直接编辑字段名称和类型。
- 用户输入一句描述，点击 `Suggest fields`，由模型生成字段草稿，用户确认后执行。

V1 不允许模型生成并直接执行未展示的字段定义。

### 9.3 字段模型

```ts
type ExtractionFieldType = 'text' | 'number' | 'boolean' | 'date' | 'url';

interface ExtractionField {
  key: string;
  label: string;
  description?: string;
  type: ExtractionFieldType;
  required: boolean;
  multiple?: boolean;
}

interface ExtractionRequest {
  source: {
    type: 'current_page' | 'selection' | 'tabs';
    tabIds: number[];
    selectionText?: string;
  };
  instruction?: string;
  fields: ExtractionField[];
  outputFormat: 'table' | 'csv' | 'json';
  maxRows: number;
}

interface ExtractionResult {
  columns: ExtractionField[];
  rows: Array<Record<string, string | number | boolean | null>>;
  warnings: string[];
  sourceUrls: string[];
  generatedAt: number;
}
```

### 9.4 提取执行策略

采用两阶段执行：

1. DOM 候选提取：复用现有页面读取、DOM AST 和主内容提取能力，收集列表、表格、重复结构和可见文本。
2. 模型归一化：模型根据已确认字段将候选内容转换为严格 JSON。

执行约束：

- 使用 JSON Schema 或等价的 Zod 校验确保字段结构稳定。
- 模型返回无效 JSON 时只允许一次格式修复重试。
- 缺失字段填 `null`，不编造值。
- 每次结果保留来源 URL 和警告。
- 默认最多 100 行，超过上限时提示用户缩小范围。
- 选中文本优先于整页内容，避免把无关页面内容发送给模型。

### 9.5 结果页面

```text
Extraction complete                         24 rows

[ Table ] [ JSON ]

Product             Price       Rating       In stock
──────────────────────────────────────────────────────
Sony WH-1000XM6     449.99      4.7          Yes
Bose QuietComfort   349.00      4.6          Yes

2 rows have missing ratings

[Copy] [Download CSV] [Download JSON]

                          [Save as workflow] [Done]
```

交互要求：

- Table 是默认结果视图。
- 表格允许横向滚动，首列固定。
- JSON 视图使用等宽字体并支持复制。
- CSV 和 JSON 下载复用现有 `downloads` 权限。
- 警告显示在数据下方，不使用阻断式弹窗。
- `Save as workflow` 打开保存确认页。

### 9.6 保存为 Workflow

保存时生成以下步骤：

1. 打开或确认目标页面。
2. 读取当前页面或指定页面范围。
3. 使用已确认的字段定义执行结构化提取。
4. 验证结果行数大于零。
5. 展示或下载指定格式。

需要在 Workflow 工具白名单中新增确定性工具：

```text
browser_extract_structured
browser_export_data
```

`browser_extract_structured` 的输入包含字段定义、来源范围和行数上限。它可以包含受限的 `ai_step`，但不得允许模型任意调用浏览器工具。

`browser_export_data` 只负责把上一步标准结果转换为 CSV 或 JSON，并触发下载。导出本身属于可恢复写入，不需要不可逆操作审批。

## 10. UI 视觉与交互规范

### 10.1 视觉方向

延续现有浅色、温和、工具型工作台。界面强调内容层级和任务状态，不通过大面积装饰或多色卡片区分功能。

### 10.2 组件规则

- 页面背景继续使用浅灰，主要内容使用白色或透明连续列表。
- 相邻层级通过 1px 边框或背景明度区分，不堆叠阴影。
- 品牌蓝只用于主按钮、选中标签、焦点边框和当前操作。
- 成功使用绿色，等待审批使用琥珀色，失败使用红色。
- 模板和 Workflow 列表统一行高和文本层级。
- 主要按钮高度不低于 32px，紧凑图标按钮触控区域不低于 32px。
- 任何交互都必须有键盘焦点状态。

### 10.3 排版层级

| 层级 | 用途 | 建议样式 |
|---|---|---|
| Page title | 页面名称 | 16px，600 |
| Item title | 模板或 Workflow 名称 | 14px，600 |
| Body | 描述与参数 | 12px 到 13px，400 |
| Meta | 域名、步骤数、状态 | 11px，400 |
| Section label | 分组标题 | 11px，600，大写或增加字距 |

### 10.4 动效

- 列表进入详情使用 160ms 横向推入。
- 返回时反向移动，保留层级方向感。
- 搜索结果使用 100ms 淡入，不做逐项弹跳。
- 参数错误仅改变字段边框和错误文案，不抖动表单。
- 尊重 `prefers-reduced-motion`。

### 10.5 响应式

主要设计宽度为 320px 到 480px：

- 小于 360px 时，分类标签横向滚动。
- 小于 340px 时，页面操作栏将 `Workflows` 收入 `More`。
- 参数表单始终单列。
- 结果表格允许横向滚动，不压缩到不可读宽度。
- 固定底部主操作不能覆盖表单最后一个字段。

### 10.6 无障碍

- 所有图标按钮提供 `aria-label`。
- Tabs、菜单和命令面板支持键盘操作。
- 当前选项使用 `aria-selected` 或 `aria-current`。
- 错误信息通过 `aria-describedby` 关联字段。
- 文本和背景对比度满足 WCAG AA。
- 不使用颜色作为唯一状态提示。

## 11. 技术设计

### 11.1 模块关系

```text
TemplateCatalog ───────┐
                      ├── ActionResolver ── RunSetupView
Quick Page Actions ───┤                         │
                      │                         ▼
Slash Command Menu ───┘               WorkflowService
                                                │
StructuredExtractionService ────────────────────┤
                                                ▼
                                     WorkflowStore / Runs
```

### 11.2 新增前端组件

建议新增：

```text
src/sidepanel/components/templates/
  TemplateLibraryView.tsx
  TemplateSearch.tsx
  TemplateCategoryTabs.tsx
  TemplateListItem.tsx
  TemplateDetailView.tsx
  RunSetupView.tsx
  SlashCommandMenu.tsx

src/sidepanel/components/actions/
  PageActionBar.tsx
  WorkflowPicker.tsx
  PendingActionRouter.tsx

src/sidepanel/components/extraction/
  ExtractionSetupView.tsx
  ExtractionFieldEditor.tsx
  ExtractionResultView.tsx
  DataTable.tsx
```

### 11.3 新增领域模块

```text
src/templates/
  types.ts
  TemplateCatalog.ts
  templateMatcher.ts
  templateInstantiation.ts
  catalog/*.json

src/actions/
  types.ts
  ActionResolver.ts
  actionRegistry.ts
  builtInActions.ts

src/extraction/
  types.ts
  StructuredExtractionService.ts
  extractionSchema.ts
  exporters.ts
```

### 11.4 修改现有模块

| 文件 | 修改内容 |
|---|---|
| `src/sidepanel/components/WorkflowListView.tsx` | 增加 My workflows 与 Templates 视图、统一搜索和新建菜单 |
| `src/sidepanel/components/WorkflowDetailView.tsx` | 支持模板实例化来源和新增变量类型 |
| `src/sidepanel/components/PromptForm.tsx` | 增加 `/` 命令面板、命令块、补充指令输入、提示状态和键盘导航 |
| `src/sidepanel/SidePanel.tsx` | 增加页面操作栏、待处理动作路由和结果页面状态 |
| `src/background/index.ts` | 重构右键菜单为父子菜单，增加页面和提取动作 |
| `src/background/types.ts` | 增加动作调用、提取和模板相关消息类型 |
| `src/background/messageHandler.ts` | 处理待执行动作、结构化提取和模板运行 |
| `src/workflows/types.ts` | 扩展变量类型、版本来源和结构化输出定义 |
| `src/workflows/WorkflowService.ts` | 注册结构化提取和导出工具 |
| `src/workflows/WorkflowStore.ts` | 保存模板来源、最近使用和可选结果元数据 |

预计涉及超过 8 个文件，应拆成三个可独立合并的阶段。

### 11.5 Action 输出模型

```ts
interface ActionOutputDefinition {
  type: 'markdown' | 'table' | 'json' | 'download';
  title?: string;
  downloadableFormats?: Array<'csv' | 'json'>;
}

interface ActionResult {
  actionId: string;
  status: 'succeeded' | 'failed' | 'cancelled';
  output: unknown;
  outputDefinition: ActionOutputDefinition;
  warnings?: string[];
  runId?: string;
}
```

结果层根据 `outputDefinition.type` 选择现有 Markdown 消息、表格结果、JSON 查看器或下载反馈。

### 11.6 本地存储

V1 模板目录打包在扩展中。用户状态保存到 `chrome.storage.local`：

```ts
interface TemplateUsageState {
  templateId: string;
  useCount: number;
  lastUsedAt: number;
}
```

斜杠提示状态同样保存到 `chrome.storage.local`。它只记录提示次数和是否完成过命令，不记录搜索词、补充指令或选中的页面内容。

以下信息不得写入模板使用状态：

- 选中文本。
- 页面正文。
- Secret 类型参数。
- 提取结果内容。

用户保存成 Workflow 后，变量默认值遵循现有本地存储策略。Secret 参数默认不保存。

## 12. 内置模板范围

V1 建议内置 12 个模板，控制质量而不是数量：

### 当前页面

1. 总结当前页面。
2. 提取关键事实和引用。
3. 将页面整理为结构化表格。

### 研究

4. 比较多个标签页。
5. 汇总多个来源的共同点和分歧。
6. 提取文章标题、作者、日期和摘要。

### 购物

7. 比较多个商品页面。
8. 提取商品名称、价格、评分和库存。

### 数据

9. 从当前页面提取自定义字段。
10. 从列表页提取重复项目。
11. 导出当前页面表格为 CSV。

### 写作

12. 总结或改写选中文本。

每个模板必须通过至少两个真实网站样本验证。站点专用模板必须明确声明适用域名。

## 13. 分阶段实施

### 阶段 1：模板库与统一运行配置，P0

交付内容：

- 模板数据模型和静态目录。
- TemplateCatalog、搜索、分类和页面匹配。
- My workflows 与 Templates 双视图。
- 模板预览和侧栏内参数表单。
- Run now、Customize 和 Save as workflow。
- Tasks 输入框 `/` 命令面板。

阶段完成后，用户可以从模板库和斜杠命令发现并运行模板。本阶段独立可发布。

### 阶段 2：快捷页面操作，P1

交付内容：

- 统一父级右键菜单。
- 页面操作栏。
- PendingActionRouter 和 ActionInvocation 消息协议。
- 总结、翻译、提取和 Workflow 选择入口。

阶段完成后，用户可以从网页和选中文本直接调用已有能力。本阶段不依赖结构化提取完整结果页，可以先将 Extract 路由到基础字段配置页。

### 阶段 3：结构化提取，P1

交付内容：

- 字段建议与字段编辑器。
- DOM 候选提取和模型归一化。
- 严格结果校验和一次修复重试。
- Table、CSV、JSON 结果视图与导出。
- 将提取配置保存为 Workflow。
- Workflow 提取和导出工具。

阶段完成后，结构化提取形成从一次执行到可重放 Workflow 的完整闭环。

### 阶段 4：Web Session Connections，P1

交付内容：

- Web Session Provider 抽象和连接状态模型。
- ChatGPT Web 首个适配器，包括登录检测、专用标签页、文本请求、流式回答和取消生成。
- 模型菜单中的 Web Connections 分组和连接验证。
- 对 Ask、内置命令和交互式 Operator 的分级支持。
- 登录过期、限流、验证页面和网页结构变化的明确错误状态。
- API 或 Ollama Provider 的手动切换入口，不做无提示自动切换。

阶段完成后，用户可以使用现有 ChatGPT 登录和账号订阅权益运行 BrowserOnly。Claude 和 Gemini 适配器在 ChatGPT 路径稳定后按同一接口增加，不阻塞本阶段发布。

## 14. 测试计划

### 14.1 单元测试

- 模板 Schema 校验和无效模板拒绝。
- 分类、搜索、域名匹配和排序。
- 模板实例化时 ID、版本、变量和风险正确复制。
- ActionInvocation 在窗口和标签页之间正确隔离。
- 参数校验覆盖所有变量类型。
- 提取 JSON Schema 校验、缺失字段和格式修复。
- CSV 转义覆盖逗号、换行、双引号和 Unicode。
- Secret 参数不进入日志和本地使用状态。
- Web Session 状态识别、Provider 能力判断和错误归类。
- Web Session 不读取或持久化 Cookie、Session Token 和 Authorization Header。

### 14.2 组件测试

- 模板搜索、分类切换和空状态。
- 模板详情、Run now 和 Customize。
- 参数必填、错误提示和键盘提交。
- `/` 命令面板的方向键、Enter 和 Escape。
- `/sum` 能匹配 `/summarize`，内置命令与用户 Workflow 正确分组。
- 选择命令后生成结构化命令块，补充文字不会覆盖 `actionId`。
- 直接执行、参数配置和运行确认三种行为正确路由。
- 聚焦提示最多显示 3 次，首次成功执行后停止显示。
- 页面操作栏在窄宽度下的折叠。
- 提取结果表格、JSON 切换、复制和下载。

### 14.3 集成测试

- 从模板库运行一个无参数 Workflow。
- 从模板库填写参数并在新标签页运行。
- 从右键选中文本执行总结和翻译。
- 从右键菜单进入结构化提取并导出 CSV。
- 将提取结果保存为 Workflow，再次运行并得到相同字段结构。
- 当前标签页关闭后，待处理动作安全失败并给出提示。
- 多窗口同时触发不同动作时互不串扰。
- 已登录 ChatGPT 时可以验证连接、发送请求、接收流式回答并取消生成。
- 未登录、会话过期、限流和验证页面分别显示可操作错误。
- Web Session Provider 标签页与 BrowserOnly 正在操作的业务标签页互不抢占。
- Web Session 失败后可以保留当前任务，并由用户切换到 API 或 Ollama 重试。

### 14.4 手工验收

- 在 320px、375px、480px 三种侧栏宽度检查布局。
- 检查中文和英文长文案，不出现按钮溢出或孤行。
- 仅使用键盘完成模板搜索、参数输入和运行。
- 开启减少动态效果后检查页面切换。
- 验证所有读取范围和风险说明与实际行为一致。
- 验证敏感参数没有出现在控制台、Run 记录或导出文件名中。
- 验证 Web Session 首次连接前展示数据发送范围和稳定性说明。
- 验证 ChatGPT Plus、Claude Pro 或 Gemini Advanced 只显示账号实际可用能力，不根据订阅名称猜测模型。

## 15. 验收标准

### 模板库

- 用户可以通过搜索、分类和当前页面推荐找到模板。
- 用户运行前可以看到步骤、输入、输出和权限。
- 有参数模板不能绕过必填校验。
- Run now 不会自动创建本地 Workflow。
- Customize 和运行后保存都会生成独立可编辑 Workflow。
- 用户可以在 Tasks 输入框中通过 `/` 搜索内置命令和已保存 Workflow。
- `/summarize`、`/translate`、`/extract` 和 `/compare` 根据上下文正确显示和执行。
- 选择命令后显示可移除的命令块，textarea 仍可输入补充要求。
- 新用户能看到 `输入 / 选择快捷操作` 提示，完成一次 `/` 操作后不再重复打扰。

### 快捷页面操作

- 选中文本和页面右键菜单展示不同动作。
- 右键动作能可靠打开 Side Panel 并恢复调用上下文。
- 多窗口和多标签页之间不会串用选中文本或页面上下文。
- 总结和翻译可以直接执行，提取和 Workflow 先确认参数。

### 结构化提取

- 用户可以通过自然语言生成字段草稿并在执行前编辑。
- Table、CSV 和 JSON 使用同一份标准结果。
- 缺失字段为 `null`，且警告可见。
- 导出的 CSV 和 JSON 可以被常见工具正常打开。
- 保存后的 Workflow 可以在相同类型页面上重放。

### Web Session Connections

- 用户登录对应 AI 官方网站后，可以在 BrowserOnly 中验证并选择 Web Connection。
- Web Connection 使用用户账号当前实际可用的模型和订阅权益，不要求 API Key。
- 界面明确说明 Web Session 仍受订阅方案、网页配额、会话过期和平台限制影响。
- 登录过期、限流、需要验证、网页适配器失效和服务不可用具有不同状态与处理建议。
- BrowserOnly 不读取、复制、导出或持久化 Cookie、Session Token 和 Authorization Header。
- Web Session 不可用时，用户可以保留任务上下文并切换到 API 或 Ollama。

## 16. 风险与处理

| 风险 | 影响 | 处理方式 |
|---|---|---|
| 模板数量增长后难以维护 | 模板失效和质量下降 | V1 保持静态小目录，每个模板绑定测试样本 |
| 页面结构变化导致提取失败 | Workflow 成功率下降 | 使用语义字段、DOM 候选和现有修复机制，避免只依赖 CSS |
| 右键动作丢失上下文 | 用户看到空 Side Panel | 按 windowId 和 tabId 暂存，消费前校验标签页仍存在 |
| 模型生成错误字段或数据 | 结果不可信 | 字段先确认，结果严格校验，缺失值不推测 |
| 侧栏内容层级过深 | 用户迷路 | 统一返回入口，最多三层：列表、详情、参数或结果 |
| 模板和用户 Workflow 混淆 | 用户误以为修改了内置模板 | 模板只读，Customize 明确创建本地副本 |
| Secret 参数泄漏 | 隐私风险 | 不持久化、不写日志、不进入运行摘要 |
| AI 网站改版 | Web Session 连接失效 | 每个 Provider 使用独立适配器和版本化选择器，失败时标记 `page_changed` |
| 会话过期或账号退出 | 请求中断 | 识别 `login_required`，保留任务并引导用户在官方页面重新登录 |
| 网页限流或异常活动检测 | 连接暂时不可用 | 显示 `rate_limited` 或 `verification_required`，不自动重试或绕过限制 |
| 用户误以为订阅等同 API | 对配额和稳定性产生错误预期 | 在连接页说明 Web Session 与 API 的计费、限额和能力差异 |
| Provider 标签页抢占业务页面 | Operator 执行上下文错乱 | 使用专用后台标签页并按 windowId 隔离，不复用当前业务标签页 |

## 17. 回滚策略

- 模板库通过 UI 功能开关控制，关闭后保留现有 My workflows 页面。
- 新变量类型采用向后兼容扩展，旧 Workflow 无需迁移。
- 内置模板为只读静态资源，回滚版本不会修改用户 Workflow。
- 右键菜单初始化时先清理 BrowserOnly 自有菜单再重新注册，避免升级后残留。
- 结构化提取保存为普通 Workflow 版本。功能关闭后仍可查看，运行时对不支持的工具给出明确错误。
- Web Session 由独立功能开关控制。关闭后不影响 API、OpenAI-compatible 和 Ollama Provider。
- Web Session 适配器失效时只禁用对应连接，不能阻断模型菜单和其他 Provider。

## 18. 关键决策

1. 模板是 Workflow 的创建入口，不是第四个顶级工作区。
2. 模板、快捷操作和结构化提取共用 ActionInvocation、参数页和结果页。
3. `/` 选择器读取统一 Action Registry，内置命令和用户 Workflow 不维护两套发现逻辑。
4. `/` 选择结果是结构化命令块，不是插入 textarea 的普通提示词。
5. 参数配置在侧栏页面中完成，不使用窄屏居中弹窗。
6. V1 模板随扩展发布，不引入远程市场和新的后端依赖。
7. 网页快捷操作使用 Chrome 右键菜单和 Side Panel 操作栏，不向页面注入悬浮 UI。
8. 结构化提取先使用 DOM 缩小候选范围，再由模型归一化，避免整页内容直接进入模型。
9. Web Session 是正式可选 Provider，但界面必须标注稳定性和能力边界，不将其描述为免费 API。
10. Web Session 只通过用户可见的官方网页会话通信，不读取认证令牌，不调用逆向获得的私有接口。
11. 用户的 Plus、Pro 或 Advanced 订阅只决定账号实际可用能力，BrowserOnly 不保证具体模型长期存在。

## 19. 前提假设

本方案假设用户主要通过当前页面推荐、右键操作和搜索发现能力，而不是逐层浏览分类。如果上线数据表明分类浏览占主要路径，应将分类提升为模板页的固定导航，但无需改变底层模板和执行模型。

Web Session 方案还假设 AI 服务允许用户通过浏览器界面完成交互，并且 BrowserOnly 可以在不提取认证凭据的前提下可靠操作该界面。如果任一平台的条款或技术措施明确禁止这种集成，应关闭对应适配器，保留 API 和 Ollama 连接。

## 21. 实施任务清单

本轮实现按小任务拆分，优先完成可独立验收的 P0 闭环。每个任务应保持改动集中、带测试，并通过 `npx tsc --noEmit`、`npm test`、`npm run build` 和 `git diff --check`。

| 任务 | 当前交付状态 | 主要代码范围 |
|---|---|---|
| Action Registry 与内置命令 | 已实现基础版本 | `src/actions/` |
| Workflow 类型兼容扩展 | 已实现 | `src/workflows/types.ts` |
| 4 个内置模板与 Schema | 已实现基础版本 | `src/templates/` |
| 模板搜索、分类、页面匹配与使用状态 | 已实现基础版本 | `src/templates/` |
| 模板实例化为本地 Workflow | 已实现 | `src/templates/templateInstantiation.ts` |
| Automations Templates 列表与详情 | 已实现基础 UI | `src/sidepanel/components/templates/`、`WorkflowListView.tsx` |
| `/` 斜杠命令面板与命令块 | 已实现基础版本 | `PromptForm.tsx`、`components/actions/` |
| Pending Action 消息存储 | 已实现基础版本 | `src/actions/pendingActionStore.ts`、`background/types.ts` |
| Chrome 右键快捷菜单 | 已实现基础版本 | `src/background/index.ts` |
| 结构化提取 Schema、候选提取、字段配置 UI、CSV/JSON 导出和 Workflow 工具 | 已实现基础版本，模型归一化与结果页路由待实现 | `src/extraction/`、`WorkflowService.ts`、`components/extraction/` |
| ChatGPT Web Session 类型契约、窗口隔离标签页登记与 Provider 骨架 | 已实现基础版本，网页注入适配器与流式选择器待实现 | `src/models/providers/web-session/`、`chatgpt-web.ts`、`background/types.ts` |

本轮已实现部分的验收范围：

- `/sum` 可以匹配 `/summarize`，并在 textarea 上方显示可移除命令块。
- Automations 可以切换到 Templates，搜索、分类、查看详情和实例化模板。
- 4 个内置模板通过 Schema 校验，实例化后与模板深拷贝隔离。
- 右键菜单使用 BrowserOnly 父菜单，支持页面和选中文本的总结、提取、翻译入口。
- Pending Action 按窗口和标签页隔离，消费后删除。

尚未完成的任务不得通过空 UI 或模拟结果标记为已完成。结构化提取和 Web Session 需要独立实现服务层、错误状态和集成测试后再进入发布门槛。

## 20. P1：Web Session Connections

### 20.1 产品定义

Web Session Connection 让 BrowserOnly 通过用户当前浏览器中已经登录的 AI 官方网页会话发送请求并读取回答。用户不需要在 BrowserOnly 中提供 API Key。

如果用户拥有 ChatGPT Plus、Claude Pro 或 Gemini Advanced 等订阅，BrowserOnly 使用该账号在官方网页中实际可用的模型和能力。订阅权益属于 AI 服务账号，不会转换成 API 额度，也不代表请求无限或永久可用。

Web Session 与其他连接共同存在：

```text
Model Connections
├── Web Connections
│   ├── ChatGPT Web
│   ├── Claude Web
│   └── Gemini Web
├── API Connections
│   ├── OpenAI
│   ├── Anthropic
│   ├── Gemini API
│   ├── DeepSeek
│   └── OpenAI-compatible
└── Local Connections
    └── Ollama
```

### 20.2 用户价值

- 已有 AI 网页订阅的用户可以直接开始使用 BrowserOnly。
- 首次使用不需要理解 API Key、计费账户、Base URL 或模型 ID。
- 用户仍在官方 AI 网站中登录，BrowserOnly 不托管账号密码。
- 用户可以保留 API 和 Ollama，按任务稳定性、成本和隐私需求切换。

### 20.3 产品文案边界

允许使用的文案：

```text
Use your existing ChatGPT, Claude, or Gemini login.
No API key required.
Uses models available to your account.
```

中文：

```text
使用浏览器中现有的 ChatGPT、Claude 或 Gemini 登录状态。
无需配置 API Key。
使用当前账号实际可用的模型和订阅权益。
```

禁止使用的文案：

- `Free API`。
- `Unlimited usage`。
- `永久免费使用高级模型`。
- `绕过 API 付费`。
- `保证支持某个具体模型`。

连接页必须显示：

```text
Web connections use your AI website account and remain subject to
its subscription, usage limits, session expiry, and regional availability.
```

### 20.4 首次连接流程

```text
用户打开 Models
       ↓
选择 ChatGPT Web、Claude Web 或 Gemini Web
       ↓
BrowserOnly 打开或找到对应官方网页
       ↓
检测登录状态和可用能力
       ↓
未登录：引导用户在官方网页登录
已登录：发送一次连接验证请求
       ↓
显示 Connected，并允许设为默认连接
```

首次启用前显示一次确认：

```text
Connect to ChatGPT Web?

BrowserOnly will use a dedicated chatgpt.com tab to send your prompts
and relevant page context. It will not read or store your password,
cookies, or session tokens.

[Cancel] [Connect]
```

首次请求用于验证会话。如果检测到未登录，BrowserOnly 只打开官方登录页面，不代填账号密码。

### 20.5 模型菜单 UI

```text
Models

WEB CONNECTIONS
┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ ChatGPT     │ │ Claude      │ │ Gemini      │
│ Connected   │ │ Sign in     │ │ Connected   │
└─────────────┘ └─────────────┘ └─────────────┘

API CONNECTIONS
OpenAI API
Anthropic API
Gemini API
OpenAI-compatible

LOCAL
Ollama
```

选中连接后进入详情：

```text
ChatGPT Web

Status                  Connected
Model                   GPT model available to account
Provider tab            Ready
Stability               Interactive use

[Verify connection]     [Use as default]

Web connections may be rate-limited or signed out.
Use an API connection for unattended workflows.
```

UI 规则：

- Web Connections 位于模型菜单顶部，降低首次使用门槛。
- 卡片只显示连接名称和状态，不宣称用户订阅等级，除非可以从官方页面可靠确认。
- 具体模型名称只显示网页实际提供或当前选择的值，不根据账号名称猜测。
- ChatGPT 和 Claude 可以在适配器可靠识别时展示模型选择。
- Gemini 默认使用 Gemini 官方网页当前选中的模型，并提示用户前往网页切换。
- `Use as default` 只影响新任务，运行中的任务不热切换 Provider。

### 20.6 连接状态

```ts
type WebSessionProviderId = 'chatgpt-web' | 'claude-web' | 'gemini-web';

type WebSessionStatus =
  | 'checking'
  | 'connected'
  | 'login_required'
  | 'rate_limited'
  | 'verification_required'
  | 'page_changed'
  | 'unavailable';

interface WebSessionConnectionState {
  provider: WebSessionProviderId;
  status: WebSessionStatus;
  selectedModel?: string;
  availableModels?: Array<{ id: string; name: string }>;
  providerTabId?: number;
  lastVerifiedAt?: number;
  message?: string;
}
```

状态行为：

| 状态 | UI 提示 | 允许操作 |
|---|---|---|
| `checking` | Checking connection | 等待或取消 |
| `connected` | Connected | 使用、验证、设为默认 |
| `login_required` | Sign in on the provider website | 打开官方登录页 |
| `rate_limited` | Usage limit reached | 稍后重试或切换连接 |
| `verification_required` | Complete verification on the provider website | 打开 Provider 标签页 |
| `page_changed` | Connection needs an extension update | 切换 API 或 Ollama |
| `unavailable` | Provider is unavailable | 重试或切换连接 |

### 20.7 Provider 接口

现有 `LLMProvider` 保持统一消息和流式输出接口。新增 Web Session 扩展能力：

```ts
interface WebSessionProvider extends LLMProvider {
  readonly providerId: WebSessionProviderId;
  detectSession(): Promise<WebSessionConnectionState>;
  verifyConnection(): Promise<WebSessionConnectionState>;
  listAvailableModels(): Promise<Array<{ id: string; name: string }>>;
  selectModel(modelId: string): Promise<void>;
  cancelGeneration(): Promise<void>;
  dispose(): Promise<void>;
}
```

适配器目录：

```text
src/models/providers/web-session/
  types.ts
  WebSessionManager.ts
  BaseWebSessionProvider.ts
  ChatGPTWebProvider.ts
  ClaudeWebProvider.ts
  GeminiWebProvider.ts
  providerTabRegistry.ts
  selectors/
    chatgpt.ts
    claude.ts
    gemini.ts
```

`WebSessionManager` 负责生命周期和标签页隔离，各 Provider 适配器只负责对应网站的状态检测、输入、输出和模型选择。

### 20.8 执行链路

```text
ExecutionEngine
       ↓ createMessage
WebSessionProvider
       ↓
查找或创建专用 Provider 标签页
       ↓
验证登录、模型和页面状态
       ↓
将消息与必要上下文输入官方网页
       ↓
监听流式回答区域的 DOM 变化
       ↓
转换为统一 StreamChunk
       ↓
返回 ExecutionEngine
```

Provider 标签页规则：

- 每个浏览器窗口、每个 Web Provider 最多保留一个受管标签页。
- Provider 标签页不得复用当前业务页面。
- 默认不激活 Provider 标签页。需要登录或验证时才请求用户查看。
- 用户手动关闭 Provider 标签页后，下次请求重新创建。
- 用户在 Provider 标签页中的普通历史会话不得被 BrowserOnly 扫描或导入。
- BrowserOnly 创建的会话名称应带有可识别前缀，例如 `BrowserOnly`，便于用户管理。

### 20.9 消息和工具调用

Web Session 输出必须适配现有 `StreamChunk`，让 Ask 和普通聊天无需感知连接类型。

Operator 可以继续使用 BrowserOnly 现有的文本工具调用协议：

```xml
<tool>browser_click</tool>
<input>{"selector":"button[type=submit]"}</input>
<requires_approval>false</requires_approval>
```

但 Web Session 的工具调用属于实验性能力：

- 每轮只接受一个完整、可解析的工具调用。
- 工具执行结果以普通文本消息回传同一 Provider 会话。
- 保留现有最大调用轮数、风险审批和取消机制。
- 无法稳定解析工具调用时停止任务，不猜测或执行部分输出。
- Web Session 不允许后台无人值守 Workflow 或定时任务。

### 20.10 能力矩阵

| 能力 | Web Session | API | Ollama |
|---|---|---|---|
| 普通问答 | 支持 | 支持 | 支持 |
| 页面总结与翻译 | 支持 | 支持 | 支持 |
| 内置 `/` 命令 | 支持 | 支持 | 支持 |
| 结构化提取 | 支持，受上下文限制 | 支持 | 取决于模型 |
| Operator 工具调用 | 实验性 | 完整支持 | 取决于模型 |
| 交互式 Workflow AI Step | 实验性 | 完整支持 | 取决于模型 |
| 后台定时任务 | 不支持 | 支持 | 支持 |
| 多任务并行 | 不支持 | 支持 | 受本机资源限制 |
| 精确 Token 和成本统计 | 不支持 | 支持 | 仅估算 |
| Temperature 等模型参数 | 有限或不支持 | 支持 | 支持 |
| 会话过期 | 可能发生 | 不适用 | 不适用 |

如果当前任务要求 Web Session 不支持的能力，运行前显示：

```text
This workflow requires a stable background model connection.
Choose an API or Ollama connection to continue.
```

### 20.11 隐私与安全边界

BrowserOnly 只允许通过官方网页 UI 使用 Web Session：

- 不调用 `chrome.cookies`。
- 不读取或复制 Cookie、Session Token、CSRF Token 或 Authorization Header。
- 不将认证信息写入 `chrome.storage`、IndexedDB、日志或错误报告。
- 不调用通过逆向工程发现的私有接口。
- 不自动解决验证码或 Cloudflare 验证。
- 不绕过使用额度、订阅权限、地区限制或平台安全措施。
- 不在用户不知情的情况下切换账号或 Provider。

发送页面内容前继续遵守 BrowserOnly 现有页面上下文规则。首次启用 Web Session 时，隐私说明和 Chrome Web Store 数据披露必须同步更新。

### 20.12 错误处理与恢复

| 错误 | 检测 | 恢复 |
|---|---|---|
| 未登录 | 出现登录页或缺少聊天输入区 | 打开官方登录页，用户登录后重新验证 |
| 会话过期 | 请求跳转登录页或收到未授权 UI | 保留任务上下文，标记 `login_required` |
| 请求限流 | 官方页面显示额度或稍后重试提示 | 标记 `rate_limited`，不自动循环重试 |
| 需要验证 | 出现验证码或异常活动页面 | 激活 Provider 标签页，由用户完成验证 |
| 网页改版 | 关键选择器全部失效 | 标记 `page_changed`，禁用对应适配器 |
| 流式回答中断 | 回答停止且没有完成标志 | 保留已有文本，标记结果不完整并允许重试 |
| Provider 标签页被关闭 | Chrome 返回 tab not found | 创建新标签页并重新检测会话 |

切换到其他 Provider 时保留当前任务消息，但必须由用户确认重新发送。BrowserOnly 不在失败后静默地把页面内容发送给另一个模型服务。

### 20.13 实施顺序

#### Web Session 1：ChatGPT Web

- Provider 抽象和连接状态。
- 专用标签页管理。
- 登录检测和连接验证。
- 普通文本请求、流式回答和取消。
- 模型菜单和默认连接。
- Ask、总结、翻译和结构化提取。

#### Web Session 2：Operator 验证

- 文本工具调用解析。
- 工具结果回传。
- 最大轮数、取消和风险审批。
- Provider 失败时保留任务并提供手动切换。

#### Web Session 3：Claude 与 Gemini

- 复用 Provider 抽象和标签页管理。
- Claude 模型检测与选择。
- Gemini 当前网页模型检测。
- 各适配器独立开关和独立故障状态。

每一阶段都可以独立发布。ChatGPT Web 未达到稳定标准时，不开始复制三套适配器。

### 20.14 发布门槛

ChatGPT Web 进入默认模型菜单前必须满足：

- 连续 100 次普通请求成功率不低于 95%，不计 Provider 自身限流。
- 登录、退出、会话过期、限流和验证页面均能正确识别。
- 取消生成不会把下一次请求写入旧回答。
- 多窗口请求不会发送到错误账号或错误会话。
- 页面正文只在用户显式启用页面上下文时发送。
- Chrome Web Store 披露和隐私政策已经更新。
- 适配器可以通过远端功能开关或扩展更新单独停用，但不得远程注入或执行代码。

Operator 支持必须独立标记为实验性，不能因为普通聊天稳定就自动视为可用。

### 20.15 参考产品结论

HARPA 已验证 Web Session Connection 的用户价值和产品形态：用户登录 ChatGPT、Claude 或 Gemini 后，可以在扩展中将该网页连接设为默认连接，并使用账号可用的高级模型。HARPA 同时明确说明 Web Session 可能遇到限流、会话过期、区域限制和异常活动检测，API Connection 更适合稳定和高频使用。

BrowserOnly 借鉴的是连接分层、状态反馈和零配置体验，不假设或复制 HARPA 未公开的内部实现。
