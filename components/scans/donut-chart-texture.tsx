export function donutTexturePatternId(prefix: string) {
  return `${prefix}-water-ripple`;
}

export function donutClipPathId(prefix: string) {
  return `${prefix}-clip`;
}

/** Clip ring + texture to the outer circle (avoids square filter/pattern bleed). */
export function DonutCircleClip({ id, size = 160 }: { id: string; size?: number }) {
  const r = size / 2;
  return (
    <clipPath id={id}>
      <circle cx={r} cy={r} r={r} />
    </clipPath>
  );
}

export function DonutWaterPattern({ id }: { id: string }) {
  return (
    <pattern
      id={id}
      width="32"
      height="32"
      patternUnits="userSpaceOnUse"
      patternTransform="rotate(-8)"
    >
      <path
        d="M-6 9 C2 5, 10 13, 18 9 S 34 5, 38 9"
        stroke="rgba(255,255,255,0.34)"
        strokeWidth="1.15"
        fill="none"
      />
      <path
        d="M-6 17 C3 21, 11 13, 19 17 S 35 21, 38 17"
        stroke="rgba(255,255,255,0.22)"
        strokeWidth="1"
        fill="none"
      />
      <path
        d="M-6 25 C4 21, 12 29, 22 25 S 36 21, 38 25"
        stroke="rgba(255,255,255,0.15)"
        strokeWidth="0.9"
        fill="none"
      />
      <circle cx="8" cy="6" r="1.1" fill="rgba(255,255,255,0.1)" />
      <circle cx="24" cy="22" r="0.85" fill="rgba(255,255,255,0.08)" />
    </pattern>
  );
}

export function DonutTexturedSegment({
  path,
  fill,
  patternId,
}: {
  path: string;
  fill: string;
  patternId: string;
}) {
  return (
    <>
      <path d={path} fill={fill} />
      <path
        d={path}
        fill={`url(#${patternId})`}
        className="donut-texture-layer"
        pointerEvents="none"
      />
    </>
  );
}
