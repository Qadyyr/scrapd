import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Scribd Downloader — Download Documents as PDF",
  description:
    "A clean, fast tool to preview and download publicly accessible Scribd documents as PDF or page images. Paste a link, preview the pages, and download with one click.",
  keywords: [
    "Scribd downloader",
    "download Scribd",
    "Scribd to PDF",
    "document downloader",
    "Scribd preview",
  ],
  authors: [{ name: "Scribd Downloader" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "Scribd Downloader — Download Documents as PDF",
    description:
      "Preview and download publicly accessible Scribd documents as PDF or page images.",
    siteName: "Scribd Downloader",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Scribd Downloader",
    description: "Preview and download Scribd documents as PDF.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
          <SonnerToaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
