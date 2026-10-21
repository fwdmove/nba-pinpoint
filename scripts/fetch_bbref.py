"""Download Basketball-Reference pages into a local cache (rate-limited).

Usage: python scripts/fetch_bbref.py <cache_dir>
Only missing pages are downloaded. Stay under BR's ~20 req/min limit.
"""
import os, subprocess, sys, time

CACHE = sys.argv[1]
os.makedirs(CACHE, exist_ok=True)
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

SEASONS = range(2002, 2027)  # BR season-end years (2001-02 .. 2025-26)
SEASON_PAGES = ["totals", "advanced", "shooting", "play-by-play"]
CAREER = ["pts", "trb", "ast", "stl", "blk", "fg", "fga", "fg3", "fg3a", "ft", "fta",
          "orb", "drb", "tov", "pf", "g", "mp", "ws", "ows", "dws", "per", "vorp", "bpm",
          "pts_per_g", "trb_per_g", "ast_per_g", "stl_per_g", "blk_per_g", "mp_per_g",
          "ft_pct", "fg3_pct", "fg_pct"]

paths = [f"leagues/NBA_{y}_{p}" for y in SEASONS for p in SEASON_PAGES]
paths += [f"leaders/{s}_career" for s in CAREER] + [f"leaders/{s}_career_p" for s in CAREER]

for i, p in enumerate(paths):
    out = os.path.join(CACHE, p.replace("/", "_") + ".html")
    if os.path.exists(out):
        continue
    url = f"https://www.basketball-reference.com/{p}.html"
    code = subprocess.run(["curl", "-s", "-m", "60", "-A", UA, "-o", out + ".tmp", "-w", "%{http_code}", url],
                          capture_output=True, text=True).stdout
    if code == "200":
        os.rename(out + ".tmp", out)
        print(f"[{i+1}/{len(paths)}] ok {p}", flush=True)
    else:
        if os.path.exists(out + ".tmp"):
            os.remove(out + ".tmp")
        print(f"[{i+1}/{len(paths)}] FAIL {p} {code}", flush=True)
        if code == "429":
            sys.exit(1)
    time.sleep(4.5)
print("done")
