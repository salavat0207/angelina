import content from './content.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const driftAmplitude = scale => Math.min(3, Math.max(0, (scale * 1000 - 240) / 30));

// Equal arc distances on one half, reflected exactly: 32 contour positions.
// Position zero is the bottom tip reserved for the visitor.
const SLOT_INDEX = 0;
function heartCurve(t) {
  return { x: 16 * Math.sin(t) ** 3,
    y: -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) };
}
function heartGeometry(viewBox) {
  const [left, top, width, height] = viewBox;
  const scale = width * .6 / 32;
  const samples = Array.from({ length: 4097 }, (_, i) => heartCurve(Math.PI * (1 - i / 4096)));
  const minY = Math.min(...samples.map(point => point.y));
  const maxY = Math.max(...samples.map(point => point.y));
  const centerY = (minY + maxY) / 2;
  const project = point => ({ x: left + width / 2 + point.x * scale, y: top + height / 2 + (point.y - centerY) * scale });
  const lengths = [0];
  for (let i = 1; i < samples.length; i++) lengths.push(lengths[i - 1] + Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y));
  const half = Array.from({ length: 17 }, (_, i) => {
    const distance = lengths.at(-1) * i / 16;
    let j = 1;
    while (j < lengths.length - 1 && lengths[j] < distance) j++;
    const fraction = (distance - lengths[j - 1]) / (lengths[j] - lengths[j - 1]);
    const before = samples[j - 1], after = samples[j];
    const x = before.x + (after.x - before.x) * fraction;
    const y = before.y + (after.y - before.y) * fraction;
    let tangent = Math.atan2(after.y - before.y, after.x - before.x) * 180 / Math.PI;
    tangent = ((tangent + 270) % 180) - 90;
    return { ...project({ x: i === 0 || i === 16 ? 0 : x, y }), angle: tangent };
  });
  half[0].angle = half[16].angle = 0;
  const points = [...half, ...half.slice(1, 16).reverse().map(point => ({ ...point, x: left + width - (point.x - left), angle: -point.angle }))];
  const contour = Array.from({ length: 513 }, (_, i) => project(heartCurve(Math.PI + i * Math.PI * 2 / 512)));
  const path = contour.map((point, i) => `${i ? 'L' : 'M'}${point.x.toFixed(3)} ${point.y.toFixed(3)}`).join(' ') + ' Z';
  return { points, path };
}
function svgNode(tag, attributes = {}) {
  const node = document.createElementNS(SVG_NS, tag);
  Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
}

// Rejection sampling is uniform inside the real outline, with repeatable spacing.
function scatteredGeometry(shape, scale, count) {
  const coords = shape.path.match(/-?\d*\.?\d+/g).map(Number);
  const polygon = Array.from({ length: coords.length / 2 }, (_, i) => ({ x: coords[i * 2], y: coords[i * 2 + 1] }));
  const inside = point => {
    let hit = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i], b = polygon[j];
      if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) hit = !hit;
    }
    return hit;
  };
  const edgeDistance = point => Math.min(...polygon.map((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
  }));
  let seed = 1892026;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const [left, top, width, height] = shape.viewBox;
  const points = [];
  // Even at opposing drift extrema the boats stay at least 18px apart.
  const separation = (18 + 2 * driftAmplitude(scale)) / scale;
  for (let attempt = 0; points.length < count && attempt < 100000; attempt++) {
    const point = { x: left + random() * width, y: top + random() * height, angle: (random() - .5) * 24 };
    if (inside(point) && points.every(other => Math.hypot(point.x - other.x, point.y - other.y) >= separation) && edgeDistance(point) >= 11 / scale) points.push(point);
  }
  if (points.length !== count) throw new Error('Fleet does not fit the map');
  return points;
}

export async function createFleet({ motion, getVisitorBoatPosition, onLaunch, onArrive }) {
  const section = document.querySelector('#final');
  const field = section.querySelector('.fleet-field');
  const map = section.querySelector('.fleet-map');
  const button = section.querySelector('#launch-boat');
  const save = section.querySelector('#save-postcard');
  const feedback = section.querySelector('.launch-feedback');
  const caption = section.querySelector('.fleet-caption');
  const animations = new Set();
  const fleet = [];
  let state = 'scattered';
  let geometry, shape, visitor, heartOutline;
  let scatter = [];
  let transfer;
  let currentScale = 0;
  const position = point => `translate(${point.x}px, ${point.y}px) rotate(${point.angle || 0}deg)`;
  function animate(node, frames, options) {
    if (motion.matches || !node.animate) return Promise.resolve();
    const animation = node.animate(frames, options);
    animations.add(animation);
    return animation.finished.catch(() => {}).finally(() => { animations.delete(animation); animation.cancel(); });
  }
  function stopDrift() {
    fleet.forEach(boat => { boat.drift?.cancel(); boat.drift = null; });
  }
  function drift() {
    stopDrift();
    if (motion.matches || state !== 'scattered') return;
    fleet.forEach(({ node, index }, i) => {
      if (!node.animate) return;
      const dx = driftAmplitude(currentScale) / currentScale;
      const dy = 0;
      const period = 4000 + (index * 977 % 3001);
      fleet[i].drift = node.animate([
        { transform: `translate(${-dx}px, ${dy}px)` },
        { transform: `translate(${dx}px, ${-dy}px)` },
        { transform: `translate(${-dx}px, ${dy}px)` },
      ], { duration: period, delay: -(index * 613 % period), iterations: Infinity, easing: 'ease-in-out' });
      if (document.hidden || !inView) fleet[i].drift.pause();
    });
  }
  let inView = !('IntersectionObserver' in window);
  function syncDrift() {
    fleet.forEach(({ drift: animation }) => {
      if (!animation) return;
      if (document.hidden || !inView) animation.pause(); else animation.play();
    });
  }
  function layout() {
    const matrix = map.getScreenCTM();
    if (!matrix || !geometry) return;
    const scale = Math.hypot(matrix.a, matrix.b);
    if (!scale) return;
    const style = getComputedStyle(field);
    const size = Number(style.getPropertyValue('--fleet-boat-size')) / scale;
    const viewerSize = Number(style.getPropertyValue('--viewer-boat-size')) / scale;
    if (state === 'scattered' && Math.abs(scale - currentScale) > .00001) {
      scatter = scatteredGeometry(shape, scale, fleet.length);
      fleet.forEach((boat, i) => { boat.anchor.style.transform = position(scatter[i]); });
      currentScale = scale;
      drift();
    }
    fleet.forEach(({ use }) => {
      use.setAttribute('x', -size / 2);
      use.setAttribute('y', -size * .375);
      use.setAttribute('width', size);
      use.setAttribute('height', size * .75);
    });
    const tip = geometry.points[SLOT_INDEX];
    visitor.setAttribute('x', tip.x - viewerSize / 2);
    visitor.setAttribute('y', tip.y - viewerSize * .375);
    visitor.setAttribute('width', viewerSize);
    visitor.setAttribute('height', viewerSize * .75);
  }
  try {
    const response = await fetch('assets/tatarstan.json');
    if (!response.ok) throw new Error('Map unavailable');
    shape = await response.json();
    geometry = heartGeometry(shape.viewBox);
    map.setAttribute('viewBox', shape.viewBox.join(' '));
    map.append(svgNode('path', { class: 'map-outline', d: shape.path }));
    heartOutline = svgNode('path', { class: 'heart-outline', d: geometry.path });
    map.append(heartOutline);
    geometry.points.forEach((point, index) => {
      if (index === SLOT_INDEX) return;
      const anchor = svgNode('g', { class: 'fleet-anchor' });
      const node = svgNode('g', { class: 'fleet-boat' });
      const use = svgNode('use', { href: '#boat' });
      node.append(use);
      anchor.append(node);
      map.append(anchor);
      fleet.push({ anchor, node, use, index });
    });
    visitor = svgNode('use', { href: '#boat', class: 'visitor-boat', visibility: 'hidden' });
    map.append(visitor);
    layout();
    field.setAttribute('aria-busy', 'false');
    button.disabled = false;
    if ('ResizeObserver' in window) new ResizeObserver(layout).observe(field);
    else window.addEventListener('resize', layout, { passive: true });
    if ('IntersectionObserver' in window) new IntersectionObserver(entries => {
      inView = entries.some(entry => entry.isIntersecting);
      syncDrift();
    }).observe(field);
    document.addEventListener('visibilitychange', syncDrift);
  } catch {
    stopDrift();
    field.setAttribute('aria-busy', 'false');
    feedback.classList.remove('sr-only');
    feedback.textContent = 'Не удалось загрузить карту. Обнови страницу, чтобы отпустить кораблик.';
    return;
  }
  async function lightWave() {
    const tip = geometry.points[SLOT_INDEX];
    await Promise.all(fleet.map(({ node, index }) => {
      const distance = Math.hypot(geometry.points[index].x - tip.x, geometry.points[index].y - tip.y);
      const delay = Math.min(130, distance / 4);
      return animate(node, [
        { '--fleet-paper': '#EEEAE0', '--fleet-fold': '#D9D3C5', '--fleet-shadow': '#B8B3A8' },
        { '--fleet-paper': '#f2bd6b', '--fleet-fold': '#f2bd6b', '--fleet-shadow': '#f2bd6b', offset: .45 },
        { '--fleet-paper': '#EEEAE0', '--fleet-fold': '#D9D3C5', '--fleet-shadow': '#B8B3A8' },
      ], { duration: 120, delay });
    }));
  }
  button.addEventListener('click', async () => {
    if (state !== 'scattered') return;
    layout();
    state = 'flying';
    button.disabled = true;
    onLaunch();
    const tip = geometry.points[SLOT_INDEX];
    const source = getVisitorBoatPosition();
    if (!motion.matches && source.width && map.getScreenCTM()) {
      const destination = new DOMPoint(tip.x, tip.y).matrixTransform(map.getScreenCTM());
      const startX = source.x + source.width / 2, startY = source.y + source.height / 2;
      const dx = destination.x - startX, dy = destination.y - startY;
      transfer = document.createElement('div');
      transfer.className = 'boat-transfer';
      transfer.setAttribute('aria-hidden', 'true');
      transfer.style.cssText = `left:${source.x}px;top:${source.y}px;width:${source.width}px;height:${source.height}px`;
      transfer.innerHTML = '<svg width="100%" height="100%" viewBox="0 0 64 48"><use href="#boat"></use></svg>';
      document.body.append(transfer);
      const frames = Array.from({ length: 33 }, (_, i) => {
        const t = i / 32, u = 1 - t;
        const x = 3 * u * u * t * dx * .12 + 3 * u * t * t * dx * .76 + t ** 3 * dx;
        const y = 3 * u * u * t * dy * .48 + 3 * u * t * t * dy * .88 + t ** 3 * dy;
        return { offset: t, transform: `translate(${x}px,${y}px) rotate(${-Math.sin(t * Math.PI) * 4}deg)` };
      });
      await animate(transfer, frames, { duration: 800, fill: 'forwards', easing: 'ease-in-out' });
      transfer.remove();
      transfer = null;
    }
    visitor.setAttribute('visibility', 'visible');
    onArrive();
    state = 'assembling';
    // Capture the current drift offset so gathering starts without a jump.
    const starts = fleet.map(({ node }, i) => {
      const matrix = new DOMMatrix(getComputedStyle(node).transform);
      return { ...scatter[i], x: scatter[i].x + matrix.e, y: scatter[i].y + matrix.f };
    });
    stopDrift();
    const order = [...fleet].sort((a, b) => geometry.points[b.index].y - geometry.points[a.index].y);
    await Promise.all(fleet.map((boat, i) => {
      const target = geometry.points[boat.index];
      boat.anchor.style.transform = position(target);
      // Sample the exact easeInOutCubic; only transform is animated.
      const frames = Array.from({ length: 41 }, (_, frame) => {
        const t = frame / 40;
        const p = t < .5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
        const start = starts[i];
        return { offset: t, transform: position({ x: start.x + (target.x - start.x) * p, y: start.y + (target.y - start.y) * p, angle: start.angle + (target.angle - start.angle) * p }) };
      });
      return animate(boat.anchor, frames, { duration: 600, delay: order.indexOf(boat) * 12, fill: 'backwards', easing: 'linear' });
    }));
    await lightWave();
    heartOutline.classList.add('is-visible');
    await animate(heartOutline, [{ opacity: 0 }, { opacity: 1 }], { duration: 250, easing: 'ease-in-out' });
    state = 'complete';
    caption.textContent = content.final.afterLaunch;
    section.classList.add('is-launched');
    section.querySelector('.postcard').hidden = false;
    save.hidden = false;
    button.hidden = true;
    map.querySelector('desc').textContent = '32 бумажных кораблика в сердце на карте Татарстана. Твой кораблик в нижнем острие.';
    feedback.textContent = content.final.afterLaunch;
    save.disabled = true;
    preparePostcard().catch(() => {}).finally(() => { save.disabled = false; });
  });

  let postcardBlob;
  let postcardFile;
  function preparePostcard() {
    postcardBlob ??= drawPostcard(shape, geometry).then(blob => {
      postcardFile = new File([blob], 'angelina-flot.png', { type: 'image/png' });
      return blob;
    }).catch(error => { postcardBlob = null; throw error; });
    // Pre-render for iOS so tapping Share retains the user activation.
    postcardBlob.catch(() => {});
    return postcardBlob;
  }
  save.addEventListener('click', async () => {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const canShareFiles = file => {
      try { return Boolean(navigator.canShare?.({ files: [file] })); } catch { return false; }
    };
    // Call Share, or reserve a fallback tab, in the original tap's activation.
    const shareFile = ios && postcardFile && canShareFiles(postcardFile);
    const tab = ios && !shareFile ? window.open('about:blank', '_blank') : null;
    if (tab) tab.opener = null;
    save.disabled = true;
    try {
      if (shareFile) {
        await navigator.share({ files: [postcardFile] });
      } else {
        const blob = postcardFile || await preparePostcard();
        const url = URL.createObjectURL(blob);
        if (ios) {
          if (tab) tab.location.replace(url);
          else window.open(url, '_blank', 'noopener');
        } else {
          const link = document.createElement('a');
          link.href = url;
          link.download = 'angelina-flot.png';
          document.body.append(link);
          link.click();
          link.remove();
        }
        window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
    } catch (error) {
      tab?.close();
      if (error.name !== 'AbortError') {
        feedback.classList.remove('sr-only');
        feedback.textContent = 'Не удалось сохранить открытку. Попробуй ещё раз.';
      }
    } finally { save.disabled = false; }
  });
  motion.addEventListener('change', () => {
    if (motion.matches) {
      stopDrift();
      animations.forEach(animation => animation.finish());
    } else drift();
  });
}

async function drawPostcard(shape, geometry) {
  await document.fonts.ready;
  await Promise.all([document.fonts.load('600 48px Manrope', 'Ангелина Немкова'), document.fonts.load('450 72px Manrope', content.final.motto)]);
  const portrait = new Image();
  portrait.src = 'assets/hero/hero-lit-600.webp';
  await portrait.decode();
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.fillStyle = '#071219';
  ctx.fillRect(0, 0, 1080, 1350);
  const [left, top, width, height] = shape.viewBox;
  const scale = 940 / width;
  ctx.save();
  ctx.translate(70 - left * scale, 90 - top * scale);
  ctx.scale(scale, scale);
  ctx.strokeStyle = 'rgba(238,234,224,.35)';
  ctx.lineWidth = 1.5 / scale;
  ctx.stroke(new Path2D(shape.path));
  ctx.strokeStyle = 'rgba(242,189,107,.3)';
  ctx.lineWidth = 1 / scale;
  ctx.stroke(new Path2D(geometry.path));
  geometry.points.forEach((point, i) => {
    ctx.save();
    ctx.translate(point.x, point.y);
    ctx.rotate(point.angle * Math.PI / 180);
    const size = i === SLOT_INDEX ? 32 : 24;
    ctx.scale(size / 64 / scale, size / 64 / scale);
    ctx.translate(-32, -24);
    ['M13 27 31.5 4V27Z', 'M32 4 51 27H32Z', 'M2 27 32 35 16 44Z', 'M32 35 62 27 48 44H16Z'].forEach((path, part) => {
      ctx.fillStyle = i === SLOT_INDEX ? ['#f2bd6b', '#e1a957', '#f2bd6b', '#bd873f'][part] : ['#EEEAE0', '#D9D3C5', '#EEEAE0', '#B8B3A8'][part];
      ctx.fill(new Path2D(path));
    });
    ctx.restore();
  });
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.arc(132, 860, 56, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#0b1a22';
  ctx.fillRect(76, 804, 112, 112);
  // Crop the existing portrait to the face, using its original 600×900 geometry.
  ctx.drawImage(portrait, 145, 100, 300, 300, 76, 804, 112, 112);
  ctx.restore();
  ctx.fillStyle = '#EEEAE0';
  ctx.font = '600 44px Manrope';
  ctx.fillText(`${content.person.name} ${content.person.surname}`, 218, 878);
  ctx.font = '450 72px Manrope';
  const words = content.final.motto.split(' ');
  let line = '', y = 1025;
  words.forEach(word => {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > 920 && line) {
      ctx.fillText(line, 76, y);
      y += 86;
      line = word;
    } else line = next;
  });
  if (line) ctx.fillText(line, 76, y);
  ctx.fillStyle = 'rgba(238,234,224,.68)';
  ctx.font = '450 27px Manrope';
  ctx.fillText('t.me/clockve', 76, 1260);
  ctx.font = '450 16px Manrope';
  ctx.fillText('© OpenStreetMap contributors', 76, 1305);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG unavailable')), 'image/png'));
}
