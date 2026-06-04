import { useEffect } from 'react';
import './InfoPanel.css';

function useBodyScroll() {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'auto';
    return () => { document.body.style.overflow = prev || ''; };
  }, []);
}

export default function SupportPanel() {
  useBodyScroll();
  return (
    <div className="info-panel">
      <div className="info-panel-header">
        <span className="info-panel-icon">💬</span>
        <div>
          <div className="info-panel-title">Support & Contact</div>
          <div className="info-panel-sub">We're here to help</div>
        </div>
      </div>

      <div className="info-panel-body">
        <div className="support-cards">

          <div className="support-card">
            <div className="support-card-icon">📧</div>
            <div className="support-card-label">Email</div>
            <a className="support-card-val" href="mailto:simplifyoptionchain@gmail.com">
              simplifyoptionchain@gmail.com
            </a>
          </div>

          <div className="support-card">
            <div className="support-card-icon">📸</div>
            <div className="support-card-label">Instagram</div>
            <a className="support-card-val" href="https://instagram.com/soc.ai.in" target="_blank" rel="noreferrer">
              @soc.ai.in
            </a>
          </div>

          <div className="support-card">
            <div className="support-card-icon">✈️</div>
            <div className="support-card-label">Telegram</div>
            <a className="support-card-val" href="https://t.me/soc.ai.in" target="_blank" rel="noreferrer">
              soc.ai.in
            </a>
          </div>

        </div>

        <div className="support-note">
          <b>SOC.AI.IN</b> — AI-Powered Option Chain Analytics<br />
          For queries, feature requests, or support, reach out via any of the above channels.
        </div>
      </div>
    </div>
  );
}
