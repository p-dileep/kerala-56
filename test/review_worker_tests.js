'use strict';
// Worker queue for the card review (src/reviewWorker.js). Called from test/review.js.
const assert = require('assert');
const { reviewHand } = require('../src/review');
const { makeReviewQueue, reviewEnabled } = require('../src/reviewWorker');
const { cutDeal, deals, full } = require('./review');

module.exports = async function workerTests() {
  { // the worker gives the same review as the solver in this thread
    const q = makeReviewQueue();
    const h = cutDeal(deals[0], 3);
    assert.deepEqual(await q.enqueue(h), reviewHand(h));
    q.close();
    console.log('worker reviews a hand');
  }
  { // a full queue turns hands away
    const q = makeReviewQueue({ cap: 1 });
    const h = cutDeal(deals[1], 4);
    const [a, , c] = await Promise.all([q.enqueue(h), q.enqueue(h), q.enqueue(h)]);
    assert.ok(typeof a.best === 'number', 'first hand reviewed');
    assert.deepEqual(c, { v: 1, none: 'busy' });
    q.close();
    console.log('queue cap');
  }
  { // a job past the wall-clock guard gives "timeout"; the worker restarts and reviews the next hand
    const q = makeReviewQueue({ guardMs: 400 });
    assert.deepEqual(await q.enqueue(cutDeal(full, 0)), { v: 1, none: 'timeout' });
    const small = cutDeal(full, 7);
    assert.deepEqual(await q.enqueue(small), reviewHand(small));
    q.close();
    console.log('guard restarts the worker');
  }
  { // on / off
    assert.equal(reviewEnabled({ REVIEW: 'off' }), false);
    assert.equal(reviewEnabled({ REVIEW: 'on' }), true);
    console.log('review on / off');
  }
};
