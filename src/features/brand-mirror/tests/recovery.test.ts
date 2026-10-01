import { describe, expect, it } from 'vitest'
import { recoverDocument } from '../domain/documentRecovery'
import { INITIAL_TOKENS, type BrandMirrorSnapshot } from '../models/brandMirrorModels'
import { buildBrandGuidelinesMarkdown } from '../services/exportService'

const validTokens = INITIAL_TOKENS
const validVersion = {
  id: 'v-good',
  label: 'Version A',
  createdAt: '2024-01-01T00:00:00.000Z',
  tokens: { ...validTokens },
}

function baseDocument(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    theme: 'studio',
    tokens: { ...validTokens, radiusScale: [...validTokens.radiusScale], spacingScale: [...validTokens.spacingScale], typeScale: [...validTokens.typeScale] },
    versions: [],
    ...overrides,
  }
}

describe('recoverDocument', () => {
  it('returns null when the envelope is not a v1 document', () => {
    expect(recoverDocument(null)).toBeNull()
    expect(recoverDocument('garbage')).toBeNull()
    expect(recoverDocument({ version: 2, tokens: {}, versions: [], theme: 'studio' })).toBeNull()
  })

  it('passes a valid document through without warnings', () => {
    const result = recoverDocument(baseDocument({ versions: [validVersion] }))
    expect(result).not.toBeNull()
    if (!result) throw new Error('expected recovered document')
    expect(result.warnings).toEqual([])
    expect(result.document.versions).toHaveLength(1)
  })

  it('repairs non-hex colors instead of dropping the workspace', () => {
    const result = recoverDocument(baseDocument({
      tokens: { ...validTokens, primary: 'red', secondary: 42 },
    }))
    expect(result).not.toBeNull()
    if (!result) throw new Error('expected recovered document')
    expect(result.document.tokens.primary).toBe(INITIAL_TOKENS.primary)
    expect(result.document.tokens.secondary).toBe(INITIAL_TOKENS.secondary)
    expect(result.warnings.join(' ')).toContain('颜色')
  })

  it('repairs missing, non-numeric and out-of-range scale entries', () => {
    const result = recoverDocument(baseDocument({
      tokens: {
        ...validTokens,
        radiusScale: [8, 12, 18], // 缺一级
        spacingScale: [4, 'oops', 12, 20, 999], // 非数字 + 越界
        typeScale: [12, 14, 16, 20, 28, 40],
      },
    }))
    expect(result).not.toBeNull()
    if (!result) throw new Error('expected recovered document')
    const tokens = result.document.tokens
    expect(tokens.radiusScale).toHaveLength(4)
    expect(tokens.spacingScale).toEqual([4, 8, 12, 20, 64])
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  it('falls back to a known theme for an unrecognized value', () => {
    const result = recoverDocument(baseDocument({ theme: 'neon' }))
    expect(result).not.toBeNull()
    if (!result) throw new Error('expected recovered document')
    expect(result.document.theme).toBe('studio')
    expect(result.warnings.join(' ')).toContain('主题')
  })

  it('skips individual broken versions but keeps the good ones', () => {
    const result = recoverDocument(baseDocument({
      versions: [
        validVersion,
        null,
        { id: 'v-bad', label: 'Broken' }, // 没有 tokens，跳过
        { ...validVersion, id: 'v-good-2', label: 'Version C' },
      ],
    }))
    expect(result).not.toBeNull()
    if (!result) throw new Error('expected recovered document')
    expect(result.document.versions.map((version) => version.id)).toEqual(['v-good', 'v-good-2'])
    expect(result.warnings.some((warning) => warning.includes('跳过'))).toBe(true)
  })

  it('repairs missing id, label and createdAt fields', () => {
    const result = recoverDocument(baseDocument({
      versions: [{ tokens: { ...validTokens } }],
    }))
    expect(result).not.toBeNull()
    if (!result) throw new Error('expected recovered document')
    const version = result.document.versions[0]
    expect(version.id).toContain('recovered')
    expect(version.label).toBe('Version A')
    expect(Number.isNaN(Date.parse(version.createdAt))).toBe(false)
  })

  it('renumbers duplicate ids so React keys stay unique', () => {
    const result = recoverDocument(baseDocument({
      versions: [{ ...validVersion }, { ...validVersion }],
    }))
    expect(result).not.toBeNull()
    if (!result) throw new Error('expected recovered document')
    const ids = result.document.versions.map((version) => version.id)
    expect(new Set(ids).size).toBe(2)
  })

  it('tolerates a non-array versions list', () => {
    const result = recoverDocument(baseDocument({ versions: { nope: true } }))
    expect(result).not.toBeNull()
    if (!result) throw new Error('expected recovered document')
    expect(result.document.versions).toEqual([])
    expect(result.warnings.length).toBeGreaterThan(0)
  })

  it('repairs tokens nested inside a version entry rather than discarding the version', () => {
    const result = recoverDocument(baseDocument({
      versions: [{ ...validVersion, tokens: { ...validTokens, primary: 'rgb(1,2,3)' } }],
    }))
    expect(result).not.toBeNull()
    if (!result) throw new Error('expected recovered document')
    expect(result.document.versions).toHaveLength(1)
    expect(result.document.versions[0].tokens.primary).toBe(INITIAL_TOKENS.primary)
  })

  it('export markdown never throws on incomplete version entries', () => {
    const snapshot = {
      status: 'ready',
      tokens: { ...validTokens },
      theme: 'studio',
      versions: [
        validVersion,
        { id: 'broken', label: 'Broken' },
      ],
      compareMode: false,
      activeVersionId: 'v-good',
      contrastRatio: Number.NaN,
      contrastWarning: false,
      message: '',
    } as unknown as BrandMirrorSnapshot

    const markdown = buildBrandGuidelinesMarkdown(snapshot)
    expect(markdown).toContain('# BrandMirror 品牌规范')
    expect(markdown).toContain('Version A')
    expect(markdown).toContain('--:1')
  })
})
