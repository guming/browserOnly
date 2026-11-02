# BrowserOnly 真实网站任务集（10 jobs）

全部 10 题均无需登录：08 为 Project Gutenberg 电子书检索与格式核对，09 为 NASA 最新新闻发布总结，10 为 Google Maps 地点与公共交通路线查询。运行 `--all` 即可，无需 `--login`。后三题的动态内容和总结仍需人工验收，详见 [公开网站任务说明](PUBLIC-TASKS.md)。

直接在真实网站上测试已安装的 BrowserOnly 扩展。任务覆盖 GitHub 版本查询、issue 筛选、Wikipedia 两跳阅读、Hacker News 全页比较、中国疾控周报查找、arXiv 论文检索和 MDN 文档查证。无需测试账号、自建业务网站或新增依赖。

自动执行与规则验收见 [自动执行说明](AUTOMATION.md)：`npm run build:benchmark` 后使用 `npm run benchmark:real-web -- --all`。证据不足或需要语义判断时保留待复核；历史记录可用 `npm run benchmark:evaluate -- <run.json>` 离线验收。下文保留手工执行入口，不需要安装浏览器测试依赖。

这是一套**人工发起、人工验收**的任务集；CLI 负责提示词、记录完整性和报告，不控制浏览器，不调用模型，也不自动判断网页答案。它不是 Tests 页可导入的步骤 YAML，不要导入那里。标准答案和验收细则不要发给被测 Agent。

## 开始运行

在仓库根目录执行：

```sh
node scripts/benchmark/real-web.mjs list
node scripts/benchmark/real-web.mjs validate-suite
node scripts/benchmark/real-web.mjs prompt 01
node scripts/benchmark/real-web.mjs init benchmarks/real-web/runs/baseline-01.json
```

1. 使用装有本次构建的 Chrome，记录扩展版本、Chrome 版本、提供商与完整模型 ID，填写记录的 `environment`。不要填写密钥。使用专用测试 Profile；确保记忆为空或已关闭，避免已有记忆影响比较。
2. 每题新建对话、关闭上一题打开的标签页，打开任务的 `startUrl`。顺序串行执行 01–07，不复用前题对话和记忆，不人工补充答案或指路。
3. `prompt 01` 输出的完整文本可以直接粘贴给 BrowserOnly。也可用 `prompt all` 一次查看全部任务，但仍应分开执行。基准使用 operator 角色及相同的工具/模型配置。
4. 提交时记录 `startedAt`，执行结束时记录 `endedAt`，都用带时区 ISO 时间。每题最多 300 秒，超时人工点击停止；工具预算沿用当前 Agent 默认的 50 次。CLI 不会替你停止运行。
5. 保存最终回答到 `answer`，在 `observationEvidence` 写明本次页面观测或截图/轨迹的本地路径、页面 URL 和观测时间。动态题需要保留当次观测，不能拿几小时后的网页判错。文件放在本次 runs 目录，不提交个人浏览数据。
6. 按 [验收手册](EVALUATION.md) 逐项填写 `checks[].passed`（true/false）及 `evidence`。填写 `reviewer` 并把 `outcome` 改成 `reviewed`。模型宣布成功不能替代人工验收。
7. 环境确实不可用时用 `blocked` 并填写 `reason`、起止时间和验收人；人工主动取消用 `cancelled`。未运行保留 `pending`。正常页面上找错答案、不会筛选、工具预算耗尽或超时属于任务失败，不能用 blocked 排除。

```sh
node scripts/benchmark/real-web.mjs check benchmarks/real-web/runs/baseline-01.json
node scripts/benchmark/real-web.mjs report benchmarks/real-web/runs/baseline-01.json > benchmarks/real-web/runs/baseline-01.md
```

`init` 拒绝覆盖已有文件；runs 默认被 Git 忽略。报告始终以 7 为分母，列出部分完成、失败、受阻、取消和未运行。判断来自人工，CLI 只校验必填信息、计分和预算。调用数/token 没有可靠来源时保持 null，不猜测为 0。

## 固定任务与动态答案

| ID | 任务 | 答案基准 |
|---|---|---|
| 01 | Playwright 最新正式版本 | 当次 release 页面；published 时间，不是提交时间 |
| 02 | VS Code 最近更新的 5 条开放 bug | 当次筛选列表，保留顺序和查询条件 |
| 03 | Marie Curie → Warsaw → 今天所属国家 | 固定人物与两跳路径 |
| 04 | HN 首页最高分 | 同一次完整首页观测，数字不混用不同刷新 |
| 05 | 2026 年第 40 周流感周报 | 固定报告期；附件链接必须从详情页取得 |
| 06 | 2024 年 web agents 论文 3 篇 | 多个答案均可；核对首次提交日期和实际摘要 |
| 07 | toSorted 行为与兼容性 | 当前文档；版本以兼容性表为准 |

01/02 在 Agent 打开列表的同次观测上确定答案；若评审时列表已变，使用轨迹里的候选列表，证据不足就补跑，不能直接给通过。04 要保留完整首页文字或截图，只有最高分那一行不足以证明比较正确。

`task` 是初始化时嵌入记录的任务快照，不手改。修改题目或验收标准需提升 `suite.json` 版本并创建新记录；保留旧版本 Git 提交以复现历史。比较版本时运行三轮，保留全部结果，不只取最好一次。

## 首次入口检查与限制

2026-11-02 使用网页读取检查了 Playwright Releases、GitHub Issues、Marie Curie、Warsaw、HN、疾控周报栏目、arXiv 搜索和 MDN 文档入口。页面读取成功不等于 BrowserOnly 已跑通；目前没有真实 Agent 成绩。

带查询参数的 GitHub issue URL 在网页读取工具中返回 cache miss，因此任务从 Issues 入口开始，由 Agent 在网站内筛选；上线前不能把该筛选路径标为已验证。MDN 的纯文本读取没有展开兼容性表，实际任务必须在 Chrome 中查看该表。疾控题期次已在栏目列表中确认，附件是否可达要在本次任务中另行查证。地区网络、限流、CAPTCHA 和站点改版可能产生 blocked，应保留具体错误证据。

## 设计来源

- [BrowserGym task.py](https://github.com/ServiceNow/BrowserGym/blob/main/browsergym/core/src/browsergym/core/task.py)：任务准备、执行与独立验收分开。
- [WebArena evaluators.py](https://github.com/web-arena-x/webarena/blob/main/evaluation_harness/evaluators.py)：结果和来源可核对，不要求唯一点击路径。
- [WorkArena list.py](https://github.com/ServiceNow/WorkArena/blob/main/src/browsergym/workarena/tasks/list.py)：明确筛选、排序和字段验收。

本任务集只借鉴结构，没有引入这些项目的运行环境或复制其网站。

维护 CLI 时运行 `node --test scripts/benchmark/real-web.test.mjs`。该检查使用临时合成记录验证计分与证据要求，不代表 BrowserOnly 的真实网站成绩。
