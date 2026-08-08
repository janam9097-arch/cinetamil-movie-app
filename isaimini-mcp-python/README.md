# Isaimini MCP Server (Python)

A Python MCP server that searches Tamil movies from **moviesdatamil.net** (isaimini) and stores them in a local **SQLite database**.

## Requirements

```bash
pip install mcp beautifulsoup4 httpx
```

## Run

```bash
python server.py
```

## Claude Desktop Configuration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "isaimini-movies": {
      "command": "d:/New folder/isaimini-mcp-python/.venv/Scripts/python.exe",
      "args": ["d:/New folder/isaimini-mcp-python/server.py"],
      "env": {
        "PYTHONUNBUFFERED": "1",
        "PYTHONIOENCODING": "utf-8"
      }
    }
  }
}
```

**Config file location:** `%APPDATA%\Claude\claude_desktop_config.json`

## Tools

| Tool | Description |
|------|-------------|
| `search_movie` | Search by movie name (auto-falls back to live A-Z scraping) |
| `scrape_movies` | Bulk scrape 16 categories with pagination into SQLite |
| `get_movie_details` | Fetch director, cast, synopsis, download links for a movie |
| `list_categories` | Show all categories and cached movie counts |
| `browse_atoz` | Browse movies alphabetically (A-Z index) |

## Usage

1. **Scrape first:** Ask Claude to "scrape Tamil 2026 movies"
2. **Search:** Ask "search for DC movie"
3. **Details:** Ask "get details for https://moviesdatamil.net/dc-2026-tamil-movie/"
