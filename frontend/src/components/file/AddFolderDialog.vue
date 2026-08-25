<template>
  <Teleport to="body">
    <!-- 遮罩层 -->
    <div v-if="open" class="fixed inset-0 z-[9998] bg-black/[0.02] cursor-pointer" @click="close" />
    <!-- 右侧滑出面板 -->
    <aside
      v-if="open"
      class="fixed right-3 top-3 bottom-3 z-[9999] flex w-[calc(66.66%-24px)] min-w-[500px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
    >
    <!-- 固定头部：图标 + 标题 + 关闭按钮 -->
    <div class="shrink-0 border-b border-border/50 px-5 pb-4 pt-5">
      <div class="flex items-center gap-3">
        <div class="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <FolderPlus class="size-4.5" />
        </div>
        <div class="min-w-0 flex-1">
          <div class="truncate text-[15px] font-semibold text-foreground">
            {{ editFolderId ? t('addFolder.editTitle') : t('addFolder.title') }}
          </div>
          <div class="mt-0.5 text-xs text-muted-foreground">
            {{ t('addFolder.subtitle') }}
          </div>
        </div>
        <button
          class="flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent"
          @click="close"
        >
          <X class="size-4" />
        </button>
      </div>
    </div>

    <!-- 可滚动内容区 -->
    <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
      <!-- 协议选择列表 -->
      <div class="mb-5">
        <label class="mb-2 block text-sm font-medium">{{ t('addFolder.protocolType') }}</label>
        <div class="grid grid-cols-4 gap-1.5">
          <button
            v-for="p in protocols"
            :key="p.id"
            class="flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-center transition-all"
            :class="formData.protocol === p.id
              ? 'border-primary bg-primary/5 text-primary'
              : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'"
            @click="selectProtocol(p.id)"
          >
            <component :is="p.icon" class="size-4.5 shrink-0" />
            <span class="text-[11px] font-medium leading-tight">{{ t(`addFolder.protocols.${p.id}`) }}</span>
          </button>
        </div>
      </div>

      <!-- ────────── 本地文件夹 ────────── -->
      <div v-if="formData.protocol === 'local'" class="space-y-4">
        <div class="space-y-1.5">
          <label class="text-sm font-medium">{{ t('addFolder.localPath') }} <span class="text-destructive">*</span></label>
          <div class="flex gap-2">
            <Input
              :model-value="formData.localPath"
              readonly
              :placeholder="t('addFolder.localPathPlaceholder')"
              class="flex-1 bg-muted/50"
            />
            <Button variant="outline" size="icon" @click="selectLocalFolder" :disabled="submitting">
              <FolderOpen class="size-4" />
            </Button>
          </div>
        </div>
      </div>

      <!-- ────────── FTP / FTPS ────────── -->
      <div v-else-if="formData.protocol === 'ftp' || formData.protocol === 'ftps'" class="space-y-4">
        <div class="grid grid-cols-3 gap-3">
          <div class="col-span-2 space-y-1.5">
            <label class="text-sm font-medium">{{ t('addFolder.host') }} <span class="text-destructive">*</span></label>
            <Input v-model="formData.host" placeholder="ftp.example.com" :disabled="submitting" />
          </div>
          <div class="space-y-1.5">
            <label class="text-sm font-medium">{{ t('addFolder.port') }}</label>
            <Input v-model="formData.port" type="number" placeholder="21" :disabled="submitting" />
          </div>
        </div>
        <div class="space-y-1.5">
          <label class="text-sm font-medium">{{ t('addFolder.remotePath') }}</label>
          <div class="flex gap-2">
            <Input v-model="formData.remotePath" placeholder="/share/documents" :disabled="submitting" class="flex-1" />
            <Button variant="outline" size="sm" @click="openPathBrowser" :disabled="submitting || browsing" class="shrink-0">
              <FolderOpen class="size-4" />
              {{ t('addFolder.browsePath') }}
            </Button>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <label class="text-sm font-medium">{{ t('addFolder.username') }}</label>
            <Input v-model="formData.username" placeholder="anonymous" :disabled="submitting" />
          </div>
          <div class="space-y-1.5">
            <label class="text-sm font-medium">{{ t('addFolder.password') }}</label>
            <div class="flex gap-2">
              <Input
                v-model="formData.password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="••••••"
                autocomplete="new-password"
                class="flex-1"
                :disabled="submitting"
              />
              <Button variant="outline" size="icon" @click="showPassword = !showPassword">
                <Eye v-if="!showPassword" class="size-4" />
                <EyeOff v-else class="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <!-- ────────── SFTP ────────── -->
      <div v-else-if="formData.protocol === 'sftp'" class="space-y-4">
        <div class="grid grid-cols-3 gap-3">
          <div class="col-span-2 space-y-1.5">
            <label class="text-sm font-medium">{{ t('addFolder.host') }} <span class="text-destructive">*</span></label>
            <Input v-model="formData.host" placeholder="sftp.example.com" :disabled="submitting" />
          </div>
          <div class="space-y-1.5">
            <label class="text-sm font-medium">{{ t('addFolder.port') }}</label>
            <Input v-model="formData.port" type="number" placeholder="22" :disabled="submitting" />
          </div>
        </div>
        <div class="space-y-1.5">
          <label class="text-sm font-medium">{{ t('addFolder.remotePath') }} <span class="text-destructive">*</span></label>
          <div class="flex gap-2">
            <Input v-model="formData.remotePath" placeholder="/home/user/documents" :disabled="submitting" class="flex-1" />
            <Button variant="outline" size="sm" @click="openPathBrowser" :disabled="submitting || browsing" class="shrink-0">
              <FolderOpen class="size-4" />
              {{ t('addFolder.browsePath') }}
            </Button>
          </div>
          <p v-if="pathBrowserHint" class="text-xs text-muted-foreground">{{ pathBrowserHint }}</p>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <label class="text-sm font-medium">{{ t('addFolder.username') }} <span class="text-destructive">*</span></label>
            <Input v-model="formData.username" placeholder="user" :disabled="submitting" />
          </div>
          <div class="space-y-1.5">
            <label class="text-sm font-medium">{{ t('addFolder.password') }}</label>
            <div class="flex gap-2">
              <Input
                v-model="formData.password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="••••••"
                autocomplete="new-password"
                class="flex-1"
                :disabled="submitting"
              />
              <Button variant="outline" size="icon" @click="showPassword = !showPassword">
                <Eye v-if="!showPassword" class="size-4" />
                <EyeOff v-else class="size-4" />
              </Button>
            </div>
          </div>
        </div>
        <div class="space-y-1.5">
          <label class="text-sm font-medium">{{ t('addFolder.privateKeyPath') }}</label>
          <Input v-model="formData.privateKeyPath" placeholder="~/.ssh/id_rsa（可选）" :disabled="submitting" />
          <p class="text-xs text-muted-foreground">{{ t('addFolder.privateKeyHint') }}</p>
        </div>
      </div>

      <!-- ────────── SMB ────────── -->
      <div v-else-if="formData.protocol === 'smb'" class="space-y-4">
        <div class="grid grid-cols-3 gap-3">
          <div class="col-span-2 space-y-1.5">
            <label class="text-sm font-medium">{{ t('addFolder.host') }} <span class="text-destructive">*</span></label>
            <Input v-model="formData.host" placeholder="192.168.1.100" :disabled="submitting" />
          </div>
          <div class="space-y-1.5">
            <label class="text-sm font-medium">{{ t('addFolder.port') }}</label>
            <Input v-model="formData.port" type="number" placeholder="445" :disabled="submitting" />
          </div>
        </div>
        <div class="space-y-1.5">
          <label class="text-sm font-medium">{{ t('addFolder.shareName') }} <span class="text-destructive">*</span></label>
          <Input v-model="formData.shareName" placeholder="shared" :disabled="submitting" />
          <p class="text-xs text-muted-foreground">{{ t('addFolder.shareNameHint') }}</p>
        </div>
        <div class="space-y-1.5">
          <label class="text-sm font-medium">{{ t('addFolder.remotePath') }}</label>
          <div class="flex gap-2">
            <Input v-model="formData.remotePath" placeholder="/folder/sub（可选）" :disabled="submitting" class="flex-1" />
            <Button variant="outline" size="sm" @click="openPathBrowser" :disabled="submitting || browsing" class="shrink-0">
              <FolderOpen class="size-4" />
              {{ t('addFolder.browsePath') }}
            </Button>
          </div>
        </div>
        <div class="grid grid-cols-3 gap-3">
          <div class="space-y-1.5">
            <label class="text-sm font-medium">{{ t('addFolder.domain') }}</label>
            <Input v-model="formData.domain" placeholder="WORKGROUP" :disabled="submitting" />
          </div>
          <div class="space-y-1.5">
            <label class="text-sm font-medium">{{ t('addFolder.username') }}</label>
            <Input v-model="formData.username" placeholder="guest" :disabled="submitting" />
          </div>
          <div class="space-y-1.5">
            <label class="text-sm font-medium">{{ t('addFolder.password') }}</label>
            <div class="flex gap-2">
              <Input
                v-model="formData.password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="••••••"
                autocomplete="new-password"
                class="flex-1"
                :disabled="submitting"
              />
            </div>
          </div>
        </div>
        <Button variant="ghost" size="sm" class="ml-auto" @click="showPassword = !showPassword">
          <Eye v-if="!showPassword" class="mr-1 size-3.5" />
          <EyeOff v-else class="mr-1 size-3.5" />
          {{ showPassword ? t('addFolder.hidePassword') : t('addFolder.showPassword') }}
        </Button>
      </div>

      <!-- ────────── WebDAV ────────── -->
      <div v-else-if="formData.protocol === 'webdav'" class="space-y-4">
        <div class="space-y-1.5">
          <label class="text-sm font-medium">{{ t('addFolder.serverUrl') }} <span class="text-destructive">*</span></label>
          <Input v-model="formData.host" placeholder="https://dav.example.com/remote.php/dav/files/user" :disabled="submitting" />
          <p class="text-xs text-muted-foreground">{{ t('addFolder.serverUrlHint') }}</p>
        </div>
        <div class="space-y-1.5">
          <label class="text-sm font-medium">{{ t('addFolder.remotePath') }}</label>
          <div class="flex gap-2">
            <Input v-model="formData.remotePath" placeholder="/documents（可选）" :disabled="submitting" class="flex-1" />
            <Button variant="outline" size="sm" @click="openPathBrowser" :disabled="submitting || browsing" class="shrink-0">
              <FolderOpen class="size-4" />
              {{ t('addFolder.browsePath') }}
            </Button>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <label class="text-sm font-medium">{{ t('addFolder.username') }}</label>
            <Input v-model="formData.username" placeholder="user" :disabled="submitting" />
          </div>
          <div class="space-y-1.5">
            <label class="text-sm font-medium">{{ t('addFolder.password') }}</label>
            <div class="flex gap-2">
              <Input
                v-model="formData.password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="••••••"
                autocomplete="new-password"
                class="flex-1"
                :disabled="submitting"
              />
              <Button variant="outline" size="icon" @click="showPassword = !showPassword">
                <Eye v-if="!showPassword" class="size-4" />
                <EyeOff v-else class="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <!-- ────────── S3 ────────── -->
      <div v-else-if="formData.protocol === 's3'" class="space-y-4">
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <label class="text-sm font-medium">{{ t('addFolder.endpoint') }} <span class="text-destructive">*</span></label>
            <Input v-model="formData.host" placeholder="https://s3.amazonaws.com" :disabled="submitting" />
          </div>
          <div class="space-y-1.5">
            <label class="text-sm font-medium">{{ t('addFolder.region') }}</label>
            <Input v-model="formData.region" placeholder="us-east-1" :disabled="submitting" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <label class="text-sm font-medium">{{ t('addFolder.bucket') }} <span class="text-destructive">*</span></label>
            <Input v-model="formData.bucket" placeholder="my-documents" :disabled="submitting" />
          </div>
          <div class="space-y-1.5">
            <label class="text-sm font-medium">{{ t('addFolder.prefix') }}</label>
            <div class="flex gap-2">
              <Input v-model="formData.remotePath" placeholder="folder/（可选）" :disabled="submitting" class="flex-1" />
              <Button variant="outline" size="sm" @click="openPathBrowser" :disabled="submitting || browsing" class="shrink-0">
                <FolderOpen class="size-4" />
                {{ t('addFolder.browsePath') }}
              </Button>
            </div>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <label class="text-sm font-medium">{{ t('addFolder.accessKey') }} <span class="text-destructive">*</span></label>
            <Input v-model="formData.username" placeholder="AKIA..." :disabled="submitting" />
          </div>
          <div class="space-y-1.5">
            <label class="text-sm font-medium">{{ t('addFolder.secretKey') }} <span class="text-destructive">*</span></label>
            <div class="flex gap-2">
              <Input
                v-model="formData.password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="••••••"
                autocomplete="new-password"
                class="flex-1"
                :disabled="submitting"
              />
              <Button variant="outline" size="icon" @click="showPassword = !showPassword">
                <Eye v-if="!showPassword" class="size-4" />
                <EyeOff v-else class="size-4" />
              </Button>
            </div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <Switch v-model:checked="formData.forcePathStyle" />
          <label class="cursor-pointer text-sm text-muted-foreground" @click="formData.forcePathStyle = !formData.forcePathStyle">
            {{ t('addFolder.forcePathStyle') }}
          </label>
          <p class="text-xs text-muted-foreground">{{ t('addFolder.forcePathStyleHint') }}</p>
        </div>
      </div>

      <!-- 文件夹别名（所有协议通用） -->
      <div class="mt-5 space-y-1.5">
        <label class="text-sm font-medium">{{ t('addFolder.folderAlias') }}</label>
        <Input
          v-model="formData.alias"
          :placeholder="t('addFolder.folderAliasPlaceholder')"
          :disabled="submitting"
        />
        <p class="text-xs text-muted-foreground">{{ t('addFolder.folderAliasHint') }}</p>
      </div>

      <!-- 测试连接结果 -->
      <div v-if="testResult" class="mt-3 flex items-center gap-2 rounded-md px-3 py-2 text-sm" :class="testResult.success ? 'bg-green-500/10 text-green-600 dark:text-green-400' : 'bg-red-500/10 text-red-600 dark:text-red-400'">
        <CheckCircle2 v-if="testResult.success" class="size-4 shrink-0" />
        <AlertCircle v-else class="size-4 shrink-0" />
        <span class="min-w-0 flex-1 truncate">{{ testResult.message }}</span>
      </div>
    </div>

    <!-- 固定底部操作栏 -->
    <div class="flex shrink-0 items-center gap-2.5 border-t border-border bg-card px-5 py-3.5">
      <Button variant="outline" :disabled="submitting || testing" @click="handleTest">
        <Loader2 v-if="testing" class="mr-1.5 size-4 animate-spin" />
        <Plug class="mr-1.5 size-4" />
        {{ testing ? t('addFolder.testing') : t('addFolder.testConnection') }}
      </Button>
      <div class="ml-auto flex items-center gap-2.5">
        <Button variant="outline" @click="close" :disabled="submitting">{{ t('common.cancel') }}</Button>
        <Button :disabled="!canSubmit || submitting" @click="handleSubmit">
          <Loader2 v-if="submitting" class="mr-1.5 size-4 animate-spin" />
          {{ submitting ? t('common.submitting') : t('common.add') }}
        </Button>
      </div>
    </div>
  </aside>

    <!-- ========== 远程路径浏览弹窗 ========== -->
    <Teleport to="body">
      <div v-if="pathBrowserOpen" class="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40" @click="closePathBrowser">
        <div class="flex h-[60vh] w-[520px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl" @click.stop>
          <!-- 头部 -->
          <div class="flex shrink-0 items-center gap-2 border-b border-border px-4 py-3">
            <FolderOpen class="size-4 text-muted-foreground" />
            <span class="text-sm font-medium">{{ t('addFolder.browseTitle') }}</span>
            <span class="min-w-0 flex-1 truncate text-xs text-muted-foreground">{{ pathBrowserCurrentPath || '/' }}</span>
            <button class="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent" @click="closePathBrowser">
              <X class="size-4" />
            </button>
          </div>

          <!-- 工具栏：返回上级 -->
          <div class="flex shrink-0 items-center gap-1.5 border-b border-border/50 px-4 py-1.5">
            <button
              class="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              :disabled="pathBrowserHistory.length <= 1"
              @click="goPathUp"
            >
              <ArrowLeft class="size-3.5" />
              {{ t('addFolder.browseUp') }}
            </button>
            <div class="ml-auto text-xs text-muted-foreground">
              {{ pathBrowserEntries.length }} {{ t('addFolder.browsePath') }}
            </div>
          </div>

          <!-- 目录列表 -->
          <div class="min-h-0 flex-1 overflow-y-auto">
            <div v-if="browsing" class="flex h-full items-center justify-center">
              <Loader2 class="size-5 animate-spin text-muted-foreground" />
              <span class="ml-2 text-sm text-muted-foreground">{{ t('addFolder.browseLoading') }}</span>
            </div>
            <div v-else-if="pathBrowserEntries.length === 0" class="flex h-full items-center justify-center text-sm text-muted-foreground">
              {{ t('addFolder.browseEmpty') }}
            </div>
            <div v-else class="py-1">
              <div
                v-for="entry in pathBrowserEntries"
                :key="entry.name"
                class="flex cursor-pointer items-center gap-2 px-4 py-2 transition-colors hover:bg-accent"
                :class="pathBrowserSelectedPath === joinPath(pathBrowserCurrentPath, entry.name) ? 'bg-primary/10' : ''"
                @click="onPathEntryClick(entry)"
                @dblclick="entry.isDir && enterPathDir(entry)"
              >
                <component :is="entry.isDir ? Folder : FileText" class="size-4 shrink-0" :class="entry.isDir ? 'text-muted-foreground' : 'text-muted-foreground/40'" />
                <span class="min-w-0 flex-1 truncate text-[13px]" :class="entry.isDir ? 'text-foreground' : 'text-muted-foreground'">{{ entry.name }}</span>
                <span v-if="!entry.isDir" class="shrink-0 text-[10px] text-muted-foreground">{{ formatBrowseSize(entry.size) }}</span>
              </div>
            </div>
          </div>

          <!-- 底部操作栏 -->
          <div class="flex shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-3">
            <Button variant="outline" size="sm" @click="closePathBrowser">{{ t('common.cancel') }}</Button>
            <Button size="sm" :disabled="!pathBrowserCurrentPath" @click="confirmPathSelection">
              {{ t('addFolder.browseSelect') }}
            </Button>
          </div>
        </div>
      </div>
    </Teleport>
  </Teleport>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'
import {
  FolderPlus, FolderOpen, Plug, Eye, EyeOff, Loader2, X,
  CheckCircle2, AlertCircle,
  Globe, Server, ShieldCheck, HardDrive, Cloud, Network,
  ArrowLeft, FileText, Folder,
} from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { ipcApiRoute } from '@/api'
import { ipc } from '@/utils/ipcRenderer'

const { t } = useI18n()

const emit = defineEmits(['added'])

// ═══════════════════════════════════════════
// 状态
// ═══════════════════════════════════════════

const open = ref(false)
const submitting = ref(false)
const testing = ref(false)
const showPassword = ref(false)
const testResult = ref(null)

/** 编辑模式：当前编辑的文件夹 ID，null = 新增模式 */
const editFolderId = ref(null)

// 协议列表
const protocols = [
  { id: 'local',  icon: FolderOpen },
  { id: 'ftp',    icon: Globe },
  { id: 'ftps',   icon: ShieldCheck },
  { id: 'sftp',   icon: Server },
  { id: 'smb',    icon: HardDrive },
  { id: 'webdav', icon: Network },
  { id: 's3',     icon: Cloud },
]

// 表单数据
const formData = reactive({
  protocol: 'local',
  alias: '',
  host: '',
  port: '',
  remotePath: '',
  username: '',
  password: '',
  privateKeyPath: '',
  shareName: '',
  domain: '',
  region: '',
  bucket: '',
  forcePathStyle: false,
  localPath: '',
})

// 默认端口映射
const defaultPorts = {
  ftp: '21',
  ftps: '990',
  sftp: '22',
  smb: '445',
  webdav: '',
  s3: '',
}

// ═══════════════════════════════════════════
// 计算属性
// ═══════════════════════════════════════════

const canSubmit = computed(() => {
  if (formData.protocol === 'local') {
    return !!formData.localPath.trim()
  }
  if (formData.protocol === 's3') {
    return !!formData.host.trim() && !!formData.bucket.trim() && !!formData.username.trim() && !!formData.password.trim()
  }
  if (formData.protocol === 'smb') {
    return !!formData.host.trim() && !!formData.shareName.trim()
  }
  if (formData.protocol === 'webdav') {
    return !!formData.host.trim()
  }
  if (formData.protocol === 'sftp') {
    return !!formData.host.trim() && !!formData.username.trim() && !!formData.remotePath.trim() && (!!formData.password || !!formData.privateKeyPath.trim())
  }
  return !!formData.host.trim()
})

// ═══════════════════════════════════════════
// 方法
// ═══════════════════════════════════════════

function show() {
  resetForm()
  editFolderId.value = null
  open.value = true
}

/** 编辑模式：填充已有配置 */
function showEdit(folder) {
  resetForm()
  editFolderId.value = folder.id

  const protocol = folder.protocol || 'local'
  formData.protocol = protocol

  // 解析 protocol_config JSON
  let config = {}
  try {
    config = folder.protocol_config ? JSON.parse(folder.protocol_config) : {}
  } catch {
    config = {}
  }

  // 通用字段
  formData.alias = folder.alias || folder.folder_name || ''
  // S3 的 endpoint 存在 config.endpoint，WebDAV 的 url 存在 config.url，其他协议在 config.host
  formData.host = config.host || config.endpoint || config.url || ''
  formData.port = config.port ? String(config.port) : ''
  formData.remotePath = config.remotePath || config.subPath || config.prefix || ''
  formData.username = config.username || config.accessKey || ''
  formData.password = config.password || config.secretKey || ''

  // SFTP
  formData.privateKeyPath = config.privateKeyPath || ''

  // SMB
  formData.shareName = config.share || ''
  formData.domain = config.domain || ''

  // S3
  formData.region = config.region || ''
  formData.bucket = config.bucket || ''
  formData.forcePathStyle = config.forcePathStyle || false

  // WebDAV
  formData.url = config.url || formData.host

  // 本地
  formData.localPath = protocol === 'local' ? (config.host || folder.path) : ''

  // 设置默认端口
  if (defaultPorts[protocol] && !formData.port) {
    formData.port = defaultPorts[protocol]
  }

  open.value = true
}

function close() {
  open.value = false
}

function resetForm() {
  formData.protocol = 'local'
  formData.alias = ''
  formData.host = ''
  formData.port = ''
  formData.remotePath = ''
  formData.username = ''
  formData.password = ''
  formData.privateKeyPath = ''
  formData.shareName = ''
  formData.domain = ''
  formData.region = ''
  formData.bucket = ''
  formData.forcePathStyle = false
  formData.localPath = ''
  showPassword.value = false
  testResult.value = null
  editFolderId.value = null
}

function selectProtocol(protocolId) {
  formData.protocol = protocolId
  if (defaultPorts[protocolId] && !formData.port) {
    formData.port = defaultPorts[protocolId]
  }
  testResult.value = null
}

async function selectLocalFolder() {
  try {
    const folderPath = await ipc.invoke(ipcApiRoute.os.selectFolder)
    if (!folderPath) return
    formData.localPath = folderPath
    if (!formData.alias) {
      const parts = folderPath.replace(/\\/g, '/').split('/')
      formData.alias = parts[parts.length - 1] || folderPath
    }
  } catch {
    toast.error(t('addFolder.selectFolderFailed'))
  }
}

function buildParams() {
  const protocol = formData.protocol

  if (protocol === 'local') {
    return {
      protocol: 'local',
      host: formData.localPath,
      path: formData.localPath,
      alias: formData.alias.trim() || undefined,
    }
  }

  if (protocol === 's3') {
    return {
      protocol: 's3',
      endpoint: formData.host.trim(),
      region: formData.region.trim() || 'us-east-1',
      bucket: formData.bucket.trim(),
      prefix: formData.remotePath.trim() || undefined,
      accessKey: formData.username.trim(),
      secretKey: formData.password,
      forcePathStyle: formData.forcePathStyle,
      alias: formData.alias.trim() || undefined,
    }
  }

  if (protocol === 'smb') {
    return {
      protocol: 'smb',
      host: formData.host.trim(),
      port: Number(formData.port) || 445,
      share: formData.shareName.trim(),
      subPath: formData.remotePath.trim() || undefined,
      domain: formData.domain.trim() || undefined,
      username: formData.username.trim() || undefined,
      password: formData.password || undefined,
      alias: formData.alias.trim() || undefined,
    }
  }

  if (protocol === 'webdav') {
    return {
      protocol: 'webdav',
      url: formData.host.trim(),
      remotePath: formData.remotePath.trim() || undefined,
      username: formData.username.trim() || undefined,
      password: formData.password || undefined,
      alias: formData.alias.trim() || undefined,
    }
  }

  const params = {
    protocol: formData.protocol,
    host: formData.host.trim(),
    port: Number(formData.port) || (protocol === 'sftp' ? 22 : 21),
    remotePath: formData.remotePath.trim() || '/',
    username: formData.username.trim() || (protocol === 'ftp' || protocol === 'ftps' ? 'anonymous' : ''),
    password: formData.password || undefined,
    alias: formData.alias.trim() || undefined,
  }

  if (protocol === 'sftp' && formData.privateKeyPath.trim()) {
    params.privateKeyPath = formData.privateKeyPath.trim()
  }

  return params
}

async function handleTest() {
  if (!canSubmit.value) {
    toast.warning(t('addFolder.fillRequiredFields'))
    return
  }

  testing.value = true
  testResult.value = null
  try {
    const params = buildParams()
    const res = await ipc.invoke(ipcApiRoute.file.testRemoteConnection, params)
    if (res?.success) {
      testResult.value = { success: true, message: t('addFolder.testSuccess') }
    } else {
      testResult.value = { success: false, message: res?.message || t('addFolder.testFailed') }
    }
  } catch (err) {
    testResult.value = { success: false, message: err?.message || String(err) }
  } finally {
    testing.value = false
  }
}

async function handleSubmit() {
  if (!canSubmit.value) {
    toast.warning(t('addFolder.fillRequiredFields'))
    return
  }

  submitting.value = true
  try {
    const params = buildParams()
    const isRemote = formData.protocol !== 'local'

    if (editFolderId.value) {
      // 编辑模式：调用 updateRemoteFolder
      params.folderId = editFolderId.value
      const res = await ipc.invoke(ipcApiRoute.file.updateRemoteFolder, params)
      if (res?.success) {
        if (isRemote) {
          toast.info(t('addFolder.scanning'))
          const handler = (_event, result) => {
            if (result.folderId === res.folder?.id) {
              ipc.removeListener(ipcApiRoute.file.onRemoteScanDone, handler)
              if (result.success) {
                toast.success(t('addFolder.scanDone', { count: result.itemCount || 0 }))
              } else {
                toast.error(t('addFolder.scanFailed') + (result.message ? ': ' + result.message : ''))
              }
              emit('added', res)
            }
          }
          ipc.on(ipcApiRoute.file.onRemoteScanDone, handler)
        } else {
          toast.success(t('addFolder.editSuccess'))
          emit('added', res)
        }
        open.value = false
      } else {
        toast.error(res?.message || t('addFolder.editFailed'))
      }
    } else {
      // 新增模式：调用 addRemoteFolder
      const res = await ipc.invoke(ipcApiRoute.file.addRemoteFolder, params)
      if (res?.success) {
        if (isRemote) {
          toast.info(t('addFolder.scanning'))
          const handler = (_event, result) => {
            if (result.folderId === res.folder?.id) {
              ipc.removeListener(ipcApiRoute.file.onRemoteScanDone, handler)
              if (result.success) {
                toast.success(t('addFolder.scanDone', { count: result.itemCount || 0 }))
              } else {
                toast.error(t('addFolder.scanFailed') + (result.message ? ': ' + result.message : ''))
              }
              emit('added', res)
            }
          }
          ipc.on(ipcApiRoute.file.onRemoteScanDone, handler)
        } else {
          toast.success(t('addFolder.addSuccess'))
        }
        open.value = false
        if (!isRemote) {
          emit('added', res)
        }
      } else {
        toast.error(res?.message || t('addFolder.addFailed'))
      }
    }
  } catch (err) {
    toast.error(err?.message || t('addFolder.addFailed'))
  } finally {
    submitting.value = false
  }
}

// ═══════════════════════════════════════════
// 远程路径浏览
// ═══════════════════════════════════════════

const pathBrowserOpen = ref(false)
const browsing = ref(false)
/** 当前浏览的目录路径 */
const pathBrowserCurrentPath = ref('/')
/** 目录条目列表 */
const pathBrowserEntries = ref([])
/** 浏览历史（用于返回上级） */
const pathBrowserHistory = ref(['/'])
/** 当前选中的路径 */
const pathBrowserSelectedPath = ref('')

/** 提示信息：当必填字段未填时显示 */
const pathBrowserHint = computed(() => {
  if (formData.protocol === 'local') return ''
  if (!formData.host.trim()) return t('addFolder.browseHint')
  if (formData.protocol === 'sftp' && !formData.username.trim()) return t('addFolder.browseHint')
  return ''
})

/** 检查是否可以打开路径浏览器 */
function canBrowse() {
  if (formData.protocol === 'local') return false
  if (!formData.host.trim()) return false
  if (formData.protocol === 'sftp' && !formData.username.trim()) return false
  // SFTP: 需要密码或私钥路径
  if (formData.protocol === 'sftp' && !formData.password && !formData.privateKeyPath.trim()) return false
  // S3: 需要 endpoint + bucket + accessKey + secretKey
  if (formData.protocol === 's3') {
    return !!formData.host.trim() && !!formData.bucket.trim() && !!formData.username.trim() && !!formData.password
  }
  return true
}

/** 打开路径浏览器 */
function openPathBrowser() {
  if (!canBrowse()) {
    toast.warning(t('addFolder.browseHint'))
    return
  }
  pathBrowserOpen.value = true
  pathBrowserCurrentPath.value = formData.remotePath.trim() || '/'
  pathBrowserHistory.value = [pathBrowserCurrentPath.value]
  pathBrowserSelectedPath.value = ''
  loadPathBrowser()
}

/** 关闭路径浏览器 */
function closePathBrowser() {
  pathBrowserOpen.value = false
  pathBrowserEntries.value = []
  pathBrowserSelectedPath.value = ''
}

/** 加载当前目录内容 */
async function loadPathBrowser() {
  browsing.value = true
  pathBrowserEntries.value = []
  try {
    const params = buildParams()
    params.dirPath = pathBrowserCurrentPath.value
    const res = await ipc.invoke(ipcApiRoute.file.browseRemotePath, params)
    if (res?.success) {
      pathBrowserEntries.value = res.entries || []
    } else {
      toast.error(res?.message || t('addFolder.browseFailed'))
    }
  } catch (err) {
    toast.error(err?.message || t('addFolder.browseFailed'))
  } finally {
    browsing.value = false
  }
}

/** 点击目录条目 */
function onPathEntryClick(entry) {
  const fullPath = joinPath(pathBrowserCurrentPath.value, entry.name)
  if (entry.isDir) {
    pathBrowserSelectedPath.value = fullPath
  } else {
    // 点击文件不选中（只选目录）
  }
}

/** 双击进入子目录 */
function enterPathDir(entry) {
  const fullPath = joinPath(pathBrowserCurrentPath.value, entry.name)
  pathBrowserCurrentPath.value = fullPath
  pathBrowserHistory.value.push(fullPath)
  pathBrowserSelectedPath.value = ''
  loadPathBrowser()
}

/** 返回上级目录 */
function goPathUp() {
  if (pathBrowserHistory.value.length <= 1) return
  pathBrowserHistory.value.pop()
  pathBrowserCurrentPath.value = pathBrowserHistory.value[pathBrowserHistory.value.length - 1]
  pathBrowserSelectedPath.value = ''
  loadPathBrowser()
}

/** 确认选择当前目录 */
function confirmPathSelection() {
  const selected = pathBrowserSelectedPath.value || pathBrowserCurrentPath.value
  if (selected) {
    formData.remotePath = selected
  }
  closePathBrowser()
}

/** 拼接路径（处理 / 分隔符） */
function joinPath(base, name) {
  if (!base || base === '/') return '/' + name
  return base.replace(/\/$/, '') + '/' + name
}

/** 格式化文件大小（浏览弹窗用） */
function formatBrowseSize(bytes) {
  if (!bytes || bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let size = bytes
  let i = 0
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024
    i++
  }
  if (i === 0) return `${size} ${units[i]}`
  return `${size.toFixed(1)} ${units[i]}`
}

defineExpose({ show, showEdit })
</script>
