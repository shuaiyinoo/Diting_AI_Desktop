<template>
  <div id="app-software" class="page-container">
    <div class="card-grid">
      <div class="feature-card feature-card--full">
        <div class="feature-card__title">
          1. 调用其它软件 (exe、bash等可执行程序)
          <div class="feature-card__subtitle">
            {{ t('softwarePage.note') }}
          </div>
        </div>
        <div class="feature-card__body">
          <span>
            {{ soft }}
            <Button @click="openSoft">{{ t('softwarePage.execute') }}</Button>
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
import { useI18n } from 'vue-i18n'


const { t } = useI18n()
const soft = ref('powershell.exe');

function openSoft() {
  ipc.invoke(ipcApiRoute.framework.openSoftware, {softName: soft.value}).then(result => {
    if (!result) {
      toast.error(t('softwarePage.notFound'));
    }
  })
}
</script>