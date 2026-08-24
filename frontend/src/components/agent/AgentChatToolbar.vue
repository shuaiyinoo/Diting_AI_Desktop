<template>
  <div class="flex h-10 shrink-0 items-center justify-between border-b border-border px-4">
    <span class="text-[13px] font-medium text-foreground">{{ toolbarTitle }}</span>
    <div class="flex items-center gap-2">
      <span v-if="isStreaming" class="flex items-center gap-1.5 text-xs text-primary">
        <span class="size-1.5 animate-pulse rounded-full bg-primary" />{{ t('agent.running') }}
      </span>
      <Tooltip :title="codeEditorVisible ? t('agent.hideCodeEditor') : t('agent.showCodeEditor')">
        <button
          class="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          :class="codeEditorVisible ? 'text-accent-foreground' : ''"
          @click="$emit('toggle-code-editor')"
        >
          <Code2 :size="16" />
        </button>
      </Tooltip>
      <Tooltip :title="t('agent.swapPanels')">
        <button
          class="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          @click="$emit('toggle-panel-swap')"
        >
          <ArrowLeftRight :size="16" />
        </button>
      </Tooltip>
      <Tooltip :title="panel4Collapsed ? t('agent.expandFilePanel') : t('agent.collapseFilePanel')">
        <button
          class="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          @click="$emit('toggle-panel4')"
        >
          <PanelRightOpen v-if="panel4Collapsed" :size="16" />
          <PanelRightClose v-else :size="16" />
        </button>
      </Tooltip>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from 'vue-i18n'
import { Tooltip } from '@/components/ui/tooltip'
import { PanelRightClose, PanelRightOpen, ArrowLeftRight, Code2 } from '@lucide/vue'

const { t } = useI18n()

defineProps({
  isStreaming: { type: Boolean, default: false },
  codeEditorVisible: { type: Boolean, default: false },
  panel4Collapsed: { type: Boolean, default: false },
  toolbarTitle: { type: String, default: 'Agent' },
})

defineEmits(['toggle-code-editor', 'toggle-panel-swap', 'toggle-panel4'])
</script>
