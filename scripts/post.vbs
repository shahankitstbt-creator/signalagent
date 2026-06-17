' Hidden: publish pending content (dry-run until IG/YT tokens are in .env).
CreateObject("WScript.Shell").Run "cmd /c cd /d ""E:\tradingview"" && ""C:\Program Files\nodejs\node.exe"" scripts\poster.mjs", 0, False
