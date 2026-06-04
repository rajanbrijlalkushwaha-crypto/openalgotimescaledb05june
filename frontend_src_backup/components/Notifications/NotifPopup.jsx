import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import './NotifPopup.css';

const API_BASE = process.env.REACT_APP_API_URL || '';

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function NotifPopup() {
  const { state, dispatch } = useApp();
  const [idx, setIdx] = useState(0);

  const list = state.notifPopupList || [];
  if (list.length === 0) return null;

  const notif = list[idx];
  if (!notif) return null;

  const markSeen = async (id) => {
    await fetch(`${API_BASE}/api/notifications/${id}/seen`, { method: 'POST', credentials: 'include' }).catch(() => {});
  };

  const dismiss = async () => {
    await markSeen(notif.id);
    if (idx < list.length - 1) {
      setIdx(i => i + 1);
    } else {
      dispatch({ type: 'SET_NOTIF_POPUP', payload: [] });
      // refresh unread count
      fetch(`${API_BASE}/api/notifications`, { credentials: 'include' })
        .then(r => r.json())
        .then(d => {
          if (d.success) {
            const unread = (d.notifications || []).filter(n => !n.seen).length;
            dispatch({ type: 'SET_NOTIF_UNREAD', payload: unread });
          }
        }).catch(() => {});
    }
  };

  const skip = async () => {
    await markSeen(notif.id);
    if (idx < list.length - 1) setIdx(i => i + 1);
    else { dispatch({ type: 'SET_NOTIF_POPUP', payload: [] }); }
  };

  const closeAll = () => {
    list.forEach(n => markSeen(n.id));
    dispatch({ type: 'SET_NOTIF_POPUP', payload: [] });
  };

  return (
    <div className="npopup-backdrop">
      <div className="npopup-modal">
        <div className="npopup-header">
          <div className="npopup-header-left">
            <span className="npopup-bell">🔔</span>
            <span className="npopup-label">New Notification</span>
            {list.length > 1 && <span className="npopup-count">{idx + 1} / {list.length}</span>}
          </div>
          <button className="npopup-close" onClick={closeAll}>✕</button>
        </div>

        <div className="npopup-body">
          {notif.title && <div className="npopup-title">{notif.title}</div>}
          {notif.message && <div className="npopup-msg">{notif.message}</div>}
          {notif.hasFile && notif.fileType !== 'application/pdf' && (
            <div className="npopup-img-wrap">
              <img
                className="npopup-img"
                src={`${API_BASE}/api/notifications/file/${notif.id}`}
                alt={notif.fileName || 'attachment'}
                onClick={() => window.open(`${API_BASE}/api/notifications/file/${notif.id}`, '_blank')}
              />
            </div>
          )}
          {notif.hasFile && notif.fileType === 'application/pdf' && (
            <a
              className="npopup-attach"
              href={`${API_BASE}/api/notifications/file/${notif.id}`}
              download={notif.fileName || 'document.pdf'}
              target="_blank"
              rel="noreferrer"
            >
              📄 Download PDF {notif.fileName ? `— ${notif.fileName}` : ''}
            </a>
          )}
          <div className="npopup-date">{fmtDate(notif.createdAt)}</div>
        </div>

        <div className="npopup-footer">
          {idx < list.length - 1 ? (
            <>
              <button className="npopup-btn-outline" onClick={skip}>Skip</button>
              <button className="npopup-btn-primary" onClick={dismiss}>Next →</button>
            </>
          ) : (
            <button className="npopup-btn-primary" onClick={dismiss}>Got it ✓</button>
          )}
        </div>
      </div>
    </div>
  );
}
