import { trackEvent } from '../analytics.js?v=20261121_v17';
import { CONFIG } from '../config.js?v=20261121_v17';

/**
 * About + Charities screens.
 * - /about     : project story, PayPal support modal (SSM-backed via Lambda), charities link, contact modal
 * - /charities : the two charities this project hopes to support (both still in development)
 */

const CONTACT_ENDPOINT = 'https://5osdsd7re7htcmddembdmucjv40ikqlo.lambda-url.us-east-1.on.aws/';
const CONTACT_DOMAIN = 'promisestocreation.org';

let paypalSdkPromise = null;

function loadPayPalSdk() {
  if (window.paypal && window.paypal.Buttons) {
    return Promise.resolve(window.paypal);
  }
  if (paypalSdkPromise) return paypalSdkPromise;

  paypalSdkPromise = (async () => {
    const res = await fetch(`${CONFIG.API_ENDPOINTS.profile}?action=paypal-config`);
    if (!res.ok) throw new Error('Could not load payment configuration');
    const { clientId } = await res.json();
    if (!clientId) throw new Error('Missing PayPal client ID');

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&intent=capture`;
      script.async = true;
      script.onload = () => {
        if (window.paypal && window.paypal.Buttons) {
          resolve(window.paypal);
        } else {
          reject(new Error('PayPal SDK failed to initialize'));
        }
      };
      script.onerror = () => reject(new Error('Failed to load PayPal SDK'));
      document.head.appendChild(script);
    });
  })().catch((err) => {
    paypalSdkPromise = null;
    throw err;
  });

  return paypalSdkPromise;
}

export function renderAboutScreen(container) {
  document.documentElement.classList.add('about-active-view');
  document.body.classList.add('about-active-view');

  container.innerHTML = `
    <div class="about-screen-container">
      <article class="about-card">
        <div class="about-highlights">
          <div class="about-highlight-item">
            <span class="about-highlight-title">Daily random verse carousel</span>
            <p class="about-highlight-desc">
              Swipe through random verses from across the entire Bible to keep discovering Scripture and let God speak to you.
            </p>
          </div>

          <div class="about-highlight-item">
            <span class="about-highlight-title">Total Bible progress</span>
            <p class="about-highlight-desc">
              Track your exposure to God's promises across every verse and chapter of all 66 books and 1,189 chapters.
            </p>
          </div>

          <div class="about-highlight-item">
            <span class="about-highlight-title">Productive time in the Word</span>
            <p class="about-highlight-desc">
              Practice typing, speak verses aloud, reflect through drawing, or listen along hands-free during everyday chores.
            </p>
          </div>
        </div>

        <nav class="about-link-stack" aria-label="About actions">
          <button type="button" class="about-stack-link" id="about-contact-btn">
            <span class="about-stack-link-label">Contact Us</span>
            <span class="about-stack-link-arrow" aria-hidden="true">→</span>
          </button>
          <a href="/charities" class="about-stack-link" id="about-charities-link">
            <span class="about-stack-link-label">View our Causes</span>
            <span class="about-stack-link-arrow" aria-hidden="true">→</span>
          </a>
          <button type="button" class="about-stack-link" id="about-support-btn">
            <span class="about-stack-link-label">Support this Project</span>
            <span class="about-stack-link-arrow" aria-hidden="true">→</span>
          </button>
        </nav>
      </article>

      <!-- Support / Donate modal (PayPal order created & captured server-side via AWS SSM Parameter Store) -->
      <div class="about-modal-backdrop" id="about-donate-backdrop" hidden>
        <div class="about-modal" role="dialog" aria-modal="true" aria-labelledby="about-donate-title">
          <div class="about-modal-header">
            <h2 id="about-donate-title">Support Promises to Creation</h2>
            <button type="button" class="about-modal-close" id="about-donate-close" aria-label="Close">✕</button>
          </div>

          <p class="about-donate-subtitle">Choose an amount (USD)</p>

          <div class="about-donate-amounts" id="about-donate-amounts">
            <button type="button" class="about-amount-pill is-selected" data-amount="1">$1</button>
            <button type="button" class="about-amount-pill" data-amount="1000">$1,000</button>
            <button type="button" class="about-amount-pill" data-amount="10000">$10,000</button>
          </div>

          <label class="about-field about-custom-amount-field">
            <span>Amount (USD)</span>
            <input type="number" id="about-donate-custom-input" min="1" max="10000" step="1" value="1" placeholder="Amount ($)" />
          </label>

          <div class="about-paypal-status" id="about-paypal-status">Loading secure checkout…</div>
          <div class="about-paypal-buttons" id="about-paypal-buttons"></div>
        </div>
      </div>

      <!-- Donation Thank You modal -->
      <div class="about-modal-backdrop" id="about-donate-success-backdrop" hidden>
        <div class="about-modal about-modal-small" role="dialog" aria-modal="true" aria-labelledby="about-donate-success-title">
          <h2 id="about-donate-success-title">Thank you</h2>
          <p>Your generous support helps keep Promises to Creation free and growing.</p>
          <button type="button" class="about-btn about-btn-primary" id="about-donate-success-close">Close</button>
        </div>
      </div>

      <!-- Contact modal (same Lambda-backed form setup used on nuri.software) -->
      <div class="about-modal-backdrop" id="about-contact-backdrop" hidden>
        <div class="about-modal" role="dialog" aria-modal="true" aria-labelledby="about-contact-title">
          <div class="about-modal-header">
            <h2 id="about-contact-title">Contact</h2>
            <button type="button" class="about-modal-close" id="about-contact-close" aria-label="Close">✕</button>
          </div>
          <form class="about-form" id="contactForm" action="${CONTACT_ENDPOINT}" method="POST">
            <label class="about-field">
              <span>Your name</span>
              <input type="text" name="name" placeholder="Jane Smith" required />
            </label>
            <label class="about-field">
              <span>Email address</span>
              <input type="email" name="email" placeholder="jane@example.com" required />
            </label>
            <label class="about-field">
              <span>Topic</span>
              <select name="subject">
                <option value="general" selected>General question</option>
                <option value="feedback">Feedback or idea</option>
                <option value="bug">Something is not working</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label class="about-field">
              <span>Message</span>
              <textarea name="message" rows="5" placeholder="Your message" required></textarea>
            </label>

            <!-- HONEYPOT (anti-spam) -->
            <div style="display:none;" aria-hidden="true">
              <label for="website_url">Leave this field blank</label>
              <input type="text" name="website_url" id="website_url" tabindex="-1" autocomplete="off" />
            </div>

            <input type="hidden" name="domain" value="${CONTACT_DOMAIN}" />
            <input type="hidden" name="_redirect" value="https://${CONTACT_DOMAIN}/about#success" />
            <input type="hidden" name="_subject" value="New message from Promises to Creation" />

            <button type="submit" class="about-btn about-btn-primary about-submit" id="submitBtn">Send message</button>
          </form>
        </div>
      </div>

      <!-- Contact Success modal -->
      <div class="about-modal-backdrop" id="about-success-backdrop" hidden>
        <div class="about-modal about-modal-small" role="dialog" aria-modal="true" aria-labelledby="about-success-title">
          <h2 id="about-success-title">Thank you</h2>
          <p>Your message is on its way. Thank you for reaching out.</p>
          <button type="button" class="about-btn about-btn-primary" id="about-success-close">Close</button>
        </div>
      </div>
    </div>
  `;

  // ── Support / Donate Modal Logic ──
  const donateBackdrop = container.querySelector('#about-donate-backdrop');
  const donateSuccessBackdrop = container.querySelector('#about-donate-success-backdrop');
  const amountPills = container.querySelectorAll('.about-amount-pill');
  const customAmountInput = container.querySelector('#about-donate-custom-input');
  const paypalStatusEl = container.querySelector('#about-paypal-status');
  const paypalButtonsEl = container.querySelector('#about-paypal-buttons');

  let selectedPresetAmount = 1;
  let paypalButtonsRendered = false;

  function getSelectedDonationAmount() {
    const customVal = parseFloat(customAmountInput.value);
    if (Number.isFinite(customVal) && customVal >= 1) {
      return Math.min(10000, Math.round(customVal * 100) / 100);
    }
    return selectedPresetAmount;
  }

  amountPills.forEach((pill) => {
    pill.addEventListener('click', () => {
      selectedPresetAmount = Number(pill.getAttribute('data-amount')) || 1;
      customAmountInput.value = String(selectedPresetAmount);
      amountPills.forEach((p) => p.classList.toggle('is-selected', p === pill));
    });
  });

  customAmountInput.addEventListener('input', () => {
    const typedVal = parseFloat(customAmountInput.value);
    if (Number.isFinite(typedVal) && typedVal >= 1) {
      selectedPresetAmount = typedVal;
    }
    amountPills.forEach((p) => {
      const pillAmt = Number(p.getAttribute('data-amount'));
      p.classList.toggle('is-selected', Number.isFinite(typedVal) && pillAmt === typedVal);
    });
  });

  async function ensurePayPalButtonsRendered() {
    if (paypalButtonsRendered) return;
    paypalStatusEl.hidden = false;
    paypalStatusEl.textContent = 'Loading secure checkout…';
    try {
      const paypal = await loadPayPalSdk();
      if (!document.body.contains(paypalButtonsEl)) return;
      paypalButtonsEl.innerHTML = '';
      paypalStatusEl.hidden = true;
      paypalButtonsRendered = true;

      paypal.Buttons({
        style: {
          layout: 'vertical',
          color: 'gold',
          shape: 'rect',
          label: 'donate'
        },
        createOrder: async () => {
          const amount = getSelectedDonationAmount();
          trackEvent('about_donate_Order_start', { amount });
          const res = await fetch(CONFIG.API_ENDPOINTS.profile, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'paypal-create-order', amount })
          });
          const data = await res.json();
          if (!res.ok || !data.orderId) {
            throw new Error(data.error || 'Could not initiate donation');
          }
          return data.orderId;
        },
        onApprove: async (data) => {
          paypalStatusEl.hidden = false;
          paypalStatusEl.textContent = 'Completing contribution…';
          const res = await fetch(CONFIG.API_ENDPOINTS.profile, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'paypal-capture-order', orderId: data.orderID })
          });
          const capData = await res.json();
          paypalStatusEl.hidden = true;
          if (!res.ok) {
            throw new Error(capData.error || 'Could not complete contribution');
          }
          trackEvent('about_donate_complete', { amount: getSelectedDonationAmount() });
          donateBackdrop.hidden = true;
          donateSuccessBackdrop.hidden = false;
        },
        onError: (err) => {
          console.error('PayPal checkout error:', err);
          paypalStatusEl.hidden = false;
          paypalStatusEl.textContent = 'Checkout encountered an issue. Please try again.';
        }
      }).render(paypalButtonsEl);
    } catch (err) {
      console.error('Failed to load PayPal checkout:', err);
      paypalStatusEl.hidden = false;
      paypalStatusEl.textContent = 'Could not load PayPal checkout right now. Please try again shortly.';
    }
  }

  const openDonateModal = () => {
    donateBackdrop.hidden = false;
    trackEvent('about_support_click');
    ensurePayPalButtonsRendered();
  };
  const closeDonateModal = () => { donateBackdrop.hidden = true; };
  const closeDonateSuccess = () => { donateSuccessBackdrop.hidden = true; };

  container.querySelector('#about-support-btn').addEventListener('click', openDonateModal);
  container.querySelector('#about-donate-close').addEventListener('click', closeDonateModal);
  donateBackdrop.addEventListener('click', (e) => { if (e.target === donateBackdrop) closeDonateModal(); });
  container.querySelector('#about-donate-success-close').addEventListener('click', closeDonateSuccess);
  donateSuccessBackdrop.addEventListener('click', (e) => { if (e.target === donateSuccessBackdrop) closeDonateSuccess(); });

  // ── Contact Modal Logic ──
  const contactBackdrop = container.querySelector('#about-contact-backdrop');
  const successBackdrop = container.querySelector('#about-success-backdrop');
  const contactForm = container.querySelector('#contactForm');

  const openContact = () => {
    contactBackdrop.hidden = false;
    trackEvent('about_contact_open');
    const first = contactForm.querySelector('input[name="name"]');
    if (first) first.focus();
  };
  const closeContact = () => { contactBackdrop.hidden = true; };
  const closeSuccess = () => { successBackdrop.hidden = true; };

  container.querySelector('#about-contact-btn').addEventListener('click', openContact);
  container.querySelector('#about-contact-close').addEventListener('click', closeContact);
  contactBackdrop.addEventListener('click', (e) => { if (e.target === contactBackdrop) closeContact(); });
  container.querySelector('#about-success-close').addEventListener('click', closeSuccess);
  successBackdrop.addEventListener('click', (e) => { if (e.target === successBackdrop) closeSuccess(); });

  // The form posts natively; the Lambda stores/sends it and redirects back to /about#success.
  contactForm.addEventListener('submit', () => {
    const btn = container.querySelector('#submitBtn');
    btn.textContent = 'Sending…';
    btn.disabled = true;
    trackEvent('about_contact_submit');
  });

  const charitiesLink = container.querySelector('#about-charities-link');
  if (charitiesLink) {
    charitiesLink.addEventListener('click', () => trackEvent('about_charities_click'));
  }

  if (window.location.hash === '#success') {
    successBackdrop.hidden = false;
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}

export function renderCharitiesScreen(container) {
  document.documentElement.classList.add('about-active-view');
  document.body.classList.add('about-active-view');

  container.innerHTML = `
    <div class="about-screen-container">
      <div class="charities-stage">
        <a class="about-back-link" href="/about">← About</a>

        <div class="charity-grid">
          <section class="charity-card">
            <div class="charity-mark" aria-hidden="true">✏️</div>
            <h2 class="charity-name">Dream Fund Cambodia</h2>
            <p class="charity-desc">
              Bringing school supplies and joy to children in some of Cambodia's most remote rural communities,
              one pencil and one notebook at a time.
            </p>
            <span class="charity-status">In development</span>
          </section>

          <section class="charity-card">
            <div class="charity-mark" aria-hidden="true">🕊️</div>
            <h2 class="charity-name">Widow and Orphanage Sanctuary</h2>
            <p class="charity-desc">
              A place of safety, care, and belonging for widows and orphans.
            </p>
            <span class="charity-status">In development</span>
          </section>
        </div>
      </div>
    </div>
  `;
}

