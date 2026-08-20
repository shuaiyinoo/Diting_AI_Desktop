<template>
  <div class="mx-auto max-w-[640px]">
    <h3 class="flex items-center gap-2 text-base font-semibold text-foreground">关于</h3>

    <!-- 基本信息 -->
    <div class="mt-4 rounded-lg border border-border bg-card shadow-sm">
      <div class="flex items-center border-b border-border px-4 py-2.5">
        <label class="w-[100px] shrink-0 text-xs text-muted-foreground">应用名称</label>
        <span class="text-xs text-foreground">Diting</span>
      </div>
      <div class="flex items-center border-b border-border px-4 py-2.5">
        <label class="w-[100px] shrink-0 text-xs text-muted-foreground">版本</label>
        <span class="text-xs font-mono text-foreground">v{{ appVersion }}</span>
      </div>
      <div class="flex items-center border-b border-border px-4 py-2.5">
        <label class="w-[100px] shrink-0 text-xs text-muted-foreground">运行时</label>
        <span class="text-xs text-foreground">Electron + Vue 3</span>
      </div>
      <div class="flex items-center border-b border-border px-4 py-2.5">
        <label class="w-[100px] shrink-0 text-xs text-muted-foreground">开源协议</label>
        <a
          href="https://www.apache.org/licenses/LICENSE-2.0"
          target="_blank"
          rel="noopener noreferrer"
          class="text-xs text-primary hover:underline"
        >Apache-2.0</a>
      </div>
      <div class="flex items-center px-4 py-2.5">
        <label class="w-[100px] shrink-0 text-xs text-muted-foreground">项目地址</label>
        <a
          href="https://github.com/shuaiyinoo/Diting_AI_Desktop"
          target="_blank"
          rel="noopener noreferrer"
          class="text-xs text-primary hover:underline"
        >github.com/shuaiyinoo/Diting_AI_Desktop</a>
      </div>
    </div>

    <!-- 软件更新卡片 -->
    <div class="mt-6 rounded-lg border border-border bg-card shadow-sm">
      <div class="flex items-center justify-between border-b border-border px-4 py-3">
        <div class="flex items-center gap-2">
          <h4 class="text-sm font-medium text-foreground">软件更新</h4>
        </div>
        <div class="flex items-center gap-2">
          <!-- 状态文字 -->
          <span v-if="updaterStore.status === 'checking'" class="text-xs text-muted-foreground">正在检查...</span>
          <span v-else-if="updaterStore.status === 'available'" class="text-xs text-primary flex items-center gap-1">
            <ExternalLink class="size-3" />
            新版本 v{{ updaterStore.version }} 可用
          </span>
          <span v-else-if="updaterStore.status === 'downloading'" class="text-xs text-muted-foreground flex items-center gap-1">
            <Loader2 class="size-3 animate-spin" />
            正在下载 v{{ updaterStore.version }}
          </span>
          <span v-else-if="updaterStore.status === 'downloaded'" class="text-xs text-primary flex items-center gap-1">
            <CheckCircle2 class="size-3" />
            更新 v{{ updaterStore.version }} 已就绪
          </span>
          <span v-else-if="updaterStore.status === 'not-available'" class="text-xs text-muted-foreground flex items-center gap-1">
            <CheckCircle2 class="size-3" />
            已是最新版本
          </span>
          <span v-else-if="updaterStore.status === 'error'" class="text-xs text-destructive flex items-center gap-1" :title="updaterStore.error">
            <AlertCircle class="size-3" />
            检查失败
          </span>
          <span v-else class="text-xs text-muted-foreground">未检查</span>

          <!-- 操作按钮 -->
          <button
            v-if="updaterStore.status === 'downloaded'"
            @click="handleInstallNow"
            class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <RotateCw class="size-3.5" />
            立即重启
          </button>
          <button
            v-if="updaterStore.status === 'downloaded' && !updaterStore.idleInstallScheduled"
            @click="handleInstallWhenIdle"
            class="inline-flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
          >
            空闲时更新
          </button>
          <button
            v-if="updaterStore.status === 'downloaded' && updaterStore.idleInstallScheduled"
            @click="handleCancelIdleInstall"
            class="inline-flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
          >
            取消安排
          </button>
          <button
            v-else-if="updaterStore.status === 'available'"
            @click="handleGoToDownload"
            class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <ExternalLink class="size-3.5" />
            前往下载
          </button>
          <button
            v-else
            @click="handleCheck"
            :disabled="updaterStore.isChecking"
            class="inline-flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/80 disabled:opacity-50"
          >
            <Loader2 v-if="updaterStore.isChecking" class="size-3.5 animate-spin" />
            <RefreshCw v-else class="size-3.5" />
            检查更新
          </button>
        </div>
      </div>

      <!-- 下载进度 -->
      <div v-if="updaterStore.status === 'downloading'" class="border-b border-border px-4 py-3">
        <div class="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
          <span>正在下载 v{{ updaterStore.version }}</span>
          <span>{{ Math.floor(updaterStore.progress.percent) }}%</span>
        </div>
        <div class="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            class="h-full rounded-full bg-primary transition-all duration-300"
            :style="{ width: `${updaterStore.progress.percent}%` }"
          />
        </div>
        <div class="flex items-center justify-between text-[11px] text-muted-foreground mt-1.5">
          <span>{{ formatBytes(updaterStore.progress.transferred) }} / {{ formatBytes(updaterStore.progress.total) }}</span>
          <span>{{ formatBytes(updaterStore.progress.bytesPerSecond) }}/s</span>
        </div>
      </div>

      <!-- Release Notes（新版本可用时显示） -->
      <div
        v-if="updaterStore.status === 'available' && releaseData"
        class="border-b border-border"
      >
        <button
          @click="showReleaseNotes = !showReleaseNotes"
          class="flex w-full items-center justify-between py-2.5 px-4 text-left transition-colors hover:bg-accent/50"
        >
          <span class="text-xs font-medium">更新日志</span>
          <ChevronUp v-if="showReleaseNotes" class="size-4 text-muted-foreground" />
          <ChevronDown v-else class="size-4 text-muted-foreground" />
        </button>
        <div v-if="showReleaseNotes" class="px-4 pb-4">
          <div class="prose prose-sm dark:prose-invert max-w-none text-xs" v-html="renderMarkdown(releaseData.body)"></div>
        </div>
      </div>
    </div>

    <!-- 版本历史 -->
    <div class="mt-6 rounded-lg border border-border bg-card shadow-sm">
      <div class="flex items-center justify-between border-b border-border px-4 py-3">
        <h4 class="text-sm font-medium text-foreground">版本历史</h4>
        <button
          @click="loadReleases"
          :disabled="loadingReleases"
          class="inline-flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary/80 disabled:opacity-50"
        >
          <Loader2 v-if="loadingReleases" class="size-3.5 animate-spin" />
          <RefreshCw v-else class="size-3.5" />
          刷新
        </button>
      </div>

      <div class="divide-y divide-border">
        <!-- 加载中 -->
        <div v-if="loadingReleases && releases.length === 0" class="py-8 text-center">
          <Loader2 class="size-5 animate-spin mx-auto text-muted-foreground" />
          <p class="text-xs text-muted-foreground mt-2">加载中...</p>
        </div>

        <!-- 加载失败 -->
        <div v-else-if="releasesError" class="py-8 text-center">
          <p class="text-xs text-muted-foreground">加载失败</p>
          <p class="text-[11px] text-muted-foreground mt-1">{{ releasesError }}</p>
        </div>

        <!-- 空数据 -->
        <div v-else-if="releases.length === 0" class="py-8 text-center">
          <p class="text-xs text-muted-foreground">暂无版本历史</p>
        </div>

        <!-- 版本列表 -->
        <div
          v-for="(release, index) in releases"
          :key="release.id"
        >
          <button
            @click="toggleExpand(release.id)"
            class="flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-accent/50"
          >
            <div class="flex items-center gap-2 flex-1 min-w-0">
              <span class="text-xs font-mono font-medium truncate">{{ release.tag_name }}</span>
              <span v-if="index === 0" class="text-[11px] text-primary font-medium shrink-0">最新</span>
              <p v-if="release.name && release.name !== release.tag_name" class="text-[11px] text-muted-foreground truncate">
                {{ release.name }}
              </p>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <span class="text-[11px] text-muted-foreground">{{ formatDate(release.published_at) }}</span>
              <ChevronUp v-if="expandedIds.has(release.id)" class="size-4 text-muted-foreground" />
              <ChevronDown v-else class="size-4 text-muted-foreground" />
            </div>
          </button>

          <!-- Release Notes 展开内容 -->
          <div v-if="expandedIds.has(release.id)" class="px-4 pb-3 pt-3 border-t border-border">
            <div class="prose prose-sm dark:prose-invert max-w-none text-xs" v-html="renderMarkdown(release.body)"></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue';
import { toast } from 'vue-sonner';
import {
  RefreshCw, Loader2, CheckCircle2, AlertCircle, ExternalLink, RotateCw,
  ChevronUp, ChevronDown,
} from '@lucide/vue';
import { useUpdaterStore } from '@/stores/updater';

const updaterStore = useUpdaterStore();

// 应用版本
const appVersion = ref('');

// Release Notes 展开
const showReleaseNotes = ref(false);
const releaseData = ref(null);

// 版本历史
const releases = ref([]);
const loadingReleases = ref(false);
const releasesError = ref('');
const expandedIds = ref(new Set());

onMounted(() => {
  // 获取应用版本号
  updaterStore.getAppVersion().then((v) => {
    if (v) appVersion.value = v;
  });

  // 初始化更新状态
  updaterStore.initialize();

  // 加载版本历史
  loadReleases();
});

// 监听更新状态：发现新版本时获取 Release 信息
watch(
  () => updaterStore.status,
  (newStatus) => {
    if (newStatus === 'available' && updaterStore.version && !releaseData.value) {
      loadReleaseByTag(`v${updaterStore.version}`);
    }
    // 下载完成后显示 toast 通知
    if (newStatus === 'downloaded') {
      toast.success(`更新 v${updaterStore.version} 已下载完成`, {
        description: '可在「关于/更新」页面重启安装',
        duration: 5000,
      });
    }
  },
);

/**
 * 简单的 Markdown 转 HTML 渲染器
 * 将 GitHub Release body（Markdown 格式）渲染为 HTML
 */
function renderMarkdown(body) {
  if (!body) return '<p class="text-muted-foreground italic">暂无发布说明</p>';
  let html = body;

  // 转义 HTML
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // 代码块
  html = html.replace(/```[\s\S]*?```/g, (match) => {
    const code = match.replace(/```\w*\n?/, '').replace(/```$/, '');
    return `<pre class="rounded bg-muted p-2 overflow-x-auto text-[11px]"><code>${code}</code></pre>`;
  });

  // 行内代码
  html = html.replace(/`([^`]+)`/g, '<code class="rounded bg-muted px-1 py-0.5 text-[11px]">$1</code>');

  // 标题
  html = html.replace(/^### (.+)$/gm, '<h3 class="text-xs font-medium mt-2 mb-1">$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="text-xs font-semibold mt-3 mb-1">$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1 class="text-sm font-semibold mt-3 mb-1">$1</h1>');

  // 粗体
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // 链接
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">$1</a>',
  );

  // 无序列表
  html = html.replace(/^- (.+)$/gm, '<li class="ml-3 list-disc">$1</li>');
  html = html.replace(/(<li[\s\S]*?<\/li>\n?)+/g, (match) => `<ul class="space-y-0.5 my-1">${match}</ul>`);

  // 段落
  html = html.replace(/\n\n/g, '</p><p class="my-1">');
  html = `<p class="my-1">${html}</p>`;

  // 清理空段落
  html = html.replace(/<p class="my-1"><\/p>/g, '');

  return html;
}

/**
 * 加载 Release 信息
 */
async function loadReleaseByTag(tag) {
  try {
    const release = await updaterStore.getReleaseByTag(tag);
    if (release) {
      releaseData.value = release;
      showReleaseNotes.value = true;
    }
  } catch (err) {
    console.error('[更新] 获取 Release 信息失败:', err);
  }
}

/**
 * 加载版本历史列表
 */
async function loadReleases() {
  loadingReleases.value = true;
  releasesError.value = '';
  try {
    releases.value = await updaterStore.listReleases({ perPage: 5, includePrerelease: false });
    // 最新一条默认展开
    if (releases.value.length > 0) {
      const latestId = releases.value[0].id;
      const next = new Set(expandedIds.value);
      next.add(latestId);
      expandedIds.value = next;
    }
  } catch (err) {
    console.error('[版本历史] 加载失败:', err);
    releasesError.value = err?.message || '加载失败';
  } finally {
    loadingReleases.value = false;
  }
}

/**
 * 切换版本展开
 */
function toggleExpand(id) {
  const next = new Set(expandedIds.value);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  expandedIds.value = next;
}

/**
 * 检查更新
 */
async function handleCheck() {
  await updaterStore.checkForUpdates();
  // 延迟获取 release 信息
  setTimeout(async () => {
    if (updaterStore.status === 'available' && updaterStore.version) {
      await loadReleaseByTag(`v${updaterStore.version}`);
    }
  }, 1500);
}

/**
 * 空闲时安装
 */
async function handleInstallWhenIdle() {
  const result = await updaterStore.installWhenIdle();
  if (result) {
    toast.info('已安排空闲时安装', {
      description: '所有任务完成后将自动重启安装',
    });
  }
}

/**
 * 取消空闲安装
 */
async function handleCancelIdleInstall() {
  await updaterStore.cancelIdleInstall();
  toast.info('已取消空闲安装');
}

/**
 * 立即重启安装
 */
async function handleInstallNow() {
  await updaterStore.quitAndInstall();
}

/**
 * 前往下载页面
 */
function handleGoToDownload() {
  const url = releaseData.value?.html_url || 'https://github.com/shuaiyinoo/Diting_AI_Desktop/releases';
  if (window.electron?.shell?.openExternal) {
    window.electron.shell.openExternal(url);
  } else {
    window.open(url, '_blank');
  }
}

/**
 * 格式化字节数
 */
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

/**
 * 格式化日期
 */
function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('zh-CN');
}
</script>
