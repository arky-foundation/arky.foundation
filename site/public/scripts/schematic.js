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
  const depthButtons = Array.from(document.querySelectorAll(".depth-btn"));

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

    depthButtons.forEach((button) => {
      button.addEventListener("click", () => {
        mode = button.dataset.mode || "plain";
        depthButtons.forEach((other) => {
          other.setAttribute("aria-pressed", String(other === button));
        });
        writeDesc(current);
      });
    });

    // Seed the description for the initial stage.
    if (stageDesc) stageDesc.innerHTML = copy[mode][0];

    const render = (timestamp) => {
      if (paused) {
        return;
      }
      const progress = reduceMotion ? 0.94 : (timestamp % 9000) / 9000;
      placeSignal(route.getPointAtLength(progress * length));
      route.style.strokeDashoffset = String(length * (1 - progress));
      const index = Math.min(nodes.length - 1, Math.floor(progress * nodes.length));
      if (index !== current) setActive(index);

      if (!reduceMotion) {
        window.requestAnimationFrame(render);
      }
    };

    if (reduceMotion) {
      // No animation: rest on the final, signed-receipt stage.
      setStage(nodes.length - 1);
    } else {
      render(0);
    }
  }

  copyButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      const value = button.dataset.copy || "";
      const original = button.textContent;

      try {
        await navigator.clipboard.writeText(value);
        button.textContent = "copied";
      } catch {
        button.textContent = "select";
      }

      window.setTimeout(() => {
        button.textContent = original;
      }, 1600);
    });
  });

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
