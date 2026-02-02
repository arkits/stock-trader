import { z } from "zod";
import { router, publicProcedure } from "../trpc";

const portfolioHistoryInput = z
  .object({
    period: z.enum(["1D", "1W", "1A", "1M"]).optional(),
    timeframe: z.enum(["1D", "1H", "15Min", "5Min", "1Min"]).optional(),
  })
  .optional();

export const accountRouter = router({
  get: publicProcedure.query(async ({ ctx }) => {
    return ctx.alpaca.getAccount();
  }),
  getPortfolioHistory: publicProcedure
    .input(portfolioHistoryInput)
    .query(async ({ ctx, input }) => {
      return ctx.alpaca.getPortfolioHistory(input ?? {});
    }),
});
