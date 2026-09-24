import React, { useState } from 'react';
import { useGoogleLogin } from '@react-oauth/google';

// Official multi-colour "G" mark (Google brand guidelines require it unaltered)
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Custom-styled Google sign-in. Uses the OAuth popup (implicit) flow, which hands
 * back an access token; the backend verifies it was issued for our client ID.
 */
export default function GoogleButton({ label = 'Continue with Google', disabled, onToken, onError }) {
  const [pending, setPending] = useState(false);

  const login = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        await onToken(tokenResponse.access_token);
      } finally {
        setPending(false);
      }
    },
    onError: () => { setPending(false); onError('Google sign-in failed. Please try again.'); },
    onNonOAuthError: (err) => {
      setPending(false);
      // Closing the popup is a normal cancel, not an error worth showing
      if (err?.type === 'popup_failed_to_open') onError('Your browser blocked the Google popup. Allow popups for this site and try again.');
    },
  });

  const busy = pending || disabled;

  return (
    <div>
      <button type="button" disabled={busy}
        onClick={() => { setPending(true); login(); }}
        className="group relative flex h-12 w-full items-center justify-center gap-3 overflow-hidden rounded-[10px] bg-app-text px-4 text-[15px] font-semibold text-app-bg shadow-[0_1px_0_rgba(255,255,255,0.4)_inset,0_8px_24px_-8px_rgba(0,0,0,0.6)] transition duration-200 hover:-translate-y-px hover:shadow-[0_0_0_4px_rgba(47,143,107,0.28),0_12px_32px_-10px_rgba(47,143,107,0.55)] active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0">
        {/* Light sweep across the button on hover */}
        <span className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/60 to-transparent opacity-0 transition-all duration-700 group-hover:left-full group-hover:opacity-100" />
        <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-sm">
          {pending ? <span className="text-app-accent"><Spinner /></span> : <GoogleMark />}
        </span>
        <span className="relative">{pending ? 'Connecting to Google…' : label}</span>
        {!pending && (
          <span className="absolute right-4 hidden text-app-accent transition-transform duration-200 group-hover:translate-x-0.5 sm:inline" aria-hidden="true">→</span>
        )}
      </button>
      <p className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-app-text3">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
        Secure one-click sign-in · we never see your Google password
      </p>
    </div>
  );
}
