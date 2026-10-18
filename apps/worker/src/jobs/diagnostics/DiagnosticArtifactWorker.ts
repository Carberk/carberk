import type { PrismaService } from "@auto-tm/db";

import type { DiagnosticPdfFonts } from "./DiagnosticPdfRenderer";

export interface DiagnosticArtifactObjects {
  put(key: string, bytes: Uint8Array, mime: "application/pdf"): Promise<void>;
  read(key: string, size: number, sha256: string): Promise<Uint8Array>;
  deleteAndVerify(keys: string[]): Promise<void>;
}
export interface DiagnosticArtifactRuntime {
  now(): Date;
  id(): string;
  enabled(): boolean;
}

/** Owns durable generation/adoption and exact abandoned-object maintenance. */
export class DiagnosticArtifactWorker {
  constructor(_db: PrismaService, _objects: DiagnosticArtifactObjects, _fonts: DiagnosticPdfFonts, _runtime: DiagnosticArtifactRuntime) {}
  async generate(_id: string): Promise<boolean> { return false; }
  async cleanup(): Promise<number> { return 0; }
}
