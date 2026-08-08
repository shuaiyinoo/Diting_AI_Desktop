<template>
  <div class="citation-rail">
    <div class="citation-rail__head">
      <span class="citation-rail__eyebrow">Evidence Chain</span>
      <span class="citation-rail__title">
        <LinkOutlined />
        <strong>引用证据</strong>
        <span class="citation-rail__count">{{ citations.length }}</span>
      </span>
    </div>
    <div class="citation-rail__scroll">
      <button
        v-for="(cite, idx) in citations"
        :key="`${cite.documentId ?? cite.fileItemId ?? 'x'}-${cite.chunkId ?? idx}`"
        class="citation-rail__card"
        type="button"
        :disabled="!canOpenFile(cite)"
        @click="$emit('citation-click', cite)"
      >
        <div class="citation-rail__card-head">
          <span class="citation-rail__index">{{ String(idx + 1).padStart(2, '0') }}</span>
          <span class="citation-rail__type" :class="citationIconClass(cite.fileName)">
            {{ citationFileIcon(cite.fileName) }}
          </span>
          <span class="citation-rail__score">{{ formatScore(cite.score) }}</span>
        </div>
        <h4 class="citation-rail__filename" :title="cite.fileName">
          {{ cite.fileName || '未知文件' }}
        </h4>
        <p v-if="cite.snippet" class="citation-rail__snippet">
          {{ cite.snippet }}
        </p>
        <p v-else class="citation-rail__snippet citation-rail__snippet--muted">
          （未提供摘录片段）
        </p>
        <div class="citation-rail__card-foot">
          <div class="citation-rail__meter">
            <span class="citation-rail__meter-fill" :style="{ width: `${Math.min(100, (cite.score || 0) * 100)}%` }" />
          </div>
          <span v-if="cite.chunkIndex !== null && cite.chunkIndex !== undefined" class="citation-rail__chunk">
            #chunk {{ cite.chunkIndex }}
          </span>
          <span v-if="canOpenFile(cite)" class="citation-rail__view-hint">
            点击查看 →
          </span>
        </div>
      </button>
    </div>
  </div>
</template>

<script setup>
import { LinkOutlined } from '@ant-design/icons-vue'

defineProps({
  /** 引用证据列表 */
  citations: {
    type: Array,
    default: () => [],
  },
})

defineEmits(['citation-click'])

/** 判断引用是否可以打开文件 */
function canOpenFile(cite) {
  const id = cite.documentId ?? cite.fileItemId
  return id !== null && id !== undefined
}

/** 格式化评分为百分比 */
function formatScore(score) {
  if (!Number.isFinite(score)) return '--'
  return (score * 100).toFixed(1) + '%'
}

/** 根据文件扩展名返回图标文字 */
function citationFileIcon(fileName) {
  const ext = (fileName || '').toLowerCase().split('.').pop() ?? ''
  if (ext === 'pdf') return 'PDF'
  if (ext === 'md') return 'MD'
  if (ext === 'docx' || ext === 'doc') return 'DOC'
  if (ext === 'xlsx' || ext === 'xls') return 'XLS'
  if (ext === 'pptx' || ext === 'ppt') return 'PPT'
  if (ext === 'txt') return 'TXT'
  if (ext === 'html' || ext === 'htm') return 'WEB'
  return '--'
}

/** 根据文件扩展名返回图标样式类 */
function citationIconClass(fileName) {
  const ext = (fileName || '').toLowerCase().split('.').pop() ?? ''
  if (ext === 'pdf') return 'citation-rail__type--pdf'
  if (ext === 'md') return 'citation-rail__type--md'
  if (ext === 'docx' || ext === 'doc') return 'citation-rail__type--doc'
  if (ext === 'xlsx' || ext === 'xls') return 'citation-rail__type--xls'
  if (ext === 'pptx' || ext === 'ppt') return 'citation-rail__type--ppt'
  return 'citation-rail__type--txt'
}
</script>

<style lang="less" scoped>
// ========== 引用证据卡片（使用 CSS 变量，兼容明暗主题） ==========
.citation-rail {
  margin-top: 14px;
  padding: 14px 0 4px;
  border-top: 1px dashed var(--border-color);

  &__head {
    display: flex;
    align-items: baseline;
    gap: 12px;
    margin-bottom: 10px;
    padding-left: 2px;
  }

  &__eyebrow {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--accent);
  }

  &__title {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: var(--text-muted);

    :deep(svg) {
      color: var(--accent);
    }

    strong {
      font-weight: 600;
      color: var(--text-primary);
    }
  }

  &__count {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
    background: var(--bg-hover);
    padding: 1px 7px;
    border-radius: 100px;
  }

  &__scroll {
    display: flex;
    gap: 10px;
    overflow-x: auto;
    padding: 4px 2px 8px;
    scrollbar-width: thin;

    &::-webkit-scrollbar {
      height: 6px;
    }

    &::-webkit-scrollbar-thumb {
      background: var(--border-color);
      border-radius: 3px;
    }
  }

  &__card {
    flex-shrink: 0;
    width: 260px;
    padding: 12px 14px;
    background: var(--bg-panel);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    text-align: left;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
    position: relative;
    overflow: hidden;

    &::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      width: 2px;
      height: 100%;
      background: linear-gradient(to bottom, var(--accent), var(--accent-hover));
      opacity: 0;
      transition: opacity 0.2s ease;
    }

    &:hover:not(:disabled) {
      transform: translateY(-2px);
      border-color: var(--accent);
      box-shadow: 0 8px 20px rgba(22, 119, 255, 0.12);
    }

    &:hover:not(:disabled)::before {
      opacity: 1;
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.65;
    }
  }

  &__card-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  &__index {
    font-size: 12px;
    font-weight: 700;
    color: var(--text-muted);
    letter-spacing: 0.05em;
  }

  &__type {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 2px 7px;
    border-radius: 4px;
  }

  &__type--pdf {
    background: rgba(239, 68, 68, 0.1);
    color: #dc2626;
  }

  &__type--md {
    background: rgba(22, 119, 255, 0.1);
    color: var(--accent);
  }

  &__type--doc {
    background: rgba(59, 130, 246, 0.1);
    color: #2563eb;
  }

  &__type--xls {
    background: rgba(34, 197, 94, 0.1);
    color: #16a34a;
  }

  &__type--ppt {
    background: rgba(249, 115, 22, 0.1);
    color: #ea580c;
  }

  &__type--txt {
    background: var(--bg-hover);
    color: var(--text-muted);
  }

  &__score {
    margin-left: auto;
    font-size: 12px;
    font-weight: 600;
    color: #0d9488;
  }

  &__filename {
    margin: 0 0 6px;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
    line-height: 1.3;
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  &__snippet {
    margin: 0 0 8px;
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.5;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  &__snippet--muted {
    color: var(--text-muted);
    font-style: italic;
  }

  &__card-foot {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  &__meter {
    flex: 1;
    height: 3px;
    background: var(--bg-sidebar);
    border-radius: 2px;
    overflow: hidden;
  }

  &__meter-fill {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, var(--accent), var(--accent-hover));
    border-radius: 2px;
    transition: width 0.4s ease;
  }

  &__chunk {
    font-size: 11px;
    color: var(--text-muted);
  }

  &__view-hint {
    font-size: 11px;
    color: var(--accent);
    font-weight: 500;
    white-space: nowrap;
  }
}
</style>
