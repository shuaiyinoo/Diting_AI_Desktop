// electron/components/file/FolderScanner.ts
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { AuthorizedFolder } from '../../service/database/filedb';
import { createAdapter, type ProtocolConfig } from './adapter/AdapterFactory';

// 文件信息接口
export interface FileInfo {
    path: string;      // 相对路径（使用 / 分隔）
    name: string;
    size: number;
    mtime: string;     // ISO 格式
    md5: string;
}

// 完整快照结构
export interface FolderSnapshot {
    timestamp: string;
    baseDir: string;
    files: FileInfo[];
}

// 扫描项（文件夹+文件统一结构，用于入库构建树形）
export interface ScanItem {
    name: string;
    relativePath: string;     // 相对于根目录的路径
    parentPath: string;       // 父目录相对路径（根目录下为 ''）
    isDir: boolean;
    size: number;             // 文件大小，文件夹为 0
    mtime: string;            // ISO 格式
    type: string;             // 'folder' 或文件扩展名（如 '.txt'）
}

export class FolderScanner {
    // 计算单个文件的 MD5（流式）
    static computeMD5(filePath: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('md5');
            const stream = fs.createReadStream(filePath);
            stream.on('data', (chunk) => hash.update(chunk));
            stream.on('end', () => resolve(hash.digest('hex')));
            stream.on('error', reject);
        });
    }
    // 递归扫描目录，返回 FileInfo[]
    static async scanDirectory(dir: string, baseDir: string = dir): Promise<FileInfo[]> {
        const results: FileInfo[] = [];
        const items = await fs.promises.readdir(dir, { withFileTypes: true });

        for (const item of items) {
            const fullPath = path.join(dir, item.name);
            const relativePath = path.relative(baseDir, fullPath);

            if (item.isDirectory()) {
                const sub = await this.scanDirectory(fullPath, baseDir);
                results.push(...sub);
            } else {
                const stats = await fs.promises.stat(fullPath);
                const md5 = await this.computeMD5(fullPath);
                results.push({
                    path: relativePath.replace(/\\/g, '/'),
                    name: item.name,
                    size: stats.size,
                    mtime: stats.mtime.toISOString(),
                    md5,
                });
            }
        }
        return results;
    }

    // 对外主方法：扫描根目录，返回完整的 FolderSnapshot
    static async scan(rootDir: string): Promise<FolderSnapshot> {
        if (!fs.existsSync(rootDir)) {
            throw new Error(`目录不存在: ${rootDir}`);
        }
        const files = await this.scanDirectory(rootDir, rootDir);
        return {
            timestamp: new Date().toISOString(),
            baseDir: rootDir,
            files,
        };
    }

    /**
     * 扫描授权文件夹，返回 ScanItem[]
     *
     * 根据 folder.protocol 选择对应的适配器：
     *   - local：使用 LocalAdapter（封装 fs 递归扫描）
     *   - ftp/ftps/sftp/smb/webdav/s3：使用对应的远程适配器
     *
     * @param folder 授权文件夹记录（含 protocol 和 protocol_config）
     */
    static async scanWithFolders(folder: AuthorizedFolder): Promise<ScanItem[]> {
        // 构建适配器配置
        const config: ProtocolConfig = {
            protocol: (folder.protocol || 'local') as ProtocolConfig['protocol'],
            // 解析 protocol_config JSON
            ...(folder.protocol_config ? JSON.parse(folder.protocol_config) : {}),
            // 对于本地协议，path 就是本地路径
            ...(folder.protocol === 'local' || !folder.protocol ? { host: folder.path } : {}),
        };

        // 创建适配器并扫描
        const adapter = createAdapter(config);

        // 确定扫描根路径
        let scanPath: string;
        if (config.protocol === 'local') {
            scanPath = folder.path;
        } else {
            // 远程协议：path 字段存储的是远程根路径
            scanPath = folder.path;
        }

        return adapter.listFiles(scanPath);
    }
}

export default FolderScanner;
