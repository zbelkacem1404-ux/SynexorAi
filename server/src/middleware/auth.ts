import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'supplier-logistics-secret-key-2026';

export type UserRole = 'admin' | 'supervisor' | 'planner' | 'operations' | 'carrier' | 'viewer';

export interface AuthPayload {
  userId: number;
  username: string;
  role: UserRole;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

export function generateToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const token = header.split(' ')[1];
    req.user = jwt.verify(token, JWT_SECRET) as AuthPayload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

/** Allows admin + supervisor — used for approval board actions */
export function requireSupervisor(req: Request, res: Response, next: NextFunction) {
  if (!req.user || !['admin', 'supervisor'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Supervisor or Admin access required' });
  }
  next();
}

/** Blocks carrier role — internal-only endpoints */
export function requireInternal(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role === 'carrier') {
    return res.status(403).json({ error: 'Internal access only' });
  }
  next();
}
