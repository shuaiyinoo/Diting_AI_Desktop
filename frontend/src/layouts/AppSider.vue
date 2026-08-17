<template>
  <div
    class="flex h-screen shrink-0 select-none flex-col overflow-hidden border-r border-border bg-sidebar transition-all duration-250"
    :class="isCollapsed ? 'w-[60px]' : 'w-[240px]'"
  >
    <!-- 顶部 Logo 区域 -->
    <div
      class="flex min-h-[56px] cursor-pointer items-center gap-2.5 p-3.5 transition-all"
      :class="isCollapsed ? 'justify-center' : ''"
      @click="toggleCollapse"
    >
      <img class="size-7 shrink-0 rounded-md" src="~@/assets/logo.png" alt="logo" />
      <span v-if="!isCollapsed" class="whitespace-nowrap text-[15px] font-bold tracking-tight text-foreground">
        Diting
      </span>
    </div>

    <!-- 主菜单区域 -->
    <nav class="flex flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden p-2.5 [&::-webkit-scrollbar]:hidden">
      <button
        v-for="item in menuItems"
        :key="item.key"
        class="relative flex h-[42px] w-full items-center gap-3 rounded-lg border-none text-left text-sm whitespace-nowrap transition-all duration-200"
        :class="[
          isCollapsed ? 'justify-center p-0' : 'px-3.5',
          current === item.key
            ? 'bg-gradient-to-br from-[#1677ff] to-[#4096ff] text-white shadow-[0_2px_8px_rgba(22,119,255,0.3)]'
            : 'bg-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        ]"
        :title="item.title"
        @click="menuHandle(item.key)"
      >
        <component :is="item.icon" class="size-5 shrink-0" />
        <span v-if="!isCollapsed" class="overflow-hidden text-ellipsis font-medium tracking-tight">
          {{ item.title }}
        </span>

        <!-- 折叠时的 tooltip -->
        <span
          v-if="isCollapsed"
          class="pointer-events-none absolute left-[calc(100%+8px)] top-1/2 z-50 -translate-y-1/2 rounded-md bg-[#1a1a2e] px-2.5 py-1 text-xs whitespace-nowrap text-white opacity-0 shadow-lg transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100"
        >
          {{ item.title }}
        </span>
      </button>
    </nav>

    <!-- 底部设置 -->
    <div class="border-t border-[var(--border-color-light)] p-2.5 pb-3">
      <button
        class="relative flex h-[42px] w-full items-center gap-3 rounded-lg border-none text-left text-sm whitespace-nowrap transition-all duration-200"
        :class="[
          isCollapsed ? 'justify-center p-0' : 'px-3.5',
          current === 'menu_setting'
            ? 'bg-gradient-to-br from-[#1677ff] to-[#4096ff] text-white shadow-[0_2px_8px_rgba(22,119,255,0.3)]'
            : 'bg-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        ]"
        :title="'设置'"
        @click="menuHandle('menu_setting')"
      >
        <Settings class="size-5 shrink-0" />
        <span v-if="!isCollapsed" class="overflow-hidden text-ellipsis font-medium tracking-tight">设置</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { File, MessageSquare, Bot, Settings } from '@lucide/vue'

const router = useRouter()

const isCollapsed = ref(true)
const current = ref('menu_file')

const menuItems = ref([
  { key: 'menu_file', icon: File, title: '文件', pageName: 'File', params: {} },
  { key: 'menu_chat', icon: MessageSquare, title: 'Chat', pageName: 'Chat', params: {} },
  { key: 'menu_agent', icon: Bot, title: 'Agent', pageName: 'Agent', params: {} },
])

const settingItem = { key: 'menu_setting', icon: Settings, title: '设置', pageName: 'Setting', params: {} }

const menuMap = ref({
  menu_file: menuItems.value[0],
  menu_chat: menuItems.value[1],
  menu_agent: menuItems.value[2],
  menu_setting: settingItem,
})

onMounted(() => {
  menuHandle('menu_file')
})

function toggleCollapse() {
  isCollapsed.value = !isCollapsed.value
}

function menuHandle(key) {
  current.value = key
  const linkInfo = menuMap.value[key]
  if (linkInfo) {
    router.push({ name: linkInfo.pageName, params: linkInfo.params })
  }
}
</script>
