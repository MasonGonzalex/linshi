// ===================================================================
// ==          FINAL, COMPLETE, AND CORRECT server.js             ==
// ===================================================================

// 1. 模块引入 (放在最顶部)
const express = require('express');
const fetch = require('node-fetch');
require('dotenv').config();
const { HttpsProxyAgent } = require('https-proxy-agent');

// 2. 初始化 Express 应用和核心变量
const app = express();
const PORT = 3000;

// 3. 加载 .env 文件中的 API 配置到 "API 池"
const apiPool = {};
let i = 1;
while (process.env[`API_${i}_NAME`]) {
    const id = `api_${i}`;
    apiPool[id] = {
        id: id,
        name: process.env[`API_${i}_NAME`],
        type: process.env[`API_${i}_TYPE`],
        apiKey: process.env[`API_${i}_KEY`],
        apiUrl: process.env[`API_${i}_URL`],
    };
    i++;
}
console.log('成功加载 API 池:', Object.values(apiPool).map(api => api.name));

// 4. 设置 Express 中间件
app.use(express.json());
app.use(express.static('public'));

// 5. 定义 API 路由

// [GET] /api/providers - 为前端提供可用的 API 列表
app.get('/api/providers', (req, res) => {
    const safeApiList = Object.values(apiPool).map(api => ({
        id: api.id,
        name: api.name,
    }));
    res.json(safeApiList);
});

// server.js 的 app.post 函数 (非流式最终版)

app.post('/api/chat', async (req, res) => {
    try {
        const { messages, apiId } = req.body;

        if (!apiPool[apiId]) {
            return res.status(400).json({ error: '无效的 API ID' });
        }

        const selectedApi = apiPool[apiId];
        if (!selectedApi.apiUrl || !selectedApi.apiKey) {
            return res.status(500).json({ error: `服务器端 API [${apiId}] 配置不完整。` });
        }

        console.log(`收到请求，正在使用 [${selectedApi.name}]...`);

        // --- 关键修改：关闭流式传输 ---
        const isStreaming = false; // 我们将强制关闭流式

        const fetchOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        };

        let apiUrl = selectedApi.apiUrl;
        let requestBody;

        switch (selectedApi.type) {
            case 'gemini':
                apiUrl = `${selectedApi.apiUrl}?key=${selectedApi.apiKey}`;
                const geminiContents = messages.filter(m => m.role !== 'system').map(msg => ({
                    role: msg.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: msg.content }]
                }));
                // Gemini 非流式请求的 URL 不同，需要去掉 :generateContent，加上 :generateMessage
                apiUrl = apiUrl.replace(':generateContent', ':generateAnswer'); // 使用非流式端点
                requestBody = JSON.stringify({ contents: geminiContents });
                break;

            default: // deepseek, openai_compatible
                fetchOptions.headers['Authorization'] = `Bearer ${selectedApi.apiKey}`;
                requestBody = JSON.stringify({
                    model: 'deepseek-chat',
                    messages: messages,
                    stream: isStreaming // 使用我们的开关
                });
                break;
        }
        
        fetchOptions.body = requestBody;
        
        const apiResponse = await fetch(apiUrl, fetchOptions);

        if (!apiResponse.ok) {
            const errorText = await apiResponse.text();
            return res.status(apiResponse.status).json({ error: `[${selectedApi.name}] 返回错误: ${errorText}` });
        }
        
        // --- 关键修改：处理一次性返回的 JSON ---
        const data = await apiResponse.json();
        
        let replyText = '';
        // 根据不同 API 的返回格式，提取回复内容
        if (selectedApi.type === 'gemini') {
            replyText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        } else { // deepseek
            replyText = data.choices?.[0]?.message?.content || '';
        }

        console.log(`[${selectedApi.name}] 完整回复:`, replyText.substring(0, 50) + '...');
        // 将提取出的文本，以 JSON 格式一次性返回给前端
        res.json({ reply: replyText });

    } catch (error) {
        console.error('服务器内部错误:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

// 6. 启动服务器 (放在文件最末尾)
app.listen(PORT, () => {
    console.log(`服务器已启动，正在 http://localhost:${PORT} 上运行`);
});