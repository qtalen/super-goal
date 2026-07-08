/**
 * solver.js — Auto-solve module
 *
 * Implements the recursive Tower of Hanoi solving algorithm and a requestAnimationFrame-based animation controller.
 * Depends on game-state.js and renderer.js being loaded first.
 */

/**
 * Generate the optimal move sequence for Tower of Hanoi (recursive algorithm)
 *
 * Uses an accumulator pattern to avoid intermediate array allocations; recursion depth = n (max 8), no stack overflow risk.
 *
 * @param {number} n     - Number of disks
 * @param {number} from  - Source peg index
 * @param {number} to    - Target peg index
 * @param {number} aux   - Auxiliary peg index
 * @returns {Move[]} Array of move steps (length = 2^n - 1)
 */
function solveHanoi(n, from, to, aux) {
  var moves = [];

  function generate(n, from, to, aux) {
    if (n === 0) return;
    generate(n - 1, from, aux, to);
    moves.push({ from: from, to: to });
    generate(n - 1, aux, to, from);
  }

  generate(n, from, to, aux);
  return moves;
}

/**
 * Create an animation controller
 *
 * Uses discrete-step animation (not smooth movement): each step directly changes the state and does a full redraw.
 * Frame-driven: requestAnimationFrame + internal timer controls when each step triggers.
 *
 * @param {GameState} state   - Game state reference (mutated in place during animation)
 * @param {Renderer} renderer - Renderer instance
 * @returns {AnimationController}
 */
function createAnimation(state, renderer) {
  var _moves = [];           // Move sequence
  var _currentStep = 0;      // Current step index being executed
  var _intervalMs = CONFIG.ANIMATION_DEFAULT_INTERVAL; // Default 500ms
  var _isPaused = false;
  var _isRunning = false;
  var _rafId = null;
  var _lastStepTime = 0;
  var _onFinish = null;      // Animation finish callback

  /**
   * requestAnimationFrame loop
   * Each frame checks: is running, is paused, has interval elapsed
   * @param {number} timestamp
   * @param {Function} [externalOnStep] - External per-step callback (passed via closure)
   */
  function loop(timestamp, externalOnStep) {
    if (!_isRunning) return;

    if (_isPaused) {
      _rafId = requestAnimationFrame(function (ts) { loop(ts, externalOnStep); });
      return;
    }

    if (timestamp - _lastStepTime >= _intervalMs) {
      var move = _moves[_currentStep];

      // Execute one step: moveDisk → render → moveCount++
      var newState = moveDisk(state, move.from, move.to);
      newState.isAnimating = true;
      newState.moveCount = state.moveCount + 1;
      // Mutate the state reference to point to the new state (external closures referencing state will be updated)
      state.pegs = newState.pegs;
      state.moveCount = newState.moveCount;
      state.diskCount = newState.diskCount;
      state.selectedPeg = null;
      state.isSolved = newState.isSolved;
      // isAnimating stays true

      renderer.render(state);

      // Move count update callback
      if (externalOnStep) {
        externalOnStep(state);
      }

      _currentStep++;
      _lastStepTime = timestamp;

      if (_currentStep >= _moves.length) {
        // Animation completed normally
        state.isAnimating = false;
        _isRunning = false;
        _rafId = null;

        if (_onFinish) {
          _onFinish(state);
        }
        return;
      }
    }

    _rafId = requestAnimationFrame(function (ts) { loop(ts, externalOnStep); });
  }

  return {
    /**
     * Start the auto-solve animation
     * @param {Move[]} moves         - Move sequence
     * @param {Function} [onFinish]  - Animation finish callback (receives GameState)
     * @param {Function} [onStep]    - Per-step callback (receives GameState)
     */
    start: function (moves, onFinish, onStep) {
      if (_isRunning) {
        this.stop();
      }

      _moves = moves;
      _currentStep = 0;
      _isRunning = true;
      _isPaused = false;
      _onFinish = onFinish || null;
      state.isAnimating = true;

      _lastStepTime = performance.now();
      _rafId = requestAnimationFrame(function (timestamp) {
        // Pass onStep to the loop
        loop(timestamp, onStep);
      });
    },

    /** Pause the animation */
    pause: function () {
      if (!_isRunning) return;
      _isPaused = true;
    },

    /** Resume the animation */
    resume: function () {
      if (!_isRunning) return;
      _isPaused = false;
      // Reset the timer to avoid jumping multiple steps immediately after resume
      _lastStepTime = performance.now();
    },

    /** Stop the animation and reset state flags */
    stop: function () {
      if (_rafId) {
        cancelAnimationFrame(_rafId);
        _rafId = null;
      }
      _isRunning = false;
      _isPaused = false;
      state.isAnimating = false;
    },

    /**
     * Set the playback speed
     * @param {number} intervalMs - Interval per step in milliseconds
     */
    setSpeed: function (intervalMs) {
      // Edge case: invalid value handling
      if (typeof intervalMs !== 'number' || isNaN(intervalMs)) {
        return;
      }
      if (intervalMs < CONFIG.ANIMATION_MIN_INTERVAL) {
        intervalMs = CONFIG.ANIMATION_MIN_INTERVAL;
      }
      if (intervalMs > CONFIG.ANIMATION_MAX_INTERVAL) {
        intervalMs = CONFIG.ANIMATION_MAX_INTERVAL;
      }
      _intervalMs = intervalMs;
    },

    /**
     * Sync the internal state reference (called after reset / disk count change)
     * @param {GameState} newState
     */
    setState: function (newState) {
      state = newState;
    },

    /** @returns {boolean} Whether the animation is running */
    get isRunning() {
      return _isRunning;
    },

    /** @returns {boolean} Whether the animation is paused */
    get isPaused() {
      return _isPaused;
    }
  };
}
