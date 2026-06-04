/**
 * marketHours.js
 * Knows exactly when NSE, BSE, MCX are open.
 * All times in IST (UTC+5:30).
 */

const IST = 5.5 * 60; // IST offset in minutes from UTC

function nowIST() {
  const now = new Date();
  const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  return utcMin + IST; // minutes since midnight IST
}

function isWeekend() {
  // Convert UTC to IST date to get correct weekday
  const ist = new Date(Date.now() + IST * 60 * 1000);
  const day = ist.getUTCDay(); // 0=Sun 6=Sat
  return day === 0 || day === 6;
}

const hm = (h, m) => h * 60 + m;

// Sessions per exchange [{ name, start, end }] — in IST minutes
const SESSIONS = {
  NSE: [
    { name: 'premarket',  start: hm(9,  0), end: hm(9,  8) },
    { name: 'main',       start: hm(9, 15), end: hm(15,30) },
    { name: 'postmarket', start: hm(15,30), end: hm(15,35) },
  ],
  BFO: [
    { name: 'premarket',  start: hm(9,  0), end: hm(9,  8) },
    { name: 'main',       start: hm(9, 15), end: hm(15,30) },
    { name: 'postmarket', start: hm(15,30), end: hm(15,35) },
  ],
  MCX: [
    { name: 'main', start: hm(9, 0), end: hm(23,30) },
  ],
};

function getSession(exchange) {
  if (isWeekend()) return null;
  const mins = nowIST();
  for (const s of SESSIONS[exchange] || []) {
    if (mins >= s.start && mins < s.end) return s;
  }
  return null;
}

function isOpen(exchange) {
  return getSession(exchange) !== null;
}

// ms until next open for this exchange (0 if already open)
function msUntilOpen(exchange) {
  if (isOpen(exchange)) return 0;
  const mins = nowIST();
  const sessions = SESSIONS[exchange] || [];

  // Check if there's a later session today
  for (const s of sessions) {
    if (s.start > mins) return (s.start - mins) * 60_000;
  }

  // Next open = tomorrow (or Monday) first session
  const nextStart = sessions[0]?.start ?? hm(9, 0);
  const ist = new Date(Date.now() + IST * 60_000);
  let daysAhead = 1;
  // Skip Saturday (6) and Sunday (0)
  while (true) {
    const next = new Date(ist);
    next.setUTCDate(ist.getUTCDate() + daysAhead);
    const day = next.getUTCDay();
    if (day !== 0 && day !== 6) break;
    daysAhead++;
  }
  const midnight = new Date(ist);
  midnight.setUTCDate(ist.getUTCDate() + daysAhead);
  midnight.setUTCHours(0, 0, 0, 0);
  return midnight.getTime() - IST * 60_000 - Date.now() + nextStart * 60_000;
}

// ms until this exchange closes (0 if already closed)
function msUntilClose(exchange) {
  const s = getSession(exchange);
  if (!s) return 0;
  return (s.end - nowIST()) * 60_000;
}

function status() {
  return {
    NSE: isOpen('NSE') ? getSession('NSE').name : 'closed',
    BFO: isOpen('BFO') ? getSession('BFO').name : 'closed',
    MCX: isOpen('MCX') ? getSession('MCX').name : 'closed',
  };
}

module.exports = { isOpen, getSession, msUntilOpen, msUntilClose, status, isWeekend };
