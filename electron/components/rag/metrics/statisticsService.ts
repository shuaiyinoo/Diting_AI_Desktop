/**
 * LLM 用量统计服务
 *
 * 参考 ArgusRAG 的 LlmUsageStatisticsService。
 * 提供聚合统计能力：今日概览、趋势、模块分布等。
 */

import { metricsDbService } from './metricsDb';
import type { DailyStatsRow, ModuleDistRow, UsageStatsRow } from './metricsDb';

/** 统计时间周期 */
export type StatsPeriod = 'today' | '7d' | '30d' | 'all';

/** 统计概览 VO */
export interface MetricsOverviewVO {
  today: UsageStatsRow;
  last7Days: UsageStatsRow;
  last30Days: UsageStatsRow;
  allTime: UsageStatsRow;
  dailyTrend: DailyStatsRow[];
  moduleDistribution: ModuleDistRow[];
}

class StatisticsService {
  /** 获取指定周期的统计 */
  getStats(period: StatsPeriod, folderId: number | null = null): UsageStatsRow {
    const since = getPeriodStartTime(period);
    return metricsDbService.selectUsageStats(since, folderId);
  }

  /** 获取仪表盘概览 */
  getOverview(folderId: number | null = null): MetricsOverviewVO {
    return {
      today: this.getStats('today', folderId),
      last7Days: this.getStats('7d', folderId),
      last30Days: this.getStats('30d', folderId),
      allTime: this.getStats('all', folderId),
      dailyTrend: metricsDbService.selectDailyTrend(getPeriodStartTime('30d'), null),
      moduleDistribution: metricsDbService.selectModuleDistribution(getPeriodStartTime('30d')),
    };
  }

  /** 获取每日趋势 */
  getDailyTrend(period: StatsPeriod, module: string | null = null): DailyStatsRow[] {
    return metricsDbService.selectDailyTrend(getPeriodStartTime(period), module);
  }

  /** 获取模块用量分布 */
  getModuleDistribution(period: StatsPeriod = '30d'): ModuleDistRow[] {
    return metricsDbService.selectModuleDistribution(getPeriodStartTime(period));
  }

  /** 获取指定文件夹的用量统计 */
  getFolderStats(folderId: number, period: StatsPeriod = '30d'): UsageStatsRow {
    return metricsDbService.selectUsageStats(getPeriodStartTime(period), folderId);
  }
}

export const statisticsService = new StatisticsService();

// ═══════════════════════════════════════════
// 辅助函数
// ═══════════════════════════════════════════

/** 将统计周期转换为 ISO 时间字符串 */
function getPeriodStartTime(period: StatsPeriod): string | null {
  if (period === 'all') return null;
  const now = new Date();
  switch (period) {
    case 'today':
      // 今日零点（本地时区）
      return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    case '7d':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    case '30d':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    default:
      return null;
  }
}
