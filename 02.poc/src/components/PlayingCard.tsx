import type { CSSProperties } from "react";
import { rankLabel, suitNames, suitSymbols } from "../game/engine";
import type { Card } from "../game/types";

const effectTags: Record<number, string> = { 5: "SKIP", 7: "GIVE", 8: "CUT", 10: "DROP", 11: "BACK" };

export function cardAriaLabel(card: Card): string {
  if (card.isJoker || !card.suit) return "ジョーカー";
  return `${suitNames[card.suit]}の${rankLabel(card.rank)}`;
}

type Size = "xs" | "sm" | "md" | "lg";

interface PlayingCardProps {
  card: Card;
  size?: Size;
  selected?: boolean;
  fresh?: boolean;
  disabled?: boolean;
  showTag?: boolean;
  onClick?: () => void;
  style?: CSSProperties;
  className?: string;
}

export function PlayingCard({
  card,
  size = "md",
  selected = false,
  fresh = false,
  disabled = false,
  showTag = true,
  onClick,
  style,
  className = "",
}: PlayingCardProps) {
  const red = card.suit === "H" || card.suit === "D";
  const classes = [
    "pc",
    `pc-${size}`,
    card.isJoker ? "pc-joker" : red ? "pc-red" : "pc-black",
    selected ? "is-selected" : "",
    fresh ? "is-fresh" : "",
    className,
  ].filter(Boolean).join(" ");
  const rank = rankLabel(card.rank);
  const symbol = card.suit ? suitSymbols[card.suit] : "★";
  const isFace = card.rank !== null && card.rank >= 11 && card.rank <= 13;
  const tag = showTag && card.rank !== null ? effectTags[card.rank] : undefined;

  const content = card.isJoker ? (
    <>
      <span className="pc-corner pc-tl"><b>★</b></span>
      <span className="pc-center pc-joker-mark">
        <span className="pc-joker-star">★</span>
        <span className="pc-joker-word">JOKER</span>
      </span>
      <span className="pc-corner pc-br"><b>★</b></span>
    </>
  ) : (
    <>
      <span className="pc-corner pc-tl"><b>{rank}</b><i>{symbol}</i></span>
      {isFace ? (
        <span className="pc-center pc-face">
          <span className="pc-face-letter">{rank}</span>
          <span className="pc-face-suit">{symbol}</span>
        </span>
      ) : (
        <span className="pc-center">{symbol}</span>
      )}
      <span className="pc-corner pc-br"><b>{rank}</b><i>{symbol}</i></span>
      {tag && <span className="pc-tag">{tag}</span>}
      {fresh && <span className="pc-new">NEW</span>}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={classes}
        style={style}
        onClick={onClick}
        disabled={disabled}
        aria-pressed={selected}
        aria-label={cardAriaLabel(card)}
      >
        {content}
      </button>
    );
  }
  return <div className={classes} style={style} role="img" aria-label={cardAriaLabel(card)}>{content}</div>;
}

export function CardBack({ size = "sm", style, className = "" }: { size?: Size; style?: CSSProperties; className?: string }) {
  return (
    <div className={`pc pc-${size} pc-back ${className}`} style={style} aria-hidden="true">
      <span className="pc-back-inner" />
    </div>
  );
}
