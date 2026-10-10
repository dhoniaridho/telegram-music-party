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
const localPartyUrl = "http://127.0.0.1:3417";

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
  await fs.cp(path.join(backendRoot, "dist"), path.join(serverDir, "dist"), { recursive: true, force: true });
  await fs.cp(path.join(backendRoot, "prisma/sqlite"), path.join(serverDir, "prisma/sqlite"), { recursive: true, force: true });
  await fs.cp(path.join(backendRoot, "prisma/generated/sqlite-client"), path.join(serverDir, "prisma/generated/sqlite-client"), { recursive: true, force: true });
  await fs.mkdir(path.join(serverDir, "scripts"), { recursive: true });
  await fs.copyFile(path.join(backendRoot, "scripts/migrate-deploy.cjs"), path.join(serverDir, "scripts/migrate-deploy.cjs"));
  await fs.copyFile(path.join(appRoot, "src/server-runner.cjs"), path.join(serverDir, "desktop-server-runner.cjs"));
}

async function prepareAssets() {
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
  if (await fs.access(cachedFilters).then(() => true, () => false)) {
    await fs.copyFile(cachedFilters, path.join(assetsDir, "adblock-filters.bin"));
  } else {
    const blocker = await ElectronBlocker.fromPrebuiltAdsOnly(globalThis.fetch);
    const filters = blocker.serialize();
    await fs.writeFile(cachedFilters, filters);
    await fs.writeFile(path.join(assetsDir, "adblock-filters.bin"), filters);
  }
  if (process.argv.includes("--with-server")) await copyServer();
  console.log(process.argv.includes("--with-server")
    ? "Prepared the local API, unpacked party integration, and bundled ad filters."
    : "Prepared the unpacked party integration and bundled ad filters.");
}

prepareAssets().catch((error) => {
  console.error("Could not prepare desktop resources:", error);
  process.exitCode = 1;
});
