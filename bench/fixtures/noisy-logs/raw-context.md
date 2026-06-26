# Noisy Logs Session

Current task: Fix websocket reconnect loop.

The transcript contains thousands of repeated log lines:

Error: ECONNRESET while reconnecting websocket
Error: ECONNRESET while reconnecting websocket
Error: ECONNRESET while reconnecting websocket
Error: ECONNRESET while reconnecting websocket
Error: ECONNRESET while reconnecting websocket
Error: ECONNRESET while reconnecting websocket
Error: ECONNRESET while reconnecting websocket
Error: ECONNRESET while reconnecting websocket
Error: ECONNRESET while reconnecting websocket
Error: ECONNRESET while reconnecting websocket
Error: ECONNRESET while reconnecting websocket
Error: ECONNRESET while reconnecting websocket
Error: ECONNRESET while reconnecting websocket
Error: ECONNRESET while reconnecting websocket
Error: ECONNRESET while reconnecting websocket
Error: ECONNRESET while reconnecting websocket
Error: ECONNRESET while reconnecting websocket
Error: ECONNRESET while reconnecting websocket
Error: ECONNRESET while reconnecting websocket
Error: ECONNRESET while reconnecting websocket

Touched files: `src/ws/client.ts`, `src/ws/backoff.ts`, `tests/ws/reconnect.test.ts`.
Decision: Keep exponential backoff jitter.
Constraint: Do not change public websocket client API.
Failure: reconnect.test.ts times out after 5000ms.
Next step: Reset reconnect timer after successful open event.

Additional repeated transport logs:
websocket reconnect attempt 1 failed with ECONNRESET
websocket reconnect attempt 2 failed with ECONNRESET
websocket reconnect attempt 3 failed with ECONNRESET
websocket reconnect attempt 4 failed with ECONNRESET
websocket reconnect attempt 5 failed with ECONNRESET
websocket reconnect attempt 1 failed with ECONNRESET
websocket reconnect attempt 2 failed with ECONNRESET
websocket reconnect attempt 3 failed with ECONNRESET
websocket reconnect attempt 4 failed with ECONNRESET
websocket reconnect attempt 5 failed with ECONNRESET
websocket reconnect attempt 1 failed with ECONNRESET
websocket reconnect attempt 2 failed with ECONNRESET
websocket reconnect attempt 3 failed with ECONNRESET
websocket reconnect attempt 4 failed with ECONNRESET
websocket reconnect attempt 5 failed with ECONNRESET
