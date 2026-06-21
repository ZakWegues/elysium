Dim dir
dir = "C:\Users\ZAK\neuroaxis"
Set fso   = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

' Build first time only (dist not present)
If Not fso.FolderExists(dir & "\dist") Then
  shell.Run "cmd /c cd /d """ & dir & """ && npm run build", 0, True
End If

shell.Run """" & dir & "\node_modules\electron\dist\electron.exe"" """ & dir & """", 0, False
