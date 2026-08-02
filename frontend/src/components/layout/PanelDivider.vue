<template>
  <div class="panel-divider" @mousedown="onMouseDown">
    <div class="panel-divider__line" />
  </div>
</template>

<script setup>
/**
 * 可复用的面板拖拽分隔条
 *
 * 用法：<PanelDivider @resize="onResize" />
 * onResize(delta) 接收拖拽的 delta 值（正值=向右拖，负值=向左拖）
 */
const emit = defineEmits({
  resize: (delta) => typeof delta === 'number',
})

let dragging = false
let startX = 0

function onMouseDown(event) {
  event.preventDefault()
  dragging = true
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
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
  document.body.style.cursor = ''
  document.body.style.userSelect = ''
}
</script>

<style lang="less" scoped>
.panel-divider {
  width: 5px;
  cursor: col-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  position: relative;
  z-index: 5;
  background-color: var(--bg-panel);

  &__line {
    width: 1px;
    height: 100%;
    background-color: var(--border-color);
    transition: background-color 0.15s ease, width 0.15s ease;
  }

  &:hover &__line,
  &:active &__line {
    background-color: var(--bg-divider-hover);
    width: 2px;
  }
}
</style>
