// Free IPO data, no AI: the IPO list, dates, price band and subscription from
// NSE's own website (the JSON its IPO pages load), and the grey market
// premium (GMP) from public grey-market pages. GMP is unofficial: no exchange
// publishes it, so it's read from those pages and may be missing.
//
// NSE answers its JSON only with the cookies its web pages set, and may
// refuse requests from cloud servers; every step fails softly and the caller
// keeps the saved list. Everything is parsed defensively (field names are
// looked up loosely), so a changed field means a missing value, not a crash.

const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const NSE = 'https://www.nseindia.com';
const NSE_PAGE = `${NSE}/market-data/all-upcoming-issues-ipo`;
const TIMEOUT_MS = 10000;
const KEEP_LISTED_DAYS = 45;
const DEFAULT_GMP_URLS = ['https://ipowatch.in/ipo-grey-market-premium-latest-ipo-gmp/', 'https://www.investorgain.com/report/live-ipo-gmp/331/'];

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n) => String(n).padStart(2, '0');

/** "11-Nov-2026", "11 NOV 2026", "2026-11-11", "11/11/2026" → "2026-11-11", or null. */
function parseDate(text) {
  const s = String(text || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[\s\-/]([A-Za-z]{3})[A-Za-z]*[\s\-/,]+(\d{4})/);
  if (m && MONTHS[m[2].toLowerCase()]) return `${m[3]}-${pad(MONTHS[m[2].toLowerCase()])}-${pad(m[1])}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  return null;
}

const num = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const m = String(v ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
};

/** "Rs.280 to Rs.295", "₹280-₹295", "Rs.295" → { low, high }. */
function parsePriceBand(text) {
  const nums = String(text || '')
    .replace(/,/g, '')
    .match(/\d+(?:\.\d+)?/g);
  if (!nums || !nums.length) return { low: null, high: null };
  const vals = nums.map(Number).filter((x) => x > 0);
  if (!vals.length) return { low: null, high: null };
  return { low: Math.min(...vals), high: Math.max(...vals) };
}

/** Case-insensitive field lookup: the first key matching one of `names` (strings or regexes). */
function pick(obj, names) {
  if (!obj || typeof obj !== 'object') return undefined;
  const keys = Object.keys(obj);
  for (const n of names) {
    const k = keys.find((key) => (n instanceof RegExp ? n.test(key) : key.toLowerCase() === n.toLowerCase()));
    if (k !== undefined && obj[k] !== null && obj[k] !== '' && obj[k] !== '-') return obj[k];
  }
  return undefined;
}

/** The first number under a key matching `re`, anywhere in a nested object. */
function deepNum(obj, re, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 5) return null;
  for (const [k, v] of Object.entries(obj)) {
    if (re.test(k) && num(v) > 0) return num(v);
  }
  for (const v of Object.values(obj)) {
    const found = deepNum(v, re, depth + 1);
    if (found != null) return found;
  }
  return null;
}

/** Arrays inside an NSE answer: the answer itself, or its first array-valued field. */
const rowsOf = (json) => (Array.isArray(json) ? json : Object.values(json || {}).find(Array.isArray) || []);

/** Add `n` working days (Mon–Fri; exchange holidays aren't known here). */
function addWorkingDays(dateKey, n) {
  const d = new Date(`${dateKey}T00:00:00Z`);
  let left = n;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) left -= 1;
  }
  return d.toISOString().slice(0, 10);
}

/** An NSE issue row → the app's IPO fields (only what it carries). */
function fromNseRow(row) {
  const name = String(pick(row, ['companyName', 'company', 'name', /company/i]) || '').trim();
  if (!name) return null;
  const symbol = String(pick(row, ['symbol']) || '').trim() || null;
  const series = String(pick(row, ['series', 'securityType', /series|segment|type/i]) || '');
  const band = parsePriceBand(pick(row, ['issuePrice', 'priceBand', 'priceRange', /price/i]));
  const openDate = parseDate(pick(row, ['issueStartDate', 'startDate', 'openDate', /start/i]));
  const closeDate = parseDate(pick(row, ['issueEndDate', 'endDate', 'closeDate', /end ?date|close/i]));
  const listed = parseDate(pick(row, ['listingDate', /listing/i]));
  const overall = num(pick(row, ['noOfTime', 'noOfTimes', /times|subscri/i]));
  return {
    name: name.replace(/\s+/g, ' '),
    symbol,
    board: /sme|emerge/i.test(series) || /\bsme\b/i.test(name) ? 'sme' : 'mainboard',
    openDate,
    closeDate,
    listingDate: listed || (closeDate ? addWorkingDays(closeDate, 3) : null),
    listingEstimated: !listed && !!closeDate,
    priceLow: band.low,
    priceHigh: band.high,
    subscription: overall != null && overall > 0 ? { overall, qib: null, nii: null, retail: null, asOf: null } : null,
  };
}

/** NSE's subscription-by-category answer → { qib, nii, retail, overall, asOf }. */
function parseCategories(json) {
  const out = { qib: null, nii: null, retail: null, overall: null, asOf: null };
  const rows = rowsOf(json);
  const ratio = (r) => {
    const times = num(pick(r, ['noOfTime', 'noOfTimes', 'noOfTotalMeant', /times|subscri/i]));
    if (times != null) return times;
    const bid = num(pick(r, [/bid/i]));
    const offered = num(pick(r, [/offer|reserved/i]));
    return bid != null && offered > 0 ? Math.round((bid / offered) * 100) / 100 : null;
  };
  rows.forEach((r) => {
    const cat = String(pick(r, ['category', /categ/i]) || '');
    const v = ratio(r);
    if (v == null) return;
    if (/qualified|\bqib/i.test(cat) && out.qib == null) out.qib = v;
    else if (/non[\s-]*institutional|\bnii\b|\bhni\b/i.test(cat) && out.nii == null) out.nii = v;
    else if (/retail|\brii\b/i.test(cat) && out.retail == null) out.retail = v;
    else if (/^\s*total/i.test(cat) && out.overall == null) out.overall = v;
  });
  out.asOf = pick(json, ['updateTime', 'timestamp', /update|time/i]) || null;
  if (typeof out.asOf !== 'string') out.asOf = null;
  return out;
}

// ---------------- GMP from grey-market pages ----------------

const ENT = { amp: '&', nbsp: ' ', quot: '"', '#39': "'", apos: "'", lt: '<', gt: '>', '#8377': '₹', rupee: '₹' };
const text = (html) =>
  String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&([a-z#0-9]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Day and month (no year), e.g. "18 Nov", "18-Nov", "Nov 18" → "YYYY-MM-DD"
 * in the year that puts it nearest `today` (an IPO is weeks away, not months).
 */
function dayMonth(day, mon, today) {
  const m = MONTHS[String(mon || '').slice(0, 3).toLowerCase()];
  const d = Number(day);
  if (!m || !(d >= 1 && d <= 31)) return null;
  const y0 = Number(today.slice(0, 4));
  const best = [y0 - 1, y0, y0 + 1]
    .map((y) => `${y}-${pad(m)}-${pad(d)}`)
    .sort((x, z) => Math.abs(Date.parse(x) - Date.parse(today)) - Math.abs(Date.parse(z) - Date.parse(today)))[0];
  return best;
}

/** A single date cell: full dates, or "18-Nov" / "18 Nov" / "Nov 18" without a year. */
function cellDate(textValue, today) {
  const full = parseDate(textValue);
  if (full) return full;
  const s = String(textValue || '').trim();
  const dayFirst = () => {
    const m = s.match(/(\d{1,2})[\s\-/]*([A-Za-z]{3,})/);
    return m ? dayMonth(m[1], m[2], today) : null;
  };
  const monthFirst = () => {
    const m = s.match(/([A-Za-z]{3,})[\s\-/]*(\d{1,2})\b/);
    return m ? dayMonth(m[2], m[1], today) : null;
  };
  return /^[A-Za-z]/.test(s) ? monthFirst() || dayFirst() : dayFirst() || monthFirst();
}

/** "18-20 Nov", "18 Nov - 20 Nov", "28 Nov-2 Dec", "Nov 18-20" → { open, close }. */
function dateRange(textValue, today) {
  const s = String(textValue || '').replace(/\s+/g, ' ').trim();
  let m = s.match(/^(\d{1,2})\s*[-–]\s*(\d{1,2})\s+([A-Za-z]{3,})/);
  if (m) return { open: dayMonth(m[1], m[3], today), close: dayMonth(m[2], m[3], today) };
  m = s.match(/(\d{1,2})\s*([A-Za-z]{3,})\s*[-–to]+\s*(\d{1,2})\s*([A-Za-z]{3,})/);
  if (m) return { open: dayMonth(m[1], m[2], today), close: dayMonth(m[3], m[4], today) };
  m = s.match(/([A-Za-z]{3,})\s*(\d{1,2})\s*[-–]\s*([A-Za-z]{3,})\s*(\d{1,2})/);
  if (m) return { open: dayMonth(m[2], m[1], today), close: dayMonth(m[4], m[3], today) };
  m = s.match(/([A-Za-z]{3,})\s*(\d{1,2})\s*[-–]\s*(\d{1,2})/);
  if (m) return { open: dayMonth(m[2], m[1], today), close: dayMonth(m[3], m[1], today) };
  const one = cellDate(s, today);
  return { open: one, close: null };
}

const cleanName = (n) =>
  String(n || '')
    .replace(/\b(NSE|BSE)\s*SME\b/gi, '')
    .replace(/\(\s*(SME|Mainboard|NSE|BSE)[^)]*\)/gi, '')
    .replace(/\bIPO\b/gi, '')
    .replace(/\bSME\b/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/[\s\-–:|]+$/, '')
    .trim();

/**
 * Every HTML table with a GMP column → [{ name, gmp, priceLow, priceHigh,
 * openDate, closeDate, listingDate, lotSize, board, subscription }]. Columns
 * are found by their headings, so it reads ipowatch.in ("Current IPOs | IPO
 * GMP | IPO Price | Gain | Date | Type") and investorgain-style tables
 * ("Name | GMP | Sub | Price | Lot | Open | Close | Listing") alike.
 */
function parseGmpTables(html, today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10)) {
  const out = [];
  const tables = String(html || '').match(/<table[\s\S]*?<\/table>/gi) || [];
  tables.forEach((table) => {
    const rows = (table.match(/<tr[\s\S]*?<\/tr>/gi) || []).map((tr) => (tr.match(/<t[hd][^>]*>[\s\S]*?<\/t[hd]>/gi) || []).map(text));
    const hi = rows.findIndex((cells) => cells.some((c) => /\bgmp\b/i.test(c)));
    if (hi < 0) return;
    const head = rows[hi].map((c) => c.toLowerCase());
    const col = (re, not) => head.findIndex((c) => re.test(c) && !(not && not.test(c)));
    const gi = col(/\bgmp\b/, /%|percent|gain|est|l\/h|low|high/);
    const gmpCol = gi >= 0 ? gi : col(/\bgmp\b/);
    let ni = head.findIndex((c, i) => i !== gmpCol && /ipo|name|company|issuer/.test(c) && !/price|size|date|gmp/.test(c));
    if (ni < 0) ni = 0;
    const priceCol = col(/price/, /gmp|listing/);
    const dateCol = col(/^date$|\bdates?\b/, /listing|allot|boa|updated/);
    const openCol = col(/\bopen/);
    const closeCol = col(/\bclose/);
    const listCol = col(/listing/, /gain|price|gmp/);
    const lotCol = col(/\blot\b/);
    const typeCol = col(/\btype\b|board|exchange/);
    const subCol = col(/\bsub/);
    rows.slice(hi + 1).forEach((cells) => {
      const rawName = cells[ni];
      const raw = cells[gmpCol];
      if (!rawName || raw == null || /\bgmp\b/i.test(rawName)) return;
      const name = cleanName(rawName);
      if (!name) return;
      const m = String(raw).replace(/,/g, '').match(/(-)?\s*₹?\s*(\d+(?:\.\d+)?)/);
      const band = priceCol >= 0 ? parsePriceBand(cells[priceCol]) : { low: null, high: null };
      let range = dateCol >= 0 ? dateRange(cells[dateCol], today) : { open: null, close: null };
      if (openCol >= 0 || closeCol >= 0) range = { open: openCol >= 0 ? cellDate(cells[openCol], today) : range.open, close: closeCol >= 0 ? cellDate(cells[closeCol], today) : range.close };
      const typeText = `${typeCol >= 0 ? cells[typeCol] : ''} ${rawName}`;
      const sub = subCol >= 0 ? num(cells[subCol]) : null;
      out.push({
        name,
        gmp: m ? Number(m[2]) * (m[1] ? -1 : 1) : null,
        priceLow: band.low,
        priceHigh: band.high,
        openDate: range.open,
        closeDate: range.close,
        listingDate: listCol >= 0 ? cellDate(cells[listCol], today) : null,
        lotSize: lotCol >= 0 ? num(cells[lotCol]) : null,
        board: /\bsme\b/i.test(typeText) ? 'sme' : /main/i.test(typeText) ? 'mainboard' : null,
        subscription: sub > 0 ? { overall: sub, qib: null, nii: null, retail: null, asOf: null } : null,
      });
    });
  });
  return out;
}

const STOP = new Set(['ipo', 'limited', 'ltd', 'sme', 'nse', 'bse', 'emerge', 'india', 'the', 'and', 'of', 'co', 'company', 'pvt', 'private', 'mainboard']);
const tokens = (name) =>
  String(name || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t));

/** The GMP row for a company name: same first word and most words shared. */
function matchGmp(name, rows) {
  const want = tokens(name);
  if (!want.length) return null;
  let best = null;
  rows.forEach((r) => {
    const have = tokens(r.name);
    if (!have.length || have[0] !== want[0]) return;
    const common = want.filter((t) => have.includes(t)).length;
    const score = common / Math.min(want.length, have.length);
    if (score >= 0.6 && (!best || score > best.score)) best = { ...r, score };
  });
  return best;
}

// ---------------- fetching ----------------

const jar = { cookie: '', at: 0 };

async function nseCookie(fetchImpl, force = false) {
  if (!force && jar.cookie && Date.now() - jar.at < 5 * 60000) return jar.cookie;
  const res = await fetchImpl(NSE_PAGE, { headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'en-IN,en;q=0.9' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const set = typeof res.headers?.getSetCookie === 'function' ? res.headers.getSetCookie() : [res.headers?.get?.('set-cookie')].filter(Boolean);
  jar.cookie = set.map((c) => String(c).split(';')[0]).join('; ');
  jar.at = Date.now();
  return jar.cookie;
}

async function nseJson(path, fetchImpl) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const cookie = await nseCookie(fetchImpl, attempt > 0);
    const res = await fetchImpl(`${NSE}${path}`, {
      headers: { 'User-Agent': UA, Accept: 'application/json, text/plain, */*', Referer: NSE_PAGE, 'Accept-Language': 'en-IN,en;q=0.9', Cookie: cookie },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if ((res.status === 401 || res.status === 403) && attempt === 0) continue;
    if (!res.ok) throw new Error(`NSE answered ${res.status} for ${path.split('?')[0]}`);
    return res.json();
  }
  throw new Error('NSE refused the request');
}

async function fetchGmp(fetchImpl, urls, today) {
  for (const url of urls) {
    try {
      const res = await fetchImpl(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) continue;
      const rows = parseGmpTables(await res.text(), today);
      if (rows.length) return { rows, source: new URL(url).hostname.replace(/^www\./, '') };
    } catch (_error) {
      // try the next page
    }
  }
  return { rows: [], source: null };
}

/**
 * The current IPO picture from free sources:
 * { ipos: [app IPO fields + symbol], gmpSource, errors: [] }.
 * Throws only when NSE gave nothing at all.
 */
// After NSE times out (it often stalls requests from cloud servers), skip it
// for a while so refreshing stays quick; the grey-market pages carry the list.
const NSE_PAUSE_MS = 60 * 60000;
let nseDownUntil = 0;

/** IPOs from NSE: { ipos, errors }; ipos is null when NSE gave nothing. */
async function nseIpos(fetchImpl, today) {
  const errors = [];
  if (Date.now() < nseDownUntil) return { ipos: null, errors: ['NSE skipped: it did not answer in the last hour'] };
  const lists = await Promise.all(
    ['/api/ipo-current-issue', '/api/all-upcoming-issues?category=ipo', '/api/public-past-issues'].map((p) =>
      nseJson(p, fetchImpl).catch((e) => {
        errors.push(e.message);
        return null;
      })
    )
  );
  if (lists.every((l) => l == null)) {
    nseDownUntil = Date.now() + NSE_PAUSE_MS;
    return { ipos: null, errors };
  }
  const [current, upcoming, past] = lists.map(rowsOf);
  const cutoff = new Date(Date.parse(`${today}T00:00:00Z`) - KEEP_LISTED_DAYS * 86400000).toISOString().slice(0, 10);
  const byName = new Map();
  const add = (ipo) => {
    if (!ipo) return;
    const key = ipo.name.toLowerCase();
    byName.set(key, { ...byName.get(key), ...Object.fromEntries(Object.entries(ipo).filter(([, v]) => v != null)) });
  };
  past
    .map(fromNseRow)
    .filter((i) => i && i.listingDate && !i.listingEstimated && i.listingDate >= cutoff)
    .forEach(add);
  upcoming.map(fromNseRow).forEach(add);
  current.map(fromNseRow).forEach(add);
  const ipos = [...byName.values()];

  // Subscription by category and lot size for the ones bidding now or just closed.
  const live = ipos.filter((i) => i.symbol && i.openDate && i.openDate <= today && (!i.listingDate || i.listingDate >= today)).slice(0, 12);
  for (const ipo of live) {
    try {
      const cat = parseCategories(await nseJson(`/api/ipo-active-category?symbol=${encodeURIComponent(ipo.symbol)}`, fetchImpl));
      const sub = { ...(ipo.subscription || {}) };
      ['qib', 'nii', 'retail', 'overall'].forEach((k) => cat[k] != null && (sub[k] = cat[k]));
      if (Object.values(sub).some((v) => typeof v === 'number')) ipo.subscription = { qib: null, nii: null, retail: null, overall: null, ...sub, asOf: cat.asOf };
    } catch (e) {
      errors.push(`subscription ${ipo.symbol}: ${e.message}`);
    }
  }
  const needLot = ipos.filter((i) => i.symbol && (!i.listingDate || i.listingDate >= today)).slice(0, 12);
  for (const ipo of needLot) {
    try {
      const detail = await nseJson(`/api/ipo-detail?symbol=${encodeURIComponent(ipo.symbol)}&series=${ipo.board === 'sme' ? 'SME' : 'EQ'}`, fetchImpl);
      const lot = deepNum(detail, /minbid|marketlot|lotsize|minimumbid|bidlot/i);
      if (lot) ipo.lotSize = Math.round(lot);
    } catch (_e) {
      // lot size stays as saved
    }
  }
  return { ipos, errors };
}

/** A GMP-page row as IPO fields (only what it carries). */
function fromGmpRow(r, today) {
  const ipo = { name: r.name };
  ['priceLow', 'priceHigh', 'openDate', 'closeDate', 'lotSize', 'board', 'subscription'].forEach((k) => r[k] != null && (ipo[k] = r[k]));
  if (r.listingDate) ipo.listingDate = r.listingDate;
  else if (r.closeDate) {
    ipo.listingDate = addWorkingDays(r.closeDate, 3);
    ipo.listingEstimated = true;
  }
  if (r.gmp != null && !(ipo.listingDate && !ipo.listingEstimated && ipo.listingDate < today)) {
    ipo.gmp = r.gmp;
    ipo.gmpAsOf = new Date().toISOString();
  }
  return ipo;
}

/**
 * The current IPO picture from free sources: NSE (exact dates, category-wise
 * subscription) when it answers, and the grey-market pages for GMP, and for
 * the list itself when NSE doesn't. { ipos, source: 'nse' | 'gmp' | 'nse+gmp',
 * gmpSource, nseOk, errors }. Throws only when both gave nothing.
 */
async function fetchFreeIpos({ fetchImpl = globalThis.fetch, today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10), gmpUrls } = {}) {
  const urls = gmpUrls || (process.env.IPO_GMP_URLS ? process.env.IPO_GMP_URLS.split(',').map((u) => u.trim()).filter(Boolean) : DEFAULT_GMP_URLS);
  const [nse, gmp] = await Promise.all([nseIpos(fetchImpl, today), fetchGmp(fetchImpl, urls, today)]);
  const errors = [...nse.errors];
  if (!gmp.rows.length) errors.push('GMP pages gave nothing');
  if (!nse.ipos && !gmp.rows.length) throw new Error(errors[0] || 'No IPO source answered');

  let ipos;
  if (nse.ipos) {
    ipos = nse.ipos;
    // GMP (unofficial) for anything not listed yet.
    const asOf = new Date().toISOString();
    ipos.forEach((ipo) => {
      if (ipo.listingDate && !ipo.listingEstimated && ipo.listingDate < today) return;
      const hit = matchGmp(ipo.name, gmp.rows);
      if (hit && hit.gmp != null) {
        ipo.gmp = hit.gmp;
        ipo.gmpAsOf = asOf;
        ipo.gmpSource = gmp.source;
      }
    });
    // Anything on the GMP page that NSE doesn't list (e.g. BSE SME issues).
    gmp.rows
      .filter((r) => !ipos.some((i) => matchGmp(i.name, [r])))
      .forEach((r) => ipos.push({ ...fromGmpRow(r, today), gmpSource: gmp.source }));
  } else {
    ipos = gmp.rows.map((r) => ({ ...fromGmpRow(r, today), gmpSource: gmp.source }));
  }
  return { ipos, source: nse.ipos ? (gmp.rows.length ? 'nse+gmp' : 'nse') : 'gmp', gmpSource: gmp.source, nseOk: !!nse.ipos, errors };
}

module.exports = { fetchFreeIpos, _test: { parseDate, parsePriceBand, fromNseRow, parseCategories, parseGmpTables, matchGmp, addWorkingDays, deepNum, dateRange, cellDate, cleanName, fromGmpRow, resetNse: () => (nseDownUntil = 0) } };
