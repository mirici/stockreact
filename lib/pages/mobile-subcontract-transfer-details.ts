import { Product, ProductSite, SerialNumberManagement, UnitOfMeasure } from '@sage/x3-master-data-api';
import { dialogMessage } from '@sage/x3-master-data/lib/client-functions/dialogs';
import { GraphApi, StockChangeLineInput } from '@sage/x3-stock-api';
import {
    LicensePlateNumber,
    Location,
    Lot,
    LotsSites,
    SerialNumber,
    Stock,
    StockManagementRules,
    StockSearchFilter,
    StockStatus,
} from '@sage/x3-stock-data-api';
import { getCountSerialNumber } from '@sage/x3-stock-data/lib/client-functions/get-count-serial-number';
import { Site } from '@sage/x3-system-api';
import { getRegExp } from '@sage/x3-system/lib/shared-functions/pat-converter';
import { Dict, extractEdges } from '@sage/xtrem-client';
import * as ui from '@sage/xtrem-ui';
import {
    generateStockTableFilter,
    handleFilterOnChange,
    managePages,
    removeFilters,
} from '../client-functions/manage-pages';
import { findStockManagementRules } from '../client-functions/stock-management-rules';
import { inputsSubcontractTransfer } from './mobile-subcontract-transfer';

type DeepPartial<T> = T extends Object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;
type PartialLocation = DeepPartial<Location>;

const hideWhenEmptyValue = (value: any, rowValue?: Dict<Stock>) => {
    return typeof value !== 'number' && !value; // we don't want to hide numeric field with value of 0
};
type packingUnit = {
    node: {
        packingUnit: {
            code: string;
            numberOfDecimals: number;
        };
        packingUnitToStockUnitConversionFactor: string;
        isPackingFactorEntryAllowed: boolean;
    };
};

/** Created with X3 Etna Studio at 2020-01-20T10:46:11.764Z */
@ui.decorators.page<MobileSubcontractTransferDetails>({
    title: 'Subcontracting',
    subtitle: 'Enter stock details',
    mode: 'default',
    node: '@sage/x3-master-data/ProductSite',
    isTitleHidden: true,
    isTransient: false,
    navigationPanel: undefined,
    headerCard() {
        return {
            title: this.product,
            line2: this.localizedDescription,
        };
    },
    businessActions() {
        return [this.nextButton];
    },
    async onLoad() {
        if (!this._getSavedInputs()?.selectedProduct) {
            return;
        }
        this._stockSite = JSON.parse(this.$.queryParameters.stockSite as string);
        const _savedInputs = this._getSavedInputs();

        this._stockChangeLines = _savedInputs?.subcontractTransfer.stockChangeLines ?? [];
        this._currentLine = _savedInputs?.currentLine ?? 0;
        this._currentOperation = _savedInputs?.currentOperation ?? 0;
        this._serialNumberManagementMode = _savedInputs?.selectedProduct?.serialNumberManagementMode;
        await this._init();

        if (this._productSite.product.serialNumberManagementMode !== 'globalReceivedIssued') {
            this.addSerialRange.isHidden = true;
            this.serialNumberBlock.isHidden = true;
            this.listSerialNumberBlock.isHidden = true;
            this.serialNumberLines.isTitleHidden = true;
            this.listSerialNumberBlock.isHidden = true;
        }
        this.serialNumberLines.title = 'Serial number(s) to move    ';

        managePages(
            this,
            this._stockSite.code,
            { ...this.$.values, product: { ...this.product.value } },
            '3',
            ui.localize(
                '@sage/x3-stock/pages__mobile-settings__mandatory-settings-missing',
                'Mandatory settings missing.',
            ),
            this._stockFieldSettings,
        );

        await this.stock.refresh();
    },
    detailPanel() {
        return {
            isCloseButtonHidden: true,
            isTitleHidden: true,
            isHidden: true,
            isTransient: true,
            header: this.detailPanelSection,
            sections: [],
            footerActions: [this.helperCancelButton, this.helperSelectButton],
        };
    },
})
export class MobileSubcontractTransferDetails extends ui.Page<GraphApi> {
    /*
     *
     *  Technical properties
     *
     */

    _packingUnits: packingUnit[];
    private _productSite: ProductSite;
    private _currentLine = 0;
    private _currentOperation: number;
    private _stockChangeLines: Partial<StockChangeLineInput>[];
    private _stockFieldSettings: StockSearchFilter[] = [];
    private _stockSite: Site;
    private _serialNumberManagementMode: SerialNumberManagement | undefined;
    private _selectedStockManagementRules: StockManagementRules;

    /*
     *
     *  Technical fields
     *
     */

    @ui.decorators.referenceField<MobileSubcontractTransferDetails, Product>({
        node: '@sage/x3-master-data/Product',
        valueField: 'code',
        isTransient: false,
        isTitleHidden: true,
        isDisabled: true,
        canFilter: false,
        columns: [
            ui.nestedFields.select({
                bind: 'lotManagementMode',
                optionType: '@sage/x3-master-data/LotManagementMode',
                isHidden: true,
            }),
            ui.nestedFields.select({
                bind: 'serialNumberManagementMode',
                optionType: '@sage/x3-master-data/SerialNumberManagement',
                isHidden: true,
            }),
            ui.nestedFields.select({
                bind: 'expirationManagementMode',
                optionType: '@sage/x3-master-data/ExpirationManagement',
                isHidden: true,
            }),
            ui.nestedFields.select({
                bind: 'stockVersionMode',
                optionType: '@sage/x3-master-data/StockVersionMode',
                isHidden: true,
            }),
            ui.nestedFields.reference<MobileSubcontractTransferDetails, Product, UnitOfMeasure>({
                node: '@sage/x3-master-data/UnitOfMeasure',
                bind: 'stockUnit',
                valueField: 'code',
                isHidden: true,
            }),
            ui.nestedFields.reference<MobileSubcontractTransferDetails, Product, UnitOfMeasure>({
                node: '@sage/x3-master-data/UnitOfMeasure',
                bind: 'stockUnit',
                valueField: 'numberOfDecimals',
                isHidden: true,
            }),
        ],
    })
    product: ui.fields.Reference<Product>;

    @ui.decorators.checkboxField<MobileSubcontractTransferDetails>({
        bind: 'isLocationManaged',
        isTransient: false,
        isHidden: true,
    })
    isLocationManaged: ui.fields.Checkbox;

    @ui.decorators.checkboxField<MobileSubcontractTransferDetails>({
        bind: 'isLicensePlateNumberManaged',
        isTransient: false,
        isHidden: true,
    })
    isLicensePlateNumberManaged: ui.fields.Checkbox;

    @ui.decorators.textField<MobileSubcontractTransferDetails>({
        isDisabled: true,
        isTransient: true,
        size: 'small',
    })
    localizedDescription: ui.fields.Text;

    @ui.decorators.textField<MobileSubcontractTransferDetails>({
        isDisabled: true,
        isTransient: true,
        prefix: 'Site ',
    })
    site: ui.fields.Text;

    /*
     *
     *  Page Actions
     *
     */

    @ui.decorators.pageAction<MobileSubcontractTransferDetails>({
        title: 'Next',
        shortcut: ['f2'],
        buttonType: 'primary',
        async onClick() {
            if (this.stock.selectedRecords.length > 0) {
                removeFilters(this);
                this.stock.filter = {
                    ...this.stock.filter,
                    lot: undefined,
                    sublot: undefined,
                    serialNumber: undefined,
                    status: undefined,
                    packingUnit: undefined,
                    packingUnitToStockUnitConversionFactor: undefined,
                    identifier1: undefined,
                    identifier2: undefined,
                    stockCustomField1: undefined,
                    stockCustomField2: undefined,
                };

                await this.stock.refresh();
                await this.$.commitValueAndPropertyChanges();
                this.$.setPageClean();
                const savedInputs = this._getSavedInputs();
                savedInputs.currentLine = this._currentLine;
                this.$.storage.set('mobile-subcontractTransfer', JSON.stringify(savedInputs));
                this.$.router.goTo('@sage/x3-stock/MobileSubcontractTransfer', { ReturnFromDetail: 'yes' });
            } else {
                await dialogMessage(
                    this,
                    'error',
                    ui.localize('@sage/x3-stock/pages__mobile_subcontract_transfer_lines__mobile_stock_error', 'Error'),
                    ui.localize(
                        '@sage/x3-stock/pages__mobile_subcontract_transfer_lines__notification__no_stock_error',
                        `Select at least one stock line.`,
                    ),
                );
            }
        },
    })
    nextButton: ui.PageAction;

    @ui.decorators.pageAction<MobileSubcontractTransferDetails>({
        title: 'Cancel',
        buttonType: 'secondary',
        async onClick() {
            const recordId = this.gridBlock?.selectedRecordId ?? '';
            if (recordId) {
                const currentRecord = this.stock.getRecordValue(recordId);
                if (currentRecord) {
                    let i: number = 0;
                    while (i < this._stockChangeLines.length) {
                        if (
                            Number(this._stockChangeLines[i].stockId) === Number(currentRecord.stockId) &&
                            Number(this._stockChangeLines[i].lineNumber) === Number(this._currentOperation)
                        ) {
                            this._stockChangeLines.splice(i, 1);
                        } else {
                            i += 1;
                        }
                    }
                    this._saveStockChange();
                    (currentRecord as any).quantityToMove = (currentRecord as any).quantityInPackingUnitOrigin;
                    (currentRecord as any).quantityInPackingUnitRest = (
                        currentRecord as any
                    ).quantityInPackingUnitOrigin;
                    this.quantityToMove.value = Number((currentRecord as any).quantityToMove);
                    (currentRecord as any).quantityInPackingUnitDestination = (
                        currentRecord as any
                    ).quantityInPackingUnitOrigin;
                    this.stock.unselectRecord(recordId);
                    this.stock.setRecordValue(currentRecord);

                    (this.$.detailPanel as any).isHidden = true;
                    this.nextButton.isHidden = false;
                }
            }
        },
    })
    helperCancelButton: ui.PageAction;

    @ui.decorators.pageAction<MobileSubcontractTransferDetails>({
        title: 'Select',
        buttonType: 'primary',
        onError(error) {
            switch (error.message) {
                case '@sage/x3-stock/pages__mobile_subcontract_transfer_lines__notification__error_startingSerialNumberMandatory': {
                    return ui.localize(
                        '@sage/x3-stock/pages__mobile_subcontract_transfer_lines__notification__error_startingSerialNumberMandatory',
                        'You need to select the serial number and add it first.',
                    );
                }
                default: {
                    return error;
                }
            }
        },
        async onClick() {
            await this.$.commitValueAndPropertyChanges();

            const errors: ui.ValidationResult[] = await this.stock.validateWithDetails();
            if (errors.length === 0) {
                const _recordId = this.gridBlock?.selectedRecordId;
                let _currentRecord = this.stock.getRecordValue(_recordId ?? '');
                if (this._productSite.product.serialNumberManagementMode === 'globalReceivedIssued') {
                    if (this.serialNumberLines.value.length === 0) {
                        throw new Error(
                            '@sage/x3-stock/pages__mobile_subcontract_transfer_lines__notification__error_startingSerialNumberMandatory',
                        );
                    }
                } else {
                    if (!this.quantityToMove.value || this.quantityToMove.value <= 0) {
                        await dialogMessage(
                            this,
                            'error',
                            ui.localize(
                                '@sage/x3-stock/pages__mobile_subcontract_transfer_lines__mobile_stock_error',
                                'Error',
                            ),
                            ui.localize(
                                '@sage/x3-stock/pages__mobile_subcontract_transfer_lines__quantityInPackingUnitDestination_must_be_greater_than_0',
                                'The quantity to move must be greater than 0',
                            ),
                        );
                        return;
                    }
                }
                if (Number(this.quantityToMove.value) > Number((_currentRecord as any).quantityInPackingUnitRest)) {
                    await dialogMessage(
                        this,
                        'error',
                        ui.localize(
                            '@sage/x3-stock/pages__mobile_subcontract_transfer_lines__mobile_stock_error',
                            'Error',
                        ),
                        `${ui.localize(
                            '@sage/x3-stock/pages__mobile_stock_change_lines__enter_a_quantity_less_than_or_equal_to_the_stock_quantity',
                            'Enter a quantity less than or equal to the stock quantity.',
                        )}`,
                    );
                    return;
                }
                if (_currentRecord?.qualityAnalysisRequestId) {
                    await dialogMessage(
                        this,
                        'error',
                        ui.localize(
                            '@sage/x3-stock/pages__mobile_subcontract_transfer_lines__mobile_stock_error',
                            'Error',
                        ),
                        ui.localize(
                            '@sage/x3-stock/pages__mobile_subcontract_transfer_lines__subcontrat_transfer_is_impossible_on_a_line_in_quality_control',
                            'Subcontract transfer is impossible on a line in quality control.',
                        ),
                    );
                    this.$.setPageClean();
                    return;
                }

                if (_recordId && _currentRecord) {
                    this.stock.selectRecord(_recordId);
                    const _savedInputs = this._getSavedInputs();
                    const _subcontractLocation = _savedInputs.subcontractTransfer.subcontractLocation ?? undefined;
                    const lineIndex = this._stockChangeLines.findIndex(
                        line =>
                            Number(line.stockId) === Number((_currentRecord as any).stockId) &&
                            line.lineNumber === this._currentOperation,
                    );
                    if (this._productSite.product.serialNumberManagementMode !== 'globalReceivedIssued') {
                        if (lineIndex > -1) {
                            this._stockChangeLines[lineIndex].packingUnitDestination = this.packingUnitDestination.value
                                ? this.packingUnitDestination.value
                                : this._stockChangeLines[lineIndex].packingUnit;
                            this._stockChangeLines[lineIndex].packingUnitToStockUnitConversionFactorDestination = this
                                .packingUnitToStockUnitConversionFactorDestination.value
                                ? Number(this.packingUnitToStockUnitConversionFactorDestination.value)
                                : this._stockChangeLines[lineIndex].packingUnitToStockUnitConversionFactor;
                            const _stockDetails = this._stockChangeLines[lineIndex]?.stockDetails;
                            if (_stockDetails) {
                                const _stockJournal = _stockDetails[0];
                                if (this.packingUnitDestination.value) {
                                    _stockJournal.packingUnit = this.packingUnitDestination.value;
                                } else {
                                    _stockJournal.packingUnit = _currentRecord?.packingUnit?.code;
                                }
                                _stockJournal.packingUnitToStockUnitConversionFactor = Number(
                                    this.packingUnitToStockUnitConversionFactorDestination.value,
                                );
                                _stockJournal.quantityInPackingUnit =
                                    (Number(this.quantityToMove.value) *
                                        Number(
                                            this._stockChangeLines[lineIndex].packingUnitToStockUnitConversionFactor,
                                        )) /
                                    Number(this.packingUnitToStockUnitConversionFactorDestination.value);
                                _stockJournal.quantityInStockUnit =
                                    Number(this.quantityToMove.value) *
                                    Number(this._stockChangeLines[lineIndex].packingUnitToStockUnitConversionFactor);
                                _stockJournal.location = _subcontractLocation;
                                if (this.statusDestination.value) {
                                    _stockJournal.status = this.statusDestination.value;
                                } else {
                                    _stockJournal.status = _currentRecord.status?.code;
                                }
                                _stockJournal.identifier1 = _currentRecord?.identifier1;
                                _stockJournal.identifier2 = _currentRecord?.identifier2;
                            }
                        } else {
                            this._stockChangeLines[this._currentLine] = {
                                product: this.product.value?.code,
                                stockId: String(_currentRecord.stockId),
                                productDescription: this.product.value?.description1,
                                quantityInPackingUnit: Number(this.quantityToMove.value),
                                packingUnitToStockUnitConversionFactor:
                                    _currentRecord.packingUnitToStockUnitConversionFactor,
                                serialNumber: _currentRecord.serialNumber,
                                lineNumber: this._currentOperation,
                                packingUnitDestination: this.packingUnitDestination.value
                                    ? this.packingUnitDestination.value
                                    : _currentRecord.packingUnit?.code,
                                stockDetails: [
                                    {
                                        packingUnit: this.packingUnitDestination.value
                                            ? this.packingUnitDestination.value
                                            : _currentRecord.packingUnit?.code,
                                        packingUnitToStockUnitConversionFactor: Number(
                                            this.packingUnitToStockUnitConversionFactorDestination.value,
                                        ),
                                        quantityInPackingUnit:
                                            (Number(this.quantityToMove.value) *
                                                Number(_currentRecord.packingUnitToStockUnitConversionFactor)) /
                                            Number(this.packingUnitToStockUnitConversionFactorDestination.value),
                                        quantityInStockUnit:
                                            Number(this.quantityToMove.value) *
                                            Number(_currentRecord.packingUnitToStockUnitConversionFactor),
                                        location: _subcontractLocation,
                                        status: this.statusDestination.value
                                            ? this.statusDestination.value
                                            : _currentRecord.status?.code,
                                        serialNumber: _currentRecord.serialNumber ?? undefined,
                                        identifier1: _currentRecord.identifier1 ?? undefined,
                                        identifier2: _currentRecord.identifier2 ?? undefined,
                                    },
                                ],
                            };
                        }
                    }

                    let qtyTotal = 0;
                    this._stockChangeLines.forEach(line => {
                        if (
                            Number(line.stockId) === Number(_currentRecord?.stockId) &&
                            line.lineNumber === this._currentOperation
                        ) {
                            line.stockDetails?.forEach(stockLine => {
                                qtyTotal =
                                    qtyTotal +
                                    (Number(Number(stockLine.quantityInPackingUnit)) *
                                        Number(stockLine.packingUnitToStockUnitConversionFactor)) /
                                        Number(line.packingUnitToStockUnitConversionFactor);
                            });
                        }
                    });

                    this._stockChangeLines[lineIndex].quantityInPackingUnitDestination =
                        (Number(qtyTotal) *
                            Number(this._stockChangeLines[lineIndex].packingUnitToStockUnitConversionFactor)) /
                        Number(this.packingUnitToStockUnitConversionFactorDestination.value);
                    this._stockChangeLines[lineIndex].quantityInPackingUnit = Number(qtyTotal);
                    this._stockChangeLines[lineIndex].quantityInStockUnitDestination =
                        Number(qtyTotal) *
                        Number(this._stockChangeLines[lineIndex].packingUnitToStockUnitConversionFactor);

                    this._saveDetail();

                    (_currentRecord as any).quantityToMove = qtyTotal;
                    (_currentRecord as any).quantityInStockUnitDestination =
                        qtyTotal * Number(_currentRecord.packingUnitToStockUnitConversionFactor);
                    (_currentRecord as any).statusDestination = this.statusDestination.value
                        ? this.statusDestination.value
                        : _currentRecord?.status;
                    (_currentRecord as any).packingUnitDestination =
                        this.packingUnitDestination.value !== '' ? { code: this.packingUnitDestination.value } : null;
                    (_currentRecord as any).packingUnitToStockUnitConversionFactorDestination =
                        this.packingUnitToStockUnitConversionFactorDestination.value;
                    this.stock.setRecordValue(_currentRecord);
                }
            }

            (this.$.detailPanel as any).isHidden = true;
            this.nextButton.isHidden = false;
        },
    })
    helperSelectButton: ui.PageAction;

    @ui.decorators.pageAction<MobileSubcontractTransferDetails>({
        icon: 'add',
        title: 'Add...',
        onError(error) {
            switch (error.message) {
                case '@sage/x3-stock/pages__mobile_subcontract_transfer_lines__notification__error_startingSerialNumber': {
                    return ui.localize(
                        '@sage/x3-stock/pages__mobile_subcontract_transfer_lines__notification__error_startingSerialNumber',
                        'The serial number is mandatory',
                    );
                }
                case '@sage/x3-stock/serial-number-range-overlap': {
                    return ui.localize(
                        '@sage/x3-stock/serial-number-range-overlap',
                        'The serial numbers are overlapping. Enter another starting or ending serial number.',
                    );
                }
                case '@sage/x3-stock/pages__mobile_subcontract_transfer__same-amount-serial-numbers-in-the-range-to-match-quantity-to-move': {
                    return ui.localize(
                        '@sage/x3-stock/pages__mobile_subcontract_transfer__same-amount-serial-numbers-in-the-range-to-match-quantity-to-move',
                        'Select the same amount of serial numbers in the range to match the quantity to move.',
                    );
                }
                case '@sage/x3-stock/serial-number-not-sequential': {
                    return ui.localize(
                        '@sage/x3-stock/serial-number-not-sequential',
                        'The serial numbers are not sequential. Check your entry.',
                    );
                }
                default: {
                    return error;
                }
            }
        },
        buttonType: 'secondary',
        async onClick() {
            if (!this.startingSerialNumber.value) {
                throw new Error(
                    '@sage/x3-stock/pages__mobile_subcontract_transfer_lines__notification__error_startingSerialNumber',
                );
            }
            // check that this will add any duplicates
            const startNumberToAdd = this.startingSerialNumber?.value?.code?.match(/\d+$/);
            const endNumberToAdd = Number(this.endingSerialNumber?.value?.match(/\d+$/));
            let serialNumberAlreadyUsed: boolean = false;
            if (
                this.serialNumberLines.value.some(row => {
                    const rowStartMatch = row.startingSerialNumber.match(/\d+$/);
                    const rowEndMatch = Number(row.endingSerialNumber.match(/\d+$/));

                    // check if the 'beginning part' of the serial matches
                    if (
                        !startNumberToAdd ||
                        row.startingSerialNumber.substring(
                            0,
                            row.startingSerialNumber.length - rowStartMatch.toString().length,
                        ) !==
                            this.startingSerialNumber?.value?.code?.substring(
                                0,
                                this.startingSerialNumber.value.code.length - startNumberToAdd.toString().length,
                            )
                    )
                        return false;

                    return Number(startNumberToAdd) <= rowEndMatch && endNumberToAdd >= Number(rowStartMatch);
                })
            ) {
                serialNumberAlreadyUsed = true;
            }
            this._stockChangeLines.forEach(line => {
                if (line.product === this.product?.value?.code && line.serialNumber) {
                    const startingSerialNumber = Number(line.serialNumber.match(/\d+$/));
                    const endingSerialNumber = Number(
                        this._calculateEndingSerialNumber(
                            line.serialNumber,
                            Number(line.quantityInPackingUnitDestination),
                        ).match(/\d+$/),
                    );
                    if (
                        Number(startNumberToAdd) <= endingSerialNumber &&
                        Number(endNumberToAdd) >= startingSerialNumber
                    ) {
                        serialNumberAlreadyUsed = true;
                    }
                }
            });
            if (serialNumberAlreadyUsed) {
                throw new Error('@sage/x3-stock/serial-number-range-overlap');
            }
            if (
                this.endingSerialNumber.value !=
                this._calculateEndingSerialNumber(
                    this.startingSerialNumber?.value?.code ?? '',
                    Number(this.quantityToMove.value),
                )
            ) {
                throw new Error(
                    '@sage/x3-stock/pages__mobile_subcontract_transfer__same-amount-serial-numbers-in-the-range-to-match-quantity-to-move',
                );
            }
            if (
                (await getCountSerialNumber(
                    this,
                    this.product.value?.code ?? '',
                    this._stockSite.code,
                    this._stockId.value ?? '',
                    this.startingSerialNumber.value?.code ?? '',
                    this.endingSerialNumber.value ?? '',
                    '',
                )) !== Number(this.quantityToMove.value)
            ) {
                throw new Error('@sage/x3-stock/serial-number-not-sequential');
            }
            const _savedInputs = this._getSavedInputs();
            const _subcontractLocation = _savedInputs.subcontractTransfer.subcontractLocation ?? undefined;
            const _currentRecord = this.stock.getRecordValue(this.gridBlock?.selectedRecordId ?? '');
            if (_currentRecord) {
                this.serialNumberLines.addRecord({
                    quantity: this.quantityToMove.value,
                    startingSerialNumber: this.startingSerialNumber.value.code,
                    endingSerialNumber: this.endingSerialNumber.value,
                });

                const lineIndex = this._stockChangeLines.findIndex(
                    line =>
                        Number(line?.stockId) === Number(_currentRecord.stockId) &&
                        line.lineNumber === this._currentOperation,
                );
                if (lineIndex > -1) {
                    this._currentLine = lineIndex;
                    this._stockChangeLines[this._currentLine] = {
                        ...this._stockChangeLines[this._currentLine],
                        packingUnitDestination: this.packingUnitDestination.value
                            ? this.packingUnitDestination.value
                            : _currentRecord.packingUnit?.code,
                        quantityInPackingUnitDestination: 0,
                        packingUnitToStockUnitConversionFactorDestination: 0,
                    };
                    this._stockChangeLines[this._currentLine].stockDetails?.push({
                        packingUnit: this.packingUnitDestination.value
                            ? this.packingUnitDestination.value
                            : _currentRecord.packingUnit?.code,
                        packingUnitToStockUnitConversionFactor: Number(
                            this.packingUnitToStockUnitConversionFactorDestination.value,
                        ),
                        quantityInPackingUnit: Number(
                            (Number(this.quantityToMove.value) *
                                Number(_currentRecord.packingUnitToStockUnitConversionFactor)) /
                                Number(this.packingUnitToStockUnitConversionFactorDestination.value),
                        ),
                        quantityInStockUnit:
                            Number(this.quantityToMove.value) *
                            Number(_currentRecord.packingUnitToStockUnitConversionFactor),
                        location: _subcontractLocation,
                        status: this.statusDestination.value
                            ? this.statusDestination.value
                            : _currentRecord.status?.code,
                        serialNumber: this.startingSerialNumber.value.code,
                        endingSerialNumber: this.endingSerialNumber.value,
                        identifier1: _currentRecord.identifier1 ?? undefined,
                        identifier2: _currentRecord.identifier2 ?? undefined,
                    });
                } else {
                    this._stockChangeLines.push({
                        product: this.product?.value?.code,
                        stockId: String(_currentRecord.stockId),
                        productDescription: this.product?.value?.description1,
                        quantityInPackingUnit: Number(this.quantityToMove.value),
                        packingUnitToStockUnitConversionFactor: _currentRecord.packingUnitToStockUnitConversionFactor,
                        lineNumber: this._currentOperation,
                        packingUnitDestination: this.packingUnitDestination.value
                            ? this.packingUnitDestination.value
                            : _currentRecord.packingUnit?.code,
                        quantityInPackingUnitDestination: 0,
                        packingUnitToStockUnitConversionFactorDestination: 0,
                        stockDetails: [
                            {
                                packingUnit: this.packingUnitDestination.value
                                    ? this.packingUnitDestination.value
                                    : _currentRecord.packingUnit?.code,
                                packingUnitToStockUnitConversionFactor: Number(
                                    this.packingUnitToStockUnitConversionFactorDestination.value,
                                ),
                                quantityInPackingUnit: Number(
                                    (Number(this.quantityToMove.value) *
                                        Number(_currentRecord.packingUnitToStockUnitConversionFactor)) /
                                        Number(this.packingUnitToStockUnitConversionFactorDestination.value),
                                ),
                                quantityInStockUnit:
                                    Number(this.quantityToMove.value) *
                                    Number(_currentRecord.packingUnitToStockUnitConversionFactor),
                                location: _subcontractLocation,
                                status: this.statusDestination.value
                                    ? this.statusDestination.value
                                    : _currentRecord.status?.code,
                                serialNumber: this.startingSerialNumber.value.code,
                                endingSerialNumber: this.endingSerialNumber.value,
                                identifier1: _currentRecord.identifier1 ?? undefined,
                                identifier2: _currentRecord.identifier2 ?? undefined,
                            },
                        ],
                    });
                }

                this._saveDetail();
                (_currentRecord as any).quantityToMove = String(0);
                this.quantityToMove.value = 0;
                this.stock.setRecordValue(_currentRecord);
                this.startingSerialNumber.value = null;
                this.endingSerialNumber.value = null;
                await this.$.commitValueAndPropertyChanges();
            }
        },
    })
    addSerialRange: ui.PageAction;

    /*
     *
     *  Sections
     *
     */

    @ui.decorators.section<MobileSubcontractTransferDetails>({
        isTitleHidden: true,
    })
    mainSection: ui.containers.Section;

    @ui.decorators.section<MobileSubcontractTransferDetails>({
        title: 'Stock change',
        isTitleHidden: true,
    })
    detailPanelSection: ui.containers.Section;

    @ui.decorators.section<MobileSubcontractTransferDetails>({
        isTitleHidden: true,
    })
    sectionHeader: ui.containers.Section;

    /*
     *
     *  Blocks
     *
     */

    @ui.decorators.block<MobileSubcontractTransferDetails>({
        isTitleHidden: true,
        parent() {
            return this.mainSection;
        },
    })
    bodyBlock: ui.containers.Block;

    @ui.decorators.block<MobileSubcontractTransferDetails>({
        isTitleHidden: true,
        parent() {
            return this.detailPanelSection;
        },
    })
    detailsBlock: ui.containers.Block;

    @ui.decorators.gridRowBlock<MobileSubcontractTransferDetails>({
        isTitleHidden: true,
        parent() {
            return this.detailPanelSection;
        },
        boundTo() {
            return this.stock;
        },
        fieldFilter(columnId: string) {
            return false;
        },
        readOnlyOverride(columnId: string) {
            return undefined;
            // if undefined is returned, the original readOnly property is used from the column definition
        },
    })
    gridBlock: ui.containers.GridRowBlock;

    @ui.decorators.block<MobileSubcontractTransferDetails>({
        isTitleHidden: true,
        parent() {
            return this.detailPanelSection;
        },
    })
    quantityBlock: ui.containers.Block;

    @ui.decorators.block<MobileSubcontractTransferDetails>({
        isTitleHidden: true,
        parent() {
            return this.detailPanelSection;
        },
    })
    serialNumberBlock: ui.containers.Block;

    @ui.decorators.block<MobileSubcontractTransferDetails>({
        isTitleHidden: true,
        parent() {
            return this.detailPanelSection;
        },
    })
    destinationBlock: ui.containers.Block;

    @ui.decorators.block<MobileSubcontractTransferDetails>({
        isTitleHidden: true,
        parent() {
            return this.detailPanelSection;
        },
    })
    listSerialNumberBlock: ui.containers.Block;
    /*
     *
     *  Fields
     *
     */

    @ui.decorators.referenceField<MobileSubcontractTransferDetails, LicensePlateNumber>({
        parent() {
            return this.bodyBlock;
        },
        title: 'License plate number',
        valueField: 'code',
        node: '@sage/x3-stock-data/LicensePlateNumber',
        placeholder: 'Scan or select...',
        isMandatory: false,
        isTransient: true,
        isFullWidth: true,
        isAutoSelectEnabled: true,
        shouldSuggestionsIncludeColumns: true,
        minLookupCharacters: 1,
        canFilter: false,
        filter() {
            return {
                _and: [{ status: 'inStock' }, { stockSite: { code: this._stockSite.code } }],
            };
        },
        async onChange() {
            if (this.licensePlateNumber.value?.location) {
                this.location.value = this.licensePlateNumber.value.location;
            }
            if (!this.licensePlateNumber.value) {
                this.stock.filter = {
                    ...this.stock.filter,
                    licensePlateNumber: undefined,
                };

                if (!this.licensePlateNumber.isHidden) {
                    this.licensePlateNumber.value = null;
                }
                return;
            }

            this.stock.filter = {
                ...this.stock.filter,
                licensePlateNumber: { code: this.licensePlateNumber.value.code },
            };

            this.licensePlateNumber.getNextField(true)?.focus();
        },
        columns: [
            ui.nestedFields.text({
                bind: 'code',
            }),
            ui.nestedFields.reference({
                bind: 'location',
                valueField: 'code',
                node: '@sage/x3-stock-data/Location',
            }),
        ],
    })
    licensePlateNumber: ui.fields.Reference;

    @ui.decorators.referenceField<MobileSubcontractTransferDetails, Location>({
        parent() {
            return this.bodyBlock;
        },
        title: 'Location',
        node: '@sage/x3-stock-data/Location',
        valueField: 'code',
        isMandatory: false,
        placeholder: 'Scan or select…',
        isAutoSelectEnabled: true,
        isFullWidth: true,
        isTransient: true,
        shouldSuggestionsIncludeColumns: true,
        minLookupCharacters: 1,
        canFilter: false,
        filter() {
            const locationFilter: any = {
                stockSite: { code: this._stockSite.code },
                category: { _nin: ['subcontract', 'customer'] },
            };
            return locationFilter;
        },
        async onChange() {
            await handleFilterOnChange<Location>(this, this.location);
            if (this.location.value) {
                this.location.getNextField(true)?.focus();
            }
        },
        columns: [
            ui.nestedFields.text({
                bind: 'code',
                title: 'Code',
            }),
            ui.nestedFields.reference({
                node: '@sage/x3-system/Site',
                bind: 'stockSite',
                valueField: 'code',
                isHidden: true,
            }),
            ui.nestedFields.text({
                bind: 'type',
                title: 'Type',
            }),
        ],
    })
    location: ui.fields.Reference;

    @ui.decorators.referenceField<MobileSubcontractTransferDetails, LotsSites>({
        parent() {
            return this.bodyBlock;
        },
        title: 'Lot',
        placeholder: 'Scan or select...',
        node: '@sage/x3-stock-data/LotsSites',
        valueField: 'lot',
        isTransient: true,
        isMandatory: false,
        isFullWidth: true,
        isAutoSelectEnabled: true,
        shouldSuggestionsIncludeColumns: true,
        minLookupCharacters: 1,
        canFilter: false,
        filter() {
            return {
                product: { code: this.product.value?.code ?? '' },
                storageSite: { code: this.site.value ?? '' },
            };
        },
        async onChange() {
            if (!this.lot.value) {
                this.stock.filter = {
                    ...this.stock.filter,
                    lot: undefined,
                    ...(this.product.value?.lotManagementMode === 'lotAndSublot' && { sublot: undefined }),
                };

                if (!this.sublot.isHidden) {
                    this.sublot.value = null;
                }
                return;
            }

            if (!this.sublot.isHidden) {
                this.sublot.value = this.lot.value; // update sublot field if available, for display purposes only
            }

            this.stock.filter = {
                ...this.stock.filter,
                lot: this.lot.value.lot,
                ...(this.lot.value?.sublot && { sublot: this.lot.value.sublot }),
            };

            this.lot.getNextField(true)?.focus();
        },
        columns: [
            ui.nestedFields.text({
                bind: 'lot',
                title: 'Lot',
                isReadOnly: true,
            }),
            ui.nestedFields.text({
                bind: 'sublot',
                title: 'Sublot',
                isReadOnly: true,
            }),
        ],
    })
    lot: ui.fields.Reference<LotsSites>;

    @ui.decorators.referenceField<MobileSubcontractTransferDetails, LotsSites>({
        parent() {
            return this.bodyBlock;
        },
        title: 'Sublot',
        placeholder: 'Scan or select...',
        node: '@sage/x3-stock-data/LotsSites',
        valueField: 'sublot',
        isTransient: true,
        isMandatory: false,
        isFullWidth: true,
        isAutoSelectEnabled: true,
        shouldSuggestionsIncludeColumns: true,
        minLookupCharacters: 1,
        canFilter: false,
        filter() {
            return {
                product: { code: this.product.value?.code ?? '' },
                storageSite: { code: this.site.value ?? '' },
            };
        },
        async onChange() {
            if (!this.sublot.value) {
                this.stock.filter = {
                    ...this.stock.filter,
                    lot: undefined,
                    sublot: undefined,
                };

                if (!this.lot.isHidden) {
                    this.lot.value = null;
                }
                return;
            }

            if (!this.lot.isHidden) {
                this.lot.value = this.sublot.value;
            }

            this.stock.filter = {
                ...this.stock.filter,
                lot: this.sublot.value.lot,
                sublot: this.sublot.value.sublot,
            };

            this.sublot.getNextField(true)?.focus();
        },
        columns: [
            ui.nestedFields.text({
                bind: 'lot',
                title: 'Lot',
            }),
            ui.nestedFields.text({
                bind: 'sublot',
                title: 'Sublot',
                isReadOnly: true,
            }),
        ],
    })
    sublot: ui.fields.Reference<LotsSites>;

    @ui.decorators.referenceField<MobileSubcontractTransferDetails, SerialNumber>({
        parent() {
            return this.bodyBlock;
        },
        title: 'Serial number',
        placeholder: 'Scan or select...',
        node: '@sage/x3-stock-data/SerialNumber',
        valueField: 'code',
        isTransient: true,
        isMandatory: false,
        isFullWidth: true,
        isAutoSelectEnabled: true,
        shouldSuggestionsIncludeColumns: true,
        minLookupCharacters: 1,
        canFilter: false,
        filter() {
            return {
                product: { code: this.product.value?.code ?? '' },
                stockSite: { code: this.site.value ?? '' },
                issueDocumentId: '',
            };
        },
        async onChange() {
            await handleFilterOnChange(this, this.serialNumber, this.serialNumber.value?.code);
        },
        columns: [
            ui.nestedFields.text({
                bind: 'code',
                title: 'Code',
                isReadOnly: true,
            }),
        ],
    })
    serialNumber: ui.fields.Reference<SerialNumber>;

    @ui.decorators.selectField<MobileSubcontractTransferDetails>({
        parent() {
            return this.bodyBlock;
        },
        title: 'Status',
        placeholder: 'Scan or select...',
        isTransient: true,
        isMandatory: false,
        isFullWidth: true,
        async onChange() {
            await handleFilterOnChange(this, this.status, this.status.value);
        },
    })
    status: ui.fields.Select;

    @ui.decorators.selectField<MobileSubcontractTransferDetails>({
        parent() {
            return this.bodyBlock;
        },
        title: 'Unit',
        placeholder: 'Scan or select...',
        isTransient: true,
        isMandatory: false,
        isFullWidth: true,
        async onChange() {
            await handleFilterOnChange(this, this.packingUnit, this.packingUnit.value);
        },
    })
    packingUnit: ui.fields.Select;

    @ui.decorators.numericField<MobileSubcontractTransferDetails>({
        parent() {
            return this.bodyBlock;
        },
        title: 'Conversion factor',
        placeholder: 'Scan...',
        isTransient: true,
        isMandatory: false,
        isFullWidth: true,
        min: 0,
        async onChange() {
            await handleFilterOnChange(this, this.packingUnitToStockUnitConversionFactor);
        },
    })
    packingUnitToStockUnitConversionFactor: ui.fields.Numeric;

    @ui.decorators.textField<MobileSubcontractTransferDetails>({
        parent() {
            return this.bodyBlock;
        },
        title: 'Identifier 1',
        placeholder: 'Scan...',
        validation: /^$|^[^|]+$/,
        isTransient: true,
        isMandatory: false,
        isFullWidth: true,
        async onChange() {
            await handleFilterOnChange(this, this.identifier1);
        },
    })
    identifier1: ui.fields.Text;

    @ui.decorators.textField<MobileSubcontractTransferDetails>({
        parent() {
            return this.bodyBlock;
        },
        title: 'Identifier 2',
        placeholder: 'Scan...',
        validation: /^$|^[^|]+$/,
        isTransient: true,
        isMandatory: false,
        isFullWidth: true,
        async onChange() {
            await handleFilterOnChange(this, this.identifier2);
        },
    })
    identifier2: ui.fields.Text;

    @ui.decorators.textField<MobileSubcontractTransferDetails>({
        parent() {
            return this.bodyBlock;
        },
        title: 'Stock custom field 1',
        placeholder: 'Scan...',
        validation: /^$|^[^|]+$/,
        isTransient: true,
        isMandatory: false,
        isFullWidth: true,
        async onChange() {
            await handleFilterOnChange(this, this.stockCustomField1);
        },
    })
    stockCustomField1: ui.fields.Text;

    @ui.decorators.textField<MobileSubcontractTransferDetails>({
        parent() {
            return this.bodyBlock;
        },
        title: 'Stock custom field 2',
        placeholder: 'Scan...',
        validation: /^$|^[^|]+$/,
        isTransient: true,
        isMandatory: false,
        isFullWidth: true,
        async onChange() {
            await handleFilterOnChange(this, this.stockCustomField2);
        },
    })
    stockCustomField2: ui.fields.Text;

    @ui.decorators.tableField<MobileSubcontractTransferDetails, Stock>({
        parent() {
            return this.bodyBlock;
        },
        node: '@sage/x3-stock-data/Stock',
        isChangeIndicatorDisabled: false,
        canFilter: false,
        canSelect: true,
        canExport: false,
        canResizeColumns: false,
        canUserHideColumns: false,
        isTitleHidden: false,
        isTransient: false,
        isFullWidth: true,
        isDisabled: false,
        hasSearchBoxMobile: false,
        cardView: true,
        displayMode: ui.fields.TableDisplayMode.compact,
        mobileCard: undefined,
        orderBy: {
            stockSite: 1,
            stockId: 1,
        },
        filter() {
            return {
                ...generateStockTableFilter(this),
                location: { category: { _nin: ['subcontract', 'customer'] } },
            };
        },
        columns: [
            ui.nestedFields.numeric({
                bind: 'quantityToMove' as any,
                isReadOnly: true,
                isHidden: false, // special field that always gets displayed
                isTransient: true,
                postfix(value, rowValue?: Dict<any>) {
                    return `/ ${ui.formatNumberToCurrentLocale(
                        (this.$.detailPanel as any).isHidden
                            ? (rowValue?.quantityInPackingUnitOrigin ?? 0)
                            : (rowValue?.quantityInPackingUnitRest ?? 0),
                        rowValue?.packingUnit?.numberOfDecimals ?? 0,
                    )} ${rowValue?.packingUnit?.code ?? ''}`;
                },
                title: 'Quantity to move', // this is important to display a title in the grid row block
                isTitleHidden: false,
                isMandatory: false,
                isFullWidth: true,
                max(rowValue?: Stock) {
                    return (<any>(<unknown>rowValue))?.quantityInPackingUnitOrigin ?? 0;
                },
                scale(value, rowValue?: Dict<any>) {
                    return rowValue?.packingUnit?.numberOfDecimals ?? 0;
                },
            }),
            ui.nestedFields.numeric({
                bind: 'quantityInPackingUnit',
                isHidden: true,
                isTitleHidden: true,
                isTransient: false,
            }),
            ui.nestedFields.numeric({
                bind: 'quantityInPackingUnitRest' as any,
                isHidden: true,
                isTitleHidden: true,
                isTransient: true,
            }),
            ui.nestedFields.reference<MobileSubcontractTransferDetails, Stock, ProductSite>({
                bind: 'product',
                valueField: { product: { code: true } },
                node: '@sage/x3-master-data/ProductSite',
                title: 'Product',
                isReadOnly: true,
                isHidden: false,
                columns: [
                    ui.nestedFields.text({
                        bind: { product: { code: true } },
                    }),
                    ui.nestedFields.text({
                        bind: { product: { serialNumberManagementMode: true } },
                    }),
                    ui.nestedFields.text({
                        bind: { product: { stockUnit: { code: true } } },
                    }),
                ],
            }),
            ui.nestedFields.reference<MobileSubcontractTransferDetails, Stock, LicensePlateNumber>({
                bind: 'licensePlateNumber',
                valueField: 'code',
                node: '@sage/x3-stock-data/LicensePlateNumber',
                title: 'License plate number',
                isReadOnly: true,
                isHidden: true,
            }),
            ui.nestedFields.reference<MobileSubcontractTransferDetails, Stock, Location>({
                bind: 'location',
                valueField: 'code',
                node: '@sage/x3-stock-data/Location',
                isReadOnly: true,
                isHidden: false,
            }),
            ui.nestedFields.text({
                bind: 'lot',
                isReadOnly: true,
                isHidden() {
                    return this.lot.isHidden ?? false;
                },
            }),
            ui.nestedFields.text({
                bind: 'sublot',
                isReadOnly: true,
                isHidden() {
                    return this.sublot.isHidden ?? false;
                },
            }),
            ui.nestedFields.link({
                bind: 'globalSerialNumber' as any,
                isTransient: true,
                isHidden: true,
            }),
            ui.nestedFields.text({
                bind: 'serialNumber',
                isReadOnly: true,
                isHidden() {
                    return this.serialNumber.isHidden ?? false;
                },
            }),
            ui.nestedFields.reference<MobileSubcontractTransferDetails, Stock, StockStatus>({
                bind: 'status',
                valueField: 'code',
                node: '@sage/x3-stock-data/StockStatus',
                isReadOnly: true,
                isHidden() {
                    return this.status.isHidden ?? false;
                },
            }),
            ui.nestedFields.text({
                bind: 'statusDestination' as any,
                isReadOnly: true,
                isTransient: true,
                isHidden: true,
            }),
            ui.nestedFields.technical<MobileSubcontractTransferDetails, Stock, UnitOfMeasure>({
                bind: 'packingUnit',
                node: '@sage/x3-master-data/UnitOfMeasure',
                nestedFields: [
                    ui.nestedFields.text({
                        bind: 'code',
                    }),
                    ui.nestedFields.numeric({
                        bind: 'numberOfDecimals',
                    }),
                ],
            }),
            ui.nestedFields.technical<MobileSubcontractTransferDetails, Stock, UnitOfMeasure>({
                bind: 'packingUnitDestination' as any,
                node: '@sage/x3-master-data/UnitOfMeasure',
                isTransient: true,
                nestedFields: [
                    ui.nestedFields.text({
                        bind: 'code',
                    }),
                    ui.nestedFields.numeric({
                        bind: 'numberOfDecimals',
                    }),
                ],
            }),
            ui.nestedFields.numeric({
                bind: 'packingUnitToStockUnitConversionFactor',
                isReadOnly: true,
                isHidden() {
                    return this.packingUnitToStockUnitConversionFactor.isHidden ?? false;
                },
            }),
            ui.nestedFields.numeric({
                bind: 'quantityInPackingUnitOrigin' as any,
                isHidden: true,
                isTitleHidden: true,
                isTransient: true,
            }),
            ui.nestedFields.numeric({
                bind: 'packingUnitToStockUnitConversionFactorDestination' as any,
                isReadOnly: true,
                isTransient: true,
                isHidden: true,
            }),
            ui.nestedFields.text({
                bind: 'identifier1',
                isReadOnly: true,
                isHidden() {
                    return this.identifier1.isHidden ?? false;
                },
            }),
            ui.nestedFields.text({
                bind: 'identifier2',
                isReadOnly: true,
                isHidden() {
                    return this.identifier2.isHidden ?? false;
                },
            }),
            ui.nestedFields.text({
                bind: 'stockCustomField1',
                isReadOnly: true,
                isHidden() {
                    return this.stockCustomField1.isHidden ?? false;
                },
            }),
            ui.nestedFields.text({
                bind: 'stockCustomField2',
                isReadOnly: true,
                isHidden() {
                    return this.stockCustomField2.isHidden ?? false;
                },
            }),
            ui.nestedFields.technical({
                bind: 'stockId',
            }),
            ui.nestedFields.technical<MobileSubcontractTransferDetails, Stock, Lot>({
                bind: 'lotReference',
                node: '@sage/x3-stock-data/Lot',
                nestedFields: [
                    ui.nestedFields.date({
                        bind: 'expirationDate',
                    }),
                    ui.nestedFields.date({
                        bind: 'useByDate',
                    }),
                    ui.nestedFields.text({
                        bind: 'lotCustomField1',
                    }),
                    ui.nestedFields.text({
                        bind: 'lotCustomField2',
                    }),
                    ui.nestedFields.reference({
                        bind: 'majorVersion',
                        node: '@sage/x3-master-data/MajorVersionStatus',
                        valueField: 'code',
                    }),
                ],
            }),
            ui.nestedFields.date({
                bind: 'lotReferenceExpirationDate' as any,
                isTransient: true,
                isReadOnly: true,
                isHidden: true,
            }),
            ui.nestedFields.date({
                bind: 'lotReferenceUseByDate' as any,
                isTransient: true,
                isReadOnly: true,
                isHidden: true,
            }),
            ui.nestedFields.text({
                bind: 'lotReferenceMajorVersion' as any,
                isTransient: true,
                isReadOnly: true,
                isHidden: true,
            }),
            ui.nestedFields.technical({
                bind: 'quantityInStockUnit',
            }),
            ui.nestedFields.technical({
                bind: 'allocatedQuantity',
            }),
            ui.nestedFields.technical({
                bind: 'qualityAnalysisRequestId',
            }),
            ui.nestedFields.technical({
                bind: 'owner',
            }),
        ],
        onError(error) {
            switch (error.message) {
                case '@sage/x3-stock/serial-number-not-sequential': {
                    return ui.localize(
                        '@sage/x3-stock/serial-number-not-sequential',
                        'The serial numbers are not sequential. Check your entry.',
                    );
                }
                default:
                    return error;
            }
        },
        async onRowSelected(recordId: string, rowItem: Stock) {
            await this._onRowClick(recordId, rowItem);
        },
        async onRowUnselected(recordId: string, rowItem: Stock) {
            await this._onRowUnSelect(recordId, rowItem);
        },
        sortColumns(firstColumn, secondColumn) {
            if (firstColumn.bind === secondColumn.bind) return 0;
            if (firstColumn.bind === 'quantityToMove') {
                return secondColumn.bind === (this._stockFieldSettings[0] as string) ? 1 : -1;
            } else if (secondColumn.bind === 'quantityToMove') {
                return firstColumn.bind === (this._stockFieldSettings[0] as string) ? -1 : 1;
            }

            for (const stockFieldSetting of Object.keys(this._stockFieldSettings)) {
                if (!stockFieldSetting || stockFieldSetting === 'none') break;
                if (firstColumn.bind === (stockFieldSetting as string)) return -1;
                if (secondColumn.bind === (stockFieldSetting as string)) return 1;
            }

            return 1;
        },
        mapServerRecord(record: Partial<Stock>) {
            const _record = {
                ...record,
                quantityInPackingUnitOrigin: this._getQuantityInPackingUnitOrigin(record),
                quantityInPackingUnitRest: this._getquantityInPackingUnitRest(record),
                quantityToMove: this._getQuantityToMove(record).toString(),
                statusDestination: this._getStatusDestination(record),
                packingUnitDestination: this._getPackingUnitDestination(record),
                packingUnitToStockUnitConversionFactorDestination:
                    this._getPackingUnitToStockUnitConversionFactorDestination(record),
                lotReferenceExpirationDate: record.lotReference?.expirationDate,
                lotReferenceUseByDate: record.lotReference?.useByDate,
                lotReferenceMajorVersion: record.lotReference?.majorVersion?.code,
                globalSerialNumber: ui.localize('@sage/x3-stock/label-view-all', 'View list'),
            };
            return _record;
        },

        async onRowClick(recordId: string, rowItem: Stock) {
            await this._onRowUnSelect(recordId, rowItem);
            await this._onRowClick(recordId, rowItem);
        },
    })
    stock: ui.fields.Table<Stock>;

    @ui.decorators.detailListField<MobileSubcontractTransferDetails, Stock>({
        parent() {
            return this.detailsBlock;
        },
        node: '@sage/x3-stock-data/Stock',
        isTransient: true,
        isFullWidth: true,
        isTitleHidden: true,
        fields: [
            ui.nestedFields.reference<MobileSubcontractTransferDetails, Stock, ProductSite>({
                bind: 'product',
                valueField: { product: { code: true } },
                node: '@sage/x3-master-data/ProductSite',
                title: 'Product',
                isReadOnly: true,
                isHidden: false,
            }),
            ui.nestedFields.reference<MobileSubcontractTransferDetails, Stock, LicensePlateNumber>({
                bind: 'licensePlateNumber',
                valueField: 'code',
                title: 'License plate number',
                node: '@sage/x3-stock-data/LicensePlateNumber',
                isReadOnly: true,
                isHidden: hideWhenEmptyValue,
            }),
            ui.nestedFields.reference<MobileSubcontractTransferDetails, Stock, Location>({
                bind: 'location',
                valueField: 'code',
                node: '@sage/x3-stock-data/Location',
                title: 'Location',
                isReadOnly: true,
                isHidden: false,
            }),
            ui.nestedFields.numeric({
                bind: 'stockId',
                title: 'Stock ID',
                isReadOnly: true,
                isHidden: true,
            }),
            ui.nestedFields.text({
                bind: 'lot',
                title: 'Lot',
                isReadOnly: true,
                isHidden: hideWhenEmptyValue,
            }),
            ui.nestedFields.text({
                bind: 'sublot',
                title: 'Sublot',
                isReadOnly: true,
                isHidden: hideWhenEmptyValue,
            }),
            ui.nestedFields.reference<MobileSubcontractTransferDetails, Stock, Lot>({
                node: '@sage/x3-stock-data/Lot',
                bind: 'lotReference',
                valueField: { majorVersion: { code: true } },
                title: 'Major version',
                isReadOnly: true,
                isHidden: (value: Lot) => {
                    return !value?.majorVersion;
                },
            }),
            ui.nestedFields.reference<MobileSubcontractTransferDetails, Stock, Lot>({
                node: '@sage/x3-stock-data/Lot',
                bind: 'lotReference',
                valueField: 'expirationDate',
                title: 'Expiration date',
                isReadOnly: true,
                isHidden(value: Lot) {
                    return (
                        !this.product.value ||
                        this.product.value.expirationManagementMode === 'notManaged' ||
                        !value?.expirationDate ||
                        Date.parse(value.expirationDate) > Date.now()
                    );
                },
            }),
            ui.nestedFields.reference<MobileSubcontractTransferDetails, Stock, Lot>({
                node: '@sage/x3-stock-data/Lot',
                bind: 'lotReference',
                valueField: 'useByDate',
                title: 'Use-by date',
                isReadOnly: true,
                isHidden(value: Lot) {
                    return (
                        !this.product.value ||
                        this.product.value.expirationManagementMode === 'notManaged' ||
                        !value?.useByDate ||
                        Date.parse(value.useByDate) > Date.now()
                    );
                },
            }),
            ui.nestedFields.reference<MobileSubcontractTransferDetails, Stock, Lot>({
                node: '@sage/x3-stock-data/Lot',
                bind: 'lotReference',
                valueField: 'lotCustomField1',
                title: 'Lot custom field 1',
                isReadOnly: true,
                isHidden(value: Lot) {
                    return !value?.lotCustomField1;
                },
            }),
            ui.nestedFields.reference<MobileSubcontractTransferDetails, Stock, Lot>({
                node: '@sage/x3-stock-data/Lot',
                bind: 'lotReference',
                valueField: 'lotCustomField2',
                title: 'Lot custom field 2',
                isReadOnly: true,
                isHidden(value: Lot) {
                    return !value?.lotCustomField2;
                },
            }),
            ui.nestedFields.text({
                bind: 'serialNumber',
                title: 'Serial no.',
                isReadOnly: true,
                isHidden: hideWhenEmptyValue,
            }),
            ui.nestedFields.link({
                bind: 'globalSerialNumber' as any,
                title: 'Serial no.',
                isHidden() {
                    return this._productSite.product.serialNumberManagementMode !== 'globalReceivedIssued';
                },
                async onClick(_id, rowData: any) {
                    const options: ui.dialogs.PageDialogOptions = {
                        skipDirtyCheck: true,
                    };
                    try {
                        await this.$.dialog.page(
                            '@sage/x3-stock/MobileGlobalSerialDetails',
                            {
                                product: this.product.value?.code ?? '',
                                stockId: rowData.stockId,
                                subtitle: this.localizedDescription.value ?? '',
                            },
                            options,
                        );
                    } catch (error) {
                        if (error) {
                            this.$.showToast(error.message, { timeout: 10000, type: 'error' });
                        }
                    }
                },
            }),
            ui.nestedFields.numeric({
                bind: 'quantityToMove' as any,
                title: 'Quantity to move',
                isReadOnly: true,
                isTransient: true,
                isHidden: true,
                postfix(value, rowValue?: Dict<any>) {
                    return rowValue?.packingUnit.code;
                },
                scale(value, rowValue?: Dict<any>) {
                    return rowValue?.packingUnit?.numberOfDecimals ?? 0;
                },
            }),
            ui.nestedFields.numeric({
                bind: 'quantityInPackingUnit' as any,
                title: 'Packing qty.',
                isReadOnly: true,
                isHidden: false,
                postfix(value, rowValue?: Dict<any>) {
                    return rowValue?.packingUnit?.code ?? '';
                },
                scale(value, rowValue?: Dict<any>) {
                    return rowValue?.packingUnit?.numberOfDecimals ?? 0;
                },
            }),
            ui.nestedFields.reference<MobileSubcontractTransferDetails, Stock, UnitOfMeasure>({
                bind: 'packingUnit',
                node: '@sage/x3-master-data/UnitOfMeasure',
                valueField: 'code',
                title: 'Unit',
                isReadOnly: true,
                isHidden: true,
            }),
            ui.nestedFields.numeric({
                bind: 'packingUnitToStockUnitConversionFactor',
                title: 'Conversion factor',
                isReadOnly: true,
                isHidden: false,
            }),
            ui.nestedFields.numeric({
                bind: 'quantityInStockUnit',
                title: 'Stock qty.',
                isReadOnly: true,
                isHidden: hideWhenEmptyValue,
                postfix() {
                    return this.product.value?.stockUnit?.code ?? '';
                },
                scale() {
                    return this.product.value?.stockUnit?.numberOfDecimals ?? 0;
                },
            }),
            ui.nestedFields.numeric({
                bind: 'allocatedQuantity',
                title: 'Allocated qty.',
                isReadOnly: true,
                isHidden: hideWhenEmptyValue,
                postfix() {
                    return this.product.value?.stockUnit?.code ?? '';
                },
                scale() {
                    return this.product.value?.stockUnit?.numberOfDecimals ?? 0;
                },
            }),
            ui.nestedFields.reference<MobileSubcontractTransferDetails, Stock, StockStatus>({
                bind: 'status',
                valueField: 'code',
                node: '@sage/x3-stock-data/StockStatus',
                title: 'Status',
                isReadOnly: true,
                isHidden: (value: StockStatus) => {
                    return !value?.code;
                },
            }),
            ui.nestedFields.text({
                bind: 'identifier1',
                title: 'Identifier 1',
                isReadOnly: true,
                isHidden: hideWhenEmptyValue,
            }),
            ui.nestedFields.text({
                bind: 'identifier2',
                title: 'Identifier 2',
                isReadOnly: true,
                isHidden: hideWhenEmptyValue,
            }),
            ui.nestedFields.text({
                bind: 'qualityAnalysisRequestId',
                title: 'Analysis req.',
                isReadOnly: true,
                isHidden: hideWhenEmptyValue,
            }),
            ui.nestedFields.text({
                bind: 'owner',
                title: 'Owner',
                isReadOnly: true,
                isHidden: true,
            }),
        ],
    })
    stockDetails: ui.fields.DetailList<Stock>;

    @ui.decorators.numericField<MobileSubcontractTransferDetails>({
        parent() {
            return this.quantityBlock;
        },
        postfix(value, rowValue?: Dict<any>) {
            const _record = <any>(<unknown>this.stock.getRecordValue(this.gridBlock.selectedRecordId ?? ''));
            return `/ ${ui.formatNumberToCurrentLocale(
                (this.$.detailPanel as any).isHidden
                    ? (_record?.quantityInPackingUnitOrigin ?? 0)
                    : (_record?.quantityInPackingUnitRest ?? 0),
                _record?.packingUnit?.numberOfDecimals ?? 0,
            )} ${_record?.packingUnit?.code ?? ''}`;
        },
        title: 'Quantity to move', // this is important to display a title in the grid row block
        isMandatory: false,
        isFullWidth: true,
        isTransient: true,
        max() {
            return (<any>(<unknown>this.stock.getRecordValue(this.gridBlock?.selectedRecordId ?? '')))
                ?.quantityInPackingUnitRest;
        },
        scale() {
            return (
                (<any>(<unknown>this.stock.getRecordValue(this.gridBlock?.selectedRecordId ?? '')))?.packingUnit
                    ?.numberOfDecimals ?? 0
            );
        },
        async onChange() {
            const _currentRecord = this.stock.getRecordValue(this.gridBlock?.selectedRecordId ?? '');
            if (_currentRecord) {
                (_currentRecord as any).quantityToMove = String(this.quantityToMove.value);
                this.stock.setRecordValue(_currentRecord);
                await this.$.commitValueAndPropertyChanges();
            }
        },
    })
    quantityToMove: ui.fields.Numeric;

    @ui.decorators.referenceField<MobileSubcontractTransferDetails, SerialNumber>({
        parent() {
            return this.serialNumberBlock;
        },
        title: 'Starting serial number',
        placeholder: 'Scan or select…',
        node: '@sage/x3-stock-data/SerialNumber',
        valueField: 'code',
        isMandatory: false,
        isTransient: true,
        isFullWidth: true,
        canFilter: false,
        isDisabled: false,
        isAutoSelectEnabled: true,
        shouldSuggestionsIncludeColumns: true,
        minLookupCharacters: 1,
        filter() {
            return {
                _and: [{ product: { code: this.product.value?.code } }, { stockId: this._stockId.value ?? undefined }],
            };
        },
        async onChange() {
            await this._onChangeBody();
        },
        columns: [
            ui.nestedFields.text({
                bind: 'code',
                title: 'Code',
                isReadOnly: true,
            }),
            ui.nestedFields.reference({
                node: '@sage/x3-master-data/Product',
                title: 'Product',
                bind: 'product',
                valueField: 'code',
                isHidden: true,
            }),
            ui.nestedFields.numeric({
                bind: 'stockId',
                title: 'Stock ID',
                isReadOnly: true,
                isHidden: true,
            }),
        ],
    })
    startingSerialNumber: ui.fields.Reference<SerialNumber>;

    @ui.decorators.textField<MobileSubcontractTransferDetails>({
        parent() {
            return this.serialNumberBlock;
        },
        title: 'Ending serial number',
        isMandatory: false,
        isTransient: true,
        isReadOnly: true,
        isFullWidth: true,
        async validation(value: string) {
            if (this._productSite.product.serialNumberManagementMode !== 'globalReceivedIssued') return;

            const _currentRecord = this.stock.getRecordValue(this.gridBlock.selectedRecordId ?? '');
            const _currentQty = Number(this.quantityToMove.value);

            if (
                (await getCountSerialNumber(
                    this,
                    this.product.value?.code ?? '',
                    this._stockSite.code,
                    this._stockId.value ?? '',
                    this.startingSerialNumber.value?.code ?? '',
                    this.endingSerialNumber.value ?? '',
                    value,
                )) !== _currentQty
            ) {
                return ui.localize(
                    '@sage/x3-stock/serial-number-not-sequential',
                    'The serial numbers are not sequential. Check your entry.',
                );
            }
        },
    })
    endingSerialNumber: ui.fields.Text;

    @ui.decorators.selectField<MobileSubcontractTransferDetails>({
        parent() {
            return this.destinationBlock;
        },
        title: 'Destination Status',
        width: 'small',
        isMandatory: false,
        isTransient: true,
        onChange() {
            this._activeSelectButton();
            if (this.statusDestination.value) {
                this.statusDestination.getNextField(true)?.focus();
            }
        },
    })
    statusDestination: ui.fields.Select;

    @ui.decorators.selectField<MobileSubcontractTransferDetails>({
        parent() {
            return this.destinationBlock;
        },
        title: 'Destination unit',
        width: 'small',
        isMandatory: false,
        isTransient: true,
        onChange() {
            if (!this.packingUnitDestination.value) return;

            const selectedValue = this.packingUnitDestination.value;
            const packingUnitIndex = this._packingUnits
                .map(packingUnit => packingUnit.node.packingUnit.code)
                .indexOf(selectedValue);
            if (packingUnitIndex !== -1) {
                const selectedUnit = this._packingUnits[packingUnitIndex].node;
                this.packingUnitToStockUnitConversionFactorDestination.value = Number(
                    selectedUnit.packingUnitToStockUnitConversionFactor,
                );
                this.packingUnitToStockUnitConversionFactorDestination.isDisabled =
                    !selectedUnit.isPackingFactorEntryAllowed;
            } else {
                this.packingUnitToStockUnitConversionFactorDestination.value = 1;
                this.packingUnitToStockUnitConversionFactorDestination.isDisabled = true;
            }
            this._activeSelectButton();
            this.packingUnitDestination.getNextField(true)?.focus();
        },
    })
    packingUnitDestination: ui.fields.Select;

    @ui.decorators.numericField<MobileSubcontractTransferDetails>({
        parent() {
            return this.destinationBlock;
        },
        title: 'Destination conversion factor',
        isDisabled: true,
        isMandatory: false,
        isTransient: true,
        scale: 5,
        onChange() {
            this._activeSelectButton();
        },
    })
    packingUnitToStockUnitConversionFactorDestination: ui.fields.Numeric;

    private _activeSelectButton() {
        const currentRecord = this.stock.getRecordValue(this.gridBlock?.selectedRecordId ?? '');
    }

    @ui.decorators.textField<MobileSubcontractTransferDetails>({
        parent() {
            return this.serialNumberBlock;
        },
        isTransient: true,
        isHidden: true,
    })
    _stockId: ui.fields.Text;

    @ui.decorators.tableField<MobileSubcontractTransferDetails>({
        parent() {
            return this.listSerialNumberBlock;
        },
        canFilter: false,
        canSelect: false,
        canExport: false,
        canResizeColumns: false,
        canUserHideColumns: false,
        isTitleHidden: false,
        isTransient: true,
        isFullWidth: true,
        isDisabled: false,
        node: '@sage/x3-stock/StockCountSerialNumber',
        mobileCard: undefined,
        columns: [
            ui.nestedFields.text({
                bind: 'startingSerialNumber',
                title: 'Starting serial Number',
                isReadOnly: true,
            }),
            ui.nestedFields.numeric({
                bind: 'quantity',
                title: 'Quantity',
                isReadOnly: true,
                postfix(value, rowValue?: Dict<any>) {
                    return this.stock.getRecordValue(this.gridBlock.selectedRecordId ?? '')?.packingUnit?.code ?? '';
                },
                scale() {
                    return (
                        this.stock.getRecordValue(this.gridBlock.selectedRecordId ?? '')?.packingUnit
                            ?.numberOfDecimals ?? 0
                    );
                },
            }),
            ui.nestedFields.text({
                bind: 'endingSerialNumber',
                title: 'Ending Serial Number',
                isReadOnly: true,
            }),
        ],
        dropdownActions: [
            {
                icon: 'bin',
                title: 'Delete',
                onClick(recordId: string) {
                    // line removal in the saved object
                    const removedRecordSerialNumber = this.serialNumberLines.getRecordValue(recordId);
                    if (removedRecordSerialNumber) {
                        const removedIndexSerialNumber =
                            this._stockChangeLines[this._currentLine].stockDetails?.findIndex(
                                number => number.serialNumber === removedRecordSerialNumber?.startingSerialNumber,
                            ) ?? -1;
                        if (removedIndexSerialNumber !== -1) {
                            this._stockChangeLines[this._currentLine].stockDetails?.splice(removedIndexSerialNumber, 1);
                        }

                        this._saveDetail();
                        // Clear quantity of this._currentLine
                        const _currentRecord = this.stock.getRecordValue(this.gridBlock?.selectedRecordId ?? '');
                        if (_currentRecord) {
                            (_currentRecord as any).quantityToMove = String(0);
                            this.stock.setRecordValue(_currentRecord);
                        }
                        //remove from the card
                        this.serialNumberLines.removeRecord(recordId);
                    }

                    this.startingSerialNumber.isDisabled = false;
                },
            },
        ],
        fieldActions() {
            return [this.addSerialRange];
        },
    })
    serialNumberLines: ui.fields.Table<any>;

    /*
     *
     *  Init functions
     *
     */

    private async _init() {
        const savedInputs = this._getSavedInputs();
        const storageProductSite = savedInputs?.selectedProduct;
        this._stockChangeLines = savedInputs?.subcontractTransfer?.stockChangeLines ?? [];

        this._initSiteCodeField();
        this._productSite = await this._getProductSite(storageProductSite?.code ?? '');

        this._initTechnicalProperties();
        await this._fieldsManagement();
    }

    private _getSavedInputs() {
        return JSON.parse(this.$.storage.get('mobile-subcontractTransfer') as string) as inputsSubcontractTransfer;
    }

    private async _getProductSite(storageProductSite: string) {
        if (storageProductSite) {
            const productCode = storageProductSite;

            const productSiteToReceive = await this.$.graph
                .node('@sage/x3-master-data/ProductSite')
                .read(
                    {
                        isLocationManaged: true,
                        isLicensePlateNumberManaged: true,
                        defaultInternalContainer: {
                            code: true,
                        },
                        product: {
                            code: true,
                            localizedDescription1: true,
                            lotManagementMode: true,
                            serialNumberManagementMode: true,
                            stockVersionMode: true,
                            expirationManagementMode: true,
                            serialSequenceNumber: true,
                            lotSequenceNumber: true,
                            stockManagementMode: true,
                            defaultPotencyInPercentage: true,
                            expirationLeadTime: true,
                            expirationTimeUnit: true,
                            useByDateCoefficient: true,
                            stockUnit: {
                                code: true,
                                numberOfDecimals: true,
                            },
                            productCategory: {
                                code: true,
                            },
                            packingUnits: {
                                query: {
                                    edges: {
                                        node: {
                                            packingUnit: {
                                                code: true,
                                                numberOfDecimals: true,
                                            },
                                            packingUnitToStockUnitConversionFactor: true,
                                            isPackingFactorEntryAllowed: true,
                                        },
                                    },
                                },
                            },
                        },
                    },
                    `${productCode}|${this.site.value}`,
                )
                .execute();

            return productSiteToReceive as any;
        }
    }

    private _initSiteCodeField() {
        const siteCode = this.$.storage.get('mobile-selected-stock-site') as string;
        if (siteCode) {
            this.site.value = siteCode;
        }
    }

    private _initTechnicalProperties() {
        this.product.value = {
            code: this._productSite.product.code,
            serialNumberManagementMode: this._productSite.product.serialNumberManagementMode,
            lotManagementMode: this._productSite.product.lotManagementMode,
            expirationManagementMode: this._productSite.product.expirationManagementMode,
            stockUnit: {
                code: this._productSite.product.stockUnit.code,
                numberOfDecimals: this._productSite.product.stockUnit.numberOfDecimals,
            },
        };
        this.localizedDescription.value = this._productSite.product.localizedDescription1;
    }

    /*
     *
     *  Fields management functions
     *
     */

    private async _onRowClick(recordId: string, rowItem: Stock) {
        const _record = this.stock.getRecordValue(recordId);
        const _stockId = Number(rowItem.stockId);
        this.stockDetails.value = [rowItem]; // populate details list
        this.gridBlock.selectedRecordId = recordId; // populate grid row block
        this._stockId.value = rowItem.stockId;
        this.quantityToMove.value = Number((_record as any)?.quantityToMove);
        if (this.statusDestination.options?.findIndex(line => line === (_record as any)?.statusDestination) !== -1) {
            this.statusDestination.value = (_record as any)?.statusDestination;
        }
        if ((_record as any)?.packingUnitDestination) {
            this.packingUnitDestination.value = (_record as any)?.packingUnitDestination?.code;
        }
        if ((_record as any)?.packingUnitToStockUnitConversionFactorDestination) {
            this.packingUnitToStockUnitConversionFactorDestination.value = (
                _record as any
            )?.packingUnitToStockUnitConversionFactorDestination;
        }

        if (this._productSite.product.serialNumberManagementMode === 'globalReceivedIssued') {
            this.serialNumberLines.isHidden = false;
            this.serialNumberLines.value = [];
            this._stockChangeLines.forEach(line => {
                if (
                    Number(line.stockId) === Number(rowItem.stockId) &&
                    line.lineNumber === this._currentOperation &&
                    line.serialNumber
                ) {
                    this.serialNumberLines.addRecord({
                        quantity: Number(line.quantityInPackingUnitDestination),
                        startingSerialNumber: line.serialNumber,
                        endingSerialNumber: line.endingSerialNumber,
                    });
                }
            });
            let currentRecord = _record;
            if (currentRecord) {
                this.stock.setRecordValue(currentRecord);
            }
        } else {
            const lineIndex = this._stockChangeLines.findIndex(
                line => Number(line.stockId) === Number(rowItem.stockId) && line.lineNumber === this._currentOperation,
            );
            if (lineIndex > -1) {
                this._currentLine = lineIndex;
            } else {
                this._currentLine = this._stockChangeLines.length;
                this._stockChangeLines.push({
                    product: this.product?.value?.code,
                    stockId: rowItem.stockId,
                    location: this.stock.getRecordValue(this.gridBlock.selectedRecordId)?.location?.code,
                    lineNumber: this._currentOperation,
                    quantityInPackingUnit: rowItem.quantityInPackingUnit,
                    quantityInPackingUnitDestination: rowItem.quantityInPackingUnit,
                    packingUnit: (this.stock.getRecordValue(this.gridBlock.selectedRecordId) as any).packingUnit?.code,
                    packingUnitToStockUnitConversionFactor: rowItem.packingUnitToStockUnitConversionFactor,
                    stockDetails: [
                        {
                            quantityInPackingUnit: rowItem.quantityInPackingUnit,
                        },
                    ],
                });
            }
        }
        this._activeSelectButton();
        await this.$.commitValueAndPropertyChanges();
        await this.stock.validateWithDetails();

        (this.$.detailPanel as any).isHidden = false;
    }

    async _onRowUnSelect(recordId: string, rowItem: Stock) {
        let stockRecord = this.stock.getRecordValue(recordId);
        if (stockRecord) {
            let i: number = 0;
            while (i < this._stockChangeLines.length) {
                if (
                    Number(this._stockChangeLines[i].stockId) === Number(stockRecord.stockId) &&
                    Number(this._stockChangeLines[i].lineNumber) === Number(this._currentOperation)
                ) {
                    this._stockChangeLines.splice(i, 1);
                } else {
                    i += 1;
                }
            }
            this._saveStockChange();
            (stockRecord as any).quantityToMove = (stockRecord as any).quantityInPackingUnitOrigin;
            this.stock.setRecordValue(stockRecord);
        }
    }

    private async _fieldsManagement() {
        this._lotManagement();
        await this._miscellaneousFieldsManagement();
        this._initPackingUnitFields();
        this._serialNumberManagement();
    }

    private async _onChangeBody() {
        let currentRecord = this.stock.getRecordValue(this.gridBlock.selectedRecordId ?? '');
        let currentQty = Number(this.quantityToMove.value);
        if (!currentQty || !this.startingSerialNumber.value) {
            this.endingSerialNumber.value = null;
            return;
        }

        this.startingSerialNumber.value.code = this.startingSerialNumber.value?.code?.toUpperCase();
        if (currentQty > 1) {
            this.endingSerialNumber.value = this._calculateEndingSerialNumber(
                this.startingSerialNumber.value.code ?? '',
                currentQty,
            );
        } else {
            this.endingSerialNumber.value = this.startingSerialNumber.value.code ?? '';
        }
        if (currentQty > (currentRecord as any).quantityInPackingUnitOrigin) this.addSerialRange.isHidden = true;
        else {
            this.addSerialRange.isHidden = false;
        }

        await this.$.commitValueAndPropertyChanges();
        let validationResult;
        if ((validationResult = await this.endingSerialNumber.validate())) {
            this.$.showToast(validationResult, { type: 'warning' });
        }
    }

    private _lotManagement() {
        const lotNotManaged = this._productSite.product.lotManagementMode === 'notManaged';

        this.lot.isHidden = lotNotManaged;
        this.sublot.isHidden = lotNotManaged;
        this.sublot.isHidden = this._productSite.product.lotManagementMode !== 'lotAndSublot';
    }

    private _initPackingUnitFields() {
        let productPackingList = extractEdges(this._productSite.product.packingUnits.query).filter(productPacking => {
            return !!productPacking.packingUnit?.code;
        });
        this._packingUnits = productPackingList.map(productPacking => {
            return { node: productPacking };
        });

        let productPakingUnitSelectValues = productPackingList.map(productPacking => {
            return `${productPacking.packingUnit.code}`;
        });

        this.packingUnit.options = [this._productSite.product.stockUnit.code, ...productPakingUnitSelectValues];
        this.packingUnitDestination.options = [
            this._productSite.product.stockUnit.code,
            ...productPakingUnitSelectValues,
        ];
    }

    private async _miscellaneousFieldsManagement() {
        if (
            !(this.lot.isHidden || !!this._productSite.product.lotSequenceNumber) &&
            ['lotAndSublot', 'mandatoryLot'].includes(this._productSite.product.lotManagementMode)
        )
            this.lot.isMandatory = true;
        const transaction = this._getSavedInputs().selectedTransaction;
        this.statusDestination.isHidden = !transaction.isStatusChange;
        this.packingUnitDestination.isHidden = !transaction.isUnitChange;
        this.packingUnitToStockUnitConversionFactorDestination.isHidden = !transaction.isUnitChange;
        if (transaction.isStatusChange === true) this.status.isMandatory = true;

        this._selectedStockManagementRules = await findStockManagementRules(
            this._stockSite.code,
            this._productSite.product.productCategory.code,
            '26',
            transaction.stockMovementCode?.code ?? '',
            this,
        );
        this.status.options = await this._getStockStatus();
        this.statusDestination.options = this.status.options;
    }

    private _serialNumberManagement() {
        this.serialNumber.isHidden = ['notManaged', 'issued'].includes(
            this._productSite.product.serialNumberManagementMode,
        );

        if (['receivedIssued', 'globalReceivedIssued'].includes(this._productSite.product.serialNumberManagementMode)) {
            this.serialNumber.isMandatory = true;
            if (this.lot.isHidden === false) this.lot.isMandatory = false;
            if (this.sublot.isHidden === false) this.sublot.isMandatory = false;
            if (this.status.isHidden === false) this.status.isMandatory = false;
            if (this.packingUnit.isHidden === false) this.packingUnit.isMandatory = false;
            if (this.packingUnitDestination.isHidden === false) this.packingUnitDestination.isHidden = true;
            if (this.packingUnitToStockUnitConversionFactorDestination.isHidden === false)
                this.packingUnitToStockUnitConversionFactorDestination.isHidden = true;
        }
    }

    /*
     *
     *  record management functions
     *
     */

    private _saveDetail() {
        let currentStockChangeLines = this._stockChangeLines[this._currentLine];
        this._stockChangeLines[this._currentLine] = {
            ...currentStockChangeLines,
        };
        this._saveStockChange();
    }

    private _saveStockChange() {
        const savedInputs = this._getSavedInputs();
        savedInputs.subcontractTransfer.stockChangeLines = this._stockChangeLines;
        savedInputs.currentLine = this._currentLine;
        this.$.storage.set('mobile-subcontractTransfer', JSON.stringify(savedInputs));
    }

    private _getQuantityInPackingUnitOrigin(record: Partial<Stock>): Number {
        if ((record as any).quantityInPackingUnitOrigin) {
            return (record as any).quantityInPackingUnitOrigin;
        } else {
            if (this._stockChangeLines === undefined) {
                this._stockChangeLines = this._getSavedInputs().subcontractTransfer.stockChangeLines ?? [];
            }
            let _quantityInPackingUnitOrigin: Number = Number(record.quantityInPackingUnit);
            this._stockChangeLines?.forEach(line => {
                if (Number(line.stockId) === Number(record.stockId) && line.lineNumber !== this._currentOperation) {
                    _quantityInPackingUnitOrigin = Number(
                        Number(_quantityInPackingUnitOrigin) -
                            (Number(line.quantityInPackingUnitDestination) *
                                Number(line.packingUnitToStockUnitConversionFactorDestination)) /
                                Number(line.packingUnitToStockUnitConversionFactor),
                    );
                }
            });
            return _quantityInPackingUnitOrigin;
        }
    }

    private _getquantityInPackingUnitRest(record: Partial<Stock>): Number {
        if (this._stockChangeLines === undefined) {
            this._stockChangeLines = this._getSavedInputs().subcontractTransfer.stockChangeLines ?? [];
        }
        if (this._serialNumberManagementMode === undefined) {
            this._serialNumberManagementMode = this._getSavedInputs().selectedProduct?.serialNumberManagementMode;
        }
        let _quantityInPackingUnitRest: Number = this._getQuantityInPackingUnitOrigin(record);
        if (this._serialNumberManagementMode === 'globalReceivedIssued') {
            this._stockChangeLines?.forEach(line => {
                if (Number(line.stockId) === Number(record.stockId) && line.lineNumber === this._currentOperation) {
                    _quantityInPackingUnitRest = Number(
                        Number(_quantityInPackingUnitRest) -
                            (Number(line.quantityInPackingUnitDestination) *
                                Number(line.packingUnitToStockUnitConversionFactorDestination)) /
                                Number(line.packingUnitToStockUnitConversionFactor),
                    );
                }
            });
        }
        return _quantityInPackingUnitRest;
    }

    private _getStockChangeLine(record: Partial<Stock>): Partial<StockChangeLineInput> | undefined {
        if (this._stockChangeLines === undefined) {
            this._stockChangeLines = this._getSavedInputs().subcontractTransfer.stockChangeLines ?? [];
        }
        return this._stockChangeLines?.find(
            line => Number(line.stockId) === Number(record.stockId) && line.lineNumber === this._currentOperation,
        );
    }

    private _getQuantityToMove(record: Partial<Stock>): Number {
        const line = this._getStockChangeLine(record);
        let _quantityToMove: Number;
        if (line) {
            _quantityToMove =
                (Number(line.quantityInPackingUnitDestination) *
                    Number(line.packingUnitToStockUnitConversionFactorDestination)) /
                Number(record.packingUnitToStockUnitConversionFactor);
        } else {
            _quantityToMove = Number(record.quantityInPackingUnit);
        }
        const _quantityInPackingUnitRest = this._getquantityInPackingUnitRest(record);
        if (Number(_quantityToMove) > Number(_quantityInPackingUnitRest)) {
            _quantityToMove = Number(_quantityInPackingUnitRest);
        }
        return _quantityToMove;
    }

    private _getPackingUnitToStockUnitConversionFactorDestination(record: Partial<Stock>): Number | undefined {
        const line = this._getStockChangeLine(record);
        if (line) {
            return Number(line.packingUnitToStockUnitConversionFactorDestination);
        } else {
            return Number(record.packingUnitToStockUnitConversionFactor);
        }
    }

    private _getPackingUnitDestination(record: Partial<Stock>): Partial<UnitOfMeasure> | undefined {
        const line = this._getStockChangeLine(record);
        if (line) {
            return { code: line.packingUnitDestination };
        } else {
            return undefined;
        }
    }

    private _getStatusDestination(record: Partial<Stock>): String | undefined {
        const line = this._getStockChangeLine(record);
        if (line) {
            return line.statusDestination;
        } else {
            return '';
        }
    }

    private _calculateEndingSerialNumber(startingSerialNumber: string, quantity: number): string {
        return startingSerialNumber.replace(/\d+$/, match => {
            const endingNumber = (Number(match) + quantity - 1).toString();
            const lengthDiff = Math.max(endingNumber.length - match.length, 0);
            return endingNumber.padStart(match.length + lengthDiff, '0');
        });
    }

    private async _getStockStatus(): Promise<string[]> {
        const selectedStatus: { _regex: string }[] = [];
        this._selectedStockManagementRules.authorizedSubstatus.split(',').forEach(function (status) {
            selectedStatus.push({ _regex: getRegExp(status).source });
        });
        const response = await this.$.graph
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
                    '@sage/x3-stock/pages__mobile_subcontract_transfer_details__notification__invalid_stock_status_error',
                    'No stock status',
                ),
            );
        }
        return response.edges.map((stockStatus: any) => stockStatus.node.code);
    }
}
