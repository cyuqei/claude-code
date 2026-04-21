import React from 'react'
import { Box, Text } from '@anthropic/ink'
import type { Creature } from '../types'
import { getCreatureName } from '../core/creature'
import { calculateStats } from '../core/creature'

const CYAN = 'ansi:cyan'
const GREEN = 'ansi:green'
const YELLOW = 'ansi:yellow'
const RED = 'ansi:red'
const GRAY = 'ansi:white'
const WHITE = 'ansi:whiteBright'

interface SwitchPanelProps {
	party: Creature[]
	activeId: string
	onSelect: (creatureId: string) => void
	onCancel: () => void
}

export function SwitchPanel({ party, activeId, onSelect, onCancel }: SwitchPanelProps) {
	return (
		<Box flexDirection="column" borderStyle="round" paddingX={1}>
			<Text bold color={CYAN}> 换人 </Text>
			{party.map((creature, i) => {
				const stats = calculateStats(creature)
				const isActive = creature.id === activeId
				const hpPct = 100 // No current HP tracking in v2, assume full
				const hpColor = hpPct > 50 ? GREEN : hpPct > 25 ? YELLOW : RED

				return (
					<Box key={creature.id}>
						<Text>{isActive ? '  ▶ ' : '  '}</Text>
						<Text color={isActive ? GRAY : WHITE}>
							[{i + 1}] {getCreatureName(creature)} (Lv.{creature.level}){' '}
						</Text>
						{isActive && <Text color={GRAY}> 当前场上</Text>}
					</Box>
				)
			})}
			<Box marginTop={1}>
				<Text color={GRAY}>  [ESC] 取消</Text>
			</Box>
		</Box>
	)
}
