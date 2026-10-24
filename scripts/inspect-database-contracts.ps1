param([Parameter(Mandatory = $true)][string]$LegacyRoot)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Data
[xml]$web = Get-Content -Raw -LiteralPath (Join-Path $LegacyRoot 'Web.config')
[xml]$configuration = Get-Content -Raw -LiteralPath (Join-Path $LegacyRoot ([string]$web.configuration.connectionStrings.configSource))
$inventory = Get-Content -Raw -LiteralPath 'docs/generated/legacy-inventory.json' | ConvertFrom-Json
$procedureNames = @($inventory.procedures | Where-Object { $_ -like '*get*' -or $_ -eq 'authenticateDealer' })
$roleNames = @{secure='iCareSecureConnectionString';nursery='iCareNurseryConnectionString';school='iCareSchoolConnectionString'}
$lookupQueries = @{
 secure = [ordered]@{
  admin_pages='SELECT TOP (100) admin_page_id,admin_page_title FROM dbo.Admin_Pages ORDER BY admin_page_id;'
  center_types='SELECT TOP (100) center_type_id,center_type_title FROM dbo.Center_Types ORDER BY center_type_id;'
  currencies='SELECT TOP (100) currency_id,currency_name,currency_desc FROM dbo.Currency ORDER BY currency_id;'
  statuses='SELECT TOP (100) status_id,status_title FROM dbo.Center_Status_Reference ORDER BY status_id;'
 }
 nursery = [ordered]@{
  input_types='SELECT TOP (100) input_type_id,input_type_desc,is_enabled FROM dbo.Input_Type ORDER BY input_type_id;'
  dwell_values='SELECT TOP (100) dwell_duration_id,duration_value,duration_text FROM dbo.DwellDuration_Values ORDER BY dwell_duration_id;'
  geofence_values='SELECT TOP (100) geofence_raduis_id,raduis_value,raduis_text FROM dbo.GeofenceRaduis_Values ORDER BY geofence_raduis_id;'
 }
 school = [ordered]@{
  input_types='SELECT TOP (100) input_type_id,input_type_desc,is_enabled FROM dbo.Input_Type ORDER BY input_type_id;'
  dwell_values='SELECT TOP (100) dwell_duration_id,duration_value,duration_text FROM dbo.DwellDuration_Values ORDER BY dwell_duration_id;'
  geofence_values='SELECT TOP (100) geofence_raduis_id,raduis_value,raduis_text FROM dbo.GeofenceRaduis_Values ORDER BY geofence_raduis_id;'
 }
}
function Read-Rows([System.Data.SqlClient.SqlConnection]$Connection,[string]$Sql,[string]$QualifiedName='') {
 $command=$Connection.CreateCommand();$command.CommandTimeout=15
 $command.CommandText="SET NOCOUNT ON; SET LOCK_TIMEOUT 5000; SET DEADLOCK_PRIORITY LOW;`n"+$Sql
 if($QualifiedName){[void]$command.Parameters.Add('@qualified', [System.Data.SqlDbType]::NVarChar, 500);$command.Parameters['@qualified'].Value=$QualifiedName}
 $adapter=New-Object System.Data.SqlClient.SqlDataAdapter($command);$table=New-Object System.Data.DataTable
 try {
  [void]$adapter.Fill($table);$result=@()
  foreach($row in $table.Rows){$record=[ordered]@{};foreach($column in $table.Columns){$record[$column.ColumnName]=if($row[$column.ColumnName] -is [DBNull]){$null}else{$row[$column.ColumnName]}};$result+=$record}
  return ,$result
 } finally {$table.Dispose();$adapter.Dispose();$command.Dispose()}
}
foreach($role in @('secure','nursery','school')){
 $entry=@($configuration.connectionStrings.add|Where-Object{$_.name -eq $roleNames[$role]})[0]
 $builder=New-Object System.Data.SqlClient.SqlConnectionStringBuilder([string]$entry.connectionString)
 $builder['Application Name']='iCareSchemaAudit-ReadOnly';$builder['ApplicationIntent']='ReadOnly';$builder['Connect Timeout']=10;$builder['Pooling']=$false;$builder['Persist Security Info']=$false
 $connection=New-Object System.Data.SqlClient.SqlConnection($builder.ConnectionString)
 $result=[ordered]@{role=$role;lookups=[ordered]@{};result_metadata=[ordered]@{};metadata_errors=@()}
 try{
  $connection.Open()
  foreach($lookup in $lookupQueries[$role].Keys){$result.lookups[$lookup]=Read-Rows $connection $lookupQueries[$role][$lookup]}
  foreach($name in $procedureNames){
   $exists=Read-Rows $connection 'SELECT OBJECT_ID(@qualified,''P'') AS object_id;' ('dbo.'+$name)
   if(-not $exists[0].object_id){continue}
   try{
    $result.result_metadata[$name]=Read-Rows $connection @'
SELECT column_ordinal,name,is_nullable,system_type_name,error_number,error_type_desc
FROM sys.dm_exec_describe_first_result_set_for_object(OBJECT_ID(@qualified),0)
ORDER BY column_ordinal;
'@ ('dbo.'+$name)
   }catch{$result.metadata_errors+=@{procedure=$name;status='metadata_unavailable'}}
  }
  $path='.local/db-audit/active/'+$role+'-contracts.json'
  $result|ConvertTo-Json -Depth 12|Set-Content -LiteralPath $path -Encoding utf8
  [ordered]@{role=$role;lookup_sets=$result.lookups.Count;procedures_described=$result.result_metadata.Count;metadata_errors=$result.metadata_errors}|ConvertTo-Json -Compress -Depth 5
 }finally{$connection.Dispose();$builder.Clear()}
}
# Only fixed, bounded, non-personal reference tables and system metadata functions
# are read. No application stored procedure/function or customer data query runs.
