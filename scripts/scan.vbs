' Hidden hourly scan — INTRADAY pre-move board (refreshes during market hours), then auto-publish.
CreateObject("WScript.Shell").Run "cmd /c cd /d ""E:\tradingview"" && ""C:\Program Files\nodejs\node.exe"" scripts\screener.mjs --tf intraday --limit 500 && ""C:\Program Files\nodejs\node.exe"" scripts\publish.mjs", 0, False
