<template>
  <div
    class="flex h-full shrink-0 select-none flex-col overflow-hidden border-r border-[var(--border-color)] bg-[var(--bg-sidebar)] transition-all duration-250"
    style="-webkit-app-region: no-drag"
    :style="{ width: ws.menuCollapsed ? '56px' : ws.menuWidth + 'px' }"
  >
    <!-- ===================== 展开模式 ===================== -->
    <template v-if="!ws.menuCollapsed">
      <!-- 顶部：Chat/Agent 切换 + 折叠按钮 -->
      <div class="flex shrink-0 items-center justify-between px-2.5 py-2">
        <div class="mr-1.5 flex flex-1 gap-0.5 rounded-lg bg-[var(--bg-active)] p-0.5">
          <button
            type="button"
            class="flex h-7 flex-1 items-center justify-center gap-1 rounded-md text-[13px] transition-all duration-200"
            :class="ws.activeModule === 'chat'
              ? 'bg-[var(--accent)] font-semibold text-white shadow-[0_1px_4px_rgba(22,119,255,0.25)]'
              : 'bg-transparent text-[var(--text-secondary)] hover:bg-white/40 hover:text-[var(--text-primary)]'"
            @click="navigate('chat')"
          >
            <MessageSquare class="size-4" />
            <span>Chat</span>
          </button>
          <button
            type="button"
            class="flex h-7 flex-1 items-center justify-center gap-1 rounded-md text-[13px] transition-all duration-200"
            :class="ws.activeModule === 'agent'
              ? 'bg-[var(--accent)] font-semibold text-white shadow-[0_1px_4px_rgba(22,119,255,0.25)]'
              : 'bg-transparent text-[var(--text-secondary)] hover:bg-white/40 hover:text-[var(--text-primary)]'"
            @click="navigate('agent')"
          >
            <Bot class="size-4" />
            <span>Agent</span>
          </button>
        </div>
        <button type="button" class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] transition-all hover:bg-[var(--bg-hover)] hover:text-[var(--accent)]" @click="ws.toggleMenu">
          <PanelLeftClose class="size-4" />
        </button>
      </div>

      <!-- 导航区 -->
      <nav class="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-1.5 [&::-webkit-scrollbar]:hidden">
        <!-- ===== 工具分组 ===== -->
        <div class="mb-1">
          <div class="flex items-center gap-1.5 px-2 pb-1 pt-2.5">
            <span class="flex-1 text-xs font-medium text-[var(--text-muted)]">工具</span>
          </div>
          <div
            class="relative mb-0.5 flex h-[34px] cursor-pointer items-center gap-2 rounded-[7px] px-2.5 text-sm transition-colors duration-150"
            :class="ws.activeModule === 'file'
              ? 'bg-[var(--bg-active)] font-semibold text-[var(--accent)]'
              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'"
            @click="navigate('file')"
          >
            <Folder class="size-3.5 shrink-0" :class="ws.activeModule === 'file' ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'" />
            <span class="flex-1 min-w-0 truncate">文件</span>
            <span class="flex h-4 shrink-0 items-center rounded-full bg-[var(--bg-active)] px-1.5 text-[11px] leading-none text-[var(--text-muted)]">{{ ws.folderList.length }}</span>
          </div>
          <div
            class="relative mb-0.5 flex h-[34px] cursor-pointer items-center gap-2 rounded-[7px] px-2.5 text-sm transition-colors duration-150"
            :class="ws.activeModule === 'invoice'
              ? 'bg-[var(--bg-active)] font-semibold text-[var(--accent)]'
              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'"
            @click="navigate('invoice')"
          >
            <FileSearch class="size-3.5 shrink-0" :class="ws.activeModule === 'invoice' ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'" />
            <span class="flex-1 min-w-0 truncate">OCR识别</span>
          </div>
          <div
            class="relative mb-0.5 flex h-[34px] cursor-pointer items-center gap-2 rounded-[7px] px-2.5 text-sm transition-colors duration-150"
            :class="ws.activeModule === 'planning'
              ? 'bg-[var(--bg-active)] font-semibold text-[var(--accent)]'
              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'"
            @click="navigate('planning')"
          >
            <CalendarRange class="size-3.5 shrink-0" :class="ws.activeModule === 'planning' ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'" />
            <span class="flex-1 min-w-0 truncate">任务/日程/Todo</span>
            <span v-if="planningCount" class="flex h-4 shrink-0 items-center rounded-full bg-[var(--bg-active)] px-1.5 text-[11px] leading-none text-[var(--text-muted)]">{{ planningCount }}</span>
          </div>
          <div
            class="relative mb-0.5 flex h-[34px] cursor-pointer items-center gap-2 rounded-[7px] px-2.5 text-sm transition-colors duration-150"
            :class="ws.activeModule === 'skills'
              ? 'bg-[var(--bg-active)] font-semibold text-[var(--accent)]'
              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'"
            @click="navigate('skills')"
          >
            <Zap class="size-3.5 shrink-0" :class="ws.activeModule === 'skills' ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'" />
            <span class="flex-1 min-w-0 truncate">Agent 技能</span>
            <span class="flex h-4 shrink-0 items-center rounded-full bg-[var(--bg-active)] px-1.5 text-[11px] leading-none text-[var(--text-muted)]">{{ skillsCount }}</span>
          </div>
        </div>

        <!-- ===== OCR 子菜单 ===== -->
        <div v-if="ws.activeModule === 'invoice'" class="mb-1">
          <div class="flex items-center gap-1.5 px-2 pb-1 pt-2.5">
            <span class="flex-1 text-xs font-medium text-[var(--text-muted)]">OCR</span>
          </div>
          <div
            class="mb-0.5 flex h-[30px] cursor-pointer items-center gap-2 rounded-[7px] px-2.5 pl-7 text-[13px] transition-colors duration-150"
            :class="isOcrSubActive('recognize')
              ? 'bg-[var(--bg-active)] font-semibold text-[var(--accent)]'
              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'"
            @click="navigateOcrSub('recognize')"
          >
            <FileText class="size-3.5 shrink-0 text-[var(--text-muted)]" />
            <span class="flex-1 min-w-0 truncate">录入识读</span>
          </div>
          <div
            class="mb-0.5 flex h-[30px] cursor-pointer items-center gap-2 rounded-[7px] px-2.5 pl-7 text-[13px] transition-colors duration-150"
            :class="isOcrSubActive('archive')
              ? 'bg-[var(--bg-active)] font-semibold text-[var(--accent)]'
              : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'"
            @click="navigateOcrSub('archive')"
          >
            <Inbox class="size-3.5 shrink-0 text-[var(--text-muted)]" />
            <span class="flex-1 min-w-0 truncate">归集查阅</span>
          </div>
        </div>

        <!-- ===== 文件分组 ===== -->
        <div v-if="ws.activeModule === 'file'" class="flex min-h-0 flex-1 flex-col">
          <div class="flex items-center gap-1.5 px-2 pb-1 pt-2.5">
            <span class="flex-1 text-xs font-medium text-[var(--text-muted)]">文件</span>
            <span class="text-[11px] text-[var(--text-muted)]">{{ ws.folderList.length }}</span>
            <button class="flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] transition-all hover:bg-[var(--bg-hover)] hover:text-[var(--accent)]" @click="onAddFolder">
              <Plus class="size-3.5" />
            </button>
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto px-0.5 pb-1 [&::-webkit-scrollbar]:hidden">
            <Spinner v-if="ws.folderLoading" size="sm" class="mx-auto my-2" />
            <div
              v-for="folder in ws.folderList"
              :key="folder.id"
              class="relative mb-0.5 flex h-[34px] cursor-pointer items-center gap-2 rounded-[7px] px-2.5 text-sm transition-colors duration-150"
              :class="ws.selectedFolderId === folder.id
                ? 'bg-[var(--bg-active)] font-semibold text-[var(--accent)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'"
              @click="onSelectFolder(folder.id)"
            >
              <Folder class="size-3.5 shrink-0" :class="ws.selectedFolderId === folder.id ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'" />
              <span class="flex-1 min-w-0 truncate" :title="getFolderName(folder.path)">{{ getFolderName(folder.path) }}</span>
              <span v-if="folder.file_count != null" class="flex h-4 shrink-0 items-center rounded-full bg-[var(--bg-active)] px-1.5 text-[11px] leading-none text-[var(--text-muted)]">{{ folder.file_count }}</span>
              <button class="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--text-muted)] transition-all hover:bg-red-500/10 hover:text-red-500" @click.stop="onDeleteFolder(folder)">
                <Trash2 class="size-3.5" />
              </button>
            </div>
            <div v-if="!ws.folderLoading && ws.folderList.length === 0" class="px-2 py-3 text-center text-xs text-[var(--text-muted)]">暂无文件夹</div>
          </div>
        </div>

        <!-- ===== 对话分组 ===== -->
        <div v-if="ws.activeModule === 'chat'" class="flex min-h-0 flex-1 flex-col">
          <div class="flex items-center gap-1.5 px-2 pb-1 pt-2.5">
            <span class="flex-1 text-xs font-medium text-[var(--text-muted)]">对话</span>
            <button class="flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] transition-all hover:bg-[var(--bg-hover)] hover:text-[var(--accent)]" @click="onCreateChat">
              <Plus class="size-3.5" />
            </button>
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto px-0.5 pb-1 [&::-webkit-scrollbar]:hidden">
            <Spinner v-if="ws.chatSessionLoading" size="sm" class="mx-auto my-2" />
            <div
              v-for="session in ws.chatSessions"
              :key="session.id"
              class="relative mb-0.5 flex h-[34px] cursor-pointer items-center gap-2 rounded-[7px] px-2.5 text-sm transition-colors duration-150"
              :class="ws.currentChatSessionId === session.id
                ? 'bg-[var(--bg-active)] font-semibold text-[var(--accent)]'
                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'"
              @click="onSelectChatSession(session.id)"
            >
              <MessageSquare class="size-3.5 shrink-0" :class="ws.currentChatSessionId === session.id ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'" />
              <span class="flex-1 min-w-0 truncate">{{ session.title || '新会话' }}</span>
              <button class="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--text-muted)] transition-all hover:bg-red-500/10 hover:text-red-500" @click.stop="onDeleteChatSession(session)">
                <Trash2 class="size-3.5" />
              </button>
            </div>
            <div v-if="!ws.chatSessionLoading && ws.chatSessions.length === 0" class="px-2 py-3 text-center text-xs text-[var(--text-muted)]">暂无对话</div>
          </div>
        </div>

        <!-- ===== 项目分组 ===== -->
        <div v-if="ws.activeModule === 'agent'" class="flex min-h-0 flex-1 flex-col">
          <div class="flex items-center gap-1.5 px-2 pb-1 pt-2.5">
            <span class="flex-1 text-xs font-medium text-[var(--text-muted)]">项目</span>
            <button class="flex h-5 w-5 items-center justify-center rounded text-[var(--text-muted)] transition-all hover:bg-[var(--bg-hover)] hover:text-[var(--accent)]" @click="onCreateProject">
              <Plus class="size-3.5" />
            </button>
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto px-0.5 pb-1 [&::-webkit-scrollbar]:hidden">
            <Spinner v-if="ws.agentProjectLoading" size="sm" class="mx-auto my-2" />
            <template v-for="project in ws.agentProjects" :key="project.id">
              <div
                class="relative mb-0.5 flex h-[34px] cursor-pointer items-center gap-2 rounded-[7px] px-2.5 text-sm transition-colors duration-150"
                :class="expandedProjects.has(project.id)
                  ? 'font-semibold text-[var(--text-primary)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'"
                @click="toggleProjectExpand(project)"
              >
                <ChevronDown v-if="expandedProjects.has(project.id)" class="size-3.5 shrink-0 text-muted-foreground" />
                <ChevronRight v-else class="size-3.5 shrink-0 text-muted-foreground" />
                <input
                  v-if="editingType === 'project' && editingId === project.id"
                  ref="editInputRef"
                  v-model="editingText"
                  class="flex-1 min-w-0 rounded border border-[var(--accent)] bg-white px-1.5 py-0.5 text-[13px] text-[var(--text-primary)] outline-none ring-2 ring-blue-500/15"
                  @click.stop
                  @keydown.enter="saveProjectName(project)"
                  @keydown.escape="cancelEdit"
                  @blur="saveProjectName(project)"
                />
                <span v-else class="flex-1 min-w-0 truncate" @dblclick.stop="startEditProject(project)">{{ project.name }}</span>
                <button class="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--text-muted)] transition-all hover:bg-red-500/10 hover:text-red-500" @click.stop="onDeleteProject(project)">
                  <Trash2 class="size-3.5" />
                </button>
                <button class="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--text-muted)] transition-all hover:bg-[var(--bg-hover)] hover:text-[var(--accent)]" @click.stop="onCreateAgentSession(project)">
                  <Plus class="size-3.5" />
                </button>
              </div>
              <template v-if="expandedProjects.has(project.id)">
                <div
                  v-for="sess in getVisibleSessions(project.id)"
                  :key="sess.id"
                  class="relative mb-0.5 flex h-[30px] cursor-pointer items-center gap-2 rounded-[7px] px-2.5 pl-7 text-[13px] transition-colors duration-150"
                  :class="agent.currentSessionId === sess.id
                    ? 'bg-[var(--bg-active)] font-semibold text-[var(--accent)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'"
                  @click="onSelectAgentSession(sess, project)"
                >
                  <MessageSquare class="size-3.5 shrink-0 text-[var(--text-muted)]" />
                  <input
                    v-if="editingType === 'session' && editingId === sess.id"
                    ref="editInputRef"
                    v-model="editingText"
                    class="flex-1 min-w-0 rounded border border-[var(--accent)] bg-white px-1.5 py-0.5 text-[13px] text-[var(--text-primary)] outline-none ring-2 ring-blue-500/15"
                    @click.stop
                    @keydown.enter="saveSessionName(sess)"
                    @keydown.escape="cancelEdit"
                    @blur="saveSessionName(sess)"
                  />
                  <span v-else class="flex-1 min-w-0 truncate" @dblclick.stop="startEditSession(sess)">{{ sess.title || '未命名' }}</span>
                  <button class="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--text-muted)] transition-all hover:bg-red-500/10 hover:text-red-500" @click.stop="onDeleteAgentSession(sess, project)">
                    <Trash2 class="size-3.5" />
                  </button>
                </div>
                <div v-if="getProjectSessions(project.id).length === 0" class="py-1.5 pl-7 text-left text-xs text-[var(--text-muted)]">暂无会话</div>
                <div
                  v-if="getProjectSessions(project.id).length > 3"
                  class="cursor-pointer select-none py-1 pl-7 text-xs text-[var(--text-muted)] transition-colors hover:text-[var(--accent)]"
                  @click.stop="toggleSessionListExpand(project.id)"
                >
                  {{ expandedSessionLists.has(project.id) ? '收起' : `显示更多 (${getProjectSessions(project.id).length - 3})` }}
                </div>
              </template>
            </template>
            <div v-if="!ws.agentProjectLoading && ws.agentProjects.length === 0" class="px-2 py-3 text-center text-xs text-[var(--text-muted)]">暂无项目</div>
          </div>
        </div>
      </nav>
    </template>

    <!-- ===================== 收起模式 ===================== -->
    <template v-else>
      <button type="button" class="mx-auto my-2 flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] transition-all hover:bg-[var(--bg-hover)] hover:text-[var(--accent)]" @click="ws.toggleMenu">
        <PanelLeftOpen class="size-4" />
      </button>

      <div class="mx-2 my-1 h-px shrink-0 bg-[var(--border-color)]" />

      <button
        type="button"
        class="mx-auto my-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-transparent bg-[var(--bg-active)] text-[var(--text-secondary)] transition-all hover:border-[var(--border-color)] hover:text-[var(--accent)]"
        :class="ws.activeModule === 'chat' ? 'border-[var(--accent)] bg-[var(--accent)] text-white shadow-[0_1px_4px_rgba(22,119,255,0.3)] hover:border-[var(--accent)] hover:text-white' : ''"
        @click="navigate('chat')"
      >
        <MessageSquare class="size-4" />
      </button>
      <button
        type="button"
        class="mx-auto my-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-transparent bg-[var(--bg-active)] text-[var(--text-secondary)] transition-all hover:border-[var(--border-color)] hover:text-[var(--accent)]"
        :class="ws.activeModule === 'agent' ? 'border-[var(--accent)] bg-[var(--accent)] text-white shadow-[0_1px_4px_rgba(22,119,255,0.3)] hover:border-[var(--accent)] hover:text-white' : ''"
        @click="navigate('agent')"
      >
        <Bot class="size-4" />
      </button>

      <div class="mx-2 my-1 h-px shrink-0 bg-[var(--border-color)]" />

      <button
        type="button"
        class="mx-auto my-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-transparent bg-[var(--bg-active)] text-[var(--text-secondary)] transition-all hover:border-[var(--border-color)] hover:text-[var(--accent)]"
        :class="ws.activeModule === 'file' ? 'border-[var(--accent)] bg-[var(--accent)] text-white shadow-[0_1px_4px_rgba(22,119,255,0.3)] hover:border-[var(--accent)] hover:text-white' : ''"
        @click="navigate('file')"
      >
        <Folder class="size-4" />
      </button>
      <button
        type="button"
        class="mx-auto my-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-transparent bg-[var(--bg-active)] text-[var(--text-secondary)] transition-all hover:border-[var(--border-color)] hover:text-[var(--accent)]"
        :class="ws.activeModule === 'invoice' ? 'border-[var(--accent)] bg-[var(--accent)] text-white shadow-[0_1px_4px_rgba(22,119,255,0.3)] hover:border-[var(--accent)] hover:text-white' : ''"
        @click="navigate('invoice')"
      >
        <FileSearch class="size-4" />
      </button>
      <button
        type="button"
        class="mx-auto my-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-transparent bg-[var(--bg-active)] text-[var(--text-secondary)] transition-all hover:border-[var(--border-color)] hover:text-[var(--accent)]"
        :class="ws.activeModule === 'planning' ? 'border-[var(--accent)] bg-[var(--accent)] text-white shadow-[0_1px_4px_rgba(22,119,255,0.3)] hover:border-[var(--accent)] hover:text-white' : ''"
        @click="navigate('planning')"
      >
        <CalendarRange class="size-4" />
      </button>
      <button
        type="button"
        class="mx-auto my-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-transparent bg-[var(--bg-active)] text-[var(--text-secondary)] transition-all hover:border-[var(--border-color)] hover:text-[var(--accent)]"
        :class="ws.activeModule === 'skills' ? 'border-[var(--accent)] bg-[var(--accent)] text-white shadow-[0_1px_4px_rgba(22,119,255,0.3)] hover:border-[var(--accent)] hover:text-white' : ''"
        @click="navigate('skills')"
      >
        <Zap class="size-4" />
      </button>

      <div class="mx-2 my-1 h-px shrink-0 bg-[var(--border-color)]" />

      <!-- 最近列表 -->
      <div class="flex flex-col items-center py-1">
        <div
          v-for="item in recentItems"
          :key="item.id"
          class="mx-auto my-0.5 flex h-9 w-9 shrink-0 select-none items-center justify-center rounded-lg border border-transparent bg-[var(--bg-active)] text-sm font-semibold text-[var(--text-secondary)] transition-all hover:border-[var(--border-color)] hover:text-[var(--accent)]"
          :class="item.active ? 'border-[var(--accent)] bg-[var(--accent)] text-white hover:border-[var(--accent)] hover:text-white' : ''"
          @click="item.onClick"
        >
          {{ item.char }}
        </div>
      </div>

      <div class="flex-1" />
    </template>

    <!-- ===================== 底部：设置 ===================== -->
    <div class="shrink-0 border-t border-[var(--border-color)] px-1.5 pb-2 pt-1">
      <div
        v-if="!ws.menuCollapsed"
        class="relative mb-0.5 flex h-[34px] cursor-pointer items-center gap-2 rounded-[7px] px-2.5 text-sm transition-colors duration-150"
        :class="ws.activeModule === 'setting'
          ? 'bg-[var(--bg-active)] font-semibold text-[var(--accent)]'
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'"
        @click="navigate('setting')"
      >
        <Settings class="size-3.5 shrink-0" :class="ws.activeModule === 'setting' ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'" />
        <span class="flex-1 min-w-0 truncate">设置</span>
      </div>
      <button
        v-else
        type="button"
        class="mx-auto my-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-transparent bg-[var(--bg-active)] text-[var(--text-secondary)] transition-all hover:border-[var(--border-color)] hover:text-[var(--accent)]"
        :class="ws.activeModule === 'setting' ? 'border-[var(--accent)] bg-[var(--accent)] text-white shadow-[0_1px_4px_rgba(22,119,255,0.3)] hover:border-[var(--accent)] hover:text-white' : ''"
        @click="navigate('setting')"
      >
        <Settings class="size-4" />
      </button>
    </div>

    <!-- ===================== 删除确认弹窗 ===================== -->
    <AlertDialog v-model:open="deleteDialog.open">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ deleteDialog.title }}</AlertDialogTitle>
          <AlertDialogDescription>{{ deleteDialog.content }}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction
            class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            @click="confirmDelete"
          >
            确认删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { toast } from 'vue-sonner'
import {
  PanelLeftClose, PanelLeftOpen, MessageSquare, Bot, Folder, FileSearch,
  CalendarRange, Zap, FileText, Inbox, Plus, Trash2, ChevronDown, ChevronRight,
  Settings,
} from '@lucide/vue'
import { ipc } from '@/utils/ipcRenderer'
import { ipcApiRoute } from '@/api'
import { useWorkspaceStore } from '@/stores/workspace'
import { useAgentStore } from '@/stores/agent'
import { usePlanningStore } from '@/stores/planning'
import { useTabStore } from '@/stores/tab'
import { Spinner } from '@/components/ui/spinner'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog'

const router = useRouter()
const route = useRoute()
const ws = useWorkspaceStore()
const agent = useAgentStore()
const planning = usePlanningStore()
const tabStore = useTabStore()

const { activeModule, selectedFolderId, selectedFile, selectedFileId } = storeToRefs(ws)

const addFolderLoading = ref(false)

// ===== 删除确认弹窗状态 =====
const deleteDialog = ref({ open: false, title: '', content: '', action: null })

function openDeleteDialog(title, content, action) {
  deleteDialog.value = { open: true, title, content, action }
}

async function confirmDelete() {
  const action = deleteDialog.value.action
  deleteDialog.value.open = false
  if (action) await action()
}

// ===== 任务/日程 计数 =====
const planningCount = computed(() => planning.automations.length)

// ===== Skills / MCP 计数 =====
const skillsCount = ref(0)

async function loadSkillsCount() {
  try {
    const [skillsRes, mcpRes] = await Promise.all([
      ipc.invoke(ipcApiRoute.piAgent.skillsOperation, { action: 'list', workspaceSlug: 'default' }),
      ipc.invoke(ipcApiRoute.piAgent.mcpOperation, { action: 'list' }),
    ])
    skillsCount.value = (skillsRes?.data || []).length + (mcpRes?.data || []).length
  } catch {
    skillsCount.value = 0
  }
}

// ===== 文件总数 =====
async function loadTotalFileCount() {
  try {
    const stats = await ipc.invoke(ipcApiRoute.file.getRagStats)
    if (stats) totalFileCount.value = stats.vectorizedFiles || 0
  } catch {
    totalFileCount.value = 0
  }
}
const totalFileCount = ref(0)

// ===== Agent 会话列表 =====
const agentSessions = computed(() => agent.sessions || [])

function getProjectSessions(projectId) {
  return agentSessions.value.filter((s) => {
    const wid = s.workspaceId || s.workspace_id || s.projectId || ''
    return String(wid) === String(projectId)
  })
}

// ===== 最近列表（收起模式） =====
const recentItems = computed(() => {
  if (activeModule.value === 'file') {
    return ws.folderList.slice(0, 5).map((f) => ({
      id: f.id,
      char: getFolderName(f.path).charAt(0),
      active: selectedFolderId.value === f.id,
      onClick: () => onSelectFolder(f.id),
    }))
  }
  if (activeModule.value === 'chat') {
    return ws.chatSessions.slice(0, 5).map((s) => ({
      id: s.id,
      char: (s.title || '?').charAt(0),
      active: ws.currentChatSessionId === s.id,
      onClick: () => onSelectChatSession(s.id),
    }))
  }
  if (activeModule.value === 'agent') {
    return agentSessions.value.slice(0, 5).map((s) => ({
      id: s.id,
      char: (s.title || '?').charAt(0),
      active: agent.currentSessionId === s.id,
      onClick: () => { agent.selectSession(s.id); ws.setActiveModule('agent') },
    }))
  }
  return []
})

// ===== 路由同步 =====
watch(() => route.path, (path) => {
  if (tabStore.tabMode) return
  if (path.startsWith('/file')) ws.setActiveModule('file')
  else if (path.startsWith('/invoice')) ws.setActiveModule('invoice')
  else if (path.startsWith('/ocr/archive')) ws.setActiveModule('invoice')
  else if (path.startsWith('/planning')) ws.setActiveModule('planning')
  else if (path.startsWith('/skills')) ws.setActiveModule('skills')
  else if (path.startsWith('/chat')) ws.setActiveModule('chat')
  else if (path.startsWith('/agent')) ws.setActiveModule('agent')
  else if (path.startsWith('/setting')) ws.setActiveModule('setting')
}, { immediate: true })

function navigate(key) {
  if (['file', 'invoice', 'planning', 'skills', 'setting'].includes(key)) {
    tabStore.exitTabMode()
    ws.setActiveModule(key)
    const map = { file: '/file', invoice: '/invoice', planning: '/planning', skills: '/skills', setting: '/setting' }
    if (map[key]) router.push(map[key]).catch(err => console.error('[MenuBar] router.push 失败:', err))
    return
  }
  ws.setActiveModule(key)
  if (key === 'chat') {
    const sessionId = ws.currentChatSessionId
    if (sessionId) {
      const session = ws.chatSessions.find(s => s.id === sessionId)
      tabStore.openSessionTab('chat', sessionId, session?.title || 'Chat')
    } else { tabStore.enterTabMode() }
  } else if (key === 'agent') {
    const sessionId = agent.currentSessionId
    if (sessionId) {
      const session = agent.sessions.find(s => s.id === sessionId)
      if (session) tabStore.openSessionTab('agent', sessionId, session.title || 'Agent 会话')
    } else { tabStore.enterTabMode() }
  }
}

function navigateOcrSub(subKey) {
  tabStore.exitTabMode()
  ws.setActiveModule('invoice')
  if (subKey === 'recognize') router.push('/invoice').catch(() => {})
  else if (subKey === 'archive') router.push('/ocr/archive').catch(() => {})
}

function isOcrSubActive(subKey) {
  if (subKey === 'recognize') return route.path.startsWith('/invoice')
  if (subKey === 'archive') return route.path.startsWith('/ocr/archive')
  return false
}

function onSelectFolder(folderId) {
  selectedFolderId.value = folderId
  selectedFile.value = null
  selectedFileId.value = null
}

function onSelectChatSession(sessionId) {
  ws.selectChatSession(sessionId)
  const session = ws.chatSessions.find(s => s.id === sessionId)
  tabStore.openSessionTab('chat', sessionId, session?.title || 'Chat')
  ws.setActiveModule('chat')
}

async function onAddFolder() {
  addFolderLoading.value = true
  try {
    const result = await ws.addFolder()
    if (result?.success) { toast.success('文件夹添加成功'); await loadTotalFileCount() }
    else if (result?.message) toast.warning(result.message)
  } catch { toast.error('添加文件夹失败') }
  finally { addFolderLoading.value = false }
}

function onDeleteFolder(folder) {
  openDeleteDialog('删除文件夹', `确定要删除文件夹「${getFolderName(folder.path)}」吗？该文件夹下的所有文件和 RAG 向量数据将被一并删除。`, async () => {
    try {
      const result = await ws.deleteFolder(folder.id)
      if (result?.success) { toast.success('文件夹已删除'); await loadTotalFileCount() }
      else toast.error('删除文件夹失败')
    } catch { toast.error('删除文件夹失败') }
  })
}

async function onCreateChat() {
  await ws.createChatSession()
  if (ws.currentChatSessionId) {
    const session = ws.chatSessions.find(s => s.id === ws.currentChatSessionId)
    tabStore.openSessionTab('chat', ws.currentChatSessionId, session?.title || '新会话')
  }
  ws.setActiveModule('chat')
}

function onDeleteChatSession(session) {
  openDeleteDialog('删除对话', `确定要删除对话「${session.title || '新会话'}」吗？`, async () => {
    try {
      const res = await ipc.invoke('controller/assistant/sessionOperation', { action: 'delete', sessionId: session.id })
      if (res.code === 0) {
        ws.chatSessions = ws.chatSessions.filter((s) => s.id !== session.id)
        tabStore.closeTab(session.id)
        if (ws.currentChatSessionId === session.id) {
          if (ws.chatSessions.length > 0) {
            ws.selectChatSession(ws.chatSessions[0].id)
            tabStore.openSessionTab('chat', ws.chatSessions[0].id, ws.chatSessions[0].title || 'Chat')
          } else { ws.currentChatSessionId = null }
        }
        toast.success('对话已删除')
      } else toast.error(res?.message || '删除对话失败')
    } catch { toast.error('删除对话失败') }
  })
}

async function onCreateProject() {
  await ws.createAgentProject()
  ws.setActiveModule('agent')
}

// ===== 双击编辑名称 =====
const editingType = ref(null)
const editingId = ref(null)
const editingText = ref('')
const editInputRef = ref(null)

function startEditProject(project) {
  editingType.value = 'project'
  editingId.value = project.id
  editingText.value = project.name
  nextTick(() => { editInputRef.value?.focus(); editInputRef.value?.select() })
}

function startEditSession(sess) {
  editingType.value = 'session'
  editingId.value = sess.id
  editingText.value = sess.title || ''
  nextTick(() => { editInputRef.value?.focus(); editInputRef.value?.select() })
}

function cancelEdit() {
  editingType.value = null
  editingId.value = null
  editingText.value = ''
}

async function saveProjectName(project) {
  const newName = editingText.value.trim()
  cancelEdit()
  if (!newName || newName === project.name) return
  try {
    const res = await ipc.invoke(ipcApiRoute.piAgent.workspaceOperation, { action: 'update', id: project.id, name: newName })
    if (res.code === 0 && res.data) {
      const idx = ws.agentProjects.findIndex((p) => p.id === project.id)
      if (idx !== -1) ws.agentProjects[idx] = { ...ws.agentProjects[idx], name: newName }
      toast.success('项目名称已更新')
    } else toast.error(res?.message || '更新项目名称失败')
  } catch { toast.error('更新项目名称失败') }
}

async function saveSessionName(sess) {
  const newTitle = editingText.value.trim()
  cancelEdit()
  if (!newTitle || newTitle === sess.title) return
  try {
    const res = await ipc.invoke(ipcApiRoute.piAgent.sessionOperation, { action: 'update', sessionId: sess.id, title: newTitle, workspaceId: sess.workspaceId || '', channelId: sess.channelId || '' })
    if (res.code === 0 && res.data) {
      const idx = agent.sessions.findIndex((s) => s.id === sess.id)
      if (idx !== -1) agent.sessions[idx] = { ...agent.sessions[idx], title: newTitle }
      toast.success('会话名称已更新')
    } else toast.error(res?.message || '更新会话名称失败')
  } catch { toast.error('更新会话名称失败') }
}

// ===== 项目展开/收缩状态 =====
const expandedProjects = ref(new Set())
const expandedSessionLists = ref(new Set())
const SESSION_PREVIEW_LIMIT = 3

watch(() => ws.agentProjects, (projects) => {
  if (projects && projects.length > 0) {
    const allIds = new Set(projects.map((p) => p.id))
    expandedProjects.value = new Set([...expandedProjects.value, ...allIds])
  }
}, { immediate: true, deep: true })

function toggleProjectExpand(project) {
  ws.selectAgentProject(project.id)
  ws.setActiveModule('agent')
  if (expandedProjects.value.has(project.id)) expandedProjects.value.delete(project.id)
  else expandedProjects.value.add(project.id)
  expandedProjects.value = new Set(expandedProjects.value)
}

function ensureProjectExpanded(projectId) {
  if (!expandedProjects.value.has(projectId)) {
    expandedProjects.value.add(projectId)
    expandedProjects.value = new Set(expandedProjects.value)
  }
}

function getVisibleSessions(projectId) {
  const all = getProjectSessions(projectId)
  if (expandedSessionLists.value.has(projectId)) return all
  return all.slice(0, SESSION_PREVIEW_LIMIT)
}

function toggleSessionListExpand(projectId) {
  if (expandedSessionLists.value.has(projectId)) expandedSessionLists.value.delete(projectId)
  else expandedSessionLists.value.add(projectId)
  expandedSessionLists.value = new Set(expandedSessionLists.value)
}

async function onCreateAgentSession(project) {
  ws.selectAgentProject(project.id)
  ensureProjectExpanded(project.id)
  await agent.createSession(undefined, project.id)
  ws.setActiveModule('agent')
}

function onSelectAgentSession(sess, project) {
  ws.selectAgentProject(project.id)
  ensureProjectExpanded(project.id)
  agent.selectSession(sess.id)
  ws.setActiveModule('agent')
}

function onDeleteProject(project) {
  openDeleteDialog('删除项目', `确定要删除项目「${project.name}」吗？该项目下的所有会话将被一并删除。`, async () => {
    try {
      const res = await ws.deleteAgentProject(project.id)
      if (res && res.code === 0) {
        agent.sessions = agent.sessions.filter((s) => {
          const wid = s.workspaceId || s.workspace_id || s.projectId || ''
          return String(wid) !== String(project.id)
        })
        toast.success('项目已删除')
        await selectNewestSession()
      } else toast.error(res?.message || '删除项目失败')
    } catch { toast.error('删除项目失败') }
  })
}

function onDeleteAgentSession(sess, project) {
  openDeleteDialog('删除会话', `确定要删除会话「${sess.title || '未命名'}」吗？`, async () => {
    try {
      const res = await ipc.invoke(ipcApiRoute.piAgent.sessionOperation, { action: 'delete', sessionId: sess.id })
      if (res.code === 0) {
        agent.sessions = agent.sessions.filter((s) => s.id !== sess.id)
        delete agent.messagesBySession[sess.id]
        tabStore.closeTab(sess.id)
        if (agent.currentSessionId === sess.id) await selectNewestSession()
        toast.success('会话已删除')
      } else toast.error(res?.message || '删除会话失败')
    } catch { toast.error('删除会话失败') }
  })
}

async function selectNewestSession() {
  if (ws.agentProjects.length === 0) return
  const newestProject = ws.agentProjects[0]
  ws.selectAgentProject(newestProject.id)
  ensureProjectExpanded(newestProject.id)
  const projectSessions = getProjectSessions(newestProject.id)
  if (projectSessions.length > 0) agent.selectSession(projectSessions[0].id)
  ws.setActiveModule('agent')
}

function getFolderName(path) {
  if (!path) return '未命名'
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '')
  const parts = normalized.split('/')
  return parts[parts.length - 1] || path
}

onMounted(() => {
  ws.loadFolderList()
  ws.loadChatSessions()
  ws.loadAgentProjects()
  agent.loadSessions()
  loadSkillsCount()
  loadTotalFileCount()
  planning.loadAll().catch(() => {})
})
</script>
