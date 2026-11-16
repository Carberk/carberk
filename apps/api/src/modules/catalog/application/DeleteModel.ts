import { Inject, Injectable, NotFoundException, ConflictException } from "@nestjs/common";

import {
  MODEL_REPOSITORY,
  type ModelRepository,
} from "../domain/ports/ModelRepository";
import { CATALOG_AUDIT_LOG, type CatalogAuditLog } from "./ports/CatalogAuditLog";
import { CatalogSearchIndex } from "./CatalogSearchIndex";

export interface DeleteModelInput {
  id: string;
}

@Injectable()
export class DeleteModel {
  constructor(
    @Inject(MODEL_REPOSITORY) private readonly models: ModelRepository,
    @Inject(CATALOG_AUDIT_LOG) private readonly audit: CatalogAuditLog,
    @Inject(CatalogSearchIndex)
    private readonly searchIndex: CatalogSearchIndex,
  ) {}

  async execute(input: DeleteModelInput, actorUserId: string): Promise<void> {
    const model = await this.models.getModelById(input.id);
    if (!model) {
      throw new NotFoundException("Model not found");
    }

    try {
      await this.models.delete(input.id);
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        err.message.includes("foreign key constraint")
      ) {
        throw new ConflictException(
          "Cannot delete model because it has associated generations or listings",
        );
      }
      throw err;
    }
    this.searchIndex.invalidate();

    await this.audit.record({
      actorId: actorUserId,
      action: "CATALOG_MODEL_DELETE",
      targetType: "Model",
      targetId: model.id,
      details: { slug: model.slug, nameRu: model.nameRu, brandId: model.brandId },
    });
  }
}
