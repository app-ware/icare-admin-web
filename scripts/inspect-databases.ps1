param(
    [Parameter(Mandatory = $true)][string]$LegacyRoot,
    [ValidateSet('Active', 'Production', 'Local')][string]$Variant = 'Active',
    [string[]]$SelectedRoles = @('secure', 'nursery', 'school', 'accounting', 'logging')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Data

$legacyPath = [System.IO.Path]::GetFullPath($LegacyRoot)
[xml]$web = Get-Content -Raw -LiteralPath (Join-Path $legacyPath 'Web.config')
$relativeConfig = switch ($Variant) {
    'Production' { 'Configurations/ProductionConnectionStrings.config' }
    'Local' { 'Configurations/ConnectionStringsLocal.config' }
    default { [string]$web.configuration.connectionStrings.configSource }
}
[xml]$configuration = Get-Content -Raw -LiteralPath (Join-Path $legacyPath $relativeConfig)
$roles = [ordered]@{
    secure = 'iCareSecureConnectionString'
    nursery = 'iCareNurseryConnectionString'
    school = 'iCareSchoolConnectionString'
    accounting = 'iCareAccountingConnectionString'
    logging = 'iCareLogConnectionString'
}

$query = @'
SET NOCOUNT ON;
SET LOCK_TIMEOUT 5000;
SET DEADLOCK_PRIORITY LOW;
SELECT
  DB_NAME() AS database_name,
  CONVERT(nvarchar(128), SERVERPROPERTY('ProductVersion')) AS product_version,
  CONVERT(nvarchar(128), SERVERPROPERTY('Edition')) AS edition,
  CONVERT(nvarchar(128), DATABASEPROPERTYEX(DB_NAME(), 'Collation')) AS collation,
  CONVERT(nvarchar(32), DATABASEPROPERTYEX(DB_NAME(), 'Updateability')) AS updateability,
  HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'VIEW DEFINITION') AS can_view_definition,
  HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'CONTROL') AS has_database_control,
  IS_SRVROLEMEMBER('sysadmin') AS is_sysadmin,
  IS_MEMBER('db_owner') AS is_db_owner,
  (SELECT COUNT(*) FROM sys.tables WHERE is_ms_shipped = 0) AS table_count,
  (SELECT COUNT(*) FROM sys.procedures WHERE is_ms_shipped = 0) AS procedure_count,
  (SELECT COUNT(*) FROM sys.objects WHERE type IN ('FN','IF','TF') AND is_ms_shipped = 0) AS function_count,
  (SELECT COUNT(*) FROM sys.views WHERE is_ms_shipped = 0) AS view_count,
  (SELECT COUNT(*) FROM sys.triggers WHERE is_ms_shipped = 0) AS trigger_count,
  (SELECT COUNT(*) FROM sys.table_types WHERE is_user_defined = 1) AS table_type_count;
'@

$results = @()
foreach ($role in $SelectedRoles) {
    if (-not $roles.Contains($role)) { throw 'Unsupported database role' }
    $entry = @($configuration.connectionStrings.add | Where-Object { $_.name -eq $roles[$role] })
    if ($entry.Count -ne 1) {
        $results += [ordered]@{ role = $role; status = 'missing_configuration'; variant = $Variant }
        continue
    }
    $builder = New-Object System.Data.SqlClient.SqlConnectionStringBuilder([string]$entry[0].connectionString)
    $builder['Application Name'] = 'iCareSchemaAudit-ReadOnly'
    $builder['ApplicationIntent'] = 'ReadOnly'
    $builder['Connect Timeout'] = 10
    $builder['Persist Security Info'] = $false
    $builder['Pooling'] = $false
    $connection = New-Object System.Data.SqlClient.SqlConnection($builder.ConnectionString)
    try {
        $connection.Open()
        $command = $connection.CreateCommand()
        $command.CommandText = $query
        $command.CommandTimeout = 15
        $adapter = New-Object System.Data.SqlClient.SqlDataAdapter($command)
        $table = New-Object System.Data.DataTable
        [void]$adapter.Fill($table)
        $record = [ordered]@{ role = $role; status = 'connected'; variant = $Variant; application_intent = 'ReadOnly'; configured_encrypt = $builder.Encrypt }
        foreach ($column in $table.Columns) {
            $value = $table.Rows[0][$column.ColumnName]
            $record[$column.ColumnName] = if ($value -is [System.DBNull]) { $null } else { $value }
        }
        $results += $record
    }
    catch {
        # SQL exception text can contain host/login details. Never print it.
        $exception = $_.Exception
        $sqlNumbers = @()
        while ($exception) {
            if ($exception -is [System.Data.SqlClient.SqlException]) { $sqlNumbers += @($exception.Errors | ForEach-Object { $_.Number }) }
            $lastException = $exception
            $exception = $exception.InnerException
        }
        $nativeNumber = if ($lastException -is [System.ComponentModel.Win32Exception]) { $lastException.NativeErrorCode } else { $null }
        $results += [ordered]@{ role = $role; status = 'failed'; variant = $Variant; error_type = $lastException.GetType().Name; sql_error_numbers = $sqlNumbers; native_error_number = $nativeNumber }
    }
    finally {
        if ($adapter) { $adapter.Dispose(); $adapter = $null }
        if ($command) { $command.Dispose(); $command = $null }
        $connection.Dispose()
        $builder.Clear()
    }
}
$results | ConvertTo-Json -Depth 6
