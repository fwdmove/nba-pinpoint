// Shared artwork for the app icon and social thumbnail (rendered by next/og).

export function IconMark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1d2840" />
          <stop offset="1" stopColor="#0b0f1a" />
        </linearGradient>
        <radialGradient id="ball" cx="0.38" cy="0.34" r="0.75">
          <stop offset="0" stopColor="#ffb067" />
          <stop offset="0.6" stopColor="#ff7a1a" />
          <stop offset="1" stopColor="#c94f00" />
        </radialGradient>
      </defs>
      <rect width="512" height="512" rx="112" fill="url(#bg)" />
      {/* crosshair ring */}
      <circle cx="256" cy="256" r="196" fill="none" stroke="#ffd166" strokeWidth="10" strokeOpacity="0.35" />
      <path d="M256 36v70M256 406v70M36 256h70M406 256h70" stroke="#ffd166" strokeWidth="14" strokeLinecap="round" />
      {/* basketball */}
      <circle cx="256" cy="256" r="142" fill="url(#ball)" />
      <g fill="none" stroke="#2a1405" strokeWidth="11" strokeLinecap="round">
        <path d="M114 256h284" />
        <path d="M256 114v284" />
        <path d="M157 156c42 46 42 154 0 200" />
        <path d="M355 156c-42 46-42 154 0 200" />
      </g>
      {/* pin dot */}
      <circle cx="256" cy="256" r="38" fill="#0b0f1a" stroke="#ffffff" strokeWidth="10" />
      <circle cx="256" cy="256" r="13" fill="#ffffff" />
    </svg>
  );
}
