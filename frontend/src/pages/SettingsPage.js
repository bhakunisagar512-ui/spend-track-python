import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import themeModule from '../tailwindTheme';

const { appTheme: T } = themeModule;

export default function SettingsPage() {
  const { user, isGuest, logout } = useAuth();   // updateApiKey no longer needed
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate('/login'); };

  const card  = { background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 24, marginBottom: 16 };
  const label = { fontSize: 11, fontWeight: 700, letterSpacing: '1.2px', color: T.text3, textTransform: 'uppercase', marginBottom: 10, display: 'block' };

  return (
    <div className="bg-app-bg min-h-screen" style={{ fontFamily: T.fonts.display, color: T.text }}>
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 20px' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <button onClick={() => navigate('/')}
            style={{ background: 'none', border: `1px solid ${T.border}`, borderRadius: 8, color: T.text2, padding: '6px 14px', cursor: 'pointer', fontFamily: T.fonts.display, fontSize: 13 }}>
            ← Back
          </button>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: T.text }}>Settings</h1>
        </div>

        {/* ── Account ── */}
        <div style={card}>
          <span style={label}>Account</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {user?.avatar_url
              ? <img src={user.avatar_url} alt="avatar" style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }} />
              : <div style={{ width: 48, height: 48, borderRadius: '50%', background: T.accent + '33', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: T.accent }}>
                  {user?.name?.charAt(0).toUpperCase()}
                </div>
            }
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{user?.name}</div>
              <div style={{ fontSize: 13, color: T.text2 }}>{user?.email}</div>
            </div>
          </div>
        </div>

        {/* ── Sign Out ── */}
        <div style={card}>
          <span style={label}>Session</span>
          <p style={{ fontSize: 13, color: T.text2, marginBottom: 14 }}>
            {isGuest
              ? 'You are using a guest session. Signing out permanently wipes all guest transactions and budgets.'
              : 'Sign out of your account on this device.'}
          </p>
          <button onClick={handleLogout}
            style={{ background: T.danger + '18', border: `1px solid ${T.danger}44`, borderRadius: 10, padding: '10px 22px', color: T.danger, fontFamily: T.fonts.display, fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
            {isGuest ? 'Exit Guest Mode' : 'Sign Out'}
          </button>
        </div>

      </div>
    </div>
  );
}