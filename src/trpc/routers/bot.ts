import { z } from "zod";
import { router, publicProcedure } from "../trpc";

export function createBotRouter(runNow: () => Promise<void>) {
  return router({
    getConfig: publicProcedure.query(({ ctx }) => {
      return ctx.getSafeConfig();
    }),
    getLastRun: publicProcedure.query(({ ctx }) => {
      return ctx.getLastRun();
    }),
    getRunHistory: publicProcedure
      .input(z.number().min(1).max(100).optional().default(20))
      .query(({ ctx, input }) => {
        return ctx.getRunHistory(input);
      }),
    getResearchRun: publicProcedure
      .input(z.number())
      .query(({ ctx, input }) => {
        return ctx.getResearchRunByRunId(input);
      }),
    runNow: publicProcedure.mutation(async () => {
      await runNow();
    }),
  });
}
