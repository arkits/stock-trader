import { router, publicProcedure } from "../trpc";

export const positionsRouter = router({
  getAll: publicProcedure.query(async ({ ctx }) => {
    return ctx.alpaca.getPositions();
  }),
});
