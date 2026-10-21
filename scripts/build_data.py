"""Turn cached Basketball-Reference pages into the game's static JSON.

Usage: python scripts/build_data.py <cache_dir>
Writes public/data/players.json, public/data/categories.json and public/data/c/<id>.json.
Needs: beautifulsoup4, lxml, nba_api (only for its offline player list -> headshot ids).
"""
import json, math, os, re, shutil, sys, unicodedata
from bs4 import BeautifulSoup

CACHE = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "data")
MAX_ROWS = 400  # ranks kept per category so wrong guesses can show where a player landed

# ---------------------------------------------------------------- players
players = {}  # br_id -> name


def add_player(pid, name):
    name = re.sub(r"\s+", " ", name.replace("*", "")).strip()
    players.setdefault(pid, name)


def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[.'\-]", "", s)
    s = re.sub(r"\b(jr|sr|ii|iii|iv)\b", "", s)
    return re.sub(r"\s+", " ", s).strip()


# ---------------------------------------------------------------- ranking
def rank_rows(values, decimals):
    """values: list of (pid, value). Sorted desc, competition ranking (1,2,2,4)."""
    vals = [(p, round(v, decimals)) for p, v in values if v is not None]
    vals.sort(key=lambda x: -x[1])
    out, prev, rank = [], None, 0
    for i, (p, v) in enumerate(vals):
        if v != prev:
            rank, prev = i + 1, v
        out.append((p, rank, v))
    return out[:MAX_ROWS]


categories = []


def add_category(cid, title, sub, group, unit, decimals, rows, season=None):
    top = [r for r in rows if r[1] <= 100]
    if len(top) < 100:
        print(f"  skip {cid}: only {len(top)} ranked")
        return
    # a giant tie at the bottom makes a category unplayable
    if rows[99][2] == 0:
        print(f"  skip {cid}: zeros inside top 100")
        return
    categories.append({"id": cid, "t": title, "s": sub, "g": group, "u": unit, "d": decimals,
                       "y": season, "rows": rows})


# ---------------------------------------------------------------- season pages
def num(td):
    if td is None:
        return None
    t = td.get_text().strip().replace(",", "")
    if t == "":
        return None
    try:
        return float(t)
    except ValueError:
        return None


def season_rows(path, table_id):
    """One dict per player (combined row for traded players), keyed by data-stat."""
    soup = BeautifulSoup(open(path, encoding="utf-8").read(), "lxml")
    table = soup.find("table", id=table_id)
    if table is None:
        raise RuntimeError(f"no table {table_id} in {path}")
    seen, rows = set(), []
    for tr in table.find("tbody").find_all("tr"):
        if "thead" in (tr.get("class") or []):
            continue
        name_td = tr.find(attrs={"data-stat": "name_display"}) or tr.find(attrs={"data-stat": "player"})
        if name_td is None or not name_td.get("data-append-csv"):
            continue  # League Average etc.
        pid = name_td["data-append-csv"]
        if pid in seen:
            continue  # per-team rows after the combined 2TM/3TM row
        seen.add(pid)
        add_player(pid, name_td.get_text())
        cells = {td.get("data-stat"): td for td in tr.find_all(["td", "th"])}
        rows.append((pid, cells))
    return rows


def season_label(y):
    return f"{y-1}-{str(y)[2:]}"


# (data-stat, title, unit, decimals, kind) kind: total | pergame | pct:<attempt stat>:<min> | rate:<min mp>
TOTALS = [
    ("pts", "Most points", "PTS", 0, "total"),
    ("trb", "Most rebounds", "REB", 0, "total"),
    ("orb", "Most offensive rebounds", "OREB", 0, "total"),
    ("drb", "Most defensive rebounds", "DREB", 0, "total"),
    ("ast", "Most assists", "AST", 0, "total"),
    ("stl", "Most steals", "STL", 0, "total"),
    ("blk", "Most blocks", "BLK", 0, "total"),
    ("tov", "Most turnovers", "TOV", 0, "total"),
    ("pf", "Most personal fouls", "PF", 0, "total"),
    ("fg", "Most field goals made", "FGM", 0, "total"),
    ("fga", "Most field goals attempted", "FGA", 0, "total"),
    ("fg3", "Most three-pointers made", "3PM", 0, "total"),
    ("fg3a", "Most three-pointers attempted", "3PA", 0, "total"),
    ("fg2", "Most two-pointers made", "2PM", 0, "total"),
    ("fg2a", "Most two-pointers attempted", "2PA", 0, "total"),
    ("ft", "Most free throws made", "FTM", 0, "total"),
    ("fta", "Most free throws attempted", "FTA", 0, "total"),
    ("mp", "Most minutes played", "MIN", 0, "total"),
    ("games_started", "Most games started", "GS", 0, "total"),
    ("tpl_dbl", "Most triple-doubles", "TD", 0, "total"),
    ("pts", "Highest points per game", "PPG", 1, "pergame"),
    ("trb", "Highest rebounds per game", "RPG", 1, "pergame"),
    ("ast", "Highest assists per game", "APG", 1, "pergame"),
    ("stl", "Highest steals per game", "SPG", 2, "pergame"),
    ("blk", "Highest blocks per game", "BPG", 2, "pergame"),
    ("fg3", "Most threes made per game", "3PM/G", 1, "pergame"),
    ("tov", "Most turnovers per game", "TOV/G", 1, "pergame"),
    ("mp", "Most minutes per game", "MPG", 1, "pergame"),
    ("fg_pct", "Best field goal percentage", "FG%", 3, "pct:fg:300"),
    ("fg3_pct", "Best three-point percentage", "3P%", 3, "pct:fg3:82"),
    ("ft_pct", "Best free throw percentage", "FT%", 3, "pct:ft:125"),
]
ADVANCED = [
    ("ws", "Most win shares", "WS", 1, "total"),
    ("ows", "Most offensive win shares", "OWS", 1, "total"),
    ("dws", "Most defensive win shares", "DWS", 1, "total"),
    ("vorp", "Highest VORP", "VORP", 1, "total"),
    ("per", "Highest player efficiency rating", "PER", 1, "rate:1500"),
    ("ts_pct", "Best true shooting percentage", "TS%", 3, "rate:1500"),
    ("usg_pct", "Highest usage rate", "USG%", 1, "rate:1500"),
    ("bpm", "Highest box plus/minus", "BPM", 1, "rate:1500"),
    ("obpm", "Highest offensive box plus/minus", "OBPM", 1, "rate:1500"),
    ("dbpm", "Highest defensive box plus/minus", "DBPM", 1, "rate:1500"),
    ("ws_per_48", "Highest win shares per 48 minutes", "WS/48", 3, "rate:1500"),
    ("ast_pct", "Highest assist percentage", "AST%", 1, "rate:1500"),
    ("trb_pct", "Highest rebound percentage", "TRB%", 1, "rate:1500"),
    ("stl_pct", "Highest steal percentage", "STL%", 1, "rate:1500"),
    ("blk_pct", "Highest block percentage", "BLK%", 1, "rate:1500"),
]
SHOOTING = [
    ("fg_dunk", "Most dunks", "DUNKS", 0, "total"),
    ("fg3_heave", "Most heaves made", "HEAVES", 0, "total"),
]
PBP = [
    ("and1s", "Most and-ones", "AND-1", 0, "total"),
    ("drawn_shooting", "Most shooting fouls drawn", "SFD", 0, "total"),
    ("drawn_offensive", "Most offensive fouls drawn (charges)", "OFD", 0, "total"),
    ("fouls_shooting", "Most shooting fouls committed", "SF", 0, "total"),
    ("fouls_offensive", "Most offensive fouls committed", "OF", 0, "total"),
    ("tov_bad_pass", "Most bad-pass turnovers", "BAD PASS", 0, "total"),
    ("tov_lost_ball", "Most lost-ball turnovers", "LOST BALL", 0, "total"),
    ("own_shots_blk", "Most shots blocked by opponents", "BLKD", 0, "total"),
    ("astd_pts", "Most points generated by assists", "PGA", 0, "total"),
]
PAGES = [("totals", "totals_stats", TOTALS), ("advanced", "advanced", ADVANCED),
         ("shooting", "shooting", SHOOTING), ("play-by-play", "pbp_stats", PBP)]


def build_season(y):
    label = season_label(y)
    for page, table_id, specs in PAGES:
        path = os.path.join(CACHE, f"leagues_NBA_{y}_{page}.html")
        if not os.path.exists(path):
            print(f"missing {path}")
            continue
        rows = season_rows(path, table_id)
        games = [num(c.get("games")) or 0 for _, c in rows]
        max_g = min(max(games), 82) if games else 82
        min_games = math.ceil(0.7 * max_g)
        min_mp = 1500 * max_g / 82
        for stat, title, unit, dec, kind in specs:
            vals = []
            for pid, c in rows:
                v = num(c.get(stat))
                if v is None:
                    continue
                g = num(c.get("games")) or 0
                if kind == "pergame":
                    if g < min_games:
                        continue
                    v = v / g
                elif kind.startswith("pct:"):
                    _, att, mn = kind.split(":")
                    if (num(c.get(att)) or 0) < float(mn) * max_g / 82:
                        continue
                elif kind.startswith("rate:"):
                    if (num(c.get("mp")) or 0) < min_mp:
                        continue
                vals.append((pid, v))
            if not vals:
                continue
            suffix = {"pergame": "pg", "total": ""}.get(kind, "r")
            cid = f"s{y}-{stat}{suffix}"
            sub = f"{label} regular season"
            if kind == "pergame":
                sub += f" · min {min_games} games"
            elif kind.startswith("pct:") or kind.startswith("rate:"):
                sub += " · qualified players"
            add_category(cid, title, sub, "season", unit, dec, rank_rows(vals, dec), label)


# ---------------------------------------------------------------- career leader pages
CAREER = {
    "pts": ("Most career points", "PTS", 0), "trb": ("Most career rebounds", "REB", 0),
    "ast": ("Most career assists", "AST", 0), "stl": ("Most career steals", "STL", 0),
    "blk": ("Most career blocks", "BLK", 0), "fg": ("Most career field goals made", "FGM", 0),
    "fga": ("Most career field goals attempted", "FGA", 0),
    "fg3": ("Most career three-pointers made", "3PM", 0),
    "fg3a": ("Most career three-pointers attempted", "3PA", 0),
    "ft": ("Most career free throws made", "FTM", 0), "fta": ("Most career free throws attempted", "FTA", 0),
    "orb": ("Most career offensive rebounds", "OREB", 0), "drb": ("Most career defensive rebounds", "DREB", 0),
    "tov": ("Most career turnovers", "TOV", 0), "pf": ("Most career personal fouls", "PF", 0),
    "g": ("Most career games played", "GP", 0), "mp": ("Most career minutes played", "MIN", 0),
    "ws": ("Most career win shares", "WS", 1), "ows": ("Most career offensive win shares", "OWS", 1),
    "dws": ("Most career defensive win shares", "DWS", 1),
    "per": ("Highest career player efficiency rating", "PER", 2), "vorp": ("Highest career VORP", "VORP", 1),
    "bpm": ("Highest career box plus/minus", "BPM", 2),
    "pts_per_g": ("Highest career points per game", "PPG", 2),
    "trb_per_g": ("Highest career rebounds per game", "RPG", 2),
    "ast_per_g": ("Highest career assists per game", "APG", 2),
    "stl_per_g": ("Highest career steals per game", "SPG", 2),
    "blk_per_g": ("Highest career blocks per game", "BPG", 2),
    "mp_per_g": ("Highest career minutes per game", "MPG", 2),
    "ft_pct": ("Best career free throw percentage", "FT%", 3),
    "fg3_pct": ("Best career three-point percentage", "3P%", 3),
    "fg_pct": ("Best career field goal percentage", "FG%", 3),
}


def build_career(stat, playoffs):
    path = os.path.join(CACHE, f"leaders_{stat}_career{'_p' if playoffs else ''}.html")
    if not os.path.exists(path):
        print(f"missing {path}")
        return
    soup = BeautifulSoup(open(path, encoding="utf-8").read(), "lxml")
    table = soup.find("table", id="nba") or soup.find("table", id="tot")
    vals = []
    for tr in table.find_all("tr"):
        tds = tr.find_all("td")
        a = tr.find("a", href=re.compile(r"^/players/"))
        if len(tds) < 3 or a is None:
            continue
        pid = a["href"].rsplit("/", 1)[1].replace(".html", "")
        add_player(pid, a.get_text())
        v = num(tds[-1])
        if v is not None:
            vals.append((pid, v))
    title, unit, dec = CAREER[stat]
    if playoffs:
        title = title.replace("career", "career playoff")
    cid = f"c{'p' if playoffs else ''}-{stat}"
    sub = "All-time NBA playoffs" if playoffs else "All-time NBA regular season"
    add_category(cid, title, sub, "playoffs" if playoffs else "career", unit, dec, rank_rows(vals, dec))


# ---------------------------------------------------------------- main
for stat in CAREER:
    for po in (False, True):
        build_career(stat, po)
for y in range(2002, 2027):
    print("season", y)
    build_season(y)

# headshot ids from nba_api's bundled player list
from nba_api.stats.static import players as nba_players

by_name = {}
for p in nba_players.get_players():
    by_name.setdefault(norm(p["full_name"]), []).append(p)

pids = sorted(players)
index = {pid: i for i, pid in enumerate(pids)}
name_counts = {}
for pid in pids:
    name_counts[players[pid]] = name_counts.get(players[pid], 0) + 1

player_out, unmatched = [], 0
for pid in pids:
    cands = by_name.get(norm(players[pid]), [])
    nba_id = cands[0]["id"] if len(cands) == 1 else 0
    if not cands:
        unmatched += 1
    name = players[pid]
    if name_counts[name] > 1:
        name = f"{name} ({pid[-2:].lstrip('0') or '1'})"
    player_out.append([pid, name, nba_id])
print(f"players: {len(pids)}, without headshot id: {unmatched}")

if os.path.exists(OUT):
    shutil.rmtree(OUT)
os.makedirs(os.path.join(OUT, "c"))
json.dump(player_out, open(os.path.join(OUT, "players.json"), "w"), separators=(",", ":"))
meta = []
for c in categories:
    rows = [[index[p], r, v if c["d"] else int(v)] for p, r, v in c["rows"]]
    body = {k: c[k] for k in ("id", "t", "s", "g", "u", "d", "y")}
    meta.append(body)
    json.dump({**body, "r": rows}, open(os.path.join(OUT, "c", f"{c['id']}.json"), "w"), separators=(",", ":"))
json.dump(meta, open(os.path.join(OUT, "categories.json"), "w"), separators=(",", ":"))
print(f"categories: {len(meta)}")
