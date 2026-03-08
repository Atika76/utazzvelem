const SETTINGS_KEY = 'utazzvelem_settings_v2';
const TRIPS_KEY = 'utazzvelem_trips_v2';

const defaultSettings = {
  siteName: 'Utazz Velem',
  businessName: 'Utazz Velem',
  intro: 'Gyors és átlátható fuvarmegosztó felület utasoknak és sofőröknek.',
  email: 'info@utazzvelem.hu',
  phone: '+36 30 123 4567',
  city: 'Budapest',
  adminEmail: 'admin@utazzvelem.hu'
};

const defaultTrips = [
  {
    id: cryptoRandom(),
    driverName: 'Kovács Péter',
    contactEmail: 'peter.kovacs@pelda.hu',
    phone: '+36 30 456 7812',
    packageType: 'Kiemelt',
    origin: 'Budapest',
    destination: 'Győr',
    date: futureDate(1),
    time: '08:30',
    seats: 3,
    price: 4500,
    note: 'Kisebb csomag elfér, indulás pontosan a megbeszélt időben.',
    status: 'Jóváhagyva',
    createdAt: new Date().toISOString()
  },
  {
    id: cryptoRandom(),
    driverName: 'Nagy Andrea',
    contactEmail: 'andrea.nagy@pelda.hu',
    phone: '+36 20 555 1122',
    packageType: 'Alap',
    origin: 'Székesfehérvár',
    destination: 'Budapest',
    date: futureDate(2),
    time: '15:10',
    seats: 2,
    price: 3000,
    note: 'Rugalmas felvételi pont előzetes egyeztetéssel.',
    status: 'Jóváhagyva',
    createdAt: new Date().toISOString()
  },
  {
    id: cryptoRandom(),
    driverName: 'Tóth Gábor',
    contactEmail: 'gabor.toth@pelda.hu',
    phone: '+36 70 333 9988',
    packageType: 'Prémium',
    origin: 'Debrecen',
    destination: 'Miskolc',
    date: futureDate(3),
    time: '12:00',
    seats: 4,
    price: 3800,
    note: 'Előzetes telefonos egyeztetés javasolt.',
    status: 'Jóváhagyva',
    createdAt: new Date().toISOString()
  }
];

function cryptoRandom() {
  return 'id-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function futureDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return { ...defaultSettings, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return { ...defaultSettings };
  }
}

function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function loadTrips() {
  try {
    const raw = localStorage.getItem(TRIPS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  localStorage.setItem(TRIPS_KEY, JSON.stringify(defaultTrips));
  return [...defaultTrips];
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
  const safeNote = trip.note ? `<p style="color:var(--muted);margin:10px 0 0;">${escapeHtml(trip.note)}</p>` : '';
  return `
    <article class="card trip-card glass-glow">
      <div>
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:start;flex-wrap:wrap;">
          <div>
            <h3>${escapeHtml(trip.origin)} → ${escapeHtml(trip.destination)}</h3>
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
        ${safeNote}
      </div>
      <div class="trip-meta">
        <span><strong>E-mail:</strong> ${escapeHtml(trip.contactEmail)}</span>
        <span><strong>Telefon:</strong> ${escapeHtml(trip.phone || 'Nincs megadva')}</span>
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

function applySettingsToPage() {
  const settings = loadSettings();
  document.title = document.title.replace(/Utazz Velem|FuvarPortál/g, settings.siteName || 'Utazz Velem');
  document.querySelectorAll('[data-setting]').forEach((element) => {
    const key = element.getAttribute('data-setting');
    if (settings[key] !== undefined) {
      element.textContent = settings[key];
    }
  });

  const emailLink = document.querySelector('[data-email-link]');
  if (emailLink) emailLink.setAttribute('href', `mailto:${settings.email}`);
}

function initHome() {
  const featured = document.getElementById('featuredTrips');
  if (featured) {
    const trips = loadTrips().filter((trip) => trip.status === 'Jóváhagyva').slice(0, 3);
    featured.innerHTML = trips.length
      ? trips.map((trip) => `
          <article class="card feature-card glass-glow">
            <h3>${escapeHtml(trip.origin)} → ${escapeHtml(trip.destination)}</h3>
            <p class="lead small">${escapeHtml(trip.date)} · ${escapeHtml(trip.time)} · ${escapeHtml(String(trip.price))} Ft / fő</p>
            <p>${escapeHtml(trip.note)}</p>
          </article>
        `).join('')
      : '<div class="empty-state">Jelenleg nincs elérhető fuvar.</div>';
  }

  const quickForm = document.getElementById('quickSearchForm');
  if (quickForm) {
    quickForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const params = new URLSearchParams();
      const origin = document.getElementById('quickOrigin').value.trim();
      const destination = document.getElementById('quickDestination').value.trim();
      const date = document.getElementById('quickDate').value;
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

    const trips = loadTrips()
      .filter((trip) => trip.status === 'Jóváhagyva')
      .filter((trip) => {
        const matchesOrigin = !origin || trip.origin.toLowerCase().includes(origin);
        const matchesDestination = !destination || trip.destination.toLowerCase().includes(destination);
        const matchesDate = !date || trip.date === date;
        return matchesOrigin && matchesDestination && matchesDate;
      });

    list.innerHTML = trips.length
      ? trips.map((trip) => tripCard(trip)).join('')
      : '<div class="empty-state">Nincs a keresésnek megfelelő fuvar.</div>';
  }

  render();
  document.getElementById('tripFilterForm').addEventListener('submit', (event) => {
    event.preventDefault();
    render();
  });
}

function initTripForm() {
  const form = document.getElementById('tripForm');
  if (!form) return;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const trip = {
      id: cryptoRandom(),
      driverName: formData.get('driverName')?.toString().trim() || '',
      contactEmail: formData.get('contactEmail')?.toString().trim() || '',
      phone: formData.get('phone')?.toString().trim() || '',
      packageType: formData.get('packageType')?.toString().trim() || 'Alap',
      origin: formData.get('origin')?.toString().trim() || '',
      destination: formData.get('destination')?.toString().trim() || '',
      date: formData.get('date')?.toString() || '',
      time: formData.get('time')?.toString() || '',
      seats: Number(formData.get('seats') || 0),
      price: Number(formData.get('price') || 0),
      status: formData.get('status')?.toString() || 'Jóváhagyva',
      note: formData.get('note')?.toString().trim() || '',
      createdAt: new Date().toISOString()
    };

    const trips = loadTrips();
    trips.unshift(trip);
    saveTrips(trips);
    form.reset();
    document.getElementById('tripFormMessage').textContent = 'A fuvar sikeresen rögzítve lett.';
  });
}

function initAdmin() {
  const settingsForm = document.getElementById('settingsForm');
  if (settingsForm) {
    const settings = loadSettings();
    Object.keys(settings).forEach((key) => {
      const field = settingsForm.elements.namedItem(key);
      if (field) field.value = settings[key] || '';
    });

    settingsForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = new FormData(settingsForm);
      const newSettings = { ...defaultSettings };
      Object.keys(defaultSettings).forEach((key) => {
        newSettings[key] = formData.get(key)?.toString().trim() || defaultSettings[key];
      });
      saveSettings(newSettings);
      document.getElementById('settingsMessage').textContent = 'A beállítások elmentve.';
      applySettingsToPage();
    });
  }

  const list = document.getElementById('adminTripsList');
  if (!list) return;

  function render() {
    const trips = loadTrips();
    list.innerHTML = trips.length
      ? trips.map((trip) => tripCard(trip, true)).join('')
      : '<div class="empty-state">Jelenleg nincs beküldött fuvar.</div>';

    list.querySelectorAll('button[data-action]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.getAttribute('data-id');
        const action = button.getAttribute('data-action');
        const updatedTrips = loadTrips().map((trip) => {
          if (trip.id !== id) return trip;
          if (action === 'approve') return { ...trip, status: 'Jóváhagyva' };
          if (action === 'delete') return { ...trip, status: 'Törölve' };
          return trip;
        });
        saveTrips(updatedTrips);
        render();
      });
    });
  }

  render();
}

function initContactForm() {
  const form = document.getElementById('contactForm');
  if (!form) return;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const settings = loadSettings();
    const formData = new FormData(form);
    const name = formData.get('name')?.toString().trim() || '';
    const email = formData.get('email')?.toString().trim() || '';
    const message = formData.get('message')?.toString().trim() || '';
    const subject = encodeURIComponent(`Üzenet az Utazz Velem oldalról – ${name}`);
    const body = encodeURIComponent(`Név: ${name}\nE-mail: ${email}\n\nÜzenet:\n${message}`);
    window.location.href = `mailto:${settings.email}?subject=${subject}&body=${body}`;
  });
}

document.addEventListener('DOMContentLoaded', () => {
  applySettingsToPage();
  initHome();
  initTripsPage();
  initTripForm();
  initAdmin();
  initContactForm();
});
