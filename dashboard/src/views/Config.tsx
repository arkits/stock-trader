import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { trpc } from "../trpc";

export default function Config() {
  const config = trpc.bot.getConfig.useQuery();

  if (config.isLoading) {
    return <p className="text-muted-foreground">Loading config...</p>;
  }
  if (config.isError) {
    return (
      <p className="text-destructive">{String(config.error?.message)}</p>
    );
  }
  if (!config.data) return null;

  const t = config.data.trading;

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Config</h1>
      <Card>
        <CardHeader>
          <CardTitle>Bot configuration</CardTitle>
          <CardDescription>
            Read-only. Secrets are not shown. Edit via environment variables.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 text-sm">
            <div className="flex justify-between py-2 border-b border-border">
              <span className="text-muted-foreground">Interval (minutes)</span>
              <span>{t.intervalMinutes}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-border">
              <span className="text-muted-foreground">Dry run</span>
              <span>{t.dryRun ? "Yes" : "No"}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-border">
              <span className="text-muted-foreground">Symbols</span>
              <span>{t.symbols.join(", ")}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
