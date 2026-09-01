import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Radar, Play } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { KavachProvider, useKavach } from "@/lib/kavach/store";
import { Sidebar, TopBar, type SectionKey } from "@/components/kavach/Shell";
import {
  AlertsPage,
  CommandCenter,
  DetectionsPage,
  LiveMapPage,
  LogsPage,
  NodesPage,
  SystemInfoPage,
} from "@/components/kavach/pages";

const TITLE = "KAVACH — Rescue Command Center | Post-Disaster Survivor Detection";
const DESC =
  "KAVACH rescue operations console: ESP32 + LoRa mesh sensor nodes, RSSI multilateration and rule-based sensor fusion estimating probable post-disaster search zones.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => (
    <TooltipProvider delayDuration={200}>
      <KavachProvider>
        <App />
        <Toaster position="top-right" />
      </KavachProvider>
    </TooltipProvider>
  ),
});

function StartOverlay() {
  const { start, bootstrapped } = useKavach();
  if (bootstrapped) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/95 px-4">
      <div className="panel max-w-lg p-8 text-center">
        <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-lg bg-primary text-primary-foreground">
          <Radar className="h-7 w-7" />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">
          KAVACH · Rescue Command Center
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Intelligent multi-sensor post-disaster survivor detection over a LoRa mesh network. Start
          the simulation engine to stream synthetic node telemetry, compute probable search zones
          and drive the live console.
        </p>
        <Button size="lg" className="mt-6" onClick={start}>
          <Play /> Start Simulation
        </Button>
        <p className="mt-4 text-[11px] text-muted-foreground">
          Prototype / research demonstration · Sanjivani College of Engineering, Kopargaon ·
          MDC0321 Internet of Things Laboratory
        </p>
      </div>
    </div>
  );
}

function App() {
  const [section, setSection] = useState<SectionKey>("command");
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar
        active={section}
        onSelect={setSection}
        open={navOpen}
        onClose={() => setNavOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onMenu={() => setNavOpen(true)} />
        <main className="flex-1 space-y-4 p-4">
          {section === "command" && <CommandCenter />}
          {section === "map" && <LiveMapPage />}
          {section === "nodes" && <NodesPage />}
          {section === "detections" && <DetectionsPage />}
          {section === "alerts" && <AlertsPage />}
          {section === "logs" && <LogsPage />}
          {section === "system" && <SystemInfoPage />}
          <p className="pt-2 text-center text-[11px] text-muted-foreground">
            Prototype / Research Demonstration — KAVACH reports “possible survivor”, “probable
            search zone” and “supporting evidence” only. Not a certified rescue system.
          </p>
        </main>
      </div>
      <StartOverlay />
    </div>
  );
}
