import { Injectable } from '@nestjs/common';
import { Queue } from '@prisma/client';
import { InjectBot } from 'nestjs-telegraf';
import { PrismaService } from 'src/platform/prisma.service';
import { Context, Telegraf } from 'telegraf';

@Injectable()
export class PlaybackService {
    constructor(
        private readonly prisma: PrismaService,
        @InjectBot() private bot: Telegraf<Context>,
    ) {}

    async addToQueue(roomId: string, videoId: string, title: string) {
        await this.prisma.queue.create({
            data: {
                roomId,
                url: videoId,
                title: title,
            },
        });
    }

    async removeQueue(roomId: string, videoId: string) {
        await this.prisma.queue.deleteMany({
            where: {
                roomId,
                url: videoId,
            },
        });
    }

    async removeLastPlayed(roomId: string) {
        const data = await this.prisma.queue.findFirst({
            where: {
                roomId,
            },
            orderBy: {
                createdAt: 'asc',
            },
        });

        // console.log(data);
        console.log('[OK] remove queue');

        if (!data) return;

        await this.prisma.queue.delete({
            where: {
                id: data?.id,
            },
        });
    }

    async getQueue(roomId: string) {
        const data = await this.prisma.queue.findFirst({
            where: {
                roomId,
            },
            orderBy: {
                createdAt: 'asc',
            },
        });
        if (!data) return;
        return data;
    }

    async getQueues(roomId: string) {
        return this.prisma.queue.findMany({
            where: {
                roomId,
            },
            orderBy: {
                createdAt: 'asc',
            },
        });
    }

    async getNext(roomId: string) {
        const nextItem = await this.prisma.queue.findFirst({
            where: {
                roomId,
            },
            orderBy: {
                createdAt: 'asc',
            },
        });
        return nextItem as Queue;
    }

    async addRoom(roomID: string, chatId: string, name: string) {
        await this.prisma.room.create({
            data: {
                id: roomID,
                chatId,
                name,
                Feature: {
                    create: {},
                },
            },
            include: {
                Feature: true,
            },
        });
    }

    async getRoom(roomId: string) {
        return this.prisma.room.findFirst({
            where: {
                id: roomId,
            },
        });
    }

    async getRoomDevice(roomId: string, fingerprint: string) {
        return this.prisma.device.findFirst({
            where: {
                roomId,
                fingerprint,
            },
            include: {
                room: true,
            },
        });
    }

    async addDevice(roomId: string, fingerprint: string, name: string) {
        await this.prisma.device.create({
            data: {
                roomId,
                name,
                fingerprint,
            },
        });
    }

    async getRoomByChatId(chatId: string) {
        return this.prisma.room.findFirst({
            where: {
                chatId,
            },
            include: {
                Feature: true,
                Devices: true,
            },
        });
    }

    async getDevicesByChatId(chatId: string) {
        return this.prisma.room.findFirst({
            where: {
                chatId,
            },
            include: {
                Devices: true,
                Votes: true,
                Feature: true,
            },
        });
    }

    async removeRoom(roomId: string) {
        await this.prisma.device.deleteMany({
            where: {
                roomId,
            },
        });

        await this.prisma.queue.deleteMany({
            where: {
                roomId,
            },
        });

        await this.prisma.feature.deleteMany({
            where: {
                roomId,
            },
        });

        await this.prisma.room.delete({
            where: {
                id: roomId,
            },
        });
    }

    async removeDevice(roomId: string, fingerprint: string) {
        await this.prisma.device.deleteMany({
            where: {
                roomId,
                fingerprint,
            },
        });
    }

    async addVote(roomId: string, userId: string) {
        await this.prisma.vote.create({
            data: {
                roomId,
                userId,
            },
        });
    }

    async countVotes(roomId: string) {
        const count = await this.prisma.vote.count({
            where: {
                roomId,
            },
        });

        return count;
    }

    async removeRoomVotes(roomId: string) {
        await this.prisma.vote.deleteMany({
            where: {
                roomId,
            },
        });
    }

    async sendMessage(chatId: string, message: string) {
        await this.bot.telegram.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
        });
    }
}
