<template>
  <div id="effect-login-index" class="page-container">
    <div class="card-grid">
      <div class="feature-card feature-card--full">
        <div class="feature-card__title">1. 登录</div>
        <div class="feature-card__body">
          <span>
            <Button @click="loginWindow()">切换为登录窗口</Button>
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
import { useRouter } from 'vue-router';

const router = useRouter();

function loginWindow() {
  router.push({ name: 'SpecialLoginWindow'});
  ipc.invoke(ipcApiRoute.effect.loginWindow, {width: 400, height: 300});
}
</script>