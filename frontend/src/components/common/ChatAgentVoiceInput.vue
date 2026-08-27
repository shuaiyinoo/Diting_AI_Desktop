<template>
  <!-- 录音中：长方形条状区域 -->
  <button
    v-if="isRecording || isLoadingModel"
    type="button"
    class="flex h-8 items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-50 px-2.5 dark:bg-red-950/20"
    @click="handleStop"
  >
    <!-- 录音脉动指示 -->
    <span class="relative flex size-2 shrink-0">
      <span class="absolute inline-flex size-full animate-ping rounded-full bg-red-400 opacity-75" />
      <span class="relative inline-flex size-2 rounded-full bg-red-500" />
    </span>
    <!-- 状态文字 -->
    <span class="text-[11px] text-red-600 dark:text-red-400">
      {{ displayText }}
    </span>
  </button>

  <!-- 正常状态：麦克风图标 -->
  <button
    v-else
    type="button"
    class="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    :class="{ 'text-red-500': voiceError }"
    @click="handleStart"
  >
    <Mic class="size-4" />
  </button>
</template>

<script setup>
import { ref, computed, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import { Mic } from '@lucide/vue'
import { ipcApiRoute } from '@/api'
import { ipc } from '@/utils/ipcRenderer'

const { t, locale } = useI18n()

const emit = defineEmits(['transcribed', 'voiceStart', 'voiceStop'])

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
const whisperRawText = ref('')
const whisperFinalText = ref('')
const isLLMCorrecting = ref(false)

/** 当前完整的转写文字 */
const fullText = computed(() => (whisperFinalText.value + whisperRawText.value).trim())

const displayText = computed(() => {
  if (isLoadingModel.value) return t('voiceInput.loadingModel')
  return t('voiceInput.recording')
})

function getWhisperLanguage() {
  const lang = locale.value || 'zh-CN'
  if (lang.startsWith('zh')) return 'zh'
  if (lang.startsWith('en')) return 'en'
  return 'auto'
}

const transcribeMode = ref(null)

function onTranscriptionResult(_event, data) {
  if (!data?.text) return

  if (data.type === 'replace') {
    // FunASR / 火山引擎：整段替换
    whisperFinalText.value = data.text
    whisperRawText.value = ''
  } else if (data.type === 'corrected') {
    // Whisper LLM 纠正后的最终结果
    whisperFinalText.value += data.text
    whisperRawText.value = ''
    isLLMCorrecting.value = false
  } else {
    // Whisper 增量追加
    whisperRawText.value = (whisperRawText.value || '') + data.text
    isLLMCorrecting.value = transcribeMode.value !== 'volc'
  }

  // 实时通知父组件当前完整的转写文字
  if (fullText.value) {
    emit('transcribed', fullText.value)
  }
}

async function handleStart() {
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

    whisperRawText.value = ''
    whisperFinalText.value = ''
    isLLMCorrecting.value = false
    transcribeMode.value = null

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
    emit('voiceStart')
  } catch (err) {
    voiceError.value = true
    isLoadingModel.value = false
    cleanupRecording()
    if (err?.name === 'NotAllowedError') {
      toast.error(t('voiceInput.micDenied'))
    } else {
      toast.error(t('voiceInput.micStartFailed') + ': ' + (err?.message || err))
    }
  }
}

/** 点击长方形区域：停止录音，不额外 emit（文字已实时填入） */
async function handleStop() {
  await stopRecording()
  resetState()
  emit('voiceStop')
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

function resetState() {
  whisperRawText.value = ''
  whisperFinalText.value = ''
  isLLMCorrecting.value = false
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
