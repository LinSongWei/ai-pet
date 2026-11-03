"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const handles = new Map();
const events = new Map();
const timers = new Map();
const sent = [];
let nextTimer = 0;
let cursor = { x: 400, y: 300 };
let bounds = { x: 300, y: 100, width: 304, height: 360 };
let area = { x: 0, y: 0, width: 1920, height: 1080 };
let scaleFactor = 1;
let nativeWrites = 0;
const noop = () => {};
const electron = {
  app: {
    disableHardwareAcceleration: noop, commandLine: { appendSwitch: noop }, setName: noop,
    setPath: noop, getPath: () => "C:\\qa-offline-only", requestSingleInstanceLock: () => true,
    whenReady: () => ({ then: noop }), on: noop, isReady: () => false
  },
  ipcMain: { handle: (name, fn) => handles.set(name, fn), on: (name, fn) => events.set(name, fn) },
  screen: { getCursorScreenPoint: () => ({ ...cursor }), getDisplayNearestPoint: () => ({ workArea: area }), getDisplayMatching: () => ({ workArea: area }), getPrimaryDisplay: () => ({ workArea: area }) }
};
const context = {
  console, URL, AbortController, Buffer,
  process: { argv: [], cwd: () => root }, __dirname: path.join(root, "src"),
  setInterval(fn) { const id = ++nextTimer; timers.set(id, fn); return id; },
  clearInterval(id) { timers.delete(id); }, setTimeout, clearTimeout,
  require(name) {
    if (name === "electron") return electron;
    if (name === "fs") return { readFileSync() { throw new Error("Drag QA must never read product settings."); } };
    if (name.startsWith("./")) return require(path.join(root, "src", name));
    return require(name);
  }
};
// Execute real main-process handlers against a fake Electron surface. App-ready
// is intentionally never fired: no real windows, config or network are touched.
vm.runInNewContext(fs.readFileSync(path.join(root, "src", "main.js"), "utf8") + `
globalThis.dragQA = { injectWindow: value => { petWindow = value; }, state: () => activeDrag, moveDrag, endDrag };
`, context);
context.dragQA.injectWindow({
  isDestroyed: () => false,
  getBounds: () => ({ ...bounds }),
  setPosition() { throw new Error("Native setPosition must not re-enter the fractional-DPI size feedback loop."); },
  setBounds(next) {
    nativeWrites++;
    // Emulate the real Windows native-pixel -> DIP floor/ceil round-trip.
    const floorCoordinate = value => Math.floor(Math.floor(value * scaleFactor) / scaleFactor);
    bounds = {
      x: floorCoordinate(next.x), y: floorCoordinate(next.y),
      width: next.width + (scaleFactor % 1 ? 1 : 0),
      height: next.height + (scaleFactor % 1 ? 1 : 0)
    };
  },
  webContents: { isDestroyed: () => false, send(channel, data) { sent.push({ channel, data }); } }
});

const start = (id) => handles.get("pet:drag-start")({}, { requestId: id });
const move = (id) => events.get("pet:drag-move")({}, { requestId: id });
const end = (id) => events.get("pet:drag-end")({}, { requestId: id });

assert.equal(start(undefined), null);
assert.equal(context.dragQA.state(), null);
assert.equal(start("drag-1").requestId, "drag-1");
assert.equal(timers.size, 1);
assert.equal(start("drag-2").requestId, "drag-2");
assert.equal(timers.size, 1, "restarting drag must clear the old polling timer");
const restarted = sent.find((item) => item.channel === "pet:drag-released");
assert.equal(restarted.data.requestId, "drag-1");
assert.equal(restarted.data.reason, "restart");

cursor = { x: 430, y: 320 };
const before = { ...bounds };
move("drag-1"); end("drag-1");
assert.equal(context.dragQA.state().requestId, "drag-2", "a late release must not end a newer drag");
assert.deepEqual(bounds, before, "a late move must not move a newer drag");
move("drag-2");
assert.equal(bounds.x, before.x + 30);
assert.equal(bounds.y, before.y + 20);
const motion = sent.findLast((item) => item.channel === "pet:drag-motion");
assert.equal(motion.data.requestId, "drag-2");
assert.equal(motion.data.direction, "right");

cursor = { x: 440, y: 325 };
context.dragQA.moveDrag();
assert.equal(bounds.x, before.x + 40, "the internal polling timer must still move the active drag without an external ID");
end("drag-2");
assert.equal(context.dragQA.state(), null);
assert.equal(timers.size, 0);
assert.equal(sent.findLast((item) => item.channel === "pet:drag-released").data.requestId, "drag-2");
start("drag-3");
context.dragQA.endDrag("blur");
assert.equal(context.dragQA.state(), null);
assert.equal(timers.size, 0);
const blurred = sent.findLast((item) => item.channel === "pet:drag-released");
assert.equal(blurred.data.requestId, "drag-3");
assert.equal(blurred.data.reason, "blur");

for (const factor of [1, 1.25, 1.5, 2]) {
  scaleFactor = factor;
  area = { x: 0, y: 0, width: Math.round(2560 / factor), height: Math.round(1440 / factor) };
  bounds = { x: 400, y: 200, width: 9000, height: 9000 };
  cursor = { x: 500, y: 300 };
  const id = `scale-${factor}`;
  start(id);
  assert(bounds.width <= 305 && bounds.height <= 361, "starting a drag repairs an already bloated native window");
  const initialWrites = nativeWrites;
  for (let n = 0; n < 300; n++) context.dragQA.moveDrag();
  assert.equal(nativeWrites, initialWrites, "stationary polling must not issue native move/resize calls");
  for (let n = 0; n < 180; n++) {
    cursor.x += 1;
    move(id);
  }
  assert(bounds.x >= 578 && bounds.x <= 580, "1-DIP movements must accumulate logically instead of being eaten by floor rounding");
  for (let n = 0; n < 3000; n++) {
    cursor.x += 3; cursor.y += 3;
    move(id);
  }
  assert(bounds.width <= 305 && bounds.height <= 361, "native size must not accumulate even after thousands of moves");
  const desktop = handles.get("desktop:info")();
  assert.equal(desktop.petBounds.width, 304);
  assert.equal(desktop.petBounds.height, 360);
  assert(Math.abs(bounds.x - (area.width - 304)) < 2, "right edge remains reachable");
  assert(Math.abs(bounds.y - (area.height - 360)) < 2, "bottom edge remains reachable");
  const edge = { x: bounds.x, y: bounds.y };
  cursor.x -= 10; cursor.y -= 10;
  move(id);
  assert(bounds.x < edge.x && bounds.y < edge.y, "reverse motion immediately leaves the clamped edge");
  end(id);
}

scaleFactor = 1.25;
area = { x: -1536, y: -240, width: 1536, height: 864 };
bounds = { x: -1200, y: -100, width: 305, height: 361 };
cursor = { x: -1100, y: 0 };
start("negative-monitor");
cursor = { x: -9000, y: -9000 }; move("negative-monitor");
assert.equal(bounds.x, area.x);
assert.equal(bounds.y, area.y);
cursor = { x: 10000, y: 10000 }; move("negative-monitor");
assert(Math.abs(bounds.x - (area.x + area.width - 304)) < 2);
assert(Math.abs(bounds.y - (area.y + area.height - 360)) < 2);
end("negative-monitor");

scaleFactor = 1;
area = { x: 30, y: 50, width: 200, height: 200 };
bounds = { x: 30, y: 50, width: 304, height: 360 };
cursor = { x: 100, y: 100 };
start("narrow-area");
cursor = { x: 1000, y: 1000 }; move("narrow-area");
assert.equal(bounds.x, 30);
assert.equal(bounds.y, 50);
end("narrow-area");

console.log("Drag IPC checks passed: request isolation, fixed design size, stationary polling, 100/125/150/200% DIP rounding, thousands of moves, edge reversal, negative monitor coordinates and narrow work areas.");
