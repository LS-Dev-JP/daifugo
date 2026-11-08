import type { CSSProperties } from "react";
import type { GameEvent, GameEventKind, GameState } from "../game/types";
import { avatarText, seatHue } from "./theme";

export function Handoff({ game, onReveal }: { game: GameState; onReveal: () => void }) {
  const player = game.players[game.currentPlayerIndex];
  const recent = game.log.slice(-3).reverse();
  return (
    <div className="handoff" role="dialog" aria-modal="true" aria-labelledby="handoff-title">
      <div className="handoff-card">
        <p className="eyebrow">TURN {game.turn}</p>
        <span className="avatar avatar-xl" style={{ "--hue": seatHue(game.currentPlayerIndex) } as CSSProperties}>
          {avatarText(player.name, game.currentPlayerIndex)}
        </span>
        <h2 id="handoff-title">{player.name}の番です</h2>
        <p className="handoff-lead">端末を{player.name}に渡してください。<br />ほかの人には画面が見えないようにしましょう。</p>
        {recent.length > 0 && (
          <ul className="handoff-recent" aria-label="直前の出来事">
            {recent.map((entry, index) => <li key={`${index}-${entry}`}>{entry}</li>)}
          </ul>
        )}
        <button type="button" className="btn btn-primary btn-xl" onClick={onReveal} autoFocus>
          手札を表示する
        </button>
      </div>
    </div>
  );
}

const priority: GameEventKind[] = [
  "revolution", "revolution-end", "finish", "eight-cut", "joker-return", "eleven-back", "eleven-back-end", "skip", "bind", "flow",
];
const subtitles: Partial<Record<GameEventKind, string>> = {
  revolution: "カードの強さが逆転しました",
  "revolution-end": "強さが元に戻りました",
  "eight-cut": "場が流れ、同じプレイヤーから再開します",
  "eleven-back": "場が流れるまで強さが逆転します",
  "eleven-back-end": "11バックが解除されました",
  "joker-return": "スペードの3がジョーカーを返しました",
  bind: "場が流れるまでこのスートのみ",
  flow: "次の場を始めましょう",
};

export function EventBurst({ events }: { events: GameEvent[] }) {
  const sorted = [...events].sort((left, right) => priority.indexOf(left.kind) - priority.indexOf(right.kind));
  const main = sorted[0];
  if (!main) return null;
  const tone = main.kind.startsWith("revolution") || main.kind.startsWith("eleven") ? "hot" : main.kind === "finish" ? "gold" : "cool";
  return (
    <div className={`burst tone-${tone}`} role="status" aria-live="assertive">
      <div className="burst-inner">
        <strong>{main.text}</strong>
        {subtitles[main.kind] && <span>{subtitles[main.kind]}</span>}
        {sorted.length > 1 && (
          <ul>{sorted.slice(1).map((event, index) => <li key={`${event.kind}-${index}`}>{event.text}</li>)}</ul>
        )}
      </div>
    </div>
  );
}
