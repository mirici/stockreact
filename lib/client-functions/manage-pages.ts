import { ProductSite } from '@sage/x3-master-data-api';
import { dialogMessage } from '@sage/x3-master-data/lib/client-functions/dialogs';
import { LpnOperationsLineInput, MiscellaneousIssueLineInput } from '@sage/x3-stock-api';
import { MobileSettings, SerialNumber, Stock, StockSearchFilter } from '@sage/x3-stock-data-api';
import { ClientNode, ExtractEdges, ExtractEdgesPartial, Filter, decimal, extractEdges } from '@sage/xtrem-client';
import { SystemError } from '@sage/xtrem-shared';
import * as ui from '@sage/xtrem-ui';

/**
 * Initialize manage page
 * @param pageInstance current page
 * @param stockSite stock site
 * @param productSite partial product site object
 * @param flowType type of flow
 * @param errorMessage error messages missing settings
 * @param stockSearchFilters mandatory array to return settings
 */
//todo:
export function managePages(
    pageInstance: ui.Page,
    stockSite: string,
    productSite: ExtractEdgesPartial<ProductSite>,
    flowType: string,
    errorMessage: string,
    stockSearchFilters: StockSearchFilter[],
): void | never {
    // Initializing array when undefined
    stockSearchFilters ??= [];
    if (stockSearchFilters.length) {
        // remove all items in array
        stockSearchFilters.length = 0;
    }

    if (!pageInstance || !stockSite || !productSite || !flowType) {
        throw new SystemError('Invalid arguments');
    }

    const _selectedMobileSettings: MobileSettings = JSON.parse(
        pageInstance.$.queryParameters?.mobileSettings as string,
    );
    if (_selectedMobileSettings === null) {
        throw new Error(errorMessage);
    }

    // Store value in array only when usable and return true when done
    const _pushSettings = (field: StockSearchFilter): boolean => {
        if (field !== 'none') {
            stockSearchFilters?.push(field);
            return true;
        }
        return false;
    };

    // The fields are memorized until they meet the none type.
    const _allPushed =
        _pushSettings(_selectedMobileSettings.stockField1) &&
        _pushSettings(_selectedMobileSettings.stockField2) &&
        _pushSettings(_selectedMobileSettings.stockField3) &&
        _pushSettings(_selectedMobileSettings.stockField4) &&
        _pushSettings(_selectedMobileSettings.stockField5) &&
        _pushSettings(_selectedMobileSettings.stockField6) &&
        _pushSettings(_selectedMobileSettings.stockField7) &&
        _pushSettings(_selectedMobileSettings.stockField8);

    if (pageInstance._pageMetadata.layoutFields?.location) {
        if (!findSetting('location', stockSearchFilters) || productSite.isLocationManaged !== true) {
            (pageInstance as any)['location'].isHidden = true;
        }
    }
    if (pageInstance._pageMetadata.layoutFields?.lot) {
        if (
            !findSetting('lot', stockSearchFilters) ||
            (productSite?.product?.lotManagementMode ?? 'notManaged') === 'notManaged'
        ) {
            (pageInstance as any)['lot'].isHidden = true;
        }
    }
    if (pageInstance._pageMetadata.layoutFields?.sublot)
        if (
            !findSetting('sublot', stockSearchFilters) ||
            (productSite?.product?.lotManagementMode ?? '') !== 'lotAndSublot'
        ) {
            (pageInstance as any)['sublot'].isHidden = true;
        }
    if (pageInstance._pageMetadata.layoutFields?.serialNumber) {
        if (
            !findSetting('serial', stockSearchFilters) ||
            !['receivedIssued'].includes(productSite?.product?.serialNumberManagementMode ?? 'receivedIssued')
        ) {
            (pageInstance as any)['serialNumber'].isHidden = true;
        }
    }
    if (pageInstance._pageMetadata.layoutFields?.status) {
        if (!findSetting('status', stockSearchFilters)) {
            (pageInstance as any)['status'].isHidden = true;
        }
    }

    if (pageInstance._pageMetadata.layoutFields?.packingUnit) {
        if (!findSetting('packingUnit', stockSearchFilters)) {
            (pageInstance as any)['packingUnit'].isHidden = true;
        }
    }
    if (pageInstance._pageMetadata.layoutFields?.packingUnitToStockUnitConversionFactor) {
        if (!findSetting('pacStkConversionFactor', stockSearchFilters)) {
            (pageInstance as any)['packingUnitToStockUnitConversionFactor'].isHidden = true;
        }
    }
    if (pageInstance._pageMetadata.layoutFields?.identifier1) {
        if (!findSetting('identifier1', stockSearchFilters)) {
            (pageInstance as any)['identifier1'].isHidden = true;
        }
    }
    if (pageInstance._pageMetadata.layoutFields?.identifier2) {
        if (!findSetting('identifier2', stockSearchFilters)) {
            (pageInstance as any)['identifier2'].isHidden = true;
        }
    }
    if (pageInstance._pageMetadata.layoutFields?.licensePlateNumber) {
        if (
            productSite.isLicensePlateNumberManaged !== true ||
            !findSetting('licensePlateNumber', stockSearchFilters)
        ) {
            (pageInstance as any)['licensePlateNumber'].isHidden = true;
        }
    }
    if (pageInstance._pageMetadata.layoutFields?.stockCustomField1) {
        if (!findSetting('customField1', stockSearchFilters)) {
            (pageInstance as any)['stockCustomField1'].isHidden = true;
        }
    }
    if (pageInstance._pageMetadata.layoutFields?.stockCustomField2) {
        if (!findSetting('customField2', stockSearchFilters)) {
            (pageInstance as any)['stockCustomField2'].isHidden = true;
        }
    }
}

/**
 * Search if filter
 * @param field current search field
 * @param fields list of current filter
 * @returns true when found used filter parameter
 */
export function findSetting(field: StockSearchFilter, fields: StockSearchFilter[]): boolean {
    return fields.findIndex(fld => fld === field) >= 0;
}

/**
 * Remove filter (asynchronous for avoiding anticipated onChange)
 * @param pageInstance current page
 */
export async function removeFilters(pageInstance: ui.Page): Promise<void> {
    if (pageInstance._pageMetadata.layoutFields?.location) (pageInstance as any)['location'].value = null;
    if (pageInstance._pageMetadata.layoutFields?.lot) (pageInstance as any)['lot'].value = null;
    if (pageInstance._pageMetadata.layoutFields?.sublot) (pageInstance as any)['sublot'].value = null;
    if (pageInstance._pageMetadata.layoutFields?.serialNumber) (pageInstance as any)['serialNumber'].value = null;
    if (pageInstance._pageMetadata.layoutFields?.status) (pageInstance as any)['status'].value = null;
    if (pageInstance._pageMetadata.layoutFields?.packingUnit) (pageInstance as any)['packingUnit'].value = null;
    if (pageInstance._pageMetadata.layoutFields?.packingUnitToStockUnitConversionFactor)
        (pageInstance as any)['packingUnitToStockUnitConversionFactor'].value = null;
    if (pageInstance._pageMetadata.layoutFields?.identifier1) (pageInstance as any)['identifier1'].value = null;
    if (pageInstance._pageMetadata.layoutFields?.identifier2) (pageInstance as any)['identifier2'].value = null;
    if (pageInstance._pageMetadata.layoutFields?.licensePlateNumber)
        (pageInstance as any)['licensePlateNumber'].value = null;
    if (pageInstance._pageMetadata.layoutFields?.stockCustomField1)
        (pageInstance as any)['stockCustomField1'].value = null;
    if (pageInstance._pageMetadata.layoutFields?.stockCustomField2)
        (pageInstance as any)['stockCustomField2'].value = null;
}

export function generateStockTableFilter(pageInstance: ui.Page): Filter<Stock> {
    const stockSite = (pageInstance as any)['_stockSite'];
    const stockFilter: Filter<any> = {
        availableQuantity: { _gt: '0' },
        //      quantityInPackingUnit: { _gt: '0' },
        isBeingCounted: false,
        owner: stockSite?.code,
    };
    let parameterLocation = pageInstance.$.queryParameters?.location as string | undefined;
    if (
        !parameterLocation &&
        pageInstance._pageMetadata.layoutFields?.location &&
        (pageInstance as any)['location'].value
    ) {
        parameterLocation = (pageInstance as any)['location'].value?.code;
    }
    const quantityToPick = ((pageInstance as any)['_quantityToPick'] as number) ?? null;
    const beginSerialNumber =
        ((pageInstance as any)['serialNumber'] as ui.fields.Reference<SerialNumber>)?.value?.code ?? null;
    const endSerialNumber =
        beginSerialNumber && quantityToPick ? _calculateEndingSerialNumber(beginSerialNumber, quantityToPick) : null;
    const isFilterSerialNumber = ((pageInstance as any)['_isFilterSerialNumber'] as boolean) ?? false;

    const filterLicensePlateNumber: Filter<any> = pageInstance._pageMetadata.layoutFields?.licensePlateNumber
        ? (pageInstance as any)['licensePlateNumber'].value?.code
            ? { licensePlateNumber: { code: (pageInstance as any)['licensePlateNumber'].value.code } }
            : {}
        : (pageInstance.$.queryParameters?.licensePlateNumberOrigin as string | undefined)
          ? { licensePlateNumber: { code: pageInstance.$.queryParameters.licensePlateNumberOrigin as string } }
          : { licensePlateNumber: { code: { _in: [undefined, ''] } } };

    return {
        ...stockFilter,
        ...(pageInstance._pageMetadata.layoutFields?.product &&
            (pageInstance as any)['product'].value?.code && {
                product: { product: { code: (pageInstance as any)['product'].value.code } },
            }),
        ...filterLicensePlateNumber,
        ...(pageInstance._pageMetadata.layoutFields?.location &&
            !(pageInstance as any)['location'].isHidden &&
            (pageInstance as any)['location'].value && {
                location: { code: parameterLocation },
            }),
        // lot and sublot are reference fields bound to the same Lot node
        // so first check if sublot field is enabled with a value. If so, filter for both lot and sublot
        // otherwise check if lot field is enabled with a value. If so filter for lot and additionally sublot, if applicable

        ...((pageInstance._pageMetadata.layoutFields?.lot &&
            !(pageInstance as any)['lot'].isHidden &&
            (pageInstance as any)['lot'].value?.lot && {
                lot: (pageInstance as any)['lot'].value.lot,
                ...((pageInstance as any)['lot'].value.sublot && {
                    sublot: (pageInstance as any)['lot'].value.sublot,
                }),
            }) ||
            (pageInstance._pageMetadata.layoutFields?.sublot &&
                !(pageInstance as any)['sublot'].isHidden &&
                (pageInstance as any)['sublot'].value?.sublot && {
                    lot: (pageInstance as any)['sublot'].value.lot,
                    sublot: (pageInstance as any)['sublot'].value.sublot,
                })),
        //...(this.sublot.value?.sublot && { sublot: this.sublot.value.sublot }),
        ...(pageInstance._pageMetadata.layoutFields?.serialNumber &&
            !isFilterSerialNumber &&
            !(pageInstance as any)['serialNumber'].isHidden &&
            (pageInstance as any)['serialNumber'].value?.code && {
                serialNumber: (pageInstance as any)['serialNumber'].value.code,
            }),
        ...(pageInstance._pageMetadata.layoutFields?.serialNumber &&
            isFilterSerialNumber &&
            beginSerialNumber &&
            endSerialNumber && {
                serialNumber: {
                    _gte: beginSerialNumber,
                    //                  _lte: endSerialNumber,
                },
            }),
        ...(pageInstance._pageMetadata.layoutFields?.status &&
            !(pageInstance as any)['status'].isHidden &&
            (pageInstance as any)['status'].value && { status: { code: (pageInstance as any)['status'].value } }),
        // ...(this.packingUnit.value && { packingUnit: this._unitMap.get(this.packingUnit.value).unit }),
        ...(pageInstance._pageMetadata.layoutFields?.packingUnit &&
            !(pageInstance as any)['packingUnit'].isHidden &&
            (pageInstance as any)['packingUnit'].value && {
                packingUnit: { code: (pageInstance as any)['packingUnit'].value },
            }),
        ...(pageInstance._pageMetadata.layoutFields?.packingUnitToStockUnitConversionFactor &&
            !(pageInstance as any)['packingUnitToStockUnitConversionFactor'].isHidden &&
            (pageInstance as any)['packingUnitToStockUnitConversionFactor'].value && {
                packingUnitToStockUnitConversionFactor: (pageInstance as any)['packingUnitToStockUnitConversionFactor']
                    .value,
            }),
        ...(pageInstance._pageMetadata.layoutFields?.identifier1 &&
            !(pageInstance as any)['identifier1'].isHidden &&
            (pageInstance as any)['identifier1'].value && { identifier1: (pageInstance as any)['identifier1'].value }),
        ...(pageInstance._pageMetadata.layoutFields?.identifier2 &&
            !(pageInstance as any)['identifier2'].isHidden &&
            (pageInstance as any)['identifier2'].value && { identifier2: (pageInstance as any)['identifier2'].value }),
        ...(pageInstance._pageMetadata.layoutFields?.stockCustomField1 &&
            !(pageInstance as any)['stockCustomField1'].isHidden &&
            (pageInstance as any)['stockCustomField1'].value && {
                stockCustomField1: (pageInstance as any)['stockCustomField1'].value,
            }),
        ...(pageInstance._pageMetadata.layoutFields?.stockCustomField2 &&
            !(pageInstance as any)['stockCustomField2'].isHidden &&
            (pageInstance as any)['stockCustomField2'].value && {
                stockCustomField2: (pageInstance as any)['stockCustomField2'].value,
            }),
    };
}

function _calculateEndingSerialNumber(startingSerialNumber: string, quantity: number): string {
    return startingSerialNumber.replace(/\d+$/, match => {
        const endingNumber = (Number(match) + quantity - 1).toString();
        const lengthDiff = Math.max(endingNumber.length - match.length, 0);
        return endingNumber.padStart(match.length + lengthDiff, '0');
    });
}

export async function handleFilterOnChange<T extends ClientNode>(
    pageInstance: ui.Page,
    field: ui.fields.Reference<T> | ui.fields.Text | ui.fields.Numeric | ui.fields.DropdownList | ui.fields.Select,
    filterCriterion: any = null,
): Promise<void> {
    // if field value is cleared out during onChange, then delete the corresponding filter property in stock table's filter
    const stockKey = field.id as keyof Stock;
    if (!stockKey) {
        //throw new SystemError('Invalid stock property to filter');
        return; // do nothing?
    }
    if (!pageInstance._pageMetadata.layoutFields?.stock) {
        //throw new SystemError('Invalid stock property to pageInstance');
        return; // do nothing?
    }
    const stock = (pageInstance as any)['stock'] as ui.fields.Table<Stock>;
    const stockChangeLines = ((pageInstance as any)['_stockChangeLines'] as LpnOperationsLineInput[]) ?? null;
    const miscellaneousStockTransactionLines =
        ((pageInstance as any)['_miscellaneousStockTransactionLines'] as MiscellaneousIssueLineInput[]) ?? null;
    const currentLine = (pageInstance as any)['_currentLine'] as number;
    const currentStockChangeLine = stockChangeLines ? stockChangeLines[currentLine] ?? null : null;
    const currentMiscellaneousStockTransactionLine = miscellaneousStockTransactionLines
        ? miscellaneousStockTransactionLines[currentLine] ?? null
        : null;
    const quantityToPick = ((pageInstance as any)['_quantityToPick'] as number) ?? null;
    const beginSerialNumber =
        ((pageInstance as any)['serialNumber'] as ui.fields.Reference<SerialNumber>)?.value?.code ?? null;
    const endSerialNumber =
        beginSerialNumber && quantityToPick ? _calculateEndingSerialNumber(beginSerialNumber, quantityToPick) : null;
    const isFilterSerialNumber = ((pageInstance as any)['_isFilterSerialNumber'] as boolean) ?? false;

    // When for the tuple the value is undefined, the key is removed from the filter.
    if (!field.value) {
        stock.filter = {
            ...stock.filter,
            ...(stockKey === 'location' && {
                ...(pageInstance.$.page.id === 'MobileSubcontractTransferDetails' && {
                    [stockKey]: { category: { _nin: ['subcontract', 'customer'] } },
                }),
                ...(pageInstance.$.page.id !== 'MobileSubcontractTransferDetails' && { [stockKey]: undefined }),
            }),
            ...(!['location'].includes(stockKey) && { [stockKey]: undefined }),
        };
    } else {
        stock.filter = {
            ...stock.filter,
            ...(stockKey === 'packingUnit' &&
                pageInstance._pageMetadata.layoutFields?.packingUnit && {
                    [stockKey]: {
                        code: (pageInstance as any)[stockKey].value,
                    },
                }),
            ...(stockKey === 'status' && {
                [stockKey]: {
                    code:
                        filterCriterion ??
                        (field instanceof ui.fields.Reference && field?.valueField
                            ? { [field.valueField]: field.value[field.valueField as keyof T] }
                            : field.value),
                },
            }),
            ...(stockKey === 'serialNumber' &&
                isFilterSerialNumber &&
                beginSerialNumber &&
                endSerialNumber && {
                    [stockKey]: {
                        _gte: beginSerialNumber,
                        //                      _lte: endSerialNumber,
                    },
                }),
            ...(stockKey === 'serialNumber' &&
                !isFilterSerialNumber && {
                    [stockKey]: {
                        _eq: beginSerialNumber,
                    },
                }),
            // All other cases
            ...(!['packingUnit', 'status', 'serialNumber'].includes(stockKey) && {
                [stockKey]:
                    filterCriterion ??
                    (field instanceof ui.fields.Reference && field?.valueField
                        ? { [field.valueField]: field.value[field.valueField as keyof T] }
                        : field.value),
            }),
        };
        stock.pageSize = 1000;
    }

    await _setStockQuantityInPackingUnit(
        pageInstance,
        stock,
        currentStockChangeLine ?? currentMiscellaneousStockTransactionLine,
    );

    if (!field.value) {
        field.getNextField(true)?.focus();
    }
}

/**
 * _setStockQuantityInPackingUnit
 * @param pageInstance current page
 * @param stock stock table
 * @param currentStockLine stock line for lpnOperations or MiscellaneousIssue
 */
async function _setStockQuantityInPackingUnit(
    pageInstance: ui.Page,
    stock: ui.fields.Table<Stock>,
    currentStockLine: LpnOperationsLineInput | MiscellaneousIssueLineInput | null,
): Promise<void> {
    const _stockDetails = currentStockLine?.stockDetails;
    if (_stockDetails) {
        stock.selectedRecords.forEach((rowId: string) => {
            const stockRecord = stock.getRecordValue(rowId);
            if (stockRecord) {
                const qtyTotal = _stockDetails.reduce<decimal>((acc, curr) => {
                    return acc + Number(curr.quantityInPackingUnit);
                }, 0);

                stockRecord.quantityInPackingUnit = String(qtyTotal);
                stock.setRecordValue(stockRecord);
            }
        });
        await pageInstance.$.commitValueAndPropertyChanges();
    }
}

/**
 * Read one serial number for a given stock id
 * @param pageInstance current page
 * @param stockId stock id
 * @param orderBy sort order
 * @returns serial number or null
 */
export async function readSerialNumberFromStockId(
    pageInstance: ui.Page,
    stockId: string,
    orderBy: number,
): Promise<ExtractEdges<SerialNumber> | null> {
    if (stockId) {
        try {
            const serialNumber = extractEdges(
                await pageInstance.$.graph
                    .node('@sage/x3-stock-data/SerialNumber')
                    .query(
                        ui.queryUtils.edgesSelector(
                            {
                                code: true,
                            },
                            {
                                filter: { stockId },
                                orderBy: { code: orderBy },
                            },
                        ),
                    )
                    .execute(),
            ) as ExtractEdges<SerialNumber>[];
            if (serialNumber[0]) {
                return serialNumber[0];
            }
        } catch (e) {
            await dialogMessage(
                pageInstance,
                'error',
                ui.localize('@sage/x3-stock/error-loading-serial-number-node', 'Error loading serial number node'),
                String(e),
            );
        }
    }

    return null;
}
