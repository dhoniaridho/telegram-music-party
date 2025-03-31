import { Ctx, Start, Command, On, Action, Update } from 'nestjs-telegraf';
import { Context, Markup, NarrowedContext } from 'telegraf';
import { PlaybackGateway } from './playback.gateway';
import {
    CallbackQuery,
    InlineKeyboardButton,
    InlineQueryResult,
    Update as UpdateType,
} from 'telegraf/typings/core/types/typegram';
import { PlaybackService } from './playback.service';
import { getRandomHumanReadable } from '@marianmeres/random-human-readable';
import { YTMusicService } from 'src/platform/yt-music.service';
import { formatDuration } from 'src/helpers/util';
@Update()
export class PlaybackTelegramController {
    constructor(
        private readonly gateway: PlaybackGateway,
        private readonly playbackService: PlaybackService,
        private readonly ytmusicService: YTMusicService,
    ) {}

    @Start()
    async start(@Ctx() ctx: Context) {
        const instructions = [
            'Create a room by typing /register',
            'Open firefox',
            'Download extension https://addons.mozilla.org/en-US/firefox/addon/yt-music-party/',
            'Enable extension',
            'Open Extension',
            'Insert room id',
            'Go to https://music.youtube.com',
            'Add queue by mention @xmsc_bot followed by [music name] here',
            'Then, run /play in the group chat to play the music from the queue',
        ];

        await ctx.reply(instructions.join('\n'));
    }

    @Command('register')
    async register(
        @Ctx() ctx: Context & { message: { chat: { title: string } } },
    ) {
        const chatId = ctx.chat?.id.toString() || '';
        if (!chatId) {
            await ctx.reply('No chat id');
            return;
        }

        // get room from current chat id
        const room = await this.playbackService.getRoomByChatId(chatId);
        if (room) {
            await ctx.reply(
                `This chat is already registered. \nHere is the Room ID: \n\n<pre><code class="language-sh">${room.id}</code></pre>`,
                {
                    parse_mode: 'HTML',
                },
            );
            return;
        }

        // generate readable room id
        const roomId = getRandomHumanReadable({
            adjCount: 1,
            colorsCount: 0,
            nounsCount: 2,
            joinWith: '-',
        }) as string;

        await this.playbackService.addRoom(
            roomId,
            chatId,
            ctx.message?.chat.title || '',
        );

        await ctx.reply(
            `Successfully registered! \nRoom ID: \n\n<pre><code class="language-sh">${roomId}</code></pre>`,
            {
                parse_mode: 'HTML',
            },
        );
    }

    @Command('play')
    async play(@Ctx() ctx: Context) {
        const chatId = ctx.chat?.id.toString() || '';
        if (!chatId) {
            await ctx.reply('No chat id');
            return;
        }

        const room = await this.playbackService.getRoomByChatId(chatId);
        if (!room) {
            await ctx.reply('No room found');
            return;
        }

        const roomId = room.id;

        const queue = await this.playbackService.getQueue(roomId);
        if (!queue) {
            await ctx.reply('Empty queue');
            return;
        }

        this.gateway.playCommand(roomId, queue);

        await ctx.reply(`${queue.title} is now playing`);
    }

    @Command('pause')
    async pause(@Ctx() ctx: Context) {
        const chatId = ctx.chat?.id.toString() || '';
        if (!chatId) {
            await ctx.reply('No chat id');
            return;
        }

        const room = await this.playbackService.getRoomByChatId(chatId);
        if (!room) {
            await ctx.reply('No room found');
            return;
        }

        const roomId = room.id;
        this.gateway.pauseCommand(roomId);
        await ctx.reply('Paused');
    }

    @Command('next')
    async next(@Ctx() ctx: Context) {
        const chatId = ctx.chat?.id.toString() || '';
        if (!chatId) {
            await ctx.reply('No chat id');
            return;
        }

        const room = await this.playbackService.getRoomByChatId(chatId);
        if (!room) {
            await ctx.reply('No room found');
            return;
        }

        const roomId = room.id;
        await this.playbackService.removeLastPlayed(roomId);
        const next = await this.playbackService.getNext(roomId);

        this.gateway.nextCommand(roomId, next);
        await ctx.reply('Next');
    }

    @Command('prev')
    async prev(@Ctx() ctx: Context) {
        const chatId = ctx.chat?.id.toString() || '';
        if (!chatId) {
            await ctx.reply('No chat id');
            return;
        }

        const room = await this.playbackService.getRoomByChatId(chatId);
        if (!room) {
            await ctx.reply('No room found');
            return;
        }

        const roomId = room.id;
        this.gateway.previousCommand(roomId);
        await ctx.reply('Previous');
    }

    @Command('volumeUp')
    async volumeUp(@Ctx() ctx: Context) {
        const chatId = ctx.chat?.id.toString() || '';
        if (!chatId) {
            await ctx.reply('No chat id');
            return;
        }

        const room = await this.playbackService.getRoomByChatId(chatId);
        if (!room) {
            await ctx.reply('No room found');
            return;
        }

        const roomId = room.id;
        this.gateway.volumeUp(roomId);
        await ctx.reply('Volume Up');
    }

    @Command('volumeDown')
    async volumeDown(@Ctx() ctx: Context) {
        const chatId = ctx.chat?.id.toString() || '';
        if (!chatId) {
            await ctx.reply('No chat id');
            return;
        }

        const room = await this.playbackService.getRoomByChatId(chatId);
        if (!room) {
            await ctx.reply('No room found');
            return;
        }

        const roomId = room.id;
        this.gateway.volumeDown(roomId);
        await ctx.reply('Volume Down');
    }

    @Command('devices')
    async devices(@Ctx() ctx: Context) {
        const chatId = ctx.chat?.id.toString() || '';
        if (!chatId) {
            await ctx.reply('No chat id');
            return;
        }

        const room = await this.playbackService.getDevicesByChatId(chatId);
        if (!room) {
            await ctx.reply('No room found');
            return;
        }

        if (room.Device.length == 0) {
            await ctx.reply('No devices found');
            return;
        }

        await ctx.reply(
            `<b>Devices:</b>\n\n${room.Device.map(
                (d, i) =>
                    `(${i + 1}) \n<b>Name</b> \n${d.name} \n<b>Browser Id</b> \n<code>${d.fingerprint}</code> \n<b>Joined At</b>\n${d.createdAt.toLocaleString()}\n\n`,
            ).join('')}`,
            {
                parse_mode: 'HTML',
            },
        );
    }

    @Command('unregister')
    async unregister(@Ctx() ctx: Context) {
        const chatId = ctx.chat?.id.toString() || '';
        if (!chatId) {
            await ctx.reply('No chat id');
            return;
        }

        const room = await this.playbackService.getRoomByChatId(chatId);
        if (!room) {
            await ctx.reply('No room found');
            return;
        }

        // remove room
        await this.playbackService.removeRoom(room.id);

        // emit leave
        this.gateway.leave(room.id);

        await ctx.reply('Leaved. Bye!');
    }

    @On('inline_query')
    async search(
        @Ctx()
        ctx: NarrowedContext<Context<UpdateType>, UpdateType.InlineQueryUpdate>,
    ) {
        try {
            // get songs
            const searchQuery = ctx?.update?.inline_query?.query; // Change to your search keyword

            if (!searchQuery || searchQuery.length < 3) return;

            const songs = await this.ytmusicService.searchSongs(searchQuery);

            const senderID = ctx.from.id;

            const videoIds: string[] = [];

            await ctx.answerInlineQuery(
                songs
                    .map(
                        (row): InlineQueryResult => ({
                            id: `${row.videoId}`,
                            type: 'article',
                            title: row.name,
                            description: `${row.artist.name} • ${row.album?.name} • ${formatDuration(row.duration || 0)}`,
                            thumbnail_url: row.thumbnails[0].url,
                            input_message_content: {
                                photo_url: row.thumbnails[0].url,
                                message_text: `${row.name} by ${row.artist.name}`,
                            },
                            ...Markup.inlineKeyboard([
                                // [
                                //   Markup.button.callback(
                                //     "Play Next",
                                //     `play-this-next-${userID}:${row.musicID}`,
                                //   ),
                                // ],
                                [
                                    Markup.button.callback(
                                        'Add to Queue',
                                        `queue:${senderID}:${row.videoId}`,
                                    ),
                                ],
                                [
                                    Markup.button.callback(
                                        'Cancel',
                                        `cancel:${senderID}`,
                                    ),
                                ],
                            ]),
                        }),
                    )
                    .filter((r) => {
                        if (videoIds.includes(r.id)) return false;
                        videoIds.push(r.id);
                        return true;
                    }),
            );
        } catch (e) {
            console.error(e);
        }
    }

    @On('edited_message')
    async editedMessage(@Ctx() ctx: Context) {
        if (!ctx.editedMessage?.via_bot?.is_bot) return;

        const inlineKeyboard = ctx.editedMessage.reply_markup?.inline_keyboard;
        if (!inlineKeyboard || inlineKeyboard?.length === 0) return;

        const buttons = inlineKeyboard[0];
        if (buttons.length === 0) return;

        const addToQueueBtn = buttons[0] as InlineKeyboardButton.CallbackButton;

        if (
            addToQueueBtn.text !== 'Verifying..' ||
            !addToQueueBtn.callback_data.startsWith('verify:')
        )
            return;

        const videoId = addToQueueBtn.callback_data.split(':')[1];

        const song = await this.ytmusicService.getSong(videoId);

        const messageInlineID = addToQueueBtn.callback_data.split(':')[2];

        // get the room
        const chatId = ctx.chat?.id.toString() || '';
        if (!chatId) return;

        const room = await this.playbackService.getRoomByChatId(chatId);
        if (!room) {
            await ctx.telegram.editMessageText(
                undefined,
                undefined,
                messageInlineID,
                'Music Party not available in this chat',
            );
            return;
        }

        const roomId = room.id;

        const songCombined = `${song.name} - ${song.artist.name} [${formatDuration(
            song.duration || 0,
        )}]`;

        await this.playbackService.addToQueue(roomId, videoId, songCombined);

        // emit new queues
        this.gateway.updateQueue(
            roomId,
            await this.playbackService.getQueues(roomId),
        );

        await ctx.telegram.editMessageText(
            undefined,
            undefined,
            messageInlineID,
            `${songCombined} added to queue`,
        );
    }

    @Action(/queue:(.*)/)
    async addToQueue(
        @Ctx()
        ctx: Context<UpdateType.CallbackQueryUpdate<CallbackQuery>> &
            Omit<Context<UpdateType>, keyof Context<UpdateType>> & {
                match: RegExpExecArray;
            },
    ) {
        const [senderID, videoId] = ctx.match[1].split(':');

        if (!videoId || !senderID) return;

        if (parseInt(senderID) !== ctx.from.id) {
            await ctx.answerCbQuery('You are not allowed to add this song');
            return;
        }

        await ctx.editMessageReplyMarkup({
            inline_keyboard: [
                [
                    Markup.button.callback(
                        `Verifying..`,
                        `verify:${videoId}:${ctx.update.callback_query.inline_message_id}`,
                    ),
                ],
            ],
        });
    }

    @Action(/cancel:(.*)/)
    async cancelQueue(
        @Ctx()
        ctx: Context<UpdateType.CallbackQueryUpdate<CallbackQuery>> &
            Omit<Context<UpdateType>, keyof Context<UpdateType>> & {
                match: RegExpExecArray;
            },
    ) {
        const [senderID] = ctx.match[1].split(':');

        if (!senderID) return;

        if (parseInt(senderID) !== ctx.from.id) {
            await ctx.answerCbQuery('You are not allowed to add this song');
            return;
        }

        await ctx.answerCbQuery('Canceling...');
        await ctx.editMessageText('Canceled');
    }

    @Command('queue')
    async getQueues(@Ctx() ctx: Context) {
        const chatId = ctx.chat?.id.toString() || '';
        if (!chatId) {
            await ctx.reply('No chat id');
            return;
        }

        const room = await this.playbackService.getRoomByChatId(chatId);
        if (!room) {
            await ctx.reply('No room found');
            return;
        }

        const roomId = room.id;
        const data = await this.playbackService.getQueues(roomId);
        await ctx.reply(
            `Queue: \n${data.map((d, i) => `${i + 1}. ${d.title}`).join('\n')}`,
        );
    }

    @Command('resume')
    async resume(@Ctx() ctx: Context) {
        const chatId = ctx.chat?.id.toString() || '';
        if (!chatId) {
            await ctx.reply('No chat id');
            return;
        }

        const room = await this.playbackService.getRoomByChatId(chatId);
        if (!room) {
            await ctx.reply('No room found');
            return;
        }

        const roomId = room.id;
        this.gateway.resumeCommand(roomId);
        await ctx.reply('Resuming');
    }
}
