' Hidden daily full-market screener (entire NSE equity). Scheduled by Windows Task Scheduler.
CreateObject("WScript.Shell").Run "cmd /c cd /d ""E:\tradingview"" && ""C:\Program Files\nodejs\node.exe"" scripts\screener.mjs --full --top 60", 0, False
