import type {
  ActionResult,
  Card,
  GameEvent,
  GameOptions,
  GameState,
  PendingEffect,
  Player,
  RuleSettings,
  Suit,
  Trick,
} from "./types";
import { defaultRules } from "./rules";

type Classified = Omit<Trick, "playerId" | "cards">;

const suits: Suit[] = ["S", "H", "D", "C"];
export const suitNames: Record<Suit, string> = {
  S: "スペード",
  H: "ハート",
  D: "ダイヤ",
  C: "クラブ",
};
export const suitSymbols: Record<Suit, string> = {
  S: "♠",
  H: "♥",
  D: "♦",
  C: "♣",
};

function createDeck(jokerCount: number): Card[] {
  const cards: Card[] = [];
  for (const suit of suits) {
    for (let rank = 3; rank <= 15; rank += 1) {
      cards.push({ id: `${suit}-${rank}`, suit, rank, isJoker: false });
    }
  }
  for (let index = 0; index < jokerCount; index += 1) {
    cards.push({ id: `JOKER-${index + 1}`, suit: null, rank: null, isJoker: true });
  }
  return cards;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

export function startGame(
  options: GameOptions,
  random: () => number = Math.random,
): GameState {
  if (!Number.isInteger(options.playerCount) || options.playerCount < 2 || options.playerCount > 5) {
    throw new Error("プレイヤー数は2～5人で指定してください。");
  }
  if (!Number.isInteger(options.handSize) || options.handSize < 5 || options.handSize > 7) {
    throw new Error("初期手札は5～7枚で指定してください。");
  }
  if (!Number.isInteger(options.jokerCount) || options.jokerCount < 0 || options.jokerCount > 2) {
    throw new Error("ジョーカー枚数は0～2枚で指定してください。");
  }

  const deck = shuffle(createDeck(options.jokerCount), random);
  const players: Player[] = Array.from({ length: options.playerCount }, (_, index) => ({
    id: `player-${index + 1}`,
    name: options.playerNames?.[index]?.trim().slice(0, 12) || `プレイヤー${index + 1}`,
    hand: [],
    finishRank: null,
  }));
  for (let cardIndex = 0; cardIndex < options.handSize; cardIndex += 1) {
    for (const player of players) {
      const card = deck.pop();
      if (!card) throw new Error("カードの配布に失敗しました。");
      player.hand.push(card);
    }
  }
  players.forEach((player) => player.hand.sort(compareCards));

  return {
    rules: { ...defaultRules, ...options.rules },
    players,
    deck,
    recycle: [],
    currentPlayerIndex: 0,
    trick: null,
    revolution: false,
    elevenBack: false,
    binding: null,
    phase: "playing",
    hasDrawn: false,
    passedPlayerIds: [],
    pendingEffect: null,
    effectQueue: [],
    postEffect: null,
    events: [],
    turn: 1,
    log: ["ゲームを開始しました。"],
  };
}

export function compareCards(left: Card, right: Card): number {
  if (left.isJoker) return right.isJoker ? 0 : 1;
  if (right.isJoker) return -1;
  return (left.rank ?? 0) - (right.rank ?? 0) || (left.suit ?? "").localeCompare(right.suit ?? "");
}

export function rankLabel(rank: number | null): string {
  if (rank === null) return "";
  return ({ 11: "J", 12: "Q", 13: "K", 14: "A", 15: "2", 16: "JOKER" } as Record<number, string>)[rank] ?? String(rank);
}

export function cardLabel(card: Card): string {
  if (card.isJoker) return "JOKER";
  return `${card.suit ? suitNames[card.suit] : ""}${rankLabel(card.rank)}`;
}

export function isReversed(state: Pick<GameState, "revolution" | "elevenBack">): boolean {
  return state.revolution !== state.elevenBack;
}

/** 役の短い表示名（例: 「ペア 7」「階段 5–7」）。 */
export function comboLabel(trick: Pick<Trick, "kind" | "count" | "rank" | "lowRank" | "highRank" | "isJokerSingle">): string {
  if (trick.isJokerSingle) return "ジョーカー";
  if (trick.kind === "straight") return `${trick.count}枚階段 ${rankLabel(trick.lowRank)}–${rankLabel(trick.highRank)}`;
  const name = trick.count === 1 ? "シングル" : trick.count === 2 ? "ペア" : trick.count === 3 ? "スリーカード" : "フォーカード";
  return `${name} ${rankLabel(trick.rank)}`;
}

function activePlayers(state: GameState): Player[] {
  return state.players.filter((player) => player.finishRank === null);
}

function nextActiveIndex(state: GameState, from: number, steps = 1): number {
  let index = from;
  for (let step = 0; step < steps; step += 1) {
    let attempts = 0;
    do {
      index = (index + 1) % state.players.length;
      attempts += 1;
    } while (state.players[index].finishRank !== null && attempts <= state.players.length);
  }
  return index;
}

/**
 * 次に手番が回るプレイヤー。上がった人と、この場でパスした人（場が流れるまで参加できない）は飛ばす。
 * 5スキップで飛ばす人数も、参加できる人だけを数える。
 */
function nextTurnIndex(state: GameState, from: number, steps = 1): number {
  const eligible = (index: number) =>
    state.players[index].finishRank === null && !state.passedPlayerIds.includes(state.players[index].id);
  let index = from;
  for (let step = 0; step < steps; step += 1) {
    let attempts = 0;
    do {
      index = (index + 1) % state.players.length;
      attempts += 1;
    } while (!eligible(index) && attempts <= state.players.length);
    if (!eligible(index)) return nextActiveIndex(state, from, steps);
  }
  return index;
}

function rankStrength(rank: number, reversed: boolean): number {
  return reversed ? 15 - rank : rank;
}

function classify(cards: Card[], reversed: boolean, rules: RuleSettings): Classified | null {
  if (cards.length === 0) return null;
  if (cards.length === 1 && cards[0].isJoker) {
    return { kind: "single", count: 1, rank: 16, lowRank: 16, highRank: 16, suits: [], isJokerSingle: true, isRevolution: false };
  }

  const normalCards = cards.filter((card) => !card.isJoker);
  if (normalCards.length === 0) return null;
  const ranks = normalCards.map((card) => card.rank as number);
  const uniqueRanks = [...new Set(ranks)];
  const isGroup = uniqueRanks.length === 1 && cards.length <= 4;
  const suit = normalCards[0].suit;
  const sameSuit = suit !== null && normalCards.every((card) => card.suit === suit);
  const isStraight = !isGroup && sameSuit && cards.length >= 3 && uniqueRanks.length === normalCards.length;

  let kind: Trick["kind"];
  let rank: number;
  let lowRank: number;
  let highRank: number;
  let trickSuits: Suit[];
  if (isGroup) {
    kind = cards.length === 1 ? "single" : "group";
    rank = uniqueRanks[0];
    lowRank = rank;
    highRank = rank;
    trickSuits = [...new Set(normalCards.map((card) => card.suit).filter((value): value is Suit => value !== null))];
  } else if (isStraight && suit) {
    const sorted = [...uniqueRanks].sort((a, b) => a - b);
    const missing = cards.length - normalCards.length;
    const possibilities: Array<{ low: number; high: number }> = [];
    for (let low = 3; low + cards.length - 1 <= 15; low += 1) {
      const high = low + cards.length - 1;
      if (sorted.every((value) => value >= low && value <= high) && high - low + 1 - sorted.length === missing) {
        possibilities.push({ low, high });
      }
    }
    if (possibilities.length === 0) return null;
    // ジョーカーの補完位置が複数ある場合は、現在の強弱方向で最も強くなる位置を採用する（代用先選択UIは未実装）。
    const selected = possibilities.sort((left, right) =>
      rankStrength(reversed ? right.low : right.high, reversed) -
      rankStrength(reversed ? left.low : left.high, reversed),
    )[0];
    kind = "straight";
    lowRank = selected.low;
    highRank = selected.high;
    rank = highRank;
    trickSuits = [suit];
  } else {
    return null;
  }

  return {
    kind,
    count: cards.length,
    rank,
    lowRank,
    highRank,
    suits: trickSuits,
    isJokerSingle: false,
    isRevolution: rules.revolution && ((kind === "group" && cards.length === 4) || (kind === "straight" && cards.length >= 4)),
  };
}

/**
 * 効果の判定に使う、出したカードの数字の一覧。
 * ジョーカーは「役カードとして数える」が有効なときだけ、ペアならその数字、階段なら補った数字として含める。
 */
function effectRanks(cards: Card[], trick: Classified, rules: RuleSettings): number[] {
  if (trick.isJokerSingle) return [];
  const ranks = cards.filter((card) => !card.isJoker).map((card) => card.rank as number);
  if (!rules.jokerAsEffectCard) return ranks;
  const jokerCount = cards.length - ranks.length;
  if (trick.kind === "straight") {
    for (let rank = trick.lowRank; rank <= trick.highRank; rank += 1) {
      if (!ranks.includes(rank)) ranks.push(rank);
    }
  } else {
    for (let index = 0; index < jokerCount; index += 1) ranks.push(trick.rank);
  }
  return ranks;
}

function validateAgainstTrick(state: GameState, candidate: Classified, cards: Card[]): string | null {
  const previous = state.trick;
  if (!previous) return null;
  if (candidate.isJokerSingle && !previous.isJokerSingle && previous.count === 1 && previous.kind === "single") return null;
  if (state.rules.spadeThree && previous.isJokerSingle && cards.length === 1 && cards[0].suit === "S" && cards[0].rank === 3) return null;
  if (previous.isJokerSingle) {
    return state.rules.spadeThree ? "ジョーカーにはスペード3以外のカードを出せません。" : "ジョーカーより強いカードはありません。";
  }
  if (candidate.kind !== previous.kind || candidate.count !== previous.count) return "場と同じ枚数・役のカードを選んでください。";
  if (state.binding) {
    // 縛り中は指定スートをすべて含む必要がある。足りないスートはジョーカーで補える。
    const jokerCount = cards.filter((card) => card.isJoker).length;
    const missing = state.binding.filter((suit) => !candidate.suits.includes(suit)).length;
    if (missing > jokerCount) {
      return `縛り中です。${state.binding.map((suit) => suitSymbols[suit]).join("")}のカードで出してください。`;
    }
  }
  const reversed = isReversed(state);
  const candidateRank = candidate.kind === "straight" ? (reversed ? candidate.lowRank : candidate.highRank) : candidate.rank;
  const previousRank = previous.kind === "straight" ? (reversed ? previous.lowRank : previous.highRank) : previous.rank;
  if (rankStrength(candidateRank, reversed) <= rankStrength(previousRank, reversed)) {
    return "場のカードより強い役を選んでください。";
  }
  return null;
}

function actionError(error: string): ActionResult {
  return { ok: false, error };
}

/** 操作ごとに状態を複製し、直前の操作の出来事をリセットする。 */
function beginAction(state: GameState): GameState {
  const next = structuredClone(state);
  next.events = [];
  return next;
}

function addLog(state: GameState, message: string): void {
  state.log = [...state.log.slice(-39), message];
}

function addEvent(state: GameState, event: GameEvent): void {
  state.events.push(event);
}

function currentPlayer(state: GameState): Player {
  return state.players[state.currentPlayerIndex];
}

/** 上がり禁止の判定。無効にした特殊ルールのカードは、効果がないため上がりに使える。 */
function isForbiddenFinish(cards: Card[], trick: Classified, rules: RuleSettings): boolean {
  if (!rules.forbiddenFinish) return false;
  const effectRank: Record<number, boolean> = {
    5: rules.fiveSkip,
    7: rules.sevenTransfer,
    8: rules.eightCut,
    10: rules.tenDiscard,
    11: rules.elevenBack,
  };
  const specialCard = cards.some((card) =>
    card.isJoker || (card.rank !== null && effectRank[card.rank]) ||
    (rules.spadeThree && card.rank === 3 && card.suit === "S"),
  );
  return specialCard || trick.isRevolution;
}

function finishTurn(state: GameState, playerId: string, skip = 0, samePlayer = false): void {
  const player = state.players.find((item) => item.id === playerId);
  if (!player) return;
  if (player.hand.length === 0 && player.finishRank === null) {
    const finishedCount = state.players.filter((item) => item.finishRank !== null).length;
    player.finishRank = finishedCount + 1;
    addLog(state, `${player.name}が${player.finishRank}位で上がりました。`);
    addEvent(state, { kind: "finish", text: `${player.name} ${player.finishRank}位で上がり！` });
  }

  state.deck = shuffle([...state.deck, ...state.recycle], Math.random);
  state.recycle = [];
  state.hasDrawn = false;
  state.pendingEffect = null;
  state.effectQueue = [];
  state.postEffect = null;
  state.phase = "playing";
  state.turn += 1;

  const remaining = activePlayers(state);
  if (remaining.length <= 1) {
    const last = remaining[0];
    if (last && last.finishRank === null) {
      last.finishRank = state.players.filter((item) => item.finishRank !== null).length + 1;
      addLog(state, `${last.name}が${last.finishRank}位です。ゲーム終了。`);
    }
    state.phase = "finished";
    return;
  }

  const currentIndex = state.players.findIndex((item) => item.id === playerId);
  if (samePlayer && player.finishRank === null) {
    state.currentPlayerIndex = currentIndex;
  } else {
    state.currentPlayerIndex = nextTurnIndex(state, currentIndex, skip + 1);
  }
}

const effectNames: Record<PendingEffect["type"], string> = { transfer: "7渡し", discard: "10捨て" };

/**
 * 選択が必要な効果を順に処理し、すべて終わったら8切り・5スキップを適用してターンを終える。
 * 適用順（暫定）: 7渡し → 10捨て → 8切り → 5スキップ（8切り成立時はスキップしない）。
 */
function advanceAfterPlay(state: GameState, playerId: string): void {
  const player = state.players.find((item) => item.id === playerId);
  if (!player) return;
  while (state.effectQueue.length > 0) {
    const effect = state.effectQueue.shift() as PendingEffect;
    // 効果で手札を0枚にすることは禁止のため、最低1枚は手元に残す。
    const count = Math.min(effect.count, player.hand.length - 1);
    if (count <= 0) {
      addLog(state, `${player.name}は手札が足りないため${effectNames[effect.type]}を省略しました。`);
      continue;
    }
    if (count < effect.count) {
      addLog(state, `${player.name}の${effectNames[effect.type]}は手札不足のため${count}枚になりました。`);
    }
    state.phase = "effect";
    state.pendingEffect = { type: effect.type, count };
    return;
  }

  const post = state.postEffect ?? { cut: false, skip: 0 };
  if (post.cut) {
    state.trick = null;
    state.binding = null;
    state.elevenBack = false;
    state.passedPlayerIds = [];
    addLog(state, "8切りで場が流れました。");
    addEvent(state, { kind: "eight-cut", text: "8切り" });
    finishTurn(state, player.id, 0, true);
    return;
  }
  if (post.skip > 0) {
    addLog(state, `5スキップで${post.skip}人飛ばします。`);
    addEvent(state, { kind: "skip", text: `${post.skip}人スキップ` });
  }
  finishTurn(state, player.id, post.skip);
}

type PlayValidation =
  | { ok: true; cards: Card[]; classified: Classified }
  | { ok: false; error: string };

function validatePlay(state: GameState, cardIds: string[]): PlayValidation {
  if (state.phase !== "playing") return { ok: false, error: "現在はカードを出せません。" };
  if (cardIds.length === 0) return { ok: false, error: "カードを選択してください。" };
  const player = currentPlayer(state);
  const selected = cardIds.map((id) => player.hand.find((card) => card.id === id));
  if (selected.some((card) => !card) || new Set(cardIds).size !== cardIds.length) {
    return { ok: false, error: "選択したカードが手札にありません。" };
  }
  const cards = selected as Card[];
  const classified = classify(cards, isReversed(state), state.rules);
  if (!classified) return { ok: false, error: "その組み合わせは役になりません。" };
  const trickError = validateAgainstTrick(state, classified, cards);
  if (trickError) return { ok: false, error: trickError };
  if (activePlayers(state).length > 1 && player.hand.length === cards.length && isForbiddenFinish(cards, classified, state.rules)) {
    return { ok: false, error: "特殊効果のあるカード・ジョーカー・革命では上がれません。" };
  }
  return { ok: true, cards, classified };
}

/** カードを出す前の確認用。状態は変更しない。 */
export function previewPlay(state: GameState, cardIds: string[]): { ok: true; label: string } | { ok: false; error: string } {
  const result = validatePlay(state, cardIds);
  if (!result.ok) return result;
  return { ok: true, label: comboLabel(result.classified) };
}

export function playCards(state: GameState, cardIds: string[]): ActionResult {
  const validation = validatePlay(state, cardIds);
  if (!validation.ok) return actionError(validation.error);
  const { cards, classified } = validation;
  const player = currentPlayer(state);

  const next = beginAction(state);
  const activePlayer = currentPlayer(next);
  activePlayer.hand = activePlayer.hand.filter((card) => !cardIds.includes(card.id));
  next.recycle.push(...cards);
  const oldTrick = next.trick;
  const trick: Trick = { ...classified, playerId: player.id, cards: structuredClone(cards) };
  next.trick = trick;
  // パスした人は、ほかの人が出しても場が流れるまで参加できないため、ここではリセットしない。
  addLog(next, `${player.name}が${cards.map(cardLabel).join("・")}を出しました。`);

  if (oldTrick?.isJokerSingle && !trick.isJokerSingle) {
    addEvent(next, { kind: "joker-return", text: "スペ3返し" });
  }
  // 縛りは一度成立したら場が流れるまで維持する。
  const rules = next.rules;
  if (rules.binding && !next.binding && oldTrick && oldTrick.suits.length > 0 && trick.suits.some((suit) => oldTrick.suits.includes(suit))) {
    next.binding = trick.suits.filter((suit) => oldTrick.suits.includes(suit));
    const symbols = next.binding.map((suit) => suitSymbols[suit]).join("");
    addLog(next, `${symbols}縛りが発生しました。`);
    addEvent(next, { kind: "bind", text: `${symbols} 縛り` });
  }
  if (classified.isRevolution) {
    next.revolution = !next.revolution;
    addLog(next, `革命${next.revolution ? "発生" : "返し"}。`);
    addEvent(next, next.revolution ? { kind: "revolution", text: "革命" } : { kind: "revolution-end", text: "革命返し" });
  }
  const ranks = effectRanks(cards, classified, rules);
  const countOf = (rank: number) => ranks.filter((value) => value === rank).length;
  if (rules.elevenBack && countOf(11) > 0) {
    next.elevenBack = !next.elevenBack;
    addLog(next, `11バック${next.elevenBack ? "発生" : "解除"}。`);
    addEvent(next, next.elevenBack ? { kind: "eleven-back", text: "11バック" } : { kind: "eleven-back-end", text: "11バック解除" });
  }

  const sevenCount = rules.sevenTransfer ? countOf(7) : 0;
  const tenCount = rules.tenDiscard ? countOf(10) : 0;
  next.effectQueue = [
    ...(sevenCount > 0 ? [{ type: "transfer", count: sevenCount } as const] : []),
    ...(tenCount > 0 ? [{ type: "discard", count: tenCount } as const] : []),
  ];
  next.postEffect = {
    cut: rules.eightCut && countOf(8) > 0,
    skip: rules.fiveSkip ? countOf(5) : 0,
  };
  advanceAfterPlay(next, player.id);
  return { ok: true, state: next };
}

export function pass(state: GameState): ActionResult {
  if (state.phase !== "playing") return actionError("現在はパスできません。");
  const next = beginAction(state);
  const player = currentPlayer(next);
  if (!next.hasDrawn) {
    if (next.deck.length === 0 && next.recycle.length > 0) {
      next.deck = shuffle(next.recycle, Math.random);
      next.recycle = [];
    }
    const card = next.deck.pop();
    if (card) {
      player.hand.push(card);
      player.hand.sort(compareCards);
      addLog(next, `${player.name}が1枚引きました。`);
    } else {
      addLog(next, `${player.name}は山札が空のためドローできません。`);
    }
    next.hasDrawn = true;
    return { ok: true, state: next };
  }

  next.passedPlayerIds = [...new Set([...next.passedPlayerIds, player.id])];
  addLog(next, `${player.name}がパスしました。`);
  const activeIds = activePlayers(next).map((item) => item.id);
  const lastPlayerId = next.trick?.playerId;
  const requiredIds = activeIds.filter((id) => id !== lastPlayerId);
  const allPassed = requiredIds.length > 0 && requiredIds.every((id) => next.passedPlayerIds.includes(id));
  const currentIndex = next.currentPlayerIndex;
  if (allPassed) {
    const leadIndex = lastPlayerId
      ? next.players.findIndex((item) => item.id === lastPlayerId)
      : currentIndex;
    next.trick = null;
    next.binding = null;
    next.elevenBack = false;
    next.passedPlayerIds = [];
    addLog(next, "全員がパスしたため場が流れました。");
    addEvent(next, { kind: "flow", text: "場が流れました" });
    finishTurn(next, next.players[currentIndex].id);
    next.currentPlayerIndex = leadIndex >= 0 && next.players[leadIndex].finishRank === null
      ? leadIndex
      : nextActiveIndex(next, leadIndex >= 0 ? leadIndex : currentIndex);
    return { ok: true, state: next };
  }
  finishTurn(next, player.id);
  return { ok: true, state: next };
}

export function resolveEffect(state: GameState, cardIds: string[]): ActionResult {
  if (state.phase !== "effect" || !state.pendingEffect) return actionError("処理中の効果がありません。");
  const player = currentPlayer(state);
  const effect = state.pendingEffect;
  if (cardIds.length !== effect.count) return actionError(`${effect.count}枚選択してください。`);
  const cards = cardIds.map((id) => player.hand.find((card) => card.id === id));
  if (cards.some((card) => !card) || new Set(cardIds).size !== cardIds.length) return actionError("選択したカードが手札にありません。");
  if (cardIds.length >= player.hand.length) return actionError("効果によって手札を0枚にすることはできません。");

  const next = beginAction(state);
  const source = currentPlayer(next);
  const chosen = cardIds.map((id) => source.hand.find((card) => card.id === id) as Card);
  source.hand = source.hand.filter((card) => !cardIds.includes(card.id));
  if (effect.type === "transfer") {
    const receiverIndex = nextActiveIndex(next, next.currentPlayerIndex);
    const receiver = next.players[receiverIndex];
    receiver.hand.push(...chosen);
    receiver.hand.sort(compareCards);
    addLog(next, `${player.name}が${receiver.name}に${chosen.length}枚渡しました。`);
  } else {
    next.recycle.push(...chosen);
    addLog(next, `${player.name}が${chosen.length}枚捨てました。`);
  }
  next.pendingEffect = null;
  advanceAfterPlay(next, player.id);
  return { ok: true, state: next };
}

/** 7渡しの受取人（UI表示用）。 */
export function transferReceiver(state: GameState): Player {
  return state.players[nextActiveIndex(state, state.currentPlayerIndex)];
}

export function assertCardIntegrity(state: GameState): boolean {
  const ids = [
    ...state.deck.map((card) => card.id),
    ...state.recycle.map((card) => card.id),
    ...state.players.flatMap((player) => player.hand.map((card) => card.id)),
  ];
  return new Set(ids).size === ids.length;
}
