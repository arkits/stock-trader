import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "../../src/trpc/routers";

export const trpc = createTRPCReact<AppRouter>();
