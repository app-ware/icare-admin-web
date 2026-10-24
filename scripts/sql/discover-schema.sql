/*
  iCare metadata discovery. Run separately in an approved STAGING COPY of each
  database: secure, nursery, school, accounting, log. Metadata SELECTs only.
  No business procedure execution, application data reads, DDL, or DML.
  VIEW DEFINITION may be needed; missing rows/NULL definitions are not absence.
  Module definitions may contain sensitive literals. Keep exports private.
*/
SET NOCOUNT ON;

SELECT DB_NAME() AS database_name, @@VERSION AS server_version,
       DATABASEPROPERTYEX(DB_NAME(), 'Collation') AS collation,
       compatibility_level, is_read_only, snapshot_isolation_state_desc,
       is_read_committed_snapshot_on
FROM sys.databases WHERE database_id = DB_ID();

SELECT s.name AS schema_name, t.name AS table_name, c.column_id,
       c.name AS column_name, ty.name AS type_name, c.max_length,
       c.precision, c.scale, c.is_nullable, c.is_identity, c.collation_name,
       dc.definition AS default_definition, cc.definition AS computed_definition
FROM sys.tables t
JOIN sys.schemas s ON s.schema_id = t.schema_id
JOIN sys.columns c ON c.object_id = t.object_id
JOIN sys.types ty ON ty.user_type_id = c.user_type_id
LEFT JOIN sys.default_constraints dc ON dc.object_id = c.default_object_id
LEFT JOIN sys.computed_columns cc ON cc.object_id = c.object_id AND cc.column_id = c.column_id
WHERE t.is_ms_shipped = 0
ORDER BY s.name, t.name, c.column_id;

SELECT s.name AS schema_name, t.name AS table_name, i.name AS index_name,
       i.type_desc, i.is_primary_key, i.is_unique, i.is_unique_constraint,
       i.is_disabled, i.has_filter, i.filter_definition,
       ic.key_ordinal, ic.is_included_column, ic.is_descending_key, c.name AS column_name
FROM sys.tables t
JOIN sys.schemas s ON s.schema_id = t.schema_id
JOIN sys.indexes i ON i.object_id = t.object_id
JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
WHERE t.is_ms_shipped = 0
ORDER BY s.name, t.name, i.index_id, ic.index_column_id;

SELECT fk.name, OBJECT_SCHEMA_NAME(fk.parent_object_id) AS source_schema,
       OBJECT_NAME(fk.parent_object_id) AS source_table, pc.name AS source_column,
       OBJECT_SCHEMA_NAME(fk.referenced_object_id) AS target_schema,
       OBJECT_NAME(fk.referenced_object_id) AS target_table, rc.name AS target_column,
       fk.delete_referential_action_desc, fk.update_referential_action_desc,
       fk.is_disabled, fk.is_not_trusted
FROM sys.foreign_keys fk
JOIN sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
JOIN sys.columns pc ON pc.object_id = fkc.parent_object_id AND pc.column_id = fkc.parent_column_id
JOIN sys.columns rc ON rc.object_id = fkc.referenced_object_id AND rc.column_id = fkc.referenced_column_id
ORDER BY source_schema, source_table, fk.name, fkc.constraint_column_id;

SELECT OBJECT_SCHEMA_NAME(parent_object_id) AS schema_name,
       OBJECT_NAME(parent_object_id) AS table_name, name,
       definition, is_disabled, is_not_trusted
FROM sys.check_constraints ORDER BY schema_name, table_name, name;

SELECT s.name AS schema_name, o.name AS object_name, o.type_desc,
       p.parameter_id, p.name AS parameter_name, ts.name AS type_schema,
       ty.name AS type_name, p.max_length, p.precision, p.scale,
       p.is_output, p.is_readonly, p.has_default_value
FROM sys.objects o
JOIN sys.schemas s ON s.schema_id = o.schema_id
LEFT JOIN sys.parameters p ON p.object_id = o.object_id
LEFT JOIN sys.types ty ON ty.user_type_id = p.user_type_id
LEFT JOIN sys.schemas ts ON ts.schema_id = ty.schema_id
WHERE o.type IN ('P','PC','FN','IF','TF') AND o.is_ms_shipped = 0
ORDER BY s.name, o.name, p.parameter_id;

SELECT s.name AS schema_name, tt.name AS table_type_name,
       c.column_id, c.name AS column_name, ty.name AS type_name,
       c.max_length, c.precision, c.scale, c.is_nullable
FROM sys.table_types tt
JOIN sys.schemas s ON s.schema_id = tt.schema_id
JOIN sys.columns c ON c.object_id = tt.type_table_object_id
JOIN sys.types ty ON ty.user_type_id = c.user_type_id
ORDER BY s.name, tt.name, c.column_id;

SELECT s.name AS schema_name, o.name AS object_name, o.type_desc,
       OBJECTPROPERTY(o.object_id, 'IsEncrypted') AS is_encrypted,
       m.uses_ansi_nulls, m.uses_quoted_identifier,
       m.is_schema_bound, m.execute_as_principal_id, m.definition
FROM sys.objects o
JOIN sys.schemas s ON s.schema_id = o.schema_id
LEFT JOIN sys.sql_modules m ON m.object_id = o.object_id
WHERE o.type IN ('P','PC','FN','IF','TF','V','TR') AND o.is_ms_shipped = 0
ORDER BY s.name, o.name;

SELECT OBJECT_SCHEMA_NAME(referencing_id) AS source_schema,
       OBJECT_NAME(referencing_id) AS source_object,
       referenced_server_name, referenced_database_name,
       referenced_schema_name, referenced_entity_name, is_ambiguous
FROM sys.sql_expression_dependencies
ORDER BY source_schema, source_object;

SELECT SCHEMA_NAME(schema_id) AS schema_name, name, base_object_name
FROM sys.synonyms ORDER BY schema_name, name;

SELECT s.name AS schema_name, t.name AS table_name, SUM(p.rows) AS estimated_rows
FROM sys.tables t
JOIN sys.schemas s ON s.schema_id = t.schema_id
JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0,1)
WHERE t.is_ms_shipped = 0
GROUP BY s.name, t.name ORDER BY s.name, t.name;

SELECT dp.name AS principal_name, dp.type_desc, pe.state_desc,
       pe.permission_name, pe.class_desc,
       CASE WHEN pe.class = 1 THEN OBJECT_SCHEMA_NAME(pe.major_id) END AS object_schema,
       CASE WHEN pe.class = 1 THEN OBJECT_NAME(pe.major_id) END AS object_name
FROM sys.database_permissions pe
JOIN sys.database_principals dp ON dp.principal_id = pe.grantee_principal_id
ORDER BY dp.name, pe.class, pe.major_id, pe.permission_name;

SELECT r.name AS role_name, m.name AS member_name
FROM sys.database_role_members rm
JOIN sys.database_principals r ON r.principal_id = rm.role_principal_id
JOIN sys.database_principals m ON m.principal_id = rm.member_principal_id
ORDER BY r.name, m.name;
