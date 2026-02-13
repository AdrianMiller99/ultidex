import { TYPE_COLORS, TYPE_PILL_CH } from "../constants/pokemon";
import { titleCase } from "../utils/format";

interface TypePillsProps {
  types: string[];
  size?: "default" | "sm" | "xs";
}

export function TypePills({ types, size = "default" }: TypePillsProps) {
  const sizeClass = size === "sm" ? " type-pills-sm" : size === "xs" ? " type-pills-xs" : "";
  const widthInset = size === "xs" ? "0.8rem" : size === "sm" ? "1rem" : "1.45rem";

  function getContrastTextColor(type: string): string {
    const hex = TYPE_COLORS[type] ?? "#777777";
    const normalized = hex.replace("#", "");
    const fullHex =
      normalized.length === 3
        ? normalized
            .split("")
            .map((char) => `${char}${char}`)
            .join("")
        : normalized;

    const r = parseInt(fullHex.slice(0, 2), 16);
    const g = parseInt(fullHex.slice(2, 4), 16);
    const b = parseInt(fullHex.slice(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

    return luminance > 0.6 ? "#111827" : "#ffffff";
  }

  return (
    <div className={`type-pills${sizeClass}`}>
      {types.map((type) => (
        <span
          key={type}
          className="type-pill"
          style={{
            backgroundColor: TYPE_COLORS[type] ?? "#777",
            color: getContrastTextColor(type),
            width: `calc(${TYPE_PILL_CH}ch + ${widthInset})`,
          }}
        >
          {titleCase(type)}
        </span>
      ))}
    </div>
  );
}
