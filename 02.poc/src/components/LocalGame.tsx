import { useState } from "react";
import { assertCardIntegrity, pass, playCards, resolveEffect, startGame } from "../game/engine";
import type { ActionResult, GameEvent, GameState } from "../game/types";
import { GameBoard } from "./GameBoard";
import { Handoff } from "./Overlays";
import type { SetupValues } from "./SetupScreen";

function newGame(settings: SetupValues): GameState {
  return startGame({
    playerCount: settings.playerCount,
    handSize: settings.handSize,
    jokerCount: settings.jokerCount,
    rules: settings.rules,
    playerNames: settings.names,
  });
}

/** 1台の端末を回して遊ぶローカル対戦。 */
export function LocalGame({ settings, onExit }: { settings: SetupValues; onExit: () => void }) {
  const [game, setGame] = useState<GameState>(() => newGame(settings));
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [revealedIndex, setRevealedIndex] = useState<number | null>(settings.handoff ? null : 0);
  const [freshIds, setFreshIds] = useState<string[]>([]);
  const [burst, setBurst] = useState<{ key: number; events: GameEvent[] } | null>(null);

  function rematch() {
    setGame(newGame(settings));
    setSelected([]);
    setMessage("");
    setFreshIds([]);
    setBurst(null);
    setRevealedIndex(settings.handoff ? null : 0);
  }

  function apply(action: (state: GameState) => ActionResult) {
    const result = action(game);
    if (!result.ok) {
      setMessage(result.error);
      return;
    }
    const next = result.state;
    const samePlayer = next.currentPlayerIndex === game.currentPlayerIndex;
    const before = new Set(game.players[game.currentPlayerIndex].hand.map((card) => card.id));
    setFreshIds(samePlayer ? next.players[next.currentPlayerIndex].hand.filter((card) => !before.has(card.id)).map((card) => card.id) : []);
    if (next.events.length > 0) setBurst({ key: Date.now(), events: next.events });
    if (!settings.handoff) setRevealedIndex(next.currentPlayerIndex);
    setGame(next);
    setSelected([]);
    setMessage("");
  }

  function exit() {
    if (game.phase !== "finished" && !window.confirm("ゲームを中断して設定に戻りますか？")) return;
    onExit();
  }

  const finished = game.phase === "finished";
  const concealed = !finished && revealedIndex !== game.currentPlayerIndex;

  return (
    <GameBoard
      game={game}
      viewerIndex={game.currentPlayerIndex}
      canAct={!concealed}
      concealed={concealed}
      selected={selected}
      freshIds={freshIds}
      message={message}
      burst={burst}
      onExit={exit}
      onToggle={(cardId) => {
        setMessage("");
        setSelected((current) => current.includes(cardId) ? current.filter((id) => id !== cardId) : [...current, cardId]);
      }}
      onClear={() => { setSelected([]); setMessage(""); }}
      onPlay={() => apply((state) => playCards(state, selected))}
      onPass={() => apply(pass)}
      onResolve={() => apply((state) => resolveEffect(state, selected))}
      alert={!assertCardIntegrity(game) && (
        <p className="integrity-error" role="alert">カードの状態に不整合があります。設定に戻ってやり直してください。</p>
      )}
      overlay={concealed && <Handoff game={game} onReveal={() => setRevealedIndex(game.currentPlayerIndex)} />}
      resultActions={
        <>
          <button type="button" className="btn btn-primary btn-xl" onClick={rematch} autoFocus>同じ設定で再戦</button>
          <button type="button" className="btn btn-secondary btn-xl" onClick={onExit}>設定に戻る</button>
        </>
      }
    />
  );
}
