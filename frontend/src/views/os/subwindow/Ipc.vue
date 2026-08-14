<template>
  <div id="app-os-subwindow-ipc" class="page-container">
    <div class="card-grid">
      <div class="feature-card feature-card--full">
        <div class="feature-card__title">1. 发送异步消息</div>
        <div class="feature-card__body">
          <span>
            <Button @click="handleInvoke">发送 - 回调</Button>
            结果：{{ message1 }}
          </span>
          <p></p>
          <span>
            <Button @click="handleInvoke2">发送 - async/await</Button>
            结果：{{ message2 }}
          </span>
        </div>
      </div>
      <div class="feature-card feature-card--full">
        <div class="feature-card__title">
          2. 同步消息（不推荐，阻塞执行）
        </div>
        <div class="feature-card__body">
          <span>
            <Button @click="handleSendSync">同步消息</Button>
            结果：{{ message3 }}
          </span>
        </div>
      </div>
      <div class="feature-card feature-card--full">
        <div class="feature-card__title">3. 长消息： 服务端持续向前端页面发消息</div>
        <div class="feature-card__body">
          <span>
            <Button @click="sendMsgStart">开始</Button>
            <Button @click="sendMsgStop">结束</Button>
            结果：{{ messageString }}
          </span>
        </div>
      </div>
      <div class="feature-card feature-card--full">
        <div class="feature-card__title">4. 多窗口通信：窗口之间互相通信</div>
        <div class="feature-card__body">
          <span>
            <Button @click="sendTosubWindow()">向主窗口发消息</Button>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup>
import { Button } from '@/components/ui/button'

import { ref, onMounted } from 'vue';
import { ipcApiRoute } from '@/api';
import { ipc } from '@/utils/ipcRenderer';
import { toast } from 'vue-sonner';

const messageString = ref('');
const message1 = ref('');
const message2 = ref('');
const message3 = ref('');

onMounted(() => {
  init()
})

function init() {
  ipc.on(ipcApiRoute.framework.ipcSendMsg, (event, result) => {
    console.log('[ipcRenderer] [socketMsgStart] result:', result);

    messageString.value = result;
    event.sender.send(ipcApiRoute.framework.hello, 'electron-egg');
  })

  ipc.removeAllListeners(ipcApiRoute.os.window1ToWindow2);
  ipc.on(ipcApiRoute.os.window1ToWindow2, (event, arg) => {
      toast.info(arg);
  })
}

function sendMsgStart() {
  const params = {
    type: 'start',
    content: '开始'
  }
  ipc.send(ipcApiRoute.framework.ipcSendMsg, params)
}

function sendMsgStop() {
  const params = {
    type: 'end',
    content: ''
  }
  ipc.send(ipcApiRoute.framework.ipcSendMsg, params)
}

function handleInvoke () {
  ipc.invoke(ipcApiRoute.framework.ipcInvokeMsg, '异步-回调').then(r => {
    console.log('r:', r);
    message1.value = r;
  });
}

async function handleInvoke2 () {
  const msg = await ipc.invoke(ipcApiRoute.framework.ipcInvokeMsg, '异步');
  console.log('msg:', msg);
  message2.value = msg;
}

function handleSendSync () {
  const msg = ipc.sendSync(ipcApiRoute.framework.ipcSendSyncMsg, '同步');
  message3.value = msg;
}

function sendTosubWindow () {
  const params = {
    receiver: 'main',
    content: '窗口2给主窗口发送消息'
  }
  ipc.invoke(ipcApiRoute.os.window1ToWindow2, params)
}
</script>