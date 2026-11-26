// Cloudflare Workers build of the ERP dashboard (OpenNext). Cache in Workers KV with a per-colo regional cache in front;
// time-based revalidation runs in the background through the Durable Object queue.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import kvIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache";
import { withRegionalCache } from "@opennextjs/cloudflare/overrides/incremental-cache/regional-cache";
import doQueue from "@opennextjs/cloudflare/overrides/queue/do-queue";

export default defineCloudflareConfig({
  incrementalCache: withRegionalCache(kvIncrementalCache, { mode: "long-lived" }),
  queue: doQueue,
  enableCacheInterception: true,
});
