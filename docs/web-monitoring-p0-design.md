# Web Monitoring P0 设计与实施方案

## 1. 文档目的

本文定义 BrowserOnly 第一版网页数据监控能力。目标是在本地浏览器中周期性访问网页，监控元素文本、价格、库存和页面正文变化，保存可审计的快照与结构化 diff，并在规则满足时发送浏览器通知。

本方案只覆盖监控闭环。自动化表单填充、云端常驻运行、邮件和第三方集成不属于本次范围。

## 2. 产品定义

用户在当前网页选择一个元素或页面正文，配置检查频率和触发条件后，BrowserOnly 在后台周期性检查，并回答三个问题：

1. 什么时候发生了变化；
2. 从什么变成了什么；
3. 变化发生时页面是什么样。

核心承诺：**在用户自己的浏览器里，低噪声地发现网页变化，并保留可信证据。**

第一版是本地、best-effort 的浏览器监控器，不承诺电脑关机、浏览器退出或浏览器冻结期间仍能准点运行。

## 3. 成功标准

P0 完成后应满足：

- 用户能在当前页面点击选择一个元素，并在 60 秒内创建监控；
- 支持文本、价格、库存和页面正文四类监控；
- 浏览器重启后监控配置、快照和运行历史仍然存在；
- 变化记录同时包含旧值、新值、结构化 diff、时间和来源 URL；
- 定位失败、页面加载失败和真实内容消失不会混为同一种变化；
- 同一条件持续成立时只通知一次，恢复后再次成立才重新通知；
- 正常检查不调用 LLM，不产生模型费用；
- 用户能暂停、恢复、立即检查、编辑和删除监控；
- 连续三次运行失败后自动暂停，并发送一次需要人工处理的通知。

## 4. 范围

### 4.1 Building

- 当前页面元素选择器；
- 文本、价格、库存、页面正文四类监控；
- Chrome Alarm 周期调度和“立即检查”；
- 后台标签页中的页面加载、准备、抽取和关闭；
- IndexedDB 持久化监控、运行、快照、diff 和截图；
- 基于确定性规则的值规范化与变化判断；
- 浏览器桌面通知；
- Side Panel 中的监控列表、创建页、详情页和历史时间线；
- 失败重试、连续失败暂停、登录失效和 CAPTCHA 提示；
- 快照数量和存储空间清理策略。

### 4.2 Not building

- 云端或远程常驻 Runner；
- 浏览器关闭后的监控；
- 邮件、短信、Slack、Webhook、Make、Zapier 或 n8n；
- 多设备同步和多人协作；
- 像素级视觉 diff；
- 自动绕过登录、CAPTCHA、Cloudflare 或站点风控；
- 自动下单、预约、发送消息或提交表单；
- 每个站点的专用电商适配器；
- 使用 LLM 判断日常变化；
- 秒级或严格 SLA 调度。

## 5. 已有基础与复用边界

| 现有模块 | 复用方式 | 不直接复用的部分 |
| --- | --- | --- |
| `src/workflows/locator.ts` | 扩展稳定定位器生成和 fallback 顺序 | 当前只从字符串构造，不能完成可视化点选 |
| `src/workflows/WorkflowRunner.ts` | 借鉴标签页上下文、超时、错误记录 | Monitor 不是 Workflow，不用步骤模型表达 diff 和触发器 |
| `src/workflows/WorkflowStore.ts` | 复用 IndexedDB 封装模式 | 使用独立数据库和对象仓库，避免生命周期耦合 |
| `src/extraction/*` | 复用字段类型和结构化结果思路 | 单元素监控使用轻量确定性抽取器 |
| `src/agent/tools/*` | 复用页面读取、查询、截图能力 | Monitor Runner 不加载完整 Agent 工具注册表 |
| `src/tracking/screenshotManager.ts` | 保留截图句柄概念 | 当前仅内存保存，监控截图必须持久化到 IndexedDB |
| `src/background.ts` | 统一处理调度与运行消息 | 监控执行拆到独立服务，避免继续膨胀 background 文件 |
| `src/sidepanel/SidePanel.tsx` | 接入新的 Workspace 视图 | 监控不塞入 Workflow 列表 |

Monitor 和 Workflow 使用不同模型：Workflow 描述“执行哪些操作”，Monitor 描述“何时观察什么、如何比较、何时通知”。登录前置操作未来可以引用一个只读 Workflow，但 P0 不建立该依赖。

## 6. 核心架构

```text
chrome.alarms / Run now
          │
          ▼
   MonitorScheduler
          │ claim run，避免重复执行
          ▼
     MonitorRunner ──────► 创建后台 Tab / 等待页面稳定
          │
          ▼
   MonitorExtractor ─────► Locator fallback / 正文抽取
          │
          ▼
      Normalizer ────────► text / price / stock / page_text
          │
          ▼
      SnapshotStore ◄──── previous successful snapshot
          │
          ▼
       DiffEngine
          │
          ▼
    TriggerEvaluator ────► NotificationService
          │
          ▼
  MonitorStore + Side Panel history
```

依赖方向保持单向：调度器调用 Runner，Runner 调用抽取与比较服务，服务写入 Store；UI 只通过 Store 和 background 消息读取或发起操作，不调用 Runner。

## 7. 数据模型

新增 `src/monitoring/types.ts`，使用下列公共类型。字段名和默认值在 P0 中固定。

### 7.1 Monitor

```ts
type MonitorKind = 'text' | 'price' | 'stock' | 'page_text';
type MonitorStatus = 'active' | 'paused' | 'needs_attention';

interface Monitor {
  id: string;
  name: string;
  url: string;
  kind: MonitorKind;
  status: MonitorStatus;
  locator?: StableLocator;
  scheduleMinutes: number;
  trigger: MonitorTrigger;
  normalization: MonitorNormalization;
  readiness: MonitorReadiness;
  lastCheckedAt?: number;
  lastSuccessfulAt?: number;
  nextRunAt?: number;
  consecutiveFailures: number;
  triggerActive: boolean;
  createdAt: number;
  updatedAt: number;
}
```

规则：

- 默认 `scheduleMinutes` 为 30；
- 最低为 1 分钟，最高为 43,200 分钟（30 天）；
- `page_text` 不需要 locator；其余类型必须有 locator；
- 新建监控立即执行首次检查，成功后才进入 `active`；
- 首次快照建立 baseline，不发送“变化”通知。

### 7.2 Trigger

```ts
type MonitorTrigger =
  | { type: 'changed' }
  | { type: 'text_appears'; text: string; caseSensitive: boolean }
  | { type: 'text_disappears'; text: string; caseSensitive: boolean }
  | { type: 'price_decreases' }
  | { type: 'price_increases' }
  | { type: 'price_below'; amount: number; currency?: string }
  | { type: 'price_above'; amount: number; currency?: string }
  | { type: 'back_in_stock' }
  | { type: 'out_of_stock' };
```

合法组合：

- `text`：`changed`、`text_appears`、`text_disappears`；
- `price`：`changed`、`price_decreases`、`price_increases`、`price_below`、`price_above`；
- `stock`：`changed`、`back_in_stock`、`out_of_stock`；
- `page_text`：`changed`、`text_appears`、`text_disappears`。

### 7.3 Snapshot

```ts
interface MonitorSnapshot {
  id: string;
  monitorId: string;
  runId: string;
  observedAt: number;
  url: string;
  pageTitle: string;
  kind: MonitorKind;
  rawValue: string;
  normalizedValue: NormalizedMonitorValue;
  contentHash: string;
  locatorUsed?: string;
  screenshotId?: string;
}
```

`NormalizedMonitorValue` 是判别联合：

- 文本与正文：`{ type: 'text'; text: string }`；
- 价格：`{ type: 'price'; amount: number; currency?: string; qualifier?: 'from' | 'range' | 'exact' }`；
- 库存：`{ type: 'stock'; state: 'in_stock' | 'out_of_stock' | 'unknown'; evidence: string }`。

### 7.4 Diff

```ts
interface MonitorDiff {
  id: string;
  monitorId: string;
  runId: string;
  previousSnapshotId: string;
  currentSnapshotId: string;
  changed: boolean;
  changeType: 'unchanged' | 'text_changed' | 'appeared' | 'disappeared'
    | 'increase' | 'decrease' | 'stock_changed';
  previousValue: NormalizedMonitorValue;
  currentValue: NormalizedMonitorValue;
  numericDelta?: number;
  percentDelta?: number;
  addedText?: string[];
  removedText?: string[];
  significance: 'none' | 'low' | 'high';
  createdAt: number;
}
```

定位失败、超时和登录失效不创建伪 Snapshot 或 Diff，只创建失败 Run。

### 7.5 Run

```ts
interface MonitorRun {
  id: string;
  monitorId: string;
  source: 'schedule' | 'manual' | 'creation';
  status: 'running' | 'unchanged' | 'changed' | 'failed';
  startedAt: number;
  endedAt?: number;
  snapshotId?: string;
  diffId?: string;
  errorCode?: MonitorErrorCode;
  errorMessage?: string;
}
```

错误码固定为：`NAVIGATION_FAILED`、`PAGE_TIMEOUT`、`LOCATOR_NOT_FOUND`、`MULTIPLE_MATCHES`、`PARSE_FAILED`、`AUTH_REQUIRED`、`CAPTCHA_DETECTED`、`TAB_CLOSED`、`UNKNOWN`。

## 8. IndexedDB 设计

新增 `BrowserOnly-monitors` 数据库，版本为 1，包含：

| Object store | Key | Index |
| --- | --- | --- |
| `monitors` | `id` | `status`, `nextRunAt`, `updatedAt` |
| `runs` | `id` | `monitorId`, `startedAt`, `[monitorId, startedAt]` |
| `snapshots` | `id` | `monitorId`, `observedAt`, `[monitorId, observedAt]` |
| `diffs` | `id` | `monitorId`, `createdAt`, `[monitorId, createdAt]` |
| `screenshots` | `id` | `monitorId`, `createdAt` |

保留策略：

- 每个 Monitor 保留最近 100 个 Run；
- 只保留最近 50 个成功 Snapshot；
- 只在首次成功和 `changed === true` 时保存 JPEG 截图，质量 70；
- 每个 Monitor 最多保留 20 张截图；
- 删除 Monitor 时，在一个事务中删除其 Run、Snapshot、Diff 和 Screenshot；
- 每次成功运行结束后执行该 Monitor 的增量清理，不做全库扫描。

页面正文 `rawValue` 上限为 200,000 字符；超过后截断并在内部记录截断标志。元素文本上限为 20,000 字符。

## 9. 创建监控流程

### 9.1 入口

在 Workspace Switcher 增加 `Monitors`。列表页提供 `+ New monitor`，创建页读取当前活动标签页。

### 9.2 元素选择模式

用户选择 `Text`、`Price` 或 `Stock` 后点击 `Pick element`：

1. background 通过 `chrome.scripting.executeScript` 注入一次性选择器；
2. 鼠标悬停时用单个 overlay 高亮候选元素，不修改业务节点样式；
3. 点击后阻止本次页面默认行为和事件传播；
4. 收集元素的 tag、role、accessible name、label、稳定属性、短文本和 CSS fallback；
5. 调用扩展后的 `buildStableLocator` 生成 fallback 顺序；
6. 移除 overlay 和所有事件监听器；
7. 创建页显示采样值，并允许重新选择。

定位优先级固定为：`role + accessibleName`、`label`、`data-testid`、稳定 `id`、短文本、CSS。CSS 不写 `nth-child`，除非没有其他唯一方案；存在多个匹配时不允许保存，要求重新选择。

### 9.3 页面正文

`Page text` 不进入元素选择模式。抽取顺序为：

1. `main`；
2. `article`；
3. `[role="main"]`；
4. `#content`、`#main`、`.content`、`.main-content`；
5. `body`。

过滤 `script`、`style`、`noscript`、`nav`、`footer`、不可见元素和 `aria-hidden="true"` 节点。

### 9.4 保存前预览

创建页必须展示：名称、URL、类型、当前采样值、触发条件、频率以及“监控依赖浏览器保持运行”的说明。保存时先执行 creation Run；成功后保存 active Monitor，失败时保留表单并显示具体错误，不创建无 baseline 的 active Monitor。

## 10. 调度与执行

### 10.1 Chrome 权限

在 `public/manifest.json` 增加：

- `alarms`：周期唤醒；
- `notifications`：变化和连续失败通知。

现有 `tabs`、`storage`、`scripting`、`debugger` 和 `<all_urls>` 已覆盖后台标签、持久化、选择器注入和 Playwright CRX 执行。

### 10.2 调度策略

- 为所有 Monitor 使用一个名为 `browseronly-monitor-tick` 的全局 alarm，每分钟触发；
- 每次 tick 查询 `status === active && nextRunAt <= now` 的 Monitor；
- 同一时刻最多运行 2 个 Monitor，其他任务按 `nextRunAt` 排队；
- 单个 Monitor 使用内存 claim 防止同一 service worker 生命周期内重复运行；
- Store 中存在 `running` 且开始时间超过 10 分钟的 Run，启动时标记为 `failed/TAB_CLOSED`；
- 成功或失败结束后均按 `endedAt + scheduleMinutes` 设置下一次运行，避免失败热循环；
- 浏览器启动和扩展安装时重建 alarm，并清理陈旧 Run。

Chrome Alarm 是唤醒信号，不是精准定时器。实际运行时间晚于 `nextRunAt` 属于正常情况，UI 同时显示计划时间和实际时间。

### 10.3 页面执行

每次运行：

1. 创建 `active: false` 的后台标签页；
2. 等待 `domcontentloaded`，总导航超时 30 秒；
3. 再等待 1 秒静默期；
4. 若 readiness 配置了 `waitForText`，最多额外等待 15 秒；
5. 检查登录页和 CAPTCHA 特征；
6. 按 locator fallback 抽取值；
7. 规范化、保存 Snapshot、生成 Diff、评估 Trigger；
8. 在首次快照或真实变化时保存截图；
9. 保存 Run 并关闭后台标签页。

`MonitorRunner` 使用最小页面能力，不构造 `BrowserAgent`，不加载数据库、知识图谱、Notion 或模型 Provider。

## 11. 规范化规则

### 11.1 Text

- Unicode 使用 NFC；
- `\u00a0` 转为空格；
- 连续空白折叠为一个空格；
- 去除首尾空白和零宽字符；
- 默认大小写敏感地比较完整文本；
- 关键词触发按用户配置决定是否大小写敏感。

### 11.2 Price

价格解析顺序：

1. 识别货币符号和 ISO 代码；
2. 去除千位分隔符和非数值装饰文本；
3. 根据最后一个 `.` 或 `,` 及其后位数判断小数分隔符；
4. 识别“起/from”并标记 `qualifier: from`；
5. 单一价格保存为 `amount`；
6. 价格区间以最低值作为 `amount` 并标记 `qualifier: range`。

P0 支持 CNY、USD、EUR、GBP、JPY、KRW 和无货币价格。解析失败时 creation Run 失败，提示用户改用 Text Monitor；运行期解析失败记为 `PARSE_FAILED`，不覆盖上一成功值。

价格阈值带货币时，快照货币不同则不触发，并在 Run 中记录可见警告。P0 不做汇率换算。

### 11.3 Stock

创建时用户必须确认当前元素表达的是“有货”还是“无货”，保存为 normalization 配置。运行时：

- 指示元素存在且文本匹配时，返回用户指定状态；
- 指示元素不存在时，返回相反状态；
- 页面加载不完整、存在多个匹配或文本冲突时返回 `unknown`；
- `unknown` 不产生库存变化通知。

### 11.4 Page text

正文应用 Text 规则，并额外移除只含日期时间、广告标签和空行的块。P0 不自动学习动态区域；用户遇到高噪声页面时应改为选择具体元素。

## 12. Diff 与触发语义

### 12.1 Diff

- hash 相同直接返回 `unchanged`；
- Text 和 Page text 使用按行、再按词的 diff；
- `addedText` 和 `removedText` 各最多保存 100 项、总计 20,000 字符；
- Price 计算绝对差和百分比，旧值为 0 时不计算百分比；
- Stock 只比较明确状态；
- 所有比较仅使用最近一次成功 Snapshot。

`significance`：未变化为 `none`；元素文本、价格或库存变化为 `high`；页面正文变化占比低于 1% 为 `low`，达到 1% 为 `high`。`changed` 仍然反映真实变化，`significance` 只用于展示。

### 12.2 Edge-triggered 通知

TriggerEvaluator 输出条件是否满足：

- `false → true`：发送通知，并设置 `triggerActive = true`；
- `true → true`：不重复通知；
- `true → false`：不发送通知，设置 `triggerActive = false`；
- `false → false`：不发送通知。

`changed` 是一次性事件，每次出现新的真实 Diff 都视为一次 `false → true`，运行结束后不保持 active。阈值、关键词和库存条件保持 active，直到条件恢复。

通知正文包含 Monitor 名称、旧值摘要、新值摘要和发生时间。点击通知打开 Side Panel 并定位到对应 Diff；若浏览器不允许直接打开 Side Panel，则打开被监控 URL，并保留待查看的 diffId。

## 13. 错误处理与降级

- 单次失败保存 Run，不产生 Snapshot、Diff 或变化通知；
- 连续第一次和第二次失败保持 active，在下个周期重试；
- 连续第三次失败设置 `needs_attention`，取消后续调度并发送一次故障通知；
- 手动 `Run now` 成功后清零失败次数，但仍需用户点击 Resume 才恢复周期调度；
- URL 跳到登录页时使用 `AUTH_REQUIRED`；
- 页面出现常见 CAPTCHA 或 challenge 标记时使用 `CAPTCHA_DETECTED`；
- locator 全部失败使用 `LOCATOR_NOT_FOUND`，不解释为元素消失；
- 用户删除或关闭执行标签页使用 `TAB_CLOSED`；
- 无法截图时继续保存数值和 Diff，Run 不因此失败。

P0 不自动修复 locator。详情页显示最后成功定位器和失败原因，并提供 `Pick element again`。

## 14. UI 方案

### 14.1 Workspace

Workspace 切换器扩展为：

```text
Tasks
Automations
Monitors       3
Runs           1 failed
```

Monitor 数量只统计 `active` 和 `needs_attention`。

### 14.2 Monitor 列表

```text
Monitors                                      [+ New]
────────────────────────────────────────────────────
MacBook Air price                         [Run now]
apple.com · ¥7,999 · Every 30 min · Active

Appointment availability                  [Fix]
example.com · Locator not found · Needs attention
```

每项提供 Pause/Resume、Edit、Run now 和 Delete。删除前确认，并说明历史与截图会一并删除。

### 14.3 详情与历史

```text
← Monitors
MacBook Air price                              [Pause]
apple.com · Every 30 min

Current value
¥7,999                         Last checked 12:30

History
12:30  ¥7,999   ↓ ¥500 (-5.9%)   [Diff] [Screenshot]
12:00  ¥8,499   No change
11:30  Baseline created          [Screenshot]
```

Diff 详情同时展示旧值、新值、增删文本、截图和来源 URL。失败 Run 出现在时间线，但不伪装成变化记录。

### 14.4 创建页字段

- Name；
- URL，只读展示当前页，允许粘贴替换；
- Monitor type；
- Picked element 或 Page text；
- Current sample；
- Trigger；
- Frequency：1、5、15、30 分钟，1、3、6、12、24 小时，自定义；
- 可选 `Wait for text`；
- `Create monitor`。

## 15. 消息接口

Side Panel 与 background 使用判别字段 `action`：

| Action | Direction | Purpose |
| --- | --- | --- |
| `monitorPickElement` | UI → background | 在指定 tab 启动选择模式 |
| `monitorSample` | UI → background | 对当前配置执行一次无持久化采样 |
| `monitorCreate` | UI → background | 创建并运行 baseline |
| `monitorRunNow` | UI → background | 手动检查 |
| `monitorPause` | UI → background | 暂停调度 |
| `monitorResume` | UI → background | 恢复调度 |
| `monitorDelete` | UI → background | 删除配置及历史 |
| `monitorOpenDiff` | UI → background | 打开指定变化详情 |
| `monitorRunUpdated` | background → UI | 刷新列表和历史 |

所有响应使用 `{ success: true, data } | { success: false, error: { code, message } }`，不得仅返回自由文本错误。

## 16. 文件实施清单

这是一个超过 8 个文件并新增一个业务服务面的功能。建议按以下目标落地：

### 16.1 新增核心文件

- `src/monitoring/types.ts`：公共类型和错误码；
- `src/monitoring/MonitorStore.ts`：IndexedDB、查询和保留策略；
- `src/monitoring/MonitorScheduler.ts`：alarm、due queue、并发和 claim；
- `src/monitoring/MonitorRunner.ts`：后台标签页生命周期；
- `src/monitoring/MonitorExtractor.ts`：locator 和正文抽取；
- `src/monitoring/normalizers.ts`：文本、价格、库存规范化；
- `src/monitoring/DiffEngine.ts`：确定性 diff；
- `src/monitoring/TriggerEvaluator.ts`：触发状态机；
- `src/monitoring/NotificationService.ts`：通知与点击处理；
- `src/monitoring/elementPicker.ts`：页面元素选择器；
- `src/monitoring/index.ts`：公开导出。

### 16.2 新增 UI 文件

- `src/sidepanel/components/monitors/MonitorListView.tsx`；
- `src/sidepanel/components/monitors/MonitorCreateView.tsx`；
- `src/sidepanel/components/monitors/MonitorDetailView.tsx`；
- `src/sidepanel/components/monitors/MonitorDiffView.tsx`。

### 16.3 修改文件

- `public/manifest.json`：增加 `alarms` 和 `notifications`；
- `src/background.ts`：注册监控消息、alarm、startup 和 notification click；
- `src/sidepanel/SidePanel.tsx`：增加 monitors workspace 和 deep-link 状态；
- `src/sidepanel/components/WorkspaceSwitcher.tsx`：增加 Monitors 项及数量；
- `src/workflows/locator.ts`：支持由元素元数据构建稳定定位器；
- `src/index.css`：仅补充 element picker overlay 必需样式时修改；优先让 picker 使用内联隔离样式。

## 17. 独立可合并的交付阶段

### 阶段一：元素文本监控闭环

交付 Text Monitor、元素选择、30 分钟默认调度、baseline、快照、文本 diff、浏览器通知、列表与详情、暂停/恢复/立即检查、失败三次暂停。该阶段本身是完整可用产品。

涉及核心 Store、Scheduler、Runner、Picker 和基础 UI。Price、Stock、Page text 不在 UI 中展示，避免不可用入口。

### 阶段二：价格与库存监控

在阶段一稳定模型上增加 Price/Stock normalizer、触发器和对应创建表单。阶段一用户数据无需迁移，联合类型增加分支即可。

### 阶段三：页面正文与证据增强

增加 Page text 清洗、行词 diff、截图持久化、diff 详情和保留策略。即使阶段三不交付，阶段一和二仍可正常运行。

## 18. 测试方案

### 18.1 单元测试

- 文本 Unicode、空白、零宽字符规范化；
- 中英文货币、千位分隔符、小数分隔符、起价和区间价格；
- 库存元素出现、消失、冲突和 unknown；
- 文本、价格、库存和正文 diff；
- 所有 Trigger 的 `false → true → true → false → true` 状态序列；
- 首次 baseline 不通知；
- 失败 Run 不覆盖上一成功 Snapshot；
- 连续三次失败转为 `needs_attention`；
- Store 索引查询、级联删除和数量清理；
- 多个 alarm tick 不会重复 claim 同一 Monitor。

### 18.2 集成测试页面

新增 `test/fixtures/monitoring.html`，可通过按钮模拟：

- 文本更新；
- `$1,299.00` 降至 `$999.00`；
- “Out of stock” 元素消失；
- DOM 结构变化但 role/label 保持；
- locator 消失；
- 延迟渲染；
- 页面正文只更新时间戳；
- 登录页和 CAPTCHA 标记。

### 18.3 手工验收

1. 创建文本监控，首次运行建立 baseline 且无通知；
2. 修改 fixture 文本，Run now 后出现一条通知和可读 diff；
3. 再次运行且值不变，不产生新通知；
4. 将条件恢复后再次改变，产生第二次通知；
5. 重启浏览器，确认配置、历史、下次运行仍存在；
6. 删除目标元素，确认是失败而非“文本消失”；
7. 连续失败三次，确认自动暂停且只通知一次；
8. 暂停 Monitor，等待超过调度周期，确认没有运行；
9. 删除 Monitor，确认所有关联历史和截图被清理；
10. 同时创建三个到期 Monitor，确认最多并行两个且第三个随后执行。

验证命令：

```bash
npm test -- --runInBand
npm run lint
npm run build
```

## 19. 隐私、安全与权限

- 所有配置、页面值、diff 和截图默认只保存在本地 IndexedDB；
- P0 不向任何模型 Provider 或第三方服务发送监控内容；
- 通知只展示截断后的值摘要，避免在锁屏通知泄露完整页面内容；
- 密码输入框、支付字段、`autocomplete=current-password/new-password/cc-*` 元素禁止创建 Monitor；
- URL 中的 fragment 默认保留，查询参数保留以确保页面可复现，但 UI 提醒 URL 可能包含敏感 token；
- 日志不输出完整页面正文、截图或 URL 查询参数；
- 不新增 API key、第三方账号、MCP server 或外部 CLI 依赖。

## 20. 失败攻击与设计变形

### 20.1 浏览器或外部页面不可用

浏览器关闭时 alarm 不运行，站点不可用时 Run 失败。方案通过 best-effort 文案、实际运行时间展示、三次失败暂停和人工恢复明确降级，不制造虚假 SLA。

### 20.2 十倍规模

当 Monitor 从 10 个增长到 100 个时，首先承压的是标签页并发、截图存储和全表查询。因此 P0 固定并发为 2、使用 `nextRunAt` 索引、按 Monitor 增量清理，并限制截图与历史数量。

### 20.3 回滚成本

监控使用独立模块、数据库和 manifest 权限。功能回滚时可移除 UI、调度注册及新增权限，不影响 Workflow 数据。保留数据库不会影响旧版本；完全清理由用户删除扩展数据完成，不在代码回滚时自动破坏用户历史。

## 21. 关键决策

1. **选择独立 Monitor 模型，不扩展 Workflow 模型。** 两者生命周期和成功语义不同，混用会让 Workflow Runner 承担调度、diff 和通知状态。
2. **选择确定性热路径，不使用 LLM。** 定期任务必须成本可控、结果可复现；AI 解释变化可以以后作为显式操作加入。
3. **选择结构化值与结构化 Diff，不只保存字符串。** 这使阈值触发、通知、历史 UI 和未来导出共享同一事实源。
4. **选择 locator 失败即运行失败。** 元素找不到不等于文本消失或商品有货，这是避免误报的核心边界。
5. **选择后台新标签，而非复用用户当前标签。** 监控不打断浏览，但必须接受登录过期、站点前台检测和浏览器调度限制。

拒绝的接近替代方案是“把每个 Monitor 编译为一个定时 Workflow”。它能少写一部分执行代码，但会迫使 Workflow 类型承载 baseline、快照、diff、edge trigger、保留策略和长期状态，复杂度最终更高。

最小替代方案是只做用户手动点击 `Check now` 的文本 Monitor，不申请 `alarms` 和 `notifications`。它能验证抽取与 diff，但没有持续监控价值，因此只适合作为内部开发切片，不作为发布版本。

## 22. 最脆弱的假设

本方案假设后台标签页能够复用用户登录态，并允许 Playwright CRX 在多数目标网站完成页面读取。如果大量目标网站要求前台可见、频繁触发 CAPTCHA 或阻止扩展调试，监控成功率会下降。

设计通过后台标签失败分类、`needs_attention`、手动 Run now 和明确 best-effort 承诺承受该假设失败。P0 不通过云端代理或反检测技术补偿。

## 23. 发布与回滚

发布前：

1. 完成三个阶段中本次准备发布阶段的全部自动化与手工验收；
2. 在 Chrome 全新 Profile 验证新增权限提示；
3. 更新隐私政策，声明监控数据和截图仅本地保存；
4. 更新 README 和用户指南，说明浏览器必须保持运行；
5. 用至少一个公开商品页、一个登录后页面和一个动态 SPA 连续运行 24 小时；
6. 对登录失效、locator 失败和 CAPTCHA 三种场景核对无误报。

若上线后 Monitor Runner 影响浏览稳定性，首先通过 UI 停止创建新 Monitor，并在启动时暂停所有 active Monitor；不要删除历史。代码回滚可以移除 alarm listener 和 UI，独立 IndexedDB 保留供修复版本恢复。

## 24. Approved design summary

- **Building**：本地网页监控器，支持元素文本、价格、库存和页面正文，具备定时检查、快照、结构化 diff、浏览器通知、历史审计和失败暂停闭环。
- **Not building**：云端运行、浏览器关闭后运行、外部通知集成、视觉像素 diff、自动绕过登录或 CAPTCHA、表单填充和自动提交。
- **Approach**：新增独立 Monitoring 模块，复用现有 Playwright CRX、StableLocator、IndexedDB 模式和 Side Panel，正常执行完全确定性化。
- **Key decisions**：独立数据模型；后台新标签；定位失败不算变化；edge-triggered 通知；默认 30 分钟、最低 1 分钟；连续三次失败暂停。
- **Unknowns**：没有阻塞实施的未知项。不同站点的后台加载成功率由阶段一的 24 小时实测负责验证，不改变 P0 架构。
