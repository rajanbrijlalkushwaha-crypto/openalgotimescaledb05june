/**
 * LiveOCPage — Live OC Tick view.
 * Identical layout to the main option chain (Topbar, OptionChainTable, Footer,
 * all modals). Data comes from the native WebSocket (WS:SYMBOL) — same channel
 * as Way 1, but updated every tick when Upstox WS is active.
 */
import { lazy, Suspense } from 'react';
import Topbar from '../Topbar/topbar';
import UISettings from '../UISetting/UISettings';
import OptionChainTable from '../OptionChain/OptionChainTable';
import Footer from '../Footer/Footer';
import { useOptionChainWS } from '../../hooks/useOptionChainWS';
import { useApp } from '../../context/AppContext';

const LTPCalculator  = lazy(() => import('../Calculator/LTPCalculator'));
const LTPPopup       = lazy(() => import('../Calculator/LTPPopup'));
const ShiftingModal  = lazy(() => import('../Shifting/ShiftingModal'));
const SpotChartModal = lazy(() => import('../Chart/SpotChartModal'));
const OIChartModal   = lazy(() => import('../Chart/OIChartModal'));
const OIChngModal    = lazy(() => import('../Chart/OIChngModal'));
const SOCAIPanel     = lazy(() => import('../SOCAI/SOCAIPanel'));

export default function LiveOCPage() {
  const { state } = useApp();
  const symbol = state.historicalMode ? null : state.currentSymbol;
  useOptionChainWS(symbol);

  return (
    <Suspense fallback={null}>
      <div className="watermark">SOC.AI.IN</div>

      {/* Full Topbar — has symbol search/select, expiry, date, time, lot, logout */}
      <Topbar />
      <UISettings />

      {/* Modals — same as main chain view */}
      <div id="mainContent">
        <LTPCalculator />
        <LTPPopup />
        <ShiftingModal />
        <SpotChartModal />
        <OIChartModal />
        <OIChngModal />
        <OptionChainTable />
      </div>

      <Footer />
      <SOCAIPanel />
    </Suspense>
  );
}
