import type { CSSProperties } from "react";
import { previewPlay, transferReceiver } from "../game/engine";
import type { GameState } from "../game/types";
import { PlayingCard } from "./PlayingCard";

interface HandPanelProps {
  game: GameState;
  /** 手札を表示するプレイヤー。 */
  viewerIndex: number;
  /** 操作できるか（オンラインでは自分の手番のときだけ）。 */
  canAct: boolean;
  /** オンライン対戦の思考時間の残り秒数。 */
  turnSecondsLeft?: number | null;
  selected: string[];
  freshIds: string[];
  message: string;
  onToggle: (cardId: string) => void;
  onClear: () => void;
  onPlay: () => void;
  onPass: () => void;
  onResolve: () => void;
}

/** 枚数が増えるほどカードを重ねて、1列に収める。 */
function overlapFor(count: number): number {
  if (count <= 8) return 0.08;
  if (count <= 10) return -0.22;
  if (count <= 13) return -0.42;
  return -0.55;
}

export function HandPanel({ game, viewerIndex, canAct, turnSecondsLeft, selected, freshIds, message, onToggle, onClear, onPlay, onPass, onResolve }: HandPanelProps) {
  const player = game.players[viewerIndex];
  const current = game.players[game.currentPlayerIndex];
  const cards = player.hand;
  const effect = canAct && game.phase === "effect" ? game.pendingEffect : null;
  const receiver = effect?.type === "transfer" ? transferReceiver(game) : null;
  const preview = canAct && !effect && selected.length > 0 ? previewPlay(game, selected) : null;
  const mid = (cards.length - 1) / 2;
  const fan = cards.length <= 12;

  let status: { tone: "idle" | "ok" | "error" | "effect"; text: string };
  if (message) {
    status = { tone: "error", text: message };
  } else if (player.finishRank) {
    status = { tone: "idle", text: `${player.finishRank}位で上がりました。ほかのプレイヤーの対戦を見守りましょう。` };
  } else if (!canAct) {
    status = {
      tone: "idle",
      text: game.phase === "effect"
        ? `${current.name}が${game.pendingEffect?.type === "transfer" ? "渡す" : "捨てる"}カードを選んでいます…`
        : `${current.name}の番です。`,
    };
  } else if (effect) {
    status = {
      tone: "effect",
      text: effect.type === "transfer"
        ? `${receiver?.name}に渡すカードを選択 ${selected.length}/${effect.count}`
        : `捨てるカードを選択 ${selected.length}/${effect.count}`,
    };
  } else if (preview) {
    status = preview.ok ? { tone: "ok", text: `${preview.label} — 出せます` } : { tone: "error", text: preview.error };
  } else if (game.hasDrawn) {
    status = { tone: "idle", text: "1枚引きました。出せるカードがあれば出せます。" };
  } else {
    status = { tone: "idle", text: game.trick ? "場より強い役を選ぶか、パスして1枚引きます。" : "好きな役を選んで場を始めましょう。" };
  }

  return (
    <section className={`hand-panel${effect ? " is-effect" : ""}${canAct ? " is-active" : " is-waiting"}`} aria-label={`${player.name}の手札`}>
      <header className="hand-header">
        <div>
          <p className="eyebrow">{effect ? (effect.type === "transfer" ? "7渡し" : "10捨て") : "YOUR HAND"}</p>
          <h2>
            {effect
              ? effect.type === "transfer" ? `${effect.count}枚を${receiver?.name}へ渡す` : `${effect.count}枚を捨てる`
              : `${player.name}の手札`}
          </h2>
        </div>
        <div className="hand-header-side">
          {canAct && turnSecondsLeft != null && (
            <span className={`turn-timer${turnSecondsLeft <= 3 ? " is-urgent" : ""}`} role="timer" aria-label={`残り${turnSecondsLeft}秒`}>
              残り<strong>{turnSecondsLeft}</strong>秒
            </span>
          )}
          <span className="hand-count"><strong>{cards.length}</strong>枚</span>
        </div>
      </header>

      <div className="hand-scroller">
        <div className={`hand${fan ? " is-fan" : ""}`} style={{ "--overlap": overlapFor(cards.length) } as CSSProperties}>
          {cards.map((card, index) => {
            const offset = index - mid;
            return (
              <PlayingCard
                key={card.id}
                card={card}
                size="lg"
                selected={selected.includes(card.id)}
                fresh={freshIds.includes(card.id)}
                onClick={() => onToggle(card.id)}
                style={{
                  "--rot": fan ? `${offset * 2.2}deg` : "0deg",
                  "--arc": fan ? `${Math.abs(offset) ** 1.6 * 1.6}px` : "0px",
                  "--deal": index,
                } as CSSProperties}
              />
            );
          })}
        </div>
      </div>

      <div className="actionbar">
        <p className={`selection-status tone-${status.tone}`} role={status.tone === "error" ? "alert" : "status"}>
          <span className="status-dot" aria-hidden="true" />
          {status.text}
        </p>
        <div className="actions">
          <button type="button" className="btn btn-ghost" onClick={onClear} disabled={selected.length === 0}>選択解除</button>
          {effect ? (
            <button type="button" className="btn btn-primary" onClick={onResolve} disabled={selected.length !== effect.count}>
              {effect.type === "transfer" ? "渡す" : "捨てる"}
            </button>
          ) : (
            <>
              <button type="button" className="btn btn-secondary" onClick={onPass} disabled={!canAct}>
                {canAct && game.hasDrawn ? "パスして終了" : "パス（1枚引く）"}
              </button>
              <button type="button" className="btn btn-primary" onClick={onPlay} disabled={!preview?.ok}>
                カードを出す
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
