/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, OnModuleInit } from '@nestjs/common';
import {
    AlbumDetailed,
    AlbumFull,
    ArtistDetailed,
    ArtistFull,
    SongDetailed,
    SongFull,
} from 'ytmusic-api';
import * as YTMusic from 'ytmusic-api';

@Injectable()
export class YTMusicService implements OnModuleInit {
    private ytm: YTMusic.default;
    async onModuleInit() {
        // @ts-expect-errors
        this.ytm = new YTMusic();

        await this.ytm.initialize({
            HL: 'en',
            GL: 'ID',
        });
    }

    searchSongs = async (keyword: string): Promise<SongDetailed[]> => {
        return this.ytm.searchSongs(keyword);
    };

    searchArtists = async (keyword: string): Promise<ArtistDetailed[]> => {
        return this.ytm.searchArtists(keyword);
    };

    searchAlbums = async (keyword: string): Promise<AlbumDetailed[]> => {
        return this.ytm.searchAlbums(keyword);
    };

    getSong = async (videoID: string): Promise<SongFull> => {
        return this.ytm.getSong(videoID);
    };

    getArtist = async (artistId: string): Promise<ArtistFull> => {
        return this.ytm.getArtist(artistId);
    };

    getAlbum = async (albumId: string): Promise<AlbumFull> => {
        return this.ytm.getAlbum(albumId);
    };

    getHomeSections = async () => {
        return this.ytm.getHomeSections();
    };

    getTrendingSongs = async (): Promise<SongDetailed[]> => {
        const sections = await this.ytm.getHomeSections();
        const songs = (section: (typeof sections)[number]) =>
            section.contents.filter((track) => track.type === 'SONG');
        const trending = sections
            .filter((section) => /trending|chart|popular/i.test(section.title))
            .flatMap(songs);
        const searchTrending = trending.length
            ? []
            : await this.ytm.searchSongs('trending songs Indonesia').catch(
                  () => [] as SongDetailed[],
              );
        const allSongs = sections.flatMap(songs);
        const seen = new Set<string>();

        return [...trending, ...searchTrending, ...allSongs].filter((song) => {
            if (seen.has(song.videoId)) return false;
            seen.add(song.videoId);
            return true;
        });
    };
}
