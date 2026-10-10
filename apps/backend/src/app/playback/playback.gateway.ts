import {
    ConnectedSocket,
    MessageBody,
    OnGatewayDisconnect,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PlaybackService } from './playback.service';
import { Join } from 'src/types/playback.type';
import { from, map } from 'rxjs';
import { YTMusicService } from 'src/platform/yt-music.service';

type NowPlaying = {
    videoId: string | null;
    title: string;
    artist: string;
    artwork: string | null;
};

@WebSocketGateway({ cors: { origin: '*' } })
export class PlaybackGateway implements OnGatewayDisconnect {
    private readonly playbackStates = new Map<
        string,
        'playing' | 'paused' | 'standby'
    >();
    private readonly currentlyPlaying = new Map<string, NowPlaying | null>();

    constructor(
        private readonly playbackService: PlaybackService,
        private readonly ytmusicService: YTMusicService,
    ) {}
    @WebSocketServer() wss: Server;

    getPlaybackState(roomId: string) {
        return this.playbackStates.get(roomId) ?? null;
    }

    getCurrentlyPlaying(roomId: string) {
        return this.currentlyPlaying.get(roomId) ?? null;
    }

    private dashboardRoom(roomId: string) {
        return `dashboard:${roomId}`;
    }

    notifyRoomUpdated(
        roomId: string,
        joinedDevice?: string,
        playbackState?: 'playing' | 'paused' | 'standby' | null,
        currentlyPlaying?: NowPlaying | null,
    ) {
        const update = {
            joinedDevice,
            ...(playbackState !== undefined ? { playbackState } : {}),
            ...(currentlyPlaying !== undefined ? { currentlyPlaying } : {}),
        };
        this.wss?.to(this.dashboardRoom(roomId)).emit('roomUpdated', update);
        this.wss?.to(roomId).emit('roomUpdated', update);
    }

    async handleDisconnect(client: Socket) {
        const roomId = client.data.roomId as string | undefined;
        if (!roomId || !this.wss) return;

        setTimeout(async () => {
            const clients = await this.wss.in(roomId).fetchSockets();
            if (clients.length === 0) {
                this.playbackStates.delete(roomId);
                this.currentlyPlaying.delete(roomId);
                this.notifyRoomUpdated(roomId, undefined, null, null);
                return;
            }
            this.notifyRoomUpdated(roomId);
        }, 0);
    }

    // Function to emit events from the server
    playCommand(roomID: string) {
        console.log(`Emitting 'play' event to ${roomID}`);
        this.wss.to(roomID).emit('play');
    }

    countConnectedClients(roomID: string) {
        console.log(`Emitting 'count' event to ${roomID}`);
        return from(this.wss.in(roomID).fetchSockets()).pipe(
            map((sockets) => sockets.length),
        );
    }

    pauseCommand(roomID: string) {
        console.log(`Emitting 'pause' event to ${roomID}`);
        this.wss.to(roomID).emit('pause');
    }

    nextCommand(roomID: string) {
        console.log(`Emitting 'next' event to ${roomID}`);
        this.wss.to(roomID).emit('next');
    }

    previousCommand(roomID: string) {
        console.log(`Emitting 'prev' event to ${roomID}`);
        this.wss.to(roomID).emit('prev');
    }

    volumeUp(roomID: string) {
        console.log(`Emitting 'volumeUp' event to ${roomID}`);
        this.wss.to(roomID).emit('volumeUp');
    }

    volumeDown(roomID: string) {
        console.log(`Emitting 'volumeDown' event to ${roomID}`);
        this.wss.to(roomID).emit('volumeDown');
    }

    muteCommand(roomID: string) {
        console.log(`Emitting 'mute' event to ${roomID}`);
        this.wss.to(roomID).emit('mute');
    }

    unmuteCommand(roomID: string) {
        console.log(`Emitting 'unmute' event to ${roomID}`);
        this.wss.to(roomID).emit('unmute');
    }

    lyricsCommand(roomID: string) {
        console.log(`Emitting 'lyrics' event to ${roomID}`);
        this.wss.to(roomID).emit('lyrics');
    }

    addToQueueCommand(roomID: string, videoId: string) {
        console.log(`Emitting 'addToQueue' event to ${roomID}`);
        this.wss.to(roomID).emit('addToQueue', { videoId });
        this.notifyRoomUpdated(roomID);
    }

    leave(roomID: string) {
        console.log(`Emitting 'leave' event to ${roomID}`);
        this.wss.to(roomID).emit('leave');
    }

    @SubscribeMessage('watchRoom')
    async watchRoom(
        @ConnectedSocket() socket: Socket,
        @MessageBody() data: { roomId?: string },
    ) {
        const roomId = data.roomId?.trim();
        if (!roomId || !(await this.playbackService.getRoom(roomId))) return;

        await socket.join(this.dashboardRoom(roomId));
        socket.emit('roomUpdated');
    }

    @SubscribeMessage('unwatchRoom')
    async unwatchRoom(
        @ConnectedSocket() socket: Socket,
        @MessageBody() data: { roomId?: string },
    ) {
        const roomId = data.roomId?.trim();
        if (roomId) await socket.leave(this.dashboardRoom(roomId));
    }

    @SubscribeMessage('join')
    async onJoin(@ConnectedSocket() socket: Socket, @MessageBody() data: Join) {
        // get room
        const room = await this.playbackService.getRoom(data.id);

        if (!room) {
            console.log('join: room not found');
            return;
        }

        // check device is already joined
        const device = await this.playbackService.getRoomDevice(
            room.id,
            data.fingerprint,
        );
        let joinedDevice: string | undefined;

        if (!device) {
            // add device
            await this.playbackService.addDevice(
                room.id,
                data.fingerprint,
                data.browser,
            );
            joinedDevice = data.browser?.trim() || 'A player';

            // send message
            if (room.chatId) {
                await this.playbackService.sendMessageToRoomTopic(
                    room.chatId,
                    room.topicId,
                    `${data.browser} joined`,
                );
            }
        }

        socket.data.roomId = room.id;
        await socket.join(room.id);

        // emit join with queue
        const queues = await this.playbackService.getQueues(room.id);
        socket.emit('joined', queues);
        this.notifyRoomUpdated(room.id, joinedDevice);

        console.log('player joined', data.id);
    }

    @SubscribeMessage('playbackState')
    onPlaybackState(
        @ConnectedSocket() socket: Socket,
        @MessageBody()
        data: {
            roomId: string;
            state: 'playing' | 'paused' | 'standby';
            currentlyPlaying?: NowPlaying | null;
        },
    ) {
        if (
            socket.data.roomId !== data.roomId ||
            !['playing', 'paused', 'standby'].includes(data.state)
        ) {
            return;
        }
        this.playbackStates.set(data.roomId, data.state);
        if ('currentlyPlaying' in data) {
            this.currentlyPlaying.set(data.roomId, data.currentlyPlaying ?? null);
        }
        this.notifyRoomUpdated(
            data.roomId,
            undefined,
            data.state,
            'currentlyPlaying' in data ? data.currentlyPlaying : undefined,
        );
    }

    @SubscribeMessage('leave')
    async onLeave(
        @ConnectedSocket() socket: Socket,
        @MessageBody() data: { roomId: string; fingerprint: string },
    ) {
        console.log('Leaving', data);

        // get device
        const device = await this.playbackService.getRoomDevice(
            data.roomId,
            data.fingerprint,
        );

        if (!device) {
            console.log('Device not found');
            return;
        }

        if (device.room.chatId) {
            await this.playbackService.sendMessageToRoomTopic(
                device.room.chatId,
                device.room.topicId,
                `${device.name} leaved`,
            );
        }

        // remove device
        await this.playbackService.removeDevice(data.roomId, data.fingerprint);
        this.notifyRoomUpdated(data.roomId);

        // void socket.leave(data.roomId);
    }

    @SubscribeMessage('started')
    async onStartedNewSong(
        @MessageBody() data: { roomId: string; videoId: string },
    ) {
        console.log('Start new songs', data);

        // get room
        const room = await this.playbackService.getRoom(data.roomId);

        if (!room) {
            console.log('Room not found');
            return;
        }

        // remove from queue
        const queue = await this.playbackService.getQueue(data.roomId);

        if (queue && queue.url === data.videoId) {
            if (queue.url === data.videoId) {
                // delete song
                await this.playbackService.removeQueue(
                    data.roomId,
                    data.videoId,
                );
            }
        }

        // clear votes
        await this.playbackService.removeRoomVotes(data.roomId);
        this.notifyRoomUpdated(data.roomId);
    }

    @SubscribeMessage('notify')
    async onNotify(@MessageBody() data: { roomId: string; message: string }) {
        // get room
        const room = await this.playbackService.getRoom(data.roomId);

        if (!room) {
            console.log('Room not found');
            return;
        }

        if (!room.chatId) return;

        if (/^Now playing:/i.test(data.message)) {
            let imageUrl: string | undefined;
            const track = data.message.match(
                /^Now playing:\s*___"?(.+?)"?___\s+by\s+(.+?)\s+🎧?$/i,
            );
            if (track?.[1]) {
                try {
                    const artist = track[2]?.trim();
                    const query =
                        artist && artist.toLowerCase() !== 'undefined'
                            ? `${track[1].trim()} ${artist}`
                            : track[1].trim();
                    const [song] = await this.ytmusicService.searchSongs(query);
                    if (song?.videoId) {
                        imageUrl = `https://img.youtube.com/vi/${encodeURIComponent(song.videoId)}/default.jpg`;
                    }
                } catch (error) {
                    console.warn('Could not find Now Playing artwork', error);
                }
            }
            await this.playbackService.sendNowPlayingWithActions(
                room.chatId,
                data.message,
                imageUrl,
                room.topicId,
            );
            return;
        }

        const panelUpdated =
            await this.playbackService.updateVolumePanelMessage(
                room.chatId,
                room.topicId,
                data.message,
            );
        if (!panelUpdated) {
            await this.playbackService.sendMessageToRoomTopic(
                room.chatId,
                room.topicId,
                data.message,
            );
        }
    }
}
