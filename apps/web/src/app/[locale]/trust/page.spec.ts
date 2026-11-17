import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import TrustPage from "./page";

it.each(["en", "ru", "tk"])("shows the founder's reachable Trust contact in %s", async (locale) => {
  const html = renderToStaticMarkup(await TrustPage({ params: Promise.resolve({ locale }) }));
  expect(html).toContain('href="mailto:bagtyyarkowusow.dev@gmail.com"');
  expect(html).toContain('>bagtyyarkowusow.dev@gmail.com</a>');
});


it.each(["en", "ru", "tk"])("links the demo photo credits in %s", async (locale) => {
  const html = renderToStaticMarkup(await TrustPage({ params: Promise.resolve({ locale }) }));
  expect(html).toContain(`href="/${locale}/demo-credits"`);
});
