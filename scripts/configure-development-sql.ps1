param(
    [Parameter(Mandatory = $true)][string]$LegacyRoot,
    [Parameter(Mandatory = $true)][string]$ExpectedServer
)
# User-confirmed development target only. No SQL commands or server changes.
# Credentials are copied into ignored private JSON, never stdout or dotenv values.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Data
$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot '.env.local'
if (Test-Path -LiteralPath $envPath) { throw 'Private configuration already exists; review it rather than overwriting.' }
[xml]$web = Get-Content -Raw -LiteralPath (Join-Path $LegacyRoot 'Web.config')
[xml]$cfg = Get-Content -Raw -LiteralPath (Join-Path $LegacyRoot ([string]$web.configuration.connectionStrings.configSource))
$roles = [ordered]@{ secure='iCareSecureConnectionString'; nursery='iCareNurseryConnectionString'; school='iCareSchoolConnectionString' }
$privateDirectory = Join-Path $projectRoot '.local'
[void][System.IO.Directory]::CreateDirectory($privateDirectory)
$configs = @{}
foreach ($role in $roles.Keys) {
    $entry = @($cfg.connectionStrings.add | Where-Object name -eq $roles[$role])
    if ($entry.Count -ne 1) { throw 'Expected exactly one configured connection per role.' }
    $builder = New-Object System.Data.SqlClient.SqlConnectionStringBuilder([string]$entry[0].connectionString)
    try {
        if ($builder.DataSource -ne $ExpectedServer) { throw 'Configured server differs from the confirmed development target.' }
        if ($builder.IntegratedSecurity) { throw 'This bootstrap expects the audited SQL authentication configuration.' }
        $configs[$role] = [ordered]@{
            server=$builder.DataSource; database=$builder.InitialCatalog
            user=$builder.UserID; password=$builder.Password
            options=[ordered]@{ encrypt=$true; trustServerCertificate=$true; appName='iCarePortal-LocalDevelopment' }
        }
    } finally { $builder.Clear() }
}
$envLines = @(
    '# Private local development configuration. No Accounting/Logging connections.'
    'ICARE_LIVE_DATA_ENABLED=true'
    'ICARE_CENTER_WRITES_ENABLED=false'
    'ICARE_APP_ORIGIN=http://127.0.0.1:3000'
    'ICARE_DEV_SQL_COMPATIBILITY=true'
    ('ICARE_DEV_SQL_SERVER=' + $ExpectedServer)
)
foreach ($role in $roles.Keys) {
    $path = Join-Path $privateDirectory ('development-sql-' + $role + '.json')
    [System.IO.File]::WriteAllText($path, ($configs[$role] | ConvertTo-Json -Depth 5), [System.Text.UTF8Encoding]::new($false))
    $envLines += ('ICARE_SQL_' + $role.ToUpperInvariant() + '_FILE=' + ($path.Replace('\','/')))
}
[System.IO.File]::WriteAllLines($envPath, $envLines, [System.Text.UTF8Encoding]::new($false))
Write-Output 'Private development configuration created for Secure, Nursery and School. Profile writes are initially disabled.'
