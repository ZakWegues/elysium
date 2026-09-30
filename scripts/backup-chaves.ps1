<#
  Backup das chaves de assinatura (fase 13, bloco 113).

  USO
    powershell -ExecutionPolicy Bypass -File scripts\backup-chaves.ps1 -Destino E:\chaves-elysium
    (rodar de novo com outro -Destino para a segunda cópia: pendrive E nuvem)

  POR QUE
    Sem a chave do APK, nenhuma versão nova do ELYSIUM-M instala por cima da atual: o
    atualizador do celular para de funcionar e o app tem de ser desinstalado (perde o
    pareamento e o histórico local). A chave morava só em %USERPROFILE%\Android, sem cópia,
    desde agosto (pendência 2 da §15). O certificado que assina o instalador do PC (bloco
    115) entra aqui também quando existir.

  O QUE FAZ
    1. Copia os arquivos para o destino.
    2. Confere a cópia: hash SHA-256 igual e o keytool consegue ABRIR o keystore copiado
       com a senha do .properties (uma cópia que não abre não é backup).
    3. Anota em %APPDATA%\elysium\backup-chaves.json quando e para onde — é o que o card
       Saúde do ELYSIUM lê para parar de avisar.

  Nunca imprime senha. Nada disto vai para o git.
#>
param(
  [Parameter(Mandatory = $true)][string]$Destino,
  # Só para teste automático: pula a exportação do .pfx (que pede senha).
  [switch]$SemPfx
)
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$pastaAndroid = Join-Path $env:USERPROFILE "Android"
$arquivos = @(
  (Join-Path $pastaAndroid "neuroaxis-release.keystore"),
  (Join-Path $pastaAndroid "neuroaxis-signing.properties")
)

foreach ($a in $arquivos) {
  if (-not (Test-Path -LiteralPath $a)) { throw "Não achei $a" }
}

New-Item -ItemType Directory -Force -Path $Destino | Out-Null
foreach ($a in $arquivos) {
  $copia = Join-Path $Destino (Split-Path $a -Leaf)
  Copy-Item -LiteralPath $a -Destination $copia -Force
  $h1 = (Get-FileHash -LiteralPath $a -Algorithm SHA256).Hash
  $h2 = (Get-FileHash -LiteralPath $copia -Algorithm SHA256).Hash
  if ($h1 -ne $h2) { throw "A cópia de $(Split-Path $a -Leaf) não confere (hash diferente)." }
  Write-Output "ok  $(Split-Path $a -Leaf)"
}

# O keystore copiado abre com a senha do .properties?
$props = @{}
foreach ($linha in Get-Content -LiteralPath (Join-Path $pastaAndroid "neuroaxis-signing.properties")) {
  if ($linha -match '^\s*([A-Z_]+)\s*=\s*(.*)$') { $props[$Matches[1]] = $Matches[2].Trim() }
}
$senha = $props["NEUROAXIS_STORE_PASSWORD"]
if (-not $senha) { $senha = $props["ELYSIUM_STORE_PASSWORD"] }
$keytool = Get-ChildItem -Path (Join-Path $env:LOCALAPPDATA "Programs\Microsoft") -Filter keytool.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
if ($keytool -and $senha) {
  $saida = & $keytool.FullName -list -keystore (Join-Path $Destino "neuroaxis-release.keystore") -storepass $senha 2>&1
  if ($LASTEXITCODE -ne 0) { throw "O keystore copiado não abriu com a senha do .properties." }
  Write-Output "ok  o keystore copiado abre ($(($saida | Select-String 'PrivateKeyEntry').Count) chave privada)"
} else {
  Write-Output "!   keytool não encontrado: conferi só o hash"
}

# O certificado que assina o instalador do PC (bloco 115). Mora na loja do Windows deste
# usuário; o .pfx é a única forma de levá-lo para outro PC. Sem ele, uma reinstalação do
# Windows faz toda versão nova ser recusada pelo atualizador. A senha é pedida aqui e não
# fica gravada em lugar nenhum — anote-a junto do pendrive.
$cert = Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert | Where-Object { $_.Subject -eq "CN=ELYSIUM (Zak)" } | Select-Object -First 1
if ($cert -and -not $SemPfx) {
  $senhaPfx = Read-Host "Senha para proteger o certificado (.pfx)" -AsSecureString
  $destPfx = Join-Path $Destino "elysium-codesign.pfx"
  Export-PfxCertificate -Cert $cert -FilePath $destPfx -Password $senhaPfx -Force | Out-Null
  # Conferir que o .pfx abre com a senha dada (um .pfx que não abre não é backup).
  $lido = Get-PfxData -FilePath $destPfx -Password $senhaPfx
  if ($lido.EndEntityCertificates[0].Thumbprint -ne $cert.Thumbprint) { throw "O .pfx exportado não confere." }
  Write-Output "ok  elysium-codesign.pfx (certificado do instalador, $($cert.Thumbprint.Substring(0,8))...)"
} elseif (-not $cert) {
  Write-Output "!   certificado do instalador não encontrado nesta loja (bloco 115)"
}

# Anota para o card Saúde.
$registro = Join-Path $env:APPDATA "elysium\backup-chaves.json"
$atual = @{ destinos = @() }
if (Test-Path -LiteralPath $registro) {
  try { $atual = Get-Content -LiteralPath $registro -Raw | ConvertFrom-Json } catch {}
}
$destinos = @($atual.destinos | Where-Object { $_ -and $_ -ne $Destino }) + $Destino
$novo = [ordered]@{ em = [DateTimeOffset]::Now.ToUnixTimeMilliseconds(); destinos = $destinos }
[System.IO.File]::WriteAllText($registro, ($novo | ConvertTo-Json -Compress), (New-Object System.Text.UTF8Encoding($false)))
Write-Output "Backup anotado. Guarde a pasta $Destino fora deste PC."
