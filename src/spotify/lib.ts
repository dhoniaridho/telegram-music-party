import { ENV } from "../config/env";
import {
    catchError,
    firstValueFrom,
    from,
    map,
    of,
    switchMap,
    tap,
} from "rxjs";
import { PlaybackState } from "../types/spotify/playback-state";
import { Login } from "../types/spotify/auth";
import axios from "axios";
import { PrismaClient } from "@prisma/client";
import { Devices } from "../types/spotify/device";
import { Search } from "../types/spotify/search";

const http = axios.create({
    timeout: 9999999,
});

http.interceptors.request.use(async (config) => {
    const token = await firstValueFrom(getAccessToken());
    config.headers.Authorization = `Bearer ${token?.token}`;
    return config;
});

http.interceptors.response.use(
    (response) => response,
    (error) => {
        console.log("[ERROR] request error");
        console.log(error);
        if (error.response.status === 401) {
        }
        throw error;
    }
);

export function refreshToken() {
    const creds = prisma.user.findFirst({});
    let id: string = "";
    return from(creds).pipe(
        switchMap((v) => {
            id = v?.id as string;
            return axios.post<Login>(
                "https://accounts.spotify.com/api/token",
                {
                    grant_type: "refresh_token",
                    refresh_token: v?.refreshToken as string,
                    client_id: ENV.SPOTIFY_CLIENT_ID,
                },
                {
                    headers: {
                        "content-type": "application/x-www-form-urlencoded",
                        Authorization:
                            "Basic " +
                            Buffer.from(
                                ENV.SPOTIFY_CLIENT_ID +
                                    ":" +
                                    ENV.SPOTIFY_CLIENT_SECRET
                            ).toString("base64"),
                    },
                }
            );
        }),
        map((r) => r.data),
        tap((r) => {
            console.log("[OK] refreshToken");
            console.log(r);
        }),
        switchMap(async (r) => {
            await prisma.user.update({
                where: {
                    id: id as string,
                },
                data: {
                    token: r.access_token,
                },
            });
            return r;
        }),
        catchError((e) => {
            console.log("[ERROR] refreshToken");
            console.log(e);
            throw e;
        })
    );
}

export function getDevices() {
    return getAccessToken().pipe(
        switchMap((token) =>
            http.get<Devices>("https://api.spotify.com/v1/me/player/devices", {
                method: "GET",
            })
        ),
        map((r) => r.data)
    );
}

export function getPlaybackState() {
    return getAccessToken()
        .pipe(
            switchMap((token) => {
                return http.get<PlaybackState>(
                    "https://api.spotify.com/v1/me/player",
                    {
                        method: "GET",
                    }
                );
            })
        )
        .pipe(
            map((r) => r.data),
            tap((r) => {
                console.log("[OK] getPlaybackState");
                console.log(r);
            }),
            catchError((e) => {
                console.log("[ERROR] getPlaybackState");
                console.log(e);
                throw e;
            })
        );
}

const prisma = new PrismaClient();

export function getAccessToken() {
    return from(prisma.user.findFirst({})).pipe(
        map((r) => r),
        tap((r) => {
            console.log("[OK] login success");
        }),
        catchError((e) => {
            console.log("[ERROR] login failed");
            console.log(e.response);
            throw e;
        })
    );
}
export function play() {
    return getAccessToken().pipe(
        switchMap((token) =>
            http.put("https://api.spotify.com/v1/me/player/play", {
                method: "PUT",
            })
        ),
        switchMap(() => getPlaybackState())
    );
}

export function pause() {
    return getPlaybackState().pipe(
        switchMap(async (pb) => {
            await http.put(
                "https://api.spotify.com/v1/me/player/pause",
                {},
                {
                    params: {
                        device_id: pb.device.id,
                    },
                }
            );
            return pb;
        })
    );
}

export function next() {
    return getAccessToken().pipe(
        switchMap((token) =>
            http.post("https://api.spotify.com/v1/me/player/next", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token?.token}`,
                },
            })
        )
    );
}

export function search(query: string) {
    if (!query) return of({} as Search);
    return from(
        http.get<Search>(
            `https://api.spotify.com/v1/search?q=${query}&type=track`,
            {
                method: "GET",
            }
        )
    ).pipe(map((r) => r.data));
}

export function addToQueue(uri: string) {
    return from(
        http.post(
            `https://api.spotify.com/v1/me/player/queue?uri=${uri}`,
            {},
            {}
        )
    ).pipe(
        catchError((e) => {
            console.log("[ERROR] addToQueue");
            console.log(e.response.data);
            throw e;
        })
    );
}

export function getTrackDetails(id: string) {
    return from(
        http.get(`https://api.spotify.com/v1/tracks/${id}`, {
            method: "GET",
        })
    ).pipe(map((r) => r.data));
}
