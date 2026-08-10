# CLAUDE.md

本文件为 AI 编码助手在此仓库中工作时提供指引。

**重要提示：**
- 所有的注释和日志优先采用中文，保留必要的专业术语部分。
- 永远不要使用 `any` 类型 — 创建合适的 interface。
- 对象类型优先使用 interface 而不是 type。
- 尽可能使用 `import type` 进行仅类型导入。
- 状态管理全部使用 Pinia，不混用 Vuex。
- 本地优先，优先使用 SQLite 和配置文件，不依赖云端服务。
- 保证充分的组件化以及人类的可读性，保持简单直接不过度设计的风格。
- 在 UI 设计上采用更现代的方案，UI 组件推荐使用 Ant Design Vue，用卡片和阴影取代边框，用符合主题的饱满色彩。

## 项目概述

Diting AI Desktop 是一款基于 **electron-egg v5** 框架的企业级跨平台桌面 AI 助手应用，融合了本地文件管理、RAG 知识库问答、Pi Agent 智能代理、LLM 多轮对话等 AI 核心能力。

## 项目结构

```
Diting_AI_Desktop/
├── electron/                        # 主进程源码（TypeScript）
│   ├── main.ts                      # 入口文件
│   ├── config/                      # 配置分层（default / local / prod）
│   ├── controller/                  # 业务控制器（API 路由层）
│   │   ├── piAgent.ts               # Pi Agent 智能体控制
│   │   ├── assistant.ts             # 多轮对话助手
│   │   ├── qa.ts                    # RAG 知识库问答
│   │   ├── file.ts                  # 文件管理 & RAG 向量化
│   │   ├── llm.ts                   # LLM 模型管理
│   │   ├── framework.ts             # 框架功能
│   │   ├── os.ts                    # 系统操作
│   │   └── cross.ts                 # 跨语言进程通信
│   ├── service/                     # 业务服务层
│   │   ├── database/                # 数据库服务（file/llm/qa/assistant/sqlite）
│   │   └── os/                      # 系统服务
│   ├── components/                  # AI 核心组件
│   │   ├── rag/                     # RAG 检索增强生成
│   │   │   ├── core/                # 核心编排
│   │   │   ├── database/            # 向量存储 + 关键字搜索
│   │   │   ├── parser/              # 文档解析（PDF/DOCX）
│   │   │   ├── processor/           # 文本处理（切片 + 清理）
│   │   │   ├── embedding/           # 向量嵌入（Qwen ONNX）
│   │   │   ├── retrieval/           # 混合检索
│   │   │   ├── llm/                 # LLM 对话客户端
│   │   │   ├── qa/                  # QA 问答编排
│   │   │   ├── assistant/           # 多轮对话助手
│   │   │   ├── metrics/             # 用量统计
│   │   │   └── types/               # 共享类型
│   │   ├── pi/                      # Pi Agent 智能体
│   │   │   ├── adapters/            # Agent 适配器
│   │   │   ├── builtin-mcp/         # 内置 MCP 服务器
│   │   │   ├── skills/              # Skills 技能管理
│   │   │   ├── types/               # 类型定义
│   │   │   └── config-paths.ts      # 配置路径工具
│   │   └── file/                    # 文件同步管理
│   ├── preload/                     # 预加载脚本
│   ├── jobs/                        # 后台任务（child_process.fork）
│   └── resources/                   # 资源文件
├── frontend/                        # 前端渲染进程（Vue 3）
│   ├── vite.config.js               # Vite 构建配置
│   └── src/
│       ├── main.js                  # Vue 入口
│       ├── App.vue                  # 根组件
│       ├── layouts/                 # 布局组件
│       ├── views/                   # 页面视图
│       │   ├── chat/                # AI 对话
│       │   ├── agent/               # Agent 智能体
│       │   ├── qa/                  # 知识库问答
│       │   ├── file/                # 文件管理
│       │   ├── rag/                 # RAG 管理
│       │   ├── skills/              # 技能管理
│       │   ├── setting/             # 设置页面
│       │   ├── adjust/              # 模型配置
│       │   └── metrics/             # 用量统计
│       ├── api/                     # API 接口层
│       ├── stores/                  # Pinia 状态管理
│       ├── router/                  # 路由配置
│       ├── components/              # 公共组件
│       └── utils/                   # 工具函数
├── cmd/                             # 构建命令配置
├── build/                           # Electron-builder 打包配置
├── public/                          # 构建输出 + 静态资源
└── package.json                     # 根包配置
```

## 常用命令

```bash
# 开发
npm run dev               # 完整开发（frontend + electron）
npm run dev-frontend      # 仅前端开发（Vite :8080）
npm run dev-electron      # 仅 Electron 开发
npm run debug-dev         # 调试日志模式

# 构建
npm run build             # 构建 frontend + electron + 加密
npm run build-frontend    # Vite 构建前端
npm run build-electron    # esbuild 打包 Electron

# 平台打包
npm run build-m           # macOS ARM64
npm run build-m-x86       # macOS x64
npm run build-w           # Windows 64-bit
npm run build-l           # Linux

# 其他
npm run encrypt           # 字节码/混淆加密
npm run icon              # 生成应用图标
npm run re-sqlite         # 为 Electron 重建 better-sqlite3
```

## 通信机制（最重要的架构模式）

类型定义 → 控制器 → Preload 桥接 → 渲染进程调用：

1. **控制器**：`electron/controller/` 中定义，路由格式 `controller/{name}/{method}`
2. **三通道通信**：

| 通道 | 技术 | 用途 |
|------|------|------|
| IPC | `ipcMain.handle` + `ipcRenderer.invoke` | 主进程 ↔ 渲染进程 |
| HTTP | Koa RESTful API（端口 7071） | 外部服务调用 |
| Socket.IO | WebSocket（端口 7070） | 实时数据推送 |

3. **流式输出**：统一使用 SSE（Server-Sent Events）推送

### 主要控制器

| 控制器 | 职责 |
|--------|------|
| `piAgent.ts` | Pi Agent 智能体：会话管理、流式对话、Skills、MCP、权限 |
| `assistant.ts` | 多轮对话助手：会话 CRUD、流式聊天、上下文记忆 |
| `qa.ts` | RAG 知识库问答：混合检索、引用追踪、流式输出 |
| `file.ts` | 文件管理：授权文件夹、文件扫描、RAG 向量化 |
| `llm.ts` | LLM 模型管理：多模型配置、连接测试 |

## AI 核心组件（`electron/components/`）

### RAG 检索增强（`rag/`）

```
用户提问 → 混合检索（向量 + 关键字） → 证据评估 → LLM 生成 → 引用组装 → 返回答案
```

- **文档解析**：pdf-parse、mammoth、pdf-efficient-loader
- **文本处理**：智能切片（chunkText）+ 文本清理（cleanText）
- **向量嵌入**：qwen-embedder（本地 ONNX）+ hf-embedder
- **混合检索**：zvec 向量相似度 + MiniSearch 关键字搜索
- **引用追踪**：证据等级评估 + 引用片段高亮

### Pi Agent 智能体（`pi/`）

基于 `@earendil-works/pi-coding-agent` 实现 Agent 模式：

- **工作区管理**：每个工作区独立的 Skills 和 MCP 配置
- **Skills 技能系统**：内置默认 Skills + 用户自定义 Skills
- **MCP 工具协议**：内置 MCP 服务器 + 用户 MCP 配置
- **权限模式**：bypassPermissions（完全自动）/ ask（需确认）
- **思考深度**：off / low / medium / high / xhigh
- **流式对话**：SSE 推送 Agent 执行过程
- **协作子 Agent**：任务拆分与并行执行

## Pinia 状态管理（`frontend/src/stores/`）

| Store 文件 | 管理的状态 |
|-----------|-----------|
| `agent.js` | Agent 会话列表、消息（多会话隔离）、流式状态、AbortController、协作子 Agent |
| `chat.js` | 对话列表、当前消息、流式状态 |
| `tab.js` | 标签页管理（多会话并行） |
| `workspace.js` | 工作区选择、项目信息 |
| `planning.js` | 计划任务管理 |

## 前端组件架构（`frontend/src/`）

- **`layouts/`**：三面板布局（AppSider | MainLayout），侧边栏采用 Proma 风格设计
- **`views/agent/`**：Agent 模式 — Index.vue（主视图）、RichTextInput（富文本输入）、TaskProgressCard（任务进度）、DelegationCard（协作子 Agent）
- **`views/chat/`**：AI 对话 — 多轮对话、流式输出、Markdown 渲染
- **`views/qa/`**：知识库问答 — RAG 问答、引用展示
- **`components/agent/`**：Agent 组件 — PermissionModeSelector、ThinkingDepthPopover

## 数据持久化

基于 **better-sqlite3** 的本地持久化：

| 数据库 | 存储内容 |
|--------|---------|
| file.db | 授权文件夹、文件索引、同步状态 |
| llm.db | LLM 模型配置 |
| qa.db | 问答历史记录 |
| assistant.db | 助手会话 & 消息 |
| rag.db + zvec | 文档切片、向量索引、关键字索引 |
| metrics.db | LLM 调用用量记录 |

## TypeScript 配置

- Target: ESNext, Module: ESNext, moduleResolution: Bundler
- 严格模式，allowJs, skipLibCheck, resolveJsonModule
- 仅包含 `electron/**/*.ts`

## 构建配置

### esbuild 打包（`cmd/bin.js`）

```js
electron: {
  bundleType: 'bundle',  // 'bundle' | 'copy'
  external: [],          // 用户自定义外部依赖
  format: 'cjs',         // 'cjs' | 'esm'（推荐 cjs）
  minify: false,         // 生产环境压缩
  sourcemap: false,      // dev→inline, prod→off
}
```

**框架管理的外部依赖**：`ee-core`、`ee-bin`、`electron`、`better-sqlite3`。

### Pi Agent SDK 打包要求

- `@earendil-works/pi-coding-agent`、`pi-agent-core`、`pi-ai` 必须作为 esbuild external
- `electron-builder.yml` 需保留 Pi native addon 的 `asarUnpack` 规则

## 故障排查

```bash
# 启用调试日志
npm run debug-dev                           # 所有 ee-* 命名空间
DEBUG='ee-core:config:*' npm run dev-electron  # 限定到配置子系统

# better-sqlite3 原生模块错误
npm run re-sqlite
```

## 重要注意事项

- **ee-core 和 ee-bin 是独立的 npm 包**：通过 npm 安装，框架源码在 `ee-dev` 仓库维护
- **ee-core 不打包进 main.js**：ee-core 是 esbuild external，运行时从 `node_modules` 加载
- **better-sqlite3 需要为 Electron 原生重建**：遇到原生模块错误时使用 `npm run re-sqlite`
- **Node.js 最低版本**：v20
- **路径别名**：`@/` → `frontend/src/`
