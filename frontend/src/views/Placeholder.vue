<template>
  <div class="placeholder">
    <a-card :title="title" class="placeholder-card">
      <p class="placeholder-tip">该模块页面待开发。</p>
    </a-card>
  </div>
</template>

<script setup>
defineProps({
  title: {
    type: String,
    default: '页面'
  }
})
</script>

<style lang="less" scoped>
.placeholder {
  padding: 24px;
  display: flex;
  justify-content: center;
  align-items: flex-start;
}

.placeholder-card {
  width: 480px;
}

.placeholder-tip {
  color: #999999;
  margin: 0;
}
</style>
