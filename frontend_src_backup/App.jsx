import { useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { io } from 'socket.io-client';
import { AppProvider, useApp } from './context/AppContext';
import { fetchSymbols, fetchLiveData, fetchLiveSignals, fetchShiftingData, fetchMCTRData, fetchStrategy40Data, fetchPrefetch } from './services/api';
import IndexPage from './components/Index/IndexPage';
import SideNav from './components/sidenav/sidenav';
import Topbar from './components/Topbar/topbar';
import UISettings from './components/UISetting/UISettings';
import OptionChainTable from './components/OptionChain/OptionChainTable';
import Footer from './components/Footer/Footer';
import NotifPopup from './components/Notifications/NotifPopup';
import SplitPane from './components/Layout/SplitPane';

// Lazy-loaded heavy components — only downloaded when first opened
const LTPCalculator      = lazy(() => import('./components/Calculator/LTPCalculator'));
const LTPPopup           = lazy(() => import('./components/Calculator/LTPPopup'));
const ShiftingModal      = lazy(() => import('./components/Shifting/ShiftingModal'));
const SpotChartModal     = lazy(() => import('./components/Chart/SpotChartModal'));
const OIChartModal       = lazy(() => import('./components/Chart/OIChartModal'));
const OIChngModal        = lazy(() => import('./components/Chart/OIChngModal'));
const SplitChart         = lazy(() => import('./components/Chart/SplitChart'));
const SOCAIPanel         = lazy(() => import('./components/SOCAI/SOCAIPanel'));
const PowerAIStockPanel  = lazy(() => import('./components/PowerAI/PowerAIStockPanel'));
const HolidayListPanel   = lazy(() => import('./components/Info/HolidayListPanel'));
const SupportPanel       = lazy(() => import('./components/Info/SupportPanel'));
const ProfilePage        = lazy(() => import('./components/Profile/ProfilePage'));
const AdminPanel         = lazy(() => import('./components/admin/AdminPanel'));
const SubscriptionPage   = lazy(() => import('./components/Subscription/SubscriptionPage'));
const TradingJournal     = lazy(() => import('./components/Journal/TradingJournal'));
const TeamPage           = lazy(() => import('./components/Team/TeamPage'));
const NotificationPanel  = lazy(() => import('./components/Notifications/NotificationPanel'));
const AITrainPanel       = lazy(() => import('./components/AITrain/AITrainPanel'));
const AIStockPanel       = lazy(() => import('./components/AIStock/AIStockPanel'));
const JoinMeetPage       = lazy(() => import('./components/JoinMeet/JoinMeetPage'));
const HeatmapPage        = lazy(() => import('./components/Heatmap/HeatmapPage'));
const FIIDIIPage         = lazy(() => import('./components/FIIDII/FIIDIIPage'));

const API_BASE = process.env.REACT_APP_API_URL || '';

function AppContent() {
  const { state, dispatch, liveIntervalRef } = useApp();
  const favAppliedRef = useRef(false);

  // URL-based navigation on initial load
  useEffect(() => {
    const path = window.location.pathname;
    if (path === '/historical') {
      dispatch({ type: 'SET_HISTORICAL_MODE', payload: true });
      dispatch({ type: 'SET_INDEX_PAGE', payload: false });
    } else if (path === '/poweraistock') {
      dispatch({ type: 'SET_AI_PAGE', payload: { active: true, type: 'stock' } });
      dispatch({ type: 'SET_INDEX_PAGE', payload: false });
    } else if (path === '/holiday-list') {
      dispatch({ type: 'SET_HOLIDAY_LIST', payload: true });
    } else if (path === '/support') {
      dispatch({ type: 'SET_SUPPORT', payload: true });
    } else if (path === '/profile') {
      dispatch({ type: 'SET_PROFILE', payload: true });
    } else if (path === '/admin-panel') {
      dispatch({ type: 'SET_ADMIN_PANEL', payload: true });
    } else if (path === '/subscription') {
      dispatch({ type: 'SET_SUBSCRIPTION_PAGE', payload: true });
    } else if (path === '/journal') {
      dispatch({ type: 'SET_JOURNAL', payload: true });
    } else if (path === '/team') {
      dispatch({ type: 'SET_TEAM_PAGE', payload: true });
    } else if (path === '/ai-train') {
      dispatch({ type: 'SET_AI_TRAIN', payload: true });
    } else if (path === '/ai-stock') {
      dispatch({ type: 'SET_AI_STOCK', payload: true });
    } else if (path === '/join-meet') {
      dispatch({ type: 'SET_JOIN_MEET', payload: true });
    } else if (path === '/heatmap') {
      dispatch({ type: 'SET_HEATMAP', payload: true });
    } else if (path === '/fii-dii') {
      dispatch({ type: 'SET_FIIDII', payload: true });
    } else if (path === '/optionchain') {
      dispatch({ type: 'SET_INDEX_PAGE', payload: false });
      dispatch({ type: 'SET_HISTORICAL_MODE', payload: false });
    } else if (path === '/dashboard') {
      dispatch({ type: 'SET_INDEX_PAGE', payload: true });
    }
    // default (/ or /optionchain or any unmatched path) shows option chain
  }, [dispatch]);

  // Bootstrap — load from localStorage instantly, then refresh from server
  useEffect(() => {
    // 1. Show cached bootstrap immediately (zero network wait)
    try {
      const cached = localStorage.getItem('soc_bootstrap');
      if (cached) {
        const { user, settings, indicators, subscription } = JSON.parse(cached);
        if (user)         dispatch({ type: 'SET_USER',         payload: user });
        if (settings && Object.keys(settings).length > 0)
                          dispatch({ type: 'SET_UI_SETTINGS',  payload: settings });
        if (indicators)   dispatch({ type: 'SET_INDICATORS',   payload: indicators });
        if (subscription) dispatch({ type: 'SET_SUBSCRIPTION', payload: subscription });
      }
    } catch (_) {}

    // 2. Fetch fresh in background and update + re-cache
    Promise.all([
      fetch(`${API_BASE}/api/auth/bootstrap`, { credentials: 'include' }).then(r => r.json()).catch(() => null),
      fetch(`${API_BASE}/api/indicators`,     { credentials: 'include' }).then(r => r.json()).catch(() => null),
    ]).then(([boot, indData]) => {
      const toCache = {};

      if (indData?.success && indData.indicators) {
        dispatch({ type: 'SET_INDICATORS', payload: indData.indicators });
        toCache.indicators = indData.indicators;
      }

      if (boot?.authenticated && boot.user) {
        dispatch({ type: 'SET_USER', payload: boot.user });
        toCache.user = boot.user;
        if (boot.settings && Object.keys(boot.settings).length > 0) {
          dispatch({ type: 'SET_UI_SETTINGS', payload: boot.settings });
          toCache.settings = boot.settings;
        }
        if (boot.subscription) {
          dispatch({ type: 'SET_SUBSCRIPTION', payload: boot.subscription });
          toCache.subscription = boot.subscription;
        }
        if (boot.popup?.length > 0)
          dispatch({ type: 'SET_NOTIF_POPUP', payload: boot.popup });
        if (boot.unread > 0)
          dispatch({ type: 'SET_NOTIF_UNREAD', payload: boot.unread });
      }

      try { localStorage.setItem('soc_bootstrap', JSON.stringify(toCache)); } catch (_) {}
    });
  }, [dispatch]);

  // Load symbols + first symbol's live data in ONE round trip (/api/prefetch)
  // Previous approach: fetchSymbols() → wait → fetchLiveData() = 2 sequential RTTs
  // Now: one combined call returns both simultaneously = 1 RTT
  useEffect(() => {
    const init = async () => {
      try {
        const { liveSymbols, allSymbols, liveData, firstSymbol, groups } = await fetchPrefetch();

        if (liveSymbols.length > 0) {
          localStorage.setItem('soc_symbols', JSON.stringify(liveSymbols));
          dispatch({ type: 'SET_SYMBOLS', payload: liveSymbols });
          dispatch({ type: 'SET_CURRENT_SYMBOL', payload: firstSymbol || liveSymbols[0] });
        }
        if (allSymbols.length > 0) {
          dispatch({ type: 'SET_AVAILABLE_SYMBOLS', payload: allSymbols });
        }
        if (groups && Object.keys(groups).length > 0) {
          dispatch({ type: 'SET_SYMBOL_GROUPS', payload: groups });
        }
        // Seed live data immediately — user sees the table without a second round trip
        if (liveData) {
          dispatch({ type: 'SET_LIVE_DATA', payload: liveData });
        }
      } catch (err) {
        // Fallback to old two-step approach if prefetch fails
        try {
          const symbols = await fetchSymbols('live');
          if (symbols.length > 0) {
            localStorage.setItem('soc_symbols', JSON.stringify(symbols));
            dispatch({ type: 'SET_SYMBOLS', payload: symbols });
            dispatch({ type: 'SET_CURRENT_SYMBOL', payload: symbols[0] });
          }
          fetchSymbols('historical').then(all => {
            if (all.length > 0) dispatch({ type: 'SET_AVAILABLE_SYMBOLS', payload: all });
          }).catch(() => {});
        } catch (e) {
          dispatch({ type: 'SET_ERROR', payload: e.message });
        }
      }
    };
    init();
  }, [dispatch]);

  // Once user + symbols are both ready, auto-select first favourite symbol
  useEffect(() => {
    if (favAppliedRef.current) return;
    if (!state.user || !state.symbols.length) return;
    try {
      const key  = `sym_favs_${state.user.id || state.user.email || 'guest'}`;
      const favs = JSON.parse(localStorage.getItem(key) || '[]');
      const first = favs.find(f => state.symbols.includes(f));
      if (first) {
        dispatch({ type: 'SET_CURRENT_SYMBOL', payload: first });
        favAppliedRef.current = true;
      }
    } catch (_) {}
  }, [state.user, state.symbols, dispatch]);

  // ── Socket.io live stream — tick-by-tick via Dragonfly pub/sub ──────────
  const socketRef = useRef(null);
  const SOCKETIO_URL = '';

  useEffect(() => {
    if (!state.currentSymbol || state.historicalMode) return;

    // Connect socket.io once, reuse across symbol changes
    if (!socketRef.current) {
      const socket = io(SOCKETIO_URL, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionDelay: 1000,
      });
      socketRef.current = socket;

      socket.on('chain', (data) => {
        if (data && data.chain && data.chain.length > 0) {
          dispatch({ type: 'SET_LIVE_DATA', payload: data });
        }
      });

      socket.on('disconnect', () => {
        // On disconnect, fall back to REST to keep data visible
        fetchLiveData(state.currentSymbol)
          .then(data => dispatch({ type: 'SET_LIVE_DATA', payload: data }))
          .catch(() => {});
      });
    }

    const socket = socketRef.current;

    // Load initial snapshot — first from Dragonfly REST (instant), then live
    fetch(`/socketio/api/chain/${state.currentSymbol}`)
      .then(r => r.json())
      .then(data => { if (data && data.chain && data.chain.length > 0) dispatch({ type: 'SET_LIVE_DATA', payload: data }); })
      .catch(() => {
        // Dragonfly has no data yet — fall back to SSE
        fetchLiveData(state.currentSymbol)
          .then(data => dispatch({ type: 'SET_LIVE_DATA', payload: data }))
          .catch(() => {});
      });

    // Subscribe to this underlying's chain updates
    socket.emit('subscribe_chain', { underlying: state.currentSymbol });

    return () => {
      // Unsubscribe when symbol changes
      if (socketRef.current) {
        socketRef.current.emit('unsubscribe_chain', { underlying: state.currentSymbol });
      }
    };
  }, [state.currentSymbol, state.historicalMode, dispatch]);

  // Historical shifting data — only in historical mode (reads from disk, no polling needed)
  useEffect(() => {
    if (!state.currentSymbol || !state.historicalMode) return;
    const { currentExpiry, currentDataDate } = state;
    if (!currentExpiry || !currentDataDate || currentExpiry === '--' || currentDataDate === '--') return;
    fetchShiftingData(state.currentSymbol, currentExpiry, currentDataDate)
      .then(data => {
        const timeline = data?.timeline?.filter(e => e.time >= '09:15') || [];
        const resEntry = [...timeline].reverse().find(e => e.resistance?.shift) || timeline.at(-1);
        const supEntry = [...timeline].reverse().find(e => e.support?.shift) || timeline.at(-1);
        dispatch({ type: 'SET_SHIFTING_LEVELS', payload: {
          resistance: resEntry?.resistance ? { strike: resEntry.resistance.strike, shift: resEntry.resistance.shift || null, shiftFrom: resEntry.resistance.shiftFrom || null, time: resEntry.time || null, strength: resEntry.resistance.strength || null } : null,
          support: supEntry?.support ? { strike: supEntry.support.strike, shift: supEntry.support.shift || null, shiftFrom: supEntry.support.shiftFrom || null, time: supEntry.time || null, strength: supEntry.support.strength || null } : null,
          timeline,
        }});
        // Also load MCTR + strategy40 for historical
        fetchMCTRData(state.currentSymbol, currentExpiry, currentDataDate).then(d => {
          dispatch({ type: 'SET_MCTR', payload: {
            mctrSupport: d.mctr_support?.strike || null,
            mctrSupportRev: d.mctr_support?.reversal || null,
            mctrSupportTouched: d.mctr_support?.reversal_touched || false,
            mctrSupportFoundAt: d.mctr_support?.found_at || null,
            mctrResistance: d.mctr_resistance?.strike || null,
            mctrResistanceRev: d.mctr_resistance?.reversal || null,
            mctrResistanceTouched: d.mctr_resistance?.reversal_touched || false,
            mctrResistanceFoundAt: d.mctr_resistance?.found_at || null,
          }});
        }).catch(() => {});
        fetchStrategy40Data(state.currentSymbol, currentExpiry, currentDataDate).then(d => {
          dispatch({ type: 'SET_STRATEGY40', payload: {
            strategy40Support: d.support || null,
            strategy40SupportReversal: d.support_reversal || null,
            strategy40Resistance: d.resistance || null,
            strategy40ResistanceReversal: d.resistance_reversal || null,
            strategy40GapCutSupport: d.gap_cut_support || null,
            strategy40GapCutResistance: d.gap_cut_resistance || null,
          }});
        }).catch(() => {});
        dispatch({ type: 'SET_SIGNALS_LOADING', payload: false });
      })
      .catch(() => { dispatch({ type: 'SET_SIGNALS_LOADING', payload: false }); });
  }, [state.currentSymbol, state.historicalMode, state.currentExpiry, state.currentDataDate, dispatch]);

  // Live signals (shifting + MCTR + strategy40) — served from server RAM cache.
  // Option chain loads instantly. Signals follow after a 3 s head-start delay so
  // the table is visible immediately, then signals appear in the header.
  useEffect(() => {
    if (!state.currentSymbol || state.historicalMode) return;

    dispatch({ type: 'SET_SIGNALS_LOADING', payload: true });

    const loadSignals = async () => {
      try {
        const data = await fetchLiveSignals(state.currentSymbol);

        // Shifting levels
        const timeline = data.shifting?.timeline?.filter(e => e.time >= '09:15') || [];
        const resEntry = [...timeline].reverse().find(e => e.resistance?.shift) || timeline.at(-1);
        const supEntry = [...timeline].reverse().find(e => e.support?.shift) || timeline.at(-1);
        dispatch({ type: 'SET_SHIFTING_LEVELS', payload: {
          resistance: resEntry?.resistance ? { strike: resEntry.resistance.strike, shift: resEntry.resistance.shift || null, shiftFrom: resEntry.resistance.shiftFrom || null, time: resEntry.time || null, strength: resEntry.resistance.strength || null } : null,
          support: supEntry?.support ? { strike: supEntry.support.strike, shift: supEntry.support.shift || null, shiftFrom: supEntry.support.shiftFrom || null, time: supEntry.time || null, strength: supEntry.support.strength || null } : null,
          timeline,
        }});

        // MCTR
        if (data.mctr) {
          dispatch({ type: 'SET_MCTR', payload: {
            mctrSupport: data.mctr.mctr_support?.strike || null,
            mctrSupportRev: data.mctr.mctr_support?.reversal || null,
            mctrSupportTouched: data.mctr.mctr_support?.reversal_touched || false,
            mctrSupportFoundAt: data.mctr.mctr_support?.found_at || null,
            mctrResistance: data.mctr.mctr_resistance?.strike || null,
            mctrResistanceRev: data.mctr.mctr_resistance?.reversal || null,
            mctrResistanceTouched: data.mctr.mctr_resistance?.reversal_touched || false,
            mctrResistanceFoundAt: data.mctr.mctr_resistance?.found_at || null,
          }});
        }

        // Strategy 4.0 — show previous day's locked data (bromosYesterday), fallback to today's
        const bromos = data.bromosYesterday || data.strategy40;
        if (bromos) {
          // After 3:20 PM IST — today's strategy40 levels become tomorrow's Bromos preview
          const ist = new Date(Date.now() + 5.5 * 3600000);
          const istMins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
          const isAfter320 = istMins >= 15 * 60 + 20;
          const nextDay = isAfter320 && data.bromosYesterday && data.strategy40 ? data.strategy40 : null;

          dispatch({ type: 'SET_STRATEGY40', payload: {
            strategy40Support: bromos.support || null,
            strategy40SupportReversal: bromos.support_reversal || null,
            strategy40Resistance: bromos.resistance || null,
            strategy40ResistanceReversal: bromos.resistance_reversal || null,
            strategy40GapCutSupport: bromos.gap_cut_support || null,
            strategy40GapCutResistance: bromos.gap_cut_resistance || null,
            nextDayBromosR: nextDay?.resistance_reversal || null,
            nextDayBromosS: nextDay?.support_reversal || null,
          }});
        }

        dispatch({ type: 'SET_SIGNALS_LOADING', payload: false });
      } catch (_) {
        dispatch({ type: 'SET_SIGNALS_LOADING', payload: false });
      }
    };

    // Load signals immediately on symbol change
    const first = setTimeout(loadSignals, 0);
    const poll  = setInterval(loadSignals, 15000);

    return () => { clearTimeout(first); clearInterval(poll); };
  }, [state.currentSymbol, state.historicalMode, dispatch]);

  // Apply theme class to body
  useEffect(() => {
    document.body.className = '';
    if (state.theme === 'black') document.body.classList.add('black-theme');
    else if (state.theme === 'blue') document.body.classList.add('blue-theme');
    if (state.historicalMode) document.body.classList.add('historical-mode');
    if (state.splitScreenActive) document.body.classList.add('split-active');
  }, [state.theme, state.historicalMode, state.splitScreenActive]);

  // Update browser tab title based on active page
  useEffect(() => {
    const base = 'Soc.ai.in';
    let page = '';
    if (state.heatmapActive)       page = 'Stock Heatmap';
    else if (state.holidayListActive) page = 'Holiday List';
    else if (state.supportActive)  page = 'Support';
    else if (state.profileActive)  page = 'Profile';
    else if (state.adminPanelActive) page = 'Admin Panel';
    else if (state.subscriptionActive) page = 'Subscription';
    else if (state.journalActive)  page = 'Journal';
    else if (state.teamPageActive) page = 'Team';
    else if (state.aiTrainActive)  page = 'AI Train';
    else if (state.aiStockActive)  page = 'AI Stock';
    else if (state.aiPageActive && state.aiPageType === 'stock') page = 'Power AI Stock';
    else if (state.aiPageActive && state.aiPageType === 'swing') page = 'AI Swing Trade';
    else if (state.indexPageActive) page = 'Dashboard';
    else if (state.historicalMode) page = 'Historical';
    else page = 'Live Option Chain';
    document.title = `${base} | ${page}`;
  }, [
    state.heatmapActive, state.holidayListActive, state.supportActive, state.profileActive,
    state.adminPanelActive, state.subscriptionActive, state.journalActive,
    state.teamPageActive, state.aiTrainActive, state.aiStockActive, state.aiPageActive,
    state.aiPageType, state.indexPageActive, state.historicalMode,
  ]);

  // true when user has full access (admin/member always do; regular users need active sub)
  // null = still loading (subscription not yet resolved — don't show lock)
  const hasFullAccess = (() => {
    const role = state.user?.role;
    if (role === 'admin' || role === 'member') return true;
    if (state.subscription === null) return null; // still bootstrapping
    return state.subscription?.active === true;
  })();

  const renderMain = () => {
    if (state.heatmapActive)     return <HeatmapPage />;
    if (state.fiiDiiActive)      return <FIIDIIPage />;
    if (state.joinMeetActive)    return <JoinMeetPage />;
    if (state.holidayListActive) return <HolidayListPanel />;
    if (state.supportActive)     return <SupportPanel />;
    if (state.profileActive)     return <ProfilePage />;
    if (state.adminPanelActive)  return <AdminPanel />;
    if (state.subscriptionActive) return <SubscriptionPage />;
    if (state.journalActive)     return <TradingJournal />;
    if (state.teamPageActive)    return <TeamPage />;
    if (state.aiTrainActive)     return <AITrainPanel />;
    if (state.aiStockActive) {
      if (hasFullAccess === false) return (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100vh', background:'#f0f4f8', gap:20, padding:24, textAlign:'center' }}>
          <div style={{ fontSize:56 }}>🔒</div>
          <div style={{ fontSize:22, fontWeight:900, color:'#0d2137' }}>Subscription Required</div>
          <div style={{ fontSize:14, color:'#64748b', maxWidth:380 }}>AI Stock Signals require an active subscription. Historical data remains free.</div>
          <button onClick={() => { window.history.pushState(null,'','/subscription'); dispatch({ type:'SET_SUBSCRIPTION_PAGE', payload:true }); }} style={{ padding:'12px 32px', background:'linear-gradient(135deg,#ff6f00,#e65100)', color:'#fff', border:'none', borderRadius:10, fontSize:15, fontWeight:800, cursor:'pointer', marginTop:8 }}>View Plans →</button>
        </div>
      );
      return <AIStockPanel />;
    }
    if (state.aiPageActive && state.aiPageType === 'stock') {
      if (hasFullAccess === false) return (
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100vh', background:'#f0f4f8', gap:20, padding:24, textAlign:'center' }}>
          <div style={{ fontSize:56 }}>🔒</div>
          <div style={{ fontSize:22, fontWeight:900, color:'#0d2137' }}>Subscription Required</div>
          <div style={{ fontSize:14, color:'#64748b', maxWidth:380 }}>Power AI Stock requires an active subscription. Historical data remains free.</div>
          <button onClick={() => { window.history.pushState(null,'','/subscription'); dispatch({ type:'SET_SUBSCRIPTION_PAGE', payload:true }); }} style={{ padding:'12px 32px', background:'linear-gradient(135deg,#ff6f00,#e65100)', color:'#fff', border:'none', borderRadius:10, fontSize:15, fontWeight:800, cursor:'pointer', marginTop:8 }}>View Plans →</button>
        </div>
      );
      return <PowerAIStockPanel />;
    }
    if (state.indexPageActive)   return <IndexPage />;

    // ── Subscription lock — only covers #mainContent, topbar/sidebar stay visible ──
    // Historical past dates = free. Today's date (live or historical) = locked.
    const todayIST = new Date(Date.now() + 5.5 * 3600000).toISOString().split('T')[0];
    const isViewingToday = state.currentDataDate !== '--' && state.currentDataDate >= todayIST;
    const showLock = hasFullAccess === false && (!state.historicalMode || isViewingToday);
    const lockOverlay = showLock ? (
      <div style={{
        position: 'absolute', inset: 0, zIndex: 200,
        background: 'rgba(10,25,47,0.93)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 14, padding: 24, textAlign: 'center',
      }}>
        <div style={{ fontSize: 44, lineHeight: 1 }}>🔒</div>
        <div style={{ fontSize: 20, fontWeight: 900, color: '#fff' }}>
          {state.historicalMode ? "Today's Data Requires Subscription" : 'Subscription Required'}
        </div>
        <div style={{ fontSize: 13, color: '#94a3b8', maxWidth: 340, lineHeight: 1.6 }}>
          {state.historicalMode
            ? 'You can view all historical data for free. To view today\'s data, upgrade your plan.'
            : 'Live Option Chain requires an active subscription. All historical data is free.'}
        </div>
        <button
          onClick={() => {
            window.history.pushState(null, '', '/subscription');
            dispatch({ type: 'SET_SUBSCRIPTION_PAGE', payload: true });
          }}
          style={{
            padding: '10px 32px', background: 'linear-gradient(135deg,#ff6f00,#e65100)',
            color: '#fff', border: 'none', borderRadius: 8, fontSize: 14,
            fontWeight: 800, cursor: 'pointer', marginTop: 6,
          }}
        >
          View Plans →
        </button>
      </div>
    ) : null;

    if (state.splitScreenActive) {
      const mode = state.splitScreenMode;
      return (
        <>
          <div className="watermark">SOC.AI.IN</div>
          <LTPCalculator />
          <LTPPopup />
          <ShiftingModal />
          <SpotChartModal />
          <OIChartModal />
          <OIChngModal />
          <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
            <Topbar />
            <UISettings />
            <div id="mainContent" style={{ flex: 1, minHeight: 0, height: 'unset', padding: 0, overflowY: 'auto', overflowX: 'auto', position: 'relative' }}>
              {lockOverlay}
              {mode === 'chain' && <OptionChainTable />}
              {mode === 'split' && (
                <SplitPane
                  defaultSplit={65}
                  left={<OptionChainTable />}
                  right={<SplitChart />}
                />
              )}
              {mode === 'chart' && <SplitChart />}
            </div>
          </div>
          <Footer />
          <SOCAIPanel />
        </>
      );
    }

    return (
      <>
        <div className="watermark">SOC.AI.IN</div>
        <Topbar />
        <UISettings />
        <div id="mainContent" style={{ position: 'relative' }}>
          {lockOverlay}
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
      </>
    );
  };

  return (
    <Suspense fallback={null}>
      <SideNav />
      {renderMain()}
      <NotificationPanel />
      <NotifPopup />
    </Suspense>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
