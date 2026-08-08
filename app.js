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
    }, 150);
  });

  // Load default category instantly
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

// Helper: Build cdn.uptomkv.ch direct links dynamically
function buildUptomkvLinks(movieTitle, year, movieUrl) {
  const cleanTitle = (movieTitle || "Movie").replace(/[():]/g, "").trim();
  const y = year || "2025";

  function encodePayload(resTag) {
    const path = `Tamil ${y} Movies/${cleanTitle} (${y})/${cleanTitle} (Original)/${cleanTitle} (${resTag})/Moviesda.Mobi - ${cleanTitle} ${y} Original ${resTag}.mp4`;
    const params = `server=mv1&hash=e3270fd43cd21af26faa107b5802efa5&exp=1786218650&path=${path}`;
    try {
      return "https://cdn.uptomkv.ch/download.php?dl=" + btoa(unescape(encodeURIComponent(params)));
    } catch (e) {
      return movieUrl;
    }
  }

  return [
    {
      label: "⚡ Direct MP4 File Download (720p HD)",
      url: encodePayload("720p HD"),
      badge: "720p Direct MP4"
    },
    {
      label: "⚡ Direct MP4 File Download (1080p Full HD)",
      url: encodePayload("1080p HD"),
      badge: "1080p Direct MP4"
    },
    {
      label: "⚡ Direct MP4 File Download (360p Mobile)",
      url: encodePayload("360p HD"),
      badge: "360p Direct MP4"
    },
    {
      label: "🌐 Main Isaimini Download Page",
      url: movieUrl,
      badge: "Page Link"
    }
  ];
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
        <div style="font-size: 3rem; margin-bottom: 12px;">🎬</div>
        <h3>No movies found</h3>
        <p>Try searching for a different keyword or select another category.</p>
      </div>
    `;
    return;
  }

  movies.forEach(m => {
    const card = document.createElement("div");
    card.className = "movie-card";
    card.onclick = () => openMovieDetails(m);

    const yearBadge = m.year ? `<span class="badge-year">${m.year}</span>` : "";

    card.innerHTML = `
      <div class="poster-box">
        ${yearBadge}
        <div class="poster-placeholder">
          <div class="icon-film">🎬</div>
          <span>${m.year || "Tamil"}</span>
        </div>
      </div>
      <div class="card-body">
        <h3 class="card-title">${m.title}</h3>
        <div class="card-meta">
          <span>⚡ cdn.uptomkv.ch Direct Stream</span>
        </div>
        <button class="btn-details">
          ⬇️ Direct MP4 File
        </button>
      </div>
    `;
    container.appendChild(card);
  });
}

// Load Category
function loadCategory(catId) {
  currentCategory = catId;
  const catObj = CATEGORIES.find(c => c.id === catId) || CATEGORIES[0];

  document.getElementById("sectionTitle").innerText = catObj.label;
  document.getElementById("sectionSubtitle").innerText = `Browsing ${catObj.label} catalog`;

  document.querySelectorAll(".atoz-btn").forEach(b => b.classList.remove("active"));

  if (typeof CACHED_MOVIES_DB !== "undefined") {
    const matches = CACHED_MOVIES_DB.filter(m => m.category === catId || (m.year && catId.includes(m.year)));
    if (matches.length > 0) {
      renderMoviesGrid(matches);
      return;
    }
  }

  if (typeof CACHED_MOVIES_DB !== "undefined") {
    renderMoviesGrid(CACHED_MOVIES_DB.slice(0, 30));
  }
}

// Load A-Z Index
function loadAtoZ(letter, btnEl) {
  document.querySelectorAll(".atoz-btn").forEach(b => b.classList.remove("active"));
  if (btnEl) btnEl.classList.add("active");

  const l = letter.toLowerCase();
  document.getElementById("sectionTitle").innerText = `Alphabet: '${letter.toUpperCase()}'`;
  document.getElementById("sectionSubtitle").innerText = `Movies starting with ${letter.toUpperCase()}`;

  if (typeof CACHED_MOVIES_DB !== "undefined") {
    const matches = CACHED_MOVIES_DB.filter(m => m.title.toLowerCase().startsWith(l));
    renderMoviesGrid(matches);
  }
}

// Instant Perform Search
function performSearch(query) {
  const q = query.toLowerCase().trim();
  document.getElementById("sectionTitle").innerText = `Search: "${query}"`;
  document.getElementById("sectionSubtitle").innerText = `Movies matching "${query}"`;

  if (typeof CACHED_MOVIES_DB !== "undefined") {
    const results = CACHED_MOVIES_DB.filter(m => 
      m.title.toLowerCase().includes(q) ||
      (m.starring && m.starring.toLowerCase().includes(q)) ||
      (m.director && m.director.toLowerCase().includes(q))
    );
    renderMoviesGrid(results);
  }
}

// MOVIE DETAILS MODAL WITH cdn.uptomkv.ch DIRECT MP4 FILE SERVERS
function openMovieDetails(movie) {
  const modal = document.getElementById("movieModal");
  const content = document.getElementById("modalContent");

  const movieUrl = movie.url || "https://moviesdatamil.net/";
  const title = movie.title || "Movie Details";
  const year = movie.year || "2025";

  const links = (movie.uptomkv_links && movie.uptomkv_links.length > 0)
    ? movie.uptomkv_links
    : buildUptomkvLinks(title, year, movieUrl);

  const linksHtml = links.map(item => `
    <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 8px;">
      <a href="${item.url}" target="_blank" rel="noopener noreferrer" class="inpage-download-btn" style="flex: 1; text-decoration: none;">
        <div>
          <span style="margin-right: 8px;">⬇️</span>
          <strong>${item.label}</strong>
        </div>
        <span class="download-tag">${item.badge || "Direct MP4"}</span>
      </a>
      <button onclick="copyToClipboard('${item.url}')" title="Copy Direct File Link" style="background: rgba(0,242,254,0.15); border: 1px solid var(--accent-cyan); color: var(--accent-cyan); padding: 14px 16px; border-radius: 8px; cursor: pointer; font-weight: 700;">
        📋
      </button>
    </div>
  `).join("");

  content.innerHTML = `
    <div>
      <h2 class="modal-title">${title}</h2>
      
      <div style="margin-bottom: 15px;">
        <span class="modal-badge">⚡ cdn.uptomkv.ch Direct MP4 Server</span>
        <span class="modal-badge">${movie.quality || "HD Rip"}</span>
      </div>

      <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 15px;">
        Tap ⬇️ to download the MP4 file directly via <strong>cdn.uptomkv.ch</strong>, or tap 📋 to copy the URL for Chrome / 1DM / ADM downloaders.
      </p>

      <div class="download-box">
        <div class="download-title">
          ⬇️ Direct MP4 File Download Servers
        </div>
        <div class="download-links-list">
          ${linksHtml}
        </div>
      </div>
    </div>
  `;

  modal.classList.add("active");
}

function closeModal() {
  document.getElementById("movieModal").classList.remove("active");
}

function copyToClipboard(url) {
  navigator.clipboard.writeText(url);
  alert("Copied direct cdn.uptomkv.ch URL to clipboard:\n" + url);
}
