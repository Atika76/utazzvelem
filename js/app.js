const App = (() => {
  const tableTrips = 'fuvarok';
  const tableBookings = 'foglalasok';
  const tableSettings = 'beallitasok';
  const tableRatings = 'ertekelesek';
  const viewDriverRatings = 'sofor_atlag_ertekeles';
  const profileBucket = 'driver-profile-images';
  const carBucket = 'trip-car-images';

  let activeMap = null;
  let currentViewer = { user: null, admin: false };
  let activeLine = null;
  let activeMarkers = [];

  function escapeHtml(str = '') {
    return String(str).replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
  }

  function fmtCurrency(v) {
    return new Intl.NumberFormat('hu-HU').format(Number(v || 0));
  }

  function normStatus(s = '') { return String(s).toLowerCase(); }

  function statusBadge(status = 'Függőben') {
    const n = normStatus(status);
    let cls = 'info';
    if (n.includes('jóvá') || n.includes('fizetve') || n.includes('készpénz')) cls = 'approved';
    else if (n.includes('függ') || n.includes('vár')) cls = 'pending';
    else if (n.includes('töröl') || n.includes('elutas')) cls = 'rejected';
    return `<span class="status ${cls}">${escapeHtml(status)}</span>`;
  }

  function makeDateTime(date, time) {
    if (!date) return null;
    const t = time || '23:59';
    const d = new Date(`${date}T${t}:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function isTripExpired(trip) {
    const d = makeDateTime(trip?.datum, trip?.ido);
    return !!d && d.getTime() < Date.now();
  }

  function seatCounts(trip) {
    const total = Number(trip.osszes_hely ?? trip.auto_helyek ?? trip.helyek ?? 0);
    const booked = Number(trip.booked_seats ?? trip.foglalt_helyek_osszesen ?? NaN);
    const hasBooked = Number.isFinite(booked);
    const freeFromBooking = hasBooked ? Math.max(0, total - booked) : NaN;
    const freeStored = Math.max(0, Number(trip.szabad_helyek ?? trip.helyek ?? total ?? 0));
    const free = hasBooked ? freeFromBooking : freeStored;
    return { total: Math.max(total, free), free };
  }

  function seatBar(free, total) {
    const t = Math.max(1, Number(total || free || 0));
    const f = Math.max(0, Number(free || 0));
    const used = Math.max(0, t - f);
    const percent = Math.max(0, Math.min(100, Math.round((used / t) * 100)));
    return `<div class="seat-bar-wrap"><div class="seat-bar"><span style="width:${percent}%"></span></div><small>${used}/${t} hely foglalt · ${f} szabad</small></div>`;
  }

  function renderStars(value = 0) {
    const v = Math.max(0, Math.min(5, Number(value || 0)));
    const full = Math.round(v);
    let out = '';
    for (let i = 0; i < 5; i++) out += i < full ? '★' : '☆';
    return out;
  }

  function starRating(value = 0, count = 0) {
    const v = Number(value || 0);
    if (!count && !v) return '<span class="rating-empty">Még nincs értékelés</span>';
    return `<span class="stars">${renderStars(v)}</span> <span class="rating-num">${v.toFixed(1)}</span>${count ? ` <span class="rating-count">(${count} értékelés)</span>` : ''}`;
  }

  function cityNorm(s = '') { return String(s).toLowerCase().replace(/\s+/g, ' ').trim(); }
  function getInitials(name = '') {
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    return parts.slice(0, 2).map(x => x[0]?.toUpperCase() || '').join('') || '?';
  }

  function safeUrl(value = '') {
    const url = String(value || '').trim();
    if (!url) return '';
    if (/^https?:\/\//i.test(url) || /^data:image\//i.test(url)) return url;
    return '';
  }

  function parseImageList(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.map(safeUrl).filter(Boolean);
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(safeUrl).filter(Boolean);
    } catch (_) {}
    return String(value).split(',').map(v => safeUrl(v.trim())).filter(Boolean);
  }

  function getProfileImage(trip = {}) {
    return safeUrl(trip.profil_kep_url || trip.profile_kep_url || trip.sofor_profilkep || '');
  }

  function getCarImages(trip = {}) {
    return parseImageList(trip.auto_kepek || trip.auto_kepek_url || trip.car_images || trip.auto_kep_url || '');
  }

  function getPrimaryCarImage(trip = {}) {
    return getCarImages(trip)[0] || '';
  }

  function driverMiniMarkup(trip = {}, ratingHtml = '') {
    const avatar = getProfileImage(trip);
    const name = escapeHtml(trip.nev || 'Sofőr');
    const avatarHtml = avatar
      ? `<img class="driver-avatar driver-avatar-img" src="${avatar}" alt="${name}">`
      : `<div class="driver-avatar">${escapeHtml(getInitials(trip.nev || '?'))}</div>`;
    return `<div class="driver-mini">${avatarHtml}<div><strong>${name}</strong><span>${ratingHtml}</span></div></div>`;
  }

  function tripGalleryMarkup(trip = {}, compact = false) {
    const images = getCarImages(trip);
    if (!images.length) return '';
    const cls = compact ? 'trip-gallery trip-gallery-compact' : 'trip-gallery';
    return `<div class="${cls}">${images.slice(0, compact ? 1 : 3).map((src, idx) => `<img src="${src}" alt="Autó kép ${idx + 1}">`).join('')}</div>`;
  }

  function isOwnTrip(trip = {}) {
    const user = currentViewer.user;
    if (!user) return false;
    if (trip.user_id && user.id && String(trip.user_id) === String(user.id)) return true;
    const tripEmail = String(trip.email || '').toLowerCase();
    if (tripEmail && tripEmail === String(user.email || '').toLowerCase()) return true;
    const displayName = String(user?.user_metadata?.name || user?.user_metadata?.full_name || '').trim().toLowerCase();
    const emailName = String(user?.email || '').split('@')[0].trim().toLowerCase();
    const tripName = String(trip.nev || '').trim().toLowerCase();
    return !!tripName && (tripName === displayName || tripName === emailName);
  }

  function canManageTrip(trip = {}) {
    return !!(currentViewer.admin || isOwnTrip(trip));
  }

  function tripHasBookings(trip = {}) {
    if (typeof trip.has_bookings === 'boolean') return trip.has_bookings;
    if (Number.isFinite(Number(trip.booked_seats))) return Number(trip.booked_seats) > 0;
    const { total, free } = seatCounts(trip);
    return Math.max(0, total - free) > 0;
  }

  function ownerCanEditOrDeleteTrip(trip = {}) {
    return !!(!currentViewer.admin && isOwnTrip(trip) && !tripHasBookings(trip));
  }

  function buildGoogleMapsDirectionsUrl(origin, destination) {
    const from = [String(origin || '').trim(), 'Magyarország'].filter(Boolean).join(', ');
    const to = [String(destination || '').trim(), 'Magyarország'].filter(Boolean).join(', ');
    return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(from)}&destination=${encodeURIComponent(to)}&travelmode=driving`;
  }

  function normalizePlaceName(value = '') {
    const v = String(value || '').trim();
    if (!v) return '';
    const low = v.toLowerCase();
    if (low.includes('budapest nyugati')) return 'Budapest Nyugati pályaudvar';
    if (low.includes('budapest keleti')) return 'Budapest Keleti pályaudvar';
    if (low.includes('nyíregyháza vasut állomás') || low.includes('nyiregyhaza vasut allomas')) return 'Nyíregyháza vasútállomás';
    return v;
  }

  function tripSortValue(trip) {
    const d = makeDateTime(trip?.datum, trip?.ido);
    return d ? d.getTime() : Number.MAX_SAFE_INTEGER;
  }

  function isTripFull(trip) {
    return seatCounts(trip).free <= 0;
  }

  function isTripSoonExpiring(trip, days = 3) {
    const d = makeDateTime(trip?.datum, trip?.ido);
    if (!d) return false;
    const diff = d.getTime() - Date.now();
    return diff > 0 && diff <= days * 24 * 60 * 60 * 1000;
  }

  async function logEmailEvent(entry = {}) {
    try {
      await sb.from('email_naplo').insert([{ tipus: entry.tipus || 'ismeretlen', cel_email: entry.cel_email || '', statusz: entry.statusz || (entry.sikeres ? 'elkuldve' : 'sikertelen'), sikeres: !!entry.sikeres, targy: entry.targy || '', payload: entry.payload || {} }]);
    } catch (_) {}
  }

  async function fetchEmailLogs() {
    try {
      const { data, error } = await sb.from('email_naplo').select('*').order('created_at', { ascending: false }).limit(200);
      if (error) return [];
      return data || [];
    } catch (_) {
      return [];
    }
  }

  function shareCanvasDataUrl(trip) {
    const c = document.createElement('canvas');
    c.width = 1200; c.height = 630;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 1200, 630);
    g.addColorStop(0, '#0d1d39');
    g.addColorStop(1, '#10254a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 1200, 630);
    ctx.fillStyle = 'rgba(255,255,255,.08)';
    ctx.fillRect(48, 48, 1104, 534);
    ctx.fillStyle = '#eef4ff';
    ctx.font = 'bold 62px Arial';
    ctx.fillText(`${trip.indulas} → ${trip.erkezes}`, 72, 160);
    ctx.font = '34px Arial';
    ctx.fillStyle = '#dbe8ff';
    ctx.fillText(`${trip.datum} • ${trip.ido}`, 72, 235);
    ctx.fillText(`${fmtCurrency(trip.ar)} Ft / fő`, 72, 290);
    ctx.fillText(`${seatCounts(trip).free} szabad hely`, 72, 345);
    ctx.font = '30px Arial';
    ctx.fillStyle = '#b8c9ea';
    ctx.fillText(APP_CONFIG.brandName + ' • ' + APP_CONFIG.siteUrl, 72, 560);
    return c.toDataURL('image/png');
  }

  async function shareTrip(trip) {
    const url = APP_CONFIG.siteUrl + 'trip.html?id=' + trip.id;
    const text = `${trip.indulas} → ${trip.erkezes} | ${trip.datum} ${trip.ido} | ${fmtCurrency(trip.ar)} Ft / fő`;
    const dataUrl = shareCanvasDataUrl(trip);
    try {
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], 'fuvarvelunk-poszt.png', { type: 'image/png' });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ title: APP_CONFIG.brandName, text, url, files: [file] });
        return;
      }
    } catch (_) {}
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank');
  }

  async function uploadPublicFile(bucket, file, folder = 'uploads') {
    if (!file) return '';
    const ext = (String(file.name || '').split('.').pop() || 'jpg').toLowerCase();
    const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await sb.storage.from(bucket).upload(path, file, { upsert: false });
    if (error) throw error;
    const { data } = sb.storage.from(bucket).getPublicUrl(path);
    return data?.publicUrl || '';
  }

  function injectTripImageFields(form) {
    if (form.querySelector('[name="driverProfileImage"]')) return;
    const afterBankGrid = form.querySelector('[name="bankAccount"]')?.closest('.grid-3');
    const uploadWrap = document.createElement('div');
    uploadWrap.className = 'grid-2';
    uploadWrap.innerHTML = `
      <label><span>Sofőr profilkép</span><input name="driverProfileImage" type="file" accept="image/*"><small class="small-help">1 profilkép tölthető fel. A piros X-szel mentés előtt törölheted vagy cserélheted.</small><div id="driverProfilePreview" class="upload-preview upload-preview-single"></div></label>
      <label><span>Autó képei</span><input name="carImages" type="file" accept="image/*"><small class="small-help">Legfeljebb 3 autókép tölthető fel, egyesével is. A piros X-szel mentés előtt törölheted őket.</small><div id="carImagesPreview" class="upload-preview"></div></label>`;
    afterBankGrid?.insertAdjacentElement('afterend', uploadWrap);

    const profileInput = uploadWrap.querySelector('[name="driverProfileImage"]');
    const carInput = uploadWrap.querySelector('[name="carImages"]');
    const profilePreview = uploadWrap.querySelector('#driverProfilePreview');
    const carPreview = uploadWrap.querySelector('#carImagesPreview');

    form.__driverProfileFile = null;
    form.__carImageFiles = [];

    const createPreviewItem = (file, onRemove, altText) => {
      const item = document.createElement('div');
      item.className = 'upload-preview-item';
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      img.alt = altText;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'upload-remove-btn';
      remove.setAttribute('aria-label', 'Kép törlése');
      remove.textContent = '×';
      remove.addEventListener('click', () => {
        try { URL.revokeObjectURL(img.src); } catch (_) {}
        onRemove();
      });
      item.appendChild(img);
      item.appendChild(remove);
      return item;
    };

    const renderProfilePreview = () => {
      profilePreview.innerHTML = '';
      if (!form.__driverProfileFile) return;
      profilePreview.appendChild(createPreviewItem(form.__driverProfileFile, () => {
        form.__driverProfileFile = null;
        profileInput.value = '';
        renderProfilePreview();
      }, 'Sofőr profilkép'));
    };

    const renderCarPreview = () => {
      carPreview.innerHTML = '';
      (form.__carImageFiles || []).forEach((file, index) => {
        carPreview.appendChild(createPreviewItem(file, () => {
          form.__carImageFiles = form.__carImageFiles.filter((_, i) => i !== index);
          carInput.value = '';
          renderCarPreview();
        }, `Autó kép ${index + 1}`));
      });
    };

    profileInput.addEventListener('change', () => {
      const file = profileInput.files?.[0] || null;
      form.__driverProfileFile = file;
      renderProfilePreview();
      profileInput.value = '';
    });

    carInput.addEventListener('change', () => {
      const incoming = Array.from(carInput.files || []);
      if (!incoming.length) return;
      const freeSlots = Math.max(0, 3 - form.__carImageFiles.length);
      incoming.slice(0, freeSlots).forEach(file => form.__carImageFiles.push(file));
      if (incoming.length > freeSlots) alert('Legfeljebb 3 autókép tölthető fel.');
      renderCarPreview();
      carInput.value = '';
    });
  }

  function formatHumanDate(dateValue) {
    if (!dateValue) return 'hamarosan';
    try {
      return new Intl.DateTimeFormat('hu-HU', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(dateValue));
    } catch (_) {
      return dateValue;
    }
  }

  function generateTripNote(data) {
    const parts = [];
    if (data.carType) parts.push(`Az utat egy ${data.carType} autóval vállalom.`);
    if (data.freeSeats) parts.push(`${data.freeSeats} szabad hely van az autóban.`);
    parts.push('Pontos indulási helyet és részleteket egyeztetés után küldök.');
    if (data.paymentText) parts.push(`Fizetés: ${data.paymentText}.`);
    parts.push('Korrekt, pontos utasokat várok.');
    return parts.join(' ');
  }

  function generateTripAdCopy(data) {
    const when = data.date ? `${formatHumanDate(data.date)}${data.time ? ' ' + data.time : ''}` : 'egyeztetés szerint';
    const header = `🚗 ${data.origin || 'Indulás'} → ${data.destination || 'Érkezés'} fuvar`;
    const lines = [
      header,
      `📅 Időpont: ${when}`,
      data.price ? `💰 Ár: ${fmtCurrency(data.price)} Ft / fő` : '',
      data.freeSeats ? `🪑 Szabad helyek: ${data.freeSeats}` : '',
      data.carType ? `🚙 Autó: ${data.carType}` : '',
      data.paymentText ? `💳 Fizetés: ${data.paymentText}` : '',
      '📩 Foglalás és érdeklődés: FuvarVelünk oldalon keresztül',
      data.note ? `ℹ️ Megjegyzés: ${data.note}` : ''
    ].filter(Boolean);
    return lines.join('\n');
  }

  function generateDriverQuestion(data) {
    const tripLine = data.tripSummary ? `${data.tripSummary} kapcsán érdeklődnék.` : 'Az egyik meghirdetett fuvaroddal kapcsolatban érdeklődnék.';
    return [
      `Szia ${data.driverName || ''}!`,
      '',
      tripLine,
      'Szeretném megkérdezni, hogy van-e még szabad hely, illetve hol lenne a pontos indulási pont.',
      'Ha lehetséges, kérlek írd meg azt is, hogy csomagot lehet-e hozni.',
      '',
      'Köszönöm előre is!'
    ].join('\n');
  }

  function copyTextValue(value, okMsgHost) {
    if (!value) return;
    navigator.clipboard?.writeText(value).then(() => {
      if (okMsgHost) okMsgHost.textContent = 'Kimásolva a vágólapra.';
    }).catch(() => {
      if (okMsgHost) okMsgHost.textContent = 'A másolás nem sikerült, jelöld ki kézzel.';
    });
  }

  function selectedPaymentText(form) {
    return Array.from(form.querySelectorAll('input[name="fizetesiMod"]:checked')).map(el => el.parentElement?.textContent?.trim() || '').filter(Boolean).join(', ');
  }

  function mountTripAiTools(form) {
    const noteField = form.querySelector('[name="note"]');
    if (!noteField || document.getElementById('tripAiTools')) return;
    const host = document.createElement('div');
    host.id = 'tripAiTools';
    host.className = 'ai-tools';
    host.innerHTML = `
      <div class="card" style="padding:16px 18px">
        <div class="eyebrow">AI szövegsegéd</div>
        <p class="ai-help">Egy kattintással készít megjegyzést és Facebook / hirdetési szöveget a fuvar adataiból.</p>
        <div class="ai-inline-actions">
          <button type="button" class="ai-btn" id="aiNoteBtn">AI megjegyzés</button>
          <button type="button" class="ai-btn" id="aiAdBtn">AI hirdetési szöveg</button>
          <button type="button" class="ai-btn" id="aiCopyAdBtn">Szöveg másolása</button>
        </div>
        <label style="display:block;margin-top:12px"><span>Generált hirdetési szöveg</span><textarea id="tripAdCopy" class="ai-output" readonly placeholder="Itt jelenik meg a kész fuvarhirdetés szövege."></textarea></label>
        <div id="tripAiMsg" class="form-message"></div>
      </div>`;
    const gridWrap = noteField.closest('.grid-2') || noteField.parentElement;
    gridWrap.insertAdjacentElement('afterend', host);

    const readData = () => ({
      origin: form.querySelector('[name="origin"]')?.value.trim(),
      destination: form.querySelector('[name="destination"]')?.value.trim(),
      date: form.querySelector('[name="date"]')?.value,
      time: form.querySelector('[name="time"]')?.value,
      price: form.querySelector('[name="price"]')?.value,
      freeSeats: form.querySelector('[name="szabadHely"]')?.value,
      carType: form.querySelector('[name="carType"]')?.value.trim(),
      paymentText: selectedPaymentText(form),
      note: noteField.value.trim()
    });
    const adCopy = host.querySelector('#tripAdCopy');
    const aiMsg = host.querySelector('#tripAiMsg');
    host.querySelector('#aiNoteBtn')?.addEventListener('click', () => {
      const generated = generateTripNote(readData());
      noteField.value = generated;
      aiMsg.textContent = 'Megjegyzés kitöltve.';
    });
    host.querySelector('#aiAdBtn')?.addEventListener('click', () => {
      const data = readData();
      if (!data.origin || !data.destination) {
        aiMsg.textContent = 'Előbb töltsd ki legalább az indulás és érkezés mezőket.';
        return;
      }
      if (!noteField.value.trim()) noteField.value = generateTripNote(data);
      adCopy.value = generateTripAdCopy({ ...readData(), note: noteField.value.trim() });
      aiMsg.textContent = 'Hirdetési szöveg elkészült.';
    });
    host.querySelector('#aiCopyAdBtn')?.addEventListener('click', () => copyTextValue(adCopy.value, aiMsg));
  }

  function mountDriverQuestionAiTools(driverForm) {
    const messageField = driverForm.querySelector('[name="message"]');
    if (!messageField || document.getElementById('driverAiTools')) return;
    const host = document.createElement('div');
    host.id = 'driverAiTools';
    host.className = 'ai-tools';
    host.innerHTML = `
      <div class="ai-inline-actions">
        <button type="button" class="ai-btn" id="aiDriverQuestionBtn">AI üzenet javaslat</button>
        <button type="button" class="ai-btn" id="aiDriverCopyBtn">Üzenet másolása</button>
      </div>
      <div id="driverAiMsg" class="form-message"></div>`;
    messageField.parentElement.insertAdjacentElement('afterend', host);
    const msgHost = host.querySelector('#driverAiMsg');
    host.querySelector('#aiDriverQuestionBtn')?.addEventListener('click', () => {
      const params = new URLSearchParams(location.search);
      const driverName = driverForm.querySelector('[name="driverName"]')?.value || params.get('driverName') || 'Sofőr';
      const tripId = driverForm.querySelector('[name="tripId"]')?.value || params.get('tripId') || '';
      const tripSummary = tripId ? `A ${tripId}. azonosítójú fuvar` : '';
      messageField.value = generateDriverQuestion({ driverName, tripSummary });
      msgHost.textContent = 'Üzenetjavaslat beillesztve.';
    });
    host.querySelector('#aiDriverCopyBtn')?.addEventListener('click', () => copyTextValue(messageField.value, msgHost));
  }

  async function geocodePlace(place) {
    if (!place) return null;
    const key = 'geo:' + place.toLowerCase();
    try {
      const cached = sessionStorage.getItem(key);
      if (cached) return JSON.parse(cached);
    } catch (_) {}
    const normalized = normalizePlaceName(place);
    const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=' + encodeURIComponent(normalized + ', Hungary');
    const res = await fetch(url, { headers: { 'Accept-Language': 'hu' } });
    const data = await res.json();
    const first = data && data[0] ? { lat: Number(data[0].lat), lon: Number(data[0].lon) } : null;
    if (first) {
      try { sessionStorage.setItem(key, JSON.stringify(first)); } catch (_) {}
    }
    return first;
  }

  async function focusRoute(origin, destination) {
    if (!document.getElementById('tripsMap')) return;
    if (!activeMap) {
      activeMap = L.map('tripsMap').setView([47.4979, 19.0402], 7);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(activeMap);
    }
    setTimeout(() => { try { activeMap.invalidateSize(); } catch(_) {} }, 60);
    activeMarkers.forEach(m => activeMap.removeLayer(m));
    activeMarkers = [];
    if (activeLine) activeMap.removeLayer(activeLine);
    const a = await geocodePlace(origin);
    const b = await geocodePlace(destination);
    if (!a && !b) return;
    const points = [];
    if (a) {
      const m = L.marker([a.lat, a.lon]).addTo(activeMap).bindPopup('Indulás: ' + origin);
      activeMarkers.push(m);
      points.push([a.lat, a.lon]);
    }
    if (b) {
      const m = L.marker([b.lat, b.lon]).addTo(activeMap).bindPopup('Érkezés: ' + destination);
      activeMarkers.push(m);
      points.push([b.lat, b.lon]);
    }
    if (points.length === 2) {
      activeLine = L.polyline(points, { color: '#63a4ff', weight: 4 }).addTo(activeMap);
      activeMap.fitBounds(activeLine.getBounds(), { padding: [32, 32] });
    } else if (points.length === 1) {
      activeMap.setView(points[0], 9);
    }
  }

  async function fetchSettings() {
    try {
      const { data } = await sb.from(tableSettings).select('*').order('id', { ascending: true }).limit(1).maybeSingle();
      return data || null;
    } catch (_) {
      return null;
    }
  }

  async function applySettings() {
    const s = await fetchSettings();
    const visibleEmail = s?.contact_email || APP_CONFIG.contactEmail;
    document.querySelectorAll('[data-setting="siteName"]').forEach(el => el.textContent = APP_CONFIG.brandName);
    document.querySelectorAll('[data-setting="companyName"]').forEach(el => el.textContent = APP_CONFIG.companyName);
    document.querySelectorAll('[data-setting="email"]').forEach(el => el.textContent = visibleEmail);
    document.querySelectorAll('[data-setting="adminEmail"]').forEach(el => el.textContent = s?.admin_email || APP_CONFIG.adminEmail);
    document.querySelectorAll('[data-brand]').forEach(el => el.textContent = APP_CONFIG.brandName);
  }

  async function fetchApprovedTrips(filters = {}) {
    let q = sb.from(tableTrips).select('*').eq('statusz', 'Jóváhagyva').order('datum', { ascending: true }).order('ido', { ascending: true });
    if (filters.origin) q = q.ilike('indulas', `%${filters.origin}%`);
    if (filters.destination) q = q.ilike('erkezes', `%${filters.destination}%`);
    if (filters.date) q = q.eq('datum', filters.date);
    const { data, error } = await q;
    if (error) throw error;
    let trips = (data || []).filter(t => !isTripExpired(t));
    if (filters.maxPrice) trips = trips.filter(t => Number(t.ar || 0) <= Number(filters.maxPrice));
    if (filters.onlyFree) trips = trips.filter(t => !isTripFull(t));
    if (filters.dayPreset === 'today') {
      const today = new Date().toISOString().slice(0, 10);
      trips = trips.filter(t => t.datum === today);
    } else if (filters.dayPreset === 'tomorrow') {
      const d = new Date(); d.setDate(d.getDate() + 1);
      trips = trips.filter(t => t.datum === d.toISOString().slice(0, 10));
    }
    const sort = filters.sort || 'time_asc';
    trips.sort((a, b) => sort === 'time_desc' ? tripSortValue(b) - tripSortValue(a) : sort === 'price_asc' ? Number(a.ar || 0) - Number(b.ar || 0) : sort === 'price_desc' ? Number(b.ar || 0) - Number(a.ar || 0) : tripSortValue(a) - tripSortValue(b));
    return trips;
  }

  async function fetchAllTrips() {
    const { data, error } = await sb.from(tableTrips).select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function fetchTripById(id) {
    const { data, error } = await sb.from(tableTrips).select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data || null;
  }

  async function fetchBookings() {
    const { data, error } = await sb.from(tableBookings).select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }


  function bookingCountsMap(bookings = []) {
    const map = {};
    bookings.forEach(b => {
      const status = String(b.foglalasi_allapot || '').trim().toLowerCase();
      if (['elutasítva', 'elutasitva', 'törölve', 'torolve', 'lemondva', 'cancelled'].includes(status)) return;
      const key = String(b.fuvar_id ?? b.trip_id ?? '');
      if (!key) return;
      const seats = Number(b.foglalt_helyek || b.helyek || 1) || 1;
      map[key] = (map[key] || 0) + seats;
    });
    return map;
  }

  async function enrichTripsWithBookings(trips) {
    if (!trips || !trips.length) return trips || [];
    let bookings = [];
    try {
      bookings = await fetchBookings();
    } catch (_) {
      bookings = [];
    }
    const counts = bookingCountsMap(bookings);
    return trips.map(trip => ({
      ...trip,
      booked_seats: Number(counts[String(trip.id)] || 0),
      has_bookings: Number(counts[String(trip.id)] || 0) > 0
    }));
  }

  async function fetchRatingsForTrip(tripId, tipus = null) {
    let q = sb.from(tableRatings).select('*').eq('fuvar_id', tripId).order('created_at', { ascending: false });
    if (tipus) q = q.eq('tipus', tipus);
    const { data, error } = await q;
    if (error) return [];
    return data || [];
  }

  async function fetchDriverRatingMap() {
    const { data, error } = await sb.from(viewDriverRatings).select('*');
    if (error || !data) return {};
    const map = {};
    for (const row of data) map[String(row.sofor_email || '').toLowerCase()] = row;
    return map;
  }

  async function enrichTripsWithRatings(trips) {
    const ratingMap = await fetchDriverRatingMap();
    return trips.map(trip => {
      const key = String(trip.email || '').toLowerCase();
      const row = ratingMap[key] || null;
      return { ...trip, sofor_atlag: Number(row?.atlag || trip.sofor_ertekeles || 0), sofor_ertekeles_db: Number(row?.darab || trip.ertekeles_db || 0) };
    });
  }

  function buildRecommendations(trips, filters) {
    const o = cityNorm(filters.origin);
    const d = cityNorm(filters.destination);
    return trips.filter(t => {
      const ti = cityNorm(t.indulas);
      const te = cityNorm(t.erkezes);
      if (o && d) return (te.includes(d) || ti.includes(o)) && !(ti.includes(o) && te.includes(d));
      if (o) return te.includes(o) || ti.includes(o);
      if (d) return te.includes(d) || ti.includes(d);
      return false;
    }).slice(0, 4);
  }

  function notificationNotice(kind) {
    if (APP_CONFIG.notificationFunctionUrl) return '';
    const label = kind === 'trip' ? 'Új fuvar' : 'Új foglalás';
    return `<div class="notice" style="margin-top:12px">${label} e-mail értesítéshez a Supabase Edge Function URL-t még be kell állítani a <code>js/config.js</code> fájlban.</div>`;
  }

  async function sendNotificationMail(kind, payload) {
    if (!APP_CONFIG.notificationFunctionUrl) return false;
    let success = false;
    try {
      const adminEmail = await AppAuth.fetchAdminEmail();
      const res = await fetch(APP_CONFIG.notificationFunctionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, payload, adminEmail })
      });
      let data = null;
      try { data = await res.json(); } catch (_) {}
      success = !!(res.ok && (!data || data.ok !== false));
      await logEmailEvent({ tipus: kind, cel_email: kind === 'uj_foglalas' ? (payload.sofor_email || '') : (payload.utas_email || adminEmail), sikeres: success, targy: data?.subject || kind, payload: { ...payload, response: data || null } });
      return success;
    } catch (_) {
      await logEmailEvent({ tipus: kind, cel_email: payload?.sofor_email || payload?.utas_email || '', sikeres: false, statusz: 'sikertelen', targy: kind, payload });
      return false;
    }
  }

  function isSpamBlocked(actionKey, limitSeconds = 20) {
    try {
      const key = `fv_rate_${actionKey}`;
      const last = Number(localStorage.getItem(key) || 0);
      const now = Date.now();
      if (last && now - last < limitSeconds * 1000) return true;
      localStorage.setItem(key, String(now));
      return false;
    } catch (_) {
      return false;
    }
  }

  function validateHuman(form) {
    const honeypot = form.querySelector('[name="website"]');
    if (honeypot && honeypot.value.trim()) throw new Error('A kérés spamnek tűnik.');
  }

  function tripCard(trip, admin = false) {
    const { total, free } = seatCounts(trip);
    const paymentMethods = (trip.fizetesi_modok && Array.isArray(trip.fizetesi_modok)
      ? trip.fizetesi_modok
      : ['transfer', 'cash']).map(m => m === 'cash' ? 'Készpénz a sofőrnek' : 'Utalás a sofőrnek').join(' · ');
    const ratingHtml = starRating(trip.sofor_atlag || trip.sofor_ertekeles || 0, trip.sofor_ertekeles_db || 0);
    const fullBadge = free <= 0 ? '<span class="status rejected">Betelt</span><span class="status info">Már nem foglalható</span>' : '';
    const ownTrip = !admin && isOwnTrip(trip);
    const manager = !admin && ownerCanEditOrDeleteTrip(trip);
    const ownTripNotice = ownTrip
      ? '<div class="notice" style="margin-top:12px">Ez a saját fuvarod. A foglalásokat lent tudod kezelni.</div>'
      : '';
    return `
      <article class="card trip-card" data-trip-id="${trip.id}">
        <div class="trip-main">
          ${tripGalleryMarkup(trip)}
          <div class="inline-pills"><span class="pill">${escapeHtml(trip.indulas)} → ${escapeHtml(trip.erkezes)}</span>${statusBadge(trip.statusz || 'Jóváhagyva')} ${fullBadge}</div>
          <h3>${escapeHtml(trip.indulas)} → ${escapeHtml(trip.erkezes)}</h3>
          ${driverMiniMarkup(trip, ratingHtml)}
          <div class="trip-meta">
            <span><strong>Dátum:</strong> ${escapeHtml(trip.datum || '')}</span>
            <span><strong>Idő:</strong> ${escapeHtml(trip.ido || '')}</span>
            <span><strong>Ár:</strong> ${fmtCurrency(trip.ar)} Ft / fő</span>
            <span><strong>Autó:</strong> ${escapeHtml(trip.auto_tipus || 'Személyautó')}</span>
            <span><strong>Férőhely:</strong> ${total}</span>
          </div>
          ${seatBar(free, total)}
          ${trip.megjegyzes ? `<p>${escapeHtml(trip.megjegyzes)}</p>` : ''}
          ${ownTripNotice}
          <div class="trip-contact">
            <div><strong>Sofőr:</strong> ${escapeHtml(trip.nev || '')}</div>
            <div><strong>Kapcsolat:</strong> ${escapeHtml(trip.email || '')}${trip.telefon ? ' · ' + escapeHtml(trip.telefon) : ''}</div>
            <div><strong>Elfogadott fizetés:</strong> ${escapeHtml(paymentMethods)}</div>
            ${trip.bankszamla ? `<div><strong>Utalási adat:</strong> ${escapeHtml(trip.bankszamla)}</div>` : ''}
          </div>
        </div>
        <div>
          <div class="card info-card">
            <div class="small-help">Útvonal és megosztás</div>
            <p style="margin:8px 0 0;color:var(--muted)">Térkép, Google útvonal és Facebook-megosztás.</p>
            <div class="inline-pills" style="margin-top:12px">
              <button class="btn btn-ghost js-map-focus" data-origin="${escapeHtml(trip.indulas)}" data-destination="${escapeHtml(trip.erkezes)}">Térkép</button>
              <a class="btn btn-ghost" target="_blank" rel="noopener" href="${buildGoogleMapsDirectionsUrl(trip.indulas, trip.erkezes)}">Google útvonal</a>
              <button class="btn btn-ghost js-share-trip" data-trip='${encodeURIComponent(JSON.stringify(trip))}'>Megosztás</button>
              <a class="btn btn-ghost" href="trip.html?id=${trip.id}">Részletek</a>
              <a class="btn btn-ghost" href="driver.html?name=${encodeURIComponent(trip.nev || '')}&email=${encodeURIComponent(trip.email || '')}">Sofőr profil</a>
            </div>
          </div>
        </div>
        <div class="trip-actions">
          ${admin ? `
            <button class="btn btn-success js-trip-approve" data-id="${trip.id}">Jóváhagyás</button>
            <button class="btn btn-warning js-trip-pending" data-id="${trip.id}">Függőben</button>
            <button class="btn btn-secondary js-trip-edit" data-id="${trip.id}">Admin szerkesztés</button>
            <button class="btn btn-danger js-trip-delete" data-id="${trip.id}">Admin törlés</button>
          ` : ownTrip ? (manager ? `
            <button class="btn btn-secondary js-trip-edit" data-id="${trip.id}">Saját fuvar szerkesztése</button>
            <button class="btn btn-danger js-trip-delete" data-id="${trip.id}">Saját fuvar törlése</button>
          ` : `
            <div class="notice">Ez a saját fuvarod. Foglalásokat lent tudod kezelni.</div>
          `) : `
            <button class="btn btn-primary js-book-trip" data-trip='${encodeURIComponent(JSON.stringify(trip))}' ${free < 1 ? 'disabled' : ''}>${free < 1 ? 'Betelt' : 'Foglalás'}</button>
            <a class="btn btn-secondary" href="kapcsolat.html?tripId=${trip.id}&driverName=${encodeURIComponent(trip.nev || '')}&driverEmail=${encodeURIComponent(trip.email || '')}">Kérdés a sofőrnek</a>
          `}
        </div>
      </article>`;
  }


  function tripListCard(trip) {
    const { total, free } = seatCounts(trip);
    const ratingHtml = starRating(trip.sofor_atlag || trip.sofor_ertekeles || 0, trip.sofor_ertekeles_db || 0);
    const full = free <= 0;
    const ownTrip = isOwnTrip(trip);
    const manager = ownerCanEditOrDeleteTrip(trip);
    const isAdmin = !!currentViewer.admin;
    return `
      <article class="card trip-compact" data-trip-id="${trip.id}">
        ${tripGalleryMarkup(trip, true)}
        <div class="inline-pills"><span class="pill">${escapeHtml(trip.indulas)} → ${escapeHtml(trip.erkezes)}</span>${statusBadge(trip.statusz || 'Jóváhagyva')} ${full ? '<span class="status rejected">Betelt</span><span class="status info">Már nem foglalható</span>' : ''}</div>
        <h3>${escapeHtml(trip.indulas)} → ${escapeHtml(trip.erkezes)}</h3>
        <p class="trip-compact-meta">${escapeHtml(trip.datum || '')} • ${escapeHtml(trip.ido || '')} • ${fmtCurrency(trip.ar)} Ft / fő</p>
        ${driverMiniMarkup(trip, ratingHtml)}
        ${seatBar(free, total)}
        ${(isAdmin || manager) && tripHasBookings(trip) ? `<div class="inline-pills" style="margin:10px 0 0"><span class="status info">Van foglalás ezen a fuvaron</span></div>` : ''}
        <div class="trip-tools">
          <a class="btn btn-ghost" href="trip.html?id=${trip.id}${(isAdmin || manager) ? '#driverBookingsSection' : ''}">Részletek${(isAdmin || manager) && tripHasBookings(trip) ? ' / foglalások' : ''}</a>
          <button class="btn btn-ghost js-map-focus" data-origin="${escapeHtml(trip.indulas)}" data-destination="${escapeHtml(trip.erkezes)}">Térkép</button>
          <a class="btn btn-ghost" target="_blank" rel="noopener" href="${buildGoogleMapsDirectionsUrl(trip.indulas, trip.erkezes)}">Google útvonal</a>
          <button class="btn btn-ghost js-share-trip" data-trip='${encodeURIComponent(JSON.stringify(trip))}'>Megosztás</button>
          ${isAdmin ? `<button class="btn btn-secondary js-trip-edit" data-id="${trip.id}">Admin szerkesztés</button><button class="btn btn-danger js-trip-delete" data-id="${trip.id}">Admin törlés</button>` : ownTrip ? (manager ? `<button class="btn btn-secondary js-trip-edit" data-id="${trip.id}">Szerkesztés</button><button class="btn btn-danger js-trip-delete" data-id="${trip.id}">Törlés</button>` : `<div class="notice">Ez a saját fuvarod.</div>`) : `<button class="btn btn-primary js-book-trip" data-trip='${encodeURIComponent(JSON.stringify(trip))}' ${full ? 'disabled' : ''}>${full ? 'Betelt' : 'Foglalás'}</button><a class="btn btn-secondary" href="kapcsolat.html?tripId=${trip.id}&driverName=${encodeURIComponent(trip.nev || '')}&driverEmail=${encodeURIComponent(trip.email || '')}">Kérdés a sofőrnek</a>`}
        </div>
      </article>`;
  }

  function bookingIsLocked(b = {}) {
    const foglalas = String(b.foglalasi_allapot || '').trim().toLowerCase();
    const fizetes = String(b.fizetesi_allapot || '').trim().toLowerCase();
    return ['jóváhagyva', 'jovahagyva'].includes(foglalas) && fizetes === 'fizetve';
  }

  function bookingCard(b, tripMap = {}, options = {}) {
    const trip = tripMap[String(b.fuvar_id ?? b.trip_id ?? '')] || {};
    const compact = !!options.compact;
    const status = String(b.foglalasi_allapot || 'Új').toLowerCase();
    const isLocked = bookingIsLocked(b);
    const showApprove = !['jóváhagyva','jovahagyva','elutasítva','elutasitva'].includes(status);
    const showPaid = !isLocked && String(b.fizetesi_allapot || '').toLowerCase() !== 'fizetve';
    const showDelete = !!currentViewer.admin || !isLocked;
    return `
      <article class="card admin-item${compact ? ' driver-booking-card' : ''}">
        <div>
          <div class="inline-pills">${statusBadge(b.foglalasi_allapot || 'Új')} ${statusBadge(b.fizetesi_allapot || 'Függőben')}</div>
          <h3 style="margin:12px 0 8px">${escapeHtml(trip.indulas || '')} → ${escapeHtml(trip.erkezes || '')}</h3>
          <div class="trip-meta">
            <span><strong>Foglaló:</strong> ${escapeHtml(b.nev || b.utas_nev || '')}</span>
            <span><strong>E-mail:</strong> ${escapeHtml(b.email || b.utas_email || '')}</span>
            <span><strong>Telefon:</strong> ${escapeHtml(b.telefon || '')}</span>
            <span><strong>Helyek:</strong> ${escapeHtml(String(b.foglalt_helyek || 1))}</span>
          </div>
          <p><strong>Fizetési mód:</strong> ${b.fizetesi_mod === 'cash' ? 'Készpénz a sofőrnek' : 'Utalás a sofőrnek'}</p>
          ${b.megjegyzes ? `<p>${escapeHtml(b.megjegyzes)}</p>` : ''}
        </div>
        <div>
          <p><strong>Foglalás:</strong> ${escapeHtml(b.foglalasi_allapot || '')}</p>
          <p><strong>Fizetés:</strong> ${escapeHtml(b.fizetesi_allapot || '')}</p>
          <p><strong>Létrehozva:</strong> ${escapeHtml(String(b.created_at || '')).slice(0, 16).replace('T', ' ')}</p>
        </div>
        <div class="trip-actions">
          ${showApprove ? `<button class="btn btn-success js-booking-approve" data-id="${b.id}" data-trip-id="${b.fuvar_id ?? b.trip_id ?? ''}" data-seats="${b.foglalt_helyek || 1}">Jóváhagyás</button>` : ''}
          ${showPaid ? `<button class="btn btn-warning js-booking-paid" data-id="${b.id}">Fizetve</button>` : ''}
          ${showDelete ? `<button class="btn btn-danger js-booking-cancel" data-id="${b.id}">${showApprove ? 'Elutasítás / törlés' : 'Törlés'}</button>` : '<div class="notice">Ez a foglalás már véglegesített, nem törölhető.</div>'}
        </div>
      </article>`;
  }

  function bookingSummaryCard(b, tripMap = {}) {
    return bookingCard(b, tripMap, { compact: true });
  }

  function reviewCard(r) {
    return `<article class="review-card"><div class="review-head"><strong>${escapeHtml(r.user_name || 'Névtelen')}</strong><span>${starRating(r.csillag, 0)}</span></div><p>${escapeHtml(r.szoveg || '')}</p><small>${escapeHtml(String(r.created_at || '').slice(0, 10))}</small></article>`;
  }

  function openModal(html) {
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `<div class="card modal">${html}</div>`;
    wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.dataset.close === '1') wrap.remove(); });
    document.body.appendChild(wrap);
    return wrap;
  }

  async function submitTrip(form) {
    validateHuman(form);
    if (isSpamBlocked('trip_submit', 30)) throw new Error('Kérlek, várj egy kicsit az újabb beküldéssel.');
    const session = await AppAuth.getSession();
    const user = session?.user;
    const fd = new FormData(form);
    const totalSeats = Number(fd.get('osszHely') || 0);
    const freeSeats = Number(fd.get('szabadHely') || totalSeats || 0);
    const payment = Array.from(form.querySelectorAll('input[name="fizetesiMod"]:checked')).map(x => x.value === 'barion' ? 'transfer' : x.value);
    const profileFile = form.__driverProfileFile || form.querySelector('[name="driverProfileImage"]')?.files?.[0] || null;
    const carFiles = (form.__carImageFiles && Array.isArray(form.__carImageFiles) ? form.__carImageFiles : Array.from(form.querySelector('[name="carImages"]')?.files || [])).slice(0, 3);
    const profileUrl = profileFile ? await uploadPublicFile(profileBucket, profileFile, user?.id || 'anon-profile') : '';
    const carImageUrls = [];
    for (const file of carFiles) carImageUrls.push(await uploadPublicFile(carBucket, file, user?.id || 'anon-car'));
    const payload = {
      user_id: user?.id || null,
      nev: fd.get('driverName')?.toString().trim() || '',
      email: user?.email || fd.get('contactEmail')?.toString().trim() || '',
      telefon: fd.get('phone')?.toString().trim() || '',
      indulas: fd.get('origin')?.toString().trim() || '',
      erkezes: fd.get('destination')?.toString().trim() || '',
      datum: fd.get('date')?.toString() || '',
      ido: fd.get('time')?.toString() || '',
      helyek: freeSeats,
      szabad_helyek: freeSeats,
      osszes_hely: totalSeats,
      auto_helyek: totalSeats,
      auto_tipus: fd.get('carType')?.toString().trim() || '',
      ar: Number(fd.get('price') || 0),
      megjegyzes: fd.get('note')?.toString().trim() || '',
      statusz: 'Függőben',
      fizetesi_modok: payment.length ? payment : ['cash'],
      bankszamla: fd.get('bankAccount')?.toString().trim() || '',
      profil_kep_url: profileUrl,
      auto_kepek: carImageUrls,
      sofor_ertekeles: 0,
      ertekeles_db: 0
    };
    if (!payload.nev || !payload.indulas || !payload.erkezes) throw new Error('Tölts ki minden kötelező mezőt.');
    const { error } = await sb.from(tableTrips).insert([payload]);
    if (error) throw error;
    const mailOk = await sendNotificationMail('uj_fuvar', payload);
    return mailOk;
  }

  async function submitBooking(trip, form) {
    validateHuman(form);
    if (isSpamBlocked(`booking_${trip.id}`, 20)) throw new Error('Kérlek, várj egy kicsit az újabb foglalással.');
    const session = await AppAuth.getSession();
    const user = session?.user;
    const fd = new FormData(form);
    const seats = Number(fd.get('seats') || 1);
    const method = fd.get('paymentMethod')?.toString() || 'cash';
    const phone = fd.get('phone')?.toString().trim() || '';
    const note = fd.get('note')?.toString().trim() || '';
    const userEmail = (user?.email || '').trim();
    const tripEmail = String(trip?.email || '').trim();
    const freeNow = seatCounts(trip).free;
    const sameEmail = userEmail && tripEmail && userEmail.toLowerCase() === tripEmail.toLowerCase();
    const sameUser = !!(user?.id && trip?.user_id && String(user.id) === String(trip.user_id));
    if (sameEmail || sameUser) throw new Error('A saját fuvarodra nem foglalhatsz.');
    if (seats < 1) throw new Error('Legalább 1 helyet válassz.');
    if (seats > freeNow) throw new Error('Nincs ennyi szabad hely.');
    const { data: existingDup } = await sb.from(tableBookings).select('id').eq('fuvar_id', trip.id).eq('utas_email', userEmail).limit(1);
    if (existingDup && existingDup.length) throw new Error('Erre a fuvarra már van foglalásod.');
    const booking = {
      fuvar_id: trip.id,
      user_id: user?.id || null,
      nev: fd.get('name')?.toString().trim() || '',
      email: userEmail,
      telefon: phone,
      foglalt_helyek: seats,
      fizetesi_mod: method,
      fizetesi_allapot: method === 'cash' ? 'Készpénz a sofőrnek' : 'Fizetésre vár',
      foglalasi_allapot: 'Új',
      megjegyzes: note,
      utas_email: userEmail,
      utas_nev: fd.get('name')?.toString().trim() || ''
    };
    const { error } = await sb.from(tableBookings).insert([booking]);
    if (error) throw error;
    const payload = { ...booking, sofor_email: trip.email, sofor_nev: trip.nev, indulas: trip.indulas, erkezes: trip.erkezes, datum: trip.datum, ido: trip.ido, fizetesi_mod_text: method === 'cash' ? 'Készpénz a sofőrnek' : 'Utalás a sofőrnek' };
    const mailOk = await sendNotificationMail('uj_foglalas', payload);
    const passengerMailOk = await sendNotificationMail('utas_visszaigazolas', payload);
    return { ...booking, __mailOk: mailOk, __passengerMailOk: passengerMailOk };
  }

  async function submitRating(trip, form, tipus) {
    validateHuman(form);
    if (isSpamBlocked(`rating_${trip.id}_${tipus}`, 20)) throw new Error('Kérlek, várj egy kicsit az újabb értékeléssel.');
    const session = await AppAuth.getSession();
    const user = session?.user;
    if (!user) throw new Error('Értékeléshez be kell jelentkezned.');
    const fd = new FormData(form);
    const rating = Number(fd.get('csillag') || 0);
    const text = fd.get('szoveg')?.toString().trim() || '';
    const name = fd.get('name')?.toString().trim() || user?.user_metadata?.name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Felhasználó';
    const userEmail = (user?.email || '').trim().toLowerCase();
    const tripEmail = (trip?.email || '').trim().toLowerCase();
    if (rating < 1 || rating > 5) throw new Error('1 és 5 közötti csillagot adj meg.');
    if (userEmail && tripEmail && userEmail === tripEmail) throw new Error('A saját fuvarodat nem értékelheted.');
    const payload = {
      fuvar_id: trip.id,
      user_email: user?.email || '',
      user_name: name,
      csillag: rating,
      szoveg: text || null,
      tipus
    };
    const { error } = await sb.from(tableRatings).insert([payload]);
    if (error) {
      const msg = String(error.message || '').toLowerCase();
      if (msg.includes('duplicate') || msg.includes('unique')) throw new Error('Ezt a fuvart ebből a típusból már értékelted.');
      throw error;
    }
  }

  async function bindGlobalActions() {
    document.body.addEventListener('click', async (e) => {
      const mapBtn = e.target.closest('.js-map-focus');
      if (mapBtn) {
        await focusRoute(mapBtn.dataset.origin, mapBtn.dataset.destination);
        document.getElementById('tripsMap')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      const shareBtn = e.target.closest('.js-share-trip');
      if (shareBtn) {
        await shareTrip(JSON.parse(decodeURIComponent(shareBtn.dataset.trip)));
        return;
      }
      const bookBtn = e.target.closest('.js-book-trip');
      if (bookBtn) {
        const ok = await AppAuth.requireAuth('fuvarok.html');
        if (!ok) return;
        const trip = JSON.parse(decodeURIComponent(bookBtn.dataset.trip));
        const session = await AppAuth.getSession();
        const user = session?.user || null;
        const userEmail = String(user?.email || '').trim();
        const tripEmail = String(trip?.email || '').trim();
        const sameEmail = userEmail && tripEmail && userEmail.toLowerCase() === tripEmail.toLowerCase();
        const sameUser = !!(user?.id && trip?.user_id && String(user.id) === String(trip.user_id));
        if (sameEmail || sameUser) {
          alert('A saját fuvarodra nem foglalhatsz.');
          return;
        }
        const existingBooking = await fetchPassengerBookingForTrip(trip.id, userEmail);
        if (existingBooking) {
          openModal(`
            <div class="section-head"><div><span class="eyebrow">Saját foglalásod</span><h2 style="margin:8px 0 0">${escapeHtml(trip.indulas)} → ${escapeHtml(trip.erkezes)}</h2></div><button class="btn btn-secondary" data-close="1">Bezárás</button></div>
            ${buildPassengerBookingStatusSection(existingBooking, trip)}
          `);
          return;
        }
        const wrap = openModal(`
          <div class="section-head"><div><span class="eyebrow">Foglalás</span><h2 style="margin:8px 0 0">${escapeHtml(trip.indulas)} → ${escapeHtml(trip.erkezes)}</h2></div><button class="btn btn-secondary" data-close="1">Bezárás</button></div>
          <form id="bookingForm" class="form-stack">
            <input type="text" name="website" class="hidden" autocomplete="off" tabindex="-1">
            <div class="grid-2">
              <label><span>Név</span><input name="name" required></label>
              <label><span>E-mail</span><input value="${escapeHtml(session?.user?.email || '')}" disabled></label>
            </div>
            <div class="grid-2">
              <label><span>Telefonszám</span><input name="phone" required></label>
              <label><span>Foglalt helyek</span><input name="seats" type="number" min="1" max="${seatCounts(trip).free}" value="1" required></label>
            </div>
            <div class="grid-2">
              <label><span>Fizetési mód</span><select name="paymentMethod"><option value="transfer">Utalás a sofőrnek</option><option value="cash">Készpénz a sofőrnek</option></select></label>
              <label><span>Megjegyzés</span><input name="note" placeholder="pl. 1 nagy bőrönd"></label>
            </div>
            <div class="notice warn">A fizetés közvetlenül a sofőrnek történik. A foglalásról a sofőr/admin e-mailt kaphat, ha a szerveroldali értesítés be van állítva.</div>
            <div class="form-message" id="bookingMsg"></div>
            <button class="btn btn-primary" type="submit">Foglalás rögzítése</button>
          </form>
        `);
        wrap.querySelector('#bookingForm').addEventListener('submit', async ev => {
          ev.preventDefault();
          const msg = wrap.querySelector('#bookingMsg');
          msg.textContent = 'Mentés...';
          try {
            const booking = await submitBooking(trip, ev.currentTarget);
            msg.textContent = booking.__mailOk
              ? (booking.__passengerMailOk ? 'Foglalás rögzítve. A sofőr és az utas visszaigazoló e-mailje is elindult.' : 'Foglalás rögzítve. A sofőr e-mailje elindult, de az utas visszaigazolása nem ment ki.')
              : 'Foglalás rögzítve, de az e-mail értesítés nem ment ki. Ellenőrizd a Supabase Edge Function logokat és a Resend beállításokat.';
            setTimeout(() => location.reload(), 900);
          } catch (err) {
            msg.textContent = err.message || 'Nem sikerült a foglalás.';
          }
        });
        return;
      }
      const editTripBtn = e.target.closest('.js-trip-edit');
      if (editTripBtn) {
        const trip = await fetchTripById(editTripBtn.dataset.id);
        if (!trip || !canManageTrip(trip)) return;
        if (!currentViewer.admin) {
          const { count, error: countErr } = await sb.from(tableBookings).select('id', { count: 'exact', head: true }).eq('fuvar_id', trip.id);
          if (!countErr && Number(count || 0) > 0) {
            alert('Ez a fuvar már foglalást kapott, ezért már nem szerkeszthető. Kérlek, adminnal módosíttasd.');
            return;
          }
        }
        const wrap = openModal(`
          <div class="section-head"><div><span class="eyebrow">Fuvar szerkesztése</span><h2 style="margin:8px 0 0">${escapeHtml(trip.indulas)} → ${escapeHtml(trip.erkezes)}</h2></div><button class="btn btn-secondary" data-close="1">Bezárás</button></div>
          <form id="tripEditForm" class="form-stack">
            <div class="grid-2"><label><span>Sofőr neve</span><input name="driverName" value="${escapeHtml(trip.nev || '')}" required></label><label><span>Kapcsolati e-mail</span><input name="contactEmail" value="${escapeHtml(trip.email || '')}" required></label></div>
            <div class="grid-3"><label><span>Telefonszám</span><input name="phone" value="${escapeHtml(trip.telefon || '')}" required></label><label><span>Autó típusa</span><input name="carType" value="${escapeHtml(trip.auto_tipus || '')}" required></label><label><span>Bankszámlaszám</span><input name="bankAccount" value="${escapeHtml(trip.bankszamla || '')}"></label></div>
            <div class="grid-2"><label><span>Indulás</span><input name="origin" value="${escapeHtml(trip.indulas || '')}" required></label><label><span>Érkezés</span><input name="destination" value="${escapeHtml(trip.erkezes || '')}" required></label></div>
            <div class="grid-3"><label><span>Dátum</span><input name="date" type="date" value="${escapeHtml(trip.datum || '')}" required></label><label><span>Idő</span><input name="time" type="time" value="${escapeHtml(trip.ido || '')}" required></label><label><span>Ár / fő</span><input name="price" type="number" min="0" value="${escapeHtml(String(trip.ar || 0))}" required></label></div>
            <div class="grid-2"><label><span>Összes hely</span><input name="osszHely" type="number" min="1" value="${escapeHtml(String(seatCounts(trip).total || 1))}" required></label><label><span>Szabad hely</span><input name="szabadHely" type="number" min="0" value="${escapeHtml(String(seatCounts(trip).free || 0))}" required></label></div>
            <label><span>Megjegyzés</span><textarea name="note">${escapeHtml(trip.megjegyzes || '')}</textarea></label>
            <div class="grid-2"><label><span>Sofőr profilkép URL</span><input name="profilKep" value="${escapeHtml(getProfileImage(trip))}"></label><label><span>Autó képek URL-jei (vesszővel elválasztva)</span><textarea name="autoKepek">${escapeHtml(getCarImages(trip).join(', '))}</textarea></label></div>
            <div id="tripEditMsg" class="form-message"></div>
            <button class="btn btn-primary" type="submit">Mentés</button>
          </form>`);
        wrap.querySelector('#tripEditForm').addEventListener('submit', async ev => {
          ev.preventDefault();
          const fd = new FormData(ev.currentTarget);
          const patch = {
            nev: fd.get('driverName')?.toString().trim() || '',
            email: fd.get('contactEmail')?.toString().trim() || '',
            telefon: fd.get('phone')?.toString().trim() || '',
            auto_tipus: fd.get('carType')?.toString().trim() || '',
            bankszamla: fd.get('bankAccount')?.toString().trim() || '',
            indulas: fd.get('origin')?.toString().trim() || '',
            erkezes: fd.get('destination')?.toString().trim() || '',
            datum: fd.get('date')?.toString() || '',
            ido: fd.get('time')?.toString() || '',
            ar: Number(fd.get('price') || 0),
            osszes_hely: Number(fd.get('osszHely') || 0),
            auto_helyek: Number(fd.get('osszHely') || 0),
            szabad_helyek: Number(fd.get('szabadHely') || 0),
            helyek: Number(fd.get('szabadHely') || 0),
            megjegyzes: fd.get('note')?.toString().trim() || '',
            profil_kep_url: fd.get('profilKep')?.toString().trim() || '',
            auto_kepek: parseImageList(fd.get('autoKepek')?.toString() || '')
          };
          if (!currentViewer.admin) patch.statusz = 'Függőben';
          const { error } = await sb.from(tableTrips).update(patch).eq('id', trip.id);
          const msg = wrap.querySelector('#tripEditMsg');
          if (error) { msg.textContent = error.message || 'Nem sikerült menteni.'; return; }
          msg.textContent = currentViewer.admin ? 'Sikeres mentés.' : 'Mentve. A fuvar újra admin jóváhagyásra vár.';
          setTimeout(() => location.reload(), 900);
        });
        return;
      }
      const deleteTrip = e.target.closest('.js-trip-delete');
      if (deleteTrip) {
        const trip = await fetchTripById(deleteTrip.dataset.id);
        if (!trip || !canManageTrip(trip)) return;
        if (!currentViewer.admin) {
          const { count, error: countErr } = await sb.from(tableBookings).select('id', { count: 'exact', head: true }).eq('fuvar_id', trip.id);
          if (!countErr && Number(count || 0) > 0) {
            alert('Ez a fuvar már foglalást kapott, ezért már nem törölhető.');
            return;
          }
        }
        if (confirm('Biztosan törlöd ezt a fuvart?')) {
          await sb.from(tableTrips).delete().eq('id', trip.id);
          location.reload();
        }
        return;
      }
      const approveTrip = e.target.closest('.js-trip-approve');
      if (approveTrip) { await sb.from(tableTrips).update({ statusz: 'Jóváhagyva' }).eq('id', approveTrip.dataset.id); location.reload(); return; }
      const pendingTrip = e.target.closest('.js-trip-pending');
      if (pendingTrip) { await sb.from(tableTrips).update({ statusz: 'Függőben' }).eq('id', pendingTrip.dataset.id); location.reload(); return; }
      const approveBooking = e.target.closest('.js-booking-approve');
      if (approveBooking) {
        const id = approveBooking.dataset.id;
        const tripId = approveBooking.dataset.tripId;
        const seats = Number(approveBooking.dataset.seats || 1);
        await sb.from(tableBookings).update({ foglalasi_allapot: 'Jóváhagyva' }).eq('id', id);
        if (tripId) {
          const trip = await fetchTripById(tripId);
          if (trip) {
            const counts = seatCounts(trip);
            const newFree = Math.max(0, counts.free - seats);
            const patch = { szabad_helyek: newFree, helyek: newFree };
            if (newFree <= 0) patch.statusz = 'Betelt';
            await sb.from(tableTrips).update(patch).eq('id', tripId);
          }
        }
        location.reload();
        return;
      }
      const paidBooking = e.target.closest('.js-booking-paid');
      if (paidBooking) { await sb.from(tableBookings).update({ fizetesi_allapot: 'Fizetve', foglalasi_allapot: 'Jóváhagyva' }).eq('id', paidBooking.dataset.id); location.reload(); return; }
      const cancelBooking = e.target.closest('.js-booking-cancel');
      if (cancelBooking) {
        const { data: bookingRow } = await sb.from(tableBookings).select('*').eq('id', cancelBooking.dataset.id).maybeSingle();
        if (!currentViewer.admin && bookingRow && bookingIsLocked(bookingRow)) {
          alert('A jóváhagyott és fizetett foglalást a sofőr már nem törölheti.');
          return;
        }
        if (confirm('Biztosan törlöd ezt a foglalást?')) { await sb.from(tableBookings).delete().eq('id', cancelBooking.dataset.id); location.reload(); }
        return;
      }
    });
  }

  async function initHome() {
    const featured = document.getElementById('featuredTrips');
    if (!featured) return;
    try {
      const trips = (await enrichTripsWithRatings(await enrichTripsWithBookings(await fetchApprovedTrips({})))).slice(0, 6);
      featured.innerHTML = trips.length ? trips.map(t => `
        <article class="card">
          ${tripGalleryMarkup(t, true)}
          <div class="inline-pills">${statusBadge('Jóváhagyva')}</div>
          <h3>${escapeHtml(t.indulas)} → ${escapeHtml(t.erkezes)}</h3>
          <p class="lead">${escapeHtml(t.datum)} • ${escapeHtml(t.ido)} • ${fmtCurrency(t.ar)} Ft / fő</p>
          ${driverMiniMarkup(t, starRating(t.sofor_atlag || 0, t.sofor_ertekeles_db || 0))}
          ${seatBar(seatCounts(t).free, seatCounts(t).total)}
          <a class="btn btn-secondary" href="trip.html?id=${t.id}">Részletek</a>
        </article>`).join('') : '<div class="empty-state">Még nincs jóváhagyott fuvar.</div>';
    } catch (_) {
      featured.innerHTML = '<div class="empty-state">A fuvarok betöltése átmenetileg nem elérhető.</div>';
    }
    document.getElementById('quickSearchForm')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const p = new URLSearchParams();
      [['quickOrigin', 'origin'], ['quickDestination', 'destination'], ['quickDate', 'date']].forEach(([id, key]) => {
        const v = document.getElementById(id)?.value?.trim();
        if (v) p.set(key, v);
      });
      location.href = 'fuvarok.html?' + p.toString();
    });
  }

  async function initTripsPage() {
    if (!document.getElementById('tripsList')) return;
    if (document.getElementById('tripsMap')) {
      activeMap = L.map('tripsMap').setView([47.4979, 19.0402], 7);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(activeMap);
    }
    const params = new URLSearchParams(location.search);
    const originInput = document.getElementById('filterOrigin');
    const destinationInput = document.getElementById('filterDestination');
    const dateInput = document.getElementById('filterDate');
    const maxPriceInput = document.getElementById('filterMaxPrice');
    const dayPresetInput = document.getElementById('filterDayPreset');
    const sortInput = document.getElementById('filterSort');
    const onlyFreeInput = document.getElementById('filterOnlyFree');
    originInput.value = params.get('origin') || '';
    destinationInput.value = params.get('destination') || '';
    dateInput.value = params.get('date') || '';
    if (maxPriceInput) maxPriceInput.value = params.get('maxPrice') || '';
    if (dayPresetInput) dayPresetInput.value = params.get('dayPreset') || '';
    if (sortInput) sortInput.value = params.get('sort') || 'time_asc';
    if (onlyFreeInput) onlyFreeInput.checked = params.get('onlyFree') === '1';
    const list = document.getElementById('tripsList');
    const recWrap = document.getElementById('recommendedTrips');
    async function render() {
      list.innerHTML = '<div class="empty-state">Betöltés...</div>';
      if (recWrap) recWrap.innerHTML = '';
      try {
        const filters = { origin: originInput.value.trim(), destination: destinationInput.value.trim(), date: dateInput.value, maxPrice: maxPriceInput?.value || '', dayPreset: dayPresetInput?.value || '', sort: sortInput?.value || 'time_asc', onlyFree: !!onlyFreeInput?.checked };
        const trips = await enrichTripsWithRatings(await enrichTripsWithBookings(await fetchApprovedTrips(filters)));
        list.innerHTML = trips.length ? trips.map(t => tripListCard(t)).join('') : '<div class="empty-state">Nincs a keresésnek megfelelő fuvar.</div>';
        if (trips[0]) await focusRoute(trips[0].indulas, trips[0].erkezes);
        if (!trips.length && recWrap) {
          const all = await enrichTripsWithRatings(await enrichTripsWithBookings(await fetchApprovedTrips({})));
          const rec = buildRecommendations(all, filters);
          recWrap.innerHTML = rec.length ? `<h3>Ajánlott fuvarok</h3><div class="trip-list-grid">${rec.map(t => tripListCard(t)).join('')}</div>` : '';
        }
      } catch (_) {
        list.innerHTML = '<div class="empty-state">A fuvarok jelenleg nem tölthetők be.</div>';
      }
    }
    await render();
    document.getElementById('tripFilterForm')?.addEventListener('submit', async (e) => { e.preventDefault(); const p = new URLSearchParams(); [['origin', originInput.value.trim()], ['destination', destinationInput.value.trim()], ['date', dateInput.value], ['maxPrice', maxPriceInput?.value || ''], ['dayPreset', dayPresetInput?.value || ''], ['sort', sortInput?.value || 'time_asc']].forEach(([k,v]) => { if (v) p.set(k, v); }); if (onlyFreeInput?.checked) p.set('onlyFree','1'); history.replaceState({}, '', 'fuvarok.html' + (p.toString() ? '?' + p.toString() : '')); await render(); });
  }

  async function initTripFormPage() {
    const form = document.getElementById('tripForm');
    if (!form) return;
    const ok = await AppAuth.requireAuth('fuvar-feladas.html');
    if (!ok) return;
    if (!form.querySelector('[name="website"]')) {
      const hp = document.createElement('input');
      hp.type = 'text'; hp.name = 'website'; hp.className = 'hidden'; hp.autocomplete = 'off'; hp.tabIndex = -1;
      form.prepend(hp);
    }
    const session = await AppAuth.getSession();
    const user = session?.user;
    form.querySelector('[name="contactEmail"]').value = user?.email || '';
    injectTripImageFields(form);
    form.querySelector('[name="contactEmail"]').readOnly = true;
    const driverNameInput = form.querySelector('[name="driverName"]');
    if (driverNameInput && !driverNameInput.value) driverNameInput.value = user?.user_metadata?.name || user?.user_metadata?.full_name || (user?.email ? String(user.email).split('@')[0] : '');
    const total = form.querySelector('[name="osszHely"]');
    const free = form.querySelector('[name="szabadHely"]');
    total.addEventListener('input', () => free.value = total.value);
    const info = document.createElement('div');
    info.innerHTML = notificationNotice('trip');
    form.appendChild(info);
    mountTripAiTools(form);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = document.getElementById('tripFormMsg');
      msg.textContent = 'Mentés...';
      try {
        const mailOk = await submitTrip(form);
        msg.textContent = !APP_CONFIG.notificationFunctionUrl
          ? 'A fuvar rögzítve lett. Admin jóváhagyás után megjelenik a listában.'
          : (mailOk
              ? 'A fuvar rögzítve lett. Az admin e-mail értesítés is sikeresen elindult.'
              : 'A fuvar rögzítve lett, de az e-mail értesítés nem ment ki. Ellenőrizd a Supabase Edge Function logokat és a Resend beállításokat.');
        form.reset();
        form.querySelector('[name="contactEmail"]').value = user?.email || '';
        if (driverNameInput) driverNameInput.value = user?.user_metadata?.name || user?.user_metadata?.full_name || (user?.email ? String(user.email).split('@')[0] : '');
        form.__driverProfileFile = null;
        form.__carImageFiles = [];
        form.querySelector('#driverProfilePreview')?.replaceChildren();
        form.querySelector('#carImagesPreview')?.replaceChildren();
      } catch (err) {
        msg.textContent = err.message || 'Nem sikerült menteni.';
      }
    });
  }

  async function initAuthPage() {
    if (!document.getElementById('loginForm')) return;
    const { session } = await AppAuth.updateNav();
    AppAuth.bindLogout();
    AppAuth.watchAuth();
    if (session) {
      location.href = (await AppAuth.isAdmin()) ? 'admin.html' : 'index.html';
      return;
    }
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    document.getElementById('facebookLoginBtn')?.addEventListener('click', async () => {
      const msg = document.getElementById('loginMsg');
      msg.textContent = 'Facebook belépés indítása...';
      const { error } = await AppAuth.signInWithFacebook();
      if (error) msg.textContent = error.message || 'A Facebook belépés jelenleg nem elérhető.';
    });
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(loginForm);
      const msg = document.getElementById('loginMsg');
      msg.textContent = 'Belépés...';
      const { error } = await AppAuth.signIn(fd.get('email'), fd.get('password'));
      if (error) msg.textContent = error.message || 'Nem sikerült a belépés.';
      else location.href = (await AppAuth.isAdmin()) ? 'admin.html' : AppAuth.consumeNext('index.html');
    });
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(registerForm);
      const msg = document.getElementById('registerMsg');
      msg.textContent = 'Regisztráció...';
      const { error } = await AppAuth.signUp(fd.get('email'), fd.get('password'), fd.get('name'));
      msg.textContent = error ? (error.message || 'Nem sikerült a regisztráció.') : 'Sikeres regisztráció. Ellenőrizd az emailedet.';
    });
  }

  async function initAdminPage() {
    if (!document.getElementById('adminTrips')) return;
    const ok = await AppAuth.requireAdmin();
    if (!ok) return;
    const tripsWrap = document.getElementById('adminTrips');
    const bookingsWrap = document.getElementById('adminBookings');
    const settingsForm = document.getElementById('settingsForm');
    const msg = document.getElementById('settingsMsg');
    const settings = await fetchSettings();
    if (settingsForm) {
      settingsForm.siteName.value = APP_CONFIG.brandName;
      settingsForm.companyName.value = APP_CONFIG.companyName;
      settingsForm.email.value = settings?.contact_email || APP_CONFIG.contactEmail;
      settingsForm.adminEmail.value = settings?.admin_email || APP_CONFIG.adminEmail;
      settingsForm.description.value = settings?.description || 'Gyors és biztonságos fuvarmegosztó felület utasoknak és sofőröknek.';
      settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(settingsForm);
        msg.textContent = 'Mentés...';
        const payload = { site_name: fd.get('siteName'), company_name: fd.get('companyName'), contact_email: fd.get('email'), admin_email: fd.get('adminEmail'), description: fd.get('description') };
        let error = null;
        if (settings?.id) ({ error } = await sb.from(tableSettings).update(payload).eq('id', settings.id));
        else ({ error } = await sb.from(tableSettings).insert([payload]));
        msg.textContent = error ? 'Nem sikerült menteni.' : 'Mentve.';
      });
    }
    const statHost = document.createElement('div');
    statHost.className = 'cards';
    statHost.style.marginBottom = '18px';
    tripsWrap.before(statHost);
    try {
      const [allTripsRaw, bookings, ratings, emailLogs] = await Promise.all([fetchAllTrips(), fetchBookings(), sb.from(tableRatings).select('id'), fetchEmailLogs()]);
      const allTrips = await enrichTripsWithBookings(allTripsRaw);
      const liveTrips = allTrips.filter(t => !isTripExpired(t));
      const approved = allTrips.filter(t => t.statusz === 'Jóváhagyva').length;
      const pending = allTrips.filter(t => t.statusz !== 'Jóváhagyva' && t.statusz !== 'Betelt').length;
      const fullTrips = allTrips.filter(t => isTripFull(t) || String(t.statusz || '').toLowerCase().includes('betelt'));
      const expiringSoonTrips = allTrips.filter(t => isTripSoonExpiring(t));
      const newBookings = bookings.filter(b => ['új','uj'].includes(String(b.foglalasi_allapot || '').toLowerCase()));
      const totalSeats = allTrips.reduce((sum, t) => sum + seatCounts(t).total, 0);
      statHost.innerHTML = [
        ['Összes fuvar', allTrips.length], ['Jóváhagyott', approved], ['Függőben', pending], ['Betelt fuvar', fullTrips.length], ['Foglalások', bookings.length], ['Értékelések', ratings.data?.length || 0], ['Összes utashely', totalSeats], ['Aktív fuvar', liveTrips.length], ['Új foglalások', newBookings.length], ['Lejár hamarosan', expiringSoonTrips.length], ['E-mailek', emailLogs.length], ['Sikeres e-mail', emailLogs.filter(x => x.sikeres).length]
      ].map(([label, value]) => `<div class="card"><div class="small-help">${label}</div><div style="font-size:2rem;font-weight:800;margin-top:10px">${value}</div></div>`).join('');
      const quickBlocks = document.getElementById('adminQuickBlocks');
      if (quickBlocks) quickBlocks.innerHTML = `
        <div class="card"><div class="small-help">Új foglalások</div>${newBookings.length ? newBookings.slice(0,3).map(b => `<div style="margin-top:10px"><strong>${escapeHtml(b.nev || '')}</strong><br><span class="small-help">${escapeHtml(String(b.created_at || '').slice(0,16).replace('T',' '))}</span></div>`).join('') : '<div class="notice" style="margin-top:10px">Nincs új foglalás.</div>'}</div>
        <div class="card"><div class="small-help">Betelt fuvarok</div>${fullTrips.length ? fullTrips.slice(0,3).map(t => `<div style="margin-top:10px"><strong>${escapeHtml(t.indulas || '')} → ${escapeHtml(t.erkezes || '')}</strong></div>`).join('') : '<div class="notice" style="margin-top:10px">Nincs betelt fuvar.</div>'}</div>
        <div class="card"><div class="small-help">Lejár hamarosan</div>${expiringSoonTrips.length ? expiringSoonTrips.slice(0,3).map(t => `<div style="margin-top:10px"><strong>${escapeHtml(t.indulas || '')} → ${escapeHtml(t.erkezes || '')}</strong><br><span class="small-help">${escapeHtml(t.datum || '')} ${escapeHtml(t.ido || '')}</span></div>`).join('') : '<div class="notice" style="margin-top:10px">Nincs közelgő lejárat.</div>'}</div>`;
      const trips = await enrichTripsWithRatings(allTrips);
      tripsWrap.innerHTML = trips.length ? trips.map(t => tripCard(t, true)).join('') : '<div class="empty-state">Még nincs beküldött fuvar.</div>';
      const tripMap = Object.fromEntries(trips.map(t => [String(t.id), t]));
      bookingsWrap.innerHTML = bookings.length ? bookings.map(b => bookingCard(b, tripMap)).join('') : '<div class="empty-state">Még nincs foglalás.</div>';
      if (!APP_CONFIG.notificationFunctionUrl) bookingsWrap.insertAdjacentHTML('beforebegin', notificationNotice('booking'));
    } catch (_) {
      tripsWrap.innerHTML = '<div class="empty-state">A fuvarok betöltése nem sikerült.</div>';
      bookingsWrap.innerHTML = '<div class="empty-state">A foglalások betöltése nem sikerült.</div>';
    }
  }

  async function initDriverPage() {
    const box = document.getElementById('driverProfileCard');
    if (!box) return;
    const params = new URLSearchParams(location.search);
    const email = params.get('email');
    const name = params.get('name');
    const allTrips = await enrichTripsWithRatings(await enrichTripsWithBookings(await fetchApprovedTrips({}).catch(() => [])));
    const trips = allTrips.filter(t => (email && t.email === email) || (name && t.nev === name));
    const trip = trips[0] || { nev: name || 'Ismeretlen sofőr', email: email || '', telefon: '' };
    box.innerHTML = `
      ${getProfileImage(trip) ? `<img class="driver-avatar driver-avatar-img driver-avatar-large" src="${getProfileImage(trip)}" alt="${escapeHtml(trip.nev || 'Sofőr')}">` : `<div class="driver-avatar">${getInitials(trip.nev)}</div>`}
      <div class="driver-meta">
        <h2>${escapeHtml(trip.nev || 'Ismeretlen sofőr')}</h2>
        <div>${starRating(trip.sofor_atlag || 0, trip.sofor_ertekeles_db || 0)}</div>
        <p style="margin:10px 0 0">Kapcsolat: ${escapeHtml(trip.email || '-')}</p>
        <p style="margin:8px 0 0">Aktív fuvarok száma: ${trips.length}</p>
      </div>`;
    const tripsBox = document.getElementById('driverTrips');
    if (tripsBox) tripsBox.innerHTML = trips.length ? trips.map(t => tripListCard(t)).join('') : '<div class="notice">Ennél a sofőrnél még nincs aktív fuvar.</div>';
    const contact = document.getElementById('driverContactBox');
    if (contact) contact.innerHTML = `<strong>${escapeHtml(trip.nev || 'Sofőr')}</strong><br>${escapeHtml(trip.email || '-')}</div>`;
    const reviewsHost = document.createElement('section');
    reviewsHost.className = 'card';
    reviewsHost.style.marginTop = '24px';
    box.parentElement.appendChild(reviewsHost);
    if (trips[0]) {
      const reviews = await fetchRatingsForTrip(trips[0].id, 'sofor');
      reviewsHost.innerHTML = `<h2>Sofőr értékelései</h2>${reviews.length ? reviews.map(reviewCard).join('') : '<div class="notice">Még nincs értékelés.</div>'}`;
    } else {
      reviewsHost.innerHTML = '<h2>Sofőr értékelései</h2><div class="notice">Még nincs értékelés.</div>';
    }
  }

  async function initContactPage() {
    const form = document.getElementById('contactForm');
    const params = new URLSearchParams(location.search);
    if (form) {
      if (!form.querySelector('[name="website"]')) form.insertAdjacentHTML('afterbegin', '<input type="text" name="website" class="hidden" autocomplete="off" tabindex="-1">');
      const session = await AppAuth.getSession();
      if (session?.user?.email) {
        const emailInput = form.querySelector('[name="email"]');
        const nameInput = form.querySelector('[name="name"]');
        if (emailInput) emailInput.value = session.user.email;
        if (nameInput && !nameInput.value) nameInput.value = session.user.user_metadata?.name || session.user.user_metadata?.full_name || session.user.email.split('@')[0];
      }
      const formMsg = document.getElementById('contactMsg');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        try { validateHuman(form); } catch (err) { alert(err.message); return; }
        const fd = new FormData(form);
        const subject = encodeURIComponent('Weboldal kérdés / hibajelzés - FuvarVelünk');
        const body = encodeURIComponent(`Név: ${fd.get('name')}\nE-mail: ${fd.get('email')}\n\nÜzenet:\n${fd.get('message')}`);
        location.href = `mailto:${APP_CONFIG.contactEmail}?subject=${subject}&body=${body}`;
      });
    }
    if (params.get('driverEmail') && !document.getElementById('driverQuestionSection')) {
      const section = document.createElement('section');
      section.className = 'card';
      section.id = 'driverQuestionSection';
      section.style.marginTop = '22px';
      section.innerHTML = `
        <span class="eyebrow">Kérdés a sofőrnek</span>
        <h2 style="margin:12px 0">Üzenet küldése ${escapeHtml(params.get('driverName') || 'a sofőrnek')}</h2>
        <form id="driverQuestionForm" class="form-stack">
          <input type="text" name="website" class="hidden" autocomplete="off" tabindex="-1">
          <input type="hidden" name="tripId" value="${escapeHtml(params.get('tripId') || '')}">
          <input type="hidden" name="driverName" value="${escapeHtml(params.get('driverName') || '')}">
          <input type="hidden" name="driverEmail" value="${escapeHtml(params.get('driverEmail') || '')}">
          <label><span>Név</span><input name="name" required></label>
          <label><span>E-mail</span><input name="email" type="email" required></label>
          <label><span>Üzenet</span><textarea name="message" required placeholder="Írd le röviden a kérdésedet"></textarea></label>
          <div id="driverQuestionMsg" class="form-message"></div>
          <button class="btn btn-primary" type="submit">Levél összeállítása</button>
        </form>`;
      form?.closest('.container')?.appendChild(section);
    }
    const driverForm = document.getElementById('driverQuestionForm');
    if (!driverForm) return;
    const session = await AppAuth.getSession();
    if (session?.user?.email) {
      const emailInput = driverForm.querySelector('[name="email"]');
      if (emailInput) emailInput.value = session.user.email;
      const nameInput = driverForm.querySelector('[name="name"]');
      if (nameInput && !nameInput.value) nameInput.value = session.user.user_metadata?.name || session.user.user_metadata?.full_name || session.user.email.split('@')[0];
    }
    mountDriverQuestionAiTools(driverForm);
    driverForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const ok = await AppAuth.requireAuth('kapcsolat.html');
      if (!ok) return;
      try { validateHuman(driverForm); } catch (err) { alert(err.message); return; }
      const fd = new FormData(driverForm);
      const subject = encodeURIComponent(`Kérdés a sofőrnek - ${fd.get('driverName') || ''}`);
      const body = encodeURIComponent(`Fuvar azonosító: ${fd.get('tripId') || '-'}\nFeladó neve: ${fd.get('name')}\nFeladó e-mail: ${fd.get('email')}\n\nÜzenet:\n${fd.get('message')}`);
      location.href = `mailto:${fd.get('driverEmail') || APP_CONFIG.contactEmail}?subject=${subject}&body=${body}`;
    });
  }

  async function fetchBookingsForTrip(tripId) {
    try {
      const { data, error } = await sb.from(tableBookings).select('*').eq('fuvar_id', tripId).order('created_at', { ascending: false });
      if (error) return [];
      return data || [];
    } catch (_) {
      return [];
    }
  }

  async function fetchPassengerBookingForTrip(tripId, email) {
    if (!tripId || !email) return null;
    try {
      const { data, error } = await sb.from(tableBookings).select('*').eq('fuvar_id', tripId).eq('utas_email', email).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (error) return null;
      return data || null;
    } catch (_) {
      return null;
    }
  }

  function buildPassengerBookingStatusSection(booking = {}, trip = {}) {
    if (!booking) return '';
    return `
      <section class="card detail-extra">
        <div class="section-head">
          <div><span class="eyebrow">Saját foglalásod</span><h2 style="margin:12px 0 0">Foglalási állapot</h2></div>
          <div class="inline-pills">${statusBadge(booking.foglalasi_allapot || 'Új')} ${statusBadge(booking.fizetesi_allapot || 'Függőben')}</div>
        </div>
        <div class="trip-meta">
          <span><strong>Útvonal:</strong> ${escapeHtml(trip.indulas || '')} → ${escapeHtml(trip.erkezes || '')}</span>
          <span><strong>Foglaló név:</strong> ${escapeHtml(booking.nev || booking.utas_nev || '')}</span>
          <span><strong>Helyek:</strong> ${escapeHtml(String(booking.foglalt_helyek || 1))}</span>
          <span><strong>Fizetési mód:</strong> ${booking.fizetesi_mod === 'cash' ? 'Készpénz a sofőrnek' : 'Utalás a sofőrnek'}</span>
        </div>
        <p style="margin-top:12px"><strong>Fizetés:</strong> ${escapeHtml(booking.fizetesi_allapot || 'Függőben')}</p>
        <p style="margin:6px 0 0"><strong>Foglalás:</strong> ${escapeHtml(booking.foglalasi_allapot || 'Új')}</p>
        <p class="small-help" style="margin:12px 0 0">Amikor a sofőr visszaigazolja a beérkezett pénzt, itt is megjelenik a <strong>Fizetve</strong> állapot.</p>
      </section>`;
  }


  function buildDriverBookingsSection(trip, bookings = []) {
    const tripMap = { [String(trip.id)]: trip };
    const totalRequested = bookings.reduce((sum, b) => sum + Number(b.foglalt_helyek || 1), 0);
    const pendingCount = bookings.filter(b => ['új','uj'].includes(String(b.foglalasi_allapot || '').toLowerCase())).length;
    return `
      <section class="card detail-extra" id="driverBookingsSection">
        <div class="section-head">
          <div><span class="eyebrow">Saját foglalások</span><h2 style="margin:12px 0 0">Foglalások kezelése</h2></div>
          <div class="inline-pills">
            <span class="pill">Összes foglalás: ${bookings.length}</span>
            <span class="pill">Új: ${pendingCount}</span>
            <span class="pill">Igényelt helyek: ${totalRequested}</span>
          </div>
        </div>
        <p class="small-help" style="margin:0 0 14px">Itt látod az utas foglalásait. Sofőrként jóvá tudod hagyni vagy el tudod utasítani őket.</p>
        <div class="driver-bookings-list">
          ${bookings.length ? bookings.map(b => bookingSummaryCard(b, tripMap)).join('') : '<div class="notice">Ehhez a fuvarhoz még nincs foglalás.</div>'}
        </div>
      </section>`;
  }

  async function initTripDetailPage() {
    const wrap = document.getElementById('tripDetail');
    if (!wrap) return;
    const id = new URLSearchParams(location.search).get('id');
    if (!id) { wrap.innerHTML = '<div class="empty-state">A fuvar nem található.</div>'; return; }

    let trip;
    let driverReviews = [];
    let tripReviews = [];
    let tripBookings = [];
    let passengerBooking = null;
    let isManagerView = false;
    try {
      const tripRaw = await fetchTripById(id);
      if (!tripRaw) { wrap.innerHTML = '<div class="empty-state">A fuvar nem található.</div>'; return; }
      [trip] = await enrichTripsWithRatings(await enrichTripsWithBookings([tripRaw]));
      isManagerView = !!(currentViewer.admin || isOwnTrip(trip));
      [driverReviews, tripReviews, tripBookings] = await Promise.all([
        fetchRatingsForTrip(trip.id, 'sofor'),
        fetchRatingsForTrip(trip.id, 'utazas'),
        isManagerView ? fetchBookingsForTrip(trip.id) : Promise.resolve([])
      ]);
    } catch (err) {
      console.error('Trip detail load failed', err);
      wrap.innerHTML = '<div class="empty-state">A fuvar betöltése nem sikerült.</div>';
      return;
    }

    wrap.innerHTML = `
      ${tripCard(trip, false)}
      ${isManagerView ? buildDriverBookingsSection(trip, tripBookings) : ''}
      <section class="card detail-extra">
        <div class="section-head"><div><span class="eyebrow">Sofőr profil</span><h2 style="margin:12px 0 0">${escapeHtml(trip.nev || '')}</h2></div><a class="btn btn-secondary" href="driver.html?name=${encodeURIComponent(trip.nev || '')}&email=${encodeURIComponent(trip.email || '')}">Sofőr profil</a></div>
        <p>${starRating(trip.sofor_atlag || 0, trip.sofor_ertekeles_db || 0)}</p>
        <p><strong>Kapcsolat:</strong> ${escapeHtml(trip.email || '')}${trip.telefon ? ' · ' + escapeHtml(trip.telefon) : ''}</p>
        <p><strong>Utalási adat:</strong> ${escapeHtml(trip.bankszamla || '-')}</p>
      </section>
      <section class="two-col" style="margin-top:18px">
        <section class="card"><h2>Sofőr értékelései</h2>${driverReviews.length ? driverReviews.map(reviewCard).join('') : '<div class="notice">Még nincs értékelés.</div>'}
          <div id="selfRatingNoticeDriver" class="notice hidden" style="margin-top:18px">A saját fuvarodat és saját magadat nem értékelheted.</div>
          <form id="driverRatingForm" class="form-stack" style="margin-top:18px">
            <input type="text" name="website" class="hidden" autocomplete="off" tabindex="-1">
            <h3>Sofőr értékelése</h3>
            <div class="grid-2"><label><span>Név</span><input name="name" required placeholder="A neved"></label><label><span>Csillag (1-5)</span><input name="csillag" type="number" min="1" max="5" required></label></div>
            <label><span>Szöveges értékelés (nem kötelező)</span><textarea name="szoveg" placeholder="Írd le röviden a tapasztalatodat (nem kötelező)"></textarea></label>
            <div class="form-message" id="driverRatingMsg"></div>
            <button class="btn btn-primary" type="submit">Értékelés mentése</button>
          </form>
        </section>
        <section class="card"><h2>Utazás értékelései</h2>${tripReviews.length ? tripReviews.map(reviewCard).join('') : '<div class="notice">Még nincs értékelés.</div>'}
          <div id="selfRatingNoticeTrip" class="notice hidden" style="margin-top:18px">A saját fuvarodat és saját magadat nem értékelheted.</div>
          <form id="tripRatingForm" class="form-stack" style="margin-top:18px">
            <input type="text" name="website" class="hidden" autocomplete="off" tabindex="-1">
            <h3>Utazás értékelése</h3>
            <div class="grid-2"><label><span>Név</span><input name="name" required placeholder="A neved"></label><label><span>Csillag (1-5)</span><input name="csillag" type="number" min="1" max="5" required></label></div>
            <label><span>Szöveges értékelés (nem kötelező)</span><textarea name="szoveg" placeholder="Írd le röviden a tapasztalatodat (nem kötelező)"></textarea></label>
            <div class="form-message" id="tripRatingMsg"></div>
            <button class="btn btn-primary" type="submit">Értékelés mentése</button>
          </form>
        </section>
      </section>`;

    try { await focusRoute(trip.indulas, trip.erkezes); } catch (err) { console.warn('Map focus failed', err); }
    const session = await AppAuth.getSession();
    const currentEmail = (session?.user?.email || '').trim().toLowerCase();
    const tripEmail = (trip?.email || '').trim().toLowerCase();
    const ownTrip = !!currentEmail && !!tripEmail && currentEmail === tripEmail;
    if (currentEmail && !isManagerView) {
      passengerBooking = await fetchPassengerBookingForTrip(trip.id, currentEmail);
      if (passengerBooking) {
        wrap.insertAdjacentHTML('beforeend', buildPassengerBookingStatusSection(passengerBooking, trip));
      }
    }
    if (ownTrip) {
      document.getElementById('driverRatingForm')?.classList.add('hidden');
      document.getElementById('tripRatingForm')?.classList.add('hidden');
      document.getElementById('selfRatingNoticeDriver')?.classList.remove('hidden');
      document.getElementById('selfRatingNoticeTrip')?.classList.remove('hidden');
    }
    document.getElementById('driverRatingForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = document.getElementById('driverRatingMsg');
      msg.textContent = 'Mentés...';
      try { await submitRating(trip, e.currentTarget, 'sofor'); msg.textContent = 'Elmentve.'; setTimeout(() => location.reload(), 700); } catch (err) { msg.textContent = err.message || 'Nem sikerült menteni.'; }
    });
    document.getElementById('tripRatingForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = document.getElementById('tripRatingMsg');
      msg.textContent = 'Mentés...';
      try { await submitRating(trip, e.currentTarget, 'utazas'); msg.textContent = 'Elmentve.'; setTimeout(() => location.reload(), 700); } catch (err) { msg.textContent = err.message || 'Nem sikerült menteni.'; }
    });
  }

  async function init() {
    const authState = await AppAuth.updateNav();
    currentViewer = { user: authState?.user || authState?.session?.user || null, admin: !!authState?.admin };
    AppAuth.bindLogout();
    AppAuth.watchAuth();
    await applySettings();
    await bindGlobalActions();
    await initHome();
    await initTripsPage();
    await initTripFormPage();
    await initAuthPage();
    await initAdminPage();
    await initDriverPage();
    await initContactPage();
    await initTripDetailPage();
  }

  return { init, focusRoute };
})();

document.addEventListener('DOMContentLoaded', () => { App.init(); });
