import { Telegraf } from "telegraf";
import { getPlaybackState, pause } from "./spotify/lib";
import { catchError, firstValueFrom, from, switchMap, tap } from "rxjs";
import { ENV } from "./config/env";
import express from "express";
import querystring from "querystring";
import { randomUUID } from "crypto";
import { PrismaClient } from "@prisma/client";
import axios from "axios";

const scope =
    "user-read-private user-read-email user-read-playback-state user-modify-playback-state user-read-currently-playing";

async function main() {
    const bot = new Telegraf(ENV.TELEGRAM_BOT_TOKEN, {
        handlerTimeout: 100000,
    });
    const prisma = new PrismaClient();

    const app = express();

    app.get("/login", function (req, res) {
        const state = randomUUID();

        res.redirect(
            "https://accounts.spotify.com/authorize?" +
                querystring.stringify({
                    response_type: "code",
                    client_id: ENV.SPOTIFY_CLIENT_ID,
                    scope: scope,
                    redirect_uri: "http://127.0.0.1:3000/callback",
                    state: state,
                })
        );
    });

    app.get("/callback", async function (req, res) {
        const code = req.query.code || null;
        const state = req.query.state || null;

        if (state === null) {
            res.redirect(
                "https://accounts.spotify.com/authorize?" +
                    querystring.stringify({
                        response_type: "code",
                        client_id: ENV.SPOTIFY_CLIENT_ID,
                        scope: scope,
                        redirect_uri: "http://127.0.0.1:3000/callback",
                        state: state,
                    })
            );
        } else {
            const token = await firstValueFrom(
                from(
                    axios.post(
                        "https://accounts.spotify.com/api/token",
                        {
                            code: req.query.code,
                            redirect_uri: "http://127.0.0.1:3000/callback",
                            grant_type: "authorization_code",
                        },
                        {
                            headers: {
                                "content-type":
                                    "application/x-www-form-urlencoded",
                                Authorization:
                                    "Basic " +
                                    Buffer.from(
                                        ENV.SPOTIFY_CLIENT_ID +
                                            ":" +
                                            ENV.SPOTIFY_CLIENT_SECRET
                                    ).toString("base64"),
                            },
                        }
                    )
                ).pipe(
                    switchMap(async (r) => {
                        console.log("[OK] login success");
                        console.log(r.data);
                        await prisma.user.create({
                            data: {
                                token: r.data.access_token,
                            },
                        });
                        return r.data;
                    }),
                    catchError((e) => {
                        console.log("[ERROR] login failed");
                        console.log(e.response.data);
                        throw e;
                    })
                )
            );

            res.send("Success! You can now close the window.");
        }
    });

    bot.start((ctx) => {
        ctx.reply("Hello World");
    });

    bot.command("pause", async (ctx) => {
        return firstValueFrom(
            pause().pipe(
                tap((p) => {
                    ctx.reply(`${p.item.name} Paused`);
                })
            )
        );
    });

    bot.command("current", (ctx) => {
        return firstValueFrom(
            getPlaybackState().pipe(
                tap((p) => {
                    console.log(p);
                    ctx.reply(`${p.item.name}`);
                })
            )
        );
    });

    process.once("SIGINT", () => {
        bot.stop("SIGINT");
        process.exit();
    });
    process.once("SIGTERM", () => {
        bot.stop("SIGTERM");
        process.exit();
    });

    app.listen(3000);

    from(bot.launch()).subscribe({
        error: (e) => {
            console.log(e);
        },
    });

    return bot;
}

main();
