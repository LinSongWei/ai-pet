"use strict";

const api = window.ronovaAPI;
const messagesEl = document.getElementById("messages");
const form = document.getElementById("composer");
const input = document.getElementById("input");
const panel = document.getElementById("settings");
const sendBtn = document.getElementById("sendBtn");
const stopBtn = document.getElementById("stopBtn");
const connectionStatus = document.getElementById("connectionStatus");
const settingsError = document.getElementById("settingsError");
const fields = ["apiKey", "baseUrl", "model", "userName", "autoTalk", "autoTalkMinutes", "launchAtLogin", "liveliness"];
const history = [];
const replies = new Map();
let pending = false;
let currentId = null;
let configured = false;

function scrollBottom() { messagesEl.scrollTop = messagesEl.scrollHeight; }
function addMessage(role, text = "", error = false) {
  const el = document.createElement("article");
  el.className = `message ${role}${error ? " error" : ""}`;
  if (role === "assistant") {
    const speaker = document.createElement("span");
    speaker.className = "speaker";
    speaker.appendChild(document.createTextNode("RONOVA"));
    const star = document.createElement("i"); star.textContent = "✦"; speaker.appendChild(star);
    el.appendChild(speaker);
  }
  const p = document.createElement("p"); p.textContent = text; el.appendChild(p);
  messagesEl.appendChild(el); scrollBottom();
  return { el, p };
}
function typingNode() {
  const reply = addMessage("assistant");
  const dots = document.createElement("span"); dots.className = "typing";
  for (let i = 0; i < 3; i += 1) dots.appendChild(document.createElement("i"));
  reply.p.appendChild(dots);
  return reply;
}
function status(text, working = false) {
  connectionStatus.classList.toggle("working", working);
  connectionStatus.querySelector("span").textContent = text;
}
function setPending(value) {
  pending = value;
  sendBtn.classList.toggle("hidden", value);
  stopBtn.classList.toggle("hidden", !value);
  document.querySelectorAll(".quick-actions button").forEach((button) => { button.disabled = value; });
  if (!value) { currentId = null; status(configured ? "连接已备好 · 桌面陪伴中" : "未连接 AI · 桌面陪伴中"); }
}

api.onAIEvent((event) => {
  if (event.purpose !== "chat") return;
  if (event.phase === "start") {
    currentId = event.id;
    setPending(true);
    replies.set(event.id, typingNode());
    status("她在斟酌你的话…", true);
    return;
  }
  let reply = replies.get(event.id);
  if (!reply) {
    if (event.phase !== "error") return;
    reply = addMessage("assistant"); replies.set(event.id, reply);
  }
  if (event.phase === "delta") {
    reply.el.classList.add("streaming"); reply.p.textContent = event.text || "";
    status("话语正落在桌边…", true);
  } else if (event.phase === "final") {
    reply.el.classList.remove("streaming"); reply.p.textContent = event.text || event.message || "";
  } else if (event.phase === "error") {
    reply.el.classList.remove("streaming");
    if (event.code === "CANCELLED") {
      reply.el.classList.add("cancelled");
      reply.p.textContent = reply.p.textContent ? `${reply.p.textContent}\n\n（已停止）` : "这一轮已停止。";
    } else { reply.el.classList.add("error"); reply.p.textContent = event.message || "连接暂时中断，请稍后再试。"; }
  }
  scrollBottom();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text || pending) return;
  input.value = "";
  addMessage("user", text);
  history.push({ role: "user", content: text });
  setPending(true); status("正在送达…", true);
  try {
    const result = await api.chat(history, "chat");
    if (result.ok) history.push({ role: "assistant", content: result.message });
    else if (!replies.has(result.id)) addMessage("assistant", result.message, result.code !== "CANCELLED");
    if (history.length > 40) history.splice(0, history.length - 40);
  } catch { addMessage("assistant", "窗口连接暂时中断，请重新打开聊天后再试。", true); }
  finally { setPending(false); input.focus(); }
});
stopBtn.addEventListener("click", () => { api.cancelChat(currentId); status("正在停下这一轮…", true); });
input.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) { event.preventDefault(); form.requestSubmit(); }
});
document.querySelectorAll(".quick-actions button").forEach((button) => {
  button.addEventListener("click", () => {
    if (pending) return;
    input.value = button.dataset.prompt || "";
    api.sendToPet({ emotion: button.dataset.emotion || "observe" });
    form.requestSubmit();
  });
});

async function loadSettings() {
  const settings = await api.getSettings();
  configured = Boolean(settings.apiKey);
  for (const key of fields) {
    const el = document.getElementById(key);
    if (el.type === "checkbox") el.checked = Boolean(settings[key]);
    else el.value = settings[key] ?? "";
  }
  if (!pending) status(configured ? "连接已备好 · 桌面陪伴中" : "未连接 AI · 桌面陪伴中");
}
function closeSettings() {
  panel.classList.add("hidden"); document.getElementById("settingsBtn").focus();
}
document.getElementById("settingsBtn").addEventListener("click", async () => {
  try { await loadSettings(); settingsError.classList.add("hidden"); panel.classList.remove("hidden"); document.getElementById("apiKey").focus(); }
  catch { addMessage("assistant", "暂时无法读取设置，请重新启动桌宠后再试。", true); }
});
document.getElementById("cancelSettings").addEventListener("click", closeSettings);
document.getElementById("toggleKey").addEventListener("click", () => {
  const field = document.getElementById("apiKey");
  field.type = field.type === "password" ? "text" : "password";
  document.getElementById("toggleKey").textContent = field.type === "password" ? "显示" : "隐藏";
});
document.getElementById("saveSettings").addEventListener("click", async () => {
  const button = document.getElementById("saveSettings");
  const settings = {};
  for (const key of fields) {
    const el = document.getElementById(key);
    settings[key] = el.type === "checkbox" ? el.checked : el.type === "number" ? Number(el.value) : el.value.trim();
  }
  button.disabled = true; settingsError.classList.add("hidden");
  try {
    const saved = await api.saveSettings(settings);
    configured = Boolean(saved.apiKey); closeSettings();
    if (!pending) status(configured ? "连接已备好 · 桌面陪伴中" : "未连接 AI · 桌面陪伴中");
  } catch (error) {
    settingsError.textContent = String(error.message || "设置保存失败，请重试。").replace(/^Error invoking remote method '[^']+': Error: /, "");
    settingsError.classList.remove("hidden");
  } finally { button.disabled = false; }
});
panel.addEventListener("click", (event) => { if (event.target === panel) closeSettings(); });
window.addEventListener("keydown", (event) => { if (event.key === "Escape" && !panel.classList.contains("hidden")) closeSettings(); });
api.onSettingsChanged((next) => { configured = Boolean(next.apiKey); });
loadSettings().catch(() => status("桌面陪伴中"));
