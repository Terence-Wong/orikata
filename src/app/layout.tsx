import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Orikata",
  description: "Step-by-step 3D origami folding animations from FOLD files.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-white text-neutral-900 antialiased">{children}</body>
    </html>
  );
}
