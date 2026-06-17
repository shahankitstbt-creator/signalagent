' Hidden app server (serves http://localhost:6767 + does a fresh scan on start).
' Scheduled to run at logon so the app is always available.
CreateObject("WScript.Shell").Run "cmd /c cd /d ""E:\tradingview"" && ""C:\Program Files\nodejs\node.exe"" scripts\server.mjs", 0, False
