<template>
  <div id="app-os-file" class="page-container">
    <div class="card-grid">
      <div class="feature-card feature-card--full">
        <div class="feature-card__title">1. 系统原生对话框</div>
        <div class="feature-card__body">
          <span>
            <Button @click="messageShow()">消息提示(ipc)</Button>
            <Button @click="messageShowConfirm()">消息提示与确认(ipc)</Button>
          </span>
        </div>
      </div>
      <div class="feature-card feature-card--full">
        <div class="feature-card__title">2. 选择保存目录</div>
        <div class="feature-card__body">
          <div>
            <div :span="12">
              <Input v-model="dir_path" :value="dir_path" addon-before="保存目录" />
            </div>
            <div :span="12">
              <Button @click="selectDir">修改目录</Button>
            </div>
          </div>
        </div>
      </div>
      <div class="feature-card feature-card--full">
        <div class="feature-card__title">3. 打开文件夹</div>
        <div class="feature-card__body">
          <div class="grid grid-cols-4 gap-4">
            <div v-for="item in fileList" :key="item.id" class="cursor-pointer rounded-lg border p-4 hover:bg-accent" @click="openDirectry(item.id)">
              <div class="text-sm font-medium">{{ item.content }}</div>
              <Button type="link" class="mt-2">打开</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup>
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

import { ipcApiRoute } from '@/api';
import { ipc } from '@/utils/ipcRenderer';

import { ref } from 'vue';
import { toast } from 'vue-sonner';

const fileList = [
  {
    content: '【下载】目录',
    id: 'downloads'
  },
  {
    content: '【图片】目录',
    id: 'pictures'
  },
  {
    content: '【文档】目录',
    id: 'documents'
  },
  {
    content: '【音乐】目录',
    id: 'music'
  }
];

const dir_path = ref('D:\\www\\ee');

function openDirectry (id) {
  ipc.invoke(ipcApiRoute.os.openDirectory, {id: id})
}

function selectDir() {
  ipc.invoke(ipcApiRoute.os.selectFolder).then(r => {
    dir_path.value = r;
    toast.info(r);
  })
}

function messageShow() {
  ipc.invoke(ipcApiRoute.os.messageShow).then(r => {
    toast.info(r);
  })
}

function messageShowConfirm() {
  ipc.invoke(ipcApiRoute.os.messageShowConfirm).then(r => {
    toast.info(r);
  })
}
</script>