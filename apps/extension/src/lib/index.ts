import { from, tap, switchMap, firstValueFrom } from "rxjs";
import { io } from "socket.io-client";
import { detect } from "detect-browser";
import axios from "axios";
import { load } from "@fingerprintjs/fingerprintjs";

const fp$ = from(load({})).pipe(
    switchMap(async (fp) => {
        return (await fp.get()).visitorId;
    })
);

Object.defineProperty(window, "onbeforeunload", {
    get: () => null,
    set: () => {},
    configurable: true,
});

window.onbeforeunload = () => {};

function getVideoId(): string | null {
    const u = document
        .querySelector('[class="ytp-title-link yt-uix-sessionlink"]')
        ?.getAttribute("href");
    if (!u) return null;
    return new URL(u).searchParams.get("v");
}

function getPlaybackState(): {
    song: string;
    artist: string;
    state: "playing" | "paused" | "standby";
    el: HTMLVideoElement;
} {
    const el = document.querySelector(
        "#movie_player > div.html5-video-container > video"
    ) as HTMLVideoElement;

    const song = document.querySelector(
        "[class='title style-scope ytmusic-player-bar']"
    )?.textContent as string;

    if (el.src) {
        return {
            song,
            artist: document.querySelector(artist)?.textContent as string,
            state: el.paused ? "paused" : "playing",
            el,
        };
    }
    return {
        el,
        song,
        state: "standby",
        artist: "",
    };
}

type Queue = { id: string; url: string };

const artist =
    "div.content-info-wrapper.style-scope.ytmusic-player-bar > span > span.subtitle.style-scope.ytmusic-player-bar > yt-formatted-string > a";

function play(queue?: Queue) {
    const playback = getPlaybackState();
    if (queue?.url && playback.state !== "playing") {
        window.location.href = `/watch?v=${queue.url}&qid=${queue.id}`;
    }
    if (playback.state === "paused") {
        playback.el.play();
        return;
    }
}

/**
 * Pause the video
 */
function pause() {
    const VIDEO_SELECTOR = "#movie_player > div.html5-video-container > video";
    const vid = document.querySelector(VIDEO_SELECTOR) as HTMLVideoElement;
    if (vid) {
        vid.pause();
    }
    // const el = document.getElementById(
    //     "play-pause-button"
    // ) as HTMLButtonElement;
    // if (!el) return;
    // el.click();
}

function volumeUp() {
    const VIDEO_SELECTOR = "#movie_player > div.html5-video-container > video";

    const el = document.querySelector(VIDEO_SELECTOR) as HTMLVideoElement;

    if (el) {
        el.volume += 0.1;
    }
}

function volumeDown() {
    const VIDEO_SELECTOR = "#movie_player > div.html5-video-container > video";

    const el = document.querySelector(VIDEO_SELECTOR) as HTMLVideoElement;

    if (el) {
        el.volume -= 0.1;
    }
}

function mute() {
    const VIDEO_SELECTOR = ".volume";

    const el = document.querySelector(VIDEO_SELECTOR) as HTMLButtonElement;

    if (el) {
        el.click();
    }
}

function lyrics() {
    const el = document.querySelector(
        '[class="tab-header style-scope ytmusic-player-page"]'
    ) as HTMLButtonElement;

    if (el) {
        el.click();
    }

    return new Promise((resolve) => {
        setTimeout(() => {
            const text = document.querySelector(
                "#contents > ytmusic-description-shelf-renderer > yt-formatted-string.non-expandable.description.style-scope.ytmusic-description-shelf-renderer"
            )?.textContent;

            if (el.getAttribute("aria-disabled") === "true") {
                resolve(null);
            }

            resolve(text);
            if (el) {
                el.click();
            }
        }, 1000);
    });
}

function next(queue?: Queue) {
    if (queue?.url) {
        window.location.href = `/watch?v=${queue.url}&qid=${queue.id}`;
    }

    const NEXT_SELECTOR = ".next-button";

    const el = document.querySelector(NEXT_SELECTOR) as HTMLButtonElement;

    if (el) {
        el.click();
    }
}

function prev() {
    const PREV_SELECTOR = ".previous-button";

    const el = document.querySelector(PREV_SELECTOR) as HTMLButtonElement;

    if (el) {
        el.click();
    }
}

function resume() {
    const VIDEO_SELECTOR = "play-pause-button";

    const el = document.querySelector(VIDEO_SELECTOR) as HTMLButtonElement;

    if (el) {
        el.click();
    }
}

type Storage = "partyUrl" | "roomId" | "joined";

chrome.storage.local.get(
    ["partyUrl", "roomId", "joined"] as Storage[],
    (result) => {
        const socket = io(result.partyUrl); // Replace with your server URL
        const ROOM_ID = result.roomId as string;

        let queues: Queue[] = [];

        socket.on("queues", (data) => {
            queues = data;
        });

        socket.on("leave", async () => {
            await chrome.storage.local.remove("roomId");
            window.location.reload();
        });

        const join$ = from(
            axios.get("https://ifconfig.me/all.json", {
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                },
            })
        ).pipe(
            switchMap((res) => {
                return new Promise<{ id: string; browser: string; ip: string }>(
                    (resolve, reject) => {
                        try {
                            const info = detect();

                            const browser = [
                                (info?.name?.slice(0, 1).toUpperCase() || "") +
                                    (info?.name?.slice(1) || ""),
                                info?.os, // Mac OS, Windows
                            ]; // [Chrome, Mac OS]

                            const accountButton: HTMLButtonElement | null =
                                document.querySelector(
                                    '[aria-label="Open avatar menu"]'
                                );

                            if (!accountButton) {
                                resolve({
                                    id: result.roomId || "",
                                    browser:
                                        browser.filter(Boolean).join(" ") || "",
                                    ip: res.data.ip_addr || "",
                                });
                                return;
                            }

                            accountButton.click();

                            const querySelector = document.querySelector(
                                '[class="style-scope tp-yt-iron-dropdown"]'
                            ) as HTMLDivElement;
                            if (querySelector) {
                                querySelector.style.display = "hidden";
                            }
                            accountButton.click();
                            if (querySelector) {
                                querySelector.style.display = "inherit";
                            }

                            setTimeout(() => {
                                accountButton.click();
                                const user: HTMLDivElement | null =
                                    document.querySelector("#account-name");

                                if (!user) {
                                    resolve({
                                        id: result.roomId || "",
                                        browser:
                                            browser.filter(Boolean).join(" ") ||
                                            "",
                                        ip: res.data.ip_addr || "",
                                    });
                                    return;
                                }

                                // add user to browser
                                browser.unshift(user?.textContent);

                                resolve({
                                    id: result.roomId || "",
                                    browser:
                                        browser.filter(Boolean).join(" ") || "",
                                    ip: res.data.ip_addr || "",
                                });
                            }, 300);
                        } catch (error) {
                            console.log(error);
                            reject(error);
                        }
                    }
                );
            }),
            switchMap(async (data) => {
                const fp = await firstValueFrom(fp$);

                return {
                    ...data,
                    fingerprint: fp,
                };
            }),
            tap(async (data) => {
                console.log(data);
                console.log(result.joined);
                // if (result.joined) {
                //     socket.emit("refreshQueue", data);
                //     return;
                // }
                if (data.id) {
                    socket.emit("join", data);
                }
            })
        );

        chrome.storage.local.onChanged.addListener(async (changes) => {
            console.log(changes.roomId);
            const fp = await firstValueFrom(fp$);
            if (!changes.roomId.newValue) {
                socket.emit("leave", {
                    id: changes.roomId.oldValue,
                    fingerprint: fp,
                });
                console.log("Leaving room");
            }
        });

        const playbackObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation, i) => {
                if (
                    mutation.type === "childList" &&
                    i == 0 &&
                    mutation.target.textContent
                ) {
                    setTimeout(() => {
                        const playback = getPlaybackState();

                        socket.emit("started", {
                            roomId: ROOM_ID,
                            videoId: getVideoId(),
                        });
                        if (queues[0]) {
                            next(queues[0]);
                            return;
                        }
                        socket.emit("notify", {
                            message: `Now playing: ___"${playback.song}"___ by ${playback.artist} 🎧`,
                            roomId: ROOM_ID,
                        });
                    }, 1000);
                }
            });
        });

        const titleElement = document.querySelector(
            ".title.ytmusic-player-bar"
        );
        if (titleElement) {
            playbackObserver.observe(titleElement, {
                childList: true,
                subtree: true,
            });
        }

        socket.on("connect", () => {
            console.log("Connected to WebSocket server with ID:", socket.id);
            join$.subscribe();
        });

        socket.on("play", () => {
            console.log(queues);
            const playback = getPlaybackState();

            if (playback.state === "paused") {
                play();
                socket.emit("notify", {
                    message: `Now playing: ___"${playback.song}"___ by ${playback.artist} 🎧`,
                    roomId: ROOM_ID,
                });
                return;
            }

            if (playback.state === "standby") {
                play(queues[0]);
                if (!queues[0]) {
                    socket.emit("notify", {
                        message: `🛑 No queue found. Please add a queue first`,
                        roomId: ROOM_ID,
                    });
                }
                return;
            }

            socket.emit("notify", {
                message: `Now playing: ___"${playback.song}"___ by ${playback.artist} 🎧`,
                roomId: ROOM_ID,
            });
        });

        socket.on("pause", () => {
            pause();

            const playback = getPlaybackState();

            socket.emit("notify", {
                message: `⏸️ ${playback.song} now paused`,
                roomId: ROOM_ID,
            });
        });

        socket.on("next", () => {
            next(queues[0]);
        });

        socket.on("prev", () => {
            prev();
        });

        socket.on("volumeUp", () => {
            volumeUp();
        });

        socket.on("volumeDown", () => {
            volumeDown();
        });

        socket.on("mute", () => {
            mute();
            socket.emit("notify", {
                message:
                    "🤫 Shhh... we're on mute. Enjoy the silence (for now)!",
                roomId: ROOM_ID,
            });
        });

        socket.on("unmute", () => {
            mute();
            socket.emit("notify", {
                message: "🎶 We're back! Audio unmuted—let the music play!",
                roomId: ROOM_ID,
            });
        });

        socket.on("lyrics", async () => {
            const txt =
                (await lyrics()) ||
                "🤷‍♀️ No lyrics this time—guess we're freestyling!";

            socket.emit("notify", {
                message: txt,
                roomId: ROOM_ID,
            });
        });

        socket.on("resume", () => {
            resume();
        });

        socket.on("disconnect", () => {
            console.log("Disconnected from WebSocket server");
        });
    }
);
