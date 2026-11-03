const { contextBridge, ipcRenderer } = require("electron");

function listen(channel, callback) {
  const handler = (_, data) => callback(data);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld("ronovaAPI", {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  chat: (messages, purpose = "chat") => ipcRenderer.invoke("ai:chat", { messages, purpose }),
  cancelChat: (id) => ipcRenderer.send("ai:cancel", { id }),
  onAIEvent: (callback) => listen("ai:event", callback),
  getDesktop: () => ipcRenderer.invoke("desktop:info"),
  movePet: (x, y) => ipcRenderer.send("pet:move", { x, y }),
  beginPetDrag: (requestId) => ipcRenderer.invoke("pet:drag-start", { requestId }),
  dragPet: (requestId) => ipcRenderer.send("pet:drag-move", { requestId }),
  endPetDrag: (requestId) => ipcRenderer.send("pet:drag-end", { requestId }),
  onDragMotion: (callback) => listen("pet:drag-motion", callback),
  onDragReleased: (callback) => listen("pet:drag-released", callback),
  onCursor: (callback) => listen("cursor:update", callback),
  onPetMessage: (callback) => listen("pet:message", callback),
  sendToPet: (message) => ipcRenderer.send("pet:message", message),
  setMousePassthrough: (enabled) => ipcRenderer.send("pet:passthrough", enabled),
  showChat: () => ipcRenderer.send("chat:show"),
  hideChat: () => ipcRenderer.send("chat:hide"),
  onSettingsChanged: (callback) => listen("settings:changed", callback),
  quit: () => ipcRenderer.send("app:quit")
});
