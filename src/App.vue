<template>
  <div class="app-container" :class="{ 'theme-dark': theme === 'dark' }">
    <!-- 侧边栏 -->
    <div class="sidebar" :class="{ 'sidebar-hidden': sidebarHidden }">
      <div class="sidebar-header">
        <h2>AI 聊天</h2>
      </div>

      <!-- 会话列表 -->
      <div class="session-list">
        <div
            v-for="session in sessions"
            :key="session.id"
            class="session-item"
            :class="{ active: session.id === currentSessionId, top: session.isTop }"
        >
          <div class="session-info" @click="switchSession(session.id)">
            <span class="session-top-tag" v-if="session.isTop">🔴</span>
            <span class="session-title">{{ session.title }}</span>
            <span class="session-time">{{ formatTime(session.updateTime) }}</span>
          </div>
          <div class="session-actions">
            <button @click.stop="store.toggleSessionTop(session.id)" class="action-btn">
              {{ session.isTop ? '取消置顶' : '置顶' }}
            </button>
            <button @click.stop="confirmDeleteSession(session.id)" class="action-btn danger">
              删除
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 主聊天区域 -->
    <div class="chat-main" :class="{ 'chat-main-expanded': sidebarHidden }">
      <!-- 顶部工具栏 -->
      <div class="chat-toolbar">
        <div class="toolbar-left">
          <button @click="toggleSidebar" class="toolbar-btn" title="切换侧边栏">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="9" y1="3" x2="9" y2="21"></line>
            </svg>
          </button>
          <button @click="createNewSession" class="toolbar-btn" title="新建会话">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
        </div>
        <div class="toolbar-right">
          <button @click="toggleTheme" class="toolbar-btn" :title="theme === 'light' ? '切换到深色模式' : '切换到浅色模式'">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path v-if="theme === 'light'" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
              <path v-else d="M12 2a10 10 0 1 0 10 10 10 10 0 0 0-10-10zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"></path>
            </svg>
          </button>
          <button @click="exportSession" class="toolbar-btn" title="导出Markdown">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
          </button>
        </div>
      </div>

      <!-- 加载中/无会话 -->
      <div v-if="!currentSession" class="empty-chat">
        🎉 正在加载会话，请稍候...
      </div>

      <!-- 聊天内容区域 -->
      <template v-else>
        <div class="chat-content">
          <!-- 消息列表 -->
          <div class="message-list" ref="messageListRef">
            <div v-if="currentSession.messages?.length === 0" class="empty-messages">
              🎉 直接输入消息开始聊天吧！
            </div>

            <div
                v-for="msg in currentSession.messages || []"
                :key="msg.id"
                class="message-item"
                :class="`message-${msg.role}`"
            >
              <div class="message-role">{{ msg.role === 'user' ? '我' : 'AI' }}</div>
              <div class="message-content">
                <!-- 加载中 -->
                <div v-if="msg.loading" class="loading">
                  <span>AI 正在思考...</span>
                  <span class="loading-dots">...</span>
                </div>
                <!-- 错误提示 -->
                <div v-else-if="msg.error" class="error">
                  ❌ {{ msg.content || '消息发送失败，请重试' }}
                </div>
                <!-- 正常内容 -->
                <div
                    v-else
                    class="markdown-content"
                    v-html="renderMarkdown(msg.content, theme)"
                ></div>

                <!-- 用户消息操作按钮 -->
                <div v-if="msg.role === 'user'" class="message-actions">
                  <button @click="editMessage(msg)" class="msg-action-btn">编辑</button>
                  <button @click="revokeMessage(msg.id)" class="msg-action-btn danger">撤回</button>
                </div>

                <!-- 代码复制按钮 -->
                <button
                    v-if="msg.content.includes('```') && !msg.loading && !msg.error"
                    @click="copyCode(msg.content)"
                    class="copy-btn"
                >
                  复制代码
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- 输入区域 -->
        <div class="input-area">
          <textarea
              v-model="inputValue"
              placeholder="请输入消息..."
              class="message-input"
              @keyup.enter="handleSendMessage"
              ref="inputRef"
          ></textarea>
          <button
              @click="handleSendMessage"
              class="send-btn"
              :disabled="!inputValue.trim()"
          >
            发送
          </button>
        </div>
      </template>

      <!-- 编辑消息弹窗 -->
      <div v-if="showEditModal" class="modal">
        <div class="modal-content">
          <h4>编辑消息</h4>
          <textarea
              v-model="editContent"
              class="edit-textarea"
              rows="5"
          ></textarea>
          <div class="modal-buttons">
            <button @click="showEditModal = false">取消</button>
            <button @click="confirmEditMessage" class="confirm-btn">确认</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue';
import { useDebounceFn } from '@vueuse/core';
import { useChatStore } from './store/chatStore';
import { streamChat } from './utils/sse';
import { renderMarkdown } from './utils/markdown';
import { generateId, formatTime, copyToClipboard } from './utils';
import hljs from 'highlight.js';
import type { Message } from './types';

// 状态管理
const store = useChatStore();
const currentSessionId = computed(() => store.currentSessionId);
const currentSession = computed(() => store.getCurrentSession());
const sessions = computed(() => store.sessions);
const theme = computed(() => store.theme);

// 侧边栏隐藏状态
const sidebarHidden = ref(false);

// 响应式数据
const inputValue = ref('');
const inputRef = ref<HTMLTextAreaElement | null>(null);
const messageListRef = ref<HTMLDivElement | null>(null);

// 编辑消息相关
const showEditModal = ref(false);
const editMessageId = ref('');
const editContent = ref('');

// 初始化
onMounted(async () => {
  await store.loadAllSessions();
  await nextTick();
  inputRef.value?.focus();
  scrollToBottom();
});

// 切换侧边栏
const toggleSidebar = () => {
  sidebarHidden.value = !sidebarHidden.value;
};

// 滚动到底部
const scrollToBottom = () => {
  nextTick(() => {
    if (messageListRef.value) {
      messageListRef.value.scrollTop = messageListRef.value.scrollHeight;
    }
  });
};

// 创建新会话
const createNewSession = () => {
  store.createNewSession();
  inputValue.value = '';
  nextTick(() => {
    inputRef.value?.focus();
    scrollToBottom();
  });
};

// 切换会话
const switchSession = (sessionId: string) => {
  store.switchSession(sessionId);
  inputValue.value = '';
  nextTick(() => {
    inputRef.value?.focus();
    scrollToBottom();
  });
};

// 确认删除会话
const confirmDeleteSession = (sessionId: string) => {
  if (confirm('确定要删除这个会话吗？')) {
    store.deleteSession(sessionId);
  }
};

// 发送消息
const sendMessage = async () => {
  if (!inputValue.value.trim() || !currentSessionId.value) return;

  const content = inputValue.value.trim();
  inputValue.value = '';

  // 创建用户消息
  const userMessage: Message = {
    id: generateId(),
    role: 'user',
    content,
    createTime: Date.now()
  };

  store.saveMessage(currentSessionId.value, userMessage);
  scrollToBottom();

  // 创建AI消息
  const assistantMessage: Message = {
    id: generateId(),
    role: 'assistant',
    content: '',
    createTime: Date.now(),
    loading: true
  };
  store.saveMessage(currentSessionId.value, assistantMessage);

  try {
    // 组装消息列
    const messages = currentSession.value?.messages.map(msg => ({
      role: msg.role,
      content: msg.content
    })) || [];

    // 调用 SSE 流式接口
    await streamChat(
        {
          sessionId: currentSessionId.value,
          messages
        },
        (content, done) => {
          // 实时更新 AI 回复内容
          store.updateAssistantMessage(
              currentSessionId.value,
              assistantMessage.id,
              content,
              !done // done 为 true 时停止 loading
          );
          scrollToBottom();
        },
        (error) => {
          // 处理流式请求错误
          store.updateAssistantMessage(
              currentSessionId.value,
              assistantMessage.id,
              error,
              false,
              true // 标记为错误
          );
        }
    );
  } catch (error) {
    store.updateAssistantMessage(
        currentSessionId.value,
        assistantMessage.id,
        '消息发送失败，请重试',
        false,
        true
    );
  }
};

// 防抖发送
const debouncedSendMessage = useDebounceFn(sendMessage, 300);

// 处理发送消息
const handleSendMessage = () => {
  debouncedSendMessage();
};

// 撤回消息
const revokeMessage = (messageId: string) => {
  if (confirm('确定要撤回这条消息吗？') && currentSessionId.value) {
    store.revokeMessage(currentSessionId.value, messageId);
  }
};

// 编辑消息
const editMessage = (msg: Message) => {
  editMessageId.value = msg.id;
  editContent.value = msg.content;
  showEditModal.value = true;
};

// 确认编辑消息
const confirmEditMessage = () => {
  if (editContent.value.trim() && editMessageId.value && currentSessionId.value) {
    store.editMessage(currentSessionId.value, editMessageId.value, editContent.value.trim());
    showEditModal.value = false;
  }
};

// 复制代码
const copyCode = async (content: string) => {
  const codeMatch = content.match(/```(\w+)?\n([\s\S]*?)```/);
  const code = codeMatch ? codeMatch[2] : content;

  const success = await copyToClipboard(code);
  alert(success ? '复制成功！' : '复制失败，请手动复制');
};

// 导出会话为Markdown
const exportSession = () => {
  if (!currentSession.value) return;

  let markdown = `# ${currentSession.value.title}\n\n`;
  currentSession.value.messages.forEach(msg => {
    markdown += `**${msg.role === 'user' ? '我' : 'AI'}**：\n${msg.content}\n\n`;
  });

  const blob = new Blob([markdown], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${currentSession.value.title}.md`;
  a.click();
  URL.revokeObjectURL(url);
};

// 主题切换方法
const toggleTheme = () => {
  store.toggleTheme();
  // 切换主题后重新渲染代码高亮样式
  nextTick(() => {
    const codeBlocks = document.querySelectorAll('pre code');
    codeBlocks.forEach(block => {
      hljs.highlightElement(block as HTMLElement);
    });
  });
};
</script>

<style scoped>
/* 基础布局 */
.app-container {
  display: flex;
  height: 100vh;
  width: 100%;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

/* 侧边栏 */
.sidebar {
  width: 300px;
  background: navajowhite;
  border-right: 1px solid cadetblue;
  display: flex;
  flex-direction: column;
  transition: transform 0.3s ease;
  flex-shrink: 0;
}

.sidebar-hidden {
  transform: translateX(-100%);
}

.sidebar-header {
  padding: 16px;
  border-bottom: 1px solid cadetblue;
  flex-shrink: 0;
}

.sidebar-header h2 {
  margin: 0;
  color: black;
  font-size: 18px;
}

/* 会话列表 */
.session-list {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.session-item {
  padding: 12px 16px;
  cursor: pointer;
  border-bottom: 1px solid white;
  display: flex;
  justify-content: space-between;
  align-items: center;
  transition: background 0.2s;
}

.session-item:hover {
  background: gainsboro;
}

.session-item.active {
  background: lightgoldenrodyellow;
  border-left: 3px solid cornflowerblue;
}

.session-item.top {
  border-left: 3px solid wheat;
}

.session-info {
  flex: 1;
  overflow: hidden;
}

.session-top-tag {
  margin-right: 4px;
  font-size: 12px;
}

.session-title {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 500;
  color: black;
  font-size: 14px;
}

.session-time {
  font-size: 12px;
  color: cadetblue;
  margin-top: 2px;
  display: block;
}

.session-actions {
  display: flex;
  gap: 4px;
}

.action-btn {
  padding: 2px 6px;
  border: none;
  border-radius: 2px;
  background: transparent;
  color: cadetblue;
  cursor: pointer;
  font-size: 12px;
  transition: color 0.2s;
}

.action-btn:hover {
  color: cornflowerblue;
}

.action-btn.danger {
  color: cadetblue;
}

.action-btn.danger:hover {
  color: cornflowerblue;
}

/* 主聊天区域 */
.chat-main {
  flex: 1;
  background: cornsilk;
  display: flex;
  flex-direction: column;
  transition: margin-left 0.3s ease;
  height: 100vh;
  overflow: hidden;
}

.chat-main-expanded {
  margin-left: -300px;
}

/* 顶部工具栏 */
.chat-toolbar {
  height: 57.5px;
  background: navajowhite;
  border-bottom: 1px solid cadetblue;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  flex-shrink: 0;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  gap: 8px;
}

.toolbar-btn {
  padding: 8px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: black;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s;
}

.toolbar-btn:hover {
  background: rgba(0, 0, 0, 0.1);
}

/* 空聊天状态 */
.empty-chat {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  color: cornflowerblue;
  font-size: 18px;
  min-height: 200px;
}

/* 聊天内容区域 */
.chat-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

/* 消息列表 */
.message-list {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
  position: relative;
}

.empty-messages {
  text-align: center;
  padding: 40px;
  color: black;
  font-size: 16px;
}

.message-item {
  display: flex;
  margin-bottom: 20px;
  align-items: flex-start;
}

.message-user {
  flex-direction: row-reverse;
}

.message-role {
  width: 48px;
  text-align: center;
  font-weight: 500;
  color: grey;
  font-size: 14px;
  padding-top: 8px;
}

.message-content {
  max-width: 70%;
  padding: 12px 16px;
  border-radius: 8px;
  background: wheat;
  border: 1px solid whitesmoke;
  position: relative;
  color: black;
  line-height: 1.6;
}

.message-user .message-content {
  background: cornflowerblue;
  color: white;
  border-color: lightgoldenrodyellow;
}

.loading {
  color: grey;
  font-size: 14px;
}

.loading-dots {
  animation: loading 1.5s infinite;
  margin-left: 8px;
}

.error {
  color: black;
  font-size: 14px;
}

.markdown-content {
  font-size: 14px;
}

.markdown-content pre {
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
  margin: 8px 0;
  background: cornflowerblue;
}

.markdown-content code {
  padding: 2px 4px;
  border-radius: 3px;
  background: whitesmoke;
  color: black;
  font-size: 13px;
}

.message-user .markdown-content code {
  background: rgba(255, 255, 255, 0.2);
}

/* 消息操作按钮 */
.message-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.msg-action-btn {
  padding: 4px 8px;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  background: cadetblue;
  color: white;
  transition: background 0.2s;
}

.msg-action-btn:hover {
  background: cadetblue;
}

.msg-action-btn.danger {
  background: cadetblue;
}

/* 输入区域 */
.input-area {
  padding: 16px;
  border-top: 1px solid cadetblue;
  display: flex;
  gap: 12px;
  background: navajowhite;
  flex-shrink: 0;
  min-height: 120px;
}

.message-input {
  flex: 1;
  padding: 12px 16px;
  border: 1px solid cadetblue;
  border-radius: 8px;
  resize: none;
  background: cornsilk;
  color: black;
  font-family: inherit;
  font-size: 14px;
  min-height: 80px;
  max-height: 200px;
  outline: none;
  transition: border 0.2s;
}

.message-input:focus {
  border-color: cadetblue;
}

.send-btn {
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  background: cadetblue;
  color: white;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
  white-space: nowrap;
  align-self: flex-end;
  height: fit-content;
}

.send-btn:disabled {
  background: cadetblue;
  cursor: not-allowed;
}

.send-btn:hover:not(:disabled) {
  background: cadetblue;
}

/* 模态框 */
.modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 100;
}

.modal-content {
  background: navajowhite;
  padding: 60px;
  border-radius: 8px;
  width: 500px;
  max-width: 90%;
  box-shadow: 0 4px 20px cadetblue;
}

.modal-content h4 {
  margin: 0 0 16px 0;
  color: black;
  font-size: 16px;
}

.edit-textarea {
  width: 100%;
  padding: 12px;
  border: 1px solid cadetblue;
  border-radius: 4px;
  background: lightyellow;
  color: black;
  font-size: 14px;
  resize: vertical;
  min-height: 100px;
  margin: 8px 0 16px 0;
}

.modal-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.modal-buttons button {
  padding: 8px 16px;
  border: 1px solid cadetblue;
  border-radius: 4px;
  background: navajowhite;
  color: black;
  cursor: pointer;
  font-size: 14px;
}

.confirm-btn {
  color: black !important;
  border-color: cadetblue !important;
}

/* 动画 */
@keyframes loading {
  0% { content: '.'; }
  33% { content: '..'; }
  66% { content: '...'; }
  100% { content: '.'; }
}

/* 响应式适配 */
@media (max-width: 768px) {
  .sidebar {
    width: 250px;
    position: fixed;
    left: 0;
    height: 100vh;
    z-index: 99;
  }

  .sidebar-hidden {
    transform: translateX(-250px);
  }

  .chat-main {
    width: 100%;
  }

  .chat-main-expanded {
    margin-left: 0;
  }

  .message-content {
    max-width: 85%;
  }

  .input-area {
    flex-direction: column;
    padding: 12px;
    min-height: auto;
  }

  .message-input {
    min-height: 60px;
    max-height: 150px;
  }

  .send-btn {
    width: 100%;
    align-self: stretch;
  }
}

/* 深色模式样式 */
.theme-dark .sidebar {
  background: #2c3e50;
  border-right-color: #4a6990;
}

.theme-dark .sidebar-header h2 {
  color: #ecf0f1;
}

.theme-dark .session-item {
  border-bottom-color: #4a6990;
}

.theme-dark .session-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.theme-dark .session-item.active {
  background: rgba(255, 255, 255, 0.05);
  border-left-color: #4a6990;
}

.theme-dark .session-title {
  color: #ecf0f1;
}

.theme-dark .session-time {
  color: #4a6990;
}

.theme-dark .action-btn {
  color: #4a6990;
}

.theme-dark .action-btn:hover {
  color: #ecf0f1;
}

.theme-dark .chat-main {
  background: #1a2634;
}

.theme-dark .chat-toolbar {
  background: #2c3e50;
  border-bottom-color: #4a6990;
}

.theme-dark .toolbar-btn {
  color: #ecf0f1;
}

.theme-dark .empty-chat {
  color: #ecf0f1;
}

.theme-dark .empty-messages {
  color: #ecf0f1;
}

.theme-dark .message-content {
  background: #3d5a80;
  border-color: #4a6990;
  color: #ecf0f1;
}

.theme-dark .message-user .message-content {
  background: #34495e;
  border-color: #4a6990;
}

.theme-dark .loading {
  color: #ecf0f1;
}

.theme-dark .error {
  color: #e74c3c;
}

.theme-dark .markdown-content code {
  background: rgba(255, 255, 255, 0.1);
  color: #ecf0f1;
}

.theme-dark .markdown-content pre {
  background: #1e293b;
}

.theme-dark .msg-action-btn {
  background: #4a6990;
  color: #ecf0f1;
}

.theme-dark .input-area {
  background: #2c3e50;
  border-top-color: #4a6990;
}

.theme-dark .message-input {
  background: rgba(255, 255, 255, 0.05);
  border-color: #4a6990;
  color: #ecf0f1;
}

.theme-dark .send-btn {
  background: #4a6990;
  color: #ecf0f1;
}

.theme-dark .modal {
  background: rgba(0, 0, 0, 0.7);
}

.theme-dark .modal-content {
  background: #2c3e50;
  box-shadow: 0 4px 20px #4a6990;
}

.theme-dark .modal-content h4 {
  color: #ecf0f1;
}

.theme-dark .edit-textarea {
  background: rgba(255, 255, 255, 0.05);
  border-color: #4a6990;
  color: #ecf0f1;
}

.theme-dark .modal-buttons button {
  background: #2c3e50;
  color: #ecf0f1;
  border-color: #4a6990;
}
</style>