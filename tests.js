// /arkanoid-ga/tests.js
// UI: correr GA, pausar, exportar artifacts, y demo del mejor en canvas (1× por defecto).
import { Arkanoid, ArkanoidConfig } from './game.js';
import { evolve, Policy } from './ga.js';

const ui = {
  btnStart: document.getElementById('btnStart'),
  btnPause: document.getElementById('btnPause'),
  btnExportBest: document.getElementById('btnExportBest'),
  btnExportCSV: document.getElementById('btnExportCSV'),
  btnDemo: document.getElementById('btnDemo'),
  selSpeed: document.getElementById('inSpeed'),
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
let logsRows = [["gen","best","avg"]];

function logLine(s) {
  ui.log.textContent += s + "\n";
  ui.log.scrollTop = ui.log.scrollHeight;
}

function parseInputs() {
  const i = ui.inputs;
  return {
    N: +i.N.value, G: +i.G.value, k: +i.k.value,
    pCross: +i.pc.value, pMut: +i.pm.value, elit: +i.elit.value,
    episodes: +i.episodes.value, T: +i.T.value, seed: (+i.seed.value) >>> 0
  };
}

function downloadFile(name, text, type = 'text/plain') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}

function toCSV(rows) {
  return rows.map(r => r.map(v => (""+v).includes(",") ? `"${(""+v).replace(/"/g,'""')}"` : v).join(",")).join("\n");
}

ui.btnStart.addEventListener('click', async () => {
  if (running) return;
  running = true;
  ui.log.textContent = "";
  logsRows = [["gen","best","avg"]];
  ui.mGen.textContent = ui.mBest.textContent = ui.mAvg.textContent = "-";

  const opts = parseInputs();
  latest.opts = opts;
  logLine(`Start GA: N=${opts.N}, G=${opts.G}, k=${opts.k}, pc=${opts.pCross}, pm=${opts.pMut}, elit=${opts.elit}, episodes=${opts.episodes}, T=${opts.T}, seed=${opts.seed}`);

  await evolve(opts, {
    onPauseChange: (register) => { pausedToggleFn = register; },
    onGen: ({ gen, best, avg, globalBest, globalBestFit }) => {
      ui.mGen.textContent = gen;
      ui.mBest.textContent = best.toFixed(2);
      ui.mAvg.textContent = avg.toFixed(2);
      logsRows.push([gen, best.toFixed(4), avg.toFixed(4)]);
      latest.best = globalBest; latest.bestFit = globalBestFit;
      logLine(`gen ${gen}: best=${best.toFixed(2)} avg=${avg.toFixed(2)} globalBest=${globalBestFit.toFixed(2)}`);
    },
    onDone: ({ best, bestFit, history, cfg, seed, opts }) => {
      running = false;
      latest.best = best; latest.bestFit = bestFit; latest.history = history; latest.cfg = cfg; latest.seed = seed; latest.opts = opts;
      logLine(`DONE. globalBest=${bestFit.toFixed(2)} weights=[${best.weights.map(v=>v.toFixed(3)).join(", ")}], dz=${best.deadzone.toFixed(3)}`);
    }
  });
});

ui.btnPause.addEventListener('click', () => { if (pausedToggleFn) pausedToggleFn(); });

ui.btnExportBest.addEventListener('click', () => {
  if (!latest.best) { logLine("No hay best aún."); return; }
  const payload = {
    weights: latest.best.weights,
    deadzone: latest.best.deadzone,
    bestFit: latest.bestFit,
    seed: latest.seed,
    opts: latest.opts
  };
  downloadFile(`best_seed${latest.seed}.json`, JSON.stringify(payload, null, 2), 'application/json');
  logLine("best.json exportado.");
});

ui.btnExportCSV.addEventListener('click', () => {
  if (logsRows.length <= 1) { logLine("No hay logs."); return; }
  downloadFile(`logs_seed${(latest.opts?.seed??0)}.csv`, toCSV(logsRows), 'text/csv');
  logLine("logs.csv exportado.");
});

// --- Demo del mejor en canvas (1× por defecto; selector 1×/3×/5×) ---
let demo = { running: false, raf: 0 };

ui.btnDemo.addEventListener('click', () => {
  if (!latest.best) { logLine("Corre GA primero para obtener un best."); return; }
  if (demo.running) cancelAnimationFrame(demo.raf);

  const cfg = new ArkanoidConfig();
  const env = new Arkanoid(cfg, (latest.seed ^ 0xA5A5A5A5) >>> 0);
  const ctx = ui.cv.getContext('2d');
  const pol = new Policy(latest.best.weights, latest.best.deadzone);
  demo.running = true;

  const loop = () => {
    const stepsPerFrame = Math.max(1, (parseInt(ui.selSpeed.value, 10) || 1)); // 1× por defecto
    for (let i = 0; i < stepsPerFrame; i++) {
      const a = pol.act(env.observe());
      env.step(a);
      if (env.done) break;
    }
    env.render(ctx);
    ui.hud.textContent = `score=${env.score} lives=${env.lives} speed=${stepsPerFrame}×`;
    if (!env.done) demo.raf = requestAnimationFrame(loop);
    else demo.running = false;
  };
  loop();
});
