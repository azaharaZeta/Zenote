#!/usr/bin/env python3
"""Servidor estático para desarrollo con caché desactivada.

`python3 -m http.server` cachea los archivos en el navegador, lo que provoca
mezclas de versiones (HTML viejo + JS nuevo) al editar. Este servidor añade
cabeceras no-cache para que cada recarga traiga siempre la última versión.

Uso:  python3 serve.py [puerto]   (por defecto 8731)
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8731
    print(f"Primordia dev server (no-cache) en http://localhost:{port}")
    ThreadingHTTPServer(("", port), NoCacheHandler).serve_forever()
