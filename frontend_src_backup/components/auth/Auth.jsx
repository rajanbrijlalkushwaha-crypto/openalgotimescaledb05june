// src/components/auth/AuthPage.jsx
import React, { useState, useEffect, useRef } from 'react';
import './auth.css';

const API_BASE = process.env.REACT_APP_API_URL || '';

const AuthPage = ({ onLogin }) => {
  // State management
  const [activeTab, setActiveTab] = useState('signin');
  const [activePanel, setActivePanel] = useState('signin');
  const [currentEmail, setCurrentEmail] = useState('');
  const [pendingOTPAction, setPendingOTPAction] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [alert, setAlert] = useState({ show: false, message: '', type: '' });
  const [loading, setLoading] = useState({ show: false, text: 'Please wait...' });
  
  // Form states
  const [signInData, setSignInData] = useState({ email: '', password: '' });
  const [signUpData, setSignUpData] = useState({
    firstName: '', lastName: '', email: '', mobile: '', city: '',
    password: '', confirmPassword: '', verificationType: 'otp'
  });
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetPasswords, setResetPasswords] = useState({ newPassword: '', confirmPassword: '' });
  
  // OTP state
  const [otp, setOtp] = useState(['', '', '', '', '']);
  const [otpTimer, setOtpTimer] = useState(600);
  const otpInputsRef = useRef([]);

  // Check session and URL params on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/auth/check-session`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (data.authenticated && !resetToken) {
          window.location.href = '/optionchain';
        }
      })
      .catch(() => {});

    const params = new URLSearchParams(window.location.search);
    const token = params.get('reset_token');
    if (token) {
      setResetToken(token);
      setActivePanel('reset');
    }
    if (params.get('reason') === 'timeout') {
      showAlert('You were signed out due to inactivity.', 'info');
    }
  }, []);

  // Inactivity logout
  useEffect(() => {
    let inactiveTimer;
    const resetInactiveTimer = () => {
      clearTimeout(inactiveTimer);
      inactiveTimer = setTimeout(async () => {
        await fetch(`${API_BASE}/api/auth/logout`, { method: 'POST', credentials: 'include' });
        window.location.href = '/?reason=timeout';
      }, 5 * 60 * 1000);
    };

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach(ev => {
      document.addEventListener(ev, resetInactiveTimer, true);
    });
    
    resetInactiveTimer();
    return () => {
      clearTimeout(inactiveTimer);
      events.forEach(ev => document.removeEventListener(ev, resetInactiveTimer, true));
    };
  }, []);

  // OTP timer
  useEffect(() => {
    if (activePanel === 'otp' && otpTimer > 0) {
      const interval = setInterval(() => {
        setOtpTimer(prev => prev - 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [activePanel, otpTimer]);

  const showAlert = (message, type = 'info') => {
    setAlert({ show: true, message, type });
    setTimeout(() => setAlert({ show: false, message: '', type: '' }), 5000);
  };

  const clearAlert = () => setAlert({ show: false, message: '', type: '' });

  const switchTab = (tab) => {
    setActiveTab(tab);
    setActivePanel(tab);
    clearAlert();
  };

  // API Handlers
  const handleSignIn = async (e) => {
    e.preventDefault();
    clearAlert();
    setLoading({ show: true, text: 'Signing in...' });

    try {
      const res = await fetch(`${API_BASE}/api/auth/signin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(signInData)
      });
      const data = await res.json();
      setLoading({ show: false, text: '' });

      if (data.success) {
        showAlert('Login successful!', 'success');
        setTimeout(() => {
          if (onLogin) onLogin();
          else window.location.href = '/optionchain';
        }, 200);
      } else {
        showAlert(data.error || data.message || 'Login failed. Check email and password.', 'error');
      }
    } catch {
      setLoading({ show: false, text: '' });
      showAlert('Network error. Please try again.', 'error');
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    clearAlert();

    if (signUpData.password !== signUpData.confirmPassword) {
      showAlert('Passwords do not match', 'error');
      return;
    }
    if (signUpData.mobile && !/^\d{10}$/.test(signUpData.mobile)) {
      showAlert('Enter a valid 10-digit mobile number', 'error');
      return;
    }

    setLoading({ show: true, text: 'Creating account...' });
    setCurrentEmail(signUpData.email);

    try {
      const res = await fetch(`${API_BASE}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${signUpData.firstName} ${signUpData.lastName}`,
          ...signUpData
        })
      });
      const data = await res.json();
      setLoading({ show: false, text: '' });

      if (data.success) {
        // Account created — log in directly (no OTP needed)
        showAlert('Account created! Signing you in...', 'success');
        setTimeout(() => {
          if (onLogin) onLogin();
          else window.location.href = '/optionchain';
        }, 500);
      } else {
        showAlert(data.error || data.message || 'Signup failed.', 'error');
      }
    } catch {
      setLoading({ show: false, text: '' });
      showAlert('Network error. Please try again.', 'error');
    }
  };

  const handleVerifyOTP = async () => {
    const otpString = otp.join('');
    if (otpString.length !== 5) {
      showAlert('Enter all 5 digits', 'error');
      return;
    }

    clearAlert();
    setLoading({ show: true, text: 'Verifying...' });

    try {
      const res = await fetch(`${API_BASE}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: currentEmail, otp: otpString })
      });
      const data = await res.json();
      setLoading({ show: false, text: '' });

      if (data.success) {
        showAlert('Email verified! Redirecting...', 'success');
        setTimeout(() => {
          if (onLogin) onLogin();
          else window.location.href = '/optionchain';
        }, 800);
      } else {
        showAlert(data.error, 'error');
      }
    } catch {
      setLoading({ show: false, text: '' });
      showAlert('Network error. Please try again.', 'error');
    }
  };

  const handleResendOTP = async () => {
    setLoading({ show: true, text: 'Sending new OTP...' });

    try {
      const res = await fetch(`${API_BASE}/api/auth/resend-verification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: currentEmail, verificationType: 'otp' })
      });
      const data = await res.json();
      setLoading({ show: false, text: '' });

      if (data.success) {
        showAlert('New OTP sent!', 'success');
        setOtp(['', '', '', '', '']);
        setOtpTimer(600);
      } else {
        showAlert(data.error, 'error');
      }
    } catch {
      setLoading({ show: false, text: '' });
      showAlert('Network error.', 'error');
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    clearAlert();
    setLoading({ show: true, text: 'Sending reset link...' });

    try {
      const res = await fetch(`${API_BASE}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail })
      });
      const data = await res.json();
      setLoading({ show: false, text: '' });

      if (data.success) {
        setCurrentEmail(forgotEmail);
        setActivePanel('link-sent');
        showAlert('Password reset link sent to your email!', 'success');
      } else {
        showAlert(data.error, 'error');
      }
    } catch {
      setLoading({ show: false, text: '' });
      showAlert('Network error. Please try again.', 'error');
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (resetPasswords.newPassword !== resetPasswords.confirmPassword) {
      showAlert('Passwords do not match', 'error');
      return;
    }

    clearAlert();
    setLoading({ show: true, text: 'Updating password...' });

    try {
      const res = await fetch(`${API_BASE}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, newPassword: resetPasswords.newPassword })
      });
      const data = await res.json();
      setLoading({ show: false, text: '' });

      if (data.success) {
        showAlert('Password updated! Redirecting to sign in...', 'success');
        setTimeout(() => {
          window.history.replaceState({}, '', '/');
          setResetToken('');
          switchTab('signin');
        }, 2000);
      } else {
        showAlert(data.error, 'error');
      }
    } catch {
      setLoading({ show: false, text: '' });
      showAlert('Network error. Please try again.', 'error');
    }
  };

  // OTP input handlers
  const handleOtpChange = (index, value) => {
    if (value.length > 1) {
      const pasted = value.replace(/\D/g, '').slice(0, 5);
      const newOtp = [...otp];
      pasted.split('').forEach((char, i) => {
        if (i < 5) newOtp[i] = char;
      });
      setOtp(newOtp);
      otpInputsRef.current[Math.min(pasted.length, 4)]?.focus();
    } else {
      const newOtp = [...otp];
      newOtp[index] = value;
      setOtp(newOtp);
      if (value && index < 4) {
        otpInputsRef.current[index + 1].focus();
      }
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpInputsRef.current[index - 1].focus();
    }
    if (e.key === 'Enter') {
      handleVerifyOTP();
    }
  };

  const formatTime = () => {
    const minutes = String(Math.floor(otpTimer / 60)).padStart(2, '0');
    const seconds = String(otpTimer % 60).padStart(2, '0');
    return `${minutes}:${seconds}`;
  };

  const hideTabs = ['otp', 'link-sent', 'forgot', 'reset'].includes(activePanel);

  return (
    <div className="auth-container">
      {/* Background orbs */}
      <div className="orb orb-1" />
      <div className="orb orb-2" />
      <div className="orb orb-3" />

      <div className="auth-box">

        {/* Top header — spans full width of both panels */}
        <div className="auth-top-header">
          <div className="auth-top-welcome">Welcome to</div>
          <div className="auth-top-brand">soc<span>.ai.in</span></div>
          <div className="auth-top-sub">AI-Powered Option Chain &amp; Trading Platform</div>
        </div>

        {/* Panels row */}
        <div className="auth-panels">

        {/* Left panel — features */}
        <div className="left-panel">

          <div className="lp-top-label">Everything you need to trade smarter</div>

          {/* Feature list */}
          <div className="hero-features">
            {[
              { icon: '⚡', title: 'Real-Time Data',        sub: 'WebSocket — no refresh needed'        },
              { icon: '📊', title: 'Volume & OI Analysis',  sub: '1, 3, 5, 15 min breakdowns'           },
              { icon: '🎯', title: 'Smart S&R Levels',      sub: 'OI-based support & resistance'         },
              { icon: '🔗', title: 'Full Option Chain',     sub: 'OI, Volume, LTP, Greeks in one view'   },
              { icon: '✨', title: 'Highlight System',      sub: 'Top OI & volume change markers'        },
              { icon: '🤖', title: 'AI Auto Analysis',      sub: 'Auto analysis every 1 min'             },
              { icon: '📈', title: 'Swing Trade',           sub: 'Multi-day positional setups'           },
              { icon: '📓', title: 'Journal Book',          sub: 'Track every trade & review P&L'        },
              { icon: '🧠', title: 'AI Power Stock',        sub: 'AI-powered stock signals'              },
              { icon: '🔍', title: 'AI Pattern Match',      sub: 'Chart pattern recognition engine'      },
              { icon: '📉', title: 'Bromos Trade',          sub: 'OI-based S&R strategy signals'         },
              { icon: '🔄', title: 'MCTR Trade',            sub: 'Mean-reversion & trend signals'        },
            ].map((f, i) => (
              <div key={i} className="hero-feat">
                <div className="hero-feat-icon">{f.icon}</div>
                <div className="hero-feat-body">
                  <div className="hero-feat-title">{f.title}</div>
                  <div className="hero-feat-sub">{f.sub}</div>
                </div>
                <div className="hero-feat-check">✓</div>
              </div>
            ))}
          </div>

          {/* Tagline */}
          <div className="hero-tagline">
            <div className="hero-tagline-line" />
            <span>"Trade with Data, Not Emotions"</span>
            <div className="hero-tagline-line" />
          </div>
        </div>

        {/* Right panel — form */}
        <div className="right-panel">
          <div className="wrapper">

          <div className="card">
            {/* Loading */}
            {loading.show && (
              <div className="loader active">
                <div className="spinner"></div>
                <p>{loading.text}</p>
              </div>
            )}

            {/* Alert */}
            {alert.show && (
              <div className={`alert ${alert.type}`}>{alert.message}</div>
            )}

            {/* Tabs */}
            {!hideTabs && (
              <div className="tabs">
                <div 
                  className={`tab ${activeTab === 'signin' ? 'active' : ''}`}
                  onClick={() => switchTab('signin')}
                >
                  Sign In
                </div>
                <div 
                  className={`tab ${activeTab === 'signup' ? 'active' : ''}`}
                  onClick={() => switchTab('signup')}
                >
                  Sign Up
                </div>
              </div>
            )}

            {/* Sign In Panel */}
            {activePanel === 'signin' && (
              <div className="panel active">
                <div className="section-title">Welcome back</div>
                <div className="section-sub">Sign in to your SOC account</div>
                <form onSubmit={handleSignIn} autoComplete="off">
                  <div className="field">
                    <label>Email Address</label>
                    <input
                      type="email"
                      placeholder="you@example.com"
                      required
                      value={signInData.email}
                      onChange={(e) => setSignInData({ ...signInData, email: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Password</label>
                    <input
                      type="password"
                      placeholder="Your password"
                      required
                      value={signInData.password}
                      onChange={(e) => setSignInData({ ...signInData, password: e.target.value })}
                    />
                  </div>
                  <a className="forgot-link" onClick={() => setActivePanel('forgot')}>Forgot password?</a>
                  <button type="submit" className="btn btn-primary">Sign In →</button>
                </form>
              </div>
            )}

            {/* Sign Up Panel */}
            {activePanel === 'signup' && (
              <div className="panel active">
                <div className="section-title">Create account</div>
                <div className="section-sub">Join Simplify Option Chain — it's free</div>
                <form onSubmit={handleSignUp} autoComplete="off">
                  <div className="row-2">
                    <div className="field">
                      <label>First Name</label>
                      <input
                        type="text"
                        placeholder="Raj"
                        required
                        value={signUpData.firstName}
                        onChange={(e) => setSignUpData({ ...signUpData, firstName: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label>Last Name</label>
                      <input
                        type="text"
                        placeholder="Sharma"
                        required
                        value={signUpData.lastName}
                        onChange={(e) => setSignUpData({ ...signUpData, lastName: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="field">
                    <label>Email Address</label>
                    <input
                      type="email"
                      placeholder="you@example.com"
                      required
                      value={signUpData.email}
                      onChange={(e) => setSignUpData({ ...signUpData, email: e.target.value })}
                    />
                  </div>

                  <div className="field">
                    <label>Mobile Number</label>
                    <div className="phone-row">
                      <div className="phone-prefix">🇮🇳 +91</div>
                      <input
                        type="tel"
                        placeholder="98765 43210"
                        maxLength="10"
                        required
                        value={signUpData.mobile}
                        onChange={(e) => setSignUpData({ ...signUpData, mobile: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="field">
                    <label>City</label>
                    <input
                      type="text"
                      placeholder="Mumbai, Delhi, Ahmedabad..."
                      required
                      value={signUpData.city}
                      onChange={(e) => setSignUpData({ ...signUpData, city: e.target.value })}
                    />
                  </div>

                  <div className="field">
                    <label>Password</label>
                    <input
                      type="password"
                      placeholder="Min 6 characters"
                      required
                      minLength="6"
                      value={signUpData.password}
                      onChange={(e) => setSignUpData({ ...signUpData, password: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Confirm Password</label>
                    <input
                      type="password"
                      placeholder="Re-enter password"
                      required
                      value={signUpData.confirmPassword}
                      onChange={(e) => setSignUpData({ ...signUpData, confirmPassword: e.target.value })}
                    />
                  </div>

                  <div className="field">
                    <label>Verification Method</label>
                    <div className="verify-options">
                      <div
                        className={`verify-opt ${signUpData.verificationType === 'otp' ? 'selected' : ''}`}
                        onClick={() => setSignUpData({ ...signUpData, verificationType: 'otp' })}
                      >
                        <div className="v-icon">🔢</div>
                        <div className="v-title">OTP</div>
                        <div className="v-sub">Instant · 10 min</div>
                      </div>
                      <div
                        className={`verify-opt ${signUpData.verificationType === 'link' ? 'selected' : ''}`}
                        onClick={() => setSignUpData({ ...signUpData, verificationType: 'link' })}
                      >
                        <div className="v-icon">📧</div>
                        <div className="v-title">Email Link</div>
                        <div className="v-sub">Flexible · 24 hr</div>
                      </div>
                    </div>
                  </div>

                  <button type="submit" className="btn btn-primary">Create Account →</button>
                </form>
              </div>
            )}

            {/* OTP Panel */}
            {activePanel === 'otp' && (
              <div className="panel active">
                <div className="section-title">Enter OTP</div>
                <div className="section-sub">Check your email for the 5-digit code</div>

                <div className="otp-wrap">
                  {otp.map((digit, index) => (
                    <input
                      key={index}
                      ref={el => otpInputsRef.current[index] = el}
                      className="otp-digit"
                      maxLength="1"
                      type="text"
                      inputMode="numeric"
                      value={digit}
                      onChange={(e) => handleOtpChange(index, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(index, e)}
                    />
                  ))}
                </div>
                <div className="otp-timer">
                  Expires in <span>{formatTime()}</span>
                </div>

                <button onClick={handleVerifyOTP} className="btn btn-primary">
                  Verify OTP →
                </button>
                <div className="resend-row">
                  Didn't receive it? <a onClick={handleResendOTP}>Resend OTP</a>
                </div>
                <button 
                  onClick={() => setActivePanel(pendingOTPAction === 'forgot' ? 'forgot' : 'signup')} 
                  className="btn btn-ghost"
                >
                  ← Go Back
                </button>
              </div>
            )}

            {/* Forgot Password Panel */}
            {activePanel === 'forgot' && (
              <div className="panel active">
                <div className="section-title">Reset Password</div>
                <div className="section-sub">Enter your email to receive a reset link</div>
                <form onSubmit={handleForgotPassword}>
                  <div className="field">
                    <label>Email Address</label>
                    <input
                      type="email"
                      placeholder="you@example.com"
                      required
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                    />
                  </div>
                  <button type="submit" className="btn btn-primary">Send Reset Link →</button>
                </form>
                <button onClick={() => switchTab('signin')} className="btn btn-ghost">← Back to Sign In</button>
              </div>
            )}

            {/* Email Link Sent Panel */}
            {activePanel === 'link-sent' && (
              <div className="panel active">
                <div className="email-sent">
                  <div className="email-icon-big">📨</div>
                  <h3>Check Your Email</h3>
                  <p>
                    We sent a verification link to<br />
                    <strong>{currentEmail}</strong>
                  </p>
                  <p style={{ marginTop: '12px' }}>
                    Click the link to activate your account. It's valid for <strong>24 hours</strong>.
                  </p>
                </div>
                <div style={{ height: '20px' }}></div>
                <button onClick={() => switchTab('signin')} className="btn btn-primary">Back to Sign In</button>
              </div>
            )}

            {/* Reset Password Panel */}
            {activePanel === 'reset' && (
              <div className="panel active">
                <div className="section-title">New Password</div>
                <div className="section-sub">Set your new password below</div>
                <form onSubmit={handleResetPassword}>
                  <div className="field">
                    <label>New Password</label>
                    <input
                      type="password"
                      placeholder="Min 6 characters"
                      required
                      minLength="6"
                      value={resetPasswords.newPassword}
                      onChange={(e) => setResetPasswords({ ...resetPasswords, newPassword: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Confirm Password</label>
                    <input
                      type="password"
                      placeholder="Re-enter password"
                      required
                      value={resetPasswords.confirmPassword}
                      onChange={(e) => setResetPasswords({ ...resetPasswords, confirmPassword: e.target.value })}
                    />
                  </div>
                  <button type="submit" className="btn btn-primary">Set Password →</button>
                </form>
              </div>
            )}
          </div>
        </div>
        </div>{/* end right-panel */}
        </div>{/* end auth-panels */}
      </div>{/* end auth-box */}
    </div>
  );
};

export default AuthPage;