import { readFileSync } from "node:fs";
import path from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import credits from "./credits.json";
import DemoCreditsPage, { generateMetadata } from "./page";

type ManifestPhoto = {
  sourceFile: string;
  sourcePage: string;
  author: string;
  license: string;
  licenseUrl: string;
};

const manifest = JSON.parse(
  readFileSync(
    path.resolve(__dirname, "../../../../../../packages/db/scripts/demo-inventory/photos.manifest.json"),
    "utf8",
  ),
) as { verifiedOn: string; listings: Record<string, { photos: ManifestPhoto[] }> };

const render = async (locale: string) =>
  renderToStaticMarkup(await DemoCreditsPage({ params: Promise.resolve({ locale }) }));

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

describe("demo photo credits page", () => {
  it("is generated from the demo inventory photo manifest", () => {
    const expected = Object.values(manifest.listings).flatMap((listing) =>
      listing.photos.map(({ sourceFile, sourcePage, author, license, licenseUrl }) => ({
        sourceFile,
        sourcePage,
        author,
        license,
        licenseUrl,
      })),
    );
    expect(credits).toEqual({ verifiedOn: manifest.verifiedOn, photos: expected });
    expect(credits.photos.length).toBeGreaterThanOrEqual(225);
  });

  it.each([
    ["ru", "Авторы фотографий", "уменьшены и обрезаны", "той же лицензии"],
    ["tk", "Suratlaryň awtorlary", "kiçeldildi we kesildi", "asyl suratlaryň ygtyýarnamasynyň"],
    ["en", "Photo credits", "resized and cropped", "under the same licence"],
  ])("credits every photo with its author, licence and source in %s", async (locale, title, changes, sameLicence) => {
    const html = await render(locale);

    expect(html).toContain(changes);
    expect(html).toContain(sameLicence);
    expect(html).toContain(`<h1`);
    expect(html).toContain(title);
    expect(html).toContain("Wikimedia Commons");
    expect(html.match(/<li/g)?.length).toBe(credits.photos.length);
    for (const photo of credits.photos) {
      expect(html).toContain(`href="${escapeHtml(photo.sourcePage)}"`);
      expect(html).toContain(escapeHtml(photo.author));
      expect(html).toContain(escapeHtml(photo.license));
      expect(html).toContain(`href="${escapeHtml(photo.licenseUrl)}"`);
      expect(photo.licenseUrl).toMatch(/^https:\/\/creativecommons\.org\//);
    }
  });

  it.each(["ru", "tk", "en"])("credits the three bundled reviewer photographs publicly in %s", async (locale) => {
    const reviewerManifest = JSON.parse(readFileSync(path.resolve(__dirname, "../../../../../../packages/db/scripts/reviewer-fixtures/photos.manifest.json"), "utf8")) as { photos: ManifestPhoto[] };
    expect(reviewerManifest.photos).toHaveLength(3);
    const html = await render(locale);
    for (const photo of reviewerManifest.photos) {
      expect(credits.photos).toContainEqual(expect.objectContaining({ sourceFile: photo.sourceFile, author: photo.author, license: photo.license }));
      expect(html).toContain(`href="${escapeHtml(photo.sourcePage)}"`);
      expect(html).toContain(escapeHtml(photo.author));
      expect(html).toContain(`href="${escapeHtml(photo.licenseUrl)}"`);
    }
  });

  it("falls back to the default locale and stays out of search indexes", async () => {
    expect(await render("de")).toContain("Авторы фотографий");
    const metadata = await generateMetadata({ params: Promise.resolve({ locale: "en" }) });
    expect(metadata.title).toBe("Photo credits — Carberk");
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
