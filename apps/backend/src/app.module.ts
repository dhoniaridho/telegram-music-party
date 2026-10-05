import { Global, Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PlaybackModule } from './app/playback/playback.module';
import { TelegrafModule } from 'nestjs-telegraf';
import { ENV } from './config/env';
import { PrismaService } from './platform/prisma.service';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { KeyvProvider } from './providers/keyv.provider';

@Global()
@Module({
    imports: [
        ServeStaticModule.forRoot({
            rootPath: join(__dirname, '..', 'public'),
        }),
        PlaybackModule,
        TelegrafModule.forRoot({
            token: ENV.TELEGRAM_BOT_TOKEN,
        }),
    ],
    controllers: [AppController],
    providers: [AppService, PrismaService, KeyvProvider],
    exports: [PrismaService, 'KEYV_CACHE'],
})
export class AppModule {}
