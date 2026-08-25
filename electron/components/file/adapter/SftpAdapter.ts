/**
 * SFTP 适配器
 *
 * 基于 ssh2-sftp-client 库实现。
 * 支持密码认证和私钥认证。
 */

import Client from 'ssh2-sftp-client';
import path from 'node:path';
import fs from 'node:fs';
import type { FileSystemAdapter, TestConnectionResult, ProtocolConfig, RemoteDirEntry } from './BaseAdapter';
import type { ScanItem } from '../FolderScanner';

export class SftpAdapter implements FileSystemAdapter {
  private client: Client | null = null;

  constructor(private config: ProtocolConfig) {}

  /** 创建并连接 SFTP 客户端 */
  private async connect(): Promise<Client> {
    const sftp = new Client();
    const port = this.config.port || 22;

    const connectOptions: Record<string, unknown> = {
      host: this.config.host,
      port,
      username: this.config.username || '',
    };

    // 私钥优先
    if (this.config.privateKeyPath && fs.existsSync(this.config.privateKeyPath)) {
      connectOptions.privateKey = fs.readFileSync(this.config.privateKeyPath, 'utf-8');
      if (this.config.password) {
        connectOptions.passphrase = this.config.password;
      }
    } else if (this.config.password) {
      connectOptions.password = this.config.password;
    }

    await sftp.connect(connectOptions as never);
    this.client = sftp;
    return sftp;
  }

  /** 测试连接 */
  async testConnection(): Promise<TestConnectionResult> {
    const sftp = new Client();
    try {
      const port = this.config.port || 22;
      const connectOptions: Record<string, unknown> = {
        host: this.config.host,
        port,
        username: this.config.username || '',
      };

      if (this.config.privateKeyPath && fs.existsSync(this.config.privateKeyPath)) {
        connectOptions.privateKey = fs.readFileSync(this.config.privateKeyPath, 'utf-8');
        if (this.config.password) {
          connectOptions.passphrase = this.config.password;
        }
      } else if (this.config.password) {
        connectOptions.password = this.config.password;
      }

      await sftp.connect(connectOptions as never);

      // 尝试列出根目录
      const remotePath = this.config.remotePath || '/';
      await sftp.list(remotePath);

      return { success: true };
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : String(err),
      };
    } finally {
      await sftp.end();
    }
  }

  /** 递归列出远程目录 */
  async listFiles(rootPath: string): Promise<ScanItem[]> {
    const sftp = await this.connect();
    try {
      const results: ScanItem[] = [];
      const basePath = rootPath || this.config.remotePath || '/';
      await this._scanRecursive(sftp, basePath, '', results);
      return results;
    } finally {
      await this.close();
    }
  }

  /** 列出指定目录的单层内容（非递归，用于前端路径浏览） */
  async listDir(dirPath: string): Promise<RemoteDirEntry[]> {
    const sftp = await this.connect();
    try {
      const target = dirPath || '/';
      const entries = await sftp.list(target);
      const result: RemoteDirEntry[] = [];

      for (const entry of entries) {
        if (entry.name === '.' || entry.name === '..') continue;
        result.push({
          name: entry.name,
          isDir: entry.type === 'd',
          size: entry.size || 0,
          mtime: entry.modifyTime
            ? new Date(entry.modifyTime * 1000).toISOString()
            : undefined,
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
      await this.close();
    }
  }

  /** 递归扫描 */
  private async _scanRecursive(
    sftp: Client,
    currentPath: string,
    parentRelativePath: string,
    results: ScanItem[],
  ): Promise<void> {
    let entries: import('ssh2-sftp-client').FileInfo[];
    try {
      entries = await sftp.list(currentPath);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name === '.' || entry.name === '..') continue;

      const relativePath = parentRelativePath
        ? `${parentRelativePath}/${entry.name}`
        : entry.name;

      // ssh2-sftp-client 的 type: d=目录, -=文件, l=链接
      const isDir = entry.type === 'd';

      if (isDir) {
        results.push({
          name: entry.name,
          relativePath,
          parentPath: parentRelativePath,
          isDir: true,
          size: 0,
          mtime: entry.modifyTime
            ? new Date(entry.modifyTime * 1000).toISOString()
            : new Date().toISOString(),
          type: 'folder',
        });
        const fullPath = path.posix.join(currentPath, entry.name);
        await this._scanRecursive(sftp, fullPath, relativePath, results);
      } else {
        const ext = path.extname(entry.name);
        results.push({
          name: entry.name,
          relativePath,
          parentPath: parentRelativePath,
          isDir: false,
          size: entry.size,
          mtime: entry.modifyTime
            ? new Date(entry.modifyTime * 1000).toISOString()
            : new Date().toISOString(),
          type: ext || 'file',
        });
      }
    }
  }

  /** 读取远程文件内容为 Buffer */
  async readFile(remotePath: string): Promise<Buffer> {
    const sftp = await this.connect();
    try {
      const basePath = this.config.remotePath || '/';
      const fullPath = path.posix.join(basePath, remotePath);
      const buffer = await sftp.get(fullPath);
      return Buffer.from(buffer as Buffer);
    } finally {
      await this.close();
    }
  }

  /** 关闭连接 */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.end();
      this.client = null;
    }
  }
}
