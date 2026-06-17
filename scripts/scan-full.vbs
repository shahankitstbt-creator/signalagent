' Hidden daily scan — full-market DAILY board + WEEKLY positional board, then auto-publish.
CreateObject("WScript.Shell").Run "cmd /c cd /d ""E:\tradingview"" && ""C:\Program Files\nodejs\node.exe"" scripts\screener.mjs --full --top 60 && ""C:\Program Files\nodejs\node.exe"" scripts\screener.mjs --tf weekly && ""C:\Program Files\nodejs\node.exe"" scripts\publish.mjs", 0, False
