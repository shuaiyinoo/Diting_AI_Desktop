<template>
  <div class="pi-sidebar" :class="{ 'pi-sidebar--collapsed': isCollapsed }">
    <!-- 顶部 Logo 区域 -->
    <div class="pi-sidebar__logo" @click="toggleCollapse">
      <img class="pi-sidebar__logo-img" src="~@/assets/logo.png" alt="logo" />
      <span v-if="!isCollapsed" class="pi-sidebar__logo-text">Diting AI</span>
    </div>

    <!-- 主菜单区域 -->
    <nav class="pi-sidebar__nav">
      <button
        v-for="item in menuItems"
        :key="item.key"
        class="pi-sidebar__item"
        :class="{ 'pi-sidebar__item--active': current === item.key }"
        :title="item.title"
        @click="menuHandle(item.key)"
      >
        <component :is="item.icon" class="pi-sidebar__icon" />
        <span v-if="!isCollapsed" class="pi-sidebar__label">{{ item.title }}</span>
        <span v-if="isCollapsed" class="pi-sidebar__tooltip">{{ item.title }}</span>
      </button>
    </nav>

    <!-- 底部设置 -->
    <div class="pi-sidebar__footer">
      <button
        class="pi-sidebar__item"
        :class="{ 'pi-sidebar__item--active': current === 'menu_setting' }"
        :title="'设置'"
        @click="menuHandle('menu_setting')"
      >
        <SettingOutlined class="pi-sidebar__icon" />
        <span v-if="!isCollapsed" class="pi-sidebar__label">设置</span>
        <span v-if="isCollapsed" class="pi-sidebar__tooltip">设置</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  FileFilled,
  MessageOutlined,
  RobotOutlined,
  SettingOutlined,
} from '@ant-design/icons-vue'

const router = useRouter()

// 侧边栏折叠状态
const isCollapsed = ref(true)
const current = ref('menu_file')

// 菜单项（仅保留：文件 + Chat + Agent，设置在底部）
const menuItems = ref([
  {
    key: 'menu_file',
    icon: FileFilled,
    title: '文件',
    pageName: 'File',
    params: {},
  },
  {
    key: 'menu_chat',
    icon: MessageOutlined,
    title: 'Chat',
    pageName: 'Chat',
    params: {},
  },
  {
    key: 'menu_agent',
    icon: RobotOutlined,
    title: 'Agent',
    pageName: 'Agent',
    params: {},
  },
])

// 设置菜单项（独立放在底部）
const settingItem = {
  key: 'menu_setting',
  icon: SettingOutlined,
  title: '设置',
  pageName: 'Setting',
  params: {},
}

// 合并菜单映射（用于路由跳转）
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

<style lang="less" scoped>
// ===== Proma 风格侧边栏 =====
// 设计要点：
// 1. 可折叠：展开 240px / 折叠 60px
// 2. 底部放置设置按钮
// 3. 活跃状态用饱满色彩 + 圆角
// 4. 悬停状态用半透明背景
// 5. 折叠时显示 tooltip
// 6. 背景使用渐变，为未来主题留下空间

.pi-sidebar {
  display: flex;
  flex-direction: column;
  width: 240px;
  height: 100vh;
  background: linear-gradient(180deg, #fafbfc 0%, #f0f2f5 100%);
  border-right: 1px solid rgba(0, 0, 0, 0.04);
  transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
  flex-shrink: 0;
  user-select: none;

  &--collapsed {
    width: 60px;
  }
}

// ===== Logo 区域 =====
.pi-sidebar__logo {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  cursor: pointer;
  min-height: 56px;
  transition: padding 0.25s ease;

  .pi-sidebar--collapsed & {
    justify-content: center;
    padding: 14px 0;
  }
}

.pi-sidebar__logo-img {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border-radius: 6px;
}

.pi-sidebar__logo-text {
  font-size: 15px;
  font-weight: 700;
  color: #1a1a2e;
  white-space: nowrap;
  letter-spacing: -0.3px;
}

// ===== 主菜单区域 =====
.pi-sidebar__nav {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  overflow-y: auto;
  overflow-x: hidden;

  // 隐藏滚动条
  &::-webkit-scrollbar {
    width: 0;
    display: none;
  }
}

// ===== 菜单项 =====
.pi-sidebar__item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 14px;
  height: 42px;
  border: none;
  background: transparent;
  border-radius: 10px;
  cursor: pointer;
  font-size: 14px;
  color: #595959;
  white-space: nowrap;
  transition: all 0.2s ease;
  position: relative;
  width: 100%;
  text-align: left;

  // 折叠时居中
  .pi-sidebar--collapsed & {
    justify-content: center;
    padding: 0;
  }

  // 悬停状态
  &:hover {
    background: rgba(22, 119, 255, 0.08);
    color: #1677ff;

    .pi-sidebar__tooltip {
      opacity: 1;
      transform: translateX(0);
    }
  }

  // 活跃状态：饱满色彩
  &--active {
    background: linear-gradient(135deg, #1677ff 0%, #4096ff 100%);
    color: #ffffff;
    box-shadow: 0 2px 8px rgba(22, 119, 255, 0.3);

    &:hover {
      background: linear-gradient(135deg, #1677ff 0%, #4096ff 100%);
      color: #ffffff;
    }
  }
}

// ===== 图标 =====
.pi-sidebar__icon {
  font-size: 20px;
  flex-shrink: 0;
  line-height: 1;
}

// ===== 文字标签 =====
.pi-sidebar__label {
  font-weight: 500;
  letter-spacing: -0.1px;
  overflow: hidden;
  text-overflow: ellipsis;
}

// ===== 折叠时的 tooltip =====
.pi-sidebar__tooltip {
  position: absolute;
  left: calc(100% + 8px);
  top: 50%;
  transform: translateY(-50%) translateX(-4px);
  background: #1a1a2e;
  color: #ffffff;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 12px;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: all 0.2s ease;
  z-index: 1000;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);

  // 只有折叠时显示 tooltip
  .pi-sidebar:not(.pi-sidebar--collapsed) & {
    display: none;
  }
}

// ===== 底部设置区域 =====
.pi-sidebar__footer {
  padding: 8px 10px 12px;
  border-top: 1px solid rgba(0, 0, 0, 0.04);
}
</style>
