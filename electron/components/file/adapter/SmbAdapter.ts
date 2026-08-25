/**
 * SMB 适配器
 *
 * 基于 node-smb2 库实现（TypeScript 原生 SMB2 客户端）。
 * 连接流程：Client → authenticate → connectTree(share) → readDirectory
 */

import smb2 from 'node-smb2';
import path from 'node:path';
import type { FileSystemAdapter, TestConnectionResult, ProtocolConfig, RemoteDirEntry } from './BaseAdapter';
import type { ScanItem } from '../FolderScanner';

// 从 node-smb2 提取类型
type SmbClient = InstanceType<typeof smb2.Client>;
type SmbSession = Awaited<ReturnType<SmbClient['authenticate']>>;
type SmbTree = Awaited<ReturnType<SmbSession['connectTree']>>;

// DirectoryEntry 类型（从 node-smb2 类型定义提取）
interface SmbDirectoryEntry {
  type: 'File' | 'Directory';
  lastWriteTime: Date;
  fileSize: BigInt;
  filename: string;
}

export class SmbAdapter implements FileSystemAdapter {
  private client: SmbClient | null = null;

  constructor(private config: ProtocolConfig) {}

  /** 创建 SMB 客户端并连接 */
  private async connect(): Promise<{ client: SmbClient; session: SmbSession; tree: SmbTree }> {
    const host = this.config.host!;
    const port = this.config.port || 445;

    const client = new smb2.Client(host, {
      port,
      connectTimeout: 30000,
      requestTimeout: 30000,
    });

    await client.connect();

    const session = await client.authenticate({
      domain: this.config.domain || 'WORKGROUP',
      username: this.config.username || 'guest',
      password: this.config.password || '',
    });

    const share = this.config.share || '';
    const tree = await session.connectTree(share);

    this.client = client;
    return { client, session, tree };
  }

  /** 测试连接 */
  async testConnection(): Promise<TestConnectionResult> {
    let client: SmbClient | null = null;
    try {
      const port = this.config.port || 445;
      client = new smb2.Client(this.config.host!, {
        port,
        connectTimeout: 15000,
        requestTimeout: 15000,
      });

      await client.connect();
      const session = await client.authenticate({
        domain: this.config.domain || 'WORKGROUP',
        username: this.config.username || 'guest',
        password: this.config.password || '',
      });

      const tree = await session.connectTree(this.config.share || '');
      // 尝试列出根目录
      await tree.readDirectory(this.config.subPath || '\\');

      await tree.disconnect();
      await session.logoff();
      await client.close();

      return { success: true };
    } catch (err) {
      client?.close().catch(() => {});
      return {
        success: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** 递归列出远程共享目录 */
  async listFiles(rootPath: string): Promise<ScanItem[]> {
    const { client, session, tree } = await this.connect();
    try {
      const results: ScanItem[] = [];
      const basePath = rootPath || this.config.subPath || '\\';
      await this._scanRecursive(tree, basePath, '', results);
      return results;
    } finally {
      await tree.disconnect().catch(() => {});
      await session.logoff().catch(() => {});
      await client.close().catch(() => {});
      this.client = null;
    }
  }

  /** 列出指定目录的单层内容（非递归，用于前端路径浏览） */
  async listDir(dirPath: string): Promise<RemoteDirEntry[]> {
    const { client, session, tree } = await this.connect();
    try {
      const target = dirPath || this.config.subPath || '\\';
      const entries = (await tree.readDirectory(target)) as unknown as SmbDirectoryEntry[];
      const result: RemoteDirEntry[] = [];

      for (const entry of entries) {
        if (entry.filename === '.' || entry.filename === '..') continue;
        result.push({
          name: entry.filename,
          isDir: entry.type === 'Directory',
          size: Number(entry.fileSize),
          mtime: entry.lastWriteTime ? new Date(entry.lastWriteTime).toISOString() : undefined,
        });
      }

      result.sort((a, b) => {
        if (a.isDir && !b.isDir) return -1;
        if (!a.isDir && b.isDir) return 1;
        return a.name.localeCompare(b.name);
      });

      return result;
    } finally {
      await tree.disconnect().catch(() => {});
      await session.logoff().catch(() => {});
      await client.close().catch(() => {});
      this.client = null;
    }
  }

  /** 递归扫描 */
  private async _scanRecursive(
    tree: SmbTree,
    currentPath: string,
    parentRelativePath: string,
    results: ScanItem[],
  ): Promise<void> {
    let entries: SmbDirectoryEntry[];
    try {
      entries = (await tree.readDirectory(currentPath)) as unknown as SmbDirectoryEntry[];
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.filename === '.' || entry.filename === '..') continue;

      const relativePath = parentRelativePath
        ? `${parentRelativePath}/${entry.filename}`
        : entry.filename;

      const isDir = entry.type === 'Directory';

      if (isDir) {
        results.push({
          name: entry.filename,
          relativePath,
          parentPath: parentRelativePath,
          isDir: true,
          size: 0,
          mtime: entry.lastWriteTime
            ? new Date(entry.lastWriteTime).toISOString()
            : new Date().toISOString(),
          type: 'folder',
        });
        // SMB 路径用 \ 分隔
        const fullPath = path.posix.join(currentPath, entry.filename).replace(/\//g, '\\');
        await this._scanRecursive(tree, fullPath, relativePath, results);
      } else {
        const ext = path.extname(entry.filename);
        results.push({
          name: entry.filename,
          relativePath,
          parentPath: parentRelativePath,
          isDir: false,
          size: Number(entry.fileSize),
          mtime: entry.lastWriteTime
            ? new Date(entry.lastWriteTime).toISOString()
            : new Date().toISOString(),
          type: ext || 'file',
        });
      }
    }
  }

  /** 读取远程文件内容为 Buffer */
  async readFile(remotePath: string): Promise<Buffer> {
    const { client, session, tree } = await this.connect();
    try {
      const basePath = this.config.subPath || '\\';
      const fullPath = path.posix.join(basePath, remotePath).replace(/\//g, '\\');
      const chunks: Buffer[] = [];
      let offset = 0;
      const chunkSize = 65536; // 64KB
      // 先获取文件大小
      const stat = await tree.statFile(fullPath);
      const fileSize = Number(stat.endOfFile);
      while (offset < fileSize) {
        const length = Math.min(chunkSize, fileSize - offset);
        const buf = await tree.readFile(fullPath, offset, 0, length);
        chunks.push(Buffer.from(buf));
        offset += length;
      }
      return Buffer.concat(chunks);
    } finally {
      await tree.disconnect().catch(() => {});
      await session.logoff().catch(() => {});
      await client.close().catch(() => {});
      this.client = null;
    }
  }

  /** 关闭连接 */
  async close(): Promise<void> {
    if (this.client) {
      await this.client.close().catch(() => {});
      this.client = null;
    }
  }
}
