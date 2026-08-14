' Lançador silencioso do NEUROAXIS.
'
' A pasta é derivada da localização deste próprio arquivo, e não escrita fixa: o
' repositório muda de lugar (foi para dentro da pasta-mãe ELYSIUM) e um caminho fixo
' faria o atalho falhar em silêncio, sem nenhuma janela de erro para explicar.

Dim fso, shell, dir
Set fso   = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")

dir = fso.GetParentFolderName(WScript.ScriptFullName)

' Compila só na primeira vez (quando dist ainda não existe).
If Not fso.FolderExists(dir & "\dist") Then
  shell.Run "cmd /c cd /d """ & dir & """ && npm run build", 0, True
End If

shell.Run """" & dir & "\node_modules\electron\dist\electron.exe"" """ & dir & """", 0, False
