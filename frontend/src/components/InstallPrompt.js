import React, { useEffect, useState } from 'react';
import themeModule from '../tailwindTheme';

const { appTheme: T } = themeModule;

const DISMISS_KEY = 'install_prompt_dismissed_at';
const DISMISS_DAYS = 7;

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

// iPadOS reports itself as a Mac, so also check for touch
const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// Only Safari can add to the home screen on iOS; Chrome/Firefox/in-app browsers there cannot
const isIOSSafari = () => isIOS() && !/crios|fxios|edgios|fban|fbav|instagram|line\//i.test(navigator.userAgent);

const recentlyDismissed = () => {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return at && Date.now() - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch { return false; }
};

function ShareIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'inline-block', verticalAlign: '-2px' }}>
      <path d="M12 3v12M7 8l5-5 5 5" /><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}

/**
 * Bottom banner offering to install the app.
 * Android/desktop Chrome: triggers the native install prompt.
 * iOS Safari: there is no install API, so it shows the Share → Add to Home Screen steps.
 */
export default function InstallPrompt() {
  const [deferred, setDeferred] = useState(null);
  const [showIOS, setShowIOS] = useState(false);
  const [hidden, setHidden] = useState(() => isStandalone() || recentlyDismissed());

  useEffect(() => {
    if (hidden) return;
    const onPrompt = (e) => { e.preventDefault(); setDeferred(e); };
    const onInstalled = () => { setDeferred(null); setHidden(true); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    if (isIOSSafari()) setShowIOS(true);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, [hidden]);

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch {}
    setHidden(true);
  };

  const install = async () => {
    if (!deferred) return;
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    if (outcome === 'accepted') setHidden(true); else dismiss();
  };

  if (hidden || (!deferred && !showIOS)) return null;

  return (
    <div role="dialog" aria-label="Install app"
      style={{ position: 'fixed', left: 12, right: 12, bottom: 12, zIndex: 1000, maxWidth: 480, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12, background: T.bg2, border: `1px solid ${T.accent}66`, borderRadius: 14, padding: '12px 14px', boxShadow: '0 10px 30px rgba(0,0,0,0.45)', fontFamily: T.fonts.display, color: T.text }}>
      <img src="/icon-192.png" alt="" width="40" height="40" style={{ borderRadius: 10, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Install spend&amp;Track</div>
        <div style={{ fontSize: 12, color: T.text2, marginTop: 2, lineHeight: 1.5 }}>
          {deferred
            ? 'Add it to your home screen for quick, full-screen access.'
            : <>Tap <span style={{ color: T.accent2 }}><ShareIcon /> Share</span>, then <b style={{ color: T.text }}>Add to Home Screen</b>.</>}
        </div>
      </div>
      {deferred && (
        <button onClick={install}
          style={{ background: T.accent, border: 'none', borderRadius: 9, color: '#fff', padding: '9px 14px', fontFamily: T.fonts.display, fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
          Install
        </button>
      )}
      <button onClick={dismiss} aria-label="Dismiss"
        style={{ background: 'none', border: 'none', color: T.text3, fontSize: 16, cursor: 'pointer', padding: 4, flexShrink: 0 }}>
        ✕
      </button>
    </div>
  );
}
