// /arkanoid-ga/tests.js
import { Arkanoid, ArkanoidConfig } from './game.js';
import { evolve, Policy } from './ga.js';

document.addEventListener('DOMContentLoaded', () => {
  const $ = id => document.getElementById(id);
  const ui = {
    btnStart: $('btnStart'),
    btnPause: $('btnPause'),
    btnDemo: $('btnDemo'),
    selSpeed: $('inSpeed'),
    chkAutoDemo: $('chkAutoDemo'),
    mGen: $('mGen'),
    mBest: $('mBest'),
    mAvg: $('mAvg'),
    log: $('log'),
    cv: $('cv'),
    hud: $('hud'),
    inN: $('inN'),
    inG: $('inG'),
    inK: $('inK'),
    inPc: $('inPc'),
    inPm: $('inPm'),
    inElit: $('inElit'),
    inEpisodes: $('inEpisodes'),
    inT: $('inT'),
    inSeed: $('inSeed'),
  };

  let timePanel = $('timePanel');
  if (!timePanel && ui.cv) {
    timePanel = document.createElement('div');
    timePanel.id = 'timePanel';
    timePanel.style.cssText = 'display:flex;gap:8px;margin:8px 0;flex-wrap:wrap';
    timePanel.innerHTML = `
      <div style="flex:1;min-width:140px;border:1px solid #2b303b;padding:8px;border-radius:8px;background:#20232b">
        <div style="font:700 12px monospace;color:#9aa3b2">Best Time</div>
        <div id="valBestTime" style="font:700 18px monospace;color:#e8eaf1">-</div>
      </div>
      <div style="flex:1;min-width:140px;border:1px solid #2b303b;padding:8px;border-radius:8px;background:#20232b">
        <div style="font:700 12px monospace;color:#9aa3b2">Avg Time</div>
        <div id="valAvgTime" style="font:700 18px monospace;color:#e8eaf1">-</div>
      </div>
      <div style="flex:1;min-width:140px;border:1px solid #2b303b;padding:8px;border-radius:8px;background:#20232b">
        <div style="font:700 12px monospace;color:#9aa3b2">Worst Time</div>
        <div id="valWorstTime" style="font:700 18px monospace;color:#e8eaf1">-</div>
      </div>`;
    ui.cv.parentNode.insertBefore(timePanel, ui.cv);
  }

  const valBestTime = $('valBestTime');
  const valAvgTime = $('valAvgTime');
  const valWorstTime = $('valWorstTime');

  // io simple (solo descargas)
  function saveBlob(filename, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 0);
  }
  function saveJSON(name, obj, space = 0) {
    saveBlob(name, new Blob([JSON.stringify(obj, null, space)], { type: 'application/json' }));
  }
  function saveText(name, text) {
    saveBlob(name, new Blob([text], { type: 'text/plain;charset=utf-8' }));
  }
  function toJSONL(arr) {
    return arr.map(o => JSON.stringify(o)).join('\n') + '\n';
  }
  function tsId(d = new Date()) {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
  }
  // estado io (para los archivos)
  let __runId = null, __logs = [], __bestSnapshot = null;

  function logLine(s) {
    if (!ui.log) return;
    ui.log.textContent += s + "\n";
    ui.log.scrollTop = ui.log.scrollHeight;
  }

  function speed() {
    return Math.max(1, parseInt(ui.selSpeed?.value || '1', 10));
  }

  function parseInputs() {
    const get = (el, d) => Math.max(0, +el?.value || d);
    return {
      N: get(ui.inN, 30),
      G: get(ui.inG, 60),
      k: get(ui.inK, 3),
      pCross: get(ui.inPc, 0.7),
      pMut: get(ui.inPm, 0.1),
      elit: get(ui.inElit, 2),
      episodes: get(ui.inEpisodes, 2),
      T: get(ui.inT, 5000),
      seed: (+ui.inSeed?.value) >>> 0
    };
  }

  let pausedToggleFn = null, running = false;
  let demoRunning = false, demoEnv = null, demoPolicy = null, demoLabel = '', demoRAF = 0;
  let autoDemo = true, swapThreshold = 5;

  const latest = {
    globalBest: null,
    globalBestFit: -Infinity,
    globalBestGen: -1,
    globalEvalSeed: 0,
    pending: null
  };

  if (ui.chkAutoDemo) {
    ui.chkAutoDemo.addEventListener('change', () => {
      autoDemo = ui.chkAutoDemo.checked;
      logLine(`Demo automático: ${autoDemo ? 'ON' : 'OFF'}`);
    });
    autoDemo = ui.chkAutoDemo.checked;
  }

  function bricksLeft(env) {
    return env?.bricksAlive?.filter(b => b).length ?? 0;
  }

  function runDemo(policy, label, seed) {
    if (!ui.cv) return;

    stopDemo();

    demoPolicy = policy;
    demoLabel = label;
    const cfg = new ArkanoidConfig();
    demoEnv = new Arkanoid(cfg, seed >>> 0);
    const ctx = ui.cv.getContext('2d');
    demoRunning = true;

    function frame() {
      if (!demoRunning) return;

      for (let i = 0; i < speed(); i++) {
        if (!demoEnv.done) {
          const action = demoPolicy.act(demoEnv.observe());
          demoEnv.step(action);
        } else {
          if (latest.pending) {
            const { p, tag, s } = latest.pending;
            latest.pending = null;
            demoPolicy = p;
            demoLabel = tag;
            demoEnv.reset(s >>> 0);
          } else {
            const bump = (Math.random() * 1000) | 0;
            demoEnv.reset((1234 + bump) >>> 0);
          }
        }
      }

      demoEnv.render(ctx);

      if (ui.hud) {
        ui.hud.textContent = `${demoLabel} | Score=${demoEnv.score} | Lives=${demoEnv.lives} | Bricks=${bricksLeft(demoEnv)}`;
      }

      demoRAF = requestAnimationFrame(frame);
    }

    frame();
  }

  function stopDemo() {
    demoRunning = false;
    cancelAnimationFrame(demoRAF);
  }

  if (ui.btnStart) {
    ui.btnStart.addEventListener('click', async () => {
      if (running) return;

      const opts = parseInputs();
      running = true;

      if (ui.log) ui.log.textContent = "";
      if (ui.mGen) ui.mGen.textContent = "-";
      if (ui.mBest) ui.mBest.textContent = "-";
      if (ui.mAvg) ui.mAvg.textContent = "-";

      if (valBestTime) valBestTime.textContent = "-";
      if (valAvgTime) valAvgTime.textContent = "-";
      if (valWorstTime) valWorstTime.textContent = "-";

      logLine(`=== INICIANDO AG ===`);
      logLine(`Params: N=${opts.N} G=${opts.G} k=${opts.k} pc=${opts.pCross} pm=${opts.pMut} ep=${opts.episodes} T=${opts.T}`);

      // config (solo para poder replicar)
      __runId = tsId();
      __logs = [];
      __bestSnapshot = null;
      const meta = {
        name: 'Arkanoid+GA',
        created_at: new Date().toISOString(),
        run_id: __runId,
        browser: navigator.userAgent
      };
      saveJSON(`config/run-${__runId}.json`, { meta, seed: opts.seed, params: opts }, 2);

      try {
        await evolve(opts, {
          onPauseChange: fn => { pausedToggleFn = fn; },

          onGen: ({ gen, best, avg, worst, genMs, timeMin, timeAvg, timeMax, destroyed, totalBricks,
                    isNewGlobal, globalBest, globalBestFit, globalBestGen, globalEvalSeed }) => {

            if (ui.mGen) ui.mGen.textContent = gen;
            if (ui.mBest) ui.mBest.textContent = best.toFixed(2);
            if (ui.mAvg) ui.mAvg.textContent = avg.toFixed(2);

            if (valBestTime) valBestTime.textContent = `${timeMin.toFixed(1)} ms`;
            if (valAvgTime) valAvgTime.textContent = `${timeAvg.toFixed(1)} ms`;
            if (valWorstTime) valWorstTime.textContent = `${timeMax.toFixed(1)} ms`;

            logLine(`Gen ${gen}: mejor=${best.toFixed(2)} peor=${worst.toFixed(2)} media=${avg.toFixed(2)} tiempo=${genMs.toFixed(1)}ms bricks=${destroyed}/${totalBricks}`);

            if (isNewGlobal) {
              latest.globalBest = globalBest;
              latest.globalBestFit = globalBestFit;
              latest.globalBestGen = globalBestGen;
              latest.globalEvalSeed = globalEvalSeed;

              if (autoDemo) {
                if (!demoRunning) {
                  runDemo(globalBest, `GLOBAL g${globalBestGen}`, globalEvalSeed);
                } else {
                  const left = bricksLeft(demoEnv);
                  if (left > swapThreshold) {
                    demoPolicy = globalBest;
                    demoLabel = `GLOBAL g${globalBestGen}`;
                  } else {
                    latest.pending = {
                      p: globalBest,
                      tag: `GLOBAL g${globalBestGen}`,
                      s: globalEvalSeed
                    };
                  }
                }
              }
            }

            // log por gen + best.json (solo archivos)
            const n = v => (typeof v === 'number' && isFinite(v)) ? +Number(v).toFixed(6) : null;
            const ms = v => (typeof v === 'number' && isFinite(v)) ? +Number(v).toFixed(2) : null;

            __logs.push({
              run: __runId, gen,
              best: n(best), avg: n(avg), worst: n(worst),
              genMs: Math.round(genMs || 0),
              destroyed, totalBricks,
              timeMin: ms(timeMin), timeAvg: ms(timeAvg), timeMax: ms(timeMax),
              globalBestFit: n(globalBestFit), globalBestGen
            });

            if (isNewGlobal) {
              __bestSnapshot = {
                gen: globalBestGen,
                fitness: n(globalBestFit ?? best),
                seed: (globalEvalSeed >>> 0),
                params: opts,
                genotype: null,
                policy: null
              };
              saveJSON('best.json', __bestSnapshot, 2);
            }
          },

          onDone: ({ best, bestFit, history, seed }) => {
            logLine(`=== EVOLUCIÓN COMPLETADA ===`);
            logLine(`Mejor fitness global: ${bestFit.toFixed(2)}`);

            if (autoDemo && best && !demoRunning) {
              runDemo(best, `GLOBAL g${history.at(-1)?.gen ?? '?'}`, seed >>> 0);
            }

            // logs y best final (solo archivos)
            saveText(`logs/run-${__runId}.jsonl`, toJSONL(__logs));
            if (!__bestSnapshot && __logs.length) {
              const last = __logs[__logs.length - 1];
              saveJSON('best.json', {
                gen: last.gen,
                fitness: last.best,
                seed: seed >>> 0,
                params: opts,
                genotype: null,
                policy: null
              }, 2);
            }

            running = false;
          }
        });
      } catch (e) {
        console.error(e);
        logLine(`ERROR: ${e?.message || e}`);
        running = false;
      }
    });
  }

  if (ui.btnPause) {
    ui.btnPause.addEventListener('click', () => {
      if (typeof pausedToggleFn === 'function') {
        pausedToggleFn();
        logLine('Pausa/Reanudar');
      } else {
        logLine('Inicia el GA primero');
      }
    });
  }

  if (ui.btnDemo) {
    ui.btnDemo.addEventListener('click', () => {
      if (!latest.globalBest) {
        logLine('Ejecuta el GA primero');
        return;
      }
      runDemo(latest.globalBest, `MANUAL g${latest.globalBestGen}`, latest.globalEvalSeed);
    });
  }

  const simplePolicy = new Policy([0.5, -0.3, 0.2, -0.1, 0.6, 0, 0.1, 0.2], 0.15);
  runDemo(simplePolicy, 'INICIAL', 1234);
  logLine('Sistema listo - Haz clic en Start GA');
});
