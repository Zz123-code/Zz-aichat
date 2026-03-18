import { marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';
import 'highlight.js/styles/github.css';
import 'highlight.js/styles/github-dark.css';

marked.use(
    markedHighlight({
        highlight: (code: string, lang: string) => {
            const language = hljs.getLanguage(lang) ? lang : 'plaintext';
            return hljs.highlight(code, { language }).value;
        },
    })
);

marked.setOptions({
    gfm: true,
    breaks: true,
});

// 修改：接收theme参数，适配不同主题的代码样式
export const renderMarkdown = (content: string, theme: 'light' | 'dark' = 'light'): string => {
    if (!content) return '';

    // 同步解析（兼容旧版marked）
    let html = '';
    try {
        html = marked.parse(content) as string;
    } catch (e) {
        html = content;
    }

    // 根据主题切换代码块样式
    const codeClass = theme === 'light' ? 'hljs github' : 'hljs github-dark';
    return html.replace(
        '<pre><code',
        `<pre class="${codeClass}"><code`
    );
};