<script setup>
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { Toaster } from 'vue-sonner'

// 读取当前主题（深色/浅色）
const isDark = ref(false)

function updateDarkMode() {
  isDark.value = document.documentElement.classList.contains('dark')
}

let observer = null

onMounted(() => {
  updateDarkMode()

  // 监听 HTML class 变化（主题切换时触发）
  observer = new MutationObserver(() => {
    updateDarkMode()
  })
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
})

onBeforeUnmount(() => {
  if (observer) {
    observer.disconnect()
    observer = null
  }
})

const theme = computed(() => (isDark.value ? 'dark' : 'light'))
</script>

<template>
  <Toaster
    position="bottom-right"
    :theme="theme"
    :rich-colors="true"
    :expand="true"
    :offset="{ bottom: '20px', right: '20px' }"
  />
</template>
