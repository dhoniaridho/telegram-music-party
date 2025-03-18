/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({ cors: { origin: '*' } })
export class PlaybackGateway {
    @WebSocketServer() wss: Server;

    // Function to emit events from the server
    playCommand() {
        console.log("Emitting 'play' event to all clients...");
        this.wss.emit('play');
    }

    pauseCommand() {
        console.log("Emitting 'pause' event to all clients...");
        this.wss.emit('pause');
    }

    nextCommand() {
        console.log("Emitting 'next' event to all clients...");
        this.wss.emit('next');
    }

    previousCommand() {
        console.log("Emitting 'prev' event to all clients...");
        this.wss.emit('prev');
    }

    volumeUp() {
        console.log("Emitting 'volumeUp' event to all clients...");
        this.wss.emit('volumeUp');
    }

    volumeDown() {
        console.log("Emitting 'volumeDown' event to all clients...");
        this.wss.emit('volumeDown');
    }
}
