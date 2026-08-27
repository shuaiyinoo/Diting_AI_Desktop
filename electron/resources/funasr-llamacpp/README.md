# FunASR llama.cpp runtime 预编译二进制

本目录存放各平台预编译的 FunASR llama.cpp runtime 二进制文件（v0.1.9）。

## 目录结构

```
funasr-llamacpp/
  ├── macos-arm64/       # macOS Apple Silicon
  ├── windows-x64/       # Windows x64
  └── linux-x64/         # Linux x64
```

每个平台目录包含以下二进制：

| 文件名 | 用途 |
|--------|------|
| `llama-funasr-sensevoice` | SenseVoice 模型专用转写 |
| `llama-funasr-paraformer` | Paraformer 模型专用转写 |
| `llama-funasr-cli` | Fun-ASR-Nano 通用 CLI（需 --enc encoder + -m LLM） |
| `llama-funasr-encoder` | Fun-ASR-Nano 编码器独立工具（调试用） |
| `llama-funasr-embd` | 嵌入模型工具（调试用） |
| `llama-funasr-vad` | VAD 独立工具 |
| `download-funasr-model.sh` | 官方模型下载脚本 |

## 二进制来源

从 QwenAudio/Fun-ASR GitHub Release 下载：

```
https://github.com/QwenAudio/Fun-ASR/releases/tag/runtime-llamacpp-v0.1.9
```

## CLI 调用方式

`funasr-transcribe-service.ts` 通过 `execFile()` 调用对应二进制：

```bash
# SenseVoice（专用二进制，单个模型文件）
llama-funasr-sensevoice -m sensevoice-small-f16.gguf -a audio.wav --vad fsmn-vad.gguf

# Paraformer（专用二进制，单个模型文件）
llama-funasr-paraformer -m paraformer-f16.gguf -a audio.wav --vad fsmn-vad.gguf

# Fun-ASR-Nano（通用 CLI，需要 encoder + LLM 两个模型文件）
llama-funasr-cli --enc funasr-encoder-f16.gguf -m qwen3-0.6b-q8_0.gguf -a audio.wav --vad fsmn-vad.gguf
```

### Fun-ASR-Nano 模型架构

Fun-ASR-Nano 是 LLM 架构的 ASR 模型，由两部分组成：
- **Encoder**：SenseVoice SAN-M 编码器（70 层），负责音频特征提取
- **LLM**：Qwen3-0.6B 语言模型，负责文本生成

两个 GGUF 文件均来自 `FunAudioLLM/Fun-ASR-Nano-GGUF` 仓库：
- `funasr-encoder-f16.gguf`（~469 MB）
- `qwen3-0.6b-q8_0.gguf`（~805 MB）或 `qwen3-0.6b-q4km.gguf`（~484 MB）

VAD 模型 `fsmn-vad.gguf` 来自 `FunAudioLLM/fsmn-vad-GGUF`，所有 FunASR 模型共用。

CLI 从 stdout 输出转写文本，服务读取后推送前端。
