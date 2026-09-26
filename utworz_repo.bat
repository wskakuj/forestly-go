@echo off
REM =====================================================
REM Forestly GO - jednorazowe utworzenie repo na GitHubie
REM (bez wchodzenia na strone i klikania)
REM =====================================================
cd /d "%~dp0"

REM ---- szukamy gh: w PATH albo w typowych lokalizacjach ----
set "GH="
where gh >nul 2>nul && set "GH=gh"
if not defined GH if exist "%ProgramFiles%\GitHub CLI\gh.exe" set "GH=%ProgramFiles%\GitHub CLI\gh.exe"
if not defined GH if exist "%LocalAppData%\Programs\GitHub CLI\gh.exe" set "GH=%LocalAppData%\Programs\GitHub CLI\gh.exe"
if defined GH goto mam_gh

echo Nie mam GitHub CLI ^(gh^). Instaluje przez winget...
echo.
echo   UWAGA: instalacja potrafi potrwac 2-5 minut (widac pasek postepu).
echo   Moze wyskoczyc okienko UAC (potwierdzenie administratora) - kliknij TAK.
echo.
winget install --id GitHub.cli -e --accept-package-agreements --accept-source-agreements
if errorlevel 1 (
  echo.
  echo Nie udalo sie zainstalowac automatycznie.
  echo Sciagnij instalator ze strony https://cli.github.com
  echo i uruchom utworz_repo.bat ponownie.
  pause
  exit /b 1
)

REM ---- odswiezamy sciezke w TEJ sesji (winget widzi ja dopiero w nowych oknach) ----
set "PATH=%PATH%;%ProgramFiles%\GitHub CLI"
set "GH="
where gh >nul 2>nul && set "GH=gh"
if not defined GH if exist "%ProgramFiles%\GitHub CLI\gh.exe" set "GH=%ProgramFiles%\GitHub CLI\gh.exe"
if not defined GH (
  echo.
  echo gh zainstalowane, ale to okno go jeszcze nie widzi.
  echo ZAMKNIJ to okno i uruchom utworz_repo.bat jeszcze raz - pojdzie dalej.
  pause
  exit /b 1
)

:mam_gh
"%GH%" auth status >nul 2>nul
if errorlevel 1 (
  echo Zaloguje Cie do GitHuba - otworzy sie przegladarka...
  "%GH%" auth login --git-protocol https --web
)

git init -b main 2>nul
git add -A
git diff --cached --quiet
if errorlevel 1 git commit -m "Forestly GO v1.0.0 - start"

echo Tworze repo wskakuj/forestly-go i wysylam...
"%GH%" repo create forestly-go --public --source=. --push
if errorlevel 1 (
  echo Nie udalo sie utworzyc repo - sprawdz komunikat wyzej.
  pause
  exit /b 1
)

echo Wlaczam GitHub Pages ^(publikowanie z main^)...
"%GH%" api -X POST repos/wskakuj/forestly-go/pages -f "source[branch]=main" -f "source[path]=/" >nul 2>nul
if errorlevel 1 (
  echo Pages nie wlaczone automatycznie: wejdz raz na
  echo   https://github.com/wskakuj/forestly-go/settings/pages
  echo i wybierz "Deploy from a branch" - main / ^(root^).
) else (
  echo Pages wlaczone.
)

echo.
echo GOTOWE. Za minute aplikacja bedzie pod:
echo   https://wskakuj.github.io/forestly-go/
echo Pierwszy release zrob przez release.bat.
echo.
pause
