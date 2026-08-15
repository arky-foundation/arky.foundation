/**
 * Animation gating.
 *
 * Continuous animation is only worth running when it is actually on screen
 * in a foreground tab. This module tracks both conditions and exposes them
 * to the rAF loops in schematic.js, while stamping state classes that let
 * CSS freeze its own keyframes in step:
 *
 *   .anim-idle  on <html>, whenever the tab is hidden
 *   .is-idle    on an observed element, whenever it is scrolled out of view
 *
 * Without this the hero repaints at 60fps forever, including in a
 * backgrounded tab.
 */

const docEl = document.documentElement;

let tabVisible = document.visibilityState !== "hidden";

/** Loops register a restart callback so they can be resumed, not just killed. */
const resumers = new Set();

const resumeAll = () => {
  resumers.forEach((fn) => fn());
};

docEl.classList.toggle("anim-idle", !tabVisible);

document.addEventListener("visibilitychange", () => {
  tabVisible = document.visibilityState !== "hidden";
  docEl.classList.toggle("anim-idle", !tabVisible);
  if (tabVisible) resumeAll();
});

/** True while the tab is in the foreground. */
export const isTabVisible = () => tabVisible;

/** Register a callback that restarts a paused loop. */
export const onResume = (fn) => resumers.add(fn);

/**
 * Track whether `el` is on screen, toggling `.is-idle` on it and resuming
 * registered loops when it returns to view. Falls back to "always visible"
 * where IntersectionObserver is unavailable.
 *
 * @returns {() => boolean} getter for the element's current visibility
 */
export const visibilityOf = (el) => {
  if (!el || !("IntersectionObserver" in window)) return () => true;

  let onScreen = true;
  new IntersectionObserver(
    (entries) => {
      onScreen = entries.some((entry) => entry.isIntersecting);
      el.classList.toggle("is-idle", !onScreen);
      if (onScreen) resumeAll();
    },
    // Start a little before the element scrolls in, so it is already
    // moving by the time it is actually visible.
    { rootMargin: "120px" },
  ).observe(el);

  return () => onScreen;
};
