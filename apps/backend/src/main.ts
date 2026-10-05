import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { getBotToken } from 'nestjs-telegraf';
import { Telegraf } from 'telegraf';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);

    // bot Telegraf instance
    const bot = app.get<Telegraf>(getBotToken());

    // Set commands
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

    await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
