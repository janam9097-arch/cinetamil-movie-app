const CORS_PROXIES = [
  "https://api.allorigins.win/raw?url=",
  "https://corsproxy.io/?"
];

const BASE_URL = "https://moviesdatamil.net";

const CATEGORIES = [
  { id: "tamil-2026", label: "2026 Movies", path: "/tamil-2026-movies/" },
  { id: "tamil-2025", label: "2025 Movies", path: "/tamil-2025-movies/" },
  { id: "tamil-2024", label: "2024 Movies", path: "/tamil-2024-movies/" },
  { id: "tamil-2023", label: "2023 Movies", path: "/tamil-2023-movies/" },
  { id: "tamil-2022", label: "2022 Movies", path: "/tamil-2022-movies/" },
  { id: "tamil-2015", label: "2015 Movies", path: "/tamil-2015-movies/" },
  { id: "tamil-hd", label: "HD Movies", path: "/tamil-hd-movies/" },
  { id: "tamil-dubbed", label: "Tamil Dubbed", path: "/tamil-dubbed-movies/" },
  { id: "web-series", label: "Web Series", path: "/tamil-web-series-download/" },
  { id: "collections", label: "Collections", path: "/tamil-movies-collection/" }
];

let currentCategory = "tamil-2025";
let debounceTimer = null;

document.addEventListener("DOMContentLoaded", () => {
  renderCategoryPills();
  renderAtoZBar();

  const searchInput = document.getElementById("searchInput");
  searchInput.addEventListener("input", (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const q = e.target.value.trim();
      if (q.length > 0) {
        performSearch(q);
      } else {
        loadCategory(currentCategory);
      }
    }, 300);
  });

  // Default load
  loadCategory("tamil-2025");
});

// Render Category Pills
function renderCategoryPills() {
  const container = document.getElementById("categoryPills");
  container.innerHTML = "";

  CATEGORIES.forEach(cat => {
    const btn = document.createElement("button");
    btn.className = `pill-btn ${cat.id === currentCategory ? "active" : ""}`;
    btn.innerText = cat.label;
    btn.onclick = () => {
      document.querySelectorAll(".pill-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      loadCategory(cat.id);
    };
    container.appendChild(btn);
  });
}

// Render A-Z Bar
function renderAtoZBar() {
  const container = document.getElementById("atozBar");
  container.innerHTML = "";
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  letters.forEach(letter => {
    const btn = document.createElement("button");
    btn.className = "atoz-btn";
    btn.innerText = letter;
    btn.onclick = () => loadAtoZ(letter, btn);
    container.appendChild(btn);
  });
}

// CORS Proxy Fetcher
async function fetchHtmlWithProxy(targetUrl) {
  for (const proxy of CORS_PROXIES) {
    try {
      const res = await fetch(proxy + encodeURIComponent(targetUrl));
      if (res.ok) {
        const text = await res.text();
        if (text && text.includes("html")) return text;
      }
    } catch (e) {
      console.warn("Proxy failed:", proxy, e);
    }
  }
  throw new Error("Unable to fetch via CORS proxies.");
}

// Parse Listing HTML
function parseListingPage(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const movies = [];

  const links = doc.querySelectorAll("div.f a");
  links.forEach(link => {
    const href = link.getAttribute("href") || "";
    const text = link.textContent.trim();
    if (href && text && !href.startswith("http")) {
      const yearMatch = text.match(/\((\d{4})\)/);
      const year = yearMatch ? yearMatch[1] : "";
      const fullUrl = href.startsWith("/") ? `${BASE_URL}${href}` : `${BASE_URL}/${href}`;
      movies.push({
        title: text,
        url: fullUrl,
        year: year
      });
    }
  });
  return movies;
}

// Show Spinner
function showLoading() {
  const container = document.getElementById("moviesContainer");
  container.innerHTML = `
    <div class="spinner-wrapper" style="grid-column: 1 / -1;">
      <div class="spinner"></div>
      <p>Fetching movies catalog...</p>
    </div>
  `;
}

// Render Movies Grid
function renderMoviesGrid(movies) {
  const container = document.getElementById("moviesContainer");
  const countEl = document.getElementById("resultCount");
  container.innerHTML = "";
  countEl.innerText = `${movies.length} Movie(s)`;

  if (!movies || movies.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 60px 0; color: var(--text-secondary);">
        <i class="fa-solid fa-film" style="font-size: 3rem; color: var(--accent-blue); margin-bottom: 15px;"></i>
        <h3>No movies found</h3>
        <p>Try searching for a different keyword or select another category.</p>
      </div>
    `;
    return;
  }

  movies.forEach(m => {
    const card = document.createElement("div");
    card.className = "movie-card";
    card.onclick = () => openMovieDetails(m.url, m.title, m);

    const hasPoster = m.poster_url && m.poster_url.startsWith("http");
    const yearBadge = m.year ? `<span class="badge-year">${m.year}</span>` : "";

    card.innerHTML = `
      <div class="poster-box">
        ${yearBadge}
        ${hasPoster 
          ? `<img src="${m.poster_url}" class="poster-img" alt="${m.title}" loading="lazy">` 
          : `<div class="poster-placeholder"><i class="fa-solid fa-clapperboard"></i><span>${m.year || "Tamil"}</span></div>`}
      </div>
      <div class="card-body">
        <h3 class="card-title">${m.title}</h3>
        <div class="card-meta">
          <span><i class="fa-solid fa-film"></i> Moviesda HD Rip</span>
        </div>
        <button class="btn-details">
          <i class="fa-solid fa-arrow-down-to-line"></i> Download & Details
        </button>
      </div>
    `;
    container.appendChild(card);
  });
}

// Load Category
async function loadCategory(catId) {
  currentCategory = catId;
  const catObj = CATEGORIES.find(c => c.id === catId) || CATEGORIES[0];

  document.getElementById("sectionTitle").innerText = catObj.label;
  document.getElementById("sectionSubtitle").innerText = `Browsing ${catObj.label} catalog`;
  showLoading();

  document.querySelectorAll(".atoz-btn").forEach(b => b.classList.remove("active"));

  // 1. Try local dataset first
  const cachedMatches = (typeof CACHED_MOVIES_DB !== "undefined") 
    ? CACHED_MOVIES_DB.filter(m => m.category === catId || (m.year && catId.includes(m.year)))
    : [];

  if (cachedMatches.length > 0) {
    renderMoviesGrid(cachedMatches);
  }

  // 2. Fetch live updates via CORS proxy
  try {
    const html = await fetchHtmlWithProxy(`${BASE_URL}${catObj.path}`);
    const liveMovies = parseListingPage(html);
    if (liveMovies && liveMovies.length > 0) {
      renderMoviesGrid(liveMovies);
    }
  } catch (err) {
    console.warn("Live category fetch error, showing cached:", err);
    if (cachedMatches.length === 0 && typeof CACHED_MOVIES_DB !== "undefined") {
      renderMoviesGrid(CACHED_MOVIES_DB.slice(0, 30));
    }
  }
}

// Load A-Z Index
async function loadAtoZ(letter, btnEl) {
  document.querySelectorAll(".atoz-btn").forEach(b => b.classList.remove("active"));
  if (btnEl) btnEl.classList.add("active");

  const l = letter.toLowerCase();
  document.getElementById("sectionTitle").innerText = `Alphabet: '${letter.toUpperCase()}'`;
  document.getElementById("sectionSubtitle").innerText = `Movies starting with ${letter.toUpperCase()}`;
  showLoading();

  // Local dataset filter
  const localMatches = (typeof CACHED_MOVIES_DB !== "undefined")
    ? CACHED_MOVIES_DB.filter(m => m.title.toLowerCase().startsWith(l))
    : [];

  if (localMatches.length > 0) {
    renderMoviesGrid(localMatches);
  }

  try {
    const html = await fetchHtmlWithProxy(`${BASE_URL}/tamil-movies/${l}/`);
    const liveMovies = parseListingPage(html);
    if (liveMovies && liveMovies.length > 0) {
      renderMoviesGrid(liveMovies);
    }
  } catch (e) {
    console.warn("Live A-Z fetch failed:", e);
  }
}

// Perform Search
async function performSearch(query) {
  const q = query.toLowerCase().trim();
  document.getElementById("sectionTitle").innerText = `Search: "${query}"`;
  document.getElementById("sectionSubtitle").innerText = `Movies matching "${query}"`;
  showLoading();

  // Instant search in CACHED_MOVIES_DB
  let localResults = [];
  if (typeof CACHED_MOVIES_DB !== "undefined") {
    localResults = CACHED_MOVIES_DB.filter(m => 
      m.title.toLowerCase().includes(q) ||
      (m.starring && m.starring.toLowerCase().includes(q)) ||
      (m.director && m.director.toLowerCase().includes(q))
    );
  }

  renderMoviesGrid(localResults);

  // Live A-Z search fallback
  if (q.length > 0 && q[0].match(/[a-z]/i)) {
    try {
      const firstChar = q[0].toLowerCase();
      const html = await fetchHtmlWithProxy(`${BASE_URL}/tamil-movies/${firstChar}/`);
      const liveMovies = parseListingPage(html);
      const matches = liveMovies.filter(m => m.title.toLowerCase().includes(q));

      if (matches.length > 0) {
        // Merge without duplicates
        const existingUrls = new Set(localResults.map(r => r.url));
        matches.forEach(m => {
          if (!existingUrls.has(m.url)) localResults.push(m);
        });
        renderMoviesGrid(localResults);
      }
    } catch (e) {
      console.warn("Live search fallback error:", e);
    }
  }
}

// Open Details Modal
async function openMovieDetails(movieUrl, title, cachedData = {}) {
  const modal = document.getElementById("movieModal");
  const content = document.getElementById("modalContent");

  modal.classList.add("active");
  content.innerHTML = `
    <div class="spinner-wrapper">
      <div class="spinner"></div>
      <p>Loading download links & details...</p>
    </div>
  `;

  let details = {
    title: title,
    url: movieUrl,
    director: cachedData.director || "",
    starring: cachedData.starring || "",
    quality: cachedData.quality || "Moviesda HD",
    synopsis: cachedData.synopsis || "",
    poster_url: cachedData.poster_url || "",
    download_links: []
  };

  try {
    const html = await fetchHtmlWithProxy(movieUrl);
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    // Title
    const h1 = doc.querySelector("h1, h2, div.title");
    if (h1) details.title = h1.textContent.trim();

    // Poster
    const img = doc.querySelector("div.movie-info-container img, img.poster");
    if (img) {
      const src = img.getAttribute("src") || "";
      details.poster_url = src.startsWith("http") ? src : `${BASE_URL}${src}`;
    }

    // Synopsis
    const syn = doc.querySelector("div.movie-synopsis");
    if (syn) details.synopsis = syn.textContent.replace("Synopsis:", "").trim();

    // Download links
    const dlinks = doc.querySelectorAll("div.f a, a.dlink");
    dlinks.forEach(a => {
      const txt = a.textContent.trim();
      const href = a.getAttribute("href") || "";
      if (txt && href) {
        const fullHref = href.startsWith("http") ? href : `${BASE_URL}${href}`;
        details.download_links.push({ label: txt, url: fullHref });
      }
    });
  } catch (err) {
    console.warn("Could not parse detailed movie page:", err);
  }

  // Render Modal
  const hasPoster = details.poster_url && details.poster_url.startsWith("http");

  let linksHtml = "";
  if (details.download_links.length > 0) {
    linksHtml = details.download_links.map(l => `
      <a href="${l.url}" target="_blank" class="download-item-btn">
        <div>
          <i class="fa-solid fa-download" style="color: var(--accent-cyan); margin-right: 8px;"></i>
          <strong>${l.label}</strong>
        </div>
        <span style="font-size: 0.75rem; background: var(--accent-blue); color: #090d16; padding: 3px 10px; border-radius: 4px;">Download</span>
      </a>
    `).join("");
  } else {
    linksHtml = `
      <a href="${movieUrl}" target="_blank" class="download-item-btn">
        <div>
          <i class="fa-solid fa-external-link-alt" style="color: var(--accent-cyan); margin-right: 8px;"></i>
          <strong>Open Direct Download Page on Moviesda</strong>
        </div>
        <span style="font-size: 0.75rem; background: var(--accent-cyan); color: #090d16; padding: 3px 10px; border-radius: 4px;">Direct Link</span>
      </a>
    `;
  }

  content.innerHTML = `
    <div class="modal-grid">
      <div>
        ${hasPoster 
          ? `<img src="${details.poster_url}" class="modal-poster" alt="${details.title}">`
          : `<div class="modal-poster" style="height: 320px; background: #141c2e; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--accent-cyan);">
               <i class="fa-solid fa-film" style="font-size: 3.5rem;"></i>
               <span style="margin-top: 12px; font-weight: 700;">${details.title}</span>
             </div>`}
      </div>

      <div>
        <h2 class="modal-title">${details.title}</h2>
        
        <div class="modal-meta-bar">
          <span class="modal-badge"><i class="fa-solid fa-compact-disc"></i> ${details.quality}</span>
          <span class="modal-badge"><i class="fa-solid fa-circle-check" style="color: var(--accent-cyan);"></i> Isaimini Verified</span>
        </div>

        ${details.director ? `<p style="margin-bottom: 6px;"><strong>Director:</strong> ${details.director}</p>` : ""}
        ${details.starring ? `<p style="margin-bottom: 12px;"><strong>Starring:</strong> ${details.starring}</p>` : ""}

        <p class="modal-synopsis">${details.synopsis || "Click below to open available download links & qualities."}</p>

        <div class="download-box">
          <div class="download-title">
            <i class="fa-solid fa-circle-down"></i> Available Download Formats & Qualities
          </div>
          <div class="download-links-list">
            ${linksHtml}
          </div>

          <div style="margin-top: 15px; display: flex; gap: 10px;">
            <button onclick="copyUrl('${movieUrl}')" class="pill-btn" style="border-color: var(--accent-cyan); color: var(--accent-cyan);">
              <i class="fa-solid fa-copy"></i> Copy Direct Movie Page URL
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function closeModal() {
  document.getElementById("movieModal").classList.remove("active");
}

function copyUrl(url) {
  navigator.clipboard.writeText(url);
  alert("Copied movie URL to clipboard:\n" + url);
}
