// server.js (iOS 14.4 专项优化版 - 解决加载缓慢问题)
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
const JWT_SECRET = process.env.JWT_SECRET || "a-very-strong-secret-key-that-you-should-change";
const agent = process.env.HTTPS_PROXY ? new HttpsProxyAgent(process.env.HTTPS_PROXY) : null;

// === iOS 14.4 专项优化中间件 ===

// 1. 启用Gzip压缩 - 对iOS 14.4特别重要
app.use(compression({
  level: 6, // 平衡压缩率和CPU使用
  threshold: 1024, // 只压缩大于1KB的文件
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  }
}));

// 2. 设置iOS 14.4友好的缓存策略
app.use((req, res, next) => {
  // 静态资源强缓存
  if (req.url.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg)$/)) {
    res.set({
      'Cache-Control': 'public, max-age=31536000, immutable', // 1年强缓存
      'Expires': new Date(Date.now() + 31536000000).toUTCString(),
    });
  }
  // HTML文件协商缓存
  else if (req.url.endsWith('.html') || req.url === '/') {
    res.set({
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'ETag': `"${Date.now()}"`, // 简单的ETag
    });
  }
  // API请求禁用缓存
  else if (req.url.startsWith('/api/')) {
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
  }
  
  // iOS 14.4 Safari特殊优化头
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    // 防止iOS 14.4的内存泄漏问题
    'Connection': 'keep-alive',
    'Keep-Alive': 'timeout=5, max=1000'
  });
  
  next();
});

// 3. 请求体解析优化
app.use(express.json({ 
  limit: '10mb',
  // iOS 14.4 JSON解析优化
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

// 4. 静态文件服务优化
app.use(express.static(path.join(__dirname, "public"), {
  // iOS 14.4 静态文件优化
  maxAge: '1y', // 1年缓存
  immutable: true,
  setHeaders: (res, path) => {
    // 对关键CSS/JS文件特殊处理
    if (path.endsWith('style.css') || path.endsWith('script.js')) {
      res.set('X-iOS-Optimized', 'true');
    }
  }
}));

// === 任务存储优化 - 减少内存占用 ===
const taskStorage = new Map(); // 使用Map提高性能

// === API Provider Configuration ===
const apiPool = {};
let i = 1;
while (process.env[`API_${i}_NAME`]) {
  const apiId = `api_${i}`;
  apiPool[apiId] = {
    id: apiId,
    name: process.env[`API_${i}_NAME`],
    type: process.env[`API_${i}_TYPE`],
    apiKey: process.env[`API_${i}_KEY`],
    apiUrl: process.env[`API_${i}_URL`],
  };
  i++;
}

// === API Router and Middleware ===
const apiRouter = express.Router();

// Token验证中间件优化
const verifyToken = (req, res, next) => {
  const token = req.headers["x-access-token"];
  if (!token) {
    return res.status(403).json({ message: "没有提供 Token" });
  }
  
  jwt.verify(token, JWT_SECRET, { 
    // iOS 14.4 JWT优化选项
    algorithms: ['HS256'],
    maxAge: '30d'
  }, (err, decoded) => {
    if (err) {
      return res.status(401).json({ message: "Token 无效或已过期" });
    }
    req.userId = decoded.id;
    next();
  });
};

// === Authentication Routes ===
apiRouter.post("/auth/register", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password || password.length < 6) {
    return res.status(400).json({ message: "用户名或密码格式不正确" });
  }
  
  const hashedPassword = bcrypt.hashSync(password, 8);
  db.run("INSERT INTO users (username, password) VALUES (?, ?)", [username, hashedPassword], function(err) {
    if (err) {
      return res.status(500).json({ message: "用户名已存在" });
    }
    res.status(201).json({ message: "注册成功" });
  });
});

apiRouter.post("/auth/login", (req, res) => {
  const { username, password } = req.body;
  db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
    if (err || !user) {
      return res.status(404).json({ message: "用户不存在" });
    }
    if (!bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ message: "密码错误" });
    }
    
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { 
      expiresIn: '30d', // 30天有效期
      algorithm: 'HS256'
    });
    
    res.status(200).json({
      id: user.id,
      username: user.username,
      accessToken: token
    });
  });
});

// === API Routes (Public) ===
apiRouter.get("/providers", (req, res) => {
  const providers = Object.values(apiPool).map(p => ({
    id: p.id,
    name: p.name,
    type: p.type
  }));
  res.json(providers);
});

// === API Routes (Protected) ===
apiRouter.use(verifyToken);

apiRouter.get("/sessions", (req, res) => {
  db.all("SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 50", 
    [req.userId], (err, sessions) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(sessions);
  });
});

apiRouter.post("/sessions", (req, res) => {
  const newSession = {
    id: `session_${Date.now()}_${req.userId}`,
    user_id: req.userId,
    title: "新的对话",
  };
  
  db.run("INSERT INTO sessions (id, user_id, title) VALUES (?, ?, ?)", 
    [newSession.id, newSession.user_id, newSession.title], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.status(201).json(newSession);
  });
});

apiRouter.get("/sessions/:id/messages", (req, res) => {
  const sessionId = req.params.id;
  db.get("SELECT * FROM sessions WHERE id = ? AND user_id = ?", [sessionId, req.userId], (err, session) => {
    if (err || !session) {
      return res.status(404).json({ error: "对话不存在或无权访问" });
    }
    
    db.all("SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at ASC", 
      [sessionId], (err, messages) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      const systemMessage = {
        role: "system",
        content: "你是一个名为"智核"的AI助手。你的核心准则是：提供诚实、有帮助、无害的回答。你必须始终使用简体中文进行交流，即使是技术术语也要尝试翻译或用中文解释。在任何情况下都不能使用英文或其他语言。",
      };
      
      const formattedMessages = [systemMessage, ...messages];
      res.json(formattedMessages);
    });
  });
});

apiRouter.post("/sessions/:id/messages", (req, res) => {
  const sessionId = req.params.id;
  const { role, content } = req.body;
  
  db.get("SELECT * FROM sessions WHERE id = ? AND user_id = ?", [sessionId, req.userId], (err, session) => {
    if (err || !session) {
      return res.status(404).json({ error: "对话不存在或无权访问" });
    }
    
    const messageContent = typeof content === "string" ? content : JSON.stringify(content);
    db.run("INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)", 
      [sessionId, role, messageContent], function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.status(201).json({ id: this.lastID, role, content });
    });
  });
});

apiRouter.put("/sessions/:id/title", (req, res) => {
  const sessionId = req.params.id;
  const { title } = req.body;
  
  db.run("UPDATE sessions SET title = ? WHERE id = ? AND user_id = ?", 
    [title, sessionId, req.userId], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: "对话不存在或无权访问" });
    }
    res.status(200).json({ message: "标题更新成功" });
  });
});

// === 优化的聊天轮询路由 - iOS 14.4专项优化 ===
apiRouter.post("/chat-request", async (req, res) => {
  const taskId = uuidv4();
  
  // 初始化任务状态，针对iOS 14.4优化
  taskStorage.set(taskId, {
    fullThought: "",
    fullAnswer: "",
    done: false,
    error: null,
    startTime: Date.now(),
    lastUpdate: Date.now(),
    chunks: [],
    metadata: {
      totalChunks: 0,
      thoughtChunks: 0,
      answerChunks: 0
    }
  });
  
  // 立即返回任务ID
  res.status(202).json({
    taskId,
    message: "任务已创建，开始处理...",
    optimized: "ios-14-4" // 标识优化版本
  });

  // 异步处理聊天请求
  (async () => {
    const controller = new AbortController(); // 超时控制
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60秒超时
    
    try {
      const { messages, apiId } = req.body;
      const provider = apiPool[apiId];
      
      if (!provider) {
        throw new Error("无效的 API ID");
      }

      const { type, apiUrl, apiKey } = provider;
      let requestUrl, requestBody;

      // 根据不同API类型构建请求
      if (type === "gemini") {
        requestUrl = `${apiUrl.replace(":generateContent", ":streamGenerateContent")}?key=${apiKey}&alt=sse`;
        requestBody = JSON.stringify({
          model: "gemini-2.5-pro",
          contents: messages.filter(msg => msg.role !== "system").map(msg => ({
            role: msg.role === "assistant" ? "model" : msg.role,
            parts: [{ text: msg.content }]
          })),
          generationConfig: {
            temperature: 0.7,
            topP: 0.8,
            topK: 40,
            maxOutputTokens: 8192,
          },
          safetySettings: [{
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          }]
        });
      } else if (type === "deepseek-chat" || type === "deepseek-reasoner") {
        requestUrl = apiUrl;
        requestBody = JSON.stringify({
          model: type,
          messages: messages,
          stream: true,
          temperature: 0.7,
          max_tokens: 8192,
          top_p: 0.9,
          frequency_penalty: 0,
          presence_penalty: 0
        });
      } else {
        throw new Error("该模型类型不支持流式输出");
      }

      console.log(`[任务 ${taskId}] 开始调用 ${type} API...`);

      // 发起API请求 - iOS 14.4优化配置
      const response = await fetch(requestUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: type.startsWith("deepseek") ? `Bearer ${apiKey}` : undefined,
          "User-Agent": "智核AI/1.0-iOS14.4",
          // iOS 14.4 连接优化
          "Connection": "keep-alive",
          "Accept-Encoding": "gzip, deflate"
        },
        body: requestBody,
        agent: agent,
        signal: controller.signal, // 超时控制
        // iOS 14.4 特殊配置
        timeout: 55000 // 55秒超时，留5秒缓冲
      });

      clearTimeout(timeoutId); // 清除超时定时器

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[任务 ${taskId}] API错误:`, response.status, errorText);
        throw new Error(`API 返回错误 (${response.status}): ${errorText}`);
      }

      console.log(`[任务 ${taskId}] 开始处理流式响应...`);

      // 处理流式响应 - iOS 14.4优化版本
      const decoder = new TextDecoder();
      let buffer = "";
      const reader = response.body.getReader();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        if (!taskStorage.has(taskId)) {
          console.log(`[任务 ${taskId}] 任务已被清理，停止处理`);
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim() || !line.startsWith("data: ")) continue;
          
          const data = line.substring(6).trim();
          if (data === "[DONE]") continue;

          try {
            const parsedData = JSON.parse(data);
            let thoughtChunk = "";
            let answerChunk = "";

            // 根据API类型解析数据
            if (type === "gemini") {
              answerChunk = parsedData?.candidates?.[0]?.content?.parts?.[0]?.text || "";
            } else if (type.startsWith("deepseek")) {
              thoughtChunk = parsedData?.choices?.[0]?.delta?.reasoning_content || "";
              answerChunk = parsedData?.choices?.[0]?.delta?.content || "";
            }

            // 更新任务状态
            const task = taskStorage.get(taskId);
            if (task) {
              task.lastUpdate = Date.now();
              task.metadata.totalChunks++;
              
              if (thoughtChunk) {
                task.fullThought += thoughtChunk;
                task.metadata.thoughtChunks++;
              }
              
              if (answerChunk) {
                task.fullAnswer += answerChunk;
                task.metadata.answerChunks++;
              }
              
              // 限制chunks数组大小，避免iOS 14.4内存问题
              if (task.chunks.length < 1000) {
                task.chunks.push({
                  timestamp: Date.now(),
                  type: thoughtChunk ? 'thought' : 'answer',
                  content: thoughtChunk || answerChunk,
                  length: (thoughtChunk || answerChunk).length
                });
              }
            }

          } catch (parseError) {
            console.warn(`[任务 ${taskId}] JSON解析错误:`, parseError.message, "数据:", data.substring(0, 100));
          }
        }
      }

      console.log(`[任务 ${taskId}] 流式处理完成`);

    } catch (error) {
      clearTimeout(timeoutId);
      console.error(`[任务 ${taskId}] 处理失败:`, error.message);
      const task = taskStorage.get(taskId);
      if (task) {
        task.error = error.message;
      }
    } finally {
      // 标记任务完成
      const task = taskStorage.get(taskId);
      if (task) {
        task.done = true;
        task.endTime = Date.now();
        
        const duration = task.endTime - task.startTime;
        console.log(`[任务 ${taskId}] 完成，耗时: ${duration}ms，思考: ${task.metadata.thoughtChunks} 块，回答: ${task.metadata.answerChunks} 块`);
        
        // iOS 14.4 内存优化：更短的清理时间
        setTimeout(() => {
          taskStorage.delete(taskId);
          console.log(`[任务 ${taskId}] 已清理`);
        }, 180000); // 3分钟后清理
      }
    }
  })();
});

// 轮询端点优化
apiRouter.get("/chat-poll/:taskId", (req, res) => {
  const { taskId } = req.params;
  const task = taskStorage.get(taskId);
  
  if (!task) {
    return res.status(404).json({
      error: "任务不存在或已过期",
      fullThought: "",
      fullAnswer: "",
      done: true,
      taskId: taskId
    });
  }

  // 计算处理进度和统计信息
  const currentTime = Date.now();
  const elapsedTime = currentTime - task.startTime;
  const timeSinceLastUpdate = currentTime - task.lastUpdate;
  
  // 构建响应
  const response = {
    taskId: taskId,
    fullThought: task.fullThought,
    fullAnswer: task.fullAnswer,
    done: task.done,
    error: task.error,
    stats: {
      elapsedTime: elapsedTime,
      timeSinceLastUpdate: timeSinceLastUpdate,
      totalChunks: task.metadata.totalChunks,
      thoughtLength: task.fullThought.length,
      answerLength: task.fullAnswer.length
    },
    // iOS 14.4 优化标识
    optimized: true
  };
  
  // 设置适当的缓存头，确保实时性
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'X-Task-Status': task.done ? 'completed' : 'processing',
    'X-iOS-Optimized': 'true'
  });
  
  res.json(response);
});

// === 任务状态监控端点（调试用）===
apiRouter.get("/tasks/status", (req, res) => {
  const tasks = Array.from(taskStorage.keys()).map(taskId => {
    const task = taskStorage.get(taskId);
    return {
      taskId,
      done: task.done,
      error: !!task.error,
      elapsedTime: Date.now() - task.startTime,
      thoughtLength: task.fullThought.length,
      answerLength: task.fullAnswer.length,
      totalChunks: task.metadata.totalChunks
    };
  });
  
  res.json({
    activeTasks: tasks.length,
    tasks: tasks
  });
});

// === 清理过期任务的定时器 - iOS 14.4优化 ===
setInterval(() => {
  const now = Date.now();
  const expiredTasks = [];
  
  for (const [taskId, task] of taskStorage.entries()) {
    // 清理超过5分钟的任务（减少内存占用）
    if (now - task.startTime > 300000) {
      expiredTasks.push(taskId);
    }
  }
  
  expiredTasks.forEach(taskId => {
    taskStorage.delete(taskId);
  });
  
  if (expiredTasks.length > 0) {
    console.log(`清理了 ${expiredTasks.length} 个过期任务`);
  }
  
  // iOS 14.4 内存优化：强制垃圾回收提示
  if (global.gc && taskStorage.size > 100) {
    global.gc();
  }
}, 30000); // 每30秒检查一次

app.use("/api", apiRouter);

// === iOS 14.4 专项路由优化 ===
// 提供预编译的关键资源
app.get('/critical.css', (req, res) => {
  res.set('Content-Type', 'text/css');
  res.set('Cache-Control', 'public, max-age=31536000');
  res.send(`
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;background:#F3F4F6;height:100vh;overflow:hidden}
    .loading-screen{position:fixed;top:0;left:0;width:100%;height:100%;display:flex;justify-content:center;align-items:center;background:#F9FAFB;z-index:9999;flex-direction:column}
    .hidden{display:none!important}
  `);
});

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    memory: process.memoryUsage(),
    activeTasks: taskStorage.size
  });
});

// 提供静态文件和SPA路由
app.get("*", (req, res) => {
  // iOS 14.4 优化：添加特殊头部
  res.set({
    'X-iOS-Compatible': 'true',
    'X-Frame-Options': 'SAMEORIGIN'
  });
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// === 启动服务器 ===
app.listen(PORT, () => {
  console.log(`[INFO] 服务器已启动，正在 http://localhost:${PORT} 上运行`);
  console.log(`[INFO] 支持的API提供商: ${Object.keys(apiPool).length} 个`);
  console.log(`[INFO] iOS 14.4 专项优化已启用`);
  console.log(`[INFO] 轮询机制已启用，内存优化已激活`);
  
  // 输出优化信息
  console.log(`[OPTIMIZE] 压缩中间件: 已启用`);
  console.log(`[OPTIMIZE] 缓存策略: iOS 14.4 优化`);
  console.log(`[OPTIMIZE] 任务存储: Map结构，内存优化`);
});