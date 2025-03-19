/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import {
    MessageBody,
    SubscribeMessage,
    WebSocketGateway,
    WebSocketServer,
} from '@nestjs/websockets';
import { Queue } from '@prisma/client';
import { Server } from 'socket.io';
import { PlaybackService } from './playback.service';

@WebSocketGateway({ cors: { origin: '*' } })
export class PlaybackGateway {
    constructor(private readonly playbackService: PlaybackService) {}
    @WebSocketServer() wss: Server;

    // Function to emit events from the server
    playCommand(queue: Queue) {
        console.log("Emitting 'play' event to all clients...");
        this.wss.emit('play', queue);
    }

    pauseCommand() {
        console.log("Emitting 'pause' event to all clients...");
        this.wss.emit('pause');
    }

    nextCommand(queue?: Queue) {
        console.log("Emitting 'next' event to all clients...");
        this.wss.emit('next', queue);
    }

    previousCommand() {
        console.log("Emitting 'prev' event to all clients...");
        this.wss.emit('prev');
    }

    resumeCommand() {
        this.wss.emit('resume');
    }

    volumeUp() {
        console.log("Emitting 'volumeUp' event to all clients...");
        this.wss.emit('volumeUp');
    }

    volumeDown() {
        console.log("Emitting 'volumeDown' event to all clients...");
        this.wss.emit('volumeDown');
    }

    @SubscribeMessage('ended')
    async onEnd(@MessageBody() data: Queue) {
        console.log('Player ended', data);
        const queue = await this.playbackService.play();
        if (queue) this.playCommand(queue);
    }

    @SubscribeMessage('started')
    async onStart() {
        await this.playbackService.removeLastPlayed();
    }
}
