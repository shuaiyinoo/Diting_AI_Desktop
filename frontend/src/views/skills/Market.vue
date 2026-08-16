<template>
  <div class="flex h-full w-full min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-background">
    <!-- ========== 顶部：返回 + 搜索 ========== -->
    <div class="flex shrink-0 items-center gap-3 border-b border-border px-6 py-3">
      <button
        class="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        @click="$emit('back')"
      >
        <ArrowLeft class="size-4" />
        返回
      </button>
      <div class="h-5 w-px bg-border" />
      <h1 class="text-base font-semibold text-foreground">Skills 市场</h1>
      <span class="rounded bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">skills.sh</span>
      <div class="ml-auto flex w-full max-w-[420px] items-center gap-2">
        <div class="relative flex-1">
          <Search class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜索 Skill 名称 / 功能描述..."
            class="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/10"
            @keydown.enter="doSearch"
          />
        </div>
        <Button size="sm" class="shrink-0" :disabled="searching" @click="doSearch">
          <Spinner v-if="searching" class="size-4" />
          <Search v-else class="size-4" />
          搜索
        </Button>
      </div>
    </div>

    <!-- ========== Topic 筛选 ========== -->
    <div class="flex shrink-0 items-center gap-2 border-b border-border px-6 py-2.5">
      <span class="shrink-0 text-xs font-medium text-muted-foreground">Topic：</span>
      <button
        v-for="topic in topicChips"
        :key="topic.slug"
        class="rounded-full border px-3 py-1 text-[11px] font-medium transition-colors"
        :class="activeTopic === topic.slug
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border text-muted-foreground hover:bg-accent'"
        @click="selectTopic(topic.slug)"
      >{{ topic.title }} · {{ topic.skillCount }}</button>
    </div>

    <!-- ========== 内容区 ========== -->
    <div class="min-h-0 flex-1 overflow-y-auto px-6 py-4">
      <!-- 加载中 -->
      <div v-if="loading" class="flex min-h-[300px] flex-col items-center justify-center gap-2 text-muted-foreground">
        <Spinner class="size-6" />
        <span class="text-sm">加载中...</span>
      </div>

      <!-- 空状态 -->
      <div v-else-if="displaySkills.length === 0" class="flex min-h-[300px] flex-col items-center justify-center gap-2 text-muted-foreground">
        <Package class="size-10 opacity-20" />
        <p class="text-sm">暂无 Skills</p>
        <p class="max-w-[320px] text-center text-[11px] leading-relaxed">尝试更换关键词搜索</p>
      </div>

      <!-- 技能卡片网格 -->
      <template v-else>
        <!-- 搜索结果标题 -->
        <div v-if="isSearchMode" class="mb-3 text-xs font-medium text-muted-foreground">
          搜索 "<span class="text-foreground">{{ searchQuery }}</span>" 找到 {{ displaySkills.length }} 个结果
        </div>
        <div v-else-if="activeTopic !== 'all'" class="mb-3 text-xs font-medium text-muted-foreground">
          📂 {{ topicChips.find(t => t.slug === activeTopic)?.title }} · {{ displaySkills.length }} 个 Skills
        </div>
        <div v-else class="mb-3 text-xs font-medium text-muted-foreground">
          🔥 热门 Top {{ displaySkills.length }}
        </div>

        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <div
            v-for="skill in displaySkills"
            :key="skill.id"
            class="group cursor-pointer rounded-xl border border-border bg-card p-4 transition-all hover:border-foreground/20 hover:shadow-md"
            @click="openDetail(skill)"
          >
            <!-- 卡片头部 -->
            <div class="mb-2.5 flex items-start gap-2.5">
              <div class="mt-0.5 flex size-5 shrink-0 items-center justify-center text-[#D97706]">
                <Star class="size-5" />
              </div>
              <div class="flex min-w-0 flex-1 items-center gap-2">
                <div class="overflow-hidden text-ellipsis whitespace-nowrap text-sm font-semibold text-foreground">{{ skill.name }}</div>
              </div>
            </div>
            <!-- slug -->
            <div class="mb-2 font-mono text-xs text-muted-foreground">{{ skill.slug }}</div>
            <!-- source -->
            <div class="mb-3 line-clamp-1 text-xs leading-relaxed text-muted-foreground">
              {{ skill.source }}
            </div>
            <!-- 底部标签 -->
            <div class="flex flex-wrap items-center gap-2">
              <span class="inline-flex items-center rounded bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                {{ skill.source }}
              </span>
              <div class="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
                <span v-if="skill.installs != null" class="inline-flex items-center gap-0.5">
                  <Download class="size-3" /> {{ skill.installs }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- ========== Skill 详情面板 ========== -->
    <div v-if="selectedSkill" class="fixed inset-0 z-30 bg-black/[0.02] cursor-pointer" @click="closeDetail" />
    <aside
      v-if="selectedSkill"
      class="absolute right-3 top-3 bottom-3 z-40 flex w-[calc(66.66%-24px)] min-w-[500px] max-w-[760px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
    >
      <!-- 头部 -->
      <div class="shrink-0 border-b border-border/50 px-5 pb-4 pt-5">
        <div class="flex items-center gap-3">
          <div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-yellow-500/10 text-[#D97706]">
            <Star class="size-[18px]" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="overflow-hidden text-ellipsis whitespace-nowrap text-[15px] font-semibold text-foreground">{{ selectedSkill.name }}</div>
            <div class="mt-0.5 font-mono text-xs text-muted-foreground">{{ selectedSkill.slug }}</div>
          </div>
          <button
            class="flex size-7 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent"
            @click="closeDetail"
          >
            <X class="size-4" />
          </button>
        </div>
      </div>

      <!-- 可滚动内容 -->
      <div class="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overflow-x-hidden p-5">
        <!-- 元数据 -->
        <div class="flex flex-col gap-3">
          <h3 class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">元数据</h3>
          <div class="overflow-hidden rounded-lg border border-border">
            <div
              v-for="(row, idx) in detailRows"
              :key="idx"
              class="flex items-start gap-3 px-3.5 py-2.5"
              :class="idx < detailRows.length - 1 ? 'border-b border-border' : ''"
            >
              <span class="w-[50px] shrink-0 pt-px text-xs font-medium text-muted-foreground">{{ row.label }}</span>
              <span class="min-w-0 flex-1 break-words text-xs leading-relaxed text-foreground" :class="row.mono ? 'font-mono' : ''">{{ row.value }}</span>
            </div>
          </div>
        </div>

        <!-- 说明 / 资源文件 Tab -->
        <div class="flex min-h-0 flex-1 flex-col">
          <div class="flex shrink-0 gap-1 border-b border-border/50 pb-2">
            <Button variant="ghost" size="sm" class="inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium" :class="detailTab === 'body' ? 'border border-border bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent'" @click="detailTab = 'body'">说明</Button>
            <Button variant="ghost" size="sm" class="inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium" :class="detailTab === 'files' ? 'border border-border bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent'" @click="detailTab = 'files'">
              资源文件
              <span v-if="marketFileCount > 0" class="inline-flex h-4 min-w-[18px] items-center justify-center rounded bg-muted px-1 text-[10px] font-semibold text-muted-foreground">{{ marketFileCount }}</span>
            </Button>
          </div>

          <!-- 说明 Tab -->
          <div v-show="detailTab === 'body'" class="mt-3 flex min-h-0 flex-1 flex-col">
            <div v-if="loadingDetail" class="flex items-center justify-center py-10">
              <Spinner class="size-5" />
            </div>
            <div v-else-if="!skillBody" class="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
              <FileText class="size-8 opacity-20" />
              <p class="text-sm">暂无说明内容</p>
              <p class="max-w-[280px] text-center text-[11px] leading-relaxed">该 Skill 可能不包含 SKILL.md 文件</p>
            </div>
            <div v-else class="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed text-foreground">
              <MarkdownRender
                :content="skillBody"
                :render-code-blocks-as-pre="false"
                :is-dark="isDark"
                code-block-dark-theme="vitesse-dark"
                code-block-light-theme="vitesse-light"
                :themes="['vitesse-dark', 'vitesse-light']"
              />
            </div>
          </div>

          <!-- 资源文件 Tab -->
          <div v-show="detailTab === 'files'" class="mt-3 flex min-h-[400px] flex-1 flex-col">
            <div v-if="loadingDetail" class="flex items-center justify-center py-10">
              <Spinner class="size-5" />
            </div>
            <template v-else>
              <div v-if="marketFileTree.length === 0" class="flex items-center justify-center py-10 text-xs text-muted-foreground">
                该 Skill 暂无其他资源文件
              </div>
              <div v-else class="grid min-h-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-[240px_1fr]">
                <!-- 左栏：文件树 -->
                <div class="overflow-y-auto rounded-lg border border-border/50 bg-muted/30 p-1.5">
                  <SkillFileTreeNode
                    v-for="node in marketFileTree"
                    :key="node.relativePath"
                    :node="node"
                    :selected-path="selectedFilePath"
                    :expanded-set="expandedDirs"
                    :depth="0"
                    @select="onSelectFile"
                    @toggle="onToggleDir"
                  />
                </div>
                <!-- 右栏：文件内容 -->
                <div class="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-border/50">
                  <div v-if="!selectedFilePath" class="flex flex-1 items-center justify-center p-6 text-xs text-muted-foreground">
                    从左侧选择文件查看内容
                  </div>
                  <template v-else>
                    <div class="flex shrink-0 items-center justify-between gap-2 border-b border-border/50 bg-muted/30 px-3 py-2">
                      <span class="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">{{ selectedFilePath }}</span>
                      <span class="shrink-0 font-mono text-[11px] text-muted-foreground/70">{{ formatFileSize(selectedFileSize) }}</span>
                    </div>
                    <pre class="min-h-0 flex-1 overflow-auto bg-transparent p-3.5 font-mono text-xs leading-relaxed text-foreground">{{ selectedFileContent || '' }}</pre>
                  </template>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>

      <!-- 底部安装按钮 -->
      <div class="flex shrink-0 items-center gap-2.5 border-t border-border bg-card px-5 py-3.5">
        <span class="mr-auto text-[11px] text-muted-foreground">
          💡 安装后可在 Agent 中通过
          <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">/skill:{{ selectedSkill.slug }}</code>
          命令调用
        </span>
        <Button
          size="sm"
          class="gap-1.5"
          :disabled="installing"
          @click="installToAll"
        >
          <Spinner v-if="installingAll" class="size-3.5" />
          <Download v-else class="size-3.5" />
          安装到本地
        </Button>
      </div>
    </aside>

  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { toast } from 'vue-sonner'
import { ArrowLeft, Download, FileText, Package, Search, Star, X } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { ipc } from '@/utils/ipcRenderer'
import { ipcApiRoute } from '@/api'
import MarkdownRender from 'markstream-vue'
import { isDark } from '@/theme'
import SkillFileTreeNode from '@/components/skills/SkillFileTreeNode.vue'

const emit = defineEmits(['back', 'installed'])

// ========== 数据 ==========
const skills = ref([])
const loading = ref(false)
const searching = ref(false)
const searchQuery = ref('')
const isSearchMode = ref(false)
const activeTopic = ref('all')
const topics = ref([])

// ========== 详情面板 ==========
const selectedSkill = ref(null)
const skillMdContent = ref('')
const skillBody = ref('')
const loadingDetail = ref(false)
const detailTab = ref('body')
const marketFiles = ref([]) // 原始文件列表 [{ path, contents }]
const marketFileTree = ref([]) // 构建后的文件树
const marketFileCount = ref(0)
const selectedFilePath = ref(null)
const selectedFileContent = ref('')
const selectedFileSize = ref(0)
const expandedDirs = ref(new Set())

// ========== 安装 ==========
const installing = ref(false)
const installingAll = ref(false)

// ========== Topic 筛选 ==========
const topicChips = computed(() => {
  return [
    { slug: 'all', title: '全部', skillCount: skills.value.length },
    ...topics.value.map((t) => ({ slug: t.slug, title: t.title, skillCount: t.skillCount })),
  ]
})

// ========== 展示的 Skills ==========
const displaySkills = computed(() => {
  if (isSearchMode.value) return skills.value
  if (activeTopic.value === 'all') return skills.value
  // 按 topic 的 skillIds 过滤
  const topic = topics.value.find((t) => t.slug === activeTopic.value)
  if (!topic) return skills.value
  const idSet = new Set(topic.skillIds)
  return skills.value.filter((s) => idSet.has(s.id))
})

// ========== 详情元数据行 ==========
const detailRows = computed(() => {
  if (!selectedSkill.value) return []
  const s = selectedSkill.value
  return [
    { label: '名称', value: s.name },
    { label: 'Slug', value: s.slug, mono: true },
    { label: '来源', value: s.source || '-', mono: true },
    { label: '仓库', value: s.repo_url || '-', mono: true },
    { label: '安装数', value: s.installs != null ? String(s.installs) : '-' },
    { label: '文件数', value: marketFileCount.value > 0 ? `${marketFileCount.value} 个文件` : '-' },
  ]
})

// ========== 生命周期 ==========
onMounted(async () => {
  await loadTop100()
  await loadTopics()
})

// ========== 方法 ==========

async function loadTop100() {
  loading.value = true
  isSearchMode.value = false
  activeTopic.value = 'all'
  try {
    const res = await ipc.invoke(ipcApiRoute.skillHub.getTop20, {})
    if (res.code === 0 && res.data) {
      skills.value = res.data
    } else {
      toast.error(res.message || '加载失败')
    }
  } catch (err) {
    console.error('[SkillsMarket] 加载Top100失败:', err)
    toast.error('加载失败，请检查网络连接')
  } finally {
    loading.value = false
  }
}

async function loadTopics() {
  try {
    const res = await ipc.invoke(ipcApiRoute.skillHub.getTopics, {})
    if (res.code === 0 && res.data) {
      topics.value = res.data
    } else {
      console.error('[SkillsMarket] 加载Topic失败:', res.message)
    }
  } catch (err) {
    console.error('[SkillsMarket] 加载Topic异常:', err)
  }
}

async function doSearch() {
  const query = searchQuery.value.trim()
  if (!query) {
    await loadTop100()
    return
  }

  searching.value = true
  loading.value = true
  isSearchMode.value = true
  try {
    const res = await ipc.invoke(ipcApiRoute.skillHub.search, {
      query,
      limit: 100,
    })
    if (res.code === 0 && res.data) {
      skills.value = res.data
      if (res.data.length === 0) {
        toast.info('未找到匹配的 Skills')
      }
    } else {
      toast.error(res.message || '搜索失败')
    }
  } catch (err) {
    console.error('[SkillsMarket] 搜索失败:', err)
    toast.error('搜索失败，请检查网络连接')
  } finally {
    loading.value = false
    searching.value = false
  }
}

function selectTopic(slug) {
  activeTopic.value = slug
}

async function openDetail(skill) {
  selectedSkill.value = skill
  skillMdContent.value = ''
  skillBody.value = ''
  marketFiles.value = []
  marketFileTree.value = []
  marketFileCount.value = 0
  selectedFilePath.value = null
  selectedFileContent.value = ''
  selectedFileSize.value = 0
  expandedDirs.value = new Set()
  detailTab.value = 'body'
  loadingDetail.value = true
  try {
    const res = await ipc.invoke(ipcApiRoute.skillHub.getDetail, { skillId: skill.id })
    if (res.code === 0 && res.data) {
      selectedSkill.value = { ...skill, ...res.data }
      skillMdContent.value = res.data.skill_md_raw || ''
      skillBody.value = extractSkillBody(skillMdContent.value)
      marketFiles.value = res.data.files || []
      marketFileCount.value = marketFiles.value.length
      marketFileTree.value = buildFileTree(marketFiles.value)
    }
  } catch (err) {
    console.error('[SkillsMarket] 加载详情失败:', err)
    toast.error('加载详情失败')
  } finally {
    loadingDetail.value = false
  }
}

function closeDetail() {
  selectedSkill.value = null
  skillMdContent.value = ''
  skillBody.value = ''
  marketFiles.value = []
  marketFileTree.value = []
  marketFileCount.value = 0
  selectedFilePath.value = null
  selectedFileContent.value = ''
  selectedFileSize.value = 0
  expandedDirs.value = new Set()
}

/** 从 SKILL.md 内容中提取正文（去除 YAML frontmatter） */
function extractSkillBody(content) {
  if (!content) return ''
  if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1)
  const match = content.match(/^---\s*\n[\s\S]*?\n---\s*\n([\s\S]*)$/)
  return match?.[1] ?? content
}

/** 从扁平文件列表构建文件树 */
function buildFileTree(files) {
  const root = { children: {} }
  for (const file of files) {
    const parts = file.path.split('/').filter(Boolean)
    let current = root
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isLast = i === parts.length - 1
      if (!current.children[part]) {
        current.children[part] = {
          name: part,
          type: isLast ? 'file' : 'directory',
          relativePath: parts.slice(0, i + 1).join('/'),
          children: {},
          ...(isLast ? { content: file.contents, size: file.contents?.length || 0 } : {}),
        }
      }
      current = current.children[part]
    }
  }
  return convertChildrenToArray(root.children)
}

/** 递归将 children 对象转为排序后的数组 */
function convertChildrenToArray(childrenObj) {
  const arr = Object.values(childrenObj).map((node) => {
    if (node.type === 'directory' && node.children) {
      node.children = convertChildrenToArray(node.children)
    }
    return node
  })
  return arr.sort(sortTreeNodes)
}

/** 排序：目录优先，然后按名称 */
function sortTreeNodes(a, b) {
  if (a.type !== b.type) {
    return a.type === 'directory' ? -1 : 1
  }
  return a.name.localeCompare(b.name)
}

/** 选择文件时直接从已加载的数据中获取内容 */
function onSelectFile(node) {
  if (node.type === 'directory') {
    onToggleDir(node.relativePath)
    return
  }
  selectedFilePath.value = node.relativePath
  selectedFileContent.value = node.content || ''
  selectedFileSize.value = node.size || 0
}

/** 展开/折叠目录 */
function onToggleDir(path) {
  const next = new Set(expandedDirs.value)
  if (next.has(path)) {
    next.delete(path)
  } else {
    next.add(path)
  }
  expandedDirs.value = next
}

/** 格式化文件大小 */
function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

async function installToAll() {
  if (!selectedSkill.value) return
  installing.value = true
  installingAll.value = true
  try {
    const res = await ipc.invoke(ipcApiRoute.skillHub.installToAll, {
      skillId: selectedSkill.value.id,
    })
    if (res.code === 0 && res.data) {
      toast.success(`已安装「${res.data.slug}」到本地（${res.data.fileCount} 个文件，已同步到 ${res.data.workspaceCount} 个工作区）`)
      emit('installed')
      closeDetail()
    } else {
      toast.error(res.message || '安装失败')
    }
  } catch (err) {
    console.error('[SkillsMarket] 安装到本地失败:', err)
    toast.error('安装失败: ' + (err?.message || String(err)))
  } finally {
    installing.value = false
    installingAll.value = false
  }
}
</script>
