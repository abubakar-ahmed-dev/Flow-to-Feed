import { createApp } from "./app.js";
import { env } from "./config/env.js";

const app = createApp();

app.listen(env.port, "0.0.0.0", () => {
  // Must bind 0.0.0.0: n8n in Docker reaches this API via host.docker.internal.
  console.log(`[flowtofeed-api] listening on http://0.0.0.0:${env.port} (${env.nodeEnv})`);
});
