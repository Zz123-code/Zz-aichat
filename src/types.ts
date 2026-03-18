export interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    createTime: number;
    loading?: boolean;
    error?: boolean;
}

export interface Session {
    id: string;
    title: string;
    updateTime: number;
    messages: Message[];
    isTop: boolean;
    category: string;
}

export interface StreamChatParams {
    sessionId: string;
    messages: Pick<Message, 'role' | 'content'>[];
}

export type Theme = 'light' | 'dark';