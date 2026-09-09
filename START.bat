@echo off
title RetailOS Morocco
cd /d "%~dp0"
echo ========================================
echo   RetailOS Morocco - Starting...
echo ========================================
echo.

:: Kill any process using port 3000 (stale server from previous run)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do (
    echo Stopping previous server (PID %%a)...
    taskkill /PID %%a /F >nul 2>&1
    timeout /t 2 /nobreak >nul
)

:: Check if node_modules exists
if not exist "node_modules" (
    echo Installing dependencies (first time only)...
    call npm install
    if errorlevel 1 (
        echo.
        echo ERROR: npm install failed. Make sure Node.js 20+ is installed from https://nodejs.org
        pause
        exit /b 1
    )
    echo.
)

:: Check if database exists, create if missing
if not exist "prisma\dev.db" (
    echo Creating database (first time only)...
    call npx prisma generate
    call npx prisma db push
    call npm run db:seed
    echo.
)

:: Ensure Prisma client is generated
if not exist "node_modules\.prisma\client" (
    echo Generating Prisma client...
    call npx prisma generate
    echo.
)

:: Start the server
echo Starting server...
echo.
echo ========================================
echo   http://localhost:3000
echo.
echo   Login:    owner@demo.ma
echo   Password: Demo12345
echo.
echo   Press Ctrl+C to stop the server.
echo ========================================
echo.
npm run dev
pause
