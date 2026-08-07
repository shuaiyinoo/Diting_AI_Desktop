<template>
  <div class="qa-page">
    <!-- 左侧：历史会话列表 -->
    <div class="qa-sidebar">
      <div class="qa-sidebar__header">
        <span class="qa-sidebar__title">历史会话</span>
        <a-button type="primary" size="small" @click="onNewChat" :disabled="asking">
          <template #icon><PlusOutlined /></template>
          新对话
        </a-button>
      </div>
      <div class="qa-sidebar__folder">
        <a-select
          v-model:value="selectedFolderId"
          style="width: 100%"
          placeholder="选择授权文件夹"
          :options="folderOptions"
          @change="onFolderChange"
        />
      </div>
      <div class="qa-sidebar__list">
        <a-spin :spinning="historyLoading">
          <div v-if="historyList.length === 0" class="qa-sidebar__empty">
            <a-empty description="暂无历史记录" :image="Empty.PRESENTED_IMAGE_SIMPLE" />
          </div>
          <div
            v-for="item in historyList"
            :key="item.id"
            class="history-item"
            :class="{ 'history-item--active': activeRecordId === item.id }"
            @click="onSelectHistory(item)"
          >
            <div class="history-item__question" :title="item.question">
              {{ item.question }}
            </div>
            <div class="history-item__meta">
              <a-tag :color="item.answered === 1 ? 'green' : 'default'" class="history-item__tag">
                {{ item.answered === 1 ? '已回答' : '未回答' }}
              </a-tag>
              <span class="history-item__time">{{ formatDateTime(item.created_at) }}</span>
            </div>
          </div>
        </a-spin>
      </div>
    </div>

    <!-- 右侧：对话主区域 -->
    <div class="qa-main">
      <!-- 消息区域 -->
      <div class="qa-messages" ref="messagesRef">
        <div v-if="messages.length === 0" class="qa-empty-hero">
          <div class="qa-empty-hero__icon">
            <MessageOutlined />
          </div>
          <h2 class="qa-empty-hero__title">知识库问答</h2>
          <p class="qa-empty-hero__desc" v-if="selectedFolderId">
            基于已向量化的文件夹内容进行智能问答，回答仅依据检索到的证据。
          </p>
          <p class="qa-empty-hero__desc" v-else>
            请先在左侧选择一个授权文件夹。
          </p>
          <div class="qa-empty-hero__starters" v-if="selectedFolderId">
            <a-button
              v-for="prompt in starterPrompts"
              :key="prompt"
              class="qa-empty-hero__starter"
              @click="onStarterPick(prompt)"
            >
              {{ prompt }}
            </a-button>
          </div>
        </div>

        <div
          v-for="msg in messages"
          :key="msg.id"
          class="message"
          :class="`message--${msg.role}`"
        >
          <div class="message__avatar">
            <a-avatar
              :style="{ background: msg.role === 'user' ? '#1677ff' : '#52c41a' }"
            >
              <template #icon>
                <UserOutlined v-if="msg.role === 'user'" />
                <RobotOutlined v-else />
              </template>
            </a-avatar>
          </div>
          <div class="message__body">
            <div class="message__role">
              {{ msg.role === 'user' ? '我' : '助手' }}
              <a-tag
                v-if="msg.role === 'assistant' && msg.evidenceLevel"
                :color="evidenceLevelColor(msg.evidenceLevel)"
                size="small"
                class="message__evidence-tag"
              >
                {{ evidenceLevelText(msg.evidenceLevel) }}
              </a-tag>
            </div>
            <div class="message__content">
              <!-- 用户消息 -->
              <template v-if="msg.role === 'user'">
                <div class="message__text">{{ msg.content }}</div>
              </template>

              <!-- 助手消息 -->
              <template v-else>
                <!-- 加载中 -->
                <div v-if="msg.pending && !msg.content" class="message__loading">
                  <a-spin size="small" />
                  <span class="message__loading-text">正在检索证据并生成回答...</span>
                </div>

                <!-- 错误提示 -->
                <a-alert
                  v-else-if="msg.reasonCode && !msg.content"
                  :message="msg.reasonMessage || '回答失败'"
                  type="warning"
                  show-icon
                  class="message__alert"
                />

                <!-- 回答正文（markstream-vue 流式 Markdown 渲染） -->
                <div v-if="msg.content">
                  <MarkdownRender
                    mode="chat"
                    :content="msg.content"
                    :final="!msg.pending"
                    :fade="false"
                    smooth-streaming="auto"
                    :render-code-blocks-as-pre="false"
                    :is-dark="isDark" code-block-dark-theme="vitesse-dark" code-block-light-theme="vitesse-light" :themes="['vitesse-dark', 'vitesse-light']"
                  />
                </div>

                <!-- 引用来源（参考 ArgusRAG CitationRail 样式） -->
                <div v-if="msg.citations && msg.citations.length > 0" class="citation-rail">
                  <div class="citation-rail__head">
                    <span class="citation-rail__eyebrow">Evidence Chain</span>
                    <span class="citation-rail__title">
                      <LinkOutlined />
                      <strong>引用证据</strong>
                      <span class="citation-rail__count">{{ msg.citations.length }}</span>
                    </span>
                  </div>
                  <div class="citation-rail__scroll">
                    <button
                      v-for="(cite, idx) in msg.citations"
                      :key="`${cite.fileItemId ?? 'x'}-${cite.chunkId ?? idx}`"
                      class="citation-rail__card"
                      type="button"
                      :disabled="cite.fileItemId === null || cite.fileItemId === undefined"
                      @click="onCitationClick(cite)"
                    >
                      <div class="citation-rail__card-head">
                        <span class="citation-rail__index">{{ String(idx + 1).padStart(2, '0') }}</span>
                        <span class="citation-rail__type" :class="citationIconClass(cite.fileName)">
                          {{ citationFileIcon(cite.fileName) }}
                        </span>
                        <span class="citation-rail__score">{{ formatScore(cite.score) }}</span>
                      </div>
                      <h4 class="citation-rail__filename" :title="cite.fileName">
                        {{ cite.fileName }}
                      </h4>
                      <p v-if="cite.snippet" class="citation-rail__snippet">
                        {{ cite.snippet }}
                      </p>
                      <p v-else class="citation-rail__snippet citation-rail__snippet--muted">
                        （未提供摘录片段）
                      </p>
                      <div class="citation-rail__card-foot">
                        <div class="citation-rail__meter">
                          <span class="citation-rail__meter-fill" :style="{ width: `${Math.min(100, (cite.score || 0) * 100)}%` }" />
                        </div>
                        <span v-if="cite.chunkIndex !== null && cite.chunkIndex !== undefined" class="citation-rail__chunk">
                          #chunk {{ cite.chunkIndex }}
                        </span>
                        <span v-if="cite.fileItemId !== null && cite.fileItemId !== undefined" class="citation-rail__view-hint">
                          点击查看 →
                        </span>
                      </div>
                    </button>
                  </div>
                </div>

                <!-- 用量信息 -->
                <div v-if="msg.usage && !msg.pending" class="message__usage">
                  <span>输入 {{ msg.usage.promptTokens }} token</span>
                  <span>输出 {{ msg.usage.completionTokens }} token</span>
                  <span>共 {{ msg.usage.totalTokens }} token</span>
                  <span v-if="msg.usage.estimated" class="message__usage-est">（估算）</span>
                  <span>耗时 {{ Math.round(msg.usage.latencyMs) }}ms</span>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>

      <!-- 输入区域 -->
      <div class="qa-composer">
        <a-textarea
          v-model:value="inputText"
          :placeholder="composerPlaceholder"
          :auto-size="{ minRows: 1, maxRows: 6 }"
          :disabled="asking || !selectedFolderId"
          class="qa-composer__input"
          @keydown="onKeydown"
        />
        <div class="qa-composer__actions">
          <span class="qa-composer__hint">
            Enter 发送 · Shift+Enter 换行
          </span>
          <a-button
            type="primary"
            :loading="asking"
            :disabled="!inputText.trim() || !selectedFolderId"
            @click="onAsk"
          >
            <template #icon><SendOutlined /></template>
            发送
          </a-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted, onUnmounted, nextTick } from 'vue';
import { message, Empty } from 'ant-design-vue';
import {
  PlusOutlined,
  UserOutlined,
  RobotOutlined,
  MessageOutlined,
  LinkOutlined,
  SendOutlined,
} from '@ant-design/icons-vue';
import { ipcApiRoute } from '@/api';
import { ipc } from '@/utils/ipcRenderer';
import { isDark } from '@/theme';
import MarkdownRender from 'markstream-vue';

// ========== HTTP 服务器地址（用于 SSE 流式通信） ==========
const httpServerUrl = ref('');

async function loadHttpServerUrl() {
  try {
    const data = await ipc.invoke(ipcApiRoute.framework.checkHttpServer);
    if (data && data.enable && data.server) {
      httpServerUrl.value = data.server;
    } else {
      // 回退到默认地址
      httpServerUrl.value = 'http://127.0.0.1:7071';
    }
  } catch (err) {
    console.warn('[qa] 获取 HTTP 服务器地址失败，使用默认地址:', err);
    httpServerUrl.value = 'http://127.0.0.1:7071';
  }
}

// ========== 文件夹选择 ==========
const folderList = ref([]);
const selectedFolderId = ref(null);

const folderOptions = computed(() => {
  return folderList.value.map((f) => ({
    value: f.id,
    label: f.path,
  }));
});

async function loadFolderList() {
  try {
    const data = await ipc.invoke(ipcApiRoute.file.getFolderList);
    folderList.value = data || [];
    if (folderList.value.length > 0 && !selectedFolderId.value) {
      selectedFolderId.value = folderList.value[0].id;
      await loadHistory();
    }
  } catch (err) {
    console.error('[qa] 加载文件夹列表失败:', err);
    message.error('加载文件夹列表失败');
  }
}

function onFolderChange() {
  messages.value = [];
  activeRecordId.value = null;
  loadHistory();
}

// ========== 历史记录 ==========
const historyList = ref([]);
const historyLoading = ref(false);
const activeRecordId = ref(null);

async function loadHistory() {
  if (!selectedFolderId.value) {
    historyList.value = [];
    return;
  }
  historyLoading.value = true;
  try {
    const res = await ipc.invoke(ipcApiRoute.qa.recordOperation, {
      action: 'list',
      folderId: selectedFolderId.value,
      limit: 30,
      offset: 0,
    });
    if (res.code === 0) {
      historyList.value = res.data || [];
    } else {
      message.error(res.message || '加载历史记录失败');
    }
  } catch (err) {
    console.error('[qa] 加载历史记录失败:', err);
    message.error('加载历史记录失败');
  } finally {
    historyLoading.value = false;
  }
}

async function onSelectHistory(record) {
  if (!record || !record.id) return;
  activeRecordId.value = record.id;
  try {
    const res = await ipc.invoke(ipcApiRoute.qa.recordOperation, {
      action: 'get',
      id: record.id,
    });
    if (res.code === 0 && res.data) {
      const detail = res.data;
      const citations = detail.citations_json ? safeParseJSON(detail.citations_json, []) : [];
      messages.value = [
        {
          id: `hist-q-${detail.id}`,
          role: 'user',
          content: detail.question,
        },
        {
          id: `hist-a-${detail.id}`,
          role: 'assistant',
          content: detail.answer || '',
          pending: false,
          answered: detail.answered === 1,
          reasonCode: detail.reason_code,
          reasonMessage: detail.reason_message,
          evidenceLevel: detail.evidence_level,
          citations,
          usage: {
            promptTokens: detail.prompt_tokens,
            completionTokens: detail.completion_tokens,
            totalTokens: detail.total_tokens,
            estimated: detail.is_estimated === 1,
            latencyMs: detail.latency_ms,
          },
        },
      ];
      scrollToBottom();
    } else {
      message.error(res?.message || '加载记录详情失败');
    }
  } catch (err) {
    console.error('[qa] 加载记录详情失败:', err);
    message.error('加载记录详情失败');
  }
}

function onNewChat() {
  messages.value = [];
  activeRecordId.value = null;
  inputText.value = '';
}

// ========== 问答流 ==========
const messages = ref([]);
const inputText = ref('');
const asking = ref(false);
const messagesRef = ref(null);
let messageUid = 0;

const composerPlaceholder = computed(() => {
  if (!selectedFolderId.value) return '请先选择授权文件夹';
  return '输入你的问题，基于该文件夹的知识库进行问答...';
});

const starterPrompts = [
  '这个文件夹包含哪些主要内容？',
  '总结一下关键信息',
  '有哪些重要的数据或结论？',
];

function onStarterPick(prompt) {
  inputText.value = prompt;
}

function onKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    onAsk();
  }
}

async function onAsk() {
  const text = inputText.value.trim();
  if (!text || asking.value || !selectedFolderId.value) return;

  // 添加用户消息
  const userMsg = {
    id: `msg-${++messageUid}`,
    role: 'user',
    content: text,
  };
  // 添加待回复的助手消息（用 reactive 包裹，确保流式 token 更新能触发视图重渲染）
  const assistantMsg = reactive({
    id: `msg-${++messageUid}`,
    role: 'assistant',
    content: '',
    pending: true,
    citations: [],
    evidenceLevel: null,
    usage: null,
  });
  messages.value.push(userMsg, assistantMsg);
  inputText.value = '';
  asking.value = true;

  // 构造 SSE 请求 URL
  const url = `${httpServerUrl.value}/${ipcApiRoute.qa.streamAsk}`;
  // 使用 AbortController 支持取消
  const controller = new AbortController();

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        folderId: selectedFolderId.value,
        question: text,
      }),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      const errText = await response.text().catch(() => '流式问答请求失败');
      throw new Error(errText || `HTTP ${response.status}`);
    }

    // 使用 ReadableStream reader 逐 chunk 解析 SSE 事件
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      // SSE 事件以 \n\n 分隔
      let separatorIndex = buffer.indexOf('\n\n');
      while (separatorIndex >= 0) {
        const rawEvent = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        dispatchSseEvent(rawEvent, assistantMsg);
        separatorIndex = buffer.indexOf('\n\n');
      }
      scrollToBottom();
    }

    // 流结束，确保 pending 状态清除
    assistantMsg.pending = false;
    asking.value = false;
    // 刷新历史列表
    loadHistory();
    scrollToBottom();
  } catch (err) {
    assistantMsg.pending = false;
    assistantMsg.reasonCode = 'REQUEST_FAILED';
    assistantMsg.reasonMessage = err?.message || String(err);
    asking.value = false;
    if (err?.name !== 'AbortError') {
      message.error('请求异常: ' + assistantMsg.reasonMessage);
    }
  }

  scrollToBottom();
}

/**
 * 解析并分发单条 SSE 事件。
 *
 * SSE 原始格式：
 *   event: token
 *   data: 文本片段
 *
 *   event: citations
 *   data: [{...}]
 *
 *   event: complete
 *   data: {"answer":"...","usage":{...},"evidenceLevel":"..."}
 *
 *   event: error
 *   data: {"message":"..."}
 */
function dispatchSseEvent(rawEvent, assistantMsg) {
  const lines = rawEvent.split(/\r?\n/);
  let eventName = '';
  const dataLines = [];

  for (const line of lines) {
    if (line.startsWith('event:')) {
      eventName = line.slice(6).trim();
      continue;
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (dataLines.length === 0) return;
  const rawData = dataLines.join('\n');

  switch (eventName) {
    case 'token':
      // 直接拼接 token 文本
      assistantMsg.content += rawData;
      break;
    case 'citations':
      try {
        assistantMsg.citations = JSON.parse(rawData);
      } catch {
        assistantMsg.citations = [];
      }
      break;
    case 'evidence-overview':
      // 证据概览可用于展示证据等级
      try {
        const overview = JSON.parse(rawData);
        if (overview) {
          // 简单映射：文档数 >= 3 为充分，>=1 为部分，否则为弱
          assistantMsg.evidenceLevel = overview.documentCount >= 3 ? 'SUFFICIENT' : overview.documentCount >= 1 ? 'PARTIAL' : 'WEAK';
        }
      } catch {
        // 忽略解析失败
      }
      break;
    case 'complete':
      try {
        const data = JSON.parse(rawData);
        if (data.answer) {
          assistantMsg.content = data.answer;
        }
        if (data.usage) {
          assistantMsg.usage = data.usage;
        }
        if (data.evidenceLevel) {
          assistantMsg.evidenceLevel = data.evidenceLevel;
        }
        assistantMsg.answered = true;
      } catch {
        // 忽略解析失败
      }
      break;
    case 'error':
      try {
        const parsed = JSON.parse(rawData);
        assistantMsg.reasonCode = 'STREAM_ERROR';
        assistantMsg.reasonMessage = parsed.message || '流式问答失败';
      } catch {
        assistantMsg.reasonCode = 'STREAM_ERROR';
        assistantMsg.reasonMessage = rawData || '流式问答失败';
      }
      message.error(assistantMsg.reasonMessage);
      break;
    default:
      break;
  }
}

function scrollToBottom() {
  nextTick(() => {
    const el = messagesRef.value;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  });
}

// ========== 辅助函数 ==========
function evidenceLevelColor(level) {
  const map = {
    SUFFICIENT: 'green',
    PARTIAL: 'blue',
    WEAK: 'orange',
    NONE: 'red',
  };
  return map[level] || 'default';
}

function evidenceLevelText(level) {
  const map = {
    SUFFICIENT: '证据充分',
    PARTIAL: '部分证据',
    WEAK: '证据有限',
    NONE: '无证据',
  };
  return map[level] || level;
}

function formatDateTime(isoStr) {
  if (!isoStr) return '-';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function safeParseJSON(str, fallback) {
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

// ========== 引用证据卡片辅助函数 ==========

/** 格式化评分为百分比 */
function formatScore(score) {
  if (!Number.isFinite(score)) return '--';
  return (score * 100).toFixed(1) + '%';
}

/** 根据文件扩展名返回图标文字 */
function citationFileIcon(fileName) {
  const ext = (fileName || '').toLowerCase().split('.').pop() ?? '';
  if (ext === 'pdf') return 'PDF';
  if (ext === 'md') return 'MD';
  if (ext === 'docx' || ext === 'doc') return 'DOC';
  if (ext === 'xlsx' || ext === 'xls') return 'XLS';
  if (ext === 'pptx' || ext === 'ppt') return 'PPT';
  if (ext === 'txt') return 'TXT';
  if (ext === 'html' || ext === 'htm') return 'WEB';
  return '--';
}

/** 根据文件扩展名返回图标样式类 */
function citationIconClass(fileName) {
  const ext = (fileName || '').toLowerCase().split('.').pop() ?? '';
  if (ext === 'pdf') return 'citation-rail__type--pdf';
  if (ext === 'md') return 'citation-rail__type--md';
  if (ext === 'docx' || ext === 'doc') return 'citation-rail__type--doc';
  if (ext === 'xlsx' || ext === 'xls') return 'citation-rail__type--xls';
  if (ext === 'pptx' || ext === 'ppt') return 'citation-rail__type--ppt';
  return 'citation-rail__type--txt';
}

/**
 * 点击引用卡片，在新窗口中打开文件查看器。
 *
 * 复用文件模块的查看逻辑：通过 os.createWindow 创建新窗口，
 * 窗口内容为 #/special/file-viewer?fileItemId=<id>
 */
function onCitationClick(cite) {
  if (cite.fileItemId === null || cite.fileItemId === undefined) {
    message.warning('该引用无关联文件，无法查看');
    return;
  }
  const windowName = `file-viewer-${cite.fileItemId}`;
  const content = `#/special/file-viewer?fileItemId=${cite.fileItemId}`;
  ipc.invoke(ipcApiRoute.os.createWindow, {
    type: 'vue',
    content,
    windowName,
    windowTitle: `文件查看 - ${cite.fileName}`,
    width: 1200,
    height: 800,
    center: true,
  }).catch((err) => {
    console.error('[qa] 打开文件查看窗口失败:', err);
    message.error('打开文件查看窗口失败');
  });
}

// ========== 生命周期 ==========
onMounted(async () => {
  await loadHttpServerUrl();
  loadFolderList();
});

onUnmounted(() => {
  // SSE 流式通信基于 fetch，组件卸载时无需清理 IPC 监听器
});
</script>

<style lang="less" scoped>
.qa-page {
  display: flex;
  height: 100%;
  background: #f5f6f8;
  overflow: hidden;
}

// ========== 左侧边栏 ==========
.qa-sidebar {
  width: 280px;
  flex-shrink: 0;
  background: #fff;
  border-right: 1px solid #e8e8e8;
  display: flex;
  flex-direction: column;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    border-bottom: 1px solid #f0f0f0;
  }

  &__title {
    font-size: 14px;
    font-weight: 600;
    color: #2c3e50;
  }

  &__folder {
    padding: 10px 14px;
    border-bottom: 1px solid #f0f0f0;
  }

  &__list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }

  &__empty {
    padding: 40px 0;
    display: flex;
    justify-content: center;
  }
}

.history-item {
  padding: 10px 12px;
  margin-bottom: 6px;
  border-radius: 8px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: #f5f7fa;
    border-color: #e8e8e8;
  }

  &--active {
    background: rgba(22, 119, 255, 0.06);
    border-color: #1677ff;
  }

  &__question {
    font-size: 13px;
    font-weight: 500;
    color: #2c3e50;
    line-height: 1.4;
    margin-bottom: 6px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    word-break: break-all;
  }

  &__meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  &__tag {
    margin: 0;
    font-size: 11px;
  }

  &__time {
    font-size: 11px;
    color: #999;
  }
}

// ========== 右侧主区域 ==========
.qa-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: #fff;
}

// ========== 消息区域 ==========
.qa-messages {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.qa-empty-hero {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 40px 20px;

  &__icon {
    font-size: 48px;
    color: #1677ff;
    margin-bottom: 16px;
  }

  &__title {
    font-size: 22px;
    font-weight: 700;
    color: #2c3e50;
    margin: 0 0 8px 0;
  }

  &__desc {
    font-size: 14px;
    color: #888;
    margin: 0 0 24px 0;
    max-width: 480px;
  }

  &__starters {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
    max-width: 600px;
  }

  &__starter {
    border-radius: 16px;
  }
}

// ========== 单条消息 ==========
.message {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
  max-width: 900px;

  &__avatar {
    flex-shrink: 0;
  }

  &__body {
    flex: 1;
    min-width: 0;
  }

  &__role {
    font-size: 13px;
    font-weight: 600;
    color: #2c3e50;
    margin-bottom: 6px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__evidence-tag {
    font-size: 11px;
    margin: 0;
  }

  &__content {
    font-size: 14px;
    color: #333;
    line-height: 1.6;
  }

  &__text {
    white-space: pre-wrap;
    word-break: break-word;
  }

  &__text--answer {
    background: #f6f8fa;
    padding: 12px 14px;
    border-radius: 8px;
    border: 1px solid #e8e8e8;
    // markstream-vue 渲染结构化 HTML，需要 normal 排版（覆盖父级 pre-wrap）
    white-space: normal;
    // 覆盖 #app 的 text-align: center，避免 Markdown 内容居中
    text-align: left;
  }

  &__loading {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #888;
    font-size: 13px;
    padding: 12px 14px;
    background: #f6f8fa;
    border-radius: 8px;
    border: 1px solid #e8e8e8;
  }

  &__alert {
    margin-top: 4px;
  }

  &__usage {
    margin-top: 8px;
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    font-size: 12px;
    color: #999;

    &-est {
      color: #faad14;
    }
  }
}

// ========== 引用证据卡片（参考 ArgusRAG CitationRail） ==========
.citation-rail {
  margin-top: 14px;
  padding: 14px 0 4px;
  border-top: 1px dashed rgba(15, 23, 42, 0.1);

  &__head {
    display: flex;
    align-items: baseline;
    gap: 12px;
    margin-bottom: 10px;
    padding-left: 2px;
  }

  &__eyebrow {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: #1677ff;
  }

  &__title {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: #666;

    :deep(svg) {
      color: #1677ff;
    }

    strong {
      font-weight: 600;
      color: #2c3e50;
    }
  }

  &__count {
    font-size: 12px;
    font-weight: 600;
    color: #94a3b8;
    background: rgba(148, 163, 184, 0.14);
    padding: 1px 7px;
    border-radius: 100px;
  }

  &__scroll {
    display: flex;
    gap: 10px;
    overflow-x: auto;
    padding: 4px 2px 8px;
    scrollbar-width: thin;

    &::-webkit-scrollbar {
      height: 6px;
    }

    &::-webkit-scrollbar-thumb {
      background: #e8e8e8;
      border-radius: 3px;
    }
  }

  &__card {
    flex-shrink: 0;
    width: 260px;
    padding: 12px 14px;
    background: #fff;
    border: 1px solid #e8e8e8;
    border-radius: 12px;
    text-align: left;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
    position: relative;
    overflow: hidden;

    &::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      width: 2px;
      height: 100%;
      background: linear-gradient(to bottom, #1677ff, #4096ff);
      opacity: 0;
      transition: opacity 0.2s ease;
    }

    &:hover:not(:disabled) {
      transform: translateY(-2px);
      border-color: #1677ff;
      box-shadow: 0 8px 20px rgba(22, 119, 255, 0.12);
    }

    &:hover:not(:disabled)::before {
      opacity: 1;
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.65;
    }
  }

  &__card-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  &__index {
    font-size: 12px;
    font-weight: 700;
    color: #94a3b8;
    letter-spacing: 0.05em;
  }

  &__type {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 2px 7px;
    border-radius: 4px;
  }

  &__type--pdf {
    background: rgba(239, 68, 68, 0.1);
    color: #dc2626;
  }

  &__type--md {
    background: rgba(22, 119, 255, 0.1);
    color: #1677ff;
  }

  &__type--doc {
    background: rgba(59, 130, 246, 0.1);
    color: #2563eb;
  }

  &__type--xls {
    background: rgba(34, 197, 94, 0.1);
    color: #16a34a;
  }

  &__type--ppt {
    background: rgba(249, 115, 22, 0.1);
    color: #ea580c;
  }

  &__type--txt {
    background: rgba(148, 163, 184, 0.15);
    color: #64748b;
  }

  &__score {
    margin-left: auto;
    font-size: 12px;
    font-weight: 600;
    color: #0d9488;
  }

  &__filename {
    margin: 0 0 6px;
    font-size: 13px;
    font-weight: 600;
    color: #2c3e50;
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  &__snippet {
    margin: 0 0 10px;
    font-size: 12px;
    color: #666;
    line-height: 1.5;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
  }

  &__snippet--muted {
    color: #aaa;
    font-style: italic;
  }

  &__card-foot {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  &__meter {
    flex: 1;
    height: 3px;
    background: #f1f5f9;
    border-radius: 2px;
    overflow: hidden;
  }

  &__meter-fill {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, #1677ff, #4096ff);
    border-radius: 2px;
    transition: width 0.4s ease;
  }

  &__chunk {
    font-size: 11px;
    color: #94a3b8;
  }

  &__view-hint {
    font-size: 11px;
    color: #1677ff;
    font-weight: 500;
    white-space: nowrap;
  }
}

// ========== 输入区域 ==========
.qa-composer {
  border-top: 1px solid #e8e8e8;
  padding: 12px 16px;
  background: #fff;

  &__input {
    border-radius: 8px;
  }

  &__actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 8px;
  }

  &__hint {
    font-size: 12px;
    color: #999;
  }
}
</style>
