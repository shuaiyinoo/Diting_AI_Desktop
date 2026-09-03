<template>
  <div class="flex h-full w-full flex-col overflow-hidden bg-background">
    <!-- 顶部 Tabs 栏 -->
    <div class="scrollbar-hide flex h-10 shrink-0 items-center overflow-x-auto border-b border-border">
      <!-- 关闭编辑器按钮 -->
      <Tooltip side="bottom">
        <TooltipTrigger as-child>
          <button
            class="flex h-full shrink-0 items-center justify-center border-r border-border px-3 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            @click="$emit('close-all')"
          >
            <X :size="16" />
          </button>
        </TooltipTrigger>
        <TooltipContent>{{ t('agentCodeEditor.closeAllAndHide') }}</TooltipContent>
      </Tooltip>

      <!-- 空状态提示 -->
      <div v-if="openFiles.length === 0" class="flex items-center gap-2 px-4 text-xs text-muted-foreground">
        <Code :size="14" />
        <span>{{ t('agentCodeEditor.noFileOpened') }}</span>
      </div>

      <!-- 文件 Tab -->
      <div
        v-for="file in openFiles"
        :key="file.id"
        class="group flex h-full shrink-0 cursor-pointer items-center gap-1.5 border-r border-border px-3 transition-colors"
        :class="file.id === activeFileId ? 'bg-background text-foreground' : 'bg-muted/30 text-muted-foreground hover:bg-muted/50'"
        @click="$emit('activate-file', file.id)"
      >
        <!-- git 状态标记：红色 A / 绿色 M / 橙色 M(编辑) / FileText 图标 -->
        <span v-if="file.gitStatus === 'untracked' || file.gitStatus === 'added'" class="flex size-[13px] shrink-0 items-center justify-center text-[10px] font-bold text-red-500">A</span>
        <span v-else-if="file.gitStatus === 'edited'" class="flex size-[13px] shrink-0 items-center justify-center text-[10px] font-bold text-orange-500">M</span>
        <span v-else-if="file.gitStatus === 'modified'" class="flex size-[13px] shrink-0 items-center justify-center text-[10px] font-bold text-green-500">M</span>
        <FileText v-else :size="13" class="shrink-0" />
        <span class="max-w-[140px] truncate text-xs">{{ file.name }}</span>
        <button
          class="flex size-4 shrink-0 items-center justify-center rounded-sm opacity-0 transition-opacity hover:bg-accent hover:text-accent-foreground group-hover:opacity-100"
          @click.stop="$emit('close-file', file.id)"
        >
          <X :size="12" />
        </button>
      </div>

      <!-- 右侧终端按钮 -->
      <div class="ml-auto flex h-full shrink-0 items-center">
        <Tooltip side="bottom">
          <TooltipTrigger as-child>
            <button
              class="flex h-full items-center justify-center border-l border-border px-3 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              :class="terminalPanelVisible ? 'text-accent-foreground' : ''"
              @click="$emit('toggle-terminal')"
            >
              <TerminalSquare :size="16" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{{ terminalPanelVisible ? t('agentTerminal.hidePanel') : t('agentTerminal.showPanel') }}</TooltipContent>
        </Tooltip>
      </div>
    </div>

    <!-- 编辑器主体 -->
    <div class="min-h-0" :class="terminalPanelVisible ? 'flex-1' : 'flex-1'">
      <div v-if="!activeFile" class="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <Code :size="40" class="opacity-30" />
        <span class="text-xs">{{ t('agentCodeEditor.emptyHint') }}</span>
      </div>
      <!-- diff 对比视图 -->
      <div v-show="activeFile && activeFile.originalContent !== undefined" ref="diffEditorContainerRef" class="h-full w-full" />
      <!-- 普通编辑器视图 -->
      <div v-show="activeFile && activeFile.originalContent === undefined" ref="editorContainerRef" class="h-full w-full" />
    </div>

    <!-- 终端面板（位于编辑器下方） -->
    <div v-if="terminalPanelVisible" class="flex min-h-0 flex-col border-t border-border" :style="{ height: terminalHeight + 'px', flexShrink: 0 }">
      <!-- 终端面板拖拽分隔条 -->
      <div
        class="h-[4px] cursor-row-resize flex items-center justify-center flex-shrink-0 bg-card transition-colors hover:bg-primary/10"
        @mousedown="onTerminalResizeStart"
      >
        <div class="h-px w-full bg-border" />
      </div>
      <AgentTerminal
        ref="terminalRef"
        :visible="terminalPanelVisible"
        :cwd="terminalCwd"
        class="min-h-0 flex-1"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount, onActivated, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { FileText, Code, X, TerminalSquare } from '@lucide/vue'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import AgentTerminal from '@/components/agent/AgentTerminal.vue'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import { isDark, baseColor } from '@/theme'

const { t } = useI18n()

/** 自定义 Monaco 主题名称 */
const MONACO_THEME_LIGHT = 'diting-light'
const MONACO_THEME_DARK = 'diting-dark'

/**
 * 从 CSS 变量读取 HSL 值并转换为 Monaco 可用的 hex 颜色
 * Monaco 的 defineTheme 不支持 hsl() 格式，需要转为 #RRGGBB
 */
function cssVarToHex(varName) {
  const root = document.documentElement
  const hsl = getComputedStyle(root).getPropertyValue(varName).trim()
  if (!hsl) return null
  // 格式："H S% L%"
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
 * 定义并应用自定义 Monaco 主题，仅覆盖背景色相关属性，
 * 使编辑器背景跟随应用主题（baseColor 等）联动，其余样式保持 Monaco 默认
 */
function defineAndApplyMonacoTheme() {
  if (!editor) return

  const dark = isDark.value
  const themeName = dark ? MONACO_THEME_DARK : MONACO_THEME_LIGHT

  // 仅读取背景相关颜色
  const bg = cssVarToHex('--background') || (dark ? '#000000' : '#ffffff')

  monaco.editor.defineTheme(themeName, {
    base: dark ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': bg,
      'editorGutter.background': bg,
    },
  })

  monaco.editor.setTheme(themeName)
}

// 注册 Monaco Web Worker：按语言返回对应的 worker
self.MonacoEnvironment = {
  getWorker(_, label) {
    switch (label) {
      case 'json':
        return new jsonWorker()
      case 'css':
      case 'scss':
      case 'less':
        return new cssWorker()
      case 'html':
        return new htmlWorker()
      case 'typescript':
      case 'javascript':
        return new tsWorker()
      default:
        return new editorWorker()
    }
  },
}

const props = defineProps({
  /** 已打开的文件列表 */
  openFiles: { type: Array, default: () => [] },
  /** 当前活跃文件 ID */
  activeFileId: { type: String, default: null },
  /** 终端面板是否可见 */
  terminalPanelVisible: { type: Boolean, default: false },
  /** 终端默认工作目录 */
  terminalCwd: { type: String, default: '' },
})

const emit = defineEmits(['activate-file', 'close-file', 'content-changed', 'save-file', 'close-all', 'open-file-by-path', 'toggle-terminal'])

// ========== 终端面板高度拖拽 ==========
const terminalRef = ref(null)
const terminalHeight = ref(200)

/** 终端面板拖拽 resize 开始 */
function onTerminalResizeStart(event) {
  event.preventDefault()
  const startY = event.clientY
  const startHeight = terminalHeight.value
  document.body.style.cursor = 'row-resize'
  document.body.style.userSelect = 'none'

  function onMouseMove(e) {
    const delta = startY - e.clientY
    const newHeight = Math.max(60, Math.min(800, startHeight + delta))
    terminalHeight.value = newHeight
  }

  function onMouseUp() {
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }

  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

/** 是否为 JS/TS 文件（支持跨文件跳转的语言） */
function isJsOrTs(ext) {
  const lower = (ext || '').toLowerCase()
  return ['js', 'jsx', 'ts', 'tsx'].includes(lower)
}

/**
 * 为 JS/TS 文件构造 file:// URI，让 Monaco TS worker 能识别文件路径
 * 非附加目录文件或非 JS/TS 文件返回 undefined（使用默认随机 URI）
 */
function getFileUri(file) {
  if (!file || !file.attachedDirPath || !isJsOrTs(file.ext)) return undefined
  const fullPath = file.attachedDirPath + '/' + file.path
  return monaco.Uri.parse('file://' + fullPath)
}

/**
 * 配置 TypeScript/JavaScript 语言服务的编译选项
 * 让 TS worker 能正确解析 ES module import 路径
 * 只执行一次
 */
let tsConfigured = false
function configureTsDefaults() {
  if (tsConfigured) return
  tsConfigured = true
  const ts = monaco.languages.typescript

  const compilerOptions = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    allowJs: true,
    allowNonTsExtensions: true,
    noEmit: true,
    skipLibCheck: true,
    esModuleInterop: true,
    jsx: ts.JsxEmit.React,
  }

  ts.typescriptDefaults.setCompilerOptions(compilerOptions)
  ts.javascriptDefaults.setCompilerOptions(compilerOptions)

  // 关闭语义诊断（消除 "Cannot find module" 飘红），保留语法诊断（括号/分号等语法错误）
  ts.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: false,
    onlyVisible: true,
  })
  ts.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: false,
    onlyVisible: true,
  })

  // 开启 eager model sync，让 worker 能感知所有已创建的 model
  ts.typescriptDefaults.setEagerModelSync(true)
  ts.javascriptDefaults.setEagerModelSync(true)

  // 禁用内置 definition provider，由自定义 provider 统一处理
  // 避免 Monaco 内置 DefinitionAdapter 在目标 model 不存在时返回 null 导致跳转失败
  ts.typescriptDefaults.setModeConfiguration({
    ...ts.typescriptDefaults.modeConfiguration,
    definitions: false,
  })
  ts.javascriptDefaults.setModeConfiguration({
    ...ts.javascriptDefaults.modeConfiguration,
    definitions: false,
  })
}

/** 自定义 definition provider 的 dispose 函数列表 */
const providerDisposables = []

/**
 * 注册自定义 DefinitionProvider，拦截跨文件跳转
 * 当 Monaco 内置 TS worker 找到定义位置但目标 model 不存在时，
 * 通过 emit 通知父组件异步打开目标文件
 */
function registerCrossFileDefinitionProvider() {
  const ts = monaco.languages.typescript

  for (const lang of ['javascript', 'typescript']) {
    providerDisposables.push(
      monaco.languages.registerDefinitionProvider(lang, {
        async provideDefinition(model, position) {
          const offset = model.getOffsetAt(position)
          // 获取对应语言的 worker
          // ts.getTypeScriptWorker() 返回 Promise<getWorkerFn>，getWorkerFn(uri) 返回 Promise<worker>
          const getWorkerFn = lang === 'typescript'
            ? await ts.getTypeScriptWorker()
            : await ts.getJavaScriptWorker()
          const worker = await getWorkerFn(model.uri)

          let entries
          try {
            entries = await worker.getDefinitionAtPosition(model.uri.toString(), offset)
          } catch {
            return null
          }

          if (!entries || entries.length === 0) return null

          const results = []
          for (const entry of entries) {
            const targetUri = monaco.Uri.parse(entry.fileName)
            let targetModel = monaco.editor.getModel(targetUri)

            if (targetModel) {
              // 目标 model 已存在（文件已打开），正常返回跳转位置
              const range = textSpanToRange(targetModel, entry.textSpan)
              results.push({ uri: targetModel.uri, range })
            } else {
              // 目标文件未打开：解析路径并通知父组件打开
              const filePath = decodeURIComponent(targetUri.path).replace(/^\//, '')
              // 从 openFiles 中查找匹配的 attachedDirPath
              const file = props.openFiles.find((f) =>
                f.attachedDirPath && filePath.startsWith(f.attachedDirPath + '/')
              )
              const attachedDirPath = file?.attachedDirPath || findAttachedDirForPath(filePath)
              if (attachedDirPath) {
                const relativePath = filePath.substring(attachedDirPath.length + 1)
                emit('open-file-by-path', {
                  dirPath: attachedDirPath,
                  relativePath,
                  offset: entry.textSpan.start,
                })
              }
            }
          }

          return results.length > 0 ? results : null
        },
      })
    )
  }
}

/**
 * 从路径中查找属于哪个附加目录
 * 遍历 openFiles 中所有已知的 attachedDirPath，找到最长匹配
 */
function findAttachedDirForPath(filePath) {
  const dirs = props.openFiles
    .filter((f) => f.attachedDirPath)
    .map((f) => f.attachedDirPath)
  // 去重并按长度降序排列，优先匹配最长路径
  const uniqueDirs = [...new Set(dirs)].sort((a, b) => b.length - a.length)
  for (const dir of uniqueDirs) {
    if (filePath.startsWith(dir + '/') || filePath === dir) {
      return dir
    }
  }
  return null
}

/** 将 TS worker 返回的 textSpan 转换为 Monaco Range */
function textSpanToRange(model, textSpan) {
  if (!textSpan) return new monaco.Range(1, 1, 1, 1)
  const startPos = model.getPositionAt(textSpan.start)
  const endPos = model.getPositionAt(textSpan.start + textSpan.length)
  return new monaco.Range(
    startPos.lineNumber,
    startPos.column,
    endPos.lineNumber,
    endPos.column,
  )
}

/** 当前活跃文件对象 */
const activeFile = ref(null)

const editorContainerRef = ref(null)
const diffEditorContainerRef = ref(null)
let editor = null
let diffEditor = null
/** model 缓存：fileId → monaco.editor.ITextModel */
const modelCache = new Map()

/** 根据文件扩展名获取 Monaco 语言标识 */
function getLanguage(ext) {
  const map = {
    js: 'javascript', jsx: 'javascript',
    ts: 'typescript', tsx: 'typescript',
    vue: 'html',
    json: 'json',
    html: 'html',
    css: 'css', scss: 'scss', less: 'less',
    md: 'markdown',
    py: 'python',
    go: 'go',
    java: 'java',
    sh: 'shell', bash: 'shell',
    yml: 'yaml', yaml: 'yaml',
    xml: 'xml',
    sql: 'sql',
    c: 'c', cpp: 'cpp',
    rs: 'rust',
    php: 'php',
    rb: 'ruby',
    swift: 'swift',
    kt: 'kotlin',
    dart: 'dart',
    txt: 'plaintext',
  }
  return map[ext?.toLowerCase()] || 'plaintext'
}

/** 自动保存的防抖计时器 */
let saveTimer = null
const SAVE_DEBOUNCE_MS = 1000

/** 初始化 Monaco 编辑器 */
function initEditor() {
  if (!editorContainerRef.value || editor) return

  editor = monaco.editor.create(editorContainerRef.value, {
    value: '',
    language: 'plaintext',
    theme: isDark.value ? MONACO_THEME_DARK : MONACO_THEME_LIGHT,
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 13,
    fontFamily: 'var(--font-mono, "SF Mono", Menlo, Monaco, ui-monospace, monospace)',
    lineHeight: 20,
    scrollBeyondLastLine: false,
    renderLineHighlight: 'all',
    padding: { top: 8, bottom: 8 },
    scrollbar: {
      verticalScrollbarSize: 8,
      horizontalScrollbarSize: 8,
    },
  })

  // 初始化后立即定义并应用自定义主题
  defineAndApplyMonacoTheme()

  // 配置 TS/JS 语言服务，开启跨文件跳转支持
  configureTsDefaults()
  // 注册自定义 DefinitionProvider，处理跨文件跳转
  registerCrossFileDefinitionProvider()

  // 监听编辑器内容变化，同步内容到 file 对象并触发自动保存
  editor.onDidChangeModelContent(() => {
    if (!activeFile.value) return
    const model = editor.getModel()
    if (!model) return
    // 标记 model 已被用户编辑，防止外部 watch 重置内容
    model._userEdited = true
    // 将编辑器中的最新内容同步到 file 对象，避免 watch 重置内容
    const file = props.openFiles.find((f) => f.id === activeFile.value.id)
    if (file) {
      file.content = model.getValue()
    }
    emit('content-changed', activeFile.value.id)

    // 防抖自动保存
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      if (activeFile.value && file) {
        emit('save-file', activeFile.value.id)
      }
    }, SAVE_DEBOUNCE_MS)
  })
}

/** 获取或创建文件对应的 Monaco Model */
function getOrCreateModel(file) {
  if (!file) return null

  let model = modelCache.get(file.id)
  const language = getLanguage(file.ext)
  const uri = getFileUri(file)

  if (!model) {
    // 首次创建：使用 file.content
    if (uri) {
      // JS/TS 附加目录文件：用真实 file:// URI 创建
      // 让 TS worker 能跨文件解析 import 路径
      model = monaco.editor.createModel(file.content || '', language, uri)
    } else {
      model = monaco.editor.createModel(file.content || '', language)
    }
    modelCache.set(file.id, model)
  } else {
    // 已有 model：仅在内容确实不同且非用户编辑时更新
    // 如果 model 内容与 file.content 不同，说明用户编辑过，不覆盖
    const modelValue = model.getValue()
    const fileContent = file.content || ''
    if (modelValue !== fileContent) {
      // 只有当 model 内容是空的或 file 内容更新了才覆盖
      // 这种情况发生在外部重新加载文件内容时
      // 正常用户编辑时 file.content 已被同步为 model 值，不会进入这里
      // 但为安全起见，只在 model 未被编辑过时才覆盖
      // 使用标志位检查
      if (!model._userEdited) {
        model.setValue(fileContent)
      }
    }
    if (model.getLanguageId() !== language) {
      monaco.editor.setModelLanguage(model, language)
    }
  }

  return model
}

/** 更新编辑器内容 */
function updateEditorContent(file) {
  if (!file) return

  // 如果文件有 originalContent，显示 diff 对比视图
  const showDiff = file.originalContent !== undefined

  if (showDiff) {
    if (!diffEditor) {
      initDiffEditor()
    }
    if (editor) {
      editor.setModel(null)
    }
    updateDiffEditorContent(file)
    return
  }

  // 普通模式
  if (!editor) {
    initEditor()
  }
  if (diffEditor) {
    diffEditor.setModel(null)
  }
  const model = getOrCreateModel(file)
  if (model && editor) {
    editor.setModel(model)
  }
}

/** 初始化 Monaco diff 编辑器 */
function initDiffEditor() {
  if (!diffEditorContainerRef.value || diffEditor) return

  diffEditor = monaco.editor.createDiffEditor(diffEditorContainerRef.value, {
    theme: isDark.value ? MONACO_THEME_DARK : MONACO_THEME_LIGHT,
    automaticLayout: true,
    readOnly: true,
    renderSideBySide: true,
    fontSize: 13,
    fontFamily: 'var(--font-mono, "SF Mono", Menlo, Monaco, ui-monospace, monospace)',
    lineHeight: 20,
    scrollBeyondLastLine: false,
    padding: { top: 8, bottom: 8 },
    scrollbar: {
      verticalScrollbarSize: 8,
      horizontalScrollbarSize: 8,
    },
  })

  // 应用自定义主题
  defineAndApplyMonacoTheme()
}

/** 更新 diff 编辑器内容 */
function updateDiffEditorContent(file) {
  if (!diffEditor || !file) return

  const language = getLanguage(file.ext)

  // original = HEAD 版本的完整文件内容（由后端从 git show HEAD:path 获取）
  // modified = 当前文件内容（工作区版本）
  const originalContent = file.originalContent || ''
  const modifiedContent = file.content || ''

  const originalModel = monaco.editor.createModel(originalContent, language)
  const modifiedModel = monaco.editor.createModel(modifiedContent, language)

  diffEditor.setModel({
    original: originalModel,
    modified: modifiedModel,
  })
}

/** 监听主题变化（亮/暗切换 + 基础色调变化） */
watch([isDark, baseColor], () => {
  // 重新定义并应用自定义主题，使编辑器颜色跟随 CSS 变量联动
  defineAndApplyMonacoTheme()
})

/** 监听活跃文件变化，更新 activeFile 并加载内容 */
watch(() => props.activeFileId, async () => {
  activeFile.value = props.openFiles.find((f) => f.id === props.activeFileId) || null
  await nextTick()
  if (activeFile.value) {
    if (!editor) {
      initEditor()
    }
    if (editor) {
      updateEditorContent(activeFile.value)
    }
  } else if (editor) {
    editor.setModel(null)
  }
}, { immediate: true })

/** 监听文件列表变化 */
watch(() => props.openFiles, async () => {
  // 文件列表变化时，同步 activeFile
  activeFile.value = props.openFiles.find((f) => f.id === props.activeFileId) || null
  if (activeFile.value) {
    await nextTick()
    if (!editor) {
      initEditor()
    }
    // 仅在编辑器未初始化或模型不存在时更新
    // 不再每次 deep watch 都调用 updateEditorContent，避免重置用户编辑
    if (editor && !modelCache.has(activeFile.value.id)) {
      updateEditorContent(activeFile.value)
    }
  }
}, { deep: true })

/** 跨文件跳转事件处理函数引用（用于移除监听） */
let jumpHandler = null

onMounted(async () => {
  await nextTick()
  activeFile.value = props.openFiles.find((f) => f.id === props.activeFileId) || null
  if (activeFile.value) {
    initEditor()
    if (editor) {
      updateEditorContent(activeFile.value)
    }
  }

  // 监听跨文件跳转事件（由 Index.vue 通过 window event 派发）
  jumpHandler = (e) => {
    const { fileId, offset } = e.detail || {}
    if (!fileId || !editor) return
    // 切换到目标文件
    const targetFile = props.openFiles.find((f) => f.id === fileId)
    if (!targetFile) return
    // 确保文件已激活
    emit('activate-file', fileId)
    // 等待 model 切换后跳转到指定位置
    nextTick(() => {
      const model = modelCache.get(fileId)
      if (!model || !editor) return
      editor.setModel(model)
      if (offset !== undefined) {
        const pos = model.getPositionAt(offset)
        editor.setPosition(pos)
        editor.revealPositionInCenter(pos)
      }
    })
  }
  window.addEventListener('agent-code-editor:jump', jumpHandler)
})

onActivated(async () => {
  // keep-alive 激活时重新布局
  await nextTick()
  if (editor) {
    editor.layout()
  }
  if (diffEditor) {
    diffEditor.layout()
  }
})

onBeforeUnmount(() => {
  // 移除全局跳转事件监听
  if (jumpHandler) {
    window.removeEventListener('agent-code-editor:jump', jumpHandler)
    jumpHandler = null
  }
  // 清理防抖计时器
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  // 清理自定义 provider
  providerDisposables.forEach((d) => d.dispose())
  providerDisposables.length = 0
  // 清理所有 model
  modelCache.forEach((model) => model.dispose())
  modelCache.clear()
  if (editor) {
    editor.dispose()
    editor = null
  }
  // 清理 diff 编辑器
  if (diffEditor) {
    diffEditor.dispose()
    diffEditor = null
  }
})
</script>

<style scoped>
/* 隐藏顶部 Tabs 栏的滚动条 */
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
</style>
