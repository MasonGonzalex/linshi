// public/script.js (Diagnostic Version - Streaming Disabled)
document.addEventListener("DOMContentLoaded", () => {
  // --- 状态管理和DOM选择器 (保持不变) ---
  let state = { sessions: [], activeSessionId: null, token: localStorage.getItem("accessToken"), username: localStorage.getItem("username"), isRegisterMode: false, currentMessages: [], apiProviders: [], };
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
  
  // --- 依赖库配置 (保持不变) ---
  marked.setOptions({
    highlight: function(code, lang) {
      const language = lang && hljs.getLanguage(lang) ? lang : "plaintext";
      try { return hljs.highlight(code, { language: language, ignoreIllegals: true }).value; } catch (e) { try { return hljs.highlightAuto(code).value; } catch (e) { return code; } }
    },
  });

  // --- 认证、侧边栏、会话管理等函数 (全部保持我们上一个稳定版的健壮逻辑) ---
  function toggleAuthModeUI() { authMessage.textContent = ""; if (state.isRegisterMode) { authTitle.textContent = "注册"; authSubmitBtn.textContent = "注册"; switchAuthModeBtn.textContent = "已有账号？点击登录"; } else { authTitle.textContent = "登录"; authSubmitBtn.textContent = "登录"; switchAuthModeBtn.textContent = "没有账号？点击注册"; } }
  switchAuthModeBtn.addEventListener("click", (event) => { event.preventDefault(); state.isRegisterMode = !state.isRegisterMode; toggleAuthModeUI(); });
  authForm.addEventListener("submit", async (event) => { event.preventDefault(); const username = authUsername.value; const password = authPassword.value; const endpoint = state.isRegisterMode ? "/api/auth/register" : "/api/auth/login"; try { const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }), }); const data = await response.json(); if (!response.ok) { throw new Error(data.message || "操作失败"); } if (state.isRegisterMode) { state.isRegisterMode = false; toggleAuthModeUI(); authMessage.style.color = "#0E9F6E"; authMessage.textContent = "注册成功！请登录。"; } else { state.token = data.accessToken; state.username = data.username; localStorage.setItem("accessToken", state.token); localStorage.setItem("username", state.username); initializeApp(); } } catch (error) { authMessage.style.color = "#F05252"; authMessage.textContent = error.message; } });
  logoutBtn.addEventListener("click", function() { state.token = null; state.username = null; state.sessions = []; state.currentMessages = []; state.activeSessionId = null; localStorage.clear(); toggleAuthViews(false); sessionList.innerHTML = ""; chatBox.innerHTML = ""; });
  function toggleAuthViews(isLoggedIn) { if (isLoggedIn) { appContainer.classList.remove("hidden"); authContainer.classList.add("hidden"); usernameDisplay.textContent = state.username; } else { appContainer.classList.add("hidden"); authContainer.classList.remove("hidden"); } }
  historyToggleBtn.addEventListener("click", () => { historyDrawer.classList.toggle("open"); drawerOverlay.classList.toggle("visible"); });
  drawerOverlay.addEventListener("click", () => { historyDrawer.classList.remove("open"); drawerOverlay.classList.remove("visible"); });
  async function apiRequest(url, options = {}) { const defaultHeaders = { "Content-Type": "application/json", ...options.headers, }; if (state.token) { defaultHeaders['x-access-token'] = state.token; } const response = await fetch(url, { ...options, headers: defaultHeaders }); if (response.status === 401) { logoutBtn.click(); throw new Error("登录已过期，请重新登录。"); } const responseText = await response.text(); let data; try { data = responseText ? JSON.parse(responseText) : {}; } catch(e) { if(response.ok) return { _raw: responseText }; throw new Error(`网络请求失败，状态码: ${response.status}`); } if (!response.ok) { throw new Error(data.message || data.error || `请求失败: ${response.status}`); } return data; }
  async function loadSessions() { try { state.sessions = await apiRequest("/api/sessions"); renderSessions(); if (state.sessions && state.sessions.length > 0) { const lastActiveSessionId = localStorage.getItem("lastActiveSessionId"); const sessionExists = state.sessions.some(s => s.id === lastActiveSessionId); const activeSessionId = (lastActiveSessionId && sessionExists) ? lastActiveSessionId : state.sessions[0].id; await loadSessionMessages(activeSessionId); } else { await createNewSession(); } } catch (error) { console.error("加载对话列表失败:", error); } }
  async function createNewSession() { try { const newSession = await apiRequest("/api/sessions", { method: "POST" }); state.sessions.unshift(newSession); await loadSessionMessages(newSession.id); } catch (error) { console.error("创建新对话失败:", error); } }
  newChatBtn.addEventListener("click", createNewSession);
  async function loadSessionMessages(sessionId) { historyDrawer.classList.remove("open"); drawerOverlay.classList.remove("visible"); state.activeSessionId = sessionId; localStorage.setItem("lastActiveSessionId", sessionId); renderSessions(); try { state.currentMessages = await apiRequest(`/api/sessions/${sessionId}/messages`); renderMessages(); userInput.focus(); } catch (error) { console.error(`加载对话 [${sessionId}] 失败:`, error); chatBox.innerHTML = `<div class="message assistant" style="color:red">加载消息失败: ${error.message}</div>`; } }
  function renderSessions() { sessionList.innerHTML = ""; if (!state.sessions || !Array.isArray(state.sessions)) return; state.sessions.forEach((session) => { const listItem = document.createElement("li"); const titleSpan = document.createElement("span"); titleSpan.classList.add("session-title"); titleSpan.textContent = session.title; const timeSpan = document.createElement("span"); timeSpan.classList.add("session-time"); const date = new Date(session.created_at); timeSpan.textContent = date.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, }).replace(/\//g, "-"); listItem.appendChild(titleSpan); listItem.appendChild(timeSpan); listItem.dataset.sessionId = session.id; if (session.id === state.activeSessionId) { listItem.classList.add("active"); } listItem.addEventListener("click", () => loadSessionMessages(session.id)); sessionList.appendChild(listItem); }); }
  function renderMessages() { chatBox.innerHTML = ""; if (!state.currentMessages || !Array.isArray(state.currentMessages)) return; state.currentMessages.filter((msg) => msg.role !== "system").forEach((msg) => { let content = msg.content; let parsedContent = null; if (typeof content === "string" && content.trim().startsWith('{')) { try { const parsed = JSON.parse(content); if (parsed && typeof parsed === 'object' && 'answer' in parsed) { parsedContent = parsed; } } catch (e) { /* ignore parse error */ } } if (parsedContent) { renderThinkingMessage(parsedContent); } else { renderSimpleMessage(content, msg.role); } }); chatBox.scrollTop = chatBox.scrollHeight; }
  function renderSimpleMessage(content, role) { const messageDiv = document.createElement("div"); messageDiv.classList.add("message", role); const markdownContent = typeof content === "object" && content !== null ? "```json\n" + JSON.stringify(content, null, 2) + "\n```" : String(content || ''); messageDiv.innerHTML = marked.parse(markdownContent); chatBox.appendChild(messageDiv); chatBox.scrollTop = chatBox.scrollHeight; messageDiv.querySelectorAll('pre code').forEach((block) => { hljs.highlightElement(block); }); return messageDiv; }
  function renderThinkingMessage(data) { const messageDiv = document.createElement("div"); messageDiv.className = "message assistant"; messageDiv.innerHTML = `<div class="thinking-header"><span class="timer">思考了 ${data.duration} 秒</span><span class="toggle-thought"><svg class="arrow down" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg></span></div><div class="thought-wrapper"><div class="thought-process" style="${data.thought ? "" : "display: none;"}">${marked.parse(data.thought || "")}</div><div class="final-answer">${marked.parse(data.answer || '')}</div></div>`; chatBox.appendChild(messageDiv); const header = messageDiv.querySelector(".thinking-header"); const thoughtWrapper = messageDiv.querySelector(".thought-wrapper"); header.addEventListener("click", () => { thoughtWrapper.classList.toggle("collapsed"); header.querySelector(".arrow").classList.toggle("down"); }); messageDiv.querySelectorAll('pre code').forEach((block) => { hljs.highlightElement(block); }); return messageDiv; }
  async function loadApiProviders() { try { const providers = await apiRequest("/api/providers"); state.apiProviders = providers; modelSelect.innerHTML = ""; providers.forEach((provider, index) => { const option = document.createElement("option"); option.value = provider.id; option.textContent = provider.name; if (index === 0) { option.selected = true; } modelSelect.appendChild(option); }); } catch (error) { console.error("加载 API 列表失败:", error); modelSelect.innerHTML = "<option>加载失败</option>"; } }
  userInput.addEventListener("input", () => { sendButton.disabled = !userInput.value.trim(); });
  async function updateSessionTitle(userMessage) { const userMessagesCount = state.currentMessages.filter((msg) => msg.role === "user").length; if (userMessagesCount === 1) { const newTitle = userMessage.substring(0, 20); try { await apiRequest(`/api/sessions/${state.activeSessionId}/title`, { method: "PUT", body: JSON.stringify({ title: newTitle }), }); const sessionToUpdate = state.sessions.find((s) => s.id === state.activeSessionId); if (sessionToUpdate) { sessionToUpdate.title = newTitle; renderSessions(); } } catch (error) { console.error("更新标题失败:", error); } } }
  async function initializeApp() { if (!state.token) { toggleAuthViews(false); return; } toggleAuthViews(true); await loadApiProviders(); await loadSessions(); userInput.value = ''; sendButton.disabled = true; }
  
  // --- 聊天核心逻辑 ---
  chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = userInput.value.trim();
    if (!message || !state.activeSessionId) return;

    sendButton.disabled = true;
    const userMessage = { role: "user", content: message };
    state.currentMessages.push(userMessage);
    renderMessages();
    userInput.value = "";
    userInput.focus();

    try {
        // 先将用户消息保存到数据库
        await apiRequest(`/api/sessions/${state.activeSessionId}/messages`, {
            method: "POST",
            body: JSON.stringify(userMessage),
        });

        // ======================= 修改的核心在这里 =======================
        // 不再调用复杂的 handleStreamingChat，而是调用一个绝对安全的占位函数
        await handlePlaceholderReply(message);
        // ======================= 修改结束 =======================

    } catch (error) {
        console.error("发送消息或处理回复失败:", error);
        renderSimpleMessage(`错误: ${error.message}`, 'assistant');
    } finally {
        sendButton.disabled = false;
    }
  });

  // ======================= 这是新的、用于诊断的占位函数 =======================
  async function handlePlaceholderReply(userMessage) {
    // 1. 创建一个假的AI回复
    const replyContent = "【诊断模式】流式聊天已禁用。如果能看到此消息，说明应用基础功能正常。问题根源在于流式传输的兼容性。";
    const fakeAiMessage = {
      role: "assistant",
      content: replyContent,
    };

    // 2. 在界面上渲染这个假回复
    renderSimpleMessage(replyContent, 'assistant');
    chatBox.scrollTop = chatBox.scrollHeight;

    // 3. 将这个假回复存入状态和数据库，以保持对话历史的完整性
    state.currentMessages.push(fakeAiMessage);
    await apiRequest(`/api/sessions/${state.activeSessionId}/messages`, {
      method: "POST",
      body: JSON.stringify(fakeAiMessage),
    });

    // 4. 更新标题
    await updateSessionTitle(userMessage);
  }
  // ======================= 函数定义结束 =======================

  // --- 应用初始化 ---
  initializeApp();
});