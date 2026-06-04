import { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';

const EXCHANGE_ORDER = ['NSE Index', 'BSE Index', 'NSE F&O', 'MCX'];

const FALLBACK_GROUPS = {
  'NSE Index': ['NIFTY', 'BANKNIFTY', 'MIDCPNIFTY', 'FINNIFTY'],
  'BSE Index': ['SENSEX', 'BANKEX'],
  'MCX': ['CRUDEOIL', 'GOLD', 'GOLDM', 'SILVER', 'SILVERM', 'NATURALGAS', 'COPPER', 'ZINC', 'NICKEL'],
  'NSE F&O': [],
};

function exchangeOf(sym, groups) {
  for (const [exch, list] of Object.entries(groups)) {
    if (list.includes(sym)) return exch;
  }
  return 'NSE F&O';
}

export default function SymbolSelect() {
  const { state, dispatch } = useApp();
  const [open, setOpen]         = useState(false);
  const [activeExch, setActiveExch] = useState('NSE Index');
  const ref = useRef();

  const groups = (state.symbolGroups && Object.keys(state.symbolGroups).length > 0)
    ? state.symbolGroups
    : FALLBACK_GROUPS;

  // Sync exchange tab when symbol changes externally
  useEffect(() => {
    if (state.currentSymbol) {
      setActiveExch(exchangeOf(state.currentSymbol, groups));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentSymbol]);

  const selectSymbol = (sym) => {
    dispatch({ type: 'SET_CURRENT_SYMBOL', payload: sym });
    setOpen(false);
  };

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const currentExch = exchangeOf(state.currentSymbol, groups);
  const symList = groups[activeExch] || [];

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          fontSize: '14px', fontWeight: 700, padding: '4px 10px',
          background: 'white', color: '#111', border: '1px solid #ccc',
          borderRadius: '5px', cursor: 'pointer', display: 'flex',
          alignItems: 'center', gap: '6px', minWidth: '150px',
        }}
      >
        <span style={{ fontSize: 10, color: '#888', fontWeight: 400 }}>{currentExch}</span>
        <span style={{ flex: 1 }}>{state.currentSymbol?.replace(/_/g, ' ') || 'Select…'}</span>
        <span style={{ fontSize: '10px' }}>▼</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, zIndex: 9999,
          background: '#fff', border: '1px solid #ddd', borderRadius: '8px',
          boxShadow: '0 6px 24px rgba(0,0,0,0.18)',
          minWidth: '240px', marginTop: '4px',
        }}>
          {/* Exchange tabs */}
          <div style={{
            display: 'flex', borderBottom: '1px solid #eee',
            background: '#f8f8f8', borderRadius: '8px 8px 0 0',
          }}>
            {EXCHANGE_ORDER.filter(e => groups[e] && groups[e].length > 0).map(exch => (
              <button
                key={exch}
                onClick={() => setActiveExch(exch)}
                style={{
                  flex: 1, padding: '7px 4px', fontSize: '10px', fontWeight: 700,
                  border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                  background: activeExch === exch ? '#fff' : 'transparent',
                  color: activeExch === exch ? '#e65100' : '#666',
                  borderBottom: activeExch === exch ? '2px solid #e65100' : '2px solid transparent',
                }}
              >
                {exch}
              </button>
            ))}
          </div>

          {/* Symbol list */}
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {symList.map(sym => {
              const isActive = sym === state.currentSymbol;
              return (
                <div
                  key={sym}
                  onClick={() => selectSymbol(sym)}
                  style={{
                    padding: '7px 14px', cursor: 'pointer', fontSize: '13px',
                    fontWeight: isActive ? 700 : 400,
                    background: isActive ? '#fff3e0' : 'white',
                    color: isActive ? '#e65100' : '#222',
                    borderLeft: isActive ? '3px solid #e65100' : '3px solid transparent',
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#f5f5f5'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = isActive ? '#fff3e0' : 'white'; }}
                >
                  {sym.replace(/_/g, ' ')}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
