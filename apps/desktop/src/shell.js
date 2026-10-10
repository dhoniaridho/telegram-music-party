const tabs = [...document.querySelectorAll("[data-view]")];
const desktop = window.musicPartyDesktop;
const dialog = document.querySelector(".settings-dialog");
const serverInput = document.querySelector("#server-url");
const tokenInput = document.querySelector("#telegram-token");
const serverError = document.querySelector(".settings-error");
const publicServerUrl = "https://party.dhoniaridho.com";

function selectView(name) {
  tabs.forEach((tab) => {
    const selected = tab.dataset.view === name;
    tab.classList.toggle("is-active", selected);
    tab.setAttribute("aria-selected", String(selected));
  });
}

tabs.forEach((tab) => tab.addEventListener("click", () => desktop.setView(tab.dataset.view)));
document.querySelector(".reload").addEventListener("click", () => desktop.reloadView());
document.querySelector(".server-settings").addEventListener("click", () => desktop.openSettings());
document.querySelector(".public-server-button").addEventListener("click", () => {
  serverInput.value = publicServerUrl;
  serverInput.focus();
});
document.querySelector(".dialog-close").addEventListener("click", () => {
  dialog.close();
  desktop.closeSettings();
});
document.querySelector(".cancel-button").addEventListener("click", () => {
  dialog.close();
  desktop.closeSettings();
});
dialog.addEventListener("cancel", () => desktop.closeSettings());

desktop.onSettingsOpened((settings) => {
  serverInput.value = settings.serverUrl;
  tokenInput.value = settings.telegramBotToken || "";
  serverError.hidden = true;
  dialog.showModal();
  serverInput.focus();
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
  const result = await desktop.saveSettings({
    serverUrl: serverInput.value,
    telegramBotToken: tokenInput.value,
  });
  if (result.error) {
    serverError.textContent = result.error;
    serverError.hidden = false;
    return;
  }
  dialog.close();
  desktop.closeSettings();
});

desktop.onViewChanged(selectView);

document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "1") desktop.setView("music");
  if ((event.metaKey || event.ctrlKey) && event.key === "2") desktop.setView("dashboard");
});
