# Forestly GO — taksator terenowy (PWA)

Aplikacja do wpisywania opisów taksacyjnych w terenie (telefon / tablet, działa offline),
z wysyłką plików Excel na chmury użytkownika i importem do OPTAX w Forestly.

## Co jest w środku

- **Kreator startowy**: leśnik → folder na telefonie → chmury (można pominąć);
  przy wskazaniu folderu z backupem **sesja przywraca się automatycznie**
- **Backup sesji**: po każdym wpisie (i przy zamykaniu aplikacji) cała sesja zapisuje się
  jako `ForestlyGO_sesja_<leśnik>.json` w wybranym folderze — gdy przeglądarka wyczyści
  swoje dane (np. iPhone po ~tygodniu nieużywania), wskazujesz folder raz i wszystkie
  wpisy wracają. Haseł do chmur w backupu nie ma — te wpisuje się ponownie w Sync.
- **Nowy opis**: pełny formularz taksacyjny ze słownikami (siedliska, gatunki, zwarcie, podszyt),
  kręcony wiek i udział, obręby + działki rejestrowe, elementy taksacyjne, wskazania, lokalizacja
  (GPS „Tu stoję” albo pinezka na mapie satelitarnej Esri — bez klucza API)
- **Podgląd OPTAX na żywo** — czarna belka nad nawigacją, składana jak w pliku OPTAX
- **Wykaz**: wpisy pogrupowane po wsiach, poprawka wpisu przed wysłaniem = nowa wersja pliku
- **Sync**: plik Excel per leśnik per wieś (`Taksator_<kto>_<gdzie>.xlsx`), 31 kolumn,
  wysyłka na trzy chmury naraz + zapis do folderu na telefonie
- **Offline**: service worker cache'uje całą aplikację + odwiedzone kafle mapy

## Jak uruchomić testowo

Wymagany serwer HTTP (nie `file://` — service worker nie zadziała z pliku):

```
cd taksator
python -m http.server 8000
```

i w przeglądarce: `http://localhost:8000` — na `localhost` PWA da się zainstalować
(Chrome: menu ⋯ → „Zainstaluj aplikację” / „Dodaj do ekranu głównym”).

## Hosting (GitHub Pages — darmowy)

### Pierwsze uruchomienie — repo i Pages z komputera, bez klikania na GitHubie

Uruchom raz **`utworz_repo.bat`** (Windows). On:
1. doinstaluje GitHub CLI (`gh`), jeśli go nie ma (przez winget),
2. zaloguje Cię do GitHuba (otworzy się przeglądarka — jednorazowo),
3. utworzy repo `wskakuj/forestly-go`, wyśle pliki na gałąź `main`,
4. włączy GitHub Pages — aplikacja wstanie pod
   `https://wskakuj.github.io/forestly-go/`.

Ręczny odpowiednik (gdyby ktoś wolał sam):
```
gh repo create forestly-go --public --source=. --push
gh api -X POST repos/wskakuj/forestly-go/pages -f "source[branch]=main" -f "source[path]=/"
```

### Wydawanie kolejnych wersji — tak jak w Forestly

**`release.bat`** (albo `python release.py`) robi dokładnie to samo co Forestly:
podpowiada numer wersji (ostatni tag na GitHubie + 1), otwiera Notatnik z changelogiem,
zapisuje pliki, taguje `vX.Y.Z` i wysyła. Różnice względem Forestly:
- wersja siedzi w `js/wersja.js` (nie ma `app/config.py`) i pokazuje się
  w aplikacji, w zakładce Sync → Urządzenie,
- **nic się nie buduje** — Pages publikują gałąź main od razu po pushu,
- po wypchnięciu tagu workflow `.github/workflows/release.yml` wystawia
  Release z paczką `forestly-go.zip` i changelogiem z `RELEASE_NOTES.md`.

### Hosting

1. Stwórz repozytorium (np. `taksator`), wgraj zawartość tego katalogu do gałęzi `main`.
2. Repo → Settings → Pages → Source: `Deploy from a branch` → `main` / root.
3. Po chwili aplikacja jest pod `https://<login>.github.io/taksator/`.
4. Link (albo QR-kod z niego) rozdajesz leśnikom — instalują jednym kliknięciem z Chrome.

HTTPS jest wymagany do instalacji PWA na telefonie — GitHub Pages daje go automatycznie.

## Konfiguracja chmur (zakładka Sync, na urządzeniu leśnika)

Wszystkie trzy są opcjonalne — bez nich aplikacja działa offline, a pliki pobiera się ręcznie.

### Nextcloud (główna — fizycznie Twój QNAP)

1. W Nextcloud: Ustawienia osobiste → Bezpieczeństwo → **utwórz hasło aplikacji**
   (nie używa się hasła do logowania!).
2. W aplikacji: adres serwera (np. `https://twoj-nas.pl`), login, hasło aplikacji → **Testuj** → **Zapisz**.
3. Pliki lądują w `/Taksator/<imię i nazwisko>/` na koncie leśnika — historia wersji
   Nextcloud pilnuje każdej poprawki.

**Uwaga (CORS):** przeglądarka blokuje żądania WebDAV między domenami. Na serwerze Nextcloud
wykonaj raz:

```
occ config:system:set cors.allowed-domains 0 --value="https://<login>.github.io"
```

(bez tego przycisk „Testuj” pokaże błąd połączenia, mimo dobrych danych).

### pCloud (kopia)

Trwały token aplikacji: panel pCloud → (dla programistów) → Applications → utwórz token.
Wklej token + ścieżkę (domyślnie `/Taksator`).

### Dysk Google (kopia — konto serwisowe)

1. Google Cloud Console → utwórz **konto serwisowe** (Service Account), pobierz klucz JSON.
2. Na Dysku Google utwórz folder (np. `Taksator`), udostępnij go adresowi e-mail konta serwisowego.
3. W aplikacji wklej całą zawartość pliku JSON → **Testuj** → **Zapisz**.

Aplikacja sama podpisuje JWT co godzinę i wgrywa plik do udostępnionego folderu —
bez ekranów zgód Google, bo konto serwisowe ma dostęp tylko do tego jednego folderu.

## Gdzie są dane, gdy zabraknie sieci

- wpisy → IndexedDB w przeglądarce telefonu (przeżywają restart, są per leśnik),
- **backup sesji → plik JSON w wybranym folderze (po każdym wpisie)** — jedyny składnik,
  który przeżywa wyczyszczenie danych przeglądarki; przywracany jednym wskazaniem folderu,
- Excel → wybrany folder na telefonie (widoczny dla innych aplikacji) + trzy chmury po wysyłce,
- najczulszy moment to dzień w lesie przed wysyłką — po synchronizacji dane są w trzech miejscach.

Uwaga jabłkowa: na iOS/Safari nie ma File System Access API — tam folderu nie wskażesz,
więc backup trzeba pobrać ręcznie (przycisk „Zapisz teraz" → pobieranie pliku).
Na Androidzie z Chrome — pełna automatyka. To kolejny argument, by leśnikom dawać Androidy.

## Testowanie synchronizacji bez ruszania prawdziwych chmur

W katalogu `testy/` jest `mockdav.py` — udawany serwer Nextcloud WebDAV:

```
python testy/mockdav.py 8123
```

W aplikacji podaj jako adres Nextcloud `http://localhost:8123` (login i hasło dowolne),
wyślij plik — zapisze się w `testy/mockdav/…` tak, jak zrobiłby to prawdziwy serwer.

## Struktura

```
index.html            — szkielet aplikacji (4 zakładki + kreator)
js/session.js         — backup sesji (JSON w folderze) + przywracanie po wyczyszczeniu danych
manifest.webmanifest  — definicja PWA (ikony, kolory, tryb standalone)
sw.js                 — service worker: offline + cache kafli mapy
css/app.css           — wygląd (telefon + tablet)
js/db.js              — IndexedDB (wpisy + konfiguracja)
js/optax.js           — składanie linijek OPTAX
js/xlsx-io.js         — budowa Excela (SheetJS, 31 kolumn)
js/clouds.js          — Nextcloud WebDAV, pCloud, Dysk Google (JWT), kolejka wysyłki
js/app.js             — logika interfejsu
vendor/               — SheetJS + Leaflet (lokalnie, bez CDN — działa offline)
icons/                — ikony aplikacji (192/512 + maskable)
```
