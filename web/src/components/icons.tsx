/** Authored icon set: one 1.75 stroke, 20px grid. Import by name; never mix with emoji. */
type Props = React.SVGProps<SVGSVGElement>;

const base = {
  width: 20,
  height: 20,
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export const ArrowRight = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M3.5 10h13M11 4.5l5.5 5.5-5.5 5.5" />
  </svg>
);

export const Sun = (p: Props) => (
  <svg {...base} {...p}>
    <circle cx="10" cy="10" r="3.5" />
    <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M4.3 15.7l1.4-1.4M14.3 5.7l1.4-1.4" />
  </svg>
);

export const Moon = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M16.5 12.2A7 7 0 0 1 7.8 3.5a7 7 0 1 0 8.7 8.7Z" />
  </svg>
);

export const Menu = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M3 6h14M3 10h14M3 14h14" />
  </svg>
);

export const Close = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M5 5l10 10M15 5L5 15" />
  </svg>
);

export const Check = (p: Props) => (
  <svg {...base} {...p}>
    <path d="M4 10.5l4 4 8-9" />
  </svg>
);

export const Search = (p: Props) => (
  <svg {...base} {...p}>
    <circle cx="9" cy="9" r="5.5" />
    <path d="M13.2 13.2 17 17" />
  </svg>
);

/** Wordmark glyph: a coach silhouette on a road line. */
export const Mark = (p: Props) => (
  <svg
    width={28}
    height={28}
    viewBox="0 0 28 28"
    fill="none"
    aria-hidden
    {...p}
  >
    <rect
      x="3"
      y="7"
      width="22"
      height="12"
      rx="3"
      stroke="currentColor"
      strokeWidth="2"
    />
    <path d="M3 13h22" stroke="currentColor" strokeWidth="2" />
    <path d="M17 7v6" stroke="currentColor" strokeWidth="2" />
    <circle cx="9" cy="21" r="2.25" fill="currentColor" />
    <circle cx="19" cy="21" r="2.25" fill="currentColor" />
  </svg>
);
