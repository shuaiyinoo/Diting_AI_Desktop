<template>
  <div class="w-[260px] flex-shrink-0 bg-card border-r border-border flex flex-col h-full">
    <!-- 头部 -->
    <div class="flex items-center justify-between px-3.5 py-3 border-b border-border">
      <span class="text-sm font-semibold text-foreground">{{ t('ragSidebar.sessionList') }}</span>
      <Button size="sm" :disabled="disabled" @click="$emit('create')">
        <Plus class="mr-1 size-3.5" />
        {{ t('ragSidebar.newSession') }}
      </Button>
    </div>

    <!-- 会话列表 -->
    <div class="flex-1 overflow-y-auto p-1.5 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-sm">
      <div v-if="loading" class="flex items-center justify-center py-8">
        <Spinner class="size-5 text-muted-foreground" />
      </div>
      <div v-if="!loading && sessions.length === 0" class="py-8 text-center text-sm text-muted-foreground">{{ t('ragSidebar.noSessions') }}</div>
      <div
        v-for="session in sessions"
        :key="session.sessionId"
        class="group flex items-center gap-1.5 px-2.5 py-2 rounded-lg cursor-pointer transition-colors mb-0.5 hover:bg-muted"
        :class="activeSessionId === session.sessionId ? 'bg-primary/10' : ''"
        @click="$emit('select', session.sessionId)"
      >
        <div class="flex-1 min-w-0">
          <div
            class="text-[13px] truncate leading-tight"
            :class="activeSessionId === session.sessionId ? 'text-primary font-medium' : 'text-foreground'"
            :title="session.title"
          >
            {{ session.title || t('ragSidebar.newSession') }}
          </div>
          <div class="text-[11px] text-muted-foreground mt-0.5">{{ formatDateTime(session.lastMessageAt) }}</div>
        </div>
        <div class="opacity-0 transition-opacity flex-shrink-0 group-hover:opacity-100" @click.stop>
          <Popover v-model:open="menuOpen[session.sessionId]">
            <PopoverTrigger as-child>
              <button type="button" class="inline-flex items-center justify-center size-6 border-none bg-transparent rounded text-muted-foreground cursor-pointer transition-colors hover:bg-muted hover:text-foreground" @click.stop>
                <MoreHorizontal class="size-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent class="w-auto p-1" align="end" side-offset="4">
              <button class="flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent" @click="onMenuClick('rename', session); menuOpen[session.sessionId] = false">
                <Pencil class="mr-2 size-4" />
                <span>{{ t('ragSidebar.rename') }}</span>
              </button>
              <div class="my-1 h-px bg-border"></div>
              <button class="flex w-full items-center rounded-sm px-2 py-1.5 text-sm text-destructive hover:bg-accent" @click="onMenuClick('delete', session); menuOpen[session.sessionId] = false">
                <Trash2 class="mr-2 size-4" />
                <span>{{ t('ragSidebar.delete') }}</span>
              </button>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>

    <!-- 重命名弹窗 -->
    <Dialog v-model:open="renameVisible">
      <DialogContent class="max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{{ t('ragSidebar.renameTitle') }}</DialogTitle>
        </DialogHeader>
        <Input
          v-model="renameText"
          :placeholder="t('ragSidebar.renamePlaceholder')"
          :maxlength="50"
          @keydown.enter="onRenameConfirm"
        />
        <DialogFooter>
          <Button variant="outline" @click="onRenameCancel">{{ t('ragSidebar.cancel') }}</Button>
          <Button :disabled="renameLoading" @click="onRenameConfirm">{{ t('ragSidebar.confirm') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue';
import { useI18n } from 'vue-i18n';
import { toast } from 'vue-sonner';
import { Plus, MoreHorizontal, Pencil, Trash2 } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Spinner } from '@/components/ui/spinner';

defineProps({
  sessions: {
    type: Array,
    default: () => [],
  },
  activeSessionId: {
    type: Number,
    default: null,
  },
  loading: {
    type: Boolean,
    default: false,
  },
  disabled: {
    type: Boolean,
    default: false,
  },
});

const { t } = useI18n();

const emit = defineEmits(['create', 'select', 'rename', 'delete']);

const renameVisible = ref(false);
const renameText = ref('');
const renameLoading = ref(false);
const renameTarget = ref(null);
const menuOpen = reactive({});

function onMenuClick(key, session) {
  if (key === 'rename') {
    renameTarget.value = session;
    renameText.value = session.title || t('ragSidebar.newSession');
    renameVisible.value = true;
  } else if (key === 'delete') {
    onDelete(session);
  }
}

function onRenameConfirm() {
  if (!renameTarget.value) return;
  const title = renameText.value.trim();
  if (!title) {
    toast.warning(t('ragSidebar.nameEmpty'));
    return;
  }
  renameLoading.value = true;
  emit('rename', { sessionId: renameTarget.value.sessionId, title });
  renameLoading.value = false;
  renameVisible.value = false;
  renameTarget.value = null;
}

function onRenameCancel() {
  renameVisible.value = false;
  renameTarget.value = null;
  renameText.value = '';
}

function onDelete(session) {
  emit('delete', session.sessionId);
}

function formatDateTime(time) {
  if (!time) return '';
  const d = new Date(time);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const pad = (n) => String(n).padStart(2, '0');
  if (isToday) {
    return `${t('ragSidebar.today')} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
</script>
