import { OnModuleDestroy } from '@nestjs/common';
import { type PoolClient, type QueryResultRow } from 'pg';
export declare class DatabaseService implements OnModuleDestroy {
    private readonly pool;
    constructor();
    query<T extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]): Promise<import("pg").QueryResult<T>>;
    connect(): Promise<PoolClient>;
    onModuleDestroy(): Promise<void>;
}
