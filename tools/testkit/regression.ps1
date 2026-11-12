[CmdletBinding()]
param(
    [string]$Game = (Join-Path $PSScriptRoot '../..'),
    [Parameter(Mandatory)][string]$Out,
    [switch]$Browser,
    [switch]$Full,
    [switch]$SkipUnit
)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$gameRoot = (Resolve-Path -LiteralPath $Game).Path
$resultRoot = [IO.Directory]::CreateDirectory($ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Out)).FullName
$log = Join-Path $resultRoot 'regression.txt'
$failures = [Collections.Generic.List[string]]::new()
Set-Content -LiteralPath $log -Value ('Star Breaker regression, ' + [DateTime]::UtcNow.ToString('o')) -Encoding UTF8

function Invoke-Check([string]$Name, [string[]]$Arguments) {
    & node @Arguments 2>&1 | Tee-Object -FilePath $log -Append
    $code = $LASTEXITCODE
    "[$Name $code]" | Tee-Object -FilePath $log -Append
    if ($code -ne 0) { $failures.Add($Name) }
}

if (!$SkipUnit) {
    if (!(Test-Path -LiteralPath (Join-Path $repo 'work/combat-check.cjs'))) {
        throw 'Run source unit checks from the repository, or use -SkipUnit -Browser with a frozen Game folder.'
    }
    foreach ($suite in 'alien-lives','audio','boss-signatures','combat','enemy-crossfire','guide','progression','sortie-profile','tactics','ultimate-classes','v13') {
        Invoke-Check $suite @((Join-Path $repo "work/$suite-check.cjs"))
    }
}
if ($Browser) {
    foreach ($suite in 'release-browser','rush-browser','boss-mechanics','tactics-feedback','cinematic-check','training','controls-browser','field','boss-retry','evolution-routes','battle-rewind','difficulty','hit-feedback','campaign-opening','menu-navigation') {
        Invoke-Check $suite @((Join-Path $PSScriptRoot "$suite.cjs"), $gameRoot, (Join-Path $resultRoot $suite))
    }
}
if ($Full) {
    Invoke-Check 'balance-matrix' @((Join-Path $PSScriptRoot 'balance.cjs'), $gameRoot,
        (Join-Path $resultRoot 'balance.json'), '--release-matrix', '--strict')
}
if ($failures.Count) { throw ('Failed checks: ' + ($failures -join ', ')) }
