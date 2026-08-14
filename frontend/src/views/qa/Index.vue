<template>
  <div class="flex h-full overflow-hidden bg-secondary/30">
    <!-- 左侧：历史会话列表 -->
    <div class="flex w-[280px] shrink-0 flex-col border-r border-border bg-card">
      <div class="flex shrink-0 items-center justify-between border-b border-border/50 px-3.5 py-3">
        <span class="text-sm font-semibold text-foreground">历史会话</span>
        <Button size="sm" @click="onNewChat" :disabled="asking">
          <Plus class="mr-1 size-3.5" />
          新对话
        </Button>
      </div>
      <div class="shrink-0 border-b border-border/50 px-3.5 py-2.5">
        <Select v-model="selectedFolderId" @update:model-value="onFolderChange">
          <SelectTrigger class="w-full">
            <SelectValue placeholder="选择授权文件夹" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="opt in folderOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto p-2">
        <div v-if="historyLoading" class="flex items-center justify-center py-8">
          <Spinner class="size-5 text-muted-foreground" />
        </div>
        <div v-if="!historyLoading && historyList.length === 0" class="flex justify-center py-10">
          <div class="py-8 text-center text-sm text-muted-foreground">暂无历史记录</div>
        </div>
          <div
            v-for="item in historyList"
            :key="item.id"
            class="mb-1.5 cursor-pointer rounded-lg border border-transparent px-3 py-2.5 transition-all hover:bg-secondary/60 hover:border-border"
            :class="activeRecordId === item.id ? 'border-primary bg-primary/[0.06]' : ''"
            @click="onSelectHistory(item)"
          >
            <div class="mb-1.5 line-clamp-2 break-all text-[13px] font-medium leading-snug text-foreground" :title="item.question">
              {{ item.question }}
            </div>
            <div class="flex items-center justify-between">
              <Badge :variant="item.answered === 1 ? 'default' : 'secondary'" class="m-0 text-[11px]">
                {{ item.answered === 1 ? '已回答' : '未回答' }}
              </Badge>
              <span class="text-[11px] text-muted-foreground">{{ formatDateTime(item.created_at) }}</span>
            </div>
          </div>
      </div>
    </div>

    <!-- 右侧：对话主区域 -->
    <div class="flex min-w-0 flex-1 flex-col bg-card">
      <!-- 消息区域 -->
      <div class="min-h-0 flex-1 overflow-y-auto p-6" ref="messagesRef">
        <div v-if="messages.length === 0" class="flex h-full flex-col items-center justify-center px-5 py-10 text-center">
          <div class="mb-4 text-primary">
            <MessageSquare class="size-10" />
          </div>
          <h2 class="mb-2 text-[22px] font-bold text-foreground">知识库问答</h2>
          <p class="m-0 mb-6 max-w-[480px] text-sm text-muted-foreground" v-if="selectedFolderId">
            基于已向量化的文件夹内容进行智能问答，回答仅依据检索到的证据。
          </p>
          <p class="m-0 mb-6 max-w-[480px] text-sm text-muted-foreground" v-else>
            请先在左侧选择一个授权文件夹。
          </p>
          <div class="flex max-w-[600px] flex-wrap justify-center gap-2" v-if="selectedFolderId">
            <Button
              v-for="prompt in starterPrompts"
              :key="prompt"
              variant="outline"
              class="rounded-2xl"
              @click="onStarterPick(prompt)"
            >
              {{ prompt }}
            </Button>
          </div>
        </div>

        <div
          v-for="msg in messages"
          :key="msg.id"
          class="mb-6 flex max-w-[900px] gap-3"
        >
          <div class="shrink-0">
            <div
              class="flex size-8 items-center justify-center rounded-full text-white"
              :style="{ background: msg.role === 'user' ? '#1677ff' : '#52c41a' }"
            >
              <User v-if="msg.role === 'user'" class="size-4" />
              <Bot v-else class="size-4" />
            </div>
          </div>
          <div class="min-w-0 flex-1">
            <div class="mb-1.5 flex items-center gap-2 text-[13px] font-semibold text-foreground">
              {{ msg.role === 'user' ? '我' : '助手' }}
              <Badge
                v-if="msg.role === 'assistant' && msg.evidenceLevel"
                :variant="evidenceLevelColor(msg.evidenceLevel) === 'green' ? 'default' : 'secondary'"
                class="m-0 text-[11px]"
              >
                {{ evidenceLevelText(msg.evidenceLevel) }}
              </Badge>
            </div>
            <div class="text-sm leading-relaxed text-foreground">
              <!-- 用户消息 -->
              <template v-if="msg.role === 'user'">
                <div class="whitespace-pre-wrap break-words">{{ msg.content }}</div>
              </template>

              <!-- 助手消息 -->
              <template v-else>
                <!-- 加载中 -->
                <div v-if="msg.pending && !msg.content" class="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3.5 py-3 text-[13px] text-muted-foreground">
                  <Spinner class="size-4" />
                  <span>正在检索证据并生成回答...</span>
                </div>

                <!-- 错误提示 -->
                <div
                  v-else-if="msg.reasonCode && !msg.content"
                  class="mt-1 rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800 dark:border-yellow-900 dark:bg-yellow-950 dark:text-yellow-200"
                >
                  {{ msg.reasonMessage || '回答失败' }}
                </div>

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
                <div v-if="msg.citations && msg.citations.length > 0" class="mt-3.5 border-t border-dashed border-foreground/10 pt-3.5 pb-1">
                  <div class="mb-2.5 flex items-baseline gap-3 pl-0.5">
                    <span class="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Evidence Chain</span>
                    <span class="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
                      <Link class="size-4 text-primary" />
                      <strong class="font-semibold text-foreground">引用证据</strong>
                      <span class="rounded-full bg-foreground/15 px-1.5 py-px text-xs font-semibold text-muted-foreground">{{ msg.citations.length }}</span>
                    </span>
                  </div>
                  <div class="flex gap-2.5 overflow-x-auto px-0.5 pb-2" style="scrollbar-width: thin">
                    <button
                      v-for="(cite, idx) in msg.citations"
                      :key="`${cite.fileItemId ?? 'x'}-${cite.chunkId ?? idx}`"
                      class="citation-card relative w-[260px] shrink-0 overflow-hidden rounded-xl border border-border bg-card p-3.5 text-left transition-all duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] shadow-[0_1px_2px_rgba(0,0,0,0.02)] hover:-translate-y-0.5 hover:border-primary hover:shadow-[0_8px_20px_rgba(22,119,255,0.12)] disabled:cursor-not-allowed disabled:opacity-65"
                      type="button"
                      :disabled="cite.fileItemId === null || cite.fileItemId === undefined"
                      @click="onCitationClick(cite)"
                    >
                      <div class="mb-2 flex items-center gap-2">
                        <span class="text-xs font-bold tracking-[0.05em] text-muted-foreground">{{ String(idx + 1).padStart(2, '0') }}</span>
                        <span class="rounded px-1.5 py-0.5 text-[10px] font-bold tracking-[0.06em]" :class="citationIconClass(cite.fileName)">
                          {{ citationFileIcon(cite.fileName) }}
                        </span>
                        <span class="ml-auto text-xs font-semibold text-teal-600">{{ formatScore(cite.score) }}</span>
                      </div>
                      <h4 class="m-0 mb-1.5 line-clamp-2 overflow-hidden text-[13px] font-semibold leading-tight text-foreground" :title="cite.fileName">
                        {{ cite.fileName }}
                      </h4>
                      <p v-if="cite.snippet" class="m-0 mb-2.5 line-clamp-3 overflow-hidden text-xs leading-relaxed text-muted-foreground">
                        {{ cite.snippet }}
                      </p>
                      <p v-else class="m-0 mb-2.5 line-clamp-3 overflow-hidden text-xs italic leading-relaxed text-muted-foreground/50">
                        （未提供摘录片段）
                      </p>
                      <div class="flex items-center gap-2.5">
                        <div class="h-[3px] flex-1 overflow-hidden rounded-sm bg-secondary">
                          <span class="block h-full rounded-sm bg-gradient-to-r from-primary to-primary/80 transition-all duration-400" :style="{ width: `${Math.min(100, (cite.score || 0) * 100)}%` }" />
                        </div>
                        <span v-if="cite.chunkIndex !== null && cite.chunkIndex !== undefined" class="text-[11px] text-muted-foreground">
                          #chunk {{ cite.chunkIndex }}
                        </span>
                        <span v-if="cite.fileItemId !== null && cite.fileItemId !== undefined" class="whitespace-nowrap text-[11px] font-medium text-primary">
                          点击查看 →
                        </span>
                      </div>
                    </button>
                  </div>
                </div>

                <!-- 用量信息 -->
                <div v-if="msg.usage && !msg.pending" class="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span>输入 {{ msg.usage.promptTokens }} token</span>
                  <span>输出 {{ msg.usage.completionTokens }} token</span>
                  <span>共 {{ msg.usage.totalTokens }} token</span>
                  <span v-if="msg.usage.estimated" class="text-amber-500">（估算）</span>
                  <span>耗时 {{ Math.round(msg.usage.latencyMs) }}ms</span>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>

      <!-- 输入区域 -->
      <div class="shrink-0 border-t border-border bg-card px-4 py-3">
        <Textarea
          v-model="inputText"
          :placeholder="composerPlaceholder"
          :disabled="asking || !selectedFolderId"
          class="rounded-lg"
          @keydown="onKeydown"
        />
        <div class="mt-2 flex items-center justify-between">
          <span class="text-xs text-muted-foreground">
            Enter 发送 · Shift+Enter 换行
          </span>
          <Button
            :disabled="!inputText.trim() || !selectedFolderId || asking"
            @click="onAsk"
          >
            <Send class="mr-1 size-4" />
            {{ asking ? '发送中…' : '发送' }}
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted, onUnmounted, nextTick } from 'vue';
import { toast } from 'vue-sonner';
import {
  Plus,
  User,
  Bot,
  MessageSquare,
  Link,
  Send,
} from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
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
    toast.error('加载文件夹列表失败');
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
      toast.error(res.message || '加载历史记录失败');
    }
  } catch (err) {
    console.error('[qa] 加载历史记录失败:', err);
    toast.error('加载历史记录失败');
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
      toast.error(res?.message || '加载记录详情失败');
    }
  } catch (err) {
    console.error('[qa] 加载记录详情失败:', err);
    toast.error('加载记录详情失败');
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
      toast.error('请求异常: ' + assistantMsg.reasonMessage);
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
      toast.error(assistantMsg.reasonMessage);
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
  if (ext === 'pdf') return 'bg-red-500/10 text-red-600';
  if (ext === 'md') return 'bg-primary/10 text-primary';
  if (ext === 'docx' || ext === 'doc') return 'bg-blue-500/10 text-blue-600';
  if (ext === 'xlsx' || ext === 'xls') return 'bg-green-500/10 text-green-600';
  if (ext === 'pptx' || ext === 'ppt') return 'bg-orange-500/10 text-orange-600';
  return 'bg-muted/15 text-muted-foreground';
}

/**
 * 点击引用卡片，在新窗口中打开文件查看器。
 *
 * 复用文件模块的查看逻辑：通过 os.createWindow 创建新窗口，
 * 窗口内容为 #/special/file-viewer?fileItemId=<id>
 */
function onCitationClick(cite) {
  if (cite.fileItemId === null || cite.fileItemId === undefined) {
    toast.warning('该引用无关联文件，无法查看');
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
    toast.error('打开文件查看窗口失败');
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
