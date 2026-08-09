import os
import sys
import re
import json
import sqlite3
import datetime
import httpx
import urllib.parse
from bs4 import BeautifulSoup

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.abspath(os.path.join(BASE_DIR, ".."))
DB_PATH = os.path.join(BASE_DIR, "movies.db")
MOVIES_DATA_JS_PATH = os.path.join(ROOT_DIR, "movies_data.js")

# Authorized Movie Feed URL (set via GitHub Secrets or environment variable)
AUTHORIZED_FEED_URL = os.getenv("AUTHORIZED_MOVIE_FEED_URL", "https://api.example.com/authorized-movies-feed")

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("""
        CREATE TABLE IF NOT EXISTS movies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            url TEXT NOT NULL UNIQUE,
            year TEXT DEFAULT '',
            category TEXT DEFAULT '',
            director TEXT DEFAULT '',
            starring TEXT DEFAULT '',
            genres TEXT DEFAULT '',
            quality TEXT DEFAULT '',
            language TEXT DEFAULT '',
            rating TEXT DEFAULT '',
            synopsis TEXT DEFAULT '',
            poster_url TEXT DEFAULT '',
            release_date TEXT DEFAULT '',
            cast TEXT DEFAULT '',
            downloads_json TEXT DEFAULT '{}',
            scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    # Migration for missing columns in existing SQLite table
    existing_cols = [row[1] for row in conn.execute("PRAGMA table_info(movies)").fetchall()]
    if "release_date" not in existing_cols:
        conn.execute("ALTER TABLE movies ADD COLUMN release_date TEXT DEFAULT ''")
    if "cast" not in existing_cols:
        conn.execute("ALTER TABLE movies ADD COLUMN cast TEXT DEFAULT ''")
    if "downloads_json" not in existing_cols:
        conn.execute("ALTER TABLE movies ADD COLUMN downloads_json TEXT DEFAULT '{}'")

    conn.execute("""
        CREATE TABLE IF NOT EXISTS sync_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            status TEXT NOT NULL,
            message TEXT NOT NULL,
            added_count INTEGER DEFAULT 0,
            updated_count INTEGER DEFAULT 0,
            skipped_count INTEGER DEFAULT 0,
            error_count INTEGER DEFAULT 0,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    existing_log_cols = [row[1] for row in conn.execute("PRAGMA table_info(sync_logs)").fetchall()]
    if "updated_count" not in existing_log_cols:
        conn.execute("ALTER TABLE sync_logs ADD COLUMN updated_count INTEGER DEFAULT 0")
    if "skipped_count" not in existing_log_cols:
        conn.execute("ALTER TABLE sync_logs ADD COLUMN skipped_count INTEGER DEFAULT 0")
    if "error_count" not in existing_log_cols:
        conn.execute("ALTER TABLE sync_logs ADD COLUMN error_count INTEGER DEFAULT 0")

    conn.execute("CREATE INDEX IF NOT EXISTS idx_title ON movies(title COLLATE NOCASE)")
    conn.commit()
    return conn

def log_sync_event(status: str, message: str, added_count: int = 0, updated_count: int = 0, skipped_count: int = 0, error_count: int = 0):
    conn = get_db()
    try:
        conn.execute(
            "INSERT INTO sync_logs (status, message, added_count, updated_count, skipped_count, error_count) VALUES (?, ?, ?, ?, ?, ?)",
            (status, message, added_count, updated_count, skipped_count, error_count)
        )
        conn.commit()
    finally:
        conn.close()

def is_valid_url(url: str) -> bool:
    if not url or not isinstance(url, str):
        return False
    url = url.strip()
    return url.startswith("http://") or url.startswith("https://") or url.startswith("file://")

def is_category_a_file_url(url: str) -> bool:
    """
    Validates if a URL is an actual Category A authorized file download URL.
    Excludes non-file webpages (movie info pages, download selection webpages, homepages).
    """
    if not is_valid_url(url):
        return False
    url = url.strip()
    if "moviesdatamil.net" in url or "downloadpage.xyz/download/page/" in url:
        return False
    return (
        "download.moviespage.xyz/download/file/" in url or
        "r2.cloudflarestorage.com" in url or
        "mv1.uptomkv.ch/files/" in url or
        url.endswith(".mp4") or
        ".mp4?" in url
    )

def resolve_url_to_category_a_sync(url: str) -> str:
    """
    Synchronously resolves a download webpage link to a Category A authorized server file URL if possible.
    """
    if is_category_a_file_url(url):
        return url
    if not is_valid_url(url):
        return ""

    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
    try:
        if "moviesdatamil.net/download/" in url:
            with httpx.Client(headers=headers, follow_redirects=True, timeout=8.0) as client:
                r1 = client.get(url)
                if r1.status_code == 200:
                    soup1 = BeautifulSoup(r1.text, "html.parser")
                    for a in soup1.find_all("a"):
                        href = a.get("href", "")
                        if "moviespage.xyz/download/file/" in href:
                            return href
    except Exception:
        pass

    return url if is_category_a_file_url(url) else ""

def export_to_movies_data_js():
    conn = get_db()
    try:
        rows = conn.execute("SELECT * FROM movies ORDER BY id DESC").fetchall()
        movie_list = []
        for r in rows:
            row_dict = dict(r)
            downloads = {}
            if row_dict.get("downloads_json"):
                try:
                    parsed_dls = json.loads(row_dict["downloads_json"])
                    # Strict filter: include ONLY Category A Authorized File URLs in static catalog
                    if isinstance(parsed_dls, dict):
                        for q in ["480p", "720p", "1080p"]:
                            if q in parsed_dls and isinstance(parsed_dls[q], dict):
                                q_url = parsed_dls[q].get("url", "")
                                if is_category_a_file_url(q_url):
                                    downloads[q] = {
                                        "url": q_url,
                                        "size": parsed_dls[q].get("size", "")
                                    }
                except Exception:
                    downloads = {}

            item = {
                "title": row_dict["title"],
                "year": row_dict["year"],
                "category": row_dict["category"],
                "director": row_dict["director"],
                "starring": row_dict["starring"] or row_dict["cast"],
                "quality": row_dict["quality"],
                "posterUrl": row_dict["poster_url"],
                "synopsis": row_dict["synopsis"],
                "moviePageUrl": row_dict["url"],
                "downloads": downloads
            }
            movie_list.append(item)

        now_iso = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
        js_content = f"// CineTamil Movie Data - Auto Generated\nconst LAST_UPDATED_TIMESTAMP = \"{now_iso}\";\nconst CACHED_MOVIES_DB = {json.dumps(movie_list, separators=(',', ':'))};\n"

        with open(MOVIES_DATA_JS_PATH, "w", encoding="utf-8") as f:
            f.write(js_content)

        print(f"[Sync Engine] Exported {len(movie_list)} movies to {MOVIES_DATA_JS_PATH}")
        return len(movie_list), now_iso
    finally:
        conn.close()

def fetch_authorized_feed():
    """
    Fetches incoming movie metadata and download URLs from the authorized feed / API / local file.
    Supports JSON feed or local test feed file.
    """
    print(f"[Sync Engine] Fetching authorized movie feed from: {AUTHORIZED_FEED_URL}")
    
    # Check if URL is local file path (for testing or local feed)
    if AUTHORIZED_FEED_URL.startswith("file://") or os.path.exists(AUTHORIZED_FEED_URL):
        file_path = AUTHORIZED_FEED_URL.replace("file://", "")
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    return data
                elif isinstance(data, dict) and "movies" in data:
                    return data["movies"]
        except Exception as e:
            err_msg = f"Failed to read local feed file {file_path}: {e}"
            print(f"[Sync Engine Error] {err_msg}")
            log_sync_event("ERROR", err_msg, error_count=1)
            return []

    # HTTP API Feed fetch
    headers = {
        "User-Agent": "CineTamil-AuthorizedSyncEngine/1.0",
        "Accept": "application/json"
    }

    try:
        with httpx.Client(headers=headers, follow_redirects=True, timeout=15.0) as client:
            response = client.get(AUTHORIZED_FEED_URL)
            if response.status_code != 200:
                err_msg = f"Feed HTTP {response.status_code} Error from {AUTHORIZED_FEED_URL}"
                print(f"[Sync Engine Error] {err_msg}")
                log_sync_event("ERROR", err_msg, error_count=1)
                return []
            
            data = response.json()
            if isinstance(data, list):
                return data
            elif isinstance(data, dict) and "movies" in data:
                return data["movies"]
            else:
                log_sync_event("ERROR", f"Invalid feed format from {AUTHORIZED_FEED_URL}", error_count=1)
                return []
    except Exception as e:
        err_msg = f"Feed connection error for {AUTHORIZED_FEED_URL}: {str(e)}"
        print(f"[Sync Engine Error] {err_msg}")
        log_sync_event("ERROR", err_msg, error_count=1)
        return []

def process_movie_sync(feed_items=None):
    """
    Processes incoming movies from authorized data source.
    - Prevents duplicates (matches normalized title/URL)
    - Updates existing records if quality/metadata changed
    - Inserts new movies automatically
    - Strictly stores ONLY Category A Authorized File URLs in downloads
    - Exports updated movies_data.js
    """
    conn = get_db()
    if feed_items is None:
        feed_items = fetch_authorized_feed()

    added_count = 0
    updated_count = 0
    skipped_count = 0
    error_count = 0

    try:
        for movie in feed_items:
            if not isinstance(movie, dict):
                error_count += 1
                continue

            title = str(movie.get("title", "")).strip()
            if not title:
                error_count += 1
                continue

            movie_page_url = movie.get("moviePageUrl") or movie.get("url") or f"https://moviesdatamil.net/movie/{title.lower().replace(' ', '-')}"
            if not is_valid_url(movie_page_url):
                error_count += 1
                continue

            year = str(movie.get("year", ""))
            category = str(movie.get("category", "tamil-2025"))
            director = str(movie.get("director", ""))
            cast_info = str(movie.get("starring") or movie.get("cast", ""))
            genres = str(movie.get("genres", ""))
            quality = str(movie.get("quality", "HD Rip"))
            language = str(movie.get("language", "Tamil"))
            rating = str(movie.get("rating", ""))
            synopsis = str(movie.get("synopsis") or movie.get("description", ""))
            poster_url = str(movie.get("posterUrl") or movie.get("poster_url") or movie.get("poster", ""))
            release_date = str(movie.get("release_date", ""))

            # Extract & validate download URLs: MUST resolve or match Category A Authorized File URL
            incoming_downloads = movie.get("downloads", {})
            valid_downloads = {}
            if isinstance(incoming_downloads, dict):
                for q in ["480p", "720p", "1080p"]:
                    if q in incoming_downloads and isinstance(incoming_downloads[q], dict):
                        q_url = incoming_downloads[q].get("url")
                        q_size = incoming_downloads[q].get("size", "")
                        resolved_u = resolve_url_to_category_a_sync(q_url) if q_url else ""
                        if is_category_a_file_url(resolved_u):
                            valid_downloads[q] = {"url": resolved_u, "size": q_size}

            # Check if movie already exists in SQLite (by title or moviePageUrl)
            existing = conn.execute("SELECT * FROM movies WHERE title = ? OR url = ?", (title, movie_page_url)).fetchone()

            if existing:
                row_dict = dict(existing)
                existing_dls = {}
                if row_dict.get("downloads_json"):
                    try:
                        existing_dls = json.loads(row_dict["downloads_json"])
                    except Exception:
                        existing_dls = {}

                # Filter existing_dls for Category A URLs
                merged_dls = {q: obj for q, obj in existing_dls.items() if is_category_a_file_url(obj.get("url", ""))}
                dls_changed = False
                for q, q_obj in valid_downloads.items():
                    if q not in merged_dls or merged_dls[q].get("url") != q_obj["url"] or merged_dls[q].get("size") != q_obj["size"]:
                        merged_dls[q] = q_obj
                        dls_changed = True

                meta_changed = (
                    (poster_url and row_dict.get("poster_url") != poster_url) or
                    (synopsis and row_dict.get("synopsis") != synopsis) or
                    (cast_info and row_dict.get("starring") != cast_info) or
                    (director and row_dict.get("director") != director) or
                    (release_date and row_dict.get("release_date") != release_date)
                )

                if dls_changed or meta_changed:
                    conn.execute("""
                        UPDATE movies SET
                            poster_url = COALESCE(NULLIF(?, ''), poster_url),
                            synopsis = COALESCE(NULLIF(?, ''), synopsis),
                            starring = COALESCE(NULLIF(?, ''), starring),
                            director = COALESCE(NULLIF(?, ''), director),
                            release_date = COALESCE(NULLIF(?, ''), release_date),
                            downloads_json = ?
                        WHERE id = ?
                    """, (poster_url, synopsis, cast_info, director, release_date, json.dumps(merged_dls), row_dict["id"]))
                    updated_count += 1
                else:
                    skipped_count += 1
            else:
                # Insert new movie record
                downloads_json = json.dumps(valid_downloads)
                conn.execute("""
                    INSERT INTO movies (
                        title, url, year, category, director, starring, genres, quality,
                        language, rating, synopsis, poster_url, release_date, cast, downloads_json
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    title, movie_page_url, year, category, director, cast_info, genres, quality,
                    language, rating, synopsis, poster_url, release_date, cast_info, downloads_json
                ))
                added_count += 1

        conn.commit()

        status_str = "SUCCESS" if error_count == 0 else "PARTIAL_SUCCESS"
        msg = f"Sync Completed: {added_count} added, {updated_count} updated, {skipped_count} skipped, {error_count} error(s)."
        print(f"[Sync Engine] {msg}")
        log_sync_event(status_str, msg, added_count=added_count, updated_count=updated_count, skipped_count=skipped_count, error_count=error_count)

        # Export static root/movies_data.js
        export_to_movies_data_js()

        return {
            "added": added_count,
            "updated": updated_count,
            "skipped": skipped_count,
            "errors": error_count,
            "status": status_str
        }
    except Exception as e:
        err_msg = f"Database sync execution error: {str(e)}"
        print(f"[Sync Engine Error] {err_msg}")
        log_sync_event("ERROR", err_msg, error_count=1)
        return {"error": str(e), "status": "ERROR"}
    finally:
        conn.close()

if __name__ == "__main__":
    print("[Sync Engine CLI Execution]")
    result = process_movie_sync()
    print("Result:", result)
