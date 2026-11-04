import { CONFIG } from '../config.js';
import { Auth, Api } from '../api.js';
import { trackEvent } from '../analytics.js';
import { navigate } from '../app.js';

export function renderSignInScreen(container) {
  container.innerHTML = `
    <div class="signin-wrapper">
      <div class="signin-card">
        <div class="signin-logo">✨</div>
        <h2 class="signin-title">bible</h2>
        <p class="signin-subtitle">
          Sign in with Google to save your completed Bible chapters, WPM &amp; CPM speed history, and Scripture reach across devices.
        </p>

        <div class="signin-btn-container">
          <!-- Render Google One Tap / Button Container -->
          <div id="google-signin-btn"></div>
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

  const unauthBtn = container.querySelector('#continue-unauth-btn');
  if (unauthBtn) {
    unauthBtn.addEventListener('click', () => {
      trackEvent('continue_unauthenticated');
      navigate('#/hub');
    });
  }

  function initGoogleBtn() {
    if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
      google.accounts.id.initialize({
        client_id: CONFIG.GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
        auto_select: false,
        cancel_on_tap_outside: true
      });

      const btnContainer = document.getElementById('google-signin-btn');
      if (btnContainer) {
        google.accounts.id.renderButton(btnContainer, {
          theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'filled_black' : 'outline',
          size: 'large',
          shape: 'pill',
          text: 'signin_with',
          logo_alignment: 'left',
          width: 280,
          locale: 'en'
        });
      }
    } else {
      setTimeout(initGoogleBtn, 100);
    }
  }

  async function handleCredentialResponse(response) {
    if (response && response.credential) {
      const idToken = response.credential;
      Auth.setToken(idToken);

      try {
        const payload = JSON.parse(atob(idToken.split('.')[1]));
        const userObj = {
          sub: payload.sub,
          name: payload.name,
          email: payload.email,
          picture: payload.picture
        };
        Auth.setUser(userObj);
        trackEvent('sign_in', { method: 'google', sub: payload.sub });

        // Trigger two-way cloud sync
        Api.syncLocalToCloud().then(() => {
          window.dispatchEvent(new CustomEvent('bible:stats-updated'));
        }).catch(() => {});

        navigate('#/hub');
      } catch (err) {
        console.error('Failed to parse JWT payload:', err);
        navigate('#/hub');
      }
    }
  }

  initGoogleBtn();
}
