import os
import re
import sqlite3
import httpx
from bs4 import BeautifulSoup
from starlette.applications import Starlette
from starlette.responses import JSONResponse, FileResponse
from starlette.routing import Route, Mount
from starlette.staticfiles import StaticFiles
from starlette.middleware import Middleware
from starlette.middleware.cors import CORSMiddleware
import uvicorn

BASE_URL = "https://moviesdatamil.net"
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "movies.db")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

CATEGORIES = {
    "tamil-2026": {"label": "2026 Movies", "url": "/tamil-2026-movies/"},
    "tamil-2025": {"label": "2025 Movies", "url": "/tamil-2025-movies/"},
    "tamil-2024": {"label": "2024 Movies", "url": "/tamil-2024-movies/"},
    "tamil-2023": {"label": "2023 Movies", "url": "/tamil-2023-movies/"},
    "tamil-2022": {"label": "2022 Movies", "url": "/tamil-2022-movies/"},
    "tamil-2015": {"label": "2015 Blockbusters", "url": "/tamil-2015-movies/"},
    "tamil-hd": {"label": "HD Movies", "url": "/tamil-hd-movies/"},
    "tamil-dubbed": {"label": "Tamil Dubbed", "url": "/tamil-dubbed-movies/"},
    "web-series": {"label": "Web Series", "url": "/tamil-web-series-download/"},
    "collections": {"label": "Movie Collections", "url": "/tamil-movies-collection/"},
}

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
            scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_title ON movies(title COLLATE NOCASE)")
    conn.commit()
    return conn

async def fetch_html(url: str) -> str:
    async with httpx.AsyncClient(headers=HEADERS, follow_redirects=True, timeout=15) as client:
        r = await client.get(url)
        r.raise_for_status()
        return r.text

def parse_movie_links(html: str) -> list:
    soup = BeautifulSoup(html, "html.parser")
    movies = []
    for link in soup.select("div.f a"):
        href = link.get("href", "")
        text = link.get_text(strip=True)
        if href and text and not href.startswith("http"):
            year_match = re.search(r"\((\d{4})\)", text)
            year = year_match.group(1) if year_match else ""
            full_url = f"{BASE_URL}{href}" if href.startswith("/") else f"{BASE_URL}/{href}"
            movies.append({
                "title": text,
                "url": full_url,
                "year": year
            })
    return movies

def parse_movie_details(html: str, movie_url: str) -> dict:
    soup = BeautifulSoup(html, "html.parser")
    info = {
        "title": "",
        "url": movie_url,
        "director": "", "starring": "", "genres": "",
        "quality": "", "language": "", "rating": "",
        "synopsis": "", "poster_url": "", "download_links": []
    }

    # H1 title
    h1 = soup.select_one("h1, h2, div.title")
    if h1:
        info["title"] = h1.get_text(strip=True)

    # Info list
    for li in soup.select("ul.movie-info li"):
        strong = li.find("strong")
        span = li.find("span")
        if strong and span:
            lbl = strong.get_text(strip=True).replace(":", "").lower()
            val = span.get_text(strip=True)
            if "director" in lbl: info["director"] = val
            elif "starring" in lbl: info["starring"] = val
            elif "genre" in lbl: info["genres"] = val
            elif "quality" in lbl: info["quality"] = val
            elif "language" in lbl: info["language"] = val
            elif "rating" in lbl: info["rating"] = val

    # Synopsis
    syn_el = soup.select_one("div.movie-synopsis")
    if syn_el:
        info["synopsis"] = syn_el.get_text(strip=True).replace("Synopsis:", "", 1).strip()

    # Poster
    poster_el = soup.select_one("div.movie-info-container img, img.poster")
    if poster_el:
        src = poster_el.get("src", "")
        info["poster_url"] = src if src.startswith("http") else f"{BASE_URL}{src}"

    # Download / Category links inside movie page
    for a in soup.select("div.f a, a.dlink"):
        txt = a.get_text(strip=True)
        href = a.get("href", "")
        if href and txt:
            full_href = href if href.startswith("http") else f"{BASE_URL}{href}"
            info["download_links"].append({
                "label": txt,
                "url": full_href
            })

    return info

# ── API Routes ──

async def api_search(request):
    q = request.query_params.get("q", "").strip()
    year = request.query_params.get("year", "").strip()
    if not q:
        return JSONResponse({"results": [], "total": 0})

    conn = get_db()
    try:
        sql = "SELECT * FROM movies WHERE title LIKE ? COLLATE NOCASE"
        params = [f"%{q}%"]
        if year:
            sql += " AND year = ?"
            params.append(year)
        sql += " ORDER BY id DESC LIMIT 50"
        
        rows = conn.execute(sql, params).fetchall()
        results = [dict(r) for r in rows]

        # Live fallback if no results
        if not results and q:
            first_char = q[0].lower()
            if first_char.isalpha():
                try:
                    az_url = f"{BASE_URL}/tamil-movies/{first_char}/"
                    html = await fetch_html(az_url)
                    parsed = parse_movie_links(html)
                    matches = [m for m in parsed if q.lower() in m["title"].lower()]
                    for m in matches:
                        conn.execute(
                            "INSERT OR IGNORE INTO movies (title, url, year, category) VALUES (?, ?, ?, ?)",
                            (m["title"], m["url"], m["year"], f"atoz-{first_char}")
                        )
                    conn.commit()
                    results = matches
                except Exception as e:
                    pass

        return JSONResponse({"results": results, "total": len(results)})
    finally:
        conn.close()

async def api_categories(request):
    conn = get_db()
    try:
        cats = []
        for key, val in CATEGORIES.items():
            count = conn.execute("SELECT COUNT(*) FROM movies WHERE category = ?", (key,)).fetchone()[0]
            cats.append({
                "id": key,
                "label": val["label"],
                "cached_count": count
            })
        return JSONResponse({"categories": cats})
    finally:
        conn.close()

async def api_category(request):
    cat_id = request.query_params.get("name", "tamil-2025")
    page = int(request.query_params.get("page", 1))

    if cat_id not in CATEGORIES:
        return JSONResponse({"error": "Invalid category"}, status_code=400)

    cat_path = CATEGORIES[cat_id]["url"]
    url = f"{BASE_URL}{cat_path}page/{page}/" if page > 1 else f"{BASE_URL}{cat_path}"

    conn = get_db()
    try:
        html = await fetch_html(url)
        movies = parse_movie_links(html)
        
        for m in movies:
            conn.execute(
                "INSERT OR IGNORE INTO movies (title, url, year, category) VALUES (?, ?, ?, ?)",
                (m["title"], m["url"], m["year"], cat_id)
            )
        conn.commit()

        # Retrieve with any cached metadata
        db_rows = conn.execute(
            "SELECT * FROM movies WHERE category = ? ORDER BY id DESC LIMIT 50", (cat_id,)
        ).fetchall()
        
        return JSONResponse({"movies": [dict(r) for r in db_rows] if db_rows else movies, "page": page})
    except Exception as e:
        # Fallback to DB
        db_rows = conn.execute(
            "SELECT * FROM movies WHERE category = ? ORDER BY id DESC LIMIT 50", (cat_id,)
        ).fetchall()
        return JSONResponse({"movies": [dict(r) for r in db_rows], "page": page, "cached": True})
    finally:
        conn.close()

async def api_atoz(request):
    letter = request.query_params.get("letter", "a").lower()
    if not letter.isalpha() or len(letter) != 1:
        return JSONResponse({"error": "Single letter A-Z required"}, status_code=400)

    url = f"{BASE_URL}/tamil-movies/{letter}/"
    conn = get_db()
    try:
        html = await fetch_html(url)
        movies = parse_movie_links(html)
        for m in movies:
            conn.execute(
                "INSERT OR IGNORE INTO movies (title, url, year, category) VALUES (?, ?, ?, ?)",
                (m["title"], m["url"], m["year"], f"atoz-{letter}")
            )
        conn.commit()
        return JSONResponse({"movies": movies, "letter": letter})
    except Exception as e:
        db_rows = conn.execute(
            "SELECT * FROM movies WHERE category = ? ORDER BY title ASC", (f"atoz-{letter}",)
        ).fetchall()
        return JSONResponse({"movies": [dict(r) for r in db_rows], "letter": letter, "cached": True})
    finally:
        conn.close()

async def api_details(request):
    movie_url = request.query_params.get("url", "").strip()
    if not movie_url:
        return JSONResponse({"error": "Movie URL parameter required"}, status_code=400)

    conn = get_db()
    try:
        # Check DB first
        row = conn.execute("SELECT * FROM movies WHERE url = ?", (movie_url,)).fetchone()
        if row and row["director"] and row["synopsis"]:
            data = dict(row)
            # Ensure download links are scraped
            html = await fetch_html(movie_url)
            details = parse_movie_details(html, movie_url)
            data["download_links"] = details["download_links"]
            return JSONResponse(data)

        # Scrape page
        html = await fetch_html(movie_url)
        details = parse_movie_details(html, movie_url)

        # Update DB
        conn.execute("""
            UPDATE movies SET 
            director = ?, starring = ?, genres = ?, quality = ?, language = ?, rating = ?, synopsis = ?, poster_url = ?
            WHERE url = ?
        """, (
            details["director"], details["starring"], details["genres"], details["quality"],
            details["language"], details["rating"], details["synopsis"], details["poster_url"], movie_url
        ))
        conn.commit()
        return JSONResponse(details)
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
    finally:
        conn.close()

async def api_resolve_download(request):
    url = request.query_params.get("url", "").strip()
    if not url:
        return JSONResponse({"error": "URL parameter required"}, status_code=400)
    try:
        async with httpx.AsyncClient(headers=HEADERS, follow_redirects=True, timeout=10) as client:
            curr = url
            # Level 1: moviesdatamil.net -> download.moviespage.xyz
            if "moviesdatamil.net" in curr:
                r1 = await client.get(curr)
                if r1.status_code == 200:
                    soup1 = BeautifulSoup(r1.text, "html.parser")
                    for a in soup1.find_all("a"):
                        href = a.get("href", "")
                        if "download.moviespage.xyz/download/file/" in href:
                            curr = href
                            break

            # Level 2: download.moviespage.xyz -> movies.downloadpage.xyz
            if "download.moviespage.xyz" in curr:
                r2 = await client.get(curr)
                if r2.status_code == 200:
                    soup2 = BeautifulSoup(r2.text, "html.parser")
                    for a in soup2.find_all("a"):
                        href = a.get("href", "")
                        if "downloadpage.xyz/download/page/" in href:
                            curr = href
                            break

            # Level 3: movies.downloadpage.xyz -> cdn.uptomkv.ch
            if "downloadpage.xyz" in curr:
                r3 = await client.get(curr)
                if r3.status_code == 200:
                    soup3 = BeautifulSoup(r3.text, "html.parser")
                    for a in soup3.find_all("a"):
                        href = a.get("href", "")
                        if "cdn.uptomkv.ch" in href or "download.php?dl=" in href:
                            curr = href
                            break

            return JSONResponse({"download_url": curr, "original_url": url})
    except Exception as e:
        return JSONResponse({"download_url": url, "original_url": url, "error": str(e)})

async def api_status(request):
    try:
        try:
            import sync_service
        except ImportError:
            from movie_web_app import sync_service
        conn = sync_service.get_db()
        total = conn.execute("SELECT COUNT(*) FROM movies").fetchone()[0]
        latest_logs = conn.execute("SELECT * FROM sync_logs ORDER BY id DESC LIMIT 15").fetchall()
        logs_list = [dict(l) for l in latest_logs]
        
        last_attempt = logs_list[0]["timestamp"] if logs_list else "N/A"
        last_success_row = conn.execute("SELECT timestamp FROM sync_logs WHERE status IN ('SUCCESS', 'PARTIAL_SUCCESS') ORDER BY id DESC LIMIT 1").fetchone()
        last_success = last_success_row[0] if last_success_row else "N/A"
        
        latest_log = logs_list[0] if logs_list else {}
        conn.close()
        
        return JSONResponse({
            "status": "active",
            "total_movies": total,
            "last_successful_sync": last_success,
            "last_attempted_sync": last_attempt,
            "number_of_movies_added": latest_log.get("added_count", 0),
            "number_updated": latest_log.get("updated_count", 0),
            "number_skipped": latest_log.get("skipped_count", 0),
            "number_of_errors": latest_log.get("error_count", 0),
            "next_scheduled_run": "Every 6 hours via GitHub Actions (0 */6 * * *)",
            "recent_logs": logs_list
        })
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)

async def api_sync(request):
    try:
        try:
            import sync_service
        except ImportError:
            from movie_web_app import sync_service
        if request.method == "POST":
            try:
                body = await request.json()
                feed_items = body.get("movies") if isinstance(body, dict) else None
                res = sync_service.process_movie_sync(feed_items)
            except Exception:
                res = sync_service.process_movie_sync()
        else:
            res = sync_service.process_movie_sync()
        return JSONResponse(res)
    except Exception as e:
        return JSONResponse({"error": str(e), "status": "ERROR"}, status_code=500)

async def serve_index(request):
    root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    return FileResponse(os.path.join(root_dir, "index.html"))

routes = [
    Route("/", serve_index),
    Route("/api/search", api_search),
    Route("/api/categories", api_categories),
    Route("/api/category", api_category),
    Route("/api/atoz", api_atoz),
    Route("/api/details", api_details),
    Route("/api/resolve_download", api_resolve_download),
    Route("/api/status", api_status, methods=["GET"]),
    Route("/api/sync", api_sync, methods=["GET", "POST"]),
    Mount("/", app=StaticFiles(directory=os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))), name="static")
]

middleware = [
    Middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
]

app = Starlette(debug=True, routes=routes, middleware=middleware)

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=5000)
