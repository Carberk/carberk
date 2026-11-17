import { describe, it, expect } from "vitest";
import { parseYearQuery, MIN_YEAR } from "./YearQueryParser";

const NOW = new Date("2026-09-28T00:00:00Z");
const MAX_YEAR = 2027;

describe("parseYearQuery", () => {
  it("parses a single year after a name", () => {
    expect(parseYearQuery("camry 2018", NOW)).toEqual({
      text: "camry",
      yearFrom: 2018,
      yearTo: 2018,
    });
  });

  it("parses a bare year", () => {
    expect(parseYearQuery("2018", NOW)).toEqual({
      text: "",
      yearFrom: 2018,
      yearTo: 2018,
    });
  });

  it("parses a hyphenated range", () => {
    expect(parseYearQuery("лексус 2014-2019", NOW)).toEqual({
      text: "лексус",
      yearFrom: 2014,
      yearTo: 2019,
    });
  });

  it("parses an en-dash range with spaces", () => {
    expect(parseYearQuery("2014 – 2019", NOW)).toEqual({
      text: "",
      yearFrom: 2014,
      yearTo: 2019,
    });
  });

  it("normalizes a reversed range", () => {
    expect(parseYearQuery("2019-2014", NOW)).toEqual({
      text: "",
      yearFrom: 2014,
      yearTo: 2019,
    });
  });

  it("ignores years below the minimum", () => {
    const parsed = parseYearQuery("1800", NOW);
    expect(parsed.yearFrom).toBeUndefined();
    expect(parsed.yearTo).toBeUndefined();
    expect(parsed.text).toBe("");
  });

  it("ignores years above the maximum", () => {
    const parsed = parseYearQuery(`${MAX_YEAR + 1}`, NOW);
    expect(parsed.yearFrom).toBeUndefined();
    expect(parsed.text).toBe("");
  });

  it("ignores an out-of-range range", () => {
    const parsed = parseYearQuery(`camry 1800-${MAX_YEAR + 1}`, NOW);
    expect(parsed.yearFrom).toBeUndefined();
    expect(parsed.text).toBe("camry");
  });

  it("accepts the boundary years", () => {
    expect(parseYearQuery(String(MIN_YEAR), NOW).yearFrom).toBe(MIN_YEAR);
    expect(parseYearQuery(String(MAX_YEAR), NOW).yearTo).toBe(MAX_YEAR);
  });

  it("does not treat longer digit runs as years", () => {
    const parsed = parseYearQuery("12018", NOW);
    expect(parsed.yearFrom).toBeUndefined();
    expect(parsed.text).toBe("12018");
  });

  it("does not treat digits glued to letters as years", () => {
    const parsed = parseYearQuery("B2000", NOW);
    expect(parsed.yearFrom).toBeUndefined();
    expect(parsed.text).toBe("B2000");
  });

  it("combines several single years into a range", () => {
    expect(parseYearQuery("2018 2020", NOW)).toEqual({
      text: "",
      yearFrom: 2018,
      yearTo: 2020,
    });
  });

  it("retains known numeric model names outside the year range while parsing a valid year", () => {
    expect(parseYearQuery("1055 1982", NOW, new Set(["1055"]))).toEqual({
      text: "1055", yearFrom: 1982, yearTo: 1982,
    });
    expect(parseYearQuery("1500", NOW, new Set(["1500"]))).toEqual({ text: "1500" });
  });

  it("keeps valid years authoritative even when the catalog has that numeric model name", () => {
    expect(parseYearQuery("2007", NOW, new Set(["2007"]))).toEqual({
      text: "", yearFrom: 2007, yearTo: 2007,
    });
  });

  it("continues ignoring unknown invalid years and invalid ranges beside known numeric models", () => {
    const knownModels = new Set(["1055"]);
    expect(parseYearQuery("1055 0000", NOW, knownModels)).toEqual({ text: "1055" });
    expect(parseYearQuery("camry 1055-2028", NOW, knownModels)).toEqual({ text: "camry" });
  });

  it("returns the text untouched when there are no years", () => {
    expect(parseYearQuery("camry", NOW)).toEqual({ text: "camry" });
  });
});
