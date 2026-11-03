"use strict";

const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage, safeStorage } = require("electron");
const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const { updateDragDirection } = require("./drag-direction");
const { PET_WINDOW_SIZE, constrainPetBounds, petBoundsFromNative } = require("./window-geometry");
const { ALLOWED_EMOTIONS, buildSystemPrompt, detectEmotion, readCompletion, cleanMessages } = require("./ai-client");

app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-gpu-compositing");
app.commandLine.appendSwitch("disable-features", "Vulkan,UseDawn,WebGPU");
app.setName("若娜瓦AI桌宠");
const isTest = process.argv.includes("--smoke-test") || process.argv.includes("--capture-test");
app.setPath("userData", isTest
  ? path.join(process.cwd(), "qa", "test-profile")
  : path.join(app.getPath("appData"), "RonovaAIDesktopPet"));

const defaults = Object.freeze({
  apiKey: "", baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash",
  userName: "旅行者", autoTalk: true, autoTalkMinutes: 5, launchAtLogin: false,
  liveliness: "balanced"
});
let petWindow;
let chatWindow;
let tray;
let cursorTimer;
let dragTimer;
let activeDrag = null;
const requests = new Map();
const iconPath = path.join(__dirname, "../assets/app-icon.ico");

function settingsPath() { return path.join(app.getPath("userData"), "settings.json"); }
function readSettings() {
  try {
    const stored = JSON.parse(fs.readFileSync(settingsPath(), "utf8"));
    let apiKey = typeof stored.apiKey === "string" ? stored.apiKey : "";
    if (stored.apiKeyEncrypted && safeStorage.isEncryptionAvailable()) {
      try { apiKey = safeStorage.decryptString(Buffer.from(stored.apiKeyEncrypted, "base64")); } catch { apiKey = ""; }
    }
    const { apiKeyEncrypted, ...publicSettings } = stored;
    return { ...defaults, ...publicSettings, apiKey };
  } catch { return { ...defaults }; }
}
function writeSettings(next = {}) {
  const previous = readSettings();
  const baseUrl = String(next.baseUrl ?? previous.baseUrl).trim().replace(/\/+$/, "");
  let parsed;
  try { parsed = new URL(baseUrl); } catch { throw new Error("请填写完整接口地址，例如 https://api.deepseek.com。"); }
  if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("接口地址只能使用 HTTP 或 HTTPS，且不能包含账号、查询参数或锚点。");
  }
  const saved = {
    apiKey: String(next.apiKey ?? previous.apiKey).trim(),
    baseUrl,
    model: String(next.model ?? previous.model).trim().slice(0, 160) || defaults.model,
    userName: String(next.userName ?? previous.userName).trim().slice(0, 30) || defaults.userName,
    autoTalk: Boolean(next.autoTalk ?? previous.autoTalk),
    autoTalkMinutes: Math.max(1, Math.min(120, Number(next.autoTalkMinutes ?? previous.autoTalkMinutes) || 5)),
    launchAtLogin: Boolean(next.launchAtLogin ?? previous.launchAtLogin),
    liveliness: ["quiet", "balanced", "lively"].includes(next.liveliness) ? next.liveliness : previous.liveliness
  };
  const stored = { ...saved };
  if (saved.apiKey && safeStorage.isEncryptionAvailable()) {
    stored.apiKeyEncrypted = safeStorage.encryptString(saved.apiKey).toString("base64");
    delete stored.apiKey;
  }
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(`${settingsPath()}.tmp`, JSON.stringify(stored, null, 2), "utf8");
  fs.renameSync(`${settingsPath()}.tmp`, settingsPath());
  if (!isTest && app.isPackaged) app.setLoginItemSettings({ openAtLogin: saved.launchAtLogin });
  return saved;
}

function send(window, channel, data) {
  if (window && !window.isDestroyed() && !window.webContents.isDestroyed()) window.webContents.send(channel, data);
}
function broadcast(channel, data) { send(petWindow, channel, data); send(chatWindow, channel, data); }
function aiEvent(id, purpose, phase, extra = {}) { broadcast("ai:event", { id, purpose, phase, ...extra }); }
function stopRequests(purpose) {
  for (const request of requests.values()) if (!purpose || request.purpose === purpose) request.controller.abort("cancelled");
}

async function requestAI({ messages, purpose: requestedPurpose } = {}) {
  const purpose = requestedPurpose === "monologue" ? "monologue" : "chat";
  const id = randomUUID();
  const settings = readSettings();
  if (!settings.apiKey) {
    const result = { ok: false, id, code: "NO_API_KEY", message: "先在连接设置里填写 DeepSeek API Key，桌面动作仍可正常使用。" };
    aiEvent(id, purpose, "error", result);
    return result;
  }
  if ([...requests.values()].some((request) => request.purpose === purpose)) {
    const result = { ok: false, id, code: "BUSY", message: "这一轮还没有结束，稍候片刻，或先停止生成。" };
    aiEvent(id, purpose, "error", result);
    return result;
  }
  if (purpose === "chat") stopRequests("monologue");
  else if ([...requests.values()].some((request) => request.purpose === "chat")) return { ok: false, id, code: "BUSY", message: "正在聊天，暂缓自言自语。" };
  const controller = new AbortController();
  requests.set(id, { controller, purpose });
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort("timeout"); }, purpose === "monologue" ? 45000 : 120000);
  aiEvent(id, purpose, "start");
  try {
    const url = `${String(settings.baseUrl).replace(/\/+$/, "")}/chat/completions`;
    const response = await fetch(url, {
      method: "POST", signal: controller.signal,
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${settings.apiKey}`, "Accept": "text/event-stream, application/json" },
      body: JSON.stringify({
        model: settings.model,
        messages: [{ role: "system", content: buildSystemPrompt(settings, purpose) }, ...cleanMessages(messages)],
        stream: true, temperature: purpose === "monologue" ? 0.95 : 0.8,
        max_tokens: purpose === "monologue" ? 180 : 1000
      })
    });
    if (!response.ok) {
      const code = response.status;
      try { await response.body?.cancel(); } catch {}
      const descriptions = {
        400: "请求参数不被接口接受，请核对模型名与接口地址。", 401: "API Key 无效或已过期，请在连接设置中检查。",
        402: "账户余额不足，请检查 DeepSeek 账户。", 403: "此接口或模型目前不允许访问。",
        404: "找不到接口或模型，请检查地址与模型名称。", 429: "请求过于频繁或额度暂时受限，稍后再试。"
      };
      const error = new Error(descriptions[code] || (code >= 500 ? "模型服务暂时不可用，请稍后重试。" : `接口返回 HTTP ${code}，请检查连接设置。`));
      error.code = `HTTP_${code}`;
      throw error;
    }
    const message = await readCompletion(response, (text, chunk) => aiEvent(id, purpose, "delta", { text, chunk }), { signal: controller.signal });
    if (!message || !/[\p{L}\p{N}]/u.test(message)) {
      const error = new Error("模型这次没有返回正文，请重试。"); error.code = "EMPTY_RESPONSE"; throw error;
    }
    const result = { ok: true, id, message, emotion: detectEmotion(message) };
    aiEvent(id, purpose, "final", { text: message, message, emotion: result.emotion });
    return result;
  } catch (error) {
    const cancelled = controller.signal.aborted;
    const result = {
      ok: false, id,
      code: cancelled ? (timedOut ? "TIMEOUT" : "CANCELLED") : error.code || "API_ERROR",
      message: cancelled
        ? (timedOut ? "响应等得有些久，已停止这次请求。可以重试，或检查代理与接口设置。" : "这一轮已停止。")
        : error.code ? error.message : "暂时未能连接模型，请检查网络、代理和连接设置后重试。"
    };
    aiEvent(id, purpose, "error", result);
    return result;
  } finally { clearTimeout(timeout); requests.delete(id); }
}

function getPetBounds() {
  return petWindow && !petWindow.isDestroyed() ? petBoundsFromNative(petWindow.getBounds()) : null;
}
function positionPet(x, y, area) {
  const bounds = getPetBounds();
  if (!bounds) return null;
  const next = constrainPetBounds(x, y, area || screen.getDisplayMatching(bounds).workArea);
  if (!next) return null;
  // Passing the explicit design size avoids cumulative DIP <-> native-pixel
  // rounding in setPosition() on fractional Windows display scales.
  petWindow.setBounds(next, false);
  return next;
}
function moveDrag(requestId) {
  if (!activeDrag || !petWindow || petWindow.isDestroyed()) return;
  if (requestId !== undefined && requestId !== activeDrag.requestId) return;
  const state = activeDrag;
  const cursor = screen.getCursorScreenPoint();
  const dx = cursor.x - state.last.x;
  const dy = cursor.y - state.last.y;
  state.last = cursor;
  // Polling a stationary cursor must not resize/reposition the native window.
  if (!dx && !dy) return;
  updateDragDirection(state, dx);
  if (Math.abs(cursor.x - state.start.x) + Math.abs(cursor.y - state.start.y) > 3) state.moved = true;
  // Keep the intended logical position for this drag instead of feeding native
  // floor-rounded x/y back into the next 1-DIP movement. Rebase to the clamped
  // position at an edge so reversing immediately moves away from that edge.
  const next = positionPet(state.position.x + dx, state.position.y + dy,
    screen.getDisplayNearestPoint(cursor).workArea);
  if (next) state.position = { x: next.x, y: next.y };
  if ((dx || dy) && activeDrag === state) send(petWindow, "pet:drag-motion", { requestId: state.requestId, direction: state.direction, moved: state.moved, dx, dy });
}
function endDrag(reason = "released", requestId) {
  if (requestId !== undefined && requestId !== activeDrag?.requestId) return;
  clearInterval(dragTimer);
  dragTimer = null;
  const previous = activeDrag;
  activeDrag = null;
  if (previous) send(petWindow, "pet:drag-released", { requestId: previous.requestId, moved: previous.moved, direction: previous.direction, reason });
}

function createPetWindow() {
  const area = screen.getPrimaryDisplay().workArea;
  petWindow = new BrowserWindow({
    ...PET_WINDOW_SIZE, x: area.x + Math.max(0, area.width - 334), y: area.y + Math.max(0, area.height - 380),
    frame: false, transparent: true, resizable: false, alwaysOnTop: true, skipTaskbar: true, hasShadow: false,
    // Mouse interaction belongs to the overlay; keyboard focus stays with the
    // user's foreground application. Native activation occurs before DOM
    // preventDefault(), so the BrowserWindow itself must be non-focusable.
    focusable: false, show: false,
    icon: iconPath,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false }
  });
  petWindow.setAlwaysOnTop(true, "floating");
  petWindow.once("ready-to-show", () => {
    if (petWindow && !petWindow.isDestroyed()) petWindow.showInactive();
  });
  // Repair initial non-client/DPI rounding once before the renderer is shown.
  positionPet(area.x + Math.max(0, area.width - 334), area.y + Math.max(0, area.height - 380), area);
  petWindow.loadFile(path.join(__dirname, "pet.html"));
  petWindow.on("blur", () => endDrag("blur"));
  petWindow.on("closed", () => { endDrag(); petWindow = null; });
}
function createChatWindow() {
  chatWindow = new BrowserWindow({
    width: 460, height: 700, minWidth: 380, minHeight: 560, show: false,
    title: "若娜瓦 · 余烬之间", backgroundColor: "#151115", icon: iconPath, autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false }
  });
  chatWindow.loadFile(path.join(__dirname, "chat.html"));
  chatWindow.on("close", (event) => { if (!app.isQuitting) { event.preventDefault(); chatWindow.hide(); } });
  chatWindow.on("closed", () => { chatWindow = null; });
}
function showChat() {
  if (!app.isReady()) { app.whenReady().then(showChat); return; }
  if (!chatWindow || chatWindow.isDestroyed()) createChatWindow();
  chatWindow.show(); chatWindow.focus();
}
function returnHome() {
  endDrag("return-home");
  const area = screen.getPrimaryDisplay().workArea;
  positionPet(area.x + area.width - 334, area.y + area.height - 380, area);
  send(petWindow, "pet:message", { emotion: "observe" });
}
function createTray() {
  const image = nativeImage.createFromPath(path.join(__dirname, "../assets/tray.png"));
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
  tray.setToolTip("若娜瓦 · 死之执政的桌面小憩");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "打开「余烬之间」", click: showChat },
    { label: "请她整理羽毛", click: () => send(petWindow, "pet:message", { emotion: "feather" }) },
    { label: "回到屏幕右下角", click: returnHome },
    { type: "separator" },
    { label: "退出若娜瓦桌宠", click: () => { app.isQuitting = true; app.quit(); } }
  ]));
  tray.on("double-click", showChat);
}

const lock = isTest || app.requestSingleInstanceLock();
if (!lock) app.quit();
else app.whenReady().then(() => {
  app.setAppUserModelId("com.personal.ronova.ai.pet");
  createPetWindow(); createChatWindow(); createTray();
  cursorTimer = setInterval(() => {
    if (!petWindow || petWindow.isDestroyed()) return;
    const point = screen.getCursorScreenPoint();
    send(petWindow, "cursor:update", { ...point, bounds: getPetBounds() });
  }, 120);
  screen.on("display-removed", returnHome);
  screen.on("display-metrics-changed", () => {
    if (petWindow && !activeDrag) { const b = getPetBounds(); positionPet(b.x, b.y); }
  });
  if (process.argv.includes("--smoke-test")) setTimeout(() => { app.isQuitting = true; app.quit(); }, 5000);
  if (process.argv.includes("--capture-test")) {
    chatWindow.show();
    setTimeout(async () => {
      try {
        const qa = path.join(process.cwd(), "qa"); fs.mkdirSync(qa, { recursive: true });
        const [chatImage, petImage] = await Promise.all([chatWindow.capturePage(), petWindow.capturePage()]);
        fs.writeFileSync(path.join(qa, "chat.png"), chatImage.toPNG());
        fs.writeFileSync(path.join(qa, "pet.png"), petImage.toPNG());
      } finally { app.isQuitting = true; app.quit(); }
    }, 2400);
  }
});
app.on("second-instance", showChat);
app.on("window-all-closed", () => {});
app.on("before-quit", () => { app.isQuitting = true; clearInterval(cursorTimer); endDrag(); stopRequests(); });

ipcMain.handle("settings:get", readSettings);
ipcMain.handle("settings:save", (_, next) => { const saved = writeSettings(next); broadcast("settings:changed", saved); return saved; });
ipcMain.handle("ai:chat", (_, payload) => requestAI(payload));
ipcMain.on("ai:cancel", (_, { id } = {}) => { if (id) requests.get(id)?.controller.abort("cancelled"); else stopRequests("chat"); });
ipcMain.handle("desktop:info", () => {
  const petBounds = getPetBounds();
  const display = petBounds ? screen.getDisplayMatching(petBounds) : screen.getPrimaryDisplay();
  return { workArea: display.workArea, petBounds };
});
ipcMain.on("pet:move", (_, { x, y } = {}) => { if (!activeDrag) positionPet(x, y); });
ipcMain.handle("pet:drag-start", (_, { requestId } = {}) => {
  if (!petWindow || petWindow.isDestroyed()) return null;
  if (typeof requestId !== "string" || !requestId || requestId.length > 160) return null;
  endDrag("restart");
  const cursor = screen.getCursorScreenPoint();
  const bounds = getPetBounds();
  const position = positionPet(bounds.x, bounds.y) || bounds;
  activeDrag = { requestId, start: cursor, last: cursor, position: { x: position.x, y: position.y }, direction: null, pendingDirection: null, pendingDistance: 0, moved: false };
  dragTimer = setInterval(moveDrag, 16);
  return { requestId, cursor, petBounds: getPetBounds() };
});
ipcMain.on("pet:drag-move", (_, { requestId } = {}) => {
  if (typeof requestId === "string" && requestId === activeDrag?.requestId) moveDrag(requestId);
});
ipcMain.on("pet:drag-end", (_, { requestId } = {}) => {
  if (typeof requestId === "string" && requestId === activeDrag?.requestId) endDrag("released", requestId);
});
ipcMain.on("pet:passthrough", (_, enabled) => petWindow?.setIgnoreMouseEvents(Boolean(enabled), { forward: true }));
ipcMain.on("pet:message", (_, message = {}) => send(petWindow, "pet:message", {
  text: typeof message.text === "string" ? message.text.slice(0, 2000) : "",
  emotion: ALLOWED_EMOTIONS.has(message.emotion) ? message.emotion : undefined
}));
ipcMain.on("chat:show", showChat);
ipcMain.on("chat:hide", () => chatWindow?.hide());
ipcMain.on("app:quit", () => { app.isQuitting = true; app.quit(); });
