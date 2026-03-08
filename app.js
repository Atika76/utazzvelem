const SETTINGS_KEY = 'fuvarportal_settings_v1';
const TRIPS_KEY = 'fuvarportal_trips_v1';

const defaultSettings = {
  siteName: 'FuvarPortál',
  businessName: '[kitöltendő]',
  intro: '[kitöltendő]',
  email: '[kitöltendő]',
  phone: '[kitöltendő]',
  city: '[kitöltendő]',
  adminEmail: '[kitöltendő]'
};

const defaultTrips = [
  {
    id: cryptoRandom(),
    driverName: 'Minta Fuvar 1',
    contactEmail: '[kitöltendő]',
    phone: '[kitöltendő]',
    packageType: 'Kiemelt',
    origin: 'Budapest',
    destination: 'Győr',
    date: futureDate(1),
    time: '08:30',
    seats: 3,
    price: 4500,
    note: 'Minta fuvar az induló verzióhoz.',
    status: 'Jóváhagyva',
    createdAt: new Date().toISOString()
  },
  {
    id: cryptoRandom(),
    driverName: 'Minta Fuvar 2',
    contactEmail: '[kitöltendő]',
    phone: '[kitöltendő]',
    packageType: 'Alap',
    origin: 'Székesfehérvár',
    destination: 'Budapest',
    date: futureDate(2),
    time: '15:10',
    seats: 2,
    price: 3000,
    note: 'Kisebb csomag elfér.',
    status: 'Jóváhagyva',
    createdAt: new Date().toISOString()
  },
  {
    id: cryptoRandom(),
    driverName: 'Minta Fuvar 3',
    contactEmail: '[kitöltendő]',
    phone: '[kitöltendő]',
    packageType: 'Prémium',
    origin: 'Debrecen',
    destination: 'Miskolc',
    date: futureDate(3),
    time: '12:00',
    seats: 4,
    price: 3800,
    note: 'Előzetes egyeztetés javasolt.',
    status: 'Függőben',
    createdAt: new Date().toISOString()
  }
];

function cryptoRandom() {
  return 'id-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function futureDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function loadSettings() {
  const raw = localStorage.getItem(SETTINGS_KEY);
  const data = raw ? JSON.parse(raw) : null;
  return { ...defaultSettings, ...(data || {}) };
}
function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
function loadTrips() {
  const raw = localStorage.getItem(TRIPS_KEY);
  if (raw) return JSON.parse(raw);
  localStorage.setItem(TRIPS_KEY, JSON.stringify(defaultTrips));
  return defaultTrips;
}
function saveTrips(trips) {
  localStorage.setItem(TRIPS_KEY, JSON.stringify(trips));
}
function statusClass(status) {
  if (status === 'Jóváhagyva') return 'approved';
  if (status === 'Törölve') return 'deleted';
  return 'pending';
}
function tripCard(trip, isAdmin = false) {
  return `
    <article class="card trip-card">
      <div>
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:start;flex-wrap:wrap;">
          <div>
            <h3 style="margin:0 0 8px;">${escapeHtml(trip.origin)} → ${escapeHtml(trip.destination)}</h3>
            <div class="trip-meta">
              <span><strong>Dátum:</strong> ${escapeHtml(trip.date)}</span>
              <span><strong>Idő:</strong> ${escapeHtml(trip.time)}</span>
              <span><strong>Helyek:</strong> ${escapeHtml(String(trip.seats))}</span>
              <span><strong>Ár:</strong> ${escapeHtml(String(trip.price))} Ft / fő</span>
            </div>
          </div>
          <span class="status ${statusClass(trip.status)}">${escapeHtml(trip.status)}</span>
        </div>
        <p style="color:var(--muted);margin:12px 0 0;"><strong>Sofőr / cég:</strong> ${escapeHtml(trip.driverName)} · <strong>Csomag:</strong> ${escapeHtml(trip.packageType)}</p>
        <p style="color:var(--muted);margin:8px 0 0;">${escapeHtml(trip.note || '')}</p>
      </div>
      <div class="trip-meta">
        <span><strong>E-mail:</strong> ${escapeHtml(trip.contactEmail)}</span>
        <span><strong>Telefon:</strong> ${escapeHtml(trip.phone || '[nincs megadva]')}</span>
      </div>
      <div class="trip-actions">
        ${isAdmin ? `
          <button class="btn btn-success" data-action="approve" data-id="${trip.id}">Jóváhagyás</button>
          <button class="btn btn-danger" data-action="delete" data-id="${trip.id}">Törlés</button>
        ` : `<a href="kapcsolat.html" class="btn btn-secondary">Kapcsolat</a>`}
      </div>
    </article>
  `;
}
function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
function applySettingsToPage() {
  const settings = loadSettings();
  document.querySelectorAll('[data-setting]').forEach(el => {
    const key = el.getAttribute('data-setting');
    if (settings[key] !== undefined) el.textContent = settings[key] || '[kitöltendő]';
  });
  const titleLogo = document.querySelector('.logo');
  if (titleLogo) titleLogo.textContent = settings.siteName || 'FuvarPortál';
}

function initHome() {
  const featured = document.getElementById('featuredTrips');
  if (featured) {
    const trips = loadTrips().filter(t => t.status === 'Jóváhagyva').slice(0, 3);
    featured.innerHTML = trips.length
      ? trips.map(t => `<article class="card"><h3>${escapeHtml(t.origin)} → ${escapeHtml(t.destination)}</h3><p class="lead small">${escapeHtml(t.date)} · ${escapeHtml(t.time)} · ${escapeHtml(String(t.price))} Ft / fő</p><p>${escapeHtml(t.note)}</p></article>`).join('')
      : `<div class="empty-state">Még nincs jóváhagyott minta fuvar.</div>`;
  }
  const quickForm = document.getElementById('quickSearchForm');
  if (quickForm) {
    quickForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const origin = document.getElementById('quickOrigin').value.trim();
      const destination = document.getElementById('quickDestination').value.trim();
      const date = document.getElementById('quickDate').value;
      const params = new URLSearchParams();
      if (origin) params.set('origin', origin);
      if (destination) params.set('destination', destination);
      if (date) params.set('date', date);
      window.location.href = `fuvarok.html?${params.toString()}`;
    });
  }
}

function initTripsPage() {
  const list = document.getElementById('tripsList');
  if (!list) return;
  const params = new URLSearchParams(window.location.search);
  const originInput = document.getElementById('filterOrigin');
  const destinationInput = document.getElementById('filterDestination');
  const dateInput = document.getElementById('filterDate');
  originInput.value = params.get('origin') || '';
  destinationInput.value = params.get('destination') || '';
  dateInput.value = params.get('date') || '';

  function render() {
    const origin = originInput.value.trim().toLowerCase();
    const destination = destinationInput.value.trim().toLowerCase();
    const date = dateInput.value;
    const trips = loadTrips().filter(t => t.status === 'Jóváhagyva').filter(t => {
      const o = t.origin.toLowerCase().includes(origin);
      const d = t.destination.toLowerCase().includes(destination);
      const dt = !date || t.date === date;
      return o && d && dt;
    });
    list.innerHTML = trips.length ? trips.map(t => tripCard(t)).join('') : `<div class="empty-state">Nincs a keresésnek megfelelő fuvar.</div>`;
  }

  render();
  document.getElementById('tripFilterForm').addEventListener('submit', (e) => {
    e.preventDefault();
    render();
  });
}

function initTripForm() {
  const form = document.getElementById('tripForm');
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const trip = {
      id: cryptoRandom(),
      driverName: fd.get('driverName')?.toString().trim() || '',
      contactEmail: fd.get('contactEmail')?.toString().trim() || '',
      phone: fd.get('phone')?.toString().trim() || '',
      packageType: fd.get('packageType')?.toString().trim() || 'Alap',
      origin: fd.get('origin')?.toString().trim() || '',
      destination: fd.get('destination')?.toString().trim() || '',
      date: fd.get('date')?.toString() || '',
      time: fd.get('time')?.toString() || '',
      seats: Number(fd.get('seats') || 0),
      price: Number(fd.get('price') || 0),
      status: fd.get('status')?.toString() || 'Függőben',
      note: fd.get('note')?.toString().trim() || '',
      createdAt: new Date().toISOString()
    };
    const trips = loadTrips();
    trips.unshift(trip);
    saveTrips(trips);
    form.reset();
    document.getElementById('tripFormMessage').textContent = 'A fuvar sikeresen elmentve a demó rendszerben.';
  });
}

function initAdmin() {
  const settingsForm = document.getElementById('settingsForm');
  if (settingsForm) {
    const settings = loadSettings();
    Object.keys(settings).forEach(key => {
      const field = settingsForm.elements.namedItem(key);
      if (field) field.value = settings[key] || '';
    });
    settingsForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(settingsForm);
      const newSettings = { ...defaultSettings };
      Object.keys(defaultSettings).forEach(key => newSettings[key] = fd.get(key)?.toString().trim() || '[kitöltendő]');
      saveSettings(newSettings);
      document.getElementById('settingsMessage').textContent = 'Beállítások elmentve.';
      applySettingsToPage();
    });
  }

  const list = document.getElementById('adminTripsList');
  if (list) {
    function render() {
      const trips = loadTrips();
      list.innerHTML = trips.length ? trips.map(t => tripCard(t, true)).join('') : `<div class="empty-state">Még nincs beküldött fuvar.</div>`;
      list.querySelectorAll('button[data-action]').forEach(btn => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-id');
          const action = btn.getAttribute('data-action');
          const trips = loadTrips().map(t => {
            if (t.id === id) {
              if (action === 'approve') return { ...t, status: 'Jóváhagyva' };
              if (action === 'delete') return { ...t, status: 'Törölve' };
            }
            return t;
          });
          saveTrips(trips);
          render();
        });
      });
    }
    render();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  applySettingsToPage();
  initHome();
  initTripsPage();
  initTripForm();
  initAdmin();
});
