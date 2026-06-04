import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import './SubscriptionPage.css';

function useBodyScroll() {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'auto';
    return () => { document.body.style.overflow = prev || ''; };
  }, []);
}

const API_BASE = process.env.REACT_APP_API_URL || '';
const RZP_KEY  = process.env.REACT_APP_RAZORPAY_KEY_ID || '';

function loadRazorpay() {
  return new Promise(resolve => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.onload  = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

function fmtPrice(paise) {
  return `₹${(paise / 100).toLocaleString('en-IN')}`;
}
function fmtDate(d) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
function daysLeft(endDate) {
  return Math.max(0, Math.ceil((new Date(endDate) - Date.now()) / 86400000));
}
function totalDays(startDate, endDate) {
  return Math.max(1, Math.round((new Date(endDate) - new Date(startDate)) / 86400000));
}
function progressPct(startDate, endDate) {
  const total = totalDays(startDate, endDate);
  const left  = daysLeft(endDate);
  return Math.round((left / total) * 100);
}

const DEFAULT_FEATURES = [
  'Live Option Chain (Real-time NSE/BSE)',
  'Historical Data Analysis',
  'Power AI Stock Signals',
  'OI Charts & Spot Price Charts',
  'MCTR & Strategy 4.0 S/R Levels',
  'Shifting Levels Detection',
  'LTP Calculator',
  'Trading Journal',
];

const CATEGORIES = ['Regular', 'Advance', 'Courses'];
const CAT_ICONS  = { Regular: '📊', Advance: '🚀', Courses: '🎓' };

function PlanCard({ plan, isSelected, onSelect }) {
  const perDay     = Math.round(plan.price / plan.durationDays);
  const commPerDay = plan.communityPrice ? Math.round(plan.communityPrice / plan.durationDays) : null;
  const savings    = plan.communityPrice ? (plan.price - plan.communityPrice) : null;
  const features   = plan.features?.length > 0 ? plan.features : DEFAULT_FEATURES;
  const isPopular  = plan.badge === 'Most Popular';

  return (
    <div
      className={`sp-plan-card${isSelected ? ' selected' : ''}${isPopular ? ' popular' : ''}`}
      onClick={() => onSelect(plan._id)}
    >
      {plan.badge && (
        <div className="sp-plan-badge">{plan.badge}</div>
      )}

      <div className="sp-plan-header">
        <div className="sp-plan-name">{plan.name}</div>
        <div className="sp-plan-duration">{plan.durationDays} days access</div>
      </div>

      <div className="sp-plan-price-block">
        <div className="sp-plan-price-main">
          <span className="sp-price-currency">₹</span>
          <span className="sp-price-amount">{(plan.price / 100).toLocaleString('en-IN')}</span>
        </div>
        <div className="sp-price-perday">₹{perDay}/day</div>
      </div>

      {plan.communityPrice && commPerDay && (
        <div className="sp-community-price">
          <span className="sp-community-label">Community Price</span>
          <span className="sp-community-val">{fmtPrice(plan.communityPrice)}</span>
          <span className="sp-community-save">Save {fmtPrice(savings)}</span>
        </div>
      )}

      <ul className="sp-features">
        {features.slice(0, 6).map((f, i) => (
          <li key={i}>
            <span className="sp-feat-check">✓</span>
            <span>{f}</span>
          </li>
        ))}
        {features.length > 6 && (
          <li className="sp-feat-more">+{features.length - 6} more features</li>
        )}
      </ul>

      <button
        className={`sp-select-btn${isSelected ? ' selected' : ''}`}
        onClick={e => { e.stopPropagation(); onSelect(plan._id); }}
        type="button"
      >
        {isSelected ? '✓ Plan Selected' : 'Choose Plan'}
      </button>
    </div>
  );
}

export default function SubscriptionPage() {
  useBodyScroll();
  const { state, dispatch } = useApp();

  const [plans,         setPlans]         = useState([]);
  const [status,        setStatus]        = useState(null);
  const [selected,      setSelected]      = useState(null);
  const [activeTab,     setActiveTab]     = useState('Regular');
  const [coupon,        setCoupon]        = useState('');
  const [couponData,    setCouponData]    = useState(null);
  const [couponErr,     setCouponErr]     = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [paying,        setPaying]        = useState(false);
  const [msg,           setMsg]           = useState('');
  const [msgType,       setMsgType]       = useState('');
  const [termsOpen,     setTermsOpen]     = useState(false);

  const userRole = state.user?.role || 'user';
  const isAdminOrMember = userRole === 'admin' || userRole === 'member';

  useEffect(() => {
    fetch(`${API_BASE}/api/subscription/plans`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setPlans(d.plans);
          const popular = d.plans.find(p => p.badge === 'Most Popular');
          setSelected((popular || d.plans[0])?._id || null);
        }
      }).catch(() => {});

    fetch(`${API_BASE}/api/subscription/status`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => { if (d.success) setStatus(d); })
      .catch(() => {});
  }, []);

  const handleRemoveCoupon = () => { setCoupon(''); setCouponData(null); setCouponErr(''); };
  const handleSelectPlan   = (planId) => { setSelected(planId); handleRemoveCoupon(); };
  const handleTabChange    = (cat) => { setActiveTab(cat); setSelected(null); handleRemoveCoupon(); };

  const tabPlans     = plans.filter(p => (p.category || 'Regular') === activeTab);
  const selectedPlan = plans.find(p => p._id === selected);

  const handleApplyCoupon = async () => {
    if (!coupon.trim()) return;
    setCouponLoading(true); setCouponErr(''); setCouponData(null);
    try {
      const r = await fetch(`${API_BASE}/api/subscription/apply-coupon`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: coupon.trim(), planId: selected }),
      });
      const d = await r.json();
      if (d.success) setCouponData(d);
      else setCouponErr(d.error || 'Invalid coupon');
    } catch { setCouponErr('Network error'); }
    setCouponLoading(false);
  };

  const finalAmount = selectedPlan
    ? Math.max(100, selectedPlan.price - (couponData?.discountAmount || 0))
    : 0;

  const handleSubscribe = async () => {
    if (!selected) return setMsg('Please select a plan.');
    const ok = await loadRazorpay();
    if (!ok) return setMsg('Could not load payment gateway.');
    setPaying(true); setMsg(''); setMsgType('');

    try {
      const r = await fetch(`${API_BASE}/api/subscription/create-order`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: selected, couponCode: couponData?.coupon?.code || '' }),
      });
      const orderData = await r.json();
      if (!orderData.success) {
        setMsg(orderData.error || 'Failed to create order.');
        setMsgType('error'); setPaying(false); return;
      }

      const options = {
        key:         orderData.keyId || RZP_KEY,
        amount:      orderData.amount,
        currency:    orderData.currency,
        name:        'Simplify Option Chain',
        description: `${orderData.planName} Subscription`,
        order_id:    orderData.orderId,
        prefill:     { name: state.user?.name || '', email: state.user?.email || '' },
        theme:       { color: '#ff6f00' },
        handler: async (response) => {
          try {
            const vr = await fetch(`${API_BASE}/api/subscription/verify`, {
              method: 'POST', credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_order_id:   response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature:  response.razorpay_signature,
              }),
            });
            const vd = await vr.json();
            if (vd.success) {
              setMsg('Subscription activated! Enjoy full access.');
              setMsgType('success');
              const sr = await fetch(`${API_BASE}/api/subscription/status`, { credentials: 'include' });
              const sd = await sr.json();
              if (sd.success) {
                setStatus(sd);
                if (sd.subscription) {
                  dispatch({ type: 'SET_SUBSCRIPTION', payload: {
                    active: true, planName: sd.subscription.planName,
                    endDate: sd.subscription.endDate, daysLeft: daysLeft(sd.subscription.endDate),
                  }});
                }
              }
              handleRemoveCoupon();
            } else {
              setMsg(vd.error || 'Payment verification failed. Contact support.');
              setMsgType('error');
            }
          } catch { setMsg('Verification error. Contact support.'); setMsgType('error'); }
          setPaying(false);
        },
        modal: { ondismiss: () => setPaying(false) },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (e) {
      setMsg('Payment error: ' + e.message);
      setMsgType('error');
      setPaying(false);
    }
  };

  const activeSub   = status?.subscription;
  const dl          = activeSub ? daysLeft(activeSub.endDate) : 0;
  const pct         = activeSub ? progressPct(activeSub.startDate, activeSub.endDate) : 0;
  const subExpiring = activeSub && dl <= 10;
  const barColor    = pct > 30 ? '#22c55e' : pct > 10 ? '#f59e0b' : '#ef4444';

  return (
    <div className="sub-page">

      {/* ── Header ── */}
      <div className="sub-header">
        <div className="sub-header-left">
          <div className="sub-header-icon">💎</div>
          <div>
            <div className="sub-header-title">Subscription Plans</div>
            <div className="sub-header-sub">Simplify Option Chain · Real-time Market Intelligence</div>
          </div>
        </div>
        {state.user?.name && (
          <div className="sub-header-user">
            <div className="sub-header-avatar">{state.user.name.charAt(0).toUpperCase()}</div>
            <span>{state.user.name}</span>
          </div>
        )}
      </div>

      <div className="sub-body">

        {/* ── Admin / Member banner ── */}
        {isAdminOrMember && (
          <div className="sub-access-banner admin">
            <div className="sub-access-icon">⭐</div>
            <div className="sub-access-text">
              <div className="sub-access-title">Full Access — {userRole === 'admin' ? 'Admin' : 'Member'}</div>
              <div className="sub-access-sub">Your role grants unrestricted access to all features.</div>
            </div>
          </div>
        )}

        {/* ── Active Subscription Card ── */}
        {activeSub && !isAdminOrMember && (
          <div className={`sub-active-card${subExpiring ? ' expiring' : ''}`}>
            <div className="sub-active-top">
              <div>
                <div className="sub-active-plan">{activeSub.planName}</div>
                <div className="sub-active-sub">Your current subscription</div>
              </div>
              <span className={`sub-active-badge${subExpiring ? ' expiring' : ''}`}>
                {subExpiring ? '⚠ Expiring Soon' : '● Active'}
              </span>
            </div>
            <div className="sub-active-dates">
              <div className="sub-date-block">
                <div className="sub-date-label">Started</div>
                <div className="sub-date-val">{fmtDate(activeSub.startDate)}</div>
              </div>
              <div className="sub-date-arrow">→</div>
              <div className="sub-date-block">
                <div className="sub-date-label">Expires</div>
                <div className="sub-date-val">{fmtDate(activeSub.endDate)}</div>
              </div>
              <div className="sub-days-pill" style={{ background: subExpiring ? '#fff7ed' : '#f0fdf4', borderColor: subExpiring ? '#fed7aa' : '#86efac' }}>
                <div className="sub-days-num" style={{ color: barColor }}>{dl}</div>
                <div className="sub-days-lbl">days left</div>
              </div>
            </div>
            <div className="sub-progress-wrap">
              <div className="sub-progress-track">
                <div className="sub-progress-fill" style={{ width: `${pct}%`, background: barColor }} />
              </div>
              <div className="sub-progress-labels">
                <span>0%</span>
                <span style={{ color: barColor, fontWeight: 700 }}>{pct}% remaining</span>
                <span>100%</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Alert ── */}
        {msg && <div className={`sub-alert ${msgType}`}>{msg}</div>}

        {/* ── Plans ── */}
        <div className="sub-plans-section">

          {/* Tabs */}
          <div className="sp-tabs">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                className={`sp-tab${activeTab === cat ? ' active' : ''}`}
                onClick={() => handleTabChange(cat)}
                type="button"
              >
                <span>{CAT_ICONS[cat]}</span>
                <span>{cat}</span>
              </button>
            ))}
          </div>

          {/* Grid */}
          {tabPlans.length === 0 ? (
            <div className="sp-empty">No plans available in this category.</div>
          ) : (
            <div className="sp-grid">
              {tabPlans.map(plan => (
                <PlanCard
                  key={plan._id}
                  plan={plan}
                  isSelected={selected === plan._id}
                  onSelect={handleSelectPlan}
                />
              ))}
            </div>
          )}

          <div className="sp-legal-links">
            <button className="sp-legal-btn" onClick={() => setTermsOpen(true)}>Shipping &amp; Delivery</button>
            <span className="sp-legal-sep">·</span>
            <button className="sp-legal-btn" onClick={() => setTermsOpen(true)}>Cancellation &amp; Refund Policy</button>
          </div>
        </div>

        {/* ── Coupon ── */}
        {selectedPlan && (
          <div className="sub-card">
            <div className="sub-card-label">Coupon Code</div>
            {couponData ? (
              <div className="sub-coupon-applied">
                <div className="sub-coupon-pill">
                  <span className="sub-coupon-icon">🏷</span>
                  <span className="sub-coupon-code">{couponData.coupon.code}</span>
                  <span className="sub-coupon-msg">{couponData.message}</span>
                </div>
                <button className="sub-coupon-remove" onClick={handleRemoveCoupon}>Remove</button>
              </div>
            ) : (
              <div className="sub-coupon-row">
                <input
                  className="sub-coupon-input"
                  placeholder="Enter coupon code"
                  value={coupon}
                  onChange={e => { setCoupon(e.target.value.toUpperCase()); setCouponErr(''); }}
                  onKeyDown={e => e.key === 'Enter' && handleApplyCoupon()}
                />
                <button
                  className="sub-coupon-btn"
                  onClick={handleApplyCoupon}
                  disabled={couponLoading || !coupon.trim()}
                >
                  {couponLoading ? '...' : 'Apply'}
                </button>
              </div>
            )}
            {couponErr && <div className="sub-coupon-err">{couponErr}</div>}
          </div>
        )}

        {/* ── Order Summary ── */}
        {selectedPlan && (
          <div className="sub-card sub-order-card">
            <div className="sub-card-label">Order Summary</div>
            <div className="sub-order-rows">
              <div className="sub-order-row">
                <span>{selectedPlan.name}</span>
                <span>{selectedPlan.durationDays} days</span>
              </div>
              <div className="sub-order-row">
                <span>Price</span>
                <span>{fmtPrice(selectedPlan.price)}</span>
              </div>
              {couponData && (
                <div className="sub-order-row discount">
                  <span>Discount ({couponData.coupon.code})</span>
                  <span>− {fmtPrice(couponData.discountAmount)}</span>
                </div>
              )}
              <div className="sub-order-row total">
                <span>Total Payable</span>
                <span>{fmtPrice(finalAmount)}</span>
              </div>
            </div>

            <button className="sub-pay-btn" onClick={handleSubscribe} disabled={paying}>
              {paying
                ? <span className="sub-pay-loading">⏳ Processing...</span>
                : <span>Pay {fmtPrice(finalAmount)} &amp; Activate</span>}
            </button>

            <div className="sub-trust-row">
              <span>🔒 Secured by Razorpay</span>
              <span>·</span>
              <span>UPI · Cards · Net Banking</span>
            </div>
          </div>
        )}

        {/* ── Payment History ── */}
        {(() => {
          const hist = (status?.history || []).filter(h => h.amountPaid > 0 && !h.planName?.toLowerCase().includes('trial'));
          return hist.length > 0 ? (
            <div className="sub-card">
              <div className="sub-card-label">Recharge History</div>
              <div className="sub-history-wrap">
                <table className="sub-history-table">
                  <thead>
                    <tr><th>Plan</th><th>Amount</th><th>Start</th><th>End</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {hist.map((h, i) => (
                      <tr key={i}>
                        <td>{h.planName}</td>
                        <td>{fmtPrice(h.amountPaid)}</td>
                        <td>{fmtDate(h.startDate)}</td>
                        <td>{fmtDate(h.endDate)}</td>
                        <td><span className={`sub-pill ${h.status}`}>{h.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null;
        })()}

        {/* ── Terms ── */}
        <div className="sub-card">
          <button className="sub-terms-toggle" onClick={() => setTermsOpen(o => !o)}>
            <span>📋 Terms &amp; Conditions</span>
            <span className={`sub-chevron${termsOpen ? ' open' : ''}`}>▾</span>
          </button>
          {termsOpen && (
            <div className="sub-terms-body">
              <p><strong>1. Subscription Plans:</strong> Access begins immediately upon successful payment. Plans are non-transferable.</p>
              <p><strong>2. Payment:</strong> Processed via Razorpay. Accepts UPI, Net Banking, Credit/Debit Cards, Wallets. Prices are inclusive of taxes.</p>
              <p><strong>3. Renewal:</strong> Subscriptions do not auto-renew. Purchase a new plan when yours expires.</p>
              <p><strong>4. Refund Policy:</strong> 24-hour refund window if the service was inaccessible due to technical issues on our end only.</p>
              <p><strong>5. Delivery:</strong> Digital service — access granted instantly. No physical goods shipped.</p>
              <p><strong>6. Cancellation:</strong> Within 24 hours of purchase only, if service was inaccessible.</p>
              <p><strong>7. Coupon Codes:</strong> Single-use per order. Cannot be combined. Subject to validity and usage limits.</p>
              <p><strong>8. Data Accuracy:</strong> Market data sourced via Upstox APIs. Not liable for data delays or trading losses.</p>
              <p><strong>9. Contact:</strong> <a href="mailto:simplifyoptionchain@gmail.com">simplifyoptionchain@gmail.com</a> · <a href="https://t.me/simplifyoc" target="_blank" rel="noreferrer">Telegram @simplifyoc</a></p>
              <p className="sub-terms-note">By subscribing you agree to these terms. Last updated: May 2026.</p>
            </div>
          )}
        </div>

        {/* ── Help ── */}
        <div className="sub-help-card">
          <div className="sub-help-title">Need Help?</div>
          <div className="sub-help-sub">We typically respond within 2 hours during market hours.</div>
          <div className="sub-help-btns">
            <a className="sub-help-btn primary" href="mailto:simplifyoptionchain@gmail.com">📧 Email Us</a>
            <a className="sub-help-btn" href="https://t.me/simplifyoc" target="_blank" rel="noreferrer">✈️ Telegram</a>
            <a className="sub-help-btn" href="https://instagram.com/soc.ai.in" target="_blank" rel="noreferrer">📸 Instagram</a>
          </div>
        </div>

      </div>
    </div>
  );
}
