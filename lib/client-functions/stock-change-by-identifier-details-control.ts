import { SerialNumber, Stock, StockJournalInput } from '@sage/x3-stock-data-api';
import { Filter, extractEdges } from '@sage/xtrem-client';
import * as ui from '@sage/xtrem-ui';

export const optionsIdentifier = [
    'productLotSublot',
    'productLot',
    'lotSublot',
    'lot',
    'productSerialNumber',
    'serialNumber',
    'productLocation',
    'location',
    'productIdentifier1',
    'identifier1',
    'productLicensePlateNumber',
    'licensePlateNumber',
];

type OptionsIdentifierKey = [key: string, value?: string];
type OptionsIdentifiersKeys = Array<OptionsIdentifierKey>;

const _partialListOptionsKey = <OptionsIdentifiersKeys>[
    ['product'],
    ['location'],
    ['lot'],
    ['serialNumber', 'serial number'],
    ['identifier1'],
    ['identifier2'],
    ['licensePlateNumber', 'license plate number'],
];

const _fullListOptionsKey = [..._partialListOptionsKey, ['sublot']];

export type packingUnit = {
    node: {
        packingUnit: {
            code: string;
            numberOfDecimals: number;
        };
        packingUnitToStockUnitConversionFactor: string;
        isPackingFactorEntryAllowed: boolean;
    };
};

export interface  originalStockLine {
    id: string;
    stockId: string;
    packingUnit: any;
    packingUnitToStockUnitConversionFactor: number;
    quantityInPackingUnit: number;
    quantityInStockUnit: number;
    quantityInPackingUnitIssue:number;
};

export function calculateEndingSerialNumber(startingSerialNumber: string, quantity: number): string {
    return startingSerialNumber.replace(/\d+$/, match => {
        const endingNumber = (Number(match) + quantity - 1).toString();
        const lengthDiff = Math.max(endingNumber.length - match.length, 0);
        return endingNumber.padStart(match.length + lengthDiff, '0');
    });
}

export async function readStockIdFromSerialNumber(pageInstance: ui.Page): Promise<string[]> {
    const filterSerialNumber = { _and: [{}] };
    const page = pageInstance as any;
    filterSerialNumber._and.push({ stockSite: { code: page._stockSite } });
    if (page['product']?.value?.code) {
        filterSerialNumber._and.push({ product: { code: page['product'].value.code } });
    }
    if (page['serialNumber']?.value?.code) {
        filterSerialNumber._and.push({ code: page['serialNumber'].value.code });
    }

    return extractEdges<SerialNumber>(
        await pageInstance.$.graph
            .node('@sage/x3-stock-data/SerialNumber')
            .query(
                ui.queryUtils.edgesSelector<SerialNumber>(
                    { stockId: true },
                    {
                        filter: filterSerialNumber,
                        first: 1000,
                    },
                ),
            )
            .execute(),
    )
        .filter(row => row.stockId !== '0')
        .map(row => row.stockId);
}

export async function onChangeFilterStock(pageInstance: ui.Page, filter: Filter<Stock>): Promise<Filter<Stock>> {
    const page = pageInstance as any;
    const stockIds = await readStockIdFromSerialNumber(page);
    let stockFilter = filter;
    if (Number(stockIds?.length)) {
        if (page['product']?.value?.code) {
            if (
                page['product']?.value?.serialNumberManagementMode === 'globalReceivedIssued' &&
                page['serialNumber']?.value?.code
            ) {
                stockFilter = {
                    ...stockFilter,
                    serialNumber: undefined,
                    stockId: { _in: stockIds },
                };
            }
        } else if (page['serialNumber']?.value?.code) {
            stockFilter = {
                ...stockFilter,
                serialNumber: undefined,
                stockId: { _in: stockIds },
            };
        }
    }
    return stockFilter;
}

export async function onRemoveLpnFilter(pageInstance: ui.Page, filter: Filter<Stock>): Promise<Filter<Stock>> {
    const page = pageInstance as any;
    let stockFilter = filter;
    const transaction = page._getSavedInputs().selectedTransaction;
    if (transaction.isLocationChange) {
        stockFilter = {
            ...stockFilter,
            licensePlateNumber: '',
        };
    }
    return stockFilter;
}

export async function onChangeFilterLicensePlateNumber(
    pageInstance: ui.Page,
    filter: Filter<Stock>,
): Promise<Filter<Stock>> {
    const page = pageInstance as any;
    const transaction = page._getSavedInputs().selectedTransaction;
    let stockFilter = filter;
    if (transaction.isLocationChange) {
        stockFilter = {
            ...stockFilter,
            licensePlateNumber: '',
        };
    }
    return stockFilter;
}

export function checkIdentifierField(field: string, identifierFields: string | null): boolean {
    const value =
        identifierFields
            ?.split(/(?=[A-Z])/)
            .join(' ')
            .toLowerCase() ?? undefined;

    return !!value && value.indexOf(field.toLowerCase()) !== -1;
}

export async function initFieldsToBeVisible(pageInstance: ui.Page, identifierFields: string) {
    const page = pageInstance as any;
    const values = new Map<string, string>();
    page._selectedIdentifierValues.split(',').forEach((element: string) => {
        const array = element.split(':');
        values.set(array[0], array[1]);
    });

    _fullListOptionsKey.forEach(([_field, _value]) => {
        if (checkIdentifierField(_value ?? _field, identifierFields)) {
            page[_field].isHidden = false;
            page[_field].isMandatory = true;
            if (values.has(_field)) {
                page[_field].value = {
                    code: values.get(_field),
                };
            }
        }
    });
}

export function getIdentifierValues(pageInstance: ui.Page, identifierFields: string): string[] {
    const page = pageInstance as any;
    const arrayValues: string[] = [];

    (<OptionsIdentifiersKeys>[
        ['product'],
        ['location'],
        ['serialNumber', 'serial number'],
        ['licensePlateNumber', 'license plate number'],
    ]).forEach(([_field, _value]) => {
        if (checkIdentifierField(_value ?? _field, identifierFields) && page[_field]?.value?.code) {
            arrayValues.push(String(page[_field].value.code));
        }
    });

    (<OptionsIdentifiersKeys>[['sublot'], ['identifier1'], ['identifier2']]).forEach(([_field, _value]) => {
        if (checkIdentifierField(_field, identifierFields) && page[_field]?.value) {
            arrayValues.push(String(page[_field].value));
        }
    });

    if (checkIdentifierField('lot', identifierFields) && page['lot']?.value?.lot) {
        arrayValues.push(String(page['lot']?.value.lot));
    }

    return arrayValues;
}

export function getIdentifierFieldsCount(identifierFields: string): number {
    let fieldsCount = 0;

    _partialListOptionsKey.forEach(([_field, _value]) => {
        if (checkIdentifierField(_value ?? _field, identifierFields)) {
            fieldsCount++;
        }
    });

    return fieldsCount;
}

export function isProductGlobalReceivedIssuedInStock(pageInstance: ui.Page): boolean {
    const page = pageInstance as any;
    const stock = page['stock'] as ui.fields.Table<Stock>;
    return stock.value.some(_ => _?.product?.product?.serialNumberManagementMode === 'globalReceivedIssued');
}

export function addValueToSelectedIdentifier(pageInstance: ui.Page, field: string, value: string) {
    const page = pageInstance as any;
    const values = page._selectedIdentifierValues?.split(',');
    values?.forEach((element: string, index: any) => {
        if (element.includes(field)) {
            values.splice(index, 1);
        }
    });
    page._selectedIdentifierValues = values?.join(',');
    page._selectedIdentifierValues = [page._selectedIdentifierValues, `${field}:${value}`].filter(Boolean).join(',');
}

export function disableButton(pageInstance: ui.Page): void {
    const page = pageInstance as any;
    page.nextButton.isDisabled = true;
    page.searchButton.isDisabled = true;
    page.selectAllSwitch.isDisabled = true;
}

export async function getStockResults(pageInstance: ui.Page, filter: Filter<Stock>, maxResult = 500) {
    const page = pageInstance as any;
    return extractEdges<Stock>(
        await page.$.graph
            .node('@sage/x3-stock-data/Stock')
            .query(
                ui.queryUtils.edgesSelector<Stock>(
                    {
                        owner: true,
                        qualityAnalysisRequestId: true,
                        allocatedQuantity: true,
                        quantityInStockUnit: true,
                        lotReference: {
                            majorVersion: {
                                _id: true,
                                code: true,
                            },
                            lotCustomField2: true,
                            lotCustomField1: true,
                            useByDate: true,
                            expirationDate: true,
                        },
                        stockId: true,
                        stockCustomField2: true,
                        stockCustomField1: true,
                        identifier2: true,
                        identifier1: true,
                        packingUnitToStockUnitConversionFactor: true,
                        packingUnit: {
                            code: true,
                            numberOfDecimals: true,
                        },
                        status: { code: true },
                        serialNumber: true,
                        sublot: true,
                        lot: true,
                        location: {
                            _id: true,
                            code: true,
                            category: true,
                        },
                        licensePlateNumber: { code: true },
                        product: {
                            product: {
                                _id: true,
                                code: true,
                                stockUnit: {
                                    code: true,
                                    numberOfDecimals: true,
                                },
                                serialNumberManagementMode: true,
                                lotManagementMode: true,
                                description1: true,
                                localizedDescription1: true,
                                expirationManagementMode: true,
                                productCategory: { code: true },
                                productSites: {
                                    query: {
                                        edges: {
                                            node: {
                                                stockSite: {
                                                    code: true
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                        quantityInPackingUnit: true,
                        _id: true,
                        availableQuantity: true,
                        isBeingCounted: true,
                    },
                    {
                        filter,
                        first: Math.max(maxResult, 500),
                    },
                ),
            )
            .execute(),
    );
}


export function isStockJournalInRecord(
    record: any,
    line: Partial<StockJournalInput>,
): boolean {
    return (
        line.packingUnit === record?.packingUnit?.code &&
        line.packingUnitToStockUnitConversionFactor === record?.packingUnitToStockUnitConversionFactor &&
        line.location === record?.location?.code &&
        line.licensePlateNumber === record?.licensePlateNumber?.code &&
        line.lot === record?.lot &&
        line.status === record?.status?.code &&
        line.sublot === record?.sublot &&
        (line.serialNumber === record?.serialNumber ||
            record?.product?.product?.serialNumberManagementMode === 'globalReceivedIssued') &&
        line.identifier1 === record?.identifier1 &&
        line.identifier2 === record?.identifier2 &&
        line.stockCustomField1 === record?.stockCustomField1 &&
        line.stockCustomField2 === record?.stockCustomField2
    );
}
