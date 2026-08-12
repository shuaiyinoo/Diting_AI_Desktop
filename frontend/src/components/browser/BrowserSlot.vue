<!--
  BrowserSlot — WebContentsView 原生占位容器（占位版）

  职责：
  1. 一个 <div> 占位容器，测量自身边界位置
  2. 通过 ResizeObserver + requestAnimationFrame 实时同步 DOM 位置到主进程
  3. 主进程根据 IPC 收到的 bounds 摆放 Electron WebContentsView
  4. MutationObserver 监听 Ant Design 浮层（Modal/Drawer/Select），
     浮层打开时临时隐藏原生 View（WebContentsView 原生层级高于 DOM）

  后端迁移后：取消 setLayout 注释，接入 IPC 通道
-->
<template>
  <div ref="containerRef" class="browser-slot" />
</template>

<script setup>
/**
 * BrowserSlot 组件
 *
 * WebContentsView 是 Electron 原生子视图，天然盖在 Vue DOM 之上，
 * CSS z-index 无法反转。本组件负责：
 *
 * 1. 测量自身 <div> 的 getBoundingClientRect()
 * 2. 通过 IPC 把 bounds 发给主进程，主进程调用 view.setBounds()
 * 3. 全局递增 revision 防止旧布局 IPC 覆盖新布局
 * 4. 监听应用浮层出现时临时隐藏原生 View
 *
 * 当前为占位版，setLayout 调用已注释，迁移后启用。
 */
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { ipc } from '@/utils/ipcRenderer'

const props = defineProps({
  /** 关联的 Agent 会话 ID */
  sessionId: {
    type: String,
    required: true,
  },
  /** 当前标签 ID */
  tabId: {
    type: String,
    required: true,
  },
})

const containerRef = ref(null)

/** 全局单调递增的布局代际号，防止旧 IPC 覆盖新布局 */
let nextRevision = 0
function getNextRevision() {
  return ++nextRevision
}

/**
 * 检查页面上是否有需要遮盖原生 View 的应用浮层
 * Ant Design 的 Modal、Drawer、Select 下拉等都会被原生 View 盖住
 */
function hasBlockingOverlay() {
  // Ant Design Modal
  const modalWraps = document.querySelectorAll('.ant-modal-wrap')
  for (const wrap of modalWraps) {
    if (wrap.style.display !== 'none' && !wrap.style.display.includes('none')) return true
  }
  // Ant Design Drawer
  const drawers = document.querySelectorAll('.ant-drawer-open')
  if (drawers.length > 0) return true
  // Ant Design Select 下拉（在 body 下动态创建）
  const selectDropdowns = document.querySelectorAll('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
  if (selectDropdowns.length > 0) return true
  return false
}

/** 判断 MutationObserver 的变更是否可能影响浮层状态 */
function mutationsAffectOverlay(mutations) {
  return mutations.some((mutation) => {
    if (mutation.type === 'attributes') {
      const target = mutation.target instanceof Element ? mutation.target : null
      if (!target) return false
      return !!target.closest('.ant-modal-wrap, .ant-drawer, .ant-select-dropdown, .ant-dropdown, .ant-popover, .ant-notification')
    }
    const nodes = [...mutation.addedNodes, ...mutation.removedNodes]
    return nodes.some((node) => {
      if (!(node instanceof Element)) return false
      return node.matches('.ant-modal-wrap, .ant-drawer, .ant-select-dropdown, .ant-dropdown, .ant-popover, .ant-notification')
        || !!node.querySelector('.ant-modal-wrap, .ant-drawer, .ant-select-dropdown, .ant-dropdown, .ant-popover, .ant-notification')
    })
  })
}

onMounted(() => {
  const el = containerRef.value
  if (!el) return

  let frame = 0

  /** 发布当前布局到主进程 */
  const publish = (visible) => {
    if (frame) cancelAnimationFrame(frame)
    frame = requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect()

      ipc?.invoke('controller/browser/setLayout', {
        sessionId: props.sessionId,
        tabId: props.tabId,
        revision: getNextRevision(),
        visible: visible && rect.width > 4 && rect.height > 4,
        bounds: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      })
    })
  }

  /** 根据浮层状态发布可见性 */
  const publishVisibility = () => publish(!hasBlockingOverlay())

  // 监听容器尺寸变化
  const resizeObserver = new ResizeObserver(publishVisibility)
  resizeObserver.observe(el)

  // 监听 Ant Design 浮层出现/消失
  const overlayObserver = new MutationObserver((mutations) => {
    if (mutationsAffectOverlay(mutations)) publishVisibility()
  })
  overlayObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style'],
  })

  // 窗口大小变化时重新发布
  const onWindowResize = () => publishVisibility()
  window.addEventListener('resize', onWindowResize)

  // 首次发布
  publishVisibility()

  // ===== Cleanup =====
  onUnmounted(() => {
    resizeObserver.disconnect()
    overlayObserver.disconnect()
    window.removeEventListener('resize', onWindowResize)
    if (frame) cancelAnimationFrame(frame)

    // 通知主进程隐藏原生 View
    ipc?.invoke('controller/browser/setLayout', {
      sessionId: props.sessionId,
      tabId: props.tabId,
      revision: getNextRevision(),
      visible: false,
      bounds: { x: 0, y: 0, width: 0, height: 0 },
    })
  })
})

// tabId 变化时触发 ResizeObserver 自然重新发布
watch(() => props.tabId, () => {
  // ResizeObserver 会自动触发，无需额外操作
})
</script>

<style lang="less" scoped>
.browser-slot {
  flex: 1;
  min-height: 0;
  background-color: var(--bg-panel);
  overflow: hidden;
}
</style>
