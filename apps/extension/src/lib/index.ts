import { Subject, Observable } from "rxjs";
import { io } from "socket.io-client";

export function play(url?: string) {
    if (url) {
        return (window.location.href = `https://www.youtube.com/watch?v=${url}`);
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
    const VIDEO_SELECTOR = "#movie_player > div.html5-video-container > video";

    const el = document.querySelector(VIDEO_SELECTOR) as HTMLVideoElement;

    if (el) {
        el.muted = !el.muted;
    }
}

export function next() {
    const NEXT_SELECTOR =
        "#movie_player > div.ytp-chrome-bottom > div.ytp-chrome-controls > div.ytp-left-controls > a.ytp-next-button.ytp-button.ytp-playlist-ui";

    const el = document.querySelector(NEXT_SELECTOR) as HTMLButtonElement;

    if (el) {
        el.click();
    }
}

export function prev() {
    const PREV_SELECTOR =
        "#movie_player > div.ytp-chrome-bottom > div.ytp-chrome-controls > div.ytp-left-controls > a.ytp-prev-button.ytp-button";

    const el = document.querySelector(PREV_SELECTOR) as HTMLButtonElement;

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

chrome.storage.local.get("partyUrl", (result) => {
    const socket = io(result.partyUrl); // Replace with your server URL

    const VIDEO_SELECTOR = "#movie_player > div.html5-video-container > video";

    let el = document.querySelector(VIDEO_SELECTOR) as HTMLVideoElement;

    setInterval(() => {
        el = document.querySelector(VIDEO_SELECTOR) as HTMLVideoElement;
        if (!el) return;
        el.onended = () => {
            socket.emit("ended");
        };

        el.onplay = () => {
            socket.emit("started");
        };
    }, 2000);

    if (el) {
        el.onended = () => {
            socket.emit("ended");
        };

        el.onplay = () => {
            socket.emit("started");
        };
    }

    socket.on("connect", () => {
        console.log("Connected to WebSocket server with ID:", socket.id);
    });

    socket.on("play", (data: { url: string }) => {
        play(data.url);
    });

    socket.on("pause", () => {
        pause();
    });

    socket.on("next", () => {
        next();
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

    socket.on("disconnect", () => {
        console.log("Disconnected from WebSocket server");
    });
});
