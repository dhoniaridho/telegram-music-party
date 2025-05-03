export interface Song {
    videoId: string;
    name: string;
    artist: {
        artistId: string | null;
        name: string;
    };
    duration: number;
}
