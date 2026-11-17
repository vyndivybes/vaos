/** Pointer movement affects the artwork only. Content stays in place. */
export function startSceneParallax(scene, win = globalThis.window) {
  if (!scene || !win?.matchMedia) return;
  const motion = win.matchMedia('(prefers-reduced-motion: reduce)');
  const pointer = win.matchMedia('(hover: hover) and (pointer: fine)');
  let frame = null;
  let x = 0;
  let y = 0;

  function render() {
    frame = null;
    const tiltX = motion.matches || !pointer.matches ? 0 : x;
    const tiltY = motion.matches || !pointer.matches ? 0 : y;
    scene.style.setProperty('--scene-x', `${(tiltX * 26).toFixed(2)}px`);
    scene.style.setProperty('--scene-y', `${(tiltY * 18).toFixed(2)}px`);
    scene.style.setProperty('--scene-rx', `${(-tiltY * 6).toFixed(2)}deg`);
    scene.style.setProperty('--scene-ry', `${(tiltX * 8).toFixed(2)}deg`);
  }

  function schedule() {
    if (frame === null) frame = win.requestAnimationFrame(render);
  }

  function reset() {
    x = 0;
    y = 0;
    schedule();
  }

  win.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch' || motion.matches || !pointer.matches) return;
    x = Math.max(-1, Math.min(1, 2 * event.clientX / Math.max(win.innerWidth, 1) - 1));
    y = Math.max(-1, Math.min(1, 2 * event.clientY / Math.max(win.innerHeight, 1) - 1));
    schedule();
  }, { passive: true });
  win.document.documentElement.addEventListener('pointerleave', reset);
  win.addEventListener('blur', reset);
  motion.addEventListener?.('change', reset);
  pointer.addEventListener?.('change', reset);
}
