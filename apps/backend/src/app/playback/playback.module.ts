import { Module } from '@nestjs/common';
import { PlaybackGateway } from './playback.gateway';
import { PlaybackTelegramController } from './playback.controller';
import { PlaybackService } from './playback.service';
import { YTMusicService } from 'src/platform/yt-music.service';
import { PlaybackApiController } from './playback-api.controller';

@Module({
    controllers: [PlaybackApiController],
    providers: [
        PlaybackGateway,
        PlaybackTelegramController,
        PlaybackService,
        YTMusicService,
    ],
    exports: [],
})
export class PlaybackModule {}
