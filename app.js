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

// Helper: Build Direct Download Server Options
function getDirectServers(movieUrl) {
  const slug = movieUrl.replace(/\/$/, "").split("/").pop().replace("-tamil-movie", "").replace("-movie", "");

  return [
    {
      name: "Direct Download 720p HD (In-Browser)",
      url: `https://moviesdatamil.net/download/${slug}-720p-hd/`,
      badge: "720p HD",
      type: "720p"
    },
    {
      name: "Direct Download 1080p Full HD (In-Browser)",
      url: `https://moviesdatamil.net/download/${slug}-1080p-hd/`,
      badge: "1080p HD",
      type: "1080p"
    },
    {
      name: "Direct Download 360p Mobile (In-Browser)",
      url: `https://moviesdatamil.net/download/${slug}-360p-hd/`,
      badge: "Mobile Rip",
      type: "360p"
    }
  ];
}

// IN-PAGE DIRECT DOWNLOAD HANDLER (NO REDIRECTION TO ANY EXTERNAL SITES!)
function startInPageDirectDownload(e, downloadUrl, movieTitle, qualityLabel) {
  if (e) e.preventDefault();

  const progressContainer = document.getElementById("downloadProgressContainer");
  const progressText = document.getElementById("downloadProgressText");
  const progressBar = document.getElementById("downloadProgressBarFill");

  if (!progressContainer) return;

  // 1. Show In-Page Progress Bar (User NEVER leaves page!)
  progressContainer.classList.add("active");
  progressText.innerHTML = `⬇️ Starting direct download for <strong>${movieTitle} (${qualityLabel})</strong>...`;
  progressBar.style.width = "10%";

  // 2. Animate download progress UI on current page
  setTimeout(() => { progressBar.style.width = "40%"; }, 400);
  setTimeout(() => { progressBar.style.width = "75%"; }, 900);

  // 3. Trigger In-Browser background stream/file download without redirecting the main window
  setTimeout(() => {
    progressBar.style.width = "100%";
    progressText.innerHTML = `✅ <strong>Download Sent to Browser:</strong> ${movieTitle} (${qualityLabel})`;

    // Silent hidden download dispatcher (No tab opening, no page redirect!)
    let iframe = document.getElementById("hiddenDownloadIframe");
    if (!iframe) {
      iframe = document.createElement("iframe");
      iframe.id = "hiddenDownloadIframe";
      iframe.style.display = "none";
      document.body.appendChild(iframe);
    }
    iframe.src = downloadUrl;

  }, 1400);
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
          <span>⚡ In-Page Direct Download</span>
        </div>
        <button class="btn-details">
          ⬇️ Direct Download
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

// Perform Search
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

// IN-PAGE ZERO-REDIRECT MOVIE DETAILS MODAL
function openMovieDetails(movie) {
  const modal = document.getElementById("movieModal");
  const content = document.getElementById("modalContent");

  const movieUrl = movie.url || "https://moviesdatamil.net/";
  const title = movie.title || "Movie Details";

  const servers = getDirectServers(movieUrl);

  const linksHtml = servers.map(s => `
    <button onclick="startInPageDirectDownload(event, '${s.url}', '${title.replace(/'/g, "\\'")}', '${s.badge}')" class="inpage-download-btn">
      <div>
        <span style="margin-right: 8px;">⬇️</span>
        <strong>${s.name}</strong>
      </div>
      <span class="download-tag">${s.badge}</span>
    </button>
  `).join("");

  content.innerHTML = `
    <div>
      <h2 class="modal-title">${title}</h2>
      
      <div style="margin-bottom: 15px;">
        <span class="modal-badge">⚡ In-Page Direct Download (No Redirect)</span>
        <span class="modal-badge">${movie.quality || "HD Rip"}</span>
      </div>

      <p style="color: var(--text-secondary); font-size: 0.9rem; margin-bottom: 15px;">
        Tap any quality option below to start downloading directly to your browser without leaving this page.
      </p>

      <div class="download-box">
        <div class="download-title">
          ⬇️ Select Download Quality
        </div>
        <div class="download-links-list">
          ${linksHtml}
        </div>

        <!-- In-Page Download Progress Indicator -->
        <div id="downloadProgressContainer" class="download-progress-container">
          <p id="downloadProgressText" style="font-size: 0.88rem; color: #fff;"></p>
          <div class="progress-bar-bg">
            <div id="downloadProgressBarFill" class="progress-bar-fill"></div>
          </div>
          <p style="font-size: 0.78rem; color: var(--accent-cyan);">Your browser's download manager will save the file directly.</p>
        </div>

        <div style="margin-top: 15px; display: flex; gap: 10px;">
          <button onclick="copyToClipboard('${movieUrl}')" class="pill-btn" style="border-color: var(--accent-cyan); color: var(--accent-cyan);">
            📋 Copy Direct Movie URL
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

function copyToClipboard(url) {
  navigator.clipboard.writeText(url);
  alert("Copied download URL to clipboard:\n" + url);
}
