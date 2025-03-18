import { Telegraf } from "telegraf";
import { ENV } from "./config/env";
import express from "express";
import { PrismaClient } from "@prisma/client";
import { main as startBot } from "./delivery/telegram";
import { main as startHttp } from "./delivery/http";

async function main() {
    const bot = new Telegraf(ENV.TELEGRAM_BOT_TOKEN, {
        handlerTimeout: 100000,
    });
    const prisma = new PrismaClient();
    const app = express();

    
    startBot(bot);
    startHttp(app, prisma);
    
    app.listen(3000);
    bot.launch();

    return bot;
}

main();
