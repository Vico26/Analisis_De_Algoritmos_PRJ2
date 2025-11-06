// /arkanoid-ga/ga.js
// Política y Algoritmo Genético (ESM)

import { Arkanoid, ArkanoidConfig, mulberry32, clamp } from './game.js';

// Política lineal con zona muerta (evita oscilaciones cerca de 0).
export class Policy {
  constructor(weights, deadzone) {
    this.weights = weights.slice(0, 8);
    this.deadzone = deadzone;
  }
  act(features) {
    let y = 0;
    for (let i = 0; i < 8; i++) y += this.weights[i] * features[i];
    if (Math.abs(y) <= this.deadzone) return 0;
    return y > 0 ? 1 : -1;
  }
}

export function evaluate(policy, cfg, seed, episodes = 2, T = 5000) {
  const env = new Arkanoid(cfg, seed);
  let totalFitness = 0;

  for (let ep = 0; ep < episodes; ep++) {
    // Semillas distintas por episodio para robustez.
    env.reset((seed ^ (ep + 1) * 0x9E3779B1) >>> 0);

    let steps = 0;
    for (let t = 0; t < T; t++) {
      const a = policy.act(env.observe());
      const { done } = env.step(a);
      steps++;
      if (done) break;
    }
    const livesLost = (cfg.lives - env.lives);
    const destroyed = env.bricksAlive.reduce((s, a) => s + (a ? 0 : 1), 0);
    const fitness = 10 * destroyed + 1 * env.score + 0.02 * steps - 3 * livesLost;
    totalFitness += fitness;
  }
  return totalFitness / episodes;
}

function randRange(rng, lo, hi) { return lo + (hi - lo) * rng(); }

export function initPopulation(N, rng, ranges) {
  const pop = [];
  for (let i = 0; i < N; i++) {
    const w = Array.from({ length: 8 }, () => randRange(rng, ranges.wLo, ranges.wHi));
    const dz = randRange(rng, ranges.dzLo, ranges.dzHi);
    pop.push(new Policy(w, dz));
  }
  return pop;
}

export function tournamentSelect(pop, fits, k, rng) {
  let bestIdx = -1, bestFit = -Infinity;
  for (let i = 0; i < k; i++) {
    const idx = Math.floor(rng() * pop.length);
    if (fits[idx] > bestFit) { bestFit = fits[idx]; bestIdx = idx; }
  }
  return pop[bestIdx];
}

export function onePointCrossover(a, b, pCross, rng, ranges) {
  if (rng() > pCross) return [new Policy(a.weights, a.deadzone), new Policy(b.weights, b.deadzone)];
  const point = 1 + Math.floor(rng() * 7); // corte en [1..7]
  const wa = a.weights.slice(); const wb = b.weights.slice();
  for (let i = point; i < 8; i++) { const t = wa[i]; wa[i] = wb[i]; wb[i] = t; }
  // cruzar deadzone simple
  const dzA = rng() < 0.5 ? a.deadzone : b.deadzone;
  const dzB = rng() < 0.5 ? b.deadzone : a.deadzone;
  return [
    new Policy(wa, clamp(dzA, ranges.dzLo, ranges.dzHi)),
    new Policy(wb, clamp(dzB, ranges.dzLo, ranges.dzHi))
  ];
}

export function gaussianMutation(ind, pMut, sigmaW, sigmaDZ, rng, ranges) {
  const w = ind.weights.slice();
  for (let i = 0; i < 8; i++) {
    if (rng() < pMut) {
      // Box–Muller para N(0,1)
      const u = rng() || 1e-9, v = rng() || 1e-9;
      const n = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      w[i] = clamp(w[i] + n * sigmaW, ranges.wLo, ranges.wHi);
    }
  }
  let dz = ind.deadzone;
  if (rng() < pMut) {
    const u = rng() || 1e-9, v = rng() || 1e-9;
    const n = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    dz = clamp(dz + n * sigmaDZ, ranges.dzLo, ranges.dzHi);
  }
  return new Policy(w, dz);
}

export async function evolve(opts, hooks = {}) {
  const {
    N = 30, G = 60, k = 3, pCross = 0.7, pMut = 0.1, elit = 2,
    episodes = 2, T = 5000, seed = 1234
  } = opts;

  const rng = mulberry32(seed >>> 0);
  const cfg = new ArkanoidConfig();
  cfg.horizonT = T; cfg.episodes = episodes;

  const ranges = { wLo: -3, wHi: 3, dzLo: 0.0, dzHi: 0.4 };
  const sigmaW = 0.15 * (ranges.wHi - ranges.wLo);
  const sigmaDZ = 0.15 * (ranges.dzHi - ranges.dzLo);

  let pop = initPopulation(N, rng, ranges);
  let globalBest = null, globalBestFit = -Infinity;
  const history = [];

  let paused = false;
  // Hook para permitir toggle de pausa desde UI.
  hooks.onPauseChange && hooks.onPauseChange(() => { paused = !paused; });

  for (let gen = 0; gen < G; gen++) {
    // Pausa cooperativa no-bloqueante (UI fluida).
    while (paused) await new Promise(r => setTimeout(r, 100));

    // Evaluación (determinística por gen).
    const fits = pop.map(ind =>
      evaluate(ind, cfg, (seed ^ ((gen + 1) * 0x9E37)) >>> 0, episodes, T)
    );

    // Best + promedio
    let bestIdx = 0, sum = 0;
    for (let i = 0; i < fits.length; i++) { if (fits[i] > fits[bestIdx]) bestIdx = i; sum += fits[i]; }
    const bestFit = fits[bestIdx], avgFit = sum / fits.length;
    const bestInd = pop[bestIdx];

    if (bestFit > globalBestFit) {
      globalBestFit = bestFit;
      globalBest = new Policy(bestInd.weights, bestInd.deadzone);
    }

    history.push({ gen, best: bestFit, avg: avgFit });
    hooks.onGen && hooks.onGen({ gen, best: bestFit, avg: avgFit, bestInd, globalBest, globalBestFit });

    // Nueva población con elitismo
    const next = [];
    const order = [...fits.keys()].sort((i, j) => fits[j] - fits[i]);
    for (let e = 0; e < elit; e++) {
      const ie = order[e];
      next.push(new Policy(pop[ie].weights, pop[ie].deadzone));
    }
    while (next.length < N) {
      const p1 = tournamentSelect(pop, fits, k, rng);
      const p2 = tournamentSelect(pop, fits, k, rng);
      const [c1, c2] = onePointCrossover(p1, p2, pCross, rng, ranges);
      next.push(gaussianMutation(c1, pMut, sigmaW, sigmaDZ, rng, ranges));
      if (next.length < N) next.push(gaussianMutation(c2, pMut, sigmaW, sigmaDZ, rng, ranges));
    }
    pop = next;

    // Cede al event loop (no bloquear render).
    await new Promise(r => setTimeout(r, 0));
  }

  hooks.onDone && hooks.onDone({ best: globalBest, bestFit: globalBestFit, history, cfg, seed, opts });
  return { best: globalBest, bestFit: globalBestFit, history, cfg, seed, opts };
}
