import {
    Ctx,
    Start,
    Command,
    On,
    Action,
    Update,
    InlineQuery,
} from 'nestjs-telegraf';
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

    @Start()
    async start(@Ctx() ctx: Context) {
        const instructions = [
            'Create a room by typing /register',
            'Copy the room id',
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
        @Ctx()
        ctx: Context & {
            chat: { members_count?: number };
            message: { chat: { title: string } };
        },
    ) {
        const chatId = ctx.chat?.id.toString() || '';
        if (!chatId) {
            await ctx.reply('No chat id');
            return;
        }

        // if not in private chat
        if (ctx.chat.type !== 'private') {
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
            ctx.message?.chat.title || '',
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
        if (room.Feature && room.Feature.nextCommand !== true) {
            await ctx.reply('⚠️ This feature is currently disabled.');
            return;
        }

        if (room.Feature && room.Feature.nextOnlyAdmin === true) {
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
        if (room.Feature && room.Feature.previousCommand !== true) {
            await ctx.reply('⚠️ This feature is currently disabled.');
            return;
        }

        if (room.Feature && room.Feature.previousOnlyAdmin === true) {
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
        if (room.Feature && room.Feature.muteCommand !== true) {
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
        if (room.Feature && room.Feature.unmuteCommand !== true) {
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
        if (room.Feature && room.Feature.volumeCommand !== true) {
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
        if (room.Feature && room.Feature.volumeCommand !== true) {
            await ctx.reply('⚠️ This feature is currently disabled.');
            return;
        }

        this.gateway.volumeDown(room.id);
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
            await ctx.reply('No devices connected');
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
            [
                '🎛️ Current Feature: \n',
                `Minimum Votes: ${feature.minimumVotes}`,
                `Next Command: ${feature.nextCommand}`,
                `Next Only Admin: ${feature.nextOnlyAdmin}`,
                `Previous Command: ${feature.previousCommand}`,
                `Previous Only Admin: ${feature.previousOnlyAdmin}`,
                `Mute Command: ${feature.muteCommand}`,
                `Unmute Command: ${feature.unmuteCommand}`,
                `Volume Command: ${feature.volumeCommand}`,
                `Max Queue Size: ${feature.maxQueueSize}`,
            ].join('\n'),
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
                `🆔 Room: \`${room.id}\``,
                `💬 Chat ID: ${room.chatId}`,
                `🎧 Queue: ${queues.length} songs`,
                `🖥️ Devices Count: ${room.Devices.length}`,
                `📅 Created At: ${room.createdAt.toLocaleString()}`,
            ].join('\n'),
            {
                parse_mode: 'MarkdownV2',
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

            const cacheExpireTime = 60 * 1000; // 1 minute

            const videoIds: string[] = [];

            const cacheKey = `songs:${inlineQueryID}`;
            const cachedData = await this.cacheManager.get<Song>(cacheKey);
            if (!cachedData) {
                void this.cacheManager.set<Song[]>(
                    cacheKey,
                    songs.map((row) => ({
                        videoId: row.videoId,
                        name: row.name,
                        artist: row.artist,
                        duration: row.duration,
                    })) as Song[],
                    cacheExpireTime,
                );
            }

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
                {},
            );
        } catch (e) {
            console.error(e);
        }
    }

    @On('chosen_inline_result')
    async chosenInlineResult(
        @Ctx()
        ctx: Context<UpdateType.ChosenInlineResultUpdate>,
    ) {
        const { inline_message_id, query } = ctx.update.chosen_inline_result;
        if (!inline_message_id || !query) return;

        // get result id
        const resultId = ctx.update.chosen_inline_result.result_id;

        // get search query id
        const [inlineQueryID, videoId] = resultId.split(':');

        // get from cache
        const cacheKey = `songs:${inlineQueryID}`;
        const cachedSongs = await this.cacheManager.get<Song[]>(cacheKey);
        if (!cachedSongs) {
            await ctx.telegram.editMessageText(
                undefined,
                undefined,
                inline_message_id,
                `🔗 This link has expired. Please try generating a new one.`,
            );
            return;
        }

        // get the song detail
        const song = cachedSongs.find((row) => row.videoId === videoId);
        if (!song) {
            await ctx.telegram.editMessageText(
                undefined,
                undefined,
                inline_message_id,
                `⚠️ Something went wrong with the link. Please try again or request a new one.`,
            );
            return;
        }

        // remove from cache
        await this.cacheManager.delete(cacheKey);

        // set cache for wait verifying
        const cacheExpireTime = 60 * 1000 * 5; // 5 minute
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
        const cachedSong = await this.cacheManager.get<Song>(cacheKey);
        if (!cachedSong) {
            await ctx.telegram.editMessageText(
                undefined,
                undefined,
                messageInlineID,
                `🔗 This link has expired. Please try generating a new one.`,
                {
                    parse_mode: 'HTML',
                },
            );
            return;
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

        await this.playbackService.addToQueue(roomId, videoId, songCombined);

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
                                .map((v, i) => {
                                    if (i === 0) {
                                        return `<i>${v}</i>`;
                                    }
                                    return v;
                                })
                                .join(' - ')}"`,
                    )
                    .join('\n')}`,
            ].join('\n'),
            {
                parse_mode: 'HTML',
            },
        );
    }
}
