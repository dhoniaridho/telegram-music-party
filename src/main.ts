import { Markup, Telegraf } from "telegraf";
import {
    addToQueue,
    getPlaybackState,
    getTrackDetails,
    pause,
    play,
    refreshToken,
    search,
} from "./spotify/lib";
import { catchError, firstValueFrom, from, map, switchMap, tap } from "rxjs";
import { ENV } from "./config/env";
import express from "express";
import querystring from "querystring";
import { randomUUID } from "crypto";
import { PrismaClient } from "@prisma/client";
import axios from "axios";
import { CronJob } from "cron";
import { InlineQueryResult } from "telegraf/typings/core/types/typegram";
import { Item } from "./types/spotify/search";

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
    const cron = new CronJob("*/10 * * * *", async () => {
        refreshToken().subscribe();
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
            await firstValueFrom(
                from(
                    axios.post<{
                        access_token: string;
                        token_type: "Bearer";
                        expires_in: number;
                        refresh_token: string;
                        scope: string;
                    }>(
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
                        await prisma.user.deleteMany({});
                        await prisma.user.create({
                            data: {
                                refreshToken: r.data.refresh_token,
                                token: r.data.access_token,
                                expiresIn: r.data.expires_in,
                                type: r.data.token_type,
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

    bot.on("inline_query", async (ctx) => {
        const uniqueId = Date.now().toString(); // Generate a short unique ID
        await firstValueFrom(
            search(
                ctx.inlineQuery.query.trim().replace(/[^a-zA-Z0-9]/g, "")
            ).pipe(
                map((r) => {
                    return r.tracks?.items.map((v) => {
                        return {
                            type: "article",
                            id: v.id,
                            title: `${v.name} - ${v.artists[0].name}`,
                            description: `${v.artists
                                .map((a) => a.name)
                                .join(", ")} - ${v.album.name}`,
                            url: v.external_urls.spotify,
                            thumbnail_height: 50,
                            input_message_content: {
                                message_text: `${v.name} - ${v.artists[0].name}`,
                                title: v.artists[0].name,
                                description: v.artists
                                    .map((a) => a.name)
                                    .join(", "),
                                link_preview_options: {
                                    url: v.album.images[0].url,
                                },
                            },
                            thumbnail_url: v.album.images[0].url,
                            reply_markup: {
                                inline_keyboard: [
                                    [
                                        Markup.button.callback(
                                            "Add to Queue",
                                            `queue:${v.id}`
                                        ),
                                    ],
                                ],
                            },
                        } satisfies InlineQueryResult;
                    });
                }),
                tap((r) => {
                    console.log("[OK] search");
                    console.log(r);
                    ctx.answerInlineQuery(r);
                }),
                catchError((e) => {
                    console.log("[ERROR] search");
                    console.log(e);
                    throw e;
                })
            )
        );
    });

    bot.start((ctx) => {
        ctx.reply("Hello World");
    });

    bot.command("pause", async (ctx) => {
        return firstValueFrom(
            pause().pipe(
                tap((p) => {
                    ctx.reply(`${p.item.name} by ${p.item.artists[0].name} Paused`);
                })
            )
        );
    });

    bot.action(/queue:(.*)/, async (ctx) => {
        const [_, id] = ctx.match;

        console.log(id);

        return firstValueFrom(
            getTrackDetails(id).pipe(
                switchMap(async (t) => {
                    console.log(t);
                    return firstValueFrom(
                        addToQueue(t.uri).pipe(
                            switchMap(async () => {
                                await ctx.answerCbQuery();
                                await ctx.editMessageReplyMarkup({
                                    inline_keyboard: [],
                                });

                                ctx.telegram.sendMessage(
                                    ctx.from?.id as number,
                                    `${t.name} by ${t.artists[0].name} Added to Queue`
                                );
                            })
                        )
                    );
                })
            )
        );
    });

    bot.command("play", async (ctx) => {
        return firstValueFrom(
            play().pipe(
                tap((p) => {
                    ctx.reply(`${p.item.name} by ${p.item.artists[0].name} Playing`);
                })
            )
        );
    });

    bot.command("current", (ctx) => {
        return firstValueFrom(
            getPlaybackState().pipe(
                tap((p) => {
                    console.log(p);
                    const progressMinutes = Math.floor(
                        p.progress_ms / 1000 / 60
                    );
                    const progressSeconds = Math.floor(
                        (p.progress_ms / 1000) % 60
                    );
                    const durationMinutes = Math.floor(
                        p.item.duration_ms / 1000 / 60
                    );
                    const durationSeconds = Math.floor(
                        (p.item.duration_ms / 1000) % 60
                    );

                    const duration = ` ${durationMinutes}:${durationSeconds
                        .toString()
                        .padStart(2, "0")}`;
                    const progress = `${progressMinutes}:${progressSeconds
                        .toString()
                        .padStart(2, "0")}`;
                    const artists = p.item.artists
                        .map((a) => a.name)
                        .join(", ");
                    ctx.reply(
                        `<b>NOW PLAYING</b> \n\n<b>Device:</b> ${p.device.name}\n<b>Volume:</b> ${p.device.volume_percent}%\n\n<b>Album:</b> ${p.item.album.name}\n<b>Artist(s):</b> ${artists}\n<b>Song:</b> ${p.item.name}\n<b>Duration:</b> ${progress}--------${duration}  \n${p.item.external_urls.spotify}`,
                        {
                            parse_mode: "HTML",
                        }
                    );
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

    cron.start();
    app.listen(3000);

    from(bot.launch()).subscribe({
        error: (e) => {
            console.log(e);
        },
    });

    return bot;
}

main();
