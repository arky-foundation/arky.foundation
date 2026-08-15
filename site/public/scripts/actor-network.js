/**
 * Hero actor-network: evidence in -> Arky hub -> signed receipt out.
 *
 * Packet A carries evidence from an actor to the hub; packet B carries the
 * signed receipt back out. The two alternate, stepping through the actors
 * in turn. The loop suspends whenever the hero scrolls away or the tab is
 * backgrounded -- see anim-gate.js.
 */

import { isTabVisible, onResume, visibilityOf } from "./anim-gate.js";

const lerp = (a, b, t) => a + (b - a) * t;

/** Milliseconds per leg. */
const LEG = 1500;

const place = (pkt, from, to, t) => {
  pkt.setAttribute("cx", lerp(from.x, to.x, t).toFixed(2));
  pkt.setAttribute("cy", lerp(from.y, to.y, t).toFixed(2));
};

/** Read the scene out of the DOM, or null if the hero is not on this page. */
function readScene() {
  const netRoot = document.querySelector(".hero-net");
  if (!netRoot) return null;

  const hub = { x: 200, y: 200 };
  const actors = Array.from(netRoot.querySelectorAll(".net-node")).map((el) => {
    const m = /translate\(([-\d.]+)\s+([-\d.]+)\)/u.exec(el.getAttribute("transform") || "");
    return { el, x: m ? Number(m[1]) : hub.x, y: m ? Number(m[2]) : hub.y };
  });

  const pktA = netRoot.querySelector("#net-packet-a");
  const pktB = netRoot.querySelector("#net-packet-b");
  if (!pktA || !pktB) return null;

  return { netRoot, hub, actors, pktA, pktB };
}

/** Static pose: one actor lit, receipt already delivered. */
function rest({ hub, actors, pktA, pktB }) {
  pktA.style.opacity = "0";
  if (actors[0]) {
    actors[0].el.classList.add("lit");
    place(pktB, hub, actors[0], 1);
  }
}

/** Advance the packets for the current leg. */
function drawLeg({ hub, pktA, pktB }, actor, phase, t) {
  if (phase === 0) {
    place(pktA, actor, hub, t);
    pktA.style.opacity = "1";
    pktB.style.opacity = "0";
    if (t > 0.08 && t < 0.96) actor.el.classList.add("lit");
  } else {
    place(pktB, hub, actor, t);
    pktB.style.opacity = "1";
    pktA.style.opacity = "0";
    if (t > 0.9) actor.el.classList.remove("lit");
  }
}

/**
 * Advance the cursor when a leg completes.
 *
 * The frame's overshoot is carried into the next leg rather than
 * discarded, so legs stay LEG ms instead of drifting longer by however
 * late each landing frame happened to be.
 */
function advance(state, actor, actorCount, ts) {
  const overshoot = ts - state.legStart - LEG;
  state.legStart = ts - Math.min(overshoot, LEG);

  if (state.phase === 0) {
    state.phase = 1;
    return;
  }
  state.phase = 0;
  actor.el.classList.remove("lit");
  state.idx = (state.idx + 1) % actorCount;
}

export function initActorNetwork({ reduceMotion }) {
  const scene = readScene();
  if (!scene) return;

  const { netRoot, actors } = scene;
  if (reduceMotion || actors.length === 0) {
    rest(scene);
    return;
  }

  // phase 0 = evidence inbound, phase 1 = receipt outbound.
  const state = { idx: 0, legStart: null, phase: 0 };
  let running = false;

  const onScreen = visibilityOf(netRoot);

  const tick = (ts) => {
    if (!isTabVisible() || !onScreen()) {
      running = false;
      // Drop the stale origin so the next leg starts from the resume
      // timestamp instead of replaying the time spent off screen.
      state.legStart = null;
      return;
    }

    if (state.legStart === null) state.legStart = ts;
    const t = Math.min(1, (ts - state.legStart) / LEG);
    const actor = actors[state.idx];

    drawLeg(scene, actor, state.phase, t);
    if (t >= 1) advance(state, actor, actors.length, ts);

    window.requestAnimationFrame(tick);
  };

  const start = () => {
    if (running) return;
    running = true;
    window.requestAnimationFrame(tick);
  };

  onResume(start);
  start();
}
