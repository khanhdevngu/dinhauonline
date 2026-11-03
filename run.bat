@echo off
setlocal EnableExtensions
chcp 65001 >nul

title City Beer Station - BEAR DEV
set "ROOT=%~dp0"
set "LIVE=%~dp0live"
set "LIVE_PORT=3000"
set "WEB_PORT=4173"

echo ==================================================
echo   City Beer Station - BEAR DEV
echo   Quan bia 2.5D cho TikTok LIVE
echo ==================================================
echo.

rem ---------- 1. Kiem tra Node.js / npm ----------
where node >nul 2>nul
if errorlevel 1 goto :no_node
where npm >nul 2>nul
if errorlevel 1 goto :no_node

for /f "delims=" %%v in ('node --version') do set "NODE_VER=%%v"
echo [1/5] Node.js %NODE_VER%

rem piratetok-live-js (ket noi TikTok) can Node 22.19 tro len
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=19)?0:1)"
if not errorlevel 1 goto :node_ok

echo.
echo [CANH BAO] Node %NODE_VER% qua cu. Ket noi TikTok LIVE can Node 22.19 tro len.
echo            Van chay duoc che do thu (Bot mo phong, Do nguoi mau...),
echo            nhung nut "Ket noi" TikTok co the bao loi.
echo.
where winget >nul 2>nul
if errorlevel 1 goto :node_manual
choice /C YN /N /M "Tu dong nang cap Node.js LTS bang winget? [Y/N]: "
if errorlevel 2 goto :node_ok
winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
echo.
echo Da cai xong. Dong cua so nay roi nhap dup run.bat lai de dung Node moi.
pause
exit /b 0

:node_manual
echo Tai Node.js LTS tai https://nodejs.org roi chay lai run.bat neu muon ket noi TikTok.
echo.

:node_ok

rem ---------- 2. Cai dependency neu thieu ----------
set "NEED_INSTALL="
if not exist "%LIVE%\node_modules\ws" set "NEED_INSTALL=1"
if not exist "%LIVE%\node_modules\sharp" set "NEED_INSTALL=1"
if not exist "%LIVE%\node_modules\msedge-tts" set "NEED_INSTALL=1"
if not exist "%LIVE%\node_modules\piratetok-live-js" set "NEED_INSTALL=1"
if /I "%~1"=="--reinstall" set "NEED_INSTALL=1"

if not defined NEED_INSTALL (
  echo [2/5] Dependency da co san.
  goto :deps_ok
)
echo [2/5] Dang cai dependency cho LIVE (lan dau hoi lau)...
pushd "%LIVE%"
call npm install --no-fund --no-audit
if errorlevel 1 (
  echo [LOI] npm install that bai. Kiem tra mang Internet roi chay lai.
  popd
  pause
  exit /b 1
)
popd
:deps_ok

rem ---------- 3. Server LIVE ----------
netstat -ano | findstr /R /C:":%LIVE_PORT% .*LISTENING" >nul
if not errorlevel 1 (
  echo [3/5] Cong %LIVE_PORT% dang duoc dung, coi nhu server LIVE da chay san.
  goto :live_ok
)
echo [3/5] Dang mo server LIVE tai http://localhost:%LIVE_PORT% ...
start "City Beer LIVE - BEAR DEV" /D "%LIVE%" cmd /k "set PORT=%LIVE_PORT%&& npm start"
:live_ok

rem ---------- 4. Web demo tinh ----------
netstat -ano | findstr /R /C:":%WEB_PORT% .*LISTENING" >nul
if not errorlevel 1 (
  echo [4/5] Cong %WEB_PORT% dang duoc dung, coi nhu web demo da chay san.
  goto :web_ok
)
echo [4/5] Dang mo web demo tai http://localhost:%WEB_PORT% ...
start "City Beer Web - BEAR DEV" /D "%ROOT%" cmd /k npx --yes serve . -l %WEB_PORT%
:web_ok

rem ---------- 5. Mo trinh duyet ----------
echo [5/5] Cho server khoi dong...
call :wait_port %LIVE_PORT% 20
start "" "http://localhost:%WEB_PORT%"
start "" "http://localhost:%LIVE_PORT%/live/control.html"

echo.
echo ==================================================
echo   Da mo xong!
echo   Web demo : http://localhost:%WEB_PORT%
echo   Control  : http://localhost:%LIVE_PORT%/live/control.html
echo   Overlay  : http://localhost:%LIVE_PORT%/live/overlay.html
echo            (OBS: Browser source 1080x1920)
echo.
echo   Dong hai cua so server de dung ung dung.
echo   Cai lai dependency: run.bat --reinstall
echo ==================================================
ping -n 9 127.0.0.1 >nul
endlocal
exit /b 0

rem ---------- Ham phu ----------
:wait_port
rem %1 = cong, %2 = so giay toi da
set /a "_left=%~2"
:wait_loop
netstat -ano | findstr /R /C:":%~1 .*LISTENING" >nul
if not errorlevel 1 exit /b 0
if %_left% LEQ 0 exit /b 1
set /a "_left-=1"
ping -n 2 127.0.0.1 >nul
goto :wait_loop

:no_node
echo [LOI] Chua tim thay Node.js / npm.
where winget >nul 2>nul
if errorlevel 1 (
  echo Tai Node.js LTS tai https://nodejs.org roi chay lai run.bat.
  pause
  exit /b 1
)
choice /C YN /N /M "Tu dong cai Node.js LTS bang winget? [Y/N]: "
if errorlevel 2 exit /b 1
winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements
echo.
echo Da cai xong. Dong cua so nay roi nhap dup run.bat lai.
pause
exit /b 0
