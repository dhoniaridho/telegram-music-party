import { Injectable } from '@nestjs/common';
import { Queue } from '@prisma/client';
import { PrismaService } from 'src/platform/prisma.service';

@Injectable()
export class PlaybackService {
    constructor(private readonly prisma: PrismaService) {}

    async addToQueue(videoId: string, title: string) {
        await this.prisma.queue.create({
            data: {
                url: videoId,
                title: title,
            },
        });
    }

    async removeLastPlayed() {
        const data = await this.prisma.queue.findFirst({
            orderBy: {
                createdAt: 'asc',
            },
        });

        console.log(data);
        console.log('[OK] remove queue');

        if (!data) return;

        await this.prisma.queue.delete({
            where: {
                id: data?.id,
            },
        });
    }

    async play() {
        const data = await this.prisma.queue.findFirst({
            orderBy: {
                createdAt: 'asc',
            },
        });
        if (!data) return;
        return data;
    }

    async getQueue() {
        return this.prisma.queue.findMany({
            orderBy: {
                createdAt: 'asc',
            },
        });
    }

    async getNext() {
        const nextItem = await this.prisma.queue.findFirst({
            orderBy: {
                createdAt: 'asc',
            },
        });
        return nextItem as Queue;
    }
}
