<template>
  <div v-if="citations && citations.length > 0" class="citation-rail">
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
        :key="`${cite.fileItemId ?? 'x'}-${cite.chunkId ?? idx}`"
        class="citation-rail__card"
        type="button"
        :disabled="cite.fileItemId === null || cite.fileItemId === undefined"
        @click="$emit('citation-click', cite)"
      >
        <div class="citation-rail__card-head">
          <span class="citation-rail__index">{{ String(idx + 1).padStart(2, '0') }}</span>
          <span class="citation-rail__type" :class="iconClass(cite.fileName)">
            {{ fileIcon(cite.fileName) }}
          </span>
          <span class="citation-rail__score">{{ formatScore(cite.score) }}</span>
        </div>
        <h4 class="citation-rail__filename" :title="cite.fileName">
          {{ cite.fileName }}
        </h4>
        <p v-if="cite.snippet" class="citation-rail__snippet">{{ cite.snippet }}</p>
      </button>
    </div>
  </div>
</template>

<script setup>
import { LinkOutlined } from '@ant-design/icons-vue';

defineProps({
  citations: {
    type: Array,
    default: () => [],
  },
});

defineEmits(['citation-click']);

function formatScore(score) {
  if (score == null) return '';
  return (score * 100).toFixed(1) + '%';
}

function fileIcon(fileName) {
  if (!fileName) return 'FILE';
  const ext = fileName.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf':
      return 'PDF';
    case 'doc':
    case 'docx':
      return 'DOC';
    case 'txt':
      return 'TXT';
    case 'md':
      return 'MD';
    case 'xlsx':
    case 'xls':
      return 'XLS';
    case 'pptx':
    case 'ppt':
      return 'PPT';
    default:
      return 'FILE';
  }
}

function iconClass(fileName) {
  if (!fileName) return 'citation-rail__type--txt';
  const ext = fileName.split('.').pop()?.toLowerCase();
  return `citation-rail__type--${ext || 'txt'}`;
}
</script>

<style lang="less" scoped>
.citation-rail {
  margin-top: 12px;
  padding: 12px 14px;
  background: linear-gradient(135deg, #f8faff 0%, #f0f5ff 100%);
  border: 1px solid #d6e4ff;
  border-radius: 10px;

  &__head {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
  }

  &__eyebrow {
    font-size: 10px;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: #722ed1;
    font-weight: 600;
  }

  &__title {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: #262626;

    strong {
      font-weight: 600;
    }
  }

  &__count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 6px;
    background: #1677ff;
    color: #fff;
    border-radius: 9px;
    font-size: 11px;
    font-weight: 600;
  }

  &__scroll {
    display: flex;
    gap: 10px;
    overflow-x: auto;
    padding-bottom: 4px;

    &::-webkit-scrollbar {
      height: 6px;
    }
    &::-webkit-scrollbar-thumb {
      background: #d6e4ff;
      border-radius: 3px;
    }
  }

  &__card {
    flex: 0 0 220px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 12px;
    background: #fff;
    border: 1px solid #e8e8e8;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    text-align: left;

    &:hover:not(:disabled) {
      border-color: #1677ff;
      box-shadow: 0 2px 8px rgba(22, 119, 255, 0.12);
      transform: translateY(-1px);
    }

    &:disabled {
      cursor: default;
      opacity: 0.7;
    }
  }

  &__card-head {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  &__index {
    font-size: 11px;
    font-weight: 700;
    color: #1677ff;
    font-family: 'SF Mono', 'Consolas', monospace;
  }

  &__type {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 32px;
    height: 18px;
    padding: 0 6px;
    background: #f0f2f5;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 700;
    color: #595959;
    letter-spacing: 0.5px;

    &--pdf {
      background: #fff1f0;
      color: #cf1322;
    }
    &--doc,
    &--docx {
      background: #e6f4ff;
      color: #0958d9;
    }
    &--txt {
      background: #f6ffed;
      color: #389e0d;
    }
    &--md {
      background: #f9f0ff;
      color: #722ed1;
    }
  }

  &__score {
    margin-left: auto;
    font-size: 11px;
    color: #8c8c8c;
    font-weight: 500;
  }

  &__filename {
    margin: 0;
    font-size: 13px;
    font-weight: 500;
    color: #262626;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__snippet {
    margin: 0;
    font-size: 12px;
    color: #8c8c8c;
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
}
</style>
