const { spawnSync } = require("node:child_process");
const path = require("node:path");

async function start() {
  const root = process.env.MUSIC_PARTY_SERVER_DIR || __dirname;
  const schema = path.join(root, "prisma/sqlite/schema.prisma");
  process.env.DESKTOP_LOCAL_SERVER = "1";
  process.env.DATABASE_PROVIDER = "sqlite";
  process.env.SQLITE_DATABASE_URL ||= `file:${path.join(process.env.MUSIC_PARTY_DATA_DIR, "music-party.db")}`;
  process.env.PORT ||= "3417";

  const prismaCli = require.resolve("prisma/build/index.js");
  const migration = spawnSync(process.execPath, [prismaCli, "migrate", "deploy", "--schema", schema], {
    cwd: root,
    env: process.env,
    stdio: "inherit",
  });
  if (migration.error) throw migration.error;
  if (migration.status !== 0) throw new Error(`SQLite migrations failed with status ${migration.status}`);

  const { bootstrap } = require(path.join(root, "dist/main.js"));
  await bootstrap();
}

start().catch((error) => {
  console.error("Music Party local server failed to start:", error);
  process.exit(1);
});
