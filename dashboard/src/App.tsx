import { Link, BrowserRouter, Routes, Route } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useTheme } from "./theme-provider";
import Overview from "./views/Overview";
import Runs from "./views/Runs";
import Config from "./views/Config";

function App() {
  const { theme, setTheme } = useTheme();

  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col">
        <nav className="border-b border-border bg-card px-6 py-4 flex gap-4 items-center justify-between">
          <div className="flex gap-4 items-center">
            <Button variant="ghost" asChild>
              <Link to="/">Overview</Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link to="/runs">Runs</Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link to="/config">Config</Link>
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Dark</span>
            <Switch
              checked={theme === "dark"}
              onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
            />
          </div>
        </nav>
        <main className="flex-1 p-6">
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/runs" element={<Runs />} />
            <Route path="/config" element={<Config />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
