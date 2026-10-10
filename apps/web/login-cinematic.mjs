/** VAOS cinematic access stage. Purely presentation; no authentication authority. */
export function createCinematicController({
  doc = globalThis.document,
  win = globalThis.window,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) {
  const scene = doc?.querySelector?.('#cinematic-scene');
  const portal = doc?.querySelector?.('#cinematic-portal');
  const portalStatus = doc?.querySelector?.('#portal-status');
  const dust = doc?.querySelector?.('#cinematic-dust');
  const reducedMotion = Boolean(win?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
  const coarse = Boolean(win?.matchMedia?.('(hover: none) and (pointer: coarse)')?.matches);
  let started = false;
  let transition = null;
  let rafPending = false;

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  function updateLayers(px, py) {
    if (!scene || reducedMotion || transition) return;
    const x = clamp(px, -.5, .5);
    const y = clamp(py, -.5, .5);
    scene.style.setProperty('--parallax-x', `${(x * 28).toFixed(2)}px`);
    scene.style.setProperty('--parallax-y', `${(y * 19).toFixed(2)}px`);
    scene.style.setProperty('--grid-x', `${(x * -48).toFixed(2)}px`);
    scene.style.setProperty('--grid-y', `${(y * -34).toFixed(2)}px`);
    scene.style.setProperty('--dust-x', `${(x * 44).toFixed(2)}px`);
    scene.style.setProperty('--dust-y', `${(y * 34).toFixed(2)}px`);
    scene.style.setProperty('--art-rx', `${(y * -2.6).toFixed(2)}deg`);
    scene.style.setProperty('--art-ry', `${(x * 4.4).toFixed(2)}deg`);
  }
  function scheduleLayers(x, y) {
    if (rafPending) return;
    rafPending = true;
    const raf = typeof win?.requestAnimationFrame === 'function'
      ? win.requestAnimationFrame.bind(win) : cb => setTimeout(cb, 0);
    raf(() => { rafPending = false; updateLayers(x,y); });
  }
  function createDust() {
    if (reducedMotion || typeof dust?.appendChild !== 'function' || typeof doc?.createElement !== 'function') return;
    let seed = 0x5a7517;
    const random = () => {seed = (seed * 1664525 + 1013904223) >>> 0;return seed / 4294967296;};
    const amount = coarse ? 12 : 24;
    for (let i=0;i<amount;i++) {
      const speck = doc.createElement('i');
      speck.className='cinematic-dust__speck';
      speck.style.left=`${(random()*100).toFixed(2)}%`;
      speck.style.top=`${(random()*100).toFixed(2)}%`;
      speck.style.setProperty('--size',`${(random()*2.2+.75).toFixed(1)}px`);
      speck.style.setProperty('--delay',`${(random()*-14).toFixed(1)}s`);
      speck.style.setProperty('--duration',`${(random()*9+8).toFixed(1)}s`);
      dust.appendChild(speck);
    }
  }
  function start() {
    if (started) return;
    started=true;
    createDust();
    if (reducedMotion || !scene || !win?.addEventListener) return;
    if (!coarse) {
      win.addEventListener('pointermove', ev => {
        scheduleLayers((ev.clientX / Math.max(win.innerWidth,1))-.5,
          (ev.clientY / Math.max(win.innerHeight,1))-.5);
      }, {passive:true});
    } else if (typeof win.DeviceOrientationEvent !== 'undefined' &&
      typeof win.DeviceOrientationEvent.requestPermission !== 'function') {
      win.addEventListener('deviceorientation', ev=>{
        if (Number.isFinite(ev.gamma) && Number.isFinite(ev.beta))
          scheduleLayers(clamp(ev.gamma/60,-.5,.5),clamp((ev.beta-45)/80,-.5,.5));
      }, {passive:true});
    }
    // Motion permissions on platforms requiring a gesture remain unrequested:
    // no device sensors are accessed without the platform's permission.
  }
  function complete() {
    if (transition) return transition;
    transition = (async () => {
      if (!scene) return;
      scene.classList.add('is-authorized');
      await wait(reducedMotion ? 0 : 850);
      scene.classList.add('is-void');
      portal?.removeAttribute('aria-hidden');
      if (portalStatus) portalStatus.textContent = 'Opening the governed workspace…';
      await wait(reducedMotion ? 50 : 1850);
    })();
    return transition;
  }
  return Object.freeze({start,complete});
}
