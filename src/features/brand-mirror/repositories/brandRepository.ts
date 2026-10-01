import type { BrandDocument } from '../models/brandMirrorModels'
import { validateTokens } from '../domain/brandRules'
import { recoverDocument, type DocumentRecoveryResult } from '../domain/documentRecovery'
import type { StorageService } from '../services/storageService'

export interface BrandRepository {
  load(): DocumentRecoveryResult
  save(document: BrandDocument): void
}

export class LocalBrandRepository implements BrandRepository {
  constructor(private readonly storage: StorageService) {}

  load(): DocumentRecoveryResult {
    const raw = this.storage.read()
    if (!raw) return { document: null, warnings: [] }
    return recoverDocument(raw)
  }

  save(document: BrandDocument): void {
    const validationError = validateTokens(document.tokens)
    if (validationError) throw new Error(validationError)
    this.storage.write(JSON.stringify(document))
  }
}
