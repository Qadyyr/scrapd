'use client'

import * as React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Download,
  Link2,
  FileText,
  Loader2,
  AlertCircle,
  Clock,
  Trash2,
  Eye,
  FileImage,
  ShieldCheck,
  Zap,
  Globe,
  Sparkles,
  RefreshCw,
  Copy,
  X,
  ImageIcon,
  Star,
  Search,
  FileArchive,
  TrendingUp,
  Calendar,
  Keyboard,
  ListChecks,
  Package,
  CheckCircle2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
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
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { ThemeToggle } from '@/components/theme-toggle'
import { useClipboardPaste, useKeyboardShortcuts } from '@/hooks/use-shortcuts'
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
  textContent?: string
  pageImages?: string[]
  isScanned?: boolean
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
  favorite: boolean
  createdAt: string
}

// ---------- Constants ----------
const FAQS = [
  {
    q: 'How does the Scribd downloader work?',
    a: 'Paste a Scribd document URL into the input box and click "Fetch Document". The tool retrieves the publicly accessible page images from the document and lets you preview them. You can then download all pages as a single PDF, a ZIP archive of images, or save individual page images.',
  },
  {
    q: 'Is it legal to download from Scribd?',
    a: 'This tool is intended for downloading documents that are publicly accessible and for which you have the right to download. Always respect Scribd\'s Terms of Service and applicable copyright laws. Do not download copyrighted material without permission.',
  },
  {
    q: 'What formats can I download?',
    a: 'You can download the entire document as a PDF file (combining all pages in order) or as a ZIP archive containing individual page images (JPEG/PNG). You can also download single page images directly from the preview grid.',
  },
  {
    q: 'Can I download specific pages only?',
    a: 'Yes! Use the "Page range" field in the document info card. Enter ranges like "1-5" or comma-separated values like "1,3,5-8" to download only the pages you need.',
  },
  {
    q: 'Why does a document fail to load?',
    a: 'Some documents on Scribd are behind a paywall, require login, or use protected rendering that prevents image extraction. Scribd also uses Cloudflare anti-bot protection that may block server-side requests. If a document cannot be fetched, the app falls back to demo data so you can still explore the download flow.',
  },
  {
    q: 'Are there keyboard shortcuts?',
    a: 'Yes! Press Ctrl/Cmd+K to focus the URL input, Ctrl/Cmd+Enter to fetch the document, and Escape to close the preview modal. You can also paste a Scribd URL anywhere on the page and it will be auto-filled.',
  },
  {
    q: 'Is my download history saved?',
    a: 'Yes, your download history is stored locally so you can revisit, re-download, and favorite documents. You can search, filter favorites, export as JSON, or clear the history at any time.',
  },
  {
    q: 'Does this work on mobile?',
    a: 'Absolutely. The interface is fully responsive and works on phones, tablets, and desktops. You can paste URLs, preview pages, and download documents from any device.',
  },
]

const SHORTCUTS = [
  { keys: 'Ctrl/⌘ + K', desc: 'Focus URL input' },
  { keys: 'Ctrl/⌘ + Enter', desc: 'Fetch document' },
  { keys: 'Ctrl/⌘ + D', desc: 'Load demo data' },
  { keys: 'Esc', desc: 'Close preview modal' },
]

// ---------- Main Component ----------
export default function Home() {
  const [url, setUrl] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [docInfo, setDocInfo] = React.useState<DocInfo | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [downloading, setDownloading] = React.useState<'pdf' | 'zip' | 'txt' | null>(null)
  const [downloadProgress, setDownloadProgress] = React.useState(0)
  const [history, setHistory] = React.useState<HistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = React.useState(true)
  const [previewPage, setPreviewPage] = React.useState<DocPage | null>(null)
  const [pageRange, setPageRange] = React.useState('')
  const [searchQuery, setSearchQuery] = React.useState('')
  const [favoritesOnly, setFavoritesOnly] = React.useState(false)
  const [showShortcuts, setShowShortcuts] = React.useState(false)
  const [showExtractModal, setShowExtractModal] = React.useState(false)
  const [extracting, setExtracting] = React.useState(false)
  const [needsBrowserExtract, setNeedsBrowserExtract] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Load history on mount
  React.useEffect(() => {
    loadHistory()

    // Check if we're returning from a bookmarklet extraction
    const urlParams = new URLSearchParams(window.location.search)
    const fromBookmarklet = urlParams.get('from_bookmarklet')

    // Check for extracted data from the bookmarklet (via window.name or URL hash)
    if (typeof window !== 'undefined') {
      // Method 1: window.name with full HTML (new simple bookmarklet)
      if (window.name && window.name.startsWith('scribd_full:')) {
        try {
          const data = JSON.parse(window.name.slice('scribd_full:'.length))
          if (data.html) {
            // Show processing indicator
            setExtracting(true)
            toast.info('Processing extracted data...', { description: 'Extracting page images from the HTML' })
            // Clean the URL
            window.history.replaceState(null, '', window.location.pathname)
            // Send full HTML to our extract-full endpoint
            fetch('/api/scribd/extract-full', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data),
            })
              .then((r) => r.json())
              .then((result) => {
                if (result.success) {
                  setDocInfo(result)
                  setNeedsBrowserExtract(false)
                  setUrl(data.url || '')
                  toast.success(`✅ Extracted "${result.title}" with ${result.pageImages?.length || 0} pages! Click Download below.`)
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                } else {
                  toast.error(result.error || 'Extraction failed')
                  if (result.debug) {
                    console.log('Extract debug:', result.debug)
                  }
                }
              })
              .catch(() => toast.error('Failed to process extracted data'))
              .finally(() => setExtracting(false))
            window.name = ''
          }
        } catch {
          window.name = ''
        }
      }

      // Method 2: window.name with pre-extracted URLs (old bookmarklet)
      else if (window.name && window.name.startsWith('scribd_extract:')) {
        try {
          const data = JSON.parse(window.name.slice('scribd_extract:'.length))
          if (data.urls && data.urls.length > 0) {
            fetch('/api/scribd/extract', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data),
            })
              .then((r) => r.json())
              .then((result) => {
                if (result.success) {
                  setDocInfo(result)
                  setNeedsBrowserExtract(false)
                  setUrl(data.sourceUrl || '')
                  toast.success(`Extracted "${result.title}" with ${result.pageImages?.length || 0} pages!`)
                } else {
                  toast.error(result.error || 'Extraction failed')
                }
              })
              .catch(() => toast.error('Failed to process extracted data'))
            window.name = ''
          }
        } catch {
          window.name = ''
        }
      }

      // Method 3: URL hash (fallback from GET redirect)
      if (window.location.hash.startsWith('#extracted=')) {
        const encoded = window.location.hash.slice('#extracted='.length)
        try {
          const data = JSON.parse(decodeURIComponent(encoded))
          if (data.success) {
            setDocInfo(data)
            setNeedsBrowserExtract(false)
            setUrl(data.sourceUrl || '')
            toast.success(`Extracted "${data.title}" with ${data.pageImages?.length || 0} pages!`)
          }
        } catch {
          // invalid hash data
        }
        window.history.replaceState(null, '', window.location.pathname)
      }
    }
  }, [])

  // Generate the bookmarklet href — DEAD SIMPLE version
  // Just grabs the entire page HTML and sends it to our server.
  // Server does ALL the parsing. No regex in the bookmarklet = no bugs.
  // On success: stores result in window.name and REDIRECTS to the app.
  // (Can't use window.open — popup blockers block it)
  const bookmarkletHref = React.useMemo(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : ''
    const code = `javascript:void((function(){try{var h=document.documentElement.outerHTML;var d=JSON.stringify({html:h,title:document.title,url:location.href});var x=new XMLHttpRequest();x.open('POST','${origin}/api/scribd/extract-full',false);x.setRequestHeader('Content-Type','application/json');x.send(d);try{var r=JSON.parse(x.responseText);if(r.success){window.name='scribd_full:'+d;location.href='${origin}/?from_bookmarklet=1'}else{alert('Error: '+(r.error||'unknown')+(r.debug?('\\n\\nDebug: '+JSON.stringify(r.debug)):''))}}catch(e){alert('Parse error: '+e.message+'\\n\\nResponse: '+x.responseText.substring(0,200))}}catch(e){alert('Error: '+e.message)}})())`
    return code
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
      // silent
    } finally {
      setHistoryLoading(false)
    }
  }

  // Clipboard paste detection
  useClipboardPaste((text) => {
    setUrl(text)
    toast.success('Scribd URL pasted automatically', {
      description: 'Press Enter or click Fetch to continue.',
    })
    inputRef.current?.focus()
  })

  // Keyboard shortcuts
  useKeyboardShortcuts({
    'mod+k': () => {
      inputRef.current?.focus()
      inputRef.current?.select()
      toast.info('URL input focused')
    },
    'mod+enter': () => {
      if (url.trim() && !loading) handleFetch()
    },
    'mod+d': () => {
      if (!loading) handleDemo()
    },
    escape: () => {
      if (previewPage) setPreviewPage(null)
      else if (showShortcuts) setShowShortcuts(false)
      else if (url && document.activeElement === inputRef.current) {
        setUrl('')
        setDocInfo(null)
        setError(null)
      }
    },
  })

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
    setNeedsBrowserExtract(false)
    setDownloadProgress(0)
    setPageRange('')

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

      // Check if server needs browser-based extraction (Cloudflare blocked)
      if (data.needsBrowserExtract) {
        setNeedsBrowserExtract(true)
        setDocInfo(null)
        setLoading(false)
        return
      }

      setNeedsBrowserExtract(false)
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
    setPageRange('')

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
        description: 'Try downloading the sample PDF or ZIP to see the full flow.',
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load demo'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  // Handle extracted data from the bookmarklet (user's browser bypasses Cloudflare)
  async function handleExtractedData(data: {
    urls: string[]
    title: string
    sourceUrl: string
    thumbnail?: string
    author?: string
    description?: string
    pageCount?: number
  }) {
    setExtracting(true)
    setError(null)
    try {
      const res = await fetch('/api/scribd/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const result = await res.json()
      if (!res.ok) {
        throw new Error(result.error || 'Extraction failed')
      }
      setDocInfo(result)
      setNeedsBrowserExtract(false)
      setShowExtractModal(false)
      toast.success(`Extracted "${result.title}" with ${result.pageImages?.length || 0} pages!`)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Extraction failed'
      toast.error(msg)
    } finally {
      setExtracting(false)
    }
  }

  // Handle pasted HTML (fallback when bookmarklet isn't available)
  async function handlePastedHtml(html: string, sourceUrl: string) {
    setExtracting(true)
    setError(null)
    try {
      // Extract JSONP URLs from the pasted HTML
      const urlRegex = /contentUrl:\s*"(https:\/\/html\.scribdassets\.com\/[^"]+\.jsonp)"/g
      const urls: string[] = []
      let match
      while ((match = urlRegex.exec(html)) !== null) {
        urls.push(match[1])
      }

      // Extract metadata
      const titleMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]*)"/i)
      const descMatch = html.match(/<meta\s+property="og:description"\s+content="([^"]*)"/i)
      const thumbMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]*)"/i)
      const pcMatch = html.match(/"page_count"\s*:\s*(\d+)/)

      if (urls.length === 0) {
        throw new Error('No Scribd page URLs found in the pasted HTML. Make sure you copied the full page source.')
      }

      await handleExtractedData({
        urls,
        title: titleMatch ? titleMatch[1] : 'Scribd Document',
        sourceUrl: sourceUrl || url,
        thumbnail: thumbMatch ? thumbMatch[1] : undefined,
        description: descMatch ? descMatch[1] : undefined,
        pageCount: pcMatch ? parseInt(pcMatch[1], 10) : undefined,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Paste extraction failed'
      toast.error(msg)
    } finally {
      setExtracting(false)
    }
  }

  async function handleDownload(format: 'pdf' | 'zip' | 'txt') {
    if (!docInfo) return
    // Allow download if we have either page images OR text content
    if (!docInfo.textContent && docInfo.pages.length === 0 && !docInfo.pageImages) return

    setDownloading(format)
    setDownloadProgress(0)

    try {
      let endpoint: string
      if (format === 'pdf') endpoint = '/api/scribd/download'
      else if (format === 'zip') endpoint = '/api/scribd/download-zip'
      else endpoint = '/api/scribd/download-txt'

      // Use an AbortController with a generous 10-minute timeout for
      // large multi-page documents that take a while to generate.
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10 * 60 * 1000)

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docId: docInfo.docId,
          title: docInfo.title,
          author: docInfo.author,
          description: docInfo.description,
          pages: docInfo.pages,
          sourceUrl: docInfo.sourceUrl,
          thumbnail: docInfo.thumbnail,
          textContent: docInfo.textContent,
          pageImages: docInfo.pageImages,
          isScanned: docInfo.isScanned,
          pageRange: pageRange.trim() || undefined,
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Download failed')
      }

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
        const mimeType =
          format === 'pdf'
            ? 'application/pdf'
            : format === 'zip'
              ? 'application/zip'
              : 'text/plain'
        const blob = new Blob(chunks as BlobPart[], { type: mimeType })
        triggerDownload(blob, `${sanitize(docInfo.title)}.${format}`)
      } else {
        const blob = await res.blob()
        setDownloadProgress(100)
        triggerDownload(blob, `${sanitize(docInfo.title)}.${format}`)
      }

      toast.success(
        format === 'pdf'
          ? 'PDF downloaded successfully!'
          : format === 'zip'
            ? 'ZIP archive downloaded!'
            : 'Text file downloaded!'
      )
      loadHistory()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Download failed'
      toast.error(msg)
    } finally {
      setDownloading(null)
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

  async function toggleFavorite(item: HistoryItem) {
    const newFav = !item.favorite
    setHistory((prev) =>
      prev.map((h) => (h.id === item.id ? { ...h, favorite: newFav } : h))
    )
    try {
      await fetch(`/api/scribd/history?id=${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorite: newFav }),
      })
    } catch {
      // revert on failure
      setHistory((prev) =>
        prev.map((h) => (h.id === item.id ? { ...h, favorite: !newFav } : h))
      )
      toast.error('Failed to update favorite')
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

  function exportHistory() {
    if (history.length === 0) {
      toast.error('No history to export')
      return
    }
    const data = JSON.stringify(history, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    triggerDownload(blob, `scribd-history-${Date.now()}.json`)
    toast.success('History exported as JSON')
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

  // Filtered history based on search and favorites
  const filteredHistory = React.useMemo(() => {
    return history.filter((item) => {
      if (favoritesOnly && !item.favorite) return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        return (
          item.title.toLowerCase().includes(q) ||
          item.author?.toLowerCase().includes(q) ||
          item.docId.includes(q)
        )
      }
      return true
    })
  }, [history, favoritesOnly, searchQuery])

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Decorative background blobs */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute top-1/3 -right-40 h-96 w-96 rounded-full bg-accent/10 blur-3xl" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-40 w-full border-b border-border/60 bg-background/80 backdrop-blur-lg">
        <div className="container mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Download className="h-5 w-5" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="font-bold text-base tracking-tight">Scribd Downloader</span>
              <span className="text-[10px] text-muted-foreground hidden sm:block">
                Preview & download documents
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full"
                    onClick={() => setShowShortcuts((s) => !s)}
                  >
                    <Keyboard className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Keyboard shortcuts</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Badge variant="secondary" className="hidden md:flex gap-1.5">
              <Sparkles className="h-3 w-3" />
              Free
            </Badge>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex-1 relative">
        {/* Hero Section */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 grid-bg opacity-50" />
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
                full document as a PDF, a ZIP of images, or individual pages. Clean, fast,
                and free.
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
              <div className="relative flex flex-col sm:flex-row gap-2 p-2 bg-card border border-border rounded-2xl shadow-lg shadow-primary/5 focus-within:ring-2 focus-within:ring-primary/30 transition-all">
                <div className="relative flex-1">
                  <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    ref={inputRef}
                    type="text"
                    placeholder="https://www.scribd.com/document/..."
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="pl-10 pr-20 h-12 border-0 bg-transparent text-base focus-visible:ring-0 focus-visible:ring-offset-0"
                    disabled={loading}
                  />
                  {url && (
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={copyUrl}
                              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                              aria-label="Copy URL"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Copy URL</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => {
                                setUrl('')
                                setDocInfo(null)
                                setError(null)
                                inputRef.current?.focus()
                              }}
                              className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                              aria-label="Clear URL"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Clear (Esc)</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
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

            {/* Quick Download via Bookmarklet — the fastest way */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.35 }}
              className="mt-6 mx-auto max-w-xl"
            >
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-left">
                <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                  <Zap className="h-4 w-4 text-primary" />
                  Fastest method — no URL needed!
                </p>
                <p className="text-xs text-muted-foreground mb-3">
                  Drag this button to your bookmarks bar. Then on any Scribd page,
                  just click it — you'll be redirected here with the download ready.
                </p>
                <div className="flex items-center gap-3 flex-wrap">
                  <span
                    dangerouslySetInnerHTML={{
                      __html: `<a href="${bookmarkletHref}" class="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold cursor-grab hover:opacity-90 active:cursor-grabbing transition-opacity shadow-sm"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/></svg>Extract Scribd</a>`,
                    }}
                  />
                  <span className="text-xs text-muted-foreground">
                    ← drag to bookmarks bar
                  </span>
                </div>
              </div>
            </motion.div>

            {/* Demo + Shortcuts buttons */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="mt-4 flex items-center justify-center gap-2"
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
              <span className="text-muted-foreground/40">•</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowExtractModal(true)}
                className="text-muted-foreground gap-1.5"
              >
                <Zap className="h-3.5 w-3.5" />
                Manual Extract (bypasses Cloudflare)
              </Button>
              <span className="text-muted-foreground/40">•</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowShortcuts(true)}
                className="text-muted-foreground gap-1.5"
              >
                <Keyboard className="h-3.5 w-3.5" />
                Shortcuts
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
                className="mb-6 mt-6"
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

        {/* Browser Extract Panel — shows when server can't reach Scribd */}
        <div className="container mx-auto max-w-3xl px-4">
          <AnimatePresence>
            {needsBrowserExtract && !loading && !docInfo && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="mt-6"
              >
                <Card className="border-primary/30 shadow-lg">
                  <CardContent className="p-6">
                    <div className="flex items-start gap-3 mb-5">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                        <Zap className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg mb-1">
                          Your browser can access this document
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          Scribd blocks servers, but your browser passes automatically.
                          Set up the extractor once — then it's just 2 clicks every time.
                          Works on desktop and mobile!
                        </p>
                      </div>
                    </div>

                    {/* Bookmarklet install */}
                    <div className="space-y-4">
                      <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                        <p className="text-sm font-medium flex items-center gap-2">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">1</span>
                          One-time setup: drag this button to your bookmarks bar
                        </p>
                        <div className="flex items-center gap-3 pl-7">
                          <span
                            dangerouslySetInnerHTML={{
                              __html: `<a href="${bookmarkletHref}" class="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-semibold cursor-grab hover:opacity-90 active:cursor-grabbing transition-opacity shadow-sm"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/></svg>Extract Scribd</a>`,
                            }}
                          />
                          <span className="text-xs text-muted-foreground">
                            (Press <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-background border rounded">Ctrl/Cmd+Shift+B</kbd> to show bookmarks bar)
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground pl-7">
                          📱 <strong>Mobile:</strong> Long-press the button → "Copy link" →
                          paste into a new bookmark's URL field. Or copy this code:
                        </p>
                        <details className="pl-7">
                          <summary className="text-xs text-primary cursor-pointer">Show copyable code</summary>
                          <textarea
                            readOnly
                            className="w-full mt-2 p-2 text-[10px] font-mono rounded border border-border bg-background h-20 scrollbar-custom"
                            value={bookmarkletHref}
                            onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                          />
                        </details>
                      </div>

                      <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                        <p className="text-sm font-medium flex items-center gap-2">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">2</span>
                          Open the Scribd page and click the bookmarklet
                        </p>
                        <div className="pl-7 flex items-center gap-3">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            onClick={() => window.open(url, '_blank')}
                          >
                            <Globe className="h-3.5 w-3.5" />
                            Open Scribd page
                          </Button>
                          <span className="text-xs text-muted-foreground">
                            → click "Extract Scribd" from your bookmarks bar
                          </span>
                        </div>
                      </div>

                      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
                        <p className="text-xs text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          The bookmarklet extracts all page images and sends them here automatically.
                          You'll see the download button appear on this page!
                        </p>
                      </div>

                      {/* Paste HTML fallback (collapsible) */}
                      <details className="text-sm">
                        <summary className="cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
                          No bookmarks bar? Click here to paste page source instead →
                        </summary>
                        <div className="mt-3 space-y-3">
                          <p className="text-xs text-muted-foreground">
                            Open the Scribd page → press Ctrl+U → Ctrl+A → Ctrl+C → paste below:
                          </p>
                          <textarea
                            className="w-full h-32 p-3 text-xs font-mono rounded-md border border-border bg-background resize-y scrollbar-custom"
                            placeholder="Paste the page source here..."
                            id="paste-html-area"
                          />
                          <Button
                            size="sm"
                            className="gap-1.5"
                            onClick={() => {
                              const el = document.getElementById('paste-html-area') as HTMLTextAreaElement
                              if (el?.value?.trim()) {
                                handlePastedHtml(el.value, url)
                              } else {
                                toast.error('Paste the page source first')
                              }
                            }}
                            disabled={extracting}
                          >
                            {extracting ? (
                              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Extracting...</>
                            ) : (
                              <><Zap className="h-3.5 w-3.5" /> Extract from pasted HTML</>
                            )}
                          </Button>
                        </div>
                      </details>
                    </div>
                  </CardContent>
                </Card>
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
                className="space-y-6 mt-6"
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
                className="space-y-8 mt-6"
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
                          {docInfo.isScanned && (
                            <Badge className="gap-1 bg-violet-500/10 text-violet-600 dark:text-violet-400 hover:bg-violet-500/15">
                              <ImageIcon className="h-3 w-3" />
                              Scanned (image-based)
                            </Badge>
                          )}
                          {docInfo.author && (
                            <Badge variant="outline">{docInfo.author}</Badge>
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

                      {/* Page Range Input */}
                      <div className="mb-4">
                        <Label
                          htmlFor="page-range"
                          className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1.5"
                        >
                          <ListChecks className="h-3 w-3" />
                          Page range (optional)
                          <span className="text-muted-foreground/60">
                            e.g. 1-5 or 1,3,5-8
                          </span>
                        </Label>
                        <Input
                          id="page-range"
                          type="text"
                          placeholder="Leave empty for all pages"
                          value={pageRange}
                          onChange={(e) => setPageRange(e.target.value)}
                          className="h-9 text-sm max-w-xs"
                        />
                      </div>

                      <div className="mt-auto flex flex-wrap gap-2">
                        <Button
                          onClick={() => handleDownload('pdf')}
                          disabled={downloading !== null || (!docInfo.textContent && docInfo.pages.length === 0 && !docInfo.pageImages)}
                          className="gap-2"
                          size="lg"
                        >
                          {downloading === 'pdf' ? (
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
                        <Button
                          onClick={() => handleDownload('zip')}
                          disabled={downloading !== null || (!docInfo.textContent && docInfo.pages.length === 0 && !docInfo.pageImages)}
                          variant="outline"
                          className="gap-2"
                          size="lg"
                        >
                          {downloading === 'zip' ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Zipping...
                            </>
                          ) : (
                            <>
                              <FileArchive className="h-4 w-4" />
                              Download ZIP
                            </>
                          )}
                        </Button>
                        <Button
                          onClick={() => handleDownload('txt')}
                          disabled={downloading !== null || !docInfo.textContent}
                          variant="outline"
                          className="gap-2"
                          size="lg"
                        >
                          {downloading === 'txt' ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            <>
                              <FileText className="h-4 w-4" />
                              Download TXT
                            </>
                          )}
                        </Button>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="lg"
                                onClick={() => window.open(docInfo.sourceUrl, '_blank')}
                                className="gap-2"
                              >
                                <Globe className="h-4 w-4" />
                                Source
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Open the original Scribd page</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>

                      {/* Download Progress */}
                      <AnimatePresence>
                        {downloading !== null && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mt-4"
                          >
                            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                              <span className="flex items-center gap-1.5">
                                <Package className="h-3 w-3" />
                                {downloadProgress === 0
                                  ? `Preparing your ${downloading.toUpperCase()} (fetching pages)...`
                                  : downloadProgress < 100
                                    ? `Downloading your ${downloading.toUpperCase()}...`
                                    : 'Finalizing...'}
                              </span>
                              {downloadProgress > 0 && <span>{downloadProgress}%</span>}
                            </div>
                            <Progress
                              value={downloadProgress === 0 ? undefined : downloadProgress}
                              className="h-1.5"
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </Card>

                {/* Document Text Content Preview (real content) */}
                {docInfo.textContent && docInfo.textContent.trim().length > 0 && (
                  <Card className="border-border/60 overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-3 border-b border-border/60 bg-muted/30">
                      <h3 className="text-sm font-semibold flex items-center gap-2">
                        <FileText className="h-4 w-4 text-primary" />
                        Document Content
                        <Badge variant="secondary" className="text-[10px]">
                          {docInfo.textContent.length.toLocaleString()} chars
                        </Badge>
                        {!docInfo.isDemo && (
                          <Badge className="gap-1 text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15">
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            Live content
                          </Badge>
                        )}
                      </h3>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => {
                          navigator.clipboard.writeText(docInfo.textContent || '')
                          toast.success('Content copied to clipboard')
                        }}
                      >
                        <Copy className="h-3 w-3" />
                        Copy
                      </Button>
                    </div>
                    <div className="max-h-80 overflow-y-auto scrollbar-custom p-5">
                      <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground/90">
                        {docInfo.textContent.slice(0, 8000)}
                        {docInfo.textContent.length > 8000 && (
                          <span className="text-muted-foreground italic">
                            {'\n\n…'} ({(docInfo.textContent.length - 8000).toLocaleString()} more characters — download the full PDF to read everything)
                          </span>
                        )}
                      </pre>
                    </div>
                  </Card>
                )}

                {/* Page Preview Grid */}
                {docInfo.pages.length > 0 && (
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                      <h3 className="text-lg font-semibold flex items-center gap-2">
                        <ImageIcon className="h-5 w-5 text-primary" />
                        Page Preview
                        <Badge variant="secondary">{docInfo.pages.length} pages</Badge>
                      </h3>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 max-h-[600px] overflow-y-auto scrollbar-custom p-1">
                      {docInfo.pages.map((page) => {
                        return (
                          <motion.div
                            key={page.index}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{
                              duration: 0.2,
                              delay: Math.min(page.index * 0.02, 0.5),
                            }}
                            className="group relative aspect-[3/4] rounded-lg overflow-hidden border-2 border-border hover:border-primary/40 bg-muted cursor-pointer transition-colors"
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
                        )
                      })}
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Download History */}
        <section className="container mx-auto max-w-5xl px-4 py-12">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              Download History
              {history.length > 0 && (
                <Badge variant="secondary">{history.length}</Badge>
              )}
            </h3>
            {history.length > 0 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportHistory}
                  className="gap-1.5"
                >
                  <FileArchive className="h-3.5 w-3.5" />
                  Export
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearHistory}
                  className="text-muted-foreground hover:text-destructive gap-1.5"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear All
                </Button>
              </div>
            )}
          </div>

          {/* Search + Filter Bar */}
          {history.length > 0 && (
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search by title, author, or doc ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-10"
                />
              </div>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card">
                <Switch
                  id="fav-filter"
                  checked={favoritesOnly}
                  onCheckedChange={setFavoritesOnly}
                />
                <Label
                  htmlFor="fav-filter"
                  className="text-sm flex items-center gap-1.5 cursor-pointer"
                >
                  <Star
                    className={`h-3.5 w-3.5 ${
                      favoritesOnly ? 'fill-amber-400 text-amber-400' : ''
                    }`}
                  />
                  Favorites only
                </Label>
              </div>
            </div>
          )}

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
                  Your downloaded documents will appear here for easy access. Try the
                  sample data button above to get started.
                </p>
              </CardContent>
            </Card>
          ) : filteredHistory.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-10 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted mb-2">
                  <Search className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium">No matching results</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Try a different search query or filter.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto scrollbar-custom pr-1">
              {filteredHistory.map((item) => (
                <Card
                  key={item.id}
                  className="border-border/60 hover:shadow-md transition-shadow group"
                >
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
                        <Badge variant="outline" className="h-4 text-[10px] px-1">
                          {item.format.toUpperCase()}
                        </Badge>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(item.createdAt)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8"
                              onClick={() => toggleFavorite(item)}
                            >
                              <Star
                                className={`h-4 w-4 ${
                                  item.favorite
                                    ? 'fill-amber-400 text-amber-400'
                                    : 'text-muted-foreground'
                                }`}
                              />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {item.favorite ? 'Remove from favorites' : 'Add to favorites'}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
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
                desc: 'Fetch and generate PDFs or ZIPs in seconds with our optimized pipeline.',
              },
              {
                icon: ShieldCheck,
                title: 'Privacy First',
                desc: 'Documents are processed on demand — nothing is permanently stored.',
              },
              {
                icon: Eye,
                title: 'Page Preview',
                desc: 'See every page before downloading. Pick exactly what you need.',
              },
              {
                icon: FileArchive,
                title: 'Multiple Formats',
                desc: 'Download as PDF, a ZIP of images, or grab individual page images.',
              },
              {
                icon: ListChecks,
                title: 'Page Range Selection',
                desc: 'Choose specific pages or ranges like 1-5, 8, 12-15 for targeted downloads.',
              },
              {
                icon: TrendingUp,
                title: 'Stats Dashboard',
                desc: 'Track your downloads, pages, and storage usage with live counters.',
              },
              {
                icon: Star,
                title: 'Favorites & Search',
                desc: 'Star important docs, search your history, and export it anytime.',
              },
              {
                icon: Keyboard,
                title: 'Keyboard Shortcuts',
                desc: 'Power-user shortcuts: Ctrl+K to focus, Ctrl+Enter to fetch, Ctrl+D for demo.',
              },
              {
                icon: Globe,
                title: 'Fully Responsive',
                desc: 'Works beautifully on desktop, tablet, and mobile devices.',
              },
            ].map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: (i % 3) * 0.05 }}
              >
                <Card className="h-full border-border/60 hover:border-primary/40 hover:shadow-md transition-all group">
                  <CardContent className="p-5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-3 group-hover:scale-110 transition-transform">
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
      <footer className="mt-auto border-t border-border/60 bg-muted/30 relative z-10">
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
            © {new Date().getFullYear()} Scribd Downloader. Not affiliated with Scribd,
            Inc. All trademarks belong to their respective owners.
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

      {/* Keyboard Shortcuts Modal */}
      <AnimatePresence>
        {showShortcuts && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setShowShortcuts(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <Card className="shadow-2xl">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <Keyboard className="h-5 w-5 text-primary" />
                      Keyboard Shortcuts
                    </h3>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => setShowShortcuts(false)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="space-y-2.5">
                    {SHORTCUTS.map((s) => (
                      <div
                        key={s.keys}
                        className="flex items-center justify-between py-2 border-b border-border/40 last:border-0"
                      >
                        <span className="text-sm text-muted-foreground">{s.desc}</span>
                        <kbd className="px-2.5 py-1 text-xs font-mono font-semibold rounded-md bg-muted border border-border">
                          {s.keys}
                        </kbd>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 pt-4 border-t border-border/60">
                    <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                      <Sparkles className="h-3 w-3 mt-0.5 shrink-0" />
                      Tip: You can also paste a Scribd URL anywhere on the page and it
                      will be auto-filled into the input.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Manual Extract Modal (bookmarklet + paste HTML) */}
      <ExtractModal
        open={showExtractModal}
        onClose={() => setShowExtractModal(false)}
        onExtracted={handleExtractedData}
        onPastedHtml={handlePastedHtml}
        extracting={extracting}
        currentUrl={url}
      />
    </div>
  )
}

// ---------- Extract Modal Component ----------
interface ExtractModalProps {
  open: boolean
  onClose: () => void
  onExtracted: (data: {
    urls: string[]
    title: string
    sourceUrl: string
    thumbnail?: string
    author?: string
    description?: string
    pageCount?: number
  }) => void
  onPastedHtml: (html: string, sourceUrl: string) => void
  extracting: boolean
  currentUrl: string
}

function ExtractModal({
  open,
  onClose,
  onExtracted,
  onPastedHtml,
  extracting,
  currentUrl,
}: ExtractModalProps) {
  const [tab, setTab] = React.useState<'bookmarklet' | 'paste'>('bookmarklet')
  const [pastedHtml, setPastedHtml] = React.useState('')
  const [pasteUrl, setPasteUrl] = React.useState('')

  // Generate the bookmarklet code
  // The bookmarklet runs on scribd.com, so it needs our app's URL hardcoded
  const appOrigin = typeof window !== 'undefined' ? window.location.origin : ''
  const bookmarkletCode = React.useMemo(() => {
    const code = `javascript:(function(){
  try {
    var html = document.documentElement.outerHTML;
    var matches = html.match(/contentUrl:\\s*"(https:\\/\\/html\\.scribdassets\\.com\\/[^"]+\\.jsonp)"/g) || [];
    var urls = matches.map(function(m){ return m.match(/"(https:\\/\\/[^"]+)"/)[1]; });
    if(urls.length === 0){ alert('No Scribd page URLs found. Make sure you are on a Scribd document page.'); return; }
    var title = document.title.replace(/\\s*\\|\\s*Scribd.*$/i,'').trim();
    var thumb = (document.querySelector('meta[property="og:image"]')||{}).content || null;
    var desc = (document.querySelector('meta[property="og:description"]')||{}).content || null;
    var pc = (html.match(/"page_count"\\s*:\\s*(\\d+)/)||[])[1] || urls.length;
    var payload = JSON.stringify({urls:urls,title:title,sourceUrl:location.href,thumbnail:thumb,description:desc,pageCount:parseInt(pc)});
    var xhr = new XMLHttpRequest();
    xhr.open('POST', '${appOrigin}/api/scribd/extract');
    xhr.setRequestHeader('Content-Type','application/json');
    xhr.onload = function(){
      try {
        var r = JSON.parse(xhr.responseText);
        if(r.success){ alert('✅ Extracted ' + (r.pageImages||[]).length + ' pages from "' + r.title + '"!\\n\\nReturn to the Scribd Downloader tab to download.'); window.open('${appOrigin}', '_blank'); }
        else { alert('❌ Error: ' + (r.error||'unknown')); }
      } catch(e){ alert('❌ Parse error: ' + e.message); }
    };
    xhr.onerror = function(){ alert('❌ Network error. Check your connection.'); };
    xhr.send(payload);
  } catch(e) { alert('❌ Error: ' + e.message); }
})();`
    return code
  }, [appOrigin])

  if (!open) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="relative max-w-2xl w-full max-h-[90vh] overflow-y-auto scrollbar-custom"
          onClick={(e) => e.stopPropagation()}
        >
          <Card className="shadow-2xl">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Zap className="h-5 w-5 text-primary" />
                  Manual Extract
                </h3>
                <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onClose}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Tab selector */}
              <div className="flex gap-1 p-1 bg-muted rounded-lg mb-5">
                <button
                  onClick={() => setTab('bookmarklet')}
                  className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                    tab === 'bookmarklet'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Bookmarklet (one-click)
                </button>
                <button
                  onClick={() => setTab('paste')}
                  className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                    tab === 'paste'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Paste Page Source
                </button>
              </div>

              {tab === 'bookmarklet' ? (
                <div className="space-y-4">
                  <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4">
                    <p className="text-sm text-emerald-700 dark:text-emerald-400 font-medium mb-1">
                      ✅ 100% Free — No Cloudflare issues
                    </p>
                    <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80">
                      Your browser bypasses Cloudflare naturally. The bookmarklet extracts
                      page URLs and sends them here.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <p className="text-sm font-medium">How to use:</p>
                    <ol className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex gap-2">
                        <span className="font-bold text-primary shrink-0">1.</span>
                        <span>
                          Drag this link to your bookmarks bar:{' '}
                          <span
                            dangerouslySetInnerHTML={{
                              __html: `<a href="${bookmarkletCode}" class="inline-block px-3 py-1 bg-primary text-primary-foreground rounded-md text-xs font-semibold cursor-grab hover:opacity-90">📥 Extract Scribd</a>`,
                            }}
                          />
                        </span>
                      </li>
                      <li className="flex gap-2">
                        <span className="font-bold text-primary shrink-0">2.</span>
                        <span>
                          Open any Scribd document page in your browser (Cloudflare will
                          pass since you're a real user).
                        </span>
                      </li>
                      <li className="flex gap-2">
                        <span className="font-bold text-primary shrink-0">3.</span>
                        <span>Click the "Extract Scribd" bookmarklet from your bookmarks bar.</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="font-bold text-primary shrink-0">4.</span>
                        <span>
                          The bookmarklet extracts all page URLs and sends them here.
                          Return to this tab to download!
                        </span>
                      </li>
                    </ol>
                  </div>

                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">
                      💡 <strong>Tip:</strong> If you don't see your bookmarks bar, press{' '}
                      <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-background border rounded">Ctrl/Cmd + Shift + B</kbd>{' '}
                      to show it.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                    <p className="text-sm text-blue-700 dark:text-blue-400 font-medium mb-1">
                      📋 Paste the Scribd page source
                    </p>
                    <p className="text-xs text-blue-700/80 dark:text-blue-400/80">
                      Works when the bookmarklet isn't available. Your browser still
                      bypasses Cloudflare.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <p className="text-sm font-medium">How to use:</p>
                    <ol className="space-y-2 text-sm text-muted-foreground">
                      <li className="flex gap-2">
                        <span className="font-bold text-primary shrink-0">1.</span>
                        <span>
                          Open the Scribd document page in your browser
                          {currentUrl && (
                            <>
                              {' '}
                              — or{' '}
                              <a
                                href={currentUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary underline"
                              >
                                open your URL
                              </a>
                            </>
                          )}
                        </span>
                      </li>
                      <li className="flex gap-2">
                        <span className="font-bold text-primary shrink-0">2.</span>
                        <span>
                          Press <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-muted border rounded">Ctrl/Cmd + U</kbd>{' '}
                          to view page source (or right-click → View Page Source)
                        </span>
                      </li>
                      <li className="flex gap-2">
                        <span className="font-bold text-primary shrink-0">3.</span>
                        <span>
                          Press <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-muted border rounded">Ctrl/Cmd + A</kbd>{' '}
                          then <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-muted border rounded">Ctrl/Cmd + C</kbd>{' '}
                          to copy everything
                        </span>
                      </li>
                      <li className="flex gap-2">
                        <span className="font-bold text-primary shrink-0">4.</span>
                        <span>Paste it into the box below and click "Extract"</span>
                      </li>
                    </ol>
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground mb-1.5 block">
                      Scribd URL (the document you opened)
                    </label>
                    <Input
                      type="text"
                      placeholder="https://www.scribd.com/document/..."
                      value={pasteUrl || currentUrl}
                      onChange={(e) => setPasteUrl(e.target.value)}
                      className="h-9 text-sm mb-3"
                    />
                    <label className="text-xs text-muted-foreground mb-1.5 block">
                      Paste the full page source here
                    </label>
                    <textarea
                      className="w-full h-40 p-3 text-xs font-mono rounded-md border border-border bg-background resize-y scrollbar-custom"
                      placeholder="Paste the page source here (Ctrl+V)..."
                      value={pastedHtml}
                      onChange={(e) => setPastedHtml(e.target.value)}
                    />
                  </div>

                  <Button
                    onClick={() => onPastedHtml(pastedHtml, pasteUrl || currentUrl)}
                    disabled={extracting || !pastedHtml.trim()}
                    className="w-full gap-2"
                  >
                    {extracting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Extracting...
                      </>
                    ) : (
                      <>
                        <Zap className="h-4 w-4" />
                        Extract Page URLs
                      </>
                    )}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
