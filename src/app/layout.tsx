import type { Metadata, Viewport } from "next";

import { Providers } from "@/app/providers";
import { SITE } from "@/config/site";

import "@/styles/globals.css";

export const metadata: Metadata = {
  title: {
    default: "CURVIN",
    template: "%s · CURVIN",
  },
  description: SITE.description,
  applicationName: SITE.name,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0e11" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
