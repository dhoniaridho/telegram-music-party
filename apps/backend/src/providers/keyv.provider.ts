// keyv.provider.ts
import Keyv from 'keyv';
import KeyvRedis, { createClient, RedisClientType } from '@keyv/redis';
import { ENV } from 'src/config/env';

export const KeyvProvider = {
    provide: 'KEYV_CACHE',
    useFactory: async () => {
        if (!ENV.REDIS_URL) {
            console.info('REDIS_URL is not set; using in-memory cache.');
            return new Keyv();
        }

        const redis = createClient({
            url: ENV.REDIS_URL,
            socket: {
                connectTimeout: 3000,
                reconnectStrategy: false,
            },
        }) as RedisClientType;
        redis.on('error', (error) => {
            console.error('Redis connection error:', error);
        });

        try {
            await redis.connect();
            console.info('Using Redis cache.');
            return new Keyv({ store: new KeyvRedis(redis) });
        } catch (error) {
            console.warn('Redis is unavailable; using in-memory cache.', error);
            return new Keyv();
        }
    },
};
