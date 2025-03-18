import { Subject, Observable } from "rxjs";
import * as playback from "./playback";

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
            func: playback.play,
        });
    });
}

export function pauseCommand() {
    getActiveTab().subscribe((tab) => {
        if (!tab.id) throw new Error("Tab not found");
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: playback.pause,
        });
    });
}

export function nextCommand() {
    getActiveTab().subscribe((tab) => {
        if (!tab.id) throw new Error("Tab not found");
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: playback.next,
        });
    });
}

export function prevCommand() {
    getActiveTab().subscribe((tab) => {
        if (!tab.id) throw new Error("Tab not found");
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: playback.prev,
        });
    });
}

export function volumeUpCommand() {
    getActiveTab().subscribe((tab) => {
        if (!tab.id) throw new Error("Tab not found");
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: playback.volumeUp,
        });
    });
}

export function volumeDownCommand() {
    getActiveTab().subscribe((tab) => {
        if (!tab.id) throw new Error("Tab not found");
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: playback.volumeDown,
        });
    });
}

export function muteCommand() {
    getActiveTab().subscribe((tab) => {
        if (!tab.id) throw new Error("Tab not found");
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: playback.mute,
        });
    });
}
