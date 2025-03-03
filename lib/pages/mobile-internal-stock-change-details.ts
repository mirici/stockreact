import { Product, ProductSite, SerialNumberManagement, UnitOfMeasure } from '@sage/x3-master-data-api';
import { dialogMessage } from '@sage/x3-master-data/lib/client-functions/dialogs';
import { onGoto } from '@sage/x3-master-data/lib/client-functions/on-goto';
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
import {
    AsyncCompositeAllowed,
    AsyncVoidFunction,
    DictionaryDataComposite,
    DictionaryFieldSupported,
} from '@sage/x3-system/lib/client-functions/screen-management-gs-1';
import { SupportServiceManagementGs1Page } from '@sage/x3-system/lib/client-functions/support-service-management-gs-1-page';
import { DataTitle } from '@sage/x3-system/lib/shared-functions/parsed-element';
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
import { inputsStockChange, mobileApplicationGs1Key } from './mobile-internal-stock-change';

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

@ui.decorators.page<MobileInternalStockChangeDetails>({
    title: 'Stock change',
    subtitle: 'Select stock',
    node: '@sage/x3-master-data/ProductSite',
    mode: 'default',
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
            this.clearAllCompositeDataAndStorage(mobileApplicationGs1Key);
            return;
        }
        this._stockSite = JSON.parse(this.$.queryParameters.stockSite as string);
        this._stockChangeLines = this._getSavedInputs().stockChange.stockChangeLines ?? [];
        this._currentLine = Number(this._getSavedInputs().currentLine);
        this._currentOperation = Number(this._getSavedInputs().currentOperation);
        this._serialNumberManagementMode =
            this._getSavedInputs().selectedProduct?.serialNumberManagementMode ?? 'notManaged';
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

        // Retrieve current product globalTradeItemNumber from the main page
        this._globalTradeItemNumber = (this.$.queryParameters?.globalTradeItemNumber as string) ?? '';

        /**
         * Reminder: if no data can be assigned to at least one field,
         * the composite data is automatically deleted without any notification since they do not match.
         */

        if (!(await this._initControlManagerGs1(String(this.site.value)))) {
            this.clearAllCompositeDataAndStorage(mobileApplicationGs1Key);
            // TODO: What action should be taken in the event of a fatal error ?
            onGoto(this, '@sage/x3-stock/MobileInternalStockChange');
            return;
        }

        // TODO: FIXME: Start of bloc : This line below clearing composite data and disable scan method
        this.disableServiceGs1 = true;
        // TODO: FIXME: End of bloc

        // Composite data having been dispatched during the initialization phase, can now be deleted from the service
        // because we don't need it anymore.
        this.clearCompositeData();

        // We can now refresh the stock, which includes the GS1 data if we have scanned a composite code.
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
export class MobileInternalStockChangeDetails extends SupportServiceManagementGs1Page<GraphApi> {
    /**
     *
     * Technical composite data properties
     *
     */

    /** This value is initialized only by main page
     * and used only for control composite data block
     */
    /* @internal */
    private _globalTradeItemNumber: string | null = null;

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
    private _selectedLocation: PartialLocation;
    private _stockFieldSettings: StockSearchFilter[] = [];
    private _stockSite: Site;
    private _serialNumberManagementMode: SerialNumberManagement;
    private _selectedStockManagementRules: StockManagementRules;

    /*
     *
     *  Technical fields
     *
     */

    @ui.decorators.referenceField<MobileInternalStockChangeDetails, Product>({
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
            ui.nestedFields.reference<MobileInternalStockChangeDetails, Product, UnitOfMeasure>({
                node: '@sage/x3-master-data/UnitOfMeasure',
                bind: 'stockUnit',
                valueField: 'code',
                isHidden: true,
            }),
            ui.nestedFields.reference<MobileInternalStockChangeDetails, Product, UnitOfMeasure>({
                node: '@sage/x3-master-data/UnitOfMeasure',
                bind: 'stockUnit',
                valueField: 'numberOfDecimals',
                isHidden: true,
            }),
        ],
    })
    product: ui.fields.Reference<Product>;

    @ui.decorators.checkboxField<MobileInternalStockChangeDetails>({
        bind: 'isLocationManaged',
        isTransient: false,
        isHidden: true,
    })
    isLocationManaged: ui.fields.Checkbox;

    @ui.decorators.checkboxField<MobileInternalStockChangeDetails>({
        bind: 'isLicensePlateNumberManaged',
        isTransient: false,
        isHidden: true,
    })
    isLicensePlateNumberManaged: ui.fields.Checkbox;

    @ui.decorators.textField<MobileInternalStockChangeDetails>({
        isDisabled: true,
        isTransient: true,
        size: 'small',
    })
    localizedDescription: ui.fields.Text;

    @ui.decorators.textField<MobileInternalStockChangeDetails>({
        isDisabled: true,
        isTransient: true,
        prefix: 'Site:',
    })
    site: ui.fields.Text;

    /*  @ui.decorators.referenceField<MobileInternalStockChangeDetails, Warehouse>({
        parent() {
            return this.firstLineBlock;
        },
        node: '@sage/x3-stock/Warehouse',
        valueField: 'code',
        isHidden: true,
        filter() {
            return {
                stockSite: { _id: { _eq: this.site.value ?? undefined } },
            };
        },
    })
    warehouse: ui.fields.Reference; */

    /*
     *
     *  Page Actions
     *
     */

    @ui.decorators.pageAction<MobileInternalStockChangeDetails>({
        title: 'Next',
        shortcut: ['f2'], // TODO: Implement: What should the shortcut be for this button?
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
                this.$.storage.set('mobile-stockChange', JSON.stringify(savedInputs));
                onGoto(this, '@sage/x3-stock/MobileInternalStockChange', { ReturnFromDetail: 'yes' });
            } else {
                await dialogMessage(
                    this,
                    'error',
                    ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                    ui.localize(
                        '@sage/x3-stock/pages__mobile_stock_change_lines__notification__no_stock_error',
                        `Select at least one stock line.`,
                    ),
                );
            }
        },
    })
    nextButton: ui.PageAction;

    @ui.decorators.pageAction<MobileInternalStockChangeDetails>({
        title: 'Cancel',
        //shortcut: ['f2'], // TODO: Implement: What should the shortcut be for this button?
        buttonType: 'secondary',
        async onClick() {
            const currentRecord = this.stock.getRecordValue(this.gridBlock.selectedRecordId);
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
            (currentRecord as any).quantityInPackingUnitDestination = (
                currentRecord as any
            ).quantityInPackingUnitOrigin;
            this.stock.unselectRecord(this.gridBlock.selectedRecordId);
            this.stock.setRecordValue(currentRecord);

            this.$.detailPanel.isHidden = true;
            this.nextButton.isHidden = false;
        },
    })
    helperCancelButton: ui.PageAction;

    @ui.decorators.pageAction<MobileInternalStockChangeDetails>({
        title: 'Select',
        //shortcut: ['f2'], // TODO: Implement: What should the shortcut be for this button?
        buttonType: 'primary',
        onError(error) {
            switch (error.message) {
                case '@sage/x3-stock/pages__mobile_stock_change_lines__notification__error_startingSerialNumberMandatory': {
                    return ui.localize(
                        '@sage/x3-stock/pages__mobile_stock_change_lines__notification__error_startingSerialNumberMandatory',
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
            if (!errors.length) {
                let currentRecord = this.stock.getRecordValue(this.gridBlock.selectedRecordId);
                if (this._productSite.product.serialNumberManagementMode === 'globalReceivedIssued') {
                    if (!this.serialNumberLines.value.length) {
                        throw new Error(
                            '@sage/x3-stock/pages__mobile_stock_change_lines__notification__error_startingSerialNumberMandatory',
                        );
                    }
                } else {
                    if (Number(this.quantityToMove.value) <= 0) {
                        await dialogMessage(
                            this,
                            'error',
                            ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                            ui.localize(
                                '@sage/x3-stock/pages__mobile_stock_change_lines__quantityInPackingUnitDestination_must_be_greater_than_0',
                                'The quantity to move must be greater than 0.',
                            ),
                        );
                        return;
                    }
                }
                if (Number(this.quantityToMove.value) > Number((currentRecord as any).quantityInPackingUnitRest)) {
                    await dialogMessage(
                        this,
                        'error',
                        ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                        `${ui.localize(
                            '@sage/x3-stock/pages__mobile_stock_change_lines__enter_a_quantity_less_than_or_equal_to_the_stock_quantity',
                            'Enter a quantity less than or equal to the stock quantity.',
                        )}`,
                    );
                    return;
                }
                this.stock.selectRecord(this.gridBlock.selectedRecordId);
                if (this._productSite.product.serialNumberManagementMode !== 'globalReceivedIssued') {
                    // const lineIndex = this._currentLine;
                    const lineIndex = this._stockChangeLines.findIndex(
                        line =>
                            Number(line.stockId) === Number(currentRecord.stockId) &&
                            line.lineNumber === this._currentOperation,
                    );
                    if (lineIndex > -1) {
                        this._stockChangeLines[lineIndex].stockDetails[0].quantityInPackingUnit =
                            (Number(this.quantityToMove.value) *
                                Number(this._stockChangeLines[lineIndex].packingUnitToStockUnitConversionFactor)) /
                            Number(this.packingUnitToStockUnitConversionFactorDestination.value);
                        this._stockChangeLines[lineIndex].stockDetails[0].quantityInStockUnit =
                            Number(this.quantityToMove.value) *
                            Number(this._stockChangeLines[lineIndex].packingUnitToStockUnitConversionFactor);
                        if (this.locationDestination.value) {
                            this._stockChangeLines[lineIndex].stockDetails[0].location =
                                this.locationDestination.value.code;
                        } else {
                            this._stockChangeLines[lineIndex].stockDetails[0].location = currentRecord.location?.code;
                        }
                        if (this.statusDestination.value) {
                            this._stockChangeLines[lineIndex].stockDetails[0].status = this.statusDestination.value;
                        } else {
                            this._stockChangeLines[lineIndex].stockDetails[0].status = currentRecord.status?.code;
                        }
                        if (this.packingUnitDestination.value) {
                            this._stockChangeLines[lineIndex].stockDetails[0].packingUnit =
                                this.packingUnitDestination.value;
                        } else {
                            this._stockChangeLines[lineIndex].stockDetails[0].packingUnit =
                                currentRecord?.packingUnit.code;
                        }
                        this._stockChangeLines[lineIndex].stockDetails[0].packingUnitToStockUnitConversionFactor =
                            this.packingUnitToStockUnitConversionFactorDestination.value;
                        this._stockChangeLines[lineIndex].stockDetails[0].identifier1 =
                            this.identifier1Destination.value;
                        this._stockChangeLines[lineIndex].stockDetails[0].identifier2 =
                            this.identifier2Destination.value;
                    } else {
                        this._stockChangeLines[this._currentLine] = {
                            product: this.product.value.code,
                            stockId: String(currentRecord.stockId),
                            productDescription: this.product.value.description1,
                            quantityInPackingUnit: Number(this.quantityToMove.value),
                            packingUnitToStockUnitConversionFactor:
                                currentRecord.packingUnitToStockUnitConversionFactor,
                            serialNumber: currentRecord.serialNumber,
                            stockDetails: [
                                {
                                    packingUnit: this.packingUnitDestination.value
                                        ? this.packingUnitDestination.value
                                        : currentRecord.packingUnit?.code,
                                    packingUnitToStockUnitConversionFactor:
                                        this.packingUnitToStockUnitConversionFactorDestination.value,
                                    quantityInPackingUnit:
                                        (Number(this.quantityToMove.value) *
                                            Number(currentRecord.packingUnitToStockUnitConversionFactor)) /
                                        Number(this.packingUnitToStockUnitConversionFactorDestination.value),
                                    quantityInStockUnit:
                                        Number(this.quantityToMove.value) *
                                        Number(currentRecord.packingUnitToStockUnitConversionFactor),
                                    location: this.locationDestination.value
                                        ? this.locationDestination.value.code
                                        : currentRecord.location?.code,
                                    status: this.statusDestination.value
                                        ? this.statusDestination.value
                                        : currentRecord.status?.code,
                                    identifier1: this.identifier1Destination.value,
                                    identifier2: this.identifier2Destination.value,
                                    serialNumber: currentRecord.serialNumber,
                                },
                            ],
                            //stockSite: this._stockSite.code,
                            lineNumber: this._currentOperation,
                        };
                    }
                    this._saveDetail();
                }
                let qtyTotal = 0;
                this._stockChangeLines.forEach(line => {
                    if (
                        Number(line.stockId) === Number(currentRecord.stockId) &&
                        line.lineNumber === this._currentOperation
                    ) {
                        qtyTotal =
                            qtyTotal +
                            (Number(line.stockDetails[0].quantityInPackingUnit) *
                                Number(line.stockDetails[0].packingUnitToStockUnitConversionFactor)) /
                                Number(line.packingUnitToStockUnitConversionFactor);
                    }
                });
                (currentRecord as any).quantityToMove = qtyTotal;
                (currentRecord as any).quantityInStockUnitDestination =
                    qtyTotal * Number(currentRecord.packingUnitToStockUnitConversionFactor);
                (currentRecord as any).locationDestination = this.locationDestination.value
                    ? this.locationDestination.value
                    : currentRecord?.location;
                (currentRecord as any).statusDestination = this.statusDestination.value
                    ? this.statusDestination.value
                    : currentRecord.status?.code;
                (currentRecord as any).packingUnitDestination =
                    this.packingUnitDestination.value !== '' ? { code: this.packingUnitDestination.value } : null;
                (currentRecord as any).packingUnitToStockUnitConversionFactorDestination =
                    this.packingUnitToStockUnitConversionFactorDestination.value;
                (currentRecord as any).identifier1Destination = this.identifier1Destination.value;
                (currentRecord as any).identifier2Destination = this.identifier2Destination.value;
                this.stock.setRecordValue(currentRecord);
            }
            this.$.detailPanel.isHidden = true;

            this.nextButton.isHidden = false;
        },
    })
    helperSelectButton: ui.PageAction;

    @ui.decorators.pageAction<MobileInternalStockChangeDetails>({
        icon: 'add',
        title: 'Add...',
        onError(error) {
            switch (error.message) {
                case '@sage/x3-stock/pages__mobile_stock_change_lines__notification__error_startingSerialNumber': {
                    return ui.localize(
                        '@sage/x3-stock/pages__mobile_stock_change_lines__notification__error_startingSerialNumber',
                        'The serial number is mandatory',
                    );
                }
                case '@sage/x3-stock/serial-number-range-overlap': {
                    return ui.localize(
                        '@sage/x3-stock/serial-number-range-overlap',
                        'The serial numbers are overlapping. Enter another starting or ending serial number.',
                    );
                }
                case '@sage/x3-stock/pages__mobile_stock_change__same-amount-serial-numbers-in-the-range-to-match-quantity-to-move': {
                    return ui.localize(
                        '@sage/x3-stock/pages__mobile_stock_change__same-amount-serial-numbers-in-the-range-to-match-quantity-to-move',
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
        //shortcut: ['f2'], // TODO: Implement: What should the shortcut be for this button?
        buttonType: 'secondary',
        async onClick() {
            if (!this.startingSerialNumber.value) {
                throw new Error(
                    '@sage/x3-stock/pages__mobile_stock_change_lines__notification__error_startingSerialNumber',
                );
            }
            // check that this will add any duplicates
            const startNumberToAdd = this.startingSerialNumber.value.code.match(/\d+$/);
            const endNumberToAdd = Number(this.endingSerialNumber.value.match(/\d+$/));
            let serialNumberAlreadyUsed: boolean = false;
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
                        this.startingSerialNumber.value.code.substring(
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
                if (line.product === this.product.value?.code && line.serialNumber) {
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
                    this.startingSerialNumber.value?.code,
                    Number(this.quantityToMove.value),
                )
            ) {
                throw new Error(
                    '@sage/x3-stock/pages__mobile_stock_change__same-amount-serial-numbers-in-the-range-to-match-quantity-to-move',
                );
            }
            if (
                (await getCountSerialNumber(
                    this,
                    this.product.value?.code ?? '',
                    this._stockSite.code,
                    this._stockId.value,
                    this.startingSerialNumber.value?.code ?? '',
                    this.endingSerialNumber.value ?? '',
                )) !== Number(this.quantityToMove.value)
            ) {
                throw new Error('@sage/x3-stock/serial-number-not-sequential');
            }

            let currentRecord = this.stock.getRecordValue(this.gridBlock.selectedRecordId);
            this.serialNumberLines.addRecord({
                quantity: this.quantityToMove.value,
                startingSerialNumber: this.startingSerialNumber.value.code,
                endingSerialNumber: this.endingSerialNumber.value,
            });
            this._stockChangeLines.push({
                product: this.product.value?.code ?? undefined,
                stockId: String(currentRecord?.stockId),
                productDescription: this.product.value?.description1 ?? undefined,
                quantityInPackingUnit: Number(this.quantityToMove.value),
                packingUnitToStockUnitConversionFactor: Number(currentRecord?.packingUnitToStockUnitConversionFactor),
                //stockSite: this._stockSite.code,
                lineNumber: this._currentOperation,
                serialNumber: this.startingSerialNumber.value.code,
                endingSerialNumber: this.endingSerialNumber.value,
                stockDetails: [
                    {
                        serialNumber: this.startingSerialNumber.value.code,
                        packingUnit: this.packingUnitDestination.value
                            ? this.packingUnitDestination.value
                            : (currentRecord?.packingUnit?.code ?? undefined),
                        packingUnitToStockUnitConversionFactor: Number(
                            this.packingUnitToStockUnitConversionFactorDestination.value,
                        ),
                        quantityInPackingUnit: Number(
                            (Number(this.quantityToMove.value) *
                                Number(currentRecord?.packingUnitToStockUnitConversionFactor)) /
                                Number(this.packingUnitToStockUnitConversionFactorDestination.value),
                        ),
                        quantityInStockUnit:
                            Number(this.quantityToMove.value) *
                            Number(currentRecord?.packingUnitToStockUnitConversionFactor),
                        location: this.locationDestination.value
                            ? this.locationDestination.value.code
                            : currentRecord?.location?.code,
                        status: this.statusDestination.value
                            ? this.statusDestination.value
                            : currentRecord?.status?.code,
                        identifier1: this.identifier1Destination.value ?? undefined,
                        identifier2: this.identifier2Destination.value ?? undefined,
                    },
                ],
            });
            this._saveDetail();
            (currentRecord as any).quantityToMove = String(0);
            this.quantityToMove.value = 0;
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

    @ui.decorators.section<MobileInternalStockChangeDetails>({
        isTitleHidden: true,
    })
    mainSection: ui.containers.Section;

    @ui.decorators.section<MobileInternalStockChangeDetails>({
        title: 'Stock change',
        isTitleHidden: true,
    })
    detailPanelSection: ui.containers.Section;

    @ui.decorators.section<MobileInternalStockChangeDetails>({
        isTitleHidden: true,
    })
    sectionHeader: ui.containers.Section;

    /*
     *
     *  Blocks
     *
     */

    @ui.decorators.block<MobileInternalStockChangeDetails>({
        isTitleHidden: true,
        parent() {
            return this.mainSection;
        },
    })
    bodyBlock: ui.containers.Block;

    @ui.decorators.block<MobileInternalStockChangeDetails>({
        isTitleHidden: true,
        parent() {
            return this.detailPanelSection;
        },
    })
    detailsBlock: ui.containers.Block;

    @ui.decorators.gridRowBlock<MobileInternalStockChangeDetails>({
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

    @ui.decorators.block<MobileInternalStockChangeDetails>({
        isTitleHidden: true,
        parent() {
            return this.detailPanelSection;
        },
    })
    quantityBlock: ui.containers.Block;

    @ui.decorators.block<MobileInternalStockChangeDetails>({
        isTitleHidden: true,
        parent() {
            return this.detailPanelSection;
        },
    })
    serialNumberBlock: ui.containers.Block;

    @ui.decorators.block<MobileInternalStockChangeDetails>({
        isTitleHidden: true,
        parent() {
            return this.detailPanelSection;
        },
    })
    destinationBlock: ui.containers.Block;

    @ui.decorators.block<MobileInternalStockChangeDetails>({
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

    @ui.decorators.referenceField<MobileInternalStockChangeDetails, LicensePlateNumber>({
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

    @ui.decorators.referenceField<MobileInternalStockChangeDetails, Location>({
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

    @ui.decorators.referenceField<MobileInternalStockChangeDetails, LotsSites>({
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
        async onInputValueChange(this, rawData: string): Promise<void> {
            await this.scanBarCode(this.lot, rawData);
        },
        async onChange() {
            await this.onChangeLot();
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

    @ui.decorators.referenceField<MobileInternalStockChangeDetails, LotsSites>({
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
                // delete this.stock.filter.sublot;
                // delete this.stock.filter.lot; // a sublot always has a lot associated to it
                // this.stock.filter = this.stock.filter; // (X3-262952) TODO: Issue: seems like a hackish way to trigger a table refresh for deleting a filter criterion

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

            //await this._updateSelectedRecords();
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

    @ui.decorators.referenceField<MobileInternalStockChangeDetails, SerialNumber>({
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
                product: { code: this.product.value?.code },
                stockSite: { code: this.site.value ?? undefined },
                issueDocumentId: '',
            };
        },
        async onInputValueChange(this, rawData: string): Promise<void> {
            await this.scanBarCode(this.serialNumber, rawData);
        },
        async onChange() {
            await this.onChangeSerialNumber();
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

    @ui.decorators.selectField<MobileInternalStockChangeDetails>({
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

    @ui.decorators.selectField<MobileInternalStockChangeDetails>({
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

    @ui.decorators.numericField<MobileInternalStockChangeDetails>({
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

    @ui.decorators.textField<MobileInternalStockChangeDetails>({
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

    @ui.decorators.textField<MobileInternalStockChangeDetails>({
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

    @ui.decorators.textField<MobileInternalStockChangeDetails>({
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

    @ui.decorators.textField<MobileInternalStockChangeDetails>({
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

    @ui.decorators.tableField<MobileInternalStockChangeDetails, Stock>({
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
                        (this.$.detailPanel?.isHidden ?? false)
                            ? Number(rowValue?.quantityInPackingUnitOrigin)
                            : Number(rowValue?.quantityInPackingUnitRest),
                        Number(rowValue?.packingUnit.numberOfDecimals),
                    )} ${String(rowValue?.packingUnit?.code)}`;
                },
                title: 'Quantity to move', // this is important to display a title in the grid row block
                isTitleHidden: false,
                isMandatory: false,
                isFullWidth: true,
                max(rowValue: Stock) {
                    return Number((rowValue as any).quantityInPackingUnitOrigin);
                },
                scale(_value, rowValue?: Dict<any>) {
                    return rowValue?.packingUnit?.numberOfDecimals;
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
            ui.nestedFields.reference<MobileInternalStockChangeDetails, Stock, ProductSite>({
                bind: 'product',
                valueField: { product: { code: true } },
                node: '@sage/x3-master-data/ProductSite',
                isReadOnly: true,
                isHidden: false,
                columns: [
                    ui.nestedFields.text({
                        bind: { product: { code: true } },
                    }),
                    ui.nestedFields.text({
                        bind: { product: { serialNumberManagementMode: true } },
                    }),
                ],
            }),
            ui.nestedFields.reference<MobileInternalStockChangeDetails, Stock, LicensePlateNumber>({
                bind: 'licensePlateNumber',
                valueField: 'code',
                node: '@sage/x3-stock-data/LicensePlateNumber',
                isReadOnly: true,
                isHidden: true,
            }),
            ui.nestedFields.reference<MobileInternalStockChangeDetails, Stock, Location>({
                bind: 'location',
                valueField: 'code',
                node: '@sage/x3-stock-data/Location',
                isReadOnly: true,
                isHidden: false,
            }),
            ui.nestedFields.reference<MobileInternalStockChangeDetails, Stock, Location>({
                bind: 'locationDestination' as any,
                valueField: 'code',
                node: '@sage/x3-stock-data/Location',
                isTransient: true,
                isReadOnly: true,
                isHidden: true,
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
            ui.nestedFields.reference<MobileInternalStockChangeDetails, Stock, StockStatus>({
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
                /*  isHidden() {
                    return this.status.isHidden ?? false;
                },*/
            }),
            ui.nestedFields.technical<MobileInternalStockChangeDetails, Stock, UnitOfMeasure>({
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
            ui.nestedFields.technical<MobileInternalStockChangeDetails, Stock, UnitOfMeasure>({
                bind: 'packingUnitDestination' as any,
                node: '@sage/x3-master-data/UnitOfMeasure',
                isTransient: true,
                nestedFields: [
                    ui.nestedFields.text({
                        bind: 'code',
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
                /* isHidden() {
                    return this.packingUnitToStockUnitConversionFactor.isHidden ?? false;
                },*/
            }),
            ui.nestedFields.text({
                bind: 'identifier1',
                isReadOnly: true,
                isHidden() {
                    return this.identifier1.isHidden ?? false;
                },
            }),
            ui.nestedFields.text({
                bind: 'identifier1Destination' as any,
                isReadOnly: true,
                isTransient: true,
                isHidden: true,
                /* isHidden() {
                    return this.identifier1.isHidden ?? false;
                },*/
            }),
            ui.nestedFields.text({
                bind: 'identifier2',
                isReadOnly: true,
                isHidden() {
                    return this.identifier2.isHidden ?? false;
                },
            }),
            ui.nestedFields.text({
                bind: 'identifier2Destination' as any,
                isReadOnly: true,
                isTransient: true,
                isHidden: true,
                /* isHidden() {
                    return this.identifier2.isHidden ?? false;
                }, */
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
            ui.nestedFields.technical<MobileInternalStockChangeDetails, Stock, Lot>({
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
        },
        /*  async onChange() {
            await this.totalStocks.refresh().catch(() => {
            });
        }, */
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
                locationDestination: this._getLocationDestination(record),
                statusDestination: this._getStatusDestination(record),
                packingUnitDestination: this._getPackingUnitDestination(record),
                packingUnitToStockUnitConversionFactorDestination:
                    this._getPackingUnitToStockUnitConversionFactorDestination(record),
                identifier1Destination: this._getIdentifier1Destination(record),
                identifier2Destination: this._getIdentifier2Destination(record),
                lotReferenceExpirationDate: record.lotReference?.expirationDate,
                lotReferenceMajorVersion: record.lotReference?.majorVersion?.code,
                lotReferenceUseByDate: record.lotReference?.useByDate,
                globalSerialNumber: ui.localize('@sage/x3-stock/label-view-all', 'View list'),
            };
            return _record;
        },

        async onRowClick(recordId: string, rowItem: Stock) {
            await this._onRowClick(recordId, rowItem);
        },
    })
    stock: ui.fields.Table<Stock>;

    @ui.decorators.detailListField<MobileInternalStockChangeDetails, Stock>({
        parent() {
            return this.detailsBlock;
        },
        node: '@sage/x3-stock-data/Stock',
        isTransient: true,
        isFullWidth: true,
        isTitleHidden: true,
        fields: [
            ui.nestedFields.reference<MobileInternalStockChangeDetails, Stock, ProductSite>({
                bind: 'product',
                valueField: { product: { code: true } },
                node: '@sage/x3-master-data/ProductSite',
                title: 'Product',
                isReadOnly: true,
                isHidden: false,
            }),
            ui.nestedFields.reference<MobileInternalStockChangeDetails, Stock, LicensePlateNumber>({
                bind: 'licensePlateNumber',
                title: 'License plate number',
                valueField: 'code',
                node: '@sage/x3-stock-data/LicensePlateNumber',
                isReadOnly: true,
                isHidden: hideWhenEmptyValue,
                /* isHidden(value: LicensePlateNumber) {
                    return !value;
                },*/
            }),
            ui.nestedFields.reference<MobileInternalStockChangeDetails, Stock, Location>({
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
                    return !value || this.product.value?.expirationManagementMode === 'notManaged';
                },
            }),
            ui.nestedFields.date({
                bind: 'lotReferenceUseByDate' as any,
                title: 'Use-by date',
                isReadOnly: true,
                isHidden(value: Date) {
                    return !value || this.product.value?.expirationManagementMode === 'notManaged';
                },
            }),
            ui.nestedFields.reference<MobileInternalStockChangeDetails, Stock, Lot>({
                node: '@sage/x3-stock-data/Lot',
                bind: 'lotReference',
                valueField: 'lotCustomField1',
                title: 'Lot custom field 1',
                isReadOnly: true,
                isHidden(value: Lot) {
                    return !value?.lotCustomField1;
                },
            }),
            ui.nestedFields.reference<MobileInternalStockChangeDetails, Stock, Lot>({
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
                bind: 'quantityInPackingUnit',
                title: 'Packing qty.',
                isReadOnly: true,
                isHidden: false,
                postfix() {
                    return this.stock.getRecordValue(this.gridBlock.selectedRecordId).packingUnit?.code;
                },
                scale() {
                    return (
                        this.stock.getRecordValue(this.gridBlock.selectedRecordId)?.packingUnit?.numberOfDecimals ?? 0
                    );
                },
            }),
            ui.nestedFields.reference<MobileInternalStockChangeDetails, Stock, UnitOfMeasure>({
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
                    // TODO: Verify: Is it safe to assume stock unit is the same for all stock based on the selected product's stock unit code?
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
                    // TODO: Verify: Is it safe to assume stock unit is the same for all stock based on the selected product's stock unit code?
                    return this.product.value?.stockUnit?.code ?? '';
                },
                scale() {
                    return this.product.value?.stockUnit?.numberOfDecimals ?? 0;
                },
            }),
            ui.nestedFields.reference<MobileInternalStockChangeDetails, Stock, StockStatus>({
                bind: 'status',
                valueField: 'code',
                title: 'Status',
                isReadOnly: true,
                node: '@sage/x3-stock-data/StockStatus',
                columns: [
                    ui.nestedFields.text({
                        bind: 'code',
                    }),
                ],
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

    @ui.decorators.numericField<MobileInternalStockChangeDetails>({
        parent() {
            return this.quantityBlock;
        },
        postfix(value, rowValue?: Dict<any>) {
            return `/ ${ui.formatNumberToCurrentLocale(
                this.$.detailPanel.isHidden
                    ? (this.stock.getRecordValue(this.gridBlock.selectedRecordId) as any)?.quantityInPackingUnitOrigin
                    : (this.stock.getRecordValue(this.gridBlock.selectedRecordId) as any)?.quantityInPackingUnitRest,
                this.stock.getRecordValue(this.gridBlock.selectedRecordId)?.packingUnit?.numberOfDecimals,
            )} ${this.stock.getRecordValue(this.gridBlock.selectedRecordId)?.packingUnit?.code}`;
        },
        title: 'Quantity to move', // this is important to display a title in the grid row block
        isMandatory: false,
        isFullWidth: true,
        isTransient: true,
        max() {
            return (this.stock.getRecordValue(this.gridBlock.selectedRecordId) as any)?.quantityInPackingUnitRest;
        },
        scale() {
            return (
                (<any>(<unknown>this.stock.getRecordValue(this.gridBlock?.selectedRecordId ?? '')))?.packingUnit
                    ?.numberOfDecimals ?? 0
            );
        },
        async onChange() {
            let currentRecord = this.stock.getRecordValue(this.gridBlock.selectedRecordId);
            (currentRecord as any).quantityToMove = String(this.quantityToMove.value);
            this.stock.setRecordValue(currentRecord);
            await this.$.commitValueAndPropertyChanges();
        },
    })
    quantityToMove: ui.fields.Numeric;

    @ui.decorators.referenceField<MobileInternalStockChangeDetails, SerialNumber>({
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
            await this.onChangeBody();
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

    @ui.decorators.textField<MobileInternalStockChangeDetails>({
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

            let currentRecord = this.stock.getRecordValue(this.gridBlock.selectedRecordId);
            let currentQty = Number(this.quantityToMove.value);
            if (
                (await getCountSerialNumber(
                    this,
                    this.product.value?.code ?? '',
                    this._stockSite.code,
                    this._stockId.value,
                    this.startingSerialNumber.value?.code ?? '',
                    this.endingSerialNumber.value ?? '',
                )) !== currentQty
            ) {
                return ui.localize(
                    '@sage/x3-stock/serial-number-not-sequential',
                    'The serial numbers are not sequential. Check your entry.',
                );
            }
        },
    })
    endingSerialNumber: ui.fields.Text;

    @ui.decorators.referenceField<MobileInternalStockChangeDetails, Location>({
        parent() {
            return this.destinationBlock;
        },
        title: 'Destination location',
        node: '@sage/x3-stock-data/Location',
        valueField: 'code',
        isMandatory: false,
        isTransient: true,
        placeholder: 'Scan or select...',
        isAutoSelectEnabled: true,
        width: 'large',
        canFilter: false,
        filter() {
            const locationFilter: any = {
                stockSite: { code: this.site.value ?? undefined },
                category: { _nin: ['subcontract', 'customer'] },
            };
            return locationFilter;
        },
        async onChange() {
            this._activeSelectButton();
            if (this.locationDestination.value) {
                //    this._getWarehouseFromLocation();
                this.locationDestination.getNextField(true)?.focus();
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
    locationDestination: ui.fields.Reference;

    @ui.decorators.selectField<MobileInternalStockChangeDetails>({
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

    @ui.decorators.selectField<MobileInternalStockChangeDetails>({
        parent() {
            return this.destinationBlock;
        },
        title: 'Destination unit',
        width: 'small',
        //    options: ['UN'],
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

    @ui.decorators.numericField<MobileInternalStockChangeDetails>({
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

    @ui.decorators.textField<MobileInternalStockChangeDetails>({
        parent() {
            return this.destinationBlock;
        },
        placeholder: 'Scan an identifier 1',
        title: 'Destination identifier 1',
        isMandatory: false,
        isTransient: true,
        validation: /^$|^[^|]+$/,
        onChange() {
            this._activeSelectButton();
        },
    })
    identifier1Destination: ui.fields.Text;

    @ui.decorators.textField<MobileInternalStockChangeDetails>({
        parent() {
            return this.destinationBlock;
        },
        placeholder: 'Scan an identifier 2',
        title: 'Destination identifier 2',
        isMandatory: false,
        isTransient: true,
        validation: /^$|^[^|]+$/,
        onChange() {
            this._activeSelectButton();
        },
    })
    identifier2Destination: ui.fields.Text;

    private _activeSelectButton() {
        const currentRecord = this.stock.getRecordValue(this.gridBlock.selectedRecordId);
        this.helperSelectButton.isDisabled =
            (this.locationDestination.value?.code === currentRecord.location?.code ||
                !this.locationDestination.value) &&
            (this.statusDestination.value === currentRecord.status.code || !this.statusDestination.value) &&
            (this.packingUnitDestination.value === currentRecord.packingUnit.code ||
                !this.packingUnitDestination.value) &&
            Number(this.packingUnitToStockUnitConversionFactorDestination.value) ===
                Number(currentRecord.packingUnitToStockUnitConversionFactor) &&
            (this.identifier1Destination.value ? this.identifier1Destination.value : '') ===
                currentRecord.identifier1 &&
            (this.identifier2Destination.value ? this.identifier2Destination.value : '') === currentRecord.identifier2;
        this.addSerialRange.isDisabled = this.helperSelectButton.isDisabled;
    }

    @ui.decorators.textField<MobileInternalStockChangeDetails>({
        parent() {
            return this.serialNumberBlock;
        },
        isTransient: true,
        isHidden: true,
    })
    _stockId: ui.fields.Text;

    @ui.decorators.tableField<MobileInternalStockChangeDetails>({
        parent() {
            return this.listSerialNumberBlock;
        },
        canFilter: false,
        canSelect: false,
        canExport: false,
        canResizeColumns: false,
        canUserHideColumns: false,
        isTitleHidden: false,
        isTransient: true, // (X3-257606) TODO: Issue: Deleting table row(s) that are loaded in a non-transient causes errors. After this is fixed, change this table back to isTransient: false
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
                    return this.stock.getRecordValue(this.gridBlock.selectedRecordId)?.packingUnit?.code;
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
                    const removedIndexSerialNumber = this._stockChangeLines.findIndex(
                        number => number.serialNumber === removedRecordSerialNumber.startingSerialNumber,
                    );
                    this._stockChangeLines.splice(removedIndexSerialNumber, 1);
                    this._saveStockChange();
                    //calculation of the new qty
                    let currentRecord = this.stock.getRecordValue(this.gridBlock.selectedRecordId);
                    (currentRecord as any).quantityToMove = String(0);
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
        const storageProductSite = this._getSavedInputs().selectedProduct;
        this._stockChangeLines = this._getSavedInputs().stockChange.stockChangeLines;

        this._initSiteCodeField();
        this._productSite = await this._getProductSite(storageProductSite.code);

        this._initTechnicalProperties();
        await this._fieldsManagement();
    }

    private _getSavedInputs() {
        return JSON.parse(this.$.storage.get('mobile-stockChange') as string) as inputsStockChange;
    }

    private async _getProductSite(storageProductSite: string) {
        if (storageProductSite) {
            const productCode = storageProductSite;

            // read product site record
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
                    // TODO: find a better way if possible
                    `${productCode}|${this.site.value}`,
                )
                .execute();

            return productSiteToReceive as any;
        }
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

    /*
     *
     *  Fields management functions
     *
     */

    private async _onRowClick(recordId: string, rowItem: Stock) {
        this.stockDetails.value = [rowItem]; // populate details list
        this.gridBlock.selectedRecordId = recordId; // populate grid row block
        this._stockId.value = rowItem.stockId;
        this.quantityToMove.value = Number(
            (this.stock.getRecordValue(this.gridBlock.selectedRecordId) as any)?.quantityToMove,
        );
        if ((this.stock.getRecordValue(this.gridBlock.selectedRecordId) as any)?.locationDestination) {
            this.locationDestination.value = {
                code: (this.stock.getRecordValue(this.gridBlock.selectedRecordId) as any)?.locationDestination,
            };
        } else {
            this.locationDestination.value = null;
        }
        if (
            this.statusDestination.options?.findIndex(
                line => line === (this.stock.getRecordValue(this.gridBlock.selectedRecordId) as any)?.statusDestination,
            ) !== -1
        ) {
            this.statusDestination.value = (
                this.stock.getRecordValue(this.gridBlock.selectedRecordId) as any
            )?.statusDestination;
        }
        if ((this.stock.getRecordValue(this.gridBlock.selectedRecordId) as any)?.packingUnitDestination) {
            this.packingUnitDestination.value = (
                this.stock.getRecordValue(this.gridBlock.selectedRecordId) as any
            )?.packingUnitDestination?.code;
        }
        this.packingUnitToStockUnitConversionFactorDestination.value = (
            this.stock.getRecordValue(this.gridBlock.selectedRecordId) as any
        )?.packingUnitToStockUnitConversionFactorDestination;
        this.identifier1Destination.value = (
            this.stock.getRecordValue(this.gridBlock.selectedRecordId) as any
        )?.identifier1Destination;
        this.identifier2Destination.value = (
            this.stock.getRecordValue(this.gridBlock.selectedRecordId) as any
        )?.identifier2Destination;
        this.locationDestination.isReadOnly = !!this.stock.getRecordValue(this.gridBlock.selectedRecordId)
            ?.licensePlateNumber;

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
            let currentRecord = this.stock.getRecordValue(this.gridBlock.selectedRecordId);
            this.stock.setRecordValue(currentRecord);
        } else {
            const lineIndex = this._stockChangeLines.findIndex(
                line => Number(line.stockId) === Number(rowItem.stockId) && line.lineNumber === this._currentOperation,
            );
            if (lineIndex > -1) {
                this._currentLine = lineIndex;
            } else {
                this._currentLine = this._stockChangeLines.length;
                this._stockChangeLines.push({
                    product: this.product.value.code,
                    stockId: rowItem.stockId,
                    //stockSite: this._stockSite.code,
                    lineNumber: this._currentOperation,
                    quantityInPackingUnit: rowItem.quantityInPackingUnit,
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

        this.$.detailPanel.isHidden = false;
    }

    private async _fieldsManagement() {
        this._lotManagement();
        await this._miscellaneousFieldsManagement();
        this._initPackingUnitFields();
        this._serialNumberManagement();
    }

    private async onChangeBody() {
        let currentRecord = this.stock.getRecordValue(this.gridBlock.selectedRecordId);
        let currentQty = Number(this.quantityToMove.value);
        if (!currentQty || !this.startingSerialNumber.value) {
            this.endingSerialNumber.value = null;
            return;
        }

        this.startingSerialNumber.value.code = this.startingSerialNumber.value.code.toUpperCase();
        if (currentQty > 1) {
            this.endingSerialNumber.value = this._calculateEndingSerialNumber(
                this.startingSerialNumber.value.code,
                currentQty,
            );
        } else {
            this.endingSerialNumber.value = this.startingSerialNumber.value.code;
        }
        if (currentQty > (currentRecord as any).quantityInPackingUnitOrigin) this.addSerialRange.isHidden = true;
        else {
            this.addSerialRange.isHidden = false;
        }
        // validate range does not contain existing or non-existent serial numbers
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
        // this.packingUnit.value = this.packingUnit.options[0];
        this.packingUnitDestination.options = [
            this._productSite.product.stockUnit.code,
            ...productPakingUnitSelectValues,
        ];
        //  this.packingUnitDestination.value = this.packingUnit.options[0];
        // this.packingUnitToStockUnitConversionFactor.value = 1;
    }

    private async _miscellaneousFieldsManagement() {
        //location fields
        //        this.location.isHidden = !this._productSite.isLocationManaged;
        //lot field: mandatory if no sequence number
        if (
            !(this.lot.isHidden || !!this._productSite.product.lotSequenceNumber) &&
            ['lotAndSublot', 'mandatoryLot'].includes(this._productSite.product.lotManagementMode)
        )
            this.lot.isMandatory = true;
        //license plate number fields
        // this.licensePlateNumber.isHidden = !this._productSite.isLicensePlateNumberManaged;
        const transaction = this._getSavedInputs().selectedTransaction;
        /*    this.locationDestination.isHidden = !transaction.isLocationChange;
        this.statusDestination.isHidden = !transaction.isStatusChange;
        this.packingUnitDestination.isHidden = !transaction.isUnitChange;
        this.packingUnitToStockUnitConversionFactorDestination.isHidden = !transaction.isUnitChange; */
        this.identifier1Destination.isHidden = transaction.identifier1Destination === 'hidden';
        this.identifier1Destination.isReadOnly = transaction.identifier1Destination === 'displayed';
        this.identifier2Destination.isHidden = transaction.identifier2Destination === 'hidden';
        this.identifier2Destination.isReadOnly = transaction.identifier2Destination === 'displayed';
        // if (transaction.isStatusChange === true) this.status.isMandatory = true;

        this._selectedStockManagementRules = await findStockManagementRules(
            this._stockSite.code,
            this._productSite.product.productCategory.code,
            '26',
            transaction.stockMovementCode?.code,
            this,
        );
        this.status.options = await this._getStockStatus();
        this.statusDestination.options = this.status.options;
    }

    private _serialNumberManagement() {
        //serial number fields
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
        savedInputs.stockChange.stockChangeLines = this._stockChangeLines;
        savedInputs.currentLine = this._currentLine;
        this.$.storage.set('mobile-stockChange', JSON.stringify(savedInputs));
    }

    private _getQuantityInPackingUnitOrigin(record: Partial<Stock>): Number {
        if ((record as any).quantityInPackingUnitOrigin) {
            return (record as any).quantityInPackingUnitOrigin;
        } else {
            if (this._stockChangeLines === undefined) {
                this._stockChangeLines = this._getSavedInputs().stockChange.stockChangeLines;
            }
            let _quantityInPackingUnitOrigin: Number = Number(record.quantityInPackingUnit);
            this._stockChangeLines?.forEach(line => {
                if (Number(line.stockId) === Number(record.stockId) && line.lineNumber !== this._currentOperation) {
                    _quantityInPackingUnitOrigin =
                        Number(_quantityInPackingUnitOrigin) -
                        (Number(line.quantityInPackingUnitDestination) *
                            Number(line.packingUnitToStockUnitConversionFactorDestination)) /
                            Number(line.packingUnitToStockUnitConversionFactor);
                }
            });
            return _quantityInPackingUnitOrigin;
        }
    }

    private _getquantityInPackingUnitRest(record: Partial<Stock>): Number {
        if (this._stockChangeLines === undefined) {
            this._stockChangeLines = this._getSavedInputs().stockChange.stockChangeLines;
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
                            (Number(line.stockDetails[0].quantityInPackingUnit) *
                                Number(line.stockDetails[0].packingUnitToStockUnitConversionFactor)) /
                                Number(line.packingUnitToStockUnitConversionFactor),
                    );
                }
            });
        }
        return _quantityInPackingUnitRest;
    }

    private _getStockChangeLine(record: Partial<Stock>): Partial<StockChangeLineInput> | undefined {
        if (this._stockChangeLines === undefined) {
            this._stockChangeLines = this._getSavedInputs().stockChange.stockChangeLines;
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
                (Number(line.stockDetails[0].quantityInPackingUnit) *
                    Number(line.stockDetails[0].packingUnitToStockUnitConversionFactor)) /
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

    private _getLocationDestination(record: Partial<Stock>): String | undefined {
        const line = this._getStockChangeLine(record);
        if (line) {
            return line.stockDetails[0].location;
        } else {
            if (!!record.licensePlateNumber) {
                return record.location?.code;
            } else {
                return '';
            }
        }
    }

    private _getPackingUnitToStockUnitConversionFactorDestination(record: Partial<Stock>): Number | undefined {
        const line = this._getStockChangeLine(record);
        if (line) {
            return Number(line.stockDetails[0].packingUnitToStockUnitConversionFactor);
        } else {
            return Number(record.packingUnitToStockUnitConversionFactor);
        }
    }

    private _getIdentifier1Destination(record: Partial<Stock>): String | undefined {
        const line = this._getStockChangeLine(record);
        if (line) {
            return line.stockDetails[0].identifier1;
        } else {
            return record.identifier1;
        }
    }

    private _getIdentifier2Destination(record: Partial<Stock>): String | undefined {
        const line = this._getStockChangeLine(record);
        if (line) {
            return line.stockDetails[0].identifier2;
        } else {
            return record.identifier2;
        }
    }

    private _getPackingUnitDestination(record: Partial<Stock>): Partial<UnitOfMeasure> | undefined {
        const line = this._getStockChangeLine(record);
        if (line) {
            return { code: line.stockDetails[0].packingUnit };
        } else {
            return undefined; // record.packingUnit;
        }
    }

    private _getStatusDestination(record: Partial<Stock>): String | undefined {
        const line = this._getStockChangeLine(record);
        if (line) {
            return line.stockDetails[0].status;
        } else {
            return ''; // record.status;
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
                    '@sage/x3-stock/pages__mobile_stock_change_details__notification__invalid_stock_status_error',
                    'No stock status',
                ),
            );
        }
        return response.edges.map((stockStatus: any) => stockStatus.node.code);
    }

    /**
     *
     * Technical composite data methods
     *
     */

    /**
     * Initialize ControlManagerGs1
     * @returns true when ControlManagerGs1 has usable
     */
    private async _initControlManagerGs1(site: string): Promise<boolean> {
        return await this.createAndInitServiceGs1(
            site,
            mobileApplicationGs1Key,
            {
                [DataTitle.batchLot]: {
                    mainField: this.lot,
                    onChangeMainField: this.onChangeLot,
                },
                [DataTitle.serial]: {
                    mainField: this.serialNumber,
                    onChangeMainField: this.onChangeSerialNumber,
                },
            } as DictionaryFieldSupported,
            undefined,
            this._checkCompositeDataAllowed,
        );
    }

    /**
     * This asynchronous readonly function check if current composite data is valid or not
     * @param dictionaryDataComposite : dictionary of composite data block.
     * @returns false when data must be discarded
     */
    /** @internal */
    private readonly _checkCompositeDataAllowed: AsyncCompositeAllowed = async (
        dictionaryDataComposite: DictionaryDataComposite,
    ) => {
        const product = dictionaryDataComposite[DataTitle.gtin];

        if (
            !!this.product?.value &&
            ((!product && Object.keys(dictionaryDataComposite).length) ||
                (product && String(this._globalTradeItemNumber) !== product.data))
        ) {
            await this.$.sound.error();
            await dialogMessage(
                this,
                'error',
                ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                ui.localize(
                    '@sage/x3-stock/dialog-error-gs-1-data-is-not-related-to-product',
                    'GS1 data is not related to product {{ product }}.',
                    { product: this.product?.value?.code },
                ),
                {
                    fullScreen: false,
                },
            );
            return false;
        }
        return true;
    };
    /**
     * OnChange readonly process
     *
     * Used both decorator and bar code manager.
     * @returns Promise<void>
     */

    /** @internal */
    private readonly onChangeLot: AsyncVoidFunction = async () => {
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
    };

    /** @internal */
    private onChangeSerialNumber: AsyncVoidFunction = async () => {
        await handleFilterOnChange(this, this.serialNumber, this.serialNumber.value?.code);
    };
}
