const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("musicPartyDesktop", {
  setView: (name) => ipcRenderer.send("view:set", name),
  reloadView: () => ipcRenderer.send("view:reload"),
  openSettings: () => ipcRenderer.send("settings:open"),
  closeSettings: () => ipcRenderer.send("settings:close"),
  saveSettings: (values) => ipcRenderer.invoke("settings:save", values),
  onViewChanged: (callback) => {
    const listener = (_event, name) => callback(name);
    ipcRenderer.on("view:changed", listener);
    return () => ipcRenderer.removeListener("view:changed", listener);
  },
  onSettingsOpened: (callback) => {
    const listener = (_event, settings) => callback(settings);
    ipcRenderer.on("settings:opened", listener);
    return () => ipcRenderer.removeListener("settings:opened", listener);
  },
});
