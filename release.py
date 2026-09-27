#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Forestly GO — pomocnik wydawania wersji (release)
=================================================
Ten sam schemat co w Forestly, tylko lżejszy: nic się nie buduje,
bo Forestly GO to statyczna strona — GitHub Pages publikuje to,
co leży na gałęzi main, zaraz po pushu.

Jednym poleceniem: zapisuje zmienione pliki do repo GitHub,
taguje nową wersję i wypuszcza release (Actions złapią tag
i wystawią Release z paczką forestly-go.zip + changelogiem).

Użycie (w folderze repo forestly-go):
    python release.py        → kreator krok po kroku
    python release.py -k     → bez pytania o potwierdzenie

Numer następnej wersji podpowiadany jest na podstawie ostatniego
tagu na GitHubie (vX.Y.Z + 1).

Wymagania: git (zalogowany — klon robiony przez HTTPS
z zapamiętanym hasłem), dokładnie jak w FORESTLY.
"""

import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent
WERSJA_PLIK = REPO / "js" / "wersja.js"
NOTES = REPO / "RELEASE_NOTES.md"
GITHUB_URL = "https://github.com/wskakuj/forestly-go"


def git(*args, check=True):
    """Uruchamia git w katalogu repo, zwraca stdout (lub exits przy błędzie)."""
    r = subprocess.run(["git", "-C", str(REPO), *args],
                       capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    if check and r.returncode != 0:
        print("\n✗ BŁĄD git " + " ".join(args))
        if r.stdout.strip():
            print(r.stdout.strip())
        if r.stderr.strip():
            print(r.stderr.strip())
        print("\nNic nie wysłano — popraw problem i uruchom release.py ponownie.")
        sys.exit(1)
    return r.stdout.strip()


def read_current_version():
    m = re.search(r'WERSJA_APLIKACJI = "([^"]+)"',
                  WERSJA_PLIK.read_text(encoding="utf-8"))
    if not m:
        print("✗ Nie znaleziono WERSJA_APLIKACJI w js/wersja.js")
        sys.exit(1)
    return m.group(1)


def set_current_version(ver):
    s = WERSJA_PLIK.read_text(encoding="utf-8")
    s2 = re.sub(r'WERSJA_APLIKACJI = "[^"]+"',
                f'WERSJA_APLIKACJI = "{ver}"', s, count=1)
    WERSJA_PLIK.write_text(s2, encoding="utf-8")


def _vt(v):
    """Wersja jako krotka liczb (do porównań)."""
    m = re.match(r"^v(\d+)\.(\d+)\.(\d+)$", v or "")
    return tuple(int(x) for x in m.groups()) if m else (0, 0, 0)


def remote_tag_list():
    """Lista tagów vX.Y.Z z GitHuba (origin) — zapytanie do serwera."""
    out = git("ls-remote", "--tags", "origin", check=False)
    tags = []
    for line in out.splitlines():
        m = re.search(r"refs/tags/(v\d+\.\d+\.\d+)$", line.strip())
        if m:
            tags.append(m.group(1))
    return tags


def latest_remote_tag():
    tags = remote_tag_list()
    return max(tags, key=_vt) if tags else None


def next_patch(v):
    m = re.match(r"^v(\d+)\.(\d+)\.(\d+)$", v)
    if not m:
        return None
    a, b, c = (int(x) for x in m.groups())
    return f"v{a}.{b}.{c + 1}"


def sanitize_notes(text):
    """Czysty markdown — Release na GitHubie renderuje go w całości."""
    text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)
    return text


def edit_changelog(ver):
    """Changelog: notepad na Windows, wpisywanie w konsoli gdzie indziej."""
    header = f"# Co nowego w Forestly GO {ver}\n\n"
    if sys.platform == "win32":
        NOTES.write_text(header + "- \n", encoding="utf-8")
        print("\nOtwieram Notatnik — napisz changelog, ZAPISZ i zamknij okno.")
        try:
            subprocess.run(["notepad.exe", str(NOTES)], check=False)
        except FileNotFoundError:
            pass
        raw = NOTES.read_text(encoding="utf-8")
        clean = sanitize_notes(raw)
        if clean != raw:
            NOTES.write_text(clean, encoding="utf-8")
        body = clean.strip()
        if body in (header.strip(), header.strip() + "-"):
            print("   (changelog pusty — użyję tylko listy commitów z GitHuba)")
        return
    # wariant konsolowy (test / inne systemy)
    print("\nWpisuj linie changelogu; pusta linia kończy:")
    lines = []
    while True:
        try:
            line = input()
        except EOFError:
            break
        if not line.strip():
            break
        lines.append(line)
    NOTES.write_text(sanitize_notes(header + "\n".join(lines)) + "\n",
                     encoding="utf-8")


def main():
    print("=" * 62)
    print("  FORESTLY GO — wydawanie nowej wersji")
    print("=" * 62)

    # 0) czy to w ogóle repo gita?
    git("rev-parse", "--verify", "HEAD")

    # 0b) synchronizacja z GitHubem — bez tego push może zostać odrzucony
    #     (np. gdy coś zmieniono/usunięto bezpośrednio na stronie GitHuba)
    print("Sprawdzam GitHub (git pull)…")
    try:
        git("pull", "--rebase", "--autostash", "origin", "main")
    except subprocess.CalledProcessError:
        print()
        print("✗ NIE MOGĘ POBRAĆ ZMIAN Z GITHUBA — najpewniej konflikt pliku,")
        print("  który zmieniono na stronie GitHuba, a Ty masz go u siebie.")
        print("  Co zrobić: w folderze repo usuń lokalnie plik zgłaszany w konflikcie")
        print("  (zwykle CO-CZYTAJ.txt), potem w tym folderzu uruchom:  git pull")
        print("  i odpal release.bat jeszcze raz.")
        sys.exit(1)

    # 1) co się zmieniło?
    status = git("status", "--short")
    unpushed = git("log", "--branches", "--not", "--remotes", "--oneline", check=False)
    if not status and not unpushed:
        print("\nBrak zmian — drzewo robocze czyste. Nie ma czego wydawać.")
        sys.exit(0)
    if status:
        print(f"\nZmienione / nowe pliki ({len(status.splitlines())}):")
        for line in status.splitlines():
            print("   " + line)
    if unpushed:
        print("\nUwaga: są już commity niewysłane na GitHub —")
        print("wydanie dokończy ich wysyłkę.")

    # 2) nowa wersja
    cur = read_current_version()
    remote = latest_remote_tag()
    if remote:
        base = remote if _vt(remote) >= _vt(cur) else cur
        print(f"Ostatnia wersja na GitHub  : {remote}")
    else:
        base = cur
        print("(nie udało się odczytać tagów z GitHub — bazuję na wersja.js)")
    prop = next_patch(base) or "v1.0.0"
    print(f"Aktualna wersja (js/wersja.js): {cur}")
    try:
        ans = input(f"Nowa wersja [{prop}]: ").strip() or prop
    except EOFError:
        ans = prop
    if not re.match(r"^v\d+\.\d+\.\d+$", ans):
        print("✗ Wersja musi być w formacie vX.Y.Z (np. v1.0.1)")
        sys.exit(1)
    remote_tags = remote_tag_list()
    if git("tag", "-l", ans) or ans in remote_tags:
        print(f"✗ Tag {ans} już istnieje (lokalnie lub na GitHub) — wybierz inny numer.")
        sys.exit(1)

    # 3) opis commita
    try:
        msg = input(f"Krótki opis zmian [Wersja {ans}]: ").strip() or f"Wersja {ans}"
    except EOFError:
        msg = f"Wersja {ans}"

    # 4) changelog
    edit_changelog(ans)

    # 5) potwierdzenie
    print("\n" + "-" * 62)
    print(f"Wersja : {ans}   (obecnie: {cur})")
    print(f"Commit : {msg}")
    if NOTES.exists():
        preview = [l for l in NOTES.read_text(encoding="utf-8").splitlines() if l.strip()]
        print("Release:")
        for l in preview[:5]:
            print("   " + l)
        if len(preview) > 5:
            print(f"   … (+{len(preview) - 5} linii)")
    print("-" * 62)
    if "-k" not in sys.argv:
        try:
            ok = input("\nWypuścić wersję? [T/n] (Enter = TAK): ").strip().lower()
        except EOFError:
            ok = "t"
        if ok in ("n", "nie", "no"):
            print("Anulowano — nic nie wysłano.")
            sys.exit(0)

    # 6) wykonanie
    print("\nUstawiam wersję w js/wersja.js…")
    set_current_version(ans)
    print("Zapisuję pliki (git add + commit)…")
    git("add", "-A")
    staged = git("diff", "--cached", "--name-only")
    if staged:
        git("commit", "-m", msg)
    print("Wysyłam zmiany na GitHub (push) — Pages publikują od razu…")
    git("push")
    print(f"Taguję {ans} i wysyłam tag — Actions wystawią Release z paczką…")
    git("tag", ans)
    git("push", "origin", ans)

    print("\n✓ WYPUŚCZONO WERSJĘ " + ans)
    print(f"  Aplikacja (po paru minutach): https://wskakuj.github.io/forestly-go/")
    print(f"  Release z paczką           : {GITHUB_URL}/releases")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nPrzerwano — nic nie wysłano.")
    except subprocess.CalledProcessError:
        print()
        print("✗ KROK NIE POWIÓDŁ SIĘ — patrz szczegóły wyżej (to ostatnia komenda gita).")
        print("  Najczęstsza przyczyna: lokalne repo jest w tyle za GitHubem.")
        print("  Otwórz folder repo w terminalu, uruchom:  git pull")
        print("  a potem odpal release.bat jeszcze raz. Jeśli push powtórzy się")
        print("  dwa razy — wklej mi całe okno, poprawimy.")
