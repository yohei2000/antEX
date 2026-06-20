const canvas = document.querySelector("#world");
const ctx = canvas.getContext("2d");

const ui = {
  buttons: [...document.querySelectorAll(".tool-button")],
  pause: document.querySelector("#pauseBtn"),
  reset: document.querySelector("#resetBtn"),
  antCount: document.querySelector("#antCount"),
  antCountValue: document.querySelector("#antCountValue"),
  intensity: document.querySelector("#intensity"),
  intensityValue: document.querySelector("#intensityValue"),
  speed: document.querySelector("#speed"),
  speedValue: document.querySelector("#speedValue"),
  statExplore: document.querySelector("#statExplore"),
  statPanic: document.querySelector("#statPanic"),
  statRescue: document.querySelector("#statRescue"),
  statFood: document.querySelector("#statFood"),
  inspector: document.querySelector("#inspector"),
  log: document.querySelector("#eventLog"),
};

const ROLE_LABELS = {
  scout: "斥候",
  worker: "運搬",
  nurse: "世話",
  guard: "警戒",
};

const STATE_LABELS = {
  explore: "探索",
  return: "帰巣",
  panic: "避難",
  wet: "乾燥待ち",
  stunned: "停止",
  rescue: "救助",
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const rand = (min, max) => min + Math.random() * (max - min);
const chance = (p) => Math.random() < p;
const normAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

function nearestPointOnSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const lengthSq = vx * vx + vy * vy || 1;
  const t = clamp(((px - ax) * vx + (py - ay) * vy) / lengthSq, 0, 1);
  return { x: ax + vx * t, y: ay + vy * t, t };
}

function seededNoise(seed) {
  const x = Math.sin(seed * 999.17) * 43758.5453;
  return x - Math.floor(x);
}

class Ant {
  constructor(id, sim, nearNest = true) {
    this.id = id;
    this.role = this.pickRole();
    const spread = nearNest ? sim.nest.radius * rand(0.25, 1.1) : rand(60, Math.max(sim.width, sim.height));
    const angle = rand(0, Math.PI * 2);
    this.x = sim.nest.x + Math.cos(angle) * spread;
    this.y = sim.nest.y + Math.sin(angle) * spread;
    this.angle = rand(0, Math.PI * 2);
    this.turnBias = rand(-0.55, 0.55);
    this.speedBase = rand(30, 56);
    this.state = "explore";
    this.stateTime = 0;
    this.wander = rand(0, Math.PI * 2);
    this.carrying = 0;
    this.wet = 0;
    this.stun = 0;
    this.energy = rand(0.5, 1);
    this.target = null;
    this.rescueTarget = null;
    this.lastTrail = 0;
    this.homeTimer = rand(0, 9);
    this.traits = {
      curiosity: rand(0.25, 1),
      caution: rand(0.15, 1),
      social: rand(0.15, 1),
      persistence: rand(0.25, 1),
    };

    if (this.role === "scout") {
      this.traits.curiosity = clamp(this.traits.curiosity + 0.24, 0, 1);
      this.speedBase += 8;
    } else if (this.role === "nurse") {
      this.traits.social = clamp(this.traits.social + 0.28, 0, 1);
      this.traits.caution = clamp(this.traits.caution + 0.14, 0, 1);
    } else if (this.role === "guard") {
      this.traits.caution = clamp(this.traits.caution + 0.24, 0, 1);
      this.traits.persistence = clamp(this.traits.persistence + 0.16, 0, 1);
    }
  }

  pickRole() {
    const roll = Math.random();
    if (roll < 0.2) return "scout";
    if (roll < 0.72) return "worker";
    if (roll < 0.9) return "nurse";
    return "guard";
  }

  update(dt, sim) {
    this.stateTime += dt;
    this.energy = clamp(this.energy + dt * 0.015, 0, 1);
    this.wet = Math.max(0, this.wet - dt * 0.12);
    this.lastTrail += dt;

    const sensed = this.sense(sim);

    if (sensed.waterDepth > 0.08) {
      this.wet = clamp(this.wet + sensed.waterDepth * dt * 2.2, 0, 1.7);
      if (this.state !== "rescue") {
        this.setState(sensed.waterDepth > 0.64 && chance(0.035 + this.wet * 0.02) ? "stunned" : "panic");
      }
    }

    if (sensed.alarm > 0.72 && this.state === "explore" && chance(0.04 + this.traits.caution * 0.04)) {
      this.setState("panic");
    }

    if (this.stun > 0) {
      this.stun -= dt;
      this.state = "stunned";
      this.jitter(dt, sim);
      if (this.stun <= 0 && this.wet < 0.75) this.setState("wet");
      return;
    }

    if (this.state === "stunned") {
      this.stun = rand(1.1, 2.8);
      return;
    }

    if (this.state !== "rescue") {
      const rescueCandidate = sim.findRescueCandidate(this);
      if (rescueCandidate && this.traits.social > 0.58 && chance(dt * (0.9 + this.traits.social))) {
        this.rescueTarget = rescueCandidate;
        this.setState("rescue");
      }
    }

    const steering = { x: 0, y: 0 };
    this.addSeparation(steering, sim);
    this.addObstacleAvoidance(steering, sim);

    if (sensed.hazard.x || sensed.hazard.y) {
      steering.x += sensed.hazard.x * (1.25 + this.traits.caution);
      steering.y += sensed.hazard.y * (1.25 + this.traits.caution);
    }

    if (this.state === "panic") {
      this.updatePanic(dt, sim, steering, sensed);
    } else if (this.state === "wet") {
      this.updateWet(dt, sim, steering);
    } else if (this.state === "return") {
      this.updateReturn(dt, sim, steering);
    } else if (this.state === "rescue") {
      this.updateRescue(dt, sim, steering);
    } else {
      this.updateExplore(dt, sim, steering, sensed);
    }

    this.move(dt, sim, steering);
    this.leaveTrail(sim);
  }

  setState(nextState) {
    if (this.state !== nextState) {
      this.state = nextState;
      this.stateTime = 0;
    }
  }

  sense(sim) {
    const hazard = { x: 0, y: 0 };
    let waterDepth = 0;
    let alarm = 0;
    let closestFood = null;
    let foodDistance = Infinity;

    for (const water of sim.water) {
      const d = dist(this.x, this.y, water.x, water.y);
      const reach = water.radius + 38;
      if (d < reach) {
        const strength = (1 - d / reach) * water.power;
        const nx = (this.x - water.x) / (d || 1);
        const ny = (this.y - water.y) / (d || 1);
        hazard.x += nx * strength * 1.7;
        hazard.y += ny * strength * 1.7;
        if (d < water.radius) waterDepth = Math.max(waterDepth, (1 - d / water.radius) * water.power);
      }
    }

    for (const object of sim.objects) {
      const d = dist(this.x, this.y, object.x, object.y);
      const reach = object.radius + 62;
      if (d < reach) {
        const strength = 1 - d / reach;
        const nx = (this.x - object.x) / (d || 1);
        const ny = (this.y - object.y) / (d || 1);
        hazard.x += nx * strength * 1.35;
        hazard.y += ny * strength * 1.35;
      }
      if (object.shock > 0 && d < object.radius + object.shock * 150) {
        alarm = Math.max(alarm, object.shock * (1 - d / (object.radius + object.shock * 150)));
      }
    }

    for (const branch of sim.branches) {
      const p = nearestPointOnSegment(this.x, this.y, branch.x1, branch.y1, branch.x2, branch.y2);
      const d = dist(this.x, this.y, p.x, p.y);
      const reach = branch.width + 34;
      if (d < reach) {
        const strength = 1 - d / reach;
        hazard.x += ((this.x - p.x) / (d || 1)) * strength * 1.3;
        hazard.y += ((this.y - p.y) / (d || 1)) * strength * 1.3;
      }
    }

    for (const trail of sim.trails) {
      if (trail.kind !== "alarm") continue;
      const d = dist(this.x, this.y, trail.x, trail.y);
      if (d < 54) {
        const strength = trail.life * (1 - d / 54);
        alarm = Math.max(alarm, strength);
        hazard.x += ((this.x - trail.x) / (d || 1)) * strength * 0.8;
        hazard.y += ((this.y - trail.y) / (d || 1)) * strength * 0.8;
      }
    }

    for (const food of sim.food) {
      if (food.amount <= 0) continue;
      const d = dist(this.x, this.y, food.x, food.y);
      if (d < foodDistance) {
        foodDistance = d;
        closestFood = food;
      }
    }

    return { hazard, waterDepth, alarm, closestFood, foodDistance };
  }

  updateExplore(dt, sim, steering, sensed) {
    this.homeTimer += dt;
    const foodPull = this.foodPull(sim, sensed.closestFood, sensed.foodDistance);
    steering.x += foodPull.x;
    steering.y += foodPull.y;

    if (sensed.closestFood && sensed.foodDistance < sensed.closestFood.radius + 6 && this.role !== "guard") {
      this.carrying = Math.min(1, sensed.closestFood.amount);
      sensed.closestFood.amount -= this.carrying * 0.65;
      sim.foodHits += 1;
      this.setState("return");
      sim.log(`個体 ${this.id} が餌を見つけた`);
      return;
    }

    if (this.homeTimer > 9 + this.traits.persistence * 8 || this.energy < 0.22) {
      this.setState("return");
      this.carrying = 0;
      this.homeTimer = 0;
      return;
    }

    this.wander += (Math.random() - 0.5) * dt * (3.2 + this.traits.curiosity * 3.4) + this.turnBias * dt;
    steering.x += Math.cos(this.wander) * (0.55 + this.traits.curiosity * 0.45);
    steering.y += Math.sin(this.wander) * (0.55 + this.traits.curiosity * 0.45);

    const homeD = dist(this.x, this.y, sim.nest.x, sim.nest.y);
    if (homeD > Math.max(sim.width, sim.height) * 0.42) {
      steering.x += ((sim.nest.x - this.x) / homeD) * 0.65;
      steering.y += ((sim.nest.y - this.y) / homeD) * 0.65;
    }
  }

  foodPull(sim, closestFood, foodDistance) {
    const pull = { x: 0, y: 0 };
    if (closestFood && foodDistance < 175 + this.traits.curiosity * 85) {
      const strength = (1 - foodDistance / 260) * (0.75 + this.traits.curiosity);
      pull.x += ((closestFood.x - this.x) / (foodDistance || 1)) * strength;
      pull.y += ((closestFood.y - this.y) / (foodDistance || 1)) * strength;
    }

    let bestTrail = null;
    let bestScore = 0;
    const start = Math.max(0, sim.trails.length - 420);
    for (let i = start; i < sim.trails.length; i += 1) {
      const trail = sim.trails[i];
      if (trail.kind !== "food") continue;
      const d = dist(this.x, this.y, trail.x, trail.y);
      if (d < 82) {
        const score = trail.life * (1 - d / 82);
        if (score > bestScore) {
          bestScore = score;
          bestTrail = trail;
        }
      }
    }
    if (bestTrail) {
      const d = dist(this.x, this.y, bestTrail.x, bestTrail.y) || 1;
      pull.x += ((bestTrail.x - this.x) / d) * bestScore * 0.65;
      pull.y += ((bestTrail.y - this.y) / d) * bestScore * 0.65;
    }
    return pull;
  }

  updateReturn(dt, sim, steering) {
    const d = dist(this.x, this.y, sim.nest.x, sim.nest.y) || 1;
    steering.x += ((sim.nest.x - this.x) / d) * (1.5 + this.traits.persistence);
    steering.y += ((sim.nest.y - this.y) / d) * (1.5 + this.traits.persistence);
    this.energy = clamp(this.energy - dt * 0.025, 0, 1);

    if (d < sim.nest.radius * 0.72) {
      if (this.carrying > 0) {
        sim.collectedFood += this.carrying;
        sim.log(`個体 ${this.id} が餌を巣へ運んだ`);
      }
      this.carrying = 0;
      this.energy = 1;
      this.setState("explore");
      this.homeTimer = 0;
    }
  }

  updatePanic(dt, sim, steering, sensed) {
    const homeD = dist(this.x, this.y, sim.nest.x, sim.nest.y) || 1;
    steering.x += ((sim.nest.x - this.x) / homeD) * this.traits.caution * 0.32;
    steering.y += ((sim.nest.y - this.y) / homeD) * this.traits.caution * 0.32;
    this.wander += (Math.random() - 0.5) * dt * 10;
    steering.x += Math.cos(this.wander) * 0.7;
    steering.y += Math.sin(this.wander) * 0.7;
    if (this.lastTrail > 0.2) {
      sim.addTrail(this.x, this.y, "alarm", 0.85);
      this.lastTrail = 0;
    }
    if (this.stateTime > 1.2 + this.traits.caution * 2.4 && sensed.waterDepth < 0.08) {
      this.setState(this.wet > 0.35 ? "wet" : "explore");
    }
  }

  updateWet(dt, sim, steering) {
    const d = dist(this.x, this.y, sim.nest.x, sim.nest.y) || 1;
    steering.x += ((sim.nest.x - this.x) / d) * 0.65;
    steering.y += ((sim.nest.y - this.y) / d) * 0.65;
    this.wander += (Math.random() - 0.5) * dt * 2.3;
    steering.x += Math.cos(this.wander) * 0.35;
    steering.y += Math.sin(this.wander) * 0.35;
    if (this.wet < 0.18 && this.stateTime > 1.4) this.setState("explore");
  }

  updateRescue(dt, sim, steering) {
    const target = this.rescueTarget;
    if (!target || target.stun <= 0 || target === this) {
      this.rescueTarget = null;
      this.setState("explore");
      return;
    }

    const d = dist(this.x, this.y, target.x, target.y) || 1;
    if (d > 13) {
      steering.x += ((target.x - this.x) / d) * 2.1;
      steering.y += ((target.y - this.y) / d) * 2.1;
    } else {
      const homeD = dist(target.x, target.y, sim.nest.x, sim.nest.y) || 1;
      const pullX = ((sim.nest.x - target.x) / homeD) * 28;
      const pullY = ((sim.nest.y - target.y) / homeD) * 28;
      target.x += pullX * dt;
      target.y += pullY * dt;
      target.wet = Math.max(0, target.wet - dt * 0.32);
      target.stun = Math.max(0, target.stun - dt * (0.45 + this.traits.social * 0.55));
      steering.x += -pullX * 0.02;
      steering.y += -pullY * 0.02;
      if (this.lastTrail > 0.38) {
        sim.addTrail(this.x, this.y, "rescue", 0.8);
        this.lastTrail = 0;
      }
    }

    if (this.stateTime > 7) {
      this.rescueTarget = null;
      this.setState("explore");
    }
  }

  addSeparation(steering, sim) {
    let sx = 0;
    let sy = 0;
    let count = 0;
    for (const other of sim.ants) {
      if (other === this) continue;
      const d = dist(this.x, this.y, other.x, other.y);
      if (d > 0 && d < 9) {
        sx += (this.x - other.x) / d;
        sy += (this.y - other.y) / d;
        count += 1;
      }
    }
    if (count) {
      steering.x += (sx / count) * 0.6;
      steering.y += (sy / count) * 0.6;
    }
  }

  addObstacleAvoidance(steering, sim) {
    for (const object of sim.objects) {
      const d = dist(this.x, this.y, object.x, object.y);
      if (d < object.radius + 4) {
        const nx = (this.x - object.x) / (d || 1);
        const ny = (this.y - object.y) / (d || 1);
        this.x = object.x + nx * (object.radius + 4);
        this.y = object.y + ny * (object.radius + 4);
        steering.x += nx * 1.4;
        steering.y += ny * 1.4;
      }
    }

    for (const branch of sim.branches) {
      const p = nearestPointOnSegment(this.x, this.y, branch.x1, branch.y1, branch.x2, branch.y2);
      const d = dist(this.x, this.y, p.x, p.y);
      if (d < branch.width + 3) {
        const nx = (this.x - p.x) / (d || 1);
        const ny = (this.y - p.y) / (d || 1);
        this.x = p.x + nx * (branch.width + 3);
        this.y = p.y + ny * (branch.width + 3);
        steering.x += nx * 1.2;
        steering.y += ny * 1.2;
      }
    }
  }

  move(dt, sim, steering) {
    const magnitude = Math.hypot(steering.x, steering.y);
    if (magnitude > 0.001) {
      const targetAngle = Math.atan2(steering.y, steering.x);
      const turnRate = (this.state === "panic" ? 9 : 4.8) * dt;
      this.angle += clamp(normAngle(targetAngle - this.angle), -turnRate, turnRate);
    } else {
      this.angle += (Math.random() - 0.5) * dt * 1.2;
    }

    let speed = this.speedBase;
    if (this.state === "panic") speed *= 1.45;
    if (this.state === "return") speed *= 1.12;
    if (this.state === "rescue") speed *= 0.94;
    if (this.state === "wet") speed *= 0.58;
    if (this.carrying > 0) speed *= 0.74;
    speed *= clamp(1 - this.wet * 0.28, 0.35, 1);
    speed *= sim.timeScale;

    this.x += Math.cos(this.angle) * speed * dt;
    this.y += Math.sin(this.angle) * speed * dt;

    const margin = 18;
    if (this.x < margin || this.x > sim.width - margin) {
      this.angle = Math.PI - this.angle;
      this.x = clamp(this.x, margin, sim.width - margin);
    }
    if (this.y < margin || this.y > sim.height - margin) {
      this.angle = -this.angle;
      this.y = clamp(this.y, margin, sim.height - margin);
    }
  }

  jitter(dt, sim) {
    this.x += Math.cos(this.angle + rand(-1.4, 1.4)) * dt * 4;
    this.y += Math.sin(this.angle + rand(-1.4, 1.4)) * dt * 4;
    this.x = clamp(this.x, 16, sim.width - 16);
    this.y = clamp(this.y, 16, sim.height - 16);
  }

  leaveTrail(sim) {
    if (this.state === "return" && this.carrying > 0 && this.lastTrail > 0.24) {
      sim.addTrail(this.x, this.y, "food", 0.9);
      this.lastTrail = 0;
    } else if (this.state === "wet" && this.lastTrail > 0.45) {
      sim.addTrail(this.x, this.y, "water", 0.45);
      this.lastTrail = 0;
    }
  }

  shock(strength) {
    if (strength > 0.82 && chance(0.28 + this.traits.caution * 0.18)) {
      this.stun = rand(0.8, 2.8) * strength;
      this.setState("stunned");
    } else if (strength > 0.18) {
      this.setState("panic");
    }
  }
}

class Simulation {
  constructor() {
    this.width = 1;
    this.height = 1;
    this.dpr = 1;
    this.ants = [];
    this.water = [];
    this.objects = [];
    this.food = [];
    this.branches = [];
    this.trails = [];
    this.ground = [];
    this.tool = "inspect";
    this.pointer = { down: false, x: 0, y: 0, lastX: 0, lastY: 0 };
    this.branchDraft = null;
    this.paused = false;
    this.timeScale = 1;
    this.collectedFood = 0;
    this.foodHits = 0;
    this.selectedAnt = null;
    this.lastFrame = performance.now();
    this.lastUi = 0;
    this.nest = { x: 0, y: 0, radius: 54 };

    this.resize();
    this.reset();
    this.bindEvents();
    requestAnimationFrame((time) => this.frame(time));
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(this.width * this.dpr);
    canvas.height = Math.floor(this.height * this.dpr);
    canvas.style.width = `${this.width}px`;
    canvas.style.height = `${this.height}px`;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.nest = {
      x: this.width * (this.width < 780 ? 0.42 : 0.34),
      y: this.height * (this.width < 780 ? 0.55 : 0.58),
      radius: clamp(Math.min(this.width, this.height) * 0.075, 38, 66),
    };
    this.makeGround();
  }

  reset() {
    this.water = [];
    this.objects = [];
    this.food = [];
    this.branches = [];
    this.trails = [];
    this.collectedFood = 0;
    this.foodHits = 0;
    this.selectedAnt = null;
    this.ants = [];
    const count = Number(ui.antCount.value);
    for (let i = 0; i < count; i += 1) this.ants.push(new Ant(i + 1, this));
    this.log("群れを再生成した");
    this.updateInspector();
  }

  makeGround() {
    this.ground = [];
    const count = Math.floor((this.width * this.height) / 7200);
    for (let i = 0; i < count; i += 1) {
      this.ground.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        r: rand(0.4, 1.8),
        tone: rand(0, 1),
      });
    }
  }

  bindEvents() {
    window.addEventListener("resize", () => this.resize());

    ui.buttons.forEach((button) => {
      button.addEventListener("click", () => {
        this.tool = button.dataset.tool;
        ui.buttons.forEach((item) => item.classList.toggle("active", item === button));
      });
    });

    ui.pause.addEventListener("click", () => {
      this.paused = !this.paused;
      ui.pause.classList.toggle("is-paused", this.paused);
      ui.pause.title = this.paused ? "再開" : "一時停止";
      ui.pause.setAttribute("aria-label", ui.pause.title);
    });

    ui.reset.addEventListener("click", () => this.reset());
    ui.antCount.addEventListener("input", () => {
      ui.antCountValue.value = ui.antCount.value;
    });
    ui.antCount.addEventListener("change", () => this.reset());
    ui.intensity.addEventListener("input", () => {
      ui.intensityValue.value = ui.intensity.value;
    });
    ui.speed.addEventListener("input", () => {
      const speed = Number(ui.speed.value);
      this.timeScale = speed;
      ui.speedValue.value = speed.toFixed(1);
    });

    canvas.addEventListener("pointerdown", (event) => this.onPointerDown(event));
    canvas.addEventListener("pointermove", (event) => this.onPointerMove(event));
    canvas.addEventListener("pointerup", (event) => this.onPointerUp(event));
    canvas.addEventListener("pointercancel", (event) => this.onPointerUp(event));
  }

  frame(time) {
    const dt = Math.min((time - this.lastFrame) / 1000, 0.05);
    this.lastFrame = time;
    if (!this.paused) this.update(dt);
    this.draw();
    requestAnimationFrame((next) => this.frame(next));
  }

  update(dt) {
    for (const water of this.water) {
      water.age += dt;
      water.power = Math.max(0.08, water.power - dt * 0.018);
      water.radius += dt * 1.2;
    }
    this.water = this.water.filter((water) => water.power > 0.09 && water.age < 80);

    for (const object of this.objects) object.shock = Math.max(0, object.shock - dt * 0.75);
    for (const branch of this.branches) branch.age += dt;
    for (const food of this.food) food.age += dt;
    this.food = this.food.filter((food) => food.amount > 0.06);

    for (const trail of this.trails) trail.life -= dt * trail.decay;
    this.trails = this.trails.filter((trail) => trail.life > 0.02).slice(-1100);

    for (const ant of this.ants) ant.update(dt, this);
    this.lastUi += dt;
    if (this.lastUi > 0.15) {
      this.updateStats();
      this.updateInspector();
      this.lastUi = 0;
    }
  }

  onPointerDown(event) {
    const point = this.pointerPoint(event);
    this.pointer = { down: true, x: point.x, y: point.y, lastX: point.x, lastY: point.y };
    canvas.setPointerCapture(event.pointerId);
    if (this.tool === "inspect") {
      this.selectAnt(point.x, point.y);
    } else if (this.tool === "water") {
      this.addWater(point.x, point.y, 1);
    } else if (this.tool === "stone") {
      this.addStone(point.x, point.y);
    } else if (this.tool === "food") {
      this.addFood(point.x, point.y);
    } else if (this.tool === "branch") {
      this.branchDraft = { x1: point.x, y1: point.y, x2: point.x, y2: point.y };
    } else if (this.tool === "eraser") {
      this.eraseAt(point.x, point.y);
    }
  }

  onPointerMove(event) {
    const point = this.pointerPoint(event);
    this.pointer.lastX = this.pointer.x;
    this.pointer.lastY = this.pointer.y;
    this.pointer.x = point.x;
    this.pointer.y = point.y;

    if (!this.pointer.down) {
      if (this.tool === "inspect") this.hoverAnt(point.x, point.y);
      return;
    }

    if (this.tool === "water" && dist(point.x, point.y, this.pointer.lastX, this.pointer.lastY) > 12) {
      this.addWater(point.x, point.y, 0.75);
    } else if (this.tool === "branch" && this.branchDraft) {
      this.branchDraft.x2 = point.x;
      this.branchDraft.y2 = point.y;
    } else if (this.tool === "eraser") {
      this.eraseAt(point.x, point.y);
    }
  }

  onPointerUp(event) {
    const point = this.pointerPoint(event);
    if (this.tool === "branch" && this.branchDraft) {
      this.branchDraft.x2 = point.x;
      this.branchDraft.y2 = point.y;
      if (dist(this.branchDraft.x1, this.branchDraft.y1, this.branchDraft.x2, this.branchDraft.y2) > 24) {
        this.addBranch(this.branchDraft);
      }
      this.branchDraft = null;
    }
    this.pointer.down = false;
  }

  pointerPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  addWater(x, y, scale = 1) {
    const intensity = Number(ui.intensity.value);
    this.water.push({
      x,
      y,
      radius: rand(24, 34) + intensity * 8 * scale,
      power: clamp(0.42 + intensity * 0.14 * scale, 0.35, 1.05),
      age: 0,
      seed: Math.random() * 1000,
    });
    if (chance(0.28)) this.log("水で隊列が分断された");
  }

  addStone(x, y) {
    const intensity = Number(ui.intensity.value);
    const radius = 18 + intensity * 7 + rand(-3, 5);
    const object = {
      x,
      y,
      radius,
      shock: 1,
      seed: Math.random() * 1000,
      verts: Array.from({ length: 9 }, (_, index) => {
        const a = (index / 9) * Math.PI * 2;
        return { a, r: radius * rand(0.72, 1.08) };
      }),
    };
    this.objects.push(object);
    let affected = 0;
    for (const ant of this.ants) {
      const d = dist(ant.x, ant.y, x, y);
      if (d < radius + 120) {
        ant.shock((1 - d / (radius + 120)) * (0.8 + intensity * 0.12));
        affected += 1;
      }
    }
    this.log(`落下物で ${affected} 匹が反応した`);
  }

  addFood(x, y) {
    const amount = 8 + Number(ui.intensity.value) * 4;
    this.food.push({
      x,
      y,
      radius: 20 + Number(ui.intensity.value) * 3,
      amount,
      initialAmount: amount,
      age: 0,
      seed: Math.random() * 1000,
    });
    this.log("餌に探索個体が集まり始めた");
  }

  addBranch(branch) {
    this.branches.push({
      ...branch,
      width: 9 + Number(ui.intensity.value) * 1.6,
      age: 0,
      seed: Math.random() * 1000,
    });
    this.log("枝で経路が変わった");
  }

  eraseAt(x, y) {
    const r = 42;
    this.water = this.water.filter((item) => dist(item.x, item.y, x, y) > r + item.radius * 0.4);
    this.objects = this.objects.filter((item) => dist(item.x, item.y, x, y) > r + item.radius * 0.4);
    this.food = this.food.filter((item) => dist(item.x, item.y, x, y) > r + item.radius * 0.4);
    this.branches = this.branches.filter((item) => {
      const p = nearestPointOnSegment(x, y, item.x1, item.y1, item.x2, item.y2);
      return dist(x, y, p.x, p.y) > r + item.width;
    });
  }

  addTrail(x, y, kind, strength) {
    this.trails.push({
      x,
      y,
      kind,
      life: strength,
      decay: kind === "food" ? 0.055 : kind === "alarm" ? 0.34 : 0.16,
    });
  }

  findRescueCandidate(helper) {
    let best = null;
    let bestD = Infinity;
    for (const ant of this.ants) {
      if (ant === helper || ant.stun <= 0) continue;
      const d = dist(helper.x, helper.y, ant.x, ant.y);
      if (d < bestD && d < 105) {
        best = ant;
        bestD = d;
      }
    }
    return best;
  }

  selectAnt(x, y) {
    let best = null;
    let bestD = 16;
    for (const ant of this.ants) {
      const d = dist(ant.x, ant.y, x, y);
      if (d < bestD) {
        best = ant;
        bestD = d;
      }
    }
    this.selectedAnt = best;
    this.updateInspector();
  }

  hoverAnt(x, y) {
    if (this.selectedAnt) return;
    let best = null;
    let bestD = 12;
    for (const ant of this.ants) {
      const d = dist(ant.x, ant.y, x, y);
      if (d < bestD) {
        best = ant;
        bestD = d;
      }
    }
    if (best) {
      this.selectedAnt = best;
      this.updateInspector();
      setTimeout(() => {
        if (this.selectedAnt === best && !this.pointer.down) {
          this.selectedAnt = null;
          this.updateInspector();
        }
      }, 900);
    }
  }

  updateStats() {
    let explore = 0;
    let panic = 0;
    let rescue = 0;
    for (const ant of this.ants) {
      if (ant.state === "panic" || ant.state === "wet" || ant.state === "stunned") panic += 1;
      else if (ant.state === "rescue") rescue += 1;
      else explore += 1;
    }
    ui.statExplore.textContent = explore;
    ui.statPanic.textContent = panic;
    ui.statRescue.textContent = rescue;
    ui.statFood.textContent = Math.floor(this.collectedFood);
  }

  updateInspector() {
    const ant = this.selectedAnt;
    if (!ant) {
      ui.inspector.innerHTML = '<span class="muted">未選択</span>';
      return;
    }
    const trait = (label, value) => `
      <div class="trait-row">
        <span>${label}</span>
        <span class="trait-meter" aria-hidden="true"><span style="--value:${Math.round(value * 100)}%"></span></span>
      </div>`;
    ui.inspector.innerHTML = `
      <strong>個体 ${ant.id}</strong> / ${ROLE_LABELS[ant.role]} / ${STATE_LABELS[ant.state]}
      ${trait("好奇心", ant.traits.curiosity)}
      ${trait("警戒心", ant.traits.caution)}
      ${trait("協調性", ant.traits.social)}
      ${trait("粘り", ant.traits.persistence)}
    `;
  }

  log(message) {
    const item = document.createElement("li");
    item.textContent = message;
    ui.log.prepend(item);
    while (ui.log.children.length > 8) ui.log.lastElementChild.remove();
  }

  draw() {
    ctx.clearRect(0, 0, this.width, this.height);
    this.drawGround();
    this.drawTrails();
    this.drawWater();
    this.drawFood();
    this.drawObjects();
    this.drawBranches();
    this.drawNest();
    this.drawAnts();
    this.drawBranchDraft();
  }

  drawGround() {
    const gradient = ctx.createLinearGradient(0, 0, this.width, this.height);
    gradient.addColorStop(0, "#d9c58c");
    gradient.addColorStop(0.45, "#cab073");
    gradient.addColorStop(1, "#b8945b");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);

    for (const speck of this.ground) {
      ctx.beginPath();
      ctx.fillStyle = speck.tone > 0.5 ? "rgba(77, 55, 31, 0.16)" : "rgba(255, 242, 190, 0.16)";
      ctx.arc(speck.x, speck.y, speck.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawNest() {
    const { x, y, radius } = this.nest;
    const nestGradient = ctx.createRadialGradient(x - radius * 0.2, y - radius * 0.24, 4, x, y, radius * 1.15);
    nestGradient.addColorStop(0, "#8f6a39");
    nestGradient.addColorStop(0.75, "#5f462a");
    nestGradient.addColorStop(1, "rgba(50, 33, 18, 0)");
    ctx.fillStyle = nestGradient;
    ctx.beginPath();
    ctx.ellipse(x, y, radius * 1.28, radius * 0.86, -0.12, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(20, 14, 10, 0.5)";
    for (let i = 0; i < 5; i += 1) {
      const a = i * 1.26 + 0.4;
      const hx = x + Math.cos(a) * radius * (0.08 + seededNoise(i + 21) * 0.4);
      const hy = y + Math.sin(a) * radius * (0.04 + seededNoise(i + 37) * 0.28);
      ctx.beginPath();
      ctx.ellipse(hx, hy, radius * 0.12, radius * 0.07, a, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawTrails() {
    for (const trail of this.trails) {
      if (trail.kind === "food") ctx.fillStyle = `rgba(181, 121, 31, ${trail.life * 0.22})`;
      else if (trail.kind === "alarm") ctx.fillStyle = `rgba(178, 74, 53, ${trail.life * 0.22})`;
      else if (trail.kind === "rescue") ctx.fillStyle = `rgba(35, 124, 107, ${trail.life * 0.18})`;
      else ctx.fillStyle = `rgba(45, 139, 184, ${trail.life * 0.16})`;
      ctx.beginPath();
      ctx.arc(trail.x, trail.y, trail.kind === "food" ? 3 : 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawWater() {
    for (const water of this.water) {
      const alpha = clamp(water.power, 0.1, 0.78);
      const gradient = ctx.createRadialGradient(water.x, water.y, water.radius * 0.12, water.x, water.y, water.radius);
      gradient.addColorStop(0, `rgba(102, 185, 219, ${0.32 * alpha})`);
      gradient.addColorStop(0.72, `rgba(45, 139, 184, ${0.26 * alpha})`);
      gradient.addColorStop(1, "rgba(45, 139, 184, 0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.ellipse(
        water.x,
        water.y,
        water.radius * (1.15 + seededNoise(water.seed) * 0.22),
        water.radius * (0.74 + seededNoise(water.seed + 2) * 0.2),
        seededNoise(water.seed + 5) * Math.PI,
        0,
        Math.PI * 2,
      );
      ctx.fill();

      ctx.strokeStyle = `rgba(235, 250, 255, ${0.28 * alpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(water.x, water.y, water.radius * 0.72, water.radius * 0.42, water.age * 0.8, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  drawFood() {
    for (const food of this.food) {
      const remaining = clamp(food.amount / food.initialAmount, 0, 1);
      for (let i = 0; i < 16; i += 1) {
        const seed = food.seed + i * 9.1;
        const a = seededNoise(seed) * Math.PI * 2;
        const r = seededNoise(seed + 1) * food.radius * remaining;
        const x = food.x + Math.cos(a) * r;
        const y = food.y + Math.sin(a) * r;
        ctx.fillStyle = i % 3 === 0 ? "#d7b54f" : "#a96f1d";
        ctx.beginPath();
        ctx.arc(x, y, 2 + seededNoise(seed + 2) * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawObjects() {
    for (const object of this.objects) {
      ctx.save();
      ctx.translate(object.x, object.y);
      ctx.fillStyle = "rgba(30, 33, 27, 0.18)";
      ctx.beginPath();
      ctx.ellipse(5, 7, object.radius * 0.95, object.radius * 0.38, 0.15, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      object.verts.forEach((vert, index) => {
        const x = Math.cos(vert.a) * vert.r;
        const y = Math.sin(vert.a) * vert.r * 0.82;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      const gradient = ctx.createLinearGradient(-object.radius, -object.radius, object.radius, object.radius);
      gradient.addColorStop(0, "#7d827b");
      gradient.addColorStop(1, "#3f4542");
      ctx.fillStyle = gradient;
      ctx.fill();
      ctx.strokeStyle = "rgba(28, 31, 28, 0.28)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();

      if (object.shock > 0.03) {
        ctx.strokeStyle = `rgba(178, 74, 53, ${object.shock * 0.28})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(object.x, object.y, object.radius + (1 - object.shock) * 120, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  drawBranches() {
    ctx.lineCap = "round";
    for (const branch of this.branches) {
      ctx.strokeStyle = "rgba(48, 37, 22, 0.28)";
      ctx.lineWidth = branch.width + 5;
      ctx.beginPath();
      ctx.moveTo(branch.x1 + 3, branch.y1 + 3);
      ctx.lineTo(branch.x2 + 3, branch.y2 + 3);
      ctx.stroke();
      ctx.strokeStyle = "#6d5630";
      ctx.lineWidth = branch.width;
      ctx.beginPath();
      ctx.moveTo(branch.x1, branch.y1);
      ctx.lineTo(branch.x2, branch.y2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(238, 210, 130, 0.28)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(branch.x1, branch.y1 - 2);
      ctx.lineTo(branch.x2, branch.y2 - 2);
      ctx.stroke();
    }
  }

  drawBranchDraft() {
    if (!this.branchDraft) return;
    ctx.lineCap = "round";
    ctx.strokeStyle = "rgba(35, 124, 107, 0.55)";
    ctx.lineWidth = 8;
    ctx.setLineDash([6, 7]);
    ctx.beginPath();
    ctx.moveTo(this.branchDraft.x1, this.branchDraft.y1);
    ctx.lineTo(this.branchDraft.x2, this.branchDraft.y2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawAnts() {
    for (const ant of this.ants) this.drawAnt(ant);
  }

  drawAnt(ant) {
    ctx.save();
    ctx.translate(ant.x, ant.y);
    ctx.rotate(ant.angle);

    const selected = this.selectedAnt === ant;
    if (selected) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.86)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.stroke();
    }

    let body = "#1d1a15";
    if (ant.state === "panic") body = "#7d261e";
    if (ant.state === "wet") body = "#174d66";
    if (ant.state === "stunned") body = "#4c5152";
    if (ant.state === "rescue") body = "#17594e";
    if (ant.carrying > 0) body = "#382610";

    ctx.strokeStyle = "rgba(20, 18, 14, 0.9)";
    ctx.lineWidth = 1;
    for (let side = -1; side <= 1; side += 2) {
      for (let i = -1; i <= 1; i += 1) {
        ctx.beginPath();
        ctx.moveTo(i * 2, side * 2);
        ctx.lineTo(i * 4 - 2, side * 6);
        ctx.stroke();
      }
    }

    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(-4.8, 0, 4.4, 3.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, 0, 3.6, 2.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(4.5, 0, 3.2, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();

    if (ant.wet > 0.25) {
      ctx.fillStyle = `rgba(74, 178, 218, ${clamp(ant.wet * 0.45, 0, 0.55)})`;
      ctx.beginPath();
      ctx.ellipse(-1, 0, 7, 3.8, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    if (ant.carrying > 0) {
      ctx.fillStyle = "#d3a73d";
      ctx.beginPath();
      ctx.arc(8.2, 0, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

new Simulation();
