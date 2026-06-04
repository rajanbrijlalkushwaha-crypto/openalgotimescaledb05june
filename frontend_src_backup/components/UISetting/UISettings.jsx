import { useApp } from '../../context/AppContext';
import './UISettings.css';

const TOGGLES = [
  { label: 'Greeks',        stateKey: 'greeksActive',      action: 'TOGGLE_GREEKS' },
  { label: 'ATM Highlight', stateKey: 'atmActive',         action: 'TOGGLE_ATM' },
  { label: 'Indicators',    stateKey: 'indicatorsActive',  action: 'TOGGLE_INDICATORS' },
  { label: 'LTP Display',   stateKey: 'ltpDisplayActive',  action: 'TOGGLE_LTP_DISPLAY' },
  { label: 'Volume',        stateKey: 'volumeDisplayActive', action: 'TOGGLE_VOLUME' },
  { label: 'OI Display',    stateKey: 'oiDisplayActive',   action: 'TOGGLE_OI' },
  { label: 'Vol/OI Chng',  stateKey: 'volOiCngActive',    action: 'TOGGLE_VOLOICHNG_DISPLAY' },
  { label: 'MMI Display',   stateKey: 'mmiDisplayActive',  action: 'TOGGLE_MMI' },
  { label: 'Reverse Table', stateKey: 'tableReversed',     action: 'TOGGLE_REVERSE' },
  { label: 'LTP Calculator',stateKey: 'ltpCalcActive',     action: 'TOGGLE_LTP_CALC' },
  { label: 'Show in Lakh', stateKey: 'showInLakh',        action: 'TOGGLE_SHOW_IN_LAKH' },
];

const THEMES = [
  { value: 'white', label: 'Light' },
  { value: 'blue',  label: 'Blue' },
  { value: 'black', label: 'Dark' },
];

export default function UISettings() {
  const { state, dispatch } = useApp();

  if (!state.uiMenuOpen) return null;

  return (
    <>
      <div className="ui-settings-backdrop" onClick={() => dispatch({ type: 'SET_UI_MENU', payload: false })} />
      <div className="ui-settings-panel">
        <div className="ui-settings-header">
          <span>Display Settings</span>
          <button className="ui-settings-close" onClick={() => dispatch({ type: 'SET_UI_MENU', payload: false })}>✕</button>
        </div>

        <div className="ui-settings-section">
          <div className="ui-settings-section-label">Theme</div>
          <div className="ui-theme-row">
            {THEMES.map(t => (
              <button
                key={t.value}
                className={`ui-theme-btn${state.theme === t.value ? ' active' : ''}`}
                onClick={() => dispatch({ type: 'SET_THEME', payload: t.value })}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="ui-settings-section">
          <div className="ui-settings-section-label">Toggles</div>
          {TOGGLES.map(({ label, stateKey, action }) => (
            <div key={action} className="ui-toggle-row">
              <span>{label}</span>
              <button
                className={`ui-toggle${state[stateKey] ? ' on' : ''}`}
                onClick={() => dispatch({ type: action })}
              >
                <span className="ui-toggle-thumb" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
