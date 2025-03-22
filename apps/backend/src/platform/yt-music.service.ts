/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, OnModuleInit } from '@nestjs/common';
import { SongDetailed, SongFull } from 'ytmusic-api';
import * as YTMusic from 'ytmusic-api';

@Injectable()
export class YTMusicService implements OnModuleInit {
    private ytm: YTMusic.default;
    async onModuleInit() {
        console.log(YTMusic);
        // @ts-expect-errors
        this.ytm = new YTMusic();

        await this.ytm.initialize();
    }

    searchSongs = async (keyword: string): Promise<SongDetailed[]> => {
        return this.ytm.searchSongs(keyword);
    };

    getSong = async (videoID: string): Promise<SongFull> => {
        return this.ytm.getSong(videoID);
    };
}
