import { Request, Response, NextFunction } from 'express';

const requests = new Map<string, number[]>();

export function rateLimiter(req: Request, res: Response, next: NextFunction): void {
  const clientId = req.ip || 'unknown';
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  const maxRequests = 100;

  if (!requests.has(clientId)) {
    requests.set(clientId, []);
  }

  const clientRequests = requests.get(clientId)!;
  const recentRequests = clientRequests.filter(time => now - time < windowMs);
  
  if (recentRequests.length >= maxRequests) {
    res.status(429).json({
      error: 'Too Many Requests',
      message: 'Rate limit exceeded',
      retryAfter: Math.ceil(windowMs / 1000)
    });
    return;
  }

  recentRequests.push(now);
  requests.set(clientId, recentRequests);
  next();
}