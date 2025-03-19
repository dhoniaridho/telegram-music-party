import { Global, Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PlaybackModule } from './app/playback/playback.module';
import { TelegrafModule } from 'nestjs-telegraf';
import { ENV } from './config/env';
import { PrismaService } from './platform/prisma.service';

@Global()
@Module({
    imports: [
        PlaybackModule,
        TelegrafModule.forRoot({
            token: ENV.TELEGRAM_BOT_TOKEN,
        }),
    ],
    controllers: [AppController],
    providers: [AppService, PrismaService],
    exports: [PrismaService],
})
export class AppModule {}
