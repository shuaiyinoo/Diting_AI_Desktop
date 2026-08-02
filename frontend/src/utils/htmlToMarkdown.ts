/**
 * HTML → Markdown 转换工具
 *
 * 移植自 Proma 的 htmlToMarkdown，简化为仅处理 TipTap 编辑器输出。
 * 核心功能：将 mention chip（<span data-type="mention">）序列化为
 * @file:path / /skill:slug / #mcp:name / &session:id::title 等标记格式。
 */

function escapeMarkdownText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/([`*_[\]<>|])/g, '\\$1')
    .replace(/^(\s*)([#>+-])(?=\s)/gm, '$1\\$2')
    .replace(/^(\s*)(\d+)\.(?=\s)/gm, '$1$2\\.')
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function serializeInlineCode(value: string): string {
  if (!value.includes('`')) return `\`${value}\``
  const fence = value.match(/`+/g)?.sort((a, b) => b.length - a.length)[0] ?? '`'
  const wrapper = `${fence}\``
  return `${wrapper} ${value} ${wrapper}`
}

function serializeNamedMention(
  prefix: '&session' | '&todo' | '&calendar_event',
  id: string,
  label: string | null,
): string {
  return label ? `${prefix}:${id}::${encodeURIComponent(label)}` : `${prefix}:${id}`
}

/**
 * 将 TipTap 输出的 HTML 转换为 Markdown 格式。
 *
 * 处理的节点类型：
 * - 段落 / 换行 / 加粗 / 斜体 / 删除线 / 下划线 / 代码
 * - 代码块 / 引用 / 标题 / 列表（含任务列表）
 * - 链接 / 图片
 * - **Mention chip**（@file / /skill / #mcp / &session）
 */
export function htmlToMarkdown(html: string): string {
  if (!html || html === '<p></p>') return ''

  const div = document.createElement('div')
  div.innerHTML = html

  function processNode(node: Node, context: 'normal' | 'code' = 'normal'): string {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || ''
      if (context === 'code') return text
      return escapeMarkdownText(text)
    }

    if (node.nodeType !== Node.ELEMENT_NODE) {
      return ''
    }

    const el = node as HTMLElement
    const tagName = el.tagName.toLowerCase()
    const childContext = tagName === 'pre' || tagName === 'code' ? 'code' : 'normal'
    const children = Array.from(el.childNodes).map((child) => processNode(child, childContext)).join('')

    switch (tagName) {
      case 'div':
        return children
      case 'p':
        return children + '\n\n'
      case 'br':
        return '\n'
      case 'strong':
      case 'b':
        return `**${children}**`
      case 'em':
      case 'i':
        return `*${children}*`
      case 'u':
        return `<u>${children}</u>`
      case 's':
      case 'strike':
      case 'del':
        return `~~${children}~~`
      case 'code': {
        if (el.parentElement?.tagName.toLowerCase() === 'pre') {
          return children
        }
        return serializeInlineCode(children)
      }
      case 'pre': {
        const codeEl = el.querySelector('code')
        const langClass = codeEl?.className || ''
        const langMatch = langClass.match(/language-(\S+)/)
        const lang = langMatch ? langMatch[1] : ''
        // 提取纯文本代码内容
        const codeContent = codeEl ? extractCodeText(codeEl) : children
        return `\`\`\`${lang}\n${codeContent}\n\`\`\`\n`
      }
      case 'a': {
        const href = el.getAttribute('href') || ''
        return `[${children}](${href})`
      }
      case 'ul': {
        if (el.getAttribute('data-type') === 'taskList') {
          return Array.from(el.children)
            .map((li) => {
              const checked = li.getAttribute('data-checked') === 'true' ? 'x' : ' '
              return `- [${checked}] ${processNode(li).trim()}`
            })
            .join('\n') + '\n'
        }
        return Array.from(el.children)
          .map((li) => `- ${processNode(li).trim()}`)
          .join('\n') + '\n'
      }
      case 'ol':
        return Array.from(el.children)
          .map((li, i) => `${i + 1}. ${processNode(li).trim()}`)
          .join('\n') + '\n'
      case 'li':
        return children
      case 'blockquote':
        return children
          .replace(/\n+$/, '')
          .split('\n')
          .map((line) => `> ${line}`)
          .join('\n') + '\n'
      case 'h1': return `# ${children}\n`
      case 'h2': return `## ${children}\n`
      case 'h3': return `### ${children}\n`
      case 'h4': return `#### ${children}\n`
      case 'h5': return `##### ${children}\n`
      case 'h6': return `###### ${children}\n`
      case 'hr': return '---\n'
      case 'span': {
        const dataType = el.getAttribute('data-type')
        const dataId = el.getAttribute('data-id') || ''
        const dataLabel = el.getAttribute('data-label')
        const suggestionChar = el.getAttribute('data-mention-suggestion-char') || '@'
        const referenceType = el.getAttribute('data-mention-reference-type')
        const hasMentionClass = el.className && el.className.includes('mention-chip')
        // data-type 为 mention，或带有 mention-chip class，或有非默认 suggestionChar
        if (dataType === 'mention' || hasMentionClass || suggestionChar !== '@') {
          if (referenceType === 'todo') return serializeNamedMention('&todo', dataId, dataLabel)
          if (referenceType === 'calendar_event') return serializeNamedMention('&calendar_event', dataId, dataLabel)
          if (suggestionChar === '/') return `/skill:${dataId}`
          if (suggestionChar === '#') return `#mcp:${dataId}`
          if (suggestionChar === '&') return serializeNamedMention('&session', dataId, dataLabel)
          return `@file:${dataId}`
        }
        return children
      }
      default:
        return children
    }
  }

  return processNode(div).trim()
}

/** 从 <code> 元素中提取纯文本（还原 <br> 为换行） */
function extractCodeText(codeEl: Element): string {
  const parts: string[] = []
  for (const child of Array.from(codeEl.childNodes)) {
    if (child.nodeType === globalThis.Node.TEXT_NODE) {
      parts.push(child.nodeValue || '')
    } else if (child.nodeType === globalThis.Node.ELEMENT_NODE) {
      const el = child as Element
      if (el.tagName.toLowerCase() === 'br') {
        parts.push('\n')
      } else {
        parts.push(el.textContent || '')
      }
    }
  }
  return parts.join('')
}
