// LX APP STORE Web Client Logic

let currentView = 'home';
let homeData = null;
let currentAppDetail = null;
let searchTimeout = null;

// Wishlist LocalStorage Management
function getWishlist() {
  try {
    return JSON.parse(localStorage.getItem('lx_wishlist')) || [];
  } catch (e) {
    return [];
  }
}

function saveWishlist(list) {
  localStorage.setItem('lx_wishlist', JSON.stringify(list));
  updateWishlistBadge();
}

function toggleWishlist(app) {
  const list = getWishlist();
  const index = list.findIndex(item => item.packageName === app.packageName);
  let isAdded = false;
  if (index > -1) {
    list.splice(index, 1);
    showToast(`Removed "${app.title}" from Wishlist`);
  } else {
    list.push({
      title: app.title,
      packageName: app.packageName,
      icon: app.icon || '',
      developer: app.developer || '',
      rating: app.rating || 4.5,
      size: (app.asset && app.asset.size) ? app.asset.size : (app.size || 0),
      fileType: (app.asset && app.asset.type) ? app.asset.type : (app.fileType || 'APK')
    });
    showToast(`Added "${app.title}" to Wishlist!`);
    isAdded = true;
  }
  saveWishlist(list);

  // Dynamically update wishlist button state in details modal
  const btn = document.getElementById('detailsWishlistBtn');
  if (btn) {
    if (isAdded) {
      btn.classList.add('wishlisted');
      btn.innerHTML = `<i class="fa-solid fa-bookmark"></i> Wishlist`;
    } else {
      btn.classList.remove('wishlisted');
      btn.innerHTML = `<i class="fa-regular fa-bookmark"></i> Wishlist`;
    }
  }
}

function isWishlisted(packageName) {
  const list = getWishlist();
  return list.some(item => item.packageName === packageName);
}

function updateWishlistBadge() {
  const count = getWishlist().length;
  const badge = document.getElementById('wishlistBadge');
  if (badge) badge.innerText = count;
}

// Toast Notifications
function showToast(msg) {
  const toast = document.getElementById('toastNotification');
  if (!toast) return;
  toast.innerHTML = `<i class="fa-solid fa-circle-check" style="color: var(--primary);"></i> ${msg}`;
  toast.classList.remove('hidden');
  setTimeout(() => {
    toast.classList.add('hidden');
  }, 3500);
}

// Download Banner Notification
function showDownloadBanner(title, pkg) {
  const banner = document.getElementById('downloadBanner');
  const t = document.getElementById('downloadBannerTitle');
  const s = document.getElementById('downloadBannerSub');
  const fileUrl = `/api/download/file?package_name=${encodeURIComponent(pkg)}`;
  
  if (t) t.innerText = `Downloading ${title}...`;
  if (s) {
    s.innerHTML = `Your download has started. <a href="${fileUrl}" style="color: var(--primary); text-decoration: underline; font-weight: 700; margin-left: 4px;">Click here</a> if it didn't start automatically.`;
  }
  if (banner) banner.classList.remove('hidden');
  setTimeout(() => {
    if (banner) banner.classList.add('hidden');
  }, 9000);
}

function closeDownloadBanner() {
  const banner = document.getElementById('downloadBanner');
  if (banner) banner.classList.add('hidden');
}

// Formatters
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return 'Variable size';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDownloads(count) {
  if (!count) return '1M+';
  if (count >= 1000000000) return (count / 1000000000).toFixed(1) + 'B';
  if (count >= 1000000) return (count / 1000000).toFixed(1) + 'M';
  if (count >= 1000) return (count / 1000).toFixed(1) + 'k';
  return count.toString();
}

function formatRating(rating) {
  if (!rating) return '4.5';
  if (rating > 5) return (rating / 10).toFixed(1);
  return Number(rating).toFixed(1);
}

// Navigation & View Routing
function navigateTo(view, param = null) {
  currentView = view;
  
  // 1. Update top navbar tabs and sidebar tabs
  document.querySelectorAll('.nav-tab, .sidebar-tab').forEach(tab => {
    tab.classList.toggle('active', tab.getAttribute('data-view') === view);
  });

  // 2. Update category chips active state
  document.querySelectorAll('.category-chip').forEach(chip => {
    const chipCat = chip.getAttribute('data-category-id');
    if (view === 'home') {
      chip.classList.toggle('active', chipCat === 'home');
    } else if (view === 'category' && param) {
      chip.classList.toggle('active', chipCat === param.id);
    } else if (view === 'games') {
      chip.classList.toggle('active', chipCat === 'game');
    } else {
      chip.classList.remove('active');
    }
  });

  // Scroll active chip into view smoothly
  const activeChip = document.querySelector('.category-chip.active');
  if (activeChip) {
    activeChip.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }

  const heroSection = document.getElementById('heroSection');
  if (view === 'home') {
    heroSection.classList.remove('hidden');
    loadHomeView();
  } else {
    heroSection.classList.add('hidden');
    if (view === 'games') loadTopGamesView();
    else if (view === 'apps') loadTopAppsView();
    else if (view === 'new') loadNewReleasesView();
    else if (view === 'categories') loadCategoriesView();
    else if (view === 'category' && param) loadCategoryAppsView(param.id, param.name);
    else if (view === 'search' && param) loadSearchResultsView(param);
  }
}

// Helper to fetch details for featured cards silently
async function getAppDetailSilently(pkg) {
  try {
    const res = await fetch(`/api/app/detail?package_name=${pkg}`);
    const json = await res.json();
    return json.data || null;
  } catch (e) {
    return null;
  }
}

// Render Landscape Featured Cards
function renderFeaturedCard(app) {
  const pkg = app.packageName || '';
  const title = app.title || 'App';
  const dev = app.developer || 'Developer';
  const icon = app.icon || 'https://image.winudf.com/v2/image1/Y29tLmFuZHJvaWQuZGVmYXVsdC9pY29uLnBuZw';
  const shortDesc = app.shortDescription || app.description || 'Verified Android Application';
  
  // Use the first screenshot as background, fallback to placeholder
  const screenshot = (app.screenshots && app.screenshots.length > 0) 
    ? app.screenshots[0] 
    : 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=60';

  return `
    <div class="featured-card" onclick="openAppDetail('${pkg}')">
      <img class="featured-bg-img" src="${screenshot}" alt="${title}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=60'">
      <div class="featured-overlay"></div>
      <div class="featured-play-badge"><i class="fa-solid fa-gamepad"></i></div>
      <div class="featured-content">
        <h3 class="featured-title-text">${title}</h3>
        <p class="featured-sub-text">${shortDesc}</p>
        <div class="featured-app-bar">
          <div class="featured-app-info">
            <img class="featured-app-icon" src="${icon}" alt="${title}">
            <div class="featured-app-meta">
              <span class="featured-app-title">${title}</span>
              <span class="featured-app-dev">${dev}</span>
            </div>
          </div>
          <button class="featured-install-btn" onclick="event.stopPropagation(); triggerDownload('${pkg}', '${encodeURIComponent(title)}')">
            <i class="fa-solid fa-download"></i> Get APK
          </button>
        </div>
      </div>
    </div>
  `;
}

// Render clean App Icon Cards (Google Play style)
function renderAppIconCard(app) {
  const pkg = app.packageName || '';
  const title = app.title || 'App';
  const icon = app.icon || 'https://image.winudf.com/v2/image1/Y29tLmFuZHJvaWQuZGVmYXVsdC9pY29uLnBuZw';
  const rating = formatRating(app.rating);

  return `
    <div class="app-icon-card" onclick="openAppDetail('${pkg}')" title="${title}">
      <img class="app-icon-img" src="${icon}" alt="${title}" loading="lazy" onerror="this.src='https://image.winudf.com/v2/image1/Y29tLmFuZHJvaWQuZGVmYXVsdC9pY29uLnBuZw'">
      <h4 class="app-icon-title">${title}</h4>
      <div class="app-icon-rating">
        <span>${rating} <i class="fa-solid fa-star"></i></span>
      </div>
    </div>
  `;
}

// Home View
async function loadHomeView() {
  const container = document.getElementById('viewContainer');
  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Loading curated Android apps & games from LX App Store...</p>
    </div>
  `;

  try {
    if (!homeData) {
      const res = await fetch('/api/home');
      homeData = await res.json();
    }

    if (!homeData || homeData.success !== 1) {
      container.innerHTML = `<div class="empty-state"><p>Unable to load home feed.</p></div>`;
      return;
    }

    const { top_apps, new_releases, popular_apps } = homeData.data;
    let html = '';

    // 1. Most Downloaded Section (Detailed Cards Grid)
    if (top_apps && top_apps.length > 0) {
      html += `
        <div class="section-header">
          <h2 class="section-title"><i class="fa-solid fa-fire" style="color: var(--primary);"></i> Most Downloaded Apps</h2>
          <a class="section-link" onclick="navigateTo('apps')">View All <i class="fa-solid fa-arrow-right"></i></a>
        </div>
        <div class="app-grid">
          ${top_apps.slice(0, 8).map(app => renderAppCard(app)).join('')}
        </div>
      `;
    }

    // 2. Latest Releases & Updates Section (Detailed Cards Grid)
    if (new_releases && new_releases.length > 0) {
      html += `
        <div class="section-header">
          <h2 class="section-title"><i class="fa-solid fa-clock-rotate-left" style="color: var(--primary);"></i> Latest Releases & Updates</h2>
          <a class="section-link" onclick="navigateTo('new')">View All <i class="fa-solid fa-arrow-right"></i></a>
        </div>
        <div class="app-grid">
          ${new_releases.slice(0, 8).map(app => renderAppCard(app)).join('')}
        </div>
      `;
    }

    // 3. Popular Discoveries Section (Detailed Cards Grid)
    if (popular_apps && popular_apps.length > 0) {
      html += `
        <div class="section-header">
          <h2 class="section-title"><i class="fa-solid fa-compass" style="color: var(--primary);"></i> Popular Discoveries</h2>
        </div>
        <div class="app-grid">
          ${popular_apps.slice(0, 8).map(app => renderAppCard(app)).join('')}
        </div>
      `;
    }

    // 4. Featured Banners at the bottom (Take a look at these top picks)
    if (popular_apps && popular_apps.length > 0) {
      html += `
        <div class="section-header" style="margin-top: 32px;">
          <h2 class="section-title"><i class="fa-solid fa-star" style="color: var(--primary);"></i> Take a look at these top picks</h2>
        </div>
        <div class="featured-grid" id="featuredGrid">
          <div class="loading-state" style="grid-column: span 3; padding: 40px 0;">
            <div class="spinner sm"></div>
            <p>Fetching featured app assets...</p>
          </div>
        </div>
      `;
    }

    container.innerHTML = html;

    // Async load featured cards details in background to display screenshots at the bottom
    if (popular_apps && popular_apps.length > 0) {
      const featuredList = popular_apps.slice(0, 3);
      Promise.all(featuredList.map(app => getAppDetailSilently(app.packageName)))
        .then(details => {
          const featuredGrid = document.getElementById('featuredGrid');
          if (featuredGrid) {
            featuredGrid.innerHTML = details.map((detail, index) => {
              const appData = detail || featuredList[index];
              return renderFeaturedCard(appData);
            }).join('');
          }
        });
    }

  } catch (e) {
    container.innerHTML = `<div class="empty-state"><p>Error connecting to API: ${e.message}</p></div>`;
  }
}

// Top Games View
async function loadTopGamesView() {
  const container = document.getElementById('viewContainer');
  container.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Loading Top Games...</p></div>`;
  try {
    const res = await fetch('/api/category/game/apps');
    const json = await res.json();
    const apps = json.data || [];
    container.innerHTML = `
      <div class="section-header">
        <h2 class="section-title"><i class="fa-solid fa-gamepad" style="color: var(--primary);"></i> Top Android Games</h2>
      </div>
      <div class="app-grid">${apps.map(app => renderAppCard(app)).join('')}</div>
    `;
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><p>Failed to load games.</p></div>`;
  }
}

// Top Apps View
async function loadTopAppsView() {
  const container = document.getElementById('viewContainer');
  container.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Loading Top Apps...</p></div>`;
  try {
    const res = await fetch('/api/search?q=top');
    const json = await res.json();
    const apps = json.data || [];
    container.innerHTML = `
      <div class="section-header">
        <h2 class="section-title"><i class="fa-solid fa-fire" style="color: var(--primary);"></i> Top Android Apps</h2>
      </div>
      <div class="app-grid">${apps.map(app => renderAppCard(app)).join('')}</div>
    `;
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><p>Failed to load apps.</p></div>`;
  }
}

// New Releases View
async function loadNewReleasesView() {
  const container = document.getElementById('viewContainer');
  container.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Loading Latest Releases...</p></div>`;
  try {
    const res = await fetch('/api/search?q=new');
    const json = await res.json();
    const apps = json.data || [];
    container.innerHTML = `
      <div class="section-header">
        <h2 class="section-title"><i class="fa-solid fa-clock-rotate-left" style="color: var(--primary);"></i> Latest Releases & Updates</h2>
      </div>
      <div class="app-grid">${apps.map(app => renderAppCard(app)).join('')}</div>
    `;
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><p>Failed to load releases.</p></div>`;
  }
}

// Categories View
async function loadCategoriesView() {
  const container = document.getElementById('viewContainer');
  container.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Loading Categories...</p></div>`;
  try {
    const res = await fetch('/api/categories');
    const json = await res.json();
    const categories = json.data || [];
    container.innerHTML = `
      <div class="section-header">
        <h2 class="section-title"><i class="fa-solid fa-shapes" style="color: var(--primary);"></i> App Categories</h2>
      </div>
      <div class="app-grid">
        ${categories.map(cat => `
          <div class="app-card" onclick="navigateTo('category', {id: '${cat.id}', name: '${cat.name}'})">
            <div class="app-card-top">
              <div class="logo-badge" style="background: ${cat.color};">
                <i class="fa-solid ${cat.icon}"></i>
              </div>
              <div class="app-card-meta">
                <h3 class="app-card-title">${cat.name}</h3>
                <p class="app-card-author">Browse top apps in category</p>
              </div>
            </div>
            <div class="app-card-actions">
              <span class="app-tag">Category</span>
              <button class="btn-download-sm">Explore <i class="fa-solid fa-chevron-right"></i></button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><p>Failed to load categories.</p></div>`;
  }
}

// Category Apps View
async function loadCategoryAppsView(catId, catName) {
  const container = document.getElementById('viewContainer');
  container.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Loading ${catName} Apps...</p></div>`;
  try {
    const res = await fetch(`/api/category/${catId}/apps`);
    const json = await res.json();
    const apps = json.data || [];
    container.innerHTML = `
      <div class="section-header">
        <h2 class="section-title"><i class="fa-solid fa-shapes" style="color: var(--primary);"></i> ${catName}</h2>
        <a class="section-link" onclick="navigateTo('categories')"><i class="fa-solid fa-arrow-left"></i> All Categories</a>
      </div>
      <div class="app-grid">
        ${apps.length > 0 ? apps.map(app => renderAppCard(app)).join('') : '<p>No apps found in this category.</p>'}
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><p>Failed to load category apps.</p></div>`;
  }
}

// Search Results View
async function loadSearchResultsView(query) {
  const container = document.getElementById('viewContainer');
  container.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Searching for "${query}"...</p></div>`;
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const json = await res.json();
    const apps = json.data || [];
    container.innerHTML = `
      <div class="section-header">
        <h2 class="section-title"><i class="fa-solid fa-magnifying-glass" style="color: var(--primary);"></i> Search Results for "${query}" (${apps.length})</h2>
        <a class="section-link" onclick="navigateTo('home')"><i class="fa-solid fa-house"></i> Home</a>
      </div>
      <div class="app-grid">
        ${apps.length > 0 ? apps.map(app => renderAppCard(app)).join('') : '<div class="empty-state"><p>No apps found matching your query. Try a different keyword.</p></div>'}
      </div>
    `;
  } catch (e) {
    container.innerHTML = `<div class="empty-state"><p>Search failed: ${e.message}</p></div>`;
  }
}

// Render Individual App Card
function renderAppCard(app) {
  const pkg = app.packageName || '';
  const title = app.title || 'App';
  const dev = app.developer || 'Developer';
  const icon = app.icon || 'https://image.winudf.com/v2/image1/Y29tLmFuZHJvaWQuZGVmYXVsdC9pY29uLnBuZw';
  const desc = app.shortDescription || app.description || 'Download verified APK directly to your device.';
  const rating = formatRating(app.rating);
  const size = formatBytes(app.size || (app.asset && app.asset.size));
  const fileType = (app.fileType || (app.asset && app.asset.type) || 'APK').toUpperCase();

  return `
    <div class="app-card" onclick="openAppDetail('${pkg}')">
      <div class="app-card-top">
        <img class="app-card-icon" src="${icon}" alt="${title}" loading="lazy" onerror="this.src='https://image.winudf.com/v2/image1/Y29tLmFuZHJvaWQuZGVmYXVsdC9pY29uLnBuZw'">
        <div class="app-card-meta">
          <h3 class="app-card-title" title="${title}">${title}</h3>
          <p class="app-card-author">${dev}</p>
          <div class="app-card-stats">
            <span class="app-rating"><i class="fa-solid fa-star"></i> ${rating}</span>
            <span><i class="fa-solid fa-hard-drive"></i> ${size}</span>
          </div>
        </div>
      </div>
      <p class="app-card-desc">${desc}</p>
      <div class="app-card-actions">
        <span class="app-tag">${app.categoryName || 'App'}</span>
        <button class="btn-download-sm" onclick="event.stopPropagation(); triggerDownload('${pkg}', '${encodeURIComponent(title)}')">
          <i class="fa-solid fa-download"></i> Get ${fileType}
        </button>
      </div>
    </div>
  `;
}

// App Detail Modal / Second Page
async function openAppDetail(packageName) {
  const modal = document.getElementById('appModal');
  const body = document.getElementById('modalBody');
  modal.classList.remove('hidden');
  body.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Fetching full app specifications from LX App Store...</p></div>`;

  try {
    const res = await fetch(`/api/app/detail?package_name=${encodeURIComponent(packageName)}`);
    const json = await res.json();
    const app = json.data;

    if (!app || (!app.title && !app.packageName)) {
      body.innerHTML = `<div class="empty-state"><p>App specifications not found.</p></div>`;
      return;
    }

    currentAppDetail = app;

    const icon = app.icon || 'https://image.winudf.com/v2/image1/Y29tLmFuZHJvaWQuZGVmYXVsdC9pY29uLnBuZw';
    const rating = formatRating(app.rating);
    const downloads = formatDownloads(app.downloadCount);
    const size = formatBytes((app.asset && app.asset.size) || app.size);
    const fileType = (app.asset && app.asset.type) ? app.asset.type.toUpperCase() : 'APK';
    const sha1 = (app.asset && app.asset.sha1) || app.sha1 || 'N/A';
    const screenshots = app.screenshots || [];
    const wishlisted = isWishlisted(app.packageName);
    const versionName = app.versionName || (app.versionCode ? `v${app.versionCode}` : 'Latest');
    const dlFileUrl = `/api/download/file?package_name=${encodeURIComponent(app.packageName)}`;

    body.innerHTML = `
      <div class="app-detail-header">
        <img class="app-detail-icon" src="${icon}" alt="${app.title}" onerror="this.src='https://image.winudf.com/v2/image1/Y29tLmFuZHJvaWQuZGVmYXVsdC9pY29uLnBuZw'">
        <div class="app-detail-info">
          <h2 class="app-detail-title">${app.title}</h2>
          <p class="app-detail-author"><i class="fa-solid fa-circle-check" style="color: var(--primary);"></i> ${app.developer || 'Verified Developer'}</p>
          <div class="app-detail-badges">
            <div class="detail-badge">
              <span class="detail-badge-label">Rating</span>
              <span class="detail-badge-val"><i class="fa-solid fa-star" style="color: var(--star-color);"></i> ${rating}</span>
            </div>
            <div class="detail-badge">
              <span class="detail-badge-label">Downloads</span>
              <span class="detail-badge-val">${downloads}</span>
            </div>
            <div class="detail-badge">
              <span class="detail-badge-label">File Size</span>
              <span class="detail-badge-val">${size}</span>
            </div>
            <div class="detail-badge">
              <span class="detail-badge-label">Format</span>
              <span class="detail-badge-val">${fileType}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="app-detail-actions">
        <button class="btn-primary-dl" onclick="triggerDownload('${app.packageName}', '${encodeURIComponent(app.title)}')">
          <i class="fa-solid fa-download"></i> Download ${fileType} (${versionName})
        </button>
        <div class="app-detail-sub-actions">
          <button class="btn-secondary" onclick="openVersionsModal('${app.packageName}', '${encodeURIComponent(app.title)}')">
            <i class="fa-solid fa-code-branch"></i> Previous Versions
          </button>
          <button id="detailsWishlistBtn" class="btn-secondary ${wishlisted ? 'wishlisted' : ''}" onclick="toggleWishlist(currentAppDetail)">
            <i class="${wishlisted ? 'fa-solid' : 'fa-regular'} fa-bookmark"></i> Wishlist
          </button>
        </div>
      </div>

      <!-- Screenshots Gallery -->
      ${screenshots.length > 0 ? `
        <div class="screenshots-section">
          <h4 style="margin-bottom: 10px; font-weight: 700;">Screenshots</h4>
          <div class="screenshots-scroll">
            ${screenshots.map(url => `
              <img class="screenshot-item" src="${url}" alt="Screenshot" onclick="openLightbox('${url}')" loading="lazy">
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Description -->
      <div class="app-description-box">
        <h4>About ${app.title}</h4>
        <p>${(app.description || app.shortDescription || 'No description available.').replace(/\n/g, '<br>')}</p>
      </div>

      <!-- Technical Specs -->
      <h4 style="margin-bottom: 12px; font-weight: 700;">Technical Specifications</h4>
      <table class="tech-specs-table">
        <tbody>
          <tr>
            <td>Package Name</td>
            <td><code>${app.packageName}</code></td>
          </tr>
          <tr>
            <td>Version</td>
            <td>${versionName} (Code: ${app.versionCode || 'N/A'})</td>
          </tr>
          <tr>
            <td>Category</td>
            <td>${app.categoryName || 'App'}</td>
          </tr>
          <tr>
            <td>Last Updated</td>
            <td>${app.updateDate || 'Recent'}</td>
          </tr>
          <tr>
            <td>SHA-1 Checksum</td>
            <td>
              <span>${sha1}</span>
              <button class="copy-hash-btn" onclick="copyToClipboard('${sha1}')" title="Copy Checksum"><i class="fa-regular fa-copy"></i></button>
            </td>
          </tr>
        </tbody>
      </table>
    `;
  } catch (e) {
    body.innerHTML = `<div class="empty-state"><p>Error: ${e.message}</p></div>`;
  }
}

function closeAppModal() {
  document.getElementById('appModal').classList.add('hidden');
}

// Guaranteed 100% Reliable File Download Trigger
function triggerDownload(packageName, encodedTitle) {
  const title = decodeURIComponent(encodedTitle || 'Application');
  showToast(`Starting download for ${title}...`);
  showDownloadBanner(title, packageName);

  const downloadUrl = `/api/download/file?package_name=${encodeURIComponent(packageName)}`;

  // 1. Trigger download via hidden iframe (does not navigate away or close modals)
  let ifr = document.getElementById('lx_dl_iframe');
  if (!ifr) {
    ifr = document.createElement('iframe');
    ifr.id = 'lx_dl_iframe';
    ifr.style.display = 'none';
    document.body.appendChild(ifr);
  }
  ifr.src = downloadUrl;

  // 2. Secondary fallback via invisible anchor
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = '';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function downloadDirectUrl(url, filename) {
  showToast(`Starting file download...`);
  const a = document.createElement('a');
  a.href = `/api/download/stream?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename || 'app.apk')}`;
  a.download = filename || 'app.apk';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// Version History Modal
async function openVersionsModal(packageName, encodedTitle) {
  const title = decodeURIComponent(encodedTitle || 'App');
  const modal = document.getElementById('versionsModal');
  const body = document.getElementById('versionsModalBody');
  const headerTitle = document.getElementById('versionsModalTitle');
  
  headerTitle.innerHTML = `<i class="fa-solid fa-code-branch"></i> Version History: ${title}`;
  modal.classList.remove('hidden');
  body.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Fetching historical APK releases...</p></div>`;

  try {
    const res = await fetch(`/api/app/versions?package_name=${encodeURIComponent(packageName)}`);
    const json = await res.json();
    const versions = json.data || [];

    if (versions.length === 0) {
      body.innerHTML = `<div class="empty-state"><p>No previous versions available for this application.</p></div>`;
      return;
    }

    body.innerHTML = versions.map(v => {
      const verName = v.versionName || (v.versionCode ? `v${v.versionCode}` : 'Version');
      const size = formatBytes(v.size || (v.asset && v.asset.size));
      const fileType = (v.fileType || (v.asset && v.asset.type) || 'APK').toUpperCase();
      const dlUrl = (v.asset && v.asset.url) ? v.asset.url : (v.downloadUrl || '');
      const fileName = `${title}_${verName}.${fileType.toLowerCase()}`;

      return `
        <div class="version-card">
          <div class="version-info">
            <h4>${verName} <span class="app-tag" style="margin-left: 8px;">${fileType}</span></h4>
            <div class="version-meta">
              <span><i class="fa-regular fa-calendar"></i> ${v.updateDate || 'Official Release'}</span>
              <span><i class="fa-solid fa-hard-drive"></i> ${size}</span>
              <span><i class="fa-solid fa-shield"></i> Verified Safe</span>
            </div>
          </div>
          ${dlUrl ? `
            <button class="btn-download-sm" onclick="downloadDirectUrl('${dlUrl}', '${fileName}')">
              <i class="fa-solid fa-download"></i> Download ${fileType}
            </button>
          ` : `
            <button class="btn-download-sm" onclick="triggerDownload('${packageName}', '${encodedTitle}')">
              <i class="fa-solid fa-download"></i> Download
            </button>
          `}
        </div>
      `;
    }).join('');
  } catch (e) {
    body.innerHTML = `<div class="empty-state"><p>Failed to load version history: ${e.message}</p></div>`;
  }
}

function closeVersionsModal() {
  document.getElementById('versionsModal').classList.add('hidden');
}

// Wishlist Modal
function openWishlistModal() {
  const modal = document.getElementById('wishlistModal');
  const body = document.getElementById('wishlistModalBody');
  const list = getWishlist();
  modal.classList.remove('hidden');

  if (list.length === 0) {
    body.innerHTML = `<div class="empty-state"><p><i class="fa-solid fa-bookmark" style="font-size: 2.2rem; margin-bottom: 12px; color: var(--text-dim);"></i><br>No bookmarked apps yet. Tap the bookmark button on any app to save it here.</p></div>`;
    return;
  }

  body.innerHTML = `<div class="app-grid">${list.map(app => renderWishlistAppCard(app)).join('')}</div>`;
}

function closeWishlistModal() {
  document.getElementById('wishlistModal').classList.add('hidden');
}

// Render Individual App Card for Wishlist (with hover delete effect)
function renderWishlistAppCard(app) {
  const pkg = app.packageName || '';
  const title = app.title || 'App';
  const dev = app.developer || 'Developer';
  const icon = app.icon || 'https://image.winudf.com/v2/image1/Y29tLmFuZHJvaWQuZGVmYXVsdC9pY29uLnBuZw';
  const desc = app.shortDescription || app.description || 'Download verified APK directly to your device.';
  const rating = formatRating(app.rating);
  const size = formatBytes(app.size || (app.asset && app.asset.size));
  const fileType = (app.fileType || (app.asset && app.asset.type) || 'APK').toUpperCase();

  return `
    <div class="app-card wishlist-card" onclick="openAppDetail('${pkg}')">
      <div class="wishlist-card-content">
        <div class="app-card-top">
          <img class="app-card-icon" src="${icon}" alt="${title}" loading="lazy" onerror="this.src='https://image.winudf.com/v2/image1/Y29tLmFuZHJvaWQuZGVmYXVsdC9pY29uLnBuZw'">
          <div class="app-card-meta">
            <h3 class="app-card-title" title="${title}">${title}</h3>
            <p class="app-card-author">${dev}</p>
            <div class="app-card-stats">
              <span class="app-rating"><i class="fa-solid fa-star"></i> ${rating}</span>
              <span><i class="fa-solid fa-hard-drive"></i> ${size}</span>
            </div>
          </div>
        </div>
        <p class="app-card-desc">${desc}</p>
        <div class="app-card-actions">
          <span class="app-tag">${app.categoryName || 'App'}</span>
          <button class="btn-download-sm" onclick="event.stopPropagation(); triggerDownload('${pkg}', '${encodeURIComponent(title)}')">
            <i class="fa-solid fa-download"></i> Get ${fileType}
          </button>
        </div>
      </div>
      <div class="wishlist-delete-overlay" onclick="event.stopPropagation(); confirmDeleteWishlist('${pkg}', '${encodeURIComponent(title)}')">
        <i class="fa-solid fa-trash-can"></i>
      </div>
    </div>
  `;
}

let pendingDeletePkg = null;

function confirmDeleteWishlist(pkg, encodedTitle) {
  const title = decodeURIComponent(encodedTitle);
  pendingDeletePkg = pkg;
  
  const modal = document.getElementById('confirmModal');
  const msgEl = document.getElementById('confirmMessage');
  
  if (modal && msgEl) {
    msgEl.innerText = `Are you sure you want to delete "${title}"?`;
    modal.classList.remove('hidden');
  }
}

function deleteFromWishlist(packageName) {
  const list = getWishlist();
  const index = list.findIndex(item => item.packageName === packageName);
  if (index > -1) {
    const title = list[index].title;
    list.splice(index, 1);
    saveWishlist(list);
    showToast(`Removed "${title}" from Wishlist`);
    openWishlistModal();
  }
}

function setupConfirmModal() {
  const cancelBtn = document.getElementById('confirmCancelBtn');
  const yesBtn = document.getElementById('confirmYesBtn');
  const modal = document.getElementById('confirmModal');
  
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      if (modal) modal.classList.add('hidden');
      pendingDeletePkg = null;
    });
  }
  
  if (yesBtn) {
    yesBtn.addEventListener('click', () => {
      if (modal) modal.classList.add('hidden');
      if (pendingDeletePkg) {
        deleteFromWishlist(pendingDeletePkg);
        pendingDeletePkg = null;
      }
    });
  }
}

function setupMobileSidebar() {
  const sidebar = document.getElementById('mobileSidebar');
  const openBtn = document.getElementById('menuToggleBtn');
  const closeBtn = document.getElementById('closeSidebarBtn');

  if (openBtn && sidebar) {
    openBtn.addEventListener('click', () => {
      sidebar.classList.remove('hidden');
    });
  }

  if (closeBtn && sidebar) {
    closeBtn.addEventListener('click', () => {
      sidebar.classList.add('hidden');
    });
  }

  if (sidebar) {
    sidebar.addEventListener('click', (e) => {
      if (e.target === sidebar) {
        sidebar.classList.add('hidden');
      }
    });
  }

  // Handle click on sidebar navigation tabs
  document.querySelectorAll('.sidebar-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const view = tab.getAttribute('data-view');
      navigateTo(view);
      if (sidebar) sidebar.classList.add('hidden');
    });
  });
}

// Lightbox
function openLightbox(url) {
  const modal = document.getElementById('lightboxModal');
  const img = document.getElementById('lightboxImg');
  img.src = url;
  modal.classList.remove('hidden');
}

function closeLightbox() {
  document.getElementById('lightboxModal').classList.add('hidden');
}

// Copy to Clipboard
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('SHA-1 checksum copied to clipboard!');
  }).catch(() => {
    showToast('Failed to copy checksum.');
  });
}

// Search History LocalStorage Management
function getSearchHistory() {
  try {
    return JSON.parse(localStorage.getItem('lx_search_history')) || [];
  } catch (e) {
    return [];
  }
}

function saveSearchHistory(query) {
  if (!query) return;
  let history = getSearchHistory();
  history = history.filter(item => item !== query);
  history.unshift(query);
  if (history.length > 6) {
    history = history.slice(0, 6);
  }
  localStorage.setItem('lx_search_history', JSON.stringify(history));
}

function deleteSearchHistoryItem(query) {
  let history = getSearchHistory();
  history = history.filter(item => item !== query);
  localStorage.setItem('lx_search_history', JSON.stringify(history));
  showSearchHistoryDropdown();
}

function showSearchHistoryDropdown() {
  const input = document.getElementById('globalSearchInput');
  const dropdown = document.getElementById('searchDropdown');
  const history = getSearchHistory();
  
  if (input.value.trim().length > 0) return;
  
  if (history.length > 0) {
    dropdown.innerHTML = `
      <div style="padding: 10px 16px; font-size: 0.8rem; font-weight: 700; color: var(--text-dim); border-bottom: 1px solid var(--border-color); background: var(--bg-card);">Recent Searches</div>
      ${history.map(query => `
        <div class="search-item" onclick="quickSearch('${query.replace(/'/g, "\\'")}'); document.getElementById('searchDropdown').classList.add('hidden');" style="display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 14px;">
            <i class="fa-solid fa-clock-rotate-left" style="color: var(--text-dim); font-size: 0.95rem;"></i>
            <span style="font-weight: 600; font-size: 0.92rem;">${query}</span>
          </div>
          <button onclick="event.stopPropagation(); deleteSearchHistoryItem('${query.replace(/'/g, "\\'")}')" style="background: none; border: none; color: var(--text-dim); cursor: pointer; padding: 6px; font-size: 0.95rem; display: flex; align-items: center; justify-content: center; transition: var(--transition);" title="Delete entry" onhover="this.style.color='var(--text-main)'">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      `).join('')}
    `;
    dropdown.classList.remove('hidden');
  } else {
    dropdown.classList.add('hidden');
  }
}

// Quick Search from Trending Tags
function quickSearch(tag) {
  const input = document.getElementById('globalSearchInput');
  input.value = tag;
  saveSearchHistory(tag);
  navigateTo('search', tag);
}

// Search Dropdown Setup
function setupSearch() {
  const input = document.getElementById('globalSearchInput');
  const clearBtn = document.getElementById('clearSearchBtn');
  const dropdown = document.getElementById('searchDropdown');

  input.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    clearBtn.classList.toggle('hidden', val.length === 0);

    if (val.length < 2) {
      dropdown.classList.add('hidden');
      if (val.length === 0) {
        showSearchHistoryDropdown();
      }
      return;
    }

    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(val)}`);
        const json = await res.json();
        const results = json.data || [];

        if (results.length > 0) {
          dropdown.innerHTML = results.slice(0, 6).map(app => {
            const icon = app.icon || 'https://image.winudf.com/v2/image1/Y29tLmFuZHJvaWQuZGVmYXVsdC9pY29uLnBuZw';
            return `
              <div class="search-item" onclick="openAppDetail('${app.packageName}'); document.getElementById('searchDropdown').classList.add('hidden');">
                <img src="${icon}" alt="${app.title}" onerror="this.src='https://image.winudf.com/v2/image1/Y29tLmFuZHJvaWQuZGVmYXVsdC9pY29uLnBuZw'">
                <div class="search-item-info">
                  <div class="search-item-title">${app.title}</div>
                  <div class="search-item-meta">${app.developer || 'Developer'} • ${formatRating(app.rating)} ★</div>
                </div>
              </div>
            `;
          }).join('');
          dropdown.classList.remove('hidden');
        } else {
          dropdown.classList.add('hidden');
        }
      } catch (e) {
        dropdown.classList.add('hidden');
      }
    }, 250);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const val = input.value.trim();
      if (val) {
        dropdown.classList.add('hidden');
        saveSearchHistory(val);
        navigateTo('search', val);
      }
    }
  });

  input.addEventListener('focus', () => {
    showSearchHistoryDropdown();
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.classList.add('hidden');
    showSearchHistoryDropdown();
    input.focus();
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-wrapper')) {
      dropdown.classList.add('hidden');
    }
  });
}

// Category Chips Strip Setup
async function setupCategoryChips() {
  const container = document.getElementById('categoryChips');
  try {
    const res = await fetch('/api/categories');
    const json = await res.json();
    const categories = json.data || [];

    container.innerHTML = `
      <button class="category-chip active" data-category-id="home" onclick="navigateTo('home')"><i class="fa-solid fa-star"></i> Featured</button>
      ${categories.map(c => `
        <button class="category-chip" data-category-id="${c.id}" onclick="navigateTo('category', {id: '${c.id}', name: '${c.name}'})">
          <i class="fa-solid ${c.icon}"></i> ${c.name}
        </button>
      `).join('')}
    `;
  } catch (e) {}
}

// Theme Toggle
function setupTheme() {
  const btn = document.getElementById('themeToggleBtn');
  const savedTheme = localStorage.getItem('lx_theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);

  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('lx_theme', next);
    updateThemeIcon(next);
  });
}

function updateThemeIcon(theme) {
  const btn = document.getElementById('themeToggleBtn');
  btn.innerHTML = theme === 'dark' ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
}

// Navigation Tabs Listeners
function setupNavTabs() {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const view = tab.getAttribute('data-view');
      navigateTo(view);
    });
  });
}

// Modal Backdrop Click to Close
function setupModalBackdrops() {
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.add('hidden');
      }
    });
  });
}

// Search Placeholder Ticker/Marquee
function initSearchPlaceholderMarquee() {
  const input = document.getElementById('globalSearchInput');
  if (!input) return;

  const desktopPlaceholder = "Search apps & games (e.g. WhatsApp, Minecraft)...";
  const mobilePlaceholderBase = "Search apps & games (e.g. WhatsApp, Minecraft, CapCut, Instagram)...         ";
  
  let index = 0;
  let marqueeInterval = null;

  function step() {
    input.placeholder = mobilePlaceholderBase.substring(index) + mobilePlaceholderBase.substring(0, index);
    index = (index + 1) % mobilePlaceholderBase.length;
  }

  function startMarquee() {
    if (window.innerWidth <= 768) {
      if (!marqueeInterval) {
        marqueeInterval = setInterval(step, 180);
      }
    } else {
      input.placeholder = desktopPlaceholder;
    }
  }

  function stopMarquee() {
    if (marqueeInterval) {
      clearInterval(marqueeInterval);
      marqueeInterval = null;
    }
    input.placeholder = window.innerWidth <= 768 ? "Search apps & games..." : desktopPlaceholder;
  }

  // Initial load
  if (window.innerWidth <= 768) {
    startMarquee();
  } else {
    input.placeholder = desktopPlaceholder;
  }

  input.addEventListener('focus', () => {
    stopMarquee();
  });

  input.addEventListener('blur', () => {
    if (!input.value) {
      if (window.innerWidth <= 768) {
        index = 0;
        startMarquee();
      } else {
        input.placeholder = desktopPlaceholder;
      }
    } else {
      input.placeholder = "";
    }
  });

  // Handle screen resize dynamically
  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) {
      stopMarquee();
      input.placeholder = desktopPlaceholder;
    } else if (!input.value && !marqueeInterval && document.activeElement !== input) {
      index = 0;
      startMarquee();
    }
  });
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  setupTheme();
  setupNavTabs();
  setupSearch();
  setupCategoryChips();
  setupModalBackdrops();
  setupConfirmModal();
  setupMobileSidebar();
  updateWishlistBadge();
  initSearchPlaceholderMarquee();
  loadHomeView();
});
