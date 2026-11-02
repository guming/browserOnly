# Operator 可靠性修复方案（待 Review）

日期：2026-11-01。本文是实施设计；除已完成事项外，尚未实施。

## 1. 目标与现状

目标：消除措辞造成的工具拒绝；阻止无进展重试耗尽预算；明确区分完成和受阻；用结构化读取降低 DOM 输出负担；保持已保存 memory 和 workflow 可用。

已完成：
- `e1d53da` 已推送：DeepSeek 按首个调用 index 收集参数，避免并行分片混拼及重复工具名重置参数；finish_reason 不再依赖同一 chunk 存在 tool_calls；执行引擎遇到 provider 参数解析错误会请求修复。
- 当前未提交：`src/agent/ExecutionEngine.ts` 已删除 browser_extract_links 的用户措辞正则拦截。
- 前次定向测试 24 项通过、生产构建通过；未进行真实 DeepSeek/京东端到端验证。

已确认缺陷：
- 原拦截只读取当前 prompt，参数 all/internal/external/limit 无法改变拒绝结论。
- MAX_STEPS=50 统计模型循环，格式错误、重试和真实工具调用混在一起。
- 没有 toolMatch 时通常设置 done=true；自然语言放弃也可能被标为 completed。
- normalizeToolResult 与 isToolFailure 使用不同的字符串判定，错误识别不一致。
- browser_query 最多读取 10 个 outerHTML，总输出由 truncate 限制到 20,000 字符；模型所称约 386k 字符未经运行证据确认。

此次原始 JSON 损坏的具体触发方式仍未确认；已复现的 DeepSeek 缺陷不等于已经证明本次请求触发了其中某一个。

## 2. 范围和设计取舍

分四个独立可合并阶段实施，合计超过 8 个文件，不做一次性大改。
保留 BrowserTool.func 返回 Promise<string>、现有工具名称、现有 XML 兼容入口、memory 存储和 workflow schemaVersion=1。
不引入 Midscene 依赖，不更换浏览器驱动，不自动迁移历史 memory，不扩展到视觉模型定位。

最小可交付范围为 A；推荐按 A→B→C→D 顺序实施，每阶段单独 review。
直接将 50 改成 100 无法解决重复拒绝和错误结束，不采用。

## 3. 阶段 A：解除错误拦截

修改：
- `src/agent/ExecutionEngine.ts`：删除 browser_extract_links 专用措辞判断及伪造拒绝结果，直接进入既有审批/执行分支。此修改当前已在工作区。
- `tests/unit/agent/ExecutionEngine.test.ts`：新增回归用例；mock browser_extract_links，prompt 使用“把这些整理一下”等不命中旧正则的措辞，模型发出完整调用，断言工具真实执行一次、trace 成功、正常结束。另保留需审批工具的审批用例。

验收：相同 prompt 下 all/internal/external/limit 均不因措辞被拒绝。对照旧代码必须失败。
风险：模型可能更频繁选择全页链接提取；由工具描述和任务约束指导选择，不恢复执行层的语义正则。

## 4. 阶段 B：统一结果、预算和重复失败处理

新增：
- `src/agent/ToolResult.ts`：唯一的运行时结果解码器。复用 ToolTraceEvent.result 既有 ok/data/error 语义；支持可选 meta：truncated、returnedCount、totalCount、scope。结构化对象必须校验字段类型，不因含有 ok 属性就直接信任。
- `src/agent/ExecutionBudget.ts`：每次 executePrompt 持有一个实例；拥有计数、重复失败记录、最终停止原因；不持久化。
- `tests/unit/agent/ToolResult.test.ts`、`tests/unit/agent/ExecutionBudget.test.ts`。

修改：
- `src/agent/ExecutionEngine.ts`：所有结果只解码一次；同一个解码结果供模型反馈、trace 和失败恢复使用。合并 isToolFailure 与 normalizeToolResult 的判定来源。
- `tests/unit/agent/ExecutionEngine.test.ts`：覆盖预算和错误恢复。

结果兼容规则：
1. 合法结构化结果按 ok 和 error 处理。
2. 旧 JSON 数据、普通成功字符串仍转成 ok=true；screenshotRef 原有展示和上下文反馈路径保留。
3. 旧字符串的 Error、No nodes/elements matched/found、Unable to、Action cancelled 统一识别；取消审批记为不可自动重试。
4. error.code 至少支持 INVALID_ARGUMENT、NO_MATCH、PAGE_UNAVAILABLE、APPROVAL_DENIED、PROTOCOL_ERROR、UNKNOWN；repairable 表示能否调整输入后恢复，不表示允许原样重试。

预算默认值：
- 有效工具调用上限 50；进入 func 前计数，成功或失败都计一次，避免大量失败调用不受限。
- 连续协议修复最多 3 次；成功解析完整调用后归零。
- 模型请求总次数上限 80；在发出请求前检查，避免永不结束。
- 上限边界明确：允许第 50 次调用；随后允许模型总结，不能执行第 51 次调用。不得仅因计数等于上限就覆盖一个已得到的正常完成结果。

重复失败规则：
- key 为工具名、trim 后原始输入和 error.code；不重排 selector 或改写引号。
- 同一 key 第二次失败后，反馈明确要求重新观察或更换方法；第三次拟执行相同 key 时，阻止该次执行，以 REPEATED_FAILURE 结束。
- 连续三次相同工具和错误码但输入不同，要求重新观察；继续失败至第五次则结束，避免 all/internal/external 参数变体绕过限制。
- 成功的其他工具调用清除连续失败计数；累计请求和工具预算不清零。
- 无推进的成功读取不在此阶段自动拦截，避免把用户确实需要的重复读取误判为循环。

## 5. 阶段 C：明确结束状态，并保护 memory/workflow

新增：
- `src/agent/ExecutionOutcome.ts`：内部 outcome 包含 status=completed/blocked/failed/cancelled、reason、message。reason 覆盖 MODEL_FINAL、MODEL_BLOCKED、PROTOCOL_REPAIR_LIMIT、TOOL_BUDGET、REQUEST_BUDGET、REPEATED_FAILURE。

修改：
- `src/agent/ExecutionEngine.ts`：为 operator 引入结束声明 `<finish status="completed|blocked">说明</finish>`。有工具调用时优先执行工具，不同时接受 finish；只有声明合法时接受结束；blocked 不视为成功。
- `src/agent/prompts/constants.ts`：只增加 operator 所需的结束规则；保留现有三标签工具调用格式，明确失败后不得通过一句“完成”冒充成功。
- `src/agent/PromptManager.ts`：确认结束约束仅进入 operator，普通专家回答继续兼容无 finish 的自然语言。
- `src/agent/ExecutionEngine.ts`：operator 无工具且无合法 finish 时，仅要求补充一次结束声明或工具调用；再次缺失则 failed/PROTOCOL_ERROR。协议明确结束仍不是独立的业务事实验证；具体流程需要断言或人工验收。
- `src/agent/ExecutionEngine.ts`：ExecutionCallbacks 新增可选 onExecutionOutcome；CallbackAdapter 转发；既有 onExecutionEnd 签名保持不变，blocked 映射到 failed，传入原因。
- `src/background/agentController.ts`：消费新 outcome，以原因生成用户可读的结束说明；保留 onExecutionEnd 给既有流程调用者。
- `tests/unit/agent/ExecutionEngine.test.ts`、`tests/unit/agent/PromptManager.test.ts`：覆盖 operator 和专家路径。
- `tests/workflows/candidateEligibility.test.ts`（若已有同名测试则扩展）：证明 blocked 不产生成功候选。

memory 兼容约束：
- `src/agent/MemoryManager.ts` 和 `src/agent/tools/memoryTools.ts` 不修改查询、保存和审核条件。
- `src/workflows/TraceRecorder.ts` 保留脱敏逻辑；新增 meta 进入 trace 前也必须通过相同脱敏边界，不存原始 provider 输出。
- `src/workflows/candidateEligibility.ts` 既有 completed 条件保持；blocked 映射 failed，自然不会产出“成功录制”候选。
- `src/workflows/ReplayStepExecutor.ts` 的旧字符串执行契约保持；已存 workflow 无需迁移。
- 已保存 memory 中的说明可能包含过时策略；本次不自动改写，模型仍按当前工具能力执行。

回调流向：
Provider → ExecutionEngine → ToolResult/ExecutionBudget → Tool.func
ExecutionEngine → onToolEvent → TraceRecorder → workflow candidate
ExecutionEngine → ExecutionOutcome → legacy onExecutionEnd + 新 onExecutionOutcome

## 6. 阶段 D：结构化字段提取

新增：
- `src/agent/tools/structuredReadTools.ts`：browser_extract_fields 工具；输入仍是 JSON 字符串，不接受任意 JS。
- `tests/unit/agent/tools/structuredReadTools.test.ts`：使用 DOM fixture 验证真实提取逻辑。

修改：
- `src/agent/tools/index.ts`：注册并导出 browser_extract_fields。
- `src/agent/prompts/constants.ts`：有重复记录或指定字段时优先使用结构化提取；定位交互继续使用 DOM/可访问性观察。
- `src/agent/tools/observationTools.ts`：browser_extract_links 输出结构化结果，保留同名及原 all/internal/external/limit 输入；meta 明确 scope=current_dom、truncated 和 returnedCount。只有完整扫描时才给出 totalCount；锚点数不能冒充去重链接总数。
- `tests/unit/agent/tools/observationTools.test.ts`：覆盖相对链接、去重、scope、limit、无结果和截断标记。

browser_extract_fields 输入约定：
- selector：记录容器 CSS selector，必填。
- fields：字段名到提取描述的映射；每个描述支持相对 selector（省略即容器本身）、source=text/attribute、attribute（仅 attribute 模式必填）。
- limit：默认 50，范围 1–200；offset：默认 0，非负整数。
- 单记录字段最多 20 个，单字段最多 1,000 字符，总序列化输出最多 20,000 字符。按完整记录截断，绝不截断 JSON。
- 缺少字段返回 null；selector 非法返回 INVALID_ARGUMENT；无记录返回 ok=true 和空数组。
- meta 返回 returnedCount、totalCount、truncated、nextOffset、scope=current_dom；单字段截断另记录字段名，不能假装值完整。
- 读取采用现有 withActivePage 和导航重试机制；当前 DOM 之外的分页、虚拟列表和延迟加载不作完整性承诺。
- 提取 href 按 document.baseURI 解析 HTTP(S) 链接；SKU 推导 URL 必须由后续业务规则显式标为 derived，不能伪装为页面 href。本阶段不加入京东专用 URL 规则。

## 7. 验证和发布

每阶段只运行受影响测试；回归用例先在未修复版本上失败，再验证修复后通过。

命令：
- A：npm test -- --runInBand tests/unit/agent/ExecutionEngine.test.ts
- B：npm test -- --runInBand tests/unit/agent/ToolResult.test.ts tests/unit/agent/ExecutionBudget.test.ts tests/unit/agent/ExecutionEngine.test.ts
- C：npm test -- --runInBand tests/unit/agent/ExecutionEngine.test.ts tests/unit/agent/PromptManager.test.ts tests/unit/agent/MemoryManager.test.ts tests/unit/agent/tools/memoryTools.test.ts tests/workflows/candidateEligibility.test.ts
- D：npm test -- --runInBand tests/unit/agent/tools/structuredReadTools.test.ts tests/unit/agent/tools/observationTools.test.ts
- 各阶段合并前：npm run build。

人工验收：
1. Chrome 重新加载构建后的扩展，DeepSeek 下对同一页面请求提取全部链接；确认工具真实执行，不出现措辞拒绝。
2. 以中文引号选择器执行 browser_query；合法 selector 与错误 selector 分别验证成功和重复失败退出。
3. 参数 JSON 错误连续触发最多 3 次修复，显示明确失败原因；不显示成功录制入口。
4. operator 普通最终回答未携带 finish 时只补问一次；专家普通回答照常结束。
5. 已有 reviewed memory 仍能查询；已有 workflow 仍能回放；取消审批不自动重试。
6. 结构化提取验证空结果、缺字段、分页 offset 和超限；报告只承诺当前 DOM 范围。

每阶段独立提交；用户 review 通过后再实施和推送。回滚用对应提交 revert，无数据库变更和数据迁移。测试无需新账户或凭据；人工 DeepSeek 验收使用现有配置，不增加第三方依赖。

## 8. Review 重点

建议先批准 A，随后分别审阅 B/C/D；C 引入 operator 结束协议，兼容风险最高。
需要 review 的明确设计决定：50 次工具/80 次模型请求/3 次协议修复的默认预算；blocked 映射 legacy failed；新提取工具的字段和输出上限。
最脆弱假设是模型能遵守 finish 协议；设计通过一次补全和明确失败承受其不遵守，不退回“无工具即完成”。
Midscene 借鉴依据：官方 API 的行动/读取/等待/断言分离、replanningCycleLimit，以及任务执行器的 finalizeSuccess、解析失败诊断记录。这里只采用接口和状态设计思想，不声称其保证任务完成。
参考：https://midscenejs.com/reference/ ；https://github.com/web-infra-dev/midscene/blob/main/packages/core/src/agent/tasks.ts

## 9. 实施记录（2026-11-01）

A–D 已在工作区实现，尚未提交。执行器新增 ToolResult、ExecutionBudget、ExecutionOutcome；工具注册新增 browser_extract_fields；链接提取返回结构化结果；Operator 提示词增加 finish 声明；blocked 在旧回调中映射 failed；trace 元数据继续脱敏。

实施补充：
- `src/workflows/WorkflowService.ts` 的白名单及 `tests/workflows/workflowServiceTools.test.ts` 同步加入 browser_extract_fields，否则新录制步骤无法在 workflow 中使用。
- 未修改 memory 存储和查询代码；未修改已有 workflow 的 schema 或输入。
- 非可重试的失败会禁止再次自动执行同一工具和输入。
- 字段输出预算按 JSON 编码长度分配，确保即使 20 个字段同时需要转义/截断，也能返回完整首条记录而不陷入 nextOffset=0 循环。
- 本次未拆成多次提交；工作区中还有此前独立的录制功能改动，提交时必须按路径区分。

验证：旧 HEAD 引擎下，措辞拦截、blocked 映射、重复失败上限、第 50 次调用总结四项回归均失败；恢复新引擎后通过。定向测试包含 memory、workflow 工具白名单和 trace 脱敏。生产构建通过，有原有的混合静态/动态 import 警告。

PromptManager 原测试存在 8 项基线失败，已临时恢复 HEAD 的 PromptManager/constants 源码复现：empty tools、tool descriptions、canonical sequence、macOS、Windows、empty tools update、complete workflow、undefined navigator。涉及旧品牌字符串、旧观察文案和模块导入时确定的平台信息。本次未修改这些旧断言；新增的 Operator finish 隔离测试单独通过。不能宣称完整测试套件通过。

尚未进行带真实 DeepSeek 凭据的 Chrome 扩展端到端验收；请按第 7 节重新加载 dist 后验证京东任务及历史 workflow。自动化读取测试通过 jsdom 执行实际 DOM 提取函数，不等同于真实站点验证。

## 10. 后续审查与验证

审查后补充修复：
- 有效 finish 声明先于自然语言/工具意图启发式判断，避免总结里出现 browser_click、requires_approval 或“下一步点击”等文字时被误判。新增回归先失败、修复后通过。
- 字段预算计入字段名称在数据和截断元数据中的重复开销；20 个最长字段名不再产生空数据且 nextOffset=0 的循环。新增回归先失败、修复后通过。
- WorkflowRunner 的执行、修复、最终失败判断统一使用 decodeToolResult，结构化失败不能被录制回放误标为成功；保留该文件原有的其他工作区改动。
- 模型传输重试留在当前循环内，保留历史和预算；每次请求最多重试 5 次，不再递归从初始 prompt 重新执行。测试证明成功动作不会重复、fresh error 也受次数限制。
- presentation 层输出完成声明正文，流式分片也不展示 finish 协议标签。
- PromptManager 的旧品牌/观察文案断言已更新；平台检测测试在模块隔离内导入，符合当前平台提示词在模块导入时确定的机制；35 项测试通过。第 9 节所列 8 项旧基线失败现已消除。

隔离验证：从 HEAD 导出独立源码目录，仅加入本次修改和 WorkflowRunner 的结果判定补丁，排除已有录制功能 WIP；24 个套件、246 项测试通过，生产构建通过。当前工作区生产构建也通过。

真实 Chromium DOM 验收（隔离会话、从当前 TypeScript 源码提取实际函数）：中文字段与相对 URL、分页边界、缺失属性、链接去重、external scope、最长字段名的输出上限与分页推进共 6 项通过。此验收未连接日常 Chrome 扩展，也未调用真实 DeepSeek；京东端到端验收仍未完成。

当前修改未提交或推送。浏览器临时验收脚本和隔离源码目录保留在系统临时目录，不加入仓库。

## 11. 语义定位与动作验证实现

新增 `src/agent/tools/semanticLocator.ts`，统一支持 text、role/name、selector 和唯一可见 scope。文字默认精确匹配；点击前排除隐藏/禁用候选；多匹配返回 AMBIGUOUS_TARGET、总数和最多五条摘要，不自动选第一个。scope 本身多匹配也拒绝。保留旧 CSS/文字字符串入口；CSS 类名变体只在原 selector 无匹配时解析，不在点击后尝试备用点击。

`browser_click` 新 JSON 参数示例：

```json
{"role":"menuitemcheckbox","name":"京东自营","scope":"[role=menu]","verify":{"state":"checked","expected":true,"timeoutMs":3000}}
```

verify 的 target 可独立指定；state 支持 checked、selected、expanded、visible。仅显式原生或 ARIA 状态可验证；未知和 mixed 返回 null。点击发出后，验证失败返回 VERIFICATION_UNKNOWN，响应丢失返回 ACTION_UNCERTAIN，两者都不可自动重复点击。未提供 verify 的成功响应明确 verified=false。

新增 `browser_control_state` 聚焦读取控件；tools/index、WorkflowService 白名单和 Operator 提示词已同步。WorkflowRunner 对对象或 JSON 字符串的结构化点击使用原工具，保留 scope/verify，避免旧 replay locator 丢失条件。旧 memory 的存储格式不变；旧文字点击现在默认精确匹配，歧义或缺失需显式细化，不再依赖非精确匹配。

测试覆盖：300 个同名候选最多返回五条、隐藏目标排除、禁用同名目标排除、唯一菜单作用域、role/name、未知状态、验证失败不重点击、旧 CSS 输入，以及结构化点击回放。真实 Chromium 使用当前源码工具和 Playwright 驱动完成 8 项验收，全部通过（仅替换扩展的 active-page 桥接，未连接真实京东）。

扩大验证结果：agent、workflow、DeepSeek 相关测试 619 项通过；3 项 TokenManager 历史保留测试失败，已在隔离基线复现，且该源码和测试未修改。本次不宣称整个测试套件全绿。生产构建通过。新增语义定位改动尚未提交。

## 12. 统一回归修复与原因归属

本轮已将 DeepSeek 原生调用直接作为 StreamChunk.tool_call 传给执行器，不再生成 XML 再解析；保留调用 ID、assistant/tool 消息配对和严格参数验证。无参数调用仍要求显式 input=""，审批标记必须是 boolean，不再正则截取或猜测 malformed JSON。旧 XML provider 继续使用兼容路径。网络错误向执行器抛出以使用受限重试，不再伪装成最终自然语言回答；429/503 纳入重试判断。

新增 trimNativeHistory 保证裁剪不会留下孤立 tool result，当前请求作为锚点保留。Operator 新任务默认不传旧窗口任务，明确继续时只带最近任务。原窗口共享聊天数据仍保留，用户可查看历史，memory 数据库未迁移。

streamingManager 改为每次执行创建独立 session。ExecutionEngine 拒绝同一实例并发新任务，避免重置正在运行任务的取消标记。非流式 CallbackAdapter 不再在完成后重复吐出累计的原始文本。完整 Markdown 答案只去掉 finish 外壳，原生路径不对答案或选择器做 XML 转义清洗。

动作验证加入已满足状态检查：checked/selected/expanded 已等于目标值时直接返回 verified=true、dispatched=false，避免把已选中的筛选项再次点掉。连续三次观察会获得收敛提示，但不强制点击未知控件。移除每次工具前输出完整 checklist 的要求。保留 50 次调用兜底；它不能代替任务完成度验证。

原因归属（基于 git log/source 对照）：
- 窗口历史从 tab-based 改为 window-based 的提交为 1faccb2，属于原有共享历史机制；本轮开始时仍存在。
- 链接提取措辞拒绝来自 ba8572d，本轮已删除。
- MAX_STEPS=50 和 XML 解析并非本轮新引入；本轮新增的 TOOL_BUDGET 提示把上限原因明确显示了出来。
- “Verified result and concise summary”完成提示词是本轮引入的输出质量回退，现已改为在状态外壳中保留完整用户交付物。
- 原生工具转 XML、重复失败被成功观察清空、全局流式缓冲均存在于修复前代码。没有复现用户实际旧版本/模型的相同任务，不能断言旧版本永远没有这些问题，也不能用 fixture 成功推断真实模型决策质量。

最新统一验证：40 个相关套件、638 项测试通过，生产构建通过。TokenManager 的三个旧测试已按现行“保留任务锚点和受预算限制的近期上下文”契约更新为有内容和预算断言，而非要求无条件保留所有历史用户消息。

真实 Chromium 全链路验收：使用当前 DeepSeek adapter/ExecutionEngine/ToolManager/语义工具，模型 HTTP 响应由本地 fixture 模拟；完成“物流筛选→打开自营菜单→选自营→点确定→商品详情→购物车”，7 次实际工具调用、8 次模型响应、一次审批、购物车计数=1。验证旧 MountainCar 任务未进入请求、native 调用/结果配对有效、最终回答无协议标签。该验收证明执行链可完成，未证明真实 DeepSeek 会选择同一组步骤；真实京东/登录扩展会话仍未实测。

### 最终复核补充

- 本轮最终隔离验证（HEAD 导出，仅叠加本任务文件，排除已有录制 WIP）：40 个套件、639 项测试与构建通过；随后增加“流式 finalize 后清空不再重复发送正文”测试，单独通过。最终工作区相关套件计 640 项。
- `scripts/verify-operator-browser.mjs` 已保存可重复运行的 Chromium 全链路验收。需要已安装的 playwright-core（可用 BROWSERONLY_PLAYWRIGHT_MODULE 指定模块路径），默认使用系统 Chrome，或用 BROWSERONLY_CHROME_PATH 指定可执行文件。脚本不自动安装依赖、不访问京东、不需要 API key；模型和审批均为 fixture，浏览器工具与执行器使用真实源码。
- 控件已选中时跳过重复点击；页面摘要直接呈现正文、段落、Markdown，不显示内部工具回执。memory 保存/查询与旧字符串工具输入继续兼容。
- 当前修复尚未提交、推送；dist 已重新构建。使用者需要重新加载扩展才能使用新调用链。真实 DeepSeek 决策和京东站点验收仍是明确的未验证项，不能把模拟响应的端到端成功当成真实模型完成率。

## 13. DeepSeek thinking-mode 400 修复

错误：`The reasoning_content in the thinking mode must be passed back to the API`。官方规则要求带 tools 的思考模式请求回传所有对应 assistant 消息的完整 reasoning_content，不只是工具名和参数。

根因：DeepSeek adapter 已输出 reasoning chunk，但 ExecutionEngine 未收集；adapter 构造下一次 messages 又忽略 reasoning_content。因此工具调用继续、协议修复或限流重试后的请求可能丢失必要元数据。这是本轮原生调用切换时遗漏的兼容要求。

修复：processLlmStream 收集完整 reasoningContent；当前执行中的 assistant/tool 历史和协议修复 assistant 消息保留 reasoning_content；DeepSeek adapter 原样回传。数据只用于当前 API 续接，不进入 UI、memory 或 workflow trace。429 重试沿用同一历史；HTTP 400 不再进入非流式回退重试。DeepSeek 显式思考模式参数改为官方的 thinking:{type:"enabled"}。

验证：三个新增回归在修复前均失败、修复后通过；52 项定向测试、构建通过。浏览器全链路 fixture 新增分片 reasoning 和工具调用后一次 429，验证回传内容完全一致、工具不重复执行。真实 DeepSeek 服务器仍未调用。
参考：https://api-docs.deepseek.com/guides/thinking_mode/

## 14. 完成只读任务后无法 Reflection

根因：recordReflectionSource 只保留点击/输入/按键等动作，成功的 browser_read_main 等只读任务被清空来源；workflow 完成入口却允许只读 trace，造成界面和 Reflection 的可用性不一致。

修复：Reflection 来源允许明确白名单中的成功浏览器读取、定位、提取和导航步骤；失败步骤、memory 查询和其他非浏览器工具不作为可复用来源。结构化参数按 JSON 序列化并脱敏，不再变为 [object Object]。生成结果仍存为 needs_review 候选。

Reflection 使用独立的 reflection 内部角色：初始上下文仅当前捕获任务，模型不获得浏览器工具，不要求 Operator finish 外壳，不会执行意外工具事件。onLlmOutput 的异步保存会等待完成，之后才发送完成回调。JSON 校正也走同一工具禁用路径。前端取消无条件的“Reflecting...”提示，由后端检查来源和当前网站后再宣布开始。

验证：新增五项 Reflection 控制器测试，其中四项在旧代码上失败；修复后通过。覆盖只读来源、待审阅保存、失败/memory 查询排除、结构化输入、跨网站拒绝；执行器另覆盖工具禁用、历史隔离和异步保存顺序。105 项相关测试通过。历史只读来源已被旧代码丢弃，重新加载后的任务需要重新完成一次才能生成新来源；本次不从聊天文本猜测或恢复历史步骤。

## 15. Gmail workflow 读取超时与任务模式不匹配

用户保存的任务是“找到最新的5封邮件，总结内容，过滤掉广告和营销类邮件”，但 Replay rules 只有 read text、extract fields 两步。规则重放不会重新执行模型的分类与总结，工具 trace 不能替代完整任务。现有任务应在 Gmail 页面选择 Explore by goal + Current page，并保留原始任务指令；不自动改写用户已保存的模式。

代码修改：
- 新增 `src/workflows/WorkflowPageReader.ts`：一次同步 DOM 快照读取可见文本，避免先 count 再 innerText 期间 SPA 重绘导致的定位等待；忽略隐藏正文，保留有效 HTTP(S) 链接，限制输出长度。
- `src/workflows/WorkflowService.ts`：browser_read_text/read_text_enhanced 使用全页可见文本，read_main 使用正文区域；overview/summary 共享快照读取。未通过提高 15 秒超时掩盖问题。
- `src/workflows/WorkflowCompiler.ts`：包含原始目标、只有读取/提取/导航的新录制默认 goal 模式；包含操作的录制及没有目标的旧规则继续使用原模式。已有保存任务不迁移。

验证：旧实现上的两个回归先失败，修复后通过；最终 17 个相关套件、75 项测试通过，生产构建通过。真实 Chromium fixture 验证隐藏旧 main 不阻碍邮箱可见文本读取，链接按页面 base URL 解析。没有访问用户 Gmail，也没有复现其线上 15 秒超时现场，因此不能宣称真实邮箱任务已验收。新代码需重新加载扩展生效。

## 16. Reflection 不应要求返回原网站

前述第 14 节的跨网站拒绝规则过严：Reflection 已只消费捕获的任务与成功步骤，不需要读取当前页面。移除 triggerReflection 的当前域名相等要求；saveReflectionMemory 使用捕获来源的 domain，而非当前网页。agentController 保存时也不再读取当前页面 URL。没有来源仍拒绝，候选仍 needs_review，历史不会混入。

回归覆盖同一 tab 从 jd.com 跳转 github.com 后生成反思且仍保存为 jd.com 来源。该测试在修复前失败，修复后通过；46 项 Reflection/执行器测试通过。
