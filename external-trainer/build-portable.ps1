param(
    [string]$Python = 'C:\Users\kevin\AppData\Local\Programs\Python\Python312\python.exe',
    [string]$Node = 'C:\Program Files\nodejs\node.exe',
    [string]$OutputRoot
)
$ErrorActionPreference = 'Stop'
$trainerRoot = $PSScriptRoot
if (-not $OutputRoot) { $OutputRoot = Join-Path (Split-Path $trainerRoot -Parent) 'output\trainer-portable' }
$buildRoot = Join-Path $OutputRoot ('build-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$bridgeRoot = Join-Path $buildRoot 'bridge'
$venvRoot = Join-Path $buildRoot 'venv'
$distRoot = Join-Path $buildRoot 'dist'
New-Item -ItemType Directory -Path $bridgeRoot -Force | Out-Null
& $Python -m venv $venvRoot
if ($LASTEXITCODE -ne 0) { throw 'Could not create packaging environment' }
$buildPython = Join-Path $venvRoot 'Scripts\python.exe'
& $buildPython -m pip install 'pyinstaller==6.16.0'
if ($LASTEXITCODE -ne 0) { throw 'Could not install the packager' }
foreach ($name in @('memory-bridge.mjs','targeting.mjs','geometry.mjs','page-overlay.mjs','settings-shortcut.mjs','survival.mjs','godmode.mjs','arena-data.mjs','package.json')) {
    Copy-Item -LiteralPath (Join-Path $trainerRoot $name) -Destination $bridgeRoot
}
$modules = Join-Path $bridgeRoot 'node_modules'
New-Item -ItemType Directory -Path (Join-Path $modules '@playwright'),(Join-Path $bridgeRoot 'runtime') -Force | Out-Null
foreach ($name in @('playwright','playwright-core','@playwright\test')) {
    Copy-Item -LiteralPath (Join-Path $trainerRoot ('node_modules\' + $name)) -Destination (Join-Path $modules $name) -Recurse
}
Copy-Item -LiteralPath $Node -Destination (Join-Path $bridgeRoot 'runtime\node.exe')
$nodeVersion = (& $Node --version).Trim()
if ($nodeVersion -notmatch '^v[0-9]+\.[0-9]+\.[0-9]+$') { throw 'Invalid Node runtime version' }
Invoke-WebRequest -Uri ("https://raw.githubusercontent.com/nodejs/node/" + $nodeVersion + "/LICENSE") -OutFile (Join-Path $bridgeRoot 'runtime\NODE-LICENSE.txt')
& $buildPython -m PyInstaller --noconfirm --onedir --console --name 'Abyss Trainer' --contents-directory '_internal' --paths $trainerRoot --hidden-import windows_overlay --hidden-import windows_settings --hidden-import preset_library --exclude-module overlay --distpath $distRoot --workpath (Join-Path $buildRoot 'work') --specpath $buildRoot --add-data ($bridgeRoot + ';.') (Join-Path $trainerRoot 'app.py')
if ($LASTEXITCODE -ne 0) { throw 'Executable build failed' }
$packageRoot = Join-Path $distRoot 'Abyss Trainer'
Copy-Item -LiteralPath (Join-Path $trainerRoot 'portable\Start Trainer.bat'),(Join-Path $trainerRoot 'portable\READ ME.txt') -Destination $packageRoot
$pythonLicense = Join-Path (Split-Path $Python -Parent) 'LICENSE.txt'
if (Test-Path $pythonLicense) { Copy-Item -LiteralPath $pythonLicense -Destination (Join-Path $packageRoot '_internal\PYTHON-LICENSE.txt') }
$zipPath = Join-Path $OutputRoot ('Abyss-Trainer-Windows-x64-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.zip')
Compress-Archive -LiteralPath $packageRoot -DestinationPath $zipPath -CompressionLevel Optimal
Get-FileHash -LiteralPath $zipPath -Algorithm SHA256 | Format-List
Write-Output "PACKAGE=$packageRoot"
Write-Output "ZIP=$zipPath"
