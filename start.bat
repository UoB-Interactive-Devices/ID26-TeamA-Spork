@echo off
:: ═══════════════════════════════════════
::   Launcher (Windows)
::   Double-click to run
:: ═══════════════════════════════════════

cd /d "%~dp0"

:: ── Check Python ────────────────────────
python --version >nul 2>&1
if errorlevel 1 (
    echo [!] Python not found. Please install Python 3 from python.org
    pause
    exit /b 1
)

:: ── Check npm ───────────────────────────
npm --version >nul 2>&1
if errorlevel 1 (
    echo [!] npm not found. Please install Node.js from nodejs.org
    pause
    exit /b 1
)

echo.
echo   ═══════════════════════════════════════
echo     Stir Things Up - Habit Disrupting Game
echo   ═══════════════════════════════════════
echo.

:: ── Install frontend deps if needed ────
if not exist "webapp\node_modules" (
    echo   [*] Installing frontend dependencies...
    npm install --prefix webapp
)

:: ── Start frontend in a separate window ─
echo   [*] Starting frontend...
start "Stir Things Up - Frontend" cmd /c "npm run dev --prefix webapp"

:: Give the frontend a moment to start
timeout /t 2 /nobreak >nul

:: ── Start backend bridge ────────────────
echo   [*] Starting backend bridge...
echo   [*] Close this window to stop everything.
echo.
python backend\launcher.py

echo.
echo   [*] Backend stopped. You can close the frontend window too.
pause
