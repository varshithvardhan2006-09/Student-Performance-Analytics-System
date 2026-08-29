// ============================================================================
// src/middleware/rateLimiter.js
// A small in-memory sliding-window rate limiter. Sufficient for a single
// server; a shared store such as Redis would be needed to run several.
// ============================================================================

function getClientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || req.ip || 'unknown')
    .split(',')[0]
    .trim();
}

function createRateLimiter({ windowMs, max, message }) {
  const buckets = new Map();
  return (req, res, next) => {
    const key = `${getClientIp(req)}:${req.method}:${req.path}`;
    const now = Date.now();
    const bucket = buckets.get(key) || { count: 0, resetAt: now + windowMs };

    if (bucket.resetAt <= now) {
      bucket.count = 0;
      bucket.resetAt = now + windowMs;
    }

    bucket.count += 1;
    buckets.set(key, bucket);

    if (bucket.count > max) {
      res.setHeader('Retry-After', Math.ceil((bucket.resetAt - now) / 1000));
      return res.status(429).json({ success: false, message });
    }

    next();
  };
}

const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT || '25', 10),
  message: 'Too many login/signup attempts. Please wait and try again.',
});

const uploadRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.UPLOAD_RATE_LIMIT || '30', 10),
  message: 'Too many uploads. Please wait and try again.',
});

module.exports = {
  authRateLimiter,
  uploadRateLimiter,
};
