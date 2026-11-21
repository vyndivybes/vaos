/**
 * On-demand conceptual Three.js scene for Spatial Command.
 * The existing HTML buttons remain the authoritative, keyboard-operable selector.
 * No edges, runtime connectivity, source observations or authority are inferred here.
 * Uses the MIT-licensed Three.js files already vendored with VAOS.
 */
export async function mountSpatialThree(stage, layout, {onSelect, reducedMotion=false}={}) {
  if (!stage || !Array.isArray(layout) || typeof window === 'undefined') {
    throw new Error('SPATIAL_VIEW_UNAVAILABLE');
  }

  // Import only after the authorized visitor explicitly enables 3D.
  const THREE = await import('./vendor/three.module.min.js');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      alpha: true, antialias: true, powerPreference: 'low-power',
      preserveDrawingBuffer: false
    });
  } catch {
    throw new Error('WEBGL_NOT_AVAILABLE');
  }

  renderer.domElement.className = 'sp-three-canvas';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  renderer.domElement.setAttribute('tabindex', '-1');
  stage.insertBefore(renderer.domElement, stage.firstChild);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0, 11);
  const pivot = new THREE.Group();
  scene.add(pivot);
  const sharedGeometry = new THREE.IcosahedronGeometry(0.24, 1);
  const controlColor = 0xe2ba80;
  const knowledgeColor = 0x79d4c4;
  const selectedColor = 0xffffff;
  const materials = [];
  const items = new Map();
  for (const [id, x, y, z] of layout) {
    const control = id === 'VAOS' || id === 'VYNDI OS';
    const material = new THREE.MeshBasicMaterial({
      color: control ? controlColor : knowledgeColor,
      transparent: true,
      opacity: control ? 0.91 : 0.7
    });
    materials.push(material);
    const sphere = new THREE.Mesh(sharedGeometry, material);
    sphere.position.set(parseFloat(x) / 84, -parseFloat(y) / 84, parseFloat(z) / 125);
    sphere.userData.source = id;
    pivot.add(sphere);
    items.set(id, sphere);
  }

  const orbitGeometry = new THREE.TorusGeometry(2.45, 0.008, 3, 96);
  const orbitMaterial = new THREE.MeshBasicMaterial({
    color: 0x9db9b2, transparent: true, opacity: 0.18
  });
  const orbit = new THREE.Mesh(orbitGeometry, orbitMaterial);
  orbit.rotation.x = -0.34;
  pivot.add(orbit);
  const orbit2 = new THREE.Mesh(orbitGeometry, orbitMaterial);
  orbit2.rotation.x = 0.95;
  orbit2.rotation.y = 0.4;
  pivot.add(orbit2);

  let disposed = false;
  let frame = 0;
  let selected = 'VAOS';
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const shouldReduce = () => reducedMotion || reduce?.matches;
  function draw() {
    frame = 0;
    if (disposed || document.hidden) return;
    renderer.render(scene, camera);
  }
  function requestDraw() {
    if (!frame && !disposed) frame = window.requestAnimationFrame(draw);
  }
  function resize() {
    if (disposed) return;
    const width = Math.max(1, stage.clientWidth);
    const height = Math.max(1, stage.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    requestDraw();
  }
  function highlight(id) {
    selected = items.has(id) ? id : 'VAOS';
    for (const [name, sphere] of items) {
      const active = name === selected;
      sphere.material.color.setHex(active ? selectedColor :
        (name === 'VAOS' || name === 'VYNDI OS' ? controlColor : knowledgeColor));
      sphere.material.opacity = active ? 1 : 0.67;
      sphere.scale.setScalar(active ? 1.55 : 1);
    }
    requestDraw();
  }
  function pointer(event) {
    if (shouldReduce()) return;
    const bounds = stage.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    pivot.rotation.y = ((event.clientX - bounds.left) / bounds.width - 0.5) * 0.24;
    pivot.rotation.x = ((event.clientY - bounds.top) / bounds.height - 0.5) * -0.16;
    requestDraw();
  }
  function reset() {
    pivot.rotation.set(0, 0, 0);
    requestDraw();
  }
  function visibility() { requestDraw(); }
  const observer = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(resize) : null;

  stage.addEventListener('pointermove', pointer, {passive: true});
  stage.addEventListener('pointerleave', reset);
  window.addEventListener('resize', resize, {passive: true});
  document.addEventListener('visibilitychange', visibility);
  reduce?.addEventListener?.('change', reset);
  observer?.observe(stage);
  highlight(onSelect?.() || selected);
  resize();

  return {
    highlight,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frame) window.cancelAnimationFrame(frame);
      stage.removeEventListener('pointermove', pointer);
      stage.removeEventListener('pointerleave', reset);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', visibility);
      reduce?.removeEventListener?.('change', reset);
      observer?.disconnect();
      sharedGeometry.dispose();
      orbitGeometry.dispose();
      orbitMaterial.dispose();
      for (const material of materials) material.dispose();
      renderer.dispose();
      renderer.forceContextLoss?.();
      renderer.domElement.remove();
    }
  };
}
