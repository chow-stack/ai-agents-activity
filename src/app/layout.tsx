import type { Metadata } from "next";
import { Bricolage_Grotesque, Inter, JetBrains_Mono } from "next/font/google";
import { supabaseConfigured } from "@/lib/supabase";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"], weight: ["400", "500", "600", "700"] });
const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"], weight: ["500", "600", "700"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "Trust or Betray | Gen AI Club",
  description: "Your team's AI agent plays share-or-steal against every other team.",
  icons: { icon: "/logo-mark.png" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${bricolage.variable} ${jetbrains.variable} h-full antialiased`}>
      <body className="min-h-full">{supabaseConfigured ? children : <SetupMissing />}</body>
    </html>
  );
}

/** Shown instead of a crash when the deploy was built without the Supabase env vars. */
function SetupMissing() {
  return (
    <div className="grid min-h-screen place-items-center p-8">
      <div className="max-w-lg">
        <div className="eyebrow">Setup needed</div>
        <h1 className="display mt-2 text-[32px] leading-tight">Trust or Betray can&apos;t reach its database</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
          This deploy was built without its Supabase settings. In Vercel, open the project&apos;s <b>Settings → Environment Variables</b>, add
          these two for all environments, then redeploy:
        </p>
        <ul className="mt-4 space-y-1.5 rounded-lg bg-cream p-4 font-mono text-[13px] ring-1 ring-line">
          <li>NEXT_PUBLIC_SUPABASE_URL</li>
          <li>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</li>
        </ul>
      </div>
    </div>
  );
}
