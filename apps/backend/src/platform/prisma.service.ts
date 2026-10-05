import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaClient as SqlitePrismaClient } from '../../prisma/generated/sqlite-client';
import { ENV } from 'src/config/env';

const SelectedPrismaClient = (
    ENV.DATABASE_PROVIDER === 'postgresql'
        ? PrismaClient
        : SqlitePrismaClient
) as typeof PrismaClient;

@Injectable()
export class PrismaService extends SelectedPrismaClient {
    constructor() {
        super({
            datasources: {
                db: {
                    url:
                        ENV.DATABASE_PROVIDER === 'postgresql'
                            ? ENV.DATABASE_URL
                            : ENV.SQLITE_DATABASE_URL,
                },
            },
        });
    }
}
