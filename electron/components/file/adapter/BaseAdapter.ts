/**
 * 文件系统适配器接口
 *
 * 统一抽象本地和网络协议（FTP/FTPS/SFTP/SMB/WebDAV/S3）的文件操作，
 * 使上层 FolderScanner / SyncService / FileController 不直接依赖 node:fs。
 *
 * 当前范围：只实现「列出文件和目录」+ 「测试连接」。
 * 后续可扩展 readFile / statFile 用于文件预览和向量化。
 */

import type { ScanItem } from '../FolderScanner';

/** 协议连接配置（前端传入 → JSON 存储 → AdapterFactory 解析） */
export interface ProtocolConfig {
  /** 协议类型 */
  protocol: 'local' | 'ftp' | 'ftps' | 'sftp' | 'smb' | 'webdav' | 's3';

  // ── 通用字段 ──
  host?: string;
  port?: number;
  remotePath?: string;
  username?: string;
  password?: string;
  alias?: string;

  // ── SFTP ──
  privateKeyPath?: string;

  // ── SMB ──
  share?: string;
  subPath?: string;
  domain?: string;

  // ── S3 ──
  endpoint?: string;
  region?: string;
  bucket?: string;
  prefix?: string;
  accessKey?: string;
  secretKey?: string;
  forcePathStyle?: boolean;

  // ── WebDAV ──
  url?: string;
}

/** 测试连接结果 */
export interface TestConnectionResult {
  success: boolean;
  message?: string;
}

/** 远程目录条目（listDir 返回） */
export interface RemoteDirEntry {
  name: string;
  isDir: boolean;
  size: number;
  mtime?: string;
}

/**
 * 文件系统适配器接口
 */
export interface FileSystemAdapter {
  /** 测试连接是否可用 */
  testConnection(): Promise<TestConnectionResult>;

  /**
   * 递归列出指定路径下的所有文件和目录
   * @param remotePath 远程根路径（对于 local 为本地路径）
   * @returns ScanItem 数组（与 FolderScanner 输出格式一致）
   */
  listFiles(remotePath: string): Promise<ScanItem[]>;

  /**
   * 列出指定路径下的单层目录内容（非递归）
   * 用于前端远程路径浏览选择器：用户逐级浏览服务器目录树
   * @param dirPath 要列出的目录路径（空或 '/' 表示根目录）
   * @returns RemoteDirEntry 数组（仅包含该层子项）
   */
  listDir(dirPath: string): Promise<RemoteDirEntry[]>;

  /**
   * 读取文件内容为 Buffer（后续文件预览和向量化时实现）
   * @param remotePath 文件相对路径
   */
  readFile?(remotePath: string): Promise<Buffer>;

  /** 关闭连接 / 释放资源 */
  close?(): Promise<void>;
}
