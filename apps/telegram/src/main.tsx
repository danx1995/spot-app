import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

import {
  emptyCloud,
  importPlaceLink,
  loadCloud,
  saveCloud,
  searchPlaces,
  telegramLogin,
  type CitySlug,
  type CloudPayload,
  type Collection,
  type Session,
  type Spot,
  type SpotStatus
} from './api';
import { RoutePlanner } from './RoutePlanner';
import { SpotIcon, type IconName } from './SpotIcon';
import { SpotMap } from './SpotMap';
import './styles.css';

type Tab = 'map' | 'spots' | 'add' | 'collections' | 'profile';

const categories = [
  ['restaurant', 'restaurant', 'Еда'],
  ['coffee', 'coffee', 'Кофе'],
  ['bar', 'bar', 'Бары'],
  ['hotel', 'hotel', 'Отели'],
  ['culture', 'culture', 'Культура'],
  ['entertainment', 'entertainment', 'Досуг'],
  ['shop', 'shop', 'Магазины'],
  ['park', 'park', 'Места']
] as const satisfies ReadonlyArray<readonly [string, IconName, string]>;

const demoSpots: Spot[] = [
  {
    id: 'demo-birch',
    name: 'Birch',
    category: 'restaurant',
    categoryLabel: 'Ресторан',
    city: 'spb',
    cityLabel: 'Санкт-Петербург',
    address: 'Кирочная улица, 3',
    latitude: 59.9449,
    longitude: 30.3596,
    rating: 4.8,
    reviewCount: 1284,
    status: 'want',
    favorite: true
  },
  {
    id: 'demo-aster',
    name: 'Aster',
    category: 'coffee',
    categoryLabel: 'Кофейня',
    city: 'spb',
    cityLabel: 'Санкт-Петербург',
    address: 'Маяковского, 23',
    latitude: 59.9408,
    longitude: 30.3532,
    rating: 4.7,
    reviewCount: 824,
    status: 'want',
    favorite: false
  }
];

function telegram() {
  return window.Telegram?.WebApp;
}

function haptic(kind: 'selection' | 'success' | 'light' = 'selection') {
  const api = telegram()?.HapticFeedback;
  if (!api) return;
  if (kind === 'success') api.notificationOccurred('success');
  else if (kind === 'light') api.impactOccurred('light');
  else api.selectionChanged();
}

function openingState(spot: Spot) {
  const hours = spot.openingHours;
  if (!hours) return null;
  if (hours.is_24x7) return { open: true, label: 'Круглосуточно' };

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Moscow',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(new Date());

  const weekdayRaw = parts.find((part) => part.type === 'weekday')?.value.toLowerCase().slice(0, 3) || '';
  const hour = Number(parts.find((part) => part.type === 'hour')?.value || 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value || 0);
  const nowMinutes = hour * 60 + minute;
  const ranges = hours.days?.[weekdayRaw] || [];

  function toMinutes(value?: string) {
    if (!value) return null;
    const match = value.match(/^(\d{1,2}):(\d{2})/);
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
  }

  for (const range of ranges) {
    const from = toMinutes(range.from);
    const to = toMinutes(range.to);
    if (from === null || to === null) continue;

    const open = to >= from
      ? nowMinutes >= from && nowMinutes < to
      : nowMinutes >= from || nowMinutes < to;

    if (open) {
      return {
        open: true,
        label: range.to ? 'Открыто до ' + range.to : 'Открыто'
      };
    }
  }

  return ranges.length > 0 ? { open: false, label: 'Сейчас закрыто' } : null;
}

function normalizeCloud(raw: CloudPayload | null): CloudPayload {
  if (!raw) return emptyCloud();

  return {
    selected_city: raw.selected_city === 'moscow' ? 'moscow' : 'spb',
    saved_spots: Array.isArray(raw.saved_spots) ? raw.saved_spots : [],
    collections: Array.isArray(raw.collections) ? raw.collections : [],
    interests: Array.isArray(raw.interests) ? raw.interests : []
  };
}

function App() {
  const tg = telegram();
  const [tab, setTab] = useState<Tab>('map');
  const [session, setSession] = useState<Session | null>(null);
  const [cloud, setCloud] = useState<CloudPayload>(emptyCloud());
  const [revision, setRevision] = useState(0);
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [demoMode, setDemoMode] = useState(false);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Spot[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchPage, setSearchPage] = useState(1);
  const [canLoadMore, setCanLoadMore] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | SpotStatus>('all');
  const [importURL, setImportURL] = useState('');
  const [importing, setImporting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [routePlannerOpen, setRoutePlannerOpen] = useState(false);
  const [selectedSpot, setSelectedSpot] = useState<Spot | null>(null);
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
  const hydrated = useRef(false);
  const saving = useRef(false);
  const queued = useRef(false);
  const catalogLoadedForCity = useRef<CitySlug | null>(null);

  const user = tg?.initDataUnsafe?.user;
  const city = cloud.selected_city;
  const cityName = city === 'spb' ? 'Санкт-Петербург' : 'Москва';

  useEffect(() => {
    tg?.ready();
    tg?.expand();
    tg?.disableVerticalSwipes?.();
    tg?.setHeaderColor?.('#0B0F0C');
    tg?.setBackgroundColor?.('#0B0F0C');

    const initData = tg?.initData || '';
    if (!initData) {
      setDemoMode(true);
      setCloud({
        selected_city: 'spb',
        saved_spots: demoSpots,
        collections: [],
        interests: ['restaurant', 'coffee']
      });
      hydrated.current = true;
      setBooting(false);
      return;
    }

    void telegramLogin(initData)
      .then(async (nextSession) => {
        const envelope = await loadCloud(nextSession.token);
        setSession(nextSession);
        setRevision(envelope.revision);
        setCloud(normalizeCloud(envelope.state));
        hydrated.current = true;
      })
      .catch((error: unknown) => {
        setBootError(error instanceof Error ? error.message : 'Не удалось открыть СПОТ');
      })
      .finally(() => setBooting(false));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!hydrated.current || demoMode || !session) return;

    const timer = window.setTimeout(() => {
      void persistCloud(cloud);
    }, 500);

    return () => window.clearTimeout(timer);
  }, [cloud, demoMode, session]);

  useEffect(() => {
    if (tab !== 'map' || search || activeCategory) return;
    if (!session && !demoMode) return;
    if (catalogLoadedForCity.current === city) return;

    catalogLoadedForCity.current = city;
    void runSearch('', '', 1, false);
  }, [activeCategory, city, demoMode, search, session, tab]);

  async function persistCloud(next: CloudPayload) {
    if (!session) return;
    if (saving.current) {
      queued.current = true;
      return;
    }

    saving.current = true;
    try {
      const result = await saveCloud(session.token, revision, next);
      setRevision(result.revision);
    } catch {
      setToast('Не удалось синхронизировать · повторим позже');
    } finally {
      saving.current = false;
      if (queued.current) {
        queued.current = false;
        window.setTimeout(() => void persistCloud(next), 100);
      }
    }
  }

  function updateCloud(updater: (current: CloudPayload) => CloudPayload) {
    setCloud((current) => updater(current));
  }

  function switchTab(next: Tab) {
    haptic();
    setTab(next);
  }

  function saveSpot(spot: Spot) {
    updateCloud((current) => {
      if (current.saved_spots.some((item) => item.id === spot.id)) return current;
      return { ...current, saved_spots: [{ ...spot, status: 'want' }, ...current.saved_spots] };
    });
    haptic('success');
    setToast('Сохранено в СПОТ');
  }

  function updateSpot(id: string, patch: Partial<Spot>) {
    updateCloud((current) => ({
      ...current,
      saved_spots: current.saved_spots.map((spot) => (
        spot.id === id ? { ...spot, ...patch } : spot
      ))
    }));
  }

  function saveRouteCollection(collection: Collection) {
    updateCloud((current) => ({
      ...current,
      collections: [
        collection,
        ...current.collections.filter((item) => item.id !== collection.id)
      ]
    }));
    setRoutePlannerOpen(false);
    setTab('collections');
    haptic('success');
    setToast('Маршрут сохранён в подборки');
  }

  function createCollection(title: string, placeIds: string[]) {
    const cleanTitle = title.trim();
    if (!cleanTitle || placeIds.length === 0) return;

    const collection: Collection = {
      id: 'collection_' + Date.now(),
      title: cleanTitle,
      subtitle: cityName,
      city,
      cityLabel: cityName,
      placeIds,
      createdAt: new Date().toISOString()
    };

    updateCloud((current) => ({
      ...current,
      collections: [collection, ...current.collections]
    }));
    setSelectedCollection(collection);
    haptic('success');
    setToast('Подборка создана');
  }

  async function runSearch(
    query = search,
    category = activeCategory,
    page = 1,
    append = false
  ) {
    if (!session && !demoMode) return;
    setSearching(true);

    try {
      if (demoMode) {
        const q = query.trim().toLowerCase();
        const next = demoSpots.filter((spot) => (
          (!q || (spot.name + ' ' + spot.address).toLowerCase().includes(q)) &&
          (!category || spot.category === category)
        ));
        setSearchResults(next);
        setCanLoadMore(false);
        setSearchPage(1);
      } else if (session) {
        const next = await searchPlaces(
          session.token,
          query,
          city,
          category || undefined,
          undefined,
          page
        );
        setSearchResults((current) => append
          ? Array.from(new Map([...current, ...next].map((spot) => [spot.id, spot])).values())
          : next
        );
        const mixedCatalog = query.trim() === '' && !category;
        setCanLoadMore(next.length > 0 && (mixedCatalog ? page < 40 : page < 50));
        setSearchPage(page);
      }
    } catch {
      setToast('Поиск временно недоступен');
    } finally {
      setSearching(false);
    }
  }

  async function loadMorePlaces() {
    if (searching || !canLoadMore) return;
    await runSearch(search, activeCategory, searchPage + 1, true);
  }

  async function runImport() {
    if (!importURL.trim()) return;
    if (!session && !demoMode) return;

    setImporting(true);
    try {
      if (demoMode) {
        setToast('В Telegram импорт будет распознавать реальную ссылку');
      } else if (session) {
        const imported = await importPlaceLink(session.token, importURL.trim(), city);
        if (imported.length === 0) {
          setToast('Не удалось найти место по ссылке');
        } else {
          imported.forEach(saveSpot);
          setImportURL('');
          setTab('spots');
        }
      }
    } catch {
      setToast('Не удалось разобрать ссылку');
    } finally {
      setImporting(false);
    }
  }

  const visibleSpots = useMemo(
    () => cloud.saved_spots.filter((spot) => (
      spot.city === city &&
      (statusFilter === 'all' || spot.status === statusFilter)
    )),
    [city, cloud.saved_spots, statusFilter]
  );

  const favoriteCount = cloud.saved_spots.filter((spot) => spot.favorite).length;
  const visitedCount = cloud.saved_spots.filter((spot) => spot.status === 'visited').length;

  if (booting) {
    return (
      <div className="boot">
        <div className="brand-heart"><SpotIcon name="heart" size={30} strokeWidth={2.2} /></div>
        <div className="boot-title">СПОТ</div>
        <div className="boot-text">Открываем твою карту…</div>
      </div>
    );
  }

  if (bootError) {
    return (
      <div className="boot">
        <div className="brand-heart error">!</div>
        <div className="boot-title">Не удалось открыть СПОТ</div>
        <div className="boot-text">{bootError}</div>
        <button className="primary-button" onClick={() => window.location.reload()}>
          Попробовать ещё раз
        </button>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="kicker"><SpotIcon name="heart" size={10} strokeWidth={2.2} /> ЛИЧНАЯ БИБЛИОТЕКА</div>
          <h1>{tab === 'map' ? 'Карта' : tab === 'spots' ? 'Мои споты' : tab === 'add' ? 'Добавить' : tab === 'collections' ? 'Подборки' : 'Профиль'}</h1>
        </div>
        <button
          className="city-pill"
          onClick={() => {
            setSearchResults([]);
            setSearch('');
            setActiveCategory('');
            setSearchPage(1);
            setCanLoadMore(false);
            catalogLoadedForCity.current = null;
            updateCloud((current) => ({
              ...current,
              selected_city: current.selected_city === 'spb' ? 'moscow' : 'spb'
            }));
          }}
        >
          <span>{city === 'spb' ? 'СПБ' : 'МСК'}</span>
          <span className="city-switch-icon">⇅</span>
        </button>
      </header>

      <main className="content">
        {demoMode ? (
          <div className="demo-note">PREVIEW · внутри Telegram включится реальный аккаунт</div>
        ) : null}

        {tab === 'map' ? (
          <section>
            <div className="search-row">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void runSearch();
                }}
                placeholder="Название места"
              />
              <button aria-label="Поиск" onClick={() => void runSearch()}>
                {searching ? <span className="search-loader" /> : <SpotIcon name="search" size={20} strokeWidth={2.1} />}
              </button>
            </div>

            <div className="chips horizontal">
              <button
                className={!activeCategory ? 'active' : ''}
                onClick={() => {
                  setActiveCategory('');
                  setSearchPage(1);
                  void runSearch(search, '', 1, false);
                }}
              ><SpotIcon name="sparkles" size={14} /> Каталог</button>
              {categories.map(([id, icon, label]) => (
                <button
                  key={id}
                  className={activeCategory === id ? 'active' : ''}
                  onClick={() => {
                    setActiveCategory(id);
                    setSearchPage(1);
                    void runSearch(search, id, 1, false);
                  }}
                ><SpotIcon name={icon} size={14} /> {label}</button>
              ))}
            </div>

            <div className="map-panel real-map">
              <SpotMap
                city={city}
                spots={searchResults.length ? searchResults : cloud.saved_spots.filter((spot) => spot.city === city)}
                onSelect={setSelectedSpot}
              />
              <div className="map-status">
                <span>{cityName.toUpperCase()}</span>
                <b>{searchResults.length ? searchResults.length + ' найдено' : cloud.saved_spots.filter((spot) => spot.city === city).length + ' сохранено'}</b>
              </div>
            </div>

            <SpotList
              spots={searchResults.length ? searchResults : cloud.saved_spots.filter((spot) => spot.city === city).slice(0, 6)}
              saved={cloud.saved_spots}
              onSave={saveSpot}
              onUpdate={updateSpot}
              onOpen={setSelectedSpot}
            />
            {searchResults.length > 0 && canLoadMore ? (
              <button className="load-more" disabled={searching} onClick={() => void loadMorePlaces()}>
                <span>{searching ? 'Загружаем…' : 'Показать ещё места'}</span>
                {!searching ? <SpotIcon name="chevron" size={16} /> : null}
              </button>
            ) : null}
          </section>
        ) : null}

        {tab === 'spots' ? (
          <section>
            <p className="lead">Все места, куда хочется попасть. Сохраняй из Reels, TikTok, Telegram и карт.</p>
            <div className="chips horizontal">
              {([
                ['all', 'Все'],
                ['want', 'Хочу'],
                ['visited', 'Был'],
                ['booked', 'Бронь']
              ] as const).map(([id, label]) => (
                <button key={id} className={statusFilter === id ? 'active' : ''} onClick={() => setStatusFilter(id)}>
                  {label}
                </button>
              ))}
            </div>

            <button className="route-card premium-action-card" onClick={() => setRoutePlannerOpen(true)}>
              <span className="route-icon"><SpotIcon name="route" size={23} strokeWidth={1.8} /></span>
              <span><b>Собрать маршрут</b><small>СПОТ соединит сохранённые места в готовый план</small></span>
              <strong><SpotIcon name="chevron" size={18} /></strong>
            </button>

            <SpotList spots={visibleSpots} saved={cloud.saved_spots} onSave={saveSpot} onUpdate={updateSpot} onOpen={setSelectedSpot} />
            {visibleSpots.length === 0 ? <Empty text="Здесь пока нет спотов" /> : null}
          </section>
        ) : null}

        {tab === 'add' ? (
          <section>
            <div className="hero-card">
              <span className="hero-icon"><SpotIcon name="plus" size={28} strokeWidth={2} /></span>
              <h2>Сохрани место за секунды</h2>
              <p>Вставь ссылку на Reel, TikTok, Telegram-пост или карточку места.</p>
            </div>

            <div className="import-box">
              <label>ССЫЛКА</label>
              <textarea
                value={importURL}
                onChange={(event) => setImportURL(event.target.value)}
                placeholder="https://…"
              />
              <button className="primary-button" disabled={importing || !importURL.trim()} onClick={() => void runImport()}>
                {importing ? 'Распознаём…' : 'Распознать место'}
              </button>
            </div>

            <div className="privacy-card">
              <b><SpotIcon name="shield" size={15} /> Приватно по умолчанию</b>
              <p>Твои заметки, статусы и сохранения видишь только ты, пока сам не поделишься подборкой.</p>
            </div>
          </section>
        ) : null}

        {tab === 'collections' ? (
          <section>
            <div className="section-heading">
              <div><span>МОИ ПОДБОРКИ</span><h2>Собери места по смыслу</h2></div>
              <button className="section-add" onClick={() => setSelectedCollection({
                id: '',
                title: '',
                subtitle: cityName,
                city,
                cityLabel: cityName,
                placeIds: []
              })}>＋</button>
            </div>
            {cloud.collections.length === 0 ? (
              <Empty text="Пока нет подборок. Маршрут или ручная подборка появятся здесь." />
            ) : cloud.collections.map((collection) => (
              <button className="collection-card" key={collection.id} onClick={() => setSelectedCollection(collection)}>
                <span><SpotIcon name={collection.routePlan ? 'route' : 'heart'} size={18} /></span>
                <div>
                  <b>{collection.title}</b>
                  <small>{collection.routePlan ? 'МАРШРУТ · ' : ''}{collection.placeIds.length} мест · {collection.city === 'spb' ? 'СПБ' : collection.city === 'moscow' ? 'МСК' : '2 города'}</small>
                </div>
                <strong><SpotIcon name="chevron" size={17} /></strong>
              </button>
            ))}
          </section>
        ) : null}

        {tab === 'profile' ? (
          <section>
            <div className="profile-card">
              <div className="avatar">
                {user?.photo_url ? <img src={user.photo_url} alt="" /> : <span>{(user?.first_name || session?.profile.display_name || 'С')[0]}</span>}
              </div>
              <div>
                <h2>{user?.first_name || session?.profile.display_name || 'СПОТ'}</h2>
                <p>{user?.username ? '@' + user.username : 'Telegram Mini App'}</p>
              </div>
            </div>

            <div className="stats">
              <div><b>{cloud.saved_spots.length}</b><span>Спотов</span></div>
              <div><b>{favoriteCount}</b><span>Любимых</span></div>
              <div><b>{visitedCount}</b><span>Посещено</span></div>
            </div>

            <div className="menu">
              <button onClick={() => updateCloud((current) => ({ ...current, selected_city: current.selected_city === 'spb' ? 'moscow' : 'spb' }))}>
                <span>Город</span><strong>{cityName} ›</strong>
              </button>
              <button onClick={() => setToast('Интересы синхронизируются с рекомендациями')}>
                <span>Интересы</span><strong>{cloud.interests.length || 'Не выбраны'} ›</strong>
              </button>
              <button onClick={() => setToast('Telegram уже является способом входа')}>
                <span>Аккаунт</span><strong>Telegram ✓</strong>
              </button>
            </div>

            <div className="telegram-card">
              <b>Открывается прямо в Telegram</b>
              <p>App Store и Apple Developer Program для Telegram Mini App не нужны. Авторизация идёт через Telegram и проверяется на сервере.</p>
            </div>
          </section>
        ) : null}
      </main>

      {routePlannerOpen ? (
        <RoutePlanner
          city={city}
          spots={cloud.saved_spots}
          interests={cloud.interests}
          sessionToken={session?.token}
          onClose={() => setRoutePlannerOpen(false)}
          onSave={saveRouteCollection}
        />
      ) : null}

      {selectedSpot ? (
        <SpotDetail
          spot={selectedSpot}
          saved={cloud.saved_spots.some((item) => item.id === selectedSpot.id)}
          onClose={() => setSelectedSpot(null)}
          onSave={() => {
            saveSpot(selectedSpot);
            setSelectedSpot(null);
          }}
          onStatus={(status) => {
            updateSpot(selectedSpot.id, {
              status,
              visitedAt: status === 'visited' ? new Date().toISOString() : selectedSpot.visitedAt
            });
            setSelectedSpot((current) => current ? { ...current, status } : null);
          }}
        />
      ) : null}

      {selectedCollection ? (
        <CollectionEditor
          collection={selectedCollection}
          spots={cloud.saved_spots}
          onClose={() => setSelectedCollection(null)}
          onCreate={createCollection}
          onOpenSpot={(spot) => {
            setSelectedCollection(null);
            setSelectedSpot(spot);
          }}
          onOpenRoute={() => {
            setSelectedCollection(null);
            setRoutePlannerOpen(true);
          }}
        />
      ) : null}

      <nav className="bottom-nav">
        <NavButton active={tab === 'map'} icon="map" label="Карта" onClick={() => switchTab('map')} />
        <NavButton active={tab === 'spots'} icon="heart" label="Споты" onClick={() => switchTab('spots')} />
        <button className="add-button" aria-label="Добавить место" onClick={() => switchTab('add')}>
          <SpotIcon name="plus" size={27} strokeWidth={2.1} />
        </button>
        <NavButton active={tab === 'collections'} icon="collection" label="Подборки" onClick={() => switchTab('collections')} />
        <NavButton active={tab === 'profile'} icon="profile" label="Профиль" onClick={() => switchTab('profile')} />
      </nav>

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: IconName; label: string; onClick: () => void }) {
  return (
    <button className={active ? 'nav-item active' : 'nav-item'} onClick={onClick}>
      <span><SpotIcon name={icon} size={18} strokeWidth={1.8} /></span><small>{label}</small>
    </button>
  );
}

function SpotList({
  spots,
  saved,
  onSave,
  onUpdate,
  onOpen
}: {
  spots: Spot[];
  saved: Spot[];
  onSave: (spot: Spot) => void;
  onUpdate: (id: string, patch: Partial<Spot>) => void;
  onOpen?: (spot: Spot) => void;
}) {
  const savedIDs = new Set(saved.map((spot) => spot.id));

  return (
    <div className="spot-list">
      {spots.map((spot) => {
        const isSaved = savedIDs.has(spot.id);
        const openState = openingState(spot);
        return (
          <article className="spot-card" key={spot.id} onClick={() => onOpen?.(spot)}>
            <div className="spot-thumb"><SpotIcon name={categoryIconName(spot.category)} size={27} strokeWidth={1.65} /></div>
            <div className="spot-copy">
              <span>{spot.categoryLabel.toUpperCase()} · {spot.city === 'spb' ? 'СПБ' : 'МОСКВА'}</span>
              <h3>{spot.name}</h3>
              {openState ? (
                <div className={openState.open ? 'spot-open open' : 'spot-open closed'}>
                  <i /> {openState.label}
                </div>
              ) : null}
              <p>{spot.address}</p>
              <div className="spot-meta">
                <b>★ {spot.rating.toFixed(1)}</b>
                {spot.reviewCount ? <span>{spot.reviewCount.toLocaleString('ru-RU')} отзывов</span> : null}
              </div>
            </div>
            {isSaved ? (
              <button
                className={spot.favorite ? 'heart-button active' : 'heart-button'}
                onClick={(event) => {
                  event.stopPropagation();
                  onUpdate(spot.id, { favorite: !spot.favorite });
                }}
              ><SpotIcon name="heart" size={16} strokeWidth={1.9} /></button>
            ) : (
              <button className="save-mini" onClick={(event) => {
                event.stopPropagation();
                onSave(spot);
              }}><SpotIcon name="plus" size={18} strokeWidth={2} /></button>
            )}
          </article>
        );
      })}
    </div>
  );
}

function categoryIconName(category: string): IconName {
  const match = categories.find(([id]) => id === category);
  return match?.[1] || 'location';
}

function SpotDetail({
  spot,
  saved,
  onClose,
  onSave,
  onStatus
}: {
  spot: Spot;
  saved: boolean;
  onClose: () => void;
  onSave: () => void;
  onStatus: (status: SpotStatus) => void;
}) {
  function openMaps() {
    const url = 'https://www.google.com/maps/search/?api=1&query=' +
      encodeURIComponent(spot.latitude + ',' + spot.longitude);
    const tg = telegram();
    if (tg?.openLink) tg.openLink(url);
    else window.open(url, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="detail-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="detail-handle" />
        <div className="detail-head">
          <div>
            <span>{spot.categoryLabel.toUpperCase()} · {spot.city === 'spb' ? 'СПБ' : 'МОСКВА'}</span>
            <h2>{spot.name}</h2>
            <p>{spot.address} · ★ {spot.rating.toFixed(1)}</p>
            {openingState(spot) ? (
              <div className={openingState(spot)?.open ? 'detail-open open' : 'detail-open closed'}>
                <i /> {openingState(spot)?.label}
              </div>
            ) : null}
          </div>
          <button onClick={onClose}>×</button>
        </div>

        {spot.description ? <div className="detail-description">{spot.description}</div> : null}

        <div className="detail-actions">
          <button className="secondary-action" onClick={openMaps}><SpotIcon name="location" size={15} /> Карты</button>
          {saved ? (
            <button className="primary-action"><SpotIcon name="heart" size={15} /> Сохранено</button>
          ) : (
            <button className="primary-action" onClick={onSave}><SpotIcon name="heart" size={15} /> В СПОТ</button>
          )}
        </div>

        {saved ? (
          <div className="status-grid">
            {([
              ['want', 'Хочу'],
              ['booked', 'Бронь'],
              ['visited', 'Был']
            ] as Array<[SpotStatus, string]>).map(([status, label]) => (
              <button
                key={status}
                className={spot.status === status ? 'active' : ''}
                onClick={() => onStatus(status)}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CollectionEditor({
  collection,
  spots,
  onClose,
  onCreate,
  onOpenSpot,
  onOpenRoute
}: {
  collection: Collection;
  spots: Spot[];
  onClose: () => void;
  onCreate: (title: string, placeIds: string[]) => void;
  onOpenSpot: (spot: Spot) => void;
  onOpenRoute: () => void;
}) {
  const isNew = !collection.id;
  const [title, setTitle] = useState(collection.title);
  const [placeIds, setPlaceIds] = useState<string[]>(collection.placeIds || []);
  const places = collection.placeIds.map((id) => spots.find((spot) => spot.id === id)).filter((spot): spot is Spot => Boolean(spot));

  if (!isNew) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="detail-sheet collection-detail" onClick={(event) => event.stopPropagation()}>
          <div className="detail-handle" />
          <div className="detail-head">
            <div>
              <span>{collection.routePlan ? 'СОХРАНЁННЫЙ МАРШРУТ' : 'ПОДБОРКА'}</span>
              <h2>{collection.title}</h2>
              <p>{collection.subtitle || ''} · {places.length} мест</p>
            </div>
            <button onClick={onClose}>×</button>
          </div>

          {collection.routePlan ? (
            <button className="route-card compact" onClick={onOpenRoute}>
              <span className="route-icon"><SpotIcon name="route" size={22} /></span>
              <span><b>Собрать новый вариант</b><small>{collection.routePlan.transport === 'driving' ? 'На машине' : 'Пешком'} · настройки маршрута сохранены</small></span>
              <strong>›</strong>
            </button>
          ) : null}

          <div className="collection-place-list">
            {places.map((spot, index) => (
              <button key={spot.id} onClick={() => onOpenSpot(spot)}>
                <span>{index + 1}</span>
                <div><b>{spot.name}</b><small>{spot.address}</small></div>
                <strong>›</strong>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const candidates = spots.filter((spot) => spot.status !== 'visited');

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="detail-sheet collection-detail" onClick={(event) => event.stopPropagation()}>
        <div className="detail-handle" />
        <div className="detail-head">
          <div><span>НОВАЯ ПОДБОРКА</span><h2>Собрать места</h2></div>
          <button onClick={onClose}>×</button>
        </div>
        <input
          className="collection-title-input"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Например: Вечер в Петербурге"
        />
        <div className="collection-picker">
          {candidates.map((spot) => {
            const active = placeIds.includes(spot.id);
            return (
              <button
                key={spot.id}
                className={active ? 'active' : ''}
                onClick={() => setPlaceIds((current) => (
                  active ? current.filter((id) => id !== spot.id) : [...current, spot.id]
                ))}
              >
                <span>{active ? '✓' : <SpotIcon name={categoryIconName(spot.category)} size={15} />}</span>
                <div><b>{spot.name}</b><small>{spot.address}</small></div>
              </button>
            );
          })}
        </div>
        <button
          className="primary-button"
          disabled={!title.trim() || placeIds.length === 0}
          onClick={() => {
            onCreate(title, placeIds);
            onClose();
          }}
        >
          Создать подборку · {placeIds.length}
        </button>
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="empty premium-empty">
      <span><SpotIcon name="heart" size={27} strokeWidth={1.8} /></span>
      <b>{text}</b>
      <small>Здесь появится твоя личная коллекция мест.</small>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
