# Phase 1: 数据模型升级 — Creature v2 + 存储迁移

## 前置

Phase 0 完成（@pkmn 数据源已就位，Natures/Evolution/Stats 已委托）

## 目标

扩展 Creature 类型（Nature/Moves/Ability/HeldItem），新增 PCBox/Bag，BuddyData v2 存储迁移。

## 新类型定义

### types.ts 新增

```typescript
// 招式槽位
export type MoveSlot = { id: string; pp: number; maxPp: number }
export const EMPTY_MOVE: MoveSlot = { id: '', pp: 0, maxPp: 0 }

// 道具 ID（Showdown 格式字符串）
export type ItemId = string

// PC 箱（固定 30 槽）
export type PCBox = {
  name: string
  slots: (string | null)[]  // 固定长度 30，存 creature ID
}

// 背包条目
export type BagEntry = { id: ItemId; count: number }
export type Bag = { items: BagEntry[] }
```

### Creature 扩展

```typescript
export type Creature = {
  // ─── 标识 ───
  id: string                          // UUID
  speciesId: SpeciesId
  nickname?: string

  // ─── 基础属性 ───
  gender: Gender
  level: number
  xp: number                          // 当前等级进度 XP
  totalXp: number                     // 累计总 XP
  nature: NatureName                  // NEW: 性格
  isShiny: boolean

  // ─── 能力值 ───
  ev: Record<StatName, number>        // 努力值
  iv: Record<StatName, number>        // 个体值 (0-31)

  // ─── 战斗 ───
  moves: [MoveSlot, MoveSlot, MoveSlot, MoveSlot]  // NEW: 4 招式槽位
  ability: string                     // NEW: Showdown 特性 ID
  heldItem: ItemId | null             // NEW: 携带道具

  // ─── 关系 ───
  friendship: number                  // 亲密度 (0-255)
  hatchedAt: number                   // 获得时间戳
  pokeball: string                    // NEW: 捕获球
}
```

### BuddyData v2

```typescript
export type BuddyData = {
  version: 2
  party: (string | null)[]            // 固定 6 槽，party[0] = 活跃精灵
  boxes: PCBox[]                      // NEW: PC 箱（默认 8 箱 × 30 槽）
  creatures: Creature[]               // 主表
  eggs: Egg[]
  dex: DexEntry[]
  bag: Bag                            // NEW: 玩家背包
  stats: {
    totalTurns: number
    consecutiveDays: number
    lastActiveDate: string
    totalEggsObtained: number
    totalEvolutions: number
    battlesWon: number                // NEW
    battlesLost: number               // NEW
  }
}
```

## 设计决策

- Party 和 Box 只存 `id`，不嵌套对象 → 单一数据源，移动只改引用
- Creature 主表用数组 → JSON 友好
- 8 箱 × 30 槽 = 240 + 6 party = 246 上限 → 足够 MVP
- `activeCreatureId` 彻底删除 → Party slot 0 即活跃精灵
- 战后自动恢复：HP/PP 满值，Creature 不存 currentHp
- 异常状态/能力阶级仅战斗内（Phase 2 BattleState），不持久化

## 新建文件

### data/learnsets.ts

```typescript
import { Dex } from '@pkmn/sim'
import type { SpeciesId, MoveSlot } from '../types'
import { EMPTY_MOVE } from '../types'

const GEN = 9

/** 获取物种在指定等级的默认招式（最后 4 个 level-up 招式） */
export function getDefaultMoveset(speciesId: SpeciesId, level: number): [MoveSlot, MoveSlot, MoveSlot, MoveSlot] {
  const learnset = Dex.learnsets.get(speciesId)
  if (!learnset?.learnset) return [EMPTY_MOVE, EMPTY_MOVE, EMPTY_MOVE, EMPTY_MOVE]

  const levelUpMoves: { id: string; level: number }[] = []
  for (const [moveId, sources] of Object.entries(learnset.learnset)) {
    for (const src of sources) {
      if (src.startsWith(`${GEN}L`)) {
        levelUpMoves.push({ id: moveId, level: parseInt(src.slice(2)) })
        break
      }
    }
  }

  levelUpMoves.sort((a, b) => a.level - b.level)
  const available = levelUpMoves.filter(m => m.level <= level).slice(-4)

  const slots: MoveSlot[] = available.map(m => {
    const dexMove = Dex.moves.get(m.id)
    return { id: m.id, pp: dexMove?.pp ?? 10, maxPp: dexMove?.pp ?? 10 }
  })

  while (slots.length < 4) slots.push(EMPTY_MOVE)
  return slots as [MoveSlot, MoveSlot, MoveSlot, MoveSlot]
}

/** 获取物种的默认特性（第一个非隐藏特性） */
export function getDefaultAbility(speciesId: SpeciesId): string {
  const species = Dex.species.get(speciesId)
  return species?.abilities?.['0']?.toLowerCase() ?? ''
}

/** 获取物种在指定等级新可学的招式列表（用于升级检测） */
export function getNewLearnableMoves(speciesId: SpeciesId, oldLevel: number, newLevel: number): { id: string; name: string }[] {
  const learnset = Dex.learnsets.get(speciesId)
  if (!learnset?.learnset) return []

  const result: { id: string; name: string }[] = []
  for (const [moveId, sources] of Object.entries(learnset.learnset)) {
    for (const src of sources) {
      if (src.startsWith(`${GEN}L`)) {
        const moveLevel = parseInt(src.slice(2))
        if (moveLevel > oldLevel && moveLevel <= newLevel) {
          const dexMove = Dex.moves.get(moveId)
          result.push({ id: moveId, name: dexMove?.name ?? moveId })
        }
        break
      }
    }
  }
  return result
}
```

## 改动

| 文件 | 操作 |
|------|------|
| `types.ts` | 新增 MoveSlot/PCBox/Bag 类型；Creature 扩展字段；BuddyData v2；删除 `activeCreatureId` |
| `core/creature.ts` | `generateCreature()` 填充 nature（randomNature）、moves（getDefaultMoveset）、ability（getDefaultAbility） |
| `core/storage.ts` | BuddyData v2 默认值；v1→v2 迁移；PCBox 操作；Bag 操作 |
| `core/egg.ts` | `hatchEgg()` 返回的 creature 自动放入 party 空位或 PC 箱 |
| `index.ts` | 新增所有导出 |

### storage.ts 新增函数

```typescript
// PC 箱操作
depositToBox(data, creatureId): { data, deposited }
withdrawFromBox(data, creatureId): { data, withdrawn }
moveInBox(data, fromBox, fromSlot, toBox, toSlot): BuddyData
renameBox(data, boxIndex, name): BuddyData
findCreatureLocation(data, creatureId): { area, slot } | null
releaseCreature(data, creatureId): BuddyData
getTotalCreatureCount(data): number
getAllCreatureIds(data): string[]

// 背包操作
addItemToBag(data, itemId, count?): BuddyData
removeItemFromBag(data, itemId, count?): { data, removed }
getItemCount(data, itemId): number
```

### v1 → v2 迁移

- 保留 `party` 数组
- 新增默认 8 箱空 `boxes`
- 不在 party 的精灵放入 Box 1 前几个槽位
- 每个 creature 补全新字段：`nature`（随机）、`moves`（getDefaultMoveset）、`ability`（getDefaultAbility）、`heldItem: null`、`pokeball: 'pokeball'`
- 新增 `bag: { items: [] }`
- `stats` 补全 `battlesWon: 0`, `battlesLost: 0`
- 删除 `activeCreatureId`

## 验证

1. `bun run typecheck` + `bun test packages/pokemon/`
2. 新 creature 带有随机 nature + 正确的 4 招（含 PP）+ 默认 ability
3. 旧 v1 数据自动迁移为 v2：boxes 生成、空 moves/ability 被回填
4. PC 箱操作：存入/取出/移动/释放均正确
5. 背包操作：添加/消耗/查询均正确
6. `bun run dev` → `/buddy` 现有功能正常（pet、dex、egg、switch）

## 代码量

新增 ~200 行（类型 + learnsets + PCBox/Bag 操作 + 迁移）
