# Build + testes do firmware das boias (build host).
#
#   powershell -ExecutionPolicy Bypass -File firmware\scripts\check.ps1
#
# Saida:
#   0  build limpo e todos os checks passaram
#   1  build falhou ou algum check falhou
#
# Opcional: se o GNATprove estiver instalado, tambem roda a prova formal.

$ErrorActionPreference = 'Stop'

$here    = Split-Path -Parent $MyInvocation.MyCommand.Path
$fwRoot  = Resolve-Path (Join-Path $here '..')
$proj    = Join-Path $fwRoot 'gnat\boias.gpr'
$exe     = Join-Path $fwRoot 'build\host\test_main.exe'

function Find-Tool([string]$Name) {
    $cmd = Get-Command $Name -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $fallback = Join-Path 'C:\msys64\ucrt64\bin' $Name
    if (Test-Path -LiteralPath $fallback) { return $fallback }
    return $null
}

$gprbuild = Find-Tool 'gprbuild.exe'
if (-not $gprbuild) {
    Write-Error "gprbuild nao encontrado. Instale o GNAT (via MSYS2 ou Alire)."
    exit 1
}

Write-Host "==> gprbuild : $gprbuild"
Write-Host "==> projeto  : $proj"
Write-Host ""

# ---------------------------------------------------------------------------
# 1. Build host
# ---------------------------------------------------------------------------
& $gprbuild -P $proj
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "BUILD FALHOU" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path -LiteralPath $exe)) {
    Write-Host "executavel de testes nao encontrado em $exe" -ForegroundColor Red
    exit 1
}

# ---------------------------------------------------------------------------
# 2. Testes Ada (logica SPARK)
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "==> rodando suite de testes Ada"
& $exe
$tests = $LASTEXITCODE

# ---------------------------------------------------------------------------
# 2b. Testes C (drivers de hardware)
# ---------------------------------------------------------------------------
$gcc = Find-Tool 'gcc.exe'
if ($gcc) {
    Write-Host ""
    Write-Host "==> compilando drivers C"
    $cBuild = Join-Path $fwRoot 'build\c'
    New-Item -ItemType Directory -Force -Path $cBuild | Out-Null

    $cFlags = @('-std=c11', '-Wall', '-Wextra', '-Werror', '-Wpedantic', '-O2',
                "-I$(Join-Path $fwRoot 'c\mag_sensor')",
                "-I$(Join-Path $fwRoot 'c\sx1262')")
    $cSrc = @(
        (Join-Path $fwRoot 'tests\c\test_c_drivers.c'),
        (Join-Path $fwRoot 'c\mag_sensor\mag_sensor.c'),
        (Join-Path $fwRoot 'c\sx1262\sx1262.c')
    )
    $cExe = Join-Path $cBuild 'test_c_drivers.exe'

    & $gcc @cFlags @cSrc -o $cExe
    if ($LASTEXITCODE -ne 0) {
        Write-Host "BUILD C FALHOU" -ForegroundColor Red
        exit 1
    }

    Write-Host "==> rodando suite de testes C"
    & $cExe
    if ($LASTEXITCODE -ne 0) {
        Write-Host "TESTES C FALHARAM" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "gcc nao encontrado -- testes C pulados." -ForegroundColor Yellow
}

# ---------------------------------------------------------------------------
# 3. Prova formal SPARK (opcional)
# ---------------------------------------------------------------------------
$gnatprove = Find-Tool 'gnatprove.exe'
if ($gnatprove) {
    Write-Host ""
    Write-Host "==> gnatprove (prova formal SPARK)"
    & $gnatprove -P $proj --level=2 --mode=check
    if ($LASTEXITCODE -ne 0) {
        Write-Host "PROVA FORMAL FALHOU" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host ""
    Write-Host "gnatprove nao instalado -- prova formal pulada." -ForegroundColor Yellow
    Write-Host "Para habilitar:  alr get gnatprove && alr toolchain --select gnatprove"
}

Write-Host ""
if ($tests -eq 0) {
    Write-Host "CHECK OK" -ForegroundColor Green
} else {
    Write-Host "CHECK FALHOU (ver saida acima)" -ForegroundColor Red
}
exit $tests
