// A single WebGL1 surface; CSS remains the complete, immediate fallback.
const vertexSource = `
attribute vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }
`;
const fragmentSource = `
precision mediump float;
uniform vec2 uResolution;
uniform vec2 uViewport;
uniform vec2 uLightPx;
uniform float uHorizon;
uniform float uTime;
uniform float uLantern;
uniform float uBeamAngle;
uniform float uBeamAlpha;
uniform float uStorm;
uniform float uDawn;
uniform float uScroll;
float hash(vec2 p) {
  p = fract(p * vec2(.1031, .1137));
  p += dot(p, p.yx + vec2(1.23, 2.34));
  return fract(p.x * p.y * .37);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), f.x), f.y);
}
float waves(vec2 p) {
  float n = noise(p) * .53;
  p = p * 2.03 + vec2(19.1, 7.7);
  n += noise(p) * .27;
  p = p * 2.01 + vec2(9.2, 21.3);
  n += noise(p) * .13;
  n += noise(p * 2.02) * .07;
  return n;
}
void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  uv.y = 1.0 - uv.y;
  vec2 px = uv * uViewport;
  float shift = uScroll * uViewport.y * .45;
  float horizon = clamp((uHorizon - shift) / uViewport.y, .06, .95);
  vec2 light = uLightPx - vec2(0.0, shift);
  vec2 ray = px - light;
  vec2 direction = vec2(cos(uBeamAngle), sin(uBeamAngle));
  float along = dot(ray, direction);
  float angularDistance = abs(ray.x * direction.y - ray.y * direction.x) / max(length(ray), 1.0);
  float cone = (1.0 - smoothstep(.018, .095, angularDistance)) * smoothstep(0.0, 20.0, along);
  cone *= exp(-length(ray) / 850.0) * uBeamAlpha;
  vec3 deep = vec3(.02745, .07059, .09804);
  vec3 water = vec3(.06275, .14902, .18824);
  vec3 warm = vec3(.77255, .66667, .47059);
  float skyDepth = clamp(uv.y / horizon, 0.0, 1.0);
  vec3 color = mix(deep, vec3(.048, .102, .140), pow(skyDepth, 2.8));
  // Stationary, sparse stars. Cell coordinates stay small for mediump GPUs.
  vec2 cell = floor(px / 64.0);
  float seed = hash(cell);
  vec2 star = vec2(hash(cell + 3.2), hash(cell + 11.7)) * 50.0 + 7.0;
  float starDot = 1.0 - smoothstep(.25, 1.05, length(mod(px, 64.0) - star));
  color += vec3(.38, .46, .50) * starDot * step(.973, seed) * (1.0 - skyDepth) * .35;
  color += warm * cone * .055 * uLantern;
  color += warm * exp(-abs(uv.y - horizon) * 19.0) * uDawn * .09;
  if (uv.y > horizon) {
    float depth = (uv.y - horizon) / max(1.0 - horizon, .05);
    float perspective = 1.0 / (.075 + depth);
    float time = uTime * (.035 + .025 * uStorm);
    vec2 seaPoint = vec2((uv.x - .5) * perspective * 5.0,
                        perspective * 3.5);
    // High vertical frequency produces long, broken horizontal crests.
    vec2 flow = vec2(seaPoint.x * 1.15, seaPoint.y * 1.9);
    flow *= 1.0 - uStorm * .32;
    float wave = waves(flow + vec2(time, -time * .7));
    float crest = smoothstep(.53, .79, wave);
    float fresnel = pow(1.0 - depth, 3.0);
    color = mix(deep, water, .28 + .65 * fresnel);
    color += vec3(.075, .12, .14) * crest * (.112 + fresnel * .224);
    float spread = .006 + depth * .16;
    float path = exp(-pow((uv.x - light.x / uViewport.x) / spread, 2.0));
    float broken = smoothstep(.53, .73, wave) * (.35 + .65 * noise(flow * vec2(.7, 3.2)));
    color += warm * path * broken * (.175 + depth * .07) * uLantern;
    // Mirror the beam across the water plane: its moving footprint catches crests.
    vec2 reflectedRay = vec2(ray.x, -ray.y);
    float reflectedAngle = abs(reflectedRay.x * direction.y - reflectedRay.y * direction.x) / max(length(reflectedRay), 1.0);
    float reflectedBeam = (1.0 - smoothstep(.035, .15, reflectedAngle)) * smoothstep(0.0, 20.0, dot(reflectedRay, direction));
    reflectedBeam *= exp(-length(reflectedRay) / 850.0) * uBeamAlpha;
    color += warm * reflectedBeam * crest * .133 * uLantern;
    color += warm * uDawn * fresnel * .07;
  }
  color *= 1.0 - uStorm * .35;
  // Slanted, sparse rain only when a later chapter supplies uStorm.
  vec2 rainPoint = vec2(px.x + px.y * .3, px.y - uTime * 260.0);
  vec2 rainCell = floor(rainPoint / vec2(37.0, 71.0));
  vec2 rainUV = fract(rainPoint / vec2(37.0, 71.0));
  float rain = (1.0 - smoothstep(.0, .025, abs(rainUV.x - .5))) * smoothstep(.1, .7, rainUV.y);
  color += vec3(.12, .16, .18) * rain * step(.78, hash(rainCell)) * uStorm * .28;
  color = mix(color, deep, smoothstep(.0, 1.0, uScroll) * .86);
  // Dawn warms the distant water while the page stays in its night palette.
  float dawnHorizon = exp(-abs(px.y - horizon * uViewport.y) / 115.0);
  color += warm * uDawn * dawnHorizon * .075;
  gl_FragColor = vec4(color, 1.0);
}
`;

export function createSea(canvas) {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const root = document.documentElement;
  // Also move the CSS horizon when WebGL is unavailable.
  const fallback = {
    update(_storm, dawnAmount, scrollAmount = 0) {
      root.style.setProperty('--dawn', String(dawnAmount));
      root.style.setProperty('--scene-offset', `${Math.max(0, Math.min(1, scrollAmount)) * window.innerHeight * .45}px`);
      root.style.setProperty('--sea-strength', String(1 - Math.max(0, Math.min(1, scrollAmount)) * .8));
    },
    setLight() {},
    setPaused() { canvas.classList.remove('is-ready'); },
  };
  function useFallback() {
    function sync() {
      const lamp = document.querySelector('.lighthouse').getBoundingClientRect();
      root.style.setProperty('--scene-horizon', `${lamp.bottom + window.scrollY}px`);
      root.style.setProperty('--scene-lamp-x', `${lamp.left + 1}px`);
    }
    sync();
    window.addEventListener('resize', sync, { passive: true });
    document.fonts.ready.then(sync);
    if ('ResizeObserver' in window) new ResizeObserver(sync).observe(document.querySelector('.hero'));
    return fallback;
  }
  let gl;
  try { gl = canvas.getContext('webgl', { alpha: false, antialias: true, depth: false, stencil: false, preserveDrawingBuffer: true, powerPreference: 'low-power' }); }
  catch { return useFallback(); }
  if (!gl) return useFallback();
  let program, buffer, uniforms;
  let width = 1, height = 1, horizon = 300, lightX = 36, lightY = 286;
  let storm = 0, dawn = 0, scroll = 0;
  let beamAngle = -80, beamAlpha = 0, lantern = reduced.matches ? 1 : 0, intro = !reduced.matches;
  let frame = 0, resizeFrame = 0, lastFrame = 0;
  let phase = 0;
  let failed = false, lost = false, initialized = false, paused = false;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      throw new Error('Sea shader compilation failed');
    }
    return shader;
  }
  function setup() {
    let vertex, fragment;
    try {
      vertex = compile(gl.VERTEX_SHADER, vertexSource);
      fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
      program = gl.createProgram();
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Sea shader linking failed');
      gl.useProgram(program);
      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, 'aPosition');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      uniforms = Object.fromEntries(['Resolution', 'Viewport', 'LightPx', 'Horizon', 'Time', 'Lantern', 'BeamAngle', 'BeamAlpha', 'Storm', 'Dawn', 'Scroll'].map((name) => [name, gl.getUniformLocation(program, `u${name}`)]));
      failed = false;
      initialized = true;
      return true;
    } catch {
      failed = true;
      canvas.classList.remove('is-ready');
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
      return false;
    } finally {
      if (vertex) gl.deleteShader(vertex);
      if (fragment) gl.deleteShader(fragment);
    }
  }
  function resizeBuffer() {
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    gl.viewport(0, 0, canvas.width, canvas.height);
    // Buffer resizing clears its pixels. Keep a dark fallback behind that frame.
    gl.clearColor(7 / 255, 18 / 255, 25 / 255, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
  function measure() {
    resizeFrame = 0;
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    const lamp = document.querySelector('.lighthouse').getBoundingClientRect();
    lightX = lamp.left + 1;
    lightY = lamp.top + window.scrollY + 1;
    horizon = lamp.bottom + window.scrollY;
    root.style.setProperty('--scene-horizon', `${horizon}px`);
    root.style.setProperty('--scene-lamp-x', `${lightX}px`);
    if (initialized && !failed && !lost) resizeBuffer();
    if (paused && initialized && !failed && !lost && !reduced.matches) draw();
    else wake();
  }
  function draw() {
    gl.uniform2f(uniforms.Resolution, canvas.width, canvas.height);
    gl.uniform2f(uniforms.Viewport, width, height);
    gl.uniform2f(uniforms.LightPx, lightX, lightY);
    gl.uniform1f(uniforms.Horizon, horizon);
    gl.uniform1f(uniforms.Time, phase);
    gl.uniform1f(uniforms.Lantern, lantern);
    gl.uniform1f(uniforms.BeamAngle, beamAngle * Math.PI / 180);
    gl.uniform1f(uniforms.BeamAlpha, beamAlpha);
    gl.uniform1f(uniforms.Storm, storm);
    gl.uniform1f(uniforms.Dawn, dawn);
    gl.uniform1f(uniforms.Scroll, scroll);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    canvas.classList.add('is-ready');
  }
  function animate(now) {
    frame = 0;
    if (failed || lost || paused || reduced.matches || document.hidden) return;
    // No upscaling: one buffer pixel per CSS pixel.
    if (!lastFrame || now - lastFrame >= (intro ? 1000 / 60 : 1000 / 30) - 1) {
      phase = (phase + (lastFrame ? Math.min(now - lastFrame, 100) / 1000 : 0) * (intro ? .15 : 1)) % 120;
      lastFrame = now;
      draw();
    }
    frame = requestAnimationFrame(animate);
  }
  function wake() {
    if (!initialized || failed || lost || paused || reduced.matches || document.hidden || frame) return;
    frame = requestAnimationFrame(animate);
  }
  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
    lastFrame = 0;
  }
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    lost = true;
    stop();
    canvas.classList.remove('is-ready');
  });
  canvas.addEventListener('webglcontextrestored', () => {
    lost = false;
    if (setup()) measure();
  });
  document.addEventListener('visibilitychange', () => document.hidden ? stop() : wake());
  reduced.addEventListener('change', () => {
    stop();
    if (reduced.matches) canvas.classList.remove('is-ready');
    else {
      if (!initialized && !failed && !lost) { if (setup()) resizeBuffer(); }
      wake();
    }
  });
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => {
      if (!resizeFrame) resizeFrame = requestAnimationFrame(measure);
    }).observe(document.querySelector('.hero'));
  }
  window.addEventListener('resize', () => {
    if (!resizeFrame) resizeFrame = requestAnimationFrame(measure);
  }, { passive: true });
  // Reduced motion uses only CSS, including on its very first frame.
  if (!reduced.matches) setup();
  measure();
  return {
    setPaused(value) {
      paused = Boolean(value);
      // Preserve the last water frame behind the reading chapters.
      canvas.classList.toggle('is-paused', paused);
      if (paused) stop(); else wake();
    },
    update(stormAmount, dawnAmount, scrollAmount = 0) {
      storm = Math.max(0, Math.min(1, stormAmount));
      dawn = Math.max(0, Math.min(1, dawnAmount));
      root.style.setProperty('--dawn', String(dawn));
      scroll = Math.max(0, Math.min(1, scrollAmount));
      root.style.setProperty('--scene-offset', `${scroll * height * .45}px`);
      root.style.setProperty('--sea-strength', String(1 - scroll * .8));
      if (paused && initialized && !failed && !lost && !reduced.matches) draw();
      else wake();
    },
    setLight(angle, alpha, brightness, isIntro = false) {
      beamAngle = angle;
      beamAlpha = alpha;
      lantern = brightness;
      intro = isIntro;
      wake();
    },
  };
}
