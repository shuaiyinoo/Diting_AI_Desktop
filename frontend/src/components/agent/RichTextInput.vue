<template>
  <div
    class="rich-text-input"
    :class="{ 'rich-text-input--disabled': disabled }"
  >
    <!-- TipTap 编辑器 -->
    <EditorContent :editor="editor" class="rich-text-input__editor" />

    <!-- Mention 弹出选择框 -->
    <Teleport to="body">
      <div
        v-if="popupState.active && popupStyle"
        class="mention-popup"
        :style="popupStyle"
      >
        <!-- 标题栏 -->
        <div class="mention-popup__header">
          <span class="mention-popup__title">{{ popupState.headerLabel }}</span>
          <span class="mention-popup__hint">Esc 关闭 · Enter 选中</span>
        </div>

        <!-- 加载中 -->
        <div v-if="popupState.loading" class="mention-popup__empty">
          加载中...
        </div>

        <!-- 空列表 -->
        <div v-else-if="popupState.items.length === 0" class="mention-popup__empty">
          {{ popupState.emptyText }}
        </div>

        <!-- 列表项 -->
        <div v-else ref="listRef" class="mention-popup__list">
          <button
            v-for="(item, index) in popupState.items"
            :key="popupState.keyExtractor(item)"
            type="button"
            class="mention-popup__item"
            :class="{ 'mention-popup__item--active': index === popupState.selectedIndex }"
            :style="{ paddingLeft: (popupState.char === '@' && item.depth ? 10 + item.depth * 14 : 10) + 'px' }"
            @mousedown.prevent="selectItem(item)"
          >
            <!-- @ 文件引用（树形浏览） -->
            <template v-if="popupState.char === '@'">
              <!-- 文件夹项 -->
              <template v-if="item.isDir">
                <component
                  :is="fileExpandedFolders.has(item.togglePath) ? ChevronDown : ChevronRight"
                  class="mention-popup__arrow"
                />
                <Folder class="mention-popup__icon mention-popup__icon--folder" :size="14" />
                <span class="mention-popup__label">{{ item.name }}</span>
                <span v-if="item.source === 'session'" class="mention-popup__tag">会话</span>
                <span v-else-if="item.source === 'workspace'" class="mention-popup__tag">项目</span>
                <span v-else-if="item.source === 'attached'" class="mention-popup__tag">附加</span>
              </template>
              <!-- 文件项 -->
              <template v-else>
                <span class="mention-popup__indent" />
                <File class="mention-popup__icon mention-popup__icon--file" :size="14" />
                <span class="mention-popup__label">{{ item.name }}</span>
                <span v-if="item.source === 'session'" class="mention-popup__tag">会话</span>
                <span v-else-if="item.source === 'workspace'" class="mention-popup__tag">项目</span>
                <span v-else-if="item.source === 'attached'" class="mention-popup__tag">附加</span>
              </template>
            </template>

            <!-- / Skill 引用 -->
            <template v-else-if="popupState.char === '/'">
              <Zap class="mention-popup__icon mention-popup__icon--skill" :size="14" />
              <span class="mention-popup__label">{{ item.name }}</span>
              <span v-if="item.description" class="mention-popup__desc">{{ item.description }}</span>
            </template>

            <!-- # MCP 引用 -->
            <template v-else-if="popupState.char === '#'">
              <Plug class="mention-popup__icon mention-popup__icon--mcp" :size="14" />
              <span class="mention-popup__label">{{ item.displayName || item.name }}</span>
              <span v-if="item.description" class="mention-popup__desc">{{ item.description }}</span>
            </template>

            <!-- & 会话引用 -->
            <template v-else-if="popupState.char === '&'">
              <MessageSquare class="mention-popup__icon mention-popup__icon--session" :size="14" />
              <span class="mention-popup__label">{{ item.title }}</span>
            </template>
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useEditor, EditorContent, mergeAttributes } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Mention from '@tiptap/extension-mention'
import { File, Folder, Zap, Plug, MessageSquare, ChevronDown, ChevronRight } from '@lucide/vue'
import { htmlToMarkdown } from '@/utils/htmlToMarkdown'
import {
  isSuggestionTriggerPresent,
  shouldSuppressEscTrigger,
  shouldClearEscSuppressionOnExit,
  createLatestSuggestionRequestGuard,
  calculatePopupPosition,
} from '@/utils/mention-popup-utils'
import { ipc } from '@/utils/ipcRenderer'
import { ipcApiRoute } from '@/api'

// ===== Props =====
const props = defineProps({
  /** 当前值（Markdown） */
  modelValue: { type: String, default: '' },
  /** 占位文字 */
  placeholder: { type: String, default: '输入指令... (@ 引用文件, / 调用 Skill, # 使用 MCP, & 引用会话)' },
  /** 是否禁用 */
  disabled: { type: Boolean, default: false },
  /** 自动聚焦触发器（当此值变化时自动聚焦） */
  autoFocusTrigger: { type: String, default: null },
  /** 是否使用 Cmd/Ctrl+Enter 发送 */
  sendWithCmdEnter: { type: Boolean, default: false },
  /** 当前工作区 ID（用于 @ 文件引用获取项目文件） */
  workspaceId: { type: [String, Number], default: null },
  /** 当前工作区 slug（用于 / Skill 和 # MCP 获取） */
  workspaceSlug: { type: String, default: 'default' },
  /** 当前会话 ID（用于 & 会话引用排除自身） */
  sessionId: { type: String, default: null },
})

// ===== Emits =====
const emit = defineEmits(['update:modelValue', 'submit', 'focus', 'blur'])

// ===== 弹窗响应式状态 =====
// 多个 suggestion 配置共享同一个 popupState，通过 char 区分类型
const popupState = reactive({
  active: false,
  loading: false,
  items: [],
  selectedIndex: 0,
  char: '@',
  headerLabel: '',
  emptyText: '',
  command: null,       // TipTap suggestion 提供的 command 函数
  toCommand: null,     // 各 suggestion 配置提供的 toCommand 函数
  keyExtractor: (item) => String(item.id || item.slug || item.path || ''),
  clientRect: null,
})

// ===== Refs =====
const listRef = ref(null)
const isComposing = ref(false)
const workspaceIdRef = ref(props.workspaceId)
const workspaceSlugRef = ref(props.workspaceSlug)
const sessionIdRef = ref(props.sessionId)

// 同步 props 到 refs（供 suggestion 闭包使用）
watch(() => props.workspaceId, (v) => {
  workspaceIdRef.value = v
  // 切换工作区时清除 @ 文件树缓存
  fileRootFolders.value = []
  fileExpandedFolders.value = new Set()
  fileFolderChildren.value = {}
})
watch(() => props.workspaceSlug, (v) => { workspaceSlugRef.value = v })
watch(() => props.sessionId, (v) => {
  sessionIdRef.value = v
  // 切换会话时清除 @ 文件树缓存
  fileRootFolders.value = []
  fileExpandedFolders.value = new Set()
  fileFolderChildren.value = {}
})

// ===== 弹窗定位 =====
const popupStyle = computed(() => {
  if (!popupState.clientRect) return null
  return calculatePopupPosition(popupState.clientRect)
})

// ===== 选中项滚动定位 =====
watch(() => popupState.selectedIndex, () => {
  const container = listRef.value
  if (!container) return
  const item = container.children[popupState.selectedIndex]
  item?.scrollIntoView({ block: 'nearest' })
})

// ===== 选中项处理 =====
function selectItem(item) {
  // @ 文件引用：文件夹项 → 展开/折叠，不插入
  if (popupState.char === '@' && item.isDir && item.togglePath) {
    toggleFileFolder(item.togglePath)
    return
  }
  try {
    if (popupState.command && popupState.toCommand) {
      const cmd = popupState.toCommand(item)
      popupState.command({ ...cmd, mentionSuggestionChar: popupState.char })
    }
  } catch (e) {
    console.error('[RichTextInput] 插入 mention 失败:', e)
  }
  // 无论成功与否，都关闭弹窗
  popupState.active = false
  popupState.loading = false
  popupState.selectedIndex = 0
}

// ===== Esc 抑制状态（每个 suggestion 配置独立维护） =====
// 记录被 Esc 关闭的触发片段，同一片段不再重复弹窗
const escSuppressors = new Map()  // char → EscSuppressedTrigger

// ===== 泛型 Suggestion 工厂 =====
/**
 * 创建 TipTap Suggestion 配置。
 *
 * 与 Proma 的 ReactRenderer 方式不同，Vue 版本通过响应式 popupState
 * 在组件模板中渲染弹窗，无需手动创建 DOM 元素。
 */
function createSuggestion(config) {
  const requestGuard = createLatestSuggestionRequestGuard()

  return {
    char: config.char,
    allowSpaces: false,
    // allowedPrefixes 为 null：允许任意字符前缀触发（含中文等无空格场景）
    allowedPrefixes: null,

    items: async ({ query }) => {
      const requestId = requestGuard.startRequest()
      try {
        const items = await config.fetchItems(query || '')
        return requestGuard.attachResult(requestId, items)
      } catch (e) {
        console.error(`[Mention:${config.char}] 获取数据失败:`, e)
        return requestGuard.attachResult(requestId, [])
      }
    },

    render: () => {
      let suppressed = escSuppressors.get(config.char) || null

      function cleanup() {
        popupState.active = false
        popupState.loading = false
        popupState.selectedIndex = 0
      }

      return {
        onStart(sProps) {
          // TipTap v3: onStart 先于 items() 被调用，此时 items 为空数组。
          // 不检查 isLatest（items 未经过 attachResult），直接激活弹窗。

          // 防御异步竞态：触发符可能已被删除
          if (!isSuggestionTriggerPresent(sProps.editor, sProps.range, config.char)) {
            return
          }

          // Esc 抑制：同一片段不再弹窗
          if (shouldSuppressEscTrigger(suppressed, { from: sProps.range.from, text: sProps.text })) {
            return
          }
          suppressed = null
          escSuppressors.set(config.char, null)

          // 更新 popupState
          popupState.active = true
          popupState.loading = true
          popupState.items = []
          popupState.selectedIndex = 0
          popupState.char = config.char
          popupState.headerLabel = config.headerLabel
          popupState.emptyText = config.emptyText
          popupState.command = sProps.command
          popupState.toCommand = config.toCommand
          popupState.keyExtractor = config.keyExtractor
          popupState.clientRect = sProps.clientRect?.() ?? null
        },

        onUpdate(sProps) {
          // TipTap v3: onUpdate 可能被多次调用：
          //   1. 初始空 items（未经过 attachResult）→ isLatest 返回 false，跳过
          //   2. items() 异步获取后的真实数据（经过 attachResult）→ isLatest 返回 true，更新
          if (!requestGuard.isLatest(sProps.items)) return
          popupState.loading = false
          popupState.items = sProps.items
          popupState.selectedIndex = 0
          // 同步最新 command（range 可能已随输入变化）
          popupState.command = sProps.command
          popupState.clientRect = sProps.clientRect?.() ?? null
        },

        onKeyDown(sProps) {
          // 记录 Esc 关闭时的触发片段
          if (sProps.event.key === 'Escape') {
            suppressed = {
              from: sProps.range.from,
              text: sProps.view.state.doc.textBetween(sProps.range.from, sProps.range.to, '', ''),
            }
            escSuppressors.set(config.char, suppressed)
          }

          // 键盘导航
          if (sProps.event.key === 'ArrowUp') {
            popupState.selectedIndex = popupState.selectedIndex <= 0
              ? popupState.items.length - 1
              : popupState.selectedIndex - 1
            return true
          }
          if (sProps.event.key === 'ArrowDown') {
            popupState.selectedIndex = popupState.selectedIndex >= popupState.items.length - 1
              ? 0
              : popupState.selectedIndex + 1
            return true
          }
          if (sProps.event.key === 'Enter') {
            if (popupState.items.length === 0) return false
            const item = popupState.items[popupState.selectedIndex]
            if (item) selectItem(item)
            return true
          }
          // Tab 键：在 @ 模式下展开/折叠文件夹
          if (sProps.event.key === 'Tab' && popupState.char === '@') {
            if (popupState.items.length === 0) return false
            const item = popupState.items[popupState.selectedIndex]
            if (item && item.isDir && item.togglePath) {
              sProps.event.preventDefault()
              toggleFileFolder(item.togglePath)
              return true
            }
          }
          // Escape 不在此处理：返回 false 交还给 TipTap suggestion 插件内置的 Escape 分支
          return false
        },

        onExit(sProps) {
          if (requestGuard.isStale(sProps.items)) return
          // 被抑制的触发符已从文档中删除 → 清除抑制
          if (suppressed && shouldClearEscSuppressionOnExit(suppressed, sProps.editor, sProps.range, config.char)) {
            suppressed = null
            escSuppressors.set(config.char, null)
          }
          cleanup()
        },
      }
    },
  }
}

// ===== Suggestion 配置 =====

// / Skill 引用
const skillSuggestion = createSuggestion({
  char: '/',
  headerLabel: '调用 Skill',
  emptyText: '无匹配 Skill',
  fetchItems: async (query) => {
    const res = await ipc.invoke(ipcApiRoute.piAgent.skillsOperation, {
      action: 'list',
      workspaceSlug: workspaceSlugRef.value || 'default',
    })
    if (res.code !== 0 || !res.data) return []
    return res.data
      .filter((s) => s.enabled)
      .filter((s) => !query || s.name.toLowerCase().includes(query.toLowerCase()) || (s.slug || '').toLowerCase().includes(query.toLowerCase()))
      .map((s) => ({ id: s.slug, name: s.name, description: s.description }))
  },
  keyExtractor: (item) => item.id,
  toCommand: (item) => ({ id: item.id, label: item.name }),
})

// # MCP 引用
const mcpSuggestion = createSuggestion({
  char: '#',
  headerLabel: 'MCP 服务',
  emptyText: '无匹配 MCP 服务',
  fetchItems: async (query) => {
    const res = await ipc.invoke(ipcApiRoute.piAgent.mcpOperation, {
      action: 'list',
      workspaceSlug: workspaceSlugRef.value || 'default',
    })
    if (res.code !== 0 || !res.data) return []
    return res.data
      .filter((m) => m.enabled && m.available)
      .filter((m) => !query || (m.displayName || m.name || '').toLowerCase().includes(query.toLowerCase()))
  },
  keyExtractor: (item) => item.id || item.name,
  toCommand: (item) => ({ id: item.displayName || item.name, label: item.displayName || item.name }),
})

// & 会话引用
const sessionSuggestion = createSuggestion({
  char: '&',
  headerLabel: '引用会话',
  emptyText: '无匹配会话',
  fetchItems: async (query) => {
    const res = await ipc.invoke(ipcApiRoute.piAgent.sessionOperation, {
      action: 'list',
    })
    if (res.code !== 0 || !res.data) return []
    return res.data
      .filter((s) => s.id !== sessionIdRef.value)
      .filter((s) => !query || (s.title || '').toLowerCase().includes(query.toLowerCase()))
      .slice(0, 20)
  },
  keyExtractor: (item) => item.id,
  toCommand: (item) => ({ id: item.id, label: item.title }),
})

// @ 文件引用 — 树形浏览模式
// 无搜索词时显示根文件夹（会话/项目/附加），点击展开加载子项
// 有搜索词时递归搜索所有文件，扁平显示匹配结果
const fileExpandedFolders = ref(new Set()) // 展开的文件夹路径集合
const fileFolderChildren = ref({}) // 文件夹路径 → 子项列表缓存

/** 展开/折叠 @ 弹窗中的文件夹 */
async function toggleFileFolder(folderPath) {
  if (fileExpandedFolders.value.has(folderPath)) {
    fileExpandedFolders.value.delete(folderPath)
    fileExpandedFolders.value = new Set(fileExpandedFolders.value)
  } else {
    fileExpandedFolders.value.add(folderPath)
    fileExpandedFolders.value = new Set(fileExpandedFolders.value)
    // 首次展开时加载子项
    if (!fileFolderChildren.value[folderPath]) {
      await loadFileFolderChildren(folderPath)
    }
  }
  // 重新计算 popupState.items
  popupState.items = buildFileTreeItems()
  popupState.selectedIndex = 0
}

/** 加载文件夹子项 */
async function loadFileFolderChildren(folderPath) {
  try {
    let items = []
    // 会话文件夹：通过 list action 加载会话文件（需要 workspaceId 构造路径）
    if (folderPath.startsWith('session:')) {
      const sId = folderPath.substring('session:'.length)
      const res = await ipc.invoke(ipcApiRoute.piAgent.fileOperation, {
        action: 'list', sessionId: sId, workspaceId: workspaceIdRef.value, mode: 'session',
      })
      if (res.code === 0 && res.data) {
        items = ((res.data || {}).files || [])
      }
    }
    // 项目文件夹：通过 list action 加载项目文件
    else if (folderPath.startsWith('workspace:')) {
      const wsId = folderPath.substring('workspace:'.length)
      const res = await ipc.invoke(ipcApiRoute.piAgent.fileOperation, {
        action: 'list', workspaceId: wsId, mode: 'project',
      })
      if (res.code === 0 && res.data) {
        items = ((res.data || {}).files || [])
      }
    }
    // 附加文件夹：通过 listAttachedDir 加载（仅当前层级）
    else {
      const res = await ipc.invoke(ipcApiRoute.piAgent.fileOperation, {
        action: 'listAttachedDir',
        folderPath,
      })
      if (res.code === 0) {
        items = res.data || []
      }
    }
    fileFolderChildren.value = { ...fileFolderChildren.value, [folderPath]: items }
  } catch (err) {
    console.error('[RichTextInput] 加载文件夹子项失败:', err)
    fileFolderChildren.value = { ...fileFolderChildren.value, [folderPath]: [] }
  }
}

/** 根文件夹列表缓存 */
const fileRootFolders = ref([])

/** 加载根文件夹列表 */
async function loadFileRootFolders() {
  const wsId = workspaceIdRef.value
  const sId = sessionIdRef.value
  const roots = []

  if (sId) {
    roots.push({
      name: '会话文件',
      source: 'session',
      isDir: true,
      isRoot: true,
      togglePath: `session:${sId}`,
      path: `session:${sId}`,
      depth: 0,
    })
  }
  if (wsId) {
    roots.push({
      name: '项目文件',
      source: 'workspace',
      isDir: true,
      isRoot: true,
      togglePath: `workspace:${wsId}`,
      path: `workspace:${wsId}`,
      depth: 0,
    })

    // 获取附加目录列表
    try {
      const res = await ipc.invoke(ipcApiRoute.piAgent.fileOperation, {
        action: 'list', workspaceId: wsId, mode: 'project',
      })
      if (res.code === 0 && res.data) {
        const attachedDirs = (res.data || {}).attachedDirs || []
        for (const dirPath of attachedDirs) {
          const dirName = dirPath.replace(/\\/g, '/').split('/').filter(Boolean).pop() || dirPath
          roots.push({
            name: dirName,
            source: 'attached',
            isDir: true,
            isRoot: true,
            togglePath: dirPath,
            path: dirPath,
            depth: 0,
          })
        }
      }
    } catch { /* 忽略 */ }
  }

  fileRootFolders.value = roots
}

/** 构建树形 items 列表（展开的文件夹递归插入子项） */
function buildFileTreeItems() {
  const result = []
  for (const root of fileRootFolders.value) {
    result.push(root)
    if (fileExpandedFolders.value.has(root.togglePath)) {
      result.push(...flattenFileFolder(root.togglePath, 1, root))
    }
  }
  return result
}

/** 递归展平文件夹子项 */
function flattenFileFolder(folderPath, depth, parentRoot) {
  const children = fileFolderChildren.value[folderPath] || []
  const result = []
  for (const item of children) {
    const name = item.name || item.path.split('/').pop() || item.path
    // 子项的完整路径
    let childFullPath
    if (folderPath.startsWith('session:') || folderPath.startsWith('workspace:')) {
      // 会话/项目文件夹：path 是相对于 baseDir 的相对路径
      childFullPath = item.path
    } else {
      // 附加文件夹：path 是相对于附加根的相对路径
      childFullPath = `${folderPath}/${item.path}`
    }
    const childTogglePath = childFullPath
    const isExpanded = fileExpandedFolders.value.has(childTogglePath)

    result.push({
      name,
      path: childFullPath,
      isDir: item.isDir,
      size: item.size || 0,
      depth,
      source: parentRoot.source,
      togglePath: item.isDir ? childTogglePath : undefined,
      // 文件额外信息
      attachedDirPath: parentRoot.source === 'attached' ? parentRoot.path : undefined,
    })

    if (item.isDir && isExpanded) {
      result.push(...flattenFileFolder(childTogglePath, depth + 1, parentRoot))
    }
  }
  return result
}

/** 搜索所有文件（递归） */
async function searchAllFiles(query) {
  const wsId = workspaceIdRef.value
  const sId = sessionIdRef.value
  if (!wsId && !sId) return []

  const tasks = []

  // 项目文件
  if (wsId) {
    tasks.push(ipc.invoke(ipcApiRoute.piAgent.fileOperation, {
      action: 'list', workspaceId: wsId, mode: 'project',
    }).then((res) => {
      if (res.code === 0 && res.data) {
        const data = res.data || {}
        const files = (data.files || []).filter((f) => !f.isDir)
        return files.map((f) => ({ ...f, source: 'workspace' }))
      }
      return []
    }).catch(() => []))

    // 附加目录文件（递归）
    tasks.push(ipc.invoke(ipcApiRoute.piAgent.fileOperation, {
      action: 'list', workspaceId: wsId, mode: 'project',
    }).then(async (res) => {
      if (res.code !== 0 || !res.data) return []
      const attachedDirs = (res.data || {}).attachedDirs || []
      if (attachedDirs.length === 0) return []
      const dirTasks = attachedDirs.map((dirPath) =>
        ipc.invoke(ipcApiRoute.piAgent.fileOperation, {
          action: 'listAllFiles', folderPath: dirPath,
        }).then((dirRes) => {
          if (dirRes.code !== 0 || !dirRes.data) return []
          return dirRes.data
            .filter((f) => !f.isDir)
            .map((f) => ({
              name: f.name,
              path: `${dirPath}/${f.path}`,
              source: 'attached',
              attachedDirPath: dirPath,
            }))
        }).catch(() => [])
      )
      return (await Promise.all(dirTasks)).flat()
    }).catch(() => []))
  }

  // 会话文件
  if (sId) {
    tasks.push(ipc.invoke(ipcApiRoute.piAgent.fileOperation, {
      action: 'list', sessionId: sId, mode: 'session',
    }).then((res) => {
      if (res.code === 0 && res.data) {
        const files = ((res.data || {}).files || []).filter((f) => !f.isDir)
        return files.map((f) => ({ ...f, source: 'session' }))
      }
      return []
    }).catch(() => []))
  }

  const results = (await Promise.all(tasks)).flat()
  const q = query.toLowerCase()
  return results
    .filter((f) => (f.name || '').toLowerCase().includes(q) || (f.path || '').toLowerCase().includes(q))
    .slice(0, 200)
}

const fileSuggestion = createSuggestion({
  char: '@',
  headerLabel: '引用文件',
  emptyText: '无匹配文件',
  fetchItems: async (query) => {
    const wsId = workspaceIdRef.value
    const sId = sessionIdRef.value
    if (!wsId && !sId) return []

    // 有搜索词：递归搜索所有文件，扁平显示
    if (query) {
      // 清除展开状态（搜索模式不使用树形）
      fileExpandedFolders.value = new Set()
      return await searchAllFiles(query)
    }

    // 无搜索词：树形浏览模式
    // 首次加载根文件夹
    if (fileRootFolders.value.length === 0) {
      await loadFileRootFolders()
    }
    return buildFileTreeItems()
  },
  keyExtractor: (item) => `${item.source}:${item.path}`,
  toCommand: (item) => ({
    id: item.path,
    label: item.name,
    isDirectory: !!item.isDir,
    attachedDirPath: item.attachedDirPath,
  }),
})

// ===== Mention 扩展配置 =====
const mentionExtension = Mention.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      // 触发字符：持久化节点自身携带，确保旧草稿兼容
      mentionSuggestionChar: {
        default: '@',
        parseHTML: (el) => el.getAttribute('data-mention-suggestion-char') || '@',
        renderHTML: (attrs) => ({ 'data-mention-suggestion-char': attrs.mentionSuggestionChar }),
      },
      // 引用类型（todo / calendar_event 等，预留）
      referenceType: {
        default: null,
        parseHTML: (el) => {
          const v = el.getAttribute('data-mention-reference-type')
          return v === 'todo' || v === 'calendar_event' ? v : null
        },
        renderHTML: (attrs) =>
          attrs.referenceType === 'todo' || attrs.referenceType === 'calendar_event'
            ? { 'data-mention-reference-type': attrs.referenceType }
            : {},
      },
      // 文件夹引用标记
      isDirectory: {
        default: false,
        parseHTML: (el) => el.getAttribute('data-mention-is-directory') === 'true',
        renderHTML: (attrs) => attrs.isDirectory ? { 'data-mention-is-directory': 'true' } : {},
      },
    }
  },
}).configure({
  HTMLAttributes: {},
  renderText({ node }) {
    const char = node.attrs.mentionSuggestionChar || '@'
    const label = node.attrs.label ?? node.attrs.id
    return `${char}${label}`
  },
  renderHTML({ node, options }) {
    const char = node.attrs.mentionSuggestionChar || '@'
    const label = node.attrs.label ?? node.attrs.id
    let chipClass = 'mention-chip'
    let chipPrefix = '@'
    if (char === '/') { chipClass = 'skill-mention-chip'; chipPrefix = '/' }
    else if (char === '#') { chipClass = 'mcp-mention-chip'; chipPrefix = '#' }
    else if (char === '&') { chipClass = 'session-mention-chip'; chipPrefix = '&' }
    return [
      'span',
      mergeAttributes(options?.HTMLAttributes || {}, {
        class: chipClass,
        'data-prefix': chipPrefix,
        'data-type': 'mention',
        'data-id': node.attrs.id || '',
        'data-label': node.attrs.label || '',
        'data-mention-suggestion-char': char,
      }),
      label,
    ]
  },
  suggestions: [
    fileSuggestion,
    skillSuggestion,
    mcpSuggestion,
    sessionSuggestion,
  ],
})

// ===== 同步值追踪 =====
// 必须在 useEditor 之前声明，供 onUpdate 闭包引用
let lastEditorValue = ''

// ===== 编辑器 =====
const editor = useEditor({
  extensions: [
    StarterKit.configure({
      link: false,
      underline: false,
    }),
    Underline,
    Link.configure({
      openOnClick: false,
      autolink: false,
      linkOnPaste: false,
    }),
    Placeholder.configure({
      placeholder: props.placeholder,
      emptyEditorClass: 'is-editor-empty',
    }),
    mentionExtension,
  ],
  content: props.modelValue || '',
  editable: !props.disabled,
  editorProps: {
    attributes: {
      class: 'prose prose-sm max-w-none focus:outline-none rich-text-input__content',
    },
    handleDOMEvents: {
      compositionstart: () => { isComposing.value = true; return false },
      compositionend: () => { isComposing.value = false; return false },
    },
    handleKeyDown: (view, event) => {
      // Enter 发送 / Shift+Enter 换行
      if (event.key === 'Enter') {
        const { $from } = view.state.selection
        const parent = $from.parent
        // 代码块内允许正常换行
        if (parent.type.name === 'codeBlock') return false
        // IME 组合输入中不处理
        if (isComposing.value || event.isComposing) return false
        // Suggestion 弹窗激活时，让插件处理
        if (view.dom.querySelector('[data-decoration-id]')) return false

        const cmdMode = props.sendWithCmdEnter
        const hasCmd = event.metaKey || event.ctrlKey
        const hasShift = event.shiftKey
        const isSend = cmdMode ? hasCmd : (!hasShift && !hasCmd)

        if (isSend) {
          event.preventDefault()
          emit('submit')
          return true
        }

        // 换行
        event.preventDefault()
        if (hasShift) {
          editor.value?.chain().focus().setHardBreak().run()
        } else {
          editor.value?.chain().focus().splitBlock().run()
        }
        return true
      }
      return false
    },
  },
  onUpdate: ({ editor: ed }) => {
    const html = ed.getHTML()
    let markdown
    if (html === '<p></p>') {
      markdown = ''
    } else {
      markdown = htmlToMarkdown(html)
    }
    // 关键：在 emit 之前更新 lastEditorValue，防止 watch 触发 setContent 回环
    lastEditorValue = markdown
    emit('update:modelValue', markdown)
  },
  onFocus: () => emit('focus'),
  onBlur: () => emit('blur'),
})

// ===== 同步外部值变化（仅从外部重置时触发） =====
watch(() => props.modelValue, (val) => {
  if (!editor.value) return
  if (val === lastEditorValue) return
  if (val === '') {
    editor.value.commands.clearContent()
    lastEditorValue = ''
  } else {
    const html = val.split(/\n\n+/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('')
    editor.value.commands.setContent(html)
    lastEditorValue = val
  }
})

// ===== 同步 disabled =====
watch(() => props.disabled, (val) => {
  editor.value?.setEditable(!val)
})

// ===== 同步 placeholder =====
watch(() => props.placeholder, (val) => {
  if (!editor.value) return
  const ext = editor.value.extensionManager.extensions.find((e) => e.name === 'placeholder')
  if (ext) {
    ext.options.placeholder = val
    editor.value.view.dispatch(editor.value.state.tr)
  }
})

// ===== 自动聚焦 =====
onMounted(() => {
  if (editor.value && !props.disabled) {
    setTimeout(() => editor.value?.commands.focus(), 100)
  }
})

watch(() => props.autoFocusTrigger, () => {
  if (editor.value && !props.disabled) {
    setTimeout(() => editor.value?.commands.focus(), 50)
  }
})

/**
 * 在光标处插入文本（如果编辑器有焦点/选区）
 * 如果编辑器没有焦点，返回 false 表示应由调用方追加到末尾
 */
function insertAtCursor(text) {
  if (!editor.value || editor.value.isDestroyed) return false
  if (!editor.value.isFocused) return false
  editor.value.chain().focus().insertContent(text).run()
  return true
}

defineExpose({ insertAtCursor })

// ===== 卸载 =====
onBeforeUnmount(() => {
  editor.value?.destroy()
})
</script>

<style>
/* RichTextInput 全局样式（ProseMirror 编辑器 + Mention Chip + 弹窗） */
.rich-text-input {
  position: relative;
  width: 100%;
  max-height: 200px;
  overflow-y: auto;
  overscroll-behavior: contain;
  transition: max-height 0.2s ease;
}
.rich-text-input--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.rich-text-input__editor {
  width: 100%;
}

/* ProseMirror 编辑器基础样式 */
.rich-text-input .ProseMirror {
  outline: none;
  padding: 12px 16px 4px;
  font-size: 14px;
  line-height: 1.5;
  font-family: inherit;
  min-height: 42px;
}
.rich-text-input .ProseMirror p { margin: 0; }
.rich-text-input .ProseMirror ul,
.rich-text-input .ProseMirror ol { margin: 0; padding-left: 1.5em; }
.rich-text-input .ProseMirror li { margin: 0; }
.rich-text-input .ProseMirror p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  float: left;
  color: hsl(var(--muted-foreground));
  pointer-events: none;
  height: 0;
  max-width: 100%;
  white-space: normal;
  overflow-wrap: anywhere;
  opacity: 0.6;
}
.rich-text-input .ProseMirror code {
  background: hsl(var(--muted) / 0.4);
  border-radius: 3px;
  padding: 1px 4px;
  font-size: 13px;
}
.rich-text-input .ProseMirror pre {
  border-radius: 6px;
  padding: 12px;
}
.rich-text-input .ProseMirror pre code {
  background: none;
  padding: 0;
}

/* ===== Mention Chip 样式 ===== */
.mention-chip,
.skill-mention-chip,
.mcp-mention-chip,
.session-mention-chip {
  display: inline-flex;
  align-items: center;
  border-radius: 6px;
  overflow: hidden;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  vertical-align: baseline;
  cursor: default;
  line-height: 1.6;
  padding: 0 6px 0 0;
}
.mention-chip::before,
.skill-mention-chip::before,
.mcp-mention-chip::before,
.session-mention-chip::before {
  content: attr(data-prefix);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 5px;
  margin-right: 5px;
  font-weight: 700;
  font-size: 12px;
  height: 100%;
}

/* @ 文件引用：蓝色系 */
.mention-chip {
  background: rgba(24, 95, 165, 0.12);
  color: #185FA5;
}
.mention-chip::before { background: #185FA5; color: #fff; }

/* / Skill 引用：紫色系 */
.skill-mention-chip {
  background: rgba(124, 58, 237, 0.12);
  color: #7C3AED;
}
.skill-mention-chip::before { background: #7C3AED; color: #fff; }

/* # MCP 引用：绿色系 */
.mcp-mention-chip {
  background: rgba(5, 150, 105, 0.12);
  color: #059669;
}
.mcp-mention-chip::before { background: #059669; color: #fff; }

/* & 会话引用：橙色系 */
.session-mention-chip {
  background: rgba(234, 88, 12, 0.12);
  color: #EA580C;
}
.session-mention-chip::before { background: #EA580C; color: #fff; }

/* ===== Mention 弹出选择框样式 ===== */
.mention-popup {
  position: fixed;
  border-radius: 8px;
  border: 1px solid hsl(var(--border));
  background: hsl(var(--card));
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  overflow: hidden;
  width: 280px;
}
.mention-popup__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 500;
  background: hsl(var(--primary) / 0.08);
  color: hsl(var(--primary));
  border-bottom: 1px solid hsl(var(--border));
}
.mention-popup__hint {
  font-weight: 400;
  color: hsl(var(--muted-foreground));
}
.mention-popup__empty {
  padding: 8px 10px;
  font-size: 11px;
  color: hsl(var(--muted-foreground));
}
.mention-popup__list {
  max-height: 240px;
  overflow-y: auto;
}
.mention-popup__list::-webkit-scrollbar { width: 3px; }
.mention-popup__list::-webkit-scrollbar-thumb {
  background: hsl(var(--border));
  border-radius: 2px;
}
.mention-popup__item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 6px 10px;
  border: none;
  background: transparent;
  text-align: left;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.1s;
  color: hsl(var(--foreground));
}
.mention-popup__item:hover {
  background: hsl(var(--muted) / 0.4);
}
.mention-popup__item--active {
  background: hsl(var(--muted) / 0.6);
}
.mention-popup__icon {
  font-size: 14px;
  flex-shrink: 0;
}
.mention-popup__icon--file { color: #185FA5; }
.mention-popup__icon--folder { color: #E8A838; }
.mention-popup__icon--skill { color: #8A2BE2; }
.mention-popup__icon--mcp { color: #006400; }
.mention-popup__icon--session { color: #1E90FF; }
.mention-popup__arrow {
  font-size: 10px;
  color: hsl(var(--muted-foreground));
  flex-shrink: 0;
  width: 12px;
  text-align: center;
}
.mention-popup__indent {
  width: 12px;
  flex-shrink: 0;
}
.mention-popup__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}
.mention-popup__desc {
  font-size: 10px;
  color: hsl(var(--muted-foreground));
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 0;
}
.mention-popup__tag {
  font-size: 9px;
  padding: 1px 4px;
  border-radius: 3px;
  background: hsl(var(--muted) / 0.4);
  color: hsl(var(--muted-foreground));
  flex-shrink: 0;
}
</style>
