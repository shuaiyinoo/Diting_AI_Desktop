/**
 * 本地文件系统适配器
 *
 * 封装 FolderScanner._scanRecursive 的逻辑，实现 FileSystemAdapter 接口。
 * 输出的 ScanItem 格式与原 FolderScanner 完全一致，保证向下兼容。
 */

import fs from 'node:fs';
import path from 'node:path';
import type { FileSystemAdapter, TestConnectionResult, ProtocolConfig, RemoteDirEntry } from './BaseAdapter';
import type { ScanItem } from '../FolderScanner';

export class LocalAdapter implements FileSystemAdapter {
  constructor(private config: ProtocolConfig) {}

  /** 测试连接 = 检查路径是否存在且可访问 */
  async testConnection(): Promise<TestConnectionResult> {
    const dir = this.config.host || this.config.remotePath || '';
    if (!dir) {
      return { success: false, message: '路径不能为空' };
    }
    try {
      if (!fs.existsSync(dir)) {
        return { success: false, message: `目录不存在: ${dir}` };
      }
      const stat = fs.statSync(dir);
      if (!stat.isDirectory()) {
        return { success: false, message: `路径不是目录: ${dir}` };
      }
      // 尝试读取目录验证权限
      fs.readdirSync(dir);
      return { success: true };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  /** 递归扫描本地目录 */
  async listFiles(rootPath: string): Promise<ScanItem[]> {
    if (!fs.existsSync(rootPath)) {
      throw new Error(`目录不存在: ${rootPath}`);
    }
    const results: ScanItem[] = [];
    await this._scanRecursive(rootPath, '', results);
    return results;
  }

  /** 列出指定目录的单层内容（非递归，用于前端路径浏览） */
  async listDir(dirPath: string): Promise<RemoteDirEntry[]> {
    const target = dirPath || this.config.host || '/';
    if (!target || !fs.existsSync(target)) {
      return [];
    }
    const entries = await fs.promises.readdir(target, { withFileTypes: true });
    const result: RemoteDirEntry[] = [];

    for (const entry of entries) {
      const fullPath = path.join(target, entry.name);
      const stats = await fs.promises.stat(fullPath);
      result.push({
        name: entry.name,
        isDir: entry.isDirectory(),
        size: stats.size,
        mtime: stats.mtime.toISOString(),
      });
    }

    result.sort((a, b) => {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name);
    });

    return result;
  }

  /** 读取本地文件内容为 Buffer */
  async readFile(remotePath: string): Promise<Buffer> {
    const basePath = this.config.host || this.config.remotePath || '';
    const fullPath = path.join(basePath, remotePath);
    return fs.promises.readFile(fullPath);
  }

  /** 递归扫描内部方法（从 FolderScanner 移植） */
  private async _scanRecursive(
    dir: string,
    parentRelativePath: string,
    results: ScanItem[],
  ): Promise<void> {
    const items = await fs.promises.readdir(dir, { withFileTypes: true });

    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      const relativePath = parentRelativePath
        ? `${parentRelativePath}/${item.name}`
        : item.name;

      const stats = await fs.promises.stat(fullPath);

      if (item.isDirectory()) {
        results.push({
          name: item.name,
          relativePath,
          parentPath: parentRelativePath,
          isDir: true,
          size: 0,
          mtime: stats.mtime.toISOString(),
          type: 'folder',
        });
        // 递归扫描子目录
        await this._scanRecursive(fullPath, relativePath, results);
      } else {
        const ext = path.extname(item.name);
        results.push({
          name: item.name,
          relativePath,
          parentPath: parentRelativePath,
          isDir: false,
          size: stats.size,
          mtime: stats.mtime.toISOString(),
          type: ext || 'file',
        });
      }
    }
  }
}
