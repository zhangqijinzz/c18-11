import type { BrandDocument } from '../models/brandMirrorModels'
import { validateTokens } from '../domain/brandRules'
import { recoverDocument, type RecoveredDocument } from '../domain/documentRecovery'
import type { StorageService } from '../services/storageService'

export interface BrandRepository {
  load(): RecoveredDocument | null
  save(document: BrandDocument): void
}

export class LocalBrandRepository implements BrandRepository {
  constructor(private readonly storage: StorageService) {}

  load(): RecoveredDocument | null {
    const raw = this.storage.read()
    if (!raw) return null
    try {
      // 逐项恢复：坏的颜色/尺度会被修补，坏的版本条目会被跳过，
      // 可用的部分（包括之前保存的版本）尽量保留并附带提示。
      return recoverDocument(JSON.parse(raw))
    } catch {
      // JSON 本身无法解析时没有可保留的结构，交给上层回退到默认工作区
      return null
    }
  }

  save(document: BrandDocument): void {
    const validationError = validateTokens(document.tokens)
    if (validationError) throw new Error(validationError)
    this.storage.write(JSON.stringify(document))
  }
}
