// Black-76 model for European options on futures (standard for Indian F&O)

const SQRT_2PI = Math.sqrt(2 * Math.PI);

// Cumulative Normal Distribution (Hart approximation)
function normCDF(x) {
  if (x < -8) return 0;
  if (x >  8) return 1;
  const neg = x < 0;
  if (neg) x = -x;
  const t = 1 / (1 + 0.2316419 * x);
  const p = t * (0.319381530 +
    t * (-0.356563782 +
    t * (1.781477937 +
    t * (-1.821255978 +
    t * 1.330274429))));
  const val = 1 - (Math.exp(-0.5 * x * x) / SQRT_2PI) * p;
  return neg ? 1 - val : val;
}

// Standard Normal PDF
function normPDF(x) {
  return Math.exp(-0.5 * x * x) / SQRT_2PI;
}

// Black-76 option price
// F = futures/spot price, K = strike, T = years to expiry, r = rate, sigma = IV
function black76Price(F, K, T, r, sigma, isCall) {
  if (T <= 0 || sigma <= 0) {
    const intrinsic = isCall ? Math.max(F - K, 0) : Math.max(K - F, 0);
    return intrinsic;
  }
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(F / K) + 0.5 * sigma * sigma * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const disc = Math.exp(-r * T);
  if (isCall) return disc * (F * normCDF(d1) - K * normCDF(d2));
  return disc * (K * normCDF(-d2) - F * normCDF(-d1));
}

// Calculate implied volatility via Newton-Raphson
function calcIV(marketPrice, F, K, T, r, isCall) {
  if (T <= 0 || marketPrice <= 0) return null;

  let sigma = 0.3; // initial guess
  for (let i = 0; i < 100; i++) {
    const price = black76Price(F, K, T, r, sigma, isCall);
    const sqrtT = Math.sqrt(T);
    const d1 = (Math.log(F / K) + 0.5 * sigma * sigma * T) / (sigma * sqrtT);
    const vega = F * Math.exp(-r * T) * normPDF(d1) * sqrtT;

    if (Math.abs(vega) < 1e-10) break;
    const diff = price - marketPrice;
    if (Math.abs(diff) < 0.0001) break;
    sigma = sigma - diff / vega;
    if (sigma <= 0) { sigma = 0.001; }
    if (sigma > 10)  { sigma = 10; }
  }
  return sigma > 0 ? sigma : null;
}

// Calculate all Greeks given IV
function calcGreeks(F, K, T, r, sigma, isCall) {
  if (T <= 0 || sigma <= 0 || !sigma) return null;
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(F / K) + 0.5 * sigma * sigma * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const disc = Math.exp(-r * T);
  const nd1 = normPDF(d1);

  const delta = isCall
    ? disc * normCDF(d1)
    : -disc * normCDF(-d1);

  const gamma = disc * nd1 / (F * sigma * sqrtT);

  // Theta: daily decay (divide by 365)
  const theta = isCall
    ? (-F * disc * nd1 * sigma / (2 * sqrtT) - r * K * disc * normCDF(d2)) / 365
    : (-F * disc * nd1 * sigma / (2 * sqrtT) + r * K * disc * normCDF(-d2)) / 365;

  // Vega: per 1% change in IV
  const vega = F * disc * nd1 * sqrtT / 100;

  return {
    delta: +delta.toFixed(4),
    gamma: +gamma.toFixed(6),
    theta: +theta.toFixed(4),
    vega:  +vega.toFixed(4),
  };
}

// Main entry: compute IV + all Greeks from a tick
// Returns { iv, delta, gamma, theta, vega } or null
function computeGreeks(ltp, underlyingLtp, strike, daysToExpiry, isCall) {
  if (!ltp || !underlyingLtp || !strike || !daysToExpiry) return null;

  const F  = underlyingLtp;
  const K  = strike;
  const T  = Math.max(daysToExpiry / 365, 1 / (365 * 24)); // min 1 hour
  const r  = 0.065; // ~6.5% risk-free rate (RBI repo rate approx)

  const iv = calcIV(ltp, F, K, T, r, isCall);
  if (!iv) return null;

  const greeks = calcGreeks(F, K, T, r, iv, isCall);
  if (!greeks) return null;

  return {
    iv:    +(iv * 100).toFixed(2), // percent
    ...greeks,
  };
}

module.exports = { computeGreeks };
