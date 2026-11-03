"use strict";

const api = window.ronovaAPI;
const character = window.RONOVA_CHARACTER;
const pet = document.getElementById("pet");
const canvas = document.getElementById("petCanvas");
const context = canvas.getContext("2d", { alpha: true });
const buffer = document.createElement("canvas");
buffer.width = canvas.width; buffer.height = canvas.height;
const bufferContext = buffer.getContext("2d", { alpha: true });
const bubble = document.getElementById("bubble");
const bubbleText = document.getElementById("bubbleText");
const mood = document.getElementById("mood");
const menu = document.getElementById("petMenu");
const effects = document.getElementById("effects");
const aura = document.getElementById("aura");
const hold = (value, n) => Array(n).fill(value);
const gesture = (pause = 5) => [0, 0, 1, 2, 3, 4, 5, 6, ...hold(7, pause), 6, 5, 4, 3, 2, 1, 0, 0];
const animations = {
  idle: { row: 0, fps: 7, frames: [...hold(0, 27), 1, 2, 1, ...hold(0, 24), 3] },
  observe: { row: 0, fps: 3, frames: [4, 4, 4, 0, 4, 4] },
  smile: { row: 0, fps: 3, frames: [5, 5, 5, 0, 5, 5] },
  pout: { row: 0, fps: 3, frames: [6, 6, 6, 0, 6, 6] },
  blush: { row: 0, fps: 3, frames: [7, 7, 7, 5, 7, 7] },
  runRight: { row: 1, fps: 14, frames: [0, 1, 2, 3, 4, 5, 6, 7] },
  runLeft: { row: 2, fps: 14, frames: [0, 1, 2, 3, 4, 5, 6, 7] },
  ledger: { row: 9, fps: 10, frames: gesture(6), settle: true },
  feather: { row: 8, fps: 10, frames: gesture(6), settle: true },
  tea: { row: 5, fps: 10, frames: gesture(7), settle: true },
  verdict: { row: 3, fps: 3, frames: [6, 6, 6, 6, 6, 6] },
  wings: { row: 3, fps: 3, frames: [7, 7, 7, 7, 7, 7] },
  cookie: { row: 6, fps: 10, frames: gesture(6), settle: true },
  hideSnack: { row: 4, fps: 2.7, frames: [2, 2, 2, 3, 3, 2] },
  hug: { row: 7, fps: 10, frames: gesture(14), settle: true },
  doze: { row: 4, fps: 1.6, frames: [6, 6, 7, 7, 7, 7, 7] },
  glide: { row: 3, fps: 3, frames: [7, 7, 7, 7, 7, 7] }
};
let settings = { ...character.settingsDefaults };
let atlas;
let atlasReady = false;
let current = "idle";
const animationClock = window.RonovaAnimation.createAnimationClock(animations);
let drawn = "";
let actionTimer;
let actionGeneration = 0;
let busyUntil = 0;
let drag = null;
let dragSequence = 0;
let roaming = false;
let roamGeneration = 0;
let activeChat = null;
let activeMonologue = null;
let talkTimer;
let cursorNear = false;
let cursorCooldown = 0;
let lastUserInteraction = performance.now();
let passthrough = false;

const speech = window.RonovaSpeech.createSpeech({
  render(data) {
    bubble.classList.remove("hidden");
    bubble.classList.toggle("thinking", data.streaming && data.text === "……");
    document.getElementById("bubbleStatus").textContent = data.status;
    bubbleText.textContent = data.pageText;
    bubbleText.scrollTop = data.streaming ? bubbleText.scrollHeight : 0;
    document.getElementById("pageNumber").textContent = data.pageCount > 1 ? `${data.page + 1} / ${data.pageCount}` : "";
    document.getElementById("nextPage").classList.toggle("hidden", data.pageCount < 2);
    document.getElementById("bubbleHint").textContent = data.streaming ? "正在听她说……" : data.pageCount > 1 ? "分段阅读 · 会自动续页" : "双击她，打开聊天";
  },
  hide() { bubble.classList.add("hidden"); bubble.classList.remove("thinking"); }
});
function say(text, priority = 1, options = {}) { return speech.show(text, { priority, ...options }); }
function random(items) { return items[Math.floor(Math.random() * items.length)]; }
function updateInteraction() { lastUserInteraction = performance.now(); }

function drawFrame(row, column) {
  if (!atlasReady) return;
  const key = `${row}:${column}`;
  if (key === drawn) return;
  drawn = key;
  bufferContext.clearRect(0, 0, canvas.width, canvas.height);
  bufferContext.drawImage(atlas, column * canvas.width, row * canvas.height, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  context.save();
  context.globalCompositeOperation = "copy";
  context.drawImage(buffer, 0, 0);
  context.restore();
}
function setState(name, duration = 0) {
  if (!animations[name]) name = "idle";
  clearTimeout(actionTimer);
  const generation = ++actionGeneration;
  const now = performance.now();
  const sample = animationClock.change(name, now);
  current = sample.name;
  pet.classList.toggle("idling", name === "idle");
  pet.classList.toggle("gliding", name === "glide");
  aura.classList.toggle("active", name === "verdict" || name === "wings" || name === "glide");
  drawFrame(sample.row, sample.column);
  if (duration) {
    busyUntil = performance.now() + duration;
    actionTimer = setTimeout(() => {
      if (generation !== actionGeneration || drag || roaming) return;
      const finish = () => {
        if (generation !== actionGeneration || drag || roaming) return;
        busyUntil = 0; mood.textContent = ""; setState("idle");
      };
      // Finish the lowering/closing phase before leaving a multi-frame gesture.
      // The same single sprite is always rendered; no overlapping fade layers.
      const remaining = animations[current].settle ? animationClock.remaining(performance.now()) : 0;
      if (remaining > 1) {
        busyUntil = performance.now() + remaining;
        actionTimer = setTimeout(finish, remaining);
      } else finish();
    }, duration);
  }
}
function animate(now) {
  const sample = animationClock.sample(now);
  drawFrame(sample.row, sample.column);
  requestAnimationFrame(animate);
}
function particles(symbol = "✦", count = 5, color = "#c85064") {
  for (let i = 0; i < count; i++) {
    const node = document.createElement("i");
    node.className = "particle"; node.textContent = symbol;
    node.style.left = `${65 + Math.random() * 170}px`;
    node.style.top = `${160 + Math.random() * 155}px`;
    node.style.setProperty("--dx", `${(Math.random() - .5) * 65}px`);
    node.style.setProperty("--turn", `${Math.random() * 50 - 25}deg`);
    node.style.setProperty("--color", color);
    effects.appendChild(node); setTimeout(() => node.remove(), 1600);
  }
}
function cancelRoaming() { roamGeneration++; roaming = false; busyUntil = 0; }
function activity(name, { voice = true, priority = 1, interrupt = false } = {}) {
  if (drag) return;
  if (roaming && !interrupt) return;
  if (interrupt) cancelRoaming();
  const type = character.actions[name] ? name : "observe";
  const action = character.actions[type];
  setState(type, action.duration || 6500);
  mood.textContent = action.symbol;
  if (["verdict", "wings", "blush", "hug"].includes(type)) particles(type === "hug" ? "♡" : "✦", 5, action.color);
  if (voice) say(random(action.lines), priority);
}

async function roam({ fast = false, glide = false, bursts = 1, targetPoint } = {}) {
  if (drag || roaming || activeChat || !menu.classList.contains("hidden")) return;
  const generation = ++roamGeneration;
  roaming = true; cursorNear = false;
  try {
    for (let segment = 0; segment < bursts; segment++) {
      const info = await api.getDesktop();
      if (generation !== roamGeneration || drag || !info?.petBounds) break;
      const { workArea: area, petBounds: start } = info;
      const minX = area.x;
      const maxX = area.x + Math.max(0, area.width - start.width);
      const minY = area.y;
      const maxY = area.y + Math.max(0, area.height - start.height);
      const target = {
        x: targetPoint ? Math.max(minX, Math.min(targetPoint.x, maxX)) : minX + Math.random() * (maxX - minX),
        y: targetPoint ? Math.max(minY, Math.min(targetPoint.y, maxY)) : Math.max(minY, maxY - 10 - Math.random() * 105)
      };
      const distance = Math.hypot(target.x - start.x, target.y - start.y);
      if (distance < 40) continue;
      setState(glide ? "glide" : target.x >= start.x ? "runRight" : "runLeft");
      const duration = Math.max(1000, Math.min(fast ? 4300 : 7500, distance * (fast ? 3.2 : 5.1)));
      const began = performance.now();
      let lastParticle = 0;
      const completed = await new Promise(resolve => {
        function step(now) {
          if (generation !== roamGeneration || drag || activeChat) return resolve(false);
          const t = Math.min(1, (now - began) / duration);
          const ease = t * t * (3 - 2 * t);
          api.movePet(start.x + (target.x - start.x) * ease, start.y + (target.y - start.y) * ease);
          if (now - lastParticle > 420) { particles(glide ? "⌁" : "·", 1); lastParticle = now; }
          if (t < 1) requestAnimationFrame(step); else resolve(true);
        }
        requestAnimationFrame(step);
      });
      if (!completed) break;
    }
  } finally {
    if (generation === roamGeneration) { roaming = false; busyUntil = 0; setState("idle"); }
  }
}

function lifeTick() {
  const lively = settings.liveliness === "lively";
  const quiet = settings.liveliness === "quiet";
  const delay = quiet ? 26000 + Math.random() * 23000 : lively ? 9000 + Math.random() * 10000 : 13500 + Math.random() * 15500;
  setTimeout(() => {
    if (!drag && !roaming && !activeChat && !activeMonologue && (speech.snapshot()?.priority ?? 0) < 3 && performance.now() >= busyUntil && menu.classList.contains("hidden")) {
      const roll = Math.random();
      if (roll < (quiet ? .15 : lively ? .46 : .34)) {
        roam({ bursts: lively && Math.random() < .4 ? 2 : 1, fast: Math.random() < .28, glide: Math.random() < .3 });
      } else {
        // Rare private expressions retain the character's primarily dignified manner.
        const duty = ["observe", "ledger", "feather", "tea", "wings", "verdict", "smile"];
        const contrast = ["cookie", "hideSnack", "pout", "blush", "doze"];
        activity(random(Math.random() < .2 ? contrast : duty));
      }
    }
    lifeTick();
  }, delay);
}
function scheduleTalk() {
  clearTimeout(talkTimer);
  const delay = Math.max(1, Number(settings.autoTalkMinutes) || 5) * 60000 * (.85 + Math.random() * .3);
  talkTimer = setTimeout(async () => {
    try {
      if (settings.autoTalk && !activeChat && !activeMonologue && (speech.snapshot()?.priority ?? 0) < 3 && !drag && menu.classList.contains("hidden")) {
        if (settings.apiKey) await api.chat([{ role: "user", content: "你在桌面安静陪伴我。结合此刻的氛围，自言自语一句，不必问我问题。" }], "monologue");
        else say(random(character.selfTalkFallback), 0);
      }
    } finally { scheduleTalk(); }
  }, delay);
}

api.onAIEvent(event => {
  const isChat = event.purpose === "chat";
  const priority = isChat ? 3 : 0;
  if (event.phase === "start") {
    if (isChat) { activeChat = event.id; cancelRoaming(); if (!drag) setState("observe"); }
    else activeMonologue = event.id;
    if (!activeChat || isChat) say("……", priority, { streaming: true, requestId: event.id, status: "片刻思量" });
    return;
  }
  const activeId = isChat ? activeChat : activeMonologue;
  // Failed requests without a start (missing key, busy) should not clear another reply.
  if (activeId && event.id !== activeId) return;
  if (event.phase === "delta") {
    if (!activeChat || isChat) say(event.text, priority, { streaming: true, requestId: event.id, status: "她正在说" });
  } else if (event.phase === "final") {
    if (isChat) activeChat = null; else activeMonologue = null;
    if (isChat || (!activeChat && (speech.snapshot()?.priority ?? 0) < 3)) {
      if (event.emotion && !drag) activity(event.emotion, { voice: false, interrupt: true });
      say(event.text || event.message, priority, { requestId: event.id, status: "余烬低语" });
    }
  } else if (event.phase === "error") {
    if (isChat) activeChat = null; else activeMonologue = null;
    speech.finishRequest(event.id);
    if (!isChat && !activeChat && event.code !== "CANCELLED" && event.code !== "BUSY") say(random(character.selfTalkFallback), 0);
    if (isChat && event.code !== "BUSY") {
      say(event.code === "NO_API_KEY" ? "先打开聊天里的连接设置，把声音接通吧。" : event.code === "CANCELLED" ? "好。余下的话，稍后再说。" : "这次没能把话送达。到聊天窗口看看连接状态吧。", 3, { status: "连接提示" });
      if (!drag) setState("observe", 2200);
    }
  }
});
api.onPetMessage(({ text, emotion }) => {
  updateInteraction();
  if (emotion === "runRight" || emotion === "runLeft") roam({ fast: true });
  else if (emotion) activity(emotion, { voice: !text, priority: 2, interrupt: true });
  if (text) say(text, 3);
});
api.onSettingsChanged(next => { settings = next; scheduleTalk(); });

const menuKeys = ["tea", "ledger", "feather", "verdict", "cookie", "hideSnack", "hug", "blush", "doze", "wings", "glide", "run"];
for (const key of menuKeys) {
  const info = character.actions[key];
  const button = document.createElement("button");
  const symbol = document.createElement("span"); symbol.textContent = info.symbol;
  button.append(symbol, document.createTextNode(info.label));
  button.addEventListener("click", () => {
    menu.classList.add("hidden"); updateInteraction();
    if (key === "glide" || key === "run") {
      say(random(info.lines), 2); cancelRoaming(); roam({ glide: key === "glide", fast: key === "run", bursts: 2 });
    } else activity(key, { priority: 2, interrupt: true });
  });
  document.getElementById("actionButtons").appendChild(button);
}
document.getElementById("openChat").onclick = () => { menu.classList.add("hidden"); api.showChat(); };
document.getElementById("closeMenu").onclick = () => menu.classList.add("hidden");
document.getElementById("nextPage").onclick = () => speech.next();
pet.addEventListener("contextmenu", event => {
  event.preventDefault(); updateInteraction(); cancelRoaming(); releaseDrag();
  setState("observe"); menu.classList.toggle("hidden");
});
pet.addEventListener("dblclick", () => { updateInteraction(); api.showChat(); });
pet.addEventListener("keydown", event => { if (event.key === "Enter") api.showChat(); });

pet.addEventListener("pointerdown", async event => {
  if (event.button !== 0) return;
  event.preventDefault(); updateInteraction(); menu.classList.add("hidden");
  cancelRoaming(); clearTimeout(actionTimer); busyUntil = 0;
  // Capture the pointer before the IPC await so release outside the transparent
  // window still ends a drag, even while its screen position changes.
  const token = { id: event.pointerId, requestId: `drag-${++dragSequence}`, moved: false, direction: null, released: false };
  drag = token; pet.setPointerCapture(event.pointerId);
  pet.classList.add("dragging");
  try {
    const info = await api.beginPetDrag(token.requestId);
    if (drag !== token || token.released || !info) { api.endPetDrag(token.requestId); return; }
  } catch {
    if (drag === token) releaseDrag();
    else api.endPetDrag(token.requestId);
  }
});
pet.addEventListener("pointermove", () => { if (drag) api.dragPet(drag.requestId); });
api.onDragMotion(({ direction, moved, requestId }) => {
  if (!drag || requestId !== drag.requestId) return;
  drag.moved ||= moved;
  if (direction && direction !== drag.direction) {
    drag.direction = direction;
    setState(direction === "right" ? "runRight" : "runLeft");
  }
});
function releaseDrag() {
  if (!drag) return;
  const token = drag; drag = null; token.released = true;
  api.endPetDrag(token.requestId);
  if (pet.hasPointerCapture(token.id)) pet.releasePointerCapture(token.id);
  pet.classList.remove("dragging");
  if (token.moved) { activity("pout", { voice: false }); say(random(character.dragLines), 1); }
  else if (!activeChat) setState("idle");
}
pet.addEventListener("pointerup", releaseDrag);
pet.addEventListener("pointercancel", releaseDrag);
pet.addEventListener("lostpointercapture", event => {
  if (drag && event.pointerId === drag.id && !pet.hasPointerCapture(event.pointerId)) releaseDrag();
});
window.addEventListener("blur", releaseDrag);
window.addEventListener("mouseup", releaseDrag);
if (api.onDragReleased) api.onDragReleased(({ requestId }) => {
  if (drag && requestId === drag.requestId) releaseDrag();
});

api.onCursor(({ x, y, bounds }) => {
  const lx = x - bounds.x, ly = y - bounds.y;
  // Leave normal desktop clicks alone in the transparent corners. Active
  // bubble/menu/pet regions continue receiving all pointer events.
  const overBubble = !bubble.classList.contains("hidden") && lx >= 6 && lx <= 298 && ly >= 2 && ly <= 112;
  const overMenu = !menu.classList.contains("hidden") && lx >= 9 && lx <= 295 && ly >= 80 && ly <= 340;
  const overPet = lx >= 20 && lx <= 284 && ly >= 118 && ly <= 358;
  const shouldPass = !drag && !overPet && !overBubble && !overMenu;
  if (shouldPass !== passthrough) { passthrough = shouldPass; api.setMousePassthrough(shouldPass); }
  if (drag || roaming || activeChat || activeMonologue || (speech.snapshot()?.priority ?? 0) >= 3 || performance.now() < busyUntil || !menu.classList.contains("hidden")) return;
  const distance = Math.hypot(lx - 152, ly - 190);
  const near = distance < 100;
  if (near && !cursorNear && performance.now() > cursorCooldown) {
    cursorNear = true; cursorCooldown = performance.now() + 18000;
    activity(Math.random() < .18 ? "blush" : "observe", { voice: false });
    particles("✧", 2, "#dbba87");
  } else if (!near) cursorNear = false;
  // Occasional approach after the user leaves the cursor nearby, never a jump.
  if (near && performance.now() - lastUserInteraction > 95000 && Math.random() < .008) {
    updateInteraction(); roam({ targetPoint: { x: x - 152, y: bounds.y } });
  }
});

(async function init() {
  try { settings = await api.getSettings(); } catch { /* local desktop behavior remains available */ }
  atlas = new Image(); atlas.decoding = "sync";
  atlas.onload = () => { atlasReady = true; drawn = ""; setState("idle"); };
  atlas.onerror = () => say("形象素材暂未载入。请重新启动桌宠。", 3);
  atlas.src = "../assets/spritesheet.png";
  requestAnimationFrame(animate); lifeTick(); scheduleTalk();
  setTimeout(() => { if (!activeChat && !drag) say(character.startupLine, 1); }, 1500);
})();
