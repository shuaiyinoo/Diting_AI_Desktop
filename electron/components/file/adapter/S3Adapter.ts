/**
 * S3 适配器
 *
 * 基于 @aws-sdk/client-s3 实现。
 * 兼容 AWS S3 / MinIO / Cloudflare R2 / Ceph 等兼容 S3 协议的对象存储。
 */

import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import path from 'node:path';
import type { FileSystemAdapter, TestConnectionResult, ProtocolConfig, RemoteDirEntry } from './BaseAdapter';
import type { ScanItem } from '../FolderScanner';

// S3 对象条目类型（简化定义）
interface S3ObjectInfo {
  Key?: string;
  Size?: number;
  LastModified?: Date;
}

export class S3Adapter implements FileSystemAdapter {
  private client: S3Client | null = null;

  constructor(private config: ProtocolConfig) {}

  /** 创建 S3 客户端 */
  private create(): S3Client {
    const endpoint = this.config.endpoint || this.config.host;
    const region = this.config.region || 'us-east-1';
    const forcePathStyle = this.config.forcePathStyle ?? false;

    const clientConfig: S3ClientConfig = {
      region,
      credentials: {
        accessKeyId: this.config.accessKey || this.config.username || '',
        secretAccessKey: this.config.secretKey || this.config.password || '',
      },
      forcePathStyle,
    };

    // 自定义 endpoint（MinIO / R2 等）
    if (endpoint) {
      clientConfig.endpoint = endpoint;
    }

    const client = new S3Client(clientConfig);
    this.client = client;
    return client;
  }

  /** 测试连接 */
  async testConnection(): Promise<TestConnectionResult> {
    try {
      const client = this.create();
      const bucket = this.config.bucket || '';
      const prefix = this.config.prefix || '';
      // 尝试列出对象（最多 1 个）
      const command = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        MaxKeys: 1,
      });
      await client.send(command);
      return { success: true };
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** 列出 bucket 下所有对象（递归） */
  async listFiles(rootPath: string): Promise<ScanItem[]> {
    const client = this.create();
    const bucket = this.config.bucket || '';
    const prefix = rootPath || this.config.prefix || '';

    const results: ScanItem[] = [];
    // 记录已添加的目录前缀，避免重复
    const addedDirs = new Set<string>();

    let continuationToken: string | undefined;

    do {
      const command = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        MaxKeys: 1000,
        ContinuationToken: continuationToken,
      });

      const response = await client.send(command);
      const contents = (response.Contents || []) as S3ObjectInfo[];

      for (const obj of contents) {
        if (!obj.Key) continue;

        // 跳过目录标记对象（size=0 且以 / 结尾）
        if (obj.Size === 0 && obj.Key.endsWith('/')) continue;

        // S3 是扁平结构，需要从 Key 中推导出目录层级
        const key = prefix && obj.Key.startsWith(prefix) ? obj.Key.slice(prefix.length) : obj.Key;
        const parts = key.split('/').filter((p: string) => p.length > 0);

        // 为每一级目录创建 ScanItem
        let parentPath = '';
        for (let i = 0; i < parts.length - 1; i++) {
          const dirName = parts[i];
          const dirRelativePath = parentPath
            ? `${parentPath}/${dirName}`
            : dirName;

          if (!addedDirs.has(dirRelativePath)) {
            addedDirs.add(dirRelativePath);
            results.push({
              name: dirName,
              relativePath: dirRelativePath,
              parentPath,
              isDir: true,
              size: 0,
              mtime: obj.LastModified
                ? obj.LastModified.toISOString()
                : new Date().toISOString(),
              type: 'folder',
            });
          }
          parentPath = dirRelativePath;
        }

        // 文件本身
        const fileName = parts[parts.length - 1] || obj.Key;
        const ext = path.extname(fileName);
        results.push({
          name: fileName,
          relativePath: parentPath ? `${parentPath}/${fileName}` : fileName,
          parentPath,
          isDir: false,
          size: obj.Size || 0,
          mtime: obj.LastModified
            ? obj.LastModified.toISOString()
            : new Date().toISOString(),
          type: ext || 'file',
        });
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);

    return results;
  }

  /** 列出指定前缀下的单层内容（非递归，用于前端路径浏览） */
  async listDir(dirPath: string): Promise<RemoteDirEntry[]> {
    const client = this.create();
    const bucket = this.config.bucket || '';
    const prefix = dirPath || this.config.prefix || '';
    const results: RemoteDirEntry[] = [];
    const addedDirs = new Set<string>();

    let continuationToken: string | undefined;
    do {
      const command = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        MaxKeys: 1000,
        ContinuationToken: continuationToken,
        Delimiter: '/',
      });

      const response = await client.send(command);

      // 公共前缀 = 子目录
      const commonPrefixes = response.CommonPrefixes || [];
      for (const p of commonPrefixes) {
        if (!p.Prefix) continue;
        const dirName = p.Prefix.replace(prefix, '').replace(/\/$/, '');
        if (dirName && !addedDirs.has(dirName)) {
          addedDirs.add(dirName);
          results.push({
            name: dirName,
            isDir: true,
            size: 0,
          });
        }
      }

      // 对象 = 文件
      const contents = (response.Contents || []) as S3ObjectInfo[];
      for (const obj of contents) {
        if (!obj.Key) continue;
        // 跳过目录标记对象
        if (obj.Size === 0 && obj.Key.endsWith('/')) continue;
        // 跳过与 prefix 完全相同的 key
        if (obj.Key === prefix) continue;
        const fileName = obj.Key.slice(prefix.length);
        // 只取第一层级（不包含 / 的才是直接子项）
        if (fileName.includes('/')) continue;
        if (fileName) {
          results.push({
            name: fileName,
            isDir: false,
            size: obj.Size || 0,
            mtime: obj.LastModified ? obj.LastModified.toISOString() : undefined,
          });
        }
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);

    results.sort((a, b) => {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name);
    });

    return results;
  }

  /** 读取远程文件内容为 Buffer */
  async readFile(remotePath: string): Promise<Buffer> {
    const client = this.create();
    const bucket = this.config.bucket || '';
    const prefix = this.config.prefix || '';
    const key = prefix ? (prefix.endsWith('/') ? prefix + remotePath : prefix + '/' + remotePath) : remotePath;

    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await client.send(command);
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return Buffer.from(result);
  }

  /** 关闭连接 */
  async close(): Promise<void> {
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }
  }
}
