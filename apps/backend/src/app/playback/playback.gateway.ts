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
import * as ffmpeg from 'fluent-ffmpeg';

@WebSocketGateway({ cors: { origin: '*' } })
export class PlaybackGateway {
    constructor(private readonly playbackService: PlaybackService) {}
    @WebSocketServer() wss: Server;
    private streamProcess: ffmpeg.FfmpegCommand;

    stream(roomID: string) {
        console.log(`Emitting 'stream' event to ${roomID}`);
        const ffmpegCommand = ffmpeg(
            'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
        ) // Replace with your music source
            .format('mp3')
            .audioBitrate(128)
            .on('error', (err) => console.error('FFmpeg Error:', err));

        this.streamProcess = ffmpegCommand;

        const stream = ffmpegCommand.pipe();
        stream.on('data', (chunk: Buffer) => {
            this.wss.emit('audio-stream', chunk.toString('base64')); // Send base64 encoded audio
        });
    }

    // Function to emit events from the server
    playCommand(roomID: string) {
        console.log(`Emitting 'play' event to ${roomID}`);
        this.wss.to(roomID).emit('play');
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

    updateQueue(roomID: string, queues: Queue[]) {
        // emit new queue
        this.wss.to(roomID).emit('queues', queues);
    }

    leave(roomID: string) {
        // emit leave
        this.wss.to(roomID).emit('leave');
    }

    @SubscribeMessage('join')
    async onJoin(@ConnectedSocket() socket: Socket, @MessageBody() data: Join) {
        console.log('Player join', data.id);

        // get room
        const room = await this.playbackService.getRoom(data.id);

        if (!room) {
            console.log('Room not found');
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

                // emit new queues
                this.updateQueue(
                    data.roomId,
                    await this.playbackService.getQueues(data.roomId),
                );
            }
        }

        // clear votes
        await this.playbackService.removeRoomVotes(data.roomId);
    }

    @SubscribeMessage('notify')
    async onNotify(@MessageBody() data: { roomId: string; message: string }) {
        console.log('Nofity', data);

        // get room
        const room = await this.playbackService.getRoom(data.roomId);

        if (!room) {
            console.log('Room not found');
            return;
        }

        await this.playbackService.sendMessage(room.chatId, data.message);
    }
}
