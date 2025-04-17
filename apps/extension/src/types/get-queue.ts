export interface YTGetQueueResponse {
    responseContext: ResponseContext;
    trackingParams: string;
    queueContextParams: string;
}

export interface ResponseContext {
    serviceTrackingParams: ServiceTrackingParam[];
    consistencyTokenJar: ConsistencyTokenJar;
    innertubeTokenJar: InnertubeTokenJar;
}

export interface ServiceTrackingParam {
    service: string;
    params: Param[];
}

export interface Param {
    key: string;
    value: string;
}

export interface ConsistencyTokenJar {
    encryptedTokenJarContents: string;
    expirationSeconds: string;
}

export interface InnertubeTokenJar {
    appTokens: AppToken[];
}

export interface AppToken {
    type: number;
    value: string;
    maxAgeSeconds: number;
    creationTimeUsec: string;
}
