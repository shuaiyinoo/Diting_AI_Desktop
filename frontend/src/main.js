import * as AntIcon from '@ant-design/icons-vue';
import Antd from 'ant-design-vue';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import './assets/global.less';
import './assets/theme.less';
// markstream-vue 流式 Markdown 渲染器样式（全局导入一次）
import 'markstream-vue/index.css';
import components from './components/global';
import Router from './router/index';
import { initMarkdownFontSize } from './utils/markdown-font-size';

const app = createApp(App)
app.config.productionTip = false

// components
for (const i in components) {
  app.component(i, components[i])
}

// icon
for (const i in AntIcon) {
  const whiteList = ['createFromIconfontCN', 'getTwoToneColor', 'setTwoToneColor', 'default']
  if (!whiteList.includes(i)) {
    app.component(i, AntIcon[i])
  }
}

// 初始化 Markdown 字号（从 localStorage 读取并应用到 DOM）
initMarkdownFontSize();

app.use(Antd).use(createPinia()).use(Router).mount('#app')
