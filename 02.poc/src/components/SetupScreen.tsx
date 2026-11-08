import { useId, type CSSProperties, type ReactNode } from "react";
import { defaultRules, enabledRuleCount, ruleDefinitions } from "../game/rules";
import type { Card, RuleSettings } from "../game/types";
import { PlayingCard } from "./PlayingCard";
import { RuleList } from "./RuleReference";
import { seatHue } from "./theme";

export interface SetupValues {
  playerCount: number;
  handSize: number;
  jokerCount: number;
  names: string[];
  handoff: boolean;
  rules: RuleSettings;
}

export type PlayMode = "local" | "online";

interface SetupScreenProps {
  mode: PlayMode;
  onModeChange: (mode: PlayMode) => void;
  /** オンライン対戦タブの中身。 */
  onlinePanel: ReactNode;
  values: SetupValues;
  error: string;
  onChange: (values: SetupValues) => void;
  onStart: () => void;
}

const heroCards: Card[] = [
  { id: "hero-1", suit: "S", rank: 14, isJoker: false },
  { id: "hero-2", suit: "H", rank: 15, isJoker: false },
  { id: "hero-3", suit: null, rank: null, isJoker: true },
  { id: "hero-4", suit: "D", rank: 8, isJoker: false },
  { id: "hero-5", suit: "C", rank: 3, isJoker: false },
];

const specialRules = ruleDefinitions.filter((rule) => !rule.isOption);
const jokerOption = ruleDefinitions.find((rule) => rule.key === "jokerAsEffectCard")!;

/** 特殊ルールの有効・無効を切り替える。 */
export function RuleToggles({ rules, onChange }: { rules: RuleSettings; onChange: (rules: RuleSettings) => void }) {
  const { enabled, total } = enabledRuleCount(rules);
  const isDefault = ruleDefinitions.every((rule) => rules[rule.key] === defaultRules[rule.key]);
  const labelId = useId();
  return (
    <div className="rule-toggles">
      <div className="rule-toggles-head">
        <span className="rule-toggles-label" id={labelId}>特殊ルール（{enabled}/{total} 有効）</span>
        {!isDefault && <button type="button" onClick={() => onChange({ ...defaultRules })}>既定に戻す</button>}
      </div>
      <div className="rule-chips" role="group" aria-labelledby={labelId}>
        {specialRules.map((rule) => (
          <button
            key={rule.key}
            type="button"
            className={`rule-chip${rules[rule.key] ? " is-on" : ""}`}
            aria-pressed={rules[rule.key]}
            title={rule.body}
            onClick={() => onChange({ ...rules, [rule.key]: !rules[rule.key] })}
          >
            <span className="rule-key" aria-hidden="true">{rule.mark}</span>
            <span>{rule.title}</span>
          </button>
        ))}
      </div>
      <label className="toggle">
        <input type="checkbox" checked={rules.jokerAsEffectCard} onChange={(event) => onChange({ ...rules, jokerAsEffectCard: event.target.checked })} />
        <span className="toggle-track" aria-hidden="true"><span /></span>
        <span className="toggle-text">
          <strong>{jokerOption.title}</strong>
          <small>{jokerOption.body}</small>
        </span>
      </label>
    </div>
  );
}

/** ホスト以外に見せる、ルール設定の一覧。 */
export function RuleSummary({ rules }: { rules: RuleSettings }) {
  return (
    <div className="rule-summary" aria-label="特殊ルール">
      {ruleDefinitions.map((rule) => (
        <span key={rule.key} className={rules[rule.key] ? "" : "is-off"}>
          {rule.isOption ? (rules[rule.key] ? "ジョーカーも役カードに数える" : "ジョーカーは役カードに数えない") : rule.title}
        </span>
      ))}
    </div>
  );
}

export function Segmented({
  label,
  options,
  value,
  unit,
  onChange,
  isDisabled,
}: {
  label: string;
  options: number[];
  value: number;
  unit: string;
  onChange: (value: number) => void;
  isDisabled?: (value: number) => boolean;
}) {
  return (
    <fieldset className="field">
      <legend>{label}</legend>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={option === value}
            className={option === value ? "is-active" : ""}
            disabled={isDisabled?.(option)}
            onClick={() => onChange(option)}
          >
            <strong>{option}</strong>
            <span>{unit}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function SetupScreen({ mode, onModeChange, onlinePanel, values, error, onChange, onStart }: SetupScreenProps) {
  const update = (patch: Partial<SetupValues>) => onChange({ ...values, ...patch });

  return (
    <div className={`setup${mode === "online" ? " is-wide" : ""}`}>
      <section className="hero">
        <div className="hero-fan" aria-hidden="true">
          {heroCards.map((card, index) => (
            <PlayingCard
              key={card.id}
              card={card}
              size="lg"
              showTag={false}
              style={{ "--i": index - 2 } as CSSProperties}
            />
          ))}
        </div>
        <p className="eyebrow">ONLINE &amp; LOCAL · PROTOTYPE</p>
        <h1 className="brand-title">Draw <em>大富豪</em></h1>
        <p className="hero-lead">パスしたら、1枚引く。<br />増えた手札が、次の一手を変える。</p>
      </section>

      <div className="mode-tabs" role="tablist" aria-label="遊び方">
        <button type="button" role="tab" aria-selected={mode === "local"} className={mode === "local" ? "is-active" : ""} onClick={() => onModeChange("local")}>
          <strong>この端末で遊ぶ</strong>
          <span>1台を回して対戦</span>
        </button>
        <button type="button" role="tab" aria-selected={mode === "online"} className={mode === "online" ? "is-active" : ""} onClick={() => onModeChange("online")}>
          <strong>オンライン対戦</strong>
          <span>それぞれの端末から参加</span>
        </button>
      </div>

      {mode === "online" ? onlinePanel : (
      <form
        className="setup-card"
        onSubmit={(event) => {
          event.preventDefault();
          onStart();
        }}
      >
        <div className="setup-grid">
          <Segmented label="プレイヤー" options={[2, 3, 4, 5]} unit="人" value={values.playerCount} onChange={(playerCount) => update({ playerCount })} />
          <Segmented label="初期手札" options={[5, 6, 7]} unit="枚" value={values.handSize} onChange={(handSize) => update({ handSize })} />
          <Segmented label="ジョーカー" options={[0, 1, 2]} unit="枚" value={values.jokerCount} onChange={(jokerCount) => update({ jokerCount })} />
        </div>

        <RuleToggles rules={values.rules} onChange={(rules) => update({ rules })} />

        <fieldset className="field">
          <legend>プレイヤー名</legend>
          <div className="name-grid">
            {Array.from({ length: values.playerCount }, (_, index) => (
              <label className="name-input" key={index}>
                <span className="avatar avatar-sm" style={{ "--hue": seatHue(index) } as CSSProperties}>{index + 1}</span>
                <input
                  value={values.names[index] ?? ""}
                  maxLength={12}
                  placeholder={`プレイヤー${index + 1}`}
                  aria-label={`プレイヤー${index + 1}の名前`}
                  onChange={(event) => {
                    const names = [...values.names];
                    names[index] = event.target.value;
                    update({ names });
                  }}
                />
              </label>
            ))}
          </div>
        </fieldset>

        <label className="toggle">
          <input type="checkbox" checked={values.handoff} onChange={(event) => update({ handoff: event.target.checked })} />
          <span className="toggle-track" aria-hidden="true"><span /></span>
          <span className="toggle-text">
            <strong>受け渡し画面を表示</strong>
            <small>手番が変わるたびに手札を隠し、次の人へ端末を渡せるようにします。</small>
          </span>
        </label>

        <button className="btn btn-primary btn-xl" type="submit">ゲームを始める</button>
        {error && <p className="form-error" role="alert">{error}</p>}
        <p className="fine-print">カード情報はこのブラウザ内だけで処理され、サーバーには送信されません。</p>
      </form>
      )}

      <details className="rules">
        <summary>
          <span>ルールを確認する</span>
          <small>{specialRules.length}つの特殊ルール</small>
        </summary>
        <RuleList />
      </details>
    </div>
  );
}
