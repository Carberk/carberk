import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";

import { AdminLocaleProvider, AdminLanguageSwitch } from "@/lib/i18n";
import { getAdminLocale } from "@/lib/locale";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "Carberk Admin",
  description: "Internal moderation, user management, push, reports",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getAdminLocale();
  return (
    <html lang={locale} className={cn("h-full antialiased", "font-sans", geist.variable)}>
      <body className="min-h-full flex flex-col"><AdminLocaleProvider initialLocale={locale}><div className="flex justify-end border-b px-6 py-2"><AdminLanguageSwitch /></div>{children}</AdminLocaleProvider></body>
    </html>
  );
}
