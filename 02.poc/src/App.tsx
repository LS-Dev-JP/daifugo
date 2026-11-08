import { useState } from "react";
import { defaultRules, parseRules } from "./game/rules";
import { LocalGame } from "./components/LocalGame";
import { OnlineEntry, OnlineRoom } from "./components/OnlineRoom";
import { SetupScreen, type PlayMode, type SetupValues } from "./components/SetupScreen";
import { useOnline } from "./online/useOnline";

const settingsKey = "draw-daifugo:settings";
const defaultSettings: SetupValues = { playerCount: 4, handSize: 7, jokerCount: 2, names: [], handoff: true, rules: defaultRules };

function loadSettings(): SetupValues {
  try {
    const raw = localStorage.getItem(settingsKey);
    if (!raw) return defaultSettings;
    const saved = JSON.parse(raw) as Partial<SetupValues>;
    // 以前のバージョンで保存した設定にはルールがないため、既定値で補う。
    return { ...defaultSettings, ...saved, rules: parseRules(saved.rules) ?? defaultRules };
  } catch {
    return defaultSettings;
  }
}

function saveSettings(values: SetupValues): void {
  try {
    localStorage.setItem(settingsKey, JSON.stringify(values));
  } catch {
    // 保存できない環境では設定の記憶を省略する。
  }
}

function initialMode(): PlayMode {
  return new URLSearchParams(window.location.search).has("room") ? "online" : "local";
}

function App() {
  const online = useOnline();
  const [mode, setMode] = useState<PlayMode>(initialMode);
  const [settings, setSettings] = useState<SetupValues>(loadSettings);
  const [localSession, setLocalSession] = useState<number | null>(null);
  const [setupError, setSetupError] = useState("");

  if (online.room) return <OnlineRoom online={online} />;

  if (localSession !== null) {
    return <LocalGame key={localSession} settings={settings} onExit={() => setLocalSession(null)} />;
  }

  return (
    <main className="app-shell is-setup">
      <SetupScreen
        mode={online.hasSession ? "online" : mode}
        onModeChange={setMode}
        onlinePanel={<OnlineEntry online={online} />}
        values={settings}
        error={setupError}
        onChange={setSettings}
        onStart={() => {
          if (settings.playerCount < 2 || settings.playerCount > 5) {
            setSetupError("プレイヤー数は2～5人で指定してください。");
            return;
          }
          saveSettings(settings);
          setSetupError("");
          setLocalSession(Date.now());
        }}
      />
      <footer className="footer">Draw Daifugo · PoC</footer>
    </main>
  );
}

export default App;
