import { Inject, Injectable } from "@nestjs/common";
import { PrismaService } from "@auto-tm/db";

import type { Brand } from "../domain/Brand";
import type { BrandRepository } from "../domain/ports/BrandRepository";
import type {
  BrandLogoRepository,
  LogoKeyReplacement,
} from "../domain/ports/BrandLogoRepository";







const LOGO_TRANSACTION = { maxWait: 5_000, timeout: 5_000 } as const;

@Injectable()
export class PrismaBrandRepository implements BrandRepository, BrandLogoRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listBrands(opts: {
    locale: "tk" | "ru" | "en";
    cursor?: { name: string; id: string };
    limit?: number;
  }): Promise<{ items: Brand[]; nextCursor?: { name: string; id: string } | undefined }> {
    const take = (opts.limit ?? 50) + 1;
    const nameField = nameFieldForLocale(opts.locale);

    const rows = await this.prisma.brand.findMany({
      take,
      orderBy: [{ [nameField]: "asc" }, { id: "asc" }],
      ...(opts.cursor
        ? {
            skip: 1,
            cursor: { id: opts.cursor.id },
          }
        : {}),
    });

    const hasMore = rows.length === take;
    const items = hasMore ? rows.slice(0, -1) : rows;
    const last = items[items.length - 1];
    const nextCursor = hasMore && last
      ? {
          name: getName(last, opts.locale),
          id: last.id,
        }
      : undefined;

    return { items: items.map((r) => this.toDomain(r)), nextCursor };
  }

  async getBrandById(id: string): Promise<Brand | null> {
    const row = await this.prisma.brand.findUnique({ where: { id } });
    return row ? this.toDomain(row) : null;
  }

  async listAllBrands(): Promise<Brand[]> {
    const rows = await this.prisma.brand.findMany({ orderBy: { id: "asc" } });
    return rows.map((r) => this.toDomain(r));
  }

  async getBySlug(slug: string): Promise<Brand | null> {
    const row = await this.prisma.brand.findUnique({ where: { slug } });
    return row ? this.toDomain(row) : null;
  }

  async create(data: {
    slug: string;
    nameRu: string;
    nameTk: string;
    nameEn: string;
  }): Promise<Brand> {
    const row = await this.prisma.brand.create({ data });
    return this.toDomain(row);
  }

  async update(
    id: string,
    data: Partial<{
      slug: string;
      nameRu: string;
      nameTk: string;
      nameEn: string;
    }>,
  ): Promise<Brand> {
    const row = await this.prisma.brand.update({ where: { id }, data });
    return this.toDomain(row);
  }

  async replaceLogoKey(id: string, logoKey: string | null): Promise<LogoKeyReplacement> {
    return this.prisma.$transaction(async (tx) => {


      await tx.$executeRaw`SET LOCAL statement_timeout = '4s'`;
      const rows = await tx.$queryRaw<{ logoKey: string | null }[]>`
        SELECT "logoKey" FROM "brands" WHERE "id" = ${id} FOR UPDATE`;
      const locked = rows[0];
      if (!locked) return { replaced: false, reason: "not-found" } as const;
      await tx.brand.update({ where: { id }, data: { logoKey } });
      return { replaced: true, previousKey: locked.logoKey } as const;
    }, LOGO_TRANSACTION);
  }

  async delete(id: string): Promise<{ logoKey: string | null } | null> {
    return this.prisma.$transaction(async (tx) => {


      await tx.$executeRaw`SET LOCAL statement_timeout = '4s'`;
      const rows = await tx.$queryRaw<{ logoKey: string | null }[]>`
        SELECT "logoKey" FROM "brands" WHERE "id" = ${id} FOR UPDATE`;
      const locked = rows[0];
      if (!locked) return null;
      await tx.brand.delete({ where: { id } });
      return { logoKey: locked.logoKey };
    }, LOGO_TRANSACTION);
  }

  private toDomain(
    row: Awaited<ReturnType<PrismaService["brand"]["findUnique"]>> &
      NonNullable<unknown>,
  ): Brand {
    return {
      id: row.id,
      slug: row.slug,
      nameRu: row.nameRu,
      nameTk: row.nameTk,
      nameEn: row.nameEn,
      logoKey: row.logoKey,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

function nameFieldForLocale(locale: "tk" | "ru" | "en"): string {
  switch (locale) {
    case "tk":
      return "nameTk";
    case "ru":
      return "nameRu";
    case "en":
      return "nameEn";
  }
}

function getName(
  row: { nameTk: string; nameRu: string; nameEn: string },
  locale: "tk" | "ru" | "en",
): string {
  switch (locale) {
    case "tk":
      return row.nameTk;
    case "ru":
      return row.nameRu;
    case "en":
      return row.nameEn;
  }
}
