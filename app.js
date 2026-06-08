    // Debounce utility for input handlers
    function debounce(fn, delay) {
      let timeoutId;
      return function(...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn.apply(this, args), delay);
      };
    }

    // Scraped Dataset aligned with Australian store prices
    // Handles missing age/origin data, includes cents and 12-month histories (with nulls)
    // Rum 1 includes 26 store listings to test scroll handle scrolling
    // Rum 1 and Rum 5 have extremely long names to test layout multi-line safety guards
    let rumData = [];

    let favorites = JSON.parse(localStorage.getItem('rum_hunter_favorites')) || [];
    let currentFilter = 'all';
    let currentSort = 'price-asc';
    let currentSearch = '';
    let currentViewMode = 'grid';
    let currentPage = 1;
    let itemsPerPage = 6;
    let hideOutOfStock = false;

    // Viewport and Interaction Elements
    const searchBar = document.getElementById('search-bar');
    const searchClearBtn = document.getElementById('search-clear-btn');
    const sortSelector = document.getElementById('sort-selector');
    const dialog = document.getElementById('details-dialog');
    const dialogContent = document.getElementById('dialog-body-content');

    // Initialize Page
    document.addEventListener('DOMContentLoaded', () => {
      // Clean up initial CLS prevention classes
      document.documentElement.classList.remove(
        'init-view-grid',
        'init-view-list',
        'init-limit-3',
        'init-limit-6',
        'init-limit-12',
        'init-limit-all'
      );

      // Fetch products dynamically from external JSON
      fetch('rums.json')
        .then(response => {
          if (!response.ok) {
            throw new Error('Failed to load product data');
          }
          return response.json();
        })
        .then(data => {
          rumData = data;
          if (window.location.search) {
            parseURLParams();
          } else {
            updateURLParams(true);
          }
          renderProducts();
          updateFavCount();
          updateSortIndicators();
          setupEventListeners();
        })
        .catch(err => {
          console.error('Error loading rums.json:', err);
          // Attempt to render with empty list if fetch fails
          renderProducts();
        });
    });

    // Toggle Search Reset Button Visibility
    function toggleClearButton(value) {
      if (searchClearBtn) {
        if (value) {
          searchClearBtn.classList.add('visible');
        } else {
          searchClearBtn.classList.remove('visible');
        }
      }
    }

    // Event Listeners Setup
    function setupEventListeners() {
      const debouncedSearchHandler = debounce((value) => {
        currentSearch = value.toLowerCase();
        currentPage = 1;
        updateURLParams(true);
        renderProductsWithTransition();
      }, 250);

      searchBar.addEventListener('input', (e) => {
        toggleClearButton(e.target.value);
        debouncedSearchHandler(e.target.value);
      });

      if (searchClearBtn) {
        searchClearBtn.addEventListener('click', () => {
          searchBar.value = '';
          toggleClearButton('');
          currentSearch = '';
          currentPage = 1;
          searchBar.focus();
          updateURLParams();
          renderProductsWithTransition();
        });
      }

      sortSelector.addEventListener('change', (e) => {
        currentSort = e.target.value;
        currentPage = 1;
        updateURLParams();
        renderProductsWithTransition();
      });

      window.addEventListener('popstate', () => {
        parseURLParams();
        renderProductsWithTransition();
      });

    }

    // Fallback logic for missing age/location statements
    function getMetadataText(rum) {
      const parts = [];
      if (rum.age) parts.push(`${rum.age} Years`);
      if (rum.origin) parts.push(rum.origin);
      if (rum.size) parts.push(`${rum.size}ml`);
      if (rum.alc) parts.push(`${rum.alc}%`);
      if (parts.length === 0) {
        return "Scraped Entry"; // Display in their stead
      }
      return parts.join(" | ");
    }

    // Helper to format last seen date string with ordinal suffix and full month
    function formatLastSeen(dateStr) {
      if (!dateStr) return '';
      const parts = dateStr.trim().split(/\s+/);
      if (parts.length === 3) {
        // parts[0] is DD, parts[1] is Month, parts[2] is YYYY
        let dayInt = parseInt(parts[0], 10);
        let suffix = 'th';
        if (dayInt % 10 === 1 && dayInt !== 11) suffix = 'st';
        else if (dayInt % 10 === 2 && dayInt !== 12) suffix = 'nd';
        else if (dayInt % 10 === 3 && dayInt !== 13) suffix = 'rd';
        
        const dayFormatted = `${dayInt}${suffix}`;
        
        const monthNames = {
          'Jan': 'January', 'Feb': 'February', 'Mar': 'March', 'Apr': 'April',
          'May': 'May', 'Jun': 'June', 'Jul': 'July', 'Aug': 'August',
          'Sep': 'September', 'Oct': 'October', 'Nov': 'November', 'Dec': 'December'
        };
        const monthFull = monthNames[parts[1]] || parts[1];
        
        return `Last seen - ${dayFormatted} ${monthFull}, ${parts[2]}`;
      }
      return `Last seen - ${dateStr}`;
    }

    // Dynamic 12-Month SVG spectrum graph generation (shows price band between nightly High & Low)
    function generateHistoryGraphSVG(history) {
      const width = 230;
      const height = 40;
      const paddingLeft = 30;
      const paddingRight = 10;
      const paddingTop = 6;
      const paddingBottom = 6;

      const chartWidth = width - paddingLeft - paddingRight;
      const chartHeight = height - paddingTop - paddingBottom;

      // Filter out invalid points
      const validPoints = [];
      history.forEach((pt, idx) => {
        if (pt.low !== null && pt.high !== null) {
          validPoints.push({ ...pt, idx });
        }
      });

      if (validPoints.length === 0) {
        return `<div style="font-size:0.75rem; color:var(--color-text-muted); text-align:center; padding:12px 0;">No historical data logged</div>`;
      }

      const highs = validPoints.map(p => p.high);
      const lows = validPoints.map(p => p.low);
      const minPrice = Math.min(...lows) * 0.96;
      const maxPrice = Math.max(...highs) * 1.04;
      const priceRange = maxPrice - minPrice || 1;

      const getX = (idx) => paddingLeft + (idx / 11) * chartWidth;
      const getY = (val) => paddingTop + chartHeight - ((val - minPrice) / priceRange) * chartHeight;

      // Build top and bottom paths for the lines and the polygon band
      let topPath = "";
      let bottomPath = "";
      let polygonPath = "";

      validPoints.forEach((pt, i) => {
        const x = getX(pt.idx);
        const yHigh = getY(pt.high);
        const yLow = getY(pt.low);

        if (i === 0) {
          topPath += `M ${x} ${yHigh}`;
          bottomPath += `M ${x} ${yLow}`;
          polygonPath += `M ${x} ${yHigh}`;
        } else {
          topPath += ` L ${x} ${yHigh}`;
          bottomPath += ` L ${x} ${yLow}`;
          polygonPath += ` L ${x} ${yHigh}`;
        }
      });

      // Reverse trace for the bottom line to close the polygon
      for (let i = validPoints.length - 1; i >= 0; i--) {
        const pt = validPoints[i];
        const x = getX(pt.idx);
        const yLow = getY(pt.low);
        polygonPath += ` L ${x} ${yLow}`;
      }
      polygonPath += " Z";

      // Y-axis labels
      const yLabelHigh = maxPrice.toFixed(0);
      const yLabelLow = minPrice.toFixed(0);

      // Month X-axis labels
      const months = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

      const gradId = `graph-band-grad-${Math.floor(Math.random() * 1000000)}`;

      return `
        <div class="history-graph-wrapper" style="margin-bottom: 4px; width: 100%;">
          <div style="display:flex; justify-content:space-between; font-size:0.72rem; color:var(--color-text-muted); margin-bottom:6px; font-weight:600; text-transform:uppercase; letter-spacing:0.03em;">
            <span>Annual range</span>
            <span style="color:var(--color-refraction-gold)">
              ${Math.min(...lows) === Math.max(...highs)
          ? `Price $${Math.min(...lows).toFixed(2)}`
          : `Min/Max $${Math.min(...lows).toFixed(2)} - $${Math.max(...highs).toFixed(2)}`
        }
            </span>
          </div>
          <svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" style="background:rgba(0,0,0,0.25); border-radius:6px; overflow:visible; border: 1px solid rgba(59,29,10,0.2);">
            <defs>
              <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="var(--color-rum-amber)" stop-opacity="0.3"/>
                <stop offset="100%" stop-color="var(--color-rum-amber)" stop-opacity="0.05"/>
              </linearGradient>
            </defs>
            
            <!-- Guide lines -->
            <line x1="${paddingLeft}" y1="${paddingTop}" x2="${width - paddingRight}" y2="${paddingTop}" stroke="rgba(255,255,255,0.05)" stroke-dasharray="2 2" />
            <line x1="${paddingLeft}" y1="${paddingTop + chartHeight}" x2="${width - paddingRight}" y2="${paddingTop + chartHeight}" stroke="rgba(255,255,255,0.05)" stroke-dasharray="2 2" />
            
            <!-- Y Labels -->
            <text x="${paddingLeft - 6}" y="${paddingTop + 2.5}" font-size="7" fill="var(--color-text-muted)" text-anchor="end" font-family="var(--font-body)">$${yLabelHigh}</text>
            <text x="${paddingLeft - 6}" y="${paddingTop + chartHeight + 2.5}" font-size="7" fill="var(--color-text-muted)" text-anchor="end" font-family="var(--font-body)">$${yLabelLow}</text>
            
            <!-- Shaded Spectrum Band -->
            <path d="${polygonPath}" fill="url(#${gradId})" />
            
            <!-- Boundary Lines -->
            <path d="${topPath}" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="1.2" stroke-linecap="round" />
            <path d="${bottomPath}" fill="none" stroke="var(--color-rum-amber)" stroke-width="1.5" stroke-linecap="round" />
          </svg>
          
          <!-- Scaled HTML Month Labels flex row -->
          <div style="display:flex; justify-content:space-between; margin-left: 13.04%; margin-right: 4.35%; margin-top: 2px;">
            ${months.map(m => `<span style="font-size: 0.65rem; color: var(--color-text-muted); font-family: var(--font-body); width: 12px; text-align: center; display: inline-block;">${m}</span>`).join('')}
          </div>
        </div>
      `;
    }

    // Toggle Favorites
    function toggleFavorite(e, id) {
      e.stopPropagation();
      const index = favorites.indexOf(id);
      if (index > -1) {
        favorites.splice(index, 1);
      } else {
        favorites.push(id);
      }
      localStorage.setItem('rum_hunter_favorites', JSON.stringify(favorites));
      updateFavCount();
      renderProductsWithTransition();
    }

    function updateFavCount() {
      document.getElementById('fav-count').textContent = favorites.length;
    }

    // View Mode Toggle (Grid vs List)
    function setViewMode(mode) {
      currentViewMode = mode;
      const gridContainer = document.getElementById('grid-view-container');
      const listContainer = document.getElementById('list-view-container');
      const gridBtn = document.getElementById('grid-toggle-btn');
      const listBtn = document.getElementById('list-toggle-btn');

      if (mode === 'grid') {
        gridContainer.style.display = 'grid';
        listContainer.style.display = 'none';
        gridBtn.classList.add('active');
        listBtn.classList.remove('active');
      } else {
        gridContainer.style.display = 'none';
        listContainer.style.display = 'table';
        gridBtn.classList.remove('active');
        listBtn.classList.add('active');
      }
      currentPage = 1;
      updateURLParams();
      renderProductsWithTransition();
    }

    // Filter pill setup
    function setFilter(filter, element) {
      currentFilter = filter;
      currentPage = 1;
      document.querySelectorAll('.filter-pill').forEach(pill => pill.classList.remove('active'));
      element.classList.add('active');
      updateURLParams();
      renderProductsWithTransition();
    }

    // Toggle Card Flip
    function toggleFlip(element) {
      element.classList.toggle('flipped');
    }

    // Retrieve Filtered and Sorted list
    function getProcessedProducts() {
      return rumData
        .filter(rum => {
          if (hideOutOfStock && !rum.inStock) return false;

          const matchesSearch = rum.name.toLowerCase().includes(currentSearch) ||
            (rum.origin && rum.origin.toLowerCase().includes(currentSearch)) ||
            rum.tastingNotes.toLowerCase().includes(currentSearch);

          if (!matchesSearch) return false;

          switch (currentFilter) {
            case 'sale':
              return rum.price < rum.historicalLowest || rum.status === 'On Sale';
            case 'match':
              return rum.price === rum.historicalLowest;
            case 'new':
              return rum.status === 'New';
            case 'stock':
              return rum.inStock;
            case 'favorites':
              return favorites.includes(rum.id);
            default:
              return true;
          }
        })
        .sort((a, b) => {
          switch (currentSort) {
            case 'price-asc':
              return a.price - b.price;
            case 'price-desc':
              return b.price - a.price;
            case 'name-asc':
            case 'alphabetic':
              return a.name.localeCompare(b.name);
            case 'name-desc':
              return b.name.localeCompare(a.name);
            case 'age-desc':
              return (b.age || 0) - (a.age || 0);
            case 'fav-desc': {
              const aFav = favorites.includes(a.id) ? 1 : 0;
              const bFav = favorites.includes(b.id) ? 1 : 0;
              if (bFav !== aFav) return bFav - aFav;
              return a.price - b.price;
            }
            case 'fav-asc': {
              const aFav = favorites.includes(a.id) ? 1 : 0;
              const bFav = favorites.includes(b.id) ? 1 : 0;
              if (bFav !== aFav) return aFav - bFav;
              return a.price - b.price;
            }
            default:
              return a.price - b.price;
          }
        });
    }

    // Render Grid and List Products
    function renderProducts() {
      // Clean up previous 3D WebGL renderers first
      cleanupActive3D();

      const filteredRums = getProcessedProducts();
      const totalItems = filteredRums.length;

      const gridContainer = document.getElementById('grid-view-container');
      const listBody = document.getElementById('list-view-body');

      gridContainer.innerHTML = '';
      listBody.innerHTML = '';

      if (totalItems === 0) {
        const emptyHTML = `
          <div class="empty-state">
            <h3>No Scraped Items Found</h3>
            <p>We couldn't find any products matching your search criteria. Try adjusting your filter tags.</p>
          </div>
        `;
        gridContainer.innerHTML = emptyHTML;
        listBody.innerHTML = `<tr><td colspan="5">${emptyHTML}</td></tr>`;
        renderPaginationControls(0);
        return;
      }

      // Handle pagination limits
      let startIdx = 0;
      let endIdx = totalItems;
      let paginatedRums = filteredRums;

      if (itemsPerPage !== Infinity) {
        const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
        if (currentPage > totalPages) currentPage = totalPages;

        startIdx = (currentPage - 1) * itemsPerPage;
        endIdx = Math.min(startIdx + itemsPerPage, totalItems);
        paginatedRums = filteredRums.slice(startIdx, endIdx);
      }

      paginatedRums.forEach(rum => {
        const isFav = favorites.includes(rum.id);
        const isSale = rum.price < rum.historicalLowest || rum.status === 'On Sale';
        const isBestMatch = rum.price === rum.historicalLowest;
        const starClass = isFav ? 'active' : '';

        // Status Tag Logic (Rare Allocation Removed)
        let statusTag = '';
        if (!rum.inStock) {
          statusTag = '<span class="status-badge">Out of Stock</span>';
        } else if (isSale) {
          statusTag = '<span class="status-badge on-sale">On Sale</span>';
        } else if (rum.status === 'New') {
          statusTag = '<span class="status-badge new">New product</span>';
        } else if (rum.status === 'Back in Stock') {
          statusTag = '<span class="status-badge back-in-stock">Restocked</span>';
        }

        // Price comparison UI with Cents shown
        let priceUI = `<span class="price-current">$${rum.price.toFixed(2)}</span>`;
        if (isSale) {
          priceUI = `
            <span class="price-old">$${rum.historicalLowest.toFixed(2)}</span>
            <span class="price-current">$${rum.price.toFixed(2)}</span>
          `;
        }

        let bestPriceBadge = isBestMatch ? '<span class="best-price-badge">Best Price Match</span>' : '';
        if (isSale) bestPriceBadge = '<span class="best-price-badge" style="background:rgba(46,204,113,0.1); border-color:#2ecc71; color:#2ecc71;">Best ever</span>';

        // Store prices calculation for range
        const storePrices = rum.stores.map(s => s.price);
        const minStorePrice = Math.min(...storePrices, rum.price);
        const maxStorePrice = Math.max(...storePrices, rum.price);

        // Sort store listings to highlight current best
        const sortedStores = [...rum.stores].sort((a, b) => a.price - b.price);

        // Store scrollable rows (as clickable anchors)
        const storeRowsHTML = sortedStores.map(store => {
          const isStoreOutOfStock = store.inStock === false;
          const isBest = !isStoreOutOfStock && store.price === minStorePrice;
          const priceDisplay = isStoreOutOfStock 
            ? '<span style="color:#e74c3c; font-size:0.7rem; font-weight:600; text-transform:uppercase; letter-spacing:0.02em;">Out of stock</span>' 
            : `$${store.price.toFixed(2)}`;
          const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(rum.name + ' ' + store.name)}`;
          return `
            <a href="${searchUrl}" target="_blank" rel="noopener noreferrer" class="store-row ${isBest ? 'best-price' : ''} ${isStoreOutOfStock ? 'store-out-of-stock' : ''}" onclick="event.stopPropagation()">
              <span class="store-name">${store.name}</span>
              <span class="store-price">${priceDisplay}</span>
            </a>
          `;
        }).join('');

        // Inline SVG History Graph
        const historyGraphHTML = generateHistoryGraphSVG(rum.history);

        // Metadata line
        const metadataText = getMetadataText(rum);

        // SVG Bottle Silhouette layout helper
        let imageHTML = `<img src="${rum.image}" alt="${rum.name}" class="card-bottle-img">`;
        let thumbHTML = `<img src="${rum.image}" alt="${rum.name}" class="list-thumb">`;
        if (rum.isAnimated) {
          imageHTML = `
            <div class="three-canvas-wrapper card-bottle-img" id="rum-3d-canvas-${rum.id}" style="width: 100%; height: 100%;"></div>
          `;
          const svgPath = 'M 20,290 C 20,295 25,300 30,300 L 70,300 C 75,300 80,295 80,290 L 80,120 C 80,95 72,80 58,70 L 58,25 C 60,25 61,24 61,22 L 61,15 C 61,13 60,12 58,12 L 58,0 L 42,0 L 42,12 C 40,12 39,13 39,15 L 39,22 C 39,24 40,25 42,25 L 42,70 C 28,80 20,95 20,120 Z';
          thumbHTML = `
            <svg class="list-thumb svg-silhouette" viewBox="0 0 100 300" style="height:100%; width:auto; color:var(--color-rum-amber); opacity:0.3;">
              <path fill="currentColor" stroke="var(--color-refraction-gold)" stroke-width="4" d="${svgPath}" />
            </svg>
          `;
        } else if (rum.image === 'bottle_silhouette.svg') {
          const svgPath = 'M 20,290 C 20,295 25,300 30,300 L 70,300 C 75,300 80,295 80,290 L 80,120 C 80,95 72,80 58,70 L 58,25 C 60,25 61,24 61,22 L 61,15 C 61,13 60,12 58,12 L 58,0 L 42,0 L 42,12 C 40,12 39,13 39,15 L 39,22 C 39,24 40,25 42,25 L 42,70 C 28,80 20,95 20,120 Z';
          imageHTML = `
            <svg class="card-bottle-img svg-silhouette" viewBox="0 0 100 300" style="height:100%; max-height:100%; color:var(--color-rum-amber); opacity:0.18; transition: opacity var(--transition-base), transform var(--transition-base);">
              <path fill="currentColor" stroke="var(--color-refraction-gold)" stroke-width="2" stroke-linejoin="round" d="${svgPath}" />
            </svg>
          `;
          thumbHTML = `
            <svg class="list-thumb svg-silhouette" viewBox="0 0 100 300" style="height:100%; width:auto; color:var(--color-rum-amber); opacity:0.3;">
              <path fill="currentColor" stroke="var(--color-refraction-gold)" stroke-width="4" d="${svgPath}" />
            </svg>
          `;
        }

        // --- GRID VIEW CARD (3D FLIP) ---
        const cardHTML = `
          <div class="card-container ${rum.inStock ? '' : 'out-of-stock'}" data-id="${rum.id}" style="view-transition-name: card-${rum.id}" onclick="toggleFlip(this)">
            <div class="card-inner">
              <!-- Front Face -->
              <div class="card-front">
                <div class="card-header-row">
                  ${statusTag ? statusTag : '<span></span>'}
                  <button class="btn-star ${starClass}" onclick="toggleFavorite(event, ${rum.id})" aria-label="Toggle Favorite">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
                  </button>
                </div>
                <div class="card-img-box">
                  ${imageHTML}
                </div>
                <div>
                  <div class="card-meta">${metadataText}</div>
                  <h3 class="card-title">${rum.name}</h3>
                  <div class="price-row">
                    <div class="prices">
                      ${priceUI}
                    </div>
                    ${bestPriceBadge}
                  </div>
                </div>
              </div>
              
              <!-- Back Face -->
              <div class="card-back" style="display: flex; flex-direction: column; justify-content: space-between; height: 100%; box-sizing: border-box;">
                <!-- Top Section -->
                <div style="display: flex; flex-direction: column; flex-grow: 1; overflow: hidden;">
                  <h3 class="card-back-title" style="margin-bottom: 4px;">${rum.name}</h3>
                  <p class="card-back-tasting-notes" title="${rum.tastingNotes}">
                    ${rum.tastingNotes}
                  </p>
                  
                  <!-- Scrollable comparative store list -->
                  <div class="store-list-container" style="display: flex; flex-direction: column; flex-grow: 1; overflow: hidden; min-height: 90px; margin-bottom: 8px;">
                    <div class="store-list-title">${rum.stores.length === 1 ? 'Listing' : 'Listings'} (${rum.stores.length})</div>
                    <div class="store-scroll-area" style="flex-grow: 1; overflow-y: auto; margin-bottom: 4px;">
                      ${storeRowsHTML}
                    </div>
                    <div class="range-info" style="margin-top: auto; padding-top: 4px;">
                      <span class="range-info-label">Price range</span>
                      ${minStorePrice === maxStorePrice
            ? `<span class="range-min">$${minStorePrice.toFixed(2)}</span>`
            : `<span class="range-min">$${minStorePrice.toFixed(2)}</span> - <span class="range-max" style="font-size:0.72rem; opacity:0.75;">$${maxStorePrice.toFixed(2)}</span>`
          }
                    </div>
                  </div>
                </div>

                <!-- Bottom Section (Graph and Action) -->
                <div style="margin-top: auto; display: flex; flex-direction: column; gap: 8px;">
                  <!-- 12-Month Price Graph -->
                  ${historyGraphHTML}
                  
                  <div class="card-back-last-seen-container">
                    ${!rum.inStock && rum.lastSeenStock ? `<div class="card-back-last-seen-text">${formatLastSeen(rum.lastSeenStock)}</div>` : ''}
                  </div>
                  
                  <div class="card-back-actions">
                    <button class="btn btn-secondary btn-sm" style="width: 100%; font-size: 0.75rem;" onclick="openPlaceholderDetails(event, '${rum.name.replace(/'/g, "\\'")}')">View Details</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;

        // --- LIST VIEW ROW ---
        let listStatusTag = '';
        if (!rum.inStock) {
          listStatusTag = `
            <div style="display:flex; flex-direction:column; align-items:flex-start; gap:4px;">
              <span class="status-badge" style="color:#e74c3c; border-color:rgba(231,76,60,0.3);">Out of Stock</span>
              ${rum.lastSeenStock ? `<span style="font-size:0.65rem; color:#e74c3c; font-weight: 500;">Last seen in stock - ${rum.lastSeenStock}</span>` : ''}
            </div>
          `;
        } else if (isSale) {
          listStatusTag = '<span class="status-badge on-sale">On Sale</span>';
        } else if (isBestMatch) {
          listStatusTag = '<span class="status-badge new">Best Price</span>';
        } else {
          listStatusTag = '<span class="status-badge">Logged</span>';
        }

        const listRowHTML = `
          <tr class="list-item-row ${rum.inStock ? '' : 'out-of-stock'}" data-id="${rum.id}" style="view-transition-name: row-${rum.id}" onclick="openDetailsModal(${rum.id})">
            <td>
              <div class="list-thumb-box">
                ${thumbHTML}
              </div>
            </td>
            <td class="list-name-col">
              <h4 style="display: -webkit-box; -webkit-line-clamp: 1; -webkit-box-orient: vertical; overflow: hidden;">${rum.name}</h4>
              <span>At ${rum.stores.length} ${rum.stores.length === 1 ? 'store' : 'stores'}</span>
            </td>
            <td>${metadataText}</td>
            <td>
              <div class="list-price-cell">
                ${priceUI}
                ${bestPriceBadge}
                ${listStatusTag}
              </div>
            </td>
            <td style="text-align: right;">
              <div style="display:flex; justify-content: flex-end; align-items: center; gap:12px;">
                <button class="btn-star ${starClass}" onclick="toggleFavorite(event, ${rum.id})" aria-label="Toggle Favorite">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
                </button>
                <button class="btn btn-secondary btn-sm" onclick="openPlaceholderDetails(event, '${rum.name.replace(/'/g, "\\'")}')">
                  Details
                </button>
              </div>
            </td>
          </tr>
        `;

        gridContainer.insertAdjacentHTML('beforeend', cardHTML);
        listBody.insertAdjacentHTML('beforeend', listRowHTML);
      });

      // Initialize Three.js for any visible animated cards
      paginatedRums.forEach(rum => {
        if (rum.isAnimated) {
          initCard3D(rum);
        }
      });

      renderPaginationControls(totalItems);
    }

    // --- 3D WebGL Bottle Integration Manager ---
    let activeRenderers = {};
    let shared3DResources = null;

    function cleanupActive3D() {
      for (const id in activeRenderers) {
        const item = activeRenderers[id];
        if (item) {
          if (item.animationFrameId) {
            cancelAnimationFrame(item.animationFrameId);
          }
          if (item.resizeObserver) {
            item.resizeObserver.disconnect();
          }
          if (item.intersectionObserver) {
            item.intersectionObserver.disconnect();
          }
          if (item.renderer) {
            item.renderer.dispose();
            if (item.renderer.domElement && item.renderer.domElement.parentNode) {
              item.renderer.domElement.parentNode.removeChild(item.renderer.domElement);
            }
          }
        }
      }
      activeRenderers = {};
    }

    function initShared3DResources() {
      if (shared3DResources) return shared3DResources;

      try {
        // --- 1. Shared High-Fidelity Studio Environment Mapping ---
        const envCanvas = document.createElement('canvas');
        envCanvas.width = 512;
        envCanvas.height = 256;
        const envCtx = envCanvas.getContext('2d');
        envCtx.fillStyle = '#0f0804';
        envCtx.fillRect(0, 0, 512, 256);

        let leftBox = envCtx.createLinearGradient(40, 0, 140, 0);
        leftBox.addColorStop(0, 'rgba(255,255,255,0)');
        leftBox.addColorStop(0.5, 'rgba(255,255,255,0.75)');
        leftBox.addColorStop(1, 'rgba(255,255,255,0)');
        envCtx.fillStyle = leftBox;
        envCtx.fillRect(40, 0, 100, 256);

        let rightBox = envCtx.createLinearGradient(360, 0, 440, 0);
        rightBox.addColorStop(0, 'rgba(255,255,255,0)');
        rightBox.addColorStop(0.5, 'rgba(255,255,255,0.85)');
        rightBox.addColorStop(1, 'rgba(255,255,255,0)');
        envCtx.fillStyle = rightBox;
        envCtx.fillRect(360, 0, 80, 256);

        const envTexture = new THREE.CanvasTexture(envCanvas);
        envTexture.mapping = THREE.EquirectangularReflectionMapping;

        // --- 2. Shared Bottle & Liquid Geometries ---
        const glassPoints = [];
        // Outer profile
        glassPoints.push(new THREE.Vector2(0, -1.6));
        glassPoints.push(new THREE.Vector2(0.78, -1.6));
        glassPoints.push(new THREE.Vector2(0.81, -1.45));
        glassPoints.push(new THREE.Vector2(0.81, 0.50));
        glassPoints.push(new THREE.Vector2(0.78, 0.70));
        glassPoints.push(new THREE.Vector2(0.68, 0.90));
        glassPoints.push(new THREE.Vector2(0.50, 1.05));
        glassPoints.push(new THREE.Vector2(0.28, 1.15));
        glassPoints.push(new THREE.Vector2(0.26, 1.55));
        glassPoints.push(new THREE.Vector2(0.28, 1.58));
        glassPoints.push(new THREE.Vector2(0.28, 1.63));
        glassPoints.push(new THREE.Vector2(0.26, 1.65));
        glassPoints.push(new THREE.Vector2(0.29, 1.68));
        glassPoints.push(new THREE.Vector2(0.29, 1.76));
        glassPoints.push(new THREE.Vector2(0.25, 1.78));
        glassPoints.push(new THREE.Vector2(0.20, 1.78));
        // Inner profile
        glassPoints.push(new THREE.Vector2(0.20, 1.15));
        glassPoints.push(new THREE.Vector2(0.42, 1.00));
        glassPoints.push(new THREE.Vector2(0.60, 0.85));
        glassPoints.push(new THREE.Vector2(0.72, 0.65));
        glassPoints.push(new THREE.Vector2(0.75, 0.45));
        glassPoints.push(new THREE.Vector2(0.75, -1.35));
        glassPoints.push(new THREE.Vector2(0.70, -1.42));
        glassPoints.push(new THREE.Vector2(0, -1.42));
        const glassGeometry = new THREE.LatheGeometry(glassPoints, 64);

        const liquidPoints = [];
        liquidPoints.push(new THREE.Vector2(0, -1.41));
        liquidPoints.push(new THREE.Vector2(0.74, -1.41));
        liquidPoints.push(new THREE.Vector2(0.74, 0.45));
        liquidPoints.push(new THREE.Vector2(0.71, 0.65));
        liquidPoints.push(new THREE.Vector2(0, 0.65));
        const liquidGeometry = new THREE.LatheGeometry(liquidPoints, 64);

        const stopperPoints = [];
        stopperPoints.push(new THREE.Vector2(0, 1.75));
        stopperPoints.push(new THREE.Vector2(0.23, 1.75));
        stopperPoints.push(new THREE.Vector2(0.24, 1.80));
        stopperPoints.push(new THREE.Vector2(0.24, 1.92));
        stopperPoints.push(new THREE.Vector2(0.20, 1.97));
        stopperPoints.push(new THREE.Vector2(0, 1.97));
        const stopperGeometry = new THREE.LatheGeometry(stopperPoints, 64);

        // --- 3. Shared Label Construction ---
        const canvasWidth = 1024;
        const canvasHeight = 512;
        const textCanvas = document.createElement('canvas');
        textCanvas.width = canvasWidth;
        textCanvas.height = canvasHeight;
        const ctx = textCanvas.getContext('2d');
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);

        ctx.translate(canvasWidth / 2, canvasHeight / 2);
        ctx.scale(0.39, 1.0);

        const labelW = 800;
        const labelH = 460;
        ctx.fillStyle = '#151311';
        ctx.fillRect(-labelW / 2, -labelH / 2, labelW, labelH);

        const borderGrad = ctx.createLinearGradient(0, -labelH / 2, 0, labelH / 2);
        borderGrad.addColorStop(0, '#d4af37');
        borderGrad.addColorStop(0.5, '#f3e5ab');
        borderGrad.addColorStop(1, '#aa7c11');

        ctx.strokeStyle = borderGrad;
        ctx.lineWidth = 4;
        ctx.strokeRect(-labelW / 2 + 8, -labelH / 2 + 8, labelW - 16, labelH - 16);

        ctx.lineWidth = 1.5;
        ctx.strokeRect(-labelW / 2 + 14, -labelH / 2 + 14, labelW - 28, labelH - 28);

        ctx.fillStyle = '#e8c49e';
        ctx.font = '600 72px "Cormorant Garamond", "Georgia", serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.letterSpacing = '5px';

        ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
        ctx.shadowBlur = 5;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;

        ctx.fillText("Image coming soon", 0, -60);
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        const textTexture = new THREE.CanvasTexture(textCanvas);
        textTexture.wrapS = THREE.RepeatWrapping;
        textTexture.repeat.x = 1;

        const labelGeometry = new THREE.CylinderGeometry(0.818, 0.818, 1.4, 64, 1, true);

        // --- 4. Shared Materials ---
        const glassMaterial = new THREE.MeshPhysicalMaterial({
          color: 0xffffff,
          roughness: 0.02,
          metalness: 0.0,
          transmission: 0.98,
          ior: 1.52,
          thickness: 0.0,
          clearcoat: 1.0,
          clearcoatRoughness: 0.02,
          transparent: true,
          depthWrite: false
        });

        const liquidMaterial = new THREE.MeshPhysicalMaterial({
          color: 0xc25900,
          roughness: 0.05,
          metalness: 0.0,
          transmission: 0.45,
          ior: 1.35,
          thickness: 1.5,
          clearcoat: 1.0,
          clearcoatRoughness: 0.05,
          transparent: true
        });

        const labelMaterial = new THREE.MeshStandardMaterial({
          map: textTexture,
          side: THREE.DoubleSide,
          roughness: 0.40,
          metalness: 0.10,
          transparent: true,
          depthWrite: false
        });

        shared3DResources = {
          envTexture,
          glassGeometry,
          liquidGeometry,
          stopperGeometry,
          labelGeometry,
          glassMaterial,
          liquidMaterial,
          labelMaterial
        };
      } catch (err) {
        console.error("Failed to initialize WebGL Shared Resources:", err);
      }
      return shared3DResources;
    }

    function initCard3D(rum) {
      const containerId = `rum-3d-canvas-${rum.id}`;
      const container = document.getElementById(containerId);
      if (!container) return;

      const resources = initShared3DResources();
      if (!resources) return;

      const width = container.clientWidth || 150;
      const height = container.clientHeight || 190;

      const scene = new THREE.Scene();
      scene.environment = resources.envTexture;

      const camera = new THREE.PerspectiveCamera(28, width / height, 0.1, 1000);
      camera.position.set(0, 0.0, 8.0);

      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(0x000000, 0); // Transparent background
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.4;
      container.appendChild(renderer.domElement);

      const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
      scene.add(ambientLight);

      const frontKeyLight = new THREE.DirectionalLight(0xfff3e3, 1.8);
      frontKeyLight.position.set(2, 2, 5);
      scene.add(frontKeyLight);

      const dramaticRimBacklight = new THREE.DirectionalLight(0xffaa44, 2.0);
      dramaticRimBacklight.position.set(0, 0, -5);
      scene.add(dramaticRimBacklight);

      const topLight = new THREE.DirectionalLight(0xffffff, 1.2);
      topLight.position.set(0, 4, 2);
      scene.add(topLight);

      const masterBottleGroup = new THREE.Group();
      masterBottleGroup.position.y = -0.15;
      
      const startRotation = (rum.id * 1.7) % (Math.PI * 2);
      const speed = 0.003 + (rum.id * 0.0007) % 0.0035;
      masterBottleGroup.rotation.y = startRotation;
      
      scene.add(masterBottleGroup);

      const glassMesh = new THREE.Mesh(resources.glassGeometry, resources.glassMaterial);
      const liquidMesh = new THREE.Mesh(resources.liquidGeometry, resources.liquidMaterial);
      const stopperMesh = new THREE.Mesh(resources.stopperGeometry, resources.glassMaterial);
      const labelMesh = new THREE.Mesh(resources.labelGeometry, resources.labelMaterial);

      labelMesh.position.set(0, -0.55, 0);

      liquidMesh.renderOrder = 2;
      glassMesh.renderOrder = 3;
      stopperMesh.renderOrder = 4;
      labelMesh.renderOrder = 1;

      masterBottleGroup.add(liquidMesh);
      masterBottleGroup.add(glassMesh);
      masterBottleGroup.add(stopperMesh);
      masterBottleGroup.add(labelMesh);

      let isIntersecting = true;
      const intersectionObserver = new IntersectionObserver(entries => {
        for (let entry of entries) {
          isIntersecting = entry.isIntersecting;
        }
      }, {
        root: null,
        rootMargin: "50px",
        threshold: 0
      });
      intersectionObserver.observe(container);

      let animationFrameId;
      function animate() {
        animationFrameId = requestAnimationFrame(animate);
        if (!isIntersecting) return;
        masterBottleGroup.rotation.y += speed;
        renderer.render(scene, camera);
      }
      animate();

      const resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
          const { width, height } = entry.contentRect;
          if (width === 0 || height === 0) continue;
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          renderer.setSize(width, height);
        }
      });
      resizeObserver.observe(container);

      activeRenderers[rum.id] = {
        renderer,
        resizeObserver,
        intersectionObserver,
        animationFrameId
      };
    }

    // Handle sorting by clicking column headers in list view
    function handleHeaderSort(field) {
      let nextSort = 'price-asc';
      if (field === 'name') {
        nextSort = (currentSort === 'name-asc' || currentSort === 'alphabetic') ? 'name-desc' : 'name-asc';
      } else if (field === 'price') {
        nextSort = currentSort === 'price-asc' ? 'price-desc' : 'price-asc';
      } else if (field === 'favorite') {
        nextSort = currentSort === 'fav-desc' ? 'fav-asc' : 'fav-desc';
      }
      currentSort = nextSort;
      sortSelector.value = currentSort;
      currentPage = 1;
      updateURLParams();
      renderProductsWithTransition();
    }

    // Update sort chevron indicators in table headers
    function updateSortIndicators() {
      const indName = document.getElementById('sort-indicator-name');
      const indPrice = document.getElementById('sort-indicator-price');
      const indFav = document.getElementById('sort-indicator-favorite');

      if (indName) indName.textContent = '';
      if (indPrice) indPrice.textContent = '';
      if (indFav) indFav.textContent = '';

      if (currentSort === 'name-asc' || currentSort === 'alphabetic') {
        if (indName) indName.textContent = ' ▲';
      } else if (currentSort === 'name-desc') {
        if (indName) indName.textContent = ' ▼';
      } else if (currentSort === 'price-asc') {
        if (indPrice) indPrice.textContent = ' ▲';
      } else if (currentSort === 'price-desc') {
        if (indPrice) indPrice.textContent = ' ▼';
      } else if (currentSort === 'fav-desc') {
        if (indFav) indFav.textContent = ' ▲';
      } else if (currentSort === 'fav-asc') {
        if (indFav) indFav.textContent = ' ▼';
      }
    }

    // Change current page in pagination
    function changePage(page) {
      currentPage = page;
      updateURLParams();
      renderProductsWithTransition();
    }

    // Change page item limit in pagination
    function handleLimitChange(value) {
      if (value === 'all') {
        itemsPerPage = Infinity;
      } else {
        itemsPerPage = parseInt(value, 10);
      }
      currentPage = 1;
      updateURLParams();
      renderProductsWithTransition();
    }

    // Render pagination controls dynamically
    function renderPaginationControls(totalItems) {
      const controlsContainer = document.getElementById('pagination-controls');
      if (!controlsContainer) return;

      if (totalItems === 0) {
        controlsContainer.style.display = 'none';
        return;
      }
      controlsContainer.style.display = 'flex';

      const limitVal = itemsPerPage === Infinity ? 'all' : itemsPerPage;
      const totalPages = itemsPerPage === Infinity ? 1 : Math.ceil(totalItems / itemsPerPage);

      const startIdx = itemsPerPage === Infinity ? 0 : (currentPage - 1) * itemsPerPage;
      const endIdx = itemsPerPage === Infinity ? totalItems : Math.min(startIdx + itemsPerPage, totalItems);

      const showingText = totalItems > 0
        ? `Showing ${startIdx + 1}–${endIdx} of ${totalItems} items`
        : `Showing 0–0 of 0 items`;

      let buttonsHTML = '';
      if (totalPages > 1) {
        // Generate page select options
        let pageSelectHTML = '';
        for (let i = 1; i <= totalPages; i++) {
          pageSelectHTML += `<option value="${i}" ${currentPage === i ? 'selected' : ''}>${i}</option>`;
        }

        buttonsHTML += `
          <button class="pagination-btn prev-btn" onclick="changePage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''} aria-label="Previous Page"></button>
          <div class="pagination-page-jump">
            <span>Page</span>
            <span class="select-wrapper">
              <select class="pagination-page-select" onchange="changePage(parseInt(this.value, 10))" aria-label="Select Page">
                <button>
                  <selectedcontent></selectedcontent>
                  <span class="select-arrow-caret"></span>
                </button>
                ${pageSelectHTML}
              </select>
            </span>
            <span>of ${totalPages}</span>
          </div>
          <button class="pagination-btn next-btn" onclick="changePage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''} aria-label="Next Page"></button>
        `;
      }

      controlsContainer.innerHTML = `
        <div class="pagination-info">${showingText}</div>
        
        <div class="pagination-controls-buttons">
          ${buttonsHTML}
        </div>
        
        <div class="pagination-limit-wrapper">
          <label for="limit-select">Items per page</label>
          <span class="select-wrapper">
            <select id="limit-select" class="pagination-limit-select" onchange="handleLimitChange(this.value)">
              <button>
                <selectedcontent></selectedcontent>
                <span class="select-arrow-caret"></span>
              </button>
              <option value="3" ${limitVal === 3 ? 'selected' : ''}>3</option>
              <option value="6" ${limitVal === 6 ? 'selected' : ''}>6</option>
              <option value="12" ${limitVal === 12 ? 'selected' : ''}>12</option>
              <option value="all" ${limitVal === 'all' ? 'selected' : ''}>All</option>
            </select>
          </span>
        </div>
      `;
    }

    // Start rendering with View Transitions where supported
    function renderProductsWithTransition() {
      // Set transition names for morphing visual connections
      const cards = document.querySelectorAll('.card-container');
      cards.forEach(card => {
        const id = card.getAttribute('data-id');
        if (id) card.style.viewTransitionName = `card-${id}`;
      });

      const rows = document.querySelectorAll('.list-item-row');
      rows.forEach(row => {
        const id = row.getAttribute('data-id');
        if (id) row.style.viewTransitionName = `row-${id}`;
      });

      if (document.startViewTransition) {
        document.startViewTransition(() => {
          renderProducts();
          updateSortIndicators();
        });
      } else {
        renderProducts();
        updateSortIndicators();
      }
    }

    // Update URL query parameters
    function updateURLParams(isTyping = false) {
      const params = new URLSearchParams();
      params.set('view', currentViewMode);
      params.set('filter', currentFilter);
      params.set('sort', currentSort);
      params.set('page', currentPage);
      params.set('limit', itemsPerPage === Infinity ? 'all' : itemsPerPage);
      params.set('hideStock', hideOutOfStock ? 'true' : 'false');
      if (currentSearch) {
        params.set('search', currentSearch);
      }

      const newURL = `${window.location.pathname}?${params.toString()}`;
      if (isTyping) {
        window.history.replaceState(null, '', newURL);
      } else {
        window.history.pushState(null, '', newURL);
      }
    }

    // Parse UI state parameters from URL
    function parseURLParams() {
      // Remove early CLS-prevention classes as Javascript takes full control of the DOM layout
      document.documentElement.classList.remove(
        'init-view-grid',
        'init-view-list',
        'init-limit-3',
        'init-limit-6',
        'init-limit-12',
        'init-limit-all'
      );

      const params = new URLSearchParams(window.location.search);

      currentViewMode = params.get('view') || 'grid';
      currentFilter = params.get('filter') || 'all';
      currentSort = params.get('sort') || 'price-asc';
      currentPage = parseInt(params.get('page') || '1', 10);

      const limitVal = params.get('limit') || '6';
      if (limitVal === 'all') {
        itemsPerPage = Infinity;
      } else {
        itemsPerPage = parseInt(limitVal, 10);
      }

      currentSearch = params.get('search') || '';

      hideOutOfStock = params.get('hideStock') === 'true';
      const hideStockCheck = document.getElementById('hide-stock-toggle');
      if (hideStockCheck) {
        hideStockCheck.checked = hideOutOfStock;
      }

      // Sync DOM controls values
      searchBar.value = currentSearch;
      toggleClearButton(currentSearch);
      sortSelector.value = currentSort;

      // Sync quick filter pills active class
      document.querySelectorAll('.filter-pill').forEach(pill => {
        const onclickAttr = pill.getAttribute('onclick');
        if (onclickAttr && onclickAttr.includes(`'${currentFilter}'`)) {
          pill.classList.add('active');
        } else {
          pill.classList.remove('active');
        }
      });

      // Sync active view buttons
      const gridContainer = document.getElementById('grid-view-container');
      const listContainer = document.getElementById('list-view-container');
      const gridBtn = document.getElementById('grid-toggle-btn');
      const listBtn = document.getElementById('list-toggle-btn');

      if (currentViewMode === 'grid') {
        gridContainer.style.display = 'grid';
        listContainer.style.display = 'none';
        gridBtn.classList.add('active');
        listBtn.classList.remove('active');
      } else {
        gridContainer.style.display = 'none';
        listContainer.style.display = 'table';
        gridBtn.classList.remove('active');
        listBtn.classList.add('active');
      }
    }

    // Stock Toggle event handler
    function handleStockToggle(checked) {
      hideOutOfStock = checked;
      currentPage = 1;
      updateURLParams();
      renderProductsWithTransition();
    }

    // Mobile Menu Nav Handlers
    function toggleMobileMenu() {
      const navWrapper = document.getElementById('nav-wrapper');
      const toggleBtn = document.getElementById('mobile-menu-toggle');
      if (navWrapper.classList.contains('open')) {
        navWrapper.classList.remove('open');
        toggleBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>`;
      } else {
        navWrapper.classList.add('open');
        toggleBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
      }
    }

    function closeMobileMenu() {
      const navWrapper = document.getElementById('nav-wrapper');
      const toggleBtn = document.getElementById('mobile-menu-toggle');
      if (navWrapper) {
        navWrapper.classList.remove('open');
      }
      if (toggleBtn) {
        toggleBtn.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>`;
      }
    }

    // Modal Details for List View Rows (Rating Removed, Prices formatted)
    function openDetailsModal(id) {
      const rum = rumData.find(r => r.id === id);
      if (!rum) return;

      const storePrices = rum.stores.map(s => s.price);
      const minStorePrice = Math.min(...storePrices, rum.price);
      const maxStorePrice = Math.max(...storePrices, rum.price);
      const sortedStores = [...rum.stores].sort((a, b) => a.price - b.price);

      const storeListHTML = sortedStores.map(st => {
        const isStoreOutOfStock = st.inStock === false;
        const isBest = !isStoreOutOfStock && st.price === minStorePrice;
        const priceDisplay = isStoreOutOfStock 
          ? '<span style="color:#e74c3c; font-size:0.8rem; font-weight:600; text-transform:uppercase;">Out of stock</span>' 
          : `$${st.price.toFixed(2)} ${isBest ? '(Best)' : ''}`;
        const valColor = isStoreOutOfStock 
          ? 'transparent' 
          : (isBest ? 'var(--color-refraction-gold)' : 'var(--color-text-primary)');
        return `
          <div class="spec-item" style="padding:10px 0;">
            <span class="spec-label">${st.name}</span>
            <span class="spec-value" style="color:${valColor}">
              ${priceDisplay}
            </span>
          </div>
        `;
      }).join('');

      dialogContent.innerHTML = `
        <div class="success-badge">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        </div>
        <h2 class="dialog-title">${rum.name}</h2>
        <p class="dialog-subtitle">${getMetadataText(rum)}</p>
        <p class="dialog-desc">${rum.tastingNotes}</p>
        ${!rum.inStock && rum.lastSeenStock ? `<div style="font-size:0.75rem; color:#e74c3c; margin:-8px 0 16px; font-weight:600; text-align:center;">${formatLastSeen(rum.lastSeenStock)}</div>` : ''}
        
        <div class="spec-list" style="margin-bottom: 24px;">
          <div class="spec-item">
            <span class="spec-label">Nightly Scraped Range</span>
            <span class="spec-value">
              ${minStorePrice === maxStorePrice
          ? `$${minStorePrice.toFixed(2)}`
          : `$${minStorePrice.toFixed(2)} - $${maxStorePrice.toFixed(2)}`
        }
            </span>
          </div>
          <div class="spec-item" style="border-bottom:1.5px solid rgba(230,126,34,0.3); padding-bottom:12px;">
            <span class="spec-label" style="font-weight:600; color:var(--color-text-primary)">Store Offerings</span>
            <span class="spec-value" style="font-weight:600; color:var(--color-refraction-gold)">Price</span>
          </div>
          <div style="max-height: 150px; overflow-y: auto; padding-right: 8px;">
            ${storeListHTML}
          </div>
        </div>
        
        <div class="dialog-footer" style="gap: 12px;">
          <button class="btn btn-secondary" onclick="closeDialog()" style="flex: 1;">Close</button>
          <button class="btn btn-primary" style="flex: 2;" onclick="openPlaceholderDetails(event, '${rum.name.replace(/'/g, "\\'")}')">
            View Full Details Page
          </button>
        </div>
      `;

      dialog.showModal();
    }

    // Details page placeholder alerts
    function openPlaceholderDetails(e, name) {
      e.stopPropagation();
      dialogContent.innerHTML = `
        <div class="success-badge" style="border-color:var(--color-rum-amber); color:var(--color-refraction-gold); background:rgba(230,126,34,0.1)">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        </div>
        <h2 class="dialog-title">Product Details Page</h2>
        <p class="dialog-subtitle">${name}</p>
        <p class="dialog-desc">This is a placeholder for the dedicated details view for <strong>${name}</strong>. The full page (featuring nightly scraping history graphs, custom price alert threshold setups, and comprehensive store indexes) is scheduled for the next design sprint.</p>
        <div class="dialog-footer" style="justify-content: center;">
          <button class="btn btn-primary" onclick="closeDialog()">Acknowledge</button>
        </div>
      `;
      dialog.showModal();
    }

    // Close Modal
    function closeDialog() {
      dialog.close();
    }
