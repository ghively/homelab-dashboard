"use client";

import React from "react";

export function Surface({
  title,
  subtitle,
  children,
  state = "healthy",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  state?: string;
}) {
  return (
    <section className={`cnv cnv-surface state-${state}`}>
      <header className="cnv-head">
        <div>
          <h3>{title}</h3>
          {subtitle && <small>{subtitle}</small>}
        </div>
        <span className="cnv-badge">{state}</span>
      </header>
      {children}
    </section>
  );
}

export function StateView({ state }: { state: string }) {
  if (state === "healthy" || state === "warning" || state === "critical") return null;
  return (
    <div className="cnv-state">
      <strong>
        {state === "loading"
          ? "Loading visualization"
          : state === "empty"
            ? "No matching data"
            : state === "denied"
              ? "Permission required"
              : state === "stale"
                ? "Data is stale"
                : "Source unavailable"}
      </strong>
    </div>
  );
}

export function NoData({ label = "No data" }: { label?: string }) {
  return (
    <div className="cnv-nodata">
      <span>{label}</span>
    </div>
  );
}

export function MetricsView({ metrics }: { metrics: import("./schemas").Metric[] }) {
  return (
    <div className="cnv-metrics">
      {metrics.slice(0, 6).map((m) => (
        <article key={m.label}>
          <small>{m.label}</small>
          <strong>
            {m.value}
            {m.unit}
          </strong>
          {m.trend != null && (
            <span>
              {m.trend > 0 ? "↗" : "↘"} {Math.abs(m.trend)}%
            </span>
          )}
        </article>
      ))}
    </div>
  );
}
