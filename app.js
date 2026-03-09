const SETTINGS_KEY = 'utazzvelem_settings_v3';
const ADMIN_EMAIL = 'cegweb26@gmail.com';
const SUPABASE_URL = 'https://qkppqjcazakocxgxtlzc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_RnrWDmT0UUZdP-fIppVtgQ_vTw0N_2o';
const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;
const ADMIN_NOTIFY_ENDPOINT = `${SUPABASE_URL}/functions/v1/admin-notify`;

const defaultSettings = {
  siteName: 'Utazz Velem',
  businessName: 'Utazz Velem',
  intro: 'Gyors és átlátható fuvarmegosztó felület utasoknak és sofőröknek.',
  email: 'info@utazzvelem.hu',
  phone: '+36 30 123 4567',
  city: 'Budapest',
  adminEmail: ADMIN_EMAIL
};

const defaultTrips = [
  {
    id: 'seed-1',
    driverName: 'Kovács Péter',
    contactEmail: 'peter.kovacs@pelda.hu',
    phone: '+36 30 456 7812',
    packageType: 'Alap',
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
    id: 'seed-2',
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
    id: 'seed-3',
    driverName: 'Tóth Gábor',
    contactEmail: 'gabor.toth@pelda.hu',
    phone: '+36 70 333 9988',
    packageType: 'Alap',
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

const mapState = { tripsMap: null, previewMap: null, routeMarkers: [] };

function futureDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalizeStatus(status) {
  const safe = String(status || '').trim().toLowerCase();
  if (safe === 'jóváhagyva' || safe === 'jovahagyva') return 'Jóváhagyva';
  if (safe === 'törölve' || safe === 'torolve') return 'Törölve';
  return 'Függőben';
}

function toDbStatus(status) {
  return normalizeStatus(status).toLowerCase();
}

function statusClass(status) {
  const normalized = normalizeStatus(status);
  if (normalized === 'Jóváhagyva') return 'approved';
  if (normalized === 'Törölve') return 'deleted';
  return 'pending';
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

function applySettingsToPage() {
  const settings = loadSettings();
  document.querySelectorAll('[data-setting]').forEach((el) => {
    const key = el.getAttribute('data-setting');
    if (key && settings[key] !== undefined) el.textContent = settings[key];
  });
  document.querySelectorAll('[data-email-link]').forEach((link) => {
    link.setAttribute('href', `mailto:${settings.email}`);
  });
}

function mapDbTrip(row) {
  return {
    id: row.id,
    driverName: row.nev || '',
    contactEmail: row.email || '',
    phone: row.telefon || '',
    packageType: row.csomag || 'Alap',
    origin: row.indulas || '',
    destination: row.erkezes || '',
    date: row.datum || '',
    time: row.ido || '',
    seats: Number(row.helyek || 0),
    price: Number(row.ar || 0),
    note: row.megjegyzes || '',
    status: normalizeStatus(row.statusz),
    createdAt: row.created_at || new Date().toISOString()
  };
}

function toDbTrip(trip) {
  return {
    nev: trip.driverName,
    email: trip.contactEmail,
    telefon: trip.phone,
    indulas: trip.origin,
    erkezes: trip.destination,
    ido: trip.time,
    datum: trip.date,
    helyek: trip.seats,
    ar: trip.price,
    megjegyzes: trip.note,
    statusz: toDbStatus(trip.status)
  };
}

async function ensureSeedTrips() {
  if (!supabaseClient) return;
  const { count, error } = await supabaseClient.from('fuvarok').select('id', { count: 'exact', head: true });
  if (error || count !== 0) return;
  await supabaseClient.from('fuvarok').insert(defaultTrips.map(toDbTrip));
}

async function loadTrips() {
  if (!supabaseClient) return [...defaultTrips];
  await ensureSeedTrips();
  const { data, error } = await supabaseClient.from('fuvarok').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(mapDbTrip);
}

async function createTrip(trip) {
  if (!supabaseClient) return trip;
  const { data, error } = await supabaseClient.from('fuvarok').insert([toDbTrip(trip)]).select('*').single();
  if (error) throw error;
  const created = mapDbTrip(data);
  await notifyAdminAboutTrip(created);
  return created;
}

async function updateTripStatus(id, status) {
  const { error } = await supabaseClient.from('fuvarok').update({ statusz: toDbStatus(status) }).eq('id', Number(id));
  if (error) throw error;
}

async function deleteTrip(id) {
  const { error } = await supabaseClient.from('fuvarok').delete().eq('id', Number(id));
  if (error) throw error;
}

async function notifyAdminAboutTrip(trip) {
  try {
    await fetch(ADMIN_NOTIFY_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`
      },
      body: JSON.stringify({
        adminEmail: ADMIN_EMAIL,
        siteName: loadSettings().siteName,
        trip
      })
    });
  } catch (error) {
    console.warn('Admin email értesítés előkészítve, de még nincs aktiválva a Supabase edge function.', error);
  }
}

function tripCard(trip, isAdmin = false) {
  const safeNote = trip.note ? `<p style="color:var(--muted);margin:10px 0 0;">${escapeHtml(trip.note)}</p>` : '';
  return `
    <article class="card trip-card glass-glow" data-trip-card data-trip-id="${trip.id}">
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
        <p style="color:var(--muted);margin:12px 0 0;"><strong>Sofőr / cég:</strong> ${escapeHtml(trip.driverName)} · <strong>Csomag:</strong> ${escapeHtml(trip.packageType || 'Alap')}</p>
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
        ` : `
          <button class="btn btn-secondary" data-map-trip data-id="${trip.id}">Térkép</button>
          <button class="btn btn-secondary" data-share-trip data-id="${trip.id}">Facebook kép</button>
          <a href="kapcsolat.html" class="btn btn-primary">Kapcsolat</a>
        `}
      </div>
    </article>
  `;
}

async function initHome() {
  const featured = document.getElementById('featuredTrips');
  if (!featured) return;
  try {
    const trips = (await loadTrips()).filter((trip) => trip.status === 'Jóváhagyva').slice(0, 3);
    featured.innerHTML = trips.length ? trips.map((trip) => `
      <article class="card feature-card glass-glow">
        <h3>${escapeHtml(trip.origin)} → ${escapeHtml(trip.destination)}</h3>
        <p class="lead small">${escapeHtml(trip.date)} · ${escapeHtml(trip.time)} · ${escapeHtml(String(trip.price))} Ft / fő</p>
        <p>${escapeHtml(trip.note || 'Kényelmes, átlátható fuvarleírás.')}</p>
      </article>
    `).join('') : '<div class="empty-state">Jelenleg nincs elérhető fuvar.</div>';
  } catch (error) {
    featured.innerHTML = '<div class="empty-state">A fuvarok most nem tölthetők be.</div>';
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

function buildDirectionsUrl(origin, destination) {
  return `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${encodeURIComponent(origin)};${encodeURIComponent(destination)}`;
}

async function geocodeLocation(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Geokódolási hiba');
  const data = await response.json();
  if (!Array.isArray(data) || !data.length) throw new Error(`Nem találtam helyet: ${query}`);
  return { lat: Number(data[0].lat), lon: Number(data[0].lon), label: data[0].display_name };
}

function clearMapMarkers(map) {
  mapState.routeMarkers.forEach((marker) => marker.remove());
  mapState.routeMarkers = [];
}

async function renderTripMap(origin, destination, mapElementId, statusElementId, linkElementId) {
  if (!window.L) return;
  const mapEl = document.getElementById(mapElementId);
  const statusEl = document.getElementById(statusElementId);
  const linkEl = linkElementId ? document.getElementById(linkElementId) : null;
  if (!mapEl || !statusEl) return;

  statusEl.textContent = 'Térkép betöltése...';

  const stateKey = mapElementId === 'tripPreviewMap' ? 'previewMap' : 'tripsMap';
  if (!mapState[stateKey]) {
    mapState[stateKey] = L.map(mapEl).setView([47.1625, 19.5033], 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap közreműködők'
    }).addTo(mapState[stateKey]);
  }

  const map = mapState[stateKey];

  try {
    const [from, to] = await Promise.all([geocodeLocation(origin), geocodeLocation(destination)]);
    clearMapMarkers(map);
    const fromMarker = L.marker([from.lat, from.lon]).addTo(map).bindPopup(`Indulás: ${escapeHtml(origin)}`);
    const toMarker = L.marker([to.lat, to.lon]).addTo(map).bindPopup(`Érkezés: ${escapeHtml(destination)}`);
    mapState.routeMarkers.push(fromMarker, toMarker);
    const bounds = L.latLngBounds([[from.lat, from.lon], [to.lat, to.lon]]);
    map.fitBounds(bounds.pad(0.35));
    statusEl.textContent = `${origin} → ${destination}`;
    if (linkEl) {
      linkEl.href = buildDirectionsUrl(origin, destination);
      linkEl.hidden = false;
    }
  } catch (error) {
    statusEl.textContent = 'Az útvonal most nem jeleníthető meg térképen. Ellenőrizd a településneveket.';
    if (linkEl) linkEl.hidden = true;
  }
}

function slugifyName(input) {
  return String(input || 'fuvar')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'fuvar';
}

async function shareTripImage(trip) {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, 1200, 630);
  gradient.addColorStop(0, '#0b1730');
  gradient.addColorStop(1, '#13325f');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.fillRect(46, 46, 1108, 538);

  ctx.fillStyle = '#dce9ff';
  ctx.font = 'bold 42px Arial';
  ctx.fillText('Utazz Velem', 90, 120);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 66px Arial';
  ctx.fillText(`${trip.origin} → ${trip.destination}`, 90, 220);

  ctx.fillStyle = '#d3e2ff';
  ctx.font = '34px Arial';
  ctx.fillText(`Dátum: ${trip.date}`, 90, 300);
  ctx.fillText(`Idő: ${trip.time}`, 90, 350);
  ctx.fillText(`Ár: ${trip.price} Ft / fő`, 90, 400);
  ctx.fillText(`Szabad helyek: ${trip.seats}`, 90, 450);

  ctx.fillStyle = '#aecdff';
  ctx.font = '28px Arial';
  const note = trip.note || 'Részletek és kapcsolat az Utazz Velem oldalon.';
  ctx.fillText(note.slice(0, 80), 90, 520);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return;
  const filename = `${slugifyName(`${trip.origin}-${trip.destination}-${trip.date}`)}.png`;
  const file = new File([blob], filename, { type: 'image/png' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: `${trip.origin} → ${trip.destination}`,
        text: 'Utazz Velem – fuvar megosztó kép'
      });
      return;
    } catch {}
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function initTripsPage() {
  const list = document.getElementById('tripsList');
  if (!list) return;

  const params = new URLSearchParams(window.location.search);
  const originInput = document.getElementById('filterOrigin');
  const destinationInput = document.getElementById('filterDestination');
  const dateInput = document.getElementById('filterDate');
  originInput.value = params.get('origin') || '';
  destinationInput.value = params.get('destination') || '';
  dateInput.value = params.get('date') || '';

  let currentTrips = [];

  async function render() {
    const origin = originInput.value.trim().toLowerCase();
    const destination = destinationInput.value.trim().toLowerCase();
    const date = dateInput.value;

    currentTrips = (await loadTrips())
      .filter((trip) => trip.status === 'Jóváhagyva')
      .filter((trip) => {
        const matchOrigin = !origin || trip.origin.toLowerCase().includes(origin);
        const matchDestination = !destination || trip.destination.toLowerCase().includes(destination);
        const matchDate = !date || trip.date === date;
        return matchOrigin && matchDestination && matchDate;
      });

    list.innerHTML = currentTrips.length ? currentTrips.map((trip) => tripCard(trip)).join('') : '<div class="empty-state">Nincs a keresésnek megfelelő fuvar.</div>';

    list.querySelectorAll('[data-map-trip]').forEach((button) => {
      button.addEventListener('click', async () => {
        const trip = currentTrips.find((item) => String(item.id) === String(button.dataset.id));
        if (!trip) return;
        await renderTripMap(trip.origin, trip.destination, 'routeMap', 'mapStatus', 'openDirectionsLink');
      });
    });

    list.querySelectorAll('[data-share-trip]').forEach((button) => {
      button.addEventListener('click', async () => {
        const trip = currentTrips.find((item) => String(item.id) === String(button.dataset.id));
        if (trip) await shareTripImage(trip);
      });
    });

    if (currentTrips[0]) {
      await renderTripMap(currentTrips[0].origin, currentTrips[0].destination, 'routeMap', 'mapStatus', 'openDirectionsLink');
    }
  }

  await render();
  document.getElementById('tripFilterForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    await render();
  });
}

function initTripPreviewMap() {
  const previewBtn = document.getElementById('previewRouteBtn');
  const origin = document.getElementById('tripOrigin');
  const destination = document.getElementById('tripDestination');
  if (!previewBtn || !origin || !destination) return;
  previewBtn.addEventListener('click', async () => {
    if (!origin.value.trim() || !destination.value.trim()) {
      document.getElementById('tripPreviewStatus').textContent = 'Előbb töltsd ki az indulási és érkezési helyet.';
      return;
    }
    await renderTripMap(origin.value.trim(), destination.value.trim(), 'tripPreviewMap', 'tripPreviewStatus');
  });
}

async function initTripForm() {
  const form = document.getElementById('tripForm');
  if (!form) return;
  initTripPreviewMap();

  try {
    const { data } = await supabaseClient.auth.getUser();
    const user = data?.user;
    if (user?.email) {
      const emailInput = form.querySelector('input[name="contactEmail"]');
      if (emailInput && !emailInput.value) {
        emailInput.value = user.email;
        emailInput.readOnly = true;
      }
      const nameInput = form.querySelector('input[name="driverName"]');
      const metaName = user.user_metadata?.full_name || user.user_metadata?.name;
      if (nameInput && metaName && !nameInput.value) {
        nameInput.value = metaName;
      }
    }
  } catch (error) {
    console.warn('Felhasználói adatok előtöltése sikertelen:', error);
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = document.getElementById('tripFormMessage');
    message.textContent = 'Fuvar mentése folyamatban...';

    const formData = new FormData(form);
    const trip = {
      id: `temp-${Date.now()}`,
      driverName: String(formData.get('driverName') || '').trim(),
      contactEmail: String(formData.get('contactEmail') || '').trim(),
      phone: String(formData.get('phone') || '').trim(),
      packageType: String(formData.get('packageType') || 'Alap').trim(),
      origin: String(formData.get('origin') || '').trim(),
      destination: String(formData.get('destination') || '').trim(),
      date: String(formData.get('date') || ''),
      time: String(formData.get('time') || ''),
      seats: Number(formData.get('seats') || 0),
      price: Number(formData.get('price') || 0),
      status: 'Függőben',
      note: String(formData.get('note') || '').trim(),
      createdAt: new Date().toISOString()
    };

    try {
      await createTrip(trip);
      form.reset();
      message.textContent = 'A fuvar sikeresen bekerült a rendszerbe. Jóváhagyás után megjelenik a nyilvános listában.';
    } catch (error) {
      console.error(error);
      message.textContent = 'Hiba történt a mentés során. Ellenőrizd a Supabase kapcsolatot.';
    }
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
      const updated = { ...defaultSettings };
      Object.keys(defaultSettings).forEach((key) => {
        updated[key] = String(formData.get(key) || defaultSettings[key]).trim() || defaultSettings[key];
      });
      updated.adminEmail = ADMIN_EMAIL;
      saveSettings(updated);
      applySettingsToPage();
      document.getElementById('settingsMessage').textContent = 'A beállítások elmentve.';
    });
  }

  const list = document.getElementById('adminTripsList');
  if (!list) return;

  async function render() {
    const trips = await loadTrips();
    list.innerHTML = trips.length ? trips.map((trip) => tripCard(trip, true)).join('') : '<div class="empty-state">Jelenleg nincs beküldött fuvar.</div>';
    list.querySelectorAll('[data-action]').forEach((button) => {
      button.addEventListener('click', async () => {
        const id = button.dataset.id;
        const action = button.dataset.action;
        try {
          if (action === 'approve') {
            await updateTripStatus(id, 'Jóváhagyva');
          } else {
            await deleteTrip(id);
          }
          await render();
        } catch (error) {
          alert('Nem sikerült a művelet.');
        }
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
    const name = String(formData.get('name') || '').trim();
    const email = String(formData.get('email') || '').trim();
    const text = String(formData.get('message') || '').trim();
    const subject = encodeURIComponent(`Üzenet az Utazz Velem oldalról – ${name}`);
    const body = encodeURIComponent(`Név: ${name}\nE-mail: ${email}\n\nÜzenet:\n${text}`);
    window.location.href = `mailto:${loadSettings().email}?subject=${subject}&body=${body}`;
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  applySettingsToPage();
  await initHome();
  await initTripsPage();
  initTripForm();
  initAdmin();
  initContactForm();
});
