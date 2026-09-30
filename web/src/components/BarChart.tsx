/** Inline SVG bar chart; server-rendered, no chart library. */
export function BarChart({
  bars,
  detail,
}: {
  bars: { label: string; value: number }[];
  /** Optional second line under each label, same order as bars. */
  detail?: string[];
}) {
  const w = 40;
  const gap = 12;
  const width = bars.length * (w + gap) - gap;
  const max = Math.max(0, ...bars.map((b) => b.value));
  const height = (v: number) => (max === 0 ? 0 : Math.round((v / max) * 100));
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
            y={110 - height(b.value)}
            width={w}
            height={height(b.value)}
            rx={3}
            className={b.value === 0 ? "fill-transparent" : "fill-primary"}
          >
            <title>{`${b.label}: ${b.value}`}</title>
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
            <span className="tabular-nums">{b.value}</span>
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
