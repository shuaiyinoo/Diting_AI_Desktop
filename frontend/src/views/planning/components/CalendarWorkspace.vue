<template>
  <div class="calendar-workspace">
    <!-- 工具栏 -->
    <div class="calendar-toolbar">
      <div class="calendar-toolbar__left">
        <div class="calendar-toolbar__nav">
          <button class="calendar-nav-btn" @click="prev"><LeftOutlined /></button>
          <span class="calendar-toolbar__title">{{ toolbarTitle }}</span>
          <button class="calendar-nav-btn" @click="next"><RightOutlined /></button>
        </div>
        <button
          v-for="m in modes"
          :key="m.id"
          class="calendar-mode-btn"
          :class="{ 'calendar-mode-btn--active': mode === m.id }"
          @click="mode = m.id"
        >{{ m.label }}</button>
      </div>
      <div class="calendar-toolbar__right">
        <button class="calendar-mode-btn" @click="groupManagerOpen = true">
          <UnorderedListOutlined /> 分组
        </button>
      </div>
    </div>

    <!-- 月视图 -->
    <div v-if="mode === 'month'" class="calendar-month">
      <div class="calendar-weekdays">
        <div v-for="d in weekdays" :key="d" class="calendar-weekday">{{ d }}</div>
      </div>
      <div class="calendar-days">
        <div
          v-for="day in monthDays"
          :key="day.key"
          class="calendar-day"
          :class="{ 'calendar-day--other': !day.inMonth, 'calendar-day--today': day.isToday }"
          @click="onDayClick(day)"
        >
          <span class="calendar-day__num">{{ day.date }}</span>
          <div class="calendar-day__events">
            <div
              v-for="ev in day.events.slice(0, 2)"
              :key="ev.id"
              class="calendar-event"
              :style="{ borderColor: eventColor(ev), background: eventBg(ev) }"
              @click.stop="selectEvent(ev)"
              @mouseenter="showEventTooltip(ev, $event)"
              @mouseleave="hideEventTooltip"
            >{{ ev.title }}</div>
            <div v-if="day.events.length > 2" class="calendar-day__more" @click.stop="showAllDayEvents(day)">
              +{{ day.events.length - 2 }} 更多
            </div>
            <div v-if="day.automationCount" class="calendar-day__auto">定时任务 {{ day.automationCount }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 周视图 -->
    <div v-else class="calendar-week">
      <div class="calendar-week__header">
        <div class="calendar-week__time-gutter"></div>
        <div v-for="d in weekDays" :key="d.key" class="calendar-week__header-day">
          <span class="calendar-week__weekday">{{ d.weekday }}</span>
          <span class="calendar-week__date" :class="{ 'calendar-week__date--today': d.isToday }">{{ d.date }}</span>
        </div>
      </div>
      <div class="calendar-week__body">
        <div class="calendar-week__time-gutter">
          <div v-for="hour in 24" :key="hour - 1" class="calendar-week__time-cell">
            {{ String(hour - 1).padStart(2, '0') }}:00
          </div>
        </div>
        <div
          v-for="(day, dayIdx) in weekDays"
          :key="day.key"
          class="calendar-week__day-col"
          @pointerdown="onPointerDown($event, dayIdx)"
          @pointermove="onPointerMove($event, dayIdx)"
          @pointerup="onPointerUp($event, dayIdx)"
          @pointercancel="onPointerCancel($event, dayIdx)"
        >
          <div v-for="hour in 24" :key="hour - 1" class="calendar-week__hour-cell"></div>
          <div
            v-if="dragDayIdx === dayIdx && dragStartMin !== null && dragEndMin !== null"
            class="calendar-week__drag-preview"
            :style="dragPreviewStyle"
          >
            <span v-if="dragEndMin - dragStartMin >= 30" class="calendar-week__drag-label">
              新建日程 · {{ formatMinToTime(dragStartMin) }}–{{ formatMinToTime(dragEndMin) }}
            </span>
          </div>
          <div
            v-for="layout in dayEventLayouts[dayIdx]"
            :key="layout.event.id"
            class="calendar-week__event"
            data-calendar-item
            :style="{
              top: layout.top + 'px',
              height: layout.height + 'px',
              width: 'calc(' + layout.widthPercent + '% - 4px)',
              left: 'calc(' + layout.leftPercent + '% + 2px)',
              borderColor: eventColor(layout.event),
              background: eventBg(layout.event),
            }"
            @click.stop="selectEvent(layout.event)"
            @mouseenter="showEventTooltip(layout.event, $event)"
            @mouseleave="hideEventTooltip"
          >
            <span class="calendar-week__event-title">{{ layout.event.title }}</span>
            <span v-if="layout.height >= 28" class="calendar-week__event-time">{{ formatEventTime(layout.event) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 日程 hover 详情浮窗 -->
    <div
      v-if="hoveredEvent"
      class="calendar-event-tooltip"
      :style="tooltipStyle"
    >
      <div class="calendar-event-tooltip__header">
        <span class="calendar-event-tooltip__dot" :style="{ background: eventColor(hoveredEvent) }"></span>
        <span class="calendar-event-tooltip__title">{{ hoveredEvent.title }}</span>
      </div>
      <div class="calendar-event-tooltip__time">
        <span v-if="hoveredEvent.allDay">全天</span>
        <span v-else>{{ formatEventTime(hoveredEvent) }}</span>
        <span class="calendar-event-tooltip__date">{{ formatEventDate(hoveredEvent) }}</span>
      </div>
      <div v-if="hoveredEvent.group" class="calendar-event-tooltip__group">
        <span class="calendar-group-dot" :style="{ background: groupColor(hoveredEvent.group) }"></span>
        {{ hoveredEvent.group.name }}
      </div>
      <div v-if="hoveredEvent.tags?.length" class="calendar-event-tooltip__tags">
        <span v-for="tag in hoveredEvent.tags" :key="tag.id" class="calendar-event-tooltip__tag">
          <span class="calendar-tag-chip__dot" :style="{ background: tagColor(tag) }"></span>
          {{ tag.name }}
        </span>
      </div>
      <div v-if="hoveredEvent.notes" class="calendar-event-tooltip__notes">{{ hoveredEvent.notes }}</div>
    </div>

    <!-- 右侧详情 Inspector -->
    <div v-if="selectedEvent" class="calendar-inspector-overlay" @click="selectedEventId = null"></div>
    <aside v-if="selectedEvent" class="calendar-inspector">
      <button class="calendar-inspector__close" @click="selectedEventId = null">
        <CloseOutlined />
      </button>
      <div class="calendar-inspector__header">
        <input
          class="calendar-inspector__title"
          v-model="detailTitle"
          placeholder="日程标题"
          @blur="saveField('title')"
          @keydown.enter="$event.target.blur()"
        />
      </div>
      <div class="calendar-inspector__body">
        <div class="calendar-inspector__section">
          <h3 class="calendar-inspector__section-title">时间</h3>
          <label class="calendar-inspector__all-day">
            <a-checkbox v-model:checked="detailAllDay" @change="saveAllDay">全天</a-checkbox>
            <span class="calendar-inspector__all-day-hint">不占用具体小时段</span>
          </label>
          <div class="calendar-inspector__field-row">
            <div class="calendar-inspector__field">
              <label class="calendar-inspector__field-label">开始</label>
              <a-date-picker
                v-model:value="detailStartAt"
                placeholder="开始时间"
                :show-time="!detailAllDay"
                class="calendar-inspector__date"
                @change="saveField('startAt')"
              />
            </div>
            <div class="calendar-inspector__field">
              <label class="calendar-inspector__field-label">结束</label>
              <a-date-picker
                v-model:value="detailEndAt"
                placeholder="结束时间"
                :show-time="!detailAllDay"
                class="calendar-inspector__date"
                @change="saveField('endAt')"
              />
            </div>
          </div>
        </div>
        <div class="calendar-inspector__section">
          <label class="calendar-inspector__label">更多信息</label>
          <textarea
            class="calendar-inspector__notes"
            v-model="detailNotes"
            placeholder="补充地点、议程、会议链接或其他上下文…"
            @blur="saveField('notes')"
          ></textarea>
        </div>
        <div class="calendar-inspector__section">
          <h3 class="calendar-inspector__section-title">组织</h3>
          <div class="calendar-inspector__field">
            <label class="calendar-inspector__field-label">日程分组</label>
            <a-select v-model:value="detailGroupId" class="calendar-inspector__select" @change="saveField('groupId')">
              <a-select-option value="__none__">不分组</a-select-option>
              <a-select-option v-for="g in calendarGroups" :key="g.id" :value="g.id">
                <span class="calendar-group-option">
                  <span class="calendar-group-dot" :style="{ background: groupColor(g) }"></span>
                  {{ g.name }}
                </span>
              </a-select-option>
            </a-select>
          </div>
          <div class="calendar-inspector__field" ref="tagFieldRef">
            <label class="calendar-inspector__field-label">标签</label>
            <div class="calendar-tag-chips">
              <span
                v-for="tag in selectedEvent.tags"
                :key="tag.id"
                class="calendar-tag-chip"
              >
                <span class="calendar-tag-chip__dot" :style="{ background: tagColor(tag) }"></span>
                {{ tag.name }}
                <button class="calendar-tag-chip__close" @click.stop="removeTagFromEvent(tag)">
                  <CloseOutlined />
                </button>
              </span>
              <div class="calendar-tag-add" ref="tagAddRef">
                <button class="calendar-tag-add__btn" @click.stop="toggleTagDropdown">
                  <PlusOutlined />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="calendar-inspector__footer">
        <button class="calendar-inspector__delete-btn" @click="pendingDelete = selectedEvent">
          <DeleteOutlined /> 删除日程
        </button>
        <span class="calendar-inspector__save-hint">编辑后自动保存</span>
      </div>
    </aside>

    <!-- 标签下拉面板（Teleport 到 body 避免被 inspector overflow 裁切） -->
    <Teleport to="body">
      <div v-if="tagDropdownOpen" class="calendar-tag-dropdown" :style="tagDropdownStyle" @click.stop>
        <div class="calendar-tag-dropdown__search">
          <input
            ref="tagSearchInput"
            v-model="tagSearchText"
            class="calendar-tag-dropdown__input"
            placeholder="搜索或输入新标签…"
            @keydown.enter="onTagSearchEnter"
          />
        </div>
        <div class="calendar-tag-dropdown__list">
          <button
            v-for="tag in filteredTags"
            :key="tag.id"
            class="calendar-tag-dropdown__item"
            :class="{ 'calendar-tag-dropdown__item--selected': isTagSelected(tag) }"
            @click="toggleTagFromDropdown(tag)"
          >
            <span class="calendar-tag-chip__dot" :style="{ background: tagColor(tag) }"></span>
            <span class="calendar-tag-dropdown__item-name">{{ tag.name }}</span>
            <CheckOutlined v-if="isTagSelected(tag)" class="calendar-tag-dropdown__item-check" />
          </button>
          <button
            v-if="canCreateTag"
            class="calendar-tag-dropdown__item calendar-tag-dropdown__item--create"
            @click="createAndAddTag"
          >
            <PlusOutlined />
            <span>创建「{{ tagSearchText.trim() }}」</span>
          </button>
          <div v-if="!filteredTags.length && !canCreateTag" class="calendar-tag-dropdown__empty">
            暂无标签，输入名称可创建
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 删除确认 -->
    <a-modal
      v-model:open="deleteModalOpen"
      title="确认删除日程"
      ok-text="删除"
      cancel-text="取消"
      ok-type="danger"
      @ok="confirmDelete"
    >
      <p>删除「{{ pendingDelete?.title }}」后无法恢复。</p>
    </a-modal>

    <!-- 分组管理 Modal -->
    <a-modal
      v-model:open="groupManagerOpen"
      title="日程分组管理"
      :footer="null"
      width="440px"
      class="group-manager-modal"
    >
      <div class="group-manager__create">
        <div v-if="creatingGroup" class="group-manager__create-row">
          <a-input
            ref="newGroupInputRef"
            v-model:value="newGroupName"
            placeholder="输入分组名称"
            size="small"
            class="group-manager__create-input"
            @keydown.enter="confirmCreateGroup"
            @keydown.escape="cancelCreateGroup"
          />
          <button class="group-manager__action-btn group-manager__action-btn--confirm" @click="confirmCreateGroup" :disabled="!newGroupName.trim() || savingGroupAction === 'create'" title="确认">
            <CheckOutlined />
          </button>
          <button class="group-manager__action-btn group-manager__action-btn--cancel" @click="cancelCreateGroup" title="取消">
            <CloseOutlined />
          </button>
        </div>
        <button v-else class="group-manager__add-btn" @click="startCreateGroup">
          <PlusOutlined /> 新建分组
        </button>
      </div>
      <div class="group-manager__list">
        <div v-if="!calendarGroups.length" class="group-manager__empty">
          还没有分组，点击上方新建
        </div>
        <div v-for="g in calendarGroups" :key="g.id" class="group-manager__item">
          <template v-if="renamingGroupId === g.id">
            <span class="calendar-group-dot" :style="{ background: groupColor(g) }"></span>
            <a-input
              ref="renameInputRef"
              v-model:value="renameGroupName"
              size="small"
              class="group-manager__rename-input"
              @keydown.enter="confirmRenameGroup(g)"
              @keydown.escape="cancelRenameGroup"
            />
            <button class="group-manager__action-btn group-manager__action-btn--confirm" @click="confirmRenameGroup(g)" :disabled="!renameGroupName.trim() || savingGroupAction === 'rename'" title="确认">
              <CheckOutlined />
            </button>
            <button class="group-manager__action-btn group-manager__action-btn--cancel" @click="cancelRenameGroup" title="取消">
              <CloseOutlined />
            </button>
          </template>
          <template v-else>
            <div class="group-color-picker">
              <span
                class="calendar-group-dot group-color-picker__current"
                :style="{ background: groupColor(g) }"
                @click="toggleColorPicker(g.id)"
              ></span>
              <div v-if="colorPickerId === g.id" class="group-color-picker__panel">
                <button
                  v-for="c in PRESET_COLORS"
                  :key="c"
                  class="group-color-picker__swatch"
                  :class="{ 'group-color-picker__swatch--active': (g.color || '') === c }"
                  :style="{ background: c }"
                  @click="setGroupColor(g, c)"
                ></button>
                <label class="group-color-picker__custom">
                  <input type="color" :value="g.color || '#1677ff'" @input="setGroupColor(g, $event.target.value)" />
                </label>
              </div>
            </div>
            <span class="group-manager__item-name">{{ g.name }}</span>
            <button class="group-manager__icon-btn" title="重命名" @click="startRenameGroup(g)">
              <EditOutlined />
            </button>
            <button class="group-manager__icon-btn group-manager__icon-btn--danger" title="删除" @click="requestDeleteGroup(g)">
              <DeleteOutlined />
            </button>
          </template>
        </div>
      </div>
    </a-modal>

    <!-- 分组删除确认 -->
    <a-modal
      v-model:open="deleteGroupModalOpen"
      title="确认删除分组"
      ok-text="删除"
      cancel-text="取消"
      ok-type="danger"
      :ok-button-props="{ loading: savingGroupAction === 'delete' }"
      @ok="confirmDeleteGroup"
    >
      <p>删除「{{ pendingDeleteGroup?.name }}」后无法恢复。</p>
    </a-modal>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { message } from 'ant-design-vue'
import {
  LeftOutlined, RightOutlined, UnorderedListOutlined,
  PlusOutlined, CheckOutlined, CloseOutlined, EditOutlined, DeleteOutlined,
} from '@ant-design/icons-vue'
import { usePlanningStore } from '@/stores/planning'
import dayjs from 'dayjs'

const planning = usePlanningStore()

const calendarEvents = computed(() => planning.calendarEvents)
const calendarGroups = computed(() => planning.calendarGroups)
const automations = computed(() => planning.automations)
const tags = computed(() => planning.tags)

// ===== 标签下拉状态 =====
const tagDropdownOpen = ref(false)
const tagSearchText = ref('')
const tagSearchInput = ref(null)
const tagAddRef = ref(null)
const tagFieldRef = ref(null)
const tagDropdownStyle = ref({})

function toggleTagDropdown() {
  if (tagDropdownOpen.value) {
    tagDropdownOpen.value = false
    return
  }
  // 基于标签字段容器的位置，下拉框浮动在「标签」文字上方
  const fieldRect = tagFieldRef.value?.getBoundingClientRect()
  if (fieldRect) {
    // 下拉框宽度与详情内容区域等宽
    const width = fieldRect.width
    const style = {
      position: 'fixed',
      top: (fieldRect.top - 4) + 'px',
      left: fieldRect.left + 'px',
      width: width + 'px',
      transform: 'translateY(-100%)',
    }
    tagDropdownStyle.value = style
  }
  tagDropdownOpen.value = true
}

// 标签预设颜色
const TAG_PRESET_COLORS = ['#2563eb', '#7c3aed', '#db2777', '#dc2626', '#d97706', '#059669', '#0891b2', '#6b7280']

/** 标签颜色：有自定义色用自定义色，否则用 id 哈希取预设色 */
function tagColor(tag) {
  if (!tag) return '#6b7280'
  if (tag.color) return tag.color
  let hash = 0
  for (const ch of tag.id) hash = (hash * 31 + ch.charCodeAt(0)) | 0
  return TAG_PRESET_COLORS[Math.abs(hash) % TAG_PRESET_COLORS.length]
}

const filteredTags = computed(() => {
  const q = tagSearchText.value.trim().toLowerCase()
  if (!q) return tags.value
  return tags.value.filter((t) => t.name.toLowerCase().includes(q))
})

const canCreateTag = computed(() => {
  const q = tagSearchText.value.trim()
  if (!q) return false
  return !tags.value.some((t) => t.name.toLowerCase() === q.toLowerCase())
})

function isTagSelected(tag) {
  return selectedEvent.value?.tags?.some((t) => t.id === tag.id) ?? false
}

async function toggleTagFromDropdown(tag) {
  if (!selectedEvent.value) return
  const current = selectedEvent.value.tags.map((t) => t.id)
  const newIds = current.includes(tag.id) ? current.filter((id) => id !== tag.id) : [...current, tag.id]
  try {
    await planning.updateCalendarEvent({ id: selectedEvent.value.id, tagIds: newIds, expectedUpdatedAt: selectedEvent.value.updatedAt })
  } catch {
    message.error('保存标签失败')
  }
}

async function removeTagFromEvent(tag) {
  if (!selectedEvent.value) return
  const newIds = selectedEvent.value.tags.filter((t) => t.id !== tag.id).map((t) => t.id)
  try {
    await planning.updateCalendarEvent({ id: selectedEvent.value.id, tagIds: newIds, expectedUpdatedAt: selectedEvent.value.updatedAt })
  } catch {
    message.error('移除标签失败')
  }
}

async function createAndAddTag() {
  const name = tagSearchText.value.trim()
  if (!name) return
  try {
    const newTag = await planning.createTag({ name })
    await toggleTagFromDropdown(newTag)
    tagSearchText.value = ''
  } catch {
    message.error('创建标签失败')
  }
}

function onTagSearchEnter() {
  if (canCreateTag.value) {
    createAndAddTag()
  } else if (filteredTags.value.length === 1) {
    toggleTagFromDropdown(filteredTags.value[0])
    tagSearchText.value = ''
  }
}

// 点击外部关闭标签下拉
function closeTagDropdown(e) {
  if (!tagDropdownOpen.value) return
  const el = e.target.closest('.calendar-tag-add')
  if (!el) tagDropdownOpen.value = false
}

// ===== 日程 hover 详情浮窗 =====
const hoveredEvent = ref(null)
const tooltipStyle = ref({})

function showEventTooltip(ev, e) {
  hoveredEvent.value = ev
  const rect = e.currentTarget.getBoundingClientRect()
  const containerRect = e.currentTarget.closest('.calendar-workspace')?.getBoundingClientRect()
  const left = containerRect ? rect.left - containerRect.left + rect.width + 8 : rect.left + rect.width + 8
  const top = containerRect ? rect.top - containerRect.top : rect.top
  tooltipStyle.value = { left: left + 'px', top: top + 'px' }
}

function hideEventTooltip() {
  hoveredEvent.value = null
}

function formatEventDate(ev) {
  const s = dayjs(ev.startAt)
  return s.format('MM月DD日 ddd')
}

onMounted(() => document.addEventListener('click', closeTagDropdown))
onUnmounted(() => document.removeEventListener('click', closeTagDropdown))

const mode = ref('month')
const modes = [{ id: 'month', label: '月' }, { id: 'week', label: '周' }]
const currentMonth = ref(dayjs().startOf('month'))
const currentWeekStart = ref(dayjs().startOf('week'))
const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

// 分组预设颜色
const PRESET_COLORS = ['#2563eb', '#7c3aed', '#db2777', '#dc2626', '#d97706', '#059669', '#0891b2', '#6b7280']

/** 计算分组颜色：有自定义色用自定义色，否则用 id 哈希取预设色 */
function groupColor(group) {
  if (!group) return '#1677ff'
  if (group.color) return group.color
  let hash = 0
  for (const ch of group.id) hash = (hash * 31 + ch.charCodeAt(0)) | 0
  return PRESET_COLORS[Math.abs(hash) % PRESET_COLORS.length]
}

function eventColor(ev) { return groupColor(ev.group) }

function eventBg(ev) {
  const c = groupColor(ev.group)
  if (c.startsWith('#')) {
    const r = parseInt(c.slice(1, 3), 16)
    const g = parseInt(c.slice(3, 5), 16)
    const b = parseInt(c.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, 0.12)`
  }
  return 'rgba(22, 119, 255, 0.08)'
}

const toolbarTitle = computed(() => {
  if (mode.value === 'month') return currentMonth.value.format('YYYY年 M月')
  const end = currentWeekStart.value.add(6, 'day')
  return `${currentWeekStart.value.format('M月D日')} - ${end.format('M月D日')}`
})

// ===== 月视图 =====
const monthDays = computed(() => {
  const start = currentMonth.value.startOf('month')
  const startOfWeek = start.subtract((start.day() + 6) % 7, 'day')
  const today = dayjs()
  const days = []
  for (let i = 0; i < 42; i++) {
    const day = startOfWeek.add(i, 'day')
    const dayStart = day.startOf('day')
    const dayEnd = day.endOf('day')
    const events = calendarEvents.value.filter(e => {
      const s = dayjs(e.startAt)
      const eEnd = e.endAt ? dayjs(e.endAt) : s
      return s.isBefore(dayEnd) && eEnd.isAfter(dayStart)
    })
    days.push({
      key: day.format('YYYY-MM-DD'),
      date: day.date(),
      inMonth: day.month() === currentMonth.value.month(),
      isToday: day.isSame(today, 'day'),
      events,
      automationCount: countAutomationOccurrences(dayStart.valueOf(), dayEnd.valueOf()),
    })
  }
  return days
})

// ===== 周视图 =====
const weekDays = computed(() => {
  const today = dayjs()
  return Array.from({ length: 7 }, (_, i) => {
    const day = currentWeekStart.value.add(i, 'day')
    return { key: day.format('YYYY-MM-DD'), weekday: weekdays[i], date: day.date(), isToday: day.isSame(today, 'day') }
  })
})

const HOUR_HEIGHT = 44
const DRAG_SNAP_MINUTES = 15

function computeTimedSegments(items) {
  const result = []
  let active = [], cluster = [], clusterEndHour = -Infinity, clusterLaneCount = 1
  const finishCluster = () => { for (const seg of cluster) seg.laneCount = clusterLaneCount }
  for (const item of items) {
    if (item.startHour >= clusterEndHour) {
      finishCluster(); active = []; cluster = []; clusterEndHour = -Infinity; clusterLaneCount = 1
    }
    active = active.filter(seg => seg.endHour > item.startHour)
    const occupied = new Set(active.map(seg => seg.lane))
    let lane = 0; while (occupied.has(lane)) lane++
    const seg = { ...item, lane, laneCount: 1 }
    active.push(seg); cluster.push(seg)
    clusterEndHour = Math.max(clusterEndHour, item.endHour)
    clusterLaneCount = Math.max(clusterLaneCount, ...active.map(s => s.lane + 1))
    result.push(seg)
  }
  finishCluster()
  return result
}

const dayEventLayouts = computed(() => {
  const layouts = [[], [], [], [], [], [], []]
  for (const day of weekDays.value) {
    const dayIdx = weekDays.value.indexOf(day)
    if (dayIdx === -1) continue
    const dayDate = dayjs(day.key)
    const dayStart = dayDate.startOf('day')
    const dayEnd = dayDate.endOf('day')
    const dayItems = calendarEvents.value
      .filter(e => {
        const s = dayjs(e.startAt)
        const eEnd = e.endAt ? dayjs(e.endAt) : s
        return s.isBefore(dayEnd) && eEnd.isAfter(dayStart)
      })
      .map(e => {
        const s = dayjs(e.startAt)
        const eEnd = e.endAt ? dayjs(e.endAt) : s.add(1, 'hour')
        const cs = s.isBefore(dayStart) ? dayStart : s
        const ce = eEnd.isAfter(dayEnd) ? dayEnd : eEnd
        return { event: e, startHour: cs.diff(dayStart, 'minute') / 60, endHour: ce.diff(dayStart, 'minute') / 60 }
      })
      .sort((a, b) => a.startHour - b.startHour || a.endHour - b.endHour)
    for (const seg of computeTimedSegments(dayItems)) {
      layouts[dayIdx].push({
        event: seg.event,
        top: seg.startHour * HOUR_HEIGHT,
        height: Math.max((seg.endHour - seg.startHour) * HOUR_HEIGHT - 2, 18),
        widthPercent: 100 / seg.laneCount,
        leftPercent: seg.lane * (100 / seg.laneCount),
      })
    }
  }
  return layouts
})

// ===== 拖拽创建 =====
const dragDayIdx = ref(null)
const dragStartMin = ref(null)
const dragEndMin = ref(null)
const dragRef = ref(null)

const dragPreviewStyle = computed(() => {
  if (dragStartMin.value === null || dragEndMin.value === null) return {}
  const s = Math.min(dragStartMin.value, dragEndMin.value)
  const e = Math.max(dragStartMin.value, dragEndMin.value)
  return { top: s / 60 * HOUR_HEIGHT + 'px', height: (e - s) / 60 * HOUR_HEIGHT + 'px' }
})

function minuteAtPosition(event) {
  const rect = event.currentTarget.getBoundingClientRect()
  const raw = ((event.clientY - rect.top) / rect.height) * 24 * 60
  return Math.max(0, Math.min(24 * 60 - DRAG_SNAP_MINUTES, Math.round(raw / DRAG_SNAP_MINUTES) * DRAG_SNAP_MINUTES))
}

function onPointerDown(event, dayIdx) {
  if (event.button !== 0) return
  if (event.target instanceof Element && event.target.closest('[data-calendar-item]')) return
  event.preventDefault()
  event.currentTarget.setPointerCapture(event.pointerId)
  dragRef.value = { dayIdx, anchorMin: minuteAtPosition(event), pointerId: event.pointerId, clientY: event.clientY, isDragging: false }
}

function onPointerMove(event, dayIdx) {
  const d = dragRef.value
  if (!d || d.dayIdx !== dayIdx || d.pointerId !== event.pointerId) return
  if (!d.isDragging && Math.abs(event.clientY - d.clientY) < HOUR_HEIGHT / 6) return
  d.isDragging = true
  dragDayIdx.value = dayIdx
  const cm = minuteAtPosition(event)
  dragStartMin.value = Math.min(d.anchorMin, cm)
  dragEndMin.value = Math.min(24 * 60, Math.max(d.anchorMin, cm) + DRAG_SNAP_MINUTES)
}

function onPointerUp(event, dayIdx) {
  const d = dragRef.value
  if (!d || d.dayIdx !== dayIdx || d.pointerId !== event.pointerId) { clearDrag(); return }
  if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  dragRef.value = null
  if (!d.isDragging && Math.abs(event.clientY - d.clientY) < HOUR_HEIGHT / 6) { clearDrag(); return }
  const cm = minuteAtPosition(event)
  const sm = Math.min(d.anchorMin, cm)
  const em = Math.min(24 * 60, Math.max(d.anchorMin, cm) + DRAG_SNAP_MINUTES)
  const day = weekDays.value[dayIdx]
  if (day) quickCreateEvent(dayjs(day.key).add(sm, 'minute'), dayjs(day.key).add(em, 'minute'))
  clearDrag()
}

function onPointerCancel(event, dayIdx) {
  const d = dragRef.value
  if (!d || d.dayIdx !== dayIdx || d.pointerId !== event.pointerId) return
  if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  dragRef.value = null
  clearDrag()
}

function clearDrag() { dragDayIdx.value = null; dragStartMin.value = null; dragEndMin.value = null }

function formatMinToTime(min) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

// ===== 定时任务展示 =====
function countAutomationOccurrences(from, to) {
  let count = 0
  for (const a of automations.value) {
    if (!a.active) continue
    if (a.nextRunAt >= from && a.nextRunAt <= to) count++
  }
  return count
}

// ===== 导航 =====
function prev() {
  if (mode.value === 'month') currentMonth.value = currentMonth.value.subtract(1, 'month')
  else currentWeekStart.value = currentWeekStart.value.subtract(1, 'week')
}
function next() {
  if (mode.value === 'month') currentMonth.value = currentMonth.value.add(1, 'month')
  else currentWeekStart.value = currentWeekStart.value.add(1, 'week')
}

// ===== 日程详情（右侧 Inspector） =====
const selectedEventId = ref(null)
const selectedEvent = computed(() => calendarEvents.value.find(e => e.id === selectedEventId.value) || null)

// 打开标签下拉时自动聚焦搜索框
watch(tagDropdownOpen, (open) => {
  if (open) {
    tagSearchText.value = ''
    nextTick(() => tagSearchInput.value?.focus())
  }
})
// 切换日程时关闭标签下拉、清除全天缓存
watch(selectedEventId, () => {
  tagDropdownOpen.value = false
  cachedStartAt.value = null
  cachedEndAt.value = null
})

const detailTitle = ref('')
const detailNotes = ref('')
const detailAllDay = ref(false)
const detailStartAt = ref(null)
const detailEndAt = ref(null)
const detailGroupId = ref('__none__')
const pendingDelete = ref(null)

const deleteModalOpen = computed({
  get: () => !!pendingDelete.value,
  set: (v) => { if (!v) pendingDelete.value = null },
})

watch(selectedEvent, (ev) => {
  if (!ev) return
  detailTitle.value = ev.title
  detailNotes.value = ev.notes ?? ''
  detailAllDay.value = ev.allDay
  detailStartAt.value = dayjs(ev.startAt)
  detailEndAt.value = ev.endAt ? dayjs(ev.endAt) : null
  detailGroupId.value = ev.groupId ?? '__none__'
}, { immediate: true })

function selectEvent(ev) { selectedEventId.value = ev.id }

/** 月视图点击「更多」：切换到周视图并定位到该天 */
function showAllDayEvents(day) {
  const date = dayjs(day.key)
  currentWeekStart.value = date.startOf('week')
  mode.value = 'week'
}

function onDayClick(day) {
  const date = dayjs(day.key)
  quickCreateEvent(date, date.add(1, 'hour'))
}

watch(() => planning.calendarCreateRequest, (n, o) => {
  if (n !== o) quickCreateEvent(dayjs(), dayjs().add(1, 'hour'))
})

async function quickCreateEvent(startDate, endDate) {
  try {
    const event = await planning.createCalendarEvent({
      title: '新建日程',
      startAt: startDate.valueOf(),
      endAt: endDate.valueOf(),
      allDay: false,
    })
    selectedEventId.value = event.id
  } catch {
    message.error('创建日程失败')
  }
}

async function saveField(field) {
  if (!selectedEvent.value) return
  const ev = selectedEvent.value
  try {
    if (field === 'title') {
      const title = detailTitle.value.trim()
      if (!title || title === ev.title) return
      await planning.updateCalendarEvent({ id: ev.id, title, expectedUpdatedAt: ev.updatedAt })
    } else if (field === 'notes') {
      if (detailNotes.value === (ev.notes ?? '')) return
      await planning.updateCalendarEvent({ id: ev.id, notes: detailNotes.value, expectedUpdatedAt: ev.updatedAt })
    } else if (field === 'startAt') {
      const startAt = detailStartAt.value ? detailStartAt.value.valueOf() : ev.startAt
      await planning.updateCalendarEvent({ id: ev.id, startAt, expectedUpdatedAt: ev.updatedAt })
    } else if (field === 'endAt') {
      const endAt = detailEndAt.value ? detailEndAt.value.valueOf() : null
      await planning.updateCalendarEvent({ id: ev.id, endAt, expectedUpdatedAt: ev.updatedAt })
    } else if (field === 'groupId') {
      const groupId = detailGroupId.value === '__none__' ? null : detailGroupId.value
      await planning.updateCalendarEvent({ id: ev.id, groupId, expectedUpdatedAt: ev.updatedAt })
    }
  } catch {
    message.error('保存日程失败')
  }
}

// 缓存切换全天前的原始时间段，取消全天时恢复
const cachedStartAt = ref(null)
const cachedEndAt = ref(null)

async function saveAllDay() {
  if (!selectedEvent.value) return
  const ev = selectedEvent.value
  try {
    if (detailAllDay.value) {
      // 勾选全天：缓存当前时间段，将开始/结束改为当天 00:00
      cachedStartAt.value = ev.startAt
      cachedEndAt.value = ev.endAt
      const dayStart = dayjs(ev.startAt).startOf('day')
      await planning.updateCalendarEvent({
        id: ev.id, allDay: true,
        startAt: dayStart.valueOf(), endAt: dayStart.endOf('day').valueOf(),
        expectedUpdatedAt: ev.updatedAt,
      })
    } else {
      // 取消全天：恢复之前缓存的时间段，无缓存则默认 09:00-10:00
      const base = dayjs(ev.startAt).startOf('day')
      const start = cachedStartAt.value ? dayjs(cachedStartAt.value) : base.hour(9).minute(0)
      const end = cachedEndAt.value ? dayjs(cachedEndAt.value) : base.hour(10).minute(0)
      cachedStartAt.value = null
      cachedEndAt.value = null
      await planning.updateCalendarEvent({
        id: ev.id, allDay: false,
        startAt: start.valueOf(), endAt: end.valueOf(),
        expectedUpdatedAt: ev.updatedAt,
      })
    }
  } catch {
    message.error('保存失败')
  }
}

async function confirmDelete() {
  if (!pendingDelete.value) return
  try {
    await planning.deleteCalendarEvent(pendingDelete.value.id)
    selectedEventId.value = null
    pendingDelete.value = null
    message.success('日程已删除')
  } catch {
    message.error('删除日程失败')
  }
}

function formatEventTime(ev) {
  const s = dayjs(ev.startAt)
  const e = ev.endAt ? dayjs(ev.endAt) : null
  return e ? `${s.format('HH:mm')} - ${e.format('HH:mm')}` : s.format('HH:mm')
}

// ===== 分组管理 =====
const groupManagerOpen = ref(false)
const creatingGroup = ref(false)
const newGroupName = ref('')
const newGroupInputRef = ref(null)
const renamingGroupId = ref(null)
const renameGroupName = ref('')
const renameInputRef = ref(null)
const savingGroupAction = ref(null)
const pendingDeleteGroup = ref(null)
const colorPickerId = ref(null)

const deleteGroupModalOpen = computed({
  get: () => !!pendingDeleteGroup.value,
  set: (v) => { if (!v) pendingDeleteGroup.value = null },
})

function startCreateGroup() {
  creatingGroup.value = true
  newGroupName.value = ''
  nextTick(() => newGroupInputRef.value?.focus())
}

function cancelCreateGroup() { creatingGroup.value = false; newGroupName.value = '' }

async function confirmCreateGroup() {
  const name = newGroupName.value.trim()
  if (!name || savingGroupAction.value) return
  savingGroupAction.value = 'create'
  try {
    const group = await planning.createGroup({ scope: 'calendar', name })
    if (group) { creatingGroup.value = false; newGroupName.value = '' }
  } catch {
    message.error('创建分组失败：名称可能已存在')
  } finally {
    savingGroupAction.value = null
  }
}

function startRenameGroup(group) {
  renamingGroupId.value = group.id
  renameGroupName.value = group.name
  nextTick(() => {
    const el = renameInputRef.value
    if (el?.focus) el.focus()
    else if (el?.input) el.input.focus()
  })
}

function cancelRenameGroup() { renamingGroupId.value = null; renameGroupName.value = '' }

async function confirmRenameGroup(group) {
  const name = renameGroupName.value.trim()
  if (!name || savingGroupAction.value) return
  if (name === group.name) { cancelRenameGroup(); return }
  savingGroupAction.value = 'rename'
  try {
    await planning.updateGroup({ id: group.id, scope: 'calendar', name })
    renamingGroupId.value = null
    renameGroupName.value = ''
  } catch {
    message.error('重命名分组失败：名称可能已存在')
  } finally {
    savingGroupAction.value = null
  }
}

function requestDeleteGroup(group) { pendingDeleteGroup.value = group }

async function confirmDeleteGroup() {
  if (!pendingDeleteGroup.value || savingGroupAction.value) return
  savingGroupAction.value = 'delete'
  try {
    await planning.deleteGroup('calendar', pendingDeleteGroup.value.id)
    pendingDeleteGroup.value = null
  } catch {
    message.error('删除分组失败')
  } finally {
    savingGroupAction.value = null
  }
}

function toggleColorPicker(id) {
  colorPickerId.value = colorPickerId.value === id ? null : id
}

async function setGroupColor(group, color) {
  try {
    await planning.updateGroup({ id: group.id, scope: 'calendar', color })
  } catch {
    message.error('更新颜色失败')
  }
}
</script>

<style lang="less" scoped>
.calendar-workspace {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  box-sizing: border-box;
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  overflow: hidden;
  position: relative;
}

.calendar-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-color-light);
  flex-shrink: 0;
  &__left { display: flex; align-items: center; gap: 12px; }
  &__right { display: flex; align-items: center; gap: 4px; }
  &__nav { display: flex; align-items: center; gap: 12px; }
  &__title { font-size: 15px; font-weight: 600; color: var(--text-primary); min-width: 180px; text-align: center; }
}

.calendar-nav-btn {
  width: 32px; height: 32px; border: 1px solid var(--border-color); border-radius: 8px;
  background: var(--bg-panel); color: var(--text-secondary); cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  &:hover { color: var(--accent); border-color: var(--accent); }
}

.calendar-mode-btn {
  padding: 0 12px; height: 32px; border: 1px solid var(--border-color); border-radius: 8px;
  background: var(--bg-panel); color: var(--text-secondary); cursor: pointer; font-size: 13px;
  display: inline-flex; align-items: center; gap: 4px;
  &:hover { color: var(--accent); }
  &--active { background: var(--accent); color: #fff; border-color: var(--accent); }
}

// ===== 月视图 =====
.calendar-month { flex: 1; display: flex; flex-direction: column; min-height: 0; }

.calendar-weekdays {
  display: grid; grid-template-columns: repeat(7, 1fr);
  border-bottom: 1px solid var(--border-color-light); flex-shrink: 0;
}
.calendar-weekday { padding: 8px; text-align: center; font-size: 12px; font-weight: 500; color: var(--text-muted); }

.calendar-days {
  flex: 1; display: grid; grid-template-columns: repeat(7, 1fr);
  grid-template-rows: repeat(6, minmax(0, 1fr)); overflow-y: auto;
}

.calendar-day {
  border-right: 1px solid var(--border-color-light);
  border-bottom: 1px solid var(--border-color-light);
  padding: 4px; cursor: pointer; transition: background 0.15s ease;
  overflow: hidden; display: flex; flex-direction: row; min-height: 0;
  &:hover { background: rgba(22, 119, 255, 0.03); }
  &--other { background: rgba(0, 0, 0, 0.02); .calendar-day__num { color: var(--text-muted); } }
  &--today { .calendar-day__num { color: var(--accent); font-weight: 600; } }
  &__num { font-size: 12px; color: var(--text-secondary); flex-shrink: 0; width: 18px; text-align: right; line-height: 1.4; }
  &__events { display: flex; flex-direction: column; gap: 2px; margin-left: 4px; flex: 1; min-width: 0; }
  &__more { font-size: 10px; color: var(--text-muted); padding: 1px 4px; margin-top: 2px; cursor: pointer; &:hover { color: var(--accent); } }
  &__auto { font-size: 10px; color: var(--accent); padding: 1px 4px; background: rgba(22, 119, 255, 0.08); border-radius: 3px; margin-top: 2px; }
}

.calendar-event {
  font-size: 11px; padding: 2px 4px; border-left: 3px solid var(--accent);
  background: rgba(22, 119, 255, 0.06); border-radius: 2px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; color: var(--text-primary);
  &:hover { filter: brightness(0.95); }
}

// ===== 周视图 =====
.calendar-week {
  flex: 1; display: flex; flex-direction: column; min-height: 0;
  &__header {
    display: grid; grid-template-columns: 56px repeat(7, 1fr);
    border-bottom: 1px solid var(--border-color-light); flex-shrink: 0;
  }
  &__time-gutter { width: 56px; flex-shrink: 0; }
  &__header-day { display: flex; flex-direction: column; align-items: center; padding: 8px; border-right: 1px solid var(--border-color-light); }
  &__weekday { font-size: 11px; color: var(--text-muted); }
  &__date { font-size: 16px; font-weight: 600; color: var(--text-primary); margin-top: 2px; &--today { color: var(--accent); } }
  &__body {
    flex: 1; overflow-y: auto; display: grid;
    grid-template-columns: 56px repeat(7, 1fr); position: relative;
  }
  &__time-cell { height: 44px; padding-right: 8px; text-align: right; font-size: 11px; color: var(--text-muted); padding-top: 2px; border-bottom: 1px solid var(--border-color-light); }
  &__day-col {
    border-right: 1px solid var(--border-color-light); position: relative;
    user-select: none; cursor: crosshair; touch-action: none;
    overflow: hidden; min-width: 0; box-sizing: border-box;
  }
  &__hour-cell { height: 44px; border-bottom: 1px solid var(--border-color-light); &:hover { background: rgba(22, 119, 255, 0.02); } }
  &__drag-preview {
    position: absolute; left: 2px; right: 2px;
    background: rgba(22, 119, 255, 0.15); border: 1px solid var(--accent); border-left: 2px solid var(--accent);
    border-radius: 4px; pointer-events: none; z-index: 5; overflow: hidden; padding: 4px 6px;
  }
  &__drag-label { display: block; font-size: 11px; font-weight: 500; color: var(--accent); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__event {
    position: absolute; border-left: 3px solid var(--accent); border-radius: 4px;
    padding: 4px 6px; overflow: hidden; cursor: pointer; z-index: 3;
    transition: filter 0.15s ease; min-width: 0; box-sizing: border-box;
    &:hover { filter: brightness(0.92); z-index: 4; }
  }
  &__event-title { display: block; font-size: 12px; font-weight: 500; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__event-time { display: block; font-size: 10px; color: var(--text-muted); margin-top: 2px; }
}

// ===== 右侧 Inspector =====
.calendar-inspector-overlay {
  position: absolute; inset: 0; z-index: 30; background: rgba(0, 0, 0, 0.02); cursor: pointer;
}

.calendar-inspector {
  position: absolute; top: 12px; right: 12px; bottom: 12px;
  width: min(400px, calc(100% - 24px));
  background: var(--bg-panel); border: 1px solid var(--border-color-light);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.12); border-radius: 12px;
  z-index: 40; overflow: hidden; display: flex; flex-direction: column;

  &__close {
    position: absolute; top: 12px; right: 12px; width: 28px; height: 28px;
    border: none; background: transparent; cursor: pointer; color: var(--text-muted);
    border-radius: 6px; display: flex; align-items: center; justify-content: center; z-index: 10;
    &:hover { background: var(--bg-hover); color: var(--text-primary); }
  }
  &__header { flex-shrink: 0; padding: 20px 20px 12px; border-bottom: 1px solid var(--border-color-light); }
  &__title {
    border: none; background: transparent; font-size: 17px; font-weight: 600;
    color: var(--text-primary); outline: none; padding: 0; padding-right: 40px;
    width: 100%; box-sizing: border-box;
    &:focus { box-shadow: none; }
  }
  &__body { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 16px 20px; display: flex; flex-direction: column; gap: 20px; }
  &__section { display: flex; flex-direction: column; gap: 12px; }
  &__section-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--text-muted); margin: 0; }
  &__label { display: block; font-size: 11px; font-weight: 500; color: var(--text-muted); margin-bottom: 6px; }
  &__field { display: flex; flex-direction: column; }
  &__field-label { font-size: 11px; font-weight: 500; color: var(--text-muted); margin-bottom: 6px; }
  &__field-row { display: flex; gap: 8px; .calendar-inspector__field { flex: 1; } }
  &__notes {
    border: 1px solid var(--border-color-light); border-radius: 8px;
    background: rgba(22, 119, 255, 0.03); padding: 8px 12px; font-size: 13px;
    min-height: 80px; resize: vertical; outline: none; color: var(--text-primary);
    &:focus { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.1); }
  }
  &__select { width: 100%; }
  &__date { width: 100%; }
  &__footer {
    flex-shrink: 0; display: flex; justify-content: space-between; align-items: center;
    padding: 12px 20px; border-top: 1px solid var(--border-color-light); background: var(--bg-panel);
  }
  &__delete-btn {
    display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 14px;
    border: none; border-radius: 8px; cursor: pointer; font-size: 13px; transition: all 0.2s ease;
    background: #ff4d4f; color: #fff; font-weight: 500;
    box-shadow: 0 2px 6px rgba(255, 77, 79, 0.25);
    &:hover { background: #d9363e; }
  }
  &__save-hint { font-size: 11px; color: var(--text-muted); }
  &__all-day {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 12px; border: 1px solid var(--border-color-light); border-radius: 8px;
    cursor: pointer;
  }
  &__all-day-hint { font-size: 11px; color: var(--text-muted); }
}

// ===== 标签 =====
.calendar-tag-chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }

.calendar-tag-chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 4px 2px 8px; border-radius: 12px; font-size: 12px;
  background: rgba(0, 0, 0, 0.05); color: var(--text-primary); transition: all 0.15s ease;
  &:hover { background: rgba(0, 0, 0, 0.08); }
  &__dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  &__close {
    display: inline-flex; align-items: center; justify-content: center;
    width: 16px; height: 16px; border: none; border-radius: 50%;
    background: transparent; color: var(--text-muted); cursor: pointer; font-size: 10px;
    transition: all 0.15s ease;
    &:hover { background: rgba(220, 38, 38, 0.15); color: #dc2626; }
  }
}

.calendar-tag-add { position: relative; display: inline-flex; }
.calendar-tag-add__btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 24px; height: 24px; border: 1px dashed rgba(0, 0, 0, 0.2); border-radius: 6px;
  background: transparent; color: var(--text-muted); cursor: pointer; transition: all 0.15s ease;
  font-size: 12px;
  &:hover { border-color: var(--accent); color: var(--accent); background: rgba(22, 119, 255, 0.06); }
}

.calendar-tag-dropdown {
  z-index: 9999;
  border-radius: 8px; overflow: hidden;
  background: #fff; box-shadow: 0 6px 24px rgba(0, 0, 0, 0.15);
  border: 1px solid rgba(0, 0, 0, 0.08);
  &__search { padding: 10px 12px 6px; }
  &__input {
    width: 100%; padding: 6px 10px; border: 1px solid rgba(0, 0, 0, 0.12); border-radius: 6px;
    font-size: 13px; outline: none; background: #f5f5f5; color: #333;
    box-sizing: border-box;
    transition: border-color 0.15s ease;
    &:focus { border-color: #1677ff; }
  }
  &__list { max-height: 220px; overflow-y: auto; padding: 4px 8px 8px; }
  &__item {
    display: flex; align-items: center; gap: 8px; width: 100%;
    padding: 7px 8px; border: none; border-radius: 6px;
    background: transparent; cursor: pointer; font-size: 13px; text-align: left;
    color: #333; transition: background 0.12s ease;
    &:hover { background: rgba(0, 0, 0, 0.05); }
    &--selected { background: rgba(22, 119, 255, 0.08); }
    &--create { color: #1677ff; font-weight: 500; }
    &-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    &-check { font-size: 12px; color: #1677ff; flex-shrink: 0; }
  }
  &__empty { padding: 12px 8px; text-align: center; font-size: 12px; color: #9ca3af; }
}

// ===== 分组颜色点 =====
.calendar-group-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; display: inline-block; }
.calendar-group-option { display: inline-flex; align-items: center; gap: 6px; }

// ===== 颜色选择器 =====
.group-color-picker {
  position: relative; flex-shrink: 0;
  &__current { cursor: pointer; width: 16px; height: 16px; border: 2px solid rgba(0,0,0,0.1); }
  &__panel {
    position: absolute; top: 50%; left: 100%; transform: translateY(-50%); margin-left: 6px; z-index: 50;
    display: flex; gap: 4px; padding: 8px; background: var(--bg-panel);
    border: 1px solid var(--border-color); border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  }
  &__swatch {
    width: 18px; height: 18px; border-radius: 4px; border: 2px solid transparent; cursor: pointer;
    &--active { border-color: var(--text-primary); }
  }
  &__custom {
    width: 18px; height: 18px; border-radius: 4px; overflow: hidden; cursor: pointer;
    background: conic-gradient(red, yellow, lime, aqua, blue, magenta, red);
    input { width: 100%; height: 100%; opacity: 0; cursor: pointer; }
  }
}

// ===== 分组管理 Modal =====
.group-manager-modal { .ant-modal-body { padding: 16px 20px 20px; } }
.group-manager {
  &__create { margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid var(--border-color-light); }
  &__create-row { display: flex; align-items: center; gap: 6px; }
  &__create-input { flex: 1; }
  &__add-btn {
    display: flex; align-items: center; justify-content: center; gap: 6px;
    width: 100%; height: 34px; border: 1px dashed var(--border-color); border-radius: 8px;
    background: transparent; cursor: pointer; font-size: 13px; color: var(--text-muted); transition: all 0.15s ease;
    &:hover { border-color: var(--accent); color: var(--accent); background: rgba(22, 119, 255, 0.03); }
  }
  &__list { max-height: 320px; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }
  &__empty { padding: 32px 0; text-align: center; font-size: 13px; color: var(--text-muted); }
  &__item {
    display: flex; align-items: center; gap: 8px; height: 38px; padding: 0 6px;
    border-radius: 6px; transition: background 0.15s ease;
    &:hover { background: rgba(22, 119, 255, 0.04); .group-manager__icon-btn { opacity: 1; } }
  }
  &__item-name { flex: 1; font-size: 13px; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__rename-input { flex: 1; }
  &__action-btn {
    width: 32px; height: 32px; border: none; border-radius: 6px; cursor: pointer;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 14px; transition: all 0.15s ease;
    &--confirm {
      background: rgba(82, 196, 26, 0.12); color: #52c41a;
      &:hover:not(:disabled) { background: #52c41a; color: #fff; }
      &:disabled { opacity: 0.35; cursor: not-allowed; }
    }
    &--cancel {
      background: rgba(0, 0, 0, 0.06); color: var(--text-muted);
      &:hover { background: rgba(255, 77, 79, 0.1); color: #ff4d4f; }
    }
  }
  &__icon-btn {
    width: 26px; height: 26px; border: none; background: transparent; border-radius: 4px; cursor: pointer;
    display: flex; align-items: center; justify-content: center; color: var(--text-muted);
    flex-shrink: 0; opacity: 0; transition: all 0.15s ease; font-size: 13px;
    &:hover { background: rgba(22, 119, 255, 0.1); color: var(--accent); }
    &--danger:hover { background: rgba(255, 77, 79, 0.1); color: #ff4d4f; }
  }
}

// ===== 公共按钮 =====
.planning-btn {
  display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 14px;
  border: none; border-radius: 8px; cursor: pointer; font-size: 13px; transition: all 0.2s ease;
  &--primary {
    background: var(--accent); color: #fff; font-weight: 500;
    box-shadow: 0 2px 6px rgba(22, 119, 255, 0.25);
    &:hover { background: var(--accent-hover); }
  }
  &--ghost {
    background: var(--bg-panel); color: var(--text-secondary); border: 1px solid var(--border-color);
    &:hover { color: var(--accent); border-color: var(--accent); }
  }
}

// ===== 日程 hover 详情浮窗 =====
.calendar-event-tooltip {
  position: absolute; z-index: 999; min-width: 200px; max-width: 280px;
  padding: 10px 12px; border-radius: 8px;
  background: #fff; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  border: 1px solid rgba(0, 0, 0, 0.06);
  pointer-events: none; animation: tooltipFadeIn 0.12s ease;

  &__header { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
  &__dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  &__title { font-size: 13px; font-weight: 600; color: #1f2937; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__time { font-size: 12px; color: #6b7280; margin-bottom: 4px; display: flex; gap: 6px; align-items: center; }
  &__date { color: #9ca3af; }
  &__group { display: flex; align-items: center; gap: 4px; font-size: 12px; color: #6b7280; margin-bottom: 4px; }
  &__tags { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 4px; }
  &__tag { display: inline-flex; align-items: center; gap: 3px; font-size: 11px; color: #6b7280; }
  &__notes { font-size: 12px; color: #4b5563; margin-top: 4px; line-height: 1.4; max-height: 60px; overflow: hidden; }
}

@keyframes tooltipFadeIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
