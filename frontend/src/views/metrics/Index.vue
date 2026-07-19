<template>
  <div class="metrics-page">
    <!-- 顶部说明 -->
    <a-card class="header-card" :bordered="false">
      <div class="header-row">
        <div class="header-info">
          <h2 class="header-title">
            <BarChartOutlined class="header-icon" />
            使用统计
          </h2>
          <p class="header-desc">
            LLM 调用量、Token 消耗与费用分析。数据来自每次问答与助手调用的实时记录。
          </p>
        </div>
        <a-space>
          <a-select
            v-model:value="selectedFolderId"
            style="width: 200px"
            placeholder="全部文件夹"
            allow-clear
            @change="loadAll"
          >
            <a-select-option :value="null">全部文件夹</a-select-option>
            <a-select-option v-for="f in folderList" :key="f.id" :value="f.id">
              {{ shortenPath(f.path) }}
            </a-select-option>
          </a-select>
          <a-button @click="loadAll" :loading="loading">
            <template #icon><ReloadOutlined /></template>
            刷新
          </a-button>
        </a-space>
      </div>
    </a-card>

    <!-- KPI 卡片 -->
    <a-card class="kpi-card-wrapper" :bordered="false">
      <div v-if="loading" class="kpi-grid">
        <a-skeleton-input v-for="i in 4" :key="i" active size="large" style="width: 100%; height: 120px" />
      </div>
      <div v-else-if="overview" class="kpi-grid">
        <div class="kpi-card kpi-card--blue">
          <div class="kpi-card__icon">
            <ThunderboltOutlined />
          </div>
          <div class="kpi-card__label">今日调用次数</div>
          <div class="kpi-card__value">{{ formatNumber(overview.today.totalRequests) }}</div>
          <div class="kpi-card__sub">
            7日 {{ formatNumber(overview.last7Days.totalRequests) }} ·
            30日 {{ formatNumber(overview.last30Days.totalRequests) }}
          </div>
        </div>
        <div class="kpi-card kpi-card--teal">
          <div class="kpi-card__icon">
            <FieldNumberOutlined />
          </div>
          <div class="kpi-card__label">今日 Token 消耗</div>
          <div class="kpi-card__value">{{ formatNumber(overview.today.totalTokens) }}</div>
          <div class="kpi-card__sub">
            7日 {{ formatNumber(overview.last7Days.totalTokens) }} ·
            30日 {{ formatNumber(overview.last30Days.totalTokens) }}
          </div>
        </div>
        <div class="kpi-card kpi-card--amber">
          <div class="kpi-card__icon">
            <DollarOutlined />
          </div>
          <div class="kpi-card__label">今日费用（元）</div>
          <div class="kpi-card__value">{{ formatCost(overview.today.totalCost) }}</div>
          <div class="kpi-card__sub">
            7日 {{ formatCost(overview.last7Days.totalCost) }} ·
            30日 {{ formatCost(overview.last30Days.totalCost) }}
          </div>
        </div>
        <div class="kpi-card kpi-card--green">
          <div class="kpi-card__icon">
            <CheckCircleOutlined />
          </div>
          <div class="kpi-card__label">今日成功率</div>
          <div class="kpi-card__value">{{ formatPercent(overview.today.successRate) }}</div>
          <div class="kpi-card__sub">
            7日 {{ formatPercent(overview.last7Days.successRate) }} ·
            30日 {{ formatPercent(overview.last30Days.successRate) }}
          </div>
        </div>
      </div>
      <a-empty v-else description="暂无数据" />
    </a-card>

    <!-- 趋势图 -->
    <a-card class="section-card" :bordered="false" title="调用趋势（近30天）">
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
              <line
                v-for="(gy, gi) in trendChart.gridYs"
                :key="'g' + gi"
                :x1="0" :y1="gy" :x2="900" :y2="gy"
                stroke="#f1f5f9" stroke-width="1"
              />
              <path :d="trendChart.requestArea" fill="url(#trendGradBlue)" />
              <path :d="trendChart.tokenArea" fill="url(#trendGradTeal)" />
              <polyline
                :points="trendChart.requestPoints"
                fill="none" stroke="#3b82f6" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round"
              />
              <polyline
                :points="trendChart.tokenPoints"
                fill="none" stroke="#14b8a6" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round"
              />
              <circle
                :cx="trendChart.lastX" :cy="trendChart.lastYRequest" r="4"
                fill="#fff" stroke="#3b82f6" stroke-width="2.5"
              />
              <circle
                :cx="trendChart.lastX" :cy="trendChart.lastYToken" r="4"
                fill="#fff" stroke="#14b8a6" stroke-width="2.5"
              />
            </svg>
            <div class="trend-x-labels">
              <span
                v-for="(xl, xi) in trendChart.xLabels"
                :key="xi"
                :style="{ left: (xl.x / 900) * 100 + '%' }"
              >{{ xl.label }}</span>
            </div>
          </div>
        </div>
      </div>
      <a-empty v-else description="暂无趋势数据" />
    </a-card>

    <!-- 模块分布 + 详细统计 -->
    <a-row :gutter="16" class="detail-row">
      <a-col :span="24">
        <a-card class="section-card" :bordered="false" title="模块用量分布">
          <a-empty v-if="!moduleDistribution || moduleDistribution.length === 0" description="暂无数据" />
          <div v-else class="module-distribution">
            <div
              v-for="item in moduleDistribution"
              :key="item.module"
              class="module-bar"
            >
              <div class="module-bar__label">
                <span class="module-bar__name">{{ moduleLabel(item.module) }}</span>
                <span class="module-bar__count">{{ formatNumber(item.requests) }} 次</span>
              </div>
              <a-progress
                :percent="computePercent(item.requests, totalModuleRequests)"
                :stroke-color="moduleColor(item.module)"
                :show-info="true"
                size="small"
              />
              <div class="module-bar__meta">
                <span>{{ formatNumber(item.totalTokens) }} token</span>
                <span>{{ formatCost(item.cost) }} 元</span>
              </div>
            </div>
          </div>
        </a-card>
      </a-col>
      <a-col :span="24">
        <a-card class="section-card" :bordered="false" title="周期统计明细">
          <a-table
            :columns="statsColumns"
            :data-source="statsTableData"
            :pagination="false"
            size="middle"
            row-key="period"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'period'">
                <a-tag :color="periodColor(record.period)">{{ periodLabel(record.period) }}</a-tag>
              </template>
              <template v-else-if="column.key === 'successRate'">
                <a-tag :color="record.successRate >= 95 ? 'green' : record.successRate >= 80 ? 'orange' : 'red'">
                  {{ formatPercent(record.successRate) }}
                </a-tag>
              </template>
              <template v-else-if="column.key === 'avgLatencyMs'">
                {{ Math.round(record.avgLatencyMs) }}ms
              </template>
            </template>
          </a-table>
        </a-card>
      </a-col>
    </a-row>

    <!-- 文件夹用量排行 -->
    <a-card class="section-card" :bordered="false" title="文件夹用量统计">
      <a-empty v-if="folderStatsList.length === 0" description="暂无文件夹统计数据" />
      <a-table
        v-else
        :columns="folderColumns"
        :data-source="folderStatsList"
        :pagination="false"
        :loading="folderStatsLoading"
        size="middle"
        row-key="folderId"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'folderPath'">
            <span :title="record.folderPath">{{ shortenPath(record.folderPath) }}</span>
          </template>
          <template v-else-if="column.key === 'successRate'">
            <a-tag :color="record.successRate >= 95 ? 'green' : record.successRate >= 80 ? 'orange' : 'red'">
              {{ formatPercent(record.successRate) }}
            </a-tag>
          </template>
        </template>
      </a-table>
    </a-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { message } from 'ant-design-vue';
import {
  BarChartOutlined,
  ThunderboltOutlined,
  FieldNumberOutlined,
  DollarOutlined,
  CheckCircleOutlined,
  ReloadOutlined,
} from '@ant-design/icons-vue';
import { ipcApiRoute } from '@/api';
import { ipc } from '@/utils/ipcRenderer';

// ========== 状态 ==========
const loading = ref(false);
const folderStatsLoading = ref(false);
const overview = ref(null);
const moduleDistribution = ref([]);
const folderList = ref([]);
const folderStatsList = ref([]);
const selectedFolderId = ref(null);

// ========== 表格列定义 ==========
const statsColumns = [
  { title: '周期', key: 'period', width: 120 },
  { title: '调用次数', dataIndex: 'totalRequests', key: 'totalRequests', align: 'right' },
  { title: '输入 Token', dataIndex: 'promptTokens', key: 'promptTokens', align: 'right' },
  { title: '输出 Token', dataIndex: 'completionTokens', key: 'completionTokens', align: 'right' },
  { title: '总 Token', dataIndex: 'totalTokens', key: 'totalTokens', align: 'right' },
  { title: '费用（元）', key: 'totalCost', align: 'right' },
  { title: '平均耗时', key: 'avgLatencyMs', align: 'right' },
  { title: '成功率', key: 'successRate', align: 'center', width: 100 },
];

const folderColumns = [
  { title: '文件夹', key: 'folderPath', width: 280, ellipsis: true },
  { title: '调用次数', dataIndex: 'totalRequests', key: 'totalRequests', align: 'right' },
  { title: '总 Token', dataIndex: 'totalTokens', key: 'totalTokens', align: 'right' },
  { title: '费用（元）', key: 'totalCost', align: 'right' },
  { title: '平均耗时', key: 'avgLatencyMs', align: 'right' },
  { title: '成功率', key: 'successRate', align: 'center', width: 100 },
];

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
      message.error(res.message || '加载概览数据失败');
    }
  } catch (err) {
    console.error('[metrics] 加载概览失败:', err);
    message.error('加载概览数据失败');
  } finally {
    loading.value = false;
  }
}

async function loadFolderStats() {
  folderStatsLoading.value = true;
  try {
    // 为每个文件夹并行查询用量统计
    const tasks = folderList.value.map(async (folder) => {
      try {
        const res = await ipc.invoke(ipcApiRoute.qa.metricsOperation, {
          action: 'folderStats',
          folderId: folder.id,
          period: '30d',
        });
        if (res.code === 0 && res.data) {
          return {
            folderId: folder.id,
            folderPath: folder.path,
            ...res.data,
          };
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
  } finally {
    folderStatsLoading.value = false;
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
  const map = {
    QA: '知识问答',
    ASSISTANT: '智能助手',
  };
  return map[module] || module;
}

function moduleColor(module) {
  const map = {
    QA: '#3b82f6',
    ASSISTANT: '#14b8a6',
  };
  return map[module] || '#1677ff';
}

function periodLabel(period) {
  const map = {
    today: '今天',
    '7d': '近7天',
    '30d': '近30天',
    all: '全部',
  };
  return map[period] || period;
}

function periodColor(period) {
  const map = {
    today: 'blue',
    '7d': 'cyan',
    '30d': 'geekblue',
    all: 'purple',
  };
  return map[period] || 'default';
}

function computePercent(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

// ========== 生命周期 ==========
onMounted(async () => {
  await loadFolderList();
  await loadAll();
});
</script>

<style lang="less" scoped>
.metrics-page {
  height: 100%;
  overflow: auto;
  padding: 16px;
  background: #f5f6f8;
}

.header-card {
  margin-bottom: 12px;
  border-radius: 8px;

  .header-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }

  .header-info {
    flex: 1;
  }

  .header-title {
    font-size: 18px;
    font-weight: 600;
    margin: 0 0 6px 0;
    display: flex;
    align-items: center;
    gap: 8px;

    .header-icon {
      color: #1677ff;
    }
  }

  .header-desc {
    color: #888;
    font-size: 13px;
    margin: 0;
  }
}

.kpi-card-wrapper {
  margin-bottom: 12px;
  border-radius: 8px;
}

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

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
  }

  &::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
  }

  &--blue::after {
    background: linear-gradient(90deg, #3b82f6, #60a5fa);
  }
  &--teal::after {
    background: linear-gradient(90deg, #14b8a6, #5eead4);
  }
  &--amber::after {
    background: linear-gradient(90deg, #f59e0b, #fbbf24);
  }
  &--green::after {
    background: linear-gradient(90deg, #22c55e, #4ade80);
  }

  &__icon {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 12px;
    font-size: 18px;
  }

  &--blue .kpi-card__icon {
    background: #eff6ff;
    color: #3b82f6;
  }
  &--teal .kpi-card__icon {
    background: #f0fdfa;
    color: #14b8a6;
  }
  &--amber .kpi-card__icon {
    background: #fffbeb;
    color: #f59e0b;
  }
  &--green .kpi-card__icon {
    background: #f0fdf4;
    color: #22c55e;
  }

  &__label {
    font-size: 13px;
    font-weight: 500;
    color: #888;
  }

  &__value {
    font-size: 26px;
    font-weight: 700;
    color: #2c3e50;
    margin-top: 4px;
    font-variant-numeric: tabular-nums;
  }

  &__sub {
    font-size: 11px;
    color: #aaa;
    margin-top: 6px;
  }
}

.section-card {
  margin-bottom: 12px;
  border-radius: 8px;
}

.detail-row {
  margin-bottom: 0 !important;
}

// ========== 趋势图 ==========
.trend-chart-area {
  display: flex;
  flex-direction: column;
}

.trend-legend {
  display: flex;
  gap: 24px;
  margin-bottom: 16px;

  &__item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: #666;
  }

  &__dot {
    width: 10px;
    height: 10px;
    border-radius: 3px;

    &--blue {
      background: #3b82f6;
    }
    &--teal {
      background: #14b8a6;
    }
  }
}

.trend-chart-body {
  display: flex;
  gap: 12px;
}

.trend-y-axis {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding-bottom: 22px;
  min-width: 40px;
  text-align: right;
  font-size: 11px;
  color: #999;
}

.trend-svg-wrap {
  flex: 1;
  position: relative;
}

.trend-svg {
  width: 100%;
  height: 220px;
  display: block;
}

.trend-x-labels {
  position: relative;
  margin-top: 6px;
  font-size: 10px;
  color: #999;
  height: 16px;

  span {
    position: absolute;
    transform: translateX(-50%);
    white-space: nowrap;
  }
}

// ========== 模块分布 ==========
.module-distribution {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.module-bar {
  &__label {
    display: flex;
    justify-content: space-between;
    margin-bottom: 4px;

    .module-bar__name {
      font-size: 13px;
      font-weight: 500;
      color: #2c3e50;
    }

    .module-bar__count {
      font-size: 12px;
      color: #888;
    }
  }

  &__meta {
    display: flex;
    justify-content: space-between;
    margin-top: 4px;
    font-size: 11px;
    color: #aaa;
  }
}

@media (max-width: 1024px) {
  .kpi-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 640px) {
  .kpi-grid {
    grid-template-columns: 1fr;
  }
}
</style>
