import React, { useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import {
  fix, formatReversal, calculateSupport, calculateResistance,
  calculatePCR, calculateMMI, calculateMTMB, calculateTheory40,
  calculateVT, getRankClass, getColumnStats,
} from '../../services/calculations';

export default function OptionChainTable() {
  const { state, dispatch } = useApp();
  const {
    chainData, currentSpot, greeksActive, atmActive,
    indicatorsActive, ltpDisplayActive, volumeDisplayActive,
    oiDisplayActive, mmiDisplayActive, tableReversed,
    strategy40Support, strategy40Resistance,
    strategy40SupportReversal, strategy40ResistanceReversal,
    mctrSupport, mctrResistance, mctrSupportRev, mctrResistanceRev,
    mctrSupportTouched, mctrResistanceTouched,
    shiftingResistance, shiftingSupport,
  } = state;

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

  // Footer totals — always matches the currently displayed strikes
  const ftotals = useMemo(() => {
    let tcOI = 0, tcCH = 0, tcVOL = 0, tpOI = 0, tpCH = 0, tpVOL = 0;
    displayChain.forEach(r => {
      tcOI += Number(r.call?.oi || 0);
      tcCH += Number(r.call?.oi_change || 0);
      tcVOL += Number(r.call?.volume || 0);
      tpOI += Number(r.put?.oi || 0);
      tpCH += Number(r.put?.oi_change || 0);
      tpVOL += Number(r.put?.volume || 0);
    });
    return { tcOI, tcCH, tcVOL, tpOI, tpCH, tpVOL };
  }, [displayChain]);

  const pcrOI = ftotals.tcOI > 0 ? (ftotals.tpOI / ftotals.tcOI).toFixed(2) : '0.00';

  // Colspan calculations
  const callCols = useMemo(() => {
    let cols = 2; // OI Chng + S Level
    if (oiDisplayActive) cols++;
    if (volumeDisplayActive) cols++;
    if (ltpDisplayActive) cols++;
    if (greeksActive) cols += 6;
    return cols;
  }, [oiDisplayActive, volumeDisplayActive, ltpDisplayActive, greeksActive]);

  const putCols = useMemo(() => {
    let cols = 2;
    if (oiDisplayActive) cols++;
    if (volumeDisplayActive) cols++;
    if (ltpDisplayActive) cols++;
    if (mmiDisplayActive) cols++;
    if (greeksActive) cols += 6;
    return cols;
  }, [oiDisplayActive, volumeDisplayActive, ltpDisplayActive, mmiDisplayActive, greeksActive]);

  const handleLtpClick = (optionType, strike, ltp, delta) => {
    dispatch({
      type: 'SET_SELECTED_OPTION',
      payload: { type: optionType, strike, ltp, delta, spot: currentSpot },
    });
    if (!state.ltpCalcActive) dispatch({ type: 'TOGGLE_LTP_CALC' });
  };

  const handleOIClick = (strike, type) => {
    dispatch({ type: 'SET_OI_CHART_MODAL', payload: { strike, type } });
  };

  const handleOIChngClick = (strike, type) => {
    dispatch({ type: 'SET_STRIKE_DATA_CHART_MODAL', payload: { strike, type } });
  };

  // Format shifting badge text: SFTTB 25000 > 25400 or just the strike if no shift
  const formatShiftBadge = (data) => {
    if (!data?.strike) return null;
    if (data.shift && data.shiftFrom) return `${data.shift} ${data.shiftFrom} > ${data.strike}`;
    return String(data.strike);
  };

  if (!displayChain.length) {
    return (
      <table id="optionTable" className={greeksActive ? 'show-greeks' : ''}>
        <tbody>
          <tr>
            <td colSpan="22" style={{ textAlign: 'center', padding: '20px' }}>
              {state.loading ? 'Loading option chain data...' : 'Select symbol to load data'}
            </td>
          </tr>
        </tbody>
      </table>
    );
  }

  return (
    <table id="optionTable" className={greeksActive ? 'show-greeks' : ''}>
      <thead>
        {/* Main Header Row */}
        <tr className="header-main">
          <th colSpan={callCols} className="call-main">
            <span className="header-main-title">CALL</span>
            {strategy40ResistanceReversal !== null && (
              <span className="header-broms-data">4.0 R: {strategy40ResistanceReversal}</span>
            )}
            {mctrResistance && (
              <span className={`header-mctr-data ${mctrResistanceTouched ? 'mctr-touched' : ''}`}>
                MCTR R: {mctrResistance} ({mctrResistanceRev})
              </span>
            )}
            {formatShiftBadge(shiftingResistance) && (
              <span className="header-shift-data header-shift-res">
                {formatShiftBadge(shiftingResistance)}
              </span>
            )}
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
            {formatShiftBadge(shiftingSupport) && (
              <span className="header-shift-data header-shift-sup">
                {formatShiftBadge(shiftingSupport)}
              </span>
            )}
            {mctrSupport && (
              <span className={`header-mctr-data ${mctrSupportTouched ? 'mctr-touched' : ''}`}>
                MCTR S: {mctrSupport} ({mctrSupportRev})
              </span>
            )}
            {strategy40SupportReversal !== null && (
              <span className="header-broms-data">4.0 S: {strategy40SupportReversal}</span>
            )}
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
          <th className="call-sub data-col-cell">S Level</th>

          <th
            className="strike-sub strike-col-cell"
            style={{ fontSize: '13px', cursor: 'pointer' }}
            onClick={() => dispatch({ type: 'SET_SHIFTING_MODAL', payload: true })}
            title="Click to view Shifting Data"
          >OI/OI Chng</th>

          <th className="put-sub data-col-cell">S Level</th>
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
          if (currentSpot > 0 && strikeGap > 0) {
            const callUpper = strikeMap[r.strike + strikeGap];
            if (callUpper) resistanceValue = calculateResistance(currentSpot, r.put, callUpper.call);
            const putLower = strikeMap[r.strike - strikeGap];
            if (putLower) supportValue = calculateSupport(currentSpot, r.call, putLower.put);
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
              {showSpotRow && (
                <tr className="spot-row">
                  <td colSpan={callCols} className="line-side" />
                  <td className="strike-col-cell" style={{ padding: 0, border: 'none' }}>
                    <div
                      className="spot-box"
                      onClick={() => dispatch({ type: 'SET_CHART_MODAL', payload: true })}
                    >
                      <span className="spot-label">SPOT</span>
                      <span className="spot-value">{currentSpot.toFixed(2)}</span>
                    </div>
                  </td>
                  <td colSpan={putCols} className="line-side" />
                </tr>
              )}

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
                  <span>{callOIChg > 0 ? '+' : ''}{callOIChg || 0}</span>
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
                    <span>{r.call?.oi || 0}</span>
                    <span className="perc-val">{callOIPct}%</span>
                  </td>
                )}

                {/* Call Volume */}
                {volumeDisplayActive && (
                  <td className={`data-col-cell ${callVOHighlight || isCallITM}`}>
                    <span>{r.call?.volume || 0}</span>
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

                {/* Call S Level (Resistance) */}
                <td className={`data-col-cell ${isCallITM}`}>
                  {formatReversal(resistanceValue)}
                </td>

                {/* STRIKE */}
                <td className="strike-col strike-col-cell">
                  {r.strike}
                  <div className={`pcr-value ${pcrResult.class}`}>
                    {pcrResult.oi} / {pcrResult.change}
                  </div>
                </td>

                {/* Put S Level (Support) */}
                <td className={`data-col-cell ${isPutITM}`}>
                  {formatReversal(supportValue)}
                </td>

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
                    <span>{r.put?.volume || 0}</span>
                    <span className="perc-val">{putVOPct}%</span>
                  </td>
                )}

                {/* Put OI */}
                {oiDisplayActive && (
                  <td
                    className={`data-col-cell ${putOIHighlight || isPutITM} oi-clickable`}
                    onClick={() => handleOIClick(r.strike, 'put')}
                  >
                    <span>{r.put?.oi || 0}</span>
                    <span className="perc-val">{putOIPct}%</span>
                  </td>
                )}

                {/* Put OI Chng */}
                <td
                  className={`data-col-cell ${putCHHighlight || isPutITM} ${putOIChgClass} oi-clickable`}
                  onClick={() => handleOIChngClick(r.strike, 'put')}
                >
                  <span>{putOIChg > 0 ? '+' : ''}{putOIChg || 0}</span>
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
            <td key={`fg${i}`} className="footer-data-cell greek-col" />
          ))}

          <td className={`footer-data-cell ${ftotals.tcCH > 0 ? 'positive' : ftotals.tcCH < 0 ? 'negative' : ''}`}>
            {ftotals.tcCH > 0 ? '+' : ''}{ftotals.tcCH.toLocaleString()}
          </td>

          {oiDisplayActive && <td className="footer-data-cell">{ftotals.tcOI.toLocaleString()}</td>}
          {volumeDisplayActive && <td className="footer-data-cell">{ftotals.tcVOL.toLocaleString()}</td>}
          {ltpDisplayActive && <td className="footer-data-cell" />}
          <td className="footer-data-cell" />

          <td className="footer-total-label">PCR: {pcrOI}</td>

          <td className="footer-data-cell" />
          {ltpDisplayActive && <td className="footer-data-cell" />}
          {volumeDisplayActive && <td className="footer-data-cell">{ftotals.tpVOL.toLocaleString()}</td>}
          {oiDisplayActive && <td className="footer-data-cell">{ftotals.tpOI.toLocaleString()}</td>}

          <td className={`footer-data-cell ${ftotals.tpCH > 0 ? 'positive' : ftotals.tpCH < 0 ? 'negative' : ''}`}>
            {ftotals.tpCH > 0 ? '+' : ''}{ftotals.tpCH.toLocaleString()}
          </td>

          {greeksActive && Array.from({ length: 6 }, (_, i) => (
            <td key={`fpg${i}`} className="footer-data-cell greek-col" />
          ))}

          {mmiDisplayActive && <td className="footer-data-cell" />}
        </tr>
      </tfoot>
    </table>
  );
}