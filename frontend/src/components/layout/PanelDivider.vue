<template>
  <div
    class="w-[5px] cursor-col-resize flex items-center justify-center flex-shrink-0 relative z-5 bg-card"
    @mousedown="onMouseDown"
  >
    <div
      class="w-px h-full bg-border transition-all duration-150"
      :class="hoverOrActive ? 'w-0.5 bg-primary' : ''"
      ref="lineRef"
    />
  </div>
</template>

<script setup>
/**
 * 可复用的面板拖拽分隔条
 *
 * 用法：<PanelDivider @resize="onResize" />
 * onResize(delta) 接收拖拽的 delta 值（正值=向右拖，负值=向左拖）
 */
import { ref } from 'vue'

const emit = defineEmits({
  resize: (delta) => typeof delta === 'number',
})

const lineRef = ref(null)
const hoverOrActive = ref(false)

let dragging = false
let startX = 0

function onMouseDown(event) {
  event.preventDefault()
  dragging = true
  hoverOrActive.value = true
  startX = event.clientX
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

function onMouseMove(event) {
  if (!dragging) return
  const delta = event.clientX - startX
  startX = event.clientX
  emit('resize', delta)
}

function onMouseUp() {
  dragging = false
  hoverOrActive.value = false
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}
</script>
