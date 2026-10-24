# Generated source inventory

Static source inspection; configuration values redacted; no live SQL or server inspection.

Pages: 28. Database-access methods: 59. Distinct literal procedure names: 28.

## Pages

| Page | Login guard | Events / functions | Database / utility calls | Destinations |
| --- | --- | --- | --- | --- |
| AddDealer.aspx | Present | Page_Load, btnCancel_Click, btnSubmit_Click, clearSessions, checkEmpty, FindControlRecursive | BaseData.isAdmin, BaseData.updateDealer | Index.aspx, login.aspx |
| AddUser.aspx | Present | Page_Load, setSuggestionUser, btnSubmit_Click, checkEmpty, FindControlRecursive, btnBack_Click, FillData, clearSessions, btnCancel_Click, checkUserValidation | CentersData.checkUser, GeneralUtils.buildUsername, GeneralUtils.checkAuthenticationTextValidation, GeneralUtils.getCalledFunctionName, Logging.logError | Index.aspx, SelectLocation.aspx, Summary.aspx, login.aspx |
| CareCenterInfo.aspx | Present | Page_Load, btnSubmit_Click, isDomainValid, CheckForAlphaCharacters, btnCancel_Click, phoneValid, loadCurrencies, loadAcademicYears, rbSchool_CheckedChanged, rbFull_CheckedChanged, checkEmpty, FindControlRecursive, FillData, clearSessions | BaseData.getAvailableCurrencies, BaseData.isDomainAvailable, CentersData.getAcademicYears, CentersData.isCenterFound, GeneralUtils.FixUrl, GeneralUtils.getCalledFunctionName, Logging.logError | Index.aspx, SelectPhotos.aspx, login.aspx |
| CenterActivity.aspx | Present | Page_Load, enableDealers, loadCenters, loadDealers, btnCancel_Click, btnExtract_Click, getSelectedData, getTotals, extractExcel, cleanFolder, deleteFile, downloadFile, appendFlagCookie, releaseObject, ddlDealers_Change | BaseData.GetDealerAcountingCentersList, BaseData.getDealers, BaseData.isAdmin, CentersData.GetClasses, CentersData.GetDemo, CentersData.getChildActivationDays, CentersData.getNurseryClassChildren, CentersData.updateCentersInvoicingTracker, GeneralUtils.getCalledFunctionName, Logging.logError | Index.aspx, login.aspx |
| CenterAlertMessage.aspx | Present | Page_Load, prepareData, loadCenters, ButtonSave_Click, btnReset_Click, ButtonCancel_Click, ButtonBack_Click, ddlDealers_SelectedIndexChanged, gvwContent_RowCommand, gvwContent_RowDataBound, EditCenterAlertMessage, resetAlertMessage, CheckAll_Click, UncheckAll_Click, ToggleCheckState, ClearForm | BaseData.CenterStatus.getStatuses, BaseData.getDealers, BaseData.isAdmin, CentersData.AlertMessage.GetCentersAlertMessage, CentersData.AlertMessage.resetAlertMessage, CentersData.AlertMessage.updateCentersAlertMessage, GeneralUtils.extractCenterID, GeneralUtils.extractCenterType, GeneralUtils.getCalledFunctionName, Logging.logError | Index.aspx, login.aspx |
| CenterCowPay.aspx | Present | Page_Load, prepareData, btnFilter_Click, loadCenters, btnBack_Click, gvwContent_Sorting, gvwContent_RowDataBound, gvwContent_RowDeleting, gvwContent_RowEditing, gvwContent_RowCommand, toggleActivation | BaseData.CenterStatus.getDealerCenterStatusData, BaseData.CenterStatus.getStatuses, BaseData.CenterStatus.updateCenterStatus, BaseData.getDealers, BaseData.isAdmin, GeneralUtils.extractCenterID, GeneralUtils.extractCenterType, GeneralUtils.getCalledFunctionName, Logging.logError | Index.aspx, login.aspx |
| CenterCowPaySettings.aspx | Present | Page_Load, prepareData, loadCenters, ddlDealers_SelectedIndexChanged, ButtonSave_Click, ButtonCancel_Click, ButtonBack_Click, gvwContent_RowCommand, gvwContent_RowDataBound, isDataComplete, EditCenterApiSettings, ClearForm | BaseData.getDealers, BaseData.isAdmin, CentersData.Cowpay.GetCentersApiSettings, CentersData.Cowpay.getCenterApiSettings, CentersData.Cowpay.updateCenterApiSettings, GeneralUtils.extractCenterID, GeneralUtils.extractCenterType, GeneralUtils.getCalledFunctionName, Logging.logError | Index.aspx, login.aspx |
| CenterPayments.aspx | Present | Page_Load, loadData, loadPayments, calculateTotals, isDataComplete, toggleMode, editPayment, deletePayment, ClearForm, btnReload_Click, btnAdd_Click, btnUpdate_Click, ButtonCancel_Click, btnFilter_Click, gvwContent_RowDeleting, gvwContent_RowEditing, gvwContent_RowCommand | AccountingData.deleteCenterPayment, AccountingData.getAccountingData, AccountingData.getPaymentStatuses, AccountingData.updateCenterPayment, BaseData.getAvailableCurrencies, GeneralUtils.getCalledFunctionName, Logging.logError | login.aspx |
| CenterReport.aspx | Present | Page_Load, enableDealers, loadCenters, loadDealers, btnCancel_Click, btnExtract_Click, getTotals, extractExcel, cleanFolder, deleteFile, downloadFile, appendFlagCookie, ddlDealers_Change, CheckAll_Click, UncheckAll_Click, ToggleCheckState | BaseData.GetDealerAcountingCentersList, BaseData.getDealers, BaseData.isAdmin, CentersData.getChildActivationDays, CentersData.getNurseryClassChildren, GeneralUtils.getCalledFunctionName, Logging.logError | Index.aspx, login.aspx |
| CenterStatus.aspx | Present | Page_Load, prepareData, btnFilter_Click, loadCenters, btnBack_Click, gvwContent_Sorting, gvwContent_RowDataBound, gvwContent_RowDeleting, gvwContent_RowEditing, gvwContent_RowCommand, toggleActivation | BaseData.CenterStatus.getDealerCenterStatusData, BaseData.CenterStatus.getStatuses, BaseData.CenterStatus.updateCenterStatus, BaseData.getDealers, BaseData.isAdmin, GeneralUtils.extractCenterID, GeneralUtils.extractCenterType, GeneralUtils.getCalledFunctionName, Logging.logError | Index.aspx, login.aspx |
| ClassChildrenActivity.aspx | Present | Page_Load, getAcademicYears, ddlCareCenters_SelectedIndexChanged, btnGo_Click, btnSchool_Click, btnCancel_Click, clearSessions | CentersData.GetClasses, CentersData.GetDemo, CentersData.GetSchoolClasses, CentersData.GetSchoolDemo, CentersData.getAcademiYears, CentersData.getChildActivationDays, CentersData.getNurseryClassChildren, CentersData.getSchoolClassChildren, FileUtils.getCenterFullImageLocation, GeneralUtils.getCalledFunctionName, Logging.logError | Index.aspx, login.aspx |
| EditCenterList.aspx | Present | Page_Load, btnInfo_Click, btnPhotos_Click, btnImages_Click, btnEditLocation_Click |  | ChildImages.aspx, EditLocation.aspx, EditPhotos.aspx, Index.aspx, ManageCareCenter.aspx, login.aspx |
| EditLocation.aspx | Present | Page_Load, loadLocation, btnSubmit_Click, btnCancel_Click, clearSessions | CentersData.getCenterLocation, CentersData.updateCenterLocation | Index.aspx, login.aspx |
| EditPhotos.aspx | Present | Page_Load, btnSubmit_Click, btnCancel_Click, clearSessions, checkEmpty, checkSize, checkWaterMark, Check_same_CheckedChanged, btnBack_Click, LoadImages, btnUploadLogo_Click, btnUploadPic_Click, btnUploadWM_Click | CentersData.EditPhoto, CentersData.getLogoName, CentersData.getPhotoName, FileUtils.getCenterFullImageLocation, FileUtils.getFolderLocation | EditCenterList.aspx, Index.aspx, login.aspx |
| EditSummary.aspx | Present | Page_Load, btnSubmit_Click, FillData, clearSessions, btnBack_Click, btnCancel_Click | CentersData.EditCareCenter, CentersData.generateChildQRCode, CentersData.getCenterChildrenList, FileUtils.GenerateQrCode, GeneralUtils.getCalledFunctionName, Logging.logError | Index.aspx, ManageCareCenter.aspx, login.aspx |
| Index.aspx | Present | Page_Load, BtnManageCenter_Click, btnAddCenter_Click, btnCowpay_Click, btnlogout_Click, btnEditUsers_Click, btnAccounting_Click, clearSessions, btnAddDealer_Click, enableCustomButtons, btnManageDealer_Click, BtnClasses_Click, btnBusSettings_Click, btnCenterAlertMessage_Click, btnStatus_Click, btnCenterReport_Click | BaseData.isAdmin, FileUtils.clearPhotos | AddDealer.aspx, CareCenterInfo.aspx, CenterActivity.aspx, CenterAlertMessage.aspx, CenterCowPaySettings.aspx, CenterPayments.aspx, CenterReport.aspx, CenterStatus.aspx, SelectCenter.aspx, SelectDealer.aspx, SelectUser.aspx, iCareBusSettings.aspx, login.aspx |
| ManageCareCenter.aspx | Present | Page_Load, phoneValid, isEmailValid, FillData, btnSubmit_Click, btnCancel_Click, clearSessions, btnBack_Click, checkEmpty, FindControlRecursive, loadInputTypes | CentersData.GetCenterInfo, CentersData.getCenterInputType, CentersData.getInputTypes, GeneralUtils.FixUrl | EditSummary.aspx, Index.aspx, SelectCenter.aspx, login.aspx |
| ManageDealer.aspx | Present | Page_Load, btnSubmit_Click, fillData, clearSessions, checkEmpty, FindControlRecursive, btnCancel_Click | BaseData.isAdmin, BaseData.updateDealer | Index.aspx, login.aspx |
| ManageUser.aspx | Present | Page_Load, btnSubmit_Click, FillData, checkEmpty, FindControlRecursive, btnCancel_Click, clearSessions, btnBack_Click, checkUserValidation | CentersData.getAdminUser, GeneralUtils.checkAuthenticationTextValidation, GeneralUtils.getCalledFunctionName, Logging.logError | Index.aspx, SelectUser.aspx, UserSummary.aspx, login.aspx |
| SelectCenter.aspx | Present | Page_Load, btnGo_Click, btnCancel_Click, clearSessions |  | EditCenterList.aspx, Index.aspx, login.aspx |
| SelectDealer.aspx | Present | Page_Load, btnGo_Click, btnCancel_Click, clearSessions | BaseData.getDealerInfo, BaseData.getDealers, BaseData.isAdmin | Index.aspx, ManageDealer.aspx, login.aspx |
| SelectLocation.aspx | Present | Page_Load, btnBack_Click, btnSubmit_Click, btnCancel_Click, clearSessions |  | AddUser.aspx, Index.aspx, SelectPhotos.aspx, login.aspx |
| SelectPhotos.aspx | Present | Page_Load, btnSubmit_Click, btnCancel_Click, btnBack_Click, clearSessions, checkSize, checkWaterMark, Check_same_CheckedChanged | FileUtils.clearPhotos | CareCenterInfo.aspx, Index.aspx, SelectLocation.aspx, login.aspx |
| SelectUser.aspx | Present | Page_Load, btnGo_Click, btnCancel_Click, clearSessions |  | Index.aspx, ManageUser.aspx, login.aspx |
| Summary.aspx | Present | Page_Load, btnBack_Click, btnSubmit_Click, FillData, btnCancel_Click, clearSessions | CentersData.addCareCenter, FileUtils.clearPhotos, FileUtils.getFolderLocation, GeneralUtils.buildUsername, GeneralUtils.getCalledFunctionName, Logging.logError | Index.aspx, addUser.aspx, login.aspx |
| UserSummary.aspx | Present | Page_Load, btnSubmit_Click, FillData, clearSessions, btnBack_Click, btnCancel_Click | CentersData.EditAdminUser, GeneralUtils.getCalledFunctionName, Logging.logError | Index.aspx, ManageUser.aspx, login.aspx |
| iCareBusSettings.aspx | Present | Page_Load, loadCenters, loadSettingsData, btnCancel_Click, btnSubmit_Click, ddlBusses_SelectedIndexChanged, loadCenterSettings, ddlCareCenters_SelectedIndexChanged, resetForm | CentersData.getBusSettings, CentersData.getBusSettingsData, CentersData.getCenterBuses, CentersData.setBusSettings | Index.aspx, login.aspx |
| login.aspx | Absent | Page_Load, imgProceed_Click, ValidateLogin | BaseData.GetLoginUser, GeneralUtils.getCalledFunctionName, Logging.logError | Index.aspx |

## Database call contracts

### logError — App_Code/DML.vb:10

Signature: `(errorClassName As String, functionName As String, ex As Exception, Optional additionalData As String = "")`

Connections: `OpenLoggingConnection()`. Procedures: record_adminWebErrorLog.

| Parameter | Declaration | Direction |
| --- | --- | --- |
| @className | SqlDbType.NVarChar) | input |
| @functionName | SqlDbType.NVarChar) | input |
| @lineNumber | SqlDbType.Int, 4) | input |
| @errorText | SqlDbType.NVarChar) | input |
| @additionalData | SqlDbType.NVarChar) | input |

### getAvailableCurrencies — App_Code/DML.vb:76

Signature: `() As DataTable`

Connections: `OpenConnection()`. Procedures: Inline SQL.

| Parameter | Declaration | Direction |
| --- | --- | --- |

### GetLoginUser — App_Code/DML.vb:102

Signature: `(ByVal Username As String, ByVal password As String) As Integer`

Connections: `OpenConnection()`. Procedures: authenticateDealer.

| Parameter | Declaration | Direction |
| --- | --- | --- |
| @userName | SqlDbType.NVarChar) | input |
| @password | SqlDbType.NVarChar) | input |
| @isAdmin | SqlDbType.Bit, 4) | output |
| @dealerID | SqlDbType.Int, 4) | output |
| @authenticationStatus | SqlDbType.Int, 4) | output |

### isAdmin — App_Code/DML.vb:134

Signature: `(UserID As String) As Boolean`

Connections: `OpenConnection()`. Procedures: Inline SQL.

| Parameter | Declaration | Direction |
| --- | --- | --- |

### updateDealer — App_Code/DML.vb:161

Signature: `(ByRef user As objDealer) As Boolean`

Connections: `OpenConnection()`. Procedures: iCareAdmin_updateDealer.

| Parameter | Declaration | Direction |
| --- | --- | --- |
| @dealerID | SqlDbType.NVarChar) | input |
| @username | SqlDbType.NVarChar) | input |
| @dealerName | SqlDbType.NVarChar) | input |
| @password | SqlDbType.NVarChar) | input |
| @email | SqlDbType.NVarChar) | input |
| @isAdmin | SqlDbType.Bit) | input |
| @isActive | SqlDbType.Bit) | input |
| @updateStatus | SqlDbType.Int, 4) | output |
| @insertedID | SqlDbType.Int, 4) | output |

### getDealerInfo — App_Code/DML.vb:204

Signature: `(ID As String) As objDealer`

Connections: `OpenConnection()`. Procedures: Inline SQL.

| Parameter | Declaration | Direction |
| --- | --- | --- |

### getDealers — App_Code/DML.vb:242

Signature: `(userID As String) As DataTable`

Connections: `OpenConnection()`. Procedures: iCareAdmin_getDealersList.

| Parameter | Declaration | Direction |
| --- | --- | --- |
| @dealerID | SqlDbType.Int) | input |

### getDealerCenters — App_Code/DML.vb:274

Signature: `(userID As String) As DataTable`

Connections: `OpenConnection()`. Procedures: iCareAdmin_getDealerCenters.

| Parameter | Declaration | Direction |
| --- | --- | --- |
| @dealerID | SqlDbType.Int) | input |

### GetDealerAcountingCentersList — App_Code/DML.vb:304

Signature: `(userID As String, Optional filterUserID As String = Nothing) As DataTable`

Connections: `OpenConnection(1)`. Procedures: iCareAdmin_getUserAccountingCentersList.

| Parameter | Declaration | Direction |
| --- | --- | --- |
| @userID | SqlDbType.Int) | input |
| @filterUserID | SqlDbType.Int) | input |

### isDomainAvailable — App_Code/DML.vb:334

Signature: `(domain As String) As Boolean`

Connections: `OpenConnection()`. Procedures: Inline SQL.

| Parameter | Declaration | Direction |
| --- | --- | --- |

### getDealerCenterStatusData — App_Code/DML.vb:364

Signature: `(userID As String, Optional filterUserID As Integer = -1, Optional filterStatusID As Integer = -1) As DataTable`

Connections: `OpenConnection()`. Procedures: iCareAdmin_getCenterStatusesList.

| Parameter | Declaration | Direction |
| --- | --- | --- |
| @dealerID | SqlDbType.Int) | input |
| @filterDealerID | SqlDbType.Int) | input |
| @filterStatusID | SqlDbType.Int) | input |

### updateCenterStatus — App_Code/DML.vb:396

Signature: `(userID As String, centerID As String, centerType As enums.CenterType, activationStatus As enums.CenterStatus) As enums.responseGeneral`

Connections: `OpenConnection()`. Procedures: iCareAdmin_updateCenterActivationStatus.

| Parameter | Declaration | Direction |
| --- | --- | --- |
| @dealerID | SqlDbType.Int) | input |
| @centerID | SqlDbType.Int) | input |
| @centerType | SqlDbType.Int) | input |
| @activationStatus | SqlDbType.Int) | input |
| @updateStatus | SqlDbType.Int, 4) | output |

### getStatuses — App_Code/DML.vb:425

Signature: `() As DataTable`

Connections: `OpenConnection()`. Procedures: Inline SQL.

| Parameter | Declaration | Direction |
| --- | --- | --- |

### GetCentersApiSettings — App_Code/DML.vb:454

Signature: `(dealerID As String, Optional filterUserID As Integer = -1) As DataTable`

Connections: `OpenConnection()`. Procedures: iCareAdmin_getCentersCowPayApiSettings.

| Parameter | Declaration | Direction |
| --- | --- | --- |
| @dealerID | SqlDbType.Int) | input |
| @filterDealerID | SqlDbType.Int) | input |

### updateCenterApiSettings — App_Code/DML.vb:486

Signature: `(UserID As String, apiSettings As objCowPayApiSettings) As Integer`

Connections: `OpenConnection(apiSettings.center_type)`. Procedures: iCareAdmin_updateCenterCowPayApiSettings.

| Parameter | Declaration | Direction |
| --- | --- | --- |
| @centerID | SqlDbType.Int) | input |
| @centerType | SqlDbType.Int) | input |
| @merchantCode | SqlDbType.NVarChar) | input |
| @merchantHashKey | SqlDbType.NVarChar) | input |
| @accessToken | SqlDbType.NVarChar) | input |
| @stagingAccessToken | SqlDbType.NVarChar) | input |
| @isEnabled | SqlDbType.Bit) | input |
| RetVal | SqlDbType.Int) | returnvalue |

### getCenterApiSettings — App_Code/DML.vb:527

Signature: `(UserID As String, centerID As Integer, centerType As Integer) As DataTable`

Connections: `OpenConnection(centerType)`. Procedures: iCareAdmin_getCenterCowPayApiSettings.

| Parameter | Declaration | Direction |
| --- | --- | --- |
| @centerID | SqlDbType.Int) | input |

### GetCentersAlertMessage — App_Code/DML.vb:562

Signature: `(dealerID As String, Optional filterUserID As Integer = -1, Optional filterStatusID As Integer = -1) As DataTable`

Connections: `OpenConnection()`. Procedures: iCareAdmin_getDealerCentersAlertMessage.

| Parameter | Declaration | Direction |
| --- | --- | --- |
| @dealerID | SqlDbType.Int) | input |
| @filterDealerID | SqlDbType.Int) | input |
| @filterStatusID | SqlDbType.Int) | input |

### updateCentersAlertMessage — App_Code/DML.vb:619

Signature: `(centerslist As List(Of Integer), message_text As String, alert_expiry_date As String, UserID As String, centerType As enums.CenterType) As Integer`

Connections: `OpenConnection(centerType)`. Procedures: iCareAdmin_updateCenterAlertMessage.

| Parameter | Declaration | Direction |
| --- | --- | --- |
| @dealerID | SqlDbType.Int) | input |
| @messageText | SqlDbType.NVarChar) | input |
| @messageExpiryDate | SqlDbType.Date) | input |
| @centersList | DataUtils.createCenterListDatatable(centerslist)) | input |
| RetVal | SqlDbType.Int) | returnvalue |

Table types: dbo.Element_ID_List

### resetAlertMessage — App_Code/DML.vb:689

Signature: `(centerslist As List(Of Integer), UserID As String, centerType As enums.CenterType) As Integer`

Connections: `OpenConnection(centerType)`. Procedures: iCareAdmin_resetCenterAlertMessage.

| Parameter | Declaration | Direction |
| --- | --- | --- |
| @dealerID | SqlDbType.Int) | input |
| @updateStatus | SqlDbType.Int, 4) | output |
| @centersList | DataUtils.createCenterListDatatable(centerslist)) | input |

Table types: dbo.Element_ID_List

### getAcademicYears — App_Code/DML.vb:727

Signature: `() As DataTable`

Connections: `OpenConnection(enums.CenterType.School)`. Procedures: Inline SQL.

| Parameter | Declaration | Direction |
| --- | --- | --- |

### getLogoName — App_Code/DML.vb:753

Signature: `(centerID As String, centerType As enums.CenterType) As String`

Connections: `OpenConnection(centerType)`. Procedures: Inline SQL.

| Parameter | Declaration | Direction |
| --- | --- | --- |

### getPhotoName — App_Code/DML.vb:781

Signature: `(centerID As String, centerType As enums.CenterType) As String`

Connections: `OpenConnection(centerType)`. Procedures: Inline SQL.

| Parameter | Declaration | Direction |
| --- | --- | --- |

### EditPhoto — App_Code/DML.vb:807

Signature: `(PhotoName As String, photo As String, centerID As String, centerType As enums.CenterType)`

Connections: `OpenConnection(centerType)`. Procedures: Inline SQL.

| Parameter | Declaration | Direction |
| --- | --- | --- |

### getLatestChildActivationTransactions — App_Code/DML.vb:833

Signature: `(childID As String, Optional monthRequested As String = "-1", Optional yearRequested As String = "-1", Optional centerType As enums.CenterType = enums.CenterType.Nursery) As DataTable`

Connections: `OpenConnection(centerType)`. Procedures: iCareAdmin_getChildLatestActivationTransactions.

| Parameter | Declaration | Direction |
| --- | --- | --- |
| @childID | SqlDbType.Int) | input |
| @requestMonth | SqlDbType.Int) | input |
| @requestYear | SqlDbType.Int) | input |

### childHasTransactions — App_Code/DML.vb:1010

Signature: `(childID As String, centerType As enums.CenterType) As Boolean`

Connections: `OpenConnection(centerType)`. Procedures: Inline SQL.

| Parameter | Declaration | Direction |
| --- | --- | --- |

### childLatestTransaction — App_Code/DML.vb:1041

Signature: `(childID As String, centerType As enums.CenterType) As objChildTransaction`

Connections: `OpenConnection(centerType)`. Procedures: Inline SQL.

| Parameter | Declaration | Direction |
| --- | --- | --- |

### updateCenterLocation — App_Code/DML.vb:1107

Signature: `(centerLocationString As String, centerID As String, centerType As enums.CenterType) As Integer`

Connections: `OpenConnection(centerType)`. Procedures: Inline SQL.

| Parameter | Declaration | Direction |
| --- | --- | --- |

### getBusSettingsData — App_Code/DML.vb:1141

Signature: `(centerType As enums.CenterType) As DataSet`

Connections: `OpenConnection(centerType)`. Procedures: Inline SQL.

| Parameter | Declaration | Direction |
| --- | --- | --- |

### getCenterBuses — App_Code/DML.vb:1172

Signature: `(centerID As String, centerType As enums.CenterType) As DataTable`

Connections: `OpenConnection(centerType)`. Procedures: Inline SQL.

| Parameter | Declaration | Direction |
| --- | --- | --- |

### setBusSettings — App_Code/DML.vb:1199

Signature: `(settings As objBusSettings, centerType As enums.CenterType) As Integer`

Connections: `OpenConnection(centerType)`. Procedures: Inline SQL.

| Parameter | Declaration | Direction |
| --- | --- | --- |

### getBusSettings — App_Code/DML.vb:1243

Signature: `(busID As String, centerType As enums.CenterType) As DataTable`

Connections: `OpenConnection(centerType)`. Procedures: Inline SQL.

| Parameter | Declaration | Direction |
| --- | --- | --- |

### getGeofenceRaduisValues — App_Code/DML.vb:1271

Signature: `(centerType As enums.CenterType) As DataTable`

Connections: `OpenConnection(centerType)`. Procedures: Inline SQL.

| Parameter | Declaration | Direction |
| --- | --- | --- |

### getDwellDurationValues — App_Code/DML.vb:1302

Signature: `(centerType As enums.CenterType) As DataTable`

Connections: `OpenConnection(centerType)`. Procedures: Inline SQL.

| Parameter | Declaration | Direction |
| --- | --- | --- |

### GetDemo — App_Code/DML.vb:1336

Signature: `(ByVal CenterID As String, centerType As enums.CenterType) As String`

Connections: `OpenConnection(centerType)`. Procedures: Inline SQL.

| Parameter | Declaration | Direction |
| --- | --- | --- |

### GetSchoolDemo — App_Code/DML.vb:1369

Signature: `(CenterID As String, academicYear As String) As String`

Connections: `OpenConnection(enums.CenterType.School)`. Procedures: Inline SQL.

| Parameter | Declaration | Direction |
| --- | --- | --- |

### getAcademiYears — App_Code/DML.vb:1408

Signature: `() As DataTable`

Connections: `OpenConnection(enums.CenterType.School)`. Procedures: Inline SQL.

| Parameter | Declaration | Direction |
| --- | --- | --- |

### getNurseryClassChildren — App_Code/DML.vb:1433

Signature: `(centerID As String, classID As String, monthRequested As String, yearRequested As String) As DataTable`

Connections: `OpenConnection(enums.CenterType.Nursery)`. Procedures: iCareAdmin_getCenterClassChildren.

| Parameter | Declaration | Direction |
| --- | --- | --- |
| @centerID | SqlDbType.Int) | input |
| @classID | SqlDbType.Int) | input |
| @requestMonth | SqlDbType.Int) | input |
| @requestYear | SqlDbType.Int) | input |
| @requestAll | SqlDbType.Bit) | input |

### getSchoolClassChildren — App_Code/DML.vb:1469

Signature: `(centerID As String, classID As String, academicYearID As String) As DataTable`

Connections: `OpenConnection(enums.CenterType.School)`. Procedures: iCareAdmin_getCenterClassChildren.

| Parameter | Declaration | Direction |
| --- | --- | --- |
| @classID | SqlDbType.Int) | input |
| @centerID | SqlDbType.Int) | input |
| @academicYearID | SqlDbType.Int) | input |

### GetSchoolClasses — App_Code/DML.vb:1505

Signature: `(CenterID As String, academicYearID As String) As DataTable`

Connections: `OpenConnection(enums.CenterType.School)`. Procedures: iCareAdmin_getCenterClassesData.

| Parameter | Declaration | Direction |
| --- | --- | --- |
| @centerID | SqlDbType.Int) | input |
| @academicYearID | SqlDbType.Int) | input |

### GetClasses — App_Code/DML.vb:1537

Signature: `(ByVal CenterID As String, monthRequested As String, yearRequested As String, centerType As enums.CenterType) As DataTable`

Connections: `OpenConnection(centerType)`. Procedures: iCareAdmin_getCenterClassesData.

| Parameter | Declaration | Direction |
| --- | --- | --- |
| @centerID | SqlDbType.Int) | input |
| @requestMonth | SqlDbType.Int) | input |
| @requestYear | SqlDbType.Int) | input |
| @requestAll | SqlDbType.Bit) | input |

### getCenterDomain — App_Code/DML.vb:1575

Signature: `(centerID As String, centerType As enums.CenterType) As String`

Connections: `OpenConnection()`. Procedures: Inline SQL.

| Parameter | Declaration | Direction |
| --- | --- | --- |

### checkUser — App_Code/DML.vb:1599

Signature: `(username As String) As Boolean`

Connections: `OpenConnection()`. Procedures: Inline SQL.

| Parameter | Declaration | Direction |
| --- | --- | --- |

### addUser — App_Code/DML.vb:1629

Signature: `(centerID As String, user As objUsers, centerType As enums.CenterType) As String`

Connections: `OpenConnection(centerType)`. Procedures: iCareAdmin_addCenterUser.

| Parameter | Declaration | Direction |
| --- | --- | --- |
| @centerID | SqlDbType.Int) | input |
| @userName | SqlDbType.VarChar) | input |
| @password | SqlDbType.VarChar) | input |
| @firstName | SqlDbType.VarChar) | input |
| @lastName | SqlDbType.VarChar) | input |
| @email | SqlDbType.VarChar) | input |
| RetVal | SqlDbType.Int) | returnvalue |

### getAdminUser — App_Code/DML.vb:1664

Signature: `(CenterID As String, centerType As enums.CenterType) As objUsers`

Connections: `OpenConnection()`. Procedures: iCareAdmin_getCenterAdminUser.

| Parameter | Declaration | Direction |
| --- | --- | --- |
| @centerID | SqlDbType.Int) | input |
| @centerType | SqlDbType.Int) | input |

### EditAdminUser — App_Code/DML.vb:1701

Signature: `(user As objUsers, centerID As String, centerType As enums.CenterType) As String`

Connections: `OpenConnection(centerType)`. Procedures: iCareAdmin_updateCenterUserInfo.

| Parameter | Declaration | Direction |
| --- | --- | --- |
| @userID | SqlDbType.Int) | input |
| @password | SqlDbType.VarChar) | input |
| @firstName | SqlDbType.VarChar) | input |
| @lastName | SqlDbType.VarChar) | input |
| @email | SqlDbType.VarChar) | input |
| @updateStatus | SqlDbType.Int, 4) | output |

### updateCentersInvoicingTracker — App_Code/DML.vb:1748

Signature: `(centerslist As List(Of Integer), UserID As String, centerType As enums.CenterType) As Integer`

Connections: `OpenConnection(centerType)`. Procedures: iCareAdmin_updateCentersInvoiceTracker.

| Parameter | Declaration | Direction |
| --- | --- | --- |
| @userID | SqlDbType.Int) | input |
| @centersList | DataUtils.createCenterListDatatable(centerslist)) | input |
| RetVal | SqlDbType.Int) | returnvalue |

Table types: dbo.Element_ID_List

### getCenterLocation — App_Code/DML.vb:1788

Signature: `(centerID As String, centerType As enums.CenterType) As DataTable`

Connections: `OpenConnection(centerType)`. Procedures: Inline SQL.

| Parameter | Declaration | Direction |
| --- | --- | --- |

### EditCareCenter — App_Code/DML.vb:1817

Signature: `(dealerID As String, centerInfo As objCareCenter) As String`

Connections: `OpenConnection(centerInfo.center_type)`. Procedures: iCareAdmin_updateCenterInfo.

| Parameter | Declaration | Direction |
| --- | --- | --- |
| @dealerID | SqlDbType.Int) | input |
| @centerID | SqlDbType.Int) | input |
| @name | SqlDbType.NVarChar) | input |
| @email | SqlDbType.NVarChar) | input |
| @mobile | SqlDbType.NVarChar) | input |
| @website | SqlDbType.NVarChar) | input |
| @address | SqlDbType.NVarChar) | input |
| @manager | SqlDbType.NVarChar) | input |
| @landline | SqlDbType.NVarChar) | input |
| @description | SqlDbType.NVarChar) | input |
| @inputType | SqlDbType.Int) | input |
| @updateStatus | SqlDbType.Int, 4) | output |

### getCenterInputType — App_Code/DML.vb:1857

Signature: `(CenterID As String, centerType As enums.CenterType) As String`

Connections: `OpenConnection(centerType)`. Procedures: Inline SQL.

| Parameter | Declaration | Direction |
| --- | --- | --- |

### GetCenterInfo — App_Code/DML.vb:1889

Signature: `(CenterID As String, centerType As enums.CenterType) As objCareCenter`

Connections: `OpenConnection(centerType)`. Procedures: Inline SQL.

| Parameter | Declaration | Direction |
| --- | --- | --- |

### isCenterFound — App_Code/DML.vb:1935

Signature: `(center_name As String, centerType As enums.CenterType) As Boolean`

Connections: `OpenConnection(centerType)`. Procedures: Inline SQL.

| Parameter | Declaration | Direction |
| --- | --- | --- |

### generateChildQRCode — App_Code/DML.vb:1967

Signature: `(childID As String, centerType As enums.CenterType) As String`

Connections: `OpenConnection(centerType)`. Procedures: spGenerateChildQrCode.

| Parameter | Declaration | Direction |
| --- | --- | --- |
| @child_id | SqlDbType.Int) | input |
| @qrcode | SqlDbType.NVarChar, 100) | output |

### addCareCenter — App_Code/DML.vb:1994

Signature: `(dealerID As String, centerInfo As objCareCenter, user As objUsers, ByRef centerID As String) As String`

Connections: `OpenConnection(centerInfo.center_type)`. Procedures: iCareAdmin_addCareCenter.

| Parameter | Declaration | Direction |
| --- | --- | --- |
| @dealerID | SqlDbType.Int) | input |
| @name | SqlDbType.NVarChar) | input |
| @email | SqlDbType.NVarChar) | input |
| @landline | SqlDbType.NVarChar) | input |
| @mobile | SqlDbType.NVarChar) | input |
| @website | SqlDbType.NVarChar) | input |
| @domain | SqlDbType.NVarChar) | input |
| @logo | SqlDbType.NVarChar) | input |
| @photo | SqlDbType.NVarChar) | input |
| @description | SqlDbType.NVarChar) | input |
| @address | SqlDbType.NVarChar) | input |
| @location | SqlDbType.NVarChar) | input |
| @manager | SqlDbType.NVarChar) | input |
| @type | SqlDbType.Int) | input |
| @currency | SqlDbType.Int) | input |
| @centerID | SqlDbType.Int, 4) | output |
| @updateStatus | SqlDbType.Int, 4) | output |
| @academicYearID | SqlDbType.Int) | input |
| @userName | SqlDbType.VarChar) | input |
| @password | SqlDbType.VarChar) | input |
| @firstName | SqlDbType.VarChar) | input |
| @lastName | SqlDbType.VarChar) | input |
| @userEmail | SqlDbType.VarChar) | input |

### getInputTypes — App_Code/DML.vb:2058

Signature: `(centerType As enums.CenterType) As DataTable`

Connections: `OpenConnection(centerType)`. Procedures: Inline SQL.

| Parameter | Declaration | Direction |
| --- | --- | --- |

### getCenterChildrenList — App_Code/DML.vb:2081

Signature: `(dealerID As String, centerID As String, centerType As enums.CenterType) As DataTable`

Connections: `OpenConnection(centerType)`. Procedures: iCareAdmin_getCenterChildren.

| Parameter | Declaration | Direction |
| --- | --- | --- |
| @centerID | SqlDbType.Int) | input |
| @dealerID | SqlDbType.Int) | input |

### getPaymentStatuses — App_Code/DML.vb:2116

Signature: `() As DataTable`

Connections: `OpenAccountingConnection()`. Procedures: Inline SQL.

| Parameter | Declaration | Direction |
| --- | --- | --- |

### getAccountingData — App_Code/DML.vb:2138

Signature: `(userID As String, centerID As String, centerType As String, Optional paymentStatus As String = "-1", Optional startDate As String = Nothing, Optional endDate As String = Nothing) As DataTable`

Connections: `OpenAccountingConnection()`. Procedures: iCareAdmin_getCentersPaymentsList.

| Parameter | Declaration | Direction |
| --- | --- | --- |
| @dealerID | SqlDbType.Int) | input |
| @paymentStatus | SqlDbType.Int) | input |
| @centerType | SqlDbType.Int) | input |
| @centerID | SqlDbType.Int) | input |
| @dateStart | SqlDbType.Date) | input |
| @dateEnd | SqlDbType.Date) | input |

### updateCenterPayment — App_Code/DML.vb:2174

Signature: `(userID As String, payment As CenterPayment) As Integer`

Connections: `OpenAccountingConnection()`. Procedures: iCareAdmin_updateCenterPayment.

| Parameter | Declaration | Direction |
| --- | --- | --- |
| @dealerID | SqlDbType.Int) | input |
| @centerType | SqlDbType.Int) | input |
| @centerID | SqlDbType.Int) | input |
| @paymentAmount | SqlDbType.Float) | input |
| @paymentMonth | SqlDbType.Int) | input |
| @paymentYear | SqlDbType.Int) | input |
| @paymentLink | SqlDbType.NVarChar) | input |
| @paymentCurrency | SqlDbType.Int) | input |
| @paymentTitle | SqlDbType.NVarChar) | input |
| @paymentDesc | SqlDbType.NVarChar) | input |
| @dueDate | SqlDbType.Date) | input |
| @paymentStatus | SqlDbType.Int) | input |
| @paymentID | SqlDbType.Int) | input |
| @updateStatus | SqlDbType.Int, 4) | output |

### deleteCenterPayment — App_Code/DML.vb:2223

Signature: `(userID As String, paymentID As String) As Integer`

Connections: `OpenAccountingConnection()`. Procedures: iCareAdmin_deleteCenterPayment.

| Parameter | Declaration | Direction |
| --- | --- | --- |
| @dealerID | SqlDbType.Int) | input |
| @paymentID | SqlDbType.Int) | input |
| @updateStatus | SqlDbType.Int, 4) | output |

## Full detail

See `legacy-inventory.json` for controls, SQL fragments, models, configuration key names, transitions, and source fingerprints. Generated findings require human interpretation, especially commented code and database-side behavior.
