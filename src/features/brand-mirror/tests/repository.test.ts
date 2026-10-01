import { describe, expect, it } from 'vitest'
import { LocalBrandRepository } from '../repositories/brandRepository'
import type { StorageService } from '../services/storageService'

class MemoryStorage implements StorageService {
  value: string | null = null
  read(): string | null { return this.value }
  write(next: string): void { this.value = next }
}

describe('LocalBrandRepository recovery', () => {
  it('returns null when raw storage is unparseable JSON', () => {
    const storage = new MemoryStorage()
    storage.value = '{not-json'
    const result = new LocalBrandRepository(storage).load()
    expect(result).toBeNull()
  })

  it('keeps usable versions and warns about a bad color instead of discarding the workspace', () => {
    const storage = new MemoryStorage()
    storage.value = JSON.stringify({
      version: 1,
      theme: 'night',
      tokens: {
        primary: 'red',
        secondary: '#191829',
        radiusScale: [6, 10, 14, 22],
        spacingScale: [4, 8, 12, 18, 28],
        typeScale: [12, 14, 16, 20, 28, 38],
      },
      versions: [
        {
          id: 'v1',
          label: 'Version A',
          createdAt: '2024-01-01T00:00:00.000Z',
          tokens: {
            primary: '#A98BFF',
            secondary: '#191829',
            radiusScale: [6, 10, 14, 22],
            spacingScale: [4, 8, 12, 18, 28],
            typeScale: [12, 14, 16, 20, 28, 38],
          },
        },
      ],
    })

    const result = new LocalBrandRepository(storage).load()
    expect(result).not.toBeNull()
    if (!result) throw new Error('expected recovered document')
    expect(result.document.versions).toHaveLength(1)
    expect(result.document.tokens.primary).not.toBe('red')
    expect(result.warnings.length).toBeGreaterThan(0)
  })
})
