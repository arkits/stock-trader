import { router, publicProcedure } from "../trpc";

export const accountRouter = router({
  get: publicProcedure.query(async ({ ctx }) => {
    return ctx.alpaca.getAccount();
  }),
});
