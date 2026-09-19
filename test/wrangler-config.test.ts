// Read the deployed config as text because node:fs is unavailable in workerd.
import { describe, expect, it } from 'vitest'
import raw from '../wrangler.toml?raw'
import { DAILY_CRON } from '../src/index'

function parseCrons(config: string): string[] {
  const match = config.match(/crons\s*=\s*\[([^\]]*)\]/)
  if (!match) throw new Error('no crons = [...] array found')
  // The array uses JSON-compatible double-quoted strings; a comma inside a
  // cron's hour field must not become an extra trigger.
  return JSON.parse(`[${match[1]}]`) as string[]
}

describe('wrangler.toml crons', () => {
  it('uses one trigger for both noon cleanup and midnight snapshots', () => {
    expect(parseCrons(raw)).toEqual([DAILY_CRON])
    expect(DAILY_CRON).toBe('0 4,16 * * *')
  })
  it('keeps commas inside quoted cron expressions', () => {
    expect(parseCrons('crons = ["0 4,16 * * *", "0 8 * * *"]'))
      .toEqual(['0 4,16 * * *', '0 8 * * *'])
  })
})
