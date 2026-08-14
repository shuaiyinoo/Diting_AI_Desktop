<template>
  <div class="flex h-full overflow-hidden">
    <!-- 左侧：会话列表 -->
    <AssistantSidebar
      :sessions="sessions"
      :active-session-id="activeSessionId"
      :loading="sessionsLoading"
      :disabled="asking"
      @create="onCreateSession"
      @select="onSelectSession"
      @rename="onRenameSession"
      @delete="onDeleteSession"
    />

    <!-- 右侧：主区域 -->
    <div class="flex-1 flex flex-col min-w-0 h-full">
      <!-- 顶部：模式切换 -->
      <div class="px-5 py-3 bg-card border-b border-border flex-shrink-0">
        <ModeSwitcher
          v-model="toolMode"
          v-model:folder-id="selectedFolderId"
          :folder-list="folderList"
          :disabled="asking"
          @switch="onModeSwitch"
        />
      </div>

      <!-- 消息列表 -->
      <AssistantMessageList
        ref="messageListRef"
        :messages="messages"
        @starter-pick="onStarterPick"
        @citation-click="onCitationClick"
      />

      <!-- 输入框 -->
      <AssistantComposer
        :disabled="asking || !activeSessionId"
        @send="onSend"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, nextTick } from 'vue';
import { toast } from 'vue-sonner';
import { ipcApiRoute } from '@/api';
import { ipc } from '@/utils/ipcRenderer';
import AssistantSidebar from './components/AssistantSidebar.vue';
import AssistantMessageList from './components/AssistantMessageList.vue';
import AssistantComposer from './components/AssistantComposer.vue';
import ModeSwitcher from './components/ModeSwitcher.vue';

// ========== HTTP 服务器地址（用于 SSE 流式通信） ==========
const httpServerUrl = ref('');

async function loadHttpServerUrl() {
  try {
    const data = await ipc.invoke(ipcApiRoute.framework.checkHttpServer);
    if (data && data.enable && data.server) {
      httpServerUrl.value = data.server;
    } else {
      httpServerUrl.value = 'http://127.0.0.1:7071';
    }
  } catch (err) {
    console.warn('[rag] 获取 HTTP 服务器地址失败，使用默认地址:', err);
    httpServerUrl.value = 'http://127.0.0.1:7071';
  }
}

// ========== 会话管理 ==========
const sessions = ref([]);
const activeSessionId = ref(null);
const sessionsLoading = ref(false);
const messages = ref([]);
const asking = ref(false);

let messageUid = 0;

async function loadSessions() {
  sessionsLoading.value = true;
  try {
    const result = await ipc.invoke(ipcApiRoute.assistant.sessionOperation, {
      action: 'list',
    });
    if (result && result.code === 0) {
      sessions.value = result.data || [];
      // 若无活跃会话且有历史，自动选中第一个
      if (!activeSessionId.value && sessions.value.length > 0) {
        await onSelectSession(sessions.value[0].sessionId);
      }
    } else {
      toast.error(result?.message || '加载会话列表失败');
    }
  } catch (err) {
    console.error('[rag] 加载会话列表失败:', err);
    toast.error('加载会话列表失败');
  } finally {
    sessionsLoading.value = false;
  }
}

async function onCreateSession() {
  try {
    const result = await ipc.invoke(ipcApiRoute.assistant.sessionOperation, {
      action: 'create',
    });
    if (result && result.code === 0) {
      const session = result.data;
      sessions.value.unshift(session);
      await onSelectSession(session.sessionId);
    } else {
      toast.error(result?.message || '创建会话失败');
    }
  } catch (err) {
    console.error('[rag] 创建会话失败:', err);
    toast.error('创建会话失败');
  }
}

async function onSelectSession(sessionId) {
  if (asking.value) {
    toast.warning('正在生成回答，请稍后切换');
    return;
  }
  activeSessionId.value = sessionId;
  messages.value = [];
  await loadConversationContext(sessionId);
}

async function loadConversationContext(sessionId) {
  try {
    const result = await ipc.invoke(ipcApiRoute.assistant.getConversationContext, {
      sessionId,
      recentLimit: 50,
    });
    if (result && result.code === 0 && result.data) {
      const ctx = result.data;
      // 将历史消息转换为前端消息对象
      messages.value = (ctx.recentMessages || []).map((m) => toUiMessage(m));
      await scrollToBottom();
    }
  } catch (err) {
    console.error('[rag] 加载会话上下文失败:', err);
    toast.error('加载会话上下文失败');
  }
}

function toUiMessage(m) {
  const citations = m.citations || [];
  let evidenceLevel = null;
  let usage = null;
  if (m.structuredPayload) {
    try {
      const parsed = JSON.parse(m.structuredPayload);
      evidenceLevel = parsed.evidenceLevel || null;
      usage = parsed.usage || null;
    } catch {
      // 忽略解析失败
    }
  }
  return {
    id: `hist-${m.messageId}`,
    role: m.role,
    content: m.content,
    toolMode: m.toolMode,
    citations,
    evidenceLevel,
    usage,
    pending: false,
    error: null,
  };
}

async function onRenameSession({ sessionId, title }) {
  try {
    const result = await ipc.invoke(ipcApiRoute.assistant.sessionOperation, {
      action: 'rename',
      sessionId,
      title,
    });
    if (result && result.code === 0) {
      toast.success('重命名成功');
      // 更新本地列表
      const idx = sessions.value.findIndex((s) => s.sessionId === sessionId);
      if (idx >= 0) {
        sessions.value[idx].title = title;
      }
    } else {
      toast.error(result?.message || '重命名失败');
    }
  } catch (err) {
    console.error('[rag] 重命名会话失败:', err);
    toast.error('重命名会话失败');
  }
}

function onDeleteSession(sessionId) {
  if (!window.confirm('确定删除该会话吗？删除后无法恢复。')) return;
  (async () => {
      try {
        const result = await ipc.invoke(ipcApiRoute.assistant.sessionOperation, {
          action: 'delete',
          sessionId,
        });
        if (result && result.code === 0) {
          toast.success('删除成功');
          // 从列表中移除
          sessions.value = sessions.value.filter((s) => s.sessionId !== sessionId);
          // 如果删除的是当前会话，切到第一个或清空
          if (activeSessionId.value === sessionId) {
            if (sessions.value.length > 0) {
              await onSelectSession(sessions.value[0].sessionId);
            } else {
              activeSessionId.value = null;
              messages.value = [];
            }
          }
        } else {
          toast.error(result?.message || '删除失败');
        }
      } catch (err) {
        console.error('[rag] 删除会话失败:', err);
        toast.error('删除会话失败');
      }
  })();
}

// ========== 模式切换 ==========
const toolMode = ref('CHAT');
const selectedFolderId = ref(null);
const folderList = ref([]);

async function loadFolderList() {
  try {
    const data = await ipc.invoke(ipcApiRoute.file.getFolderList);
    folderList.value = data || [];
    if (folderList.value.length > 0 && !selectedFolderId.value) {
      selectedFolderId.value = folderList.value[0].id;
    }
  } catch (err) {
    console.error('[rag] 加载文件夹列表失败:', err);
  }
}

function onModeSwitch(mode) {
  // 切换模式时不清空消息，保留对话上下文
  if (mode === 'KB_SEARCH' && !selectedFolderId.value) {
    toast.warning('请先选择一个知识库文件夹');
  }
}

// ========== 发送消息 + SSE 流式 ==========
const messageListRef = ref(null);

async function onSend(text) {
  if (asking.value) return;
  if (!activeSessionId.value) {
    toast.warning('请先创建或选择一个会话');
    return;
  }
  if (toolMode.value === 'KB_SEARCH' && !selectedFolderId.value) {
    toast.warning('文档问答模式需要选择一个知识库文件夹');
    return;
  }

  // 构造用户消息
  const userMsg = {
    id: `msg-${++messageUid}`,
    role: 'USER',
    content: text,
    pending: false,
    citations: [],
    evidenceLevel: null,
    usage: null,
    error: null,
  };

  // 构造助手占位消息（用 reactive 包裹，确保流式 token 更新能触发视图重渲染）
  const assistantMsg = reactive({
    id: `msg-${++messageUid}`,
    role: 'ASSISTANT',
    content: '',
    pending: true,
    toolMode: toolMode.value,
    citations: [],
    evidenceLevel: null,
    usage: null,
    error: null,
  });

  messages.value.push(userMsg, assistantMsg);
  asking.value = true;
  await scrollToBottom();

  // 构造 SSE 请求
  const url = `${httpServerUrl.value}/${ipcApiRoute.assistant.streamChat}`;
  const controller = new AbortController();

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: activeSessionId.value,
        message: text,
        toolMode: toolMode.value,
        folderId: toolMode.value === 'KB_SEARCH' ? selectedFolderId.value : null,
      }),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      const errText = await response.text().catch(() => '流式聊天请求失败');
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
      let separatorIndex = buffer.indexOf('\n\n');
      while (separatorIndex >= 0) {
        const rawEvent = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        dispatchSseEvent(rawEvent, assistantMsg);
        separatorIndex = buffer.indexOf('\n\n');
      }
      await scrollToBottom();
    }

    assistantMsg.pending = false;
    asking.value = false;
    // 刷新会话列表（更新最后消息时间）
    refreshSessionInList();
    await scrollToBottom();
  } catch (err) {
    assistantMsg.pending = false;
    assistantMsg.error = err?.message || String(err);
    asking.value = false;
    if (err?.name !== 'AbortError') {
      toast.error('请求异常: ' + assistantMsg.error);
    }
  }
  await scrollToBottom();
}

/**
 * 解析并分发单条 SSE 事件。
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

  // assistant 事件 data 是 JSON 对象
  let data = null;
  try {
    data = JSON.parse(rawData);
  } catch {
    // token 事件可能是纯文本
    data = null;
  }

  switch (eventName) {
    case 'start':
      // 流开始，无需处理
      break;
    case 'token':
      // token 的 data 可能是 JSON（含 delta）或纯文本
      if (data && typeof data.delta === 'string') {
        assistantMsg.content += data.delta;
      } else {
        assistantMsg.content += rawData;
      }
      break;
    case 'citations':
      if (data && Array.isArray(data.citations)) {
        assistantMsg.citations = data.citations;
      }
      if (data && data.evidenceLevel) {
        assistantMsg.evidenceLevel = data.evidenceLevel;
      }
      break;
    case 'complete':
      if (data) {
        if (data.reply) {
          assistantMsg.content = data.reply;
        }
        if (Array.isArray(data.citations)) {
          assistantMsg.citations = data.citations;
        }
        if (data.evidenceLevel) {
          assistantMsg.evidenceLevel = data.evidenceLevel;
        }
        if (data.usage) {
          assistantMsg.usage = data.usage;
        }
      }
      break;
    case 'error':
      if (data && data.error) {
        assistantMsg.error = data.error;
      } else {
        assistantMsg.error = rawData || '流式聊天失败';
      }
      toast.error(assistantMsg.error);
      break;
    default:
      break;
  }
}

function onStarterPick(prompt) {
  // 直接发送预设问题
  onSend(prompt);
}

/**
 * 点击引用卡片，在新窗口中打开文件查看器。
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
    console.error('[rag] 打开文件查看窗口失败:', err);
    toast.error('打开文件查看窗口失败');
  });
}

function refreshSessionInList() {
  // 将当前会话移到列表顶部
  if (!activeSessionId.value) return;
  const idx = sessions.value.findIndex((s) => s.sessionId === activeSessionId.value);
  if (idx > 0) {
    const [session] = sessions.value.splice(idx, 1);
    session.lastMessageAt = new Date().toISOString();
    sessions.value.unshift(session);
  } else if (idx === 0) {
    sessions.value[0].lastMessageAt = new Date().toISOString();
  }
}

async function scrollToBottom() {
  await nextTick();
  if (messageListRef.value && messageListRef.value.scrollToBottom) {
    messageListRef.value.scrollToBottom();
  }
}

// ========== 生命周期 ==========
onMounted(async () => {
  await loadHttpServerUrl();
  await loadFolderList();
  await loadSessions();
  // 若无会话，自动创建一个
  if (sessions.value.length === 0) {
    await onCreateSession();
  }
});

onUnmounted(() => {
  // SSE 流式通信基于 fetch，组件卸载时无需清理 IPC 监听器
});
</script>
