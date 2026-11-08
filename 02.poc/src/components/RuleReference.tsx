import { useEffect } from "react";
import { ruleDefinitions } from "../game/rules";
import type { RuleKey } from "../game/rules";
import type { RuleSettings } from "../game/types";

interface RuleItem {
  mark: string;
  title: string;
  body: string;
  /** ルール設定の対象。基本ルールは undefined。 */
  key?: RuleKey;
  isOption?: boolean;
}

const baseRules: RuleItem[] = [
  {
    mark: "DRAW", title: "パスで1枚ドロー",
    body: "パスすると山札から1枚引き、そのまま手札のどのカードでも出せます。出さずに終えると、場が流れるまでその場には参加できません（手番は飛ばされ、ドローもしません）。",
  },
];

const ruleItems: RuleItem[] = [
  ...baseRules,
  ...ruleDefinitions.map((rule) => ({ mark: rule.mark, title: rule.title, body: rule.body, key: rule.key, isOption: rule.isOption })),
  {
    mark: "⏱", title: "思考時間10秒（オンライン）",
    body: "手番ごとに10秒。過ぎるとパス（ドロー後にパス）し、7渡し・10捨ては弱いカードから自動で選びます。",
  },
];

/** ルールの一覧。rules を渡すと、そのゲームでの有効・無効も表示する。 */
export function RuleList({ rules, online = true }: { rules?: RuleSettings; online?: boolean }) {
  const items = online ? ruleItems : ruleItems.filter((item) => item.mark !== "⏱");
  return (
    <>
      <ul className="rule-list">
        {items.map((item) => {
          const off = rules !== undefined && item.key !== undefined && !rules[item.key];
          return (
            <li key={item.mark} className={off ? "is-off" : ""}>
              <span className="rule-key">{item.mark}</span>
              <div>
                <strong>
                  {item.title}
                  {rules && item.key && <span className={`rule-state${off ? " is-off" : ""}`}>{off ? "無効" : "有効"}</span>}
                </strong>
                <p>{item.body}</p>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="fine-print">強さは 3 &lt; 4 &lt; … &lt; K &lt; A &lt; 2 &lt; ジョーカー。革命と11バックが重なると元に戻ります。一部は未確定の暫定ルールです。</p>
    </>
  );
}

/** ゲーム中に開くルール確認ダイアログ。 */
export function RulesDialog({ rules, online, onClose }: { rules: RuleSettings; online: boolean; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="rules-dialog" role="dialog" aria-modal="true" aria-labelledby="rules-dialog-title" onClick={onClose}>
      <div className="rules-dialog-card" onClick={(event) => event.stopPropagation()}>
        <header className="rules-dialog-head">
          <h2 id="rules-dialog-title">このゲームのルール</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} autoFocus>閉じる</button>
        </header>
        <div className="rules-dialog-body">
          <RuleList rules={rules} online={online} />
        </div>
      </div>
    </div>
  );
}
