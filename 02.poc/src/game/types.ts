export type Suit = "S" | "H" | "D" | "C";
export type Phase = "playing" | "effect" | "finished";
export type TrickKind = "single" | "group" | "straight";

export interface Card {
  id: string;
  suit: Suit | null;
  rank: number | null;
  isJoker: boolean;
}

export interface Player {
  id: string;
  name: string;
  hand: Card[];
  finishRank: number | null;
}

export interface Trick {
  kind: TrickKind;
  count: number;
  rank: number;
  lowRank: number;
  highRank: number;
  suits: Suit[];
  playerId: string;
  isJokerSingle: boolean;
  isRevolution: boolean;
  /**
   * 表示用に複製した、場に出たカード。
   * 実体は recycle → deck に戻るため、カード所在の整合性チェック対象には含めない。
   */
  cards: Card[];
}

export interface PendingEffect {
  type: "transfer" | "discard";
  count: number;
}

/** 7渡し・10捨ての選択がすべて終わってから適用するターン終了時の効果。 */
export interface PostEffect {
  cut: boolean;
  skip: number;
}

export type GameEventKind =
  | "revolution"
  | "revolution-end"
  | "eleven-back"
  | "eleven-back-end"
  | "eight-cut"
  | "skip"
  | "bind"
  | "joker-return"
  | "flow"
  | "finish";

/** 直前の操作で発生した出来事。UIの演出用で、ゲーム判定には使わない。 */
export interface GameEvent {
  kind: GameEventKind;
  text: string;
}

/** 特殊ルールの有効・無効。パスで1枚ドローはこのゲームの基本ルールのため常に有効。 */
export interface RuleSettings {
  fiveSkip: boolean;
  sevenTransfer: boolean;
  eightCut: boolean;
  tenDiscard: boolean;
  elevenBack: boolean;
  revolution: boolean;
  binding: boolean;
  spadeThree: boolean;
  forbiddenFinish: boolean;
  /**
   * 役カード（5・7・8・10・J）と組んだジョーカーを、その役カードとして数えるか。
   * 例: 10＋ジョーカーのペアなら10捨てが2枚になる。階段ではジョーカーが補った数字として数える。
   */
  jokerAsEffectCard: boolean;
}

export interface GameState {
  rules: RuleSettings;
  players: Player[];
  deck: Card[];
  recycle: Card[];
  currentPlayerIndex: number;
  trick: Trick | null;
  revolution: boolean;
  elevenBack: boolean;
  binding: Suit[] | null;
  phase: Phase;
  hasDrawn: boolean;
  passedPlayerIds: string[];
  pendingEffect: PendingEffect | null;
  effectQueue: PendingEffect[];
  postEffect: PostEffect | null;
  events: GameEvent[];
  turn: number;
  log: string[];
}

export interface GameOptions {
  playerCount: number;
  handSize: number;
  jokerCount: number;
  playerNames?: string[];
  /** 省略したルールは既定値（ジョーカーの役カード扱い以外すべて有効）になる。 */
  rules?: Partial<RuleSettings>;
}

export type ActionResult =
  | { ok: true; state: GameState }
  | { ok: false; error: string };
