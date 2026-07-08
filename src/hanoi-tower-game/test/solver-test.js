/**
 * solver-test.js — Auto-solver module verification
 * Can run in browser or Node environment.
 */

(function () {
  'use strict';

  var passed = 0;
  var failed = 0;
  var results = [];

  function assert(condition, msg) {
    if (condition) { passed++; results.push('✓ ' + msg); }
    else { failed++; results.push('✗ ' + msg); }
  }

  function assertEqual(a, b, msg) {
    if (a === b) { passed++; results.push('✓ ' + msg + ' (' + JSON.stringify(b) + ')'); }
    else { failed++; results.push('✗ ' + msg + ' (expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a) + ')'); }
  }

  console.log('--- solver.js verification ---');

  // Test 1: n=3 length = 7
  var m3 = solveHanoi(3, 0, 2, 1);
  assertEqual(m3.length, 7, 'solveHanoi(3): length = 7 (2³-1)');

  // Test 2: n=8 length = 255
  var m8 = solveHanoi(8, 0, 2, 1);
  assertEqual(m8.length, 255, 'solveHanoi(8): length = 255 (2⁸-1)');

  // Test 3: all move indices valid
  var allValid = m8.every(function (m) {
    return typeof m.from === 'number' && typeof m.to === 'number' &&
           m.from >= 0 && m.from <= 2 && m.to >= 0 && m.to <= 2 && m.from !== m.to;
  });
  assert(allValid, 'solveHanoi(8): all from/to in 0~2 and not equal');

  // Test 4: n=1 edge case
  var m1 = solveHanoi(1, 0, 2, 1);
  assertEqual(m1.length, 1, 'solveHanoi(1): length = 1');
  assertEqual(m1[0].from, 0, 'solveHanoi(1): from = 0');
  assertEqual(m1[0].to, 2, 'solveHanoi(1): to = 2');

  // Test 5: n=0 edge case (empty input)
  var m0 = solveHanoi(0, 0, 2, 1);
  assertEqual(m0.length, 0, 'solveHanoi(0): length = 0');

  // Test 6: Apply full solution and verify win
  var state = createGame(4);
  var moves = solveHanoi(4, 0, 2, 1);
  for (var i = 0; i < moves.length; i++) {
    state = moveDisk(state, moves[i].from, moves[i].to);
  }
  assertEqual(state.pegs[2].length, 4, 'n=4 completed: peg 2 has 4 disks');
  assert(checkWin(state), 'n=4 completed: checkWin = true');

  // Test 7: n=8 apply full solution and verify win
  var state8 = createGame(8);
  var moves8 = solveHanoi(8, 0, 2, 1);
  for (var j = 0; j < moves8.length; j++) {
    state8 = moveDisk(state8, moves8[j].from, moves8[j].to);
  }
  assertEqual(state8.pegs[2].length, 8, 'n=8 completed: peg 2 has 8 disks');
  assert(checkWin(state8), 'n=8 completed: checkWin = true');

  // Test 8: createAnimation API shape
  var testState = createGame(3);
  var mockRenderer = { render: function () {} };
  var anim = createAnimation(testState, mockRenderer);
  assert(typeof anim.start === 'function', 'createAnimation: start is a function');
  assert(typeof anim.pause === 'function', 'createAnimation: pause is a function');
  assert(typeof anim.resume === 'function', 'createAnimation: resume is a function');
  assert(typeof anim.stop === 'function', 'createAnimation: stop is a function');
  assert(typeof anim.setSpeed === 'function', 'createAnimation: setSpeed is a function');
  assert(typeof anim.setState === 'function', 'createAnimation: setState is a function');
  assertEqual(anim.isRunning, false, 'createAnimation: initial isRunning = false');
  assertEqual(anim.isPaused, false, 'createAnimation: initial isPaused = false');

  // Test 9: setSpeed boundary values
  anim.setSpeed(200);
  assertEqual(anim.isRunning, false, 'setSpeed(200) isRunning still false');
  anim.setSpeed(2000);
  anim.setSpeed(100);  // below minimum
  anim.setSpeed(3000); // above maximum
  anim.setSpeed('abc'); // invalid value
  anim.setSpeed(NaN);   // NaN
  anim.setSpeed(null);  // null

  // Test 10: pause/resume on non-running animation
  anim.pause();   // should not throw
  anim.resume();  // should not throw

  // Test 11: setState updates reference
  var newState = createGame(5);
  anim.setState(newState);
  assertEqual(anim.isRunning, false, 'setState isRunning still false');

  // ---- Summary ----
  var total = passed + failed;
  console.log('========================================');
  console.log('Tests completed: ' + total + ' (' + passed + ' passed, ' + failed + ' failed)');
  console.log('========================================');
  results.forEach(function (r) { console.log(r); });

  // Display results if in browser
  if (typeof document !== 'undefined') {
    var el = document.getElementById('test-results');
    if (el) {
      el.innerHTML =
        '<h2>solver.js Test Results: ' + passed + '/' + total + ' passed</h2>' +
        (failed > 0 ? '<p style="color:red">' + failed + ' failed</p>' : '<p style="color:green">All passed!</p>') +
        '<ul style="text-align:left;font-family:monospace;font-size:13px;">' +
        results.map(function (r) {
          var cls = r.charAt(0) === '\u2713' ? 'pass' : 'fail';
          return '<li class="' + cls + '">' + r + '</li>';
        }).join('') +
        '</ul>';
    }
  }
})();
