import type { CSSProperties } from "react";
import { comboLabel, isReversed, suitSymbols } from "../game/engine";
import type { GameState } from "../game/types";
import { CardBack, PlayingCard } from "./PlayingCard";
import { avatarText, seatHue } from "./theme";

export function Seats({ game, viewerIndex, connected }: { game: GameState; viewerIndex?: number; connected?: boolean[] }) {
  const finished = game.phase === "finished";
  return (
    <section className="seats" aria-label="プレイヤー">
      {game.players.map((player, index) => {
        const isCurrent = !finished && index === game.currentPlayerIndex;
        const passed = game.passedPlayerIds.includes(player.id);
        const backs = Math.min(player.hand.length, 6);
        const offline = connected?.[index] === false;
        return (
          <article
            key={player.id}
            className={`seat${isCurrent ? " is-current" : ""}${player.finishRank ? " is-finished" : ""}${index === viewerIndex ? " is-me" : ""}${offline ? " is-offline" : ""}`}
            aria-current={isCurrent ? "true" : undefined}
          >
            <span className="avatar" style={{ "--hue": seatHue(index) } as CSSProperties}>
              {avatarText(player.name, index)}
            </span>
            <div className="seat-body">
              <span className="seat-name-row">
                <span className="seat-name">{player.name}</span>
                {index === viewerIndex && <span className="seat-badge is-me">YOU</span>}
                {offline && <span className="seat-badge is-offline">切断中</span>}
                {!player.finishRank && isCurrent && <span className="seat-badge is-turn">手番</span>}
                {!player.finishRank && !isCurrent && passed && <span className="seat-badge is-pass">PASS</span>}
              </span>
              <span className="seat-meta">
                {player.finishRank ? `${player.finishRank}位で上がり` : `${player.hand.length}枚`}
              </span>
            </div>
            {player.finishRank ? (
              <span className={`seat-badge rank-${Math.min(player.finishRank, 4)}`}>{player.finishRank}</span>
            ) : (
              <div className="seat-backs" aria-hidden="true">
                {Array.from({ length: backs }, (_, cardIndex) => (
                  <CardBack key={cardIndex} size="xs" style={{ "--i": cardIndex } as CSSProperties} />
                ))}
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}

export function StatusPills({ game }: { game: GameState }) {
  const reversed = isReversed(game);
  return (
    <ul className="pills" aria-label="場の状態">
      <li className="pill">
        <span className="pill-label">山札</span>
        <strong>{game.deck.length}</strong>
      </li>
      <li className={`pill${game.revolution ? " is-hot" : ""}`}>
        <span className="pill-label">革命</span>
        <strong>{game.revolution ? "ON" : "—"}</strong>
      </li>
      <li className={`pill${game.elevenBack ? " is-hot" : ""}`}>
        <span className="pill-label">11バック</span>
        <strong>{game.elevenBack ? "ON" : "—"}</strong>
      </li>
      <li className={`pill${game.binding ? " is-gold" : ""}`}>
        <span className="pill-label">縛り</span>
        <strong>{game.binding ? game.binding.map((suit) => suitSymbols[suit]).join("") : "—"}</strong>
      </li>
      <li className={`pill pill-direction${reversed ? " is-hot" : ""}`}>
        <span className="pill-label">強さ</span>
        <strong>{reversed ? "2 → 3" : "3 → 2"}</strong>
      </li>
    </ul>
  );
}

export function Felt({ game }: { game: GameState }) {
  const reversed = isReversed(game);
  const trick = game.trick;
  const owner = trick ? game.players.find((player) => player.id === trick.playerId) : undefined;
  const leader = game.players[game.currentPlayerIndex];
  const fieldCards = trick?.cards ?? [];
  const deckLayers = Math.min(4, Math.ceil(game.deck.length / 8));

  return (
    <section className={`felt${reversed ? " is-reversed" : ""}`} aria-label="場">
      <div className="felt-rim" aria-hidden="true" />
      {reversed && <span className="felt-watermark" aria-hidden="true">REVERSE</span>}

      <div className="felt-deck" title="使用済みカードはターン終了時に山札へ戻ります">
        <div className="deck-stack" aria-hidden="true">
          {Array.from({ length: Math.max(deckLayers, 1) }, (_, index) => (
            <CardBack key={index} size="sm" className={game.deck.length === 0 ? "is-empty" : ""} style={{ "--i": index } as CSSProperties} />
          ))}
        </div>
        <span className="deck-count"><strong>{game.deck.length}</strong>山札</span>
      </div>

      <div className="felt-center" aria-live="polite">
        {trick ? (
          <>
            <div className="field-cards" key={fieldCards.map((card) => card.id).join("|")}>
              {fieldCards.map((card, index) => (
                <PlayingCard
                  key={card.id}
                  card={card}
                  size="md"
                  showTag={false}
                  style={{ "--i": index, "--n": fieldCards.length } as CSSProperties}
                />
              ))}
            </div>
            <div className="field-caption">
              <strong>{comboLabel(trick)}</strong>
              <span>{owner?.name}</span>
            </div>
          </>
        ) : (
          <div className="field-empty">
            <span className="field-empty-slot" aria-hidden="true" />
            <strong>場は空です</strong>
            <span>{game.phase === "finished" ? "ゲーム終了" : `${leader.name}が好きな役から出せます`}</span>
          </div>
        )}
      </div>

      {game.binding && (
        <span className="felt-binding">
          縛り <strong>{game.binding.map((suit) => suitSymbols[suit]).join(" ")}</strong>
        </span>
      )}
    </section>
  );
}

export function LogPanel({ log }: { log: string[] }) {
  return (
    <aside className="log-panel" aria-label="ゲーム履歴">
      <h3>ゲーム履歴</h3>
      <ol>
        {[...log].reverse().map((entry, index) => (
          <li key={`${log.length - index}-${entry}`} className={index === 0 ? "is-latest" : ""}>{entry}</li>
        ))}
      </ol>
    </aside>
  );
}
