import type { BrandDocument, BrandTheme, BrandTokens, SavedVersion } from '../models/brandMirrorModels'
import { INITIAL_TOKENS } from '../models/brandMirrorModels'
import { clampTokenValues, isHexColor } from './brandRules'

export interface RecoveredDocument {
  document: BrandDocument
  /** 恢复过程中发现并处理过的问题，逐条可读，用于提示用户 */
  warnings: string[]
}

const THEMES: readonly BrandTheme[] = ['studio', 'editorial', 'night']
const SCALE_SPECS = {
  radiusScale: { length: 4, min: 0, max: 40 },
  spacingScale: { length: 5, min: 2, max: 64 },
  typeScale: { length: 6, min: 10, max: 72 },
} as const

type ScaleField = keyof typeof SCALE_SPECS

/**
 * 从 localStorage 读出的内容可能是任意形状：
 * - 颜色不是合法 HEX 时，对比度会算出 NaN，界面显示成“非数字”；
 * - 尺度数组缺项或包含非数字时，渲染和导出都会拿到 undefined；
 * - versions 里只要有一条缺少字段，版本卡片和导出就会整体抛错。
 *
 * 因此恢复时逐项校验：能修的用默认值修补并保留，修不了的条目跳过，
 * 所有处理过的问题都记入 warnings，绝不再因为单条坏数据丢掉整份工作区。
 */
export function recoverDocument(candidate: unknown): RecoveredDocument | null {
  if (!candidate || typeof candidate !== 'object') return null
  const raw = candidate as Record<string, unknown>
  if (raw.version !== 1) return null

  const warnings: string[] = []
  const tokens = recoverTokens(raw.tokens, warnings)
  const theme = recoverTheme(raw.theme, warnings)
  const versions = recoverVersions(raw.versions, warnings)

  return {
    document: { version: 1, tokens, theme, versions },
    warnings,
  }
}

function recoverTheme(value: unknown, warnings: string[]): BrandTheme {
  if (typeof value === 'string' && THEMES.includes(value as BrandTheme)) {
    return value as BrandTheme
  }
  warnings.push('主题字段无法识别，已回退到 Studio warm')
  return 'studio'
}

function recoverTokens(value: unknown, warnings: string[]): BrandTokens {
  if (!value || typeof value !== 'object') {
    warnings.push('当前令牌数据无法读取，已恢复为默认令牌')
    return { ...INITIAL_TOKENS, radiusScale: [...INITIAL_TOKENS.radiusScale], spacingScale: [...INITIAL_TOKENS.spacingScale], typeScale: [...INITIAL_TOKENS.typeScale] }
  }
  const raw = value as Record<string, unknown>

  const primary = recoverColor(raw.primary, '主色', INITIAL_TOKENS.primary, warnings)
  const secondary = recoverColor(raw.secondary, '辅助色', INITIAL_TOKENS.secondary, warnings)
  const radiusScale = recoverScale(raw.radiusScale, 'radiusScale', '圆角尺度', warnings)
  const spacingScale = recoverScale(raw.spacingScale, 'spacingScale', '间距体系', warnings)
  const typeScale = recoverScale(raw.typeScale, 'typeScale', '字体比例', warnings)

  return clampTokenValues({ primary, secondary, radiusScale, spacingScale, typeScale })
}

function recoverColor(value: unknown, label: string, fallback: string, warnings: string[]): string {
  if (typeof value === 'string' && isHexColor(value.trim())) {
    return value.trim().toUpperCase()
  }
  warnings.push(`${label}颜色值无效，已临时替换为 ${fallback}`)
  return fallback
}

function recoverScale(value: unknown, field: ScaleField, label: string, warnings: string[]): number[] {
  const spec = SCALE_SPECS[field]
  const fallback = INITIAL_TOKENS[field]
  const source = Array.isArray(value) ? value : []
  if (!Array.isArray(value)) {
    warnings.push(`${label}数据缺失，已恢复为默认层级`)
  }

  let repaired = false
  const values = Array.from({ length: spec.length }, (_, index) => {
    const entry = source[index]
    const numeric = typeof entry === 'number' ? entry : typeof entry === 'string' ? Number(entry) : Number.NaN
    if (!Number.isFinite(numeric)) {
      repaired = true
      return fallback[index]
    }
    const rounded = Math.round(numeric)
    if (rounded < spec.min || rounded > spec.max) {
      repaired = true
      return Math.min(spec.max, Math.max(spec.min, rounded))
    }
    return rounded
  })

  if (source.length !== spec.length) {
    warnings.push(`${label}层级数量不完整，已按 ${spec.length} 级补齐`)
  } else if (repaired) {
    warnings.push(`${label}中存在越界或非数字项，已自动修正`)
  }
  return values
}

function recoverVersions(value: unknown, warnings: string[]): SavedVersion[] {
  if (!Array.isArray(value)) {
    warnings.push('版本列表无法读取，已清空异常条目')
    return []
  }

  const seenIds = new Set<string>()
  const recovered: SavedVersion[] = []
  value.forEach((entry, index) => {
    const version = recoverVersion(entry, index, seenIds, warnings)
    if (version) {
      seenIds.add(version.id)
      recovered.push(version)
    }
  })
  return recovered
}

function recoverVersion(entry: unknown, index: number, seenIds: Set<string>, warnings: string[]): SavedVersion | null {
  if (!entry || typeof entry !== 'object') {
    warnings.push(`第 ${index + 1} 条版本不是有效记录，已跳过`)
    return null
  }
  const raw = entry as Record<string, unknown>

  // 版本令牌修不了就跳过整条；其余字段（label / id / createdAt）缺了可以补。
  if (!raw.tokens || typeof raw.tokens !== 'object') {
    warnings.push(`第 ${index + 1} 条版本缺少令牌数据，已跳过`)
    return null
  }
  const versionWarnings: string[] = []
  const tokens = recoverTokens(raw.tokens, versionWarnings)
  if (versionWarnings.length > 0) {
    warnings.push(`第 ${index + 1} 条版本的令牌已修复（${versionWarnings.length} 处）`)
  }

  let id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : ''
  if (!id) {
    id = `version-recovered-${index}-${Date.now()}`
    warnings.push(`第 ${index + 1} 条版本缺少 id，已自动补全`)
  } else if (seenIds.has(id)) {
    id = `${id}-recovered-${index}`
    warnings.push(`第 ${index + 1} 条版本 id 重复，已重新编号`)
  }

  const label = typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim() : defaultVersionLabel(index)
  if (!(typeof raw.label === 'string' && raw.label.trim())) {
    warnings.push(`第 ${index + 1} 条版本缺少名称，已标记为 ${label}`)
  }

  let createdAt = typeof raw.createdAt === 'string' && raw.createdAt.trim() ? raw.createdAt.trim() : ''
  if (!createdAt) {
    createdAt = new Date(0).toISOString()
    warnings.push(`第 ${index + 1} 条版本缺少保存时间，已用最早时间占位`)
  } else if (Number.isNaN(Date.parse(createdAt))) {
    warnings.push(`第 ${index + 1} 条版本保存时间无法识别，已用最早时间占位`)
    createdAt = new Date(0).toISOString()
  }

  return { id, label, tokens, createdAt }
}

function defaultVersionLabel(index: number): string {
  return `Version ${String.fromCharCode(65 + index)}`
}
