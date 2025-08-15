// server.js (iOS 14.4 兼容版 - 优化轮询机制)
const express = require("express");
const fetch = (...args) => import("node-fetch").then(({
  default: fetch
}) => fetch(...args));
const path = require('path');
require("dotenv").config();
const {
  HttpsProxyAgent
} = require("https-proxy-agent");
const db = require("./database.js");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const {
  v4: uuidv4
} = require('uuid');
const app = express();

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "a-very-strong-secret-key-that-you-should-change";
const agent = process.env.HTTPS_PROXY ? new HttpsProxyAgent(process.env.HTTPS_PROXY) : null;

// 任务存储 - 优化结构以支持更好的轮询体验
const taskStorage = {};

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// --- API Provider Configuration ---
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

// --- API Router and Middleware ---
const apiRouter = express.Router();
const verifyToken = (req, res, next) => {
  const token = req.headers["x-access-token"];
  if (!token) {
    return res.status(403).json({
      message: "没有提供 Token"
    });
  }
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({
        message: "Token 无效或已过期"
      });
    }
    req.userId = decoded.id;
    next();
  });
};

// --- Authentication Routes ---
apiRouter.post("/auth/register", (req, res) => {
  const {
    username,
    password
  } = req.body;
  if (!username || !password || password.length < 6) {
    return res.status(400).json({
      message: "用户名或密码格式不正确"
    });
  }
  const hashedPassword = bcrypt.hashSync(password, 8);
  db.run("INSERT INTO users (username, password) VALUES (?, ?)", [username, hashedPassword], function(err) {
    if (err) {
      return res.status(500).json({
        message: "用户名已存在"
      });
    }
    res.status(201).json({
      message: "注册成功"
    });
  });
});

apiRouter.post("/auth/login", (req, res) => {
  const {
    username,
    password
  } = req.body;
  db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
    if (err || !user) {
      return res.status(404).json({
        message: "用户不存在"
      });
    }
    if (!bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({
        message: "密码错误"
      });
    }
    const token = jwt.sign({
      id: user.id
    }, JWT_SECRET, {
      expiresIn: 2592000
    });
    res.status(200).json({
      id: user.id,
      username: user.username,
      accessToken: token
    });
  });
});

// --- API Routes (Public) ---
apiRouter.get("/providers", (req, res) => {
  const providers = Object.values(apiPool).map(p => ({
    id: p.id,
    name: p.name,
    type: p.type
  }));
  res.json(providers);
});

// --- API Routes (Protected) ---
apiRouter.use(verifyToken);

apiRouter.get("/sessions", (req, res) => {
  db.all("SELECT * FROM sessions WHERE user_id = ? ORDER BY created_at DESC", [req.userId], (err, sessions) => {
    if (err) {
      return res.status(500).json({
        error: err.message
      });
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
  db.run("INSERT INTO sessions (id, user_id, title) VALUES (?, ?, ?)", [newSession.id, newSession.user_id, newSession.title], function(err) {
    if (err) {
      return res.status(500).json({
        error: err.message
      });
    }
    res.status(201).json(newSession);
  });
});

apiRouter.get("/sessions/:id/messages", (req, res) => {
  const sessionId = req.params.id;
  db.get("SELECT * FROM sessions WHERE id = ? AND user_id = ?", [sessionId, req.userId], (err, session) => {
    if (err || !session) {
      return res.status(404).json({
        error: "对话不存在或无权访问"
      });
    }
    db.all("SELECT role, content FROM messages WHERE session_id = ? ORDER BY created_at ASC", [sessionId], (err, messages) => {
      if (err) {
        return res.status(500).json({
          error: err.message
        });
      }
      const systemMessage = {
        role: "system",
        content: "你是一个名为"智核"的AI助手。你的核心准则是：提供诚实、有帮助、专无害的回答。你必须始终使用简体中文进行交流，即使是技术术语也要尝试翻译或用中文解释。在任何情况下都不能使用英文或其他语言。",
      };
      const formattedMessages = [systemMessage, ...messages];
      res.json(formattedMessages);
    });
  });
});

apiRouter.post("/sessions/:id/messages", (req, res) => {
  const sessionId = req.params.id;
  const {
    role,
    content
  } = req.body;
  db.get("SELECT * FROM sessions WHERE id = ? AND user_id = ?", [sessionId, req.userId], (err, session) => {
    if (err || !session) {
      return res.status(404).json({
        error: "对话不存在或无权访问"
      });
    }
    const messageContent = typeof content === "string" ? content : JSON.stringify(content);
    db.run("INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)", [sessionId, role, messageContent], function(err) {
      if (err) {
        return res.status(500).json({
          error: err.message
        });
      }
      res.status(201).json({
        id: this.lastID,
        role,
        content
      });
    });
  });
});

apiRouter.put("/sessions/:id/title", (req, res) => {
  const sessionId = req.params.id;
  const {
    title
  } = req.body;
  db.run("UPDATE sessions SET title = ? WHERE id = ? AND user_id = ?", [title, sessionId, req.userId], function(err) {
    if (err) {
      return res.status(500).json({
        error: err.message
      });
    }
    if (this.changes === 0) {
      return res.status(404).json({
        error: "对话不存在或无权访问"
      });
    }
    res.status(200).json({
      message: "标题更新成功"
    });
  });
});

// --- 增强的聊天轮询路由 ---
apiRouter.post("/chat-request", (req, res) => {
  const taskId = uuidv4();
  
  // 初始化任务状态，包含更多元数据
  taskStorage[taskId] = {
    fullThought: "",
    fullAnswer: "",
    done: false,
    error: null,
    startTime: Date.now(),
    lastUpdate: Date.now(),
    chunks: [], // 存储所有数据块以支持更好的增量更新
    metadata: {
      totalChunks: 0,
      thoughtChunks: 0,
      answerChunks: 0
    }
  };
  
  // 立即返回任务ID
  res.status(202).json({
    taskId,
    message: "任务已创建，开始处理..."
  });

  // 异步处理聊天请求
  (async () => {
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
            parts: [{
              text: msg.content
            }]
          })),
          generationConfig: {
            temperature: 0.7,
            topP: 0.8,
            topK: 40,
            maxOutputTokens: 8192,
          },
          safetySettings: [
            {
              category: "HARM_CATEGORY_HARASSMENT",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            }
          ]
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

      // 发起API请求
      const response = await fetch(requestUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: type.startsWith("deepseek") ? `Bearer ${apiKey}` : undefined,
          "User-Agent": "智核AI/1.0"
        },
        body: requestBody,
        agent: agent,
        timeout: 60000 // 60秒超时
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[任务 ${taskId}] API错误:`, response.status, errorText);
        throw new Error(`API 返回错误 (${response.status}): ${errorText}`);
      }

      console.log(`[任务 ${taskId}] 开始处理流式响应...`);

      // 处理流式响应
      const decoder = new TextDecoder();
      let buffer = "";
      
      for await (const chunk of response.body) {
        if (!taskStorage[taskId]) {
          console.log(`[任务 ${taskId}] 任务已被清理，停止处理`);
          break;
        }

        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ""; // 保留不完整的行

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
            const task = taskStorage[taskId];
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
              
              // 存储数据块用于调试
              task.chunks.push({
                timestamp: Date.now(),
                type: thoughtChunk ? 'thought' : 'answer',
                content: thoughtChunk || answerChunk,
                length: (thoughtChunk || answerChunk).length
              });
            }

          } catch (parseError) {
            console.warn(`[任务 ${taskId}] JSON解析错误:`, parseError.message, "数据:", data.substring(0, 100));
          }
        }
      }

      console.log(`[任务 ${taskId}] 流式处理完成`);

    } catch (error) {
      console.error(`[任务 ${taskId}] 处理失败:`, error.message);
      if (taskStorage[taskId]) {
        taskStorage[taskId].error = error.message;
      }
    } finally {
      // 标记任务完成
      if (taskStorage[taskId]) {
        taskStorage[taskId].done = true;
        taskStorage[taskId].endTime = Date.now();
        
        const duration = taskStorage[taskId].endTime - taskStorage[taskId].startTime;
        console.log(`[任务 ${taskId}] 完成，耗时: ${duration}ms，思考: ${taskStorage[taskId].metadata.thoughtChunks} 块，回答: ${taskStorage[taskId].metadata.answerChunks} 块`);
        
        // 设置清理定时器 (5分钟后清理)
        setTimeout(() => {
          delete taskStorage[taskId];
          console.log(`[任务 ${taskId}] 已清理`);
        }, 300000);
      }
    }
  })();
});

apiRouter.get("/chat-poll/:taskId", (req, res) => {
  const { taskId } = req.params;
  const task = taskStorage[taskId];
  
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
    }
  };
  
  // 设置适当的缓存头，确保实时性
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'X-Task-Status': task.done ? 'completed' : 'processing'
  });
  
  res.json(response);
});

// --- 任务状态监控端点（调试用） ---
apiRouter.get("/tasks/status", (req, res) => {
  const tasks = Object.keys(taskStorage).map(taskId => {
    const task = taskStorage[taskId];
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

// --- 清理过期任务的定时器 ---
setInterval(() => {
  const now = Date.now();
  const expiredTasks = [];
  
  for (const [taskId, task] of Object.entries(taskStorage)) {
    // 清理超过10分钟的任务
    if (now - task.startTime > 600000) {
      expiredTasks.push(taskId);
    }
  }
  
  expiredTasks.forEach(taskId => {
    delete taskStorage[taskId];
  });
  
  if (expiredTasks.length > 0) {
    console.log(`清理了 ${expiredTasks.length} 个过期任务`);
  }
}, 60000); // 每分钟检查一次

app.use("/api", apiRouter);

// 提供静态文件和SPA路由
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`[INFO] 服务器已启动，正在 http://localhost:${PORT} 上运行`);
  console.log(`[INFO] 支持的API提供商: ${Object.keys(apiPool).length} 个`);
  console.log(`[INFO] 轮询机制已启用，支持iOS 14.4+`);
});