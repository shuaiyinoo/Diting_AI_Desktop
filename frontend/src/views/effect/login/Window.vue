<template>
  <div id="effect-login-window" class="w-full min-h-full bg-muted flex items-center justify-center">
    <div class="bg-card border border-border rounded-2xl px-12 py-10 shadow-[0_8px_32px_rgba(7,193,96,0.12)]">
      <div class="text-center">
        <a v-if="!loading" @click="login">
          <Button type="primary" size="large" shape="round">
            登录
          </Button>
        </a>
        <span v-else class="text-base text-muted-foreground">{{ loginText }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { Button } from '@/components/ui/button'

import { ipcApiRoute } from '@/api';
import { ipc } from '@/utils/ipcRenderer';
import { ref } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const loading = ref(false);
const loginText = ref('正在登陆......');

const login = () => {
  loading.value = true;
  setTimeout(() => {
    router.push({ name: 'Framework'});
    ipc.invoke(ipcApiRoute.effect.restoreWindow, {width: 980, height: 650})
  }, 2000);
}
</script>
