<template>
  <div id="app-software" class="page-container">
    <div class="card-grid">
      <div class="feature-card feature-card--full">
        <div class="feature-card__title">
          1. 调用其它软件 (exe、bash等可执行程序)
          <div class="feature-card__subtitle">
            注: 请先将【powershell.exe】复制到【electron-egg/build/extraResources】目录中
          </div>
        </div>
        <div class="feature-card__body">
          <span>
            {{ soft }}
            <Button @click="openSoft">执行</Button>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup>
import { Button } from '@/components/ui/button'

import { ipcApiRoute } from '@/api';
import { ipc } from '@/utils/ipcRenderer';
import { ref } from 'vue';
import { toast } from 'vue-sonner';

const soft = ref('powershell.exe');

function openSoft() {
  ipc.invoke(ipcApiRoute.framework.openSoftware, {softName: soft.value}).then(result => {
    if (!result) {
      toast.error('程序不存在');
    }
  })
}
</script>