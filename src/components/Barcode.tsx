import { code128Bits } from "@/lib/code128";
import { eanBits, normalizeEan } from "@/lib/ean13";

export function Barcode({ code, height = 40, className = "" }: { code: string; height?: number; className?: string }) {
  const ean = eanBits(code);
  const bits = ean ?? code128Bits(code);
  if (!bits) return null;
  const label = ean ? normalizeEan(code) : code.trim();
  const quiet = ean ? 9 : 10;
  const width = bits.length + quiet * 2;
  const bars: Array<{ x: number; w: number }> = [];
  for (let i = 0; i < bits.length; i++) {
    if (bits[i] !== "1") continue;
    const last = bars[bars.length - 1];
    if (last && last.x + last.w === i + quiet) last.w++;
    else bars.push({ x: i + quiet, w: 1 });
  }
  return (
    <svg
      viewBox={`0 0 ${width} ${height + 10}`}
      className={className}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      role="img"
      aria-label={label}
    >
      <rect width={width} height={height + 10} fill="#fff" />
      {bars.map((b) => (
        <rect key={b.x} x={b.x} y={0} width={b.w} height={height} fill="#000" />
      ))}
      <text x={width / 2} y={height + 8.5} textAnchor="middle" fontSize="9" fontFamily="monospace" letterSpacing={ean ? 1.5 : 0.5}>
        {label}
      </text>
    </svg>
  );
}
