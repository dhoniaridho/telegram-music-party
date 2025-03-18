
export function play() {
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
