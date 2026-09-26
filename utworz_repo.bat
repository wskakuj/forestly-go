@echo off
REM =====================================================
REM Forestly GO - jednorazowe utworzenie repo na GitHubie
REM (bez wchodzenia na stronę i klikania)
REM =====================================================
cd /d "%~dp0"

where gh >nul 2>nul
if errorlevel 1 (
  echo Nie mam GitHub CLI ^(gh^). Instaluje...
  winget install --id GitHub.cli --silent
  if errorlevel 1 (
    echo.
    echo Nie udalo sie zainstalowac automatycznie.
    echo Sciagnij z: https://cli.github.com  i uruchom ponownie.
    pause
    exit /b 1
  )
)

gh auth status >nul 2>nul
if errorlevel 1 (
  echo Zaloguje Cie do GitHuba - otworzy sie przegladarka...
  gh auth login --git-protocol https --web
)

git init -b main 2>nul
git add -A
git diff --cached --quiet
if errorlevel 1 git commit -m "Forestly GO v1.0.0 - start"

echo Tworze repo wskakuj/forestly-go i wysylam...
gh repo create forestly-go --public --source=. --push
if errorlevel 1 (
  echo Nie udalo sie utworzyc repo - sprawdz komunikat wyzej.
  pause
  exit /b 1
)

echo Wlaczam GitHub Pages ^(publikowanie z main^)...
gh api -X POST repos/wskakuj/forestly-go/pages -f "source[branch]=main" -f "source[path]=/" >nul 2>nul
if errorlevel 1 (
  echo Pages nie wlaczone automatycznie: wejdz raz na
  echo   https://github.com/wskakuj/forestly-go/settings/pages
  echo i wybierz "Deploy from a branch" - main / (root).
) else (
  echo Pages wlaczone.
)

echo.
echo GOTOWE. Za minute aplikacja bedzie pod:
echo   https://wskakuj.github.io/forestly-go/
echo PIERWSZY RELEASE zrob przez release.bat.
echo.
pause
