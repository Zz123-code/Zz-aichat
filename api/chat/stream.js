import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';

// 加载环境变量
dotenv.config();

const app = express();
const stream = createServer(app);
const PORT = 3001;

// 中间件
app.use(cors());
app.use(express.json());

// 代理 DeepSeek SSE 接口
app.post('/api/chat/stream', async (req, res) => {
    try {
        const { messages } = req.body;
        const apiKey = process.env.VITE_API_KEY;

        if (!apiKey) {
            return res.status(500).json({ error: 'API Key 未配置' });
        }

        // 设置 SSE 响应头
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // 调用 DeepSeek API
        const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages,
                stream: true,
                temperature: 0.7,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            res.write(`data: ${JSON.stringify({ error: `请求失败: ${response.statusText} - ${errorText}` })}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
            return;
        }

        // 流式转发响应
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            // 逐行转发 SSE 数据
            const lines = chunk.split('\n').filter(line => line.trim() !== '');
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    res.write(`${line}\n\n`);
                }
            }
        }

        res.write('data: [DONE]\n\n');
        res.end();

    } catch (error) {
        console.error('代理请求失败:', error);
        res.write(`data: ${JSON.stringify({ error: error.message || '未知错误' })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
    }
});

// 启动服务
stream.listen(PORT, () => {
    console.log(`代理服务运行在 http://localhost:${PORT}`);
});