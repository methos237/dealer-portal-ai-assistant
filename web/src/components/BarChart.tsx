import type { Bar } from "@/lib/reports";

/** Inline SVG bar chart; server-rendered, no chart library. Heights are 0..100 (see toBars). */
export function BarChart({
  bars,
  format = (v) => String(v),
}: {
  bars: Bar[];
  format?: (v: number) => string;
}) {
  const w = 40;
  const gap = 12;
  const width = bars.length * (w + gap);
  return (
    <figure>
      <svg
        role="img"
        aria-label="Bar chart"
        viewBox={`0 0 ${width} 120`}
        className="h-40 w-full max-w-3xl"
        preserveAspectRatio="none"
      >
        {bars.map((b, i) => (
          <rect
            key={b.label}
            x={i * (w + gap)}
            y={110 - b.height}
            width={w}
            height={b.height}
            className="fill-blue-700"
          >
            <title>{`${b.label}: ${format(b.value)}`}</title>
          </rect>
        ))}
      </svg>
      <figcaption
        className="mt-1 grid text-center text-xs text-slate-500"
        style={{ gridTemplateColumns: `repeat(${bars.length}, 1fr)` }}
      >
        {bars.map((b) => (
          <span key={b.label}>
            <span className="block text-slate-700">{b.label}</span>
            {format(b.value)}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
