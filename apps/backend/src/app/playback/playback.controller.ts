/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Update, Ctx, Start, Command, On, Action } from 'nestjs-telegraf';
import { Context, Markup } from 'telegraf';
import { PlaybackGateway } from './playback.gateway';
import { ENV } from 'src/config/env';
import axios from 'axios';
import { InlineQueryResult } from 'telegraf/typings/core/types/typegram';
import { YoutubeSearchResult } from 'src/types/yt';
import { catchError, from, map, of, tap, throttleTime } from 'rxjs';
import { PlaybackService } from './playback.service';
@Update()
export class PlaybackTelegramController {
    constructor(
        private readonly gateway: PlaybackGateway,
        private readonly playbackService: PlaybackService,
    ) {}

    @Start()
    async start(@Ctx() ctx: Context) {
        await ctx.reply('Welcome');
    }

    @Command('play')
    async play(@Ctx() ctx: Context) {
        const queue = await this.playbackService.play();
        if (!queue) {
            await ctx.reply('Empty queue');
            return;
        }
        this.gateway.playCommand(queue);

        await ctx.reply('Playing');
    }

    @Command('pause')
    async pause(@Ctx() ctx: Context) {
        this.gateway.pauseCommand();
        await ctx.reply('Paused');
    }

    @Command('next')
    async next(@Ctx() ctx: Context) {
        this.gateway.nextCommand();
        await ctx.reply('Next');
    }

    @Command('prev')
    async prev(@Ctx() ctx: Context) {
        this.gateway.previousCommand();
        await ctx.reply('Previous');
    }

    @Command('volumeUp')
    async volumeUp(@Ctx() ctx: Context) {
        this.gateway.volumeUp();
        await ctx.reply('Volume Up');
    }

    @Command('volumeDown')
    async volumeDown(@Ctx() ctx: Context) {
        this.gateway.volumeDown();
        await ctx.reply('Volume Down');
    }

    @On('inline_query')
    search(@Ctx() ctx: any) {
        const API_KEY = ENV.GOOGLE_API_KEY; // Replace with your API key
        const SEARCH_QUERY = ctx?.update?.inline_query?.query as string; // Change to your search keyword
        const MAX_RESULTS = 10;
        const API_URL = `https://www.googleapis.com/youtube/v3/search?videoCategoryId=10&type=video&part=snippet&q=${encodeURIComponent(SEARCH_QUERY)}&type=video&maxResults=${MAX_RESULTS}&key=${API_KEY}`;

        const data = axios.get<YoutubeSearchResult>(API_URL);
        from(data)
            .pipe(
                throttleTime(3000),
                map((v) => v.data),
                map((v) => {
                    console.log(JSON.stringify(v));
                    return v.items
                        .filter((i) => i.id.videoId)
                        .map((item) => {
                            return {
                                type: 'article',
                                id: item.etag,
                                title: `${item.snippet.title} - ${item.snippet.channelTitle} @queue:${item.id.videoId}`,
                                description: `${item.snippet.channelTitle} `,
                                url: item.snippet.thumbnails.medium.url,
                                thumbnail_height: 50,
                                input_message_content: {
                                    message_text: `${item.snippet.title} - ${item.snippet.channelTitle}\n${item.snippet.thumbnails.medium.url}`,
                                },
                                thumbnail_url:
                                    item.snippet.thumbnails.medium.url,
                                reply_markup: {
                                    inline_keyboard: [
                                        [
                                            Markup.button.callback(
                                                'Add to Queue',
                                                `queue:${item.id.videoId}`,
                                            ),
                                        ],
                                    ],
                                },
                            } satisfies InlineQueryResult;
                        });
                }),
                tap((r) => {
                    console.log('[OK] search');
                    // console.log(r);
                    ctx.answerInlineQuery(r);
                }),
                catchError((e) => {
                    console.log('[ERROR] search');
                    console.log(e);
                    return of();
                }),
            )
            .subscribe();
    }

    @Action(/queue:(.*)/)
    async addToQueue(@Ctx() ctx: any) {
        console.log(ctx.match[1]);

        await this.playbackService.addToQueue(
            ctx.match[1] as string,
            ctx.match[1] as string,
        );

        await ctx.editMessageReplyMarkup({
            inline_keyboard: [],
        });
        await ctx.answerCbQuery('Ok');
    }

    @Command('queue')
    async getQueue(@Ctx() ctx: Context) {
        const data = await this.playbackService.getQueue();
        await ctx.reply(
            `Queue: \n${data.map((d, i) => `${i + 1} ${d.title}`).join('\n')}`,
        );
    }
}
