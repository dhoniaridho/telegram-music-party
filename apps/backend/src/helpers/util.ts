export const encodeRoomID = (roomID: string): string =>
    Buffer.from(roomID).toString('base64');

export const decodeRoomID = (roomID: string): string =>
    Buffer.from(roomID, 'base64').toString();

export const formatDuration = (duration: number): string => {
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};
