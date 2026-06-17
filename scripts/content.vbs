' Hidden: render today's branded content images (content.json text comes from the scan).
CreateObject("WScript.Shell").Run "cmd /c cd /d ""E:\tradingview"" && ""C:\Program Files\nodejs\node.exe"" scripts\contentImages.mjs", 0, False
