// server.js (iOS 14.4 专项优化版 v2)
const express = require("express");
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));
const path = require('path');
require("dotenv").config();
const { HttpsProxyAgent } = require("https-proxy-agent");
const db = require("./database.js");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require('uuid');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 3000;

// ENHANCEMENT: 强制要求设置JWT_SECRET，提高安全性
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("FATAL ERROR: JWT_SECRET is not set in .env file.");
  process.exit(1);
}

const agent = process.env.HTTPS_PROXY ? new HttpsProxyAgent(process.env.HTTPS_PROXY) : null;

// === 中间件 ===
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, "public"), {
  maxAge: '1y',
  immutable: true,
}));

// NOTE: 内存存储的局限性
// 这是一个单点故障。如果服务器进程重启，所有进行中的聊天任务将丢失。
// 在生产环境中，强烈建议使用 Redis 或类似的外部持久化存储来代替。
const taskStorage = new Map();

// === API Provider Configuration ===
const apiPool = {};
let i = 1;
while (process.env[`API_${i}_NAME`]) {
  const apiId = `api_${i}`;
  apiPool[apiId] = { id: apiId, name: process.env[`API_${i}_NAME`], type: process.env[`API_${i}_TYPE`], apiKey: process.env[`API_${i}_KEY`], apiUrl: process.env[`API_${i}_URL`] };
  i++;
}

// === API Router and Middleware ===
const apiRouter = express.Router();

const verifyToken = (req, res, next) => {
  const token = req.headers["x-access-token"];
  if (!token) return res.status(403).json({ message: "没有提供 Token" });
  
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(401).json({ message: "Token 无效或已过期" });
    req.userId = decoded.id;
    next();
  });
};

// ... 认证、会话、消息路由保持不变 ...
apiRouter.post("/auth/register", (req, res) => { const { username, password } = req.body; if (!username || !password || password.length < 6) { return res.status(400).json({ message: "用户名或密码格式不正确" }); } const hashedPassword = bcrypt.hashSync(password, 8); db.run("INSERT INTO users (username, password) VALUES (?, ?)", [username, hashedPassword], function(err) { if (err) { return res.status(500).json({ message: "用户名已存在" }); } res.status(201).json({ message: "注册成功" }); }); });
apiRouter.post("/auth/login", (req, res) => { const { username, password } = req.body; db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => { if (err || !user) { return res.status(404).json({ message: "用户不存在" }); } if (!bcrypt.compareSync(password, user.password)) { return res.status(401).json({ message: "密码错误" }); } const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '30d' }); res.status(200).json({ id: user.id, username: user.username, accessToken: token }); }); });
apiRouter.get("/providers", (req, res) => { const providers = Object.values(apiPool).map(p => ({ id: p.id, name: p.name, type: p.type })); res.json(providers); });
apiRouter.use(verifyToken);
apiRouter.get("/sessions", (req, res) => { db.all("SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50", [req.userId], (err, sessions) => { if (err) { return res.status(500).json({ error: err.message }); } res.json(sessions); }); });
apiRouter.post("/sessions", (req, res) => { const newSession = { id: `session_${Date.now()}_${req.userId}`, user_id: req.userId, title: "新的对话", }; db.run("INSERT INTO sessions (id, user_id, title) VALUES (?, ?, ?)", [newSession.id, newSession.user_id, newSession.title], function(err) { if (err) { return res.status(500).json({ error: err.message }); } res.status(201).json(newSession); }); });
apiRouter.get("/sessions/:id/messages", (req, res) => { const sessionId = req.params.id; db.get("SELECT * FROM sessions WHERE id = ? AND user_id = ?", [sessionId, req.userId], (err, session) => { if (err || !session) { return res.status(404).json({ error: "对话不存在或无权访问" }); } db.all("SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at ASC", [sessionId], (err, messages) => { if (err) { return res.status(500).json({ error: err.message }); } const systemMessage = { role: "system", content: `你是一个名为\"智核\"的AI助手。你的核心准则是：提供诚实、有帮助、无害的回答。你必须始终使用简体中文进行交流，即使是技术术语也要尝试翻译或用中文解释。在任何情况下都不能使用英文或其他语言。` }; const formattedMessages = [systemMessage, ...messages]; res.json(formattedMessages); }); }); });
apiRouter.post("/sessions/:id/messages", (req, res) => { const sessionId = req.params.id; const { role, content } = req.body; db.get("SELECT * FROM sessions WHERE id = ? AND user_id = ?", [sessionId, req.userId], (err, session) => { if (err || !session) { return res.status(404).json({ error: "对话不存在或无权访问" }); } const messageContent = typeof content === "string" ? content : JSON.stringify(content); db.run("INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)", [sessionId, role, messageContent], function(err) { if (err) { return res.status(500).json({ error: err.message }); } res.status(201).json({ id: this.lastID, role, content }); }); }); });
apiRouter.put("/sessions/:id/title", (req, res) => { const sessionId = req.params.id; const { title } = req.body; db.run("UPDATE sessions SET title = ? WHERE id = ? AND user_id = ?", [title, sessionId, req.userId], function(err) { if (err) { return res.status(500).json({ error: err.message }); } if (this.changes === 0) { return res.status(404).json({ error: "对话不存在或无权访问" }); } res.status(200).json({ message: "标题更新成功" }); }); });

// === 优化的聊天轮询路由 ===
apiRouter.post("/chat-request", async (req, res) => {
  const taskId = uuidv4();
  taskStorage.set(taskId, {
    fullThought: "", fullAnswer: "", done: false, error: null, startTime: Date.now()
  });
  
  res.status(202).json({ taskId });

  // 异步处理，立即释放请求
  (async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 延长超时到120秒
    
    try {
      const { messages, apiId } = req.body;
      const provider = apiPool[apiId];
      if (!provider) throw new Error("无效的 API ID");

      const { type, apiUrl, apiKey } = provider;
      let requestUrl, requestBody;

      if (type === "gemini") { /* ... (gemini body) ... */ }
      else if (type.startsWith("deepseek")) { /* ... (deepseek body) ... */ }
      else { throw new Error("该模型类型不支持流式输出"); }
        if (type === "gemini") { requestUrl = `${apiUrl.replace(":generateContent", ":streamGenerateContent")}?key=${apiKey}&alt=sse`; requestBody = JSON.stringify({ model: "gemini-1.5-pro-latest", contents: messages.filter(msg => msg.role !== "system").map(msg => ({ role: msg.role === "assistant" ? "model" : msg.role, parts: [{ text: msg.content }] })), generationConfig: { temperature: 0.7, topP: 0.8, topK: 40, maxOutputTokens: 8192, }, safetySettings: [{ category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_MEDIUM_AND_ABOVE" }] }); } else if (type === "deepseek-chat" || type === "deepseek-reasoner") { requestUrl = apiUrl; requestBody = JSON.stringify({ model: type, messages: messages, stream: true, temperature: 0.7, max_tokens: 8192, top_p: 0.9 }); } else { throw new Error("该模型类型不支持流式输出"); }

      const response = await fetch(requestUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: type.startsWith("deepseek") ? `Bearer ${apiKey}` : undefined },
        body: requestBody, agent: agent, signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API 返回错误 (${response.status}): ${errorText.substring(0, 200)}`);
      }

      const decoder = new TextDecoder();
      const reader = response.body.getReader();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!taskStorage.has(taskId)) { console.warn(`Task ${taskId} was cleared early.`); break; }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.substring(6).trim();
          if (data === "[DONE]") continue;

          try {
            const parsedData = JSON.parse(data);
            const task = taskStorage.get(taskId);
            if (!task) continue;
            
            let thoughtChunk = "", answerChunk = "";
            if (type === "gemini") { answerChunk = parsedData?.candidates?.[0]?.content?.parts?.[0]?.text || ""; }
            else if (type.startsWith("deepseek")) { thoughtChunk = parsedData?.choices?.[0]?.delta?.reasoning_content || ""; answerChunk = parsedData?.choices?.[0]?.delta?.content || ""; }

            if (thoughtChunk) task.fullThought += thoughtChunk;
            if (answerChunk) task.fullAnswer += answerChunk;
          } catch (parseError) { /* ignore parse errors */ }
        }
      }
    } catch (error) {
      console.error(`[任务 ${taskId}] 处理失败:`, error.message);
      const task = taskStorage.get(taskId);
      if (task) task.error = error.message;
    } finally {
      clearTimeout(timeoutId);
      const task = taskStorage.get(taskId);
      if (task) {
        task.done = true;
        // 5分钟后自动清理任务以释放内存
        setTimeout(() => taskStorage.delete(taskId), 300000);
      }
    }
  })();
});

apiRouter.get("/chat-poll/:taskId", (req, res) => {
  const { taskId } = req.params;
  const task = taskStorage.get(taskId);
  
  if (!task) {
    // FIX: 为客户端提供清晰的404状态，让其知道任务已失效
    return res.status(404).json({
      error: "任务不存在或已过期", done: true
    });
  }

  res.json({
    fullThought: task.fullThought,
    fullAnswer: task.fullAnswer,
    done: task.done,
    error: task.error,
  });
});

app.use("/api", apiRouter);

// 提供静态文件和SPA路由
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// === 启动服务器 ===
app.listen(PORT, () => {
  console.log(`[INFO] 服务器已启动，正在 http://localhost:${PORT} 上运行`);
  console.log(`[INFO] 支持的API提供商: ${Object.keys(apiPool).length} 个`);
  console.log(`[WARN] 任务存储使用内存模式，进程重启将导致任务丢失。`);
});