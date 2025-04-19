/* eslint-disable @typescript-eslint/no-explicit-any */
import { from, tap, switchMap, firstValueFrom } from "rxjs";
import { io, Socket } from "socket.io-client";
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

function volumeUp(): number {
    const event = new KeyboardEvent("keydown", { key: "=" });
    document.dispatchEvent(event);

    // get current volume
    const video = document.querySelector(
        "#movie_player > div.html5-video-container > video"
    ) as HTMLVideoElement;

    if (video) {
        return video.volume * 100;
    }

    return 0;
}

function volumeDown(): number {
    const event = new KeyboardEvent("keydown", { key: "-" });
    document.dispatchEvent(event);

    // get current volume
    const video = document.querySelector(
        "#movie_player > div.html5-video-container > video"
    ) as HTMLVideoElement;

    if (video) {
        return video.volume * 100;
    }

    return 0;
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

function getConfig() {
    const config = {
        partyUrl: localStorage.getItem("partyUrl"),
        roomId: localStorage.getItem("roomId"),
    };

    return config;
}

function createButton({
    onClick,
    children,
}: {
    onClick: any;
    children: string;
}) {
    const btn = document.createElement("tp-yt-paper-item");
    btn.setAttribute("role", "link");
    btn.classList.add("style-scope", "ytmusic-guide-entry-renderer");
    btn.setAttribute("style-target", "host");
    btn.setAttribute("tabindex", "0");
    btn.setAttribute("aria-disabled", "false");
    btn.setAttribute("aria-current", "false");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("fill", "none");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("stroke-width", "1.5");
    svg.setAttribute("stroke", "currentColor");
    svg.style.width = "20px";
    svg.style.height = "20px";

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute(
        "d",
        "M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15M12 9l-3 3m0 0 3 3m-3-3h12.75"
    );

    svg.appendChild(path);

    const txt = document.createElement("span");
    txt.style.margin = "0 10px";

    txt.textContent = children;
    btn.appendChild(svg);
    btn.appendChild(txt);

    btn.addEventListener("click", onClick);
    return btn;
}

function createButtonLeave(
    socket: Socket,
    config: ReturnType<typeof getConfig>
) {
    setTimeout(async () => {
        const btn = createButton({
            children: "Leave Room",
            onClick: async () => {
                console.log("Leaving room");
                const fp = await firstValueFrom(fp$);
                socket.emit("leave", {
                    id: config.roomId,
                    fingerprint: fp,
                });
                Object.keys(config).forEach((key) => {
                    localStorage.removeItem(key);
                });
                window.location.reload();
            },
        });
        document
            .querySelector(
                "[class='scroller scroller-on-hover style-scope ytmusic-guide-section-renderer']"
            )
            ?.append(btn);
    }, 2000);
}

function createJoinButton() {
    setTimeout(async () => {
        const btn = createButton({
            children: "Join Room",
            onClick: async () => {
                const roomId = prompt("Enter your room ID");
                if (!roomId) return;
                localStorage.setItem("roomId", roomId as string);

                const partyUrl = prompt(
                    "Enter your party URL",
                    "https://party.dhoniaridho.com"
                ) as string;
                if (!partyUrl) return;
                localStorage.setItem("partyUrl", partyUrl);

                if (roomId && partyUrl) {
                    window.location.reload();
                }
            },
        });
        document
            .querySelector(
                "[class='scroller scroller-on-hover style-scope ytmusic-guide-section-renderer']"
            )
            ?.append(btn);
    }, 2000);
}

function getAppInstance<T>() {
    const app = document.querySelector("ytmusic-app");
    return app as Element & {
        networkManager: {
            fetch: (url: string, init?: object) => Promise<T>;
        };
    };
}

function getQueueInstance() {
    const q = document.querySelector("#queue");
    (globalThis as any).queue = q;

    setInterval(() => {
        (globalThis as any).queue = document.querySelector(
            "#queue"
        ) as Element & {
            dispatch: (action: any) => void;
            queue: {
                store: {
                    store: {
                        dispatch: (action: any) => void;
                        getState: () => any;
                    };
                };
            };
        };
    }, 300);

    return (globalThis as any).queue;
}

async function addQueue(videoIds: string) {
    if (videoIds.length < 1) return;
    const app = getAppInstance();
    const queue = getQueueInstance();
    const store = queue?.queue.store.store;
    const payload = {
        queueContextParams: store.getState().queue.queueContextParams,
        queueInsertPosition: "INSERT_AT_END",
        videoIds: videoIds.split(","),
    };

    await app.networkManager
        .fetch("music/get_queue", payload)
        .then((result) => {
            if (
                result &&
                typeof result === "object" &&
                "queueDatas" in result &&
                Array.isArray(result.queueDatas)
            ) {
                const queueItems = store.getState().queue.items;
                const queueItemsLength = queueItems.length ?? 0;
                queue?.dispatch({
                    type: "ADD_ITEMS",
                    payload: {
                        nextQueueItemId: store.getState().queue.nextQueueItemId,
                        index: queueItemsLength,
                        items: result.queueDatas
                            .map((it) =>
                                typeof it === "object" && it && "content" in it
                                    ? it.content
                                    : null
                            )
                            .filter(Boolean),
                        shuffleEnabled: false,
                        shouldAssignIds: true,
                    },
                });
            }
        });
}
document.addEventListener("DOMContentLoaded", async () => {
    const config = getConfig();

    const socket = io(config.partyUrl as string);
    const ROOM_ID = config.roomId as string;

    if (config.partyUrl && config.roomId) {
        createButtonLeave(socket, config);
    } else {
        createJoinButton();
    }

    let queues: Queue[] = [];

    socket.on("joined", async (data: Queue[]) => {
        queues = data;
        if (data[0]) {
            play(data[0]);
        }
        setTimeout(async () => {
            await addQueue(data.map((q) => q.url).join(","));
        }, 1000);
    });

    socket.on("leave", async () => {
        localStorage.removeItem("roomId");
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
                                id: config.roomId || "",
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
                                    id: config.roomId || "",
                                    browser:
                                        browser.filter(Boolean).join(" ") || "",
                                    ip: res.data.ip_addr || "",
                                });
                                return;
                            }

                            // add user to browser
                            browser.unshift(user?.textContent);

                            resolve({
                                id: config.roomId || "",
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
            if (data.id) {
                socket.emit("join", data);
            }
        })
    );

    const playbackObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation, i) => {
            if (
                mutation.type === "childList" &&
                i == 0 &&
                mutation.target.textContent
            ) {
                setTimeout(() => {
                    const playback = getPlaybackState();

                    const videoId = getVideoId();

                    socket.emit("started", {
                        roomId: ROOM_ID,
                        videoId: videoId,
                    });

                    socket.emit("notify", {
                        message: `Now playing: ___"${playback.song}"___ by ${playback.artist} 🎧`,
                        roomId: ROOM_ID,
                    });
                }, 1000);
            }
        });
    });

    const titleElement = document.querySelector(".title.ytmusic-player-bar");
    if (titleElement) {
        playbackObserver.observe(titleElement, {
            childList: true,
            subtree: true,
        });
    }

    socket.on("connect", async () => {
        console.log("Connected to WebSocket server with ID:", socket.id);
        join$.subscribe();
    });

    socket.on("play", () => {
        const playback = getPlaybackState();

        if (playback.state == "standby" && queues[0]) {
            window.location.reload();
            return;
        }

        if (playback.state == "standby" && !queues[0]) {
            socket.emit("notify", {
                message: `🚫 No tracks in the queue right now.`,
                roomId: ROOM_ID,
            });
            return;
        }

        play();

        socket.emit("notify", {
            message: `Now playing: ___"${playback.song}"___ by ${playback.artist} 🎧`,
            roomId: ROOM_ID,
        });
    });

    socket.on("pause", () => {
        pause();

        const playback = getPlaybackState();

        socket.emit("notify", {
            message: `⏸️ ___${playback.song}___ - ${playback.artist} is now paused`,
            roomId: ROOM_ID,
        });
    });

    socket.on("next", () => {
        next();
    });

    socket.on("prev", () => {
        prev();
    });

    socket.on("volumeUp", () => {
        const currentVolume = volumeUp();

        // notify
        socket.emit("notify", {
            message: `🔊 Volume increased. Current volume: ${currentVolume}`,
            roomId: ROOM_ID,
        });
    });

    socket.on("volumeDown", () => {
        const currentVolume = volumeDown();

        // notify
        socket.emit("notify", {
            message: `🔊 Volume decreased. Current volume: ${currentVolume}`,
            roomId: ROOM_ID,
        });
    });

    socket.on("mute", () => {
        mute();
        socket.emit("notify", {
            message: "🤫 Shhh... we're on mute. Enjoy the silence (for now)!",
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

    socket.on("addToQueue", async ({ videoId }: { videoId: string }) => {
        const playback = getPlaybackState();
        console.log("addToQueue", videoId);

        if (playback.state == "standby") {
            queues.push({
                id: crypto.randomUUID(),
                url: videoId,
            });
            return;
        }

        await addQueue(videoId);
    });

    socket.on("disconnect", () => {
        console.log("Disconnected from WebSocket server");
    });
});
