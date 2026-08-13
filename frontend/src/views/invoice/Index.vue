<template>
  <div class="invoice-workspace">
    <!-- ========== 左侧：授权文件夹 + 文件树 ========== -->
    <div class="panel panel--file-tree" :style="{ width: panelWidth + 'px', flexShrink: 0 }">
      <!-- 顶部工具栏 -->
      <div class="panel__toolbar">
        <span class="panel__title">录入识读</span>
        <div class="panel__toolbar-right">
          <a-tag v-if="store.ocrProcessing" color="processing" class="ocr-tag">
            <a-spin size="small" style="margin-right: 4px" />
            识别中
          </a-tag>
          <a-tooltip title="刷新">
            <button class="panel-toggle-btn" @click="onRefresh">
              <ReloadOutlined />
            </button>
          </a-tooltip>
          <a-tooltip title="添加授权文件夹">
            <button class="panel-toggle-btn" @click="onAddFolder">
              <PlusOutlined />
            </button>
          </a-tooltip>
        </div>
      </div>

      <!-- 授权文件夹列表 -->
      <div class="folder-list-section">
        <div class="folder-list-header">
          <span class="folder-list-header__title">授权文件夹</span>
          <span class="folder-list-header__count">{{ store.folderList.length }}</span>
        </div>
        <div class="folder-list-body">
          <a-spin v-if="store.folderLoading" size="small" />
          <div
            v-for="folder in store.folderList"
            :key="folder.id"
            class="folder-item"
            :class="{ 'folder-item--active': store.selectedFolderId === folder.id }"
            @click="onSelectFolder(folder.id)"
          >
            <FolderOutlined class="folder-item__icon" />
            <span class="folder-item__name" :title="folder.path">{{ folder.folder_name }}</span>
            <button class="folder-item__delete" @click.stop="onDeleteFolder(folder)">
              <DeleteOutlined />
            </button>
          </div>
          <div v-if="!store.folderLoading && store.folderList.length === 0" class="folder-empty">
            暂无授权文件夹
          </div>
        </div>
      </div>

      <!-- 分隔线 -->
      <div class="panel__divider"></div>

      <!-- 文件树区域 -->
      <div class="file-tree-section">
        <div class="file-tree-header">
          <span class="file-tree-header__title">文件列表</span>
          <div class="file-tree-header__stats">
            <span class="stat-badge stat-badge--processed" :title="'已处理 ' + store.stats.processed + '/' + store.stats.total">
              {{ store.stats.processed }}/{{ store.stats.total }}
            </span>
            <span v-if="store.stats.archived > 0" class="stat-badge stat-badge--archived" :title="'已归档 ' + store.stats.archived">
              归档 {{ store.stats.archived }}
            </span>
          </div>
        </div>

        <!-- 当前文件夹路径显示 -->
        <div v-if="store.folderPathDisplay" class="file-tree-path" :title="store.folderPathDisplay">
          <FolderOutlined class="file-tree-path__icon" />
          <span class="file-tree-path__text">{{ store.folderPathDisplay }}</span>
        </div>

        <div class="file-tree-body">
          <a-spin v-if="store.fileLoading" size="small" />
          <div v-else-if="flatFileTree.length === 0" class="file-tree-empty">
            <FolderOutlined style="font-size: 28px; opacity: 0.4" />
            <p>{{ store.folderList.length === 0 ? '请先添加授权文件夹' : '该文件夹下暂无文件' }}</p>
          </div>
          <div v-else class="file-tree">
            <div
              v-for="node in flatFileTree"
              :key="node.path"
              class="file-tree__item"
              :class="{
                'file-tree__item--dir': node.isDir,
                'file-tree__item--expanded': node.isDir && node.expanded,
                'file-tree__item--selected': !node.isDir && store.selectedFile?.id === node.id,
                'file-tree__item--archived': !node.isDir && node.archived === 1,
              }"
              :style="{ paddingLeft: 8 + node.depth * 16 + 'px' }"
              @click="node.isDir ? toggleDir(node) : onSelectFile(node)"
            >
              <component
                v-if="node.isDir"
                :is="node.expanded ? 'DownOutlined' : 'RightOutlined'"
                class="file-tree__arrow"
              />
              <span v-else class="file-tree__arrow-spacer" />
              <component :is="node.isDir ? 'FolderOutlined' : 'FileOutlined'" class="file-tree__icon" />
              <span class="file-tree__name">{{ node.name }}</span>
              <!-- 文件状态标识 -->
              <template v-if="!node.isDir">
                <!-- 已处理 / 未处理 / 不支持 标识 -->
                <span
                  class="file-status-badge"
                  :class="node.processed === 1 ? 'file-status-badge--processed' : node.processed === 2 ? 'file-status-badge--failed' : isSupportedFile(node.name) ? 'file-status-badge--unprocessed' : 'file-status-badge--unsupported'"
                  :title="node.processed === 1 ? '已识别' : node.processed === 2 ? '识别失败' : isSupportedFile(node.name) ? '未识别' : '不支持的文件类型'"
                >
                  <CheckOutlined v-if="node.processed === 1" />
                  <CloseOutlined v-else-if="node.processed === 2 || !isSupportedFile(node.name)" />
                  <LoadingOutlined v-else-if="isSupportedFile(node.name)" />
                </span>
                <!-- 已归档标识 -->
                <span
                  v-if="node.archived === 1"
                  class="file-status-badge file-status-badge--archived"
                  title="已归档"
                >
                  <FolderOpenOutlined />
                </span>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 分隔条 -->
    <PanelDivider @resize="onPanelResize" />

    <!-- ========== 右侧：内容区 ========== -->
    <div class="panel panel--content">
      <!-- 选中文件时的内容 -->
      <template v-if="store.selectedFile">
        <!-- 顶部工具栏 -->
        <div class="content-toolbar">
          <div class="content-toolbar__left">
            <FileOutlined class="content-toolbar__icon" />
            <span class="content-toolbar__name" :title="store.selectedFile.name">{{ store.selectedFile.name }}</span>
            <!-- 状态标识 -->
            <span
              class="content-status-tag"
              :class="store.selectedFile.processed === 1 ? 'content-status-tag--processed' : store.selectedFile.processed === 2 ? 'content-status-tag--failed' : 'content-status-tag--unprocessed'"
            >
              {{ store.selectedFile.processed === 1 ? '已识别' : store.selectedFile.processed === 2 ? '识别失败' : '未识别' }}
            </span>
            <span
              class="content-status-tag"
              :class="store.selectedFile.archived === 1 ? 'content-status-tag--archived' : 'content-status-tag--unarchived'"
            >
              {{ store.selectedFile.archived === 1 ? '已归档' : '未归档' }}
            </span>
          </div>
          <div class="content-toolbar__right">
            <a-button
              size="small"
              :loading="reRecognizing"
              @click="onReRecognize"
            >
              <template #icon><ReloadOutlined /></template>
              重新识别
            </a-button>
            <a-button
              size="small"
              :type="store.selectedFile.archived === 1 ? 'default' : 'primary'"
              @click="onToggleArchived"
            >
              {{ store.selectedFile.archived === 1 ? '取消归档' : '归档' }}
            </a-button>
          </div>
        </div>

        <!-- 双栏内容区：左图片 + 右结构化数据 -->
        <div class="content-body-split">
          <!-- 左栏：图片查看器 / PDF 查看器 + 识别区域浮层 -->
          <div class="image-viewer">
            <!-- PDF 连续渲染模式 -->
            <PdfAnnotationViewer
              v-if="pdfUrl"
              :key="store.selectedFile?.id"
              :src="pdfUrl"
              :ocr-data="ocrData"
            />

            <!-- 图片模式 -->
            <template v-else>
            <!-- 缩放工具栏 -->
            <div class="image-viewer__toolbar">
              <span class="image-viewer__info">
                {{ currentPageOcrBoxes.length }} 个识别区域
                <span v-if="pageImages.length > 1" class="image-viewer__pages">· 第 {{ currentPageIdx + 1 }}/{{ pageImages.length }} 页</span>
              </span>
              <div class="image-viewer__zoom">
                <button class="zoom-btn" @click="zoomOut" :disabled="zoom <= 0.1">
                  <ZoomOutOutlined />
                </button>
                <span class="zoom-level">{{ Math.round(zoom * 100) }}%</span>
                <button class="zoom-btn" @click="zoomIn" :disabled="zoom >= 5">
                  <ZoomInOutlined />
                </button>
                <button class="zoom-btn" @click="resetZoom" title="重置缩放">
                  <ExpandOutlined />
                </button>
              </div>
            </div>

            <!-- 图片容器 -->
            <div
              class="image-viewer__container"
              ref="imageContainerRef"
              @wheel="onWheel"
            >
              <div v-if="detailLoading" class="detail-loading">
                <a-spin tip="加载中..." />
              </div>
              <div v-else-if="currentImageData" class="image-wrapper" :style="{ transform: `scale(${zoom})`, transformOrigin: 'center' }">
                <img
                  :src="currentImageData"
                  class="ocr-image"
                  ref="ocrImageRef"
                  @load="onImageLoad"
                />
                <!-- OCR 识别区域浮层 -->
                <div
                  v-for="(box, idx) in currentPageOcrBoxes"
                  :key="idx"
                  class="ocr-box"
                  :class="{ 'ocr-box--active': activeBoxIdx === idx }"
                  :style="getBoxStyle(box)"
                  @mouseenter="activeBoxIdx = idx"
                  @mouseleave="activeBoxIdx = -1"
                >
                  <span class="ocr-box__label">{{ box.text }}</span>
                </div>
              </div>
              <div v-else class="image-empty">
                <FileSearchOutlined style="font-size: 40px; opacity: 0.3" />
                <p>无法加载图片</p>
              </div>
            </div>

            <!-- 多页缩略图栏 -->
            <div v-if="pageImages.length > 1" class="image-viewer__thumbs">
              <div
                v-for="(img, idx) in pageImages"
                :key="idx"
                class="thumb-item"
                :class="{ 'thumb-item--active': currentPageIdx === idx }"
                @click="switchPage(idx)"
              >
                <img :src="img" class="thumb-item__img" />
                <span class="thumb-item__label">{{ idx + 1 }}</span>
              </div>
            </div>
            </template>
          </div>

          <!-- 右栏：结构化内容 -->
          <div class="result-panel">
            <!-- 标签页 -->
            <div class="result-panel__tabs">
              <button
                class="result-tab"
                :class="{ 'result-tab--active': resultTab === 'fields' }"
                @click="resultTab = 'fields'"
              >
                识别区域 ({{ currentPageOcrBoxes.length }})
              </button>
              <button
                class="result-tab"
                :class="{ 'result-tab--active': resultTab === 'text' }"
                @click="resultTab = 'text'"
              >
                全文文本
              </button>
              <button
                class="result-tab"
                :class="{ 'result-tab--active': resultTab === 'ai' }"
                @click="resultTab = 'ai'"
              >
                AI 识别
                <span v-if="aiData" class="result-tab__badge">✓</span>
              </button>
            </div>

            <!-- 识别区域列表 -->
            <div v-if="resultTab === 'fields'" class="result-panel__body">
              <div v-if="currentPageOcrBoxes.length === 0" class="result-empty">
                <p>暂无识别结果</p>
                <p class="result-empty__hint" v-if="store.selectedFile.processed === 0">文件尚未处理，请等待自动识别</p>
              </div>
              <div
                v-for="(box, idx) in currentPageOcrBoxes"
                :key="idx"
                class="result-item"
                :class="{ 'result-item--active': activeBoxIdx === idx }"
                @mouseenter="activeBoxIdx = idx"
                @mouseleave="activeBoxIdx = -1"
              >
                <span class="result-item__index">{{ idx + 1 }}</span>
                <span class="result-item__text">{{ box.text }}</span>
                <span class="result-item__confidence" :title="'置信度 ' + (box.confidence * 100).toFixed(1) + '%'">
                  {{ (box.confidence * 100).toFixed(0) }}%
                </span>
              </div>
            </div>

            <!-- 全文文本 -->
            <div v-if="resultTab === 'text'" class="result-panel__body">
              <div class="result-text-actions">
                <a-button size="small" type="text" @click="copyOcrText">
                  <CopyOutlined />
                  <span>复制全文</span>
                </a-button>
              </div>
              <div class="result-text-content">{{ ocrText || '暂无识别文本' }}</div>
            </div>

            <!-- AI 结构化结果（按大类/小类动态展示） -->
            <div v-if="resultTab === 'ai'" class="result-panel__body">
              <div v-if="aiLoading" class="ai-loading">
                <a-spin tip="AI 提取中..." />
                <p class="ai-loading__hint">步骤 1: 文档分类 → 步骤 2: 结构化提取</p>
              </div>
              <div v-else-if="aiData" class="ai-result">
                <!-- 操作按钮 -->
                <div class="ai-result__actions">
                  <a-button size="small" type="text" @click="copyAiData">
                    <CopyOutlined />
                    <span>复制 JSON</span>
                  </a-button>
                  <a-button size="small" type="text" @click="onExtractInvoice" :disabled="aiLoading">
                    <ReloadOutlined />
                    <span>重新提取</span>
                  </a-button>
                </div>

                <!-- 文档分类信息 -->
                <div class="ai-classify-header">
                  <div class="ai-classify-header__main">
                    <span class="ai-classify-header__category">{{ aiData.category_display || '未知' }}</span>
                    <span class="ai-classify-header__separator">/</span>
                    <span class="ai-classify-header__type">{{ aiData.type_name || '未知' }}</span>
                  </div>
                  <div class="ai-classify-header__meta">
                    <span class="ai-classify-tag" :class="{ 'ai-classify-tag--review': aiData.needs_review }">
                      {{ (aiData.confidence * 100).toFixed(0) }}% 置信
                    </span>
                    <span v-if="aiData.needs_review" class="ai-classify-tag ai-classify-tag--warn">需复核</span>
                    <span v-else class="ai-classify-tag ai-classify-tag--ok">已确认</span>
                  </div>
                </div>

                <!-- 类型编码 -->
                <div class="ai-field">
                  <span class="ai-field__label">类型编码</span>
                  <span class="ai-field__value">{{ aiData.type_code || '-' }}</span>
                </div>

                <!-- 结构化数据：递归渲染 -->
                <template v-if="aiData.structured_data">
                  <template v-for="(val, key) in aiData.structured_data" :key="key">
                    <!-- 嵌套对象 -->
                    <div v-if="isObject(val)" class="ai-section">
                      <div class="ai-section__title">{{ key }}</div>
                      <div class="ai-field" v-for="(subVal, subKey) in val" :key="subKey">
                        <span class="ai-field__label">{{ subKey }}</span>
                        <span class="ai-field__value">{{ formatValue(subVal) }}</span>
                      </div>
                    </div>
                    <!-- 数组（明细项） -->
                    <div v-else-if="isArray(val) && val.length > 0" class="ai-section">
                      <div class="ai-section__title">{{ key }} ({{ val.length }})</div>
                      <div class="ai-line-item" v-for="(item, idx) in val" :key="idx">
                        <span class="ai-line-item__index">{{ idx + 1 }}</span>
                        <div class="ai-line-item__body">
                          <div class="ai-field" v-for="(itemVal, itemKey) in item" :key="itemKey">
                            <span class="ai-field__label">{{ itemKey }}</span>
                            <span class="ai-field__value">{{ formatValue(itemVal) }}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <!-- 简单值 -->
                    <div v-else class="ai-field">
                      <span class="ai-field__label">{{ key }}</span>
                      <span class="ai-field__value">{{ formatValue(val) }}</span>
                    </div>
                  </template>
                </template>
              </div>
              <div v-else class="result-empty">
                <p>暂未进行 AI 提取</p>
                <p class="result-empty__hint">点击下方按钮进行 AI 结构化提取</p>
                <a-button type="primary" size="small" @click="onExtractInvoice" :disabled="!ocrText || aiLoading" style="margin-top: 12px">
                  <template #icon><RobotOutlined /></template>
                  AI 提取
                </a-button>
                <p v-if="!ocrText" class="result-empty__hint" style="margin-top: 8px">需先完成 OCR 识别</p>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- 未选中文件时的介绍页 -->
      <div v-else class="content-placeholder">
        <div class="intro-page">
          <!-- 头部 -->
          <div class="intro-header">
            <div class="intro-header__icon">
              <FileSearchOutlined />
            </div>
            <h2 class="intro-header__title">录入识读</h2>
            <p class="intro-header__desc">从左侧选择文件查看识别结果，或先了解以下能力总览</p>
          </div>

          <!-- 核心优势 -->
          <div class="intro-section">
            <h3 class="intro-section__title">核心优势</h3>
            <div class="intro-advantages">
              <div class="advantage-card">
                <div class="advantage-card__icon">
                  <SafetyCertificateOutlined />
                </div>
                <div class="advantage-card__body">
                  <div class="advantage-card__name">本地识别，数据不出电脑</div>
                  <p class="advantage-card__desc">所有图片的识别、文字提取、结构化解析都在本地完成，原始图片和识别结果不会上传到任何外部服务器，从根本上保障数据安全与隐私合规。</p>
                </div>
              </div>
              <div class="advantage-card">
                <div class="advantage-card__icon">
                  <AppstoreOutlined />
                </div>
                <div class="advantage-card__body">
                  <div class="advantage-card__name">覆盖全面，一机通识</div>
                  <p class="advantage-card__desc">支持 40+ 种主流票据与证件的高精度识别，涵盖财务报销、交通出行、资质证照等核心业务场景。</p>
                </div>
              </div>
              <div class="advantage-card">
                <div class="advantage-card__icon">
                  <RobotOutlined />
                </div>
                <div class="advantage-card__body">
                  <div class="advantage-card__name">智能提取，识用一体</div>
                  <p class="advantage-card__desc">识别结果自动映射为结构化字段（金额、日期、票号、销方/购方等），异构数据归一为统一视图，支持跨类型检索、统计与多格式导出。</p>
                </div>
              </div>
            </div>
          </div>

          <!-- 识别能力 -->
          <div class="intro-section">
            <h3 class="intro-section__title">识别能力</h3>
            <div class="intro-capabilities">
              <div class="capability-item">
                <div class="capability-item__header">
                  <span class="capability-item__badge capability-item__badge--finance">财税报销</span>
                  <span class="capability-item__count">13 种</span>
                </div>
                <p class="capability-item__desc">增值税发票（专用/普通/电子/卷票/区块链）、定额发票、通用机打发票、火车票、出租车票、飞机行程单、汽车票、过路过桥费发票、船票、网约车行程单、购物小票、银行回单、智能票据混贴。</p>
              </div>
              <div class="capability-item">
                <div class="capability-item__header">
                  <span class="capability-item__badge capability-item__badge--card">资质证照</span>
                  <span class="capability-item__count">11 种</span>
                </div>
                <p class="capability-item__desc">身份证、银行卡、营业执照、护照、社保卡、港澳台证件、户口本、出生证明、结婚证、离婚证、房产证。</p>
              </div>
              <div class="capability-item">
                <div class="capability-item__header">
                  <span class="capability-item__badge capability-item__badge--traffic">交通出行</span>
                  <span class="capability-item__count">7 种</span>
                </div>
                <p class="capability-item__desc">车牌识别、VIN码识别、驾驶证、行驶证、机动车销售发票、车辆合格证、二手车销售发票。</p>
              </div>
<!-- 暂时屏蔽的医疗健康 -->
<!--
<div class="capability-item">
<div class="capability-item__header">
<span class="capability-item__badge capability-item__badge--medical">医疗健康</span>
<span class="capability-item__count">7 种</span>
</div>
<p class="capability-item__desc">医疗发票、医疗费用明细、费用结算单、检验报告单、诊断报告单、病案首页、出院小结。</p>
</div>
-->
<!-- 暂时屏蔽的教育培训 -->
<!--
<div class="capability-item">
<div class="capability-item__header">
<span class="capability-item__badge capability-item__badge--education">教育培训</span>
<span class="capability-item__count">2 种</span>
</div>
<p class="capability-item__desc">试卷分析与识别、试卷切题识别。</p>
</div>
-->
<!-- 暂时屏蔽的通用识别 -->
<!--
<div class="capability-item">
<div class="capability-item__header">
<span class="capability-item__badge capability-item__badge--general">通用识别</span>
<span class="capability-item__count">5 种</span>
</div>
<p class="capability-item__desc">通用文字识别（标准版）、通用文字识别（高精度版）、表格文字识别、二维码识别、印章识别。</p>
</div>
-->
<!-- 暂时屏蔽的其他场景 -->
<!--
<div class="capability-item">
<div class="capability-item__header">
<span class="capability-item__badge capability-item__badge--other">其他场景</span>
<span class="capability-item__count">2 种</span>
</div>
<p class="capability-item__desc">仪器仪表盘读数识别、门脸文字识别。</p>
</div>
-->
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { message, Modal } from 'ant-design-vue'
import {
  FolderOutlined,
  FileOutlined,
  FileSearchOutlined,
  DownOutlined,
  RightOutlined,
  ReloadOutlined,
  PlusOutlined,
  DeleteOutlined,
  CheckOutlined,
  CloseOutlined,
  LoadingOutlined,
  FolderOpenOutlined,
  CopyOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  ExpandOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  AppstoreOutlined,
} from '@ant-design/icons-vue'
import { useInvoiceStore } from '@/stores/invoice'
import PanelDivider from '@/components/layout/PanelDivider.vue'
import PdfAnnotationViewer from '@/components/invoice/PdfAnnotationViewer.vue'

const store = useInvoiceStore()

// ========== 面板宽度 ==========
const panelWidth = ref(280)

function onPanelResize(delta) {
  panelWidth.value = Math.max(200, panelWidth.value + delta)
}

// ========== 支持的文件格式 ==========
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.bmp', '.webp', '.tiff', '.tif']
const PDF_EXTENSIONS = ['.pdf']
const SUPPORTED_EXTENSIONS = [...IMAGE_EXTENSIONS, ...PDF_EXTENSIONS]

function isImageFile(fileName) {
  const ext = '.' + (fileName.split('.').pop() || '').toLowerCase()
  return IMAGE_EXTENSIONS.includes(ext)
}

function isPdfFile(fileName) {
  const ext = '.' + (fileName.split('.').pop() || '').toLowerCase()
  return PDF_EXTENSIONS.includes(ext)
}

function isSupportedFile(fileName) {
  const ext = '.' + (fileName.split('.').pop() || '').toLowerCase()
  return SUPPORTED_EXTENSIONS.includes(ext)
}

// ========== 文件树展开状态 ==========
const expandedDirs = ref(new Set())

/** 将扁平文件列表转换为树形结构 */
function buildFileTreeData(flatList) {
  const root = []
  const dirMap = new Map()

  for (const item of flatList) {
    const parts = item.path.split('/')
    const name = parts[parts.length - 1]
    const parentPath = parts.length > 1 ? parts.slice(0, -1).join('/') : ''

    const node = {
      ...item,
      name,
      depth: parts.length - 1,
      expanded: expandedDirs.value.has(item.path),
      children: [],
    }

    if (parentPath && dirMap.has(parentPath)) {
      dirMap.get(parentPath).children.push(node)
    } else {
      root.push(node)
    }

    if (item.isDir) {
      dirMap.set(item.path, node)
    }
  }

  return root
}

/** 递归展平树为列表 */
function flattenTree(nodes, depth = 0, result = []) {
  for (const node of nodes) {
    node.depth = depth
    node.expanded = expandedDirs.value.has(node.path)
    result.push(node)
    if (node.isDir && node.expanded && node.children.length > 0) {
      flattenTree(node.children, depth + 1, result)
    }
  }
  return result
}

/** 展平后的文件树 */
const flatFileTree = computed(() => {
  const tree = buildFileTreeData(store.fileTree)
  return flattenTree(tree)
})

/** 展开/折叠目录 */
function toggleDir(node) {
  if (expandedDirs.value.has(node.path)) {
    expandedDirs.value.delete(node.path)
  } else {
    expandedDirs.value.add(node.path)
  }
  expandedDirs.value = new Set(expandedDirs.value)
}

// ========== 文件夹操作 ==========

function onSelectFolder(folderId) {
  store.selectFolder(folderId)
  store.loadFileTree()
}

async function onAddFolder() {
  const result = await store.addFolder()
  if (result?.success) {
    message.success('文件夹添加成功')
    await store.loadFileTree()
  } else if (result?.message && result.message !== '用户取消选择') {
    message.warning(result.message)
  }
}

function onDeleteFolder(folder) {
  Modal.confirm({
    title: '删除文件夹',
    content: `确定要删除文件夹「${folder.folder_name}」吗？仅移除授权，不删除实际文件。`,
    okText: '确认删除',
    cancelText: '取消',
    okType: 'danger',
    async onOk() {
      const result = await store.deleteFolder(folder.id)
      if (result?.success) {
        message.success('文件夹已删除')
        await store.loadFileTree()
      } else {
        message.error('删除文件夹失败')
      }
    },
  })
}

// ========== 文件操作 ==========

const detailLoading = ref(false)
const imageData = ref('')
const ocrText = ref('')
const ocrBoxes = ref([])
const ocrData = ref(null)
const activeBoxIdx = ref(-1)
const resultTab = ref('fields')
const zoom = ref(1)
const imageNaturalSize = ref({ width: 0, height: 0 })
const imageContainerRef = ref(null)
const ocrImageRef = ref(null)
const aiData = ref(null)
const aiLoading = ref(false)
const reRecognizing = ref(false)
const pageImages = ref([])
const pdfUrl = ref('')  // Blob URL，由 pdfBuffer 创建
const currentPageIdx = ref(0)

// 当前显示的图片（多页时根据 currentPageIdx 选择）
const currentImageData = computed(() => {
  if (pageImages.value.length > 0) {
    return pageImages.value[currentPageIdx.value] || imageData.value
  }
  return imageData.value
})

// 当前页的 OCR 识别区域（根据 currentPageIdx 从 ocrData.pages 中取）
const currentPageOcrBoxes = computed(() => {
  if (pageImages.value.length <= 1) return ocrBoxes.value
  const pages = ocrData.value?.pages || []
  const page = pages[currentPageIdx.value]
  return page?.boxes || []
})

// 当前页码文本
const currentPageText = computed(() => {
  if (pageImages.value.length <= 1) return ocrText.value
  const pages = ocrData.value?.pages || []
  return pages[currentPageIdx.value]?.text || ''
})

// ========== 通用辅助函数 ==========

/** 判断是否为对象（非数组、非 null） */
function isObject(val) {
  return val !== null && typeof val === 'object' && !Array.isArray(val)
}

/** 判断是否为数组 */
function isArray(val) {
  return Array.isArray(val)
}

/** 格式化值用于显示：null → '-', 对象/数组 → JSON 字符串，其他 → String */
function formatValue(val) {
  if (val === null || val === undefined) return '-'
  if (typeof val === 'object') return JSON.stringify(val)
  return String(val)
}

async function onSelectFile(file) {
  // 不支持的文件类型不响应点击
  if (!file.isDir && !isSupportedFile(file.name)) {
    return
  }
  store.setSelectedFile(file)
  imageData.value = ''
  ocrText.value = ''
  ocrBoxes.value = []
  ocrData.value = null
  activeBoxIdx.value = -1
  zoom.value = 1
  aiData.value = null
  pageImages.value = []
  // 释放旧的 Blob URL
  if (pdfUrl.value) {
    URL.revokeObjectURL(pdfUrl.value)
  }
  pdfUrl.value = ''
  currentPageIdx.value = 0

  // 加载文件详情（图片 + OCR 结果）
  detailLoading.value = true
  const result = await store.getFileDetail(file.id)
  detailLoading.value = false

  if (result.success) {
    imageData.value = result.imageData || ''
    // 从 Buffer 创建 Blob URL，供 pdf.js 加载
    if (result.pdfBuffer) {
      const blob = new Blob([result.pdfBuffer], { type: 'application/pdf' })
      pdfUrl.value = URL.createObjectURL(blob)
    }
    ocrText.value = result.ocrText || ''
    if (result.ocrData) {
      ocrData.value = result.ocrData
      if (result.ocrData.boxes) {
        ocrBoxes.value = result.ocrData.boxes
      }
    }
    aiData.value = result.aiData || null
    if (result.pageImages && result.pageImages.length > 0) {
      pageImages.value = result.pageImages
    }
  }
}

/** 计算识别区域浮层样式 */
function getBoxStyle(box) {
  const { width: naturalW, height: naturalH } = imageNaturalSize.value
  if (!naturalW || !naturalH) return {}
  // box.box 坐标是相对于原始图片的像素坐标
  // 转为百分比定位，这样在任何缩放下都能正确显示
  const x = (box.box.x / naturalW) * 100
  const y = (box.box.y / naturalH) * 100
  const w = (box.box.width / naturalW) * 100
  const h = (box.box.height / naturalH) * 100
  return {
    left: `${x}%`,
    top: `${y}%`,
    width: `${w}%`,
    height: `${h}%`,
  }
}

/** 图片加载完成后记录原始尺寸 */
function onImageLoad(e) {
  imageNaturalSize.value = {
    width: e.target.naturalWidth,
    height: e.target.naturalHeight,
  }
}

/** 缩放控制 */
function zoomIn() {
  zoom.value = Math.min(5, zoom.value + 0.2)
}

function zoomOut() {
  zoom.value = Math.max(0.1, zoom.value - 0.2)
}

function resetZoom() {
  zoom.value = 1
}

function onWheel(e) {
  e.preventDefault()
  if (e.deltaY < 0) {
    zoomIn()
  } else {
    zoomOut()
  }
}

/** 切换页面 */
function switchPage(idx) {
  if (idx < 0 || idx >= pageImages.value.length) return
  currentPageIdx.value = idx
  activeBoxIdx.value = -1
  zoom.value = 1
  // 重置图片尺寸，下一帧 onImageLoad 会更新
  imageNaturalSize.value = { width: 0, height: 0 }
}

/** AI 结构化提取 */
async function onExtractInvoice() {
  if (!store.selectedFile) return
  aiLoading.value = true
  try {
    const result = await store.extractInvoice(store.selectedFile.id)
    if (result.success && result.data) {
      aiData.value = result.data
      message.success('AI 提取成功')
    } else {
      message.error(result.error || 'AI 提取失败')
    }
  } catch (err) {
    message.error('AI 提取失败: ' + String(err))
  } finally {
    aiLoading.value = false
  }
}

/** 复制 AI JSON */
async function copyAiData() {
  if (!aiData.value) return
  try {
    await navigator.clipboard.writeText(JSON.stringify(aiData.value, null, 2))
    message.success('已复制到剪贴板')
  } catch {
    message.error('复制失败')
  }
}

/** 重新识别：清除旧数据 → 重新 OCR → 刷新预览和右侧数据 */
async function onReRecognize() {
  if (!store.selectedFile) return
  reRecognizing.value = true
  try {
    const result = await store.reRecognize(store.selectedFile.id)
    if (result.success) {
      message.success('重新识别完成')
      // 刷新文件树中该文件的状态
      const file = store.fileTree.find((f) => f.id === store.selectedFile.id)
      if (file) {
        file.processed = 1
      }
      // 重新加载文件详情（图片/PDF 预览 + OCR 结果 + AI 数据）
      await onSelectFile(store.selectedFile)
    } else {
      message.error(result.error || '重新识别失败')
      // 刷新文件树中该文件的状态（可能标记为失败）
      const file = store.fileTree.find((f) => f.id === store.selectedFile.id)
      if (file) {
        file.processed = 2
      }
    }
  } catch (err) {
    message.error('重新识别失败: ' + String(err))
  } finally {
    reRecognizing.value = false
  }
}

/** 切换归档状态 */
async function onToggleArchived() {
  if (!store.selectedFile) return
  const result = await store.toggleArchived(store.selectedFile.id)
  if (result?.success) {
    message.success(result.file.archived === 1 ? '已归档' : '已取消归档')
  } else {
    message.error('操作失败')
  }
}

/** 复制 OCR 文本 */
async function copyOcrText() {
  if (!ocrText.value) return
  try {
    await navigator.clipboard.writeText(ocrText.value)
    message.success('已复制到剪贴板')
  } catch {
    message.error('复制失败')
  }
}

/** 刷新 */
function onRefresh() {
  store.loadFileTree()
}

// ========== 生命周期 ==========

let syncCleanup = null
let ocrCleanup = null

onMounted(async () => {
  await store.loadFolderList()
  store.registerSyncCallback()

  // 文件变化监听
  syncCleanup = store.onSyncChange((folderId) => {
    if (store.selectedFolderId === folderId) {
      store.loadFileTree()
    }
  })

  // OCR 进度监听
  ocrCleanup = store.onOcrProgress((info) => {
    // OCR 完成时，如果当前选中的是该文件，重新加载详情
    if (info.status === 'done' && store.selectedFile?.id === info.fileId) {
      onSelectFile(store.selectedFile)
    }
  })

  if (store.selectedFolderId) {
    await store.loadFileTree()
  }
})

onUnmounted(() => {
  if (syncCleanup) syncCleanup()
  if (ocrCleanup) ocrCleanup()
  // 释放 PDF Blob URL
  if (pdfUrl.value) {
    URL.revokeObjectURL(pdfUrl.value)
    pdfUrl.value = ''
  }
})

// 监听文件夹选中变化
watch(() => store.selectedFolderId, () => {
  store.loadFileTree()
  ocrText.value = ''
})
</script>

<style lang="less" scoped>
.invoice-workspace {
  display: flex;
  height: 100%;
  width: 100%;
  overflow: hidden;
  background-color: var(--bg-layout);
}

// ========== 通用面板 ==========
.panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  overflow: hidden;
  background-color: var(--bg-panel);

  &__toolbar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 8px;
    height: 40px;
    flex-shrink: 0;
    border-bottom: 1px solid var(--border-color);
  }

  &__title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
  }

  &__toolbar-right {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;
  }

  &__divider {
    height: 1px;
    background: var(--border-color);
    flex-shrink: 0;
  }
}

// ========== OCR 标签 ==========
.ocr-tag {
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  margin: 0;
}

// ========== 工具栏按钮 ==========
.panel-toggle-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
  font-size: 14px;

  &:hover {
    background-color: var(--bg-hover);
    color: var(--text-primary);
  }
}

// ========== 授权文件夹列表 ==========
.folder-list-section {
  flex-shrink: 0;
  max-height: 200px;
  display: flex;
  flex-direction: column;
}

.folder-list-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px 4px;

  &__title {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-muted);
    flex: 1;
  }

  &__count {
    font-size: 11px;
    color: var(--text-muted);
    background: var(--bg-active);
    padding: 0 6px;
    border-radius: 8px;
    height: 16px;
    line-height: 16px;
  }
}

.folder-list-body {
  overflow-y: auto;
  padding: 0 4px 4px;

  &::-webkit-scrollbar {
    width: 0;
    display: none;
  }
}

.folder-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  height: 32px;
  border-radius: 7px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-secondary);
  transition: background-color 0.15s ease, color 0.15s ease;
  position: relative;
  margin-bottom: 1px;

  &:hover {
    background: var(--bg-hover);
    color: var(--text-primary);

    .folder-item__delete {
      opacity: 1;
    }
  }

  &--active {
    background: var(--bg-active);
    color: var(--accent);
    font-weight: 600;

    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 50%;
      transform: translateY(-50%);
      width: 3px;
      height: 18px;
      border-radius: 0 2px 2px 0;
      background: var(--accent);
    }
  }

  &__icon {
    font-size: 15px;
    flex-shrink: 0;
    color: var(--text-muted);

    .folder-item--active & {
      color: var(--accent);
    }
  }

  &__name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__delete {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border: none;
    border-radius: 5px;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    font-size: 12px;
    flex-shrink: 0;
    opacity: 0;
    transition: all 0.15s;

    &:hover {
      background: rgba(255, 77, 79, 0.1);
      color: #ff4d4f;
    }
  }
}

.folder-empty {
  padding: 12px 8px;
  font-size: 12px;
  color: var(--text-muted);
  text-align: center;
}

// ========== 文件树区域 ==========
.file-tree-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.file-tree-header {
  display: flex;
  align-items: center;
  padding: 8px 10px 4px;

  &__title {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-muted);
    flex: 1;
  }

  &__stats {
    display: flex;
    gap: 4px;
  }
}

.stat-badge {
  font-size: 11px;
  padding: 0 6px;
  border-radius: 8px;
  height: 16px;
  line-height: 16px;
  display: inline-flex;
  align-items: center;

  &--processed {
    color: #52c41a;
    background: rgba(82, 196, 26, 0.1);
  }

  &--archived {
    color: #1677ff;
    background: rgba(22, 119, 255, 0.1);
  }
}

.file-tree-path {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  font-size: 11px;
  color: var(--text-muted);
  background: var(--bg-active);
  border-radius: 6px;
  margin: 0 6px 4px;

  &__icon {
    font-size: 12px;
    flex-shrink: 0;
  }

  &__text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    direction: rtl;
    text-align: left;
  }
}

.file-tree-body {
  flex: 1;
  overflow-y: auto;
  padding: 4px 4px;
  min-height: 0;

  &::-webkit-scrollbar {
    width: 4px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: var(--border-color);
    border-radius: 2px;
    &:hover {
      background: var(--text-muted);
    }
  }
}

.file-tree-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 16px;
  gap: 8px;
  color: var(--text-muted);
  font-size: 12px;
}

// ========== 文件树项 ==========
.file-tree {
  padding: 0 2px;

  &__item {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 8px;
    height: 26px;
    border-radius: 7px;
    cursor: pointer;
    margin-bottom: 1px;
    transition: background-color 0.15s ease, color 0.15s ease;
    position: relative;

    &:hover {
      background-color: var(--bg-hover);
    }

    &--dir {
      height: 30px;

      .file-tree__icon {
        color: var(--accent);
      }

      .file-tree__name {
        font-weight: 500;
      }
    }

    &--expanded {
      color: var(--text-primary);
      font-weight: 600;
    }

    &--selected {
      background: var(--bg-active);
      color: var(--accent);
    }

    &--archived {
      opacity: 0.6;
    }
  }

  &__arrow {
    font-size: 12px;
    color: var(--text-muted);
    flex-shrink: 0;
    width: 14px;
    text-align: center;
    transition: transform 0.2s ease;
  }

  &__arrow-spacer {
    width: 14px;
    flex-shrink: 0;
  }

  &__icon {
    font-size: 14px;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  &__name {
    font-size: 12px;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }
}

// ========== 文件状态标识 ==========
.file-status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  font-size: 10px;
  flex-shrink: 0;
  margin-left: 2px;

  &--processed {
    color: #52c41a;
    background: rgba(82, 196, 26, 0.15);
  }

  &--unprocessed {
    color: var(--text-muted);
    background: var(--bg-active);
  }

  &--failed {
    color: #ff4d4f;
    background: rgba(255, 77, 79, 0.15);
  }

  &--unsupported {
    color: #ff4d4f;
    background: rgba(255, 77, 79, 0.1);
  }

  &--archived {
    color: #1677ff;
    background: rgba(22, 119, 255, 0.15);
    margin-left: 0;
  }
}

// ========== 右侧内容区 ==========
.panel--content {
  flex: 1;
  min-width: 200px;
}

.content-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  height: 44px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-color);

  &__left {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
  }

  &__right {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  &__icon {
    font-size: 16px;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  &__name {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.content-status-tag {
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  flex-shrink: 0;

  &--processed {
    color: #52c41a;
    background: rgba(82, 196, 26, 0.1);
  }

  &--unprocessed {
    color: #faad14;
    background: rgba(250, 173, 20, 0.1);
  }

  &--archived {
    color: #1677ff;
    background: rgba(22, 119, 255, 0.1);
  }

  &--unarchived {
    color: var(--text-muted);
    background: var(--bg-active);
  }
}

.content-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px;

  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-thumb {
    background: var(--border-color);
    border-radius: 3px;
  }
}

// ========== OCR 结果 ==========
.ocr-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
}

.ocr-result {
  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  &__title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
  }

  &__text {
    font-size: 13px;
    line-height: 1.8;
    color: var(--text-primary);
    background: var(--bg-active);
    border-radius: 8px;
    padding: 16px;
    white-space: pre-wrap;
    word-break: break-all;
  }
}

.ocr-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 16px;
  gap: 12px;
  color: var(--text-muted);

  &__icon {
    font-size: 40px;
    opacity: 0.3;
    color: var(--accent);
  }

  &__text {
    font-size: 13px;
    margin: 0;
  }
}

// ========== 占位区（介绍页） ==========
.content-placeholder {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--bg-layout);

  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-thumb {
    background: var(--border-color);
    border-radius: 3px;
  }
}

.intro-page {
  max-width: 760px;
  margin: 0 auto;
  padding: 32px 28px 48px;
}

// ===== 头部 =====
.intro-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  margin-bottom: 32px;

  &__icon {
    font-size: 44px;
    color: var(--accent);
    opacity: 0.7;
    line-height: 1;
  }

  &__title {
    font-size: 22px;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
  }

  &__desc {
    font-size: 13px;
    color: var(--text-muted);
    margin: 0;
  }
}

// ===== 分区 =====
.intro-section {
  margin-bottom: 28px;

  &__title {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0 0 14px;
    padding-left: 10px;
    border-left: 3px solid var(--accent);
  }
}

// ===== 核心优势卡片 =====
.intro-advantages {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.advantage-card {
  display: flex;
  gap: 14px;
  padding: 16px 18px;
  background: var(--bg-panel);
  border-radius: 10px;
  border: 1px solid var(--border-color);
  transition: box-shadow 0.2s ease;

  &:hover {
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  }

  &__icon {
    flex-shrink: 0;
    width: 38px;
    height: 38px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 9px;
    background: rgba(22, 119, 255, 0.08);
    color: var(--accent);
    font-size: 19px;
  }

  &__body {
    flex: 1;
    min-width: 0;
  }

  &__name {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 4px;
  }

  &__desc {
    font-size: 12px;
    line-height: 1.7;
    color: var(--text-secondary);
    margin: 0;
  }
}

// ===== 识别能力列表 =====
.intro-capabilities {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.capability-item {
  padding: 12px 16px;
  background: var(--bg-panel);
  border-radius: 8px;
  border: 1px solid var(--border-color);

  &__header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }

  &__count {
    font-size: 11px;
    color: var(--text-muted);
    background: var(--bg-active);
    padding: 1px 8px;
    border-radius: 8px;
  }

  &__desc {
    font-size: 12px;
    line-height: 1.7;
    color: var(--text-secondary);
    margin: 0;
  }
}

// 大类标签颜色
.capability-item__badge {
  font-size: 12px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 6px;

  &--finance {
    color: #1677ff;
    background: rgba(22, 119, 255, 0.1);
  }
  &--card {
    color: #722ed1;
    background: rgba(114, 46, 209, 0.1);
  }
  &--traffic {
    color: #13c2c2;
    background: rgba(19, 194, 194, 0.1);
  }
  &--medical {
    color: #52c41a;
    background: rgba(82, 196, 26, 0.1);
  }
  &--education {
    color: #fa8c16;
    background: rgba(250, 140, 22, 0.1);
  }
  &--general {
    color: #595959;
    background: rgba(89, 89, 89, 0.08);
  }
  &--other {
    color: #eb2f96;
    background: rgba(235, 47, 150, 0.08);
  }
}

// ========== 双栏内容区 ==========
.content-body-split {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 380px;
  gap: 1px;
  overflow: hidden;
  background: var(--border-color);
}

// ========== 图片查看器 ==========
.image-viewer {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #fafaf8;
  min-width: 0;

  &__toolbar {
    display: flex;
    align-items: center;
    padding: 6px 12px;
    background: var(--bg-panel);
    border-bottom: 1px solid var(--border-color);
    flex-shrink: 0;
  }

  &__info {
    font-size: 12px;
    color: var(--text-muted);
    flex: 1;
  }

  &__zoom {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  &__container {
    flex: 1;
    overflow: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    position: relative;

    &::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    &::-webkit-scrollbar-thumb {
      background: var(--border-color);
      border-radius: 3px;
    }
  }
}

.image-wrapper {
  position: relative;
  display: inline-block;
  transition: transform 0.15s ease;
  max-width: 100%;
}

.ocr-image {
  display: block;
  max-width: 100%;
  height: auto;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

// ========== OCR 识别区域浮层 ==========
.ocr-box {
  position: absolute;
  border: 1.5px solid var(--accent);
  background: rgba(24, 95, 165, 0.08);
  border-radius: 2px;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover,
  &--active {
    background: rgba(24, 95, 165, 0.2);
    box-shadow: 0 0 0 2px rgba(24, 95, 165, 0.3);
    z-index: 10;
  }

  &__label {
    position: absolute;
    top: -16px;
    left: -1px;
    background: var(--accent);
    color: #fff;
    font-size: 9px;
    padding: 1px 5px;
    border-radius: 2px 2px 0 0;
    white-space: nowrap;
    font-weight: 500;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    display: none;
  }

  &:hover &__label,
  &--active &__label {
    display: block;
  }
}

// ========== 缩放按钮 ==========
.zoom-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 14px;
  transition: all 0.15s;

  &:hover:not(:disabled) {
    background: var(--bg-hover);
    color: var(--text-primary);
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

.zoom-level {
  font-size: 11px;
  color: var(--text-muted);
  min-width: 36px;
  text-align: center;
}

.detail-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  width: 100%;
}

.image-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-muted);
  font-size: 13px;
}

// ========== 右栏：结构化内容 ==========
.result-panel {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-panel);

  &__tabs {
    display: flex;
    padding: 6px 8px;
    gap: 4px;
    border-bottom: 1px solid var(--border-color);
    flex-shrink: 0;
  }

  &__body {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;

    &::-webkit-scrollbar {
      width: 4px;
    }
    &::-webkit-scrollbar-thumb {
      background: var(--border-color);
      border-radius: 2px;
    }
  }
}

.result-tab {
  padding: 5px 12px;
  border-radius: 6px;
  border: none;
  background: transparent;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: var(--bg-hover);
  }

  &--active {
    background: var(--bg-active);
    color: var(--accent);
    font-weight: 600;
  }
}

.result-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  cursor: pointer;
  border-left: 3px solid transparent;
  transition: all 0.15s;

  &:hover,
  &--active {
    background: var(--bg-active);
    border-left-color: var(--accent);
  }

  &__index {
    font-size: 11px;
    color: var(--text-muted);
    min-width: 20px;
    text-align: right;
    flex-shrink: 0;
  }

  &__text {
    flex: 1;
    font-size: 12px;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  &__confidence {
    font-size: 10px;
    color: var(--text-muted);
    background: var(--bg-active);
    padding: 1px 5px;
    border-radius: 8px;
    flex-shrink: 0;
    min-width: 30px;
    text-align: center;
  }
}

.result-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 16px;
  gap: 4px;
  color: var(--text-muted);
  font-size: 13px;

  &__hint {
    font-size: 11px;
    opacity: 0.7;
  }
}

.result-text-actions {
  padding: 6px 12px;
  display: flex;
  justify-content: flex-end;
}

.result-text-content {
  padding: 8px 12px;
  font-size: 12px;
  line-height: 1.8;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-all;
}

// ========== AI 识别结果 ==========
.result-tab__badge {
  color: #52c41a;
  font-size: 10px;
  margin-left: 2px;
}

.ai-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  gap: 12px;

  &__hint {
    font-size: 12px;
    color: var(--text-muted);
    margin: 0;
  }
}

.ai-result {
  padding: 4px 0 16px;

  &__actions {
    display: flex;
    justify-content: flex-end;
    gap: 4px;
    padding: 4px 12px 8px;
    position: sticky;
    top: 0;
    background: var(--bg-panel);
    z-index: 1;
  }
}

// ========== 文档分类头部 ==========
.ai-classify-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  margin: 0 0 4px;
  background: linear-gradient(135deg, rgba(22, 119, 255, 0.06) 0%, rgba(82, 196, 26, 0.04) 100%);
  border-radius: 8px;
  border: 1px solid rgba(22, 119, 255, 0.1);

  &__main {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    flex: 1;
  }

  &__category {
    font-size: 13px;
    font-weight: 600;
    color: var(--accent);
    white-space: nowrap;
  }

  &__separator {
    font-size: 13px;
    color: var(--text-muted);
  }

  &__type {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__meta {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }
}

.ai-classify-tag {
  display: inline-flex;
  align-items: center;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 8px;
  white-space: nowrap;

  &--review {
    color: #faad14;
    background: rgba(250, 173, 20, 0.1);
  }

  &--warn {
    color: #faad14;
    background: rgba(250, 173, 20, 0.15);
    font-weight: 600;
  }

  &--ok {
    color: #52c41a;
    background: rgba(82, 196, 26, 0.1);
    font-weight: 600;
  }
}

.ai-field {
  display: flex;
  gap: 8px;
  padding: 4px 12px;
  font-size: 12px;
  border-bottom: 1px solid rgba(0,0,0,0.03);

  &__label {
    color: var(--text-muted);
    min-width: 80px;
    flex-shrink: 0;
  }

  &__value {
    color: var(--text-primary);
    flex: 1;
    word-break: break-all;

    &--fail {
      color: #ff4d4f;
      font-weight: 600;
    }

    &--warn {
      color: #faad14;
      font-weight: 600;
    }
  }
}

.ai-section {
  border-top: 1px solid var(--border-color);
  margin-top: 4px;
  padding-top: 4px;

  &__title {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-secondary);
    padding: 6px 12px 2px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
}

.ai-line-item {
  display: flex;
  gap: 6px;
  padding: 4px 12px;
  border-bottom: 1px solid rgba(0,0,0,0.03);

  &__index {
    font-size: 11px;
    color: var(--text-muted);
    min-width: 18px;
    text-align: right;
    flex-shrink: 0;
    padding-top: 4px;
  }

  &__body {
    flex: 1;
    min-width: 0;
  }
}

// ========== 多页缩略图栏 ==========
.image-viewer__pages {
  color: var(--accent);
  font-weight: 500;
}

.image-viewer__thumbs {
  flex-shrink: 0;
  display: flex;
  gap: 6px;
  padding: 8px 12px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-panel);
  overflow-x: auto;

  &::-webkit-scrollbar {
    height: 4px;
  }
  &::-webkit-scrollbar-thumb {
    background: var(--border-color);
    border-radius: 2px;
  }
}

.thumb-item {
  width: 52px;
  height: 52px;
  border-radius: 6px;
  border: 2px solid var(--border-color);
  cursor: pointer;
  flex-shrink: 0;
  overflow: hidden;
  position: relative;
  transition: all 0.15s;
  background: var(--bg-active);

  &:hover {
    border-color: var(--border-strong, #d6d3cc);
  }

  &--active {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }

  &__img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  &__label {
    position: absolute;
    bottom: 2px;
    right: 4px;
    font-size: 10px;
    color: #fff;
    background: rgba(0,0,0,0.6);
    padding: 0 4px;
    border-radius: 3px;
    font-weight: 600;
  }

  &--active &__label {
    background: var(--accent);
  }
}
</style>
