import {
    BadRequestException,
    Body,
    Controller,
    ConflictException,
    Delete,
    Get,
    InternalServerErrorException,
    NotFoundException,
    Patch,
    Param,
    Post,
} from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { PlaybackGateway } from './playback.gateway';
import { PlaybackService } from './playback.service';
import { YTMusicService } from 'src/platform/yt-music.service';
import { getRandomHumanReadable } from '@marianmeres/random-human-readable';

const controls = {
    play: 'playCommand',
    pause: 'pauseCommand',
    next: 'nextCommand',
    previous: 'previousCommand',
    volumeUp: 'volumeUp',
    volumeDown: 'volumeDown',
    mute: 'muteCommand',
    unmute: 'unmuteCommand',
    lyrics: 'lyricsCommand',
} as const;

@Controller('api')
export class PlaybackApiController {
    constructor(
        private readonly playback: PlaybackService,
        private readonly gateway: PlaybackGateway,
        private readonly youtubeMusic: YTMusicService,
    ) {}

    @Get('rooms')
    async rooms() {
        const rooms = await this.playback.getRooms();
        return Promise.all(
            rooms.map(async (room) => ({
                id: room.id,
                name: room.name,
                chatId: room.chatId,
                devices: room.Devices.length,
                queueCount: (await this.playback.getQueues(room.id)).length,
            })),
        );
    }

    @Post('rooms/generate')
    async generateRoomCode() {
        for (let attempt = 0; attempt < 10; attempt += 1) {
            const id = getRandomHumanReadable({
                adjCount: 1,
                colorsCount: 0,
                nounsCount: 2,
                joinWith: '-',
            }) as string;
            if (!(await this.playback.getRoom(id))) return { id };
        }

        throw new InternalServerErrorException(
            'Could not generate a unique room code. Please try again.',
        );
    }

    @Post('rooms')
    async createRoom(@Body() body: { id?: string; name?: string }) {
        const id = body.id?.trim();
        const name = body.name?.trim();
        if (!id || !/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(id) || id.length > 80) {
            throw new BadRequestException('Generate a valid room code first');
        }
        if (!name || name.length > 50) {
            throw new BadRequestException(
                'Room name must be between 1 and 50 characters',
            );
        }
        if (await this.playback.getRoom(id)) {
            throw new ConflictException(
                'That room code has already been used. Generate another one.',
            );
        }
        // Empty chatId marks a room created on the web with no Telegram group.
        await this.playback.addRoom(id, '', name);
        return { id, name };
    }

    @Get('rooms/:roomId')
    async room(@Param('roomId') roomId: string) {
        const room = await this.playback.getRoom(roomId);
        if (!room) throw new NotFoundException('Room not found');
        const [queue, clients] = await Promise.all([
            this.playback.getQueues(roomId),
            firstValueFrom(this.gateway.countConnectedClients(roomId)),
        ]);
        const [votes, connectedDevices] = await Promise.all([
            this.playback.countVotes(roomId),
            Promise.resolve(room.Devices.map((device) => ({
                name: device.name,
                fingerprint: device.fingerprint,
                createdAt: device.createdAt,
            }))),
        ]);
        return {
            id: room.id,
            name: room.name,
            chatId: room.chatId,
            createdAt: room.createdAt,
            feature: room.Feature,
            devices: connectedDevices,
            connectedClients: clients,
            playbackState: clients > 0 ? this.gateway.getPlaybackState(roomId) : null,
            currentlyPlaying: clients > 0 ? this.gateway.getCurrentlyPlaying(roomId) : null,
            votes,
            queue,
            queueLimit: room.Feature?.maxQueueSize ?? 25,
        };
    }

    @Post('rooms/:roomId/join')
    async joinRoom(
        @Param('roomId') roomId: string,
        @Body() body: { handle?: string },
    ) {
        const room = await this.playback.getRoom(roomId);
        if (!room) throw new NotFoundException('Room not found');
        const handle = body.handle?.trim();
        if (!handle || handle.length > 32) {
            throw new BadRequestException('Handle must be between 1 and 32 characters');
        }
        return { id: room.id, name: room.name, handle };
    }

    @Patch('rooms/:roomId/settings')
    async updateSettings(
        @Param('roomId') roomId: string,
        @Body() body: Record<string, unknown>,
    ) {
        const room = await this.playback.getRoom(roomId);
        if (!room) throw new NotFoundException('Room not found');
        const booleanSettings = [
            'nextCommand', 'nextOnlyAdmin', 'previousCommand',
            'previousOnlyAdmin', 'muteCommand', 'unmuteCommand', 'volumeCommand',
            'silentNotifications',
        ] as const;
        const numericSettings = ['minimumVotes', 'maxQueueSize'] as const;
        const updates = Object.entries(body);
        if (!updates.length) throw new BadRequestException('Provide at least one setting');
        for (const [key, value] of updates) {
            if ((booleanSettings as readonly string[]).includes(key)) {
                if (typeof value !== 'boolean') throw new BadRequestException(`${key} must be true or false`);
            } else if ((numericSettings as readonly string[]).includes(key)) {
                if (!Number.isInteger(value) || Number(value) < 1) {
                    throw new BadRequestException(`${key} must be a positive integer`);
                }
            } else {
                throw new BadRequestException(`Unknown setting: ${key}`);
            }
        }
        await Promise.all(updates.map(([key, value]) =>
            this.playback.setFeature(roomId, key, value as number | boolean),
        ));
        this.gateway.notifyRoomUpdated(roomId);
        return { ok: true };
    }

    @Post('rooms/:roomId/vote-next')
    async voteNext(
        @Param('roomId') roomId: string,
        @Body() body: { userId?: string },
    ) {
        const room = await this.playback.getRoom(roomId);
        if (!room) throw new NotFoundException('Room not found');
        if (!room.Feature?.nextCommand) throw new BadRequestException('Voting to skip is disabled');
        const userId = body.userId?.trim();
        if (!userId || userId.length > 100) throw new BadRequestException('A voter id is required');
        if (await this.playback.hasVote(roomId, userId)) {
            throw new ConflictException('You have already voted to skip');
        }
        const votes = await this.playback.countVotes(roomId);
        const minimumVotes = room.Feature.minimumVotes;
        if (votes + 1 >= minimumVotes) {
            this.gateway.nextCommand(roomId);
            await this.playback.removeRoomVotes(roomId);
            this.gateway.notifyRoomUpdated(roomId);
            return { ok: true, passed: true, votes: minimumVotes, minimumVotes };
        }
        await this.playback.addVote(roomId, userId);
        this.gateway.notifyRoomUpdated(roomId);
        return { ok: true, passed: false, votes: votes + 1, minimumVotes };
    }

    @Delete('rooms/:roomId')
    async deleteRoom(@Param('roomId') roomId: string) {
        const room = await this.playback.getRoom(roomId);
        if (!room) throw new NotFoundException('Room not found');
        this.gateway.leave(roomId);
        await this.playback.removeRoom(roomId);
        this.gateway.notifyRoomUpdated(roomId);
        return { ok: true };
    }

    @Post('search')
    async search(@Body() body: { query?: string }) {
        const query = body.query?.trim();
        if (!query || query.length < 2) {
            throw new BadRequestException('Enter at least two characters');
        }
        const results = await this.youtubeMusic.searchSongs(query);
        return results.slice(0, 10).map((song) => ({
            videoId: song.videoId,
            title: song.name,
            artist: song.artist?.name ?? 'Unknown artist',
            duration: song.duration ?? 0,
            artwork: song.thumbnails?.[0]?.url ?? null,
        }));
    }

    @Post('rooms/:roomId/queue')
    async addToQueue(
        @Param('roomId') roomId: string,
        @Body() body: { videoId?: string; handle?: string; artwork?: string | null },
    ) {
        const videoId = body.videoId?.trim();
        if (!videoId) throw new BadRequestException('videoId is required');
        const room = await this.playback.getRoom(roomId);
        if (!room) throw new NotFoundException('Room not found');
        const queue = await this.playback.getQueues(roomId);
        if (queue.length >= (room.Feature?.maxQueueSize ?? 25)) {
            throw new BadRequestException('Queue is full');
        }
        if (queue.some((item) => item.url === videoId)) {
            throw new BadRequestException('This song is already in the queue');
        }
        const song = await this.youtubeMusic.getSong(videoId);
        const title = `${song.name} - ${song.artist?.name ?? 'Unknown artist'}`;
        const handle = body.handle?.trim();
        if (!handle || handle.length > 32) {
            throw new BadRequestException('Join this room with a handle before adding songs');
        }
        const artwork = this.normalizeArtwork(body.artwork);
        await this.playback.addToQueue(roomId, videoId, title, handle, artwork);
        this.gateway.addToQueueCommand(roomId, videoId);
        return { ok: true };
    }

    @Delete('rooms/:roomId/queue/:videoId')
    async removeFromQueue(
        @Param('roomId') roomId: string,
        @Param('videoId') videoId: string,
    ) {
        const room = await this.playback.getRoom(roomId);
        if (!room) throw new NotFoundException('Room not found');
        await this.playback.removeQueue(roomId, videoId);
        this.gateway.notifyRoomUpdated(roomId);
        return { ok: true };
    }

    @Post('rooms/:roomId/control')
    async control(
        @Param('roomId') roomId: string,
        @Body() body: { action?: string },
    ) {
        const room = await this.playback.getRoom(roomId);
        if (!room) throw new NotFoundException('Room not found');
        const action = body.action as keyof typeof controls | undefined;
        const method = action ? controls[action] : undefined;
        if (!action || !method) throw new BadRequestException('Unknown action');
        if (
            (await firstValueFrom(this.gateway.countConnectedClients(roomId))) ===
            0
        ) {
            throw new BadRequestException('No player is connected to this room');
        }

        if (action === 'next' && !room.Feature?.nextCommand) {
            throw new BadRequestException('Skip is disabled for this room');
        }
        if (action === 'previous' && !room.Feature?.previousCommand) {
            throw new BadRequestException('Previous is disabled for this room');
        }
        if (
            (action === 'volumeUp' || action === 'volumeDown') &&
            !room.Feature?.volumeCommand
        ) {
            throw new BadRequestException('Volume controls are disabled');
        }
        if (action === 'mute' && !room.Feature?.muteCommand) {
            throw new BadRequestException('Mute is disabled');
        }
        if (action === 'unmute' && !room.Feature?.unmuteCommand) {
            throw new BadRequestException('Unmute is disabled');
        }
        this.gateway[method](roomId);
        return { ok: true, action };
    }

    private normalizeArtwork(value?: string | null) {
        if (value == null) return null;
        if (typeof value !== 'string') {
            throw new BadRequestException('Artwork URL is invalid');
        }
        if (!value.trim()) return null;

        let url: URL;
        try {
            url = new URL(value.trim());
        } catch {
            throw new BadRequestException('Artwork URL is invalid');
        }

        const allowedDomains = [
            'googleusercontent.com',
            'ytimg.com',
            'ggpht.com',
            'youtube.com',
        ];
        const isAllowedDomain = allowedDomains.some(
            (domain) =>
                url.hostname === domain || url.hostname.endsWith(`.${domain}`),
        );
        if (url.protocol !== 'https:' || !isAllowedDomain) {
            throw new BadRequestException('Artwork must use a YouTube image URL');
        }

        return url.toString();
    }
}
