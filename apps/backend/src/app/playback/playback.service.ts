import { Injectable } from '@nestjs/common';
import { Feature as RoomFeature, Queue } from '@prisma/client';
import { InjectBot } from 'nestjs-telegraf';
import { PrismaService } from 'src/platform/prisma.service';
import { Context, Markup, Telegraf } from 'telegraf';
import { InlineKeyboardButton } from 'telegraf/typings/core/types/typegram';

@Injectable()
export class PlaybackService {
    private readonly volumePanelMessages = new Map<
        string,
        { messageId: number; topicId: number | null }
    >();
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

    async addRoom(
        roomID: string,
        chatId: string,
        name: string,
        topicId?: number,
    ) {
        await this.prisma.room.create({
            data: {
                id: roomID,
                chatId,
                topicId,
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

    async updateRoomTopic(chatId: string, topicId?: number) {
        if (topicId === undefined) return;

        await this.prisma.room.updateMany({
            where: { chatId },
            data: { topicId },
        });
    }

    async getRoom(roomId: string) {
        return this.prisma.room.findFirst({
            where: {
                id: roomId,
            },
            include: {
                Feature: true,
                Devices: true,
            },
        });
    }

    async getRooms() {
        return this.prisma.room.findMany({
            include: {
                Feature: true,
                Devices: true,
            },
            orderBy: {
                createdAt: 'asc',
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
        await this.prisma.vote.deleteMany({
            where: {
                roomId,
            },
        });

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

    async hasVote(roomId: string, userId: string) {
        return !!(await this.prisma.vote.findFirst({
            where: { roomId, userId },
            select: { id: true },
        }));
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

    async sendMessageToRoomTopic(
        chatId: string,
        topicId: number | null,
        message: string,
    ) {
        await this.bot.telegram.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            ...(topicId != null ? { message_thread_id: topicId } : {}),
        });
    }

    async sendNowPlayingWithActions(
        chatId: string,
        message: string,
        imageUrl?: string,
        topicId?: number | null,
    ) {
        const room = await this.getRoomByChatId(chatId);
        const feature = room?.Feature;
        const rows: InlineKeyboardButton[][] = [];
        if (feature?.nextCommand) {
            rows.push([
                Markup.button.callback('🗳 Vote next', 'menu:vote_next'),
                Markup.button.callback(
                    feature.nextOnlyAdmin ? '⏭ Next (admins)' : '⏭ Next',
                    'menu:next',
                ),
            ]);
        }
        const audioControls: InlineKeyboardButton[] = [];
        if (feature?.volumeCommand) {
            audioControls.push(
                Markup.button.callback('🔊 Volume', 'menu:volume'),
            );
        }
        if (feature?.muteCommand) {
            audioControls.push(Markup.button.callback('🔇 Mute', 'menu:mute'));
        }
        if (feature?.unmuteCommand) {
            audioControls.push(
                Markup.button.callback('🔈 Unmute', 'menu:unmute'),
            );
        }
        if (audioControls.length) rows.push(audioControls);
        const options = {
            parse_mode: 'Markdown' as const,
            ...(topicId != null ? { message_thread_id: topicId } : {}),
            ...Markup.inlineKeyboard(rows),
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

    async updateVolumePanelMessage(
        chatId: string,
        topicId: number | null,
        message: string,
    ) {
        const isVolumeUpdate =
            /^🔊 Volume (increased|decreased)\./i.test(message) ||
            message.startsWith('🤫') ||
            message.startsWith("🎶 We're back!");
        const volume = message.match(/Current volume:\s*(\d+(?:\.\d+)?)/i);
        if (volume) {
            this.roomVolumes.set(chatId, Math.min(100, Number(volume[1])));
        }
        const panel = this.volumePanelMessages.get(chatId);
        if (
            !isVolumeUpdate ||
            !panel ||
            panel.topicId !== (topicId ?? null)
        ) {
            return false;
        }

        try {
            await this.bot.telegram.editMessageText(
                chatId,
                panel.messageId,
                undefined,
                message,
                {
                    parse_mode: 'Markdown',
                    ...this.getVolumeControlsKeyboard(
                        chatId,
                        (await this.getRoomByChatId(chatId))?.Feature,
                    ),
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

    rememberVolumePanelMessage(
        chatId: string,
        messageId: number,
        topicId?: number | null,
    ) {
        this.volumePanelMessages.set(chatId, {
            messageId,
            topicId: topicId ?? null,
        });
    }

    getVolumeControlsKeyboard(
        chatId: string,
        feature?: RoomFeature | null,
    ): ReturnType<typeof Markup.inlineKeyboard> {
        const rows: InlineKeyboardButton[][] = [];
        if (feature?.volumeCommand) rows.push(this.getVolumeButtons(chatId));
        const audio: InlineKeyboardButton[] = [];
        if (feature?.muteCommand) {
            audio.push(Markup.button.callback('🔇 Mute', 'menu:mute'));
        }
        if (feature?.unmuteCommand) {
            audio.push(Markup.button.callback('🔈 Unmute', 'menu:unmute'));
        }
        if (audio.length) rows.push(audio);
        rows.push([Markup.button.callback('🎛 All controls', 'menu:home')]);
        return Markup.inlineKeyboard(rows);
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
