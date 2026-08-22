# i18n 多语言翻译 — 完成报告

## 任务概述
以 `zh-CN.js` 为权威源、`en-US.js` 为英文参考，核对并翻译除 `en-US` 外的全部 **14 种语言**。

## 完成情况（全部完成）
每种语言精确覆盖 **1336 个翻译单元**，与中文源逐键对齐：

| 分组 | 语言 |
|------|------|
| 欧洲/拉丁 | de-DE, es-ES, fr-FR, it-IT, pt-BR, ru-RU, tr-TR |
| 东亚 | ja-JP, ko-KR, zh-TW（已完整，无需改动） |
| 中东/南亚/东南亚 | ar-SA, hi-IN, th-TH, vi-VN |

## 质量校验
- **16 个 JS 文件**（zh-CN 源 + en-US 参考 + 14 种目标）全部存在、可 `require` 加载，每个精确 **1336 leaf**。
- 各语言残留项均为**合法保留**：
  - 品牌词保留英文原形：`Feishu` / `WeChat` / `DingTalk` / `SiliconFlow` 等；
  - `subMenu.cross = "cross"` 保留；
  - `ja-JP` 部分 UI 词（保存/停止/最新/通信/小/中/大/低/高/最大/探索/管理等）与中文同形汉字。
- `missing = 0`，无未翻译键。

## 收尾清理（已完成）
- 删除 `_maps/` 临时中间文件：`src_*`、`batch_*`、`*_uniq*`、`*_tr_b1.json`、`*_tr_clean.json`、`missing_supplement.json`。
- 删除 `/tmp` 下全部本项目临时脚本。
- 最终 `.js` 产物保留在 `i18n/` 根目录；`_maps/` 剩余 `<lang>_dict.json` / `<lang>.json` / `<lang>_leftovers.json` / `<lang>_t*.txt` 作为可重生成的依据。

## 经验要点
- **行数验证铁律**：翻译批次文件若末尾无换行符，`wc -l` 会少计最后一行造成"少 1 行"假象；必须用 Node `split('\n')` 精确计数。
- **batch 0 重复行陷阱**：`src_0.txt` 第 209/210 行均为"发票号"，译文末尾的重复行不可省略，否则 `assemble.cjs` 报行数不符。

## 备注
本会话激活的 "Evan老师" 专家（英语学习）与翻译任务无关，已按真实意图完成软件本地化工作；如需英语学习能力，请告知。
