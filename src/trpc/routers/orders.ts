import { router, publicProcedure } from "../trpc";

export const ordersRouter = router({
  getOpen: publicProcedure.query(async ({ ctx }) => {
    return ctx.alpaca.getOpenOrders();
  }),
});
