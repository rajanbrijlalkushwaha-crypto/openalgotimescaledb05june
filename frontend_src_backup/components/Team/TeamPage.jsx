import { useState, useEffect } from 'react';
import './TeamPage.css';

const API_BASE = process.env.REACT_APP_API_URL || '';

function useBodyScroll() {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'auto';
    return () => { document.body.style.overflow = prev || ''; };
  }, []);
}

export default function TeamPage() {
  useBodyScroll();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/team`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.success) setMembers(d.members || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const initials = (name) =>
    name ? name.trim().split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() : '?';

  return (
    <div className="team-page">

      {/* ── Header ── */}
      <div className="team-header">
        <span className="team-header-icon">🤝</span>
        <div>
          <div className="team-header-title">Our Team</div>
          <div className="team-header-sub">The people behind soc.ai.in</div>
        </div>
      </div>

      <div className="team-body">
        {loading ? (
          <div className="team-loading">Loading team...</div>
        ) : members.length === 0 ? (
          <div className="team-empty">No team members added yet.</div>
        ) : (
          <div className="team-grid">
            {members.map(m => (
              <div key={m.id} className="team-member-card">
                <div className="team-member-avatar">
                  {m.hasPhoto
                    ? <img src={`${API_BASE}/api/team/photo/${m.id}?t=1`} alt={m.name} className="team-member-avatar-img" />
                    : <span className="team-member-avatar-init">{initials(m.name)}</span>
                  }
                </div>
                <div className="team-member-name">{m.name}</div>
                {m.designation && <div className="team-member-desig">{m.designation}</div>}
                {m.experience  && <div className="team-member-exp">🏆 {m.experience}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
