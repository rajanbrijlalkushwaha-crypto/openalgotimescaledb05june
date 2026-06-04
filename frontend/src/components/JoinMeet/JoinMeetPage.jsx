import { useEffect, useState } from 'react';
import './JoinMeetPage.css';
import dpImg from '../../dp.png';
import oneoneImg from '../../oneone.png';
import { useApp } from '../../context/AppContext';

const API_BASE = process.env.REACT_APP_API_URL || '';

export default function JoinMeetPage() {
  const { state } = useApp();
  const [links, setLinks] = useState({ public_meet: '', community_meet: '' });

  const handleLogout = async () => {
    try { await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' }); } catch {}
    window.location.replace('/');
  };

  useEffect(() => {
    fetch(`${API_BASE}/api/meet-links`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.success) setLinks(d.links); })
      .catch(() => {});
  }, []);

  return (
    <div className="meet-page">
      <div className="meet-header">
        <div className="meet-header-logo">SOC<span>.AI.IN</span></div>
        <div className="meet-header-right">
          <span className="meet-header-user">{state.user?.name || state.user?.email || 'User'}</span>
          <button className="meet-header-logout" onClick={handleLogout}>Logout</button>
        </div>
      </div>
      <div className="meet-cards">

        {/* Public Meet */}
        <div className="meet-card">
          <img src={dpImg} alt="Public Meet" className="meet-illus-img" />
          <h2 className="meet-card-title">Post Market 8 PM to 10 PM</h2>
          <a
            className="meet-btn"
            href={links.public_meet || '#'}
            target="_blank"
            rel="noreferrer"
            onClick={e => { if (!links.public_meet) e.preventDefault(); }}
          >
            <span className="meet-btn-icon">
              <svg width="22" height="22" viewBox="0 0 48 48" fill="none">
                <rect width="48" height="48" rx="8" fill="#fff"/>
                <path d="M8 16h20v16H8z" fill="#00BCD4"/>
                <path d="M30 20l10-6v20l-10-6V20z" fill="#00BCD4"/>
              </svg>
            </span>
            Join Public Meet
          </a>
        </div>

        {/* Community Meet */}
        <div className="meet-card">
          <img src={oneoneImg} alt="Community Meet" className="meet-illus-img" />
          <h2 className="meet-card-title">Community Members Only</h2>
          <a
            className="meet-btn"
            href={links.community_meet || '#'}
            target="_blank"
            rel="noreferrer"
            onClick={e => { if (!links.community_meet) e.preventDefault(); }}
          >
            <span className="meet-btn-icon">
              <svg width="22" height="22" viewBox="0 0 48 48" fill="none">
                <rect width="48" height="48" rx="8" fill="#fff"/>
                <path d="M8 16h20v16H8z" fill="#00BCD4"/>
                <path d="M30 20l10-6v20l-10-6V20z" fill="#00BCD4"/>
              </svg>
            </span>
            Join Community Meet
          </a>
        </div>

      </div>
    </div>
  );
}
