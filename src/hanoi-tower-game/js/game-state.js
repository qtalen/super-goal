/**
 * game-state.js — Data model & game state management
 *
 * This file defines the global CONFIG constant and the skeleton of state management functions.
 * Subsequent requirements will fill in the concrete implementations.
 */

// ===== Global config constant (Architecture doc §9) =====
const CONFIG = {
  CANVAS_WIDTH: 800,
  CANVAS_HEIGHT: 450,
  MIN_DISKS: 3,
  MAX_DISKS: 8,
  PEG_TOP_Y: 60,
  PEG_BASE_Y: 340,
  PEG_WIDTH: 12,
  PEG_BASE_HEIGHT: 12,
  PEG_BASE_LENGTH: 180,
  DISK_HEIGHT: 22,
  DISK_GAP: 2,
  DISK_MIN_WIDTH: 40,
  DISK_MAX_WIDTH: 140,
  DISK_COLORS: [
    '#FF6B6B', '#FFA94D', '#FFD43B', '#69DB7C',
    '#4DABF7', '#9775FA', '#F06595', '#20C997'
  ],
  SELECTION_COLOR: '#FFD700',
  SELECTION_WIDTH: 3,
  FEEDBACK_FLASH_DURATION: 300,
  ANIMATION_MIN_INTERVAL: 200,
  ANIMATION_MAX_INTERVAL: 2000,
  ANIMATION_DEFAULT_INTERVAL: 500
};

// ===== State management function implementations =====

/**
 * Create a new game state
 * @param {number} diskCount - Number of disks (3~8)
 * @returns {GameState}
 * @throws {RangeError} When diskCount is not in the 3~8 range
 */
function createGame(diskCount) {
  if (typeof diskCount !== 'number' || !Number.isInteger(diskCount) ||
      diskCount < CONFIG.MIN_DISKS || diskCount > CONFIG.MAX_DISKS) {
    throw new RangeError(
      'diskCount must be between ' + CONFIG.MIN_DISKS + ' and ' + CONFIG.MAX_DISKS
    );
  }

  // Peg 0: Largest to smallest (bottom size=n, top size=1)
  const pegA = [];
  for (let size = diskCount; size >= 1; size--) {
    pegA.push({ size: size });
  }

  return {
    pegs: [pegA, [], []],
    diskCount: diskCount,
    selectedPeg: null,
    moveCount: 0,
    isSolved: false,
    isAnimating: false
  };
}

/**
 * Reset the game to its initial state (preserving diskCount)
 * @param {GameState} state
 * @returns {GameState}
 */
function resetGame(state) {
  return createGame(state.diskCount);
}

/**
 * Determine if moving from fromPeg to toPeg is legal
 * @param {GameState} state
 * @param {number} fromPeg - Source peg index (0/1/2)
 * @param {number} toPeg   - Target peg index (0/1/2)
 * @returns {boolean}
 */
function canMove(state, fromPeg, toPeg) {
  var fromTop = getTopDisk(state, fromPeg);
  // from peg is empty → cannot move
  if (fromTop === null) return false;

  var toTop = getTopDisk(state, toPeg);
  // to peg is empty → can move
  if (toTop === null) return true;

  // A larger disk cannot be placed on a smaller one: from top size < to top size is legal
  return fromTop.size < toTop.size;
}

/**
 * Execute one move (no validation — caller must check canMove first)
 * @param {GameState} state
 * @param {number} fromPeg
 * @param {number} toPeg
 * @returns {GameState} The new state object
 */
function moveDisk(state, fromPeg, toPeg) {
  var newState = cloneGame(state);
  var disk = newState.pegs[fromPeg].pop();
  newState.pegs[toPeg].push(disk);
  return newState;
}

/**
 * Check if the game is won (all n disks on peg C)
 * @param {GameState} state
 * @returns {boolean}
 */
function checkWin(state) {
  return state.pegs[2].length === state.diskCount;
}

/**
 * Get the top disk on a specified peg
 * @param {GameState} state
 * @param {number} pegIndex
 * @returns {Disk|null}
 */
function getTopDisk(state, pegIndex) {
  var peg = state.pegs[pegIndex];
  if (peg.length === 0) return null;
  return peg[peg.length - 1];
}

/**
 * Get the number of disks on a peg
 * @param {GameState} state
 * @param {number} pegIndex
 * @returns {number}
 */
function getPegHeight(state, pegIndex) {
  return state.pegs[pegIndex].length;
}

/**
 * Deep clone a game state
 * @param {GameState} state
 * @returns {GameState}
 */
function cloneGame(state) {
  return {
    pegs: state.pegs.map(function (peg) {
      return peg.map(function (disk) {
        return { size: disk.size };
      });
    }),
    diskCount: state.diskCount,
    selectedPeg: state.selectedPeg,
    moveCount: state.moveCount,
    isSolved: state.isSolved,
    isAnimating: state.isAnimating
  };
}
