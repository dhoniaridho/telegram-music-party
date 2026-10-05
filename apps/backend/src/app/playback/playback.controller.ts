import {
    Ctx,
    Start,
    Command,
    On,
    Action,
    Update,
    InlineQuery,
    Next,
} from 'nestjs-telegraf';
import { Context, Markup, NarrowedContext } from 'telegraf';
import { PlaybackGateway } from './playback.gateway';
import {
    CallbackQuery,
    InlineKeyboardButton,
    InlineQueryResult,
    Update as UpdateType,
} from 'telegraf/typings/core/types/typegram';
import { Feature as RoomFeature } from '@prisma/client';
import { PlaybackService } from './playback.service';
import { getRandomHumanReadable } from '@marianmeres/random-human-readable';
import { YTMusicService } from 'src/platform/yt-music.service';
import { formatDuration } from 'src/helpers/util';
import { firstValueFrom } from 'rxjs';
import { Inject } from '@nestjs/common';
import { Song } from 'src/types/cache.type';
import Keyv from 'keyv';
import { validateConfigNumber } from 'src/helpers/validation';
@Update()
export class PlaybackTelegramController {
    constructor(
        @Inject('KEYV_CACHE') private cacheManager: Keyv,
        private readonly gateway: PlaybackGateway,
        private readonly playbackService: PlaybackService,
        private readonly ytmusicService: YTMusicService,
    ) {}

    private async fetchSongSummary(videoId: string): Promise<Song> {
        const song = await this.ytmusicService.getSong(videoId);
        return {
            videoId: song.videoId,
            name: song.name,
            artist: song.artist,
            duration: song.duration,
        };
    }

    private botMention(ctx: Context): string {
        const username = ctx.botInfo?.username;
        return username ? `@${username}` : 'this bot';
    }

    @Start()
    async start(@Ctx() ctx: Context) {
        await this.showHomeMenu(ctx);
    }

    private homeMenuKeyboard(chatId: string, feature?: RoomFeature | null) {
        const rows: InlineKeyboardButton[][] = [];
        if (feature) {
            rows.push([
                Markup.button.callback('▶️ Play', 'menu:play'),
                Markup.button.callback('⏸ Pause', 'menu:pause'),
            ]);
            const navigation: InlineKeyboardButton[] = [];
            if (feature.previousCommand) {
                navigation.push(
                    Markup.button.callback(
                        feature.previousOnlyAdmin
                            ? '⏮ Previous (admins)'
                            : '⏮ Previous',
                        'menu:prev',
                    ),
                );
            }
            if (feature.nextCommand) {
                navigation.push(
                    Markup.button.callback(
                        feature.nextOnlyAdmin ? '⏭ Next (admins)' : '⏭ Next',
                        'menu:next',
                    ),
                );
            }
            if (navigation.length) rows.push(navigation);
            rows.push([
                Markup.button.callback('📋 Queue', 'menu:queue'),
                Markup.button.callback('🖥 Devices', 'menu:devices'),
            ]);
            const discovery: InlineKeyboardButton[] = [];
            if (feature.nextCommand) {
                discovery.push(
                    Markup.button.callback('🗳 Vote to skip', 'menu:vote_next'),
                );
            }
            discovery.push(Markup.button.callback('🎤 Lyrics', 'menu:lyrics'));
            rows.push(discovery);
            if (feature.volumeCommand) rows.push(this.volumeButtons(chatId));
            const audio: InlineKeyboardButton[] = [];
            if (feature.muteCommand) {
                audio.push(Markup.button.callback('🔇 Mute', 'menu:mute'));
            }
            if (feature.unmuteCommand) {
                audio.push(Markup.button.callback('🔈 Unmute', 'menu:unmute'));
            }
            if (audio.length) rows.push(audio);
            rows.push([
                Markup.button.callback('ℹ️ Room info', 'menu:info'),
                Markup.button.callback('⚙️ Settings', 'menu:config'),
            ]);
        } else {
            rows.push([
                Markup.button.callback(
                    '📝 Register this group',
                    'menu:register',
                ),
            ]);
        }
        rows.push([
            Markup.button.callback('🚀 Setup', 'menu:setup'),
            Markup.button.callback('❔ Help', 'menu:help'),
        ]);
        return Markup.inlineKeyboard(rows);
    }

    private async showHomeMenu(ctx: Context) {
        const chatId = ctx.chat?.id.toString() ?? '';
        const room = chatId
            ? await this.playbackService.getRoomByChatId(chatId)
            : null;
        await ctx.reply(
            [
                '🎉 YouTube Music Party',
                '',
                'Control playback, check the queue, and manage your room from these buttons.',
                `Use this menu in the registered group chat. Add songs by mentioning the bot with a search, like ${this.botMention(ctx)} song name.`,
            ].join('\n'),
            this.homeMenuKeyboard(chatId, room?.Feature),
        );
    }

    private volumeButtons(chatId: string) {
        return [
            Markup.button.callback('🔉 Volume −', 'menu:volume_down'),
            ...(this.playbackService.isVolumeAtMaximum(chatId)
                ? []
                : [Markup.button.callback('🔊 Volume +', 'menu:volume_up')]),
        ];
    }

    @Command('menu')
    async menu(@Ctx() ctx: Context) {
        await this.showHomeMenu(ctx);
    }

    @Command('help')
    async help(@Ctx() ctx: Context) {
        await ctx.reply(
            [
                '🎧 Party help',
                '',
                `Add music: mention ${this.botMention(ctx)} and type a song name, then tap Add to queue.`,
                'Playback: use the buttons below or /play, /pause, /next, and /prev.',
                'Queue and room: /queue, /devices, and /info.',
                'Group admins: /config opens interactive room settings; /register links this chat to a browser room.',
                'Voting: /vote_next asks the room to skip when the configured vote count is reached.',
                '',
                'Tip: open /menu for playback and room controls.',
            ].join('\n'),
            Markup.inlineKeyboard([
                [Markup.button.callback('🎛 Open controls', 'menu:home')],
                [Markup.button.callback('🚀 Setup guide', 'menu:setup')],
            ]),
        );
    }

    @On('text')
    async onBotMention(@Ctx() ctx: Context, @Next() next: () => Promise<void>) {
        const message = ctx.message;
        const username = ctx.botInfo?.username;
        if (!message || !('text' in message) || !username) {
            await next();
            return;
        }

        const mention = `@${username}`.toLowerCase();
        const wasMentioned =
            message.entities?.some(
                (entity) =>
                    entity.type === 'mention' &&
                    message.text
                        .slice(entity.offset, entity.offset + entity.length)
                        .toLowerCase() === mention,
            ) ?? false;
        if (!wasMentioned || message.text.startsWith('/')) {
            await next();
            return;
        }

        const request = message.text
            .replace(
                new RegExp(
                    mention.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
                    'gi',
                ),
                '',
            )
            .trim()
            .toLowerCase();
        const simpleRequest = request.replace(/[.!?]+$/g, '').trim();

        if (/\b(help|command|what can you do)\b/.test(request)) {
            await this.help(ctx);
            return;
        }
        const directActions: Record<
            string,
            (context: Context) => Promise<void>
        > = {
            play: this.play.bind(this),
            start: this.play.bind(this),
            pause: this.pause.bind(this),
            next: this.next.bind(this),
            skip: this.next.bind(this),
            prev: this.prev.bind(this),
            previous: this.prev.bind(this),
        };
        if (directActions[simpleRequest]) {
            await directActions[simpleRequest](ctx);
            return;
        }
        if (/\b(queue|songs|tracks)\b/.test(request)) {
            await this.getQueues(ctx);
            return;
        }
        if (/\b(volume|louder|quieter)\b/.test(request)) {
            await this.volumeControls(ctx);
            return;
        }

        await ctx.reply(
            [
                `Hey! I can help with the music party.`,
                '',
                `To find a song, tap Search music or type ${this.botMention(ctx)} followed by a song name.`,
                'Use /menu for playback controls, /queue for the song list, or /help for setup and commands.',
            ].join('\n'),
            Markup.inlineKeyboard([
                [Markup.button.switchToCurrentChat('🎵 Search music', '')],
                [
                    Markup.button.callback('🎛 Controls', 'menu:home'),
                    Markup.button.callback('❔ Help', 'menu:help'),
                ],
            ]),
        );
    }

    @Action(
        /^menu:(home|setup|register|help|play|pause|next|prev|queue|devices|vote_next|lyrics|volume|volume_up|volume_down|mute|unmute|info|config)$/,
    )
    async handleMenuAction(
        @Ctx()
        ctx: Context<UpdateType.CallbackQueryUpdate<CallbackQuery>> & {
            match: RegExpExecArray;
        },
    ) {
        const action = ctx.match[1];
        if (action === 'home') {
            await ctx.answerCbQuery();
            await this.showHomeMenu(ctx);
            return;
        }
        if (action === 'volume') {
            await ctx.answerCbQuery();
            await this.volumeControls(ctx);
            return;
        }
        if (action === 'setup') {
            await ctx.answerCbQuery();
            const isPrivate = ctx.chat?.type === 'private';
            await ctx.reply(
                [
                    '🚀 Connect a room',
                    '',
                    isPrivate
                        ? '1. Add this bot to your Telegram group.\n2. In that group, an admin runs /register and copies the room ID.'
                        : '1. A group admin taps Register room below.\n2. Copy the room ID into the browser extension.',
                    '3. Install and enable the extension: https://addons.mozilla.org/en-US/firefox/addon/yt-music-party/',
                    '4. Open https://music.youtube.com and join using the room ID.',
                    `5. Add songs here by mentioning ${this.botMention(ctx)} followed by a song name.`,
                ].join('\n'),
                Markup.inlineKeyboard([
                    [
                        Markup.button.callback(
                            '📝 Register this group',
                            'menu:register',
                        ),
                    ],
                    [Markup.button.callback('🎛 Open controls', 'menu:home')],
                ]),
            );
            return;
        }
        if (action === 'help') {
            await ctx.answerCbQuery();
            await this.help(ctx);
            return;
        }
        if (action === 'register') {
            if (ctx.chat?.type === 'private') {
                await ctx.answerCbQuery(
                    'Run /register in the group you want to connect.',
                    {
                        show_alert: true,
                    },
                );
                return;
            }
            await ctx.answerCbQuery();
            await this.register(ctx);
            return;
        }

        const handlers: Record<string, (context: Context) => Promise<void>> = {
            play: this.play.bind(this),
            pause: this.pause.bind(this),
            next: this.next.bind(this),
            prev: this.prev.bind(this),
            queue: this.getQueues.bind(this),
            devices: this.devices.bind(this),
            vote_next: this.vote_next.bind(this),
            lyrics: this.lyrics.bind(this),
            volume_up: this.volumeUp.bind(this),
            volume_down: this.volumeDown.bind(this),
            mute: this.mute.bind(this),
            unmute: this.unmute.bind(this),
            info: this.getRoomInfo.bind(this) as (
                context: Context,
            ) => Promise<void>,
            config: this.getFeature.bind(this) as (
                context: Context,
            ) => Promise<void>,
        };
        const callbackMessage =
            'message' in ctx.update.callback_query
                ? ctx.update.callback_query.message
                : undefined;
        if (
            ['volume_up', 'volume_down', 'mute', 'unmute'].includes(action) &&
            ctx.chat &&
            callbackMessage
        ) {
            this.playbackService.rememberVolumePanelMessage(
                ctx.chat.id.toString(),
                callbackMessage.message_id,
            );
        }
        await ctx.answerCbQuery();
        await handlers[action](ctx);
    }

    @Command('register')
    async register(@Ctx() ctx: Context) {
        const chatId = ctx.chat?.id.toString() || '';
        if (!chatId) {
            await ctx.reply('No chat id');
            return;
        }

        // if not in private chat
        if (ctx.chat?.type !== 'private') {
            // only admins can register & unregister
            const userId = ctx.from?.id || 0;
            const chatMember = await ctx.getChatMember(userId);
            const isAdmin = ['administrator', 'creator'].includes(
                chatMember?.status,
            );
            if (!isAdmin) {
                await ctx.reply(
                    'Only admins can register the bot. Please contact an admin to register.',
                );
                return;
            }
        }

        // get room from current chat id
        const room = await this.playbackService.getRoomByChatId(chatId);
        if (room) {
            await ctx.reply(
                // `This chat is already registered. \nHere is the Room ID: \n\n<pre><code class="language-sh">${room.id}</code></pre>`,
                [
                    `✅ This chat is already linked to a room.\n`,
                    `<pre><code class="language-sh">${room.id}</code></pre>\n`,
                    `Copy above code to the music party extension 🎉`,
                ].join('\n'),
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
            ctx.chat && 'title' in ctx.chat ? ctx.chat.title : '',
        );

        await ctx.reply(
            [
                `✅ Successfully registered!\n`,
                `<pre><code class="language-sh">${roomId}</code></pre>\n`,
                `Copy above code to the music party extension 🎉`,
            ].join('\n'),
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

        const userId = ctx.from?.id || 0;

        if (ctx.chat?.type !== 'private') {
            // only admins can register & unregister
            const chatMember = await ctx.getChatMember(userId);
            const isAdmin = ['administrator', 'creator'].includes(
                chatMember?.status,
            );
            if (!isAdmin) {
                await ctx.reply(
                    'Only admins can unregister the bot. Please contact an admin to unregister.',
                );
                return;
            }
        }

        // add message confirmation
        await ctx.reply(
            'Are you sure you want to unregister the bot? This will remove all queues and devices.',
            Markup.inlineKeyboard([
                [
                    Markup.button.callback(
                        '‼️ Confirm',
                        `unregister:${userId}`,
                    ),
                    Markup.button.callback('Cancel', `cancel:${userId}`),
                ],
            ]),
        );
    }

    @Action(/unregister:(.*)/)
    async unregisterYes(
        @Ctx()
        ctx: Context<UpdateType.CallbackQueryUpdate<CallbackQuery>> &
            Omit<Context<UpdateType>, keyof Context<UpdateType>> & {
                match: RegExpExecArray;
            },
    ) {
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

        const userId = (ctx.from?.id || 0).toString();

        const [userIdFromAction] = ctx.match[1].split(':');

        if (userId !== userIdFromAction) {
            await ctx.answerCbQuery(
                'Nice try, but you are not allowed to do this',
            );
            return;
        }

        await ctx.answerCbQuery('Unregistering...');

        // remove room
        await this.playbackService.removeRoom(room.id);

        // emit leave
        this.gateway.leave(room.id);

        await ctx.editMessageText(`You've exited the room. Bye for now! ✌️`);
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

        // check connected devices
        if (!room || room.Devices.length === 0) {
            await ctx.reply('No devices connected');
            return;
        }

        // check connected sockets
        const connectedClients = await firstValueFrom(
            this.gateway.countConnectedClients(roomId),
        );

        if (connectedClients === 0) {
            await ctx.reply('No clients connected');
            return;
        }

        // emit play command
        this.gateway.playCommand(roomId);
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
        // await ctx.reply('Paused');
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

        // check if feature is enabled
        if (room.Feature?.nextCommand !== true) {
            await ctx.reply('⚠️ This feature is currently disabled.');
            return;
        }

        if (room.Feature?.nextOnlyAdmin === true) {
            // if not in private chat
            if (ctx.chat?.type !== 'private') {
                // only admins can register & unregister
                const userId = ctx.from?.id || 0;
                const chatMember = await ctx.getChatMember(userId);
                const isAdmin = ['administrator', 'creator'].includes(
                    chatMember?.status,
                );
                if (!isAdmin) {
                    await ctx.reply(
                        '⚠️ This feature is available for admin only.',
                    );
                    return;
                }
            }
        }

        this.gateway.nextCommand(room.id);
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

        // check if feature is enabled
        if (room.Feature?.previousCommand !== true) {
            await ctx.reply('⚠️ This feature is currently disabled.');
            return;
        }

        if (room.Feature?.previousOnlyAdmin === true) {
            // if not in private chat
            if (ctx.chat?.type !== 'private') {
                // only admins can register & unregister
                const userId = ctx.from?.id || 0;
                const chatMember = await ctx.getChatMember(userId);
                const isAdmin = ['administrator', 'creator'].includes(
                    chatMember?.status,
                );
                if (!isAdmin) {
                    await ctx.reply(
                        '⚠️ This feature is available for admin only.',
                    );
                    return;
                }
            }
        }

        this.gateway.previousCommand(room.id);
    }

    @Command('mute')
    async mute(@Ctx() ctx: Context) {
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

        // check if feature is enabled
        if (room.Feature?.muteCommand !== true) {
            await ctx.reply('⚠️ This feature is currently disabled.');
            return;
        }

        this.gateway.muteCommand(room.id);
    }

    @Command('unmute')
    async unmute(@Ctx() ctx: Context) {
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

        // check if feature is enabled
        if (room.Feature?.unmuteCommand !== true) {
            await ctx.reply('⚠️ This feature is currently disabled.');
            return;
        }

        this.gateway.unmuteCommand(room.id);
    }

    @Command('lyrics')
    async lyrics(@Ctx() ctx: Context) {
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

        this.gateway.lyricsCommand(room.id);
    }

    @Command('volume_up')
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

        // check if feature is enabled
        if (room.Feature?.volumeCommand !== true) {
            await ctx.reply('⚠️ This feature is currently disabled.');
            return;
        }

        this.gateway.volumeUp(room.id);
    }

    @Command('volume_down')
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

        // check if feature is enabled
        if (room.Feature?.volumeCommand !== true) {
            await ctx.reply('⚠️ This feature is currently disabled.');
            return;
        }

        this.gateway.volumeDown(room.id);
    }

    @Command('volume')
    async volumeControls(@Ctx() ctx: Context) {
        const chatId = ctx.chat?.id.toString() || '';
        if (!chatId) {
            await ctx.reply('Open /volume in the registered room chat.');
            return;
        }

        const room = await this.playbackService.getRoomByChatId(chatId);
        if (!room) {
            await ctx.reply(
                'No room found. An admin can link this chat with /register.',
            );
            return;
        }

        const volumeEnabled = room.Feature?.volumeCommand === true;
        const panel = await ctx.reply(
            [
                '🔊 <b>Room volume</b>',
                '',
                `Volume controls: ${volumeEnabled ? '✅ enabled' : '⛔ disabled'}`,
                volumeEnabled
                    ? 'Use the buttons to adjust the connected YouTube Music player. The updated level will appear here.'
                    : 'A group admin can enable volume controls in /config.',
            ].join('\n'),
            {
                parse_mode: 'HTML',
                ...this.playbackService.getVolumeControlsKeyboard(
                    chatId,
                    room.Feature,
                ),
            },
        );
        this.playbackService.rememberVolumePanelMessage(
            chatId,
            panel.message_id,
        );
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

        if (room.Devices.length == 0) {
            await ctx.reply(
                'No browsers are connected yet. Open YouTube Music and join this room with the extension.',
                Markup.inlineKeyboard([
                    [
                        Markup.button.callback(
                            '🔄 Refresh devices',
                            'menu:devices',
                        ),
                    ],
                    [Markup.button.callback('🎛 Controls', 'menu:home')],
                ]),
            );
            return;
        }

        await ctx.reply(
            [
                '🖥️ Connected Devices:\n',
                ...room.Devices.map((d, i) =>
                    [
                        ` <b>${i + 1}. ${d.name}</b>`,
                        `🔑 Browser ID: <code>${d.fingerprint}</code>`,
                        `⌚ Joined: ${d.createdAt.toLocaleString()}\n`,
                    ].join('\n'),
                ),
            ].join('\n'),
            {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [
                        Markup.button.callback(
                            '🔄 Refresh devices',
                            'menu:devices',
                        ),
                    ],
                    [
                        Markup.button.callback('ℹ️ Room info', 'menu:info'),
                        Markup.button.callback('🎛 Controls', 'menu:home'),
                    ],
                ]),
            },
        );
    }

    @Command('vote_next')
    async vote_next(@Ctx() ctx: Context) {
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

        if (room.Feature?.nextCommand !== true) {
            await ctx.reply('⚠️ Voting to skip is currently disabled.');
            return;
        }

        // check already voted
        const userId = ctx.from?.id.toString() || '';
        const alreadyVoted = room.Votes.find((v) => v.userId === userId);
        if (alreadyVoted) {
            await ctx.reply(
                `Nice try, DJ—but you've already voted! Let's see what the others pick 🎧`,
            );
            return;
        }

        const MINIMUM_VOTE = room.Feature ? room.Feature.minimumVotes : 5;

        // if will be last voter reach minimum vote
        if (room.Votes.length + 1 >= MINIMUM_VOTE) {
            // emit next command
            this.gateway.nextCommand(room.id);

            await ctx.reply(
                [
                    '🗳️ The people have spoken.',
                    'Minimum votes reached, and the next song has been chosen. Let the music play!',
                ].join('\n'),
            );
            return;
        }

        // add vote
        await this.playbackService.addVote(room.id, userId);

        const randomText = [
            `We're at ${room.Votes.length + 1}/${MINIMUM_VOTE} votes for the next track—who's holding us up? 😄`,
            `${room.Votes.length + 1}/${MINIMUM_VOTE} votes locked! ${MINIMUM_VOTE - (room.Votes.length + 1)} more to go—your pick could change everything 🔥`,
            `Only ${room.Votes.length + 1} out of ${MINIMUM_VOTE} votes so far... who's lagging behind? 😏`,
            `The fate of the next track hangs in the balance… only ${room.Votes.length + 1}/${MINIMUM_VOTE} votes in. Who will decide what's next? 🎭`,
            `Just ${room.Votes.length + 1}/${MINIMUM_VOTE} votes in for the next track—don't be shy, cast yours! 🎶`,
        ];

        // send message
        await ctx.reply(
            randomText[Math.floor(Math.random() * randomText.length)],
        );
    }

    private formatFeatureMenu(feature: RoomFeature): string {
        return [
            '🎛️ Room settings',
            '',
            'Tap a setting to toggle it. Use − / + to adjust the numbers.',
            '',
            `Minimum votes: ${feature.minimumVotes}`,
            `Maximum queue size: ${feature.maxQueueSize}`,
            `Next command: ${feature.nextCommand ? 'On' : 'Off'}`,
            `Next command admin-only: ${feature.nextOnlyAdmin ? 'On' : 'Off'}`,
            `Previous command: ${feature.previousCommand ? 'On' : 'Off'}`,
            `Previous command admin-only: ${feature.previousOnlyAdmin ? 'On' : 'Off'}`,
            `Mute command: ${feature.muteCommand ? 'On' : 'Off'}`,
            `Unmute command: ${feature.unmuteCommand ? 'On' : 'Off'}`,
            `Volume command: ${feature.volumeCommand ? 'On' : 'Off'}`,
            '',
            'Button guide:',
            'Votes − / +: Set how many /vote_next votes are needed to skip.',
            'Queue − / +: Set the maximum number of songs in the queue.',
            '/next: Let members skip the current song.',
            'Next admin-only: Limit /next to group admins.',
            '/prev: Let members return to the previous song.',
            'Previous admin-only: Limit /prev to group admins.',
            '/mute and /unmute: Allow those playback commands.',
            'Volume controls: Allow /volume_up and /volume_down.',
            '',
            'Custom values still work with /set <setting> <value>.',
        ].join('\n');
    }

    private featureMenuKeyboard(feature: RoomFeature) {
        const toggle = (label: string, key: string, value: boolean) =>
            Markup.button.callback(
                `${value ? '✅' : '❌'} ${label}`,
                `config:toggle:${key}`,
            );

        return Markup.inlineKeyboard([
            [
                Markup.button.callback('−', 'config:adjust:minimumVotes:-1'),
                Markup.button.callback(
                    `Votes: ${feature.minimumVotes}`,
                    'config:refresh:menu',
                ),
                Markup.button.callback('+', 'config:adjust:minimumVotes:1'),
            ],
            [
                Markup.button.callback('−', 'config:adjust:maxQueueSize:-1'),
                Markup.button.callback(
                    `Queue: ${feature.maxQueueSize}`,
                    'config:refresh:menu',
                ),
                Markup.button.callback('+', 'config:adjust:maxQueueSize:1'),
            ],
            [toggle('/next', 'nextCommand', feature.nextCommand)],
            [toggle('Next admin-only', 'nextOnlyAdmin', feature.nextOnlyAdmin)],
            [toggle('/prev', 'previousCommand', feature.previousCommand)],
            [
                toggle(
                    'Previous admin-only',
                    'previousOnlyAdmin',
                    feature.previousOnlyAdmin,
                ),
            ],
            [toggle('/mute', 'muteCommand', feature.muteCommand)],
            [toggle('/unmute', 'unmuteCommand', feature.unmuteCommand)],
            [toggle('Volume controls', 'volumeCommand', feature.volumeCommand)],
        ]);
    }

    @Command('config')
    async getFeature(
        @Ctx()
        ctx: Context & {
            message: { text: string };
        },
    ) {
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

        const feature = room.Feature;

        if (!feature) {
            await ctx.reply('No feature found');
            return;
        }

        // only admin can see this
        // if not in private chat
        if (ctx.chat?.type !== 'private') {
            // only admins can register & unregister
            const userId = ctx.from?.id || 0;
            const chatMember = await ctx.getChatMember(userId);
            const isAdmin = ['administrator', 'creator'].includes(
                chatMember?.status,
            );
            if (!isAdmin) {
                await ctx.reply('⚠️ This feature is available for admin only.');
                return;
            }
        }

        await ctx.reply(
            this.formatFeatureMenu(feature),
            this.featureMenuKeyboard(feature),
        );
    }

    @Action(/^config:(toggle|adjust|refresh):([a-zA-Z]+)(?::(-?\d+))?$/)
    async updateFeatureFromMenu(
        @Ctx()
        ctx: Context<UpdateType.CallbackQueryUpdate<CallbackQuery>> & {
            match: RegExpExecArray;
        },
    ) {
        const [, action, setting, rawDelta] = ctx.match;
        const chatId = ctx.chat?.id.toString() || '';
        if (!chatId) {
            await ctx.answerCbQuery('Open /config in the room chat.', {
                show_alert: true,
            });
            return;
        }

        const room = await this.playbackService.getRoomByChatId(chatId);
        if (!room?.Feature) {
            await ctx.answerCbQuery('No room settings found.', {
                show_alert: true,
            });
            return;
        }

        if (ctx.chat?.type !== 'private') {
            const member = await ctx.getChatMember(ctx.from?.id || 0);
            if (!['administrator', 'creator'].includes(member.status)) {
                await ctx.answerCbQuery(
                    'Only room admins can change settings.',
                    {
                        show_alert: true,
                    },
                );
                return;
            }
        }

        if (action === 'refresh') {
            await ctx.answerCbQuery('Settings are up to date.');
            return;
        }

        if (action === 'toggle') {
            const toggleableSettings = [
                'nextCommand',
                'nextOnlyAdmin',
                'previousCommand',
                'previousOnlyAdmin',
                'muteCommand',
                'unmuteCommand',
                'volumeCommand',
            ] as const;

            if (
                !toggleableSettings.includes(
                    setting as (typeof toggleableSettings)[number],
                )
            ) {
                await ctx.answerCbQuery('Unknown setting.', {
                    show_alert: true,
                });
                return;
            }

            const key = setting as (typeof toggleableSettings)[number];
            await this.playbackService.setFeature(
                room.id,
                key,
                !room.Feature[key],
            );
        }

        if (action === 'adjust') {
            if (setting !== 'minimumVotes' && setting !== 'maxQueueSize') {
                await ctx.answerCbQuery('Unknown setting.', {
                    show_alert: true,
                });
                return;
            }

            const step = setting === 'minimumVotes' ? 1 : 5;
            const currentValue = room.Feature[setting];
            const nextValue = Math.max(
                1,
                currentValue + Number(rawDelta || 0) * step,
            );
            await this.playbackService.setFeature(room.id, setting, nextValue);
        }

        const updatedRoom = await this.playbackService.getRoomByChatId(chatId);
        if (!updatedRoom?.Feature) {
            await ctx.answerCbQuery('Could not reload room settings.');
            return;
        }

        await ctx.answerCbQuery('Settings updated.');
        await ctx.editMessageText(
            this.formatFeatureMenu(updatedRoom.Feature),
            this.featureMenuKeyboard(updatedRoom.Feature),
        );
    }

    @Command('set')
    async setFeature(
        @Ctx()
        ctx: Context & {
            message: { text: string };
        },
    ) {
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

        // only admin can do this
        if (ctx.chat?.type !== 'private') {
            // only admins can register & unregister
            const userId = ctx.from?.id || 0;
            const chatMember = await ctx.getChatMember(userId);
            const isAdmin = ['administrator', 'creator'].includes(
                chatMember?.status,
            );
            if (!isAdmin) {
                await ctx.reply('⚠️ This feature is available for admin only.');
                return;
            }
        }

        const args = ctx.message.text.split(' ').slice(1);

        const availableCommands = {
            minimumVotes: 'Minimum Votes',
            nextCommand: 'Next Command',
            nextOnlyAdmin: 'Next Only Admin',
            previousCommand: 'Previous Command',
            previousOnlyAdmin: 'Previous Only Admin',
            muteCommand: 'Mute Command',
            unmuteCommand: 'Unmute Command',
            volumeCommand: 'Volume Command',
            maxQueueSize: 'Max Queue Size',
        };

        if (
            args.length < 2 ||
            !Object.keys(availableCommands).includes(args[0])
        ) {
            await ctx.reply(
                [
                    '⚠️ Please provide a command and a value.\n',
                    `Usage: /set <command> <value>\n`,
                    `Available commands:\n`,
                    // ...availableCommands.map((c) => `- ${c}`),
                    ...Object.entries(availableCommands).map(
                        ([key]) => `- ${key}`,
                    ),
                    `\nExample: /set minimumVotes 5`,
                    `\nNote: Only admins can set the feature.`,
                ].join('\n'),
            );
            return;
        }

        const command = args[0];
        const value = args[1];

        let featureName: string = '';
        let featureValue: boolean | number = false;

        switch (command) {
            case 'minimumVotes':
            case 'maxQueueSize': {
                const errMsg = validateConfigNumber(value);
                if (errMsg !== '') {
                    await ctx.reply(errMsg);
                    return;
                }

                featureName = availableCommands[command];
                featureValue = parseInt(value);

                break;
            }
            case 'nextCommand':
            case 'nextOnlyAdmin':
            case 'previousCommand':
            case 'previousOnlyAdmin':
            case 'muteCommand':
            case 'unmuteCommand':
            case 'volumeCommand': {
                featureName = availableCommands[command];
                featureValue = value === 'true' ? true : false;
                break;
            }
        }

        await this.playbackService.setFeature(room.id, command, featureValue);

        await ctx.reply(`Set ${featureName} to ${featureValue}`);
    }

    @Command('info')
    async getRoomInfo(
        @Ctx()
        ctx: Context & {
            message: { text: string };
        },
    ) {
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

        // load queue
        const queues = await this.playbackService.getQueues(room.id);

        await ctx.reply(
            [
                '🎛️ Current Room Info: \n',
                `🆔 Room: <code>${room.id}</code>`,
                `💬 Chat ID: ${room.chatId}`,
                `🎧 Queue: ${queues.length} songs`,
                `🖥️ Devices Count: ${room.Devices.length}`,
                `📅 Created At: ${room.createdAt.toLocaleString()}`,
            ].join('\n'),
            {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [
                        Markup.button.callback('📋 View queue', 'menu:queue'),
                        Markup.button.callback('🖥 Devices', 'menu:devices'),
                    ],
                    [Markup.button.callback('🎛 Controls', 'menu:home')],
                ]),
            },
        );
    }

    @InlineQuery(/.*/)
    async search(
        @Ctx()
        ctx: NarrowedContext<Context<UpdateType>, UpdateType.InlineQueryUpdate>,
    ) {
        try {
            // get songs
            const searchQuery = ctx?.update?.inline_query?.query; // Change to your search keyword

            const inlineQueryID = ctx?.update?.inline_query?.id;
            if (!inlineQueryID) return;

            if (!searchQuery || searchQuery.length < 3) return;

            const songs = await this.ytmusicService.searchSongs(searchQuery);

            const senderID = ctx.from.id;

            const cacheExpireTime = 24 * 60 * 60 * 1000; // 24 hours

            const videoIds: string[] = [];

            const songsToCache = songs.map((row) => ({
                videoId: row.videoId,
                name: row.name,
                artist: row.artist,
                duration: row.duration,
            })) as Song[];

            await Promise.all([
                this.cacheManager.set<Song[]>(
                    `songs:${inlineQueryID}`,
                    songsToCache,
                    cacheExpireTime,
                ),
                ...songsToCache.map((song) =>
                    this.cacheManager.set<Song>(
                        `song:${song.videoId}`,
                        song,
                        cacheExpireTime,
                    ),
                ),
            ]);

            await ctx.answerInlineQuery(
                songs
                    .filter((row) => {
                        if (videoIds.includes(row.videoId)) return false;

                        videoIds.push(row.videoId);
                        return true;
                    })
                    .map(
                        (row): InlineQueryResult => ({
                            id: `${inlineQueryID}:${row.videoId}`,
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
                    ),
                { cache_time: 60, is_personal: true },
            );
        } catch (e) {
            const searchError = e as {
                message?: string;
                response?: { status?: number; data?: unknown };
            };
            const responseData = searchError.response?.data;
            const responseSummary =
                typeof responseData === 'string'
                    ? responseData.replace(/\s+/g, ' ').slice(0, 300)
                    : JSON.stringify(responseData)?.slice(0, 300);

            console.error('YouTube Music inline search failed:', {
                status: searchError.response?.status,
                message: searchError.message ?? String(e),
                response: responseSummary,
            });
        }
    }

    @On('chosen_inline_result')
    async chosenInlineResult(
        @Ctx()
        ctx: Context<UpdateType.ChosenInlineResultUpdate>,
    ) {
        const { inline_message_id } = ctx.update.chosen_inline_result;
        if (!inline_message_id) return;

        // get result id
        const resultId = ctx.update.chosen_inline_result.result_id;

        // get search query id
        const [inlineQueryID, videoId] = resultId.split(':');

        // get from cache
        const cacheKey = `songs:${inlineQueryID}`;
        const cachedSongs = await this.cacheManager.get<Song[]>(cacheKey);
        let song =
            (await this.cacheManager.get<Song>(`song:${videoId}`)) ??
            cachedSongs?.find((row) => row.videoId === videoId);
        if (!song) {
            try {
                song = await this.fetchSongSummary(videoId);
            } catch (error) {
                console.error('Could not load selected YouTube Music song:', {
                    videoId,
                    message:
                        error instanceof Error ? error.message : String(error),
                });
                await ctx.telegram.editMessageText(
                    undefined,
                    undefined,
                    inline_message_id,
                    `⚠️ Could not load this song. Please search for it again.`,
                );
                return;
            }
        }

        // Keep the selection available while the user confirms the queue action.
        const cacheExpireTime = 24 * 60 * 60 * 1000; // 24 hours
        const cacheKeySong = `song:${inline_message_id}:${videoId}`;
        await this.cacheManager.set<Song>(cacheKeySong, song, cacheExpireTime);
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
        ) {
            return;
        }

        const videoId = addToQueueBtn.callback_data.split(':')[2];

        const messageInlineID = addToQueueBtn.callback_data.split(':')[3];

        // get the room
        const chatId = ctx.chat?.id.toString() || '';
        if (!chatId) return;

        const room = await this.playbackService.getRoomByChatId(chatId);
        if (!room) {
            await ctx.telegram.editMessageText(
                undefined,
                undefined,
                messageInlineID,
                `🚫 No party here—Music Party isn't available in this chat`,
            );
            return;
        }

        const roomId = room.id;

        // limit the queue to 10 songs
        const queueLimit = room.Feature ? room.Feature.maxQueueSize : 10;
        const queues = await this.playbackService.getQueues(roomId);
        if (queues.length >= queueLimit) {
            await ctx.telegram.editMessageText(
                undefined,
                undefined,
                messageInlineID,
                `🚫 Queue is full. Please remove some songs before adding new ones.`,
            );
            return;
        }

        // get from cache
        const cacheKey = `song:${messageInlineID}:${videoId}`;
        let cachedSong =
            (await this.cacheManager.get<Song>(cacheKey)) ??
            (await this.cacheManager.get<Song>(`song:${videoId}`));
        if (!cachedSong) {
            try {
                cachedSong = await this.fetchSongSummary(videoId);
            } catch (error) {
                console.error('Could not load queued YouTube Music song:', {
                    videoId,
                    message:
                        error instanceof Error ? error.message : String(error),
                });
                await ctx.telegram.editMessageText(
                    undefined,
                    undefined,
                    messageInlineID,
                    `⚠️ Could not load this song. Please search for it again.`,
                    { parse_mode: 'HTML' },
                );
                return;
            }
        }

        // // get the song detail
        // const song = await this.ytmusicService.getSong(videoId);

        // check song is already in queue
        if (queues.find((q) => q.url === videoId)) {
            await ctx.telegram.editMessageText(
                undefined,
                undefined,
                messageInlineID,
                `🔁 "<i>${cachedSong.name} by ${cachedSong.artist.name}</i>" is already in the queue.`,
                {
                    parse_mode: 'HTML',
                },
            );
            return;
        }

        const songCombined = `${cachedSong.name} - ${cachedSong.artist.name} [${formatDuration(
            cachedSong.duration || 0,
        )}]`;

        const adderKey = `queueAdder:${messageInlineID}:${videoId}`;
        const addedBy = await this.cacheManager.get<string>(adderKey);
        await this.playbackService.addToQueue(
            roomId,
            videoId,
            songCombined,
            addedBy,
        );

        await ctx.telegram.editMessageText(
            undefined,
            undefined,
            messageInlineID,
            `↩️ ${songCombined
                .split(' - ')
                .map((v, k) => {
                    if (k === 0) {
                        return `<i>${v}</i>`;
                    }
                    return v;
                })
                .join(' - ')} added to the queue.`,
            {
                parse_mode: 'HTML',
            },
        );

        // remove from cache
        await this.cacheManager.delete(cacheKey);
        await this.cacheManager.delete(adderKey);

        // emit add to queue
        this.gateway.addToQueueCommand(roomId, videoId);
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

        const inlineMessageId = ctx.update.callback_query.inline_message_id;
        if (inlineMessageId) {
            const addedBy = ctx.from.username
                ? `@${ctx.from.username}`
                : [ctx.from.first_name, ctx.from.last_name]
                      .filter(Boolean)
                      .join(' ');
            await this.cacheManager.set(
                `queueAdder:${inlineMessageId}:${videoId}`,
                addedBy || `User ${ctx.from.id}`,
                24 * 60 * 60 * 1000,
            );
        }

        await ctx.answerCbQuery('Adding to queue...');

        await ctx.editMessageReplyMarkup({
            inline_keyboard: [
                [
                    Markup.button.callback(
                        `Verifying..`,
                        `verify:${senderID}:${videoId}:${ctx.update.callback_query.inline_message_id}`,
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
        await ctx.editMessageText('❌ Canceled.');
    }

    @Action(/verify:(.*)/)
    async verify(
        @Ctx()
        ctx: Context<UpdateType.CallbackQueryUpdate<CallbackQuery>> &
            Omit<Context<UpdateType>, keyof Context<UpdateType>> & {
                match: RegExpExecArray;
            },
    ) {
        const [senderID] = ctx.match[1].split(':');

        if (!senderID) return;

        if (parseInt(senderID) !== ctx.from.id) {
            await ctx.answerCbQuery('You are not allowed to do this action');
            return;
        }

        await ctx.answerCbQuery('Sabar...');
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

        // check if queue is empty
        if (!data || data.length === 0) {
            await ctx.reply(
                [
                    '🚫 No tracks in the queue right now.',
                    `Don't worry—auto-queue will kick in if something's already playing.`,
                ].join('\n'),
                Markup.inlineKeyboard([
                    [Markup.button.callback('🔄 Refresh queue', 'menu:queue')],
                    [Markup.button.callback('🎛 Controls', 'menu:home')],
                ]),
            );
            return;
        }

        await ctx.reply(
            [
                `🎧 Current Queue:`,
                `${data
                    .map(
                        (d, i) =>
                            `${i + 1}. "${d.title
                                .split(' - ')
                                .map((value, partIndex) => {
                                    const safeValue = value
                                        .replace(/&/g, '&amp;')
                                        .replace(/</g, '&lt;')
                                        .replace(/>/g, '&gt;')
                                        .replace(/"/g, '&quot;');
                                    return partIndex === 0
                                        ? `<i>${safeValue}</i>`
                                        : safeValue;
                                })
                                .join(' - ')}"\n   👤 Added by: ${
                                d.addedBy
                                    ? d.addedBy
                                          .replace(/&/g, '&amp;')
                                          .replace(/</g, '&lt;')
                                          .replace(/>/g, '&gt;')
                                          .replace(/"/g, '&quot;')
                                    : 'unknown'
                            }`,
                    )
                    .join('\n')}`,
            ].join('\n'),
            {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('🔄 Refresh queue', 'menu:queue')],
                    ...(room.Feature?.nextCommand
                        ? [[Markup.button.callback('⏭ Skip', 'menu:next')]]
                        : []),
                    [Markup.button.callback('🎛 Controls', 'menu:home')],
                ]),
            },
        );
    }
}
