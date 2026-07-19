/**
 * Assistant 记忆摘要 Prompt 模板
 *
 * 参考 ArgusRAG 的 prompts/assistant/*.st 模板。
 * 三类摘要的 prompt 模板：
 *   - session-memory-update：更新会话记忆
 *   - session-compact-summary：生成紧凑摘要
 *   - runtime-compact-summary：运行时压缩上下文
 */

/**
 * 会话记忆更新 prompt。
 *
 * 输入：
 *   - existingSessionMemory：现有会话记忆
 *   - newMessages：新增消息（格式化的 [角色] 内容）
 *   - currentToolMode：当前工具模式
 *   - currentFolderId：当前文件夹 ID
 */
export function buildSessionMemoryPrompt(
  existingSessionMemory: string,
  newMessages: string,
  currentToolMode: string,
  currentFolderId: string
): string {
  return [
    '你负责更新 assistant 会话的 session memory。',
    '',
    '',
    '输入：',
    '- 现有 session memory：',
    '【existing-session-memory-begin】',
    existingSessionMemory,
    '【existing-session-memory-end】',
    '- 新增消息：',
    '【new-messages-begin】',
    newMessages,
    '【new-messages-end】',
    `- 当前工具模式：${currentToolMode}`,
    `- 当前 folderId：${currentFolderId}`,
    '',
    '输出要求：',
    '- 只输出新的 session memory 正文',
    '- 保留当前会话主线、已确认事实、已确认决策、当前焦点问题、未决问题',
    '- 不要输出解释、标题外包装或 Markdown 代码块',
  ].join('\n');
}

/**
 * 紧凑摘要生成 prompt。
 *
 * 输入：
 *   - existingCompactSummary：现有紧凑摘要
 *   - sessionMemory：当前会话记忆
 *   - messagesToCompact：待压缩的历史消息
 */
export function buildCompactSummaryPrompt(
  existingCompactSummary: string,
  sessionMemory: string,
  messagesToCompact: string
): string {
  return [
    '你负责生成 assistant 会话的 compact summary。',
    '',
    '输入：',
    '- 现有 compact summary：',
    '【existing-compact-summary-begin】',
    existingCompactSummary,
    '【existing-compact-summary-end】',
    '- session memory：',
    '【session-memory-begin】',
    sessionMemory,
    '【session-memory-end】',
    '- 待压缩历史消息：',
    '【messages-to-compact-begin】',
    messagesToCompact,
    '【messages-to-compact-end】',
    '',
    '输出要求：',
    '- 只输出新的 compact summary 正文',
    '- 覆盖用户目标、关键进展、关键结论、未解决问题',
    '- 不要输出解释、标题外包装或 Markdown 代码块',
  ].join('\n');
}

/**
 * 运行时压缩上下文 prompt。
 *
 * 输入：
 *   - compactSummary：紧凑摘要
 *   - sessionMemory：会话记忆
 *   - recentMessages：最近消息窗口
 *   - currentQuestion：当前问题
 */
export function buildRuntimeCompactPrompt(
  compactSummary: string,
  sessionMemory: string,
  recentMessages: string,
  currentQuestion: string
): string {
  return [
    '你负责对一次模型调用前的运行时上下文做临时压缩。',
    '',
    '输入：',
    '- compact summary：',
    '【compact-summary-begin】',
    compactSummary,
    '【compact-summary-end】',
    '- session memory：',
    '【session-memory-begin】',
    sessionMemory,
    '【session-memory-end】',
    '- 最近消息窗口：',
    '【recent-messages-begin】',
    recentMessages,
    '【recent-messages-end】',
    '- 当前问题：',
    '【current-question-begin】',
    currentQuestion,
    '【current-question-end】',
    '',
    '输出要求：',
    '- 只输出本轮调用可直接使用的压缩上下文',
    '- 优先保留当前问题直接相关的信息',
    '- 不要输出解释、标题外包装或 Markdown 代码块',
  ].join('\n');
}
