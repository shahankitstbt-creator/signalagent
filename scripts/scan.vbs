' Hidden hourly screener (no console window). Scheduled by Windows Task Scheduler.
CreateObject("WScript.Shell").Run "cmd /c cd /d ""E:\tradingview"" && ""C:\Program Files\nodejs\node.exe"" scripts\screener.mjs --top 40", 0, False
