/**
 * 任务进度聚合工具
 *
 * 移植自 Proma 的 task-progress.ts
 * 从消息 blocks 中的 TaskCreate / TaskUpdate 工具调用提取并聚合任务状态，
 * 供 TaskProgressCard 组件展示。
 */

/** 任务状态类型 */
// 'pending' | 'in_progress' | 'completed' | 'blocked' | 'cancelled' | 'error' | 'deleted'

/** 任务项 */
// { id, subject, status, activeForm? }

/** 判断是否为终态 */
export function isTerminalTaskStatus(status) {
  return status === 'completed' || status === 'cancelled' || status === 'error' || status === 'deleted'
}

/** 安全解析 JSON 对象 */
function parseJsonObject(text) {
  if (!text) return null
  const trimmed = typeof text === 'string' ? text.trim() : ''
  if (!trimmed) return null
  try {
    const parsed = JSON.parse(trimmed)
    return (typeof parsed === 'object' && parsed !== null) ? parsed : null
  } catch {
    return null
  }
}

/** 从工具结果中提取文本内容 */
function extractToolResultText(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return undefined
  const text = content
    .map((block) => {
      if (typeof block !== 'object' || block === null) return ''
      return typeof block.text === 'string' ? block.text : ''
    })
    .join('')
  return text || undefined
}

/** 解析 TaskCreate 工具结果，提取 taskId 和 subject */
function parseTaskCreateResult(result) {
  if (!result) return null

  // Pi SDK 的工具结果可能是 { content: [{ type: 'text', text: '...' }] } 格式
  // 需要先提取 text 字段，再解析 JSON
  let rawText
  if (typeof result === 'string') {
    rawText = result
  } else if (result && typeof result === 'object') {
    // SDK 格式: { content: [{ type: 'text', text: '...' }] }
    if (Array.isArray(result.content)) {
      rawText = result.content
        .map((b) => (b && typeof b.text === 'string') ? b.text : '')
        .join('')
    } else {
      // 可能是直接的对象 { task: { id, subject } }
      rawText = JSON.stringify(result)
    }
  }

  if (!rawText) return null
  const json = parseJsonObject(rawText)
  const task = json?.task
  if (task && (typeof task.id === 'string' || typeof task.id === 'number')) {
    return {
      id: String(task.id),
      subject: typeof task.subject === 'string' ? task.subject : undefined,
    }
  }
  return null
}

/** 将未知值转为状态字符串 */
function toTaskStatus(value, fallback = 'pending') {
  const valid = ['pending', 'in_progress', 'completed', 'blocked', 'cancelled', 'error', 'deleted']
  if (typeof value === 'string' && valid.includes(value)) return value
  return fallback
}

/** 将未知值转为字符串 ID */
function stringId(value) {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return undefined
}

/** 从 TaskUpdate input 中提取 taskId */
function taskIdFromInput(input) {
  if (!input || typeof input !== 'object') return undefined
  return stringId(input.taskId ?? input.task_id ?? input.id)
}

/**
 * 从消息 blocks 中提取并聚合所有任务项的最新状态
 *
 * 策略：
 * 1. TaskCreate 读取结构化输出 { task: { id, subject } }
 * 2. TaskUpdate 通过 taskId 更新已有条目
 *
 * @param {Array} blocks - 消息 blocks 数组（含 tool_use 类型块）
 * @param {boolean} streamEnded - 流式是否已结束（用于停止 in_progress 任务的 spinner）
 * @returns {Array} 任务项数组
 */
export function aggregateTaskItems(blocks, streamEnded = false) {
  if (!blocks || !Array.isArray(blocks)) return []

  // 只处理 tool_use 类型的块
  const toolBlocks = blocks.filter((b) => b && b.type === 'tool_use')
  if (toolBlocks.length === 0) return []

  const taskMap = new Map()
  // toolUseId → taskId 映射（TaskCreate 的结果可能延迟到达）
  const createIdMap = new Map()
  // taskId → subject 映射（从 TaskCreate 结果中提取）
  const createSubjectMap = new Map()

  // 第一轮：处理所有 TaskCreate，建立 ID 映射
  for (const block of toolBlocks) {
    if (block.name !== 'TaskCreate') continue

    const input = block.input && typeof block.input === 'object' ? block.input : {}
    const parsedResult = parseTaskCreateResult(block.result)
    const taskId = parsedResult?.id ?? block.toolCallId ?? `task-${Date.now()}`
    if (block.toolCallId) {
      createIdMap.set(block.toolCallId, taskId)
    }
    if (parsedResult?.subject) {
      createSubjectMap.set(taskId, parsedResult.subject)
    }
  }

  // 第二轮：聚合所有任务
  for (const block of toolBlocks) {
    if (block.name === 'TaskCreate') {
      const id = (block.toolCallId && createIdMap.get(block.toolCallId)) || block.toolCallId || `task-${Date.now()}`
      const input = block.input && typeof block.input === 'object' ? block.input : {}
      const subject = typeof input.subject === 'string'
        ? input.subject
        : createSubjectMap.get(id)
          ?? (typeof input.description === 'string' ? input.description : '未命名任务')

      taskMap.set(id, {
        id,
        subject,
        status: 'pending',
        activeForm: typeof input.activeForm === 'string' ? input.activeForm : undefined,
      })
    } else if (block.name === 'TaskUpdate') {
      const input = block.input && typeof block.input === 'object' ? block.input : {}
      const taskId = taskIdFromInput(input)
      if (!taskId) continue

      const existing = taskMap.get(taskId)
      const status = toTaskStatus(input.status, existing?.status ?? 'pending')

      if (existing) {
        taskMap.set(taskId, {
          ...existing,
          status,
          ...(typeof input.subject === 'string' && { subject: input.subject }),
          ...(typeof input.activeForm === 'string' && { activeForm: input.activeForm }),
        })
      } else {
        // TaskUpdate 在 TaskCreate 之前到达（跨 turn 回溯），创建占位条目
        taskMap.set(taskId, {
          id: taskId,
          subject: typeof input.subject === 'string' ? input.subject : `任务 #${taskId}`,
          status,
          activeForm: typeof input.activeForm === 'string' ? input.activeForm : undefined,
        })
      }
    }
  }

  // 过滤已删除的任务
  let items = Array.from(taskMap.values()).filter((t) => t.status !== 'deleted')

  // 流式结束后，将 in_progress 状态回退为 pending
  if (streamEnded) {
    items = items.map((t) =>
      t.status === 'in_progress' ? { ...t, status: 'pending' } : t
    )
  }

  return items
}

/**
 * 判断 blocks 中是否包含任务工具调用
 */
export function hasTaskBlocks(blocks) {
  if (!blocks || !Array.isArray(blocks)) return false
  const result = blocks.some((b) => b && b.type === 'tool_use' && (b.name === 'TaskCreate' || b.name === 'TaskUpdate'))
  if (result) {
    console.log('[hasTaskBlocks] 检测到任务块, blocks:', blocks.filter(b => b?.name === 'TaskCreate' || b?.name === 'TaskUpdate').map(b => ({ name: b.name, input: b.input })))
  }
  return result
}
