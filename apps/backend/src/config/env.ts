import { configDotenv } from 'dotenv';

configDotenv();

export const ENV = {
    SPOTIFY_API_TOKEN: process.env.SPOTIFY_API_TOKEN as string,
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN as string,
    SPOTIFY_REFRESH_TOKEN: process.env.SPOTIFY_REFRESH_TOKEN as string,
    SPOTIFY_CLIENT_ID: process.env.SPOTIFY_CLIENT_ID as string,
    SPOTIFY_CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET as string,
    CLIENT_SECRET: process.env.SPOTIFY_CLIENT_SECRET as string,
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY as string,
};
