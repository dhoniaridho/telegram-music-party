import { CronJob } from "cron";
import {
    play,
    refreshToken,
    pause,
    next,
    previous,
    start,
    queue,
    addToQueue,
    getPlaybackState,
    getTrackDetails,
    search,
    devices,
} from "./spotify";

export function main() {
    const cron = new CronJob("*/10 * * * *", async () => {
        refreshToken().subscribe();
    });

    cron.start();
}
/**
 * command methods
 * @description command function must type {Observable}
 */
export const command = {
    play,
    pause,
    next,
    previous,
    start,
    queue,
    addToQueue,
    getPlaybackState,
    getTrackDetails,
    search,
    devices,
};
