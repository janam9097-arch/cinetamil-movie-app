"""
resolve_to_direct.py
Resolves all download.moviespage.xyz intermediate page URLs to
download.fastbytes.xyz/download.php?dl=... endpoints which trigger
real file downloads (302 -> R2 .mp4).

Chain:
  L1: download.moviespage.xyz/download/file/<id>   -> HTML page
  L2: movies.downloadpage.xyz/download/page/<id>   -> HTML page
  L3: download.fastbytes.xyz/download.php?dl=...   -> 302 -> .mp4 binary

Usage:
  python resolve_to_direct.py            # resolve all
  python resolve_to_direct.py --dry-run  # preview only, no DB writes
"""
import os, sys, json, sqlite3, httpx, time, argparse
from bs4 import BeautifulSoup

DB_PATH = os.path.abspath("movie_web_app/movies.db")
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}
RETRIES = 2
TIMEOUT = 15.0

def resolve_chain(url: str) -> str:
    """
    Follow the 3-level download chain for a single URL.
    Returns the fastbytes.xyz URL if found, or the original URL on failure.
    """
    if not url or "download.moviespage.xyz" not in url:
        return url

    for attempt in range(RETRIES):
        try:
            with httpx.Client(headers=HEADERS, follow_redirects=True, timeout=TIMEOUT) as c:
                # Level 1 -> Level 2
                r1 = c.get(url)
                if r1.status_code != 200:
                    continue
                soup1 = BeautifulSoup(r1.text, "html.parser")
                level2 = None
                for a in soup1.find_all("a"):
                    href = a.get("href", "")
                    if "downloadpage.xyz/download/page/" in href:
                        level2 = href
                        break
                if not level2:
                    break  # No level 2 link found - not retryable

                # Level 2 -> Level 3
                r2 = c.get(level2)
                if r2.status_code != 200:
                    continue
                soup2 = BeautifulSoup(r2.text, "html.parser")
                level3 = None
                for a in soup2.find_all("a"):
                    href = a.get("href", "")
                    if "fastbytes.xyz" in href or "download.php?dl=" in href or "cdn.uptomkv.ch" in href:
                        level3 = href
                        break
                if level3:
                    return level3  # Success
                break  # No level 3 link found - not retryable

        except (httpx.TimeoutException, httpx.ConnectError):
            if attempt < RETRIES - 1:
                time.sleep(1)
            continue
        except Exception:
            break

    return url  # Return original on failure


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Preview only, no DB writes")
    args = parser.parse_args()

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    rows = conn.execute("SELECT id, title, downloads_json FROM movies").fetchall()

    # Collect all intermediate-page URLs to resolve
    work = []  # (movie_id, title, quality, old_url)
    movie_dls = {}  # movie_id -> mutable dl dict

    for r in rows:
        try:
            dl = json.loads(r["downloads_json"]) if r["downloads_json"] else {}
        except Exception:
            dl = {}
        movie_dls[r["id"]] = dl
        for q in ["480p", "720p", "1080p"]:
            if q in dl and "download.moviespage.xyz" in dl[q].get("url", ""):
                work.append((r["id"], r["title"], q, dl[q]["url"]))

    total = len(work)
    print(f"Found {total} intermediate URLs to resolve across {len(set(w[0] for w in work))} movies.")
    if args.dry_run:
        print("[DRY RUN] No changes will be written.")

    resolved = 0
    failed = 0
    updated_ids = set()

    for i, (mid, title, quality, old_url) in enumerate(work):
        safe_title = title.encode("ascii", "replace").decode("ascii")
        pct = int((i + 1) / total * 100)
        print(f"[{i+1}/{total}] ({pct}%) {safe_title} [{quality}]... ", end="", flush=True)

        new_url = resolve_chain(old_url)

        if new_url != old_url and "download.moviespage.xyz" not in new_url:
            if not args.dry_run:
                movie_dls[mid][quality]["url"] = new_url
                updated_ids.add(mid)
            resolved += 1
            print("OK")
        else:
            failed += 1
            print("FAIL (kept original)")

        # Small rate-limit pause every 10 requests
        if (i + 1) % 10 == 0:
            time.sleep(0.3)

    # Write updates to DB
    if not args.dry_run:
        for mid in updated_ids:
            conn.execute(
                "UPDATE movies SET downloads_json = ? WHERE id = ?",
                (json.dumps(movie_dls[mid]), mid)
            )
        conn.commit()

    conn.close()

    print()
    print("=== RESOLUTION SUMMARY ===")
    print(f"Total URLs processed  : {total}")
    print(f"Resolved to direct    : {resolved}")
    print(f"Could not resolve     : {failed}")
    print(f"DB records updated    : {len(updated_ids)}")

    if not args.dry_run:
        sys.path.insert(0, os.path.abspath("movie_web_app"))
        from sync_service import export_to_movies_data_js
        count, ts = export_to_movies_data_js()
        print(f"Exported {count} movies to movies_data.js at {ts}")
    else:
        print("[DRY RUN] Skipped DB write and export.")


if __name__ == "__main__":
    main()
