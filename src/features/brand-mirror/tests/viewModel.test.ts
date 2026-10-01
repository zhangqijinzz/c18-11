import { describe, expect, it } from 'vitest'
import { BrandMirrorViewModel } from '../viewmodels/brandMirrorViewModel'
import { INITIAL_TOKENS, type BrandDocument } from '../models/brandMirrorModels'
import type { BrandRepository } from '../repositories/brandRepository'
import { LocalBrandRepository } from '../repositories/brandRepository'
import type { StorageService } from '../services/storageService'
import type { DocumentRecoveryResult } from '../domain/documentRecovery'
import { buildBrandGuidelinesMarkdown, type BrandGuidelinesExporter } from '../services/exportService'

class MemoryRepository implements BrandRepository {
  document: BrandDocument | null = null
  shouldFail = false
  load(): DocumentRecoveryResult { return { document: this.document, warnings: [] } }
  save(document: BrandDocument): void { if (this.shouldFail) throw new Error('offline'); this.document = document }
}

class MemoryStorage implements StorageService {
  value: string | null = null
  read(): string | null { return this.value }
  write(value: string): void { this.value = value }
}

class MemoryExporter implements BrandGuidelinesExporter {
  received: string | null = null
  export(snapshot: Parameters<BrandGuidelinesExporter['export']>[0]): void { this.received = buildBrandGuidelinesMarkdown(snapshot) }
}

describe('BrandMirrorViewModel', () => {
  it('initializes, updates tokens and persists the latest state', () => {
    const repository = new MemoryRepository()
    const viewModel = new BrandMirrorViewModel(repository)
    viewModel.initialize()
    viewModel.updateColor('primary', '#123456')
    viewModel.updateScale('typeScale', 0, 18)
    expect(viewModel.getSnapshot().tokens.primary).toBe('#123456')
    expect(viewModel.getSnapshot().tokens.typeScale[0]).toBe(18)
    expect(repository.document?.tokens.primary).toBe('#123456')
  })

  it('saves two versions and enters comparison mode', () => {
    const repository = new MemoryRepository()
    const viewModel = new BrandMirrorViewModel(repository)
    viewModel.initialize()
    viewModel.saveVersion()
    viewModel.updateColor('primary', '#238B73')
    viewModel.saveVersion()
    viewModel.toggleCompare()
    expect(viewModel.getSnapshot().versions.map((version) => version.label)).toEqual(['Version A', 'Version B'])
    expect(viewModel.getSnapshot().compareMode).toBe(true)
  })

  it('keeps editing usable when persistence fails', () => {
    const repository = new MemoryRepository()
    const viewModel = new BrandMirrorViewModel(repository)
    viewModel.initialize()
    repository.shouldFail = true
    viewModel.updateColor('secondary', '#FFFFFF')
    expect(viewModel.getSnapshot().status).toBe('error')
    expect(viewModel.getSnapshot().tokens.secondary).toBe('#FFFFFF')
  })

  it('recovers a previously persisted document on initialization', () => {
    const repository = new MemoryRepository()
    repository.document = { version: 1, theme: 'night', tokens: { primary: '#A98BFF', secondary: '#191829', radiusScale: [6, 10, 14, 22], spacingScale: [4, 8, 12, 18, 28], typeScale: [12, 14, 16, 20, 28, 38] }, versions: [] }
    const viewModel = new BrandMirrorViewModel(repository)
    viewModel.initialize()
    expect(viewModel.getSnapshot().theme).toBe('night')
    expect(viewModel.getSnapshot().message).toContain('恢复')
  })

  it('exports the current token system as brand guidelines', () => {
    const repository = new MemoryRepository()
    const exporter = new MemoryExporter()
    const viewModel = new BrandMirrorViewModel(repository, exporter)
    viewModel.initialize()
    viewModel.exportBrandGuidelines()
    expect(exporter.received).toContain('# BrandMirror 品牌规范')
    expect(exporter.received).toContain('`primary`')
    expect(viewModel.getSnapshot().message).toContain('导出')
  })

  it('keeps valid data while repairing bad colors and skipping incomplete versions on recovery', () => {
    const storage = new MemoryStorage()
    storage.value = JSON.stringify({
      version: 1,
      theme: 'night',
      tokens: {
        primary: 'not-a-color',
        secondary: '#191829',
        radiusScale: [6, 10, 14, 22],
        spacingScale: [4, 8, 12, 18, 28],
        typeScale: [12, 14, 16, 20, 28, 38],
      },
      versions: [
        { id: 'v1', label: 'Version A', createdAt: '2026-01-01T00:00:00.000Z', tokens: { ...INITIAL_TOKENS } },
        { id: 'v2', label: 'Version B', createdAt: '2026-02-01T00:00:00.000Z' },
      ],
    })
    const repository = new LocalBrandRepository(storage)
    const viewModel = new BrandMirrorViewModel(repository)
    viewModel.initialize()

    const snapshot = viewModel.getSnapshot()
    expect(snapshot.theme).toBe('night')
    // 坏颜色被替换为默认值，对比度仍是有限数字
    expect(snapshot.tokens.primary).toBe(INITIAL_TOKENS.primary)
    expect(Number.isFinite(snapshot.contrastRatio)).toBe(true)
    // 有效版本保留，不完整版本被跳过
    expect(snapshot.versions.map((version) => version.id)).toEqual(['v1'])
    // 异常被识别并提示
    expect(snapshot.recoveryWarnings.length).toBeGreaterThan(0)
    expect(snapshot.message).toContain('异常')
    // 清洗后的文档被回写到本地
    const rewritten = JSON.parse(storage.value as string)
    expect(rewritten.tokens.primary).toBe(INITIAL_TOKENS.primary)
    expect(rewritten.versions).toHaveLength(1)
  })

  it('starts fresh with a warning when the whole payload is unusable', () => {
    const repository = new MemoryRepository()
    repository.load = () => ({ document: null, warnings: ['本地数据无法解析，已跳过损坏内容并打开新工作区'] })
    const viewModel = new BrandMirrorViewModel(repository)
    viewModel.initialize()
    const snapshot = viewModel.getSnapshot()
    expect(snapshot.tokens.primary).toBe(INITIAL_TOKENS.primary)
    expect(snapshot.versions).toEqual([])
    expect(snapshot.recoveryWarnings).toHaveLength(1)
    expect(snapshot.message).toContain('无法解析')
  })
})
