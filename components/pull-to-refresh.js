/**
 * Mobile Pull-to-Refresh Component for Promises to Creation
 * Provides smooth, native-feeling pull-down-to-refresh functionality on mobile touch devices.
 */

export function initPullToRefresh() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  // Avoid duplicate initialization
  if (document.querySelector('.pull-to-refresh-container')) return;

  const container = document.createElement('div');
  container.className = 'pull-to-refresh-container';
  container.setAttribute('aria-hidden', 'true');
  container.innerHTML = `
    <div class="pull-to-refresh-pill">
      <div class="pull-to-refresh-icon">
        <svg class="pull-to-refresh-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <polyline points="19 12 12 19 5 12"></polyline>
        </svg>
        <div class="pull-to-refresh-spinner"></div>
      </div>
      <span class="pull-to-refresh-text">Pull to refresh</span>
    </div>
  `;
  document.body.appendChild(container);

  const arrowEl = container.querySelector('.pull-to-refresh-arrow');
  const textEl = container.querySelector('.pull-to-refresh-text');

  let startX = 0;
  let startY = 0;
  let isAtTop = false;
  let isPulling = false;
  let isRefreshing = false;
  let pullDistance = 0;
  let hasTriggeredHaptic = false;

  const PULL_THRESHOLD = 65; // px required to trigger refresh
  const MAX_PULL = 115;      // maximum travel distance

  function isScrollAtTop(target) {
    // Check global window / document scroll
    const winScroll = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
    if (winScroll > 2) return false;

    // Do not trigger inside open modals
    const openModal = document.querySelector(
      '.typing-options-backdrop:not([hidden]), .scope-settings-backdrop:not([hidden]), .mode-settings-backdrop:not([hidden]), .typing-actions-backdrop:not([hidden]), .typing-bookmark-backdrop:not([hidden]), .completion-modal-backdrop:not([hidden])'
    );
    if (openModal) return false;

    // Do not trigger on drawing canvas
    if (target && target.closest && target.closest('canvas, .meditate-canvas-wrapper, #meditate-canvas')) {
      return false;
    }

    // Check inner scrollable containers (e.g. typing passage scroll or lists)
    let cur = target;
    while (cur && cur !== document.body && cur !== document.documentElement) {
      if (cur.scrollHeight > cur.clientHeight) {
        const overflowY = window.getComputedStyle(cur).overflowY;
        if (overflowY === 'auto' || overflowY === 'scroll') {
          if (cur.scrollTop > 2) return false;
        }
      }
      cur = cur.parentElement;
    }

    return true;
  }

  window.addEventListener('touchstart', (e) => {
    if (isRefreshing) return;
    if (!e.touches || e.touches.length !== 1) return;

    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    pullDistance = 0;
    isPulling = false;
    hasTriggeredHaptic = false;

    isAtTop = isScrollAtTop(e.target);
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (isRefreshing || !isAtTop) return;
    if (!e.touches || e.touches.length !== 1) return;

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = currentX - startX;
    const diffY = currentY - startY;

    if (!isPulling) {
      // Must be dragging downward with vertical dominance (not a horizontal swipe)
      if (diffY > 10 && diffY > Math.abs(diffX) * 1.25) {
        if (!isScrollAtTop(e.target)) {
          isAtTop = false;
          return;
        }
        isPulling = true;
        container.classList.add('is-active');
        container.classList.remove('is-animating');
      } else if (diffY < -5 || Math.abs(diffX) > Math.abs(diffY)) {
        isAtTop = false;
        return;
      }
    }

    if (isPulling) {
      if (e.cancelable) {
        e.preventDefault();
      }

      // Logarithmic / dampened pull distance
      const dampFactor = 0.45;
      pullDistance = Math.min(MAX_PULL, diffY * dampFactor);
      if (pullDistance < 0) pullDistance = 0;

      const progress = Math.min(1, pullDistance / PULL_THRESHOLD);
      const currentPercent = -110 + (progress * 110);
      const extraPx = Math.max(0, pullDistance - PULL_THRESHOLD) * 0.4;

      container.style.transform = `translateY(calc(${currentPercent}% + ${extraPx}px))`;

      if (arrowEl) {
        arrowEl.style.transform = `rotate(${progress * 180}deg)`;
      }

      if (pullDistance >= PULL_THRESHOLD) {
        if (!container.classList.contains('is-ready')) {
          container.classList.add('is-ready');
          if (textEl) textEl.textContent = 'Release to refresh';
          if (!hasTriggeredHaptic) {
            hasTriggeredHaptic = true;
            if (navigator.vibrate) {
              try { navigator.vibrate(12); } catch (_) {}
            }
          }
        }
      } else {
        if (container.classList.contains('is-ready')) {
          container.classList.remove('is-ready');
          if (textEl) textEl.textContent = 'Pull to refresh';
          hasTriggeredHaptic = false;
        }
      }
    }
  }, { passive: false });

  const handleTouchEnd = () => {
    if (!isPulling || isRefreshing) return;
    isPulling = false;
    container.classList.add('is-animating');

    if (pullDistance >= PULL_THRESHOLD) {
      isRefreshing = true;
      container.classList.add('is-refreshing');
      container.style.transform = 'translateY(0)';
      if (textEl) textEl.textContent = 'Refreshing...';

      if (navigator.vibrate) {
        try { navigator.vibrate(15); } catch (_) {}
      }

      setTimeout(() => {
        window.location.reload();
      }, 350);
    } else {
      container.style.transform = 'translateY(-110%)';
      container.classList.remove('is-ready');
      setTimeout(() => {
        container.classList.remove('is-active', 'is-animating');
        if (arrowEl) arrowEl.style.transform = 'rotate(0deg)';
        if (textEl) textEl.textContent = 'Pull to refresh';
      }, 260);
    }
  };

  window.addEventListener('touchend', handleTouchEnd, { passive: true });
  window.addEventListener('touchcancel', handleTouchEnd, { passive: true });
}
