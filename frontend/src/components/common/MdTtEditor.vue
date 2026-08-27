<template>
  <div class="mdtt-editor flex h-full flex-col overflow-hidden bg-panel">
    <!-- 顶部工具栏（仅编辑模式显示） -->
    <div
      v-if="editable && editor"
      class="mdtt-toolbar flex shrink-0 items-center gap-0.5 border-b border-border/50 bg-background px-2 py-1"
    >
      <!-- 行内格式 -->
      <ToolbarButton :icon="Bold" label="加粗" shortcut="⌘B" :active="isActive('bold')" @click="run('toggleBold')" />
      <ToolbarButton :icon="Italic" label="斜体" shortcut="⌘I" :active="isActive('italic')" @click="run('toggleItalic')" />
      <ToolbarButton :icon="UnderlineIcon" label="下划线" shortcut="⌘U" :active="isActive('underline')" @click="run('toggleUnderline')" />
      <ToolbarButton :icon="Strikethrough" label="删除线" :active="isActive('strike')" @click="run('toggleStrike')" />
      <ToolbarButton :icon="Code" label="行内代码" :active="isActive('code')" @click="run('toggleCode')" />

      <ToolbarSeparator />

      <!-- 标题 -->
      <ToolbarButton :icon="Heading1" label="标题 1" :active="isActive('heading', { level: 1 })" @click="runChain(cmd => cmd.toggleHeading({ level: 1 }))" />
      <ToolbarButton :icon="Heading2" label="标题 2" :active="isActive('heading', { level: 2 })" @click="runChain(cmd => cmd.toggleHeading({ level: 2 }))" />
      <ToolbarButton :icon="Heading3" label="标题 3" :active="isActive('heading', { level: 3 })" @click="runChain(cmd => cmd.toggleHeading({ level: 3 }))" />

      <ToolbarSeparator />

      <!-- 列表 -->
      <ToolbarButton :icon="List" label="无序列表" :active="isActive('bulletList')" @click="run('toggleBulletList')" />
      <ToolbarButton :icon="ListOrdered" label="有序列表" :active="isActive('orderedList')" @click="run('toggleOrderedList')" />

      <ToolbarSeparator />

      <!-- 块元素 -->
      <ToolbarButton :icon="Quote" label="引用" :active="isActive('blockquote')" @click="run('toggleBlockquote')" />
      <ToolbarButton :icon="CodeSquare" label="代码块" :active="isActive('codeBlock')" @click="run('toggleCodeBlock')" />
      <ToolbarButton :icon="Minus" label="分隔线" @click="runChain(cmd => cmd.setHorizontalRule())" />

      <ToolbarSeparator />

      <!-- 链接 -->
      <ToolbarButton :icon="LinkIcon" label="链接" :active="isActive('link')" @click="onToggleLink" />

      <div class="flex-1" />
    </div>

    <!-- 编辑器主体 -->
    <div class="mdtt-content min-h-0 flex-1 overflow-auto" ref="contentRef">
      <EditorContent :editor="editor" class="mdtt-prose" />
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onBeforeUnmount, h, defineComponent } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import { Extension } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { Markdown } from 'tiptap-markdown'
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Code,
  Heading1, Heading2, Heading3,
  List, ListOrdered,
  Quote, CodeSquare, Minus,
  Link as LinkIcon,
} from '@lucide/vue'

const props = defineProps({
  /** markdown 字符串（v-model） */
  modelValue: { type: String, default: '' },
  /** 是否可编辑 */
  editable: { type: Boolean, default: true },
  /** placeholder */
  placeholder: { type: String, default: '' },
})

const emit = defineEmits(['update:modelValue', 'change'])

const contentRef = ref(null)

/** 追踪内部更新，防止 watch 回环 */
let lastEmittedValue = props.modelValue

/**
 * 自定义段落序列化器扩展：覆盖 tiptap-markdown 默认行为
 * 空段落序列化为 <p></p> 而非空字符串，保留编辑器中的多个空行
 * prosemirror-markdown 默认会将连续空段落压缩为 \n\n
 */
const CustomParagraphSerializer = Extension.create({
  name: 'customParagraphSerializer',
  onCreate() {
    const mdStorage = this.editor.storage.markdown
    if (!mdStorage) return
    const serializer = mdStorage.serializer
    // nodes 是 getter，用 Object.defineProperty 覆盖
    const originalNodes = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(serializer), 'nodes')
    if (originalNodes && originalNodes.get) {
      Object.defineProperty(serializer, 'nodes', {
        get() {
          const nodes = originalNodes.get.call(this)
          return {
            ...nodes,
            paragraph: (state, node) => {
              // 空段落输出 <p></p>，保留多空行语义
              if (node.childCount === 0 ||
                  (node.childCount === 1 && node.firstChild.isText &&
                   node.firstChild.text.trim() === '')) {
                state.write('<p></p>')
                state.closeBlock(node)
              } else {
                state.renderInline(node)
                state.closeBlock(node)
              }
            },
          }
        },
      })
    }
  },
})

const editor = useEditor({
  extensions: [
    StarterKit.configure({
      link: false,
      underline: false,
    }),
    Underline,
    CustomParagraphSerializer,
    Link.configure({
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      HTMLAttributes: {
        class: 'text-primary underline',
      },
    }),
    Placeholder.configure({
      placeholder: props.placeholder,
      emptyEditorClass: 'is-editor-empty',
    }),
    Markdown.configure({
      html: true,
      tightLists: true,
      bulletListMarker: '-',
      breaks: true,
      transformPastedText: true,
      transformCopiedText: true,
    }),
  ],
  content: props.modelValue || '',
  editable: props.editable,
  editorProps: {
    attributes: {
      class: 'prose prose-sm dark:prose-invert max-w-none min-h-full cursor-text focus:outline-none px-4 py-3 text-[15px] leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_pre]:rounded-md [&_pre]:p-3 [&_code]:bg-muted [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.875em] [&_pre_code]:bg-transparent [&_pre_code]:p-0',
    },
  },
  onUpdate: ({ editor: ed }) => {
    const mdStorage = ed.storage
    const markdown = mdStorage.markdown?.getMarkdown() ?? ''
    lastEmittedValue = markdown
    emit('update:modelValue', markdown)
    emit('change', markdown)
  },
})

/** 当前选区是否激活某格式 */
function isActive(name, attrs) {
  if (!editor.value) return false
  return editor.value.isActive(name, attrs)
}

/** 执行简单命令 */
function run(command) {
  editor.value?.chain().focus()[command]().run()
}

/** 执行链式命令 */
function runChain(fn) {
  if (!editor.value) return
  const chain = editor.value.chain().focus()
  fn(chain)
  chain.run()
}

/** 切换链接 */
function onToggleLink() {
  if (!editor.value) return
  const isLink = editor.value.isActive('link')
  if (isLink) {
    editor.value.chain().focus().unsetLink().run()
  } else {
    const url = window.prompt('输入链接地址:')
    if (url) {
      editor.value.chain().focus().setLink({ href: url }).run()
    }
  }
}

/** 外部值变化时同步到编辑器（防回环） */
watch(() => props.modelValue, (val) => {
  if (!editor.value) return
  if (val === lastEmittedValue) return
  lastEmittedValue = val
  // 直接传入 markdown 字符串，tiptap-markdown 扩展会自动解析
  editor.value.commands.setContent(val || '', { emitUpdate: false })
}, { flush: 'sync' })

/** 同步 editable */
watch(() => props.editable, (val) => {
  editor.value?.setEditable(val)
})

/** 同步 placeholder */
watch(() => props.placeholder, (val) => {
  if (!editor.value) return
  const ext = editor.value.extensionManager.extensions.find((e) => e.name === 'placeholder')
  if (ext) {
    ext.options.placeholder = val
    editor.value.view.dispatch(editor.value.state.tr)
  }
})

/** 公开 save 方法 */
async function save() {
  if (editor.value) {
    const mdStorage = editor.value.storage
    const markdown = mdStorage.markdown?.getMarkdown() ?? ''
    if (markdown !== lastEmittedValue) {
      lastEmittedValue = markdown
      emit('update:modelValue', markdown)
      emit('change', markdown)
    }
  }
}

/**
 * 在光标处插入文本（如果编辑器有焦点/选区）
 * 如果编辑器没有焦点，返回 false 表示应由调用方追加到末尾
 */
function insertAtCursor(text) {
  if (!editor.value || editor.value.isDestroyed) return false
  // 检查编辑器是否有焦点（有光标位置）
  if (!editor.value.isFocused) return false
  // 在光标处插入文本
  editor.value.chain().focus().insertContent(text).run()
  return true
}

defineExpose({ save, editor, insertAtCursor })

onBeforeUnmount(() => {
  // 卸载前确保最新内容已 emit，防止父组件丢失最后一次编辑
  // 注意：useEditor 内部的 onBeforeUnmount 会先执行并销毁编辑器，
  // 所以这里需要在 destroy 之前获取 markdown
  if (editor.value && !editor.value.isDestroyed) {
    try {
      const mdStorage = editor.value.storage
      const markdown = mdStorage.markdown?.getMarkdown() ?? ''
      if (markdown !== lastEmittedValue) {
        lastEmittedValue = markdown
        emit('update:modelValue', markdown)
        emit('change', markdown)
      }
    } catch {
      // 编辑器可能已被销毁，忽略
    }
  }
})

// ===== 工具栏子组件 =====

const ToolbarButton = defineComponent({
  name: 'ToolbarButton',
  props: {
    icon: { type: [Object, Function], required: true },
    label: { type: String, default: '' },
    shortcut: { type: String, default: '' },
    active: { type: Boolean, default: false },
  },
  emits: ['click'],
  setup(props, { emit }) {
    return () => h('button', {
      class: [
        'inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
        props.active && 'bg-accent text-accent-foreground',
      ],
      title: props.label + (props.shortcut ? ' ' + props.shortcut : ''),
      onClick: (e) => {
        e.preventDefault()
        emit('click')
      },
    }, [h(props.icon, { class: 'size-3.5' })])
  },
})

const ToolbarSeparator = defineComponent({
  name: 'ToolbarSeparator',
  setup() {
    return () => h('div', { class: 'mx-0.5 h-5 w-px bg-border' })
  },
})
</script>

<style scoped>
.mdtt-editor {
  font-family: inherit;
}

.mdtt-content {
  scrollbar-width: thin;
}

.mdtt-content :deep(.ProseMirror) {
  outline: none;
  min-height: 100%;
}

.mdtt-content :deep(.ProseMirror p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  float: left;
  color: hsl(var(--muted-foreground));
  pointer-events: none;
  height: 0;
  opacity: 0.6;
}

/* 代码块样式 */
.mdtt-content :deep(.ProseMirror pre) {
  background: hsl(var(--muted) / 0.4);
  border-radius: 6px;
  padding: 12px;
  font-family: var(--font-mono, 'SF Mono', Menlo, Monaco, ui-monospace, monospace);
  font-size: 13px;
  overflow-x: auto;
}

.mdtt-content :deep(.ProseMirror pre code) {
  background: none;
  padding: 0;
  color: inherit;
}

/* 行内代码 */
.mdtt-content :deep(.ProseMirror code) {
  background: hsl(var(--muted) / 0.4);
  border-radius: 3px;
  padding: 1px 4px;
  font-size: 13px;
  font-family: var(--font-mono, 'SF Mono', Menlo, Monaco, ui-monospace, monospace);
}

/* 引用块 */
.mdtt-content :deep(.ProseMirror blockquote) {
  border-left: 3px solid hsl(var(--primary) / 0.4);
  padding-left: 12px;
  margin: 8px 0;
  color: hsl(var(--muted-foreground));
}

/* 列表 */
.mdtt-content :deep(.ProseMirror ul),
.mdtt-content :deep(.ProseMirror ol) {
  padding-left: 1.5em;
  margin: 4px 0;
}

.mdtt-content :deep(.ProseMirror ul) {
  list-style: disc;
}

.mdtt-content :deep(.ProseMirror ol) {
  list-style: decimal;
}

.mdtt-content :deep(.ProseMirror ul ul) {
  list-style: circle;
}

.mdtt-content :deep(.ProseMirror ul ul ul) {
  list-style: square;
}

.mdtt-content :deep(.ProseMirror li) {
  margin: 2px 0;
}

.mdtt-content :deep(.ProseMirror li > p) {
  margin: 0;
}

/* 链接 */
.mdtt-content :deep(.ProseMirror a) {
  color: hsl(var(--primary));
  text-decoration: underline;
  cursor: pointer;
}

/* 表格 */
.mdtt-content :deep(.ProseMirror table) {
  border-collapse: collapse;
  width: 100%;
  margin: 8px 0;
}

.mdtt-content :deep(.ProseMirror th),
.mdtt-content :deep(.ProseMirror td) {
  border: 1px solid hsl(var(--border));
  padding: 6px 12px;
  text-align: left;
}

.mdtt-content :deep(.ProseMirror th) {
  background: hsl(var(--muted) / 0.4);
  font-weight: 600;
}

/* 图片 */
.mdtt-content :deep(.ProseMirror img) {
  max-width: 100%;
  border-radius: 6px;
  margin: 8px 0;
}

/* 分隔线 */
.mdtt-content :deep(.ProseMirror hr) {
  border: none;
  height: 1px;
  background: hsl(var(--border));
  margin: 16px 0;
}
</style>
