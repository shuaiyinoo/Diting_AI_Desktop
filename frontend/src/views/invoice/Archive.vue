<template>
  <div class="flex h-full w-full flex-col overflow-hidden bg-background">
    <!-- ========== 顶部工具栏 ========== -->
    <div class="flex shrink-0 items-center gap-3 border-b border-border bg-card px-6 py-3">
      <div>
        <h1 class="m-0 text-base font-semibold text-foreground">归集查阅</h1>
        <p class="m-0 mt-0.5 text-xs text-muted-foreground">
          已归档票据 {{ store.archiveStats.total }} 张 · 待审核 {{ store.archiveStats.needsReview }} · 金额合计 ¥{{ formatAmount(store.archiveStats.totalAmount) }}
        </p>
      </div>
      <div class="ml-auto flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger as-child>
            <Button variant="outline" size="sm" class="gap-1.5" @click="onExport">
              <Download class="size-3.5" />
              导出报表
            </Button>
          </TooltipTrigger>
          <TooltipContent>导出为 CSV</TooltipContent>
        </Tooltip>
        <Button variant="default" size="sm" class="gap-1.5" @click="goToAgent">
          <Bot class="size-3.5" />
          咨询 Agent
        </Button>
      </div>
    </div>

    <!-- ========== 统计卡片 ========== -->
    <div class="grid shrink-0 grid-cols-3 gap-3 p-3.5">
      <div class="rounded-xl border border-border bg-card p-3.5">
        <div class="mb-1 text-xs text-muted-foreground">待审核</div>
        <div class="text-xl font-semibold text-foreground">
          {{ store.archiveStats.needsReview }}<small class="ml-0.5 text-xs font-normal text-muted-foreground">张</small>
        </div>
      </div>
      <div class="rounded-xl border border-border bg-card p-3.5">
        <div class="mb-1 text-xs text-muted-foreground">金额合计</div>
        <div class="text-xl font-semibold text-foreground">
          ¥{{ formatAmount(store.archiveStats.totalAmount) }}
        </div>
      </div>
      <div class="rounded-xl border border-border bg-card p-3.5">
        <div class="mb-1 text-xs text-muted-foreground">已归档</div>
        <div class="text-xl font-semibold text-foreground">
          {{ store.archiveStats.total }}<small class="ml-0.5 text-xs font-normal text-muted-foreground">张</small>
        </div>
      </div>
    </div>

    <!-- ========== 筛选栏 ========== -->
    <div class="flex shrink-0 items-center gap-2 border-y border-border bg-card px-3.5 py-2.5">
      <div class="relative w-72 max-w-[320px]">
        <Search class="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          v-model="searchKeyword"
          placeholder="搜索发票号 / 销售方 / 购买方..."
          class="h-8 pl-8 text-xs"
          @keyup.enter="onSearch"
        />
      </div>
      <div class="flex items-center gap-1.5">
        <button
          v-for="chip in filterChips"
          :key="chip.key"
          class="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors"
          :class="activeCategory === chip.key
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-border bg-card text-muted-foreground hover:bg-accent'"
          @click="onFilter(chip.key)"
        >
          {{ chip.label }}
          <span class="text-[10px] opacity-70">{{ chip.count }}</span>
        </button>
      </div>
    </div>

    <!-- ========== 表格列表 ========== -->
    <div class="flex-1 overflow-auto px-3.5 pb-3.5">
      <!-- 加载中 -->
      <div v-if="store.archiveLoading" class="flex h-full items-center justify-center">
        <Spinner size="sm" class="text-muted-foreground" />
      </div>

      <!-- 空状态 -->
      <div
        v-else-if="filteredRecords.length === 0"
        class="flex h-full flex-col items-center justify-center text-center text-muted-foreground"
      >
        <Archive class="mb-3 size-12 opacity-20" />
        <div class="text-sm font-medium text-foreground">暂无归档记录</div>
        <p class="mt-1 text-xs">在录入识读页面完成 AI 识别后归档，记录将在此处显示</p>
      </div>

      <!-- 表格 -->
      <Table v-else class="text-[11px]">
        <TableHeader>
          <TableRow class="hover:bg-transparent">
            <TableHead class="h-9 px-2 text-[10px] uppercase tracking-wide whitespace-nowrap" style="width: 100px;">类型</TableHead>
            <TableHead class="h-9 px-2 text-[10px] uppercase tracking-wide whitespace-nowrap" style="width: 120px;">发票号</TableHead>
            <TableHead class="h-9 px-2 text-[10px] uppercase tracking-wide whitespace-nowrap" style="width: 90px;">日期</TableHead>
            <TableHead class="h-9 px-2 text-right text-[10px] uppercase tracking-wide whitespace-nowrap" style="width: 100px;">金额</TableHead>
            <TableHead class="h-9 px-2 text-right text-[10px] uppercase tracking-wide whitespace-nowrap" style="width: 100px;">税额</TableHead>
            <TableHead class="h-9 px-2 text-[10px] uppercase tracking-wide whitespace-nowrap" style="width: 180px;">购买方/乘客</TableHead>
            <TableHead class="h-9 px-2 text-[10px] uppercase tracking-wide whitespace-nowrap" style="width: 180px;">销售方</TableHead>
            <TableHead class="h-9 px-2 text-[10px] uppercase tracking-wide whitespace-nowrap" style="width: 70px;">省份</TableHead>
            <TableHead class="h-9 px-2 text-[10px] uppercase tracking-wide whitespace-nowrap" style="width: 70px;">城市</TableHead>
            <TableHead class="h-9 px-2 text-right text-[10px] uppercase tracking-wide whitespace-nowrap" style="width: 200px;">摘要</TableHead>
            <TableHead class="h-9 px-2 text-right text-[10px] uppercase tracking-wide whitespace-nowrap" style="width: 150px;">状态</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow
            v-for="record in filteredRecords"
            :key="record.id"
            class="cursor-pointer"
            :data-state="selectedRecordId === record.id ? 'selected' : undefined"
            @click="onSelectRecord(record)"
          >
            <!-- 类型 -->
            <TableCell class="px-2 py-2">
              <span
                class="inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium"
                :class="getTypeClass(record.category)"
              >
                {{ record.type_name || record.category_display || '未知' }}
              </span>
            </TableCell>
            <!-- 发票号 -->
            <TableCell class="px-2 py-2 font-mono text-foreground">
              <div class="overflow-hidden text-ellipsis whitespace-nowrap">{{ record.invoice_number || '—' }}</div>
            </TableCell>
            <!-- 日期 -->
            <TableCell class="px-2 py-2 whitespace-nowrap text-muted-foreground">{{ formatDate(record.issue_date) }}</TableCell>
            <!-- 金额 -->
            <TableCell class="px-2 py-2 text-right whitespace-nowrap font-semibold text-foreground">
              <template v-if="record.amount_total != null">¥{{ formatAmount(record.amount_total) }}</template>
              <span v-else class="text-muted-foreground">—</span>
            </TableCell>
            <!-- 税额 -->
            <TableCell class="px-2 py-2 text-right whitespace-nowrap text-muted-foreground">
              <template v-if="record.amount_tax != null">¥{{ formatAmount(record.amount_tax) }}</template>
              <span v-else>—</span>
            </TableCell>
            <!-- 购买方/乘客 -->
            <TableCell class="px-2 py-2 max-w-[180px]">
              <div class="overflow-hidden text-ellipsis whitespace-nowrap text-foreground">{{ record.payer_name || '—' }}</div>
            </TableCell>
            <!-- 销售方 -->
            <TableCell class="px-2 py-2 max-w-[180px]">
              <div class="overflow-hidden text-ellipsis whitespace-nowrap text-muted-foreground">{{ record.payee_name || '—' }}</div>
            </TableCell>
            <!-- 省份 -->
            <TableCell class="px-2 py-2 whitespace-nowrap text-muted-foreground">{{ record.province || '—' }}</TableCell>
            <!-- 城市 -->
            <TableCell class="px-2 py-2 whitespace-nowrap text-muted-foreground">{{ record.city || '—' }}</TableCell>
            <!-- 摘要 -->
            <TableCell class="px-2 py-2 text-right">
              <div class="overflow-hidden text-ellipsis whitespace-nowrap text-foreground">{{ getSummary(record) }}</div>
            </TableCell>
            <!-- 状态 -->
            <TableCell class="px-2 py-2 text-right text-[10px] font-medium whitespace-nowrap">
              <span v-if="record.ai_needs_review === 1" class="text-amber-600">⚠ 待审核</span>
              <span v-else class="text-green-600">✓ 已核对</span>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>

    <!-- ========== 详情抽屉（右侧滑出面板） ========== -->
    <div v-if="selectedRecord" class="fixed inset-0 z-30 bg-black/[0.02] cursor-pointer" @click="closeDetail" />
    <aside
      v-if="selectedRecord"
      class="absolute right-3 top-3 bottom-3 z-40 flex w-[calc(66.66%-24px)] min-w-[500px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
    >
      <!-- 固定头部 -->
      <div class="shrink-0 border-b border-border/50 px-5 pb-4 pt-5">
        <div class="flex items-center gap-3">
          <div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Archive class="size-[18px]" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="overflow-hidden text-ellipsis whitespace-nowrap text-[15px] font-semibold text-foreground">{{ selectedRecord.type_name || selectedRecord.category_display || '票据详情' }}</div>
            <div class="mt-0.5 font-mono text-xs text-muted-foreground">{{ selectedRecord.invoice_number || selectedRecord.file_name || '—' }}</div>
          </div>
          <span v-if="selectedRecord.ai_needs_review === 1" class="shrink-0 rounded bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600">⚠ 待审核</span>
          <span v-else class="shrink-0 rounded bg-green-500/10 px-2 py-0.5 text-[11px] font-medium text-green-600">✓ 已核对</span>
        </div>
      </div>

      <!-- 可滚动内容 -->
      <div class="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overflow-x-hidden p-5">
        <!-- 基本信息区 -->
        <div class="flex flex-col gap-3">
          <h3 class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">基本信息</h3>
          <div class="overflow-hidden rounded-lg border border-border">
            <div
              v-for="(field, idx) in detailFields"
              :key="field.key"
              class="flex items-start gap-3 px-3.5 py-2.5"
              :class="idx < detailFields.length - 1 ? 'border-b border-border' : ''"
            >
              <span class="w-[80px] shrink-0 pt-px text-xs font-medium text-muted-foreground">{{ field.label }}</span>
              <span class="min-w-0 flex-1 break-words text-xs leading-relaxed text-foreground">{{ field.value || '—' }}</span>
            </div>
          </div>
        </div>

        <!-- AI 结构化数据区 -->
        <div v-if="parsedAiData" class="flex flex-col gap-3">
          <h3 class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">AI 结构化数据</h3>
          <div class="overflow-hidden rounded-lg border border-border">
            <div
              v-for="(item, idx) in flattenedAiItems"
              :key="item.key"
              class="flex items-start gap-3 px-3.5 py-2.5"
              :class="idx < flattenedAiItems.length - 1 ? 'border-b border-border' : ''"
            >
              <span class="w-[120px] shrink-0 pt-px text-xs font-medium text-muted-foreground">{{ item.key }}</span>
              <span class="min-w-0 flex-1 break-words text-xs leading-relaxed text-foreground">{{ item.value }}</span>
            </div>
          </div>
        </div>

        <!-- OCR 全文区 -->
        <div v-if="selectedRecord.ocr_text" class="flex flex-col gap-3">
          <h3 class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">OCR 全文</h3>
          <pre class="m-0 max-h-60 overflow-y-auto whitespace-pre-wrap break-all rounded-lg bg-accent p-3 text-[11px] leading-relaxed text-muted-foreground">{{ selectedRecord.ocr_text }}</pre>
        </div>
      </div>

      <!-- 底部操作栏 -->
      <div class="flex shrink-0 items-center gap-2 border-t border-border px-5 py-3">
        <Button variant="outline" size="sm" @click="onCopyOcr">复制全文</Button>
        <Button variant="outline" size="sm" @click="onCopyAi">复制 JSON</Button>
        <Button variant="default" size="sm" class="ml-auto gap-1.5" @click="onOpenFile">
          <FileText class="size-3.5" />
          打开原始文件
        </Button>
      </div>
    </aside>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'
import {
  Search, Download, Bot, Archive, FileText,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Spinner } from '@/components/ui/spinner'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table'
import { useInvoiceStore } from '@/stores/invoice'
import { useTabStore } from '@/stores/tab'

const router = useRouter()
const store = useInvoiceStore()
const tabStore = useTabStore()

// ========== 搜索与筛选 ==========
const searchKeyword = ref('')
const activeCategory = ref('')
const selectedRecord = ref(null)
const selectedRecordId = ref(null)

// 大类筛选 chips
const filterChips = computed(() => {
  const chips = [{ key: '', label: '全部', count: store.archiveStats.total }]
  for (const c of store.archiveStats.categoryCounts) {
    chips.push({
      key: c.category,
      label: c.category_display || c.category || '其他',
      count: c.count,
    })
  }
  return chips
})

// 前端二次过滤（与后端查询互补）
const filteredRecords = computed(() => {
  return store.archiveRecords
})

// ========== 搜索/筛选事件 ==========
let searchTimer = null

watch(searchKeyword, (val) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    loadData()
  }, 300)
})

function onSearch() {
  loadData()
}

function onFilter(category) {
  activeCategory.value = category
  loadData()
}

function loadData() {
  store.loadArchiveRecords({
    keyword: searchKeyword.value,
    category: activeCategory.value,
  })
  store.loadArchiveStats()
}

// ========== 详情 ==========
function onSelectRecord(record) {
  selectedRecord.value = record
  selectedRecordId.value = record.id
}

function closeDetail() {
  selectedRecord.value = null
  selectedRecordId.value = null
}

const parsedAiData = computed(() => {
  if (!selectedRecord.value?.ai_data) return null
  try {
    return JSON.parse(selectedRecord.value.ai_data)
  } catch {
    return null
  }
})

const flattenedAiItems = computed(() => {
  if (!parsedAiData.value) return []
  // 优先取 structured_data，否则直接展平
  const data = parsedAiData.value.structured_data || parsedAiData.value
  if (typeof data !== 'object' || data === null) return []
  const result = []
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      for (const [k2, v2] of Object.entries(value)) {
        if (typeof v2 !== 'object' || v2 === null) {
          result.push({ key: `${key}.${k2}`, value: formatAiValue(v2) })
        }
      }
    } else if (!Array.isArray(value)) {
      result.push({ key, value: formatAiValue(value) })
    }
  }
  return result
})

const detailFields = computed(() => {
  if (!selectedRecord.value) return []
  const r = selectedRecord.value
  return [
    { key: 'type_name', label: '票据类型', value: r.type_name },
    { key: 'category_display', label: '大类', value: r.category_display },
    { key: 'invoice_number', label: '发票号码', value: r.invoice_number },
    { key: 'invoice_code', label: '发票代码', value: r.invoice_code },
    { key: 'issue_date', label: '开票日期', value: r.issue_date },
    { key: 'amount_total', label: '价税合计', value: r.amount_total != null ? `¥${formatAmount(r.amount_total)}` : null },
    { key: 'amount_tax', label: '税额', value: r.amount_tax != null ? `¥${formatAmount(r.amount_tax)}` : null },
    { key: 'payer_name', label: '购买方/乘客', value: r.payer_name },
    { key: 'payee_name', label: '销售方', value: r.payee_name },
    { key: 'province', label: '省份', value: r.province },
    { key: 'city', label: '城市', value: r.city },
    { key: 'file_name', label: '文件名', value: r.file_name },
    { key: 'archived_at', label: '归档时间', value: formatDate(r.archived_at, true) },
    { key: 'ai_confidence', label: 'AI 置信度', value: r.ai_confidence != null ? `${(r.ai_confidence * 100).toFixed(1)}%` : null },
  ]
})

// ========== 工具方法 ==========
function formatAmount(val) {
  if (val == null) return '0.00'
  const n = Number(val)
  if (isNaN(n)) return '0.00'
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(val, withTime = false) {
  if (!val) return '—'
  try {
    const d = new Date(val)
    if (isNaN(d.getTime())) return val
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (withTime) {
      return `${date} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    }
    return date
  } catch {
    return val
  }
}

function getSummary(record) {
  const parts = []
  if (record.payer_name && record.payee_name) {
    parts.push(`${record.payer_name} → ${record.payee_name}`)
  } else if (record.payer_name) {
    parts.push(record.payer_name)
  } else if (record.payee_name) {
    parts.push(record.payee_name)
  }
  return parts.join(' · ') || record.file_name || '—'
}

function getTypeClass(category) {
  const map = {
    travel: 'bg-green-500/10 text-green-600',
    taxi: 'bg-amber-500/10 text-amber-700',
    invoice: 'bg-primary/10 text-primary',
  }
  return map[category] || 'bg-primary/10 text-primary'
}

function formatAiValue(val) {
  if (val == null) return '—'
  if (typeof val === 'boolean') return val ? '是' : '否'
  if (Array.isArray(val)) return JSON.stringify(val)
  return String(val)
}

// ========== 操作 ==========
function onExport() {
  if (store.archiveRecords.length === 0) {
    toast.warning('暂无可导出的记录')
    return
  }
  const headers = ['类型', '发票号', '开票日期', '金额', '税额', '购买方', '销售方', '省份', '城市', '文件名', '归档时间']
  const rows = store.archiveRecords.map(r => [
    r.type_name || '',
    r.invoice_number || '',
    r.issue_date || '',
    r.amount_total || '',
    r.amount_tax || '',
    r.payer_name || '',
    r.payee_name || '',
    r.province || '',
    r.city || '',
    r.file_name || '',
    r.archived_at || '',
  ])
  const csv = [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')
  // BOM 解决中文乱码
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `归档记录_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
  toast.success('已导出 CSV 文件')
}

function onCopyOcr() {
  const text = selectedRecord.value?.ocr_text || ''
  if (!text) {
    toast.warning('暂无 OCR 文本')
    return
  }
  navigator.clipboard.writeText(text)
  toast.success('已复制 OCR 全文')
}

function onCopyAi() {
  const text = selectedRecord.value?.ai_data || ''
  if (!text) {
    toast.warning('暂无 AI 数据')
    return
  }
  navigator.clipboard.writeText(text)
  toast.success('已复制 AI JSON')
}

function goToAgent() {
  router.push('/agent')
}

function onOpenFile() {
  if (!selectedRecord.value?.file_path) {
    toast.warning('该记录没有关联的原始文件')
    return
  }
  tabStore.openFileTab({
    name: selectedRecord.value.file_name || '文件',
    path: selectedRecord.value.file_path,
  })
  closeDetail()
}

// ========== 生命周期 ==========
onMounted(async () => {
  await loadData()
})
</script>
