# Phase 2: 战斗引擎 — @pkmn 薄适配层

## 前置

Phase 1 完成（Creature 含 moves/ability/nature/heldItem，PCBox/Bag 就位）

## 目标

安装 `@pkmn/protocol`、`@pkmn/client`、`@pkmn/view`，构建战斗引擎作为 @pkmn 的薄适配层。纯逻辑层，不涉及 UI。

## 安装依赖

```bash
cd packages/pokemon && bun add @pkmn/protocol @pkmn/client @pkmn/view
```

## 战斗设计原则

- **战后自动恢复**：每场战斗结束后 HP/PP 自动恢复满值，Creature 不存 currentHp
- **不可逃跑**：野生战斗必须打到一方倒下
- **状态不持久化**：异常状态、能力阶级仅存在于 BattleState
- **支持换人**：战斗中可切换 party 其他精灵（消耗回合）
- **支持道具**：战斗中使用背包道具（消耗回合）
- **特性/物品自动处理**：@pkmn/sim 内置

## 核心架构

```
@pkmn/sim Battle ──(log)──→ @pkmn/protocol ──(Handler)──→ BattleEvent[]
                    ──(protocol)──→ @pkmn/client Battle ──(投影)──→ BattleState
```

## 新建文件

```
packages/pokemon/src/battle/
├── types.ts        # BattleState, BattleEvent, BattleResult, PlayerAction, BattlePokemon
├── adapter.ts      # Creature → PokemonSet 转换（stat key + gender 映射）
├── engine.ts       # createBattle(), executeTurn() — 薄封装 @pkmn/sim Battle
├── handler.ts      # @pkmn/protocol Handler → BattleEvent 转换
├── ai.ts           # AI 决策（随机合法招式）
├── settlement.ts   # 战后结算（XP/EV/升级/进化/招式学习/背包扣减）
└── index.ts        # 导出
```

## 详细实现

### 1. battle/types.ts — 战斗类型

```typescript
export type StatusCondition = 'poison' | 'bad_poison' | 'burn' | 'paralysis' | 'freeze' | 'sleep' | 'none'

export type BattlePokemon = {
  id: string                      // creature ID
  speciesId: string
  name: string
  level: number
  hp: number                      // 战斗中当前 HP
  maxHp: number
  types: string[]
  moves: MoveOption[]
  ability: string
  heldItem: string | null
  status: StatusCondition
  statStages: Record<string, number>  // -6 到 +6
}

export type MoveOption = {
  id: string; name: string; type: string
  pp: number; maxPp: number; disabled: boolean
}

export type PlayerAction =
  | { type: 'move'; moveIndex: number }
  | { type: 'switch'; creatureId: string }
  | { type: 'item'; itemId: string }

export type BattleEvent =
  | { type: 'move'; side: 'player' | 'opponent'; move: string; user: string }
  | { type: 'damage'; side: 'player' | 'opponent'; amount: number; percentage: number }
  | { type: 'heal'; side: 'player' | 'opponent'; amount: number; percentage: number }
  | { type: 'faint'; side: 'player' | 'opponent'; speciesId: string }
  | { type: 'switch'; side: 'player' | 'opponent'; speciesId: string; name: string }
  | { type: 'effectiveness'; multiplier: number }
  | { type: 'crit' }
  | { type: 'miss' }
  | { type: 'status'; side: 'player' | 'opponent'; status: StatusCondition }
  | { type: 'statChange'; side: 'player' | 'opponent'; stat: string; stages: number }
  | { type: 'ability'; side: 'player' | 'opponent'; ability: string }
  | { type: 'item'; side: 'player' | 'opponent'; item: string }
  | { type: 'fail'; reason: string }
  | { type: 'turn'; number: number }

export type BattleResult = {
  winner: 'player' | 'opponent'
  turns: number
  xpGained: number
  evGained: Record<string, number>
  participantIds: string[]
}

export type BattleState = {
  _sim: any                          // @pkmn/sim Battle 实例（内部）
  _client: any                       // @pkmn/client Battle 实例（内部）
  playerPokemon: BattlePokemon       // 从 _client.p1.active[0] 投影
  opponentPokemon: BattlePokemon     // 从 _client.p2.active[0] 投影
  playerParty: BattlePokemon[]       // 从 _client.p1.team 投影
  turn: number
  events: BattleEvent[]
  finished: boolean
  result?: BattleResult
  usableItems: { id: string; name: string; count: number }[]
}
```

### 2. battle/adapter.ts — 格式转换

- `creatureToSet(creature)` → `PokemonSet`（stat key 映射 attack→atk, spAtk→spa 等）
- `wildPokemonToSet(speciesId, level)` → 野生对手 `PokemonSet`
- 复用 `TO_DEX_STAT` 映射（来自 `data/pkmn.ts`）

### 3. battle/engine.ts — 核心引擎

- `createBattle(partyCreatures, opponentSpeciesId, opponentLevel, bagItems?)` → BattleState
  - 创建 `@pkmn/sim.Battle` 实例（`gen9customgame` 格式）
  - 创建 `@pkmn/client.Battle` 实例追踪状态
- `executeTurn(state, action)` → BattleState
  - 构建 choice 字符串（`move 1` / `switch 2`）
  - AI 选招（随机合法招式）
  - `battle.makeChoices(p1, p2)`
  - 新 log → `@pkmn/protocol` Handler → BattleEvent[]
  - 从 `_client` 投影 BattleState

### 4. battle/handler.ts — 协议处理

- 实现 `Protocol.Handler` 接口
- 每个 `|move|`、`|-damage|`、`|faint|` 等回调产出 `BattleEvent`
- 替代手写 switch-case 解析器

### 5. battle/ai.ts — AI 决策

初期实现：从对手可用招式中随机选一个（PP > 0）。后续可增加属性克制优先。

### 6. battle/settlement.ts — 战后结算

```typescript
settleBattle(data, battleState) → {
  data: BuddyData
  learnableMoves: { creatureId, moveId, moveName }[]
  pendingEvolutions: { creatureId, from, to }[]
}
applyMoveLearn(data, creatureId, newMoveId, replaceIndex) → BuddyData
applyEvolution(data, creatureId) → BuddyData
```

结算流程：XP → EV → 升级 → 新招式检测 → 进化检测 → 背包扣减 → 统计更新。

## 使用 @pkmn 包

- `@pkmn/sim`（Battle 类、Dex.teams.pack）
- `@pkmn/protocol`（Protocol.Handler、Protocol.parse）
- `@pkmn/client`（Battle 状态追踪）
- `@pkmn/sets`（PokemonSet 类型）
- `@pkmn/view`（LogFormatter，可选）
- `@pkmn/data`（stats.calc，Phase 0 已集成）

## 测试

**新文件**: `packages/pokemon/src/__tests__/battle.test.ts`

- 创建战斗：BattleState 初始化正确
- 选招回合：HP 更新 + 事件生成
- 异常状态：状态附加/恢复
- 换人：正确切换 + 对手出招
- 道具：HP 恢复 + 背包扣减
- 特性/物品：事件生成
- 击倒 → 结束 → XP/EV 奖励
- 战后不写入 Creature 持久化数据

## 验证

1. `bun test packages/pokemon/src/__tests__/battle.test.ts` 通过
2. 可在 Node REPL 中完成完整战斗流程
3. `bun run typecheck` 零错误

## 代码量

新增 ~300 行（适配层），避免 ~500 行手写引擎
