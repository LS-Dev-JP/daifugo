import type { CSSProperties, ReactNode } from "react";
import type { Card } from "../game/types";
import { PlayingCard } from "./PlayingCard";
import { seatHue } from "./theme";

export interface SetupValues {
  playerCount: number;
  handSize: number;
  jokerCount: number;
  names: string[];
  handoff: boolean;
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

const rules: Array<{ key: string; title: string; body: string }> = [
  { key: "DRAW", title: "パスで1枚ドロー", body: "パスすると山札から1枚引き、そのまま手札のどのカードでも出せます。出さずに終えることもできます。" },
  { key: "5", title: "5スキップ", body: "出した5の枚数だけ、次のプレイヤーを飛ばします。" },
  { key: "7", title: "7渡し", body: "出した7の枚数だけ、手札を次のプレイヤーに渡します。" },
  { key: "8", title: "8切り", body: "場を流し、出したプレイヤーから次の場を始めます。" },
  { key: "10", title: "10捨て", body: "出した10の枚数だけ、手札を捨てられます。" },
  { key: "J", title: "11バック", body: "場が流れるまで、カードの強さが逆転します。" },
  { key: "革", title: "革命", body: "同じ数字4枚、または4枚以上の階段で成立。強さが逆転し、場が流れても続きます。" },
  { key: "縛", title: "縛り", body: "前のプレイとスートが続くと縛りが成立し、場が流れるまでそのスートしか出せません。" },
  { key: "♠3", title: "スペ3返し", body: "ジョーカー1枚出しには、スペードの3だけが出せます。" },
  { key: "×", title: "上がり禁止", body: "スペ3・5・7・8・10・J・ジョーカーや革命では上がれません。" },
];

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
          <small>{rules.length}つの特殊ルール</small>
        </summary>
        <ul className="rule-list">
          {rules.map((rule) => (
            <li key={rule.key}>
              <span className="rule-key">{rule.key}</span>
              <div>
                <strong>{rule.title}</strong>
                <p>{rule.body}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="fine-print">強さは 3 &lt; 4 &lt; … &lt; K &lt; A &lt; 2 &lt; ジョーカー。革命と11バックが重なると元に戻ります。一部は未確定の暫定ルールです。</p>
      </details>
    </div>
  );
}
