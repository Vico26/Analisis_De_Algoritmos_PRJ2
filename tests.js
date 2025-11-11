// /arkanoid-ga/tests.js
// Demo SOLO cambia al mejor GLOBAL. Umbral ajustable para no interrumpir finales.
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

// Inyectar control de umbral sin tocar HTML
let swapThreshold = 5;
(function injectThresholdControl(){
  const wrap = document.createElement('div');
  wrap.className = 'controls';
  wrap.innerHTML = `
    <label>Umbral no-interrumpir</label>
    <input id="inSwapThreshold" type="number" min="0" max="30" step="1" value="${swapThreshold}">
  `;
  // Insertar al lado del control de velocidad (si existe)
  const demoPanel = ui.selSpeed?.parentElement?.parentElement || document.body;
  demoPanel.insertBefore(wrap, demoPanel.children[1] || null);
  const input = wrap.querySelector('#inSwapThreshold');
  input.addEventListener('input', () => { swapThreshold = Math.max(0, parseInt(input.value || '0', 10)); });
})();

let latest = {
  best: null, bestFit: -Infinity, history: [], cfg: null, seed: 0, opts: null,
  // tracking del mejor global
  globalBest: null, globalBestFit: -Infinity, globalBestGen: -1, globalBestIdx: -1, globalEvalSeed: 0,
  // candidato diferido cuando faltan pocos ladrillos
  nextCandidateGlobal: null
};
let pausedToggleFn = null;
let running = false;
let autoDemoEnabled = true;

// Estado demo
let demoRunning = false;
let demoRAF = null;
let currentDemoEnv = null;
let currentDemoPolicy = null;
let currentDemoGen = 'INICIAL';

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
function bricksLeft(env) { return env?.bricksAlive?.reduce((s,b)=>s+(b?1:0),0) ?? Infinity; }

function runDemo(initialPolicy, label, seed) {
  if (demoRunning && demoRAF) { cancelAnimationFrame(demoRAF); demoRunning = false; }

  const cfg = new ArkanoidConfig();
  currentDemoEnv = new Arkanoid(cfg, seed >>> 0);
  currentDemoEnv.reset(seed >>> 0);
  currentDemoPolicy = initialPolicy;
  currentDemoGen = label;
  demoRunning = true;

  const ctx = ui.cv.getContext('2d');

  const loop = () => {
    if (!demoRunning) return;
    try {
      const steps = getSpeed();
      for (let i = 0; i < steps; i++) {
        if (!currentDemoEnv.done) {
          const action = currentDemoPolicy.act(currentDemoEnv.observe());
          currentDemoEnv.step(action);
        } else {
          // episodio finalizado
          if (latest.nextCandidateGlobal) {
            const { policy, label, seed } = latest.nextCandidateGlobal;
            currentDemoPolicy = policy;
            currentDemoGen = label;
            currentDemoEnv.reset(seed >>> 0); // reproducir evaluación exacta del global
            latest.nextCandidateGlobal = null;
          } else {
            const seedBump = Math.floor(Math.random() * 1000) >>> 0;
            currentDemoEnv.reset((1234 + seedBump) >>> 0);
          }
        }
      }
      ctx.clearRect(0, 0, cfg.width, cfg.height);
      currentDemoEnv.render(ctx);
      const destroyed = currentDemoEnv.bricksAlive.filter(b => !b).length;
      const total = currentDemoEnv.bricksAlive.length;
      ui.hud.textContent = `GEN ${currentDemoGen} | Score: ${currentDemoEnv.score} Lives: ${currentDemoEnv.lives} Bricks: ${destroyed}/${total}`;
    } catch (err) { console.error('Error en demo:', err); }
    demoRAF = requestAnimationFrame(loop);
  };

  loop();
  logLine(`Demo "${label}" seed=${seed} iniciado`);
}

// Demo inicial
window.addEventListener('load', () => {
  const simplePolicy = new Policy([0.5, -0.3, 0.2, -0.1, 0.6, 0, 0.1, 0.2], 0.15);
  runDemo(simplePolicy, 'INICIAL', 1234 >>> 0);
});

ui.chkAutoDemo.addEventListener('change', () => {
  autoDemoEnabled = ui.chkAutoDemo.checked;
  logLine(`Demo automático: ${autoDemoEnabled ? 'ACTIVADO' : 'DESACTIVADO'}`);
});

ui.btnStart.addEventListener('click', async () => {
  if (running) return;
  const opts = parseInputs();

  running = true;
  ui.log.textContent = "";
  ui.mGen.textContent = ui.mBest.textContent = ui.mAvg.textContent = "-";
  latest.opts = opts; latest.seed = opts.seed;
  latest.globalBest = null; latest.globalBestFit = -Infinity; latest.globalBestGen = -1; latest.globalBestIdx = -1; latest.globalEvalSeed = 0;
  latest.nextCandidateGlobal = null;

  logLine(`=== INICIANDO ALGORITMO GENÉTICO ===`);
  logLine(`Params: N=${opts.N}, G=${opts.G}, k=${opts.k}, pc=${opts.pCross}, pm=${opts.pMut}`);

  try {
    await evolve(opts, {
      onPauseChange: fn => { pausedToggleFn = fn; },
      onGen: ({ gen, best, avg, destroyed, totalBricks, isNewGlobal, globalBest, globalBestFit, globalBestGen, globalBestIdx, globalEvalSeed }) => {
        ui.mGen.textContent = gen;
        ui.mBest.textContent = best.toFixed(2);
        ui.mAvg.textContent = avg.toFixed(2);
        logLine(`Gen ${gen}: mejor=${best.toFixed(2)} avg=${avg.toFixed(2)} bricks=${destroyed}/${totalBricks}`);

        if (isNewGlobal) {
          latest.globalBest = globalBest;
          latest.globalBestFit = globalBestFit;
          latest.globalBestGen = globalBestGen;
          latest.globalBestIdx = globalBestIdx;
          latest.globalEvalSeed = globalEvalSeed;

          if (autoDemoEnabled) {
            if (!demoRunning) {
              runDemo(globalBest, `GLOBAL g${globalBestGen}`, globalEvalSeed);
            } else {
              const left = bricksLeft(currentDemoEnv);
              if (left > swapThreshold) {
                currentDemoPolicy = globalBest; // swap en caliente
                currentDemoGen = `GLOBAL g${globalBestGen}`;
              } else {
                // guardar para aplicar cuando termine
                latest.nextCandidateGlobal = { policy: globalBest, label: `GLOBAL g${globalBestGen}`, seed: globalEvalSeed };
                logLine(`(esperando fin: quedan ${left} ladrillos)`);
              }
            }
          }
        }
      },
      onDone: ({ best, bestFit, history, cfg, seed }) => {
        latest.best = best; latest.bestFit = bestFit; latest.history = history; latest.cfg = cfg; latest.seed = seed;
        logLine(`=== EVOLUCIÓN COMPLETADA ===`);
        logLine(`Mejor fitness global: ${bestFit.toFixed(2)}`);
        // Si no hubo demo, arrancar con el global final
        if (autoDemoEnabled && !demoRunning && latest.globalBest) {
          runDemo(latest.globalBest, `GLOBAL g${latest.globalBestGen}`, latest.globalEvalSeed || (seed >>> 0));
        }
      }
    });
  } catch (err) {
    logLine(`ERROR: ${err.message || err}`);
  } finally {
    running = false;
  }
});

ui.btnPause.addEventListener('click', () => {
  if (typeof pausedToggleFn === 'function') { pausedToggleFn(); logLine("Toggle de pausa enviado al GA."); }
  else { logLine("Pausa no disponible aún. Inicia el GA primero."); }
});

// Demo manual del mejor global (reproduce semilla de evaluación)
ui.btnDemo.addEventListener('click', () => {
  if (!latest.globalBest) { logLine("Aún no hay mejor global. Ejecuta el GA."); return; }
  runDemo(latest.globalBest, `GLOBAL g${latest.globalBestGen}`, latest.globalEvalSeed || (latest.seed >>> 0));
  logLine("Demo del mejor global iniciado.");
});
