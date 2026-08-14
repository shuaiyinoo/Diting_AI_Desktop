<template>
  <div id="app-sqlite-db" class="page-container">
    <div class="card-grid">
      <div class="feature-card feature-card--full">
        <div class="feature-card__title">1. sqlite本地数据库</div>
        <div class="feature-card__body">
          <div>
            <div :span="8">• 大数据量: 0-1024GB(单库)</div>
            <div :span="8">• 高性能</div>
            <div :span="8">• 类mysql语法</div>
          </div>
        </div>
      </div>
      <div class="feature-card feature-card--full">
        <div class="feature-card__title">2. 数据目录</div>
        <div class="feature-card__body">
          <div>
            <div :span="12">
              <Input v-model="data_dir" :value="data_dir" addon-before="数据目录" />
            </div>
            <div :span="2"></div>
            <div :span="5">
              <Button @click="selectDir()">修改目录</Button>
            </div>
            <div :span="5">
              <Button @click="openDir()">打开目录</Button>
            </div>
          </div>
        </div>
      </div>
      <div class="feature-card feature-card--full">
        <div class="feature-card__title">3. 测试数据</div>
        <div class="feature-card__body">
          <div>
            <div :span="24">{{ all_list }}</div>
          </div>
        </div>
      </div>
      <div class="feature-card feature-card--full">
        <div class="feature-card__title">4. 添加数据</div>
        <div class="feature-card__body">
          <div>
            <div :span="6">
              <Input v-model="name" :value="name" addon-before="姓名" />
            </div>
            <div :span="3"></div>
            <div :span="6">
              <Input v-model="age" :value="age" addon-before="年龄" />
            </div>
            <div :span="3"></div>
            <div :span="6">
              <Button @click="sqlitedbOperation('add')">添加</Button>
            </div>
          </div>
        </div>
      </div>
      <div class="feature-card feature-card--full">
        <div class="feature-card__title">4. 获取数据</div>
        <div class="feature-card__body">
          <div>
            <div :span="6">
              <Input v-model="search_age" addon-before="年龄" />
            </div>
            <div :span="3"></div>
            <div :span="6"></div>
            <div :span="3"></div>
            <div :span="6">
              <Button @click="sqlitedbOperation('get')">查找</Button>
            </div>
          </div>
          <div>
            <div :span="24">{{ userList }}</div>
          </div>
        </div>
      </div>
      <div class="feature-card feature-card--full">
        <div class="feature-card__title">5. 修改数据</div>
        <div class="feature-card__body">
          <div>
            <div :span="6">
              <Input v-model="update_name" addon-before="姓名(条件)" />
            </div>
            <div :span="3"></div>
            <div :span="6">
              <Input v-model="update_age" addon-before="年龄" />
            </div>
            <div :span="3"></div>
            <div :span="6">
              <Button @click="sqlitedbOperation('update')">更新</Button>
            </div>
          </div>
        </div>
      </div>
      <div class="feature-card feature-card--full">
        <div class="feature-card__title">6. 删除数据</div>
        <div class="feature-card__body">
          <div>
            <div :span="6">
              <Input v-model="delete_name" addon-before="姓名" />
            </div>
            <div :span="3"></div>
            <div :span="6"></div>
            <div :span="3"></div>
            <div :span="6">
              <Button @click="sqlitedbOperation('del')">删除</Button>
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
import { ref, onMounted } from 'vue';
import { toast } from 'vue-sonner';

const name = ref('李四');
const age = ref(20);
const userList = ref(['空']);
const search_age = ref(20);
const update_name = ref('李四');
const update_age = ref(31);
const delete_name = ref('李四');
const all_list = ref(['空']);
const data_dir = ref('');

onMounted(() => {
  init()
})

function init() {
  const params = {
    action: 'getDataDir',
  }
  ipc.invoke(ipcApiRoute.framework.sqlitedbOperation, params).then(res => {
    if (res.code == -1) {
      toast.error('请检查sqlite是否正确安装', 5);
      return
    }

    data_dir.value = res.result;
    getAllTestData();
  })
}

function getAllTestData () {
  const params = {
    action: 'all',
  }
  ipc.invoke(ipcApiRoute.framework.sqlitedbOperation, params).then(res => {
    if (res.all_list.length == 0) {
      return false;
    }
    all_list.value = res.all_list;
  })
}

function selectDir() {
  ipc.invoke(ipcApiRoute.os.selectFolder, '').then(r => {
    data_dir.value = r;
    modifyDataDir(r);
  })
}

function openDir() {
  console.log('data_dir:', data_dir.value);
  ipc.invoke(ipcApiRoute.os.openDirectory, {id: data_dir.value})
}

function modifyDataDir(dir) {
  const params = {
    action: 'setDataDir',
    data_dir: dir
  }
  ipc.invoke(ipcApiRoute.framework.sqlitedbOperation, params).then(res => {
    all_list.value = res.all_list;
  })
}

function sqlitedbOperation (ac) {
  const params = {
    action: ac,
    info: {
      name: name.value,
      age: parseInt(age.value)
    },
    search_age: parseInt(search_age.value),
    update_name: update_name.value,
    update_age: parseInt(update_age.value),
    delete_name: delete_name.value,
  }
  if (ac == 'add' && name.value.length == 0) {
    toast.error(`请填写数据`);
  }
  ipc.invoke(ipcApiRoute.framework.sqlitedbOperation, params).then(res => {
    console.log('res:', res);
    if (ac == 'get') {
      if (res.result.length == 0) {
        toast.error(`没有数据`);
        return;
      }
      userList.value = res.result;
    }
    if (res.all_list.length == 0) {
      all_list.value = ['空'];
      return;
    }
    all_list.value = res.all_list;
    toast.success(`success`);
  })
}
</script>