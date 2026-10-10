import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { getBotToken } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';

export async function bootstrap() {
    const app = await NestFactory.create(AppModule);

    if (process.env.TELEGRAM_BOT_TOKEN) {
        const bot = app.get<Telegraf>(getBotToken());
        void bot.telegram.setMyCommands([
        { command: 'start', description: 'Open party controls and setup' },
        { command: 'menu', description: 'Open interactive controls' },
        { command: 'help', description: 'Show commands and setup help' },
        { command: 'play', description: 'Start playback in this room' },
        { command: 'pause', description: 'Pause playback' },
        { command: 'next', description: 'Skip to the next song' },
        { command: 'prev', description: 'Play the previous song' },
        { command: 'vote_next', description: 'Vote to skip the current song' },
        { command: 'queue', description: 'Show queued songs' },
        { command: 'lyrics', description: 'Request lyrics for the current song' },
        { command: 'volume', description: 'Open interactive volume controls' },
        { command: 'volume_up', description: 'Increase player volume' },
        { command: 'volume_down', description: 'Decrease player volume' },
        { command: 'mute', description: 'Mute the player' },
        { command: 'unmute', description: 'Unmute the player' },
        { command: 'info', description: 'Show room status and devices' },
        { command: 'devices', description: 'List connected browsers' },
        { command: 'register', description: 'Connect this group to a room' },
        { command: 'unregister', description: 'Disconnect this group' },
        { command: 'set', description: 'Change one room setting' },
        { command: 'config', description: 'Open interactive room settings' },
        ]);
    }

    const localOnly = process.env.DESKTOP_LOCAL_SERVER === '1';
    app.enableCors({ origin: ['https://music.youtube.com'], credentials: true });
    if (localOnly) {
        await app.listen(process.env.PORT ?? 3000, '127.0.0.1');
    } else {
        await app.listen(process.env.PORT ?? 3000);
    }
    if (localOnly) {
        console.log(`DESKTOP_SERVER_READY:${process.env.PORT ?? 3000}`);
    }
}

if (require.main === module) void bootstrap();
