<template>
  <div id="app-socket-server" class="page-container">
    <div class="card-grid">
      <div class="feature-card feature-card--full">
        <div class="feature-card__title">1. 使用socket与主进程通信</div>
        <div class="feature-card__body">
          <span>
            <p>* 状态：{{ currentStatus }}</p>
          </span>
          <p>* 地址：{{ servicAddress }}</p>
        </div>
      </div>
      <div class="feature-card feature-card--full">
        <div class="feature-card__title">2. 发送请求</div>
        <div class="feature-card__body">
          <span>
            <Button @click="sendRequest('downloads')"> 打开【我的下载】 </Button>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup>
import { Button } from '@/components/ui/button'

import { ipcApiRoute } from '@/api';
import { io } from 'socket.io-client';
import { ref, onMounted } from 'vue';
import { toast } from 'vue-sonner';

const currentStatus = ref('关闭');
const servicAddress = ref('ws://localhost:7070');
const client = {
  socket: null
};

onMounted(() => {
  init()
})

function init() {
  client.socket = io(servicAddress.value);
  client.socket.on('connect', () => {
    console.log('connect!!!!!!!!');
    currentStatus.value = '开启';
  });
}

function sendRequest(id) {
  if (currentStatus.value == '关闭') {
    toast.error('socketio服务未开启');
    return;
  }

  const method = ipcApiRoute.framework.doSocketRequest;
  client.socket.emit('socket-channel', { cmd: method, args: {id} }, (response) => {
    console.log('response:', response)
  });
}
</script>