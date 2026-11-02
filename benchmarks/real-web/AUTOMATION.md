# 自动执行真实扩展

已实现真实扩展执行与规则验收：启动 Chromium、串行执行 10 题、保存回答和网页证据，再按每题规则逐项检查。Agent 的 completed 不算测试 passed。证据不足、页面结构不支持或需要语义判断的检查保留 null，并显示待复核。

## 安装与构建

在仓库根目录执行：

```sh
npm install
npx playwright install chromium
npm run build:benchmark
```

测试构建位于 `dist-benchmark/`，普通 `npm run build` 仍生成 `dist/`。测试入口通过单独的 background entry 编译，生产构建不包含它。没有新增网页可访问的消息端点、外部 HTTP 控制端口或 manifest 权限。

先跑不收费的端到端自检：

```sh
npm run benchmark:real-web -- --smoke --headless
```

它会启动临时 localhost 页面和模拟模型服务，验证扩展连接、真实 Agent 循环、浏览器读取工具、截图和结果导出。模拟响应不代表真实模型能力，也不计入 10 题成绩。如果本地安全策略禁止监听 localhost 或启动 Chromium，需要在允许这些操作的终端执行。

## 配置真实模型

Runner 不读取日常 Chrome Profile，使用环境变量配置。必填 `BENCHMARK_PROVIDER`、`BENCHMARK_MODEL`，除 Ollama 外还需要 `BENCHMARK_API_KEY`。Provider 支持 anthropic、openai、gemini、ollama、openai-compatible、deepseek。

例如 OpenAI（密钥从你现有的环境变量注入）：

```sh
export BENCHMARK_PROVIDER=openai
export BENCHMARK_MODEL=gpt-4o
export BENCHMARK_API_KEY="$OPENAI_API_KEY"
npm run benchmark:real-web -- --job 03
```

模型 ID 按账号实际可用值填写；示例不是能力或价格推荐。openai-compatible 另外要求 `BENCHMARK_BASE_URL`，填写服务商的 API base URL（如包含 `/v1` 的地址）。Ollama 可不填密钥，远程实例可用同一变量指定地址。

```sh
npm run benchmark:real-web -- --all
npm run benchmark:real-web -- --all --headless
npm run benchmark:real-web -- --job 05 --output benchmarks/real-web/runs/cdc-baseline
```

默认有界面运行，便于排查真实网站的拦截或差异。`--output` 必须是尚不存在的目录，禁止覆盖历史结果。`--executable /absolute/path/to/chromium` 可指定兼容的 Chromium；优先使用 Playwright 配套版本。缺少浏览器时按安装命令补齐，不会偷偷改用日常浏览器。

## 执行与隔离

- 每题启动一个新的临时 Profile、独立窗口和新 Agent，结束后关闭整个浏览器并删除 Profile；不会读取日常浏览器的账号、Cookie、模型配置或记忆。父 Agent 和读取工具使用同一模型配置，记忆工具禁用。
- 每题最多 300 秒，沿用 Agent 默认 50 次工具预算。先请求取消，宽限 10 秒仍未结束则关闭整个浏览器；关闭完才启动下一题。桥接调用另有 15 秒响应限制，避免 worker 失联无限等待。
- 无人值守时不自动批准审批；Agent 请求审批会留下失败原因。网页不可达、限流、模型错误、定位失败等先记录原始状态，由验收人决定属于失败还是环境受阻；不靠字符串猜测自动抹掉失败。
- 无自动重试。一次失败仍保留记录，其他题继续。退出码 0 表示本次选择的题目全部执行完成且规则检查全部通过；1 表示执行失败或存在明确不通过项；2 表示没有明确失败，但仍有检查待复核。未选择的题目不影响本次退出码，但报告始终保留 10 题。
- 只有本次 Profile 临时存储模型密钥，不将配置载荷写入报告。临时 Profile 在浏览器关闭后删除；不要把密钥放进命令参数或任务文本。强制杀死 Node/系统崩溃时可能遗留系统临时目录，需按 `browseronly-benchmark-*` 名称人工清理。

## 输出与验收

默认在 `benchmarks/real-web/runs/auto-<UTC timestamp>/` 保存：

```text
run.json                         10 题记录，未选择的题保持 pending
run.tasks.json                   提示词和验收定义快照；与运行结果分开保存
report.md                        Agent 状态、规则验收结果及待复核数量
03-wikipedia-two-hop/
  execution.json                 输出、工具轨迹、时间、token、网页观测
  screenshot-000.png             初始页面截图（成功采集时）
  screenshot-001.png             最终页面截图（成功采集时）
```

新记录的 `run.json` 不再逐题嵌入 `task`，而通过 `tasksFile` 和 `tasksSha256` 引用同目录的任务快照。报告和离线验收会加载并校验快照，历史任务不受当前任务文件修改影响。移动或分享运行记录时须一起保留该快照。旧版内嵌 task 的记录仍可读取。人工编辑结果不要修改任务快照；否则哈希校验失败。

`agentStatus` 表示执行结果；`outcome: evaluated` 和 `judgeType: rules` 表示已运行规则验收；`verificationStatus: needs_review` 表示仍有 null 检查。`automaticEvaluation` 保存验收器版本、时间和执行证据 SHA-256。每个检查项有 true / false / null 及具体依据。没有规则通过证据时不会给整题通过。旧版 pending + agentStatus 仍显示为待验收。

自动运行时会在原提示词末尾追加 JSON 输出字段要求，不提供标准答案；末尾 JSON 是规则验收的规范答案，中文正文供人阅读。无法解析的自然语言回答不会被关键词匹配强行判通过。

该运行方式记录为 `environment.runner: real-extension-v2`、`answerFormat: json-v1`，与第一阶段 v1 的纯自然语言回答分开比较。

每次工具执行后，等待证据采集，再继续下一个工具；checkpoint 合并异步保存，减少翻页后错取证据。网页文字最多 50,000 字符、链接最多 500 条；单条工具轨迹超过 20,000 字符会标记 truncated；截图超过 1 MB 不保留并写入 evidenceErrors。它们是证据上限，不能据此推断未采集部分正确。worker 重启时恢复最后的 checkpoint，标为 interrupted，不自动重放操作。

扩展截图统一通过原生 `chrome.debugger` 的 `Page.captureScreenshot` 获取，普通截图工具、指定标签页截图、benchmark 和 Tests 失败取证共用适配层，不含站点专用判断。页面对象与 tabId 通过 attached 事件绑定，避免同网址标签页串台。默认 5 秒总预算包含等待 Chrome 标签页导航完成、布局测量和捕获；字体和 Playwright 截图队列不参与。全页截图根据 CSS 内容尺寸设置裁剪区域，超过 32,767 单边或 6,400 万像素时返回错误，建议改用视口截图。

超时不会取消底层 CDP 请求，因此同标签页仍有未返回的捕获时拒绝重复请求，返回 SCREENSHOT_BUSY；导航未结束、连接断开、身份未知分别有明确错误，不通过第二次 attach 抢占已有浏览器调试连接。自检要求初始和最终截图均实际导出，不能只看 Agent completed。

### Step 次数与耗时

每次实际调用工具计 1 step，失败及实际重试计入；审批拒绝等未执行请求不计入。`execution.json.steps` 记录顺序、工具名、起止时间、单调时钟计算的 durationMs、状态和错误码。每题另外导出 `steps.csv` 与 `steps.md`，总报告列出步骤数、成功/失败/未结束数量和工具累计耗时。历史记录没有 steps 时保持未知，不反推为零。

计时只使用本地事件，不调用模型、不加入模型上下文，不新增页面读取。开始与结束在内存中立即记录，250ms 合并异步 checkpoint，任务结束等待存储完成；系统崩溃可能丢失最后未保存片段。既有网页取证仍在每步后等待完成，以保留正确快照；其时间单独记录为 evidenceDurationMs，不计入工具耗时。总耗时还包含模型和初始化等开销，不能把总耗时减工具耗时直接称为模型耗时。未完成步骤不编造 durationMs。

按 [EVALUATION.md](EVALUATION.md) 检查证据，填写每项 `passed` 和 `evidence`、验收人，以及 `outcome: reviewed`。不要修改工具次数和原始 Agent 状态来制造通过。环境受阻可人工改 outcome 为 blocked 并填写理由。随后生成正式报告：

```sh
node scripts/benchmark/real-web.mjs check benchmarks/real-web/runs/cdc-baseline/run.json
node scripts/benchmark/real-web.mjs report benchmarks/real-web/runs/cdc-baseline/run.json > benchmarks/real-web/runs/cdc-baseline/reviewed.md
```

## 自动验收覆盖与边界

| 任务 | 程序检查 | 需要复核的情况 |
|---|---|---|
| 01 release | 同次 Latest 正式卡片、版本、UTC published 日期、详情页访问 | 没有可靠 release 卡片或采用本地日期 |
| 02 issues | 精确查询、结果行前五条、标题/编号/顺序、开放状态和 bug 标签 | UI 等价查询、结果行结构改变、实际不足五条 |
| 03 Wikipedia | 固定事实、人物链接到城市、成功点击及访问顺序 | 人物或城市页缺少事实证据 |
| 04 HN | 同次全首页最大值、并列顺序、Agent 全页读取、评论数/评论页、时间区间 | 只有采集器完整快照但 Agent 未证明完整读取 |
| 05 疾控 | 详情标题期次、明确标记或列表关联的发布日期、实际官方附件链接 | 未标注发布时间且列表无关联日期；PDF 字节未验证 |
| 06 arXiv | 站内查询、三个独立 ID、完整标题/全部作者、Submission history v1 日期 | **摘要主题相关性始终需要语义复核**；高级搜索 URL 可能需复核 |
| 07 MDN | 不修改原数组、数值比较器和结果、兼容表单元格、文档与章节链接 | 动态/Shadow DOM 兼容表未加载或结构不支持 |

规则不调用额外模型，不执行模型生成的比较器代码，也不在验收时重新抓动态网页来覆盖原快照。已经捕获的站外 HTTPS 页面会导致限制检查失败；未捕获的瞬时跳转无法保证检测。通过规则只能证明相应检查项，不能证明任意网页兼容性或医学结论。

GitHub release 与 issue 选择器已按 2026-11-02 的公开网页 DOM 核对。MDN 当前兼容表使用延迟加载的 Shadow DOM，采集器会检查已加载的开放 Shadow Root；它不会为验收偷偷展开页面来帮助 Agent 完成任务。

## 对历史记录离线验收

```sh
npm run benchmark:evaluate -- benchmarks/real-web/runs/cdc-baseline/run.json
```

默认生成 `run.evaluated.json` 和 `run.evaluated.md`，不覆盖原记录；指定新输出路径也可以作为第二个参数。已有人工 reviewed 结果保持不变。输入证据必须与题目身份和原始回答匹配。旧运行没有结构化 JSON 或新版 DOM 证据时会标为待复核，仍可使用原手工验收流程。此命令不访问网络、不调用模型。

## 开发验证

```sh
npm run test:benchmark
npm run build:benchmark
npm run benchmark:real-web -- --smoke --headless
npm run build
```

普通构建应不包含 `__browserOnlyBenchmark` 或 bridge 模块。参考 [Playwright 扩展测试文档](https://playwright.dev/docs/chrome-extensions)，加载解压扩展使用配套 Chromium 的 persistent context。

## 全部免登录任务（suite 3.0.0）

08 已由 Gmail 替换为 Project Gutenberg 电子书目录与格式核对，09 已由 X/Twitter 替换为 NASA 最新新闻发布总结。当前全部 10 题均不要求登录，运行 `node --env-file=.env.local scripts/benchmark/run-real-web.mjs --all`，不加 `--login`。历史提示词和任务版本仍保留在各次运行的任务快照中。后三题详见 [公开网站任务说明](PUBLIC-TASKS.md)。
