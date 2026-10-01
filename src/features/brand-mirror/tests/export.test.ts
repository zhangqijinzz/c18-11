import { describe, expect, it } from 'vitest'
import { buildBrandGuidelinesMarkdown } from '../services/exportService'
import { INITIAL_TOKENS, type BrandMirrorSnapshot } from '../models/brandMirrorModels'

function snapshot(overrides: Partial<BrandMirrorSnapshot> = {}): BrandMirrorSnapshot {
  return {
    status: 'ready',
    tokens: { ...INITIAL_TOKENS, radiusScale: [...INITIAL_TOKENS.radiusScale], spacingScale: [...INITIAL_TOKENS.spacingScale], typeScale: [...INITIAL_TOKENS.typeScale] },
    theme: 'studio',
    versions: [],
    compareMode: false,
    activeVersionId: null,
    contrastRatio: 4.2,
    contrastWarning: false,
    message: '',
    recoveryWarnings: [],
    ...overrides,
  }
}

describe('buildBrandGuidelinesMarkdown hardening', () => {
  it('renders non-finite contrast as a placeholder instead of NaN', () => {
    const markdown = buildBrandGuidelinesMarkdown(snapshot({ contrastRatio: Number.NaN }))
    expect(markdown).toContain('对比度 | --:1')
    expect(markdown).not.toContain('NaN')
  })

  it('handles versions with invalid dates and incomplete tokens', () => {
    const markdown = buildBrandGuidelinesMarkdown(snapshot({
      versions: [
        { id: 'a', label: 'Version A', createdAt: 'not-a-date', tokens: { ...INITIAL_TOKENS } },
        { id: 'b', label: 'Version B', createdAt: '', tokens: undefined as never },
      ],
    }))
    expect(markdown).toContain('Version A · 日期未知')
    expect(markdown).toContain('令牌数据不完整')
  })

  it('replaces non-finite scale values without breaking export', () => {
    const broken = [...INITIAL_TOKENS.typeScale]
    broken[2] = Number.NaN
    const markdown = buildBrandGuidelinesMarkdown(snapshot({ tokens: { ...INITIAL_TOKENS, typeScale: broken } }))
    expect(markdown).not.toContain('NaN')
    expect(markdown).toContain('`type.3`: --px')
  })
})
