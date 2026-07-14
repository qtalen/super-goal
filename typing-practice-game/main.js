// ============================================================
// Game Configuration
// ============================================================
const CONFIG = {
  WIDTH: 900,
  HEIGHT: 720,
   COLUMNS: 8,
  COLUMN_WIDTH: 80,
   GAME_LEFT_MARGIN: 130,
  KEYBOARD_Y: 560,
  KEY_HEIGHT: 70,
  KEY_WIDTH: 80,
  SPACE_KEY_Y: 635,
  SPACE_KEY_HEIGHT: 70,
   SPACE_KEY_WIDTH: 640,
  HIT_ZONE_TOP: 460,
  HIT_ZONE_BOTTOM: 530,
  GAME_AREA_BOTTOM: 460, // 字母下落区域底部 = HIT_ZONE_TOP
};

// 计算 9 列的中心 X 坐标
const COLUMN_CENTERS = Array.from({ length: 9 }, (_, i) =>
  CONFIG.GAME_LEFT_MARGIN + i * CONFIG.COLUMN_WIDTH + CONFIG.COLUMN_WIDTH / 2
);

// ============================================================
// Letter-to-Column Mapping (Standard Touch Typing)
// ============================================================
const LETTER_TO_COL = {
  // 左小指 (列0, A键): Q, A, Z
  'Q': 0, 'A': 0, 'Z': 0,
  // 左无名指 (列1, S键): W, S, X
  'W': 1, 'S': 1, 'X': 1,
  // 左中指 (列2, D键): E, D, C
  'E': 2, 'D': 2, 'C': 2,
  // 左食指 (列3, F键): R, F, V, T, G, B
  'R': 3, 'F': 3, 'V': 3, 'T': 3, 'G': 3, 'B': 3,
  // 右食指 (列4, J键): Y, H, N, U, J, M
  'Y': 4, 'H': 4, 'N': 4, 'U': 4, 'J': 4, 'M': 4,
  // 右中指 (列5, K键): I, K
  'I': 5, 'K': 5,
  // 右无名指 (列6, L键): O, L
  'O': 6, 'L': 6,
  // 右小指 (列7, ;键): P
  'P': 7,
};

// ============================================================
// Keyboard Key to Column Mapping
// ============================================================
const KEY_TO_COL = {
  // 左小指 (列0): Q, A, Z
  'q': 0, 'Q': 0, 'a': 0, 'A': 0, 'z': 0, 'Z': 0,
  // 左无名指 (列1): W, S, X
  'w': 1, 'W': 1, 's': 1, 'S': 1, 'x': 1, 'X': 1,
  // 左中指 (列2): E, D, C
  'e': 2, 'E': 2, 'd': 2, 'D': 2, 'c': 2, 'C': 2,
  // 左食指 (列3): R, F, V, T, G, B
  'r': 3, 'R': 3, 'f': 3, 'F': 3, 'v': 3, 'V': 3,
  't': 3, 'T': 3, 'g': 3, 'G': 3, 'b': 3, 'B': 3,
  // 右食指 (列4): Y, H, N, U, J, M
  'y': 4, 'Y': 4, 'h': 4, 'H': 4, 'n': 4, 'N': 4,
  'u': 4, 'U': 4, 'j': 4, 'J': 4, 'm': 4, 'M': 4,
  // 右中指 (列5): I, K
  'i': 5, 'I': 5, 'k': 5, 'K': 5,
  // 右无名指 (列6): O, L
  'o': 6, 'O': 6, 'l': 6, 'L': 6,
  // 右小指 (列7): P, ;
  'p': 7, 'P': 7, ';': 7,
  // 双拇指 (列8): 空格
  ' ': 8,
};

// 所有可生成的字母列表（用于随机选择）
const ALL_LETTERS = Object.keys(LETTER_TO_COL);

// 手指区域颜色映射（与 fingerConfigs 颜色一致）
const COL_COLORS = [
  '#FF6B6B',  // 0: 左小指 A
  '#FFA94D',  // 1: 左无名指 S
  '#FFD43B',  // 2: 左中指 D
  '#69DB7C',  // 3: 左食指 F
  '#4DABF7',  // 4: 右食指 J
  '#748FFC',  // 5: 右中指 K
  '#DA77F2',  // 6: 右无名指 L
  '#F783AC',  // 7: 右小指 ;
  '#ffffff',  // 8: 双拇指 Space（不使用）
];

// ============================================================
// Game State
// ============================================================
const game = {
  letters: [],          // 当前活跃的下落字母数组
  spawnTimer: 0,        // 生成计时器（秒）
  spawnInterval: 1.5,   // 生成间隔（秒），后续会随难度变化
  baseSpeed: 80,        // 基础下落速度（像素/秒）
  score: 0,
  combo: 0,
  maxCombo: 0,
  lastHitCol: -1,       // 最后命中的列
  lastHitTime: 0,       // 最后命中时间（performance.now）
  scoreAnim: { scale: 1, time: 0 },    // 分数放大动画
  comboAnim: { scale: 1, time: 0 },    // 连击放大动画
  particles: [],        // 粒子对象数组
  screenShake: { x: 0, y: 0, intensity: 0, time: 0 },  // 屏幕震动
  comboMilestone: 0,    // 上次触发升级连击的里程碑
  elapsedTime: 0,       // 游戏已运行时间（秒），用于难度递增
  currentDifficulty: 1, // 当前难度倍率，随时间平滑上升，最高 5x
  bgParticles: [],      // 背景装饰粒子
};

// ============================================================
// Falling Letter Factory
// ============================================================
function createFallingLetter() {
  const letter = ALL_LETTERS[Math.floor(Math.random() * ALL_LETTERS.length)];
  const col = LETTER_TO_COL[letter];
  return {
    letter,             // 'A'-'Z'
    col,                // 0-7
    x: COLUMN_CENTERS[col],  // 中心 X
    y: -30,             // 从顶部外进入
    speed: game.baseSpeed * game.currentDifficulty,   // 像素/秒，受当前难度倍率影响
    color: COL_COLORS[col],  // 手指区域颜色
    active: true,
    // 视觉效果属性
    opacity: 1,
    scale: 1,
    hitZoneEntered: false,   // 是否已进入过命中区
    hit: false,              // 是否已被命中（播放消失动画）
    hitTime: 0,              // 命中时间戳（performance.now）
  };
}

// ============================================================
// Particle System
// ============================================================

function createParticle(x, y, color, speed, size, life) {
  const angle = Math.random() * Math.PI * 2;
  const spd = speed * (0.5 + Math.random() * 0.5);
  return {
    x, y,
    vx: Math.cos(angle) * spd,
    vy: Math.sin(angle) * spd,
    color,
    size: size * (0.5 + Math.random() * 0.5),
    life,
    maxLife: life,
    active: true,
  };
}

function spawnHitEffect(x, y, combo, color) {
  let particleCount, particleSpeed, particleSize, particleLife;
  let shakeIntensity = 0;
  let isMilestone = false;

  // 检测连击里程碑（只在升级时触发大特效）
  const milestones = [1, 2, 5, 10];
  const nextMilestone = milestones.find(m => combo >= m && game.comboMilestone < m);
  if (nextMilestone !== undefined) {
    game.comboMilestone = nextMilestone;
    isMilestone = true;
  }

  if (combo >= 10) {
    // 究极：40 彩虹粒子，大尺寸，长寿命
    particleCount = 40;
    particleSpeed = 200 + Math.random() * 100;
    particleSize = 6;
    particleLife = 1.0;
    shakeIntensity = 10;
  } else if (combo >= 5) {
    // 高级：20 粒子，中尺寸
    particleCount = 20;
    particleSpeed = 150 + Math.random() * 80;
    particleSize = 5;
    particleLife = 0.8;
    shakeIntensity = 5;
  } else if (combo >= 2) {
    // 中级：12 粒子
    particleCount = 12;
    particleSpeed = 120 + Math.random() * 60;
    particleSize = 4;
    particleLife = 0.6;
    shakeIntensity = 2;
  } else {
    // 基础：8 粒子
    particleCount = 8;
    particleSpeed = 100 + Math.random() * 40;
    particleSize = 3;
    particleLife = 0.4;
    shakeIntensity = 0;
  }

  // 生成粒子颜色
  const colors = [];
  if (combo >= 10) {
    // 彩虹色
    const rainbow = ['#FF0000','#FF7700','#FFFF00','#00FF00','#0000FF','#8B00FF','#FF00FF','#00FFFF'];
    for (let i = 0; i < particleCount; i++) {
      colors.push(rainbow[Math.floor(Math.random() * rainbow.length)]);
    }
  } else if (combo >= 5) {
    // 混合彩色
    for (let i = 0; i < particleCount; i++) {
      const hue = Math.random() * 360;
      colors.push(`hsl(${hue}, 100%, 60%)`);
    }
  } else if (combo >= 2) {
    // 类似色变化
    for (let i = 0; i < particleCount; i++) {
      colors.push(color);
    }
  } else {
    // 白色/金色
    for (let i = 0; i < particleCount; i++) {
      colors.push(Math.random() > 0.5 ? '#ffffff' : '#FFD700');
    }
  }

  for (let i = 0; i < particleCount; i++) {
    game.particles.push(createParticle(x, y, colors[i], particleSpeed, particleSize, particleLife));
  }

  // 屏幕震动
  if (shakeIntensity > 0) {
    game.screenShake.intensity = shakeIntensity;
    game.screenShake.time = performance.now();
  }

  // 连击升级时额外效果：环形波
  if (isMilestone && combo >= 2) {
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2;
      const spd = 80 + combo * 5;
      game.particles.push({
        x, y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        color: color,
        size: 2,
        life: 0.6,
        maxLife: 0.6,
        active: true,
        isRing: true,
      });
    }
  }
}

// ============================================================
// Audio System (Web Audio API)
// ============================================================
let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

function playHitSound(combo) {
  initAudio();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);

  const now = audioCtx.currentTime;

  if (combo >= 10) {
    // 高连击：上升音阶（更快更亮）
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.linearRampToValueAtTime(1200, now + 0.08);
  } else if (combo >= 5) {
    // 中连击：双音叠加
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(500, now);
    osc.frequency.linearRampToValueAtTime(900, now + 0.06);
  } else if (combo >= 2) {
    // 基础连击：中音
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.linearRampToValueAtTime(700, now + 0.05);
  } else {
    // 单次：简单短音
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.linearRampToValueAtTime(400, now + 0.08);
  }

  gain.gain.setValueAtTime(0.15, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

  osc.start(now);
  osc.stop(now + 0.15);
}

function playMissSound() {
  initAudio();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);

  const now = audioCtx.currentTime;
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(200, now);
  osc.frequency.linearRampToValueAtTime(80, now + 0.15);
  gain.gain.setValueAtTime(0.08, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

  osc.start(now);
  osc.stop(now + 0.15);
}

function playComboMilestoneSound(combo) {
  initAudio();
  const now = audioCtx.currentTime;

  if (combo >= 10) {
    // 大欢庆：三个快速上升音
    [0, 0.08, 0.16].forEach((offset, i) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(500 + i * 300, now + offset);
      osc.frequency.linearRampToValueAtTime(1000 + i * 300, now + offset + 0.08);
      gain.gain.setValueAtTime(0.12, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.2);
      osc.start(now + offset);
      osc.stop(now + offset + 0.2);
    });
  } else if (combo >= 5) {
    // 升级音：双音
    [0, 0.06].forEach((offset) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(400 + offset * 2000, now + offset);
      gain.gain.setValueAtTime(0.1, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.15);
      osc.start(now + offset);
      osc.stop(now + offset + 0.15);
    });
  } else {
    // 首次连击：短升音
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.linearRampToValueAtTime(600, now + 0.1);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.start(now);
    osc.stop(now + 0.15);
  }
}

// ============================================================
// Canvas Setup
// ============================================================
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

let scale = 1; // 当前缩放比例（虚拟坐标→实际像素）

/**
 * 根据窗口大小计算缩放比例，使 Canvas 保持 900×720 的宽高比
 * 并尽可能填满视口，居中显示。
 */
function resizeCanvas() {
  const windowRatio = window.innerWidth / window.innerHeight;
  const virtualRatio = CONFIG.WIDTH / CONFIG.HEIGHT;

  let displayWidth, displayHeight;

  if (windowRatio > virtualRatio) {
    // 窗口更宽：按高度填满
    displayHeight = window.innerHeight;
    displayWidth = displayHeight * virtualRatio;
  } else {
    // 窗口更高：按宽度填满
    displayWidth = window.innerWidth;
    displayHeight = displayWidth / virtualRatio;
  }

  canvas.width = CONFIG.WIDTH;
  canvas.height = CONFIG.HEIGHT;
  canvas.style.width = Math.floor(displayWidth) + 'px';
  canvas.style.height = Math.floor(displayHeight) + 'px';

  scale = displayWidth / CONFIG.WIDTH;
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ============================================================
// Background Particles (Ambient)
// ============================================================
function initBgParticles() {
  game.bgParticles = [];
  for (let i = 0; i < 30; i++) {
    game.bgParticles.push({
      x: Math.random() * CONFIG.WIDTH,
      y: Math.random() * CONFIG.GAME_AREA_BOTTOM,
      size: 1 + Math.random() * 2,
      speed: 5 + Math.random() * 10,
      opacity: 0.1 + Math.random() * 0.2,
      hue: Math.random() * 360,
    });
  }
}

initBgParticles();

// ============================================================
// Keyboard Input
// ============================================================
function handleKeyPress(col) {
  // 首次交互时初始化音频上下文（浏览器自动播放限制）
  initAudio();

  // 找到该列中进入命中区且还在激活状态的字母
  // 从下往上找（y 最大的优先，即最接近底部的）
  let hitTarget = null;
  let maxY = -1;

  for (const l of game.letters) {
    if (!l.active) continue;
    if (l.col !== col) continue;
    if (l.y >= CONFIG.HIT_ZONE_TOP && l.y <= CONFIG.HIT_ZONE_BOTTOM) {
      if (l.y > maxY) {
        maxY = l.y;
        hitTarget = l;
      }
    }
  }

  if (hitTarget) {
    hitTarget.hit = true;
    hitTarget.hitTime = performance.now();
    game.score++;
    game.combo++;
    // 触发计分板放大动画
    game.scoreAnim.scale = 1.6;
    game.scoreAnim.time = performance.now();
    game.comboAnim.scale = 1.6;
    game.comboAnim.time = performance.now();
    if (game.combo > game.maxCombo) {
      game.maxCombo = game.combo;
    }
    // 记录命中反馈（按键闪烁）
    game.lastHitCol = col;
    game.lastHitTime = performance.now();
    // 生成击中特效（粒子和屏幕震动）
    spawnHitEffect(hitTarget.x, hitTarget.y, game.combo, hitTarget.color);
    // 音效
    playHitSound(game.combo);
    const comboMilestones = [1, 2, 5, 10];
    if (comboMilestones.includes(game.combo)) {
      playComboMilestoneSound(game.combo);
    }
  }
}

document.addEventListener('keydown', (e) => {
  // 阻止空格键和分号键的浏览器默认行为
  if (e.key === ' ' || e.key === ';') {
    e.preventDefault();
  }

  const col = KEY_TO_COL[e.key];
  if (col === undefined) return; // 非目标键忽略

  handleKeyPress(col);
});

// ============================================================
// Game Loop
// ============================================================
let lastTime = 0;

function gameLoop(timestamp) {
  // 计算 deltaTime（秒），带上限 0.05s 防止跳帧
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;

  update(dt);
  render();

  requestAnimationFrame(gameLoop);
}

// ============================================================
// Update
// ============================================================
function update(dt) {
  // ---- 游戏计时 & 难度递增 ----
  game.elapsedTime += dt;

  // 速度曲线：基础速度 × 难度倍率（前 60 秒线性上升到 2x，之后继续慢速增长）
  // 公式：1 + elapsedTime/60，1 分钟后 2x，2 分钟后 3x，最高 5x
  game.currentDifficulty = Math.min(1 + game.elapsedTime / 60, 5);

  // 更新生成间隔：从 1.5s 递减到最少 0.3s
  // 约 60 秒后接近 0.3s
  game.spawnInterval = Math.max(0.3, 1.5 - game.elapsedTime * 0.02);

  // 生成新字母
  game.spawnTimer += dt;
  if (game.spawnTimer >= game.spawnInterval) {
    game.spawnTimer -= game.spawnInterval;
    game.letters.push(createFallingLetter());
  }

  // 更新所有字母位置
  for (let i = game.letters.length - 1; i >= 0; i--) {
    const l = game.letters[i];

    // 被命中字母：播放消失动画，0.3s 后移除
    if (l.hit) {
      const elapsed = (performance.now() - l.hitTime) / 1000;
      if (elapsed >= 0.3) {
        game.letters.splice(i, 1);
      }
      continue; // 被命中后不再移动
    }

    l.y += l.speed * dt;

    // 检测是否进入命中区
    if (!l.hitZoneEntered && l.y >= CONFIG.HIT_ZONE_TOP) {
      l.hitZoneEntered = true;
    }

    // 超出底部 → 移除
    if (l.y > CONFIG.HEIGHT + 30) {
      // 字母进入过命中区但没被打中 → combo 归零 + 遗漏视觉反馈 + 音效
      if (l.hitZoneEntered) {
        game.combo = 0;
        game.comboMilestone = 0;
        playMissSound();
        // 生成"错过"特效：9 个红色小粒子，在底部键盘区域位置
        for (let j = 0; j < 9; j++) {
          game.particles.push(createParticle(
            l.x, CONFIG.HIT_ZONE_BOTTOM,
            '#FF3333',
            60 + Math.random() * 40,
            2,
            0.4
          ));
        }
      }
      game.letters.splice(i, 1);
      continue;
    }
  }

  // ---- 背景粒子更新 ----
  for (const bp of game.bgParticles) {
    bp.y += bp.speed * dt;
    if (bp.y > CONFIG.GAME_AREA_BOTTOM) {
      bp.y = 0;
      bp.x = Math.random() * CONFIG.WIDTH;
    }
  }

  // ---- 计分板放大动画更新 ----
  // 分数放大动画：随时间从 1.6 弹性衰减到 1.0
  const elapsed = (performance.now() - game.scoreAnim.time) / 1000;
  if (elapsed < 0.3) {
    const t = elapsed / 0.3;
    game.scoreAnim.scale = 1.0 + 0.6 * Math.pow(1 - t, 3) * Math.cos(t * Math.PI * 4);
  } else {
    game.scoreAnim.scale = 1;
  }

  // combo 同样的动画
  const celapsed = (performance.now() - game.comboAnim.time) / 1000;
  if (celapsed < 0.3) {
    const t = celapsed / 0.3;
    game.comboAnim.scale = 1.0 + 0.6 * Math.pow(1 - t, 3) * Math.cos(t * Math.PI * 4);
  } else {
    game.comboAnim.scale = 1;
  }

  // ---- 粒子更新 ----
  for (let i = game.particles.length - 1; i >= 0; i--) {
    const p = game.particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 200 * dt;  // 重力
    p.vx *= 0.98;      // 阻力
    p.vy *= 0.98;
    p.life -= dt;
    if (p.life <= 0) {
      game.particles.splice(i, 1);
    }
  }

  // ---- 屏幕震动更新 ----
  if (game.screenShake.intensity > 0) {
    const shakeElapsed = (performance.now() - game.screenShake.time) / 1000;
    if (shakeElapsed < 0.3) {
      const decay = 1 - shakeElapsed / 0.3;
      game.screenShake.x = (Math.random() - 0.5) * 2 * game.screenShake.intensity * decay;
      game.screenShake.y = (Math.random() - 0.5) * 2 * game.screenShake.intensity * decay;
    } else {
      game.screenShake.intensity = 0;
      game.screenShake.x = 0;
      game.screenShake.y = 0;
    }
  }
}

// ============================================================
// Render Helpers
// ============================================================

/**
 * 绘制圆角矩形路径（使用 Canvas roundRect API）
 */
function drawRoundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.closePath();
}

// ============================================================
// Render
// ============================================================
function render() {
  // 清屏（先重置变换确保全屏覆盖，不受屏幕震动影响）
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0a0a1a';
  ctx.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);

  // 应用屏幕震动（只影响游戏内容区域）
  ctx.save();
  if (game.screenShake.intensity > 0) {
    ctx.translate(game.screenShake.x, game.screenShake.y);
  }

  // 1. 背景粒子（氛围装饰）
  for (const bp of game.bgParticles) {
    ctx.save();
    ctx.globalAlpha = bp.opacity;
    ctx.fillStyle = `hsl(${bp.hue}, 50%, 60%)`;
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(bp.x, bp.y, bp.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 2. 命中区渐变（在字母之前绘制，使字母在命中区上方）
  const hitZoneWidth = CONFIG.COLUMNS * CONFIG.COLUMN_WIDTH;
  const hitZoneHeight = CONFIG.HIT_ZONE_BOTTOM - CONFIG.HIT_ZONE_TOP;

  const gradient = ctx.createLinearGradient(
    CONFIG.GAME_LEFT_MARGIN, CONFIG.HIT_ZONE_TOP,
    CONFIG.GAME_LEFT_MARGIN, CONFIG.HIT_ZONE_BOTTOM
  );
  gradient.addColorStop(0, 'rgba(100, 255, 100, 0)');
  gradient.addColorStop(1, 'rgba(100, 255, 100, 0.15)');

  ctx.fillStyle = gradient;
  ctx.fillRect(
    CONFIG.GAME_LEFT_MARGIN, CONFIG.HIT_ZONE_TOP,
    hitZoneWidth, hitZoneHeight
  );

  // 命中区发光边框（细线）
  ctx.strokeStyle = 'rgba(100, 255, 100, 0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(
    CONFIG.GAME_LEFT_MARGIN, CONFIG.HIT_ZONE_TOP,
    hitZoneWidth, hitZoneHeight
  );

  // ---- 3. 渲染所有下落字母（在命中区之上、键盘之下） ----
  for (const l of game.letters) {
    if (l.hit) {
      // 被命中字母：缩放+旋转+淡出消失动画
      const elapsed = (performance.now() - l.hitTime) / 1000;
      const t = Math.min(elapsed / 0.3, 1);
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.translate(l.x, l.y);
      ctx.rotate(t * Math.PI * 2);       // 旋转一圈
      ctx.scale(1 + t * 0.5, 1 + t * 0.5); // 放大
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 28px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = '#FFD700';
      ctx.shadowBlur = 20;
      ctx.fillText(l.letter, 0, 0);
      ctx.restore();
      continue;
    }

    ctx.save();

    // 拖尾效果：绘制 3 个残影（在主字母上方）
    for (let t = 1; t <= 3; t++) {
      const trailY = l.y - t * 8;
      const trailAlpha = l.opacity * (0.15 - t * 0.04);
      if (trailAlpha <= 0) continue;

      ctx.globalAlpha = trailAlpha;
      ctx.fillStyle = l.color;
      ctx.font = 'bold 26px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(l.letter, l.x, trailY);
    }

    // 主字母（发光）
    ctx.globalAlpha = l.opacity;
    ctx.shadowColor = l.color;
    ctx.shadowBlur = 15;
    ctx.fillStyle = l.color;
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(l.letter, l.x, l.y);

    ctx.restore();
  }

  // ---- 4. 粒子特效 ----
  for (const p of game.particles) {
    const alpha = Math.max(0, p.life / p.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;

    if (p.isRing) {
      // 环形波粒子：更亮，半透明
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
    } else {
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 4;
    }

    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(1, p.size * alpha), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ---- 字母键手指配置 ----
  // [字母, 颜色, 列索引]
  const fingerConfigs = [
    ['A', '#FF6B6B', 0],  // 左小指
    ['S', '#FFA94D', 1],  // 左无名指
    ['D', '#FFD43B', 2],  // 左中指
    ['F', '#69DB7C', 3],  // 左食指
    ['J', '#4DABF7', 4],  // 右食指
    ['K', '#748FFC', 5],  // 右中指
    ['L', '#DA77F2', 6],  // 右无名指
    [';', '#F783AC', 7],  // 右小指
  ];

  // 3. 底部字母键
  for (const [label, color, col] of fingerConfigs) {
    const cx = COLUMN_CENTERS[col];
    const kx = cx - CONFIG.KEY_WIDTH / 2;
    const ky = CONFIG.KEYBOARD_Y;

    // 键背景（命中时闪烁反馈）
    const isPressed = (game.lastHitCol === col && performance.now() - game.lastHitTime < 100);
    ctx.fillStyle = isPressed ? '#2a2a5a' : '#1a1a3a';
    drawRoundRect(kx, ky, CONFIG.KEY_WIDTH, CONFIG.KEY_HEIGHT, 8);
    ctx.fill();

    // 键边框（手指区域颜色）
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    drawRoundRect(kx, ky, CONFIG.KEY_WIDTH, CONFIG.KEY_HEIGHT, 8);
    ctx.stroke();

    // 字母（手指区域颜色）
    ctx.fillStyle = color;
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, ky + CONFIG.KEY_HEIGHT / 2);

    // 手指标记小圆点（底部居中）
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, ky + CONFIG.KEY_HEIGHT - 8, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // 4. 空格键（与字母键左对齐，宽度=8个字母键）
  const spaceKeyX = CONFIG.GAME_LEFT_MARGIN;
  const spaceKeyCenterX = spaceKeyX + CONFIG.SPACE_KEY_WIDTH / 2;

  // 空格键背景（命中时闪烁反馈）
  const spacePressed = (game.lastHitCol === 8 && performance.now() - game.lastHitTime < 100);
  ctx.fillStyle = spacePressed ? '#2a2a5a' : '#1a1a3a';
  drawRoundRect(
    spaceKeyX, CONFIG.SPACE_KEY_Y,
    CONFIG.SPACE_KEY_WIDTH, CONFIG.SPACE_KEY_HEIGHT, 8
  );
  ctx.fill();

  // 空格键边框（白色）
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  drawRoundRect(
    spaceKeyX, CONFIG.SPACE_KEY_Y,
    CONFIG.SPACE_KEY_WIDTH, CONFIG.SPACE_KEY_HEIGHT, 8
  );
  ctx.stroke();

  // "SPACE" 文字
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SPACE', spaceKeyCenterX, CONFIG.SPACE_KEY_Y + CONFIG.SPACE_KEY_HEIGHT / 2);

  // 双拇指标记圆点（左右各一个）
  const thumbDotY = CONFIG.SPACE_KEY_Y + CONFIG.SPACE_KEY_HEIGHT - 8;
  ctx.fillStyle = '#ffffff';
  // 左拇指
  ctx.beginPath();
  ctx.arc(spaceKeyX + CONFIG.SPACE_KEY_WIDTH * 0.25, thumbDotY, 4, 0, Math.PI * 2);
  ctx.fill();
  // 右拇指
  ctx.beginPath();
  ctx.arc(spaceKeyX + CONFIG.SPACE_KEY_WIDTH * 0.75, thumbDotY, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();  // 恢复屏幕震动，之后计分板不受影响

  // ---- 6. 计分板 ----
  const scoreboardY = 30;

  // 分数标签
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('SCORE', 20, scoreboardY - 14);

  // 分数数字（带放大动画）
  ctx.save();
  const sx = game.scoreAnim.scale;
  ctx.translate(20, scoreboardY);
  ctx.scale(sx, sx);
  ctx.fillStyle = '#FFD700';
  ctx.font = 'bold 42px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(game.score), 0, 0);
  ctx.restore();

  // COMBO 标签
  ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText('COMBO', CONFIG.WIDTH - 20, scoreboardY - 14);

  // COMBO 数字（带放大动画）
  ctx.save();
  const csx = game.comboAnim.scale;
  ctx.translate(CONFIG.WIDTH - 20, scoreboardY);
  ctx.scale(csx, csx);
  ctx.fillStyle = game.combo >= 5 ? '#FF6B6B' : '#69DB7C';
  ctx.font = 'bold 42px monospace';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(game.combo), 0, 0);
  ctx.restore();

  // ---- 7. 游戏计时显示 ----
  const minutes = Math.floor(game.elapsedTime / 60);
  const seconds = Math.floor(game.elapsedTime % 60);
  const timeStr = `${minutes}:${String(seconds).padStart(2, '0')}`;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.font = '14px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(timeStr, CONFIG.WIDTH / 2, 30);

  // ---- 8. 连击提示文字 ----
  if (game.combo >= 5) {
    const text = game.combo >= 10 ? 'AMAZING!!' : 'GREAT!';
    const pulse = 1 + 0.1 * Math.sin(performance.now() / 200);
    ctx.save();
    ctx.translate(CONFIG.WIDTH / 2, 120);
    ctx.scale(pulse, pulse);
    ctx.font = `bold ${game.combo >= 10 ? 36 : 28}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (game.combo >= 10) {
      // 彩虹效果
      const hue = (performance.now() / 50) % 360;
      ctx.fillStyle = `hsl(${hue}, 100%, 60%)`;
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 20;
    } else {
      ctx.fillStyle = '#FFD700';
      ctx.shadowColor = '#FFD700';
      ctx.shadowBlur = 15;
    }
    ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  // 9. 边界框
  ctx.strokeStyle = '#1a3a5c';
  ctx.lineWidth = 2;
  ctx.strokeRect(2, 2, CONFIG.WIDTH - 4, CONFIG.HEIGHT - 4);
}

// ============================================================
// Start
// ============================================================
requestAnimationFrame(gameLoop);
