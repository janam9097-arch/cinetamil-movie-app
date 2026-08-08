const API_BASE = '';

let currentCategory = 'tamil-2025';
let debounceTimer = null;

document.addEventListener('DOMContentLoaded', () => {
  renderAtoZBar();
  fetchCategories();
  
  // Real-time search debounce
  const input = document.getElementById('searchInput');
  input.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (e.target.value.trim().length > 0) {
        triggerSearch();
      } else {
        loadCategory(currentCategory);
      }
    }, 400);
  });

  // Pre-load default category
  loadCategory('tamil-2025', '2025 Movies');
});

// Render A-Z alphabet bar
function renderAtoZBar() {
  const container = document.getElementById('atozBar');
  container.innerHTML = '';
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  
  alphabet.forEach(letter => {
    const btn = document.createElement('button');
    btn.className = 'atoz-btn';
    btn.innerText = letter;
    btn.onclick = () => loadAtoZ(letter, btn);
    container.appendChild(btn);
  });
}

// Fetch categories list
async function fetchCategories() {
  const container = document.getElementById('categoryPills');
  try {
    const res = await fetch(`${API_BASE}/api/categories`);
    const data = await res.json();
    
    container.innerHTML = '';
    data.categories.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = `pill-btn ${cat.id === currentCategory ? 'active' : ''}`;
      btn.innerHTML = `${cat.label} <span style="font-size:0.75rem; opacity:0.7;">(${cat.cached_count})</span>`;
      btn.onclick = () => {
        document.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        loadCategory(cat.id, cat.label);
      };
      container.appendChild(btn);
    });
  } catch (err) {
    console.error('Failed to load categories', err);
  }
}

// Show Spinner
function showLoading() {
  const container = document.getElementById('moviesContainer');
  container.innerHTML = `
    <div class="spinner-wrapper" style="grid-column: 1 / -1;">
      <div class="spinner"></div>
      <p>Searching & Scraping Catalog...</p>
    </div>
  `;
}

// Render Movie Cards
function renderMovieGrid(movies) {
  const container = document.getElementById('moviesContainer');
  const countEl = document.getElementById('resultCount');
  container.innerHTML = '';
  countEl.innerText = `${movies.length} Movie(s) Found`;

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
    const card = document.createElement('div');
    card.className = 'movie-card';
    card.onclick = () => openMovieDetails(m.url, m.title);

    const hasPoster = m.poster_url && m.poster_url.startsWith('http');
    const yearBadge = m.year ? `<span class="badge-year">${m.year}</span>` : '';

    card.innerHTML = `
      <div class="poster-box">
        ${yearBadge}
        ${hasPoster 
          ? `<img src="${m.poster_url}" class="poster-img" alt="${m.title}" loading="lazy">` 
          : `<div class="poster-placeholder"><i class="fa-solid fa-clapperboard"></i><span>${m.year || 'Tamil'}</span></div>`}
      </div>
      <div class="card-body">
        <h3 class="card-title">${m.title}</h3>
        <div class="card-meta">
          ${m.quality ? `<span><i class="fa-solid fa-compact-disc"></i> ${m.quality}</span>` : '<span><i class="fa-solid fa-video"></i> Moviesda HD</span>'}
        </div>
        <button class="btn-details">
          <i class="fa-solid fa-arrow-right"></i> Get Movie & Links
        </button>
      </div>
    `;
    container.appendChild(card);
  });
}

// Search API
async function triggerSearch() {
  const query = document.getElementById('searchInput').value.trim();
  if (!query) return;

  document.getElementById('sectionTitle').innerText = `Search Results: "${query}"`;
  document.getElementById('sectionSubtitle').innerText = `Real-time search results from database & live index`;
  showLoading();

  try {
    const res = await fetch(`${API_BASE}/api/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    renderMovieGrid(data.results);
  } catch (err) {
    console.error('Search error', err);
  }
}

// Category API
async function loadCategory(catId, label = 'Movies') {
  currentCategory = catId;
  document.getElementById('sectionTitle').innerText = label;
  document.getElementById('sectionSubtitle').innerText = `Browsing ${label} catalog`;
  showLoading();

  // Reset A-Z active state
  document.querySelectorAll('.atoz-btn').forEach(b => b.classList.remove('active'));

  try {
    const res = await fetch(`${API_BASE}/api/category?name=${encodeURIComponent(catId)}`);
    const data = await res.json();
    renderMovieGrid(data.movies);
  } catch (err) {
    console.error('Category load error', err);
  }
}

// A-Z API
async function loadAtoZ(letter, btnEl) {
  document.querySelectorAll('.atoz-btn').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');

  document.getElementById('sectionTitle').innerText = `Alphabetical Index: '${letter.toUpperCase()}'`;
  document.getElementById('sectionSubtitle').innerText = `Movies starting with ${letter.toUpperCase()}`;
  showLoading();

  try {
    const res = await fetch(`${API_BASE}/api/atoz?letter=${letter}`);
    const data = await res.json();
    renderMovieGrid(data.movies);
  } catch (err) {
    console.error('A-Z load error', err);
  }
}

// Open Movie Details Modal
async function openMovieDetails(url, fallbackTitle) {
  const modal = document.getElementById('movieModal');
  const content = document.getElementById('modalContent');
  
  modal.classList.add('active');
  content.innerHTML = `
    <div class="spinner-wrapper">
      <div class="spinner"></div>
      <p>Fetching Movie Details & Download Links...</p>
    </div>
  `;

  try {
    const res = await fetch(`${API_BASE}/api/details?url=${encodeURIComponent(url)}`);
    const data = await res.json();

    const title = data.title || fallbackTitle;
    const hasPoster = data.poster_url && data.poster_url.startsWith('http');

    let downloadHtml = '';
    if (data.download_links && data.download_links.length > 0) {
      downloadHtml = data.download_links.map(link => `
        <a href="${link.url}" target="_blank" class="download-item-btn">
          <div>
            <i class="fa-solid fa-download" style="color: var(--accent-cyan); margin-right: 8px;"></i>
            <strong>${link.label}</strong>
          </div>
          <span style="font-size: 0.75rem; background: var(--accent-blue); color: #090d16; padding: 2px 8px; border-radius: 4px;">Download</span>
        </a>
      `).join('');
    } else {
      downloadHtml = `
        <a href="${url}" target="_blank" class="download-item-btn">
          <div>
            <i class="fa-solid fa-external-link-alt" style="color: var(--accent-cyan); margin-right: 8px;"></i>
            <strong>Open Main Isaimini Download Page</strong>
          </div>
          <span style="font-size: 0.75rem; background: var(--accent-cyan); color: #090d16; padding: 2px 8px; border-radius: 4px;">Direct Link</span>
        </a>
      `;
    }

    content.innerHTML = `
      <div class="modal-grid">
        <div>
          ${hasPoster 
            ? `<img src="${data.poster_url}" class="modal-poster" alt="${title}">`
            : `<div class="modal-poster" style="height: 350px; background: #182238; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--accent-cyan);">
                 <i class="fa-solid fa-film" style="font-size: 3.5rem;"></i>
                 <span style="margin-top: 10px; font-weight: 700;">${title}</span>
               </div>`}
        </div>

        <div>
          <h2 class="modal-title">${title}</h2>
          
          <div class="modal-meta-bar">
            ${data.rating ? `<span class="modal-badge"><i class="fa-solid fa-star" style="color: var(--accent-gold);"></i> ${data.rating}</span>` : ''}
            ${data.quality ? `<span class="modal-badge"><i class="fa-solid fa-compact-disc"></i> ${data.quality}</span>` : ''}
            ${data.language ? `<span class="modal-badge"><i class="fa-solid fa-language"></i> ${data.language}</span>` : ''}
          </div>

          ${data.director ? `<p style="margin-bottom: 6px;"><strong>Director:</strong> ${data.director}</p>` : ''}
          ${data.starring ? `<p style="margin-bottom: 12px;"><strong>Starring:</strong> ${data.starring}</p>` : ''}
          ${data.genres ? `<p style="margin-bottom: 16px; color: var(--accent-cyan);"><strong>Genres:</strong> ${data.genres}</p>` : ''}

          <p class="modal-synopsis">${data.synopsis || 'No detailed synopsis available. Click below to view download links.'}</p>

          <div class="download-box">
            <div class="download-title">
              <i class="fa-solid fa-circle-down"></i> Direct Download & Stream Links
            </div>
            <div class="download-links-list">
              ${downloadHtml}
            </div>

            <div style="margin-top: 15px; display: flex; gap: 10px;">
              <button onclick="copyToClipboard('${url}')" class="pill-btn" style="border-color: var(--accent-cyan); color: var(--accent-cyan);">
                <i class="fa-solid fa-copy"></i> Copy Page URL
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    content.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--accent-pink);">
        <i class="fa-solid fa-triangle-exclamation" style="font-size: 2.5rem; margin-bottom: 10px;"></i>
        <h3>Failed to load movie details</h3>
        <p style="color: var(--text-secondary); margin-top: 6px;">URL: ${url}</p>
        <a href="${url}" target="_blank" class="download-item-btn" style="margin-top: 20px; display: inline-flex;">Open directly in browser</a>
      </div>
    `;
  }
}

function closeModal() {
  document.getElementById('movieModal').classList.remove('active');
}

function closeModalOnBackdrop(e) {
  if (e.target.id === 'movieModal') {
    closeModal();
  }
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text);
  alert('Movie URL copied to clipboard: ' + text);
}
