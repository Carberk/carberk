import { CatalogSchemas } from "@auto-tm/contracts";

import { listAllBrands } from "./actions";
import { BrandLogoControls } from "./BrandLogoControls";

import { AdminText } from "@/lib/i18n";

export default async function BrandsPage() {
  const result = await listAllBrands();
  const brands = result.ok ? result.data : [];
  const withLogo = brands.filter((b) => b.logoUrl).length;

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold"><AdminText>Бренды</AdminText></h1>
        <p className="text-sm text-neutral-500"><AdminText>Логотипы:</AdminText>{withLogo}<AdminText>из</AdminText>{brands.length}<AdminText>. SVG, PNG или WebP, до</AdminText>{" "}
          {CatalogSchemas.BRAND_LOGO_MAX_BYTES / 1024}<AdminText>КБ, почти квадратные. Без логотипа приложение показывает первую букву.</AdminText></p>
      </div>

      {!result.ok ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AdminText>{result.error}</AdminText>
        </div>
      ) : brands.length === 0 ? (
        <div className="rounded-md border bg-surface p-8 text-center text-neutral-500"><AdminText>Брендов пока нет.</AdminText></div>
      ) : (
        <ul className="divide-y rounded-md border">
          {brands.map((brand) => (
            <li key={brand.id} className="flex items-center gap-4 px-4 py-3">
              <BrandLogo name={brand.name} logoUrl={brand.logoUrl} />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{brand.name}</div>
                <div className="text-xs text-neutral-500">{brand.slug}</div>
              </div>
              <BrandLogoControls
                brandId={brand.id}
                brandName={brand.name}
                hasLogo={Boolean(brand.logoUrl)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BrandLogo({ name, logoUrl }: { name: string; logoUrl: string | undefined }) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt={`Логотип ${name}`}
        width={40}
        height={40}
        className="h-10 w-10 shrink-0 object-contain"
      />
    );
  }
  return (
    <div
      aria-label={`Нет логотипа, буква ${brandLetter(name)}`}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-sm font-semibold text-neutral-600"
    >
      {brandLetter(name)}
    </div>
  );
}

function brandLetter(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}
