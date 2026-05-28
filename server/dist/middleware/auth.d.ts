import { Request, Response, NextFunction } from 'express';
export interface AuthPayload {
    userId: number;
    username: string;
    role: 'admin' | 'viewer';
}
declare global {
    namespace Express {
        interface Request {
            user?: AuthPayload;
        }
    }
}
export declare function generateToken(payload: AuthPayload): string;
export declare function authenticate(req: Request, res: Response, next: NextFunction): Response<any, Record<string, any>> | undefined;
export declare function requireAdmin(req: Request, res: Response, next: NextFunction): Response<any, Record<string, any>> | undefined;
