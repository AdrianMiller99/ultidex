import type { BaseStat } from "../types/pokemon";
import { titleCase } from "../utils/format";

const MAX_STAT_VALUE = 255;

const STAT_COLORS: Record<string, string> = {
  hp: "#FF5959",
  attack: "#F5AC78",
  defense: "#FAE078",
  "special-attack": "#9DB7F5",
  "special-defense": "#A7DB8D",
  speed: "#FA92B2",
};

function normalizeStatLabel(name: string): string {
  if (name === "hp") {
    return "HP";
  }
  if (name === "special-attack") {
    return "Sp. Atk";
  }
  if (name === "special-defense") {
    return "Sp. Def";
  }
  return titleCase(name);
}

export function StatBars({ stats }: { stats: BaseStat[] }) {
  return (
    <div className="stats-list">
      {stats.map((stat) => {
        const width = Math.min((stat.value / MAX_STAT_VALUE) * 100, 100);

        return (
          <div className="stat-row" key={stat.name}>
            <span className="stat-label">{normalizeStatLabel(stat.name)}</span>
            <div className="stat-track">
              <div
                className="stat-fill"
                style={{
                  width: `${width}%`,
                  backgroundColor: STAT_COLORS[stat.name] ?? "#7b8ca7",
                }}
              />
            </div>
            <span className="stat-value">{stat.value}</span>
          </div>
        );
      })}
    </div>
  );
}
