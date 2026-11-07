// Effects are enhancements: all text remains available without animation support.
export function setupChapterEffects(motion) {
  const number = document.querySelector('.proof-number span');
  const finalNumber = number?.textContent || '';
  const target = Number.parseInt(finalNumber, 10);
  let frame;
  let counted = false;
  function count() {
    if (counted || !number || !Number.isFinite(target)) return;
    counted = true;
    if (motion.matches) return;
    number.textContent = '0';
    const start = performance.now();
    function tick(now) {
      const p = Math.min(1, (now - start) / 900);
      number.textContent = p === 1 ? finalNumber : String(Math.round(target * (1 - (1 - p) ** 3)));
      if (p < 1 && !motion.matches) frame = requestAnimationFrame(tick);
      else number.textContent = finalNumber;
    }
    frame = requestAnimationFrame(tick);
  }
  const program = document.querySelector('#program');
  const title = program.querySelector('.chapter-heading');
  const beam = program.querySelector('.program-beam');
  const beacon = program.querySelector('.program-beacon');
  const animations = new Set();
  let played = false;
  try { played = sessionStorage.getItem('angelina-program-beam-v6') === '1'; } catch { /* Storage can be unavailable. */ }
  const observe = 'IntersectionObserver' in window;
  if (!played && !motion.matches && observe && beam.animate) program.classList.add('beam-ready');
  function play() {
    if (played || motion.matches || !beam.animate) return;
    played = true;
    try { sessionStorage.setItem('angelina-program-beam-v6', '1'); } catch { /* Keep in-memory guard. */ }
    program.classList.remove('beam-ready');
    const run = (node, frames, options) => {
      const animation = node.animate(frames, options);
      animations.add(animation);
      animation.finished.catch(() => {}).finally(() => { animations.delete(animation); animation.cancel(); });
    };
    run(beacon, [{ opacity: 0 }, { opacity: 1, offset: .12 }, { opacity: 1, offset: .78 }, { opacity: 0 }], { duration: 1800 });
    run(beam, [
      { transform: 'rotate(-35deg)', opacity: 1 },
      { transform: 'rotate(25deg)', opacity: 1, offset: 1400 / 1800 },
      { transform: 'rotate(25deg)', opacity: 0 },
    ], { duration: 1800, easing: 'ease-in-out' });
    // Reveal the heading at the midpoint of the cone's sweep.
    run(title, [{ opacity: 0 }, { opacity: 1 }], { delay: 500, duration: 500, fill: 'backwards', easing: 'ease-in-out' });
  }
  if (observe) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting || entry.intersectionRatio < .35) return;
        observer.unobserve(entry.target);
        if (entry.target === number) count(); else play();
      });
    }, { threshold: .35 });
    if (number) observer.observe(number);
    if (!played && !motion.matches) observer.observe(title);
  }
  motion.addEventListener('change', () => {
    if (!motion.matches) return;
    cancelAnimationFrame(frame);
    if (number) number.textContent = finalNumber;
    program.classList.remove('beam-ready');
    animations.forEach(animation => animation.cancel());
  });
}
