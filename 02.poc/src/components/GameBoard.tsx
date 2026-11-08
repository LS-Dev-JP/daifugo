import { useEffect, useState, type ReactNode } from "react";
import type { GameEvent, GameState } from "../game/types";
import { HandPanel } from "./HandPanel";
import { EventBurst } from "./Overlays";
import { ResultScreen } from "./ResultScreen";
import { Felt, LogPanel, Seats, StatusPills } from "./Table";

interface GameBoardProps {
  game: GameState;
  viewerIndex: number;
  canAct: boolean;
  /** 手札を隠すか（ローカル対戦の受け渡し中）。 */
  concealed?: boolean;
  connected?: boolean[];
  selected: string[];
  freshIds: string[];
  message: string;
  burst: { key: number; events: GameEvent[] } | null;
  topbarExtra?: ReactNode;
  resultActions: ReactNode;
  overlay?: ReactNode;
  alert?: ReactNode;
  onExit: () => void;
  onToggle: (cardId: string) => void;
  onClear: () => void;
  onPlay: () => void;
  onPass: () => void;
  onResolve: () => void;
}

export function GameBoard(props: GameBoardProps) {
  const { game, viewerIndex, canAct, concealed = false, burst } = props;
  const [visibleBurst, setVisibleBurst] = useState(burst);

  useEffect(() => {
    setVisibleBurst(burst);
    if (!burst) return;
    const timer = window.setTimeout(() => setVisibleBurst(null), 1900);
    return () => window.clearTimeout(timer);
  }, [burst]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <button type="button" className="brand" onClick={props.onExit} aria-label="ゲームを終了する">
          <span className="brand-mark" aria-hidden="true">♠</span>
          <span className="brand-name">Draw <em>大富豪</em></span>
        </button>
        {props.topbarExtra}
        <StatusPills game={game} />
        <button type="button" className="btn btn-ghost btn-sm topbar-exit" onClick={props.onExit}>終了</button>
      </header>

      <div className="game-layout">
        <div className="game-main">
          <Seats game={game} viewerIndex={concealed ? undefined : viewerIndex} connected={props.connected} />
          <Felt game={game} />
          {props.alert}
          {game.phase === "finished" ? (
            <ResultScreen game={game}>{props.resultActions}</ResultScreen>
          ) : concealed ? (
            <section className="hand-panel is-concealed" aria-hidden="true">
              <div className="concealed-hint">{game.players[game.currentPlayerIndex].name}の手札は非表示です</div>
            </section>
          ) : (
            <HandPanel
              game={game}
              viewerIndex={viewerIndex}
              canAct={canAct}
              selected={props.selected}
              freshIds={props.freshIds}
              message={props.message}
              onToggle={props.onToggle}
              onClear={props.onClear}
              onPlay={props.onPlay}
              onPass={props.onPass}
              onResolve={props.onResolve}
            />
          )}
        </div>
        <LogPanel log={game.log} />
      </div>

      {props.overlay}
      {visibleBurst && <EventBurst key={visibleBurst.key} events={visibleBurst.events} />}
    </main>
  );
}
