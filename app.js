// CineTamil Movie App - Main Application Logic
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
  if (searchInput) {
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
  }

  loadCategory("tamil-2025");
});

// Render Category Pills
function renderCategoryPills() {
  const container = document.getElementById("categoryPills");
  if (!container) return;
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

// Render A-Z Index Bar
function renderAtoZBar() {
  const container = document.getElementById("atozBar");
  if (!container) return;
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

// Render Movies Grid
function renderMoviesGrid(movies) {
  const container = document.getElementById("moviesContainer");
  const countEl = document.getElementById("resultCount");
  if (!container) return;

  container.innerHTML = "";
  if (countEl) countEl.innerText = `${movies.length} Movie(s)`;

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
          <span>${m.quality || "HD Rip"}</span>
        </div>
        <button class="btn-details">
          ⬇️ Download Links
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

  const titleEl = document.getElementById("sectionTitle");
  const subEl = document.getElementById("sectionSubtitle");
  if (titleEl) titleEl.innerText = catObj.label;
  if (subEl) subEl.innerText = `Browsing ${catObj.label} catalog`;

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
  const titleEl = document.getElementById("sectionTitle");
  const subEl = document.getElementById("sectionSubtitle");

  if (titleEl) titleEl.innerText = `Alphabet: '${letter.toUpperCase()}'`;
  if (subEl) subEl.innerText = `Movies starting with ${letter.toUpperCase()}`;

  if (typeof CACHED_MOVIES_DB !== "undefined") {
    const matches = CACHED_MOVIES_DB.filter(m => m.title.toLowerCase().startsWith(l));
    renderMoviesGrid(matches);
  }
}

// Search Handler
function performSearch(query) {
  const q = query.toLowerCase().trim();
  const titleEl = document.getElementById("sectionTitle");
  const subEl = document.getElementById("sectionSubtitle");

  if (titleEl) titleEl.innerText = `Search: "${query}"`;
  if (subEl) subEl.innerText = `Movies matching "${query}"`;

  if (typeof CACHED_MOVIES_DB !== "undefined") {
    const results = CACHED_MOVIES_DB.filter(m => 
      m.title.toLowerCase().includes(q) ||
      (m.starring && m.starring.toLowerCase().includes(q)) ||
      (m.director && m.director.toLowerCase().includes(q))
    );
    renderMoviesGrid(results);
  }
}

// DIRECT DOWNLOAD BUTTON CLICK HANDLER
function handleDownloadClick(event, downloadUrl, movieTitle) {
  if (event) event.preventDefault();

  console.log("------------------------------------------");
  console.log("[CineTamil Debug] Executing handleDownloadClick");
  console.log("Movie:", movieTitle);
  console.log("Button URL:", downloadUrl);

  const statusNotice = document.getElementById("downloadStatusNotice");

  // Validate that downloadUrl is non-empty and not pointing to default homepage
  if (!downloadUrl || downloadUrl.trim() === "" || downloadUrl === "#" || downloadUrl === "https://moviesdatamil.net/" || downloadUrl === "https://moviesdatamil.net") {
    console.warn("[CineTamil Debug] Error: downloadUrl is missing or points to homepage:", downloadUrl);
    if (statusNotice) {
      statusNotice.style.display = "block";
      statusNotice.innerHTML = "⚠️ <strong>Notice:</strong> This link is unavailable or has been redirected.";
    } else {
      alert("This link is unavailable or has been redirected.");
    }
    return;
  }

  if (statusNotice) {
    statusNotice.style.display = "none";
  }

  // Log final URL immediately before opening link
  console.log("[CineTamil Debug] Opening final URL immediately before navigation:", downloadUrl);
  console.log("------------------------------------------");

  try {
    const win = window.open(downloadUrl, "_blank");
    if (!win) {
      window.location.href = downloadUrl;
    }
  } catch (err) {
    console.error("[CineTamil Debug] Navigation failed:", err);
    if (statusNotice) {
      statusNotice.style.display = "block";
      statusNotice.innerHTML = "⚠️ <strong>Notice:</strong> This link is unavailable or has been redirected.";
    }
  }
}

// OPEN MOVIE DETAILS MODAL
function openMovieDetails(movie) {
  const modal = document.getElementById("movieModal");
  const content = document.getElementById("modalContent");

  // Preserve exact URL from data object without modifications
  const downloadUrl = movie.downloadUrl || movie.url || "";
  const title = movie.title || "Movie Details";
  const quality = movie.quality || "HD Rip";

  // Step-by-Step Debug Logging
  console.log("==========================================");
  console.log("Movie:", movie.title);
  console.log("Data URL:", movie.downloadUrl || movie.url);
  console.log("Button URL:", downloadUrl);
  console.log("==========================================");

  content.innerHTML = `
    <div>
      <h2 class="modal-title">${title}</h2>
      
      <div style="margin-bottom: 15px;">
        <span class="modal-badge">🎬 ${quality}</span>
        <span class="modal-badge">Year: ${movie.year || "N/A"}</span>
      </div>

      <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 15px;">
        Click the download button below to access the project's movie URL directly.
      </p>

      <!-- Error / Status Notice Container -->
      <div id="downloadStatusNotice" style="display: none; background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; border-radius: 8px; padding: 12px; margin-bottom: 15px; font-size: 0.88rem; color: #fca5a5;">
      </div>

      <div class="download-box">
        <div class="download-title">
          ⬇️ Movie Download Link
        </div>

        <div class="download-links-list">
          <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 8px;">
            <button onclick="handleDownloadClick(event, '${downloadUrl}', '${title.replace(/'/g, "\\'")}')" class="inpage-download-btn" style="flex: 1;">
              <div>
                <span style="margin-right: 8px;">⬇️</span>
                <strong>Open Movie Page (${quality})</strong>
              </div>
              <span class="download-tag">Open Link</span>
            </button>
            <button onclick="copyToClipboard('${downloadUrl}')" title="Copy Link" style="background: rgba(0,242,254,0.15); border: 1px solid var(--accent-cyan); color: var(--accent-cyan); padding: 14px 16px; border-radius: 8px; cursor: pointer; font-weight: 700;">
              📋
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  if (modal) modal.classList.add("active");
}

// CLOSE MODAL
function closeModal() {
  const modal = document.getElementById("movieModal");
  if (modal) modal.classList.remove("active");
}

// COPY TO CLIPBOARD
function copyToClipboard(url) {
  console.log("[CineTamil Copy] Copying URL:", url);
  if (!url || url.trim() === "") {
    alert("This link is unavailable or has been redirected.");
    return;
  }
  navigator.clipboard.writeText(url);
  alert("Copied URL to clipboard:\n" + url);
}

// CLEAR CACHE AND RELOAD
function clearCacheAndReload() {
  console.log("[CineTamil Cache] Clearing browser cache & reloading...");
  if (window.caches) {
    caches.keys().then(names => {
      names.forEach(name => caches.delete(name));
    });
  }
  localStorage.clear();
  sessionStorage.clear();
  window.location.reload(true);
}
