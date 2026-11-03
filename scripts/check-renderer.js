"use strict";

// Run with Electron, not Node:
// electron scripts/check-renderer.js
const { app, BrowserWindow, session } = require("electron");
const fs = require("fs");
const path = require("path");
const assert = require("assert/strict");
const root = path.resolve(__dirname, "..");
const qa = path.join(root, "qa");
fs.mkdirSync(qa, { recursive: true });
app.setPath("userData", path.join(qa, "renderer-profile"));
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-gpu-compositing");
app.commandLine.appendSwitch("disable-features", "Vulkan,UseDawn,WebGPU");
app.commandLine.appendSwitch("no-sandbox");

const windows = [];
const errors = [];
const checks = [];
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check, description, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await check()) return;
    await pause(60);
  }
  throw new Error(`Timed out: ${description}`);
}
async function create(name, width, height) {
  const window = new BrowserWindow({
    width, height, show: false, frame: false, transparent: name === "pet", backgroundColor: name === "pet" ? "#00000000" : "#171216",
    webPreferences: {
      preload: path.join(__dirname, "qa-preload.js"), contextIsolation: false,
      nodeIntegration: false, sandbox: false, backgroundThrottling: false, offscreen: true
    }
  });
  windows.push(window);
  window.webContents.on("console-message", (_event, level, message) => { if (level >= 3) errors.push(`${name}: ${message}`); });
  window.webContents.on("render-process-gone", (_event, details) => errors.push(`${name}: renderer gone (${details.reason})`));
  await window.loadFile(path.join(root, "src", `${name}.html`));
  return window;
}
async function execute(window, code) { return window.webContents.executeJavaScript(code, true); }
async function emit(window, channel, event) {
  return execute(window, `window.__ronovaEmit(${JSON.stringify(channel)}, ${JSON.stringify(event)}); true;`);
}
async function finish(chat, result) { await execute(chat, `window.__ronovaFinish(${JSON.stringify(result)}); true;`); await pause(25); }
async function capture(window, filename) {
  // Hidden transparent surfaces can retain their previous compositor frame.
  // Offscreen rendering plus two paint ticks keeps screenshots aligned with
  // the DOM state already asserted by the checks above.
  await execute(window, "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))");
  await pause(80);
  const image = await window.capturePage();
  assert(!image.isEmpty(), `empty screenshot ${filename}`);
  fs.writeFileSync(path.join(qa, filename), image.toPNG());
}

async function main() {
  await until(async () => fs.existsSync(path.join(root, "assets", "spritesheet.png")), "runtime atlas exists", 30000);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "assets", "manifest.json"), "utf8"));
  await app.whenReady();
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => callback({ cancel: /^https?:|^wss?:/i.test(details.url) }));
  const pet = await create("pet", 304, 360);
  const chat = await create("chat", 460, 700);
  await until(async () => execute(pet, `(() => {
    const c = document.getElementById('petCanvas');
    return c && c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i) => i % 4 === 3 && v > 0);
  })()`), "pet atlas drawn");
  checks.push("actual pet sprite atlas loaded into canvas");
  const atlasInfo = await execute(pet, `({ width: atlas.naturalWidth, height: atlas.naturalHeight, cellWidth: canvas.width, cellHeight: canvas.height })`);
  assert.equal(atlasInfo.width, manifest.columns * manifest.cellWidth, "atlas width must match the manifest");
  assert.equal(atlasInfo.height, manifest.rows * manifest.cellHeight, "atlas height must include every manifest row");
  assert.equal(atlasInfo.cellWidth, manifest.cellWidth);
  assert.equal(atlasInfo.cellHeight, manifest.cellHeight);
  for (let row = 0; row < manifest.rows; row++) {
    for (const column of [0, manifest.columns - 1]) {
      const alphaPixels = await execute(pet, `(() => {
        drawFrame(${row}, ${column});
        const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let alphaPixels = 0;
        for (let i = 3; i < data.length; i += 4) if (data[i] > 0) alphaPixels++;
        return alphaPixels;
      })()`);
      assert(alphaPixels > 100, `manifest frame ${row}-${column} must contain visible character artwork`);
    }
  }
  await execute(pet, "setState('idle'); true;");
  checks.push(`manifest dimensions verified; first/last frames of all ${manifest.rows} rows are nonempty (${manifest.frameCount} frames)`);

  const all = async (event) => { await emit(pet, "ai", event); await emit(chat, "ai", event); };
  const submit = async (text) => {
    await execute(chat, `document.getElementById('input').value=${JSON.stringify(text)}; document.getElementById('composer').requestSubmit(); true;`);
    await until(async () => execute(chat, "Boolean(window.__ronovaPending)"), "mock chat request started");
  };
  const bubble = () => execute(pet, "document.getElementById('bubbleText').textContent");
  const lastReply = () => execute(chat, "Array.from(document.querySelectorAll('article.message.assistant p')).at(-1).textContent");
  const original = "（轻轻别过脸）拥抱？只准片刻。你的疲惫，我看见了。";
  await submit("工作累了，可以拥抱一下吗？");
  await all({ id: "qa-sync", purpose: "chat", phase: "start" });
  assert.equal(await bubble(), "……");
  await all({ id: "qa-sync", purpose: "chat", phase: "delta", text: "（轻轻别过脸）拥抱？", chunk: "（轻轻别过脸）拥抱？" });
  assert.equal(await bubble(), "（轻轻别过脸）拥抱？");
  assert.equal(await lastReply(), "（轻轻别过脸）拥抱？");
  await all({ id: "qa-sync", purpose: "chat", phase: "final", text: original, message: original, emotion: "hug" });
  await finish(chat, { ok: true, id: "qa-sync", message: original });
  assert.equal(await bubble(), original, "hug pose must not replace AI dialogue");
  assert.equal(await lastReply(), original);
  assert.equal(await execute(pet, "document.getElementById('bubble').classList.contains('thinking')"), false);
  checks.push("start/delta/final displayed in both real renderers; hug cannot overwrite original text");
  await capture(chat, "chat.png");
  await capture(pet, "pet.png");

  await submit("继续说吧。");
  await all({ id: "qa-error", purpose: "chat", phase: "start" });
  await all({ id: "qa-error", purpose: "chat", phase: "error", code: "TIMEOUT", message: "离线检查：模拟超时。" });
  await finish(chat, { ok: false, id: "qa-error", code: "TIMEOUT", message: "离线检查：模拟超时。" });
  assert.equal(await execute(pet, "document.getElementById('bubble').classList.contains('thinking')"), false);
  assert.notEqual(await bubble(), "……");
  assert.equal(await lastReply(), "离线检查：模拟超时。");
  checks.push("error clears thinking indicator and reaches chat");

  await emit(pet, "pet", { emotion: "tea" });
  await all({ id: "qa-monologue", purpose: "monologue", phase: "start" });
  await submit("我还有一句话。");
  await all({ id: "qa-priority", purpose: "chat", phase: "start" });
  const priorityText = "我在听。点心的事，稍后再议。";
  await all({ id: "qa-priority", purpose: "chat", phase: "delta", text: priorityText });
  await all({ id: "qa-monologue", purpose: "monologue", phase: "error", code: "CANCELLED", message: "已停止自言自语。" });
  assert.equal(await bubble(), priorityText, "late monologue cancellation must not clear chat bubble");
  await all({ id: "qa-priority", purpose: "chat", phase: "final", text: priorityText, emotion: "observe" });
  await finish(chat, { ok: true, id: "qa-priority", message: priorityText });
  assert.equal(await bubble(), priorityText);
  checks.push("interaction + chat + late monologue error preserves the active conversation");

  await execute(pet, "document.getElementById('pet').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true})); true;");
  assert.equal(await execute(pet, "document.getElementById('petMenu').classList.contains('hidden')"), false);
  await capture(pet, "menu.png");
  await execute(pet, "document.getElementById('petMenu').classList.add('hidden'); activity('tea', {voice:false,interrupt:true}); true;");
  await pause(850);
  await capture(pet, "tea-runtime.png");
  checks.push("multi-frame tea gesture renders from the expanded atlas");
  assert.deepEqual(errors, [], "renderer must not log errors or crash");
  fs.writeFileSync(path.join(qa, "renderer-check.json"), JSON.stringify({ ok: true, checks, atlas: atlasInfo, manifest, screenshots: ["chat.png", "pet.png", "menu.png", "tea-runtime.png"], errors }, null, 2), "utf8");
  console.log(`PASS: ${checks.length} renderer checks; screenshots in ${qa}`);
}

main().catch((error) => {
  fs.writeFileSync(path.join(qa, "renderer-check.json"), JSON.stringify({ ok: false, checks, errors, error: String(error.stack || error) }, null, 2), "utf8");
  console.error(error); process.exitCode = 1;
}).finally(() => {
  for (const window of windows) if (!window.isDestroyed()) window.destroy();
  app.exit(process.exitCode || 0);
});
