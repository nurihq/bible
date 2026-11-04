import { CONFIG } from '../config.js';
import { Auth, Api } from '../api.js';
import { trackEvent } from '../analytics.js';
import { navigate } from '../app.js';

export function renderSignInScreen(container) {
  container.innerHTML = `
    <div class="signin-wrapper">
      <div class="signin-card">
        <div class="signin-logo">📖</div>
        <h1 class="signin-title">bible</h1>
        <p class="signin-subtitle">
          Sign in to access the Bible Typing suite, track your WPM &amp; CPM speed, and record your reach across all 1,189 chapters of Scripture.
        </p>

        <div class="signin-btn-container">
          <div id="google-signin-btn"></div>
        </div>

        <div class="signin-features-mini">
          <div class="signin-feature-pill">⌨️ 22 Translations (ESV Default)</div>
          <div class="signin-feature-pill">📊 Live WPM &amp; CPM Tracking</div>
          <div class="signin-feature-pill">☁️ Nuri AWS Cloud Sync &amp; Backups</div>
        </div>

        <div class="signin-footer">
          <p>Protected with Google Identity Services &amp; AWS DynamoDB.</p>
        </div>
      </div>
    </div>
  `;

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

        navigate('#/');
      } catch (err) {
        console.error('Failed to parse JWT payload:', err);
        navigate('#/');
      }
    }
  }

  initGoogleBtn();
}
