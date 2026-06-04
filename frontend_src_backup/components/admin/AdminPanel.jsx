import { useState, useEffect, useRef, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import './AdminPanel.css';

const API_BASE = process.env.REACT_APP_API_URL || '';

function useBodyScroll() {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'auto';
    return () => { document.body.style.overflow = prev || ''; };
  }, []);
}

// ── Helper ──────────────────────────────────────────────────────────────────
const API = (path, { body, headers: extraHeaders, ...rest } = {}) =>
  fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(extraHeaders || {}) },
    body: body ? JSON.stringify(body) : undefined,
    ...rest,
  }).then(r => r.json());

const ADMIN_API = (path, token, { body, headers: extraHeaders, ...rest } = {}) =>
  fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(extraHeaders || {}) },
    body: body ? JSON.stringify(body) : undefined,
    ...rest,
  }).then(r => r.json());

const ROLE_COLORS = { admin: '#b71c1c', member: '#1565c0', user: '#2e7d32' };
const ROLE_LABELS = { admin: 'Admin', member: 'Member', user: 'User' };

// ── Users Tab ───────────────────────────────────────────────────────────────
function UsersTab({ isAdmin }) {
  const [users, setUsers]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [msg, setMsg]           = useState('');
  const [search, setSearch]     = useState('');

  const loadUsers = useCallback(() => {
    setLoading(true);
    API('/api/auth/admin/users')
      .then(d => { if (d.success) setUsers(d.users || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const changeRole = async (userId, role) => {
    const d = await API(`/api/auth/admin/users/${userId}/role`, { method: 'PATCH', body: { role } });
    setMsg(d.message || (d.error ? `Error: ${d.error}` : ''));
    if (d.success) loadUsers();
    setTimeout(() => setMsg(''), 3000);
  };

  const toggleSuspend = async (userId) => {
    const d = await API(`/api/auth/admin/users/${userId}/suspend`, { method: 'PATCH' });
    setMsg(d.message || (d.error ? `Error: ${d.error}` : ''));
    if (d.success) loadUsers();
    setTimeout(() => setMsg(''), 3000);
  };

  const filtered = users.filter(u =>
    !search || u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.mobile || '').includes(search)
  );

  return (
    <div className="admp-tab">
      <div className="admp-tab-header">
        <span className="admp-tab-title">User List</span>
        <div className="admp-tab-actions">
          <input
            className="admp-search"
            placeholder="Search name / email / mobile..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button className="admp-btn admp-btn-outline" onClick={loadUsers}>↻ Refresh</button>
        </div>
      </div>
      {msg && <div className="admp-msg">{msg}</div>}
      {loading ? (
        <div className="admp-loading">Loading users...</div>
      ) : (
        <div className="admp-table-wrap">
          <table className="admp-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Photo</th>
                <th>Name</th>
                <th>Email</th>
                <th>Mobile</th>
                <th>Member Since</th>
                <th>Role</th>
                <th>Status</th>
                {isAdmin && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={isAdmin ? 9 : 8} className="admp-empty">No users found</td></tr>
              ) : filtered.map((u, i) => (
                <tr key={u.userId} className={u.suspended ? 'admp-row-suspended' : ''}>
                  <td>{i + 1}</td>
                  <td>
                    {u.hasPhoto
                      ? <img src={`/api/auth/photo/${u.userId}?t=1`} alt="" className="admp-avatar" />
                      : <div className="admp-avatar admp-avatar-init">
                          {u.name?.[0]?.toUpperCase() || '?'}
                        </div>
                    }
                  </td>
                  <td className="admp-name">{u.name || '—'}</td>
                  <td className="admp-email">{u.email}</td>
                  <td>{u.mobile || '—'}</td>
                  <td className="admp-date">
                    {u.createdAt
                      ? new Date(u.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
                      : '—'}
                  </td>
                  <td>
                    {isAdmin ? (
                      <select
                        className="admp-role-select"
                        value={u.role || 'user'}
                        style={{ color: ROLE_COLORS[u.role || 'user'] }}
                        onChange={e => changeRole(u.userId, e.target.value)}
                      >
                        <option value="user">User</option>
                        <option value="member">Member</option>
                        <option value="admin">Admin</option>
                      </select>
                    ) : (
                      <span className="admp-role-badge" style={{ background: ROLE_COLORS[u.role || 'user'] }}>
                        {ROLE_LABELS[u.role || 'user']}
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={`admp-status ${u.suspended ? 'suspended' : 'active'}`}>
                      {u.suspended ? 'Suspended' : 'Active'}
                    </span>
                  </td>
                  {isAdmin && (
                    <td>
                      <button
                        className={`admp-btn admp-btn-sm ${u.suspended ? 'admp-btn-success' : 'admp-btn-warn'}`}
                        onClick={() => toggleSuspend(u.userId)}
                      >
                        {u.suspended ? 'Unsuspend' : 'Suspend'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── System Tab (admin only) ──────────────────────────────────────────────────
function SystemTab({ adminToken }) {
  const [status, setStatus]             = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [fetchInterval, setFetchInterval] = useState(10);
  const [tokenVal, setTokenVal]         = useState('');
  const [tokenMsg, setTokenMsg]         = useState('');
  const [token2Val, setToken2Val]       = useState('');
  const [token2Msg, setToken2Msg]       = useState('');

  // Instruments state
  const [masterList, setMasterList]     = useState([]);
  const [activeKeys, setActiveKeys]     = useState(new Set());
  const [instrMsg, setInstrMsg]         = useState('');
  const [instrLoading, setInstrLoading] = useState(false);
  const [search, setSearch]             = useState('');

  const fetchStatus = useCallback(async () => {
    try {
      const d = await ADMIN_API('/api/admin/status', adminToken);
      if (d.success) {
        setStatus(d.status);
        if (d.status?.refresh_interval_seconds) setFetchInterval(d.status.refresh_interval_seconds);
      }
    } catch {}
  }, [adminToken]);

  const fetchInstruments = useCallback(async () => {
    try {
      const [masterRes, activeRes] = await Promise.all([
        ADMIN_API('/api/instruments/master', adminToken),
        ADMIN_API('/api/instruments/active', adminToken),
      ]);
      if (masterRes.success) setMasterList(masterRes.all || []);
      if (activeRes.success) setActiveKeys(new Set(activeRes.instruments || []));
    } catch {}
  }, [adminToken]);

  useEffect(() => {
    fetchStatus();
    fetchInstruments();
    const id = setInterval(fetchStatus, 8000);
    return () => clearInterval(id);
  }, [fetchStatus, fetchInstruments]);

  const toggleInstrument = (key) => {
    setActiveKeys(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const saveInstruments = async () => {
    setInstrLoading(true);
    setInstrMsg('');
    try {
      const d = await ADMIN_API('/api/instruments/active', adminToken, {
        method: 'POST',
        body: { instruments: [...activeKeys] },
      });
      setInstrMsg(d.success ? `✅ Saved ${[...activeKeys].length} instruments` : '❌ ' + d.message);
    } catch { setInstrMsg('❌ Error saving'); }
    setInstrLoading(false);
  };

  // Only show instruments that support option chain (others can't be fetched)
  const filtered = masterList
    .filter(i => i.hasOptionChain !== false)
    .filter(i =>
      !search || i.symbol?.toLowerCase().includes(search.toLowerCase()) ||
      i.name?.toLowerCase().includes(search.toLowerCase())
    );

  const startFetching = async (intervalSeconds = fetchInterval) => {
    setActionLoading(true);
    await ADMIN_API('/api/admin/start', adminToken, { method: 'POST', body: { interval_seconds: intervalSeconds } });
    await fetchStatus();
    setActionLoading(false);
  };

  const stopFetching = async () => {
    setActionLoading(true);
    await ADMIN_API('/api/admin/stop', adminToken, { method: 'POST' });
    await fetchStatus();
    setActionLoading(false);
  };

  const updateToken = async (e) => {
    e.preventDefault();
    setTokenMsg('');
    try {
      const d = await ADMIN_API('/api/admin/token', adminToken, { method: 'POST', body: { access_token: tokenVal } });
      setTokenMsg(d.message || (d.success ? 'Updated!' : 'Failed'));
      if (d.success) setTokenVal('');
    } catch { setTokenMsg('Error'); }
  };

  const updateToken2 = async (e) => {
    e.preventDefault();
    setToken2Msg('');
    try {
      const d = await ADMIN_API('/api/admin/token2', adminToken, { method: 'POST', body: { access_token: token2Val } });
      setToken2Msg(d.message || (d.success ? 'Updated!' : 'Failed'));
      if (d.success) setToken2Val('');
    } catch { setToken2Msg('Error'); }
  };

  const running = status?.is_running;

  return (
    <div className="admp-tab">
      <div className="admp-tab-header">
        <span className="admp-tab-title">System Status</span>
      </div>

      <div className="admp-sys-grid">
        <div className="admp-sys-card">
          <div className="admp-sys-label">Server Status</div>
          <div className="admp-sys-val">
            <span className={`admp-dot ${running ? 'green' : 'red'}`} />
            {running ? 'Running' : 'Stopped'}
          </div>
          <div className="admp-sys-meta">
            {status?.last_update && <span>Last update: <b>{status.last_update}</b></span>}
            {status?.total_updates !== undefined && <span>Total updates: <b>{status.total_updates}</b></span>}
            {status?.current_expiry && <span>Expiry: <b>{status.current_expiry}</b></span>}
          </div>
          {/* Interval selector */}
          <div style={{ display:'flex', alignItems:'center', gap:'6px', margin:'8px 0 4px' }}>
            <label style={{ fontSize:'12px', color:'#666', whiteSpace:'nowrap' }}>Interval:</label>
            <select
              value={fetchInterval}
              onChange={e => setFetchInterval(Number(e.target.value))}
              disabled={actionLoading}
              style={{ padding:'3px 7px', borderRadius:'4px', border:'1px solid #ccc', fontSize:'13px', background:'#fff' }}
            >
              {[1,2,3,5,10,15].map(s => <option key={s} value={s}>{s}s</option>)}
            </select>
            <span style={{ fontSize:'11px', color:'#999' }}>fetch every {fetchInterval}s</span>
          </div>
          <div className="admp-sys-btns">
            <button
              className={`admp-btn ${running ? 'admp-btn-warn' : 'admp-btn-success'}`}
              onClick={running ? stopFetching : () => startFetching(fetchInterval)}
              disabled={actionLoading}
            >
              {actionLoading ? '...' : running ? '⏹ Stop Fetching' : '▶ Start Fetching'}
            </button>
            {running && (
              <button
                className="admp-btn admp-btn-primary"
                style={{ fontSize:'12px', padding:'4px 10px' }}
                onClick={() => startFetching(fetchInterval)}
                disabled={actionLoading}
                title="Restart with new interval"
              >
                ↺ Apply
              </button>
            )}
          </div>
        </div>

        <div className="admp-sys-card">
          <div className="admp-sys-label">Update Access Token</div>
          <form onSubmit={updateToken} className="admp-token-form">
            <input
              className="admp-input"
              placeholder="Paste new Upstox access token..."
              value={tokenVal}
              onChange={e => setTokenVal(e.target.value)}
            />
            <button className="admp-btn admp-btn-primary" type="submit" disabled={!tokenVal}>
              Update
            </button>
          </form>
          {tokenMsg && <div className="admp-msg">{tokenMsg}</div>}
        </div>

        <div className="admp-sys-card">
          <div className="admp-sys-label">API Key 2 <span style={{fontSize:'11px',opacity:.6,fontWeight:400}}>(failover — auto-switches on rate limit)</span></div>
          <form onSubmit={updateToken2} className="admp-token-form">
            <input
              className="admp-input"
              placeholder="Paste 2nd Upstox access token..."
              value={token2Val}
              onChange={e => setToken2Val(e.target.value)}
            />
            <button className="admp-btn admp-btn-primary" type="submit" disabled={!token2Val}>
              Update
            </button>
          </form>
          {token2Msg && <div className="admp-msg">{token2Msg}</div>}
        </div>
      </div>

      {/* ── Upstox API Keys Manager ── */}
      <UpstoxAppsPanel adminToken={adminToken} />

      {/* ── Instruments Manager ── */}
      <div style={{ marginTop: 28 }}>
        <div className="admp-tab-header">
          <span className="admp-tab-title">
            Instruments
            <span className="admp-count" style={{ marginLeft: 8 }}>{activeKeys.size} active</span>
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              className="admp-input"
              placeholder="Search symbol / name..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: 200 }}
            />
            <button
              className="admp-btn admp-btn-success"
              onClick={saveInstruments}
              disabled={instrLoading || activeKeys.size === 0}
            >
              {instrLoading ? 'Saving...' : '💾 Save & Apply'}
            </button>
          </div>
        </div>
        {instrMsg && <div className="admp-msg" style={{ marginBottom: 10 }}>{instrMsg}</div>}
        <div className="admp-table-wrap" style={{ marginTop: 8 }}>
          <table className="admp-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Symbol</th>
                <th>Name</th>
                <th>Segment</th>
                <th>Sector</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((inst, i) => {
                const active = activeKeys.has(inst.key);
                return (
                  <tr key={inst.key}>
                    <td style={{ color: '#999', fontSize: 12 }}>{i + 1}</td>
                    <td><b>{inst.symbol}</b></td>
                    <td style={{ fontSize: 12 }}>{inst.name}</td>
                    <td style={{ fontSize: 11, color: '#888' }}>{inst.segment || inst.category}</td>
                    <td style={{ fontSize: 11, color: '#888' }}>{inst.sector || '—'}</td>
                    <td>
                      <span style={{
                        padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700,
                        background: active ? '#e8f5e9' : '#ffeee8',
                        color: active ? '#2e7d32' : '#c62828',
                      }}>
                        {active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <button
                        onClick={() => toggleInstrument(inst.key)}
                        style={{
                          padding: '4px 14px', borderRadius: 6, cursor: 'pointer',
                          border: `1.5px solid ${active ? '#c62828' : '#2e7d32'}`,
                          background: active ? '#ffeee8' : '#e8f5e9',
                          color: active ? '#c62828' : '#2e7d32',
                          fontSize: 12, fontWeight: 700,
                        }}
                      >
                        {active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Upstox Apps Panel ────────────────────────────────────────────────────────
function UpstoxAppsPanel({ adminToken }) {
  const BLANK = { name:'', api_key:'', api_secret:'', redirect_uri:'' };
  const [apps,         setApps]        = useState([]);
  const [adminEmail,   setAdminEmail]  = useState('');
  const [emailTime,    setEmailTime]   = useState('08:00');
  const [otpEmail,     setOtpEmail]    = useState('');
  const [otpEmailPass, setOtpEmailPass]= useState('');
  const [newRow,       setNewRow]      = useState({ ...BLANK });
  const [editSecrets,  setEditSecrets] = useState({});
  const [saving,       setSaving]      = useState(null);
  const [adding,       setAdding]      = useState(false);
  const [deleting,     setDeleting]    = useState(null);
  const [sendingAll,   setSendingAll]  = useState(false);
  const [msg,          setMsg]         = useState('');
  const [tokenInputs,  setTokenInputs] = useState({});  // { appId: tokenString }
  const [settingToken, setSettingToken]= useState(null); // appId being saved

  const load = useCallback(() => {
    ADMIN_API('/api/admin/upstox-apps', adminToken)
      .then(d => {
        if (!d.success) return;
        setApps(d.apps || []);
        setAdminEmail(d.admin_email || '');
        setEmailTime(d.email_time   || '08:00');
        setOtpEmail(d.otp_email     || '');
      }).catch(() => {});
  }, [adminToken]);

  useEffect(() => { load(); }, [load]);

  const updateApp = (id, field, val) =>
    setApps(prev => prev.map(a => a.id === id ? { ...a, [field]: val } : a));

  const saveApp = async (app) => {
    setSaving(app.id); setMsg('');
    const body = { name: app.name, api_key: app.api_key, redirect_uri: app.redirect_uri };
    const secret = editSecrets[app.id];
    if (secret) body.api_secret = secret;
    try {
      const d = await ADMIN_API(`/api/admin/upstox-apps/${app.id}`, adminToken, { method: 'PUT', body });
      if (d.success) { setEditSecrets(s => { const n={...s}; delete n[app.id]; return n; }); }
      const manualToken = (tokenInputs[app.id] || '').trim();
      if (manualToken) {
        const td = await ADMIN_API(`/api/admin/upstox-apps/${app.id}/token`, adminToken, {
          method: 'PATCH', body: { access_token: manualToken },
        });
        if (td.success) { setTokenInputs(t => { const n={...t}; delete n[app.id]; return n; }); }
        setMsg(td.message || (td.success ? 'Saved!' : 'Failed'));
      } else {
        setMsg(d.message || (d.success ? 'Saved!' : 'Failed'));
      }
      if (d.success) load();
    } catch { setMsg('Error'); }
    finally { setSaving(null); }
  };

  const addApp = async () => {
    if (!newRow.name || !newRow.api_key) { setMsg('Name and API Key required'); return; }
    setAdding(true); setMsg('');
    try {
      const d = await ADMIN_API('/api/admin/upstox-apps', adminToken, { method: 'POST', body: newRow });
      if (d.success) { setNewRow({ ...BLANK }); load(); }
      setMsg(d.message || (d.success ? 'Added!' : 'Failed'));
    } catch { setMsg('Error'); }
    finally { setAdding(false); }
  };

  const deleteApp = async (id, name) => {
    if (!window.confirm(`Delete "${name}"?`)) return;
    setDeleting(id);
    try { await ADMIN_API(`/api/admin/upstox-apps/${id}`, adminToken, { method: 'DELETE', body: {} }); load(); }
    catch {} finally { setDeleting(null); }
  };

  const saveSettings = async () => {
    setMsg('');
    try {
      const body = { admin_email: adminEmail, email_time: emailTime, otp_email: otpEmail };
      if (otpEmailPass) body.otp_email_pass = otpEmailPass;
      const d = await ADMIN_API('/api/admin/upstox-settings', adminToken, { method: 'POST', body });
      setMsg(d.message || (d.success ? 'Settings saved!' : 'Failed'));
    } catch { setMsg('Error'); }
  };

  const sendAll = async () => {
    setSendingAll(true); setMsg('');
    try {
      const d = await ADMIN_API('/api/admin/upstox-auth/send-all-email', adminToken, { method: 'POST', body: {} });
      setMsg(d.message || (d.success ? 'Email sent!' : 'Failed'));
    } catch { setMsg('Error'); }
    finally { setSendingAll(false); }
  };

  const setToken = async (appId) => {
    const token = (tokenInputs[appId] || '').trim();
    setSettingToken(appId); setMsg('');
    try {
      const d = await ADMIN_API(`/api/admin/upstox-apps/${appId}/token`, adminToken, {
        method: 'PATCH', body: { access_token: token }
      });
      setMsg(d.message || (d.success ? 'Token saved!' : 'Failed'));
      if (d.success) {
        setTokenInputs(t => { const n={...t}; delete n[appId]; return n; });
        load();
      }
    } catch { setMsg('Error'); }
    finally { setSettingToken(null); }
  };

  const clearToken = async (appId) => {
    if (!window.confirm('Clear this access token?')) return;
    setSettingToken(appId); setMsg('');
    try {
      const d = await ADMIN_API(`/api/admin/upstox-apps/${appId}/token`, adminToken, {
        method: 'PATCH', body: { access_token: '' }
      });
      setMsg(d.message || 'Cleared');
      if (d.success) load();
    } catch { setMsg('Error'); }
    finally { setSettingToken(null); }
  };

  const th = { padding:'6px 10px', textAlign:'left', fontSize:'11px', color:'#888', fontWeight:600, borderBottom:'1px solid #e0e0e0' };
  const td = { padding:'6px 8px', verticalAlign:'middle' };

  return (
    <div style={{ marginTop:'28px' }}>
      <div className="admp-tab-header" style={{ marginBottom:'12px' }}>
        <span className="admp-tab-title">Upstox API Keys</span>
        <div style={{ display:'flex', gap:'8px', alignItems:'center', flexWrap:'wrap' }}>
          {apps.map(a => (
            <span key={a.id} style={{ fontSize:'11px', fontWeight:700, padding:'2px 8px', borderRadius:'10px',
              background: a.has_token ? 'rgba(0,180,0,0.1)' : 'rgba(200,0,0,0.1)',
              color: a.has_token ? '#1a7a1a' : '#b00' }}>
              {a.name}: {a.has_token ? '✓' : '✗'}
            </span>
          ))}
        </div>
      </div>

      <div style={{ overflowX:'auto', background:'#fff', border:'1px solid #e0e0e0', borderRadius:'8px' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px' }}>
          <thead>
            <tr>
              <th style={th}>App Name</th>
              <th style={th}>API Key</th>
              <th style={th}>API Secret</th>
              <th style={th}>Redirect URI</th>
              <th style={th}>Token Status</th>
              <th style={th}>Manual Access Token</th>
              <th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {apps.map(a => (
              <tr key={a.id} style={{ borderBottom:'1px solid #f0f0f0' }}>
                <td style={td}>
                  <input className="admp-input" style={{ marginBottom:0, minWidth:'90px' }} value={a.name}
                    onChange={e => updateApp(a.id, 'name', e.target.value)} />
                </td>
                <td style={td}>
                  <input className="admp-input" style={{ marginBottom:0, minWidth:'200px', fontSize:'11px' }} value={a.api_key}
                    onChange={e => updateApp(a.id, 'api_key', e.target.value)} />
                </td>
                <td style={td}>
                  <input className="admp-input" style={{ marginBottom:0, minWidth:'110px' }} type="password"
                    placeholder={a.has_secret ? '(saved)' : 'Secret'}
                    value={editSecrets[a.id] || ''}
                    onChange={e => setEditSecrets(s => ({ ...s, [a.id]: e.target.value }))} />
                </td>
                <td style={td}>
                  <input className="admp-input" style={{ marginBottom:0, minWidth:'160px', fontSize:'11px' }} value={a.redirect_uri}
                    onChange={e => updateApp(a.id, 'redirect_uri', e.target.value)} />
                </td>
                <td style={td}>
                  <span style={{ fontSize:'11px', fontWeight:700, padding:'2px 8px', borderRadius:'10px',
                    background: a.has_token ? 'rgba(0,180,0,0.1)' : 'rgba(200,0,0,0.1)',
                    color: a.has_token ? '#1a7a1a' : '#b00' }}>
                    {a.has_token ? '✓ Active' : '✗ None'}
                  </span>
                  {a.has_token && (
                    <button className="admp-btn admp-btn-warn" style={{ padding:'2px 8px', marginLeft:'4px', fontSize:'11px' }}
                      disabled={settingToken === a.id} onClick={() => clearToken(a.id)}>
                      Clear
                    </button>
                  )}
                </td>
                <td style={{ ...td, minWidth:'260px' }}>
                  <div style={{ display:'flex', gap:'4px', flexDirection:'column' }}>
                    <div style={{ display:'flex', gap:'4px' }}>
                      <input
                        className="admp-input"
                        style={{ marginBottom:0, flex:1, fontSize:'11px', fontFamily:'monospace' }}
                        type="text"
                        placeholder="Paste access token here…"
                        value={tokenInputs[a.id] || ''}
                        onChange={e => setTokenInputs(t => ({ ...t, [a.id]: e.target.value }))}
                      />
                      <button className="admp-btn admp-btn-success" style={{ padding:'4px 12px', whiteSpace:'nowrap' }}
                        disabled={!tokenInputs[a.id] || settingToken === a.id}
                        onClick={() => setToken(a.id)}>
                        {settingToken === a.id ? '…' : '✓ Set Token'}
                      </button>
                    </div>
                    {tokenInputs[a.id] && (
                      <div style={{ fontSize:'10px', color:'#888', wordBreak:'break-all', maxHeight:'32px', overflow:'hidden' }}>
                        {tokenInputs[a.id].substring(0, 60)}…
                      </div>
                    )}
                  </div>
                </td>
                <td style={{ ...td, whiteSpace:'nowrap' }}>
                  <button className="admp-btn admp-btn-primary" style={{ padding:'4px 12px', marginRight:'4px' }}
                    disabled={saving === a.id} onClick={() => saveApp(a)}>
                    {saving === a.id ? '…' : '💾 Save'}
                  </button>
                  <button className="admp-btn admp-btn-warn" style={{ padding:'4px 10px' }}
                    disabled={deleting === a.id} onClick={() => deleteApp(a.id, a.name)}>
                    {deleting === a.id ? '…' : '🗑'}
                  </button>
                </td>
              </tr>
            ))}
            {/* Add row */}
            <tr style={{ background:'#fafafa', borderTop:'2px solid #e0e0e0' }}>
              <td style={td}><input className="admp-input" style={{ marginBottom:0 }} placeholder="App Name" value={newRow.name} onChange={e => setNewRow(r=>({...r,name:e.target.value}))} /></td>
              <td style={td}><input className="admp-input" style={{ marginBottom:0, fontSize:'11px' }} placeholder="API Key" value={newRow.api_key} onChange={e => setNewRow(r=>({...r,api_key:e.target.value}))} /></td>
              <td style={td}><input className="admp-input" style={{ marginBottom:0 }} type="password" placeholder="Secret" value={newRow.api_secret} onChange={e => setNewRow(r=>({...r,api_secret:e.target.value}))} /></td>
              <td style={td}><input className="admp-input" style={{ marginBottom:0, fontSize:'11px' }} placeholder="Redirect URI" value={newRow.redirect_uri} onChange={e => setNewRow(r=>({...r,redirect_uri:e.target.value}))} /></td>
              <td style={td}></td>
              <td style={td}>
                <button className="admp-btn admp-btn-success" style={{ padding:'4px 14px' }} disabled={adding} onClick={addApp}>
                  {adding ? '…' : '+ Add'}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* OTP Email Credentials */}
      <div style={{ background:'#fff8f0', border:'2px solid #ff6f00', borderRadius:'8px', padding:'12px 14px', marginTop:'14px' }}>
        <div style={{ fontSize:'12px', fontWeight:'700', color:'#e65100', marginBottom:'8px', borderBottom:'1px solid #ffe0b2', paddingBottom:'6px' }}>
          📧 OTP / Reset Password Email Credentials
        </div>
        <div style={{ display:'flex', gap:'10px', flexWrap:'wrap', alignItems:'flex-end' }}>
          <label style={{ display:'flex', flexDirection:'column', gap:'4px', fontSize:'12px', color:'#444', flex:1, minWidth:'200px' }}>
            Gmail Address (used for OTP &amp; reset links)
            <input className="admp-input" style={{ marginBottom:0, color:'#000', fontWeight:'600' }} type="email" placeholder="yourapp@gmail.com"
              value={otpEmail} onChange={e => setOtpEmail(e.target.value)} />
          </label>
          <label style={{ display:'flex', flexDirection:'column', gap:'4px', fontSize:'12px', color:'#444', flex:1, minWidth:'200px' }}>
            Gmail App Password <span style={{ fontWeight:'normal', color:'#aaa' }}>(leave blank to keep existing)</span>
            <input className="admp-input" style={{ marginBottom:0, color:'#000', fontWeight:'600', fontFamily:'monospace' }} type="text" placeholder="app password (16 chars)"
              value={otpEmailPass} onChange={e => setOtpEmailPass(e.target.value)} />
          </label>
        </div>
        <div style={{ fontSize:'11px', color:'#999', marginTop:'6px' }}>
          Use a <b>Gmail App Password</b> (not your Gmail login password). Generate one at: Google Account → Security → 2-Step Verification → App Passwords.
        </div>
      </div>

      {/* Settings + Send */}
      <div style={{ display:'flex', gap:'10px', alignItems:'flex-end', marginTop:'12px', flexWrap:'wrap' }}>
        <label style={{ display:'flex', flexDirection:'column', gap:'4px', fontSize:'12px', color:'#666', flex:1, minWidth:'180px' }}>
          Admin Email (receives 8 AM token link)
          <input className="admp-input" style={{ marginBottom:0 }} type="email" placeholder="your@email.com"
            value={adminEmail} onChange={e => setAdminEmail(e.target.value)} />
        </label>
        <label style={{ display:'flex', flexDirection:'column', gap:'4px', fontSize:'12px', color:'#666' }}>
          Daily Send Time (IST)
          <input className="admp-input" style={{ marginBottom:0, width:'110px' }} type="time"
            value={emailTime} onChange={e => setEmailTime(e.target.value)} />
        </label>
        <button className="admp-btn admp-btn-primary" onClick={saveSettings}>💾 Save Settings</button>
        <button className="admp-btn admp-btn-success" disabled={sendingAll} onClick={sendAll}>
          {sendingAll ? 'Sending…' : '📧 Send All Auth Links'}
        </button>
        {msg && <span className="admp-msg" style={{ margin:0 }}>{msg}</span>}
      </div>
      <div style={{ marginTop:'6px', fontSize:'11px', color:'#999' }}>
        Auto-sends all links in <b>1 email</b> daily at <b>{emailTime} IST</b>. Click each link → token auto-saved.
        &nbsp;|&nbsp; <span style={{ color:'#c44' }}>All tokens auto-cleared at <b>3:00 AM IST</b> daily (Upstox expiry).</span>
      </div>
    </div>
  );
}

// ── Schedule Tab (admin only) ────────────────────────────────────────────────
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function ScheduleTab({ adminToken }) {
  const [days, setDays]         = useState([1,2,3,4,5]);
  const [startTime, setStart]   = useState('08:59');
  const [stopTime, setStop]     = useState('15:32');
  const [enabled, setEnabled]   = useState(true);
  const [msg, setMsg]           = useState('');

  useEffect(() => {
    ADMIN_API('/api/admin/schedule', adminToken)
      .then(d => {
        if (d.success) {
          setDays(d.schedule?.days?.filter(x => typeof x === 'number') || [1,2,3,4,5]);
          setStart(d.schedule?.start_time || '08:59');
          setStop(d.schedule?.stop_time || '15:32');
          setEnabled(d.enabled ?? true);
        }
      }).catch(() => {});
  }, [adminToken]);

  const toggleDay = d => setDays(prev =>
    prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort()
  );

  const save = async () => {
    setMsg('');
    try {
      const d = await ADMIN_API('/api/admin/schedule', adminToken, {
        method: 'POST',
        body: { schedule: { days, start_time: startTime, stop_time: stopTime }, enabled },
      });
      setMsg(d.message || (d.success ? 'Saved!' : 'Failed'));
      setTimeout(() => setMsg(''), 3000);
    } catch { setMsg('Error saving'); }
  };

  return (
    <div className="admp-tab">
      <div className="admp-tab-header">
        <span className="admp-tab-title">Update Schedule</span>
        <label className="admp-toggle-label">
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
          <span className={`admp-pill ${enabled ? 'green' : 'red'}`}>{enabled ? 'Enabled' : 'Disabled'}</span>
        </label>
      </div>

      <div className="admp-sched-body">
        <div className="admp-sched-section">
          <div className="admp-sched-label">Active Days</div>
          <div className="admp-days-row">
            {DAYS.map((d, i) => (
              <button
                key={d}
                className={`admp-day-btn ${days.includes(i + 1) ? 'active' : ''}`}
                onClick={() => toggleDay(i + 1)}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <div className="admp-sched-section">
          <div className="admp-sched-label">Time Range</div>
          <div className="admp-time-row">
            <label>
              Start Time
              <input className="admp-input admp-input-time" type="time" value={startTime} onChange={e => setStart(e.target.value)} />
            </label>
            <label>
              Stop Time
              <input className="admp-input admp-input-time" type="time" value={stopTime} onChange={e => setStop(e.target.value)} />
            </label>
          </div>
        </div>

        <button className="admp-btn admp-btn-primary" onClick={save}>Save Schedule</button>
        {msg && <div className="admp-msg">{msg}</div>}
      </div>
    </div>
  );
}

// ── Crypto Tab (admin only) ──────────────────────────────────────────────────
function CryptoTab({ adminToken }) {
  const [status, setStatus]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg]         = useState('');
  const intervalRef           = useRef(null);

  const fetchStatus = useCallback(async () => {
    try {
      const d = await API('/api/crypto/status');
      setStatus(d);
    } catch (_) {}
  }, []);

  useEffect(() => {
    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, 5000);
    return () => clearInterval(intervalRef.current);
  }, [fetchStatus]);

  const action = async (type) => {
    setLoading(true);
    setMsg('');
    try {
      const d = await ADMIN_API(`/api/crypto/${type}`, adminToken, { method: 'POST' });
      setMsg(d.message || (d.success ? 'Done' : 'Failed'));
      fetchStatus();
    } catch (e) {
      setMsg('Request failed');
    } finally {
      setLoading(false);
      setTimeout(() => setMsg(''), 4000);
    }
  };

  const isRunning   = status?.running;
  const isConnected = status?.connected;

  return (
    <div className="admp-tab">
      <div className="admp-tab-header">
        <span className="admp-tab-title">🪙 Crypto Feed</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="admp-btn admp-btn-primary" onClick={fetchStatus}>Refresh</button>
        </div>
      </div>

      {/* Status card */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        {[
          { label: 'Feed',      value: isRunning   ? 'Running'   : 'Stopped',    color: isRunning   ? '#2e7d32' : '#b71c1c' },
          { label: 'WebSocket', value: isConnected ? 'Connected' : 'Disconnected', color: isConnected ? '#2e7d32' : '#f57f17' },
          { label: 'Products',  value: status?.products ?? '—',  color: '#1565c0' },
          { label: 'Tickers',   value: status?.tickerCount ?? '—', color: '#1565c0' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: '#f5f5f5', borderRadius: 8, padding: '12px 20px', minWidth: 110, textAlign: 'center', border: '1px solid #e0e0e0' }}>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Expiries */}
      {status?.expiries && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>Active Expiries (2 nearest per symbol)</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {Object.entries(status.expiries).map(([sym, exps]) => (
              <div key={sym} style={{ background: '#e3f2fd', borderRadius: 8, padding: '8px 14px', fontSize: 13 }}>
                <span style={{ fontWeight: 700, marginRight: 8 }}>{sym}</span>
                {(exps || []).join(' · ') || '—'}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button
          className="admp-btn admp-btn-primary"
          onClick={() => action('start')}
          disabled={loading || isRunning}
          style={{ background: '#2e7d32', minWidth: 100 }}
        >
          ▶ Start
        </button>
        <button
          className="admp-btn"
          onClick={() => action('stop')}
          disabled={loading || !isRunning}
          style={{ background: '#b71c1c', color: '#fff', minWidth: 100 }}
        >
          ⏹ Stop
        </button>
        {msg && <span className="admp-msg" style={{ margin: 0 }}>{msg}</span>}
      </div>

      <div style={{ marginTop: 18, fontSize: 12, color: '#888' }}>
        Data saved every 10s → <code>data/crypto/&#123;BTC|ETH|SOL&#125;/&#123;expiry&#125;/&#123;date&#125;/</code>
      </div>
    </div>
  );
}

// ── Logs Tab (admin only) ────────────────────────────────────────────────────
function LogsTab({ adminToken }) {
  const [logs, setLogs]           = useState([]);
  const [autoRefresh, setAuto]    = useState(true);
  const [msg, setMsg]             = useState('');
  const bottomRef                 = useRef(null);
  const intervalRef               = useRef(null);

  const fetchLogs = useCallback(async () => {
    try {
      const d = await ADMIN_API('/api/admin/logs?lines=100', adminToken);
      if (d.success) setLogs(d.logs || []);
    } catch {}
  }, [adminToken]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  useEffect(() => {
    if (autoRefresh) intervalRef.current = setInterval(fetchLogs, 5000);
    else clearInterval(intervalRef.current);
    return () => clearInterval(intervalRef.current);
  }, [autoRefresh, fetchLogs]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const clearLogs = async () => {
    try {
      const d = await ADMIN_API('/api/admin/clear-logs', adminToken, { method: 'POST' });
      setMsg(d.message || 'Cleared');
      fetchLogs();
      setTimeout(() => setMsg(''), 3000);
    } catch { setMsg('Error'); }
  };

  return (
    <div className="admp-tab">
      <div className="admp-tab-header">
        <span className="admp-tab-title">Server Logs</span>
        <div className="admp-tab-actions">
          <label className="admp-toggle-label">
            <input type="checkbox" checked={autoRefresh} onChange={e => setAuto(e.target.checked)} />
            Auto-refresh
          </label>
          <button className="admp-btn admp-btn-outline admp-btn-sm" onClick={fetchLogs}>↻</button>
          <button className="admp-btn admp-btn-warn admp-btn-sm" onClick={clearLogs}>Clear</button>
        </div>
      </div>
      {msg && <div className="admp-msg">{msg}</div>}
      <div className="admp-log-box">
        {logs.length === 0
          ? <span className="admp-log-empty">No logs</span>
          : logs.map((line, i) => (
            <div key={i} className={`admp-log-line ${line.includes('ERROR') || line.includes('❌') ? 'err' : line.includes('✅') ? 'ok' : ''}`}>
              {line}
            </div>
          ))
        }
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ── Team Tab (admin only) ─────────────────────────────────────────────────────
const EMPTY_MEMBER = { name: '', designation: '', experience: '' };

function TeamTab() {
  const [members, setMembers]   = useState([]);
  const [form, setForm]         = useState(EMPTY_MEMBER);
  const [photo, setPhoto]       = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [editId, setEditId]     = useState(null);
  const [saving, setSaving]     = useState(false);
  const [msg, setMsg]           = useState('');
  const fileRef                 = useRef(null);

  const load = () => {
    fetch(`${API_BASE}/api/team`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.success) setMembers(d.members || []); })
      .catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const setF = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhoto(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const resetForm = () => {
    setForm(EMPTY_MEMBER); setPhoto(null); setPhotoPreview(null); setEditId(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleEdit = (m) => {
    setForm({ name: m.name, designation: m.designation, experience: m.experience });
    setPhotoPreview(m.hasPhoto ? `/api/team/photo/${m.id}?t=${Date.now()}` : null);
    setPhoto(null); setEditId(m.id);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setMsg('Name is required'); return; }
    setSaving(true); setMsg('');
    const fd = new FormData();
    fd.append('name', form.name);
    fd.append('designation', form.designation);
    fd.append('experience', form.experience);
    if (photo) fd.append('photo', photo);
    try {
      const url = editId ? `/api/admin/team/${editId}` : '/api/admin/team';
      const method = editId ? 'PUT' : 'POST';
      const r = await fetch(url, { method, credentials: 'include', body: fd });
      const d = await r.json();
      if (d.success) { load(); resetForm(); setMsg(editId ? 'Updated!' : 'Member added!'); }
      else setMsg(d.error || 'Save failed');
    } catch { setMsg('Network error'); }
    finally { setSaving(false); setTimeout(() => setMsg(''), 3000); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this team member?')) return;
    try {
      const r = await fetch(`/api/admin/team/${id}`, { method: 'DELETE', credentials: 'include' });
      const d = await r.json();
      if (d.success) { setMembers(prev => prev.filter(m => m.id !== id)); if (editId === id) resetForm(); }
    } catch {}
  };

  const initials = (name) => name ? name.trim().split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() : '?';

  return (
    <div className="admp-tab">
      <div className="admp-tab-header">
        <span className="admp-tab-title">{editId ? 'Edit Team Member' : 'Add Team Member'}</span>
        {editId && <button className="admp-btn admp-btn-outline" onClick={resetForm}>✕ Cancel Edit</button>}
      </div>

      {/* ── Form ── */}
      <form className="team-form" onSubmit={handleSave}>
        <div className="team-form-photo-col">
          <div className="team-form-avatar" onClick={() => fileRef.current?.click()}>
            {photoPreview
              ? <img src={photoPreview} alt="" className="team-form-avatar-img" />
              : <span className="team-form-avatar-init">{initials(form.name) || '+'}</span>
            }
            <div className="team-form-avatar-overlay">📷</div>
          </div>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={handlePhotoChange} />
          <span className="team-form-photo-hint">Click to upload</span>
        </div>
        <div className="team-form-fields">
          <div className="team-form-row">
            <div className="admp-field">
              <label>Name *</label>
              <input className="admp-input" value={form.name} onChange={e => setF('name', e.target.value)} placeholder="Full name" required />
            </div>
            <div className="admp-field">
              <label>Designation</label>
              <input className="admp-input" value={form.designation} onChange={e => setF('designation', e.target.value)} placeholder="e.g. Sr. Analyst" />
            </div>
            <div className="admp-field">
              <label>Experience</label>
              <input className="admp-input" value={form.experience} onChange={e => setF('experience', e.target.value)} placeholder="e.g. 5+ years" />
            </div>
          </div>
          <div className="team-form-actions">
            <button type="submit" className="admp-btn admp-btn-primary" disabled={saving}>
              {saving ? 'Saving...' : editId ? '💾 Update Member' : '➕ Add Member'}
            </button>
            {msg && <span className={`admp-inline-msg ${msg.includes('!') ? 'ok' : 'err'}`}>{msg}</span>}
          </div>
        </div>
      </form>

      {/* ── Cards Grid ── */}
      <div className="admp-tab-header" style={{ marginTop: 24 }}>
        <span className="admp-tab-title">Team Members <span className="admp-count">{members.length}</span></span>
      </div>
      {members.length === 0 ? (
        <div className="admp-loading">No team members yet. Add the first one above.</div>
      ) : (
        <div className="team-cards-grid">
          {members.map(m => (
            <div key={m.id} className={`team-card${editId === m.id ? ' editing' : ''}`}>
              <div className="team-card-avatar">
                {m.hasPhoto
                  ? <img src={`/api/team/photo/${m.id}?t=${Date.now()}`} alt={m.name} className="team-card-avatar-img" />
                  : <span className="team-card-avatar-init">{initials(m.name)}</span>
                }
              </div>
              <div className="team-card-name">{m.name}</div>
              {m.designation && <div className="team-card-desig">{m.designation}</div>}
              {m.experience && <div className="team-card-exp">🏆 {m.experience}</div>}
              <div className="team-card-actions">
                <button className="team-card-edit-btn" onClick={() => handleEdit(m)}>✏️ Edit</button>
                <button className="team-card-del-btn" onClick={() => handleDelete(m.id)}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Notifications Tab (admin only) ───────────────────────────────────────────
function NotificationsTab() {
  const [notifs, setNotifs]     = useState([]);
  const [title, setTitle]       = useState('');
  const [message, setMessage]   = useState('');
  const [file, setFile]         = useState(null);
  const [fileName, setFileName] = useState('');
  const [posting, setPosting]   = useState(false);
  const [msg, setMsg]           = useState('');
  const fileRef                 = useRef(null);

  const load = () => {
    fetch(`${API_BASE}/api/notifications`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.success) setNotifs(d.notifications || []); })
      .catch(() => {});
  };
  useEffect(() => { load(); }, []);

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setFileName(f.name);
  };

  const handlePost = async (e) => {
    e.preventDefault();
    if (!title.trim() && !message.trim()) { setMsg('Add a title or message'); return; }
    setPosting(true); setMsg('');
    const fd = new FormData();
    fd.append('title', title);
    fd.append('message', message);
    if (file) fd.append('file', file);
    try {
      const r = await fetch(`${API_BASE}/api/admin/notifications`, { method: 'POST', credentials: 'include', body: fd });
      const d = await r.json();
      if (d.success) {
        load();
        setTitle(''); setMessage(''); setFile(null); setFileName('');
        if (fileRef.current) fileRef.current.value = '';
        setMsg('Posted!');
      } else setMsg(d.error || 'Failed');
    } catch { setMsg('Network error'); }
    finally { setPosting(false); setTimeout(() => setMsg(''), 3000); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this notification?')) return;
    const r = await fetch(`/api/admin/notifications/${id}`, { method: 'DELETE', credentials: 'include' });
    const d = await r.json();
    if (d.success) setNotifs(prev => prev.filter(n => n.id !== id));
  };

  const fmtDate = (iso) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="admp-tab">
      <div className="admp-tab-header">
        <span className="admp-tab-title">Post Notification</span>
      </div>

      <form className="notif-form" onSubmit={handlePost}>
        <div className="admp-field" style={{ flex: 'none' }}>
          <label>Title</label>
          <input className="admp-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Notification title..." style={{ minWidth: 0 }} />
        </div>
        <div className="admp-field" style={{ flex: 'none' }}>
          <label>Message</label>
          <textarea className="notif-textarea" value={message} onChange={e => setMessage(e.target.value)} placeholder="Write your message here..." rows={4} />
        </div>
        <div className="notif-attach-row">
          <button type="button" className="admp-btn admp-btn-outline" onClick={() => fileRef.current?.click()}>
            📎 {fileName || 'Attach Image / PDF'}
          </button>
          {fileName && <button type="button" className="notif-clear-file" onClick={() => { setFile(null); setFileName(''); if (fileRef.current) fileRef.current.value = ''; }}>✕</button>}
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" style={{ display: 'none' }} onChange={handleFileChange} />
        </div>
        <div className="team-form-actions">
          <button type="submit" className="admp-btn admp-btn-primary" disabled={posting}>
            {posting ? 'Posting...' : '📢 Post Notification'}
          </button>
          {msg && <span className={`admp-inline-msg ${msg === 'Posted!' ? 'ok' : 'err'}`}>{msg}</span>}
        </div>
      </form>

      <div className="admp-tab-header" style={{ marginTop: 24 }}>
        <span className="admp-tab-title">Posted Notifications <span className="admp-count">{notifs.length}</span></span>
      </div>

      {notifs.length === 0 ? (
        <div className="admp-loading">No notifications yet.</div>
      ) : (
        <div className="notif-admin-list">
          {notifs.map(n => (
            <div key={n.id} className="notif-admin-item">
              <div className="notif-admin-item-main">
                {n.title && <div className="notif-admin-title">{n.title}</div>}
                {n.message && <div className="notif-admin-msg">{n.message}</div>}
                <div className="notif-admin-meta">
                  {fmtDate(n.createdAt)}
                  {n.hasFile && <span className="notif-admin-badge">{n.fileType === 'application/pdf' ? '📄 PDF' : '🖼 Image'}</span>}
                </div>
              </div>
              <button className="tj-del-btn" onClick={() => handleDelete(n.id)} title="Delete">✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── AI Train Tab ─────────────────────────────────────────────────────────────
function AITrainTab() {
  const [status,   setStatus]   = useState(null);
  const [running,  setRunning]  = useState(false);
  const [msg,      setMsg]      = useState('');
  const [summary,  setSummary]  = useState(null);

  const loadStatus = useCallback(async () => {
    try {
      const d = await API('/api/trainai/status');
      setStatus(d.status);
      if (!d.status?.running) setRunning(false);
    } catch {}
  }, []);

  useEffect(() => {
    loadStatus();
    const id = setInterval(loadStatus, 4000);
    return () => clearInterval(id);
  }, [loadStatus]);

  const runAI = async (force) => {
    setRunning(true); setMsg('');
    try {
      const d = await API('/api/trainai/run', {
        method: 'POST', body: { force },
      });
      setMsg(d.message || (d.success ? 'Started!' : 'Failed'));
      if (d.success) {
        const poll = setInterval(async () => {
          const s = await API('/api/trainai/status');
          if (!s.status?.running) {
            clearInterval(poll);
            setRunning(false);
            const r = s.status?.last_result;
            setMsg(`Done! ${r?.analyzed || 0} days analyzed, ${r?.skipped || 0} skipped, ${r?.errors || 0} errors.`);
          }
        }, 3000);
      }
    } catch { setMsg('Error'); setRunning(false); }
    setTimeout(() => setMsg(''), 10000);
  };

  return (
    <div className="admp-tab">
      <div className="admp-tab-header">
        <span className="admp-tab-title">AI Train — Pattern Analysis</span>
      </div>
      <div className="admp-sys-grid">
        <div className="admp-sys-card">
          <div className="admp-sys-label">Engine Status</div>
          <div className="admp-sys-val">
            <span className={`admp-dot ${running ? 'green' : 'grey'}`} style={{ marginRight: 8 }} />
            {running ? 'Analyzing…' : status?.last_run
              ? `Last run: ${new Date(status.last_run).toLocaleString('en-IN', { hour12: false, dateStyle: 'short', timeStyle: 'short' })}`
              : 'Never run'}
          </div>
          {status?.last_result && (
            <div className="admp-sys-meta">
              <span>Analyzed: <b>{status.last_result.analyzed}</b></span>
              <span>Skipped: <b>{status.last_result.skipped}</b></span>
              <span>Errors: <b>{status.last_result.errors}</b></span>
            </div>
          )}
          <div className="admp-sys-btns" style={{ gap: 8 }}>
            <button
              className="admp-btn admp-btn-success"
              onClick={() => runAI(false)}
              disabled={running}
            >
              {running ? '⟳ Running…' : '▶ Run AI Analysis'}
            </button>
            <button
              className="admp-btn admp-btn-outline"
              onClick={() => runAI(true)}
              disabled={running}
              title="Force re-analyze all dates"
            >
              ↺ Force All
            </button>
          </div>
          {msg && <div className="admp-msg">{msg}</div>}
        </div>
        <div className="admp-sys-card">
          <div className="admp-sys-label">How It Works</div>
          <div className="admp-sys-meta" style={{ lineHeight: 1.8 }}>
            <span>✦ Reads all your option chain snapshots</span>
            <span>✦ Computes PCR, OI shifts, IV skew, writing signals</span>
            <span>✦ Compares indicators to price moves 10-30 min later</span>
            <span>✦ Finds patterns that predict direction with X min lead</span>
            <span>✦ Saves <code>_trainai.json</code> in each date folder</span>
            <span>✦ Auto-runs at 15:35 IST after market close</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Indicators Tab ────────────────────────────────────────────────────────────
const ROLE_COLS = [
  { key: 'admin',  label: 'Admin',  color: '#b71c1c' },
  { key: 'member', label: 'Member', color: '#1565c0' },
  { key: 'user',   label: 'User',   color: '#2e7d32' },
];

function IndicatorsTab() {
  const [indicators, setIndicators] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const [msg,        setMsg]        = useState('');

  useEffect(() => {
    API('/api/indicators')
      .then(d => { if (d.success) setIndicators(d.indicators || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggle = (id, role) => {
    setIndicators(prev => prev.map(ind =>
      ind.id === id ? { ...ind, [role]: !ind[role] } : ind
    ));
  };

  const save = async () => {
    setSaving(true); setMsg('');
    try {
      const d = await API('/api/indicators', { method: 'POST', body: { indicators } });
      setMsg(d.message || (d.success ? 'Saved!' : 'Failed'));
    } catch { setMsg('Error saving'); }
    setSaving(false);
    setTimeout(() => setMsg(''), 3000);
  };

  if (loading) return <div className="admp-loading">Loading indicators…</div>;

  return (
    <div className="admp-tab">
      <div className="admp-tab-header">
        <span className="admp-tab-title">Indicator Access Control</span>
        <div className="admp-tab-actions">
          <button className="admp-btn admp-btn-primary" onClick={save} disabled={saving}>
            {saving ? '…' : '💾 Save'}
          </button>
        </div>
      </div>
      {msg && <div className="admp-msg">{msg}</div>}
      <div className="admp-table-wrap">
        <table className="admp-table">
          <thead>
            <tr>
              <th>Indicator</th>
              <th>Description</th>
              {ROLE_COLS.map(r => (
                <th key={r.key} style={{ color: r.color, textAlign: 'center' }}>{r.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {indicators.map(ind => (
              <tr key={ind.id}>
                <td className="admp-name" style={{ fontWeight: 700 }}>{ind.name}</td>
                <td style={{ fontSize: 12, opacity: 0.65 }}>{ind.desc}</td>
                {ROLE_COLS.map(r => (
                  <td key={r.key} style={{ textAlign: 'center' }}>
                    {r.key === 'admin'
                      ? <span style={{ opacity: 0.4 }}>✓</span>
                      : (
                        <input
                          type="checkbox"
                          checked={!!ind[r.key]}
                          onChange={() => toggle(ind.id, r.key)}
                          style={{ width: 16, height: 16, cursor: 'pointer', accentColor: r.color }}
                        />
                      )
                    }
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11, opacity: 0.5, padding: '10px 0' }}>
        Admin always has full access. Toggle Member and User access per indicator.
      </div>
    </div>
  );
}

// ── Subscriptions Tab ────────────────────────────────────────────────────────
function SubscriptionsTab() {
  const [subs, setSubs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [filter, setFilter]   = useState('active');

  const loadSubs = useCallback(() => {
    setLoading(true);
    API('/api/subscription/admin/subscriptions')
      .then(d => { if (d.success) setSubs(d.subscriptions || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadSubs(); }, [loadSubs]);

  const fmt    = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const fmtAmt = (p) => p != null ? `₹${(p / 100).toLocaleString('en-IN')}` : '—';

  const filtered = subs.filter(s => {
    if (filter !== 'all' && s.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return s.userName?.toLowerCase().includes(q) ||
             s.userEmail?.toLowerCase().includes(q) ||
             (s.userMobile || '').includes(search) ||
             s.planName?.toLowerCase().includes(q);
    }
    return true;
  });

  const STATUS_PILL = { active: { bg: '#e8f5e9', color: '#1b5e20' }, expired: { bg: '#f5f5f5', color: '#666' }, cancelled: { bg: '#fbe9e7', color: '#b71c1c' }, pending: { bg: '#fff3e0', color: '#e65100' } };

  return (
    <div className="admp-tab">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div className="admp-section-title">💳 Payments</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {['active', 'expired', 'all'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`admp-btn admp-btn-sm ${filter === f ? 'admp-btn-primary' : 'admp-btn-outline'}`}
              style={{ textTransform: 'capitalize' }}>{f}</button>
          ))}
          <input className="admp-input" style={{ minWidth: 200, flex: 'unset' }} placeholder="Search name / email / mobile / plan…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>
      {loading ? <div className="admp-empty">Loading…</div> : (
        <div style={{ overflowX: 'auto' }}>
          <table className="admp-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Mobile</th>
                <th>Plan</th>
                <th>Amount</th>
                <th>Valid From</th>
                <th>Valid To</th>
                <th>Coupon</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && <tr><td colSpan={9} className="admp-empty">No records</td></tr>}
              {filtered.map(s => {
                const pill = STATUS_PILL[s.status] || STATUS_PILL.expired;
                return (
                  <tr key={s._id}>
                    <td style={{ fontWeight: 600 }}>{s.userName || '—'}</td>
                    <td style={{ fontSize: 12 }}>{s.userEmail || '—'}</td>
                    <td style={{ fontSize: 12 }}>{s.userMobile || '—'}</td>
                    <td style={{ fontWeight: 700 }}>{s.planName}</td>
                    <td style={{ fontWeight: 700, color: '#1b5e20' }}>{fmtAmt(s.amountPaid)}</td>
                    <td style={{ fontSize: 12 }}>{fmt(s.startDate)}</td>
                    <td style={{ fontSize: 12 }}>{fmt(s.endDate)}</td>
                    <td style={{ fontSize: 11, color: '#888', fontFamily: 'monospace' }}>{s.couponCode || '—'}</td>
                    <td><span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 10, fontSize: 11, fontWeight: 800, background: pill.bg, color: pill.color }}>{s.status}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Coupons Tab ───────────────────────────────────────────────────────────────
function CouponsTab() {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg]         = useState('');
  const [form, setForm]       = useState({ code: '', type: 'flat', value: '', maxUses: 100, description: '', validFrom: '', validUntil: '' });
  const [showForm, setShowForm] = useState(false);

  const loadCoupons = useCallback(() => {
    setLoading(true);
    API('/api/subscription/admin/coupons')
      .then(d => { if (d.success) setCoupons(d.coupons || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadCoupons(); }, [loadCoupons]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.code.trim() || !form.value) return setMsg('Code and value are required');
    const d = await API('/api/subscription/admin/coupons', {
      method: 'POST',
      body: { ...form, code: form.code.trim().toUpperCase(), value: parseFloat(form.value), maxUses: parseInt(form.maxUses) || 100, validFrom: form.validFrom || undefined, validUntil: form.validUntil || undefined },
    });
    setMsg(d.success ? '✅ Coupon created!' : `Error: ${d.error || 'Failed'}`);
    if (d.success) { loadCoupons(); setForm({ code: '', type: 'flat', value: '', maxUses: 100, description: '', validFrom: '', validUntil: '' }); setShowForm(false); }
    setTimeout(() => setMsg(''), 4000);
  };

  const toggleActive = async (id, current) => {
    const d = await API(`/api/subscription/admin/coupons/${id}`, { method: 'PATCH', body: { isActive: !current } });
    setMsg(d.success ? `✅ ${!current ? 'Enabled' : 'Disabled'}` : `Error: ${d.error}`);
    if (d.success) loadCoupons();
    setTimeout(() => setMsg(''), 3000);
  };

  const deleteCoupon = async (id, code) => {
    if (!window.confirm(`Delete coupon "${code}"?`)) return;
    const d = await API(`/api/subscription/admin/coupons/${id}`, { method: 'DELETE' });
    setMsg(d.success ? '✅ Deleted' : `Error: ${d.error}`);
    if (d.success) loadCoupons();
    setTimeout(() => setMsg(''), 3000);
  };

  const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'No limit';

  return (
    <div className="admp-tab">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div className="admp-section-title">🏷️ Coupon Codes</div>
        <button className="admp-btn admp-btn-primary" onClick={() => setShowForm(s => !s)}>{showForm ? '✕ Cancel' : '+ New Coupon'}</button>
      </div>

      {msg && <div className={`admp-msg ${msg.startsWith('✅') ? 'success' : 'error'}`} style={{ marginBottom: 14 }}>{msg}</div>}

      {showForm && (
        <div className="admp-card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: '#1a1a2e', marginBottom: 14 }}>Create New Coupon</div>
          <form onSubmit={handleCreate}>
            <div className="admp-form-grid" style={{ marginBottom: 12 }}>
              <div>
                <label className="admp-label">Code *</label>
                <input className="admp-input" placeholder="SAVE50" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} />
              </div>
              <div>
                <label className="admp-label">Type</label>
                <select className="admp-input" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                  <option value="flat">Flat (₹ off)</option>
                  <option value="percent">Percent (% off)</option>
                </select>
              </div>
              <div>
                <label className="admp-label">Value * {form.type === 'flat' ? '(₹)' : '(%)'}</label>
                <input className="admp-input" type="number" min="1" placeholder={form.type === 'flat' ? '100' : '10'} value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} />
              </div>
              <div>
                <label className="admp-label">Max Uses</label>
                <input className="admp-input" type="number" min="1" value={form.maxUses} onChange={e => setForm(f => ({ ...f, maxUses: e.target.value }))} />
              </div>
              <div>
                <label className="admp-label">Valid From</label>
                <input className="admp-input" type="date" value={form.validFrom} onChange={e => setForm(f => ({ ...f, validFrom: e.target.value }))} />
              </div>
              <div>
                <label className="admp-label">Valid Until</label>
                <input className="admp-input" type="date" value={form.validUntil} onChange={e => setForm(f => ({ ...f, validUntil: e.target.value }))} />
              </div>
              <div className="admp-form-grid-full">
                <label className="admp-label">Description (internal)</label>
                <input className="admp-input" placeholder="e.g. Launch offer for Oct 2026" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              </div>
            </div>
            <button className="admp-btn admp-btn-primary" type="submit">Create Coupon</button>
          </form>
        </div>
      )}

      {loading ? <div className="admp-empty">Loading…</div> : (
        <div style={{ overflowX: 'auto' }}>
          <table className="admp-table">
            <thead><tr><th>Code</th><th>Type</th><th>Value</th><th>Used / Max</th><th>Valid Until</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {coupons.length === 0 && <tr><td colSpan={7} className="admp-empty">No coupons yet</td></tr>}
              {coupons.map(c => (
                <tr key={c._id}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 800, letterSpacing: 1, color: '#1a1a2e' }}>{c.code}</td>
                  <td style={{ textTransform: 'capitalize' }}>{c.type}</td>
                  <td style={{ fontWeight: 700 }}>{c.type === 'flat' ? `₹${c.value}` : `${c.value}%`}</td>
                  <td>{c.usedCount} / {c.maxUses}</td>
                  <td style={{ fontSize: 12 }}>{fmt(c.validUntil)}</td>
                  <td>
                    <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 10, fontSize: 11, fontWeight: 800,
                      background: c.isActive ? '#e8f5e9' : '#f5f5f5', color: c.isActive ? '#1b5e20' : '#888' }}>
                      {c.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <button className="admp-btn admp-btn-sm admp-btn-outline" style={{ marginRight: 6 }} onClick={() => toggleActive(c._id, c.isActive)}>
                      {c.isActive ? 'Disable' : 'Enable'}
                    </button>
                    <button className="admp-btn admp-btn-sm admp-btn-danger" onClick={() => deleteCoupon(c._id, c.code)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Plans Tab ─────────────────────────────────────────────────────────────────
function PlansTab() {
  const [plans, setPlans]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [msg, setMsg]           = useState('');
  const [editing, setEditing]   = useState(null);
  const [editForm, setEditForm] = useState({});
  const [showAdd, setShowAdd]   = useState(false);
  const [addForm, setAddForm]   = useState({ name: '', price: '', communityPrice: '', durationDays: '', badge: '', category: 'Regular', description: '' });

  const loadPlans = useCallback(() => {
    setLoading(true);
    API('/api/subscription/admin/plans')
      .then(d => { if (d.success) setPlans(d.plans || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadPlans(); }, [loadPlans]);

  const startEdit = (plan) => {
    setEditing(plan._id);
    setEditForm({
      name: plan.name,
      price: (plan.price / 100).toFixed(0),
      communityPrice: plan.communityPrice ? (plan.communityPrice / 100).toFixed(0) : '',
      durationDays: plan.durationDays,
      badge: plan.badge || '',
      category: plan.category || 'Regular',
      isActive: plan.isActive !== false,
    });
  };

  const saveEdit = async (id) => {
    const body = {
      name: editForm.name,
      price: parseFloat(editForm.price),
      durationDays: parseInt(editForm.durationDays),
      badge: editForm.badge,
      isActive: editForm.isActive,
      category: editForm.category || 'Regular',
    };
    if (editForm.communityPrice) body.communityPrice = parseFloat(editForm.communityPrice);
    else body.communityPrice = null;
    const d = await API(`/api/subscription/admin/plans/${id}`, { method: 'PATCH', body });
    setMsg(d.success ? '✅ Plan updated!' : `Error: ${d.error || 'Failed'}`);
    if (d.success) { setEditing(null); loadPlans(); }
    setTimeout(() => setMsg(''), 3000);
  };

  const addPlan = async (e) => {
    e.preventDefault();
    if (!addForm.name || !addForm.price || !addForm.durationDays) return setMsg('Name, price and duration are required');
    const body = {
      name: addForm.name,
      price: parseFloat(addForm.price),
      durationDays: parseInt(addForm.durationDays),
      badge: addForm.badge,
      description: addForm.description,
      category: addForm.category || 'Regular',
    };
    if (addForm.communityPrice) body.communityPrice = parseFloat(addForm.communityPrice);
    const d = await API('/api/subscription/admin/plans', { method: 'POST', body });
    setMsg(d.success ? '✅ Plan created!' : `Error: ${d.error || 'Failed'}`);
    if (d.success) { setShowAdd(false); setAddForm({ name: '', price: '', communityPrice: '', durationDays: '', badge: '', category: 'Regular', description: '' }); loadPlans(); }
    setTimeout(() => setMsg(''), 3000);
  };

  const fmtAmt = (p) => `₹${(p / 100).toLocaleString('en-IN')}`;

  return (
    <div className="admp-tab">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div className="admp-section-title">📋 Subscription Plans</div>
        <button className="admp-btn admp-btn-primary" onClick={() => setShowAdd(s => !s)}>{showAdd ? '✕ Cancel' : '+ New Plan'}</button>
      </div>

      {msg && <div className={`admp-msg ${msg.startsWith('✅') ? 'success' : 'error'}`} style={{ marginBottom: 14 }}>{msg}</div>}

      {showAdd && (
        <div className="admp-card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 800, fontSize: 13, color: '#1a1a2e', marginBottom: 14 }}>New Plan</div>
          <form onSubmit={addPlan}>
            <div className="admp-form-grid" style={{ marginBottom: 12 }}>
              <div>
                <label className="admp-label">Plan Name *</label>
                <input className="admp-input" placeholder="Monthly" value={addForm.name} onChange={e => setAddForm(f => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="admp-label">Category *</label>
                <select className="admp-input" value={addForm.category} onChange={e => setAddForm(f => ({ ...f, category: e.target.value }))}>
                  <option value="Regular">Regular</option>
                  <option value="Advance">Advance</option>
                  <option value="Courses">Courses</option>
                </select>
              </div>
              <div>
                <label className="admp-label">Price (₹) *</label>
                <input className="admp-input" type="number" min="1" placeholder="499" value={addForm.price} onChange={e => setAddForm(f => ({ ...f, price: e.target.value }))} />
              </div>
              <div>
                <label className="admp-label">Community Price (₹)</label>
                <input className="admp-input" type="number" min="1" placeholder="399 (optional)" value={addForm.communityPrice} onChange={e => setAddForm(f => ({ ...f, communityPrice: e.target.value }))} />
              </div>
              <div>
                <label className="admp-label">Duration (days) *</label>
                <input className="admp-input" type="number" min="1" placeholder="30" value={addForm.durationDays} onChange={e => setAddForm(f => ({ ...f, durationDays: e.target.value }))} />
              </div>
              <div>
                <label className="admp-label">Badge (optional)</label>
                <input className="admp-input" placeholder="Most Popular" value={addForm.badge} onChange={e => setAddForm(f => ({ ...f, badge: e.target.value }))} />
              </div>
              <div className="admp-form-grid-full">
                <label className="admp-label">Description</label>
                <input className="admp-input" placeholder="Full access for 1 month" value={addForm.description} onChange={e => setAddForm(f => ({ ...f, description: e.target.value }))} />
              </div>
            </div>
            <button className="admp-btn admp-btn-primary" type="submit">Create Plan</button>
          </form>
        </div>
      )}

      {loading ? <div className="admp-empty">Loading…</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {plans.length === 0 && <div className="admp-empty">No plans found</div>}
          {plans.map(plan => (
            <div key={plan._id} className="admp-card">
              {editing === plan._id ? (
                <>
                  <div style={{ fontWeight: 800, fontSize: 13, color: '#1a1a2e', marginBottom: 12 }}>Editing: {plan.name}</div>
                  <div className="admp-form-grid" style={{ marginBottom: 12 }}>
                    <div><label className="admp-label">Name</label><input className="admp-input" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} /></div>
                    <div>
                      <label className="admp-label">Category</label>
                      <select className="admp-input" value={editForm.category || 'Regular'} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))}>
                        <option value="Regular">Regular</option>
                        <option value="Advance">Advance</option>
                        <option value="Courses">Courses</option>
                      </select>
                    </div>
                    <div><label className="admp-label">Price (₹)</label><input className="admp-input" type="number" value={editForm.price} onChange={e => setEditForm(f => ({ ...f, price: e.target.value }))} /></div>
                    <div><label className="admp-label">Community Price (₹)</label><input className="admp-input" type="number" placeholder="Leave blank to remove" value={editForm.communityPrice || ''} onChange={e => setEditForm(f => ({ ...f, communityPrice: e.target.value }))} /></div>
                    <div><label className="admp-label">Duration (days)</label><input className="admp-input" type="number" value={editForm.durationDays} onChange={e => setEditForm(f => ({ ...f, durationDays: e.target.value }))} /></div>
                    <div><label className="admp-label">Badge</label><input className="admp-input" value={editForm.badge} onChange={e => setEditForm(f => ({ ...f, badge: e.target.value }))} /></div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#444', cursor: 'pointer' }}>
                      <input type="checkbox" checked={editForm.isActive} onChange={e => setEditForm(f => ({ ...f, isActive: e.target.checked }))} />
                      Active (visible to users)
                    </label>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                      <button className="admp-btn admp-btn-primary admp-btn-sm" onClick={() => saveEdit(plan._id)}>Save Changes</button>
                      <button className="admp-btn admp-btn-sm admp-btn-outline" onClick={() => setEditing(null)}>Cancel</button>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <span style={{ fontSize: 15, fontWeight: 900, color: '#1a1a2e' }}>{plan.name}</span>
                      {plan.badge && <span style={{ fontSize: 10, background: '#fff3e0', color: '#e65100', padding: '2px 8px', borderRadius: 10, fontWeight: 800, border: '1px solid #ff6f00' }}>{plan.badge}</span>}
                      {plan.isActive === false && <span style={{ fontSize: 10, background: '#f5f5f5', color: '#888', padding: '2px 8px', borderRadius: 10, border: '1px solid #ddd' }}>Hidden</span>}
                    </div>
                    <div style={{ fontSize: 13, color: '#444' }}>
                      <strong style={{ color: '#ff6f00' }}>{fmtAmt(plan.price)}</strong>
                      {plan.communityPrice && <span style={{ color: '#15803d', marginLeft: 6, fontSize: 11 }}>Community: {fmtAmt(plan.communityPrice)}</span>}
                      <span style={{ color: '#888', marginLeft: 8 }}>{plan.durationDays} days · {fmtAmt(Math.round(plan.price / plan.durationDays))}/day</span>
                      {plan.category && plan.category !== 'Regular' && <span style={{ marginLeft: 8, fontSize: 10, background: '#e8eaf6', color: '#3949ab', padding: '1px 7px', borderRadius: 8, fontWeight: 700 }}>{plan.category}</span>}
                    </div>
                  </div>
                  <button className="admp-btn admp-btn-sm admp-btn-outline" onClick={() => startEdit(plan)}>Edit</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Token Tab — update Upstox access tokens (no secondary login needed) ──────
function TokenTab({ adminToken }) {
  const [token1, setToken1]   = useState('');
  const [token2, setToken2]   = useState('');
  const [msg1, setMsg1]       = useState('');
  const [msg2, setMsg2]       = useState('');

  const submit = async (e, slot) => {
    e.preventDefault();
    const val = slot === 1 ? token1 : token2;
    const setMsg = slot === 1 ? setMsg1 : setMsg2;
    const endpoint = slot === 1 ? '/api/admin/token' : '/api/admin/token2';
    setMsg('Saving...');
    try {
      const d = adminToken
        ? await ADMIN_API(endpoint, adminToken, { method: 'POST', body: { access_token: val } })
        : await API(endpoint, { method: 'POST', body: { access_token: val } });
      setMsg(d.message || (d.success ? 'Token updated! Fetching restarted.' : d.error || 'Failed'));
      if (d.success) { slot === 1 ? setToken1('') : setToken2(''); }
    } catch { setMsg('Network error'); }
  };

  return (
    <div className="admp-tab">
      <div className="admp-tab-header">
        <span className="admp-tab-title">Access Tokens</span>
        <span style={{ fontSize: 12, color: '#64748b' }}>Paste your daily Upstox access token here</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 600, marginTop: 16 }}>
        <div className="admp-sys-card">
          <div className="admp-sys-label">API Key 1 — Primary</div>
          <form onSubmit={e => submit(e, 1)} className="admp-token-form">
            <input
              className="admp-input"
              placeholder="Paste Upstox access token for slot 1..."
              value={token1}
              onChange={e => setToken1(e.target.value)}
            />
            <button className="admp-btn admp-btn-primary" type="submit" disabled={!token1}>
              Update
            </button>
          </form>
          {msg1 && <div className={`admp-msg${msg1.includes('error') || msg1.includes('Failed') ? ' error' : ''}`}>{msg1}</div>}
        </div>

        <div className="admp-sys-card">
          <div className="admp-sys-label">
            API Key 2 — Failover
            <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.6, marginLeft: 6 }}>auto-switches on rate limit</span>
          </div>
          <form onSubmit={e => submit(e, 2)} className="admp-token-form">
            <input
              className="admp-input"
              placeholder="Paste Upstox access token for slot 2..."
              value={token2}
              onChange={e => setToken2(e.target.value)}
            />
            <button className="admp-btn admp-btn-primary" type="submit" disabled={!token2}>
              Update
            </button>
          </form>
          {msg2 && <div className={`admp-msg${msg2.includes('error') || msg2.includes('Failed') ? ' error' : ''}`}>{msg2}</div>}
        </div>
      </div>
    </div>
  );
}

// ── Main AdminPanel ──────────────────────────────────────────────────────────
const TABS_ADMIN  = ['Users', 'Team', 'Notifications', 'Indicators', 'AI Train', 'Meet', 'Subscriptions', 'Coupons', 'Plans', 'Token', 'System', 'Schedule', 'Logs'];

// ── Meet Tab ─────────────────────────────────────────────────────────────────
function MeetTab() {
  const [links, setLinks]   = useState({ public_meet: '', community_meet: '' });
  const [msg, setMsg]       = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/api/meet-links`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.success) setLinks(d.links); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async (e) => {
    e.preventDefault();
    const d = await API('/api/admin/meet-links', { method: 'POST', body: links });
    setMsg(d.success ? '✅ Meet links saved!' : `❌ ${d.error || 'Failed'}`);
    setTimeout(() => setMsg(''), 3000);
  };

  if (loading) return <div className="admp-tab"><div className="admp-empty">Loading…</div></div>;

  return (
    <div className="admp-tab">
      <div className="admp-section-title">📹 Meet Links</div>
      <form onSubmit={save} style={{ maxWidth: 520 }}>
        <div style={{ marginBottom: 16 }}>
          <label className="admp-label">Public Meet Link (7PM–8PM Daily)</label>
          <input
            className="admp-input"
            type="url"
            placeholder="https://meet.google.com/..."
            value={links.public_meet}
            onChange={e => setLinks(l => ({ ...l, public_meet: e.target.value }))}
          />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label className="admp-label">Community Meet Link (Members Only)</label>
          <input
            className="admp-input"
            type="url"
            placeholder="https://meet.google.com/..."
            value={links.community_meet}
            onChange={e => setLinks(l => ({ ...l, community_meet: e.target.value }))}
          />
        </div>
        <button className="admp-btn admp-btn-primary" type="submit">Save Links</button>
        {msg && <div className={`admp-msg ${msg.startsWith('✅') ? 'success' : 'error'}`} style={{ marginTop: 12 }}>{msg}</div>}
      </form>
    </div>
  );
}
const TABS_MEMBER = ['Users', 'AI Train'];

export default function AdminPanel() {
  useBodyScroll();
  const { state } = useApp();
  const userRole  = state.user?.role || 'user';
  const isAdmin   = userRole === 'admin';

  const tabs = isAdmin ? TABS_ADMIN : TABS_MEMBER;
  const [activeTab, setActiveTab] = useState('Users');

  // Admin system token (needed for admin-only API routes)
  const [adminToken, setAdminToken]     = useState(() => localStorage.getItem('adminToken') || '');
  const [tokenInput, setTokenInput]     = useState('');
  const [tokenError, setTokenError]     = useState('');
  const [tokenChecked, setTokenChecked] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    if (!adminToken) { setTokenChecked(true); return; }
    ADMIN_API('/api/admin/status', adminToken)
      .then(d => {
        if (!d.success) { localStorage.removeItem('adminToken'); setAdminToken(''); }
        setTokenChecked(true);
      })
      .catch(() => { setTokenChecked(true); });
  }, [isAdmin, adminToken]);

  const handleTokenLogin = async (e) => {
    e.preventDefault();
    setTokenError('');
    try {
      const parts = tokenInput.includes(':') ? tokenInput.split(':') : null;
      if (!parts) { setTokenError('Format: username:password'); return; }
      const d = await fetch(`${API_BASE}/api/admin/login`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: parts[0], password: parts[1] }),
      }).then(r => r.json());
      if (d.success) {
        localStorage.setItem('adminToken', d.token);
        setAdminToken(d.token);
        setTokenInput('');
      } else {
        setTokenError(d.message || 'Invalid credentials');
      }
    } catch { setTokenError('Network error'); }
  };

  // For admin tabs that need system token, show a login prompt if token missing
  const needsToken = isAdmin && ['System', 'Schedule', 'Logs'].includes(activeTab);
  const isAdminOrMember = isAdmin || userRole === 'member';


  return (
    <div className="admp-page">

      {/* ── Header ── */}
      <div className="admp-header">
        <div className="admp-header-left">
          <span className="admp-header-icon">⚙️</span>
          <div>
            <div className="admp-header-title">Admin Panel</div>
            <div className="admp-header-sub">
              {isAdmin ? 'Full access' : 'Member — read-only'}
            </div>
          </div>
        </div>
        <div className="admp-header-role">
          <span className="admp-role-badge-lg" style={{ background: ROLE_COLORS[userRole] }}>
            {ROLE_LABELS[userRole]}
          </span>
          <span className="admp-header-user">{state.user?.name || state.user?.email || ''}</span>
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="admp-tabs">
        {tabs.map(tab => (
          <button
            key={tab}
            className={`admp-tab-btn${activeTab === tab ? ' active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'Users' && '👥 '}
            {tab === 'Team' && '🤝 '}
            {tab === 'Notifications' && '🔔 '}
            {tab === 'Indicators' && '🎛️ '}
            {tab === 'AI Train' && '🧠 '}
            {tab === 'Meet' && '📹 '}
            {tab === 'Subscriptions' && '💳 '}
            {tab === 'Coupons' && '🏷️ '}
            {tab === 'Plans' && '📋 '}
            {tab === 'Token' && '🔑 '}
            {tab === 'System' && '🖥️ '}
            {tab === 'Schedule' && '🕐 '}
            {tab === 'Logs' && '📋 '}
            {tab}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="admp-content">
        {activeTab === 'Users' && <UsersTab isAdmin={isAdmin} />}
        {isAdmin && activeTab === 'Team' && <TeamTab />}
        {isAdmin && activeTab === 'Notifications' && <NotificationsTab />}
        {isAdmin && activeTab === 'Indicators' && <IndicatorsTab />}
        {isAdminOrMember && activeTab === 'AI Train' && <AITrainTab />}
        {isAdmin && activeTab === 'Meet' && <MeetTab />}
        {isAdmin && activeTab === 'Subscriptions' && <SubscriptionsTab />}
        {isAdmin && activeTab === 'Coupons' && <CouponsTab />}
        {isAdmin && activeTab === 'Plans' && <PlansTab />}
        {isAdmin && activeTab === 'Token' && <TokenTab adminToken={adminToken} />}

        {isAdmin && needsToken && !adminToken && tokenChecked && (
          <div className="admp-tab">
            <div className="admp-token-login">
              <div className="admp-token-login-title">System Access Required</div>
              <div className="admp-token-login-sub">Enter your admin credentials to access system settings</div>
              <form onSubmit={handleTokenLogin} className="admp-token-form">
                <input
                  className="admp-input"
                  placeholder="username:password"
                  value={tokenInput}
                  onChange={e => setTokenInput(e.target.value)}
                  type="password"
                />
                <button className="admp-btn admp-btn-primary" type="submit">Unlock</button>
              </form>
              {tokenError && <div className="admp-msg error">{tokenError}</div>}
            </div>
          </div>
        )}

        {isAdmin && activeTab === 'System'   && adminToken && <SystemTab   adminToken={adminToken} />}
        {isAdmin && activeTab === 'Schedule' && adminToken && <ScheduleTab adminToken={adminToken} />}
        {isAdmin && activeTab === 'Logs'     && adminToken && <LogsTab     adminToken={adminToken} />}
      </div>
    </div>
  );
}
