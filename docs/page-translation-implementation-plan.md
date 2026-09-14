# 页面沉浸式翻译实现方案

## 1. 文档目的

本文规划 BrowserOnly 的网页翻译能力，目标是实现类似“沉浸式翻译”的页面内双语阅读体验：翻译浏览器标签标题、页面主标题和正文内容，并支持本地 Ollama、Chrome 本地 Translator API 以及现有云端 LLM Provider。

本文是实现前的设计基线。本轮不包含代码修改；实现应在方案获批后开始。

## 1.1 参考边界

本方案参考 Read Frog 的两个翻译能力及其公开实现背景：

- [Page and Paragraph Translation](https://www.readfrog.app/en/docs/translation) 中的 Bilingual / Translation Only 页面模式。
- [Translation Tools](https://www.readfrog.app/en/docs/tools-and-settings) 中的 Selection Toolbar 和选中文本 Translate 行为。
- [Read Frog 源码仓库](https://github.com/mengxi-ream/read-frog)，仅用于核对其公开的扩展形态和翻译边界。

不参考 Read Frog 的 Flashcards、Spaced Repetition、Notebase、TTS、Custom AI Actions、字幕翻译等学习或媒体功能。这里借鉴的是翻译交互和页面恢复机制，不复制其产品范围或代码。

## 1.2 Read Frog 源码分析结论

对 Read Frog 当前公开源码的核对显示，它把页面翻译、选区工具条和后台请求拆成独立边界：`src/entrypoints/translation-hub` 负责翻译页面状态，`src/entrypoints/selection.content` 负责选区工具条，`src/utils/request` 提供批处理、优先级、取消和重试队列。这个拆分比把所有逻辑放进一个 content script 更适合 BrowserOnly。

值得迁移的机制：

- 批处理同时按字符数和条目数封顶，不因单个超长段落撑爆请求。
- 用 batch key 区分目标语言、Provider、模型和翻译范围，避免不同配置错误合批。
- 用 dedup key 合并相同文本的进行中请求，减少页面重复节点和多标签页重复翻译。
- 批处理返回数量不匹配时重试，仍失败则回退到逐条请求，而不是让整页失败。
- 每个任务拥有取消 scope，页面会话、选区会话和标签页关闭都可以取消自己的任务。
- 批次提交后冻结 scope，晚加入的订阅者不得加入已提交批次，避免一个页面取消时误伤另一个页面。
- Translation Only 需要保留原页面结构，并只替换可见文本和必要结构标记；样式、链接、ID 等属性用短占位符保护，返回后校验并恢复。

Read Frog 的对应源码入口可参阅：[translation-hub](https://github.com/mengxi-ream/read-frog/tree/main/src/entrypoints/translation-hub)、[selection.content](https://github.com/mengxi-ream/read-frog/tree/main/src/entrypoints/selection.content)、[batch-queue.ts](https://github.com/mengxi-ream/read-frog/blob/main/src/utils/request/batch-queue.ts) 和 [request-queue.ts](https://github.com/mengxi-ream/read-frog/blob/main/src/utils/request/request-queue.ts)。这些是机制参考，不是 BrowserOnly 的直接依赖。

Read Frog 仓库声明采用 GPLv3 与商业许可证双重授权。因此 BrowserOnly 可以借鉴公开的架构和算法思想，但不能直接复制其实现文件、组件或大量代码；如果要复用具体源码，必须先确认许可证兼容性或取得商业授权。[许可证说明](https://github.com/mengxi-ream/read-frog#commercial-license-grant)

## 1.3 专业术语、俚语与本地文化的翻译策略

单靠逐段翻译无法稳定处理术语、俚语和文化语境。Read Frog 的公开设置提供了可迁移的方向：AI Smart Context 用一次额外模型调用生成可复用的页面上下文，Language Skip 避免重复翻译目标语言内容，Site Rules 允许按站点覆盖 include、exclude、块级/内联节点和保留文本。[Translation Settings](https://www.readfrog.app/en/docs/advanced-translation)、[Site Rules](https://www.readfrog.app/en/docs/site-rules)

BrowserOnly 建议把翻译输入分成三层：

1. **页面上下文**：页面标题、站点名、正文主标题、当前章节标题和相邻段落摘要。上下文在同一页面会话中生成一次并缓存，不随每个段落重复发送。
2. **术语约束**：用户词典、站点词典和当前页面自动提取的候选术语。词典项必须声明源词、目标词、适用语言、优先级和是否强制保留原文。
3. **局部文本**：当前批次的可见段落、内联结构标记和占位符。

术语优先级建议为：用户词典 > 站点词典 > 页面候选术语 > Provider 默认译法。命中强制词典时，翻译结果必须通过术语校验；只要一个强制术语缺失，就只重试当前段落，不重译整页。

对俚语和本地文化表达，提示词应明确区分三种输出策略：

- **忠实**：保留原意和语气，必要时保留原文括注。
- **自然**：使用目标语言中功能等价的表达，不逐字直译。
- **解释**：译文后附简短文化说明，仅用于选区翻译或用户主动请求，不作为整页默认模式。

整页翻译默认使用“自然”策略，专业文档可以切换为“忠实”；Selection Translation 默认只给译文，用户点击“解释”时才增加文化背景，避免每次划词都触发昂贵的上下文请求。

## 2. 推荐结论

采用“Content Script 负责 DOM，Background 负责翻译任务”的独立翻译管线：

1. 用户手动触发页面翻译。
2. Content Script 识别正文文本节点，保留原始 DOM。
3. 文本按段落批量发送到后台。
4. 后台按优先级选择翻译引擎：Chrome 本地 Translator API → 本地 Ollama → 当前云端 Provider。
5. 翻译结果以原文下方的译文节点插入，默认双语显示。
6. 首屏优先，滚动后懒翻译；SPA 页面和动态新增内容通过受控观察器处理。

不建议将翻译接入 BrowserAgent 的工具调用循环。Agent 的历史、工具、重试和审批机制适合复杂任务，不适合高频、确定性的文本批处理。

## 3. 当前代码基础

| 能力 | 当前实现 | 对翻译的复用方式 |
|---|---|---|
| 页面访问 | `scripting`、`activeTab`、`<all_urls>` | 可继续使用，但需评估发布时的权限说明 |
| 页面读取 | `agentController.ts` 中的 `chrome.scripting.executeScript` | 仅作为兜底诊断，不作为翻译节点来源 |
| 正文抽取 | `src/tracking/contentExtractor.ts` | 复用正文候选容器、可见性和标题识别思路 |
| LLM Provider | Anthropic、OpenAI、Gemini、DeepSeek、Ollama 等 | 通过独立 Translation Engine 适配 |
| 设置页 | `FeaturesTab.tsx`、Provider 配置组件 | `translationProvider` 已存在并可选择 `primary`、Ollama 等；新增目标语言、页面引擎偏好和翻译行为设置 |
| 消息路由 | `src/background/messageHandler.ts` | 增加翻译开始、批次、取消、状态消息 |
| 构建入口 | `vite.config.ts` | 新增页面翻译 content script entry |

现有结构化抽取结果包含 section、heading 和 XPath，但 XPath 不能作为长期 DOM 锚点：SPA 重绘、列表插入和框架 hydration 都可能使其失效。因此翻译必须建立自己的 live TextNode 映射。

当前配置链路已经存在 `translationProvider`：`ConfigManager`、`Options.tsx`、`VerticalTabs.tsx`、`FeaturesTab.tsx` 和后台配置变更通知均已支持。页面翻译新增的 `enginePreference` 不应与它重复，建议定义为页面翻译专用选择：`auto`、`chrome-local`、`ollama`、`configured-provider`。其中 `configured-provider` 表示沿用已有的 `translationProvider`；`primary` 仍表示当前主 Provider。若用户在现有设置中选择 Ollama，页面翻译的“使用已配置 Provider”就应解析为 Ollama。

## 4. 范围与非范围

### 4.1 第一阶段范围

- 手动翻译当前网页。
- 翻译 `document.title`。
- 翻译 `h1` 和正文中的 `h2` 至 `h6`。
- 翻译正文段落、列表、引用和表格中的可见文本。
- 原文下方插入译文，默认双语模式。
- 支持“仅译文”模式：视觉上用译文替代原文，但保留原始 DOM 以便无刷新恢复。
- 支持停止翻译、关闭译文、恢复原页面。
- 支持选中文本后的即时翻译工具条，并保留右键菜单入口。
- 首屏优先、分批请求和本地缓存。
- 支持本地 Ollama 和当前已配置的云端 Provider。

### 4.2 明确不包含

- 不替换原始 HTML，不修改原始 TextNode 内容。
- 不翻译 `code`、`pre`、输入框、编辑器、脚本、样式和隐藏节点。
- 不自动翻译所有网站；自动翻译规则放到后续阶段。
- 不把翻译做成 Agent 工具。
- 第一阶段不新增 Google/DeepL 等专用云翻译账户。
- PDF 翻译不混入普通网页管线，后续接入现有 PDF viewer。
- 不承诺覆盖 `chrome://`、Chrome Web Store 等受限页面。

## 5. 系统架构

```text
Side Panel / Context Menu / Shortcut
                │
                │ translatePage / stopTranslation
                ▼
Translation Content Script
正文候选识别 → TextNode 分组 → 首屏调度 → 双语 DOM 注入
                │
                │ translateBatch / translationResult / status
                ▼
Background Translation Service
语言检测 → 缓存 → 引擎选择 → 批量调度 → 错误重试
                │
       ┌────────┼────────┐
       ▼        ▼        ▼
 Chrome 本地  Ollama   云端 LLM
 Translator   localhost  Provider
```

### 5.1 Content Script

建议新增 `src/content/pageTranslation.ts`，并将其加入 `vite.config.ts` 和 `manifest.json` 的 content script 配置。这里必须遵守 MV3 content script 的构建限制：content script 不能按 ES module 在页面中加载，Vite entry 必须产出可直接注入的单文件 bundle，不能依赖运行时共享 chunk 或外部 import。构建方式应参照现有 `pdfInterceptor.ts` entry，并为页面翻译专用依赖避免拆分。

职责：

- 接收翻译开始、停止、切换显示模式等消息。
- 选择正文候选容器。
- 遍历并过滤文本节点。
- 为每个待翻译节点保存内存映射：节点引用、原文、源文本哈希、译文状态。
- 以相邻节点和段落边界组成批次。
- 仅将当前可见区域及其邻近区域加入调度队列。
- 将返回结果插入为扩展自有译文节点。
- 监听 SPA 和动态新增内容，但忽略扩展自身节点。
- 页面变化或用户停止时取消未完成请求。

### 5.2 Background Translation Service

建议新增 `src/translation/` 目录，至少包含：

- `translationService.ts`：任务生命周期、批处理、取消、并发和缓存。
- `translationEngine.ts`：引擎接口和统一结果类型。
- `ollamaTranslationEngine.ts`：本地 Ollama 适配。
- `chromeTranslatorEngine.ts`：Chrome Translator API 能力检测与适配，作为后续阶段接入。
- `llmTranslationEngine.ts`：复用现有 Provider 的无 Agent 翻译请求。
- `translationCache.ts`：按文本哈希和引擎配置缓存。
- `translationContext.ts`：生成并缓存页面级上下文，限制上下文长度，避免每段重复发送。
- `translationGlossary.ts`：管理全局、站点和页面词典，执行术语保护与结果校验。

### 5.3 消息接口

在 `src/background/types.ts` 增加独立的消息类型，建议包括：

- `translatePage`：目标语言、显示模式、引擎偏好。
- `stopPageTranslation`：取消当前 tab 的翻译任务。
- `translationBatch`：由 content script 发出的批次文本和节点 ID。
- `translationBatchResult`：带节点 ID 的译文结果。
- `translationStatus`：识别中、翻译中、已完成、失败、已取消。
- `translationCapability`：返回可用引擎、模型和失败原因。

这些字段中，`pageSessionId` 和翻译任务的 `requestId` 是页面翻译新增的会话字段，不应假定现有普通消息已经提供。所有翻译任务必须包含 `tabId`、`windowId`、`pageSessionId` 和 `requestId`，避免旧页面任务污染新页面。新增 action 必须同时登记在 `src/background/messageHandler.ts` 的 action switch 和 `isBackgroundMessage` allowlist 中；只添加 switch 分支会被 allowlist 判为 `Unknown message type`。

## 6. 正文识别规则

### 6.1 容器选择

按以下顺序选择候选正文容器：

1. `main`
2. `article`
3. `[role="main"]`
4. 现有抽取器支持的 `#content`、`#main`、`.content` 等选择器
5. 基于可见文本密度和链接密度的候选区域
6. 最后退化到 `body`

如果候选区域包含过多导航链接、按钮或短文本，应拒绝自动全文翻译，并允许用户手动选择容器作为后续增强能力。

这里复用的是 `contentExtractor.ts` 的识别启发式，不是代码本身。该文件依赖 Playwright `Page` 和 `page.evaluate()`，不能直接被 content script import；正文 collector 必须在页面上下文内重新实现。候选顺序与现有 `extractMainContent()` 保持一致，`main` 优先于 `article`。

### 6.2 节点过滤

跳过：

- `script`、`style`、`noscript`、`template`
- `code`、`pre`、`kbd`
- `input`、`textarea`、`select`
- `contenteditable` 区域
- 主要由 URL、数字或代码符号构成的节点
- 已由 BrowserOnly 标记的译文节点

标题范围为 `document.title`、`h1`、`h2` 至 `h6`。页面标题和正文标题采用同一批处理协议，但 UI 上可以单独开关“翻译标题”。

### 6.3 正确解析 DOM 的算法

建议采用“块级翻译单元 + 内联结构保留”，而不是“一个文本节点一个请求”。具体规则如下：

1. 从正文候选根节点开始使用 `TreeWalker`，只收集可见文本和必要的结构节点。
2. 找到每个文本节点最近的块级祖先，例如 `p`、`li`、`blockquote`、`h1` 至 `h6`、`td`。相同块级祖先下的相邻文本合并为一个翻译单元。
3. 块内的 `a`、`strong`、`em`、`code`、`br` 和图片表情作为内联结构保留，不把它们之间的文字拆成互不相关的句子。
4. 对每个单元保存源节点引用、父节点、原始属性、文本哈希和显示状态，使用 `WeakMap` 保存引用，使用稳定 ID 发送给后台。
5. 只向翻译引擎发送可见文字和最小结构标记。`class`、`style`、`href`、`id`、事件属性和追踪属性先用短占位符替换，返回后校验占位符完整性，再恢复原始属性。
6. 译文以同级 wrapper 或译文节点插入，不能对整页调用 `DOMParser` 后重新设置 `document.body.innerHTML`。
7. 遍历时跳过 `browseronly-translation`、工具条和 loading 节点，避免 MutationObserver 触发递归翻译。
8. 如果页面存在开放的 Shadow Root，递归遍历其内部可见内容；关闭的 Shadow Root 不强行访问，只保留页面可见的宿主节点。

这样可以同时处理普通文章、GitHub 文档、带链接的段落、列表和组件化页面。纯文本抽取只作为识别失败或简单页面的降级模式。

## 7. 双语渲染规则

采用插入译文节点，不替换原文：

```text
原文段落
译文段落
```

译文节点必须满足：

- 使用独立的 `browseronly-translation` 类名。
- 写入源文本哈希和任务 ID，便于恢复、去重和调试。
- 不复制原节点的 `id`、表单属性和事件属性。
- 不改变原节点布局定位和事件监听。
- 译文插入失败时保留原文并标记该节点失败。

显示模式：

- `bilingual`：原文和译文同时显示，默认值。
- `translation-only`：隐藏原文，仅显示对应译文；不删除或覆盖原始 DOM。
- `original`：移除译文并恢复原始显示。

从双语切换到仅译文或恢复原文时，应优先复用当前会话中已经得到的译文，只刷新显示状态和必要的布局。只有新增可见节点或目标语言变化时才重新请求。页面翻译设置应提供“仅主要内容”和“所有可翻译内容”两个范围，前者使用正文候选容器，后者扩展到通过过滤规则判定为 eligible 的页面内容。

`document.title` 不应永久覆盖。建议保存原始标题，在开启翻译时显示为“译文标题｜原文标题”或仅译文，并在关闭时恢复。

### 7.1 结构保真策略

“更好地翻译网页”不等于把页面抽成纯文本后再把译文塞回去。对于内联标签、链接、加粗、换行、列表和表格，翻译单元应保留最小必要的 HTML 结构或结构标记，避免段落边界、链接位置和视觉层级丢失。

建议采用两层数据：

1. 页面层保存原始节点、属性和父子关系，只把可翻译文本和必要的结构标记发给引擎。
2. 请求层把 class、style、href、id、追踪属性等无关属性替换为短 token；返回后先验证 token 完整，再恢复原始属性。

这样既能支持 LLM 翻译，又不会把现代网站的大量 Tailwind class 和隐藏属性当成翻译输入。纯文本节点模式仍可作为简单文章的降级路径。

## 8. 翻译引擎设计

### 8.1 统一引擎接口

引擎接口只处理翻译，不包含 Agent 历史、工具和 UI 状态。输入是带稳定 ID 的文本批次，输出必须保留 ID、原文哈希和译文。

输出校验失败时，只重试缺失或非法的条目，不重做整页。

### 8.2 Ollama

复用现有 Ollama 配置：`ollamaBaseUrl`、`ollamaModelId` 和已配置模型列表。

实现要求：

- 请求发自扩展后台，不从网页直接请求 localhost。
- 翻译前检查服务是否可达，并检查目标模型是否存在。
- 默认并发为 1，避免本地模型显存争抢。
- 使用低随机性配置，关闭思考模式和工具调用。
- 系统提示明确要求：只翻译、不总结、不解释；保留段落数量、ID、数字、URL、占位符和专有名词。
- 连接失败区分“服务未启动”“模型不存在”“请求超时”“返回格式错误”。
- 支持取消请求，页面切换时不继续消耗本地模型资源。

Ollama 使用者需要允许扩展来源访问本地服务，例如配置 `OLLAMA_ORIGINS`；具体值应在设置页诊断提示中展示，而不是静默失败。

### 8.3 Chrome Translator API

作为可检测的本地优先引擎：

- 使用 feature detection 判断 `Translator` 是否存在。
- 翻译前检查语言对能力和模型下载状态。
- 首次使用显示下载或准备中状态。
- 只在当前 Chrome 环境可用时启用，不影响 Ollama 和云端路径。

Chrome 官方文档说明 Translator API 在 Chrome 138 起稳定、支持桌面环境，并且长文本翻译需要自行分块和处理顺序执行限制：[Translator API](https://developer.chrome.com/docs/ai/translator-api?hl=en)。实际可用性仍取决于操作系统、Chrome 策略、语言对和模型包；即使 Chrome 版本足够新，`Translator` 也可能不存在或返回不可用。

### 8.4 云端 LLM

复用当前 Provider 配置，但必须走轻量翻译方法：

- 固定 system prompt。
- 不携带对话历史。
- 不注册工具。
- 不开启 extended thinking。
- 每批输入带 ID，输出使用严格结构化结果。
- 失败、超时和限流只重试当前批次。

默认不改变用户当前 Agent Provider；翻译可以单独选择“自动、本地 Ollama、当前云端 Provider”。

## 9. 分批、懒加载和缓存

### 9.1 分批策略

- 相邻段落合并为 1,500 至 3,000 字符批次。
- 标题优先处理。
- 首屏及上下约 1 至 2 屏优先处理。
- 本地 Ollama 并发 1；云端最多 2 个批次并发。
- 批次结果按 ID 回填，不能依赖返回顺序。
- 批处理器应提供 `getBatchKey`、`getDedupKey`、`getScope`、`executeBatch` 和可选 `executeIndividual` 能力；批次达到字符数或条目数上限立即提交，短暂等待窗口用于吸收相邻段落。
- 批次返回数量不匹配或结构校验失败时，按退避策略重试；超过重试次数后回退到逐条翻译，并将错误范围限制在当前批次。
- 页面翻译和选区翻译使用不同的队列或不同 scope，同一段文本可以共享结果，但取消某个 scope 不得取消仍被其他页面使用的任务。

仅译文模式尤其要避免把页面的完整属性树、样式类名、链接和跟踪字段发送给 LLM。请求只保留可见文本、必要的结构标记和可恢复的短占位符；返回后先校验占位符，再恢复原始页面属性。这能降低现代组件页面的输入 token、请求延迟和格式破坏风险。参考：[Read Frog Translation Only 性能说明](https://www.readfrog.app/en/blog/faster-translation-only)。

### 9.2 懒翻译

使用 `IntersectionObserver` 调度可见节点；用户滚动后继续处理新的正文区域。Side panel 显示已完成数量和失败数量，但不要求每个节点都成功才视为页面可用。

### 9.3 缓存键

```text
sourceTextHash + sourceLanguage + targetLanguage + engine + model
```

缓存记录还必须带 `schemaVersion`。当批处理协议、提示词、分段规则或结果格式发生不兼容变化时递增版本；读取到旧版本时直接视为未命中，不做隐式迁移。

缓存结果可存储在 extension local storage 或 IndexedDB；节点引用和当前页面映射只保存在内存。缓存中不得记录完整 URL 以外的额外页面身份信息，且云端翻译应在隐私说明中明确页面文本会发送到所选 Provider。

## 10. 设置与入口

### 10.1 设置页

在 `FeaturesTab` 增加翻译设置：

- 目标语言，默认跟随浏览器语言或中文。
- 显示模式：双语 / 仅译文。
- 引擎：自动 / Chrome 本地 / Ollama / 当前云端 Provider。
- 是否翻译标题，默认开启。
- 翻译风格：自然 / 忠实。
- AI Smart Context：关闭 / 当前页面启用，仅对 LLM 和 Ollama 生效。
- 术语词典：全局词典、站点词典和当前页面临时词典。
- 自动翻译：关闭、指定语言、站点白名单。
- 站点排除列表。

现有设置中的 `translationProvider` 已经可以选择 `primary`、Ollama 和其他 Provider。页面翻译新增的“引擎偏好”应与之分层：选择“使用已配置 Provider”时读取 `translationProvider`；选择“Ollama”时明确强制本地 Ollama。不要维护第二套 Ollama URL 或模型列表；只增加“测试连接”和“检查模型”操作。

### 10.2 触发入口

第一阶段实现：

- Side panel 翻译按钮。
- 页面右键菜单“翻译此页面”。
- 选中文本后显示页面内 Translate 工具条。
- Side panel 中的停止、显示原文和切换显示模式。

自动翻译和快捷键放到后续阶段，避免首次发布产生意外请求和费用。

### 10.3 Selection Translation

选中文本后，在选区附近显示轻量工具条，至少提供 Translate 操作。工具条行为参考 Read Frog：

- 只翻译用户当前选区，不启动整页翻译。
- 结果在选区附近显示，并支持流式输出或分段更新。
- 自动调整位置，避免超出视口；窗口尺寸变化和滚动时重新定位。
- 点击页面其他位置、按 Escape 或切换标签页时关闭。
- 右键菜单提供同一能力，作为工具条未出现时的备用入口。
- 翻译结果不写回原始文本，不影响复制、链接和页面事件。
- 选区内容可以携带页面标题和邻近段落摘要作为可选上下文，但默认关闭，以控制 Ollama 延迟和云端 token 成本。

选区翻译与整页翻译使用独立的 request queue 和 requestId。选区任务取消或页面切换时，晚到结果必须丢弃，不能插入到新选区或新页面。

## 11. SPA 与动态页面

使用受控 `MutationObserver` 观察选定正文容器，而不是观察整个 `document.body`：

- 200 至 500ms 合并新增节点。
- 忽略扩展自己的译文节点。
- 按源文本哈希去重。
- 监听 URL、`document.title` 和正文根节点变化。
- 软导航时创建新的 `pageSessionId`，取消旧任务并清理旧译文。

Chrome 官方示例也使用 MutationObserver 处理 SPA 的软导航，同时提醒需要控制观察范围以降低性能成本：[content script 动态页面示例](https://developer.chrome.com/docs/extensions/get-started/tutorial/scripts-on-every-tab?hl=en)。

## 12. 分阶段交付

每个阶段都必须独立可用、可合并、可回滚。

### 阶段一：手动双语翻译（推荐首个版本）

交付：

- 页面翻译 content script。
- 正文节点识别和过滤。
- 标题翻译。
- 选中文本的 Selection Translation 工具条。
- LLM 翻译引擎。
- Ollama 翻译引擎。
- 批量、取消、失败重试和缓存。
- 双语/仅译文/原文三种显示模式。
- Side panel 和右键入口。
- 单元测试、DOM 测试和 Ollama mock 测试。

预计新增或修改 8 个以上文件，涉及 manifest、Vite entry、background message types/router、translation service、content script、options UI 和测试。这是一个独立功能切片，不依赖 Chrome Translator API。

### 阶段二：本地 Chrome 翻译和 SPA 增强

交付：

- Chrome Translator API 能力检测。
- 模型准备状态和下载提示。
- 自动选择本地引擎。
- SPA 软导航和动态新增内容翻译。
- 更细的性能监控。

阶段二缺失时，阶段一仍可使用 Ollama 或云端 Provider。

### 阶段三：站点规则与高级体验

交付：

- 站点白名单/黑名单。
- 自定义正文选择器。
- 术语表和专有名词保护。
- 译文样式、字号、间距设置。
- PDF viewer 独立翻译管线。
- 快捷键和自动翻译规则。

## 13. 错误与降级策略

| 故障 | 行为 |
|---|---|
| 无法识别正文 | 保留页面，提示用户选择引擎或稍后重试 |
| Ollama 未启动 | 显示明确诊断，可切换云端或 Chrome 本地引擎 |
| Ollama 模型不存在 | 展示模型名和安装提示，不自动下载未知模型 |
| 云端限流/超时 | 当前批次指数退避，超过上限后局部失败 |
| 返回格式非法 | 重试一次，仍失败则只保留原文 |
| SPA 页面切换 | 取消旧任务，清理旧译文，重新建立会话 |
| 页面框架重绘 | 重新收集节点，使用文本哈希避免重复请求 |
| 用户停止 | 取消后台任务，已完成译文保留，未完成节点恢复原状；后台晚到的结果必须按 `requestId` 和 `pageSessionId` 丢弃 |

不得因为单个段落失败而删除整页原文。任何翻译失败都必须安全降级到原页面。

## 14. 测试与验收

### 自动化测试

- 当前 `tests/setup/setupTests.ts` 没有完整的 `chrome.scripting` 和 `chrome.tabs.sendMessage` mock；实现阶段必须补齐这些 mock，并新增独立的 content script 测试入口。
- 文本节点过滤：代码、表单、隐藏节点和扩展节点不被翻译。
- 标题和段落 ID 映射稳定，返回顺序改变时仍能正确回填。
- 翻译节点插入、去重、关闭和恢复。
- 批次切分、缓存命中、缓存失效和模型切换。
- Ollama 服务不可达、模型不存在、超时和非法 JSON。
- 术语词典优先级、强制术语缺失重试和术语缓存失效。
- 俚语在“自然”模式下保持语气，在“忠实”模式下不被擅自本地化。
- 页面上下文只生成一次，并且不会把完整正文重复附加到每个段落请求。
- 取消旧任务不会污染新页面。
- MutationObserver 不会因为译文插入造成递归翻译。
- 多窗口、多标签页任务隔离。

### 手工验收

- 普通英文文章：标题、段落、列表和引用顺序正确。
- 长文：首屏优先出现，滚动后继续翻译。
- SPA：站内跳转后旧译文不残留。
- React/Vue 页面：按钮、链接、复制和滚动仍可用。
- 代码块、公式、URL、数字和专有名词不被破坏。
- Ollama 关闭时有可理解的错误提示和替代引擎入口。
- 关闭翻译后页面和 `document.title` 恢复。
- 受限页面显示明确“不支持当前页面”的提示。

建议验证命令：

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
```

## 15. 隐私、权限与依赖

### 现有依赖

- Chrome MV3 content scripts、`scripting` 和 host permissions。
- 现有 Ollama Provider：不需要新增第三方账号，但需要用户本机运行 Ollama 并下载模型。
- 现有云端 Provider：沿用用户已有 API key；页面正文发送到云端前必须给出明确提示。

### 新增风险

- 全站 content script 和 `<all_urls>` 会增加扩展权限敏感度，发布说明应解释“用于读取并翻译当前页面”。
- 云端翻译会传输页面文本；默认不应在用户未主动触发时发送。
- Ollama 本地接口的 CORS/来源配置需要在设置页给出诊断，不应收集本地服务凭证。
- 翻译缓存可能包含页面文本，默认使用本地存储，并提供清空缓存入口。

## 16. 关键决策与替代方案

### 选择：原文下方插入译文

理由：可恢复、低破坏、支持双语对照和局部失败。

### 拒绝：替换原始 DOM 或整页 HTML

理由：会破坏事件、框架状态、复制行为和 SPA 重绘；也难以准确恢复。

### 选择：Ollama 作为第一阶段本地引擎

理由：项目已有配置和 Provider 基础，隐私优先，实施成本低。

### 暂不选择：专用云翻译 API

理由：需要新增账户、密钥、计费、隐私政策和 Provider 生命周期；当前收益不足以抵消维护面。

## 17. 最脆弱的假设

本方案假设目标页面大多数存在可识别的正文容器。如果目标主要是信息流、邮箱、Notion 或复杂后台系统，“文章正文识别”会不足，必须新增站点规则和任意页面元素翻译策略；在此之前不应承诺覆盖所有页面元素。

## 18. 回滚方案

翻译功能只新增 content script 行为、后台内存任务和本地缓存，不修改业务数据。关闭功能或移除翻译 content script 后，页面刷新即可恢复；缓存可通过设置页清空。若某个引擎异常，可在配置中禁用该引擎，其他引擎和 Agent 功能不受影响。

## 19. 实施前需要确认的事项

以下不是技术阻塞项，但应在实现前确认默认产品选择：

1. 默认目标语言是否固定为中文，还是跟随浏览器语言。
2. 默认是否启用双语模式。
3. 是否允许“自动选择引擎”优先调用 Chrome 本地 Translator API。
4. Ollama 不可用时是否允许自动回退到云端 Provider。

除上述默认值外，推荐方案已经足够进入实现，不需要重新设计核心架构。

## 20. 推荐的翻译质量管线

### 20.1 翻译前处理

每个页面会话按以下顺序处理：

1. 检测页面主语言，只对置信度足够且不同于目标语言的内容建立任务。
2. 识别正文、标题和块级边界，跳过代码、URL、数字密集内容以及被词典标记为保留的节点。
3. 从页面标题、站点名、标题层级和首屏正文中提取上下文素材。
4. 从用户词典和站点词典建立强制术语表。
5. 仅对剩余的专业名词候选做一次术语提取，不对每个段落重复提取。
6. 将上下文、术语表和翻译风格编译成当前页面会话的 immutable context。
7. 按块级单元批处理翻译，结果回来后做结构、术语和占位符校验。

### 20.2 术语候选发现

术语发现应先采用本地、低成本规则，再按需使用 LLM：

- 识别反复出现的首字母缩写、大小写混合词、带连字符的技术词和产品名。
- 统计标题和正文中重复出现的名词短语。
- 读取 `code`、链接文本、`data-*` 属性和页面 meta 中的产品名，但默认不翻译这些值。
- 仅在规则候选数量过多或页面属于技术文档时调用 LLM 进行候选排序。
- 候选术语不会自动成为强制译法，必须经过用户确认或站点规则确认。

这样可以避免模型把普通名词误判为术语，也不会因为一次自动提取就永久污染词典。

### 20.3 上下文压缩

页面上下文不是整篇文章副本。建议限制为：

- 页面标题和站点名称。
- 当前章节标题链，最多 3 层。
- 每个批次前后各一个相邻段落的摘要或原文窗口。
- 已确认术语及其目标译法。
- 页面类型标签，例如 technical、news、fiction、forum。

如果启用 AI Smart Context，模型只生成短摘要和术语提示，结果按页面内容哈希、源语言、目标语言和模型缓存。Ollama 默认使用规则上下文，不默认额外调用模型生成摘要；用户显式开启后才进行第二次本地请求。

### 20.4 翻译后校验

翻译结果必须经过四层检查：

1. **结构检查**：sourceId 数量、段落数量、内联结构 token、换行和占位符一致。
2. **术语检查**：强制术语存在，禁止词没有被误翻译。
3. **内容检查**：URL、数字、单位、代码标识符和 HTML 实体保持不变。
4. **语言检查**：译文确实主要使用目标语言，避免模型返回原文、解释或 JSON 外的额外内容。

校验失败时按范围处理：先重试当前段落，再回退到较小批次，最后保留原文。不能因为一段失败而重置整个页面。

## 21. Ollama 的质量配置建议

Ollama 需要区分“快速页面阅读”和“高质量专业翻译”两个预设，而不是只有一个模型下拉框：

| 预设 | 适用场景 | 策略 |
|---|---|---|
| 快速 | 新闻、论坛、短页面 | 小批次、无 AI Smart Context、低等待窗口、并发 1 |
| 专业 | 技术文档、论文、产品文档 | 术语表、章节上下文、较小批次、严格结构校验 |
| 文化 | 小说、评论、地方新闻 | 自然风格、邻近段落上下文、允许选区解释 |

模型提示词必须明确：

- 只输出翻译结果，不总结、不解释、不加前后缀。
- 保持 sourceId、段落边界、占位符和内联标记。
- 按词典优先级使用术语。
- 俚语优先保持语气；无法找到等价表达时保留原文并标记需要解释。
- 本地文化专名不擅自替换成目标地区的另一个实体。

本地模型的 batch size 不应照搬云端默认值。先从 500 至 1,000 字符、2 至 4 个段落开始，根据响应时间、显存占用和结构错误率逐步增加。Read Frog 的公开请求控制也将字符数和段落数分开限制，并在结构化结果数量错误时重试和回退。[Request Control](https://www.readfrog.app/en/docs/request-control)

## 22. 质量评估与上线门槛

上线前建立一个不上传真实隐私内容的固定测试集，至少包含：

- 技术文档中的 API、框架名和缩写。
- 新闻中的人名、机构名、地名和标题双关。
- 论坛中的口语、俚语、缩写和 emoji。
- 小说或评论中的隐喻、成语和文化典故。
- 中英混排、数字、单位、链接和代码块。

每次引擎或提示词变更都比较：

- 强制术语命中率。
- 结构占位符保留率。
- 译文语言正确率。
- 单段失败率和批次回退率。
- 首屏可见译文延迟。
- Ollama 显存峰值和平均耗时。

第一阶段的上线门槛建议是：结构错误为零，强制术语命中率 100%，普通段落失败可局部恢复，首屏不等待整篇翻译完成。语言风格由人工抽样评审，不用单一自动分数替代人工判断。
