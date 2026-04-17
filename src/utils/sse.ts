import type { StreamChatParams } from '../types';

// 请求本地代理接口，保护 API Key
export const streamChat = async (
    params: StreamChatParams,
    onMessage: (content: string, done: boolean) => void,
    onError: (error: string) => void
): Promise<void> => {
    const { messages } = params;

    try {
        const response = await fetch('http://localhost:3001/api/chat/stream', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messages,
            })
        });

        if (!response.ok) {
            onError(`请求失败: ${response.statusText}`);
            return;
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
            onError('无法获取响应流');
            return;
        }

        let fullContent = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n').filter(line => line.trim() !== '');

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') {
                        onMessage(fullContent, true);
                        return;
                    }

                    try {
                        const parsed = JSON.parse(data);
                        // 处理代理返回的错误
                        if (parsed.error) {
                            onError(parsed.error);
                            return;
                        }
                        const content = parsed.choices[0]?.delta?.content || '';
                        if (content) {
                            fullContent += content;
                            onMessage(fullContent, false);
                        }
                    } catch (e) {
                        console.error('解析流式数据失败:', e);
                    }
                }
            }
        }

        onMessage(fullContent, true);
    } catch (error) {
        const errMsg = error instanceof Error ? error.message : '未知错误';
        onError(errMsg);
    }
};
