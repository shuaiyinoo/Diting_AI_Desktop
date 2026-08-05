<template>
  <div class="automations-view">
    <!-- 列表模式 -->
    <div v-if="!formOpen" class="auto-list">
      <!-- 空状态 -->
      <div v-if="automations.length === 0" class="auto-empty">
        <div class="auto-empty__icon"><ClockCircleOutlined /></div>
        <h3>定时任务</h3>
        <p>用自然语言描述一个任务，调度器按设定间隔在后台自动新建子会话执行。</p>
        <button class="planning-btn planning-btn--primary" @click="createNew">
          <PlusOutlined /> 新建定时任务
        </button>
      </div>

      <!-- 分组列表 -->
      <template v-else>
        <!-- 启用中 -->
        <div v-if="activeAutomations.length" class="auto-group">
          <div class="auto-group__header">启用中</div>
          <div
            v-for="a in activeAutomations"
            :key="a.id"
            class="auto-card"
            @click="editAutomation(a)"
          >
            <div class="auto-card__main">
              <div class="auto-card__name">{{ a.name }}</div>
              <div class="auto-card__prompt">{{ a.prompt }}</div>
              <div class="auto-card__meta">
                <span class="auto-badge auto-badge--schedule">{{ scheduleLabel(a) }}</span>
                <span v-if="a.nextRunAt" class="auto-badge">下次: {{ formatTime(a.nextRunAt) }}</span>
                <span v-if="a.lastRunAt" class="auto-badge">上次: {{ formatTime(a.lastRunAt) }}</span>
                <span v-if="a.runCount" class="auto-badge">已执行 {{ a.runCount }} 次</span>
                <span v-if="a.maxRuns" class="auto-badge">上限 {{ a.maxRuns }}</span>
              </div>
            </div>
            <div class="auto-card__actions">
              <button class="auto-action-btn" @click.stop="runNow(a)" :disabled="runningIds.has(a.id)">
                <CaretRightOutlined /> {{ runningIds.has(a.id) ? '运行中…' : '立即运行' }}
              </button>
              <button class="auto-action-btn" @click.stop="togglePause(a)">
                <PauseCircleOutlined v-if="a.active" /> <PlayCircleOutlined v-else />
              </button>
              <button class="auto-action-btn auto-action-btn--danger" @click.stop="confirmDelete(a)">
                <DeleteOutlined />
              </button>
            </div>
          </div>
        </div>

        <!-- 已暂停 -->
        <div v-if="pausedAutomations.length" class="auto-group">
          <div class="auto-group__header">已暂停</div>
          <div
            v-for="a in pausedAutomations"
            :key="a.id"
            class="auto-card auto-card--paused"
            @click="editAutomation(a)"
          >
            <div class="auto-card__main">
              <div class="auto-card__name">{{ a.name }}</div>
              <div class="auto-card__prompt">{{ a.prompt }}</div>
              <div class="auto-card__meta">
                <span class="auto-badge auto-badge--schedule">{{ scheduleLabel(a) }}</span>
                <span v-if="a.consecutiveFailures" class="auto-badge auto-badge--warn">连续失败 {{ a.consecutiveFailures }}</span>
              </div>
            </div>
            <div class="auto-card__actions">
              <button class="auto-action-btn" @click.stop="togglePause(a)">
                <PlayCircleOutlined /> 启用
              </button>
              <button class="auto-action-btn auto-action-btn--danger" @click.stop="confirmDelete(a)">
                <DeleteOutlined />
              </button>
            </div>
          </div>
        </div>

        <!-- 已完成 -->
        <div v-if="completedAutomations.length" class="auto-group">
          <div class="auto-group__header">已完成</div>
          <div
            v-for="a in completedAutomations"
            :key="a.id"
            class="auto-card auto-card--completed"
            @click="editAutomation(a)"
          >
            <div class="auto-card__main">
              <div class="auto-card__name">{{ a.name }}</div>
              <div class="auto-card__prompt">{{ a.prompt }}</div>
              <div class="auto-card__meta">
                <span class="auto-badge auto-badge--done"><CheckOutlined /> 已完成</span>
                <span v-if="a.runCount" class="auto-badge">执行 {{ a.runCount }} 次</span>
              </div>
            </div>
            <div class="auto-card__actions">
              <button class="auto-action-btn" @click.stop="togglePause(a)">
                <PlayCircleOutlined /> 重新启用
              </button>
              <button class="auto-action-btn auto-action-btn--danger" @click.stop="confirmDelete(a)">
                <DeleteOutlined />
              </button>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- 表单模式 -->
    <div v-else class="auto-form">
      <div class="auto-form__body">
        <!-- 左栏：返回 + 标题 + 任务描述 -->
        <div class="auto-form__left">
          <!-- 顶部：返回 + 标题 -->
          <div class="auto-form__header">
            <button class="planning-btn planning-btn--ghost" @click="closeForm">
              <LeftOutlined /> 返回
            </button>
            <!-- 双击编辑任务名 -->
            <input
              v-if="titleEditing"
              ref="titleInputRef"
              v-model="draft.name"
              class="auto-form__title-input"
              placeholder="任务名称"
              @blur="titleEditing = false"
              @keydown.enter="titleEditing = false"
              @keydown.esc="titleEditing = false"
            />
            <h3 v-else class="auto-form__title" @dblclick="startEditTitle">
              <span class="auto-form__title-text">{{ draft.name || '未命名任务' }}</span>
              <EditOutlined class="auto-form__title-edit-icon" />
            </h3>
          </div>
          <!-- 提示卡片 -->
          <div class="auto-form__tips">
            <p class="auto-form__tips-title">推荐：让 Diting Agent 创建</p>
            <p class="auto-form__tips-desc">在左侧会话里说清目标，并明确表示要求创建定时任务，Diting Agent 会生成任务描述，并补全周期、项目和模型等配置，手动编辑更适合微调任务描述。</p>
            <p class="auto-form__tips-title">手动编写时，只写任务本身</p>
            <p class="auto-form__tips-desc">例：检查 Diting 仓库新增 issue，主动回复问答类问题，不清楚的部分整理到项目级 Context 的 .context/issue-faq.md 文档；真正的 Bug 或请求罗列后发给我，不要记录任何重复的信息。</p>
          </div>

          <label class="auto-form__label">自然语言任务描述</label>
          <textarea
            v-model="draft.prompt"
            class="auto-form__prompt"
            placeholder="用自然语言描述你想让 Agent 做什么。例如：
• 每天早上检查项目 CI 状态，如有失败则汇总失败原因
• 每小时获取最新新闻摘要
• 检查数据库中未处理的订单，自动生成处理方案"
          ></textarea>
          <div class="auto-form__hint">
            💡 推荐让 Agent 在对话中创建 — 只需在聊天中描述你想要的自动化任务。
          </div>
        </div>

        <!-- 右栏：配置 -->
        <div class="auto-form__right">
          <div class="auto-form__right-content">
          <!-- 启用状态 -->
          <div class="auto-form__field">
            <label class="auto-form__label">状态</label>
            <label class="auto-form__status-toggle" :class="{ 'auto-form__status-toggle--disabled': !draft.channelId || !draft.workspaceId }">
              <a-checkbox
                v-model:checked="draft.active"
                :disabled="!draft.channelId || !draft.workspaceId"
              >启用</a-checkbox>
              <span class="auto-form__status-hint">
                {{ !draft.channelId || !draft.workspaceId ? '需要配置模型与项目才能启用' : '启用后将按设定频率自动执行' }}
              </span>
            </label>
          </div>

          <!-- 运行频率 + 关联调度控件（同一行） -->
          <div class="auto-form__field-row">
            <div class="auto-form__field">
              <label class="auto-form__label">运行频率</label>
              <a-select v-model:value="draft.scheduleType" class="auto-form__select">
                <a-select-option value="interval">每 N 分钟</a-select-option>
                <a-select-option value="daily">每天定点</a-select-option>
                <a-select-option value="weekly">每周定点</a-select-option>
                <a-select-option value="monthly">每月定点</a-select-option>
                <a-select-option value="once">仅一次</a-select-option>
              </a-select>
            </div>
            <div v-if="draft.scheduleType === 'interval'" class="auto-form__field">
              <label class="auto-form__label">间隔（分钟）</label>
              <a-input-number v-model:value="draft.intervalMinutes" :min="1" :max="44640" style="width:100%" />
            </div>
            <div v-if="draft.scheduleType === 'daily' || draft.scheduleType === 'weekly' || draft.scheduleType === 'monthly'" class="auto-form__field">
              <label class="auto-form__label">触发时刻</label>
              <a-time-picker v-model:value="draftTimeOfDay" format="HH:mm" style="width:100%" />
            </div>
            <div v-if="draft.scheduleType === 'weekly'" class="auto-form__field">
              <label class="auto-form__label">星期</label>
              <a-select v-model:value="draft.dayOfWeek" class="auto-form__select">
                <a-select-option :value="0">周日</a-select-option>
                <a-select-option v-for="n in 6" :key="n" :value="n">{{ ['周一','周二','周三','周四','周五','周六'][n-1] }}</a-select-option>
              </a-select>
            </div>
            <div v-if="draft.scheduleType === 'monthly'" class="auto-form__field">
              <label class="auto-form__label">日期</label>
              <a-select v-model:value="draft.dayOfMonth" class="auto-form__select">
                <a-select-option v-for="n in 31" :key="n" :value="n">{{ n }} 号</a-select-option>
              </a-select>
            </div>
            <div v-if="draft.scheduleType === 'once'" class="auto-form__field">
              <label class="auto-form__label">触发时间</label>
              <a-date-picker v-model:value="draftScheduledAt" show-time format="YYYY-MM-DD HH:mm" style="width:100%" />
            </div>
          </div>

          <!-- 运行次数上限 + 会话模式（同一行） -->
          <div class="auto-form__field-row">
            <div class="auto-form__field">
              <label class="auto-form__label">运行次数上限</label>
              <a-input-number v-model:value="draft.maxRuns" :min="0" placeholder="0=不限" style="width:100%" />
              <span class="auto-form__hint">达到上限后自动停用</span>
            </div>
            <div class="auto-form__field">
              <label class="auto-form__label">会话模式</label>
              <a-select v-model:value="draft.sessionMode" class="auto-form__select">
                <a-select-option value="daily">每日复用（默认）</a-select-option>
                <a-select-option value="reuse">始终复用</a-select-option>
              </a-select>
            </div>
          </div>

          <!-- 模型 -->
          <div class="auto-form__field">
            <label class="auto-form__label">模型</label>
            <a-select v-model:value="draft.channelId" class="auto-form__select" placeholder="选择渠道">
              <a-select-option v-for="c in channels" :key="c.id" :value="c.id">{{ c.name }}</a-select-option>
            </a-select>
          </div>

          <!-- 项目 -->
          <div class="auto-form__field">
            <label class="auto-form__label">项目</label>
            <a-select v-model:value="draft.workspaceId" class="auto-form__select" placeholder="选择工作区">
              <a-select-option v-for="p in ws.agentProjects" :key="p.id" :value="p.id">{{ p.name }}</a-select-option>
            </a-select>
          </div>

          <!-- 安全警告 -->
          <div class="auto-form__warning">
            ⚠️ 此任务将以完全权限无人值守运行，确保任务描述清晰且无高风险操作。
          </div>

          <!-- 运行历史 -->
          <div v-if="draft.id && draft.runHistory?.length" class="auto-form__history">
            <label class="auto-form__label">运行历史（最近 10 条）</label>
            <div
              v-for="(run, i) in draft.runHistory.slice(0, 10)"
              :key="i"
              class="auto-run-item"
              @click="openSession(run.sessionId)"
            >
              <span class="auto-run-item__status" :class="`auto-run-item__status--${run.status}`">{{ run.status }}</span>
              <span class="auto-run-item__time">{{ formatTime(run.runAt) }}</span>
              <span v-if="run.durationMs" class="auto-run-item__duration">{{ (run.durationMs / 1000).toFixed(1) }}s</span>
              <span v-if="run.error" class="auto-run-item__error">{{ run.error }}</span>
            </div>
          </div>
          </div>

          <!-- 底部操作（固定在右栏底部） -->
          <div class="auto-form__footer">
            <button class="planning-btn planning-btn--primary auto-form__run-btn" @click="runNowDraft" :disabled="!draft.id">
              <CaretRightOutlined /> 运行一次
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 删除确认 -->
    <a-modal
      v-model:open="deleteModalOpen"
      title="确认删除定时任务"
      ok-text="删除"
      cancel-text="取消"
      ok-type="danger"
      @ok="confirmDeleteAction"
    >
      <p>删除「{{ pendingDelete?.name }}」后无法恢复。</p>
    </a-modal>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { message } from 'ant-design-vue'
import {
  PlusOutlined, ClockCircleOutlined, CaretRightOutlined,
  PauseCircleOutlined, PlayCircleOutlined, DeleteOutlined, LeftOutlined, CheckOutlined, EditOutlined,
} from '@ant-design/icons-vue'
import { usePlanningStore } from '@/stores/planning'
import { useWorkspaceStore } from '@/stores/workspace'
import { useAgentStore } from '@/stores/agent'
import { ipcApiRoute } from '@/api'
import { ipc } from '@/utils/ipcRenderer'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'

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
    message.success('任务已启动')
    // 跳转到 Agent 对话页面（参考 Todo 的跳转方式）
    if (sessionId) {
      // 切换到 Agent 模式
      ws.setAppMode('agent')
      ws.setActiveModule('agent')
      // 刷新会话列表，确保新创建的会话在列表中
      await agentStore.loadSessions()
      // 设置 pendingPrompt 让 Agent 页面自动选中会话（message 为空，不会重复发送）
      agentStore.pendingPrompt = { sessionId, message: '', workspaceId: a.workspaceId }
      await router.push('/agent')
    }
  } catch (err) {
    message.error(err?.message || '运行失败')
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
    message.success(newActive ? '已启用' : '已暂停')
  } catch (err) {
    message.error(err?.message || '操作失败')
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
    message.success('已删除')
    pendingDelete.value = null
  } catch {
    message.error('删除失败')
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

<style lang="less" scoped>
.automations-view {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  box-sizing: border-box;
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  overflow-y: auto;
  padding: 20px 24px;
}

// ===== 空状态 =====
.auto-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-height: 300px;
  text-align: center;
  gap: 12px;

  &__icon {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: rgba(22, 119, 255, 0.06);
    color: var(--accent);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 28px;
    margin-bottom: 8px;
  }

  h3 {
    margin: 0;
    font-size: 16px;
    color: var(--text-primary);
  }

  p {
    font-size: 13px;
    color: var(--text-muted);
    max-width: 400px;
    line-height: 1.6;
  }
}

// ===== 分组 =====
.auto-group {
  margin-bottom: 20px;

  &__header {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 8px;
  }
}

// ===== 卡片 =====
.auto-card {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 16px 20px;
  background: var(--bg-panel);
  border: 1px solid var(--border-color-light);
  border-radius: 10px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: var(--accent);
    box-shadow: 0 2px 8px rgba(22, 119, 255, 0.08);
  }

  &--paused {
    opacity: 0.7;
    background: rgba(0, 0, 0, 0.02);
  }

  &--completed {
    opacity: 0.6;
    background: rgba(0, 0, 0, 0.01);
  }

  &__main {
    flex: 1;
    min-width: 0;
  }

  &__name {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 4px;
  }

  &__prompt {
    font-size: 13px;
    color: var(--text-secondary);
    margin-bottom: 8px;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  &__meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  &__actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }
}

.auto-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  height: 20px;
  padding: 0 8px;
  border-radius: 5px;
  font-size: 11px;
  background: rgba(0, 0, 0, 0.04);
  color: var(--text-muted);

  &--schedule {
    background: rgba(22, 119, 255, 0.08);
    color: var(--accent);
    font-weight: 500;
  }

  &--warn {
    background: rgba(250, 173, 20, 0.1);
    color: #fa8c16;
  }

  &--done {
    background: rgba(82, 196, 26, 0.1);
    color: #52c41a;
  }
}

.auto-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--border-color);
  border-radius: 7px;
  background: var(--bg-panel);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 12px;
  transition: all 0.15s ease;

  &:hover {
    color: var(--accent);
    border-color: var(--accent);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &--danger:hover {
    color: #ff4d4f;
    border-color: #ff4d4f;
    background: rgba(255, 77, 79, 0.05);
  }
}

// ===== 表单 =====
.auto-form {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;

  &__header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-bottom: 8px;
    flex-shrink: 0;

    .planning-btn {
      flex-shrink: 0;
      white-space: nowrap;
    }
  }

  &__title {
    margin: 0;
    font-size: 16px;
    color: var(--text-primary);
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    user-select: none;
    flex: 1;
    min-width: 0;
  }

  &__title-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__title-edit-icon {
    flex-shrink: 0;
    font-size: 13px;
    color: var(--text-muted);
  }

  &__title-input {
    flex: 1;
    min-width: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
    border: 1px solid var(--accent);
    border-radius: 6px;
    padding: 4px 8px;
    outline: none;
    background: var(--bg-panel);
  }

  &__body {
    flex: 1;
    display: flex;
    gap: 24px;
    min-height: 0;
  }

  &__left {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }

  &__right {
    width: 340px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  &__right-content {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  &__label {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-muted);
  }

  &__name-input {
    width: 100%;
  }

  &__prompt {
    flex: 1;
    min-height: 200px;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 12px;
    font-size: 13px;
    line-height: 1.6;
    resize: vertical;
    outline: none;
    color: var(--text-primary);

    &:focus {
      border-color: var(--accent);
      box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.1);
    }
  }

  &__hint {
    font-size: 12px;
    color: var(--text-muted);
    margin-top: 4px;
  }

  &__tips {
    padding: 12px 14px;
    background: rgba(0, 0, 0, 0.04);
    border: 1px solid var(--border-color-light);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 8px;
  }

  &__tips-title {
    margin: 0;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-secondary);
  }

  &__tips-desc {
    margin: 0;
    font-size: 12px;
    color: var(--text-muted);
    line-height: 1.6;
  }

  &__field-row {
    display: flex;
    gap: 12px;
    .auto-form__field { flex: 1; min-width: 0; }
  }

  &__field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  &__status-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border: 1px solid var(--border-color-light);
    border-radius: 8px;
    cursor: pointer;

    &--disabled {
      opacity: 0.6;
    }
  }

  &__status-hint {
    font-size: 11px;
    color: var(--text-muted);
  }

  &__select {
    width: 100%;
  }

  &__status {
    padding: 8px 12px;
    background: rgba(0, 0, 0, 0.03);
    border-radius: 8px;
    font-size: 12px;
    color: var(--text-muted);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  &__warning {
    padding: 10px 12px;
    background: rgba(250, 173, 20, 0.08);
    border: 1px solid rgba(250, 173, 20, 0.2);
    border-radius: 8px;
    font-size: 12px;
    color: #ad6800;
    line-height: 1.5;
  }

  &__history {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  &__footer {
    flex-shrink: 0;
    display: flex;
    padding-top: 8px;
    border-top: 1px solid var(--border-color-light);
    background: var(--bg-panel);
  }

  &__run-btn {
    flex: 1;
    justify-content: center;
  }
}

.auto-run-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.02);
  font-size: 12px;
  cursor: pointer;

  &:hover { background: rgba(22, 119, 255, 0.05); }

  &__status {
    font-weight: 600;
    &--success { color: #52c41a; }
    &--error { color: #ff4d4f; }
    &--skipped { color: var(--text-muted); }
  }

  &__time {
    color: var(--text-secondary);
    flex: 1;
  }

  &__duration {
    color: var(--text-muted);
  }

  &__error {
    color: #ff4d4f;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

// ===== 公共按钮 =====
.planning-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 14px;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s ease;

  &--primary {
    background: var(--accent);
    color: #fff;
    font-weight: 500;
    box-shadow: 0 2px 6px rgba(22, 119, 255, 0.25);
    &:hover { background: var(--accent-hover); }
    &:disabled { opacity: 0.5; cursor: not-allowed; }
  }

  &--ghost {
    background: var(--bg-panel);
    color: var(--text-secondary);
    border: 1px solid var(--border-color);
    &:hover { color: var(--accent); border-color: var(--accent); }
  }
}
</style>
