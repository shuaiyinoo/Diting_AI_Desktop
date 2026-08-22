<template>
  <div
    class="pattern-surface flex h-full shrink-0 select-none flex-col overflow-hidden border-r border-border bg-sidebar transition-all duration-250"
    style="-webkit-app-region: no-drag"
    :style="{ width: ws.menuCollapsed ? '56px' : ws.menuWidth + 'px' }"
  >
    <!-- ===================== 展开模式 ===================== -->
    <template v-if="!ws.menuCollapsed">
      <!-- 顶部：Chat/Agent 切换 + 折叠按钮 -->
      <div class="flex shrink-0 items-center justify-between px-2.5 py-2">
        <div class="mr-1.5 flex flex-1 gap-0.5 rounded-lg bg-muted p-0.5">
          <Button
            variant="ghost"
            size="sm"
            class="h-7 flex-1 gap-1 rounded-md text-[13px]"
            :class="ws.activeModule === 'chat'
              ? 'bg-primary font-semibold text-primary-foreground shadow-[0_1px_4px_rgba(22,119,255,0.25)] hover:bg-primary/90'
              : 'bg-transparent text-muted-foreground hover:bg-white/40 hover:text-foreground'"
            @click="navigate('chat')"
          >
            <MessageSquare class="size-4" />
            <span>Chat</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            class="h-7 flex-1 gap-1 rounded-md text-[13px]"
            :class="ws.activeModule === 'agent'
              ? 'bg-primary font-semibold text-primary-foreground shadow-[0_1px_4px_rgba(22,119,255,0.25)] hover:bg-primary/90'
              : 'bg-transparent text-muted-foreground hover:bg-white/40 hover:text-foreground'"
            @click="navigate('agent')"
          >
            <Bot class="size-4" />
            <span>Agent</span>
          </Button>
        </div>
        <Button variant="ghost" size="icon" class="h-7 w-7 shrink-0 text-muted-foreground hover:text-primary" @click="ws.toggleMenu">
          <PanelLeftClose class="size-4" />
        </Button>
      </div>

      <!-- 导航区 -->
      <nav class="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-1.5 [&::-webkit-scrollbar]:hidden">
        <!-- ===== 工具分组 ===== -->
        <div class="mb-0">
          <div class="flex h-[28px] shrink-0 items-center gap-1.5 px-2 mt-2">
            <span class="flex-1 text-xs font-medium text-muted-foreground">{{ t('menuBar.tools') }}</span>
          </div>
          <div
            class="relative mb-0.5 flex h-[34px] cursor-pointer items-center gap-2 rounded-[7px] px-2.5 text-sm transition-colors duration-150"
            :class="ws.activeModule === 'file'
              ? 'bg-muted font-semibold text-primary'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'"
            @click="navigate('file')"
          >
            <Folder class="size-3.5 shrink-0" :class="ws.activeModule === 'file' ? 'text-primary' : 'text-muted-foreground'" />
            <span class="flex-1 min-w-0 truncate">{{ t('menuBar.file') }}</span>
            <span class="flex h-4 shrink-0 items-center rounded-full bg-muted px-1.5 text-[11px] leading-none text-muted-foreground">{{ ws.folderList.length }}</span>
          </div>
          <div
            class="relative mb-0.5 flex h-[34px] cursor-pointer items-center gap-2 rounded-[7px] px-2.5 text-sm transition-colors duration-150"
            :class="ws.activeModule === 'invoice'
              ? 'bg-muted font-semibold text-primary'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'"
            @click="navigate('invoice')"
          >
            <FileSearch class="size-3.5 shrink-0" :class="ws.activeModule === 'invoice' ? 'text-primary' : 'text-muted-foreground'" />
            <span class="flex-1 min-w-0 truncate">{{ t('menuBar.ocr') }}</span>
          </div>
          <div
            class="relative mb-0.5 flex h-[34px] cursor-pointer items-center gap-2 rounded-[7px] px-2.5 text-sm transition-colors duration-150"
            :class="ws.activeModule === 'planning'
              ? 'bg-muted font-semibold text-primary'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'"
            @click="navigate('planning')"
          >
            <CalendarRange class="size-3.5 shrink-0" :class="ws.activeModule === 'planning' ? 'text-primary' : 'text-muted-foreground'" />
            <span class="flex-1 min-w-0 truncate">{{ t('menuBar.planning') }}</span>
            <span v-if="planningCount" class="flex h-4 shrink-0 items-center rounded-full bg-muted px-1.5 text-[11px] leading-none text-muted-foreground">{{ planningCount }}</span>
          </div>
          <div
            class="relative mb-0.5 flex h-[34px] cursor-pointer items-center gap-2 rounded-[7px] px-2.5 text-sm transition-colors duration-150"
            :class="ws.activeModule === 'skills'
              ? 'bg-muted font-semibold text-primary'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'"
            @click="navigate('skills')"
          >
            <Zap class="size-3.5 shrink-0" :class="ws.activeModule === 'skills' ? 'text-primary' : 'text-muted-foreground'" />
            <span class="flex-1 min-w-0 truncate">{{ t('menuBar.skills') }}</span>
            <span class="flex h-4 shrink-0 items-center rounded-full bg-muted px-1.5 text-[11px] leading-none text-muted-foreground">{{ skillsCount }}</span>
          </div>
        </div>

        <!-- ===== OCR 子菜单 ===== -->
        <div v-if="ws.activeModule === 'invoice'" class="mb-1">
          <div class="flex h-[28px] shrink-0 items-center gap-1.5 px-2 mt-2">
            <span class="flex-1 text-xs font-medium text-muted-foreground">{{ t('menuBar.ocrSection') }}</span>
          </div>
          <div
            class="relative mb-0.5 flex h-[34px] cursor-pointer items-center gap-2 rounded-[7px] px-2.5 text-sm transition-colors duration-150"
            :class="isOcrSubActive('recognize')
              ? 'bg-muted font-semibold text-primary'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'"
            @click="navigateOcrSub('recognize')"
          >
            <FileText class="size-3.5 shrink-0" :class="isOcrSubActive('recognize') ? 'text-primary' : 'text-muted-foreground'" />
            <span class="flex-1 min-w-0 truncate">{{ t('menuBar.ocrRecognize') }}</span>
          </div>
          <div
            class="relative mb-0.5 flex h-[34px] cursor-pointer items-center gap-2 rounded-[7px] px-2.5 text-sm transition-colors duration-150"
            :class="isOcrSubActive('archive')
              ? 'bg-muted font-semibold text-primary'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'"
            @click="navigateOcrSub('archive')"
          >
            <Inbox class="size-3.5 shrink-0" :class="isOcrSubActive('archive') ? 'text-primary' : 'text-muted-foreground'" />
            <span class="flex-1 min-w-0 truncate">{{ t('menuBar.ocrArchive') }}</span>
          </div>
        </div>

        <!-- ===== 文件分组 ===== -->
        <div v-if="ws.activeModule === 'file'" class="flex min-h-0 flex-1 flex-col">
          <div class="flex h-[28px] shrink-0 items-center gap-1.5 px-2 mt-2">
            <span class="flex-1 text-xs font-medium text-muted-foreground">{{ t('menuBar.fileSection') }}</span>
            <span class="text-[11px] text-muted-foreground">{{ ws.folderList.length }}</span>
            <Button variant="ghost" size="icon" class="h-5 w-5 text-muted-foreground hover:text-primary" @click="onAddFolder">
              <Plus class="size-3.5" />
            </Button>
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto px-0.5 pb-1 [&::-webkit-scrollbar]:hidden">
            <Spinner v-if="ws.folderLoading" size="sm" class="mx-auto my-2" />
            <div
              v-for="folder in ws.folderList"
              :key="folder.id"
              class="relative mb-0.5 flex h-[34px] cursor-pointer items-center gap-2 rounded-[7px] px-2.5 text-sm transition-colors duration-150"
              :class="ws.selectedFolderId === folder.id
                ? 'bg-muted font-semibold text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'"
              @click="onSelectFolder(folder.id)"
            >
              <Folder class="size-3.5 shrink-0" :class="ws.selectedFolderId === folder.id ? 'text-primary' : 'text-muted-foreground'" />
              <span class="flex-1 min-w-0 truncate" :title="getFolderName(folder.path)">{{ getFolderName(folder.path) }}</span>
              <span v-if="folder.file_count != null" class="flex h-4 shrink-0 items-center rounded-full bg-muted px-1.5 text-[11px] leading-none text-muted-foreground">{{ folder.file_count }}</span>
              <Button variant="ghost" size="icon" class="h-5 w-5 shrink-0 text-muted-foreground hover:bg-red-500/10 hover:text-red-500" @click.stop="onDeleteFolder(folder)">
                <Eraser class="size-3" />
              </Button>
            </div>
            <div v-if="!ws.folderLoading && ws.folderList.length === 0" class="px-2 py-3 text-center text-xs text-muted-foreground">{{ t('menuBar.noFolder') }}</div>
          </div>
        </div>

        <!-- ===== 对话分组 ===== -->
        <div v-if="ws.activeModule === 'chat'" class="flex min-h-0 flex-1 flex-col">
          <div class="flex h-[28px] shrink-0 items-center gap-1.5 px-2 mt-2">
            <span class="flex-1 text-xs font-medium text-muted-foreground">{{ t('menuBar.conversation') }}</span>
            <Button variant="ghost" size="icon" class="h-5 w-5 text-muted-foreground hover:text-primary" @click="onCreateChat">
              <Plus class="size-3.5" />
            </Button>
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto px-0.5 pb-1 [&::-webkit-scrollbar]:hidden">
            <Spinner v-if="ws.chatSessionLoading" size="sm" class="mx-auto my-2" />
            <div
              v-for="session in ws.chatSessions"
              :key="session.id"
              class="relative mb-0.5 flex h-[34px] cursor-pointer items-center gap-2 rounded-[7px] px-2.5 text-sm transition-colors duration-150"
              :class="ws.currentChatSessionId === session.id
                ? 'bg-muted font-semibold text-primary'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'"
              @click="onSelectChatSession(session.id)"
            >
              <MessageSquare class="size-3.5 shrink-0" :class="ws.currentChatSessionId === session.id ? 'text-primary' : 'text-muted-foreground'" />
              <span class="flex-1 min-w-0 truncate">{{ session.title || t('menuBar.newSession') }}</span>
              <Button variant="ghost" size="icon" class="h-5 w-5 shrink-0 text-muted-foreground hover:bg-red-500/10 hover:text-red-500" @click.stop="onDeleteChatSession(session)">
                <Eraser class="size-3" />
              </Button>
            </div>
            <div v-if="!ws.chatSessionLoading && ws.chatSessions.length === 0" class="px-2 py-3 text-center text-xs text-muted-foreground">{{ t('menuBar.noConversation') }}</div>
          </div>
        </div>

        <!-- ===== 项目分组 ===== -->
        <div v-if="ws.activeModule === 'agent'" class="flex min-h-0 flex-1 flex-col">
          <div class="flex h-[28px] shrink-0 items-center gap-1.5 px-2 mt-2">
            <span class="flex-1 text-xs font-medium text-muted-foreground">{{ t('menuBar.project') }}</span>
            <Button variant="ghost" size="icon" class="h-5 w-5 text-muted-foreground hover:text-primary" @click="onCreateProject">
              <Plus class="size-3.5" />
            </Button>
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto px-0.5 pb-1 [&::-webkit-scrollbar]:hidden">
            <Spinner v-if="ws.agentProjectLoading" size="sm" class="mx-auto my-2" />
            <template v-for="project in ws.agentProjects" :key="project.id">
              <div
                class="relative mb-0.5 flex h-[34px] cursor-pointer items-center gap-2 rounded-[7px] px-2.5 text-sm transition-colors duration-150"
                :class="expandedProjects.has(project.id)
                  ? 'font-semibold text-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'"
                @click="toggleProjectExpand(project)"
              >
                <ChevronDown v-if="expandedProjects.has(project.id)" class="size-3.5 shrink-0 text-muted-foreground" />
                <ChevronRight v-else class="size-3.5 shrink-0 text-muted-foreground" />
                <Input
                  v-if="editingType === 'project' && editingId === project.id"
                  ref="editInputRef"
                  v-model="editingText"
                  class="h-6 flex-1 min-w-0 rounded border-primary px-1.5 py-0.5 text-[13px] ring-2 ring-blue-500/15"
                  @click.stop
                  @keydown.enter="saveProjectName(project)"
                  @keydown.escape="cancelEdit"
                  @blur="saveProjectName(project)"
                />
                <span v-else class="flex-1 min-w-0 truncate" @dblclick.stop="startEditProject(project)">{{ project.name }}</span>
                <Button variant="ghost" size="icon" class="h-5 w-5 shrink-0 text-muted-foreground hover:bg-red-500/10 hover:text-red-500" @click.stop="onDeleteProject(project)">
                  <Eraser class="size-3" />
                </Button>
                <Button variant="ghost" size="icon" class="h-5 w-5 shrink-0 text-muted-foreground hover:text-primary" @click.stop="onCreateAgentSession(project)">
                  <Plus class="size-3.5" />
                </Button>
              </div>
              <template v-if="expandedProjects.has(project.id)">
                <div
                  v-for="sess in getVisibleSessions(project.id)"
                  :key="sess.id"
                  class="relative mb-0.5 flex h-[30px] cursor-pointer items-center gap-2 rounded-[7px] px-2.5 pl-7 text-[13px] transition-colors duration-150"
                  :class="agent.currentSessionId === sess.id
                    ? 'bg-muted font-semibold text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'"
                  @click="onSelectAgentSession(sess, project)"
                >
                  <MessageSquare class="size-3.5 shrink-0 text-muted-foreground" />
                  <Input
                    v-if="editingType === 'session' && editingId === sess.id"
                    ref="editInputRef"
                    v-model="editingText"
                    class="h-6 flex-1 min-w-0 rounded border-primary px-1.5 py-0.5 text-[13px] ring-2 ring-blue-500/15"
                    @click.stop
                    @keydown.enter="saveSessionName(sess)"
                    @keydown.escape="cancelEdit"
                    @blur="saveSessionName(sess)"
                  />
                  <span v-else class="flex-1 min-w-0 truncate" @dblclick.stop="startEditSession(sess)">{{ sess.title || t('menuBar.untitled') }}</span>
                  <Button variant="ghost" size="icon" class="h-5 w-5 shrink-0 text-muted-foreground hover:bg-red-500/10 hover:text-red-500" @click.stop="onDeleteAgentSession(sess, project)">
                    <Eraser class="size-3" />
                  </Button>
                </div>
                <div v-if="getProjectSessions(project.id).length === 0" class="py-1.5 pl-7 text-left text-xs text-muted-foreground">{{ t('menuBar.noSession') }}</div>
                <div
                  v-if="getProjectSessions(project.id).length > 3"
                  class="cursor-pointer select-none py-1 pl-7 text-xs text-muted-foreground transition-colors hover:text-primary"
                  @click.stop="toggleSessionListExpand(project.id)"
                >
                  {{ expandedSessionLists.has(project.id) ? t('menuBar.collapse') : t('menuBar.showMore', { count: getProjectSessions(project.id).length - 3 }) }}
                </div>
              </template>
            </template>
            <div v-if="!ws.agentProjectLoading && ws.agentProjects.length === 0" class="px-2 py-3 text-center text-xs text-muted-foreground">{{ t('menuBar.noProject') }}</div>
          </div>
        </div>
      </nav>
    </template>

    <!-- ===================== 收起模式 ===================== -->
    <template v-else>
      <Button variant="ghost" size="icon" class="mx-auto my-2 h-7 w-7 text-muted-foreground hover:text-primary" @click="ws.toggleMenu">
        <PanelLeftOpen class="size-4" />
      </Button>

      <div class="mx-2 my-1 h-px shrink-0 bg-border" />

      <Button
        variant="ghost"
        size="icon"
        class="mx-auto my-0.5 h-10 w-10 shrink-0 rounded-lg border border-transparent bg-muted text-muted-foreground hover:border-border hover:text-primary"
        :class="ws.activeModule === 'chat' ? 'border-primary bg-primary text-primary-foreground shadow-[0_1px_4px_rgba(22,119,255,0.3)] hover:border-primary hover:text-primary-foreground' : ''"
        @click="navigate('chat')"
      >
        <MessageSquare class="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        class="mx-auto my-0.5 h-10 w-10 shrink-0 rounded-lg border border-transparent bg-muted text-muted-foreground hover:border-border hover:text-primary"
        :class="ws.activeModule === 'agent' ? 'border-primary bg-primary text-primary-foreground shadow-[0_1px_4px_rgba(22,119,255,0.3)] hover:border-primary hover:text-primary-foreground' : ''"
        @click="navigate('agent')"
      >
        <Bot class="size-4" />
      </Button>

      <div class="mx-2 my-1 h-px shrink-0 bg-border" />

      <Button
        variant="ghost"
        size="icon"
        class="mx-auto my-0.5 h-10 w-10 shrink-0 rounded-lg border border-transparent bg-muted text-muted-foreground hover:border-border hover:text-primary"
        :class="ws.activeModule === 'file' ? 'border-primary bg-primary text-primary-foreground shadow-[0_1px_4px_rgba(22,119,255,0.3)] hover:border-primary hover:text-primary-foreground' : ''"
        @click="navigate('file')"
      >
        <Folder class="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        class="mx-auto my-0.5 h-10 w-10 shrink-0 rounded-lg border border-transparent bg-muted text-muted-foreground hover:border-border hover:text-primary"
        :class="ws.activeModule === 'invoice' ? 'border-primary bg-primary text-primary-foreground shadow-[0_1px_4px_rgba(22,119,255,0.3)] hover:border-primary hover:text-primary-foreground' : ''"
        @click="navigate('invoice')"
      >
        <FileSearch class="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        class="mx-auto my-0.5 h-10 w-10 shrink-0 rounded-lg border border-transparent bg-muted text-muted-foreground hover:border-border hover:text-primary"
        :class="ws.activeModule === 'planning' ? 'border-primary bg-primary text-primary-foreground shadow-[0_1px_4px_rgba(22,119,255,0.3)] hover:border-primary hover:text-primary-foreground' : ''"
        @click="navigate('planning')"
      >
        <CalendarRange class="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        class="mx-auto my-0.5 h-10 w-10 shrink-0 rounded-lg border border-transparent bg-muted text-muted-foreground hover:border-border hover:text-primary"
        :class="ws.activeModule === 'skills' ? 'border-primary bg-primary text-primary-foreground shadow-[0_1px_4px_rgba(22,119,255,0.3)] hover:border-primary hover:text-primary-foreground' : ''"
        @click="navigate('skills')"
      >
        <Zap class="size-4" />
      </Button>

      <div class="mx-2 my-1 h-px shrink-0 bg-border" />

      <!-- 最近列表 / OCR 子菜单 -->
      <div class="flex flex-col items-center py-1">
        <!-- OCR 子菜单图标（收缩模式） -->
        <template v-if="ws.activeModule === 'invoice'">
          <Button
            variant="ghost"
            size="icon"
            class="mx-auto my-0.5 h-9 w-9 shrink-0 rounded-lg border border-transparent bg-muted text-muted-foreground transition-all hover:border-border hover:text-primary"
            :class="isOcrSubActive('recognize') ? 'border-primary bg-primary text-primary-foreground hover:border-primary hover:text-primary-foreground' : ''"
            @click="navigateOcrSub('recognize')"
          >
            <FileText class="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="mx-auto my-0.5 h-9 w-9 shrink-0 rounded-lg border border-transparent bg-muted text-muted-foreground transition-all hover:border-border hover:text-primary"
            :class="isOcrSubActive('archive') ? 'border-primary bg-primary text-primary-foreground hover:border-primary hover:text-primary-foreground' : ''"
            @click="navigateOcrSub('archive')"
          >
            <Inbox class="size-4" />
          </Button>
        </template>
        <!-- 其他模块的最近列表 -->
        <div
          v-for="item in recentItems"
          :key="item.id"
          class="mx-auto my-0.5 flex h-9 w-9 shrink-0 select-none items-center justify-center rounded-lg border border-transparent bg-muted text-sm font-semibold text-muted-foreground transition-all hover:border-border hover:text-primary"
          :class="item.active ? 'border-primary bg-primary text-primary-foreground hover:border-primary hover:text-primary-foreground' : ''"
          @click="item.onClick"
        >
          {{ item.char }}
        </div>
      </div>

      <div class="flex-1" />
    </template>

    <!-- ===================== 底部：设置 ===================== -->
    <div class="shrink-0 px-1.5 pb-1 pt-1">
      <div
        v-if="!ws.menuCollapsed"
        class="relative mb-0.5 flex h-[34px] cursor-pointer items-center gap-2 rounded-[7px] px-2.5 text-sm transition-colors duration-150"
        :class="ws.activeModule === 'setting'
          ? 'bg-muted font-semibold text-primary'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground'"
        @click="navigate('setting')"
      >
        <Settings class="size-3.5 shrink-0" :class="ws.activeModule === 'setting' ? 'text-primary' : 'text-muted-foreground'" />
        <span class="flex-1 min-w-0 truncate">{{ t('menuBar.settings') }}</span>
      </div>
      <Button
        v-else
        variant="ghost"
        size="icon"
        class="mx-auto my-0.5 h-10 w-10 shrink-0 rounded-lg border border-transparent bg-muted text-muted-foreground hover:border-border hover:text-primary"
        :class="ws.activeModule === 'setting' ? 'border-primary bg-primary text-primary-foreground shadow-[0_1px_4px_rgba(22,119,255,0.3)] hover:border-primary hover:text-primary-foreground' : ''"
        @click="navigate('setting')"
      >
        <Settings class="size-4" />
      </Button>
    </div>

    <!-- ===================== 删除确认弹窗 ===================== -->
    <AlertDialog v-model:open="deleteDialog.open">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ deleteDialog.title }}</AlertDialogTitle>
          <AlertDialogDescription>{{ deleteDialog.content }}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{{ t('menuBar.cancel') }}</AlertDialogCancel>
          <AlertDialogAction
            class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            @click="confirmDelete"
          >
            {{ t('menuBar.confirmDelete') }}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter, useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import { toast } from 'vue-sonner'
import {
  PanelLeftClose, PanelLeftOpen, MessageSquare, Bot, Folder, FileSearch,
  CalendarRange, Zap, FileText, Inbox, Plus, Eraser, ChevronDown, ChevronRight,
  Settings,
} from '@lucide/vue'
import { ipc } from '@/utils/ipcRenderer'
import { ipcApiRoute } from '@/api'
import { useWorkspaceStore } from '@/stores/workspace'
import { useAgentStore } from '@/stores/agent'
import { usePlanningStore } from '@/stores/planning'
import { useTabStore } from '@/stores/tab'
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog'

const { t } = useI18n()
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

/** 选中第一个项目的第一个会话（用于 Agent 模式无活跃会话时的回退） */
async function selectFirstAgentSession() {
  // 确保项目和会话列表已加载
  if (ws.agentProjects.length === 0) {
    await ws.loadAgentProjects()
  }
  if (agent.sessions.length === 0) {
    await agent.loadSessions()
  }
  // 选中第一个项目
  if (ws.agentProjects.length > 0) {
    const firstProject = ws.agentProjects[0]
    ws.selectAgentProject(firstProject.id)
    // 找到该项目下的第一个会话
    const projectSessions = agent.sessions.filter((s) => {
      const wid = s.workspaceId || s.workspace_id || s.projectId || ''
      return String(wid) === String(firstProject.id)
    })
    if (projectSessions.length > 0) {
      await agent.selectSession(projectSessions[0].id)
    } else {
      tabStore.enterTabMode()
    }
  } else {
    tabStore.enterTabMode()
  }
}

async function navigate(key) {
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
      if (session) {
        tabStore.openSessionTab('agent', sessionId, session.title || t('sidebar.agent'))
      } else {
        // 上次会话已失效：选中第一个项目的第一个会话
        await selectFirstAgentSession()
      }
    } else {
      // 无活跃会话：选中第一个项目的第一个会话
      await selectFirstAgentSession()
    }
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
    if (result?.success) { toast.success(t('menuBar.messages.folderAdded')); await loadTotalFileCount() }
    else if (result?.message) toast.warning(result.message)
  } catch { toast.error(t('menuBar.messages.folderAddFailed')) }
  finally { addFolderLoading.value = false }
}

function onDeleteFolder(folder) {
  openDeleteDialog(t('menuBar.delete.folder'), t('menuBar.delete.folderConfirm', { name: getFolderName(folder.path) }), async () => {
    try {
      const result = await ws.deleteFolder(folder.id)
      if (result?.success) { toast.success(t('menuBar.messages.folderDeleted')); await loadTotalFileCount() }
      else toast.error(t('menuBar.messages.folderDeleteFailed'))
    } catch { toast.error(t('menuBar.messages.folderDeleteFailed')) }
  })
}

async function onCreateChat() {
  await ws.createChatSession()
  if (ws.currentChatSessionId) {
    const session = ws.chatSessions.find(s => s.id === ws.currentChatSessionId)
    tabStore.openSessionTab('chat', ws.currentChatSessionId, session?.title || t('menuBar.newSession'))
  }
  ws.setActiveModule('chat')
}

function onDeleteChatSession(session) {
  openDeleteDialog(t('menuBar.delete.conversation'), t('menuBar.delete.conversationConfirm', { name: session.title || t('menuBar.newSession') }), async () => {
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
        toast.success(t('menuBar.messages.conversationDeleted'))
      } else toast.error(res?.message || t('menuBar.messages.conversationDeleteFailed'))
    } catch { toast.error(t('menuBar.messages.conversationDeleteFailed')) }
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
      toast.success(t('menuBar.messages.projectNameUpdated'))
    } else toast.error(res?.message || t('menuBar.messages.projectNameUpdateFailed'))
  } catch { toast.error(t('menuBar.messages.projectNameUpdateFailed')) }
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
      toast.success(t('menuBar.messages.sessionNameUpdated'))
    } else toast.error(res?.message || t('menuBar.messages.sessionNameUpdateFailed'))
  } catch { toast.error(t('menuBar.messages.sessionNameUpdateFailed')) }
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
  openDeleteDialog(t('menuBar.delete.project'), t('menuBar.delete.projectConfirm', { name: project.name }), async () => {
    try {
      const res = await ws.deleteAgentProject(project.id)
      if (res && res.code === 0) {
        agent.sessions = agent.sessions.filter((s) => {
          const wid = s.workspaceId || s.workspace_id || s.projectId || ''
          return String(wid) !== String(project.id)
        })
        toast.success(t('menuBar.messages.projectDeleted'))
        await selectNewestSession()
      } else toast.error(res?.message || t('menuBar.messages.projectDeleteFailed'))
    } catch { toast.error(t('menuBar.messages.projectDeleteFailed')) }
  })
}

function onDeleteAgentSession(sess, project) {
  openDeleteDialog(t('menuBar.delete.session'), t('menuBar.delete.sessionConfirm', { name: sess.title || t('menuBar.untitled') }), async () => {
    try {
      const res = await ipc.invoke(ipcApiRoute.piAgent.sessionOperation, { action: 'delete', sessionId: sess.id })
      if (res.code === 0) {
        agent.sessions = agent.sessions.filter((s) => s.id !== sess.id)
        delete agent.messagesBySession[sess.id]
        tabStore.closeTab(sess.id)
        if (agent.currentSessionId === sess.id) await selectNewestSession()
        toast.success(t('menuBar.messages.sessionDeleted'))
      } else toast.error(res?.message || t('menuBar.messages.sessionDeleteFailed'))
    } catch { toast.error(t('menuBar.messages.sessionDeleteFailed')) }
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
  if (!path) return t('menuBar.untitled')
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '')
  const parts = normalized.split('/')
  return parts[parts.length - 1] || path
}

// 监听 Bridge 创建会话事件（飞书/微信/钉钉等 IM Bridge 创建会话后通知前端刷新）
function onBridgeSessionCreated() {
  ws.loadAgentProjects()
  agent.loadSessions()
}

// Bridge 消息开始处理：后端 headless 模式运行 Agent，前端启动消息轮询以实时刷新 UI
function onBridgeMessageStart(_event, { sessionId, workspaceId }) {
  // 刷新会话列表，确保新会话出现在列表中
  agent.loadSessions()
  // 启动消息轮询：定期 reload 持久化的消息，直到检测到 LLM 回复完成
  agent.startMessagePolling(sessionId)
  console.log(`[MenuBar] Bridge 消息开始处理，启动轮询: ${sessionId}`)
}

// Bridge 消息处理完成：停止消息轮询
function onBridgeMessageDone(_event, { sessionId }) {
  agent.stopMessagePolling(sessionId)
  // 最后加载一次消息，确保 UI 显示最终结果
  agent.loadMessages(sessionId).catch(() => {})
  console.log(`[MenuBar] Bridge 消息处理完成，停止轮询: ${sessionId}`)
}

onMounted(() => {
  ws.loadFolderList()
  ws.loadChatSessions()
  ws.loadAgentProjects()
  agent.loadSessions()
  loadSkillsCount()
  loadTotalFileCount()
  planning.loadAll().catch(() => {})

  ipc.on('controller/bridge/sessionCreated', onBridgeSessionCreated)
  ipc.on('controller/bridge/messageStart', onBridgeMessageStart)
  ipc.on('controller/bridge/messageDone', onBridgeMessageDone)
})

onUnmounted(() => {
  ipc.removeListener('controller/bridge/sessionCreated', onBridgeSessionCreated)
  ipc.removeListener('controller/bridge/messageStart', onBridgeMessageStart)
  ipc.removeListener('controller/bridge/messageDone', onBridgeMessageDone)
})
</script>