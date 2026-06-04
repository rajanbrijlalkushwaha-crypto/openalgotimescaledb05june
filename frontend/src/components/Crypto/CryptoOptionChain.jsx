import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import {
  calculatePCR, calculateMMI, getColumnStats, getRankClass,
  calculateMTMB, calculateTheory40, calculateVT,
} from '../../services/calculations';

const API_BASE = process.env.REACT_APP_API_URL || '';
const POLL_MS  = 3000;

// ── Formatters ──────────────────────────────────────────────────────────────
const fix = (v) => (v != null && !isNaN(parseFloat(v))) ? parseFloat(v).toFixed(1) : '-';

// Full numbers — no K/L abbreviations
const fmtNum = (v) => {
  const n = Math.round(Number(v) || 0);
  return n.toLocaleString('en-IN');
};

// Crypto S Level formulas
const calcCallReversal = (spot, ltp, delta) => {
  const d = parseFloat(delta);
  if (!d || d === 0) return null;
  const val = spot + (parseFloat(ltp) / d);
  return isNaN(val) ? null : Math.round(val);
};
const calcPutReversal = (spot, ltp, delta) => {
  const d = parseFloat(delta);
  if (!d || d === 0) return null;
  const val = spot - (parseFloat(ltp) / Math.abs(d));
  return isNaN(val) ? null : Math.round(val);
};
const fmtReversal = (v) => (v === null || v === undefined || isNaN(v)) ? '-' : String(v);

export default function CryptoOptionChain() {
  const { state, dispatch } = useApp();
  const {
    greeksActive, atmActive, indicatorsActive,
    ltpDisplayActive, volumeDisplayActive, oiDisplayActive, mmiDisplayActive,
    tableReversed, showInLakh,
  } = state;

  // ── State ──────────────────────────────────────────────────────────────────
  const [underlyings,        setUnderlyings]        = useState({});   // { BTC: ['2025-03-28',...], ETH: [...] }
  const [selectedUnderlying, setSelectedUnderlying] = useState('BTC');
  const [selectedExpiry,     setSelectedExpiry]     = useState('');
  const [chainData,          setChainData]          = useState([]);
  const [spotPrice,          setSpotPrice]          = useState(0);
  const [lastUpdate,         setLastUpdate]         = useState('--');
  const [loading,            setLoading]            = useState(true);
  const [currentDate,        setCurrentDate]        = useState('');

  const pollRef = useRef(null);

  const handleLogout = async () => {
    try { await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }); } catch (_) {}
    window.location.replace('/');
  };

  // ── Load available symbols/expiries ────────────────────────────────────────
  useEffect(() => {
    fetch(`${API_BASE}/api/crypto/symbols`)
      .then(r => r.json())
      .then(data => {
        setUnderlyings(data || {});
        const first = Object.keys(data || {})[0] || 'BTC';
        setSelectedUnderlying(first);
        const exps = (data[first] || []);
        if (exps.length) setSelectedExpiry(exps[0]);
      })
      .catch(() => {});
  }, []);

  // Update expiry when underlying changes
  useEffect(() => {
    const exps = underlyings[selectedUnderlying] || [];
    if (exps.length) setSelectedExpiry(exps[0]);
    else setSelectedExpiry('');
  }, [selectedUnderlying, underlyings]);

  // ── Poll backend for live crypto snapshot ──────────────────────────────────
  const fetchData = useCallback(() => {
    if (!selectedUnderlying || !selectedExpiry) return;
    fetch(`${API_BASE}/api/crypto/live/${selectedUnderlying}/${selectedExpiry}`)
      .then(r => r.ok ? r.json() : null)
      .then(snap => {
        if (!snap) return;
        setSpotPrice(snap.spot_price || 0);
        setChainData(snap.chain || []);
        setLastUpdate(snap.time || new Date().toLocaleTimeString('en-IN', { hour12: false }));
        if (snap.date) setCurrentDate(snap.date);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [selectedUnderlying, selectedExpiry]);

  useEffect(() => {
    setLoading(true);
    setChainData([]);
    fetchData();
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(fetchData, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [fetchData]);

  // ── Display chain (ATM filter + reverse) ──────────────────────────────────
  const displayChain = useMemo(() => {
    if (!chainData.length) return [];
    let chain = [...chainData];
    if (atmActive && spotPrice > 0) {
      const idx = chain.findIndex(r => r.strike >= spotPrice);
      if (idx !== -1) {
        const start = Math.max(0, idx - 12);
        const end   = Math.min(chain.length, idx + 12);
        chain = chain.slice(start, end);
      }
    }
    if (tableReversed) chain.reverse();
    return chain;
  }, [chainData, spotPrice, atmActive, tableReversed]);

  // Strike gap
  const strikeGap = useMemo(() => {
    if (displayChain.length < 2) return 0;
    return Math.abs(displayChain[1].strike - displayChain[0].strike);
  }, [displayChain]);

  // Strike map for neighbour lookups
  const strikeMap = useMemo(() => {
    const m = {};
    displayChain.forEach(r => { m[r.strike] = r; });
    return m;
  }, [displayChain]);

  // Column stats for rank highlighting
  const stats = useMemo(() => ({
    callOI: getColumnStats(displayChain, r => r.call?.oi),
    callCH: getColumnStats(displayChain, r => r.call?.oi_change),
    callVO: getColumnStats(displayChain, r => r.call?.volume),
    putOI:  getColumnStats(displayChain, r => r.put?.oi),
    putCH:  getColumnStats(displayChain, r => r.put?.oi_change),
    putVO:  getColumnStats(displayChain, r => r.put?.volume),
  }), [displayChain]);

  // Advanced indicators
  const indicators = useMemo(() => ({
    mtmb:     calculateMTMB(displayChain, spotPrice),
    theory40: calculateTheory40(displayChain, spotPrice),
    vt:       calculateVT(displayChain, spotPrice),
  }), [displayChain, spotPrice]);

  // Footer totals
  const ftotals = useMemo(() => {
    let tcOI=0, tcCH=0, tcVOL=0, tpOI=0, tpCH=0, tpVOL=0, tcDelta=0, tpDelta=0, tcIV=0, tpIV=0;
    displayChain.forEach(r => {
      tcOI   += Number(r.call?.oi        || 0);
      tcCH   += Number(r.call?.oi_change || 0);
      tcVOL  += Number(r.call?.volume    || 0);
      tpOI   += Number(r.put?.oi         || 0);
      tpCH   += Number(r.put?.oi_change  || 0);
      tpVOL  += Number(r.put?.volume     || 0);
      tcDelta += parseFloat(r.call?.delta || 0);
      tpDelta += parseFloat(r.put?.delta  || 0);
      tcIV    += parseFloat(r.call?.iv    || 0);
      tpIV    += parseFloat(r.put?.iv     || 0);
    });
    return { tcOI, tcCH, tcVOL, tpOI, tpCH, tpVOL, tcDelta, tpDelta, tcIV, tpIV };
  }, [displayChain]);

  const pcrOI  = ftotals.tcOI  > 0 ? (ftotals.tpOI  / ftotals.tcOI).toFixed(2)  : '0.00';
  const pcrVol = ftotals.tcVOL > 0 ? (ftotals.tpVOL / ftotals.tcVOL).toFixed(2) : '0.00';

  // Colspan calculations
  const callCols = useMemo(() => {
    let c = 2; // OI Chng + S Level
    if (oiDisplayActive)     c++;
    if (volumeDisplayActive) c++;
    if (ltpDisplayActive)    c++;
    if (greeksActive)        c += 5;
    return c;
  }, [oiDisplayActive, volumeDisplayActive, ltpDisplayActive, greeksActive]);

  const putCols = useMemo(() => {
    let c = 2; // S Level + OI Chng
    if (oiDisplayActive)     c++;
    if (volumeDisplayActive) c++;
    if (ltpDisplayActive)    c++;
    if (mmiDisplayActive)    c++;
    if (greeksActive)        c += 5;
    return c;
  }, [oiDisplayActive, volumeDisplayActive, ltpDisplayActive, mmiDisplayActive, greeksActive]);

  const totalCols = callCols + 1 + putCols;

  // Six-box helper
  const pct = (a, b) => {
    const mx = Math.max(Math.abs(a), Math.abs(b));
    if (mx === 0) return [50, 50];
    return [Math.round(Math.abs(a) / mx * 100), Math.round(Math.abs(b) / mx * 100)];
  };

  const SixBox = ({ label, bullVal, bearVal, bullPct, bearPct, isBullish }) => (
    <div className="sixbox">
      <div className="sixbox-label">{label}</div>
      <div className="sixbox-row">
        <div className="sixbox-side sixbox-bull">
          <div className="sixbox-tag">Bullish</div>
          <div className="sixbox-val">{bullVal}</div>
          <div className="sixbox-pct">({bullPct}%)</div>
        </div>
        <div className={`sixbox-arrow ${isBullish ? 'sixbox-arr-bull' : 'sixbox-arr-bear'}`}>
          {isBullish ? '«' : '»'}
        </div>
        <div className="sixbox-side sixbox-bear">
          <div className="sixbox-tag">Bearish</div>
          <div className="sixbox-val">{bearVal}</div>
          <div className="sixbox-pct">({bearPct}%)</div>
        </div>
      </div>
    </div>
  );

  const openChart = (strike, type) => {
    if (!currentDate || !selectedExpiry) return;
    dispatch({
      type: 'SET_CRYPTO_OI_CHART_MODAL',
      payload: { underlying: selectedUnderlying, expiry: selectedExpiry, date: currentDate, strike, type },
    });
  };

  const expiryList = underlyings[selectedUnderlying] || [];

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>

      {/* ── Topbar ── */}
      <div className="topbar" id="mainTopbar">
        {/* Symbol */}
        <div>
          <span style={{ fontWeight: 700, fontSize: 15 }}>🪙</span>{' '}
          <select
            value={selectedUnderlying}
            onChange={e => setSelectedUnderlying(e.target.value)}
            style={{ fontSize: '16px', fontWeight: 'bold', padding: '4px 8px' }}
          >
            {Object.keys(underlyings).map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>

        {/* Expiry */}
        <div>
          EXPIRY:{' '}
          <select
            value={selectedExpiry}
            onChange={e => setSelectedExpiry(e.target.value)}
            style={{ fontSize: '14px', fontWeight: 'bold', padding: '4px 8px', color: '#1976d2' }}
          >
            {expiryList.map(ex => <option key={ex} value={ex}>{ex}</option>)}
          </select>
        </div>

        {/* Spot */}
        <div>
          SPOT:{' '}
          {spotPrice > 0
            ? <span style={{ color: '#ff6f00', fontWeight: 700 }}>
                {spotPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })}
              </span>
            : <span className="skeleton skeleton-topbar" />
          }
        </div>

        {/* Time */}
        <div>TIME: <span style={{ color: '#388e3c' }}>{lastUpdate}</span></div>

        {/* Right controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' }}>
          <button
            className={`nav-btn${atmActive ? ' active' : ''}`}
            onClick={() => dispatch({ type: 'TOGGLE_ATM' })}
          >ATM</button>
          <button
            className={`nav-btn${greeksActive ? ' active' : ''}`}
            onClick={() => dispatch({ type: 'TOGGLE_GREEKS' })}
            style={{ borderColor: '#7b1fa2', color: greeksActive ? '#fff' : '#7b1fa2', background: greeksActive ? '#7b1fa2' : 'rgba(123,31,162,0.12)' }}
          >Greeks</button>
          {state.user && (
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#ff6f00' }}>
              {state.user?.name || '--'}
            </span>
          )}
          <button
            onClick={() => dispatch({ type: 'TOGGLE_UI_MENU' })}
            className="nav-btn"
          >⚙ UI</button>
          <button
            onClick={() => dispatch({ type: 'SET_NOTIF_PANEL', payload: true })}
            className="nav-btn"
            style={{ position: 'relative' }}
          >
            🔔
            {state.notifUnread > 0 && (
              <span style={{
                position: 'absolute', top: '-6px', right: '-6px',
                background: '#e53935', color: '#fff',
                borderRadius: '10px', fontSize: '10px', fontWeight: 900,
                padding: '1px 5px', lineHeight: '14px', minWidth: '16px',
                textAlign: 'center', pointerEvents: 'none',
              }}>{state.notifUnread > 99 ? '99+' : state.notifUnread}</span>
            )}
          </button>
          <button onClick={handleLogout} className="nav-btn">⏻ Logout</button>
        </div>
      </div>

      {/* ── Table ── */}
      <div id="mainContent" style={{ flex: 1, minHeight: 0, height: 'unset', overflowY: 'auto', overflowX: 'auto' }}>
        {loading ? (
          <table id="optionTable" className={`skeleton-table ${greeksActive ? 'show-greeks' : ''}`}>
            <thead>
              <tr className="header-main">
                <th colSpan={callCols} className="call-main"><span className="header-main-title">CALL</span></th>
                <th className="strike-main strike-col-cell">STRIKE</th>
                <th colSpan={putCols} className="put-main"><span className="header-main-title">PUT</span></th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 15 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: totalCols }).map((__, j) => (
                    <td key={j}><div className={`skeleton skeleton-bar ${j % 3 === 0 ? 'short' : 'long'}`} /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        ) : !displayChain.length ? (
          <table id="optionTable">
            <tbody>
              <tr><td colSpan={totalCols} style={{ textAlign: 'center', padding: '40px' }}>
                {selectedExpiry ? 'Waiting for crypto data...' : 'Select a symbol and expiry'}
              </td></tr>
            </tbody>
          </table>
        ) : (
          <table id="optionTable" className={greeksActive ? 'show-greeks' : ''}>
            <thead>
              {/* Main header */}
              <tr className="header-main">
                <th colSpan={callCols} className="call-main">
                  <span className="header-main-title">CALL</span>
                </th>
                <th className="strike-main strike-col-cell">STRIKE</th>
                <th colSpan={putCols} className="put-main">
                  <span className="header-main-title">PUT</span>
                </th>
              </tr>

              {/* Sub header */}
              <tr className="header-sub">
                {greeksActive && <>
                  <th className="call-sub greek-col">IV</th>
                  <th className="call-sub greek-col">Vega</th>
                  <th className="call-sub greek-col">Gamma</th>
                  <th className="call-sub greek-col">Theta</th>
                  <th className="call-sub greek-col">Delta</th>
                </>}
                <th className="call-sub data-col-cell">OI Chng</th>
                {oiDisplayActive     && <th className="call-sub data-col-cell oi-col">OI</th>}
                {volumeDisplayActive && <th className="call-sub data-col-cell vol-col">Vol</th>}
                {ltpDisplayActive    && <th className="call-sub ltp-col-cell ltp-col">LTP/Chng</th>}
                <th className="call-sub data-col-cell">S Level</th>

                <th className="strike-sub strike-col-cell" style={{ fontSize: '13px' }}>OI/OI Chng</th>

                <th className="put-sub data-col-cell">S Level</th>
                {ltpDisplayActive    && <th className="put-sub ltp-col-cell ltp-col">LTP/Chng</th>}
                {volumeDisplayActive && <th className="put-sub data-col-cell vol-col">Vol</th>}
                {oiDisplayActive     && <th className="put-sub data-col-cell oi-col">OI</th>}
                <th className="put-sub data-col-cell">OI Chng</th>
                {greeksActive && <>
                  <th className="put-sub greek-col">Delta</th>
                  <th className="put-sub greek-col">Theta</th>
                  <th className="put-sub greek-col">Gamma</th>
                  <th className="put-sub greek-col">Vega</th>
                  <th className="put-sub greek-col">IV</th>
                </>}
                {mmiDisplayActive && <th className="put-sub mmi-col-cell mmi-col">MMI</th>}
              </tr>
            </thead>

            <tbody id="rows">
              {displayChain.map((r, idx) => {
                const isCallITM = r.strike < spotPrice ? 'itm-bg' : '';
                const isPutITM  = r.strike > spotPrice ? 'itm-bg' : '';

                const cChg     = parseFloat(r.call?.ltp_change || 0);
                const pChg     = parseFloat(r.put?.ltp_change  || 0);
                const callDelta = parseFloat(r.call?.delta || 0);
                const putDelta  = parseFloat(r.put?.delta  || 0);
                const callOIChg = r.call?.oi_change || 0;
                const putOIChg  = r.put?.oi_change  || 0;
                const callOIChgCls = callOIChg > 0 ? 'oi-change-positive' : callOIChg < 0 ? 'oi-change-negative' : '';
                const putOIChgCls  = putOIChg  > 0 ? 'oi-change-positive' : putOIChg  < 0 ? 'oi-change-negative' : '';

                // Crypto S Level
                const resistanceValue = calcCallReversal(spotPrice, r.call?.ltp, r.call?.delta);
                const supportValue    = calcPutReversal(spotPrice, r.put?.ltp, r.put?.delta);

                // PCR + MMI
                const pcrResult = calculatePCR(r.call?.oi, r.put?.oi, r.call?.oi_change, r.put?.oi_change);
                const mmiResult = calculateMMI(r.call?.oi_change, r.put?.oi_change);

                // Rank highlights
                const callOIHL = getRankClass(r.call?.oi,     stats.callOI.max, stats.callOI.second);
                const callCHHL = getRankClass(callOIChg,      stats.callCH.max, stats.callCH.second);
                const callVOHL = getRankClass(r.call?.volume, stats.callVO.max, stats.callVO.second);
                const putOIHL  = getRankClass(r.put?.oi,      stats.putOI.max,  stats.putOI.second);
                const putCHHL  = getRankClass(putOIChg,       stats.putCH.max,  stats.putCH.second);
                const putVOHL  = getRankClass(r.put?.volume,  stats.putVO.max,  stats.putVO.second);

                // % bars
                const callOIPct = stats.callOI.max > 0 ? ((Math.max(0, r.call?.oi || 0) / stats.callOI.max) * 100).toFixed(0) : 0;
                const putOIPct  = stats.putOI.max  > 0 ? ((Math.max(0, r.put?.oi  || 0) / stats.putOI.max)  * 100).toFixed(0) : 0;
                const callVOPct = stats.callVO.max > 0 ? ((Math.max(0, r.call?.volume || 0) / stats.callVO.max) * 100).toFixed(0) : 0;
                const putVOPct  = stats.putVO.max  > 0 ? ((Math.max(0, r.put?.volume  || 0) / stats.putVO.max)  * 100).toFixed(0) : 0;

                // Spot row
                let showSpotRow = false;
                if (spotPrice > 0 && idx > 0) {
                  const prev = displayChain[idx - 1];
                  if (!tableReversed) showSpotRow = prev.strike < spotPrice && r.strike >= spotPrice;
                  else                showSpotRow = prev.strike > spotPrice && r.strike <= spotPrice;
                }

                return (
                  <React.Fragment key={r.strike}>
                    {showSpotRow && (
                      <tr className="spot-row">
                        <td colSpan={callCols} className="spot-shift-side spot-shift-call-side">
                          <span className="spot-shift-none">Crypto Live</span>
                        </td>
                        <td className="strike-col-cell" style={{ padding: 0, border: 'none' }}>
                          <div className="spot-box" onClick={() => dispatch({ type: 'SET_CHART_MODAL', payload: true })}>
                            <span className="spot-label">SPOT</span>
                            <span className="spot-value">{spotPrice.toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
                          </div>
                        </td>
                        <td colSpan={putCols} className="spot-shift-side spot-shift-put-side">
                          <span className="spot-shift-none">Delta Exchange</span>
                        </td>
                      </tr>
                    )}

                    <tr>
                      {/* Call Greeks */}
                      {greeksActive && <>
                        <td className={`greek-col ${isCallITM}`}>{fix(r.call?.iv)}</td>
                        <td className={`greek-col ${isCallITM}`}>{fix(r.call?.vega)}</td>
                        <td className={`greek-col ${isCallITM}`}>{r.call?.gamma != null ? parseFloat(r.call.gamma).toFixed(5) : '-'}</td>
                        <td className={`greek-col ${isCallITM}`}>{fix(r.call?.theta)}</td>
                        <td className={`greek-col ${isCallITM}`}>{r.call?.delta != null ? parseFloat(r.call.delta).toFixed(3) : '-'}</td>
                      </>}

                      {/* Call OI Chng */}
                      <td className={`data-col-cell ${callCHHL || isCallITM} ${callOIChgCls}`}
                          style={{ cursor: 'pointer' }}
                          onClick={() => openChart(r.strike, 'call')}>
                        <span>
                          {callOIChg >= 0 ? '+' : ''}{fmtNum(callOIChg)}
                          {((r.call?.oi || 0) > (r.put?.oi || 0) || callOIChg > putOIChg)
                            ? <span className="cell-arrow cell-arrow-green"> ↑</span>
                            : <span className="cell-arrow cell-arrow-red"> ↓</span>
                          }
                        </span>
                        <span className="perc-val">
                          {stats.callCH.max > 0 ? ((Math.max(0, callOIChg) / stats.callCH.max) * 100).toFixed(0) : 0}%
                        </span>
                      </td>

                      {/* Call OI */}
                      {oiDisplayActive && (
                        <td className={`data-col-cell ${callOIHL || isCallITM}`}
                            style={{ cursor: 'pointer' }}
                            onClick={() => openChart(r.strike, 'call')}>
                          <span>{fmtNum(r.call?.oi)}</span>
                          <span className="perc-val">{callOIPct}%</span>
                        </td>
                      )}

                      {/* Call Volume */}
                      {volumeDisplayActive && (
                        <td className={`data-col-cell ${callVOHL || isCallITM}`}>
                          <span>{fmtNum(r.call?.volume)}</span>
                          <span className="perc-val">{callVOPct}%</span>
                        </td>
                      )}

                      {/* Call LTP */}
                      {ltpDisplayActive && (
                        <td className={`ltp-col-cell ${isCallITM}`}>
                          <span className="ltp-val">{fix(r.call?.ltp)}</span>
                          <span className="chng-val" style={{ color: cChg < 0 ? '#d32f2f' : '#388e3c' }}>
                            {cChg > 0 ? '+' : ''}{fix(cChg)}
                          </span>
                        </td>
                      )}

                      {/* Call S Level */}
                      <td className={`data-col-cell ${isCallITM}`}>
                        {fmtReversal(resistanceValue)}
                      </td>

                      {/* Strike */}
                      <td className="strike-col strike-col-cell" style={{ position: 'relative' }}>
                        {indicatorsActive && indicators.mtmb.mt === r.strike && (
                          <div className="mtmb-tag green-tag">
                            <span className="line">M</span><span className="line">T</span><span className="line arrow">↑</span>
                          </div>
                        )}
                        {indicatorsActive && indicators.mtmb.mb === r.strike && (
                          <div className="mtmb-tag red-tag">
                            <span className="line">M</span><span className="line">B</span><span className="line arrow">↓</span>
                          </div>
                        )}
                        {indicatorsActive && indicators.theory40.resistance === r.strike && (
                          <div className="theory4-tag green4-tag"><div>4.0</div><div>R</div></div>
                        )}
                        {indicatorsActive && indicators.theory40.support === r.strike && (
                          <div className="theory4-tag red4-tag"><div>4.0</div><div>S</div></div>
                        )}
                        {indicatorsActive && indicators.vt.targetStrike === r.strike && (
                          <div className={`vt-tag ${indicators.vt.vtSymbol === 'VTP' ? 'red-vt left' : 'green-vt right'}`}>
                            {indicators.vt.vtSymbol}
                          </div>
                        )}
                        {r.strike}
                        <div className={`pcr-value ${pcrResult.class}`}>
                          {pcrResult.oi} / {pcrResult.change}
                        </div>
                      </td>

                      {/* Put S Level */}
                      <td className={`data-col-cell ${isPutITM}`}>
                        {fmtReversal(supportValue)}
                      </td>

                      {/* Put LTP */}
                      {ltpDisplayActive && (
                        <td className={`ltp-col-cell ${isPutITM}`}>
                          <span className="ltp-val">{fix(r.put?.ltp)}</span>
                          <span className="chng-val" style={{ color: pChg < 0 ? '#d32f2f' : '#388e3c' }}>
                            {pChg > 0 ? '+' : ''}{fix(pChg)}
                          </span>
                        </td>
                      )}

                      {/* Put Volume */}
                      {volumeDisplayActive && (
                        <td className={`data-col-cell ${putVOHL || isPutITM}`}>
                          <span>{fmtNum(r.put?.volume)}</span>
                          <span className="perc-val">{putVOPct}%</span>
                        </td>
                      )}

                      {/* Put OI */}
                      {oiDisplayActive && (
                        <td className={`data-col-cell ${putOIHL || isPutITM}`}
                            style={{ cursor: 'pointer' }}
                            onClick={() => openChart(r.strike, 'put')}>
                          <span>{fmtNum(r.put?.oi)}</span>
                          <span className="perc-val">{putOIPct}%</span>
                        </td>
                      )}

                      {/* Put OI Chng */}
                      <td className={`data-col-cell ${putCHHL || isPutITM} ${putOIChgCls}`}
                          style={{ cursor: 'pointer' }}
                          onClick={() => openChart(r.strike, 'put')}>
                        <span>
                          {putOIChg >= 0 ? '+' : ''}{fmtNum(putOIChg)}
                          {((r.put?.oi || 0) > (r.call?.oi || 0) || putOIChg > callOIChg)
                            ? <span className="cell-arrow cell-arrow-green"> ↓</span>
                            : <span className="cell-arrow cell-arrow-red"> ↑</span>
                          }
                        </span>
                        <span className="perc-val">
                          {stats.putCH.max > 0 ? ((Math.max(0, putOIChg) / stats.putCH.max) * 100).toFixed(0) : 0}%
                        </span>
                      </td>

                      {/* Put Greeks */}
                      {greeksActive && <>
                        <td className={`greek-col ${isPutITM}`}>{r.put?.delta != null ? parseFloat(r.put.delta).toFixed(3) : '-'}</td>
                        <td className={`greek-col ${isPutITM}`}>{fix(r.put?.theta)}</td>
                        <td className={`greek-col ${isPutITM}`}>{r.put?.gamma != null ? parseFloat(r.put.gamma).toFixed(5) : '-'}</td>
                        <td className={`greek-col ${isPutITM}`}>{fix(r.put?.vega)}</td>
                        <td className={`greek-col ${isPutITM}`}>{fix(r.put?.iv)}</td>
                      </>}

                      {/* MMI */}
                      {mmiDisplayActive && (
                        <td className={`mmi-cell data-col-cell ${mmiResult.class}`}>
                          {mmiResult.label}
                          <div style={{ fontSize: '9px', marginTop: '2px' }}>{mmiResult.percent}</div>
                        </td>
                      )}
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>

            {/* ── Footer ── */}
            <tfoot className="option-chain-footer">
              {/* PCR row */}
              <tr>
                {greeksActive && Array.from({ length: 5 }, (_, i) => (
                  <td key={`fg${i}`} className="footer-data-cell call-footer greek-col" />
                ))}
                <td className={`footer-data-cell call-footer ${ftotals.tcCH > 0 ? 'positive' : ftotals.tcCH < 0 ? 'negative' : ''}`}>
                  {ftotals.tcCH >= 0 ? '+' : ''}{fmtNum(ftotals.tcCH)}
                </td>
                {oiDisplayActive     && <td className="footer-data-cell call-footer">{fmtNum(ftotals.tcOI)}</td>}
                {volumeDisplayActive && <td className="footer-data-cell call-footer">{fmtNum(ftotals.tcVOL)}</td>}
                {ltpDisplayActive    && <td className="footer-data-cell call-footer" />}
                <td className="footer-data-cell call-footer" />

                <td className="footer-total-label">PCR: {pcrOI}</td>

                <td className="footer-data-cell put-footer" />
                {ltpDisplayActive    && <td className="footer-data-cell put-footer" />}
                {volumeDisplayActive && <td className="footer-data-cell put-footer">{fmtNum(ftotals.tpVOL)}</td>}
                {oiDisplayActive     && <td className="footer-data-cell put-footer">{fmtNum(ftotals.tpOI)}</td>}
                <td className={`footer-data-cell put-footer ${ftotals.tpCH > 0 ? 'positive' : ftotals.tpCH < 0 ? 'negative' : ''}`}>
                  {ftotals.tpCH >= 0 ? '+' : ''}{fmtNum(ftotals.tpCH)}
                </td>
                {greeksActive && Array.from({ length: 5 }, (_, i) => (
                  <td key={`fpg${i}`} className="footer-data-cell put-footer greek-col" />
                ))}
                {mmiDisplayActive && <td className="footer-data-cell put-footer" />}
              </tr>

              {/* Six-box sentiment row */}
              {(() => {
                const { tcOI, tcCH, tcVOL, tpOI, tpCH, tpVOL, tcDelta, tpDelta, tcIV, tpIV } = ftotals;
                const [vcp, vpp] = pct(tcVOL, tpVOL);
                const [ocp, opp] = pct(tcOI,  tpOI);
                const [ccp, cpp] = pct(tcCH,  tpCH);
                const [dcp, dpp] = pct(tcDelta, tpDelta);
                const [icp, ipp] = pct(tcIV,   tpIV);
                return (
                  <tr className="sentiment-footer-row">
                    <td colSpan={totalCols}>
                      <div className="sixbox-row-wrap">
                        <SixBox label="Volume"
                          bullVal={fmtNum(tcVOL)} bearVal={fmtNum(tpVOL)}
                          bullPct={vcp} bearPct={vpp} isBullish={tcVOL >= tpVOL} />
                        <SixBox label="Open Interest"
                          bullVal={fmtNum(tcOI)} bearVal={fmtNum(tpOI)}
                          bullPct={ocp} bearPct={opp} isBullish={tcOI >= tpOI} />
                        <SixBox label="OI Change"
                          bullVal={fmtNum(tcCH)} bearVal={fmtNum(tpCH)}
                          bullPct={ccp} bearPct={cpp} isBullish={tcCH >= tpCH} />
                        <SixBox label="PCR"
                          bullVal={pcrOI} bearVal={pcrVol}
                          bullPct={parseFloat(pcrOI) >= parseFloat(pcrVol) ? 100 : Math.round(parseFloat(pcrOI)/parseFloat(pcrVol)*100)}
                          bearPct={parseFloat(pcrVol) >= parseFloat(pcrOI) ? 100 : Math.round(parseFloat(pcrVol)/parseFloat(pcrOI)*100)}
                          isBullish={parseFloat(pcrOI) >= parseFloat(pcrVol)} />
                        <SixBox label="Delta"
                          bullVal={tcDelta.toFixed(2)} bearVal={tpDelta.toFixed(2)}
                          bullPct={dcp} bearPct={dpp} isBullish={tcDelta >= Math.abs(tpDelta)} />
                        <SixBox label="IV"
                          bullVal={tcIV.toFixed(2)} bearVal={tpIV.toFixed(2)}
                          bullPct={icp} bearPct={ipp} isBullish={tcIV >= tpIV} />
                      </div>
                    </td>
                  </tr>
                );
              })()}
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}
