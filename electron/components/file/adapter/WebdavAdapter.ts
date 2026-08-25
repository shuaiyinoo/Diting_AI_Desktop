/**
 * WebDAV 适配器
 *
 * 基于 webdav 库实现。
 * 支持 Basic Auth，兼容 Nextcloud / ownCloud / 群晖等 WebDAV 服务。
 */

import { createClient, type WebDAVClient, type FileStat } from 'webdav';
import path from 'node:path';
import type { FileSystemAdapter, TestConnectionResult, ProtocolConfig, RemoteDirEntry } from './BaseAdapter';
import type { ScanItem } from '../FolderScanner';

export class WebdavAdapter implements FileSystemAdapter {
  private client: WebDAVClient | null = null;

  constructor(private config: ProtocolConfig) {}

  /** 创建 WebDAV 客户端 */
  private create(): WebDAVClient {
    const url = this.config.url || this.config.host || '';
    const client = createClient(url, {
      username: this.config.username,
      password: this.config.password,
    });
    this.client = client;
    return client;
  }

  /** 测试连接 */
  async testConnection(): Promise<TestConnectionResult> {
    try {
      const client = this.create();
      // 尝试列出根目录
      const remotePath = this.config.remotePath || '/';
      await client.getDirectoryContents(remotePath);
      return { success: true };
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** 递归列出远程目录 */
  async listFiles(rootPath: string): Promise<ScanItem[]> {
    const client = this.create();
    const results: ScanItem[] = [];
    const basePath = rootPath || this.config.remotePath || '/';
    await this._scanRecursive(client, basePath, '', results);
    return results;
  }

  /** 列出指定目录的单层内容（非递归，用于前端路径浏览） */
  async listDir(dirPath: string): Promise<RemoteDirEntry[]> {
    const client = this.create();
    try {
      const target = dirPath || '/';
      const entries = (await client.getDirectoryContents(target)) as FileStat[];
      const result: RemoteDirEntry[] = [];

      for (const entry of entries) {
        if (entry.basename === '.' || entry.basename === '..') continue;
        result.push({
          name: entry.basename,
          isDir: entry.type === 'directory',
          size: entry.size || 0,
          mtime: entry.lastmod || undefined,
        });
      }

      result.sort((a, b) => {
        if (a.isDir && !b.isDir) return -1;
        if (!a.isDir && b.isDir) return 1;
        return a.name.localeCompare(b.name);
      });

      return result;
    } catch (err) {
      throw err;
    }
  }

  /** 递归扫描 */
  private async _scanRecursive(
    client: WebDAVClient,
    currentPath: string,
    parentRelativePath: string,
    results: ScanItem[],
  ): Promise<void> {
    let entries: FileStat[];
    try {
      entries = (await client.getDirectoryContents(currentPath)) as FileStat[];
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.basename === '.' || entry.basename === '..') continue;

      const relativePath = parentRelativePath
        ? `${parentRelativePath}/${entry.basename}`
        : entry.basename;

      const isDir = entry.type === 'directory';

      if (isDir) {
        results.push({
          name: entry.basename,
          relativePath,
          parentPath: parentRelativePath,
          isDir: true,
          size: 0,
          mtime: entry.lastmod || new Date().toISOString(),
          type: 'folder',
        });
        // WebDAV 路径使用完整路径
        const fullPath = path.posix.join(currentPath, entry.basename);
        await this._scanRecursive(client, fullPath, relativePath, results);
      } else {
        const ext = path.extname(entry.basename);
        results.push({
          name: entry.basename,
          relativePath,
          parentPath: parentRelativePath,
          isDir: false,
          size: entry.size,
          mtime: entry.lastmod || new Date().toISOString(),
          type: ext || 'file',
        });
      }
    }
  }

  /** 读取远程文件内容为 Buffer */
  async readFile(remotePath: string): Promise<Buffer> {
    const client = this.create();
    const basePath = this.config.remotePath || '/';
    const fullPath = path.posix.join(basePath, remotePath);
    const data = await client.getFileContents(fullPath, { format: 'binary' });
    return Buffer.from(data as Buffer);
  }

  /** 关闭连接（webdav 库无状态，无需关闭） */
  async close(): Promise<void> {
    this.client = null;
  }
}
