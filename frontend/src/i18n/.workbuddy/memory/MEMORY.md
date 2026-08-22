# 项目长期笔记 — i18n 多语言适配 (Diting_AI_Desktop/frontend/src/i18n)

## 项目约定
- `zh-CN.js` 为翻译权威源，`en-US.js` 为英文参考。其余 14 种语言 JS 需与 zh-CN 逐键对齐。
- 每种语言目标 1336 个翻译单元（leaf），必须全量覆盖。

## 键化对象翻译工作流（已验证可复用）
1. 源串收集：`shared_uniqzh.json`(838 条) + `missing_supplement.json`(52 条) → 切批 `src_0..src_4.txt`（210/210/210/208/52 行）。
2. 逐批翻译写 `<lang>_t0..t4.txt`（行数须与 src 完全一致）。**batch 0 的 src_0.txt 第 209/210 行均为"发票号"重复串，译文末尾重复行不可省略。**
3. `assemble.cjs <lang> <i>`：按行 zip 注入 `<lang>_dict.json`（顺序无关，天然抗错位）；行数不等直接报错退出。
4. `expand2.cjs <lang>`：用 dict 展开 leftovers → `<lang>.json`（缺失回退中文）。
5. `gen.cjs <lang>`：读 `zh-CN.js` 模板逐键注入 → `<lang>.js`；打印 total/translated/engLeftover/zhLeftover/missing。
6. `check.cjs <lang>`：读生成的 `<lang>.js`，复刻 gen 回退规则，权威列出 eng/zh leftover。

## 残留检测与品牌词规则
- `gv===ev && gv!==zv` → 英文残留；`gv===zv && gv!==ev` → 中文残留；都不等 → 有效翻译。
- **合法保留英文/原形的品牌词**：Feishu, WeChat, DingTalk, SiliconFlow, Test, Model, cross, MCP, Diting, CLAUDE.md, Skills, OpenAI, SDK 等。
- ja 等语言 UI 词（保存/停止/最新/通信/小/中/大/低/高/最大/探索/管理/月/分/最小化/最大化）用与中文同形汉字，zhLeftover 多为合法。

## 行数验证铁律
- **校验翻译批次行数必须用 node `split('\n')` 精确计数，不可信 `wc -l`**——若文件末尾无换行符，`wc -l` 会少计最后一行，造成"少 1 行"的假象。
