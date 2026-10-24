param(
    [Parameter(Mandatory = $true)][string]$LegacyRoot,
    [ValidateSet('Active', 'Production', 'Local')][string]$Variant = 'Active',
    [string[]]$Roles = @('secure', 'nursery', 'school', 'accounting', 'logging')
)

# Explicit user authorization: inspect configured databases using metadata SELECTs
# only. ApplicationIntent is advisory; this script never executes business code.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Data
$legacyPath = [System.IO.Path]::GetFullPath($LegacyRoot)
$projectPath = [System.IO.Path]::GetFullPath((Get-Location).Path)
$outputRoot = Join-Path $projectPath ('.local/db-audit/' + $Variant.ToLowerInvariant())
[void][System.IO.Directory]::CreateDirectory($outputRoot)
[xml]$web = Get-Content -Raw -LiteralPath (Join-Path $legacyPath 'Web.config')
$relativeConfig = switch ($Variant) {
    'Production' { 'Configurations/ProductionConnectionStrings.config' }
    'Local' { 'Configurations/ConnectionStringsLocal.config' }
    default { [string]$web.configuration.connectionStrings.configSource }
}
[xml]$configuration = Get-Content -Raw -LiteralPath (Join-Path $legacyPath $relativeConfig)
$roleNames = [ordered]@{
    secure = 'iCareSecureConnectionString'; nursery = 'iCareNurseryConnectionString'
    school = 'iCareSchoolConnectionString'; accounting = 'iCareAccountingConnectionString'
    logging = 'iCareLogConnectionString'
}

$knownSecrets = New-Object 'System.Collections.Generic.HashSet[string]'
foreach ($file in Get-ChildItem -LiteralPath (Join-Path $legacyPath 'Configurations') -Filter '*ConnectionStrings*.config') {
    [xml]$xml = Get-Content -Raw -LiteralPath $file.FullName
    foreach ($entry in $xml.connectionStrings.add) {
        $secretBuilder = New-Object System.Data.SqlClient.SqlConnectionStringBuilder([string]$entry.connectionString)
        if ($secretBuilder.Password.Length -ge 6) { [void]$knownSecrets.Add($secretBuilder.Password) }
        $secretBuilder.Clear()
    }
}

function Protect-MetadataText([string]$Text) {
    if ($null -eq $Text) { return $null }
    $safe = $Text
    foreach ($secret in $knownSecrets) { $safe = $safe.Replace($secret, '[REDACTED_CONFIG_SECRET]') }
    $safe = [regex]::Replace($safe, '(?i)((?:ENCRYPT|DECRYPT)BYPASSPHRASE\s*\(\s*)N?''(?:''''|[^''])*''', '$1''[REDACTED_PASSPHRASE]''')
    $safe = [regex]::Replace($safe, '(?i)((?:PASSWORD|PWD|ACCESS_TOKEN|CLIENT_SECRET|MERCHANT_HASH_KEY)\s*=\s*)N?''(?:''''|[^''])+''', '$1''[REDACTED_SECRET]''')
    $safe = [regex]::Replace($safe, '(?im)(@\w*(?:password|pwd|token|secret|passphrase|hashkey|apikey)\w*[^\r\n;=]{0,100}=\s*)N?''(?:''''|[^''])+''', '$1''[REDACTED_SECRET]''')
    return $safe
}

function Convert-Table([System.Data.DataTable]$Table) {
    $rows = @()
    foreach ($row in $Table.Rows) {
        $record = [ordered]@{}
        foreach ($column in $Table.Columns) {
            $value = $row[$column.ColumnName]
            if ($value -is [System.DBNull]) { $value = $null }
            elseif ($value -is [string]) { $value = Protect-MetadataText $value }
            $record[$column.ColumnName] = $value
        }
        $rows += $record
    }
    return ,$rows
}

$queries = [ordered]@{
    environment = @'
SELECT DB_NAME() AS database_name, CONVERT(nvarchar(128),SERVERPROPERTY('ProductVersion')) AS product_version,
 CONVERT(nvarchar(128),SERVERPROPERTY('Edition')) AS edition, d.compatibility_level, d.collation_name,
 d.state_desc,d.user_access_desc,d.is_read_only,d.is_auto_close_on,d.is_auto_shrink_on,d.recovery_model_desc,
 d.snapshot_isolation_state_desc,d.is_read_committed_snapshot_on,d.is_trustworthy_on,d.is_db_chaining_on,
 HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','VIEW DEFINITION') AS can_view_definition,
 IS_SRVROLEMEMBER('sysadmin') AS is_sysadmin,IS_MEMBER('db_owner') AS is_db_owner
FROM sys.databases d WHERE d.database_id=DB_ID();
'@
    configured_catalogs = @'
SELECT name,state_desc,user_access_desc,is_read_only,compatibility_level
FROM sys.databases WHERE name IN ('icare','icare_school','icare_secure','icare_accounting','icare_log');
'@
    connection_security = @'
SELECT net_transport,protocol_type,encrypt_option,auth_scheme
FROM sys.dm_exec_connections WHERE session_id=@@SPID;
'@
    objects = @'
SELECT o.object_id,s.name AS schema_name,o.name,o.type,o.type_desc,o.create_date,o.modify_date
FROM sys.objects o JOIN sys.schemas s ON s.schema_id=o.schema_id
WHERE o.is_ms_shipped=0 ORDER BY s.name,o.name;
'@
    columns = @'
SELECT s.name AS schema_name,o.name AS object_name,o.type AS object_type,c.column_id,c.name,
 ty.name AS type_name,c.max_length,c.precision,c.scale,c.is_nullable,c.is_identity,c.collation_name,
 dc.definition AS default_definition,cc.definition AS computed_definition
FROM sys.objects o JOIN sys.schemas s ON s.schema_id=o.schema_id
JOIN sys.columns c ON c.object_id=o.object_id JOIN sys.types ty ON ty.user_type_id=c.user_type_id
LEFT JOIN sys.default_constraints dc ON dc.object_id=c.default_object_id
LEFT JOIN sys.computed_columns cc ON cc.object_id=c.object_id AND cc.column_id=c.column_id
WHERE o.is_ms_shipped=0 AND o.type IN ('U','V') ORDER BY s.name,o.name,c.column_id;
'@
    parameters = @'
SELECT s.name AS schema_name,o.name AS object_name,o.type_desc,p.parameter_id,p.name,
 ts.name AS type_schema,ty.name AS type_name,p.max_length,p.precision,p.scale,p.is_output,p.is_readonly,p.has_default_value
FROM sys.objects o JOIN sys.schemas s ON s.schema_id=o.schema_id
LEFT JOIN sys.parameters p ON p.object_id=o.object_id LEFT JOIN sys.types ty ON ty.user_type_id=p.user_type_id
LEFT JOIN sys.schemas ts ON ts.schema_id=ty.schema_id
WHERE o.is_ms_shipped=0 AND o.type IN ('P','PC','FN','IF','TF') ORDER BY s.name,o.name,p.parameter_id;
'@
    modules = @'
SELECT s.name AS schema_name,o.name,o.type_desc,o.object_id,
 OBJECTPROPERTY(o.object_id,'IsEncrypted') AS is_encrypted,
 m.uses_ansi_nulls,m.uses_quoted_identifier,m.is_schema_bound,m.execute_as_principal_id,m.definition
FROM sys.objects o JOIN sys.schemas s ON s.schema_id=o.schema_id
LEFT JOIN sys.sql_modules m ON m.object_id=o.object_id
WHERE o.is_ms_shipped=0 AND o.type IN ('P','PC','FN','IF','TF','V','TR') ORDER BY s.name,o.name;
'@
    indexes = @'
SELECT s.name AS schema_name,t.name AS table_name,i.name AS index_name,i.index_id,i.type_desc,
 i.is_primary_key,i.is_unique,i.is_unique_constraint,i.is_disabled,i.has_filter,i.filter_definition,
 ic.key_ordinal,ic.is_included_column,ic.is_descending_key,c.name AS column_name
FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id JOIN sys.indexes i ON i.object_id=t.object_id
JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id
JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
WHERE t.is_ms_shipped=0 ORDER BY s.name,t.name,i.index_id,ic.index_column_id;
'@
    foreign_keys = @'
SELECT fk.name,OBJECT_SCHEMA_NAME(fk.parent_object_id) AS source_schema,OBJECT_NAME(fk.parent_object_id) AS source_table,
 pc.name AS source_column,OBJECT_SCHEMA_NAME(fk.referenced_object_id) AS target_schema,
 OBJECT_NAME(fk.referenced_object_id) AS target_table,rc.name AS target_column,
 fk.delete_referential_action_desc,fk.update_referential_action_desc,fk.is_disabled,fk.is_not_trusted
FROM sys.foreign_keys fk JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id=fk.object_id
JOIN sys.columns pc ON pc.object_id=fkc.parent_object_id AND pc.column_id=fkc.parent_column_id
JOIN sys.columns rc ON rc.object_id=fkc.referenced_object_id AND rc.column_id=fkc.referenced_column_id
ORDER BY source_schema,source_table,fk.name,fkc.constraint_column_id;
'@
    check_constraints = @'
SELECT OBJECT_SCHEMA_NAME(parent_object_id) AS schema_name,OBJECT_NAME(parent_object_id) AS table_name,
 name,definition,is_disabled,is_not_trusted FROM sys.check_constraints ORDER BY schema_name,table_name,name;
'@
    table_types = @'
SELECT s.name AS schema_name,tt.name AS table_type_name,c.column_id,c.name,ty.name AS type_name,
 c.max_length,c.precision,c.scale,c.is_nullable
FROM sys.table_types tt JOIN sys.schemas s ON s.schema_id=tt.schema_id
JOIN sys.columns c ON c.object_id=tt.type_table_object_id JOIN sys.types ty ON ty.user_type_id=c.user_type_id
ORDER BY s.name,tt.name,c.column_id;
'@
    dependencies = @'
SELECT OBJECT_SCHEMA_NAME(referencing_id) AS source_schema,OBJECT_NAME(referencing_id) AS source_object,
 referenced_server_name,referenced_database_name,referenced_schema_name,referenced_entity_name,
 referenced_id,is_ambiguous FROM sys.sql_expression_dependencies ORDER BY source_schema,source_object;
'@
    synonyms = @'
SELECT SCHEMA_NAME(schema_id) AS schema_name,name,base_object_name FROM sys.synonyms ORDER BY schema_name,name;
'@
    row_estimates = @'
SELECT s.name AS schema_name,t.name AS table_name,SUM(p.rows) AS estimated_rows
FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id
JOIN sys.partitions p ON p.object_id=t.object_id AND p.index_id IN (0,1)
WHERE t.is_ms_shipped=0 GROUP BY s.name,t.name ORDER BY s.name,t.name;
'@
    permissions = @'
SELECT pe.grantee_principal_id,dp.type_desc AS principal_type,pe.state_desc,pe.permission_name,pe.class_desc,
 CASE WHEN pe.class=1 THEN OBJECT_SCHEMA_NAME(pe.major_id) END AS object_schema,
 CASE WHEN pe.class=1 THEN OBJECT_NAME(pe.major_id) END AS object_name
FROM sys.database_permissions pe JOIN sys.database_principals dp ON dp.principal_id=pe.grantee_principal_id
ORDER BY pe.grantee_principal_id,pe.class,pe.major_id,pe.permission_name;
'@
    role_memberships = @'
SELECT r.name AS role_name,m.principal_id AS member_principal_id,m.type_desc AS member_type
FROM sys.database_role_members rm JOIN sys.database_principals r ON r.principal_id=rm.role_principal_id
JOIN sys.database_principals m ON m.principal_id=rm.member_principal_id ORDER BY r.name,m.principal_id;
'@
    effective_permissions = @'
SELECT permission_name,subentity_name FROM fn_my_permissions(NULL,'DATABASE') ORDER BY permission_name;
'@
    encryption_metadata = @'
SELECT name,algorithm_desc,key_length FROM sys.symmetric_keys;
'@
}

$summary = @()
foreach ($role in $Roles) {
    if (-not $roleNames.Contains($role)) { throw 'Unsupported database role' }
    $entries = @($configuration.connectionStrings.add | Where-Object { $_.name -eq $roleNames[$role] })
    if ($entries.Count -ne 1) { $summary += @{ role = $role; status = 'missing_configuration' }; continue }
    $builder = New-Object System.Data.SqlClient.SqlConnectionStringBuilder([string]$entries[0].connectionString)
    $builder['Application Name'] = 'iCareSchemaAudit-ReadOnly'
    $builder['ApplicationIntent'] = 'ReadOnly'
    $builder['Connect Timeout'] = 10
    $builder['Persist Security Info'] = $false
    $builder['Pooling'] = $false
    $connection = New-Object System.Data.SqlClient.SqlConnection($builder.ConnectionString)
    $record = [ordered]@{ role = $role; variant = $Variant; inspected_at_utc = [DateTime]::UtcNow.ToString('o'); status = 'pending'; queries = [ordered]@{}; errors = @() }
    try {
        $connection.Open()
        foreach ($name in $queries.Keys) {
            $command = $connection.CreateCommand()
            $command.CommandTimeout = 30
            $command.CommandText = "SET NOCOUNT ON; SET LOCK_TIMEOUT 5000; SET DEADLOCK_PRIORITY LOW;`n" + $queries[$name]
            $adapter = New-Object System.Data.SqlClient.SqlDataAdapter($command)
            $table = New-Object System.Data.DataTable
            try {
                [void]$adapter.Fill($table)
                $record.queries[$name] = Convert-Table $table
            }
            catch {
                $exception = $_.Exception
                while ($exception.InnerException) { $exception = $exception.InnerException }
                $record.errors += @{ query = $name; error_type = $exception.GetType().Name; number = if ($exception -is [System.Data.SqlClient.SqlException]) { $exception.Number } else { $null } }
            }
            finally { $adapter.Dispose(); $command.Dispose(); $table.Dispose() }
        }
        $record.status = if ($record.errors.Count) { 'partial' } else { 'complete' }
    }
    catch {
        $record.status = 'connection_failed'
        $exception = $_.Exception
        while ($exception.InnerException) { $exception = $exception.InnerException }
        $record.errors += @{ error_type = $exception.GetType().Name; number = if ($exception -is [System.Data.SqlClient.SqlException]) { $exception.Number } else { $null } }
    }
    finally { $connection.Dispose(); $builder.Clear() }
    $output = Join-Path $outputRoot ($role + '.json')
    $record | ConvertTo-Json -Depth 14 | Set-Content -LiteralPath $output -Encoding utf8
    $summary += [ordered]@{ role = $role; status = $record.status; errors = $record.errors; row_counts = [ordered]@{}; path = '.local/db-audit/' + $Variant.ToLowerInvariant() + '/' + $role + '.json' }
    foreach ($name in $record.queries.Keys) { $summary[-1].row_counts[$name] = @($record.queries[$name]).Count }
    Write-Output ($summary[-1] | ConvertTo-Json -Depth 6 -Compress)
}
# Exports contain redacted metadata only. No application table rows or connection strings.
