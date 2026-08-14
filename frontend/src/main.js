import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';

// ===== 全局样式 =====
// markstream-vue 流式 Markdown 渲染器样式（必须在 globals.css 之前导入）
import 'markstream-vue/index.css';
import 'katex/dist/katex.min.css';
// Tailwind CSS + shadcn-vue 全局变量 + 第三方组件覆盖
import './styles/globals.css';

// ===== dayjs 插件扩展 =====
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import advancedFormat from 'dayjs/plugin/advancedFormat';
import weekday from 'dayjs/plugin/weekday';
import localeData from 'dayjs/plugin/localeData';
import weekOfYear from 'dayjs/plugin/weekOfYear';
import weekYear from 'dayjs/plugin/weekYear';
import quarterOfYear from 'dayjs/plugin/quarterOfYear';

dayjs.extend(customParseFormat);
dayjs.extend(advancedFormat);
dayjs.extend(weekday);
dayjs.extend(localeData);
dayjs.extend(weekOfYear);
dayjs.extend(weekYear);
dayjs.extend(quarterOfYear);

import { enableKatex, enableMermaid } from 'markstream-vue';
import components from './components/global';
import Router from './router/index';
import { initMarkdownFontSize } from './utils/markdown-font-size';

// 启用 Mermaid 图表和 KaTeX 数学公式渲染（需对应 peer 依赖已安装）
enableMermaid();
enableKatex();

const app = createApp(App)
app.config.productionTip = false

// 全局注册自定义组件
for (const i in components) {
  app.component(i, components[i])
}

// 初始化 Markdown 字号（从 localStorage 读取并应用到 DOM）
initMarkdownFontSize();

app.use(createPinia()).use(Router).mount('#app')
