/**
 * OCR 模型服务
 *
 * 负责本地 PaddleOCR 模型的下载、管理和文件操作。
 * 模型来源：https://huggingface.co/PaddlePaddle 下的各系列 OCR 模型
 * 国内镜像：https://hf-mirror.com 对应路径
 * 模型存储路径：~/.diting/model/ocr
 *
 * 每个模型预设包含三个文件：detection（检测）、recognition（识别）、dictionary（字典）。
 * 下载时三个文件串行下载，进度合并为一个总体进度。
 */

import path from 'path';
import fs from 'fs';
import os from 'os';
import https from 'https';
import { logger } from 'ee-core/log';

/** OCR 模型系列类型 */
export type OcrModelSeries = 'ppocrv6' | 'ppocrv5' | 'ppocrv4' | 'ppocrv3';

/** OCR 模型精度等级 */
export type OcrModelTier = 'tiny' | 'small' | 'medium' | 'mobile' | 'server' | 'server-doc' | 'mobile-int8';

/** 模型语言/地区类型 */
export type OcrModelLang = 'multilingual' | 'en' | 'arabic' | 'cyrillic' | 'devanagari' | 'greek' | 'eslav' | 'korean' | 'latin' | 'tamil' | 'telugu' | 'thai' | 'japanese';

/** 单个模型文件定义 */
export interface OcrModelFile {
  /** 文件在模型中的角色 */
  role: 'detection' | 'recognition' | 'dictionary';
  /** 远程文件名（用于拼 URL） */
  remoteFilename: string;
  /** 本地保存文件名 */
  localFilename: string;
  /** 文件大小（字节，估算） */
  sizeBytes: number;
}

/** OCR 模型预设定义 */
export interface OcrModelDef {
  /** 模型唯一标识（与库 MODEL_PRESETS 的 key 一致） */
  id: string;
  /** 显示名称 */
  label: string;
  /** 系列 */
  series: OcrModelSeries;
  /** 精度等级 */
  tier: OcrModelTier;
  /** 语言/地区 */
  lang: OcrModelLang;
  /** 大小描述 */
  sizeLabel: string;
  /** 描述 */
  description: string;
  /** 三个文件定义 */
  files: OcrModelFile[];
}

/** 下载进度回调 */
export interface OcrDownloadProgress {
  /** 模型 ID */
  modelId: string;
  /** 当前下载文件名 */
  filename: string;
  /** 已下载字节数（累计） */
  downloaded: number;
  /** 总字节数（全部文件总和） */
  total: number;
  /** 进度百分比（0-100） */
  percent: number;
  /** 下载速度（KB/s） */
  speed: number;
  /** 是否完成 */
  done: boolean;
  /** 错误信息 */
  error?: string;
}

/** 模型状态 */
export interface OcrModelStatus {
  /** 模型定义 */
  def: OcrModelDef;
  /** 是否已就绪（全部文件存在） */
  ready: boolean;
  /** 各文件是否存在 */
  filesReady: boolean[];
  /** 实际占用空间（字节） */
  actualSize: number | null;
}

// ===== 模型 URL 获取 =====

/**
 * ppu-paddle-ocr 库导出的 MODEL_PRESETS 字典类型
 * key 是 kebab-case 的模型预设名，value 是三个 URL
 */
type ModelUrls = { detection: string; recognition: string; charactersDictionary: string };

/** 缓存的 MODEL_PRESETS */
let MODEL_PRESETS_CACHE: Record<string, ModelUrls> | null = null;

/**
 * 懒加载获取 ppu-paddle-ocr 库的 MODEL_PRESETS 字典
 *
 * 动态 import 避免打包时将 onnxruntime-node 打入。
 * MODEL_PRESETS 包含全部 V3~V6 系列的模型 URL 常量。
 */
async function getModelPresets(): Promise<Record<string, ModelUrls>> {
  if (MODEL_PRESETS_CACHE) return MODEL_PRESETS_CACHE;

  try {
    const lib = await import('ppu-paddle-ocr');
    // 库导出的 MODEL_PRESETS 是一个 kebab-case key → ModelUrls 的字典
    // 直接引用，避免逐个手动映射
    MODEL_PRESETS_CACHE = lib.MODEL_PRESETS as unknown as Record<string, ModelUrls>;
    logger.info(`[OcrModelService] 已加载 ppu-paddle-ocr MODEL_PRESETS (${Object.keys(MODEL_PRESETS_CACHE).length} 个预设)`);
  } catch (err) {
    logger.error('[OcrModelService] 加载 ppu-paddle-ocr MODEL_PRESETS 失败:', err);
    // 回退：硬编码 URL（从 model-catalogue.js 提取）
    const MB = 'https://media.githubusercontent.com/media/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models/main';
    const DB = 'https://raw.githubusercontent.com/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models/main';
    MODEL_PRESETS_CACHE = {
      'v6-tiny': { detection: `${MB}/detection/ort/PP-OCRv6_tiny_det.ort`, recognition: `${MB}/recognition/ort/PP-OCRv6_tiny_rec.ort`, charactersDictionary: `${DB}/recognition/ppocrv6_tiny_dict.txt` },
      'v6-small': { detection: `${MB}/detection/ort/PP-OCRv6_small_det.ort`, recognition: `${MB}/recognition/ort/PP-OCRv6_small_rec.ort`, charactersDictionary: `${DB}/recognition/ppocrv6_dict.txt` },
      'v6-medium': { detection: `${MB}/detection/ort/PP-OCRv6_medium_det.ort`, recognition: `${MB}/recognition/ort/PP-OCRv6_medium_rec.ort`, charactersDictionary: `${DB}/recognition/ppocrv6_dict.txt` },
      'v5-mobile': { detection: `${MB}/detection/PP-OCRv5_mobile_det_infer.onnx`, recognition: `${MB}/recognition/PP-OCRv5_mobile_rec_infer.onnx`, charactersDictionary: `${DB}/recognition/ppocrv5_dict.txt` },
      'v5-server': { detection: `${MB}/detection/PP-OCRv5_server_det_infer.onnx`, recognition: `${MB}/recognition/PP-OCRv5_server_rec_infer.onnx`, charactersDictionary: `${DB}/recognition/ppocrv5_dict.txt` },
      'v5-en-mobile': { detection: `${MB}/detection/PP-OCRv5_mobile_det_infer.ort`, recognition: `${MB}/recognition/multi/en/v5/en_PP-OCRv5_mobile_rec_infer.ort`, charactersDictionary: `${DB}/recognition/multi/en/v5/ppocrv5_en_dict.txt` },
      'v5-en-mobile-int8': { detection: `${MB}/detection/PP-OCRv5_mobile_det_infer.ort`, recognition: `${MB}/recognition/multi/en/v5/en_PP-OCRv5_mobile_rec_infer_int8.ort`, charactersDictionary: `${DB}/recognition/multi/en/v5/ppocrv5_en_dict.txt` },
      'v5-en-server': { detection: `${MB}/detection/PP-OCRv5_server_det_infer.onnx`, recognition: `${MB}/recognition/PP-OCRv5_server_rec_infer.onnx`, charactersDictionary: `${DB}/recognition/ppocrv5_dict.txt` },
      'v5-arabic-mobile': { detection: `${MB}/detection/PP-OCRv5_mobile_det_infer.onnx`, recognition: `${MB}/recognition/multi/arabic/v5/arabic_PP-OCRv5_mobile_rec_infer.onnx`, charactersDictionary: `${DB}/recognition/multi/arabic/v5/ppocrv5_arabic_dict.txt` },
      'v5-cyrillic-mobile': { detection: `${MB}/detection/PP-OCRv5_mobile_det_infer.onnx`, recognition: `${MB}/recognition/multi/cyrillic/v5/cyrillic_PP-OCRv5_mobile_rec_infer.onnx`, charactersDictionary: `${DB}/recognition/multi/cyrillic/v5/ppocrv5_cyrillic_dict.txt` },
      'v5-devanagari-mobile': { detection: `${MB}/detection/PP-OCRv5_mobile_det_infer.onnx`, recognition: `${MB}/recognition/multi/devanagari/v5/devanagari_PP-OCRv5_mobile_rec_infer.onnx`, charactersDictionary: `${DB}/recognition/multi/devanagari/v5/ppocrv5_devanagari_dict.txt` },
      'v5-greek-mobile': { detection: `${MB}/detection/PP-OCRv5_mobile_det_infer.onnx`, recognition: `${MB}/recognition/multi/el/v5/el_PP-OCRv5_mobile_rec_infer.onnx`, charactersDictionary: `${DB}/recognition/multi/el/v5/ppocrv5_el_dict.txt` },
      'v5-eslav-mobile': { detection: `${MB}/detection/PP-OCRv5_mobile_det_infer.onnx`, recognition: `${MB}/recognition/multi/eslav/v5/eslav_PP-OCRv5_mobile_rec_infer.onnx`, charactersDictionary: `${DB}/recognition/multi/eslav/v5/ppocrv5_eslav_dict.txt` },
      'v5-korean-mobile': { detection: `${MB}/detection/PP-OCRv5_mobile_det_infer.onnx`, recognition: `${MB}/recognition/multi/korean/v5/korean_PP-OCRv5_mobile_rec_infer.onnx`, charactersDictionary: `${DB}/recognition/multi/korean/v5/ppocrv5_korean_dict.txt` },
      'v5-latin-mobile': { detection: `${MB}/detection/PP-OCRv5_mobile_det_infer.onnx`, recognition: `${MB}/recognition/multi/latin/v5/latin_PP-OCRv5_mobile_rec_infer.onnx`, charactersDictionary: `${DB}/recognition/multi/latin/v5/ppocrv5_latin_dict.txt` },
      'v5-tamil-mobile': { detection: `${MB}/detection/PP-OCRv5_mobile_det_infer.onnx`, recognition: `${MB}/recognition/multi/ta/v5/ta_PP-OCRv5_mobile_rec_infer.onnx`, charactersDictionary: `${DB}/recognition/multi/ta/v5/ppocrv5_ta_dict.txt` },
      'v5-telugu-mobile': { detection: `${MB}/detection/PP-OCRv5_mobile_det_infer.onnx`, recognition: `${MB}/recognition/multi/te/v5/te_PP-OCRv5_mobile_rec_infer.onnx`, charactersDictionary: `${DB}/recognition/multi/te/v5/ppocrv5_te_dict.txt` },
      'v5-thai-mobile': { detection: `${MB}/detection/PP-OCRv5_mobile_det_infer.onnx`, recognition: `${MB}/recognition/multi/th/v5/th_PP-OCRv5_mobile_rec_infer.onnx`, charactersDictionary: `${DB}/recognition/multi/th/v5/ppocrv5_th_dict.txt` },
      'v4-mobile': { detection: `${MB}/detection/PP-OCRv4_mobile_det_infer.onnx`, recognition: `${MB}/recognition/PP-OCRv4_mobile_rec_infer.onnx`, charactersDictionary: `${DB}/recognition/ppocrv4_dict.txt` },
      'v4-server': { detection: `${MB}/detection/PP-OCRv4_server_det_infer.onnx`, recognition: `${MB}/recognition/PP-OCRv4_server_rec_infer.onnx`, charactersDictionary: `${DB}/recognition/ppocrv4_dict.txt` },
      'v4-server-doc': { detection: `${MB}/detection/PP-OCRv4_server_det_infer.onnx`, recognition: `${MB}/recognition/PP-OCRv4_server_rec_doc_infer.onnx`, charactersDictionary: `${DB}/recognition/ppocrv4_doc_dict.txt` },
      'v4-en-mobile': { detection: `${MB}/detection/PP-OCRv4_mobile_det_infer.onnx`, recognition: `${MB}/recognition/multi/en/v4/en_PP-OCRv4_mobile_rec_infer.onnx`, charactersDictionary: `${DB}/recognition/multi/en/v4/en_dict.txt` },
      'v3-mobile': { detection: `${MB}/detection/PP-OCRv5_mobile_det_infer.onnx`, recognition: `${MB}/recognition/PP-OCRv3_mobile_rec_infer.onnx`, charactersDictionary: `${DB}/recognition/ppocrv3_dict.txt` },
      'v3-japanese-mobile': { detection: `${MB}/detection/PP-OCRv5_mobile_det_infer.onnx`, recognition: `${MB}/recognition/multi/japan/v3/japan_PP-OCRv3_mobile_rec_infer.onnx`, charactersDictionary: `${DB}/recognition/multi/japan/v3/japan_dict.txt` },
    };
    logger.info('[OcrModelService] 使用回退硬编码 URL');
  }

  return MODEL_PRESETS_CACHE;
}

/**
 * 从 URL 中提取文件名作为本地保存文件名
 */
function extractFilename(url: string): string {
  // 去除 query string
  const cleanUrl = url.split('?')[0];
  // 取最后一段
  const parts = cleanUrl.split('/');
  return parts[parts.length - 1] || 'unknown';
}

// ===== OCR 模型清单 =====

/**
 * 可用 OCR 模型预设列表
 *
 * 覆盖 ppu-paddle-ocr 库提供的全部 V3~V6 系列模型。
 * id 与库内 MODEL_PRESETS 的 key 一一对应。
 *
 * 文件定义中的 localFilename 在运行时从 URL 自动提取（见 getModelPresets），
 * 这里 files 仅用于元数据展示（大小估算等），实际下载时从 MODEL_PRESETS 获取 URL。
 */
const OCR_MODELS: OcrModelDef[] = [
  // ===== PP-OCRv6 系列（多语言，推荐） =====
  {
    id: 'v6-tiny', label: 'PP-OCRv6 Tiny', series: 'ppocrv6', tier: 'tiny', lang: 'multilingual',
    sizeLabel: '~15 MB',
    description: 'V6 最快模型，精简字典（~6.9k 字符），适合快速识别',
    files: [
      { role: 'detection', remoteFilename: 'PP-OCRv6_tiny_det.ort', localFilename: 'PP-OCRv6_tiny_det.ort', sizeBytes: 5_000_000 },
      { role: 'recognition', remoteFilename: 'PP-OCRv6_tiny_rec.ort', localFilename: 'PP-OCRv6_tiny_rec.ort', sizeBytes: 8_000_000 },
      { role: 'dictionary', remoteFilename: 'ppocrv6_tiny_dict.txt', localFilename: 'ppocrv6_tiny_dict.txt', sizeBytes: 200_000 },
    ],
  },
  {
    id: 'v6-small', label: 'PP-OCRv6 Small', series: 'ppocrv6', tier: 'small', lang: 'multilingual',
    sizeLabel: '~50 MB',
    description: 'V6 精度/速度平衡，50+ 语言完整字典',
    files: [
      { role: 'detection', remoteFilename: 'PP-OCRv6_small_det.ort', localFilename: 'PP-OCRv6_small_det.ort', sizeBytes: 15_000_000 },
      { role: 'recognition', remoteFilename: 'PP-OCRv6_small_rec.ort', localFilename: 'PP-OCRv6_small_rec.ort', sizeBytes: 30_000_000 },
      { role: 'dictionary', remoteFilename: 'ppocrv6_dict.txt', localFilename: 'ppocrv6_dict.txt', sizeBytes: 500_000 },
    ],
  },
  {
    id: 'v6-medium', label: 'PP-OCRv6 Medium', series: 'ppocrv6', tier: 'medium', lang: 'multilingual',
    sizeLabel: '~120 MB',
    description: 'V6 服务级精度，比 V5 server 提升 +5.1% 准确率',
    files: [
      { role: 'detection', remoteFilename: 'PP-OCRv6_medium_det.ort', localFilename: 'PP-OCRv6_medium_det.ort', sizeBytes: 30_000_000 },
      { role: 'recognition', remoteFilename: 'PP-OCRv6_medium_rec.ort', localFilename: 'PP-OCRv6_medium_rec.ort', sizeBytes: 80_000_000 },
      { role: 'dictionary', remoteFilename: 'ppocrv6_dict.txt', localFilename: 'ppocrv6_dict.txt', sizeBytes: 500_000 },
    ],
  },
  // ===== PP-OCRv5 系列（多语言） =====
  {
    id: 'v5-mobile', label: 'PP-OCRv5 Mobile', series: 'ppocrv5', tier: 'mobile', lang: 'multilingual',
    sizeLabel: '~20 MB',
    description: 'V5 移动端模型，轻量高效',
    files: [
      { role: 'detection', remoteFilename: 'PP-OCRv5_mobile_det_infer.onnx', localFilename: 'PP-OCRv5_mobile_det_infer.onnx', sizeBytes: 5_000_000 },
      { role: 'recognition', remoteFilename: 'PP-OCRv5_mobile_rec_infer.onnx', localFilename: 'PP-OCRv5_mobile_rec_infer.onnx', sizeBytes: 12_000_000 },
      { role: 'dictionary', remoteFilename: 'ppocrv5_dict.txt', localFilename: 'ppocrv5_dict.txt', sizeBytes: 500_000 },
    ],
  },
  {
    id: 'v5-server', label: 'PP-OCRv5 Server', series: 'ppocrv5', tier: 'server', lang: 'multilingual',
    sizeLabel: '~80 MB',
    description: 'V5 服务端模型，高精度',
    files: [
      { role: 'detection', remoteFilename: 'PP-OCRv5_server_det_infer.onnx', localFilename: 'PP-OCRv5_server_det_infer.onnx', sizeBytes: 50_000_000 },
      { role: 'recognition', remoteFilename: 'PP-OCRv5_server_rec_infer.onnx', localFilename: 'PP-OCRv5_server_rec_infer.onnx', sizeBytes: 80_000_000 },
      { role: 'dictionary', remoteFilename: 'ppocrv5_dict.txt', localFilename: 'ppocrv5_dict.txt', sizeBytes: 500_000 },
    ],
  },
  // ===== PP-OCRv5 英语系列 =====
  {
    id: 'v5-en-mobile', label: 'PP-OCRv5 English Mobile', series: 'ppocrv5', tier: 'mobile', lang: 'en',
    sizeLabel: '~15 MB',
    description: 'V5 英语移动端模型（.ort 格式）',
    files: [
      { role: 'detection', remoteFilename: 'PP-OCRv5_mobile_det_infer.ort', localFilename: 'PP-OCRv5_mobile_det_infer.ort', sizeBytes: 5_000_000 },
      { role: 'recognition', remoteFilename: 'en_PP-OCRv5_mobile_rec_infer.ort', localFilename: 'en_PP-OCRv5_mobile_rec_infer.ort', sizeBytes: 8_000_000 },
      { role: 'dictionary', remoteFilename: 'ppocrv5_en_dict.txt', localFilename: 'ppocrv5_en_dict.txt', sizeBytes: 100_000 },
    ],
  },
  {
    id: 'v5-en-mobile-int8', label: 'PP-OCRv5 English Mobile INT8', series: 'ppocrv5', tier: 'mobile-int8', lang: 'en',
    sizeLabel: '~10 MB',
    description: 'V5 英语移动端 INT8 量化模型，体积极小',
    files: [
      { role: 'detection', remoteFilename: 'PP-OCRv5_mobile_det_infer.ort', localFilename: 'PP-OCRv5_mobile_det_infer.ort', sizeBytes: 5_000_000 },
      { role: 'recognition', remoteFilename: 'en_PP-OCRv5_mobile_rec_infer_int8.ort', localFilename: 'en_PP-OCRv5_mobile_rec_infer_int8.ort', sizeBytes: 4_000_000 },
      { role: 'dictionary', remoteFilename: 'ppocrv5_en_dict.txt', localFilename: 'ppocrv5_en_dict.txt', sizeBytes: 100_000 },
    ],
  },
  {
    id: 'v5-en-server', label: 'PP-OCRv5 English Server', series: 'ppocrv5', tier: 'server', lang: 'en',
    sizeLabel: '~80 MB',
    description: 'V5 英语服务端模型',
    files: [
      { role: 'detection', remoteFilename: 'PP-OCRv5_server_det_infer.onnx', localFilename: 'PP-OCRv5_server_det_infer.onnx', sizeBytes: 50_000_000 },
      { role: 'recognition', remoteFilename: 'PP-OCRv5_server_rec_infer.onnx', localFilename: 'PP-OCRv5_server_rec_infer.onnx', sizeBytes: 80_000_000 },
      { role: 'dictionary', remoteFilename: 'ppocrv5_dict.txt', localFilename: 'ppocrv5_dict.txt', sizeBytes: 500_000 },
    ],
  },
  // ===== PP-OCRv5 其他语言系列 =====
  {
    id: 'v5-arabic-mobile', label: 'PP-OCRv5 Arabic Mobile', series: 'ppocrv5', tier: 'mobile', lang: 'arabic',
    sizeLabel: '~20 MB',
    description: 'V5 阿拉伯语移动端模型',
    files: [
      { role: 'detection', remoteFilename: 'PP-OCRv5_mobile_det_infer.onnx', localFilename: 'PP-OCRv5_mobile_det_infer.onnx', sizeBytes: 5_000_000 },
      { role: 'recognition', remoteFilename: 'arabic_PP-OCRv5_mobile_rec_infer.onnx', localFilename: 'arabic_PP-OCRv5_mobile_rec_infer.onnx', sizeBytes: 12_000_000 },
      { role: 'dictionary', remoteFilename: 'ppocrv5_arabic_dict.txt', localFilename: 'ppocrv5_arabic_dict.txt', sizeBytes: 100_000 },
    ],
  },
  {
    id: 'v5-cyrillic-mobile', label: 'PP-OCRv5 Cyrillic Mobile', series: 'ppocrv5', tier: 'mobile', lang: 'cyrillic',
    sizeLabel: '~20 MB',
    description: 'V5 西里尔语移动端模型',
    files: [
      { role: 'detection', remoteFilename: 'PP-OCRv5_mobile_det_infer.onnx', localFilename: 'PP-OCRv5_mobile_det_infer.onnx', sizeBytes: 5_000_000 },
      { role: 'recognition', remoteFilename: 'cyrillic_PP-OCRv5_mobile_rec_infer.onnx', localFilename: 'cyrillic_PP-OCRv5_mobile_rec_infer.onnx', sizeBytes: 12_000_000 },
      { role: 'dictionary', remoteFilename: 'ppocrv5_cyrillic_dict.txt', localFilename: 'ppocrv5_cyrillic_dict.txt', sizeBytes: 200_000 },
    ],
  },
  {
    id: 'v5-devanagari-mobile', label: 'PP-OCRv5 Devanagari Mobile', series: 'ppocrv5', tier: 'mobile', lang: 'devanagari',
    sizeLabel: '~20 MB',
    description: 'V5 天城文移动端模型',
    files: [
      { role: 'detection', remoteFilename: 'PP-OCRv5_mobile_det_infer.onnx', localFilename: 'PP-OCRv5_mobile_det_infer.onnx', sizeBytes: 5_000_000 },
      { role: 'recognition', remoteFilename: 'devanagari_PP-OCRv5_mobile_rec_infer.onnx', localFilename: 'devanagari_PP-OCRv5_mobile_rec_infer.onnx', sizeBytes: 12_000_000 },
      { role: 'dictionary', remoteFilename: 'ppocrv5_devanagari_dict.txt', localFilename: 'ppocrv5_devanagari_dict.txt', sizeBytes: 100_000 },
    ],
  },
  {
    id: 'v5-greek-mobile', label: 'PP-OCRv5 Greek Mobile', series: 'ppocrv5', tier: 'mobile', lang: 'greek',
    sizeLabel: '~20 MB',
    description: 'V5 希腊语移动端模型',
    files: [
      { role: 'detection', remoteFilename: 'PP-OCRv5_mobile_det_infer.onnx', localFilename: 'PP-OCRv5_mobile_det_infer.onnx', sizeBytes: 5_000_000 },
      { role: 'recognition', remoteFilename: 'el_PP-OCRv5_mobile_rec_infer.onnx', localFilename: 'el_PP-OCRv5_mobile_rec_infer.onnx', sizeBytes: 12_000_000 },
      { role: 'dictionary', remoteFilename: 'ppocrv5_el_dict.txt', localFilename: 'ppocrv5_el_dict.txt', sizeBytes: 100_000 },
    ],
  },
  {
    id: 'v5-eslav-mobile', label: 'PP-OCRv5 Eslav Mobile', series: 'ppocrv5', tier: 'mobile', lang: 'eslav',
    sizeLabel: '~20 MB',
    description: 'V5 斯拉夫语移动端模型',
    files: [
      { role: 'detection', remoteFilename: 'PP-OCRv5_mobile_det_infer.onnx', localFilename: 'PP-OCRv5_mobile_det_infer.onnx', sizeBytes: 5_000_000 },
      { role: 'recognition', remoteFilename: 'eslav_PP-OCRv5_mobile_rec_infer.onnx', localFilename: 'eslav_PP-OCRv5_mobile_rec_infer.onnx', sizeBytes: 12_000_000 },
      { role: 'dictionary', remoteFilename: 'ppocrv5_eslav_dict.txt', localFilename: 'ppocrv5_eslav_dict.txt', sizeBytes: 100_000 },
    ],
  },
  {
    id: 'v5-korean-mobile', label: 'PP-OCRv5 Korean Mobile', series: 'ppocrv5', tier: 'mobile', lang: 'korean',
    sizeLabel: '~20 MB',
    description: 'V5 韩语移动端模型',
    files: [
      { role: 'detection', remoteFilename: 'PP-OCRv5_mobile_det_infer.onnx', localFilename: 'PP-OCRv5_mobile_det_infer.onnx', sizeBytes: 5_000_000 },
      { role: 'recognition', remoteFilename: 'korean_PP-OCRv5_mobile_rec_infer.onnx', localFilename: 'korean_PP-OCRv5_mobile_rec_infer.onnx', sizeBytes: 12_000_000 },
      { role: 'dictionary', remoteFilename: 'ppocrv5_korean_dict.txt', localFilename: 'ppocrv5_korean_dict.txt', sizeBytes: 200_000 },
    ],
  },
  {
    id: 'v5-latin-mobile', label: 'PP-OCRv5 Latin Mobile', series: 'ppocrv5', tier: 'mobile', lang: 'latin',
    sizeLabel: '~20 MB',
    description: 'V5 拉丁语移动端模型',
    files: [
      { role: 'detection', remoteFilename: 'PP-OCRv5_mobile_det_infer.onnx', localFilename: 'PP-OCRv5_mobile_det_infer.onnx', sizeBytes: 5_000_000 },
      { role: 'recognition', remoteFilename: 'latin_PP-OCRv5_mobile_rec_infer.onnx', localFilename: 'latin_PP-OCRv5_mobile_rec_infer.onnx', sizeBytes: 12_000_000 },
      { role: 'dictionary', remoteFilename: 'ppocrv5_latin_dict.txt', localFilename: 'ppocrv5_latin_dict.txt', sizeBytes: 100_000 },
    ],
  },
  {
    id: 'v5-tamil-mobile', label: 'PP-OCRv5 Tamil Mobile', series: 'ppocrv5', tier: 'mobile', lang: 'tamil',
    sizeLabel: '~20 MB',
    description: 'V5 泰米尔语移动端模型',
    files: [
      { role: 'detection', remoteFilename: 'PP-OCRv5_mobile_det_infer.onnx', localFilename: 'PP-OCRv5_mobile_det_infer.onnx', sizeBytes: 5_000_000 },
      { role: 'recognition', remoteFilename: 'ta_PP-OCRv5_mobile_rec_infer.onnx', localFilename: 'ta_PP-OCRv5_mobile_rec_infer.onnx', sizeBytes: 12_000_000 },
      { role: 'dictionary', remoteFilename: 'ppocrv5_ta_dict.txt', localFilename: 'ppocrv5_ta_dict.txt', sizeBytes: 100_000 },
    ],
  },
  {
    id: 'v5-telugu-mobile', label: 'PP-OCRv5 Telugu Mobile', series: 'ppocrv5', tier: 'mobile', lang: 'telugu',
    sizeLabel: '~20 MB',
    description: 'V5 泰卢固语移动端模型',
    files: [
      { role: 'detection', remoteFilename: 'PP-OCRv5_mobile_det_infer.onnx', localFilename: 'PP-OCRv5_mobile_det_infer.onnx', sizeBytes: 5_000_000 },
      { role: 'recognition', remoteFilename: 'te_PP-OCRv5_mobile_rec_infer.onnx', localFilename: 'te_PP-OCRv5_mobile_rec_infer.onnx', sizeBytes: 12_000_000 },
      { role: 'dictionary', remoteFilename: 'ppocrv5_te_dict.txt', localFilename: 'ppocrv5_te_dict.txt', sizeBytes: 100_000 },
    ],
  },
  {
    id: 'v5-thai-mobile', label: 'PP-OCRv5 Thai Mobile', series: 'ppocrv5', tier: 'mobile', lang: 'thai',
    sizeLabel: '~20 MB',
    description: 'V5 泰语移动端模型',
    files: [
      { role: 'detection', remoteFilename: 'PP-OCRv5_mobile_det_infer.onnx', localFilename: 'PP-OCRv5_mobile_det_infer.onnx', sizeBytes: 5_000_000 },
      { role: 'recognition', remoteFilename: 'th_PP-OCRv5_mobile_rec_infer.onnx', localFilename: 'th_PP-OCRv5_mobile_rec_infer.onnx', sizeBytes: 12_000_000 },
      { role: 'dictionary', remoteFilename: 'ppocrv5_th_dict.txt', localFilename: 'ppocrv5_th_dict.txt', sizeBytes: 100_000 },
    ],
  },
  // ===== PP-OCRv4 系列 =====
  {
    id: 'v4-mobile', label: 'PP-OCRv4 Mobile', series: 'ppocrv4', tier: 'mobile', lang: 'multilingual',
    sizeLabel: '~20 MB',
    description: 'V4 移动端模型',
    files: [
      { role: 'detection', remoteFilename: 'PP-OCRv4_mobile_det_infer.onnx', localFilename: 'PP-OCRv4_mobile_det_infer.onnx', sizeBytes: 5_000_000 },
      { role: 'recognition', remoteFilename: 'PP-OCRv4_mobile_rec_infer.onnx', localFilename: 'PP-OCRv4_mobile_rec_infer.onnx', sizeBytes: 12_000_000 },
      { role: 'dictionary', remoteFilename: 'ppocrv4_dict.txt', localFilename: 'ppocrv4_dict.txt', sizeBytes: 500_000 },
    ],
  },
  {
    id: 'v4-server', label: 'PP-OCRv4 Server', series: 'ppocrv4', tier: 'server', lang: 'multilingual',
    sizeLabel: '~80 MB',
    description: 'V4 服务端模型',
    files: [
      { role: 'detection', remoteFilename: 'PP-OCRv4_server_det_infer.onnx', localFilename: 'PP-OCRv4_server_det_infer.onnx', sizeBytes: 50_000_000 },
      { role: 'recognition', remoteFilename: 'PP-OCRv4_server_rec_infer.onnx', localFilename: 'PP-OCRv4_server_rec_infer.onnx', sizeBytes: 80_000_000 },
      { role: 'dictionary', remoteFilename: 'ppocrv4_dict.txt', localFilename: 'ppocrv4_dict.txt', sizeBytes: 500_000 },
    ],
  },
  {
    id: 'v4-server-doc', label: 'PP-OCRv4 Server Doc', series: 'ppocrv4', tier: 'server-doc', lang: 'multilingual',
    sizeLabel: '~80 MB',
    description: 'V4 服务端文档模型，针对文档场景优化',
    files: [
      { role: 'detection', remoteFilename: 'PP-OCRv4_server_det_infer.onnx', localFilename: 'PP-OCRv4_server_det_infer.onnx', sizeBytes: 50_000_000 },
      { role: 'recognition', remoteFilename: 'PP-OCRv4_server_rec_doc_infer.onnx', localFilename: 'PP-OCRv4_server_rec_doc_infer.onnx', sizeBytes: 80_000_000 },
      { role: 'dictionary', remoteFilename: 'ppocrv4_doc_dict.txt', localFilename: 'ppocrv4_doc_dict.txt', sizeBytes: 500_000 },
    ],
  },
  {
    id: 'v4-en-mobile', label: 'PP-OCRv4 English Mobile', series: 'ppocrv4', tier: 'mobile', lang: 'en',
    sizeLabel: '~15 MB',
    description: 'V4 英语移动端模型',
    files: [
      { role: 'detection', remoteFilename: 'PP-OCRv4_mobile_det_infer.onnx', localFilename: 'PP-OCRv4_mobile_det_infer.onnx', sizeBytes: 5_000_000 },
      { role: 'recognition', remoteFilename: 'en_PP-OCRv4_mobile_rec_infer.onnx', localFilename: 'en_PP-OCRv4_mobile_rec_infer.onnx', sizeBytes: 8_000_000 },
      { role: 'dictionary', remoteFilename: 'en_dict.txt', localFilename: 'en_dict.txt', sizeBytes: 100_000 },
    ],
  },
  // ===== PP-OCRv3 系列 =====
  {
    id: 'v3-mobile', label: 'PP-OCRv3 Mobile', series: 'ppocrv3', tier: 'mobile', lang: 'multilingual',
    sizeLabel: '~20 MB',
    description: 'V3 移动端识别模型（搭配 V5 检测器）',
    files: [
      { role: 'detection', remoteFilename: 'PP-OCRv5_mobile_det_infer.onnx', localFilename: 'PP-OCRv5_mobile_det_infer.onnx', sizeBytes: 5_000_000 },
      { role: 'recognition', remoteFilename: 'PP-OCRv3_mobile_rec_infer.onnx', localFilename: 'PP-OCRv3_mobile_rec_infer.onnx', sizeBytes: 12_000_000 },
      { role: 'dictionary', remoteFilename: 'ppocrv3_dict.txt', localFilename: 'ppocrv3_dict.txt', sizeBytes: 500_000 },
    ],
  },
  {
    id: 'v3-japanese-mobile', label: 'PP-OCRv3 Japanese Mobile', series: 'ppocrv3', tier: 'mobile', lang: 'japanese',
    sizeLabel: '~20 MB',
    description: 'V3 日语移动端识别模型（搭配 V5 检测器）',
    files: [
      { role: 'detection', remoteFilename: 'PP-OCRv5_mobile_det_infer.onnx', localFilename: 'PP-OCRv5_mobile_det_infer.onnx', sizeBytes: 5_000_000 },
      { role: 'recognition', remoteFilename: 'japan_PP-OCRv3_mobile_rec_infer.onnx', localFilename: 'japan_PP-OCRv3_mobile_rec_infer.onnx', sizeBytes: 12_000_000 },
      { role: 'dictionary', remoteFilename: 'japan_dict.txt', localFilename: 'japan_dict.txt', sizeBytes: 200_000 },
    ],
  },
];

/** 进行中的下载任务 */
const activeDownloads = new Map<string, { abortController: AbortController }>();

/**
 * 获取模型存储目录路径
 */
export function getOcrModelDir(): string {
  const homeDir = os.homedir();
  return path.join(homeDir, '.diting', 'model', 'ocr');
}

/**
 * 确保模型存储目录存在
 */
export function ensureModelDir(): void {
  const dir = getOcrModelDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    logger.info(`[OcrModelService] 创建模型目录: ${dir}`);
  }
}

/**
 * 获取所有可用模型定义列表
 */
export function getAvailableModels(): OcrModelDef[] {
  return OCR_MODELS;
}

/**
 * 根据 ID 获取模型定义
 */
export function getModelDef(modelId: string): OcrModelDef | undefined {
  return OCR_MODELS.find((m) => m.id === modelId);
}

/**
 * 获取所有模型的状态（是否已下载等）
 */
export function getModelStatuses(): OcrModelStatus[] {
  ensureModelDir();
  const dir = getOcrModelDir();

  return OCR_MODELS.map((def) => {
    const filesReady: boolean[] = [];
    let actualSize = 0;

    for (const file of def.files) {
      const localPath = path.join(dir, file.localFilename);
      try {
        const stat = fs.statSync(localPath);
        if (stat.isFile()) {
          filesReady.push(true);
          actualSize += stat.size;
        } else {
          filesReady.push(false);
        }
      } catch {
        filesReady.push(false);
      }
    }

    return {
      def,
      ready: filesReady.every((r) => r),
      filesReady,
      actualSize: actualSize > 0 ? actualSize : null,
    };
  });
}

/**
 * 检查模型是否已就绪（全部文件存在）
 */
export function isModelReady(modelId: string): boolean {
  const def = getModelDef(modelId);
  if (!def) return false;

  const dir = getOcrModelDir();
  return def.files.every((file) => {
    const localPath = path.join(dir, file.localFilename);
    try {
      return fs.statSync(localPath).isFile();
    } catch {
      return false;
    }
  });
}

/**
 * 获取已就绪模型的本地文件路径
 *
 * 返回 PaddleOcrService 构造函数所需的 model 选项对象：
 *   { detection: string, recognition: string, charactersDictionary: string }
 */
export async function getSelectedModelPaths(modelId: string): Promise<{
  detection: string;
  recognition: string;
  charactersDictionary: string;
} | null> {
  const def = getModelDef(modelId);
  if (!def) return null;

  const dir = getOcrModelDir();
  const detectionPath = path.join(dir, def.files.find((f) => f.role === 'detection')!.localFilename);
  const recognitionPath = path.join(dir, def.files.find((f) => f.role === 'recognition')!.localFilename);
  const dictPath = path.join(dir, def.files.find((f) => f.role === 'dictionary')!.localFilename);

  // 检查文件是否存在
  if (!fs.existsSync(detectionPath) || !fs.existsSync(recognitionPath) || !fs.existsSync(dictPath)) {
    return null;
  }

  return {
    detection: detectionPath,
    recognition: recognitionPath,
    charactersDictionary: dictPath,
  };
}

/**
 * 下载单个文件（支持重定向）
 */
function downloadSingleFile(
  url: string,
  localPath: string,
  abortController: AbortController,
  onProgress?: (downloaded: number, total: number) => void,
): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const tempPath = `${localPath}.tmp`;

    // 清理残留临时文件
    try {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    } catch {
      // 忽略
    }

    const fileStream = fs.createWriteStream(tempPath);
    let downloadedBytes = 0;
    let totalBytes = 0;

    const cleanup = () => {
      try {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch {
        // 忽略
      }
      fileStream.destroy();
    };

    const makeRequest = (requestUrl: string, redirectCount = 0) => {
      if (redirectCount > 5) {
        cleanup();
        reject(new Error('重定向次数过多'));
        return;
      }

      https.get(requestUrl, {
        headers: { 'User-Agent': 'Diting-AI-Desktop/1.0' },
      }, (response) => {
        // 处理重定向
        if ([301, 302, 307, 308].includes(response.statusCode ?? 0)) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            logger.info(`[OcrModelService] 重定向到: ${redirectUrl}`);
            response.resume();
            makeRequest(redirectUrl, redirectCount + 1);
            return;
          }
        }

        if (response.statusCode !== 200) {
          cleanup();
          reject(new Error(`下载失败: HTTP ${response.statusCode}`));
          return;
        }

        totalBytes = parseInt(response.headers['content-length'] || '0', 10);

        response.on('data', (chunk: Buffer) => {
          if (abortController.signal.aborted) {
            response.destroy();
            cleanup();
            reject(new Error('下载已取消'));
            return;
          }
          downloadedBytes += chunk.length;
          onProgress?.(downloadedBytes, totalBytes);
        });

        response.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close((err) => {
            if (err) {
              cleanup();
              reject(err);
              return;
            }
            fs.renameSync(tempPath, localPath);
            resolve(downloadedBytes);
          });
        });
      }).on('error', (err) => {
        cleanup();
        reject(err);
      });
    };

    // 监听 abort
    abortController.signal.addEventListener('abort', () => {
      cleanup();
      reject(new Error('下载已取消'));
    });

    makeRequest(url);
  });
}

/**
 * 下载 OCR 模型（包含全部三个文件）
 *
 * @param modelId 模型 ID
 * @param useMirror 是否使用镜像
 * @param onProgress 进度回调
 */
export async function downloadOcrModel(
  modelId: string,
  useMirror: boolean,
  onProgress?: (progress: OcrDownloadProgress) => void,
): Promise<void> {
  const def = getModelDef(modelId);
  if (!def) {
    throw new Error(`未知模型 ID: ${modelId}`);
  }

  // 如果已有相同模型的下载在进行中，先取消
  const existing = activeDownloads.get(modelId);
  if (existing) {
    existing.abortController.abort();
    activeDownloads.delete(modelId);
  }

  ensureModelDir();
  const dir = getOcrModelDir();
  const abortController = new AbortController();
  activeDownloads.set(modelId, { abortController });

  // 获取模型 URL
  const presets = await getModelPresets();
  const urls = presets[modelId];
  if (!urls) {
    throw new Error(`找不到模型 ${modelId} 的 URL 定义`);
  }

  // 计算总大小
  const totalEstimated = def.files.reduce((sum, f) => sum + f.sizeBytes, 0);
  let cumulativeDownloaded = 0;

  logger.info(`[OcrModelService] 开始下载 OCR 模型: ${modelId} (共 ${def.files.length} 个文件)`);

  try {
    for (const file of def.files) {
      // 从 MODEL_PRESETS 获取真实 URL，并从中提取文件名
      let downloadUrl: string;
      if (file.role === 'detection') downloadUrl = urls.detection;
      else if (file.role === 'recognition') downloadUrl = urls.recognition;
      else downloadUrl = urls.charactersDictionary;

      // 从 URL 提取真实本地文件名（可能与 def 中的 remoteFilename 不同）
      const actualLocalFilename = extractFilename(downloadUrl);
      const localPath = path.join(dir, actualLocalFilename);

      // 如果文件已存在，跳过
      if (fs.existsSync(localPath)) {
        const stat = fs.statSync(localPath);
        if (stat.isFile() && stat.size > 0) {
          logger.info(`[OcrModelService] 文件已存在，跳过: ${actualLocalFilename}`);
          cumulativeDownloaded += file.sizeBytes;
          continue;
        }
      }

      // useMirror 目前不影响 URL（模型托管在 GitHub，无对应镜像）
      // 未来如果模型迁移到 HuggingFace，可在此处替换为 hf-mirror.com

      logger.info(`[OcrModelService] 下载文件: ${actualLocalFilename} from ${downloadUrl}`);

      const downloaded = await downloadSingleFile(
        downloadUrl,
        localPath,
        abortController,
        (fileDownloaded, fileTotal) => {
          const combinedDownloaded = cumulativeDownloaded + fileDownloaded;
          const combinedTotal = totalEstimated;
          const percent = combinedTotal > 0 ? (combinedDownloaded / combinedTotal) * 100 : 0;

          onProgress?.({
            modelId,
            filename: actualLocalFilename,
            downloaded: combinedDownloaded,
            total: combinedTotal,
            percent,
            speed: 0,
            done: false,
          });
        },
      );

      cumulativeDownloaded += downloaded;
    }

    // 下载完成
    activeDownloads.delete(modelId);
    onProgress?.({
      modelId,
      filename: '',
      downloaded: totalEstimated,
      total: totalEstimated,
      percent: 100,
      speed: 0,
      done: true,
    });

    logger.info(`[OcrModelService] 模型下载完成: ${modelId}`);
  } catch (err) {
    activeDownloads.delete(modelId);
    onProgress?.({
      modelId,
      filename: '',
      downloaded: 0,
      total: totalEstimated,
      percent: 0,
      speed: 0,
      done: true,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

/**
 * 取消模型下载
 */
export function cancelOcrDownload(modelId: string): boolean {
  const existing = activeDownloads.get(modelId);
  if (existing) {
    existing.abortController.abort();
    activeDownloads.delete(modelId);
    logger.info(`[OcrModelService] 取消下载: ${modelId}`);
    return true;
  }
  return false;
}

/**
 * 删除已下载的模型文件
 */
export function deleteOcrModel(modelId: string): boolean {
  const def = getModelDef(modelId);
  if (!def) return false;

  const dir = getOcrModelDir();
  let anyDeleted = false;

  for (const file of def.files) {
    const localPath = path.join(dir, file.localFilename);
    try {
      if (fs.existsSync(localPath)) {
        fs.unlinkSync(localPath);
        anyDeleted = true;
        logger.info(`[OcrModelService] 删除文件: ${file.localFilename}`);
      }
    } catch (err) {
      logger.error(`[OcrModelService] 删除文件失败: ${file.localFilename}`, err);
    }
  }

  return anyDeleted;
}
