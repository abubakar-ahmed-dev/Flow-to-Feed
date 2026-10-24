# Cache-Aside Pattern

## Concept

Cache-aside (lazy loading) is a caching strategy where the application — not the cache — is responsible for keeping data consistent. The cache sits between the application and the database, but nothing loads into it automatically. Data enters the cache only when the application asks for it and finds it missing.

## Mechanism

1. The application receives a read request and checks the cache first.
2. **Cache hit:** the value is returned immediately. The database is never touched.
3. **Cache miss:** the application reads the value from the database, stores a copy in the cache with a TTL, and then returns it.
4. On writes, the application updates the database and **invalidates** the cache entry (deletes it), rather than updating the cached copy. The next read repopulates the cache with fresh data.

## Example

A product page reads product details by ID. First request: cache miss — a PostgreSQL query runs (~40 ms), the result lands in Redis with a 5-minute TTL, and the response returns. The next 999 requests within five minutes are cache hits (~1 ms). When a seller edits the product, the app writes to PostgreSQL and deletes the Redis key, so no reader sees stale data beyond one request.

## Caveats

- **Stale data window:** with invalidation-on-write, a race can serve one stale read; with TTL-only expiry, staleness lasts up to the TTL.
- **First-request penalty:** every key starts cold; a thundering herd of simultaneous misses for the same key can hit the database hard (mitigate with request coalescing or short locks).
- **Cache is disposable:** if Redis restarts, the system must stay correct — the database remains the source of truth, and the cache warms up again under load.
