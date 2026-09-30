param(
  [string]$Config = (Join-Path $PSScriptRoot 'config\ai.openai.example.json'),
  [string]$Model = ''
)
$ErrorActionPreference = 'Stop'
$settings = Get-Content -LiteralPath $Config -Raw | ConvertFrom-Json
$keyName = if ($settings.keyEnvironmentVariable) { $settings.keyEnvironmentVariable } else { 'CDA_AI_KEY' }
if ($keyName -notmatch '^[A-Za-z_][A-Za-z0-9_]*$') { throw 'Invalid key environment variable name.' }
$oldKey = [Environment]::GetEnvironmentVariable($keyName, 'Process')
$oldMode = $env:CDA_MODEL_MODE
$oldConfig = $env:CDA_AI_CONFIG
$oldModel = $env:CDA_AI_MODEL
$oldHost = $env:CDA_HOST
try {
  if (-not $oldKey) {
    $secureKey = Read-Host 'API key (hidden; this process only)' -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
    try { [Environment]::SetEnvironmentVariable($keyName, [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr).Trim(), 'Process') }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr); $secureKey.Dispose() }
  }
  if (-not $Model -and -not $settings.model -and -not $settings.omitModel) { $Model = Read-Host 'API model ID (from your account or company)' }
  $env:CDA_MODEL_MODE = 'real'
  $env:CDA_AI_CONFIG = (Resolve-Path -LiteralPath $Config).Path
  $env:CDA_AI_MODEL = $Model
  $env:CDA_HOST = '127.0.0.1'
  & node (Join-Path $PSScriptRoot 'server.js')
} finally {
  [Environment]::SetEnvironmentVariable($keyName, $oldKey, 'Process')
  $env:CDA_MODEL_MODE = $oldMode
  $env:CDA_AI_CONFIG = $oldConfig
  $env:CDA_AI_MODEL = $oldModel
  $env:CDA_HOST = $oldHost
}
