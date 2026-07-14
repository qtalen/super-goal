# Typing Practice Game — 架构设计

## 项目结构

```
typing-practice-game/
  index.html       # 入口页面
  style.css        # 页面样式 & Canvas 容器
  main.js          # 全部游戏逻辑（模块化内部组织）
```

## 虚拟坐标系统

固定虚拟分辨率 **900 × 720px**，Canvas 等比缩放填充视口。

```
┌──────────────────────────────────────────┐  y=0
│  █████████  SCORE: 42  █████████  COMBO  │  y=0 ~ 60   (计分板)
│  ██████████████████████████████████████  │
├──────────────────────────────────────────┤  y=60
│                                          │
│   Q           W           E           R  │  字母下落区域
│                                          │  y=60 ~ 460
│      A     S     D     F     J  K  L  ; │
│                                          │
│  ╔══════════════════════════════════════╗│  y=460 ~ 510  (命中区)
│  ║    ░░░░░░░  HIT ZONE ░░░░░░░░       ║│  渐变透明，50px
│  ╚══════════════════════════════════════╝│
│                                          │
│  ┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐┌──┐    │  y=560 ~ 630 (8个字母键)
│  │A ││S ││D ││F ││J ││K ││L ││; │    │
│  │◉ ││◉ ││◉ ││◉ ││◉ ││◉ ││◉ ││◉ │    │  70px 高
│  └──┘└──┘└──┘└──┘└──┘└──┘└──┘└──┘    │
│  ┌──────────────────────────────────┐   │  y=635 ~ 705 (空格键)
│  │             SPACE  ◉◉           │   │  70px 高，双拇指
│  └──────────────────────────────────┘   │
└──────────────────────────────────────────┘  y=720
```

## 9 列映射（标准指法）

| 列索引 | 底键 | 手指 | 映射字母 |
|--------|------|------|---------|
| 0 | A | 左小指 | Q, A, Z |
| 1 | S | 左无名指 | W, S, X |
| 2 | D | 左中指 | E, D, C |
| 3 | F | 左食指 | R, F, V, T, G, B |
| 4 | J | 右食指 | Y, H, N, U, J, M |
| 5 | K | 右中指 | I, K |
| 6 | L | 右无名指 | O, L |
| 7 | ; | 右小指 | P |
| 8 | Space | 双拇指 | Space（游戏中不生成空格字母） |

每列中心 X 坐标均匀分布在游戏区域宽度内（边界留 10px padding）。

## 核心数据结构

```javascript
// 游戏全局状态
const gameState = {
  score: 0,
  combo: 0,
  maxCombo: 0,
  elapsedTime: 0,      // 秒
  letters: [],          // FallingLetter[]
  particles: [],       // Particle[]
  screenShake: { x: 0, y: 0, intensity: 0 },
  backgroundColor: { r, g, b },
  isPlaying: false,
  spawnTimer: 0,
  difficulty: 1,        // 当前难度倍率
}

// 下落字母
class FallingLetter {
  letter: string       // 'A'-'Z'
  col: number          // 0-8
  x: number            // 中心 x
  y: number            // 当前 y
  speed: number        // px/s
  color: string        // 手指区域颜色
  active: boolean
  opacity: number      // 用于淡出动画
  scale: number        // 用于击中缩放
}
```

## 游戏主循环

```
requestAnimationFrame 循环:

function tick(timestamp):
  deltaTime = (timestamp - lastTimestamp) / 1000
  update(deltaTime)   → 更新状态
  render()
  lastTimestamp = timestamp
  requestAnimationFrame(tick)
```

## 渲染管线（自底向上）

| 层 | 内容 | 说明 |
|----|------|------|
| 0 | 背景 | 深色渐变背景，带动态闪烁 |
| 1 | 背景粒子 | 环境粒子装饰 |
| 2 | 字母连线 | 字母拖尾/残影效果 |
| 3 | 下落字母 | 当前所有活动的 FallingLetter |
| 4 | 命中区渐变 | 半透明渐变矩形，边框发光 |
| 5 | 击中特效粒子 | 粒子爆炸、连击特效 |
| 6 | 底部键盘 | 9 个键的视觉渲染 + 手指图标 |
| 7 | 计分板 | 分数 + combo 数字 + 放大动画 |
| 8 | 屏幕震动偏移 | 根据 screenShake 偏移整个画布 |

## 关键算法

### 字母生成

- 每帧按当前难度计算生成概率：`baseInterval / difficulty`
- 从 26 个字母中随机选择一个
- 按字母→列映射确定 col
- 初始 y = -30（从顶部外进入）
- 初始速度 = `baseSpeed * difficulty`

### 速度公式

```
baseSpeed = 80 px/s (初始)
加速曲线: speed = baseSpeed * (1 + elapsedTime / 600)  // 每10分钟速度翻倍
上限: speed = min(speed, 400)
difficulty 随 elapsedTime 线性增长
生成间隔: 1.2s / difficulty，最短 0.3s
```

### 命中检测

```
按键事件:
  key → 映射到 column (0-8)
  遍历 gameState.letters:
    匹配列 && y 在 [HIT_ZONE_TOP, HIT_ZONE_BOTTOM] 范围内
    → 取最下方匹配的字母 → 命中
    
命中处理:
  移除字母
  score += 1
  combo += 1
  生成粒子特效（根据 combo 级别）
  maxCombo = max(maxCombo, combo)
```

### 连击升级级别

| 连击范围 | 特效级别 | 具体效果 |
|----------|---------|---------|
| 1 | 基础 | 8 粒子白色爆发，半径 30px |
| 2-4 | 中级 | 12 彩色粒子，微屏震 2px，粒子半径 40px |
| 5-9 | 高级 | 20 粒子 + 大粒子混合，屏震 5px，背景色闪白 100ms |
| 10+ | 究极 | 40 彩虹粒子 + 环状波，屏震 10px，背景色闪全彩，粒子半径 60px |

粒子属性：位置、速度向量、生命周期、颜色、大小、透明度。

### 字母遗漏

```
每帧检测:
  进入 hitZone 的字母标记 inZone = true
  离开底部 (y > canvasHeight) 的字母:
    active = false (移除)
    if inZone: combo = 0  // 进入过命中区但没打中 → combo 归零
```

## 音效设计（Web Audio API）

无需外部音频文件，使用 Web Audio API 合成：

| 音效 | 实现方式 | 触发条件 |
|------|---------|---------|
| 击中音 | 短正弦波 800Hz→400Hz 快速衰减，时长 80ms | 每次命中 |
| 连击升级音 | 叠加三角波 600Hz+900Hz，渐强衰减 | combo=2,5,10 阈值 |
| 字母遗漏音 | 低频噪声 100Hz，短促 | 字母遗漏 |

## 屏幕布局常量

```javascript
const LAYOUT = {
  WIDTH: 900,
  HEIGHT: 720,
  SCOREBOARD_TOP: 0,
  SCOREBOARD_BOTTOM: 60,
  GAME_AREA_TOP: 60,
  GAME_AREA_BOTTOM: 460,
  HIT_ZONE_TOP: 460,
  HIT_ZONE_BOTTOM: 510,
  KEYBOARD_TOP: 560,
  KEYBOARD_BOTTOM: 705,
  LETTER_KEYS_Y: 560,
  KEY_HEIGHT: 70,
  LETTER_KEY_WIDTH: 80,
  SPACE_KEY_Y: 635,
  SPACE_KEY_WIDTH: 700,
  SPACE_KEY_HEIGHT: 70,
  COLUMN_COUNT: 9,
}
```

## 颜色方案

| 手指区域 | 颜色 |
|----------|------|
| 左小指(A列) | #FF6B6B (红) |
| 左无名指(S列) | #FFA94D (橙) |
| 左中指(D列) | #FFD43B (黄) |
| 左食指(F列) | #69DB7C (绿) |
| 右食指(J列) | #4DABF7 (蓝) |
| 右中指(K列) | #748FFC (靛) |
| 右无名指(L列) | #DA77F2 (紫) |
| 右小指(;列) | #F783AC (粉) |
| 双拇指(Space) | #FFFFFF (白) |

## 实现顺序

严格按依赖拓扑，每个需求为一个增量提交：

```
1. 项目搭建 & Canvas 循环  →  2. 键盘+命中区  →  3. 字母下落
                                                        ↘
4. 命中检测 → 5. 计分板 → 6. 特效连击 → 8. 音效+打磨
                 ↘          ↙
               7. 速度+遗漏
```
