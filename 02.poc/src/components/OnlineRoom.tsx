import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { GameEvent } from "../game/types";
import { minSeats, viewToState, type RoomSettings, type RoomSummary } from "../online/protocol";
import type { OnlineApi } from "../online/useOnline";
import { GameBoard } from "./GameBoard";
import { Segmented } from "./SetupScreen";
import { avatarText, seatHue } from "./theme";

const nameKey = "draw-daifugo:online-name";

function loadName(): string {
  try {
    return localStorage.getItem(nameKey) ?? "";
  } catch {
    return "";
  }
}

function saveName(name: string): void {
  try {
    localStorage.setItem(nameKey, name);
  } catch {
    // 保存できない環境では省略する。
  }
}

function inviteUrl(code: string): string {
  const url = new URL(window.location.href);
  url.search = `?room=${code}`;
  url.hash = "";
  return url.toString();
}

function Toggle({ checked, onChange, title, description }: { checked: boolean; onChange: (checked: boolean) => void; title: string; description: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="toggle-track" aria-hidden="true"><span /></span>
      <span className="toggle-text">
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
    </label>
  );
}

/** 募集人数に対する参加状況を、席の丸で表す。 */
function CapacityMeter({ members, capacity }: { members: number; capacity: number }) {
  return (
    <span className="capacity" aria-label={`${capacity}人中${members}人参加`}>
      <span className="capacity-dots" aria-hidden="true">
        {Array.from({ length: capacity }, (_, index) => <span key={index} className={index < members ? "is-filled" : ""} />)}
      </span>
      <span className="capacity-text"><strong>{members}</strong>/{capacity}人</span>
    </span>
  );
}

function RoomRow({ room, onJoin, disabled }: { room: RoomSummary; onJoin: () => void; disabled: boolean }) {
  const remaining = room.capacity - room.members.length;
  return (
    <li className="room-row">
      <div className="room-row-number">
        <small>No.</small>
        <strong>{room.code}</strong>
      </div>
      <div className="room-row-body">
        <div className="room-row-title">
          <span className="room-row-host">{room.hostName}のルーム</span>
          {remaining === 1 && <span className="room-row-hot">あと1人</span>}
        </div>
        <div className="room-row-members" aria-label={`参加者: ${room.members.join("、")}`}>
          {room.members.map((member, index) => (
            <span key={`${member}-${index}`} className="avatar avatar-sm" style={{ "--hue": seatHue(index) } as CSSProperties} title={member}>
              {avatarText(member, -1)}
            </span>
          ))}
          <span className="room-row-rules">手札{room.handSize}枚・ジョーカー{room.jokerCount}枚</span>
        </div>
      </div>
      <CapacityMeter members={room.members.length} capacity={room.capacity} />
      <button type="button" className="btn btn-primary btn-sm room-row-join" onClick={onJoin} disabled={disabled}>参加</button>
    </li>
  );
}

/** トップ画面の「オンライン対戦」タブ。募集一覧・ルーム作成・番号で参加。 */
export function OnlineEntry({ online }: { online: OnlineApi }) {
  const [name, setName] = useState(loadName);
  const [code, setCode] = useState(() => new URLSearchParams(window.location.search).get("room")?.replace(/\D/g, "").slice(0, 4) ?? "");
  const [settings, setSettings] = useState<RoomSettings>({ capacity: 4, handSize: 7, jokerCount: 2, isPublic: true });
  const [nameError, setNameError] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const busy = online.status === "connecting" || (online.hasSession && !online.room);
  const trimmed = name.trim();
  const { watchRooms } = online;

  useEffect(() => {
    watchRooms(true);
    return () => watchRooms(false);
  }, [watchRooms]);

  function requireName(): boolean {
    if (trimmed) {
      saveName(trimmed);
      setNameError(false);
      return true;
    }
    setNameError(true);
    nameRef.current?.focus();
    return false;
  }

  function joinRoom(roomCode: string) {
    if (!requireName()) return;
    online.send({ type: "join", code: roomCode, name: trimmed });
  }

  const rooms = online.openRooms;

  return (
    <div className="online-hub">
      <div className="setup-card online-name">
        <label className={`text-field${nameError ? " is-invalid" : ""}`}>
          <span>あなたの名前</span>
          <input
            ref={nameRef}
            value={name}
            maxLength={12}
            placeholder="例：たろう"
            autoComplete="nickname"
            aria-invalid={nameError}
            onChange={(event) => {
              setName(event.target.value);
              if (event.target.value.trim()) setNameError(false);
            }}
          />
        </label>
        {nameError && <p className="form-error" role="alert">参加する前に名前を入力してください。</p>}
      </div>

      <div className="online-grid">
        <section className="setup-card room-board" aria-labelledby="room-board-title">
          <header className="room-board-head">
            <div>
              <h3 id="room-board-title">募集中のルーム</h3>
              <p>参加人数がそろうと自動でゲームが始まります。</p>
            </div>
            <span className={`live-badge${online.status === "open" ? " is-live" : ""}`}>
              <span aria-hidden="true" />{online.status === "open" ? "LIVE" : "接続中"}
            </span>
          </header>

          {rooms === null ? (
            <div className="room-board-empty"><span className="spinner" aria-hidden="true" />募集一覧を読み込んでいます…</div>
          ) : rooms.length === 0 ? (
            <div className="room-board-empty">
              <strong>募集中のルームはありません</strong>
              <span>右の「ルームを作って募集」から募集を始めましょう。</span>
            </div>
          ) : (
            <ul className="room-list" aria-live="polite">
              {rooms.map((room) => <RoomRow key={room.code} room={room} disabled={busy} onJoin={() => joinRoom(room.code)} />)}
            </ul>
          )}
          {online.playingRooms > 0 && <p className="room-board-foot">現在 {online.playingRooms} ルームが対戦中です</p>}
        </section>

        <div className="online-side">
          <section className="setup-card online-option" aria-labelledby="online-create">
            <h3 id="online-create">ルームを作って募集</h3>
            <Segmented label="募集人数" options={[2, 3, 4, 5]} unit="人" value={settings.capacity} onChange={(capacity) => setSettings({ ...settings, capacity })} />
            <div className="setup-grid setup-grid-2">
              <Segmented label="初期手札" options={[5, 6, 7]} unit="枚" value={settings.handSize} onChange={(handSize) => setSettings({ ...settings, handSize })} />
              <Segmented label="ジョーカー" options={[0, 1, 2]} unit="枚" value={settings.jokerCount} onChange={(jokerCount) => setSettings({ ...settings, jokerCount })} />
            </div>
            <Toggle
              checked={settings.isPublic}
              onChange={(isPublic) => setSettings({ ...settings, isPublic })}
              title="募集一覧に公開"
              description={settings.isPublic ? "誰でも一覧から参加できます。" : "ルーム番号を知っている人だけが参加できます。"}
            />
            <button type="button" className="btn btn-primary btn-xl" disabled={busy} onClick={() => {
              if (requireName()) online.send({ type: "create", name: trimmed, settings });
            }}>
              {settings.capacity}人で募集を始める
            </button>
          </section>

          <form
            className="setup-card online-option"
            aria-labelledby="online-join"
            onSubmit={(event) => {
              event.preventDefault();
              if (code.length === 4) joinRoom(code);
            }}
          >
            <h3 id="online-join">ルーム番号で参加</h3>
            <div className="code-join">
              <input
                className="code-input"
                value={code}
                maxLength={4}
                placeholder="0000"
                aria-label="ルーム番号（4桁）"
                inputMode="numeric"
                autoComplete="off"
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 4))}
              />
              <button type="submit" className="btn btn-secondary" disabled={code.length !== 4 || busy}>参加</button>
            </div>
          </form>
        </div>
      </div>

      {busy && <p className="fine-print">{online.hasSession ? "前回のルームに再接続しています…" : "サーバーに接続しています…"}</p>}
      {online.error && <p className="form-error form-error-center" role="alert">{online.error}</p>}
      <p className="fine-print">手札はサーバーで管理され、ほかのプレイヤーには送られません。</p>
    </div>
  );
}

function ConnectionBanner({ online }: { online: OnlineApi }) {
  if (online.status !== "reconnecting" && online.status !== "connecting") return null;
  return <div className="conn-banner" role="status">接続が切れました。再接続しています…</div>;
}

/** サーバーから受け取った残り時間をもとに、手元で秒数を数える。 */
function useCountdown(startsInMs: number | null, version: number): number | null {
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setDeadline(startsInMs === null ? null : Date.now() + startsInMs);
  }, [startsInMs, version]);
  useEffect(() => {
    if (deadline === null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(timer);
  }, [deadline]);
  return deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000));
}

/** ルームに参加している間の画面（ロビー・対戦・結果）。 */
export function OnlineRoom({ online }: { online: OnlineApi }) {
  const room = online.room!;
  const isHost = room.hostSeat === room.mySeat;
  const [selected, setSelected] = useState<string[]>([]);
  const [freshIds, setFreshIds] = useState<string[]>([]);
  const [burst, setBurst] = useState<{ key: number; events: GameEvent[] } | null>(null);
  const [copied, setCopied] = useState(false);
  const previousHand = useRef<Set<string> | null>(null);
  const game = useMemo(() => (room.game ? viewToState(room.game, room.mySeat) : null), [room]);
  const handKey = room.game?.myHand.map((card) => card.id).join("|") ?? "";
  const secondsLeft = useCountdown(room.startsInMs, room.version);

  // 手札が変わったら選択を整理し、新しく加わったカード（ドロー・7渡しで受け取り）を強調する。
  useEffect(() => {
    const hand = room.game?.myHand ?? [];
    const ids = new Set(hand.map((card) => card.id));
    setSelected((current) => current.filter((id) => ids.has(id)));
    const before = previousHand.current;
    setFreshIds(before ? hand.filter((card) => !before.has(card.id)).map((card) => card.id) : []);
    previousHand.current = room.game ? ids : null;
  }, [handKey]);

  useEffect(() => {
    if (room.game && room.game.events.length > 0) setBurst({ key: room.version, events: room.game.events });
  }, [room.version, room.game]);

  // 手番・フェーズが変わったら選択をリセットする。
  useEffect(() => {
    setSelected([]);
  }, [room.game?.currentPlayerIndex, room.game?.phase]);

  function leave() {
    const playing = room.status === "playing";
    if (playing && !window.confirm("ルームを退出しますか？\n退出後、あなたの手番は自動でパスされます。")) return;
    online.leave();
  }

  function changeSettings(patch: Partial<RoomSettings>) {
    online.send({ type: "settings", settings: { ...room.settings, ...patch } });
  }

  if (room.status === "lobby" || !game) {
    const members = room.seats.length;
    const connectedCount = room.seats.filter((seat) => seat.connected).length;
    const remaining = Math.max(0, room.settings.capacity - members);
    return (
      <main className="app-shell is-setup">
        <ConnectionBanner online={online} />
        <div className="lobby">
          <header className="lobby-header">
            <p className="eyebrow">ROOM No.</p>
            <div className="room-code" aria-label={`ルーム番号 ${room.code}`}>
              {Array.from(room.code).map((char, index) => <span key={index}>{char}</span>)}
            </div>
            <div className="lobby-share">
              <span className={`visibility-chip${room.settings.isPublic ? " is-public" : ""}`}>
                {room.settings.isPublic ? "募集一覧に公開中" : "非公開（番号で参加）"}
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  navigator.clipboard?.writeText(inviteUrl(room.code)).then(() => {
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1800);
                  }).catch(() => window.prompt("招待リンク", inviteUrl(room.code)));
                }}
              >
                {copied ? "コピーしました" : "招待リンクをコピー"}
              </button>
            </div>
          </header>

          <section className={`recruit-status${secondsLeft !== null ? " is-starting" : ""}`} aria-live="polite">
            {secondsLeft !== null ? (
              <>
                <span className="recruit-count" key={secondsLeft}>{secondsLeft}</span>
                <div>
                  <strong>メンバーがそろいました</strong>
                  <span>まもなくゲームが始まります</span>
                </div>
              </>
            ) : (
              <>
                <CapacityMeter members={members} capacity={room.settings.capacity} />
                <div>
                  <strong>あと{remaining}人で開始</strong>
                  <span>{room.settings.capacity}人そろうと自動でゲームが始まります</span>
                </div>
              </>
            )}
          </section>

          <section className="setup-card">
            <div className="lobby-section-head">
              <h2>参加者</h2>
              <span>{members} / {room.settings.capacity}人</span>
            </div>
            <ul className="lobby-seats">
              {room.seats.map((seat, index) => (
                <li key={`${seat.name}-${index}`} className={`lobby-seat${seat.connected ? "" : " is-offline"}`}>
                  <span className="avatar" style={{ "--hue": seatHue(index) } as CSSProperties}>{avatarText(seat.name, -1)}</span>
                  <span className="lobby-seat-name">{seat.name}</span>
                  {index === room.hostSeat && <span className="seat-badge is-turn">HOST</span>}
                  {index === room.mySeat && <span className="seat-badge is-me">YOU</span>}
                  {!seat.connected && <span className="seat-badge is-offline">切断中</span>}
                </li>
              ))}
              {Array.from({ length: remaining }, (_, index) => (
                <li key={`empty-${index}`} className="lobby-seat is-empty">
                  <span className="avatar avatar-empty" aria-hidden="true" />
                  <span className="lobby-seat-name">参加を待っています…</span>
                </li>
              ))}
            </ul>

            <div className="lobby-section-head">
              <h2>ルール設定</h2>
              {!isHost && <span>ホストが設定します</span>}
            </div>
            {isHost ? (
              <>
                <Segmented label="募集人数" options={[2, 3, 4, 5]} unit="人" value={room.settings.capacity}
                  isDisabled={(capacity) => capacity < members}
                  onChange={(capacity) => changeSettings({ capacity })} />
                <div className="setup-grid setup-grid-2">
                  <Segmented label="初期手札" options={[5, 6, 7]} unit="枚" value={room.settings.handSize}
                    onChange={(handSize) => changeSettings({ handSize })} />
                  <Segmented label="ジョーカー" options={[0, 1, 2]} unit="枚" value={room.settings.jokerCount}
                    onChange={(jokerCount) => changeSettings({ jokerCount })} />
                </div>
                <Toggle
                  checked={room.settings.isPublic}
                  onChange={(isPublic) => changeSettings({ isPublic })}
                  title="募集一覧に公開"
                  description={room.settings.isPublic ? "誰でも一覧から参加できます。" : "ルーム番号を知っている人だけが参加できます。"}
                />
                {secondsLeft === null && connectedCount >= minSeats && (
                  <button type="button" className="btn btn-secondary" onClick={() => online.send({ type: "start" })}>
                    待たずに今の{connectedCount}人で始める
                  </button>
                )}
              </>
            ) : (
              <p className="lobby-settings">
                募集 <strong>{room.settings.capacity}</strong>人 ・ 初期手札 <strong>{room.settings.handSize}</strong>枚 ・ ジョーカー <strong>{room.settings.jokerCount}</strong>枚
              </p>
            )}
            {online.error && <p className="form-error" role="alert">{online.error}</p>}
          </section>

          <button type="button" className="btn btn-ghost lobby-leave" onClick={leave}>ルームを退出</button>
        </div>
      </main>
    );
  }

  const canAct = room.status === "playing" && game.phase !== "finished" && game.currentPlayerIndex === room.mySeat;
  const connected = game.players.map((player) => room.seats.find((seat) => seat.name === player.name)?.connected ?? false);

  return (
    <GameBoard
      game={game}
      viewerIndex={room.mySeat}
      canAct={canAct}
      connected={connected}
      selected={selected}
      freshIds={freshIds}
      message={online.error}
      burst={burst}
      onExit={leave}
      topbarExtra={<span className="room-chip">ROOM <strong>{room.code}</strong></span>}
      alert={<ConnectionBanner online={online} />}
      onToggle={(cardId) => {
        online.clearError();
        setSelected((current) => current.includes(cardId) ? current.filter((id) => id !== cardId) : [...current, cardId]);
      }}
      onClear={() => { setSelected([]); online.clearError(); }}
      onPlay={() => online.send({ type: "play", cardIds: selected })}
      onPass={() => online.send({ type: "pass" })}
      onResolve={() => online.send({ type: "resolve", cardIds: selected })}
      resultActions={
        <>
          {isHost ? (
            <button type="button" className="btn btn-primary btn-xl" onClick={() => online.send({ type: "start" })} autoFocus>同じメンバーで再戦</button>
          ) : (
            <p className="lobby-waiting"><span className="status-dot" aria-hidden="true" />ホストの再戦開始を待っています</p>
          )}
          <button type="button" className="btn btn-secondary btn-xl" onClick={leave}>ルームを退出</button>
        </>
      }
    />
  );
}
