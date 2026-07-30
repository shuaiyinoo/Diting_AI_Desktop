<template>
    <a-config-provider :theme="themeConfig">
        <router-view/>
    </a-config-provider>
</template>
<script setup>
import { onMounted } from 'vue';
import { themeConfig } from './theme';

onMounted(() => {
  const loadingElement = document.getElementById('loadingPage');
  if (loadingElement) {
    loadingElement.remove();
  }
});
</script>
<style lang="less"></style>
