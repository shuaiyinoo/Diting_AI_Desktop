<template>
  <div class="mx-auto max-w-[720px]">
    <h3 class="flex items-center gap-2 text-base font-semibold text-foreground">
      <Radio class="size-5 text-primary" />
      {{ t('bridge.title') }}
    </h3>
    <p class="mb-4 mt-1.5 text-xs leading-relaxed text-muted-foreground">
      {{ t('bridge.subtitle') }}
    </p>

    <!-- 平台选择 -->
    <div class="mb-4 flex gap-2">
      <button
        v-for="tab in platformTabs"
        :key="tab.key"
        class="inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-all"
        :class="activePlatform === tab.key
          ? 'border-primary bg-primary/5 text-primary'
          : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'"
        @click="activePlatform = tab.key"
      >
        <component :is="tab.icon" class="size-4" />
        {{ tab.label }}
      </button>
    </div>

    <!-- 平台面板 -->
    <FeishuPanel v-if="activePlatform === 'feishu'" />
    <WeChatPanel v-else-if="activePlatform === 'wechat'" />
    <DingTalkPanel v-else-if="activePlatform === 'dingtalk'" />

    <!-- 通用帮助 -->
    <div class="mt-6 rounded-lg border border-border bg-muted/30 p-4">
      <div class="mb-2 flex items-center gap-1.5">
        <HelpCircle class="size-4 text-muted-foreground" />
        <span class="text-xs font-semibold text-foreground">{{ t('bridge.help.title') }}</span>
      </div>
      <ul class="space-y-1 text-[11px] leading-relaxed text-muted-foreground">
        <li v-for="(item, i) in helpItems" :key="i">{{ item }}</li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Radio, MessageCircle, Bot, Bell, HelpCircle } from '@lucide/vue'
import FeishuPanel from './bridge/FeishuPanel.vue'
import WeChatPanel from './bridge/WeChatPanel.vue'
import DingTalkPanel from './bridge/DingTalkPanel.vue'

const { t } = useI18n()

const activePlatform = ref('feishu')

const platformTabs = computed(() => [
  { key: 'feishu', label: t('bridge.platforms.feishu'), icon: MessageCircle },
  { key: 'wechat', label: t('bridge.platforms.wechat'), icon: Bot },
  { key: 'dingtalk', label: t('bridge.platforms.dingtalk'), icon: Bell },
])

const helpItems = computed(() => [
  t('bridge.help.items[0]'),
  t('bridge.help.items[1]'),
  t('bridge.help.items[2]'),
  t('bridge.help.items[3]'),
  t('bridge.help.items[4]'),
])
</script>
