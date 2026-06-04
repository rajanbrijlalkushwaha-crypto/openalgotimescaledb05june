import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import './NotificationPanel.css';

const API_BASE = process.env.REACT_APP_API_URL || '';

function fmtDate(iso) {
  return new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function NotificationPanel() {
  const { state, dispatch } = useApp();
  const [notifs, setNotifs] = useState([]);
  const [loading, setLoading] = useState(true);

  const close = () => dispatch({ type: 'SET_NOTIF_PANEL', payload: false });

  const load = () => {
    setLoading(true);
    fetch(`${API_BASE}/api/notifications`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setNotifs(d.notifications || []);
          const unread = (d.notifications || []).filter(n => !n.seen).length;
          dispatch({ type: 'SET_NOTIF_UNREAD', payload: unread });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { if (state.notifPanelOpen) load(); }, [state.notifPanelOpen]);

  const markAllRead = async () => {
    await fetch(`${API_BASE}/api/notifications/seen-all`, { method: 'POST', credentials: 'include' });
    setNotifs(prev => prev.map(n => ({ ...n, seen: true, seenCount: Math.max(5, n.seenCount) })));
    dispatch({ type: 'SET_NOTIF_UNREAD', payload: 0 });
  };

  const unread = notifs.filter(n => !n.seen).length;

  if (!state.notifPanelOpen) return null;

  return (
    <>
      <div className="notif-panel-backdrop" onClick={close} />
      <div className="notif-panel">
        <div className="notif-panel-header">
          <div className="notif-panel-title">🔔 Notifications</div>
          <div className="notif-panel-header-actions">
            {unread > 0 && (
              <button className="notif-mark-all-btn" onClick={markAllRead}>Mark all read</button>
            )}
            <button className="notif-panel-close" onClick={close}>✕</button>
          </div>
        </div>

        <div className="notif-panel-body">
          {loading ? (
            <div className="notif-empty">Loading...</div>
          ) : notifs.length === 0 ? (
            <div className="notif-empty">No notifications yet.</div>
          ) : notifs.map(n => (
            <div key={n.id} className={`notif-item${n.seen ? '' : ' notif-item-unread'}`}>
              <div className="notif-item-dot" />
              <div className="notif-item-body">
                {n.title && <div className="notif-item-title">{n.title}</div>}
                {n.message && <div className="notif-item-msg">{n.message}</div>}
                {n.hasFile && n.fileType !== 'application/pdf' && (
                  <div className="notif-item-img-wrap">
                    <img
                      className="notif-item-img"
                      src={`${API_BASE}/api/notifications/file/${n.id}`}
                      alt={n.fileName || 'attachment'}
                      onClick={() => window.open(`${API_BASE}/api/notifications/file/${n.id}`, '_blank')}
                    />
                  </div>
                )}
                {n.hasFile && n.fileType === 'application/pdf' && (
                  <a
                    className="notif-item-attach"
                    href={`${API_BASE}/api/notifications/file/${n.id}`}
                    download={n.fileName || 'document.pdf'}
                    target="_blank"
                    rel="noreferrer"
                  >
                    📄 Download PDF {n.fileName ? `— ${n.fileName}` : ''}
                  </a>
                )}
                <div className="notif-item-date">{fmtDate(n.createdAt)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
