[CmdletBinding()]
param(
    [string]$Game,
    [Parameter(Mandatory)][string]$Out,
    [switch]$Browser,
    [switch]$Full,
    [switch]$SkipUnit
)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '../..')).Path
$gameRoot = if ($Game) { (Resolve-Path -LiteralPath $Game).Path } else { $repo }
$resultRoot = [IO.Directory]::CreateDirectory($ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Out)).FullName
$log = Join-Path $resultRoot 'regression.txt'
$failures = [Collections.Generic.List[string]]::new()
$logEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $logEncoding
[IO.File]::WriteAllText($log, ('Star Breaker regression, ' + [DateTime]::UtcNow.ToString('o') + [Environment]::NewLine), $logEncoding)

function Write-CheckLine([string]$Line) {
    [IO.File]::AppendAllText($log, $Line + [Environment]::NewLine, $logEncoding)
    Write-Output $Line
}

function Invoke-Check([string]$Name, [string[]]$Arguments) {
    # Windows PowerShell wraps native stderr in ErrorRecord objects, even on a successful run.
    $ErrorActionPreference = 'Continue'
    Write-CheckLine "[start $Name]"
    & node @Arguments 2>&1 | ForEach-Object { Write-CheckLine $_.ToString() }
    $code = $LASTEXITCODE
    Write-CheckLine "[$Name $code]"
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
    foreach ($suite in 'menu-navigation','release-browser','controls-browser','rush-browser','boss-mechanics','tactics-feedback','cinematic-check','training','field','boss-retry','evolution-routes','mimic-attacks','difficulty','hit-feedback','sortie-start') {
        Invoke-Check $suite @((Join-Path $PSScriptRoot "$suite.cjs"), $gameRoot, (Join-Path $resultRoot $suite))
    }
}
if ($Full) {
    Invoke-Check 'balance-matrix' @((Join-Path $PSScriptRoot 'balance.cjs'), $gameRoot,
        (Join-Path $resultRoot 'balance.json'), '--release-matrix', '--strict')
}
if ($failures.Count) { throw ('Failed checks: ' + ($failures -join ', ')) }
