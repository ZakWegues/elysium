# Libera a porta do NEUROAXIS no Firewall do Windows para o túnel (Tailscale/ZeroTier).
#
# POR QUE ISTO É NECESSÁRIO
#
# As regras que o Windows criou sozinho para o Electron valem só no perfil "Privado".
# O adaptador do túnel nem sempre cai nesse perfil — quando cai em "Público", o
# firewall descarta a conexão do celular em silêncio, e o sintoma é idêntico ao de PC
# desligado: o app diz que não alcança e não há nada no log do NEUROAXIS.
#
# POR QUE A REGRA É ESTREITA
#
# Libera apenas duas origens: a faixa do Tailscale (100.64.0.0/10) e as redes locais
# privadas. Assim o acesso funciona em casa e pelo túnel, mas o PC continua fechado em
# qualquer outra rede a que se conecte — Wi-Fi de cafeteria, de hotel, de aeroporto.
# Uma regra "permitir de qualquer lugar" funcionaria igual e deixaria a porta exposta
# em todas elas.
#
# COMO RODAR
#   Clique com o botão direito neste arquivo → "Executar com o PowerShell" como
#   Administrador. Ou, num PowerShell elevado:
#     powershell -ExecutionPolicy Bypass -File .\scripts\liberar-acesso-remoto.ps1
#
# COMO DESFAZER
#   Remove-NetFirewallRule -DisplayName "NEUROAXIS - acesso remoto"

$ErrorActionPreference = 'Stop'

$RuleName = 'NEUROAXIS - acesso remoto'
$Port = 4200

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()
           ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host ''
    Write-Host '  Este script precisa ser executado como Administrador.' -ForegroundColor Yellow
    Write-Host '  Feche esta janela, clique com o botao direito no arquivo e escolha' -ForegroundColor Yellow
    Write-Host '  "Executar com o PowerShell" como Administrador.' -ForegroundColor Yellow
    Write-Host ''
    Read-Host 'Enter para sair'
    exit 1
}

# Faixa do Tailscale (CGNAT) + redes locais privadas. ZeroTier costuma usar 10.x,
# já coberto por 10.0.0.0/8.
$Origens = @(
    '100.64.0.0/10',
    '192.168.0.0/16',
    '10.0.0.0/8',
    '172.16.0.0/12'
)

# Recriar em vez de editar: mais simples de auditar e idempotente ao rodar de novo.
$existente = Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue
if ($existente) {
    Remove-NetFirewallRule -DisplayName $RuleName
    Write-Host '  Regra anterior removida.' -ForegroundColor DarkGray
}

New-NetFirewallRule `
    -DisplayName $RuleName `
    -Description 'Permite que o NEUROAXIS Portal alcance este PC pela rede local e pelo tunel (Tailscale/ZeroTier).' `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalPort $Port `
    -RemoteAddress $Origens `
    -Profile Any `
    -Enabled True | Out-Null

Write-Host ''
Write-Host "  Pronto. Porta $Port liberada para:" -ForegroundColor Green
foreach ($o in $Origens) { Write-Host "    - $o" -ForegroundColor Green }
Write-Host ''
Write-Host '  O PC continua fechado em qualquer outra rede.' -ForegroundColor DarkGray
Write-Host ''
Read-Host 'Enter para sair'
