const App = (() => {
  const tableTrips = 'fuvarok';
  const tableBookings = 'foglalasok';
  const tableSettings = 'beallitasok';
  const tableReviews = 'ertekelesek';
  let activeMap = null;
  let activeLine = null;
  let activeMarkers = [];

  function escapeHtml(str = '') {
    return String(str).replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
  }

  function fmtCurrency(v) {
    return new Intl.NumberFormat('hu-HU').format(Number(v || 0));
  }

  function normStatus(s = '') { return String(s).toLowerCase(); }
  function cityNorm(s = '') { return String(s).toLowerCase().replace(/\s+/g, ' ').trim(); }
  function getInitials(name = '') {
    const parts = String(name).trim().split(/\s+/).filter(Boolean).slice(0, 2);
    return parts.length ? parts.map(p => p[0].toUpperCase()).join('') : 'S';
  }
  function getStars(v = 0) {
    const n = Math.max(0, Math.min(5, Math.round(Number(v || 0))));
    return '★'.repeat(n) + '☆'.repeat(5 - n);
  }
  function toNumber(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  function getTotalSeats(trip) {
    return Math.max(1, toNumber(trip.auto_helyek ?? trip.osszes_hely ?? trip.helyek ?? trip.szabad_helyek ?? 1, 1));
  }
  function getFreeSeats(trip) {
    return Math.max(0, toNumber(trip.szabad_helyek ?? trip.helyek ?? getTotalSeats(trip), getTotalSeats(trip)));
  }
  function isTripFull(trip) {
    return getFreeSeats(trip) <= 0;
  }
  function parseTripDateTime(trip) {
    const d = String(trip?.datum || '').trim();
    if (!d) return null;
    const t = String(trip?.ido || '23:59').trim() || '23:59';
    const iso = `${d}T${t.length === 5 ? t + ':00' : t}`;
    const dt = new Date(iso);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  function isTripExpired(trip) {
    const dt = parseTripDateTime(trip);
    if (!dt) return false;
    return dt.getTime() < Date.now();
  }
  function formatTripDateTime(trip) {
    return `${escapeHtml(trip.datum || '')}${trip.ido ? ' · ' + escapeHtml(trip.ido) : ''}`;
  }

  function statusBadge(status = 'Függőben') {
    const n = normStatus(status);
    let cls = 'info';
    if (n.includes('jóvá') || n.includes('fizetve') || n.includes('készpénz') || n.includes('aktív')) cls = 'approved';
    else if (n.includes('függ') || n.includes('vár')) cls = 'pending';
    else if (n.includes('töröl') || n.includes('elutas') || n.includes('lejárt') || n.includes('betelt')) cls = 'rejected';
    return `<span class="status ${cls}">${escapeHtml(status)}</span>`;
  }

  function seatBar(free, total) {
    const t = Math.max(1, Number(total || free || 0));
    const f = Math.max(0, Number(free || 0));
    const used = Math.max(0, t - f);
    const percent = Math.max(0, Math.min(100, Math.round((used / t) * 100)));
    return `<div class="seat-bar-wrap"><div class="seat-bar"><span style="width:${percent}%"></span></div><small>${used}/${t} hely foglalt · ${f} szabad</small></div>`;
  }

  function starRating(value = 0, count = 0) {
    const v = Number(value || 0);
    if (!count && !v) return `<span class="stars">☆☆☆☆☆</span> <span class="rating-num">Nincs értékelés</span>`;
    return `<span class="stars">${getStars(v)}</span> <span class="rating-num">${v.toFixed(1)}${count ? ` · ${count} értékelés` : ''}</span>`;
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
    const visibleBrand = APP_CONFIG.brandName;
    const visibleCompany = APP_CONFIG.companyName;
    const visibleEmail = (s?.contact_email && !String(s.contact_email).includes('utazz')) ? s.contact_email : APP_CONFIG.contactEmail;
    document.querySelectorAll('[data-setting="siteName"]').forEach(el => el.textContent = visibleBrand);
    document.querySelectorAll('[data-setting="companyName"]').forEach(el => el.textContent = visibleCompany);
    document.querySelectorAll('[data-setting="email"]').forEach(el => el.textContent = visibleEmail);
    document.querySelectorAll('[data-setting="phone"]').forEach(el => el.textContent = s?.contact_phone || APP_CONFIG.contactPhone);
    document.querySelectorAll('[data-setting="city"]').forEach(el => el.textContent = s?.city || APP_CONFIG.city);
    document.querySelectorAll('[data-setting="adminEmail"]').forEach(el => el.textContent = s?.admin_email || APP_CONFIG.adminEmail);
    document.querySelectorAll('[data-brand]').forEach(el => el.textContent = visibleBrand);
  }

  async function fetchApprovedTrips(filters = {}) {
    let q = sb.from(tableTrips)
      .select('*')
      .in('statusz', ['Jóváhagyva', 'Betelt'])
      .order('datum', { ascending: true })
      .order('ido', { ascending: true });
    if (filters.origin) q = q.ilike('indulas', `%${filters.origin}%`);
    if (filters.destination) q = q.ilike('erkezes', `%${filters.destination}%`);
    if (filters.date) q = q.eq('datum', filters.date);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).filter(t => !isTripExpired(t));
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

  async function fetchRatingsMap(trips = []) {
    const ids = [...new Set((trips || []).map(t => t.id).filter(Boolean))];
    const map = {};
    ids.forEach(id => { map[id] = { avg: 0, count: 0 }; });
    if (!ids.length) return map;
    try {
      const { data, error } = await sb.from(tableReviews).select('fuvar_id, csillag').in('fuvar_id', ids);
      if (error) throw error;
      for (const row of (data || [])) {
        const key = row.fuvar_id;
        if (!map[key]) map[key] = { avg: 0, count: 0, sum: 0 };
        map[key].sum = (map[key].sum || 0) + Number(row.csillag || 0);
        map[key].count += 1;
      }
      Object.keys(map).forEach(key => {
        const item = map[key];
        if (item.count) item.avg = item.sum / item.count;
      });
    } catch (_) {
      trips.forEach(t => {
        map[t.id] = {
          avg: Number(t.sofor_ertekeles || 0),
          count: Number(t.ertekeles_db || 0)
        };
      });
    }
    return map;
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

  function buildTripBadges(trip) {
    const badges = [statusBadge(trip.statusz || 'Jóváhagyva')];
    if (isTripFull(trip)) badges.push(statusBadge('Betelt'));
    if (isTripExpired(trip)) badges.push(statusBadge('Lejárt'));
    return badges.join(' ');
  }

  function tripCard(trip, admin = false, ratingMap = {}) {
    const free = getFreeSeats(trip);
    const total = getTotalSeats(trip);
    const paymentMethods = (trip.fizetesi_modok && Array.isArray(trip.fizetesi_modok) ? trip.fizetesi_modok : ['transfer', 'cash'])
      .map(m => m === 'cash' ? 'Készpénz a sofőrnek' : 'Utalás a sofőrnek')
      .join(' · ');
    const rating = ratingMap[trip.id]?.avg || Number(trip.sofor_ertekeles || 0);
    const ratingCount = ratingMap[trip.id]?.count || 0;
    const profile = `<div class="driver-mini"><strong>${escapeHtml(trip.nev || '')}</strong><span>${starRating(rating, ratingCount)}</span></div>`;

    return `
      <article class="card trip-card" data-trip-id="${trip.id}">
        <div class="trip-main">
          <div class="inline-pills"><span class="pill">${escapeHtml(trip.indulas)} → ${escapeHtml(trip.erkezes)}</span>${buildTripBadges(trip)}</div>
          <h3>${escapeHtml(trip.indulas)} → ${escapeHtml(trip.erkezes)}</h3>
          ${profile}
          <div class="trip-meta">
            <span><strong>Indulás:</strong> ${formatTripDateTime(trip)}</span>
            <span><strong>Ár:</strong> ${fmtCurrency(trip.ar)} Ft / fő</span>
            <span><strong>Autó:</strong> ${escapeHtml(trip.auto_tipus || 'Személyautó')}</span>
            <span><strong>Férőhely:</strong> ${total}</span>
          </div>
          ${seatBar(free, total)}
          <p>${escapeHtml(trip.megjegyzes || '')}</p>
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
            <p style="margin:8px 0 0;color:var(--muted)">Térkép, külön fuvaroldal és gyors megosztás.</p>
            <div class="inline-pills" style="margin-top:12px">
              <button class="btn btn-ghost js-map-focus" data-origin="${escapeHtml(trip.indulas)}" data-destination="${escapeHtml(trip.erkezes)}">Térkép</button>
              <button class="btn btn-ghost js-share-trip" data-trip='${encodeURIComponent(JSON.stringify(trip))}'>Megosztás</button>
              <a class="btn btn-ghost" href="trip.html?id=${trip.id}">Részletek</a>
            </div>
          </div>
        </div>
        <div class="trip-actions">
          ${admin ? `
            <button class="btn btn-success js-trip-approve" data-id="${trip.id}">Jóváhagyás</button>
            <button class="btn btn-warning js-trip-pending" data-id="${trip.id}">Függőben</button>
            <button class="btn btn-danger js-trip-delete" data-id="${trip.id}">Törlés</button>
          ` : `
            <button class="btn btn-primary js-book-trip" data-trip='${encodeURIComponent(JSON.stringify(trip))}' ${free < 1 || isTripExpired(trip) ? 'disabled' : ''}>${isTripExpired(trip) ? 'Lejárt' : free < 1 ? 'Betelt' : 'Foglalás'}</button>
            <a class="btn btn-secondary" href="kapcsolat.html?tripId=${trip.id}&driverName=${encodeURIComponent(trip.nev || '')}&driverEmail=${encodeURIComponent(trip.email || '')}">Kérdés a sofőrnek</a>
          `}
        </div>
      </article>`;
  }

  function bookingCard(b, tripMap = {}) {
    const trip = tripMap[b.trip_id] || {};
    return `
      <article class="card admin-item">
        <div>
          <div class="inline-pills">${statusBadge(b.foglalasi_allapot || 'Új')} ${statusBadge(b.fizetesi_allapot || b.fizetesi_mod || 'Függőben')}</div>
          <h3 style="margin:12px 0 8px">${escapeHtml(trip.indulas || '')} → ${escapeHtml(trip.erkezes || '')}</h3>
          <div class="trip-meta">
            <span><strong>Foglaló:</strong> ${escapeHtml(b.nev || b.utas_nev || '')}</span>
            <span><strong>E-mail:</strong> ${escapeHtml(b.email || b.utas_email || '')}</span>
            <span><strong>Telefon:</strong> ${escapeHtml(b.telefon || '')}</span>
            <span><strong>Helyek:</strong> ${escapeHtml(b.foglalt_helyek || 1)}</span>
          </div>
          ${b.megjegyzes ? `<p>${escapeHtml(b.megjegyzes)}</p>` : ''}
        </div>
        <div>
          <div><strong>Sofőr:</strong> ${escapeHtml(trip.nev || '')}</div>
          <div><strong>Fuvar dátuma:</strong> ${formatTripDateTime(trip)}</div>
        </div>
        <div class="trip-actions">
          <button class="btn btn-success js-booking-approve" data-id="${b.id}" data-trip-id="${b.trip_id}" data-seats="${b.foglalt_helyek || 1}">Jóváhagyás</button>
          <button class="btn btn-warning js-booking-paid" data-id="${b.id}">Fizetve</button>
          <button class="btn btn-danger js-booking-cancel" data-id="${b.id}" data-trip-id="${b.trip_id}" data-seats="${b.foglalt_helyek || 1}">Törlés</button>
        </div>
      </article>`;
  }

  function buildGoogleMapsDirectionsUrl(origin = '', destination = '') {
    return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=driving`;
  }

  async function geocode(place) {
    const q = encodeURIComponent(place);
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${q}`);
    const data = await res.json();
    if (!data?.length) return null;
    return { lat: Number(data[0].lat), lon: Number(data[0].lon) };
  }

  async function focusRoute(origin, destination) {
    if (!window.L || !document.getElementById('tripsMap')) return;
    if (!activeMap) {
      activeMap = L.map('tripsMap').setView([47.4979, 19.0402], 7);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(activeMap);
    }
    try {
      const [a, b] = await Promise.all([geocode(origin), geocode(destination)]);
      if (!a || !b) return;
      activeMarkers.forEach(m => activeMap.removeLayer(m));
      activeMarkers = [];
      if (activeLine) activeMap.removeLayer(activeLine);
      const p1 = [a.lat, a.lon], p2 = [b.lat, b.lon];
      activeMarkers = [L.marker(p1).addTo(activeMap), L.marker(p2).addTo(activeMap)];
      activeLine = L.polyline([p1, p2]).addTo(activeMap);
      activeMap.fitBounds(L.latLngBounds([p1, p2]), { padding: [35, 35] });
      setTimeout(() => activeMap.invalidateSize(), 150);
    } catch (_) {}
  }

  async function shareTrip(trip) {
    const url = new URL('trip.html', location.href);
    url.searchParams.set('id', trip.id);
    const text = `FuvarVelünk: ${trip.indulas} → ${trip.erkezes} | ${trip.datum || ''} ${trip.ido || ''} | ${fmtCurrency(trip.ar)} Ft/fő`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'FuvarVelünk', text, url: url.toString() });
        return;
      }
    } catch (_) {}
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      alert('A megosztási szöveg vágólapra másolva.');
    } catch (_) {
      prompt('Másold ki ezt a linket:', url.toString());
    }
  }

  function openModal(html) {
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `<div class="card modal">${html}</div>`;
    wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.dataset.close === '1') wrap.remove(); });
    document.body.appendChild(wrap);
    return wrap;
  }

  async function notifyAdmin(type, payload) {
    if (!APP_CONFIG.notificationFunctionUrl) return;
    try {
      await fetch(APP_CONFIG.notificationFunctionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, payload, adminEmail: await AppAuth.fetchAdminEmail() })
      });
    } catch (_) {}
  }

  async function submitTrip(form) {
    const session = await AppAuth.getSession();
    const user = session?.user;
    const fd = new FormData(form);
    const totalSeats = Number(fd.get('osszHely') || 0);
    const freeSeats = Number(fd.get('szabadHely') || totalSeats || 0);
    const payment = Array.from(form.querySelectorAll('input[name="fizetesiMod"]:checked')).map(x => x.value === 'barion' ? 'transfer' : x.value);
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
      sofor_ertekeles: 5,
      approved: false
    };
    const { error } = await sb.from(tableTrips).insert([payload]);
    if (error) throw error;
    await notifyAdmin('uj_fuvar', payload);
  }

  async function submitBooking(trip, form) {
    const session = await AppAuth.getSession();
    const user = session?.user;
    const fd = new FormData(form);
    const seats = Number(fd.get('seats') || 1);
    const method = fd.get('paymentMethod')?.toString() || 'cash';
    const phone = fd.get('phone')?.toString().trim() || '';
    const note = fd.get('note')?.toString().trim() || '';
    const name = fd.get('name')?.toString().trim() || '';
    const userEmail = user?.email || '';
    const freeNow = getFreeSeats(trip);
    if (seats < 1) throw new Error('Legalább 1 helyet válassz.');
    if (seats > freeNow) throw new Error('Nincs ennyi szabad hely.');

    const booking = {
      trip_id: trip.id,
      user_id: user?.id || null,
      nev: name,
      email: userEmail,
      telefon: phone,
      foglalt_helyek: seats,
      fizetesi_mod: method,
      fizetesi_allapot: method === 'cash' ? 'Készpénz a sofőrnek' : 'Utalás a sofőrnek',
      foglalasi_allapot: method === 'cash' ? 'Jóváhagyva' : 'Fizetésre vár',
      megjegyzes: note,
      utas_email: userEmail,
      utas_nev: name
    };

    const { error } = await sb.from(tableBookings).insert([booking]);
    if (error) {
      const msg = String(error.message || '').toLowerCase();
      if (msg.includes('fizetesi_allapot') || msg.includes('foglalasi_allapot') || msg.includes('utas_email') || msg.includes('utas_nev')) {
        throw new Error('A foglalás táblában hiányzik néhány mező. Futtasd le az új supabase-setup.sql fájlt az SQL Editorban.');
      }
      throw error;
    }

    if (method === 'cash') {
      const remaining = Math.max(0, freeNow - seats);
      const { error: tripError } = await sb.from(tableTrips).update({
        helyek: remaining,
        szabad_helyek: remaining,
        statusz: remaining <= 0 ? 'Betelt' : trip.statusz
      }).eq('id', trip.id);
      if (tripError) throw tripError;
    }

    await notifyAdmin('uj_foglalas', booking);
    return booking;
  }

  function bindGlobalActions() {
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
        const paymentOptions = (trip.fizetesi_modok && Array.isArray(trip.fizetesi_modok) ? trip.fizetesi_modok : ['transfer', 'cash'])
          .map(m => `<option value="${m === 'cash' ? 'cash' : 'transfer'}">${m === 'cash' ? 'Készpénz a sofőrnek' : 'Utalás a sofőrnek'}</option>`)
          .join('');
        const wrap = openModal(`
          <div class="section-head"><div><span class="eyebrow">Foglalás</span><h2 style="margin:8px 0 0">${escapeHtml(trip.indulas)} → ${escapeHtml(trip.erkezes)}</h2></div><button class="btn btn-secondary" data-close="1">Bezárás</button></div>
          <form id="bookingForm" class="form-stack">
            <div class="grid-2">
              <label><span>Név</span><input name="name" required></label>
              <label><span>E-mail</span><input value="${escapeHtml(session?.user?.email || '')}" disabled></label>
            </div>
            <div class="grid-2">
              <label><span>Telefonszám</span><input name="phone" required></label>
              <label><span>Foglalt helyek</span><input name="seats" type="number" min="1" max="${getFreeSeats(trip)}" value="1" required></label>
            </div>
            <div class="grid-2">
              <label><span>Fizetési mód</span><select name="paymentMethod">${paymentOptions}</select></label>
              <label><span>Megjegyzés</span><input name="note" placeholder="pl. 1 nagy bőrönd"></label>
            </div>
            <div class="notice warn">A fizetés nem a weboldalon keresztül történik. Utalással a sofőrnek vagy készpénzben a sofőrnek tudsz fizetni.</div>
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
            msg.textContent = booking.fizetesi_mod === 'cash'
              ? 'Sikeres foglalás. A hely igényed rögzítve lett.'
              : 'Foglalás rögzítve. A fizetés a sofőrrel egyeztetve történik.';
            setTimeout(() => location.reload(), 900);
          } catch (err) {
            msg.textContent = err.message || 'Nem sikerült a foglalás.';
          }
        });
        return;
      }

      const approveTrip = e.target.closest('.js-trip-approve');
      if (approveTrip) {
        await sb.from(tableTrips).update({ statusz: 'Jóváhagyva', approved: true }).eq('id', approveTrip.dataset.id);
        location.reload();
        return;
      }

      const pendingTrip = e.target.closest('.js-trip-pending');
      if (pendingTrip) {
        await sb.from(tableTrips).update({ statusz: 'Függőben', approved: false }).eq('id', pendingTrip.dataset.id);
        location.reload();
        return;
      }

      const deleteTrip = e.target.closest('.js-trip-delete');
      if (deleteTrip) {
        if (confirm('Biztosan törlöd ezt a fuvart?')) {
          await sb.from(tableTrips).delete().eq('id', deleteTrip.dataset.id);
          location.reload();
        }
        return;
      }

      const approveBooking = e.target.closest('.js-booking-approve');
      if (approveBooking) {
        const id = approveBooking.dataset.id;
        const tripId = approveBooking.dataset.tripId;
        const seats = Number(approveBooking.dataset.seats || 1);
        const { data: trip } = await sb.from(tableTrips).select('id,helyek,szabad_helyek,statusz').eq('id', tripId).single();
        const free = Number(trip?.szabad_helyek ?? trip?.helyek ?? 0);
        if (trip && free >= seats) {
          const remaining = Math.max(0, free - seats);
          await sb.from(tableTrips).update({ helyek: remaining, szabad_helyek: remaining, statusz: remaining <= 0 ? 'Betelt' : 'Jóváhagyva' }).eq('id', tripId);
          await sb.from(tableBookings).update({ foglalasi_allapot: 'Jóváhagyva', fizetesi_allapot: 'Készpénz a sofőrnek' }).eq('id', id);
        }
        location.reload();
        return;
      }

      const paidBooking = e.target.closest('.js-booking-paid');
      if (paidBooking) {
        await sb.from(tableBookings).update({ fizetesi_allapot: 'Fizetve', foglalasi_allapot: 'Jóváhagyva' }).eq('id', paidBooking.dataset.id);
        location.reload();
        return;
      }

      const cancelBooking = e.target.closest('.js-booking-cancel');
      if (cancelBooking) {
        if (confirm('Biztosan törlöd ezt a foglalást?')) {
          await sb.from(tableBookings).delete().eq('id', cancelBooking.dataset.id);
          location.reload();
        }
        return;
      }
    });
  }

  async function initHome() {
    const featured = document.getElementById('featuredTrips');
    if (!featured) return;
    try {
      const trips = (await fetchApprovedTrips({})).slice(0, 3);
      const ratingMap = await fetchRatingsMap(trips);
      featured.innerHTML = trips.length ? trips.map(t => `
        <article class="card">
          <div class="inline-pills">${buildTripBadges(t)}</div>
          <h3>${escapeHtml(t.indulas)} → ${escapeHtml(t.erkezes)}</h3>
          <p class="lead">${formatTripDateTime(t)} • ${fmtCurrency(t.ar)} Ft / fő</p>
          <div style="margin:8px 0 14px">${starRating(ratingMap[t.id]?.avg || Number(t.sofor_ertekeles || 0), ratingMap[t.id]?.count || 0)}</div>
          ${seatBar(getFreeSeats(t), getTotalSeats(t))}
          <p>${escapeHtml(t.megjegyzes || '')}</p>
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
    if (document.getElementById('tripsMap') && window.L && !activeMap) {
      activeMap = L.map('tripsMap').setView([47.4979, 19.0402], 7);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(activeMap);
    }

    const params = new URLSearchParams(location.search);
    const originInput = document.getElementById('filterOrigin');
    const destinationInput = document.getElementById('filterDestination');
    const dateInput = document.getElementById('filterDate');
    originInput.value = params.get('origin') || '';
    destinationInput.value = params.get('destination') || '';
    dateInput.value = params.get('date') || '';
    const list = document.getElementById('tripsList');
    const recWrap = document.getElementById('recommendedTrips');

    async function render() {
      list.innerHTML = '<div class="empty-state">Betöltés...</div>';
      if (recWrap) recWrap.innerHTML = '';
      try {
        const filters = { origin: originInput.value.trim(), destination: destinationInput.value.trim(), date: dateInput.value };
        const trips = await fetchApprovedTrips(filters);
        const ratingMap = await fetchRatingsMap(trips);
        list.innerHTML = trips.length ? trips.map(t => tripCard(t, false, ratingMap)).join('') : '<div class="empty-state">Nincs a keresésnek megfelelő fuvar.</div>';
        if (trips[0]) await focusRoute(trips[0].indulas, trips[0].erkezes);
        if (!trips.length && recWrap) {
          const all = await fetchApprovedTrips({});
          const rec = buildRecommendations(all, filters);
          const recRatings = await fetchRatingsMap(rec);
          recWrap.innerHTML = rec.length ? `<h3>Ajánlott fuvarok</h3>${rec.map(t => tripCard(t, false, recRatings)).join('')}` : '';
        }
      } catch (_) {
        list.innerHTML = '<div class="empty-state">A fuvarok jelenleg nem tölthetők be.</div>';
      }
    }

    await render();
    document.getElementById('tripFilterForm')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await render();
    });
  }

  async function initTripFormPage() {
    const form = document.getElementById('tripForm');
    if (!form) return;
    const ok = await AppAuth.requireAuth('fuvar-feladas.html');
    if (!ok) return;
    const session = await AppAuth.getSession();
    const user = session?.user;
    form.querySelector('[name="contactEmail"]').value = user?.email || '';
    form.querySelector('[name="contactEmail"]').readOnly = true;
    const driverNameInput = form.querySelector('[name="driverName"]');
    if (driverNameInput && !driverNameInput.value) {
      driverNameInput.value = user?.user_metadata?.name || user?.user_metadata?.full_name || (user?.email ? String(user.email).split('@')[0] : '');
    }
    const total = form.querySelector('[name="osszHely"]');
    const free = form.querySelector('[name="szabadHely"]');
    total.addEventListener('input', () => free.value = total.value);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = document.getElementById('tripFormMsg');
      msg.textContent = 'Mentés...';
      try {
        await submitTrip(form);
        msg.textContent = 'A fuvar rögzítve lett. Admin jóváhagyás után megjelenik a listában.';
        form.reset();
        form.querySelector('[name="contactEmail"]').value = user?.email || '';
      } catch (err) {
        msg.textContent = err.message || 'Nem sikerült menteni.';
      }
    });
  }

  async function initAuthPage() {
    if (!document.getElementById('loginForm')) return;
    const { session } = await AppAuth.updateNav();
    if (session) {
      location.href = (await AppAuth.isAdmin()) ? 'admin.html' : 'index.html';
      return;
    }
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
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

  function renderAdminStats(trips, bookings) {
    const box = document.getElementById('adminStats');
    if (!box) return;
    const activeTrips = trips.filter(t => !isTripExpired(t));
    const fullTrips = activeTrips.filter(isTripFull);
    const approvedTrips = trips.filter(t => normStatus(t.statusz).includes('jóvá'));
    const pendingTrips = trips.filter(t => normStatus(t.statusz).includes('függ'));
    const passengers = bookings.reduce((sum, b) => sum + Number(b.foglalt_helyek || 1), 0);
    const html = [
      ['Összes fuvar', trips.length],
      ['Jóváhagyott', approvedTrips.length],
      ['Függőben', pendingTrips.length],
      ['Betelt fuvar', fullTrips.length],
      ['Foglalások', bookings.length],
      ['Összes utashely', passengers]
    ].map(([label, value]) => `<article class="card stat-card"><div class="stat-label">${label}</div><div class="stat-value">${value}</div></article>`).join('');
    box.innerHTML = html;
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
      settingsForm.email.value = (settings?.contact_email && !String(settings.contact_email).includes('utazz')) ? settings.contact_email : APP_CONFIG.contactEmail;
      settingsForm.phone.value = settings?.contact_phone || APP_CONFIG.contactPhone;
      settingsForm.city.value = settings?.city || APP_CONFIG.city;
      settingsForm.adminEmail.value = settings?.admin_email || APP_CONFIG.adminEmail;
      settingsForm.description.value = settings?.description || 'Gyors és biztonságos fuvarmegosztó felület utasoknak és sofőröknek.';
      settingsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(settingsForm);
        msg.textContent = 'Mentés...';
        const payload = {
          site_name: fd.get('siteName'),
          company_name: fd.get('companyName'),
          contact_email: fd.get('email'),
          contact_phone: fd.get('phone'),
          city: fd.get('city'),
          admin_email: fd.get('adminEmail'),
          description: fd.get('description')
        };
        if (settings?.id) payload.id = settings.id;
        let error = null;
        if (settings?.id) ({ error } = await sb.from(tableSettings).update(payload).eq('id', settings.id));
        else ({ error } = await sb.from(tableSettings).insert([payload]));
        msg.textContent = error ? 'Nem sikerült menteni.' : 'Mentve.';
        if (!error) location.reload();
      });
    }

    try {
      const [trips, bookings] = await Promise.all([fetchAllTrips(), fetchBookings()]);
      const ratingMap = await fetchRatingsMap(trips);
      renderAdminStats(trips, bookings);
      tripsWrap.innerHTML = trips.length ? trips.map(t => tripCard(t, true, ratingMap)).join('') : '<div class="empty-state">Még nincs beküldött fuvar.</div>';
      const tripMap = Object.fromEntries(trips.map(t => [String(t.id), t]));
      bookingsWrap.innerHTML = bookings.length ? bookings.map(b => bookingCard(b, tripMap)).join('') : '<div class="empty-state">Még nincs foglalás.</div>';
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
    const allTrips = await fetchApprovedTrips({}).catch(() => []);
    const trips = allTrips.filter(t => (email && t.email === email) || (name && t.nev === name));
    const trip = trips[0] || { nev: name || 'Ismeretlen sofőr', email: email || '', telefon: '', sofor_ertekeles: 0 };
    const ratings = await fetchRatingsMap(trips);
    const values = trips.map(t => ratings[t.id]?.avg).filter(Boolean);
    const counts = trips.reduce((sum, t) => sum + Number(ratings[t.id]?.count || 0), 0);
    const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : Number(trip.sofor_ertekeles || 0);
    box.innerHTML = `
      <div class="driver-avatar">${getInitials(trip.nev)}</div>
      <div class="driver-meta">
        <h2>${escapeHtml(trip.nev || 'Ismeretlen sofőr')}</h2>
        <div class="rating-stars">${getStars(avg || 0)} <span style="color:#cddcff;letter-spacing:0">${avg ? avg.toFixed(1) : 'Nincs értékelés'}${counts ? ` · ${counts} értékelés` : ''}</span></div>
        <p style="margin:10px 0 0">Kapcsolat: ${escapeHtml(trip.email || '-')} ${trip.telefon ? '· ' + escapeHtml(trip.telefon) : ''}</p>
        <p style="margin:8px 0 0">Aktív fuvarok száma: ${trips.length}</p>
      </div>`;
    const tripsBox = document.getElementById('driverTrips');
    if (tripsBox) {
      tripsBox.innerHTML = trips.length ? trips.map(t => `
        <article class="card">
          <div class="eyebrow">${escapeHtml(t.indulas || '')} → ${escapeHtml(t.erkezes || '')}</div>
          <h3>${escapeHtml(t.indulas || '')} → ${escapeHtml(t.erkezes || '')}</h3>
          <p>${formatTripDateTime(t)} · ${fmtCurrency(t.ar || 0)} Ft/fő</p>
          <a class="btn btn-secondary" href="trip.html?id=${t.id}">Részletek</a>
        </article>`).join('') : '<div class="notice">Ennél a sofőrnél még nincs aktív fuvar.</div>';
    }
    const contact = document.getElementById('driverContactBox');
    if (contact) contact.innerHTML = `<strong>${escapeHtml(trip.nev || 'Sofőr')}</strong><br>${escapeHtml(trip.email || '-')}${trip.telefon ? '<br>' + escapeHtml(trip.telefon) : ''}`;
  }

  async function initContactPage() {
    const form = document.getElementById('contactForm');
    const driverForm = document.getElementById('driverQuestionForm');
    const driverSection = document.getElementById('driverQuestionSection');
    const params = new URLSearchParams(location.search);

    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        const subject = encodeURIComponent('Weboldal kérdés / hibajelzés - FuvarVelünk');
        const body = encodeURIComponent(`Név: ${fd.get('name')}\nE-mail: ${fd.get('email')}\n\nÜzenet:\n${fd.get('message')}`);
        location.href = `mailto:${APP_CONFIG.contactEmail}?subject=${subject}&body=${body}`;
      });
    }

    if (!driverForm) return;
    const hasDriverContext = params.get('driverEmail') || params.get('driverName');
    if (driverSection) driverSection.style.display = hasDriverContext ? '' : 'none';

    const session = await AppAuth.getSession();
    if (session?.user?.email) {
      const emailInput = driverForm.querySelector('[name="email"]');
      if (emailInput) emailInput.value = session.user.email;
      const nameInput = driverForm.querySelector('[name="name"]');
      if (nameInput && !nameInput.value) {
        nameInput.value = session.user.user_metadata?.name || session.user.user_metadata?.full_name || session.user.email.split('@')[0];
      }
    }

    driverForm.querySelector('[name="tripId"]').value = params.get('tripId') || '';
    driverForm.querySelector('[name="driverName"]').value = params.get('driverName') || '';
    driverForm.querySelector('[name="driverEmail"]').value = params.get('driverEmail') || '';
    const info = document.getElementById('driverQuestionInfo');
    if (info && hasDriverContext) {
      info.innerHTML = `Sofőr: <strong>${escapeHtml(params.get('driverName') || 'Ismeretlen')}</strong><br>E-mail: ${escapeHtml(params.get('driverEmail') || '')}`;
    }

    driverForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const msg = document.getElementById('driverQuestionMsg');
      const ok = await AppAuth.requireAuth(`kapcsolat.html?${params.toString()}`);
      if (!ok) return;
      const fd = new FormData(driverForm);
      const subject = encodeURIComponent(`Kérdés a sofőrnek - ${fd.get('driverName') || ''}`);
      const body = encodeURIComponent(
        `Fuvar azonosító: ${fd.get('tripId') || '-'}\n` +
        `Feladó neve: ${fd.get('name')}\n` +
        `Feladó e-mail: ${fd.get('email')}\n\n` +
        `Üzenet:\n${fd.get('message')}`
      );
      const driverEmail = fd.get('driverEmail') || APP_CONFIG.contactEmail;
      msg.textContent = 'Megnyílik az üzenet küldése...';
      location.href = `mailto:${driverEmail}?subject=${subject}&body=${body}`;
    });
  }

  async function initTripDetailPage() {
    const wrap = document.getElementById('tripDetail');
    if (!wrap) return;
    const id = new URLSearchParams(location.search).get('id');
    if (!id) {
      wrap.innerHTML = '<div class="empty-state">A fuvar nem található.</div>';
      return;
    }
    try {
      const trip = await fetchTripById(id);
      if (!trip || isTripExpired(trip)) {
        wrap.innerHTML = '<div class="empty-state">A fuvar nem található vagy már lejárt.</div>';
        return;
      }
      const ratingMap = await fetchRatingsMap([trip]);
      wrap.innerHTML = tripCard(trip, false, ratingMap) + `
        <section class="card detail-extra">
          <h2>Sofőr profil</h2>
          <p><strong>${escapeHtml(trip.nev || '')}</strong></p>
          <p>${starRating(ratingMap[trip.id]?.avg || Number(trip.sofor_ertekeles || 0), ratingMap[trip.id]?.count || 0)}</p>
          <p>Kapcsolat: ${escapeHtml(trip.email || '')}${trip.telefon ? ' · ' + escapeHtml(trip.telefon) : ''}</p>
          ${trip.bankszamla ? `<p><strong>Bankszámla:</strong> ${escapeHtml(trip.bankszamla)}</p>` : ''}
          <div class="inline-pills" style="margin-top:12px">
            <a class="btn btn-secondary" href="driver.html?name=${encodeURIComponent(trip.nev || '')}&email=${encodeURIComponent(trip.email || '')}">Sofőr profil</a>
            <a class="btn btn-secondary" href="kapcsolat.html?tripId=${trip.id}&driverName=${encodeURIComponent(trip.nev || '')}&driverEmail=${encodeURIComponent(trip.email || '')}">Kérdés a sofőrnek</a>
            <a class="btn btn-ghost" href="${buildGoogleMapsDirectionsUrl(trip.indulas || '', trip.erkezes || '')}" target="_blank" rel="noopener">Google Térkép</a>
          </div>
        </section>`;
      await focusRoute(trip.indulas, trip.erkezes);
    } catch (_) {
      wrap.innerHTML = '<div class="empty-state">A fuvar betöltése nem sikerült.</div>';
    }
  }

  async function init() {
    await AppAuth.updateNav();
    AppAuth.bindLogout();
    AppAuth.watchAuth();
    await applySettings();
    bindGlobalActions();
    await initHome();
    await initTripsPage();
    await initTripFormPage();
    await initAuthPage();
    await initAdminPage();
    await initContactPage();
    await initDriverPage();
    await initTripDetailPage();
  }

  return { init, focusRoute };
})();

document.addEventListener('DOMContentLoaded', () => { App.init(); });
