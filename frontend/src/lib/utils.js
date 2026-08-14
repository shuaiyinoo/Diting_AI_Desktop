import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * cn — 合并 Tailwind CSS 类名
 * 结合 clsx 的条件类名 + tailwind-merge 的冲突解决
 */
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}
