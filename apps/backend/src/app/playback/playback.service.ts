import { Injectable } from '@nestjs/common';
import { Queue } from '@prisma/client';
import { InjectBot } from 'nestjs-telegraf';
import { PrismaService } from 'src/platform/prisma.service';
import { Context, Markup, Telegraf } from 'telegraf';

@Injectable()
export class PlaybackService {
    private readonly volumePanelMessages = new Map<string, number>();
    private readonly roomVolumes = new Map<string, number>();

    constructor(
        private readonly prisma: PrismaService,
        @InjectBot() private bot: Telegraf<Context>,
    ) {}

    async addToQueue(
        roomId: string,
        videoId: string,
        title: string,
        addedBy?: string,
    ) {
        await this.prisma.queue.create({
            data: {
                roomId,
                url: videoId,
                title: title,
                addedBy,
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

    async setFeature(roomId: string, feature: string, value: number | boolean) {
        await this.prisma.feature.update({
            where: {
                roomId,
            },
            data: {
                [feature]: value,
            },
        });
    }

    async sendMessage(chatId: string, message: string) {
        await this.bot.telegram.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
        });
    }

    async sendNowPlayingWithActions(
        chatId: string,
        message: string,
        imageUrl?: string,
    ) {
        const options = {
            parse_mode: 'Markdown' as const,
            ...Markup.inlineKeyboard([
                [
                    Markup.button.callback('🗳 Vote next', 'menu:vote_next'),
                    Markup.button.callback('⏭ Next', 'menu:next'),
                ],
                [Markup.button.callback('🔊 Volume', 'menu:volume')],
            ]),
        };
        if (imageUrl) {
            await this.bot.telegram.sendPhoto(chatId, imageUrl, {
                caption: message,
                ...options,
            });
            return;
        }
        await this.bot.telegram.sendMessage(chatId, message, options);
    }

    async updateVolumePanelMessage(chatId: string, message: string) {
        const isVolumeUpdate =
            /^🔊 Volume (increased|decreased)\./i.test(message) ||
            message.startsWith('🤫') ||
            message.startsWith("🎶 We're back!");
        const volume = message.match(/Current volume:\s*(\d+(?:\.\d+)?)/i);
        if (volume) {
            this.roomVolumes.set(chatId, Math.min(100, Number(volume[1])));
        }
        const messageId = this.volumePanelMessages.get(chatId);
        if (!isVolumeUpdate || messageId === undefined) return false;

        try {
            await this.bot.telegram.editMessageText(
                chatId,
                messageId,
                undefined,
                message,
                {
                    parse_mode: 'Markdown',
                    ...this.getVolumeControlsKeyboard(chatId),
                },
            );
            return true;
        } catch (error) {
            const description =
                error instanceof Error ? error.message : String(error);
            if (description.includes('message is not modified')) return true;
            this.volumePanelMessages.delete(chatId);
            return false;
        }
    }

    rememberVolumePanelMessage(chatId: string, messageId: number) {
        this.volumePanelMessages.set(chatId, messageId);
    }

    getVolumeControlsKeyboard(
        chatId: string,
    ): ReturnType<typeof Markup.inlineKeyboard> {
        return Markup.inlineKeyboard([
            this.getVolumeButtons(chatId),
            [
                Markup.button.callback('🔇 Mute', 'menu:mute'),
                Markup.button.callback('🔈 Unmute', 'menu:unmute'),
            ],
            [Markup.button.callback('🎛 All controls', 'menu:home')],
        ]);
    }

    private getVolumeButtons(chatId: string) {
        return [
            Markup.button.callback('🔉 Volume down', 'menu:volume_down'),
            ...(!this.isVolumeAtMaximum(chatId)
                ? [Markup.button.callback('🔊 Volume up', 'menu:volume_up')]
                : []),
        ];
    }

    isVolumeAtMaximum(chatId: string) {
        return (this.roomVolumes.get(chatId) ?? 0) >= 100;
    }
}
