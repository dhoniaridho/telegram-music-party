import { Subject, Observable, from, tap, switchMap } from "rxjs";
import { io } from "socket.io-client";
import { detect } from "detect-browser";
import axios from "axios";

Object.defineProperty(window, "onbeforeunload", {
    get: () => null,
    set: () => {},
    configurable: true,
});

type Queue = { id: string; url: string };

const artist =
    "div.content-info-wrapper.style-scope.ytmusic-player-bar > span > span.subtitle.style-scope.ytmusic-player-bar > yt-formatted-string > a";

export function play(queue?: Queue) {
    if (queue?.url) {
        window.location.href = `/watch?v=${queue.url}&qid=${queue.id}`;
    }

    const VIDEO_SELECTOR = "#movie_player > div.html5-video-container > video";

    const el = document.querySelector(VIDEO_SELECTOR) as HTMLVideoElement;

    if (el) {
        el.play();
    }
}

/**
 * Pause the video
 */
export function pause() {
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

export function volumeUp() {
    const VIDEO_SELECTOR = "#movie_player > div.html5-video-container > video";

    const el = document.querySelector(VIDEO_SELECTOR) as HTMLVideoElement;

    if (el) {
        el.volume += 0.1;
    }
}

export function volumeDown() {
    const VIDEO_SELECTOR = "#movie_player > div.html5-video-container > video";

    const el = document.querySelector(VIDEO_SELECTOR) as HTMLVideoElement;

    if (el) {
        el.volume -= 0.1;
    }
}

export function mute() {
    const VIDEO_SELECTOR = ".volume";

    const el = document.querySelector(VIDEO_SELECTOR) as HTMLButtonElement;

    if (el) {
        el.click();
    }
}

export function next(queue?: Queue) {
    if (queue?.url) {
        window.location.href = `/watch?v=${queue.url}&qid=${queue.id}`;
    }

    const NEXT_SELECTOR = ".next-button";

    const el = document.querySelector(NEXT_SELECTOR) as HTMLButtonElement;

    if (el) {
        el.click();
    }
}

function simulateTyping(element: HTMLInputElement, text: string, delay = 100) {
    element.value = ""; // Reset input value
    element.dispatchEvent(new Event("input", { bubbles: true })); // Trigger input event for reset

    let i = 0;

    function typeCharacter() {
        if (i < text.length) {
            element.value += text[i]; // Append character
            element.dispatchEvent(new Event("input", { bubbles: true })); // Trigger input event
            element.dispatchEvent(
                new KeyboardEvent("keydown", { key: text[i] })
            ); // Simulate keydown
            element.dispatchEvent(new KeyboardEvent("keyup", { key: text[i] })); // Simulate keyup
            i++;
            setTimeout(typeCharacter, delay); // Repeat with delay
        } else {
            element.dispatchEvent(new Event("change", { bubbles: true })); // Trigger change event at the end
        }
    }

    typeCharacter();
}

export function search(q: string) {
    const el = document.querySelector(
        ".ytmusic-search-box input"
    ) as HTMLInputElement;
    if (el) {
        simulateTyping(el, q, 100);
    }
}

export function prev() {
    const PREV_SELECTOR = ".previous-button";

    const el = document.querySelector(PREV_SELECTOR) as HTMLButtonElement;

    if (el) {
        el.click();
    }
}

export function resume() {
    const VIDEO_SELECTOR = "play-pause-button";

    const el = document.querySelector(VIDEO_SELECTOR) as HTMLButtonElement;

    if (el) {
        el.click();
    }
}

function getActiveTab(): Observable<chrome.tabs.Tab> {
    const obs = new Subject<chrome.tabs.Tab>();

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];

        chrome.scripting.executeScript({
            target: { tabId: tab.id as number },
            files: ["content.js"],
        });

        if (tab) {
            obs.next(tab);
        }
    });

    return obs.asObservable(); // Return the observable to allow subscription
}
export function playCommand() {
    getActiveTab().subscribe((tab) => {
        if (!tab.id) throw new Error("Tab not found");
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: play,
        });
    });
}

export function pauseCommand() {
    getActiveTab().subscribe((tab) => {
        if (!tab.id) throw new Error("Tab not found");
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: pause,
        });
    });
}

export function nextCommand() {
    getActiveTab().subscribe((tab) => {
        if (!tab.id) throw new Error("Tab not found");
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: next,
        });
    });
}

export function prevCommand() {
    getActiveTab().subscribe((tab) => {
        if (!tab.id) throw new Error("Tab not found");
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: prev,
        });
    });
}

export function volumeUpCommand() {
    getActiveTab().subscribe((tab) => {
        if (!tab.id) throw new Error("Tab not found");
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: volumeUp,
        });
    });
}

export function volumeDownCommand() {
    getActiveTab().subscribe((tab) => {
        if (!tab.id) throw new Error("Tab not found");
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: volumeDown,
        });
    });
}

export function muteCommand() {
    getActiveTab().subscribe((tab) => {
        if (!tab.id) throw new Error("Tab not found");
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: mute,
        });
    });
}

export function onVideoFinished() {
    getActiveTab().subscribe((tab) => {
        if (!tab.id) throw new Error("Tab not found");
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                chrome.storage.local.get("partyUrl", (result) => {
                    const socket = io(result.partyUrl);
                    socket.emit("videoFinished");
                });
            },
        });
    });
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

        const endedPayload = {
            roomId: ROOM_ID,
            lastVideoId: "",
        };

        setInterval(() => {
            const VIDEO_SELECTOR =
                "#movie_player > div.html5-video-container > video";

            let el = document.querySelector(VIDEO_SELECTOR) as HTMLVideoElement;
            if (!el) return;

            el.ontimeupdate = () => {
                endedPayload.lastVideoId = new URL(
                    window.location.href
                ).searchParams.get("v") as string;
                el = document.querySelector(VIDEO_SELECTOR) as HTMLVideoElement;
                if (queues.length == 0) {
                    return;
                }
                if (el.duration - el.currentTime < 2) {
                    console.log("Still playin!");
                    // Trigger 2 seconds before end
                    if (!el.paused) {
                        // console.log("Still playin!");
                        pause();
                        socket.emit("ended", endedPayload);
                    }
                }
            };

            el.onplay = () => {
                socket.emit("started", {
                    id: new URL(window.location.href).searchParams.get("qid"),
                });
            };
        }, 2000);

        const VIDEO_SELECTOR =
            "#movie_player > div.html5-video-container > video";

        let el = document.querySelector(VIDEO_SELECTOR) as HTMLVideoElement;

        if (el) {
            el.ontimeupdate = () => {
                el = document.querySelector(VIDEO_SELECTOR) as HTMLVideoElement;
                endedPayload.lastVideoId = new URL(
                    window.location.href
                ).searchParams.get("v") as string;
                if (queues.length == 0) {
                    return;
                }
                if (el.duration - el.currentTime < 2) {
                    console.log("Still playin!");

                    // Trigger 2 seconds before end
                    if (!el.paused) {
                        console.log("Still playin!");
                        pause();
                        socket.emit("ended", endedPayload);
                    }
                }
            };

            el.onplay = () => {
                socket.emit("started", {
                    id: new URL(window.location.href).searchParams.get("qid"),
                });
            };
        }

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

                            const accountButton = document.querySelector(
                                '[aria-label="Open avatar menu"]'
                            ) as HTMLButtonElement;

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
                                const user = document.querySelector(
                                    "#account-name"
                                ) as HTMLDivElement;

                                console.log(user);
                                const browser = [
                                    user?.textContent,
                                    info?.name,
                                    info?.os,
                                ]
                                    .filter(Boolean)
                                    .join(" ");

                                resolve({
                                    id: result.roomId,
                                    browser: browser,
                                    ip: res.data.ip_addr,
                                });
                            }, 300);
                        } catch (error) {
                            reject(error);
                        }
                    }
                );
            }),
            tap(async (data) => {
                console.log(data);
                console.log(result.joined);
                // if (result.joined) {
                //     socket.emit("refreshQueue", data);
                //     return;
                // }
                socket.emit("join", data);
            })
        );

        const playbackObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation, i) => {
                if (
                    mutation.type === "childList" &&
                    i == 0 &&
                    mutation.target.textContent
                ) {
                    const title = [
                        mutation.target.textContent,
                        document.querySelector(artist)?.textContent,
                    ].join(" - ");
                    socket.emit("change", {
                        title,
                        videoId: new URL(window.location.href).searchParams.get(
                            "v"
                        ),
                        roomId: ROOM_ID,
                    });
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

        socket.on("play", (data: Queue) => {
            console.log(data);
            play(data);
        });

        socket.on("search", (query: string) => {
            search(query);
        });

        socket.on("pause", () => {
            pause();
        });

        socket.on("next", (data: Queue) => {
            console.log(data);
            next(data);
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
        });

        socket.on("resume", () => {
            resume();
        });

        socket.on("disconnect", () => {
            console.log("Disconnected from WebSocket server");
        });
    }
);
