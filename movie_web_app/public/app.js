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
function generateInstantLinks(movieUrl, movieTitle) {
  const slug = movieUrl.replace(/\/$/, "").split("/").pop() || "";
  const baseSlug = slug.replace("-tamil-movie", "").replace("-movie", "");
  const titleSlug = (movieTitle || "movie").replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();

  return [
    {
      label: "Mp4 HD Quality (720p / 1080p)",
      url: `https://moviesdatamil.net/${baseSlug}-mp4-hd/`,
      badge: "720p HD Direct",
      filename: `${titleSlug}-720p-HD.mp4`
    },
    {
      label: "Mp4 HD Single Part (Full Length)",
      url: `https://moviesdatamil.net/${baseSlug}-mp4-hd-single-part/`,
      badge: "Single Part Direct",
      filename: `${titleSlug}-full-hd.mp4`
    },
    {
      label: "Standard Mp4 Mobile Rip",
      url: `https://moviesdatamil.net/${baseSlug}-mp4/`,
      badge: "Mobile Rip Direct",
      filename: `${titleSlug}-mobile-rip.mp4`
    }
  ];
}

// Direct Download Handler (No Redirection!)
function triggerDirectDownload(event, downloadUrl, fileName, title) {
  if (event) event.preventDefault();

  showToast(`⬇️ Direct Download Started: ${title} (${fileName})`);

  // Create temporary hidden download anchor to trigger direct browser save without navigating away
  const a = document.createElement("a");
  a.href = downloadUrl;
  a.download = fileName;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    if (document.body.contains(a)) document.body.removeChild(a);
  }, 1000);
}

// Toast Notification
function showToast(msg) {
  let toast = document.getElementById("downloadToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "downloadToast";
    toast.className = "toast-notification";
    document.body.appendChild(toast);
  }

  toast.innerHTML = `<span>⚡</span> <span>${msg}</span>`;
  toast.classList.add("active");

  setTimeout(() => {
    toast.classList.remove("active");
  }, 4000);
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
          <span>⚡ Direct Download</span>
        </div>
        <button class="btn-details">
          ⬇️ Download & Details
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

// INSTANT MOVIE DETAILS & DIRECT DOWNLOAD MODAL
function openMovieDetails(movie) {
  const modal = document.getElementById("movieModal");
  const content = document.getElementById("modalContent");

  const movieUrl = movie.url || "https://moviesdatamil.net/";
  const title = movie.title || "Movie Details";

  // Generate direct download options
  const links = generateInstantLinks(movieUrl, title);

  const linksHtml = links.map(l => `
    <button onclick="triggerDirectDownload(event, '${l.url}', '${l.filename}', '${title.replace(/'/g, "\\'")}')" class="download-action-btn">
      <div>
        <span style="margin-right: 8px;">⬇️</span>
        <strong>${l.label}</strong>
      </div>
      <span class="download-tag">${l.badge}</span>
    </button>
  `).join("");

  content.innerHTML = `
    <div>
      <h2 class="modal-title">${title}</h2>
      
      <div style="margin-bottom: 15px;">
        <span class="modal-badge">⚡ Direct Movie Download (No Redirect)</span>
        <span class="modal-badge">${movie.quality || "HD Rip"}</span>
      </div>

      <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 20px;">
        Click any quality option below to download directly to your device without navigating to external sites.
      </p>

      <div class="download-box">
        <div class="download-title">
          ⬇️ Select Download Quality
        </div>
        <div class="download-links-list">
          ${linksHtml}
        </div>

        <div style="margin-top: 15px; display: flex; gap: 10px;">
          <button onclick="copyUrl('${movieUrl}')" class="pill-btn" style="border-color: var(--accent-cyan); color: var(--accent-cyan);">
            📋 Copy Movie URL
          </button>
        </div>
      </div>
    </div>
  `;

  modal.classList.add("active");
}

function closeModal() {
  document.getElementById("movieModal").classList.remove("active");
}

function copyUrl(url) {
  navigator.clipboard.writeText(url);
  showToast("Copied URL to clipboard!");
}
