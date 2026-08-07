import * as AntIcon from '@ant-design/icons-vue';
import Antd from 'ant-design-vue';
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';

// markstream-vue 流式 Markdown 渲染器样式（必须在自定义样式之前导入，
// 确保自定义 global.less 能覆盖组件默认样式）
import 'markstream-vue/index.css';
import 'katex/dist/katex.min.css';
import './assets/global.less';
import './assets/theme.less';

// ===== dayjs 插件扩展 =====
// ant-design-vue 预打包了自己的 dayjs 并扩展了插件，
// 但应用代码 import 的 dayjs 是独立实例，需要同步扩展相同插件，
// 否则 DatePicker/TimePicker 点击时会报 "weekday is not a function"
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
