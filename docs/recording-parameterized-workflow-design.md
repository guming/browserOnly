# Recording 优化：从演示轨迹到参数化批量 Workflow

状态：待评审；本文件是设计，不代表功能已经实现。

## 1. 目标与推荐方案

把用户演示的一次任务编译成可编辑、可传参、可验证的单项流程，再用同一流程顺序处理多项输入。保留现有 Workflow、WorkflowVersion、WorkflowService、WorkflowRunner、WorkflowStore 和 MemoryService，不另建执行引擎，不引入依赖或新数据库。

京东验收场景：用户演示“打开首页、输入商品、搜索、打开结果、选择规格、加入购物车”，保存时确认变量和选品规则，下次输入多个商品即可顺序执行。录制时的 tabId、商品 URL、商品文案不能成为下一次任务的固定目标。

现有 docs/replayable-workflow-design.md 把首版循环列为非目标，docs/command-workflow-library-v1-design.md 要求不新增第二套 Runner。本设计按照本次批量需求增加单项流程的外层顺序调度，不引入通用循环 DSL，继续遵守一个执行模型。

最小可用方案：手动确认变量 + 确定性单项流程 + 顺序批量执行。AI 仅提供归纳建议，未配置模型时核心功能仍然可用。

关键假设：一次演示只能证明具体路径，不能证明“销量最高”“最低价”等选择规则。无法从证据确定的规则必须由用户确认；不得让模型猜一个规则后默默用于购物车写入。

## 2. 当前代码事实

| 位置 | 当前行为 | 影响 |
| --- | --- | --- |
| RememberActions.tsx | origin + pathname 保存地址 | 查询参数、hash 丢失 |
| RememberActions.tsx | 记录 click/input/change，输入值不保存 | 缺少 Enter、提交语义和变量示例；无法重建完整搜索路径 |
| RememberActions.tsx | 点击与后续 URL 更新分别记录 | 点击引发导航可能重复执行 |
| UserActionCompiler.ts | 展示 label 用作 accessibleName | Button、Text field 等兜底名称进入定位器 |
| UserActionCompiler.ts | 按事件序号生成 input_N | 参数缺少业务含义，商品选择仍固定为示例商品 |
| ReplayLocatorResolver.ts | count/isVisible/isEnabled 即时检查 | 页面或目标尚未就绪即失败 |
| replayLocatorResolver.test.ts | 歧义目标必须停止 | 这是现有保护，不能直接改为无条件 CSS fallback |
| ReplayStepExecutor.ts | 使用传入的原始 step.locator | 即便 input 替换变量，locator 中的变量也不会随之解析 |
| WorkflowRunner.ts | 字符串替换为主，外层计时不取消普通导航 | 缺失变量可能原样进入页面；超时操作可能仍在执行 |
| schedulingIntegration.ts | 保存并再次读取 schedule.ownerTabId | 关闭原标签页或重启后任务无法启动 |
| WorkflowService.ts / tools/index.ts | Workflow 白名单和公共注册均未提供 browser_select | 手动录制 change 可生成步骤，但执行时可能被判 unsupported |
| MemoryService | taskDescription + toolSequence，独立数据库 | 可作为说明知识，不能直接承担可靠执行 |

上述是源码事实，不代表所有已报告运行错误都已完成浏览器复现。

## 3. 模块关系与责任

```text
RememberActions / Agent trace
           |
           v
RecordingNormalizer ---------> RecordingReview
           |                         |
           +--- 用户确认的参数与规则 ---+
                                     v
                 UserActionCompiler / WorkflowCompiler
                                     |
                                     v
                          WorkflowStore（现有）
                                     |
RunSetup -> messageHandler -> 单项启动函数 -> WorkflowService
                |                          |
                +-> runBatch（顺序调度）----+-> WorkflowRunner
                                                 |
                                          ReplayStepExecutor
                                                 |
                                  ReplayLocatorResolver / Page

已验证 WorkflowVersion -> WorkflowMemoryExporter -> MemoryService
```

批量调度只管理输入、取消和结果，所有页面动作仍由现有 Runner 执行。编译模块不得依赖 UI；Memory 导出失败不得阻止 Workflow 保存。

## 4. 数据契约：增量扩展现有类型

### 4.1 新增 recordingTypes.ts

RecordedAction 增加以下字段，旧 UserRecordedAction 保留兼容导出：

- id、sequence、timestamp：顺序和关联依据。
- kind：既有 click/input/change/navigate，加 press_key 和 submit。
- label：只用于展示。
- target：真实 role、accessibleName、label、testId、CSS、tag、输入类型。
- page：逻辑 pageKey、URL、页面角色；真实 tabId 仅存在于当前录制会话映射。
- navigation：来源动作、同页/新页、目标 URL、是否明确关联。
- inputSample：仅普通字段可在内存中保存脱敏示例；不进入日志，保存后释放。

默认拒绝密码、验证码、支付字段、令牌和隐藏字段。URL 不再整体删除 query/hash；敏感参数转为运行时输入或提示无法可靠重放，不能保存真实敏感值。

### 4.2 types.ts 的可选字段

| 类型 | 增量字段 | 语义 |
| --- | --- | --- |
| WorkflowVersion | recordingFormat: semantic-v1 | 标记新编译能力；缺省走旧路径 |
| WorkflowVersion | batch: { itemAlias, maxItems, failureMode } | 初期 maxItems=50，failureMode 固定为 stop |
| WorkflowVariableType | items | 批量行列表；不使用现有 tabs 类型承载业务数据 |
| WorkflowVariable | itemFields | items 的子字段定义；不支持嵌套 items |
| WorkflowStep | intent、sourceActionIds | 可读意图与录制来源，用于解释和审计 |
| WorkflowStep | actionInput | 新格式的结构化 selector/value/key；旧 input 字符串继续支持 |
| WorkflowStep | navigationEffect | same_page/new_page、URL 模板或允许 URL 模式 |
| StableLocator | scope、identity | 结果卡片范围与同一目标身份约束，仅新格式生效 |
| WorkflowRun | batchId、itemIndex、batchSummary | 子运行归组；父运行保存总数及逐项状态统计 |
| WorkflowStepRun | actionOutcome | not_started / confirmed / uncertain |
| WorkflowSchedule | contextPolicy | fresh_entry；legacy owner 字段改为可选兼容字段 |

保持 Workflow.schemaVersion=1 与现有 replayFormat=steps-v2；新能力使用明确的能力标记，在统一预检中拒绝当前实现不支持的格式，而非跳过字段继续执行。

参数定义和步骤都参与版本一致性检查。新增单项配置时使用既有 Workflow.variables；批量流程的 items 子字段定义随 WorkflowVersion 保存，避免历史版本被当前表单定义改变。

### 4.3 商品参数

每行支持 keyword（必填）、quantity（正整数，默认 1）、selection（first_result / exact_sku）、sku（exact_sku 时必填）、spec（可选键值表）。

first_result 必须明确展示为“搜索结果中的第一个商品”，不能描述为“最合适商品”。只有录制证据确认了结果集合和顺序、用户确认该规则后才允许生成。

用户不选规则时，保留示例商品为固定商品流程并提示不能泛化选品，不能伪装成通用批量搜索。选销量、价格区间等条件，本版只允许转换成录制中实际演示过的筛选动作；无法编译则提示未支持。

## 5. 录制与归纳的实现细节

### 5.1 RememberActions.tsx：仅负责会话和界面

把可注入的独立函数移至 recordingCapture.ts。chrome.scripting.executeScript 注入函数不能引用文件外闭包；辅助逻辑必须自包含，避免普通模块导入在被注入页面失效。

会话内以 Chrome tabId 映射 page-1、page-2，保存产物只写逻辑关系。新增键盘 Enter、表单提交捕获；同一次提交产生的 keydown、submit、click 只保留一个实际提交动作。持续输入合并为最后一次字段编辑，IME composition 完成后再生成稳定值。

点击时采集真实元素元数据、链接 href、最近结果卡片范围。不要仅截取元素 textContent 当作 accessible name；准确名称不可确定时留空，使用经验证的 testId/CSS，并在录制确认时标记弱定位。

跨页动作不能依赖页面已经卸载后再发送事件。后台观察 URL/新标签页，使用动作 id、来源页及 opener 建立关联；时间接近只能作为候选证据。无法确定因果关系时在确认界面保留待确认项。

### 5.2 新增 RecordingNormalizer.ts：纯函数

输入：原始事件、初始 URL、用户确认的绑定；输出：规范化动作、参数候选、警告。

规则顺序固定：输入去重 → 提交去重 → 页面关系归并 → 参数绑定 → 验证声明。

- 点击引发的明确导航转为该动作的 navigationEffect，不额外执行一次 goto。
- 用户地址栏导航保留为 navigate；不能删除所有导航事件。
- 新标签页记录为动作结果，不能固化 tabId 或 tab 索引。
- 历史返回若仅为恢复搜索入口且证据完整，可在确认后转换为显式入口导航；无法确定则保留返回动作。
- 输入框内容优先成为变量候选；商品名称、详情页 URL、规格值也检查是否属于同一个业务参数。
- 不允许把变量替换成任意 CSS 片段；参数只进入受控的名称、文本、属性值或动作 value。

### 5.3 新增 RecordingReview.tsx：最小必要确认

沿用现有 Done → review → save 流程。增加参数绑定、商品选择规则、重复单元和成功条件四部分；现有侧栏结构不变。

重复单元选择一次完整单项任务的连续步骤范围；范围外动作不自动复制。本版批量单项必须能从保存入口重建，遇到依赖临时弹窗、文件输入等状态的流程，仍可保存为单项 current_page，不能开启定时批量。

成功条件必须来自用户确认的 URL、可见提示或与目标商品相关的购物车状态。泛化的“页面出现成功”不能单独证明当前商品已加入。

AI 使用既有 provider 接口，只输出参数绑定、步骤命名和规则建议；结果须经 schema 校验并经过用户确认。模型失败直接退回手动确认，不阻断保存。

### 5.4 UserActionCompiler.ts 与 WorkflowCompiler.ts

保留现有入口函数，通过可选编译选项接收规范化轨迹。既有 trace 编译保持兼容；新增手动录制路径先完整支持，Agent trace 只有证据字段齐全时才进入语义编译。

编译出的仍是现有 navigate/action 步骤，不添加通用 ai_step 执行器。语义信息落在 intent；定位、变量绑定和断言落在已有步骤结构的可选扩展中。

搜索结果点击使用“结果集合 scope + 用户确认选择规则 + 当前项身份”，不使用示例商品的固定标题。详情页通过点击结果接管，不能把示例详情 URL 再编译为独立导航。

## 6. 执行可靠性

### 6.1 新增 WorkflowBindings.ts

统一校验普通参数、批量行和结构化动作；支持受控点路径 item.keyword，不执行 JS，不使用 eval，拒绝原型链字段。缺失变量在启动页面前报 INPUT_MISSING。

解析 step.input、actionInput、locator、scope、断言的变量，产生新的运行时 step，不修改保存版本。CSS 属性值使用正确转义，URL 使用 URL/URLSearchParams 编码，不拼接未经转义的值。

旧字符串 selector|value 仅在旧路径继续解析；新录制保存结构化 value，防止值含分隔符时产生歧义。

### 6.2 ReplayStepExecutor.ts / ReplayLocatorResolver.ts

每步共享截止时间；定位、动作、导航接棒、后置验证均使用剩余预算，取消后不再开始动作。

等待目标出现，最终 click/fill/select 继续利用 Playwright 原生 actionability 检查，不以 count/isVisible 的瞬时结果替代原生等待。不添加固定页面 sleep，不把 networkidle 作为通用就绪条件。

旧格式保持现有歧义即停规则。新格式只有 scope 和 identity 能证明候选指向同一目标时才可继续尝试精确候选；不得从重复的“加入购物车”文本随意退到另一个商品的 CSS。

导航监听在动作前注册，包括由 opener 关联的新页面；动作后等待并验证唯一后继页，不能只比较动作前后 pages() 的即时快照。多候选停止，运行中的 pageRef 与 context.tabId 一起更新，不重新查询活动标签页。

### 6.3 navigationTools.ts / WorkflowRunner.ts / WorkflowService.ts

- 返回、前进使用明确 domcontentloaded 等待和内部超时，内部超时短于步骤预算。
- 外层超时不能取消 Playwright 操作本身。必须等待底层操作结算后才允许下一项/释放执行租约；取消或超时有未结算写动作时记 uncertain，禁止继续调度。
- 统一预检工具白名单；WorkflowService 显式注册 Workflow 专用 browser_select 适配器，按 selector/value 执行原生 selectOption，新格式由回放执行器落实。不直接启用 interactionTools.ts 中硬编码 Relevance/-submitted_date 的旧函数，不扩大整个 Agent 工具集合。
- 动作结果未知时，优先验证当前项的后置条件；只有确认未执行的定位失败才可修复并再执行。已可能执行的加购动作不可盲目重试。
- 错误记录脱敏的页面 URL、阶段、候选类型、匹配数与是否仍有未结算操作，不记录完整敏感输入。

## 7. 标签页与调度解耦

新增 WorkflowExecutionContext.ts，集中解析本次运行的宿主窗口、入口、主 Page 和标签页交接。复用 tabManager 创建和 attach 页面的方法，不新建浏览器服务。

messageHandler.handleRunWorkflow 不再无条件先 tabs.get(ownerTabId)。new_tab 从本次仍存在的窗口或正常浏览器窗口创建执行页；ownerTabId 只作可选 UI 来源。所有运行页面均使用新分配的执行 tabId。

schedulingIntegration 保存新计划时不保存 tabId/windowId，fresh_entry 按保存入口运行。旧 url/standalone 计划执行时忽略历史 owner ID；旧 current_page 计划标记 needs_attention，要求用户选择可重建入口，不擅自操作一个随机当前页。

current_page 手动运行继续使用用户本次明确选择的页面；不改变其已有语义。关闭 owner 页不影响执行，关闭执行页取消任务；窗口关闭后不恢复写操作。

计划不保存浏览器运行时 ID 不等于 Run 记录不保存 ID。Run 保留本次真实 ID 用于诊断；它们不能用于下一次启动。

## 8. 批量执行与逐项结果

新增 WorkflowBatch.ts，导出顺序调度函数，不新增 Runner 类。messageHandler 抽出本文件私有的单项执行函数，在一次窗口租约内分别供单项和批量调用，禁止递归调用 handleRunWorkflow 造成重复加锁。

启动时固定 activeVersionId、复制参数快照、校验最多 50 项并生成 batchId。用既有 runs store 保存一个父记录，每项仍由新建 WorkflowRunner 生成独立子 Run；子记录携带 batchId/itemIndex。

初期每项从保存入口创建独立执行页。成功页完成记录后关闭；最后成功页、失败页和 uncertain 页保留。只能清理本批次创建的页；不并行，不复用不明状态的上一项页。

默认失败即停。尚未运行项在批量结果显示 not_started，不计为失败。父状态沿用 succeeded/failed/cancelled；部分完成通过 batchSummary 表达，不扩散修改所有状态枚举。

取消先停止调度，再取消当前项。浏览器重启后已运行但未确认的写步骤标为 uncertain，不自动续跑。用户恢复时只允许显式选择失败前未执行的项，不能一键重放已成功项。

重复商品行保留为不同 itemIndex，不按关键词自动去重；例如两次添加同一商品可能是用户意图。

### 8.1 审批

最小发布版本沿用逐步审批，明确说明批量减少的是重复操作，不代表取消写操作确认。

后续独立增加当前批次的范围授权：用户先看到不可变版本、商品列表、数量及加购动作，再允许同批次中的明确动作；授权只在内存中存在，并绑定 batchId/versionId/输入快照/步骤/目标域。修复更换写目标、增加商品或数量必须重新审批，付款和下单不包含在加购授权中。

未经确认的批量写操作不能用于无人值守计划；现有 scheduled 写操作暂停规则继续适用。

## 9. Memory 与命令

现有 src/actions/workflowActions.ts 已从 Workflow 名称生成斜杠命令，直接沿用；参数页面增加 items 后，单个命令可打开批量输入表单，不创建另一套命令执行链。

新增 WorkflowMemoryExporter.ts，将已验证版本投影为现有 AgentMemory 的 taskDescription 和 toolSequence，内容描述入口、变量、操作意图、选品规则和成功依据；不包含示例商品值、真实 tabId、敏感 URL 或当前 DOM。

Memory 增加可选 sourceWorkflowId/sourceVersionId，source 使用既有 manual，保证来源可追溯。首次导出设 needs_review，经用户审核并有验证证据后才 active；不能把未验证录制直接作为可信知识。

Workflow 是执行事实来源；Memory 是供 Agent 参考的文字知识。更新 Workflow 不自动覆盖人工编辑的 Memory；导出显示来源版本，允许显式更新。Memory 写失败保留已保存 Workflow，不做跨数据库原子事务。

## 10. 文件改动清单

完整方案超过 8 个文件，拆为独立提交；不移动既有目录，不新增服务、不引入新的语言或第三方运行时。

| 阶段 | 现有文件 | 精确改动 |
| --- | --- | --- |
| A | src/agent/tools/navigationTools.ts | 返回/前进的等待条件与内部超时 |
| A | src/workflows/ReplayLocatorResolver.ts | 有预算的等待、诊断；保留旧歧义规则 |
| A | src/workflows/ReplayStepExecutor.ts | 共享时间预算、结构化输入兼容入口 |
| A | src/workflows/WorkflowRunner.ts | 截止时间、动作结果分类、超时后结算屏障 |
| A | src/workflows/WorkflowService.ts | 工具能力预检、select 注册、页面交接适配 |
| A | src/background/messageHandler.ts | 运行时上下文解析、单项私有函数与租约清理 |
| A | src/workflows/schedulingIntegration.ts | 计划去 tabId 依赖、旧计划兼容 |
| A | src/workflows/types.ts | 可选运行诊断字段、计划上下文策略 |
| A | src/sidepanel/components/WorkflowScheduleControl.tsx | 移除绑定旧页文案，提示入口要求 |
| B | src/sidepanel/components/memory/RememberActions.tsx | 接入捕获/归纳/确认组件，保存完整入口 |
| B | src/workflows/UserActionCompiler.ts | 参数化语义编译，兼容原入口 |
| B | src/workflows/WorkflowCompiler.ts | 保留原 trace 分支，新证据可选接入 |
| B | src/workflows/locator.ts | 真名称与展示名分离、scope 与身份约束 |
| B | src/workflows/types.ts | 新录制格式、结构化动作、参数与导航效果 |
| B | src/workflows/WorkflowRunner.ts | 执行前绑定完整运行时 step、后置验证 |
| B | src/workflows/ReplayStepExecutor.ts | 结构化动作、导航效果与新页监听 |
| B | src/workflows/ReplayLocatorResolver.ts | scoped target 与身份验证 |
| B | src/sidepanel/components/WorkflowDetailView.tsx | 新字段编辑和版本保留，避免保存丢失 |
| C | src/workflows/types.ts | items、批量配置和结果字段 |
| C | src/background/types.ts | RunWorkflowMessage 可选批量输入 |
| C | src/background/messageHandler.ts | 同一窗口租约内调度单项或批量 |
| C | src/sidepanel/components/templates/RunSetupView.tsx | 批量校验、预览和提交 |
| C | src/sidepanel/components/templates/VariableField.tsx | items 表单分支 |
| C | src/sidepanel/components/RunDetailView.tsx | 父/子运行和未执行项展示 |
| C | src/sidepanel/components/RunListView.tsx | 批量父记录展示，避免子项刷屏 |
| D | src/tracking/memoryService.ts | 来源 Workflow/Version 可选字段 |
| D | src/sidepanel/components/WorkflowDetailView.tsx | 仅对已验证版本展示导出入口 |
| E | src/agent/approvalManager.ts | 当前批次范围授权、取消清理 |
| E | src/sidepanel/components/ApprovalRequest.tsx | 商品与动作范围预览 |
| E | src/workflows/WorkflowRunner.ts | 消费范围授权，修复目标时失效 |

新增文件：

| 文件 | 接口职责 |
| --- | --- |
| src/workflows/WorkflowExecutionContext.ts | resolve/create/handoff/dispose 本次运行上下文 |
| src/workflows/ReplayDeadline.ts | remaining/checkCancelled/settle 预算与底层结算 |
| src/workflows/recordingTypes.ts | 事件、规范化轨迹和确认绑定类型 |
| src/workflows/recordingCapture.ts | 自包含注入函数及停止函数 |
| src/workflows/RecordingNormalizer.ts | normalizeRecording(events, bindings) 纯函数 |
| src/workflows/WorkflowBindings.ts | validateInputs、bindStep、受控点路径解析 |
| src/sidepanel/components/memory/RecordingReview.tsx | 参数/规则/断言确认，不负责持久化 |
| src/workflows/WorkflowBatch.ts | runBatch(input, executeItem, signal) 顺序调度 |
| src/sidepanel/components/templates/BatchItemsField.tsx | 商品行编辑、逐行校验及纯文本关键词导入 |
| src/workflows/WorkflowMemoryExporter.ts | 生成现有 AgentMemory 的知识投影 |

ReplayDeadline 不宣称 AbortSignal 能取消 Playwright 原生命令；底层仍须使用原生 timeout，未结算时禁止后继动作。

## 11. 实施顺序与独立交付

| 阶段 | 可单独交付的结果 | 工作量估算 |
| --- | --- | --- |
| A | 旧流程等待和导航更可靠，计划不依赖已关闭页 | 2–3 工程日 |
| B | 一次演示保存为可换商品的单项流程 | 4–6 工程日 |
| C | 同一流程处理多商品，逐项结果可追踪 | 3–4 工程日 |
| D | 已验证流程导出 Memory，复用现有命令入口 | 1–2 工程日 |
| E | 当前批次一次范围确认，减少重复审批 | 2–3 工程日 |

阶段 B 允许只做单项；阶段 C 不依赖 D/E；模型归纳建议属于 B 的可选增强，不成为功能发布前提。真实站点适配成本取决于页面差异，以上是实现与测试估算，不是京东页面长期稳定承诺。

## 12. 兼容、回滚和依赖

- WorkflowStore 现有对象存储可保存可选字段，不增 DB_VERSION，不批量改写旧记录。
- 保存新录制使用 activateVersion 的既有事务；老版本不可变，旧流程继续旧分支。
- 缺失 URL 参数、键盘动作或元素身份的旧录制不能凭空恢复。提示重新演示缺失步骤或手动补充，不能静默升级成已验证流程。
- 运行时取消/关闭页会终止本次执行，不能以重新创建页面来恢复可能已经发生的写动作。
- 应用级回滚使用仍保留格式识别的版本，关闭新录制/批量入口即可；不能回滚到会忽略新字段的旧二进制并继续运行新流程。支持导出旧单项版本用于人工回退。
- 不新增 API、账号、CLI 或网络依赖。可选 AI 使用现有已配置 provider；不可用时手工绑定。京东登录状态使用当前 Chrome 会话，不存 Cookie 或令牌。
- 不实现任意嵌套循环、并行加购、自由 JavaScript、自动支付、跨重启自动恢复写操作。跨域 iframe/闭合 Shadow DOM 无法可靠定位时明确提示录制不完整。

## 13. 验证与验收

新建测试文件：recordingNormalizer.test.ts、workflowBindings.test.ts、workflowBatch.test.ts、workflowExecutionContext.test.ts、workflowMemoryExporter.test.ts。

扩展现有 rememberActions.test.tsx、replayLocatorResolver.test.ts、workflowReplay.test.ts、workflowScheduler.test.ts、workflowServiceTools.test.ts 和 workflowDetailView.test.tsx。

必须覆盖：

1. URL query/hash 保留，敏感参数不落盘，展示 Button 不进入真实名称。
2. Enter 提交、click+submit 去重、输入合并与 IME 完成事件。
3. 点击导航合并、手动导航保留、慢弹出页接棒、多弹出页停止。
4. 目标延迟出现可等待；旧歧义测试继续通过；新 scope 不会跨商品卡点击。
5. keyword、locator、断言同时绑定；分隔符、引号、Unicode、缺失字段、原型链注入被正确处理。
6. 关闭原页后 new_tab 和 fresh_entry 计划仍可启动；旧 current_page 计划要求改入口。
7. 批量 3 项成功；第二项失败后第三项 not_started；取消与重启不重复第一项加购。
8. 加购已发送但响应丢失时记录 uncertain，不再次点击；确认后置条件可将结果归为 confirmed。
9. 每项从入口重建、执行页清理不影响用户页、活动页切换不改变目标。
10. browser_select 编译/能力预检/回放一致；已验证 Memory 才能进入现有可信查找流程。
11. 未改旧流程、goal runner、提取和 office 结果协议；版本编辑不丢新增字段。
12. E 阶段范围授权只覆盖固定批次，输入/版本/目标变更和取消后不可复用。

对已有报错增加回归用例，先在未修复代码观察失败，再应用修复观察通过。按阶段执行对应 Jest 测试，最后运行 npm run build；完整回归只在交付集成点执行。

浏览器验收先使用本地可控商城 fixture 验证延迟渲染、搜索结果变化、规格选择、购物车反馈和弹出页，再用登录后的真实京东人工验收：录制商品 A，关掉全部录制页，输入商品 B/C，确认没有访问 A 的固定详情地址，购物车只出现用户确认的 B/C 和数量。最后由用户清理本次实际加购结果。

通过标准：无旧 tabId 依赖；不同商品能复用轨迹；每项有目标身份和成功证据；不确定写入不重试；旧 Workflow 与现有歧义保护不回归。

## 14. 官方实现依据

Playwright 原生 locator 已提供动作自动等待，应在其上补齐步骤预算、业务目标和页面关系，而不是用即时 count 检查替代：

- https://playwright.dev/docs/actionability
- https://playwright.dev/docs/locators
- https://playwright.dev/docs/best-practices

Selenium IDE 的数据驱动与控制流表明“可复用步骤 + 数据输入”是独立维度；本项目只取顶层顺序数据驱动，避免引入其通用表达式循环：

- https://www.selenium.dev/selenium-ide/docs/en/introduction/control-flow
- https://www.selenium.dev/selenium-ide/docs/en/introduction/command-line-runner
