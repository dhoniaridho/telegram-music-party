import { Module } from '@nestjs/common';
import { PlaybackGateway } from './playback.gateway';
import { PlaybackTelegramController } from './playback.controller';
import { PlaybackService } from './playback.service';

@Module({
    controllers: [],
    providers: [PlaybackGateway, PlaybackTelegramController, PlaybackService],
    exports: [],
})
export class PlaybackModule {}
