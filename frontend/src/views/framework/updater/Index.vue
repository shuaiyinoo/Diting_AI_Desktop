<template>
  <div id="app-updater" class="page-container">
    <div class="card-grid">
      <div class="feature-card feature-card--full">
        <div class="feature-card__title">1. 自动更新</div>
        <div class="feature-card__body">
          <span>
            <Button @click="checkForUpdater()">检查更新</Button>
            <Button @click="download()">下载并安装</Button>
          </span>
        </div>
      </div>
      <div class="feature-card feature-card--full">
        <div class="feature-card__title">2. 下载进度</div>
        <div class="feature-card__body">
          <div :percent="percentNumber" status="active"  class="h-2 w-full rounded-full bg-muted"><div class="h-full rounded-full bg-primary" style="width: 50%"></div></div>
          <span>
            {{ progress }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup>
import { Button } from '@/components/ui/button'

import { ipc } from '@/utils/ipcRenderer';
import { ipcApiRoute, specialIpcRoute } from '@/api';
import { ref, onMounted } from 'vue';
import { toast } from 'vue-sonner';

const status = ref(0);
const progress = ref('');
const percentNumber = ref(0);

onMounted(() => {
  init()
})

function init() {
  ipc.removeAllListeners(specialIpcRoute.appUpdater);
  ipc.on(specialIpcRoute.appUpdater, (event, result) => {
    result = JSON.parse(result);
    status.value = result.status;
    if (result.status == 3) {
      progress.value = result.desc;
      percentNumber.value = result.percentNumber;
    } else {
      toast.info(result.desc);
    }
  })
}

function checkForUpdater () {
  ipc.invoke(ipcApiRoute.framework.checkForUpdater).then(r => {
    console.log(r);
  })
}

function download () {
  if (status.value !== 1) {
    toast.info('没有可用版本');
    return
  }
  ipc.invoke(ipcApiRoute.framework.downloadApp).then(r => {
    console.log(r);
  })
}
</script>