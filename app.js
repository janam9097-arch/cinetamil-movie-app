// CineTamil Movie App - Quality Selection & Download Engine
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

let currentMovieObject = null;
let currentSelectedQuality = null;

document.addEventListener("DOMContentLoaded", () => {
  renderCategoryPills();
  renderAtoZBar();
  updateLastUpdatedTimestamp();

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

function updateLastUpdatedTimestamp() {
  const badge = document.getElementById("lastUpdatedBadge");
  if (!badge) return;
  if (typeof LAST_UPDATED_TIMESTAMP !== "undefined" && LAST_UPDATED_TIMESTAMP) {
    badge.innerText = `• Last Auto-Synced: ${LAST_UPDATED_TIMESTAMP}`;
  } else {
    fetch("/api/status")
      .then(res => res.json())
      .then(data => {
        if (data && data.last_updated && data.last_updated !== "N/A") {
          badge.innerText = `• Last Auto-Synced: ${data.last_updated}`;
        }
      })
      .catch(() => {});
  }
}

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
          ⬇ Select Quality
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

// URL TYPE CLASSIFIER — matches sync_service.py is_direct_file_url / is_authorized_download_url
function getUrlType(url) {
  if (!url) return "unavailable";
  if (
    url.includes("mv1.uptomkv.ch/files/") ||
    url.includes("download.fastbytes.xyz/download.php") ||
    url.includes("r2.cloudflarestorage.com") ||
    url.endsWith(".mp4") ||
    url.includes(".mp4?")
  ) return "direct";
  if (url.includes("download.moviespage.xyz/download/file/")) return "page";
  return "unavailable";
}

// QUALITY SELECTION HANDLER
function selectQuality(quality) {
  if (!currentMovieObject || !currentMovieObject.downloads) return;

  const downloadInfo = currentMovieObject.downloads[quality];
  const errorBox = document.getElementById("downloadModalErrorNotice");

  if (!downloadInfo || !downloadInfo.url) {
    showDownloadError(`Download unavailable for ${quality}.`);
    const mainBtnEl = document.getElementById("mainDownloadActionBtn");
    if (mainBtnEl) {
      mainBtnEl.innerText = `⚠️ Download Unavailable (${quality})`;
      mainBtnEl.disabled = true;
    }
    return;
  }

  if (errorBox) errorBox.style.display = "none";
  currentSelectedQuality = quality;

  // Update active pill UI
  document.querySelectorAll(".quality-pill-btn").forEach(btn => {
    const isSelected = btn.dataset.quality === quality;
    btn.classList.toggle("active", isSelected);
  });

  // Update selected quality text & file size
  const labelEl = document.getElementById("selectedQualityLabel");
  const sizeEl = document.getElementById("selectedQualitySize");
  const mainBtnEl = document.getElementById("mainDownloadActionBtn");

  if (labelEl) labelEl.innerText = quality;
  if (sizeEl) sizeEl.innerText = downloadInfo.size || "Unknown Size";

  if (mainBtnEl) {
    const urlType = getUrlType(downloadInfo.url);
    if (urlType === "direct") {
      mainBtnEl.innerText = `⬇ Direct Download (${quality})`;
      mainBtnEl.title = "Clicking will download the movie file directly";
    } else if (urlType === "page") {
      mainBtnEl.innerText = `🔗 Open Download Page (${quality})`;
      mainBtnEl.title = "Opens the download page — click the download button there to get the file";
    } else {
      mainBtnEl.innerText = `⚠️ Download Unavailable (${quality})`;
      mainBtnEl.title = "No download available for this quality";
      mainBtnEl.disabled = true;
      return;
    }
    mainBtnEl.disabled = false;
  }
}

// DOWNLOAD MOVIE HANDLER
function downloadMovie(movie, quality) {
  const download = movie?.downloads?.[quality];
  const url = download?.url || "";
  const urlType = getUrlType(url);

  console.log("[CineTamil] Movie:", movie?.title);
  console.log("[CineTamil] Quality:", quality);
  console.log("[CineTamil] Stored URL:", url);
  console.log("[CineTamil] URL Type:", urlType);

  if (urlType === "unavailable" || !url) {
    showDownloadError("Download unavailable for this quality.");
    return;
  }

  if (urlType === "direct") {
    // Trigger browser file download using a temporary anchor with download attribute
    const a = document.createElement("a");
    a.href = url;
    a.download = ""; // let browser infer filename from URL
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } else {
    // urlType === "page" — open the authorized download page in a new tab
    const win = window.open(url, "_blank", "noopener,noreferrer");
    if (!win || win.closed || typeof win.closed === "undefined") {
      // Popup blocked fallback
      window.location.href = url;
    }
  }
}

// SHOW DOWNLOAD ERROR NOTIFICATION
function showDownloadError(message) {
  const errorBox = document.getElementById("downloadModalErrorNotice");
  if (errorBox) {
    errorBox.style.display = "block";
    errorBox.innerHTML = `⚠️ <strong>Notice:</strong> ${message}`;
  } else {
    alert(message);
  }
}

// OPEN MOVIE DETAILS MODAL WITH DYNAMIC QUALITY SELECTION
function openMovieDetails(movie) {
  currentMovieObject = movie;
  currentSelectedQuality = null;

  const modal = document.getElementById("movieModal");
  const content = document.getElementById("modalContent");

  const title = movie.title || "Movie Details";
  const year = movie.year || "";
  const pageUrl = movie.moviePageUrl || "#";

  // Filter available qualities in deterministic order (480p, 720p, 1080p)
  const downloadsObj = movie.downloads || {};
  const preferredOrder = ["480p", "720p", "1080p"];
  const availableQualities = preferredOrder.filter(q => downloadsObj[q] && downloadsObj[q].url);
  Object.keys(downloadsObj).forEach(q => {
    if (downloadsObj[q] && downloadsObj[q].url && !availableQualities.includes(q)) {
      availableQualities.push(q);
    }
  });

  console.log("[CineTamil Modal] Opening movie:", title);
  console.log("[CineTamil Modal] Available qualities:", availableQualities);

  const pillsHtml = availableQualities.map(q => `
    <button data-quality="${q}" onclick="selectQuality('${q}')" class="quality-pill-btn">
      ${q}
    </button>
  `).join("");

  content.innerHTML = `
    <div>
      <h2 class="modal-title">${title}</h2>
      
      <div style="margin-bottom: 15px; display: flex; gap: 8px; flex-wrap: wrap;">
        <span class="modal-badge">Year: ${year || "N/A"}</span>
        <span class="modal-badge">${movie.quality || "HD Rip"}</span>
      </div>

      <!-- Optional Movie Information Page Link -->
      <div style="margin-bottom: 15px; font-size: 0.85rem;">
        <a href="${pageUrl}" target="_blank" rel="noreferrer noopener" style="color: var(--text-secondary); text-decoration: underline;">
          🌐 View Movie Info Page
        </a>
      </div>

      <!-- Error Notice Container -->
      <div id="downloadModalErrorNotice" style="display: none; background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; border-radius: 8px; padding: 12px; margin-bottom: 15px; font-size: 0.88rem; color: #fca5a5;">
      </div>

      <!-- Quality Selection UI Container -->
      <div class="quality-selection-box">
        <div class="quality-selection-title">Select Quality</div>
        
        <div class="quality-pills-row">
          ${availableQualities.length > 0 ? pillsHtml : `<span style="color: var(--text-secondary); font-size: 0.85rem;">No download qualities available for this movie.</span>`}
        </div>

        <div class="quality-details-info">
          <div>Selected: <strong id="selectedQualityLabel">--</strong></div>
          <div>Size: <strong id="selectedQualitySize">--</strong></div>
        </div>

        <button id="mainDownloadActionBtn" onclick="downloadMovie(currentMovieObject, currentSelectedQuality)" class="main-download-btn" disabled>
          ⬇ Download Movie
        </button>
      </div>
    </div>
  `;

  if (modal) modal.classList.add("active");

  // Auto-select first available quality
  if (availableQualities.length > 0) {
    selectQuality(availableQualities[0]);
  }
}

// CLOSE MODAL
function closeModal() {
  const modal = document.getElementById("movieModal");
  if (modal) modal.classList.remove("active");
}

// CLEAR CACHE AND RELOAD
function clearCacheAndReload() {
  if (window.caches) {
    caches.keys().then(names => {
      names.forEach(name => caches.delete(name));
    });
  }
  localStorage.clear();
  sessionStorage.clear();
  window.location.reload(true);
}
