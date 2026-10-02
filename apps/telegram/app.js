(() => {
  'use strict';

  const config = window.SPOT_CONFIG || {};
  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;

  const boot = document.getElementById('boot');
  const blocked = document.getElementById('blocked');
  const app = document.getElementById('app');
  const screen = document.getElementById('screen');
  const screenKicker = document.getElementById('screenKicker');
  const profileChip = document.getElementById('profileChip');
  const profileAvatar = document.getElementById('profileAvatar');
  const profileInitials = document.getElementById('profileInitials');
  const sheetBackdrop = document.getElementById('sheetBackdrop');
  const sheet = document.getElementById('sheet');
  const toast = document.getElementById('toast');
  const openTelegramButton = document.getElementById('openTelegramButton');

  const cityMeta = {
    spb: {
      label: 'Санкт-Петербург',
      short: 'СПБ',
      center: [59.9386, 30.3141],
      zoom: 12
    },
    moscow: {
      label: 'Москва',
      short: 'МСК',
      center: [55.7558, 37.6173],
      zoom: 11
    }
  };

  const categoryMeta = {
    restaurant: { label: 'Еда', icon: '🍽️', query: 'рестораны' },
    coffee: { label: 'Кофе', icon: '☕', query: 'кофейни' },
    bar: { label: 'Бары', icon: '🍸', query: 'бары' },
    hotel: { label: 'Отели', icon: '🏨', query: 'отели' },
    culture: { label: 'Культура', icon: '🎭', query: 'музеи театры галереи' },
    entertainment: { label: 'Развлечения', icon: '🎟️', query: 'развлечения' },
    shop: { label: 'Магазины', icon: '🛍️', query: 'магазины' },
    park: { label: 'Места', icon: '🌿', query: 'парки места' },
    other: { label: 'Место', icon: '📍', query: '' }
  };

  const state = {
    token: '',
    userId: '',
    profile: null,
    telegramUser: null,
    revision: 0,
    data: {
      selected_city: 'spb',
      saved_spots: [],
      collections: [],
      interests: []
    },
    tab: 'map',
    spotFilter: 'all',
    searchQuery: '',
    searchCategory: '',
    searchResults: [],
    importResult: null,
    busy: false,
    map: null,
    mapMarkers: [],
    mapReady: false,
    lastError: ''
  };

  function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    if (!headers.has('Accept')) headers.set('Accept', 'application/json');
    if (state.token && !headers.has('Authorization')) {
      headers.set('Authorization', 'Bearer ' + state.token);
    }
    return fetch(String(config.apiBaseUrl || '').replace(/\/$/, '') + path, {
      ...options,
      headers
    });
  }

  function normalizePlace(place, source) {
    if (!place) return null;
    return {
      id: String(place.id),
      name: String(place.name || 'Без названия'),
      category: place.category || 'other',
      categoryLabel: place.category_label || place.categoryLabel || categoryMeta[place.category]?.label || 'Место',
      city: place.city === 'moscow' ? 'moscow' : 'spb',
      cityLabel: place.city_label || place.cityLabel || cityMeta[place.city === 'moscow' ? 'moscow' : 'spb'].label,
      address: String(place.address || ''),
      latitude: Number(place.lat ?? place.latitude ?? 0),
      longitude: Number(place.lng ?? place.longitude ?? 0),
      distanceMeters: Number(place.distance_meters ?? place.distanceMeters ?? 0),
      rating: Number(place.rating || 0),
      reviewCount: Number(place.review_count ?? place.reviewCount ?? 0),
      openingHours: place.opening_hours || place.openingHours,
      description: place.description || undefined,
      status: place.status || 'want',
      savedAt: place.savedAt,
      visitedAt: place.visitedAt,
      favorite: Boolean(place.favorite),
      note: place.note || '',
      sourceUrl: source?.source_url || place.sourceUrl,
      sourcePlatform: source?.platform || place.sourcePlatform,
      sourceTitle: source?.source_title || place.sourceTitle,
      sourceExcerpt: source?.source_excerpt || place.sourceExcerpt
    };
  }

  function normalizeCloud(data) {
    const raw = data && typeof data === 'object' ? data : {};
    return {
      selected_city: raw.selected_city === 'moscow' ? 'moscow' : 'spb',
      saved_spots: Array.isArray(raw.saved_spots) ? raw.saved_spots.map((spot) => normalizePlace(spot)).filter(Boolean) : [],
      collections: Array.isArray(raw.collections) ? raw.collections : [],
      interests: Array.isArray(raw.interests) ? raw.interests.filter((item) => categoryMeta[item]) : []
    };
  }

  function getSaved(id) {
    return state.data.saved_spots.find((spot) => spot.id === id) || null;
  }

  function nowISO() {
    return new Date().toISOString();
  }

  function mergeById(remote, local) {
    const map = new Map();
    for (const item of remote || []) map.set(item.id, item);
    for (const item of local || []) map.set(item.id, item);
    return Array.from(map.values());
  }

  async function saveCloud() {
    const payload = {
      selected_city: state.data.selected_city,
      saved_spots: state.data.saved_spots,
      collections: state.data.collections,
      interests: state.data.interests
    };

    const response = await api('/api/v1/me/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base_revision: state.revision,
        state: payload
      })
    });

    if (response.status === 409) {
      const conflict = await response.json();
      const remoteState = normalizeCloud(conflict.state || {});
      state.revision = Number(conflict.revision || 0);
      state.data = {
        selected_city: payload.selected_city,
        saved_spots: mergeById(remoteState.saved_spots, payload.saved_spots),
        collections: mergeById(remoteState.collections, payload.collections),
        interests: payload.interests.length ? payload.interests : remoteState.interests
      };
      return saveCloud();
    }

    if (!response.ok) {
      throw new Error('Не удалось сохранить изменения');
    }

    const envelope = await response.json();
    state.revision = Number(envelope.revision || state.revision);
  }

  async function loadCloud() {
    const response = await api('/api/v1/me/state');
    if (!response.ok) throw new Error('Не удалось загрузить библиотеку');
    const envelope = await response.json();
    state.revision = Number(envelope.revision || 0);
    state.data = normalizeCloud(envelope.state || {});
  }

  async function loadProfile() {
    const response = await api('/api/v1/me/profile');
    if (response.ok) {
      state.profile = await response.json();
    }
  }

  function initials(name) {
    const value = String(name || '').trim();
    if (!value) return 'С';
    return value.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  }

  function updateProfileChip() {
    const tgUser = state.telegramUser || {};
    const name = state.profile?.display_name || [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') || 'СПОТ';
    const avatar = state.profile?.avatar_url || tgUser.photo_url || '';

    profileInitials.textContent = initials(name);
    if (avatar) {
      profileAvatar.src = avatar;
      profileAvatar.classList.remove('hidden');
      profileInitials.classList.add('hidden');
    } else {
      profileAvatar.classList.add('hidden');
      profileInitials.classList.remove('hidden');
    }
  }

  function haptic(type = 'light') {
    try {
      tg?.HapticFeedback?.impactOccurred(type);
    } catch {}
  }

  function notify(type = 'success') {
    try {
      tg?.HapticFeedback?.notificationOccurred(type);
    } catch {}
  }

  let toastTimer = null;
  function showToast(message) {
    toast.textContent = message;
    toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add('hidden'), 2300);
  }

  function telegramTheme() {
    if (!tg) return;
    try {
      tg.ready();
      tg.expand();
      tg.setHeaderColor?.('#0B0F0C');
      tg.setBackgroundColor?.('#0B0F0C');
      tg.setBottomBarColor?.('#0B0F0C');
    } catch {}

    document.documentElement.dataset.telegramTheme = tg.colorScheme || 'dark';
  }

  function showBlocked() {
    boot.classList.add('hidden');
    blocked.classList.remove('hidden');
    if (config.botUsername) {
      openTelegramButton.classList.remove('hidden');
      openTelegramButton.onclick = () => {
        const url = 'https://t.me/' + String(config.botUsername).replace(/^@/, '') + '?startapp';
        if (tg?.openTelegramLink) tg.openTelegramLink(url);
        else window.location.href = url;
      };
    }
  }

  async function authenticate() {
    telegramTheme();

    if (tg?.initData) {
      state.telegramUser = tg.initDataUnsafe?.user || null;
      const response = await api('/api/v1/auth/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ init_data: tg.initData })
      });
      if (!response.ok) {
        let message = 'Telegram-вход недоступен';
        try {
          const body = await response.json();
          if (body.error) message = body.error;
        } catch {}
        throw new Error(message);
      }
      const session = await response.json();
      state.token = session.token;
      state.userId = session.user_id;
      state.profile = session.profile || null;
      return;
    }

    if (config.allowBrowserGuest) {
      const cached = localStorage.getItem('spot-browser-token');
      if (cached) {
        state.token = cached;
        return;
      }

      const response = await api('/api/v1/auth/guest', { method: 'POST' });
      if (!response.ok) throw new Error('Guest auth unavailable');
      const session = await response.json();
      state.token = session.token;
      state.userId = session.user_id;
      localStorage.setItem('spot-browser-token', session.token);
      return;
    }

    showBlocked();
    throw new Error('TELEGRAM_ONLY');
  }

  function currentCity() {
    return state.data.selected_city === 'moscow' ? 'moscow' : 'spb';
  }

  function setCity(city) {
    if (!cityMeta[city] || city === state.data.selected_city) return;
    state.data.selected_city = city;
    state.searchResults = [];
    state.searchQuery = '';
    state.searchCategory = '';
    void saveCloud().catch(() => showToast('Город изменён локально'));
    render();
    haptic();
  }

  function categoryIcon(category) {
    return categoryMeta[category]?.icon || '📍';
  }

  function placeOpenText(spot) {
    if (spot.openingHours?.is24x7 || spot.openingHours?.is_24x7) return 'Круглосуточно';
    return 'Проверь часы перед визитом';
  }

  function escapeHTML(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function spotCardHTML(spot) {
    return `
      <button class="spot-card" data-place-id="${escapeHTML(spot.id)}">
        <div class="spot-icon">${categoryIcon(spot.category)}</div>
        <div class="spot-copy">
          <div class="spot-meta">${escapeHTML(spot.categoryLabel.toUpperCase())} · ${escapeHTML(cityMeta[spot.city]?.short || '')}</div>
          <div class="spot-name">${escapeHTML(spot.name)}</div>
          <div class="spot-open">● ${escapeHTML(placeOpenText(spot))}</div>
          <div class="spot-address">${escapeHTML(spot.address)}</div>
        </div>
        <div class="spot-rating">★ ${Number(spot.rating || 0).toFixed(1)}<small>${spot.reviewCount ? escapeHTML(spot.reviewCount) : ''}</small></div>
      </button>
    `;
  }

  function bindPlaceCards(container = screen) {
    container.querySelectorAll('[data-place-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.placeId;
        const spot = [...state.searchResults, ...state.data.saved_spots].find((item) => item.id === id);
        if (spot) openPlaceSheet(spot);
      });
    });
  }

  function openSheet(html) {
    sheet.innerHTML = '<div class="sheet-handle"></div>' + html;
    sheetBackdrop.classList.remove('hidden');
    try {
      tg?.BackButton?.show();
      tg?.BackButton?.onClick(closeSheet);
    } catch {}
  }

  function closeSheet() {
    sheetBackdrop.classList.add('hidden');
    sheet.innerHTML = '';
    try {
      tg?.BackButton?.offClick(closeSheet);
      tg?.BackButton?.hide();
    } catch {}
  }

  sheetBackdrop.addEventListener('click', (event) => {
    if (event.target === sheetBackdrop) closeSheet();
  });

  function openPlaceSheet(spot) {
    const saved = getSaved(spot.id);
    const status = saved?.status || 'want';
    openSheet(`
      <div class="sheet-head">
        <div>
          <div class="sheet-meta">${escapeHTML(spot.categoryLabel.toUpperCase())} · ${escapeHTML(cityMeta[spot.city]?.label || '')}</div>
          <h2>${escapeHTML(spot.name)}</h2>
        </div>
        <button class="sheet-close" id="sheetClose">×</button>
      </div>
      <div class="sheet-address">${escapeHTML(spot.address)} · ★ ${Number(spot.rating || 0).toFixed(1)}</div>
      <div class="sheet-note">${escapeHTML(spot.description || 'Личное место в СПОТ. Можно сохранить, отметить посещённым или открыть во внешних картах.')}</div>
      <div class="sheet-actions">
        <button class="secondary" id="sheetMaps">↗ Карты</button>
        <button class="save" id="sheetSave">${saved ? (status === 'visited' ? '✓ Посещено' : '♥ Сохранено') : '♥ В СПОТ'}</button>
      </div>
      ${saved ? `
        <div class="filter-scroll" style="padding:12px 0 0">
          <button class="chip ${status === 'want' ? 'active' : ''}" data-status="want">Хочу</button>
          <button class="chip ${status === 'booked' ? 'active' : ''}" data-status="booked">Бронь</button>
          <button class="chip ${status === 'visited' ? 'active' : ''}" data-status="visited">Был</button>
        </div>
      ` : ''}
    `);

    document.getElementById('sheetClose').onclick = closeSheet;
    document.getElementById('sheetMaps').onclick = () => {
      const url = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(spot.latitude + ',' + spot.longitude);
      if (tg?.openLink) tg.openLink(url);
      else window.open(url, '_blank');
    };
    document.getElementById('sheetSave').onclick = () => {
      if (!getSaved(spot.id)) {
        saveSpot(spot, 'want');
        closeSheet();
      }
    };

    sheet.querySelectorAll('[data-status]').forEach((button) => {
      button.onclick = () => {
        updateSpotStatus(spot.id, button.dataset.status);
        closeSheet();
      };
    });
  }

  function saveSpot(spot, status) {
    const existing = getSaved(spot.id);
    const next = {
      ...spot,
      status: status || existing?.status || 'want',
      savedAt: existing?.savedAt || nowISO(),
      visitedAt: status === 'visited' ? nowISO() : existing?.visitedAt
    };

    state.data.saved_spots = existing
      ? state.data.saved_spots.map((item) => item.id === next.id ? next : item)
      : [next, ...state.data.saved_spots];

    void saveCloud().catch(() => showToast('Сохранили локально · синхронизируем позже'));
    render();
    notify('success');
    showToast('♥ ' + spot.name + ' сохранён в СПОТ');
  }

  function updateSpotStatus(id, status) {
    state.data.saved_spots = state.data.saved_spots.map((spot) => {
      if (spot.id !== id) return spot;
      return {
        ...spot,
        status,
        visitedAt: status === 'visited' ? nowISO() : spot.visitedAt
      };
    });
    void saveCloud().catch(() => showToast('Статус изменён локально'));
    render();
    haptic('medium');
  }

  async function searchPlaces(query, category) {
    const city = currentCity();
    const params = new URLSearchParams({ q: query || '', city });
    if (category) params.set('category', category);
    const response = await api('/api/v1/places?' + params.toString());
    if (!response.ok) throw new Error('Поиск временно недоступен');
    const raw = await response.json();
    state.searchResults = Array.isArray(raw) ? raw.map((place) => normalizePlace(place)).filter(Boolean) : [];
  }

  function mapHeaderHTML() {
    const city = currentCity();
    return `
      <div class="hero">
        <h1 class="hero-title">Твоя карта мест</h1>
        <div class="hero-subtitle">Сохраняй то, куда действительно хочется попасть — без публичных рейтингов и лишнего шума.</div>
        <div class="city-switch">
          <button class="chip ${city === 'spb' ? 'active' : ''}" data-city="spb">СПБ</button>
          <button class="chip ${city === 'moscow' ? 'active' : ''}" data-city="moscow">Москва</button>
          <button class="chip" id="forYou">✦ Для тебя</button>
        </div>
      </div>
      <div class="search-row">
        <input id="mapSearch" class="search" type="search" placeholder="Название, категория или адрес" value="${escapeHTML(state.searchQuery)}" />
        <button id="mapSearchButton" class="square-button">⌕</button>
      </div>
      <div class="filter-scroll">
        <button class="chip ${!state.searchCategory ? 'active' : ''}" data-category="">Все</button>
        ${['restaurant','coffee','bar','hotel','culture'].map((cat) => `<button class="chip ${state.searchCategory === cat ? 'active' : ''}" data-category="${cat}">${categoryMeta[cat].label}</button>`).join('')}
      </div>
    `;
  }

  function renderMap() {
    screenKicker.textContent = 'ЛИЧНАЯ КАРТА';
    screen.innerHTML = mapHeaderHTML() + `
      <div class="map-wrap">
        <div id="mapCanvas"></div>
        <div class="map-overlay-card">
          <div class="map-overlay-icon">♥</div>
          <div class="map-overlay-copy"><b>${state.data.saved_spots.filter((spot) => spot.city === currentCity()).length} сохранено</b><span>Твои места + результаты поиска в выбранном городе</span></div>
        </div>
      </div>
      <div class="section">
        <div class="section-head"><div class="section-title">${state.searchResults.length ? 'РЕЗУЛЬТАТЫ' : 'СОХРАНЁННЫЕ РЯДОМ'}</div><div class="section-meta">${state.searchResults.length || state.data.saved_spots.filter((spot) => spot.city === currentCity()).length}</div></div>
        <div class="cards" id="mapCards">
          ${(state.searchResults.length ? state.searchResults : state.data.saved_spots.filter((spot) => spot.city === currentCity())).slice(0, 8).map(spotCardHTML).join('') || `
            <div class="empty"><div class="empty-icon">⌖</div><h3>Карта ждёт первые споты</h3><p>Найди место сверху или добавь ссылку из Reels, TikTok, Telegram или карт.</p></div>
          `}
        </div>
      </div>
    `;

    bindMapControls();
    bindPlaceCards();
    setTimeout(initLeafletMap, 0);
  }

  function bindMapControls() {
    screen.querySelectorAll('[data-city]').forEach((button) => {
      button.onclick = () => setCity(button.dataset.city);
    });
    screen.querySelectorAll('[data-category]').forEach((button) => {
      button.onclick = async () => {
        state.searchCategory = button.dataset.category || '';
        try {
          await searchPlaces(state.searchQuery, state.searchCategory);
        } catch (error) {
          showToast(error.message);
        }
        renderMap();
      };
    });

    const searchInput = document.getElementById('mapSearch');
    const runSearch = async () => {
      state.searchQuery = searchInput.value.trim();
      try {
        await searchPlaces(state.searchQuery, state.searchCategory);
      } catch (error) {
        showToast(error.message);
      }
      renderMap();
    };
    document.getElementById('mapSearchButton').onclick = runSearch;
    searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') void runSearch();
    });

    document.getElementById('forYou').onclick = () => void discoverForYou();
  }

  async function discoverForYou() {
    const preferred = state.data.interests.length ? state.data.interests.slice(0, 2) : ['restaurant', 'coffee'];
    state.searchResults = [];
    try {
      const batches = await Promise.all(preferred.map((category) => {
        const params = new URLSearchParams({
          q: categoryMeta[category]?.query || '',
          city: currentCity(),
          category
        });
        return api('/api/v1/places?' + params.toString())
          .then((response) => response.ok ? response.json() : [])
          .then((items) => items.map((item) => normalizePlace(item)));
      }));
      const saved = new Set(state.data.saved_spots.map((spot) => spot.id));
      const byId = new Map();
      for (const spot of batches.flat()) {
        if (!spot || saved.has(spot.id)) continue;
        byId.set(spot.id, spot);
      }
      state.searchResults = Array.from(byId.values())
        .sort((a, b) => (b.rating * 2 + Math.log10(b.reviewCount + 1)) - (a.rating * 2 + Math.log10(a.reviewCount + 1)))
        .slice(0, 10);
      state.searchQuery = '✦ Для тебя';
      renderMap();
      showToast(state.searchResults.length ? 'Подобрали места под твои интересы' : 'Пока новых рекомендаций нет');
      haptic();
    } catch {
      showToast('Не удалось собрать рекомендации');
    }
  }

  function initLeafletMap() {
    const node = document.getElementById('mapCanvas');
    if (!node || !window.L) return;

    if (state.map) {
      state.map.remove();
      state.map = null;
    }

    const meta = cityMeta[currentCity()];
    state.map = L.map(node, {
      zoomControl: false,
      attributionControl: true
    }).setView(meta.center, meta.zoom);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(state.map);

    const spots = state.searchResults.length
      ? state.searchResults
      : state.data.saved_spots.filter((spot) => spot.city === currentCity());

    for (const spot of spots) {
      if (!Number.isFinite(spot.latitude) || !Number.isFinite(spot.longitude)) continue;
      const icon = L.divIcon({
        className: '',
        html: '<div class="spot-marker"><span>' + categoryIcon(spot.category) + '</span></div>',
        iconSize: [36, 36],
        iconAnchor: [18, 30]
      });
      const marker = L.marker([spot.latitude, spot.longitude], { icon }).addTo(state.map);
      marker.on('click', () => openPlaceSheet(spot));
    }
  }

  function renderSpots() {
    screenKicker.textContent = 'ЛИЧНАЯ БИБЛИОТЕКА';
    const filters = [
      ['all', 'Все'],
      ['want', 'Хочу'],
      ['visited', 'Был'],
      ['booked', 'Бронь']
    ];
    const city = currentCity();
    const visible = state.data.saved_spots
      .filter((spot) => spot.city === city)
      .filter((spot) => state.spotFilter === 'all' || spot.status === state.spotFilter);

    screen.innerHTML = `
      <div class="hero">
        <h1 class="hero-title">Мои споты</h1>
        <div class="hero-subtitle">Все места, которые ты сохранил в СПОТ. По умолчанию библиотека приватная.</div>
        <div class="city-switch">
          <button class="chip ${city === 'spb' ? 'active' : ''}" data-city="spb">СПБ</button>
          <button class="chip ${city === 'moscow' ? 'active' : ''}" data-city="moscow">Москва</button>
        </div>
      </div>
      <div class="filter-scroll">
        ${filters.map(([id,label]) => `<button class="chip ${state.spotFilter === id ? 'active' : ''}" data-spot-filter="${id}">${label}</button>`).join('')}
      </div>
      <div class="section">
        <div class="section-head"><div class="section-title">СОХРАНЁННЫЕ</div><div class="section-meta">${visible.length}</div></div>
        <div class="cards">
          ${visible.map(spotCardHTML).join('') || `<div class="empty"><div class="empty-icon">♥</div><h3>Здесь пока пусто</h3><p>Добавляй места через карту или просто вставляй ссылку.</p></div>`}
        </div>
      </div>
    `;
    screen.querySelectorAll('[data-city]').forEach((button) => button.onclick = () => setCity(button.dataset.city));
    screen.querySelectorAll('[data-spot-filter]').forEach((button) => {
      button.onclick = () => {
        state.spotFilter = button.dataset.spotFilter;
        renderSpots();
      };
    });
    bindPlaceCards();
  }

  function renderAdd() {
    screenKicker.textContent = 'ДОБАВИТЬ МЕСТО';
    screen.innerHTML = `
      <div class="hero">
        <h1 class="hero-title">Добавить в СПОТ</h1>
        <div class="hero-subtitle">Вставь ссылку из Reels, TikTok, Telegram или карт. СПОТ попробует распознать место сам.</div>
      </div>
      <form class="form" id="importForm">
        <div class="field-label">ССЫЛКА</div>
        <input class="field" id="importUrl" type="url" required placeholder="https://…" />
        <div class="field-label">ГОРОД</div>
        <div class="city-switch">
          <button type="button" class="chip ${currentCity() === 'spb' ? 'active' : ''}" data-city="spb">СПБ</button>
          <button type="button" class="chip ${currentCity() === 'moscow' ? 'active' : ''}" data-city="moscow">Москва</button>
        </div>
        <div class="field-label">ПОДСКАЗКА · НЕОБЯЗАТЕЛЬНО</div>
        <textarea class="field textarea" id="importHint" placeholder="Например: ресторан Birch"></textarea>
        <button class="form-submit" id="importSubmit" type="submit">Распознать место</button>
        <div id="importResult" class="import-result"></div>
      </form>
    `;

    screen.querySelectorAll('[data-city]').forEach((button) => button.onclick = () => setCity(button.dataset.city));
    document.getElementById('importForm').onsubmit = (event) => {
      event.preventDefault();
      void importLink();
    };
  }

  async function importLink() {
    const url = document.getElementById('importUrl').value.trim();
    const hint = document.getElementById('importHint').value.trim();
    const submit = document.getElementById('importSubmit');
    const resultNode = document.getElementById('importResult');

    if (!url) return;
    submit.disabled = true;
    submit.textContent = 'Ищем…';
    resultNode.innerHTML = '<div class="loading-line"></div>';

    try {
      const response = await api('/api/v1/imports/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          city: currentCity(),
          hint: hint || undefined
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Не удалось обработать ссылку');

      const source = payload;
      const candidates = [];
      if (payload.place) candidates.push(normalizePlace(payload.place, source));
      for (const item of payload.candidates || []) candidates.push(normalizePlace(item, source));
      for (const detected of payload.detected || []) {
        for (const item of detected.candidates || []) candidates.push(normalizePlace(item, source));
      }

      const unique = Array.from(new Map(candidates.filter(Boolean).map((spot) => [spot.id, spot])).values());
      state.importResult = unique;

      resultNode.innerHTML = unique.length
        ? `<div class="cards">${unique.slice(0, 6).map(spotCardHTML).join('')}</div>`
        : `<div class="empty"><div class="empty-icon">⌕</div><h3>Нужно уточнение</h3><p>${escapeHTML(payload.message || 'Попробуй добавить название места в подсказку.')}</p></div>`;
      bindPlaceCards(resultNode);
      notify('success');
    } catch (error) {
      resultNode.innerHTML = `<div class="empty"><div class="empty-icon">!</div><h3>Не получилось</h3><p>${escapeHTML(error.message)}</p></div>`;
      notify('error');
    } finally {
      submit.disabled = false;
      submit.textContent = 'Распознать место';
    }
  }

  function renderCollections() {
    screenKicker.textContent = 'ПОДБОРКИ';
    const collections = state.data.collections || [];

    screen.innerHTML = `
      <div class="hero">
        <h1 class="hero-title">Подборки</h1>
        <div class="hero-subtitle">Собирай собственные списки мест: на вечер, поездку, кофе, бары или любой сценарий.</div>
      </div>
      <div class="section">
        <div class="section-head"><div class="section-title">МОИ ПОДБОРКИ</div><div class="section-meta">${collections.length}</div></div>
        <div class="cards">
          ${collections.map((collection) => `
            <button class="collection-card" data-collection-id="${escapeHTML(collection.id)}">
              <div class="collection-icon">${collection.routePlan ? '⌁' : '▦'}</div>
              <div class="collection-copy"><b>${escapeHTML(collection.title)}</b><span>${escapeHTML(collection.subtitle || '')} · ${(collection.placeIds || []).length} мест</span></div>
            </button>
          `).join('') || `<div class="empty"><div class="empty-icon">▦</div><h3>Создай первую подборку</h3><p>Сначала сохрани несколько спотов, затем собери из них свой список.</p><button id="newCollection" class="primary">Создать подборку</button></div>`}
        </div>
      </div>
      ${collections.length ? '<div class="section"><button id="newCollection" class="form-submit">＋ Новая подборка</button></div>' : ''}
    `;

    document.getElementById('newCollection')?.addEventListener('click', openCollectionCreator);
    screen.querySelectorAll('[data-collection-id]').forEach((button) => {
      button.onclick = () => openCollection(button.dataset.collectionId);
    });
  }

  function openCollectionCreator() {
    const saved = state.data.saved_spots.filter((spot) => spot.status !== 'visited');
    openSheet(`
      <div class="sheet-head"><h2>Новая подборка</h2><button class="sheet-close" id="sheetClose">×</button></div>
      <div class="field-label">НАЗВАНИЕ</div>
      <input class="field" id="collectionTitle" placeholder="Например: Вечер в Петербурге" />
      <div class="field-label">МЕСТА</div>
      <div class="cards">
        ${saved.slice(0, 12).map((spot) => `
          <label class="spot-card" style="align-items:center">
            <input type="checkbox" data-collection-spot="${escapeHTML(spot.id)}" />
            <div class="spot-icon" style="width:40px;height:40px;flex-basis:40px">${categoryIcon(spot.category)}</div>
            <div class="spot-copy"><div class="spot-name">${escapeHTML(spot.name)}</div><div class="spot-address">${escapeHTML(spot.address)}</div></div>
          </label>
        `).join('') || '<div class="sheet-note">Сначала сохрани хотя бы одно место.</div>'}
      </div>
      <button class="form-submit" id="createCollection">Создать</button>
    `);
    document.getElementById('sheetClose').onclick = closeSheet;
    document.getElementById('createCollection').onclick = () => {
      const title = document.getElementById('collectionTitle').value.trim();
      const ids = Array.from(sheet.querySelectorAll('[data-collection-spot]:checked')).map((node) => node.dataset.collectionSpot);
      if (!title || ids.length === 0) {
        showToast('Добавь название и хотя бы одно место');
        return;
      }
      const collection = {
        id: 'c_' + Date.now(),
        title,
        subtitle: cityMeta[currentCity()].label,
        city: currentCity(),
        cityLabel: cityMeta[currentCity()].label,
        placeIds: ids,
        createdAt: nowISO()
      };
      state.data.collections = [collection, ...state.data.collections];
      void saveCloud();
      closeSheet();
      renderCollections();
      notify('success');
      showToast('Подборка создана');
    };
  }

  function openCollection(id) {
    const collection = state.data.collections.find((item) => item.id === id);
    if (!collection) return;
    const places = (collection.placeIds || []).map(getSaved).filter(Boolean);
    openSheet(`
      <div class="sheet-head">
        <div><div class="sheet-meta">ПОДБОРКА</div><h2>${escapeHTML(collection.title)}</h2></div>
        <button class="sheet-close" id="sheetClose">×</button>
      </div>
      <div class="sheet-address">${escapeHTML(collection.subtitle || '')} · ${places.length} мест</div>
      <div class="cards" style="margin-top:13px">${places.map(spotCardHTML).join('')}</div>
    `);
    document.getElementById('sheetClose').onclick = closeSheet;
    bindPlaceCards(sheet);
  }

  function renderProfile() {
    screenKicker.textContent = 'ПРОФИЛЬ';
    const tgUser = state.telegramUser || {};
    const name = state.profile?.display_name || [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') || 'Пользователь СПОТ';
    const handle = tgUser.username ? '@' + tgUser.username : 'Telegram Mini App';
    const avatar = state.profile?.avatar_url || tgUser.photo_url || '';
    const visited = state.data.saved_spots.filter((spot) => spot.status === 'visited').length;
    const favorites = state.data.saved_spots.filter((spot) => spot.favorite).length;
    const interests = state.data.interests || [];

    screen.innerHTML = `
      <div class="profile-hero">
        <div class="profile-photo">${avatar ? `<img src="${escapeHTML(avatar)}" alt="" />` : escapeHTML(initials(name))}</div>
        <div class="profile-name">${escapeHTML(name)}</div>
        <div class="profile-handle">${escapeHTML(handle)} · вход через Telegram</div>
      </div>
      <div class="stats">
        <div class="stat"><b>${state.data.saved_spots.length}</b><span>СПОТОВ</span></div>
        <div class="stat"><b>${visited}</b><span>ПОСЕЩЕНО</span></div>
        <div class="stat"><b>${state.data.collections.length}</b><span>ПОДБОРОК</span></div>
      </div>
      <div class="section">
        <div class="section-head"><div class="section-title">ИНТЕРЕСЫ</div><div class="section-meta">${interests.length}</div></div>
      </div>
      <div class="interests">
        ${['restaurant','coffee','bar','hotel','culture'].map((id) => `<button class="interest ${interests.includes(id) ? 'active' : ''}" data-interest="${id}">${categoryMeta[id].icon} ${categoryMeta[id].label}</button>`).join('')}
      </div>
      <div class="menu">
        <div class="menu-row"><b>Основной город</b><span>${escapeHTML(cityMeta[currentCity()].label)}</span></div>
        <div class="menu-row"><b>Любимые места</b><span>${favorites}</span></div>
        <div class="menu-row"><b>Приватность</b><span>Личная библиотека</span></div>
        <div class="menu-row"><b>Аккаунт</b><span>Telegram ✓</span></div>
      </div>
      <div class="section">
        <div class="sheet-note">В Telegram-версии не нужен отдельный Apple / Google вход: личность подтверждается Telegram Mini Apps на сервере. Данные библиотеки остаются в облаке СПОТ.</div>
      </div>
    `;

    screen.querySelectorAll('[data-interest]').forEach((button) => {
      button.onclick = () => {
        const id = button.dataset.interest;
        const exists = state.data.interests.includes(id);
        state.data.interests = exists
          ? state.data.interests.filter((item) => item !== id)
          : [...state.data.interests, id];
        void saveCloud();
        renderProfile();
        haptic();
      };
    });
  }

  function renderOnboarding() {
    screenKicker.textContent = 'ПЕРВЫЙ ЗАПУСК';
    screen.innerHTML = `
      <div class="onboarding">
        <div class="onboarding-mark">♥</div>
        <h1>Твоя личная карта мест</h1>
        <p>Сохраняй рестораны, кофе, бары, отели и культурные места. СПОТ запомнит, где они находятся и почему ты их сохранил.</p>
        <div class="field-label">ОСНОВНОЙ ГОРОД</div>
        <div class="city-switch">
          <button class="chip ${currentCity() === 'spb' ? 'active' : ''}" data-city="spb">Санкт-Петербург</button>
          <button class="chip ${currentCity() === 'moscow' ? 'active' : ''}" data-city="moscow">Москва</button>
        </div>
        <div class="field-label">ЧТО ТЕБЕ ИНТЕРЕСНО</div>
        <div class="interests">
          ${['restaurant','coffee','bar','hotel','culture'].map((id) => `<button class="interest ${state.data.interests.includes(id) ? 'active' : ''}" data-onboarding-interest="${id}">${categoryMeta[id].icon} ${categoryMeta[id].label}</button>`).join('')}
        </div>
        <button class="primary" id="finishOnboarding">Начать пользоваться СПОТ</button>
        <div class="ob-privacy" style="margin-top:10px;color:var(--muted);font-size:8px;text-align:center">Личная библиотека приватна по умолчанию.</div>
      </div>
    `;
    screen.querySelectorAll('[data-city]').forEach((button) => button.onclick = () => {
      state.data.selected_city = button.dataset.city;
      renderOnboarding();
    });
    screen.querySelectorAll('[data-onboarding-interest]').forEach((button) => button.onclick = () => {
      const id = button.dataset.onboardingInterest;
      const exists = state.data.interests.includes(id);
      state.data.interests = exists
        ? state.data.interests.filter((item) => item !== id)
        : [...state.data.interests, id];
      renderOnboarding();
    });
    document.getElementById('finishOnboarding').onclick = () => {
      localStorage.setItem('spot-telegram-onboarded', state.userId || '1');
      void saveCloud();
      state.tab = 'map';
      render();
      notify('success');
    };
  }

  function render() {
    if (!state.token) return;

    updateProfileChip();
    document.querySelectorAll('[data-tab]').forEach((button) => {
      button.classList.toggle('active', button.dataset.tab === state.tab);
    });

    if (!localStorage.getItem('spot-telegram-onboarded') && state.data.saved_spots.length === 0 && state.data.interests.length === 0) {
      renderOnboarding();
      return;
    }

    if (state.tab === 'map') renderMap();
    if (state.tab === 'spots') renderSpots();
    if (state.tab === 'add') renderAdd();
    if (state.tab === 'collections') renderCollections();
    if (state.tab === 'profile') renderProfile();
  }

  document.querySelectorAll('[data-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      state.tab = button.dataset.tab;
      state.searchResults = state.tab === 'map' ? state.searchResults : [];
      render();
      haptic();
    });
  });

  profileChip.addEventListener('click', () => {
    state.tab = 'profile';
    render();
  });

  async function start() {
    try {
      await authenticate();
      await Promise.all([loadCloud(), loadProfile()]);
      boot.classList.add('hidden');
      blocked.classList.add('hidden');
      app.classList.remove('hidden');
      updateProfileChip();
      render();
    } catch (error) {
      if (error.message === 'TELEGRAM_ONLY') return;
      boot.classList.add('hidden');
      blocked.classList.remove('hidden');
      blocked.querySelector('h1').textContent = 'Не удалось открыть СПОТ';
      blocked.querySelector('p').textContent = error.message || 'Попробуй открыть приложение снова из Telegram.';
      notify('error');
    }
  }

  window.addEventListener('error', () => {
    state.lastError = 'Ошибка интерфейса';
  });

  void start();
})();
