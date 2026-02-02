import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { loadConfig } from "./config";
import { createAlpacaClient } from "./alpaca";
import { createMarketDataClient } from "./market-data";
import { createContext, createFetchContext } from "./trpc/context";
import { createAppRouter } from "./trpc/routers";
import { runCycle } from "./run-cycle";

const config = loadConfig();
const alpaca = createAlpacaClient(config);
const marketData = createMarketDataClient(config);

const runCycleDeps = { alpaca, marketData, config };
let isRunning = false;

async function runNow(): Promise<void> {
  if (isRunning) return;
  isRunning = true;
  try {
    await runCycle(runCycleDeps);
  } finally {
    isRunning = false;
  }
}

const trpcContext = createContext({ alpaca, config });
const appRouter = createAppRouter(runNow);

const app = new Hono();

app.all(
  "/trpc/*",
  (c) =>
    fetchRequestHandler({
      endpoint: "/trpc",
      req: c.req.raw,
      router: appRouter,
      createContext: createFetchContext(trpcContext),
    })
);

app.use(
  "/*",
  serveStatic({
    root: "./dashboard/dist",
    rewriteRequestPath: (path) =>
      path === "/" || !path.includes(".") ? "/index.html" : path,
  })
);

const port = Number(process.env.PORT ?? 3000);

console.log(`Server listening on http://localhost:${port}`);
console.log(`tRPC at http://localhost:${port}/trpc`);
console.log(`Trading interval: ${config.trading.intervalMinutes} min, dry run: ${config.trading.dryRun}`);

runNow().catch((err) => console.error("Initial run failed:", err));

const intervalMs = config.trading.intervalMinutes * 60 * 1000;
setInterval(() => {
  runNow().catch((err) => console.error("Scheduled run failed:", err));
}, intervalMs);

Bun.serve({
  port,
  fetch: app.fetch,
});
