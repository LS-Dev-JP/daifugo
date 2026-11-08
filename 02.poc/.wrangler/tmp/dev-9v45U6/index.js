var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker/index.ts
import { DurableObject } from "cloudflare:workers";

// server/rooms.ts
import { randomBytes, randomInt } from "node:crypto";

// src/game/engine.ts
var suits = ["S", "H", "D", "C"];
var suitNames = {
  S: "\u30B9\u30DA\u30FC\u30C9",
  H: "\u30CF\u30FC\u30C8",
  D: "\u30C0\u30A4\u30E4",
  C: "\u30AF\u30E9\u30D6"
};
var suitSymbols = {
  S: "\u2660",
  H: "\u2665",
  D: "\u2666",
  C: "\u2663"
};
function createDeck(jokerCount) {
  const cards = [];
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
__name(createDeck, "createDeck");
function shuffle(items, random) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}
__name(shuffle, "shuffle");
function startGame(options, random = Math.random) {
  if (!Number.isInteger(options.playerCount) || options.playerCount < 2 || options.playerCount > 5) {
    throw new Error("\u30D7\u30EC\u30A4\u30E4\u30FC\u6570\u306F2\uFF5E5\u4EBA\u3067\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
  }
  if (!Number.isInteger(options.handSize) || options.handSize < 5 || options.handSize > 7) {
    throw new Error("\u521D\u671F\u624B\u672D\u306F5\uFF5E7\u679A\u3067\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
  }
  if (!Number.isInteger(options.jokerCount) || options.jokerCount < 0 || options.jokerCount > 2) {
    throw new Error("\u30B8\u30E7\u30FC\u30AB\u30FC\u679A\u6570\u306F0\uFF5E2\u679A\u3067\u6307\u5B9A\u3057\u3066\u304F\u3060\u3055\u3044\u3002");
  }
  const deck = shuffle(createDeck(options.jokerCount), random);
  const players = Array.from({ length: options.playerCount }, (_, index) => ({
    id: `player-${index + 1}`,
    name: options.playerNames?.[index]?.trim().slice(0, 12) || `\u30D7\u30EC\u30A4\u30E4\u30FC${index + 1}`,
    hand: [],
    finishRank: null
  }));
  for (let cardIndex = 0; cardIndex < options.handSize; cardIndex += 1) {
    for (const player of players) {
      const card = deck.pop();
      if (!card) throw new Error("\u30AB\u30FC\u30C9\u306E\u914D\u5E03\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002");
      player.hand.push(card);
    }
  }
  players.forEach((player) => player.hand.sort(compareCards));
  return {
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
    log: ["\u30B2\u30FC\u30E0\u3092\u958B\u59CB\u3057\u307E\u3057\u305F\u3002"]
  };
}
__name(startGame, "startGame");
function compareCards(left, right) {
  if (left.isJoker) return right.isJoker ? 0 : 1;
  if (right.isJoker) return -1;
  return (left.rank ?? 0) - (right.rank ?? 0) || (left.suit ?? "").localeCompare(right.suit ?? "");
}
__name(compareCards, "compareCards");
function rankLabel(rank) {
  if (rank === null) return "";
  return { 11: "J", 12: "Q", 13: "K", 14: "A", 15: "2", 16: "JOKER" }[rank] ?? String(rank);
}
__name(rankLabel, "rankLabel");
function cardLabel(card) {
  if (card.isJoker) return "JOKER";
  return `${card.suit ? suitNames[card.suit] : ""}${rankLabel(card.rank)}`;
}
__name(cardLabel, "cardLabel");
function isReversed(state) {
  return state.revolution !== state.elevenBack;
}
__name(isReversed, "isReversed");
function activePlayers(state) {
  return state.players.filter((player) => player.finishRank === null);
}
__name(activePlayers, "activePlayers");
function nextActiveIndex(state, from, steps = 1) {
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
__name(nextActiveIndex, "nextActiveIndex");
function rankStrength(rank, reversed) {
  return reversed ? 15 - rank : rank;
}
__name(rankStrength, "rankStrength");
function classify(cards, reversed) {
  if (cards.length === 0) return null;
  if (cards.length === 1 && cards[0].isJoker) {
    return { kind: "single", count: 1, rank: 16, lowRank: 16, highRank: 16, suits: [], isJokerSingle: true, isRevolution: false };
  }
  const normalCards = cards.filter((card) => !card.isJoker);
  if (normalCards.length === 0) return null;
  const ranks = normalCards.map((card) => card.rank);
  const uniqueRanks = [...new Set(ranks)];
  const isGroup = uniqueRanks.length === 1 && cards.length <= 4;
  const suit = normalCards[0].suit;
  const sameSuit = suit !== null && normalCards.every((card) => card.suit === suit);
  const isStraight = !isGroup && sameSuit && cards.length >= 3 && uniqueRanks.length === normalCards.length;
  let kind;
  let rank;
  let lowRank;
  let highRank;
  let trickSuits;
  if (isGroup) {
    kind = cards.length === 1 ? "single" : "group";
    rank = uniqueRanks[0];
    lowRank = rank;
    highRank = rank;
    trickSuits = [...new Set(normalCards.map((card) => card.suit).filter((value) => value !== null))];
  } else if (isStraight && suit) {
    const sorted = [...uniqueRanks].sort((a, b) => a - b);
    const missing = cards.length - normalCards.length;
    const possibilities = [];
    for (let low = 3; low + cards.length - 1 <= 15; low += 1) {
      const high = low + cards.length - 1;
      if (sorted.every((value) => value >= low && value <= high) && high - low + 1 - sorted.length === missing) {
        possibilities.push({ low, high });
      }
    }
    if (possibilities.length === 0) return null;
    const selected = possibilities.sort(
      (left, right) => rankStrength(reversed ? right.low : right.high, reversed) - rankStrength(reversed ? left.low : left.high, reversed)
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
    isRevolution: kind === "group" && cards.length === 4 || kind === "straight" && cards.length >= 4
  };
}
__name(classify, "classify");
function validateAgainstTrick(state, candidate, cards) {
  const previous = state.trick;
  if (!previous) return null;
  if (candidate.isJokerSingle && !previous.isJokerSingle && previous.count === 1 && previous.kind === "single") return null;
  if (previous.isJokerSingle && cards.length === 1 && cards[0].suit === "S" && cards[0].rank === 3) return null;
  if (previous.isJokerSingle) return "\u30B8\u30E7\u30FC\u30AB\u30FC\u306B\u306F\u30B9\u30DA\u30FC\u30C93\u4EE5\u5916\u306E\u30AB\u30FC\u30C9\u3092\u51FA\u305B\u307E\u305B\u3093\u3002";
  if (candidate.kind !== previous.kind || candidate.count !== previous.count) return "\u5834\u3068\u540C\u3058\u679A\u6570\u30FB\u5F79\u306E\u30AB\u30FC\u30C9\u3092\u9078\u3093\u3067\u304F\u3060\u3055\u3044\u3002";
  if (state.binding) {
    const jokerCount = cards.filter((card) => card.isJoker).length;
    const missing = state.binding.filter((suit) => !candidate.suits.includes(suit)).length;
    if (missing > jokerCount) {
      return `\u7E1B\u308A\u4E2D\u3067\u3059\u3002${state.binding.map((suit) => suitSymbols[suit]).join("")}\u306E\u30AB\u30FC\u30C9\u3067\u51FA\u3057\u3066\u304F\u3060\u3055\u3044\u3002`;
    }
  }
  const reversed = isReversed(state);
  const candidateRank = candidate.kind === "straight" ? reversed ? candidate.lowRank : candidate.highRank : candidate.rank;
  const previousRank = previous.kind === "straight" ? reversed ? previous.lowRank : previous.highRank : previous.rank;
  if (rankStrength(candidateRank, reversed) <= rankStrength(previousRank, reversed)) {
    return "\u5834\u306E\u30AB\u30FC\u30C9\u3088\u308A\u5F37\u3044\u5F79\u3092\u9078\u3093\u3067\u304F\u3060\u3055\u3044\u3002";
  }
  return null;
}
__name(validateAgainstTrick, "validateAgainstTrick");
function actionError(error) {
  return { ok: false, error };
}
__name(actionError, "actionError");
function beginAction(state) {
  const next = structuredClone(state);
  next.events = [];
  return next;
}
__name(beginAction, "beginAction");
function addLog(state, message) {
  state.log = [...state.log.slice(-39), message];
}
__name(addLog, "addLog");
function addEvent(state, event) {
  state.events.push(event);
}
__name(addEvent, "addEvent");
function currentPlayer(state) {
  return state.players[state.currentPlayerIndex];
}
__name(currentPlayer, "currentPlayer");
function isForbiddenFinish(cards, trick) {
  const specialRank = cards.some(
    (card) => card.isJoker || card.rank === 5 || card.rank === 7 || card.rank === 8 || card.rank === 10 || card.rank === 11 || card.rank === 3 && card.suit === "S"
  );
  return specialRank || trick.isRevolution;
}
__name(isForbiddenFinish, "isForbiddenFinish");
function finishTurn(state, playerId, skip = 0, samePlayer = false) {
  const player = state.players.find((item) => item.id === playerId);
  if (!player) return;
  if (player.hand.length === 0 && player.finishRank === null) {
    const finishedCount = state.players.filter((item) => item.finishRank !== null).length;
    player.finishRank = finishedCount + 1;
    addLog(state, `${player.name}\u304C${player.finishRank}\u4F4D\u3067\u4E0A\u304C\u308A\u307E\u3057\u305F\u3002`);
    addEvent(state, { kind: "finish", text: `${player.name} ${player.finishRank}\u4F4D\u3067\u4E0A\u304C\u308A\uFF01` });
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
      addLog(state, `${last.name}\u304C${last.finishRank}\u4F4D\u3067\u3059\u3002\u30B2\u30FC\u30E0\u7D42\u4E86\u3002`);
    }
    state.phase = "finished";
    return;
  }
  const currentIndex = state.players.findIndex((item) => item.id === playerId);
  if (samePlayer && player.finishRank === null) {
    state.currentPlayerIndex = currentIndex;
  } else {
    state.currentPlayerIndex = nextActiveIndex(state, currentIndex, skip + 1);
  }
}
__name(finishTurn, "finishTurn");
var effectNames = { transfer: "7\u6E21\u3057", discard: "10\u6368\u3066" };
function advanceAfterPlay(state, playerId) {
  const player = state.players.find((item) => item.id === playerId);
  if (!player) return;
  while (state.effectQueue.length > 0) {
    const effect = state.effectQueue.shift();
    const count = Math.min(effect.count, player.hand.length - 1);
    if (count <= 0) {
      addLog(state, `${player.name}\u306F\u624B\u672D\u304C\u8DB3\u308A\u306A\u3044\u305F\u3081${effectNames[effect.type]}\u3092\u7701\u7565\u3057\u307E\u3057\u305F\u3002`);
      continue;
    }
    if (count < effect.count) {
      addLog(state, `${player.name}\u306E${effectNames[effect.type]}\u306F\u624B\u672D\u4E0D\u8DB3\u306E\u305F\u3081${count}\u679A\u306B\u306A\u308A\u307E\u3057\u305F\u3002`);
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
    addLog(state, "8\u5207\u308A\u3067\u5834\u304C\u6D41\u308C\u307E\u3057\u305F\u3002");
    addEvent(state, { kind: "eight-cut", text: "8\u5207\u308A" });
    finishTurn(state, player.id, 0, true);
    return;
  }
  if (post.skip > 0) {
    addLog(state, `5\u30B9\u30AD\u30C3\u30D7\u3067${post.skip}\u4EBA\u98DB\u3070\u3057\u307E\u3059\u3002`);
    addEvent(state, { kind: "skip", text: `${post.skip}\u4EBA\u30B9\u30AD\u30C3\u30D7` });
  }
  finishTurn(state, player.id, post.skip);
}
__name(advanceAfterPlay, "advanceAfterPlay");
function validatePlay(state, cardIds) {
  if (state.phase !== "playing") return { ok: false, error: "\u73FE\u5728\u306F\u30AB\u30FC\u30C9\u3092\u51FA\u305B\u307E\u305B\u3093\u3002" };
  if (cardIds.length === 0) return { ok: false, error: "\u30AB\u30FC\u30C9\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044\u3002" };
  const player = currentPlayer(state);
  const selected = cardIds.map((id) => player.hand.find((card) => card.id === id));
  if (selected.some((card) => !card) || new Set(cardIds).size !== cardIds.length) {
    return { ok: false, error: "\u9078\u629E\u3057\u305F\u30AB\u30FC\u30C9\u304C\u624B\u672D\u306B\u3042\u308A\u307E\u305B\u3093\u3002" };
  }
  const cards = selected;
  const classified = classify(cards, isReversed(state));
  if (!classified) return { ok: false, error: "\u305D\u306E\u7D44\u307F\u5408\u308F\u305B\u306F\u5F79\u306B\u306A\u308A\u307E\u305B\u3093\u3002" };
  const trickError = validateAgainstTrick(state, classified, cards);
  if (trickError) return { ok: false, error: trickError };
  if (activePlayers(state).length > 1 && player.hand.length === cards.length && isForbiddenFinish(cards, classified)) {
    return { ok: false, error: "\u7279\u6B8A\u52B9\u679C\u306E\u3042\u308B\u30AB\u30FC\u30C9\u30FB\u9769\u547D\u3067\u306F\u4E0A\u304C\u308C\u307E\u305B\u3093\u3002" };
  }
  return { ok: true, cards, classified };
}
__name(validatePlay, "validatePlay");
function playCards(state, cardIds) {
  const validation = validatePlay(state, cardIds);
  if (!validation.ok) return actionError(validation.error);
  const { cards, classified } = validation;
  const player = currentPlayer(state);
  const next = beginAction(state);
  const activePlayer = currentPlayer(next);
  activePlayer.hand = activePlayer.hand.filter((card) => !cardIds.includes(card.id));
  next.recycle.push(...cards);
  const oldTrick = next.trick;
  const trick = { ...classified, playerId: player.id, cards: structuredClone(cards) };
  next.trick = trick;
  next.passedPlayerIds = [];
  addLog(next, `${player.name}\u304C${cards.map(cardLabel).join("\u30FB")}\u3092\u51FA\u3057\u307E\u3057\u305F\u3002`);
  if (oldTrick?.isJokerSingle && !trick.isJokerSingle) {
    addEvent(next, { kind: "joker-return", text: "\u30B9\u30DA3\u8FD4\u3057" });
  }
  if (!next.binding && oldTrick && oldTrick.suits.length > 0 && trick.suits.some((suit) => oldTrick.suits.includes(suit))) {
    next.binding = trick.suits.filter((suit) => oldTrick.suits.includes(suit));
    const symbols = next.binding.map((suit) => suitSymbols[suit]).join("");
    addLog(next, `${symbols}\u7E1B\u308A\u304C\u767A\u751F\u3057\u307E\u3057\u305F\u3002`);
    addEvent(next, { kind: "bind", text: `${symbols} \u7E1B\u308A` });
  }
  if (classified.isRevolution) {
    next.revolution = !next.revolution;
    addLog(next, `\u9769\u547D${next.revolution ? "\u767A\u751F" : "\u8FD4\u3057"}\u3002`);
    addEvent(next, next.revolution ? { kind: "revolution", text: "\u9769\u547D" } : { kind: "revolution-end", text: "\u9769\u547D\u8FD4\u3057" });
  }
  if (cards.some((card) => card.rank === 11)) {
    next.elevenBack = !next.elevenBack;
    addLog(next, `11\u30D0\u30C3\u30AF${next.elevenBack ? "\u767A\u751F" : "\u89E3\u9664"}\u3002`);
    addEvent(next, next.elevenBack ? { kind: "eleven-back", text: "11\u30D0\u30C3\u30AF" } : { kind: "eleven-back-end", text: "11\u30D0\u30C3\u30AF\u89E3\u9664" });
  }
  const sevenCount = cards.filter((card) => card.rank === 7).length;
  const tenCount = cards.filter((card) => card.rank === 10).length;
  next.effectQueue = [
    ...sevenCount > 0 ? [{ type: "transfer", count: sevenCount }] : [],
    ...tenCount > 0 ? [{ type: "discard", count: tenCount }] : []
  ];
  next.postEffect = {
    cut: cards.some((card) => card.rank === 8),
    skip: cards.filter((card) => card.rank === 5).length
  };
  advanceAfterPlay(next, player.id);
  return { ok: true, state: next };
}
__name(playCards, "playCards");
function pass(state) {
  if (state.phase !== "playing") return actionError("\u73FE\u5728\u306F\u30D1\u30B9\u3067\u304D\u307E\u305B\u3093\u3002");
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
      addLog(next, `${player.name}\u304C1\u679A\u5F15\u304D\u307E\u3057\u305F\u3002`);
    } else {
      addLog(next, `${player.name}\u306F\u5C71\u672D\u304C\u7A7A\u306E\u305F\u3081\u30C9\u30ED\u30FC\u3067\u304D\u307E\u305B\u3093\u3002`);
    }
    next.hasDrawn = true;
    return { ok: true, state: next };
  }
  next.passedPlayerIds = [.../* @__PURE__ */ new Set([...next.passedPlayerIds, player.id])];
  addLog(next, `${player.name}\u304C\u30D1\u30B9\u3057\u307E\u3057\u305F\u3002`);
  const activeIds = activePlayers(next).map((item) => item.id);
  const lastPlayerId = next.trick?.playerId;
  const requiredIds = activeIds.filter((id) => id !== lastPlayerId);
  const allPassed = requiredIds.length > 0 && requiredIds.every((id) => next.passedPlayerIds.includes(id));
  const currentIndex = next.currentPlayerIndex;
  if (allPassed) {
    const leadIndex = lastPlayerId ? next.players.findIndex((item) => item.id === lastPlayerId) : currentIndex;
    next.trick = null;
    next.binding = null;
    next.elevenBack = false;
    next.passedPlayerIds = [];
    addLog(next, "\u5168\u54E1\u304C\u30D1\u30B9\u3057\u305F\u305F\u3081\u5834\u304C\u6D41\u308C\u307E\u3057\u305F\u3002");
    addEvent(next, { kind: "flow", text: "\u5834\u304C\u6D41\u308C\u307E\u3057\u305F" });
    finishTurn(next, next.players[currentIndex].id);
    next.currentPlayerIndex = leadIndex >= 0 && next.players[leadIndex].finishRank === null ? leadIndex : nextActiveIndex(next, leadIndex >= 0 ? leadIndex : currentIndex);
    return { ok: true, state: next };
  }
  finishTurn(next, player.id);
  return { ok: true, state: next };
}
__name(pass, "pass");
function resolveEffect(state, cardIds) {
  if (state.phase !== "effect" || !state.pendingEffect) return actionError("\u51E6\u7406\u4E2D\u306E\u52B9\u679C\u304C\u3042\u308A\u307E\u305B\u3093\u3002");
  const player = currentPlayer(state);
  const effect = state.pendingEffect;
  if (cardIds.length !== effect.count) return actionError(`${effect.count}\u679A\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044\u3002`);
  const cards = cardIds.map((id) => player.hand.find((card) => card.id === id));
  if (cards.some((card) => !card) || new Set(cardIds).size !== cardIds.length) return actionError("\u9078\u629E\u3057\u305F\u30AB\u30FC\u30C9\u304C\u624B\u672D\u306B\u3042\u308A\u307E\u305B\u3093\u3002");
  if (cardIds.length >= player.hand.length) return actionError("\u52B9\u679C\u306B\u3088\u3063\u3066\u624B\u672D\u30920\u679A\u306B\u3059\u308B\u3053\u3068\u306F\u3067\u304D\u307E\u305B\u3093\u3002");
  const next = beginAction(state);
  const source = currentPlayer(next);
  const chosen = cardIds.map((id) => source.hand.find((card) => card.id === id));
  source.hand = source.hand.filter((card) => !cardIds.includes(card.id));
  if (effect.type === "transfer") {
    const receiverIndex = nextActiveIndex(next, next.currentPlayerIndex);
    const receiver = next.players[receiverIndex];
    receiver.hand.push(...chosen);
    receiver.hand.sort(compareCards);
    addLog(next, `${player.name}\u304C${receiver.name}\u306B${chosen.length}\u679A\u6E21\u3057\u307E\u3057\u305F\u3002`);
  } else {
    next.recycle.push(...chosen);
    addLog(next, `${player.name}\u304C${chosen.length}\u679A\u6368\u3066\u307E\u3057\u305F\u3002`);
  }
  next.pendingEffect = null;
  advanceAfterPlay(next, player.id);
  return { ok: true, state: next };
}
__name(resolveEffect, "resolveEffect");

// src/online/protocol.ts
var maxSeats = 5;
var minSeats = 2;
var autoStartDelayMs = 5e3;
function toGameView(state, seat) {
  return {
    players: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      handCount: player.hand.length,
      finishRank: player.finishRank
    })),
    myHand: state.players[seat]?.hand ?? [],
    deckCount: state.deck.length,
    currentPlayerIndex: state.currentPlayerIndex,
    trick: state.trick,
    revolution: state.revolution,
    elevenBack: state.elevenBack,
    binding: state.binding,
    phase: state.phase,
    hasDrawn: state.hasDrawn,
    passedPlayerIds: state.passedPlayerIds,
    pendingEffect: state.pendingEffect,
    events: state.events,
    turn: state.turn,
    log: state.log
  };
}
__name(toGameView, "toGameView");

// server/rooms.ts
var defaultOptions = {
  maxRooms: 200,
  autoPlayMs: 45e3,
  roomTtlMs: 15 * 6e4,
  lobbySeatTtlMs: 2 * 6e4,
  listLimit: 50
};
function asString(value, max) {
  return typeof value === "string" && value.length <= max ? value : null;
}
__name(asString, "asString");
function asCardIds(value) {
  if (!Array.isArray(value) || value.length > 20) return null;
  return value.every((item) => typeof item === "string" && item.length <= 16) ? value : null;
}
__name(asCardIds, "asCardIds");
function inRange(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}
__name(inRange, "inRange");
function asSettings(value) {
  if (typeof value !== "object" || value === null) return null;
  const { capacity, handSize, jokerCount, isPublic } = value;
  if (!inRange(capacity, minSeats, maxSeats) || !inRange(handSize, 5, 7) || !inRange(jokerCount, 0, 2)) return null;
  if (typeof isPublic !== "boolean") return null;
  return { capacity, handSize, jokerCount, isPublic };
}
__name(asSettings, "asSettings");
function asRoomCode(value) {
  const code = asString(value, 8)?.trim();
  return code && /^\d{4}$/.test(code) ? code : null;
}
__name(asRoomCode, "asRoomCode");
function cleanName(value) {
  const name = asString(value, 64)?.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!name) return null;
  return Array.from(name).slice(0, 12).join("");
}
__name(cleanName, "cleanName");
function parseClientMessage(raw) {
  if (typeof raw !== "object" || raw === null) return null;
  const message = raw;
  switch (message.type) {
    case "create": {
      const name = cleanName(message.name);
      const settings = asSettings(message.settings);
      return name && settings ? { type: "create", name, settings } : null;
    }
    case "join": {
      const name = cleanName(message.name);
      const code = asRoomCode(message.code);
      return name && code ? { type: "join", name, code } : null;
    }
    case "resume": {
      const code = asRoomCode(message.code);
      const token = asString(message.token, 64);
      return code && token ? { type: "resume", code, token } : null;
    }
    case "settings": {
      const settings = asSettings(message.settings);
      return settings ? { type: "settings", settings } : null;
    }
    case "play":
    case "resolve": {
      const cardIds = asCardIds(message.cardIds);
      return cardIds ? { type: message.type, cardIds } : null;
    }
    case "watchRooms":
    case "unwatchRooms":
    case "start":
    case "pass":
    case "leave":
      return { type: message.type };
    default:
      return null;
  }
}
__name(parseClientMessage, "parseClientMessage");
var RoomManager = class {
  constructor(now = Date.now, options = {}) {
    this.now = now;
    this.options = { ...defaultOptions, ...options };
  }
  now;
  static {
    __name(this, "RoomManager");
  }
  rooms = /* @__PURE__ */ new Map();
  sessions = /* @__PURE__ */ new Map();
  watchers = /* @__PURE__ */ new Set();
  lastListing = "";
  options;
  get roomCount() {
    return this.rooms.size;
  }
  handle(conn, raw) {
    const message = parseClientMessage(raw);
    if (!message) {
      conn.send({ type: "error", message: "\u4E0D\u6B63\u306A\u30EA\u30AF\u30A8\u30B9\u30C8\u3067\u3059\u3002" });
      return;
    }
    switch (message.type) {
      case "watchRooms": {
        this.watchers.add(conn);
        const listing = this.listing();
        this.lastListing = JSON.stringify(listing);
        conn.send(listing);
        return;
      }
      case "unwatchRooms":
        this.watchers.delete(conn);
        return;
      case "create":
        return this.create(conn, message.name, message.settings);
      case "join":
        return this.join(conn, message.code, message.name);
      case "resume":
        return this.resume(conn, message.code, message.token);
      case "leave":
        return this.leave(conn);
      default:
        return this.roomAction(conn, message);
    }
  }
  disconnect(conn) {
    this.watchers.delete(conn);
    const session = this.sessions.get(conn);
    if (!session) return;
    this.sessions.delete(conn);
    const { room, seat } = session;
    if (seat.conn !== conn) return;
    seat.conn = null;
    seat.disconnectedAt = this.now();
    this.ensureHost(room);
    this.updateCountdown(room);
    this.broadcast(room, false);
  }
  /** 定期処理：自動開始、切断中プレイヤーの自動進行、使われなくなったルームの削除。 */
  tick() {
    const now = this.now();
    for (const room of this.rooms.values()) {
      if (room.seats.every((seat) => !seat.conn)) {
        if (now - room.lastActivity > this.options.roomTtlMs) this.deleteRoom(room);
        continue;
      }
      if (room.status === "playing") {
        this.autoPlay(room, now);
        continue;
      }
      const before = room.seats.length;
      room.seats = room.seats.filter((seat) => seat.conn || !seat.left && seat.disconnectedAt !== null && now - seat.disconnectedAt < this.options.lobbySeatTtlMs);
      if (room.seats.length !== before) {
        this.ensureHost(room);
        this.updateCountdown(room);
        this.broadcast(room, false);
      }
      if (room.status === "lobby" && room.startAt !== null && now >= room.startAt) this.startRoom(room);
    }
  }
  autoPlay(room, now) {
    const game = room.game;
    if (!game || game.phase === "finished") return;
    const seat = room.seats[game.currentPlayerIndex];
    if (!seat || seat.conn) return;
    const waited = seat.left ? Infinity : now - Math.max(room.turnStartedAt, seat.disconnectedAt ?? 0);
    if (waited < this.options.autoPlayMs) return;
    let state = game;
    if (state.phase === "effect" && state.pendingEffect) {
      const hand = state.players[state.currentPlayerIndex].hand;
      const result = resolveEffect(state, hand.slice(0, state.pendingEffect.count).map((card) => card.id));
      if (result.ok) state = result.state;
    } else {
      for (let attempt = 0; attempt < 2 && state.currentPlayerIndex === game.currentPlayerIndex && state.phase === "playing"; attempt += 1) {
        const result = pass(state);
        if (!result.ok) break;
        state = result.state;
      }
    }
    state.log = [...state.log.slice(-39), `${seat.name}\u306F\u63A5\u7D9A\u304C\u5207\u308C\u3066\u3044\u308B\u305F\u3081\u81EA\u52D5\u3067\u9032\u884C\u3057\u307E\u3057\u305F\u3002`];
    this.commit(room, state);
  }
  create(conn, name, settings) {
    this.leave(conn);
    if (this.rooms.size >= this.options.maxRooms) {
      conn.send({ type: "error", message: "\u30EB\u30FC\u30E0\u6570\u304C\u4E0A\u9650\u306B\u9054\u3057\u3066\u3044\u307E\u3059\u3002\u3057\u3070\u3089\u304F\u3057\u3066\u304B\u3089\u304A\u8A66\u3057\u304F\u3060\u3055\u3044\u3002" });
      return;
    }
    let code = "";
    do {
      code = String(randomInt(1e3, 1e4));
    } while (this.rooms.has(code));
    const seat = this.newSeat(conn, name);
    const now = this.now();
    const room = {
      code,
      host: seat,
      settings,
      seats: [seat],
      status: "lobby",
      game: null,
      version: 1,
      createdAt: now,
      lastActivity: now,
      turnStartedAt: now,
      startAt: null
    };
    this.rooms.set(code, room);
    this.attach(conn, room, seat);
  }
  join(conn, code, name) {
    const room = this.rooms.get(code);
    if (!room) {
      conn.send({ type: "error", message: `\u30EB\u30FC\u30E0 ${code} \u306F\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002\u756A\u53F7\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\u3002` });
      return;
    }
    if (room.status === "playing") {
      conn.send({ type: "error", message: "\u3053\u306E\u30EB\u30FC\u30E0\u306F\u30B2\u30FC\u30E0\u4E2D\u306E\u305F\u3081\u53C2\u52A0\u3067\u304D\u307E\u305B\u3093\u3002" });
      return;
    }
    if (room.seats.length >= room.settings.capacity) {
      conn.send({ type: "error", message: `\u30EB\u30FC\u30E0 ${code} \u306F\u6E80\u54E1\u3067\u3059\uFF08${room.settings.capacity}\u4EBA\u52DF\u96C6\uFF09\u3002` });
      return;
    }
    this.leave(conn);
    const taken = new Set(room.seats.map((seat2) => seat2.name));
    let unique = name;
    for (let suffix = 2; taken.has(unique); suffix += 1) unique = `${Array.from(name).slice(0, 10).join("")}${suffix}`;
    const seat = this.newSeat(conn, unique);
    room.seats.push(seat);
    this.attach(conn, room, seat);
  }
  resume(conn, code, token) {
    const room = this.rooms.get(code);
    const seat = room?.seats.find((item) => item.token === token && !item.left);
    if (!room || !seat) {
      conn.send({ type: "error", message: "\u30EB\u30FC\u30E0\u304C\u7D42\u4E86\u3057\u305F\u304B\u3001\u53C2\u52A0\u60C5\u5831\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3002", fatal: true });
      return;
    }
    if (seat.conn && seat.conn !== conn) {
      const previous = seat.conn;
      this.sessions.delete(previous);
      previous.send({ type: "error", message: "\u5225\u306E\u753B\u9762\u3067\u540C\u3058\u5E2D\u306B\u63A5\u7D9A\u3057\u307E\u3057\u305F\u3002", fatal: true });
    }
    this.attach(conn, room, seat);
  }
  leave(conn) {
    const session = this.sessions.get(conn);
    if (!session) return;
    this.sessions.delete(conn);
    const { room, seat } = session;
    seat.conn = null;
    seat.disconnectedAt = this.now();
    if (room.status === "playing") {
      seat.left = true;
    } else {
      room.seats = room.seats.filter((item) => item !== seat);
    }
    if (room.seats.length === 0) {
      this.deleteRoom(room);
      return;
    }
    this.ensureHost(room);
    this.updateCountdown(room);
    this.broadcast(room, false);
  }
  roomAction(conn, message) {
    const session = this.sessions.get(conn);
    if (!session) {
      conn.send({ type: "error", message: "\u30EB\u30FC\u30E0\u306B\u53C2\u52A0\u3057\u3066\u3044\u307E\u305B\u3093\u3002" });
      return;
    }
    const { room, seat } = session;
    room.lastActivity = this.now();
    const seatIndex = room.seats.indexOf(seat);
    if (message.type === "settings" || message.type === "start") {
      if (room.host !== seat) {
        conn.send({ type: "error", message: "\u30DB\u30B9\u30C8\u3060\u3051\u304C\u64CD\u4F5C\u3067\u304D\u307E\u3059\u3002" });
        return;
      }
      if (room.status === "playing") {
        conn.send({ type: "error", message: "\u30B2\u30FC\u30E0\u4E2D\u306F\u5909\u66F4\u3067\u304D\u307E\u305B\u3093\u3002" });
        return;
      }
      if (message.type === "settings") {
        if (message.settings.capacity < room.seats.length) {
          conn.send({ type: "error", message: `\u3059\u3067\u306B${room.seats.length}\u4EBA\u304C\u53C2\u52A0\u3057\u3066\u3044\u308B\u305F\u3081\u3001\u52DF\u96C6\u4EBA\u6570\u3092\u6E1B\u3089\u305B\u307E\u305B\u3093\u3002` });
          return;
        }
        room.settings = message.settings;
        this.updateCountdown(room);
        this.broadcast(room, false);
        return;
      }
      this.startRoom(room, conn);
      return;
    }
    const game = room.game;
    if (room.status !== "playing" || !game) {
      conn.send({ type: "error", message: "\u30B2\u30FC\u30E0\u304C\u59CB\u307E\u3063\u3066\u3044\u307E\u305B\u3093\u3002" });
      return;
    }
    if (game.currentPlayerIndex !== seatIndex) {
      conn.send({ type: "error", message: "\u3042\u306A\u305F\u306E\u624B\u756A\u3067\u306F\u3042\u308A\u307E\u305B\u3093\u3002" });
      return;
    }
    let result;
    if (message.type === "play") result = playCards(game, message.cardIds);
    else if (message.type === "resolve") result = resolveEffect(game, message.cardIds);
    else if (message.type === "pass") result = pass(game);
    else return;
    if (!result.ok) {
      conn.send({ type: "error", message: result.error });
      return;
    }
    this.commit(room, result.state);
  }
  /** ゲームを開始する。requester が指定された場合は、開始できない理由をその接続に返す。 */
  startRoom(room, requester) {
    room.seats = room.seats.filter((item) => item.conn && !item.left);
    room.startAt = null;
    if (room.seats.length < minSeats) {
      this.ensureHost(room);
      this.broadcast(room, false);
      requester?.send({ type: "error", message: `${minSeats}\u4EBA\u4EE5\u4E0A\u305D\u308D\u3046\u3068\u958B\u59CB\u3067\u304D\u307E\u3059\u3002` });
      return;
    }
    room.game = startGame({
      playerCount: room.seats.length,
      handSize: room.settings.handSize,
      jokerCount: room.settings.jokerCount,
      playerNames: room.seats.map((item) => item.name)
    });
    room.status = "playing";
    room.turnStartedAt = this.now();
    this.ensureHost(room);
    this.broadcast(room, true);
  }
  /** 募集人数がそろい全員が接続中なら自動開始の時刻を設定し、条件を満たさなくなったら取り消す。 */
  updateCountdown(room) {
    const full = room.status === "lobby" && room.seats.length >= room.settings.capacity && room.seats.every((seat) => seat.conn);
    if (!full) room.startAt = null;
    else if (room.startAt === null) room.startAt = this.now() + autoStartDelayMs;
  }
  commit(room, state) {
    const previous = room.game;
    room.game = state;
    room.lastActivity = this.now();
    if (!previous || previous.currentPlayerIndex !== state.currentPlayerIndex || previous.phase !== state.phase) {
      room.turnStartedAt = this.now();
    }
    if (state.phase === "finished") {
      room.status = "finished";
      room.seats = room.seats.filter((seat) => !seat.left);
      this.ensureHost(room);
    }
    this.broadcast(room, true);
  }
  newSeat(conn, name) {
    return { token: randomBytes(16).toString("hex"), name, conn, disconnectedAt: null, left: false };
  }
  attach(conn, room, seat) {
    this.watchers.delete(conn);
    seat.conn = conn;
    seat.disconnectedAt = null;
    room.lastActivity = this.now();
    this.sessions.set(conn, { room, seat });
    conn.send({ type: "session", code: room.code, token: seat.token });
    this.ensureHost(room);
    this.updateCountdown(room);
    this.broadcast(room, false);
  }
  deleteRoom(room) {
    this.rooms.delete(room.code);
    this.publishRooms();
  }
  /** ホストが不在なら、接続中の最初の席にホストを移す。 */
  ensureHost(room) {
    if (room.seats.includes(room.host) && room.host.conn) return;
    room.host = room.seats.find((seat) => seat.conn) ?? room.seats[0] ?? room.host;
  }
  broadcast(room, gameChanged) {
    room.version += 1;
    room.seats.forEach((seat, index) => {
      if (!seat.conn) return;
      seat.conn.send({ type: "room", room: this.view(room, index, gameChanged) });
    });
    this.publishRooms();
  }
  listing() {
    const rooms = [...this.rooms.values()].filter((room) => room.settings.isPublic && room.status === "lobby" && room.startAt === null && room.seats.length < room.settings.capacity).sort((left, right) => left.settings.capacity - left.seats.length - (right.settings.capacity - right.seats.length) || right.createdAt - left.createdAt).slice(0, this.options.listLimit).map((room) => ({
      code: room.code,
      hostName: room.host.name,
      members: room.seats.map((seat) => seat.name),
      capacity: room.settings.capacity,
      handSize: room.settings.handSize,
      jokerCount: room.settings.jokerCount
    }));
    const playing = [...this.rooms.values()].filter((room) => room.status === "playing").length;
    return { type: "rooms", rooms, playing };
  }
  /** 募集一覧が変わった場合だけ、一覧を見ている接続へ送る。 */
  publishRooms() {
    if (this.watchers.size === 0) return;
    const message = this.listing();
    const serialized = JSON.stringify(message);
    if (serialized === this.lastListing) return;
    this.lastListing = serialized;
    for (const watcher of this.watchers) watcher.send(message);
  }
  view(room, seatIndex, gameChanged) {
    const game = room.game && room.status !== "lobby" ? toGameView(room.game, seatIndex) : null;
    if (game && !gameChanged) game.events = [];
    return {
      code: room.code,
      status: room.status,
      hostSeat: Math.max(0, room.seats.indexOf(room.host)),
      mySeat: seatIndex,
      settings: room.settings,
      seats: room.seats.map((seat) => ({ name: seat.name, connected: seat.conn !== null })),
      version: room.version,
      startsInMs: room.startAt === null ? null : Math.max(0, room.startAt - this.now()),
      game
    };
  }
};

// worker/index.ts
var securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; style-src 'self' 'unsafe-inline'; base-uri 'self'; frame-ancestors 'none'"
};
var worker_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/healthz")) {
      return new Response("ok", { headers: { "Content-Type": "text/plain" } });
    }
    if (url.pathname.endsWith("/ws")) {
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
        return new Response("Expected WebSocket", { status: 426 });
      }
      return env.LOBBY.get(env.LOBBY.idFromName("lobby")).fetch(request);
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
    }
    const assetResponse = await env.ASSETS.fetch(request);
    const response = new Response(assetResponse.body, assetResponse);
    for (const [key, value] of Object.entries(securityHeaders)) response.headers.set(key, value);
    if (url.pathname.includes("/assets/") && response.ok) {
      response.headers.set("Cache-Control", "public, max-age=31536000, immutable");
    } else {
      response.headers.set("Cache-Control", "no-cache");
    }
    return response;
  }
};
var TICK_MS = 500;
var KEEPALIVE_MS = 1e4;
var Lobby = class extends DurableObject {
  static {
    __name(this, "Lobby");
  }
  manager = new RoomManager();
  sockets = /* @__PURE__ */ new Set();
  timer = null;
  async fetch() {
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    server.accept();
    this.sockets.add(server);
    const conn = {
      send(message) {
        try {
          server.send(JSON.stringify(message));
        } catch {
        }
      }
    };
    let windowStart = Date.now();
    let count = 0;
    server.addEventListener("message", (event) => {
      const now = Date.now();
      if (now - windowStart > 1e3) {
        windowStart = now;
        count = 0;
      }
      count += 1;
      if (count > 20 || typeof event.data !== "string") return;
      if (event.data.length > 8 * 1024) {
        server.close(1009, "message too large");
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(event.data);
      } catch {
        conn.send({ type: "error", message: "\u4E0D\u6B63\u306A\u30EA\u30AF\u30A8\u30B9\u30C8\u3067\u3059\u3002" });
        return;
      }
      try {
        this.manager.handle(conn, parsed);
      } catch (error) {
        console.error(error);
        conn.send({ type: "error", message: "\u30B5\u30FC\u30D0\u30FC\u3067\u30A8\u30E9\u30FC\u304C\u767A\u751F\u3057\u307E\u3057\u305F\u3002" });
      }
    });
    const onClose = /* @__PURE__ */ __name(() => {
      if (!this.sockets.delete(server)) return;
      this.manager.disconnect(conn);
      this.updateTimers();
    }, "onClose");
    server.addEventListener("close", onClose);
    server.addEventListener("error", onClose);
    this.updateTimers();
    return new Response(null, { status: 101, webSocket: client });
  }
  async alarm() {
    this.manager.tick();
    await this.updateTimers();
  }
  async updateTimers() {
    if (this.sockets.size > 0) {
      this.timer ??= setInterval(() => this.manager.tick(), TICK_MS);
    } else if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.sockets.size > 0 || this.manager.roomCount > 0) {
      const current = await this.ctx.storage.getAlarm();
      if (current === null) await this.ctx.storage.setAlarm(Date.now() + KEEPALIVE_MS);
    }
  }
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-zLBQJP/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-zLBQJP/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  Lobby,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
