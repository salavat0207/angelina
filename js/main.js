import content from './content.js';
import { createSea } from './sea.js';
import { directHero } from './hero.js';
import { createFleet } from './fleet.js';
import { setupChapterEffects } from './effects.js';

const HIDE_TODO = true;
const EASE = 'cubic-bezier(.22,1,.36,1)';
const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
// Crops for the graded route previews; originals stay intact in the gallery.
const PHOTO_POS = { 6: '50% 50%', 10: '50% 42%', 14: '50% 22%', 15: '50% 50%', 18: '50% 45%', 33: '50% 30%', 47: '50% 30%', 48: '50% 50%', 49: '50% 50%', 50: '50% 50%', 51: '50% 50%' };
const COLLAGES = new Set([6, 15, 48, 49, 50, 51]);
const photoLabel = count => count === 1 ? 'Открыть фото' : `Все ${count} фото`;
const galleries = new Map();
const isTodo = value => value && typeof value === 'object' && 'todo' in value;
const hasContent = value => {
  if (value == null || (HIDE_TODO && isTodo(value))) return false;
  if (Array.isArray(value)) return value.some(hasContent);
  return typeof value === 'string' ? value.trim().length > 0 : false;
};
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// Keep short Russian words with the next word, including consecutive prepositions.
const typography = value => escapeHTML(value).replace(/(^|(?<=[\s«(]))(в|на|с|и|к|о|у|по|за|из|от|до|не)\s+(?=\S)/giu, '$1$2\u00a0');
const text = (value, tag = 'p', className = '') => hasContent(value) ? `<${tag}${className ? ` class="${className}"` : ''}>${typography(value)}</${tag}>` : '';
function paragraphs(value) {
  if (Array.isArray(value)) return value.filter(hasContent).map(v => text(v)).join('');
  return hasContent(value) ? value.split(/\n\s*\n/).map(v => text(v)).join('') : '';
}
function heading(title, id, label = '') {
  return `<div class="chapter-heading">${text(label, 'p', 'micro')}<h2 id="${id}">${typography(title)}</h2></div>`;
}
function disclosureHTML(label, body, id, className = '') {
  if (!body) return '';
  return `<details class="disclosure${className ? ` ${className}` : ''}"><summary aria-expanded="false" aria-controls="${id}">${typography(label)}</summary><div class="disclosure-panel" id="${id}"><div class="disclosure-inner">${body}</div></div></details>`;
}
function disclosure(label, values, id, className = '') {
  return disclosureHTML(label, values.map(paragraphs).join(''), id, className);
}
function pointList(points) {
  const items = (points || []).filter(hasContent);
  return items.length ? `<ul class="idea-points">${items.map(point => text(point, 'li')).join('')}</ul>` : '';
}
function renderFullProgram(full) {
  const items = (full.items || []).filter(item => [item.title, item.essence, item.points, item.meaning].some(hasContent));
  const body = items.map(item => `<article class="full-program-item">
    ${text(item.title, 'h3')}
    ${hasContent(item.essence) ? `<div class="program-explanation"><h4 class="micro">Суть</h4>${text(item.essence)}</div>` : ''}
    ${pointList(item.points)}
    ${hasContent(item.meaning) ? `<div class="program-explanation"><h4 class="micro">Смысл</h4>${text(item.meaning)}</div>` : ''}
  </article>`).join('');
  return disclosureHTML(full.title, body, 'full-program', 'full-program');
}
function renderFirstProject(project) {
  if (!project || !hasContent(project.paragraphs)) return '';
  return disclosureHTML(project.title, paragraphs(project.paragraphs), 'first-project-story', 'first-project');
}
function photo(id, title, full = false, sizes = full ? '90vw' : '(min-width:1024px) 520px, calc(100vw - 76px)') {
  const info = content.photos[id];
  const widths = full ? info.widths : info.widths.filter(w => w <= 960);
  const prefix = `assets/img/${full ? '' : 'g/'}p${String(id).padStart(2, '0')}`;
  return `<img class="${full ? 'original-photo' : 'cover-photo'}${COLLAGES.has(id) ? ' is-collage' : ''}" style="object-position:${PHOTO_POS[id] || '50% 30%'}" src="${prefix}-${widths.at(-1)}.webp" srcset="${widths.map(w => `${prefix}-${w}.webp ${w}w`).join(', ')}" sizes="${sizes}" width="${info.w}" height="${info.h}" alt="${escapeHTML(title)}" loading="${full ? 'eager' : 'lazy'}" decoding="async">`;
}
function gallery(ids, title, key) {
  const valid = (ids || []).filter(id => content.photos[id]);
  if (!valid.length) return '';
  galleries.set(key, { ids: valid, title });
  return `<div class="stop-gallery"><button class="photo-button" type="button" data-gallery="${key}" aria-label="${escapeHTML(title)}. Открыть фото 1 из ${valid.length}">${photo(valid[0], title)}</button>${valid.length > 1 ? `<button class="more-photos" type="button" data-gallery="${key}">${photoLabel(valid.length)}</button>` : ''}</div>`;
}
function registerGallery(entry, key) {
  const ids = (entry.photos || []).filter(id => content.photos[id]);
  if (ids.length) galleries.set(key, { ids, title: entry.title });
  return ids;
}
function renderJournal(journal) {
  const entries = journal.entries.filter(entry => hasContent(entry.title) || hasContent(entry.text) || entry.photos?.length);
  const more = journal.more.filter(entry => entry.photos?.some(id => content.photos[id]));
  const personalIds = registerGallery(journal.personal, 'personal');
  const entryHTML = (entry, i) => {
    const ids = registerGallery(entry, `journal-${i}`);
    const cover = ids.includes(entry.cover) ? entry.cover : ids[0];
    return `<article class="journal-entry${i === 0 ? ' is-open' : ''}">
      <button class="journal-toggle" type="button" aria-expanded="${i === 0}" aria-controls="journal-panel-${i}"><span>${typography(entry.title)}</span><span class="journal-arrow" aria-hidden="true">${i === 0 ? '−' : '+'}</span></button>
      <div class="journal-panel" id="journal-panel-${i}"${i === 0 ? '' : ' hidden inert'}><div class="journal-story">
        ${entry.video ? videoHTML(entry.video, entry.title, 'journal-film') : ''}${cover ? `<button class="photo-button is-lit" type="button" data-gallery="journal-${i}" data-photo-index="${ids.indexOf(cover)}" aria-label="${escapeHTML(entry.title)}. Открыть фотографии">${photo(cover, entry.title)}</button>` : ''}
        <div class="journal-copy">${text(entry.date, 'p', 'journal-date')}${text(entry.lead, 'p', 'journal-lead')}${paragraphs(entry.text)}</div>
        ${text(entry.result, 'p', 'journal-result')}
        ${entry.stories?.length ? disclosureHTML('Три истории', `<ol class="journal-stories">${entry.stories.map(story => text(story, 'li')).join('')}</ol>`, `journal-stories-${i}`, 'stories-disclosure') : ''}
        ${ids.length ? `<button class="more-photos" type="button" data-gallery="journal-${i}">${photoLabel(ids.length)}</button>` : ''}
      </div></div></article>`;
  };
  const archive = entries.slice(1).map((entry, i) => entryHTML(entry, i + 1)).join('') + more.map((entry, i) => {
    const ids = registerGallery(entry, `more-${i}`);
    return `<article class="more-entry"><h3>${typography(entry.title)}</h3><div class="more-thumbnails">${ids.slice(0, 3).map((id, index) => `<button type="button" data-gallery="more-${i}" data-photo-index="${index}" aria-label="${escapeHTML(entry.title)}. Фото ${index + 1} из ${ids.length}">${photo(id, entry.title, false, '64px')}</button>`).join('')}</div></article>`;
  }).join('') + (personalIds.length ? disclosureHTML(journal.personal.title, `<figure class="personal-photo"><button class="photo-button" type="button" data-gallery="personal" aria-label="${escapeHTML(journal.personal.title)}. Открыть фотографии">${photo(personalIds[0], journal.personal.title)}</button></figure>`, 'personal-gallery') : '');
  return `<section class="section journal-section" id="journal" aria-labelledby="journal-title"><div class="shell">
    ${heading(journal.title, 'journal-title')}${text(journal.motto, 'p', 'journal-motto')}
    <div class="journal-entries">${entryHTML(entries[0], 0)}</div>
    ${disclosureHTML('Ещё из журнала', archive, 'journal-archive', 'journal-more')}
  </div></section>`;
}
function videoHTML(clip, label, className = '') {
  if (!hasContent(clip?.src)) return '';
  return `<figure class="film ${className}"><div class="video-frame">
    <video data-src="${escapeHTML(clip.src)}" poster="${escapeHTML(clip.poster)}" width="300" height="533" preload="none" playsinline muted aria-label="${escapeHTML(label)}"></video>
    <button class="video-play" type="button" aria-label="Смотреть ${escapeHTML(label)}, ${escapeHTML(clip.duration)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4 21 12 8 20Z"/></svg></button>
    <span class="video-duration">${escapeHTML(clip.duration)}</span>
    <button class="video-sound" type="button" hidden aria-pressed="false" aria-label="Включить звук">Звук</button>
    </div>${text(clip.caption, 'figcaption')}<p class="video-status" role="status" hidden>Видео не загрузилось. <a href="${escapeHTML(clip.src)}" target="_blank" rel="noopener noreferrer">Открыть в отдельной вкладке ↗</a></p></figure>`;
}
function renderPeople(people) {
  const thanks = people.thanks.filter(hasContent);
  const reviews = people.reviews.filter(review => !isTodo(review) && hasContent(review.text));
  return `<section class="section people-section" id="people" aria-labelledby="people-title"><div class="shell">
    ${heading(people.title, 'people-title')}
    <div class="people-story">${videoHTML(people.video, people.title, 'people-film')}
      <div class="thanks-copy">${text(thanks[0], 'p', 'thanks-lead')}${disclosureHTML('Читать полностью', paragraphs(thanks.slice(1)) + videoHTML(people.thanksVideo, 'Благодарность', 'thanks-film'), 'thanks-full')}</div>
    </div>
    ${reviews.length ? `<div class="reviews">${reviews.map(review => `<figure><blockquote>${typography(review.text)}</blockquote><figcaption>${[review.name, review.role].filter(hasContent).map(typography).join(' · ')}</figcaption></figure>`).join('')}</div>` : ''}
  </div></section>`;
}
function renderProof(proof) {
  if (!proof || !content.photos[proof.photo]) return '';
  galleries.set('proof', { ids: [proof.photo], title: proof.label });
  return `<section class="section proof-section" id="proof" aria-labelledby="proof-label"><div class="shell proof-layout">
    <button class="photo-button proof-photo" type="button" data-gallery="proof" aria-label="${escapeHTML(proof.label)}. Открыть фото">${photo(proof.photo, proof.label, true, '(min-width:1024px) 420px, calc(100vw - 48px)')}</button>
    <div class="proof-copy"><h2 id="proof-label" class="micro proof-label">${typography(proof.label)}</h2><p class="proof-number" aria-label="${escapeHTML(proof.number)} ${escapeHTML(proof.numberCaption)}"><span aria-hidden="true">${escapeHTML(proof.number)}</span></p>${text(proof.numberCaption, 'p', 'proof-caption')}
    <figure class="proof-quote">${text(proof.text, 'blockquote')}<figcaption class="micro">— ${typography(content.person.name)}</figcaption></figure></div>
  </div></section>`;
}
function renderRoute(route) {
  const major = [0, 2, 8];
  const stops = route.stops;
  const minor = stops.map((stop, i) => major.includes(i) ? '' : `<details class="route-stop route-minor disclosure"><summary aria-expanded="false" aria-controls="route-panel-${i}"><span class="stop-dot" aria-hidden="true"></span><h3>${typography(stop.title)}</h3></summary><div class="disclosure-panel" id="route-panel-${i}"><div class="disclosure-inner">${text(stop.text)}${gallery(stop.photos, stop.title, `route-${i}`)}</div></div></details>`).join('');
  return `<section class="section route-section" id="route" aria-labelledby="route-title"><div class="shell">
    ${heading(route.title, 'route-title')}${text(route.period, 'p', 'micro route-period')}
    <div class="route-body">${major.map(i => {
      const stop = stops[i];
      const photos = gallery(stop.photos, stop.title, `route-${i}`);
      return `<article class="route-stop route-major"><span class="stop-number">${String(i + 1).padStart(2, '0')}</span><div class="stop-copy"><h3>${typography(stop.title)}</h3>${text(stop.text)}</div>${photos}</article>`;
    }).join('')}
    ${disclosureHTML('Другие события маршрута', minor + renderFirstProject(route.firstProject), 'route-other', 'route-other')}</div>
  </div></section>`;
}
function render() {
  const { hero, proof, problem, program, route, journal, people, final } = content;
  document.querySelector('#sections').innerHTML = `
    <section class="section ideas-section" id="ideas" aria-labelledby="ideas-title"><div class="shell">
      <p class="micro">Три идеи</p><h2 id="ideas-title">Что я предлагаю</h2>
      <ol class="ideas-list">${program.ideas.map(idea => `<li><a class="idea-link" href="#idea-${idea.n}"><span class="idea-link-marker" aria-hidden="true">${String(idea.n).padStart(2, '0')}</span><div><h3>${typography(idea.title)}</h3>${text(idea.result)}</div></a></li>`).join('')}</ol>
    </div></section>
    ${renderProof(proof)}
    ${renderRoute(route)}
    <section class="section program-section" id="program" aria-labelledby="program-title"><div class="program-beacon" aria-hidden="true"><span class="program-beam"></span></div><div class="shell">
      ${heading(program.title, 'program-title')}
      <div class="program-body">
        ${text(problem.split(' — ')[0], 'p', 'program-problem')}
        ${program.ideas.map(idea => `<article class="idea" id="idea-${idea.n}" aria-labelledby="idea-title-${idea.n}"><div class="idea-marker" aria-hidden="true"><span>${String(idea.n).padStart(2, '0')}</span></div><div class="idea-content"><h3 id="idea-title-${idea.n}">${typography(idea.title)}</h3>${text(idea.result, 'p', 'idea-result')}${disclosureHTML('Подробнее', pointList(idea.points) + text(idea.quote, 'blockquote', 'idea-quote'), `idea-details-${idea.n}`, 'idea-details')}</div></article>`).join('')}
        <aside class="program-principle">${text(program.principle.title, 'h3')}${pointList(program.principle.points)}</aside>
        ${renderFullProgram(program.full)}
        ${disclosureHTML('Мой ориентир', text(hero.phrase, 'blockquote', 'hero-phrase'), 'hero-phrase')}
      </div>
    </div></section>
    ${renderJournal(journal)}
    ${renderPeople(people)}
    <section class="section final-section" id="final" aria-labelledby="final-title"><div class="shell">
      ${heading('Одному кораблику нужен флот', 'final-title')}${text(final.title, 'p', 'final-subtitle')}
      <div class="final-layout"><div class="final-map-panel">
        <div class="fleet-field" aria-busy="true">
          <svg class="fleet-map" role="img" aria-labelledby="fleet-map-title fleet-map-description"><title id="fleet-map-title">Бумажный флот на карте Татарстана</title><desc id="fleet-map-description">Кораблики рассеяны по Татарстану. Запусти свой кораблик, чтобы собрать сердце.</desc></svg>
          <span class="map-credit">© OpenStreetMap contributors</span>
        </div>
        <p class="fleet-caption" aria-live="polite">Один кораблик — это ещё не флот</p>
      </div><div class="final-controls">
        <div class="postcard" hidden><div class="postcard-person"><img src="assets/hero/hero-lit-600.webp" width="48" height="48" alt="" loading="lazy"><p>${typography(`${content.person.name} ${content.person.surname}`)}</p></div>${text(final.motto, 'p', 'postcard-motto')}</div>
        <div class="launch-action"><button class="paper-button" id="launch-boat" type="button" disabled>${typography(final.button)}</button><button class="paper-button" id="save-postcard" type="button" hidden>Сохранить открытку</button>${text(final.note, 'p', 'launch-note')}</div>
        <a class="telegram-link" data-telegram href="${escapeHTML(content.person.telegram)}" target="_blank" rel="noopener noreferrer">${typography(content.person.telegramLabel)} ↗</a>
      </div></div>
      <p class="launch-feedback sr-only" role="status" aria-live="polite" aria-atomic="true"></p>
      <footer class="site-footer"><p>${typography(`${content.person.name} ${content.person.surname}`)}</p><a href="#home">К началу ↑</a></footer>
    </div></section>`;
  document.querySelectorAll('[data-telegram]').forEach(a => { a.href = content.person.telegram; });
}

render();
setupChapterEffects(motion);

// Keep one journal story open; interruptions reverse from the actual panel height.
const journalEntries = [...document.querySelectorAll('.journal-entry')];
function setJournalOpen(entry, open) {
  const button = entry.querySelector('.journal-toggle');
  const panel = entry.querySelector('.journal-panel');
  const from = panel.hidden ? 0 : panel.getBoundingClientRect().height;
  panel.getAnimations().forEach(animation => animation.cancel());
  panel.hidden = false;
  panel.inert = !open;
  entry.classList.toggle('is-open', open);
  button.setAttribute('aria-expanded', String(open));
  button.querySelector('.journal-arrow').textContent = open ? '−' : '+';
  const finish = () => { panel.hidden = !open; measure(); };
  if (motion.matches || !panel.animate) { finish(); return; }
  const animation = panel.animate([{ height: `${from}px` }, { height: `${open ? panel.scrollHeight : 0}px` }], { duration: 220, easing: EASE });
  animation.onfinish = () => { finish(); animation.cancel(); };
}
journalEntries.forEach(entry => entry.querySelector('.journal-toggle').addEventListener('click', () => {
  const open = !entry.classList.contains('is-open');
  journalEntries.filter(other => other !== entry && other.classList.contains('is-open')).forEach(other => setJournalOpen(other, false));
  setJournalOpen(entry, open);
}));

document.querySelectorAll('.film').forEach(film => {
  const video = film.querySelector('video');
  const play = film.querySelector('.video-play');
  const sound = film.querySelector('.video-sound');
  const duration = film.querySelector('.video-duration');
  const status = film.querySelector('.video-status');
  function failed() {
    status.hidden = false;
    play.hidden = false;
    sound.hidden = true;
    duration.hidden = false;
    video.controls = false;
  }
  video.addEventListener('error', failed);
  play.addEventListener('click', async () => {
    play.disabled = true;
    video.muted = true;
    sound.setAttribute('aria-pressed', 'false');
    sound.setAttribute('aria-label', 'Включить звук');
    sound.textContent = 'Звук';
    if (!video.hasAttribute('src')) video.src = video.dataset.src;
    video.controls = true;
    status.hidden = true;
    try {
      const started = video.play();
      play.hidden = true;
      duration.hidden = true;
      sound.hidden = false;
      await started;
    } catch { failed(); }
    finally { play.disabled = false; }
  });
  sound.addEventListener('click', () => {
    video.muted = !video.muted;
    sound.setAttribute('aria-pressed', String(!video.muted));
    sound.setAttribute('aria-label', video.muted ? 'Включить звук' : 'Выключить звук');
    sound.textContent = video.muted ? 'Звук' : 'Без звука';
  });
});

// Native details preserve semantics and keyboard use; cancel/reverse from current height.
document.querySelectorAll('.disclosure').forEach(details => {
  const summary = details.querySelector('summary');
  const panel = details.querySelector('.disclosure-panel');
  let animation;
  let targetOpen = false;
  summary.addEventListener('click', event => {
    if (motion.matches || !panel.animate) return;
    event.preventDefault();
    const from = details.open ? panel.getBoundingClientRect().height : 0;
    targetOpen = animation ? !targetOpen : !details.open;
    animation?.cancel();
    details.open = true;
    summary.setAttribute('aria-expanded', String(targetOpen));
    animation = panel.animate([{ height: `${from}px` }, { height: `${targetOpen ? panel.scrollHeight : 0}px` }], { duration: 220, easing: EASE });
    animation.onfinish = () => {
      details.open = targetOpen;
      animation = null;
      panel.getAnimations().forEach(active => active.cancel());
      measure();
    };
  });
  details.addEventListener('toggle', () => {
    if (!animation) summary.setAttribute('aria-expanded', String(details.open));
    measure();
  });
});

const lightbox = document.querySelector('.lightbox');
const lightboxImage = lightbox.querySelector('.lightbox-image');
let activeGallery;
let photoIndex = 0;
let returnFocus;
let pointerStart;
let photoRequest = 0;
function showPhoto(index) {
  const request = ++photoRequest;
  photoIndex = (index + activeGallery.ids.length) % activeGallery.ids.length;
  const id = activeGallery.ids[photoIndex];
  lightboxImage.innerHTML = photo(id, activeGallery.title, false, '100vw');
  const preview = lightboxImage.querySelector('img');
  preview.className = 'lightbox-preview';
  preview.loading = 'eager';
  const original = document.createElement('div');
  original.innerHTML = photo(id, activeGallery.title, true);
  const img = original.firstElementChild;
  img.hidden = true;
  const loaded = () => {
    if (request !== photoRequest || !img.isConnected) return;
    img.hidden = false;
    preview.remove();
  };
  img.addEventListener('load', loaded, { once: true });
  img.addEventListener('error', () => img.remove(), { once: true });
  lightboxImage.append(img);
  if (img.complete && img.naturalWidth) loaded();
  lightbox.querySelector('.lightbox-count').textContent = `${photoIndex + 1} / ${activeGallery.ids.length}`;
  lightbox.querySelector('.lightbox-caption').textContent = activeGallery.title;
  lightbox.querySelectorAll('.lightbox-prev,.lightbox-next').forEach(button => { button.hidden = activeGallery.ids.length < 2; });
}
document.addEventListener('click', event => {
  const trigger = event.target.closest('[data-gallery]');
  if (!trigger) return;
  activeGallery = galleries.get(trigger.dataset.gallery);
  if (!activeGallery) return;
  returnFocus = trigger;
  showPhoto(Number(trigger.dataset.photoIndex) || 0);
  document.body.classList.add('is-locked');
  lightbox.showModal();
});
lightbox.querySelector('.lightbox-close').addEventListener('click', () => lightbox.close());
lightbox.querySelector('.lightbox-prev').addEventListener('click', () => showPhoto(photoIndex - 1));
lightbox.querySelector('.lightbox-next').addEventListener('click', () => showPhoto(photoIndex + 1));
lightbox.addEventListener('close', () => {
  document.body.classList.remove('is-locked');
  ++photoRequest;
  lightboxImage.innerHTML = '';
  returnFocus?.focus({ preventScroll: true });
});
lightbox.addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    showPhoto(photoIndex + (event.key === 'ArrowLeft' ? -1 : 1));
  }
  if (event.key === 'Tab') {
    const buttons = [...lightbox.querySelectorAll('button:not([hidden])')];
    const first = buttons[0], last = buttons.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});
const swipeSurface = lightbox.querySelector('.lightbox-stage');
swipeSurface.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.target.closest('button')) return;
  pointerStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
  swipeSurface.setPointerCapture(event.pointerId);
});
swipeSurface.addEventListener('pointerup', event => {
  if (!pointerStart || pointerStart.id !== event.pointerId) return;
  const x = event.clientX - pointerStart.x;
  const y = event.clientY - pointerStart.y;
  pointerStart = null;
  if (Math.abs(x) > 45 && Math.abs(x) > Math.abs(y) * 1.15) showPhoto(photoIndex + (x < 0 ? 1 : -1));
});
swipeSurface.addEventListener('pointercancel', () => { pointerStart = null; });

const sea = createSea(document.querySelector('#sea'));
const waterline = document.querySelector('.waterline');
const vessel = document.querySelector('.visitor-vessel');
let boatReady = false;
let boatLaunched = false;
function revealBoat() {
  if (boatReady) return;
  boatReady = true;
  waterline.classList.add('is-visible');
  if (window.scrollY < 20 && !location.hash && !motion.matches) waterline.classList.add('show-tooltip');
  window.setTimeout(() => waterline.classList.remove('show-tooltip'), 1800);
}
const heroScene = directHero(document.querySelector('.hero'), sea, motion, revealBoat);
let positions = {};
let scrollFrame = 0;
let measureFrame = 0;
let tiltFrame = 0;
let tiltStarted = 0;
let initialTilt = 0;
let lastY = window.scrollY;
let lastScrollTime = performance.now();
let boatX = 24;
let boatY = 0;
let boatTrack = { start: 24, travel: 0, left: 0 };
const clamp = (x, min = 0, max = 1) => Math.max(min, Math.min(max, x));
function settleTilt(now) {
  tiltFrame = 0;
  const remaining = 1 - clamp((now - tiltStarted) / 600);
  waterline.style.setProperty('--boat-tilt', `${initialTilt * remaining ** 3}deg`);
  if (remaining > 0) tiltFrame = requestAnimationFrame(settleTilt);
}
function measure() {
  if (measureFrame) return;
  measureFrame = requestAnimationFrame(() => {
    measureFrame = 0;
    const y = window.scrollY;
    ['home', 'program', 'final'].forEach(id => {
      const rect = document.getElementById(id).getBoundingClientRect();
      positions[id] = { top: rect.top + y, bottom: rect.bottom + y, height: rect.height };
    });
    const rect = vessel.getBoundingClientRect();
    boatY = rect.top;
    const rule = waterline.querySelector('.waterline-rule');
    boatTrack = { start: rule.offsetLeft, travel: Math.max(0, rule.offsetWidth - vessel.offsetWidth), left: waterline.offsetLeft };
    scheduleScroll();
  });
}
function updateScroll() {
  scrollFrame = 0;
  if (!positions.final) return;
  const y = window.scrollY;
  const now = performance.now();
  const progress = clamp(y / Math.max(1, positions.final.top - window.innerHeight));
  // The desktop rule occupies only the lower-right corner; use its local span.
  boatX = boatTrack.start + progress * boatTrack.travel;
  vessel.style.transform = `translateX(${boatX}px)`;
  waterline.classList.toggle('tooltip-right', boatTrack.left + boatX > window.innerWidth - 160);
  waterline.classList.toggle('is-visible', boatReady && !boatLaunched && !motion.matches);
  if (boatLaunched || y > 20) waterline.classList.remove('show-tooltip');
  if (y !== lastY) {
    heroScene.finish();
    if (!motion.matches) {
      initialTilt = clamp((y - lastY) / Math.max(16, now - lastScrollTime) * .55, -2, 2);
      tiltStarted = now;
      cancelAnimationFrame(tiltFrame);
      tiltFrame = requestAnimationFrame(settleTilt);
    }
    lastY = y;
    lastScrollTime = now;
  }
  sea.setPaused(y >= Math.max(20, positions.home.bottom - window.innerHeight));
  const dawn = .6 * clamp((y + window.innerHeight - positions.final.top) / Math.min(800, positions.final.height));
  sea.update(0, dawn, clamp(y / positions.home.height));
}
function scheduleScroll() {
  if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScroll);
}
// Viewport coordinates for the fixed-to-SVG handoff in the finale.
export function getVisitorBoatPosition() {
  const rect = vessel.getBoundingClientRect();
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height, visible: !motion.matches && waterline.classList.contains('is-visible') && !waterline.classList.contains('has-launched'), progress: positions.final ? clamp(window.scrollY / Math.max(1, positions.final.top - window.innerHeight)) : 0 };
}
window.addEventListener('boat:request-position', () => {
  window.dispatchEvent(new CustomEvent('boat:position', { detail: getVisitorBoatPosition() }));
});
window.addEventListener('scroll', scheduleScroll, { passive: true });
window.addEventListener('resize', measure, { passive: true });
window.addEventListener('pageshow', measure);
motion.addEventListener('change', () => {
  if (motion.matches) {
    cancelAnimationFrame(tiltFrame);
    waterline.style.setProperty('--boat-tilt', '0deg');
  }
  scheduleScroll();
});
if ('ResizeObserver' in window) {
  const observer = new ResizeObserver(measure);
  observer.observe(document.querySelector('#sections'));
  observer.observe(document.querySelector('.hero'));
}
document.fonts.ready.then(measure);
measure();
createFleet({ motion, easing: EASE, getVisitorBoatPosition, onLaunch() {
  waterline.classList.add('has-launched');
  waterline.classList.remove('show-tooltip');
}, onArrive() {
  boatLaunched = true;
  waterline.classList.remove('is-visible');
} });

// The destination may be populated by the content renderer after the native hash jump.
let smoothFrame = 0;
let destination;
function cancelScroll() { cancelAnimationFrame(smoothFrame); smoothFrame = 0; destination = null; }
function easeOut(x) {
  let low = 0, high = 1;
  for (let i = 0; i < 12; i++) {
    const t = (low + high) / 2;
    const bx = 3 * (1 - t) ** 2 * t * .22 + 3 * (1 - t) * t ** 2 * .36 + t ** 3;
    if (bx < x) low = t; else high = t;
  }
  return 1 - (1 - (low + high) / 2) ** 3;
}
function moveTo(target, animate = true) {
  cancelScroll();
  if (target.matches('.idea')) {
    const details = target.querySelector('details');
    details.open = true;
    details.querySelector('summary').setAttribute('aria-expanded', 'true');
  }
  heroScene.finish();
  const start = window.scrollY;
  const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
  const end = target.getBoundingClientRect().top + start - margin;
  if (motion.matches || !animate) { window.scrollTo(0, end); focusTarget(target); return; }
  destination = target;
  const started = performance.now();
  function step(now) {
    const p = clamp((now - started) / 350);
    window.scrollTo(0, start + (end - start) * easeOut(p));
    if (p < 1) smoothFrame = requestAnimationFrame(step);
    else { smoothFrame = 0; focusTarget(destination); destination = null; }
  }
  smoothFrame = requestAnimationFrame(step);
}
function focusTarget(target) {
  if (!target) return;
  if (!target.hasAttribute('tabindex')) {
    target.setAttribute('tabindex', '-1');
    target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true });
  }
  target.focus({ preventScroll: true });
}
document.addEventListener('click', event => {
  const link = event.target.closest('a[href^="#"]');
  if (!link || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const target = document.getElementById(link.hash.slice(1));
  if (!target) return;
  event.preventDefault();
  history.pushState(null, '', link.hash);
  moveTo(target);
});
['wheel', 'touchstart', 'pointerdown'].forEach(name => window.addEventListener(name, cancelScroll, { passive: true }));
window.addEventListener('keydown', event => {
  if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) cancelScroll();
});
window.addEventListener('popstate', () => {
  const target = document.getElementById(location.hash.slice(1) || 'home');
  if (target) moveTo(target, false);
});
if (location.hash) requestAnimationFrame(() => {
  const target = document.getElementById(location.hash.slice(1));
  if (target) moveTo(target, false);
});
