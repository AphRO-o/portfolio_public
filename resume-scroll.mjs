// Own desktop wheel motion before the browser scrolls, so a held panel cannot
// flash past its boundary and then be pulled back by a scroll-event correction.
export function installResumeScrollResistance(resume, win = window) {
  const doc = resume.ownerDocument;
  const desktop = win.matchMedia("(hover: hover) and (pointer: fine)");
  const reducedMotion = win.matchMedia("(prefers-reduced-motion: reduce)");
  if (!desktop.matches) return;

  let frame = 0;
  let target = null;
  let hold = null;
  let transition = null;
  let inputDirection = 0;
  let lastFrame = 0;
  let settleUntil = 0;

  function reset() {
    if (frame) win.cancelAnimationFrame(frame);
    frame = 0;
    target = hold = transition = null;
    inputDirection = 0;
    settleUntil = 0;
  }

  function maximum() {
    return Math.max(0, doc.documentElement.scrollHeight - win.innerHeight);
  }

  function gateFor(direction) {
    const top = resume.getBoundingClientRect().top + win.scrollY;
    const clamp = value => Math.max(0, Math.min(maximum(), value));
    const before = clamp(top - win.innerHeight);
    const after = clamp(top);
    if (after - before <= 2) return null;
    return { source: direction > 0 ? before : after, destination: direction > 0 ? after : before, direction };
  }

  function canHandle(event, delta) {
    if (event.defaultPrevented || !event.cancelable || !desktop.matches || reducedMotion.matches || event.ctrlKey || event.metaKey) return false;
    if (event.target.closest?.('dialog[open], input, textarea, select, [contenteditable="true"]')) return false;
    if (/hidden|clip/.test(win.getComputedStyle(doc.body).overflowY)) return false;
    for (let node = event.target; node && node !== doc.body && node !== doc.documentElement; node = node.parentElement) {
      if (node.scrollHeight > node.clientHeight + 1 && /auto|scroll/.test(win.getComputedStyle(node).overflowY)) {
        if ((delta > 0 && node.scrollTop + node.clientHeight < node.scrollHeight - 1) || (delta < 0 && node.scrollTop > 0)) return false;
      }
    }
    return true;
  }

  function moveTo(top) {
    win.scrollTo({ top, behavior: "instant" });
  }

  function schedule() {
    if (frame) return;
    lastFrame = win.performance.now();
    frame = win.requestAnimationFrame(animate);
  }

  function animate(now) {
    frame = 0;
    if (transition) {
      const progress = Math.min(1, Math.max(0, (now - transition.start) / 480));
      const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2;
      moveTo(transition.from + (transition.to - transition.from) * eased);
      if (progress >= 1) {
        target = transition.to;
        transition = null;
        settleUntil = now + 120;
        return;
      }
    } else if (target !== null) {
      const position = win.scrollY;
      const distance = target - position;
      const elapsed = Math.max(1, Math.min(64, now - lastFrame));
      const next = Math.abs(distance) <= 1 ? target : position + distance * (1 - Math.exp(-elapsed / 55));
      // Exponential approach is monotonic and always stays on this side of the
      // clamped target. There is no native wheel motion racing this animation.
      moveTo(next);
      if (win.scrollY === position && Math.abs(distance) > 1) {
        // At high refresh rates the eased step can round to zero physical
        // pixels. Keep advancing instead of stalling before a ready gate.
        const pixel = Math.max(1, 1 / (win.devicePixelRatio || 1));
        moveTo(position + Math.sign(distance) * Math.min(Math.abs(distance), pixel));
      }
      if (Math.abs(win.scrollY - target) <= 1) {
        moveTo(target);
        if (hold?.ready) {
          transition = { from: target, to: hold.destination, start: now };
          hold = null;
        } else return;
      }
    } else return;
    lastFrame = now;
    frame = win.requestAnimationFrame(animate);
  }

  function wheel(event) {
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? win.innerHeight : 1;
    const delta = event.deltaY * unit;
    if (!delta || !canHandle(event, delta)) { reset(); return; }

    // Cancel every eligible wheel event, including the approach to a boundary.
    // Nothing is corrected after a scroll frame has already exposed the panel.
    event.preventDefault();
    const now = win.performance.now();
    if (transition || now < settleUntil) return;
    const direction = Math.sign(delta);
    if (target === null || direction !== inputDirection) {
      target = win.scrollY;
      hold = null;
      // Stop any browser smooth-scroll animation left by a preceding navigation.
      moveTo(target);
    }
    inputDirection = direction;

    const desired = Math.max(0, Math.min(maximum(), target + delta));
    const gate = gateFor(direction);
    const approachesGate = gate && (gate.source - win.scrollY) * direction >= -2 &&
      (desired - gate.source) * direction >= -2;
    if (approachesGate) {
      target = gate.source;
      if (!hold || hold.direction !== direction || now - hold.last > 750) {
        hold = { ...gate, effort: 0, start: now, last: now, ready: false };
      }
      hold.last = now;
      hold.effort += Math.min(Math.abs(delta), 120);
      hold.ready = hold.effort >= 240 && now - hold.start >= 140;
    } else {
      target = desired;
      hold = null;
    }
    schedule();
  }

  // A capturing, non-passive listener cancels native scrolling from the start of
  // the gesture. Touch, keyboard, navigation and nested readers stay native.
  win.addEventListener("wheel", wheel, { passive: false, capture: true });
  for (const type of ["keydown", "pointerdown", "click", "hashchange", "resize", "blur", "pageshow"]) win.addEventListener(type, reset);
  desktop.addEventListener("change", reset);
  reducedMotion.addEventListener("change", reset);
}
