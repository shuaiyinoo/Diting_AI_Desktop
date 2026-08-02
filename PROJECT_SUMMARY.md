# Diting AI Desktop — 项目总结文档

> **项目名称**：Diting AI Desktop（谛听 AI 桌面客户端）
> **框架**：electron-egg v5（EE-V5）
> **版本**：5.0.0
> **Git 仓库**：[dromara/electron-egg](https://gitee.com/dromara/electron-egg)
> **许可证**：Apache 2.0

---

## 📋 一、项目概述

**Diting AI** 是一款基于 **electron-egg v5** 框架构建的企业级跨平台桌面 AI 助手应用。它融合了本地文件管理、RAG（检索增强生成）知识库问答、Agent 智能代理、LLM 对话等 AI 核心能力，面向 Windows / macOS / Linux 三大平台，旨在为用户提供高效、安全、本地优先的桌面 AI 工作台。

> **"Proma"** 是项目中侧边栏 UI 的设计风格代号（`// ===== Proma 风格侧边栏 =====`），并非独立的子项目。

---

## 🏗️ 二、技术架构

### 2.1 整体分层

```
┌──────────────────────────────────────────────────┐
│                  Frontend (Vue 3)                 │
│     Ant Design Vue 4 + Pinia + Vue Router          │
│     Vite 构建 → public/dist/                       │
├──────────────────────────────────────────────────┤
│              IPC / HTTP / Socket.IO                │
│          双向通信：主进程 ↔ 渲染进程                  │
├──────────────────────────────────────────────────┤
│               Electron Main Process               │
│     ┌─────────────┬──────────────┐                │
│     │ Controller  │   Service    │                │
│     │ (业务控制层) │  (业务服务层)  │                │
│     └─────────────┴──────────────┘                │
│     ┌─────────────────────────────┐               │
│     │  Components (AI 核心组件)   │               │
│     │  ├── rag/   (RAG 检索增强)   │               │
│     │  ├── pi/    (Agent 智能体)   │               │
│     │  └── file/  (文件同步管理)   │               │
│     └─────────────────────────────┘               │
│     ┌─────────────────────────────┐               │
│     │  Database (SQLite)          │               │
│     │  better-sqlite3 + zvec      │               │
│     └─────────────────────────────┘               │
├──────────────────────────────────────────────────┤
│                  electron-egg v5                  │
│     ee-core (生命周期/配置/通信/日志)                │
│     ee-bin  (构建/打包/加密)                        │
├──────────────────────────────────────────────────┤
│            Electron 39 + Node.js v20              │
│              Windows / macOS / Linux               │
└──────────────────────────────────────────────────┘
```

### 2.2 核心依赖

| 类别 | 技术 | 说明 |
|------|------|------|
| 桌面框架 | Electron 39 + electron-egg v5 | 企业级桌面应用框架 |
| 前端 | Vue 3 + Vite 7 + Ant Design Vue 4 | 现代化 UI 渲染 |
| 状态管理 | Pinia + Vue Router | 响应式状态 & 路由 |
| 数据库 | better-sqlite3 + zvec | SQLite + 向量存储 |
| AI Agent | @earendil-works/pi-agent-core | 智能代理核心 |
| AI 对话 | @earendil-works/pi-ai + pi-coding-agent | LLM 对话 & 代码代理 |
| 文档解析 | pdf-parse / mammoth / pdf-efficient-loader / @kreuzberg/node | PDF / DOCX 解析 |
| 向量嵌入 | qwen-embedder / hf-embedder | 本地 ONNX 向量嵌入 |
| 搜索引擎 | MiniSearch | 前端关键词检索引擎 |
| 通信 | Socket.IO + Koa HTTP | 多通道通信服务 |
| MCP | @modelcontextprotocol/sdk | Model Context Protocol |
| 自动更新 | electron-updater | 跨平台自动更新 |

---

## 📂 三、项目目录结构

```
Diting_AI_Desktop/
├── electron/                        # 主进程源码（TypeScript）
│   ├── main.ts                      # 入口文件
│   ├── config/                      # 配置分层
│   │   ├── config.default.ts        # 默认配置
│   │   ├── config.local.ts          # 本地开发配置
│   │   └── config.prod.ts           # 生产配置
│   ├── controller/                  # 业务控制器（API 路由层）
│   │   ├── piAgent.ts               # Pi Agent 智能体控制
│   │   ├── assistant.ts             # 多轮对话助手
│   │   ├── qa.ts                    # RAG 知识库问答
│   │   ├── file.ts                  # 文件管理 & RAG 向量化
│   │   ├── llm.ts                   # LLM 模型管理
│   │   ├── framework.ts             # 框架功能演示
│   │   ├── os.ts                    # 系统操作
│   │   ├── cross.ts                 # 跨语言进程通信
│   │   └── effect.ts                # 特效功能
│   ├── service/                     # 业务服务层
│   │   ├── database/                # 数据库服务
│   │   │   ├── basedb.ts            # 基础数据库
│   │   │   ├── filedb.ts            # 文件数据库
│   │   │   ├── llmdb.ts             # LLM 模型数据库
│   │   │   ├── qadb.ts              # 问答数据库
│   │   │   ├── assistantdb.ts       # 助手会话数据库
│   │   │   └── sqlitedb.ts          # SQLite 数据库
│   │   ├── framework.ts             # 框架服务
│   │   ├── cross.ts                 # 跨语言服务
│   │   ├── effect.ts                # 特效服务
│   │   └── os/                      # 系统服务
│   ├── components/                  # AI 核心组件
│   │   ├── rag/                     # RAG 检索增强生成
│   │   │   ├── core/                # 核心编排（队列 + 摄取流程）
│   │   │   ├── database/            # 向量存储 + 关键字搜索
│   │   │   ├── parser/              # 文档解析（PDF/DOCX）
│   │   │   ├── processor/           # 文本处理（切片 + 清理）
│   │   │   ├── embedding/           # 向量嵌入（Qwen ONNX）
│   │   │   ├── retrieval/           # 混合检索（向量 + 关键字）
│   │   │   ├── llm/                 # LLM 对话客户端
│   │   │   ├── qa/                  # QA 问答编排
│   │   │   ├── assistant/           # 多轮对话助手
│   │   │   ├── metrics/             # 用量统计
│   │   │   └── types/               # 共享类型定义
│   │   ├── pi/                      # Pi Agent 智能体
│   │   │   ├── adapters/            # Agent 适配器
│   │   │   ├── builtin-mcp/         # 内置 MCP 服务器
│   │   │   ├── skills/              # Skills 技能管理
│   │   │   ├── types/               # 类型定义
│   │   │   ├── config-paths.ts      # 配置路径工具
│   │   │   └── index.ts             # 初始化入口
│   │   └── file/                    # 文件同步管理
│   │       ├── FolderScanner.ts     # 文件夹扫描器
│   │       └── SyncService.ts       # 文件同步服务
│   ├── preload/                     # 预加载脚本
│   │   ├── bridge.ts                # IPC 桥接
│   │   ├── index.ts                 # 预加载入口
│   │   └── lifecycle.ts             # 生命周期钩子
│   ├── jobs/                        # 后台任务（child_process.fork）
│   └── resources/                   # 资源文件
├── frontend/                        # 前端渲染进程（Vue 3）
│   ├── index.html                   # 入口 HTML
│   ├── vite.config.js               # Vite 构建配置
│   ├── src/
│   │   ├── main.js                  # Vue 入口
│   │   ├── App.vue                  # 根组件
│   │   ├── layouts/                 # 布局组件
│   │   │   ├── MainLayout.vue       # 主布局
│   │   │   ├── AppSider.vue         # 侧边栏（Proma 风格）
│   │   │   └── Menu.vue             # 菜单组件
│   │   ├── views/                   # 页面视图
│   │   │   ├── file/                # 文件管理
│   │   │   ├── chat/                # AI 对话
│   │   │   ├── agent/               # Agent 智能体
│   │   │   ├── qa/                  # 知识库问答
│   │   │   ├── rag/                 # RAG 管理
│   │   │   ├── skills/              # 技能管理
│   │   │   ├── setting/             # 设置页面
│   │   │   ├── adjust/              # 模型配置
│   │   │   ├── metrics/             # 用量统计
│   │   │   ├── framework/           # 框架演示
│   │   │   ├── os/                  # 系统操作
│   │   │   ├── cross/               # 跨语言通信
│   │   │   └── effect/              # 特效演示
│   │   ├── api/                     # API 接口层
│   │   ├── stores/                  # Pinia 状态管理
│   │   ├── router/                  # 路由配置
│   │   ├── components/              # 公共组件
│   │   ├── utils/                   # 工具函数
│   │   └── assets/                  # 静态资源
│   └── public/                      # 静态资源
├── cmd/                             # 构建命令配置
├── build/                           # Electron-builder 打包配置
├── public/                          # 构建输出 + 静态资源
│   ├── dist/                        # 前端构建产物
│   └── electron/                    # Electron 构建产物
├── go/                              # Go 后端（可选）
├── python/                          # Python 后端（可选）
├── data/                            # 应用数据
├── icons/                           # 应用图标
├── logs/                            # 日志文件
├── package.json                     # 根包配置
└── tsconfig.json                    # TypeScript 配置
```

---

## 🎯 四、核心功能模块

### 4.1 文件管理（File Management）

- **授权文件夹管理**：用户可以授权指定文件夹，应用扫描并管理其中的文档
- **文件同步服务**（`SyncService`）：定期扫描文件变更（新增/修改/删除），自动同步到知识库
- **文件浏览器**：树形结构展示，支持 Office 文件在线预览
- **RAG 自动向量化**：文件变更后自动触发向量化管道（解析 → 切片 → 嵌入 → 存储）

### 4.2 RAG 知识库问答（Knowledge QA）

```
用户提问 → 混合检索（向量 + 关键字） → 证据评估 → LLM 生成 → 引用组装 → 返回答案
```

- **文档解析**：支持 PDF（`pdf-parse`、`pdf-efficient-loader`）、DOCX（`mammoth`）
- **文本处理**：智能切片（`chunkText`）+ 文本清理（`cleanText`）
- **向量嵌入**：本地 Qwen ONNX 模型（`qwen-embedder`）+ HuggingFace 嵌入器
- **混合检索**：向量相似度搜索 + MiniSearch 关键字搜索，双重召回
- **引用追踪**：证据等级评估（`EvidenceLevel`）+ 引用片段高亮
- **流式输出**：HTTP SSE 逐 token 推送，实时展示回答生成过程

### 4.3 Pi Agent 智能代理（Agent）

- **工作区管理**（Workspace）：创建/删除/更新工作区，每个工作区拥有独立的 Skills 和 MCP 配置
- **Skills 技能系统**：内置默认 Skills + 用户自定义 Skills，支持读/写/启用/禁用
- **内置 MCP 服务器**：Model Context Protocol，支持外接工具服务
- **流式对话**：SSE 流式推送 Agent 执行过程，支持会话管理
- **Claude.md 配置**：每个工作区支持自定义 Claude 配置策略

### 4.4 多轮对话助手（Assistant）

- **会话管理**：创建/列表/重命名/删除多轮对话
- **流式聊天**：HTTP SSE + Socket.IO 双通道实时推送
- **上下文记忆**：短期记忆管理 + 会话摘要服务
- **工具模式**：支持 Tool/Agent 模式切换

### 4.5 LLM 模型管理

- **多模型配置**：支持 OpenAI 兼容 API 的多种模型
- **模型切换**：同一时间启用一个模型，支持启用/禁用
- **连接测试**：内置模型连通性测试
- **参数配置**：temperature、max_tokens 等参数可调

### 4.6 用量统计（Metrics）

- **概览数据**：总提问次数、平均延迟、总 Token 用量
- **费用计算**：基于模型定价的自动费用估算
- **多维度分析**：按时间趋势、文件夹、模块分类统计
- **持久化存储**：SQLite 记录所有 LLM 调用

---

## 🔌 五、通信机制

项目通过 **三通道** 实现灵活的多端通信：

| 通道 | 技术 | 用途 |
|------|------|------|
| **IPC** | `ipcMain.handle/on` + `ipcRenderer.invoke/send` | 主进程 ↔ 渲染进程 |
| **HTTP** | Koa RESTful API（端口 7071） | 外部服务调用 |
| **Socket.IO** | WebSocket（端口 7070） | 实时数据推送 |

- 控制器路由格式：`controller/{name}/{method}`
- 流式数据统一通过 **SSE**（Server-Sent Events）推送
- 文件同步变更通过 IPC 事件通道实时通知前端

---

## 🗄️ 六、数据持久化

基于 **better-sqlite3** 的轻量级本地持久化方案：

| 数据库模块 | 文件 | 存储内容 |
|-----------|------|---------|
| `filedb` | SQLite | 授权文件夹、文件索引、同步状态 |
| `llmdb` | SQLite | LLM 模型配置 |
| `qadb` | SQLite | 问答历史记录 |
| `assistantdb` | SQLite | 助手会话 & 消息 |
| `ragdb` + zvec | SQLite + 向量扩展 | 文档切片、向量索引、关键字索引 |
| `metricsDb` | SQLite | LLM 调用用量记录 |

---

## 🛠️ 七、开发与构建

### 7.1 开发命令

```bash
npm run dev               # 完整开发（frontend + electron）
npm run dev-frontend      # 仅前端开发（Vite dev server :8080）
npm run dev-electron      # 仅 Electron 开发
DEBUG=ee-* npm run dev-electron  # 启用调试日志
npm run debug-dev         # 全量调试日志开发模式
```

### 7.2 构建命令

```bash
npm run build             # 构建 frontend + electron + 加密
npm run build-frontend    # Vite 构建前端
npm run build-electron    # esbuild 打包 Electron
npm run encrypt           # 字节码/混淆加密
```

### 7.3 平台打包

```bash
npm run build-m           # macOS ARM64
npm run build-m-x86       # macOS x64
npm run build-w           # Windows 64-bit
npm run build-l           # Linux
npm run build-we          # Windows (免安装版)
```

### 7.4 构建流程

```
1. build-frontend → Vite 构建 Vue → public/dist/
2. build-electron  → esbuild bundle → public/electron/main.js + jobs/ + preload/
3. ee-bin encrypt  → 字节码加密（可选）
4. electron-builder → 平台安装包（.dmg / .exe / .AppImage）
```

---

## 🎨 八、前端界面

### 8.1 技术栈

- **Vue 3**（组合式 API）+ **Vite 7**
- **Ant Design Vue 4**（企业级 UI 组件库）
- **Pinia**（状态管理）
- **Vue Router**（路由管理）
- **md-editor-v3**（Markdown 编辑器）
- **@file-viewer/vue3-full**（Office 文件预览）
- **Less**（CSS 预处理器）

### 8.2 主要页面

| 路由 | 页面 | 功能 |
|------|------|------|
| `/file` | 文件管理 | 授权文件夹、文件浏览、RAG 进度 |
| `/chat` | AI 对话 | 多轮对话、流式输出 |
| `/agent` | Agent 智能体 | 工作区管理、Skills/MCP 配置 |
| `/qa` | 知识库问答 | 基于文件的 RAG 问答 |
| `/rag` | RAG 管理 | 向量化状态、知识库概览 |
| `/skills` | 技能管理 | Skills 编辑/启用/禁用 |
| `/setting` | 设置 | 应用设置、模型配置 |
| `/adjust` | 模型配置 | LLM 模型增删改查 |
| `/metrics` | 用量统计 | LLM 调用量统计面板 |

### 8.3 UI 设计（Proma 风格）

侧边栏采用 **Proma 风格**设计：
- 可折叠（展开 240px / 折叠 60px）
- 渐变背景 + 圆角菜单
- 活跃态蓝色渐变 + 阴影
- 折叠时悬停显示 tooltip

---

## 🔒 九、安全策略

- **字节码加密**：通过 `bytenode` 将 JS 编译为字节码
- **混淆压缩**：esbuild minify + 混淆
- **本地优先**：所有数据存储在本地 SQLite，不上传云端
- **向量嵌入本地执行**：使用 Qwen ONNX 本地模型，无需联网

---

## 📊 十、项目亮点

1. **本地优先**：所有 AI 能力（嵌入、检索、存储）本地执行，保障数据隐私
2. **模块化架构**：RAG、Agent、Assistant 三大 AI 组件独立可扩展
3. **多通道通信**：IPC + HTTP + Socket.IO 三通道设计适配不同场景
4. **流式体验**：全链路 SSE 流式推送（LLM 生成 → Token → 前端渲染）
5. **跨平台**：一套代码，打包 Windows / macOS / Linux 三大平台
6. **企业级**：基于 electron-egg v5 成熟框架，已在多行业落地
7. **本地向量数据库**：zvec 向量扩展 + MiniSearch 关键字，无需外部服务

---

## 📝 十一、Diting AI 产品矩阵

Diting AI 是一个完整的 AI 产品套件：

| 项目 | 说明 |
|------|------|
| **Diting_AI_Desktop** | Electron 桌面客户端（本项目） |
| **Diting_AI_Web** | Web 前端应用 |
| **Diting_AI_Api** | 后端 API 服务（含 Neo4j GraphRAG） |
| **Diting_AI_Index** | 搜索引擎/索引服务 |

---

> **文档生成时间**：2025-08-02
> **框架版本**：electron-egg v5.0.0
> **Node.js 最低版本**：v20
