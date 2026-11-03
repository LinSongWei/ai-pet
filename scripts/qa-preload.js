"use strict";

// Test-only in-memory bridge. It imports no product main, performs no network
// calls, and never reads or writes the user's settings or credentials.
const listeners = new Map();
const fixedSettings = {
  apiKey: "", baseUrl: "https://example.invalid", model: "qa-offline-mock",
  userName: "旅行者", autoTalk: false, autoTalkMinutes: 120,
  launchAtLogin: false, liveliness: "quiet"
};
function listen(name, callback) {
  if (!listeners.has(name)) listeners.set(name, new Set());
  listeners.get(name).add(callback);
  return () => listeners.get(name)?.delete(callback);
}
window.__ronovaEmit = (name, event) => {
  for (const callback of listeners.get(name) || []) callback(event);
};
window.__ronovaFinish = (result) => {
  const pending = window.__ronovaPending;
  if (!pending) throw new Error("No mocked request is pending.");
  window.__ronovaPending = null;
  pending.resolve(result);
};
window.ronovaAPI = {
  getSettings: async () => ({ ...fixedSettings }),
  saveSettings: async (next) => ({ ...fixedSettings, ...next }),
  chat: (messages, purpose = "chat") => new Promise((resolve) => { window.__ronovaPending = { messages, purpose, resolve }; }),
  cancelChat: () => {},
  onAIEvent: (callback) => listen("ai", callback),
  onPetMessage: (callback) => listen("pet", callback),
  onSettingsChanged: (callback) => listen("settings", callback),
  onCursor: (callback) => listen("cursor", callback),
  onDragMotion: (callback) => listen("drag", callback),
  onDragReleased: (callback) => listen("dragReleased", callback),
  getDesktop: async () => ({ workArea: { x: 0, y: 0, width: 1920, height: 1080 }, petBounds: { x: 1200, y: 700, width: 304, height: 360 } }),
  beginPetDrag: async (requestId) => ({ requestId, cursor: { x: 1300, y: 900 }, petBounds: { x: 1200, y: 700, width: 304, height: 360 } }),
  movePet: () => {}, dragPet: () => {}, endPetDrag: () => {},
  setMousePassthrough: () => {}, showChat: () => {}, hideChat: () => {},
  sendToPet: (message) => window.__ronovaEmit("pet", message), quit: () => {}
};
