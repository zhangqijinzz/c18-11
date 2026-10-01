import { clampTokenValues, isHexColor } from './brandRules'
import { INITIAL_TOKENS, type BrandDocument, type BrandTokens, type BrandTheme, type SavedVersion } from '../models/brandMirrorModels'

export interface DocumentRecoveryResult {
  /** 可用部分重建出的文档；无法识别整份数据时为 null */
  document: BrandDocument | null
  /** 恢复过程中识别、修复或跳过的异常说明，逐条展示给用户 */
  warnings: string[]
}

const SUPPORTED_THEMES: BrandTheme[] = ['studio', 'editorial', 'night']
const SCALE_LENGTHS: Record<'radiusScale' | 'spacingScale' | 'typeScale', number> = {
  radiusScale: 4,
  spacingScale: 5,
  typeScale: 6,
}
const SCALE_NAMES: Record<'radiusScale' | 'spacingScale' | 'typeScale', string> = {
  radiusScale: '圆角尺度',
  spacingScale: '间距尺度',
  typeScale: '字号尺度',
}

/**
 * 从本地原始字符串恢复工作区文档。
 * 顶层结构无法识别时返回 document=null 并附带说明；
 * 其余情况逐项校验：能修的字段用默认值补齐，不合规的版本条目整条跳过，
 * 保证返回的文档一定可以安全渲染与导出。
 */
export function recoverDocument(raw: string): DocumentRecoveryResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { document: null, warnings: ['本地数据无法解析，已跳过损坏内容并打开新工作区'] }
  }

  if (!parsed || typeof parsed !== 'object') {
    return { document: null, warnings: ['本地数据结构无法识别，已跳过损坏内容并打开新工作区'] }
  }

  const candidate = parsed as Partial<BrandDocument> & Record<string, unknown>
  if (candidate.version !== 1) {
    return { document: null, warnings: ['本地数据版本不受支持，已跳过损坏内容并打开新工作区'] }
  }

  const warnings: string[] = []
  const theme = salvageTheme(candidate.theme, warnings)
  const tokens = salvageTokens(candidate.tokens, warnings)
  const versions = salvageVersions(candidate.versions, warnings)

  return { document: { version: 1, theme, tokens, versions }, warnings }
}

function salvageTheme(value: unknown, warnings: string[]): BrandTheme {
  if (typeof value === 'string' && (SUPPORTED_THEMES as string[]).includes(value)) {
    return value as BrandTheme
  }
  warnings.push('主题字段无效，已恢复为 Studio warm')
  return 'studio'
}

function salvageTokens(source: unknown, warnings: string[], prefix = ''): BrandTokens {
  const scope = prefix ? `${prefix}的` : ''
  const record = source && typeof source === 'object' ? (source as Record<string, unknown>) : {}
  if (!source || typeof source !== 'object') {
    warnings.push(`${scope}令牌数据缺失，已恢复为默认令牌`)
  }

  const primary = salvageColor(record.primary, 'primary', `${scope}主色`, warnings)
  const secondary = salvageColor(record.secondary, 'secondary', `${scope}辅助色`, warnings)

  return clampTokenValues({
    primary,
    secondary,
    radiusScale: salvageScale(record.radiusScale, 'radiusScale', INITIAL_TOKENS.radiusScale, scope, warnings),
    spacingScale: salvageScale(record.spacingScale, 'spacingScale', INITIAL_TOKENS.spacingScale, scope, warnings),
    typeScale: salvageScale(record.typeScale, 'typeScale', INITIAL_TOKENS.typeScale, scope, warnings),
  })
}

function salvageColor(value: unknown, field: 'primary' | 'secondary', label: string, warnings: string[]): string {
  if (typeof value === 'string' && isHexColor(value.trim())) {
    return value.trim().toUpperCase()
  }
  warnings.push(`${label}不是有效的 6 位 HEX 颜色，已替换为默认值`)
  return INITIAL_TOKENS[field]
}

function salvageScale(
  source: unknown,
  field: 'radiusScale' | 'spacingScale' | 'typeScale',
  fallback: number[],
  scope: string,
  warnings: string[],
): number[] {
  const label = SCALE_NAMES[field]
  if (!Array.isArray(source)) {
    warnings.push(`${scope}${label}缺失或格式错误，已恢复为默认尺度`)
    return [...fallback]
  }

  return Array.from({ length: SCALE_LENGTHS[field] }, (_, index) => {
    const value = source[index]
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
    warnings.push(`${scope}${label}第 ${index + 1} 项无效，已替换为默认值`)
    return fallback[index]
  })
}

function salvageVersions(source: unknown, warnings: string[]): SavedVersion[] {
  if (!Array.isArray(source)) {
    warnings.push('保存版本列表格式异常，已忽略版本数据')
    return []
  }

  const recovered: SavedVersion[] = []
  source.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object' || !(entry as Record<string, unknown>).tokens || typeof (entry as Record<string, unknown>).tokens !== 'object') {
      warnings.push(`第 ${index + 1} 条版本数据不完整，已跳过`)
      return
    }

    const record = entry as Partial<SavedVersion> & Record<string, unknown>
    const prefix = `第 ${index + 1} 条版本`
    const tokens = salvageTokens(record.tokens, warnings, prefix)

    const id = typeof record.id === 'string' && record.id.trim() ? record.id : `recovered-version-${index}`
    const hasLabel = typeof record.label === 'string' && record.label.trim().length > 0
    if (!hasLabel) warnings.push(`${prefix}名称缺失，已自动命名`)
    const label = hasLabel ? (record.label as string) : `Version ${String.fromCharCode(65 + recovered.length)}`

    let createdAt: string
    if (typeof record.createdAt === 'string' && record.createdAt && !Number.isNaN(Date.parse(record.createdAt))) {
      createdAt = record.createdAt
    } else {
      warnings.push(`${prefix}创建时间无效，已标记为未知日期`)
      createdAt = ''
    }

    recovered.push({ id, label, tokens, createdAt })
  })

  return recovered
}
