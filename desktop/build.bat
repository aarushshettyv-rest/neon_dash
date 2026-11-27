@echo off
setlocal
cd /d "%~dp0"

set DIST=dist
set WV2=wv2pkg\lib\net462
set WV2N=wv2pkg\runtimes\win-x64\native

if not exist %DIST% mkdir %DIST%

copy /y "%WV2%\Microsoft.Web.WebView2.Core.dll" %DIST%\ >nul
copy /y "%WV2%\Microsoft.Web.WebView2.WinForms.dll" %DIST%\ >nul
copy /y "%WV2N%\WebView2Loader.dll" %DIST%\ >nul

for %%f in (
  index.html game.js styles.css manifest.json sw.js supabase-config.js
  discord-sdk.mjs icon.svg icon-180.png icon-192.png icon-512.png
  icon-ship-256.png icon-ship-512.png cover-1920x1080.png
  updates.html terms.html privacy.html Demonic-Saw.ndcl actions.json
) do copy /y "..\%%f" %DIST%\ >nul

C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe /nologo /target:winexe /platform:anycpu /utf8output /out:%DIST%\NeonDash.exe /r:%DIST%\Microsoft.Web.WebView2.WinForms.dll /r:%DIST%\Microsoft.Web.WebView2.Core.dll /r:System.dll /r:System.Drawing.dll /r:System.Windows.Forms.dll /r:System.Web.Extensions.dll NeonDash.cs

if errorlevel 1 (echo BUILD FAILED & exit /b 1)
echo Built %DIST%\NeonDash.exe
