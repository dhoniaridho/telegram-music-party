// import {
//     catchError,
//     firstValueFrom,
//     from,
//     map,
//     of,
//     switchMap,
//     tap,
// } from "rxjs";
// import { PlaybackState } from "../../src/types/spotify/playback-state";
// import { Login } from "../../src/types/spotify/auth";
// import axios from "axios";
// import { PrismaClient } from "@prisma/client";
// import { Devices } from "../../src/types/spotify/device";
// import { Search } from "../../src/types/spotify/search";
// import { QueueResponse } from "../../src/types/spotify/queue";

// const http = axios.create({
//     timeout: 9999999,
// });

// export const scope =
//     "user-read-private user-read-email user-read-playback-state user-modify-playback-state user-read-currently-playing";

// http.interceptors.request.use(async (config) => {
//     const token = await firstValueFrom(getAccessToken());
//     config.headers.Authorization = `Bearer ${token?.token}`;
//     return config;
// });

// http.interceptors.response.use(
//     (response) => response,
//     (error) => {
//         console.log("[ERROR] request error");
//         console.log(error);

//         throw error;
//     }
// );

// export function start() {
//     return getAccessToken().pipe(
//         switchMap((token) =>
//             http.get<Devices>("https://api.spotify.com/v1/me/player/devices", {
//                 method: "GET",
//             })
//         ),
//         switchMap((v) => {
//             const device = v.data.devices[0];
//             return http.put<PlaybackState>(
//                 "https://api.spotify.com/v1/me/player",
//                 {
//                     device_ids: [device.id],
//                     play: true,
//                 },
//                 {
//                     method: "PUT",
//                 }
//             );
//         }),
//         catchError((e) => {
//             console.log("[ERROR] start");
//             console.log(e?.response?.data);
//             throw new Error(e?.response?.data?.error?.message);
//         })
//     );
// }

// export function refreshToken() {
//     const creds = prisma.user.findFirst({});
//     if (!creds) return from(of());
//     let id: string = "";
//     return from(creds).pipe(
//         switchMap((v) => {
//             id = v?.id as string;
//             return axios.post<Login>(
//                 "https://accounts.spotify.com/api/token",
//                 {
//                     grant_type: "refresh_token",
//                     refresh_token: v?.refreshToken as string,
//                     client_id: ENV.SPOTIFY_CLIENT_ID,
//                 },
//                 {
//                     headers: {
//                         "content-type": "application/x-www-form-urlencoded",
//                         Authorization:
//                             "Basic " +
//                             Buffer.from(
//                                 ENV.SPOTIFY_CLIENT_ID +
//                                     ":" +
//                                     ENV.SPOTIFY_CLIENT_SECRET
//                             ).toString("base64"),
//                     },
//                 }
//             );
//         }),
//         map((r) => r.data),
//         tap((r) => {
//             console.log("[OK] refreshToken");
//             console.log(r);
//         }),
//         switchMap(async (r) => {
//             await prisma.user.update({
//                 where: {
//                     id: id as string,
//                 },
//                 data: {
//                     token: r.access_token,
//                 },
//             });
//             return r;
//         }),
//         catchError((e) => {
//             console.log("[ERROR] refreshToken");
//             console.log(e);
//             throw e;
//         })
//     );
// }

// export function getDevices() {
//     return getAccessToken().pipe(
//         switchMap((token) =>
//             http.get<Devices>("https://api.spotify.com/v1/me/player/devices", {
//                 method: "GET",
//             })
//         ),
//         map((r) => r.data),
//         catchError((e) => {
//             console.log("[ERROR] start");
//             console.log(e?.response?.data);
//             throw new Error(e?.response?.data?.error?.message);
//         })
//     );
// }

// export function getPlaybackState() {
//     return getAccessToken()
//         .pipe(
//             switchMap((token) => {
//                 return http.get<PlaybackState>(
//                     "https://api.spotify.com/v1/me/player",
//                     {
//                         method: "GET",
//                     }
//                 );
//             })
//         )
//         .pipe(
//             map((r) => r.data),
//             tap((r) => {
//                 console.log("[OK] getPlaybackState");
//                 console.log(r);
//             }),
//             catchError((e) => {
//                 console.log("[ERROR] getPlaybackState");
//                 console.log(e);
//                 throw e;
//             })
//         );
// }

// const prisma = new PrismaClient();

// export function getAccessToken() {
//     return from(prisma.user.findFirst({})).pipe(
//         map((r) => r),
//         tap((r) => {
//             console.log("[OK] login success");
//         }),
//         catchError((e) => {
//             console.log("[ERROR] login failed");
//             console.log(e.response);
//             throw e;
//         })
//     );
// }
// export function play() {
//     return getAccessToken().pipe(
//         switchMap((token) =>
//             http.put("https://api.spotify.com/v1/me/player/play", {
//                 method: "PUT",
//             })
//         ),
//         switchMap(() => getPlaybackState()),
//         catchError((e) => {
//             console.log("[ERROR] login failed");
//             console.log(e?.response?.data);
//             throw e;
//         }),
//         catchError((e) => {
//             console.log("[ERROR] start");
//             console.log(e?.response?.data);
//             throw new Error(e?.response?.data?.error?.message);
//         })
//     );
// }

// export function pause() {
//     return getPlaybackState().pipe(
//         switchMap(async (pb) => {
//             await http.put(
//                 "https://api.spotify.com/v1/me/player/pause",
//                 {},
//                 {
//                     params: {
//                         device_id: pb.device.id,
//                     },
//                 }
//             );
//             return pb;
//         }),
//         catchError((e) => {
//             console.log("[ERROR] start");
//             console.log(e?.response?.data);
//             throw new Error(e?.response?.data?.error?.message);
//         })
//     );
// }

// export function next() {
//     return getAccessToken().pipe(
//         switchMap((token) =>
//             http.post("https://api.spotify.com/v1/me/player/next", {
//                 method: "POST",
//                 headers: {
//                     Authorization: `Bearer ${token?.token}`,
//                 },
//             })
//         ),
//         catchError((e) => {
//             console.log("[ERROR] start");
//             console.log(e?.response?.data);
//             throw new Error(e?.response?.data?.error?.message);
//         })
//     );
// }

// export function previous() {
//     return getAccessToken().pipe(
//         switchMap((token) =>
//             http.post("https://api.spotify.com/v1/me/player/previous", {
//                 method: "POST",
//                 headers: {
//                     Authorization: `Bearer ${token?.token}`,
//                 },
//             })
//         ),
//         catchError((e) => {
//             console.log("[ERROR] start");
//             console.log(e?.response?.data);
//             throw new Error(e?.response?.data?.error?.message);
//         })
//     );
// }

// export function volumeDown() {
//     return getAccessToken().pipe(
//         switchMap((token) =>
//             http.put("https://api.spotify.com/v1/me/player/volume", {
//                 method: "PUT",
//                 headers: {
//                     Authorization: `Bearer ${token?.token}`,
//                 },
//                 data: {
//                     volume_percent: 50,
//                 },
//             })
//         ),
//         catchError((e) => {
//             console.log("[ERROR] start");
//             console.log(e?.response?.data);
//             throw new Error(e?.response?.data?.error?.message);
//         })
//     );
// }

// export function volumeUp() {
//     return getAccessToken().pipe(
//         switchMap((token) =>
//             http.put("https://api.spotify.com/v1/me/player/volume", {
//                 method: "PUT",
//                 headers: {
//                     Authorization: `Bearer ${token?.token}`,
//                 },
//                 data: {
//                     volume_percent: 100,
//                 },
//             })
//         ),
//         catchError((e) => {
//             console.log("[ERROR] start");
//             console.log(e?.response?.data);
//             throw new Error(e?.response?.data?.error?.message);
//         })
//     );
// }

// export function devices() {
//     return getAccessToken()
//         .pipe(
//             switchMap((token) =>
//                 http.get("https://api.spotify.com/v1/me/player/devices", {
//                     method: "GET",
//                     headers: {
//                         Authorization: `Bearer ${token?.token}`,
//                     },
//                 })
//             )
//         )
//         .pipe(
//             map((r) => {
//                 return r.data.devices.map((d: any) => ({
//                     id: d.id,
//                     name: d.name,
//                 }));
//             }),
//             catchError((e) => {
//                 console.log("[ERROR] start");
//                 console.log(e?.response?.data);
//                 throw new Error(e?.response?.data?.error?.message);
//             })
//         );
// }

// export function search(query: string) {
//     if (!query) return of({} as Search);
//     return from(
//         http.get<Search>(
//             `https://api.spotify.com/v1/search?q=${query}&type=track`,
//             {
//                 method: "GET",
//             }
//         )
//     ).pipe(
//         map((r) => r.data),
//         catchError((e) => {
//             console.log("[ERROR] start");
//             console.log(e?.response?.data);
//             throw new Error(e?.response?.data?.error?.message);
//         })
//     );
// }

// export function addToQueue(uri: string) {
//     return from(
//         http.post(
//             `https://api.spotify.com/v1/me/player/queue?uri=${uri}`,
//             {},
//             {}
//         )
//     ).pipe(
//         catchError((e) => {
//             console.log("[ERROR] addToQueue");
//             console.log(e?.response?.data);
//             throw e;
//         })
//     );
// }

// export function getTrackDetails(id: string) {
//     return from(
//         http.get(`https://api.spotify.com/v1/tracks/${id}`, {
//             method: "GET",
//         })
//     ).pipe(
//         map((r) => r.data),
//         catchError((e) => {
//             console.log("[ERROR] start");
//             console.log(e?.response?.data);
//             throw new Error(e?.response?.data?.error?.message);
//         })
//     );
// }

// export function queue() {
//     return getAccessToken().pipe(
//         switchMap((token) =>
//             http.get<QueueResponse>(
//                 "https://api.spotify.com/v1/me/player/queue",
//                 {
//                     method: "GET",
//                     headers: {
//                         Authorization: `Bearer ${token?.token}`,
//                     },
//                 }
//             )
//         ),
//         map((r) => r.data),
//         catchError((e) => {
//             console.log("[ERROR] queue");
//             console.log(e?.response?.data);
//             throw e;
//         })
//     );
// }
