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
<!-- 记忆 Tab 激活时显示项目选择器 -->
<div v-if="activeTab === 'memory'" class="topbar__right">
<span class="topbar__project-label">项目选择</span>
<select v-model="selectedWorkspaceSlug" class="topbar__project-select" @change="onWorkspaceChange">
          <option v-for="ws in workspaces" :key="ws.id" :value="ws.id">
            {{ ws.name }}
          </option>
        </select>
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
              <div v-for="skill in groupSkills" :key="skill.slug" class="skill-card" @click="openSkillDetail(skill)">
                <div class="card-head">
                  <div class="card-icon card-icon--skill">
                    <StarFilled />
                  </div>
                  <div class="card-title-row">
                    <div class="card-title">{{ skill.name }}</div>
                    <span v-if="skill.version" class="pill pill--version">v{{ skill.version }}</span>
                  </div>
                  <div class="toggle" :class="{ 'toggle--on': skill.enabled }" @click.stop="toggleSkill(skill)" />
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

      <!-- ===== ===== ===== Skill 详情面板（右侧弹出） ===== ===== ===== -->
      <div v-if="selectedSkill" class="skill-inspector-overlay" @click="closeSkillDetail"></div>
      <aside v-if="selectedSkill" class="skill-inspector">
        <!-- 固定头部 -->
        <div class="skill-inspector__header">
          <div class="skill-inspector__title-row">
            <div class="skill-inspector__icon">
              <StarFilled />
            </div>
            <div class="skill-inspector__title-meta">
              <div class="skill-inspector__title">{{ selectedSkill.name }}</div>
              <div class="skill-inspector__slug">{{ selectedSkill.slug }}</div>
            </div>
            <span v-if="selectedSkill.version" class="pill pill--version">v{{ selectedSkill.version }}</span>
            <span v-if="selectedSkill.group" class="pill pill--group">{{ selectedSkill.group }}</span>
          </div>
        </div>
        <!-- 可滚动中间内容 -->
        <div class="skill-inspector__body">
          <!-- 元数据区 -->
          <div class="skill-inspector__section">
            <h3 class="skill-inspector__section-title">元数据</h3>
            <div class="skill-meta-grid">
              <div class="skill-meta-row">
                <span class="skill-meta-label">名称</span>
                <span class="skill-meta-value">{{ selectedSkill.name }}</span>
              </div>
              <div class="skill-meta-row">
                <span class="skill-meta-label">描述</span>
                <span class="skill-meta-value">{{ selectedSkill.description || '无描述' }}</span>
              </div>
              <div class="skill-meta-row">
                <span class="skill-meta-label">分组</span>
                <span class="skill-meta-value">{{ selectedSkill.group || '未分组' }}</span>
              </div>
              <div class="skill-meta-row">
                <span class="skill-meta-label">位置</span>
                <span class="skill-meta-value skill-meta-value--mono">skills/{{ selectedSkill.slug }}</span>
              </div>
            </div>
          </div>
          <!-- 说明 / 资源文件 Tab -->
          <div class="skill-detail-tabs">
            <div class="skill-detail-tabs__bar">
              <button
                class="skill-detail-tab"
                :class="{ 'skill-detail-tab--active': detailTab === 'body' }"
                @click="detailTab = 'body'"
              >说明</button>
              <button
                class="skill-detail-tab"
                :class="{ 'skill-detail-tab--active': detailTab === 'files' }"
                @click="detailTab = 'files'"
              >资源文件<span v-if="fileCount !== null" class="skill-detail-tab__count">{{ fileCount }}</span></button>
            </div>
            <!-- 说明 Tab -->
            <div v-show="detailTab === 'body'" class="skill-detail-tab-content">
              <div v-if="loadingSkillContent" class="skill-detail-loading">
                <a-spin size="small" />
              </div>
              <div v-else class="skill-detail-markdown">
                <MarkdownRender :content="skillBody || '暂无说明内容'" :render-code-blocks-as-pre="false" :is-dark="isDark" code-block-dark-theme="vitesse-dark" code-block-light-theme="vitesse-light" :themes="['vitesse-dark', 'vitesse-light']" />
              </div>
            </div>
            <!-- 资源文件 Tab -->
            <div v-show="detailTab === 'files'" class="skill-detail-tab-content skill-files-panel">
              <div v-if="loadingFileTree" class="skill-detail-loading">
                <a-spin size="small" />
              </div>
              <template v-else>
                <div v-if="skillFileTree.length === 0" class="skill-files-empty">
                  该 Skill 暂无其他资源文件
                </div>
                <div v-else class="skill-files-layout">
                  <!-- 左栏：文件树 -->
                  <div class="skill-file-tree">
                    <SkillFileTreeNode
                      v-for="node in skillFileTree"
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
                  <div class="skill-file-viewer">
                    <div v-if="!selectedFilePath" class="skill-file-viewer__empty">
                      从左侧选择文件查看内容
                    </div>
                    <div v-else-if="loadingFileContent" class="skill-file-viewer__empty">
                      <a-spin size="small" />
                    </div>
                    <div v-else-if="!skillFileContent" class="skill-file-viewer__empty">
                      无法加载该文件
                    </div>
                    <div v-else-if="!skillFileContent.isText" class="skill-file-viewer__binary">
                      <FileTextOutlined style="font-size: 24px; opacity: 0.3" />
                      <div class="skill-file-viewer__binary-path">{{ skillFileContent.relativePath }}</div>
                      <div>二进制文件（{{ formatFileSize(skillFileContent.size) }}），不支持内置预览</div>
                    </div>
                    <template v-else>
                      <div class="skill-file-viewer__head">
                        <span class="skill-file-viewer__path">{{ skillFileContent.relativePath }}</span>
                        <span class="skill-file-viewer__size">{{ formatFileSize(skillFileContent.size) }}</span>
                      </div>
                      <pre class="skill-file-viewer__content">{{ skillFileContent.content || '' }}</pre>
                    </template>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </aside>

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
          <div v-for="mcp in mcpServers" :key="mcp.id" class="mcp-card" @click="openMcpDetail(mcp)">
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
                @click.stop="toggleMcp(mcp)"
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

        <!-- ===== ===== ===== MCP 详情面板（右侧弹出） ===== ===== ===== -->
        <div v-if="selectedMcp" class="skill-inspector-overlay" @click="closeMcpDetail"></div>
        <aside v-if="selectedMcp" class="skill-inspector">
          <!-- 固定头部 -->
          <div class="skill-inspector__header">
            <div class="skill-inspector__title-row">
              <div class="skill-inspector__icon skill-inspector__icon--mcp">
                <ApiOutlined />
              </div>
              <div class="skill-inspector__title-meta">
                <div class="skill-inspector__title">{{ selectedMcp.displayName }}</div>
                <div class="skill-inspector__slug">{{ selectedMcp.id }}</div>
              </div>
              <span class="pill pill--studio">stdio</span>
              <span
                class="pill"
                :class="selectedMcp.available ? 'pill--available' : 'pill--unavailable'"
              >{{ selectedMcp.available ? '可用' : '已关闭' }}</span>
            </div>
          </div>
          <!-- 可滚动中间内容 -->
          <div class="skill-inspector__body">
            <!-- 元数据区 -->
            <div class="skill-inspector__section">
              <h3 class="skill-inspector__section-title">元数据</h3>
              <div class="skill-meta-grid">
                <div class="skill-meta-row">
                  <span class="skill-meta-label">名称</span>
                  <span class="skill-meta-value">{{ selectedMcp.displayName }}</span>
                </div>
                <div class="skill-meta-row">
                  <span class="skill-meta-label">描述</span>
                  <span class="skill-meta-value">{{ selectedMcp.description || '无描述' }}</span>
                </div>
                <div class="skill-meta-row">
                  <span class="skill-meta-label">分类</span>
                  <span class="skill-meta-value">{{ selectedMcp.category || '-' }}</span>
                </div>
                <div class="skill-meta-row">
                  <span class="skill-meta-label">状态</span>
                  <span class="skill-meta-value">
                    {{ selectedMcp.available ? '可用' : '不可用' }}
                    <span v-if="!selectedMcp.available && selectedMcp.availabilityReason" style="color: var(--text-muted); font-size: 12px;">（{{ selectedMcp.availabilityReason }}）</span>
                  </span>
                </div>
                <div class="skill-meta-row">
                  <span class="skill-meta-label">可切换</span>
                  <span class="skill-meta-value">{{ selectedMcp.toggleable ? '是' : '否' }}</span>
                </div>
                <div class="skill-meta-row">
                  <span class="skill-meta-label">工具数</span>
                  <span class="skill-meta-value">{{ selectedMcp.tools?.length || 0 }} 个</span>
                </div>
              </div>
            </div>
            <!-- 工具列表 -->
            <div class="skill-inspector__section">
              <h3 class="skill-inspector__section-title">工具列表</h3>
              <div v-if="!selectedMcp.tools || selectedMcp.tools.length === 0" class="skill-files-empty">
                此 MCP 服务器暂无工具
              </div>
              <div v-else class="mcp-tool-list">
                <div v-for="tool in selectedMcp.tools" :key="tool.name" class="mcp-tool-item">
                  <div class="mcp-tool-item__head">
                    <span class="mcp-tool-item__name">{{ tool.name }}</span>
                    <span v-if="tool.readOnly" class="mcp-tool-item__badge">只读</span>
                  </div>
                  <div class="mcp-tool-item__desc">{{ tool.description || '无描述' }}</div>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <!-- ===== ===== ===== Memory Tab ===== ===== ===== -->
      <div v-show="activeTab === 'memory'" class="tab-pane tab-pane--memory" :class="{ 'tab-pane--active': activeTab === 'memory' }">
        <!-- 顶部记忆概览卡片 -->
        <div class="memory-top-grid">
          <div
            class="mem-top-card"
            :class="{ 'mem-top-card--active': activeMemoryCategory === 'project' }"
            @click="selectCategory('project')"
          >
            <div class="mem-top-icon">
              <FileTextOutlined />
            </div>
            <div class="mem-top-meta">
              <div class="mem-top-title">项目指令</div>
              <div class="mem-top-sub">Diting 工作区 CLAUDE.md</div>
              <div v-if="memorySummary?.claudeMd?.updatedAt" class="mem-top-sub" style="margin-top: 2px">
                更新于 {{ formatDate(memorySummary.claudeMd.updatedAt) }}
              </div>
            </div>
            <div class="mem-top-size">
              {{ memorySummary?.claudeMd?.exists ? formatFileSize(memorySummary.claudeMd.size) : '未创建' }}
            </div>
          </div>

          <div
            class="mem-top-card"
            :class="{ 'mem-top-card--active': activeMemoryCategory === 'auto' }"
            @click="selectCategory('auto')"
          >
            <div class="mem-top-icon">
              <CloudOutlined />
            </div>
            <div class="mem-top-meta">
              <div class="mem-top-title">自动记忆</div>
              <div class="mem-top-sub">.claude/memory/ 下的主题文件</div>
              <div class="mem-top-sub" style="margin-top: 2px">
                {{ memorySummary?.autoMemory?.fileCount || 0 }} 个文件 · {{ formatFileSize(memorySummary?.autoMemory?.totalSize || 0) }}
              </div>
            </div>
            <div class="mem-top-size">{{ memorySummary?.autoMemory?.fileCount || 0 }} 个文件</div>
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
<button class="btn btn--primary" :disabled="generatingMemory" @click="generateMemory">
<ThunderboltOutlined />
{{ generatingMemory ? '生成中...' : '生成项目记忆' }}
</button>
        </div>

        <!-- 记忆文件浏览器 + 编辑器 -->
        <div class="memory-layout">
          <!-- 左栏：文件列表 -->
          <div class="file-list-panel">
            <div class="file-list-head">
              <span>记忆文件</span>
              <span class="refresh-btn" @click="loadMemoryData">
                <ReloadOutlined />
              </span>
            </div>

            <div v-if="memoryLoading" class="file-loading">
              <a-spin size="small" />
            </div>

            <template v-else>
              <!-- 项目指令区 -->
              <div class="file-section-label">项目指令</div>
              <div
                class="file-item"
                :class="{ 'file-item--active': selectedMemoryFile === 'CLAUDE.md' }"
                @click="selectMemoryFile('CLAUDE.md')"
              >
                <FileMarkdownOutlined class="file-item-icon" />
                <span class="file-item-name">CLAUDE.md</span>
                <span class="file-item-scope">{{ memorySummary?.claudeMd?.exists ? '已创建' : '未创建' }}</span>
              </div>

              <!-- Auto Memory 区（树形结构） -->
              <div v-if="memoryTree.length > 0" class="file-section-label">AUTO MEMORY</div>
              <MemoryFileTreeNode
                v-for="node in memoryTree"
                :key="node.relativePath"
                :node="node"
                :selected-path="selectedMemoryFile"
                :depth="0"
                @select="selectMemoryFile"
              />

              <div v-if="memoryTree.length === 0 && !memorySummary?.claudeMd?.exists" class="file-empty">
                暂无记忆文件
                <p style="font-size: 11px; margin-top: 4px; color: var(--text-muted)">
                  Agent 会在对话中自动创建记忆文件
                </p>
              </div>
            </template>
          </div>

          <!-- 右栏：编辑器 -->
          <div class="editor-panel">
            <div class="editor-head">
              <div>
                <div class="editor-name">{{ selectedMemoryFile || '(未选择)' }}</div>
                <div class="editor-path">{{ selectedMemoryFilePath }}</div>
              </div>
              <div class="editor-actions">
                <button class="small-btn" @click="toggleEditMode">
                  <EyeOutlined v-if="memoryEditMode" />
                  <EditOutlined v-else />
                  {{ memoryEditMode ? '预览' : '编辑' }}
                </button>
                <button class="small-btn" @click="openInFinder">
                  <FolderOpenOutlined />
                  打开文件夹
                </button>
                <button
                  class="small-btn small-btn--dark"
                  :disabled="!memoryEditMode && !hasUnsavedChanges"
                  @click="saveMemoryContent"
                >
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
              <div v-else-if="memoryLoadingContent" class="editor-empty">
                <a-spin size="small" />
              </div>
              <!-- 编辑模式 -->
              <textarea
                v-else-if="memoryEditMode"
                v-model="memoryContent"
                class="editor-textarea"
                @input="onContentInput"
              ></textarea>
              <!-- 预览模式（Markdown 渲染） -->
              <div v-else class="editor-markdown">
                <MarkdownRender :content="memoryContent || ''" :render-code-blocks-as-pre="false" :is-dark="isDark" code-block-dark-theme="vitesse-dark" code-block-light-theme="vitesse-light" :themes="['vitesse-dark', 'vitesse-light']" />
              </div>
              <!-- 未保存标记 -->
              <div v-if="selectedMemoryFile && hasUnsavedChanges" class="editor-unsaved">
                <span class="unsaved-dot"></span>
                有未保存的更改
              </div>
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
  ProjectOutlined,
  CloseOutlined,
} from '@ant-design/icons-vue'
import { ipc } from '@/utils/ipcRenderer'
import { ipcApiRoute } from '@/api'
import MemoryFileTreeNode from '@/components/skills/MemoryFileTreeNode.vue'
import SkillFileTreeNode from '@/components/skills/SkillFileTreeNode.vue'
import MarkdownRender from 'markstream-vue'
import { isDark } from '@/theme'
import { useAgentStore } from '@/stores/agent'
import { useWorkspaceStore } from '@/stores/workspace'
import { useRouter } from 'vue-router'

const agentStore = useAgentStore()
const wsStore = useWorkspaceStore()
const router = useRouter()

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

// ========== Skill 详情面板 ==========
const selectedSkill = ref(null)
const detailTab = ref('body')
const skillContent = ref('')
const skillBody = ref('')
const loadingSkillContent = ref(false)
const skillFileTree = ref([])
const loadingFileTree = ref(false)
const fileCount = ref(null)
const selectedFilePath = ref(null)
const skillFileContent = ref(null)
const loadingFileContent = ref(false)
const expandedDirs = ref(new Set())

/** 打开 Skill 详情面板 */
async function openSkillDetail(skill) {
  selectedSkill.value = skill
  detailTab.value = 'body'
  skillContent.value = ''
  skillBody.value = ''
  skillFileTree.value = []
  selectedFilePath.value = null
  skillFileContent.value = null
  fileCount.value = null
  expandedDirs.value = new Set()
  await loadSkillContent(skill.slug)
}

/** 关闭 Skill 详情面板 */
function closeSkillDetail() {
  selectedSkill.value = null
  skillContent.value = ''
  skillBody.value = ''
  skillFileTree.value = []
  selectedFilePath.value = null
  skillFileContent.value = null
}

/** 加载 SKILL.md 内容并提取正文 */
async function loadSkillContent(skillSlug) {
  loadingSkillContent.value = true
  try {
    const res = await ipc.invoke('controller/piAgent/skillsOperation', {
      action: 'read',
      workspaceSlug: 'default',
      skillSlug,
    })
    if (res.code === 0 && res.data) {
      skillContent.value = res.data
      // 提取 SKILL.md 的正文（去除 frontmatter）
      skillBody.value = extractSkillBody(res.data)
    }
  } catch (err) {
    console.error('[Skills] 加载内容失败:', err)
  } finally {
    loadingSkillContent.value = false
  }
  // 同时预加载文件树
  loadSkillFileTree(skillSlug)
}

/** 从 SKILL.md 内容中提取正文（去除 YAML frontmatter） */
function extractSkillBody(content) {
  // 移除 UTF-8 BOM
  if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1)
  const match = content.match(/^---\s*\n[\s\S]*?\n---\s*\n([\s\S]*)$/)
  return match?.[1] ?? content
}

/** 加载 Skill 资源文件树 */
async function loadSkillFileTree(skillSlug) {
  loadingFileTree.value = true
  try {
    const res = await ipc.invoke('controller/piAgent/skillsOperation', {
      action: 'listFiles',
      workspaceSlug: 'default',
      skillSlug,
    })
    if (res.code === 0 && res.data) {
      skillFileTree.value = res.data
      fileCount.value = countFiles(res.data)
    }
  } catch (err) {
    console.error('[Skills] 加载文件树失败:', err)
    skillFileTree.value = []
  } finally {
    loadingFileTree.value = false
  }
}

/** 递归计算文件总数 */
function countFiles(nodes) {
  let count = 0
  for (const node of nodes) {
    if (node.type === 'file') {
      count += 1
    } else if (node.children) {
      count += countFiles(node.children)
    }
  }
  return count
}

/** 选择文件时加载内容 */
async function onSelectFile(node) {
  if (node.type === 'directory') {
    onToggleDir(node.relativePath)
    return
  }
  selectedFilePath.value = node.relativePath
  loadingFileContent.value = true
  skillFileContent.value = null
  try {
    const res = await ipc.invoke('controller/piAgent/skillsOperation', {
      action: 'readFile',
      workspaceSlug: 'default',
      skillSlug: selectedSkill.value.slug,
      filePath: node.relativePath,
    })
    if (res.code === 0 && res.data) {
      skillFileContent.value = res.data
    }
  } catch (err) {
    console.error('[Skills] 读取文件失败:', err)
  } finally {
    loadingFileContent.value = false
  }
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

// ========== MCP 详情面板 ==========
const selectedMcp = ref(null)

/** 打开 MCP 详情面板 */
function openMcpDetail(mcp) {
  selectedMcp.value = mcp
}

/** 关闭 MCP 详情面板 */
function closeMcpDetail() {
  selectedMcp.value = null
}

// ========== MCP ==========
const mcpServers = ref([])
const mcpLoading = ref(false)

// ========== Memory ==========
// 工作区列表
const workspaces = ref([])
const selectedWorkspaceSlug = ref('default')
// 摘要数据（CLAUDE.md + Auto Memory 统计）
const memorySummary = ref(null)
// Auto Memory 文件树（MemoryFileNode[]）
const memoryTree = ref([])
const memoryLoading = ref(false)
const memoryLoadingContent = ref(false)
const selectedMemoryFile = ref(null)
const memoryContent = ref('')
const memoryEditMode = ref(false)
const hasUnsavedChanges = ref(false)
const generateRange = ref('1m')
const generatingMemory = ref(false)

// 记忆文件总数（用于 Tab 计数）
const memoryTotalCount = computed(() => {
  const claudeExists = memorySummary.value?.claudeMd?.exists ? 1 : 0
  const autoCount = memorySummary.value?.autoMemory?.fileCount || 0
  return claudeExists + autoCount
})

const selectedMemoryFilePath = computed(() => {
  if (!selectedMemoryFile.value) return ''
  // CLAUDE.md 在工作区根目录，auto memory 文件在 .claude/memory/ 下
  if (selectedMemoryFile.value === 'CLAUDE.md') {
    return memorySummary.value?.claudeMd?.path || '~/.diting/pi-agent/workspaces/default/CLAUDE.md'
  }
  const autoDir = memorySummary.value?.autoMemory?.directory
  if (autoDir) {
    return `${autoDir}/${selectedMemoryFile.value}`
  }
  return `~/.diting/pi-agent/workspaces/default/.claude/memory/${selectedMemoryFile.value}`
})

// 当前选中文件所属分类（用于顶部卡片联动高亮）
const activeMemoryCategory = computed(() => {
  if (!selectedMemoryFile.value) return ''
  if (selectedMemoryFile.value === 'CLAUDE.md') return 'project'
  return 'auto'
})

/** 从文件树中深度优先查找第一个文件节点 */
function findFirstFileNode(nodes) {
  for (const node of nodes) {
    if (node.type === 'file') return node
    if (node.type === 'directory' && node.children?.length) {
      const found = findFirstFileNode(node.children)
      if (found) return found
    }
  }
  return null
}

/** 点击顶部概览卡片切换分类 */
function selectCategory(category) {
  if (category === 'project') {
    selectMemoryFile('CLAUDE.md')
  } else if (category === 'auto') {
    // 选中 Auto Memory 下的第一个文件
    const first = findFirstFileNode(memoryTree.value)
    if (first) {
      selectMemoryFile(first.relativePath)
    }
  }
}

// ========== Tab 列表 ==========
const tabs = computed(() => [
  { key: 'skills', label: 'Skills', count: skills.value.length },
  { key: 'mcp', label: 'MCP', count: mcpServers.value.length },
  { key: 'memory', label: '记忆', count: memoryTotalCount.value },
])

// ========== 生命周期 ==========
onMounted(async () => {
  await initSkills()
  await Promise.all([loadSkills(), loadMcpServers(), loadWorkspaces()])

  watch(activeTab, (tab) => {
    if (tab === 'memory' && !memorySummary.value) {
      loadMemoryData()
    }
  })
})

// ========== 工作区操作 ==========

/** 加载工作区列表 */
async function loadWorkspaces() {
  try {
    const res = await ipc.invoke(ipcApiRoute.piAgent.workspaceOperation, { action: 'list' })
    if (res.code === 0 && res.data) {
      workspaces.value = res.data
      // 默认选中第一个工作区
      if (workspaces.value.length > 0) {
        selectedWorkspaceSlug.value = workspaces.value[0].id
      }
    }
  } catch (err) {
    console.error('[Skills] 加载工作区列表失败:', err)
  }
}

/** 切换工作区时重置状态并重新加载 */
function onWorkspaceChange() {
  // 重置记忆相关状态
  memorySummary.value = null
  memoryTree.value = []
  selectedMemoryFile.value = null
  memoryContent.value = ''
  memoryEditMode.value = false
  hasUnsavedChanges.value = false
  // 重新加载
  loadMemoryData()
}

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

/** 加载记忆数据：摘要 + 文件树 */
async function loadMemoryData() {
  memoryLoading.value = true
  try {
    const slug = selectedWorkspaceSlug.value
    const [summaryRes, treeRes] = await Promise.all([
      ipc.invoke(ipcApiRoute.piAgent.memoryOperation, {
        action: 'summary',
        workspaceSlug: slug,
      }),
      ipc.invoke(ipcApiRoute.piAgent.memoryOperation, {
        action: 'tree',
        workspaceSlug: slug,
      }),
    ])

    if (summaryRes.code === 0 && summaryRes.data) {
      memorySummary.value = summaryRes.data
    }
    if (treeRes.code === 0 && treeRes.data) {
      memoryTree.value = treeRes.data
    }

    // 默认选中 CLAUDE.md
    if (!selectedMemoryFile.value && memorySummary.value?.claudeMd?.exists) {
      selectMemoryFile('CLAUDE.md')
    }
  } catch (err) {
    console.error('[Memory] 加载失败:', err)
  } finally {
    memoryLoading.value = false
  }
}

/** 选择记忆文件 */
function selectMemoryFile(filePath) {
  if (hasUnsavedChanges.value && filePath !== selectedMemoryFile.value) {
    // 有未保存更改时确认切换
    import('ant-design-vue').then(({ Modal }) => {
      Modal.confirm({
        title: '未保存的更改',
        content: '当前文件有未保存的更改，切换后将丢失。是否继续？',
        okText: '继续切换',
        cancelText: '取消',
        okType: 'danger',
        onOk() {
          hasUnsavedChanges.value = false
          doSelectFile(filePath)
        },
      })
    })
    return
  }
  doSelectFile(filePath)
}

function doSelectFile(filePath) {
  selectedMemoryFile.value = filePath
  memoryEditMode.value = false
  hasUnsavedChanges.value = false
  loadMemoryContent(filePath)
}

/** 加载记忆文件内容 */
async function loadMemoryContent(filePath) {
  if (!filePath) return
  memoryLoadingContent.value = true
  try {
    const res = await ipc.invoke(ipcApiRoute.piAgent.memoryOperation, {
      action: 'read',
      workspaceSlug: selectedWorkspaceSlug.value,
      filePath,
    })
    if (res.code === 0 && res.data) {
      // 后端返回 MemoryFileContent 对象 { relativePath, isText, size, content }
      memoryContent.value = res.data.content || ''
      hasUnsavedChanges.value = false
    } else {
      memoryContent.value = ''
      message.error(res.message || '读取文件失败')
    }
  } catch (err) {
    console.error('[Memory] 读取失败:', err)
    memoryContent.value = ''
  } finally {
    memoryLoadingContent.value = false
  }
}

/** 切换编辑/预览模式 */
function toggleEditMode() {
  memoryEditMode.value = !memoryEditMode.value
}

/** 内容输入时标记未保存 */
function onContentInput() {
  hasUnsavedChanges.value = true
}

/** 保存记忆文件内容 */
async function saveMemoryContent() {
  if (!selectedMemoryFile.value) return
  try {
    const res = await ipc.invoke(ipcApiRoute.piAgent.memoryOperation, {
      action: 'write',
      workspaceSlug: selectedWorkspaceSlug.value,
      filePath: selectedMemoryFile.value,
      content: memoryContent.value,
    })
    if (res.code === 0) {
      message.success('已保存')
      hasUnsavedChanges.value = false
      // 刷新摘要数据（更新文件大小和时间）
      loadMemorySummary()
    } else {
      message.error(res.message || '保存失败')
    }
  } catch (err) {
    console.error('[Memory] 保存失败:', err)
    message.error('保存失败')
  }
}

/** 仅刷新摘要数据（保存后调用） */
async function loadMemorySummary() {
  try {
    const res = await ipc.invoke(ipcApiRoute.piAgent.memoryOperation, {
      action: 'summary',
      workspaceSlug: selectedWorkspaceSlug.value,
    })
    if (res.code === 0 && res.data) {
      memorySummary.value = res.data
    }
  } catch (err) {
    console.error('[Memory] 刷新摘要失败:', err)
  }
}

/** 在系统文件管理器中打开记忆目录 */
function openInFinder() {
  // 优先打开 auto memory 目录，否则打开工作区根目录
  const autoDir = memorySummary.value?.autoMemory?.directory
  const wsPath = memorySummary.value?.claudeMd?.path?.replace(/CLAUDE\.md$/, '')
  const dir = autoDir || wsPath
  if (!dir) {
    message.warning('无法确定记忆目录路径')
    return
  }
  ipc.invoke(ipcApiRoute.os.openDirectory, { id: dir })
}

// ========== 生成项目记忆 ==========

/** 时间范围映射 */
const RANGE_MAP = {
  '1w': '近 1 周',
  '1m': '近 1 个月',
  '3m': '近 3 个月',
  'all': '全部',
}

/** 构建生成记忆的提示词 */
function buildMemoryPrompt() {
  const rangeLabel = RANGE_MAP[generateRange.value] || '近 1 个月'
  return `请为当前项目初始化并沉淀长期记忆。这里的“项目”指系统提示中的“项目根目录”及其关联的 Agent 工作会话；不要把 Diting 工作区笼统当作项目。

处理范围：

默认读取当前项目${rangeLabel}的 Agent 工作会话，优先近期、最有代表性且用户实际完成工作的会话。证据不足时要明确说明，不得编造。只有用户通过界面明确选择更大范围时，才可处理超过${rangeLabel}的会话。

本次只处理${rangeLabel}。若认为必须查看更早会话，不能自行扩大范围；请在最终回复中说明理由并建议用户在界面中扩大范围后再处理。

路径与职责边界：

系统提示中的“Diting 工作区目录”是 Diting 管理配置与隔离资料的位置，存放 MCP、Skills、Diting 管理的 CLAUDE.md 与 Auto Memory；它不是用户项目根目录。必须按系统提示给出的绝对路径操作，不得猜测或替换路径。

“项目根目录”是用户项目资料的边界，并不一定等于实际 cwd：新会话通常从项目根目录运行，历史会话可能仍从会话工作台运行。允许从项目级 Context 及明确关联的长期项目资料读取证据；不要自动读取、创建或修改项目根内的 .claude/、CLAUDE.md、MCP 或 Skills 配置，除非用户明确要求。

系统提示中的“会话工作台目录”及其 .context/ 是当前会话的 sidecar/workbench：仅承载本次任务的 todo、plan、临时笔记和中间结论，不应作为项目级长期记忆的写入位置。绝不读取、创建或修改其中的 settings.json。

系统提示中的“项目级 Context”与项目级长期资料用于跨会话保留调研、架构分析和项目知识。先区分它们与会话级临时产物，再决定可作为长期记忆证据的内容。

沉淀目标：

从允许读取的会话和 Context 中提炼稳定的项目知识：项目结构、常用命令、架构边界、可靠决策、踩坑经验、用户偏好，以及未来 Agent 必须注意的事项。不要把聊天流水账、单次调试过程或当前任务的临时产物当作长期知识。

只更新系统提示明确给出的“Diting 工作区 CLAUDE.md”绝对路径。这里是 Diting 管理的项目指令文件；内容仅限稳定、跨会话有效的项目规则、入口和工作方法，不得混入临时调试、聊天记录或长篇资料。

只更新系统提示明确给出的“Diting 工作区 Auto Memory 目录”中的 MEMORY.md、必要的主题文件和 user-profile.md，不要在其他目录创建记忆文件。MEMORY.md 保持简短的主题索引与路由，主题细节拆分到主题文件。

user-profile.md 是持续迭代的用户画像：基于现有内容增量合并，条目化且可追溯地记录有充分证据的角色与技术背景、稳定协作偏好、反复出现的关注点、工具链倾向和明确的“下次请这样做”要求。只出现一次或证据不足的信号标为“待确认”，不要当作稳定结论。

写入规则：

写入前先读取已有的 user-profile.md、MEMORY.md 与相关主题文件，并保留仍然有效的内容；不要整体重写或删除有效信息。发现过时内容时，保守修订或标注。

只有明确重复出现、用户明确指定，或删除后会导致未来 Agent 明显犯错的知识才能写入。弱信号、临时过程和证据不足的判断不写入长期记忆，留在最终回复的待确认项。

优先小幅、可审阅的增量更新：CLAUDE.md 保持精炼，MEMORY.md 不承载长正文，跨会话的长资料仍留在项目级长期资料或项目级 Context。

完成后必须报告：读取的会话与 Context 范围、更新的文件、关键沉淀主题、用户画像新增或修订，以及仍需用户确认的项目。`
}

/** 生成项目记忆：创建 Agent 会话并发送提示词 */
async function generateMemory() {
  if (generatingMemory.value) return

  // 查找当前选中的工作区
  const workspace = workspaces.value.find((w) => w.id === selectedWorkspaceSlug.value)
  if (!workspace) {
    message.warning('请先选择一个项目')
    return
  }

  generatingMemory.value = true
  try {
    // 在选中项目中创建 Agent 会话
    const session = await agentStore.createSession(
      `生成项目记忆 - ${workspace.name}`,
      workspace.id,
    )
    if (!session) {
      message.error('创建会话失败')
      return
    }

    // 构建提示词
    const prompt = buildMemoryPrompt()

    // 设置待发送提示词，AgentView 加载后自动消费
    agentStore.pendingPrompt = {
      sessionId: session.id,
      message: prompt,
      workspaceId: workspace.id,
    }

    // 切换到 Agent 模式
    wsStore.selectAgentProject(workspace.id)
    wsStore.setAppMode('agent')
    wsStore.setActiveModule('agent')

    // 通过 selectSession 打开 Tab（避免 router.push 导致的竞态条件）
    await agentStore.selectSession(session.id)

    // 路由跳转到 Agent 页面
    router.push('/agent').catch((err) => console.error('[Skills] 跳转 Agent 失败:', err))

    message.success('已启动 Agent 会话，正在生成项目记忆...')
  } catch (err) {
    console.error('[Memory] 生成项目记忆失败:', err)
    message.error('生成项目记忆失败: ' + (err?.message || String(err)))
  } finally {
    generatingMemory.value = false
  }
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

.topbar__right {
margin-left: auto;
display: flex;
align-items: center;
gap: 6px;
}

.topbar__project-label {
font-size: 13px;
font-weight: 500;
color: var(--text-secondary);
flex-shrink: 0;
white-space: nowrap;
}

.topbar__project-select {
padding: 7px 28px 7px 12px;
border: 1px solid var(--border-color);
border-radius: 8px;
background: var(--bg-panel);
font-size: 14px;
color: var(--text-primary);
cursor: pointer;
min-width: 220px;
appearance: none;
background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'><path d='M1 1l4 4 4-4' stroke='%238A8884' stroke-width='1.5' fill='none' stroke-linecap='round'/></svg>");
background-repeat: no-repeat;
background-position: right 10px center;

&:hover {
border-color: var(--text-primary);
}

&:focus {
outline: none;
border-color: var(--text-primary);
}
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
padding: 20px 24px 24px;
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

// Memory tab 特殊处理：flex 填满可用高度，避免固定高度计算
&--memory {
&.tab-pane--active {
display: flex;
flex-direction: column;
height: 100%;
overflow: hidden;
}
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
  cursor: pointer;

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
margin-bottom: 16px;
flex-shrink: 0;

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
cursor: pointer;
transition: border-color 120ms, box-shadow 120ms;

&:hover {
border-color: var(--accent);
}

&--active {
border-color: var(--accent);
background: rgba(22, 119, 255, 0.06);
box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.1);

.mem-top-icon {
color: var(--accent);
}

.mem-top-title {
color: var(--accent);
}
}
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
margin-bottom: 16px;
flex-shrink: 0;
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
background: var(--accent);
color: #fff;
font-weight: 500;
border: none;
box-shadow: 0 2px 6px rgba(22, 119, 255, 0.25);

&:hover {
background: var(--accent-hover);
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
flex: 1;
min-height: 0;
overflow: hidden;

@media (max-width: 960px) {
grid-template-columns: 1fr;
flex: 0 1 auto;
}
}

.file-list-panel {
background: var(--bg-panel);
border: 1px solid var(--border-color);
border-radius: 12px;
padding: 8px 0;
overflow-y: auto;
min-width: 0;
min-height: 0;
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
box-sizing: border-box;
min-width: 0;
min-height: 0;
display: flex;
flex-direction: column;
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
background: var(--accent);
color: #fff;
font-weight: 500;
border: none;
box-shadow: 0 2px 6px rgba(22, 119, 255, 0.25);

&:hover {
background: var(--accent-hover);
}

&:disabled {
background: var(--bg-hover);
color: var(--text-muted);
border: 1px solid var(--border-color);
box-shadow: none;
cursor: not-allowed;
font-weight: 400;
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

.editor-markdown {
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-primary);

  :deep(h1), :deep(h2), :deep(h3), :deep(h4), :deep(h5), :deep(h6) {
    font-weight: 600;
    margin: 16px 0 8px;
    color: var(--text-primary);
  }
  :deep(h1) { font-size: 20px; }
  :deep(h2) { font-size: 18px; }
  :deep(h3) { font-size: 16px; }
  :deep(h4) { font-size: 14px; }

  :deep(p) { margin: 8px 0; }

  :deep(code) {
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 12px;
    background: var(--bg-hover);
    padding: 2px 6px;
    border-radius: 4px;
  }

  :deep(pre) {
    background: var(--bg-hover);
    padding: 12px 16px;
    border-radius: 8px;
    overflow-x: auto;
    margin: 8px 0;

    code { background: transparent; padding: 0; }
  }

  :deep(table) {
    width: 100%;
    border-collapse: collapse;
    margin: 8px 0;

    th, td {
      border: 1px solid var(--border-color);
      padding: 6px 12px;
      text-align: left;
    }
    th { background: var(--bg-hover); font-weight: 600; }
  }

  :deep(ul), :deep(ol) {
    padding-left: 20px;
    margin: 8px 0;
  }

  :deep(blockquote) {
    border-left: 3px solid var(--accent);
    padding-left: 12px;
    margin: 8px 0;
    color: var(--text-secondary);
  }
}

.editor-unsaved {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 0 0;
  font-size: 11px;
  color: #faad14;
}

.unsaved-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #faad14;
  flex-shrink: 0;
}

// ===== Skill 详情面板 =====
.skill-inspector-overlay {
  position: absolute;
  inset: 0;
  z-index: 30;
  background: rgba(0, 0, 0, 0.02);
  cursor: pointer;
}

.skill-inspector {
  position: absolute;
  top: 12px;
  right: 12px;
  bottom: 12px;
  width: calc(100% * 2 / 3 - 24px);
  min-width: 500px;
  background: var(--bg-panel);
  border: 1px solid var(--border-color-light);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.12);
  border-radius: 12px;
  z-index: 40;
  overflow: hidden;
  display: flex;
  flex-direction: column;

  &__close {
    position: absolute;
    top: 12px;
    right: 12px;
    width: 28px;
    height: 28px;
    border: none;
    background: transparent;
    cursor: pointer;
    color: var(--text-muted);
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10;

    &:hover { background: var(--bg-hover); color: var(--text-primary); }
  }

  &__header {
    flex-shrink: 0;
    padding: 20px 20px 16px;
    border-bottom: 1px solid var(--border-color-light);
  }

  &__title-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  &__icon {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    background: rgba(217, 119, 6, 0.1);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #D97706;
    flex-shrink: 0;
    font-size: 18px;
  }

  &__title-meta {
    flex: 1;
    min-width: 0;
  }

  &__title {
    font-size: 17px;
    font-weight: 600;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__slug {
    font-size: 12px;
    color: var(--text-muted);
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    margin-top: 2px;
  }

  &__body {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 16px 20px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  &__section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  &__section-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-muted);
    margin: 0;
  }
}

.pill--group {
  background: #E6F1FB;
  color: #185FA5;
}

.pill--available {
  background: #E1F5EE;
  color: #0F6E56;
}

.pill--unavailable {
  background: var(--bg-hover);
  color: var(--text-muted);
}

.skill-inspector__icon--mcp {
  background: rgba(24, 95, 165, 0.1);
  color: #185FA5;
}

// ===== MCP 工具列表 =====
.mcp-tool-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mcp-tool-item {
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 12px 14px;
  transition: border-color 120ms;

  &:hover {
    border-color: var(--accent);
  }

  &__head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
  }

  &__name {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  }

  &__badge {
    display: inline-flex;
    align-items: center;
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 3px;
    background: rgba(0, 0, 0, 0.06);
    color: var(--text-muted);
    font-weight: 500;
  }

  &__desc {
    font-size: 12px;
    color: var(--text-secondary);
    line-height: 1.5;
  }
}

// ===== 元数据网格 =====
.skill-meta-grid {
  display: flex;
  flex-direction: column;
  gap: 0;
  background: var(--bg-panel);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}

.skill-meta-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-color-light);

  &:last-child {
    border-bottom: none;
  }
}

.skill-meta-label {
  width: 50px;
  flex-shrink: 0;
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 500;
  padding-top: 1px;
}

.skill-meta-value {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  color: var(--text-primary);
  line-height: 1.5;
  word-break: break-word;

  &--mono {
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    font-size: 12px;
  }
}

// ===== Tab 切换 =====
.skill-detail-tabs {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.skill-detail-tabs__bar {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-color-light);
  padding-bottom: 8px;
}

.skill-detail-tab {
  padding: 6px 14px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-secondary);
  border-radius: 6px;
  transition: background 120ms, color 120ms;
  font-weight: 500;
  display: inline-flex;
  align-items: center;
  gap: 6px;

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
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 16px;
    padding: 0 4px;
    border-radius: 8px;
    background: var(--bg-hover);
    color: var(--text-muted);
    font-size: 10px;
    font-weight: 600;
  }
}

.skill-detail-tab-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  margin-top: 12px;
}

.skill-detail-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 0;
}

// ===== 说明 Tab Markdown =====
.skill-detail-markdown {
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-primary);

  :deep(h1), :deep(h2), :deep(h3), :deep(h4), :deep(h5), :deep(h6) {
    font-weight: 600;
    margin: 16px 0 8px;
    color: var(--text-primary);
  }
  :deep(h1) { font-size: 20px; }
  :deep(h2) { font-size: 18px; }
  :deep(h3) { font-size: 16px; }
  :deep(h4) { font-size: 14px; }

  :deep(p) { margin: 8px 0; }

  :deep(code) {
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 12px;
    background: var(--bg-hover);
    padding: 2px 6px;
    border-radius: 4px;
  }

  :deep(pre) {
    background: var(--bg-hover);
    padding: 12px 16px;
    border-radius: 8px;
    overflow-x: auto;
    margin: 8px 0;

    code { background: transparent; padding: 0; }
  }

  :deep(table) {
    width: 100%;
    border-collapse: collapse;
    margin: 8px 0;

    th, td {
      border: 1px solid var(--border-color);
      padding: 6px 12px;
      text-align: left;
    }
    th { background: var(--bg-hover); font-weight: 600; }
  }

  :deep(ul), :deep(ol) {
    padding-left: 20px;
    margin: 8px 0;
  }

  :deep(blockquote) {
    border-left: 3px solid var(--accent);
    padding-left: 12px;
    margin: 8px 0;
    color: var(--text-secondary);
  }
}

// ===== 资源文件面板 =====
.skill-files-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 400px;
}

.skill-files-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 0;
  font-size: 13px;
  color: var(--text-muted);
}

.skill-files-layout {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 12px;
  flex: 1;
  min-height: 0;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
}

.skill-file-tree {
  background: var(--bg-hover);
  border: 1px solid var(--border-color-light);
  border-radius: 8px;
  padding: 8px 6px;
  overflow-y: auto;
  min-height: 0;
}

// ===== 文件查看器 =====
.skill-file-viewer {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--bg-panel);
  border: 1px solid var(--border-color-light);
  border-radius: 8px;
  overflow: hidden;

  &__empty {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    color: var(--text-muted);
    font-size: 13px;
    padding: 24px;
  }

  &__binary {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    gap: 8px;
    color: var(--text-muted);
    font-size: 13px;
    padding: 24px;
    text-align: center;
  }

  &__binary-path {
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    font-size: 12px;
  }

  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border-color-light);
    background: var(--bg-hover);
    flex-shrink: 0;
  }

  &__path {
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    font-size: 12px;
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }

  &__size {
    font-size: 11px;
    color: var(--text-muted);
    flex-shrink: 0;
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  }

  &__content {
    flex: 1;
    overflow: auto;
    margin: 0;
    padding: 12px 16px;
    font-size: 12px;
    line-height: 1.6;
    font-family: 'SF Mono', Monaco, monospace;
    color: var(--text-primary);
    background: transparent;
    white-space: pre-wrap;
    word-break: break-word;
  }
}
</style>
