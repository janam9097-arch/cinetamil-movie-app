const CORS_PROXIES = [
  "https://corsproxy.io/?",
  "https://api.allorigins.win/raw?url="
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

// Helper: Generate Instant Download Links
function generateInstantLinks(movieUrl) {
  const slug = movieUrl.replace(/\/$/, "").split("/").pop() || "";
  const baseSlug = slug.replace("-tamil-movie", "").replace("-movie", "");

  return [
    {
      label: "Mp4 HD Quality (720p / 1080p)",
      url: `https://moviesdatamil.net/${baseSlug}-mp4-hd/`,
      badge: "720p HD"
    },
    {
      label: "Mp4 HD Single Part (Full Length)",
      url: `https://moviesdatamil.net/${baseSlug}-mp4-hd-single-part/`,
      badge: "Single Part"
    },
    {
      label: "Standard Mp4 Mobile Rip",
      url: `https://moviesdatamil.net/${baseSlug}-mp4/`,
      badge: "Mobile Rip"
    },
    {
      label: "Open Main Isaimini Download Page",
      url: movieUrl,
      badge: "Direct Page"
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
    card.onclick = () => openMovieDetails(m);

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
          <span><i class="fa-solid fa-bolt" style="color: var(--accent-gold);"></i> Instant Download Links</span>
        </div>
        <button class="btn-details">
          <i class="fa-solid fa-arrow-down-to-line"></i> Download & Details
        </button>
      </div>
    `;
    container.appendChild(card);
  });
}

// Load Category (Instant dataset rendering)
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

  // Fallback to initial DB slice
  if (typeof CACHED_MOVIES_DB !== "undefined") {
    renderMoviesGrid(CACHED_MOVIES_DB.slice(0, 30));
  }
}

// Load A-Z Index (Instant dataset rendering)
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

// INSTANT ZERO-DELAY MOVIE DETAILS MODAL
function openMovieDetails(movie) {
  const modal = document.getElementById("movieModal");
  const content = document.getElementById("modalContent");

  const movieUrl = movie.url || "https://moviesdatamil.net/";
  const title = movie.title || "Movie Details";
  const hasPoster = movie.poster_url && movie.poster_url.startsWith("http");

  // Get or pre-generate instant download links
  const links = (movie.download_links && movie.download_links.length > 0) 
    ? movie.download_links 
    : generateInstantLinks(movieUrl);

  const linksHtml = links.map(l => `
    <a href="${l.url}" target="_blank" class="download-item-btn">
      <div>
        <i class="fa-solid fa-download" style="color: var(--accent-cyan); margin-right: 8px;"></i>
        <strong>${l.label}</strong>
      </div>
      <span style="font-size: 0.75rem; background: var(--accent-blue); color: #090d16; padding: 4px 10px; border-radius: 4px; font-weight: 700;">
        ${l.badge || "Download"}
      </span>
    </a>
  `).join("");

  // RENDER INSTANTLY (0 ms waiting time!)
  content.innerHTML = `
    <div class="modal-grid">
      <div>
        ${hasPoster 
          ? `<img src="${movie.poster_url}" class="modal-poster" alt="${title}">`
          : `<div class="modal-poster" style="height: 300px; background: #141c2e; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--accent-cyan);">
               <i class="fa-solid fa-film" style="font-size: 3.5rem;"></i>
               <span style="margin-top: 12px; font-weight: 700; text-align: center; padding: 0 10px;">${title}</span>
             </div>`}
      </div>

      <div>
        <h2 class="modal-title">${title}</h2>
        
        <div class="modal-meta-bar">
          <span class="modal-badge"><i class="fa-solid fa-compact-disc"></i> ${movie.quality || "Moviesda HD Rip"}</span>
          <span class="modal-badge"><i class="fa-solid fa-bolt" style="color: var(--accent-gold);"></i> Fast Download Links</span>
        </div>

        ${movie.director ? `<p style="margin-bottom: 6px;"><strong>Director:</strong> ${movie.director}</p>` : ""}
        ${movie.starring ? `<p style="margin-bottom: 12px;"><strong>Starring:</strong> ${movie.starring}</p>` : ""}

        <p class="modal-synopsis">${movie.synopsis || "Select any quality format below to start downloading directly from Moviesda / Isaimini."}</p>

        <div class="download-box">
          <div class="download-title">
            <i class="fa-solid fa-circle-down"></i> Direct Download Options
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

  // Show modal immediately
  modal.classList.add("active");
}

function closeModal() {
  document.getElementById("movieModal").classList.remove("active");
}

function copyUrl(url) {
  navigator.clipboard.writeText(url);
  alert("Copied movie URL to clipboard:\n" + url);
}
