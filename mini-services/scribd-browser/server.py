"""
Scribd Browser Service

Uses Playwright (headless Chromium) to navigate to a Scribd document,
scroll through pages, and capture each page as an image. Returns the
list of base64-encoded page images and document metadata.

This runs as a standalone HTTP service on port 3040.

Usage:
  POST /fetch
  Body: {"url": "https://www.scribd.com/document/123456/title"}
  Response: {"title": "...", "pageCount": 12, "pages": ["data:image/jpeg;base64,..."], "thumbnail": "..."}
"""

import json
import base64
import traceback
from http.server import HTTPServer, BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright


PORT = 3040


def capture_scribd_document(url):
    """Navigate to a Scribd document and capture all page images."""
    result = {
        "title": None,
        "author": None,
        "description": None,
        "pageCount": 0,
        "thumbnail": None,
        "pages": [],
        "textContent": "",
        "isScanned": False,
        "error": None,
    }

    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--disable-extensions",
            ],
        )
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/125.0.0.0 Safari/537.36"
            ),
            viewport={"width": 1280, "height": 900},
            locale="en-US",
        )

        # Block unnecessary resources for speed
        def block_resources(route):
            req_url = route.request.url
            if any(
                req_url.endswith(ext)
                for ext in [".woff", ".woff2", ".css"]
            ):
                return route.abort()
            if "google" in req_url and "analytics" in req_url:
                return route.abort()
            if "facebook" in req_url:
                return route.abort()
            return route.continue_()

        context.route("**/*", block_resources)
        page = context.new_page()

        try:
            # Navigate to the Scribd document page
            page.goto(url, wait_until="domcontentloaded", timeout=45000)

            # Wait for the page to fully load (Cloudflare challenge resolves)
            page.wait_for_timeout(5000)

            # Extract metadata
            result["title"] = page.title().split(" | ")[0]
            try:
                result["description"] = page.evaluate(
                    "() => document.querySelector('meta[property=\"og:description\"]')?.content || null"
                )
            except Exception:
                pass
            try:
                result["thumbnail"] = page.evaluate(
                    "() => document.querySelector('meta[property=\"og:image\"]')?.content || null"
                )
            except Exception:
                pass
            try:
                result["author"] = page.evaluate(
                    """() => {
                        const el = document.querySelector('[data-testid=\"author_name\"], .document_contributor a, .uploaded_by a');
                        return el ? el.textContent.trim() : null;
                    }"""
                )
            except Exception:
                pass

            # Try to find page count
            try:
                page_count_text = page.evaluate(
                    """() => {
                        const el = document.querySelector('.page_count, .document_metrics .pages');
                        return el ? el.textContent : null;
                    }"""
                )
                if page_count_text:
                    import re

                    m = re.search(r"(\d+)", page_count_text)
                    if m:
                        result["pageCount"] = int(m.group(1))
            except Exception:
                pass

            # Wait for document pages to render
            # Scribd renders pages in .outer_page or .page containers
            try:
                page.wait_for_selector(
                    ".outer_page, .page, .document_page, [class*='page_']",
                    timeout=15000,
                )
            except Exception:
                pass

            # Scroll through the document to trigger lazy loading of all pages
            # Scribd lazy-loads pages as you scroll
            page_images = []
            seen_page_ids = set()
            max_scrolls = 60  # safety limit
            scroll_count = 0
            no_new_pages_count = 0

            while scroll_count < max_scrolls and no_new_pages_count < 5:
                # Find all page containers currently in the DOM
                page_elements = page.query_selector_all(
                    ".outer_page, .page, .document_page, [class*='page_pb_container'], .newpage"
                )

                new_pages_found = 0
                for pe in page_elements:
                    try:
                        page_id = pe.get_attribute("id") or str(
                            hash(pe.evaluate("() => this.offsetTop"))
                        )
                        if page_id in seen_page_ids:
                            continue

                        # Scroll the page into view
                        pe.scroll_into_view_if_needed()
                        page.wait_for_timeout(800)

                        # Capture a screenshot of just this page element
                        screenshot_bytes = pe.screenshot(
                            type="jpeg", quality=85
                        )
                        if screenshot_bytes and len(screenshot_bytes) > 5000:
                            b64 = base64.b64encode(screenshot_bytes).decode(
                                "utf-8"
                            )
                            page_images.append(
                                f"data:image/jpeg;base64,{b64}"
                            )
                            seen_page_ids.add(page_id)
                            new_pages_found += 1
                    except Exception:
                        continue

                if new_pages_found == 0:
                    no_new_pages_count += 1
                else:
                    no_new_pages_count = 0

                # Scroll down to load more pages
                page.evaluate("window.scrollBy(0, window.innerHeight * 0.8)")
                page.wait_for_timeout(500)
                scroll_count += 1

            result["pages"] = page_images
            result["pageCount"] = len(page_images) or result["pageCount"]

            # If we got pages, it's likely a scanned/image document
            result["isScanned"] = len(page_images) > 0

            # Also try to extract text content
            try:
                text = page.evaluate(
                    """() => {
                        const container = document.querySelector('.doc_container, .document_pages, #doc_container');
                        if (container) return container.innerText;
                        return '';
                    }"""
                )
                if text:
                    result["textContent"] = text[:50000]
            except Exception:
                pass

        except Exception as e:
            result["error"] = f"{e}"
            traceback.print_exc()
        finally:
            browser.close()

    return result


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(
                json.dumps({"status": "ok", "service": "scribd-browser"}).encode()
            )
        else:
            self.send_response(404)
            self._cors()
            self.end_headers()
            self.wfile.write(b'{"error":"Not found"}')

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path != "/fetch":
            self.send_response(404)
            self._cors()
            self.end_headers()
            self.wfile.write(b'{"error":"Not found"}')
            return

        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length).decode("utf-8")

        try:
            data = json.loads(body) if body else {}
        except json.JSONDecodeError:
            self.send_response(400)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(b'{"error":"Invalid JSON"}')
            return

        url = data.get("url")
        if not url or "scribd.com" not in url:
            self.send_response(400)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(
                json.dumps({"error": "A valid Scribd URL is required."}).encode()
            )
            return

        print(f"Fetching: {url}")
        try:
            result = capture_scribd_document(url)
            print(
                f"Done: {len(result.get('pages', []))} pages captured"
            )

            self.send_response(200)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(result).encode())
        except Exception as e:
            print(f"Error: {e}")
            traceback.print_exc()
            self.send_response(500)
            self._cors()
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(
                json.dumps({"error": str(e), "pages": []}).encode()
            )

    def log_message(self, format, *args):
        print(f"[{self.address_string()}] {format % args}")


if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"Scribd Browser Service running on port {PORT}")
    print(f"  POST /fetch  - capture a Scribd document")
    print(f"  GET  /health - health check")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("Shutting down...")
        server.shutdown()
