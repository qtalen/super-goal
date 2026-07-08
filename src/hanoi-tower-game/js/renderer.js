/**
 * renderer.js — Canvas drawing module
 *
 * Depends on the CONFIG object from game-state.js.
 */

/**
 * Calculate the x-coordinate of a peg (canvas width divided into 6 parts, pegs at 1/6, 3/6, 5/6)
 * @param {number} pegIndex
 * @returns {number}
 */
function pegX(pegIndex) {
  return CONFIG.CANVAS_WIDTH / 6 * (pegIndex * 2 + 1);
}

/**
 * Calculate the width of a disk
 * @param {number} size - Disk size (1 = smallest)
 * @param {number} diskCount - Total number of disks
 * @returns {number}
 */
function diskWidth(size, diskCount) {
  if (diskCount <= 1) return CONFIG.DISK_MIN_WIDTH;
  return CONFIG.DISK_MIN_WIDTH +
    (size - 1) * (CONFIG.DISK_MAX_WIDTH - CONFIG.DISK_MIN_WIDTH) / (diskCount - 1);
}

/**
 * Create a renderer
 * @param {HTMLCanvasElement} canvas
 * @returns {Renderer}
 */
function createRenderer(canvas) {
  var ctx = canvas.getContext('2d');
  var lastState = null;

  /**
   * Draw one peg's vertical pole and base
   * @param {number} pegIndex
   */
  function drawPeg(pegIndex) {
    var x = pegX(pegIndex);

    // Vertical pole
    ctx.fillStyle = '#6B4F3C';
    ctx.fillRect(
      x - CONFIG.PEG_WIDTH / 2,
      CONFIG.PEG_TOP_Y,
      CONFIG.PEG_WIDTH,
      CONFIG.PEG_BASE_Y - CONFIG.PEG_TOP_Y
    );

    // Base
    ctx.fillStyle = '#4A3525';
    ctx.fillRect(
      x - CONFIG.PEG_BASE_LENGTH / 2,
      CONFIG.PEG_BASE_Y,
      CONFIG.PEG_BASE_LENGTH,
      CONFIG.PEG_BASE_HEIGHT
    );
  }

  /**
   * Draw a disk (with rounded corners)
   * @param {number} pegX - Peg x-coordinate
   * @param {number} y - Disk top y-coordinate
   * @param {number} width - Disk width
   * @param {string} color - Fill color
   */
  function drawDisk(pegX, y, width, color) {
    var x = pegX - width / 2;
    var h = CONFIG.DISK_HEIGHT;
    var r = 2; // Corner radius

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + h - r);
    ctx.quadraticCurveTo(x + width, y + h, x + width - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
  }

  /**
   * Draw the selection highlight (outline around the top disk)
   * @param {number} pegIndex
   * @param {number} topDiskSize - Top disk size
   * @param {number} diskCount
   * @param {number} pegY - Top disk y-coordinate
   */
  function drawSelection(pegIndex, topDiskSize, diskCount, pegY) {
    var xPos = pegX(pegIndex);
    var w = diskWidth(topDiskSize, diskCount);
    var h = CONFIG.DISK_HEIGHT;
    var r = 2;

    ctx.strokeStyle = CONFIG.SELECTION_COLOR;
    ctx.lineWidth = CONFIG.SELECTION_WIDTH;
    ctx.beginPath();
    ctx.moveTo(xPos - w / 2 + r, pegY);
    ctx.lineTo(xPos + w / 2 - r, pegY);
    ctx.quadraticCurveTo(xPos + w / 2, pegY, xPos + w / 2, pegY + r);
    ctx.lineTo(xPos + w / 2, pegY + h - r);
    ctx.quadraticCurveTo(xPos + w / 2, pegY + h, xPos + w / 2 - r, pegY + h);
    ctx.lineTo(xPos - w / 2 + r, pegY + h);
    ctx.quadraticCurveTo(xPos - w / 2, pegY + h, xPos - w / 2, pegY + h - r);
    ctx.lineTo(xPos - w / 2, pegY + r);
    ctx.quadraticCurveTo(xPos - w / 2, pegY, xPos - w / 2 + r, pegY);
    ctx.closePath();
    ctx.stroke();
  }

  return {
    /**
     * Full redraw of the canvas
     * @param {GameState} state
     */
    render: function (state) {
      // Clear the canvas
      ctx.clearRect(0, 0, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);

      // Background
      ctx.fillStyle = '#F8F9FA';
      ctx.fillRect(0, 0, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);

      // Draw the 3 pegs
      for (var p = 0; p < 3; p++) {
        drawPeg(p);
      }

      // Draw the disks
      for (var pegIdx = 0; pegIdx < 3; pegIdx++) {
        var peg = state.pegs[pegIdx];
        // Draw from bottom to top
        for (var d = 0; d < peg.length; d++) {
          var diskSize = peg[d].size;
          var w = diskWidth(diskSize, state.diskCount);
          // y: Stack upward from the base, bottom disk at the lowest position
          var y = CONFIG.PEG_BASE_Y - CONFIG.DISK_HEIGHT - d * (CONFIG.DISK_HEIGHT + CONFIG.DISK_GAP);
          drawDisk(pegX(pegIdx), y, w, CONFIG.DISK_COLORS[diskSize - 1]);
        }
      }

      // Selection highlight
      if (state.selectedPeg !== null) {
        var topDisk = getTopDisk(state, state.selectedPeg);
        if (topDisk !== null) {
          var selPeg = state.pegs[state.selectedPeg];
          var topY = CONFIG.PEG_BASE_Y - CONFIG.DISK_HEIGHT - (selPeg.length - 1) * (CONFIG.DISK_HEIGHT + CONFIG.DISK_GAP);
          drawSelection(state.selectedPeg, topDisk.size, state.diskCount, topY);
        }
      }
      lastState = state;
    },

    /**
     * Get the hit area for a peg on the canvas (for click detection)
     * @param {number} pegIndex
     * @returns {{ x: number, y: number, width: number, height: number }}
     */
    getPegBounds: function (pegIndex) {
      var xPos = pegX(pegIndex);
      return {
        x: xPos - CONFIG.PEG_BASE_LENGTH / 2,
        y: CONFIG.PEG_TOP_Y,
        width: CONFIG.PEG_BASE_LENGTH,
        height: CONFIG.PEG_BASE_Y + CONFIG.PEG_BASE_HEIGHT - CONFIG.PEG_TOP_Y
      };
    },

    /**
     * Feedback animation (red flash on illegal move) — placeholder, implemented in #3
     * @param {number} pegIndex
     */
    flashFeedback: function (pegIndex) {
      var bounds = this.getPegBounds(pegIndex);

      // Draw a semi-transparent red overlay
      ctx.fillStyle = 'rgba(255, 0, 0, 0.25)';
      ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);

      // Red border for enhanced visual effect
      ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
      ctx.lineWidth = 3;
      ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);

      // Auto-dismiss after FEEDBACK_FLASH_DURATION (cleared by redraw)
      var self = this;
      setTimeout(function () {
        if (lastState) {
          self.render(lastState);
        }
      }, CONFIG.FEEDBACK_FLASH_DURATION);
    }
  };
}
