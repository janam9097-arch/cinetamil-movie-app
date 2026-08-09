"""
refresh_downloads.py
Re-scrapes all movies from moviesdatamil.net to get FRESH download.fastbytes.xyz
signed tokens. Tokens expire ~1 hour from creation, so this must be run every hour.

Full 5-level chain discovered:
  L0: moviesdatamil.net/<movie>/             -> finds /<movie-original>/ link
  L1: /<movie-original>/                     -> finds quality sub-pages (360p/720p/1080p)
  L2: /<movie-quality>/                      -> finds /download/<quality-slug>/ link
  L3: /download/<quality-slug>/              -> finds moviespage.xyz link
  L4: download.moviespage.xyz/download/file/ -> finds downloadpage.xyz link
  L5: movies.downloadpage.xyz/download/page/ -> finds FRESH fastbytes.xyz token

Usage:
  python refresh_downloads.py             # refresh all movies
  python refresh_downloads.py --limit 20  # only first N movies
  python refresh_downloads.py --dry-run   # preview, no DB writes
"""
import os, sys, json, sqlite3, httpx, time, argparse, re
from bs4 import BeautifulSoup

DB_PATH = os.path.abspath("movie_web_app/movies.db")
BASE = "https://moviesdatamil.net"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}
TIMEOUT = 20.0

QUALITY_SLUG_PATTERNS = {
    "360p": ["360p", "360"],
    "480p": ["480p", "480"],
    "720p": ["720p", "720"],
    "1080p": ["1080p", "1080"],
}

SIZE_HINTS = {"360p": "450 MB", "480p": "550 MB", "720p": "850 MB", "1080p": "1.8 GB"}

# Map 360p -> 480p for our app (moviesdatamil uses 360p instead of 480p)
QUALITY_MAP = {"360p": "480p"}


def abs_url(href, base=BASE):
    if not href or href == "#":
        return ""
    if href.startswith("http"):
        return href
    if href.startswith("/"):
        return base + href
    return base + "/" + href


def get_links(soup):
    """Return list of (text, href) for all non-nav links."""
    nav_texts = set("ABCDEFGHIJKLMNOPQRSTUVWXYZ")
    results = []
    for a in soup.find_all("a"):
        txt = a.get_text(strip=True)
        href = a.get("href", "")
        if txt in nav_texts or txt in ("0-9", "Moviesda Home", "Disclaimer", "Telegram Channel"):
            continue
        if href and href != "#":
            results.append((txt, abs_url(href)))
    return results


def infer_quality(txt):
    txt_lower = txt.lower()
    for q, pats in QUALITY_SLUG_PATTERNS.items():
        for p in pats:
            if p in txt_lower:
                return q
    return None


def follow_moviespage_chain(c, moviespage_url):
    """Follow moviespage.xyz -> downloadpage.xyz -> fastbytes.xyz and return fresh URL."""
    # L4: moviespage.xyz
    r4 = c.get(moviespage_url)
    if r4.status_code != 200:
        return ""
    soup4 = BeautifulSoup(r4.text, "html.parser")
    dl_page_url = ""
    for txt, href in get_links(soup4):
        if "downloadpage.xyz/download/page/" in href:
            dl_page_url = href
            break
    if not dl_page_url:
        return ""

    # L5: downloadpage.xyz -> fastbytes
    r5 = c.get(dl_page_url)
    if r5.status_code != 200:
        return ""
    soup5 = BeautifulSoup(r5.text, "html.parser")
    for txt, href in get_links(soup5):
        if "fastbytes.xyz" in href or "download.php?dl=" in href or "cdn.uptomkv.ch" in href:
            return href
    return ""


def scrape_fresh_downloads(movie_page_url: str) -> dict:
    """
    Returns dict: {"480p": {"url": "...", "size": "..."}, "720p": {...}, ...}
    Keys are normalized quality strings used by the app.
    Supports both movies and web series.
    """
    result = {}
    try:
        with httpx.Client(headers=HEADERS, follow_redirects=True, timeout=TIMEOUT) as c:
            # L0: movie or web series main page
            r0 = c.get(movie_page_url)
            if r0.status_code != 200:
                return result
            soup0 = BeautifulSoup(r0.text, "html.parser")

            # Find grouping sub-page ("original", "season", "hd", "web-series")
            sub_url = ""
            for txt, href in get_links(soup0):
                t_lower, h_lower = txt.lower(), href.lower()
                if "original" in t_lower or "original" in h_lower or "season" in t_lower or "season" in h_lower:
                    sub_url = href
                    break

            quality_pages = {}  # quality -> URL of quality sub-page

            if sub_url:
                r1 = c.get(sub_url)
                if r1.status_code == 200:
                    soup1 = BeautifulSoup(r1.text, "html.parser")
                    for txt, href in get_links(soup1):
                        q = infer_quality(txt) or infer_quality(href)
                        if q and q not in quality_pages:
                            quality_pages[q] = href
                        elif "/download/" in href and "moviesdatamil.net" in href:
                            if "480p" not in quality_pages:
                                quality_pages["480p"] = href

            if not quality_pages:
                # Fallback: look for quality links directly on main page
                for txt, href in get_links(soup0):
                    q = infer_quality(txt) or infer_quality(href)
                    if q and q not in quality_pages and "moviesdatamil.net" in href:
                        quality_pages[q] = href

            if not quality_pages:
                return result

            for raw_quality, quality_page_url in quality_pages.items():
                if "/download/" in quality_page_url and "moviesdatamil.net" in quality_page_url:
                    r3 = c.get(quality_page_url)
                    if r3.status_code == 200:
                        soup3 = BeautifulSoup(r3.text, "html.parser")
                        for txt3, href3 in get_links(soup3):
                            if "download.moviespage.xyz/download/file/" in href3:
                                fresh = follow_moviespage_chain(c, href3)
                                if fresh:
                                    norm_q = QUALITY_MAP.get(raw_quality, raw_quality)
                                    result[norm_q] = {"url": fresh, "size": SIZE_HINTS.get(raw_quality, "450 MB")}
                                    break
                    continue

                r2 = c.get(quality_page_url)
                if r2.status_code != 200:
                    continue
                soup2 = BeautifulSoup(r2.text, "html.parser")

                download_slug_url = ""
                for txt, href in get_links(soup2):
                    if "/download/" in href and "moviesdatamil.net" in href:
                        download_slug_url = href
                        break

                if not download_slug_url:
                    for txt, href in get_links(soup2):
                        if "download.moviespage.xyz" in href:
                            fresh = follow_moviespage_chain(c, href)
                            if fresh:
                                normalized_q = QUALITY_MAP.get(raw_quality, raw_quality)
                                result[normalized_q] = {"url": fresh, "size": SIZE_HINTS.get(raw_quality, "")}
                    continue

                r3 = c.get(download_slug_url)
                if r3.status_code != 200:
                    continue
                soup3 = BeautifulSoup(r3.text, "html.parser")

                moviespage_url = ""
                for txt3, href3 in get_links(soup3):
                    if "download.moviespage.xyz/download/file/" in href3:
                        moviespage_url = href3
                        break

                if not moviespage_url:
                    continue

                fresh = follow_moviespage_chain(c, moviespage_url)
                if fresh:
                    normalized_q = QUALITY_MAP.get(raw_quality, raw_quality)
                    result[normalized_q] = {"url": fresh, "size": SIZE_HINTS.get(raw_quality, "")}

    except Exception:
        pass

    return result



def main():
    parser = argparse.ArgumentParser(description="Refresh expired fastbytes.xyz download tokens")
    parser.add_argument("--dry-run", action="store_true", help="Preview only, no DB writes")
    parser.add_argument("--all", action="store_true", help="Process all 940 movies, not just the 216 with existing downloads")
    parser.add_argument("--limit", type=int, default=0, help="Max number of movies to process (0 = all)")
    args = parser.parse_args()

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    # By default, process all movies that have any downloads_json populated
    if getattr(args, 'all', False):
        rows = conn.execute(
            "SELECT id, title, url, downloads_json FROM movies ORDER BY id DESC"
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT id, title, url, downloads_json FROM movies WHERE downloads_json IS NOT NULL AND downloads_json != '' AND downloads_json != '{}' ORDER BY id ASC"
        ).fetchall()

    if args.limit > 0:
        rows = rows[: args.limit]

    total = len(rows)
    print(f"Refreshing download URLs for {total} movies...")
    if args.dry_run:
        print("[DRY RUN] No changes will be written.")

    refreshed = 0
    failed = 0
    updated_ids = {}

    for i, r in enumerate(rows):
        safe_title = r["title"].encode("ascii", "replace").decode("ascii")
        pct = int((i + 1) / total * 100)
        print(f"[{i+1}/{total}] ({pct}%) {safe_title} ... ", end="", flush=True)

        try:
            existing_dls = json.loads(r["downloads_json"]) if r["downloads_json"] else {}
        except Exception:
            existing_dls = {}

        fresh = scrape_fresh_downloads(r["url"])
        if fresh:
            refreshed += 1
            print(f"OK ({', '.join(fresh.keys())})")
            if not args.dry_run:
                merged = dict(existing_dls)
                merged.update(fresh)
                updated_ids[r["id"]] = merged
        else:
            failed += 1
            print("FAIL")

        # Rate-limit pause
        if (i + 1) % 5 == 0:
            time.sleep(0.3)

    if not args.dry_run and updated_ids:
        for mid, dls in updated_ids.items():
            conn.execute(
                "UPDATE movies SET downloads_json = ? WHERE id = ?",
                (json.dumps(dls), mid),
            )
        conn.commit()
        print(f"\nUpdated {len(updated_ids)} records in DB.")

    conn.close()

    print()
    print("=== REFRESH SUMMARY ===")
    print(f"Total items processed    : {total}")
    print(f"Successful refresh count : {refreshed}")
    print(f"Failed count             : {failed}")

    if not args.dry_run:
        sys.path.insert(0, os.path.abspath("movie_web_app"))
        from sync_service import export_to_movies_data_js
        count, ts = export_to_movies_data_js()
        print(f"Generated-data count     : {count} movies in movies_data.js")
        print(f"Persistence status       : Saved to movie_web_app/movies.db & exported to movies_data.js at {ts}")
    else:
        print(f"Generated-data count     : 0 (dry-run)")
        print(f"Persistence status       : Skipped DB write and export (dry-run)")


if __name__ == "__main__":
    main()
