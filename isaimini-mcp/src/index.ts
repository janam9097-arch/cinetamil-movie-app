import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import initSqlJs, { type Database } from "sql.js";
type SqlJsDatabase = Database;
import * as cheerio from "cheerio";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// ─── Database Setup ──────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "..", "movies.db");
const BASE_URL = "https://moviesdatamil.net";

let SQL: Awaited<ReturnType<typeof initSqlJs>>;

async function getDb(): Promise<SqlJsDatabase> {
  if (!SQL) {
    SQL = await initSqlJs();
  }

  let db: SqlJsDatabase;
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS movies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      year TEXT,
      category TEXT,
      director TEXT,
      starring TEXT,
      genres TEXT,
      quality TEXT,
      language TEXT,
      rating TEXT,
      synopsis TEXT,
      poster_url TEXT,
      scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  db.run(`CREATE INDEX IF NOT EXISTS idx_movies_title ON movies(title COLLATE NOCASE);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_movies_year ON movies(year);`);

  return db;
}

function saveDb(db: SqlJsDatabase): void {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

// ─── Scraping Helpers ────────────────────────────────────────────────────────

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

interface MovieBasic {
  title: string;
  url: string;
  year: string;
}

/** Scrape a category listing page and return movie links */
function parseListingPage(html: string): MovieBasic[] {
  const $ = cheerio.load(html);
  const movies: MovieBasic[] = [];

  $("div.f a").each((_i, el) => {
    const href = $(el).attr("href");
    const text = $(el).text().trim();
    if (href && text && !href.startsWith("http")) {
      const yearMatch = text.match(/\((\d{4})\)/);
      const year = yearMatch ? yearMatch[1] : "";
      movies.push({
        title: text,
        url: `${BASE_URL}${href}`,
        year,
      });
    }
  });

  return movies;
}

/** Get total pages from a listing page */
function getTotalPages(html: string): number {
  const $ = cheerio.load(html);
  const totalPagesEl = $("span#totalPages");
  if (totalPagesEl.length) {
    return parseInt(totalPagesEl.text(), 10) || 1;
  }
  return 1;
}

interface MovieDetail {
  director: string;
  starring: string;
  genres: string;
  quality: string;
  language: string;
  rating: string;
  synopsis: string;
  posterUrl: string;
}

/** Scrape individual movie page for details */
function parseMoviePage(html: string): MovieDetail {
  const $ = cheerio.load(html);
  const info: MovieDetail = {
    director: "",
    starring: "",
    genres: "",
    quality: "",
    language: "",
    rating: "",
    synopsis: "",
    posterUrl: "",
  };

  $("ul.movie-info li").each((_i, el) => {
    const label = $(el).find("strong").text().replace(":", "").trim().toLowerCase();
    const value = $(el).find("span").text().trim();

    switch (label) {
      case "director": info.director = value; break;
      case "starring": info.starring = value; break;
      case "genres": info.genres = value; break;
      case "quality": info.quality = value; break;
      case "language": info.language = value; break;
      case "movie rating": info.rating = value; break;
    }
  });

  const synopsisEl = $("div.movie-synopsis");
  if (synopsisEl.length) {
    info.synopsis = synopsisEl.text().replace("Synopsis:", "").trim();
  }

  const posterEl = $("div.movie-info-container img");
  if (posterEl.length) {
    const src = posterEl.attr("src") || "";
    info.posterUrl = src.startsWith("http") ? src : `${BASE_URL}${src}`;
  }

  return info;
}

// ─── Category Definitions ────────────────────────────────────────────────────

const CATEGORIES: Record<string, string> = {
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
};

// ─── MCP Server ──────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "isaimini-movie-search",
  version: "1.0.0",
});

// ── Tool: search_movie ───────────────────────────────────────────────────────

server.tool(
  "search_movie",
  "Search for a Tamil movie by name in the local database and get its link on moviesdatamil.net",
  {
    query: z.string().describe("Movie name to search for (e.g. 'DC', 'Vikram', 'Leo')"),
    year: z.string().optional().describe("Optional year filter (e.g. '2026')"),
  },
  async ({ query, year }) => {
    const db = await getDb();

    try {
      let sql = `SELECT * FROM movies WHERE title LIKE '%' || ? || '%'`;
      const params: (string | number)[] = [query];

      if (year) {
        sql += ` AND year = ?`;
        params.push(year);
      }

      sql += ` ORDER BY scraped_at DESC LIMIT 20`;

      const stmt = db.prepare(sql);
      stmt.bind(params);

      const rows: Array<Record<string, unknown>> = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject());
      }
      stmt.free();

      if (rows.length === 0) {
        // Live fallback: search A-Z index
        const firstChar = query.trim().charAt(0).toLowerCase();
        if (/[a-z]/.test(firstChar)) {
          try {
            const azUrl = `${BASE_URL}/tamil-movies/${firstChar}/`;
            const html = await fetchPage(azUrl);
            const movies = parseListingPage(html);
            const matches = movies.filter((m) =>
              m.title.toLowerCase().includes(query.toLowerCase())
            );

            if (matches.length > 0) {
              for (const m of matches) {
                db.run(
                  `INSERT OR IGNORE INTO movies (title, url, year, category) VALUES (?, ?, ?, ?)`,
                  [m.title, m.url, m.year, `atoz-${firstChar}`]
                );
              }
              saveDb(db);

              const results = matches.map((m) => `🎬 ${m.title}\n   🔗 ${m.url}`).join("\n\n");
              return {
                content: [
                  {
                    type: "text" as const,
                    text: `Found ${matches.length} movie(s) matching "${query}" (live search):\n\n${results}`,
                  },
                ],
              };
            }
          } catch {
            // Live search failed
          }
        }

        return {
          content: [
            {
              type: "text" as const,
              text: `No movies found matching "${query}". Try running the "scrape_movies" tool first to populate the database, or check your spelling.`,
            },
          ],
        };
      }

      const results = rows
        .map((r) => {
          let info = `🎬 ${r.title}\n   🔗 ${r.url}`;
          if (r.director) info += `\n   🎬 Director: ${r.director}`;
          if (r.starring) info += `\n   ⭐ Starring: ${r.starring}`;
          if (r.genres) info += `\n   🎭 Genres: ${r.genres}`;
          if (r.quality) info += `\n   📀 Quality: ${r.quality}`;
          if (r.rating) info += `\n   ⭐ Rating: ${r.rating}`;
          if (r.synopsis) {
            const syn = String(r.synopsis);
            info += `\n   📝 ${syn.substring(0, 150)}...`;
          }
          return info;
        })
        .join("\n\n");

      return {
        content: [
          {
            type: "text" as const,
            text: `Found ${rows.length} movie(s) matching "${query}":\n\n${results}`,
          },
        ],
      };
    } finally {
      db.close();
    }
  }
);

// ── Tool: scrape_movies ──────────────────────────────────────────────────────

server.tool(
  "scrape_movies",
  "Scrape movie listings from moviesdatamil.net and store them in the local SQLite database. Run this to populate/refresh the movie database.",
  {
    category: z
      .string()
      .optional()
      .describe(
        `Category to scrape. Options: ${Object.keys(CATEGORIES).join(", ")}. Leave empty to scrape all categories.`
      ),
    max_pages: z
      .number()
      .optional()
      .describe("Max pages to scrape per category (default: 3). Set higher for more complete data."),
    fetch_details: z
      .boolean()
      .optional()
      .describe("If true, also fetches individual movie pages for details like director, cast, synopsis (slower). Default: false."),
  },
  async ({ category, max_pages, fetch_details }) => {
    const db = await getDb();
    const maxPages = max_pages ?? 3;
    const shouldFetchDetails = fetch_details ?? false;
    let totalScraped = 0;
    const errors: string[] = [];

    const categoriesToScrape = category
      ? { [category]: CATEGORIES[category] }
      : CATEGORIES;

    if (category && !CATEGORIES[category]) {
      db.close();
      return {
        content: [
          {
            type: "text" as const,
            text: `Invalid category "${category}". Available: ${Object.keys(CATEGORIES).join(", ")}`,
          },
        ],
      };
    }

    try {
      for (const [catName, catPath] of Object.entries(categoriesToScrape)) {
        try {
          const firstPageUrl = `${BASE_URL}${catPath}`;
          const firstPageHtml = await fetchPage(firstPageUrl);
          const totalPages = Math.min(getTotalPages(firstPageHtml), maxPages);

          const processMovies = async (movies: MovieBasic[]) => {
            for (const movie of movies) {
              let details: MovieDetail | null = null;
              if (shouldFetchDetails) {
                try {
                  const movieHtml = await fetchPage(movie.url);
                  details = parseMoviePage(movieHtml);
                  await new Promise((r) => setTimeout(r, 300));
                } catch {
                  // Skip detail fetch errors
                }
              }

              db.run(
                `INSERT OR REPLACE INTO movies (title, url, year, category, director, starring, genres, quality, language, rating, synopsis, poster_url)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  movie.title, movie.url, movie.year, catName,
                  details?.director || "", details?.starring || "",
                  details?.genres || "", details?.quality || "",
                  details?.language || "", details?.rating || "",
                  details?.synopsis || "", details?.posterUrl || "",
                ]
              );
              totalScraped++;
            }
          };

          // Parse first page
          await processMovies(parseListingPage(firstPageHtml));

          // Parse remaining pages
          for (let page = 2; page <= totalPages; page++) {
            try {
              const pageUrl = `${firstPageUrl}?page=${page}`;
              const pageHtml = await fetchPage(pageUrl);
              await processMovies(parseListingPage(pageHtml));
              await new Promise((r) => setTimeout(r, 500));
            } catch (e) {
              errors.push(`Page ${page} of ${catName}: ${e}`);
            }
          }
        } catch (e) {
          errors.push(`Category ${catName}: ${e}`);
        }
      }

      // Save to disk
      saveDb(db);

      // Get DB stats
      const countResult = db.exec("SELECT COUNT(*) as count FROM movies");
      const totalMovies = countResult[0]?.values[0]?.[0] ?? 0;

      let result = `✅ Scraping complete!\n\n`;
      result += `📊 Movies scraped this run: ${totalScraped}\n`;
      result += `📦 Total movies in database: ${totalMovies}\n`;

      if (errors.length > 0) {
        result += `\n⚠️ Errors (${errors.length}):\n${errors.map((e) => `  - ${e}`).join("\n")}`;
      }

      return {
        content: [{ type: "text" as const, text: result }],
      };
    } finally {
      db.close();
    }
  }
);

// ── Tool: get_movie_details ──────────────────────────────────────────────────

server.tool(
  "get_movie_details",
  "Get detailed information about a specific movie from its moviesdatamil.net page",
  {
    movie_url: z.string().describe("The full URL of the movie page on moviesdatamil.net"),
  },
  async ({ movie_url }) => {
    try {
      const html = await fetchPage(movie_url);
      const details = parseMoviePage(html);
      const $ = cheerio.load(html);

      const title = $("h1").first().text().trim() || "Unknown";

      // Extract download links
      const downloadLinks: { text: string; url: string }[] = [];
      $("div.f a").each((_i, el) => {
        const href = $(el).attr("href");
        const text = $(el).text().trim();
        if (href && text) {
          const fullUrl = href.startsWith("http") ? href : `${BASE_URL}${href}`;
          downloadLinks.push({ text, url: fullUrl });
        }
      });

      // Update DB
      const db = await getDb();
      try {
        db.run(
          `UPDATE movies SET director=?, starring=?, genres=?, quality=?, language=?, rating=?, synopsis=?, poster_url=? WHERE url=?`,
          [
            details.director, details.starring, details.genres, details.quality,
            details.language, details.rating, details.synopsis, details.posterUrl,
            movie_url,
          ]
        );
        saveDb(db);
      } finally {
        db.close();
      }

      let result = `🎬 ${title}\n\n`;
      if (details.director) result += `🎬 Director: ${details.director}\n`;
      if (details.starring) result += `⭐ Starring: ${details.starring}\n`;
      if (details.genres) result += `🎭 Genres: ${details.genres}\n`;
      if (details.quality) result += `📀 Quality: ${details.quality}\n`;
      if (details.language) result += `🗣️ Language: ${details.language}\n`;
      if (details.rating) result += `⭐ Rating: ${details.rating}\n`;
      if (details.synopsis) result += `\n📝 Synopsis: ${details.synopsis}\n`;
      if (details.posterUrl) result += `\n🖼️ Poster: ${details.posterUrl}\n`;

      if (downloadLinks.length > 0) {
        result += `\n📥 Available Downloads:\n`;
        result += downloadLinks.map((l) => `  • ${l.text} → ${l.url}`).join("\n");
      }

      return {
        content: [{ type: "text" as const, text: result }],
      };
    } catch (e) {
      return {
        content: [
          { type: "text" as const, text: `❌ Error fetching movie details: ${e}` },
        ],
      };
    }
  }
);

// ── Tool: list_categories ────────────────────────────────────────────────────

server.tool(
  "list_categories",
  "List all available movie categories that can be scraped from moviesdatamil.net",
  {},
  async () => {
    const db = await getDb();
    try {
      const statsResult = db.exec(
        `SELECT category, COUNT(*) as count FROM movies GROUP BY category ORDER BY category`
      );

      const stats: Array<{ category: string; count: number }> = [];
      if (statsResult.length > 0) {
        for (const row of statsResult[0].values) {
          stats.push({ category: String(row[0]), count: Number(row[1]) });
        }
      }

      let result = `📂 Available Categories:\n\n`;
      for (const [name, catPath] of Object.entries(CATEGORIES)) {
        const stat = stats.find((s) => s.category === name);
        const count = stat ? ` (${stat.count} movies in DB)` : ` (not yet scraped)`;
        result += `  • ${name} → ${BASE_URL}${catPath}${count}\n`;
      }

      const countResult = db.exec("SELECT COUNT(*) FROM movies");
      const totalMovies = countResult[0]?.values[0]?.[0] ?? 0;
      result += `\n📦 Total movies in database: ${totalMovies}`;

      return {
        content: [{ type: "text" as const, text: result }],
      };
    } finally {
      db.close();
    }
  }
);

// ── Tool: browse_atoz ────────────────────────────────────────────────────────

server.tool(
  "browse_atoz",
  "Browse movies alphabetically by their first letter from moviesdatamil.net",
  {
    letter: z.string().length(1).describe("Single letter A-Z to browse movies"),
  },
  async ({ letter }) => {
    const lowerLetter = letter.toLowerCase();
    if (!/^[a-z]$/.test(lowerLetter)) {
      return {
        content: [{ type: "text" as const, text: "Please provide a single letter A-Z." }],
      };
    }

    try {
      const url = `${BASE_URL}/tamil-movies/${lowerLetter}/`;
      const html = await fetchPage(url);
      const movies = parseListingPage(html);

      if (movies.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No movies found starting with "${letter.toUpperCase()}".`,
            },
          ],
        };
      }

      // Save to DB
      const db = await getDb();
      try {
        for (const m of movies) {
          db.run(
            `INSERT OR IGNORE INTO movies (title, url, year, category) VALUES (?, ?, ?, ?)`,
            [m.title, m.url, m.year, `atoz-${lowerLetter}`]
          );
        }
        saveDb(db);
      } finally {
        db.close();
      }

      const results = movies
        .map((m) => `🎬 ${m.title}\n   🔗 ${m.url}`)
        .join("\n\n");

      return {
        content: [
          {
            type: "text" as const,
            text: `Movies starting with "${letter.toUpperCase()}" (${movies.length} found):\n\n${results}`,
          },
        ],
      };
    } catch (e) {
      return {
        content: [{ type: "text" as const, text: `❌ Error browsing: ${e}` }],
      };
    }
  }
);

// ─── Start Server ────────────────────────────────────────────────────────────

async function main() {
  if (process.stderr && typeof process.stderr.setEncoding === "function") {
    process.stderr.setEncoding("utf-8");
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("🎬 Isaimini MCP Server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
