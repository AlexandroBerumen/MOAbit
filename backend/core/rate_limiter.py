import asyncio
import time


class TokenBucket:
    """Allows up to `rate` calls per `period` seconds.

    Gemini free tier: 15 RPM. Every Gemini call must await acquire() first.
    This is a single-process lock — replace with Redis-backed limiter for multi-worker deploys.
    """

    def __init__(self, rate: int = 15, period: float = 60.0) -> None:
        self.rate = rate
        self.period = period
        self.tokens: float = rate
        self.last_refill = time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        async with self._lock:
            now = time.monotonic()
            elapsed = now - self.last_refill
            refill = (elapsed / self.period) * self.rate
            self.tokens = min(self.rate, self.tokens + refill)
            self.last_refill = now

            if self.tokens < 1:
                wait_time = (1 - self.tokens) / self.rate * self.period
                await asyncio.sleep(wait_time)
                self.tokens = 0
            else:
                self.tokens -= 1


gemini_limiter = TokenBucket(rate=15, period=60.0)
