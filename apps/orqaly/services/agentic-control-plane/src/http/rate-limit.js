export function createPrincipalRateLimiter({ windowMs, maximumRequests, now = Date.now }) {
  const counters = new Map();
  let requestsSinceCleanup = 0;

  return (req, res, next) => {
    const principal = req.principal;
    const key = `${principal.organizationId}:${principal.workspaceId}:${principal.userId}`;
    const currentTime = now();
    const existing = counters.get(key);
    const counter =
      !existing || existing.resetAt <= currentTime
        ? { count: 0, resetAt: currentTime + windowMs }
        : existing;
    counter.count += 1;
    counters.set(key, counter);

    res.set('RateLimit-Limit', String(maximumRequests));
    res.set('RateLimit-Remaining', String(Math.max(0, maximumRequests - counter.count)));
    res.set('RateLimit-Reset', String(Math.ceil(counter.resetAt / 1000)));

    requestsSinceCleanup += 1;
    if (requestsSinceCleanup >= 500) {
      requestsSinceCleanup = 0;
      for (const [entryKey, entry] of counters) {
        if (entry.resetAt <= currentTime) counters.delete(entryKey);
      }
    }

    if (counter.count > maximumRequests) {
      return res.status(429).json({
        error: { code: 'rate_limit_exceeded', requestId: req.requestId },
      });
    }
    next();
  };
}
