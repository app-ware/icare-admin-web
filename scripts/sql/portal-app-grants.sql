/* Review-only provisioning script. NOT executed by the portal or audit tools.
   A SQL administrator must first create a NEW dedicated login named
   icare_portal_app with a generated password, password policy enabled,
   and default database icare_secure. Keep the password in private config.
   Never map this script to the legacy administrator login.
   Run only after the owner approves these persistent access changes.
   No Accounting/Logging access, table creation, seed repair or business writes.
   Column UPDATE grants permit the application's scoped profile editor.
   SQL credentials remain server-only: application authorization enforces rows.
*/
USE [icare_secure];
SET XACT_ABORT ON;
IF SUSER_ID(N'icare_portal_app') IS NULL
    THROW 51000, 'Create the dedicated application login before applying grants.', 1;
IF IS_SRVROLEMEMBER(N'sysadmin', N'icare_portal_app') <> 0
    THROW 51000, 'Application login must not be sysadmin.', 1;
IF EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'icare_portal_app')
    THROW 51000, 'Expected a fresh identity; review existing permissions separately.', 1;
IF EXISTS (SELECT 1 FROM icare.sys.database_principals WHERE name = N'icare_portal_app')
    THROW 51000, 'Expected a fresh identity in Nursery.', 1;
IF EXISTS (SELECT 1 FROM icare_school.sys.database_principals WHERE name = N'icare_portal_app')
    THROW 51000, 'Expected a fresh identity in School.', 1;

BEGIN TRY
    BEGIN TRANSACTION;
    CREATE USER [icare_portal_app] FOR LOGIN [icare_portal_app];
    GRANT EXECUTE ON OBJECT::dbo.authenticateDealer TO [icare_portal_app];
    GRANT EXECUTE ON OBJECT::dbo.getHashedPassword TO [icare_portal_app];
    GRANT SELECT ON OBJECT::dbo.Dealers
        (dealer_id, dealer_name, username, user_email, creation_date, is_super_admin, is_active, user_password, password_salt)
        TO [icare_portal_app];
    -- Hash/salt columns are used only server-side to derive the session stamp.
    GRANT SELECT ON OBJECT::dbo.Dealer_Centers (dealer_id, center_id, center_type)
        TO [icare_portal_app];
    -- Page 7 gives report access, page 8 alert reads, and page 9 status reads only.
    GRANT SELECT ON OBJECT::dbo.Dealer_Page_Center_Access (dealer_id, center_id, center_type, page_id)
        TO [icare_portal_app];
    -- Dealer administration uses fixed commands with a current active-admin check.
    -- Account deletion, password readback and token administration are not exposed.
    -- SQL Server INSERT grants are object-level, not column-level. Runtime
    -- commands allowlist inserted columns; use reviewed procedure wrappers if
    -- production requires a narrower database-side insertion boundary.
    GRANT INSERT ON OBJECT::dbo.Dealers TO [icare_portal_app];
    GRANT UPDATE ON OBJECT::dbo.Dealers (dealer_name, user_email, is_active, is_super_admin)
        TO [icare_portal_app];
    GRANT INSERT ON OBJECT::dbo.Dealer_Centers TO [icare_portal_app];
    GRANT DELETE ON OBJECT::dbo.Dealer_Centers TO [icare_portal_app];
    GRANT SELECT ON OBJECT::dbo.Center_Domains (ID, center_id, center_type, center_domain)
        TO [icare_portal_app];
    GRANT SELECT ON OBJECT::dbo.Center_Status (ID, center_id, center_type, activation_status, update_time)
        TO [icare_portal_app];
    -- Separate runtime status-write switch; fixed transactions recheck ownership.
    GRANT INSERT ON OBJECT::dbo.Center_Status TO [icare_portal_app];
    GRANT UPDATE ON OBJECT::dbo.Center_Status (activation_status, update_time) TO [icare_portal_app];
    -- Existing center-user management does not read credentials or change roles.
    GRANT SELECT ON OBJECT::dbo.Center_Users
        (ID, username, center_id, center_user_id, center_type, is_admin, is_super_admin, is_active)
        TO [icare_portal_app];
    GRANT UPDATE ON OBJECT::dbo.Center_Users (is_active) TO [icare_portal_app];

    USE [icare];
    CREATE USER [icare_portal_app] FOR LOGIN [icare_portal_app];
    GRANT SELECT ON OBJECT::dbo.Care_Center
        (center_id, type, center_name, center_manager, center_email, center_mobile,
         center_land_line, center_website, center_address, center_description,
         center_location, time_zone) TO [icare_portal_app];
    GRANT UPDATE ON OBJECT::dbo.Care_Center
        (center_name, center_manager, center_email, center_mobile, center_land_line,
         center_website, center_address, center_description, center_location)
        TO [icare_portal_app];
    -- Bus settings: separate disabled-by-default switch. No driver/child/location reads.
    GRANT SELECT ON OBJECT::dbo.Bus_Type (bus_type_id,center_id,bus_name) TO [icare_portal_app];
    GRANT SELECT ON OBJECT::dbo.Bus_Settings
        (bus_settings_id,bus_id,geofence_raduis,dwell_duration,passenger_input_type) TO [icare_portal_app];
    GRANT SELECT ON OBJECT::dbo.DwellDuration_Values (dwell_duration_id,duration_value,duration_text) TO [icare_portal_app];
    GRANT SELECT ON OBJECT::dbo.GeofenceRaduis_Values (geofence_raduis_id,raduis_value,raduis_text) TO [icare_portal_app];
    GRANT SELECT ON OBJECT::dbo.Input_Type (input_type_id,input_type_desc,is_enabled) TO [icare_portal_app];
    GRANT INSERT ON OBJECT::dbo.Bus_Settings TO [icare_portal_app];
    GRANT UPDATE ON OBJECT::dbo.Bus_Settings (geofence_raduis,dwell_duration,passenger_input_type) TO [icare_portal_app];
    GRANT DELETE ON OBJECT::dbo.Bus_Settings TO [icare_portal_app];
    -- Production procedure wrappers can further enforce the bus_id<>-1 boundary at SQL level.
    -- Independent alert-write switch. Runtime locks/rechecks scope; no legacy logger calls.
    GRANT SELECT ON OBJECT::dbo.Center_Alert_Message
        (alert_message_id, center_id, dealer_id, message_text, alert_expiry_date, update_time) TO [icare_portal_app];
    GRANT INSERT ON OBJECT::dbo.Center_Alert_Message TO [icare_portal_app];
    GRANT UPDATE ON OBJECT::dbo.Center_Alert_Message
        (dealer_id, message_text, alert_expiry_date, update_time) TO [icare_portal_app];
    GRANT DELETE ON OBJECT::dbo.Center_Alert_Message TO [icare_portal_app];
    GRANT SELECT ON OBJECT::dbo.sec_users (ID, Username, Firstname, Lastname, Email, center_id)
        TO [icare_portal_app];
    GRANT UPDATE ON OBJECT::dbo.sec_users (Firstname, Lastname, Email) TO [icare_portal_app];
    GRANT SELECT ON OBJECT::dbo.secCareCenterUser (UserID, center_id) TO [icare_portal_app];
    GRANT SELECT ON OBJECT::dbo.Sec_UserRoles (UserID, RoleID) TO [icare_portal_app];
    GRANT SELECT ON OBJECT::dbo.Sec_Roles (ID, Name, center_id) TO [icare_portal_app];
    -- Aggregate activity reads only: no child names, contacts or credentials.
    GRANT SELECT ON OBJECT::dbo.Class (class_id, center_id, class_name, deleted) TO [icare_portal_app];
    GRANT SELECT ON OBJECT::dbo.Class_Child (Class_ID, Child_ID, academic_year_id) TO [icare_portal_app];
    GRANT SELECT ON OBJECT::dbo.Child (child_id, parent_id, creation_date, is_demo, deleted) TO [icare_portal_app];
    GRANT SELECT ON OBJECT::dbo.Parent (parent_id, center_id, deleted) TO [icare_portal_app];
    GRANT SELECT ON OBJECT::dbo.Child_Transactions
        (ID, center_id, child_id, transaction_date, transaction_code, child_is_active_on_restore) TO [icare_portal_app];
    GRANT SELECT ON OBJECT::dbo.Academic_Years (academic_year_id, academic_year_title) TO [icare_portal_app];

    USE [icare_school];
    CREATE USER [icare_portal_app] FOR LOGIN [icare_portal_app];
    GRANT SELECT ON OBJECT::dbo.Care_Center
        (center_id, type, center_name, center_manager, center_email, center_mobile,
         center_land_line, center_website, center_address, center_description,
         center_location) TO [icare_portal_app];
    GRANT UPDATE ON OBJECT::dbo.Care_Center
        (center_name, center_manager, center_email, center_mobile, center_land_line,
         center_website, center_address, center_description, center_location)
        TO [icare_portal_app];
    -- Bus settings: separate disabled-by-default switch. No driver/child/location reads.
    GRANT SELECT ON OBJECT::dbo.Bus_Type (bus_type_id,center_id,bus_name) TO [icare_portal_app];
    GRANT SELECT ON OBJECT::dbo.Bus_Settings
        (bus_settings_id,bus_id,geofence_raduis,dwell_duration,passenger_input_type) TO [icare_portal_app];
    GRANT SELECT ON OBJECT::dbo.DwellDuration_Values (dwell_duration_id,duration_value,duration_text) TO [icare_portal_app];
    GRANT SELECT ON OBJECT::dbo.GeofenceRaduis_Values (geofence_raduis_id,raduis_value,raduis_text) TO [icare_portal_app];
    GRANT SELECT ON OBJECT::dbo.Input_Type (input_type_id,input_type_desc,is_enabled) TO [icare_portal_app];
    GRANT INSERT ON OBJECT::dbo.Bus_Settings TO [icare_portal_app];
    GRANT UPDATE ON OBJECT::dbo.Bus_Settings (geofence_raduis,dwell_duration,passenger_input_type) TO [icare_portal_app];
    GRANT DELETE ON OBJECT::dbo.Bus_Settings TO [icare_portal_app];
    -- Production procedure wrappers can further enforce the bus_id<>-1 boundary at SQL level.
    -- Independent alert-write switch. Runtime locks/rechecks scope; no legacy logger calls.
    GRANT SELECT ON OBJECT::dbo.Center_Alert_Message
        (alert_message_id, center_id, dealer_id, message_text, alert_expiry_date, update_time) TO [icare_portal_app];
    GRANT INSERT ON OBJECT::dbo.Center_Alert_Message TO [icare_portal_app];
    GRANT UPDATE ON OBJECT::dbo.Center_Alert_Message
        (dealer_id, message_text, alert_expiry_date, update_time) TO [icare_portal_app];
    GRANT DELETE ON OBJECT::dbo.Center_Alert_Message TO [icare_portal_app];
    GRANT SELECT ON OBJECT::dbo.sec_users (ID, Username, Firstname, Lastname, Email, center_id)
        TO [icare_portal_app];
    GRANT UPDATE ON OBJECT::dbo.sec_users (Firstname, Lastname, Email) TO [icare_portal_app];
    GRANT SELECT ON OBJECT::dbo.secCareCenterUser (UserID, center_id) TO [icare_portal_app];
    GRANT SELECT ON OBJECT::dbo.Sec_UserRoles (UserID, RoleID) TO [icare_portal_app];
    GRANT SELECT ON OBJECT::dbo.Sec_Roles (ID, Name, center_id) TO [icare_portal_app];
    GRANT SELECT ON OBJECT::dbo.Class (class_id, center_id, class_name, deleted) TO [icare_portal_app];
    GRANT SELECT ON OBJECT::dbo.Class_Child (Class_ID, Child_ID, academic_year_id) TO [icare_portal_app];
    GRANT SELECT ON OBJECT::dbo.Child (child_id, parent_id, is_demo, deleted) TO [icare_portal_app];
    GRANT SELECT ON OBJECT::dbo.Parent (parent_id, center_id, deleted) TO [icare_portal_app];
    GRANT SELECT ON OBJECT::dbo.Child_Transactions
        (ID, center_id, child_id, transaction_date, transaction_code) TO [icare_portal_app];
    GRANT SELECT ON OBJECT::dbo.Academic_Years (academic_year_id, academic_year_title) TO [icare_portal_app];
    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
