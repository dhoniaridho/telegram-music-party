const fs = require("node:fs/promises");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { ElectronBlocker } = require("@ghostery/adblocker-electron");

const appRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(appRoot, "../..");
const backendRoot = path.join(repoRoot, "apps/backend");
const generatedDir = path.join(appRoot, "generated");
const cacheDir = path.join(appRoot, ".cache");
const cachedFilters = path.join(cacheDir, "adblock-filters.bin");
const extensionDist = path.resolve(appRoot, "../extension/dist");
const assetsDir = path.join(generatedDir, "assets");
const extensionDir = path.join(assetsDir, "extension");
const serverDir = path.join(generatedDir, "server");
const cloudflaredPath = path.join(assetsDir, process.platform === "win32" ? "cloudflared.exe" : "cloudflared");
const localPartyUrl = "http://127.0.0.1:3417";

async function linkRuntimeDependencies() {
  const packageJson = JSON.parse(await fs.readFile(path.join(appRoot, "package.json"), "utf8"));
  const appNodeModules = path.join(appRoot, "node_modules");
  await fs.mkdir(appNodeModules, { recursive: true });

  for (const name of Object.keys(packageJson.dependencies || {})) {
    const segments = name.split("/");
    const source = path.join(repoRoot, "node_modules", ...segments);
    const target = path.join(appNodeModules, ...segments);
    if (!await fs.access(source).then(() => true, () => false)) {
      throw new Error(`Runtime dependency ${name} is missing from the workspace install.`);
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.rm(target, { recursive: true, force: true });
    await fs.symlink(source, target, process.platform === "win32" ? "junction" : "dir");
  }
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}`);
}

async function copyServer() {
  await fs.rm(serverDir, { recursive: true, force: true });
  run("pnpm", ["--filter", "backend", "deploy", "--prod", "--legacy", serverDir], repoRoot);
  const prismaClientEntry = await fs.realpath(require.resolve("@prisma/client", { paths: [backendRoot] }));
  const generatedPrismaClient = path.resolve(path.dirname(prismaClientEntry), "../../.prisma/client");
  await fs.cp(generatedPrismaClient, path.join(serverDir, "node_modules/.prisma/client"), { recursive: true, force: true });
  await fs.cp(path.join(backendRoot, "dist"), path.join(serverDir, "dist"), { recursive: true, force: true });
  await fs.cp(path.join(backendRoot, "prisma/sqlite"), path.join(serverDir, "prisma/sqlite"), { recursive: true, force: true });
  await fs.cp(path.join(backendRoot, "prisma/generated/sqlite-client"), path.join(serverDir, "prisma/generated/sqlite-client"), { recursive: true, force: true });
  await fs.mkdir(path.join(serverDir, "scripts"), { recursive: true });
  await fs.copyFile(path.join(backendRoot, "scripts/migrate-deploy.cjs"), path.join(serverDir, "scripts/migrate-deploy.cjs"));
  await fs.copyFile(path.join(appRoot, "src/server-runner.cjs"), path.join(serverDir, "desktop-server-runner.cjs"));
}

async function prepareCloudflared() {
  const target = process.platform === "darwin" ? `darwin-${process.arch}`
    : process.platform === "linux" ? `linux-${process.arch}`
      : process.platform === "win32" ? `windows-${process.arch}` : "";
  const downloads = {
    "darwin-arm64": { url: "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64.tgz", archive: true },
    "darwin-x64": { url: "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz", archive: true },
    "linux-arm64": { url: "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64" },
    "linux-x64": { url: "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64" },
    "windows-x64": { url: "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" },
  };
  const download = downloads[target];
  if (!download) throw new Error(`Cloudflare Tunnel is not available for ${process.platform}/${process.arch}.`);

  const cachedBinary = path.join(cacheDir, `cloudflared-${target}${process.platform === "win32" ? ".exe" : ""}`);
  if (!await fs.access(cachedBinary).then(() => true, () => false)) {
    console.log(`Downloading Cloudflare Tunnel for ${target}…`);
    const response = await fetch(download.url);
    if (!response.ok) throw new Error(`Could not download cloudflared (${response.status}).`);
    const totalBytes = Number(response.headers.get("content-length")) || 0;
    const chunks = [];
    let receivedBytes = 0;
    let lastReportedPercent = 0;
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
      receivedBytes += value.byteLength;
      const percent = totalBytes ? Math.floor((receivedBytes / totalBytes) * 100) : 0;
      if (percent >= lastReportedPercent + 10) {
        lastReportedPercent = percent;
        console.log(totalBytes
          ? `Cloudflare Tunnel download: ${percent}%`
          : `Cloudflare Tunnel downloaded ${(receivedBytes / (1024 * 1024)).toFixed(1)} MB`);
      }
    }
    const bytes = Buffer.concat(chunks);
    if (download.archive) {
      const archivePath = `${cachedBinary}.tgz`;
      const extractDir = `${cachedBinary}.extract`;
      await fs.writeFile(archivePath, bytes);
      await fs.rm(extractDir, { recursive: true, force: true });
      await fs.mkdir(extractDir, { recursive: true });
      run("tar", ["-xzf", archivePath, "-C", extractDir, "cloudflared"], appRoot);
      await fs.copyFile(path.join(extractDir, "cloudflared"), cachedBinary);
      await fs.rm(archivePath, { force: true });
      await fs.rm(extractDir, { recursive: true, force: true });
    } else {
      await fs.writeFile(cachedBinary, bytes);
    }
  } else {
    console.log(`Using cached Cloudflare Tunnel binary for ${target}.`);
  }
  await fs.copyFile(cachedBinary, cloudflaredPath);
  if (process.platform !== "win32") await fs.chmod(cloudflaredPath, 0o755);
  const version = spawnSync(cloudflaredPath, ["--version"], { encoding: "utf8" });
  if (version.status !== 0) throw new Error("The downloaded cloudflared binary could not be run.");
  console.log(`Prepared ${version.stdout.trim()} for ${target}.`);
}

async function prepareNativeMakers() {
  if (process.platform === "darwin") {
    const nodeGyp = path.join(repoRoot, "node_modules/.bin/node-gyp");
    for (const packageName of ["macos-alias", "fs-xattr"]) {
      run(nodeGyp, ["rebuild", "--directory", path.join(repoRoot, "node_modules", packageName)], repoRoot);
    }
  } else if (process.platform === "win32") {
    run(process.execPath, [path.join(repoRoot, "node_modules/electron-winstaller/script/select-7z-arch.js")], repoRoot);
  }
}

async function prepareAssets() {
  await linkRuntimeDependencies();
  await fs.rm(assetsDir, { recursive: true, force: true });
  await fs.mkdir(extensionDir, { recursive: true });
  await fs.cp(extensionDist, extensionDir, { recursive: true });

  const manifestPath = path.join(extensionDir, "manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  delete manifest.action;
  delete manifest.browser_specific_settings;
  manifest.host_permissions = [...new Set([
    ...(manifest.host_permissions || []),
    `${localPartyUrl}/*`,
    "https://*/*",
  ])];
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  await fs.mkdir(cacheDir, { recursive: true });
  await prepareCloudflared();
  if (await fs.access(cachedFilters).then(() => true, () => false)) {
    await fs.copyFile(cachedFilters, path.join(assetsDir, "adblock-filters.bin"));
  } else {
    const blocker = await ElectronBlocker.fromPrebuiltAdsOnly(globalThis.fetch);
    const filters = blocker.serialize();
    await fs.writeFile(cachedFilters, filters);
    await fs.writeFile(path.join(assetsDir, "adblock-filters.bin"), filters);
  }
  if (process.argv.includes("--with-server")) {
    await prepareNativeMakers();
    await copyServer();
  }
  console.log(process.argv.includes("--with-server")
    ? "Prepared the local API, party integration, Cloudflare Tunnel, and ad filters."
    : "Prepared the party integration, Cloudflare Tunnel, and ad filters.");
}

prepareAssets().catch((error) => {
  console.error("Could not prepare desktop resources:", error);
  process.exitCode = 1;
});
