import { Module } from '@nestjs/common';
import { PlaybackGateway } from './playback.gateway';
import { PlaybackTelegramController } from './playback.controller';

@Module({
    controllers: [],
    providers: [PlaybackGateway, PlaybackTelegramController],
    exports: [],
})
export class PlaybackModule {}
