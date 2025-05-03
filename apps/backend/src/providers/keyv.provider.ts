// keyv.provider.ts
import Keyv from 'keyv';
import KeyvRedis, { createClient, RedisClientType } from '@keyv/redis';
import { ENV } from 'src/config/env';

export const KeyvProvider = {
    provide: 'KEYV_CACHE',
    useFactory: async () => {
        const redis = createClient({
            url: ENV.REDIS_URL,
        }) as RedisClientType;
        await redis.connect();
        return new Keyv({ store: new KeyvRedis(redis) });
    },
};
