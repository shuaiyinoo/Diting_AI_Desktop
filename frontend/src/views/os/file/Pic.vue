<template>
  <div id="os-file-pic" class="page-container">
    <div class="card-grid">
      <div class="feature-card feature-card--full">
        <div class="feature-card__title">1. 加载本机图片</div>
        <div class="feature-card__body">
          <span>
            <Button @click="selectPic(0)">选择图片</Button>
          </span>
          <p></p>
          <img
            :width="500"
            :src=picPath
           />
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

const picPath = ref('https://zos.alipayobjects.com/rmsportal/jkjgkEfvpUPVyRjUImniVslZfWPnJuuZ.png');

function selectPic() {
  ipc.invoke(ipcApiRoute.os.selectPic).then(r => {
    picPath.value = r;
  })
}
</script>