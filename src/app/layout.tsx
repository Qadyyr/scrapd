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
  title: "Scribd Downloader — Download Documents as PDF (Free, No Signup)",
  description:
    "Download any Scribd document as a searchable, editable PDF. Free tool to download Scribd PDFs, documents, and page images. Works on mobile and desktop. No signup, no browser extension, no third-party API required.",
  keywords: [
    "scribd downloader",
    "download scribd pdf",
    "scribd to pdf",
    "scribd document downloader",
    "scribd free download",
    "scribd pdf extractor",
    "download scribd documents",
    "scribd page images",
    "scribd text extraction",
    "scribd pdf generator",
    "free scribd downloader",
    "scribd downloader online",
    "scribd downloader without login",
    "how to download scribd documents",
    "scribd document scraper",
    "scribd pdf converter",
    "scribd to pdf converter",
    "download scribd for free",
    "scribd offline reader",
  ],
  authors: [{ name: "Scribd Downloader" }],
  creator: "Scribd Downloader",
  publisher: "Scribd Downloader",
  metadataBase: new URL("https://scrapd.vercel.app"),
  alternates: {
    canonical: "/",
  },
  category: "technology",
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "Scribd Downloader — Download Documents as PDF",
    description:
      "Free tool to download Scribd documents as searchable, editable PDFs. Works on mobile and desktop. No signup required.",
    url: "https://scrapd.vercel.app",
    siteName: "Scribd Downloader",
    images: [
      {
        url: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
        width: 1200,
        height: 630,
        alt: "Scribd Downloader",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Scribd Downloader — Download Documents as PDF",
    description:
      "Free tool to download Scribd documents as searchable, editable PDFs. No signup, no extension, works on mobile.",
    images: ["https://z-cdn.chatglm.cn/z-ai/static/logo.svg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
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
