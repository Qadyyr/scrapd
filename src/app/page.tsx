'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Download,
  Link2,
  FileText,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Trash2,
  Eye,
  FileImage,
  ShieldCheck,
  Zap,
  Globe,
  Sparkles,
  ChevronDown,
  RefreshCw,
  Copy,
  Check,
  X,
  ImageIcon,
  Loader,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ThemeToggle } from '@/components/theme-toggle'
import { toast } from 'sonner'

// ---------- Types ----------
interface DocPage {
  index: number
  url: string
  width?: number
  height?: number
}

interface DocInfo {
  docId: string
  title: string
  author: string | null
  description: string | null
  pageCount: number
  thumbnail: string | null
  pages: DocPage[]
  sourceUrl: string
  isDemo?: boolean
  warning?: string
}

interface HistoryItem {
  id: string
  url: string
  docId: string
  title: string
  author: string | null
  pageCount: number
  thumbnail: string | null
  format: string
  status: string
  fileSize: number
  createdAt: string
}

// ---------- Constants ----------
const SAMPLE_URLS = [
  'https://www.scribd.com/document/123456789/sample-document',
]

const FAQS = [
  {
    q: 'How does the Scribd downloader work?',
    a: 'Paste a Scribd document URL into the input box and click "Fetch Document". The tool retrieves the publicly accessible page images from the document and lets you preview them. You can then download all pages as a single PDF or save individual page images.',
  },
  {
    q: 'Is it legal to download from Scribd?',
    a: 'This tool is intended for downloading documents that are publicly accessible and for which you have the right to download. Always respect Scribd\'s Terms of Service and applicable copyright laws. Do not download copyrighted material without permission.',
  },
  {
    q: 'What formats can I download?',
    a: 'You can download the entire document as a PDF file, or download individual page images (JPEG/PNG). The PDF combines all pages in order for easy reading and sharing.',
  },
  {
    q: 'Why does a document fail to load?',
    a: 'Some documents on Scribd are behind a paywall, require login, or use protected rendering that prevents image extraction. If a document cannot be fetched, you will see an error message with details. Try a different document that is publicly viewable.',
  },
  {
    q: 'Is my download history saved?',
    a: 'Yes, your download history is stored locally in the app\'s database so you can revisit and re-download documents. You can clear the history at any time using the "Clear History" button.',
  },
  {
    q: 'Does this work on mobile?',
    a: 'Absolutely. The interface is fully responsive and works on phones, tablets, and desktops. You can paste URLs, preview pages, and download documents from any device.',
  },
]

// ---------- Main Component ----------
export default function Home() {
  const [url, setUrl] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [docInfo, setDocInfo] = React.useState<DocInfo | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [downloading, setDownloading] = React.useState(false)
  const [downloadProgress, setDownloadProgress] = React.useState(0)
  const [history, setHistory] = React.useState<HistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = React.useState(true)
  const [previewPage, setPreviewPage] = React.useState<DocPage | null>(null)

  // Load history on mount
  React.useEffect(() => {
    loadHistory()
  }, [])

  async function loadHistory() {
    try {
      setHistoryLoading(true)
      const res = await fetch('/api/scribd/history')
      if (res.ok) {
        const data = await res.json()
        setHistory(data.items || [])
      }
    } catch {
      // silent fail
    } finally {
      setHistoryLoading(false)
    }
  }

  async function handleFetch(e?: React.FormEvent) {
    e?.preventDefault()
    if (!url.trim()) {
      toast.error('Please enter a Scribd URL')
      return
    }
    if (!url.includes('scribd.com')) {
      toast.error('Please enter a valid Scribd URL')
      return
    }

    setLoading(true)
    setError(null)
    setDocInfo(null)
    setDownloadProgress(0)

    try {
      const res = await fetch('/api/scribd/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch document')
      }

      setDocInfo(data)
      if (data.isDemo) {
        toast.info('Showing demo data — live fetch was blocked', {
          description: 'Try the download button to see the full flow.',
        })
      } else if (data.warning) {
        toast.warning(data.warning)
      } else {
        toast.success(`Found "${data.title}" with ${data.pageCount} pages`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch document'
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  async function handleDemo() {
    const demoUrl = 'https://www.scribd.com/document/391715321/sample-document'
    setUrl(demoUrl)
    setLoading(true)
    setError(null)
    setDocInfo(null)
    setDownloadProgress(0)

    try {
      const res = await fetch('/api/scribd/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: demoUrl, demo: true }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load demo')
      }
      setDocInfo(data)
      toast.info('Demo mode loaded', {
        description: 'Try downloading the sample PDF to see the full flow.',
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load demo'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  async function handleDownloadPdf() {
    if (!docInfo || docInfo.pages.length === 0) return

    setDownloading(true)
    setDownloadProgress(0)

    try {
      const res = await fetch('/api/scribd/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docId: docInfo.docId,
          title: docInfo.title,
          author: docInfo.author,
          pages: docInfo.pages,
          sourceUrl: docInfo.sourceUrl,
          thumbnail: docInfo.thumbnail,
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Download failed')
      }

      // Track progress via content-length if available
      const contentLength = res.headers.get('content-length')
      if (contentLength && res.body) {
        const reader = res.body.getReader()
        const chunks: Uint8Array[] = []
        let received = 0
        const total = parseInt(contentLength, 10)
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (value) {
            chunks.push(value)
            received += value.length
            setDownloadProgress(Math.min(100, Math.round((received / total) * 100)))
          }
        }
        const blob = new Blob(chunks as BlobPart[], { type: 'application/pdf' })
        triggerDownload(blob, `${sanitize(docInfo.title)}.pdf`)
      } else {
        const blob = await res.blob()
        setDownloadProgress(100)
        triggerDownload(blob, `${sanitize(docInfo.title)}.pdf`)
      }

      toast.success('PDF downloaded successfully!')
      // Refresh history
      loadHistory()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Download failed'
      toast.error(msg)
    } finally {
      setDownloading(false)
      setTimeout(() => setDownloadProgress(0), 1500)
    }
  }

  function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function downloadPageImage(page: DocPage) {
    try {
      const res = await fetch(page.url)
      const blob = await res.blob()
      const ext = blob.type.includes('png') ? 'png' : 'jpg'
      triggerDownload(blob, `${sanitize(docInfo?.title || 'page')}-page-${page.index + 1}.${ext}`)
      toast.success(`Page ${page.index + 1} downloaded`)
    } catch {
      toast.error('Failed to download page image')
    }
  }

  async function deleteHistoryItem(id: string) {
    try {
      await fetch(`/api/scribd/history?id=${id}`, { method: 'DELETE' })
      setHistory((prev) => prev.filter((h) => h.id !== id))
      toast.success('Removed from history')
    } catch {
      toast.error('Failed to delete')
    }
  }

  async function clearHistory() {
    try {
      await fetch('/api/scribd/history', { method: 'DELETE' })
      setHistory([])
      toast.success('History cleared')
    } catch {
      toast.error('Failed to clear history')
    }
  }

  function sanitize(name: string): string {
    return name.replace(/[^a-z0-9-_ ]/gi, '').trim().slice(0, 80) || 'document'
  }

  function formatBytes(bytes: number): string {
    if (!bytes) return '—'
    const units = ['B', 'KB', 'MB', 'GB']
    let i = 0
    let n = bytes
    while (n >= 1024 && i < units.length - 1) {
      n /= 1024
      i++
    }
    return `${n.toFixed(1)} ${units[i]}`
  }

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function copyUrl() {
    if (url) {
      navigator.clipboard.writeText(url)
      toast.success('URL copied to clipboard')
    }
  }

  function loadFromHistory(item: HistoryItem) {
    setUrl(item.url)
    handleFetch()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-border/60 bg-background/80 backdrop-blur-lg">
        <div className="container mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Download className="h-5 w-5" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="font-bold text-base tracking-tight">Scribd Downloader</span>
              <span className="text-[10px] text-muted-foreground hidden sm:block">Preview & download documents</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="hidden md:flex gap-1.5">
              <Sparkles className="h-3 w-3" />
              Free
            </Badge>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 grid-bg opacity-50" />
          <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
          <div className="container relative mx-auto max-w-4xl px-4 pt-16 pb-10 sm:pt-24 sm:pb-14 text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <Badge variant="secondary" className="mb-5 gap-1.5 px-3 py-1">
                <Zap className="h-3.5 w-3.5 text-primary" />
                Fast • Secure • No signup required
              </Badge>
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-4">
                Download Scribd documents
                <br />
                <span className="gradient-text">as PDF in seconds</span>
              </h1>
              <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
                Paste any Scribd document link below to preview its pages and download the
                full document as a PDF or individual images. Clean, fast, and free.
              </p>
            </motion.div>

            {/* URL Input Form */}
            <motion.form
              onSubmit={handleFetch}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="mx-auto max-w-2xl"
            >
              <div className="relative flex flex-col sm:flex-row gap-2 p-2 bg-card border border-border rounded-2xl shadow-lg shadow-primary/5">
                <div className="relative flex-1">
                  <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    type="text"
                    placeholder="https://www.scribd.com/document/..."
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="pl-10 pr-10 h-12 border-0 bg-transparent text-base focus-visible:ring-0 focus-visible:ring-offset-0"
                    disabled={loading}
                  />
                  {url && (
                    <button
                      type="button"
                      onClick={copyUrl}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      aria-label="Copy URL"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <Button
                  type="submit"
                  size="lg"
                  disabled={loading}
                  className="h-12 px-6 rounded-xl text-base font-semibold"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Fetching...
                    </>
                  ) : (
                    <>
                      <Eye className="h-4 w-4" />
                      Fetch Document
                    </>
                  )}
                </Button>
              </div>
            </motion.form>

            {/* Trust indicators */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-6 text-xs text-muted-foreground"
            >
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                No data stored on servers
              </span>
              <span className="flex items-center gap-1.5">
                <Zap className="h-3.5 w-3.5 text-primary" />
                Instant preview
              </span>
              <span className="flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5 text-primary" />
                Works on any device
              </span>
            </motion.div>

            {/* Demo button */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="mt-4"
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDemo}
                disabled={loading}
                className="text-muted-foreground gap-1.5"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Try with sample data
              </Button>
            </motion.div>
          </div>
        </section>

        {/* Error Display */}
        <div className="container mx-auto max-w-4xl px-4">
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-6"
              >
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Could not fetch document</AlertTitle>
                  <AlertDescription className="flex items-start justify-between gap-3">
                    <span>{error}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setError(null)}
                      className="shrink-0"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </AlertDescription>
                </Alert>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Loading Skeleton */}
        <div className="container mx-auto max-w-5xl px-4">
          <AnimatePresence>
            {loading && !docInfo && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-6"
              >
                <div className="flex flex-col sm:flex-row gap-6">
                  <Skeleton className="w-full sm:w-48 h-64 rounded-xl" />
                  <div className="flex-1 space-y-3">
                    <Skeleton className="h-8 w-3/4" />
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                    <div className="flex gap-2 pt-2">
                      <Skeleton className="h-10 w-32" />
                      <Skeleton className="h-10 w-32" />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {Array.from({ length: 12 }).map((_, i) => (
                    <Skeleton key={i} className="aspect-[3/4] rounded-lg" />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Document Info + Preview */}
        <div className="container mx-auto max-w-5xl px-4">
          <AnimatePresence>
            {docInfo && !loading && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4 }}
                className="space-y-8"
              >
                {/* Demo / Warning Banner */}
                {(docInfo.isDemo || docInfo.warning) && (
                  <Alert
                    className={
                      docInfo.isDemo
                        ? 'border-amber-500/40 bg-amber-500/5'
                        : 'border-primary/40 bg-primary/5'
                    }
                  >
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>
                      {docInfo.isDemo ? 'Demo Mode' : 'Notice'}
                    </AlertTitle>
                    <AlertDescription>{docInfo.warning}</AlertDescription>
                  </Alert>
                )}

                {/* Document Info Card */}
                <Card className="overflow-hidden border-border/60 shadow-lg shadow-primary/5">
                  <div className="flex flex-col sm:flex-row">
                    {/* Thumbnail */}
                    <div className="sm:w-56 shrink-0 bg-muted/50 p-4 flex items-center justify-center">
                      {docInfo.thumbnail ? (
                        <img
                          src={docInfo.thumbnail}
                          alt={docInfo.title}
                          className="max-h-72 w-auto rounded-lg shadow-md object-contain"
                        />
                      ) : (
                        <div className="flex h-72 w-full items-center justify-center rounded-lg bg-muted">
                          <FileText className="h-16 w-16 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    {/* Info */}
                    <div className="flex-1 p-6 flex flex-col">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex flex-wrap gap-2">
                          <Badge className="gap-1">
                            <FileText className="h-3 w-3" />
                            {docInfo.pageCount} pages
                          </Badge>
                          {docInfo.author && (
                            <Badge variant="outline">
                              {docInfo.author}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <h2 className="text-2xl font-bold tracking-tight mb-2 leading-tight">
                        {docInfo.title}
                      </h2>
                      {docInfo.description && (
                        <p className="text-sm text-muted-foreground line-clamp-3 mb-4">
                          {docInfo.description}
                        </p>
                      )}
                      <div className="text-xs text-muted-foreground mb-4 truncate">
                        Source: {docInfo.sourceUrl}
                      </div>
                      <div className="mt-auto flex flex-wrap gap-2">
                        <Button
                          onClick={handleDownloadPdf}
                          disabled={downloading || docInfo.pages.length === 0}
                          className="gap-2"
                          size="lg"
                        >
                          {downloading ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Generating PDF...
                            </>
                          ) : (
                            <>
                              <Download className="h-4 w-4" />
                              Download PDF
                            </>
                          )}
                        </Button>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="lg"
                                onClick={() => window.open(docInfo.sourceUrl, '_blank')}
                                className="gap-2"
                              >
                                <Globe className="h-4 w-4" />
                                Open Source
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Open the original Scribd page</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>

                      {/* Download Progress */}
                      <AnimatePresence>
                        {downloading && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mt-4"
                          >
                            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                              <span>Generating your PDF...</span>
                              <span>{downloadProgress}%</span>
                            </div>
                            <Progress value={downloadProgress} className="h-1.5" />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </Card>

                {/* Page Preview Grid */}
                {docInfo.pages.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold flex items-center gap-2">
                        <ImageIcon className="h-5 w-5 text-primary" />
                        Page Preview
                        <Badge variant="secondary">{docInfo.pages.length} pages</Badge>
                      </h3>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 max-h-[600px] overflow-y-auto scrollbar-custom p-1">
                      {docInfo.pages.map((page) => (
                        <motion.div
                          key={page.index}
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ duration: 0.2, delay: Math.min(page.index * 0.02, 0.5) }}
                          className="group relative aspect-[3/4] rounded-lg overflow-hidden border border-border bg-muted cursor-pointer"
                          onClick={() => setPreviewPage(page)}
                        >
                          <img
                            src={page.url}
                            alt={`Page ${page.index + 1}`}
                            className="h-full w-full object-contain transition-transform group-hover:scale-105"
                            loading="lazy"
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex flex-col items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                            <span className="text-white text-xs font-medium bg-black/50 px-2 py-0.5 rounded">
                              Page {page.index + 1}
                            </span>
                            <div className="flex gap-1.5">
                              <Button
                                size="icon"
                                variant="secondary"
                                className="h-8 w-8"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setPreviewPage(page)
                                }}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="secondary"
                                className="h-8 w-8"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  downloadPageImage(page)
                                }}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1">
                            <span className="text-white text-[10px] font-medium">
                              Page {page.index + 1}
                            </span>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Download History */}
        <section className="container mx-auto max-w-5xl px-4 py-12">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              Download History
              {history.length > 0 && (
                <Badge variant="secondary">{history.length}</Badge>
              )}
            </h3>
            {history.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearHistory}
                className="text-muted-foreground hover:text-destructive gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear All
              </Button>
            )}
          </div>

          {historyLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          ) : history.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted mb-3">
                  <Clock className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium mb-1">No downloads yet</p>
                <p className="text-xs text-muted-foreground max-w-xs">
                  Your downloaded documents will appear here for easy access.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto scrollbar-custom pr-1">
              {history.map((item) => (
                <Card key={item.id} className="border-border/60 hover:shadow-md transition-shadow">
                  <CardContent className="flex items-center gap-3 p-3">
                    <div className="h-16 w-12 shrink-0 rounded bg-muted overflow-hidden flex items-center justify-center">
                      {item.thumbnail ? (
                        <img
                          src={item.thumbnail}
                          alt={item.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <FileText className="h-6 w-6 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.title}</p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
                        <span className="flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          {item.pageCount} pages
                        </span>
                        <span className="flex items-center gap-1">
                          <Download className="h-3 w-3" />
                          {formatBytes(item.fileSize)}
                        </span>
                        <span>{formatDate(item.createdAt)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => loadFromHistory(item)}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteHistoryItem(item.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Features Section */}
        <section className="container mx-auto max-w-5xl px-4 py-12">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">
              Why use our downloader?
            </h2>
            <p className="text-sm text-muted-foreground">
              Built for speed, privacy, and ease of use.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                icon: Zap,
                title: 'Lightning Fast',
                desc: 'Fetch and generate PDFs in seconds with our optimized pipeline.',
              },
              {
                icon: ShieldCheck,
                title: 'Privacy First',
                desc: 'Documents are processed on demand — nothing is permanently stored.',
              },
              {
                icon: Eye,
                title: 'Page Preview',
                desc: 'See every page before downloading. Pick what you need.',
              },
              {
                icon: FileImage,
                title: 'Multiple Formats',
                desc: 'Download as a single PDF or grab individual page images.',
              },
              {
                icon: Globe,
                title: 'Fully Responsive',
                desc: 'Works beautifully on desktop, tablet, and mobile devices.',
              },
              {
                icon: Clock,
                title: 'Download History',
                desc: 'Your past downloads are saved so you can revisit them anytime.',
              },
            ].map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
              >
                <Card className="h-full border-border/60 hover:border-primary/40 hover:shadow-md transition-all">
                  <CardContent className="p-5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-3">
                      <f.icon className="h-5 w-5" />
                    </div>
                    <h3 className="font-semibold mb-1">{f.title}</h3>
                    <p className="text-sm text-muted-foreground">{f.desc}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </section>

        {/* FAQ Section */}
        <section className="container mx-auto max-w-3xl px-4 py-12">
          <div className="text-center mb-8">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2">
              Frequently Asked Questions
            </h2>
            <p className="text-sm text-muted-foreground">
              Everything you need to know about the downloader.
            </p>
          </div>
          <Card className="border-border/60">
            <CardContent className="p-2">
              <Accordion type="single" collapsible className="w-full">
                {FAQS.map((faq, i) => (
                  <AccordionItem key={i} value={`item-${i}`}>
                    <AccordionTrigger className="text-left px-4 hover:no-underline">
                      {faq.q}
                    </AccordionTrigger>
                    <AccordionContent className="px-4 text-muted-foreground">
                      {faq.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        </section>

        {/* Disclaimer */}
        <section className="container mx-auto max-w-3xl px-4 py-8">
          <Alert>
            <ShieldCheck className="h-4 w-4" />
            <AlertTitle>Usage & Copyright Notice</AlertTitle>
            <AlertDescription>
              This tool is intended for downloading publicly accessible documents that you
              have the right to access. Please respect Scribd's Terms of Service and all
              applicable copyright laws. Do not download or distribute copyrighted material
              without permission from the rights holder.
            </AlertDescription>
          </Alert>
        </section>
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-border/60 bg-muted/30">
        <div className="container mx-auto max-w-6xl px-4 py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Download className="h-4 w-4" />
              </div>
              <div className="flex flex-col leading-none">
                <span className="font-semibold text-sm">Scribd Downloader</span>
                <span className="text-[10px] text-muted-foreground">
                  Preview & download documents as PDF
                </span>
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>Built with Next.js & TypeScript</span>
              <Separator orientation="vertical" className="h-4" />
              <span>For personal & educational use</span>
            </div>
          </div>
          <Separator className="my-5" />
          <p className="text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} Scribd Downloader. Not affiliated with Scribd, Inc.
            All trademarks belong to their respective owners.
          </p>
        </div>
      </footer>

      {/* Page Preview Modal */}
      <AnimatePresence>
        {previewPage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={() => setPreviewPage(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative max-w-4xl max-h-[90vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <Badge variant="secondary" className="gap-1.5">
                  <FileText className="h-3 w-3" />
                  Page {previewPage.index + 1} of {docInfo?.pageCount}
                </Badge>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="gap-1.5"
                    onClick={() => downloadPageImage(previewPage)}
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </Button>
                  <Button
                    size="icon"
                    variant="secondary"
                    className="h-8 w-8"
                    onClick={() => setPreviewPage(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="overflow-auto scrollbar-custom bg-white rounded-lg">
                <img
                  src={previewPage.url}
                  alt={`Page ${previewPage.index + 1}`}
                  className="w-auto h-auto max-w-full max-h-[80vh] mx-auto"
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
