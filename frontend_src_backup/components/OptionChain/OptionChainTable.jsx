import React, { useMemo, useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  fix, formatReversal, calculateSupport, calculateResistance,
  calculatePCR, calculateMMI, calculateMTMB, calculateTheory40,
  calculateVT, getRankClass, getColumnStats,
} from '../../services/calculations';
import PCRChartModal from '../Chart/PCRChartModal';

export default function OptionChainTable() {
  const { state, dispatch } = useApp();
  const [pcrModalOpen, setPcrModalOpen] = useState(false);

  // S Level single/double click state — kept local to avoid AppContext churn
  const [selectedSLevel, setSelectedSLevel]   = useState(null); // { strike, type } for highlight
  const committedSourceRef                     = useRef(null);   // confirmed source data
  const singleClickTimerRef                   = useRef(null);   // distinguishes click vs dblclick

  // Clear highlight whenever popup closes
  useEffect(() => {
    if (!state.ltpPopupOpen) setSelectedSLevel(null);
  }, [state.ltpPopupOpen]);

  const {
    chainData, currentSpot, spotVwap, currentSymbol, greeksActive, atmActive,
    indicatorsActive, ltpDisplayActive, volumeDisplayActive,
    oiDisplayActive, mmiDisplayActive, tableReversed, volOiCngActive,
    spotChange, spotPctChange, futuresLtp, futuresChange, futuresPctChange,
    strategy40SupportReversal, strategy40ResistanceReversal,
    strategy40GapCutSupport, strategy40GapCutResistance,
    nextDayBromosR, nextDayBromosS,
    mctrSupport, mctrResistance, mctrSupportRev, mctrResistanceRev,
    mctrSupportTouched, mctrResistanceTouched,
    shiftingResistance, shiftingSupport, shiftingTimeline,
    lotSize, showInLakh, signalsLoading,
    volOiCngData, volOiCngWindow,
    currentExpiry, currentDataDate, currentTime, historicalMode,
  } = state;

  // Format a raw OI/VOL value into lots (divide by lotSize)
  // showInLakh=false (default): full number; showInLakh=true: compact K/L
  const fmtLots = (v) => {
    const lots = Math.round((v || 0) / (lotSize || 1));
    if (!showInLakh) return String(lots);
    if (lots >= 100000) return (lots / 100000).toFixed(1) + 'L';
    if (lots >= 1000)   return (lots / 1000).toFixed(1) + 'K';
    return String(lots);
  };

  // In historical mode, compute shifting based on currentTime (HH:MM) from the full timeline.
  // In live mode, use pre-computed shiftingResistance/shiftingSupport (already the latest).
  const { effectiveShiftRes, effectiveShiftSup } = useMemo(() => {
    if (!historicalMode || !shiftingTimeline?.length || !currentTime) {
      return { effectiveShiftRes: shiftingResistance, effectiveShiftSup: shiftingSupport };
    }
    const refTime = currentTime.substring(0, 5); // HH:MM
    const upToNow = shiftingTimeline.filter(e => e.time <= refTime);
    if (!upToNow.length) return { effectiveShiftRes: null, effectiveShiftSup: null };
    const lastResShift = [...upToNow].reverse().find(e => e.resistance?.shift) || upToNow.at(-1);
    const lastSupShift = [...upToNow].reverse().find(e => e.support?.shift) || upToNow.at(-1);
    return {
      effectiveShiftRes: lastResShift?.resistance ? { strike: lastResShift.resistance.strike, shift: lastResShift.resistance.shift || null, shiftFrom: lastResShift.resistance.shiftFrom || null, time: lastResShift.time || null, strength: lastResShift.resistance.strength || null } : null,
      effectiveShiftSup: lastSupShift?.support ? { strike: lastSupShift.support.strike, shift: lastSupShift.support.shift || null, shiftFrom: lastSupShift.support.shiftFrom || null, time: lastSupShift.time || null, strength: lastSupShift.support.strength || null } : null,
    };
  }, [historicalMode, shiftingTimeline, currentTime, shiftingResistance, shiftingSupport]);

  // Compute display chain: ATM ON → 10 above + 10 below spot; ATM OFF → all strikes
  const displayChain = useMemo(() => {
    if (!chainData?.length) return [];
    let chain = [...chainData];

    if (atmActive && currentSpot > 0) {
      const idx = chain.findIndex(r => r.strike >= currentSpot);
      if (idx !== -1) {
        const start = Math.max(0, idx - 10);
        const end = Math.min(chain.length, idx + 10);
        chain = chain.slice(start, end);
      }
    }

    if (tableReversed) chain.reverse();
    return chain;
  }, [chainData, currentSpot, atmActive, tableReversed]);

  // Build strike map
  const strikeMap = useMemo(() => {
    const map = {};
    displayChain.forEach(r => { map[r.strike] = r; });
    return map;
  }, [displayChain]);

  // Strike gap
  const strikeGap = useMemo(() => {
    if (displayChain.length < 2) return 0;
    return Math.abs(displayChain[1].strike - displayChain[0].strike);
  }, [displayChain]);

  // OI-dominant strike highlights:
  // 1. supportOIStrike:    going DOWN from spot, first strike where PUT OI > CALL OI → green on put S Level
  // 2. resistanceOIStrike: going UP from just above supportOIStrike, first strike where CALL OI > PUT OI → red on call S Level
  const { resistanceOIStrike, supportOIStrike } = useMemo(() => {
    if (!currentSpot || !displayChain.length) return { resistanceOIStrike: null, supportOIStrike: null };
    const sorted = [...displayChain].sort((a, b) => a.strike - b.strike);

    // Step 1: go DOWN starting from ONE STRIKE ABOVE spot, find first where put OI > call OI
    let supportOIStrike = null;
    const firstAbove = sorted.find(r => r.strike > currentSpot);
    const startFrom  = firstAbove ? firstAbove.strike : currentSpot;
    for (const r of [...sorted].reverse()) {
      if (r.strike > startFrom) continue;
      if ((r.put?.oi || 0) > (r.call?.oi || 0)) { supportOIStrike = r.strike; break; }
    }

    // Step 2: go UP starting from one strike ABOVE supportOIStrike, find first where call OI > put OI
    let resistanceOIStrike = null;
    let startSearch = false;
    for (const r of sorted) {
      if (!startSearch) {
        // start searching from the strike just above supportOIStrike (or above spot if none found)
        const threshold = supportOIStrike ?? currentSpot;
        if (r.strike > threshold) startSearch = true;
        else continue;
      }
      if ((r.call?.oi || 0) > (r.put?.oi || 0)) { resistanceOIStrike = r.strike; break; }
    }

    return { resistanceOIStrike, supportOIStrike };
  }, [displayChain, currentSpot]);

  // Column stats for highlights
  const stats = useMemo(() => ({
    callOI: getColumnStats(displayChain, r => r.call?.oi),
    callCH: getColumnStats(displayChain, r => r.call?.oi_change),
    callVO: getColumnStats(displayChain, r => r.call?.volume),
    putOI: getColumnStats(displayChain, r => r.put?.oi),
    putCH: getColumnStats(displayChain, r => r.put?.oi_change),
    putVO: getColumnStats(displayChain, r => r.put?.volume),
  }), [displayChain]);

  // Advanced indicators
  const indicators = useMemo(() => ({
    mtmb: calculateMTMB(displayChain, currentSpot),
    theory40: calculateTheory40(displayChain, currentSpot),
    vt: calculateVT(displayChain, currentSpot),
  }), [displayChain, currentSpot]);

  // Strong S/R — compute reversal values (price levels) for strong and 2nd-level strikes
  useEffect(() => {
    if (!displayChain.length || currentSpot <= 0) return;

    const isMax = (val, st) => st.max > 0 && val >= st.max;
    const isSec = (val, st) => st.second > 0 && val >= st.second && !isMax(val, st);

    // Reversal value at a strike index
    const resRev = (r) => {
      const upper = strikeMap[r.strike + strikeGap];
      if (!upper) return null;
      return calculateResistance(currentSpot, r.put, upper.call);
    };
    const supRev = (r) => {
      const lower = strikeMap[r.strike - strikeGap];
      if (!lower) return null;
      return calculateSupport(currentSpot, r.call, lower.put);
    };

    // Resistance: scan LOW → HIGH on call side
    let strongR = null, strong2ndR = null;
    for (const r of displayChain) {
      const maxHits = [
        isMax(r.call?.oi ?? 0, stats.callOI),
        isMax(r.call?.oi_change ?? 0, stats.callCH),
        isMax(r.call?.volume ?? 0, stats.callVO),
      ].filter(Boolean).length;
      const secHits = [
        isSec(r.call?.oi ?? 0, stats.callOI),
        isSec(r.call?.oi_change ?? 0, stats.callCH),
        isSec(r.call?.volume ?? 0, stats.callVO),
      ].filter(Boolean).length;

      if (maxHits >= 2 && strongR === null) { strongR = resRev(r); }
      else if ((maxHits >= 1 && secHits >= 1) || secHits >= 2) { if (strong2ndR === null) strong2ndR = resRev(r); }
      if (strongR !== null && strong2ndR !== null) break;
    }

    // Support: scan HIGH → LOW on put side
    let strongS = null, strong2ndS = null;
    for (let i = displayChain.length - 1; i >= 0; i--) {
      const r = displayChain[i];
      const maxHits = [
        isMax(r.put?.oi ?? 0, stats.putOI),
        isMax(r.put?.oi_change ?? 0, stats.putCH),
        isMax(r.put?.volume ?? 0, stats.putVO),
      ].filter(Boolean).length;
      const secHits = [
        isSec(r.put?.oi ?? 0, stats.putOI),
        isSec(r.put?.oi_change ?? 0, stats.putCH),
        isSec(r.put?.volume ?? 0, stats.putVO),
      ].filter(Boolean).length;

      if (maxHits >= 2 && strongS === null) { strongS = supRev(r); }
      else if ((maxHits >= 1 && secHits >= 1) || secHits >= 2) { if (strong2ndS === null) strong2ndS = supRev(r); }
      if (strongS !== null && strong2ndS !== null) break;
    }

    // Only dispatch when at least one level is found — never wipe valid values with all-nulls
    // (chain refreshes every 3s; a cycle with no strong level shouldn't clear the chart lines)
    if (strongS !== null || strongR !== null || strong2ndS !== null || strong2ndR !== null) {
      dispatch({ type: 'SET_STRONG_SR', payload: {
        support: strongS, resistance: strongR,
        support2nd: strong2ndS, resistance2nd: strong2ndR,
      }});
    }
  }, [displayChain, stats, currentSpot, strikeGap, strikeMap, dispatch]);

  // Post-9:09 AM: check spot vs yesterday's Bromos levels.
  // If spot between S and R reversal → no change.
  // If spot breaks out → scan every strike, find which reversal crosses spot → new level.
  const adjustedBromos = useMemo(() => {
    // Gap correction is handled server-side at 9:09 AM — no frontend override needed
    return null;
    if (!currentSpot || !strategy40SupportReversal || !strategy40ResistanceReversal || !chainData?.length) return null;
    const now = new Date();
    const ist = new Date(now.getTime() + now.getTimezoneOffset() * 60000 + 5.5 * 3600000);
    if (ist.getUTCHours() < 9 || (ist.getUTCHours() === 9 && ist.getUTCMinutes() < 9)) return null;

    // Spot between yesterday's S and R reversal — no adjustment needed
    if (currentSpot > strategy40SupportReversal && currentSpot < strategy40ResistanceReversal) return null;

    const sorted = [...chainData].sort((a, b) => a.strike - b.strike);

    if (currentSpot >= strategy40ResistanceReversal) {
      // Gap-up: find lowest R reversal that is >= spot (not below gap open price)
      let newR = null, bestRev = Infinity;
      for (let i = 0; i < sorted.length - 1; i++) {
        const rev = calculateResistance(currentSpot, sorted[i].put, sorted[i + 1].call);
        if (rev != null && rev >= currentSpot && rev < bestRev) {
          bestRev = rev;
          newR = { side: 'R', strike: sorted[i].strike, reversal: Math.round(rev) };
        }
      }
      return newR;
    }

    if (currentSpot <= strategy40SupportReversal) {
      // Gap-down: find highest S reversal that is <= spot (not above gap down price)
      let newS = null, bestRev = -Infinity;
      for (let i = 1; i < sorted.length; i++) {
        const rev = calculateSupport(currentSpot, sorted[i].call, sorted[i - 1].put);
        if (rev != null && rev <= currentSpot && rev > bestRev) {
          bestRev = rev;
          newS = { side: 'S', strike: sorted[i].strike, reversal: Math.round(rev) };
        }
      }
      return newS;
    }

    return null;
  }, [chainData, currentSpot, strategy40SupportReversal, strategy40ResistanceReversal]);

  // Footer totals — always matches the currently displayed strikes
  const ftotals = useMemo(() => {
    let tcOI = 0, tcCH = 0, tcVOL = 0, tpOI = 0, tpCH = 0, tpVOL = 0;
    let tcDelta = 0, tpDelta = 0, tcIV = 0, tpIV = 0;
    displayChain.forEach(r => {
      tcOI += Number(r.call?.oi || 0);
      tcCH += Number(r.call?.oi_change || 0);
      tcVOL += Number(r.call?.volume || 0);
      tpOI += Number(r.put?.oi || 0);
      tpCH += Number(r.put?.oi_change || 0);
      tpVOL += Number(r.put?.volume || 0);
      tcDelta += parseFloat(r.call?.delta || 0);
      tpDelta += parseFloat(r.put?.delta || 0);
      tcIV += parseFloat(r.call?.iv || 0);
      tpIV += parseFloat(r.put?.iv || 0);
    });
    return { tcOI, tcCH, tcVOL, tpOI, tpCH, tpVOL, tcDelta, tpDelta, tcIV, tpIV };
  }, [displayChain]);

  const pcrOI = ftotals.tcOI > 0 ? (ftotals.tpOI / ftotals.tcOI).toFixed(2) : '0.00';

  // Sentiment boxes — Vol / OI / OI Change
  const sentiment = useMemo(() => {
    const { tcVOL, tpVOL, tcOI, tpOI, tcCH, tpCH } = ftotals;

    const totalVol = tcVOL + tpVOL;
    const callVolPct = totalVol > 0 ? Math.round(tcVOL / totalVol * 100) : 50;
    const volSignal = callVolPct > (100 - callVolPct) ? 'BULLISH' : callVolPct < (100 - callVolPct) ? 'BEARISH' : 'NEUTRAL';

    const totalOI = tcOI + tpOI;
    const callOIPct = totalOI > 0 ? Math.round(tcOI / totalOI * 100) : 50;
    const oiSignal = callOIPct > (100 - callOIPct) ? 'BEARISH' : callOIPct < (100 - callOIPct) ? 'BULLISH' : 'NEUTRAL';

    const posCH = Math.max(0, tcCH), posPH = Math.max(0, tpCH);
    const totalCH = posCH + posPH;
    const callCHPct = totalCH > 0 ? Math.round(posCH / totalCH * 100) : 50;
    const chSignal = callCHPct > (100 - callCHPct) ? 'BEARISH' : callCHPct < (100 - callCHPct) ? 'BULLISH' : 'NEUTRAL';

    return {
      vol: { callPct: callVolPct, putPct: 100 - callVolPct, signal: volSignal },
      oi:  { callPct: callOIPct,  putPct: 100 - callOIPct,  signal: oiSignal  },
      ch:  { callPct: callCHPct,  putPct: 100 - callCHPct,  signal: chSignal  },
    };
  }, [ftotals]);

  // Colspan calculations
  const callCols = useMemo(() => {
    let cols = 3; // OI Chng + S Level + LTP Level
    if (oiDisplayActive) cols++;
    if (volumeDisplayActive) cols++;
    if (ltpDisplayActive) cols++;
    if (volOiCngActive) cols++;
    if (greeksActive) cols += 6;
    return cols;
  }, [oiDisplayActive, volumeDisplayActive, ltpDisplayActive, volOiCngActive, greeksActive]);

  const putCols = useMemo(() => {
    let cols = 3; // S Level + LTP Level + OI Chng
    if (oiDisplayActive) cols++;
    if (volumeDisplayActive) cols++;
    if (ltpDisplayActive) cols++;
    if (volOiCngActive) cols++;
    if (mmiDisplayActive) cols++;
    if (greeksActive) cols += 6;
    return cols;
  }, [oiDisplayActive, volumeDisplayActive, ltpDisplayActive, volOiCngActive, mmiDisplayActive, greeksActive]);

  // Fetch VOL/OI change data every 15s
  const volOiFetchRef = useRef(null);
  useEffect(() => {
    if (!currentSymbol) return;
    const fetch_ = () => {
      const params = new URLSearchParams();
      if (currentExpiry && currentExpiry !== '--') params.set('expiry', currentExpiry);
      if (currentDataDate && currentDataDate !== '--') params.set('date', currentDataDate);
      fetch(`/api/voloichng/${encodeURIComponent(currentSymbol)}?${params}`)
        .then(r => r.ok ? r.json() : {})
        .then(d => dispatch({ type: 'SET_VOLOICHNG_DATA', payload: d }))
        .catch(() => {});
    };
    fetch_();
    volOiFetchRef.current = setInterval(fetch_, 15000);
    return () => clearInterval(volOiFetchRef.current);
  }, [currentSymbol, currentExpiry, currentDataDate]);

  // Active window data (keyed by strike string)
  const volOiWindowData = volOiCngData[volOiCngWindow] || {};

  const handleLtpClick = (optionType, strike, ltp, delta) => {
    dispatch({
      type: 'OPEN_LTP_POPUP',
      payload: { type: optionType, strike, ltp, delta, spot: currentSpot },
    });
  };

  const handleOIClick = (strike, type) => {
    dispatch({ type: 'SET_OI_CHART_MODAL', payload: { strike, type } });
  };

  const handleOIChngClick = (strike, type) => {
    dispatch({ type: 'SET_STRIKE_DATA_CHART_MODAL', payload: { strike, type } });
  };

  // S Level single click — commits the source after 280ms (cancelled if dblclick fires first)
  const handleSLevelClick = (e, optType, strike, ltp, delta) => {
    e.stopPropagation();
    // If a timer is already pending, this is the 2nd tap of a double-click — ignore
    if (singleClickTimerRef.current) {
      clearTimeout(singleClickTimerRef.current);
      singleClickTimerRef.current = null;
      return;
    }
    const data = { type: optType, strike, ltp: parseFloat(ltp || 0), delta: parseFloat(delta || 0) };
    // Show immediate highlight so user gets visual feedback
    setSelectedSLevel({ strike, type: optType });
    // Commit to ref after delay (double-click will cancel this before it fires)
    singleClickTimerRef.current = setTimeout(() => {
      committedSourceRef.current = data;
      singleClickTimerRef.current = null;
    }, 280);
  };

  // S Level double click — cancel pending single-click and open popup using committed source
  const handleSLevelDblClick = (e, reversalValue) => {
    e.stopPropagation();
    if (reversalValue === null || reversalValue === undefined) return;
    // Cancel the pending single-click commit so source stays as previously committed cell
    if (singleClickTimerRef.current) {
      clearTimeout(singleClickTimerRef.current);
      singleClickTimerRef.current = null;
    }
    const src = committedSourceRef.current;
    if (!src) return;
    dispatch({
      type: 'OPEN_LTP_POPUP',
      payload: { ...src, spot: currentSpot, targetReversal: reversalValue },
    });
  };

  // Format shifting badge text: 9:30 SFTB 25000 > 25400 or just the strike if no shift
  const formatShiftBadge = (data) => {
    if (!data?.strike) return null;
    const timePrefix = data.time ? `${data.time} ` : '';
    if (data.shift && data.shiftFrom) return `${timePrefix}${data.shift} ${data.shiftFrom} > ${data.strike}`;
    return `${timePrefix}${data.strike}`;
  };

  if (!displayChain.length) {
    if (state.loading) {
      const totalCols = callCols + 1 + putCols;
      const skeletonRows = Array.from({ length: 15 });
      return (
        <table id="optionTable" className={`skeleton-table ${greeksActive ? 'show-greeks' : ''}`}>
          <thead>
            <tr className="header-main">
              <th colSpan={callCols} className="call-main"><span className="header-main-title">CALL</span></th>
              <th className="strike-main strike-col-cell">STRIKE</th>
              <th colSpan={putCols} className="put-main"><span className="header-main-title">PUT</span></th>
            </tr>
          </thead>
          <tbody>
            {skeletonRows.map((_, i) => (
              <tr key={i}>
                {Array.from({ length: totalCols }).map((__, j) => (
                  <td key={j}>
                    <div className={`skeleton skeleton-bar ${j === Math.floor(totalCols / 2) ? 'center' : j % 3 === 0 ? 'short' : j % 3 === 1 ? 'long' : ''}`} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    return (
      <table id="optionTable" className={greeksActive ? 'show-greeks' : ''}>
        <tbody>
          <tr>
            <td colSpan="22" style={{ textAlign: 'center', padding: '20px' }}>
              Select symbol to load data
            </td>
          </tr>
        </tbody>
      </table>
    );
  }

  return (
    <>
    <table id="optionTable" className={greeksActive ? 'show-greeks' : ''}>
      <thead>
        {/* Main Header Row */}
        <tr className="header-main">
          <th colSpan={callCols} className="call-main">
            <span className="header-main-title">CALL</span>
            {signalsLoading ? (
              <span className="header-signals-loading">
                <span className="skeleton skeleton-bar short" style={{ display: 'inline-block', width: 60, height: 14, verticalAlign: 'middle', borderRadius: 4 }} />
                <span className="skeleton skeleton-bar short" style={{ display: 'inline-block', width: 80, height: 14, verticalAlign: 'middle', borderRadius: 4, marginLeft: 6 }} />
              </span>
            ) : (<>
              {(strategy40ResistanceReversal !== null || adjustedBromos?.side === 'R') && (
                <span className="header-broms-data">
                  {strategy40GapCutResistance
                    ? <>Bromos R: <s>{strategy40GapCutResistance}</s> ➡ {strategy40ResistanceReversal}</>
                    : <>Bromos R: {adjustedBromos?.side === 'R' ? adjustedBromos.reversal : strategy40ResistanceReversal}</>
                  }
                </span>
              )}
              {nextDayBromosR && (
                <span className="header-broms-data header-broms-nextday">
                  Next Day R: {nextDayBromosR}
                </span>
              )}
              {mctrResistance && (
                <span className={`header-mctr-data ${mctrResistanceTouched ? 'mctr-touched' : ''}`}>
                  MCTR R: {mctrResistance} ({mctrResistanceRev})
                </span>
              )}
            </>)}
          </th>
          <th
            className="strike-main strike-col-cell"
            style={{ cursor: 'pointer' }}
            onClick={() => dispatch({ type: 'SET_SHIFTING_MODAL', payload: true })}
            title="Click to view Shifting Data"
          >
            STRIKE
          </th>
          <th colSpan={putCols} className="put-main">
            {signalsLoading ? (
              <span className="header-signals-loading">
                <span className="skeleton skeleton-bar short" style={{ display: 'inline-block', width: 80, height: 14, verticalAlign: 'middle', borderRadius: 4 }} />
                <span className="skeleton skeleton-bar short" style={{ display: 'inline-block', width: 60, height: 14, verticalAlign: 'middle', borderRadius: 4, marginLeft: 6 }} />
              </span>
            ) : (<>
              {mctrSupport && (
                <span className={`header-mctr-data ${mctrSupportTouched ? 'mctr-touched' : ''}`}>
                  MCTR S: {mctrSupport} ({mctrSupportRev})
                </span>
              )}
              {nextDayBromosS && (
                <span className="header-broms-data header-broms-nextday">
                  Next Day S: {nextDayBromosS}
                </span>
              )}
              {(strategy40SupportReversal !== null || adjustedBromos?.side === 'S') && (
                <span className="header-broms-data">
                  {strategy40GapCutSupport
                    ? <>Bromos S: <s>{strategy40GapCutSupport}</s> ➡ {strategy40SupportReversal}</>
                    : <>Bromos S: {adjustedBromos?.side === 'S' ? adjustedBromos.reversal : strategy40SupportReversal}</>
                  }
                </span>
              )}
            </>)}
            <span className="header-main-title"> PUT</span>
          </th>
        </tr>

        {/* Sub Header Row */}
        <tr className="header-sub">
          {greeksActive && <>
            <th className="call-sub greek-col">POP</th>
            <th className="call-sub greek-col">Vega</th>
            <th className="call-sub greek-col">Gamma</th>
            <th className="call-sub greek-col">Theta</th>
            <th className="call-sub greek-col">Delta</th>
            <th className="call-sub greek-col">IV</th>
          </>}
          <th className="call-sub data-col-cell">OI Chng</th>
          {oiDisplayActive && <th className="call-sub data-col-cell oi-col">OI</th>}
          {volumeDisplayActive && <th className="call-sub data-col-cell vol-col">Vol</th>}
          {ltpDisplayActive && <th className="call-sub ltp-col-cell ltp-col">LTP/Chng</th>}
          {volOiCngActive && (
            <th
              className="call-sub data-col-cell voichng-header"
              style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}
              onClick={() => dispatch({ type: 'CYCLE_VOLOICHNG_WINDOW' })}
              title="Click to cycle 5m → 15m → 30m"
            >VOL/OI<br/>CHNG {volOiCngWindow}m</th>
          )}
          <th className="call-sub data-col-cell slevel-header">LTP Level</th>
          <th className="call-sub data-col-cell slevel-header">S Level</th>

          <th
            className="strike-sub strike-col-cell"
            style={{ fontSize: '13px', cursor: 'pointer' }}
            onClick={() => dispatch({ type: 'SET_SHIFTING_MODAL', payload: true })}
            title="Click to view Shifting Data"
          >OI/OI Chng</th>

          <th className="put-sub data-col-cell slevel-header">S Level</th>
          <th className="put-sub data-col-cell slevel-header">LTP Level</th>
          {volOiCngActive && (
            <th
              className="put-sub data-col-cell voichng-header"
              style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}
              onClick={() => dispatch({ type: 'CYCLE_VOLOICHNG_WINDOW' })}
              title="Click to cycle 5m → 15m → 30m"
            >VOL/OI<br/>CHNG {volOiCngWindow}m</th>
          )}
          {ltpDisplayActive && <th className="put-sub ltp-col-cell ltp-col">LTP/Chng</th>}
          {volumeDisplayActive && <th className="put-sub data-col-cell vol-col">Vol</th>}
          {oiDisplayActive && <th className="put-sub data-col-cell oi-col">OI</th>}
          <th className="put-sub data-col-cell">OI Chng</th>
          {greeksActive && <>
            <th className="put-sub greek-col">IV</th>
            <th className="put-sub greek-col">Delta</th>
            <th className="put-sub greek-col">Theta</th>
            <th className="put-sub greek-col">Gamma</th>
            <th className="put-sub greek-col">Vega</th>
            <th className="put-sub greek-col">POP</th>
          </>}
          {mmiDisplayActive && <th className="put-sub mmi-col-cell mmi-col">MMI</th>}
        </tr>
      </thead>

      <tbody id="rows">
        {displayChain.map((r, idx) => {
          const isCallITM = r.strike < currentSpot ? 'itm-bg' : '';
          const isPutITM = r.strike > currentSpot ? 'itm-bg' : '';
          const cChg = parseFloat(r.call?.ltp_change || 0);
          const pChg = parseFloat(r.put?.ltp_change || 0);
          const callDelta = parseFloat(r.call?.delta || 0);
          const putDelta = parseFloat(r.put?.delta || 0);
          const callOIChg = parseFloat(r.call?.oi_change || 0);
          const putOIChg = parseFloat(r.put?.oi_change || 0);
          const callOIChgClass = callOIChg > 0 ? 'oi-change-positive' : (callOIChg < 0 ? 'oi-change-negative' : '');
          const putOIChgClass = putOIChg > 0 ? 'oi-change-positive' : (putOIChg < 0 ? 'oi-change-negative' : '');

          // S Level calculations
          let resistanceValue = null, supportValue = null;
          let ltpAtResistance = null, ltpAtSupport = null;
          if (currentSpot > 0 && strikeGap > 0) {
            const callUpper = strikeMap[r.strike + strikeGap];
            if (callUpper) resistanceValue = calculateResistance(currentSpot, r.put, callUpper.call);
            const putLower = strikeMap[r.strike - strikeGap];
            if (putLower) supportValue = calculateSupport(currentSpot, r.call, putLower.put);

            if (resistanceValue !== null && callDelta !== 0) {
              ltpAtResistance = parseFloat(r.call?.ltp || 0) + callDelta * (resistanceValue - currentSpot);
            }
            if (supportValue !== null && putDelta !== 0) {
              ltpAtSupport = parseFloat(r.put?.ltp || 0) + putDelta * (supportValue - currentSpot);
            }
          }

          const pcrResult = calculatePCR(r.call?.oi, r.put?.oi, r.call?.oi_change, r.put?.oi_change);
          const mmiResult = calculateMMI(r.call?.oi_change, r.put?.oi_change);

          // Spot row check
          let showSpotRow = false;
          if (currentSpot > 0 && idx > 0) {
            const prev = displayChain[idx - 1];
            if (!tableReversed) showSpotRow = prev.strike < currentSpot && r.strike >= currentSpot;
            else showSpotRow = prev.strike > currentSpot && r.strike <= currentSpot;
          }

          // Highlight helpers
          const callOIHighlight = getRankClass(r.call?.oi, stats.callOI.max, stats.callOI.second);
          const callCHHighlight = getRankClass(callOIChg, stats.callCH.max, stats.callCH.second);
          const callVOHighlight = getRankClass(r.call?.volume, stats.callVO.max, stats.callVO.second);
          const putOIHighlight = getRankClass(r.put?.oi, stats.putOI.max, stats.putOI.second);
          const putCHHighlight = getRankClass(putOIChg, stats.putCH.max, stats.putCH.second);
          const putVOHighlight = getRankClass(r.put?.volume, stats.putVO.max, stats.putVO.second);

          const callOIPct = stats.callOI.max > 0 ? ((Math.max(0, r.call?.oi || 0) / stats.callOI.max) * 100).toFixed(0) : 0;
          const putOIPct = stats.putOI.max > 0 ? ((Math.max(0, r.put?.oi || 0) / stats.putOI.max) * 100).toFixed(0) : 0;
          const callVOPct = stats.callVO.max > 0 ? ((Math.max(0, r.call?.volume || 0) / stats.callVO.max) * 100).toFixed(0) : 0;
          const putVOPct = stats.putVO.max > 0 ? ((Math.max(0, r.put?.volume || 0) / stats.putVO.max) * 100).toFixed(0) : 0;

          return (
            <React.Fragment key={r.strike}>
              {/* Spot Row */}
              {showSpotRow && (() => {
                const isBullish = sentiment.vol.signal === 'BULLISH';
                const isBearish = sentiment.vol.signal === 'BEARISH';
                // Arrow chars: ↑ = higher strike direction, ↓ = lower strike direction
                const hiArrow = '↑';
                const loArrow = '↓';
                return (
                  <tr className="spot-row">
                    {/* Call side — resistance shifting level */}
                    <td colSpan={callCols} className="spot-shift-side spot-shift-call-side">
                      {effectiveShiftRes?.strike ? (
                        <span className="spot-shift-text spot-shift-res-text">
                          {effectiveShiftRes.shiftFrom
                            ? `${effectiveShiftRes.time ? effectiveShiftRes.time + ' ' : ''}${effectiveShiftRes.shiftFrom} → ${effectiveShiftRes.strike}`
                            : 'Strong'
                          }
                        </span>
                      ) : (
                        <span className="spot-shift-none">!! No Shifting Yet !!</span>
                      )}
                    </td>

                    {/* Strike center */}
                    <td className="strike-col-cell" style={{ padding: 0, border: 'none' }}>
                      <div
                        className="spot-box"
                        onClick={() => dispatch({ type: 'SET_CHART_MODAL', payload: true })}
                      >
                        <span className="spot-label">SPOT</span>
                        <span className="spot-value">{currentSpot.toFixed(2)}</span>
                        {spotChange !== 0 && (
                          <span className={`spot-diff ${spotChange >= 0 ? 'spot-diff-up' : 'spot-diff-down'}`}>
                            {spotChange >= 0 ? '+' : ''}{spotChange.toFixed(2)} ({spotPctChange >= 0 ? '+' : ''}{spotPctChange.toFixed(2)}%)
                          </span>
                        )}
                        {spotVwap > 0 && (
                          <span className="spot-vwap">
                            <span className="spot-vwap-label">VWAP</span>
                            <span className={`spot-vwap-value ${currentSpot > spotVwap ? 'spot-diff-up' : currentSpot < spotVwap ? 'spot-diff-down' : ''}`}>
                              {spotVwap.toFixed(2)}
                            </span>
                          </span>
                        )}
                        {futuresLtp > 0 && (
                          <span className="spot-futures">
                            <span className="spot-futures-label">FUT</span>
                            <span className="spot-futures-ltp">{futuresLtp.toFixed(2)}</span>
                            {futuresChange !== 0 && (
                              <span className={`spot-futures-diff ${futuresChange >= 0 ? 'spot-diff-up' : 'spot-diff-down'}`}>
                                {futuresChange >= 0 ? '+' : ''}{futuresChange.toFixed(2)} ({futuresPctChange >= 0 ? '+' : ''}{futuresPctChange.toFixed(2)}%)
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Put side — support shifting level */}
                    <td colSpan={putCols} className="spot-shift-side spot-shift-put-side">
                      {effectiveShiftSup?.strike ? (
                        <span className="spot-shift-text spot-shift-sup-text">
                          {effectiveShiftSup.shiftFrom
                            ? `${effectiveShiftSup.time ? effectiveShiftSup.time + ' ' : ''}${effectiveShiftSup.shiftFrom} → ${effectiveShiftSup.strike}`
                            : 'Strong'
                          }
                        </span>
                      ) : (
                        <span className="spot-shift-none">!! No Shifting Yet !!</span>
                      )}
                    </td>
                  </tr>
                );
              })()}

              {/* Data Row */}
              <tr>
                {/* Call Greeks */}
                {greeksActive && <>
                  <td className={`greek-col ${isCallITM}`}>{r.call?.pop || '-'}</td>
                  <td className={`greek-col ${isCallITM}`}>{r.call?.vega || '-'}</td>
                  <td className={`greek-col ${isCallITM}`}>{r.call?.gamma || '-'}</td>
                  <td className={`greek-col ${isCallITM}`}>{r.call?.theta || '-'}</td>
                  <td className={`greek-col ${isCallITM}`}>{r.call?.delta || '-'}</td>
                  <td className={`greek-col ${isCallITM}`}>{r.call?.iv || '-'}</td>
                </>}

                {/* Call OI Chng */}
                <td
                  className={`data-col-cell ${callCHHighlight || isCallITM} ${callOIChgClass} oi-clickable`}
                  onClick={() => handleOIChngClick(r.strike, 'call')}
                >
                  <span>
                    {callOIChg >= 0 ? '+' : ''}{fmtLots(callOIChg)}
                    {/* Call dominant (OI or OI Chng) → ITM side = lower strike = ↑ green
                        else → OTM side = higher strike = ↓ red */}
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
                  <td
                    className={`data-col-cell ${callOIHighlight || isCallITM} oi-clickable`}
                    onClick={() => handleOIClick(r.strike, 'call')}
                  >
                    <span>{fmtLots(r.call?.oi)}</span>
                    <span className="perc-val">{callOIPct}%</span>
                  </td>
                )}

                {/* Call Volume */}
                {volumeDisplayActive && (
                  <td className={`data-col-cell ${callVOHighlight || isCallITM}`}>
                    <span>{fmtLots(r.call?.volume)}</span>
                    <span className="perc-val">{callVOPct}%</span>
                  </td>
                )}

                {/* Call LTP */}
                {ltpDisplayActive && (
                  <td className={`ltp-col-cell ${isCallITM}`}>
                    <span
                      className="ltp-val"
                      onClick={() => handleLtpClick('call', r.strike, parseFloat(r.call?.ltp || 0), callDelta)}
                    >
                      {fix(r.call?.ltp)}
                    </span>
                    <span className="chng-val" style={{ color: cChg < 0 ? '#d32f2f' : '#388e3c' }}>
                      {cChg > 0 ? '+' : ''}{fix(cChg)}
                    </span>
                  </td>
                )}

                {/* Call VOL/OI CHNG — change over selected window (hidden by default) */}
                {volOiCngActive && (() => {
                  const d = volOiWindowData[String(r.strike)];
                  const cv = d?.callVol ?? null;
                  const co = d?.callOI  ?? null;
                  return (
                    <td className={`data-col-cell voichng-cell ${isCallITM}`}>
                      {cv !== null ? (
                        <span className={`voichng-vol ${cv >= 0 ? 'voichng-pos' : 'voichng-neg'}`}>
                          {cv >= 0 ? '+' : ''}{fmtLots(cv)}
                        </span>
                      ) : <span className="voichng-na">—</span>}
                      {co !== null ? (
                        <span className={`voichng-oi ${co >= 0 ? 'voichng-pos' : 'voichng-neg'}`}>
                          {co >= 0 ? '+' : ''}{fmtLots(co)}
                        </span>
                      ) : null}
                    </td>
                  );
                })()}

                {/* Call LTP Level (at Resistance) */}
                <td className={`data-col-cell slevel-cell ${isCallITM}`}>
                  {ltpAtResistance !== null && !isNaN(ltpAtResistance) && ltpAtResistance > 0
                    ? <span className="slevel-ltp">{ltpAtResistance.toFixed(1)}</span>
                    : <span className="slevel-na">—</span>}
                </td>

                {/* Call S Level (Resistance) */}
                {(() => {
                  const isSelected = selectedSLevel?.strike === r.strike && selectedSLevel?.type === 'call';
                  const isResOI = r.strike === resistanceOIStrike;
                  return (
                    <td
                      className={`data-col-cell slevel-cell slevel-clickable slevel-call ${isCallITM}${isSelected ? ' slevel-selected' : ''}`}
                      onClick={e => handleSLevelClick(e, 'call', r.strike, r.call?.ltp, callDelta)}
                      onDoubleClick={e => handleSLevelDblClick(e, resistanceValue)}
                      title={isSelected ? 'Double-click another S Level to calculate LTP' : 'Click to select • Double-click target to calculate'}
                    >
                      <span className="slevel-val">{formatReversal(resistanceValue)}</span>
                      {isResOI && <span className="slevel-oi-star slevel-oi-star-red">★</span>}
                      {isSelected && <span className="slevel-pin">📌</span>}
                    </td>
                  );
                })()}

                {/* STRIKE */}
                <td className="strike-col strike-col-cell" style={{ position: 'relative' }}>
                  {/* MT indicator — Market Top (green, left) */}
                  {indicatorsActive && indicators.mtmb.mt === r.strike && (
                    <div className="mtmb-tag green-tag">
                      <span className="line">M</span>
                      <span className="line">T</span>
                      <span className="line arrow">↑</span>
                    </div>
                  )}
                  {/* MB indicator — Market Bottom (red, right) */}
                  {indicatorsActive && indicators.mtmb.mb === r.strike && (
                    <div className="mtmb-tag red-tag">
                      <span className="line">M</span>
                      <span className="line">B</span>
                      <span className="line arrow">↓</span>
                    </div>
                  )}
                  {/* 4.0 R indicator (green, protrudes left) */}
                  {indicatorsActive && indicators.theory40.resistance === r.strike && (
                    <div className="theory4-tag green4-tag">
                      <div>4.0</div>
                      <div>R</div>
                    </div>
                  )}
                  {/* 4.0 S indicator (red, protrudes right) */}
                  {indicatorsActive && indicators.theory40.support === r.strike && (
                    <div className="theory4-tag red4-tag">
                      <div>4.0</div>
                      <div>S</div>
                    </div>
                  )}
                  {/* VT indicator */}
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

                {/* Put S Level (Support) */}
                {(() => {
                  const isSelected = selectedSLevel?.strike === r.strike && selectedSLevel?.type === 'put';
                  const isSupOI = r.strike === supportOIStrike;
                  return (
                    <td
                      className={`data-col-cell slevel-cell slevel-clickable slevel-put ${isPutITM}${isSelected ? ' slevel-selected' : ''}`}
                      onClick={e => handleSLevelClick(e, 'put', r.strike, r.put?.ltp, putDelta)}
                      onDoubleClick={e => handleSLevelDblClick(e, supportValue)}
                      title={isSelected ? 'Double-click another S Level to calculate LTP' : 'Click to select • Double-click target to calculate'}
                    >
                      <span className="slevel-val">{formatReversal(supportValue)}</span>
                      {isSupOI && <span className="slevel-oi-star slevel-oi-star-green">★</span>}
                      {isSelected && <span className="slevel-pin">📌</span>}
                    </td>
                  );
                })()}

                {/* Put LTP Level (at Support) */}
                <td className={`data-col-cell slevel-cell ${isPutITM}`}>
                  {ltpAtSupport !== null && !isNaN(ltpAtSupport) && ltpAtSupport > 0
                    ? <span className="slevel-ltp">{ltpAtSupport.toFixed(1)}</span>
                    : <span className="slevel-na">—</span>}
                </td>

                {/* Put VOL/OI CHNG — change over selected window (hidden by default) */}
                {volOiCngActive && (() => {
                  const d = volOiWindowData[String(r.strike)];
                  const pv = d?.putVol ?? null;
                  const po = d?.putOI  ?? null;
                  return (
                    <td className={`data-col-cell voichng-cell ${isPutITM}`}>
                      {pv !== null ? (
                        <span className={`voichng-vol ${pv >= 0 ? 'voichng-pos' : 'voichng-neg'}`}>
                          {pv >= 0 ? '+' : ''}{fmtLots(pv)}
                        </span>
                      ) : <span className="voichng-na">—</span>}
                      {po !== null ? (
                        <span className={`voichng-oi ${po >= 0 ? 'voichng-pos' : 'voichng-neg'}`}>
                          {po >= 0 ? '+' : ''}{fmtLots(po)}
                        </span>
                      ) : null}
                    </td>
                  );
                })()}

                {/* Put LTP */}
                {ltpDisplayActive && (
                  <td className={`ltp-col-cell ${isPutITM}`}>
                    <span
                      className="ltp-val"
                      onClick={() => handleLtpClick('put', r.strike, parseFloat(r.put?.ltp || 0), putDelta)}
                    >
                      {fix(r.put?.ltp)}
                    </span>
                    <span className="chng-val" style={{ color: pChg < 0 ? '#d32f2f' : '#388e3c' }}>
                      {pChg > 0 ? '+' : ''}{fix(pChg)}
                    </span>
                  </td>
                )}

                {/* Put Volume */}
                {volumeDisplayActive && (
                  <td className={`data-col-cell ${putVOHighlight || isPutITM}`}>
                    <span>{fmtLots(r.put?.volume)}</span>
                    <span className="perc-val">{putVOPct}%</span>
                  </td>
                )}

                {/* Put OI */}
                {oiDisplayActive && (
                  <td
                    className={`data-col-cell ${putOIHighlight || isPutITM} oi-clickable`}
                    onClick={() => handleOIClick(r.strike, 'put')}
                  >
                    <span>{fmtLots(r.put?.oi)}</span>
                    <span className="perc-val">{putOIPct}%</span>
                  </td>
                )}

                {/* Put OI Chng */}
                <td
                  className={`data-col-cell ${putCHHighlight || isPutITM} ${putOIChgClass} oi-clickable`}
                  onClick={() => handleOIChngClick(r.strike, 'put')}
                >
                  <span>
                    {putOIChg >= 0 ? '+' : ''}{fmtLots(putOIChg)}
                    {/* Put dominant (OI or OI Chng) → ITM side = higher strike = ↓ green
                        else → OTM side = lower strike = ↑ red */}
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
                  <td className={`greek-col ${isPutITM}`}>{r.put?.iv || '-'}</td>
                  <td className={`greek-col ${isPutITM}`}>{r.put?.delta || '-'}</td>
                  <td className={`greek-col ${isPutITM}`}>{r.put?.theta || '-'}</td>
                  <td className={`greek-col ${isPutITM}`}>{r.put?.gamma || '-'}</td>
                  <td className={`greek-col ${isPutITM}`}>{r.put?.vega || '-'}</td>
                  <td className={`greek-col ${isPutITM}`}>{r.put?.pop || '-'}</td>
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

      <tfoot className="option-chain-footer">
        <tr>
          {greeksActive && Array.from({ length: 6 }, (_, i) => (
            <td key={`fg${i}`} className="footer-data-cell call-footer greek-col" />
          ))}

          <td className={`footer-data-cell call-footer ${ftotals.tcCH > 0 ? 'positive' : ftotals.tcCH < 0 ? 'negative' : ''}`}>
            {ftotals.tcCH >= 0 ? '+' : ''}{fmtLots(ftotals.tcCH)}
          </td>

          {oiDisplayActive && <td className="footer-data-cell call-footer">{fmtLots(ftotals.tcOI)}</td>}
          {volumeDisplayActive && <td className="footer-data-cell call-footer">{fmtLots(ftotals.tcVOL)}</td>}
          {ltpDisplayActive && <td className="footer-data-cell call-footer" />}
          {volOiCngActive && <td className="footer-data-cell call-footer" />}
          {/* Call LTP Level + S Level footer — empty */}
          <td className="footer-data-cell call-footer" />
          <td className="footer-data-cell call-footer" />

          <td
            className="footer-total-label"
            style={{ cursor: 'pointer', textDecoration: 'underline dotted' }}
            title="Click to view PCR chart"
            onClick={() => setPcrModalOpen(true)}
          >PCR: {pcrOI}</td>

          {/* Put S Level + LTP Level footer — empty */}
          <td className="footer-data-cell put-footer" />
          <td className="footer-data-cell put-footer" />
          {volOiCngActive && <td className="footer-data-cell put-footer" />}
          {ltpDisplayActive && <td className="footer-data-cell put-footer" />}
          {volumeDisplayActive && <td className="footer-data-cell put-footer">{fmtLots(ftotals.tpVOL)}</td>}
          {oiDisplayActive && <td className="footer-data-cell put-footer">{fmtLots(ftotals.tpOI)}</td>}

          <td className={`footer-data-cell put-footer ${ftotals.tpCH > 0 ? 'positive' : ftotals.tpCH < 0 ? 'negative' : ''}`}>
            {ftotals.tpCH >= 0 ? '+' : ''}{fmtLots(ftotals.tpCH)}
          </td>

          {greeksActive && Array.from({ length: 6 }, (_, i) => (
            <td key={`fpg${i}`} className="footer-data-cell put-footer greek-col" />
          ))}

          {mmiDisplayActive && <td className="footer-data-cell put-footer" />}
        </tr>

        {/* 6-Box Summary Row */}
        {(() => {
          const totalCols = callCols + 1 + putCols;
          const { tcOI, tcCH, tcVOL, tpOI, tpCH, tpVOL } = ftotals;

          const pct = (a, b) => {
            const mx = Math.max(Math.abs(a), Math.abs(b));
            if (mx === 0) return [100, 100];
            return [Math.round(Math.abs(a) / mx * 100), Math.round(Math.abs(b) / mx * 100)];
          };

          const SixBox = ({ label, callVal, putVal, callPct, putPct, isBullish }) => {
            const arrow  = isBullish ? '↓' : '↑';
            const color  = isBullish ? '#4caf50' : '#f44336';
            const signal = isBullish ? 'BULLISH' : 'BEARISH';
            return (
              <div className="sixbox">
                <div className="sixbox-label">{label}</div>
                <div className="sixbox-row">
                  <div className="sixbox-side sixbox-call">
                    <div className="sixbox-tag">Call</div>
                    <div className="sixbox-val">{callVal}</div>
                    <div className="sixbox-pct">({callPct}%)</div>
                  </div>
                  <div className="sixbox-arrow" style={{ color, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'1px' }}>
                    <span style={{
                      fontSize:'22px', lineHeight:1, fontWeight:900,
                      animation: isBullish
                        ? 'arrow-down-bounce 1s ease-in-out infinite'
                        : 'arrow-up-bounce 1s ease-in-out infinite',
                      display:'inline-block'
                    }}>{arrow}</span>
                    <span style={{ fontSize:'11px', fontWeight:900, letterSpacing:'0.8px', textTransform:'uppercase', marginTop:'2px' }}>{signal}</span>
                  </div>
                  <div className="sixbox-side sixbox-put">
                    <div className="sixbox-tag">Put</div>
                    <div className="sixbox-val">{putVal}</div>
                    <div className="sixbox-pct">({putPct}%)</div>
                  </div>
                </div>
              </div>
            );
          };

          const [vcp, vpp] = pct(tcVOL, tpVOL);
          const [ocp, opp] = pct(tcOI, tpOI);
          const [ccp, cpp] = pct(tcCH, tpCH);

          return (
            <tr className="sentiment-footer-row">
              <td colSpan={totalCols}>
                <div className="sixbox-row-wrap">
                  <SixBox label="Volume"
                    callVal={fmtLots(tcVOL)} putVal={fmtLots(tpVOL)}
                    callPct={vcp} putPct={vpp}
                    isBullish={tcVOL >= tpVOL} />
                  <SixBox label="Open Interest"
                    callVal={fmtLots(tcOI)} putVal={fmtLots(tpOI)}
                    callPct={ocp} putPct={opp}
                    isBullish={tpOI > tcOI} />
                  <SixBox label="OI Change"
                    callVal={fmtLots(tcCH)} putVal={fmtLots(tpCH)}
                    callPct={ccp} putPct={cpp}
                    isBullish={tpCH > tcCH} />
                </div>
              </td>
            </tr>
          );
        })()}
      </tfoot>
    </table>
    <PCRChartModal open={pcrModalOpen} onClose={() => setPcrModalOpen(false)} />
    </>
  );
}