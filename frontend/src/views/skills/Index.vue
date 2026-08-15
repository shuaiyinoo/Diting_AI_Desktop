<template>
  <div class="flex h-full w-full min-w-0 flex-1 flex-col overflow-hidden bg-background">
    <!-- ========== 顶部标签栏 ========== -->
    <div class="flex shrink-0 items-center gap-1 px-6 pt-3">
      <div
        v-for="tab in tabs"
        :key="tab.key"
        class="cursor-pointer rounded-lg px-4 py-1.5 text-sm font-medium transition-all"
        :class="activeTab === tab.key
          ? 'border border-border bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:bg-accent'"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
        <span class="ml-1 text-xs text-muted-foreground">{{ tab.count }}</span>
      </div>

      <!-- 记忆 Tab 激活时显示项目选择器 -->
      <div v-if="activeTab === 'memory'" class="ml-auto flex items-center gap-1.5">
        <span class="shrink-0 whitespace-nowrap text-xs font-medium text-muted-foreground">项目选择</span>
        <select
          v-model="selectedWorkspaceSlug"
          class="min-w-[220px] cursor-pointer rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground appearance-none bg-[url('data:image/svg+xml;utf8,<svg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2710%27%20height=%276%27%20viewBox=%270%200%2010%206%27><path%20d=%27M1%201l4%204%204-4%27%20stroke=%27%238A8884%27%20stroke-width=%271.5%27%20fill=%27none%27%20stroke-linecap=%27round%27/></svg>')] bg-[length:10px_6px] bg-no-repeat bg-[position:right_10px_center] pr-7 hover:border-foreground/30 focus:outline-none focus:border-foreground/50"
          @change="onWorkspaceChange"
        >
          <option v-for="ws in workspaces" :key="ws.id" :value="ws.id">
            {{ ws.name }}
          </option>
        </select>
      </div>
    </div>

    <!-- Tab 内容区 -->
    <div class="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-5">
      <!-- ===== Skills Tab ===== -->
      <div v-show="activeTab === 'skills'">
        <div class="mb-3 text-xs font-medium text-muted-foreground">
          Diting 内置 <span class="text-muted-foreground/70">{{ skills.length }}</span>
        </div>

        <!-- 加载中 -->
        <div v-if="skillsLoading" class="flex min-h-[200px] flex-col items-center justify-center gap-2 text-muted-foreground">
          <Spinner class="size-5" />
          <span class="text-sm">加载中...</span>
        </div>

        <!-- 空状态 -->
        <div v-if="!skillsLoading && skills.length === 0" class="flex min-h-[200px] flex-col items-center justify-center gap-2 text-muted-foreground">
          <Zap class="size-10 opacity-20" />
          <p class="text-sm">暂无 Skills</p>
          <p class="max-w-[320px] text-center text-[11px] leading-relaxed">Skills 是可复用的 Agent 流程模板，可在 Agent 工作区中通过 / 引用</p>
        </div>

        <!-- 分组渲染 -->
        <template v-for="(groupSkills, groupName) in groupedSkills" :key="groupName">
          <div class="mb-2">
            <div
              class="flex cursor-pointer select-none items-center gap-1.5 py-3 text-xs font-medium text-muted-foreground"
              @click="toggleGroup(groupName)"
            >
              <ChevronDown class="size-3.5 text-muted-foreground transition-transform" :class="{ '-rotate-90': collapsedGroups.has(groupName) }" />
              <span>{{ groupName }}</span>
              <span class="font-normal text-muted-foreground/70">{{ groupSkills.length }}</span>
            </div>
            <div v-show="!collapsedGroups.has(groupName)" class="mb-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div
                v-for="skill in groupSkills"
                :key="skill.slug"
                class="relative cursor-pointer rounded-xl border border-border bg-card p-[18px] pb-4 transition-all hover:shadow-sm"
                @click="openSkillDetail(skill)"
              >
                <!-- 卡片头部 -->
                <div class="mb-2.5 flex items-start gap-3">
                  <div class="mt-0.5 flex size-5 shrink-0 items-center justify-center text-[#D97706]">
                    <Star class="size-5" />
                  </div>
                  <div class="flex min-w-0 flex-1 items-center gap-2">
                    <div class="overflow-hidden text-ellipsis whitespace-nowrap text-sm font-semibold text-foreground">{{ skill.name }}</div>
                    <span v-if="skill.version" class="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">v{{ skill.version }}</span>
                  </div>
                  <!-- Toggle 开关 -->
                  <Switch
                    :model-value="skill.enabled"
                    @update:model-value="() => toggleSkill(skill)"
                    @click.stop
                  />
                </div>
                <div class="mb-2 -mt-1 font-mono text-xs text-muted-foreground">{{ skill.slug }}</div>
                <div class="mb-3.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{{ skill.description || '无描述' }}</div>
                <div class="flex flex-wrap items-center gap-2">
                  <span class="inline-flex items-center rounded bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600">Diting 内置</span>
                  <span v-if="skill.hasUpdate" class="inline-flex items-center rounded bg-yellow-500/10 px-2 py-0.5 text-xs font-medium text-yellow-600">有更新</span>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- ===== Skill 详情面板 ===== -->
      <div v-if="selectedSkill" class="fixed inset-0 z-30 bg-black/[0.02] cursor-pointer" @click="closeSkillDetail" />
      <aside
        v-if="selectedSkill"
        class="absolute right-3 top-3 bottom-3 z-40 flex w-[calc(66.66%-24px)] min-w-[500px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
      >
        <!-- 固定头部 -->
        <div class="shrink-0 border-b border-border/50 px-5 pb-4 pt-5">
          <div class="flex items-center gap-3">
            <div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-yellow-500/10 text-[#D97706]">
              <Star class="size-[18px]" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="overflow-hidden text-ellipsis whitespace-nowrap text-[15px] font-semibold text-foreground">{{ selectedSkill.name }}</div>
              <div class="mt-0.5 font-mono text-xs text-muted-foreground">{{ selectedSkill.slug }}</div>
            </div>
            <span v-if="selectedSkill.version" class="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">v{{ selectedSkill.version }}</span>
            <span v-if="selectedSkill.group" class="shrink-0 rounded bg-blue-500/10 px-1.5 py-0.5 text-[11px] font-medium text-blue-600">{{ selectedSkill.group }}</span>
          </div>
        </div>
        <!-- 可滚动内容 -->
        <div class="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overflow-x-hidden p-5">
          <!-- 元数据区 -->
          <div class="flex flex-col gap-3">
            <h3 class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">元数据</h3>
            <div class="overflow-hidden rounded-lg border border-border">
              <div
                v-for="(row, idx) in [
                  { label: '名称', value: selectedSkill.name },
                  { label: '描述', value: selectedSkill.description || '无描述' },
                  { label: '分组', value: selectedSkill.group || '未分组' },
                  { label: '位置', value: `skills/${selectedSkill.slug}`, mono: true },
                ]"
                :key="idx"
                class="flex items-start gap-3 px-3.5 py-2.5"
                :class="idx < 3 ? 'border-b border-border' : ''"
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
                <span v-if="fileCount !== null" class="inline-flex h-4 min-w-[18px] items-center justify-center rounded bg-muted px-1 text-[10px] font-semibold text-muted-foreground">{{ fileCount }}</span>
              </Button>
            </div>
            <!-- 说明 Tab -->
            <div v-show="detailTab === 'body'" class="mt-3 flex min-h-0 flex-1 flex-col">
              <div v-if="loadingSkillContent" class="flex items-center justify-center py-10">
                <Spinner class="size-5" />
              </div>
              <div v-else class="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed text-foreground">
                <MarkdownRender :content="skillBody || '暂无说明内容'" :render-code-blocks-as-pre="false" :is-dark="isDark" code-block-dark-theme="vitesse-dark" code-block-light-theme="vitesse-light" :themes="['vitesse-dark', 'vitesse-light']" />
              </div>
            </div>
            <!-- 资源文件 Tab -->
            <div v-show="detailTab === 'files'" class="mt-3 flex min-h-[400px] flex-1 flex-col">
              <div v-if="loadingFileTree" class="flex items-center justify-center py-10">
                <Spinner class="size-5" />
              </div>
              <template v-else>
                <div v-if="skillFileTree.length === 0" class="flex items-center justify-center py-10 text-xs text-muted-foreground">
                  该 Skill 暂无其他资源文件
                </div>
                <div v-else class="grid min-h-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-[240px_1fr]">
                  <!-- 左栏：文件树 -->
                  <div class="overflow-y-auto rounded-lg border border-border/50 bg-muted/30 p-1.5">
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
                  <div class="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-border/50">
                    <div v-if="!selectedFilePath" class="flex flex-1 items-center justify-center p-6 text-xs text-muted-foreground">
                      从左侧选择文件查看内容
                    </div>
                    <div v-else-if="loadingFileContent" class="flex flex-1 items-center justify-center">
                      <Spinner class="size-5" />
                    </div>
                    <div v-else-if="!skillFileContent" class="flex flex-1 items-center justify-center p-6 text-xs text-muted-foreground">
                      无法加载该文件
                    </div>
                    <div v-else-if="!skillFileContent.isText" class="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-xs text-muted-foreground">
                      <FileText class="size-6 opacity-30" />
                      <div class="font-mono text-xs">{{ skillFileContent.relativePath }}</div>
                      <div>二进制文件（{{ formatFileSize(skillFileContent.size) }}），不支持内置预览</div>
                    </div>
                    <template v-else>
                      <div class="flex shrink-0 items-center justify-between gap-2 border-b border-border/50 bg-muted/30 px-3 py-2">
                        <span class="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">{{ skillFileContent.relativePath }}</span>
                        <span class="shrink-0 font-mono text-[11px] text-muted-foreground/70">{{ formatFileSize(skillFileContent.size) }}</span>
                      </div>
                      <pre class="min-h-0 flex-1 overflow-auto bg-transparent p-3.5 font-mono text-xs leading-relaxed text-foreground">{{ skillFileContent.content || '' }}</pre>
                    </template>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </aside>

      <!-- ===== MCP Tab ===== -->
      <div v-show="activeTab === 'mcp'">
        <div class="mb-3 text-xs font-medium text-muted-foreground">
          Diting 内置 <span class="text-muted-foreground/70">{{ mcpServers.length }}</span>
        </div>

        <div v-if="mcpLoading" class="flex min-h-[200px] flex-col items-center justify-center gap-2 text-muted-foreground">
          <Spinner class="size-5" />
          <span class="text-sm">加载中...</span>
        </div>

        <div v-if="!mcpLoading && mcpServers.length === 0" class="flex min-h-[200px] flex-col items-center justify-center gap-2 text-muted-foreground">
          <Plug class="size-10 opacity-20" />
          <p class="text-sm">暂无 MCP 服务器</p>
        </div>

        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div
            v-for="mcp in mcpServers"
            :key="mcp.id"
            class="cursor-pointer rounded-xl border border-border bg-card p-[18px] pb-4 transition-all hover:shadow-sm"
            @click="openMcpDetail(mcp)"
          >
            <div class="mb-2.5 flex items-start gap-3">
              <div class="mt-0.5 flex size-5 shrink-0 items-center justify-center text-[#185FA5]">
                <Plug class="size-5" />
              </div>
              <div class="flex min-w-0 flex-1 items-center gap-2">
                <div class="overflow-hidden text-ellipsis whitespace-nowrap text-sm font-semibold text-foreground">{{ mcp.displayName }}</div>
                <span class="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">stdio</span>
              </div>
              <Switch
                :model-value="mcp.enabled && mcp.available"
                @update:model-value="() => toggleMcp(mcp)"
                @click.stop
              />
            </div>
            <div class="mb-3.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{{ mcp.description }}</div>
            <div class="flex flex-wrap items-center gap-2">
              <span class="inline-flex items-center rounded bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600">内置</span>
              <span
                class="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium"
                :class="mcp.available ? 'bg-green-500/10 text-green-600' : 'bg-muted text-muted-foreground'"
              >{{ mcp.available ? '可用' : '已关闭' }}</span>
              <span class="ml-auto inline-flex items-center rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">内置托管</span>
            </div>
            <div v-if="mcp.tools && mcp.tools.length > 0" class="mt-2 flex flex-wrap gap-1">
              <span
                v-for="tool in mcp.tools.slice(0, 4)"
                :key="tool.name"
                class="inline-flex items-center gap-1 rounded bg-blue-500/5 px-2 py-0.5 text-[11px] text-blue-600"
              >
                {{ tool.name }}
                <span v-if="tool.readOnly" class="rounded bg-foreground/5 px-1 text-[9px] text-muted-foreground">只读</span>
              </span>
              <span v-if="mcp.tools.length > 4" class="px-1.5 py-0.5 text-[11px] text-muted-foreground">+{{ mcp.tools.length - 4 }}</span>
            </div>
            <div v-if="!mcp.available && mcp.availabilityReason" class="mt-2 rounded bg-yellow-500/10 px-2 py-1 text-[11px] text-yellow-600">
              {{ mcp.availabilityReason }}
            </div>
          </div>
        </div>

        <!-- MCP 详情面板 -->
        <div v-if="selectedMcp" class="fixed inset-0 z-30 bg-black/[0.02] cursor-pointer" @click="closeMcpDetail" />
        <aside
          v-if="selectedMcp"
          class="absolute right-3 top-3 bottom-3 z-40 flex w-[calc(66.66%-24px)] min-w-[500px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
        >
          <div class="shrink-0 border-b border-border/50 px-5 pb-4 pt-5">
            <div class="flex items-center gap-3">
              <div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-[#185FA5]">
                <Plug class="size-[18px]" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="overflow-hidden text-ellipsis whitespace-nowrap text-[15px] font-semibold text-foreground">{{ selectedMcp.displayName }}</div>
                <div class="mt-0.5 font-mono text-xs text-muted-foreground">{{ selectedMcp.id }}</div>
              </div>
              <span class="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">stdio</span>
              <span
                class="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium"
                :class="selectedMcp.available ? 'bg-green-500/10 text-green-600' : 'bg-muted text-muted-foreground'"
              >{{ selectedMcp.available ? '可用' : '已关闭' }}</span>
            </div>
          </div>
          <div class="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overflow-x-hidden p-5">
            <div class="flex flex-col gap-3">
              <h3 class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">元数据</h3>
              <div class="overflow-hidden rounded-lg border border-border">
                <div
                  v-for="(row, idx) in [
                    { label: '名称', value: selectedMcp.displayName },
                    { label: '描述', value: selectedMcp.description || '无描述' },
                    { label: '分类', value: selectedMcp.category || '-' },
                    { label: '状态', value: selectedMcp.available ? '可用' : '不可用' + (selectedMcp.availabilityReason ? `（${selectedMcp.availabilityReason}）` : '') },
                    { label: '可切换', value: selectedMcp.toggleable ? '是' : '否' },
                    { label: '工具数', value: `${selectedMcp.tools?.length || 0} 个` },
                  ]"
                  :key="idx"
                  class="flex items-start gap-3 px-3.5 py-2.5"
                  :class="idx < 5 ? 'border-b border-border' : ''"
                >
                  <span class="w-[50px] shrink-0 pt-px text-xs font-medium text-muted-foreground">{{ row.label }}</span>
                  <span class="min-w-0 flex-1 break-words text-xs leading-relaxed text-foreground">{{ row.value }}</span>
                </div>
              </div>
            </div>
            <div class="flex flex-col gap-3">
              <h3 class="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">工具列表</h3>
              <div v-if="!selectedMcp.tools || selectedMcp.tools.length === 0" class="flex items-center justify-center py-10 text-xs text-muted-foreground">
                此 MCP 服务器暂无工具
              </div>
              <div v-else class="flex flex-col gap-2">
                <div
                  v-for="tool in selectedMcp.tools"
                  :key="tool.name"
                  class="rounded-lg border border-border p-3 transition-colors hover:border-primary"
                >
                  <div class="mb-1.5 flex items-center gap-2">
                    <span class="font-mono text-xs font-semibold text-foreground">{{ tool.name }}</span>
                    <span v-if="tool.readOnly" class="inline-flex rounded bg-foreground/5 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">只读</span>
                  </div>
                  <div class="text-[11px] leading-relaxed text-muted-foreground">{{ tool.description || '无描述' }}</div>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <!-- ===== Memory Tab ===== -->
      <div v-show="activeTab === 'memory'" class="flex h-full flex-col overflow-hidden">
        <!-- 顶部记忆概览卡片 -->
        <div class="mb-4 grid flex-shrink-0 grid-cols-1 gap-3 sm:grid-cols-2">
          <div
            class="flex cursor-pointer items-center gap-3.5 rounded-xl border border-border bg-card p-4 transition-all hover:border-primary"
            :class="activeMemoryCategory === 'project' ? 'border-primary bg-primary/5 ring-2 ring-primary/10' : ''"
            @click="selectCategory('project')"
          >
            <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground" :class="activeMemoryCategory === 'project' ? 'text-primary' : ''">
              <FileText class="size-5" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="text-sm font-semibold text-foreground" :class="activeMemoryCategory === 'project' ? 'text-primary' : ''">项目指令</div>
              <div class="text-xs text-muted-foreground">Diting 工作区 CLAUDE.md</div>
              <div v-if="memorySummary?.claudeMd?.updatedAt" class="mt-0.5 text-xs text-muted-foreground">
                更新于 {{ formatDate(memorySummary.claudeMd.updatedAt) }}
              </div>
            </div>
            <div class="shrink-0 text-xs text-muted-foreground">
              {{ memorySummary?.claudeMd?.exists ? formatFileSize(memorySummary.claudeMd.size) : '未创建' }}
            </div>
          </div>

          <div
            class="flex cursor-pointer items-center gap-3.5 rounded-xl border border-border bg-card p-4 transition-all hover:border-primary"
            :class="activeMemoryCategory === 'auto' ? 'border-primary bg-primary/5 ring-2 ring-primary/10' : ''"
            @click="selectCategory('auto')"
          >
            <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground" :class="activeMemoryCategory === 'auto' ? 'text-primary' : ''">
              <Cloud class="size-5" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="text-sm font-semibold text-foreground" :class="activeMemoryCategory === 'auto' ? 'text-primary' : ''">自动记忆</div>
              <div class="text-xs text-muted-foreground">.claude/memory/ 下的主题文件</div>
              <div class="mt-0.5 text-xs text-muted-foreground">
                {{ memorySummary?.autoMemory?.fileCount || 0 }} 个文件 · {{ formatFileSize(memorySummary?.autoMemory?.totalSize || 0) }}
              </div>
            </div>
            <div class="shrink-0 text-xs text-muted-foreground">{{ memorySummary?.autoMemory?.fileCount || 0 }} 个文件</div>
          </div>
        </div>

        <!-- 生成记忆条 -->
        <div class="mb-4 flex flex-shrink-0 items-center gap-4 rounded-xl border border-border bg-card p-[18px]">
          <div class="flex-1">
            <div class="mb-1 text-sm font-semibold text-foreground">从历史会话生成项目记忆</div>
            <div class="text-xs leading-relaxed text-muted-foreground">
              新建一个 Agent 会话，读取当前项目近期的会话，沉淀并更新工作区中的 CLAUDE.md 与 auto memory 文件。
            </div>
          </div>
          <select
            v-model="generateRange"
            class="cursor-pointer rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-foreground appearance-none bg-[url('data:image/svg+xml;utf8,<svg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2710%27%20height=%276%27%20viewBox=%270%200%2010%206%27><path%20d=%27M1%201l4%204%204-4%27%20stroke=%27%238A8884%27%20stroke-width=%271.5%27%20fill=%27none%27%20stroke-linecap=%27round%27/></svg>')] bg-[length:10px_6px] bg-no-repeat bg-[position:right_10px_center] pr-7"
          >
            <option value="1m">近 1 个月</option>
            <option value="1w">近 1 周</option>
            <option value="3m">近 3 个月</option>
            <option value="all">全部</option>
          </select>
          <Button class="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-medium shadow-sm disabled:opacity-50" :disabled="generatingMemory" @click="generateMemory">
            <Zap class="size-4" />
            {{ generatingMemory ? '生成中...' : '生成项目记忆' }}
          </Button>
        </div>

        <!-- 记忆文件浏览器 + 编辑器 -->
        <div class="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-hidden sm:grid-cols-[280px_1fr]">
          <!-- 左栏：文件列表 -->
          <div class="min-h-0 min-w-0 overflow-y-auto rounded-xl border border-border bg-card py-2">
            <div class="flex items-center justify-between px-4 pb-2 pt-2.5 text-xs font-medium text-muted-foreground">
              <span>记忆文件</span>
              <Button variant="ghost" size="icon" class="cursor-pointer text-muted-foreground hover:text-foreground" @click="loadMemoryData">
                <RefreshCw class="size-3.5" />
              </Button>
            </div>

            <div v-if="memoryLoading" class="py-8 text-center">
              <Spinner class="size-5" />
            </div>

            <template v-else>
              <!-- 项目指令区 -->
              <div class="px-4 pb-1 pt-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">项目指令</div>
              <div
                class="flex cursor-pointer items-center gap-2.5 px-4 py-2 text-xs text-foreground transition-colors hover:bg-accent"
                :class="selectedMemoryFile === 'CLAUDE.md' ? 'bg-accent' : ''"
                @click="selectMemoryFile('CLAUDE.md')"
              >
                <FileText class="size-3.5 shrink-0 text-muted-foreground" />
                <span class="flex-1 truncate">CLAUDE.md</span>
                <span class="shrink-0 text-xs text-muted-foreground">{{ memorySummary?.claudeMd?.exists ? '已创建' : '未创建' }}</span>
              </div>

              <!-- Auto Memory 区 -->
              <div v-if="memoryTree.length > 0" class="px-4 pb-1 pt-2.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">AUTO MEMORY</div>
              <MemoryFileTreeNode
                v-for="node in memoryTree"
                :key="node.relativePath"
                :node="node"
                :selected-path="selectedMemoryFile"
                :depth="0"
                @select="selectMemoryFile"
              />

              <div v-if="memoryTree.length === 0 && !memorySummary?.claudeMd?.exists" class="px-3 py-8 text-center text-xs text-muted-foreground">
                暂无记忆文件
                <p class="mt-1 text-[11px]">Agent 会在对话中自动创建记忆文件</p>
              </div>
            </template>
          </div>

          <!-- 右栏：编辑器 -->
          <div class="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card">
            <div class="flex shrink-0 items-center justify-between gap-3 border-b border-border px-5 py-3.5">
              <div class="min-w-0">
                <div class="text-sm font-semibold text-foreground">{{ selectedMemoryFile || '(未选择)' }}</div>
                <div class="truncate font-mono text-xs text-muted-foreground">{{ selectedMemoryFilePath }}</div>
              </div>
              <div class="flex shrink-0 gap-2">
                <Button variant="outline" size="sm" class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent" @click="toggleEditMode">
                  <Eye v-if="memoryEditMode" class="size-3.5" />
                  <Pencil v-else class="size-3.5" />
                  {{ memoryEditMode ? '预览' : '编辑' }}
                </Button>
                <Button variant="outline" size="sm" class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent" @click="openInFinder">
                  <FolderOpen class="size-3.5" />
                  打开文件夹
                </Button>
                <Button size="sm" class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium shadow-sm disabled:cursor-not-allowed disabled:opacity-50" :disabled="!memoryEditMode && !hasUnsavedChanges" @click="saveMemoryContent">
                  <Save class="size-3.5" />
                  保存
                </Button>
              </div>
            </div>
            <div class="min-h-[200px] flex-1 overflow-y-auto px-8 py-6">
              <div v-if="!selectedMemoryFile" class="flex min-h-[200px] flex-col items-center justify-center gap-2 text-muted-foreground">
                <FileText class="size-10 opacity-20" />
                <p class="text-sm">选择左侧文件查看内容</p>
              </div>
              <div v-else-if="memoryLoadingContent" class="flex min-h-[200px] items-center justify-center">
                <Spinner class="size-5" />
              </div>
              <!-- 编辑模式 -->
              <Textarea
                v-else-if="memoryEditMode"
                v-model="memoryContent"
                class="min-h-[400px] w-full resize-y border-none bg-transparent p-0 font-mono text-xs leading-relaxed focus-visible:ring-0"
                @input="onContentInput"
              />
              <!-- 预览模式 -->
              <div v-else class="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed text-foreground">
                <MarkdownRender :content="memoryContent || ''" :render-code-blocks-as-pre="false" :is-dark="isDark" code-block-dark-theme="vitesse-dark" code-block-light-theme="vitesse-light" :themes="['vitesse-dark', 'vitesse-light']" />
              </div>
              <!-- 未保存标记 -->
              <div v-if="selectedMemoryFile && hasUnsavedChanges" class="flex items-center gap-1.5 pt-1.5 text-[11px] text-yellow-500">
                <span class="size-1.5 shrink-0 rounded-full bg-yellow-500" />
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
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

import { ref, computed, onMounted, watch } from 'vue'
import { toast } from 'vue-sonner'
import { ChevronDown, Cloud, Eye, FileText, FolderOpen, Pencil, Plug, RefreshCw, Save, Star, X, Zap } from '@lucide/vue'
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
      skillBody.value = extractSkillBody(res.data)
    }
  } catch (err) {
    console.error('[Skills] 加载内容失败:', err)
  } finally {
    loadingSkillContent.value = false
  }
  loadSkillFileTree(skillSlug)
}

/** 从 SKILL.md 内容中提取正文（去除 YAML frontmatter） */
function extractSkillBody(content) {
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

function openMcpDetail(mcp) {
  selectedMcp.value = mcp
}

function closeMcpDetail() {
  selectedMcp.value = null
}

// ========== MCP ==========
const mcpServers = ref([])
const mcpLoading = ref(false)

// ========== Memory ==========
const workspaces = ref([])
const selectedWorkspaceSlug = ref('default')
const memorySummary = ref(null)
const memoryTree = ref([])
const memoryLoading = ref(false)
const memoryLoadingContent = ref(false)
const selectedMemoryFile = ref(null)
const memoryContent = ref('')
const memoryEditMode = ref(false)
const hasUnsavedChanges = ref(false)
const generateRange = ref('1m')
const generatingMemory = ref(false)

const memoryTotalCount = computed(() => {
  const claudeExists = memorySummary.value?.claudeMd?.exists ? 1 : 0
  const autoCount = memorySummary.value?.autoMemory?.fileCount || 0
  return claudeExists + autoCount
})

const selectedMemoryFilePath = computed(() => {
  if (!selectedMemoryFile.value) return ''
  if (selectedMemoryFile.value === 'CLAUDE.md') {
    return memorySummary.value?.claudeMd?.path || '~/.diting/pi-agent/workspaces/default/CLAUDE.md'
  }
  const autoDir = memorySummary.value?.autoMemory?.directory
  if (autoDir) {
    return `${autoDir}/${selectedMemoryFile.value}`
  }
  return `~/.diting/pi-agent/workspaces/default/.claude/memory/${selectedMemoryFile.value}`
})

const activeMemoryCategory = computed(() => {
  if (!selectedMemoryFile.value) return ''
  if (selectedMemoryFile.value === 'CLAUDE.md') return 'project'
  return 'auto'
})

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

function selectCategory(category) {
  if (category === 'project') {
    selectMemoryFile('CLAUDE.md')
  } else if (category === 'auto') {
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
async function loadWorkspaces() {
  try {
    const res = await ipc.invoke(ipcApiRoute.piAgent.workspaceOperation, { action: 'list' })
    if (res.code === 0 && res.data) {
      workspaces.value = res.data
      if (workspaces.value.length > 0) {
        selectedWorkspaceSlug.value = workspaces.value[0].id
      }
    }
  } catch (err) {
    console.error('[Skills] 加载工作区列表失败:', err)
  }
}

function onWorkspaceChange() {
  memorySummary.value = null
  memoryTree.value = []
  selectedMemoryFile.value = null
  memoryContent.value = ''
  memoryEditMode.value = false
  hasUnsavedChanges.value = false
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
    toast.error('切换失败')
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
    toast.error('切换失败')
  }
}

// ========== 记忆操作 ==========
async function loadMemoryData() {
  memoryLoading.value = true
  try {
    const slug = selectedWorkspaceSlug.value
    const [summaryRes, treeRes] = await Promise.all([
      ipc.invoke(ipcApiRoute.piAgent.memoryOperation, { action: 'summary', workspaceSlug: slug }),
      ipc.invoke(ipcApiRoute.piAgent.memoryOperation, { action: 'tree', workspaceSlug: slug }),
    ])
    if (summaryRes.code === 0 && summaryRes.data) {
      memorySummary.value = summaryRes.data
    }
    if (treeRes.code === 0 && treeRes.data) {
      memoryTree.value = treeRes.data
    }
    if (!selectedMemoryFile.value && memorySummary.value?.claudeMd?.exists) {
      selectMemoryFile('CLAUDE.md')
    }
  } catch (err) {
    console.error('[Memory] 加载失败:', err)
  } finally {
    memoryLoading.value = false
  }
}

function selectMemoryFile(filePath) {
  if (hasUnsavedChanges.value && filePath !== selectedMemoryFile.value) {
    if (window.confirm('未保存的更改\n\n当前文件有未保存的更改，切换后将丢失。是否继续？')) {
      hasUnsavedChanges.value = false
      doSelectFile(filePath)
    }
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
      memoryContent.value = res.data.content || ''
      hasUnsavedChanges.value = false
    } else {
      memoryContent.value = ''
      toast.error(res.message || '读取文件失败')
    }
  } catch (err) {
    console.error('[Memory] 读取失败:', err)
    memoryContent.value = ''
  } finally {
    memoryLoadingContent.value = false
  }
}

function toggleEditMode() {
  memoryEditMode.value = !memoryEditMode.value
}

function onContentInput() {
  hasUnsavedChanges.value = true
}

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
      toast.success('已保存')
      hasUnsavedChanges.value = false
      loadMemorySummary()
    } else {
      toast.error(res.message || '保存失败')
    }
  } catch (err) {
    console.error('[Memory] 保存失败:', err)
    toast.error('保存失败')
  }
}

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

function openInFinder() {
  const autoDir = memorySummary.value?.autoMemory?.directory
  const wsPath = memorySummary.value?.claudeMd?.path?.replace(/CLAUDE\.md$/, '')
  const dir = autoDir || wsPath
  if (!dir) {
    toast.warning('无法确定记忆目录路径')
    return
  }
  ipc.invoke(ipcApiRoute.os.openDirectory, { id: dir })
}

// ========== 生成项目记忆 ==========
const RANGE_MAP = {
  '1w': '近 1 周',
  '1m': '近 1 个月',
  '3m': '近 3 个月',
  'all': '全部',
}

function buildMemoryPrompt() {
  const rangeLabel = RANGE_MAP[generateRange.value] || '近 1 个月'
  return `请为当前项目初始化并沉淀长期记忆。这里的"项目"指系统提示中的"项目根目录"及其关联的 Agent 工作会话；不要把 Diting 工作区笼统当作项目。

处理范围：

默认读取当前项目${rangeLabel}的 Agent 工作会话，优先近期、最有代表性且用户实际完成工作的会话。证据不足时要明确说明，不得编造。只有用户通过界面明确选择更大范围时，才可处理超过${rangeLabel}的会话。

本次只处理${rangeLabel}。若认为必须查看更早会话，不能自行扩大范围；请在最终回复中说明理由并建议用户在界面中扩大范围后再处理。

路径与职责边界：

系统提示中的"Diting 工作区目录"是 Diting 管理配置与隔离资料的位置，存放 MCP、Skills、Diting 管理的 CLAUDE.md 与 Auto Memory；它不是用户项目根目录。必须按系统提示给出的绝对路径操作，不得猜测或替换路径。

"项目根目录"是用户项目资料的边界，并不一定等于实际 cwd：新会话通常从项目根目录运行，历史会话可能仍从会话工作台运行。允许从项目级 Context 及明确关联的长期项目资料读取证据；不要自动读取、创建或修改项目根内的 .claude/、CLAUDE.md、MCP 或 Skills 配置，除非用户明确要求。

系统提示中的"会话工作台目录"及其 .context/ 是当前会话的 sidecar/workbench：仅承载本次任务的 todo、plan、临时笔记和中间结论，不应作为项目级长期记忆的写入位置。绝不读取、创建或修改其中的 settings.json。

系统提示中的"项目级 Context"与项目级长期资料用于跨会话保留调研、架构分析和项目知识。先区分它们与会话级临时产物，再决定可作为长期记忆证据的内容。

沉淀目标：

从允许读取的会话和 Context 中提炼稳定的项目知识：项目结构、常用命令、架构边界、可靠决策、踩坑经验、用户偏好，以及未来 Agent 必须注意的事项。不要把聊天流水账、单次调试过程或当前任务的临时产物当作长期知识。

只更新系统提示明确给出的"Diting 工作区 CLAUDE.md"绝对路径。这里是 Diting 管理的项目指令文件；内容仅限稳定、跨会话有效的项目规则、入口和工作方法，不得混入临时调试、聊天记录或长篇资料。

只更新系统提示明确给出的"Diting 工作区 Auto Memory 目录"中的 MEMORY.md、必要的主题文件和 user-profile.md，不要在其他目录创建记忆文件。MEMORY.md 保持简短的主题索引与路由，主题细节拆分到主题文件。

user-profile.md 是持续迭代的用户画像：基于现有内容增量合并，条目化且可追溯地记录有充分证据的角色与技术背景、稳定协作偏好、反复出现的关注点、工具链倾向和明确的"下次请这样做"要求。只出现一次或证据不足的信号标为"待确认"，不要当作稳定结论。

写入规则：

写入前先读取已有的 user-profile.md、MEMORY.md 与相关主题文件，并保留仍然有效的内容；不要整体重写或删除有效信息。发现过时内容时，保守修订或标注。

只有明确重复出现、用户明确指定，或删除后会导致未来 Agent 明显犯错的知识才能写入。弱信号、临时过程和证据不足的判断不写入长期记忆，留在最终回复的待确认项。

优先小幅、可审阅的增量更新：CLAUDE.md 保持精炼，MEMORY.md 不承载长正文，跨会话的长资料仍留在项目级长期资料或项目级 Context。

完成后必须报告：读取的会话与 Context 范围、更新的文件、关键沉淀主题、用户画像新增或修订，以及仍需用户确认的项目。`
}

async function generateMemory() {
  if (generatingMemory.value) return

  const workspace = workspaces.value.find((w) => w.id === selectedWorkspaceSlug.value)
  if (!workspace) {
    toast.warning('请先选择一个项目')
    return
  }

  generatingMemory.value = true
  try {
    const session = await agentStore.createSession(
      `生成项目记忆 - ${workspace.name}`,
      workspace.id,
    )
    if (!session) {
      toast.error('创建会话失败')
      return
    }

    const prompt = buildMemoryPrompt()

    agentStore.pendingPrompt = {
      sessionId: session.id,
      message: prompt,
      workspaceId: workspace.id,
    }

    wsStore.selectAgentProject(workspace.id)
    wsStore.setAppMode('agent')
    wsStore.setActiveModule('agent')

    await agentStore.selectSession(session.id)

    router.push('/agent').catch((err) => console.error('[Skills] 跳转 Agent 失败:', err))

    toast.success('已启动 Agent 会话，正在生成项目记忆...')
  } catch (err) {
    console.error('[Memory] 生成项目记忆失败:', err)
    toast.error('生成项目记忆失败: ' + (err?.message || String(err)))
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