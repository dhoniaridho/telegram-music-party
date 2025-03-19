import { Subject, Observable } from "rxjs";
import { io } from "socket.io-client";

type Queue = { id: string; url: string };

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

chrome.storage.local.get("partyUrl", (result) => {
    const socket = io(result.partyUrl); // Replace with your server URL

    const VIDEO_SELECTOR = "#movie_player > div.html5-video-container > video";

    let el = document.querySelector(VIDEO_SELECTOR) as HTMLVideoElement;

    setInterval(() => {
        el = document.querySelector(VIDEO_SELECTOR) as HTMLVideoElement;
        if (!el) return;
        el.onended = () => {
            socket.emit("ended", localStorage.getItem("current"));
            localStorage.removeItem("current");
        };

        el.onplay = () => {
            socket.emit("started", {
                id: new URL(window.location.href).searchParams.get("qid"),
            });
        };
    }, 2000);

    if (el) {
        el.onended = () => {
            socket.emit("ended", {
                id: new URL(window.location.href).searchParams.get("qid"),
            });
        };

        el.onplay = () => {
            socket.emit("started", {
                id: new URL(window.location.href).searchParams.get("qid"),
            });
        };
    }

    socket.on("connect", () => {
        console.log("Connected to WebSocket server with ID:", socket.id);
    });

    socket.on("play", (data: Queue) => {
        play(data);
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
