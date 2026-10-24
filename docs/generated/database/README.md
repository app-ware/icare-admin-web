# Verified database metadata evidence

Read-only inspection of the configured **active** endpoint on 21 October 2026. These files do not establish the state of the unreachable production/local endpoint variants. Accounting and logging catalogs are absent from the active server.

| Role | Tables | Procedures | Functions | Views | Triggers |
| --- | --- | --- | --- | --- | --- |
| secure | 21 | 48 | 14 | 4 | 0 |
| nursery | 401 | 739 | 118 | 149 | 2 |
| school | 376 | 632 | 121 | 132 | 0 |

## Files

- `*-schema.json`: object catalog, table/view columns, keys/indexes, checks, SQL table types, dependencies, estimated row counts, permission metadata. No customer rows.
- `*-reviewed-modules.json`: admin dependency modules plus identity/compatibility helpers; SQL string literals withheld. These are review copies, not executable migration scripts.
- `*-reference-and-result-contracts.json`: bounded non-personal seed/reference rows and system-compiler first-result metadata; no application stored procedure was executed.
- `contracts-and-dependencies.json`: source-to-database procedure mapping and dependency closure. Conditional source branches and unreachable generic helper paths require interpretation.

## Direct source procedure contracts

| Role | Procedure / function | Source caller | Available | Unexpected passed names |
| --- | --- | --- | --- | --- |
| logging | dbo.record_adminWebErrorLog | logError | Database unavailable |  |
| secure | dbo.authenticateDealer | GetLoginUser | Yes |  |
| secure | dbo.iCareAdmin_updateDealer | updateDealer | Yes |  |
| secure | dbo.iCareAdmin_getDealersList | getDealers | Yes |  |
| secure | dbo.iCareAdmin_getDealerCenters | getDealerCenters | Yes |  |
| nursery | dbo.iCareAdmin_getUserAccountingCentersList | GetDealerAcountingCentersList | Yes |  |
| secure | dbo.iCareAdmin_getCenterStatusesList | getDealerCenterStatusData | Yes |  |
| secure | dbo.iCareAdmin_updateCenterActivationStatus | updateCenterStatus | Yes |  |
| secure | dbo.iCareAdmin_getCentersCowPayApiSettings | GetCentersApiSettings | Yes |  |
| nursery | dbo.iCareAdmin_updateCenterCowPayApiSettings | updateCenterApiSettings | Yes |  |
| school | dbo.iCareAdmin_updateCenterCowPayApiSettings | updateCenterApiSettings | Absent |  |
| nursery | dbo.iCareAdmin_getCenterCowPayApiSettings | getCenterApiSettings | Yes |  |
| school | dbo.iCareAdmin_getCenterCowPayApiSettings | getCenterApiSettings | Absent |  |
| secure | dbo.iCareAdmin_getDealerCentersAlertMessage | GetCentersAlertMessage | Yes |  |
| nursery | dbo.iCareAdmin_updateCenterAlertMessage | updateCentersAlertMessage | Yes |  |
| school | dbo.iCareAdmin_updateCenterAlertMessage | updateCentersAlertMessage | Yes |  |
| nursery | dbo.iCareAdmin_resetCenterAlertMessage | resetAlertMessage | Yes |  |
| school | dbo.iCareAdmin_resetCenterAlertMessage | resetAlertMessage | Yes |  |
| nursery | dbo.iCareAdmin_getChildLatestActivationTransactions | getLatestChildActivationTransactions | Yes |  |
| school | dbo.iCareAdmin_getChildLatestActivationTransactions | getLatestChildActivationTransactions | Yes |  |
| nursery | dbo.iCareAdmin_getCenterClassChildren | getNurseryClassChildren | Yes |  |
| school | dbo.iCareAdmin_getCenterClassChildren | getSchoolClassChildren | Yes |  |
| school | dbo.iCareAdmin_getCenterClassesData | GetSchoolClasses | Yes |  |
| nursery | dbo.iCareAdmin_getCenterClassesData | GetClasses | Yes |  |
| school | dbo.iCareAdmin_getCenterClassesData | GetClasses | Yes | @requestMonth, @requestYear, @requestAll |
| nursery | dbo.iCareAdmin_addCenterUser | addUser | Yes |  |
| school | dbo.iCareAdmin_addCenterUser | addUser | Yes |  |
| secure | dbo.iCareAdmin_getCenterAdminUser | getAdminUser | Yes |  |
| nursery | dbo.iCareAdmin_updateCenterUserInfo | EditAdminUser | Yes |  |
| school | dbo.iCareAdmin_updateCenterUserInfo | EditAdminUser | Yes |  |
| nursery | dbo.iCareAdmin_updateCentersInvoiceTracker | updateCentersInvoicingTracker | Yes |  |
| school | dbo.iCareAdmin_updateCentersInvoiceTracker | updateCentersInvoicingTracker | Absent |  |
| nursery | dbo.iCareAdmin_updateCenterInfo | EditCareCenter | Yes |  |
| school | dbo.iCareAdmin_updateCenterInfo | EditCareCenter | Yes |  |
| nursery | dbo.spGenerateChildQrCode | generateChildQRCode | Yes |  |
| school | dbo.spGenerateChildQrCode | generateChildQRCode | Yes |  |
| nursery | dbo.iCareAdmin_addCareCenter | addCareCenter | Yes |  |
| school | dbo.iCareAdmin_addCareCenter | addCareCenter | Yes |  |
| nursery | dbo.iCareAdmin_getCenterChildren | getCenterChildrenList | Yes |  |
| school | dbo.iCareAdmin_getCenterChildren | getCenterChildrenList | Yes |  |
| accounting | dbo.iCareAdmin_getCentersPaymentsList | getAccountingData | Database unavailable |  |
| accounting | dbo.iCareAdmin_updateCenterPayment | updateCenterPayment | Database unavailable |  |
| accounting | dbo.iCareAdmin_deleteCenterPayment | deleteCenterPayment | Database unavailable |  |
| secure | dbo.isDealerSuperAdmin | inline SQL function | Yes |  |
| secure | dbo.isCenterDomainAvailable | inline SQL function | Yes |  |
| secure | dbo.getCenterDomain | inline SQL function | Yes |  |

The nursery add-center call conditionally omits school-only academicYearID; this is handled explicitly rather than flagged as an error. School gateway and invoice-tracker generic-helper paths lack procedures, but their normal legacy list queries exclude school centers. The school monthly class method truly accepts an academic year rather than nursery month parameters.

## Interpretation

See [the database inspection](../../07-database-inspection.md) for conclusions, corrections to the initial source-only audit, verified transaction boundaries, authorization differences, and remaining blockers. Raw exports are kept under ignored `.local/db-audit/`; configuration values and customer records are not copied to this evidence set.
