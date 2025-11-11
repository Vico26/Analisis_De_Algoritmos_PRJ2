// /arkanoid-ga/tests.js
// UI + demo con evolve() real. Sin validaciones ni export. Log incluye bricks destruidos.
import { Arkanoid, ArkanoidConfig } from './game.js';
import { evolve, Policy } from './ga.js';

const ui = {
  btnStart: document.getElementById('btnStart'),
  btnPause: document.getElementById('btnPause'),
  btnDemo: document.getElementById('btnDemo'),
  selSpeed: document.getElementById('inSpeed'),
  chkAutoDemo: document.getElementById('chkAutoDemo'),
  mGen: document.getElementById('mGen'),
  mBest: document.getElementById('mBest'),
  mAvg: document.getElementById('mAvg'),
  log: document.getElementById('log'),
  cv: document.getElementById('cv'),
  hud: document.getElementById('hud'),
  inputs: {
    N: document.getElementById('inN'),
    G: document.getElementById('inG'),
    k: document.getElementById('inK'),
    pc: document.getElementById('inPc'),
    pm: document.getElementById('inPm'),
    elit: document.getElementById('inElit'),
    episodes: document.getElementById('inEpisodes'),
    T: document.getElementById('inT'),
    seed: document.getElementById('inSeed'),
  }
};

let latest = { best: null, bestFit: -Infinity, history: [], cfg: null, seed: 0, opts: null };
let pausedToggleFn = null;
let running = false;
let autoDemoEnabled = true;
let demoRunning = false;
let demoRAF = null;

ui.chkAutoDemo.addEventListener('change', () => {
  autoDemoEnabled = ui.chkAutoDemo.checked;
  logLine(`Demo automático: ${autoDemoEnabled ? 'ACTIVADO' : 'DESACTIVADO'}`);
});

function logLine(s) { ui.log.textContent += s + "\n"; ui.log.scrollTop = ui.log.scrollHeight; }

function parseInputs() {
  const i = ui.inputs;
  return {
    N: +i.N.value, G: +i.G.value, k: +i.k.value,
    pCross: +i.pc.value, pMut: +i.pm.value, elit: +i.elit.value,
    episodes: +i.episodes.value, T: +i.T.value, seed: (+i.seed.value) >>> 0
  };
}

function getSpeed() { return Math.max(1, parseInt(ui.selSpeed.value, 10) || 1); }

function runDemo(policy, genNumber = 'INICIAL') {
  if (demoRunning && demoRAF) { cancelAnimationFrame(demoRAF); demoRunning = false; }

  const cfg = new ArkanoidConfig();
  const baseSeed = typeof genNumber === "number" ? genNumber : 1234;
  const env = new Arkanoid(cfg, (1234 + baseSeed) >>> 0);
  const ctx = ui.cv.getContext('2d');

  demoRunning = true;
  env.reset((1234 + baseSeed) >>> 0);

  const loop = () => {
    if (!demoRunning) return;
    try {
      const steps = getSpeed();
      for (let i = 0; i < steps; i++) {
        if (!env.done) {
          const action = policy.act(env.observe());
          env.step(action);
        } else {
          env.reset(((1234 + baseSeed + Math.floor(Math.random() * 1000)) >>> 0));
        }
      }
      ctx.clearRect(0, 0, cfg.width, cfg.height);
      env.render(ctx);
      const destroyed = env.bricksAlive.filter(b => !b).length;
      const total = env.bricksAlive.length;
      ui.hud.textContent = `GEN ${genNumber} | Score: ${env.score} Lives: ${env.lives} Bricks: ${destroyed}/${total}`;
    } catch (err) { console.error('Error en demo:', err); }
    demoRAF = requestAnimationFrame(loop);
  };

  loop();
  logLine(`Demo gen ${genNumber} iniciado`);
}

// Demo inicial
window.addEventListener('load', () => {
  const simplePolicy = new Policy([0.5, -0.3, 0.2, -0.1, 0.6, 0, 0.1, 0.2], 0.15);
  runDemo(simplePolicy, 'INICIAL');
});

// START: evolve() real (sin validaciones)
ui.btnStart.addEventListener('click', async () => {
  if (running) return;
  const opts = parseInputs();

  running = true;
  ui.log.textContent = "";
  ui.mGen.textContent = ui.mBest.textContent = ui.mAvg.textContent = "-";
  latest.opts = opts; latest.seed = opts.seed;

  logLine(`=== INICIANDO ALGORITMO GENÉTICO ===`);
  logLine(`Params: N=${opts.N}, G=${opts.G}, k=${opts.k}, pc=${opts.pCross}, pm=${opts.pMut}`);

  try {
    await evolve(opts, {
      onPauseChange: (fn) => { pausedToggleFn = fn; },
      onGen: ({ gen, best, avg, bestInd, globalBest, globalBestFit, destroyed, totalBricks }) => {
        ui.mGen.textContent = gen;
        ui.mBest.textContent = best.toFixed(2);
        ui.mAvg.textContent = avg.toFixed(2);
        latest.best = bestInd; latest.bestFit = globalBestFit;
        logLine(`Gen ${gen}: mejor=${best.toFixed(2)} avg=${avg.toFixed(2)} bricks=${destroyed}/${totalBricks}`);
        if (autoDemoEnabled && bestInd) runDemo(bestInd, gen);
      },
      onDone: ({ best, bestFit, history, cfg, seed }) => {
        latest.best = best; latest.bestFit = bestFit; latest.history = history; latest.cfg = cfg; latest.seed = seed;
        logLine(`=== EVOLUCIÓN COMPLETADA ===`);
        logLine(`Mejor fitness: ${bestFit.toFixed(2)}`);
        if (autoDemoEnabled && best) runDemo(best, 'MEJOR GLOBAL');
      }
    });
  } catch (err) {
    logLine(`ERROR: ${err.message || err}`);
  } finally {
    running = false;
  }
});

// Pause
ui.btnPause.addEventListener('click', () => {
  if (typeof pausedToggleFn === 'function') { pausedToggleFn(); logLine("Toggle de pausa enviado al GA."); }
  else { logLine("Pausa no disponible aún. Inicia el GA primero."); }
});

// Demo manual del mejor global
ui.btnDemo.addEventListener('click', () => {
  if (!latest.best) { logLine("Ejecuta el GA primero para obtener un mejor agente."); return; }
  runDemo(latest.best, 'MEJOR GLOBAL');
  logLine("Demo del mejor agente global iniciado.");
});
