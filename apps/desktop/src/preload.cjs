const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("musicPartyDesktop", {
  closeSettings: () => ipcRenderer.send("settings:close"),
  saveSettings: (values) => ipcRenderer.invoke("settings:save", values),
  closeTelegramSettings: () => ipcRenderer.send("telegram:close"),
  saveTelegramToken: (token) => ipcRenderer.invoke("telegram:save", token),
  onSettingsOpened: (callback) => {
    const listener = (_event, settings) => callback(settings);
    ipcRenderer.on("settings:opened", listener);
    return () => ipcRenderer.removeListener("settings:opened", listener);
  },
  onTelegramSettingsOpened: (callback) => {
    const listener = (_event, settings) => callback(settings);
    ipcRenderer.on("telegram:settings-opened", listener);
    return () => ipcRenderer.removeListener("telegram:settings-opened", listener);
  },
  onStartupStatus: (callback) => {
    const listener = (_event, message) => callback(message);
    ipcRenderer.on("startup:status", listener);
    return () => ipcRenderer.removeListener("startup:status", listener);
  },
  onStartupComplete: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("startup:complete", listener);
    return () => ipcRenderer.removeListener("startup:complete", listener);
  },
});
