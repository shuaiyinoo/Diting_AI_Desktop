/**
 * Bridge 附件处理工具
 *
 * 供飞书/微信/钉钉 Bridge 共用的图片/文件处理函数：
 * - 推断图片 MIME 类型
 * - 保存图片/文件到 Agent 会话工作目录
 * - 构建 <attached_files> 引用块
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { getAgentWorkspacePath } from '../../components/pi/config-paths'

/** 图片大小上限（10MB） */
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024

/** 从二进制数据推断图片 MIME 类型 */
export function inferImageMediaType(buf: Buffer): string {
  if (buf.length < 4) return 'image/png'
  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'
  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg'
  // GIF
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif'
  // WebP
  if (buf.length >= 12 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp'
  // BMP
  if (buf[0] === 0x42 && buf[1] === 0x4d) return 'image/bmp'
  return 'image/png'
}

/** 从 MIME 类型推断文件扩展名 */
export function inferExtension(mimeType: string): string {
  const map: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/bmp': '.bmp',
    'application/pdf': '.pdf',
    'text/plain': '.txt',
    'text/markdown': '.md',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  }
  return map[mimeType] || ''
}

/** 保存图片到会话工作目录 */
export function saveImageToSession(
  workspaceId: string,
  sessionId: string,
  imageData: Buffer,
  index: number,
): string {
  const mediaType = inferImageMediaType(imageData)
  const ext = inferExtension(mediaType)
  const fileName = `image-${Date.now()}-${index}${ext}`

  const sessionDir = join(getAgentWorkspacePath(workspaceId), sessionId)
  if (!existsSync(sessionDir)) {
    mkdirSync(sessionDir, { recursive: true })
  }

  const filePath = join(sessionDir, fileName)
  writeFileSync(filePath, imageData)
  return filePath
}

/** 保存文件到会话工作目录 */
export function saveFileToSession(
  workspaceId: string,
  sessionId: string,
  fileData: Buffer,
  fileName: string,
): string {
  const sessionDir = join(getAgentWorkspacePath(workspaceId), sessionId)
  if (!existsSync(sessionDir)) {
    mkdirSync(sessionDir, { recursive: true })
  }

  const filePath = join(sessionDir, fileName)
  writeFileSync(filePath, fileData)
  return filePath
}

/** 构建附件引用块（注入到用户消息前） */
export function buildAttachedFilesBlock(
  attachments: Array<{ label: string; path: string }>,
): string {
  if (attachments.length === 0) return ''
  const lines = attachments.map((a) => `- ${a.label}: ${a.path}`)
  return `<attached_files>\n${lines.join('\n')}\n</attached_files>\n\n`
}

/** 构建会话文件树（用于 /now 命令展示） */
export function buildSessionFileTree(workspaceId: string, sessionId: string): string[] {
  const sessionDir = join(getAgentWorkspacePath(workspaceId), sessionId)
  if (!existsSync(sessionDir)) return []
  return buildFileTree(sessionDir)
}

/** 构建目录文件树 */
export function buildFileTree(dir: string, prefix: string = ''): string[] {
  const lines: string[] = []
  let entries: import('fs').Dirent[]
  try {
    entries = require('fs').readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }

  // 目录优先，然后按名称排序
  entries.sort((a: any, b: any) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    if (entry.isDirectory()) {
      lines.push(`${prefix}${entry.name}/`)
      const subLines = buildFileTree(join(dir, entry.name), prefix + '  ')
      lines.push(...subLines)
    } else {
      lines.push(`${prefix}${entry.name}`)
    }
  }

  return lines
}
