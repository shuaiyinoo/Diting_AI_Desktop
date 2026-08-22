<template>
  <div class="mx-auto max-w-[640px]">
    <h3 class="flex items-center gap-2 text-base font-semibold text-foreground">
      <Monitor class="size-5 text-primary" />
      {{ t('runtime.title') }}
    </h3>
    <p class="mb-4 mt-1.5 text-xs leading-relaxed text-muted-foreground">{{ t('runtime.subtitle') }}</p>

    <div v-if="loading" class="flex items-center justify-center py-12">
      <Spinner class="size-5 text-muted-foreground" />
      <span class="ml-2 text-sm text-muted-foreground">{{ t('runtime.loading') }}</span>
    </div>

    <div v-if="status" class="flex flex-col gap-2.5">
      <!-- Python -->
      <RuntimeCard
        label="Python"
        icon-class="text-[#3776ab]"
        :available="status.python.available"
        :source="status.python.source"
        :path="status.python.path"
        :description="t('runtime.pythonDesc')"
      />

      <!-- Node.js -->
      <RuntimeCard
        label="Node.js"
        icon-class="text-[#339933]"
        :available="status.node.available"
        :source="status.node.source"
        :path="status.node.path"
        :description="t('runtime.nodeDesc')"
      />

      <!-- Git -->
      <RuntimeCard
        label="Git"
        icon-class="text-[#f05033]"
        :available="status.git.available"
        :source="status.git.source"
        :path="status.git.path"
        :description="t('runtime.gitDesc')"
      />

      <!-- 镜像源配置 -->
      <div class="rounded-lg border border-border bg-card p-3.5 shadow-sm">
        <div class="mb-2.5 flex items-center justify-between">
          <div class="flex items-center gap-2.5">
            <Settings class="size-5 text-muted-foreground" />
            <div>
              <div class="text-sm font-semibold text-foreground">{{ t('runtime.mirror.title') }}</div>
              <div class="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{{ t('runtime.mirror.description') }}</div>
            </div>
          </div>
        </div>
        <div class="flex flex-col gap-1.5">
          <!-- pip 镜像 -->
          <div class="flex items-center gap-3 py-1">
            <span class="w-[72px] shrink-0 text-xs text-muted-foreground">{{ t('runtime.mirror.pip') }}</span>
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
            <span class="w-[72px] shrink-0 text-xs text-muted-foreground">{{ t('runtime.mirror.current') }}</span>
            <span class="min-w-0 break-all font-mono text-xs text-foreground">{{ status.mirrors.pypiMirror }}</span>
          </div>
          <div class="my-1 h-px bg-border" />
          <!-- npm 镜像 -->
          <div class="flex items-center gap-3 py-1">
            <span class="w-[72px] shrink-0 text-xs text-muted-foreground">{{ t('runtime.mirror.npm') }}</span>
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
            <span class="w-[72px] shrink-0 text-xs text-muted-foreground">{{ t('runtime.mirror.current') }}</span>
            <span class="min-w-0 break-all font-mono text-xs text-foreground">{{ status.mirrors.npmRegistry }}</span>
          </div>
        </div>
      </div>
    </div>

    <Button variant="link" size="sm" class="mt-2 px-0" @click="load">{{ t('runtime.refresh') }}</Button>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { Monitor, Code, Settings } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { CheckCircle2, AlertCircle } from '@lucide/vue'
import { ipc } from '@/utils/ipcRenderer'
import RuntimeCard from './RuntimeCard.vue'

const { t } = useI18n()

const loading = ref(false)
const status = ref(null)

const mirrorOptions = computed(() => [
  { value: 'auto', label: t('runtime.mirror.auto') },
  { value: 'china', label: t('runtime.mirror.china') },
  { value: 'international', label: t('runtime.mirror.international') },
])

async function load() {
  loading.value = true
  try {
    const res = await ipc.invoke('controller/runtime/getStatus')
    if (res.code === 0 && res.data) status.value = res.data
    else toast.error(res.message || t('runtime.mirror.switchFailed'))
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
      toast.success(res.message || t('runtime.mirror.switched'))
      await load()
    } else {
      toast.error(res.message || t('runtime.mirror.switchFailed'))
    }
  } catch (err) {
    toast.error('切换镜像源异常: ' + (err?.message || err))
  }
}

onMounted(load)

defineExpose({ refresh: load })
</script>
