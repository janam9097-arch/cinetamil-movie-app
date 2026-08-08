"""
Isaimini MCP Server - Search Tamil movies from moviesdatamil.net
Uses SQLite for caching and BeautifulSoup for scraping.
"""

import sqlite3
import os
import re
import sys
import logging
import asyncio
from typing import Optional

# Ensure UTF-8 I/O encoding on Windows for MCP stdio transport
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

# Suppress HTTP client logging to avoid contaminating stdio streams
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

import httpx
from bs4 import BeautifulSoup
from mcp.server.mcpserver import MCPServer

# ─── Configuration ────────────────────────────────────────────────────────────

BASE_URL = "https://moviesdatamil.net"
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "movies.db")

CATEGORIES = {
    "tamil-2026": "/tamil-2026-movies/",
    "tamil-2025": "/tamil-2025-movies/",
    "tamil-2024": "/tamil-2024-movies/",
    "tamil-2023": "/tamil-2023-movies/",
    "tamil-2022": "/tamil-2022-movies/",
    "tamil-2021": "/tamil-2021-movies/",
    "tamil-2020": "/tamil-2020-movies/",
    "tamil-2019": "/tamil-2019-movies/",
    "tamil-2018": "/tamil-2018-movies/",
    "tamil-2017": "/tamil-2017-movies/",
    "tamil-2016": "/tamil-2016-movies/",
    "tamil-2015": "/tamil-2015-movies/",
    "tamil-hd": "/tamil-hd-movies/",
    "tamil-dubbed": "/tamil-dubbed-movies/",
    "web-series": "/tamil-web-series-download/",
    "collections": "/tamil-movies-collection/",
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

# ─── Database ─────────────────────────────────────────────────────────────────


def get_db() -> sqlite3.Connection:
    """Get a connection to the SQLite database."""
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.execute("""
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
    db.execute("CREATE INDEX IF NOT EXISTS idx_title ON movies(title COLLATE NOCASE)")
    db.execute("CREATE INDEX IF NOT EXISTS idx_year ON movies(year)")
    db.commit()
    return db


# ─── Scraping Helpers ─────────────────────────────────────────────────────────


async def fetch_page(url: str) -> str:
    """Fetch a web page and return its HTML content."""
    async with httpx.AsyncClient(headers=HEADERS, follow_redirects=True, timeout=30) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        return resp.text


def parse_listing_page(html: str) -> list[dict]:
    """Parse a category listing page and extract movie links."""
    soup = BeautifulSoup(html, "html.parser")
    movies = []

    for link in soup.select("div.f a"):
        href = link.get("href", "")
        text = link.get_text(strip=True)

        if href and text and not href.startswith("http"):
            year_match = re.search(r"\((\d{4})\)", text)
            year = year_match.group(1) if year_match else ""
            movies.append({
                "title": text,
                "url": f"{BASE_URL}{href}",
                "year": year,
            })

    return movies


def get_total_pages(html: str) -> int:
    """Get total number of pages from a listing page."""
    soup = BeautifulSoup(html, "html.parser")
    total_el = soup.select_one("span#totalPages")
    if total_el:
        try:
            return int(total_el.get_text(strip=True))
        except ValueError:
            pass
    return 1


def parse_movie_page(html: str) -> dict:
    """Parse an individual movie page for detailed info."""
    soup = BeautifulSoup(html, "html.parser")
    info = {
        "director": "", "starring": "", "genres": "",
        "quality": "", "language": "", "rating": "",
        "synopsis": "", "poster_url": "",
    }

    for li in soup.select("ul.movie-info li"):
        strong = li.find("strong")
        span = li.find("span")
        if strong and span:
            label = strong.get_text(strip=True).replace(":", "").lower()
            value = span.get_text(strip=True)
            mapping = {
                "director": "director", "starring": "starring",
                "genres": "genres", "quality": "quality",
                "language": "language", "movie rating": "rating",
            }
            if label in mapping:
                info[mapping[label]] = value

    synopsis_el = soup.select_one("div.movie-synopsis")
    if synopsis_el:
        info["synopsis"] = synopsis_el.get_text(strip=True).replace("Synopsis:", "", 1).strip()

    poster_el = soup.select_one("div.movie-info-container img")
    if poster_el:
        src = poster_el.get("src", "")
        info["poster_url"] = src if src.startswith("http") else f"{BASE_URL}{src}"

    return info


# ─── MCP Server ───────────────────────────────────────────────────────────────

mcp = MCPServer(
    name="isaimini-movie-search",
    description="Search and get Tamil movie links from moviesdatamil.net (isaimini)",
)


@mcp.tool()
async def search_movie(query: str, year: Optional[str] = None) -> str:
    """
    Search for a Tamil movie by name in the local database and get its link.
    If no results in DB, automatically tries a live search on the A-Z index.

    Args:
        query: Movie name to search for (e.g. 'DC', 'Vikram', 'Leo')
        year: Optional year filter (e.g. '2026')
    """
    db = get_db()
    try:
        sql = "SELECT * FROM movies WHERE title LIKE ? COLLATE NOCASE"
        params: list = [f"%{query}%"]

        if year:
            sql += " AND year = ?"
            params.append(year)

        sql += " ORDER BY scraped_at DESC LIMIT 20"
        rows = db.execute(sql, params).fetchall()

        if not rows:
            # Live fallback: try A-Z index
            first_char = query.strip()[0].lower() if query.strip() else ""
            if first_char.isalpha():
                try:
                    az_url = f"{BASE_URL}/tamil-movies/{first_char}/"
                    html = await fetch_page(az_url)
                    movies = parse_listing_page(html)
                    matches = [m for m in movies if query.lower() in m["title"].lower()]

                    if matches:
                        for m in matches:
                            db.execute(
                                "INSERT OR IGNORE INTO movies (title, url, year, category) VALUES (?, ?, ?, ?)",
                                (m["title"], m["url"], m["year"], f"atoz-{first_char}"),
                            )
                        db.commit()

                        results = "\n\n".join(
                            f"  {m['title']}\n   Link: {m['url']}" for m in matches
                        )
                        return f'Found {len(matches)} movie(s) matching "{query}" (live search):\n\n{results}'
                except Exception:
                    pass

            return (
                f'No movies found matching "{query}". '
                f'Try running the "scrape_movies" tool first to populate the database.'
            )

        results = []
        for r in rows:
            info = f"  {r['title']}\n   Link: {r['url']}"
            if r["director"]:
                info += f"\n   Director: {r['director']}"
            if r["starring"]:
                info += f"\n   Starring: {r['starring']}"
            if r["genres"]:
                info += f"\n   Genres: {r['genres']}"
            if r["quality"]:
                info += f"\n   Quality: {r['quality']}"
            if r["rating"]:
                info += f"\n   Rating: {r['rating']}"
            if r["synopsis"]:
                info += f"\n   Synopsis: {r['synopsis'][:150]}..."
            results.append(info)

        return f'Found {len(rows)} movie(s) matching "{query}":\n\n' + "\n\n".join(results)
    finally:
        db.close()


@mcp.tool()
async def scrape_movies(
    category: Optional[str] = None,
    max_pages: int = 3,
    fetch_details: bool = False,
) -> str:
    """
    Scrape movie listings from moviesdatamil.net and store in the local SQLite database.

    Args:
        category: Category to scrape (e.g. 'tamil-2026', 'tamil-2025', 'tamil-hd'). Leave empty for all.
        max_pages: Max pages per category (default 3).
        fetch_details: If True, fetch director/cast/synopsis per movie (slower).
    """
    if category and category not in CATEGORIES:
        return f'Invalid category "{category}". Available: {", ".join(CATEGORIES.keys())}'

    db = get_db()
    cats = {category: CATEGORIES[category]} if category else CATEGORIES
    total_scraped = 0
    errors = []

    try:
        for cat_name, cat_path in cats.items():
            try:
                first_url = f"{BASE_URL}{cat_path}"
                first_html = await fetch_page(first_url)
                total_pages = min(get_total_pages(first_html), max_pages)

                async def process_movies(movies_list: list[dict]):
                    nonlocal total_scraped
                    for movie in movies_list:
                        details = {}
                        if fetch_details:
                            try:
                                movie_html = await fetch_page(movie["url"])
                                details = parse_movie_page(movie_html)
                                await asyncio.sleep(0.3)
                            except Exception:
                                pass

                        db.execute(
                            """INSERT OR REPLACE INTO movies
                               (title, url, year, category, director, starring,
                                genres, quality, language, rating, synopsis, poster_url)
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                            (
                                movie["title"], movie["url"], movie["year"], cat_name,
                                details.get("director", ""), details.get("starring", ""),
                                details.get("genres", ""), details.get("quality", ""),
                                details.get("language", ""), details.get("rating", ""),
                                details.get("synopsis", ""), details.get("poster_url", ""),
                            ),
                        )
                        total_scraped += 1

                await process_movies(parse_listing_page(first_html))

                for page in range(2, total_pages + 1):
                    try:
                        page_url = f"{first_url}?page={page}"
                        page_html = await fetch_page(page_url)
                        await process_movies(parse_listing_page(page_html))
                        await asyncio.sleep(0.5)
                    except Exception as e:
                        errors.append(f"Page {page} of {cat_name}: {e}")

            except Exception as e:
                errors.append(f"Category {cat_name}: {e}")

        db.commit()
        total_in_db = db.execute("SELECT COUNT(*) FROM movies").fetchone()[0]

        result = "Scraping complete!\n\n"
        result += f"Movies scraped this run: {total_scraped}\n"
        result += f"Total movies in database: {total_in_db}\n"

        if errors:
            result += f"\nErrors ({len(errors)}):\n" + "\n".join(f"  - {e}" for e in errors)

        return result
    finally:
        db.close()


@mcp.tool()
async def get_movie_details(movie_url: str) -> str:
    """
    Get detailed info about a specific movie from its moviesdatamil.net page.

    Args:
        movie_url: Full URL of the movie page (e.g. 'https://moviesdatamil.net/dc-2026-tamil-movie/')
    """
    try:
        html = await fetch_page(movie_url)
        details = parse_movie_page(html)
        soup = BeautifulSoup(html, "html.parser")

        title_el = soup.find("h1")
        title = title_el.get_text(strip=True) if title_el else "Unknown"

        download_links = []
        for div in soup.select("div.f a"):
            href = div.get("href", "")
            text = div.get_text(strip=True)
            if href and text:
                full_url = href if href.startswith("http") else f"{BASE_URL}{href}"
                download_links.append({"text": text, "url": full_url})

        # Update DB
        db = get_db()
        try:
            db.execute(
                """UPDATE movies SET director=?, starring=?, genres=?, quality=?,
                   language=?, rating=?, synopsis=?, poster_url=? WHERE url=?""",
                (
                    details["director"], details["starring"], details["genres"],
                    details["quality"], details["language"], details["rating"],
                    details["synopsis"], details["poster_url"], movie_url,
                ),
            )
            db.commit()
        finally:
            db.close()

        result = f"{title}\n\n"
        if details["director"]:
            result += f"Director: {details['director']}\n"
        if details["starring"]:
            result += f"Starring: {details['starring']}\n"
        if details["genres"]:
            result += f"Genres: {details['genres']}\n"
        if details["quality"]:
            result += f"Quality: {details['quality']}\n"
        if details["language"]:
            result += f"Language: {details['language']}\n"
        if details["rating"]:
            result += f"Rating: {details['rating']}\n"
        if details["synopsis"]:
            result += f"\nSynopsis: {details['synopsis']}\n"
        if details["poster_url"]:
            result += f"\nPoster: {details['poster_url']}\n"

        if download_links:
            result += "\nAvailable Downloads:\n"
            result += "\n".join(f"  - {l['text']} -> {l['url']}" for l in download_links)

        return result

    except Exception as e:
        return f"Error fetching movie details: {e}"


@mcp.tool()
async def list_categories() -> str:
    """List all available movie categories and show how many movies are cached in the database for each."""
    db = get_db()
    try:
        stats = db.execute(
            "SELECT category, COUNT(*) as count FROM movies GROUP BY category ORDER BY category"
        ).fetchall()
        stats_map = {r["category"]: r["count"] for r in stats}

        result = "Available Categories:\n\n"
        for name, path in CATEGORIES.items():
            count = stats_map.get(name)
            label = f" ({count} movies in DB)" if count else " (not yet scraped)"
            result += f"  - {name} -> {BASE_URL}{path}{label}\n"

        total = db.execute("SELECT COUNT(*) FROM movies").fetchone()[0]
        result += f"\nTotal movies in database: {total}"
        return result
    finally:
        db.close()


@mcp.tool()
async def browse_atoz(letter: str) -> str:
    """
    Browse movies alphabetically by first letter from moviesdatamil.net.

    Args:
        letter: A single letter A-Z to browse movies starting with that letter.
    """
    letter = letter.strip().lower()
    if len(letter) != 1 or not letter.isalpha():
        return "Please provide a single letter A-Z."

    try:
        url = f"{BASE_URL}/tamil-movies/{letter}/"
        html = await fetch_page(url)
        movies = parse_listing_page(html)

        if not movies:
            return f'No movies found starting with "{letter.upper()}".'

        db = get_db()
        try:
            for m in movies:
                db.execute(
                    "INSERT OR IGNORE INTO movies (title, url, year, category) VALUES (?, ?, ?, ?)",
                    (m["title"], m["url"], m["year"], f"atoz-{letter}"),
                )
            db.commit()
        finally:
            db.close()

        results = "\n\n".join(f"  {m['title']}\n   Link: {m['url']}" for m in movies)
        return f'Movies starting with "{letter.upper()}" ({len(movies)} found):\n\n{results}'

    except Exception as e:
        return f"Error browsing: {e}"


# ─── Entry Point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    mcp.run(transport="stdio")
