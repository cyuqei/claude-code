# Phase 3: 战斗 UI — 终端交互

## 前置

Phase 2 完成（引擎 API 就绪：createBattle, executeTurn, settleBattle, applyMoveLearn, applyEvolution）

## 目标

基于 Phase 2 引擎 API，构建终端战斗交互界面。纯 UI 层，无引擎逻辑。

## 引擎 API 依赖

```
createBattle(party, opponent, level, bagItems) → BattleState
executeTurn(state, action) → BattleState
settleBattle(data, state) → { data, learnableMoves, pendingEvolutions }
applyMoveLearn(data, creatureId, moveId, replaceIndex) → BuddyData
applyEvolution(data, creatureId) → BuddyData
```

## 新建文件

```
packages/pokemon/src/ui/
├── BattleConfigPanel.tsx    # 战斗前配置
├── BattleView.tsx           # 战斗主界面
├── SwitchPanel.tsx          # 换人选择
├── ItemPanel.tsx            # 道具使用
├── BattleResultPanel.tsx    # 战斗结算
├── MoveLearnPanel.tsx       # 招式学习
src/commands/buddy/
└── BattleFlow.tsx           # 状态机编排
```

## 详细设计

### 1. BattleConfigPanel — 战斗配置

```
┌── 战斗配置 ──────────────────────────────────┐
│  队伍:                                       │
│  ▶ Charizard  Lv.36 🔥🦅  HP ██████ 100%   │
│    Venusaur   Lv.28 🌿☢   HP ██████ 100%   │
│    [空] [空] [空]                             │
│                                              │
│  对手:                                       │
│  [1] 随机遇战（等级自动匹配）                  │
│  [2] 指定对手: _________                      │
│                                              │
│  [Enter] 开始战斗  [ESC] 取消                 │
└──────────────────────────────────────────────┘
```

Props: `{ party, onSubmit, onCancel }`

交互：[1] 随机遇战 → ±5 级匹配；[2] 模糊搜索物种名；Enter 确认；ESC 取消。

### 2. BattleView — 战斗主界面

```
┌────────────────────────────────────────────┐
│  野生 Blastoise (Lv.32) 💧                │
│  HP ████░░░░ 78%         [烧伤]            │
│            (对手精灵 ASCII)                  │
│  ── vs ──                                  │
│          (我方精灵 ASCII)                    │
│  Charizard (Lv.36) ♂ 🔥🦅                  │
│  HP ████████ 95%         [特性: 猛火]       │
│                                            │
│  > 选择行动:                                │
│  [1] Flamethrower  PP 15/15                │
│  [2] Air Slash     PP 15/15                │
│  [3] Dragon Rage   PP 10/10                │
│  [4] Slash         PP 20/20                │
│  [S] 换人  [I] 道具                         │
│                                            │
│  效果拔群! Blastoise 受到 23 点伤害!         │
└────────────────────────────────────────────┘
```

Props: `{ state: BattleState, onAction: (action) => void }`

视觉：HP 条 >50% 绿/25-50% 黄/<25% 红；状态标签彩色；PP=0 灰显；最近 8 条事件日志。

### 3. SwitchPanel — 换人选择

```
┌── 换人 ──────────────────────────┐
│  [1] Venusaur  (Lv.28) HP 100%   │
│  [2] Pikachu   (Lv.25) HP 72%    │
│  [3] Wartortle (Lv.22) HP 45% ⚠  │
│  [ESC] 取消                      │
└──────────────────────────────────┘
```

Props: `{ party, activeId, onSelect, onCancel }`

HP=0 灰显不可选；当前场上精灵标注 ▶ 不可选；ESC 取消。

### 4. ItemPanel — 道具使用

```
┌── 道具 ──────────────────────────┐
│  [1] 伤药 ×3        恢复 20 HP   │
│  [2] 好伤药 ×1      恢复 50 HP   │
│  [ESC] 取消                      │
└──────────────────────────────────┘
```

Props: `{ items, onSelect, onCancel }`

### 5. BattleResultPanel — 战斗结算

```
┌── 战斗结束！胜利！ ──────────────────────┐
│  Charizard 获得了 340 经验值！           │
│  ████████████░░ 75% → 82%              │
│  ⬆ 升到了 Lv.37！                      │
│  努力值获得: ATK +2  DEF +1             │
│  [Enter] 继续                           │
└─────────────────────────────────────────┘
```

### 6. MoveLearnPanel — 招式学习

```
┌── 新招式！ ──────────────────────────────────┐
│  Charizard 升到了 Lv.37！                    │
│  可以学习: Flamethrower 🔥                    │
│  当前招式:                                   │
│  [1] Ember       PP 35/35                    │
│  [2] Air Slash   PP 15/15  ← 替换目标        │
│  [3] Dragon Rage PP 10/10                    │
│  [4] Slash       PP 20/20                    │
│  [Y] 学习  [N] 跳过  [← →] 切换替换目标      │
└──────────────────────────────────────────────┘
```

### 7. BattleFlow — 状态机编排

```
config → battle ⇌ switch/item (子状态) → result → learnMoves → evolution → 完成
```

- `config`：渲染 BattleConfigPanel → `createBattle()`
- `battle`：渲染 BattleView
  - 选招 → `executeTurn({ type: 'move' })`
  - S → SwitchPanel → `executeTurn({ type: 'switch' })`
  - I → ItemPanel → `executeTurn({ type: 'item' })`
  - `finished` → `settleBattle()` → `result`
- `result`：BattleResultPanel → learnMoves / evolution
- `learnMoves`：循环 MoveLearnPanel → `applyMoveLearn()`
- `evolution`：循环 EvolutionAnim → `applyEvolution()`
- 完成 → `saveBuddyData()`

### 8. 命令集成

`/buddy battle` → 打开 BattleConfigPanel
`/buddy battle pikachu` → 快捷指定对手

`src/commands/buddy/index.ts` 更新 argumentHint：`'[pet|dex|egg|battle|switch|rename <name>|on|off]'`

## 使用 @pkmn 包

- `@pkmn/view`（LogFormatter，可选用于战斗日志格式化）

## 验证

1. `bun run typecheck` 零错误
2. `/buddy battle` 完整流程：
   - 配置 → 选对手 → 开始战斗
   - 选招 → HP 变化 + 事件日志
   - S → 换人 → 对手出招
   - I → 选道具 → HP 恢复
   - 胜利 → 结算 → 升级提示
   - 新招式 → 确认学习/跳过
   - 进化 → 动画
3. 战后数据持久化正确（XP/EV/招式/进化），HP/PP 下次战斗满值

## 代码量

新增 ~400 行（6 个 UI 组件 + 状态机 + 命令集成）
