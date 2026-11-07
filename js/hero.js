// The portrait is readable immediately; a single warm pass follows its load.
export function directHero(hero, sea, motion, onReady = () => {}) {
  const portrait = hero.querySelector('.hero-portrait');
  const lit = portrait.querySelector('.portrait-lit');
  const sweep = document.createElement('span');
  sweep.className = 'portrait-sweep';
  sweep.setAttribute('aria-hidden', 'true');
  const lightMask = document.createElement('span');
  lightMask.className = 'portrait-light-mask';
  lightMask.setAttribute('aria-hidden', 'true');
  lightMask.append(sweep);
  portrait.append(lightMask);
  let finished = false;
  let timer;
  let animation;
  function layout() {
    if (window.innerWidth >= 768) return;
    const status = hero.querySelector('.hero-status').getBoundingClientRect();
    const stage = hero.querySelector('.hero-stage').getBoundingClientRect();
    // The existing cutout's first opaque pixel is at 103 / 900 of its height.
    portrait.style.setProperty('--portrait-top', `${status.bottom - stage.top + 20 - portrait.offsetHeight * 103 / 900}px`);
  }
  function finish() {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    animation?.cancel();
    lightMask.remove();
    hero.classList.add('is-settled');
    sea.setLight(16, 0, 1, false);
    onReady();
  }
  function loaded() {
    if (finished) return;
    layout();
    if (motion.matches || window.scrollY > 0 || document.hidden || !sweep.animate) { finish(); return; }
    timer = window.setTimeout(() => {
      if (finished) return;
      animation = sweep.animate([
        { transform: 'translateX(-120%)', opacity: 0 },
        { opacity: .35, offset: .45 },
        { transform: 'translateX(220%)', opacity: 0 },
      ], { duration: 800, easing: 'ease-in-out' });
      animation.finished.then(finish).catch(() => {});
    }, 300);
  }
  lit.addEventListener('load', loaded, { once: true });
  lit.addEventListener('error', () => { lit.hidden = true; finish(); }, { once: true });
  if (lit.complete) { if (lit.naturalWidth) loaded(); else finish(); }
  if (motion.matches) finish();
  layout();
  document.fonts.ready.then(layout);
  window.addEventListener('resize', layout, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) finish(); });
  motion.addEventListener('change', () => { if (motion.matches) finish(); });
  return { finish };
}
