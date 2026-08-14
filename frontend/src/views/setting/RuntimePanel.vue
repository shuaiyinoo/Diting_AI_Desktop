<template>
  <div class="mx-auto max-w-[640px]">
    <h3 class="flex items-center gap-2 text-base font-semibold text-foreground">
      <Monitor class="size-5 text-primary" />
      运行时环境
    </h3>
    <p class="mb-4 mt-1.5 text-xs leading-relaxed text-muted-foreground">Agent 执行脚本时使用的 Python / Node.js 运行时状态和镜像源配置。优先使用内嵌运行时，不可用时自动回退到宿主机环境。</p>

    <div v-if="loading" class="flex items-center justify-center py-12">
      <Spinner class="size-5 text-muted-foreground" />
      <span class="ml-2 text-sm text-muted-foreground">加载中…</span>
    </div>

    <div v-if="status" class="flex flex-col gap-2.5">
      <!-- Python -->
      <RuntimeCard
        label="Python"
        icon-class="text-[#3776ab]"
        :available="status.python.available"
        :source="status.python.source"
        :path="status.python.path"
        description="用于执行 Python 脚本和 pip 包安装"
      />

      <!-- Node.js -->
      <RuntimeCard
        label="Node.js"
        icon-class="text-[#339933]"
        :available="status.node.available"
        :source="status.node.source"
        :path="status.node.path"
        description="用于执行 JavaScript 脚本和 npm 包安装（基于 Electron 内嵌运行时）"
      />

      <!-- Git -->
      <RuntimeCard
        label="Git"
        icon-class="text-[#f05033]"
        :available="status.git.available"
        :source="status.git.source"
        :path="status.git.path"
        description="用于执行 Git 命令（status、log、commit 等），从宿主机检测"
      />

      <!-- 镜像源配置 -->
      <div class="rounded-lg border border-border bg-card p-3.5 shadow-sm">
        <div class="mb-2.5 flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <Settings class="size-5 text-muted-foreground" />
            <div>
              <div class="text-sm font-semibold text-foreground">镜像源</div>
              <div class="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">安装依赖包时使用的镜像源，影响 pip 和 npm 下载速度</div>
            </div>
          </div>
        </div>
        <div class="flex flex-col gap-1.5">
          <!-- pip 镜像 -->
          <div class="flex items-center gap-3 py-1">
            <span class="w-[72px] shrink-0 text-xs text-muted-foreground">pip 镜像</span>
            <div class="inline-flex shrink-0 items-center rounded-lg bg-muted p-0.5">
              <button
                v-for="opt in mirrorOptions" :key="opt.value"
                class="inline-flex h-6 items-center justify-center rounded-md px-3 text-xs font-medium transition-all"
                :class="status.mirrors.pipMirrorMode === opt.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
                @click="setMirrorMode('pip', opt.value)"
              >{{ opt.label }}</button>
            </div>
          </div>
          <div class="flex items-center gap-3 py-1">
            <span class="w-[72px] shrink-0 text-xs text-muted-foreground">当前地址</span>
            <span class="min-w-0 break-all font-mono text-xs text-foreground">{{ status.mirrors.pypiMirror }}</span>
          </div>
          <div class="my-1 h-px bg-border" />
          <!-- npm 镜像 -->
          <div class="flex items-center gap-3 py-1">
            <span class="w-[72px] shrink-0 text-xs text-muted-foreground">npm 镜像</span>
            <div class="inline-flex shrink-0 items-center rounded-lg bg-muted p-0.5">
              <button
                v-for="opt in mirrorOptions" :key="opt.value"
                class="inline-flex h-6 items-center justify-center rounded-md px-3 text-xs font-medium transition-all"
                :class="status.mirrors.npmMirrorMode === opt.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'"
                @click="setMirrorMode('npm', opt.value)"
              >{{ opt.label }}</button>
            </div>
          </div>
          <div class="flex items-center gap-3 py-1">
            <span class="w-[72px] shrink-0 text-xs text-muted-foreground">当前地址</span>
            <span class="min-w-0 break-all font-mono text-xs text-foreground">{{ status.mirrors.npmRegistry }}</span>
          </div>
        </div>
      </div>
    </div>

    <Button variant="link" size="sm" class="mt-2 px-0" @click="load">刷新状态</Button>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { toast } from 'vue-sonner'
import { Monitor, Code, Settings } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { CheckCircle2, AlertCircle } from '@lucide/vue'
import { ipc } from '@/utils/ipcRenderer'
import RuntimeCard from './RuntimeCard.vue'

const loading = ref(false)
const status = ref(null)

const mirrorOptions = [
  { value: 'auto', label: '自动检测' },
  { value: 'china', label: '国内镜像' },
  { value: 'international', label: '国际源' },
]

async function load() {
  loading.value = true
  try {
    const res = await ipc.invoke('controller/runtime/getStatus')
    if (res.code === 0 && res.data) status.value = res.data
    else toast.error(res.message || '获取运行时状态失败')
  } catch (err) {
    toast.error('获取运行时状态异常: ' + (err?.message || err))
  } finally {
    loading.value = false
  }
}

async function setMirrorMode(type, mode) {
  try {
    const res = await ipc.invoke('controller/runtime/setMirror', { type, mode })
    if (res.code === 0) {
      toast.success(res.message || '镜像源已切换')
      await load()
    } else {
      toast.error(res.message || '切换失败')
    }
  } catch (err) {
    toast.error('切换镜像源异常: ' + (err?.message || err))
  }
}

onMounted(load)

defineExpose({ refresh: load })
</script>
