<template>
  <div class="mx-auto max-w-[720px]">
    <h3 class="flex items-center gap-2 text-base font-semibold text-foreground">
      <Radio class="size-5 text-primary" />
      远程连接
    </h3>
    <p class="mb-4 mt-1.5 text-xs leading-relaxed text-muted-foreground">
      通过飞书、微信、钉钉等 IM 平台与 Diting Agent 对话。消息会自动路由到 Agent 会话，回复发送回 IM。
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
        <span class="text-xs font-semibold text-foreground">使用说明</span>
      </div>
      <ul class="space-y-1 text-[11px] leading-relaxed text-muted-foreground">
        <li>在 IM 中发送消息即可与 Agent 对话，Agent 回复会自动发送回 IM</li>
        <li>支持斜杠命令：<code class="rounded bg-muted px-1">/help</code> 查看帮助，<code class="rounded bg-muted px-1">/new</code> 创建新会话，<code class="rounded bg-muted px-1">/list</code> 查看会话列表</li>
        <li>支持发送图片和文件，Agent 会自动下载并引用</li>
        <li>每个 IM 聊天绑定一个 Agent 会话，切换工作区后会自动创建新会话</li>
        <li>需先在"模型管理"中启用至少一个 LLM 模型</li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { Radio, MessageCircle, Bot, Bell, HelpCircle } from '@lucide/vue'
import FeishuPanel from './bridge/FeishuPanel.vue'
import WeChatPanel from './bridge/WeChatPanel.vue'
import DingTalkPanel from './bridge/DingTalkPanel.vue'

const activePlatform = ref('feishu')

const platformTabs = [
  { key: 'feishu', label: '飞书', icon: MessageCircle },
  { key: 'wechat', label: '微信', icon: Bot },
  { key: 'dingtalk', label: '钉钉', icon: Bell },
]
</script>
