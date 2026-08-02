<template>
  <div class="skills-page">
    <!-- ========== 顶部标签栏 ========== -->
    <div class="topbar">
      <div
        v-for="tab in tabs"
        :key="tab.key"
        class="tab"
        :class="{ 'tab--active': activeTab === tab.key }"
        @click="activeTab = tab.key"
      >
        <span class="tab__label">{{ tab.label }}</span>
        <span class="tab__count">{{ tab.count }}</span>
      </div>
    </div>

    <div class="tab-body">
      <!-- ===== ===== ===== Skills Tab ===== ===== ===== -->
      <div v-show="activeTab === 'skills'" class="tab-pane" :class="{ 'tab-pane--active': activeTab === 'skills' }">
        <div class="section-title">
          Diting 内置 <span class="section-count">{{ skills.length }}</span>
        </div>

        <div v-if="skillsLoading" class="loading-state">
          <a-spin tip="加载中..." />
        </div>

        <div v-if="!skillsLoading && skills.length === 0" class="empty-state">
          <ThunderboltOutlined style="font-size: 40px; opacity: 0.2" />
          <p>暂无 Skills</p>
          <p class="empty-hint">Skills 是可复用的 Agent 流程模板，可在 Agent 工作区中通过 / 引用</p>
        </div>

        <!-- 分组渲染 -->
        <template v-for="(groupSkills, groupName) in groupedSkills" :key="groupName">
          <div class="group" :class="{ 'group--collapsed': collapsedGroups.has(groupName) }">
            <div class="group-head" @click="toggleGroup(groupName)">
              <DownOutlined class="chev" />
              <span>{{ groupName }}</span>
              <span class="group-count">{{ groupSkills.length }}</span>
            </div>
            <div v-show="!collapsedGroups.has(groupName)" class="card-grid">
              <div v-for="skill in groupSkills" :key="skill.slug" class="skill-card">
                <div class="card-head">
                  <div class="card-icon card-icon--skill">
                    <StarFilled />
                  </div>
                  <div class="card-title-row">
                    <div class="card-title">{{ skill.name }}</div>
                    <span v-if="skill.version" class="pill pill--version">v{{ skill.version }}</span>
                  </div>
                  <div class="toggle" :class="{ 'toggle--on': skill.enabled }" @click="toggleSkill(skill)" />
                </div>
                <div class="card-name">{{ skill.slug }}</div>
                <div class="card-desc">{{ skill.description || '无描述' }}</div>
                <div class="card-foot">
                  <span class="tag tag--built">Diting 内置</span>
                  <span v-if="skill.hasUpdate" class="tag tag--update">有更新</span>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- ===== ===== ===== MCP Tab ===== ===== ===== -->
      <div v-show="activeTab === 'mcp'" class="tab-pane" :class="{ 'tab-pane--active': activeTab === 'mcp' }">
        <div class="section-title">
          Diting 内置 <span class="section-count">{{ mcpServers.length }}</span>
        </div>

        <div v-if="mcpLoading" class="loading-state">
          <a-spin tip="加载中..." />
        </div>

        <div v-if="!mcpLoading && mcpServers.length === 0" class="empty-state">
          <ApiOutlined style="font-size: 40px; opacity: 0.2" />
          <p>暂无 MCP 服务器</p>
        </div>

        <div class="card-grid">
          <div v-for="mcp in mcpServers" :key="mcp.id" class="mcp-card">
            <div class="card-head">
              <div class="card-icon">
                <ApiOutlined />
              </div>
              <div class="card-title-row">
                <div class="card-title">{{ mcp.displayName }}</div>
                <span class="pill pill--studio">stdio</span>
              </div>
              <div
                class="toggle"
                :class="{ 'toggle--on': mcp.enabled && mcp.available }"
                @click="toggleMcp(mcp)"
              />
            </div>
            <div class="card-desc">{{ mcp.description }}</div>
            <div class="card-foot">
              <span class="tag tag--built">内置</span>
              <span
                :class="['tag', mcp.available ? 'tag--available' : 'tag--unavailable']"
              >
                {{ mcp.available ? '可用' : '已关闭' }}
              </span>
              <span class="tag tag--host">内置托管</span>
            </div>
            <div v-if="mcp.tools && mcp.tools.length > 0" class="mcp-tools">
              <span v-for="tool in mcp.tools.slice(0, 4)" :key="tool.name" class="mcp-tool-chip">
                {{ tool.name }}
                <span v-if="tool.readOnly" class="mcp-tool-ro">只读</span>
              </span>
              <span v-if="mcp.tools.length > 4" class="mcp-tool-more">+{{ mcp.tools.length - 4 }}</span>
            </div>
            <div v-if="!mcp.available && mcp.availabilityReason" class="mcp-warn">
              {{ mcp.availabilityReason }}
            </div>
          </div>
        </div>
      </div>

      <!-- ===== ===== ===== Memory Tab ===== ===== ===== -->
      <div v-show="activeTab === 'memory'" class="tab-pane" :class="{ 'tab-pane--active': activeTab === 'memory' }">
        <!-- 顶部记忆概览卡片 -->
        <div class="memory-top-grid">
          <div class="mem-top-card">
            <div class="mem-top-icon">
              <FileTextOutlined />
            </div>
            <div class="mem-top-meta">
              <div class="mem-top-title">项目指令</div>
              <div class="mem-top-sub">Diting 工作区 CLAUDE.md</div>
              <div v-if="memoryFiles.length > 0" class="mem-top-sub" style="margin-top: 2px">
                更新于 {{ formatDate(memoryFiles[0].mtime) }}
              </div>
            </div>
            <div class="mem-top-size">
              {{ memoryFiles.length > 0 ? formatFileSize(memoryFiles[0].size) : '-' }}
            </div>
          </div>

          <div class="mem-top-card">
            <div class="mem-top-icon">
              <CloudOutlined />
            </div>
            <div class="mem-top-meta">
              <div class="mem-top-title">自动记忆</div>
              <div class="mem-top-sub">.claude/memory/ 下的主题文件</div>
              <div class="mem-top-sub" style="margin-top: 2px">
                {{ memoryAutoCount }} 个文件 · {{ formatFileSize(memoryAutoSize) }}
              </div>
            </div>
            <div class="mem-top-size">{{ memoryAutoCount }} 个文件</div>
          </div>
        </div>

        <!-- 生成记忆条 -->
        <div class="generate-bar">
          <div class="generate-info">
            <div class="generate-title">从历史会话生成项目记忆</div>
            <div class="generate-desc">
              新建一个 Agent 会话，读取当前项目近期的会话，沉淀并更新工作区中的 CLAUDE.md 与 auto memory 文件。
            </div>
          </div>
          <select v-model="generateRange" class="gen-select">
            <option value="1m">近 1 个月</option>
            <option value="1w">近 1 周</option>
            <option value="3m">近 3 个月</option>
            <option value="all">全部</option>
          </select>
          <button class="btn btn--primary" @click="message.info('生成记忆功能即将上线')">
            <ThunderboltOutlined />
            生成项目记忆
          </button>
        </div>

        <!-- 记忆文件浏览器 + 编辑器 -->
        <div class="memory-layout">
          <!-- 左栏：文件列表 -->
          <div class="file-list-panel">
            <div class="file-list-head">
              <span>记忆文件</span>
              <span class="refresh-btn" @click="loadMemoryFiles">
                <ReloadOutlined />
              </span>
            </div>

            <div v-if="memoryLoading" class="file-loading">
              <a-spin size="small" />
            </div>

            <template v-else>
              <!-- 项目指令区 -->
              <div v-if="memoryClaudeMd" class="file-section-label">项目指令</div>
              <div
                v-if="memoryClaudeMd"
                class="file-item"
                :class="{ 'file-item--active': selectedMemoryFile === memoryClaudeMd.path }"
                @click="selectMemoryFile(memoryClaudeMd)"
              >
                <FileMarkdownOutlined class="file-item-icon" />
                <span class="file-item-name">{{ memoryClaudeMd.name }}</span>
                <span class="file-item-scope">工作区指令</span>
              </div>

              <!-- Auto Memory 区 -->
              <div v-if="memoryAutoFiles.length > 0" class="file-section-label">AUTO MEMORY</div>
              <div
                v-for="file in memoryAutoFiles"
                :key="file.path"
                class="file-item"
                :class="{ 'file-item--active': selectedMemoryFile === file.path }"
                @click="selectMemoryFile(file)"
              >
                <FileMarkdownOutlined class="file-item-icon" />
                <span class="file-item-name">{{ file.name }}</span>
                <span class="file-item-size">{{ formatFileSize(file.size) }}</span>
              </div>

              <div v-if="memoryFiles.length === 0" class="file-empty">
                暂无记忆文件
              </div>
            </template>
          </div>

          <!-- 右栏：编辑器 -->
          <div class="editor-panel">
            <div class="editor-head">
              <div>
                <div class="editor-name">{{ selectedMemoryFileName }}</div>
                <div class="editor-path">{{ selectedMemoryFilePath }}</div>
              </div>
              <div class="editor-actions">
                <button class="small-btn" @click="memoryEditMode = !memoryEditMode">
                  <EyeOutlined v-if="memoryEditMode" />
                  <EditOutlined v-else />
                  {{ memoryEditMode ? '预览' : '编辑' }}
                </button>
                <button class="small-btn" @click="openInFinder">
                  <FolderOpenOutlined />
                  打开文件夹
                </button>
                <button class="small-btn small-btn--dark" @click="saveMemoryContent">
                  <SaveOutlined />
                  保存
                </button>
              </div>
            </div>
            <div class="editor-body">
              <div v-if="!selectedMemoryFile" class="editor-empty">
                <FileTextOutlined style="font-size: 40px; opacity: 0.2" />
                <p>选择左侧文件查看内容</p>
              </div>
              <textarea
                v-else-if="memoryEditMode"
                v-model="memoryContent"
                class="editor-textarea"
              ></textarea>
              <pre v-else class="editor-preview">{{ memoryContent }}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { message } from 'ant-design-vue'
import {
  ThunderboltFilled,
  ThunderboltOutlined,
  ApiOutlined,
  FileTextOutlined,
  ReloadOutlined,
  EditOutlined,
  EyeOutlined,
  SaveOutlined,
  FolderOpenOutlined,
  FileMarkdownOutlined,
  DownOutlined,
  StarFilled,
  CloudOutlined,
} from '@ant-design/icons-vue'
import { ipc } from '@/utils/ipcRenderer'

// ========== 标签页 ==========
const activeTab = ref('skills')

// ========== Skills ==========
const skills = ref([])
const skillsLoading = ref(false)
const collapsedGroups = ref(new Set())

const groupedSkills = computed(() => {
  const groups = {}
  for (const skill of skills.value) {
    const g = skill.group || '未分组'
    if (!groups[g]) groups[g] = []
    groups[g].push(skill)
  }
  const orderedKeys = Object.keys(groups).sort((a, b) => {
    if (a === 'proma' || a === 'diting') return -1
    if (b === 'proma' || b === 'diting') return 1
    if (a === '未分组') return 1
    if (b === '未分组') return -1
    return a.localeCompare(b)
  })
  const result = {}
  for (const key of orderedKeys) {
    result[key] = groups[key]
  }
  return result
})

function toggleGroup(groupName) {
  if (collapsedGroups.value.has(groupName)) {
    collapsedGroups.value.delete(groupName)
  } else {
    collapsedGroups.value.add(groupName)
  }
  collapsedGroups.value = new Set(collapsedGroups.value)
}

// ========== MCP ==========
const mcpServers = ref([])
const mcpLoading = ref(false)

// ========== Memory ==========
const memoryFiles = ref([])
const memoryLoading = ref(false)
const selectedMemoryFile = ref(null)
const memoryContent = ref('')
const memoryEditMode = ref(false)
const generateRange = ref('1m')

const memoryClaudeMd = computed(() =>
  memoryFiles.value.find((f) => f.name === 'CLAUDE.md'),
)

const memoryAutoFiles = computed(() =>
  memoryFiles.value.filter((f) => f.name !== 'CLAUDE.md'),
)

const memoryAutoCount = computed(() => memoryAutoFiles.value.length)

const memoryAutoSize = computed(() =>
  memoryAutoFiles.value.reduce((sum, f) => sum + (f.size || 0), 0),
)

const selectedMemoryFileName = computed(() => {
  const f = memoryFiles.value.find((f) => f.path === selectedMemoryFile.value)
  return f?.name || ''
})

const selectedMemoryFilePath = computed(() => {
  if (!selectedMemoryFile.value) return ''
  return `~/.diting/pi-agent/workspaces/default/${selectedMemoryFile.value}`
})

// ========== Tab 列表 ==========
const tabs = computed(() => [
  { key: 'skills', label: 'Skills', count: skills.value.length },
  { key: 'mcp', label: 'MCP', count: mcpServers.value.length },
  { key: 'memory', label: '记忆', count: memoryFiles.value.length },
])

// ========== 生命周期 ==========
onMounted(async () => {
  await initSkills()
  await Promise.all([loadSkills(), loadMcpServers()])

  watch(activeTab, (tab) => {
    if (tab === 'memory' && memoryFiles.value.length === 0) {
      loadMemoryFiles()
    }
  })
})

// ========== Skills 操作 ==========
async function initSkills() {
  try {
    await ipc.invoke('controller/piAgent/initSkills', {})
  } catch (err) {
    console.error('[Skills] 初始化失败:', err)
  }
}

async function loadSkills() {
  skillsLoading.value = true
  try {
    const res = await ipc.invoke('controller/piAgent/skillsOperation', {
      action: 'list',
      workspaceSlug: 'default',
    })
    if (res.code === 0 && res.data) {
      skills.value = res.data
    }
  } catch (err) {
    console.error('[Skills] 加载失败:', err)
  } finally {
    skillsLoading.value = false
  }
}

async function toggleSkill(skill) {
  try {
    const res = await ipc.invoke('controller/piAgent/skillsOperation', {
      action: 'toggle',
      skillSlug: skill.slug,
      enabled: !skill.enabled,
      workspaceSlug: 'default',
    })
    if (res.code === 0 && res.data) {
      skills.value = res.data
    }
  } catch (err) {
    console.error('[Skills] 切换失败:', err)
    message.error('切换失败')
  }
}

// ========== MCP 操作 ==========
async function loadMcpServers() {
  mcpLoading.value = true
  try {
    const res = await ipc.invoke('controller/piAgent/mcpOperation', {
      action: 'list',
      workspaceSlug: 'default',
    })
    if (res.code === 0 && res.data) {
      mcpServers.value = res.data
    }
  } catch (err) {
    console.error('[MCP] 加载失败:', err)
  } finally {
    mcpLoading.value = false
  }
}

async function toggleMcp(mcp) {
  if (!mcp.toggleable) return
  try {
    const res = await ipc.invoke('controller/piAgent/mcpOperation', {
      action: 'toggle',
      id: mcp.id,
      enabled: !mcp.enabled,
    })
    if (res.code === 0 && res.data) {
      mcpServers.value = res.data
    }
  } catch (err) {
    console.error('[MCP] 切换失败:', err)
    message.error('切换失败')
  }
}

// ========== 记忆操作 ==========
async function loadMemoryFiles() {
  memoryLoading.value = true
  try {
    const res = await ipc.invoke('controller/piAgent/memoryOperation', {
      action: 'list',
      workspaceSlug: 'default',
    })
    if (res.code === 0 && res.data) {
      memoryFiles.value = res.data.files || []
      if (memoryFiles.value.length > 0 && !selectedMemoryFile.value) {
        selectMemoryFile(memoryFiles.value[0])
      }
    }
  } catch (err) {
    console.error('[Memory] 加载失败:', err)
  } finally {
    memoryLoading.value = false
  }
}

function selectMemoryFile(file) {
  selectedMemoryFile.value = file.path
  memoryEditMode.value = false
  loadMemoryContent(file.path)
}

async function loadMemoryContent(filePath) {
  try {
    const res = await ipc.invoke('controller/piAgent/memoryOperation', {
      action: 'read',
      workspaceSlug: 'default',
      filePath,
    })
    if (res.code === 0) {
      memoryContent.value = res.data || ''
    }
  } catch (err) {
    console.error('[Memory] 读取失败:', err)
    memoryContent.value = ''
  }
}

async function saveMemoryContent() {
  if (!selectedMemoryFile.value) return
  try {
    const res = await ipc.invoke('controller/piAgent/memoryOperation', {
      action: 'write',
      workspaceSlug: 'default',
      filePath: selectedMemoryFile.value,
      content: memoryContent.value,
    })
    if (res.code === 0) {
      message.success('已保存')
    }
  } catch (err) {
    console.error('[Memory] 保存失败:', err)
    message.error('保存失败')
  }
  memoryEditMode.value = false
}

function openInFinder() {
  message.info('打开文件夹功能即将上线')
}

// ========== 工具函数 ==========
function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return '-'
  const units = ['B', 'KB', 'MB']
  let size = bytes
  let i = 0
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024
    i++
  }
  return `${size.toFixed(1)} ${units[i]}`
}

function formatDate(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  if (isNaN(d.getTime())) return isoStr
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
</script>

<style lang="less" scoped>
.skills-page {
  height: 100%;
  width: 100%;
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-panel);
  overflow: hidden;
}

// ===== 顶部标签栏 =====
.topbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 12px 24px 0;
  flex-shrink: 0;
}

.tab {
  padding: 7px 16px;
  border-radius: 8px;
  font-size: 14px;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
  transition: background 120ms, color 120ms;
  font-weight: 500;

  &:hover {
    background: var(--bg-hover);
  }

  &--active {
    background: var(--bg-panel);
    color: var(--text-primary);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    border: 1px solid var(--border-color);
  }

  &__count {
    color: var(--text-muted);
    font-weight: 400;
    margin-left: 4px;
    font-size: 13px;
  }
}

// ===== Tab 内容区 =====
.tab-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px 48px;
  min-height: 0;
}

.tab-pane {
  display: none;
  width: 100%;

  &--active {
    display: block;
    width: 100%;
    animation: fadeIn 200ms ease;
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

// ===== Section 标题 =====
.section-title {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 12px;
  font-weight: 500;
}

.section-count {
  color: var(--text-muted);
}

// ===== Card 网格 =====
.card-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 20px;

  @media (max-width: 1100px) {
    grid-template-columns: repeat(2, 1fr);
  }
  @media (max-width: 700px) {
    grid-template-columns: 1fr;
  }
}

// ===== 卡片（通用） =====
.skill-card,
.mcp-card {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 18px 20px 16px;
  transition: border-color 120ms, box-shadow 120ms;
  position: relative;

  &:hover {
    border-color: var(--border-color);
    box-shadow: var(--shadow-sm);
  }
}

.card-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 10px;
}

.card-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  color: #185FA5;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 1px;
  font-size: 22px;

  &--skill {
    color: #D97706;
  }
}

.card-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.card-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pill {
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 4px;
  background: var(--bg-hover);
  color: var(--text-secondary);
  font-weight: 500;
  flex-shrink: 0;

  &--studio {
    background: #EEEAE0;
    color: #6B6759;
  }

  &--version {
    background: #E8E3D4;
    color: #6B6759;
  }
}

// ===== Toggle 开关 =====
.toggle {
  flex-shrink: 0;
  width: 36px;
  height: 20px;
  border-radius: 999px;
  background: var(--border-color);
  position: relative;
  cursor: pointer;
  transition: background 160ms;
  margin-left: 4px;

  &::after {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #fff;
    transition: transform 160ms;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
  }

  &--on {
    background: var(--text-primary);

    &::after {
      transform: translateX(16px);
    }
  }
}

// ===== Skill 卡片特有 =====
.card-name {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: -4px;
  margin-bottom: 8px;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
}

.card-desc {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.55;
  margin-bottom: 14px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  padding: 3px 8px;
  border-radius: 4px;
  font-weight: 500;

  &--built {
    background: #E6F1FB;
    color: #185FA5;
  }

  &--available {
    background: #E1F5EE;
    color: #0F6E56;
  }

  &--unavailable {
    background: var(--bg-hover);
    color: var(--text-muted);
  }

  &--update {
    background: #FAEEDA;
    color: #854F0B;
  }

  &--host {
    background: var(--bg-hover);
    color: var(--text-secondary);
    margin-left: auto;
  }
}

// ===== MCP 工具列表 =====
.mcp-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}

.mcp-tool-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #185FA5;
  background: rgba(24, 95, 165, 0.06);
  padding: 2px 8px;
  border-radius: 4px;
}

.mcp-tool-ro {
  font-size: 9px;
  color: #8A8884;
  background: rgba(0, 0, 0, 0.06);
  padding: 1px 4px;
  border-radius: 3px;
}

.mcp-tool-more {
  font-size: 11px;
  color: #8A8884;
  padding: 2px 6px;
}

.mcp-warn {
  margin-top: 8px;
  font-size: 11px;
  color: #854F0B;
  padding: 4px 8px;
  background: #FAEEDA;
  border-radius: 4px;
}

// ===== 分组折叠 =====
.group {
  margin-bottom: 8px;
}

.group-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 4px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
  font-weight: 500;

  .chev {
    color: var(--text-muted);
    transition: transform 120ms;
    font-size: 12px;
  }
}

.group--collapsed {
  .chev {
    transform: rotate(-90deg);
  }
}

.group-count {
  color: var(--text-muted);
  font-weight: 400;
}

// ===== Loading / Empty =====
.loading-state,
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  color: var(--text-muted);
  font-size: 13px;
  gap: 8px;
}

.empty-hint {
  font-size: 11px;
  max-width: 320px;
  text-align: center;
  line-height: 1.5;
}

.file-loading,
.file-empty {
  padding: 32px 12px;
  text-align: center;
  font-size: 12px;
  color: var(--text-muted);
}

// ===== Memory 页面 =====
.memory-top-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 20px;

  @media (max-width: 960px) {
    grid-template-columns: 1fr;
  }
}

.mem-top-card {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px 20px;
  display: flex;
  align-items: center;
  gap: 14px;
}

.mem-top-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: var(--bg-hover);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);
  flex-shrink: 0;
  font-size: 20px;
}

.mem-top-meta {
  flex: 1;
  min-width: 0;
}

.mem-top-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 2px;
  color: var(--text-primary);
}

.mem-top-sub {
  font-size: 12px;
  color: var(--text-secondary);
}

.mem-top-size {
  font-size: 12px;
  color: var(--text-muted);
  flex-shrink: 0;
}

// ===== Generate bar =====
.generate-bar {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 18px 20px;
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 16px;
}

.generate-info {
  flex: 1;
}

.generate-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 4px;
  color: var(--text-primary);
}

.generate-desc {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.gen-select {
  padding: 6px 26px 6px 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-panel);
  font-size: 13px;
  color: var(--text-primary);
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path d='M1 1l4 4 4-4' stroke='%238A8884' stroke-width='1.5' fill='none' stroke-linecap='round'/></svg>");
  background-repeat: no-repeat;
  background-position: right 10px center;
}

// ===== 按钮（仅记忆页面使用） =====
.btn {
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-panel);
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: background 120ms, border-color 120ms;
  font-weight: 500;
  white-space: nowrap;

  &:hover {
    background: var(--bg-hover);
    border-color: var(--border-color);
  }

  &--primary {
    background: var(--text-primary);
    color: #fff;
    border-color: var(--text-primary);

    &:hover {
      opacity: 0.85;
    }
  }
}

// ===== Memory 布局 =====
.memory-layout {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 16px;
  align-items: stretch;
  width: 100%;

  @media (max-width: 960px) {
    grid-template-columns: 1fr;
  }
}

.file-list-panel {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 8px 0;
  overflow-y: auto;
  min-width: 0;
  max-height: 600px;
}

.file-list-head {
  padding: 10px 16px 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 500;
}

.refresh-btn {
  color: var(--text-muted);
  cursor: pointer;
  display: inline-flex;
  align-items: center;

  &:hover {
    color: var(--text-primary);
  }
}

.file-section-label {
  padding: 10px 16px 4px;
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 500;
}

.file-item {
  padding: 8px 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-primary);
  transition: background 120ms;

  &:hover {
    background: var(--bg-hover);
  }

  &--active {
    background: var(--bg-active);
  }
}

.file-item-icon {
  font-size: 14px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.file-item-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-item-size,
.file-item-scope {
  font-size: 12px;
  color: var(--text-muted);
  flex-shrink: 0;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
}

.file-item-scope {
  margin-left: auto;
  font-family: inherit;
}

// ===== Editor =====
.editor-panel {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  max-height: 600px;
}

.editor-head {
  padding: 14px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.editor-name {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 2px;
  color: var(--text-primary);
}

.editor-path {
  font-size: 12px;
  color: var(--text-muted);
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.editor-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.small-btn {
  padding: 5px 10px;
  font-size: 12px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background: var(--bg-panel);
  color: var(--text-secondary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  transition: background 120ms;
  white-space: nowrap;

  &:hover {
    background: var(--bg-hover);
  }

  &--dark {
    background: var(--text-primary);
    color: #fff;
    border-color: var(--text-primary);

    &:hover {
      opacity: 0.85;
    }
  }
}

.editor-body {
  padding: 24px 32px 32px;
  flex: 1;
  overflow-y: auto;
  min-height: 200px;
}

.editor-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  gap: 8px;
  color: var(--text-muted);
  font-size: 13px;
}

.editor-preview {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-primary);
  font-family: 'SF Mono', Monaco, monospace;
  white-space: pre-wrap;
  word-break: break-word;
}

.editor-textarea {
  width: 100%;
  min-height: 400px;
  border: none;
  padding: 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-primary);
  font-family: 'SF Mono', Monaco, monospace;
  background: transparent;
  outline: none;
  resize: vertical;
}
</style>
