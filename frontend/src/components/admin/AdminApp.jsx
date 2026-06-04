import { useState, useEffect, useRef, useCallback } from 'react';
import './admin.css';

const API = (path, token, opts = {}) =>
  fetch(path, {
    ...opts,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  }).then(r => r.json());

// ─── Login Screen ─────────────────────────────────────────────────────────────
function LoginForm({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await API('/api/admin/login', null, {
        method: 'POST',
        body: { username, password },
      });
      if (data.success) {
        localStorage.setItem('adminToken', data.token);
        onLogin(data.token);
      } else {
        setError(data.message || 'Invalid credentials');
      }
    } catch {
      setError('Server unreachable');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="adm-login-wrap">
      <div className="adm-login-box">
        <div className="adm-login-logo">⚙ Admin Panel</div>
        <form onSubmit={handleSubmit}>
          <input
            className="adm-input"
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoFocus
          />
          <input
            className="adm-input"
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
          {error && <div className="adm-error">{error}</div>}
          <button className="adm-btn adm-btn-primary" type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

const INTERVAL_OPTIONS = [1, 2, 3, 5, 10, 15];

// ─── Status Card ──────────────────────────────────────────────────────────────
function StatusCard({ status, onStart, onStop, loading }) {
  const running = status?.is_running;
  const [interval, setInterval_] = useState(
    status?.refresh_interval_seconds || 10
  );

  // Sync selector to whatever the server is currently using
  useEffect(() => {
    if (status?.refresh_interval_seconds) setInterval_(status.refresh_interval_seconds);
  }, [status?.refresh_interval_seconds]);

  return (
    <div className="adm-card">
      <div className="adm-card-title">Server Status</div>
      <div className="adm-status-row">
        <span className={`adm-badge ${running ? 'green' : 'red'}`}>
          {running ? '● Running' : '● Stopped'}
        </span>

        {/* Fetch interval selector */}
        <div style={{ display:'flex', alignItems:'center', gap:'6px', marginLeft:'auto' }}>
          <label style={{ fontSize:'12px', color:'#666', whiteSpace:'nowrap' }}>Interval:</label>
          <select
            value={interval}
            onChange={e => setInterval_(Number(e.target.value))}
            disabled={loading}
            style={{
              padding:'4px 8px', borderRadius:'4px', border:'1px solid #ccc',
              fontSize:'13px', background:'#fff', cursor:'pointer', minWidth:'70px'
            }}
          >
            {INTERVAL_OPTIONS.map(s => (
              <option key={s} value={s}>{s}s</option>
            ))}
          </select>
        </div>

        <button
          className={`adm-btn ${running ? 'adm-btn-danger' : 'adm-btn-success'}`}
          onClick={running ? onStop : () => onStart(interval)}
          disabled={loading}
        >
          {loading ? '…' : running ? '⏹ Stop' : '▶ Start'}
        </button>

        {/* Change interval while running */}
        {running && (
          <button
            className="adm-btn adm-btn-primary"
            style={{ fontSize:'12px', padding:'4px 10px' }}
            onClick={() => onStart(interval)}
            disabled={loading}
            title="Restart fetching with new interval"
          >
            ↺ Apply
          </button>
        )}
      </div>

      <div className="adm-meta">
        <span>Interval: <b>{status?.refresh_interval_seconds ?? interval}s</b></span>
        <span>Last update: <b>{status?.last_update || '—'}</b></span>
        <span>Total updates: <b>{status?.total_updates ?? '—'}</b></span>
        {status?.current_expiry && <span>Expiry: <b>{status.current_expiry}</b></span>}
      </div>
    </div>
  );
}

// ─── Token Card ───────────────────────────────────────────────────────────────
function TokenCard({ token }) {
  const [value, setValue] = useState('');
  const [msg, setMsg] = useState('');

  const submit = async e => {
    e.preventDefault();
    setMsg('');
    try {
      const data = await API('/api/admin/token', token, {
        method: 'POST',
        body: { access_token: value },
      });
      setMsg(data.message || (data.success ? 'Updated!' : 'Failed'));
      if (data.success) setValue('');
    } catch {
      setMsg('Error updating token');
    }
  };

  return (
    <div className="adm-card">
      <div className="adm-card-title">Update Access Token</div>
      <form onSubmit={submit} className="adm-form-row">
        <input
          className="adm-input adm-input-grow"
          placeholder="Paste new Upstox access token…"
          value={value}
          onChange={e => setValue(e.target.value)}
        />
        <button className="adm-btn adm-btn-primary" type="submit" disabled={!value}>
          Update
        </button>
      </form>
      {msg && <div className="adm-msg">{msg}</div>}
    </div>
  );
}

// ─── Upstox API Keys Card ─────────────────────────────────────────────────────
function UpstoxConfigCard({ token }) {
  const BLANK = { name:'', api_key:'', api_secret:'', redirect_uri:'' };
  const [apps,       setApps]      = useState([]);
  const [adminEmail, setAdminEmail]= useState('');
  const [emailTime,  setEmailTime] = useState('08:00');
  const [newRow,     setNewRow]    = useState({ ...BLANK });
  const [editSecrets,setEditSecrets]=useState({}); // id -> secret value being typed
  const [editTokens, setEditTokens]=useState({}); // id -> token value being typed
  const [saving,     setSaving]    = useState(null); // id being saved
  const [adding,     setAdding]    = useState(false);
  const [deleting,   setDeleting]  = useState(null);
  const [sendingAll, setSendingAll]= useState(false);
  const [msg,        setMsg]       = useState('');

  const load = () => {
    API('/api/admin/upstox-apps', token).then(d => {
      if (!d.success) return;
      setApps(d.apps || []);
      setAdminEmail(d.admin_email || '');
      setEmailTime(d.email_time   || '08:00');
    }).catch(() => {});
  };
  useEffect(load, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveApp = async (app) => {
    setSaving(app.id); setMsg('');
    const body = { name: app.name, api_key: app.api_key, redirect_uri: app.redirect_uri };
    const secret = editSecrets[app.id];
    if (secret) body.api_secret = secret;
    try {
      const d = await API(`/api/admin/upstox-apps/${app.id}`, token, { method: 'PUT', body });
      if (d.success) { setEditSecrets(s => { const n={...s}; delete n[app.id]; return n; }); }
      // Save token separately if one was typed
      const manualToken = editTokens[app.id];
      if (manualToken !== undefined) {
        const td = await API(`/api/admin/upstox-apps/${app.id}/token`, token, {
          method: 'PATCH', body: { access_token: manualToken },
        });
        if (td.success) { setEditTokens(s => { const n={...s}; delete n[app.id]; return n; }); load(); }
        setMsg(td.message || (td.success ? 'Token saved!' : 'Token save failed'));
      } else {
        if (d.success) load();
        setMsg(d.message || (d.success ? 'Saved!' : 'Failed'));
      }
    } catch { setMsg('Error saving'); }
    finally { setSaving(null); }
  };

  const addApp = async () => {
    if (!newRow.name || !newRow.api_key) { setMsg('Name and API Key required'); return; }
    setAdding(true); setMsg('');
    try {
      const d = await API('/api/admin/upstox-apps', token, { method: 'POST', body: newRow });
      if (d.success) { setNewRow({ ...BLANK }); load(); }
      setMsg(d.message || (d.success ? 'App added!' : 'Failed'));
    } catch { setMsg('Error adding'); }
    finally { setAdding(false); }
  };

  const deleteApp = async (id, name) => {
    if (!window.confirm(`Delete "${name}"?`)) return;
    setDeleting(id);
    try {
      await API(`/api/admin/upstox-apps/${id}`, token, { method: 'DELETE', body: {} });
      load();
    } catch {} finally { setDeleting(null); }
  };

  const saveSettings = async () => {
    setMsg('');
    try {
      const d = await API('/api/admin/upstox-settings', token, { method:'POST', body:{ admin_email: adminEmail, email_time: emailTime } });
      setMsg(d.message || (d.success ? 'Settings saved!' : 'Failed'));
    } catch { setMsg('Error'); }
  };

  const sendAll = async () => {
    setSendingAll(true); setMsg('');
    try {
      const d = await API('/api/admin/upstox-auth/send-all-email', token, { method:'POST', body:{} });
      setMsg(d.message || (d.success ? 'Email sent!' : 'Failed'));
    } catch { setMsg('Error'); }
    finally { setSendingAll(false); }
  };

  const updateApp = (id, field, val) =>
    setApps(prev => prev.map(a => a.id === id ? { ...a, [field]: val } : a));

  const td = { padding:'6px 8px', verticalAlign:'middle' };

  return (
    <div className="adm-card" style={{ gridColumn:'1 / -1' }}>
      <div className="adm-card-title">
        Upstox API Keys
        <div style={{ display:'flex', gap:'6px' }}>
          {apps.map(a => (
            <span key={a.id} className={`adm-badge ${a.has_token ? 'green' : 'red'}`} style={{ fontSize:'11px' }}>
              {a.name}: {a.has_token ? '✓' : '✗'}
            </span>
          ))}
        </div>
      </div>

      {/* Apps table */}
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'13px' }}>
          <thead>
            <tr style={{ color:'#8b949e', borderBottom:'1px solid #30363d', fontSize:'11px' }}>
              <th style={{ ...td, textAlign:'left' }}>App Name</th>
              <th style={{ ...td, textAlign:'left' }}>API Key</th>
              <th style={{ ...td, textAlign:'left' }}>API Secret</th>
              <th style={{ ...td, textAlign:'left' }}>Redirect URI</th>
              <th style={{ ...td, textAlign:'left' }}>Token</th>
              <th style={{ ...td, textAlign:'left' }}></th>
            </tr>
          </thead>
          <tbody>
            {apps.map(a => (
              <tr key={a.id} style={{ borderBottom:'1px solid #21262d' }}>
                <td style={td}>
                  <input className="adm-input" style={{ marginBottom:0, minWidth:'100px' }} value={a.name}
                    onChange={e => updateApp(a.id, 'name', e.target.value)} />
                </td>
                <td style={td}>
                  <input className="adm-input" style={{ marginBottom:0, minWidth:'200px' }} value={a.api_key}
                    onChange={e => updateApp(a.id, 'api_key', e.target.value)} />
                </td>
                <td style={td}>
                  <input className="adm-input" style={{ marginBottom:0, minWidth:'120px' }} type="password"
                    placeholder={a.has_secret ? '(saved)' : 'Enter secret'}
                    value={editSecrets[a.id] || ''}
                    onChange={e => setEditSecrets(s => ({ ...s, [a.id]: e.target.value }))} />
                </td>
                <td style={td}>
                  <input className="adm-input" style={{ marginBottom:0, minWidth:'160px' }} value={a.redirect_uri}
                    onChange={e => updateApp(a.id, 'redirect_uri', e.target.value)} />
                </td>
                <td style={td}>
                  <div style={{ display:'flex', alignItems:'center', gap:'6px' }}>
                    <span className={`adm-badge ${a.has_token ? 'green' : 'red'}`} style={{ fontSize:'11px', flexShrink:0 }}>
                      {a.has_token ? '✓' : '✗'}
                    </span>
                    <input className="adm-input" style={{ marginBottom:0, minWidth:'160px' }} type="password"
                      placeholder={a.has_token ? '(active — paste to replace)' : 'Paste access token'}
                      value={editTokens[a.id] || ''}
                      onChange={e => setEditTokens(s => ({ ...s, [a.id]: e.target.value }))} />
                  </div>
                </td>
                <td style={{ ...td, whiteSpace:'nowrap' }}>
                  <button className="adm-btn adm-btn-primary" style={{ width:'auto', marginTop:0, padding:'5px 12px', marginRight:'4px' }}
                    disabled={saving === a.id} onClick={() => saveApp(a)}>
                    {saving === a.id ? '…' : '💾'}
                  </button>
                  <button className="adm-btn adm-btn-danger adm-btn-sm" style={{ padding:'5px 10px' }}
                    disabled={deleting === a.id} onClick={() => deleteApp(a.id, a.name)}>
                    {deleting === a.id ? '…' : '🗑'}
                  </button>
                </td>
              </tr>
            ))}
            {/* Add new row */}
            <tr style={{ borderTop:'2px solid #30363d', background:'#0d1117' }}>
              <td style={td}>
                <input className="adm-input" style={{ marginBottom:0 }} placeholder="App Name"
                  value={newRow.name} onChange={e => setNewRow(r => ({ ...r, name: e.target.value }))} />
              </td>
              <td style={td}>
                <input className="adm-input" style={{ marginBottom:0 }} placeholder="API Key"
                  value={newRow.api_key} onChange={e => setNewRow(r => ({ ...r, api_key: e.target.value }))} />
              </td>
              <td style={td}>
                <input className="adm-input" style={{ marginBottom:0 }} type="password" placeholder="API Secret"
                  value={newRow.api_secret} onChange={e => setNewRow(r => ({ ...r, api_secret: e.target.value }))} />
              </td>
              <td style={td}>
                <input className="adm-input" style={{ marginBottom:0 }} placeholder="Redirect URI"
                  value={newRow.redirect_uri} onChange={e => setNewRow(r => ({ ...r, redirect_uri: e.target.value }))} />
              </td>
              <td style={td} colSpan={2}>
                <button className="adm-btn adm-btn-success" style={{ width:'auto', marginTop:0 }}
                  disabled={adding} onClick={addApp}>
                  {adding ? '…' : '+ Add App'}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Settings row */}
      <div style={{ display:'flex', gap:'10px', alignItems:'flex-end', marginTop:'14px', flexWrap:'wrap' }}>
        <label className="adm-label" style={{ flex:1, minWidth:'180px' }}>Admin Email
          <input className="adm-input" style={{ marginBottom:0 }} type="email" placeholder="your@email.com"
            value={adminEmail} onChange={e => setAdminEmail(e.target.value)} />
        </label>
        <label className="adm-label">Daily Send Time (IST)
          <input className="adm-input adm-input-time" style={{ marginBottom:0 }} type="time"
            value={emailTime} onChange={e => setEmailTime(e.target.value)} />
        </label>
        <button className="adm-btn adm-btn-primary" style={{ width:'auto', marginTop:0 }} onClick={saveSettings}>
          💾 Save Settings
        </button>
        <button className="adm-btn adm-btn-success" style={{ width:'auto', marginTop:0 }}
          disabled={sendingAll} onClick={sendAll}>
          {sendingAll ? 'Sending…' : '📧 Send All Auth Links Now'}
        </button>
        {msg && <span className="adm-msg" style={{ margin:0 }}>{msg}</span>}
      </div>
      <div style={{ marginTop:'8px', fontSize:'11px', color:'#8b949e' }}>
        Auto-sends daily at <b style={{ color:'#c9d1d9' }}>{emailTime} IST</b> with all app links in one email → click each to generate token automatically.
      </div>
    </div>
  );
}

// ─── Schedule Card ────────────────────────────────────────────────────────────
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function ScheduleCard({ token, initialSchedule, initialEnabled }) {
  const [days, setDays] = useState(initialSchedule?.days || [1, 2, 3, 4, 5]);
  const [startTime, setStartTime] = useState(initialSchedule?.start_time || '09:15');
  const [stopTime, setStopTime] = useState(initialSchedule?.stop_time || '15:30');
  const [enabled, setEnabled] = useState(initialEnabled ?? true);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (initialSchedule) {
      setDays(initialSchedule.days || [1, 2, 3, 4, 5]);
      setStartTime(initialSchedule.start_time || '09:15');
      setStopTime(initialSchedule.stop_time || '15:30');
    }
    if (typeof initialEnabled === 'boolean') setEnabled(initialEnabled);
  }, [initialSchedule, initialEnabled]);

  const toggleDay = d => setDays(prev =>
    prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort()
  );

  const save = async () => {
    setMsg('');
    try {
      const data = await API('/api/admin/schedule', token, {
        method: 'POST',
        body: { schedule: { days, start_time: startTime, stop_time: stopTime }, enabled },
      });
      setMsg(data.message || (data.success ? 'Schedule saved!' : 'Failed'));
    } catch {
      setMsg('Error saving schedule');
    }
  };

  return (
    <div className="adm-card">
      <div className="adm-card-title">
        Schedule
        <label className="adm-toggle-label">
          <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />
          <span className={`adm-pill ${enabled ? 'green' : 'red'}`}>{enabled ? 'Enabled' : 'Disabled'}</span>
        </label>
      </div>
      <div className="adm-days-row">
        {DAYS.map((d, i) => (
          <button
            key={d}
            className={`adm-day-btn ${days.includes(i + 1) ? 'active' : ''}`}
            onClick={() => toggleDay(i + 1)}
          >
            {d}
          </button>
        ))}
      </div>
      <div className="adm-form-row" style={{ marginTop: '12px' }}>
        <label className="adm-label">Start
          <input className="adm-input adm-input-time" type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
        </label>
        <label className="adm-label">Stop
          <input className="adm-input adm-input-time" type="time" value={stopTime} onChange={e => setStopTime(e.target.value)} />
        </label>
        <button className="adm-btn adm-btn-primary" onClick={save}>Save</button>
      </div>
      {msg && <div className="adm-msg">{msg}</div>}
    </div>
  );
}

// ─── Logs Card ────────────────────────────────────────────────────────────────
function LogsCard({ token }) {
  const [logs, setLogs] = useState([]);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [msg, setMsg] = useState('');
  const bottomRef = useRef(null);
  const intervalRef = useRef(null);

  const fetchLogs = useCallback(async () => {
    try {
      const data = await API('/api/admin/logs?lines=80', token);
      if (data.success) setLogs(data.logs || []);
    } catch {}
  }, [token]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchLogs, 5000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [autoRefresh, fetchLogs]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const clearLogs = async () => {
    try {
      const data = await API('/api/admin/clear-logs', token, { method: 'POST' });
      setMsg(data.message || 'Cleared');
      fetchLogs();
    } catch {
      setMsg('Error clearing logs');
    }
  };

  return (
    <div className="adm-card adm-card-logs">
      <div className="adm-card-title">
        Server Logs
        <div style={{ display: 'flex', gap: '8px' }}>
          <label className="adm-toggle-label" style={{ fontSize: '12px' }}>
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />
            Auto-refresh
          </label>
          <button className="adm-btn adm-btn-sm" onClick={fetchLogs}>↻ Refresh</button>
          <button className="adm-btn adm-btn-sm adm-btn-danger" onClick={clearLogs}>Clear</button>
        </div>
      </div>
      {msg && <div className="adm-msg">{msg}</div>}
      <div className="adm-log-box">
        {logs.length === 0
          ? <span className="adm-log-empty">No logs</span>
          : logs.map((line, i) => (
            <div key={i} className={`adm-log-line ${line.includes('ERROR') || line.includes('❌') ? 'err' : line.includes('✅') || line.includes('SUCCESS') ? 'ok' : ''}`}>
              {line}
            </div>
          ))
        }
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
function Dashboard({ token, onLogout }) {
  const [status, setStatus] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [scheduleEnabled, setScheduleEnabled] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await API('/api/admin/status', token);
      if (data.success) setStatus(data.status);
      else if (data.message === 'Unauthorized' || data.message === 'Invalid token') onLogout();
    } catch {}
  }, [token, onLogout]);

  const fetchSchedule = useCallback(async () => {
    try {
      const data = await API('/api/admin/schedule', token);
      if (data.success) {
        setSchedule(data.schedule);
        setScheduleEnabled(data.enabled);
      }
    } catch {}
  }, [token]);

  useEffect(() => {
    fetchStatus();
    fetchSchedule();
    const id = setInterval(fetchStatus, 8000);
    return () => clearInterval(id);
  }, [fetchStatus, fetchSchedule]);

  const startFetching = async (intervalSeconds) => {
    setActionLoading(true);
    await API('/api/admin/start', token, {
      method: 'POST',
      body: { interval_seconds: intervalSeconds },
    });
    await fetchStatus();
    setActionLoading(false);
  };

  const stopFetching = async () => {
    setActionLoading(true);
    await API('/api/admin/stop', token, { method: 'POST' });
    await fetchStatus();
    setActionLoading(false);
  };

  return (
    <div className="adm-dashboard">
      <div className="adm-header">
        <span className="adm-header-title">⚙ Admin Panel</span>
        <button className="adm-btn adm-btn-sm" onClick={onLogout}>Logout</button>
      </div>
      <div className="adm-grid">
        <StatusCard status={status} onStart={startFetching} onStop={stopFetching} loading={actionLoading} />
        <TokenCard token={token} />
        <UpstoxConfigCard token={token} />
        <ScheduleCard token={token} initialSchedule={schedule} initialEnabled={scheduleEnabled} />
        <LogsCard token={token} />
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function AdminApp() {
  const [token, setToken] = useState(() => localStorage.getItem('adminToken') || null);
  const [verified, setVerified] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!token) { setChecking(false); return; }
    API('/api/admin/status', token)
      .then(data => {
        if (data.success) setVerified(true);
        else { localStorage.removeItem('adminToken'); setToken(null); }
      })
      .catch(() => { localStorage.removeItem('adminToken'); setToken(null); })
      .finally(() => setChecking(false));
  }, [token]);

  const handleLogin = t => { setToken(t); setVerified(true); };

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    setToken(null);
    setVerified(false);
  };

  if (checking) return <div className="adm-loading">Checking auth…</div>;
  if (!token || !verified) return <LoginForm onLogin={handleLogin} />;
  return <Dashboard token={token} onLogout={handleLogout} />;
}
