import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import './TradingJournal.css';

const API_BASE = process.env.REACT_APP_API_URL || '';

function useBodyScroll() {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'auto';
    return () => { document.body.style.overflow = prev || ''; };
  }, []);
}

const STRATEGIES = ['Bromos', 'MCTR', 'Other'];

const EMPTY_FORM = {
  date: new Date().toISOString().split('T')[0],
  symbol: '',
  strategy: 'Bromos',
  customStrategy: '',
  description: '',
  profit: '',
  loss: '',
};

function fmt(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function TradingJournal() {
  useBodyScroll();
  const { state } = useApp();
  const [entries, setEntries] = useState([]);
  const [form, setForm]       = useState(EMPTY_FORM);
  const [saving, setSaving]   = useState(false);
  const [msg, setMsg]         = useState('');
  const [filterStrat, setFilterStrat] = useState('All');

  const loadEntries = () => {
    fetch(`${API_BASE}/api/auth/journal`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.success) setEntries(d.entries || []); })
      .catch(() => {});
  };

  useEffect(() => { loadEntries(); }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.symbol.trim()) { setMsg('Symbol is required'); return; }
    setSaving(true); setMsg('');
    try {
      const r = await fetch(`${API_BASE}/api/auth/journal`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (d.success) {
        setEntries(prev => [d.entry, ...prev]);
        setForm({ ...EMPTY_FORM, date: form.date });
        setMsg('Entry saved!');
        setTimeout(() => setMsg(''), 3000);
      } else {
        setMsg(d.error || 'Save failed');
      }
    } catch { setMsg('Network error'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this entry?')) return;
    try {
      const r = await fetch(`${API_BASE}/api/auth/journal/${id}`, { method: 'DELETE', credentials: 'include' });
      const d = await r.json();
      if (d.success) setEntries(prev => prev.filter(e => e.id !== id));
    } catch {}
  };

  const handleShare = (entry) => {
    const W = 500;
    const PAD = 24;
    const net = (entry.profit || 0) - (entry.loss || 0);
    const stratLabel = entry.strategy === 'Other' ? (entry.customStrategy || 'Other') : entry.strategy;

    // Measure canvas helper for text wrap
    const tmpCtx = document.createElement('canvas').getContext('2d');
    const wrapText = (text, maxW) => {
      tmpCtx.font = '12px Arial';
      const words = text.split(' ');
      const lines = [];
      let line = '';
      for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (tmpCtx.measureText(test).width > maxW && line) { lines.push(line); line = word; }
        else line = test;
      }
      if (line) lines.push(line);
      return lines;
    };

    const descLines = entry.description ? wrapText(entry.description, W - PAD * 2 - 110) : [];
    const LINE_H = 18, ROW_H = 38;
    const DESC_H = descLines.length > 0 ? Math.max(ROW_H, descLines.length * LINE_H + 16) : 0;

    const rows = [
      { label: 'Date',     val: fmt(entry.date),                                       type: 'normal' },
      { label: 'Symbol',   val: entry.symbol,                                           type: 'symbol' },
      { label: 'Strategy', val: stratLabel,                                             type: 'badge'  },
      ...(descLines.length > 0 ? [{ label: 'Notes', lines: descLines, type: 'multi', h: DESC_H }] : []),
      { label: 'Profit',   val: entry.profit ? `+₹${(+entry.profit).toLocaleString('en-IN')}` : '—', type: 'profit' },
      { label: 'Loss',     val: entry.loss   ? `-₹${(+entry.loss).toLocaleString('en-IN')}`   : '—', type: 'loss'   },
      { label: 'Net P&L',  val: net !== 0 ? `${net > 0 ? '+' : ''}₹${net.toLocaleString('en-IN')}` : '—', type: 'net' },
    ];

    const HEADER_H = 68, TITLE_H = 44, FOOTER_H = 40;
    const totalRowsH = rows.reduce((s, r) => s + (r.h || ROW_H), 0);
    const CARD_H = TITLE_H + totalRowsH + 12;
    const H = HEADER_H + 12 + CARD_H + 12 + FOOTER_H;

    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    const rrect = (x, y, w, h, r) => {
      ctx.beginPath();
      ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    };

    // Background
    ctx.fillStyle = '#f0f2f5';
    ctx.fillRect(0, 0, W, H);

    // Header
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, W, HEADER_H);
    ctx.fillStyle = '#ff6f00';
    ctx.fillRect(0, HEADER_H - 3, W, 3);

    // Logo circle
    ctx.fillStyle = '#ff6f00';
    ctx.beginPath(); ctx.arc(PAD + 17, HEADER_H / 2, 17, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1a1a2e';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('S', PAD + 17, HEADER_H / 2);

    // Brand
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.font = 'bold 17px Arial';
    ctx.fillStyle = '#fff';
    ctx.fillText('soc.', PAD + 42, HEADER_H / 2 + 6);
    const socW = ctx.measureText('soc.').width;
    ctx.fillStyle = '#ff6f00';
    ctx.fillText('ai.in', PAD + 42 + socW, HEADER_H / 2 + 6);

    // Right labels
    ctx.textAlign = 'right';
    ctx.font = '10px Arial'; ctx.fillStyle = '#8899bb';
    ctx.fillText('OPTION CHAIN', W - PAD, HEADER_H / 2 - 2);
    ctx.font = 'bold 12px Arial'; ctx.fillStyle = '#ccc';
    ctx.fillText('Trading Journal', W - PAD, HEADER_H / 2 + 14);

    // Card
    const CARD_X = 16, CARD_Y = HEADER_H + 12, CARD_W = W - 32;
    ctx.fillStyle = '#fff';
    rrect(CARD_X, CARD_Y, CARD_W, CARD_H, 10); ctx.fill();
    ctx.strokeStyle = '#e8e8e8'; ctx.lineWidth = 1;
    rrect(CARD_X, CARD_Y, CARD_W, CARD_H, 10); ctx.stroke();

    // Card title
    ctx.fillStyle = '#1a1a2e'; ctx.font = 'bold 12px Arial';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('TRADE SUMMARY', CARD_X + 16, CARD_Y + TITLE_H / 2);
    ctx.strokeStyle = '#f0f0f0'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(CARD_X + 16, CARD_Y + TITLE_H); ctx.lineTo(CARD_X + CARD_W - 16, CARD_Y + TITLE_H);
    ctx.stroke();

    // Rows
    let yPos = CARD_Y + TITLE_H;
    rows.forEach((row, i) => {
      const rowH = row.h || ROW_H;
      const midY = yPos + rowH / 2;
      ctx.fillStyle = '#999'; ctx.font = '11px Arial';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(row.label, CARD_X + 16, midY);

      if (row.type === 'multi') {
        ctx.textAlign = 'right';
        row.lines.forEach((line, li) => {
          ctx.fillStyle = '#555'; ctx.font = '12px Arial'; ctx.textBaseline = 'alphabetic';
          ctx.fillText(line, CARD_X + CARD_W - 16, yPos + 14 + li * LINE_H);
        });
      } else {
        let color = '#111', font = '13px Arial';
        if (row.type === 'symbol') { color = '#1a1a2e'; font = 'bold 15px Arial'; }
        if (row.type === 'badge')  { color = '#283593'; font = 'bold 12px Arial'; }
        if (row.type === 'profit') { color = '#2e7d32'; font = 'bold 13px Arial'; }
        if (row.type === 'loss')   { color = '#c62828'; font = 'bold 13px Arial'; }
        if (row.type === 'net')    { color = net > 0 ? '#2e7d32' : net < 0 ? '#c62828' : '#555'; font = 'bold 15px Arial'; }
        ctx.fillStyle = color; ctx.font = font;
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.fillText(row.val, CARD_X + CARD_W - 16, midY);
      }

      if (i < rows.length - 1) {
        ctx.strokeStyle = '#f8f8f8'; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(CARD_X + 16, yPos + rowH); ctx.lineTo(CARD_X + CARD_W - 16, yPos + rowH);
        ctx.stroke();
      }
      yPos += rowH;
    });

    // Footer
    ctx.fillStyle = '#bbb'; ctx.font = '10px Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('powered by soc.ai.in', W / 2, CARD_Y + CARD_H + 12 + FOOTER_H / 2);

    // Export
    canvas.toBlob(blob => {
      const file = new File([blob], `trade-${entry.symbol}-${entry.date}.png`, { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        navigator.share({ title: `${entry.symbol} Trade`, files: [file] }).catch(() => {});
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = file.name; a.click();
        URL.revokeObjectURL(url);
      }
    }, 'image/png');
  };

  const displayStrat = (e) => e.strategy === 'Other' ? (e.customStrategy || 'Other') : e.strategy;

  const filtered = filterStrat === 'All'
    ? entries
    : entries.filter(e => e.strategy === filterStrat || (filterStrat === 'Other' && e.strategy === 'Other'));

  const totalProfit = filtered.reduce((s, e) => s + (e.profit || 0), 0);
  const totalLoss   = filtered.reduce((s, e) => s + (e.loss || 0), 0);
  const netPL       = totalProfit - totalLoss;

  return (
    <div className="tj-page">

      {/* ── Header ── */}
      <div className="tj-header">
        <span className="tj-header-icon">📒</span>
        <div>
          <div className="tj-header-title">Trading Journal</div>
          <div className="tj-header-sub">Track your trades &amp; strategies</div>
        </div>
        <div className="tj-header-user">{state.user?.name || ''}</div>
      </div>

      <div className="tj-body">

        {/* ── Add Entry Form ── */}
        <div className="tj-card">
          <div className="tj-card-title">Add New Trade</div>
          <form className="tj-form" onSubmit={handleSave}>

            <div className="tj-form-row">
              <div className="tj-field">
                <label>Date</label>
                <input type="date" value={form.date} onChange={e => set('date', e.target.value)} required />
              </div>
              <div className="tj-field">
                <label>Symbol</label>
                <input
                  type="text"
                  value={form.symbol}
                  onChange={e => set('symbol', e.target.value.toUpperCase())}
                  placeholder="e.g. NIFTY, TCS"
                  required
                />
              </div>
              <div className="tj-field">
                <label>Strategy</label>
                <select value={form.strategy} onChange={e => set('strategy', e.target.value)}>
                  {STRATEGIES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              {form.strategy === 'Other' && (
                <div className="tj-field">
                  <label>Custom Strategy</label>
                  <input
                    type="text"
                    value={form.customStrategy}
                    onChange={e => set('customStrategy', e.target.value)}
                    placeholder="Enter your strategy name"
                  />
                </div>
              )}
            </div>

            <div className="tj-field tj-field-full">
              <label>Description / Notes</label>
              <textarea
                value={form.description}
                onChange={e => set('description', e.target.value)}
                placeholder="Trade setup, reason, observations..."
                rows={3}
              />
            </div>

            <div className="tj-form-row">
              <div className="tj-field">
                <label>Profit (₹)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.profit}
                  onChange={e => set('profit', e.target.value)}
                  placeholder="0.00"
                  className="profit-input"
                />
              </div>
              <div className="tj-field">
                <label>Loss (₹)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.loss}
                  onChange={e => set('loss', e.target.value)}
                  placeholder="0.00"
                  className="loss-input"
                />
              </div>
              <div className="tj-field tj-field-btn">
                <label>&nbsp;</label>
                <button type="submit" className="tj-save-btn" disabled={saving}>
                  {saving ? 'Saving...' : '💾 Save Trade'}
                </button>
              </div>
            </div>

            {msg && <div className={`tj-msg ${msg.includes('saved') ? 'success' : 'error'}`}>{msg}</div>}
          </form>
        </div>

        {/* ── Summary + Filter ── */}
        <div className="tj-summary-row">
          <div className="tj-stat green">
            <div className="tj-stat-label">Total Profit</div>
            <div className="tj-stat-val">₹{totalProfit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
          </div>
          <div className="tj-stat red">
            <div className="tj-stat-label">Total Loss</div>
            <div className="tj-stat-val">₹{totalLoss.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
          </div>
          <div className={`tj-stat ${netPL >= 0 ? 'green' : 'red'}`}>
            <div className="tj-stat-label">Net P&amp;L</div>
            <div className="tj-stat-val">{netPL >= 0 ? '+' : ''}₹{netPL.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
          </div>
          <div className="tj-stat neutral">
            <div className="tj-stat-label">Trades</div>
            <div className="tj-stat-val">{filtered.length}</div>
          </div>

          <div className="tj-filter">
            <label>Filter:</label>
            <select value={filterStrat} onChange={e => setFilterStrat(e.target.value)}>
              <option value="All">All Strategies</option>
              {STRATEGIES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {/* ── History Table ── */}
        <div className="tj-card">
          <div className="tj-card-title">
            Trade History
            <span className="tj-count">{filtered.length} entries</span>
          </div>
          {filtered.length === 0 ? (
            <div className="tj-empty">No entries yet. Add your first trade above.</div>
          ) : (
            <div className="tj-table-wrap">
              <table className="tj-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Date</th>
                    <th>Symbol</th>
                    <th>Strategy</th>
                    <th>Description</th>
                    <th>Profit (₹)</th>
                    <th>Loss (₹)</th>
                    <th>Net</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e, i) => {
                    const net = (e.profit || 0) - (e.loss || 0);
                    return (
                      <tr key={e.id} className={net >= 0 && net !== 0 ? 'row-profit' : net < 0 ? 'row-loss' : ''}>
                        <td>{i + 1}</td>
                        <td className="td-date">{fmt(e.date)}</td>
                        <td className="td-symbol">{e.symbol}</td>
                        <td>
                          <span className={`tj-strat-badge strat-${e.strategy.toLowerCase()}`}>
                            {displayStrat(e)}
                          </span>
                        </td>
                        <td className="td-desc">{e.description || '—'}</td>
                        <td className="td-profit">{e.profit ? `₹${(+e.profit).toLocaleString('en-IN')}` : '—'}</td>
                        <td className="td-loss">{e.loss ? `₹${(+e.loss).toLocaleString('en-IN')}` : '—'}</td>
                        <td className={`td-net ${net >= 0 ? 'positive' : 'negative'}`}>
                          {net !== 0 ? `${net >= 0 ? '+' : ''}₹${net.toLocaleString('en-IN')}` : '—'}
                        </td>
                        <td className="td-actions">
                          <button className="tj-share-btn" onClick={() => handleShare(e)} title="Share">📤</button>
                          <button className="tj-del-btn" onClick={() => handleDelete(e.id)} title="Delete">✕</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
