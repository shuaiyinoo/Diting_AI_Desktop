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
      // 强制 dayjs 解析为同一实例，避免 ant-design-vue 预打包的 dayjs
      // 与应用代码 import 的 dayjs 产生多实例问题
      dedupe: ['dayjs', 'vue'],
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
    css: {
      preprocessorOptions: {
        less: {
          modifyVars: {
            '@border-color-base': '#d9d9d9',
          },
          javascriptEnabled: true,
        },
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
    },
  }
})


