"use client";

import type { ComponentGroup } from "@openuidev/react-lang";
import type { DefinedComponent } from "@openuidev/lang-core";
import { MetricStrip, Gauge, Donut, LineChart, MultiLine, BarRank, Timeline, EventStream, LogStream, NodeGraph, Sankey, Kanban, VisualTable, ArtworkWall, PlaybackSessions, Capacity, SecurityPosture, Heatmap, MarkdownReader, KnowledgeGraph, Backlinks, DetailPanel, Callout, EmptyState, FilterDropdown, Section, DashboardGrid } from "./definitions";
import { homelabGroupNotes } from "./group-notes";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const homelabComponents: DefinedComponent<any, any>[] = [
  MetricStrip, Gauge, Donut, LineChart, MultiLine, BarRank,
  Timeline, EventStream, LogStream, NodeGraph, Sankey, Kanban,
  VisualTable, ArtworkWall, PlaybackSessions, Capacity, SecurityPosture,
  Heatmap, MarkdownReader, KnowledgeGraph, Backlinks, DetailPanel, Callout, EmptyState,
  FilterDropdown, Section, DashboardGrid,
];

export const homelabGroup: ComponentGroup = {
  name: "Homelab Visuals",
  components: homelabComponents.map((c) => c.name),
  notes: homelabGroupNotes,
};

export { MetricStrip, Gauge, Donut, LineChart, MultiLine, BarRank, Timeline, EventStream, LogStream, NodeGraph, Sankey, Kanban, VisualTable, ArtworkWall, PlaybackSessions, Capacity, SecurityPosture, Heatmap, MarkdownReader, KnowledgeGraph, Backlinks, DetailPanel, Callout, EmptyState, FilterDropdown, Section, DashboardGrid };
export { VisualStateSchema, MetricSchema, ItemSchema, SeriesSchema, NodeSchema, EdgeSchema, EventSchema } from "./schemas";
