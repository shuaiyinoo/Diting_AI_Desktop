<template>
  <div class="metrics-page space-y-3 p-4">
    <!-- 顶部说明 -->
    <Card class="p-4">
      <div class="flex items-start justify-between">
        <div class="flex-1">
          <h2 class="mb-1.5 flex items-center gap-2 text-lg font-semibold">
            <BarChart3 class="text-primary" />
            使用统计
          </h2>
          <p class="m-0 text-sm text-muted-foreground">
            LLM 调用量、Token 消耗与费用分析。数据来自每次问答与助手调用的实时记录。
          </p>
        </div>
        <div class="flex items-center gap-2">
          <Select v-model="selectedFolderId" @update:model-value="loadAll">
            <SelectTrigger class="w-[200px]">
              <SelectValue :placeholder="t('metricsPage.allFolders')" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem :value="null">全部文件夹</SelectItem>
              <SelectItem v-for="f in folderList" :key="f.id" :value="f.id">
                {{ shortenPath(f.path) }}
              </SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" :disabled="loading" @click="loadAll">
            <RefreshCw class="mr-1 size-4" :class="{ 'animate-spin': loading }" />
            刷新
          </Button>
        </div>
      </div>
    </Card>

    <!-- KPI 卡片 -->
    <Card class="p-4">
      <div v-if="loading" class="kpi-grid">
        <div v-for="i in 4" :key="i" class="h-[120px] animate-pulse rounded-xl bg-muted" />
      </div>
      <div v-else-if="overview" class="kpi-grid">
        <div class="kpi-card kpi-card--blue">
          <div class="kpi-card__icon"><Zap /></div>
          <div class="kpi-card__label">今日调用次数</div>
          <div class="kpi-card__value">{{ formatNumber(overview.today.totalRequests) }}</div>
          <div class="kpi-card__sub">
            7日 {{ formatNumber(overview.last7Days.totalRequests) }} ·
            30日 {{ formatNumber(overview.last30Days.totalRequests) }}
          </div>
        </div>
        <div class="kpi-card kpi-card--teal">
          <div class="kpi-card__icon"><Hash /></div>
          <div class="kpi-card__label">今日 Token 消耗</div>
          <div class="kpi-card__value">{{ formatNumber(overview.today.totalTokens) }}</div>
          <div class="kpi-card__sub">
            7日 {{ formatNumber(overview.last7Days.totalTokens) }} ·
            30日 {{ formatNumber(overview.last30Days.totalTokens) }}
          </div>
        </div>
        <div class="kpi-card kpi-card--amber">
          <div class="kpi-card__icon"><DollarSign /></div>
          <div class="kpi-card__label">今日费用（元）</div>
          <div class="kpi-card__value">{{ formatCost(overview.today.totalCost) }}</div>
          <div class="kpi-card__sub">
            7日 {{ formatCost(overview.last7Days.totalCost) }} ·
            30日 {{ formatCost(overview.last30Days.totalCost) }}
          </div>
        </div>
        <div class="kpi-card kpi-card--green">
          <div class="kpi-card__icon"><CheckCircle2 /></div>
          <div class="kpi-card__label">今日成功率</div>
          <div class="kpi-card__value">{{ formatPercent(overview.today.successRate) }}</div>
          <div class="kpi-card__sub">
            7日 {{ formatPercent(overview.last7Days.successRate) }} ·
            30日 {{ formatPercent(overview.last30Days.successRate) }}
          </div>
        </div>
      </div>
      <div v-else class="py-8 text-center text-sm text-muted-foreground">暂无数据</div>
    </Card>

    <!-- 趋势图 -->
    <Card class="p-4">
      <h3 class="mb-3 text-base font-semibold">调用趋势（近30天）</h3>
      <div v-if="trendChart" class="trend-chart-area">
        <div class="trend-legend">
          <span class="trend-legend__item">
            <span class="trend-legend__dot trend-legend__dot--blue"></span>
            调用次数
          </span>
          <span class="trend-legend__item">
            <span class="trend-legend__dot trend-legend__dot--teal"></span>
            Token 消耗
          </span>
        </div>
        <div class="trend-chart-body">
          <div class="trend-y-axis">
            <span v-for="tick in trendChart.yTicks.slice().reverse()" :key="tick">
              {{ tick >= 10000 ? (tick / 1000).toFixed(0) + 'k' : tick.toLocaleString() }}
            </span>
          </div>
          <div class="trend-svg-wrap">
            <svg viewBox="0 0 900 220" preserveAspectRatio="none" class="trend-svg">
              <defs>
                <linearGradient id="trendGradBlue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.25" />
                  <stop offset="100%" stop-color="#3b82f6" stop-opacity="0.02" />
                </linearGradient>
                <linearGradient id="trendGradTeal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#14b8a6" stop-opacity="0.25" />
                  <stop offset="100%" stop-color="#14b8a6" stop-opacity="0.02" />
                </linearGradient>
              </defs>
              <line v-for="(gy, gi) in trendChart.gridYs" :key="'g' + gi" :x1="0" :y1="gy" :x2="900" :y2="gy" stroke="#f1f5f9" stroke-width="1" />
              <path :d="trendChart.requestArea" fill="url(#trendGradBlue)" />
              <path :d="trendChart.tokenArea" fill="url(#trendGradTeal)" />
              <polyline :points="trendChart.requestPoints" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              <polyline :points="trendChart.tokenPoints" fill="none" stroke="#14b8a6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              <circle :cx="trendChart.lastX" :cy="trendChart.lastYRequest" r="4" fill="#fff" stroke="#3b82f6" stroke-width="2.5" />
              <circle :cx="trendChart.lastX" :cy="trendChart.lastYToken" r="4" fill="#fff" stroke="#14b8a6" stroke-width="2.5" />
            </svg>
            <div class="trend-x-labels">
              <span v-for="(xl, xi) in trendChart.xLabels" :key="xi" :style="{ left: (xl.x / 900) * 100 + '%' }">{{ xl.label }}</span>
            </div>
          </div>
        </div>
      </div>
      <div v-else class="py-8 text-center text-sm text-muted-foreground">暂无趋势数据</div>
    </Card>

    <!-- 模块用量分布 -->
    <Card class="p-4">
      <h3 class="mb-3 text-base font-semibold">模块用量分布</h3>
      <div v-if="!moduleDistribution || moduleDistribution.length === 0" class="py-8 text-center text-sm text-muted-foreground">暂无数据</div>
      <div v-else class="module-distribution">
        <div v-for="item in moduleDistribution" :key="item.module" class="module-bar">
          <div class="module-bar__label">
            <span class="module-bar__name">{{ moduleLabel(item.module) }}</span>
            <span class="module-bar__count">{{ formatNumber(item.requests) }} 次</span>
          </div>
          <div class="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div class="h-full rounded-full transition-all" :style="{ width: computePercent(item.requests, totalModuleRequests) + '%', background: moduleColor(item.module) }" />
          </div>
          <div class="module-bar__meta">
            <span>{{ formatNumber(item.totalTokens) }} token</span>
            <span>{{ formatCost(item.cost) }} 元</span>
          </div>
        </div>
      </div>
    </Card>

    <!-- 周期统计明细 -->
    <Card class="p-4">
      <h3 class="mb-3 text-base font-semibold">周期统计明细</h3>
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b bg-muted/50">
            <th class="px-3 py-2 text-left font-medium">周期</th>
            <th class="px-3 py-2 text-right font-medium">调用次数</th>
            <th class="px-3 py-2 text-right font-medium">输入 Token</th>
            <th class="px-3 py-2 text-right font-medium">输出 Token</th>
            <th class="px-3 py-2 text-right font-medium">总 Token</th>
            <th class="px-3 py-2 text-right font-medium">费用（元）</th>
            <th class="px-3 py-2 text-right font-medium">平均耗时</th>
            <th class="px-3 py-2 text-center font-medium">成功率</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="record in statsTableData" :key="record.period" class="border-b hover:bg-muted/30">
            <td class="px-3 py-2"><Badge variant="secondary">{{ periodLabel(record.period) }}</Badge></td>
            <td class="px-3 py-2 text-right">{{ formatNumber(record.totalRequests) }}</td>
            <td class="px-3 py-2 text-right">{{ formatNumber(record.promptTokens) }}</td>
            <td class="px-3 py-2 text-right">{{ formatNumber(record.completionTokens) }}</td>
            <td class="px-3 py-2 text-right">{{ formatNumber(record.totalTokens) }}</td>
            <td class="px-3 py-2 text-right">{{ formatCost(record.totalCost) }}</td>
            <td class="px-3 py-2 text-right">{{ Math.round(record.avgLatencyMs) }}ms</td>
            <td class="px-3 py-2 text-center">
              <Badge :variant="record.successRate >= 95 ? 'default' : record.successRate >= 80 ? 'secondary' : 'destructive'">
                {{ formatPercent(record.successRate) }}
              </Badge>
            </td>
          </tr>
        </tbody>
      </table>
    </Card>

    <!-- 文件夹用量统计 -->
    <Card class="p-4">
      <h3 class="mb-3 text-base font-semibold">文件夹用量统计</h3>
      <div v-if="folderStatsList.length === 0" class="py-8 text-center text-sm text-muted-foreground">暂无文件夹统计数据</div>
      <div v-else>
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b bg-muted/50">
              <th class="px-3 py-2 text-left font-medium">文件夹</th>
              <th class="px-3 py-2 text-right font-medium">调用次数</th>
              <th class="px-3 py-2 text-right font-medium">总 Token</th>
              <th class="px-3 py-2 text-right font-medium">费用（元）</th>
              <th class="px-3 py-2 text-right font-medium">平均耗时</th>
              <th class="px-3 py-2 text-center font-medium">成功率</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="record in folderStatsList" :key="record.folderId" class="border-b hover:bg-muted/30">
              <td class="px-3 py-2" :title="record.folderPath">{{ shortenPath(record.folderPath) }}</td>
              <td class="px-3 py-2 text-right">{{ formatNumber(record.totalRequests) }}</td>
              <td class="px-3 py-2 text-right">{{ formatNumber(record.totalTokens) }}</td>
              <td class="px-3 py-2 text-right">{{ formatCost(record.totalCost) }}</td>
              <td class="px-3 py-2 text-right">{{ Math.round(record.avgLatencyMs) }}ms</td>
              <td class="px-3 py-2 text-center">
                <Badge :variant="record.successRate >= 95 ? 'default' : record.successRate >= 80 ? 'secondary' : 'destructive'">
                  {{ formatPercent(record.successRate) }}
                </Badge>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { toast } from 'vue-sonner';
import {
  BarChart3,
  Zap,
  Hash,
  DollarSign,
  CheckCircle2,
  RefreshCw,
} from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ipcApiRoute } from '@/api';
import { ipc } from '@/utils/ipcRenderer';
import { useI18n } from 'vue-i18n';

// ========== 状态 ==========
const { t } = useI18n();
const loading = ref(false);
const overview = ref(null);
const moduleDistribution = ref([]);
const folderList = ref([]);
const folderStatsList = ref([]);
const selectedFolderId = ref(null);

// ========== 计算属性 ==========
const totalModuleRequests = computed(() => {
  return moduleDistribution.value.reduce((sum, item) => sum + item.requests, 0) || 1;
});

const statsTableData = computed(() => {
  if (!overview.value) return [];
  return [
    { period: 'today', ...overview.value.today },
    { period: '7d', ...overview.value.last7Days },
    { period: '30d', ...overview.value.last30Days },
    { period: 'all', ...overview.value.allTime },
  ];
});

const trendChart = computed(() => {
  const trend = overview.value?.dailyTrend ?? [];
  if (trend.length === 0) return null;

  const CHART_WIDTH = 900;
  const CHART_HEIGHT = 220;
  const PAD_L = 8;
  const PAD_R = 8;
  const innerW = CHART_WIDTH - PAD_L - PAD_R;
  const maxVal = Math.max(
    ...trend.map((t) => t.requests),
    ...trend.map((t) => t.totalTokens),
    1
  );

  const toX = (i) => PAD_L + (i / Math.max(trend.length - 1, 1)) * innerW;
  const toY = (v) => CHART_HEIGHT - (v / maxVal) * CHART_HEIGHT;

  const requestPoints = trend.map((t, i) => `${toX(i)},${toY(t.requests)}`).join(' ');
  const tokenPoints = trend.map((t, i) => `${toX(i)},${toY(t.totalTokens)}`).join(' ');

  const lastItem = trend[trend.length - 1];
  if (!lastItem) return null;
  const lastX = toX(trend.length - 1);

  const requestArea = `M${toX(0)},${CHART_HEIGHT} L${requestPoints} L${lastX},${CHART_HEIGHT} Z`;
  const tokenArea = `M${toX(0)},${CHART_HEIGHT} L${tokenPoints} L${lastX},${CHART_HEIGHT} Z`;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxVal * f));

  const xLabels = [];
  const maxLabels = 8;
  const step = Math.max(1, Math.floor(trend.length / maxLabels));
  for (let i = 0; i < trend.length; i += step) {
    xLabels.push({ x: toX(i), label: formatDate(trend[i].date) });
  }
  if (xLabels.length > 0 && xLabels[xLabels.length - 1].x < lastX - 20) {
    xLabels.push({ x: lastX, label: formatDate(lastItem.date) });
  }

  return {
    requestPoints,
    tokenPoints,
    requestArea,
    tokenArea,
    yTicks,
    xLabels,
    lastX,
    lastYRequest: toY(lastItem.requests),
    lastYToken: toY(lastItem.totalTokens),
    gridYs: [0, 0.25, 0.5, 0.75, 1].map((f) => CHART_HEIGHT - f * CHART_HEIGHT),
  };
});

// ========== 数据加载 ==========
async function loadFolderList() {
  try {
    const data = await ipc.invoke(ipcApiRoute.file.getFolderList);
    folderList.value = data || [];
  } catch (err) {
    console.error('[metrics] 加载文件夹列表失败:', err);
  }
}

async function loadOverview() {
  loading.value = true;
  try {
    const res = await ipc.invoke(ipcApiRoute.qa.metricsOperation, {
      action: 'overview',
      folderId: selectedFolderId.value,
    });
    if (res.code === 0) {
      overview.value = res.data;
      moduleDistribution.value = res.data?.moduleDistribution || [];
    } else {
      toast.error(res.message || t('metricsPage.loadFailed'));
    }
  } catch (err) {
    console.error('[metrics] 加载概览失败:', err);
    toast.error(t('metricsPage.loadFailed'));
  } finally {
    loading.value = false;
  }
}

async function loadFolderStats() {
  try {
    const tasks = folderList.value.map(async (folder) => {
      try {
        const res = await ipc.invoke(ipcApiRoute.qa.metricsOperation, {
          action: 'folderStats',
          folderId: folder.id,
          period: '30d',
        });
        if (res.code === 0 && res.data) {
          return { folderId: folder.id, folderPath: folder.path, ...res.data };
        }
        return null;
      } catch {
        return null;
      }
    });
    const results = await Promise.all(tasks);
    folderStatsList.value = results.filter((r) => r && r.totalRequests > 0);
  } catch (err) {
    console.error('[metrics] 加载文件夹统计失败:', err);
  }
}

async function loadAll() {
  await Promise.all([loadOverview(), loadFolderStats()]);
}

// ========== 辅助函数 ==========
function formatNumber(n) {
  if (n === null || n === undefined) return '0';
  return Number(n).toLocaleString('zh-CN');
}

function formatCost(n) {
  if (n === null || n === undefined) return '0.0000';
  return Number(n).toFixed(4);
}

function formatPercent(n) {
  if (n === null || n === undefined) return '0.0%';
  return Number(n).toFixed(1) + '%';
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) return `${parts[1]}-${parts[2]}`;
  return dateStr;
}

function shortenPath(path) {
  if (!path) return '';
  if (path.length <= 40) return path;
  const parts = path.split('/');
  if (parts.length <= 2) return path;
  return '.../' + parts.slice(-2).join('/');
}

function moduleLabel(module) {
  const map = { QA: '知识问答', ASSISTANT: '智能助手' };
  return map[module] || module;
}

function moduleColor(module) {
  const map = { QA: '#3b82f6', ASSISTANT: '#14b8a6' };
  return map[module] || '#1677ff';
}

function periodLabel(period) {
  const map = { today: '今天', '7d': '近7天', '30d': '近30天', all: '全部' };
  return map[period] || period;
}

function computePercent(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

onMounted(async () => {
  await loadFolderList();
  await loadAll();
});
</script>

<style scoped>
.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.kpi-card {
  position: relative;
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  overflow: hidden;
  border: 1px solid #f0f0f0;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.kpi-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
}
.kpi-card::after {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 3px;
}
.kpi-card--blue::after { background: linear-gradient(90deg, #3b82f6, #60a5fa); }
.kpi-card--teal::after { background: linear-gradient(90deg, #14b8a6, #5eead4); }
.kpi-card--amber::after { background: linear-gradient(90deg, #f59e0b, #fbbf24); }
.kpi-card--green::after { background: linear-gradient(90deg, #22c55e, #4ade80); }

.kpi-card__icon {
  width: 36px; height: 36px;
  border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  margin-bottom: 12px; font-size: 18px;
}
.kpi-card--blue .kpi-card__icon { background: #eff6ff; color: #3b82f6; }
.kpi-card--teal .kpi-card__icon { background: #f0fdfa; color: #14b8a6; }
.kpi-card--amber .kpi-card__icon { background: #fffbeb; color: #f59e0b; }
.kpi-card--green .kpi-card__icon { background: #f0fdf4; color: #22c55e; }

.kpi-card__label { font-size: 13px; font-weight: 500; color: #888; }
.kpi-card__value { font-size: 26px; font-weight: 700; color: #2c3e50; margin-top: 4px; font-variant-numeric: tabular-nums; }
.kpi-card__sub { font-size: 11px; color: #aaa; margin-top: 6px; }

.trend-chart-area { display: flex; flex-direction: column; }
.trend-legend { display: flex; gap: 24px; margin-bottom: 16px; }
.trend-legend__item { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #666; }
.trend-legend__dot { width: 10px; height: 10px; border-radius: 3px; }
.trend-legend__dot--blue { background: #3b82f6; }
.trend-legend__dot--teal { background: #14b8a6; }
.trend-chart-body { display: flex; gap: 12px; }
.trend-y-axis { display: flex; flex-direction: column; justify-content: space-between; padding-bottom: 22px; min-width: 40px; text-align: right; font-size: 11px; color: #999; }
.trend-svg-wrap { flex: 1; position: relative; }
.trend-svg { width: 100%; height: 220px; display: block; }
.trend-x-labels { position: relative; margin-top: 6px; font-size: 10px; color: #999; height: 16px; }
.trend-x-labels span { position: absolute; transform: translateX(-50%); white-space: nowrap; }

.module-distribution { display: flex; flex-direction: column; gap: 16px; }
.module-bar__label { display: flex; justify-content: space-between; margin-bottom: 4px; }
.module-bar__name { font-size: 13px; font-weight: 500; color: #2c3e50; }
.module-bar__count { font-size: 12px; color: #888; }
.module-bar__meta { display: flex; justify-content: space-between; margin-top: 4px; font-size: 11px; color: #aaa; }

@media (max-width: 1024px) { .kpi-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 640px) { .kpi-grid { grid-template-columns: 1fr; } }
</style>
