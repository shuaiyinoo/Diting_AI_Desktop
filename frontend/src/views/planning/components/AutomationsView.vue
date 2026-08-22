<template>
  <div class="relative flex min-h-0 flex-1 flex-col overflow-y-auto rounded-[10px] border border-border bg-card p-5 px-6">
    <!-- 列表模式 -->
    <div v-if="!formOpen">
      <!-- 空状态 -->
      <div v-if="automations.length === 0" class="flex min-h-[300px] flex-1 flex-col items-center justify-center gap-3 text-center">
        <div class="flex size-16 items-center justify-center rounded-full bg-primary/[0.06] text-primary"><Clock class="size-7" /></div>
        <h3 class="m-0 text-base text-foreground">{{ t('automation.title') }}</h3>
        <p class="max-w-[400px] text-[13px] leading-relaxed text-muted-foreground">{{ t('automation.desc') }}</p>
        <Button size="sm" @click="createNew">
          <Plus class="size-4" /> {{ t('automation.createNew') }}
        </Button>
      </div>

      <!-- 分组列表 -->
      <template v-else>
        <!-- 启用中 -->
        <div v-if="activeAutomations.length" class="mb-5">
          <div class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{{ t('automation.activeGroup') }}</div>
          <div
            v-for="a in activeAutomations"
            :key="a.id"
            class="mb-2 flex items-start gap-4 rounded-[10px] border border-border/50 bg-card px-5 py-4 transition-all hover:border-primary hover:shadow-sm cursor-pointer"
            @click="editAutomation(a)"
          >
            <div class="min-w-0 flex-1">
              <div class="mb-1 text-sm font-semibold text-foreground">{{ a.name }}</div>
              <div class="mb-2 line-clamp-2 overflow-hidden text-[13px] text-muted-foreground">{{ a.prompt }}</div>
              <div class="flex flex-wrap gap-1.5">
                <span class="inline-flex h-5 items-center gap-0.5 rounded bg-primary/[0.08] px-2 text-[11px] font-medium text-primary">{{ scheduleLabel(a) }}</span>
                <span v-if="a.nextRunAt" class="inline-flex h-5 items-center rounded bg-foreground/[0.04] px-2 text-[11px] text-muted-foreground">{{ t('automation.nextRun') }}: {{ formatTime(a.nextRunAt) }}</span>
                <span v-if="a.lastRunAt" class="inline-flex h-5 items-center rounded bg-foreground/[0.04] px-2 text-[11px] text-muted-foreground">{{ t('automation.lastRun') }}: {{ formatTime(a.lastRunAt) }}</span>
                <span v-if="a.runCount" class="inline-flex h-5 items-center rounded bg-foreground/[0.04] px-2 text-[11px] text-muted-foreground">{{ t('automation.runCount', { count: a.runCount }) }}</span>
                <span v-if="a.maxRuns" class="inline-flex h-5 items-center rounded bg-foreground/[0.04] px-2 text-[11px] text-muted-foreground">{{ t('automation.maxRuns', { count: a.maxRuns }) }}</span>
              </div>
            </div>
            <div class="flex shrink-0 gap-1">
              <Button variant="outline" size="sm" class="h-[30px] gap-1 px-2.5 text-xs" :disabled="runningIds.has(a.id)" @click.stop="runNow(a)">
                <Play class="size-3.5" /> {{ runningIds.has(a.id) ? t('automation.running') : t('automation.runNow') }}
              </Button>
              <Button variant="outline" size="sm" class="h-[30px] gap-1 px-2.5 text-xs" @click.stop="togglePause(a)">
                <PauseCircle v-if="a.active" class="size-3.5" /> <PlayCircle v-else class="size-3.5" />
              </Button>
              <Button variant="outline" size="sm" class="h-[30px] gap-1 px-2.5 text-xs hover:text-destructive hover:bg-destructive/5" @click.stop="confirmDelete(a)">
                <Trash2 class="size-3.5" />
              </Button>
            </div>
          </div>
        </div>

        <!-- 已暂停 -->
        <div v-if="pausedAutomations.length" class="mb-5">
          <div class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{{ t('automation.pausedGroup') }}</div>
          <div
            v-for="a in pausedAutomations"
            :key="a.id"
            class="mb-2 flex items-start gap-4 rounded-[10px] border border-border/50 bg-foreground/[0.02] px-5 py-4 opacity-70 transition-all hover:border-primary hover:shadow-sm cursor-pointer"
            @click="editAutomation(a)"
          >
            <div class="min-w-0 flex-1">
              <div class="mb-1 text-sm font-semibold text-foreground">{{ a.name }}</div>
              <div class="mb-2 line-clamp-2 overflow-hidden text-[13px] text-muted-foreground">{{ a.prompt }}</div>
              <div class="flex flex-wrap gap-1.5">
                <span class="inline-flex h-5 items-center gap-0.5 rounded bg-primary/[0.08] px-2 text-[11px] font-medium text-primary">{{ scheduleLabel(a) }}</span>
                <span v-if="a.consecutiveFailures" class="inline-flex h-5 items-center gap-0.5 rounded bg-amber-500/10 px-2 text-[11px] text-amber-600">{{ t('automation.consecutiveFailures', { count: a.consecutiveFailures }) }}</span>
              </div>
            </div>
            <div class="flex shrink-0 gap-1">
              <Button variant="outline" size="sm" class="h-[30px] gap-1 px-2.5 text-xs" @click.stop="togglePause(a)">
                <PlayCircle class="size-3.5" /> {{ t('automation.enable') }}
              </Button>
              <Button variant="outline" size="sm" class="h-[30px] gap-1 px-2.5 text-xs hover:text-destructive hover:bg-destructive/5" @click.stop="confirmDelete(a)">
                <Trash2 class="size-3.5" />
              </Button>
            </div>
          </div>
        </div>

        <!-- 已完成 -->
        <div v-if="completedAutomations.length" class="mb-5">
          <div class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{{ t('automation.completedGroup') }}</div>
          <div
            v-for="a in completedAutomations"
            :key="a.id"
            class="mb-2 flex items-start gap-4 rounded-[10px] border border-border/50 bg-foreground/[0.01] px-5 py-4 opacity-60 transition-all hover:border-primary hover:shadow-sm cursor-pointer"
            @click="editAutomation(a)"
          >
            <div class="min-w-0 flex-1">
              <div class="mb-1 text-sm font-semibold text-foreground">{{ a.name }}</div>
              <div class="mb-2 line-clamp-2 overflow-hidden text-[13px] text-muted-foreground">{{ a.prompt }}</div>
              <div class="flex flex-wrap gap-1.5">
                <span class="inline-flex h-5 items-center gap-0.5 rounded bg-green-500/10 px-2 text-[11px] text-green-600"><Check class="size-3" /> {{ t('automation.completed') }}</span>
                <span v-if="a.runCount" class="inline-flex h-5 items-center rounded bg-foreground/[0.04] px-2 text-[11px] text-muted-foreground">{{ t('automation.executed', { count: a.runCount }) }}</span>
              </div>
            </div>
            <div class="flex shrink-0 gap-1">
              <Button variant="outline" size="sm" class="h-[30px] gap-1 px-2.5 text-xs" @click.stop="togglePause(a)">
                <PlayCircle class="size-3.5" /> {{ t('automation.reenable') }}
              </Button>
              <Button variant="outline" size="sm" class="h-[30px] gap-1 px-2.5 text-xs hover:text-destructive hover:bg-destructive/5" @click.stop="confirmDelete(a)">
                <Trash2 class="size-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- 表单模式 -->
    <div v-else class="flex min-h-0 flex-1 flex-col">
      <div class="flex min-h-0 flex-1 gap-6">
        <!-- 左栏：返回 + 标题 + 任务描述 -->
        <div class="flex min-w-0 flex-1 flex-col gap-2">
          <!-- 顶部：返回 + 标题 -->
          <div class="flex shrink-0 items-center gap-3 pb-2">
            <Button variant="outline" size="sm" class="shrink-0 gap-1.5" @click="closeForm">
              <ChevronLeft class="size-4" /> {{ t('automation.back') }}
            </Button>
            <!-- 双击编辑任务名 -->
            <Input
              v-if="titleEditing"
              ref="titleInputRef"
              v-model="draft.name"
              class="min-w-0 flex-1 text-base font-semibold"
              :placeholder="t('automation.taskName')"
              @blur="titleEditing = false"
              @keydown.enter="titleEditing = false"
              @keydown.esc="titleEditing = false"
            />
            <h3 v-else class="m-0 flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-base text-foreground select-none" @dblclick="startEditTitle">
              <span class="truncate">{{ draft.name || t('automation.untitled') }}</span>
              <Pencil class="size-3.5 shrink-0 text-muted-foreground" />
            </h3>
          </div>
          <!-- 提示卡片 -->
          <div class="mb-2 flex flex-col gap-1.5 rounded-lg border border-border/50 bg-foreground/[0.04] p-3 px-3.5">
            <p class="m-0 text-xs font-semibold text-muted-foreground">{{ t('automation.recommendAgent') }}</p>
            <p class="m-0 text-xs leading-relaxed text-muted-foreground">{{ t('automation.recommendAgentDesc') }}</p>
            <p class="m-0 text-xs font-semibold text-muted-foreground">{{ t('automation.manualTip') }}</p>
            <p class="m-0 text-xs leading-relaxed text-muted-foreground">{{ t('automation.manualExample') }}</p>
          </div>

          <Label class="text-xs font-medium text-muted-foreground">{{ t('automation.promptLabel') }}</Label>
          <Textarea
            v-model="draft.prompt"
            class="min-h-[200px] flex-1 resize-y text-[13px] leading-relaxed"
            :placeholder="t('automation.promptPlaceholder')"
          />
          <div class="mt-1 text-xs text-muted-foreground">
            {{ t('automation.agentCreateHint') }}
          </div>
        </div>

        <!-- 右栏：配置 -->
        <div class="flex w-[340px] shrink-0 flex-col min-h-0">
          <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1 py-1">
          <!-- 启用状态 -->
          <div class="flex flex-col gap-1.5">
            <Label class="text-xs font-medium text-muted-foreground">{{ t('automation.statusLabel') }}</Label>
            <div class="flex cursor-pointer items-center gap-2 rounded-lg border border-border/50 px-3 py-2" :class="{ 'opacity-60': !draft.channelId || !draft.workspaceId }">
              <Switch
                :checked="draft.active"
                :disabled="!draft.channelId || !draft.workspaceId"
                @update:checked="draft.active = $event"
              />
              <span>{{ t('automation.enableLabel') }}</span>
              <span class="text-[11px] text-muted-foreground">
                {{ !draft.channelId || !draft.workspaceId ? t('automation.enableHint') : t('automation.enableHintActive') }}
              </span>
            </div>
          </div>

          <!-- 运行频率 + 关联调度控件（同一行） -->
          <div class="flex gap-3">
            <div class="flex min-w-0 flex-1 flex-col gap-1.5">
              <Label class="text-xs font-medium text-muted-foreground">{{ t('automation.frequencyLabel') }}</Label>
              <Select v-model="draft.scheduleType">
                <SelectTrigger class="w-full"><SelectValue :placeholder="t('automation.selectFrequency')" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="interval">{{ t('automation.interval') }}</SelectItem>
                  <SelectItem value="daily">{{ t('automation.daily') }}</SelectItem>
                  <SelectItem value="weekly">{{ t('automation.weekly') }}</SelectItem>
                  <SelectItem value="monthly">{{ t('automation.monthly') }}</SelectItem>
                  <SelectItem value="once">{{ t('automation.once') }}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div v-if="draft.scheduleType === 'interval'" class="flex min-w-0 flex-1 flex-col gap-1.5">
              <Label class="text-xs font-medium text-muted-foreground">{{ t('automation.intervalMinutes') }}</Label>
              <Input
                type="number"
                :model-value="draft.intervalMinutes"
                @update:model-value="draft.intervalMinutes = Number($event)"
                min="1"
                max="44640"
                class="h-8 text-[13px]"
              />
            </div>
            <div v-if="draft.scheduleType === 'daily' || draft.scheduleType === 'weekly' || draft.scheduleType === 'monthly'" class="flex min-w-0 flex-1 flex-col gap-1.5">
              <Label class="text-xs font-medium text-muted-foreground">{{ t('automation.triggerTime') }}</Label>
              <TimePicker
                :model-value="draftTimeOfDayInput"
                @update:model-value="draftTimeOfDayInput = $event"
                class="text-[13px]"
              />
            </div>
            <div v-if="draft.scheduleType === 'weekly'" class="flex min-w-0 flex-1 flex-col gap-1.5">
              <Label class="text-xs font-medium text-muted-foreground">{{ t('automation.weekday') }}</Label>
              <Select v-model="draft.dayOfWeek">
                <SelectTrigger class="w-full"><SelectValue :placeholder="t('automation.selectWeekday')" /></SelectTrigger>
                <SelectContent>
                  <SelectItem :value="0">{{ t('automation.sunday') }}</SelectItem>
                  <SelectItem v-for="n in 6" :key="n" :value="n">{{ [t('automation.monday'),t('automation.tuesday'),t('automation.wednesday'),t('automation.thursday'),t('automation.friday'),t('automation.saturday')][n-1] }}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div v-if="draft.scheduleType === 'monthly'" class="flex min-w-0 flex-1 flex-col gap-1.5">
              <Label class="text-xs font-medium text-muted-foreground">{{ t('automation.monthDay') }}</Label>
              <Select v-model="draft.dayOfMonth">
                <SelectTrigger class="w-full"><SelectValue :placeholder="t('automation.selectDay')" /></SelectTrigger>
                <SelectContent>
                  <SelectItem v-for="n in 31" :key="n" :value="n">{{ t('automation.dayN', { n }) }}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div v-if="draft.scheduleType === 'once'" class="flex min-w-0 flex-1 flex-col gap-1.5">
              <Label class="text-xs font-medium text-muted-foreground">{{ t('automation.scheduledAt') }}</Label>
              <DateTimePicker
                :model-value="draftScheduledAtInput"
                @update:model-value="draftScheduledAtInput = $event"
                class="h-8 text-[13px]"
              />
            </div>
          </div>

          <!-- 运行次数上限 + 会话模式（同一行） -->
          <div class="flex gap-3">
            <div class="flex min-w-0 flex-1 flex-col gap-1.5">
              <Label class="text-xs font-medium text-muted-foreground">{{ t('automation.maxRunsLabel') }}</Label>
              <Input
                type="number"
                :model-value="draft.maxRuns"
                @update:model-value="draft.maxRuns = Number($event)"
                min="0"
                :placeholder="t('automation.maxRunsHint')"
                class="h-8 text-[13px]"
              />
              <span class="text-xs text-muted-foreground">{{ t('automation.maxRunsReached') }}</span>
            </div>
            <div class="flex min-w-0 flex-1 flex-col gap-1.5">
              <Label class="text-xs font-medium text-muted-foreground">{{ t('automation.sessionMode') }}</Label>
              <Select v-model="draft.sessionMode">
                <SelectTrigger class="w-full"><SelectValue :placeholder="t('automation.selectSessionMode')" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">{{ t('automation.sessionDaily') }}</SelectItem>
                  <SelectItem value="reuse">{{ t('automation.sessionReuse') }}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <!-- 模型 -->
          <div class="flex flex-col gap-1.5">
            <Label class="text-xs font-medium text-muted-foreground">{{ t('automation.modelLabel') }}</Label>
            <Select v-model="draft.channelId">
              <SelectTrigger class="w-full"><SelectValue :placeholder="t('automation.selectChannel')" /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="c in channels" :key="c.id" :value="c.id">{{ c.name }}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <!-- 项目 -->
          <div class="flex flex-col gap-1.5">
            <Label class="text-xs font-medium text-muted-foreground">{{ t('automation.projectLabel') }}</Label>
            <Select v-model="draft.workspaceId">
              <SelectTrigger class="w-full"><SelectValue :placeholder="t('automation.selectWorkspace')" /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="p in ws.agentProjects" :key="p.id" :value="p.id">{{ p.name }}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <!-- 安全警告 -->
          <div class="rounded-lg border border-amber-500/20 bg-amber-500/[0.08] px-3 py-2.5 text-xs leading-relaxed text-amber-700">
            {{ t('automation.securityWarn') }}
          </div>

          <!-- 运行历史 -->
          <div v-if="draft.id && draft.runHistory?.length" class="flex flex-col gap-1.5">
            <Label class="text-xs font-medium text-muted-foreground">{{ t('automation.runHistory') }}</Label>
            <div
              v-for="(run, i) in draft.runHistory.slice(0, 10)"
              :key="i"
              class="flex cursor-pointer items-center gap-2 rounded-md bg-foreground/[0.02] px-2 py-1.5 text-xs hover:bg-primary/[0.05]"
              @click="openSession(run.sessionId)"
            >
              <span class="font-semibold" :class="{ 'text-green-600': run.status === 'success', 'text-red-500': run.status === 'error', 'text-muted-foreground': run.status === 'skipped' }">{{ run.status }}</span>
              <span class="flex-1 text-muted-foreground">{{ formatTime(run.runAt) }}</span>
              <span v-if="run.durationMs" class="text-muted-foreground">{{ (run.durationMs / 1000).toFixed(1) }}s</span>
              <span v-if="run.error" class="truncate text-red-500">{{ run.error }}</span>
            </div>
          </div>
          </div>

          <!-- 底部操作（固定在右栏底部） -->
          <div class="flex shrink-0 border-t border-border/50 bg-card pt-2">
            <Button class="h-8 flex-1 gap-1.5" @click="runNowDraft" :disabled="!draft.id">
              <Play class="size-3.5" /> {{ t('automation.runOnce') }}
            </Button>
          </div>
        </div>
      </div>
    </div>

    <!-- 删除确认 -->
    <Dialog v-model:open="deleteModalOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ t('automation.deleteTitle') }}</DialogTitle>
        </DialogHeader>
        <p>{{ t('automation.deleteConfirm', { name: pendingDelete?.name }) }}</p>
        <DialogFooter>
          <Button variant="outline" @click="deleteModalOpen = false">{{ t('automation.cancel') }}</Button>
          <Button variant="destructive" @click="confirmDeleteAction">{{ t('automation.delete') }}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useToast } from '@/components/ui/sonner'
import { useI18n } from 'vue-i18n'
import {
  Plus, Clock, Play,
  PauseCircle, PlayCircle, Trash2, ChevronLeft, Check, Pencil,
} from '@lucide/vue'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { DateTimePicker } from '@/components/ui/date-time-picker'
import { TimePicker } from '@/components/ui/time-picker'
import { Switch } from '@/components/ui/switch'
import { usePlanningStore } from '@/stores/planning'
import { useWorkspaceStore } from '@/stores/workspace'
import { useAgentStore } from '@/stores/agent'
import { ipcApiRoute } from '@/api'
import { ipc } from '@/utils/ipcRenderer'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'

const toast = useToast()
const { t } = useI18n()
const planning = usePlanningStore()
const ws = useWorkspaceStore()
const agentStore = useAgentStore()
const router = useRouter()

const automations = computed(() => planning.automations)
const formOpen = computed(() => planning.automationFormOpen)
const draft = computed(() => planning.automationDraft || {})

// 渠道列表（从设置中获取）
const channels = ref([])

async function loadChannels() {
  try {
    const res = await ipc.invoke(ipcApiRoute.llm.modelOperation, { action: 'list' })
    if (res?.code === 0 && res.data) {
      channels.value = res.data
    }
  } catch {
    channels.value = []
  }
}

// ===== 分组 =====
const activeAutomations = computed(() => automations.value.filter(a => a.active && !a.completedAt))
const pausedAutomations = computed(() => automations.value.filter(a => !a.active && !a.completedAt))
const completedAutomations = computed(() => automations.value.filter(a => a.completedAt))

// ===== 表单 =====
const draftTimeOfDay = computed({
  get: () => draft.value?.timeOfDay ? dayjs(draft.value.timeOfDay, 'HH:mm') : null,
  set: (v) => { if (draft.value) draft.value.timeOfDay = v ? v.format('HH:mm') : undefined },
})
const draftScheduledAt = computed({
  get: () => draft.value?.scheduledAt ? dayjs(draft.value.scheduledAt) : null,
  set: (v) => { if (draft.value) draft.value.scheduledAt = v ? v.valueOf() : undefined },
})

// 原生 input 桥接：timeOfDay (HH:mm 字符串)
const draftTimeOfDayInput = computed({
  get: () => draft.value?.timeOfDay || '',
  set: (v) => { if (draft.value) draft.value.timeOfDay = v || undefined },
})

// 原生 input 桥接：scheduledAt (datetime-local 格式字符串 ↔ 时间戳)
const draftScheduledAtInput = computed({
  get: () => draft.value?.scheduledAt ? dayjs(draft.value.scheduledAt).format('YYYY-MM-DDTHH:mm') : '',
  set: (v) => { if (draft.value) draft.value.scheduledAt = v ? dayjs(v).valueOf() : undefined },
})

function createNew() {
  const d = planning.createEmptyDraft()
  let maxN = 0
  for (const a of automations.value) {
    const m = /^定时任务\s*(\d+)$/.exec(a.name.trim())
    if (m) maxN = Math.max(maxN, Number(m[1]))
  }
  d.name = `定时任务 ${maxN + 1}`
  planning.automationDraft = d
  planning.automationFormOpen = true
  titleEditing.value = false
}

function editAutomation(a) {
  planning.automationDraft = planning.automationToDraft(a)
  planning.automationFormOpen = true
  titleEditing.value = false
}

function closeForm() {
  // 如果有待保存的变更，立即保存
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer)
    autoSaveTimer = null
    // doAutoSave 使用 draft.value，需在清空前执行
    // 但 doAutoSave 是 async，先保存引用
    const d = draft.value
    if (d) {
      doAutoSaveWithDraft(d)
    }
  }
  planning.automationFormOpen = false
  planning.automationDraft = null
}

async function doAutoSaveWithDraft(d) {
  if (!d) return
  if (!d.name?.trim() || !d.prompt?.trim() || !d.channelId || !d.workspaceId) return
  try {
    if (d.id) {
      await planning.updateAutomation({ ...d, maxRuns: d.maxRuns || undefined })
    } else {
      const { id, ...createInput } = d
      await planning.createAutomation(createInput)
    }
  } catch (err) {
    console.error('[AutomationsView] 返回前保存失败:', err)
  }
}

// ===== 双击编辑标题 =====
const titleEditing = ref(false)
const titleInputRef = ref(null)

function startEditTitle() {
  titleEditing.value = true
  nextTick(() => {
    titleInputRef.value?.focus()
    titleInputRef.value?.select()
  })
}

// ===== 自动保存（防抖） =====
let autoSaveTimer = null
let isAutoSaving = false

function autoSave() {
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(doAutoSave, 600)
}

async function doAutoSave() {
  const d = draft.value
  if (!d) return
  // 新建模式下必填字段不齐时不保存
  if (!d.name?.trim() || !d.prompt?.trim() || !d.channelId || !d.workspaceId) return
  if (isAutoSaving) return
  isAutoSaving = true
  try {
    if (d.id) {
      await planning.updateAutomation({
        ...d,
        maxRuns: d.maxRuns || undefined,
      })
    } else {
      const { id, ...createInput } = d
      const created = await planning.createAutomation(createInput)
      // 创建成功后回填 id，后续变为更新模式
      if (created?.id) d.id = created.id
    }
  } catch (err) {
    // 静默失败，不打扰用户
    console.error('[AutomationsView] 自动保存失败:', err)
  } finally {
    isAutoSaving = false
  }
}

// 监听 draft 变化，自动保存
watch(
  () => draft.value,
  (newVal) => {
    if (!newVal) return
    autoSave()
  },
  { deep: true }
)

// ===== 操作 =====
const runningIds = ref(new Set())

async function runNow(a) {
  runningIds.value.add(a.id)
  try {
    const sessionId = await planning.runAutomationNow(a.id)
    toast.success(t('automation.started'))
    // 跳转到 Agent 对话页面
    if (sessionId) {
      // 切换到 Agent 模式
      ws.setAppMode('agent')
      ws.setActiveModule('agent')
      // 刷新会话列表，确保新创建的会话在列表中
      await agentStore.loadSessions()
      // 后端以 headless 模式发送消息（onEvent 不转发到前端），前端无法订阅 SSE 流。
      // 设置 pendingPrompt（message 为空，不触发前端重复发送），由 AgentView 选中会话。
      agentStore.pendingPrompt = { sessionId, message: '', workspaceId: a.workspaceId }
      // 直接通过 selectSession 打开 Tab
      agentStore.selectSession(sessionId)
      // 启动消息轮询：定期 reload 持久化的消息，直到检测到 LLM 回复完成
      agentStore.startMessagePolling(sessionId)
    }
  } catch (err) {
    toast.error(err?.message || t('automation.runFailed'))
  } finally {
    runningIds.value.delete(a.id)
  }
}

async function runNowDraft() {
  if (!draft.value?.id) return
  const automationId = draft.value.id
  // 先关闭表单
  closeForm()
  // 临时构造对象调用 runNow
  await runNow({ id: automationId })
}

async function togglePause(a) {
  const newActive = !a.active
  try {
    await planning.toggleAutomation(a.id, newActive)
    toast.success(newActive ? t('automation.enabled') : t('automation.paused'))
  } catch (err) {
    toast.error(err?.message || t('automation.operationFailed'))
  }
}

// ===== 删除 =====
const pendingDelete = ref(null)
const deleteModalOpen = computed({
  get: () => !!pendingDelete.value,
  set: (v) => { if (!v) pendingDelete.value = null },
})

function confirmDelete(a) {
  pendingDelete.value = a
}

async function confirmDeleteAction() {
  if (!pendingDelete.value) return
  try {
    await planning.deleteAutomation(pendingDelete.value.id)
    toast.success(t('automation.deleted'))
    pendingDelete.value = null
  } catch {
    toast.error(t('automation.deleteFailed'))
  }
}

// ===== 辅助 =====
function scheduleLabel(a) {
  if (a.scheduleType === 'once') {
    const when = a.scheduledAt ? dayjs(a.scheduledAt).format('MM-DD HH:mm') : '指定时间'
    return `仅一次（${when}）`
  }
  if (a.scheduleType === 'daily') return `每天 ${a.timeOfDay ?? '09:00'}`
  if (a.scheduleType === 'weekly') {
    const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    return `每${names[a.dayOfWeek ?? 1]} ${a.timeOfDay ?? '09:00'}`
  }
  if (a.scheduleType === 'monthly') return `每月 ${a.dayOfMonth ?? 1} 号 ${a.timeOfDay ?? '09:00'}`
  const min = a.intervalMinutes
  if (min < 60) return `每 ${min} 分钟`
  if (min < 1440) return `每 ${min / 60} 小时`
  return `每 ${min / 1440} 天`
}

function formatTime(ts) {
  if (!ts) return ''
  return dayjs(ts).format('MM-DD HH:mm')
}

function openSession(sessionId) {
  if (!sessionId) return
  // 可在此跳转到 Agent 会话
  console.log('[定时任务] 打开会话:', sessionId)
}

onMounted(() => {
  loadChannels()
})
</script>

