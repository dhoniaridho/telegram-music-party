import { Global, Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PlaybackModule } from './app/playback/playback.module';
import { TelegrafModule } from 'nestjs-telegraf';
import { ENV } from './config/env';
import { PrismaService } from './platform/prisma.service';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { existsSync } from 'fs';
import { KeyvProvider } from './providers/keyv.provider';
import { getBotToken } from 'nestjs-telegraf';

const telegramUnavailable = {
    telegram: new Proxy(
        {},
        {
            get: () => async () => undefined,
        },
    ),
};

@Global()
@Module({
    imports: [
        ServeStaticModule.forRoot({
            rootPath: existsSync(join(__dirname, 'public'))
                ? join(__dirname, 'public')
                : join(__dirname, '..', 'public'),
        }),
        PlaybackModule,
        ...(ENV.TELEGRAM_BOT_TOKEN
            ? [TelegrafModule.forRoot({ token: ENV.TELEGRAM_BOT_TOKEN })]
            : []),
    ],
    controllers: [AppController],
    providers: [
        AppService,
        PrismaService,
        KeyvProvider,
        ...(!ENV.TELEGRAM_BOT_TOKEN
            ? [{ provide: getBotToken(), useValue: telegramUnavailable }]
            : []),
    ],
    exports: [
        PrismaService,
        'KEYV_CACHE',
        ...(!ENV.TELEGRAM_BOT_TOKEN ? [getBotToken()] : []),
    ],
})
export class AppModule {}
