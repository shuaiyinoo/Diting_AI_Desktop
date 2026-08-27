<template>
  <div
    class="voice-input-button absolute bottom-[50px] left-1/2 z-[9998] flex -translate-x-1/2 select-none flex-col items-center"
  >
    <!-- 弹出框（在按钮上方，独立显示/隐藏，不影响按钮位置） -->
    <Transition name="voice-popup">
      <div v-if="showPopup" class="voice-popup mb-3 flex flex-col items-center">
        <!-- 内容区域 -->
        <div class="voice-card w-80 rounded-lg bg-card shadow-xl">
          <!-- 文本区域 -->
          <div>
            <div class="max-h-48 min-h-[60px] overflow-y-auto border rounded-t-lg border-border px-4 py-3">
              <span
                v-if="transcribeText"
                class="text-sm leading-relaxed text-foreground"
              >{{ transcribeText }}</span>
              <span
                v-else
                class="text-xs text-muted-foreground/50"
              >{{ isRecording ? '等待语音输入…' : '点击下方按钮开始说话' }}</span>
            </div>
          </div>

          <!-- 操作栏 -->
          <div class="flex items-center gap-2 border-x border-b border-border rounded-b-lg px-4 py-2">
            <div class="flex-1" />
            <button
              type="button"
              class="rounded-md px-3 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              @click="handleClose"
            >
              关闭
            </button>
            <button
              type="button"
              class="rounded-md bg-primary px-3 py-1 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              :disabled="!transcribeText"
              @click="handleInsert"
            >
              确认输入
            </button>
          </div>

        </div>
      </div>
    </Transition>

    <!-- 圆形按钮：始终在同一个位置，不随弹出框切换而移动 -->
    <button
      type="button"
      class="group relative z-10 flex size-12 items-center justify-center rounded-full border border-border bg-card shadow-lg transition-all hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
      :class="{
        'border-primary/40': isRecording,
        'border-red-500/40 bg-red-50 dark:bg-red-950/30': voiceError,
      }"
      :disabled="isLoadingModel"
      @click="handleVoiceToggle"
    >
      <div v-if="isLoadingModel" class="absolute inset-0 flex items-center justify-center">
        <svg class="size-7 animate-spin text-primary" viewBox="0 0 24 24" fill="none">
          <circle class="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" />
          <path class="opacity-90" d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
        </svg>
      </div>
      <div v-else-if="isRecording" class="relative flex items-center justify-center">
        <span class="absolute inline-flex size-full animate-ping rounded-full bg-red-400 opacity-40" />
        <span class="relative flex size-3 items-center justify-center">
          <span class="relative inline-flex size-2.5 rounded-full bg-red-500" />
        </span>
      </div>
      <Mic v-else class="size-5 text-muted-foreground group-hover:text-foreground" />
    </button>

    <!-- 文字标签 -->
    <div
      class="mt-1 rounded-full bg-card px-2 py-0.5 text-[10px] font-medium text-muted-foreground shadow"
      :class="{ 'text-red-500': isRecording }"
    >
      {{ buttonLabel }}
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { Mic } from '@lucide/vue'
import { ipcApiRoute } from '@/api'
import { ipc } from '@/utils/ipcRenderer'

const { t, locale } = useI18n()

const emit = defineEmits(['transcribed'])

// ========== 流式录音逻辑 ==========
const isLoadingModel = ref(false)
const isRecording = ref(false)
const voiceError = ref(false)

let audioContext = null
let mediaStream = null
let scriptProcessor = null

const TARGET_SAMPLE_RATE = 16000
const BUFFER_SIZE = 4096

// ========== 转写结果状态 ==========
const showPopup = ref(false)
const transcribeText = ref('')
const whisperRawText = ref('')
const whisperFinalText = ref('')
const isLLMCorrecting = ref(false)

function getWhisperLanguage() {
  const lang = locale.value || 'zh-CN'
  if (lang.startsWith('zh')) return 'zh'
  if (lang.startsWith('en')) return 'en'
  return 'auto'
}

const transcribeMode = ref(null)

const buttonLabel = computed(() => {
  if (isLoadingModel.value) {
    return transcribeMode.value === 'volc' ? '连接中…' : t('voiceInput.loadingModel')
  }
  if (isRecording.value) return t('voiceInput.recording')
  return t('voiceInput.clickToSpeak')
})

let llmCorrectedReceived = false

function onTranscriptionResult(_event, data) {
  if (!data?.text) return

  if (data.type === 'replace') {
    transcribeText.value = data.text
  } else if (data.type === 'corrected') {
    whisperFinalText.value += data.text
    whisperRawText.value = ''
    llmCorrectedReceived = true
    isLLMCorrecting.value = false
    transcribeText.value = whisperFinalText.value
  } else {
    whisperRawText.value = (whisperRawText.value || '') + data.text
    isLLMCorrecting.value = transcribeMode.value !== 'volc'
    transcribeText.value = whisperFinalText.value + whisperRawText.value
  }
}

async function handleVoiceToggle() {
  if (isRecording.value) {
    await stopRecording()
  } else {
    await startRecording()
  }
}

async function startRecording() {
  voiceError.value = false

  try {
    const micRes = await ipc.invoke(ipcApiRoute.voice.micPermission, { action: 'check' })
    if (micRes.code === 0 && micRes.data?.status === 'denied') {
      toast.error(t('voiceInput.micDenied'))
      return
    }
    if (micRes.code === 0 && micRes.data?.status === 'not-determined') {
      await ipc.invoke(ipcApiRoute.voice.micPermission, { action: 'request' })
    }

    isLoadingModel.value = true

    transcribeText.value = ''
    whisperRawText.value = ''
    whisperFinalText.value = ''
    isLLMCorrecting.value = false
    llmCorrectedReceived = false
    transcribeMode.value = null

    showPopup.value = true

    ipc.on(ipcApiRoute.voice.onTranscriptionResult, onTranscriptionResult)

    const sessionRes = await ipc.invoke(ipcApiRoute.voice.startSession, {
      language: getWhisperLanguage(),
    })

    if (sessionRes.code === 0 && sessionRes.data?.mode) {
      transcribeMode.value = sessionRes.data.mode
    }

    if (sessionRes.code !== 0) {
      toast.error(sessionRes.message || t('voiceInput.modelLoadFailed'))
      isLoadingModel.value = false
      showPopup.value = false
      ipc.off(ipcApiRoute.voice.onTranscriptionResult, onTranscriptionResult)
      return
    }

    isLoadingModel.value = false

    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    })

    audioContext = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE })
    const source = audioContext.createMediaStreamSource(mediaStream)

    scriptProcessor = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1)
    scriptProcessor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0)
      const chunk = new Float32Array(inputData.length)
      chunk.set(inputData)
      const buffer = Buffer.from(chunk.buffer)
      ipc.send(ipcApiRoute.voice.audioData, buffer)
    }

    source.connect(scriptProcessor)
    scriptProcessor.connect(audioContext.destination)

    isRecording.value = true
  } catch (err) {
    voiceError.value = true
    isLoadingModel.value = false
    showPopup.value = false
    cleanupRecording()
    if (err?.name === 'NotAllowedError') {
      toast.error(t('voiceInput.micDenied'))
    } else {
      toast.error(t('voiceInput.micStartFailed') + ': ' + (err?.message || err))
    }
  }
}

async function stopRecording() {
  if (!isRecording.value) return

  isRecording.value = false

  if (whisperRawText.value && transcribeMode.value !== 'volc') {
    isLLMCorrecting.value = true
  }

  if (scriptProcessor) {
    scriptProcessor.disconnect()
    scriptProcessor = null
  }
  if (audioContext) {
    await audioContext.close()
    audioContext = null
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop())
    mediaStream = null
  }

  try {
    await ipc.invoke(ipcApiRoute.voice.stopTranscription)
  } catch (err) {
    console.error('stop transcription failed:', err)
  }

  ipc.off(ipcApiRoute.voice.onTranscriptionResult, onTranscriptionResult)

  isLLMCorrecting.value = false
}

async function handleInsert() {
  const text = transcribeText.value
  if (!text) return

  // 如果还在录音，先停止录音
  if (isRecording.value) {
    await stopRecording()
  }

  emit('transcribed', text)
  resetState()
  showPopup.value = false
}

async function handleClose() {
  if (isRecording.value) {
    await stopRecording()
  }
  resetState()
  showPopup.value = false
}

function resetState() {
  transcribeText.value = ''
  whisperRawText.value = ''
  whisperFinalText.value = ''
  isLLMCorrecting.value = false
  llmCorrectedReceived = false
}

function cleanupRecording() {
  if (scriptProcessor) {
    scriptProcessor.disconnect()
    scriptProcessor = null
  }
  if (audioContext) {
    audioContext.close()
    audioContext = null
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop())
    mediaStream = null
  }
}

onBeforeUnmount(() => {
  ipc.off(ipcApiRoute.voice.onTranscriptionResult, onTranscriptionResult)
  if (isRecording.value) {
    stopRecording()
  }
})
</script>

<style scoped>
.voice-input-button {
  user-select: none;
}

/* 弹出框过渡动画 */
.voice-popup-enter-active,
.voice-popup-leave-active {
  transition: all 0.25s ease;
}

.voice-popup-enter-from,
.voice-popup-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

/* 卡片样式 */
.voice-card {
  /* 保留完整圆角 */
}
</style>
