# Phase 0: 清除重复 — 委托 @pkmn

## 目标

删除所有与 @pkmn 重复的硬编码数据和手写公式，统一委托给 @pkmn 生态。**零新功能，纯重构。**

## 设计原则

先清后建。先消除重复代码，再在干净基础上添加新功能。此 Phase 不引入任何新类型或新功能。

## 改动

| 文件 | 操作 | 说明 |
|------|------|------|
| `types.ts` | 删除 `NATURES` 常量（27 行） | `Dex.natures` 已有完整数据 |
| `data/nature.ts` | 重写 | `ALL_NATURE_NAMES` → 遍历 `Dex.natures`；`getNatureEffect()` → 查询 `Dex.natures.get()` |
| `data/evolution.ts` | 重写 | `EVOLUTION_CHAINS` → `Dex.species.get(id).evos`/`.evoLevel` 动态查询 |
| `core/creature.ts` | 重写 `calculateStats()` | 手写公式 → `gen.stats.calc()`（Nature ±10% 自动处理） |
| `data/species.ts` | 简化 `buildEvolutionChain()` | 已部分使用 Dex.evos，统一用新 `getNextEvolution()` |
| `data/pkmn.ts` | 统一 `gens` 单例 | 导出 `gen` 和 `TO_DEX_STAT` 映射，消除多处重复创建 `Generations` |

## 使用 @pkmn 包

- `@pkmn/sim`（Dex.natures, Dex.species）
- `@pkmn/data`（stats.calc, Generations）

## 保留不变

- `types.ts` 中的 `NatureName`/`NatureStat`/`NatureEffect` 类型定义（Creature 类型约束需要）
- `data/species.ts` 的 `SUPPLEMENT`（growthRate/captureRate/flavorText 不在 Dex 中）
- `data/names.ts`（i18n 多语言名称）
- `data/xpTable.ts`、`data/evMapping.ts`（完全自定义）
- `core/` 其他文件、`ui/`、`sprites/`

## 详细实现

### 1. types.ts — 删除 NATURES

删除 `types.ts` 中 `NATURES` 常量（约 27 行手写数据）。保留 `NatureName`、`NatureStat`、`NatureEffect` 类型。

### 2. data/nature.ts — 委托 Dex.natures

```typescript
import { Dex } from '@pkmn/sim'
import type { NatureName, NatureEffect, NatureStat } from '../types'

export function getAllNatureNames(): NatureName[] {
  const names: NatureName[] = []
  for (const nature of Dex.natures) {
    if (nature.exists) names.push(nature.id as NatureName)
  }
  return names
}

export function randomNature(): NatureName {
  const names = getAllNatureNames()
  return names[Math.floor(Math.random() * names.length)]!
}

export function getNatureEffect(nature: NatureName): NatureEffect {
  const n = Dex.natures.get(nature)
  if (!n?.exists) return { plus: null, minus: null }
  return {
    plus: (n.plus as NatureStat | undefined) ?? null,
    minus: (n.minus as NatureStat | undefined) ?? null,
  }
}
```

### 3. data/evolution.ts — 委托 Dex.species

```typescript
import { Dex } from '@pkmn/sim'
import type { SpeciesId } from '../types'

export interface EvolutionChainStep {
  from: SpeciesId
  to: SpeciesId
  trigger: 'level_up' | 'item' | 'trade' | 'friendship'
  minLevel?: number
}

/** 查找物种的下一个进化（从 Dex 动态获取） */
export function getNextEvolution(speciesId: SpeciesId): EvolutionChainStep | undefined {
  const dex = Dex.species.get(speciesId)
  if (!dex?.evos?.length) return undefined

  const target = dex.evos[0]!.toLowerCase()
  const targetDex = Dex.species.get(target)
  if (!targetDex?.exists) return undefined

  const trigger = dex.evoType === 'trade' ? 'trade'
    : dex.evoType === 'useItem' ? 'item'
    : dex.evoType === 'levelFriendship' ? 'friendship'
    : 'level_up'

  return {
    from: speciesId,
    to: target as SpeciesId,
    trigger,
    minLevel: targetDex.evoLevel,
  }
}
```

### 4. data/pkmn.ts — 统一 gens 单例 + 导出 stat 映射

```typescript
import { Dex } from '@pkmn/sim'
import { Generations } from '@pkmn/data'
import type { StatName } from '../types'

// 统一单例（全包唯一入口）
const gens = new Generations(Dex as unknown as import('@pkmn/data').Dex)
export const gen = gens.get(9)

// Stat key 映射：@pkmn 缩写 → 我们的 StatName
export const FROM_DEX_STAT: Record<string, StatName> = {
  hp: 'hp', atk: 'attack', def: 'defense',
  spa: 'spAtk', spd: 'spDef', spe: 'speed',
}

// Stat key 映射：我们的 StatName → @pkmn 缩写
export const TO_DEX_STAT: Record<StatName, string> = {
  hp: 'hp', attack: 'atk', defense: 'def',
  spAtk: 'spa', spDef: 'spd', speed: 'spe',
}

// ...保留现有 getSpecies, getMove, getAbility, getType, mapBaseStats, mapGenderRatio, getPrimaryAbility ...
```

### 5. core/creature.ts — calculateStats 委托 stats.calc

```typescript
import { gen, TO_DEX_STAT } from '../data/pkmn'
import { STAT_NAMES } from '../types'
import type { Creature, StatsResult } from '../types'

export function calculateStats(creature: Creature): StatsResult {
  const species = gen.species.get(creature.speciesId)
  if (!species) throw new Error(`Species ${creature.speciesId} not found`)

  const nature = creature.nature ? gen.natures.get(creature.nature) : undefined
  const result = {} as StatsResult

  for (const stat of STAT_NAMES) {
    const dexKey = TO_DEX_STAT[stat] as 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe'
    result[stat] = gen.stats.calc(
      dexKey,
      species.baseStats[dexKey],
      creature.iv[stat],
      creature.ev[stat],
      creature.level,
      nature ?? undefined,
    )
  }

  return result
}
```

**注意**：`gen.stats.calc()` 内部已处理 Nature ±10% 修正。Phase -1 计划中的手写 Nature 修正代码不再需要。

### 6. data/species.ts — 简化 buildEvolutionChain

现有的 `buildEvolutionChain()` 已使用 `dex.evos`，只需确保它与新的 `getNextEvolution()` 一致。可简化为：

```typescript
function buildEvolutionChain(speciesId: SpeciesId): SpeciesData['evolutionChain'] {
  const evo = getNextEvolution(speciesId)
  if (!evo) return undefined
  return [{ trigger: evo.trigger, level: evo.minLevel, into: evo.to }]
}
```

## 验证

1. `bun run typecheck` 零错误
2. `bun test packages/pokemon/` 全部通过
3. `bun run dev` → `/buddy` 所有现有功能正常（pet、dex、egg、switch）
4. 性格效果正确：Adamant Charmander Lv50 ATK 应比 Hardy 高 ~10%，SPA 低 ~10%
5. 进化判定正确：Charmander Lv16 → Charmeleon，Squirtle Lv16 → Wartortle
6. stat 计算结果与旧实现数值一致

## 代码量

- 删除：~55 行（NATURES 27 行 + EVOLUTION_CHAINS 12 行 + calculateStats 手写公式 18 行 - 2 行）
- 新增：~40 行（委托代码）
- 净变化：-15 行
