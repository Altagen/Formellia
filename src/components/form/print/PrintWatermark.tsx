interface PrintWatermarkProps {
  text: string;
  opacity?: number;
  angle?: number;
  fontSize?: number;
  /** Text color (hex or CSS color). Default: #000000 */
  color?: string;
}

export function PrintWatermark({ text, opacity = 0.12, angle = -45, fontSize = 80, color = "#000000" }: PrintWatermarkProps) {
  return (
    <div
      aria-hidden="true"
      style={{
        // position: fixed is intentional — in @media print it repeats on every page (CSS spec)
        // In screen preview the overlay is itself fixed, so the watermark centers on it correctly
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <span
        style={{
          fontSize: `${fontSize}px`,
          fontWeight: 700,
          color,
          opacity,
          transform: `rotate(${angle}deg)`,
          whiteSpace: "nowrap",
          letterSpacing: "0.1em",
          userSelect: "none",
        }}
      >
        {text}
      </span>
    </div>
  );
}
