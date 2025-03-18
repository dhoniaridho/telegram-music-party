import { Context, Markup, Telegraf } from "telegraf";
import {
    addToQueue,
    devices,
    getPlaybackState,
    getTrackDetails,
    next,
    pause,
    play,
    previous,
    queue,
    search,
    start,
} from "../adapter/spotify";
import { catchError, map, of, switchMap, tap } from "rxjs";
import { InlineQueryResult } from "telegraf/typings/core/types/typegram";

export function main(bot: Telegraf<Context>) {
    bot.on("inline_query", async (ctx) => {
        const uniqueId = Date.now().toString(); // Generate a short unique ID
        search(ctx.inlineQuery.query.trim().replace(/[^a-zA-Z0-9]/g, ""))
            .pipe(
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
                    ctx.reply(e.message);
                    return of();
                })
            )
            .subscribe();
    });

    bot.start((ctx) => {
        start().subscribe({
            next: (r) => {
                console.log("[OK] start");
                console.log(r);
                ctx.reply("Started");
            },
            error: (e) => {
                console.log("[ERROR] start");
                console.log(e);
                ctx.reply(e.message);
            },
        });
    });

    bot.command("pause", async (ctx) => {
        pause()
            .pipe(
                tap((p) => {
                    ctx.reply(
                        `${p.item.name} by ${p.item.artists[0].name} Paused`
                    );
                }),
                catchError((e: Error) => {
                    console.log("[ERROR] start");
                    ctx.reply(e.message || "Failed to pause");
                    return of();
                })
            )
            .subscribe();
    });

    bot.command("next", async (ctx) => {
        next()
            .pipe(
                tap((p) => {
                    ctx.reply(`Next Track`);
                }),
                catchError((e: Error) => {
                    ctx.reply(e.message);
                    return of();
                })
            )
            .subscribe();
    });

    bot.command("previous", async (ctx) => {
        previous()
            .pipe(
                tap((p) => {
                    ctx.reply(`Previous Track`);
                }),
                catchError((e: Error) => {
                    ctx.reply(e.message);
                    return of();
                })
            )
            .subscribe();
    });

    bot.command("devices", async (ctx) => {
        devices()
            .pipe(
                tap((p) => {
                    ctx.reply(
                        `Devices: ${p.map((d: any) => d.name).join(", ")}`
                    );
                }),
                catchError((e: Error) => {
                    ctx.reply(e.message);
                    return of();
                })
            )
            .subscribe();
    });

    bot.command("queue", async (ctx) => {
        queue()
            .pipe(
                tap((p) => {
                    ctx.reply(
                        `Queue: \n${p.queue
                            .map((d, i) => `${i + 1} ${d.name}`)
                            .join("\n")}`
                    );
                }),
                catchError((e: Error) => {
                    ctx.reply(e.message);
                    return of();
                })
            )
            .subscribe();
    });

    bot.action(/queue:(.*)/, async (ctx) => {
        const [_, id] = ctx.match;

        console.log(id);

        getTrackDetails(id)
            .pipe(
                switchMap(async (t) => {
                    console.log(t);
                    addToQueue(t.uri)
                        .pipe(
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
                        .subscribe();
                })
            )
            .subscribe();
    });

    bot.command("play", async (ctx) => {
        play()
            .pipe(
                tap((p) => {
                    ctx.reply(
                        `${p.item.name} by ${p.item.artists[0].name} Playing`
                    );
                }),
                catchError((e: Error) => {
                    ctx.reply(e.message);
                    return of();
                })
            )
            .subscribe();
    });

    bot.command("current", (ctx) => {
        getPlaybackState()
            .pipe(
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
                }),
                catchError((e: Error) => {
                    ctx.reply(e.message);
                    return of();
                })
            )
            .subscribe();
    });

    process.once("SIGINT", () => {
        bot.stop("SIGINT");
        process.exit();
    });
    process.once("SIGTERM", () => {
        bot.stop("SIGTERM");
        process.exit();
    });
}
