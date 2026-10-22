' =============================================================================
' start_server_background.vbs - Runs the server silently in the background
' without keeping a visible command prompt window open.
' =============================================================================
Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
strPath = fso.GetParentFolderName(WScript.ScriptFullName)

WshShell.CurrentDirectory = strPath
' Run run.bat with window style 0 (hidden)
WshShell.Run "cmd.exe /c run.bat", 0, False
