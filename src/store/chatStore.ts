import { defineStore } from 'pinia';
import { ref, watch, onUnmounted } from 'vue';
import localForage from 'localforage';
import { generateId, truncateString } from '../utils';
import type { Message, Session, Theme } from '../types';

// 初始化 IndexedDB 实例
const chatStorage = localForage.createInstance({
    name: 'AI_Chat_Store',
    storeName: 'chat_data',
    driver: localForage.INDEXEDDB
});

// 封装 IndexedDB 操作
const useChatLocalStorage = <T>(key: string, defaultValue: T) => {
    const value = ref<T>(defaultValue);
    let saveTimer: number | null = null;
    let isInitialized = false;

    // 初始化读取数据
    const init = async () => {
        try {
            const saved = await chatStorage.getItem<T>(key);
            if (saved !== null) {
                // 深拷贝保存的值，确保没有循环引用
                value.value = JSON.parse(JSON.stringify(saved));
            }
            isInitialized = true;
        } catch (error) {
            console.error(`读取 ${key} 失败:`, error);
            value.value = JSON.parse(JSON.stringify(defaultValue));
            isInitialized = true;
        }
    };

    // 手动封装防抖函数
    const debouncedSave = (cb: () => void) => {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(cb, 500) as unknown as number;
    };

    // 安全的保存函数
    const saveToStorage = async (data: T) => {
        try {
            // 确保数据是可序列化的
            const safeData = JSON.parse(JSON.stringify(data));
            await chatStorage.setItem(key, safeData);
        } catch (e) {
            console.error(`存储 ${key} 失败:`, e);
            // 如果存储失败，尝试逐个字段保存
            if (Array.isArray(data)) {
                try {
                    // 对于数组，尝试分段保存
                    const chunks = [];
                    for (let i = 0; i < data.length; i += 10) {
                        chunks.push(data.slice(i, i + 10));
                    }
                    await chatStorage.setItem(`${key}_chunks`, chunks);
                    await chatStorage.setItem(`${key}_meta`, {
                        length: data.length,
                        chunkSize: 10
                    });
                } catch (chunkError) {
                    console.error(`分块存储 ${key} 失败:`, chunkError);
                }
            }
        }
    };

    // 监听数据变化
    watch(
        value,
        (newVal) => {
            if (!isInitialized) return; // 初始化完成前不保存

            debouncedSave(async () => {
                await saveToStorage(newVal);
            });
        },
        { deep: true }
    );

    // 组件卸载时清除定时器
    onUnmounted(() => {
        if (saveTimer) clearTimeout(saveTimer);
    });

    void init();
    return value;
};

export const useChatStore = defineStore('chat', () => {
    // 状态存储
    const sessions = useChatLocalStorage<Session[]>('chat_sessions', []);
    const currentSessionId = useChatLocalStorage<string>('current_session_id', '');
    const theme = useChatLocalStorage<Theme>('chat_theme', 'light');

    // 初始化新会话
    const initNewSession = (): Session => ({
        id: generateId(),
        title: '新会话',
        updateTime: Date.now(),
        messages: [],
        isTop: false,
        category: '默认分类'
    });

    // 获取当前会话
    const getCurrentSession = (): Session | undefined => {
        return sessions.value.find(session => session.id === currentSessionId.value);
    };

    // 加载所有会话
    const loadAllSessions = () => {
        // 确保所有会话的消息都是数组
        sessions.value = sessions.value.map(session => ({
            ...session,
            messages: Array.isArray(session.messages) ? session.messages : []
        }));

        // 兜底创建默认会话
        if (sessions.value.length === 0) {
            const newSession = initNewSession();
            sessions.value = [newSession];
            currentSessionId.value = newSession.id;
        }

        // 确保当前会话有效
        if (!currentSessionId.value || !getCurrentSession()) {
            currentSessionId.value = sessions.value[0].id;
        }

        sortSessions();
    };

    // 会话排序
    const sortSessions = () => {
        sessions.value = [...sessions.value].sort((a: Session, b: Session) => {
            if (a.isTop !== b.isTop) return a.isTop ? -1 : 1;
            return b.updateTime - a.updateTime;
        });
    };

    // 创建新会话
    const createNewSession = (): void => {
        const newSession = initNewSession();
        sessions.value = [...sessions.value, newSession];
        currentSessionId.value = newSession.id;
        sortSessions();
    };

    // 切换会话
    const switchSession = (sessionId: string): void => {
        const session = sessions.value.find(s => s.id === sessionId);
        if (session) {
            // 确保消息是数组
            if (!Array.isArray(session.messages)) {
                session.messages = [];
            }
            currentSessionId.value = sessionId;
        }
    };

    // 删除会话
    const deleteSession = (sessionId: string): void => {
        sessions.value = sessions.value.filter(s => s.id !== sessionId);

        // 兜底处理
        if (sessions.value.length === 0) {
            createNewSession();
        } else if (currentSessionId.value === sessionId) {
            currentSessionId.value = sessions.value[0].id;
        }

        sortSessions();
    };

    // 保存消息
    const saveMessage = (sessionId: string, message: Message): void => {
        const sessionIndex = sessions.value.findIndex(s => s.id === sessionId);
        if (sessionIndex === -1) return;

        // 创建新数组以确保响应式
        const updatedSessions = [...sessions.value];
        const session = { ...updatedSessions[sessionIndex] };

        session.messages = Array.isArray(session.messages) ? [...session.messages] : [];
        session.messages.push({ ...message }); // 创建消息副本
        session.updateTime = Date.now();

        // 首次用户消息设为会话标题
        if (message.role === 'user' && session.messages.length === 1) {
            session.title = truncateString(message.content, 20);
        }

        updatedSessions[sessionIndex] = session;
        sessions.value = updatedSessions;
        sortSessions();
    };

    // 更新助手消息
    const updateAssistantMessage = (sessionId: string, messageId: string, content: string, loading = false, error = false): void => {
        const sessionIndex = sessions.value.findIndex(s => s.id === sessionId);
        if (sessionIndex === -1) return;

        const updatedSessions = [...sessions.value];
        const session = { ...updatedSessions[sessionIndex] };

        session.messages = Array.isArray(session.messages) ? [...session.messages] : [];
        const messageIndex = session.messages.findIndex(m => m.id === messageId);

        if (messageIndex !== -1 && session.messages[messageIndex].role === 'assistant') {
            // 创建消息副本
            session.messages[messageIndex] = {
                ...session.messages[messageIndex],
                content,
                loading,
                error
            };

            // 仅在加载完成且无错误时更新时间
            if (!loading && !error) {
                session.updateTime = Date.now();
            }

            updatedSessions[sessionIndex] = session;
            sessions.value = updatedSessions;

            if (!loading && !error) {
                sortSessions();
            }
        }
    };

    // 撤销消息
    const revokeMessage = (sessionId: string, messageId: string): void => {
        const sessionIndex = sessions.value.findIndex(s => s.id === sessionId);
        if (sessionIndex === -1) return;

        const updatedSessions = [...sessions.value];
        const session = { ...updatedSessions[sessionIndex] };

        session.messages = Array.isArray(session.messages) ? [...session.messages] : [];
        const messageIndex = session.messages.findIndex(m => m.id === messageId);

        if (messageIndex !== -1) {
            session.messages.splice(messageIndex, 1);
            session.updateTime = Date.now();

            // 无消息时重置标题
            if (session.messages.length === 0) {
                session.title = '新会话';
            }

            updatedSessions[sessionIndex] = session;
            sessions.value = updatedSessions;
            sortSessions();
        }
    };

    // 编辑用户消息
    const editMessage = (sessionId: string, messageId: string, newContent: string): void => {
        const sessionIndex = sessions.value.findIndex(s => s.id === sessionId);
        if (sessionIndex === -1) return;

        const updatedSessions = [...sessions.value];
        const session = { ...updatedSessions[sessionIndex] };

        session.messages = Array.isArray(session.messages) ? [...session.messages] : [];
        const messageIndex = session.messages.findIndex(m => m.id === messageId);

        if (messageIndex !== -1 && session.messages[messageIndex].role === 'user') {
            session.messages[messageIndex] = {
                ...session.messages[messageIndex],
                content: newContent
            };
            session.updateTime = Date.now();

            // 第一条消息编辑后更新标题
            if (messageIndex === 0) {
                session.title = truncateString(newContent, 20);
            }

            updatedSessions[sessionIndex] = session;
            sessions.value = updatedSessions;
            sortSessions();
        }
    };

    // 切换会话置顶状态
    const toggleSessionTop = (sessionId: string): void => {
        const sessionIndex = sessions.value.findIndex(s => s.id === sessionId);
        if (sessionIndex !== -1) {
            const updatedSessions = [...sessions.value];
            updatedSessions[sessionIndex] = {
                ...updatedSessions[sessionIndex],
                isTop: !updatedSessions[sessionIndex].isTop
            };
            sessions.value = updatedSessions;
            sortSessions();
        }
    };

    // 切换主题
    const toggleTheme = (): void => {
        theme.value = theme.value === 'light' ? 'dark' : 'light';
    };

    return {
        sessions,
        currentSessionId,
        theme,
        loadAllSessions,
        createNewSession,
        switchSession,
        deleteSession,
        saveMessage,
        updateAssistantMessage,
        revokeMessage,
        editMessage,
        toggleSessionTop,
        toggleTheme,
        getCurrentSession
    };
});