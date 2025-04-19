import {
    ConnectedSocket,
    MessageBody,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PlaybackService } from './playback.service';
import { Join } from 'src/types/playback.type';
import { from, map } from 'rxjs';

@WebSocketGateway({ cors: { origin: '*' } })
export class PlaybackGateway {
    constructor(private readonly playbackService: PlaybackService) {}
    @WebSocketServer() wss: Server;

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
    }

    leave(roomID: string) {
        console.log(`Emitting 'leave' event to ${roomID}`);
        this.wss.to(roomID).emit('leave');
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

        if (!device) {
            // add device
            await this.playbackService.addDevice(
                room.id,
                data.fingerprint,
                data.browser,
            );

            // send message
            await this.playbackService.sendMessage(
                room.chatId,
                `${data.browser} joined`,
            );
        }

        void socket.join(room.id);

        // emit join with queue
        const queues = await this.playbackService.getQueues(room.id);
        this.wss.to(room.id).emit('joined', queues);

        console.log('player joined', data.id);
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

        await this.playbackService.sendMessage(
            device.room.chatId,
            `${device.name} leaved`,
        );

        // remove device
        await this.playbackService.removeDevice(data.roomId, data.fingerprint);

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
    }

    @SubscribeMessage('notify')
    async onNotify(@MessageBody() data: { roomId: string; message: string }) {
        // get room
        const room = await this.playbackService.getRoom(data.roomId);

        if (!room) {
            console.log('Room not found');
            return;
        }

        await this.playbackService.sendMessage(room.chatId, data.message);
    }
}
