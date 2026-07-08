/**
 * verify.js — Hanoi Tower game state management verification tests
 *
 * Usage: Open test.html in a browser, open Developer Tools → Console to view results.
 * All test results are summarized at the bottom of the page and in the console.
 */

(function () {
  'use strict';

  var passed = 0;
  var failed = 0;
  var results = [];

  function assert(condition, message) {
    if (condition) {
      passed++;
      results.push('✓ ' + message);
    } else {
      failed++;
      results.push('✗ ' + message);
    }
  }

  function assertEqual(actual, expected, message) {
    if (actual === expected) {
      passed++;
      results.push('✓ ' + message + ' (=' + JSON.stringify(expected) + ')');
    } else {
      failed++;
      results.push('✗ ' + message + ' (expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + ')');
    }
  }

  function assertDeepEqual(actual, expected, message) {
    var ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) {
      passed++;
      results.push('✓ ' + message);
    } else {
      failed++;
      results.push('✗ ' + message + ' (expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual) + ')');
    }
  }

  function assertThrows(fn, message) {
    try {
      fn();
      failed++;
      results.push('✗ ' + message + ' (no exception thrown)');
    } catch (e) {
      passed++;
      results.push('✓ ' + message + ' (threw ' + e.constructor.name + ': ' + e.message + ')');
    }
  }

  function runTests() {
    results = [];
    passed = 0;
    failed = 0;

    // =========================================================
    // Test Group 1: createGame basic functionality
    // =========================================================
    (function () {
      console.log('--- Test Group 1: createGame ---');

      // Edge case: createGame(3) produces correct initial state
      // Expected: 3 pegs, peg 0 has 3 disks with decreasing size from bottom to top
      var g = createGame(3);
      assertEqual(g.pegs.length, 3, 'createGame(3): 3 pegs');
      assertEqual(g.pegs[0].length, 3, 'createGame(3): peg 0 has 3 disks');
      assertEqual(g.pegs[1].length, 0, 'createGame(3): peg 1 is empty');
      assertEqual(g.pegs[2].length, 0, 'createGame(3): peg 2 is empty');
      assertEqual(g.pegs[0][0].size, 3, 'createGame(3): peg 0 bottom size=3');
      assertEqual(g.pegs[0][1].size, 2, 'createGame(3): peg 0 middle size=2');
      assertEqual(g.pegs[0][2].size, 1, 'createGame(3): peg 0 top size=1');
      assertEqual(g.diskCount, 3, 'createGame(3): diskCount=3');
      assertEqual(g.selectedPeg, null, 'createGame(3): selectedPeg=null');
      assertEqual(g.moveCount, 0, 'createGame(3): moveCount=0');
      assertEqual(g.isSolved, false, 'createGame(3): isSolved=false');
      assertEqual(g.isAnimating, false, 'createGame(3): isAnimating=false');

      // Edge case: createGame(8) — max value
      var g8 = createGame(8);
      assertEqual(g8.pegs[0].length, 8, 'createGame(8): peg 0 has 8 disks');
      assertEqual(g8.pegs[0][0].size, 8, 'createGame(8): bottom size=8');
      assertEqual(g8.pegs[0][7].size, 1, 'createGame(8): top size=1');
      assertEqual(g8.diskCount, 8, 'createGame(8): diskCount=8');
    })();

    // =========================================================
    // Test Group 2: createGame invalid input
    // =========================================================
    (function () {
      console.log('--- Test Group 2: createGame invalid input ---');

      // Invalid: diskCount=0
      assertThrows(function () { createGame(0); }, 'createGame(0) should throw');

      // Invalid: diskCount=-1
      assertThrows(function () { createGame(-1); }, 'createGame(-1) should throw');

      // Invalid: diskCount=9 (exceeds MAX_DISKS=8)
      assertThrows(function () { createGame(9); }, 'createGame(9) should throw');

      // Invalid: diskCount=2 (below MIN_DISKS=3)
      assertThrows(function () { createGame(2); }, 'createGame(2) should throw');

      // Invalid: diskCount=null
      assertThrows(function () { createGame(null); }, 'createGame(null) should throw');

      // Invalid: diskCount='3'
      assertThrows(function () { createGame('3'); }, 'createGame("3") should throw');

      // Invalid: diskCount=3.5
      assertThrows(function () { createGame(3.5); }, 'createGame(3.5) should throw');
    })();

    // =========================================================
    // Test Group 3: resetGame
    // =========================================================
    (function () {
      console.log('--- Test Group 3: resetGame ---');

      var g = createGame(4);
      // Move a few steps to change state
      var moved = moveDisk(g, 0, 1);
      moved = moveDisk(moved, 0, 2);
      var reset = resetGame(moved);

      assertEqual(reset.diskCount, 4, 'resetGame: diskCount preserved as 4');
      assertEqual(reset.pegs[0].length, 4, 'resetGame: peg 0 restored to 4 disks');
      assertEqual(reset.pegs[1].length, 0, 'resetGame: peg 1 is cleared');
      assertEqual(reset.pegs[2].length, 0, 'resetGame: peg 2 is cleared');
      assertEqual(reset.moveCount, 0, 'resetGame: moveCount reset to 0');
      assertEqual(reset.selectedPeg, null, 'resetGame: selectedPeg is null');
      assertEqual(reset.pegs[0][0].size, 4, 'resetGame: peg 0 bottom size=4');
      assertEqual(reset.pegs[0][3].size, 1, 'resetGame: peg 0 top size=1');
    })();

    // =========================================================
    // Test Group 4: getTopDisk
    // =========================================================
    (function () {
      console.log('--- Test Group 4: getTopDisk ---');

      var g = createGame(3);

      // Edge case: empty peg returns null
      assertEqual(getTopDisk(g, 1), null, 'getTopDisk empty peg returns null');
      assertEqual(getTopDisk(g, 2), null, 'getTopDisk empty peg returns null');

      // Normal: peg with disks returns top
      var top = getTopDisk(g, 0);
      assertEqual(top.size, 1, 'getTopDisk peg 0 top size=1');

      // Verify top changes after move
      var moved = moveDisk(g, 0, 2);
      assertEqual(getTopDisk(moved, 0).size, 2, 'getTopDisk after move, peg 0 top becomes size=2');
      assertEqual(getTopDisk(moved, 2).size, 1, 'getTopDisk after move, peg 2 top size=1');
    })();

    // =========================================================
    // Test Group 5: getPegHeight
    // =========================================================
    (function () {
      console.log('--- Test Group 5: getPegHeight ---');

      var g = createGame(5);
      assertEqual(getPegHeight(g, 0), 5, 'getPegHeight peg 0 height = 5');
      assertEqual(getPegHeight(g, 1), 0, 'getPegHeight peg 1 height = 0');
      assertEqual(getPegHeight(g, 2), 0, 'getPegHeight peg 2 height = 0');

      var moved = moveDisk(g, 0, 2);
      assertEqual(getPegHeight(moved, 0), 4, 'getPegHeight after move, peg 0 height = 4');
      assertEqual(getPegHeight(moved, 2), 1, 'getPegHeight after move, peg 2 height = 1');
    })();

    // =========================================================
    // Test Group 6: canMove
    // =========================================================
    (function () {
      console.log('--- Test Group 6: canMove ---');

      var g = createGame(3);

      // Edge case: from is empty → false
      assertEqual(canMove(g, 1, 0), false, 'canMove: empty peg → false');
      assertEqual(canMove(g, 2, 0), false, 'canMove: empty peg → false');

      // Valid: to is empty → true
      assertEqual(canMove(g, 0, 1), true, 'canMove: move to empty peg → true');
      assertEqual(canMove(g, 0, 2), true, 'canMove: move to empty peg → true');

      // Scenario: larger disk cannot be placed on smaller disk
      var moved = moveDisk(g, 0, 2); // peg 0: [3,2], peg 2: [1]
      assertEqual(canMove(moved, 0, 2), true, 'canMove: size=2 to empty peg → true');

      // peg 0 top size=2, peg 2 top size=1, larger(2) cannot go on smaller(1)
      var moved2 = moveDisk(moved, 0, 1); // peg 0: [3], peg 1: [2], peg 2: [1]
      // size=1(from 2) → size=2(to 1) → small can go on large
      assertEqual(canMove(moved2, 2, 1), true, 'canMove: small(size=1) on large(size=2) → true');
      // size=2(from 1) → size=1(to 2) → large cannot go on small
      assertEqual(canMove(moved2, 1, 2), false, 'canMove: large(size=2) on small(size=1) → false');
      // size=3(from 0) → size=2(to 1) → large cannot go on small
      assertEqual(canMove(moved2, 0, 1), false, 'canMove: large(size=3) on small(size=2) → false');

      // Valid move: size=3 → empty peg
      assertEqual(canMove(moved2, 0, 2), true, 'canMove: size=3 to empty peg → true');
    })();

    // =========================================================
    // Test Group 7: moveDisk immutability
    // =========================================================
    (function () {
      console.log('--- Test Group 7: moveDisk immutability ---');

      var g = createGame(3);
      var moved = moveDisk(g, 0, 2);

      // Original state unchanged
      assertEqual(g.pegs[0].length, 3, 'moveDisk: original peg 0 length unchanged');
      assertEqual(g.pegs[2].length, 0, 'moveDisk: original peg 2 length unchanged');
      assertEqual(g.moveCount, 0, 'moveDisk: original moveCount unchanged');

      // New state is correct
      assertEqual(moved.pegs[0].length, 2, 'moveDisk: new peg 0 length = 2');
      assertEqual(moved.pegs[2].length, 1, 'moveDisk: new peg 2 length = 1');
      assertEqual(moved.pegs[2][0].size, 1, 'moveDisk: peg 2 top size=1');

      // Multiple moves still immutable
      var moved2 = moveDisk(g, 0, 1);
      assertEqual(g.pegs[0].length, 3, 'moveDisk: original unchanged after multiple calls');
      assertEqual(moved.pegs[0].length, 2, 'moveDisk: first move result unaffected');
      assertEqual(moved2.pegs[1].length, 1, 'moveDisk: second move result correct');
    })();

    // =========================================================
    // Test Group 8: checkWin
    // =========================================================
    (function () {
      console.log('--- Test Group 8: checkWin ---');

      var g = createGame(3);

      // Initial state → false
      assertEqual(checkWin(g), false, 'checkWin: initial state → false');

      // Manually construct win state
      var winState = {
        pegs: [[], [], [{ size: 3 }, { size: 2 }, { size: 1 }]],
        diskCount: 3
      };
      assertEqual(checkWin(winState), true, 'checkWin: peg 2 full with 3 disks → true');

      // Partial move → false
      var moved = moveDisk(g, 0, 2);
      assertEqual(checkWin(moved), false, 'checkWin: after 1 move → false');

      // Construct 8-disk win state
      var win8 = {
        pegs: [[], [], []],
        diskCount: 8
      };
      for (var i = 8; i >= 1; i--) {
        win8.pegs[2].push({ size: i });
      }
      assertEqual(checkWin(win8), true, 'checkWin: diskCount=8 win → true');

      // diskCount mismatch → false
      var falseWin = {
        pegs: [[], [], [{ size: 3 }, { size: 2 }, { size: 1 }]],
        diskCount: 5
      };
      assertEqual(checkWin(falseWin), false, 'checkWin: diskCount mismatch → false');
    })();

    // =========================================================
    // Test Group 9: cloneGame
    // =========================================================
    (function () {
      console.log('--- Test Group 9: cloneGame ---');

      var g = createGame(4);
      var clone = cloneGame(g);

      // Clone is structurally equal to original
      assertDeepEqual(clone, g, 'cloneGame: clone structurally equal to original');

      // Modify original, clone unaffected
      g.pegs[0][0].size = 99;
      assertEqual(clone.pegs[0][0].size, 4, 'cloneGame: modifying original disk does not affect clone');

      // Modify clone, original unaffected
      clone.pegs[0][1].size = 88;
      assertEqual(g.pegs[0][1].size, 3, 'cloneGame: modifying clone disk does not affect original');

      // Replace entire peg, original unaffected
      var clone2 = cloneGame(g);
      clone2.pegs[0] = [];
      assertEqual(g.pegs[0].length, 4, 'cloneGame: replacing clone peg does not affect original');

      // Selected state is also correctly cloned
      var g2 = createGame(3);
      g2.selectedPeg = 1;
      g2.moveCount = 5;
      g2.isSolved = false;
      g2.isAnimating = true;
      var clone3 = cloneGame(g2);
      assertEqual(clone3.selectedPeg, 1, 'cloneGame: clone selectedPeg');
      assertEqual(clone3.moveCount, 5, 'cloneGame: clone moveCount');
      assertEqual(clone3.isAnimating, true, 'cloneGame: clone isAnimating');
      // Modifying clone does not affect original
      clone3.selectedPeg = 0;
      assertEqual(g2.selectedPeg, 1, 'cloneGame: modifying clone selectedPeg does not affect original');
    })();

    // =========================================================
    // Test Group 10: InteractionController API
    // =========================================================
    (function () {
      console.log('--- Test Group 10: InteractionController API ---');

      var mockCanvas = {
        _clickHandler: null,
        addEventListener: function (type, handler) {
          if (type === 'click') this._clickHandler = handler;
        },
        _simulateClick: function (clientX, clientY) {
          if (this._clickHandler) {
            this._clickHandler({ clientX: clientX, clientY: clientY });
          }
        },
        getBoundingClientRect: function () {
          return { left: 0, top: 0, width: 800, height: 450, bottom: 450, right: 800 };
        },
        width: 800,
        height: 450
      };

      var mockRenderer = {
        _renderCount: 0,
        _lastFlashPeg: null,
        _lastRenderState: null,
        render: function (state) {
          this._renderCount++;
          this._lastRenderState = state;
        },
        getPegBounds: function (pegIndex) {
          var xPos = CONFIG.CANVAS_WIDTH / 6 * (pegIndex * 2 + 1);
          return {
            x: xPos - CONFIG.PEG_BASE_LENGTH / 2,
            y: CONFIG.PEG_TOP_Y,
            width: CONFIG.PEG_BASE_LENGTH,
            height: CONFIG.PEG_BASE_Y + CONFIG.PEG_BASE_HEIGHT - CONFIG.PEG_TOP_Y
          };
        },
        flashFeedback: function (pegIndex) {
          this._lastFlashPeg = pegIndex;
        }
      };

      // Edge case: API shape
      var g10 = createGame(3);
      var ctrl = initInteraction(mockCanvas, g10, mockRenderer);
      assertEqual(typeof ctrl.disable, 'function', 'ctrl.disable is a function');
      assertEqual(typeof ctrl.enable, 'function', 'ctrl.enable is a function');
      assertEqual(ctrl.isEnabled, true, 'isEnabled initially true');

      // disable/enable toggle
      ctrl.disable();
      assertEqual(ctrl.isEnabled, false, 'isEnabled = false after disable()');
      ctrl.enable();
      assertEqual(ctrl.isEnabled, true, 'isEnabled = true after enable()');

      // No error without onMove/onStateChange callbacks
      var ctrlNoop = initInteraction(mockCanvas, createGame(3), mockRenderer);
      assertEqual(typeof ctrlNoop.disable, 'function', 'no error without callbacks');
    })();

    // =========================================================
    // Test Group 11: Interaction state machine — state transitions
    // =========================================================
    (function () {
      console.log('--- Test Group 11: Interaction state machine ---');

      var testState;
      var captureState = [];
      var captureMoves = [];

      function resetMocks() {
        mockCanvas._clickHandler = null;
        mockRenderer._renderCount = 0;
        mockRenderer._lastFlashPeg = null;
        mockRenderer._lastRenderState = null;
        captureState = [];
        captureMoves = [];
      }

      // Shared mock objects
      var mockCanvas = {
        _clickHandler: null,
        addEventListener: function (type, handler) {
          if (type === 'click') this._clickHandler = handler;
        },
        _simulateClick: function (clientX, clientY) {
          if (this._clickHandler) {
            this._clickHandler({ clientX: clientX, clientY: clientY });
          }
        },
        getBoundingClientRect: function () {
          return { left: 0, top: 0, width: 800, height: 450, bottom: 450, right: 800 };
        },
        width: 800,
        height: 450
      };

      var mockRenderer = {
        _renderCount: 0,
        _lastFlashPeg: null,
        _lastRenderState: null,
        render: function (state) {
          this._renderCount++;
          this._lastRenderState = state;
        },
        getPegBounds: function (pegIndex) {
          var xPos = CONFIG.CANVAS_WIDTH / 6 * (pegIndex * 2 + 1);
          return {
            x: xPos - CONFIG.PEG_BASE_LENGTH / 2,
            y: CONFIG.PEG_TOP_Y,
            width: CONFIG.PEG_BASE_LENGTH,
            height: CONFIG.PEG_BASE_Y + CONFIG.PEG_BASE_HEIGHT - CONFIG.PEG_TOP_Y
          };
        },
        flashFeedback: function (pegIndex) {
          this._lastFlashPeg = pegIndex;
        }
      };

      // ========== Scene 1: IDLE → click peg with disks → SELECTED ==========
      (function () {
        resetMocks();
        testState = createGame(3);
        // Edge case: select peg 0 (has disks)
        initInteraction(mockCanvas, testState, mockRenderer,
          function (mc) { captureMoves.push(mc); },
          function (s) { captureState.push(s); }
        );
        // Click peg 0 area (x ≈ 133, y = 200)
        mockCanvas._simulateClick(133, 200);

        assertEqual(mockRenderer._renderCount, 1, 'Scene 1: render called');
        // Edge case: onStateChange should be called back
        assertEqual(captureState.length, 1, 'Scene 1: onStateChange called');
        if (captureState.length > 0) {
          assertEqual(captureState[0].selectedPeg, 0, 'Scene 1: selectedPeg = 0');
          assertEqual(captureMoves.length, 0, 'Scene 1: no move triggered');
        }
      })();

      // ========== Scene 2: SELECTED → click same peg → IDLE (deselect) ==========
      (function () {
        resetMocks();
        testState = createGame(3);
        testState.selectedPeg = 0; // Pre-select peg 0
        initInteraction(mockCanvas, testState, mockRenderer,
          function (mc) { captureMoves.push(mc); },
          function (s) { captureState.push(s); }
        );
        mockCanvas._simulateClick(133, 200); // Click peg 0 again

        assertEqual(mockRenderer._renderCount, 1, 'Scene 2: render called');
        if (captureState.length > 0) {
          assertEqual(captureState[0].selectedPeg, null, 'Scene 2: selectedPeg = null (deselected)');
        }
      })();

      // ========== Scene 3: SELECTED → click different peg → invalid move → red flash ==========
      (function () {
        resetMocks();
        // Construct invalid scenario: peg 0 top size=2, peg 2 top size=1, select peg 0, click peg 2
        testState = {
          pegs: [[{ size: 3 }, { size: 2 }], [], [{ size: 1 }]],
          diskCount: 3,
          selectedPeg: 0,
          moveCount: 1,
          isSolved: false,
          isAnimating: false
        };
        // Edge case: larger(2) cannot go on smaller(1)
        initInteraction(mockCanvas, testState, mockRenderer,
          function (mc) { captureMoves.push(mc); },
          function (s) { captureState.push(s); }
        );
        // Click peg 2 (x ≈ 667)
        mockCanvas._simulateClick(667, 200);

        // Edge case: flashFeedback called, selectedPeg preserved
        assertEqual(mockRenderer._lastFlashPeg, 2, 'Scene 3: flashFeedback called (peg 2 red flash)');
        assertEqual(captureMoves.length, 0, 'Scene 3: onMove not triggered');
        assertEqual(testState.selectedPeg, 0, 'Scene 3: peg 0 remains selected');
      })();

      // ========== Scene 4: SELECTED → click different peg → valid move ==========
      (function () {
        resetMocks();
        testState = {
          pegs: [[{ size: 3 }, { size: 2 }], [], [{ size: 1 }]],
          diskCount: 3,
          selectedPeg: 0,
          moveCount: 1,
          isSolved: false,
          isAnimating: false
        };
        // Edge case: small(2) can move to empty peg(1)
        initInteraction(mockCanvas, testState, mockRenderer,
          function (mc) { captureMoves.push(mc); },
          function (s) { captureState.push(s); }
        );
        // Click peg 1 (empty) (x ≈ 400)
        mockCanvas._simulateClick(400, 200);

        assertEqual(captureMoves.length, 1, 'Scene 4: onMove called');
        if (captureMoves.length > 0) {
          assertEqual(captureMoves[0], 2, 'Scene 4: moveCount incremented to 2');
        }
        if (captureState.length > 0) {
          // Edge case: state after move, peg 0 only has size=3, peg 1 has size=2
          var s = captureState[0];
          assertEqual(s.pegs[0].length, 1, 'Scene 4: peg 0 has 1 disk left');
          assertEqual(s.pegs[1].length, 1, 'Scene 4: peg 1 has 1 disk');
          assertEqual(s.pegs[1][0].size, 2, 'Scene 4: peg 1 disk size=2');
          assertEqual(s.selectedPeg, null, 'Scene 4: selectedPeg = null');
          assertEqual(s.moveCount, 2, 'Scene 4: moveCount = 2');
        }
      })();

      // ========== Scene 5: Edge case — click blank area between pegs ==========
      (function () {
        resetMocks();
        testState = createGame(3);
        initInteraction(mockCanvas, testState, mockRenderer,
          function (mc) { captureMoves.push(mc); },
          function (s) { captureState.push(s); }
        );
        // Click between two pegs (x=250, peg 0 right edge ≈ 223, peg 1 left edge ≈ 310)
        mockCanvas._simulateClick(250, 200);

        // Edge case: no peg selected
        assertEqual(mockRenderer._renderCount, 0, 'Scene 5: render not called');
        assertEqual(captureState.length, 0, 'Scene 5: onStateChange not called');
        assertEqual(testState.selectedPeg, null, 'Scene 5: selectedPeg still null');
      })();

      // ========== Scene 6: Edge case — click empty peg in IDLE state ==========
      (function () {
        resetMocks();
        testState = createGame(3);
        initInteraction(mockCanvas, testState, mockRenderer,
          function (mc) { captureMoves.push(mc); },
          function (s) { captureState.push(s); }
        );
        // Edge case: click empty peg 1
        mockCanvas._simulateClick(400, 200);

        assertEqual(mockRenderer._renderCount, 0, 'Scene 6: render not called');
        assertEqual(testState.selectedPeg, null, 'Scene 6: selectedPeg still null');
      })();

      // ========== Scene 7: Edge case — isAnimating=true ignores click ==========
      (function () {
        resetMocks();
        testState = createGame(3);
        testState.isAnimating = true;
        initInteraction(mockCanvas, testState, mockRenderer,
          function (mc) { captureMoves.push(mc); },
          function (s) { captureState.push(s); }
        );
        // Click peg 0 (has disks)
        mockCanvas._simulateClick(133, 200);

        // Edge case: animation in progress, click ignored
        assertEqual(mockRenderer._renderCount, 0, 'Scene 7: render not called');
        assertEqual(captureState.length, 0, 'Scene 7: onStateChange not called');
        assertEqual(testState.selectedPeg, null, 'Scene 7: selectedPeg still null');
      })();

      // ========== Scene 8: Edge case — disable state ignores click ==========
      (function () {
        resetMocks();
        testState = createGame(3);
        var ctrl = initInteraction(mockCanvas, testState, mockRenderer,
          function (mc) { captureMoves.push(mc); },
          function (s) { captureState.push(s); }
        );
        ctrl.disable();
        mockCanvas._simulateClick(133, 200);

        // Edge case: click ignored when disabled
        assertEqual(mockRenderer._renderCount, 0, 'Scene 8: render not called');
        assertEqual(testState.selectedPeg, null, 'Scene 8: selectedPeg still null');
      })();

      // ========== Scene 9: Edge case — rapid consecutive clicks on same peg ==========
      (function () {
        resetMocks();
        testState = createGame(3);
        initInteraction(mockCanvas, testState, mockRenderer,
          function (mc) { captureMoves.push(mc); },
          function (s) { captureState.push(s); }
        );
        // Rapidly click peg 0 three times
        mockCanvas._simulateClick(133, 200); // IDLE → SELECTED
        mockCanvas._simulateClick(133, 200); // SELECTED → IDLE
        mockCanvas._simulateClick(133, 200); // IDLE → SELECTED

        // Edge case: toggling back and forth should not error
        assertEqual(captureState.length, 3, 'Scene 9: three onStateChange calls');
        if (captureState.length >= 3) {
          assertEqual(captureState[0].selectedPeg, 0, 'Scene 9-1: peg 0 selected');
          assertEqual(captureState[1].selectedPeg, null, 'Scene 9-2: deselected');
          assertEqual(captureState[2].selectedPeg, 0, 'Scene 9-3: peg 0 selected again');
        }
      })();

      // ========== Scene 10: Edge case — SELECTED + click blank area ==========
      (function () {
        resetMocks();
        testState = createGame(3);
        testState.selectedPeg = 0;
        initInteraction(mockCanvas, testState, mockRenderer,
          function (mc) { captureMoves.push(mc); },
          function (s) { captureState.push(s); }
        );
        // Click blank area
        mockCanvas._simulateClick(250, 200);

        // Edge case: clicking blank area in SELECTED state → ignored (remains selected)
        assertEqual(mockRenderer._renderCount, 0, 'Scene 10: render not called');
        assertEqual(captureState.length, 0, 'Scene 10: onStateChange not called');
        assertEqual(testState.selectedPeg, 0, 'Scene 10: peg 0 remains selected');
      })();
    })();

    // =========================================================
    // Test Group 12: Win detection — onWin callback trigger
    // =========================================================
    (function () {
      console.log('--- Test Group 12: Win detection ---');

      var testState;
      var winCalled = false;
      var winMoveCount = -1;

      function resetMocks() {
        mockCanvas._clickHandler = null;
        mockRenderer._renderCount = 0;
        mockRenderer._lastFlashPeg = null;
        mockRenderer._lastRenderState = null;
        winCalled = false;
        winMoveCount = -1;
      }

      // Shared mock objects (same as Test Group 11)
      var mockCanvas = {
        _clickHandler: null,
        addEventListener: function (type, handler) {
          if (type === 'click') this._clickHandler = handler;
        },
        _simulateClick: function (clientX, clientY) {
          if (this._clickHandler) {
            this._clickHandler({ clientX: clientX, clientY: clientY });
          }
        },
        getBoundingClientRect: function () {
          return { left: 0, top: 0, width: 800, height: 450, bottom: 450, right: 800 };
        },
        width: 800,
        height: 450
      };

      var mockRenderer = {
        _renderCount: 0,
        _lastFlashPeg: null,
        _lastRenderState: null,
        render: function (state) {
          this._renderCount++;
          this._lastRenderState = state;
        },
        getPegBounds: function (pegIndex) {
          var xPos = CONFIG.CANVAS_WIDTH / 6 * (pegIndex * 2 + 1);
          return {
            x: xPos - CONFIG.PEG_BASE_LENGTH / 2,
            y: CONFIG.PEG_TOP_Y,
            width: CONFIG.PEG_BASE_LENGTH,
            height: CONFIG.PEG_BASE_Y + CONFIG.PEG_BASE_HEIGHT - CONFIG.PEG_TOP_Y
          };
        },
        flashFeedback: function (pegIndex) {
          this._lastFlashPeg = pegIndex;
        }
      };

      // ========== Scene 1: Final step before guaranteed win → onWin called ==========
      (function () {
        resetMocks();
        // Construct pre-win state for 3 disks: peg 0=[1], peg 2=[3,2], peg 0 selected
        // Final step: size=1 moves to peg 2 → peg 2=[3,2,1] → win
        testState = {
          pegs: [
            [{ size: 1 }],
            [],
            [{ size: 3 }, { size: 2 }]
          ],
          diskCount: 3,
          selectedPeg: 0,
          moveCount: 6,
          isSolved: false,
          isAnimating: false
        };

        initInteraction(mockCanvas, testState, mockRenderer,
          function () {},
          function () {},
          function (mc) {
            winCalled = true;
            winMoveCount = mc;
          }
        );

        // Click peg 2 (x ≈ 667)
        mockCanvas._simulateClick(667, 200);

        // Edge case: win callback triggered
        assertEqual(winCalled, true, 'Scene 1: onWin called after winning move');
        assertEqual(winMoveCount, 7, 'Scene 1: onWin received moveCount = 7');
        // Edge case: state after move is correct
        if (mockRenderer._lastRenderState) {
          var s = mockRenderer._lastRenderState;
          assertEqual(s.pegs[2].length, 3, 'Scene 1: peg 2 has 3 disks');
          assertEqual(s.isSolved, true, 'Scene 1: isSolved = true');
          assertEqual(s.selectedPeg, null, 'Scene 1: selectedPeg = null');
        }
      })();

      // ========== Scene 2: Non-winning move → onWin NOT called ==========
      (function () {
        resetMocks();
        testState = {
          pegs: [
            [{ size: 1 }],
            [{ size: 2 }],
            [{ size: 3 }]
          ],
          diskCount: 3,
          selectedPeg: 0,
          moveCount: 3,
          isSolved: false,
          isAnimating: false
        };
        // Edge case: size=1 → size=2 is valid but not a win
        initInteraction(mockCanvas, testState, mockRenderer,
          function () {},
          function () {},
          function (mc) {
            winCalled = true;
          }
        );
        // Click peg 1 (x = 400)
        mockCanvas._simulateClick(400, 200);

        // Edge case: move valid but not winning
        assertEqual(winCalled, false, 'Scene 2: non-winning move does not trigger onWin');
        if (mockRenderer._lastRenderState) {
          assertEqual(mockRenderer._lastRenderState.isSolved, false, 'Scene 2: isSolved = false');
        }
      })();

      // ========== Scene 3: 8-disk pre-win last step ==========
      (function () {
        resetMocks();
        // Edge case: win detection at max 8 disks
        var peg2 = [];
        for (var i = 8; i >= 2; i--) {
          peg2.push({ size: i });
        }
        testState = {
          pegs: [
            [{ size: 1 }],
            [],
            peg2  // [8,7,6,5,4,3,2]
          ],
          diskCount: 8,
          selectedPeg: 0,
          moveCount: 254,
          isSolved: false,
          isAnimating: false
        };

        initInteraction(mockCanvas, testState, mockRenderer,
          function () {},
          function () {},
          function (mc) {
            winCalled = true;
            winMoveCount = mc;
          }
        );
        // Click peg 2 (x ≈ 667)
        mockCanvas._simulateClick(667, 200);

        // Edge case: 8-disk win
        assertEqual(winCalled, true, 'Scene 3: 8-disk win onWin called');
        assertEqual(winMoveCount, 255, 'Scene 3: moveCount = 255');
      })();

      // ========== Scene 4: Empty peg no move triggers win ==========
      (function () {
        resetMocks();
        testState = {
          pegs: [
            [{ size: 3 }, { size: 2 }, { size: 1 }],
            [],
            []
          ],
          diskCount: 3,
          selectedPeg: null,
          moveCount: 0,
          isSolved: false,
          isAnimating: false
        };
        // Edge case: initial state, peg 2 is empty, clicking peg 2 should not trigger win
        initInteraction(mockCanvas, testState, mockRenderer,
          function () {},
          function () {},
          function () { winCalled = true; }
        );
        // Click peg 2 (empty, ignored when no peg selected)
        mockCanvas._simulateClick(667, 200);

        // Edge case: no move, no win
        assertEqual(winCalled, false, 'Scene 4: clicking empty peg without selection does not trigger win');
      })();
    })();

    // =========================================================
    // Test Group 13: InteractionController.setState — state synchronization
    // =========================================================
    (function () {
      console.log('--- Test Group 13: setState ---');

      var mockCanvas = {
        _clickHandler: null,
        addEventListener: function (type, handler) {
          if (type === 'click') this._clickHandler = handler;
        },
        _simulateClick: function (clientX, clientY) {
          if (this._clickHandler) {
            this._clickHandler({ clientX: clientX, clientY: clientY });
          }
        },
        getBoundingClientRect: function () {
          return { left: 0, top: 0, width: 800, height: 450, bottom: 450, right: 800 };
        },
        width: 800,
        height: 450
      };

      var mockRenderer = {
        _renderCount: 0,
        _lastRenderState: null,
        render: function (state) {
          this._renderCount++;
          this._lastRenderState = state;
        },
        getPegBounds: function (pegIndex) {
          var xPos = CONFIG.CANVAS_WIDTH / 6 * (pegIndex * 2 + 1);
          return {
            x: xPos - CONFIG.PEG_BASE_LENGTH / 2,
            y: CONFIG.PEG_TOP_Y,
            width: CONFIG.PEG_BASE_LENGTH,
            height: CONFIG.PEG_BASE_Y + CONFIG.PEG_BASE_HEIGHT - CONFIG.PEG_TOP_Y
          };
        },
        flashFeedback: function () {}
      };

      // ========== Scene 1: setState exists and is a function ==========
      (function () {
        var g = createGame(3);
        var ctrl = initInteraction(mockCanvas, g, mockRenderer);
        assertEqual(typeof ctrl.setState, 'function', 'Scene 1: setState is a function');
      })();

      // ========== Scene 2: setState updates internal state, subsequent clicks use new state ==========
      (function () {
        mockRenderer._renderCount = 0;
        mockRenderer._lastRenderState = null;
        var g = createGame(3);
        var ctrl = initInteraction(mockCanvas, g, mockRenderer);
        var newState = createGame(5);
        ctrl.setState(newState);
        // Click peg 0 — new state peg 0 has 5 disks, should select
        mockCanvas._simulateClick(133, 200);
        assertEqual(mockRenderer._renderCount, 1, 'Scene 2: click triggers render after setState');
        if (mockRenderer._lastRenderState) {
          assertEqual(mockRenderer._lastRenderState.diskCount, 5, 'Scene 2: new state diskCount = 5');
          assertEqual(mockRenderer._lastRenderState.selectedPeg, 0, 'Scene 2: selectedPeg = 0 after clicking peg 0');
        }
      })();

      // ========== Scene 3: Multiple setState calls then interaction works ==========
      (function () {
        mockRenderer._renderCount = 0;
        var g = createGame(3);
        var ctrl = initInteraction(mockCanvas, g, mockRenderer);
        ctrl.setState(createGame(4));
        ctrl.setState(createGame(5));
        ctrl.setState(createGame(6));
        mockRenderer._renderCount = 0;
        mockCanvas._simulateClick(133, 200);
        assertEqual(mockRenderer._renderCount, 1, 'Scene 3: click works after multiple setState calls');
        if (mockRenderer._lastRenderState) {
          assertEqual(mockRenderer._lastRenderState.diskCount, 6, 'Scene 3: final state diskCount = 6');
        }
      })();

      // ========== Scene 4: Edge case — setState works in disable mode ==========
      (function () {
        mockRenderer._renderCount = 0;
        var g = createGame(3);
        var ctrl = initInteraction(mockCanvas, g, mockRenderer);
        ctrl.disable();
        // setState can still update reference after disable
        ctrl.setState(createGame(7));
        ctrl.enable();
        // Edge case: click works after disable → setState → enable
        mockCanvas._simulateClick(133, 200);
        assertEqual(mockRenderer._renderCount, 1, 'Scene 4: click works after disable→setState→enable');
        if (mockRenderer._lastRenderState) {
          assertEqual(mockRenderer._lastRenderState.diskCount, 7, 'Scene 4: final state diskCount = 7');
        }
      })();

      // ========== Scene 5: Edge case — setState no argument no error (no-op) ==========
      (function () {
        var g = createGame(3);
        var ctrl = initInteraction(mockCanvas, g, mockRenderer);
        var threw = false;
        try {
          ctrl.setState();
        } catch (e) {
          threw = true;
        }
        assertEqual(threw, false, 'Scene 5: setState() with no argument does not error');
      })();

      // ========== Scene 6: Edge case — deselect same peg after setState ==========
      (function () {
        mockRenderer._renderCount = 0;
        mockRenderer._lastRenderState = null;
        var g = createGame(3);
        g.selectedPeg = 0; // Pre-selected
        var ctrl = initInteraction(mockCanvas, g, mockRenderer);
        // Replace with a new state via setState (with selectedPeg=null)
        var newState = createGame(4);
        ctrl.setState(newState);
        // Click peg 0 — new state IDLE → should select
        mockCanvas._simulateClick(133, 200);
        if (mockRenderer._lastRenderState) {
          assertEqual(mockRenderer._lastRenderState.selectedPeg, 0, 'Scene 6: starting from IDLE after setState, should be selectable');
          assertEqual(mockRenderer._lastRenderState.diskCount, 4, 'Scene 6: diskCount = 4');
        }
      })();
    })();

    // =========================================================
    // Summary
    // =========================================================
    var total = passed + failed;
    console.log('========================================');
    console.log('Tests completed: ' + total + ' (' + passed + ' passed, ' + failed + ' failed)');
    console.log('========================================');

    results.forEach(function (r) { console.log(r); });

    // Display results on page
    var el = document.getElementById('test-results');
    if (el) {
      el.innerHTML =
        '<h2>Test Results: ' + passed + '/' + total + ' passed</h2>' +
        (failed > 0 ? '<p style="color:red">' + failed + ' failed</p>' : '<p style="color:green">All passed!</p>') +
        '<ul style="text-align:left;font-family:monospace;font-size:13px;">' +
        results.map(function (r) {
          var cls = r.charAt(0) === '✓' ? 'pass' : 'fail';
          return '<li class="' + cls + '">' + r + '</li>';
        }).join('') +
        '</ul>';
    }
  }

  // Run tests after page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runTests);
  } else {
    runTests();
  }
})();
