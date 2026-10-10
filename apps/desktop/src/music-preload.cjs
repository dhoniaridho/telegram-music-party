const { ipcRenderer } = require("electron");

try {
  const serverUrl = ipcRenderer.sendSync("settings:get-server-url");
  if (serverUrl && window.location.hostname === "music.youtube.com") {
    localStorage.setItem("partyUrl", serverUrl);
  }
} catch {}

window.addEventListener("music-party:open-server-settings", () => {
  ipcRenderer.send("settings:open");
});

window.addEventListener("music-party:open-telegram-settings", () => {
  ipcRenderer.send("telegram:open");
});

window.addEventListener("music-party:create-invite-link", async () => {
  try {
    const roomId = localStorage.getItem("roomId");
    const result = await ipcRenderer.invoke("tunnel:create-invite", roomId);
    localStorage.setItem("music-party:invite-link-result", JSON.stringify(result));
  } catch (error) {
    localStorage.setItem("music-party:invite-link-result", JSON.stringify({ error: error.message || "Could not create a temporary invite link." }));
  }
  window.dispatchEvent(new Event("music-party:invite-link-ready"));
});
