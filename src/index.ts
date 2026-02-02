import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { loadConfig } from "./config";
import { createAlpacaClient } from "./alpaca";
import { createMarketDataClient } from "./market-data";
import { createContext, createFetchContext } from "./trpc/context";
import { createAppRouter } from "./trpc/routers";
import { runCycle } from "./run-cycle";

/** US regular session only: Mon–Fri 9:30 AM–4:00 PM Eastern (no pre-market or after-hours). */
function isUSRegularMarketHours(now: Date = new Date()): boolean {
  const tz = "America/New_York";
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
  }).format(now);
  if (weekday === "Sat" || weekday === "Sun") return false;
  const hour = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      hour12: false,
    }).format(now),
    10
  );
  const minute = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      minute: "2-digit",
    }).format(now),
    10
  );
  const mins = hour * 60 + minute;
  const open = 9 * 60 + 30; // 9:30 AM
  const close = 16 * 60; // 4:00 PM
  return mins >= open && mins < close;
}

const config = loadConfig();
const alpaca = createAlpacaClient(config);
const marketData = createMarketDataClient(config);

const runCycleDeps = { alpaca, marketData, config };
let isRunning = false;

async function runNow(): Promise<void> {
  if (!isUSRegularMarketHours()) return;
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

const port = Number(process.env.PORT ?? 4108);

console.log(`Server listening on http://localhost:${port}`);
console.log(`tRPC at http://localhost:${port}/trpc`);
console.log(
  `Trading: ${config.trading.intervalMinutes} min interval, US regular session only (Mon–Fri 9:30–16:00 ET), dry run: ${config.trading.dryRun}`
);

runNow().catch((err) => console.error("Initial run failed:", err));

const intervalMs = config.trading.intervalMinutes * 60 * 1000;
setInterval(() => {
  runNow().catch((err) => console.error("Scheduled run failed:", err));
}, intervalMs);

const hostname = process.env.HOSTNAME ?? "0.0.0.0";

Bun.serve({
  port,
  hostname,
  fetch: app.fetch,
});
