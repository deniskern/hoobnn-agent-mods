// The HUD's drawings, over the elements a render hook resolved: its rows
// (above or below the prompt) and the `/hud detail` pane.
import type { Elements, RenderElement } from 'claude-code'

import type { Desk, DeskItem, HudLine, ToolStats, TurnCost } from '../types'
import { formatDuration, lastDays, sparkline, streak } from './extras.js'
import type { AgentEntry, TodoItem } from './hud/types.js'
import { formatTokens } from './hud/utils/format.js'
import { m, money } from './i18n.js'

type Ui = Pick<Elements['terminal'], 'Box' | 'Text' | 'Link'>

/** The HUD's rows over whatever the engine (or another mod) draws in the same place. */
export function drawRows(ui: Ui, rows: HudLine[], rest: RenderElement, indent = 0): RenderElement {
  const { Box, Text, Link } = ui

  return (
    <Box flexDirection="column">
      {rows.map((row, i) => (
        // A row of sibling Texts, not nested ones: a nested Text drops dimColor.
        // claude-hud fits its own rows; the extras row wraps when it runs long.
        <Box key={`l${i}`} flexDirection="row" flexWrap="wrap" paddingLeft={indent}>
          {row.map((span, j) => {
            const text = (
              <Text
                key={`s${j}`}
                color={span.color}
                backgroundColor={span.backgroundColor}
                bold={span.bold}
                dimColor={span.dimColor}
                italic={span.italic}
                underline={span.underline}
                strikethrough={span.strikethrough}
                inverse={span.inverse}
              >
                {span.text}
              </Text>
            )
            // claude-hud's https links (a GitHub branch) stay clickable.
            return span.href ? (
              <Link key={`s${j}`} href={span.href}>
                {text}
              </Link>
            ) : (
              text
            )
          })}
        </Box>
      ))}
      {rest}
    </Box>
  )
}

// A bar's track and fill by tone, light then dark: the surface draws an Svg as an
// image, which follows the system's scheme but not the theme's keys. Mid tones that
// read on both; the fill is colored at rest too, as a gray bar vanishes on the card.
const BAR = {
  track: ['#88878033', '#ffffff1f'],
  fill: { none: ['#1d9e75', '#34c28f'], warn: ['#ba7517', '#e89b2e'], bad: ['#d9443f', '#f26464'] },
} as const
const BAR_HEIGHT = 6
/** The markup's own width: wide, so the bar takes its tile's whole width (`preserveAspectRatio="none"`). */
const BAR_WIDTH = 1000
/** A tile's narrowest, in cells: several share the row, and wrap below this. */
const TILE_MIN = 16

/** A gauge's bar, stretched to its tile, filled to `percent`. */
export function barSvg(percent: number, tone: DeskItem['tone']): string {
  const name = tone ?? 'none'
  const [fillLight, fillDark] = BAR.fill[name]
  const fill = Math.min(100, Math.max(0, percent))
  // Class names by tone: a host that inlines several bars in one page keeps each one's color.
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${BAR_WIDTH}" height="${BAR_HEIGHT}" viewBox="0 0 100 ${BAR_HEIGHT}" preserveAspectRatio="none">` +
    `<style>.hud-t{fill:${BAR.track[0]}}.hud-${name}{fill:${fillLight}}` +
    `@media (prefers-color-scheme:dark){.hud-t{fill:${BAR.track[1]}}.hud-${name}{fill:${fillDark}}}</style>` +
    `<rect class="hud-t" width="100" height="${BAR_HEIGHT}"/>` +
    (fill > 0 ? `<rect class="hud-${name}" width="${Math.max(1, fill).toFixed(1)}" height="${BAR_HEIGHT}"/>` : '') +
    '</svg>'
  )
}

type DeskUi = Pick<Elements['desktop'], 'Box' | 'Text'> & Partial<Pick<Elements['desktop'], 'Svg' | 'Button'>>

/**
 * The HUD on a surface with a type of its own (the desktop app, a phone, an editor),
 * laid out as the app's own controls are rather than as terminal rows: tiles that
 * share the band's width, each its label and value over a bar and when it resets,
 * a quiet button to the details pane at the end, then the notes as a line of muted
 * words, a warning in the theme's warning color.
 */
export function drawDesk(ui: DeskUi, desk: Desk, rest: RenderElement, onDetail?: () => void): RenderElement {
  const { Box, Text, Svg, Button } = ui
  const color = (it: DeskItem) => (it.tone === 'bad' ? 'error' : it.tone === 'warn' ? 'warning' : undefined)
  // A gauge with a bar shares the row's width with the others; a bare reading (the
  // cache, the session) takes its own width, its value beside its label.
  const tile = (it: DeskItem, key: string) => (
    <Box key={key} flexDirection="column" rowGap="xs" {...(it.percent === undefined ? { flexShrink: 0 } : { width: 0, flexGrow: 1, minWidth: TILE_MIN })}>
      <Box flexDirection="row" justifyContent="space-between" columnGap="sm">
        <Text dimColor wrap="truncate-end">{it.label ?? ''}</Text>
        <Text weight="semibold" tabular color={color(it)}>
          {it.value}
        </Text>
      </Box>
      {it.percent !== undefined && Svg ? (
        <Svg source={barSvg(it.percent, it.tone)} alt={`${it.label ?? ''} ${it.value}`} height={BAR_HEIGHT} />
      ) : null}
      {it.hint ? <Text size="caption" dimColor tabular wrap="truncate-end">{it.hint}</Text> : null}
    </Box>
  )
  const note = (it: DeskItem, key: string) => (
    <Text key={key} size="caption" weight={it.tone ? 'medium' : 'regular'} color={color(it)} dimColor={it.tone === undefined}>
      {it.value}
    </Text>
  )
  return (
    <Box flexDirection="column" rowGap="sm">
      {desk.gauges.length > 0 ? (
        <Box flexDirection="row" flexWrap="wrap" columnGap="xl" rowGap="md" alignItems="flex-start">
          {desk.gauges.map((it, i) => tile(it, `g${i}`))}
          {onDetail && Button ? (
            <Box key="detail" flexShrink={0} alignSelf="center">
              <Button key="hud-detail" plain dimColor label={m('desk.detail')} onPress={onDetail} />
            </Box>
          ) : null}
        </Box>
      ) : null}
      {desk.notes.length > 0 ? (
        <Box flexDirection="row" flexWrap="wrap" columnGap="lg">
          {desk.notes.map((it, i) => note(it, `n${i}`))}
        </Box>
      ) : null}
      {rest}
    </Box>
  )
}

export type PaneData = {
  tools: ToolStats
  /** The last finished turns, oldest first. */
  turns: readonly TurnCost[]
  agents: readonly AgentEntry[]
  todos: readonly TodoItem[]
  /** Spend per day, `YYYY-MM-DD` → USD. */
  history: Record<string, number>
  today: string
  budgetUsd: number
  now: number
}

/** `/hud detail`: each tool's calls and time, the last turns, subagents, todos, and the spend. */
export function drawPane(ui: Pick<Elements['terminal'], 'Box' | 'Text'>, data: PaneData): RenderElement {
  const { Box, Text } = ui
  const stats = Object.entries(data.tools).sort((a, b) => b[1].totalMs - a[1].totalMs)
  const agents = data.agents.slice(-8)
  const week = lastDays(data.history, data.today, 7)
  const heading = (text: string) => <Text bold color="cyan">{text}</Text>
  const todaySpent = money(data.history[data.today] ?? 0) + (data.budgetUsd > 0 ? `/${money(data.budgetUsd)}` : '')
  const days7 = streak(data.history, data.today)
  const spendLine = [
    m('spend.today', { spent: todaySpent }),
    `${m('spend.week', { spent: money(week.reduce((a, b) => a + b, 0)) })} ${sparkline(week)}`,
    ...(days7 > 1 ? [m('streak', { n: days7 })] : []),
  ].join(' · ')

  return (
    <Box flexDirection="column">
      {heading(m('pane.tools'))}
      {stats.length === 0 && <Text dimColor>{m('pane.noTools')}</Text>}
      {stats.slice(0, 12).map(([name, s]) => (
        <Box key={`t-${name}`} flexDirection="row" columnGap={1}>
          <Text>{name}</Text>
          <Text dimColor>
            {m('pane.toolStats', { count: s.count, total: formatDuration(s.totalMs), avg: formatDuration(s.totalMs / s.count) })}
          </Text>
          {s.errors > 0 ? <Text color="red">{m('pane.failed', { n: s.errors })}</Text> : null}
        </Box>
      ))}
      <Text> </Text>
      {heading(m('pane.turns'))}
      {data.turns.length === 0 && <Text dimColor>{m('pane.none')}</Text>}
      {[...data.turns].reverse().map(t => (
        <Text key={`turn-${t.n}`} dimColor>
          {m('pane.turnRow', {
            n: t.n,
            time: formatDuration(t.durationMs),
            cost: t.usd === null ? '—' : money(t.usd),
            tokens: t.tokens === null ? '—' : `${t.tokens < 0 ? '−' : '+'}${formatTokens(Math.abs(t.tokens))}`,
          })}
        </Text>
      ))}
      <Text> </Text>
      {heading(m('pane.agents'))}
      {agents.length === 0 && <Text dimColor>{m('pane.none')}</Text>}
      {agents.map(a => (
        <Box key={`a-${a.id}`} flexDirection="row" columnGap={1}>
          <Text color={a.status === 'running' ? 'yellow' : 'green'}>{a.status === 'running' ? '◐' : '✓'}</Text>
          <Text>{a.type}</Text>
          <Text dimColor wrap="truncate-end">
            {a.description ?? ''} {formatDuration((a.endTime?.getTime() ?? data.now) - a.startTime.getTime())}
          </Text>
        </Box>
      ))}
      <Text> </Text>
      {heading(m('pane.todos'))}
      {data.todos.length === 0 && <Text dimColor>{m('pane.none')}</Text>}
      {data.todos.map((t, i) => (
        <Text key={`d-${i}`} dimColor={t.status === 'completed'} color={t.status === 'in_progress' ? 'yellow' : undefined}>
          {t.status === 'completed' ? '☑' : t.status === 'in_progress' ? '◐' : '☐'} {t.content}
        </Text>
      ))}
      <Text> </Text>
      {heading(m('pane.spend'))}
      <Text>{spendLine}</Text>
    </Box>
  )
}
