(() => {
  "use strict";

  const canvas = document.getElementById("cradle");
  const context = canvas.getContext("2d", { alpha: true });

  const state = {
    dpr: 1,
    width: 0,
    height: 0,
    lastTimestampMs: 0,
    draggingIndex: null,
    dragMode: null, // "ball" | "rotate" | null
    pointerId: null,
    pointerX: 0,
    pointerY: 0,
    heldByDrag: [],
    rotateStartX: 0,
    rotateStartYaw: 0,
    layout: {
      frameLeft: 0,
      frameRight: 0,
      centerX: 0,
    },
  };

  const settings = {
    ballCount: 5,
    gravity: 2200, // px/s^2 (scaled for dt-based sim)
    length: 260, // px
    ballRadius: 18,
    damping: 0.996,
    restitution: 0.985,
    maxAngleRad: 1.18, // ~68 degrees
    collisionAngleGate: 0.75, // only resolve collisions near bottom-ish
  };

  const view = {
    yaw: (18 * Math.PI) / 180, // rotation around Y-ish axis (radians)
    frameDepth: 120, // distance between front/back bars (z)
    skewX: 0.70, // z -> x projection
    skewY: 0.26, // z -> y projection (up)
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function deviceToCanvasPoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) * (state.width / rect.width);
    const y = (clientY - rect.top) * (state.height / rect.height);
    return { x, y };
  }

  function screenToWorldAtZ0(screenX, screenY) {
    // Inverse of our "rotate + skew" projection, restricted to the z=0 plane.
    const cx = state.layout.centerX || state.width / 2;
    const cos = Math.cos(view.yaw);
    const sin = Math.sin(view.yaw);
    const denom = cos + sin * view.skewX;
    const x0 = (screenX - cx) / (Math.abs(denom) < 0.001 ? 0.001 : denom);
    const zRot = x0 * sin;
    return {
      x: cx + x0,
      y: screenY + zRot * view.skewY,
    };
  }

  function setAngleForBobX(ball, targetBobX) {
    const maxS = Math.sin(settings.maxAngleRad);
    const s = clamp((targetBobX - ball.pivot.x) / ball.length, -maxS, maxS);
    ball.setAngle(Math.asin(s));
    ball.recomputeBob();
  }

  function enforceNoPassingDuringDrag(dragIndex) {
    // While dragging, keep balls ordered and "touching" by pulling neighbors along their arcs.
    const minDist = settings.ballRadius * 2;
    const held = [];

    held.push(dragIndex);

    // Left side chain
    for (let i = dragIndex - 1; i >= 0; i -= 1) {
      const right = balls[i + 1];
      const left = balls[i];
      const maxX = right.bob.x - minDist;
      if (left.bob.x > maxX) {
        left.isHeld = true;
        setAngleForBobX(left, maxX);
        held.push(i);
      } else {
        break;
      }
    }

    // Right side chain
    for (let i = dragIndex + 1; i < balls.length; i += 1) {
      const left = balls[i - 1];
      const right = balls[i];
      const minX = left.bob.x + minDist;
      if (right.bob.x < minX) {
        right.isHeld = true;
        setAngleForBobX(right, minX);
        held.push(i);
      } else {
        break;
      }
    }

    state.heldByDrag = held;
  }

  class Ball {
    constructor(index, pivotX, pivotY, length) {
      this.index = index;
      this.pivot = { x: pivotX, y: pivotY };
      this.length = length;
      this.angle = 0;
      this.angleVelocity = 0;
      this.angleAcceleration = 0;
      this.bob = { x: pivotX, y: pivotY + length };
      this.isHeld = false;
    }

    setAngle(angleRad) {
      this.angle = clamp(angleRad, -settings.maxAngleRad, settings.maxAngleRad);
    }

    update(dtSeconds) {
      if (this.isHeld) {
        this.angleVelocity = 0;
        this.angleAcceleration = 0;
        this.recomputeBob();
        return;
      }

      // From Nature of Code pendulum example:
      // angleAcc = (-g / r) * sin(angle)
      this.angleAcceleration = (-settings.gravity / this.length) * Math.sin(this.angle);
      this.angleVelocity += this.angleAcceleration * dtSeconds;
      this.angleVelocity *= Math.pow(settings.damping, dtSeconds * 60);
      this.angle += this.angleVelocity * dtSeconds;
      this.angle = clamp(this.angle, -settings.maxAngleRad, settings.maxAngleRad);
      this.recomputeBob();
    }

    recomputeBob() {
      this.bob.x = this.pivot.x + this.length * Math.sin(this.angle);
      this.bob.y = this.pivot.y + this.length * Math.cos(this.angle);
    }

    // Tangential velocity components of the bob (pendulum kinematics)
    velocity() {
      const vx = this.length * this.angleVelocity * Math.cos(this.angle);
      const vy = -this.length * this.angleVelocity * Math.sin(this.angle);
      return { x: vx, y: vy };
    }

    setVelocityFromVx(vx) {
      const denom = this.length * Math.max(0.15, Math.abs(Math.cos(this.angle)));
      const newAngleVelocity = vx / denom;
      this.angleVelocity = clamp(newAngleVelocity, -14, 14);
    }
  }

  let balls = [];

  function resetSystem({ kick = null } = {}) {
    const stageWidth = state.width;
    const beamY = Math.round(lerp(38, 54, clamp(state.height / 520, 0, 1)));
    const length = clamp(settings.length, 180, Math.min(300, state.height - 180));

    // Cradle balls are essentially touching at rest.
    const spacing = settings.ballRadius * 2.0;
    const span = spacing * (settings.ballCount - 1);
    const left = (stageWidth - span) / 2;

    balls = [];
    for (let i = 0; i < settings.ballCount; i += 1) {
      balls.push(new Ball(i, left + i * spacing, beamY, length));
    }

    // Tighten the frame to the balls (more like the reference photo).
    const minPivot = balls[0].pivot.x;
    const maxPivot = balls[balls.length - 1].pivot.x;
    const frameMargin = clamp(settings.ballRadius * 4.0, 78, 140);
    state.layout.frameLeft = clamp(minPivot - frameMargin, 28, stageWidth - 280);
    state.layout.frameRight = clamp(maxPivot + frameMargin, 280, stageWidth - 28);
    state.layout.centerX = (state.layout.frameLeft + state.layout.frameRight) / 2;

    // Default: pull one side.
    if (kick === "left") {
      balls[0].setAngle(-0.95);
    } else if (kick === "right") {
      balls[settings.ballCount - 1].setAngle(0.95);
    } else {
      balls[0].setAngle(-0.95);
    }

    for (const b of balls) b.recomputeBob();
  }

  function resolveCollisions() {
    const r = settings.ballRadius;
    const minDist = r * 2;
    const minDistSq = minDist * minDist;

    for (let i = 0; i < balls.length - 1; i += 1) {
      const a = balls[i];
      const b = balls[i + 1];
      if (a.isHeld || b.isHeld) continue;

      // Only handle collisions when both bobs are relatively near the bottom.
      if (Math.abs(a.angle) > settings.collisionAngleGate || Math.abs(b.angle) > settings.collisionAngleGate) {
        continue;
      }

      const dx = b.bob.x - a.bob.x;
      const dy = b.bob.y - a.bob.y;
      const distSq = dx * dx + dy * dy;

      if (distSq >= minDistSq) continue;

      const dist = Math.max(0.0001, Math.sqrt(distSq));
      const nx = dx / dist;
      const ny = dy / dist;

      // Relative velocity along the collision normal (approx)
      const va = a.velocity();
      const vb = b.velocity();
      const rvx = vb.x - va.x;
      const rvy = vb.y - va.y;
      const relAlongNormal = rvx * nx + rvy * ny;

      // If separating, skip.
      if (relAlongNormal > 0) continue;

      // Equal mass 1D-ish energy transfer: swap horizontal velocity components.
      // (Newton's cradle behavior is dominated by near-horizontal impacts at the bottom.)
      const newVxA = vb.x * settings.restitution;
      const newVxB = va.x * settings.restitution;
      a.setVelocityFromVx(newVxA);
      b.setVelocityFromVx(newVxB);

      // Small positional correction to prevent sticky overlap (visual only).
      // Note: bob positions will be recomputed from angles next frame.
      const overlap = minDist - dist;
      if (overlap > 0) {
        const push = overlap * 0.55;
        a.bob.x -= nx * push;
        a.bob.y -= ny * push * 0.2;
        b.bob.x += nx * push;
        b.bob.y += ny * push * 0.2;
      }
    }
  }

  function drawBackground() {
    const w = state.width;
    const h = state.height;

    context.clearRect(0, 0, w, h);

    // Glow backdrop
    const g0 = context.createRadialGradient(w * 0.3, h * 0.15, 40, w * 0.3, h * 0.15, Math.max(w, h));
    g0.addColorStop(0, "rgba(102,255,242,0.18)");
    g0.addColorStop(0.6, "rgba(102,255,242,0.00)");
    context.fillStyle = g0;
    context.fillRect(0, 0, w, h);

    const g1 = context.createRadialGradient(w * 0.8, h * 0.2, 50, w * 0.8, h * 0.2, Math.max(w, h));
    g1.addColorStop(0, "rgba(255,75,214,0.16)");
    g1.addColorStop(0.6, "rgba(255,75,214,0.00)");
    context.fillStyle = g1;
    context.fillRect(0, 0, w, h);

    // Desk plane at bottom
    const deskTop = Math.round(h * 0.74);
    const wood = context.createLinearGradient(0, deskTop, 0, h);
    wood.addColorStop(0, "rgba(0,0,0,0.00)");
    wood.addColorStop(0.08, "rgba(58,27,15,0.82)");
    wood.addColorStop(1, "rgba(30,15,9,0.95)");
    context.fillStyle = wood;
    context.fillRect(0, deskTop, w, h - deskTop);
  }

  function projectPoint(x, y, z) {
    const cx = state.layout.centerX || state.width / 2;
    const cos = Math.cos(view.yaw);
    const sin = Math.sin(view.yaw);

    // Rotate around a vertical axis passing through centerX.
    const x0 = x - cx;
    const xr = x0 * cos - z * sin;
    const zr = x0 * sin + z * cos;

    // Skew-project depth (zr) into screen x/y.
    return {
      x: cx + xr + zr * view.skewX,
      y: y - zr * view.skewY,
      zr,
    };
  }

  function drawChromeBall(cx, cy, r) {
    // Base chrome shading (radial)
    const hlx = cx - r * 0.42;
    const hly = cy - r * 0.46;
    const grad = context.createRadialGradient(hlx, hly, 1, cx, cy, r * 1.35);
    grad.addColorStop(0.0, "rgba(255,255,255,0.98)");
    grad.addColorStop(0.16, "rgba(230,240,255,0.96)");
    grad.addColorStop(0.34, "rgba(170,185,205,0.98)");
    grad.addColorStop(0.55, "rgba(85,98,114,0.98)");
    grad.addColorStop(0.78, "rgba(30,36,44,0.98)");
    grad.addColorStop(1.0, "rgba(10,12,16,0.98)");

    context.fillStyle = grad;
    context.beginPath();
    context.arc(cx, cy, r, 0, Math.PI * 2);
    context.fill();

    // Clip and add a bright "environment reflection" band
    context.save();
    context.beginPath();
    context.arc(cx, cy, r, 0, Math.PI * 2);
    context.clip();

    const bandY = cy - r * 0.10;
    const band = context.createLinearGradient(cx - r, bandY - r * 0.25, cx + r, bandY + r * 0.25);
    band.addColorStop(0.0, "rgba(255,255,255,0.00)");
    band.addColorStop(0.18, "rgba(255,255,255,0.10)");
    band.addColorStop(0.40, "rgba(255,255,255,0.40)");
    band.addColorStop(0.55, "rgba(255,255,255,0.24)");
    band.addColorStop(0.72, "rgba(255,255,255,0.06)");
    band.addColorStop(1.0, "rgba(255,255,255,0.00)");
    context.fillStyle = band;
    context.fillRect(cx - r * 1.2, bandY - r * 0.55, r * 2.4, r * 1.1);

    // Small neon-tinted specular pop
    const pop = context.createRadialGradient(cx - r * 0.30, cy - r * 0.36, 1, cx - r * 0.30, cy - r * 0.36, r * 0.55);
    pop.addColorStop(0.0, "rgba(102,255,242,0.22)");
    pop.addColorStop(0.55, "rgba(102,255,242,0.08)");
    pop.addColorStop(1.0, "rgba(102,255,242,0.00)");
    context.fillStyle = pop;
    context.beginPath();
    context.arc(cx - r * 0.25, cy - r * 0.30, r * 0.58, 0, Math.PI * 2);
    context.fill();

    context.restore();

    // Outline
    context.strokeStyle = "rgba(255,255,255,0.22)";
    context.lineWidth = 1;
    context.beginPath();
    context.arc(cx, cy, r, 0, Math.PI * 2);
    context.stroke();
  }

  function drawCradle() {
    const w = state.width;
    const h = state.height;

    context.save();
    context.lineCap = "round";

    const beamY = balls[0]?.pivot.y ?? 50;
    const baseY = Math.min(h - 92, beamY + (balls[0]?.length ?? 240) + settings.ballRadius * 1.35);

    // Pseudo-3D frame points
    const frameLeft = state.layout.frameLeft || w * 0.22;
    const frameRight = state.layout.frameRight || w * 0.78;
    const topY = beamY;
    const bottomY = baseY + 18;

    const zFront = -view.frameDepth / 2;
    const zBack = view.frameDepth / 2;

    const A = projectPoint(frameLeft, topY, zFront); // front-left top
    const B = projectPoint(frameRight, topY, zFront); // front-right top
    const C = projectPoint(frameRight, topY, zBack); // back-right top
    const D = projectPoint(frameLeft, topY, zBack); // back-left top

    const A2 = projectPoint(frameLeft, bottomY, zFront);
    const B2 = projectPoint(frameRight, bottomY, zFront);
    const C2 = projectPoint(frameRight, bottomY, zBack);
    const D2 = projectPoint(frameLeft, bottomY, zBack);

    // Base plate (dark) in perspective
    context.fillStyle = "rgba(0,0,0,0.42)";
    context.beginPath();
    context.moveTo(A2.x, A2.y);
    context.lineTo(B2.x, B2.y);
    context.lineTo(C2.x, C2.y);
    context.lineTo(D2.x, D2.y);
    context.closePath();
    context.fill();

    // Back bar (draw first)
    context.strokeStyle = "rgba(102,255,242,0.20)";
    context.lineWidth = 7;
    context.beginPath();
    context.moveTo(D.x, D.y);
    context.lineTo(C.x, C.y);
    context.stroke();
    context.strokeStyle = "rgba(255,255,255,0.55)";
    context.lineWidth = 2.2;
    context.beginPath();
    context.moveTo(D.x, D.y);
    context.lineTo(C.x, C.y);
    context.stroke();

    // Legs (back first)
    context.strokeStyle = "rgba(255,255,255,0.34)";
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(D.x, D.y);
    context.lineTo(D2.x, D2.y);
    context.moveTo(C.x, C.y);
    context.lineTo(C2.x, C2.y);
    context.stroke();

    // Back strings (one line per ball, anchored on back bar)
    const stringSepX = 16;
    for (const ball of balls) {
      const bobP = projectPoint(ball.bob.x, ball.bob.y, 0);
      const capP = { x: bobP.x, y: bobP.y - settings.ballRadius * 0.92 };

      const anchorBack = projectPoint(ball.pivot.x + stringSepX * 0.5, ball.pivot.y, zBack);
      context.strokeStyle = "rgba(255,255,255,0.38)";
      context.lineWidth = 1.2;
      context.beginPath();
      context.moveTo(anchorBack.x, anchorBack.y);
      context.lineTo(capP.x, capP.y);
      context.stroke();
    }

    // Balls
    for (const ball of balls) {
      const bobP = projectPoint(ball.bob.x, ball.bob.y, 0);
      drawChromeBall(bobP.x, bobP.y, settings.ballRadius);

      // tiny top connector/cap
      context.fillStyle = "rgba(215,225,235,0.86)";
      context.strokeStyle = "rgba(0,0,0,0.22)";
      context.lineWidth = 1;
      const capW = settings.ballRadius * 0.78;
      const capH = settings.ballRadius * 0.32;
      const capX = bobP.x - capW / 2;
      const capY = bobP.y - settings.ballRadius - capH * 0.35;
      context.beginPath();
      context.roundRect(capX, capY, capW, capH, 4);
      context.fill();
      context.stroke();
    }

    // Front strings
    for (const ball of balls) {
      const bobP = projectPoint(ball.bob.x, ball.bob.y, 0);
      const capP = { x: bobP.x, y: bobP.y - settings.ballRadius * 0.92 };

      const anchorFront = projectPoint(ball.pivot.x - stringSepX * 0.5, ball.pivot.y, zFront);
      context.strokeStyle = "rgba(255,255,255,0.64)";
      context.lineWidth = 1.45;
      context.beginPath();
      context.moveTo(anchorFront.x, anchorFront.y);
      context.lineTo(capP.x, capP.y);
      context.stroke();
    }

    // Front bar + legs (draw last)
    context.strokeStyle = "rgba(102,255,242,0.26)";
    context.lineWidth = 8;
    context.beginPath();
    context.moveTo(A.x, A.y);
    context.lineTo(B.x, B.y);
    context.stroke();
    context.strokeStyle = "rgba(255,255,255,0.70)";
    context.lineWidth = 2.7;
    context.beginPath();
    context.moveTo(A.x, A.y);
    context.lineTo(B.x, B.y);
    context.stroke();

    context.strokeStyle = "rgba(255,255,255,0.52)";
    context.lineWidth = 4.8;
    context.beginPath();
    context.moveTo(A.x, A.y);
    context.lineTo(A2.x, A2.y);
    context.moveTo(B.x, B.y);
    context.lineTo(B2.x, B2.y);
    context.stroke();

    // Base edge (front)
    context.strokeStyle = "rgba(255,231,101,0.18)";
    context.lineWidth = 10;
    context.beginPath();
    context.moveTo(A2.x, A2.y);
    context.lineTo(B2.x, B2.y);
    context.stroke();
    context.strokeStyle = "rgba(255,255,255,0.50)";
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(A2.x, A2.y);
    context.lineTo(B2.x, B2.y);
    context.stroke();

    context.restore();
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));

    state.dpr = dpr;
    state.width = Math.max(1, Math.round(rect.width * dpr));
    state.height = Math.max(1, Math.round(rect.height * dpr));
    canvas.width = state.width;
    canvas.height = state.height;

    resetSystem();
  }

  function tick(timestampMs) {
    if (!state.lastTimestampMs) state.lastTimestampMs = timestampMs;
    const rawDt = (timestampMs - state.lastTimestampMs) / 1000;
    state.lastTimestampMs = timestampMs;

    // Clamp dt to keep things stable when tab is backgrounded.
    const dt = clamp(rawDt, 0, 1 / 30);

    if (state.dragMode === "rotate") {
      const dx = state.pointerX - state.rotateStartX;
      const sensitivity = 0.012; // rad per CSS px (after dpr scaling, canvas coords)
      view.yaw = state.rotateStartYaw + dx * sensitivity;
    } else if (state.dragMode === "ball" && state.draggingIndex !== null) {
      // Clear previous drag-held set; we'll rebuild it below.
      for (const idx of state.heldByDrag) {
        if (idx !== state.draggingIndex) balls[idx].isHeld = false;
      }
      state.heldByDrag = [];

      const ball = balls[state.draggingIndex];
      const world = screenToWorldAtZ0(state.pointerX, state.pointerY);
      const dx = world.x - ball.pivot.x;
      const dy = world.y - ball.pivot.y;
      const angle = Math.atan2(dx, dy);
      ball.isHeld = true;
      ball.setAngle(angle);
      ball.recomputeBob();

      enforceNoPassingDuringDrag(state.draggingIndex);
    }

    for (const b of balls) b.update(dt);
    resolveCollisions();

    drawBackground();
    drawCradle();

    window.requestAnimationFrame(tick);
  }

  function findBallIndexNear(x, y) {
    const r = settings.ballRadius * 1.4;
    const rSq = r * r;
    let best = null;
    let bestDist = Infinity;
    for (const b of balls) {
      const p = projectPoint(b.bob.x, b.bob.y, 0);
      const dx = x - p.x;
      const dy = y - p.y;
      const dSq = dx * dx + dy * dy;
      if (dSq <= rSq && dSq < bestDist) {
        best = b.index;
        bestDist = dSq;
      }
    }
    return best;
  }

  function onPointerDown(event) {
    const point = deviceToCanvasPoint(event.clientX, event.clientY);
    state.pointerX = point.x;
    state.pointerY = point.y;

    const hit = findBallIndexNear(point.x, point.y);
    state.pointerId = event.pointerId;
    canvas.setPointerCapture(event.pointerId);

    if (hit !== null) {
      state.dragMode = "ball";
      state.draggingIndex = hit;
      balls[hit].isHeld = true;
      state.heldByDrag = [hit];
    } else {
      state.dragMode = "rotate";
      state.draggingIndex = null;
      state.heldByDrag = [];
      state.rotateStartX = point.x;
      state.rotateStartYaw = view.yaw;
    }
  }

  function onPointerMove(event) {
    if (state.pointerId !== event.pointerId) return;
    const point = deviceToCanvasPoint(event.clientX, event.clientY);
    state.pointerX = point.x;
    state.pointerY = point.y;
  }

  function endDrag(event) {
    if (state.pointerId !== event.pointerId) return;
    if (state.dragMode === "ball") {
      for (const idx of state.heldByDrag) {
        balls[idx].isHeld = false;
        balls[idx].angleVelocity = 0;
      }
    }
    state.draggingIndex = null;
    state.pointerId = null;
    state.heldByDrag = [];
    state.dragMode = null;
  }

  function init() {
    resize();
    window.addEventListener("resize", () => resize());

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);

    window.requestAnimationFrame(tick);
  }

  init();
})();
