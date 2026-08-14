<template>
  <div class="flex h-full w-full overflow-hidden bg-background">
    <!-- ========== 左侧：授权文件夹 + 文件树 ========== -->
    <div class="flex min-w-0 flex-col overflow-hidden bg-card" :style="{ width: panelWidth + 'px', flexShrink: 0 }">
      <!-- 顶部工具栏 -->
      <div class="flex h-10 shrink-0 items-center gap-1.5 border-b border-border px-2">
        <span class="text-sm font-semibold text-foreground">录入识读</span>
        <div class="ml-auto flex items-center gap-1">
          <Badge v-if="store.ocrProcessing" color="processing" class="inline-flex items-center text-[11px]">
            <Spinner size="small" class="mr-1" />
            识别中
          </Badge>
          <Tooltip title="刷新">
            <Button variant="ghost" size="icon" class="size-7 text-muted-foreground hover:text-foreground" @click="onRefresh">
              <RefreshCw class="size-3.5" />
            </Button>
          </Tooltip>
          <Tooltip title="添加授权文件夹">
            <Button variant="ghost" size="icon" class="size-7 text-muted-foreground hover:text-foreground" @click="onAddFolder">
              <Plus class="size-3.5" />
            </Button>
          </Tooltip>
        </div>
      </div>

      <!-- 授权文件夹列表 -->
      <div class="flex max-h-[200px] shrink-0 flex-col">
        <div class="flex items-center gap-1.5 px-2.5 pb-1 pt-2">
          <span class="flex-1 text-xs font-medium text-muted-foreground">授权文件夹</span>
          <span class="inline-flex h-4 items-center rounded-lg bg-accent px-1.5 text-[11px] text-muted-foreground">{{ store.folderList.length }}</span>
        </div>
        <div class="overflow-y-auto px-1 pb-1">
          <Spinner v-if="store.folderLoading" size="small" />
          <div
            v-for="folder in store.folderList"
            :key="folder.id"
            class="relative mb-px flex h-8 cursor-pointer items-center gap-2 rounded-lg px-2.5 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            :class="store.selectedFolderId === folder.id ? 'bg-accent font-semibold text-primary' : ''"
            @click="onSelectFolder(folder.id)"
          >
            <Folder class="size-3.5 shrink-0" :class="store.selectedFolderId === folder.id ? 'text-primary' : 'text-muted-foreground'" />
            <span class="min-w-0 flex-1 truncate" :title="folder.path">{{ folder.folder_name }}</span>
            <Button variant="ghost" size="icon" class="size-5 text-muted-foreground opacity-0 hover:bg-red-500/10 hover:text-red-500" @click.stop="onDeleteFolder(folder)">
              <Trash2 class="size-3" />
            </Button>
          </div>
          <div v-if="!store.folderLoading && store.folderList.length === 0" class="px-2 py-3 text-center text-xs text-muted-foreground">
            暂无授权文件夹
          </div>
        </div>
      </div>

      <!-- 分隔线 -->
      <div class="h-px shrink-0 bg-border"></div>

      <!-- 文件树区域 -->
      <div class="flex min-h-0 flex-1 flex-col">
        <div class="flex items-center px-2.5 pb-1 pt-2">
          <span class="flex-1 text-xs font-medium text-muted-foreground">文件列表</span>
          <div class="flex gap-1">
            <span class="inline-flex h-4 items-center rounded-lg bg-green-500/10 px-1.5 text-[11px] text-green-600" :title="'已处理 ' + store.stats.processed + '/' + store.stats.total">
              {{ store.stats.processed }}/{{ store.stats.total }}
            </span>
            <span v-if="store.stats.archived > 0" class="inline-flex h-4 items-center rounded-lg bg-blue-500/10 px-1.5 text-[11px] text-blue-600" :title="'已归档 ' + store.stats.archived">
              归档 {{ store.stats.archived }}
            </span>
          </div>
        </div>

        <!-- 当前文件夹路径显示 -->
        <div v-if="store.folderPathDisplay" class="mx-1.5 mb-1 flex items-center gap-1.5 rounded-md bg-accent px-2.5 py-1 text-[11px] text-muted-foreground" :title="store.folderPathDisplay">
          <Folder class="size-3 shrink-0" />
          <span class="truncate text-left" style="direction: rtl">{{ store.folderPathDisplay }}</span>
        </div>

        <div class="min-h-0 flex-1 overflow-y-auto px-1 py-1">
          <Spinner v-if="store.fileLoading" size="small" />
          <div v-else-if="flatFileTree.length === 0" class="flex flex-col items-center justify-center gap-2 px-4 py-10 text-xs text-muted-foreground">
            <Folder class="size-7 opacity-40" />
            <p>{{ store.folderList.length === 0 ? '请先添加授权文件夹' : '该文件夹下暂无文件' }}</p>
          </div>
          <div v-else class="px-0.5">
            <div
              v-for="node in flatFileTree"
              :key="node.path"
              class="relative mb-px flex h-[26px] cursor-pointer items-center gap-1 rounded-md px-2 transition-colors"
              :class="[
                node.isDir ? 'h-[30px]' : '',
                node.isDir && node.expanded ? 'font-semibold text-foreground' : '',
                !node.isDir && store.selectedFile?.id === node.id ? 'bg-accent text-primary' : 'hover:bg-accent',
                !node.isDir && node.archived === 1 ? 'opacity-60' : '',
              ]"
              :style="{ paddingLeft: 8 + node.depth * 16 + 'px' }"
              @click="node.isDir ? toggleDir(node) : onSelectFile(node)"
            >
              <component
                v-if="node.isDir"
                :is="node.expanded ? ChevronDown : ChevronRight"
                class="size-2.5 shrink-0 text-muted-foreground"
              />
              <span v-else class="w-3.5 shrink-0" />
              <component :is="node.isDir ? Folder : FileText" class="size-3.5 shrink-0" :class="node.isDir ? 'text-primary' : 'text-muted-foreground'" />
              <span class="min-w-0 flex-1 truncate text-xs" :class="node.isDir ? 'font-medium' : ''">{{ node.name }}</span>
              <!-- 文件状态标识 -->
              <template v-if="!node.isDir">
                <span
                  class="ml-0.5 flex size-4 shrink-0 items-center justify-center rounded-full text-[10px]"
                  :class="node.processed === 1 ? 'bg-green-500/15 text-green-600' : node.processed === 2 ? 'bg-red-500/15 text-red-500' : isSupportedFile(node.name) ? 'bg-accent text-muted-foreground' : 'bg-red-500/10 text-red-500'"
                  :title="node.processed === 1 ? '已识别' : node.processed === 2 ? '识别失败' : isSupportedFile(node.name) ? '未识别' : '不支持的文件类型'"
                >
                  <Check v-if="node.processed === 1" class="size-2.5" />
                  <X v-else-if="node.processed === 2 || !isSupportedFile(node.name)" class="size-2.5" />
                  <Loader2 v-else-if="isSupportedFile(node.name)" class="size-2.5" />
                </span>
                <span
                  v-if="node.archived === 1"
                  class="ml-0 flex size-4 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-[10px] text-blue-600"
                  title="已归档"
                >
                  <FolderOpen class="size-2.5" />
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
    <div class="flex min-w-[200px] flex-1 flex-col overflow-hidden bg-card">
      <!-- 选中文件时的内容 -->
      <template v-if="store.selectedFile">
        <!-- 顶部工具栏 -->
        <div class="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
          <div class="flex min-w-0 flex-1 items-center gap-2">
            <File class="size-4 shrink-0 text-muted-foreground" />
            <span class="truncate text-sm font-semibold text-foreground" :title="store.selectedFile.name">{{ store.selectedFile.name }}</span>
            <span
              class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px]"
              :class="store.selectedFile.processed === 1 ? 'bg-green-500/10 text-green-600' : store.selectedFile.processed === 2 ? 'bg-red-500/10 text-red-500' : 'bg-yellow-500/10 text-yellow-600'"
            >
              {{ store.selectedFile.processed === 1 ? '已识别' : store.selectedFile.processed === 2 ? '识别失败' : '未识别' }}
            </span>
            <span
              class="inline-flex items-center rounded-full px-2 py-0.5 text-[11px]"
              :class="store.selectedFile.archived === 1 ? 'bg-blue-500/10 text-blue-600' : 'bg-accent text-muted-foreground'"
            >
              {{ store.selectedFile.archived === 1 ? '已归档' : '未归档' }}
            </span>
          </div>
          <div class="flex shrink-0 items-center gap-1">
            <Button size="small" :loading="reRecognizing" @click="onReRecognize">
              <template #icon><RefreshCw /></template>
              重新识别
            </Button>
            <Button size="small" :type="store.selectedFile.archived === 1 ? 'default' : 'primary'" @click="onToggleArchived">
              {{ store.selectedFile.archived === 1 ? '取消归档' : '归档' }}
            </Button>
          </div>
        </div>

        <!-- 双栏内容区：左图片 + 右结构化数据 -->
        <div class="grid min-h-0 flex-1 overflow-hidden bg-border" style="grid-template-columns: 1fr 380px; gap: 1px">
          <!-- 左栏：图片查看器 / PDF 查看器 + 识别区域浮层 -->
          <div class="flex min-w-0 flex-col overflow-hidden bg-[#fafaf8] dark:bg-black/20">
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
              <div class="flex shrink-0 items-center border-b border-border bg-card px-3 py-1.5">
                <span class="flex-1 text-xs text-muted-foreground">
                  {{ currentPageOcrBoxes.length }} 个识别区域
                  <span v-if="pageImages.length > 1" class="font-medium text-primary">· 第 {{ currentPageIdx + 1 }}/{{ pageImages.length }} 页</span>
                </span>
                <div class="flex items-center gap-1">
                  <Button variant="ghost" size="icon" class="size-[26px] text-muted-foreground hover:text-foreground disabled:opacity-40" @click="zoomOut" :disabled="zoom <= 0.1">
                    <ZoomOut class="size-3.5" />
                  </Button>
                  <span class="min-w-[36px] text-center text-[11px] text-muted-foreground">{{ Math.round(zoom * 100) }}%</span>
                  <Button variant="ghost" size="icon" class="size-[26px] text-muted-foreground hover:text-foreground disabled:opacity-40" @click="zoomIn" :disabled="zoom >= 5">
                    <ZoomIn class="size-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" class="size-[26px] text-muted-foreground hover:text-foreground" title="重置缩放" @click="resetZoom">
                    <Expand class="size-3.5" />
                  </Button>
                </div>
              </div>

              <!-- 图片容器 -->
              <div
                class="relative flex min-h-0 flex-1 items-center justify-center overflow-auto p-4"
                ref="imageContainerRef"
                @wheel="onWheel"
              >
                <div v-if="detailLoading" class="flex h-full w-full items-center justify-center">
                  <Spinner tip="加载中..." />
                </div>
                <div v-else-if="currentImageData" class="relative inline-block max-w-full transition-transform" :style="{ transform: `scale(${zoom})`, transformOrigin: 'center' }">
                  <img
                    :src="currentImageData"
                    class="block h-auto max-w-full rounded shadow-sm"
                    ref="ocrImageRef"
                    @load="onImageLoad"
                  />
                  <!-- OCR 识别区域浮层 -->
                  <div
                    v-for="(box, idx) in currentPageOcrBoxes"
                    :key="idx"
                    class="absolute cursor-pointer rounded-sm border-[1.5px] border-primary bg-primary/10 transition-all"
                    :class="activeBoxIdx === idx ? 'z-10 bg-primary/20 ring-2 ring-primary/30' : ''"
                    :style="getBoxStyle(box)"
                    @mouseenter="activeBoxIdx = idx"
                    @mouseleave="activeBoxIdx = -1"
                  >
                    <span class="absolute -top-4 left-[-1px] hidden max-w-[200px] truncate rounded-t bg-primary px-1.5 py-px text-[9px] font-medium text-primary-foreground" :class="activeBoxIdx === idx ? 'block' : ''">{{ box.text }}</span>
                  </div>
                </div>
                <div v-else class="flex flex-col items-center justify-center gap-2 text-[13px] text-muted-foreground">
                  <FileSearch class="size-10 opacity-30" />
                  <p>无法加载图片</p>
                </div>
              </div>

              <!-- 多页缩略图栏 -->
              <div v-if="pageImages.length > 1" class="flex shrink-0 gap-1.5 overflow-x-auto border-t border-border bg-card px-3 py-2">
                <div
                  v-for="(img, idx) in pageImages"
                  :key="idx"
                  class="relative size-[52px] shrink-0 cursor-pointer overflow-hidden rounded-md border-2 transition-all"
                  :class="currentPageIdx === idx ? 'border-primary ring-1 ring-primary' : 'border-border hover:border-foreground/30'"
                  @click="switchPage(idx)"
                >
                  <img :src="img" class="h-full w-full object-cover" />
                  <span class="absolute bottom-0.5 right-1 rounded bg-black/60 px-1 text-[10px] font-semibold text-white" :class="currentPageIdx === idx ? 'bg-primary' : ''">{{ idx + 1 }}</span>
                </div>
              </div>
            </template>
          </div>

          <!-- 右栏：结构化内容 -->
          <div class="flex min-h-0 flex-col overflow-hidden bg-card">
            <!-- 标签页 -->
            <div class="flex shrink-0 gap-1 border-b border-border p-1.5">
              <Button variant="ghost" size="sm" class="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent" :class="resultTab === 'fields' ? 'bg-accent font-semibold text-primary' : ''" @click="resultTab = 'fields'">
                识别区域 ({{ currentPageOcrBoxes.length }})
              </Button>
              <Button variant="ghost" size="sm" class="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent" :class="resultTab === 'text' ? 'bg-accent font-semibold text-primary' : ''" @click="resultTab = 'text'">
                全文文本
              </Button>
              <Button variant="ghost" size="sm" class="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent" :class="resultTab === 'ai' ? 'bg-accent font-semibold text-primary' : ''" @click="resultTab = 'ai'">
                AI 识别
                <span v-if="aiData" class="ml-0.5 text-[10px] text-green-600">✓</span>
              </Button>
            </div>

            <!-- 识别区域列表 -->
            <div v-if="resultTab === 'fields'" class="min-h-0 flex-1 overflow-y-auto py-1">
              <div v-if="currentPageOcrBoxes.length === 0" class="flex flex-col items-center justify-center gap-1 px-4 py-10 text-[13px] text-muted-foreground">
                <p>暂无识别结果</p>
                <p class="text-[11px] opacity-70" v-if="store.selectedFile.processed === 0">文件尚未处理，请等待自动识别</p>
              </div>
              <div
                v-for="(box, idx) in currentPageOcrBoxes"
                :key="idx"
                class="flex cursor-pointer items-center gap-2 border-l-[3px] border-transparent px-3 py-1.5 transition-all"
                :class="activeBoxIdx === idx ? 'border-l-primary bg-accent' : 'hover:bg-accent'"
                @mouseenter="activeBoxIdx = idx"
                @mouseleave="activeBoxIdx = -1"
              >
                <span class="min-w-[20px] shrink-0 text-right text-[11px] text-muted-foreground">{{ idx + 1 }}</span>
                <span class="min-w-0 flex-1 truncate text-xs text-foreground">{{ box.text }}</span>
                <span class="min-w-[30px] shrink-0 rounded-lg bg-accent px-1.5 py-px text-center text-[10px] text-muted-foreground" :title="'置信度 ' + (box.confidence * 100).toFixed(1) + '%'">
                  {{ (box.confidence * 100).toFixed(0) }}%
                </span>
              </div>
            </div>

            <!-- 全文文本 -->
            <div v-if="resultTab === 'text'" class="min-h-0 flex-1 overflow-y-auto">
              <div class="flex justify-end px-3 py-1.5">
                <Button size="small" type="text" @click="copyOcrText">
                  <Copy />
                  <span>复制全文</span>
                </Button>
              </div>
              <div class="px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap break-all text-foreground">{{ ocrText || '暂无识别文本' }}</div>
            </div>

            <!-- AI 结构化结果 -->
            <div v-if="resultTab === 'ai'" class="min-h-0 flex-1 overflow-y-auto">
              <div v-if="aiLoading" class="flex h-[200px] flex-col items-center justify-center gap-3">
                <Spinner tip="AI 提取中..." />
                <p class="text-xs text-muted-foreground">步骤 1: 文档分类 → 步骤 2: 结构化提取</p>
              </div>
              <div v-else-if="aiData" class="pb-4">
                <!-- 操作按钮 -->
                <div class="sticky top-0 z-[1] flex justify-end gap-1 bg-card px-3 pb-2 pt-1">
                  <Button size="small" type="text" @click="copyAiData">
                    <Copy />
                    <span>复制 JSON</span>
                  </Button>
                  <Button size="small" type="text" :disabled="aiLoading" @click="onExtractInvoice">
                    <RefreshCw />
                    <span>重新提取</span>
                  </Button>
                </div>

                <!-- 文档分类信息 -->
                <div class="mx-3 mb-1 flex items-center justify-between gap-2 rounded-lg border border-primary/10 bg-gradient-to-br from-primary/5 to-green-500/5 px-3 py-2.5">
                  <div class="flex min-w-0 flex-1 items-center gap-1.5">
                    <span class="whitespace-nowrap text-[13px] font-semibold text-primary">{{ aiData.category_display || '未知' }}</span>
                    <span class="text-[13px] text-muted-foreground">/</span>
                    <span class="truncate text-[13px] font-semibold text-foreground">{{ aiData.type_name || '未知' }}</span>
                  </div>
                  <div class="flex shrink-0 items-center gap-1">
                    <span class="inline-flex items-center whitespace-nowrap rounded-lg px-1.5 py-0.5 text-[10px]" :class="aiData.needs_review ? 'bg-yellow-500/10 text-yellow-600' : ''">
                      {{ (aiData.confidence * 100).toFixed(0) }}% 置信
                    </span>
                    <span v-if="aiData.needs_review" class="inline-flex items-center whitespace-nowrap rounded-lg bg-yellow-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-yellow-600">需复核</span>
                    <span v-else class="inline-flex items-center whitespace-nowrap rounded-lg bg-green-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-green-600">已确认</span>
                  </div>
                </div>

                <!-- 类型编码 -->
                <div class="flex gap-2 border-b border-black/5 px-3 py-1 text-xs">
                  <span class="min-w-[80px] shrink-0 text-muted-foreground">类型编码</span>
                  <span class="flex-1 break-all text-foreground">{{ aiData.type_code || '-' }}</span>
                </div>

                <!-- 结构化数据：递归渲染 -->
                <template v-if="aiData.structured_data">
                  <template v-for="(val, key) in aiData.structured_data" :key="key">
                    <!-- 嵌套对象 -->
                    <div v-if="isObject(val)" class="mt-1 border-t border-border pt-1">
                      <div class="px-3 pb-0.5 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{{ key }}</div>
                      <div class="flex gap-2 border-b border-black/5 px-3 py-1 text-xs" v-for="(subVal, subKey) in val" :key="subKey">
                        <span class="min-w-[80px] shrink-0 text-muted-foreground">{{ subKey }}</span>
                        <span class="flex-1 break-all text-foreground">{{ formatValue(subVal) }}</span>
                      </div>
                    </div>
                    <!-- 数组（明细项） -->
                    <div v-else-if="isArray(val) && val.length > 0" class="mt-1 border-t border-border pt-1">
                      <div class="px-3 pb-0.5 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{{ key }} ({{ val.length }})</div>
                      <div class="flex gap-1.5 border-b border-black/5 px-3 py-1" v-for="(item, idx) in val" :key="idx">
                        <span class="min-w-[18px] shrink-0 pt-1 text-right text-[11px] text-muted-foreground">{{ idx + 1 }}</span>
                        <div class="min-w-0 flex-1">
                          <div class="flex gap-2 border-b border-black/5 px-0 py-1 text-xs" v-for="(itemVal, itemKey) in item" :key="itemKey">
                            <span class="min-w-[80px] shrink-0 text-muted-foreground">{{ itemKey }}</span>
                            <span class="flex-1 break-all text-foreground">{{ formatValue(itemVal) }}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <!-- 简单值 -->
                    <div v-else class="flex gap-2 border-b border-black/5 px-3 py-1 text-xs">
                      <span class="min-w-[80px] shrink-0 text-muted-foreground">{{ key }}</span>
                      <span class="flex-1 break-all text-foreground">{{ formatValue(val) }}</span>
                    </div>
                  </template>
                </template>
              </div>
              <div v-else class="flex flex-col items-center justify-center gap-1 px-4 py-10 text-[13px] text-muted-foreground">
                <p>暂未进行 AI 提取</p>
                <p class="text-[11px] opacity-70">点击下方按钮进行 AI 结构化提取</p>
                <Button type="primary" size="small" class="mt-3" :disabled="!ocrText || aiLoading" @click="onExtractInvoice">
                  <template #icon><Bot /></template>
                  AI 提取
                </Button>
                <p v-if="!ocrText" class="mt-2 text-[11px] opacity-70">需先完成 OCR 识别</p>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- 未选中文件时的介绍页 -->
      <div v-else class="h-full overflow-y-auto overflow-x-hidden bg-background">
        <div class="mx-auto max-w-[760px] px-7 pb-12 pt-8">
          <!-- 头部 -->
          <div class="mb-8 flex flex-col items-center gap-2.5">
            <div class="text-primary opacity-70">
              <FileSearch class="size-11" />
            </div>
            <h2 class="m-0 text-[22px] font-bold text-foreground">录入识读</h2>
            <p class="m-0 text-[13px] text-muted-foreground">从左侧选择文件查看识别结果，或先了解以下能力总览</p>
          </div>

          <!-- 核心优势 -->
          <div class="mb-7">
            <h3 class="m-0 mb-3.5 border-l-[3px] border-primary pl-2.5 text-[15px] font-semibold text-foreground">核心优势</h3>
            <div class="flex flex-col gap-3">
              <div class="flex gap-3.5 rounded-lg border border-border bg-card px-4 py-3 transition-shadow hover:shadow-md">
                <div class="flex size-[38px] shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <BadgeCheck class="size-[19px]" />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="mb-1 text-sm font-semibold text-foreground">本地识别，数据不出电脑</div>
                  <p class="m-0 text-xs leading-relaxed text-muted-foreground">所有图片的识别、文字提取、结构化解析都在本地完成，原始图片和识别结果不会上传到任何外部服务器，从根本上保障数据安全与隐私合规。</p>
                </div>
              </div>
              <div class="flex gap-3.5 rounded-lg border border-border bg-card px-4 py-3 transition-shadow hover:shadow-md">
                <div class="flex size-[38px] shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <LayoutGrid class="size-[19px]" />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="mb-1 text-sm font-semibold text-foreground">覆盖全面，一机通识</div>
                  <p class="m-0 text-xs leading-relaxed text-muted-foreground">支持 40+ 种主流票据与证件的高精度识别，涵盖财务报销、交通出行、资质证照等核心业务场景。</p>
                </div>
              </div>
              <div class="flex gap-3.5 rounded-lg border border-border bg-card px-4 py-3 transition-shadow hover:shadow-md">
                <div class="flex size-[38px] shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Bot class="size-[19px]" />
                </div>
                <div class="min-w-0 flex-1">
                  <div class="mb-1 text-sm font-semibold text-foreground">智能提取，识用一体</div>
                  <p class="m-0 text-xs leading-relaxed text-muted-foreground">识别结果自动映射为结构化字段（金额、日期、票号、销方/购方等），异构数据归一为统一视图，支持跨类型检索、统计与多格式导出。</p>
                </div>
              </div>
            </div>
          </div>

          <!-- 识别能力 -->
          <div class="mb-7">
            <h3 class="m-0 mb-3.5 border-l-[3px] border-primary pl-2.5 text-[15px] font-semibold text-foreground">识别能力</h3>
            <div class="flex flex-col gap-2">
              <div class="rounded-lg border border-border bg-card px-4 py-3">
                <div class="mb-1.5 flex items-center gap-2">
                  <span class="rounded-md bg-blue-500/10 px-2.5 py-0.5 text-xs font-semibold text-blue-600">财税报销</span>
                  <span class="rounded-lg bg-accent px-2 py-px text-[11px] text-muted-foreground">13 种</span>
                </div>
                <p class="m-0 text-xs leading-relaxed text-muted-foreground">增值税发票（专用/普通/电子/卷票/区块链）、定额发票、通用机打发票、火车票、出租车票、飞机行程单、汽车票、过路过桥费发票、船票、网约车行程单、购物小票、银行回单、智能票据混贴。</p>
              </div>
              <div class="rounded-lg border border-border bg-card px-4 py-3">
                <div class="mb-1.5 flex items-center gap-2">
                  <span class="rounded-md bg-purple-500/10 px-2.5 py-0.5 text-xs font-semibold text-purple-600">资质证照</span>
                  <span class="rounded-lg bg-accent px-2 py-px text-[11px] text-muted-foreground">11 种</span>
                </div>
                <p class="m-0 text-xs leading-relaxed text-muted-foreground">身份证、银行卡、营业执照、护照、社保卡、港澳台证件、户口本、出生证明、结婚证、离婚证、房产证。</p>
              </div>
              <div class="rounded-lg border border-border bg-card px-4 py-3">
                <div class="mb-1.5 flex items-center gap-2">
                  <span class="rounded-md bg-teal-500/10 px-2.5 py-0.5 text-xs font-semibold text-teal-600">交通出行</span>
                  <span class="rounded-lg bg-accent px-2 py-px text-[11px] text-muted-foreground">7 种</span>
                </div>
                <p class="m-0 text-xs leading-relaxed text-muted-foreground">车牌识别、VIN码识别、驾驶证、行驶证、机动车销售发票、车辆合格证、二手车销售发票。</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'

import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { toast } from 'vue-sonner'
import { Folder, File, FileSearch, ChevronDown, ChevronRight, FolderOpen, FileText, RefreshCw, Plus, Trash2, Check, X, Loader2, Copy, ZoomIn, ZoomOut, Expand, Bot, BadgeCheck, LayoutGrid } from '@lucide/vue'
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

function buildFileTreeData(flatList) {
  const root = []
  const dirMap = new Map()
  for (const item of flatList) {
    const parts = item.path.split('/')
    const name = parts[parts.length - 1]
    const parentPath = parts.length > 1 ? parts.slice(0, -1).join('/') : ''
    const node = { ...item, name, depth: parts.length - 1, expanded: expandedDirs.value.has(item.path), children: [] }
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

const flatFileTree = computed(() => {
  const tree = buildFileTreeData(store.fileTree)
  return flattenTree(tree)
})

function toggleDir(node) {
  if (expandedDirs.value.has(node.path)) {
    expandedDirs.value.delete(node.path)
  } else {
    expandedDirs.value.add(node.path)
  }
  expandedDirs.value = new Set(expandedDirs.value)
}

function onSelectFolder(folderId) {
  store.selectFolder(folderId)
  store.loadFileTree()
}

async function onAddFolder() {
  const result = await store.addFolder()
  if (result?.success) {
    toast.success('文件夹添加成功')
    await store.loadFileTree()
  } else if (result?.message && result.message !== '用户取消选择') {
    toast.warning(result.message)
  }
}

function onDeleteFolder(folder) {
  if (!window.confirm(`删除文件夹\n\n确定要删除文件夹「${folder.folder_name}」吗？仅移除授权，不删除实际文件。`)) return;
  (async () => {
      const result = await store.deleteFolder(folder.id)
      if (result?.success) {
        toast.success('文件夹已删除')
        await store.loadFileTree()
      } else {
        toast.error('删除文件夹失败')
      }
  })()
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
const pdfUrl = ref('')
const currentPageIdx = ref(0)

const currentImageData = computed(() => {
  if (pageImages.value.length > 0) {
    return pageImages.value[currentPageIdx.value] || imageData.value
  }
  return imageData.value
})

const currentPageOcrBoxes = computed(() => {
  if (pageImages.value.length <= 1) return ocrBoxes.value
  const pages = ocrData.value?.pages || []
  const page = pages[currentPageIdx.value]
  return page?.boxes || []
})

const currentPageText = computed(() => {
  if (pageImages.value.length <= 1) return ocrText.value
  const pages = ocrData.value?.pages || []
  return pages[currentPageIdx.value]?.text || ''
})

function isObject(val) {
  return val !== null && typeof val === 'object' && !Array.isArray(val)
}

function isArray(val) {
  return Array.isArray(val)
}

function formatValue(val) {
  if (val === null || val === undefined) return '-'
  if (typeof val === 'object') return JSON.stringify(val)
  return String(val)
}

async function onSelectFile(file) {
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
  if (pdfUrl.value) {
    URL.revokeObjectURL(pdfUrl.value)
  }
  pdfUrl.value = ''
  currentPageIdx.value = 0

  detailLoading.value = true
  const result = await store.getFileDetail(file.id)
  detailLoading.value = false

  if (result.success) {
    imageData.value = result.imageData || ''
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

function getBoxStyle(box) {
  const { width: naturalW, height: naturalH } = imageNaturalSize.value
  if (!naturalW || !naturalH) return {}
  const x = (box.box.x / naturalW) * 100
  const y = (box.box.y / naturalH) * 100
  const w = (box.box.width / naturalW) * 100
  const h = (box.box.height / naturalH) * 100
  return { left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%` }
}

function onImageLoad(e) {
  imageNaturalSize.value = {
    width: e.target.naturalWidth,
    height: e.target.naturalHeight,
  }
}

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

function switchPage(idx) {
  if (idx < 0 || idx >= pageImages.value.length) return
  currentPageIdx.value = idx
  activeBoxIdx.value = -1
  zoom.value = 1
  imageNaturalSize.value = { width: 0, height: 0 }
}

async function onExtractInvoice() {
  if (!store.selectedFile) return
  aiLoading.value = true
  try {
    const result = await store.extractInvoice(store.selectedFile.id)
    if (result.success && result.data) {
      aiData.value = result.data
      toast.success('AI 提取成功')
    } else {
      toast.error(result.error || 'AI 提取失败')
    }
  } catch (err) {
    toast.error('AI 提取失败: ' + String(err))
  } finally {
    aiLoading.value = false
  }
}

async function copyAiData() {
  if (!aiData.value) return
  try {
    await navigator.clipboard.writeText(JSON.stringify(aiData.value, null, 2))
    toast.success('已复制到剪贴板')
  } catch {
    toast.error('复制失败')
  }
}

async function onReRecognize() {
  if (!store.selectedFile) return
  reRecognizing.value = true
  try {
    const result = await store.reRecognize(store.selectedFile.id)
    if (result.success) {
      toast.success('重新识别完成')
      const file = store.fileTree.find((f) => f.id === store.selectedFile.id)
      if (file) {
        file.processed = 1
      }
      await onSelectFile(store.selectedFile)
    } else {
      toast.error(result.error || '重新识别失败')
      const file = store.fileTree.find((f) => f.id === store.selectedFile.id)
      if (file) {
        file.processed = 2
      }
    }
  } catch (err) {
    toast.error('重新识别失败: ' + String(err))
  } finally {
    reRecognizing.value = false
  }
}

async function onToggleArchived() {
  if (!store.selectedFile) return
  const result = await store.toggleArchived(store.selectedFile.id)
  if (result?.success) {
    toast.success(result.file.archived === 1 ? '已归档' : '已取消归档')
  } else {
    toast.error('操作失败')
  }
}

async function copyOcrText() {
  if (!ocrText.value) return
  try {
    await navigator.clipboard.writeText(ocrText.value)
    toast.success('已复制到剪贴板')
  } catch {
    toast.error('复制失败')
  }
}

function onRefresh() {
  store.loadFileTree()
}

// ========== 生命周期 ==========
let syncCleanup = null
let ocrCleanup = null

onMounted(async () => {
  await store.loadFolderList()
  store.registerSyncCallback()

  syncCleanup = store.onSyncChange((folderId) => {
    if (store.selectedFolderId === folderId) {
      store.loadFileTree()
    }
  })

  ocrCleanup = store.onOcrProgress((info) => {
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
  if (pdfUrl.value) {
    URL.revokeObjectURL(pdfUrl.value)
    pdfUrl.value = ''
  }
})

watch(() => store.selectedFolderId, () => {
  store.loadFileTree()
  ocrText.value = ''
})
</script>