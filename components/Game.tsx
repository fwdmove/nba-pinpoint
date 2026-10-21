"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// [bbrefId, displayName, nbaPersonId (0 = unknown)]
type Player = [string, string, number];
type Group = "season" | "career" | "playoffs";
type CatMeta = { id: string; t: string; s: string; g: Group; u: string; d: number; y: string | null };
// rows: [playerIndex, rank, value], sorted by rank
type Category = CatMeta & { r: [number, number, number][] };
type Phase = "loading" | "playing" | "lifeline" | "over" | "won";
type Miss = { p: number; rank: number | null; value: number | null; lifeline?: boolean };
type Feedback = { kind: "good" | "bad" | "info"; text: string } | null;
type Filter = "all" | Group;

const LIVES = 3;
const LIFELINE_MIN = 90;
const LIFELINE_MAX = 100;

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "season", label: "Single season" },
  { key: "career", label: "Career" },
  { key: "playoffs", label: "Playoffs" },
];

function normalize(s: string) {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.'’\-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatValue(v: number, d: number, unit: string) {
  if (unit.endsWith("%") && d === 3 && v <= 1) return (v * 100).toFixed(1) + "%";
  return v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}

function initials(name: string) {
  return name
    .replace(/\(.*\)/, "")
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("");
}

function Headshot({ player, size = 48 }: { player: Player; size?: number }) {
  const [id, name, nbaId] = player;
  const sources = useMemo(
    () =>
      [
        nbaId ? `https://cdn.nba.com/headshots/nba/latest/260x190/${nbaId}.png` : null,
        `https://www.basketball-reference.com/req/202106291/images/headshots/${id}.jpg`,
      ].filter(Boolean) as string[],
    [id, nbaId],
  );
  const [idx, setIdx] = useState(0);
  if (idx >= sources.length) {
    return (
      <span className="avatar avatar-fallback" style={{ width: size, height: size }} aria-hidden>
        {initials(name)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="avatar"
      src={sources[idx]}
      alt=""
      width={size}
      height={size}
      referrerPolicy="no-referrer"
      onError={() => setIdx((i) => i + 1)}
      loading="lazy"
    />
  );
}

function readBest(): number {
  try {
    return Number(localStorage.getItem("pinpoint-best") || 0);
  } catch {
    return 0;
  }
}

function writeBest(n: number) {
  try {
    localStorage.setItem("pinpoint-best", String(n));
  } catch {}
}

export default function Game() {
  const router = useRouter();
  const params = useSearchParams();

  const [players, setPlayers] = useState<Player[] | null>(null);
  const [cats, setCats] = useState<CatMeta[] | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [cat, setCat] = useState<Category | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [found, setFound] = useState<Set<number>>(new Set());
  const [misses, setMisses] = useState<Miss[]>([]);
  const [lives, setLives] = useState(LIVES);
  const [score, setScore] = useState(0);
  const [lifelineUsed, setLifelineUsed] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [lastFound, setLastFound] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [hi, setHi] = useState(0);
  const [best, setBest] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setBest(readBest());
    Promise.all([
      fetch("/data/players.json").then((r) => r.json()),
      fetch("/data/categories.json").then((r) => r.json()),
    ]).then(([p, c]) => {
      setPlayers(p);
      setCats(c);
    });
  }, []);

  const searchIndex = useMemo(
    () => (players ? players.map((p) => normalize(p[1].replace(/\(.*\)/, ""))) : []),
    [players],
  );

  const loadCategory = useCallback(
    async (id: string) => {
      setPhase("loading");
      const res = await fetch(`/data/c/${id}.json`);
      if (!res.ok) throw new Error("missing category");
      const data: Category = await res.json();
      setCat(data);
      setFound(new Set());
      setMisses([]);
      setLives(LIVES);
      setScore(0);
      setLifelineUsed(false);
      setFeedback(null);
      setLastFound(null);
      setQuery("");
      setPhase("playing");
      router.replace(`/?c=${id}`, { scroll: false });
      requestAnimationFrame(() => inputRef.current?.focus());
    },
    [router],
  );

  const randomCategory = useCallback(
    (f: Filter = filter) => {
      if (!cats) return;
      const pool = cats.filter((c) => (f === "all" || c.g === f) && c.id !== cat?.id);
      const pick = pool[Math.floor(Math.random() * pool.length)];
      loadCategory(pick.id);
    },
    [cats, cat, filter, loadCategory],
  );

  // first load: category from the URL (shareable) or a random one
  const booted = useRef(false);
  useEffect(() => {
    if (!cats || booted.current) return;
    booted.current = true;
    const wanted = params.get("c");
    if (wanted && cats.some((c) => c.id === wanted)) loadCategory(wanted);
    else randomCategory("all");
  }, [cats, params, loadCategory, randomCategory]);

  const rowByPlayer = useMemo(() => {
    const m = new Map<number, [number, number, number]>();
    cat?.r.forEach((row) => m.set(row[0], row));
    return m;
  }, [cat]);
  const topRows = useMemo(() => (cat ? cat.r.filter((r) => r[1] <= 100) : []), [cat]);
  const guessed = useMemo(() => {
    const s = new Set(found);
    misses.forEach((m) => s.add(m.p));
    return s;
  }, [found, misses]);

  const suggestions = useMemo(() => {
    const q = normalize(query);
    if (!players || q.length < 2) return [];
    const scored: { i: number; s: number }[] = [];
    for (let i = 0; i < searchIndex.length; i++) {
      const n = searchIndex[i];
      let s = -1;
      if (n.startsWith(q)) s = 0;
      else if (n.split(" ").some((w) => w.startsWith(q))) s = 1;
      else if (n.includes(q)) s = 2;
      if (s >= 0) scored.push({ i, s });
    }
    scored.sort((a, b) => a.s - b.s || searchIndex[a.i].localeCompare(searchIndex[b.i]));
    return scored.slice(0, 8).map((x) => x.i);
  }, [query, players, searchIndex]);

  useEffect(() => setHi(0), [query]);

  const finish = useCallback(
    (finalScore: number, nextPhase: "over" | "won") => {
      setPhase(nextPhase);
      if (finalScore > best) {
        setBest(finalScore);
        writeBest(finalScore);
      }
    },
    [best],
  );

  const guess = useCallback(
    (p: number) => {
      if (!cat || !players || (phase !== "playing" && phase !== "lifeline")) return;
      setQuery("");
      const name = players[p][1];
      if (guessed.has(p)) {
        setFeedback({ kind: "info", text: `You already guessed ${name}.` });
        return;
      }
      const row = rowByPlayer.get(p);
      const rank = row ? row[1] : null;
      const value = row ? row[2] : null;
      const where = rank
        ? `${name} is ranked #${rank} (${formatValue(value!, cat.d, cat.u)} ${cat.u}).`
        : `${name} isn't in the top ${cat.r.length}.`;

      if (phase === "lifeline") {
        if (rank !== null && rank >= LIFELINE_MIN && rank <= LIFELINE_MAX) {
          const next = new Set(found).add(p);
          setFound(next);
          setLastFound(p);
          setScore((s) => s + rank);
          setLives(1);
          setLifelineUsed(true);
          setFeedback({ kind: "good", text: `Lifeline hit! ${name} is #${rank}. +${rank} pts and one life back.` });
          if (next.size === topRows.length) finish(score + rank, "won");
          else setPhase("playing");
        } else {
          setMisses((m) => [...m, { p, rank, value, lifeline: true }]);
          setFeedback({ kind: "bad", text: `Lifeline missed. ${where}` });
          finish(score, "over");
        }
        return;
      }

      if (rank !== null && rank <= 100) {
        const next = new Set(found).add(p);
        setFound(next);
        setLastFound(p);
        setScore((s) => s + rank);
        setFeedback({ kind: "good", text: `${name}: #${rank}! +${rank} pts` });
        if (next.size === topRows.length) finish(score + rank, "won");
        return;
      }

      setMisses((m) => [...m, { p, rank, value }]);
      const left = lives - 1;
      setLives(left);
      if (left > 0) {
        setFeedback({ kind: "bad", text: `Not top 100. ${where}` });
      } else if (!lifelineUsed) {
        setFeedback({ kind: "bad", text: `Out of lives. ${where}` });
        setPhase("lifeline");
      } else {
        setFeedback({ kind: "bad", text: `Game over. ${where}` });
        finish(score, "over");
      }
    },
    [cat, players, phase, guessed, rowByPlayer, found, topRows, score, lives, lifelineUsed, finish],
  );

  const giveUp = () => {
    if (phase === "playing" || phase === "lifeline") {
      setFeedback({ kind: "info", text: "Here's the full list." });
      finish(score, "over");
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHi((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (suggestions.length) guess(suggestions[hi]);
      else if (query.trim()) setFeedback({ kind: "info", text: `No player matches "${query.trim()}". No life lost.` });
    } else if (e.key === "Escape") {
      setQuery("");
    }
  };

  const share = async () => {
    if (!cat) return;
    const hearts = "🏀".repeat(lives) + "▫️".repeat(Math.max(0, LIVES - lives));
    const text = `NBA Pinpoint — ${cat.t} (${cat.s.split(" · ")[0]})\n${found.size}/${topRows.length} found · ${score} pts ${hearts}\n${location.origin}/?c=${cat.id}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  const active = phase === "playing" || phase === "lifeline";
  const ended = phase === "over" || phase === "won";
  const maxScore = useMemo(() => topRows.reduce((a, r) => a + r[1], 0), [topRows]);

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden>
            <svg viewBox="0 0 64 64" width="34" height="34">
              <circle cx="32" cy="32" r="28" fill="var(--orange)" />
              <path d="M4 32h56M32 4v56M12 12c10 10 10 30 0 40M52 12c-10 10-10 30 0 40" stroke="#1a0d05" strokeWidth="3" fill="none" />
              <circle cx="32" cy="32" r="9" fill="var(--bg)" stroke="#fff" strokeWidth="3" />
              <circle cx="32" cy="32" r="3" fill="#fff" />
            </svg>
          </span>
          <h1>NBA Pinpoint</h1>
        </div>
        <div className="top-actions">
          <button className="ghost" onClick={() => setShowHelp((s) => !s)} aria-expanded={showHelp}>
            How to play
          </button>
          <span className="best">Best {best}</span>
        </div>
      </header>

      {showHelp && (
        <section className="help">
          <p>
            You get a random NBA stat category. Name as many of its <b>top 100</b> players as you can.
          </p>
          <ul>
            <li>A correct guess reveals the player and scores <b>points equal to their rank</b>: #100 is worth 100, #1 is worth 1. Deep cuts pay.</li>
            <li>A wrong guess costs one of your <b>3 lives</b> and tells you where that player actually ranked.</li>
            <li>Lose all three and you get one <b>lifeline</b>: name a player ranked <b>#90–#100</b> to earn a life back. Miss it and the game ends.</li>
          </ul>
        </section>
      )}

      <section className="category-bar">
        <div className="filters" role="tablist">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              role="tab"
              aria-selected={filter === f.key}
              className={filter === f.key ? "chip on" : "chip"}
              onClick={() => {
                setFilter(f.key);
                randomCategory(f.key);
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="cat-count">{cats ? `${cats.length.toLocaleString()} categories` : ""}</span>
      </section>

      {cat && (
        <section className="category">
          <div className="cat-text">
            <span className="cat-tag">{cat.g === "season" ? cat.y : cat.g === "career" ? "Career" : "Playoffs"}</span>
            <h2>{cat.t}</h2>
            <p>{cat.s} · top 100</p>
          </div>
          <button className="primary" onClick={() => randomCategory()}>
            New category ↻
          </button>
        </section>
      )}

      <section className={`hud ${phase === "lifeline" ? "hud-lifeline" : ""}`}>
        <div className="stat">
          <span className="label">Lives</span>
          <span className="lives" aria-label={`${lives} lives left`}>
            {Array.from({ length: LIVES }, (_, i) => (
              <span key={i} className={i < lives ? "ball" : "ball lost"} />
            ))}
          </span>
        </div>
        <div className="stat">
          <span className="label">Score</span>
          <span className="value">{score}</span>
        </div>
        <div className="stat">
          <span className="label">Found</span>
          <span className="value">
            {found.size}
            <small>/{topRows.length || 100}</small>
          </span>
        </div>
        <div className="stat">
          <span className="label">Lifeline</span>
          <span className={`value small ${lifelineUsed ? "dim" : ""}`}>
            {lifelineUsed ? "Used" : phase === "lifeline" ? "LIVE" : "Ready"}
          </span>
        </div>
      </section>

      {phase === "lifeline" && (
        <div className="lifeline-banner" role="alert">
          <b>LIFELINE:</b> name a player ranked <b>#90–#100</b> to get a life back. Anything else ends the game.
        </div>
      )}

      <section className="guess">
        <div className="combo">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={
              !active ? "Game over, start a new category" : phase === "lifeline" ? "Lifeline guess: rank #90–#100…" : "Type a player name…"
            }
            disabled={!active}
            aria-label="Guess a player"
            aria-autocomplete="list"
            aria-controls="suggestions"
            autoComplete="off"
            spellCheck={false}
          />
          {suggestions.length > 0 && active && (
            <ul id="suggestions" className="suggestions" role="listbox">
              {suggestions.map((p, i) => (
                <li
                  key={p}
                  role="option"
                  aria-selected={i === hi}
                  className={`${i === hi ? "hi" : ""} ${guessed.has(p) ? "used" : ""}`}
                  onMouseEnter={() => setHi(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    guess(p);
                  }}
                >
                  {players![p][1]}
                  {guessed.has(p) && <span className="tag">guessed</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
        {active && (
          <button className="ghost" onClick={giveUp}>
            Give up
          </button>
        )}
      </section>

      {feedback && (
        <div className={`feedback ${feedback.kind}`} role="status" aria-live="polite">
          {feedback.text}
        </div>
      )}

      {ended && cat && (
        <section className={`result ${phase}`}>
          <div>
            <h3>{phase === "won" ? "Perfect board!" : "Final"}</h3>
            <p>
              <b>{score}</b> pts · {found.size}/{topRows.length} found · max possible {maxScore.toLocaleString()}
            </p>
          </div>
          <div className="result-actions">
            <button className="ghost" onClick={share}>
              {copied ? "Copied!" : "Share"}
            </button>
            <button className="ghost" onClick={() => loadCategory(cat.id)}>
              Retry
            </button>
            <button className="primary" onClick={() => randomCategory()}>
              Next category
            </button>
          </div>
        </section>
      )}

      {misses.length > 0 && players && cat && (
        <section className="misses">
          <h4>Misses</h4>
          <ul>
            {misses.map((m) => (
              <li key={m.p}>
                <span className="x">✕</span>
                {players[m.p][1]}
                <span className="miss-rank">
                  {m.rank ? `#${m.rank} · ${formatValue(m.value!, cat.d, cat.u)}` : `not top ${cat.r.length}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {phase === "loading" && <div className="loading">Loading…</div>}

      {cat && players && phase !== "loading" && (
        <ol className="board">
          {topRows.map(([p, rank, value]) => {
            const isFound = found.has(p);
            const show = isFound || ended;
            const lifeZone = rank >= LIFELINE_MIN && rank <= LIFELINE_MAX;
            return (
              <li
                key={p}
                className={`slot ${isFound ? "found" : ""} ${show && !isFound ? "revealed" : ""} ${lastFound === p ? "pop" : ""} ${
                  phase === "lifeline" && lifeZone && !isFound ? "zone" : ""
                }`}
              >
                <span className="rank">{rank}</span>
                {show ? (
                  <>
                    <Headshot player={players[p]} size={40} />
                    <span className="who">
                      <span className="name">{players[p][1]}</span>
                      <span className="val">
                        {formatValue(value, cat.d, cat.u)} {cat.u}
                      </span>
                    </span>
                  </>
                ) : (
                  <span className="hidden-slot" aria-label="hidden">
                    <span className="q">?</span>
                    <span className="bar" />
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      )}

      <footer className="foot">
        Data: Basketball-Reference (2001-02 to 2025-26 seasons, all-time career and playoff leaders). Not affiliated with the NBA.
      </footer>
    </main>
  );
}
