import { describe, it, expect } from "vitest";
import {
  normalizeSearchText,
  cyrillicToLatin,
  latinToCyrillic,
  editDistance,
  bestNameScore,
  scoreMatch,
} from "./CatalogSearchMatcher";

describe("normalizeSearchText", () => {
  it("lowercases and trims", () => {
    expect(normalizeSearchText("  Toyota  ")).toBe("toyota");
  });

  it("folds Turkmen letters to their Latin base", () => {
    expect(normalizeSearchText("Toýota")).toBe("toyota");
    expect(normalizeSearchText("Aşgabat")).toBe("asgabat");
    expect(normalizeSearchText("Öňki")).toBe("onki");
    expect(normalizeSearchText("Çäre")).toBe("care");
    expect(normalizeSearchText("Ňaz")).toBe("naz");
    expect(normalizeSearchText("Üýtgeşik")).toBe("uytgesik");
    expect(normalizeSearchText("Žižek")).toBe("zizek");
  });

  it("maps ё to е", () => {
    expect(normalizeSearchText("ёлка")).toBe("елка");
  });

  it("folds й to и through NFD decomposition", () => {
    expect(normalizeSearchText("Тойота")).toBe("тоиота");
  });

  it("collapses punctuation and whitespace into single spaces", () => {
    expect(normalizeSearchText("Land-Cruiser  200")).toBe("land cruiser 200");
  });
});

describe("transliteration", () => {
  it("maps Cyrillic to Latin", () => {
    expect(cyrillicToLatin("тойота")).toBe("tojota");
    expect(cyrillicToLatin("камри")).toBe("kamri");
  });

  it("maps Latin to Cyrillic phonetically", () => {
    expect(latinToCyrillic("camry")).toBe("камри");
    expect(latinToCyrillic("toyota")).toBe("тоиота");
    expect(latinToCyrillic("shevrole")).toBe("шевроле");
  });
});

describe("editDistance", () => {
  it("forgives one deletion", () => {
    expect(editDistance("toyta", "toyota", 1)).toBe(1);
  });

  it("forgives one substitution", () => {
    expect(editDistance("camri", "camry", 1)).toBe(1);
  });

  it("rejects two edits", () => {
    expect(editDistance("tayta", "toyota", 1)).toBeGreaterThan(1);
  });
});

describe("bestNameScore", () => {
  const toyota = ["Тойота", "Toýota", "Toyota"];
  const camry = ["Камри", "Kamri", "Camry"];

  it("matches Russian, English and Turkmen spellings exactly", () => {
    expect(bestNameScore("тойота", toyota)).toBe(100);
    expect(bestNameScore("toyota", toyota)).toBe(100);
    expect(bestNameScore("Тойота", toyota)).toBe(100);
    expect(bestNameScore("Toýota", toyota)).toBe(100);
  });

  it("forgives one typo", () => {
    expect(bestNameScore("toyta", toyota)).toBe(50);


    expect(bestNameScore("camri", camry)).toBe(100);
  });

  it("scores a prefix above a typo", () => {
    expect(bestNameScore("toyo", toyota)).toBe(75);
  });

  it("matches transliterated Latin against Cyrillic names", () => {

    expect(bestNameScore("camry", ["Камри"])).toBe(100);


    expect(bestNameScore("toyota", ["Тойота"])).toBe(100);
  });

  it("matches a multi-word query token by token", () => {
    expect(bestNameScore("ленд крузер", ["Ленд Крузер"])).toBe(100);
    expect(bestNameScore("land cruser", ["Land Cruiser"])).toBe(50);
  });

  it("matches Cyrillic spelling against Latin-only catalog names without widening typo distance", () => {
    expect(bestNameScore("камри", ["Camry", "Camry", "Camry"])).toBe(100);
    expect(bestNameScore("камр", ["Camry"])).toBe(75);
    expect(bestNameScore("камрии", ["Camry"])).toBe(50);
    expect(bestNameScore("комрии", ["Camry"])).toBe(0);
    expect(bestNameScore("камри", ["Corolla", "Crown"])).toBe(0);

    expect(bestNameScore("камри", ["Carry"])).toBe(50);
  });

  it("returns 0 for unrelated names", () => {
    expect(bestNameScore("mersedes", toyota)).toBe(0);
  });

  it("returns 0 for an empty query", () => {
    expect(bestNameScore("", toyota)).toBe(0);
  });

  it("does not forgive typos on words shorter than four letters", () => {
    expect(scoreMatch("bmv", "bmw")).toBe(0);
    expect(bestNameScore("bmv", ["BMW"])).toBe(0);
  });
});
