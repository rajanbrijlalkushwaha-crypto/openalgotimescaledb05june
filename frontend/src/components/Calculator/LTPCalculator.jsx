import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { calculateNewLTP } from '../../services/calculations';

export default function LTPCalculator() {
  const { state, dispatch } = useApp();
  const [reversalValue, setReversalValue] = useState('');
  const [result, setResult] = useState(null);

  const { selectedOption, currentSpot, ltpCalcActive } = state;

  useEffect(() => {
    if (selectedOption) {
      setReversalValue(selectedOption.spot.toFixed(2));
    }
  }, [selectedOption]);

  if (!ltpCalcActive) return null;

  const handleCalculate = () => {
    if (!selectedOption || isNaN(parseFloat(reversalValue))) return;
    const newLTP = calculateNewLTP(
      selectedOption.ltp, selectedOption.delta, selectedOption.spot, parseFloat(reversalValue)
    );
    setResult(newLTP);
  };

  return (
    <div className="ltp-calculator-panel active">
      <div className="calc-header">
        <div className="calc-title">SOC Calculator</div>
        <button className="close-calc" onClick={() => dispatch({ type: 'TOGGLE_LTP_CALC' })}>×</button>
      </div>

      <div className="calc-input-group">
        <div className="calc-field">
          <label>Spot Price</label>
          <div className="value">{selectedOption?.spot?.toFixed(2) || '-'}</div>
        </div>
        <div className="calc-field">
          <label>Selected Strike</label>
          <div className="value">{selectedOption?.strike || '-'}</div>
        </div>
        <div className="calc-field">
          <label>Current LTP</label>
          <div className="value">{selectedOption?.ltp?.toFixed(2) || '-'}</div>
        </div>
        <div className="calc-field">
          <label>Delta (Δ)</label>
          <div className="value">{selectedOption?.delta?.toFixed(2) || '-'}</div>
        </div>
      </div>

      <div className="calc-input-group">
        <div className="calc-field">
          <label>Reversal Value (New Spot)</label>
          <input
            type="number"
            value={reversalValue}
            onChange={e => setReversalValue(e.target.value)}
            placeholder="Enter new spot price"
          />
        </div>
        <div className="calc-field">
          <label>New Calculated LTP</label>
          <div className="value">{result !== null ? result.toFixed(2) : '-'}</div>
        </div>
      </div>

      <button className="calc-btn" onClick={handleCalculate}>Calculate New LTP</button>

      <div className="calc-result">
        <div className="calc-result-label">New Option Price After Spot Change</div>
        <div className="calc-result-value">{result !== null ? result.toFixed(2) : '-'}</div>
      </div>
    </div>
  );
}