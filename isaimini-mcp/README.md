# 🎬 Isaimini MCP Server

A Model Context Protocol (MCP) server that searches and retrieves Tamil movie links from **moviesdatamil.net** (isaimini). Uses a local **SQLite database** for fast searching and caching.

## Features

| Tool | Description |
|------|-------------|
| `search_movie` | Search movies by name (with live fallback to A-Z index) |
| `scrape_movies` | Bulk scrape movie listings by category and store in SQLite |
| `get_movie_details` | Fetch detailed info (director, cast, synopsis) for a specific movie |
| `list_categories` | List available categories and DB stats |
| `browse_atoz` | Browse movies alphabetically by first letter |

## Setup

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run the server (for testing)
npm start
```

## Configure with Claude Desktop

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "isaimini-movies": {
      "command": "node",
      "args": ["d:/New folder/isaimini-mcp/dist/index.js"]
    }
  }
}
```

**Config file location:**
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`

## Usage Examples

### 1. First, scrape some movies:
> "Scrape Tamil 2026 movies"

The `scrape_movies` tool will fetch movie listings and store them in the SQLite database.

### 2. Search for a movie:
> "Search for the movie DC"

The `search_movie` tool will query the local database and return matching movies with their links.

### 3. Get movie details:
> "Get details for https://moviesdatamil.net/dc-2026-tamil-movie/"

The `get_movie_details` tool will fetch director, cast, synopsis, quality, and download links.

### 4. Browse alphabetically:
> "Show me all movies starting with V"

The `browse_atoz` tool will fetch and display movies from the A-Z index.

## Database

Movies are stored in `movies.db` (SQLite) in the project root with the following schema:

- `title` - Movie name
- `url` - Full URL on moviesdatamil.net
- `year` - Release year
- `category` - Source category
- `director`, `starring`, `genres`, `quality`, `language`, `rating`, `synopsis`, `poster_url` - Movie details

## Tech Stack

- **MCP SDK** - `@modelcontextprotocol/sdk`
- **SQLite** - `better-sqlite3`
- **HTML Parser** - `cheerio`
- **Validation** - `zod`
- **Runtime** - Node.js 20+
