const { app, BrowserWindow, Menu, WebContentsView, dialog, ipcMain, session } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { ElectronBlocker } = require("@ghostery/adblocker-electron");

const MUSIC_URL = "https://music.youtube.com/";
const PUBLIC_SERVER_URL = "https://party.dhoniaridho.com";
const LOCAL_SERVER_URL = "http://127.0.0.1:3417";
const PARTITION = "persist:music-party";
let window;
let activeView = "music";
let musicView;
let dashboardView;
let blocker;
let localServer;
let tunnelProcess;
let tunnelUrlPromise;
let serverUrl = LOCAL_SERVER_URL;
let serverMode = "local";
let telegramBotToken = "";
let startupStatus = "Preparing YouTube Music…";

function assetPath(...segments) {
  const root = app.isPackaged ? path.join(process.resourcesPath, "assets") : path.join(__dirname, "../generated/assets");
  return path.join(root, ...segments);
}

function serverPath(...segments) {
  const root = app.isPackaged ? path.join(process.resourcesPath, "server") : path.resolve(__dirname, "../../backend");
  return path.join(root, ...segments);
}

function serverRunnerPath() {
  return app.isPackaged ? serverPath("desktop-server-runner.cjs") : path.join(__dirname, "server-runner.cjs");
}

function validServerUrl(value) {
  const candidate = new URL(value);
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(candidate.hostname);
  if (candidate.protocol !== "https:" && !(candidate.protocol === "http:" && local)) {
    throw new Error("Use an HTTPS server URL, or HTTP for a local server.");
  }
  return candidate.origin;
}

function isLocalServerUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

async function readSettings() {
  let settings = {};
  try {
    settings = JSON.parse(await fs.promises.readFile(path.join(app.getPath("userData"), "settings.json"), "utf8"));
  } catch {
    settings = {};
  }
  const savedUrl = String(settings.serverUrl || "").trim();
  const savedMode = settings.serverMode;
  serverMode = savedMode === "hosted"
    ? "hosted"
    : savedMode === "local" || isLocalServerUrl(savedUrl) || !savedUrl || savedUrl === PUBLIC_SERVER_URL || savedUrl.includes("trycloudflare.com")
      ? "local"
      : "hosted";
  try {
    serverUrl = serverMode === "local" ? LOCAL_SERVER_URL : validServerUrl(savedUrl || PUBLIC_SERVER_URL);
  } catch {
    serverMode = "local";
    serverUrl = LOCAL_SERVER_URL;
  }
  telegramBotToken = settings && Object.hasOwn(settings, "telegramBotToken")
    ? String(settings.telegramBotToken || "").trim()
    : String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
}

async function persistSettings(nextServerUrl, nextTelegramBotToken, nextServerMode) {
  await fs.promises.mkdir(app.getPath("userData"), { recursive: true });
  const settingsPath = path.join(app.getPath("userData"), "settings.json");
  await fs.promises.writeFile(settingsPath,
    `${JSON.stringify({ serverUrl: nextServerUrl, serverMode: nextServerMode, telegramBotToken: nextTelegramBotToken }, null, 2)}\n`,
    { mode: 0o600 });
  if (process.platform !== "win32") await fs.promises.chmod(settingsPath, 0o600);
}

async function startLocalServer() {
  return new Promise((resolve, reject) => {
    let ready = false;
    let startupOutput = "";
    const child = spawn(process.execPath, [serverRunnerPath()], {
      cwd: serverPath(),
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        MUSIC_PARTY_SERVER_DIR: serverPath(),
        MUSIC_PARTY_DATA_DIR: app.getPath("userData"),
        TELEGRAM_BOT_TOKEN: telegramBotToken,
        PORT: "3417",
        DESKTOP_LOCAL_SERVER: "1",
        DATABASE_PROVIDER: "sqlite",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    localServer = child;

    const timeout = setTimeout(() => {
      reject(new Error("The local party server took too long to start."));
    }, 60_000);
    const clearStartupTimeout = () => clearTimeout(timeout);

    child.stdout.on("data", (data) => {
      const output = data.toString();
      process.stdout.write(`[local server] ${output}`);
      startupOutput = (startupOutput + output).slice(-4096);
      if (!ready && startupOutput.includes("DESKTOP_SERVER_READY:3417")) {
        ready = true;
        clearStartupTimeout();
        resolve();
      }
    });
    child.stderr.on("data", (data) => process.stderr.write(`[local server] ${data}`));
    child.once("error", (error) => {
      clearStartupTimeout();
      reject(error);
    });
    child.once("exit", (code) => {
      if (localServer === child) localServer = undefined;
      if (!ready) {
        clearStartupTimeout();
        reject(new Error(`The local party server exited during startup (${code}).`));
      }
    });
  });
}

async function stopLocalServer() {
  const child = localServer;
  if (!child || child.exitCode !== null || child.killed) return;
  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 5_000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    child.kill();
  });
  if (localServer === child) localServer = undefined;
}

async function restartLocalServer() {
  await stopLocalServer();
  await startLocalServer();
}

async function stopQuickTunnel() {
  const child = tunnelProcess;
  if (!child || child.exitCode !== null || child.killed) return;
  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 5_000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    child.kill();
  });
  if (tunnelProcess === child) tunnelProcess = undefined;
}

async function startQuickTunnel() {
  if (tunnelUrlPromise) return tunnelUrlPromise;
  if (tunnelProcess && serverUrl.includes("trycloudflare.com")) return serverUrl;

  const executable = assetPath(process.platform === "win32" ? "cloudflared.exe" : "cloudflared");
  const child = spawn(executable, ["tunnel", "--no-autoupdate", "--url", LOCAL_SERVER_URL], { stdio: ["ignore", "pipe", "pipe"] });
  tunnelProcess = child;

  tunnelUrlPromise = new Promise((resolve, reject) => {
    let settled = false;
    let startupOutput = "";
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        child.kill();
        reject(new Error("Cloudflare Quick Tunnel did not start in time."));
      }
    }, 60_000);
    const inspectOutput = (data) => {
      const output = data.toString();
      startupOutput = (startupOutput + output).slice(-16_384);
      process.stdout.write(`[cloudflared] ${output}`);
      const match = startupOutput.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (!settled && match) {
        settled = true;
        clearTimeout(timeout);
        resolve(match[0]);
      }
    };
    child.stdout.on("data", inspectOutput);
    child.stderr.on("data", inspectOutput);
    child.once("error", (error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(new Error(`Could not start Cloudflare Quick Tunnel. ${error.message}`));
      }
    });
    child.once("exit", (code) => {
      if (tunnelProcess === child) tunnelProcess = undefined;
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        reject(new Error(`Cloudflare Quick Tunnel exited during startup (${code}).`));
      }
    });
  });

  try {
    serverUrl = await tunnelUrlPromise;
    return serverUrl;
  } finally {
    tunnelUrlPromise = undefined;
  }
}

async function saveSettings(values) {
  const enteredUrl = String(values.serverUrl || "").trim();
  const requestedMode = values.serverMode === "tunnel"
    ? "tunnel"
    : isLocalServerUrl(enteredUrl) ? "local" : "hosted";
  const normalizedUrl = requestedMode === "tunnel"
    ? ""
    : requestedMode === "local" ? LOCAL_SERVER_URL : validServerUrl(enteredUrl);
  const nextToken = telegramBotToken;
  const previousUrl = serverUrl;
  const previousMode = serverMode;
  const previousToken = telegramBotToken;
  const hadLocalServer = previousMode === "tunnel" || previousMode === "local";

  try {
    if (requestedMode === "tunnel" || requestedMode === "local") {
      if (!hadLocalServer) await startLocalServer();

      if (requestedMode === "tunnel") {
        if (previousMode !== "tunnel" || !tunnelProcess) {
          await stopQuickTunnel();
          serverUrl = await startQuickTunnel();
        } else {
          serverUrl = previousUrl;
        }
      } else {
        if (previousMode === "tunnel") await stopQuickTunnel();
        serverUrl = normalizedUrl;
      }
    } else {
      if (hadLocalServer) {
        await stopQuickTunnel();
        await stopLocalServer();
      }
      serverUrl = normalizedUrl;
    }
  } catch (error) {
    serverUrl = previousUrl;
    serverMode = previousMode;
    telegramBotToken = previousToken;
    if (previousMode !== "tunnel") await stopQuickTunnel().catch(() => undefined);
    if (!hadLocalServer) await stopLocalServer();
    throw new Error(`Could not start the local server or tunnel. ${error.message || ""}`.trim());
  }

  serverMode = requestedMode;
  await persistSettings(serverUrl, nextToken, serverMode);

  if (dashboardView && !dashboardView.webContents.isDestroyed()) {
    if (serverUrl !== previousUrl) await dashboardView.webContents.loadURL(`${serverUrl}/`);
  }
  if (serverUrl !== previousUrl && musicView && !musicView.webContents.isDestroyed()) {
    const serializedUrl = JSON.stringify(serverUrl);
    await musicView.webContents.executeJavaScript(`localStorage.setItem("partyUrl", ${serializedUrl})`).catch(() => undefined);
    musicView.webContents.reload();
  }
  return { serverUrl, serverMode };
}

async function createInviteTunnel(roomId) {
  const requestedRoomId = String(roomId || "").trim();
  if (!requestedRoomId) throw new Error("Join a room before creating an invite link.");
  if (serverMode === "hosted") return { serverUrl };

  if (!localServer) await startLocalServer();
  const inviteServerUrl = await startQuickTunnel();
  serverUrl = inviteServerUrl;
  serverMode = "tunnel";
  await persistSettings(serverUrl, telegramBotToken, serverMode);
  if (musicView && !musicView.webContents.isDestroyed()) {
    const serializedUrl = JSON.stringify(serverUrl);
    await musicView.webContents.executeJavaScript(`localStorage.setItem("partyUrl", ${serializedUrl})`).catch(() => undefined);
  }
  return { serverUrl };
}

async function saveTelegramToken(value) {
  const previousToken = telegramBotToken;
  const nextToken = String(value || "").trim();
  if (nextToken === previousToken) return { ok: true };

  telegramBotToken = nextToken;
  if (serverMode === "tunnel" || serverMode === "local") {
    try {
      await restartLocalServer();
    } catch (error) {
      telegramBotToken = previousToken;
      await restartLocalServer().catch(() => undefined);
      throw new Error(`Could not restart the local server. ${error.message || ""}`.trim());
    }
  }
  await persistSettings(serverUrl, telegramBotToken, serverMode);
  return { ok: true };
}

function isMusicDestination(value) {
  try {
    const hostname = new URL(value).hostname;
    return hostname === "youtube.com" || hostname.endsWith(".youtube.com") || hostname === "google.com" || hostname.endsWith(".google.com");
  } catch {
    return false;
  }
}

function isServerDestination(value) {
  try {
    return new URL(value).origin === serverUrl;
  } catch {
    return false;
  }
}

async function installAdBlocker(partition) {
  const savedFilters = assetPath("adblock-filters.bin");
  if (fs.existsSync(savedFilters)) {
    blocker = ElectronBlocker.deserialize(fs.readFileSync(savedFilters));
  } else {
    blocker = await ElectronBlocker.fromPrebuiltAdsOnly(globalThis.fetch);
  }
  blocker.enableBlockingInSession(partition);
}

function setActiveView(name) {
  activeView = name === "dashboard" ? "dashboard" : "music";
  musicView.setVisible(activeView === "music");
  dashboardView.setVisible(activeView === "dashboard");
  window.webContents.send("view:changed", activeView);
}

function updateStartupStatus(message) {
  startupStatus = message;
  if (window && !window.webContents.isDestroyed()) window.webContents.send("startup:status", message);
}

function completeStartup() {
  if (window && !window.webContents.isDestroyed()) window.webContents.send("startup:complete");
}

async function loadAppViews() {
  updateStartupStatus("Loading YouTube Music and your party server…");
  await Promise.all([
    musicView.webContents.loadURL(MUSIC_URL),
    dashboardView.webContents.loadURL(`${serverUrl}/`),
  ]);
  musicView.setVisible(true);
  completeStartup();
}

function resizeViews() {
  if (!window || !musicView || !dashboardView) return;
  const [width, height] = window.getContentSize();
  const bounds = { x: 0, y: 0, width, height };
  musicView.setBounds(bounds);
  dashboardView.setBounds(bounds);
}

function makeWindow() {
  window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 760,
    minHeight: 520,
    title: "Music Party",
    backgroundColor: "#030303",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const persistentSession = session.fromPartition(PARTITION);
  musicView = new WebContentsView({
    webPreferences: {
      session: persistentSession,
      preload: path.join(__dirname, "music-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  dashboardView = new WebContentsView({
    webPreferences: { session: persistentSession, contextIsolation: true, nodeIntegration: false, sandbox: true },
  });

  window.contentView.addChildView(musicView);
  window.contentView.addChildView(dashboardView);
  musicView.setVisible(false);
  dashboardView.setVisible(false);
  resizeViews();

  window.on("resize", resizeViews);
  window.webContents.on("did-finish-load", () => {
    window.webContents.send("startup:status", startupStatus);
    window.show();
  });
  window.on("closed", () => {
    window = undefined;
    musicView = undefined;
    dashboardView = undefined;
  });

  musicView.webContents.setWindowOpenHandler(({ url }) => {
    if (isMusicDestination(url)) {
      musicView.webContents.loadURL(url);
      return { action: "deny" };
    }
    return { action: "deny" };
  });
  dashboardView.webContents.setWindowOpenHandler(({ url }) => {
    if (isServerDestination(url)) {
      dashboardView.webContents.loadURL(url);
    }
    return { action: "deny" };
  });

  window.loadFile(path.join(__dirname, "index.html"));
}

ipcMain.on("view:set", (_event, name) => setActiveView(name));
ipcMain.on("settings:open", () => {
  musicView?.setVisible(false);
  dashboardView?.setVisible(false);
  window?.webContents.send("settings:opened", { serverUrl, serverMode });
});
ipcMain.on("settings:get-server-url", (event) => {
  event.returnValue = serverUrl;
});
ipcMain.on("settings:close", () => {
  setActiveView(activeView);
});
ipcMain.handle("settings:save", async (_event, values) => {
  try {
    return await saveSettings(values || {});
  } catch (error) {
    return { error: error.message || "Could not save settings." };
  }
});
ipcMain.handle("tunnel:create-invite", async (_event, roomId) => {
  try {
    return await createInviteTunnel(roomId);
  } catch (error) {
    return { error: error.message || "Could not create a temporary invite link." };
  }
});
ipcMain.on("telegram:open", () => {
  musicView?.setVisible(false);
  dashboardView?.setVisible(false);
  window?.webContents.send("telegram:settings-opened", { telegramBotToken });
});
ipcMain.on("telegram:close", () => {
  setActiveView(activeView);
});
ipcMain.handle("telegram:save", async (_event, value) => {
  try {
    return await saveTelegramToken(value);
  } catch (error) {
    return { error: error.message || "Could not save Telegram settings." };
  }
});
ipcMain.on("view:reload", () => {
  const view = activeView === "music" ? musicView : dashboardView;
  if (view && !view.webContents.isDestroyed()) view.webContents.reload();
});

app.whenReady().then(async () => {
  await readSettings();
  try {
    const partition = session.fromPartition(PARTITION);
    await installAdBlocker(partition);
    await partition.extensions.loadExtension(assetPath("extension"));
    makeWindow();
    if (serverMode === "local") {
      updateStartupStatus("Starting the local party server…");
      await startLocalServer();
    }
    await loadAppViews();
  } catch (error) {
    updateStartupStatus(`Could not start Music Party: ${error.message || String(error)}`);
    dialog.showErrorBox("Music Party could not start", error.message || String(error));
    app.quit();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      makeWindow();
      void loadAppViews().catch((error) => {
        dialog.showErrorBox("Music Party could not start", error.message || String(error));
      });
    }
  });
}).catch((error) => {
  dialog.showErrorBox("Music Party could not start", error.message || String(error));
  app.quit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (tunnelProcess && !tunnelProcess.killed) tunnelProcess.kill();
  if (localServer && !localServer.killed) localServer.kill();
});

app.on("web-contents-created", (_event, contents) => {
  contents.on("will-navigate", (navigationEvent, url) => {
    if (contents !== musicView?.webContents && contents !== dashboardView?.webContents) return;
    const allowed = contents === musicView?.webContents ? isMusicDestination(url) : isServerDestination(url);
    if (!allowed) navigationEvent.preventDefault();
  });
});

const template = [
  ...(process.platform === "darwin" ? [{ role: "appMenu" }] : []),
  {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { type: "separator" },
      { role: "selectAll" },
    ],
  },
  { label: "View", submenu: [{ label: "Reload YouTube Music", accelerator: "CmdOrCtrl+R", click: () => musicView?.webContents.reload() }, { role: "toggleDevTools" }, { type: "separator" }, { role: "zoomIn" }, { role: "zoomOut" }, { role: "resetZoom" }] },
];
Menu.setApplicationMenu(Menu.buildFromTemplate(template));
