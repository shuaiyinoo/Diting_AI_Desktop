/**
 * FTP / FTPS 适配器
 *
 * 基于 basic-ftp 库实现。
 * basic-ftp 支持 FTP 和 FTPS（TLS），API 异步，不阻塞事件循环。
 */

import * as ftp from 'basic-ftp';
import path from 'node:path';
import type { FileSystemAdapter, TestConnectionResult, ProtocolConfig, RemoteDirEntry } from './BaseAdapter';
import type { ScanItem } from '../FolderScanner';

export class FtpAdapter implements FileSystemAdapter {
  private client: ftp.Client | null = null;

  constructor(private config: ProtocolConfig) {}

  /** 创建并连接 FTP 客户端 */
  private async connect(): Promise<ftp.Client> {
    const client = new ftp.Client(30000);
    client.ftp.verbose = false;

    const isFtps = this.config.protocol === 'ftps';
    const port = this.config.port || (isFtps ? 990 : 21);
    const user = this.config.username || 'anonymous';
    const password = this.config.password || '';

    await client.access({
      host: this.config.host!,
      port,
      user,
      password,
      secure: isFtps,
      secureOptions: isFtps ? { rejectUnauthorized: false } : undefined,
    });

    this.client = client;
    return client;
  }

  /** 测试连接 */
  async testConnection(): Promise<TestConnectionResult> {
    let client: ftp.Client | null = null;
    try {
      client = new ftp.Client(15000);
      const isFtps = this.config.protocol === 'ftps';
      const port = this.config.port || (isFtps ? 990 : 21);

      await client.access({
        host: this.config.host!,
        port,
        user: this.config.username || 'anonymous',
        password: this.config.password || '',
        secure: isFtps,
        secureOptions: isFtps ? { rejectUnauthorized: false } : undefined,
      });

      // 尝试列出根目录
      const remotePath = this.config.remotePath || '/';
      await client.list(remotePath);

      return { success: true };
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : String(err),
      };
    } finally {
      client?.close();
    }
  }

  /** 递归列出远程目录 */
  async listFiles(rootPath: string): Promise<ScanItem[]> {
    const client = await this.connect();
    try {
      const results: ScanItem[] = [];
      const basePath = rootPath || this.config.remotePath || '/';
      await this._scanRecursive(client, basePath, '', results);
      return results;
    } finally {
      this.close();
    }
  }

  /** 列出指定目录的单层内容（非递归，用于前端路径浏览） */
  async listDir(dirPath: string): Promise<RemoteDirEntry[]> {
    const client = await this.connect();
    try {
      const target = dirPath || '/';
      const entries = await client.list(target);
      const result: RemoteDirEntry[] = [];

      for (const entry of entries) {
        if (entry.name === '.' || entry.name === '..') continue;
        result.push({
          name: entry.name,
          isDir: entry.isDirectory,
          size: entry.size || 0,
          mtime: entry.modifiedAt ? entry.modifiedAt.toISOString() : undefined,
        });
      }

      // 目录优先排序
      result.sort((a, b) => {
        if (a.isDir && !b.isDir) return -1;
        if (!a.isDir && b.isDir) return 1;
        return a.name.localeCompare(b.name);
      });

      return result;
    } finally {
      this.close();
    }
  }

  /** 递归扫描 */
  private async _scanRecursive(
    client: ftp.Client,
    currentPath: string,
    parentRelativePath: string,
    results: ScanItem[],
  ): Promise<void> {
    let entries: ftp.FileInfo[];
    try {
      entries = await client.list(currentPath);
    } catch {
      // 无权限或不存在则跳过
      return;
    }

    for (const entry of entries) {
      // 跳过 . 和 ..
      if (entry.name === '.' || entry.name === '..') continue;

      const relativePath = parentRelativePath
        ? `${parentRelativePath}/${entry.name}`
        : entry.name;

      const isDir = entry.isDirectory;

      if (isDir) {
        results.push({
          name: entry.name,
          relativePath,
          parentPath: parentRelativePath,
          isDir: true,
          size: 0,
          mtime: entry.modifiedAt ? entry.modifiedAt.toISOString() : new Date().toISOString(),
          type: 'folder',
        });
        // 递归扫描子目录
        const fullPath = path.posix.join(currentPath, entry.name);
        await this._scanRecursive(client, fullPath, relativePath, results);
      } else {
        const ext = path.extname(entry.name);
        results.push({
          name: entry.name,
          relativePath,
          parentPath: parentRelativePath,
          isDir: false,
          size: entry.size,
          mtime: entry.modifiedAt ? entry.modifiedAt.toISOString() : new Date().toISOString(),
          type: ext || 'file',
        });
      }
    }
  }

  /** 读取远程文件内容为 Buffer */
  async readFile(remotePath: string): Promise<Buffer> {
    const client = await this.connect();
    try {
      const basePath = this.config.remotePath || '/';
      const fullPath = path.posix.join(basePath, remotePath);
      const { Writable } = await import('node:stream');
      const chunks: Buffer[] = [];
      const stream = new Writable({
        write(chunk: Buffer, _encoding: string, callback: () => void) {
          chunks.push(Buffer.from(chunk));
          callback();
        },
      });
      await client.downloadTo(stream, fullPath);
      return Buffer.concat(chunks);
    } finally {
      this.close();
    }
  }

  /** 关闭连接 */
  async close(): Promise<void> {
    if (this.client) {
      this.client.close();
      this.client = null;
    }
  }
}
