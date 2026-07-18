<template>
  <a-layout id="app-layout-sider">
    <a-layout-sider
      v-model="collapsed"
      theme="light"
      class="layout-sider"
      width="80"
      :collapsedWidth="80"
    >
      <div class="logo">
        <img class="pic-logo" src="~@/assets/logo.png">
      </div>
      <a-menu
        class="menu-item"
        theme="light"
        mode="inline"
        :selectedKeys="[current]"
        @click="menuHandle"
      >
        <a-menu-item v-for="(menuInfo, index) in menu" :key="index">
          <div class="menu-item-box">
            <component :is="menuInfo.icon" class="menu-icon" />
            <span class="menu-title">{{ menuInfo.title }}</span>
          </div>
        </a-menu-item>
      </a-menu>
    </a-layout-sider>
    <a-layout>
      <a-layout-content class="layout-content">
        <router-view />
      </a-layout-content>
    </a-layout>
  </a-layout>
</template>
<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();

const collapsed = ref(true);
const current = ref('menu_debug');
const menu = ref({
  'menu_file': {
    icon: 'FileFilled',
    title: '文件',
    pageName: 'File',
    params: {}
  },
  'menu_qa': {
    icon: 'QuestionCircleFilled',
    title: 'QA',
    pageName: 'Qa',
    params: {}
  },
  'menu_rag': {
    icon: 'DatabaseFilled',
    title: 'RAG',
    pageName: 'Rag',
    params: {}
  },
  'menu_debug': {
    icon: 'BugFilled',
    title: '调试',
    pageName: 'Debug',
    params: {}
  },
  'menu_adjust': {
    icon: 'SlidersFilled',
    title: '调整',
    pageName: 'Adjust',
    params: {}
  },
  'menu_setting': {
    icon: 'SettingFilled',
    title: '设置',
    pageName: 'Setting',
    params: {}
  },
});

onMounted(() => {
  menuHandle();
});

function menuHandle(e) {
  if (e) {
    current.value = e.key;
  }
  const linkInfo = menu.value[current.value];
  router.push({ name: linkInfo.pageName, params: linkInfo.params });
}
</script>
<style lang="less" scoped>
#app-layout-sider {
  height: 100vh;

  .logo {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 12px 0;
  }

  .pic-logo {
    height: 36px;
    margin: 0;
  }

  .layout-content {
    background-color: #ffffff;
    height: 100%;
    overflow: hidden;
  }
}

// 使用 :deep() 穿透 scoped 边界，覆盖 Ant Design 组件内部样式
.layout-sider {
  background-color: #f0f2f5 !important;
  height: 100vh;
}

.menu-item {
  // 菜单容器样式
  background-color: transparent !important;
  border: none !important;
}

// 关键：使用 :deep() 覆盖 Ant Design Menu 默认的高度样式
:deep(.ant-menu-item) {
  // 覆盖默认的 line-height: 46px 和 height
  line-height: 1 !important;
  height: 64px !important;
  min-height: 64px !important;

  // 覆盖默认的 padding 和 margin
  padding: 0 !important;
  margin: 6px 8px !important;

  // 覆盖默认的宽度
  width: 64px !important;

  // 圆角和过渡效果
  border-radius: 10px !important;
  border: none !important;
  background: transparent !important;
  transition: all 0.3s ease;

  // 悬停状态
  &:hover {
    background-color: rgba(22, 119, 255, 0.1) !important;
  }

  // 选中状态
  &.ant-menu-item-selected {
    background-color: #1677ff !important;

    .menu-icon {
      // TwoTone 图标为双色，使用滤镜将其变为纯白色
      filter: brightness(0) invert(1);
    }

    .menu-title {
      color: #ffffff;
    }
  }
}

// 图标和文字容器：纵向布局
.menu-item-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

// 图标样式（Ant Design 图标组件，需 :deep 穿透）
:deep(.menu-icon) {
  font-size: 30px;
  line-height: 1;
  margin-bottom: 6px;
  color: #1677ff;
}

:deep(.anticon) {
  font-size: 18px !important;
}

// 文字样式
.menu-title {
  font-size: 14px;
  line-height: 1;
  color: #1677ff;
  font-weight: 600;
  margin-left: -0px !important;
}
</style>