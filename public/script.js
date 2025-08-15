// script.js (最终修正版 v2)
(function() {
'use strict';

// === 全局状态与元素缓存 ===
let globalState = null;
let domElements = {};

// === iOS 14.4 兼容性修复函数 ===
function applyiOS14Fixes() {
	const viewport = document.querySelector('meta[name="viewport"]');
	if (viewport) {
		viewport.setAttribute('content', 'width=device-width, initial-scale=1.0, user-scalable=no, viewport-fit=cover');
	}
}

// === 内存管理优化 ===
function optimizeMemoryUsage() {
	const MAX_MESSAGES_IN_DOM = 50; // 减少DOM中的消息数量
	setInterval(() => {
		const messages = domElements.chatBox?.querySelectorAll('.message') || [];
		if (messages.length > MAX_MESSAGES_IN_DOM) {
			const toRemove = messages.length - MAX_MESSAGES_IN_DOM;
			for (let i = 0; i < toRemove; i++) {
				messages[i].remove();
			}
		}
		if (window.gc) window.gc();
	}, 60000);
}

// === 事件处理优化 - 使用事件委托 ===
function setupOptimizedEventHandlers() {
	document.addEventListener('click', function(e) {
		const target = e.target;
		const closest = target.closest?.bind(target);
		if (!closest) return;
		const newChatBtn = closest('#new-chat-btn');
		if (newChatBtn) { e.preventDefault(); createNewSession(); return; }
		const sessionItem = closest('#session-list li');
		if (sessionItem) { const sessionId = sessionItem.dataset.sessionId; if (sessionId) loadSessionMessages(sessionId); return; }
		const historyToggle = closest('#history-toggle-btn');
		if (historyToggle) { toggleHistoryDrawer(); return; }
		const logoutBtn = closest('#logout-btn');
		if (logoutBtn) { handleLogout(); return; }
		const thinkingHeader = closest('.thinking-header');
		if (thinkingHeader) {
			const wrapper = thinkingHeader.nextElementSibling;
			const arrow = thinkingHeader.querySelector('.arrow');
			if (wrapper && arrow) { wrapper.classList.toggle('collapsed'); arrow.classList.toggle('down'); }
			return;
		}
		const drawerOverlay = closest('#drawer-overlay');
		if (drawerOverlay) { closeHistoryDrawer(); return; }
		const switchAuth = closest('#switch-auth-mode');
		if (switchAuth) { e.preventDefault(); toggleAuthMode(); return; }
	}, { passive: false });

	document.addEventListener('submit', function(e) {
		if (e.target.id === 'auth-form') { e.preventDefault(); handleAuthSubmit(); }
		else if (e.target.id === 'chat-form') { e.preventDefault(); handleChatSubmit(); }
	}, { passive: false });

	domElements.userInput?.addEventListener('input', () => {
		domElements.sendButton.disabled = !domElements.userInput.value.trim();
	}, { passive: true });
}

// === 核心状态管理 ===
function initializeState() {
	globalState = {
		sessions: [],
		activeSessionId: null,
		token: localStorage.getItem("accessToken"),
		username: localStorage.getItem("username"),
		isRegisterMode: false,
		currentMessages: [],
		apiProviders: [],
		isLoading: false,
		isPolling: false // ENHANCEMENT: 新增状态，防止重复轮询
	};
}

// === DOM 元素缓存 ===
function cacheDOMElements() {
	const ids = [
		'app-container', 'auth-container', 'auth-form', 'auth-title',
		'auth-username', 'auth-password', 'auth-submit-btn', 'switch-auth-mode',
		'auth-message', 'new-chat-btn', 'session-list', 'chat-form',
		'user-input', 'chat-box', 'model-select', 'username-display',
		'logout-btn', 'history-toggle-btn', 'history-drawer', 'drawer-overlay'
	];
	ids.forEach(id => {
		const key = id.replace(/-(\w)/g, (_, c) => c.toUpperCase());
		domElements[key] = document.getElementById(id);
	});
	domElements.sendButton = domElements.chatForm?.querySelector('button[type=submit]');
}

// === 库配置优化 ===
function configureLibraries() {
	if (typeof marked !== 'undefined') {
		marked.setOptions({
			highlight: function(code, lang) {
				if (typeof hljs === 'undefined') return code;
				const language = hljs.getLanguage(lang) ? lang : "plaintext";
				try {
					return hljs.highlight(code, { language, ignoreIllegals: true }).value;
				} catch (e) {
					return hljs.highlightAuto(code).value;
				}
			},
			breaks: true, gfm: true
		});
	}
}

// === 认证功能 ===
function toggleAuthMode() {
	globalState.isRegisterMode = !globalState.isRegisterMode;
	updateAuthUI();
}
function updateAuthUI() {
	if (!domElements.authTitle) return;
	domElements.authMessage.textContent = "";
	if (globalState.isRegisterMode) {
		domElements.authTitle.textContent = "注册";
		domElements.authSubmitBtn.textContent = "注册";
		domElements.switchAuthMode.textContent = "已有账号？点击登录";
	} else {
		domElements.authTitle.textContent = "登录";
		domElements.authSubmitBtn.textContent = "登录";
		domElements.switchAuthMode.textContent = "没有账号？点击注册";
	}
}
async function handleAuthSubmit() { /* ... (保持不变) ... */ }
function showAuthMessage(message, type) { /* ... (保持不变) ... */ }
function handleLogout() { /* ... (保持不变) ... */ }
function toggleAuthViews(isLoggedIn) { /* ... (保持不变) ... */ }
// === 侧边栏管理 ===
function toggleHistoryDrawer() { if (!domElements.historyDrawer || !domElements.drawerOverlay) return; domElements.historyDrawer.classList.toggle("open"); domElements.drawerOverlay.classList.toggle("visible"); }
function closeHistoryDrawer() { if (!domElements.historyDrawer || !domElements.drawerOverlay) return; domElements.historyDrawer.classList.remove("open"); domElements.drawerOverlay.classList.remove("visible"); }

// === 网络请求优化 ===
function fetchWithTimeout(url, options = {}, timeout = 20000) {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeout);
	const defaultHeaders = { "Content-Type": "application/json", ...options.headers };
	if (globalState.token) { defaultHeaders["x-access-token"] = globalState.token; }
	return fetch(url, { ...options, headers: defaultHeaders, signal: controller.signal })
		.then(response => {
			clearTimeout(timeoutId);
			if (response.status === 401) { handleLogout(); throw new Error("登录已过期，请重新登录。"); }
			return response;
		})
		.catch(error => { clearTimeout(timeoutId); throw error; });
}

// === 会话管理 ===
async function loadSessions() { /* ... (保持不变) ... */ }
async function createNewSession() { /* ... (保持不变) ... */ }
async function loadSessionMessages(sessionId) { /* ... (保持不变) ... */ }
function renderSessions() { /* ... (保持不变) ... */ }
async function loadSessions() { try { const response = await fetchWithTimeout("/api/sessions"); const sessions = await response.json(); globalState.sessions = sessions; renderSessions(); if (sessions && sessions.length > 0) { const lastActiveSessionId = localStorage.getItem("lastActiveSessionId"); const sessionExists = sessions.some(s => s.id === lastActiveSessionId); const activeSessionId = (lastActiveSessionId && sessionExists) ? lastActiveSessionId : sessions[0].id; await loadSessionMessages(activeSessionId); } else { await createNewSession(); } } catch (error) { console.error("加载对话列表失败:", error); } }
async function createNewSession() { if (globalState.isLoading) return; try { globalState.isLoading = true; const response = await fetchWithTimeout("/api/sessions", { method: "POST" }); const newSession = await response.json(); globalState.sessions.unshift(newSession); renderSessions(); await loadSessionMessages(newSession.id); } catch (error) { console.error("创建新对话失败:", error); } finally { globalState.isLoading = false; } }
async function loadSessionMessages(sessionId) { closeHistoryDrawer(); if (globalState.activeSessionId === sessionId && globalState.currentMessages.length > 0) return; globalState.activeSessionId = sessionId; localStorage.setItem("lastActiveSessionId", sessionId); renderSessions(); try { const response = await fetchWithTimeout(`/api/sessions/${sessionId}/messages`); globalState.currentMessages = await response.json(); renderMessages(); if (domElements.userInput) { domElements.userInput.focus(); } } catch (error) { console.error(`加载对话 [${sessionId}] 失败:`, error); if (domElements.chatBox) { domElements.chatBox.innerHTML = `<div class=\"message assistant\" style=\"color:red\">加载消息失败: ${error.message}</div>`; } } }
function renderSessions() { if (!domElements.sessionList || !globalState.sessions) return; const fragment = document.createDocumentFragment(); globalState.sessions.forEach((session) => { const listItem = document.createElement("li"); listItem.dataset.sessionId = session.id; const titleSpan = document.createElement("span"); titleSpan.className = "session-title"; titleSpan.textContent = session.title; const timeSpan = document.createElement("span"); timeSpan.className = "session-time"; const date = new Date(session.created_at); timeSpan.textContent = date.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, }).replace(/\//g, "-"); if (session.id === globalState.activeSessionId) { listItem.classList.add("active"); } listItem.appendChild(titleSpan); listItem.appendChild(timeSpan); fragment.appendChild(listItem); }); domElements.sessionList.innerHTML = ""; domElements.sessionList.appendChild(fragment); }

// === 消息渲染优化 ===
function renderMessages() {
	if (!domElements.chatBox) return;
	domElements.chatBox.innerHTML = "";
	if (globalState.currentMessages) {
		const fragment = document.createDocumentFragment();
		globalState.currentMessages
			.filter((msg) => msg.role !== "system")
			.forEach((msg) => {
				let messageElement;
				try {
					const parsedContent = JSON.parse(msg.content);
					messageElement = (parsedContent && typeof parsedContent === 'object' && 'answer' in parsedContent)
						? createThinkingMessage(parsedContent)
						: createSimpleMessage(msg.content, msg.role);
				} catch (e) {
					messageElement = createSimpleMessage(msg.content, msg.role);
				}
				fragment.appendChild(messageElement);
			});
		domElements.chatBox.appendChild(fragment);
	}
	scrollToBottom();
}
function createSimpleMessage(content, role) { /* ... (保持不变) ... */ }
function createThinkingMessage(data) { /* ... (保持不变) ... */ }
function scrollToBottom() { if (domElements.chatBox) { domElements.chatBox.scrollTop = domElements.chatBox.scrollHeight; } }
function createSimpleMessage(content, role) { const messageDiv = document.createElement("div"); messageDiv.className = `message ${role}`; if (typeof marked !== 'undefined') { messageDiv.innerHTML = marked.parse(String(content)); } else { messageDiv.textContent = content; } requestAnimationFrame(() => { if (typeof hljs !== 'undefined') { messageDiv.querySelectorAll('pre code').forEach((block) => { hljs.highlightElement(block); }); } }); return messageDiv; }
function createThinkingMessage(data) { const messageDiv = document.createElement("div"); messageDiv.className = "message assistant"; const thoughtBlock = (data.thought && data.thought.trim() !== '') ? ` <div class=\"thinking-header\"> <span class=\"timer\">思考过程 ${data.duration ? `(${data.duration}秒)` : ''}</span> <span class=\"toggle-thought\"> <svg class=\"arrow\" xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"6 9 12 15 18 9\"></polyline></svg> </span> </div> <div class=\"thought-wrapper collapsed\"> <div class=\"thought-process\"></div> </div> ` : ''; messageDiv.innerHTML = ` ${thoughtBlock} <div class=\"final-answer\"></div> `; requestAnimationFrame(() => { if (data.thought && data.thought.trim() !== '' && typeof marked !== 'undefined') { const thoughtDiv = messageDiv.querySelector(".thought-process"); if (thoughtDiv) { thoughtDiv.innerHTML = marked.parse(data.thought); } } const answerDiv = messageDiv.querySelector(".final-answer"); if (answerDiv && typeof marked !== 'undefined') { answerDiv.innerHTML = marked.parse(data.answer); } if (typeof hljs !== 'undefined') { messageDiv.querySelectorAll('pre code').forEach((block) => { hljs.highlightElement(block); }); } }); return messageDiv; }

// === API 提供商管理 ===
async function loadApiProviders() { /* ... (保持不变) ... */ }
async function loadApiProviders() { try { const response = await fetchWithTimeout("/api/providers"); const providers = await response.json(); globalState.apiProviders = providers; if (domElements.modelSelect) { domElements.modelSelect.innerHTML = ""; providers.forEach((provider, index) => { const option = document.createElement("option"); option.value = provider.id; option.textContent = provider.name; if (index === 0) option.selected = true; domElements.modelSelect.appendChild(option); }); } } catch (error) { console.error("加载 API 列表失败:", error); if (domElements.modelSelect) { domElements.modelSelect.innerHTML = "<option>加载失败</option>"; } } }

// === 聊天功能优化 ===
async function handleChatSubmit() {
	if (globalState.isLoading) return;
	const message = domElements.userInput.value.trim();
	if (!message || !globalState.activeSessionId) return;

	globalState.isLoading = true;
	domElements.sendButton.disabled = true;

	const userMessage = { role: "user", content: message };
	globalState.currentMessages.push(userMessage);
	renderMessages();

	domElements.userInput.value = "";
	domElements.userInput.focus();

	try {
		await fetchWithTimeout(`/api/sessions/${globalState.activeSessionId}/messages`, {
			method: "POST", body: JSON.stringify(userMessage)
		});

		const apiId = domElements.modelSelect.value;
		await handleStreamingChat(apiId, message);
	} catch (error) {
		console.error("发送消息失败:", error);
		showChatError(error.message);
	} finally {
		globalState.isLoading = false;
		domElements.sendButton.disabled = false;
	}
}

async function handleStreamingChat(apiId, userMessage) {
	const startTime = Date.now();
	const assistantMessageDiv = document.createElement("div");
	assistantMessageDiv.className = "message assistant";
	domElements.chatBox.appendChild(assistantMessageDiv);

	let currentThought = "";
	let currentAnswer = "";

	// FIX: 高效DOM更新，只创建一次结构
	assistantMessageDiv.innerHTML = `
	  <div class="thinking-header">
		  <span class="timer">思考中...</span>
		  <span class="toggle-thought">
			  <svg class="arrow" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
		  </span>
	  </div>
	  <div class="thought-wrapper collapsed"><div class="thought-process"></div></div>
	  <div class="final-answer"><span class="answer-content"></span><span class="streaming-cursor"></span></div>
	`;
	const timerElement = assistantMessageDiv.querySelector(".timer");
	const thoughtElement = assistantMessageDiv.querySelector(".thought-process");
	const answerContentElement = assistantMessageDiv.querySelector(".answer-content");
	const cursorElement = assistantMessageDiv.querySelector(".streaming-cursor");

	const timerInterval = setInterval(() => {
		const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
		if (timerElement) timerElement.textContent = `思考中 ${elapsed} 秒`;
	}, 200);

	try {
		const requestResponse = await fetchWithTimeout("/api/chat-request", {
			method: "POST", body: JSON.stringify({ messages: globalState.currentMessages, apiId: apiId })
		});
		const requestData = await requestResponse.json();
		if (!requestData.taskId) throw new Error("未能获取有效的任务ID");
		const { taskId } = requestData;

		// FIX: 使用递归setTimeout实现健壮的轮询
		await pollForResults(taskId, (pollData) => {
			// ENHANCEMENT: 增量更新，避免重绘
			if (pollData.fullThought && pollData.fullThought !== currentThought) {
				currentThought = pollData.fullThought;
				thoughtElement.innerHTML = marked.parse(currentThought);
			}
			if (pollData.fullAnswer && pollData.fullAnswer !== currentAnswer) {
				currentAnswer = pollData.fullAnswer;
				answerContentElement.innerHTML = marked.parse(currentAnswer);
			}
			scrollToBottom();
		});

	} catch (error) {
		console.error("聊天请求错误:", error);
		answerContentElement.innerHTML = `<span style="color: red;">请求处理错误: ${error.message}</span>`;
	} finally {
		clearInterval(timerInterval);
		const duration = ((Date.now() - startTime) / 1000).toFixed(1);
		if (timerElement) timerElement.textContent = `思考了 ${duration} 秒`;

		// FIX: 完成后移除光标并高亮代码
		if (cursorElement) cursorElement.remove();
		if (typeof hljs !== 'undefined') {
			assistantMessageDiv.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
		}

		const messageData = { thought: currentThought, answer: currentAnswer, duration: duration };
		const finalMessage = { role: "assistant", content: JSON.stringify(messageData) };

		globalState.currentMessages.push(finalMessage);

		try {
			await fetchWithTimeout(`/api/sessions/${globalState.activeSessionId}/messages`, {
				method: "POST", body: JSON.stringify(finalMessage)
			});
			await updateSessionTitle(userMessage);
		} catch (e) {
			console.error("保存最终消息失败:", e);
		}
	}
}

// ENHANCEMENT: 健壮的、可暂停的轮询函数
function pollForResults(taskId, onProgress) {
	if (globalState.isPolling) return Promise.reject("已经在轮询中");
	globalState.isPolling = true;

	let pollCount = 0;
	const maxPolls = 300; // 约2分钟超时

	return new Promise((resolve, reject) => {
		const poll = async () => {
			if (document.hidden) { // 如果页面不可见，则延迟下一次轮询
				setTimeout(poll, 1000);
				return;
			}

			try {
				pollCount++;
				if (pollCount > maxPolls) return reject(new Error("请求超时"));

				const pollResponse = await fetchWithTimeout(`/api/chat-poll/${taskId}`, {}, 10000);

				// FIX: 处理任务ID失效（服务器重启）的情况
				if (pollResponse.status === 404) {
					return reject(new Error("对话已过期或服务器已重启，请重新发送。"));
				}

				const pollData = await pollResponse.json();

				if (pollData.error) return reject(new Error(pollData.error));

				if (onProgress) onProgress(pollData);

				if (pollData.done) {
					resolve();
				} else {
					setTimeout(poll, 300); // 调整轮询间隔为300ms
				}
			} catch (error) {
				reject(error);
			}
		};
		poll();
	}).finally(() => {
		globalState.isPolling = false;
	});
}

function showChatError(message) { /* ... (保持不变) ... */ }
async function updateSessionTitle(userMessage) { /* ... (保持不变) ... */ }
function showChatError(message) { if (!domElements.chatBox) return; const errorDiv = document.createElement("div"); errorDiv.className = "message assistant"; errorDiv.innerHTML = `<div class="final-answer" style="color: red;">错误: ${message}</div>`; domElements.chatBox.appendChild(errorDiv); scrollToBottom(); }
async function updateSessionTitle(userMessage) { const userMessagesCount = globalState.currentMessages.filter((msg) => msg.role === "user").length; if (userMessagesCount === 1) { const newTitle = userMessage.substring(0, 20); try { await fetchWithTimeout(`/api/sessions/${globalState.activeSessionId}/title`, { method: "PUT", body: JSON.stringify({ title: newTitle }) }); const sessionToUpdate = globalState.sessions.find((s) => s.id === globalState.activeSessionId); if (sessionToUpdate) { sessionToUpdate.title = newTitle; renderSessions(); } } catch (error) { console.error("更新标题失败:", error); } } }

// === 应用初始化 ===
async function initializeApp() {
	globalState.token = localStorage.getItem("accessToken");
	globalState.username = localStorage.getItem("username");

	const loadingScreen = document.getElementById('loading-screen');
	if (loadingScreen) {
		loadingScreen.style.opacity = '0';
		setTimeout(() => loadingScreen.remove(), 500);
	}

	toggleAuthViews(!!globalState.token);

	if (globalState.token) {
		try {
			await Promise.all([ loadApiProviders(), loadSessions() ]);
			if (domElements.sendButton) { domElements.sendButton.disabled = true; }
		} catch (e) { console.error("加载用户数据时出错:", e); }
	}
}

// === 主启动函数 ===
function main() {
	applyiOS14Fixes();
	initializeState();
	cacheDOMElements();

	if (!domElements.authUsername || !domElements.authPassword) {
		console.error("FATAL: Auth elements not found. Initialization stopped.");
		return;
	}

	configureLibraries();
	setupOptimizedEventHandlers();
	optimizeMemoryUsage();
	updateAuthUI();

	initializeApp().catch((error) => console.error("应用初始化失败:", error));
}

// FIX: 在DOM加载后执行主函数
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', main);
} else {
	main();
}

})();
