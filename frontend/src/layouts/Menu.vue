<template>
  <div class="flex h-full w-full">
    <!-- 左侧菜单栏 -->
    <div class="flex h-full shrink-0 flex-col overflow-auto border-t border-r border-border bg-sidebar" style="width: 200px">
      <button
        v-for="(menuInfo, subIndex) in menuList"
        :key="subIndex"
        class="mx-2 my-1 rounded-lg px-4 py-2.5 text-left text-sm transition-all duration-200"
        :class="current === subIndex
          ? 'bg-accent text-accent-foreground font-medium'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'"
        @click="changeMenu(subIndex)"
      >
        <router-link :to="{ name: menuInfo.pageName, params: menuInfo.params }" class="block no-underline">
          {{ menuInfo.title }}
        </router-link>
      </button>
    </div>

    <!-- 右侧内容区 -->
    <div class="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <router-view />
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import subMenu from '@/router/subMenu';

const props = defineProps({
  id: {
    type: String,
    default: ''
  },
  autoNavigate: {
    type: Boolean,
    default: true
  }
});

const router = useRouter();
const current = ref(0);

// 将 subMenu 对象转为数组以便 v-for 遍历
const menuList = computed(() => {
  const menuObj = subMenu[props.id] || {};
  return Object.values(menuObj);
});

watch(() => props.id, () => {
  current.value = 0;
  menuHandle();
});

onMounted(() => {
  menuHandle();
});

function menuHandle() {
  if (!props.autoNavigate) return;
  const list = menuList.value;
  if (list.length > 0) {
    router.push({ name: list[0].pageName, params: list[0].params });
  }
}

function changeMenu(index) {
  current.value = index;
}
</script>
