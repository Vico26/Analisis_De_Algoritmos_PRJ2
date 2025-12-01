// filepath: /arkanoid-ga/json-io.js
// Módulo ESM para exportar config/, logs/, best.json y replay/ 

// ===== Helpers =====
function saveBlob(filename, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 0); // evita fuga de memoria
}
export function saveJSON(name, obj, space = 0) {
  saveBlob(name, new Blob([JSON.stringify(obj, null, space)], { type: 'application/json' }));
}
export function saveText(name, text) {
  saveBlob(name, new Blob([text], { type: 'text/plain;charset=utf-8' }));
}
export function toJSONL(arr) {
  return arr.map(o => JSON.stringify(o)).join('\n') + '\n';
}
export function tsId(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}
const n6 = (v) => (typeof v === 'number' && isFinite(v)) ? +Number(v).toFixed(6) : null;
const ms2 = (v) => (typeof v === 'number' && isFinite(v)) ? +Number(v).toFixed(2) : null;

// ===== Estado (mantenido solo en este módulo) =====
let runId = null;
let logs = [];
let bestSnapshot = null;
let lastConfigObj = null;
let replaySteps = []; // opcional

// ===== API pública =====

/**
 * Inicializa una corrida y guarda config/run-<id>.json.
 * No modifica el GA; solo escribe el snapshot de parámetros/semilla/meta.
 */
export function initRun(params, metaExtra = {}) {
  runId = tsId();
  logs = [];
  bestSnapshot = null;
  replaySteps = [];

  const meta = {
    name: 'Arkanoid+GA',
    created_at: new Date().toISOString(),
    run_id: runId,
    browser: navigator.userAgent,
    ...metaExtra
  };

  lastConfigObj = { meta, seed: params.seed, params };
  saveJSON(`config/run-${runId}.json`, lastConfigObj, 2);
  return runId;
}

/**
 * Agrega una línea al log por generación y guarda best.json si hay nuevo mejor.
 * @param {object} payload Payload que recibes ya en tu onGen del GA.
 * @param {object} ctx { params, serialize? }
 *  - params: los mismos usados para correr el GA (para reproducibilidad).
 *  - serialize: función opcional (policy -> {genotype, policy}) si quieres persistirlos.
 */
export function onGen(payload, { params = {}, serialize } = {}) {
  if (!runId) return;

  const {
    gen, best, avg, worst, genMs,
    destroyed, totalBricks,
    timeMin, timeAvg, timeMax,
    isNewGlobal, globalBestFit, globalBestGen,
    bestIdx, bestInd, globalEvalSeed, globalBest
  } = payload;

  logs.push({
    run: runId, gen,
    best: n6(best), avg: n6(avg), worst: n6(worst),
    genMs: Math.round(genMs || 0),
    destroyed, totalBricks,
    timeMin: ms2(timeMin), timeAvg: ms2(timeAvg), timeMax: ms2(timeMax),
    bestIdx,
    globalBestFit: n6(globalBestFit),
    globalBestGen
  });

  if (isNewGlobal) {
    // Genotipo por defecto: siempre guardamos pesos + deadzone
    let genotype = {
      weights: [...(globalBest?.weights ?? bestInd.weights)],
      deadzone: globalBest?.deadzone ?? bestInd.deadzone
    };

    // Policy serializada opcionalmente
    let policy = null;

    if (typeof serialize === 'function') {
      try {
        const s = serialize(globalBest ?? bestInd);
        // Si serialize devuelve algo, solo sobreescribimos si viene definido
        if (s?.genotype) genotype = s.genotype;
        if (s?.policy) policy = s.policy;
      } catch {
        // intencional: no romper por serialización
      }
    }

    bestSnapshot = {
      gen: globalBestGen ?? gen,
      fitness: n6(globalBestFit ?? best),
      seed: (globalEvalSeed ?? params.seed) >>> 0,
      params,
      genotype,
      policy
    };

    saveJSON('best.json', bestSnapshot, 2);
  }
}

/**
 * Finaliza la corrida: descarga logs JSONL y asegura best.json si no hubo "nuevo mejor".
 */
export function onDone({ seed, params }) {
  if (!runId) return;

  saveText(`logs/run-${runId}.jsonl`, toJSONL(logs));

  if (!bestSnapshot && logs.length) {
    const last = logs[logs.length - 1];
    saveJSON('best.json', {
      gen: last.gen,
      fitness: last.best,
      seed: seed >>> 0,
      params,
      genotype: null,
      policy: null
    }, 2);
  }
}

/**
 * Opcional: empuja un paso de replay, por ejemplo { t, obs, action }.
 */
export function pushReplay(step) {
  if (step && typeof step === 'object') replaySteps.push(step);
}

/**
 * Opcional: exporta replay como replay/run-<id>.json
 */
export function exportReplay(name = `replay/run-${runId || tsId()}.json`) {
  const obj = { created_at: new Date().toISOString(), run_id: runId, steps: replaySteps.slice() };
  saveJSON(name, obj, 2);
}

/**
 * Opcional: también CSV para abrir en Excel.
 */
export function exportCSV() {
  if (!logs.length) return;
  const cols = Array.from(new Set(logs.flatMap(o => Object.keys(o))));
  const esc = v => (v == null ? '' : String(v).replace(/"/g, '""'));
  const head = cols.join(',');
  const rows = logs.map(o => cols.map(k => `"${esc(o[k])}"`).join(','));
  saveText(`logs/run-${runId}.csv`, [head, ...rows].join('\n'));
}

/**
 * Opcional: ZIP de todo (config, logs JSONL/CSV, best.json, replay si hay).
 * Carga JSZip y FileSaver por import dinámico desde CDN (sin npm).
 */
export async function exportZipAll({ includeCSV = true, includeReplay = true } = {}) {
  if (!runId) return;

  const [{ default: JSZip }, { saveAs }] = await Promise.all([
    import('https://esm.sh/jszip@3.10.1'),
    import('https://cdn.jsdelivr.net/npm/file-saver@2.0.5/+esm')
  ]);

  const zip = new JSZip();

  if (lastConfigObj) {
    zip.file(`config/run-${runId}.json`, JSON.stringify(lastConfigObj, null, 2));
  }
  if (logs.length) {
    zip.file(`logs/run-${runId}.jsonl`, toJSONL(logs));
    if (includeCSV) {
      const cols = Array.from(new Set(logs.flatMap(o => Object.keys(o))));
      const esc = v => (v == null ? '' : String(v).replace(/"/g, '""'));
      const head = cols.join(',');
      const rows = logs.map(o => cols.map(k => `"${esc(o[k])}"`).join(','));
      zip.file(`logs/run-${runId}.csv`, [head, ...rows].join('\n'));
    }
  }
  if (bestSnapshot) {
    zip.file('best.json', JSON.stringify(bestSnapshot, null, 2));
  }
  if (includeReplay && replaySteps.length) {
    zip.file(`replay/run-${runId}.json`, JSON.stringify({ run_id: runId, steps: replaySteps }, null, 2));
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  saveAs(blob, `run-${runId}.zip`);
}


export function getState() {
  return { runId, logs, bestSnapshot, lastConfigObj, replaySteps };
}
