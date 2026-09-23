# Reliability changes: first rollout

## Scope

This patch hardens scheduled content queue answers, daily bonuses, learning
session answers, and daily content broadcasts. Legacy game reward handlers,
mini-event rewards, weekly rewards, and session creation need a separate audit;
they are not covered by the queue transaction guarantee.

## Data compatibility

- Existing participation rows and game type names remain unchanged. Bonus
  eligibility recognizes both legacy and queue names, without retroactive payouts.
- Answer, points, and the daily bonus commit together for queue answers. A user
  row lock serializes concurrent queue/bonus transactions across instances.
- Session answers check ownership and exercise identity, evaluate AI outside the
  transaction, then recheck position under a lock. Learning progress, mistakes,
  attempts, and session advancement commit together.
- Old session keyboards lack exercise identity and must be refreshed with /session.
- Queue questions expire at the end of their Telegram message's local day.
- Existing daily_log entries without delivery rows are treated as legacy
  publications and are not resent.

## Deployment

1. Back up MySQL and the data volume. Record the deployed commit.
2. Run npm ci and npm test in an isolated checkout with no production credentials.
3. Test against a disposable MySQL database and a test Telegram bot. The committed
   reliability unit tests mock database methods; they do not prove MySQL locking.
4. Startup and writable content CLI commands automatically apply the additive
   SQL migrations 001–003, including with DB_SYNC_MODE=off. The database account
   needs CREATE privileges. Existing tables and records remain unchanged; do not
   use force or alter for this rollout.
5. Stop all old instances before starting this version. Mixed versions can bypass
   the new reward and broadcast protections. Deploy outside an active broadcast.
6. Verify duplicate clicks, concurrent workers, rollback on failed writes, and
   restart during a broadcast in staging before enabling production.

## Delivery semantics and recovery

Publication, queue reservation, and recipients are created in one transaction.
Workers claim pending recipients with a conditional update before sending.
Pending deliveries for the current Chisinau day resume on startup and every minute.
Sent recipients are never retried. Telegram 429 responses remain pending until
retry_after (at least 60 seconds). Definitive 400/403 rejections become failed.

Telegram sendMessage does not participate in the database transaction. A network
failure can leave it unclear whether a message was delivered. Such rows become
unknown; a crash after claiming can leave sending. Neither is retried automatically,
to avoid duplicate notifications. Check Telegram delivery before manually resolving
those rows. Pending rows from past days also require review, not automatic replay.

Inspect unresolved deliveries:

```sql
SELECT id, daily_log_id, user_id, status, retry_at, updated_at
FROM content_deliveries
WHERE status IN ('sending', 'unknown', 'failed', 'pending')
ORDER BY updated_at;
```

The table must survive restarts. Do not delete daily_log or content_deliveries to
retry a broadcast. On rollback, stop workers first and retain these tables. The
previous code does not understand pending recipients; do not restart its scheduler
mid-broadcast without checking which recipients already received messages.

## Test safety

npm test runs the existing checks and the reliability suite without sending
Telegram notifications by default. TEST_NOTIFY_TELEGRAM=true explicitly enables
the legacy test notification and is not intended for CI.
