import './XPLoader.css';

export default function XPLoader({ text = 'Loading data...' }) {
  return (
    <div className="xp-overlay">
      <div className="xp-box">
        <div className="xp-logo">
          <span className="xp-logo-soc">SOC</span>
          <span className="xp-logo-tick">tick</span>
          <span className="xp-logo-data">data</span>
        </div>

        <p className="xp-text">{text}</p>

        <div className="xp-bar-wrap">
          <div className="xp-bar">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="xp-seg" style={{ animationDelay: `${i * 0.12}s` }} />
            ))}
          </div>
        </div>

        <p className="xp-sub">Please wait</p>
      </div>
    </div>
  );
}
