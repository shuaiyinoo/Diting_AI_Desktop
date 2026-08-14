<template>
  <div id="app-jobs" class="page-container">
    <div class="card-grid">
      <div class="feature-card feature-card--full">
        <div class="feature-card__title">1. 任务 / 并发任务</div>
        <div class="feature-card__body">
          <span>
            <Button @click="runJob(1, 'create')">执行任务1</Button>
            进度: {{ progress1 }} , 进程pid: {{ progress1_pid }}
            <Button @click="runJob(1, 'pause')">暂停</Button>
            <Button @click="runJob(1, 'resume')">恢复</Button>
            <Button @click="runJob(1, 'close')">关闭</Button>
          </span>
          <p></p>
          <span>
            <Button @click="runJob(2, 'create')">执行任务2</Button>
            进度: {{ progress2 }} , 进程pid: {{ progress2_pid }}
            <Button @click="runJob(2, 'pause')">暂停</Button>
            <Button @click="runJob(2, 'resume')">恢复</Button>
            <Button @click="runJob(2, 'close')">关闭</Button>
          </span>
        </div>
      </div>
      <div class="feature-card feature-card--full">
        <div class="feature-card__title">2. 任务池 / 并发任务</div>
        <div class="feature-card__body">
          <span>
            <Button @click="createPool()">创建进程池</Button>
            进程pids: {{ processPids }}
          </span>
          <p></p>
          <span>
            <Button @click="runJobByPool(3, 'run')">执行任务3</Button>
            进度: {{ progress3 }} , 进程pid: {{ progress3_pid }}
          </span>
          <p></p>
          <span>
            <Button @click="runJobByPool(4, 'run')">执行任务4</Button>
            进度: {{ progress4 }} , 进程pid: {{ progress4_pid }}
          </span>
          <p></p>
          <span>
            <Button @click="runJobByPool(5, 'run')">执行任务5</Button>
            进度: {{ progress5 }} , 进程pid: {{ progress5_pid }}
          </span>
          <p></p>
          <span>
            <Button @click="runJobByPool(6, 'run')">执行任务6</Button>
            进度: {{ progress6 }} , 进程pid: {{ progress6_pid }}
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
import { ref, onMounted } from 'vue';

const processPids = ref('');
const progress1 = ref(0);
const progress2 = ref(0);
const progress3 = ref(0);
const progress4 = ref(0);
const progress5 = ref(0);
const progress6 = ref(0);
const progress1_pid = ref(0);
const progress2_pid = ref(0);
const progress3_pid = ref(0);
const progress4_pid = ref(0);
const progress5_pid = ref(0);
const progress6_pid = ref(0);

onMounted(() => {
  init()
})

function init() {
  ipc.removeAllListeners(ipcApiRoute.framework.timerJobProgress);
  ipc.removeAllListeners(ipcApiRoute.framework.createPoolNotice);

  ipc.on(ipcApiRoute.framework.timerJobProgress, (event, result) => {
    const { jobId, pid, number} = result;
    switch (jobId) {
      case 1:
        progress1.value = number;
        progress1_pid.value = pid == 0 ? pid : progress1_pid.value;
        break;
      case 2:
        progress2.value = number;
        progress2_pid.value = pid == 0 ? pid : progress2_pid.value;
        break;
      case 3:
        progress3.value = number;
        progress3_pid.value = pid == 0 ? pid : progress3_pid.value;
        break;
      case 4:
        progress4.value = number;
        progress4_pid.value = pid == 0 ? pid : progress4_pid.value;
        break;
      case 5:
        progress5.value = number;
        progress5_pid.value = pid == 0 ? pid : progress5_pid.value;
        break;
      case 6:
        progress6.value = number;
        progress6_pid.value = pid == 0 ? pid : progress6_pid.value;
        break;
    }
  })

  ipc.on(ipcApiRoute.framework.createPoolNotice, (event, result) => {
    processPids.value = JSON.stringify(result);
  })
}

function runJob(jobId, operation) {
  const params = {
    jobId,
    type: 'timer',
    action: operation
  }
  ipc.invoke(ipcApiRoute.framework.someJob, params).then(data => {
    if (operation != 'create') return;
    switch (data.jobId) {
      case 1:
        progress1_pid.value = data.result.pid;
        break;
      case 2:
        progress2_pid.value = data.result.pid;
        break;
    }
  })
}

function createPool() {
  const params = {
    number: 3,
  }
  ipc.send(ipcApiRoute.framework.createPool, params);
}

function runJobByPool(jobId, operation) {
  const params = {
    jobId,
    type: 'timer',
    action: operation
  }
  ipc.invoke(ipcApiRoute.framework.someJobByPool, params).then(data => {
    const { jobId, result} = data;
    switch (jobId) {
      case 3:
        progress3_pid.value = result.pid;
        break;
      case 4:
        progress4_pid.value = result.pid;
        break;
      case 5:
        progress5_pid.value = result.pid;
        break;
      case 6:
        progress6_pid.value = result.pid;
        break;
    }
  })
}
</script>