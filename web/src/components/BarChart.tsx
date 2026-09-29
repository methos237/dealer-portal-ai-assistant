import type { Bar } from "@/lib/reports";

/** Inline SVG bar chart; server-rendered, no chart library. Heights are 0..100 (see toBars). */
export function BarChart({
  bars,
  format = (v) => String(v),
  detail,
}: {
  bars: Bar[];
  format?: (v: number) => string;
  /** Optional second line under each label, same order as bars. */
  detail?: string[];
}) {
  const w = 40;
  const gap = 12;
  const width = bars.length * (w + gap) - gap;
  return (
    <figure>
      <svg
        role="img"
        aria-label="Bar chart"
        viewBox={`0 0 ${width} 120`}
        className="h-44 w-full"
        preserveAspectRatio="none"
      >
        {[25, 50, 75].map((y) => (
          <line
            key={y}
            x1={0}
            x2={width}
            y1={110 - y}
            y2={110 - y}
            className="stroke-border"
            strokeDasharray="2 4"
          />
        ))}
        <line x1={0} x2={width} y1={110} y2={110} className="stroke-border" />
        {bars.map((b, i) => (
          <rect
            key={b.label}
            x={i * (w + gap)}
            y={110 - b.height}
            width={w}
            height={b.height}
            rx={3}
            className={b.height === 0 ? "fill-transparent" : "fill-primary"}
          >
            <title>{`${b.label}: ${format(b.value)}`}</title>
          </rect>
        ))}
      </svg>
      <figcaption
        className="mt-2 grid text-center text-xs text-fg-muted"
        style={{ gridTemplateColumns: `repeat(${bars.length}, 1fr)` }}
      >
        {bars.map((b, i) => (
          <span key={b.label}>
            <span className="block font-medium text-fg">{b.label}</span>
            <span className="tabular-nums">{format(b.value)}</span>
            {detail?.[i] && (
              <span className="block tabular-nums text-fg-subtle">
                {detail[i]}
              </span>
            )}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
