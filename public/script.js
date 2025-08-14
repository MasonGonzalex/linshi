// public/script.js (Final V10 - Adapting to a refined light theme)
document.addEventListener("DOMContentLoaded", () => {
  // --- 状态管理 (State Management) ---
  let state = {
    sessions: [],
    activeSessionId: null,
    token: localStorage.getItem("accessToken"),
    username: localStorage.getItem("username"),
    isRegisterMode: false,
    currentMessages: [],
    apiProviders: [],
  };

  // --- DOM 元素选择器 (DOM Element Selectors) ---
  const appContainer = document.getElementById("app-container");
  const authContainer = document.getElementById("auth-container");
  const authForm = document.getElementById("auth-form");
  const authTitle = document.getElementById("auth-title");
  const authUsername = document.getElementById("auth-username");
  const authPassword = document.getElementById("auth-password");
  const authSubmitBtn = document.getElementById("auth-submit-btn");
  const switchAuthModeBtn = document.getElementById("switch-auth-mode");
  const authMessage = document.getElementById("auth-message");
  const newChatBtn = document.getElementById("new-chat-btn");
  const sessionList = document.getElementById("session-list");
  const chatForm = document.getElementById("chat-form");
  const userInput = document.getElementById("user-input");
  const chatBox = document.getElementById("chat-box");
  const modelSelect = document.getElementById("model-select");
  const usernameDisplay = document.getElementById("username-display");
  const logoutBtn = document.getElementById("logout-btn");
  const historyToggleBtn = document.getElementById("history-toggle-btn");
  const historyDrawer = document.getElementById("history-drawer");
  const drawerOverlay = document.getElementById("drawer-overlay");
  // 新增：发送按钮
  const sendButton = chatForm.querySelector("button[type=submit]");

  // --- 依赖库配置 (Library Configuration) ---
  // 配置 marked.js 以使用 highlight.js 进行代码高亮
  marked.setOptions({
    highlight: function(code, lang) {
      const language = lang && hljs.getLanguage(lang) ? lang : "plaintext";
      try {
        return hljs.highlight(code, {
          language: language,
          ignoreIllegals: true
        }).value;
      } catch (e) {
        try {
          return hljs.highlightAuto(code).value;
        } catch (e) {
          return code;
        }
      }
    },
  });

  // --- 认证相关功能 (Authentication Functions) ---
  // 切换登录/注册界面
  function toggleAuthModeUI() {
    authMessage.textContent = "";
    if (state.isRegisterMode) {
      authTitle.textContent = "注册";
      authSubmitBtn.textContent = "注册";
      switchAuthModeBtn.textContent = "已有账号？点击登录";
    } else {
      authTitle.textContent = "登录";
      authSubmitBtn.textContent = "登录";
      switchAuthModeBtn.textContent = "没有账号？点击注册";
    }
  }
  // 认证模式切换事件监听
  switchAuthModeBtn.addEventListener("click", (event) => {
    event.preventDefault();
    state.isRegisterMode = !state.isRegisterMode;
    toggleAuthModeUI();
  });
  // 提交登录/注册表单
  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = authUsername.value;
    const password = authPassword.value;
    const endpoint = state.isRegisterMode ? "/auth/register" : "/auth/login";
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          username,
          password
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || "操作失败");
      }
      if (state.isRegisterMode) {
        state.isRegisterMode = false;
        toggleAuthModeUI();
        // 调整成功提示颜色以适配浅色主题
        authMessage.style.color = "#0E9F6E";
        authMessage.textContent = "注册成功！请登录。";
      } else {
        state.token = data.accessToken;
        state.username = data.username;
        localStorage.setItem("accessToken", state.token);
        localStorage.setItem("username", state.username);
        initializeApp();
      }
    } catch (error) {
      // 调整错误提示颜色以适配浅色主题
      authMessage.style.color = "#F05252";
      authMessage.textContent = error.message;
    }
  });
  // 登出功能
  logoutBtn.addEventListener("click", function() {
    state.token = null;
    state.username = null;
    localStorage.removeItem("accessToken");
    localStorage.removeItem("username");
    localStorage.removeItem("lastActiveSessionId");
    toggleAuthViews(false);
  });
  // 切换应用/认证界面的可见性
  function toggleAuthViews(isLoggedIn) {
    if (isLoggedIn) {
      appContainer.classList.remove("hidden");
      authContainer.classList.add("hidden");
      usernameDisplay.textContent = state.username;
    } else {
      appContainer.classList.add("hidden");
      authContainer.classList.remove("hidden");
    }
  }

  // --- 侧边栏与会话管理 (Sidebar & Session Management) ---
  // 侧边栏切换
  historyToggleBtn.addEventListener("click", () => {
    historyDrawer.classList.toggle("open");
    drawerOverlay.classList.toggle("visible");
  });
  drawerOverlay.addEventListener("click", () => {
    historyDrawer.classList.remove("open");
    drawerOverlay.classList.remove("visible");
  });
  // 封装的 API 请求函数
  async function apiRequest(url, options = {}) {
    const defaultHeaders = {
      "Content-Type": "application/json",
      "x-access-token": state.token,
      ...options.headers,
    };
    const response = await fetch(url, {
      ...options,
      headers: defaultHeaders,
    });
    if (response.status === 401) {
      logoutBtn.click();
      return Promise.reject(new Error("登录已过期，请重新登录。"));
    }
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) {
      throw new Error(data.message || data.error || "请求失败");
    }
    return data;
  }
  // 加载会话列表
  async function loadSessions() {
    try {
      state.sessions = await apiRequest("/api/sessions");
      renderSessions();
      if (state.sessions.length > 0) {
        const lastActiveSessionId = localStorage.getItem("lastActiveSessionId");
        const activeSession =
          state.sessions.find((s) => s.id === lastActiveSessionId) || state.sessions[0];
        await loadSessionMessages(activeSession.id);
      } else {
        await createNewSession();
      }
    } catch (error) {
      console.error("加载对话列表失败:", error);
      alert(error.message);
    }
  }
  // 创建新会话
  async function createNewSession() {
    try {
      const newSession = await apiRequest("/api/sessions", {
        method: "POST"
      });
      state.sessions.unshift(newSession);
      await loadSessionMessages(newSession.id);
    } catch (error) {
      console.error("创建新对话失败:", error);
    }
  }
  newChatBtn.addEventListener("click", createNewSession);
  // 加载并显示指定会话的消息
  async function loadSessionMessages(sessionId) {
    historyDrawer.classList.remove("open");
    drawerOverlay.classList.remove("visible");
    state.activeSessionId = sessionId;
    localStorage.setItem("lastActiveSessionId", sessionId);
    renderSessions();
    try {
      state.currentMessages = await apiRequest(`/api/sessions/${sessionId}/messages`);
      renderMessages();
      // 新增：加载消息后自动聚焦到输入框
      userInput.focus();
    } catch (error) {
      console.error(`加载对话 [${sessionId}] 失败:`, error);
      chatBox.innerHTML = `<div class="message assistant" style="color:red">加载消息失败: ${error.message}</div>`;
    }
  }
  // 渲染会话列表
  function renderSessions() {
    sessionList.innerHTML = "";
    state.sessions.forEach((session) => {
      const listItem = document.createElement("li");
      const titleSpan = document.createElement("span");
      titleSpan.classList.add("session-title");
      titleSpan.textContent = session.title;
      const timeSpan = document.createElement("span");
      timeSpan.classList.add("session-time");
      const date = new Date(session.created_at);
      timeSpan.textContent = date
        .toLocaleString("zh-CN", {
          timeZone: "Asia/Shanghai",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })
        .replace(/\//g, "-");
      listItem.appendChild(titleSpan);
      listItem.appendChild(timeSpan);
      listItem.dataset.sessionId = session.id;
      if (session.id === state.activeSessionId) {
        listItem.classList.add("active");
      }
      listItem.addEventListener("click", () => loadSessionMessages(session.id));
      sessionList.appendChild(listItem);
    });
  }

  // --- 消息渲染 (Message Rendering) ---
  // 渲染所有消息
  function renderMessages() {
    chatBox.innerHTML = "";
    if (state.currentMessages) {
      state.currentMessages.filter((msg) => msg.role !== "system").forEach((msg) => {
        let content = msg.content;
        if (typeof content === "string" && content.startsWith("{") && content.endsWith("}")) {
          (() => {
            try {
              const parsedContent = JSON.parse(content);
              if (parsedContent && typeof parsedContent === "object" && parsedContent.answer) {
                content = parsedContent;
              }
            } catch (e) {}
          })();
        }
        if (content && typeof content === "object" && content.answer) {
          renderThinkingMessage(content);
        } else if (Array.isArray(content)) {
          // 由于非流式 API 采用单次请求，多回应功能在此版本中被移除
          // renderMultiResponseMessage(content);
        } else {
          renderSimpleMessage(content, msg.role);
        }
      });
    }
    // 滚动到底部
    chatBox.scrollTop = chatBox.scrollHeight;
  }
  // 渲染简单消息 (用户或助手)
  function renderSimpleMessage(content, role) {
    const messageDiv = document.createElement("div");
    messageDiv.classList.add("message", role);
    const markdownContent =
      typeof content === "object" && content !== null ?
      JSON.stringify(content, null, 2) :
      String(content);
    messageDiv.innerHTML = marked.parse(markdownContent);
    chatBox.appendChild(messageDiv);
    // 滚动到底部
    chatBox.scrollTop = chatBox.scrollHeight;
    hljs.highlightAll();
    return messageDiv;
  }
  // 渲染多回应消息 (功能被移除)
  function renderMultiResponseMessage() {}
  // 渲染思考过程消息
  function renderThinkingMessage(data) {
    const messageDiv = renderSimpleMessage("", "assistant");
    messageDiv.innerHTML = `
      <div class="thinking-header">
          <span class="timer">思考了 ${data.duration} 秒</span>
          <span class="toggle-thought">
              <svg class="arrow down" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </span>
      </div>
      <div class="thought-wrapper">
          <div class="thought-process" style="${data.thought ? "" : "display: none;"}">${marked.parse(
            data.thought || ""
          )}</div>
          <div class="final-answer">${marked.parse(data.answer)}</div>
      </div>
    `;
    const header = messageDiv.querySelector(".thinking-header");
    const thoughtWrapper = messageDiv.querySelector(".thought-wrapper");
    header.addEventListener("click", () => {
      thoughtWrapper.classList.toggle("collapsed");
      header.querySelector(".arrow").classList.toggle("down");
    });
    hljs.highlightAll();
    return messageDiv;
  }

  // --- 聊天与 API 交互 (Chat & API Interaction) ---
  // 加载 API 提供商列表
  async function loadApiProviders() {
    try {
      const providers = await apiRequest("/api/providers");
      state.apiProviders = providers;
      modelSelect.innerHTML = "";
      providers.forEach((provider, index) => {
        const option = document.createElement("option");
        option.value = provider.id;
        option.textContent = provider.name;
        if (index === 0) {
          option.selected = true;
        }
        modelSelect.appendChild(option);
      });
    } catch (error) {
      console.error("加载 API 列表失败:", error);
      modelSelect.innerHTML = "<option>加载失败</option>";
    }
  }

  // 新增：根据输入框内容禁用/启用发送按钮
  userInput.addEventListener("input", () => {
    sendButton.disabled = !userInput.value.trim();
  });

  // 提交聊天表单
  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = userInput.value.trim();
    if (!message || !state.activeSessionId) return;

    // 新增：禁用发送按钮以防止重复提交
    sendButton.disabled = true;

    const apiId = modelSelect.value;
    const provider = state.apiProviders.find((p) => p.id === apiId);

    userInput.value = "";
    renderSimpleMessage(message, "user");

    const userMessage = {
      role: "user",
      content: message,
    };
    await apiRequest(`/api/sessions/${state.activeSessionId}/messages`, {
      method: "POST",
      body: JSON.stringify(userMessage),
    });
    state.currentMessages.push(userMessage);

    const streamProviders = ["gemini", "deepseek-chat", "deepseek-reasoner"];
    if (provider && streamProviders.includes(provider.type)) {
      handleStreamingChat(apiId, message);
    } else {
      await handleNonStreamingChat(apiId, message);
    }
  });

  // 处理流式聊天响应
  function handleStreamingChat(apiId, userMessage) {
    const startTime = Date.now();
    const assistantMessageDiv = renderSimpleMessage("", "assistant");
    assistantMessageDiv.innerHTML = `
      <div class="thinking-header">
          <span class="timer">思考了 0.0 秒</span>
          <span class="toggle-thought">
              <svg class="arrow down" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </span>
      </div>
      <div class="thought-wrapper">
          <div class="thought-process" style="display: none;"></div>
          <div class="final-answer"></div>
      </div>
    `;

    const header = assistantMessageDiv.querySelector(".thinking-header");
    const timer = assistantMessageDiv.querySelector(".timer");
    const thoughtWrapper = assistantMessageDiv.querySelector(".thought-wrapper");
    const thoughtProcessDiv = assistantMessageDiv.querySelector(".thought-process");
    const finalAnswerDiv = assistantMessageDiv.querySelector(".final-answer");

    header.addEventListener("click", () => {
      thoughtWrapper.classList.toggle("collapsed");
      header.querySelector(".arrow").classList.toggle("down");
    });

    const timerInterval = setInterval(() => {
      timer.textContent = `思考了 ${((Date.now() - startTime) / 1000).toFixed(1)} 秒`;
    }, 100);

    let thoughtContent = "";
    let finalAnswerContent = "";

    (async () => {
      try {
        const response = await fetch("/api/chat-stream", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-access-token": state.token,
          },
          body: JSON.stringify({
            messages: state.currentMessages,
            apiId: apiId,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || "请求失败");
        }

        if (!response.body) {
          throw new Error("ReadableStream not available");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        for (;;) {
          const {
            done,
            value
          } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, {
            stream: true
          });
          const dataBlocks = chunk.split("\n\n");

          for (const block of dataBlocks) {
            if (block.startsWith("data: ")) {
              try {
                const data = JSON.parse(block.substring(6));
                if (data.error) throw new Error(data.error);

                if (data.done) {
                  const fullReply = data.fullReply;
                  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
                  const messageData = {
                    thought: thoughtContent,
                    answer: fullReply,
                    duration: duration,
                  };
                  const finalMessage = {
                    role: "assistant",
                    content: JSON.stringify(messageData),
                  };
                  await apiRequest(`/api/sessions/${state.activeSessionId}/messages`, {
                    method: "POST",
                    body: JSON.stringify(finalMessage),
                  });
                  state.currentMessages.push(finalMessage);
                  await updateSessionTitle(userMessage);
                  return renderMessages();
                }

                if (data.thought_chunk) {
                  thoughtProcessDiv.style.display = "block";
                  thoughtContent += data.thought_chunk;
                  thoughtProcessDiv.innerHTML = marked.parse(thoughtContent);
                }

                if (data.chunk) {
                  finalAnswerContent += data.chunk;
                  finalAnswerDiv.innerHTML = marked.parse(finalAnswerContent + "▋");
                }
                chatBox.scrollTop = chatBox.scrollHeight;
              } catch (e) {
                console.error("Stream data error:", e);
              }
            }
          }
        }
      } catch (error) {
        assistantMessageDiv.innerHTML = `<span style="color: red;">流式请求错误: ${error.message}</span>`;
      } finally {
        clearInterval(timerInterval);
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        timer.textContent = `思考了 ${duration} 秒`;
        // 新增：恢复发送按钮和输入框焦点
        sendButton.disabled = false;
        userInput.focus();
      }
    })();
  }

  // 处理非流式聊天响应
  async function handleNonStreamingChat(apiId, userMessage) {
    const startTime = Date.now();
    const assistantMessageDiv = renderSimpleMessage("", "assistant");
    assistantMessageDiv.innerHTML = `<div class="thinking-header">思考了 0.0 秒</div><div class="thinking-process">思考中...</div>`;

    const header = assistantMessageDiv.querySelector(".thinking-header");
    const timerInterval = setInterval(() => {
      header.textContent = `思考了 ${((Date.now() - startTime) / 1000).toFixed(1)} 秒`;
    }, 100);

    try {
      const response = await apiRequest("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          messages: state.currentMessages,
          apiId: apiId,
        }),
      });
      const reply = response.reply;
      const finalMessage = {
        role: "assistant",
        content: reply,
      };
      await apiRequest(`/api/sessions/${state.activeSessionId}/messages`, {
        method: "POST",
        body: JSON.stringify(finalMessage),
      });
      state.currentMessages.push(finalMessage);
      await updateSessionTitle(userMessage);
      renderMessages();
    } catch (error) {
      assistantMessageDiv.innerHTML = `<span style="color: red;">错误: ${error.message}</span>`;
    } finally {
      clearInterval(timerInterval);
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      const finalHeader = chatBox.lastElementChild?.querySelector(".thinking-header");
      if (finalHeader) {
        finalHeader.textContent = `思考了 ${duration} 秒`;
      }
      // 新增：恢复发送按钮和输入框焦点
      sendButton.disabled = false;
      userInput.focus();
    }
  }

  // 更新会话标题
  async function updateSessionTitle(userMessage) {
    const userMessagesCount = state.currentMessages.filter((msg) => msg.role === "user").length;
    if (userMessagesCount === 1) {
      const newTitle = userMessage.substring(0, 20);
      await apiRequest(`/api/sessions/${state.activeSessionId}/title`, {
        method: "PUT",
        body: JSON.stringify({
          title: newTitle,
        }),
      });
      const sessionToUpdate = state.sessions.find((s) => s.id === state.activeSessionId);
      if (sessionToUpdate) {
        sessionToUpdate.title = newTitle;
        renderSessions();
      }
    }
  }

  // --- 应用初始化 (App Initialization) ---
  // 主初始化函数
  async function initializeApp() {
    if (!state.token) {
      return toggleAuthViews(false);
    }
    toggleAuthViews(true);
    await loadApiProviders();
    await loadSessions();
  }

  // 启动应用
  initializeApp();
});