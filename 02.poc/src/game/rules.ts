import type { RuleSettings } from "./types";

export type RuleKey = keyof RuleSettings;

export const defaultRules: RuleSettings = {
  fiveSkip: true,
  sevenTransfer: true,
  eightCut: true,
  tenDiscard: true,
  elevenBack: true,
  revolution: true,
  binding: true,
  spadeThree: true,
  forbiddenFinish: true,
  jokerAsEffectCard: false,
};

export interface RuleDefinition {
  key: RuleKey;
  /** ルール一覧の左に出す短い記号。 */
  mark: string;
  title: string;
  body: string;
  /** 特殊ルールではなく、特殊ルールの細かな扱いを決めるオプション。 */
  isOption?: boolean;
}

export const ruleDefinitions: RuleDefinition[] = [
  { key: "fiveSkip", mark: "5", title: "5スキップ", body: "出した5の枚数だけ、次のプレイヤーを飛ばします。" },
  { key: "sevenTransfer", mark: "7", title: "7渡し", body: "出した7の枚数だけ、手札を次のプレイヤーに渡します。" },
  { key: "eightCut", mark: "8", title: "8切り", body: "場を流し、出したプレイヤーから次の場を始めます。" },
  { key: "tenDiscard", mark: "10", title: "10捨て", body: "出した10の枚数だけ、手札を捨てられます。" },
  { key: "elevenBack", mark: "J", title: "11バック", body: "場が流れるまで、カードの強さが逆転します。" },
  { key: "revolution", mark: "革", title: "革命", body: "同じ数字4枚、または4枚以上の階段で成立。強さが逆転し、場が流れても続きます。" },
  { key: "binding", mark: "縛", title: "縛り", body: "前のプレイとスートが続くと縛りが成立し、場が流れるまでそのスートしか出せません。" },
  { key: "spadeThree", mark: "♠3", title: "スペ3返し", body: "ジョーカー1枚出しには、スペードの3だけが出せます。" },
  { key: "forbiddenFinish", mark: "×", title: "上がり禁止", body: "有効な特殊効果のあるカード（スペ3・5・7・8・10・J）・ジョーカー・革命では上がれません。" },
  {
    key: "jokerAsEffectCard", mark: "JK", title: "ジョーカーを役カードとして数える", isOption: true,
    body: "5・7・8・10・Jと一緒に出したジョーカーも、その数字として効果の枚数に数えます。例: 10＋ジョーカーなら2枚捨てられます。",
  },
];

export const ruleKeys = ruleDefinitions.map((rule) => rule.key);

/** 外部から受け取った値をルール設定に整える。真偽値以外が含まれていれば null。 */
export function parseRules(value: unknown): RuleSettings | null {
  if (value === undefined) return { ...defaultRules };
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const rules = { ...defaultRules };
  for (const key of ruleKeys) {
    const item = input[key];
    if (item === undefined) continue;
    if (typeof item !== "boolean") return null;
    rules[key] = item;
  }
  return rules;
}

/** 有効になっている特殊ルールの数（オプションは除く）。 */
export function enabledRuleCount(rules: RuleSettings): { enabled: number; total: number } {
  const specials = ruleDefinitions.filter((rule) => !rule.isOption);
  return { enabled: specials.filter((rule) => rules[rule.key]).length, total: specials.length };
}
