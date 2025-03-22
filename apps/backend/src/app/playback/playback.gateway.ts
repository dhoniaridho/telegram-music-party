import {
    ConnectedSocket,
    MessageBody,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
} from '@nestjs/websockets';
import { Queue } from '@prisma/client';
import { Server, Socket } from 'socket.io';
import { PlaybackService } from './playback.service';
import { Join } from 'src/types/playback.type';

@WebSocketGateway({ cors: { origin: '*' } })
export class PlaybackGateway {
    constructor(private readonly playbackService: PlaybackService) {}
    @WebSocketServer() wss: Server;

    // Function to emit events from the server
    playCommand(roomID: string, queue: Queue | null) {
        console.log(`Emitting 'play' event to ${roomID} ${queue?.title}`);
        this.wss.to(roomID).emit('play', queue);
    }

    pauseCommand(roomID: string) {
        console.log(`Emitting 'pause' event to ${roomID}`);
        this.wss.to(roomID).emit('pause');
    }

    nextCommand(roomID: string, queue?: Queue) {
        console.log(`Emitting 'next' event to ${roomID}`);
        this.wss.to(roomID).emit('next', queue);
    }

    previousCommand(roomID: string) {
        console.log(`Emitting 'prev' event to ${roomID}`);
        this.wss.to(roomID).emit('prev');
    }

    resumeCommand(roomID: string) {
        this.wss.to(roomID).emit('resume');
    }

    volumeUp(roomID: string) {
        console.log(`Emitting 'volumeUp' event to ${roomID}`);
        this.wss.to(roomID).emit('volumeUp');
    }

    volumeDown(roomID: string) {
        console.log(`Emitting 'volumeDown' event to ${roomID}`);
        this.wss.to(roomID).emit('volumeDown');
    }

    updateQueue(roomID: string, queues: Queue[]) {
        // emit new queue
        this.wss.to(roomID).emit('queues', queues);
    }

    @SubscribeMessage('ended')
    async onEnd(@MessageBody() data: { roomId: string; lastVideoId: string }) {
        console.log('Player ended', data.roomId, data.lastVideoId);

        const queue = await this.playbackService.getQueue(data.roomId);

        let nextQueue: Queue | null = null;

        if (queue) {
            if (queue.url === data.lastVideoId) {
                // delete song
                await this.playbackService.removeQueue(
                    data.roomId,
                    data.lastVideoId,
                );

                // emit new queues
                this.updateQueue(
                    data.roomId,
                    await this.playbackService.getQueues(data.roomId),
                );

                // get next song
                const newQueue = await this.playbackService.getQueue(
                    data.roomId,
                );
                if (newQueue) {
                    nextQueue = newQueue;
                }
            } else {
                // set next song
                nextQueue = queue;
            }
        }

        this.playCommand(data.roomId, nextQueue);

        // get song
        console.log('next queue:', queue);
    }

    @SubscribeMessage('join')
    async onJoin(@ConnectedSocket() socket: Socket, @MessageBody() data: Join) {
        console.log(data);
        console.log('Player join', data.id);

        // get room
        const room = await this.playbackService.getRoom(data.id);

        if (!room) {
            console.log('Room not found');
            return;
        }

        await this.playbackService.sendMessage(
            room.chatId,
            `${data.browser} joined`,
        );

        this.wss.emit('joined', room);

        // get queues
        const queues = await this.playbackService.getQueues(room.id);
        this.wss.emit('queues', queues);

        void socket.join(room.id);
    }

    @SubscribeMessage('refreshQueue')
    async refresh(
        @ConnectedSocket() socket: Socket,
        @MessageBody() data: Join,
    ) {
        // get room
        const room = await this.playbackService.getRoom(data.id);

        if (!room) {
            console.log('Room not found');
            return;
        }

        // get queues
        const queues = await this.playbackService.getQueues(room.id);
        this.wss.to(room.id).emit('queues', queues);

        void socket.join(room.id);
    }

    @SubscribeMessage('change')
    async onPlaybackChanged(
        @MessageBody() data: { roomId: string; videoId: string; title: string },
    ) {
        console.log('Playback changed', data);

        // get room
        const room = await this.playbackService.getRoom(data.roomId);

        if (!room) {
            console.log('Room not found');
            return;
        }

        await this.playbackService.sendMessage(
            room.chatId,
            `${data.title} is now playing`,
        );
    }
}
