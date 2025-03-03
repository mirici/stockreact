import { Product, ProductPackingUnits, ProductSite, UnitOfMeasure } from '@sage/x3-master-data-api';
import { dialogMessage } from '@sage/x3-master-data/lib/client-functions/dialogs';
import { GraphApi, LpnOperations, LpnOperationsLineInput } from '@sage/x3-stock-api';
import {
    LicensePlateNumberInput,
    Location,
    LocationInput,
    Lot,
    LotsSites,
    SerialNumber,
    Stock,
    StockSearchFilter,
    StockStatus,
} from '@sage/x3-stock-data-api';
import { getCountSerialNumber } from '@sage/x3-stock-data/lib/client-functions/get-count-serial-number';
import { Site } from '@sage/x3-system-api';
import { Dict, Edges, ExtractEdges, ExtractEdgesPartial, Filter, decimal, extractEdges } from '@sage/xtrem-client';
import * as ui from '@sage/xtrem-ui';
import { NotifyAndWait } from '../client-functions/display';
import {
    generateStockTableFilter,
    handleFilterOnChange,
    managePages,
    readSerialNumberFromStockId,
    removeFilters,
} from '../client-functions/manage-pages';
import { inputsLpnUnlink } from './mobile-lpn-unlink';

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

@ui.decorators.page<MobileLpnUnlinkStockLines>({
    title: 'LPN unlinking',
    subtitle: 'Select stock',
    isTitleHidden: true,
    isTransient: false,
    //skipDirtyCheck: true,
    node: '@sage/x3-master-data/ProductSite',
    mode: 'default',
    //authorizationCode: 'CWSLPNA',
    navigationPanel: undefined,
    headerCard() {
        return {
            title: this._licensePlateNumber,
            titleRight: this.headerProduct,
            line2: this.headerLocation,
            line2Right: this.headerLot,
        };
    },
    async onLoad() {
        // Retrieve & parse out query parameters
        const lpnOperations: ExtractEdges<LpnOperations> = JSON.parse(this.$.queryParameters?.lpnOperations as string);
        const _savedInputs = this._getSavedInputs();
        const _productCode = _savedInputs?.selectedProduct?.code ?? '';
        this._currentLine = _savedInputs?.currentLine ?? 0;
        this._currentOperation = _savedInputs?.currentOperation ?? 0;
        this._selectedLocation = _savedInputs?.selectedLocation;
        if (_savedInputs?.selectedLicensePlateNumber)
            this._selectedLicensePlateNumber = _savedInputs?.selectedLicensePlateNumber;
        this._stockChangeLines = _savedInputs?.lpnOperations?.stockChangeLines ?? [];
        this._stockSite = lpnOperations.stockSite;

        // Initialize header card
        this._licensePlateNumber.value = this._selectedLicensePlateNumber?.code ?? null;
        this.headerLocation.value = (this._selectedLicensePlateNumber?.location as unknown as Location)?.code;
        this.headerLot.value = this.$.queryParameters.lot as string;
        this.headerProduct.value = _productCode;

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

        await this._initStockChangeLines();

        this.status.options = await this._getStockStatus();
        this._productSite = await this._getProductSite(_productCode);
        if (!this.packingUnit.isHidden) this._initPackingUnitFields();

        this.serialNumberLines.title = 'Serial number(s) to unlink';
        if (this._productSite.product.serialNumberManagementMode !== 'globalReceivedIssued') {
            this.addSerialRange.isHidden = true;
            this.serialNumberBlock.isHidden = true;
            this.serialNumberLines.isTitleHidden = true;
        }
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
    businessActions() {
        return [this.nextButton];
    },
})
export class MobileLpnUnlinkStockLines extends ui.Page<GraphApi> {
    async _getStockChangeLine(
        _recordId: string | null | undefined,
    ): Promise<import('@sage/xtrem-ui/build/lib/component/types').PartialCollectionValueWithIds<Stock> | null> {
        if (_recordId) {
            const _record = this.stock.getRecordValue(_recordId);
            if (_record) {
                if (_record?.stockId) {
                    _record.stockId = '';
                }
                return _record;
            }
        }

        return null;
    }

    private _stockSite: ExtractEdges<Site>;
    private _stockFilter: Filter<any>; // TODO: Issue: Could this be even more strongly typed?
    private _stockFieldSettings: StockSearchFilter[] = [];
    private _unitMap: Map<string, ExtractEdgesPartial<ProductPackingUnits>> = new Map<
        string,
        ExtractEdgesPartial<ProductPackingUnits>
    >();
    private _stockChangeLines: LpnOperationsLineInput[];
    private _selectedLocation?: LocationInput;
    private _selectedLicensePlateNumber: LicensePlateNumberInput;
    private _currentLine: number;
    private _currentOperation: number;
    _packingUnits: packingUnit[];
    private _productSite: ProductSite;
    private _notifier = new NotifyAndWait(this);
    private _savedStockId = '';

    /*
     *
     *  Header fields
     *
     */

    @ui.decorators.textField<MobileLpnUnlinkStockLines>({
        isTransient: true,
        isTitleHidden: true,
        isReadOnly: true,
    })
    _licensePlateNumber: ui.fields.Text;

    @ui.decorators.textField<MobileLpnUnlinkStockLines>({
        isTransient: true,
        isTitleHidden: true,
        isReadOnly: true,
    })
    headerProduct: ui.fields.Text;

    @ui.decorators.referenceField<MobileLpnUnlinkStockLines, Product>({
        node: '@sage/x3-master-data/Product',
        valueField: 'code',
        isTransient: false,
        isTitleHidden: true,
        isReadOnly: true,
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
                optionType: '@sage/x3-stock-data/StockVersionMode',
                isHidden: true,
            }),
            ui.nestedFields.reference<MobileLpnUnlinkStockLines, Product, UnitOfMeasure>({
                node: '@sage/x3-master-data/UnitOfMeasure',
                bind: 'stockUnit',
                valueField: 'code',
                isHidden: true,
            }),
            ui.nestedFields.reference<MobileLpnUnlinkStockLines, Product, UnitOfMeasure>({
                node: '@sage/x3-master-data/UnitOfMeasure',
                bind: 'stockUnit',
                valueField: 'numberOfDecimals',
                isHidden: true,
            }),
            // (X3-262483) TODO: Issue: need ui component like technical nestedField for collection property
            // ui.nestedFields.technical<MobileLpnUnlinkStockLines, Product, ProductPackingUnit>({
            //     node: '@sage/x3-master-data/ProductPackingUnit',
            //     bind: 'packingUnits',
            //     nestedFields: [
            //         ui.nestedFields.reference({
            //             node: '@sage/x3-master-data/UnitOfMeasure',
            //             bind: 'unit',
            //             valueField: 'code',
            //             canFilter: false,
            //         }),
            //     ],
            // }),
        ],
    })
    product: ui.fields.Reference<Product>;

    @ui.decorators.textField<MobileLpnUnlinkStockLines>({
        isTransient: true,
        isTitleHidden: true,
        isReadOnly: true,
    })
    headerLocation: ui.fields.Text;

    @ui.decorators.textField<MobileLpnUnlinkStockLines>({
        isTransient: true,
        isTitleHidden: true,
        isReadOnly: true,
    })
    headerLot: ui.fields.Text;

    /*
     *
     *  Hidden non-transient fields
     *
     */

    @ui.decorators.checkboxField<MobileLpnUnlinkStockLines>({
        isHidden: true,
        isDisabled: true,
    })
    isLocationManaged: ui.fields.Checkbox;

    @ui.decorators.checkboxField<MobileLpnUnlinkStockLines>({
        isHidden: true,
        isDisabled: true,
    })
    isLicensePlateNumberManaged: ui.fields.Checkbox;

    @ui.decorators.countField<MobileLpnUnlinkStockLines>({
        bind: 'stock',
        isHidden: true,
        isDisabled: true,
    })
    totalStocks: ui.fields.Count;

    /*
     *
     *  Page Actions
     *
     */

    @ui.decorators.pageAction<MobileLpnUnlinkStockLines>({
        title: 'Next',
        shortcut: ['f2'], // TODO: Implement: What should the shortcut be for this button?
        buttonType: 'primary',
        async onClick() {
            if (this.stock.selectedRecords.length > 0) {
                let locationDestinationNull: boolean = false;
                this.stock.selectedRecords.forEach(rowId => {
                    const stockRecord = this.stock.getRecordValue(rowId);
                    if (!(stockRecord as any).locationDestination) {
                        locationDestinationNull = true;
                    }
                });
                if (!locationDestinationNull) {
                    await removeFilters(this);
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

                    this._createDetail();
                    await this.stock.refresh();
                    await this.$.commitValueAndPropertyChanges();
                    this.$.setPageClean();
                    const savedInputs = this._getSavedInputs();
                    savedInputs.currentLine = this._currentLine;
                    this.$.storage.set('mobile-lpnOperations', JSON.stringify(savedInputs));
                    return this.$.router.goTo('@sage/x3-stock/MobileLpnUnlink', { ReturnFromDetail: 'yes' });
                } else {
                    await dialogMessage(
                        this,
                        'error',
                        ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                        ui.localize(
                            '@sage/x3-stock/pages__mobile_lpn_unlink_stock_lines__error_locationDestination',
                            'The destination location is mandatory',
                        ),
                    );
                }
            } else {
                await dialogMessage(
                    this,
                    'error',
                    ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                    ui.localize(
                        '@sage/x3-stock/pages__mobile_lpn_unlink_stock_lines__notification__no_stock_error',
                        `Select at least one stock line.`,
                    ),
                );
            }
        },
    })
    nextButton: ui.PageAction;

    @ui.decorators.pageAction<MobileLpnUnlinkStockLines>({
        title: 'Cancel',
        //shortcut: ['f2'], // TODO: Implement: What should the shortcut be for this button?
        buttonType: 'secondary',
        async onClick() {
            // even though the user clicks Cancel, you have to still revert any possible changes (this is how GridRowBlock works)

            const _recordId = this.quantityBlock.selectedRecordId;
            if (_recordId) {
                this.stock.unselectRecord(_recordId);
                const _currentRecord = this.stock.getRecordValue(_recordId);
                if (_currentRecord) {
                    this._stockChangeLines.splice(this._currentLine, 1);
                    _currentRecord.quantityInPackingUnit = (_currentRecord as any).quantityInPackingUnitOrigin;
                    (_currentRecord as any).quantityInPackingUnitCopy = (
                        _currentRecord as any
                    ).quantityInPackingUnitOrigin;
                    this.stock.setRecordValue(_currentRecord);
                    this.quantityInPackingUnit.value = Number(_currentRecord.quantityInPackingUnit);
                    this._savedStockId = '';
                    this._saveLpnOperations();
                }
            }

            if (this.$.detailPanel) this.$.detailPanel.isHidden = true;
            // TODO: Issue: page-level businessAction buttons will overlay on top of any detailPanel footer buttons. And footer buttons are still be partially obscured
            this.nextButton.isHidden = false;
        },
    })
    helperCancelButton: ui.PageAction;

    @ui.decorators.pageAction<MobileLpnUnlinkStockLines>({
        title: 'Select',
        //shortcut: ['f2'], // TODO: Implement: What should the shortcut be for this button?
        onError(error) {
            switch (error.message) {
                case '@sage/x3-stock/pages__mobile_lpn_unlink_stock_lines__notification__error_startingSerialNumberMandatory': {
                    return ui.localize(
                        '@sage/x3-stock/pages__mobile_lpn_unlink_stock_lines__notification__error_startingSerialNumberMandatory',
                        'You need to select the serial number and add it first.',
                    );
                }
                default: {
                    return error;
                }
            }
        },
        buttonType: 'primary',
        async onClick() {
            await this.$.commitValueAndPropertyChanges();

            const errors: ui.ValidationResult[] = await this.stock.validateWithDetails(); // TODO: Verify: Is there a better way to validate a single table row, rather an entire table
            if (errors.length === 0) {
                // close helper panel only when there is no validation errors

                // by using GridRowBlock, the quantity field will be automatically updated on the stock table as well
                const _recordId = this.quantityBlock.selectedRecordId;
                const _currentRecord = this.stock.getRecordValue(_recordId ?? '');
                if (this._productSite.product.serialNumberManagementMode === 'globalReceivedIssued') {
                    if (
                        Number(_currentRecord?.quantityInPackingUnit) !== 0 ||
                        this._stockChangeLines[this._currentLine]?.stockDetails?.length === 0
                    ) {
                        throw new Error(
                            '@sage/x3-stock/pages__mobile_lpn_unlink_stock_lines__notification__error_startingSerialNumberMandatory',
                        );
                    }
                } else {
                    if ((this.quantityInPackingUnit.value ?? 0) <= 0) {
                        await dialogMessage(
                            this,
                            'error',
                            ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                            ui.localize(
                                '@sage/x3-stock/pages__mobile_lpn_unlink_stock_lines__quantityInPackingUnit_must_be_greater_than_0',
                                'The quantity must be greater than 0',
                            ),
                        );
                        return;
                    }
                    if (
                        (this.quantityInPackingUnit.value ?? 0) >
                        Number((_currentRecord as any)?.quantityInPackingUnitCopy)
                    ) {
                        await dialogMessage(
                            this,
                            'error',
                            ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                            `${ui.localize(
                                '@sage/x3-stock/pages__mobile_lpn_unlink_stock_lines__quantityInPackingUnit_must_be_smaller_than',
                                'The quantity must be smaller than {{quantityInPackingUnitCopy}}',
                                { quantityInPackingUnitCopy: (_currentRecord as any).quantityInPackingUnitCopy },
                            )}`,
                        );
                        return;
                    }
                }
                // localization destination
                if (!(_currentRecord as any)?.locationDestination) {
                    await dialogMessage(
                        this,
                        'error',
                        ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                        ui.localize(
                            '@sage/x3-stock/pages__mobile_lpn_unlink_stock_lines__error_locationDestination',
                            'The destination location is mandatory',
                        ),
                    );
                    return;
                }
                if (_recordId && _currentRecord) {
                    const _stockId = _currentRecord.stockId;
                    this.stock.selectRecord(_recordId);
                    if (this._productSite.product.serialNumberManagementMode !== 'globalReceivedIssued') {
                        const lineIndex = this._stockChangeLines.findIndex(
                            line =>
                                Number(line?.stockId) === Number(_currentRecord.stockId) &&
                                line.lineNumber === this._currentOperation,
                        );
                        if (lineIndex > -1) {
                            const _stockDetails = this._stockChangeLines[lineIndex]?.stockDetails;
                            if (_stockDetails) {
                                const _stockJournal = _stockDetails[0];
                                _stockJournal.quantityInPackingUnit = this.quantityInPackingUnit.value ?? undefined;
                                _stockJournal.quantityInStockUnit =
                                    Number(this.quantityInPackingUnit.value) *
                                    Number(_currentRecord.packingUnitToStockUnitConversionFactor);
                                _stockJournal.location = (_currentRecord as any)?.locationDestination?.code;
                                _stockJournal.licensePlateNumber = undefined;
                                _stockJournal.serialNumber = _currentRecord.serialNumber;
                            }
                        } else {
                            this._stockChangeLines[this._currentLine].stockDetails?.push({
                                quantityInPackingUnit: this.quantityInPackingUnit.value ?? undefined,
                                packingUnit: _currentRecord.packingUnit?.code,
                                licensePlateNumber: undefined,
                                quantityInStockUnit:
                                    Number(this.quantityInPackingUnit.value) *
                                    Number(_currentRecord.packingUnitToStockUnitConversionFactor),
                                location: (_currentRecord as any).locationDestination?.code,
                                serialNumber: _currentRecord.serialNumber, // this.startingSerialNumber.value?.code ?? null,
                            });

                            this._stockChangeLines[this._currentLine] = {
                                ...this._stockChangeLines[this._currentLine],
                                stockId: String(_currentRecord.stockId),
                                product: this.product.value?.code,
                                location: (_currentRecord as any).locationDestination?.code,
                                lineNumber: this._currentOperation,
                            };
                        }
                        this._saveDetail();
                    }
                    const qtyTotal =
                        this._stockChangeLines[this._currentLine].stockDetails?.reduce<decimal>((acc, curr) => {
                            return acc + Number(curr.quantityInPackingUnit);
                        }, 0) ?? 0;
                    _currentRecord.quantityInPackingUnit = String(qtyTotal);
                    this.stock.setRecordValue(_currentRecord);
                }

                if (this.$.detailPanel) this.$.detailPanel.isHidden = true;

                // TODO: Issue: page-level businessAction buttons will overlay on top of any detailPanel footer buttons. And footer buttons are still be partially obscured
                this.nextButton.isHidden = false;
            }
        },
    })
    helperSelectButton: ui.PageAction;

    @ui.decorators.pageAction<MobileLpnUnlinkStockLines>({
        icon: 'add',
        title: 'Add...',
        //shortcut: ['f2'], // TODO: Implement: What should the shortcut be for this button?
        onError(error) {
            switch (error.message) {
                case '@sage/x3-stock/pages__mobile_lpn_unlink_stock_lines__notification__error_startingSerialNumber': {
                    return ui.localize(
                        '@sage/x3-stock/pages__mobile_lpn_unlink_stock_lines__notification__error_startingSerialNumber',
                        'The serial number is mandatory',
                    );
                }
                case '@sage/x3-stock/serial-number-range-overlap': {
                    return ui.localize(
                        '@sage/x3-stock/serial-number-range-overlap',
                        'The serial numbers are overlapping. Enter another starting or ending serial number.',
                    );
                }
                case '@sage/x3-stock/pages__mobile_lpn_unlink_stock_lines__notification__same-amount-serial-numbers-in-the-range-to-match-quantity-to-change': {
                    return ui.localize(
                        '@sage/x3-stock/pages__mobile_lpn_unlink_stock_lines__notification__same-amount-serial-numbers-in-the-range-to-match-quantity-to-change',
                        'Select the same amount of serial numbers in the range to match the quantity to unlink.',
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
                    '@sage/x3-stock/pages__mobile_lpn_unlink_stock_lines__notification__error_startingSerialNumber',
                );
            }
            // check that this will add any duplicates
            const startNumberToAdd = this.startingSerialNumber.value?.code?.match(/\d+$/);
            const endNumberToAdd = Number(this.endingSerialNumber.value?.match(/\d+$/));
            let serialNumberAlreadyUsed = false;
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
                            this.startingSerialNumber.value?.code?.substring(
                                0,
                                this.startingSerialNumber.value?.code.length - startNumberToAdd.toString().length,
                            )
                    )
                        return false;

                    return Number(startNumberToAdd) <= rowEndMatch && endNumberToAdd >= Number(rowStartMatch);
                })
            ) {
                serialNumberAlreadyUsed = true;
            }
            this._stockChangeLines.forEach(line => {
                if (line.product === this.product.value?.code) {
                    line.stockDetails?.forEach(lineDetail => {
                        const startingSerialNumber = Number(lineDetail?.serialNumber?.match(/\d+$/));
                        const endingSerialNumber = Number(
                            this._calculateEndingSerialNumber(
                                lineDetail?.serialNumber ?? '',
                                Number(lineDetail.quantityInPackingUnit),
                            ).match(/\d+$/),
                        );
                        if (
                            Number(startNumberToAdd) <= endingSerialNumber &&
                            Number(endNumberToAdd) >= startingSerialNumber
                        ) {
                            serialNumberAlreadyUsed = true;
                        }
                    });
                }
            });
            if (serialNumberAlreadyUsed) {
                throw new Error('@sage/x3-stock/serial-number-range-overlap');
            }
            if (
                this.endingSerialNumber.value !=
                this._calculateEndingSerialNumber(
                    this.startingSerialNumber.value?.code ?? '',
                    Number(this.quantityInPackingUnit.value),
                )
            ) {
                throw new Error(
                    '@sage/x3-stock/pages__mobile_lpn_unlink_stock_lines__notification__same-amount-serial-numbers-in-the-range-to-match-quantity-to-change',
                );
            }

            const _currentRecord = this.stock.getRecordValue(this.quantityBlock.selectedRecordId ?? '');

            if (_currentRecord) {
                this.serialNumberLines.addRecord({
                    quantity: _currentRecord.quantityInPackingUnit,
                    startingSerialNumber: this.startingSerialNumber.value.code,
                    endingSerialNumber: this.endingSerialNumber.value,
                });
                if (
                    !this._stockChangeLines.find(line => {
                        return (
                            Number(line.stockId) === Number(_currentRecord.stockId) &&
                            line.lineNumber === this._currentOperation
                        );
                    })
                ) {
                    this._stockChangeLines[this._currentLine] = {
                        ...this._stockChangeLines[this._currentLine],
                        stockId: String(_currentRecord.stockId),
                        product: this.product.value?.code,
                        location: (_currentRecord as any).locationDestination?.code,
                        lineNumber: this._currentOperation,
                    };
                }

                this._stockChangeLines[this._currentLine].stockDetails?.push({
                    quantityInPackingUnit: this.quantityInPackingUnit.value ?? undefined,
                    packingUnit: _currentRecord.packingUnit?.code,
                    licensePlateNumber: undefined,
                    quantityInStockUnit:
                        Number(this.quantityInPackingUnit.value) *
                        Number(_currentRecord.packingUnitToStockUnitConversionFactor),
                    location: (_currentRecord as any).locationDestination?.code,
                    serialNumber: this.startingSerialNumber.value?.code,
                });

                this._saveDetail();

                _currentRecord.serialNumber = this.startingSerialNumber.value?.code;
                _currentRecord.quantityInPackingUnit = String(0);
                this.stock.setRecordValue(_currentRecord);
                this.quantityInPackingUnit.value = 0;
                this.startingSerialNumber.value = null;
                this.endingSerialNumber.value = null;
                this.locationDestination.isReadOnly = true;

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

    @ui.decorators.section<MobileLpnUnlinkStockLines>({
        isTitleHidden: true,
    })
    mainSection: ui.containers.Section;

    @ui.decorators.section<MobileLpnUnlinkStockLines>({
        title: 'Stock details',
        isTitleHidden: false,
    })
    detailPanelSection: ui.containers.Section;

    /*
     *
     *  Blocks
     *
     */

    @ui.decorators.block<MobileLpnUnlinkStockLines>({
        isTitleHidden: true,
        parent() {
            return this.mainSection;
        },
    })
    bodyBlock: ui.containers.Block;

    @ui.decorators.block<MobileLpnUnlinkStockLines>({
        isTitleHidden: true,
        parent() {
            return this.detailPanelSection;
        },
    })
    detailsBlock: ui.containers.Block;

    @ui.decorators.gridRowBlock<MobileLpnUnlinkStockLines>({
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
        },
    })
    quantityBlock: ui.containers.GridRowBlock;

    @ui.decorators.block<MobileLpnUnlinkStockLines>({
        isTitleHidden: true,
        parent() {
            return this.detailPanelSection;
        },
    })
    locationDestinationBlock: ui.containers.Block;

    @ui.decorators.block<MobileLpnUnlinkStockLines>({
        isTitleHidden: true,
        parent() {
            return this.detailPanelSection;
        },
    })
    serialNumberBlock: ui.containers.Block;

    /*
     *
     *  Fields
     *
     */

    @ui.decorators.referenceField<MobileLpnUnlinkStockLines, LotsSites>({
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
                storageSite: { code: this._stockSite.code },
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

    @ui.decorators.referenceField<MobileLpnUnlinkStockLines, LotsSites>({
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
                storageSite: { code: this._stockSite.code },
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

    @ui.decorators.referenceField<MobileLpnUnlinkStockLines, SerialNumber>({
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
                stockSite: { code: this._stockSite.code },
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

    @ui.decorators.selectField<MobileLpnUnlinkStockLines>({
        parent() {
            return this.bodyBlock;
        },
        title: 'Status',
        placeholder: 'Scan or select...',
        isTransient: true,
        isFullWidth: true,
        async onChange() {
            await handleFilterOnChange(this, this.status, this.status.value);
        },
    })
    status: ui.fields.Select;

    @ui.decorators.selectField<MobileLpnUnlinkStockLines>({
        parent() {
            return this.bodyBlock;
        },
        title: 'Unit',
        placeholder: 'Scan or select...',
        isTransient: true,
        isFullWidth: true,
        async onChange() {
            await handleFilterOnChange(this, this.packingUnit, this.packingUnit.value);
        },
    })
    packingUnit: ui.fields.Select;

    @ui.decorators.numericField<MobileLpnUnlinkStockLines>({
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

    @ui.decorators.textField<MobileLpnUnlinkStockLines>({
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

    @ui.decorators.textField<MobileLpnUnlinkStockLines>({
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

    @ui.decorators.textField<MobileLpnUnlinkStockLines>({
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

    @ui.decorators.textField<MobileLpnUnlinkStockLines>({
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

    /*
     *
     *  Technical Fields
     *
     */

    @ui.decorators.tableField<MobileLpnUnlinkStockLines, Stock>({
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
            return generateStockTableFilter(this);
        },
        columns: [
            ui.nestedFields.reference<MobileLpnUnlinkStockLines, Stock, ProductSite>({
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
                ],
            }),
            ui.nestedFields.reference<MobileLpnUnlinkStockLines, Stock, Location>({
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
            ui.nestedFields.text({
                bind: 'serialNumber',
                isReadOnly: true,
                isHidden() {
                    return this.serialNumber.isHidden ?? false;
                },
            }),
            ui.nestedFields.reference<MobileLpnUnlinkStockLines, Stock, StockStatus>({
                bind: 'status',
                valueField: 'code',
                node: '@sage/x3-stock-data/StockStatus',
                isReadOnly: true,
                isHidden() {
                    return this.status.isHidden ?? false;
                },
            }),
            ui.nestedFields.technical<MobileLpnUnlinkStockLines, Stock, UnitOfMeasure>({
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
            ui.nestedFields.numeric({
                bind: 'quantityInPackingUnit' as any,
                isReadOnly: true,
                isHidden: false, // special field that always gets displayed
                isTransient: false,
                postfix(value, rowValue?: Dict<any>) {
                    return `/ ${ui.formatNumberToCurrentLocale(
                        this.$.detailPanel?.isHidden
                            ? rowValue?.quantityInPackingUnitOrigin ?? 0
                            : rowValue?.quantityInPackingUnitCopy ?? 0,
                        rowValue?.packingUnit?.numberOfDecimals ?? 0,
                    )} ${rowValue?.packingUnit?.code ?? ''}`;
                },
                title: 'Quantity to unlink', // this is important to display a title in the grid row block
                isTitleHidden: false,
                isMandatory: true,
                isFullWidth: true,
                max(rowValue?: Stock) {
                    return (<any>(<unknown>rowValue))?.quantityInPackingUnitCopy ?? 0;
                },
                scale(value, rowValue?: Dict<any>) {
                    return rowValue?.packingUnit?.numberOfDecimals ?? 0;
                },
            }),
            ui.nestedFields.numeric({
                bind: 'quantityInPackingUnitCopy' as any,
                isHidden: true,
                isTitleHidden: true,
                isTransient: true,
            }),
            ui.nestedFields.numeric({
                bind: 'quantityInPackingUnitOrigin' as any,
                isHidden: true,
                isTitleHidden: true,
                isTransient: true,
            }),
            ui.nestedFields.numeric({
                bind: 'packingUnitToStockUnitConversionFactor',
                isReadOnly: true,
                isHidden() {
                    return this.packingUnitToStockUnitConversionFactor.isHidden ?? false;
                },
            }),
            ui.nestedFields.reference<MobileLpnUnlinkStockLines, Stock, Location>({
                bind: 'locationDestination' as any,
                valueField: 'code',
                node: '@sage/x3-stock-data/Location',
                isReadOnly: true,
                isHidden: true,
                title: 'Destination location',
                isTitleHidden: false,
                isFullWidth: true,
                isTransient: true,
                placeholder: 'Scan or select...',
                filter() {
                    const locationFilter: any = {
                        stockSite: { code: this._stockSite.code },
                        category: { _nin: ['subcontract', 'customer'] },
                    };
                    return locationFilter;
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
            ui.nestedFields.technical<MobileLpnUnlinkStockLines, Stock, Lot>({
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
                        node: '@sage/x3-stock-data/MajorVersionStatus',
                        valueField: 'code',
                    }),
                ],
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
                case '@sage/x3-stock/pages__mobile_lpn_unlink_stock_lines__quantityInPackingUnit_must_be_greater_than_0': {
                    return ui.localize(
                        '@sage/x3-stock/pages__mobile_lpn_unlink_stock_lines__quantityInPackingUnit_must_be_greater_than_0',
                        'The quantity must be greater than 0',
                    );
                }
                case '@sage/x3-stock/pages__mobile_lpn_unlink_stock_lines__error_locationDestination': {
                    return ui.localize(
                        '@sage/x3-stock/pages__mobile_lpn_unlink_stock_lines__error_locationDestination',
                        'The destination location is mandatory',
                    );
                }
                default:
                    return error;
            }
        },
        async onRowSelected(rowId: string, rowItem: Stock) {
            if (this.stock.selectedRecords.length > 0) {
                this.stock.isDisabled = true;
                // quantity
                if (Number(rowItem.quantityInPackingUnit) <= 0) {
                    this.stock.unselectRecord(rowId);
                    this.stock.isDisabled = false;
                    throw new Error(
                        '@sage/x3-stock/pages__mobile_lpn_unlink_stock_lines__quantityInPackingUnit_must_be_greater_than_0',
                    );
                }
                // localization destination
                if (!(rowItem as any).locationDestination) {
                    this.stock.unselectRecord(rowId);
                    this.stock.isDisabled = false;
                    throw new Error('@sage/x3-stock/pages__mobile_lpn_unlink_stock_lines__error_locationDestination');
                }
                //serial Number
                if (this._productSite.product.serialNumberManagementMode === 'globalReceivedIssued') {
                    const startingSerialNumber = await readSerialNumberFromStockId(this, rowItem.stockId, 1);
                    const endingSerialNumber = this._calculateEndingSerialNumber(
                        startingSerialNumber?.code ?? '',
                        Number(rowItem.quantityInPackingUnit),
                    );
                    const endingSerialNumberRead = await readSerialNumberFromStockId(this, rowItem.stockId, -1);

                    if (endingSerialNumberRead?.code !== endingSerialNumber) {
                        this.stock.unselectRecord(rowId);
                        this.stock.isDisabled = false;
                        throw new Error('@sage/x3-stock/serial-number-not-sequential');
                    }
                    this.startingSerialNumber.value = startingSerialNumber;
                    let stockRecord = this.stock.getRecordValue(rowId);
                    if (stockRecord) {
                        stockRecord.serialNumber = startingSerialNumber?.code;
                        this.stock.setRecordValue(stockRecord);
                    }
                }
                this._createDetail();
                this.stock.isDisabled = false;
            }
        },
        onRowUnselected(rowId: string, rowItem: Stock) {
            const _stockRecord = this.stock.getRecordValue(rowId);
            if (_stockRecord) {
                const _stockId = Number(_stockRecord?.stockId);
                const lineIndex = this._stockChangeLines.findIndex(
                    line =>
                        line?.stockId &&
                        Number(line?.stockId) === _stockId &&
                        line.lineNumber === this._currentOperation,
                );
                if (lineIndex > -1) {
                    this._stockChangeLines.splice(lineIndex, 1);
                }
                _stockRecord.quantityInPackingUnit = (_stockRecord as any).quantityInPackingUnitOrigin;
                (_stockRecord as any).quantityInPackingUnitCopy = (_stockRecord as any).quantityInPackingUnitOrigin;
                this.quantityInPackingUnit.value = Number(_stockRecord.quantityInPackingUnit);
                this.stock.setRecordValue(_stockRecord);
                this._savedStockId = '';
                this.serialNumberLines.value = [];
                this._saveLpnOperations();
            }
        },
        async onChange() {
            await this.totalStocks.refresh().catch(() => {
                /* Intentional fire and forget */
            });
        },
        sortColumns(firstColumn, secondColumn) {
            // I don't think this necessary
            if (firstColumn.bind !== secondColumn.bind) {
                //Special case - quantityInPackingUnit column must always appear at the top-right portion of the card (or be the 2nd property of the card)
                if (firstColumn.bind === 'quantityInPackingUnit') {
                    return secondColumn.bind === (this._stockFieldSettings[0] as string) ? 1 : -1;
                } else if (secondColumn.bind === 'quantityInPackingUnit') {
                    return firstColumn.bind === (this._stockFieldSettings[0] as string) ? -1 : 1;
                }

                for (const stockFieldSetting of Object.keys(this._stockFieldSettings)) {
                    // for (const stockFieldSetting of this._stockFieldSettings) {
                    if (!stockFieldSetting || stockFieldSetting === 'none') break;
                    if (firstColumn.bind === (stockFieldSetting as string)) return -1;
                    if (secondColumn.bind === (stockFieldSetting as string)) return 1;
                }

                return 1;
            }
            return 0;
        },
        // TODO: Issue: If packingUnit is the first mobile setting, then the quantityInPackingUnit column will appear at the top-left instead
        mapServerRecord(record: Partial<Stock>) {
            // record is updated by _getResidualQuantity
            const _quantityInPackingUnit = this._getResidualQuantity(record).toString();
            return {
                ...record,
                quantityInPackingUnit: _quantityInPackingUnit,
                locationDestination: (record as any).locationDestination ?? this._getSavedInputs()?.selectedLocation,
            };
        },

        async onRowClick(recordId: string, rowItem: Stock) {
            const _record = this.stock.getRecordValue(recordId);
            const _stockId = Number(rowItem.stockId);
            this.stockDetails.value = [rowItem]; // populate details list
            this.quantityBlock.selectedRecordId = recordId; // populate grid row block
            this._stockId.value = String(_stockId);
            this.locationDestination.value = (<any>_record).locationDestination;
            this.quantityInPackingUnit.value = Number(_record?.quantityInPackingUnit);

            //quantity
            if (Number((rowItem as any).quantityInPackingUnitOrigin) <= 0) {
                throw new Error(
                    '@sage/x3-stock/pages__mobile_lpn_unlink_stock_lines__quantityInPackingUnit_must_be_greater_than_0',
                );
            }

            const lineIndex = this._stockChangeLines.findIndex(
                line => Number(line?.stockId) === _stockId && line.lineNumber === this._currentOperation,
            );
            if (lineIndex > -1) {
                this._currentLine = lineIndex;
                if (this._productSite.product.serialNumberManagementMode === 'globalReceivedIssued') {
                    this.serialNumberLines.isHidden = false;
                    this.serialNumberLines.value =
                        this._stockChangeLines[this._currentLine].stockDetails?.map(line => ({
                            ...line,
                            _id: this.serialNumberLines.generateRecordId(),
                            startingSerialNumber: line.serialNumber,
                            endingSerialNumber: this._calculateEndingSerialNumber(
                                line?.serialNumber ?? '',
                                Number(line.quantityInPackingUnit),
                            ),
                            quantity: line.quantityInPackingUnit,
                            location: line.location,
                        })) ?? [];
                    let _currentRecord = _record;
                    if (_currentRecord) {
                        _currentRecord.quantityInPackingUnit = String(0);
                        this.quantityInPackingUnit.value = 0;
                        this.stock.setRecordValue(_currentRecord);
                    }

                    this.locationDestination.isReadOnly = true;
                } else {
                    this.locationDestination.isReadOnly = false;
                }
            } else {
                if (Number(this._savedStockId) !== _stockId) {
                    this._currentLine = this._stockChangeLines.length;
                    this._stockChangeLines.push({
                        stockDetails: [],
                    });
                    this._savedStockId = String(_stockId);
                    if (this._productSite.product.serialNumberManagementMode === 'globalReceivedIssued') {
                        this.serialNumberLines.value = [];
                    }
                }
                this.locationDestination.isReadOnly = false;
            }
            this.startingSerialNumber.value = null;
            this.endingSerialNumber.value = null;
            // this.locationDestination.isReadOnly = this._stockChangeLines[this._currentLine]?.stockDetails?.length > 0;

            // to remove any residual validation error from the previous onRowClick: user inputs an invalid quantity and then clicks Cancel
            await this.$.commitValueAndPropertyChanges();
            await this.stock.validateWithDetails();

            if (this.$.detailPanel) this.$.detailPanel.isHidden = false;

            // TODO: Issue: page-level businessAction buttons will overlay on top of any detailPanel footer buttons. And footer buttons are still be partially obscured
            this.nextButton.isHidden = true;
        },
    })
    stock: ui.fields.Table<Stock>;

    /*
     *
     *  Detail panel fields
     *
     */

    @ui.decorators.detailListField<MobileLpnUnlinkStockLines, Stock>({
        parent() {
            return this.detailsBlock;
        },
        node: '@sage/x3-stock-data/Stock',
        isTransient: true,
        isFullWidth: true,
        isTitleHidden: true,
        //title: 'Stock details',
        fields: [
            ui.nestedFields.reference<MobileLpnUnlinkStockLines, Stock, ProductSite>({
                bind: 'product',
                valueField: { product: { code: true } },
                node: '@sage/x3-master-data/ProductSite',
                title: 'Product',
                isReadOnly: true,
                isHidden: false,
            }),
            ui.nestedFields.reference<MobileLpnUnlinkStockLines, Stock, Location>({
                bind: 'location',
                valueField: 'code',
                node: '@sage/x3-stock-data/Location',
                title: 'Location',
                isReadOnly: true,
                isHidden: false,
            }),
            ui.nestedFields.reference<MobileLpnUnlinkStockLines, Stock, Location>({
                bind: 'locationDestination' as any,
                valueField: 'code',
                node: '@sage/x3-stock-data/Location',
                title: 'Destination location',
                placeholder: 'Scan or select...',
                isReadOnly: true,
                isHidden: true,
                isTransient: true,
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
            ui.nestedFields.reference<MobileLpnUnlinkStockLines, Stock, Lot>({
                node: '@sage/x3-stock-data/Lot',
                bind: 'lotReference',
                valueField: { majorVersion: { code: true } },
                title: 'Major version',
                isReadOnly: true,
                isHidden: (value: Lot) => {
                    return !value?.majorVersion;
                },
            }),
            ui.nestedFields.reference<MobileLpnUnlinkStockLines, Stock, Lot>({
                node: '@sage/x3-stock-data/Lot',
                bind: 'lotReference',
                valueField: 'expirationDate',
                title: 'Expiration date',
                isReadOnly: true,
                // (X3-252730) TODO: Issue: Even though there is a value and so it return backs false for isHidden, reference value does not show up
                isHidden(value: Lot) {
                    return (
                        !this.product.value ||
                        this.product.value.expirationManagementMode === 'notManaged' ||
                        !value?.expirationDate ||
                        Date.parse(value.expirationDate) > Date.now()
                    ); // TODO: Issue: What's the best way to check if date is null or invalid?
                },
            }),
            ui.nestedFields.reference<MobileLpnUnlinkStockLines, Stock, Lot>({
                node: '@sage/x3-stock-data/Lot',
                bind: 'lotReference',
                valueField: 'useByDate',
                title: 'Use-by date',
                isReadOnly: true,
                // (X3-252730) TODO: Issue: Even though there is a value and so it return backs false for isHidden, reference value does not show up
                isHidden(value: Lot) {
                    return (
                        !this.product.value ||
                        this.product.value.expirationManagementMode === 'notManaged' ||
                        !value?.useByDate ||
                        Date.parse(value.useByDate) > Date.now()
                    );
                },
            }),
            ui.nestedFields.reference<MobileLpnUnlinkStockLines, Stock, Lot>({
                node: '@sage/x3-stock-data/Lot',
                bind: 'lotReference',
                valueField: 'lotCustomField1',
                title: 'Lot custom field 1',
                isReadOnly: true,
                isHidden(value: Lot) {
                    return !value?.lotCustomField1;
                },
            }),
            ui.nestedFields.reference<MobileLpnUnlinkStockLines, Stock, Lot>({
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
            ui.nestedFields.numeric({
                bind: 'quantityInPackingUnitCopy' as any,
                title: 'Packing qty.',
                isReadOnly: true,
                isHidden: hideWhenEmptyValue,
                postfix(value, rowValue?: Dict<any>) {
                    return rowValue?.packingUnit?.code ?? '';
                },
                scale(value, rowValue?: Dict<any>) {
                    return rowValue?.packingUnit?.numberOfDecimals ?? 0;
                },
            }),
            ui.nestedFields.numeric({
                bind: 'quantityInStockUnit' as any,
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
                bind: 'allocatedQuantity' as any,
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
            ui.nestedFields.reference<MobileLpnUnlinkStockLines, Stock, StockStatus>({
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

    @ui.decorators.numericField<MobileLpnUnlinkStockLines>({
        parent() {
            return this.locationDestinationBlock;
        },
        postfix(value, rowValue?: Dict<any>) {
            const _record = <any>(<unknown>this.stock.getRecordValue(this.quantityBlock.selectedRecordId ?? ''));
            return `/ ${ui.formatNumberToCurrentLocale(
                this.$.detailPanel && this.$.detailPanel.isHidden
                    ? _record?.quantityInPackingUnitOrigin ?? 0
                    : _record?.quantityInPackingUnitCopy ?? 0,
                _record?.packingUnit?.numberOfDecimals ?? 0,
            )} ${_record?.packingUnit?.code ?? ''}`;
        },
        title: 'Quantity to unlink', // this is important to display a title in the grid row block
        isMandatory: true,
        isFullWidth: true,
        isTransient: true,
        max() {
            return (<any>(<unknown>this.stock.getRecordValue(this.quantityBlock?.selectedRecordId ?? '')))
                ?.quantityInPackingUnitCopy;
        },
        scale() {
            return (<any>(<unknown>this.stock.getRecordValue(this.quantityBlock?.selectedRecordId ?? '')))
                ?.packingUnit?.numberOfDecimals ?? 0;
        },
        async onChange() {
            await this._onQuantityInPackingUnit();
        },
    })
    quantityInPackingUnit: ui.fields.Numeric;

    @ui.decorators.referenceField<MobileLpnUnlinkStockLines, Location>({
        parent() {
            return this.locationDestinationBlock;
        },
        title: 'Destination location',
        placeholder: 'Scan or select...',
        node: '@sage/x3-stock-data/Location',
        valueField: 'code',
        isTransient: true,
        isMandatory: true,
        canFilter: false,
        isHidden: false,
        isReadOnly: false,
        /*    isReadOnly() {
            return this._stockChangeLines[this._currentLine]?.stockDetails?.length > 0;
        }, */
        isFullWidth: true,
        filter() {
            const locationFilter: any = {
                stockSite: { code: this._stockSite.code },
                category: { _nin: ['subcontract', 'customer'] },
            };
            return locationFilter;
        },
        async onChange() {
            await this._onLocationDestination();
        },
        columns: [
            ui.nestedFields.text({
                bind: 'code',
                title: 'code',
                isReadOnly: true,
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
    locationDestination: ui.fields.Reference<Location>;

    @ui.decorators.referenceField<MobileLpnUnlinkStockLines, SerialNumber>({
        parent() {
            return this.serialNumberBlock;
        },
        title: 'Starting serial number',
        placeholder: 'Scan or select…',
        node: '@sage/x3-stock-data/SerialNumber',
        valueField: 'code',
        isMandatory: true,
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
        ],
    })
    startingSerialNumber: ui.fields.Reference<SerialNumber>;

    @ui.decorators.textField<MobileLpnUnlinkStockLines>({
        parent() {
            return this.serialNumberBlock;
        },
        title: 'Ending serial number',
        isMandatory: true,
        isTransient: true,
        isReadOnly: true,
        isFullWidth: true,
        async validation(value: string) {
            if (!value || this._productSite?.product?.serialNumberManagementMode !== 'globalReceivedIssued') return;
            const _currentRecord = this.stock.getRecordValue(this.quantityBlock.selectedRecordId ?? '');
            const _currentQty = Number(_currentRecord?.quantityInPackingUnit);

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

    @ui.decorators.textField<MobileLpnUnlinkStockLines>({
        parent() {
            return this.serialNumberBlock;
        },
        isTransient: true,
        isHidden: true,
    })
    _stockId: ui.fields.Text;

    @ui.decorators.tableField<MobileLpnUnlinkStockLines>({
        parent() {
            return this.serialNumberBlock;
        },
        canFilter: false,
        canSelect: false,
        canExport: false,
        canResizeColumns: false,
        canUserHideColumns: false,
        isTitleHidden: false,
        // (X3-257606) TODO: Issue: Deleting table row(s) that are loaded in a non-transient causes errors.
        // After this is fixed, change this table back to isTransient: false
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
                    return (
                        this.stock.getRecordValue(this.quantityBlock.selectedRecordId ?? '')?.packingUnit?.code ?? ''
                    );
                },
                scale() {
                    return this.stock.getRecordValue(this.quantityBlock.selectedRecordId ?? '')?.packingUnit?.numberOfDecimals ?? 0;
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
                        const removedIndexSerialNumber = this._stockChangeLines[
                            this._currentLine
                        ].stockDetails?.findIndex(
                            number => number.serialNumber === removedRecordSerialNumber?.startingSerialNumber,
                        );
                        if (removedIndexSerialNumber) {
                            this._stockChangeLines[this._currentLine].stockDetails?.splice(removedIndexSerialNumber, 1);
                        }

                        this._saveDetail();
                        // Clear quantity of this._currentLine
                        const _currentRecord = this.stock.getRecordValue(this.quantityBlock?.selectedRecordId ?? '');
                        if (_currentRecord) {
                            _currentRecord.quantityInPackingUnit = String(0);
                            this.stock.setRecordValue(_currentRecord);
                        }
                        //remove from the card
                        this.serialNumberLines.removeRecord(recordId);
                    }

                    this.startingSerialNumber.isDisabled = false;
                    this.locationDestination.isReadOnly = this.serialNumberLines.value.length !== 0;
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
     *  Helper Functions
     *
     */

    // should always display quantity and packing display top-right regardless of settings
    // FUNADCSEARCH, click on maginfying glass and input DIRECT CALL and click the icon
    private _formatUnit(value: ExtractEdgesPartial<ProductPackingUnits>) {
        return value.packingUnit?.code === this.product.value?.stockUnit?.code &&
            value.packingUnitToStockUnitConversionFactor === '1'
            ? value.packingUnit?.code
            : `${value.packingUnit?.code} = ${value.packingUnitToStockUnitConversionFactor} ${this.product.value?.stockUnit?.code}`;
    }

    // TODO: Obsolete: no way to fetch nested collection property in a non-transient way
    private async _fetchProductPackingUnits(
        product: ExtractEdgesPartial<Product>,
    ): Promise<ExtractEdgesPartial<Product>> {
        return {
            packingUnits: extractEdges<ProductPackingUnits>(
                <Edges<ProductPackingUnits>>(
                    await this.$.graph
                        .node('@sage/x3-master-data/Product')
                        .read(
                            {
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
                            `${product.code}`,
                        )
                        .execute()
                )?.packingUnits?.query,
            ),
        };
    }

    private _getSavedInputs(): inputsLpnUnlink {
        return JSON.parse(this.$.storage.get('mobile-lpnOperations') as string) as inputsLpnUnlink;
    }

    private _saveDetail() {
        const _currentStockChangeLines = this._stockChangeLines[this._currentLine];

        this._stockChangeLines[this._currentLine] = {
            ..._currentStockChangeLines,
        };

        this._saveLpnOperations();
    }

    private async _createDetail() {
        this.stock.selectedRecords.forEach(rowId => {
            const stockRecord = this.stock.getRecordValue(rowId);
            if (stockRecord) {
                const lineIndex = this._stockChangeLines.findIndex(
                    line =>
                        Number(line?.stockId) === Number(stockRecord.stockId) &&
                        line.lineNumber === this._currentOperation,
                );
                if (lineIndex === -1 && (stockRecord as any).locationDestination) {
                    if (!this._stockChangeLines[this._stockChangeLines.length]) {
                        this._stockChangeLines.push({
                            stockDetails: [],
                        });
                        this._stockChangeLines[this._stockChangeLines.length - 1].stockDetails?.push({
                            quantityInPackingUnit: stockRecord.quantityInPackingUnit,
                            packingUnit: stockRecord.packingUnit?.code,
                            licensePlateNumber: undefined,
                            quantityInStockUnit:
                                Number(stockRecord.quantityInPackingUnit) *
                                Number(stockRecord.packingUnitToStockUnitConversionFactor),
                            location: (stockRecord as any).locationDestination?.code,
                            serialNumber: stockRecord.serialNumber ?? undefined,
                        });
                    }
                    this._stockChangeLines[this._stockChangeLines.length - 1] = {
                        ...this._stockChangeLines[this._stockChangeLines.length - 1],
                        stockId: String(stockRecord.stockId),
                        product: this.product.value?.code,
                        location: (stockRecord as any).locationDestination?.code,
                        lineNumber: this._currentOperation,
                    };
                    this._saveDetail();
                }
            }
        });
    }

    private async _initStockChangeLines(): Promise<void> {
        if (this._stockChangeLines.length === 0 || this._stockChangeLines[this._currentLine] === undefined) return;

        if (this._stockChangeLines[this._currentLine].stockDetails?.length === 0) {
            this._stockChangeLines[this._currentLine] = {
                ...this._stockChangeLines[this._currentLine],
            };
        } else {
            this.serialNumberLines.isHidden = false;
            this.serialNumberLines.value =
                this._stockChangeLines[this._currentLine].stockDetails?.map(line => ({
                    ...line,
                    _id: this.serialNumberLines.generateRecordId(),
                })) ?? [];
        }
    }

    private _getResidualQuantity(record: Partial<Stock>): number {
        const _savedInputs: inputsLpnUnlink = this._getSavedInputs();
        const _StockId = Number(record.stockId);
        const _isGlobalSerial = record?.product?.product?.serialNumberManagementMode === 'globalReceivedIssued';
        let _sumOfQuantityInPackingUnit = 0;
        let _quantityInPackingUnit = Number(record.quantityInPackingUnit);
        let _quantityInPackingUnitCopy = _quantityInPackingUnit;

        if (this._stockChangeLines === undefined) {
            this._stockChangeLines = _savedInputs?.lpnOperations?.stockChangeLines ?? [];
        }
        if (this._currentLine === undefined) {
            this._currentLine = Number(_savedInputs.currentLine);
        }
        if (this._currentOperation === undefined) {
            this._currentOperation = Number(_savedInputs.currentOperation);
        }

        if (!(record as any).quantityInPackingUnitOrigin) {
            this._stockChangeLines
                ?.filter(line => Number(line.stockId) === _StockId && line.lineNumber !== this._currentOperation)
                .forEach(line => {
                    _sumOfQuantityInPackingUnit += Number(
                        line.stockDetails?.reduce<decimal>((acc, lineDetail) => {
                            return acc + Number(lineDetail.quantityInPackingUnit);
                        }, 0),
                    );
                });
            _quantityInPackingUnitCopy = _quantityInPackingUnit - _sumOfQuantityInPackingUnit;
            (record as any).quantityInPackingUnitOrigin = _quantityInPackingUnitCopy;
        } else {
            _quantityInPackingUnitCopy = Number((record as any).quantityInPackingUnitOrigin);
        }

        _sumOfQuantityInPackingUnit = 0;

        if (Number(this._stockChangeLines?.length) > 0) {
            this._stockChangeLines
                .filter(line => Number(line.stockId) === _StockId && line.lineNumber === this._currentOperation)
                .forEach(line => {
                    if (!_isGlobalSerial) {
                        _quantityInPackingUnit = 0;
                    }
                    _sumOfQuantityInPackingUnit += Number(
                        line.stockDetails?.reduce<decimal>((acc, lineDetail) => {
                            return acc + Number(lineDetail.quantityInPackingUnit);
                        }, 0),
                    );
                });

            if (_isGlobalSerial) {
                _quantityInPackingUnitCopy -= _sumOfQuantityInPackingUnit;
            } else {
                _quantityInPackingUnit += _sumOfQuantityInPackingUnit;
            }
        }

        (record as any).quantityInPackingUnitCopy = _quantityInPackingUnitCopy;
        return Math.min(Number(_quantityInPackingUnit), Number(_quantityInPackingUnitCopy));
    }

    private _saveLpnOperations() {
        const savedInputs = this._getSavedInputs();
        savedInputs.lpnOperations.stockChangeLines = this._stockChangeLines;
        this.$.storage.set('mobile-lpnOperations', JSON.stringify(savedInputs));
    }
    private async _getStockStatus(): Promise<string[]> {
        const response = await this.$.graph
            // with 'provides' property defined in accessCode of this node, should automatically return only transactions that are accessible for the current user
            .node('@sage/x3-stock-data/StockStatus')
            .query(
                ui.queryUtils.edgesSelector({
                    _id: true,
                    code: true,
                }),
            )
            .execute();

        if (!response.edges || response.edges.length === 0) {
            throw new Error(
                ui.localize(
                    '@sage/x3-stock/pages__mobile_lpn_unlink_stock_lines__notification__invalid_stock_status_error',
                    'Stock status not found. Select another stock status.',
                ),
            );
        }

        // transform Stock status response into a string array
        return response.edges.map((stockStatus: any) => {
            return stockStatus.node.code;
        });
    }

    private _initPackingUnitFields() {
        let productPackingList = extractEdges<ProductPackingUnits>(this._productSite.product.packingUnits.query).filter(
            productPacking => {
                return !!productPacking.packingUnit?.code;
            },
        );

        this._packingUnits = productPackingList.map(productPacking => {
            return { node: productPacking };
        });

        let productPackingUnitSelectValues = productPackingList.map(productPacking => {
            return `${productPacking.packingUnit.code}`;
        });

        this.packingUnit.options = [this._productSite.product.stockUnit.code, ...productPackingUnitSelectValues];
    }

    private async _onChangeBody() {
        const _currentRecord = this.stock.getRecordValue(this.quantityBlock.selectedRecordId ?? '');
        const currentQty = Number(_currentRecord?.quantityInPackingUnit);
        if (!_currentRecord || !currentQty || !this.startingSerialNumber.value) {
            this.endingSerialNumber.value = null;
            return;
        }

        this.startingSerialNumber.value.code = this.startingSerialNumber.value?.code?.toUpperCase();
        if (currentQty > 1) {
            this.endingSerialNumber.value = this._calculateEndingSerialNumber(
                this.startingSerialNumber.value?.code ?? '',
                currentQty,
            );
        } else {
            this.endingSerialNumber.value = this.startingSerialNumber.value?.code ?? '';
        }
        const qtyTotal =
            this._stockChangeLines[this._currentLine]?.stockDetails?.reduce<decimal>((acc, curr) => {
                return acc + Number(curr.quantityInPackingUnit);
            }, 0) ?? 0;
        if (qtyTotal + currentQty > (_currentRecord as any).quantityInPackingUnitOrigin)
            this.addSerialRange.isHidden = true;
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

    private async _onLocationDestination() {
        const _currentRecord = this.stock.getRecordValue(this.quantityBlock?.selectedRecordId ?? '');
        if (_currentRecord) {
            (_currentRecord as any).locationDestination = this.locationDestination.value;
            this.stock.setRecordValue(_currentRecord);
            await this.$.commitValueAndPropertyChanges();
        }
    }

    private async _onQuantityInPackingUnit() {
        const _currentRecord = this.stock.getRecordValue(this.quantityBlock?.selectedRecordId ?? '');
        if (_currentRecord) {
            _currentRecord.quantityInPackingUnit = String(this.quantityInPackingUnit.value);
            this.stock.setRecordValue(_currentRecord);
            await this.$.commitValueAndPropertyChanges();
        }
    }

    private _calculateEndingSerialNumber(startingSerialNumber: string, quantity: number): string {
        return startingSerialNumber.replace(/\d+$/, match => {
            const endingNumber = (Number(match) + quantity - 1).toString();
            const lengthDiff = Math.max(endingNumber.length - match.length, 0);
            return endingNumber.padStart(match.length + lengthDiff, '0');
        });
    }

    private async _getProductSite(productCode: string): Promise<any | never> {
        let productSiteToReceive;
        if (productCode) {
            // read product site record
            productSiteToReceive = await this.$.graph
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
                    `${productCode}|${this._stockSite.code}`,
                )
                .execute();
        }

        if (productSiteToReceive) {
            return productSiteToReceive as ProductSite;
        }

        // If an error occurred during the API call
        await this._notifier.showAndWait(
            ui.localize(
                '@sage/x3-stock/pages__mobile_stock_change_details__notification__invalid_product_site_error',
                `Could not retrieve your product {{ productCode }} for the site {{ siteCode }}`,
                {
                    productCode: this.product.value,
                    siteCode: this._stockSite.code,
                },
            ),
            'error',
        );
        this.$.setPageClean();
        return this.$.router.goTo('@sage/x3-stock/MobileLpnUnlink', { ReturnFromDetail: 'yes' });
    }
}
