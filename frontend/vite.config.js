import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import viteCompression from 'vite-plugin-compression'
import { fileViewerRenderers } from '@file-viewer/vite-plugin'

import path from 'path'
// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  return {
    // 项目插件
    plugins: [
      vue(),
      viteCompression({
        verbose: true,
        disable: false,
        threshold: 1025,
        algorithm: 'gzip',
        ext: '.gz',
      }),
      fileViewerRenderers({
        copyAssets: true
      }),
    ],
    // 基础配置
    base: './',
    publicDir: 'public',
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
      // 强制 vue 解析为同一实例
      dedupe: ['vue'],
    },
    server: {
      watch: {
        // 忽略 @file-viewer/vite-plugin 启动时写入的静态资源目录，
        // 避免文件监听触发 HMR 导致 plugin-vue 的 invalidateTypeCache null 错误
        ignored: [
          '**/public/file-viewer/**',
        ],
      },
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      assetsInlineLimit: 4096,
      cssCodeSplit: true,
      brotliSize: false,
      sourcemap: false,
      minify: 'terser',
      terserOptions: {
        compress: {
          // 生产环境去除console及debug
          drop_console: false,
          drop_debugger: true,
        },
      },
      // 分包策略：将大型第三方依赖拆分为独立 chunk，
      // 减少 Vite 构建时单个模块图的大小，降低内存峰值
      rollupOptions: {
        output: {
          manualChunks: {
            // Vue 生态
            'vue-vendor': ['vue', 'vue-router', 'pinia', 'vuex', 'vue-i18n'],
            // Markdown 渲染生态（markstream + mermaid + katex + shiki）
            'markdown-vendor': ['markstream-vue', 'md-editor-v3', 'mermaid', 'katex', 'shiki', 'dompurify'],
            // 编辑器
            'editor-vendor': ['monaco-editor'],
            // TipTap 富文本
            'tiptap-vendor': [
              '@tiptap/starter-kit',
              '@tiptap/vue-3',
              '@tiptap/extension-link',
              '@tiptap/extension-mention',
              '@tiptap/extension-placeholder',
              '@tiptap/extension-underline',
            ],
            // 文件查看器
            'file-viewer-vendor': ['@file-viewer/vue3-full'],
            // 表格 + 图表
            'data-vendor': ['@tanstack/vue-table', '@antv/infographic', '@terrastruct/d2'],
            // 工具库
            'utils-vendor': ['dayjs', 'axios', 'clsx', 'tailwind-merge', 'class-variance-authority'],
          },
        },
      },
    },
  }
})


