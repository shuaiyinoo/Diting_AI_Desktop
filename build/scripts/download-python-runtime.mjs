/**
 * Python Runtime 下载脚本
 *
 * 从 astral-sh/python-build-standalone 下载对应平台的 Python 运行时，
 * 解压到 build/extraResources/python-runtime/ 目录，供打包时作为 extraResources 使用。
 *
 * 用法：
 *   node build/scripts/download-python-runtime.mjs          # 当前平台
 *   node build/scripts/download-python-runtime.mjs --all    # 所有平台
 *   node build/scripts/download-python-runtime.mjs --mirror  # 使用国内镜像
 *
 * 镜像源：
 *   - 国际：https://github.com/astral-sh/python-build-standalone/releases
 *   - 国内：https://mirror.nju.edu.cn/github-release/astral-sh/python-build-standalone/
 *           或 https://ghfast.top/
 */

import { existsSync, mkdirSync, rmSync, writeFileSync, createWriteStream, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'node:child_process'
import { platform, arch } from 'os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..', '..')
const TARGET_DIR = join(PROJECT_ROOT, 'build', 'extraResources', 'python-runtime')

// python-build-standalone 版本
const PYTHON_VERSION = '2025.08.19'
const PYTHON_TAG = `cpython-3.12.7+${PYTHON_VERSION}`

// 镜像源
const GITHUB_BASE = 'https://github.com/astral-sh/python-build-standalone/releases/download'
const GITHUB_MIRROR = 'https://ghfast.top/https://github.com/astral-sh/python-build-standalone/releases/download'

/** 平台配置 */
const PLATFORM_CONFIGS = {
  'darwin-arm64': {
    archiveName: `${PYTHON_TAG}-aarch64-apple-darwin-install_only_stripped.tar.gz`,
    extractToSubdir: false, // 解压后直接是 python 目录结构
  },
  'darwin-x64': {
    archiveName: `${PYTHON_TAG}-x86_64-apple-darwin-install_only_stripped.tar.gz`,
    extractToSubdir: false,
  },
  'win32-x64': {
    archiveName: `${PYTHON_TAG}-x86_64-pc-windows-msvc-install_only_stripped.tar.gz`,
    extractToSubdir: false,
  },
  'linux-x64': {
    archiveName: `${PYTHON_TAG}-x86_64-unknown-linux-gnu-install_only_stripped.tar.gz`,
    extractToSubdir: false,
  },
}

/** 获取当前平台标识 */
function getCurrentPlatform() {
  const p = platform()
  const a = arch()
  const archStr = a === 'arm64' ? 'arm64' : 'x64'
  if (p === 'darwin') return `darwin-${archStr}`
  if (p === 'win32') return `win32-${archStr}`
  if (p === 'linux') return `linux-${archStr}`
  throw new Error(`不支持的平台: ${p}-${a}`)
}

/** 下载文件 */
function downloadFile(url, destPath) {
  console.log(`[download] ${url}`)
  // 使用 curl 下载（macOS/Linux/Windows 10+ 自带）
  const result = spawnSync('curl', ['-L', '-o', destPath, '--progress-bar', url], {
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    throw new Error(`下载失败: ${url} (exit code: ${result.status})`)
  }
}

/** 解压 tar.gz */
function extractTarGz(archivePath, destDir) {
  console.log(`[extract] ${archivePath} → ${destDir}`)
  mkdirSync(destDir, { recursive: true })
  const result = spawnSync('tar', ['-xzf', archivePath, '-C', destDir], {
    stdio: 'inherit',
  })
  if (result.status !== 0) {
    throw new Error(`解压失败: ${archivePath} (exit code: ${result.status})`)
  }
}

/** 安装预装包到 site-packages */
function installPredefinedPackages(pythonExe) {
  const packages = [
    'pypdf',
    'pdfplumber',
    'reportlab',
    'pdf2image',
    'pytesseract',
  ]
  console.log(`[pip] 安装预装包: ${packages.join(', ')}`)
  const sitePackagesDir = join(TARGET_DIR, 'site-packages')
  mkdirSync(sitePackagesDir, { recursive: true })

  const mirror = process.argv.includes('--mirror') ? '-i https://pypi.tuna.tsinghua.edu.cn/simple' : ''
  const result = spawnSync(pythonExe, ['-m', 'pip', 'install', ...packages, '--target', sitePackagesDir, mirror], {
    stdio: 'inherit',
    shell: platform() === 'win32',
  })
  if (result.status !== 0) {
    console.warn(`[pip] 预装包安装失败 (exit code: ${result.status})，可后续手动安装`)
  } else {
    console.log(`[pip] 预装包安装完成`)
  }
}

/** 处理单个平台 */
function processPlatform(platformKey, useMirror) {
  const config = PLATFORM_CONFIGS[platformKey]
  if (!config) {
    throw new Error(`未知平台: ${platformKey}`)
  }

  console.log(`\n========== 处理平台: ${platformKey} ==========`)

  const baseUrl = useMirror ? GITHUB_MIRROR : GITHUB_BASE
  const url = `${baseUrl}/${PYTHON_TAG}/${config.archiveName}`
  const archiveDir = join(PROJECT_ROOT, 'build', 'archives')
  const archivePath = join(archiveDir, config.archiveName)

  // 下载
  mkdirSync(archiveDir, { recursive: true })
  if (!existsSync(archivePath)) {
    downloadFile(url, archivePath)
  } else {
    console.log(`[skip] 已存在缓存: ${archivePath}`)
  }

  // 解压到临时目录
  const tempDir = join(archiveDir, `tmp-${platformKey}`)
  if (existsSync(tempDir)) rmSync(tempDir, { recursive: true, force: true })
  extractTarGz(archivePath, tempDir)

  // python-build-standalone 解压后是 python/ 目录，移动到目标位置
  const extractedPythonDir = join(tempDir, 'python')
  if (!existsSync(extractedPythonDir)) {
    // 有些版本解压后直接在根目录
    console.warn(`[warn] 未找到 python/ 子目录，检查解压内容`)
    const entries = readdirSync(tempDir)
    console.log(`[debug] 解压内容: ${entries.join(', ')}`)
    throw new Error(`解压后未找到 python/ 目录，请检查 ${tempDir}`)
  }

  // 清理并移动到目标
  if (existsSync(TARGET_DIR)) rmSync(TARGET_DIR, { recursive: true, force: true })
  mkdirSync(TARGET_DIR, { recursive: true })

  // 复制 python 目录内容到 TARGET_DIR
  // macOS/Linux: python/bin/python3 → TARGET_DIR/bin/python3
  // Windows:    python/python.exe → TARGET_DIR/python.exe
  const copyResult = spawnSync(platform() === 'win32' ? 'xcopy' : 'cp', 
    platform() === 'win32' 
      ? [extractedPythonDir, TARGET_DIR, '/E', '/I', '/Y']
      : ['-r', `${extractedPythonDir}/.`, `${TARGET_DIR}/`],
    { stdio: 'inherit', shell: true }
  )
  if (copyResult.status !== 0) {
    throw new Error(`复制 python 目录失败`)
  }

  // 确保可执行权限（macOS/Linux）
  if (platformKey.startsWith('darwin') || platformKey.startsWith('linux')) {
    const pythonPath = join(TARGET_DIR, 'bin', 'python3')
    if (existsSync(pythonPath)) {
      spawnSync('chmod', ['+x', pythonPath])
      console.log(`[chmod] ${pythonPath}`)
    }
  }

  // 安装预装包
  const pythonExe = platformKey.startsWith('win32')
    ? join(TARGET_DIR, 'python.exe')
    : join(TARGET_DIR, 'bin', 'python3')

  if (existsSync(pythonExe)) {
    // 验证 Python 可执行
    const versionResult = spawnSync(pythonExe, ['--version'], { encoding: 'utf-8' })
    console.log(`[verify] ${versionResult.stdout.trim()}`)
    
    // 安装预装包
    installPredefinedPackages(pythonExe)
  } else {
    console.warn(`[warn] Python 可执行文件不存在: ${pythonExe}`)
  }

  // 清理临时目录
  rmSync(tempDir, { recursive: true, force: true })

  console.log(`[done] 平台 ${platformKey} 处理完成`)
}

// ===== 主逻辑 =====
const args = process.argv.slice(2)
const useMirror = args.includes('--mirror')
const downloadAll = args.includes('--all')

try {
  if (downloadAll) {
    // 下载所有平台（需要交叉解压，较复杂，建议在各平台 CI 中分别执行）
    for (const platformKey of Object.keys(PLATFORM_CONFIGS)) {
      if (platformKey.startsWith(platform()) || downloadAll) {
        processPlatform(platformKey, useMirror)
      }
    }
  } else {
    // 只下载当前平台
    const currentPlatform = getCurrentPlatform()
    processPlatform(currentPlatform, useMirror)
  }

  console.log('\n✅ Python runtime 下载和配置完成！')
  console.log(`   位置: ${TARGET_DIR}`)
  console.log(`   打包时会自动包含在 extraResources/python-runtime/ 中`)
} catch (err) {
  console.error('\n❌ 处理失败:', err.message)
  process.exit(1)
}
