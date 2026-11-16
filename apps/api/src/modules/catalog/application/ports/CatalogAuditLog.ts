export type CatalogAuditEntry = {
  actorId: string;
  targetId: string;
} & (
  | {
      action: "CATALOG_BRAND_CREATE" | "CATALOG_BRAND_UPDATE" | "CATALOG_BRAND_DELETE";
      targetType: "Brand";
      details: { slug: string; nameRu: string };
    }
  | {
      action: "CATALOG_MODEL_CREATE" | "CATALOG_MODEL_UPDATE" | "CATALOG_MODEL_DELETE";
      targetType: "Model";
      details: { slug: string; nameRu: string; brandId: string };
    }
  | {
      action: "CATALOG_BRAND_LOGO_SET";
      targetType: "Brand";
      details: { slug: string; logoKey: string; previousLogoKey: string | null };
    }
  | {
      action: "CATALOG_BRAND_LOGO_REMOVE";
      targetType: "Brand";
      details: { slug: string; previousLogoKey: string };
    }
);

export interface CatalogAuditLog {
  record(entry: CatalogAuditEntry): Promise<void>;
}

export const CATALOG_AUDIT_LOG = Symbol("CatalogAuditLog");
