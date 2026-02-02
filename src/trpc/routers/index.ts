import { router } from "../trpc";
import { accountRouter } from "./account";
import { positionsRouter } from "./positions";
import { ordersRouter } from "./orders";
import { createBotRouter } from "./bot";

export function createAppRouter(runNow: () => Promise<void>) {
  return router({
    account: accountRouter,
    positions: positionsRouter,
    orders: ordersRouter,
    bot: createBotRouter(runNow),
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;
