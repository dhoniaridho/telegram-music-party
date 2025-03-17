import { ENV } from "../config/env";
import { catchError, firstValueFrom, from, map, switchMap, tap } from "rxjs";
import { PlaybackState } from "../types/spotify/playback-state";
import { Login } from "../types/spotify/auth";
import axios from "axios";
import { PrismaClient } from "@prisma/client";
import { Devices } from "../types/spotify/device";

const http = axios.create({
    timeout: 9999999,
});

http.interceptors.request.use(async (config) => {
    const token = await firstValueFrom(getAccessToken());
    config.headers.Authorization = `Bearer ${token?.token}`;
    return config;
});

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
        )
    );
}

export function pause() {
    return getDevices().pipe(
        switchMap(async (devices) => {
            await http.put(
                "https://api.spotify.com/v1/me/player/pause",
                {},
                {
                    params: {
                        device_id: devices.devices[0].id,
                    },
                }
            );
            return firstValueFrom(getPlaybackState());
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
