#!/usr/bin/env python3
"""Mock serwera Nextcloud WebDAV do testów PWA Forestly GO.
Naśladuje prawdziwe zachowanie: PUT nie tworzy folderów (404 bez rodzica),
MKCOL tworzy jeden poziom (201; 405 gdy istnieje)."""
import os, sys, urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

KATALOG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mockdav")
os.makedirs(KATALOG, exist_ok=True)

class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, PUT, PROPFIND, MKCOL, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type, Depth, Overwrite")

    def _sciezka(self):
        return urllib.parse.unquote(self.path).lstrip("/")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_PROPFIND(self):
        body = b'<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"/>'
        self.send_response(207)
        self._cors()
        self.send_header("Content-Type", "application/xml; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_MKCOL(self):
        sciezka = self._sciezka().rstrip("/")
        pelna = os.path.join(KATALOG, sciezka.replace("/", os.sep))
        if not os.path.isdir(os.path.dirname(pelna)):
            self._odp(409)  # rodzic nie istnieje
        elif os.path.isdir(pelna):
            self._odp(405)  # już istnieje
        else:
            os.makedirs(pelna)
            print(f"[MKCOL] {sciezka}", flush=True)
            self._odp(201)

    def do_PUT(self):
        dl = int(self.headers.get("Content-Length", 0))
        dane = self.rfile.read(dl)
        sciezka = self._sciezka()
        pelna = os.path.join(KATALOG, sciezka.replace("/", os.sep))
        if not os.path.isdir(os.path.dirname(pelna)):
            self._odp(404)  # jak prawdziwy Nextcloud: folder nie istnieje
            return
        with open(pelna, "wb") as f:
            f.write(dane)
        print(f"[PUT] {len(dane)} B -> {sciezka}", flush=True)
        self._odp(201)

    def _odp(self, kod):
        self.send_response(kod)
        self._cors()
        self.send_header("ETag", '"mock"')
        self.send_header("Content-Length", "0")
        self.end_headers()

    def log_message(self, *a):
        pass

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
print(f"mock WebDAV (tryb ścisły: PUT bez folderu = 404) na http://localhost:{port}", flush=True)
ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
