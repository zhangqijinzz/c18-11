import { describe, expect, it } from 'vitest'
import { recoverDocument } from '../domain/documentRecovery'
import { INITIAL_TOKENS } from '../models/brandMirrorModels'

const VALID_TOKENS = { ...INITIAL_TOKENS }
const VALID_VERSION = {
  id: 'v1',
  label: 'Version A',
  createdAt: '2026-03-01T10:00:00.000Z',
  tokens: { ...VALID_TOKENS },
}

function documentJson(overrides: Record<string, unknown>): string {
  return JSON.stringify({ version: 1, theme: 'studio', tokens: { ...VALID_TOKENS }, versions: [], ...overrides })
}

describe('recoverDocument', () => {
  it('recovers a valid document without warnings', () => {
    const result = recoverDocument(documentJson({ versions: [{ ...VALID_VERSION }] }))
    expect(result.document?.tokens.primary).toBe('#F15A47')
    expect(result.document?.versions).toHaveLength(1)
    expect(result.warnings).toEqual([])
  })

  it('returns null for unparsable or unsupported payloads', () => {
    expect(recoverDocument('not json').document).toBeNull()
    expect(recoverDocument(documentJson({ version: 99 })).document).toBeNull()
    expect(recoverDocument('null').document).toBeNull()
  })

  it('replaces invalid colors with defaults and reports them', () => {
    const result = recoverDocument(documentJson({ tokens: { ...VALID_TOKENS, primary: 'red' } }))
    expect(result.document?.tokens.primary).toBe(INITIAL_TOKENS.primary)
    expect(result.document?.tokens.secondary).toBe(VALID_TOKENS.secondary)
    expect(result.warnings.join()).toContain('主色')
  })

  it('falls back per scale entry and always returns the required lengths', () => {
    const result = recoverDocument(documentJson({
      tokens: { ...VALID_TOKENS, typeScale: ['x', 14, 16, 20, 28, 40], radiusScale: [6, 10] },
    }))
    expect(result.document).not.toBeNull()
    const tokens = result.document?.tokens as typeof VALID_TOKENS
    expect(tokens.typeScale).toEqual([INITIAL_TOKENS.typeScale[0], 14, 16, 20, 28, 40])
    expect(tokens.radiusScale).toEqual([6, 10, INITIAL_TOKENS.radiusScale[2], INITIAL_TOKENS.radiusScale[3]])
    expect(tokens.spacingScale).toHaveLength(5)
  })

  it('repairs an invalid theme with a warning', () => {
    const result = recoverDocument(documentJson({ theme: 'space' }))
    expect(result.document?.theme).toBe('studio')
    expect(result.warnings.join()).toContain('主题')
  })

  it('skips incomplete versions but keeps the usable ones', () => {
    const result = recoverDocument(documentJson({
      versions: [
        { ...VALID_VERSION },
        { id: 'v2', label: 'Version B', createdAt: '2026-04-01T00:00:00.000Z' },
        { ...VALID_VERSION, id: 'v3', tokens: { ...VALID_TOKENS, primary: '#000000' } },
      ],
    }))
    expect(result.document?.versions.map((version) => version.id)).toEqual(['v1', 'v3'])
    expect(result.warnings.join()).toContain('第 2 条版本')
  })

  it('repairs missing metadata on a version instead of dropping it', () => {
    const result = recoverDocument(documentJson({
      versions: [{ tokens: { ...VALID_TOKENS }, createdAt: 'not-a-date' }],
    }))
    expect(result.document).not.toBeNull()
    const version = result.document?.versions[0] as NonNullable<typeof result.document>['versions'][number]
    expect(version.id).toContain('recovered')
    expect(version.label).toBe('Version A')
    expect(version.createdAt).toBe('')
    expect(result.warnings.join()).toContain('名称')
    expect(result.warnings.join()).toContain('时间')
  })

  it('ignores a non-array versions field and still recovers tokens', () => {
    const result = recoverDocument(documentJson({ versions: 'oops' }))
    expect(result.document?.versions).toEqual([])
    expect(result.document?.tokens.primary).toBe('#F15A47')
    expect(result.warnings.join()).toContain('版本')
  })
})
