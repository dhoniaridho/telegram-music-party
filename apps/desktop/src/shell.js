const desktop = window.musicPartyDesktop;
const dialog = document.querySelector(".settings-dialog");
const telegramDialog = document.querySelector(".telegram-dialog");
const serverInput = document.querySelector("#server-url");
const serverModeInput = document.querySelector("#server-mode");
const tunnelToggle = document.querySelector("#share-tunnel");
const tokenInput = document.querySelector("#telegram-token");
const serverError = document.querySelector(".settings-error");
const serverProgress = document.querySelector(".settings-progress");
const serverSaveButton = document.querySelector(".settings-form .save-button");
const telegramError = document.querySelector(".telegram-error");
const telegramProgress = document.querySelector(".telegram-progress");
const telegramSaveButton = document.querySelector(".telegram-save");
const startupScreen = document.querySelector(".startup-screen");
const startupStatus = document.querySelector(".startup-status");
let activeServerMode = "local";

desktop.onStartupStatus((message) => {
  startupStatus.textContent = message;
});
desktop.onStartupComplete(() => {
  startupScreen.classList.add("is-hidden");
});

function updateServerSaveButton() {
  serverSaveButton.textContent = serverModeInput.value === "tunnel" && activeServerMode !== "tunnel"
    ? "Start tunnel"
    : "Save settings";
}

function updateTunnelMode() {
  const previousMode = serverModeInput.value;
  serverModeInput.value = tunnelToggle.checked ? "tunnel" : "local";
  serverInput.value = tunnelToggle.checked
    ? previousMode === "tunnel" ? serverInput.value : ""
    : "http://127.0.0.1:3417";
  serverInput.readOnly = true;
  updateServerSaveButton();
}
tunnelToggle.addEventListener("change", updateTunnelMode);
document.querySelector(".hosted-button").addEventListener("click", () => {
  serverModeInput.value = "hosted";
  tunnelToggle.checked = false;
  if (!serverInput.value || serverInput.value.includes("trycloudflare.com") || serverInput.value.includes("127.0.0.1") || serverInput.value.includes("localhost")) {
    serverInput.value = "https://party.dhoniaridho.com";
  }
  serverInput.readOnly = false;
  updateServerSaveButton();
  serverInput.focus();
});
serverInput.addEventListener("input", () => {
  serverModeInput.value = "hosted";
  serverInput.readOnly = false;
  updateServerSaveButton();
});

document.querySelector(".settings-close").addEventListener("click", () => {
  dialog.close();
  desktop.closeSettings();
});
document.querySelector(".settings-cancel").addEventListener("click", () => {
  dialog.close();
  desktop.closeSettings();
});
dialog.addEventListener("cancel", () => desktop.closeSettings());

desktop.onSettingsOpened((settings) => {
  activeServerMode = settings.serverMode;
  serverInput.value = settings.serverUrl;
  serverModeInput.value = settings.serverMode;
  tunnelToggle.checked = settings.serverMode === "tunnel";
  serverInput.readOnly = settings.serverMode !== "hosted";
  serverError.hidden = true;
  serverProgress.hidden = true;
  updateServerSaveButton();
  dialog.showModal();
  (serverInput.readOnly ? tunnelToggle : serverInput).focus();
});

document.querySelector(".telegram-close").addEventListener("click", () => {
  telegramDialog.close();
  desktop.closeTelegramSettings();
});
document.querySelector(".telegram-cancel").addEventListener("click", () => {
  telegramDialog.close();
  desktop.closeTelegramSettings();
});
telegramDialog.addEventListener("cancel", () => desktop.closeTelegramSettings());

desktop.onTelegramSettingsOpened((settings) => {
  tokenInput.value = settings.telegramBotToken || "";
  telegramError.hidden = true;
  telegramProgress.hidden = true;
  telegramDialog.showModal();
  tokenInput.focus();
});

document.querySelector(".token-visibility").addEventListener("click", (event) => {
  const button = event.currentTarget;
  const reveal = tokenInput.type === "password";
  tokenInput.type = reveal ? "text" : "password";
  button.textContent = reveal ? "Hide" : "Show";
  button.setAttribute("aria-pressed", String(reveal));
});

document.querySelector(".settings-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const startingTunnel = serverModeInput.value === "tunnel" && activeServerMode !== "tunnel";
  serverError.hidden = true;
  serverProgress.textContent = startingTunnel
    ? "Starting Cloudflare Quick Tunnel. This can take up to a minute."
    : "Saving server settings…";
  serverProgress.hidden = false;
  serverSaveButton.disabled = true;
  try {
    const result = await desktop.saveSettings({
      serverUrl: serverInput.value,
      serverMode: serverModeInput.value,
    });
    if (result.error) {
      serverError.textContent = result.error;
      serverError.hidden = false;
      return;
    }
    activeServerMode = result.serverMode;
    serverInput.value = result.serverUrl;
    serverModeInput.value = result.serverMode;
    tunnelToggle.checked = result.serverMode === "tunnel";
    serverInput.readOnly = result.serverMode !== "hosted";
    dialog.close();
    desktop.closeSettings();
  } catch (error) {
    serverError.textContent = error instanceof Error ? error.message : "Could not save server settings.";
    serverError.hidden = false;
  } finally {
    serverProgress.hidden = true;
    serverSaveButton.disabled = false;
    updateServerSaveButton();
  }
});

document.querySelector(".telegram-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  telegramError.hidden = true;
  telegramProgress.textContent = "Saving Telegram settings…";
  telegramProgress.hidden = false;
  telegramSaveButton.disabled = true;
  try {
    const result = await desktop.saveTelegramToken(tokenInput.value);
    if (result.error) {
      telegramError.textContent = result.error;
      telegramError.hidden = false;
      return;
    }
    telegramDialog.close();
    desktop.closeTelegramSettings();
  } catch (error) {
    telegramError.textContent = error instanceof Error ? error.message : "Could not save Telegram settings.";
    telegramError.hidden = false;
  } finally {
    telegramProgress.hidden = true;
    telegramSaveButton.disabled = false;
  }
});
