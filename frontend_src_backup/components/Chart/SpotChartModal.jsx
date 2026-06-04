import { useApp } from '../../context/AppContext';
import LightweightChart from './LightweightChart';
import './Chart.css';

export default function SpotChartModal() {
  const { state, dispatch } = useApp();

  if (!state.chartModalOpen) return null;

  const close = () => dispatch({ type: 'SET_CHART_MODAL', payload: false });

  return (
    <>
      <div className="chart-modal-backdrop" onClick={close} />
      <div className="chart-modal">
        <div className="chart-modal-header">
          <span className="chart-modal-title">
            {state.currentSymbol} &nbsp;|&nbsp; {state.currentDataDate} &nbsp;|&nbsp; 5 Min Chart
          </span>
          <button className="chart-modal-close" onClick={close}>✕</button>
        </div>
        <div className="chart-modal-body">
          <LightweightChart
            symbol={state.currentSymbol}
            expiry={state.currentExpiry}
            date={state.currentDataDate}
            historicalMode={state.historicalMode}
            cutoffTime={state.historicalMode ? state.currentTime : null}
          />
        </div>
      </div>
    </>
  );
}
