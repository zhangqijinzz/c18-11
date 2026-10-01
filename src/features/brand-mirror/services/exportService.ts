import type { BrandMirrorSnapshot } from '../models/brandMirrorModels'

export interface BrandGuidelinesExporter {
  export(snapshot: BrandMirrorSnapshot): void
}

export function buildBrandGuidelinesMarkdown(snapshot: BrandMirrorSnapshot): string {
  const { tokens } = snapshot
  const ratioLine = Number.isFinite(snapshot.contrastRatio) ? snapshot.contrastRatio.toFixed(1) : '--'
  const versions = renderVersionLines(snapshot.versions)
  return `# BrandMirror 品牌规范\n\n> 导出时间：${new Date().toISOString().slice(0, 10)}\n> 当前主题：${snapshot.theme}\n\n## 品牌色\n\n| 令牌 | 值 |\n| --- | --- |\n| 主色 \`primary\` | \`${tokens.primary}\` |\n| 辅助色 \`secondary\` | \`${tokens.secondary}\` |\n| 对比度 | ${ratioLine}:1 |\n\n## 圆角尺度\n\n${tokens.radiusScale.map((value, index) => `- \`radius.${index + 1}\`: ${value}px`).join('\n')}\n\n## 间距体系\n\n${tokens.spacingScale.map((value, index) => `- \`spacing.${index + 1}\`: ${value}px`).join('\n')}\n\n## 字体比例\n\n${tokens.typeScale.map((value, index) => `- \`type.${index + 1}\`: ${value}px`).join('\n')}\n\n## 保存版本\n\n${versions}\n\n---\n由 BrandMirror 品牌视觉实验室生成。\n`
}

/** 逐条渲染版本，任何一条字段缺失都只跳过该条，不能让整份导出失败 */
function renderVersionLines(versions: BrandMirrorSnapshot['versions']): string {
  if (!Array.isArray(versions) || versions.length === 0) return '- 暂无保存版本'
  const lines = versions.flatMap((version, index) => {
    if (!version || !version.tokens) return []
    const label = typeof version.label === 'string' && version.label ? version.label : `Version ${index + 1}`
    const createdAt = typeof version.createdAt === 'string' && version.createdAt ? version.createdAt.slice(0, 10) : '日期未知'
    const primary = typeof version.tokens.primary === 'string' ? version.tokens.primary : '--'
    const secondary = typeof version.tokens.secondary === 'string' ? version.tokens.secondary : '--'
    return [`- ${label} · ${createdAt} · 主色 ${primary} · 辅助色 ${secondary}`]
  })
  return lines.length > 0 ? lines.join('\n') : '- 暂无可导出的完整版本'
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
