import { CONFIG } from '../config.js?v=20261108_v25';
import { Auth, Api } from '../api.js?v=20261108_v25';
import { trackEvent } from '../analytics.js?v=20261108_v25';
import { navigate } from '../router.js?v=20261108_v25';

let firebaseAuthInstance = null;
let googleProviderInstance = null;
let googleAuthProviderClass = null;
let signInWithPopupFn = null;

async function ensureFirebaseAuth() {
  if (firebaseAuthInstance && googleProviderInstance && signInWithPopupFn) {
    return {
      auth: firebaseAuthInstance,
      provider: googleProviderInstance,
      GoogleAuthProvider: googleAuthProviderClass,
      signInWithPopup: signInWithPopupFn
    };
  }

  const [{ initializeApp, getApps }, { getAuth, GoogleAuthProvider, signInWithPopup }] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js')
  ]);

  const existingApps = getApps();
  const app = existingApps.length > 0 ? existingApps[0] : initializeApp(CONFIG.FIREBASE_CONFIG);
  firebaseAuthInstance = getAuth(app);
  googleAuthProviderClass = GoogleAuthProvider;
  googleProviderInstance = new GoogleAuthProvider();
  googleProviderInstance.setCustomParameters({ prompt: 'select_account' });
  signInWithPopupFn = signInWithPopup;

  return {
    auth: firebaseAuthInstance,
    provider: googleProviderInstance,
    GoogleAuthProvider: googleAuthProviderClass,
    signInWithPopup: signInWithPopupFn
  };
}

export function renderSignInScreen(container) {
  container.innerHTML = `
    <div class="signin-wrapper">
      <div class="signin-card">
        <div class="signin-logo">✨</div>
        <h2 class="signin-title">Promises to Creation</h2>
        <p class="signin-subtitle">
          Sign in with Google to save your completed Bible chapters, WPM &amp; CPM speed history, and Scripture reach across devices.
        </p>

        <div class="signin-btn-container" style="flex-direction: column; align-items: center; gap: 0.65rem;">
          <button
            type="button"
            id="google-popup-signin-btn"
            class="btn"
            style="
              width: 100%;
              max-width: 280px;
              min-height: 44px;
              border-radius: 9999px;
              background: var(--bg-surface);
              color: var(--text-primary);
              border: 1px solid var(--border-color);
              box-shadow: var(--shadow-sm);
              font-weight: 600;
              font-size: 0.9rem;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              gap: 0.65rem;
              padding: 0.6rem 1.25rem;
            "
          >
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            </svg>
            <span id="google-signin-btn-label">Sign in with Google</span>
          </button>
          <div id="signin-error-msg" style="font-size: 0.78rem; color: var(--char-error-text);" hidden></div>
        </div>

        <div class="signin-unauth-section">
          <div class="signin-divider"><span>or</span></div>
          <button type="button" class="btn btn-secondary signin-unauth-btn" id="continue-unauth-btn">
            Continue Unauthenticated →
          </button>
          <p class="signin-unauth-warning">
            ⚠️ <strong>Warning:</strong> All completed chapters and typing progress will be lost if you do not sign in.
          </p>
        </div>
      </div>
    </div>
  `;

  // Preload Firebase Auth SDK in the background so popup opens instantaneously on click
  ensureFirebaseAuth().catch(() => {});

  const googleBtn = container.querySelector('#google-popup-signin-btn');
  const btnLabel = container.querySelector('#google-signin-btn-label');
  const errEl = container.querySelector('#signin-error-msg');

  if (googleBtn) {
    googleBtn.addEventListener('click', async () => {
      if (errEl) errEl.hidden = true;
      if (btnLabel) btnLabel.textContent = 'Signing in...';
      googleBtn.disabled = true;

      try {
        const { auth, provider, GoogleAuthProvider, signInWithPopup } = await ensureFirebaseAuth();
        const result = await signInWithPopup(auth, provider);
        const credential = GoogleAuthProvider.credentialFromResult(result);

        // Extract the Google OAuth 2.0 ID token (verified by our Nuri AWS Lambda oauth2 tokeninfo endpoint)
        const idToken = credential?.idToken || (await result.user.getIdToken());
        Auth.setToken(idToken);

        let sub = result.user.providerData?.[0]?.uid || result.user.uid;
        try {
          if (credential?.idToken) {
            const payload = JSON.parse(atob(credential.idToken.split('.')[1]));
            if (payload.sub) sub = payload.sub;
          }
        } catch (e) {}

        const userObj = {
          sub,
          name: result.user.displayName || (result.user.email ? result.user.email.split('@')[0] : 'Reader'),
          email: result.user.email || '',
          picture: result.user.photoURL || ''
        };

        Auth.setUser(userObj);
        Auth.setSessionExpiry();
        window.dispatchEvent(new CustomEvent('bible:auth-changed', { detail: { authenticated: true } }));
        trackEvent('sign_in', { method: 'google', sub });

        // Trigger two-way cloud sync with Nuri AWS DynamoDB
        Api.syncLocalToCloud()
          .then(() => {
            window.dispatchEvent(new CustomEvent('bible:stats-updated'));
          })
          .catch(() => {});

        navigate('/typing');
      } catch (err) {
        if (btnLabel) btnLabel.textContent = 'Sign in with Google';
        googleBtn.disabled = false;
        if (err && err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
          if (errEl) {
            errEl.textContent = err.message || 'Sign-in could not be completed. Please try again.';
            errEl.hidden = false;
          }
        }
      }
    });
  }

  const unauthBtn = container.querySelector('#continue-unauth-btn');
  if (unauthBtn) {
    unauthBtn.addEventListener('click', () => {
      trackEvent('continue_unauthenticated');
      navigate('/typing');
    });
  }
}
