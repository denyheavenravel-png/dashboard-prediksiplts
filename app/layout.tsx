import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Prediksi Daya PLTS Mini",
  description: "Dashboard monitoring dan prediksi daya PLTS menggunakan jaringan syaraf tiruan",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
