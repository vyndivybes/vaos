param(
    [Parameter(Mandatory=$true)][string]$PythonPath,
    [switch]$VoiceModel
)
$ErrorActionPreference = 'Stop'
$companionRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\apps\companion'))
$companionRuntime = Join-Path $companionRoot '.runtime'
& $PythonPath -m venv $companionRuntime
if ($LASTEXITCODE) { throw 'Python environment creation failed.' }
$companionPython = Join-Path $companionRuntime 'Scripts\python.exe'
& $companionPython -m pip install -r (Join-Path $companionRoot 'requirements.txt')
if ($LASTEXITCODE) { throw 'Python tool installation failed.' }
if ($VoiceModel) {
    & $companionPython (Join-Path $companionRoot 'setup_voice.py') --destination (Join-Path $companionRoot '.data\models\tiny.en')
    if ($LASTEXITCODE) { throw 'Voice model installation failed.' }
}
Write-Output 'Local tools prepared. Set VAOS_COMPANION_PYTHON to the environment python.exe, then run npm run companion.'
