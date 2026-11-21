import { trackEvent } from '../analytics.js?v=20261121_v4';

/**
 * About + Charities screens.
 * - /about     : project story, support section, understated charities teaser, contact
 * - /charities : the two charities this project hopes to support (both still in development)
 */

// Set this to the PayPal donation page URL once it exists. While empty, the support
// section shows a gentle "coming soon" note instead of a button.
const SUPPORT_DONATION_URL = '';

const CONTACT_ENDPOINT = 'https://5osdsd7re7htcmddembdmucjv40ikqlo.lambda-url.us-east-1.on.aws/';
const CONTACT_DOMAIN = 'promisestocreation.org';

export function renderAboutScreen(container) {
  const supportAction = SUPPORT_DONATION_URL
    ? `<a class="about-btn about-btn-primary" href="${SUPPORT_DONATION_URL}" target="_blank" rel="noopener noreferrer" id="about-support-btn">Support this project</a>`
    : `<span class="about-soon-note">Donations will open here soon. Thank you for the thought.</span>`;

  container.innerHTML = `
    <div class="about-screen-container">
      <article class="about-card">
        <header class="about-header">
          <h1 class="about-title">About Promises to Creation</h1>
          <p class="about-lede">A quiet place to spend time with scripture.</p>
        </header>

        <section class="about-section">
          <p>
            I wanted a simple way to track my progress through the Bible, verse by verse and chapter by chapter,
            and to see how far I have come.
          </p>
          <p>
            I also like to make the most of my time. If I am going to be in the Word anyway, I might as well
            practice <strong>typing</strong> it, <strong>speaking</strong> it aloud, or <strong>drawing</strong> it,
            and when my hands are busy I can simply <strong>listen</strong> while doing chores.
          </p>
          <p>
            That is all this is: one small tool, built to make daily time in scripture a little easier to keep.
          </p>
        </section>

        <section class="about-section about-support">
          <h2 class="about-heading">Support this project</h2>
          <p>
            Promises to Creation is free and always will be. If it has been useful to you and you would like to
            help keep it running and growing, you are welcome to contribute.
          </p>
          <div class="about-actions">${supportAction}</div>
        </section>

        <section class="about-section about-contact">
          <h2 class="about-heading">Get in touch</h2>
          <p>Questions, ideas, or a bug to report? I would love to hear from you.</p>
          <div class="about-actions">
            <button type="button" class="about-btn about-btn-secondary" id="about-contact-btn">Contact</button>
          </div>
        </section>

        <footer class="about-footer">
          <a class="about-charities-link" href="/charities" id="about-charities-link">
            Charities we hope to support <span aria-hidden="true">→</span>
          </a>
        </footer>
      </article>

      <!-- Contact modal (same Lambda-backed form setup used on the other sites) -->
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
              <textarea name="message" rows="5" placeholder="How can I help?" required></textarea>
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

      <!-- Success modal -->
      <div class="about-modal-backdrop" id="about-success-backdrop" hidden>
        <div class="about-modal about-modal-small" role="dialog" aria-modal="true" aria-labelledby="about-success-title">
          <h2 id="about-success-title">Thank you</h2>
          <p>Your message is on its way. I will get back to you as soon as I can.</p>
          <button type="button" class="about-btn about-btn-primary" id="about-success-close">Close</button>
        </div>
      </div>
    </div>
  `;

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
  const supportBtn = container.querySelector('#about-support-btn');
  if (supportBtn) {
    supportBtn.addEventListener('click', () => trackEvent('about_support_click'));
  }

  if (window.location.hash === '#success') {
    successBackdrop.hidden = false;
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}

export function renderCharitiesScreen(container) {
  container.innerHTML = `
    <div class="about-screen-container">
      <article class="about-card">
        <header class="about-header">
          <a class="about-back-link" href="/about">← About</a>
          <h1 class="about-title">Charities</h1>
          <p class="about-lede">
            My hope is that this project can one day give back. These are the two causes closest to my heart.
          </p>
        </header>

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

        <p class="charity-note">
          Both charities are still being built, so there are no links yet. Thank you for your patience and kindness;
          I will share more here as they come to life.
        </p>
      </article>
    </div>
  `;
}
