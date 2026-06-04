import { useState } from 'react';
import { useApp } from '../../context/AppContext';

export default function SideNav() {
  const { state, dispatch } = useApp();
  const [expanded, setExpanded] = useState(false);

  // ── Navigate: update URL + state ─────────────────────────
  const navigate = (path, actions) => {
    window.history.pushState(null, '', path);
    actions.forEach(a => dispatch(a));
  };

  // Reset all page flags — every navigate call should clear every other page
  const RESET = [
    { type: 'SET_INDEX_PAGE',      payload: false },
    { type: 'SET_HISTORICAL_MODE', payload: false },
    { type: 'SET_AI_PAGE',         payload: { active: false } },
    { type: 'SET_HOLIDAY_LIST',    payload: false },
    { type: 'SET_SUPPORT',         payload: false },
    { type: 'SET_PROFILE',         payload: false },
    { type: 'SET_ADMIN_PANEL',     payload: false },
    { type: 'SET_JOURNAL',         payload: false },
    { type: 'SET_AI_TRAIN',        payload: false },
    { type: 'SET_AI_STOCK',        payload: false },
    { type: 'SET_JOIN_MEET',       payload: false },

    { type: 'SET_TEAM_PAGE',       payload: false },
    { type: 'SET_SUBSCRIPTION_PAGE', payload: false },
    { type: 'SET_HEATMAP',           payload: false },
    { type: 'SET_FIIDII',            payload: false },
  ];

  const goDashboard  = () => navigate('/dashboard',    [...RESET, { type: 'SET_INDEX_PAGE',      payload: true  }]);
  const goLive       = () => navigate('/optionchain',  [...RESET]);
  const goHistorical = () => navigate('/historical',   [...RESET, { type: 'SET_HISTORICAL_MODE', payload: true  }]);
  const goPowerAI    = () => navigate('/poweraistock', [...RESET, { type: 'SET_AI_PAGE',         payload: { active: true, type: 'stock' } }]);
  const goHolidayList= () => navigate('/holiday-list', [...RESET, { type: 'SET_HOLIDAY_LIST',    payload: true  }]);
  const goSupport    = () => navigate('/support',      [...RESET, { type: 'SET_SUPPORT',         payload: true  }]);
  const goProfile    = () => navigate('/profile',      [...RESET, { type: 'SET_PROFILE',         payload: true  }]);
  const goAdminPanel = () => navigate('/admin-panel',  [...RESET, { type: 'SET_ADMIN_PANEL',     payload: true  }]);
  const goJournal    = () => navigate('/journal',      [...RESET, { type: 'SET_JOURNAL',         payload: true  }]);
  const goAITrain    = () => navigate('/ai-train',     [...RESET, { type: 'SET_AI_TRAIN',        payload: true  }]);
  const goAIStock    = () => navigate('/ai-stock',     [...RESET, { type: 'SET_AI_STOCK',        payload: true  }]);
  const goJoinMeet   = () => navigate('/join-meet',    [...RESET, { type: 'SET_JOIN_MEET',       payload: true  }]);

  const goTeam         = () => navigate('/team',         [...RESET, { type: 'SET_TEAM_PAGE',         payload: true  }]);
  const goSubscription = () => navigate('/subscription', [...RESET, { type: 'SET_SUBSCRIPTION_PAGE', payload: true  }]);
  const goHeatmap      = () => navigate('/heatmap',      [...RESET, { type: 'SET_HEATMAP',           payload: true  }]);
  const goFiiDii       = () => navigate('/fii-dii',      [...RESET, { type: 'SET_FIIDII',            payload: true  }]);
  const openNotif = () => dispatch({ type: 'SET_NOTIF_PANEL', payload: true });

  // ── Active state ─────────────────────────────────────────
  const isAITrain      = state.aiTrainActive;
  const isAIStock      = state.aiStockActive;
  const isDashboard    = state.indexPageActive && !state.holidayListActive && !state.supportActive && !state.profileActive && !state.adminPanelActive && !state.subscriptionActive && !state.journalActive && !state.teamPageActive && !state.aiTrainActive;
  const isLive         = !state.indexPageActive && !state.historicalMode && !state.aiPageActive && !state.holidayListActive && !state.supportActive && !state.profileActive && !state.adminPanelActive && !state.subscriptionActive && !state.journalActive && !state.teamPageActive && !state.aiTrainActive;
  const isHistorical   = state.historicalMode && !state.holidayListActive && !state.supportActive && !state.profileActive && !state.adminPanelActive;
  const isPowerAI      = state.aiPageActive && state.aiPageType === 'stock';
  const isHolidayList  = state.holidayListActive;
  const isSupport      = state.supportActive;
  const isProfile      = state.profileActive;
  const isAdminPanel   = state.adminPanelActive;
  const isJournal      = state.journalActive;
  const isTeam         = state.teamPageActive;
  const isSubscription = state.subscriptionActive;

  const userRole = state.user?.role || 'user';
  const isJoinMeet     = state.joinMeetActive;
  const isHeatmap      = state.heatmapActive;
  const isFiiDii       = state.fiiDiiActive;
  const isAdminOrMember = userRole === 'admin' || userRole === 'member';

  // Check indicator access config — controls nav item visibility per role
  const canSeeIndicator = (id) => {
    const ind = (state.indicators || []).find(i => i.id === id);
    if (!ind) return isAdminOrMember; // fallback: only admin/member if not loaded
    return ind[userRole] === true;
  };

  const navItems = [
    { section: 'Main', items: [
      { icon: '🏠', label: 'Dashboard',         tooltip: 'Dashboard',         active: isDashboard,  onClick: goDashboard  },
      { icon: '📊', label: 'Live Option Chain',  tooltip: 'Live Option Chain',  active: isLive,       onClick: goLive       },
{ icon: '📅', label: 'Historical Data',    tooltip: 'Historical Data',   active: isHistorical, onClick: goHistorical },
      { icon: '🔥', label: 'Stock Heatmap',      tooltip: 'Nifty 50 Stock Heatmap', active: isHeatmap, onClick: goHeatmap },
      { icon: '🏦', label: 'FII / DII',          tooltip: 'FII & DII Activity',      active: isFiiDii,  onClick: goFiiDii  },
    ]},
    { section: 'AI Tools', items: [
      { icon: '⚡', label: 'Power AI Stock', tooltip: 'Power AI Stock', active: isPowerAI, onClick: goPowerAI },
      ...(canSeeIndicator('ai_train') ? [{ icon: '🧠', label: 'AI Train', tooltip: 'AI Train — Pattern Analysis', active: isAITrain, onClick: goAITrain }] : []),
      { icon: '📈', label: 'AI Stock', tooltip: 'AI Stock Signals', active: isAIStock, onClick: goAIStock },
      { icon: '🤖', label: 'AI Swing Trade', tooltip: 'AI Swing Trade', active: false, badge: 'Soon' },
      { icon: '📒', label: 'Journal Book',   tooltip: 'Journal Book',   active: isJournal, onClick: goJournal },
    ]},
    { section: 'Info', items: [
      { icon: '🗓️', label: 'Holiday List', tooltip: 'Holiday List', active: isHolidayList, onClick: goHolidayList },
      { icon: '💬', label: 'Support',      tooltip: 'Support',      active: isSupport,     onClick: goSupport    },
      { icon: '🤝', label: 'Our Team',     tooltip: 'Our Team',     active: isTeam,        onClick: goTeam       },
      { icon: '📹', label: 'Join Meet',    tooltip: 'Join Meet',    active: isJoinMeet,    onClick: goJoinMeet   },
    ]},
    { section: 'Account', items: [
      { icon: '💎', label: 'Subscription',  tooltip: 'Subscription',  active: isSubscription,      onClick: goSubscription },
      { icon: '🔔', label: 'Notifications', tooltip: 'Notifications', active: state.notifPanelOpen, onClick: openNotif, notifCount: state.notifUnread },
      { icon: '👤', label: 'Profile',       tooltip: 'Profile',       active: isProfile,           onClick: goProfile    },
      ...(isAdminOrMember ? [{ icon: '⚙️', label: 'Admin Panel', tooltip: 'Admin Panel', active: isAdminPanel, onClick: goAdminPanel }] : []),
    ]},
  ];

  return (
    <nav
      className="sidenav"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      style={{ width: expanded ? '200px' : '52px' }}
    >
      <a href="/" className="sidenav-logo">
        <div className="sidenav-logo-icon">S</div>
        {expanded && <div className="sidenav-logo-text">soc.<span>ai.in</span></div>}
      </a>

      <div className="sidenav-items">
        {navItems.map((section, si) => (
          <div key={si}>
            {si > 0 && <div className="sidenav-divider" />}
            {expanded && <div className="sidenav-section-label">{section.section}</div>}
            {section.items.map((item, ii) => (
              <a
                key={ii}
                href="#"
                className={`sidenav-item ${item.active ? 'active' : ''}`}
                data-tooltip={item.tooltip}
                onClick={(e) => { e.preventDefault(); item.onClick?.(); }}
              >
                <div className="sidenav-item-icon" style={{ position: 'relative' }}>
                  {item.icon}
                  {item.notifCount > 0 && <span className="sidenav-notif-count">{item.notifCount > 99 ? '99+' : item.notifCount}</span>}
                </div>
                {expanded && <span className="sidenav-item-label">{item.label}</span>}
                {expanded && item.badge && <span className="sidenav-badge">{item.badge}</span>}
              </a>
            ))}
          </div>
        ))}
      </div>
    </nav>
  );
}
