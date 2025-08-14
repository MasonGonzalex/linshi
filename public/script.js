// public/script.js (Final Stable Version - Polling Logic Corrected)
document.addEventListener("DOMContentLoaded", () => {
  // --- State & DOM Selectors ---
  let state = {
    sessions: [],
    activeSessionId: null,
    token: localStorage.getItem("accessToken"),
    username: localStorage.getItem("username"),
    isRegisterMode: false,
    currentMessages: [],
    apiProviders: [],
  };
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
  const sendButton = chatForm.querySelector("button[type=submit]");

  // --- Library Config ---
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

  // --- Auth Functions ---
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
  switchAuthModeBtn.addEventListener("click", (event) => {
    event.preventDefault();
    state.isRegisterMode = !state.isRegisterMode;
    toggleAuthModeUI();
  });
  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = authUsername.value;
    const password = authPassword.value;
    const endpoint = state.isRegisterMode ? "/api/auth/register" : "/api/auth/login";
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
      authMessage.style.color = "#F05252";
      authMessage.textContent = error.message;
    }
  });
  logoutBtn.addEventListener("click", function() {
    state.token = null;
    state.username = null;
    localStorage.removeItem("accessToken");
    localStorage.removeItem("username");
    localStorage.removeItem("lastActiveSessionId");
    toggleAuthViews(false);
  });
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

  // --- Sidebar & Session Management ---
  historyToggleBtn.addEventListener("click", () => {
    historyDrawer.classList.toggle("open");
    drawerOverlay.classList.toggle("visible");
  });
  drawerOverlay.addEventListener("click", () => {
    historyDrawer.classList.remove("open");
    drawerOverlay.classList.remove("visible");
  });
  async function apiRequest(url, options = {}) {
    const defaultHeaders = {
      "Content-Type": "application/json",
      ...options.headers,
    };
    if (state.token) {
      defaultHeaders["x-access-token"] = state.token;
    }
    const response = await fetch(url, {
      ...options,
      headers: defaultHeaders
    });
    if (response.status === 401) {
      logoutBtn.click();
      return Promise.reject(new Error("登录已过期，请重新登录。"));
    }
    const text = await response.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (e) {
      data = {
        error: "Invalid response from server"
      };
    }
    if (!response.ok) {
      throw new Error(data.message || data.error || "请求失败");
    }
    return data;
  }
  async function loadSessions() {
    try {
      const sessions = await apiRequest("/api/sessions");
      state.sessions = sessions;
      renderSessions();
      if (state.sessions && state.sessions.length > 0) {
        const lastActiveSessionId = localStorage.getItem("lastActiveSessionId");
        const sessionExists = state.sessions.some(s => s.id === lastActiveSessionId);
        const activeSessionId = (lastActiveSessionId && sessionExists) ? lastActiveSessionId : state.sessions[0].id;
        await loadSessionMessages(activeSessionId);
      } else {
        await createNewSession();
      }
    } catch (error) {
      console.error("加载对话列表失败:", error);
    }
  }
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
  async function loadSessionMessages(sessionId) {
    historyDrawer.classList.remove("open");
    drawerOverlay.classList.remove("visible");
    state.activeSessionId = sessionId;
    localStorage.setItem("lastActiveSessionId", sessionId);
    renderSessions();
    try {
      state.currentMessages = await apiRequest(`/api/sessions/${sessionId}/messages`);
      renderMessages();
      userInput.focus();
    } catch (error) {
      console.error(`加载对话 [${sessionId}] 失败:`, error);
      chatBox.innerHTML = `<div class="message assistant" style="color:red">加载消息失败: ${error.message}</div>`;
    }
  }
  function renderSessions() {
    sessionList.innerHTML = "";
    if (!state.sessions || !Array.isArray(state.sessions)) return;
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

  // --- Message Rendering ---
  function renderMessages() {
    chatBox.innerHTML = "";
    if (state.currentMessages) {
      state.currentMessages.filter((msg) => msg.role !== "system").forEach((msg) => {
        let content = msg.content;
        let parsedContent = null;
        if (typeof content === "string" && content.trim().startsWith('{')) {
          try {
            const parsed = JSON.parse(content);
            if (parsed && typeof parsed === 'object' && 'answer' in parsed) {
              parsedContent = parsed;
            }
          } catch (e) { /* ignore */ }
        }
        if (parsedContent) {
          renderThinkingMessage(parsedContent);
        } else {
          renderSimpleMessage(content, msg.role);
        }
      });
    }
    chatBox.scrollTop = chatBox.scrollHeight;
  }
  function renderSimpleMessage(content, role) {
    const messageDiv = document.createElement("div");
    messageDiv.classList.add("message", role);
    const markdownContent =
      typeof content === "object" && content !== null ?
      "```json\n" + JSON.stringify(content, null, 2) + "\n```" :
      String(content);
    messageDiv.innerHTML = marked.parse(markdownContent);
    chatBox.appendChild(messageDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
    messageDiv.querySelectorAll('pre code').forEach((block) => {
      hljs.highlightElement(block);
    });
    return messageDiv;
  }
  function renderThinkingMessage(data) {
    const messageDiv = document.createElement("div");
    messageDiv.className = "message assistant";

    const thoughtBlock = (data.thought && data.thought.trim() !== '') ? `
      <div class="thinking-header">
          <span class="timer">思考过程</span>
          <span class="toggle-thought">
              <svg class="arrow" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </span>
      </div>
      <div class="thought-wrapper collapsed">
          <div class="thought-process">${marked.parse(data.thought)}</div>
      </div>
    ` : '';

    messageDiv.innerHTML = `
      ${thoughtBlock}
      <div class="final-answer">${marked.parse(data.answer)}</div>
    `;

    chatBox.appendChild(messageDiv);

    if (data.thought && data.thought.trim() !== '') {
      const header = messageDiv.querySelector(".thinking-header");
      const thoughtWrapper = messageDiv.querySelector(".thought-wrapper");
      header.addEventListener("click", () => {
        thoughtWrapper.classList.toggle("collapsed");
        header.querySelector(".arrow").classList.toggle("down");
      });
    }

    messageDiv.querySelectorAll('pre code').forEach((block) => {
      hljs.highlightElement(block);
    });
    chatBox.scrollTop = chatBox.scrollHeight;
    return messageDiv;
  }

  // --- Chat & API Interaction ---
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
  userInput.addEventListener("input", () => {
    sendButton.disabled = !userInput.value.trim();
  });
  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = userInput.value.trim();
    if (!message || !state.activeSessionId) return;

    sendButton.disabled = true;
    const userMessage = {
      role: "user",
      content: message
    };
    state.currentMessages.push(userMessage);
    renderMessages();
    userInput.value = "";
    userInput.focus();

    await apiRequest(`/api/sessions/${state.activeSessionId}/messages`, {
      method: "POST",
      body: JSON.stringify(userMessage),
    });

    const apiId = modelSelect.value;
    await handleStreamingChat(apiId, message);
    sendButton.disabled = false;
  });

  async function handleStreamingChat(apiId, userMessage) {
    const startTime = Date.now();
    const tempMessageDiv = document.createElement("div");
    tempMessageDiv.className = "message assistant";
    chatBox.appendChild(tempMessageDiv);

    let currentThought = "";
    let currentAnswer = "";

    try {
      const requestResponse = await apiRequest("/api/chat-request", {
        method: "POST",
        body: JSON.stringify({
          messages: state.currentMessages,
          apiId: apiId
        }),
      });
      if (!requestResponse.taskId) throw new Error("未能获取有效的任务ID");
      const {
        taskId
      } = requestResponse;

      await new Promise((resolve, reject) => {
        const intervalId = setInterval(async () => {
          try {
            const pollResponse = await apiRequest(`/api/chat-poll/${taskId}`);
            if (pollResponse.error) {
              clearInterval(intervalId);
              return reject(new Error(pollResponse.error));
            }

            if (pollResponse.fullThought !== currentThought || pollResponse.fullAnswer !== currentAnswer) {
              currentThought = pollResponse.fullThought;
              currentAnswer = pollResponse.fullAnswer;

              const thoughtBlock = (currentThought && currentThought.trim() !== '') ? `
                <div class="thinking-header">
                    <span class="timer">思考过程</span>
                    <span class="toggle-thought">
                        <svg class="arrow" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </span>
                </div>
                <div class="thought-wrapper collapsed">
                    <div class="thought-process">${marked.parse(currentThought)}</div>
                </div>` : '';

              const cursor = pollResponse.done ? "" : "▋";
              tempMessageDiv.innerHTML = `
                ${thoughtBlock}
                <div class="final-answer">${marked.parse(currentAnswer + cursor)}</div>
              `;
              
              // Re-add click listener for thought header if it was just created
              const header = tempMessageDiv.querySelector(".thinking-header");
              if(header) {
                  header.addEventListener('click', () => {
                      const wrapper = tempMessageDiv.querySelector(".thought-wrapper");
                      wrapper.classList.toggle("collapsed");
                      header.querySelector(".arrow").classList.toggle("down");
                  });
              }
              
              chatBox.scrollTop = chatBox.scrollHeight;
            }

            if (pollResponse.done) {
              clearInterval(intervalId);
              resolve();
            }
          } catch (error) {
            clearInterval(intervalId);
            reject(error);
          }
        }, 300);
      });
    } catch (error) {
      tempMessageDiv.innerHTML = `<div class="final-answer"><span style="color: red;">请求处理错误: ${error.message}</span></div>`;
      return;
    } finally {
      tempMessageDiv.remove();
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      const messageData = {
        thought: currentThought,
        answer: currentAnswer,
        duration: duration
      };
      renderThinkingMessage(messageData);

      const finalMessage = {
        role: "assistant",
        content: JSON.stringify(messageData)
      };
      state.currentMessages.push(finalMessage);

      try {
        await apiRequest(`/api/sessions/${state.activeSessionId}/messages`, {
          method: "POST",
          body: JSON.stringify(finalMessage),
        });
        await updateSessionTitle(userMessage);
      } catch (e) {
        console.error("保存最终消息失败:", e);
      }
    }
  }

  async function updateSessionTitle(userMessage) {
    const userMessagesCount = state.currentMessages.filter((msg) => msg.role === "user").length;
    if (userMessagesCount === 1) {
      const newTitle = userMessage.substring(0, 20);
      try {
        await apiRequest(`/api/sessions/${state.activeSessionId}/title`, {
          method: "PUT",
          body: JSON.stringify({
            title: newTitle
          }),
        });
        const sessionToUpdate = state.sessions.find((s) => s.id === state.activeSessionId);
        if (sessionToUpdate) {
          sessionToUpdate.title = newTitle;
          renderSessions();
        }
      } catch (error) {
        console.error("更新标题失败:", error);
      }
    }
  }

  // --- App Initialization ---
  async function initializeApp() {
    state.token = localStorage.getItem("accessToken");
    state.username = localStorage.getItem("username");

    toggleAuthViews(!!state.token);

    await loadApiProviders();

    if (state.token) {
      await loadSessions();
      sendButton.disabled = true;
    }
  }

  initializeApp();
});