/* Trip tools layered onto travelOS(): route links, calendar export, ticket photos, currency
   calculator, flights, weather and hike checks, last trains, the day map, opening-hours and
   transfer checks, a bring list and nearby search. Loaded after app.js, before Alpine. */
(() => {
  'use strict';

  // ---------- Constants (thresholds are deliberate, and shown alongside the raw numbers) ----------
  const TRANSPORT_ICONS = new Set(['plane', 'plane-takeoff', 'plane-landing', 'train', 'bus', 'car', 'ship', 'luggage']);
  // Cathay online check-in opens 48 h before departure (members certainly; others may see it from
  // 24 h) and closes 60 min before. US-bound boarding passes are only issued from 24 h (TSA).
  const CHECKIN_OPENS_HOURS = 48;
  const CHECKIN_US_HOURS = 24;
  const CHECKIN_FALLBACK_HOURS = 24;
  const CHECKIN_CLOSES_MIN = 60;
  const CHECKIN_URL = 'https://www.cathaypacific.com/mb/#!/en_US/olci/login';
  const HIKE_NO_GO = { gustKmh: 50, rainPct: 70 };
  const HIKE_CAUTION = { gustKmh: 35, rainPct: 40, visKm: 1 };
  const RAIN_BANNER_PCT = 60;
  const LIVE_REFRESH_MS = 20 * 60 * 1000;
  // Older than this, live data is treated as missing rather than shown as current.
  const LIVE_MAX_AGE = { hkowarn: 2 * 3600000, openmeteo: 12 * 3600000, mtr: 3 * 60000 };
  const MTR_REFRESH_MS = 60 * 1000;
  const FETCH_TIMEOUT_MS = 8000;
  const MAX_PHOTOS_PER_BOOKING = 8;
  const PHOTO_MAX_EDGE = 1600;
  const GOOGLE_MAX_WAYPOINTS = 3;
  const APPLE_MAX_STOPS = 14;
  const ROUTE_SPLIT_KM = 15;
  const TRIP_START = Date.parse('2026-11-28T06:15:00-05:00');
  const TRIP_END = Date.parse('2026-12-13T19:05:00-05:00');

  const FLIGHTS = [
    { id: 'f-cx841', no: 'CX841', title: 'Flight CX841 · JFK → HKG', from: 'JFK T8', to: 'HKG T1', fromTz: 'America/New_York', toTz: 'Asia/Hong_Kong', dep: '2026-11-28T09:00:00-05:00', arr: '2026-11-29T14:05:00+08:00', dayId: 'day-01', usBound: false },
    { id: 'f-cx472', no: 'CX472', title: 'Flight CX472 · HKG → TPE', from: 'HKG T1', to: 'TPE T1', fromTz: 'Asia/Hong_Kong', toTz: 'Asia/Taipei', dep: '2026-11-29T15:45:00+08:00', arr: '2026-11-29T17:35:00+08:00', dayId: 'day-02', usBound: false },
    { id: 'f-cx495', no: 'CX495', title: 'Flight CX495 · TPE → HKG', from: 'TPE T1', to: 'HKG T1', fromTz: 'Asia/Taipei', toTz: 'Asia/Hong_Kong', dep: '2026-12-08T13:20:00+08:00', arr: '2026-12-08T15:25:00+08:00', dayId: 'day-11', usBound: false },
    { id: 'f-cx840', no: 'CX840', title: 'Flight CX840 · HKG → JFK', from: 'HKG T1', to: 'JFK T8', fromTz: 'Asia/Hong_Kong', toTz: 'America/New_York', dep: '2026-12-13T16:35:00+08:00', arr: '2026-12-13T19:05:00-05:00', dayId: 'day-16', usBound: true }
  ];

  // Official timetables fetched 2026-11-11 (data/live-research.json has the full notes).
  const TPE_METRO = 'https://web.metro.taipei/img/ALL/TTPDF/';
  const LAST_LEGS = [
    { dayId: 'day-02', afterItemTitle: 'Ximending at Night', mode: 'metro', label: '西門 → 台北車站', last: '00:46', tz: 'Asia/Taipei', note: 'Blue line toward 南港展覽館, direct', source: TPE_METRO + '086.pdf' },
    { dayId: 'day-03', afterItemTitle: 'E7PLAY Sanchong — Bowling, Billiards, Darts (Plan A)', mode: 'metro', label: '台北橋 → 台北車站', last: '00:28', tz: 'Asia/Taipei', note: 'Orange line toward 南勢角, change at 民權西路 or 忠孝新生', source: TPE_METRO + '127.pdf' },
    { dayId: 'day-03', afterItemTitle: null, mode: 'metro', label: '西門 → 台北車站', last: '00:46', tz: 'Asia/Taipei', note: 'Plan C (staying in Wanhua): Blue line toward 南港展覽館, direct', source: TPE_METRO + '086.pdf', fallback: true },
    { dayId: 'day-04', afterItemTitle: 'E7PLAY Sanchong — Bowling, Billiards, Darts', mode: 'metro', label: '台北橋 → 台北車站', last: '00:28', tz: 'Asia/Taipei', note: 'Orange line toward 南勢角, change at 民權西路 or 忠孝新生', source: TPE_METRO + '127.pdf' },
    { dayId: 'day-04', afterItemTitle: null, mode: 'metro', label: '劍潭 → 台北車站', last: '00:33', tz: 'Asia/Taipei', note: 'If you skip E7PLAY: Red line toward 廣慈/奉天宮, direct', source: TPE_METRO + '057.pdf', fallback: true },
    { dayId: 'day-06', afterItemTitle: null, mode: 'metro', label: '台北橋 → 台北車站', last: '00:28', tz: 'Asia/Taipei', note: 'E7PLAY Sanchong fallback: Orange line toward 南勢角, change at 民權西路 or 忠孝新生', source: TPE_METRO + '127.pdf', fallback: true },
    { dayId: 'day-08', afterItemTitle: 'Wusheng Night Market — Food & Games', mode: 'rail', label: '台南 → 高雄', last: '23:46', tz: 'Asia/Taipei', note: 'TRA 自強 281, arrives 00:21; earlier 自強 149 at 23:22', source: 'https://tip.railway.gov.tw/tra-tip-web/tip/tip001/tip112/gobytime' },
    { dayId: 'day-09', afterItemTitle: 'Liuhe / Formosa Boulevard Late Pass', mode: 'metro', label: '美麗島 → 高雄車站', last: '00:21', tz: 'Asia/Taipei', note: 'KRTC Red line toward 岡山', source: 'https://www.krtc.com.tw/Guide/first_and_last_train?KRTCStation=R10' },
    { dayId: 'day-12', afterItemTitle: 'Happy Valley — International Jockeys\' Championship', mode: 'ferry', label: 'Star Ferry Wan Chai → TST', last: '23:00', tz: 'Asia/Hong_Kong', note: 'Mon–Sat timetable', source: 'https://www.starferry.com.hk/en/service' },
    { dayId: 'day-12', afterItemTitle: 'Happy Valley — International Jockeys\' Championship', mode: 'ferry', label: 'Star Ferry Central → TST', last: '23:30', tz: 'Asia/Hong_Kong', note: 'Every day', source: 'https://www.starferry.com.hk/en/service' },
    { dayId: 'day-14', afterItemTitle: 'Big Buddha (20 min)', mode: 'bus', label: 'NLB 21 Ngong Ping → Tai O', last: '18:15', tz: 'Asia/Hong_Kong', note: 'Mon–Sat timetable', source: 'https://www.nlb.com.hk/route/detail/19' },
    { dayId: 'day-14', afterItemTitle: 'Winter Wonderland in Central', mode: 'ferry', label: 'Star Ferry Central → TST', last: '23:30', tz: 'Asia/Hong_Kong', note: 'Every day', source: 'https://www.starferry.com.hk/en/service' },
    { dayId: 'day-15', afterItemTitle: 'Wan Chai Active Block', mode: 'ferry', label: 'Star Ferry Wan Chai → TST', last: '23:00', tz: 'Asia/Hong_Kong', note: 'Mon–Sat timetable', source: 'https://www.starferry.com.hk/en/service' }
  ];

  // Opening hours for the stops where a clash would matter, from data/details (checked 2026-11-11).
  const HOURS = {
    'day-04|Shilin Residence Chrysanthemum Show': { open: '08:00', close: '19:00', note: 'Outdoor show areas' },
    'day-04|Shilin Night Market — Games & Food': { open: '17:00', close: '24:00' },
    'day-06|Taipei 101 Observatory (89F)': { open: '10:00', close: '21:00', lastEntry: '20:15' },
    'day-06|Raohe Night Market': { open: '17:00', close: '24:00' },
    'day-07|E7PLAY Sanduo — Bowling, Billiards, Darts, Arcade': { open: '08:30', close: '26:30', note: 'Under-18s out by midnight' },
    'day-07|Mini Suzuka Kart (If the Wait Is Short)': { open: '11:00', close: '20:30', lastEntry: '20:00', note: 'Weekends open 30 min earlier' },
    'day-08|Ten Drum Cultural Village': { open: '09:30', close: '17:50', days: 'Sat', note: 'Some halls pause 11:45–13:10' },
    'day-08|Wusheng Night Market — Food & Games': { open: '17:00', close: '24:00', closedDays: 'Sun,Mon,Tue,Thu' },
    'day-13|Kowloon Walled City: A Cinematic Journey (If a Slot Is Free)': { open: '09:00', close: '19:00' },
    'day-13|Kai Tak Buffer — JOYPOLIS SPORTS (Backup Only)': { open: '10:30', close: '18:30', lastEntry: '18:30', note: '3/F Future Arena to 8:30 PM' },
    'day-14|Hong Kong Observation Wheel': { open: '11:00', close: '23:00', lastEntry: '22:30', days: 'Fri,Sat,Sun' },
    'day-15|Yat Tung Heen — Michelin-Star Dim Sum Brunch #2': { open: '10:00', close: '16:00', lastEntry: '15:30', days: 'Sat,Sun' },
    'day-16|Kowloon Station Bag Drop': { open: '06:00', close: '15:00', note: 'Cathay in-town check-in' }
  };

  // Rough minutes needed to reach a stop where the plan is tight. includesSelf: the stop is the move itself.
  const LEG_MIN = {
    'day-07|Collect Luggage → Airline Inn Check-In': { min: 25, includesSelf: true },
    'day-13|Finish Wang Tau Hom / Tsz Wan Shan Side → Taxi to Kowloon Walled City Park': { min: 20, includesSelf: true },
    'day-14|Bus 21: Ngong Ping → Tai O (1:20 PM)': { min: 5 },
    'day-14|Bus 11: Tai O → Tung Chung (3:45 PM)': { min: 5 },
    'day-14|Star Ferry → TST': { min: 10, includesSelf: true }
  };

  // Summits (OSM peak nodes, cross-checked with Wikipedia/Wikidata; data/live-research.json).
  const SUMMITS = {
    qixing: [25.17070, 121.55344, 'Qixing Main Peak'],
    teapot: [25.10636, 121.86594, 'Teapot Mountain'],
    lionrock: [22.35301, 114.18717, 'Lion Rock'],
    lantau: [22.24930, 113.91994, 'Lantau Peak']
  };
  const HIKES = {
    'day-04': { summit: 'qixing', from: '10:00', to: '13:15', name: 'Qixing Mountain' },
    'day-05': { summit: 'teapot', from: '12:00', to: '13:45', name: 'Teapot Mountain' },
    'day-13': { summit: 'lionrock', from: '08:30', to: '11:00', name: 'Lion Rock' },
    'day-14': { summit: 'lantau', from: '08:45', to: '11:30', name: 'Lantau Peak' }
  };
  const OUTDOOR_EVENING = /Night Market|Winter Wonderland|Observation Wheel|Tamsui|Aqua Luna|Star Ferry|Temple Street|Harbour|Procession|Festival|Love River|Rainbow Bridge|Kart/;
  const HK_DAYS = new Set(['day-11', 'day-12', 'day-13', 'day-14', 'day-15', 'day-16']);
  const MTR_DEST = { TSW: 'Tsuen Wan', CEN: 'Central', AWE: 'AsiaWorld-Expo', AIR: 'Airport', HOK: 'Hong Kong' };
  // HKO warnsum codes (Open Data API documentation), shown by name, never as a bare code.
  const HKO_NAMES = {
    WRAINA: 'Amber Rainstorm Warning', WRAINR: 'Red Rainstorm Warning', WRAINB: 'Black Rainstorm Warning',
    TC1: 'Typhoon Signal No. 1', TC3: 'Typhoon Signal No. 3',
    TC8NE: 'Typhoon Signal No. 8 (Northeast)', TC8SE: 'Typhoon Signal No. 8 (Southeast)', TC8NW: 'Typhoon Signal No. 8 (Northwest)', TC8SW: 'Typhoon Signal No. 8 (Southwest)',
    TC9: 'Typhoon Signal No. 9', TC10: 'Typhoon Signal No. 10',
    WHOT: 'Very Hot Weather Warning', WCOLD: 'Cold Weather Warning', WMSGNL: 'Strong Monsoon Signal',
    WFIRER: 'Red Fire Danger Warning', WFIREY: 'Yellow Fire Danger Warning', WFROST: 'Frost Warning',
    WL: 'Landslip Warning', WTMW: 'Tsunami Warning', WTS: 'Thunderstorm Warning',
    WFNTSA: 'Flooding in the northern New Territories'
  };

  // ---------- Pure helpers ----------
  const hm = text => { const m = String(text || '').match(/^(\d{1,2}):(\d{2})$/); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; };
  const clock12 = minutes => {
    if (!Number.isFinite(minutes)) return '';
    const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
    const h = Math.floor(m / 60), mm = m % 60;
    return `${h % 12 || 12}${mm ? ':' + String(mm).padStart(2, '0') : ''} ${h < 12 ? 'AM' : 'PM'}`;
  };
  const durationText = ms => {
    const mins = Math.max(0, Math.round(ms / 60000));
    const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
    if (d) return `${d}d ${h}h`;
    if (h) return m ? `${h}h ${m}m` : `${h}h`;
    return `${m}m`;
  };
  const shortHash = text => { let h = 5381; for (const ch of String(text)) h = ((h * 33) ^ ch.codePointAt(0)) >>> 0; return h.toString(36); };
  const enc = value => encodeURIComponent(String(value || '').trim());
  const stopKey = (dayId, title) => `${dayId}|${title}`;
  const weekdayOf = dateString => (String(dateString || '').match(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/) || [])[1] || '';
  const kmBetween = (a, b) => {
    const r = Math.PI / 180;
    const h = Math.sin((b[0] - a[0]) * r / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin((b[1] - a[1]) * r / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(h));
  };

  function tzOffsetMinutes(epoch, tz) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(epoch));
    const get = type => Number(parts.find(p => p.type === type).value);
    return Math.round((Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second')) - epoch) / 60000);
  }

  // Local wall-clock minutes (may exceed 1440 for past-midnight ends) in tz → UTC epoch.
  function zonedTimeToUtc(year, month, day, minutes, tz) {
    const roll = Math.floor(minutes / 1440);
    const mins = minutes - roll * 1440;
    const guess = Date.UTC(year, month - 1, day + roll, Math.floor(mins / 60), mins % 60);
    const first = tzOffsetMinutes(guess, tz);
    let utc = guess - first * 60000;
    const second = tzOffsetMinutes(utc, tz);
    if (second !== first) utc = guess - second * 60000;
    return utc;
  }

  const icsStamp = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const icsEscape = value => String(value || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const utf8 = new TextEncoder();
  // RFC 5545: lines over 75 octets fold with CRLF + space, never inside a UTF-8 character.
  function foldIcsLine(line) {
    const out = [];
    let current = '', bytes = 0;
    for (const ch of line) {
      const size = utf8.encode(ch).length;
      if (bytes + size > 75) { out.push(current); current = ' ' + ch; bytes = 1 + size; }
      else { current += ch; bytes += size; }
    }
    out.push(current);
    return out.join('\r\n');
  }

  function fetchJson(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    return fetch(url, { signal: controller.signal, cache: 'no-store' })
      .then(response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
      .finally(() => clearTimeout(timer));
  }

  // ---------- Live data cache (module level: never reactive) ----------
  const LIVE = {};
  const liveKey = name => `twhk_live_${name}_v1`;
  function readLiveRaw(name) {
    if (LIVE[name]) return LIVE[name];
    try { const raw = JSON.parse(localStorage.getItem(liveKey(name)) || 'null'); if (raw && raw.at && raw.data) LIVE[name] = raw; } catch (_) {}
    return LIVE[name] || null;
  }
  // Display reads: expired data counts as missing, so an old warning never looks current.
  function readLive(name, maxAgeMs = LIVE_MAX_AGE[name.startsWith('mtr_') ? 'mtr' : name]) {
    const entry = readLiveRaw(name);
    if (!entry) return null;
    return Number.isFinite(maxAgeMs) && Date.now() - entry.at > maxAgeMs ? null : entry;
  }
  function writeLive(name, data) {
    LIVE[name] = { at: Date.now(), data };
    try { localStorage.setItem(liveKey(name), JSON.stringify(LIVE[name])); } catch (_) {}
  }

  const WEATHER_PLACES = () => {
    const places = {};
    for (const [key, value] of Object.entries(typeof SUN_COORDS === 'object' ? SUN_COORDS : {})) places[key] = [value[0], value[1]];
    for (const [key, value] of Object.entries(SUMMITS)) places['summit-' + key] = [value[0], value[1]];
    return places;
  };

  function compactOpenMeteo(json, keys) {
    const list = Array.isArray(json) ? json : [json];
    const out = { time: list[0]?.hourly?.time || [], places: {} };
    list.forEach((entry, index) => {
      const h = entry?.hourly || {};
      out.places[keys[index]] = { t: h.temperature_2m || [], p: h.precipitation_probability || [], g: h.wind_gusts_10m || [], c: h.cloud_cover || [], v: h.visibility || [] };
    });
    return out;
  }

  // ---------- Ticket photos (IndexedDB; blobs never enter Alpine state) ----------
  const photoDb = (() => {
    let opening = null;
    const open = () => opening || (opening = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) { reject(new Error('No IndexedDB')); return; }
      const request = indexedDB.open('twhk-files', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', { keyPath: 'id' }).createIndex('bookingId', 'bookingId');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch(error => { opening = null; throw error; }));
    const run = (mode, body) => open().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction('photos', mode);
      const req = body(tx.objectStore('photos'));
      tx.oncomplete = () => resolve(req ? req.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    }));
    return {
      put: record => run('readwrite', store => store.put(record)),
      all: () => run('readonly', store => store.getAll()),
      get: id => run('readonly', store => store.get(id)),
      byBooking: bookingId => run('readonly', store => store.index('bookingId').getAll(bookingId)),
      delete: id => run('readwrite', store => store.delete(id))
    };
  })();

  let photoExports = null;
  let photoExportTimer = 0;
  let photoGen = 0;
  let builtGen = -1;
  let viewerUrl = '';
  let viewerToken = 0;
  const PHOTO_PROBE_BOOKING = '__probe__';
  const PHOTOS_UNAVAILABLE = 'Ticket photos need the Home Screen app (not a private tab)';
  // The import limit is 50 MB; leave headroom for the rest of the backup.
  const BACKUP_MAX_BYTES = 45 * 1024 * 1024;
  // Photos are stored as bytes (private-mode WebKit can't store Blobs); older records hold a Blob.
  const recordBlob = record => {
    if (!record) return null;
    if (record.blob instanceof Blob) return record.blob;
    return record.bytes ? new Blob([record.bytes], { type: record.type || 'image/jpeg' }) : null;
  };
  const blobToBase64 = blob => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  const base64ToBlob = (data, type) => {
    const bin = atob(String(data || ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: type || 'image/jpeg' });
  };

  async function decodeImage(file) {
    if (typeof createImageBitmap === 'function') {
      try { return await createImageBitmap(file); } catch (_) {}
    }
    const url = URL.createObjectURL(file);
    try {
      return await new Promise((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = url; });
    } finally { setTimeout(() => URL.revokeObjectURL(url), 0); }
  }

  async function shrinkToJpeg(file) {
    const image = await decodeImage(file);
    const w0 = image.width || image.naturalWidth, h0 = image.height || image.naturalHeight;
    if (!w0 || !h0) throw new Error('Empty image');
    const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(w0, h0));
    const w = Math.round(w0 * scale), h = Math.round(h0 * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(image, 0, 0, w, h);
    if (typeof image.close === 'function') image.close();
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.82));
    if (!blob) throw new Error('Encode failed');
    return { blob, w, h };
  }

  // ---------- Leaflet (lazy, module level) ----------
  let leafletLoading = null;
  let leafletMap = null;
  let pinMarkers = new Map();
  const forecastCache = new Map();
  const BASICS = [
  {
    "id": "tw",
    "label": "Taiwan",
    "labelTc": "台灣",
    "sections": [
      {
        "title": "Getting around and paying",
        "titleTc": "交通與付款",
        "items": [
          {
            "t": "Taipei Metro gates take contactless Visa, Mastercard, JCB, UnionPay, Diners and Discover cards, and Apple Pay, Google Pay and Samsung Pay. Tap in, tap out.",
            "m": "ok"
          },
          {
            "t": "Taipei Metro gates take foreign contactless bank cards: the Metro's page says domestic and foreign credit and debit cards, Visa, Mastercard, JCB, UnionPay, Diners Club and Discover, and the card must show the contactless symbol. Tap the bank-card reader (not the EasyCard reader), and use the same physical card to tap in and out. On the first entry of the day Visa gets a NT$0 authorisation and Mastercard or JCB an NT$1 one (once per card per day, so your bank may send a notification); the day's rides are charged together the next morning. Apple Pay, Google Pay and Samsung Pay also work. Keep an EasyCard as a backup.",
            "m": "ok"
          },
          {
            "t": "EasyCard (悠遊卡) is the safe default. It is sold at 7-Eleven, FamilyMart, Hi-Life and OK Mart, at Taipei, Taoyuan and Kaohsiung metro stations, and at the airport bus counters; top it up with cash at the same places. It works on the metro, buses, TRA trains, taxis, ferries, YouBike and in shops.",
            "m": "ok"
          },
          {
            "t": "EasyCard money, from its own terms: the standard card carries a NT$100 deposit that comes back when you hand the card in, and some designs (the \"MyEasyCard\" kind) carry no deposit and start at NT$0, so the shop price depends on the design and isn't published. The most you can load is NT$10,000.",
            "m": "ok"
          },
          {
            "t": "Refunding an EasyCard balance costs a NT$20 handling fee, which is waived only after 3 months and 5 rides, so on a two-week trip spend the balance down rather than refund it. Refunds are at metro service counters.",
            "m": "ok"
          },
          {
            "t": "Taipei Metro fares start at NT$20 for up to 5 km and rise with distance (official table). The Metro's pages don't say whether bank-card rides cost the same as EasyCard rides.",
            "m": "ok"
          },
          {
            "t": "There is no phone version of EasyCard for you. Samsung Pay EasyCard doesn't work on a phone bought outside Taiwan (EasyCard's FAQ: the phone software differs by country), and EasyCard's pages don't mention Apple Wallet. Carry a physical card each, and use a bank-card tap as the backup.",
            "m": "ok"
          },
          {
            "t": "Kaohsiung MRT takes EasyCard, iPASS and icash.",
            "m": "ok"
          },
          {
            "t": "Kaohsiung MRT (red and orange lines): its page lists contactless Visa, Mastercard and JCB cards, debit included, plus UnionPay IC and Amex, and its 2026 news release promotes tapping a card to visitors from abroad. It doesn't literally say overseas-issued cards are accepted, so carry the EasyCard as a backup. The Kaohsiung Light Rail notice lists single tickets, stored-value cards and QR codes but not bank cards, so use the EasyCard there.",
            "m": "ok"
          },
          {
            "t": "High-speed rail (THSR): book online at irs.thsrc.com.tw with a Visa, Mastercard, JCB or UnionPay card; seats open 29 days ahead. A mobile ticket QR scans at the gate. To collect paper tickets bring your passport and the reservation number. A plain bank card or plain EasyCard is not listed for the THSR gates, so travel on the ticket.",
            "m": "ok"
          },
          {
            "t": "TRA local trains accept EasyCard as a ticket. Riding without a valid ticket costs a 50% surcharge on top of the fare.",
            "m": "ok"
          },
          {
            "t": "Taxis: Uber works with your US account, and 55688 is the local app (see the Plan tab).",
            "m": ""
          },
          {
            "t": "Taxis: Taipei City says only some taxi fleets take credit cards, not all, so don't count on a street taxi taking a card. The yoxi taxi service (Taipei, Kaohsiung and Tainan) takes credit cards and EasyCard when you pay through its app. Keep NT$ cash for street taxis.",
            "m": "ok"
          }
        ]
      },
      {
        "title": "Cash and cards",
        "titleTc": "現金與刷卡",
        "items": [
          {
            "t": "7-Eleven's ATMs in Taiwan are CTBC (中國信託) machines, and 7-Eleven's own page lists international-card withdrawal as one of their services. It doesn't name card networks or fees.",
            "m": "ok"
          },
          {
            "t": "Taishin Bank ATMs list foreign Visa, Mastercard, JCB, UnionPay and Discover cards as accepted for cash withdrawals. That is the machine to look for if your Capital One debit card turns out to be Discover.",
            "m": "ok"
          },
          {
            "t": "Cathay United Bank's FAQ says its ATMs accept foreign-issued Visa, Mastercard, PLUS, Cirrus, American Express, JCB and UnionPay debit cards.",
            "m": "ok"
          },
          {
            "t": "The surcharge a foreign card pays at the 7-Eleven (CTBC) and Taishin machines isn't published by an official page I can find, and varies by machine. The screen shows it before you confirm: if it looks high, cancel and try another machine.",
            "m": ""
          },
          {
            "t": "Plan one NT$ withdrawal at the airport on arrival, then keep about NT$3,000 of shared cash on hand for night markets, small eateries, taxis and temples, where cards are often not taken. Keep US$100–200 apart as a last-resort backup.",
            "m": ""
          },
          {
            "t": "If an ATM or a shop terminal offers to charge you in US dollars, choose the local currency (NT$ or HK$). Visa notes that conversion to USD usually includes a markup.",
            "m": "ok"
          },
          {
            "t": "Declare foreign currency over US$10,000 on entry. Keep your exchange receipts to convert leftover NT$ back.",
            "m": "ok"
          },
          {
            "t": "Tax refund: spend NT$2,000 or more in one day at one \"Taiwan Tax Refund\" shop, then claim at the airport within 90 days of buying, before check-in (E-VAT machine), and collect the cash at the bank counter.",
            "m": "ok"
          }
        ]
      },
      {
        "title": "Entering Taiwan",
        "titleTc": "入境台灣",
        "items": [
          {
            "t": "US passport holders get up to 90 days visa-free and need an onward air ticket. Taiwan's general rule is six months of passport validity; for US passports validity for the stay is enough, but check yours.",
            "m": "ok"
          },
          {
            "t": "Fill in the online arrival card within 7 days before arrival (Nov 22–29): twac.immigration.gov.tw. Immigration retrieves it when your passport is scanned.",
            "m": "ok"
          },
          {
            "t": "Meat products are banned, not just declarable: fresh, cooked, frozen, dried or processed meat (pork, sausage, ham, jerky) and undercooked egg products, per Taiwan's animal-health agency. That includes meat snacks, so leave beef jerky and meat sticks out of your protein stash.",
            "m": "ok"
          }
        ]
      },
      {
        "title": "Daily basics",
        "titleTc": "日常須知",
        "items": [
          {
            "t": "Power is 110 V, 60 Hz and US plugs fit: no adapter needed.",
            "m": "ok"
          },
          {
            "t": "3G has been shut down since mid-2024, so a phone without VoLTE on Taiwan networks can't make calls, even to 110 or 119. Check that both phones support it; the eSIM plan is in the Plan tab.",
            "m": "ok"
          },
          {
            "t": "Metro etiquette: no eating, drinking or gum in stations or on trains, with fines of NT$1,500–7,500. Hold the handrail, and don't run or walk against the escalator.",
            "m": "ok"
          },
          {
            "t": "Tipping isn't expected; hotels and many restaurants add a 10% service charge.",
            "m": "ok"
          },
          {
            "t": "Taipei's water department says the city's tap water is safe to drink directly.",
            "m": "ok"
          },
          {
            "t": "Kaohsiung and Tainan: drink bottled or boiled water. Tainan's Environmental Protection Bureau says tap water can in theory be drunk directly but still recommends boiling because of building tanks. A Taiwan Water Corporation Kaohsiung manager told the city council the company doesn't encourage drinking it raw.",
            "m": "ok"
          },
          {
            "t": "Help: 110 police, 119 fire and ambulance, 112 from a mobile, 1990 foreigners helpline, 0800-011-765 for the 24-hour tourist line.",
            "m": "ok"
          }
        ]
      }
    ]
  },
  {
    "id": "hk",
    "label": "Hong Kong",
    "labelTc": "香港",
    "sections": [
      {
        "title": "Getting around and paying",
        "titleTc": "交通與付款",
        "items": [
          {
            "t": "Octopus is Hong Kong's EasyCard. The tourist (\"sold\") Octopus costs HK$39 with no stored value and no deposit; any balance can be refunded, but the card is then switched off. The on-loan adult Octopus is a HK$50 refundable deposit plus HK$150 of value.",
            "m": "ok"
          },
          {
            "t": "At the airport, the HK$39 card is sold at Hung Fook Tong (shop 7T087, Departures level), and the China T-Union version, which costs HK$42 and also works in 336 mainland cities, at the 7-Eleven in the Arrivals Meeters and Greeters Hall and at the MTR Customer Service Centre in Airport Station.",
            "m": "ok"
          },
          {
            "t": "iPhone: the Octopus App for Tourists (iPhone X or later) puts a digital card in Apple Wallet. Android: Octopus lists no tourist option, and the ordinary mobile Octopus needs a Hong Kong-issued card and a phone bought from an authorised Hong Kong retailer, so the Samsung phone needs a physical card.",
            "m": "ok"
          },
          {
            "t": "MTR gates take contactless Visa, Mastercard and UnionPay credit and prepaid cards, and phones or watches, including cards issued overseas (acceptance varies by issuing bank). The fare equals an adult Octopus fare, on the Airport Express too. JCB, Amex and Discover are not on the list, and UnionPay debit cards are excluded.",
            "m": "ok"
          },
          {
            "t": "If your Capital One debit card is Discover, it won't work at MTR gates. Use Octopus, or a Visa or Mastercard credit card.",
            "m": "ok"
          },
          {
            "t": "Airport Express to Kowloon is HK$115 for a single ticket, or HK$105 with Octopus, a contactless card or an online QR ticket.",
            "m": "ok"
          },
          {
            "t": "Group of three, Kowloon ↔ airport: HK$210 in total, which is HK$70 each, instead of HK$315 by Octopus. Single journeys only, valid the day you buy, all bought together at an Airport Express station where the journey starts. Use it on Dec 8, buying at the airport. On Dec 13 the in-town check-in gate lists Octopus, contactless cards and QR tickets but not group tickets, so there each person taps in at HK$105.",
            "m": "ok"
          },
          {
            "t": "Trams are a flat HK$3.30 paid as you get off: tap Octopus, a contactless card or your phone, or drop coins in the box (no change). Star Ferry takes Octopus at the gate, and cash, cards or QR at the machines.",
            "m": "ok"
          },
          {
            "t": "Since April 1, 2026 every Hong Kong taxi must offer at least two electronic payment options, one QR and one not. Urban taxis are red, New Territories taxis green, and Lantau taxis blue and limited to Lantau. Red taxis can't use Tung Chung Road, so on Dec 11 take a blue Lantau taxi from Tung Chung.",
            "m": "ok"
          },
          {
            "t": "Each bag in the taxi boot is HK$6. DiDi and Uber Meter Taxi both work (see the Plan tab).",
            "m": ""
          }
        ]
      },
      {
        "title": "Cash and cards",
        "titleTc": "現金與刷卡",
        "items": [
          {
            "t": "JETCO's page says Mastercard/Cirrus (also UnionPay and Taiwan FISC) cardholders can withdraw cash at selected JETCO ATMs in Hong Kong; look for the matching logo on the machine. It doesn't mention Visa or PLUS.",
            "m": "ok"
          },
          {
            "t": "ATM operator fees and limits in Hong Kong aren't published and vary by machine. The screen shows any fee before you confirm: if it looks high, cancel and try another bank's machine.",
            "m": ""
          },
          {
            "t": "Ordinary bank ATMs (HSBC, Hang Seng, BOCHK, Standard Chartered) are everywhere, so don't plan around a 7-Eleven machine.",
            "m": ""
          },
          {
            "t": "Octopus cash top-ups: Octopus lists 7-Eleven, Circle K, Wellcome, Watsons, Park'n Shop, McDonald's, Starbucks and other retail chains, plus MTR and Light Rail Customer Service Centres and selected MTR add-value machines. The machines take only HK$50 and HK$100 notes.",
            "m": "ok"
          },
          {
            "t": "Decline conversion to US dollars at shops and ATMs, and pay in HK$.",
            "m": "ok"
          },
          {
            "t": "Keep about HK$800 of shared cash for small eateries, trams and street food.",
            "m": ""
          },
          {
            "t": "There is no sales tax in Hong Kong, so there is nothing to claim back.",
            "m": ""
          },
          {
            "t": "Many restaurants add a 10% service charge, so tipping on top is optional.",
            "m": ""
          }
        ]
      },
      {
        "title": "Entering Hong Kong",
        "titleTc": "入境香港",
        "items": [
          {
            "t": "US passport holders get 90 days visa-free, and may be asked for adequate funds and an onward or return ticket.",
            "m": "ok"
          },
          {
            "t": "There is no arrival or departure card: Hong Kong cancelled the requirement on October 16, 2024, so there is no form to fill in.",
            "m": "ok"
          },
          {
            "t": "Keep the landing slip you get on arrival while you are in Hong Kong: the Immigration Department says visitors are required to. Visitors permitted to stay up to 180 days don't register for a Hong Kong ID card. The Police say any person must produce proof of identity when an officer asks, and a valid travel document counts, so carry your passport when you are out.",
            "m": "ok"
          },
          {
            "t": "US State Department: for up to 90 days no visa is needed, and your passport must be valid on entry and for at least one month beyond your intended departure date.",
            "m": "ok"
          }
        ]
      },
      {
        "title": "Daily basics",
        "titleTc": "日常須知",
        "items": [
          {
            "t": "Hong Kong uses UK-style three-pin plugs (Type G, 220 V). US plugs don't fit, so bring a UK adapter; most phone chargers handle 220 V.",
            "m": ""
          },
          {
            "t": "Eating or drinking inside the MTR paid area is banned, with a fine of up to HK$2,000 (MTR by-law 27).",
            "m": "ok"
          },
          {
            "t": "Both cities are generally considered very safe for walking at night and for public transport; watch your bags in crowds as anywhere.",
            "m": ""
          }
        ]
      }
    ]
  },
  {
    "id": "money",
    "label": "Money",
    "labelTc": "錢",
    "sections": [
      {
        "title": "Capital One debit",
        "titleTc": "資本一號簽帳卡",
        "items": [
          {
            "t": "On 360 Checking there are no additional fees when you use the debit card abroad: no foreign transaction fee and no Capital One ATM fee. Other accounts (Total Control, Simply Checking) pay $2 plus 3% for ATM withdrawals outside the US, so check which account you have.",
            "m": "ok"
          },
          {
            "t": "The ATM's owner may still charge a fee, which should show before you confirm. Capital One's page doesn't say what owners charge, and nothing says it reimburses them, so assume you pay it.",
            "m": "ok"
          },
          {
            "t": "Card purchases and withdrawals together are limited to $5,000 a day.",
            "m": "ok"
          },
          {
            "t": "Foreign amounts post in US dollars: at the card network's rate on Mastercard, or at a rate Capital One chooses on Discover.",
            "m": "ok"
          },
          {
            "t": "You no longer need to tell Capital One about your travel. Sign in and make sure your contact details are current so fraud alerts reach you.",
            "m": "ok"
          },
          {
            "t": "Capital One is moving its debit cards from Mastercard to Discover, and its travel page says to check the back of your card and bring a second payment method. If yours is Discover: MTR gates don't list it, so use Octopus there, and in Taiwan look for Taishin ATMs.",
            "m": "ok"
          },
          {
            "t": "A Visa or Mastercard credit card is the sensible backup. Capital One credit cards charge no foreign transaction fee.",
            "m": "ok"
          }
        ]
      },
      {
        "title": "Getting cash, Japan versus here",
        "titleTc": "提款，日本與這裡的差別",
        "items": [
          {
            "t": "In Japan the 7-Eleven (Seven Bank) ATM is the easy answer. In Taiwan 7-Eleven's ATMs are CTBC's, and 7-Eleven lists international-card withdrawal as a service; the fee isn't published, so read the screen.",
            "m": "ok"
          },
          {
            "t": "In Hong Kong use any bank ATM and read the fee screen; there is no 7-Eleven shortcut to rely on.",
            "m": ""
          },
          {
            "t": "Best plan: withdraw larger amounts less often (an operator fee is charged per withdrawal), always in local currency, and decline any conversion offer.",
            "m": ""
          },
          {
            "t": "Carry a backup: a second card kept apart from the first, and a little cash in US dollars in case a card is blocked.",
            "m": ""
          }
        ]
      }
    ]
  }
];
  // Offline street map: a Protomaps extract of the trip areas, saved by the user in a cache of its own
  // (named so the service worker's clean-up of old app caches never touches it).
  const OFFLINE_MAP_URL = './assets/offline/trip.pmtiles';
  const OFFLINE_MAP_KEY = new URL(OFFLINE_MAP_URL, document.baseURI).href;
  const OFFLINE_MAP_CACHE = 'twhk-offline-map-v1';
  const OFFLINE_MAP_BYTES = 43223524;
  let rasterLayer = null;
  let vectorLayer = null;
  let offlineArchive = null;
  let vectorLibs = null;
  function loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(script);
    });
  }
  function loadVectorLibs() {
    if (window.protomapsL && window.pmtiles) return Promise.resolve();
    if (!vectorLibs) vectorLibs = loadLeaflet()
      .then(() => loadScriptOnce('./assets/vendor/protomaps/pmtiles.js'))
      .then(() => loadScriptOnce('./assets/vendor/protomaps/protomaps-leaflet.js'))
      .catch(error => { vectorLibs = null; throw error; });
    return vectorLibs;
  }
  // The whole archive lives in memory (read from the cache), so there are no range requests to serve offline.
  class MemorySource {
    constructor(buffer) { this.buffer = buffer; }
    getKey() { return 'twhk-offline-map'; }
    getBytes(offset, length) { return Promise.resolve({ data: this.buffer.slice(offset, offset + length) }); }
  }
  const legCache = new Map();
  let previewListCache = null;
  const mapPointsCache = new Map();
  let locateLayer = null;
  // One colour per day, readable on the dark map (day order: Day 1 … Day 16).
  const DAY_COLORS = ['#9aa5b1', '#7dd3fc', '#f9a8d4', '#fcd34d', '#86efac', '#c4b5fd', '#fdba74', '#67e8f9', '#f0abfc', '#bef264', '#fda4af', '#a5b4fc', '#5eead4', '#fde68a', '#93c5fd', '#d8b4fe'];
  let leafletLayer = null;
  let tilesLoaded = 0;
  let tileWatchdog = 0;
  const TILE_WAIT_MS = 7000;
  function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (leafletLoading) return leafletLoading;
    leafletLoading = new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = './assets/vendor/leaflet/leaflet.css';
      document.head.appendChild(css);
      const script = document.createElement('script');
      script.src = './assets/vendor/leaflet/leaflet.js';
      script.onload = () => window.L ? resolve(window.L) : reject(new Error('Leaflet missing'));
      script.onerror = () => { leafletLoading = null; reject(new Error('Leaflet failed to load')); };
      document.head.appendChild(script);
    });
    return leafletLoading;
  }

  // ---------- The mixin ----------
  const mixin = {
    flights: FLIGHTS,
    lastLegs: LAST_LEGS,
    isOnline: typeof navigator.onLine === 'boolean' ? navigator.onLine : true,
    liveVersion: 0,
    bringTicks: getStorage('twhk_bring_ticks_v1', {}),
    calcAmount: '',
    calcCurrency: (() => { const saved = getStorage('twhk_calc_currency_v1', 'TWD'); return ['TWD', 'HKD', 'USD'].includes(saved) ? saved : 'TWD'; })(),
    photoIndex: {},
    photosAvailable: true,
    photoExportReady: false,
    photoStorageText: '',
    pendingPhotoBookingId: '',
    photoViewer: { bookingId: '', index: 0, url: '', total: 0 },
    basics: BASICS,
    basicsTab: 'tw',
    offlineMap: { state: 'checking', pct: 0, mb: 0, msg: '' },
    mapVector: false,
    previewPlaying: false,
    previewSpeed: 1,
    playDayId: 'day-06',
    mapOpen: false,
    mapMode: 'svg',
    mapNote: '',
    mapFull: false,
    mapAll: false,
    mapCard: null,
    mapLocate: null,
    mapLocateNote: '',
    stopSheet: null,

    // A stop's researched details open in a bottom sheet rather than an expanding row, so the
    // timeline never changes height under the reader's thumb.
    openStopSheet(day, idx, opener = null) {
      const item = day?.timeline?.[idx];
      if (!item?.details) return;
      this.stopSheet = { dayId: day.id, idx, title: item.title || '', titleTc: item.titleTc || '', time: item.time || '', details: item.details };
      this.openSheet('stop', opener);
    },

    factsSummary(details) {
      const parts = [details.hours && 'Hours', details.cost && 'Cost', details.getThere && 'Getting there', details.highlights?.length && 'What to see', details.tips?.length && 'Tips', details.watch && 'Heads-up'].filter(Boolean);
      return parts.slice(0, 4).join(' · ') + (parts.length > 4 ? ' …' : '');
    },

    featureInit() {
      this.loadPhotoIndex();
      this.probePhotoStorage();
      this.probeOfflineMap();
      const setOnline = () => { this.isOnline = navigator.onLine !== false; if (this.isOnline) this.refreshLive(); };
      window.addEventListener('online', setOnline);
      window.addEventListener('offline', setOnline);
      this.refreshLive();
      this._liveTimer = window.setInterval(() => { if (document.visibilityState === 'visible') this.refreshLive(); }, LIVE_REFRESH_MS);
      this._mtrTimer = window.setInterval(() => { if (document.visibilityState === 'visible' && this.mtrQuery) this.refreshMtr(); }, MTR_REFRESH_MS);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') this.refreshLive(); else this.stopPlayDay(); });
      this.$watch('activeTab', value => {
        if (value === 'toolkit') { this.schedulePhotoExport(); this.updatePhotoStorageText(); }
        // A Leaflet map sized while hidden needs its size and bounds again.
        if (value === 'today' && this.mapOpen) this.$nextTick(() => requestAnimationFrame(() => this.renderDayMap()));
      });
      this.$watch('activeDayId', id => { if (this.mapCard && this.mapCard.dayId !== id) this.mapCard = null; this.mapLocateNote = this.mapLocate ? this.locateSummary() : ''; if (this.mapOpen) this.$nextTick(() => requestAnimationFrame(() => this.renderDayMap())); });
      this.$watch('mapOpen', open => { if (!open) { this.mapCard = null; if (this.mapFull) this.toggleMapFull(false); } });
      this.$watch('calcCurrency', value => setStorage('twhk_calc_currency_v1', JSON.stringify(value)));
    },

    // ======================= F1 · Today's route =======================
    mappableStops(day) {
      const stops = [];
      (day?.timeline || []).forEach((item, index) => {
        if (item.noMap || !item.navigateTo) return;
        const dest = String(item.addressTc || item.navigateTo).trim();
        if (stops.length && stops[stops.length - 1].dest === dest) return;
        stops.push({ index, dest, title: item.title });
      });
      return stops;
    },

    // Flights, high-speed/intercity rail and airport trains end one walkable segment and start the next.
    isLongTransport(item) {
      if (/^plane/.test(item?.icon || '')) return true;
      return item?.icon === 'train' && /THSR|\bTRA\b|Airport MRT|Airport Express/.test(item.title || '');
    },

    stopCoord(day, index) {
      const value = window.TWHK_COORDS?.stops?.[day?.id]?.[index];
      return value && value[2] === day.timeline[index]?.title ? value : null;
    },

    routeSegments(day) {
      const segments = [];
      let current = [];
      let last = null;
      (day?.timeline || []).forEach((item, index) => {
        if (this.isLongTransport(item)) { if (current.length) segments.push(current); current = []; last = null; return; }
        if (item.noMap || !item.navigateTo) return;
        const dest = String(item.addressTc || item.navigateTo).trim();
        if (current.length && current[current.length - 1].dest === dest) return;
        const coord = this.stopCoord(day, index);
        if (current.length && coord && last && kmBetween(last, coord) > ROUTE_SPLIT_KM) { segments.push(current); current = []; }
        current.push({ index, dest, title: item.title });
        if (coord) last = coord;
      });
      if (current.length) segments.push(current);
      return segments.filter(segment => segment.length >= 2);
    },

    routePlan(day) {
      const live = Boolean(day && day.id === this.liveTripDayId && this.relevantPlan?.day?.id === day.id);
      let segments = this.routeSegments(day).map(stops => ({ stops, fromHere: false }));
      if (live && this.relevantPlan.targetKind === 'complete') return [];
      if (live && this.relevantPlan.targetKind === 'event') {
        const at = this.relevantPlan.eventIndex;
        segments = segments.filter(segment => segment.stops[segment.stops.length - 1].index >= at);
        if (segments.length) {
          const first = segments[0];
          const trimmed = first.stops.filter(stop => stop.index >= at);
          // From the phone's location only when you are already inside this segment (never across a flight or train).
          segments[0] = { stops: trimmed, fromHere: !this.isSimulated && first.stops[0].index <= at };
          if (segments[0].stops.length < (segments[0].fromHere ? 1 : 2)) segments.shift();
        }
      }
      return segments;
    },

    chunkRoute(stops, fromHere, perLink) {
      const parts = [];
      let origin = fromHere ? null : stops[0];
      let rest = fromHere ? stops : stops.slice(1);
      while (rest.length) {
        const chunk = rest.slice(0, perLink);
        rest = rest.slice(chunk.length);
        parts.push({ origin, via: chunk.slice(0, -1), destination: chunk[chunk.length - 1], count: chunk.length + (origin ? 1 : 0) });
        origin = chunk[chunk.length - 1];
      }
      return parts;
    },

    googleRouteLinks(day, travelmode = 'walking') {
      const number = this.stopNumberer(day);
      const links = [];
      for (const segment of this.routePlan(day)) {
        for (const leg of this.chunkRoute(segment.stops, segment.fromHere, GOOGLE_MAX_WAYPOINTS + 1)) {
          let url = 'https://www.google.com/maps/dir/?api=1';
          if (leg.origin) url += `&origin=${enc(leg.origin.dest)}`;
          url += `&destination=${enc(leg.destination.dest)}`;
          if (leg.via.length) url += `&waypoints=${leg.via.map(stop => enc(stop.dest)).join('%7C')}`;
          url += `&travelmode=${travelmode}`;
          links.push({ part: links.length + 1, url, count: leg.count, range: this.rangeLabel(leg.origin, leg.destination, number), stops: [leg.origin, ...leg.via, leg.destination].filter(Boolean) });
        }
      }
      return links;
    },

    appleRouteLinks(day) {
      const number = this.stopNumberer(day);
      const links = [];
      for (const segment of this.routePlan(day)) {
        for (const leg of this.chunkRoute(segment.stops, segment.fromHere, APPLE_MAX_STOPS - 1)) {
          const params = [];
          if (leg.origin) params.push(`source=${enc(leg.origin.dest)}`);
          params.push(`destination=${enc(leg.destination.dest)}`);
          leg.via.forEach(stop => params.push(`waypoint=${enc(stop.dest)}`));
          params.push('mode=driving');
          links.push({ part: links.length + 1, url: 'https://maps.apple.com/directions?' + params.join('&'), count: leg.count, range: this.rangeLabel(leg.origin, leg.destination, number), stops: [leg.origin, ...leg.via, leg.destination].filter(Boolean) });
        }
      }
      return links;
    },

    // Route chips use the day map's pin numbers.
    stopNumberer(day) {
      const pins = new Map(this.dayMapPoints(day).map(point => [point.index, point.n]));
      const order = this.mappableStops(day).map(stop => stop.index);
      return stop => pins.get(stop.index) || order.indexOf(stop.index) + 1;
    },

    rangeLabel(origin, destination, number) {
      return `${origin ? number(origin) : 'Here'} → ${number(destination)}`;
    },

    routeLinks(day) {
      const walking = this.googleRouteLinks(day, 'walking');
      if (!walking.length) return null;
      const driving = this.mapProvider === 'apple' ? this.appleRouteLinks(day) : this.googleRouteLinks(day, 'driving');
      return { walking, driving };
    },

    // ======================= F11 · From the previous stop =======================
    previousStop(day, idx) {
      for (let i = idx - 1; i >= 0; i--) {
        const item = day.timeline[i];
        // A hike that ends elsewhere (exitTo) hands the next leg its trail exit, so a map app never routes the trail itself.
        if (!item.noMap && item.navigateTo) return { index: i, dest: String(item.exitTo || item.addressTc || item.navigateTo).trim() };
      }
      return null;
    },

    // On the real live day, only the next stop still ahead may start from the phone's location.
    nextUpcomingIndex(day) {
      if (!day || day.id !== this.liveTripDayId || this.isSimulated) return -1;
      const nowMin = this.getScheduleMinutes(this.nowTick, day.timeZone);
      if (!Number.isFinite(nowMin)) return -1;
      return day.timeline.findIndex(item => !item.noMap && item.navigateTo && this.parseTimelineStartMinutes(item.time) > nowMin);
    },

    prevLegFromHere(day, idx) { return idx === this.nextUpcomingIndex(day); },

    prevLegUrl(day, idx) {
      const item = day?.timeline?.[idx];
      if (!item || item.noMap || !item.navigateTo) return '';
      const prev = this.previousStop(day, idx);
      if (!prev) return '';
      const here = String(item.addressTc || item.navigateTo).trim();
      if (prev.dest === here) return '';
      const omitOrigin = this.prevLegFromHere(day, idx);
      if (this.mapProvider === 'apple') return `https://maps.apple.com/directions?${omitOrigin ? '' : `source=${enc(prev.dest)}&`}destination=${enc(here)}&mode=transit`;
      return `https://www.google.com/maps/dir/?api=1${omitOrigin ? '' : `&origin=${enc(prev.dest)}`}&destination=${enc(here)}&travelmode=transit`;
    },

    tightTransfer(day, idx) {
      const item = day?.timeline?.[idx];
      const rule = item && LEG_MIN[stopKey(day.id, item.title)];
      if (!rule || idx === 0) return null;
      const prev = day.timeline[idx - 1];
      const prevEnd = this.itemEndMinutes(day, idx - 1);
      const start = this.parseTimelineStartMinutes(item.time);
      if (![prevEnd, start].every(Number.isFinite)) return null;
      let planned = start - prevEnd;
      if (rule.includesSelf) {
        const end = this.itemEndMinutes(day, idx);
        if (Number.isFinite(end)) planned += end - start;
      }
      if (planned >= rule.min) return null;
      return { need: rule.min, planned: Math.max(0, planned), text: `Tight: ~${rule.min} min transfer, ${Math.max(0, planned)} min planned`, prev: prev.title };
    },

    itemEndMinutes(day, idx) {
      const item = day.timeline[idx];
      const start = this.parseTimelineStartMinutes(item.time);
      const end = this.parseTimelineEndMinutes(item.time);
      if (Number.isFinite(end) && end > start) return end;
      const next = day.timeline[idx + 1];
      const nextStart = next ? this.parseTimelineStartMinutes(next.time) : NaN;
      if (Number.isFinite(nextStart) && nextStart > start) return nextStart;
      return Number.isFinite(start) ? start + 60 : NaN;
    },

    // ======================= F10 · Opening hours =======================
    hoursClash(day, idx) {
      const item = day?.timeline?.[idx];
      const rule = item && HOURS[stopKey(day.id, item.title)];
      if (!rule) return null;
      const weekday = weekdayOf(day.dateString);
      if (rule.closedDays && weekday && rule.closedDays.split(',').includes(weekday)) return { tone: 'bad', text: 'Closed today' };
      // `days` limits which days these hours describe; other days have no rule here.
      if (rule.days && weekday && !rule.days.split(',').includes(weekday)) return null;
      const start = this.parseTimelineStartMinutes(item.time);
      const end = this.itemEndMinutes(day, idx);
      const open = hm(rule.open), close = hm(rule.close), last = hm(rule.lastEntry);
      if (Number.isFinite(open) && Number.isFinite(start) && start < open) return { tone: 'warn', text: `Opens ${clock12(open)}` };
      if (Number.isFinite(last) && Number.isFinite(start) && start > last) return { tone: 'bad', text: `Last entry ${clock12(last)}` };
      if (Number.isFinite(close) && Number.isFinite(end) && end > close) return { tone: 'bad', text: `Closes ${clock12(close)}` };
      return null;
    },

    // ======================= F2 · Calendar =======================
    flightForItem(item) {
      if (!/^(Board Flight|Cathay Pacific) /.test(item?.title || '')) return null;
      return FLIGHTS.find(flight => new RegExp(`\\b${flight.no}\\b`).test(item.title)) || null;
    },

    calendarEvents(days) {
      const events = [];
      for (const day of days) {
        const date = this.parseMonthDay(day.dateString);
        if (!date) continue;
        day.timeline.forEach((item, index) => {
          const flight = this.flightForItem(item);
          let start, end;
          if (flight) { start = Date.parse(flight.dep); end = Date.parse(flight.arr); }
          else if (item.startAt && item.endAt) { start = Date.parse(item.startAt); end = Date.parse(item.endAt); }
          else {
            const startMin = this.parseTimelineStartMinutes(item.time);
            if (!Number.isFinite(startMin)) return;
            const endMin = this.itemEndMinutes(day, index);
            start = zonedTimeToUtc(date.year, date.month, date.day, startMin, day.timeZone);
            end = zonedTimeToUtc(date.year, date.month, date.day, endMin, day.timeZone);
          }
          if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
          const desc = [item.notes, item.guide?.recheck ? `Recheck: ${item.guide.recheck}` : '', item.guide?.exit ? `Leave: ${item.guide.exit}` : ''].filter(Boolean).join('\n');
          const alarms = [TRANSPORT_ICONS.has(item.icon) ? '-PT30M' : '-PT10M'];
          if (flight) alarms.push('-PT3H');
          events.push({ uid: `${day.id}-${index}-${shortHash(item.title)}@twhk26.app`, start, end, summary: item.title, location: item.noMap ? '' : String(item.addressTc || item.navigateTo || ''), description: desc, alarms });
        });
      }
      return events;
    },

    buildIcs(days) {
      const now = icsStamp(Date.now());
      const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TW HK 2026//Trip//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:TW · HK 2026'];
      for (const event of this.calendarEvents(days)) {
        lines.push('BEGIN:VEVENT', `UID:${event.uid}`, `DTSTAMP:${now}`, `DTSTART:${icsStamp(event.start)}`, `DTEND:${icsStamp(event.end)}`, `SUMMARY:${icsEscape(event.summary)}`);
        if (event.location) lines.push(`LOCATION:${icsEscape(event.location)}`);
        if (event.description) lines.push(`DESCRIPTION:${icsEscape(event.description)}`);
        for (const trigger of event.alarms) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `TRIGGER:${trigger}`, `DESCRIPTION:${icsEscape(event.summary)}`, 'END:VALARM');
        lines.push('END:VEVENT');
      }
      lines.push('END:VCALENDAR');
      return lines.map(foldIcsLine).join('\r\n') + '\r\n';
    },

    exportCalendar(dayId = null) {
      const days = dayId ? this.days.filter(day => day.id === dayId) : this.days;
      const ics = this.buildIcs(days);
      const name = dayId ? `tw-hk-2026-${dayId}.ics` : 'tw-hk-2026-trip.ics';
      const message = 'Open it and tap Add All. Importing again adds duplicates.';
      this.deliverFile(new Blob([ics], { type: 'text/calendar;charset=utf-8' }), name, message, message);
    },

    // ======================= F4 · Currency calculator =======================
    get calcResult() {
      const amount = Number(String(this.calcAmount || '').replace(/,/g, ''));
      const rate = Number(this.currencyRates?.[this.calcCurrency]);
      if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(rate) || rate <= 0) return '';
      const usd = amount / rate;
      const fmt = (code, value) => {
        const digits = code === 'TWD' ? 0 : 2;
        const symbol = { TWD: 'NT$', HKD: 'HK$', USD: 'US$' }[code];
        return symbol + value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
      };
      const value = code => code === 'USD' ? usd : usd * Number(this.currencyRates[code]);
      const others = ['TWD', 'USD', 'HKD'].filter(code => code !== this.calcCurrency).map(code => fmt(code, value(code)));
      return `${fmt(this.calcCurrency, amount)} = ${others.join(' · ')}`;
    },

    get calcParts() {
      const text = this.calcResult;
      if (!text) return null;
      const [from, rest] = text.split(' = ');
      return { from, to: rest.split(' · ') };
    },

    calcToUsd(amount, from) {
      const rate = Number(this.currencyRates?.[from]);
      return Number.isFinite(rate) && rate > 0 ? Number(amount) / rate : NaN;
    },

    // ======================= F5 · Flights =======================
    flightTime(iso, tz) {
      try { return new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso)); }
      catch (_) { return ''; }
    },

    checkinHours(flight) { return flight.usBound ? CHECKIN_US_HOURS : CHECKIN_OPENS_HOURS; },

    flightStatus(flight, now = this.nowTick) {
      const dep = Date.parse(flight.dep);
      const opens = dep - this.checkinHours(flight) * 3600000;
      const closes = dep - CHECKIN_CLOSES_MIN * 60000;
      // Between 48 h and 24 h, non-members may not see check-in yet.
      const memberOnly = !flight.usBound && now < dep - CHECKIN_FALLBACK_HOURS * 3600000 ? ' (opens at 24 h if you\'re not a Cathay member)' : '';
      if (now >= dep) return { key: 'departed', text: 'Departed' };
      if (now >= closes) return { key: 'closing', text: `Departs in ${durationText(dep - now)}` };
      if (now >= opens) return { key: 'open', text: dep - now <= 3 * 3600000 ? `Departs in ${durationText(dep - now)}` : `Check-in open${memberOnly} · departs in ${durationText(dep - now)}` };
      return { key: 'before', text: `Check-in opens in ${durationText(opens - now)}` };
    },

    flightClock(iso, tz) {
      try { return new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(new Date(iso)); }
      catch (_) { return ''; }
    },

    flightDay(iso, tz) {
      try { return new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(iso)); }
      catch (_) { return ''; }
    },

    flightDuration(flight) { return durationText(Date.parse(flight.arr) - Date.parse(flight.dep)); },

    flightStatusUrl(flight) {
      return `https://www.flightaware.com/live/flight/CPA${flight.no.replace(/\D/g, '')}`;
    },

    get checkinUrl() { return CHECKIN_URL; },
    get checkinNote() { return `Online check-in opens ${CHECKIN_OPENS_HOURS} h before departure (if it isn't open yet, non-members get it from ${CHECKIN_FALLBACK_HOURS} h); the US flight opens at ${CHECKIN_US_HOURS} h. It closes ${CHECKIN_CLOSES_MIN} min before.`; },

    get nowFlightLine() {
      const now = this.nowTick;
      const flight = FLIGHTS.find(f => { const dep = Date.parse(f.dep); return dep > now && dep - now <= 36 * 3600000; });
      if (!flight) return null;
      const status = this.flightStatus(flight, now);
      const departs = this.flightTime(flight.dep, flight.fromTz).replace(/^\w+, /, '');
      const lead = status.key === 'before' ? `check-in ${status.text.toLowerCase().replace('check-in ', '')}` : status.key === 'open' ? 'check-in open' : 'check-in closed';
      const note = /not a Cathay member/.test(status.text) ? ' · non-members from 24 h' : '';
      return { no: flight.no, text: `${flight.no} ${lead} · departs ${departs}${note}`, main: `${flight.no} ${lead}`, sub: `Departs ${departs}${note}`, url: CHECKIN_URL, closed: status.key === 'closing' };
    },

    // ======================= F12 · Bring list =======================
    bringList(day) {
      if (!day) return [];
      const id = day.id;
      const text = JSON.stringify(day.timeline.map(item => item.title));
      const items = [];
      const add = (key, label) => { if (!items.some(item => item.key === key)) items.push({ key, label }); };
      if (['day-04', 'day-05', 'day-10', 'day-13', 'day-14', 'day-06'].includes(id)) {
        add('shoes', 'Grippy shoes');
        add('water', 'Water, at least 1 L each');
        add('layer', 'Windproof layer');
      }
      if (id === 'day-06') add('light', 'Headlamp or phone light (Elephant Mountain at dusk)');
      if (['day-01', 'day-02', 'day-11', 'day-16'].includes(id)) add('passport', 'Passports');
      if (id === 'day-12') add('passport', 'Passports (free Happy Valley public enclosure, 18+)');
      if (id === 'day-04') add('towel', 'Small towel and a dry layer for the summit');
      if (id === 'day-13') add('socks', 'Grip socks, only if you use the JOYPOLIS backup (or buy there, HK$30)');
      if (/Night Market|Festival|Procession/.test(text)) add('cash', 'Cash in small notes');
      if (['day-07', 'day-08', 'day-11'].includes(id)) add('easycard', 'EasyCard topped up');
      if (HK_DAYS.has(id)) add('octopus', id === 'day-16' ? 'The same Octopus card (or contactless card) for the in-town check-in gate and the Airport Express platform gate' : 'Octopus card');
      if (id === 'day-11') add('adapter', 'UK Type G plug adapter (Hong Kong sockets are UK-style, 220 V)');
      if (['day-01', 'day-02'].includes(id)) add('nomeat', 'No jerky, ham or other meat snacks in the bag: meat products are banned in Taiwan');
      return items;
    },

    bringTicked(day, key) { return Boolean(this.bringTicks[`${day.id}:${key}`]); },

    bringDoneCount(day) { return this.bringList(day).filter(item => this.bringTicked(day, item.key)).length; },

    toggleBring(day, key) {
      const id = `${day.id}:${key}`;
      const next = { ...this.bringTicks };
      if (next[id]) delete next[id]; else next[id] = true;
      this.bringTicks = next;
      setStorage('twhk_bring_ticks_v1', JSON.stringify(next));
    },

    // ======================= F13 · Nearby =======================
    nearbyLinks(day) {
      const hk = HK_DAYS.has(day?.id);
      const queries = hk
        ? [['Convenience store', '便利店'], ['Toilet', '洗手間'], ['ATM', 'ATM'], ['MTR', '港鐵站']]
        : [['7-Eleven / FamilyMart', '便利商店'], ['Toilet', '廁所'], ['ATM', 'ATM'], ['Metro', '捷運站']];
      return queries.map(([label, q]) => ({
        label,
        url: this.mapProvider === 'apple' ? `https://maps.apple.com/search?query=${enc(q)}` : `https://www.google.com/maps/search/?api=1&query=${enc(q)}`
      }));
    },

    // ======================= F6 / F7 · Weather =======================
    refreshLive() {
      if (navigator.onLine === false) return;
      const now = Date.now();
      // Forecasts reach 16 days ahead; before that the trip has nothing to show.
      if (now >= TRIP_START - 17 * 86400000 && now <= TRIP_END + 86400000) {
        const om = readLiveRaw('openmeteo');
        // Data saved before temperatures were fetched has no 't' series: refetch it straight away.
        const hasTemps = Boolean(om?.data?.places && Object.values(om.data.places).some(place => place.t?.length));
        if (!om || !hasTemps || now - om.at > LIVE_REFRESH_MS) this.fetchOpenMeteo();
      }
      if (now >= Date.parse('2026-12-08T00:00:00+08:00') - 86400000 && now <= TRIP_END + 86400000) {
        const warn = readLiveRaw('hkowarn');
        if (!warn || now - warn.at > LIVE_REFRESH_MS) this.fetchHko();
      }
    },

    fetchOpenMeteo() {
      const places = WEATHER_PLACES();
      const keys = Object.keys(places);
      const lat = keys.map(key => places[key][0]).join(','), lng = keys.map(key => places[key][1]).join(',');
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&hourly=temperature_2m,precipitation_probability,wind_gusts_10m,cloud_cover,visibility&temperature_unit=fahrenheit&timezone=Asia%2FTaipei&forecast_days=16`;
      return fetchJson(url).then(json => { writeLive('openmeteo', compactOpenMeteo(json, keys)); this.liveVersion++; }).catch(() => {});
    },

    fetchHko() {
      const url = 'https://data.weather.gov.hk/weatherAPI/opendata/weather.php?lang=en&dataType=warnsum';
      return fetchJson(url).then(json => { writeLive('hkowarn', json || {}); this.liveVersion++; }).catch(() => {});
    },

    // "as of 14:20" for today's data; "as of Tue 14:20" when it is from another day.
    liveAge(name) {
      void this.liveVersion;
      const entry = readLive(name);
      if (!entry) return '';
      const tz = 'Asia/Hong_Kong';
      const dayKey = ms => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(ms));
      const time = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(entry.at));
      if (dayKey(entry.at) === dayKey(this.clockNow())) return time;
      return `${new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(new Date(entry.at))} ${time}`;
    },

    // Hourly series for a place over [fromMin, toMin) local (UTC+8) minutes of the day's date.
    forecastWindow(placeKey, day, fromMin, toMin) {
      void this.liveVersion;
      const om = readLive('openmeteo');
      const series = om?.data?.places?.[placeKey];
      const date = this.parseMonthDay(day?.dateString);
      if (!series || !date) return null;
      const prefix = `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}T`;
      const picks = [];
      om.data.time.forEach((stamp, i) => {
        if (!stamp.startsWith(prefix)) return;
        const minute = Number(stamp.slice(11, 13)) * 60;
        if (minute + 60 > fromMin && minute < toMin) picks.push(i);
      });
      if (!picks.length) return null;
      const take = arr => picks.map(i => arr[i]).filter(Number.isFinite);
      const p = take(series.p), g = take(series.g), c = take(series.c), v = take(series.v);
      return {
        rainMax: p.length ? Math.max(...p) : NaN,
        gustMax: g.length ? Math.max(...g) : NaN,
        cloudMean: c.length ? Math.round(c.reduce((a, b) => a + b, 0) / c.length) : NaN,
        visMinKm: v.length ? Math.min(...v) / 1000 : NaN
      };
    },

    hkoWarnings() {
      void this.liveVersion;
      const data = readLive('hkowarn')?.data || {};
      const active = entry => entry && typeof entry === 'object' && entry.actionCode !== 'CANCEL';
      const signal = active(data.WTCSGNL) ? String(data.WTCSGNL.code || '') : '';
      const rain = active(data.WRAIN) ? String(data.WRAIN.code || '') : '';
      const names = Object.values(data).filter(active).map(entry => HKO_NAMES[entry.code] || (entry.name ? String(entry.name) : '')).filter(Boolean);
      return { signal, rain, names, typhoonAtLeast3: /^TC(3|8|9|10)/.test(signal), anyTyphoon: /^TC/.test(signal), redBlack: /WRAIN[RB]/.test(rain), amberPlus: /WRAIN[ARB]/.test(rain) };
    },

    get weatherBanner() {
      void this.liveVersion;
      const day = this.currentDay;
      if (!day) return null;
      const lines = [];
      const credits = [];
      let rainButton = false;
      const isLive = day.id === this.liveTripDayId;
      if (isLive && HK_DAYS.has(day.id)) {
        const warn = this.hkoWarnings();
        if (['day-11', 'day-14', 'day-15'].includes(day.id) && (warn.typhoonAtLeast3 || warn.redBlack)) {
          lines.push('Outdoor harbourfront shows and Winter Wonderland may be suspended under this warning — check before heading out.');
          if (day.id === 'day-15') lines.push('Aqua Luna may cancel — check its notice; the day\'s rain plan applies.');
        }
        if (['day-13', 'day-14'].includes(day.id) && (warn.anyTyphoon || warn.amberPlus)) lines.push('A weather warning is in force: check the hike card before setting off.');
        if (warn.names.length) lines.unshift(`In force: ${warn.names.join(' · ')}.`);
        if (warn.names.length) credits.push(`HKO warnings as of ${this.liveAge('hkowarn')}`);
      }
      const place = (SUN_PLACES[day.id] || [])[1];
      let rainItem = null;
      if (place) {
        day.timeline.forEach((item, index) => {
          if (rainItem || !OUTDOOR_EVENING.test(item.title)) return;
          const start = this.parseTimelineStartMinutes(item.time);
          const end = this.itemEndMinutes(day, index);
          if (!Number.isFinite(start) || start < 16 * 60) return;
          const window = this.forecastWindow(place, day, start, end);
          if (window && window.rainMax >= RAIN_BANNER_PCT) rainItem = { title: item.title, from: start, to: end, pct: window.rainMax };
        });
      }
      if (rainItem) {
        lines.push(`Rain likely ${clock12(rainItem.from)}–${clock12(rainItem.to)} (${rainItem.pct}%) during ${rainItem.title}.`);
        rainButton = Boolean(day.rainPlan);
        credits.push(`Open-Meteo forecast as of ${this.liveAge('openmeteo')}`);
      }
      if (!lines.length) return null;
      const hk = HK_DAYS.has(day.id);
      return {
        lines, rainButton,
        credit: credits.join(' · '),
        officialUrl: hk ? 'https://www.hko.gov.hk/en/' : 'https://www.cwa.gov.tw/V8/E/',
        officialLabel: hk ? 'HKO' : 'CWA'
      };
    },

    hikeVisible(day, now = this.nowTick) {
      const hike = HIKES[day?.id];
      const date = this.parseMonthDay(day?.dateString);
      if (!hike || !date) return false;
      const eve = zonedTimeToUtc(date.year, date.month, date.day, -6 * 60, 'Asia/Taipei');
      const end = zonedTimeToUtc(date.year, date.month, date.day, hm(hike.to), 'Asia/Taipei');
      return now >= eve && now <= end;
    },

    hikeVerdict(stats, warn = { anyTyphoon: false, redBlack: false }) {
      if (warn.anyTyphoon || warn.redBlack) return 'no-go';
      if (!stats) return 'unknown';
      if (stats.gustMax >= HIKE_NO_GO.gustKmh || stats.rainMax >= HIKE_NO_GO.rainPct) return 'no-go';
      if (stats.gustMax >= HIKE_CAUTION.gustKmh || stats.rainMax >= HIKE_CAUTION.rainPct || stats.visMinKm < HIKE_CAUTION.visKm) return 'caution';
      return 'go';
    },

    get hikeCard() {
      void this.liveVersion;
      const shown = this.currentDay;
      if (!shown) return null;
      // On the live day's evening, tomorrow's hike is the one to decide on.
      let day = HIKES[shown.id] && this.hikeVisible(shown) ? shown : null;
      let tomorrow = false;
      if (!day && shown.id === this.liveTripDayId) {
        const next = this.days[this.days.findIndex(d => d.id === shown.id) + 1];
        if (next && HIKES[next.id] && this.hikeVisible(next)) { day = next; tomorrow = true; }
      }
      if (!day) return null;
      const hike = HIKES[day.id];
      const stats = this.forecastWindow('summit-' + hike.summit, day, hm(hike.from), hm(hike.to));
      const warn = HK_DAYS.has(day.id) ? this.hkoWarnings() : { anyTyphoon: false, redBlack: false };
      const verdict = this.hikeVerdict(stats, warn);
      const sun = this.sunForDay(day);
      const official = HK_DAYS.has(day.id) ? 'HKO' : 'CWA';
      const stale = !stats && Boolean(readLiveRaw('openmeteo')) && !readLive('openmeteo');
      return {
        name: (tomorrow ? 'Tomorrow · ' : '') + hike.name, window: `${clock12(hm(hike.from))}–${clock12(hm(hike.to))}`, stats, verdict,
        verdictText: { go: 'Go · 可以出發', caution: 'Caution · 注意', 'no-go': 'No-go · 不建議', unknown: 'No forecast yet' }[verdict],
        warning: warn.names?.length ? `In force: ${warn.names.join(' · ')}.` : '',
        note: stale ? `Forecast unavailable — the last one is too old. Check ${official} before setting off.` : `No forecast for this window yet. Forecasts reach about 16 days ahead and need a connection once; check ${official} meanwhile.`,
        sunset: sun?.set || '', fallback: verdict === 'no-go' ? day.rainPlan : '',
        asOf: this.liveAge('openmeteo'), officialUrl: HK_DAYS.has(day.id) ? 'https://www.hko.gov.hk/en/' : 'https://www.cwa.gov.tw/V8/E/',
        thresholds: `No-go: gusts ≥ ${HIKE_NO_GO.gustKmh} km/h or rain ≥ ${HIKE_NO_GO.rainPct}%. Caution: gusts ≥ ${HIKE_CAUTION.gustKmh}, rain ≥ ${HIKE_CAUTION.rainPct}% or visibility < ${HIKE_CAUTION.visKm} km.`
      };
    },

    hikeStatTone(key, value) {
      if (!Number.isFinite(value)) return '';
      if (key === 'gust') return value >= HIKE_NO_GO.gustKmh ? 'is-bad' : value >= HIKE_CAUTION.gustKmh ? 'is-warn' : '';
      if (key === 'rain') return value >= HIKE_NO_GO.rainPct ? 'is-bad' : value >= HIKE_CAUTION.rainPct ? 'is-warn' : '';
      if (key === 'vis') return value < HIKE_CAUTION.visKm ? 'is-warn' : '';
      return '';
    },

    activateRainPlan() {
      this.rainPlanActive = true;
      this.$nextTick(() => document.querySelector('.contingency-card.rain')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    },

    fmtStat(value, unit, digits = 0) {
      return Number.isFinite(value) ? `${Number(value).toFixed(digits)}${unit}` : '—';
    },

    // ======================= F8 · Last trains =======================
    lastLegsFor(day) { return LAST_LEGS.filter(leg => leg.dayId === day?.id); },

    legLastMinutes(leg) {
      const m = hm(leg.last);
      return m < 4 * 60 ? m + 1440 : m;
    },

    get nowLastLeg() {
      const liveDay = this.days.find(d => d.id === this.liveTripDayId);
      const plan = this.relevantPlan;
      if (!liveDay) return null;
      const nowMin = this.getScheduleMinutes(this.nowTick, liveDay.timeZone);
      if (!Number.isFinite(nowMin)) return null;
      // Before 4 AM the night still belongs to the date before. If the live day has already
      // turned over, last night's day is checked too (its plan is finished by then).
      const d = this.parseMonthDay(liveDay.dateString);
      const liveKey = d ? `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}` : '';
      const turnedOver = liveKey === new Intl.DateTimeFormat('en-CA', { timeZone: liveDay.timeZone }).format(new Date(this.nowTick));
      const late = nowMin < 4 * 60;
      const candidates = [];
      if (plan && plan.day?.id === liveDay.id) candidates.push({ day: liveDay, current: plan.targetKind === 'event' ? plan.eventIndex : (plan.targetKind === 'complete' ? liveDay.timeline.length : -1), now: late && !turnedOver ? nowMin + 1440 : nowMin });
      if (late && turnedOver) {
        const prevDay = this.days[this.days.findIndex(d => d.id === liveDay.id) - 1];
        if (prevDay) candidates.push({ day: prevDay, current: prevDay.timeline.length, now: nowMin + 1440 });
      }
      let best = null;
      for (const { day, current, now } of candidates) {
        for (const leg of this.lastLegsFor(day)) {
          if (leg.fallback || !leg.afterItemTitle) continue;
          const after = day.timeline.findIndex(item => item.title === leg.afterItemTitle);
          if (after < 0 || current < after) continue;
          const lastMin = this.legLastMinutes(leg);
          const left = lastMin - now;
          if (left < 0) continue;
          const plannedEnd = this.itemEndMinutes(day, after);
          const tone = left < 15 || plannedEnd > lastMin ? 'bad' : left < 30 ? 'warn' : '';
          const noun = { metro: 'Last train', rail: 'Last train', ferry: 'Last ferry', bus: 'Last bus' }[leg.mode];
          const candidate = { text: `${noun} ${leg.label} ${leg.last} · ${durationText(left * 60000)}`, main: `${noun} · ${leg.last}`, sub: leg.label, pill: durationText(left * 60000), tone, source: leg.source, left };
          if (!best || candidate.left < best.left) best = candidate;
        }
      }
      return best;
    },

    get mtrQuery() {
      const dayId = this.liveTripDayId;
      if (!dayId || !HK_DAYS.has(dayId)) return null;
      const minutes = this.getScheduleMinutes(this.nowTick, 'Asia/Hong_Kong');
      if (dayId === 'day-16') return minutes >= 6 * 60 && minutes <= 15 * 60 ? { line: 'AEL', sta: 'KOW', label: 'Airport Express · Kowloon' } : null;
      return minutes >= 21 * 60 || minutes < 90 ? { line: 'TWL', sta: 'TST', label: 'Tsuen Wan line · Tsim Sha Tsui' } : null;
    },

    refreshMtr() {
      const q = this.mtrQuery;
      if (!q || navigator.onLine === false) return Promise.resolve();
      return fetchJson(`https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php?line=${q.line}&sta=${q.sta}`)
        .then(json => { writeLive(`mtr_${q.line}_${q.sta}`, json); this.liveVersion++; })
        .catch(() => {});
    },

    get mtrBoard() {
      void this.liveVersion;
      const q = this.mtrQuery;
      if (!q) return null;
      const entry = readLive(`mtr_${q.line}_${q.sta}`);
      if (!entry) { if (!this._mtrKick) { this._mtrKick = true; setTimeout(() => { this._mtrKick = false; this.refreshMtr(); }, 0); } return null; }
      if (Date.now() - entry.at > 10 * 60000) return null;
      const block = entry.data?.data?.[`${q.line}-${q.sta}`] || {};
      const rows = ['UP', 'DOWN'].map(dir => {
        const trains = (block[dir] || []).slice(0, 2);
        if (!trains.length) return null;
        return { dest: MTR_DEST[trains[0].dest] || trains[0].dest, times: trains.map(t => String(t.time || '').slice(11, 16)).join(', ') };
      }).filter(Boolean);
      return rows.length ? { label: q.label, rows, asOf: this.liveAge(`mtr_${q.line}_${q.sta}`) } : null;
    },

    // ======================= F9 · Day map =======================
    dayMapPoints(day) {
      // Coordinates never change at runtime: compute each day's pins once (every timeline card asks for its number).
      const cached = day && mapPointsCache.get(day.id);
      if (cached && cached.timeline === day.timeline) return cached.points;
      const points = this.computeDayMapPoints(day);
      if (day) mapPointsCache.set(day.id, { timeline: day.timeline, points, byIndex: new Map(points.map(p => [p.index, p.n])) });
      return points;
    },

    computeDayMapPoints(day) {
      const stops = window.TWHK_COORDS?.stops?.[day?.id] || {};
      const points = [];
      (day?.timeline || []).forEach((item, index) => {
        const value = stops[index];
        if (!value || value[2] !== item.title || item.noMap) return;
        points.push({ n: points.length + 1, index, lat: value[0], lng: value[1], title: item.title });
      });
      return points;
    },

    dayMapHotel(day) {
      const value = window.TWHK_COORDS?.hotels?.[day?.hotelRef];
      return value ? { lat: value[0], lng: value[1], name: this.hotels[day.hotelRef]?.name || 'Hotel' } : null;
    },

    dayMapSvg(day) {
      const points = this.dayMapPoints(day);
      if (!points.length) return '';
      const hotel = this.dayMapHotel(day);
      const all = hotel ? [...points, hotel] : points;
      const W = 320, H = 220, pad = 22;
      const lats = all.map(p => p.lat), lngs = all.map(p => p.lng);
      const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
      const kx = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
      const spanX = Math.max((maxLng - minLng) * kx, 1e-4), spanY = Math.max(maxLat - minLat, 1e-4);
      const scale = Math.min((W - 2 * pad) / spanX, (H - 2 * pad) / spanY);
      const ox = (W - spanX * scale) / 2, oy = (H - spanY * scale) / 2;
      const xy = p => [ox + (p.lng - minLng) * kx * scale, H - (oy + (p.lat - minLat) * scale)];
      const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      // Stops in the same place would hide each other: fan later ones out around the first.
      const placed = [];
      for (const p of points) {
        let [x, y] = xy(p);
        const [x0, y0] = [x, y];
        for (let k = 1; placed.some(([px, py]) => Math.hypot(px - x, py - y) < 19) && k < 12; k++) {
          const angle = k * 2.4;
          x = Math.min(W - 11, Math.max(11, x0 + Math.cos(angle) * 21 * Math.ceil(k / 6)));
          y = Math.min(H - 11, Math.max(11, y0 + Math.sin(angle) * 21 * Math.ceil(k / 6)));
        }
        placed.push([x, y]);
      }
      const path = placed.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
      let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Sketch of today's stops in order" style="--pin:${this.dayColor(day.id)}"><path d="${path}" class="map-svg-line"/>`;
      if (hotel) { const [x, y] = xy(hotel); svg += `<rect x="${(x - 6).toFixed(1)}" y="${(y - 6).toFixed(1)}" width="12" height="12" rx="3" class="map-svg-hotel"><title>${esc(hotel.name)}</title></rect>`; }
      points.forEach((p, i) => {
        const [x, y] = placed[i];
        svg += `<g class="map-svg-stop${this.mapCard?.dayId === day.id && this.mapCard?.index === p.index ? ' is-active' : ''}" data-index="${p.index}"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="10"/><text x="${x.toFixed(1)}" y="${(y + 3.6).toFixed(1)}">${p.n}</text><title>${esc(p.n + '. ' + p.title)}</title></g>`;
      });
      return svg + '</svg>';
    },

    toggleDayMap() {
      this.mapOpen = !this.mapOpen;
      if (!this.mapOpen) return;
      this.refreshIcons();
      if (this.mapOpen) this.$nextTick(() => requestAnimationFrame(() => this.renderDayMap()));
    },

    renderDayMap() {
      if (!this.mapOpen) return;
      const day = this.currentDay;
      const online = navigator.onLine !== false;
      if (!online && this.offlineMap.state !== 'ready') { this.mapMode = 'svg'; this.mapNote = this.offlineMap.state === 'unsupported' ? 'Offline: street map unavailable' : 'Offline: street map unavailable. Save the offline map in Tools while on Wi-Fi.'; return; }
      this.mapMode = 'leaflet';
      this.mapNote = '';
      loadLeaflet().then(L => {
        const el = document.getElementById('day-map-leaflet');
        if (!el || !this.mapOpen) return;
        // x-show reveals on the next frame: a map sized while still hidden gets NaN bounds. Wait for a real size.
        if (!el.offsetWidth || !el.offsetHeight) { this._mapWait = (this._mapWait || 0) + 1; if (this._mapWait < 30) requestAnimationFrame(() => this.renderDayMap()); return; }
        this._mapWait = 0;
        if (!leafletMap) {
          leafletMap = L.map(el, { zoomControl: true, attributionControl: true, tap: true });
          // navigator.onLine can claim online on a dead connection: if tiles keep failing before
          // any loads, show the sketch instead of a grey square.
          let failed = 0;
          rasterLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors' })
            .on('tileload', () => { tilesLoaded++; })
            .on('tileerror', () => {
              failed++;
              if (this.mapVector) return;
              if (navigator.onLine === false || (!tilesLoaded && failed >= 3)) { this.mapMode = 'svg'; this.mapNote = navigator.onLine === false ? 'Offline: street map unavailable' : 'Street map unavailable here'; }
            });
          if (this.offlineMap.state !== 'ready') rasterLayer.addTo(leafletMap);
        }
        if (leafletLayer) leafletLayer.remove();
        leafletLayer = L.layerGroup().addTo(leafletMap);
        pinMarkers = new Map();
        const points = this.dayMapPoints(day);
        const hotel = this.dayMapHotel(day);
        const color = this.dayColor(day.id);
        const latlngs = points.map(p => [p.lat, p.lng]);
        const bounds = [...latlngs, ...(hotel ? [[hotel.lat, hotel.lng]] : [])];
        // All days: the other days in this city, faded, so the trip's shape shows around today.
        if (this.mapAll) {
          for (const other of this.days) {
            if (other.id === day.id || other.hotelRef !== day.hotelRef) continue;
            const pts = this.dayMapPoints(other);
            const c = this.dayColor(other.id);
            if (pts.length > 1) L.polyline(pts.map(p => [p.lat, p.lng]), { color: c, weight: 2, opacity: 0.35, dashArray: '4 6', interactive: false }).addTo(leafletLayer);
            for (const p of pts) {
              L.circleMarker([p.lat, p.lng], { radius: 7, color: '#0d1211', weight: 1.5, fillColor: c, fillOpacity: 0.75 })
                .bindTooltip(`Day ${other.dayNum} · ${p.n}. ${p.title}`, { direction: 'top' })
                .on('click', () => this.openMapCard(other.id, p.index)).addTo(leafletLayer);
              bounds.push([p.lat, p.lng]);
            }
          }
        }
        if (latlngs.length > 1) L.polyline(latlngs, { color, weight: 4, opacity: 0.9 }).addTo(leafletLayer);
        for (const p of points) {
          const isActive = this.mapCard?.dayId === day.id && this.mapCard?.index === p.index;
          // Stops at the same spot (e.g. a bus stop at the place you just visited) overlap: the selected one must sit on top.
          const marker = L.marker([p.lat, p.lng], { icon: this.mapPinIcon(L, p.n, color, isActive), title: `${p.n}. ${p.title}`, keyboard: true, riseOnHover: true, zIndexOffset: isActive ? 1000 : 0 })
            .on('click', () => this.openMapCard(day.id, p.index)).addTo(leafletLayer);
          pinMarkers.set(p.index, { marker, n: p.n });
        }
        if (hotel) L.marker([hotel.lat, hotel.lng], { icon: L.divIcon({ className: 'map-pin is-hotel', html: '<span>H</span>', iconSize: [28, 28], iconAnchor: [14, 14] }), title: hotel.name }).addTo(leafletLayer);
        if (this.mapLocate) this.drawLocate(L);
        leafletMap.invalidateSize();
        if (bounds.length) leafletMap.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
        const focus = this.mapCard?.dayId === day.id && points.find(p => p.index === this.mapCard.index);
        if (focus) leafletMap.setView([focus.lat, focus.lng], Math.max(leafletMap.getZoom() || 15, 15), { animate: false });
        this.syncBaseLayer(L);
        // Tiles that hang (filtered networks) never error: give up after a while and draw the sketch.
        clearTimeout(tileWatchdog);
        tileWatchdog = setTimeout(() => {
          if (this.mapOpen && this.mapMode === 'leaflet' && !tilesLoaded && !this.mapVector && this.offlineMap.state !== 'ready') { this.mapMode = 'svg'; this.mapNote = 'Street map unavailable here'; }
        }, TILE_WAIT_MS);
      }).catch(() => { this.mapMode = 'svg'; this.mapNote = 'Street map unavailable here'; });
    },

    onMapSvgTap(event) {
      const group = event.target.closest?.('.map-svg-stop');
      if (group) this.openMapCard(this.currentDay.id, Number(group.dataset.index));
    },

    landOnStop(index) {
      if (!Number.isInteger(index)) return;
      this.positionRelevantPlan({ day: this.currentDay, targetKind: 'event', eventIndex: index });
      this.flashSearchTarget(`timeline-item-${index}`);
    },

    // ---------- Map: colours, place card, full screen, all days, locate ----------
    dayColor(dayId) {
      const i = this.days.findIndex(d => d.id === dayId);
      return DAY_COLORS[(i < 0 ? 0 : i) % DAY_COLORS.length];
    },

    mapPinIcon(L, n, color, active) {
      const size = active ? 38 : 28;
      return L.divIcon({ className: 'map-pin' + (active ? ' is-active' : ''), html: `<span style="--pin:${color}">${n}</span>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
    },

    // The pin number a timeline stop has on the map (null when the stop isn't mapped).
    mapPinNo(day, idx) {
      if (!day) return null;
      this.dayMapPoints(day);
      return mapPointsCache.get(day.id)?.byIndex.get(idx) ?? null;
    },

    openMapCard(dayId, index) {
      this.mapCard = { dayId, index };
      this.refreshPinStates();
      this.refreshIcons();
      const day = this.days.find(d => d.id === dayId);
      const point = this.dayMapPoints(day).find(p => p.index === index);
      // Before Leaflet has a view (first open, still loading) there is no zoom to fly from: renderDayMap focuses the card's pin once it has drawn.
      if (leafletMap && leafletMap._loaded && point && this.mapMode === 'leaflet') leafletMap.flyTo([point.lat, point.lng], Math.max(leafletMap.getZoom() || 15, 15), { duration: this.prefersReducedMotion() ? 0 : 0.6 });
    },

    closeMapCard() { this.mapCard = null; this.refreshPinStates(); },

    refreshPinStates() {
      if (!window.L || !pinMarkers.size) return;
      const color = this.dayColor(this.currentDay?.id);
      for (const [index, { marker, n }] of pinMarkers) {
        const active = this.mapCard?.dayId === this.currentDay?.id && this.mapCard?.index === index;
        marker.setIcon(this.mapPinIcon(window.L, n, color, active));
        marker.setZIndexOffset(active ? 1000 : 0);
      }
    },

    get mapCardData() {
      const card = this.mapCard;
      if (!card) return null;
      const day = this.days.find(d => d.id === card.dayId);
      const item = day?.timeline?.[card.index];
      if (!item) return null;
      const points = this.dayMapPoints(day);
      const pos = points.findIndex(p => p.index === card.index);
      const hours = HOURS[`${day.id}|${item.title}`];
      const firstSentence = String(item.notes || '').split(/(?<=[.!?])\s/)[0].slice(0, 180);
      return {
        dayId: day.id, index: card.index, dayLabel: `Day ${day.dayNum}`, color: this.dayColor(day.id),
        n: pos >= 0 ? points[pos].n : '', pos: pos + 1, total: points.length,
        title: item.title, titleTc: item.titleTc || '', time: item.time || '', note: firstSentence,
        hours: hours ? `Open ${hours.open}–${hours.close.replace(/^2[4-9]/, h => String(Number(h.slice(0, 2)) - 24).padStart(2, '0'))}${hours.lastEntry ? ` · last entry ${hours.lastEntry}` : ''}` : '',
        url: !item.noMap && item.navigateTo ? this.mapUrl(item.navigateTo) : '',
        otherDay: day.id !== this.currentDay?.id
      };
    },

    mapCardStep(delta) {
      const card = this.mapCard;
      if (!card) return;
      const day = this.days.find(d => d.id === card.dayId);
      const points = this.dayMapPoints(day);
      if (!points.length) return;
      const pos = points.findIndex(p => p.index === card.index);
      const next = points[(pos + delta + points.length) % points.length];
      this.openMapCard(day.id, next.index);
    },

    mapCardToTimeline() {
      const card = this.mapCard;
      if (!card) return;
      if (this.mapFull) this.toggleMapFull(false);
      if (card.dayId !== this.activeDayId) {
        this.selectDayFromStrip(card.dayId);
        this.$nextTick(() => window.setTimeout(() => this.landOnStop(card.index), 120));
      } else {
        this.landOnStop(card.index);
      }
    },

    // From a timeline card's pin chip: open the map on that stop.
    showStopOnMap(idx) {
      const open = () => {
        this.openMapCard(this.currentDay.id, idx);
        // Jump (not glide) once the card has rendered: the map grows by the card's height, and a
        // smooth scroll started before that lands short.
        this.$nextTick(() => requestAnimationFrame(() => {
          const map = document.querySelector('.day-map');
          if (!map || this.mapFull) return;
          const root = document.documentElement;
          const previous = root.style.scrollBehavior;
          root.style.scrollBehavior = 'auto';
          window.scrollTo({ top: Math.max(0, map.getBoundingClientRect().top + window.scrollY - this.pinnedChromeBottom() - 8), behavior: 'auto' });
          root.style.scrollBehavior = previous;
        }));
      };
      if (!this.mapOpen) {
        this.mapOpen = true;
        this.$nextTick(() => requestAnimationFrame(() => { this.renderDayMap(); window.setTimeout(open, 250); }));
      } else open();
    },

    toggleMapFull(force) {
      const next = typeof force === 'boolean' ? force : !this.mapFull;
      if (next && !this.mapOpen) this.mapOpen = true;
      this.mapFull = next;
      document.documentElement.classList.toggle('map-full-open', next);
      this.refreshIcons();
      this.$nextTick(() => requestAnimationFrame(() => { this.renderDayMap(); }));
    },

    toggleMapAll() {
      this.mapAll = !this.mapAll;
      this.renderDayMap();
    },

    locateMe() {
      if (!('geolocation' in navigator)) { this.mapLocateNote = 'Location isn’t available on this device.'; return; }
      this.mapLocateNote = 'Finding you…';
      navigator.geolocation.getCurrentPosition(pos => {
        this.mapLocate = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: Math.round(pos.coords.accuracy || 0) };
        this.mapLocateNote = this.locateSummary();
        if (window.L && leafletMap && this.mapMode === 'leaflet') {
          this.drawLocate(window.L);
          if (leafletMap._loaded) leafletMap.flyTo([this.mapLocate.lat, this.mapLocate.lng], Math.max(leafletMap.getZoom() || 15, 15), { duration: this.prefersReducedMotion() ? 0 : 0.6 });
        }
      }, err => {
        this.mapLocateNote = err?.code === 1 ? 'Location is off for this app — allow it in Settings › Privacy › Location Services.' : 'Couldn’t get a location fix; try again outdoors.';
      }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
    },

    drawLocate(L) {
      if (!leafletMap || !this.mapLocate) return;
      if (locateLayer) locateLayer.remove();
      const { lat, lng, acc } = this.mapLocate;
      locateLayer = L.layerGroup([
        L.circle([lat, lng], { radius: Math.max(acc, 10), color: '#60a5fa', weight: 1, fillColor: '#60a5fa', fillOpacity: 0.12, interactive: false }),
        L.circleMarker([lat, lng], { radius: 7, color: '#ffffff', weight: 2.5, fillColor: '#3b82f6', fillOpacity: 1 }).bindTooltip('You are here', { direction: 'top' })
      ]).addTo(leafletMap);
    },

    // Distance and an approximate walking time to the stop the card shows, or the next one today.
    locateSummary() {
      const here = this.mapLocate;
      if (!here) return '';
      const day = this.currentDay;
      const points = this.dayMapPoints(day);
      if (!points.length) return `Located (±${here.acc} m).`;
      let target = null;
      if (this.mapCard?.dayId === day.id) target = points.find(p => p.index === this.mapCard.index);
      if (!target && this.relevantPlan?.day?.id === day.id && this.relevantPlan.targetKind === 'event') target = points.find(p => p.index >= this.relevantPlan.eventIndex);
      if (!target) target = points.reduce((best, p) => (this.haversineM(here, p) < this.haversineM(here, best) ? p : best), points[0]);
      const metres = this.haversineM(here, target);
      const walk = Math.round((metres * 1.3) / 80);
      const dist = metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres / 10) * 10} m`;
      return `${dist} to ${target.n}. ${target.title} · ≈ ${walk} min walk (approx.)`;
    },

    haversineM(a, b) {
      const R = 6371000, rad = x => x * Math.PI / 180;
      const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(h));
    },

    // ======================= F14 · Paste a confirmation =======================
    // Reads a pasted booking email or app text on the phone (nothing is sent anywhere) and
    // suggests which booking it belongs to, with its code, day and time, for the user to confirm.
    parseConfirmation(text) {
      const raw = String(text || '').slice(0, 20000);
      const flat = raw.replace(/\s+/g, ' ');
      const out = { codes: [], dates: [], times: [], flights: [], amounts: [] };
      const push = (list, v) => { if (v && !list.includes(v)) list.push(v); };
      const LABELS = ['booking\\s*(?:reference|ref\\.?|code|number|no\\.?|id)', 'confirmation\\s*(?:number|code|no\\.?|#)?', 'reservation\\s*(?:number|code|no\\.?|id)', 'order\\s*(?:number|no\\.?|id)', 'reference\\s*(?:number|no\\.?)?', 'PNR', 'ticket\\s*(?:number|no\\.?)', 'voucher\\s*(?:number|no\\.?|code)?', '訂位代號', '訂位代碼', '訂單編號', '訂單號碼', '訂單號', '預約編號', '預訂編號', '確認碼', '確認編號', '取票號碼', '電子票號', '票號', '參考編號'];
      const codeRe = new RegExp(`(?:${LABELS.join('|')})\\s*[:：#]?\\s*([A-Za-z0-9][A-Za-z0-9-]{3,24})`, 'gi');
      for (const m of flat.matchAll(codeRe)) {
        const v = m[1];
        if (/[0-9]/.test(v) || /^[A-Z]{5,8}$/.test(v)) push(out.codes, v.toUpperCase());
      }
      const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
      const addDate = (y, mo, d) => { mo = Number(mo); d = Number(d); if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) push(out.dates, `${y || 2026}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`); };
      for (const m of flat.matchAll(/\b(20\d\d)[-/.](\d{1,2})[-/.](\d{1,2})\b/g)) addDate(m[1], m[2], m[3]);
      for (const m of flat.matchAll(/(?:(20\d\d)\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*[日號号]/g)) addDate(m[1], m[2], m[3]);
      for (const m of flat.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?,?\s*(20\d\d)?/gi)) addDate(m[3], MONTHS[m[2].toLowerCase()], m[1]);
      for (const m of flat.matchAll(/\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b,?\s*(20\d\d)?/gi)) addDate(m[3], MONTHS[m[1].toLowerCase()], m[2]);
      for (const m of flat.matchAll(/(上午|下午|晚上)?\s*\b(\d{1,2})[:：](\d{2})\s*(am|pm|a\.m\.|p\.m\.)?/gi)) {
        let h = Number(m[2]); const min = m[3]; const ap = (m[4] || '').toLowerCase().replace(/\./g, '');
        if (h > 23 || Number(min) > 59) continue;
        if (ap === 'pm' || ((m[1] === '下午' || m[1] === '晚上') && h < 12)) h = h % 12 + 12;
        if (ap === 'am' && h === 12) h = 0;
        push(out.times, `${h % 12 || 12}:${min} ${h >= 12 ? 'PM' : 'AM'}`);
      }
      for (const m of flat.matchAll(/\b(CX|BR|CI|JX|UO|HX|KA)\s?(\d{2,4})\b/g)) push(out.flights, m[1] + m[2]);
      for (const m of flat.matchAll(/(NT\$|HK\$|US\$|TWD|HKD|USD)\s?([\d,]+(?:\.\d+)?)/g)) push(out.amounts, `${m[1]} ${m[2]}`);
      // Which day of the trip the first trip-window date falls on.
      const dayFor = iso => this.days.find(d => { const t = new Date(d.dateString); return !isNaN(t) && `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}` === iso; });
      const tripDate = out.dates.find(dayFor);
      const day = tripDate ? dayFor(tripDate) : null;
      // Best matching booking: keywords from its titles plus a few known names, and the date.
      const SYN = { 'b-28': ['lengshuikeng', '冷水坑'], 'b-09': ['shifen', '十分', 'jiufen', '九份', 'teapot', '茶壺山'], 'b-13': ['nara', 'funnow', '泰式'], 'b-20': ['zhongzheng sports', '中正運動中心', 'archery', '射箭', 'air rifle', '步槍'], 'b-04': ['taipei 101', '台北101', '臺北101'], 'b-02': ['thsr', '高鐵', 'high speed rail'], 'b-03': ['thsr', '高鐵', 'high speed rail'], 'b-29': ['boulder space', '圓石'], 'b-24': ['ten drum', '十鼓'], 'b-25': ['maolin', '茂林', 'qishan', '旗山'], 'b-26': ['wtt', 'world table tennis', 'kai tak arena', '啟德體藝館', 'hkticketing'], 'b-19': ['yat tung heen', '逸東軒', 'eaton'], 'b-06': ['aqua luna', '張保仔'], 'b-32': ['suzuka', '鈴鹿'], 'b-33': ['shrimp', '釣蝦'] };
      const low = flat.toLowerCase();
      const STOP = new Set(['with', 'from', 'check', 'booking', 'hours', 'price', 'online', 'ticket', 'private', 'train', 'bullet', 'center', 'centre', 'walk-in', 'call', 'ahead', 'room']);
      let best = null;
      for (const b of this.bookings) {
        const words = [...String(b.title || '').toLowerCase().split(/[^a-z0-9']+/).filter(w => w.length >= 4 && !STOP.has(w)), ...String(b.titleTc || '').split(/[・：:，、（）()\s→]+/).filter(w => w.length >= 2), ...(SYN[b.id] || [])];
        let score = 0;
        for (const w of new Set(words)) if (low.includes(w.toLowerCase())) score += SYN[b.id]?.includes(w) ? 3 : 1;
        const md = String(b.eventDate || '').match(/([A-Z][a-z]{2})\s+(\d{1,2})/);
        if (md && day) { const t = new Date(day.dateString); if (MONTHS[md[1].toLowerCase()] === t.getMonth() + 1 && Number(md[2]) === t.getDate()) score += 2; }
        if (score > (best?.score || 0)) best = { id: b.id, score };
      }
      const flight = (this.flights || []).find(f => out.flights.includes(String(f.no || '').replace(/\s/g, '')));
      const target = flight ? flight.id : (best && best.score >= 3 ? best.id : 'new');
      const firstLine = raw.split('\n').map(l => l.trim()).find(l => l.length > 3 && !/^(from|to|subject|date|寄件者|收件者)\b/i.test(l)) || '';
      return { ...out, dayId: day?.id || '', target, title: firstLine.slice(0, 120) };
    },

    openImportBooking(opener = null) {
      this.sheetForm = { text: '', read: false, found: null, target: 'new', ref: '', dayId: this.activeDayId, time: '', title: '' };
      this.openSheet('import', opener);
    },

    readConfirmation() {
      const f = this.sheetForm;
      if (!String(f.text || '').trim()) { this.showToast('Paste the confirmation text first', 'warning'); return; }
      const r = this.parseConfirmation(f.text);
      this.sheetForm = { ...f, read: true, found: r, target: r.target, ref: r.codes[0] || '', dayId: r.dayId || f.dayId, time: r.times[0] || '', title: r.title };
      this.$nextTick(() => document.querySelector('[data-modal-panel="sheet"] [data-import-result]')?.scrollIntoView({ block: 'nearest', behavior: 'instant' }));
    },

    get importTargets() {
      return [
        ...this.bookings.map(b => ({ id: b.id, label: b.title })),
        ...(this.flights || []).map(f => ({ id: f.id, label: f.title || f.no }))
      ];
    },

    saveImportedBooking() {
      const f = this.sheetForm;
      if (!f.read) { this.readConfirmation(); return; }
      if (f.target === 'new') {
        const found = f.found || {};
        const extras = [found.flights.length && `Flights: ${found.flights.join(', ')}`, found.amounts.length && `Amount: ${found.amounts.join(', ')}`, found.codes.length > 1 && `Other codes: ${found.codes.slice(1).join(', ')}`].filter(Boolean).join(' · ');
        this.sheetForm = { title: f.title || 'Imported booking', dayId: f.dayId, time: f.time, ref: f.ref, notes: extras };
        this.saveCustomBooking();
        return;
      }
      if (!String(f.ref || '').trim()) { this.showToast('No code found — type it in, or pick “New booking”', 'warning'); return; }
      this.sheetForm = { id: f.target, ref: f.ref };
      this.saveBookingRef();
    },

    // ======================= F18 · Offline street map =======================
    get offlineMapText() {
      const m = this.offlineMap;
      if (m.state === 'ready') return `Saved on this phone · ${m.mb} MB`;
      if (m.state === 'downloading') return `Downloading… ${m.pct}%`;
      if (m.state === 'error') return m.msg || 'Download failed';
      if (m.state === 'unsupported') return 'Not available on this device';
      return `Not saved · ${Math.round(OFFLINE_MAP_BYTES / 1048576)} MB`;
    },

    probeOfflineMap() {
      if (!('caches' in window)) { this.offlineMap = { state: 'unsupported', pct: 0, mb: 0, msg: '' }; return Promise.resolve(); }
      return caches.open(OFFLINE_MAP_CACHE).then(cache => cache.match(OFFLINE_MAP_KEY)).then(resp => {
        const bytes = Number(resp?.headers.get('content-length')) || OFFLINE_MAP_BYTES;
        this.offlineMap = resp ? { state: 'ready', pct: 100, mb: Math.round(bytes / 1048576), msg: '' } : { state: 'none', pct: 0, mb: 0, msg: '' };
      }).catch(() => { this.offlineMap = { state: 'none', pct: 0, mb: 0, msg: '' }; });
    },

    async downloadOfflineMap() {
      if (this.offlineMap.state === 'downloading') return;
      if (!('caches' in window)) { this.showToast('Offline maps aren’t available on this device', 'warning'); return; }
      if (navigator.onLine === false) { this.showToast('Connect to Wi-Fi first', 'warning'); return; }
      this.offlineMap = { state: 'downloading', pct: 0, mb: 0, msg: '' };
      try {
        const resp = await fetch(`${OFFLINE_MAP_URL}?swBypass=1`, { cache: 'no-store' });
        if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`);
        const total = Number(resp.headers.get('content-length')) || OFFLINE_MAP_BYTES;
        const reader = resp.body.getReader();
        const chunks = [];
        let got = 0, shown = -1;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value); got += value.length;
          const pct = Math.min(99, Math.floor(got / total * 100));
          if (pct !== shown) { shown = pct; this.offlineMap = { state: 'downloading', pct, mb: 0, msg: '' }; }
        }
        const blob = new Blob(chunks, { type: 'application/octet-stream' });
        if (blob.size < 1024 * 1024 || (await blob.slice(0, 7).text()) !== 'PMTiles') throw new Error('Not a map file');
        const cache = await caches.open(OFFLINE_MAP_CACHE);
        await cache.put(OFFLINE_MAP_KEY, new Response(blob, { headers: { 'content-type': 'application/octet-stream', 'content-length': String(blob.size) } }));
        offlineArchive = null;
        this.offlineMap = { state: 'ready', pct: 100, mb: Math.round(blob.size / 1048576), msg: '' };
        this.requestPersistentStorage();
        this.showToast('Offline map saved');
        if (this.mapOpen) this.renderDayMap();
      } catch (error) {
        this.offlineMap = { state: 'error', pct: 0, mb: 0, msg: navigator.onLine === false ? 'Lost the connection. Try again on Wi-Fi' : 'Download failed. Try again on Wi-Fi' };
      }
    },

    removeOfflineMap() {
      if (!window.confirm('Remove the offline map from this phone? You can download it again on Wi-Fi.')) return Promise.resolve();
      return caches.delete(OFFLINE_MAP_CACHE).then(() => {
        offlineArchive = null;
        if (vectorLayer && leafletMap) { try { vectorLayer.remove(); } catch (_) {} }
        vectorLayer = null;
        this.mapVector = false;
        this.offlineMap = { state: 'none', pct: 0, mb: 0, msg: '' };
        this.showToast('Offline map removed');
        if (this.mapOpen) this.renderDayMap();
      });
    },

    async getOfflineArchive() {
      if (offlineArchive) return offlineArchive;
      await loadVectorLibs();
      const cache = await caches.open(OFFLINE_MAP_CACHE);
      const resp = await cache.match(OFFLINE_MAP_KEY);
      if (!resp) throw new Error('No offline map saved');
      const archive = new window.pmtiles.PMTiles(new MemorySource(await resp.arrayBuffer()));
      await archive.getHeader();
      offlineArchive = archive;
      return archive;
    },

    // The saved map draws the streets (dark, works with no signal); otherwise the online tiles do.
    async syncBaseLayer(L) {
      if (!leafletMap) return;
      const useRaster = () => {
        if (vectorLayer && leafletMap.hasLayer(vectorLayer)) vectorLayer.remove();
        if (rasterLayer && !leafletMap.hasLayer(rasterLayer) && navigator.onLine !== false) rasterLayer.addTo(leafletMap);
        this.mapVector = false;
      };
      if (this.offlineMap.state !== 'ready') { useRaster(); return; }
      try {
        const archive = await this.getOfflineArchive();
        if (!leafletMap) return;
        if (!vectorLayer) vectorLayer = window.protomapsL.leafletLayer({ url: archive, flavor: 'dark', lang: 'en', maxDataZoom: 15, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors · Protomaps' });
        if (!leafletMap.hasLayer(vectorLayer)) vectorLayer.addTo(leafletMap);
        if (rasterLayer && leafletMap.hasLayer(rasterLayer)) rasterLayer.remove();
        clearTimeout(tileWatchdog);
        this.mapVector = true;
        this.mapMode = 'leaflet';
        this.mapNote = '';
      } catch (_) {
        useRaster();
      }
    },

    // ======================= F15 · Day forecast (°F) =======================
    dayForecast(day) {
      void this.liveVersion;
      if (!day || day.timeZone === 'America/New_York') return null;
      const key = `${day.id}|${this.liveVersion}`;
      if (forecastCache.has(key)) return forecastCache.get(key);
      const result = this.computeDayForecast(day);
      forecastCache.set(key, result);
      if (forecastCache.size > 80) forecastCache.delete(forecastCache.keys().next().value);
      return result;
    },

    computeDayForecast(day) {
      const om = readLive('openmeteo');
      const placeKey = (typeof SUN_PLACES === 'object' && SUN_PLACES[day.id]?.[0]) || (day.hotelRef === 'hk' ? 'hk' : day.hotelRef) || 'taipei';
      const series = om?.data?.places?.[placeKey];
      const date = this.parseMonthDay(day.dateString);
      if (!series?.t?.length || !date) return null;
      const prefix = `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}T`;
      let hi = -Infinity, lo = Infinity, rain = 0, gust = 0, hours = 0;
      om.data.time.forEach((stamp, i) => {
        if (!stamp.startsWith(prefix)) return;
        const t = series.t[i];
        if (!Number.isFinite(t)) return;
        hours++; hi = Math.max(hi, t); lo = Math.min(lo, t);
        const hour = Number(stamp.slice(11, 13));
        if (hour >= 7 && hour <= 22) {
          if (Number.isFinite(series.p[i])) rain = Math.max(rain, series.p[i]);
          if (Number.isFinite(series.g[i])) gust = Math.max(gust, series.g[i]);
        }
      });
      if (hours < 12) return null;
      hi = Math.round(hi); lo = Math.round(lo); rain = Math.round(rain);
      const gustMph = Math.round(gust * 0.621);
      const cue = [];
      if (rain >= 60) cue.push('Rain likely: poncho or umbrella');
      else if (rain >= 30) cue.push('Showers possible: pack a poncho');
      if (hi >= 80) cue.push('Hot and humid: light clothes, water, sunscreen');
      else if (hi >= 70) cue.push('Mild: light layers');
      else cue.push('Cool: a jacket');
      if (lo <= 55 && hi >= 70) cue.push('chilly evening: bring a layer');
      if (gust >= 45) cue.push('windy: secure hats and layers');
      if (['day-04', 'day-05', 'day-10', 'day-13', 'day-14'].includes(day.id)) cue.push('check the hike card before setting off');
      return { hi, lo, rain, gustMph, cue: cue.join(' · '), asOf: this.liveAge('openmeteo') };
    },

    // ======================= F16 · Walk time between stops =======================
    legInfo(day, idx) {
      const item = day?.timeline?.[idx];
      if (!item || item.noMap || !item.navigateTo) return null;
      const key = `${day.id}|${idx}`;
      const hit = legCache.get(key);
      if (hit && hit.tl === day.timeline) return hit.v;
      let v = null;
      const prev = this.previousStop(day, idx);
      if (prev) {
        const before = day.timeline[prev.index];
        const a = this.stopCoord(day, prev.index), b = this.stopCoord(day, idx);
        // Not after a hike that ends elsewhere, and never across a flight or a long train.
        if (a && b && !before.exitTo && !this.isLongTransport(before) && !this.isLongTransport(item)) {
          const km = kmBetween(a, b);
          if (km >= 0.12 && km <= 30) {
            const road = km * 1.3;   // streets run longer than the straight line
            const dist = road < 1 ? `${Math.round(road * 100) * 10} m` : `${road.toFixed(1)} km`;
            const miles = `${(road * 0.621).toFixed(1)} mi`;
            v = road <= 2.2
              ? { walk: true, min: Math.max(1, Math.round(road * 1000 / 80)), km: road, text: `${Math.max(1, Math.round(road * 1000 / 80))} min walk · ${dist} (${miles})` }
              : { walk: false, min: 0, km: road, text: `≈ ${dist} (${miles}) · taxi or transit` };
          }
        }
      }
      legCache.set(key, { tl: day.timeline, v });
      return v;
    },

    // ======================= F17 · Preview controls =======================
    pad2(n) { return String(n).padStart(2, '0'); },

    // Every timed stop of the trip in order, as absolute times (Day 1 is New York, the rest +08:00).
    previewStops() {
      if (previewListCache && previewListCache.days === this.days) return previewListCache.list;
      const list = [];
      for (const d of this.days) {
        const date = this.parseMonthDay(d.dateString);
        if (!date) continue;
        const offset = d.timeZone === 'America/New_York' ? '-05:00' : '+08:00';
        d.timeline.forEach((item, index) => {
          const m = this.parseTimelineStartMinutes(item.time);
          if (!Number.isFinite(m)) return;
          const ts = Date.parse(`${date.year}-${this.pad2(date.month)}-${this.pad2(date.day)}T${this.pad2(Math.floor(m / 60) % 24)}:${this.pad2(m % 60)}:00${offset}`);
          const endMin = this.parseTimelineEndMinutes(item.time);
          list.push({ ts, endTs: Number.isFinite(endMin) ? ts + (endMin - m) * 60000 : ts + 30 * 60000, dayId: d.id, index, title: item.title });
        });
      }
      list.sort((a, b) => a.ts - b.ts);
      previewListCache = { days: this.days, list };
      return list;
    },

    taipeiInput(ts) {
      const text = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ts);
      return text.replace(' ', 'T');
    },

    get previewClockText() {
      if (!this.isSimulated) return '';
      return new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(this.clockNow()) + ' · Taipei time';
    },

    setPreviewTo(ts) {
      const min = Date.parse('2026-11-27T00:00:00+08:00'), max = Date.parse('2026-12-14T23:59:00+08:00');
      ts = Math.min(max, Math.max(min, ts));
      if (!Number.isFinite(ts)) return;
      if (!this.isSimulated) this._preSimDayId = this.activeDayId;
      this.simOffsetMs = (ts - Date.now()) || 1;
      this.simInput = this.taipeiInput(ts);
      this.refreshLiveContext(false);
      if (this.liveTripDayId) this.activeDayId = this.liveTripDayId;
      // The bar sticks just under the pinned header and day rail.
      try { document.documentElement.style.setProperty('--preview-top', `${Math.round(this.pinnedChromeBottom()) + 6}px`); } catch (_) {}
      this.refreshIcons();
    },

    previewJump(minutes) { this.setPreviewTo(this.clockNow() + minutes * 60000); },

    previewStep(dir) {
      const list = this.previewStops(), now = this.clockNow();
      const target = dir > 0 ? list.find(s => s.ts > now + 45000) : [...list].reverse().find(s => s.ts < now - 90000);
      if (!target) { this.showToast(dir > 0 ? 'That’s the last stop of the trip' : 'That’s the first stop of the trip'); return false; }
      // A minute in: the stop is the current one, not "up next".
      this.setPreviewTo(target.ts + 60000);
      return true;
    },

    previewDayId() {
      const list = this.previewStops(), now = this.clockNow() + 45000;
      let current = list[0];
      for (const s of list) { if (s.ts <= now) current = s; else break; }
      return current?.dayId || this.days[0].id;
    },

    playDay(dayId) {
      const id = this.days.some(d => d.id === dayId) ? dayId : this.currentDay.id;
      const first = this.previewStops().find(s => s.dayId === id);
      if (!first) return;
      this.stopPlayDay();
      this.setPreviewTo(first.ts + 60000);
      this.switchTab('today');
      this.$nextTick(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      this.startPlayLoop();
    },

    startPlayLoop() {
      this.previewPlaying = true;
      this._playDone = false;
      const tick = () => {
        if (!this.previewPlaying) return;
        if (!this.isSimulated) { this.stopPlayDay(); return; }
        const list = this.previewStops(), now = this.clockNow(), dayId = this.previewDayId();
        const next = list.find(s => s.ts > now + 45000 && s.dayId === dayId);
        if (next) this.setPreviewTo(next.ts + 60000);
        else if (!this._playDone) {
          // After the last stop the Now card hands over to tomorrow, as it will that night.
          const last = [...list].reverse().find(s => s.dayId === dayId);
          this._playDone = true;
          if (last) this.setPreviewTo(last.endTs + 5 * 60000);
        } else { this.stopPlayDay(); this.showToast('That’s the whole day'); return; }
        this._playTimer = window.setTimeout(tick, this.previewSpeed === 2 ? 1400 : 3200);
      };
      this._playTimer = window.setTimeout(tick, this.previewSpeed === 2 ? 1400 : 3200);
    },

    stopPlayDay() {
      this.previewPlaying = false;
      if (this._playTimer) { window.clearTimeout(this._playTimer); this._playTimer = null; }
    },

    togglePlayDay() {
      if (this.previewPlaying) { this.stopPlayDay(); return; }
      this._playDone = false;
      if (!this.isSimulated) { this.playDay(this.currentDay.id); return; }
      this.startPlayLoop();
    },

    leavePreview() { this.stopPlayDay(); this.resetToLiveTime(); },

    // ======================= F3 · Ticket photos =======================
    loadPhotoIndex() {
      return photoDb.all().then(records => {
        const index = {};
        for (const record of records || []) {
          if (record.bookingId === PHOTO_PROBE_BOOKING) continue;
          (index[record.bookingId] ||= []).push({ id: record.id, label: record.label, w: record.w, h: record.h, addedAt: record.addedAt });
        }
        for (const list of Object.values(index)) list.sort((a, b) => a.addedAt - b.addedAt);
        this.photoIndex = index;
      }).catch(() => { this.photosAvailable = false; });
    },

    // Private tabs can open IndexedDB yet refuse writes: probe once with a 1-byte record.
    probePhotoStorage() {
      const probe = { id: 'ph-probe', bookingId: PHOTO_PROBE_BOOKING, type: 'application/octet-stream', bytes: new Uint8Array([1]).buffer, addedAt: 0 };
      return photoDb.put(probe).then(() => photoDb.delete(probe.id)).then(() => { this.photosAvailable = true; })
        .catch(() => { this.photosAvailable = false; });
    },

    markPhotosChanged() {
      photoGen++;
      if (this.activeTab === 'toolkit') this.schedulePhotoExport();
    },

    photoCount(bookingId) { return (this.photoIndex[bookingId] || []).length; },

    get orphanPhotoGroups() {
      const known = new Set([...this.bookings.map(item => item.id), ...FLIGHTS.map(f => f.id)]);
      return Object.entries(this.photoIndex || {}).filter(([id, list]) => !known.has(id) && list.length).map(([id, list]) => ({ bookingId: id, label: list[0]?.label || id, count: list.length }));
    },

    addTicketPhoto(bookingId) {
      if (!this.photosAvailable) { this.showToast(PHOTOS_UNAVAILABLE, 'warning'); return; }
      if (this.photoCount(bookingId) >= MAX_PHOTOS_PER_BOOKING) { this.showToast(`That's ${MAX_PHOTOS_PER_BOOKING} photos for this booking, the most it keeps`, 'warning'); return; }
      this.pendingPhotoBookingId = bookingId;
      document.getElementById('ticket-photo-input')?.click();
    },

    async onTicketPhotoFiles(event) {
      const input = event?.target;
      const files = [...(input?.files || [])];
      const bookingId = this.pendingPhotoBookingId;
      if (input) input.value = '';
      if (!files.length || !bookingId) return;
      const title = this.bookings.find(item => item.id === bookingId)?.title || FLIGHTS.find(f => f.id === bookingId)?.title || 'Ticket';
      let added = 0, failed = 0, unsaved = 0;
      for (const file of files) {
        if (this.photoCount(bookingId) + added >= MAX_PHOTOS_PER_BOOKING) break;
        let shrunk;
        try { shrunk = await shrinkToJpeg(file); } catch (_) { failed++; continue; }
        try {
          const record = { id: 'ph-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8), bookingId, label: `${title} ${this.photoCount(bookingId) + added + 1}`, type: 'image/jpeg', bytes: await shrunk.blob.arrayBuffer(), w: shrunk.w, h: shrunk.h, addedAt: Date.now() };
          await photoDb.put(record);
          added++;
        } catch (_) { unsaved++; }
      }
      await this.loadPhotoIndex();
      if (added) { this.markPhotosChanged(); this.requestPersistentStorage(); }
      if (unsaved && !added) { this.photosAvailable = false; this.showToast(PHOTOS_UNAVAILABLE, 'warning'); }
      else if (failed || unsaved) this.showToast(added ? `${added} added; ${failed + unsaved} couldn't be saved` : 'That photo couldn\'t be read', 'warning');
      else if (added) this.showToast(added === 1 ? 'Ticket photo saved on this phone' : `${added} ticket photos saved on this phone`);
    },

    openPhotoViewer(bookingId, title, opener = null) {
      const item = this.bookings.find(candidate => candidate.id === bookingId);
      const data = item ? this.bookingShowData(item) : { kind: 'booking', title, local: '', address: '', ref: this.bookingRefs?.[bookingId] || '', when: '', lang: 'zh-Hant', bookingId };
      this.openShowCard({ ...data, bookingId }, opener);
    },

    showPhotoAt(bookingId, index) {
      const list = this.photoIndex[bookingId] || [];
      if (!list.length) { this.clearViewer(); return Promise.resolve(); }
      const safe = ((index % list.length) + list.length) % list.length;
      const token = viewerToken;
      return photoDb.get(list[safe].id).then(record => {
        const blob = recordBlob(record);
        // The Show card may have closed (or moved on) while the photo was being read.
        if (token !== viewerToken || !blob) return;
        if (viewerUrl) URL.revokeObjectURL(viewerUrl);
        viewerUrl = URL.createObjectURL(blob);
        this.photoViewer = { bookingId, index: safe, url: viewerUrl, total: list.length };
      }).catch(() => this.clearViewer());
    },

    nextPhoto() {
      const v = this.photoViewer;
      if (v.total > 1) this.showPhotoAt(v.bookingId, v.index + 1);
    },

    clearViewer() {
      viewerToken++;
      if (viewerUrl) URL.revokeObjectURL(viewerUrl);
      viewerUrl = '';
      this.photoViewer = { bookingId: '', index: 0, url: '', total: 0 };
    },

    deleteViewerPhoto() {
      const v = this.photoViewer;
      const record = (this.photoIndex[v.bookingId] || [])[v.index];
      if (!record || !window.confirm('Delete this ticket photo?')) return;
      photoDb.delete(record.id).then(() => this.loadPhotoIndex()).then(() => {
        this.markPhotosChanged();
        if (this.photoCount(v.bookingId)) this.showPhotoAt(v.bookingId, Math.min(v.index, this.photoCount(v.bookingId) - 1));
        else this.clearViewer();
        this.showToast('Ticket photo deleted');
      }).catch(() => this.showToast('Couldn\'t delete the photo', 'warning'));
    },

    deleteOrphanGroup(bookingId) {
      const list = this.photoIndex[bookingId] || [];
      if (!list.length || !window.confirm(`Delete ${list.length === 1 ? 'this ticket photo' : `these ${list.length} ticket photos`}?`)) return;
      Promise.all(list.map(item => photoDb.delete(item.id))).then(() => this.loadPhotoIndex()).then(() => { this.markPhotosChanged(); this.showToast('Deleted'); });
    },

    // Encodes photos for the backup only when they changed since the last encode.
    schedulePhotoExport() {
      if (builtGen === photoGen) { this.photoExportReady = true; return; }
      this.photoExportReady = false;
      clearTimeout(photoExportTimer);
      photoExportTimer = setTimeout(() => {
        const gen = photoGen;
        photoDb.all().then(async records => {
          const out = [];
          for (const record of records || []) {
            if (record.bookingId === PHOTO_PROBE_BOOKING) continue;
            const blob = recordBlob(record);
            if (blob) out.push({ id: record.id, bookingId: record.bookingId, label: record.label, type: 'image/jpeg', w: record.w, h: record.h, addedAt: record.addedAt, data: await blobToBase64(blob) });
          }
          if (gen !== photoGen) { this.schedulePhotoExport(); return; }
          photoExports = out;
          builtGen = gen;
          this.photoExportReady = true;
        }).catch(() => { photoExports = []; builtGen = gen; this.photoExportReady = true; });
      }, 300);
    },

    updatePhotoStorageText() {
      const count = Object.values(this.photoIndex || {}).reduce((sum, list) => sum + list.length, 0);
      if (!navigator.storage?.estimate) { this.photoStorageText = `${count}`; return; }
      navigator.storage.estimate().then(({ usage }) => {
        this.photoStorageText = `${count} · ${(Number(usage || 0) / 1048576).toFixed(1)} MB stored`;
      }).catch(() => { this.photoStorageText = `${count}`; });
    },

    // Synchronous on the tap, so iOS keeps the share sheet: the photo part is prepared ahead.
    exportState() {
      if (!this.photoExportReady) { this.showToast('Preparing the backup — try again in a moment', 'warning'); return; }
      const payload = this.buildStatePayload();
      payload.ticketPhotos = photoExports || [];
      const json = JSON.stringify(payload);
      if (json.length > BACKUP_MAX_BYTES) { this.showToast('Backup is large — remove some ticket photos first', 'warning'); return; }
      const blob = new Blob([json], { type: 'application/json' });
      this.deliverFile(blob, `taiwan_hong_kong_2026_user_state_${new Date().toISOString().slice(0, 10)}.json`, 'Backup downloaded', 'Backup ready to save');
    },

    async importTicketPhotos(list) {
      const result = { restored: 0, failed: 0 };
      if (!Array.isArray(list) || !list.length) return result;
      const counts = {};
      for (const [id, items] of Object.entries(this.photoIndex || {})) counts[id] = items.length;
      for (const item of list) {
        if (!item || typeof item !== 'object' || !/^ph-[a-z0-9]+$/i.test(String(item.id || '')) || typeof item.data !== 'string') { result.failed++; continue; }
        const bookingId = String(item.bookingId || '').slice(0, 60);
        const existing = (this.photoIndex[bookingId] || []).some(p => p.id === item.id);
        if (!existing && (counts[bookingId] || 0) >= MAX_PHOTOS_PER_BOOKING) { result.failed++; continue; }
        try {
          const bytes = await base64ToBlob(item.data, 'image/jpeg').arrayBuffer();
          await photoDb.put({ id: String(item.id), bookingId, label: String(item.label || 'Ticket').slice(0, 160), type: 'image/jpeg', bytes, w: Number(item.w) || 0, h: Number(item.h) || 0, addedAt: Number(item.addedAt) || Date.now() });
          if (!existing) counts[bookingId] = (counts[bookingId] || 0) + 1;
          result.restored++;
        } catch (_) { result.failed++; }
      }
      await this.loadPhotoIndex();
      if (result.restored) this.markPhotosChanged();
      return result;
    },

    // ======================= Self-checks (synchronous; no network or IndexedDB) =======================
    runFeatureQa() {
      const issues = [];
      let checks = 0;
      const check = (ok, message) => { checks++; if (!ok) issues.push(message); };
      const day = id => this.days.find(d => d.id === id);
      const savedSim = this.simOffsetMs;
      // Route links are checked as a non-live view.
      const d4 = day('day-04');
      const g4 = this.googleRouteLinks(d4);
      check(g4.length > 0 && g4.some(l => l.url.includes('waypoints=')) && g4.every(l => !l.url.includes('|')), 'F1: Day 4 Google route needs waypoints= and no raw |.');
      check(this.days.every(d => this.googleRouteLinks(d).every(l => ((l.url.match(/waypoints=([^&]*)/) || [, ''])[1].split('%7C').filter(Boolean).length) <= GOOGLE_MAX_WAYPOINTS)), 'F1: a Google link has more than 3 waypoints.');
      check(this.routeLinks(day('day-01')) === null && this.googleRouteLinks({ id: 'x', timeline: [{ title: 'a', navigateTo: 'A' }] }).length === 0, 'F1: a day with fewer than 2 stops returned links.');
      check(this.appleRouteLinks(d4).every(l => l.url.startsWith('https://maps.apple.com/directions?') && l.url.includes('mode=driving')), 'F1: Apple route link malformed.');
      const longJumps = [];
      for (const d of this.days) {
        for (const link of [...this.googleRouteLinks(d), ...this.appleRouteLinks(d)]) {
          const pts = link.stops.map(stop => this.stopCoord(d, stop.index)).filter(Boolean);
          for (let i = 1; i < pts.length; i++) if (kmBetween(pts[i - 1], pts[i]) > ROUTE_SPLIT_KM) longJumps.push(`${d.id} ${link.range}`);
        }
      }
      check(longJumps.length === 0, `F1: a route link joins stops more than ${ROUTE_SPLIT_KM} km apart: ${longJumps.join(', ')}`);
      check(this.days.every(d => this.googleRouteLinks(d).every(link => link.stops.every(stop => !this.isLongTransport(d.timeline[stop.index])))), 'F1: a route link includes a flight or train ride as a stop.');

      // Calendar.
      const ics = this.buildIcs(this.days);
      const timed = this.days.reduce((n, d) => n + d.timeline.filter(i => i.startAt || Number.isFinite(this.parseTimelineStartMinutes(i.time))).length, 0);
      check((ics.match(/BEGIN:VEVENT/g) || []).length === timed, 'F2: one VEVENT per timed item.');
      const ev1 = this.calendarEvents([day('day-01')])[0];
      check(ev1 && icsStamp(ev1.start) === '20261128T111500Z', 'F2: Day 1 first event should start 20261128T111500Z.');
      const d6 = day('day-06');
      const e6 = this.calendarEvents([d6]).find(e => e.summary === d6.timeline.find(i => /^9:30 AM/.test(i.time))?.title);
      check(e6 && icsStamp(e6.start) === '20261203T013000Z', 'F2: Day 6 9:30 AM item should start 20261203T013000Z.');
      const d7 = day('day-07');
      const lastD7 = d7.timeline[d7.timeline.length - 1];
      const synthD7 = { ...d7, timeline: [{ ...lastD7, startAt: undefined, endAt: undefined, time: '10:00 PM – 12:00 AM' }] };
      const em = this.calendarEvents([synthD7]).find(e => e.uid.startsWith('day-07-0-'));
      check(em && icsStamp(em.end).startsWith('20261204T16') && icsStamp(em.end) === '20261204T160000Z', 'F2: an item ending 12:00 AM must end on the next date.');
      check(ics.split('\r\n').every(line => utf8.encode(line).length <= 75), 'F2: an ICS line exceeds 75 octets.');
      check(!/\r\n(SUMMARY|LOCATION|DESCRIPTION):[^\r]*[^\\],/.test(ics.replace(/\r\n /g, '')), 'F2: unescaped comma in a text field.');
      check(this.calendarEvents([day('day-11')]).some(e => /CX495/.test(e.summary) && icsStamp(e.start) === '20261208T052000Z'), 'F2: CX495 must start 13:20 Taipei.');
      check(this.calendarEvents([day('day-16')]).some(e => /CX840/.test(e.summary) && icsStamp(e.end) === '20261214T000500Z'), 'F2: CX840 must arrive 19:05 New York.');

      // Photos (state shape only).
      check(this.photoIndex && typeof this.photoIndex === 'object' && !Array.isArray(this.photoIndex), 'F3: photoIndex must be an object.');
      // The viewer sits inside the Show card's x-if templates, so look through template content too.
      const findIn = root => Boolean(root.querySelector('[data-photo-viewer], template[data-photo-template]')) || [...root.querySelectorAll('template')].some(t => findIn(t.content));
      check(findIn(document), 'F3: the Show card has no photo container.');
      check(/ticketPhotos/.test(String(this.exportState)), 'F3: the backup builder must include ticketPhotos.');
      try {
        const saved = this.photoIndex;
        this.photoIndex = { ...saved, 'b-gone': [{ id: 'ph-qa', label: 'QA', w: 1, h: 1, addedAt: 0 }] };
        check(this.orphanPhotoGroups.some(g => g.bookingId === 'b-gone'), 'F3: orphaned photos are not listed.');
        this.photoIndex = saved;
      } catch (_) { check(false, 'F3: orphan listing threw.'); }

      // Calculator.
      check(Math.abs(this.calcToUsd(350, 'TWD') - 350 / this.currencyRates.TWD) < 0.01, 'F4: TWD conversion is off.');

      // Flights.
      check(FLIGHTS.length === 4 && FLIGHTS.every(f => Date.parse(f.arr) > Date.parse(f.dep)), 'F5: flights need valid ISO times, arrival after departure.');
      check(FLIGHTS.find(f => f.dayId === 'day-11')?.no === 'CX495', 'F5: Day 11 flight must be CX495.');
      check(this.flightStatusUrl(FLIGHTS.find(f => f.no === 'CX840')).endsWith('CPA840'), 'F5: CX840 status URL must end CPA840.');
      check(this.flightStatus(FLIGHTS.find(f => f.no === 'CX495'), Date.parse(FLIGHTS[2].dep) - 3600000).text === 'Departs in 1h', 'F5: one hour before CX495 should read "Departs in 1h".');
      check(Object.keys(this.sanitizeBookingRefs({ 'f-cx495': 'ABC' })).includes('f-cx495'), 'F5: flight codes are not kept.');

      // Weather + hikes (pure logic).
      check(this.hikeVerdict({ gustMax: 55, rainMax: 10, visMinKm: 10 }) === 'no-go' && this.hikeVerdict({ gustMax: 36, rainMax: 10, visMinKm: 10 }) === 'caution' && this.hikeVerdict({ gustMax: 10, rainMax: 10, visMinKm: 10 }) === 'go' && this.hikeVerdict({ gustMax: 10, rainMax: 10, visMinKm: 10 }, { anyTyphoon: true }) === 'no-go', 'F7: verdict thresholds are wrong.');
      check(Object.values(SUMMITS).every(([lat, lng]) => lat > 21.8 && lat < 25.4 && lng > 113.8 && lng < 122.1), 'F7: a summit is outside the region.');
      check(this.hikeVerdict(null, { anyTyphoon: true }) === 'no-go', 'F7: a typhoon signal with no forecast must be no-go.');
      {
        const saved = LIVE.hkowarn;
        LIVE.hkowarn = { at: Date.now() - 3 * 3600000, data: { WTCSGNL: { code: 'TC8NE', actionCode: 'ISSUE' } } };
        check(!this.hkoWarnings().anyTyphoon, 'F6: a warning cached over 2 h ago is still shown.');
        LIVE.hkowarn = { at: Date.now(), data: { WRAIN: { code: 'WRAINR', actionCode: 'ISSUE' } } };
        check(this.hkoWarnings().names.join() === 'Red Rainstorm Warning', 'F6: HKO warning codes must show by name.');
        if (saved) LIVE.hkowarn = saved; else delete LIVE.hkowarn;
      }
      check(this.flightStatus(FLIGHTS[2], Date.parse(FLIGHTS[2].dep) - 40 * 3600000).key === 'open' && this.flightStatus(FLIGHTS[3], Date.parse(FLIGHTS[3].dep) - 40 * 3600000).key === 'before', 'F5: check-in should open at 48 h (24 h for the US flight).');

      // Last trains.
      check(LAST_LEGS.every(leg => /^\d{2}:\d{2}$/.test(leg.last) && /^https:\/\//.test(leg.source) && this.days.some(d => d.id === leg.dayId) && (!leg.afterItemTitle || day(leg.dayId).timeline.some(i => i.title === leg.afterItemTitle))), 'F8: a last leg is malformed or points at a missing stop.');

      // Map coordinates.
      const coords = window.TWHK_COORDS?.stops || {};
      let mappable = 0, located = 0, inside = true;
      for (const d of this.days) {
        d.timeline.forEach((item, i) => {
          if (item.noMap || !item.navigateTo) return;
          mappable++;
          const c = coords[d.id]?.[i];
          if (!c || c[2] !== item.title) return;
          located++;
          const [lat, lng] = c;
          const tw = lat >= 21.8 && lat <= 25.4 && lng >= 119.9 && lng <= 122.1;
          const hk = lat >= 22.15 && lat <= 22.6 && lng >= 113.8 && lng <= 114.45;
          const ny = d.id === 'day-01';
          if (!(HK_DAYS.has(d.id) && d.id !== 'day-11' ? hk : (tw || hk || ny))) inside = false;
        });
      }
      check(mappable > 0 && located === mappable, `F9: ${mappable - located} mappable stops have no coordinates.`);
      check(inside, 'F9: a stop falls outside its region box.');
      check(this.dayMapSvg(d4).startsWith('<svg') && !/<script/i.test(this.dayMapSvg(d4)), 'F9: offline map sketch is broken.');
      check(new Set(this.days.map(d => this.dayColor(d.id))).size === this.days.length, 'F9: every day needs its own map colour.');
      check(this.basics.length === 3 && this.basics.every(tab => tab.sections.length >= 2 && tab.sections.every(s => s.items.length >= 2 && s.items.every(i => i.t.length > 20 && ['ok', 'check', ''].includes(i.m)))) && !JSON.stringify(this.basics).match(/TBD|°C|CX443/), 'F19: the first-timer basics are malformed.');
      check(['checking', 'none', 'ready', 'downloading', 'error', 'unsupported'].includes(this.offlineMap.state) && typeof this.downloadOfflineMap === 'function' && typeof this.removeOfflineMap === 'function', 'F18: the offline map state is broken.');
      check(OFFLINE_MAP_KEY.endsWith('/assets/offline/trip.pmtiles') && OFFLINE_MAP_BYTES > 5e6, 'F18: the offline map file is not set up.');
      {
        // F15: forecast from a made-up series, then restored.
        const savedLive = JSON.stringify(readLiveRaw('openmeteo'));
        const fake = { time: [], places: {} };
        for (let h = 0; h < 24; h++) fake.time.push(`2026-12-04T${this.pad2(h)}:00`);
        fake.places.taipei = { t: fake.time.map((_, h) => 62 + Math.round(12 * Math.sin((h - 8) / 24 * Math.PI * 2) + 6)), p: fake.time.map(() => 40), g: fake.time.map(() => 30), c: [], v: [] };
        writeLive('openmeteo', fake); this.liveVersion++;
        const fc = this.dayForecast(this.days.find(d => d.id === 'day-07'));
        check(fc && fc.hi > fc.lo && fc.rain === 40 && fc.gustMph === 19 && /poncho/.test(fc.cue), 'F15: the day forecast must give high/low in °F, rain and a pack cue.');
        check(this.dayForecast(this.days[0]) === null, 'F15: Day 1 (New York) must have no Taipei forecast.');
        if (savedLive && savedLive !== 'null') { LIVE.openmeteo = JSON.parse(savedLive); try { localStorage.setItem(liveKey('openmeteo'), savedLive); } catch (_) {} } else { delete LIVE.openmeteo; try { localStorage.removeItem(liveKey('openmeteo')); } catch (_) {} }
        this.liveVersion++;
      }
      {
        // F16: walk times between stops.
        let shown = 0, bad = 0;
        for (const d of this.days) d.timeline.forEach((_, i) => { const leg = this.legInfo(d, i); if (!leg) return; shown++; if (!Number.isFinite(leg.km) || leg.km <= 0.1 || (leg.walk && (leg.min < 1 || leg.min > 35)) || !leg.text) bad++; });
        const d6 = this.days.find(x => x.id === 'day-06');
        const cks = d6.timeline.findIndex(i => /Liberty Square/.test(i.title));
        check(shown > 60 && bad === 0, `F16: walk-time connectors are wrong (${shown} shown, ${bad} bad).`);
        check(this.legInfo(d6, cks)?.walk === true, 'F16: archery → Liberty Square should be a short walk.');
        const hikeDay = this.days.find(x => x.id === 'day-13');
        const afterHike = hikeDay.timeline.findIndex(i => /^Finish Wang Tau Hom/.test(i.title));
        check(this.legInfo(hikeDay, afterHike) === null, 'F16: no walk time after a hike that ends somewhere else.');
      }
      {
        // F17: preview stepping.
        const list = this.previewStops();
        check(list.length > 150 && list.every((s, i) => i === 0 || s.ts >= list[i - 1].ts) && list.every(s => s.endTs > s.ts), 'F17: the preview stop list is out of order.');
        const dec11 = list.filter(s => s.dayId === 'day-14');
        check(dec11.length === this.days.find(d => d.id === 'day-14').timeline.length && dec11[0].ts === Date.parse('2026-12-11T07:15:00+08:00'), 'F17: Dec 11 stop times are wrong.');
        check(list[0].ts === Date.parse('2026-11-28T06:15:00-05:00'), 'F17: Day 1 must be New York time.');
        check(this.taipeiInput(Date.parse('2026-12-04T17:45:00+08:00')) === '2026-12-04T17:45', 'F17: preview time input is malformed.');
      }
      {
        const t1 = this.parseConfirmation('高鐵訂位成功\n訂位代號：08223415\n乘車日期 2026/12/08 09:35 左營 → 桃園');
        check(t1.codes[0] === '08223415' && t1.dayId === 'day-11' && t1.target === 'b-03' && t1.times[0] === '9:35 AM', 'F14: a THSR confirmation must map to the Dec 8 train with its code.');
        const t2 = this.parseConfirmation('Aqua Luna — Evening Harbour Cruise\nBooking Reference: AL7H3K2\nDate: Sat, 12 Dec 2026  Time: 17:30  Tsim Sha Tsui Pier 1\nTotal HK$840');
        check(t2.codes[0] === 'AL7H3K2' && t2.dayId === 'day-15' && t2.target === 'b-06' && t2.times.includes('5:30 PM') && t2.amounts[0] === 'HK$ 840', 'F14: an Aqua Luna email must map to the cruise booking.');
        const t3 = this.parseConfirmation('Your trip: CX495 Taipei to Hong Kong, 8 December 2026, departs 13:20. Booking reference ABCDEF');
        check(t3.target === 'f-cx495' && t3.codes[0] === 'ABCDEF', 'F14: a flight email must map to its flight.');
        const t4 = this.parseConfirmation('Thanks for your order! Order number: 55120934 for Friday, December 4, 2026 at 7:30 PM');
        check(t4.target === 'new' && t4.dayId === 'day-07' && t4.times[0] === '7:30 PM', 'F14: an unknown booking must default to a new one on the right day.');
      }
      if (window.lucide?.icons) {
        const have = new Set(Object.keys(window.lucide.icons).map(k => k.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Za-z])([0-9])/g, '$1-$2').toLowerCase()));
        const usedIcons = [...new Set([...this.days.flatMap(d => d.timeline.map(i => i.icon).filter(Boolean)), ...[...document.querySelectorAll('i[data-lucide]')].map(i => i.dataset.lucide)])];
        const missingIcons = usedIcons.filter(name => !have.has(name));
        check(!missingIcons.length, `Icons: not in the bundled icon set: ${missingIcons.join(', ')}`);
      }
      {
        const saved = this.mapCard;
        const pts4 = this.dayMapPoints(d4);
        this.mapCard = { dayId: d4.id, index: pts4[0].index };
        const c1 = this.mapCardData;
        check(c1 && c1.title === d4.timeline[pts4[0].index].title && c1.pos === 1 && c1.total === pts4.length, 'F9: the map place card must describe the tapped stop.');
        this.mapCard = { dayId: d4.id, index: pts4[pts4.length - 1].index };
        const pos = pts4.findIndex(p => p.index === this.mapCard.index);
        const nextIdx = pts4[(pos + 1) % pts4.length].index;
        check(nextIdx === pts4[0].index, 'F9: the card pager must wrap from the last stop to the first.');
        check(this.mapPinNo(d4, pts4[1].index) === 2, 'F9: timeline pin numbers must match the map.');
        const m = this.haversineM({ lat: 25.0478, lng: 121.5170 }, { lat: 25.0339, lng: 121.5645 });
        check(m > 4500 && m < 5200, 'F9: distance maths is off.');
        this.mapCard = saved;
      }

      // Hours + transfers: zero on the current plan.
      const clashes = [], tight = [];
      for (const d of this.days) d.timeline.forEach((_, i) => { if (this.hoursClash(d, i)) clashes.push(`${d.id}#${i}`); if (this.tightTransfer(d, i)) tight.push(`${d.id}#${i}`); });
      check(clashes.length === 0, `F10: opening-hours clashes: ${clashes.join(', ')}`);
      check(Object.keys(HOURS).every(key => { const [id, title] = key.split('|'); return day(id)?.timeline.some(i => i.title === title); }), 'F10: an hours rule points at a missing stop.');
      check(this.hoursClash({ id: 'day-08', dateString: 'Sun, Dec 06, 2026', timeline: [{ title: 'Wusheng Night Market — Food & Games', time: '6:00 PM – 8:00 PM' }] }, 0)?.text === 'Closed today', 'F10: weekday closure not detected.');
      check(tight.length === 0, `F11: tight transfers on the plan: ${tight.join(', ')}`);
      check(Object.keys(LEG_MIN).every(key => { const [id, title] = key.split('|'); return day(id)?.timeline.some(i => i.title === title); }), 'F11: a transfer rule points at a missing stop.');
      check(this.mapProvider === 'apple' || d4.timeline.some((_, i) => /travelmode=transit/.test(this.prevLegUrl(d4, i))), 'F11: from-previous link missing.');

      // Bring list + nearby.
      check(this.bringList(day('day-16')).some(i => /same Octopus/.test(i.label)) && this.bringList(day('day-12')).some(i => i.key === 'passport') && this.bringList(day('day-04')).some(i => i.key === 'towel'), 'F12: bring-list rules are missing items.');
      check(this.nearbyLinks(day('day-13')).length === 4 && this.nearbyLinks(day('day-03'))[0].url.includes(encodeURIComponent('便利商店')), 'F13: nearby links are wrong.');

      this.simOffsetMs = savedSim;
      return { checks, issues };
    }
  };

  window.TWHK_FEATURE_MIXIN = mixin;
  window.TWHK_FEATURE_HELPERS = { zonedTimeToUtc, foldIcsLine, icsStamp, photoDb, FLIGHTS, LAST_LEGS, HOURS, LEG_MIN, HIKES, SUMMITS };

  // Alpine reads window.travelOS on start; the core object gains the feature mixin here.
  const core = window.travelOS;
  window.travelOS = function travelOSWithFeatures() {
    const data = core();
    const descriptors = Object.getOwnPropertyDescriptors(mixin);
    Object.defineProperties(data, descriptors);
    const coreInit = data.init;
    data.init = function () {
      coreInit.call(this);
      this.featureInit();
    };
    const coreQa = data.runSemanticQa;
    // The feature checks build the whole-trip calendar: run them for ?qa or the release harness only.
    const featureQaWanted = () => /[?&]qa\b/.test(location.search) || window.__TWHK_FEATURE_QA_ON__ === true;
    data.runSemanticQa = function () {
      coreQa.call(this);
      window.__TWHK_FEATURE_QA__ = () => this.runFeatureQa();
      if (!featureQaWanted()) return;
      const extra = this.runFeatureQa();
      const issues = [...this.semanticQa.issues, ...extra.issues];
      this.semanticQa = { passed: issues.length === 0, checks: this.semanticQa.checks + extra.checks, issues };
      window.__TWHK_QA__ = this.semanticQa;
      if (extra.issues.length) console.warn('[trip QA · features]', extra.issues);
    };
    const coreOpenResult = data.openGlobalSearchResult;
    data.openGlobalSearchResult = function (result) {
      const landed = coreOpenResult.apply(this, arguments);
      // A search that lands on a stop opens its details on top when that is where the matched
      // words are; otherwise the card itself is the answer and only flashes.
      if (result?.detailsMatch && result.targetKind === 'event' && Number.isInteger(result.eventIndex)) {
        window.setTimeout(() => {
          const day = this.days.find(d => d.id === result.dayId);
          if (day && this.activeDayId === day.id && !this.showSheet && !this.showGlobalSearch) this.openStopSheet(day, result.eventIndex);
        }, 620);
      }
      return landed;
    };
    const coreClose = data.closeSheet;
    data.closeSheet = function () {
      const wasOpen = Boolean(this.showSheet);
      coreClose.call(this);
      if (wasOpen) this.clearViewer();
    };
    const coreOpenSheet = data.openSheet;
    data.openSheet = function (kind, opener) {
      coreOpenSheet.call(this, kind, opener);
      if (kind === 'show' && this.showCardData?.bookingId) this.showPhotoAt(this.showCardData.bookingId, 0);
      else this.clearViewer();
    };
    return data;
  };
})();
