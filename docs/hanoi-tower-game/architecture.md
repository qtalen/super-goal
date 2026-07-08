# Tower of Hanoi Game — Architecture Design Document

## 1. Project Directory Structure

```
src/hanoi-tower-game/
├── index.html              # Main entry HTML: loads all JS, mounts Canvas and UI controls
├── style.css               # Page layout styles (control panel, buttons, selectors)
└── js/
    ├── game-state.js       # Data model & game state management (peg stacks, disks, rule validation)
    ├── renderer.js         # Canvas rendering (pegs, disks, selection highlight, move count)
    ├── interaction.js      # User interaction & event binding (click peg to select/move)
    └── solver.js           # Auto-solve (recursive algorithm + frame-by-frame animation controller)
```

**Load order** (sequentially via `<script>` tags in `index.html`):

```
game-state.js → renderer.js → interaction.js → solver.js
```

---

## 2. Canvas Layout Design

### 2.1 Canvas Dimensions

| Property | Value |
|----------|-------|
| Width | 800px (responsive: CSS set to `max-width: 100%`) |
| Height | 450px |
| Scaling | Canvas coordinates based on fixed 800×450 logical size, CSS scaled to fit window |

### 2.2 Peg Layout (3 pegs, indices 0/1/2 corresponding to A/B/C)

| Element | Position (x, y) | Size |
|---------|----------------|------|
| Peg A (left) | x = 800 × 1/6 ≈ 133 | — |
| Peg B (center) | x = 800 × 3/6 = 400 | — |
| Peg C (right) | x = 800 × 5/6 ≈ 667 | — |
| Peg pole | top y = 60, bottom y = 340 | width 12px |
| Peg base | y = 340, height 12px, length 180px | centered at peg x |
| Disk stacking area | stacked upward from base top | 24px per layer |

### 2.3 Disk Size Calculation

- **Disk count** n (3 ≤ n ≤ 8)
- **Maximum disk width**: 140px, **Minimum disk width**: 40px
- **Disk height**: 22px (fixed)
- Disk *size* (1 = smallest, n = largest) corresponding width:

```
width(size) = 40 + (size - 1) × (140 - 40) / (n - 1)
```

- Disks are horizontally centered on their peg position
- Disk gap (vertical gap): 2px, effectively 24px per layer

### 2.4 Color Scheme

| Element | Color |
|---------|-------|
| Background | `#F8F9FA` |
| Peg pole | `#6B4F3C` (wood brown) |
| Peg base | `#4A3525` (dark brown) |
| Disks (size 1 ~ n) | Taken sequentially from a fixed palette |
| Selection highlight | 3px `#FFD700` outline around the disk |
| Invalid operation feedback | Target peg border flashes red for 300ms |
| Move count text | `#333` |
| Victory popup background | Semi-transparent overlay + centered popup |

**Disk palette** (8 colors, use first n colors when fewer than 8 disks):

```
['#FF6B6B', '#FFA94D', '#FFD43B', '#69DB7C',
 '#4DABF7', '#9775FA', '#F06595', '#20C997']
```

---

## 3. Data Model Design

### 3.1 Core Data Structure

```javascript
// game-state.js — All state is centrally managed

/**
 * @typedef {Object} Disk
 * @property {number} size    - Disk number (1 = smallest, n = largest)
 * @property {string} label   - Display number (optional)
 */

/**
 * @typedef {Object} GameState
 * @property {Disk[][]} pegs          - Three pegs, each is a Disk array (index 0 = bottom)
 * @property {number} diskCount       - Total disk count (3~8)
 * @property {number|null} selectedPeg - Currently selected peg index (null = none selected)
 * @property {number} moveCount       - Move count
 * @property {boolean} isSolved       - Whether solved
 * @property {boolean} isAnimating    - Whether auto-solve animation is in progress
 */
```

**Peg stack convention**:
- Each peg is an array `Disk[]`
- `array[0]` = bottom disk (largest), `array[array.length-1]` = top disk (smallest)
- Initial state: peg A (index 0) has all disks (largest to smallest), peg B/C are empty

### 3.2 Game State Machine

```
                    ┌──────────────┐
                    │    IDLE      │ ← Initial/post-reset state
                    └──────┬───────┘
                           │ User clicks a peg with disks
                           ▼
                    ┌──────────────┐
                    │  SELECTED    │ ← A peg is selected, top disk is highlighted
                    └──────┬───────┘
                   ┌───────┴────────┐
                   │                │
           Click same peg        Click another peg
           (deselect)            │
                    │         ↓ Validate rules
                    │   ┌───┴───┐
                    │   │ Valid │ Invalid → flash red feedback (stay in SELECTED)
                    │   └───┬───┘
                    │       ↓ Execute move → moveCount++ → Check win
                    │   ┌───┴───┐
                    │   │ Not   │ Won → Show victory popup → Return to IDLE
                    │   │ won  │
                    │   └───┬───┘
                    │       │
                    └───────┘ → IDLE (deselect)
```

---

## 4. Module Breakdown & Public Interfaces

### 4.1 game-state.js — Data Model and Rules

```javascript
/**
 * Create a new game state
 * @param {number} diskCount - Disk count (3~8)
 * @returns {GameState}
 */
function createGame(diskCount)

/**
 * Reset game to initial state (preserve diskCount)
 * @param {GameState} state
 * @returns {GameState} New state object
 */
function resetGame(state)

/**
 * Check if moving from fromPeg to toPeg is valid
 * @param {GameState} state
 * @param {number} fromPeg - Source peg index (0/1/2)
 * @param {number} toPeg   - Target peg index (0/1/2)
 * @returns {boolean}
 */
function canMove(state, fromPeg, toPeg)

/**
 * Execute one move (no validation, caller must check canMove first)
 * @param {GameState} state
 * @param {number} fromPeg
 * @param {number} toPeg
 * @returns {GameState} New state object
 */
function moveDisk(state, fromPeg, toPeg)

/**
 * Check if won (peg C has all n disks)
 * @param {GameState} state
 * @returns {boolean}
 */
function checkWin(state)

/**
 * Get the top disk of a specified peg
 * @param {GameState} state
 * @param {number} pegIndex
 * @returns {Disk|null}
 */
function getTopDisk(state, pegIndex)

/**
 * Get the number of disks on a peg
 * @param {GameState} state
 * @param {number} pegIndex
 * @returns {number}
 */
function getPegHeight(state, pegIndex)

/**
 * Deep clone game state
 * @param {GameState} state
 * @returns {GameState}
 */
function cloneGame(state)
```

### 4.2 renderer.js — Canvas Rendering

```javascript
/**
 * Create a renderer
 * @param {HTMLCanvasElement} canvas
 * @returns {Renderer}
 */
function createRenderer(canvas)

class Renderer {
  /**
   * Full redraw of canvas (pegs + disks + selection highlight + move count)
   * @param {GameState} state
   */
  render(state)

  /**
   * Get the hit area of a peg on the canvas (for click detection)
   * @param {number} pegIndex
   * @returns {{ x: number, y: number, width: number, height: number }}
   */
  getPegBounds(pegIndex)

  /**
   * Display feedback animation (invalid move flash red)
   * @param {number} pegIndex
   */
  flashFeedback(pegIndex)
}
```

### 4.3 interaction.js — User Interaction

```javascript
/**
 * Initialize interaction event binding
 * @param {HTMLCanvasElement} canvas
 * @param {GameState} state       - Initial state reference
 * @param {Renderer} renderer     - Renderer instance
 * @param {Function} onMove       - Move callback (for move count update / win detection)
 * @param {Function} onStateChange - State change callback
 * @returns {InteractionController}
 */
function initInteraction(canvas, state, renderer, onMove, onStateChange)

class InteractionController {
  /** Disable user interaction (called during auto-solve) */
  disable()

  /** Restore user interaction */
  enable()

  /** Get whether currently enabled */
  get isEnabled()
}
```

### 4.4 solver.js — Auto-solve

```javascript
/**
 * @typedef {Object} Move
 * @property {number} from - Source peg index
 * @property {number} to   - Target peg index
 */

/**
 * Generate optimal Tower of Hanoi move sequence (recursive algorithm)
 * @param {number} n     - Disk count
 * @param {number} from  - Starting peg index
 * @param {number} to    - Target peg index
 * @param {number} aux   - Auxiliary peg index
 * @returns {Move[]} Move step array
 */
function solveHanoi(n, from, to, aux)

/**
 * Create animation controller
 * @param {GameState} state
 * @param {Renderer} renderer
 * @returns {AnimationController}
 */
function createAnimation(state, renderer)

class AnimationController {
  /**
   * Start auto-solve animation
   * @param {Move[]} moves
   */
  start(moves)

  /** Pause animation */
  pause()

  /** Resume animation */
  resume()

  /**
   * Set playback speed
   * @param {number} intervalMs - Interval per step in milliseconds (200~2000)
   */
  setSpeed(intervalMs)

  /** Stop animation and return to initial state */
  stop()

  /** @returns {boolean} */
  get isRunning()

  /** @returns {boolean} */
  get isPaused()
}
```

---

## 5. Event Flow Design

### 5.1 User Manual Operation Event Flow

```
User clicks Canvas
        │
        ▼
interaction.js: Canvas click handler
        │
        ├── If isAnimating === true → ignore click
        │
        ├── hitTest: calculate which peg's hit area the click coordinates fall in
        │       │
        │       ├── Not on any peg → ignore
        │       │
        │       └── Falls on peg P
        │               │
        │               ├── selectedPeg === null
        │               │       └── P has disks → selectedPeg = P, render()
        │               │       └── P has no disks → ignore
        │               │
        │               ├── selectedPeg === P
        │               │       └── selectedPeg = null, render() (deselect)
        │               │
        │               └── selectedPeg = F, clicked T (F ≠ T)
        │                       │
        │                       ├── canMove(state, F, T) === false
        │                       │       ├── renderer.flashFeedback(T)
        │                       │       └── Keep selected state
        │                       │
        │                       └── canMove(state, F, T) === true
        │                               ├── moveDisk(state, F, T)
        │                               ├── selectedPeg = null
        │                               ├── moveCount++
        │                               ├── checkWin(state)
        │                               │     ├── true → Show victory popup
        │                               │     └── false → Continue
        │                               ├── render()
        │                               └── Callback onMove(moveCount)
        │
        ▼
    renderer.render(state)   ← Triggers redraw after each state change
```

### 5.2 Auto-solve Event Flow

```
User clicks "Auto-solve" button
        │
        ▼
solver.generateMoves(n, 0, 2, 1) → Move[]
        │
        ▼
animation.start(moves):
  1. interaction.disable()        ← Disable user clicks
  2. state.isAnimating = true
  3. Start requestAnimationFrame loop
        │
        ├── Check isPaused flag each frame
        │     ├── true → skip this frame
        │     └── false → take the next Move by time interval
        │
        ├── moveDisk(state, move.from, move.to)
        ├── renderer.render(state)
        ├── moveCount++
        ├── Reached end → stop, win detection, restore interaction
        │
        ▼
     Pause button → animation.pause() → isPaused = true
     Resume button → animation.resume() → isPaused = false
     Stop button → animation.stop()   → reset state, restore interaction
     Speed slider → animation.setSpeed(ms)
```

---

## 6. Animation Strategy (Auto-solve)

### 6.1 Animation Mode

Uses **jump-cut animation** (not smooth movement), i.e. each step directly changes the state and fully redraws:

```
Interval per step: default 500ms, user adjustable 200ms ~ 2000ms
Frame-driven: hybrid of setInterval + requestAnimationFrame
  - requestAnimationFrame for the render loop
  - Internal timer controls when each step is triggered
```

**Reasons for choosing jump-cut over smooth animation**:
- Low implementation complexity, can be done with zero external dependencies
- For Tower of Hanoi, jump-cut animation can still clearly show the movement process
- Less code, easier to maintain

### 6.2 Animation Loop Pseudocode

```
AnimationController:
  _moves = []          # Move sequence
  _currentStep = 0     # Current step index being executed
  _intervalMs = 500    # Interval per step
  _isPaused = false
  _isRunning = false
  _rafId = null
  _lastStepTime = 0

  start(moves):
    _moves = moves
    _currentStep = 0
    _isRunning = true
    _isPaused = false
    _lastStepTime = performance.now()
    loop(timestamp)

  loop(timestamp):
    if not _isRunning: return
    if _isPaused: 
      _rafId = requestAnimationFrame(loop)
      return
    if timestamp - _lastStepTime >= _intervalMs:
      execute next move
      _currentStep++
      _lastStepTime = timestamp
      if _currentStep >= _moves.length:
        stop()
        return
    _rafId = requestAnimationFrame(loop)

  pause():  _isPaused = true
  resume(): _isPaused = false; _lastStepTime = performance.now()
  stop():   cancelAnimationFrame; reset state; restore interaction
```

### 6.3 Speed Control

| Level | Interval | Corresponding Experience |
|-------|----------|--------------------------|
| Slow | 800ms | Teaching demo |
| Medium | 500ms | Default |
| Fast | 200ms | Quick demo |

Continuously adjustable between 200~2000ms via slider or buttons.

---

## 7. index.html Skeleton Design

```
┌─────────────────────────────────────────────┐
│  #app                                       │
│  ┌─────────────────────────────────────────┐│
│  │  <h1> Tower of Hanoi                    ││
│  ├─────────────────────────────────────────┤│
│  │  <canvas id="hanoi-canvas">             ││
│  │    (800×450, max-width: 100%)           ││
│  ├─────────────────────────────────────────┤│
│  │  #controls                              ││
│  │  ┌──────┐ ┌──────┐  Disks: [3─┐─8]  Moves: 0││
│  │  │Reset │ │Auto  │          │           │
│  │  └──────┘ └──────┘          └─────────── ││
│  │  [Pause] [Resume] [Stop]   Speed: ═══●═══││
│  └─────────────────────────────────────────┘│
└─────────────────────────────────────────────┘
```

---

## 8. Implementation Order Recommendations

Following the dependency order of the requirements list, the following implementation order is recommended:

| Step | Requirement | Files Involved |
|------|-------------|----------------|
| 1 | #1 | index.html, style.css |
| 2 | #2 | game-state.js, renderer.js |
| 3 | #3 | interaction.js |
| 4 | #4 | interaction.js + game-state.js (win detection) |
| 5 | #5 | index.html (UI controls) + game-state.js (reset) |
| 6 | #6 | solver.js + index.html (animation control UI) |

After each step is completed, manually open `index.html` in the browser to verify before proceeding to the next step.

---

## 9. Global Constants Configuration

```javascript
// Centrally manage all tunable parameters
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
```
