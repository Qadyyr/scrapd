# 📥 Scribd Downloader

> Download any Scribd document as a **searchable, editable PDF** — free, no signup, no browser extensions.

A clean, fast, and privacy-first tool to preview and download publicly accessible Scribd documents as PDFs or page images. Built with Next.js 16, TypeScript, and pdf-lib.

![Scribd Downloader](https://img.shields.io/badge/Next.js-16-black) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue) ![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-38bdf8) ![License](https://img.shields.io/badge/License-MIT-green)

---

## ✨ Features

### 📄 Download Any Document Type

| Document Type | How It Works | Output Quality |
|---|---|---|
| **Scanned PDFs** (CamScanner, photos) | Downloads full-page images from Scribd's CDN | ✅ Faithful to original — looks identical |
| **Text-based PDFs** (typed exams, articles) | Extracts positioned text + diagrams from JSONP | ✅ Editable, selectable, searchable text |
| **Mixed PDFs** (text + diagrams) | Text overlaid on faded diagram images | ✅ Text is primary, diagrams visible at 25% opacity |

### 🚀 Key Capabilities

- **📄 Editable PDFs** — text-based documents produce PDFs where you can select, copy, and search text
- **🖼️ Image-based PDFs** — scanned documents are downloaded as high-res page images
- **🎨 Positioned text rendering** — preserves the original document layout using exact pixel coordinates
- **📊 Diagram preservation** — tables, graphs, and figures embedded at their correct positions
- **📦 ZIP download** — get all page images as individual files
- **📝 TXT download** — extract plain text from text-based documents
- **⭐ Favorites & search** — star important docs, search your download history
- **⌨️ Keyboard shortcuts** — Ctrl+K to focus, Ctrl+Enter to fetch, Esc to close
- **🌙 Dark/light mode** — beautiful in both themes
- **📱 Mobile support** — works on iOS, Android, and desktop

### 🔒 Privacy First

- No data stored on servers permanently
- Documents are processed on demand
- Your browsing history stays in your browser's local database
- No tracking, no analytics, no ads

---

## 🛠️ How It Works

### Architecture

```
User's Browser (passes Cloudflare)
    ↓
Bookmarklet extracts page HTML
    ↓
Server parses HTML → finds JSONP URLs
    ↓
Downloads page images + text from Scribd CDN
    ↓
Generates PDF with pdf-lib (text + diagrams)
    ↓
User downloads the PDF
```

### Why a bookmarklet?

Scribd uses Cloudflare's managed challenge to block all server-side access. No free server can bypass this — it requires JavaScript execution in a real browser.

The bookmarklet runs **in the user's browser** (which passes Cloudflare naturally), extracts the page data, and sends it to our server for PDF generation. This is the only free, permanent solution.

### Text-based document rendering

Scribd splits text documents into two layers:
1. **Image layer** — diagrams, tables, borders (as `.jpg` files)
2. **Text layer** — positioned text spans with exact `(left, top, fontSize, color)` coordinates (in JSONP files)

Our server:
1. Parses the JSONP to extract text spans with their parent div's font-size
2. Auto-detects the coordinate scale factor (text coordinates are ~4.4× larger than page dimensions)
3. Draws diagram images at their exact positions (25% opacity)
4. Draws text on top at scaled positions (selectable, editable)

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ or Bun
- npm/bun package manager

### Installation

```bash
# Clone the repository
git clone https://github.com/Qadyyr/scrapd.git
cd scrapd

# Install dependencies
bun install

# Set up the database
bun run db:push

# Start the dev server
bun run dev
```

Visit `http://localhost:3000` in your browser.

### Deploy to Vercel

1. Fork this repository
2. Import it into [Vercel](https://vercel.com)
3. Deploy — no environment variables needed!

---

## 📖 How to Use

### Desktop

1. **Drag** the "Extract Scribd" button to your bookmarks bar
2. **Open** any Scribd document page
3. **Click** "Extract Scribd" from your bookmarks bar
4. A **new tab** opens with the download ready — click "Download PDF"

### Mobile (iOS/Android)

1. **Copy** the bookmarklet code from the homepage
2. **Bookmark** any page, then **edit** the bookmark's URL → paste the code
3. Name it **"extract"**
4. On a Scribd page → **tap the address bar** → type **"extract"** → tap the suggestion
5. A new tab opens with the download ready

---

## 🧰 Tech Stack

| Technology | Purpose |
|---|---|
| **Next.js 16** | App Router, API routes, SSR |
| **TypeScript 5** | Type safety throughout |
| **Tailwind CSS 4** | Styling + responsive design |
| **shadcn/ui** | UI components (New York style) |
| **pdf-lib** | Client-side + server-side PDF generation |
| **JSZip** | ZIP archive creation |
| **cheerio** | HTML parsing for text extraction |
| **Prisma ORM** | Download history (SQLite) |
| **Framer Motion** | Animations |
| **z-ai-web-dev-sdk** | Cloudflare bypass (sandbox only) |

---

## 📁 Project Structure

```
├── src/
│   ├── app/
│   │   ├── page.tsx              # Main UI (hero, document card, history)
│   │   ├── layout.tsx            # Root layout with theme provider
│   │   └── api/scribd/
│   │       ├── info/route.ts     # Fetch document info (z-ai / Cloudflare Worker)
│   │       ├── extract-full/     # Bookmarklet endpoint (receives HTML, returns extract ID)
│   │       ├── download/         # Generate PDF (image + text + diagrams)
│   │       ├── download-zip/     # Generate ZIP archive
│   │       ├── download-txt/     # Generate plain text file
│   │       ├── history/          # Download history CRUD
│   │       └── stats/             # Usage statistics
│   ├── lib/
│   │   ├── scribd.ts             # Scribd URL parsing, HTML fetching, text extraction
│   │   └── db.ts                 # Prisma client
│   └── components/
│       ├── theme-provider.tsx     # Dark/light mode
│       └── animated-counter.tsx  # Stats animation
├── prisma/
│   └── schema.prisma              # DownloadHistory model
├── public/
│   └── mobile-setup.html          # Mobile setup guide
└── cloudflare-worker/
    ├── worker.js                  # Optional Cloudflare Worker proxy
    └── README.md                 # Worker setup guide
```

---

## 🔧 Configuration

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | SQLite database path (default: `file:./db/custom.db`) |
| `CF_WORKER_URL` | ❌ | Cloudflare Worker URL (for Vercel deployments) |
| `ZAI_BASE_URL` | ❌ | z-ai SDK base URL (sandbox only) |
| `ZAI_API_KEY` | ❌ | z-ai SDK API key (sandbox only) |

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## ⚠️ Legal Notice

This tool is intended for downloading **publicly accessible documents** that you have the right to download. Please respect Scribd's Terms of Service and all applicable copyright laws. Do not download or distribute copyrighted material without permission from the rights holder.

This project is not affiliated with Scribd, Inc. All trademarks belong to their respective owners.

---

## 📊 Limitations

- **Cloudflare protection**: Scribd blocks all server-side access. The bookmarklet is required to bypass this from the user's browser.
- **403 pages**: Some pages may return 403 on the image URL. These are rendered as text-only pages.
- **Font rendering**: Uses Helvetica (pdf-lib StandardFonts). Original fonts are not preserved.
- **WinAnsi encoding**: Special Unicode characters are sanitized to ASCII equivalents.

---

## 📝 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- [pdf-lib](https://github.com/Hopding/pdf-lib) — PDF generation library
- [cheerio](https://github.com/cheeriojs/cheerio) — HTML parsing
- [shadcn/ui](https://ui.shadcn.com/) — UI components
- [JSZip](https://github.com/Stuk/jszip) — ZIP archive creation
- [Framer Motion](https://www.framer.com/motion/) — Animations

---

<div align="center">

**[⬆ Back to top](#-scribd-downloader)**

Made with ❤️ using Next.js, TypeScript, and Tailwind CSS

</div>
