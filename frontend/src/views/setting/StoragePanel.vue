<template>
  <div class="mx-auto max-w-[640px]">
    <h3 class="flex items-center gap-2 text-base font-semibold text-foreground">
      <HardDrive class="size-5 text-primary" />
      磁盘管理
    </h3>
    <p class="mb-4 mt-1.5 text-xs leading-relaxed text-muted-foreground">
      查看应用各数据类别的磁盘占用，清理临时文件和日志以释放空间。
    </p>

    <!-- 存储用量 -->
    <div class="rounded-lg border border-border bg-card shadow-sm">
      <!-- 标题栏 -->
      <div class="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span class="text-sm font-medium text-foreground">存储用量</span>
        <div class="flex items-center gap-2">
          <span v-if="stats" class="text-xs text-muted-foreground">
            总计 {{ formatBytes(stats.totalBytes) }}
          </span>
          <Button variant="ghost" size="sm" class="h-7 gap-1 text-xs" :disabled="loading" @click="loadStats">
            <RefreshCw class="size-3.5" :class="{ 'animate-spin': loading }" />
            刷新
          </Button>
        </div>
      </div>

      <!-- 存储条 -->
      <div v-if="stats" class="px-4 pt-3">
        <div class="flex h-3 w-full overflow-hidden rounded-full bg-muted">
          <template v-for="(cat, i) in stats.categories" :key="cat.key">
            <div
              v-if="cat.bytes > 0 && (cat.bytes / stats.totalBytes) * 100 >= 0.5"
              class="h-full transition-all"
              :class="BAR_COLORS[i % BAR_COLORS.length]"
              :style="{ width: `${(cat.bytes / stats.totalBytes) * 100}%` }"
              :title="`${cat.label}: ${formatBytes(cat.bytes)}`"
            />
          </template>
        </div>
      </div>

      <!-- 分类列表 -->
      <div v-if="loading && !stats" class="flex items-center justify-center py-8">
        <Spinner class="size-5 text-muted-foreground" />
        <span class="ml-2 text-sm text-muted-foreground">正在计算…</span>
      </div>

      <div v-if="stats" class="p-2">
        <div
          v-for="(cat, i) in stats.categories"
          :key="cat.key"
          class="flex items-center justify-between rounded-md px-2 py-2 transition-colors hover:bg-accent/50"
        >
          <div class="flex items-center gap-2.5">
            <span class="inline-block h-2.5 w-2.5 rounded-full" :class="BAR_COLORS[i % BAR_COLORS.length]" />
            <div class="flex flex-col">
              <span class="text-sm text-foreground">{{ cat.label }}</span>
              <span class="text-[11px] text-muted-foreground">{{ cat.count }} 个文件 · {{ cat.displayPath }}</span>
            </div>
          </div>
          <div class="flex items-center gap-2.5">
            <span class="text-sm tabular-nums text-muted-foreground">{{ formatBytes(cat.bytes) }}</span>
            <Button
              v-if="cat.cleanable && cat.bytes > 0"
              variant="ghost"
              size="sm"
              class="h-7 gap-1 text-xs"
              :disabled="cleaningKey === cat.key"
              @click="handleClean(cat.key)"
            >
              <Trash2 class="size-3" />
              {{ cleaningKey === cat.key ? '清理中…' : '清理' }}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              class="h-7 gap-1 text-xs"
              @click="handleOpen(cat.path)"
            >
              <FolderOpen class="size-3" />
              打开
            </Button>
          </div>
        </div>
      </div>
    </div>

    <!-- 清理结果提示 -->
    <div v-if="lastResult" class="mt-4 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm">
      <div v-if="lastResult.freedBytes > 0" class="text-emerald-600 dark:text-emerald-400">
        已释放 {{ formatBytes(lastResult.freedBytes) }}，删除 {{ lastResult.deletedCount }} 个文件
      </div>
      <div v-else class="text-muted-foreground">没有需要清理的数据</div>
      <div v-if="lastResult.errors.length > 0" class="mt-1 text-xs text-destructive">
        <div v-for="(err, i) in lastResult.errors" :key="i">{{ err }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { toast } from 'vue-sonner'
import { HardDrive, RefreshCw, Trash2, FolderOpen } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { ipcApiRoute } from '@/api'
import { ipc } from '@/utils/ipcRenderer'

const stats = ref(null)
const loading = ref(false)
const cleaningKey = ref(null)
const lastResult = ref(null)

const BAR_COLORS = [
  'bg-blue-500',
  'bg-purple-500',
  'bg-amber-500',
  'bg-emerald-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-indigo-500',
  'bg-orange-500',
]

function formatBytes(bytes) {
  if (bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`
}

async function loadStats() {
  loading.value = true
  try {
    const res = await ipc.invoke(ipcApiRoute.storage.getStats)
    if (res.code === 0) {
      stats.value = res.data
    } else {
      toast.error(res.message || '获取存储统计失败')
    }
  } catch (err) {
    toast.error('获取存储统计异常: ' + (err?.message || err))
  } finally {
    loading.value = false
  }
}

async function handleClean(categoryKey) {
  cleaningKey.value = categoryKey
  lastResult.value = null
  try {
    const res = await ipc.invoke(ipcApiRoute.storage.cleanup, { categories: [categoryKey] })
    if (res.code === 0) {
      lastResult.value = res.data
      if (res.data.freedBytes > 0) {
        toast.success(`已释放 ${formatBytes(res.data.freedBytes)}`)
      } else {
        toast.info('没有需要清理的数据')
      }
      await loadStats()
    } else {
      toast.error(res.message || '清理失败')
    }
  } catch (err) {
    toast.error('清理异常: ' + (err?.message || err))
  } finally {
    cleaningKey.value = null
  }
}

onMounted(() => {
  loadStats()
})

function handleOpen(dirPath) {
  // 临时文件目录是系统 tmp 路径，需要先确保目录存在再打开
  try {
    ipc.invoke(ipcApiRoute.os.openDirectory, { id: dirPath })
  } catch (err) {
    toast.error('打开目录失败: ' + (err?.message || err))
  }
}

defineExpose({ refresh: loadStats })
</script>
