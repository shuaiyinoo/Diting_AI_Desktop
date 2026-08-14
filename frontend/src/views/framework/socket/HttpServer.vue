<template>
  <div id="app-socket-http" class="page-container">
    <div class="card-grid">
      <div class="feature-card feature-card--full">
        <div class="feature-card__title">1. 使用http与主进程通信</div>
        <div class="feature-card__body">
          <p>* 状态：{{ currentStatus }}</p>
          <p>* 地址：{{ servicAddress }}</p>
          <p>* 发送请求：
            <Button @click="sendRequest('pictures')"> 打开【我的图片】 </Button>
          </p>
        </div>
      </div>
      <div class="feature-card feature-card--full">
        <div class="feature-card__title">2. 使用http与服务端通信</div>
        <div class="feature-card__body">
          <p>
            <Button @click="backendRequest()"> 发送请求 </Button>
            （请自行创建服务）
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup>
import { Button } from '@/components/ui/button'

import { ipcApiRoute } from '@/api';
import { ipc } from '@/utils/ipcRenderer';
import axios from 'axios';
import storage from 'store2';
import { ref, onMounted } from 'vue';
import { toast } from 'vue-sonner';

const currentStatus = ref('关闭');
const servicAddress = ref('无');

onMounted(() => {
  init()
})

function init() {
  ipc.invoke(ipcApiRoute.framework.checkHttpServer, {}).then(r => {
    if (r.enable) {
      currentStatus.value = '开启';
      servicAddress.value = r.server;
      storage.set('httpServiceConfig', r);
    }
  })
}

function sendRequest(id) {
  if (currentStatus.value == '关闭') {
    toast.error('http服务未开启');
    return;
  }

  requestHttp(ipcApiRoute.framework.doHttpRequest, {id}).then(res => {
  })
}

function requestHttp(uri, parameter) {
  const config = storage.get('httpServiceConfig');
  const host = config.server || 'http://localhost:7071';
  let url = host + '/' + uri;
  console.log('url:', url);
  return axios({
    url: url,
    method: 'post',
    data: parameter,
    timeout: 60000,
  })
}

function backendRequest() {
  console.log('GO_URL:', import.meta.env.VITE_GO_URL);
  const cfg = {
    baseURL: import.meta.env.VITE_GO_URL,
    method: 'get',
    url: '/hello',
    timeout: 3000,
  }
  axios(cfg).then(res => {
    console.log('res:', res);
    const data = res.data || null;
    toast.info(`go服务返回: ${data}`, );
  })
}
</script>