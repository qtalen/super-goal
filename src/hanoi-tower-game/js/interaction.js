/**
 * interaction.js — User interaction & event binding module
 *
 * Implements Canvas click event handling, state machine (IDLE ↔ SELECTED),
 * coordinate hit detection, disk move validation and feedback.
 * Depends on game-state.js and renderer.js being loaded first.
 */

/**
 * Initialize interaction event bindings
 * @param {HTMLCanvasElement} canvas
 * @param {GameState} state       - Initial state reference
 * @param {Renderer} renderer     - Renderer instance
 * @param {Function} onMove       - Move callback (for move count update)
 * @param {Function} onStateChange - State change callback
 * @param {Function} onWin        - Win callback (for showing win dialog, receives moveCount)
 * @returns {InteractionController}
 */
function initInteraction(canvas, state, renderer, onMove, onStateChange, onWin) {
  var enabled = true;
  var currentState = state;

  /**
   * Convert mouse event coordinates to Canvas logical coordinates and detect hit peg
   * @param {MouseEvent} event
   * @returns {number|null} Hit peg index (0/1/2) or null
   */
  function getClickPeg(event) {
    var rect = canvas.getBoundingClientRect();
    // Account for CSS scaling: Canvas logical size / CSS actual size
    var scaleX = canvas.width / rect.width;
    var scaleY = canvas.height / rect.height;
    var x = (event.clientX - rect.left) * scaleX;
    var y = (event.clientY - rect.top) * scaleY;

    for (var p = 0; p < 3; p++) {
      var bounds = renderer.getPegBounds(p);
      if (x >= bounds.x && x <= bounds.x + bounds.width &&
          y >= bounds.y && y <= bounds.y + bounds.height) {
        return p;
      }
    }
    return null;
  }

  /**
   * Canvas click event handler — state machine main logic
   * Strictly follows Architecture doc §3.2 (state machine) and §5.1 (event flow)
   */
  function handleClick(event) {
    // Disabled or animation in progress → ignore click
    if (!enabled) return;
    if (currentState.isAnimating) return;

    var clickedPeg = getClickPeg(event);
    // Not on any peg → ignore
    if (clickedPeg === null) return;

    var sel = currentState.selectedPeg;

    // ===== IDLE state (selectedPeg === null) =====
    if (sel === null) {
      // Clicked peg has disks → select it
      if (getPegHeight(currentState, clickedPeg) > 0) {
        currentState.selectedPeg = clickedPeg;
        renderer.render(currentState);
        if (onStateChange) onStateChange(currentState);
      }
      // Empty peg → ignore

    // ===== SELECTED state + clicking the same peg → deselect =====
    } else if (sel === clickedPeg) {
      currentState.selectedPeg = null;
      renderer.render(currentState);
      if (onStateChange) onStateChange(currentState);

    // ===== SELECTED state + clicking a different peg → attempt move =====
    } else {
      if (canMove(currentState, sel, clickedPeg)) {
        // Legal move
        var newState = moveDisk(currentState, sel, clickedPeg);
        newState.selectedPeg = null;
        newState.moveCount += 1;

        currentState = newState;
        renderer.render(currentState);
        if (onMove) onMove(currentState.moveCount);
        if (onStateChange) onStateChange(currentState);

        // Win check: peg C has all disks
        if (checkWin(currentState)) {
          currentState.isSolved = true;
          if (onWin) onWin(currentState.moveCount);
        }
      } else {
        // Illegal move → red flash feedback, keep selection
        renderer.flashFeedback(clickedPeg);
        // selectedPeg remains unchanged
      }
    }
  }

  canvas.addEventListener('click', handleClick);

  return {
    /** Disable user interaction (called during auto-solve) */
    disable: function () {
      enabled = false;
    },

    /** Re-enable user interaction */
    enable: function () {
      enabled = true;
    },

    /** Check if currently enabled */
    get isEnabled() {
      return enabled;
    },

    /**
     * Update the internal state reference (called on reset / disk count change)
     * @param {GameState} newState
     */
    setState: function (newState) {
      currentState = newState;
    }
  };
}
