// ═══════════════════════════════════════════════
// CALCULATION UTILITIES
// Extracted from oct.html - all pure functions
// ═══════════════════════════════════════════════

export function fix(val) {
  const num = parseFloat(val);
  return isNaN(num) ? '0.0' : num.toFixed(1);
}

export function formatReversal(val) {
  if (val === null || val === undefined || isNaN(parseFloat(val))) return '-';
  return parseFloat(val).toFixed(0);
}

// ─── S Level Calculations ───
export function calculateSupport(spot, callSame, putLower) {
  if (!callSame || !putLower || !spot) return null;
  const ceLtp = parseFloat(callSame.ltp || 0);
  const peLtp = parseFloat(putLower.ltp || 0);
  const ceDelta = parseFloat(callSame.delta || 0);
  const peDelta = parseFloat(putLower.delta || 0);
  const denom = ceDelta - peDelta;
  if (denom === 0) return null;
  const result = spot - ((ceLtp - peLtp) / denom);
  return isNaN(result) ? null : result;
}

export function calculateResistance(spot, putSame, callUpper) {
  if (!putSame || !callUpper || !spot) return null;
  const ceLtp = parseFloat(callUpper.ltp || 0);
  const peLtp = parseFloat(putSame.ltp || 0);
  const ceDelta = parseFloat(callUpper.delta || 0);
  const peDelta = parseFloat(putSame.delta || 0);
  const denom = ceDelta - peDelta;
  if (denom === 0) return null;
  const result = spot - ((ceLtp - peLtp) / denom);
  return isNaN(result) ? null : result;
}

// ─── PCR Calculation ───
export function calculatePCR(callOI, putOI, callOIChg, putOIChg) {
  const cOI = parseFloat(callOI || 0);
  const pOI = parseFloat(putOI || 0);
  const cChg = parseFloat(callOIChg || 0);
  const pChg = parseFloat(putOIChg || 0);

  const pcrOI = cOI > 0 ? (pOI / cOI).toFixed(2) : '0.00';
  const pcrChg = cChg !== 0 ? (pChg / Math.abs(cChg)).toFixed(2) : '0.00';

  let cls = 'pcr-neutral';
  if (parseFloat(pcrOI) > 1.2) cls = 'pcr-bearish';
  else if (parseFloat(pcrOI) < 0.8) cls = 'pcr-bullish';

  return { oi: pcrOI, change: pcrChg, class: cls };
}

// ─── MMI Calculation ───
// Based on PCR of OI Change: ≤0.80 = BEMS, 0.80–1.20 = NMS, ≥1.20 = BMS
// Greater side = 100%, percent shows how much % the other side is of the greater
export function calculateMMI(callOIChg, putOIChg) {
  const cChg = Math.abs(parseFloat(callOIChg || 0));
  const pChg = Math.abs(parseFloat(putOIChg || 0));

  if (cChg + pChg === 0) return { label: '-', class: '', percent: '' };

  const pcr = cChg > 0 ? pChg / cChg : Infinity;
  const total = cChg + pChg;
  const callPct = ((cChg / total) * 100).toFixed(0);
  const putPct = ((pChg / total) * 100).toFixed(0);

  let label, cls, percent;

  if (pcr <= 0.80) {
    label = 'BEMS';
    cls = 'bems';
    percent = `C: ${callPct}%`;
  } else if (pcr >= 1.20) {
    label = 'BMS';
    cls = 'bms';
    percent = `P: ${putPct}%`;
  } else {
    label = 'NMS';
    cls = 'nms';
    percent = cChg >= pChg ? `C: ${callPct}%` : `P: ${putPct}%`;
  }

  return { label, class: cls, percent };
}

// ─── MT/MB (Market Top / Market Bottom) ───
export function calculateMTMB(chain, spot) {
  const result = { mt: null, mb: null };
  if (!chain?.length || !spot) return result;

  for (let i = 0; i < chain.length; i++) {
    const r = chain[i];
    if ((r.call?.oi || 0) > (r.put?.oi || 0) && (r.call?.oi_change || 0) > (r.put?.oi_change || 0)) {
      result.mt = r.strike;
      break;
    }
  }

  for (let i = chain.length - 1; i >= 0; i--) {
    const r = chain[i];
    if ((r.put?.oi || 0) > (r.call?.oi || 0) && (r.put?.oi_change || 0) > (r.call?.oi_change || 0)) {
      result.mb = r.strike;
      break;
    }
  }

  return result;
}

// ─── Theory 4.0 (Resistance / Support) ───
export function calculateTheory40(chain, spot) {
  const result = { resistance: null, support: null };
  if (!chain?.length || !spot) return result;

  for (let i = 0; i < chain.length; i++) {
    if ((chain[i].call?.oi || 0) > (chain[i].put?.oi || 0)) {
      result.resistance = chain[i].strike;
      break;
    }
  }

  for (let i = chain.length - 1; i >= 0; i--) {
    if ((chain[i].put?.oi || 0) > (chain[i].call?.oi || 0)) {
      result.support = chain[i].strike;
      break;
    }
  }

  return result;
}

// ─── Volume Theory ───
export function calculateVT(chain, spot) {
  const result = { vtSymbol: null, targetStrike: null };
  if (!chain?.length || !spot) return result;

  const spotIndex = chain.findIndex(r => r.strike >= spot);
  if (spotIndex <= 0 || spotIndex >= chain.length - 1) return result;

  const up = chain[spotIndex + 1];
  const down = chain[spotIndex - 1];
  const callVol = (parseFloat(up?.call?.volume || 0) + parseFloat(down?.call?.volume || 0));
  const putVol = (parseFloat(up?.put?.volume || 0) + parseFloat(down?.put?.volume || 0));

  const isBullish = callVol > putVol;
  result.vtSymbol = isBullish ? 'VTC' : 'VTP';

  const side = isBullish ? 'put' : 'call';
  const oiValues = chain.map(r => parseFloat(r[side]?.oi || 0));
  const maxOi = Math.max(...oiValues);

  if (isBullish) {
    for (let i = chain.length - 1; i >= 0; i--) {
      if (parseFloat(chain[i].put?.oi || 0) >= maxOi * 0.99) {
        result.targetStrike = chain[i].strike;
        break;
      }
    }
  } else {
    for (let i = 0; i < chain.length; i++) {
      if (parseFloat(chain[i].call?.oi || 0) >= maxOi * 0.99) {
        result.targetStrike = chain[i].strike;
        break;
      }
    }
  }

  return result;
}

// ─── Highlight / Rank helpers ───
export function getRankClass(val, colMax, secondMax) {
  const absVal = Math.max(0, val || 0);
  if (absVal === 0 || colMax === 0) return '';
  const pct = (absVal / colMax) * 100;
  if (pct >= 75 && pct <= 100) {
    if (absVal === colMax) return 'top-max';
    if (absVal === secondMax && pct >= 75) return 'top-high';
  }
  return '';
}

// ─── Get max / second-max for a column ───
export function getColumnStats(chain, accessor) {
  const values = chain.map(r => Math.max(0, accessor(r) || 0)).sort((a, b) => b - a);
  return { max: values[0] || 0, second: values[1] || 0 };
}

// ─── New LTP Calculator ───
export function calculateNewLTP(currentLTP, delta, currentSpot, newSpot) {
  const spotChange = newSpot - currentSpot;
  return currentLTP + (delta * spotChange);
}

// ─── 4.0 Strategy Reversal Calculations ───
export function calculateSupportReversal40(spot, callSame, putLower) {
  return calculateSupport(spot, callSame, putLower);
}

export function calculateResistanceReversal40(spot, putSame, callUpper) {
  return calculateResistance(spot, putSame, callUpper);
}