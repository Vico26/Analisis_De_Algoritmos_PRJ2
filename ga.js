import { Arkanoid, ArkanoidConfig, mulberry32, clamp } from './game.js';

const TIME_W = 0.05;

export class Policy {//pesos y deadzone
  constructor(weights, deadzone) {
    this.weights = weights.slice(0, 8);
    this.deadzone = deadzone;
  }
  
  act(features) {//características del entorno
    let y = 0;
    for (let i = 0; i < 8; i++) 
      y += this.weights[i] * features[i];
    if (Math.abs(y) <= this.deadzone) 
      return 0;
    return y > 0 ? 1 : -1;
  }
}

export function evaluate(policy, config, seed, episodes = 2, T = 5000) {//evaluar la política
  let totalFitness = 0;
  for (let ep = 0; ep < episodes; ep++) {
    const env = new Arkanoid(config, (seed + ep * 1000) >>> 0);
    let episodeReward = 0;
    let stepsAlive = 0;
    
    for (let t = 0; t < T; t++) {
      const action = policy.act(env.observe());
      const { reward, done } = env.step(action);
      episodeReward += reward;
      stepsAlive++;
      if (done) break;
    }
    
    const destroyed = env.bricksAlive.filter(b => !b).length;

    const totalBricks = env.bricksAlive.length;

    const livesLeft = env.lives;

    const progress = destroyed / totalBricks;

    const allBricksDestroyed = destroyed === totalBricks;

    let fitness = (destroyed * 30) + 
        (episodeReward * 5) + 
        (livesLeft * 10) + 
        (progress * 50) + 
        (stepsAlive * TIME_W);

    if (allBricksDestroyed) fitness += 2000;
    totalFitness += fitness;
  }
  return totalFitness / episodes;
}

function episodeDestroyed(policy, config, seed, T = 5000) {//número de ladrillos destruidos en un episodio
  const env = new Arkanoid(config, seed >>> 0);
  for (let t = 0; t < T; t++) {
    const action = policy.act(env.observe());
    const { done } = env.step(action);
    if (done) break;
  }
  const destroyed = env.bricksAlive.filter(b => !b).length;
  return { destroyed, total: env.bricksAlive.length };
}

function randRange(rng, lo, hi) { 
  return lo + (hi - lo) * rng(); 
}

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
    if (fits[idx] > bestFit) { 
      bestFit = fits[idx]; 
      bestIdx = idx; 
    }
  }
  return pop[bestIdx];
}

export function onePointCrossover(a, b, pCross, rng, ranges) {
  if (rng() > pCross) return [a, b];
  
  const point = 1 + Math.floor(rng() * 7);
  const wa = [...a.weights], wb = [...b.weights];
  
  for (let i = point; i < 8; i++) [wa[i], wb[i]] = [wb[i], wa[i]];
  
  const dzA = rng() < 0.5 ? a.deadzone : b.deadzone;
  const dzB = rng() < 0.5 ? b.deadzone : a.deadzone;
  
  return [
    new Policy(wa, clamp(dzA, ranges.dzLo, ranges.dzHi)),
    new Policy(wb, clamp(dzB, ranges.dzLo, ranges.dzHi))
  ];
}

export function gaussianMutation(ind, pMut, sigmaW, sigmaDZ, rng, ranges) {
  const w = [...ind.weights];
  
  for (let i = 0; i < w.length; i++) {
    if (rng() < pMut) {
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
    N = 30, G = 60, k = 3, pCross = 0.7, pMut = 0.1, 
    elit = 2, episodes = 2, T = 5000, seed = 1234 
  } = opts;

  const rng = mulberry32(seed);
  const config = new ArkanoidConfig(); 
  config.horizonT = T; 
  config.episodes = episodes;

  const ranges = { wLo: -2, wHi: 2, dzLo: 0.0, dzHi: 0.3 };
  const sigmaW = 0.2, sigmaDZ = 0.05;

  let pop = initPopulation(N, rng, ranges);
  let globalBest = null, globalBestFit = -Infinity;
  let globalBestGen = -1, globalBestIdx = -1;
  const history = [];

  let paused = false;
  hooks.onPauseChange && hooks.onPauseChange(() => { paused = !paused; });

  for (let gen = 0; gen < G; gen++) {
    const genStart = performance.now();
    while (paused) await new Promise(r => setTimeout(r, 100));

    const fits = [];
    const times = [];
    
    for (let i = 0; i < pop.length; i++) {
      if (i % 5 === 0) await new Promise(r => setTimeout(r, 0));
      
      const startTime = performance.now();
      const fit = evaluate(pop[i], config, (seed + gen * 1000 + i) >>> 0, episodes, T);
      const endTime = performance.now();
      
      fits.push(fit);
      times.push(endTime - startTime);
    }

    const worstFit = Math.min(...fits);
    const genMs = performance.now() - genStart;

    let bestIdx = 0, sum = 0;
    for (let i = 0; i < fits.length; i++) { 
      if (fits[i] > fits[bestIdx]) bestIdx = i; 
      sum += fits[i]; 
    }
    
    const bestFit = fits[bestIdx], avgFit = sum / fits.length, bestInd = pop[bestIdx];
    const timeMin = Math.min(...times);
    const timeAvg = times.reduce((a, b) => a + b, 0) / times.length;
    const timeMax = Math.max(...times);

    let isNewGlobal = false;
    if (bestFit > globalBestFit) {
      globalBestFit = bestFit;
      globalBest = new Policy(bestInd.weights, bestInd.deadzone);
      globalBestGen = gen;
      globalBestIdx = bestIdx;
      isNewGlobal = true;
    }

    const { destroyed, total } = episodeDestroyed(bestInd, config, (seed + gen * 1000 + bestIdx) >>> 0, T);
    history.push({ gen, best: bestFit, avg: avgFit });

    hooks.onGen && hooks.onGen({
      gen, best: bestFit, avg: avgFit, worst: worstFit, genMs,
      timeMin, timeAvg, timeMax,
      destroyed, totalBricks: total,
      isNewGlobal,
      globalBest, globalBestFit, globalBestGen, globalBestIdx,
      globalEvalSeed: (seed + gen * 1000 + bestIdx) >>> 0,
      bestInd, bestIdx
    });

    // Elitism + new population
    const nextPop = [];
    const sorted = [...fits.keys()].sort((a, b) => fits[b] - fits[a]);
    for (let e = 0; e < elit; e++) {
      nextPop.push(new Policy(pop[sorted[e]].weights, pop[sorted[e]].deadzone));
    }

    while (nextPop.length < N) {
      const p1 = tournamentSelect(pop, fits, k, rng);
      const p2 = tournamentSelect(pop, fits, k, rng);
      const [c1, c2] = onePointCrossover(p1, p2, pCross, rng, ranges);
      
      nextPop.push(gaussianMutation(c1, pMut, sigmaW, sigmaDZ, rng, ranges));
      if (nextPop.length < N) {
        nextPop.push(gaussianMutation(c2, pMut, sigmaW, sigmaDZ, rng, ranges));
      }
    }

    pop = nextPop;
    await new Promise(r => setTimeout(r, 0));
  }

  const result = { 
    best: globalBest, 
    bestFit: globalBestFit, 
    history, 
    config, 
    seed,
    globalBestGen, 
    globalBestIdx 
  };
  
  hooks.onDone && hooks.onDone(result);
  return result;
}