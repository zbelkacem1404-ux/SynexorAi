import { Database as SqlJsDatabase } from 'sql.js';
export declare function getDb(): Promise<SqlJsDatabase>;
export declare function getDbSync(): SqlJsDatabase;
export declare function saveDb(): void;
export declare function initializeDb(): Promise<void>;
export declare function queryAll(sql: string, params?: any[]): any[];
export declare function queryOne(sql: string, params?: any[]): any | null;
export declare function runSql(sql: string, params?: any[]): {
    lastId: number;
};
export declare function execSql(sql: string, params?: any[]): void;
