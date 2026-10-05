import { configDotenv } from 'dotenv';
import { resolve } from 'path';

configDotenv();

const databaseUrl = process.env.DATABASE_URL;
const requestedDatabaseProvider = process.env.DATABASE_PROVIDER?.toLowerCase();
const inferredDatabaseProvider = databaseUrl?.startsWith('postgres')
    ? 'postgresql'
    : 'sqlite';
const databaseProvider = requestedDatabaseProvider || inferredDatabaseProvider;

if (!['sqlite', 'postgresql'].includes(databaseProvider)) {
    throw new Error(
        `Unsupported DATABASE_PROVIDER "${databaseProvider}". Use "sqlite" or "postgresql".`,
    );
}
if (databaseProvider === 'postgresql' && !databaseUrl) {
    throw new Error('DATABASE_URL is required when DATABASE_PROVIDER=postgresql.');
}

export const ENV = {
    SPOTIFY_API_TOKEN: process.env.SPOTIFY_API_TOKEN as string,
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN as string,
    SPOTIFY_REFRESH_TOKEN: process.env.SPOTIFY_REFRESH_TOKEN as string,
    SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID as string,
    SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET as string,
    CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET as string,
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY as string,
    REDIS_URL: process.env.REDIS_URL,
    DATABASE_PROVIDER: databaseProvider as 'sqlite' | 'postgresql',
    DATABASE_URL: databaseUrl,
    SQLITE_DATABASE_URL:
        process.env.SQLITE_DATABASE_URL ||
        `file:${resolve(process.cwd(), 'prisma', 'local.db')}`,
};
