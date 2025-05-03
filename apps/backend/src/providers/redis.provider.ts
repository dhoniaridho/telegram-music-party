import { Provider } from '@nestjs/common';
import { createClient } from '@keyv/redis';
import { ENV } from 'src/config/env';

export const RedisProvider: Provider = {
    provide: 'REDIS_CLIENT',
    useFactory: async () => {
        const client = createClient({
            url: ENV.REDIS_URL,
        });
        await client.connect();
        return client;
    },
};
