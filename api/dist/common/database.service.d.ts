import { OnModuleDestroy } from '@nestjs/common';
import { type PoolClient, type PoolConfig, type QueryResultRow } from 'pg';
export declare function databaseConfig(): PoolConfig;
export declare class DatabaseService implements OnModuleDestroy {
    private readonly pool;
    constructor();
    query<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<import("pg").QueryResult<T>>;
    connect(): Promise<PoolClient>;
    onModuleDestroy(): Promise<void>;
}
