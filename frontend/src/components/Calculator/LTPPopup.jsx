import { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { calculateNewLTP } from '../../services/calculations';
import './LTPPopup.css';

export default function LTPPopup() {
  const { state, dispatch } = useApp();
  const { selectedOption, ltpPopupOpen, currentSpot } = state;

  const [reversalInput, setReversalInput] = useState('');
  const inputRef = useRef(null);

  // Pre-fill: use targetReversal (from S Level double-click) or fall back to current spot
  useEffect(() => {
    if (ltpPopupOpen && selectedOption) {
      const prefill = selectedOption.targetReversal != null
        ? String(selectedOption.targetReversal.toFixed(2))
        : String(currentSpot > 0 ? currentSpot.toFixed(2) : '');
      setReversalInput(prefill);
      setTimeout(() => inputRef.current?.select(), 50);
    }
  }, [ltpPopupOpen, selectedOption, currentSpot]);

  const close = useCallback(() => dispatch({ type: 'CLOSE_LTP_POPUP' }), [dispatch]);

  if (!ltpPopupOpen || !selectedOption) return null;

  const { strike, ltp, delta, type, targetReversal } = selectedOption;
  const isSlevelMode = targetReversal != null;

  // Auto-calculate as user types
  const newReversalNum = parseFloat(reversalInput);
  const newLTP = !isNaN(newReversalNum) && delta != null
    ? calculateNewLTP(ltp, delta, currentSpot, newReversalNum)
    : null;

  const ltpChange = newLTP !== null ? newLTP - ltp : null;
  const isUp = ltpChange !== null && ltpChange > 0;
  const isDown = ltpChange !== null && ltpChange < 0;

  return (
    <div className="ltp-popup-backdrop" onMouseDown={close}>
      <div className="ltp-popup" onMouseDown={e => e.stopPropagation()}>

        {/* Header */}
        <div className="ltp-popup-header">
          <span className="ltp-popup-title">SOC Calculator</span>
          <span className={`ltp-popup-badge ${type === 'call' ? 'badge-call' : 'badge-put'}`}>
            {type?.toUpperCase()}
          </span>
          {isSlevelMode && <span className="ltp-popup-badge badge-slevel">S→S</span>}
          <button className="ltp-popup-close" onClick={close}>✕</button>
        </div>

        {/* Strike + LTP row */}
        <div className="ltp-popup-info">
          <div className="ltp-info-box">
            <div className="ltp-info-label">Strike</div>
            <div className="ltp-info-val">{strike}</div>
          </div>
          <div className="ltp-info-box">
            <div className="ltp-info-label">Current LTP</div>
            <div className="ltp-info-val ltp-current">{ltp?.toFixed(2)}</div>
          </div>
          <div className="ltp-info-box">
            <div className="ltp-info-label">Spot</div>
            <div className="ltp-info-val">{currentSpot?.toFixed(2)}</div>
          </div>
        </div>

        {/* Reversal input */}
        <div className="ltp-popup-input-row">
          <label className="ltp-popup-label">
            {isSlevelMode ? 'Target S Level (auto-filled)' : 'New Reversal Value'}
          </label>
          <input
            ref={inputRef}
            className="ltp-popup-input"
            type="number"
            value={reversalInput}
            onChange={e => setReversalInput(e.target.value)}
            placeholder="Enter new spot / reversal"
          />
        </div>

        {/* Result */}
        <div className="ltp-popup-result">
          <div className="ltp-result-label">New LTP</div>
          <div className={`ltp-result-val ${isUp ? 'ltp-up' : isDown ? 'ltp-down' : ''}`}>
            {newLTP !== null ? newLTP.toFixed(2) : '—'}
            {ltpChange !== null && (
              <span className="ltp-result-change">
                {ltpChange >= 0 ? ' +' : ' '}{ltpChange.toFixed(2)}
              </span>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
