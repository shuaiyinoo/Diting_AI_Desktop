# Diting AI Desktop

Diting AI Desktop（谛听 AI 桌面客户端）是一款基于 [electron-egg v5](https://github.com/dromara/electron-egg) 框架构建的企业级跨平台桌面 AI 助手应用。

它融合了本地文件管理、RAG 知识库问答、Pi Agent 智能代理、LLM 多轮对话等 AI 核心能力，面向 Windows / macOS / Linux 三大平台，旨在为用户提供高效、安全、本地优先的桌面 AI 工作台。

> 本项目受 [Proma](https://github.com/ErlichLiu/Proma) 开源项目启发，Agent 模式的 UI 设计与交互风格参考了 Proma 的优秀实践，特此感谢。

## 现在能做什么

- **文件管理**：授权文件夹扫描、文件同步、Office/PDF 在线预览、RAG 自动向量化
- **RAG 知识库问答**：文档解析 → 智能切片 → 本地向量嵌入 → 混合检索（向量 + 关键字）→ LLM 生成 → 引用追踪
- **Agent 模式**：基于 Pi Agent SDK 的智能代理，支持工作区隔离、Skills 技能系统、MCP 工具协议、权限模式、流式输出
- **多轮对话**：多模型对话、流式 SSE 输出、上下文记忆、工具模式切换
- **LLM 模型管理**：多模型配置、连接测试、参数调优、用量统计与费用估算
- **本地优先**：所有 AI 能力（嵌入、检索、存储）本地执行，数据不上传云端
- **跨平台**：一套代码打包 Windows / macOS / Linux

## 快速开始

### 环境要求

- Node.js >= v20
- npm 或 pnpm
- Git

### 下载安装

从 [GitHub Releases](https://github.com/dromara/electron-egg/releases) 下载对应平台安装包。

### 从源码构建

```bash
# 克隆仓库
git clone https://github.com/dromara/electron-egg.git
cd electron-egg

# 安装依赖
npm install

# 为 Electron 重建 better-sqlite3 原生模块
npm run re-sqlite

# 开发模式（frontend + electron 同时启动）
npm run dev

# 构建并运行
npm run build
npm run start
```

### 首次配置

1. 打开应用，进入 **设置 > 模型配置**，添加至少一个 LLM 供应商（Base URL + API Key + 模型名称）
2. 进入 **文件管理**，授权一个文件夹作为知识库源
3. 文件会自动向量化，完成后可在 **知识库问答** 中提问
4. 在 **Agent** 页面创建工作区，开始使用智能代理

## 模式选择

### 知识库问答适合

- 基于本地文档库的问答、总结、引用追溯
- 需要精确引用原文片段的严肃场景
- 文档密集型工作（法律、科研、企业知识库）

### Agent 适合

- 修改、创建、整理本地文件
- 多步骤任务、调研报告、代码编写
- 使用 Skills、MCP、Shell 等外部工具
- 需要权限确认和计划模式的工作

### 多轮对话适合

- 日常问答、翻译、润色、轻量代码讨论
- 快速验证想法、探索性对话
- 对比不同模型输出

简单说：**查文档用知识库问答，需要行动用 Agent，日常交流用对话。**

## 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 桌面框架 | Electron + electron-egg v5 | 39.x |
| 前端框架 | Vue 3 + Vite | 3.5 + 7.x?3 |
| UI 组件 | Ant Design Vue | 4.2.6 |
| 状态管理 | Pinia | 2.3.1 |
| 富文本编辑 | TipTap | 3.29.2 |
| Markdown 渲染 | md-editor-v3 + markstream-vue | 6.5.5 |
| 代码高亮 | Shiki | 3.23.0 |
| 图表 | Mermaid | 11.16.1 |
| 数学公式 | KaTeX | 0.18.1 |
| 数据库 | better-sqlite3 + zvec | 12.5.0 |
| Agent Runtime | @earendil-works/pi-coding-agent | 0.82.1 |
| AI 对话 | @earendil-works/pi-ai | 0.82.1 |
| 文档解析 | pdf-parse + mammoth | — |
| 向量嵌入 | qwen-embedder + hf-embedder | — |
| MCP | @modelcontextprotocol/sdk | 1.30.0 |
| 构建工具 | esbuild + electron-builder | — |

## 架构概览

```text
Frontend (Vue 3 + Ant Design Vue 4 + Pinia)
  ↕ IPC / HTTP / Socket.IO
Electron Main Process
  ├── Controller（业务控制层）
  ├── Service（业务服务层）
  �5   Components（AI 核心组件）
  │     ├── rag/    (RAG 检索增强)
  │     ├── pi/     (Agent 智能体)
  │     └── file/   (文件同步管理)
  └── Database (SQLite + zvec 向量存储)
electron-egg v5 (ee-core + ee-bin)
Electron 39 + Node.js v20
```

核心通信路径：
- **IPC**：主进程 ↔ 渲染进程（`ipcMain.handle` + `ipcRenderer.invoke`）
- **HTTP**：Koa RESTful API（端口 7071），供外部服务调用
- **Socket.IO**：WebSocket（端口 7070），实时数据推送
- **SSE**：流式输出统一通过 Server-Sent Events 推送

更完整的工程约定见 [CLAUDE.md](./CLAUDE.md)。

## 详细调用路径

以下完整描述 RAG 知识库问答、多轮对话（Chat）、Agent 智能代理三条核心调用链路，以及三者如何协调工作。

### 通信基础

所有流式输出统一走 **HTTP SSE**（Server-Sent Events），不走 IPC：

```
前端 fetch(POST) → Koa HttpServer → Controller → Service/Component
                                                       ↓
                ← SSE event: token / complete / error ←
```

SSE 事件格式：
```
event: <事件名>\n
data: <JSON>\n\n
```

前端通过 `fetch` + `ReadableStream.getReader()` 逐块读取，按 `\n\n` 分割事件，解析 `event:` 和 `data:` 行。

### 一、RAG 知识库问答调用路径

#### 1.1 文件向量化（Ingestion Pipeline）

文件向量化是 RAG 的前置阶段，在文件管理页面授权文件夹后自动触发：

```
FileController.startIngestion(args)
  │  electron/controller/file.ts
  ↓
ragService.enqueueIngestion(fileItem)
  │  electron/components/rag/core/ragService.ts
  │  ┌─ 队列串行处理（一次只处理 1 个文件，防止卡死）
  │  └─ 哈希变化检测（未变化且 READY → 跳过；变化 → 先删旧数据再重做）
  ↓
  ├── 1. 文档解析
  │   │  rag/parser/DocumentParser
  │   │  支持 PDF（pdf-parse / pdf-efficient-loader）
  │   │  支持 DOCX（mammoth）
  │   │  支持纯文本（直接读取）
  │   └── 输出：纯文本字符串
  │
  ├── 2. 文本切片
  │   │  rag/processor/chunkText()
  │   │  按固定长度 + 重叠窗口切片
  │   └── 输出：string[]（切片数组）
  │
  ├── 3. 文本清理
  │   │  rag/processor/cleanText()
  │   │  去除多余空白、特殊字符
  │   └── 输出：string[]（清理后的切片）
  │
  ├── 4. 向量嵌入
  │   │  rag/embedding/（qwen-embedder / hf-embedder）
  │   │  本地 ONNX 模型，无需联网
  │   └── 输出：number[][]（每个切片的向量）
  │
  ├── 5. 存储
  │   │  向量：zvec collection → searchVectors() 可检索
  │   │  切片文本：SQLite document_chunks 表
  │   │  关键字索引：MiniSearch KeywordSearchService
  │   └── 输出：fileItem 状态变为 READY
  │
  └── 6. 进度回调
      │  ragService.progressCallback → FileController
      │  → IPC 事件 controller/file/onRagProgress
      └── 前端实时显示向量化进度
```

#### 1.2 知识库问答（QA Stream Ask）

用户在知识库问答页面提问时的完整调用路径：

```
前端 Pinia Store: chat.js / qa.js
  │  fetch POST http://localhost:7071/controller/qa/streamAsk
  │  body: { folderId, question }
  ↓
QaController.streamAsk(args, ctx)
  │  electron/controller/qa.ts:94
  │  ┌─ 校验 folderId / question
  │  ├─ 设置 SSE 响应头（Content-Type: text/event-stream）
  │  ├─ 禁用 Koa 内置响应（ctx.respond = false）
  │  └─ 监听 res.on('close') 检测客户端断开
  ↓
qaService.askStream(folderId, question)
  │  electron/components/rag/qa/qaService.ts:226
  │
  ├── 步骤1：混合检索证据
  │   │  hybridRetrievalService.retrieve(folderId, question, topK=5)
  │   │  electron/components/rag/retrieval/hybridRetrieval.ts:56
  │   │
  │   │  ┌─ 1a. 获取检索资源
  │   │  │   ragService.getRetrievalContext()
  │   │  │   → { collection, embedder, kwService, ragDb }
  │   │  │
  │   │  ├─ 1b. 向量检索（双通道之一）
  │   │  │   searchVectors(collection, embedder, question, 50)
  │   │  │   → 用问题向量在 zvec 中做相似度搜索
  │   │  │   → 返回 { chunkId, score, folderId, ... }[]
  │   │  │   → 按 folderId 过滤（zvec 不支持 folderId 过滤）
  │   │  │
  │   │  ├─ 1c. 关键词检索（双通道之二）
  │   │  │   kwService.search(folderId, question, 50)
  │   │  │   → MiniSearch 全文搜索
  │   │  │   → 返回 { chunkId, normalizedScore, ... }[]
  │   │  │
  │   │  ├─ 1d. RRF 融合排序（Reciprocal Rank Fusion, k=0）
  │   │  │   双通道结果按排名倒数求和 → 综合排名分
  │   │  │   指数饱和归一化：score = 1 - e^(-x)，映射到 [0,1)
  │   │  │   截取 topK 个
  │   │  │
  │   │  ├─ 1e. 从 SQLite 拉取切片文本
  │   │  │   SELECT chunk_text FROM document_chunks WHERE id = ?
  │   │  │   组装为 EvidenceDocument[]
  │   │  │
  │   │  └─ 1f. 评估证据充分度
  │   │     EvidenceLevel: NONE / WEAK / MODERATE / STRONG
  │   │     基于：命中数、最高分、双通道覆盖度
  │   │     → 返回 RetrievedEvidenceBundle { documents, evidenceLevel, evidenceGuidance }
  │   │
  │   ├── 步骤2：预组装引用
  │   │  assembleCitations(documents)
  │   │  → Citation[]（弱证据时返回空数组，避免误导）
  │   │
  │   ├── 步骤3：返回 StreamContext（流尚未开始）
  │   │  { documents, evidenceLevel, citations, start(fn) }
  │   │
  │   └── 步骤4：start() 被调用后
  │       │
  │       ├── 构造流式 Prompt
  │       │  buildStreamChatMessages(question, evidenceBundle)
  │       │  electron/components/rag/llm/promptBuilder.ts
  │       │  ┌─ System Prompt：纯文本输出模式（不要求 JSON）
  │       │  ├─ 证据上下文：证据文档 + 等级 + 回答策略
  │       │  └─ 用户问题
  │       │
  │       ├── 获取已启用的 LLM 模型
  │       │  llmdbService.getEnabledModel()
  │       │  → 从 SQLite llm.db 读取 { base_url, api_key, model_name, ... }
  │       │
  │       ├── 流式调用 LLM
  │       │  chatStream(model, messages, callbacks)
  │       │  electron/components/rag/llm/llmClient.ts
  │       │  ┌─ fetch POST {base_url}/chat/completions (stream=true)
  │       │  ├─ 逐 chunk 解析 SSE data: { choices: [{ delta: { content } }] }
  │       │  ├─ 每个 token → callbacks.onToken(token)
  │       │  ├─ 流结束 → extractUsage() → callbacks.onComplete(usage)
  │       │  └─ 无 usage 时按字符数估算（4 char ≈ 1 token）
  │       │
  │       ├── 后处理
  │       │  recordUsage() → 异步写入 metrics.db（用量统计）
  │       │  qadbService.saveCompleted() → 持久化 QA 记录
  │       │
  │       └── 回调链
  │          onToken → SSE event:token → 前端追加到回答
  │          onComplete → SSE event:complete → 前端显示完整回答
  │          onError → SSE event:error → 前端显示错误
  ↓
Controller 层 SSE 事件推送：
  1. event: evidence-overview  （流开始前，让前端展示"已检索到 N 条证据"）
  2. event: token             （逐 token 推送，前端实时渲染）
  3. event: citations          （引用来源列表）
  4. event: complete          （完整回答 + usage + evidenceLevel）
  ↓
前端 SSE 消费：
  chat.js dispatchSseEvent(rawEvent, assistantMsg)
  │  frontend/src/stores/chat.js:283
  │  解析 event:/data: 行 → JSON.parse(data)
  │  ├─ 'start'       → 忽略（仅标记流式开始）
  │  ├─ 'token'       → assistantMsg.content += data.delta
  │  ├─ 'citations'   → assistantMsg.citations = data.citations
  │  ├─ 'complete'    → 补充 reply + citations
  │  └─ 'error'       → 显示错误信息
  ↓
Vue 组件渲染
  消息列表组件读取 reactive assistantMsg → 自动更新 DOM
```

### 二、多轮对话（Chat）调用路径

多轮对话支持两种模式：**CHAT**（纯对话）和 **KB_SEARCH**（知识库检索增强）。

```
前端 Pinia Store: chat.js
  │  fetch POST http://localhost:7071/controller/assistant/streamChat
  │  body: { sessionId, message, toolMode: 'CHAT'|'KB_SEARCH', folderId? }
  ↓
AssistantController.streamChat(args, ctx)
  │  electron/controller/assistant.ts:94
  │  ┌─ 校验 sessionId / message / toolMode
  │  ├─ 设置 SSE 响应头
  │  └─ 禁用 Koa 内置响应
  ↓
assistantService.streamChat(request, callbacks)
  │  electron/components/rag/assistant/assistantService.ts:66
  │
  ├── 步骤1：保存用户消息
  │   │  assistantdbService.insertMessage(sessionId, 'USER', toolMode, folderId, message, ...)
  │   │  → SQLite assistant.db 持久化
  │   └─ autoRenameSessionIfNeeded() → 首条消息自动重命名会话
  │
  ├── 步骤2：维护短期记忆（before）
  │   │  shortTermMemoryMaintenanceService.maintainBeforeResponse(sessionId, ...)
  │   └─ 清理/压缩历史消息，确保上下文不超限
  │
  ├── 步骤3：发送 start 事件
  │   └─ SSE event: start
  │
  ├── 步骤4：KB_SEARCH 模式 → 检索证据
  │   │  if (toolMode === 'KB_SEARCH')
  │   │  hybridRetrievalService.retrieve(folderId, message, 5)
  │   │  → 与 QA 完全相同的混合检索流程（向量 + 关键词 + RRF）
  │   │
  │   ├─ assembleCitations() → 引用列表
  │   ├─ SSE event: citations → 前端展示证据
  │   └─ 无证据 → 直接返回"未检索到相关证据" + SSE event: complete
  │
  ├── 步骤5：组装上下文消息
  │   │  promptContextBuilder.buildChatInstruction(sessionId, toolMode, folderId)
  │   │  → 构建 System Prompt（含记忆/偏好/工具说明）
  │   │
  │   │  shortTermMemoryHook.assembleBeforeModelMessages(sessionId, ...)
  │   │  → 从 assistant.db 读取历史消息 → 组装为 ChatMessage[]
  │   │
  │   │  KB_SEARCH 模式额外注入：
  │   │  formatEvidenceContext(documents) → 证据文本块
  │   │  拼接为额外的 user 消息：证据 + 等级 + 回答策略
  │   │
  │   └─ 最终消息列表：[system, ...history, (evidence)]
  │
  ├── 步骤6：流式调用 LLM
  │   │  chatStream(model, messages, callbacks)
  │   │  electron/components/rag/llm/llmClient.ts
  │   │  ┌─ fetch POST {base_url}/chat/completions (stream=true)
  │   │  ├─ 逐 chunk 解析 → onToken(delta)
  │   │  │   → SSE event: token → 前端追加内容
  │   │  └─ 流结束 → onComplete(usage)
  │   │      → SSE event: complete → 前端显示完成
  │   │
  │   └─ CHAT 模式 vs KB_SEARCH 模式的区别：
  │      CHAT：消息列表 = [system, ...history]
  │      KB_SEARCH：消息列表 = [system, ...history, evidence_user_msg]
  │      两者复用同一个 chatStream()，区别仅在上下文组装
  │
  ├── 步骤7：保存助手回复
  │   │  assistantdbService.insertMessage(sessionId, 'ASSISTANT', toolMode, folderId, reply, ...)
  │   └─ 结构化 metadata: { citations, evidenceLevel, usage }
  │
  ├── 步骤8：维护短期记忆（after）
  │   └─ shortTermMemoryMaintenanceService.maintainAfterResponse(sessionId, ...)
  │
  └── 步骤9：记录用量
      └─ recordUsage() → metrics.db
  ↓
前端 SSE 消费（与 QA 相同的 dispatchSseEvent）：
  start → token (追加) → citations (引用) → complete (完成)
```

### 三、Agent 智能代理调用路径

Agent 模式基于 Pi Agent SDK，是最复杂的调用路径：

```
前端 Pinia Store: agent.js
  │  fetch POST http://localhost:7071/controller/piAgent/streamAgent
  │  body: { sessionId, message, model, workspaceSlug, permissionMode, thinkingLevel }
  ↓
PiAgentController.streamAgent(args, ctx)
  │  electron/controller/piAgent.ts:224
  │  ┌─ 校验 sessionId / message
  │  ├─ 设置 SSE 响应头
  │  └─ 从数据库加载已启用的 LLM 模型 → 构建 AgentChannel
  ↓
sendAgentMessage(input, channel, workspace, onEvent)
  │  electron/components/pi/adapters/pi-agent-service.ts:490
  │
  ├── 步骤1：并发守卫
  │   └─ activeSessions.has(sessionId) → 抛错"该会话正在处理中"
  │
  ├── 步骤2：持久化用户消息
  │   └─ appendMessage(sessionId, userMessage) → JSONL 追加
  │
  ├── 步骤3：懒加载 Pi SDK
  │   │  loadPiSdk()
  │   │  → createAgentSession, ModelRuntime, DefaultResourceLoader, SessionManager, SettingsManager
  │   │
  │   ├── 构建 MCP 工具
  │   │  │  buildPiMcpTools(mergedConfig)
  │   │  └─ 合并内置 MCP（chrome-devtools、web-search）+ 工作区用户 MCP
  │   │
  │   ├── 构建系统提示词
  │   │  │  buildSystemPrompt(workspace)
  │   │  ├─ 基础身份 + 回复风格约束
  │   │  ├─ 工具使用指南（TaskCreate/TaskUpdate/SearchKnowledgeBase...）
  │   │  ├─ 工作区上下文（CLAUDE.md / Auto Memory / Skills 路径）
  │   │  └─ 知识库检索引导（提示 Agent 可调用 SearchKnowledgeBase）
  │   │
  │   ├── 构建 Pi Provider
  │   │  │  channelToPiProvider(channel)
  │   │  └─ 将 Diting 渠道转换为 Pi SDK 的 provider 配置
  │   │
  │   └─ 注册自定义工具（按顺序）
  │      ├── 内置工具（Read/Write/Edit/Bash/Glob/Grep...）
  │      │   → 包裹 wrapToolWithPermission()
  │      │   → 每次调用先经过 permissionService.canUseTool()
  │      │   → bypassPermissions 模式直接允许
  │      │   → ask 模式发送 SSE event: permission_request → 前端确认
  │      │
  │      ├── AskUserQuestion（向用户提问）
  │      │   → 包裹权限 → canUseTool 拦截 → SSE event: ask_user → 前端展示问答横幅
  │      │
  │      ├── TaskCreate / TaskUpdate（任务进度）
  │      │   → SSE event: tool_start/tool_result → 前端展示任务卡片
  │      │
  │      ├── RunPythonScript / RunNodeScript / InstallPackage / RunGitCommand
  │      │   → 权限包裹 → 执行子进程
  │      │
  │      ├── SearchKnowledgeBase（★ RAG 融合点 ★）
  │      │   │  Agent 自主决定何时检索知识库
  │      │   │  参数: { query, folderId?, topK? }
  │      │   ↓
  │      │   hybridRetrievalService.retrieve(folderId, query, topK)
  │      │   或 hybridRetrievalService.retrieveAll(query, topK)
  │      │   │  → 与 QA/Chat 完全相同的混合检索流程
  │      │   ↓
  │      │   返回: { ragResult: { total, evidenceLevel, documents } }
  │      │   + SSE event: rag_citations → 前端 CitationRail 渲染证据卡片
  │      │
  │      ├── Collaboration 子 Agent 工具
  │      │   → createChildSession() → 实例化子 Pi Agent
  │      │   → 子会话使用相同 channel/workspace/工具集
  │      │   → 子会话事件转发到前端
  │      │
  │      ├── Automation 定时任务工具
  │      │   → 创建/管理定时自动化任务
  │      │
  │      ├── Planning 工具（Todo/日历/提醒/分组/标签）
  │      │   → 任务和日程管理
  │      │
  │      └── MCP 工具
  │          → 外部 MCP Server 提供的工具
  │
  ├── 步骤4：创建 Pi Agent 会话
  │   │  createAgentSession({
  │   │    cwd, model, modelRuntime, resourceLoader,
  │   │    noTools: 'builtin',
  │   │    customTools: allCustomTools,
  │   │    sessionManager: SessionManager.inMemory(cwd),
  │   │    settingsManager: SettingsManager.inMemory({ ... }),
  │   │    ...(thinkingLevel && thinkingLevel !== 'off' && { thinkingLevel }),
  │   │  })
  │   │
  │   └─ 订阅事件
  │      piSession.subscribe(eventListener)
  │      → AgentSessionEvent → handlePiEvent() → 转换为 SSE 事件
  │
  ├── 步骤5：发送消息
  │   │  onEvent('start', { sessionId })
  │   │
  │   ├── preparePromptWithSkills(message)
  │   │  → 检测 /skill:name 命令 → 注入完整 Skill 内容
  │   │
  │   └── piSession.prompt(enrichedPrompt)
  │      │  → Pi SDK 内部驱动 LLM 生成 + 工具调用循环
  │      │
  │      │  事件流（AgentSessionEvent）：
  │      │  ├─ message_update / text_delta → SSE event: text
  │      │  ├─ message_update / thinking_delta → SSE event: thinking
  │      │  ├─ message_update / thinking_start → SSE event: thinking_start
  │      │  ├─ tool_execution_start → SSE event: tool_start
  │      │  ├─ tool_execution_end → SSE event: tool_result
  │      │  ├─ permission_request → SSE event: permission_request
  │      │  ├─ ask_user → SSE event: ask_user
  │      │  └─ agent_end → SSE event: complete
  │      │
  │      │  工具调用循环：
  │      │  LLM 生成 → 决定调用工具 → canUseTool 权限检查
  │      │  → (ask 模式) SSE event: permission_request → 前端确认
  │      │  → (bypassPermissions 模式) 直接允许
  │      │  → 执行工具 → 返回结果给 LLM → LLM 继续生成
  │      │  → 可能触发更多工具调用 → 循环直到 LLM 认为完成
  │      │  → agent_end 事件
  │      ↓
  │   ├── 获取回复文本
  │   │  piSession.getLastAssistantText()
  │   │
  │   ├── 持久化 AI 消息
  │   │  appendMessage(sessionId, aiMessage) → JSONL
  │   │
  │   └── onEvent('complete', { sessionId, reply })
  │
  └── 步骤6：清理
      │  piSession.dispose()
      ├─ 释放 MCP 连接: disposePiMcpConnections()
      └─ 清理协作子会话: cleanupDelegations(sessionId)
  ↓
前端 SSE 消费：
  agent.js dispatchSseEvent(rawEvent, assistantMsg, sessionId, onEvent)
  │  frontend/src/stores/agent.js:448
  │  ├─ 'text'           → assistantMsg.content += data.delta
  │  ├─ 'thinking'       → blocks.push({ type: 'thinking', thinking: delta })
  │  ├─ 'thinking_start'  → 新建 thinking 块
  │  ├─ 'text_start'     → 新建 text 块
  │  ├─ 'tool_start'     → blocks.push({ type: 'tool_use', status: 'running' })
  │  ├─ 'tool_result'    → 更新对应 tool_use 块 status + result
  │  ├─ 'rag_citations'  → onEvent 回调 → CitationRail 渲染
  │  ├─ 'permission_request' → onEvent → 弹出权限确认面板
  │  ├─ 'ask_user'       → onEvent → 弹出问答横幅
  │  ├─ 'complete'       → 标记完成
  │  └─ 'error'          → 显示错误
  ↓
Vue 组件渲染
  AgentMessages 组件读取 blocks → 分别渲染文本/思考/工具调用/引用
```

### 四、三者协调关系

```
                        ┌─────────────────────────────────────┐
                        │          混合检索引擎                │
                        │  hybridRetrievalService             │
                        │  ┌───────────┐  ┌────────────────┐ │
                        │  │ 向量检索   │  │ 关键词检索      │ │
                        │  │ (zvec)    │  │ (MiniSearch)   │ │
                        │  └─────┬─────┘  └───────┬────────┘ │
                        │        └──── RRF 融合 ──┘          │
                        │              ↓                      │
                        │     证据文档 + 证据等级 + 引用       │
                        └──────────┬───────────┬────────────┘
                                   │           │
                    ┌──────────────┘           └──────────────┐
                    │                                         │
              ┌─────↓─────┐                            ┌───────↓──────┐
              │  QA 问答   │                            │    Agent     │
              │  (qa.ts)  │                            │  (piAgent)   │
              │           │                            │              │
              │ 用户提问   │                            │ SearchKnowledgeBase
              │ → 检索    │                            │ (Agent 自主调用)
              │ → LLM 生成 │                            │ → 检索 → 注入上下文
              │ → 引用     │                            │ → 继续推理 + 工具调用
              └───────────┘                            └──────────────┘
                                                          │
                                                    ┌─────↓─────┐
                                                    │  Chat 对话 │
                                                    │(assistant)│
                                                    │           │
                                                    │ CHAT 模式: │
                                                    │  纯对话   │
                                                    │ KB_SEARCH: │
                                                    │  检索+对话 │
                                                    └───────────┘
```

#### 4.1 共享的混合检索引擎

三条调用路径**共享同一个 `hybridRetrievalService`**，区别在于触发方式：

| 路径 | 触发方式 | 检索范围 | 使用场景 |
|------|---------|---------|---------|
| **QA 问答** | 用户主动提问，自动检索 | `retrieve(folderId, question, 5)` 指定文件夹 | `/qa` 页面，严肃问答 |
| **Chat KB_SEARCH** | 用户发消息时选择知识库模式 | `retrieve(folderId, message, 5)` 指定文件夹 | `/chat` 页面，对话中检索 |
| **Agent** | LLM **自主决定**调用 `SearchKnowledgeBase` | `retrieve(folderId, query, topK)` 或 `retrieveAll(query, topK)` 全库 | `/agent` 页面，Agent 推理中检索 |

#### 4.2 共享的 LLM 客户端

QA 和 Chat 共用 `llmClient.ts` 的 `chatStream()` 函数（OpenAI 兼容 API）。Agent 使用 Pi SDK 内部的 LLM 调用（通过 `createAgentSession` 的 `modelRuntime`），但底层仍是同一个已配置的 LLM 模型。

```
llmdbService.getEnabledModel()  ←  SQLite llm.db（唯一模型来源）
  │
  ├── QA      → chatStream(model, messages) → fetch {base_url}/chat/completions
  ├── Chat    → chatStream(model, messages) → fetch {base_url}/chat/completions
  └── Agent   → ModelRuntime.registerProvider() → Pi SDK 内部调用同一个 API
```

#### 4.3 数据持久化分层

| 模块 | 存储方式 | 用途 |
|------|---------|------|
| QA | SQLite `qa.db` | 问答历史记录 |
| Chat | SQLite `assistant.db` | 会话 + 消息 + 短期记忆 |
| Agent | JSONL `agent-sessions/{id}.jsonl` | 会话消息流（追加写入） |
| RAG | SQLite `rag.db` + zvec 向量库 | 切片文本 + 向量索引 + 关键字索引 |
| Metrics | SQLite `metrics.db` | LLM 用量统计（QA + Chat + Agent 共享） |

#### 4.4 Agent 如何使用 RAG

Agent 不是每次都检索知识库，而是由 LLM **自主判断**是否需要检索：

1. 系统提示词中注入了工具说明：`SearchKnowledgeBase` 工具的描述和参数
2. 用户提问后，Pi SDK 驱动 LLM 生成回复或决定调用工具
3. 如果 LLM 认为问题涉及知识库文档，它会调用 `SearchKnowledgeBase({ query, folderId?, topK? })`
4. 工具执行时调用 `hybridRetrievalService.retrieve()` 或 `retrieveAll()`
5. 检索结果以 JSON 文本返回给 LLM，同时通过 SSE `rag_citations` 事件推送到前端
6. LLM 拿到检索结果后继续推理，生成最终回答
7. 前端的 `CitationRail` 组件根据 `rag_citations` 事件渲染证据卡片

#### 4.5 Chat 的双模式切换

Chat 模式通过 `toolMode` 参数区分两种行为：

- **CHAT 模式**：消息列表 = `[system, ...history]` → 纯 LLM 对话
- **KB_SEARCH 模式**：消息列表 = `[system, ...history, evidence_user_msg]` → 先检索证据再注入到上下文

两者**复用同一个 `chatStream()` 函数**，区别仅在上下文组装阶段。前端通过切换知识库选择器来切换模式。

## 本地数据

```text
~/.diting/
├── channels.json           # LLM 模型配置
├── conversations/          # 对话消息存储 (JSONL)
├── agent-sessions/         # Agent 会话存储 (JSONL)
├── agent-workspaces/       # Agent 工作区目录
│   └── {workspace-slug}/
│       ├── mcp.json        # MCP Server 配置
│       └── skills/         # Skills 配置
├── attachments/            # 附件文件
└── data/                   # SQLite 数据库
    ├── file.db             # 文件索引
    ├── llm.db              # 模型配置
    ├── qa.db               # 问答记录
    ├── assistant.db        # 助手会话
    └── rag.db              # 向量索引
```

## 开发与构建

### 开发命令

```bash
npm run dev               # 完整开发（frontend + electron）
npm run dev-frontend      # 仅前端开发（Vite dev server :8080）
npm run dev-electron      # 仅 Electron 开发
npm run debug-dev         # 全量调试日志开发模式
```

### 构建命令

```bash
npm run build             # 构建 frontend + electron + 加密
npm run build-frontend    # Vite 构建前端
npm run build-electron    # esbuild 打包 Electron
```

### 平台打包

```bash
npm run build-m           # macOS ARM64
npm run build-m-x86       # macOS x64
npm run build-w           # Windows 64-bit
npm run build-l           # Linux
```

## 贡献

欢迎修 Bug、补文档、加测试、完善体验。

提交 PR 前建议先确认：

- 使用 `npm run dev` 能正常启动
- 状态管理使用 Pinia
- 尽量保持本地优先，优先使用 SQLite 和配置文件
- UI 组件推荐使用 Ant Design Vue
- 注释和日志采用中文，保留必要的专业术语

## 致谢

本项目的诞生离不开以下优秀的开源项目和框架：

### 核心框架

- **[electron-egg v5](https://github.com/dromara/electron-egg)** — 企业级桌面应用开发框架，提供了生命周期管理、多通道通信、构建打包、加密等基础设施
- **[Proma](https://github.com/ErlichLiu/Proma)** — 开源 AI 桌面应用，本项目 Agent 模式的 UI 设计、交互风格、权限模式切换和思考深度组件均受其启发

### AI 能力

- **[@earendil-works/pi-coding-agent](https://github.com/earendil-works/pi-coding-agent)** — Pi Agent SDK，Agent 智能代理核心运行时
- **[@earendil-works/pi-ai](https://github.com/earendil-works/pi-ai)** — Pi AI 对话引擎
- **[@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/modelcontextprotocol)** — Model Context Protocol，标准化外部工具接入

### 前端生态

- **[Vue 3](https://vuejs.org/)** — 渐进式 JavaScript 框架
- **[Ant Design Vue](https://antdv.com/)** — 企业级 UI 组件库
- **[Vite](https://vitejs.dev/)** — 下一代前端构建工具
- **[Pinia](https://pinia.vuejs.org/)** — Vue 官方推荐的状态管理库
- **[TipTap](https://tiptap.dev/)** — 无头富文本编辑器框架
- **[Shiki](https://shiki.style/)** — 基于 TextMate 语法的代码高亮
- **[Mermaid](https://mermaid.js.org/)** — JavaScript 图表库
- **[KaTeX](https://katex.org/)** — 快速数学公式渲染

### 数据与检索

- **[better-sqlite3](https://github.com/WiseLibs/better-sqlite3)** — 同步 SQLite3 绑定
- **[MiniSearch](https://github.com/lucaong/minisearch)** — 轻量全文搜索引擎
- **[pdf-parse](https://github.com/gkatsis/pdf-parse)** — PDF 文本提取
- **[mammoth](https://github.com/mwilliamson/mammoth.js)** — DOCX 文档解析

### 工具链

- **[Electron](https://www.electronjs.org/)** — 跨平台桌面应用框架
- **[electron-builder](https://github.com/electron-userland/electron-builder)** — Electron 打包工具
- **[esbuild](https://esbuild.github.io/)** — 极速 JavaScript 打包器
- **[TypeScript](https://www.typescriptlang.org/)** — JavaScript 的类型超集

## 许可证

[Apache License 2.0](./LICENSE)

## 链接

- [用户教程](./tutorial/tutorial.md)
- [AI 编码指南](./CLAUDE.md)
- [产品路线图](./docs/product-thinking.md)
- [发布说明](./release-notes/)
