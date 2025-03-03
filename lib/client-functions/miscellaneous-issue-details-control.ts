import { Product, ProductSite, SerialNumberManagement } from '@sage/x3-master-data-api';
import { MiscellaneousIssueLineInput } from '@sage/x3-stock-api';
import { LotsSites, SerialNumber, Stock, StockJournalInput, StockManagementRules } from '@sage/x3-stock-data-api';
import { Site } from '@sage/x3-system-api';
import { getRegExp } from '@sage/x3-system/lib/shared-functions/pat-converter';
import { Filter,ExtractEdges,extractEdges } from '@sage/xtrem-client';
import * as ui from '@sage/xtrem-ui';
import { inputsMiscIssue } from '../pages/mobile-miscellaneous-issue';
import { findStockManagementRules } from './stock-management-rules';

interface PageMiscellaneousIssueDetailFields {
    stock: ui.fields.Table<Stock>;
    _miscellaneousIssueLines: MiscellaneousIssueLineInput[];
    _productSite: ProductSite;
    _currentOperation: number;
    product: ui.fields.Reference<Product>;
    stockDetails: ui.fields.DetailList<Stock>;
    gridBlock: ui.containers.GridRowBlock;
    _stockId: ui.fields.Text;
    quantityToMove: ui.fields.Numeric;
    packingUnitToStockUnitConversionFactorToIssue: ui.fields.Numeric;
    packingUnitToIssue: ui.fields.DropdownList;
    serialNumberLines: ui.fields.Table<any>;
    site: ui.fields.Text;
    _currentLine: number;
    _currentDetail: number;
    _serialNumberManagementMode: SerialNumberManagement | undefined;
    startingSerialNumber: ui.fields.Reference<SerialNumber>;
    endingSerialNumber: ui.fields.Text;
    addSerialRange: ui.PageAction;
    lot: ui.fields.Reference<LotsSites>;
    sublot: ui.fields.Reference<LotsSites>;
    packingUnit: ui.fields.Select;
    _packingUnits: packingUnit[];
    _stockSite: Site;
    status: ui.fields.Select;
    _selectedStockManagementRules: StockManagementRules;
    serialNumber: ui.fields.Reference<SerialNumber>;
    _originalStockLines: originalStockLine[];
}

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

export type PageMiscellaneousIssueDetail = ui.Page & PageMiscellaneousIssueDetailFields;

function _onRowClickGlobalReceivedIssue(pageInstance: PageMiscellaneousIssueDetail, currentRecord: any) {
    pageInstance.serialNumberLines.isHidden = false;
    pageInstance.serialNumberLines.value = [];
    pageInstance._miscellaneousIssueLines.forEach(line => {
        if (_isLineToRecord(pageInstance, currentRecord, line) && line.lineNumber === pageInstance._currentOperation) {
            line.stockDetails?.forEach((detail: Partial<StockJournalInput>) => {
                if (_isStockJournalToRecord(pageInstance, currentRecord, detail)) {
                    pageInstance.serialNumberLines.addRecord({
                        quantity: Number(detail.quantityInPackingUnit),
                        startingSerialNumber: detail.serialNumber,
                    });
                }
            });
        }
    });
    pageInstance.stock.setRecordValue(currentRecord);
}

function _onRowClickNotGlobalReceivedIssue(pageInstance: PageMiscellaneousIssueDetail, currentRecord: any) {
    let lineIndex: number = pageInstance._miscellaneousIssueLines.findIndex(
        line =>
            _isLineToRecord(pageInstance, currentRecord, line) && line.lineNumber === pageInstance._currentOperation,
    );
    if (lineIndex === -1) {
        lineIndex =
            pageInstance._miscellaneousIssueLines.push({
                product: pageInstance.product.value?.code,
                productDescription: pageInstance.product.value?.description1,
                quantityInPackingUnit: 0,
                packingUnit: currentRecord.packingUnit?.code,
                packingUnitToStockUnitConversionFactor: currentRecord.packingUnitToStockUnitConversionFactor,
                quantityInStockUnit: 0,
                lineNumber: pageInstance._currentOperation,
                stockDetails: [],
            }) - 1;
    }
    pageInstance._currentLine = lineIndex;
    let detailIndex: number =
        pageInstance._miscellaneousIssueLines[lineIndex].stockDetails?.findIndex((detail: Partial<StockJournalInput>) =>
            _isStockJournalToRecord(pageInstance, currentRecord, detail as StockJournalInput),
        ) ?? -1;
    if (detailIndex > -1) {
        const stockDetail = pageInstance._miscellaneousIssueLines[lineIndex].stockDetails
            ? ([detailIndex] as Partial<StockJournalInput>)
            : null;
        if (stockDetail) {
            stockDetail.quantityInPackingUnit = currentRecord.quantityInPackingUnit;
            stockDetail.quantityInStockUnit =
                Number(currentRecord.quantityInPackingUnit) *
                Number(currentRecord.packingUnitToStockUnitConversionFactor);
            pageInstance._currentDetail = detailIndex;
        }
    } else {
        const stockDetails = pageInstance._miscellaneousIssueLines[lineIndex].stockDetails;
        if (stockDetails) {
            detailIndex =
                stockDetails.push({
                    packingUnit: currentRecord.packingUnit?.code,
                    packingUnitToStockUnitConversionFactor: currentRecord.packingUnitToStockUnitConversionFactor,
                    quantityInPackingUnit: Number(currentRecord.quantityInPackingUnit),
                    quantityInStockUnit:
                        Number(currentRecord.quantityInPackingUnit) *
                        Number(currentRecord.packingUnitToStockUnitConversionFactor),
                    location: currentRecord.location?.code,
                    licensePlateNumber: currentRecord.licensePlateNumber?.code ?? '',
                    lot: currentRecord.lot,
                    status: currentRecord.status?.code ?? '',
                    sublot: currentRecord.sublot,
                    serialNumber: currentRecord.serialNumber,
                    identifier1: currentRecord.identifier1,
                    identifier2: currentRecord.identifier2,
                    stockCustomField1: currentRecord.stockCustomField1,
                    stockCustomField2: currentRecord.stockCustomField2,
                    stockUnit: pageInstance._productSite.product.stockUnit.code,
                }) - 1;
        } else {
            detailIndex = -1;
        }
        pageInstance._currentDetail = detailIndex;
    }
    _calculateLineQuantity(pageInstance._miscellaneousIssueLines[lineIndex], pageInstance);
}

export async function _onRowClick(pageInstance: PageMiscellaneousIssueDetail, recordId: string, rowItem: Stock) {
    pageInstance.gridBlock.selectedRecordId = recordId; // populate grid row block
    pageInstance._stockId.value = rowItem.stockId;
    const currentRecord = pageInstance.stock.getRecordValue(pageInstance.gridBlock.selectedRecordId) as any;
    const originalStockLine = pageInstance._originalStockLines?.find(line => recordId === line.id);
    rowItem.quantityInPackingUnit = String(originalStockLine?.quantityInPackingUnit);
    rowItem.quantityInStockUnit = String(originalStockLine?.quantityInStockUnit);
    rowItem.packingUnit.code = originalStockLine?.packingUnit.code;
    rowItem.packingUnit.numberOfDecimals = originalStockLine?.packingUnit.numberOfDecimals;
    pageInstance.stockDetails.value = [rowItem];

    const selectedValue = originalStockLine?.packingUnit.code;
    const packingUnitIndex = pageInstance._packingUnits
        .map(packingUnit => packingUnit.node.packingUnit.code)
        .indexOf(selectedValue);
    if (packingUnitIndex !== -1) {
        const selectedUnit = pageInstance._packingUnits[packingUnitIndex].node;
        pageInstance.packingUnitToStockUnitConversionFactorToIssue.isDisabled =
            !selectedUnit.isPackingFactorEntryAllowed;
        pageInstance.quantityToMove.scale = selectedUnit.packingUnit.numberOfDecimals;
    } else {
        pageInstance.packingUnitToStockUnitConversionFactorToIssue.isDisabled = true;
        pageInstance.quantityToMove.scale = 0;
    }

    pageInstance.quantityToMove.value = null;
    pageInstance.packingUnitToStockUnitConversionFactorToIssue.value = originalStockLine?.packingUnitToStockUnitConversionFactor ?? 1;
    pageInstance.packingUnitToIssue.value = originalStockLine?.packingUnit.code;

    const conversionFactor = pageInstance.packingUnitToStockUnitConversionFactorToIssue.value.toString();
    const  numberOfDec = (conversionFactor.includes('.')) ? conversionFactor.split('.')[1].length : 0;
    pageInstance.packingUnitToStockUnitConversionFactorToIssue.scale = numberOfDec;

    if (pageInstance._packingUnits.length) {
        pageInstance.packingUnitToIssue.isDisabled = false;
    }

    currentRecord.quantityInStockUnit = originalStockLine?.quantityInStockUnit;
    currentRecord.packingUnit.code =  originalStockLine?.packingUnit.code;
    currentRecord.quantityInPackingUnit =  originalStockLine?.quantityInPackingUnit;

    if (pageInstance._productSite.product.serialNumberManagementMode === 'globalReceivedIssued') {
        _onRowClickGlobalReceivedIssue(pageInstance, currentRecord);
    } else {
        _onRowClickNotGlobalReceivedIssue(pageInstance, currentRecord);
    }
    await pageInstance.$.commitValueAndPropertyChanges();
    await pageInstance.stock.validateWithDetails();

    if (pageInstance.$.detailPanel) pageInstance.$.detailPanel.isHidden = false;

    pageInstance.stock.setRecordValue(currentRecord);
}

async function _onRowSelectedGlobalReceivedIssued(
    pageInstance: PageMiscellaneousIssueDetail,
    stockRecord: any,
    lineIndex: number,
) {
    const responseSerialNumber = await pageInstance.$.graph
        .node('@sage/x3-stock-data/SerialNumber')
        .query(
            ui.queryUtils.edgesSelector(
                {
                    code: true,
                },
                {
                    filter: {
                        stockId: stockRecord.stockId,
                        product: { code: pageInstance.product.value?.code },
                        stockSite: { code: pageInstance.site.value },
                    },
                    first: 1001,
                },
            ),
        )
        .execute();
    let currentSerialNumber: string;
    currentSerialNumber = '';
    let beginSerialNumber: string;
    beginSerialNumber = '';
    let quantitySerialNumber: number;
    quantitySerialNumber = 0;
    for (const itemSerialNumber of responseSerialNumber.edges) {
        if (beginSerialNumber === '') {
            beginSerialNumber = itemSerialNumber.node.code;
            currentSerialNumber = itemSerialNumber.node.code;
            quantitySerialNumber = 1;
        } else if (itemSerialNumber.node.code === _nextSerialNumber(currentSerialNumber)) {
            currentSerialNumber = itemSerialNumber.node.code;
            quantitySerialNumber++;
        } else {
            const stockDetails = pageInstance._miscellaneousIssueLines[lineIndex].stockDetails;
            if (stockDetails) {
                pageInstance._currentDetail =
                    stockDetails.push({
                        packingUnit: stockRecord.packingUnit?.code,
                        packingUnitToStockUnitConversionFactor: stockRecord.packingUnitToStockUnitConversionFactor,
                        quantityInPackingUnit: quantitySerialNumber,
                        quantityInStockUnit:
                            Number(quantitySerialNumber) * Number(stockRecord.packingUnitToStockUnitConversionFactor),
                        location: stockRecord.location?.code,
                        licensePlateNumber: stockRecord.licensePlateNumber?.code ?? '',
                        lot: stockRecord.lot,
                        status: stockRecord.status?.code ?? '',
                        sublot: stockRecord.sublot,
                        serialNumber: beginSerialNumber,
                        identifier1: stockRecord.identifier1,
                        identifier2: stockRecord.identifier2,
                        stockCustomField1: stockRecord.stockCustomField1,
                        stockCustomField2: stockRecord.stockCustomField2,
                        stockUnit: pageInstance._productSite.product.stockUnit.code,
                    }) - 1;
            } else {
                pageInstance._currentDetail = -1;
            }
            beginSerialNumber = itemSerialNumber.node.code;
            currentSerialNumber = itemSerialNumber.node.code;
            quantitySerialNumber = 1;
        }
    }
    if (beginSerialNumber !== '' && quantitySerialNumber !== 0) {
        const stockDetails = pageInstance._miscellaneousIssueLines[lineIndex].stockDetails;
        if (stockDetails) {
            pageInstance._currentDetail =
                stockDetails.push({
                    packingUnit: stockRecord.packingUnit?.code,
                    packingUnitToStockUnitConversionFactor: stockRecord.packingUnitToStockUnitConversionFactor,
                    quantityInPackingUnit: quantitySerialNumber,
                    quantityInStockUnit:
                        Number(quantitySerialNumber) * Number(stockRecord.packingUnitToStockUnitConversionFactor),
                    location: stockRecord.location?.code,
                    licensePlateNumber: stockRecord.licensePlateNumber?.code ?? '',
                    lot: stockRecord.lot,
                    status: stockRecord.status?.code ?? '',
                    sublot: stockRecord.sublot,
                    serialNumber: beginSerialNumber,
                    identifier1: stockRecord.identifier1,
                    identifier2: stockRecord.identifier2,
                    stockCustomField1: stockRecord.stockCustomField1,
                    stockCustomField2: stockRecord.stockCustomField2,
                    stockUnit: pageInstance._productSite.product.stockUnit.code,
                }) - 1;
        } else {
            pageInstance._currentDetail = -1;
        }
    }
}

function _onRowSelectedNotGlobalReceivedIssued(
    pageInstance: PageMiscellaneousIssueDetail,
    stockRecord: any,
    lineIndex: number,
) {
    const stockDetails = pageInstance._miscellaneousIssueLines[lineIndex].stockDetails;
    if (stockDetails) {
        let detailIndex: number = stockDetails.findIndex(detail =>
            _isStockJournalToRecord(pageInstance, stockRecord, detail as StockJournalInput),
        );
        if (detailIndex > -1) {
            const stockDetail = stockDetails[detailIndex];
            stockDetail.quantityInPackingUnit = stockRecord.quantityInPackingUnit;
            stockDetail.quantityInStockUnit =
                Number(stockRecord.quantityInPackingUnit) * Number(stockRecord.packingUnitToStockUnitConversionFactor);
            pageInstance._currentDetail = detailIndex;
        } else {
            detailIndex =
                stockDetails.push({
                    packingUnit: stockRecord.packingUnit?.code,
                    packingUnitToStockUnitConversionFactor: stockRecord.packingUnitToStockUnitConversionFactor,
                    quantityInPackingUnit: Number(stockRecord.quantityInPackingUnit),
                    quantityInStockUnit:
                        Number(stockRecord.quantityInPackingUnit) *
                        Number(stockRecord.packingUnitToStockUnitConversionFactor),
                    location: stockRecord.location?.code,
                    licensePlateNumber: stockRecord.licensePlateNumber?.code ?? '',
                    lot: stockRecord.lot,
                    status: stockRecord.status?.code ?? '',
                    sublot: stockRecord.sublot,
                    serialNumber: stockRecord.serialNumber,
                    identifier1: stockRecord.identifier1,
                    identifier2: stockRecord.identifier2,
                    stockCustomField1: stockRecord.stockCustomField1,
                    stockCustomField2: stockRecord.stockCustomField2,
                    stockUnit: pageInstance._productSite.product.stockUnit.code,
                }) - 1;
        }
        pageInstance._currentDetail = detailIndex;
    }
}

export async function _onRowSelected(pageInstance: PageMiscellaneousIssueDetail, recordId: string, _rowItem: Stock) {
    const stockRecord = pageInstance.stock.getRecordValue(recordId);
    if (stockRecord) {
        pageInstance.stock.isDisabled = true;

        let lineIndex: number = pageInstance._miscellaneousIssueLines.findIndex(
            line =>
                _isLineToRecord(pageInstance, stockRecord, line) && line.lineNumber === pageInstance._currentOperation,
        );
        if (lineIndex === -1) {
            lineIndex =
                pageInstance._miscellaneousIssueLines.push({
                    product: pageInstance.product.value?.code,
                    productDescription: pageInstance.product.value?.description1,
                    quantityInPackingUnit: 0,
                    packingUnit: stockRecord.packingUnit?.code,
                    packingUnitToStockUnitConversionFactor: stockRecord.packingUnitToStockUnitConversionFactor,
                    quantityInStockUnit: 0,
                    lineNumber: pageInstance._currentOperation,
                    stockDetails: [],
                }) - 1;
        }
        pageInstance._currentLine = lineIndex;

        if (pageInstance._productSite.product.serialNumberManagementMode === 'globalReceivedIssued') {
            _onRowSelectedGlobalReceivedIssued(pageInstance, stockRecord, lineIndex);
        } else {
            _onRowSelectedNotGlobalReceivedIssued(pageInstance, stockRecord, lineIndex);
        }

        _calculateLineQuantity(pageInstance._miscellaneousIssueLines[lineIndex], pageInstance);
        _saveMiscellaneousIssue(pageInstance);
        (stockRecord as any).quantityToMove = (stockRecord as any).quantityInPackingUnit;
        (stockRecord as any).quantityInStockUnit =
            Number((stockRecord as any).quantityInPackingUnit) *
            Number(stockRecord.packingUnitToStockUnitConversionFactor);
        pageInstance.stock.setRecordValue(stockRecord);
        pageInstance.stock.selectRecord(recordId);
        pageInstance.stock.isDisabled = false;
    }
}

export async function _onRowUnselected(pageInstance: PageMiscellaneousIssueDetail, recordId: string, _rowItem: Stock) {
    const stockRecord = pageInstance.stock.getRecordValue(recordId);
    if (stockRecord) {
        let i: number;
        i = 0;
        pageInstance._miscellaneousIssueLines.forEach(line => {
            if (
                _isLineToRecord(pageInstance, stockRecord, line) &&
                line.lineNumber === pageInstance._currentOperation
            ) {
                let j: number;
                j = 0;
                line.stockDetails?.forEach(stock => {
                    if (_isStockJournalToRecord(pageInstance, stockRecord, stock)) {
                        line.stockDetails?.splice(j, 1);
                    }
                    j++;
                })

            }
        });
        _saveMiscellaneousIssue(pageInstance);
        const originalStockLine = pageInstance._originalStockLines?.find(line => recordId === line.id);
        (stockRecord as any).quantityToMove = originalStockLine?.quantityInPackingUnit;
        (stockRecord as any).packingUnit.code =  originalStockLine?.packingUnit.code;
        (stockRecord as any).quantityInStockUnit = originalStockLine?.quantityInStockUnit;
        (stockRecord as any).quantityInPackingUnit = originalStockLine?.quantityInPackingUnit;
        pageInstance.stock.setRecordValue(stockRecord);
    }
}

export function _isLineToRecord(
    _pageInstance: PageMiscellaneousIssueDetail,
    record: any,
    line: Partial<MiscellaneousIssueLineInput>,
): boolean {
    return line.product === record.product?.product.code;
}

export function _isStockJournalToRecord(
    pageInstance: PageMiscellaneousIssueDetail,
    record: any,
    line: Partial<StockJournalInput>,
): boolean {
    return (
        line.packingUnit === (record?.packingUnit?.code ?? '') &&
        line.packingUnitToStockUnitConversionFactor === record?.packingUnitToStockUnitConversionFactor &&
        line.location === record?.location?.code &&
        line.licensePlateNumber === (record?.licensePlateNumber?.code ?? '') &&
        line.lot === record?.lot &&
        line.status === (record?.status?.code ?? '') &&
        line.sublot === record?.sublot &&
        (line.serialNumber === record?.serialNumber ||
            pageInstance._serialNumberManagementMode === 'globalReceivedIssued') &&
        line.identifier1 === record?.identifier1 &&
        line.identifier2 === record?.identifier2 &&
        line.stockCustomField1 === record?.stockCustomField1 &&
        line.stockCustomField2 === record?.stockCustomField2
    );
}

export function _getSavedInputs(pageInstance: PageMiscellaneousIssueDetail) {
    return JSON.parse(pageInstance.$.storage.get('mobile-miscellaneousIssue') as string) as inputsMiscIssue;
}

export function _saveMiscellaneousIssue(pageInstance: PageMiscellaneousIssueDetail) {
    const miscellaneousIssueLines = pageInstance._miscellaneousIssueLines ?? null;
    const savedInputs = _getSavedInputs(pageInstance);
    savedInputs.miscellaneousIssue.miscellaneousIssueLines = miscellaneousIssueLines;
    savedInputs.currentLine = pageInstance._currentLine;
    savedInputs.currentDetail = pageInstance._currentDetail;
    pageInstance.$.storage.set('mobile-miscellaneousIssue', JSON.stringify(savedInputs));
}

export function _calculateEndingSerialNumber(startingSerialNumber: string, quantity: number): string {
    return startingSerialNumber.replace(/\d+$/, match => {
        const endingNumber = (Number(match) + quantity - 1).toString();
        const lengthDiff = Math.max(endingNumber.length - match.length, 0);
        return endingNumber.padStart(match.length + lengthDiff, '0');
    });
}

export function _nextSerialNumber(currentSerialNumber: string): string {
    return currentSerialNumber.replace(/\d+$/, match => {
        const nextSerialNumber = (Number(match) + 1).toString();
        const lengthDiff = Math.max(nextSerialNumber.length - match.length, 0);
        return nextSerialNumber.padStart(match.length + lengthDiff, '0');
    });
}

export function _calculateLineQuantity(
    line: Partial<MiscellaneousIssueLineInput>,
    pageInstance: PageMiscellaneousIssueDetail,
) {
    line.quantityInPackingUnit = 0;
    line.quantityInStockUnit = 0;
    line.stockDetails?.forEach(detail => {
        // line.quantityInPackingUnit =
        //     Number(line.quantityInPackingUnit) + Number((detail as StockJournalInput).quantityInPackingUnit);
        line.quantityInStockUnit =
            Number(line.quantityInStockUnit) + Number((detail as StockJournalInput).quantityInStockUnit);
        line.quantityInPackingUnit =
            line.quantityInStockUnit /
            (pageInstance.packingUnitToStockUnitConversionFactorToIssue.value
                ? pageInstance.packingUnitToStockUnitConversionFactorToIssue.value
                : 1);
    });
    line.packingUnit = String(pageInstance.packingUnitToIssue.value);
}

export async function _fieldsManagement(pageInstance: PageMiscellaneousIssueDetail) {
    _lotManagement(pageInstance);
    await _miscellaneousFieldsManagement(pageInstance);
    _initPackingUnitFields(pageInstance);
    _serialNumberManagement(pageInstance);
}

export async function _onChangeBody(pageInstance: PageMiscellaneousIssueDetail) {
    const currentRecord = pageInstance.gridBlock.selectedRecordId
        ? pageInstance.stock.getRecordValue(pageInstance.gridBlock.selectedRecordId)
        : null;
    if (!currentRecord) {
        return;
    }

    const currentQty = Number(pageInstance.quantityToMove.value) * (Number(pageInstance.packingUnitToStockUnitConversionFactorToIssue.value));
    if (!currentQty || !pageInstance.startingSerialNumber.value || !pageInstance.startingSerialNumber.value.code) {
        pageInstance.endingSerialNumber.value = null;
        return;
    }

    pageInstance.startingSerialNumber.value.code = pageInstance.startingSerialNumber.value.code.toUpperCase();
    if (currentQty > 1) {
        pageInstance.endingSerialNumber.value = _calculateEndingSerialNumber(
            pageInstance.startingSerialNumber.value.code,
            currentQty,
        );
    } else {
        pageInstance.endingSerialNumber.value = pageInstance.startingSerialNumber.value.code;
    }
    if (currentQty > (currentRecord as any).quantityInPackingUnitOrigin) pageInstance.addSerialRange.isHidden = true;
    else {
        pageInstance.addSerialRange.isHidden = false;
    }
    // validate range does not contain existing or non-existent serial numbers
    await pageInstance.$.commitValueAndPropertyChanges();
    const validationResult = await pageInstance.endingSerialNumber.validate();
    if (validationResult) {
        pageInstance.$.showToast(validationResult, { type: 'warning' });
    }
}

export function _lotManagement(pageInstance: PageMiscellaneousIssueDetail) {
    pageInstance.lot.isHidden = pageInstance._productSite.product.lotManagementMode === 'notManaged';
    pageInstance.sublot.isHidden = pageInstance._productSite.product.lotManagementMode !== 'lotAndSublot';
}

export function _initPackingUnitFields(pageInstance: PageMiscellaneousIssueDetail) {
    const productPackingList = extractEdges(pageInstance._productSite.product.packingUnits.query).filter(
        productPacking => {
            return !!productPacking.packingUnit?.code;
        },
    );
    pageInstance._packingUnits = productPackingList.map(productPacking => {
        return { node: productPacking };
    });

    const productPakingUnitSelectValues = productPackingList.map(productPacking => {
        return `${productPacking.packingUnit.code}`;
    });

    pageInstance.packingUnit.options = [
        pageInstance._productSite.product.stockUnit.code,
        ...productPakingUnitSelectValues,
    ];
}

export async function _miscellaneousFieldsManagement(pageInstance: PageMiscellaneousIssueDetail) {
    if (
        !(pageInstance.lot.isHidden || !!pageInstance._productSite.product.lotSequenceNumber) &&
        ['lotAndSublot', 'mandatoryLot'].includes(pageInstance._productSite.product.lotManagementMode)
    )
        pageInstance.lot.isMandatory = true;
    const transaction = _getSavedInputs(pageInstance).selectedTransaction;
    if (transaction.isStatusChange === true) pageInstance.status.isMandatory = true;

    pageInstance._selectedStockManagementRules = await findStockManagementRules(
        pageInstance._stockSite.code,
        pageInstance._productSite.product.productCategory.code,
        '26',
        transaction.stockMovementCode?.code ?? null,
        pageInstance,
    );
    pageInstance.status.options = await _getStockStatus(pageInstance);
}

export function _serialNumberManagement(pageInstance: PageMiscellaneousIssueDetail) {
    pageInstance.serialNumber.isHidden = ['notManaged', 'issued'].includes(
        pageInstance._productSite.product.serialNumberManagementMode,
    );
    if (
        ['receivedIssued', 'globalReceivedIssued'].includes(
            pageInstance._productSite.product.serialNumberManagementMode,
        )
    ) {
        pageInstance.serialNumber.isMandatory = true;
        if (pageInstance.lot.isHidden === false) pageInstance.lot.isMandatory = false;
        if (pageInstance.sublot.isHidden === false) pageInstance.sublot.isMandatory = false;
        if (pageInstance.status.isHidden === false) pageInstance.status.isMandatory = false;
        if (pageInstance.packingUnit.isHidden === false) pageInstance.packingUnit.isMandatory = false;
    }
}

export function _saveDetail(pageInstance: PageMiscellaneousIssueDetail) {
    const currentmiscellaneousIssueLines = pageInstance._miscellaneousIssueLines[pageInstance._currentLine];
    pageInstance._miscellaneousIssueLines[pageInstance._currentLine] = {
        ...currentmiscellaneousIssueLines,
    };
    _saveMiscellaneousIssue(pageInstance);
}

export function _getQuantityInPackingUnitOrigin(
    pageInstance: PageMiscellaneousIssueDetail,
    record: Partial<Stock>,
): number {
    if ((record as any).quantityInPackingUnitOrigin) {
        return (record as any).quantityInPackingUnitOrigin;
    } else {
        let miscellaneousIssueLines = pageInstance._miscellaneousIssueLines;
        if (miscellaneousIssueLines === undefined) {
            miscellaneousIssueLines = _getSavedInputs(pageInstance).miscellaneousIssue.miscellaneousIssueLines ?? [];
        }
        let _quantityInPackingUnitOrigin: number;
        _quantityInPackingUnitOrigin = Number(record.quantityInPackingUnit);
        miscellaneousIssueLines.forEach(line => {
            if (_isLineToRecord(pageInstance, record, line) && line.lineNumber !== pageInstance._currentOperation) {
                line.stockDetails?.forEach(detail => {
                    if (_isStockJournalToRecord(pageInstance, record, detail as StockJournalInput)) {
                        _quantityInPackingUnitOrigin =
                            Number(_quantityInPackingUnitOrigin) -
                            Number((detail as StockJournalInput).quantityInPackingUnit);
                    }
                });
            }
        });
        return _quantityInPackingUnitOrigin;
    }
}

export function _getquantityInPackingUnitRest(
    pageInstance: PageMiscellaneousIssueDetail,
    record: Partial<Stock>,
): number {
    let miscellaneousIssueLines = pageInstance._miscellaneousIssueLines;
    if (miscellaneousIssueLines === undefined) {
        miscellaneousIssueLines = _getSavedInputs(pageInstance).miscellaneousIssue.miscellaneousIssueLines ?? [];
    }
    if (pageInstance._serialNumberManagementMode === undefined) {
        pageInstance._serialNumberManagementMode =
            _getSavedInputs(pageInstance).selectedProduct?.serialNumberManagementMode;
    }
    let _quantityInPackingUnitRest: number = _getQuantityInPackingUnitOrigin(pageInstance, record);
    if (pageInstance._serialNumberManagementMode === 'globalReceivedIssued') {
        pageInstance._miscellaneousIssueLines?.forEach(line => {
            if (_isLineToRecord(pageInstance, record, line) && line.lineNumber === pageInstance._currentOperation) {
                line.stockDetails?.forEach(detail => {
                    if (_isStockJournalToRecord(pageInstance, record, detail)) {
                        _quantityInPackingUnitRest =
                            Number(_quantityInPackingUnitRest) - Number(detail.quantityInPackingUnit);
                    }
                });
            }
        });
    }
    return _quantityInPackingUnitRest;
}

export function _getMiscellaneousIssueLineStockDetail(
    pageInstance: PageMiscellaneousIssueDetail,
    record: Partial<Stock>,
): Partial<StockJournalInput> | undefined {
    let miscellaneousIssueLines = pageInstance._miscellaneousIssueLines;
    if (miscellaneousIssueLines === undefined) {
        miscellaneousIssueLines = _getSavedInputs(pageInstance).miscellaneousIssue.miscellaneousIssueLines ?? [];
    }
    const _line = miscellaneousIssueLines.find(
        line => _isLineToRecord(pageInstance, record, line) && line.lineNumber === pageInstance._currentOperation,
    );
    if (_line) {
        return _line.stockDetails?.find(detail =>
            _isStockJournalToRecord(pageInstance, record, detail as StockJournalInput),
        );
    } else {
        return undefined;
    }
}

export function _getQuantityToMove(pageInstance: PageMiscellaneousIssueDetail, record: Partial<Stock>): number {
    const line = _getMiscellaneousIssueLineStockDetail(pageInstance, record);
    let _quantityToMove: number;
    if (line) {
        _quantityToMove = Number(line.quantityInPackingUnit);
    } else {
        _quantityToMove = Number(record.quantityInPackingUnit);
    }
    const _quantityInPackingUnitRest = _getquantityInPackingUnitRest(pageInstance, record);
    if (Number(_quantityToMove) > Number(_quantityInPackingUnitRest)) {
        _quantityToMove = Number(_quantityInPackingUnitRest);
    }
    return _quantityToMove;
}

export async function _getStockStatus(pageInstance: PageMiscellaneousIssueDetail): Promise<string[]> {
    const selectedStatus: { _regex: string }[] = [];
    pageInstance._selectedStockManagementRules.authorizedSubstatus.split(',').forEach(function (status) {
        selectedStatus.push({ _regex: getRegExp(status).source });
    });
    const response = await pageInstance.$.graph
        .node('@sage/x3-stock-data/StockStatus')
        .query(
            ui.queryUtils.edgesSelector(
                {
                    _id: true,
                    code: true,
                },
                {
                    filter: {
                        code: { _or: selectedStatus },
                    },
                },
            ),
        )
        .execute();

    if (!response.edges || response.edges.length === 0) {
        throw new Error(
            ui.localize(
                '@sage/x3-stock/pages__stock_change_details__notification__invalid_stock_status_error',
                'No stock status',
            ),
        );
    }
    return response.edges.map((stockStatus: any) => stockStatus.node.code);
}

export async function savedOriginalStockLines(pageInstance: ui.Page) {
    const page = pageInstance as any;
    const _stockQueryResult: ExtractEdges<Stock>[] = await getStockResults(page, page.stock.filter);
    page._originalStockLines = [{} as originalStockLine];
    _stockQueryResult?.forEach((line:ExtractEdges<Stock>) => {
        if (page._originalStockLines.findIndex((element:originalStockLine) => element.id === line._id)<0) {
            page._originalStockLines.push({
                id: line._id ?? '',
                stockId: line.stockId ?? '',
                packingUnit: line.packingUnit,
                packingUnitToStockUnitConversionFactor: Number(line.packingUnitToStockUnitConversionFactor),
                quantityInStockUnit: Number(line.quantityInStockUnit),
                quantityInPackingUnit: Number(line.quantityInPackingUnit),
            });
        }

    });
    page._originalStockLines.splice(0,1);
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
