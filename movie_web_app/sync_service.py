import os
import sys
import json
import sqlite3
import datetime
import httpx

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.abspath(os.path.join(BASE_DIR, ".."))
DB_PATH = os.path.join(BASE_DIR, "movies.db")
MOVIES_DATA_JS_PATH = os.path.join(ROOT_DIR, "movies_data.js")

# Authorized Movie Feed URL (Can be set via environment variable or custom endpoint)
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
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_title ON movies(title COLLATE NOCASE)")
    conn.commit()
    return conn

def log_sync_event(status: str, message: str, added_count: int = 0):
    conn = get_db()
    try:
        conn.execute(
            "INSERT INTO sync_logs (status, message, added_count) VALUES (?, ?, ?)",
            (status, message, added_count)
        )
        conn.commit()
    finally:
        conn.close()

def export_to_movies_data_js():
    conn = get_db()
    try:
        rows = conn.execute("SELECT * FROM movies ORDER BY id DESC").fetchall()
        movie_list = []
        for r in rows:
            row_dict = dict(r)
            # Parse downloads_json if present
            downloads = {}
            if row_dict.get("downloads_json"):
                try:
                    downloads = json.loads(row_dict["downloads_json"])
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
    Fetch movies from the authorized API/feed.
    If the remote feed is unreachable or invalid, returns empty list and logs error.
    """
    if AUTHORIZED_FEED_URL.startswith("https://api.example.com"):
        print("[Sync Engine] Using fallback demonstration authorized feed structure.")
        return []

    headers = {
        "User-Agent": "CineTamil-AuthorizedSyncEngine/1.0",
        "Accept": "application/json"
    }

    try:
        with httpx.Client(headers=headers, timeout=12.0) as client:
            response = client.get(AUTHORIZED_FEED_URL)
            response.raise_for_status()
            data = response.json()
            if isinstance(data, list):
                return data
            elif isinstance(data, dict) and "movies" in data:
                return data["movies"]
            else:
                log_sync_event("ERROR", f"Invalid feed format received from {AUTHORIZED_FEED_URL}")
                return []
    except Exception as e:
        err_msg = f"Failed to fetch authorized feed from {AUTHORIZED_FEED_URL}: {str(e)}"
        print(f"[Sync Engine Error] {err_msg}")
        log_sync_event("ERROR", err_msg)
        return []

def process_movie_sync(feed_items=None):
    """
    Processes incoming movies from authorized data source, checks for duplicates,
    inserts new records, and exports updated data to movies_data.js.
    """
    conn = get_db()
    if feed_items is None:
        feed_items = fetch_authorized_feed()

    added_count = 0
    skipped_count = 0

    try:
        for movie in feed_items:
            title = movie.get("title", "").strip()
            url = movie.get("url") or movie.get("moviePageUrl") or f"https://moviesdatamil.net/movie/{title.lower().replace(' ', '-')}"
            if not title:
                continue

            # Prevent duplicate check by title or URL
            existing = conn.execute("SELECT id FROM movies WHERE title = ? OR url = ?", (title, url)).fetchone()
            if existing:
                skipped_count += 1
                continue

            year = str(movie.get("year", ""))
            category = movie.get("category", "tamil-2025")
            director = movie.get("director", "")
            starring = movie.get("starring") or movie.get("cast", "")
            genres = movie.get("genres", "")
            quality = movie.get("quality", "HD Rip")
            language = movie.get("language", "Tamil")
            rating = movie.get("rating", "")
            synopsis = movie.get("synopsis") or movie.get("description", "")
            poster_url = movie.get("poster_url") or movie.get("poster", "")
            release_date = movie.get("release_date", "")

            # Downloads structure: {"480p": {"url": "...", "size": "..."}, ...}
            downloads = movie.get("downloads", {})
            if not downloads:
                cleaned_title = re.sub(r'\s*\(\d{4}\)', '', title).strip()
                slug = re.sub(r'[^a-z0-9]+', '-', cleaned_title.lower()).strip('-')
                if year and year not in slug:
                    slug = f"{slug}-{year}"
                downloads = {
                    "480p": {"url": f"https://moviesdatamil.net/download/{slug}-original-360p-hd/", "size": "450 MB"},
                    "720p": {"url": f"https://moviesdatamil.net/download/{slug}-original-720p-hd/", "size": "850 MB"},
                    "1080p": {"url": f"https://moviesdatamil.net/download/{slug}-original-1080p-hd/", "size": "1.8 GB"}
                }
            downloads_json = json.dumps(downloads)

            conn.execute("""
                INSERT INTO movies (
                    title, url, year, category, director, starring, genres, quality,
                    language, rating, synopsis, poster_url, release_date, cast, downloads_json
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                title, url, year, category, director, starring, genres, quality,
                language, rating, synopsis, poster_url, release_date, starring, downloads_json
            ))
            added_count += 1

        conn.commit()

        msg = f"Sync Completed: {added_count} new movie(s) added, {skipped_count} existing movie(s) skipped."
        print(f"[Sync Engine] {msg}")
        log_sync_event("SUCCESS", msg, added_count=added_count)

        # Export to static movies_data.js
        export_to_movies_data_js()

        return {"added": added_count, "skipped": skipped_count, "status": "SUCCESS"}
    except Exception as e:
        err_msg = f"Database sync execution error: {str(e)}"
        print(f"[Sync Engine Error] {err_msg}")
        log_sync_event("ERROR", err_msg)
        return {"error": str(e), "status": "ERROR"}
    finally:
        conn.close()

if __name__ == "__main__":
    print("[Sync Engine CLI Execution]")
    result = process_movie_sync()
    print("Result:", result)
