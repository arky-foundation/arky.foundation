import { initActorNetwork } from "./actor-network.js";
import { isTabVisible, onResume, visibilityOf } from "./anim-gate.js";

(() => {
  const route = document.querySelector("#live-route");
  const dot = document.querySelector("#signal-dot");
  const halo = document.querySelector("#signal-halo");
  const stage = document.querySelector("#active-stage");
  const nodes = Array.from(document.querySelectorAll(".flow-node"));
  const copyButtons = Array.from(document.querySelectorAll("[data-copy]"));
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Move the signal dot (and its halo) to a point on the route.
  const placeSignal = (point) => {
    dot.setAttribute("cx", point.x.toFixed(2));
    dot.setAttribute("cy", point.y.toFixed(2));
    if (halo) {
      halo.setAttribute("cx", point.x.toFixed(2));
      halo.setAttribute("cy", point.y.toFixed(2));
    }
  };

  const stageDesc = document.querySelector("#stage-desc");

  const labels = [
    "TIM / Evidence",
    "Notary / Witness",
    "Kernel / Policy",
    "Settler / Execute",
    "XR / Receipt",
  ];

  const copy = {
    plain: [
      "Something happened. It is recorded with who, what, and when.",
      "An independent witness fixes the time and order it happened.",
      "A declared rule decides whether the action is allowed.",
      "The approved action runs on a bank, chain, or device.",
      "A signed receipt proves exactly what happened.",
    ],
    engineer: [
      "TIM: <code>cid = multibase(multihash(sha2-256, JCS(body)))</code>, signed.",
      "Notary: witnessed timestamp and order; optional chain or log anchor.",
      "Kernel: deterministic decision under declared policy packs.",
      "Settler: executes a verb on a rail (pay / refund / control).",
      "XR: detached-payload JWS Ed25519 (RFC 7797, b64:false); signed, status=success.",
    ],
  };

  let mode = "plain";
  let current = 0;
  let paused = reduceMotion;

  // Callbacks invoked whenever the Plain/Engineer mode changes, so the desktop
  // schematic and the mobile vertical flow stay in sync from one source.
  const modeListeners = [];

  // Mobile vertical flow: stacked, legible steps that mirror the desktop
  // schematic's per-stage copy. Populated/swapped in sync with the toggle.
  const mobileSteps = Array.from(document.querySelectorAll(".flow-step"));
  const fillMobileSteps = () => {
    mobileSteps.forEach((step) => {
      const index = Number(step.dataset.step);
      const target = step.querySelector(".flow-step-desc");
      if (target) target.innerHTML = copy[mode][index] || "";
    });
  };
  if (mobileSteps.length > 0) {
    fillMobileSteps();
    modeListeners.push(fillMobileSteps);
  }

  // Single toggle wiring for every .depth-btn (desktop + mobile share state).
  Array.from(document.querySelectorAll(".depth-btn")).forEach((button) => {
    button.addEventListener("click", () => {
      mode = button.dataset.mode || "plain";
      document.querySelectorAll(".depth-btn").forEach((other) => {
        other.setAttribute("aria-pressed", String(other.dataset.mode === mode));
      });
      modeListeners.forEach((fn) => fn());
    });
  });

  if (route && dot && stage && nodes.length > 0) {
    const length = route.getTotalLength();
    route.style.strokeDasharray = `${length * 0.16} ${length}`;

    const writeDesc = (index) => {
      if (!stageDesc) return;
      const html = copy[mode][index] || "";
      if (reduceMotion) {
        stageDesc.innerHTML = html;
        return;
      }
      stageDesc.classList.add("is-swapping");
      window.setTimeout(() => {
        stageDesc.innerHTML = html;
        stageDesc.classList.remove("is-swapping");
      }, 200);
    };

    const setActive = (index) => {
      current = index;
      nodes.forEach((node, nodeIndex) => {
        node.dataset.active = String(nodeIndex === index);
      });
      stage.textContent = labels[index] || labels[0];
      writeDesc(index);
    };

    // Snap signal + active state to a chosen stage and pause the loop.
    const setStage = (index) => {
      paused = true;
      const clamped = Math.max(0, Math.min(nodes.length - 1, index));
      const progress = nodes.length > 1 ? clamped / (nodes.length - 1) : 0;
      placeSignal(route.getPointAtLength(progress * length));
      route.style.strokeDashoffset = String(length * (1 - progress));
      setActive(clamped);
    };

    nodes.forEach((node, index) => {
      node.addEventListener("click", () => setStage(index));
      node.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setStage(index);
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          const next = Math.min(nodes.length - 1, current + 1);
          setStage(next);
          nodes[next].focus();
        } else if (event.key === "ArrowLeft") {
          event.preventDefault();
          const prev = Math.max(0, current - 1);
          setStage(prev);
          nodes[prev].focus();
        }
      });
    });

    // Keep the desktop schematic's live description in sync with the toggle.
    modeListeners.push(() => writeDesc(current));

    // Seed the description for the initial stage.
    if (stageDesc) stageDesc.innerHTML = copy[mode][0];

    // The schematic only animates while it is on screen in a live tab.
    // getPointAtLength() forces SVG geometry work every frame, so running
    // it against a scrolled-away diagram is pure waste.
    const stageEl = document.querySelector(".hero-stage");
    const stageOnScreen = visibilityOf(stageEl);
    // Guards against stacking rAF chains when several resume triggers
    // (tab focus + scroll back into view) fire together.
    let running = false;

    const render = (timestamp) => {
      if (paused || !isTabVisible() || !stageOnScreen()) {
        running = false;
        return;
      }
      const progress = reduceMotion ? 0.94 : (timestamp % 9000) / 9000;
      placeSignal(route.getPointAtLength(progress * length));
      route.style.strokeDashoffset = String(length * (1 - progress));
      const index = Math.min(nodes.length - 1, Math.floor(progress * nodes.length));
      if (index !== current) setActive(index);

      if (reduceMotion) {
        running = false;
        return;
      }
      window.requestAnimationFrame(render);
    };

    const startRender = () => {
      if (running || paused || reduceMotion) return;
      running = true;
      window.requestAnimationFrame(render);
    };

    if (reduceMotion) {
      // No animation: rest on the final, signed-receipt stage.
      setStage(nodes.length - 1);
    } else {
      onResume(startRender);
      startRender();
    }
  }

  copyButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      const value = button.dataset.copy || "";
      const original = button.textContent;

      try {
        await navigator.clipboard.writeText(value);
        button.textContent = "copied";
        button.classList.add("is-copied");
      } catch {
        button.textContent = "select";
      }

      window.setTimeout(() => {
        button.textContent = original;
        button.classList.remove("is-copied");
      }, 1600);
    });
  });

  initActorNetwork({ reduceMotion });

  // Header lift: once the page scrolls off the top, the header casts a shadow.
  const siteHeader = document.querySelector(".site-header");
  if (siteHeader) {
    const onScroll = () => siteHeader.classList.toggle("is-scrolled", window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  // Scroll-reveal: fade + rise elements as they enter the viewport.
  const reveals = Array.from(document.querySelectorAll(".reveal:not(.hero-load)"));
  if (reveals.length > 0) {
    if (reduceMotion || !("IntersectionObserver" in window)) {
      reveals.forEach((el) => el.classList.add("is-in"));
    } else {
      const observer = new IntersectionObserver(
        (entries, obs) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-in");
              obs.unobserve(entry.target);
            }
          });
        },
        { rootMargin: "0px 0px -10% 0px", threshold: 0.12 },
      );
      reveals.forEach((el) => observer.observe(el));
    }
  }
})();
