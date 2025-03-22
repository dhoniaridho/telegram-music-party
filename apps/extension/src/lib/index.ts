import { Subject, Observable, from, map, tap } from "rxjs";
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
    localStorage.setItem("current", JSON.stringify(queue));
    if (queue?.url) {
        return (window.location.href = `https://music.youtube.com/watch?v=${queue.url}&qid=${queue.id}`);
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

    const el = document.querySelector(VIDEO_SELECTOR) as HTMLVideoElement;

    if (el) {
        el.pause();
    }
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
        localStorage.setItem("current", JSON.stringify(queue));
        return (window.location.href = `https://music.youtube.com/watch?v=${queue.url}&qid=${queue.id}`);
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

type Storage = "partyUrl" | "roomId";

chrome.storage.local.get(["partyUrl", "roomId"] as Storage[], (result) => {
    const socket = io(result.partyUrl); // Replace with your server URL

    // const VIDEO_SELECTOR = "#movie_player > div.html5-video-container > video";

    const join$ = from(
        axios.get("https://ifconfig.me/all.json", {
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
            },
        })
    ).pipe(
        map((res) => {
            console.log(res.data);
            // let el = document.querySelector(VIDEO_SELECTOR) as HTMLVideoElement;
            const info = detect();
            const browser = [info?.name, info?.os].join(" ");
            return {
                id: result.roomId,
                browser: browser,
                ip: res.data.ip_addr,
            };
        }),
        tap(console.log),
        tap((data) => socket.emit("join", data))
    );

    join$.subscribe();

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
                socket.emit("change", title);
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

    socket.on("connect", () => {
        console.log("Connected to WebSocket server with ID:", socket.id);
    });

    socket.on("play", (data: Queue) => {
        play(data);
    });

    socket.on("search", (query: string) => {
        search(query);
    });

    socket.on("pause", () => {
        pause();
    });

    socket.on("next", (data: Queue) => {
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
});
