import type { BrandMirrorSnapshot, SavedVersion } from '../models/brandMirrorModels'

export interface BrandGuidelinesExporter {
  export(snapshot: BrandMirrorSnapshot): void
}

function formatDate(value: string | undefined): string {
  if (!value || Number.isNaN(Date.parse(value))) return '日期未知'
  return value.slice(0, 10)
}

function formatRatio(value: number): string {
  return Number.isFinite(value) ? value.toFixed(1) : '--'
}

function formatPx(value: number): string {
  return Number.isFinite(value) ? String(Math.round(value)) : '--'
}

function formatVersionLine(version: SavedVersion): string {
  try {
    const label = typeof version.label === 'string' && version.label.trim() ? version.label : '未命名版本'
    const tokens = version.tokens
    if (!tokens || typeof tokens !== 'object') {
      return `- ${label} · ${formatDate(version.createdAt)} · 令牌数据不完整，已跳过详情`
    }
    const primary = typeof tokens.primary === 'string' ? tokens.primary : '--'
    const secondary = typeof tokens.secondary === 'string' ? tokens.secondary : '--'
    return `- ${label} · ${formatDate(version.createdAt)} · 主色 ${primary} · 辅助色 ${secondary}`
  } catch {
    return '- 一条版本数据不完整，已跳过详情'
  }
}

export function buildBrandGuidelinesMarkdown(snapshot: BrandMirrorSnapshot): string {
  const { tokens } = snapshot
  const versions = snapshot.versions.length === 0 ? '- 暂无保存版本' : snapshot.versions.map(formatVersionLine).join('\n')
  return `# BrandMirror 品牌规范\n\n> 导出时间：${new Date().toISOString().slice(0, 10)}\n> 当前主题：${snapshot.theme}\n\n## 品牌色\n\n| 令牌 | 值 |\n| --- | --- |\n| 主色 \`primary\` | \`${tokens.primary}\` |\n| 辅助色 \`secondary\` | \`${tokens.secondary}\` |\n| 对比度 | ${formatRatio(snapshot.contrastRatio)}:1 |\n\n## 圆角尺度\n\n${tokens.radiusScale.map((value, index) => `- \`radius.${index + 1}\`: ${formatPx(value)}px`).join('\n')}\n\n## 间距体系\n\n${tokens.spacingScale.map((value, index) => `- \`spacing.${index + 1}\`: ${formatPx(value)}px`).join('\n')}\n\n## 字体比例\n\n${tokens.typeScale.map((value, index) => `- \`type.${index + 1}\`: ${formatPx(value)}px`).join('\n')}\n\n## 保存版本\n\n${versions}\n\n---\n由 BrandMirror 品牌视觉实验室生成。\n`
}

export class BrowserBrandGuidelinesExporter implements BrandGuidelinesExporter {
  export(snapshot: BrandMirrorSnapshot): void {
    const content = buildBrandGuidelinesMarkdown(snapshot)
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `BrandMirror-Brand-Guidelines-${new Date().toISOString().slice(0, 10)}.md`
    link.click()
    URL.revokeObjectURL(url)
  }
}
