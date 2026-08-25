/**
 * 适配器工厂
 *
 * 根据 protocol 创建对应的 FileSystemAdapter 实例。
 * 上层代码通过此工厂获取适配器，不直接引用具体实现类。
 */

import type { FileSystemAdapter, ProtocolConfig } from './BaseAdapter';
import { LocalAdapter } from './LocalAdapter';
import { FtpAdapter } from './FtpAdapter';
import { SftpAdapter } from './SftpAdapter';
import { SmbAdapter } from './SmbAdapter';
import { WebdavAdapter } from './WebdavAdapter';
import { S3Adapter } from './S3Adapter';

/**
 * 根据 protocol 和 config 创建适配器
 */
export function createAdapter(config: ProtocolConfig): FileSystemAdapter {
  switch (config.protocol) {
    case 'local':
      return new LocalAdapter(config);

    case 'ftp':
    case 'ftps':
      return new FtpAdapter(config);

    case 'sftp':
      return new SftpAdapter(config);

    case 'smb':
      return new SmbAdapter(config);

    case 'webdav':
      return new WebdavAdapter(config);

    case 's3':
      return new S3Adapter(config);

    default:
      throw new Error(`不支持的协议: ${(config as { protocol: string }).protocol}`);
  }
}

export type { FileSystemAdapter, ProtocolConfig, TestConnectionResult } from './BaseAdapter';
