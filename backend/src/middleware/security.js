// ============================================================================
// src/middleware/security.js
// Response headers that harden the browser against sniffing, clickjacking
// and referrer leakage.
// ============================================================================
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  next();
}

module.exports = {
  securityHeaders,
};
