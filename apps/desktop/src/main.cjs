const { app, BrowserWindow, Menu, WebContentsView, dialog, ipcMain, session } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { ElectronBlocker } = require("@ghostery/adblocker-electron");

const MUSIC_URL = "https://music.youtube.com/";
const DEFAULT_SERVER_URL = "https://party.dhoniaridho.com";
const PARTITION = "persist:music-party";
const TOOLBAR_HEIGHT = 58;

let window;
let activeView = "music";
let musicView;
let dashboardView;
let blocker;
let localServer;
let serverUrl = DEFAULT_SERVER_URL;
let telegramBotToken = "";

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
  try { serverUrl = validServerUrl(settings.serverUrl || DEFAULT_SERVER_URL); }
  catch { serverUrl = DEFAULT_SERVER_URL; }
  telegramBotToken = settings && Object.hasOwn(settings, "telegramBotToken")
    ? String(settings.telegramBotToken || "").trim()
    : String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
}

async function persistSettings(nextServerUrl, nextTelegramBotToken) {
  await fs.promises.mkdir(app.getPath("userData"), { recursive: true });
  const settingsPath = path.join(app.getPath("userData"), "settings.json");
  await fs.promises.writeFile(settingsPath,
    `${JSON.stringify({ serverUrl: nextServerUrl, telegramBotToken: nextTelegramBotToken }, null, 2)}\n`,
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

async function saveSettings(values) {
  const normalizedUrl = validServerUrl(String(values.serverUrl || "").trim());
  const nextToken = String(values.telegramBotToken || "").trim();
  const previousUrl = serverUrl;
  const previousToken = telegramBotToken;
  const tokenChanged = nextToken !== previousToken;
  const wasLocalServer = isLocalServerUrl(previousUrl);
  const willUseLocalServer = isLocalServerUrl(normalizedUrl);

  await persistSettings(normalizedUrl, nextToken);
  serverUrl = normalizedUrl;
  telegramBotToken = nextToken;

  if (willUseLocalServer && (tokenChanged || !wasLocalServer)) {
    try {
      if (wasLocalServer) await restartLocalServer();
      else await startLocalServer();
    } catch (error) {
      serverUrl = previousUrl;
      telegramBotToken = previousToken;
      await persistSettings(previousUrl, previousToken).catch(() => undefined);
      if (wasLocalServer) await startLocalServer().catch(() => undefined);
      throw new Error(`Could not start the local server. ${error.message || ""}`.trim());
    }
  } else if (wasLocalServer && !willUseLocalServer) {
    await stopLocalServer();
  }

  if (dashboardView && !dashboardView.webContents.isDestroyed()) {
    if (serverUrl !== previousUrl || tokenChanged) await dashboardView.webContents.loadURL(`${serverUrl}/`);
  }
  if (serverUrl !== previousUrl && musicView && !musicView.webContents.isDestroyed()) {
    const serializedUrl = JSON.stringify(serverUrl);
    await musicView.webContents.executeJavaScript(`localStorage.setItem("partyUrl", ${serializedUrl})`).catch(() => undefined);
    musicView.webContents.reload();
  }
  return serverUrl;
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

function resizeViews() {
  if (!window || !musicView || !dashboardView) return;
  const [width, height] = window.getContentSize();
  const bounds = { x: 0, y: TOOLBAR_HEIGHT, width, height: Math.max(height - TOOLBAR_HEIGHT, 0) };
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
    webPreferences: { session: persistentSession, contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  dashboardView = new WebContentsView({
    webPreferences: { session: persistentSession, contextIsolation: true, nodeIntegration: false, sandbox: true },
  });

  window.contentView.addChildView(musicView);
  window.contentView.addChildView(dashboardView);
  dashboardView.setVisible(false);
  resizeViews();

  window.on("resize", resizeViews);
  window.webContents.on("did-finish-load", () => {
    window.webContents.send("view:changed", activeView);
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
  musicView.webContents.loadURL(MUSIC_URL);
  dashboardView.webContents.loadURL(`${serverUrl}/`);
}

ipcMain.on("view:set", (_event, name) => setActiveView(name));
ipcMain.on("settings:open", () => {
  musicView?.setVisible(false);
  dashboardView?.setVisible(false);
  window?.webContents.send("settings:opened", { serverUrl, telegramBotToken });
});
ipcMain.on("settings:close", () => {
  setActiveView(activeView);
});
ipcMain.handle("settings:save", async (_event, values) => {
  try {
    await saveSettings(values || {});
    return { serverUrl };
  } catch (error) {
    return { error: error.message || "Could not save settings." };
  }
});
ipcMain.on("view:reload", () => {
  const view = activeView === "music" ? musicView : dashboardView;
  if (view && !view.webContents.isDestroyed()) view.webContents.reload();
});

app.whenReady().then(async () => {
  await readSettings();
  if (isLocalServerUrl(serverUrl)) await startLocalServer();

  try {
    const partition = session.fromPartition(PARTITION);
    await installAdBlocker(partition);
    await partition.extensions.loadExtension(assetPath("extension"));
    makeWindow();
  } catch (error) {
    dialog.showErrorBox("Music Party could not start", error.message || String(error));
    app.quit();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) makeWindow();
  });
}).catch((error) => {
  dialog.showErrorBox("Music Party could not start", error.message || String(error));
  app.quit();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
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
  { label: "View", submenu: [{ role: "reload" }, { role: "toggleDevTools" }, { type: "separator" }, { role: "zoomIn" }, { role: "zoomOut" }, { role: "resetZoom" }] },
];
Menu.setApplicationMenu(Menu.buildFromTemplate(template));
