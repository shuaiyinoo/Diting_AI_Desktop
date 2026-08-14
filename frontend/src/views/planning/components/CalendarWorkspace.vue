<template>
  <div class="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[10px] border border-border bg-card">
    <!-- 工具栏 -->
    <div class="flex shrink-0 items-center justify-between border-b border-border/50 px-5 py-4">
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-3">
          <Button variant="outline" size="icon" class="size-8" @click="prev"><ChevronLeft class="size-4" /></Button>
          <span class="min-w-[180px] text-center text-[15px] font-semibold text-foreground">{{ toolbarTitle }}</span>
          <Button variant="outline" size="icon" class="size-8" @click="next"><ChevronRight class="size-4" /></Button>
        </div>
        <Button v-for="m in modes" :key="m.id" variant="outline" size="sm" class="h-8 gap-1 px-3 text-[13px]" :class="mode === m.id ? 'border-primary bg-primary text-primary-foreground hover:bg-primary' : ''" @click="mode = m.id">{{ m.label }}</Button>
      </div>
      <div class="flex items-center gap-1">
        <Button variant="outline" size="sm" class="h-8 gap-1" @click="groupManagerOpen = true">
          <ListOrdered class="size-4" /> 分组
        </Button>
      </div>
    </div>

    <!-- 月视图 -->
    <div v-if="mode === 'month'" class="flex min-h-0 flex-1 flex-col">
      <div class="grid shrink-0 grid-cols-7 border-b border-border/50">
        <div v-for="d in weekdays" :key="d" class="p-2 text-center text-xs font-medium text-muted-foreground">{{ d }}</div>
      </div>
      <div class="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 overflow-y-auto">
        <div
          v-for="day in monthDays"
          :key="day.key"
          class="flex cursor-pointer flex-row overflow-hidden border-b border-border/50 border-r p-1 transition-colors hover:bg-primary/[0.03]"
          :class="{ 'bg-foreground/[0.02]': !day.inMonth }"
          @click="onDayClick(day)"
        >
          <span class="w-[18px] shrink-0 text-right text-xs leading-relaxed" :class="{ 'text-muted-foreground': !day.inMonth, 'font-semibold text-primary': day.isToday, 'text-muted-foreground': !day.isToday && day.inMonth }">{{ day.date }}</span>
          <div class="ml-1 flex min-w-0 flex-1 flex-col gap-0.5">
            <div
              v-for="ev in day.events.slice(0, 2)"
              :key="ev.id"
              class="cursor-pointer truncate rounded-[2px] border-l-[3px] px-1 py-0.5 text-[11px] text-foreground hover:brightness-95"
              :style="{ borderColor: eventColor(ev), background: eventBg(ev) }"
              @click.stop="selectEvent(ev)"
              @mouseenter="showEventTooltip(ev, $event)"
              @mouseleave="hideEventTooltip"
            >{{ ev.title }}</div>
            <div v-if="day.events.length > 2" class="mt-0.5 cursor-pointer px-1 text-[10px] text-muted-foreground hover:text-primary" @click.stop="showAllDayEvents(day)">
              +{{ day.events.length - 2 }} 更多
            </div>
            <div v-if="day.automationCount" class="mt-0.5 rounded-[3px] bg-primary/[0.08] px-1 text-[10px] text-primary">定时任务 {{ day.automationCount }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 周视图 -->
    <div v-else class="flex min-h-0 flex-1 flex-col">
      <div class="grid shrink-0 grid-cols-[56px_repeat(7,1fr)] border-b border-border/50">
        <div class="w-[56px] shrink-0"></div>
        <div v-for="d in weekDays" :key="d.key" class="flex flex-col items-center border-r border-border/50 p-2">
          <span class="text-[11px] text-muted-foreground">{{ d.weekday }}</span>
          <span class="mt-0.5 text-base font-semibold" :class="d.isToday ? 'text-primary' : 'text-foreground'">{{ d.date }}</span>
        </div>
      </div>
      <div class="relative grid min-h-0 flex-1 grid-cols-[56px_repeat(7,1fr)] overflow-y-auto">
        <div class="w-[56px] shrink-0">
          <div v-for="hour in 24" :key="hour - 1" class="h-11 border-b border-border/50 pr-2 pt-0.5 text-right text-[11px] text-muted-foreground">
            {{ String(hour - 1).padStart(2, '0') }}:00
          </div>
        </div>
        <div
          v-for="(day, dayIdx) in weekDays"
          :key="day.key"
          class="relative min-w-0 cursor-crosshair touch-none overflow-hidden border-r border-border/50 select-none"
          @pointerdown="onPointerDown($event, dayIdx)"
          @pointermove="onPointerMove($event, dayIdx)"
          @pointerup="onPointerUp($event, dayIdx)"
          @pointercancel="onPointerCancel($event, dayIdx)"
        >
          <div v-for="hour in 24" :key="hour - 1" class="h-11 border-b border-border/50 hover:bg-primary/[0.02]"></div>
          <div
            v-if="dragDayIdx === dayIdx && dragStartMin !== null && dragEndMin !== null"
            class="pointer-events-none absolute left-0.5 right-0.5 z-[5] overflow-hidden rounded border border-primary border-l-2 bg-primary/15 p-1.5"
            :style="dragPreviewStyle"
          >
            <span v-if="dragEndMin - dragStartMin >= 30" class="block truncate text-[11px] font-medium text-primary">
              新建日程 · {{ formatMinToTime(dragStartMin) }}–{{ formatMinToTime(dragEndMin) }}
            </span>
          </div>
          <div
            v-for="layout in dayEventLayouts[dayIdx]"
            :key="layout.event.id"
            class="absolute z-[3] min-w-0 cursor-pointer overflow-hidden rounded border-l-[3px] p-1.5 transition-[filter] hover:z-[4] hover:brightness-90"
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
            <span class="block truncate text-xs font-medium text-foreground">{{ layout.event.title }}</span>
            <span v-if="layout.height >= 28" class="mt-0.5 block text-[10px] text-muted-foreground">{{ formatEventTime(layout.event) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 日程 hover 详情浮窗 -->
    <div
      v-if="hoveredEvent"
      class="pointer-events-none absolute z-[999] min-w-[200px] max-w-[280px] rounded-lg border border-border/10 bg-card p-2.5 px-3 shadow-lg"
      :style="tooltipStyle"
    >
      <div class="mb-1.5 flex items-center gap-1.5">
        <span class="size-2 shrink-0 rounded-full" :style="{ background: eventColor(hoveredEvent) }"></span>
        <span class="truncate text-[13px] font-semibold text-foreground">{{ hoveredEvent.title }}</span>
      </div>
      <div class="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground">
        <span v-if="hoveredEvent.allDay">全天</span>
        <span v-else>{{ formatEventTime(hoveredEvent) }}</span>
        <span class="text-muted-foreground/70">{{ formatEventDate(hoveredEvent) }}</span>
      </div>
      <div v-if="hoveredEvent.group" class="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
        <span class="size-2 rounded-full" :style="{ background: groupColor(hoveredEvent.group) }"></span>
        {{ hoveredEvent.group.name }}
      </div>
      <div v-if="hoveredEvent.tags?.length" class="mb-1 flex flex-wrap gap-1">
        <span v-for="tag in hoveredEvent.tags" :key="tag.id" class="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
          <span class="size-2 rounded-full" :style="{ background: tagColor(tag) }"></span>
          {{ tag.name }}
        </span>
      </div>
      <div v-if="hoveredEvent.notes" class="mt-1 max-h-[60px] overflow-hidden text-xs leading-relaxed text-muted-foreground">{{ hoveredEvent.notes }}</div>
    </div>

    <!-- 右侧详情 Inspector -->
    <div v-if="selectedEvent" class="absolute inset-0 z-30 cursor-pointer bg-foreground/[0.02]" @click="selectedEventId = null"></div>
    <aside v-if="selectedEvent" class="absolute bottom-3 right-3 top-3 z-40 flex w-[min(400px,calc(100%-24px))] flex-col overflow-hidden rounded-xl border border-border/50 bg-card shadow-xl">
      <Button variant="ghost" size="icon" class="absolute right-3 top-3 z-10 size-7" @click="selectedEventId = null">
        <X class="size-4" />
      </Button>
      <div class="shrink-0 border-b border-border/50 px-5 pb-3 pt-5">
        <Input
          class="w-full border-none bg-transparent pr-10 text-[17px] font-semibold"
          v-model="detailTitle"
          placeholder="日程标题"
          @blur="saveField('title')"
          @keydown.enter="$event.target.blur()"
        />
      </div>
      <div class="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overflow-x-hidden p-4 px-5">
        <div class="flex flex-col gap-3">
          <h3 class="m-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">时间</h3>
          <div class="flex cursor-pointer items-center gap-2 rounded-lg border border-border/50 px-3 py-2">
            <Switch
              :checked="detailAllDay"
              @update:checked="detailAllDay = $event; saveAllDay()"
            />
            <span>全天</span>
            <span class="text-[11px] text-muted-foreground">不占用具体小时段</span>
          </div>
          <div class="flex gap-2">
            <div class="flex flex-1 flex-col">
              <Label class="mb-1.5 text-[11px] font-medium text-muted-foreground">开始</Label>
              <DateTimePicker
                :model-value="detailStartAtInput"
                @update:model-value="detailStartAtInput = $event"
                placeholder="开始时间"
                class="h-8 text-[13px]"
                @change="saveField('startAt')"
              />
            </div>
            <div class="flex flex-1 flex-col">
              <Label class="mb-1.5 text-[11px] font-medium text-muted-foreground">结束</Label>
              <DateTimePicker
                :model-value="detailEndAtInput"
                @update:model-value="detailEndAtInput = $event"
                placeholder="结束时间"
                class="h-8 text-[13px]"
                @change="saveField('endAt')"
              />
            </div>
          </div>
        </div>
        <div class="flex flex-col gap-3">
          <Label class="mb-1.5 block text-[11px] font-medium text-muted-foreground">更多信息</Label>
          <Textarea
            class="min-h-[80px] resize-y bg-primary/[0.03]"
            v-model="detailNotes"
            placeholder="补充地点、议程、会议链接或其他上下文…"
            @blur="saveField('notes')"
          />
        </div>
        <div class="flex flex-col gap-3">
          <h3 class="m-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">组织</h3>
          <div class="flex flex-col">
            <Label class="mb-1.5 text-[11px] font-medium text-muted-foreground">日程分组</Label>
            <Select v-model="detailGroupId" @update:model-value="saveField('groupId')">
              <SelectTrigger class="w-full"><SelectValue placeholder="选择分组" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">不分组</SelectItem>
                <SelectItem v-for="g in calendarGroups" :key="g.id" :value="g.id">
                  <span class="inline-flex items-center gap-1.5">
                    <span class="size-2 rounded-full" :style="{ background: groupColor(g) }"></span>
                    {{ g.name }}
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="flex flex-col" ref="tagFieldRef">
            <Label class="mb-1.5 text-[11px] font-medium text-muted-foreground">标签</Label>
            <div class="flex flex-wrap items-center gap-1.5">
              <span
                v-for="tag in selectedEvent.tags"
                :key="tag.id"
                class="inline-flex items-center gap-1 rounded-[12px] bg-foreground/5 px-1 py-0.5 pl-2 text-xs text-foreground transition-colors hover:bg-foreground/10"
              >
                <span class="size-2 rounded-full" :style="{ background: tagColor(tag) }"></span>
                {{ tag.name }}
                <Button variant="ghost" size="icon" class="size-4 rounded-full text-muted-foreground hover:bg-destructive/15 hover:text-destructive" @click.stop="removeTagFromEvent(tag)">
                  <X class="size-2.5" />
                </Button>
              </span>
              <div class="relative inline-flex" ref="tagAddRef">
                <Button variant="ghost" size="icon" class="size-6 border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5" @click.stop="toggleTagDropdown">
                  <Plus class="size-3" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="flex shrink-0 items-center justify-between border-t border-border/50 bg-card px-5 py-3">
        <Button variant="destructive" class="gap-1.5" @click="pendingDelete = selectedEvent">
          <Trash2 class="size-4" /> 删除日程
        </Button>
        <span class="text-[11px] text-muted-foreground">编辑后自动保存</span>
      </div>
    </aside>

    <!-- 标签下拉面板（Teleport 到 body 避免被 inspector overflow 裁切） -->
    <Teleport to="body">
      <div v-if="tagDropdownOpen" class="z-[9999] overflow-hidden rounded-lg border border-border/10 bg-card shadow-xl" :style="tagDropdownStyle" @click.stop>
        <div class="px-3 pb-1.5 pt-2.5">
          <Input
            ref="tagSearchInput"
            v-model="tagSearchText"
            class="w-full bg-muted/50 text-[13px]"
            placeholder="搜索或输入新标签…"
            @keydown.enter="onTagSearchEnter"
          />
        </div>
        <div class="max-h-[220px] overflow-y-auto p-1 pb-2">
          <Button v-for="tag in filteredTags" :key="tag.id" variant="ghost" class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-foreground hover:bg-foreground/5" :class="{ 'bg-primary/[0.08]': isTagSelected(tag) }" @click="toggleTagFromDropdown(tag)">
            <span class="size-2 rounded-full" :style="{ background: tagColor(tag) }"></span>
            <span class="flex-1 truncate">{{ tag.name }}</span>
            <Check v-if="isTagSelected(tag)" class="size-3 shrink-0 text-primary" />
          </Button>
          <Button v-if="canCreateTag" variant="ghost" class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] font-medium text-primary hover:bg-foreground/5" @click="createAndAddTag">
            <Plus class="size-3" />
            <span>创建「{{ tagSearchText.trim() }}」</span>
          </Button>
          <div v-if="!filteredTags.length && !canCreateTag" class="px-2 py-3 text-center text-xs text-muted-foreground">
            暂无标签，输入名称可创建
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 删除确认 -->
    <Dialog v-model:open="deleteModalOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>确认删除日程</DialogTitle>
        </DialogHeader>
        <p>删除「{{ pendingDelete?.title }}」后无法恢复。</p>
        <DialogFooter>
          <Button variant="outline" @click="deleteModalOpen = false">取消</Button>
          <Button variant="destructive" @click="confirmDelete">删除</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- 分组管理 Modal -->
    <Dialog v-model:open="groupManagerOpen">
      <DialogContent class="max-w-[440px]">
        <DialogHeader>
          <DialogTitle>日程分组管理</DialogTitle>
        </DialogHeader>
        <div class="mb-3 border-b border-border/50 pb-3">
          <div v-if="creatingGroup" class="flex items-center gap-1.5">
            <Input
              ref="newGroupInputRef"
              :model-value="newGroupName"
              @update:model-value="newGroupName = $event"
              placeholder="输入分组名称"
              class="h-8 flex-1 text-[13px]"
              @keydown.enter="confirmCreateGroup"
              @keydown.escape="cancelCreateGroup"
            />
            <Button variant="ghost" size="icon" class="size-8 text-green-600 hover:bg-green-500 hover:text-white" @click="confirmCreateGroup" :disabled="!newGroupName.trim() || savingGroupAction === 'create'" title="确认">
              <Check class="size-4" />
            </Button>
            <Button variant="ghost" size="icon" class="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" @click="cancelCreateGroup" title="取消">
              <X class="size-4" />
            </Button>
          </div>
          <Button v-else variant="outline" class="h-[34px] w-full gap-1.5 border-dashed" @click="startCreateGroup">
            <Plus class="size-4" /> 新建分组
          </Button>
        </div>
        <div class="flex max-h-[320px] flex-col gap-0.5 overflow-y-auto">
          <div v-if="!calendarGroups.length" class="py-8 text-center text-[13px] text-muted-foreground">
            还没有分组，点击上方新建
          </div>
          <div v-for="g in calendarGroups" :key="g.id" class="flex h-[38px] items-center gap-2 rounded-md px-1.5 transition-colors hover:bg-primary/[0.04]">
            <template v-if="renamingGroupId === g.id">
              <span class="size-2 rounded-full" :style="{ background: groupColor(g) }"></span>
              <Input
                ref="renameInputRef"
                :model-value="renameGroupName"
                @update:model-value="renameGroupName = $event"
                class="h-8 flex-1 text-[13px]"
                @keydown.enter="confirmRenameGroup(g)"
                @keydown.escape="cancelRenameGroup"
              />
              <Button variant="ghost" size="icon" class="size-8 text-green-600 hover:bg-green-500 hover:text-white" @click="confirmRenameGroup(g)" :disabled="!renameGroupName.trim() || savingGroupAction === 'rename'" title="确认">
                <Check class="size-4" />
              </Button>
              <Button variant="ghost" size="icon" class="size-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" @click="cancelRenameGroup" title="取消">
                <X class="size-4" />
              </Button>
            </template>
            <template v-else>
              <div class="relative shrink-0">
                <span
                  class="size-4 cursor-pointer rounded-full border-2 border-border/10"
                  :style="{ background: groupColor(g) }"
                  @click="toggleColorPicker(g.id)"
                ></span>
                <div v-if="colorPickerId === g.id" class="absolute left-full top-1/2 z-50 flex -translate-y-1/2 gap-1 rounded-lg border border-border bg-card p-2 shadow-md ml-1.5">
                  <button
                    v-for="c in PRESET_COLORS"
                    :key="c"
                    class="size-4 cursor-pointer rounded-[4px] border-2 border-transparent"
                    :class="{ 'border-foreground': (g.color || '') === c }"
                    :style="{ background: c }"
                    @click="setGroupColor(g, c)"
                  ></button>
                  <label class="size-4 cursor-pointer overflow-hidden rounded-[4px]" style="background: conic-gradient(red, yellow, lime, aqua, blue, magenta, red)">
                    <input type="color" :value="g.color || '#1677ff'" @input="setGroupColor(g, $event.target.value)" class="size-full cursor-pointer opacity-0" />
                  </label>
                </div>
              </div>
              <span class="flex-1 truncate text-[13px] text-foreground">{{ g.name }}</span>
              <Button variant="ghost" size="icon" class="size-[26px] text-muted-foreground opacity-0 hover:bg-primary/10 hover:text-primary" title="重命名" @click="startRenameGroup(g)">
                <Pencil class="size-3.5" />
              </Button>
              <Button variant="ghost" size="icon" class="size-[26px] text-muted-foreground opacity-0 hover:bg-destructive/10 hover:text-destructive" title="删除" @click="requestDeleteGroup(g)">
                <Trash2 class="size-3.5" />
              </Button>
            </template>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <!-- 分组删除确认 -->
    <Dialog v-model:open="deleteGroupModalOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>确认删除分组</DialogTitle>
        </DialogHeader>
        <p>删除「{{ pendingDeleteGroup?.name }}」后无法恢复。</p>
        <DialogFooter>
          <Button variant="outline" @click="deleteGroupModalOpen = false">取消</Button>
          <Button variant="destructive" :disabled="savingGroupAction === 'delete'" @click="confirmDeleteGroup">删除</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useToast } from '@/components/ui/sonner'
import {
  ChevronLeft, ChevronRight, ListOrdered,
  Plus, Check, X, Pencil, Trash2,
} from '@lucide/vue'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { DateTimePicker } from '@/components/ui/date-time-picker'
import { Switch } from '@/components/ui/switch'
import { usePlanningStore } from '@/stores/planning'
import dayjs from 'dayjs'

const toast = useToast()
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
    toast.error('保存标签失败')
  }
}

async function removeTagFromEvent(tag) {
  if (!selectedEvent.value) return
  const newIds = selectedEvent.value.tags.filter((t) => t.id !== tag.id).map((t) => t.id)
  try {
    await planning.updateCalendarEvent({ id: selectedEvent.value.id, tagIds: newIds, expectedUpdatedAt: selectedEvent.value.updatedAt })
  } catch {
    toast.error('移除标签失败')
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
    toast.error('创建标签失败')
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
      finishCluster(); active = []; cluster = [];
      clusterEndHour = -Infinity; clusterLaneCount = 1
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

// 原生 datetime-local input 桥接
const detailStartAtInput = computed({
  get: () => detailStartAt.value ? detailStartAt.value.format('YYYY-MM-DDTHH:mm') : '',
  set: (v) => { detailStartAt.value = v ? dayjs(v) : null },
})
const detailEndAtInput = computed({
  get: () => detailEndAt.value ? detailEndAt.value.format('YYYY-MM-DDTHH:mm') : '',
  set: (v) => { detailEndAt.value = v ? dayjs(v) : null },
})

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
    toast.error('创建日程失败')
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
    toast.error('保存日程失败')
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
    toast.error('保存失败')
  }
}

async function confirmDelete() {
  if (!pendingDelete.value) return
  try {
    await planning.deleteCalendarEvent(pendingDelete.value.id)
    selectedEventId.value = null
    pendingDelete.value = null
    toast.success('日程已删除')
  } catch {
    toast.error('删除日程失败')
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
    toast.error('创建分组失败：名称可能已存在')
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
    toast.error('重命名分组失败：名称可能已存在')
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
    toast.error('删除分组失败')
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
    toast.error('更新颜色失败')
  }
}
</script>

<style>
@keyframes tooltipFadeIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>