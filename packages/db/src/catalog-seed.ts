import bodyTypes from "../prisma/seed/body-types.json" with { type: "json" };
import brands from "../prisma/seed/brands.json" with { type: "json" };
import cities from "../prisma/seed/cities.json" with { type: "json" };
import colors from "../prisma/seed/colors.json" with { type: "json" };
import driveTypes from "../prisma/seed/drive-types.json" with { type: "json" };
import engineTypes from "../prisma/seed/engine-types.json" with { type: "json" };
import exchangeRates from "../prisma/seed/exchange-rates.json" with { type: "json" };
import models from "../prisma/seed/models.json" with { type: "json" };
import regions from "../prisma/seed/regions.json" with { type: "json" };
import transmissions from "../prisma/seed/transmissions.json" with { type: "json" };
import type { PrismaClient } from "../generated/prisma/client/client";

import { seedExchangeRates } from "./seed-exchange-rates";

export async function seedCatalog(prisma: PrismaClient): Promise<void> {
  // 1. BodyType — no FKs, dedup by nameEn (no unique key in schema today)
  let bodyTypeCount = 0;
  for (const bt of bodyTypes as Array<{
    nameRu: string;
    nameTk: string;
    nameEn: string;
  }>) {
    const existing = await prisma.bodyType.findFirst({
      where: { nameEn: bt.nameEn },
    });
    if (existing) {
      const changed =
        existing.nameRu !== bt.nameRu || existing.nameTk !== bt.nameTk;
      if (changed) {
        await prisma.bodyType.update({
          where: { id: existing.id },
          data: { nameRu: bt.nameRu, nameTk: bt.nameTk },
        });
      }
    } else {
      await prisma.bodyType.create({ data: bt });
      bodyTypeCount++;
    }
  }
  console.log(
    `Seeded ${bodyTypeCount} new body types (${bodyTypes.length} total in file)`,
  );

  // 2. Color — no FKs, dedup by nameEn (no unique key in schema today)
  let colorCount = 0;
  for (const c of colors as Array<{
    nameRu: string;
    nameTk: string;
    nameEn: string;
    hex: string;
  }>) {
    const existing = await prisma.color.findFirst({
      where: { nameEn: c.nameEn },
    });
    if (existing) {
      const changed =
        existing.nameRu !== c.nameRu ||
        existing.nameTk !== c.nameTk ||
        existing.hex !== c.hex;
      if (changed) {
        await prisma.color.update({
          where: { id: existing.id },
          data: { nameRu: c.nameRu, nameTk: c.nameTk, hex: c.hex },
        });
      }
    } else {
      await prisma.color.create({ data: c });
      colorCount++;
    }
  }
  console.log(
    `Seeded ${colorCount} new colors (${colors.length} total in file)`,
  );

  // 3. Brand — slug is unique
  let brandCount = 0;
  for (const b of brands as Array<{
    slug: string;
    nameRu: string;
    nameTk: string;
    nameEn: string;
  }>) {
    await prisma.brand.upsert({
      where: { slug: b.slug },
      update: { nameRu: b.nameRu, nameTk: b.nameTk, nameEn: b.nameEn },
      create: b,
    });
    brandCount++;
  }
  console.log(`Seeded ${brandCount} brands`);

  // 4. Model — FK → Brand, composite unique (brandId, slug)
  let modelCount = 0;
  for (const m of models as Array<{
    brandSlug: string;
    slug: string;
    nameRu: string;
    nameTk: string;
    nameEn: string;
  }>) {
    const brand = await prisma.brand.findUnique({
      where: { slug: m.brandSlug },
    });
    if (!brand) {
      console.warn(`Brand not found for slug "${m.brandSlug}" — skipping model "${m.slug}"`);
      continue;
    }
    await prisma.model.upsert({
      where: { brandId_slug: { brandId: brand.id, slug: m.slug } },
      update: {
        nameRu: m.nameRu,
        nameTk: m.nameTk,
        nameEn: m.nameEn,
      },
      create: {
        brandId: brand.id,
        slug: m.slug,
        nameRu: m.nameRu,
        nameTk: m.nameTk,
        nameEn: m.nameEn,
      },
    });
    modelCount++;
  }
  console.log(`Seeded ${modelCount} models`);

  // 5. Region — slug is unique
  let regionCount = 0;
  for (const r of regions as Array<{
    slug: string;
    nameRu: string;
    nameTk: string;
    nameEn: string;
  }>) {
    await prisma.region.upsert({
      where: { slug: r.slug },
      update: { nameRu: r.nameRu, nameTk: r.nameTk, nameEn: r.nameEn },
      create: r,
    });
    regionCount++;
  }
  console.log(`Seeded ${regionCount} regions`);

  // 6. City — FK → Region, composite unique (regionId, slug)
  let cityCount = 0;
  for (const c of cities as Array<{
    regionSlug: string;
    slug: string;
    nameRu: string;
    nameTk: string;
    nameEn: string;
  }>) {
    const region = await prisma.region.findUnique({
      where: { slug: c.regionSlug },
    });
    if (!region) {
      console.warn(
        `Region not found for slug "${c.regionSlug}" — skipping city "${c.slug}"`,
      );
      continue;
    }
    await prisma.city.upsert({
      where: { regionId_slug: { regionId: region.id, slug: c.slug } },
      update: {
        nameRu: c.nameRu,
        nameTk: c.nameTk,
        nameEn: c.nameEn,
      },
      create: {
        regionId: region.id,
        slug: c.slug,
        nameRu: c.nameRu,
        nameTk: c.nameTk,
        nameEn: c.nameEn,
      },
    });
    cityCount++;
  }
  console.log(`Seeded ${cityCount} cities`);

  // 7. EngineType — no FKs, dedup by nameEn
  let engineTypeCount = 0;
  for (const et of engineTypes as Array<{
    nameRu: string;
    nameTk: string;
    nameEn: string;
  }>) {
    const existing = await prisma.engineType.findFirst({
      where: { nameEn: et.nameEn },
    });
    if (existing) {
      const changed =
        existing.nameRu !== et.nameRu || existing.nameTk !== et.nameTk;
      if (changed) {
        await prisma.engineType.update({
          where: { id: existing.id },
          data: { nameRu: et.nameRu, nameTk: et.nameTk },
        });
      }
    } else {
      await prisma.engineType.create({ data: et });
      engineTypeCount++;
    }
  }
  console.log(
    `Seeded ${engineTypeCount} new engine types (${engineTypes.length} total in file)`,
  );

  // 8. Transmission — no FKs, dedup by nameEn
  let transmissionCount = 0;
  for (const t of transmissions as Array<{
    nameRu: string;
    nameTk: string;
    nameEn: string;
  }>) {
    const existing = await prisma.transmission.findFirst({
      where: { nameEn: t.nameEn },
    });
    if (existing) {
      const changed =
        existing.nameRu !== t.nameRu || existing.nameTk !== t.nameTk;
      if (changed) {
        await prisma.transmission.update({
          where: { id: existing.id },
          data: { nameRu: t.nameRu, nameTk: t.nameTk },
        });
      }
    } else {
      await prisma.transmission.create({ data: t });
      transmissionCount++;
    }
  }
  console.log(
    `Seeded ${transmissionCount} new transmissions (${transmissions.length} total in file)`,
  );

  // 9. DriveType — no FKs, dedup by nameEn
  let driveTypeCount = 0;
  for (const dt of driveTypes as Array<{
    nameRu: string;
    nameTk: string;
    nameEn: string;
  }>) {
    const existing = await prisma.driveType.findFirst({
      where: { nameEn: dt.nameEn },
    });
    if (existing) {
      const changed =
        existing.nameRu !== dt.nameRu || existing.nameTk !== dt.nameTk;
      if (changed) {
        await prisma.driveType.update({
          where: { id: existing.id },
          data: { nameRu: dt.nameRu, nameTk: dt.nameTk },
        });
      }
    } else {
      await prisma.driveType.create({ data: dt });
      driveTypeCount++;
    }
  }
  console.log(
    `Seeded ${driveTypeCount} new drive types (${driveTypes.length} total in file)`,
  );

  // 10. ExchangeRate — create missing pairs only; existing rates (e.g. set by
  // an admin) are left unchanged.
  const exchangeRateResult = await seedExchangeRates(
    {
      findExchangeRate: async (fromCurrency, toCurrency) => {
        const existing = await prisma.exchangeRate.findUnique({
          where: {
            fromCurrency_toCurrency: {
              fromCurrency: fromCurrency as "USD" | "AED" | "TMT",
              toCurrency: toCurrency as "USD" | "AED" | "TMT",
            },
          },
        });
        return existing;
      },
      createExchangeRate: async (er) => {
        await prisma.exchangeRate.create({
          data: {
            fromCurrency: er.fromCurrency as "USD" | "AED" | "TMT",
            toCurrency: er.toCurrency as "USD" | "AED" | "TMT",
            rate: er.rate,
          },
        });
      },
    },
    exchangeRates as Array<{
      fromCurrency: string;
      toCurrency: string;
      rate: number;
    }>,
  );
  console.log(
    `Seeded ${exchangeRateResult.created} new exchange rates ` +
      `(${exchangeRateResult.alreadyPresent} already present, left unchanged)`,
  );
}
