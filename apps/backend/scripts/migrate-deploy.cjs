const { spawnSync } = require('node:child_process');
const path = require('node:path');
require('dotenv').config();

const databaseUrl = process.env.DATABASE_URL;
const databaseProvider =
    process.env.DATABASE_PROVIDER?.toLowerCase() ||
    (databaseUrl && databaseUrl.startsWith('postgres') ? 'postgresql' : 'sqlite');

let schema;
if (databaseProvider === 'postgresql') {
    if (!databaseUrl) {
        throw new Error('DATABASE_URL is required when DATABASE_PROVIDER=postgresql.');
    }
    schema = 'prisma/schema.prisma';
} else if (databaseProvider === 'sqlite') {
    process.env.SQLITE_DATABASE_URL ||= `file:${path.resolve('prisma/local.db')}`;
    schema = 'prisma/sqlite/schema.prisma';
} else {
    throw new Error(`Unsupported DATABASE_PROVIDER "${databaseProvider}".`);
}

const prismaCli = require.resolve('prisma/build/index.js');
const result = spawnSync(
    process.execPath,
    [prismaCli, 'migrate', 'deploy', '--schema', schema],
    { stdio: 'inherit', env: process.env },
);

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status || 1);
