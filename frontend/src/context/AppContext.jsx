import { createContext, useContext, useReducer, useRef, useEffect } from 'react';

const AppContext = createContext(null);

const initialState = {
  // Data
  symbols: [],
  symbolGroups: {},   // { 'NSE Index': [...], 'BSE Index': [...], 'NSE F&O': [...], 'MCX': [...] }
  currentSymbol: '',
  currentSpot: 0,
  spotVwap: 0,
  spotPrevClose: 0,
  spotChange: 0,
  spotPctChange: 0,
  futuresLtp: 0,
  futuresPrevClose: 0,
  futuresChange: 0,
  futuresPctChange: 0,
  currentExpiry: '--',
  currentDataDate: '--',
  currentTime: '--',
  lotSize: 1,
  chainData: [],
  chains: {},
  availableExpiries: [],
  selectedExpiry: null,

  // Toggles
  greeksActive: true,
  atmActive: true,
  indicatorsActive: false,
  ltpDisplayActive: true,
  volumeDisplayActive: true,
  oiDisplayActive: true,
  mmiDisplayActive: true,
  tableReversed: false,
  ltpCalcActive: false,
  volOiCngActive: false,

  // Historical Mode
  historicalMode: false,
  historicalSnapshots: [],
  currentSnapshotIndex: -1,
  availableSymbols: [],

  // Theme
  theme: 'white', // 'white' | 'blue' | 'black'

  // 4.0 Strategy / Broms
  strategy40Support: null,
  strategy40SupportReversal: null,
  strategy40Resistance: null,
  strategy40ResistanceReversal: null,
  strategy40GapCutSupport: null,
  strategy40GapCutResistance: null,
  nextDayBromosR: null,
  nextDayBromosS: null,
  shifted40Support: null,
  shifted40Resistance: null,
  original40Support: null,
  original40Resistance: null,

  // MCTR
  mctrSupport: null,
  mctrSupportRev: null,
  mctrSupportTouched: false,
  mctrSupportFoundAt: null,
  mctrResistance: null,
  mctrResistanceRev: null,
  mctrResistanceTouched: false,
  mctrResistanceFoundAt: null,

  // LTP Calculator
  selectedOption: null,
  ltpPopupOpen: false,

  // Shifting
  shiftingData: null,
  shiftingModalOpen: false,
  shiftingResistance: null,   // last resistance level from timeline
  shiftingSupport: null,      // last support level from timeline
  shiftingTimeline: [],       // full timeline for dynamic lookup by currentTime

  // Chart
  chartModalOpen: false,
  oiChartModalOpen: false,
  strikeDataChartModalOpen: false,
  cryptoOiChartModal: null,

  // Index / Dashboard page
  indexPageActive: false,

  // AI Page
  aiPageActive: false,
  aiPageType: null, // 'stock' | 'swing'

  // Info pages
  holidayListActive: false,
  supportActive: false,
  profileActive: false,
  adminPanelActive: false,
  subscriptionActive: false,
  journalActive: false,
  teamPageActive: false,
  aiTrainActive: false,
  aiStockActive: false,
  joinMeetActive: false,
  cryptoPageActive: false,
  heatmapActive: false,
  fiiDiiActive: false,

  // Notifications
  notifPanelOpen: false,
  notifUnread: 0,
  notifPopupList: [],    // unseen notifications for popup

  // SOC AI Panel
  socAIPanelOpen: false,

  // UI Menu
  uiMenuOpen: false,

  // User
  user: null,
  isAuthenticated: false,

  // Subscription
  subscription: null,   // { active, planName, endDate, daysLeft } or null

  // Indicator access config (loaded from /api/indicators)
  indicators: [],

  // Display format
  showInLakh: false,

  // VOL/OI Change tracker
  volOiCngData: {},      // { 5: {strike: {callVol,callOI,putVol,putOI}}, 15: {...}, 30: {...} }
  volOiCngWindow: 5,     // active time window: 5 | 15 | 30

  // Strong S/R reversal levels (drawn at reversal price, not strike)
  strongSupport: null,       // reversal price: 2+ maxes on put side
  strongResistance: null,    // reversal price: 2+ maxes on call side
  strong2ndSupport: null,    // reversal price: 1 max+1 second, or 2 seconds on put side
  strong2ndResistance: null, // reversal price: 1 max+1 second, or 2 seconds on call side

  // Split Screen
  splitScreenActive: true,
  splitScreenMode: 'split', // 'off' | 'split' | 'chart' | 'chain'

  // Loading
  loading: true,
  signalsLoading: true,  // true until first signal batch arrives
  error: null,
};

function patchOpt(opt, t) {
  if (!opt) return opt;
  const u = { ...opt };
  if (t.ltp    != null) { u.ltp_change = +(t.ltp - (opt.ltp || t.ltp)).toFixed(2); u.ltp = t.ltp; }
  if (t.oi     != null) u.oi = t.oi;
  if (t.oi_chg != null) u.oi_change = t.oi_chg;
  if (t.volume != null) u.volume = t.volume;
  if (t.delta  != null) u.delta  = t.delta;
  if (t.iv     != null) u.iv     = t.iv;
  if (t.gamma  != null) u.gamma  = t.gamma;
  if (t.theta  != null) u.theta  = t.theta;
  if (t.vega   != null) u.vega   = t.vega;
  return u;
}

function appReducer(state, action) {
  switch (action.type) {
    case 'SET_SYMBOLS':
      return { ...state, symbols: action.payload, availableSymbols: action.payload };
    case 'SET_SYMBOL_GROUPS':
      return { ...state, symbolGroups: action.payload };
    case 'SET_AVAILABLE_SYMBOLS':
      return { ...state, availableSymbols: action.payload };
    case 'SET_CURRENT_SYMBOL':
      return { ...state, currentSymbol: action.payload, signalsLoading: true,
        selectedExpiry: null, availableExpiries: [],
        mctrSupport: null, mctrResistance: null,
        shiftingResistance: null, shiftingSupport: null, shiftingTimeline: [],
        strategy40Support: null, strategy40Resistance: null,
        nextDayBromosR: null, nextDayBromosS: null,
        strongSupport: null, strongResistance: null,
        strong2ndSupport: null, strong2ndResistance: null };
    case 'SET_SELECTED_EXPIRY': {
      const expiry    = action.payload;
      const chainData = state.chains[expiry] || state.chainData;
      return { ...state, selectedExpiry: expiry, chainData };
    }
    case 'SET_LIVE_DATA': {
      const incomingChains   = action.payload.chains || (action.payload.chain ? { [action.payload.expiry]: action.payload.chain } : {});
      const incomingExpiries = action.payload.availableExpiries || (action.payload.expiry ? [action.payload.expiry] : []);
      const mergedChains     = { ...state.chains, ...incomingChains };
      const sel              = state.selectedExpiry;
      const chainData        = (sel && mergedChains[sel]) ? mergedChains[sel] : (action.payload.chain || []);
      return {
        ...state,
        loading: false,
        currentSpot:       action.payload.spot_price        || 0,
        spotVwap:          action.payload.spot_vwap          || 0,
        spotPrevClose:     action.payload.spot_prev_close    || 0,
        spotChange:        action.payload.spot_change        || 0,
        spotPctChange:     action.payload.spot_pct_change    || 0,
        futuresLtp:        action.payload.futures_ltp        || 0,
        futuresPrevClose:  action.payload.futures_prev_close || 0,
        futuresChange:     action.payload.futures_change     || 0,
        futuresPctChange:  action.payload.futures_pct_change || 0,
        chainData,
        chains:            mergedChains,
        availableExpiries: incomingExpiries.length ? incomingExpiries : state.availableExpiries,
        currentExpiry:     action.payload.expiry             || '--',
        currentDataDate:   action.payload.date               || '--',
        currentTime:       action.payload.time               || '--',
        lotSize:           action.payload.lot_size           || 1,
      };
    }
    case 'SET_LOT_SIZE':
      return { ...state, lotSize: action.payload };
    case 'SET_CHAIN_DATA':
      return { ...state, chainData: action.payload };
    case 'SET_SPOT':
      return { ...state, currentSpot: action.payload };
    case 'SET_WS_CONNECTED':
      return { ...state, wsConnected: action.payload };
    case 'PATCH_TICK': {
      const t = action.payload;
      if (!state.chainData?.length) return state;
      // Match by underlying+expiry+strike+side (works for NSE, BSE, MCX regardless of symbol naming)
      if (t.underlying && t.expiry && t.strike != null && t.side) {
        if (t.underlying !== state.currentSymbol || t.expiry !== state.currentExpiry) return state;
        const next = state.chainData.map(row => {
          if (row.strike !== t.strike) return row;
          if (t.side === 'ce') return { ...row, call: patchOpt(row.call, t) };
          if (t.side === 'pe') return { ...row, put:  patchOpt(row.put,  t) };
          return row;
        });
        return { ...state, chainData: next };
      }
      // Fallback: match by symbol string (legacy)
      const sym = t.symbol || '';
      const next = state.chainData.map(row => {
        const cs = state.currentSymbol, ce = state.currentExpiry;
        if (!cs || !ce) return row;
        const ceSym = `${cs}${ce}${row.strike}CE`;
        const peSym = `${cs}${ce}${row.strike}PE`;
        if (sym === ceSym) return { ...row, call: patchOpt(row.call, t) };
        if (sym === peSym) return { ...row, put:  patchOpt(row.put,  t) };
        return row;
      });
      return { ...state, chainData: next };
    }
    case 'TOGGLE_GREEKS':
      return { ...state, greeksActive: !state.greeksActive };
    case 'TOGGLE_ATM':
      return { ...state, atmActive: !state.atmActive };
    case 'TOGGLE_INDICATORS':
      return { ...state, indicatorsActive: !state.indicatorsActive };
    case 'TOGGLE_LTP_DISPLAY':
      return { ...state, ltpDisplayActive: !state.ltpDisplayActive };
    case 'TOGGLE_VOLUME':
      return { ...state, volumeDisplayActive: !state.volumeDisplayActive };
    case 'TOGGLE_OI':
      return { ...state, oiDisplayActive: !state.oiDisplayActive };
    case 'TOGGLE_MMI':
      return { ...state, mmiDisplayActive: !state.mmiDisplayActive };
    case 'TOGGLE_VOLOICHNG_DISPLAY':
      return { ...state, volOiCngActive: !state.volOiCngActive };
    case 'TOGGLE_REVERSE':
      return { ...state, tableReversed: !state.tableReversed };
    case 'TOGGLE_LTP_CALC':
      return { ...state, ltpCalcActive: !state.ltpCalcActive };
    case 'TOGGLE_HISTORICAL':
      return { ...state, historicalMode: !state.historicalMode };
    case 'SET_HISTORICAL_MODE':
      return { ...state, historicalMode: action.payload };
    case 'SET_THEME':
      return { ...state, theme: action.payload };
    case 'SET_STRATEGY40':
      return { ...state, ...action.payload };
    case 'SET_MCTR':
      return { ...state, ...action.payload };
    case 'SET_SIGNALS_LOADING':
      return { ...state, signalsLoading: action.payload };
    case 'SET_SELECTED_OPTION':
      return { ...state, selectedOption: action.payload };
    case 'OPEN_LTP_POPUP':
      return { ...state, selectedOption: action.payload, ltpPopupOpen: true };
    case 'CLOSE_LTP_POPUP':
      return { ...state, ltpPopupOpen: false };
    case 'SET_SHIFTING_DATA':
      return { ...state, shiftingData: action.payload };
    case 'TOGGLE_SHIFTING_MODAL':
      return { ...state, shiftingModalOpen: !state.shiftingModalOpen };
    case 'SET_SHIFTING_MODAL':
      return { ...state, shiftingModalOpen: action.payload };
    case 'TOGGLE_CHART_MODAL':
      return { ...state, chartModalOpen: !state.chartModalOpen };
    case 'SET_CHART_MODAL':
      return { ...state, chartModalOpen: action.payload };
    case 'SET_OI_CHART_MODAL':
      return { ...state, oiChartModalOpen: action.payload };
    case 'SET_CRYPTO_OI_CHART_MODAL':
      return { ...state, cryptoOiChartModal: action.payload };
    case 'SET_STRIKE_DATA_CHART_MODAL':
      return { ...state, strikeDataChartModalOpen: action.payload };
    case 'SET_INDEX_PAGE':
      return { ...state, indexPageActive: action.payload, cryptoPageActive: false, aiTrainActive: false, aiStockActive: false, holidayListActive: false, supportActive: false, profileActive: false, adminPanelActive: false, subscriptionActive: false, journalActive: false, teamPageActive: false };
    case 'SET_AI_PAGE':
      return { ...state, aiPageActive: action.payload.active, aiPageType: action.payload.type || null, aiTrainActive: false, aiStockActive: false, holidayListActive: false, supportActive: false, profileActive: false, adminPanelActive: false, subscriptionActive: false, journalActive: false, teamPageActive: false };
    case 'SET_HOLIDAY_LIST':
      return action.payload
        ? { ...state, holidayListActive: true, aiTrainActive: false, aiStockActive: false, supportActive: false, profileActive: false, adminPanelActive: false, subscriptionActive: false, journalActive: false, teamPageActive: false, aiPageActive: false, indexPageActive: false }
        : { ...state, holidayListActive: false };
    case 'SET_SUPPORT':
      return action.payload
        ? { ...state, supportActive: true, aiTrainActive: false, aiStockActive: false, holidayListActive: false, profileActive: false, adminPanelActive: false, subscriptionActive: false, journalActive: false, teamPageActive: false, aiPageActive: false, indexPageActive: false }
        : { ...state, supportActive: false };
    case 'SET_PROFILE':
      return action.payload
        ? { ...state, profileActive: true, aiTrainActive: false, aiStockActive: false, holidayListActive: false, supportActive: false, adminPanelActive: false, subscriptionActive: false, journalActive: false, teamPageActive: false, aiPageActive: false, indexPageActive: false }
        : { ...state, profileActive: false };
    case 'SET_ADMIN_PANEL':
      return action.payload
        ? { ...state, adminPanelActive: true, aiTrainActive: false, aiStockActive: false, profileActive: false, holidayListActive: false, supportActive: false, subscriptionActive: false, journalActive: false, teamPageActive: false, aiPageActive: false, indexPageActive: false }
        : { ...state, adminPanelActive: false };
    case 'SET_SUBSCRIPTION':
      // Stores subscription data object into state — does NOT navigate
      return { ...state, subscription: action.payload };
    case 'SET_SUBSCRIPTION_PAGE':
      return action.payload
        ? { ...state, subscriptionActive: true, aiTrainActive: false, aiStockActive: false, profileActive: false, adminPanelActive: false, holidayListActive: false, supportActive: false, journalActive: false, teamPageActive: false, aiPageActive: false, indexPageActive: false }
        : { ...state, subscriptionActive: false };
    case 'SET_JOURNAL':
      return action.payload
        ? { ...state, journalActive: true, aiTrainActive: false, aiStockActive: false, profileActive: false, adminPanelActive: false, subscriptionActive: false, holidayListActive: false, supportActive: false, teamPageActive: false, aiPageActive: false, indexPageActive: false }
        : { ...state, journalActive: false };
    case 'SET_TEAM_PAGE':
      return action.payload
        ? { ...state, teamPageActive: true, aiTrainActive: false, aiStockActive: false, journalActive: false, profileActive: false, adminPanelActive: false, subscriptionActive: false, holidayListActive: false, supportActive: false, aiPageActive: false, indexPageActive: false }
        : { ...state, teamPageActive: false };
    case 'SET_AI_TRAIN':
      return action.payload
        ? { ...state, aiTrainActive: true, aiStockActive: false, teamPageActive: false, journalActive: false, profileActive: false, adminPanelActive: false, subscriptionActive: false, holidayListActive: false, supportActive: false, aiPageActive: false, indexPageActive: false }
        : { ...state, aiTrainActive: false };
    case 'SET_AI_STOCK':
      return action.payload
        ? { ...state, aiStockActive: true, aiTrainActive: false, teamPageActive: false, journalActive: false, profileActive: false, adminPanelActive: false, subscriptionActive: false, holidayListActive: false, supportActive: false, aiPageActive: false, indexPageActive: false }
        : { ...state, aiStockActive: false };
    case 'SET_JOIN_MEET':
      return action.payload
        ? { ...state, joinMeetActive: true, cryptoPageActive: false, aiStockActive: false, aiTrainActive: false, teamPageActive: false, journalActive: false, profileActive: false, adminPanelActive: false, subscriptionActive: false, holidayListActive: false, supportActive: false, aiPageActive: false, indexPageActive: false }
        : { ...state, joinMeetActive: false };
    case 'SET_CRYPTO_PAGE':
      return action.payload
        ? { ...state, cryptoPageActive: true, joinMeetActive: false, aiStockActive: false, aiTrainActive: false, teamPageActive: false, journalActive: false, profileActive: false, adminPanelActive: false, subscriptionActive: false, holidayListActive: false, supportActive: false, aiPageActive: false, indexPageActive: false }
        : { ...state, cryptoPageActive: false };
    case 'SET_HEATMAP':
      return action.payload
        ? { ...state, heatmapActive: true, fiiDiiActive: false, cryptoPageActive: false, joinMeetActive: false, aiStockActive: false, aiTrainActive: false, teamPageActive: false, journalActive: false, profileActive: false, adminPanelActive: false, subscriptionActive: false, holidayListActive: false, supportActive: false, aiPageActive: false, indexPageActive: false }
        : { ...state, heatmapActive: false };
    case 'SET_FIIDII':
      return action.payload
        ? { ...state, fiiDiiActive: true, heatmapActive: false, cryptoPageActive: false, joinMeetActive: false, aiStockActive: false, aiTrainActive: false, teamPageActive: false, journalActive: false, profileActive: false, adminPanelActive: false, subscriptionActive: false, holidayListActive: false, supportActive: false, aiPageActive: false, indexPageActive: false }
        : { ...state, fiiDiiActive: false };
    case 'SET_NOTIF_PANEL':
      return { ...state, notifPanelOpen: action.payload };
    case 'SET_NOTIF_UNREAD':
      return { ...state, notifUnread: action.payload };
    case 'SET_NOTIF_POPUP':
      return { ...state, notifPopupList: action.payload };
    case 'TOGGLE_SOC_AI':
      return { ...state, socAIPanelOpen: !state.socAIPanelOpen };
    case 'SET_SOC_AI':
      return { ...state, socAIPanelOpen: action.payload };
    case 'TOGGLE_SPLIT_SCREEN': {
      const next = state.splitScreenMode === 'off'   ? 'split'
                 : state.splitScreenMode === 'split' ? 'chart'
                 : 'off';
      return { ...state, splitScreenMode: next, splitScreenActive: next !== 'off' };
    }
    case 'SET_SPLIT_MODE': {
      const m = action.payload; // 'chain' | 'split' | 'chart'
      return { ...state, splitScreenMode: m, splitScreenActive: true };
    }
    case 'SET_STRONG_SR':
      return { ...state,
        strongSupport:       action.payload.support,
        strongResistance:    action.payload.resistance,
        strong2ndSupport:    action.payload.support2nd,
        strong2ndResistance: action.payload.resistance2nd,
      };
    case 'TOGGLE_UI_MENU':
      return { ...state, uiMenuOpen: !state.uiMenuOpen };
    case 'SET_UI_MENU':
      return { ...state, uiMenuOpen: action.payload };
    case 'SET_HISTORICAL_SNAPSHOTS':
      return { ...state, historicalSnapshots: action.payload };
    case 'SET_SNAPSHOT_INDEX':
      return { ...state, currentSnapshotIndex: action.payload };
    case 'SET_USER':
      return { ...state, user: action.payload, isAuthenticated: !!action.payload };
    case 'SET_SUBSCRIPTION':
      return { ...state, subscription: action.payload };
    case 'SET_INDICATORS':
      return { ...state, indicators: action.payload };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'SET_EXPIRY':
      return { ...state, currentExpiry: action.payload };
    case 'SET_DATA_DATE':
      return { ...state, currentDataDate: action.payload };
    case 'SET_TIME':
      return { ...state, currentTime: action.payload };
    case 'SET_SHIFTING_LEVELS':
      return { ...state, shiftingResistance: action.payload.resistance, shiftingSupport: action.payload.support, shiftingTimeline: action.payload.timeline || state.shiftingTimeline };
    case 'TOGGLE_SHOW_IN_LAKH':
      return { ...state, showInLakh: !state.showInLakh };
    case 'SET_VOLOICHNG_DATA':
      return { ...state, volOiCngData: action.payload };
    case 'CYCLE_VOLOICHNG_WINDOW': {
      const windows = [5, 15, 30];
      const next = windows[(windows.indexOf(state.volOiCngWindow) + 1) % windows.length];
      return { ...state, volOiCngWindow: next };
    }
    case 'SET_UI_SETTINGS': {
      const s = action.payload;
      return {
        ...state,
        greeksActive:       s.greeksActive       !== undefined ? s.greeksActive       : state.greeksActive,
        atmActive:          s.atmActive           !== undefined ? s.atmActive           : state.atmActive,
        indicatorsActive:   false, // always off on load regardless of saved preference
        ltpDisplayActive:   s.ltpDisplayActive    !== undefined ? s.ltpDisplayActive    : state.ltpDisplayActive,
        volumeDisplayActive:s.volumeDisplayActive !== undefined ? s.volumeDisplayActive : state.volumeDisplayActive,
        oiDisplayActive:    s.oiDisplayActive     !== undefined ? s.oiDisplayActive     : state.oiDisplayActive,
        mmiDisplayActive:   s.mmiDisplayActive    !== undefined ? s.mmiDisplayActive    : state.mmiDisplayActive,
        tableReversed:      s.tableReversed       !== undefined ? s.tableReversed       : state.tableReversed,
        ltpCalcActive:      s.ltpCalcActive       !== undefined ? s.ltpCalcActive       : state.ltpCalcActive,
        showInLakh:         s.showInLakh          !== undefined ? s.showInLakh          : state.showInLakh,
        volOiCngActive:     s.volOiCngActive      !== undefined ? s.volOiCngActive      : state.volOiCngActive,
        theme:              s.theme               !== undefined ? s.theme               : state.theme,
      };
    }
    default:
      return state;
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const liveIntervalRef = useRef(null);

  // Detect session invalidated from another device — auto-logout
  useEffect(() => {
    const origFetch = window.fetch;
    window.fetch = async (...args) => {
      const resp = await origFetch(...args);
      if (resp.status === 401) {
        try {
          const clone = resp.clone();
          const data = await clone.json();
          if (data?.code === 'SESSION_INVALIDATED') {
            localStorage.removeItem('soc_bootstrap');
            dispatch({ type: 'SET_USER', payload: null });
          }
        } catch (_) {}
      }
      return resp;
    };
    return () => { window.fetch = origFetch; };
  }, []);

  return (
    <AppContext.Provider value={{ state, dispatch, liveIntervalRef }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

export default AppContext;