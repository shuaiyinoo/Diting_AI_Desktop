import { ref, computed } from 'vue';
import { theme as antTheme } from 'ant-design-vue';

// ========== 暗色主题状态 ==========
const isDark = ref(localStorage.getItem('app-theme') === 'dark');

// 初始化时同步到 <html data-theme="...">
function syncHtmlAttr() {
  document.documentElement.setAttribute('data-theme', isDark.value ? 'dark' : 'light');
}
syncHtmlAttr();

function toggleTheme() {
  isDark.value = !isDark.value;
  localStorage.setItem('app-theme', isDark.value ? 'dark' : 'light');
  syncHtmlAttr();
}

// ========== Ant Design Vue 主题配置 ==========
const themeConfig = computed(() => ({
  algorithm: isDark.value ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
  token: {
    colorPrimary: '#1677ff',
    borderRadius: 8,
    fontSize: 14,
  },
}));

export { isDark, themeConfig, toggleTheme };
