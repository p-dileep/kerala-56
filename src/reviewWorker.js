'use strict';
/**
 * Runs the card review (src/review.js) in one worker thread, off the game loop: at most one core, one hand at a
 * time, in order. The worker starts with the first hand and exits after `idleMs` with nothing to do, so an idle
 * server holds none of the solver's memory. enqueue() never rejects: a hand that cannot be reviewed resolves to
 * { v: 1, none: 'busy' | 'timeout' | 'error' } (or 'budget' / 'players' / 'empty' from the solver itself).
 */
const os = require('os');
const { Worker, isMainThread, parentPort } = require('worker_threads');

if (!isMainThread) {
  const { reviewHand } = require('./review');
  parentPort.on('message', ({ id, hand, maxNodes }) => {
    let review;
    try { review = reviewHand(hand, { maxNodes }); } catch (err) { console.error('review error', err); review = { v: 1, none: 'error' }; }
    parentPort.postMessage({ id, review });
  });
}

// Off with REVIEW=off; on a single-core machine only with REVIEW=on, so it never competes with the game for the only core.
function reviewEnabled(env = process.env) {
  if (env.REVIEW === 'off') return false;
  if (env.REVIEW === 'on') return true;
  return (os.availableParallelism ? os.availableParallelism() : os.cpus().length) >= 2;
}

function makeReviewQueue({ maxNodes = Number(process.env.REVIEW_NODES) || 180e6, cap = 6, guardMs = 120000, idleMs = 60000, log = console.log } = {}) {
  let worker = null, current = null, guard = null, idle = null, seq = 0, closed = false;
  const waiting = [];

  function stopWorker() {
    if (!worker) return;
    const w = worker;
    worker = null;
    w.terminate().catch(() => {});
  }
  function startWorker() {
    const w = new Worker(__filename, { resourceLimits: { maxOldGenerationSizeMb: 96 } });
    w.on('message', ({ id, review }) => {
      if (w !== worker || !current || current.id !== id) return;
      log(`review ${Date.now() - current.at} ms ${review.nodes || 0} nodes${review.none ? ` (${review.none})` : ''}`);
      finish(review);
    });
    const lost = (why) => {
      if (w !== worker) return;          // an old worker we already let go of
      worker = null;
      if (current) { console.error('review worker lost:', why); finish({ v: 1, none: 'error' }); }
    };
    w.on('error', (err) => lost(err.message));
    w.on('exit', (code) => lost(`exit ${code}`));
    return w;
  }
  function finish(review) {
    clearTimeout(guard);
    const job = current;
    current = null;
    job.resolve(review);
    pump();
  }
  function pump() {
    if (current || closed) return;
    if (!waiting.length) {
      if (worker) {
        worker.unref();                   // an idle worker never keeps the process alive
        clearTimeout(idle);
        idle = setTimeout(stopWorker, idleMs);
        idle.unref();
      }
      return;
    }
    clearTimeout(idle);
    current = waiting.shift();
    current.at = Date.now();
    if (!worker) worker = startWorker();
    worker.ref();
    worker.postMessage({ id: current.id, hand: current.hand, maxNodes });
    guard = setTimeout(() => {
      log(`review stopped after ${guardMs} ms`);
      stopWorker();
      finish({ v: 1, none: 'timeout' });
    }, guardMs);
  }

  return {
    enqueue(hand) {
      if (closed) return Promise.resolve({ v: 1, none: 'error' });
      if (waiting.length + (current ? 1 : 0) >= cap) return Promise.resolve({ v: 1, none: 'busy' });
      return new Promise((resolve) => { waiting.push({ id: ++seq, hand, resolve }); pump(); });
    },
    close() {
      closed = true;
      clearTimeout(guard); clearTimeout(idle);
      stopWorker();
      if (current) { current.resolve({ v: 1, none: 'error' }); current = null; }
      while (waiting.length) waiting.shift().resolve({ v: 1, none: 'error' });
    }
  };
}

module.exports = { makeReviewQueue, reviewEnabled };
