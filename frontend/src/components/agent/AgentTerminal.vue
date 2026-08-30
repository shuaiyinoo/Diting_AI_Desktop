<template>
  <div class="flex h-full w-full flex-col overflow-hidden bg-background">
    <!-- 顶部终端 Tab 栏 -->
    <div class="scrollbar-hide flex h-9 shrink-0 items-center overflow-x-auto border-b border-border bg-muted/30">
      <!-- 新建终端按钮 -->
      <Tooltip side="bottom">
        <TooltipTrigger as-child>
          <button
            class="flex h-full shrink-0 items-center justify-center border-r border-border px-3 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            @click="createNewTerminal"
          >
            <Plus :size="16" />
          </button>
        </TooltipTrigger>
        <TooltipContent>{{ t('agentTerminal.newTerminal') }}</TooltipContent>
      </Tooltip>

      <!-- 空状态提示 -->
      <div v-if="terminals.length === 0" class="flex items-center gap-2 px-4 text-xs text-muted-foreground">
        <TerminalIcon :size="14" />
        <span>{{ t('agentTerminal.noTerminal') }}</span>
      </div>

      <!-- 终端 Tab 列表 -->
      <div
        v-for="term in terminals"
        :key="term.id"
        class="group flex h-full shrink-0 cursor-pointer items-center gap-1.5 border-r border-border px-3 transition-colors"
        :class="term.id === activeTerminalId ? 'bg-background text-foreground' : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'"
        @click="activateTerminal(term.id)"
      >
        <TerminalIcon :size="13" class="shrink-0" />
        <span class="max-w-[120px] truncate text-xs">{{ term.title }}</span>
        <button
          class="flex size-4 shrink-0 items-center justify-center rounded-sm opacity-0 transition-opacity hover:bg-accent hover:text-accent-foreground group-hover:opacity-100"
          @click.stop="closeTerminal(term.id)"
        >
          <X :size="12" />
        </button>
      </div>
    </div>

    <!-- 终端容器区域 -->
    <div class="min-h-0 flex-1 relative">
      <!-- 每个终端的容器，通过 v-show 切换显示（保持 xterm 实例不销毁） -->
      <div
        v-for="term in terminals"
        :key="term.id"
        v-show="term.id === activeTerminalId"
        :ref="(el) => { if (el) terminalContainerRefs[term.id] = el }"
        class="terminal-container h-full w-full p-[5px]"
      />
      <!-- 空状态 -->
      <div v-if="terminals.length === 0" class="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <TerminalIcon :size="40" class="opacity-30" />
        <span class="text-xs">{{ t('agentTerminal.emptyHint') }}</span>
        <button
          class="mt-2 flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          @click="createNewTerminal"
        >
          <Plus :size="14" />
          {{ t('agentTerminal.newTerminal') }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { Plus, X, TerminalSquare as TerminalIcon } from '@lucide/vue'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { ipc } from '@/utils/ipcRenderer'
import { ipcApiRoute } from '@/api'
import { isDark, baseColor } from '@/theme'
import '@xterm/xterm/css/xterm.css'



const { t } = useI18n()

const props = defineProps({
  /** 终端默认工作目录 */
  cwd: { type: String, default: '' },
  /** 是否可见（由父组件控制显示/隐藏） */
  visible: { type: Boolean, default: true },
})

/**
 * 终端实例信息
 * @typedef {{ id: string, title: string, term: Terminal|null, fitAddon: FitAddon|null, resizeObserver: ResizeObserver|null, ipcDataHandler: Function|null, ipcExitHandler: Function|null, onDataDisposable: { dispose: Function }|null }}
 */

const terminals = ref([])
const activeTerminalId = ref(null)
const terminalContainerRefs = ref({})

/** 终端 ID 自增计数器 */
let terminalCounter = 0

/** 生成终端 ID */
function generateTerminalId() {
  terminalCounter++
  return `term-${Date.now()}-${terminalCounter}`
}

/**
 * 从 CSS 变量读取 HSL 值并转换为 xterm 可用的 hex 颜色
 */
function cssVarToHex(varName) {
  const root = document.documentElement
  const hsl = getComputedStyle(root).getPropertyValue(varName).trim()
  if (!hsl) return null
  const parts = hsl.split(/\s+/)
  if (parts.length < 3) return null
  const h = parseFloat(parts[0])
  const s = parseFloat(parts[1])
  const l = parseFloat(parts[2])
  return hslToHex(h, s, l)
}

/** HSL 转 Hex */
function hslToHex(h, s, l) {
  s /= 100
  l /= 100
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0
  if (h < 60) { r = c; g = x; b = 0 }
  else if (h < 120) { r = x; g = c; b = 0 }
  else if (h < 180) { r = 0; g = c; b = x }
  else if (h < 240) { r = 0; g = x; b = c }
  else if (h < 300) { r = x; g = 0; b = c }
  else { r = c; g = 0; b = x }
  const toHex = (v) => {
    const val = Math.round((v + m) * 255)
    return val.toString(16).padStart(2, '0')
  }
  return '#' + toHex(r) + toHex(g) + toHex(b)
}

/**
 * 根据 CSS 变量构建 xterm 主题
 *
 * 包含完整的 ANSI 16 色调色板（深色/浅色两套），
 * 使 ls、git diff、grep --color 等工具输出丰富的彩色。
 */
function buildXtermTheme() {
  const dark = isDark.value
  const bg = cssVarToHex('--background') || (dark ? '#000000' : '#ffffff')
  const fg = cssVarToHex('--foreground') || (dark ? '#e0e0e0' : '#1a1a1a')
  const mutedFg = cssVarToHex('--muted-foreground') || (dark ? '#808080' : '#666666')
  const cursor = cssVarToHex('--foreground') || fg
  const selection = cssVarToHex('--accent') || (dark ? '#264f78' : '#b3d7ff')

  // ANSI 16 色调色板
  // 深色主题使用饱和度较高的配色，浅色主题适当降低明度
  const ansi = dark
    ? {
        // 标准 0-7
        black: '#282828',
        red: '#cc241d',
        green: '#98971a',
        yellow: '#d79921',
        blue: '#458588',
        magenta: '#b16286',
        cyan: '#689d6a',
        white: '#a89984',
        // 亮色 8-15
        brightBlack: '#928374',
        brightRed: '#fb4934',
        brightGreen: '#b8bb26',
        brightYellow: '#fabd2f',
        brightBlue: '#83a598',
        brightMagenta: '#d3869b',
        brightCyan: '#8ec07c',
        brightWhite: '#ebdbb2',
      }
    : {
        // 浅色主题
        black: '#3c3836',
        red: '#cc241d',
        green: '#98971a',
        yellow: '#d79921',
        blue: '#458588',
        magenta: '#b16286',
        cyan: '#689d6a',
        white: '#7c6f64',
        brightBlack: '#928374',
        brightRed: '#9d0006',
        brightGreen: '#79740e',
        brightYellow: '#b57614',
        brightBlue: '#076678',
        brightMagenta: '#8f3f71',
        brightCyan: '#427858',
        brightWhite: '#3c3836',
      }

  return {
    background: bg,
    foreground: fg,
    cursor,
    cursorAccent: bg,
    selectionBackground: selection,
    ...ansi,
  }
}

/**
 * 创建新的终端实例
 */
async function createNewTerminal() {
  const terminalId = generateTerminalId()

  // 先创建 DOM 容器（通过 v-for 渲染），等待 nextTick
  terminals.value.push({
    id: terminalId,
    title: 'Terminal ' + (terminals.value.length + 1),
    term: null,
    fitAddon: null,
    resizeObserver: null,
    ipcDataHandler: null,
    ipcExitHandler: null,
    onDataDisposable: null,
  })
  activeTerminalId.value = terminalId

  await nextTick()

  const container = terminalContainerRefs.value[terminalId]
  if (!container) {
    console.error('[AgentTerminal] 容器元素不存在:', terminalId)
    return
  }

  // 创建 xterm 实例
  const term = new Terminal({
    fontSize: 13,
    fontFamily: 'var(--font-mono, "SF Mono", Menlo, Monaco, ui-monospace, monospace)',
    cursorBlink: true,
    cursorStyle: 'bar',
    allowProposedApi: true,
    scrollback: 10000,
    theme: buildXtermTheme(),
  })

  // 加载 addon
  const fitAddon = new FitAddon()
  const webLinksAddon = new WebLinksAddon()
  term.loadAddon(fitAddon)
  term.loadAddon(webLinksAddon)

  // 打开 xterm 到容器
  term.open(container)

  // 初始 fit
  fitAddon.fit()

  // 向后端创建伪终端进程
  const cols = term.cols || 80
  const rows = term.rows || 24
  try {
    const res = await ipc.invoke(ipcApiRoute.terminal.createTerminal, {
      terminalId,
      cwd: props.cwd || undefined,
      cols,
      rows,
    })
    if (res.code !== 0) {
      term.write('\r\n\x1b[31m' + t('agentTerminal.createFailed') + ': ' + res.message + '\x1b[0m')
      return
    }
  } catch (err) {
    term.write('\r\n\x1b[31m' + t('agentTerminal.createFailed') + ': ' + err + '\x1b[0m')
    return
  }

  // 监听用户输入 → 写入后端 pty
  const onDataDisposable = term.onData((data) => {
    ipc.invoke(ipcApiRoute.terminal.write, { terminalId, data })
  })

  // 监听后端推送的终端输出
  const ipcDataHandler = (_, event) => {
    if (event.terminalId === terminalId) {
      term.write(event.data)
    }
  }
  ipc.on(ipcApiRoute.terminal.onData, ipcDataHandler)

  // 监听终端进程退出
  const ipcExitHandler = (_, event) => {
    if (event.terminalId === terminalId) {
      term.write('\r\n\x1b[33m' + t('agentTerminal.processExited', { code: event.exitCode }) + '\x1b[0m\r\n')
    }
  }
  ipc.on(ipcApiRoute.terminal.onExit, ipcExitHandler)

  // 监听容器尺寸变化，同步 fit + resize pty
  const resizeObserver = new ResizeObserver(() => {
    if (term.isDisposed) return
    try {
      fitAddon.fit()
      ipc.invoke(ipcApiRoute.terminal.resize, {
        terminalId,
        cols: term.cols,
        rows: term.rows,
      })
    } catch {
      // 忽略 resize 错误
    }
  })
  resizeObserver.observe(container)

  // 更新终端实例信息
  const idx = terminals.value.findIndex((t2) => t2.id === terminalId)
  if (idx !== -1) {
    terminals.value[idx].term = term
    terminals.value[idx].fitAddon = fitAddon
    terminals.value[idx].resizeObserver = resizeObserver
    terminals.value[idx].ipcDataHandler = ipcDataHandler
    terminals.value[idx].ipcExitHandler = ipcExitHandler
    terminals.value[idx].onDataDisposable = onDataDisposable
  }
}

/** 切换激活的终端 */
function activateTerminal(id) {
  activeTerminalId.value = id
  // 切换后重新 fit
  nextTick(() => {
    const term = terminals.value.find((t) => t.id === id)
    if (term && term.fitAddon) {
      term.fitAddon.fit()
    }
  })
}

/** 关闭终端 */
function closeTerminal(id) {
  const idx = terminals.value.findIndex((t) => t.id === id)
  if (idx === -1) return

  const term = terminals.value[idx]

  // 通知后端销毁终端
  ipc.invoke(ipcApiRoute.terminal.destroyTerminal, { terminalId: id }).catch(() => {})

  // 清理 IPC 监听
  if (term.ipcDataHandler) {
    ipc.removeListener(ipcApiRoute.terminal.onData, term.ipcDataHandler)
  }
  if (term.ipcExitHandler) {
    ipc.removeListener(ipcApiRoute.terminal.onExit, term.ipcExitHandler)
  }

  // 清理 ResizeObserver
  if (term.resizeObserver) {
    term.resizeObserver.disconnect()
  }

  // 清理 onData disposable
  if (term.onDataDisposable) {
    term.onDataDisposable.dispose()
  }

  // 销毁 xterm 实例
  if (term.term) {
    term.term.dispose()
  }

  // 从列表中移除
  terminals.value.splice(idx, 1)
  delete terminalContainerRefs.value[id]

  // 切换到相邻终端
  if (activeTerminalId.value === id) {
    if (terminals.value.length > 0) {
      const nextIdx = Math.min(idx, terminals.value.length - 1)
      activeTerminalId.value = terminals.value[nextIdx].id
    } else {
      activeTerminalId.value = null
    }
  }
}

/** 关闭所有终端 */
function closeAllTerminals() {
  const ids = terminals.value.map((t) => t.id)
  for (const id of ids) {
    closeTerminal(id)
  }
}

/** 监听主题变化，更新所有终端的主题 */
watch([isDark, baseColor], () => {
  const theme = buildXtermTheme()
  for (const term of terminals.value) {
    if (term.term && !term.term.isDisposed) {
      term.term.options.theme = theme
    }
  }
})

/** 监听 visible 变化：面板从隐藏变可见时需要重新 fit */
watch(() => props.visible, (visible) => {
  if (visible) {
    nextTick(() => {
      for (const term of terminals.value) {
        if (term.fitAddon) {
          try {
            term.fitAddon.fit()
          } catch {
            // 忽略
          }
        }
      }
    })
  }
})

onMounted(async () => {
  await nextTick()
  // 默认创建一个终端
  if (terminals.value.length === 0) {
    await createNewTerminal()
  }
})

onBeforeUnmount(() => {
  // 组件卸载时关闭所有终端
  closeAllTerminals()
})

/** 暴露方法供父组件调用 */
defineExpose({
  createNewTerminal,
  closeAllTerminals,
})
</script>

<style scoped>
/* 终端容器内边距，使内容与边缘保持间距 */
.terminal-container .xterm {
  padding: 5px;
}

/* 隐藏顶部 Tab 栏的滚动条 */
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
</style>
