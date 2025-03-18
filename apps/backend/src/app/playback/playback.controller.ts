import { Update, Ctx, Start, Command } from 'nestjs-telegraf';
import { Context } from 'telegraf';
import { PlaybackGateway } from './playback.gateway';
@Update()
export class PlaybackTelegramController {
    constructor(private readonly gateway: PlaybackGateway) {}

    @Start()
    async start(@Ctx() ctx: Context) {
        await ctx.reply('Welcome');
    }

    @Command('play')
    async play(@Ctx() ctx: Context) {
        this.gateway.playCommand();
        await ctx.reply('Playing');
    }

    @Command('pause')
    async pause(@Ctx() ctx: Context) {
        this.gateway.pauseCommand();
        await ctx.reply('Paused');
    }

    @Command('next')
    async next(@Ctx() ctx: Context) {
        this.gateway.nextCommand();
        await ctx.reply('Next');
    }

    @Command('prev')
    async prev(@Ctx() ctx: Context) {
        this.gateway.previousCommand();
        await ctx.reply('Previous');
    }

    @Command('volumeUp')
    async volumeUp(@Ctx() ctx: Context) {
        this.gateway.volumeUp();
        await ctx.reply('Volume Up');
    }

    @Command('volumeDown')
    async volumeDown(@Ctx() ctx: Context) {
        this.gateway.volumeDown();
        await ctx.reply('Volume Down');
    }
}
