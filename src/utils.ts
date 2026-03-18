import { v4 as uuidv4 } from 'uuid';

export const generateId = (): string => uuidv4();

export const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
};

export const truncateString = (str: string, length: number = 15): string => {
    if (str.length <= length) return str;
    return str.slice(0, length) + '...';
};

export const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch (err) {
        console.error('复制失败:', err);
        return false;
    }
};