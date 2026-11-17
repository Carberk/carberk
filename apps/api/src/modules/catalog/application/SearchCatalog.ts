import { Inject, Injectable } from "@nestjs/common";
import type { CatalogSchemas } from "@auto-tm/contracts";

import type { Brand } from "../domain/Brand";
import type { Model } from "../domain/Model";
import {
  bestNameScore,
  normalizeSearchText,
} from "../domain/CatalogSearchMatcher";
import { parseYearQuery } from "../domain/YearQueryParser";
import { CatalogSearchIndex } from "./CatalogSearchIndex";

export interface SearchCatalogInput {
  query: string;
  locale: "tk" | "ru" | "en";
}

export interface SearchCatalogResult {
  results: CatalogSchemas.CatalogSearchResultItem[];
  yearFrom?: number;
  yearTo?: number;
}

const RESULT_LIMIT = 20;
const MIN_QUERY_LENGTH = 2;

type Locale = "tk" | "ru" | "en";

type ScoredEntry =
  | { score: number; kind: "brand"; brand: Brand }
  | { score: number; kind: "model"; brand: Brand | undefined; model: Model };

/**
 * One search over brands and models: any spelling (RU/EN/TK names and the
 * slug), Cyrillic–Latin transliteration, one forgiven typo, and year tokens.
 * Ranks exact matches above prefix matches above one-edit matches, brands
 * before models on ties, capped at RESULT_LIMIT.
 */
@Injectable()
export class SearchCatalog {
  constructor(
    @Inject(CatalogSearchIndex) private readonly index: CatalogSearchIndex,
  ) {}

  async execute(input: SearchCatalogInput): Promise<SearchCatalogResult> {
    const raw = input.query.trim();
    if (raw.length < MIN_QUERY_LENGTH) return { results: [] };

    let parsed = parseYearQuery(raw);
    const { brands, models } = await this.index.getSnapshot();
    const brandById = new Map(brands.map((b) => [b.id, b]));
    const numericModelNames = new Set<string>();
    for (const model of models) {
      const numericNames = searchableNames(model).filter((name) => /^\d{4}$/.test(name));
      if (numericNames.length === 0) continue;
      // Ignore unrelated displacement/invalid-year tokens in a named query.
      const contextMatches = !parsed.text || bestNameScore(
        parsed.text,
        modelSearchableNames(model, brandById.get(model.brandId)),
      ) > 0;
      if (contextMatches) {
        for (const name of numericNames) numericModelNames.add(name);
      }
    }
    parsed = parseYearQuery(raw, undefined, numericModelNames);
    const years: { yearFrom?: number; yearTo?: number } = {};
    if (parsed.yearFrom !== undefined && parsed.yearTo !== undefined) {
      years.yearFrom = parsed.yearFrom;
      years.yearTo = parsed.yearTo;
    }

    const text = parsed.text;
    if (normalizeSearchText(text).length < MIN_QUERY_LENGTH) {
      return { results: [], ...years };
    }

    const scored: ScoredEntry[] = [];

    for (const brand of brands) {
      const score = bestNameScore(text, searchableNames(brand));
      if (score > 0) scored.push({ score, kind: "brand", brand });
    }

    for (const model of models) {
      const brand = brandById.get(model.brandId);
      const score = bestNameScore(text, modelSearchableNames(model, brand));
      if (score > 0) scored.push({ score, kind: "model", brand, model });
    }

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.kind !== b.kind) return a.kind === "brand" ? -1 : 1;
      return labelFor(a, input.locale).localeCompare(labelFor(b, input.locale));
    });

    const results = scored
      .slice(0, RESULT_LIMIT)
      .map((entry) => toResultItem(entry, input.locale));

    return { results, ...years };
  }
}

function searchableNames(entry: {
  slug: string;
  nameRu: string;
  nameTk: string;
  nameEn: string;
}): string[] {
  return [entry.nameRu, entry.nameTk, entry.nameEn, entry.slug];
}

function modelSearchableNames(model: Model, brand: Brand | undefined): string[] {
  const names = searchableNames(model);
  if (brand) {
    names.push(
      `${brand.nameEn} ${model.nameEn}`,
      `${brand.nameRu} ${model.nameRu}`,
      `${brand.nameTk} ${model.nameTk}`,
    );
  }
  return names;
}

function labelFor(entry: ScoredEntry, locale: Locale): string {
  const named = entry.kind === "brand" ? entry.brand : entry.model;
  return localizedName(named, locale).name;
}

function toResultItem(
  entry: ScoredEntry,
  locale: Locale,
): CatalogSchemas.CatalogSearchResultItem {
  if (entry.kind === "brand") {
    const { name, localeFallback } = localizedName(entry.brand, locale);
    return {
      kind: "brand",
      brandId: entry.brand.id,
      label: name,
      ...(localeFallback ? { localeFallback } : {}),
    };
  }
  const { name, localeFallback } = localizedName(entry.model, locale);
  return {
    kind: "model",
    brandId: entry.model.brandId,
    modelId: entry.model.id,
    label: name,
    ...(entry.brand
      ? { brandLabel: localizedName(entry.brand, locale).name }
      : {}),
    ...(localeFallback ? { localeFallback } : {}),
  };
}

function localizedName(
  named: { nameRu: string; nameTk: string; nameEn: string },
  locale: Locale,
): { name: string; localeFallback?: Locale } {
  const name = getName(named, locale);
  if (name) return { name };

  const fallback = named.nameEn || named.nameRu || named.nameTk;
  const fallbackLocale: Locale = named.nameEn
    ? "en"
    : named.nameRu
      ? "ru"
      : "tk";
  return { name: fallback, localeFallback: fallbackLocale };
}

function getName(
  named: { nameRu: string; nameTk: string; nameEn: string },
  locale: Locale,
): string {
  switch (locale) {
    case "tk":
      return named.nameTk;
    case "ru":
      return named.nameRu;
    case "en":
      return named.nameEn;
  }
}
