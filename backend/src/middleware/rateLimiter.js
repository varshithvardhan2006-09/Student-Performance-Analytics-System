// ============================================================================
// src/middleware/rateLimiter.js
// A small in-memory sliding-window rate limiter. Sufficient for a single
// server; a shared store such as Redis would be needed to run several.
// ============================================================================

// req.ip honours the X-Forwarded-For header only when Express' "trust proxy"
// setting is on (see TRUST_PROXY), so a client cannot pick its own address.
function getClientIp(req) {
  return String(req.ip || req.socket?.remoteAddress || 'unknown');
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

    // Drop expired buckets now and then so the map cannot grow without bound.
    if (buckets.size > 5000) {
      for (const [bucketKey, entry] of buckets) {
        if (entry.resetAt <= now) buckets.delete(bucketKey);
      }
    }

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
  createRateLimiter,
  authRateLimiter,
  uploadRateLimiter,
};
