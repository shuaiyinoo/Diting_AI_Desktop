# Diting AI Desktop 中文说明

> 同步维护的英文文档见 [README.md](./README.md)，内容更完整。

## 项目简介

Diting AI Desktop（谛听 AI 桌面客户端）是一款基于 [electron-egg v5](https://github.com/dromara/electron-egg) 框架构建的企业级跨平台桌面 AI 助手应用。

它融合了本地文件管理、RAG 知识库问答、Pi Agent 智能代理、LLM 多轮对话等 AI 核心能力，面向 Windows / macOS / Linux 三大平台，旨在为用户提供高效、安全、本地优先的桌面 AI 工作台。

> 本项目受 [Proma](https://github.com/ErlichLiu/Proma) 开源项目启发，Agent 模式的 UI 设计与交互风格参考了 Proma 的优秀实践，特此感谢。

## 核心能力

- **文件管理**：授权文件夹扫描、文件同步、Office/PDF 在线预览、RAG 自动向量化
- **RAG 知识库问答**：文档解析 → 智能切片 → 本地向量嵌入 → 混合检索（向量 + 关键字）→ LLM 生成 → 引用追踪
- **Agent 模式**：基于 Pi Agent SDK 的智能代理，支持工作区隔离、Skills 技能系统、MCP 工具协议、权限模式、流式输出
- **多轮对话**：多模型对话、流式 SSE 输出、上下文记忆、工具模式切换
- **LLM 模型管理**：多模型配置、连接测试、参数调优、用量统计与费用估算
- **本地优先**：所有 AI 能力（嵌入、检索、存储）本地执行，数据不上传云端
- **跨平台**：一套代码打包 Windows / macOS / Linux

## 下载安装

从 [GitHub Releases](https://github.com/shuaiyinoo/Diting_AI_Desktop/releases) 下载对应平台安装包。

## 从源码构建

```bash
# 克隆仓库
git clone https://github.com/shuaiyinoo/Diting_AI_Desktop.git
cd Diting_AI_Desktop

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

## 常用命令

```bash
# 开发
npm run dev               # 完整开发（frontend + electron）
npm run dev-frontend      # 仅前端开发（Vite dev server :8080）
npm run dev-electron      # 仅 Electron 开发

# 构建
npm run build             # 构建 frontend + electron + 加密
npm run build-frontend    # Vite 构建前端
npm run build-electron    # esbuild 打包 Electron

# 平台打包
npm run build-m           # macOS ARM64
npm run build-m-x86       # macOS x64
npm run build-w           # Windows 64-bit
npm run build-l           # Linux
npm run build-all         # 一键打包所有平台
```

## 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 桌面框架 | Electron + electron-egg v5 | 39.x |
| 前端框架 | Vue 3 + Vite | 3.5 + 7.x |
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
| MCP | @modelcontextprotocol/sdk | 1.30.0 |
| 构建工具 | esbuild + electron-builder | — |

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

## 贡献

欢迎修 Bug、补文档、加测试、完善体验。

提交 PR 前建议先确认：

- 使用 `npm run dev` 能正常启动
- 状态管理使用 Pinia
- 尽量保持本地优先，优先使用 SQLite 和配置文件
- UI 组件推荐使用 Ant Design Vue
- 注释和日志采用中文，保留必要的专业术语

## 许可证

本项目基于 [Apache License 2.0](./LICENSE) 开源协议发布。

Copyright 2026 Diting AI

您可以自由使用、修改和分发本软件，但需遵守 Apache 2.0 协议的相关条款。

## 链接

- [完整文档（英文）](./README.md)
- [用户教程](./tutorial/tutorial.md)
- [AI 编码指南](./AGENTS.md)
- [产品路线图](./docs/product-thinking.md)
- [发布说明](./release-notes/)
