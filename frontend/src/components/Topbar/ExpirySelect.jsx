import { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';

export default function ExpirySelect() {
  const { state, dispatch } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef();

  const activeExpiry = state.selectedExpiry || state.currentExpiry;

  const selectExpiry = (exp) => {
    dispatch({ type: 'SET_SELECTED_EXPIRY', payload: exp });
    setOpen(false);
  };

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (state.availableExpiries.length <= 1) {
    return <span style={{ color: '#1976d2' }}>{state.currentExpiry}</span>;
  }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          fontSize: '15px', fontWeight: 'bold', padding: '4px 10px',
          background: 'white', color: 'black', border: '1px solid #ccc',
          borderRadius: '5px', cursor: 'pointer', display: 'flex',
          alignItems: 'center', gap: '6px', minWidth: '120px',
        }}
      >
        {activeExpiry || 'Select…'}
        <span style={{ fontSize: '10px', marginLeft: 'auto' }}>▼</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, zIndex: 9999,
          background: '#fff', border: '1px solid #ccc', borderRadius: '6px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)', minWidth: '150px',
          maxHeight: '320px', overflowY: 'auto', marginTop: '2px',
        }}>
          {state.availableExpiries.map(exp => {
            const isActive = exp === activeExpiry;
            return (
              <div
                key={exp}
                onClick={() => selectExpiry(exp)}
                style={{
                  padding: '7px 12px', cursor: 'pointer',
                  background: isActive ? '#fff3e0' : 'white',
                  fontWeight: isActive ? 700 : 400,
                  fontSize: '14px',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#f5f5f5'; }}
                onMouseLeave={e => { e.currentTarget.style.background = isActive ? '#fff3e0' : 'white'; }}
              >
                {exp}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
