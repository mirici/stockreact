import { Product, ProductSite, SerialNumberManagement, UnitOfMeasure } from '@sage/x3-master-data-api';
import { dialogMessage } from '@sage/x3-master-data/lib/client-functions/dialogs';
import { GraphApi, MiscellaneousIssueLineInput } from '@sage/x3-stock-api';
import {
    LicensePlateNumber,
    Location,
    Lot,
    LotsSites,
    MobileSettings,
    SerialNumber,
    Stock,
    StockManagementRules,
    StockSearchFilter,
    StockStatus,
} from '@sage/x3-stock-data-api';
import { getCountSerialNumber } from '@sage/x3-stock-data/lib/client-functions/get-count-serial-number';
import { Site } from '@sage/x3-system-api';
import { Dict, ExtractEdgesPartial, extractEdges } from '@sage/xtrem-client';
import * as ui from '@sage/xtrem-ui';
import { getProductSite } from '../client-functions/get-product-site';
import { GetNumberOfDecimals } from '../client-functions/get-unit-number-decimals';
import {
    generateStockTableFilter,
    handleFilterOnChange,
    managePages,
    removeFilters,
} from '../client-functions/manage-pages';
import {
    _calculateEndingSerialNumber,
    _calculateLineQuantity,
    _fieldsManagement,
    _getQuantityInPackingUnitOrigin,
    _getQuantityToMove,
    _getSavedInputs,
    _getquantityInPackingUnitRest,
    _isLineToRecord,
    _isStockJournalToRecord,
    _onChangeBody,
    _onRowClick,
    _onRowSelected,
    _onRowUnselected,
    _saveDetail,
    _saveMiscellaneousIssue,
    savedOriginalStockLines,
    originalStockLine,
    packingUnit,
} from '../client-functions/miscellaneous-issue-details-control';
import { integer } from '@sage/xtrem-shared';

// Key to use with Composite Data Gs1 for this application
// const adcApplicationGs1Key = 'ADCInventoryMiscellaneousIssueGs1Key';

type DeepPartial<T> = T extends Object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;
type PartialLocation = DeepPartial<Location>;

const hideWhenEmptyValue = (value: any) => {
    return typeof value !== 'number' && !value; // we don't want to hide numeric field with value of 0
};

/** Created with X3 Etna Studio at 2020-01-20T10:46:11.764Z */
@ui.decorators.page<MobileMiscellaneousIssueDetails>({
    title: 'Miscellaneous issue',
    subtitle: 'Enter stock details',
    module: 'x3-stock',
    node: '@sage/x3-master-data/ProductSite',
    mode: 'default',
    isTitleHidden: true,
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
        if (!_getSavedInputs(this)?.selectedProduct) {
            // this.clearAllCompositeDataAndStorage(adcApplicationGs1Key);
            // return;
        }
        this._stockSite = JSON.parse(this.$.queryParameters.stockSite as string);

        // Form an array of stock input settings in the order from stockField1 to stockField8
        const mobileSettings: MobileSettings = JSON.parse(this.$.queryParameters.mobileSettings as string);
        this._stockFieldSettings = [
            mobileSettings.stockField1,
            mobileSettings.stockField2,
            mobileSettings.stockField3,
            mobileSettings.stockField4,
            mobileSettings.stockField5,
            mobileSettings.stockField6,
            mobileSettings.stockField7,
            mobileSettings.stockField8,
        ]; // to guarantee the ordering of the mobileSettings field
        this._miscellaneousIssueLines = _getSavedInputs(this).miscellaneousIssue.miscellaneousIssueLines ?? [];
        this._currentLine = _getSavedInputs(this).currentLine;
        this._currentDetail = _getSavedInputs(this).currentDetail;
        this._currentOperation = _getSavedInputs(this).currentOperation;
        this._serialNumberManagementMode = _getSavedInputs(this).selectedProduct?.serialNumberManagementMode;
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
            ui.localize('@sage/x3-stock/pages__settings__mandatory-settings-missing', 'Mandatory settings missing.'),
            this._stockFieldSettings,
        );

        savedOriginalStockLines(this);
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
// export class MobileMiscellaneousIssueDetails extends SupportServiceManagementGs1Page<GraphApi> {
export class MobileMiscellaneousIssueDetails extends ui.Page<GraphApi> {
    /*
     *
     *  Technical properties
     *
     */

    _packingUnits: packingUnit[];
    _productSite: ProductSite;
    _currentLine: number | undefined = 0;
    _currentDetail: number | undefined = 0;
    _currentOperation: number | undefined;
    _miscellaneousIssueLines: Partial<MiscellaneousIssueLineInput>[];
    _selectedLocation: PartialLocation;
    _stockFieldSettings: StockSearchFilter[];
    _stockSite: Site;
    _serialNumberManagementMode: SerialNumberManagement | undefined;
    _selectedStockManagementRules: StockManagementRules;
    _originalStockLines: originalStockLine[];

    /*
     *
     *  Technical fields
     *
     */

    @ui.decorators.referenceField<MobileMiscellaneousIssueDetails, Product>({
        node: '@sage/x3-master-data/Product',
        valueField: 'code',
        isTransient: false,
        isTitleHidden: true,
        //        isReadOnly: true,
        isDisabled: true,
        canFilter: false,
        columns: [
            ui.nestedFields.select({
                bind: 'lotManagementMode',
                optionType: '@sage/x3-stock-data/LotManagementMode',
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
                optionType: '@sage/x3-stock-data/StockVersionMode',
                isHidden: true,
            }),
            ui.nestedFields.reference<MobileMiscellaneousIssueDetails, Product, UnitOfMeasure>({
                node: '@sage/x3-master-data/UnitOfMeasure',
                bind: 'stockUnit',
                valueField: 'code',
                isHidden: true,
            }),
            ui.nestedFields.reference<MobileMiscellaneousIssueDetails, Product, UnitOfMeasure>({
                node: '@sage/x3-master-data/UnitOfMeasure',
                bind: 'stockUnit',
                valueField: 'numberOfDecimals',
                isHidden: true,
            }),
        ],
    })
    product: ui.fields.Reference<Product>;

    @ui.decorators.checkboxField<MobileMiscellaneousIssueDetails>({
        bind: 'isLocationManaged',
        isTransient: false,
        isHidden: true,
    })
    isLocationManaged: ui.fields.Checkbox;

    @ui.decorators.checkboxField<MobileMiscellaneousIssueDetails>({
        bind: 'isLicensePlateNumberManaged',
        isTransient: false,
        isHidden: true,
    })
    isLicensePlateNumberManaged: ui.fields.Checkbox;

    @ui.decorators.textField<MobileMiscellaneousIssueDetails>({
        isDisabled: true,
        isTransient: true,
        size: 'small',
    })
    localizedDescription: ui.fields.Text;

    @ui.decorators.textField<MobileMiscellaneousIssueDetails>({
        isDisabled: true,
        isTransient: true,
        prefix: 'Site',
    })
    site: ui.fields.Text;

    /*
     *
     *  Page Actions
     *
     */

    @ui.decorators.pageAction<MobileMiscellaneousIssueDetails>({
        title: 'Next',
        shortcut: ['f2'], // TODO Implement: What should the shortcut be for this button?
        buttonType: 'primary',
        async onClick() {
            if (this.stock.selectedRecords.length > 0) {
                await this.$.commitValueAndPropertyChanges();
                this.$.setPageClean();
                const savedInputs = _getSavedInputs(this);
                savedInputs.currentLine = this._currentLine;
                savedInputs.currentDetail = this._currentDetail;
                this.$.storage.set('mobile-miscellaneousIssue', JSON.stringify(savedInputs));
                this.$.router.goTo('@sage/x3-stock/MobileMiscellaneousIssue', { ReturnFromDetail: 'yes' });
            } else {
                await dialogMessage(
                    this,
                    'error',
                    ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                    ui.localize(
                        '@sage/x3-stock/pages__stock_change_lines__notification__no_stock_error',
                        `Select at least one stock line.`,
                    ),
                );
            }
        },
    })
    nextButton: ui.PageAction;

    @ui.decorators.pageAction<MobileMiscellaneousIssueDetails>({
        title: 'Cancel',
        //shortcut: ['f2'], // TODO Implement: What should the shortcut be for this button?
        buttonType: 'secondary',
        async onClick() {
            const currentRecord = this.stock.getRecordValue(this.gridBlock.selectedRecordId);
            if (currentRecord) {
                let i: number;
                i = 0;
                this._miscellaneousIssueLines.forEach(line => {
                    if (
                        _isLineToRecord(this, currentRecord, line) &&
                        line.lineNumber === this._currentOperation
                    ) {
                        let j: number;
                        j = 0;
                        line.stockDetails?.forEach(stock => {
                            if (_isStockJournalToRecord(this, currentRecord, stock)) {
                                line.stockDetails?.splice(j, 1);
                            }
                            j++;
                        })

                    }
                });
            }
            _saveMiscellaneousIssue(this);

            const originalStockLine = this._originalStockLines.find(line => currentRecord?._id === line.id);
            (currentRecord as any).quantityToMove = originalStockLine?.quantityInPackingUnit;
            (currentRecord as any).packingUnit = originalStockLine?.packingUnit;
            (currentRecord as any).quantityInStockUnit = originalStockLine?.quantityInStockUnit;
            this.packingUnitToIssue.value = null;

            this.stock.unselectRecord(this.gridBlock.selectedRecordId);
            this.stock.setRecordValue(currentRecord);

            this.$.detailPanel.isHidden = true;
            this.nextButton.isHidden = false;
        },
    })
    helperCancelButton: ui.PageAction;

    @ui.decorators.pageAction<MobileMiscellaneousIssueDetails>({
        title: 'Select',
        //shortcut: ['f2'], // TODO Implement: What should the shortcut be for this button?
        buttonType: 'primary',
        onError(error) {
            if (
                error.message ===
                '@sage/x3-stock/pages__stock_change_lines__notification__error_startingSerialNumberMandatory'
            ) {
                return ui.localize(
                    '@sage/x3-stock/pages__stock_change_lines__notification__error_startingSerialNumberMandatory',
                    'You need to select the serial number and add it first.',
                );
            } else {
                return error;
            }
        },
        async onClick() {
            await this.$.commitValueAndPropertyChanges();

            const errors: ui.ValidationResult[] = await this.stock.validateWithDetails();
            if (errors.length === 0) {
                const currentRecord: any = this.stock.getRecordValue(this.gridBlock.selectedRecordId);
                if (this._productSite.product.serialNumberManagementMode === 'globalReceivedIssued') {
                    if (this.serialNumberLines.value.length === 0) {
                        throw new Error(
                            '@sage/x3-stock/pages__stock_change_lines__notification__error_startingSerialNumberMandatory',
                        );
                    }
                } else {
                    if (Number(this.quantityToMove.value) <= 0) {
                        await dialogMessage(
                            this,
                            'error',
                            ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                            ui.localize(
                                '@sage/x3-stock/pages__stock_change_lines__quantityInPackingUnitDestination_must_be_greater_than_0',
                                'The quantity to issue must be greater than 0.',
                            ),
                        );
                        return;
                    }
                }
                if (
                    (this.quantityToMove.value ? Number(this.quantityToMove.value) : 0) *
                        (this.packingUnitToStockUnitConversionFactorToIssue.value
                            ? Number(this.packingUnitToStockUnitConversionFactorToIssue.value)
                            : 1) >
                    Number(currentRecord.quantityInStockUnit - currentRecord.allocatedQuantity)
                ) {
                    await dialogMessage(
                        this,
                        'error',
                        ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                        `${ui.localize(
                            '@sage/x3-stock/pages__stock_change_lines__enter_a_quantity_less_than_or_equal_to_the_stock_quantity_minus_allocated_quantity',
                            'Enter a quantity less than or equal to the stock quantity minus the allocated quantity.',
                        )}`,
                    );
                    this.quantityToMove.value = null;
                    return;
                }
                this.stock.selectRecord(this.gridBlock.selectedRecordId);
                if (this._productSite.product.serialNumberManagementMode !== 'globalReceivedIssued') {
                    let lineIndex: number = this._miscellaneousIssueLines.findIndex(
                        line =>
                            _isLineToRecord(this, currentRecord, line) && line.lineNumber === this._currentOperation,
                    );
                    if (lineIndex === -1) {
                        lineIndex =
                            this._miscellaneousIssueLines.push({
                                product: this.product.value.code,
                                productDescription: this.product.value.description1,
                                quantityInPackingUnit: 0,
                                packingUnit: this.packingUnitToIssue.value
                                    ? this.packingUnitToIssue.value
                                    : currentRecord.packingUnit.code,
                                packingUnitToStockUnitConversionFactor: Number(
                                    this.packingUnitToStockUnitConversionFactorToIssue.value,
                                ),
                                lineNumber: this._currentOperation,
                                stockDetails: [],
                            }) - 1;
                    } else {
                        this._miscellaneousIssueLines[lineIndex].packingUnit = this.packingUnitToIssue.value
                            ? this.packingUnitToIssue.value
                            : currentRecord.packingUnit.code;
                        this._miscellaneousIssueLines[lineIndex].packingUnitToStockUnitConversionFactor = Number(
                            this.packingUnitToStockUnitConversionFactorToIssue.value,
                        );
                        this._miscellaneousIssueLines[lineIndex].quantityInPackingUnit = Number(
                            this.quantityToMove.value,
                        );
                    }
                    const detailIndex = this._miscellaneousIssueLines[lineIndex].stockDetails.findIndex(detail =>
                        _isStockJournalToRecord(this, currentRecord, detail),
                    );
                    if (detailIndex > -1) {
                        this._miscellaneousIssueLines[lineIndex].stockDetails[detailIndex].quantityInPackingUnit =
                        (Number(this.quantityToMove.value) *
                            (this.packingUnitToStockUnitConversionFactorToIssue.value
                                ? this.packingUnitToStockUnitConversionFactorToIssue.value
                                : 0)) /
                            (currentRecord.packingUnitToStockUnitConversionFactor
                                ? currentRecord.packingUnitToStockUnitConversionFactor
                                : 1),
                            (this._miscellaneousIssueLines[lineIndex].stockDetails[detailIndex].quantityInStockUnit =
                                Number(this.quantityToMove.value) *
                                Number(this.packingUnitToStockUnitConversionFactorToIssue.value));
                    } else {
                        this._miscellaneousIssueLines[lineIndex].stockDetails?.push({
                            packingUnit: currentRecord.packingUnit?.code,
                            packingUnitToStockUnitConversionFactor:
                                currentRecord.packingUnitToStockUnitConversionFactor,
                            quantityInPackingUnit:
                                Number(this.quantityToMove.value),
                            quantityInStockUnit:
                                Number(this.quantityToMove.value) *
                                Number(this.packingUnitToStockUnitConversionFactorToIssue.value),
                            location: currentRecord.location?.code,
                            licensePlateNumber: currentRecord.licensePlateNumber?.code ?? undefined,
                            lot: currentRecord.lot ?? undefined,
                            status: currentRecord.status?.code ?? undefined,
                            sublot: currentRecord.sublot ?? undefined,
                            serialNumber: currentRecord.serialNumber ?? undefined,
                            identifier1: currentRecord.identifier1 ?? undefined,
                            identifier2: currentRecord.identifier2 ?? undefined,
                            stockCustomField1: currentRecord.stockCustomField1 ?? undefined,
                            stockCustomField2: currentRecord.stockCustomField2 ?? undefined,
                            stockUnit: this.product.value?.stockUnit?.code,
                        });
                    }
                    _calculateLineQuantity(this._miscellaneousIssueLines[lineIndex], this);
                    _saveDetail(this);
                }

                let qtyTotalInPackingUnit: number;
                qtyTotalInPackingUnit = 0;
                this._miscellaneousIssueLines.forEach(line => {
                    if (_isLineToRecord(this, currentRecord, line) && line.lineNumber === this._currentOperation) {
                        line.stockDetails?.forEach(detail => {
                            if (_isStockJournalToRecord(this, currentRecord, detail)) {
                                qtyTotalInPackingUnit = qtyTotalInPackingUnit + Number(detail.quantityInPackingUnit)
                            }
                        });
                    }
                });

                const originalStockLine = this._originalStockLines?.find(line => this.gridBlock.selectedRecordId === line.id);
                currentRecord.quantityToMove = this.quantityToMove.value;
                currentRecord.quantityInPackingUnit = originalStockLine?.quantityInPackingUnit;

                currentRecord.quantityInStockUnit =
                    qtyTotalInPackingUnit * Number(currentRecord.packingUnitToStockUnitConversionFactor);
                const packingUnitIndex = this._packingUnits
                    .map(packingUnit => packingUnit.node.packingUnit.code)
                    .indexOf(this.packingUnitToIssue.value ?? '');
                if (packingUnitIndex !== -1) {
                    const selectedUnit = this._packingUnits[packingUnitIndex].node;
                    currentRecord.packingUnit = selectedUnit.packingUnit;
                } else {
                    currentRecord.packingUnit.code = this.packingUnitToIssue.value;
                }

                this.stock.setRecordValue(currentRecord);
                this.packingUnitToIssue.value = null;
            }
            this.$.detailPanel.isHidden = true;

            this.nextButton.isHidden = false;
        },
    })
    helperSelectButton: ui.PageAction;

    @ui.decorators.pageAction<MobileMiscellaneousIssueDetails>({
        icon: 'add',
        title: 'Add...',
        onError(error) {
            switch (error.message) {
                case '@sage/x3-stock/pages__mobile_miscellaneous-issue-details_lines__notification__error_startingSerialNumber': {
                    return ui.localize(
                        '@sage/x3-stock/pages__mobile_miscellaneous-issue-details_lines__notification__error_startingSerialNumber',
                        'The serial number is mandatory',
                    );
                }
                case '@sage/x3-stock/serial-number-range-overlap': {
                    return ui.localize(
                        '@sage/x3-stock/serial-number-range-overlap',
                        'The serial numbers are overlapping. Enter another starting or ending serial number.',
                    );
                }
                case '@sage/x3-stock/pages__mobile_miscellaneous-issue-details__same-amount-serial-numbers-in-the-range-to-match-quantity-to-move': {
                    return ui.localize(
                        '@sage/x3-stock/pages__mobile_miscellaneous-issue-details__same-amount-serial-numbers-in-the-range-to-match-quantity-to-move',
                        'Select the same amount of serial numbers in the range to match the quantity to issue.',
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
                    '@sage/x3-stock/pages__mobile_miscellaneous-issue-details_lines__notification__error_startingSerialNumber',
                );
            }

            const _productCode = String(this._productSite?.product?.code);
            // check that this will add any duplicates
            const startNumberToAdd = Number(this.startingSerialNumber.value?.code?.match(/\d+$/));
            const endNumberToAdd = Number(this.endingSerialNumber.value?.match(/\d+$/));
            let serialNumberAlreadyUsed: boolean;
            serialNumberAlreadyUsed = false;
            if (
                this.serialNumberLines.value.some(row => {
                    const rowStartMatch = row.startingSerialNumber.match(/\d+$/);
                    const rowEndMatch = Number(row.endingSerialNumber.match(/\d+$/));

                    // check if the 'beginning part' of the serial matches
                    if (
                        row.startingSerialNumber.substring(
                            0,
                            row.startingSerialNumber.length - rowStartMatch.toString().length,
                        ) !==
                        this.startingSerialNumber.value?.code?.substring(
                            0,
                            this.startingSerialNumber.value?.code?.length - startNumberToAdd.toString().length,
                        )
                    )
                        return false;

                    return Number(startNumberToAdd) <= rowEndMatch && endNumberToAdd >= Number(rowStartMatch);
                })
            ) {
                serialNumberAlreadyUsed = true;
            }
            this._miscellaneousIssueLines.forEach(line => {
                const serialNumberPrefix1 = this.startingSerialNumber.value?.code?.match(/^(.*?)(?=\d+$)/);
                if (line.product === _productCode && line.stockDetails?.length && line.stockDetails[0].serialNumber) {
                    const serialNumberPrefix2 = line?.stockDetails[0]?.serialNumber?.match(/^(.*?)(?=\d+$)/)
                    if (serialNumberPrefix1 === serialNumberPrefix2) {
                        const startingSerialNumber = Number(line.stockDetails[0].serialNumber.match(/\d+$/));
                        const endingSerialNumber = Number(
                            _calculateEndingSerialNumber(
                                line.stockDetails[0].serialNumber,
                                Number(line.quantityInPackingUnit),
                            ).match(/\d+$/),
                        );
                        if (
                            Number(startNumberToAdd) <= endingSerialNumber &&
                            Number(endNumberToAdd) >= startingSerialNumber
                        ) {
                            serialNumberAlreadyUsed = true;
                        }
                    }
                }
            });
            if (serialNumberAlreadyUsed) {
                throw new Error('@sage/x3-stock/serial-number-range-overlap');
            }
            if (
                this.endingSerialNumber.value !==
                _calculateEndingSerialNumber(
                    String(this.startingSerialNumber.value?.code),
                    (Number(this.quantityToMove.value) * Number(this.packingUnitToStockUnitConversionFactorToIssue.value)),
                )
            ) {
                throw new Error(
                    '@sage/x3-stock/pages__mobile_miscellaneous-issue-details__same-amount-serial-numbers-in-the-range-to-match-quantity-to-move',
                );
            }
            if (
                (await getCountSerialNumber(
                    this,
                    _productCode,
                    String(this._stockSite?.code),
                    this._stockId.value,
                    String(this.startingSerialNumber.value?.code),
                    String(this.endingSerialNumber.value),
                )) !== (Number(this.quantityToMove.value) * Number(this.packingUnitToStockUnitConversionFactorToIssue.value))
            ) {
                throw new Error('@sage/x3-stock/serial-number-not-sequential');
            }

            const currentRecord: any = this.stock.getRecordValue(this.gridBlock.selectedRecordId);
            this.serialNumberLines.addRecord({
                quantity: Number(this.quantityToMove.value) * Number(this.packingUnitToStockUnitConversionFactorToIssue.value),
                startingSerialNumber: this.startingSerialNumber.value.code,
                endingSerialNumber: this.endingSerialNumber.value,
            });

            let lineIndex: number = this._miscellaneousIssueLines.findIndex(
                line => _isLineToRecord(this, currentRecord, line) && line.lineNumber === this._currentOperation,
            );
            if (lineIndex === -1) {
                lineIndex =
                    this._miscellaneousIssueLines.push({
                        product: this.product.value.code,
                        productDescription: this.product.value.description1,
                        quantityInPackingUnit: 0,
                        packingUnit: this.packingUnitToIssue.value
                            ? this.packingUnitToIssue.value : currentRecord.packingUnit.code,
                        packingUnitToStockUnitConversionFactor: Number(
                            this.packingUnitToStockUnitConversionFactorToIssue.value,
                        ),
                        lineNumber: this._currentOperation,
                        stockDetails: [],
                    }) - 1;
            }

            this._miscellaneousIssueLines[lineIndex].stockDetails?.push({
                packingUnit: currentRecord.packingUnit?.code,
                packingUnitToStockUnitConversionFactor: currentRecord.packingUnitToStockUnitConversionFactor,
                quantityInPackingUnit:
                    (Number(this.quantityToMove.value) *
                        (this.packingUnitToStockUnitConversionFactorToIssue.value
                            ? this.packingUnitToStockUnitConversionFactorToIssue.value
                            : 0)) /
                    (currentRecord.packingUnitToStockUnitConversionFactor
                        ? currentRecord.packingUnitToStockUnitConversionFactor
                        : 1),
                quantityInStockUnit:
                    Number(this.quantityToMove.value) *
                    Number(this.packingUnitToStockUnitConversionFactorToIssue.value),
                location: currentRecord.location?.code,
                licensePlateNumber: currentRecord.licensePlateNumber?.code ?? undefined,
                lot: currentRecord.lot ?? undefined,
                status: currentRecord.status?.code ?? undefined,
                sublot: currentRecord.sublot ?? undefined,
                serialNumber: this.startingSerialNumber.value?.code ?? undefined,
                identifier1: currentRecord.identifier1 ?? undefined,
                identifier2: currentRecord.identifier2 ?? undefined,
                stockCustomField1: currentRecord.stockCustomField1 ?? undefined,
                stockCustomField2: currentRecord.stockCustomField2 ?? undefined,
                stockUnit: this.product.value?.stockUnit?.code,
            });
            _calculateLineQuantity(this._miscellaneousIssueLines[lineIndex], this);
            _saveDetail(this);
            // currentRecord.quantityToMove = String(0);
            // this.quantityToMove.value = 0;
            this.stock.setRecordValue(currentRecord);
            this.startingSerialNumber.value = null;
            this.endingSerialNumber.value = null;

            await this.$.commitValueAndPropertyChanges();
        },
    })
    addSerialRange: ui.PageAction;

    /*
     *
     *  Sections
     *
     */

    @ui.decorators.section<MobileMiscellaneousIssueDetails>({
        isTitleHidden: true,
    })
    mainSection: ui.containers.Section;

    @ui.decorators.section<MobileMiscellaneousIssueDetails>({
        title: 'Stock change',
        isTitleHidden: true,
    })
    detailPanelSection: ui.containers.Section;

    @ui.decorators.section<MobileMiscellaneousIssueDetails>({
        isTitleHidden: true,
    })
    sectionHeader: ui.containers.Section;

    /*
     *
     *  Blocks
     *
     */

    @ui.decorators.block<MobileMiscellaneousIssueDetails>({
        isTitleHidden: true,
        parent() {
            return this.mainSection;
        },
    })
    bodyBlock: ui.containers.Block;

    @ui.decorators.block<MobileMiscellaneousIssueDetails>({
        isTitleHidden: true,
        parent() {
            return this.detailPanelSection;
        },
    })
    detailsBlock: ui.containers.Block;

    @ui.decorators.gridRowBlock<MobileMiscellaneousIssueDetails>({
        isTitleHidden: true,
        parent() {
            return this.detailPanelSection;
        },
        boundTo() {
            return this.stock;
        },
        fieldFilter() {
            return false;
        },
        readOnlyOverride() {
            return undefined;
        },
    })
    gridBlock: ui.containers.GridRowBlock;

    @ui.decorators.block<MobileMiscellaneousIssueDetails>({
        isTitleHidden: true,
        parent() {
            return this.detailPanelSection;
        },
    })
    quantityBlock: ui.containers.Block;

    @ui.decorators.block<MobileMiscellaneousIssueDetails>({
        isTitleHidden: true,
        parent() {
            return this.detailPanelSection;
        },
    })
    serialNumberBlock: ui.containers.Block;

    @ui.decorators.block<MobileMiscellaneousIssueDetails>({
        isTitleHidden: true,
        parent() {
            return this.detailPanelSection;
        },
    })
    destinationBlock: ui.containers.Block;

    @ui.decorators.block<MobileMiscellaneousIssueDetails>({
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

    @ui.decorators.referenceField<MobileMiscellaneousIssueDetails, LicensePlateNumber>({
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

    @ui.decorators.referenceField<MobileMiscellaneousIssueDetails, Location>({
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

    @ui.decorators.referenceField<MobileMiscellaneousIssueDetails, LotsSites>({
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
                product: { code: this.product.value?.code },
                storageSite: { code: this.site.value ?? undefined },
            };
        },
        /*  async onInputValueChange(this, rawData: string): Promise<void> {
            await this.scanBarCode(this.lot, rawData);
        }, */
        async onChange() {
            await this._onChangeLot();
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

    @ui.decorators.referenceField<MobileMiscellaneousIssueDetails, LotsSites>({
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
                product: { code: this.product.value?.code },
                storageSite: { code: this.site.value ?? undefined },
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

    @ui.decorators.referenceField<MobileMiscellaneousIssueDetails, SerialNumber>({
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
                product: { code: this.product?.value?.code },
                stockSite: { code: this.site.value ?? undefined },
                issueDocumentId: '',
            };
        },
        /*  async onInputValueChange(this, rawData: string): Promise<void> {
            await this.scanBarCode(this.serialNumber, rawData);
        }, */
        async onChange() {
            await this._onChangeSerialNumber();
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

    @ui.decorators.selectField<MobileMiscellaneousIssueDetails>({
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

    @ui.decorators.selectField<MobileMiscellaneousIssueDetails>({
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

    @ui.decorators.numericField<MobileMiscellaneousIssueDetails>({
        parent() {
            return this.bodyBlock;
        },
        title: 'Conversion factor',
        placeholder: 'Enter...',
        isTransient: true,
        isMandatory: false,
        isFullWidth: true,
        min: 0,
        async onChange() {
            await handleFilterOnChange(this, this.packingUnitToStockUnitConversionFactor);
        },
    })
    packingUnitToStockUnitConversionFactor: ui.fields.Numeric;

    @ui.decorators.textField<MobileMiscellaneousIssueDetails>({
        parent() {
            return this.bodyBlock;
        },
        title: 'Identifier 1',
        placeholder: 'Scan...',
        validation: /^$|^[^|]+$/,
        isTransient: true,
        isMandatory: false,
        isFullWidth: true,
        // isHidden: true,
        async onChange() {
            await handleFilterOnChange(this, this.identifier1);
        },
    })
    identifier1: ui.fields.Text;

    @ui.decorators.textField<MobileMiscellaneousIssueDetails>({
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

    @ui.decorators.textField<MobileMiscellaneousIssueDetails>({
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

    @ui.decorators.textField<MobileMiscellaneousIssueDetails>({
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

    @ui.decorators.tableField<MobileMiscellaneousIssueDetails, Stock>({
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
                postfix(_value, rowValue?: Dict<any>) {
                    const currentRecord: any = (this.gridBlock?.selectedRecordId) ? this.stock.getRecordValue(this.gridBlock?.selectedRecordId ?? '') : undefined;
                    if (currentRecord && rowValue?.stockId === currentRecord.stockId) {
                            if (this.packingUnitToIssue.value) {
                                return ` ${String(this.packingUnitToIssue.value)}`;
                            } else {
                                return ` ${String(currentRecord.packingUnit.code ?? rowValue?.packingUnit?.code ?? '')}`;
                            }
                    } else {
                        return ` ${String(rowValue?.packingUnit?.code)}`;
                    }
                },
                title: 'Quantity to move', // this is important to display a title in the grid row block
                isTitleHidden: false,
                isMandatory: false,
                isFullWidth: true,
                max(rowValue: Stock) {
                    return (rowValue as any).quantityInPackingUnitOrigin;
                },
                scale(value, rowValue?: Dict<any>) {
                    return rowValue?.packingUnit?.numberOfDecimals ?? 0;
                },
            }),
            ui.nestedFields.numeric({
                bind: 'quantityInPackingUnit',
                isHidden: false,
                isTitleHidden: true,
                isTransient: false,
                postfix(_value, rowValue?: Dict<any>) {
                    const originalStockLine = this._originalStockLines.find(line => rowValue?._id === line.id);
                    return originalStockLine?.packingUnit.code;
                },
                scale(value, rowValue) {
                    const originalStockLine = this._originalStockLines.find(line => rowValue?._id === line.id);
                    return originalStockLine?.packingUnit?.numberOfDecimals ?? 0;
                },
            }),
            ui.nestedFields.numeric({
                bind: 'quantityInPackingUnitRest' as any,
                isHidden: true,
                isTitleHidden: true,
                isTransient: true,
            }),
            ui.nestedFields.reference<MobileMiscellaneousIssueDetails, Stock, ProductSite>({
                bind: 'product',
                valueField: { product: { code: true } },
                node: '@sage/x3-master-data/ProductSite',
                isReadOnly: true,
                isHidden: true,
                columns: [
                    ui.nestedFields.text({
                        bind: { product: { code: true } },
                    }),
                    ui.nestedFields.text({
                        bind: { product: { serialNumberManagementMode: true } },
                    }),
                ],
            }),
            ui.nestedFields.reference<MobileMiscellaneousIssueDetails, Stock, LicensePlateNumber>({
                bind: 'licensePlateNumber',
                valueField: 'code',
                node: '@sage/x3-stock-data/LicensePlateNumber',
                isReadOnly: true,
                isHidden: true,
                columns: [
                    ui.nestedFields.text({
                        bind: 'code',
                    }),
                ],
            }),
            ui.nestedFields.reference<MobileMiscellaneousIssueDetails, Stock, Location>({
                bind: 'location',
                valueField: 'code',
                node: '@sage/x3-stock-data/Location',
                isReadOnly: true,
                isHidden: false,
                columns: [
                    ui.nestedFields.text({
                        bind: 'code',
                    }),
                ],
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
            ui.nestedFields.reference<MobileMiscellaneousIssueDetails, Stock, StockStatus>({
                bind: 'status',
                valueField: 'code',
                node: '@sage/x3-stock-data/StockStatus',
                isHidden() {
                    return this.status.isHidden ?? false;
                },
                columns: [
                    ui.nestedFields.text({
                        bind: 'code',
                    }),
                ],
            }),
            ui.nestedFields.reference<MobileMiscellaneousIssueDetails, Stock, UnitOfMeasure>({
                bind: 'packingUnit',
                valueField: 'code',
                node: '@sage/x3-master-data/UnitOfMeasure',
                isHidden: true,
                columns: [
                    ui.nestedFields.text({
                        bind: 'code',
                    }),
                    ui.nestedFields.numeric({
                        bind: 'numberOfDecimals',
                    }),
                ],
            }),
            ui.nestedFields.reference<MobileMiscellaneousIssueDetails, Stock, UnitOfMeasure>({
                bind: 'originalPackingUnit',
                valueField: 'code',
                node: '@sage/x3-master-data/UnitOfMeasure',
                isHidden: true,
                columns: [
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
            ui.nestedFields.text({
                bind: 'stockId',
                isReadOnly: true,
                isHidden: true,
            }),
            ui.nestedFields.technical<MobileMiscellaneousIssueDetails, Stock, Lot>({
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
            ui.nestedFields.numeric({
                bind: 'quantityInStockUnit',
                isHidden: true,
                isTitleHidden: true,
                isTransient: false,
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
            ui.nestedFields.technical({
                bind: 'originalQuantityInStockUnit',
            }),
        ],
        onError(error) {
            if (error.message === '@sage/x3-stock/serial-number-not-sequential') {
                return ui.localize(
                    '@sage/x3-stock/serial-number-not-sequential',
                    'The serial numbers are not sequential. Check your entry.',
                );
            } else {
                return error;
            }
        },
        async onRowSelected(recordId: string, rowItem: Stock) {
            await _onRowSelected(this, recordId, rowItem);
        },
        async onRowUnselected(recordId: string, rowItem: Stock) {
            await _onRowUnselected(this, recordId, rowItem);
        },
        sortColumns(firstColumn, secondColumn) {
            if (firstColumn.bind === secondColumn.bind) return 0;
            if (firstColumn.bind === 'quantityToMove') {
                return secondColumn.bind === this._stockFieldSettings[0] ? 1 : -1;
            } else if (secondColumn.bind === 'quantityToMove') {
                return firstColumn.bind === this._stockFieldSettings[0] ? -1 : 1;
            }

            for (const stockFieldSetting of Object.keys(this._stockFieldSettings)) {
                if (!stockFieldSetting || stockFieldSetting === 'none') break;
                if (firstColumn.bind === stockFieldSetting) return -1;
                if (secondColumn.bind === stockFieldSetting) return 1;
            }

            return 1;
        },
        mapServerRecord(record: Partial<Stock>) {
            return {
                ...record,
                quantityInPackingUnitOrigin: _getQuantityInPackingUnitOrigin(this, record),
                quantityInPackingUnitRest: _getquantityInPackingUnitRest(this, record),
                quantityToMove: _getQuantityToMove(this, record).toString(),
                lotReferenceExpirationDate: record.lotReference?.expirationDate,
                lotReferenceMajorVersion: record.lotReference?.majorVersion?.code,
                lotReferenceUseByDate: record.lotReference?.useByDate,
                globalSerialNumber: ui.localize('@sage/x3-stock/label-view-all', 'View list'),
            };
        },

        async onRowClick(recordId: string, rowItem: Stock) {
            await _onRowClick(this, recordId, rowItem);
        },
    })
    stock: ui.fields.Table<Stock>;

    @ui.decorators.detailListField<MobileMiscellaneousIssueDetails, Stock>({
        parent() {
            return this.detailsBlock;
        },
        node: '@sage/x3-stock-data/Stock',
        isTransient: true,
        isFullWidth: true,
        isTitleHidden: true,
        fields: [
            ui.nestedFields.reference<MobileMiscellaneousIssueDetails, Stock, ProductSite>({
                bind: 'product',
                valueField: { product: { code: true } },
                node: '@sage/x3-master-data/ProductSite',
                title: 'Product',
                isReadOnly: true,
                isHidden: false,
            }),
            ui.nestedFields.reference<MobileMiscellaneousIssueDetails, Stock, LicensePlateNumber>({
                bind: 'licensePlateNumber',
                valueField: 'code',
                node: '@sage/x3-stock-data/LicensePlateNumber',
                title: 'License plate number',
                isReadOnly: true,
                isHidden: hideWhenEmptyValue,
            }),
            ui.nestedFields.reference<MobileMiscellaneousIssueDetails, Stock, Location>({
                bind: 'location',
                valueField: 'code',
                node: '@sage/x3-stock-data/Location',
                title: 'Location',
                isReadOnly: true,
                isHidden: false,
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
            ui.nestedFields.text({
                bind: 'lotReferenceMajorVersion' as any,
                title: 'Major version',
                isReadOnly: true,
                isHidden: hideWhenEmptyValue,
            }),
            ui.nestedFields.date({
                bind: 'lotReferenceExpirationDate' as any,
                title: 'Expiration date',
                isReadOnly: true,
                isHidden(value: Date) {
                    return this.product.value.expirationManagementMode === 'notManaged' || !value;
                },
            }),
            ui.nestedFields.date({
                bind: 'lotReferenceUseByDate' as any,
                title: 'Use-by date',
                isReadOnly: true,
                isHidden(value: Date) {
                    return this.product.value.expirationManagementMode === 'notManaged' || !value;
                },
            }),
            ui.nestedFields.reference<MobileMiscellaneousIssueDetails, Stock, Lot>({
                node: '@sage/x3-stock-data/Lot',
                bind: 'lotReference',
                valueField: 'lotCustomField1',
                title: 'Lot custom field 1',
                isReadOnly: true,
                isHidden(value: Lot) {
                    return !value?.lotCustomField1;
                },
            }),
            ui.nestedFields.reference<MobileMiscellaneousIssueDetails, Stock, Lot>({
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
                async onClick(_id) {
                    this.$.setPageClean();
                    this.$.router.goTo('@sage/x3-stock/MobileGlobalSerialDetails', {
                        product: String(this.product.value?.code),
                        stockId: String(this.stock.getRecordValue(this.gridBlock.selectedRecordId)?.stockId),
                        subtitle: String(this.localizedDescription.value),
                    });
                },
            }),
            ui.nestedFields.numeric({
                bind: 'quantityToMove' as any,
                title: 'Quantity to move',
                isReadOnly: true,
                isTransient: true,
                isHidden: true,
                postfix(_value, rowValue?: Dict<any>) {
                    return rowValue?.packingUnit?.code ?? '';
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
                postfix() {
                    const currentRecord =this.stock.getRecordValue(this.gridBlock.selectedRecordId);
                    const originalStockLine = this._originalStockLines.find(line => currentRecord?._id === line.id);
                    return originalStockLine?.packingUnit.code ?? '';
                },
                scale(value, rowValue?: Dict<any>) {
                    return rowValue?.packingUnit?.numberOfDecimals ?? 0;
                },
            }),
            ui.nestedFields.reference<MobileMiscellaneousIssueDetails, Stock, UnitOfMeasure>({
                bind: 'packingUnit',
                node: '@sage/x3-master-data/UnitOfMeasure',
                valueField: 'code',
                title: 'Unit',
                isReadOnly: true,
                isHidden: true,
            }),
            ui.nestedFields.numeric({
                bind: 'packingUnitToStockUnitConversionFactor' as any,
                title: 'Conversion factor',
                isReadOnly: true,
                isHidden: false,
                scale(value, rowValue?: Dict<any>) {
                    const conversionFactor = rowValue?.packingUnitToStockUnitConversionFactor.toString();
                    const  numberOfDec = (conversionFactor.includes('.')) ? conversionFactor.split('.')[1].length : 0;
                    return numberOfDec;
                },
            }),
            ui.nestedFields.numeric({
                bind: 'quantityInStockUnit' as any,
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
                bind: 'allocatedQuantity' as any,
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
            ui.nestedFields.reference<MobileMiscellaneousIssueDetails, Stock, StockStatus>({
                bind: 'status',
                valueField: 'code',
                node: '@sage/x3-stock-data/StockStatus',
                title: 'Status',
                isReadOnly: true,
                isHidden: hideWhenEmptyValue,
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
                bind: 'owner',
                title: 'Owner',
                isReadOnly: true,
                isHidden: true,
            }),
        ],
    })
    stockDetails: ui.fields.DetailList<Stock>;

    @ui.decorators.dropdownListField<MobileMiscellaneousIssueDetails>({
        parent() {
            return this.quantityBlock;
        },
        title: 'Unit',
        width: 'small',
        options: ['UN'],
        placeholder: 'Select...',
        isMandatory: true,
        isTransient: true,
        isDisabled: true,
        async onChange() {
            if (!this.packingUnitToIssue.value) return;
            const selectedValue = this.packingUnitToIssue.value;
            const packingUnitIndex = this._packingUnits
                .map(packingUnit => packingUnit.node.packingUnit.code)
                .indexOf(selectedValue);
            if (packingUnitIndex !== -1) {
                const selectedUnit = this._packingUnits[packingUnitIndex].node;
                this.quantityToMove.scale = selectedUnit.packingUnit.numberOfDecimals;

                this.packingUnitToStockUnitConversionFactorToIssue.value = Number(
                    selectedUnit.packingUnitToStockUnitConversionFactor,
                );
                this.packingUnitToStockUnitConversionFactorToIssue.isDisabled =
                    !selectedUnit.isPackingFactorEntryAllowed;

                const conversionFactor = this.packingUnitToStockUnitConversionFactorToIssue.value.toString();
                const  numberOfDec = (conversionFactor.includes('.')) ? conversionFactor.split('.')[1].length : 0;
                this.packingUnitToStockUnitConversionFactorToIssue.scale = numberOfDec;

            } else {
                this.packingUnitToStockUnitConversionFactorToIssue.value = 1;
                this.packingUnitToStockUnitConversionFactorToIssue.isDisabled = true;
                this.quantityToMove.scale = 0;
            }
            this.quantityToMove.value = null;
        },
    })
    packingUnitToIssue: ui.fields.DropdownList;

    @ui.decorators.numericField<MobileMiscellaneousIssueDetails>({
        parent() {
            return this.quantityBlock;
        },
        title: 'Conversion factor',
        isDisabled: false,
        isMandatory: true,
        placeholder: 'Enter...',
        isTransient: true,
        async onChange() {
            if (!this.packingUnitToStockUnitConversionFactorToIssue.value) return;
            const selectedValue = this.packingUnitToIssue.value ?? '';
            const packingUnitIndex = this._packingUnits
                .map(packingUnit => packingUnit.node.packingUnit.code)
                .indexOf(selectedValue);
            if (packingUnitIndex !== -1) {
                const selectedUnit = this._packingUnits[packingUnitIndex].node;
                this.quantityToMove.scale = selectedUnit.packingUnit.numberOfDecimals;
            } else {
                this.packingUnitToStockUnitConversionFactorToIssue.value = 1;
                this.packingUnitToStockUnitConversionFactorToIssue.isDisabled = true;
                this.quantityToMove.scale = 0;
            }
            this.quantityToMove.value = null;
        },
    })
    packingUnitToStockUnitConversionFactorToIssue: ui.fields.Numeric;

    @ui.decorators.numericField<MobileMiscellaneousIssueDetails>({
        parent() {
            return this.quantityBlock;
        },
        postfix(_value, _rowValue?: Dict<any>) {
            return ` ${this.packingUnitToIssue.value}`;
        },
        title: 'Quantity to issue', // this is important to display a title in the grid row block
        isMandatory: false,
        isFullWidth: true,
        isTransient: true,
        placeholder: 'Enter...',
        scale() {
            return (
                (<any>(<unknown>this.stock.getRecordValue(this.gridBlock?.selectedRecordId ?? '')))?.packingUnit
                    ?.numberOfDecimals ?? 0
            );
        },
        async onChange() {
            const currentRecord: any = this.stock.getRecordValue(this.gridBlock.selectedRecordId);
            currentRecord.quantityToMove = String(this.quantityToMove.value);
            this.stock.setRecordValue(currentRecord);
            await this.$.commitValueAndPropertyChanges();
        },
    })
    quantityToMove: ui.fields.Numeric;

    @ui.decorators.referenceField<MobileMiscellaneousIssueDetails, SerialNumber>({
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
            const currentRecord = this.stock.getRecordValue(this.gridBlock.selectedRecordId);
            return {
                _and: [{ product: { code: this.product.value?.code } }, { stockId: currentRecord?.stockId }],
            };
        },
        async onChange() {
            await _onChangeBody(this);
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
            ui.nestedFields.text({
                bind: 'stockId',
                title: 'Stock ID',
                isReadOnly: true,
                isHidden: true,
            }),
        ],
    })
    startingSerialNumber: ui.fields.Reference<SerialNumber>;

    @ui.decorators.textField<MobileMiscellaneousIssueDetails>({
        parent() {
            return this.serialNumberBlock;
        },
        title: 'Ending serial number',
        isMandatory: false,
        isTransient: true,
        isReadOnly: true,
        isFullWidth: true,
        async validation(_value: string): Promise<string> {
            if (this._productSite.product.serialNumberManagementMode === 'globalReceivedIssued') {
                const currentQty = (Number(this.quantityToMove.value) * Number(this.packingUnitToStockUnitConversionFactorToIssue.value));
                if (
                    (await getCountSerialNumber(
                        this,
                        String(this._productSite?.product?.code),
                        String(this._stockSite?.code),
                        this._stockId.value,
                        String(this.startingSerialNumber.value?.code),
                        String(this.endingSerialNumber.value),
                        _value,
                    )) !== currentQty
                ) {
                    return ui.localize(
                        '@sage/x3-stock/serial-number-not-sequential',
                        'The serial numbers are not sequential. Check your entry.',
                    );
                } else {
                    return '';
                }
            } else {
                return '';
            }
        },
    })
    endingSerialNumber: ui.fields.Text;

    @ui.decorators.textField<MobileMiscellaneousIssueDetails>({
        parent() {
            return this.serialNumberBlock;
        },
        isTransient: true,
        isHidden: true,
    })
    _stockId: ui.fields.Text;

    @ui.decorators.tableField<MobileMiscellaneousIssueDetails>({
        parent() {
            return this.listSerialNumberBlock;
        },
        canFilter: false,
        canSelect: false,
        canExport: false,
        canResizeColumns: false,
        canUserHideColumns: false,
        isTitleHidden: false,
        isTransient: true, // (X3-257606) TODO Issue: Deleting table row(s) that are loaded in a non-transient causes errors. After this is fixed, change this table back to isTransient: false
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
                postfix(_value, _rowValue?: Dict<any>) {
                    return this.stock.getRecordValue(this.gridBlock.selectedRecordId).packingUnit?.code ?? '';
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
                    const removedIndexSerialNumber = this._miscellaneousIssueLines.findIndex(
                        number =>
                            number.stockDetails[0].serialNumber === removedRecordSerialNumber.startingSerialNumber,
                    );
                    this._miscellaneousIssueLines.splice(removedIndexSerialNumber, 1);
                    _saveMiscellaneousIssue(this);
                    //calculation of the new qty
                    const currentRecord: any = this.stock.getRecordValue(this.gridBlock.selectedRecordId);
                    // currentRecord.quantityToMove = String(0);
                    this.stock.setRecordValue(currentRecord);

                    //remove from the card
                    this.serialNumberLines.removeRecord(recordId);

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
        const productCode = _getSavedInputs(this).selectedProduct?.code ?? '';
        this._miscellaneousIssueLines = _getSavedInputs(this).miscellaneousIssue.miscellaneousIssueLines ?? [];

        this._initSiteCodeField();
        this._productSite = await getProductSite(this, productCode, this.site.value ?? '', '');

        this._initPackingUnitFields();

        this._initTechnicalProperties();
        await _fieldsManagement(this);
    }

    private _initSiteCodeField() {
        // assign site code
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

    private async _onChangeLot() {
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
    }

    private async _onChangeSerialNumber() {
        await handleFilterOnChange(this, this.serialNumber, this.serialNumber.value?.code);
    }

    private _initPackingUnitFields() {
        let productPackingList = extractEdges(this._productSite.product.packingUnits.query).filter(productPacking => {
            return !!productPacking.packingUnit?.code;
        });

        this._packingUnits = productPackingList.map(productPacking => {
            return { node: productPacking };
        });

        let productPackingUnitSelectValues = productPackingList.map(productPacking => {
            return `${productPacking.packingUnit.code}`;
        });

        this.packingUnitToIssue.options = [this._productSite.product.stockUnit.code, ...productPackingUnitSelectValues];
        this.packingUnitToIssue.value = this.packingUnitToIssue.options[0];
        this.packingUnitToStockUnitConversionFactorToIssue.value = 1;

        this.packingUnitToIssue.value
            ? (this.quantityToMove.scale = GetNumberOfDecimals(this, this.packingUnitToIssue.value))
            : (this.quantityToMove.scale = 0);
    }
}
