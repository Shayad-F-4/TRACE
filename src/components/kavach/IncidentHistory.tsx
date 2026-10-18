import { useState, useMemo } from "react";
import {
  History,
  FileText,
  Download,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Clock,
  MapPin,
  Shield,
  Plus,
  Compass,
  ScrollText,
  ChevronDown,
  ChevronRight,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useKavach } from "@/lib/kavach/store";
import type { AppEvent } from "@/lib/kavach/types";
import { exportCsv, fmtDateTime, SeverityBadge, PriorityBadge } from "./common";
import { cn } from "@/lib/utils";

export function IncidentHistory() {
  const k = useKavach();
  const [subTab, setSubTab] = useState<"incidents" | "localization" | "events">("incidents");
  const [selectedIncidentId, setSelectedIncidentId] = useState<string>(k.incidentId || "INC-001");
  const [eventFilter, setEventFilter] = useState<string>("");
  const [expandedRun, setExpandedRun] = useState<string | null>(null);

  const selectedIncident = k.incidents.find((i) => i.id === selectedIncidentId) || k.incidents[0];

  // Filtered application events
  const filteredEvents = useMemo(() => {
    return (k.events || []).filter((e: AppEvent) => {
      if (!eventFilter) return true;
      const term = eventFilter.toLowerCase();
      return (
        (e.message?.toLowerCase().includes(term) ?? false) ||
        (e.source?.toLowerCase().includes(term) ?? false) ||
        (e.type?.toLowerCase().includes(term) ?? false)
      );
    });
  }, [k.events, eventFilter]);

  // Export CSV handler
  const handleExportCsv = () => {
    const headers = [
      "Timestamp",
      "Event_ID",
      "Type",
      "Severity",
      "Source",
      "Message",
      "Incident_ID",
    ];
    const rows = (k.events || []).map((e: AppEvent) => [
      new Date(e.ts).toISOString(),
      e.id,
      e.type,
      e.severity,
      e.source,
      e.message,
      e.incidentId || selectedIncidentId,
    ]);
    exportCsv(`incident_${selectedIncidentId}_audit`, headers, rows);
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border/60 pb-4">
        <div>
          <p className="trace-label text-[9px] font-semibold tracking-wider text-primary mb-1">
            TRACE / MISSION AUDIT & RETROSPECTIVE
          </p>
          <h1 className="trace-heading text-foreground">Incident History</h1>
          <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
            Historical incident records, past multilateration runs, operational event timelines, and
            mission export.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={handleExportCsv}
          >
            <Download size={13} />
            Export Mission CSV
          </Button>

          {/* Sub-tab Navigation */}
          <div className="flex items-center gap-1 bg-card border border-border p-1 rounded-md text-xs">
            <Button
              size="sm"
              variant={subTab === "incidents" ? "default" : "ghost"}
              className="h-7 text-xs"
              onClick={() => setSubTab("incidents")}
            >
              Incidents ({k.incidents.length})
            </Button>
            <Button
              size="sm"
              variant={subTab === "localization" ? "default" : "ghost"}
              className="h-7 text-xs"
              onClick={() => setSubTab("localization")}
            >
              Localization Runs ({k.zones.length})
            </Button>
            <Button
              size="sm"
              variant={subTab === "events" ? "default" : "ghost"}
              className="h-7 text-xs"
              onClick={() => setSubTab("events")}
            >
              Audit Events ({k.events.length})
            </Button>
          </div>
        </div>
      </div>

      {/* =========================================================================
         SUBTAB 1: INCIDENTS OVERVIEW & TIMELINE
         ========================================================================= */}
      {subTab === "incidents" && (
        <div className="grid lg:grid-cols-3 gap-5">
          {/* Incident Selector List */}
          <div className="panel p-4 space-y-3 lg:col-span-1">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground pb-2 border-b border-border">
              Select Disaster Incident
            </h2>

            <div className="space-y-2">
              {k.incidents.map((inc) => (
                <div
                  key={inc.id}
                  onClick={() => {
                    setSelectedIncidentId(inc.id);
                    k.selectIncident(inc.id);
                  }}
                  className={cn(
                    "p-3 rounded border text-xs cursor-pointer transition-colors space-y-1.5",
                    selectedIncidentId === inc.id
                      ? "border-primary bg-primary/10 shadow-sm"
                      : "border-border bg-card hover:bg-secondary/40",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-foreground">{inc.name}</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[9px] uppercase font-mono",
                        inc.status === "active"
                          ? "border-success text-success"
                          : "border-muted-foreground text-muted-foreground",
                      )}
                    >
                      {inc.status}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {inc.disaster} · {inc.location}
                  </p>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground/80 font-mono pt-1">
                    <span>ID: {inc.id}</span>
                    <span>Commander: {inc.commander || "Field Lead"}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Selected Incident Details & Operational Log */}
          <div className="panel p-4 space-y-4 lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-border">
              <div>
                <h3 className="text-sm font-bold text-foreground">{selectedIncident?.name}</h3>
                <p className="text-xs text-muted-foreground">
                  {selectedIncident?.disaster} · {selectedIncident?.location}
                </p>
              </div>
              <Badge
                variant="outline"
                className="text-[10px] uppercase font-mono border-primary text-primary"
              >
                {selectedIncident?.status?.toUpperCase()}
              </Badge>
            </div>

            {/* Incident Metadata Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div className="panel p-2.5 bg-background/50">
                <p className="trace-label text-[9px]">INCIDENT ID</p>
                <p className="font-mono font-bold text-foreground mt-0.5">{selectedIncident?.id}</p>
              </div>
              <div className="panel p-2.5 bg-background/50">
                <p className="trace-label text-[9px]">COORDINATES</p>
                <p className="font-mono font-bold text-foreground mt-0.5">
                  {selectedIncident?.lat != null &&
                  selectedIncident?.lon != null &&
                  Number.isFinite(selectedIncident.lat) &&
                  Number.isFinite(selectedIncident.lon)
                    ? `${selectedIncident.lat.toFixed(5)}°, ${selectedIncident.lon.toFixed(5)}°`
                    : "Unconfigured"}
                </p>
              </div>
              <div className="panel p-2.5 bg-background/50">
                <p className="trace-label text-[9px]">SECTOR PRIORITY</p>
                <p className="font-mono font-bold text-warning mt-0.5">CRITICAL TACTICAL</p>
              </div>
            </div>

            {/* Notes & Tactical Instructions */}
            <div className="panel p-3 bg-card/60 space-y-1 text-xs">
              <p className="font-semibold text-foreground">Tactical Mission Directive:</p>
              <p className="text-muted-foreground leading-relaxed">
                {selectedIncident?.notes ||
                  "Operational command pass initiated. Ground sensor triangulation active."}
              </p>
            </div>

            {/* Chronological Event Timeline */}
            <div className="space-y-2 pt-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Operational Incident Timeline ({selectedIncident?.timeline?.length || 0})
              </h4>
              <div className="space-y-1.5 font-mono text-xs">
                {selectedIncident?.timeline && selectedIncident.timeline.length > 0 ? (
                  selectedIncident.timeline.map((entry, idx) => (
                    <div
                      key={idx}
                      className="p-2 rounded bg-background/40 border border-border/80 flex items-start gap-2.5"
                    >
                      <Clock size={13} className="text-primary shrink-0 mt-0.5" />
                      <span className="text-foreground">{entry}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground py-2">
                    No timeline entries recorded yet.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
         SUBTAB 2: LOCALIZATION RUNS HISTORY
         ========================================================================= */}
      {subTab === "localization" && (
        <div className="panel p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2.5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground flex items-center gap-2">
              <Compass size={14} className="text-warning" />
              Multilateration & Search Zone Runs
            </h2>
            <Badge variant="outline" className="text-[10px] font-mono">
              Algorithm: TRACE-EST-V6.1-GDOP
            </Badge>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="text-[10px] uppercase font-mono">
                  <TableHead>Zone ID</TableHead>
                  <TableHead>Estimated GPS</TableHead>
                  <TableHead>Uncertainty Radius</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Residual Error</TableHead>
                  <TableHead>Contributing Sensors</TableHead>
                  <TableHead>Timestamp</TableHead>
                  <TableHead className="text-right">Provenance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="text-xs font-mono">
                {k.zones.map((z) => (
                  <TableRow key={z.id} className="hover:bg-secondary/40">
                    <TableCell className="font-bold text-warning">ZONE {z.id}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {z.lat.toFixed(5)}°, {z.lon.toFixed(5)}°
                    </TableCell>
                    <TableCell className="font-bold text-foreground">±{z.radius} m</TableCell>
                    <TableCell className="text-primary font-bold">{z.confidence ?? 0}%</TableCell>
                    <TableCell className="text-muted-foreground">
                      {z.residual?.toFixed(1) ?? "0.0"} m
                    </TableCell>
                    <TableCell className="text-foreground text-[11px]">
                      {z.contributingNodes?.join(", ") || "N01, N02, N03"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-[11px]">
                      {new Date(z.ts).toLocaleTimeString("en-GB")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline" className="text-[9px] uppercase">
                        {z.sourceMode === "live" ? "LIVE HARDWARE" : "SIMULATION"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {k.zones.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center py-6 text-xs text-muted-foreground"
                    >
                      No localization search zones recorded. Run multilateration in Command Center
                      or Live Map.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* =========================================================================
         SUBTAB 3: AUDIT EVENTS LOG
         ========================================================================= */}
      {subTab === "events" && (
        <div className="panel p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-2.5">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground flex items-center gap-2">
              <ScrollText size={14} className="text-primary" />
              Immutable Application Audit Log ({filteredEvents.length})
            </h2>

            <div className="flex items-center gap-2">
              <Input
                placeholder="Filter events by keyword..."
                value={eventFilter}
                onChange={(e) => setEventFilter(e.target.value)}
                className="h-7 w-56 text-xs font-mono"
              />
            </div>
          </div>

          <div className="overflow-x-auto max-h-[500px] overflow-y-auto trace-scroll">
            <Table>
              <TableHeader>
                <TableRow className="text-[10px] uppercase font-mono">
                  <TableHead>Time</TableHead>
                  <TableHead>Event Type</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="text-xs font-mono">
                {filteredEvents.map((evt: AppEvent) => (
                  <TableRow key={evt.id} className="hover:bg-secondary/40">
                    <TableCell className="text-muted-foreground whitespace-nowrap text-[11px]">
                      {new Date(evt.ts).toLocaleTimeString("en-GB")}
                    </TableCell>
                    <TableCell className="font-bold text-foreground">{evt.type}</TableCell>
                    <TableCell>
                      <SeverityBadge severity={evt.severity} />
                    </TableCell>
                    <TableCell className="text-primary text-[11px]">{evt.source}</TableCell>
                    <TableCell className="text-foreground">{evt.message}</TableCell>
                  </TableRow>
                ))}
                {filteredEvents.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center py-6 text-xs text-muted-foreground"
                    >
                      No matching audit events found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
