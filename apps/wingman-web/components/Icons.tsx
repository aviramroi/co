import type { SVGProps } from "react";

const base = (p: SVGProps<SVGSVGElement>) => ({
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  ...p,
});

export const IconChat = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7A2.5 2.5 0 0 1 17.5 16H9l-4 4v-4H6.5" />
    <path d="M8.5 9.5h7M8.5 12.5h4" />
  </svg>
);

export const IconClock = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.2" />
    <path d="M12 7.6V12l3 1.8" />
  </svg>
);

export const IconShield = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 3.5l6.5 2.4v5.2c0 4-2.8 7-6.5 8.4-3.7-1.4-6.5-4.4-6.5-8.4V5.9L12 3.5Z" />
    <path d="M9.3 12l1.9 1.9 3.6-3.8" />
  </svg>
);

export const IconTag = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12.6 3.5H19a1.5 1.5 0 0 1 1.5 1.5v6.4a2 2 0 0 1-.6 1.4l-6.7 6.7a2 2 0 0 1-2.8 0l-4.6-4.6a2 2 0 0 1 0-2.8l6.7-6.7a2 2 0 0 1 1.1-.6Z" />
    <circle cx="16" cy="8" r="1.4" fill="currentColor" stroke="none" />
  </svg>
);

export const IconSearch = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="6.4" />
    <path d="M20 20l-4.3-4.3" />
  </svg>
);

export const IconUsers = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="9" cy="8.5" r="3.1" />
    <path d="M3.8 19c.5-2.9 2.7-4.6 5.2-4.6s4.7 1.7 5.2 4.6" />
    <path d="M15.5 6.2a3 3 0 0 1 0 5.6M17 14.6c2 .5 3.4 2 3.8 4.4" />
  </svg>
);

export const IconWave = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 12h1.6M8 8.5v7M11.4 5.5v13M14.8 8.5v7M18.2 10.5v3M21 12h-.4" />
  </svg>
);

export const IconSliders = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M5 5v6M5 15v4M12 5v3M12 12v7M19 5v10M19 19v-2" />
    <circle cx="5" cy="13" r="1.8" fill="currentColor" stroke="none" />
    <circle cx="12" cy="10" r="1.8" fill="currentColor" stroke="none" />
    <circle cx="19" cy="17" r="1.8" fill="currentColor" stroke="none" />
  </svg>
);

export const IconSpark = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 3.5c.5 3.9 2.6 6 6.5 6.5-3.9.5-6 2.6-6.5 6.5-.5-3.9-2.6-6-6.5-6.5 3.9-.5 6-2.6 6.5-6.5Z" fill="currentColor" stroke="none" />
    <path d="M18.5 15.5c.2 1.5 1 2.3 2.5 2.5-1.5.2-2.3 1-2.5 2.5-.2-1.5-1-2.3-2.5-2.5 1.5-.2 2.3-1 2.5-2.5Z" fill="currentColor" stroke="none" />
  </svg>
);

export const IconHeart = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 19.5C6.5 16 4.5 12.6 4.5 9.9A3.9 3.9 0 0 1 12 8.1a3.9 3.9 0 0 1 7.5 1.8c0 2.7-2 6.1-7.5 9.6Z" />
  </svg>
);

export const IconCart = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M3.5 4.5h2l1.8 9.2a1.6 1.6 0 0 0 1.6 1.3h7a1.6 1.6 0 0 0 1.6-1.2L20 7.5H6.2" />
    <circle cx="9.5" cy="19" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="17" cy="19" r="1.4" fill="currentColor" stroke="none" />
  </svg>
);

export const IconCheck = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base({ strokeWidth: 3, ...p })}>
    <path d="M5 12.5l4.5 4.5L19 7" />
  </svg>
);

export const IconArrow = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M5 12h13M13 6l6 6-6 6" />
  </svg>
);

/** Brand logomark — a rounded wing/spark in a filled tile. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <span className="lp-logo-mark" style={{ width: size, height: size }}>
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="none">
        <path
          d="M4 15.5c4.5.2 7.8-1.2 10-4.2 1.1-1.5 1.8-3.3 2-5.3.2 2.4 1 4.4 2.4 5.9M4 15.5c3.4.2 6-.6 7.8-2.4M4 15.5c2.4 1 4.6 1 6.6-.2"
          stroke="white"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
