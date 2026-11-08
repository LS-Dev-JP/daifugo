import type { CSSProperties, ReactNode } from "react";
import type { GameState } from "../game/types";
import { avatarText, seatHue } from "./theme";

const titles = ["大富豪", "富豪", "平民", "貧民", "大貧民"];

/** 人数に応じた称号。最下位は常に大貧民とする。 */
function titleFor(rank: number, total: number): string {
  if (rank === total && total > 1) return "大貧民";
  if (total === 2) return "大富豪";
  if (total === 3) return ["大富豪", "平民"][rank - 1];
  if (total === 4) return ["大富豪", "富豪", "貧民"][rank - 1];
  return titles[rank - 1];
}

export function ResultScreen({ game, children }: { game: GameState; children: ReactNode }) {
  const ranked = game.players
    .map((player, index) => ({ player, index }))
    .sort((left, right) => (left.player.finishRank ?? 99) - (right.player.finishRank ?? 99));
  const total = ranked.length;

  return (
    <section className="result" aria-labelledby="result-title">
      <p className="eyebrow">GAME FINISHED</p>
      <h2 id="result-title" className="result-title">{ranked[0]?.player.name}の勝利</h2>
      <ol className="podium">
        {ranked.map(({ player, index }) => {
          const rank = player.finishRank ?? total;
          return (
            <li key={player.id} className={`podium-row rank-${Math.min(rank, 4)}`} style={{ "--delay": `${rank * 90}ms` } as CSSProperties}>
              <span className="podium-rank">{rank}</span>
              <span className="avatar" style={{ "--hue": seatHue(index) } as CSSProperties}>{avatarText(player.name, index)}</span>
              <span className="podium-name">{player.name}</span>
              <span className="podium-title">{titleFor(rank, total)}</span>
            </li>
          );
        })}
      </ol>
      <div className="result-actions">{children}</div>
    </section>
  );
}
