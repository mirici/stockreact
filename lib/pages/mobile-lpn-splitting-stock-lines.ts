//import framework
import { decimal, Dict, Edges, extractEdges, ExtractEdges, ExtractEdgesPartial, Filter } from '@sage/xtrem-client';
import * as ui from '@sage/xtrem-ui';
//import client-function
import { dialogMessage } from '@sage/x3-master-data/lib/client-functions/dialogs';
import { getCountSerialNumber } from '@sage/x3-stock-data/lib/client-functions/get-count-serial-number';
import { NotifyAndWait } from '../client-functions/display';
import {
    generateStockTableFilter,
    handleFilterOnChange,
    managePages,
    readSerialNumberFromStockId,
    removeFilters,
} from '../client-functions/manage-pages';
//import node
import { Product, ProductPackingUnits, ProductSite, UnitOfMeasure } from '@sage/x3-master-data-api';
import { GraphApi, LpnOperations, LpnOperationsLineInput } from '@sage/x3-stock-api';
import {
    LicensePlateNumberInput,
    Location,
    Lot,
    LotsSites,
    SerialNumber,
    Stock,
    StockSearchFilter,
    StockStatus,
} from '@sage/x3-stock-data-api';
import { Site } from '@sage/x3-system-api';
import { inputsLpnSplitting } from './mobile-lpn-splitting';

// we don't want to hide numeric field with value of 0
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

@ui.decorators.page<MobileLpnSplittingStockLines>({
    module: 'x3-stock',
    title: 'LPN splitting',
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
        const lpnOperations: ExtractEdges<LpnOperations> = JSON.parse(this.$.queryParameters.lpnOperations as string);
        const _savedInputs = this._getSavedInputs();
        this._selectedLicensePlateNumber = _savedInputs?.selectedLicensePlateNumber;
        this._licensePlateNumberDestination = _savedInputs?.licensePlateNumberDestination;

        // Initialize header card
        this._stockSite = lpnOperations.stockSite;
        this._licensePlateNumber.value = this._selectedLicensePlateNumber.code ?? null;
        this.headerLocation.value = (this._selectedLicensePlateNumber.location as unknown as Location).code;
        this.headerLot.value = this.$.queryParameters.lot as string;

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

        this._stockChangeLines = _savedInputs?.lpnOperations?.stockChangeLines ?? [];
        this._currentLine = _savedInputs?.currentLine ?? 0;
        this._currentOperation = _savedInputs?.currentOperation ?? 0;
        await this._initstockChangeLines();
        this.status.options = await this._getStockStatus();
        const storageProductSite = _savedInputs?.selectedProduct;
        this._productSite = await this._getProductSite(storageProductSite.code);
        if (!this.packingUnit.isHidden) this._initPackingUnitFields();
        this.headerProduct.value = this._productSite.product.code;
        if (this._productSite.product.serialNumberManagementMode !== 'globalReceivedIssued') {
            this.addSerialRange.isHidden = true;
            this.serialNumberBlock.isHidden = true;
            this.serialNumberLines.isTitleHidden = true;
        }
        this.serialNumberLines.title = 'Serial number(s) to split';
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
export class MobileLpnSplittingStockLines extends ui.Page<GraphApi> {
    private _stockSite: ExtractEdges<Site>;

    private _stockFilter: Filter<any>; // TODO Issue: Could this be even more strongly typed?
    private _stockFieldSettings: StockSearchFilter[] = [];
    private _unitMap: Map<string, ExtractEdgesPartial<ProductPackingUnits>> = new Map<
        string,
        ExtractEdgesPartial<ProductPackingUnits>
    >();
    private _stockChangeLines: LpnOperationsLineInput[];
    private _selectedLicensePlateNumber: LicensePlateNumberInput;
    private _licensePlateNumberDestination: LicensePlateNumberInput;
    private _currentLine: number;
    private _currentOperation: number;
    _packingUnits: packingUnit[];
    private _productSite: ProductSite;
    private _notifier = new NotifyAndWait(this);

    private _savedStockId: string;

    /*
     *
     *  Header fields
     *
     */

    @ui.decorators.textField<MobileLpnSplittingStockLines>({
        isTransient: true,
        isTitleHidden: true,
        isReadOnly: true,
    })
    _licensePlateNumber: ui.fields.Text;

    @ui.decorators.textField<MobileLpnSplittingStockLines>({
        isTransient: true,
        isTitleHidden: true,
        isReadOnly: true,
    })
    headerProduct: ui.fields.Text;

    @ui.decorators.referenceField<MobileLpnSplittingStockLines, Product>({
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
            ui.nestedFields.reference<MobileLpnSplittingStockLines, Product, UnitOfMeasure>({
                node: '@sage/x3-master-data/UnitOfMeasure',
                bind: 'stockUnit',
                valueField: 'code',
                isHidden: true,
            }),
            ui.nestedFields.reference<MobileLpnSplittingStockLines, Product, UnitOfMeasure>({
                node: '@sage/x3-master-data/UnitOfMeasure',
                bind: 'stockUnit',
                valueField: 'numberOfDecimals',
                isHidden: true,
            }),
        ],
    })
    product: ui.fields.Reference<Product>;

    @ui.decorators.textField<MobileLpnSplittingStockLines>({
        isTransient: true,
        isTitleHidden: true,
        isReadOnly: true,
    })
    headerLocation: ui.fields.Text;

    @ui.decorators.textField<MobileLpnSplittingStockLines>({
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

    @ui.decorators.checkboxField<MobileLpnSplittingStockLines>({
        isHidden: true,
        isDisabled: true,
    })
    isLocationManaged: ui.fields.Checkbox;

    @ui.decorators.checkboxField<MobileLpnSplittingStockLines>({
        isHidden: true,
        isDisabled: true,
    })
    isLicensePlateNumberManaged: ui.fields.Checkbox;

    @ui.decorators.countField<MobileLpnSplittingStockLines>({
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

    @ui.decorators.pageAction<MobileLpnSplittingStockLines>({
        title: 'Next',
        shortcut: ['f2'], // TODO Implement: What should the shortcut be for this button?
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

                this._createDetail();
                await this.stock.refresh();
                await this.$.commitValueAndPropertyChanges();
                this.$.setPageClean();
                const savedInputs = this._getSavedInputs();
                savedInputs.currentLine = this._currentLine;
                this.$.storage.set('mobile-lpnOperations', JSON.stringify(savedInputs));
                this.$.router.goTo('@sage/x3-stock/MobileLpnSplitting', { ReturnFromDetail: 'yes' });
            } else {
                await dialogMessage(
                    this,
                    'error',
                    ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                    ui.localize(
                        '@sage/x3-stock/pages_mobile_lpn_splitting_stock_lines__notification__no_stock_error',
                        `Select at least one stock line.`,
                    ),
                );
            }
        },
    })
    nextButton: ui.PageAction;

    @ui.decorators.pageAction<MobileLpnSplittingStockLines>({
        title: 'Cancel',
        //shortcut: ['f2'], // TODO Implement: What should the shortcut be for this button?
        buttonType: 'secondary',
        async onClick() {
            // even though the user clicks Cancel, you have to still revert any possible changes (this is how GridRowBlock works)

            this.stock.unselectRecord(this.quantityBlock.selectedRecordId);
            let currentRecord = this.stock.getRecordValue(this.quantityBlock.selectedRecordId);
            this._stockChangeLines.splice(this._currentLine, 1);
            currentRecord.quantityInPackingUnit = (currentRecord as any).quantityInPackingUnitOrigin;
            (currentRecord as any).quantityInPackingUnitCopy = (currentRecord as any).quantityInPackingUnitOrigin;
            this.quantityInPackingUnit.value = Number(currentRecord.quantityInPackingUnit);
            this.stock.setRecordValue(currentRecord);
            this._savedStockId = null;
            this._savelpnOperations();

            this.$.detailPanel.isHidden = true;
            // TODO Issue: page-level businessAction buttons will overlay on top of any detailPanel footer buttons. And footer buttons are still be partially obscured
            this.nextButton.isHidden = false;
        },
    })
    helperCancelButton: ui.PageAction;

    @ui.decorators.pageAction<MobileLpnSplittingStockLines>({
        title: 'Select',
        //shortcut: ['f2'], // TODO Implement: What should the shortcut be for this button?
        buttonType: 'primary',
        onError(error) {
            switch (error.message) {
                case '@sage/x3-stock/pages_mobile_lpn_splitting_stock_lines__notification__error_startingSerialNumberMandatory': {
                    return ui.localize(
                        '@sage/x3-stock/pages_mobile_lpn_splitting_stock_lines__notification__error_startingSerialNumberMandatory',
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

            const errors: ui.ValidationResult[] = await this.stock.validateWithDetails(); // TODO Verify: Is there a better way to validate a single table row, rather an entire table
            if (errors.length === 0) {
                // close helper panel only when there is no validation errors

                // by using GridRowBlock, the quantity field will be automatically updated on the stock table as well
                let currentRecord = this.stock.getRecordValue(this.quantityBlock.selectedRecordId);
                if (this._productSite.product.serialNumberManagementMode === 'globalReceivedIssued') {
                    if (
                        Number(currentRecord.quantityInPackingUnit) !== 0 ||
                        this._stockChangeLines[this._currentLine]?.stockDetails?.length === 0
                    ) {
                        throw new Error(
                            '@sage/x3-stock/pages_mobile_lpn_splitting_stock_lines__notification__error_startingSerialNumberMandatory',
                        );
                    }
                } else {
                    if (this.quantityInPackingUnit.value <= 0) {
                        await dialogMessage(
                            this,
                            'error',
                            ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                            ui.localize(
                                '@sage/x3-stock/pages_mobile_lpn_splitting_stock_lines__quantityInPackingUnit_must_be_greater_than_0',
                                'The quantity must be greater than 0',
                            ),
                        );
                        return;
                    }
                    if (this.quantityInPackingUnit.value > Number((currentRecord as any).quantityInPackingUnitCopy)) {
                        await dialogMessage(
                            this,
                            'error',
                            ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                            `${ui.localize(
                                '@sage/x3-stock/pages_mobile_lpn_splitting_stock_lines__quantityInPackingUnit_must_be_smaller_than',
                                'The quantity must be smaller than {{quantityInPackingUnitCopy}}',
                                { quantityInPackingUnitCopy: (currentRecord as any).quantityInPackingUnitCopy },
                            )}`,
                        );
                        return;
                    }
                }
                this.stock.selectRecord(this.quantityBlock.selectedRecordId);
                if (this._productSite.product.serialNumberManagementMode !== 'globalReceivedIssued') {
                    const lineIndex = this._stockChangeLines.findIndex(
                        line =>
                            Number(line.stockId) === Number(currentRecord.stockId) &&
                            line.lineNumber === this._currentOperation,
                    );
                    if (lineIndex > -1) {
                        this._stockChangeLines[lineIndex].stockDetails[0].quantityInPackingUnit =
                            this.quantityInPackingUnit.value;
                        this._stockChangeLines[lineIndex].stockDetails[0].quantityInStockUnit =
                            Number(this.quantityInPackingUnit.value) *
                            Number(currentRecord.packingUnitToStockUnitConversionFactor);
                    } else {
                        this._stockChangeLines[this._currentLine].stockDetails.push({
                            quantityInPackingUnit: this.quantityInPackingUnit.value,
                            packingUnit: currentRecord.packingUnit.code,
                            licensePlateNumber: this._selectedLicensePlateNumber.code,
                            quantityInStockUnit:
                                Number(this.quantityInPackingUnit.value) *
                                Number(currentRecord.packingUnitToStockUnitConversionFactor),
                            lot: currentRecord.lot,
                            serialNumber: this.startingSerialNumber.value ? this.startingSerialNumber.value.code : null,
                        });

                        this._stockChangeLines[this._currentLine] = {
                            ...this._stockChangeLines[this._currentLine],
                            stockId: String(currentRecord.stockId),
                            product: this.product.value.code,
                            lineNumber: this._currentOperation,
                        };
                    }
                    this._saveDetail();
                }
                const qtyTotal = this._stockChangeLines[this._currentLine].stockDetails.reduce<decimal>((acc, curr) => {
                    return acc + Number(curr.quantityInPackingUnit);
                }, 0);
                currentRecord.quantityInPackingUnit = String(qtyTotal);
                this.quantityInPackingUnit.value = qtyTotal;
                this.stock.setRecordValue(currentRecord);
                // }

                this.$.detailPanel.isHidden = true;

                // TODO Issue: page-level businessAction buttons will overlay on top of any detailPanel footer buttons. And footer buttons are still be partially obscured
                this.nextButton.isHidden = false;
            }
        },
    })
    helperSelectButton: ui.PageAction;

    @ui.decorators.pageAction<MobileLpnSplittingStockLines>({
        icon: 'add',
        title: 'Add...',
        onError(error) {
            switch (error.message) {
                case '@sage/x3-stock/pages_mobile_lpn_splitting_stock_lines__notification__error_startingSerialNumber': {
                    return ui.localize(
                        '@sage/x3-stock/pages_mobile_lpn_splitting_stock_lines__notification__error_startingSerialNumber',
                        'The serial number is mandatory',
                    );
                }
                case '@sage/x3-stock/serial-number-range-overlap': {
                    return ui.localize(
                        '@sage/x3-stock/serial-number-range-overlap',
                        'The serial numbers are overlapping. Enter another starting or ending serial number.',
                    );
                }
                case '@sage/x3-stock/pages_mobile_lpn_splitting_stock_lines__notification__same-amount-serial-numbers-in-the-range-to-match-quantity-to-change': {
                    return ui.localize(
                        '@sage/x3-stock/pages_mobile_lpn_splitting_stock_lines__notification__same-amount-serial-numbers-in-the-range-to-match-quantity-to-change',
                        'Select the same amount of serial numbers in the range to match the quantity to split.',
                    );
                }
                default: {
                    return error;
                }
            }
        },
        //shortcut: ['f2'], // TODO Implement: What should the shortcut be for this button?
        buttonType: 'secondary',
        async onClick() {
            if (!this.startingSerialNumber.value) {
                throw new Error(
                    '@sage/x3-stock/pages_mobile_lpn_splitting_stock_lines__notification__error_startingSerialNumber',
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
                if (line.product === this.product.value.code) {
                    line.stockDetails?.forEach(lineDetail => {
                        const startingSerialNumber = Number(lineDetail.serialNumber.match(/\d+$/));
                        const endingSerialNumber = Number(
                            this._calculateEndingSerialNumber(
                                lineDetail.serialNumber,
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
                    this.startingSerialNumber.value?.code,
                    Number(this.quantityInPackingUnit.value),
                )
            ) {
                throw new Error(
                    '@sage/x3-stock/pages_mobile_lpn_splitting_stock_lines__notification__same-amount-serial-numbers-in-the-range-to-match-quantity-to-change',
                );
            }

            let currentRecord = this.stock.getRecordValue(this.quantityBlock.selectedRecordId);
            this.serialNumberLines.addRecord({
                quantity: this.quantityInPackingUnit.value,
                startingSerialNumber: this.startingSerialNumber.value.code,
                endingSerialNumber: this.endingSerialNumber.value,
            });
            if (
                !this._stockChangeLines.find(line => {
                    Number(line.stockId) === Number(currentRecord.stockId) &&
                        line.lineNumber === this._currentOperation;
                })
            ) {
                this._stockChangeLines[this._currentLine] = {
                    ...this._stockChangeLines[this._currentLine],
                    stockId: String(currentRecord.stockId),
                    product: this.product.value.code,
                    lineNumber: this._currentOperation,
                };
            }

            this._stockChangeLines[this._currentLine].stockDetails.push({
                quantityInPackingUnit: this.quantityInPackingUnit.value,
                packingUnit: currentRecord.packingUnit.code,
                licensePlateNumber: this._selectedLicensePlateNumber.code,
                quantityInStockUnit:
                    Number(this.quantityInPackingUnit.value) *
                    Number(currentRecord.packingUnitToStockUnitConversionFactor),
                lot: currentRecord.lot,
                serialNumber: this.startingSerialNumber.value ? this.startingSerialNumber.value.code : null,
            });

            this._saveDetail();

            const qtyTotal = this._stockChangeLines[this._currentLine].stockDetails.reduce<decimal>((acc, curr) => {
                return acc + Number(curr.quantityInPackingUnit);
            }, 0);
            currentRecord.serialNumber = this.startingSerialNumber.value.code;
            currentRecord.quantityInPackingUnit = String(0);
            this.quantityInPackingUnit.value = 0;
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

    @ui.decorators.section<MobileLpnSplittingStockLines>({
        isTitleHidden: true,
    })
    mainSection: ui.containers.Section;

    @ui.decorators.section<MobileLpnSplittingStockLines>({
        title: 'Stock details',
        isTitleHidden: false,
    })
    detailPanelSection: ui.containers.Section;

    /*
     *
     *  Blocks
     *
     */

    @ui.decorators.block<MobileLpnSplittingStockLines>({
        isTitleHidden: true,
        parent() {
            return this.mainSection;
        },
    })
    bodyBlock: ui.containers.Block;

    @ui.decorators.block<MobileLpnSplittingStockLines>({
        isTitleHidden: true,
        parent() {
            return this.detailPanelSection;
        },
    })
    detailsBlock: ui.containers.Block;

    @ui.decorators.gridRowBlock<MobileLpnSplittingStockLines>({
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
    quantityBlock: ui.containers.GridRowBlock;

    @ui.decorators.block<MobileLpnSplittingStockLines>({
        isTitleHidden: true,
        parent() {
            return this.detailPanelSection;
        },
    })
    quantityInPackingUnitBlock: ui.containers.Block;

    @ui.decorators.block<MobileLpnSplittingStockLines>({
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

    @ui.decorators.referenceField<MobileLpnSplittingStockLines, LotsSites>({
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
                product: { code: this.product.value.code },
                storageSite: { code: this._stockSite.code },
            };
        },
        async onChange() {
            if (!this.lot.value) {
                this.stock.filter = {
                    ...this.stock.filter,
                    lot: undefined,
                    ...(this.product.value.lotManagementMode === 'lotAndSublot' && { sublot: undefined }),
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

    @ui.decorators.referenceField<MobileLpnSplittingStockLines, LotsSites>({
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
                product: { code: this.product.value.code },
                storageSite: { code: this._stockSite.code },
            };
        },
        async onChange() {
            if (!this.sublot.value) {
                // delete this.stock.filter.sublot;
                // delete this.stock.filter.lot; // a sublot always has a lot associated to it
                // this.stock.filter = this.stock.filter; // (X3-262952) TODO Issue: seems like a hackish way to trigger a table refresh for deleting a filter criterion

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

    @ui.decorators.referenceField<MobileLpnSplittingStockLines, SerialNumber>({
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
                product: { code: this.product.value.code },
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

    @ui.decorators.selectField<MobileLpnSplittingStockLines>({
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

    @ui.decorators.selectField<MobileLpnSplittingStockLines>({
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

    @ui.decorators.numericField<MobileLpnSplittingStockLines>({
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

    @ui.decorators.textField<MobileLpnSplittingStockLines>({
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

    @ui.decorators.textField<MobileLpnSplittingStockLines>({
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

    @ui.decorators.textField<MobileLpnSplittingStockLines>({
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

    @ui.decorators.textField<MobileLpnSplittingStockLines>({
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

    @ui.decorators.tableField<MobileLpnSplittingStockLines, Stock>({
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
            ui.nestedFields.reference<MobileLpnSplittingStockLines, Stock, ProductSite>({
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
            ui.nestedFields.reference<MobileLpnSplittingStockLines, Stock, Location>({
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
            ui.nestedFields.reference<MobileLpnSplittingStockLines, Stock, StockStatus>({
                bind: 'status',
                valueField: 'code',
                node: '@sage/x3-stock-data/StockStatus',
                isReadOnly: true,
                isHidden() {
                    return this.status.isHidden ?? false;
                },
            }),
            ui.nestedFields.technical<MobileLpnSplittingStockLines, Stock, UnitOfMeasure>({
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
                        this.$.detailPanel.isHidden
                            ? rowValue?.quantityInPackingUnitOrigin
                            : rowValue?.quantityInPackingUnitCopy,
                        rowValue?.packingUnit.numberOfDecimals,
                    )} ${rowValue?.packingUnit.code}`;
                },
                title: 'Quantity to split', // this is important to display a title in the grid row block
                isTitleHidden: false,
                isMandatory: true,
                isFullWidth: true,
                max(rowValue: Stock) {
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
            ui.nestedFields.technical<MobileLpnSplittingStockLines, Stock, Lot>({
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
                case '@sage/x3-stock/pages_mobile_lpn_splitting_stock_lines__notification__invalid_licensePlateNumber_error': {
                    return ui.localize(
                        '@sage/x3-stock/pages_mobile_lpn_splitting_stock_lines__notification__invalid_licensePlateNumber_error',
                        'This LPN is for a single lot. Select the same lot as previously.',
                    );
                }
                case '@sage/x3-stock/serial-number-not-sequential': {
                    return ui.localize(
                        '@sage/x3-stock/serial-number-not-sequential',
                        'The serial numbers are not sequential. Check your entry.',
                    );
                }
                case '@sage/x3-stock/pages_mobile_lpn_splitting_destination_lpn_single_product': {
                    return ui.localize(
                        '@sage/x3-stock/pages_mobile_lpn_splitting_destination_lpn_single_product',
                        `The Destination License plate number is single product.`,
                    );
                }
                case '@sage/x3-stock/pages_mobile_lpn_splitting_destination_lpn_single_lot': {
                    return ui.localize(
                        '@sage/x3-stock/pages_mobile_lpn_splitting_destination_lpn_single_lot',
                        `The Destination License plate number is single lot.`,
                    );
                }
                case '@sage/x3-stock/pages_mobile_lpn_splitting_stock_lines__quantityInPackingUnit_must_be_greater_than_0': {
                    return ui.localize(
                        '@sage/x3-stock/pages_mobile_lpn_splitting_stock_lines__quantityInPackingUnit_must_be_greater_than_0',
                        'The quantity must be greater than 0',
                    );
                }
                default:
                    return error;
            }
        },
        async onRowSelected(rowId: string, rowItem: Stock) {
            if (this.stock.selectedRecords.length > 0) {
                this.stock.isDisabled = true;
                //singleProduct
                if (
                    this._licensePlateNumberDestination?.isSingleProduct &&
                    !(await this._validateSingleProduct(this.product.value?.code))
                ) {
                    this.stock.unselectRecord(rowId);
                    this.stock.isDisabled = false;
                    throw new Error('@sage/x3-stock/pages_mobile_lpn_splitting_destination_lpn_single_product');
                }

                //singlelot
                if (this._licensePlateNumberDestination?.isSingleLot && !(await this._validateSingleLot(rowItem.lot))) {
                    this.stock.unselectRecord(rowId);
                    this.stock.isDisabled = false;
                    throw new Error('@sage/x3-stock/pages_mobile_lpn_splitting_destination_lpn_single_lot');
                }

                //quantity
                if (Number(rowItem.quantityInPackingUnit) <= 0) {
                    this.stock.unselectRecord(rowId);
                    this.stock.isDisabled = false;
                    throw new Error(
                        '@sage/x3-stock/pages_mobile_lpn_splitting_stock_lines__quantityInPackingUnit_must_be_greater_than_0',
                    );
                }

                //serial Number
                if (this._productSite.product.serialNumberManagementMode === 'globalReceivedIssued') {
                    const startingSerialNumber = await readSerialNumberFromStockId(this, rowItem.stockId, 1);
                    const endingSerialNumber = this._calculateEndingSerialNumber(
                        startingSerialNumber.code,
                        Number(rowItem.quantityInPackingUnit),
                    );
                    const endingSerialNumberRead = await readSerialNumberFromStockId(this, rowItem.stockId, -1);
                    if (endingSerialNumberRead.code !== endingSerialNumber) {
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
            let stockRecord = this.stock.getRecordValue(rowId);
            if (stockRecord) {
                const lineIndex = this._stockChangeLines.findIndex(
                    line =>
                        Number(line.stockId) === Number(stockRecord.stockId) &&
                        line.lineNumber === this._currentOperation,
                );
                if (lineIndex > -1) {
                    this._stockChangeLines.splice(lineIndex, 1);
                }
                stockRecord.quantityInPackingUnit = (stockRecord as any).quantityInPackingUnitOrigin;
                (stockRecord as any).quantityInPackingUnitCopy = (stockRecord as any).quantityInPackingUnitOrigin;
                this.quantityInPackingUnit.value = Number(stockRecord.quantityInPackingUnit);
                this.stock.setRecordValue(stockRecord);
                this._savedStockId = null;
                this.serialNumberLines.value = [];
                this._savelpnOperations();
            }
        },
        async onChange() {
            await this.totalStocks.refresh().catch(() => {
                /* Intentional fire and forget */
            });
        },
        sortColumns(firstColumn, secondColumn) {
            // I don't think this necessary
            if (firstColumn.bind === secondColumn.bind) return 0;

            //const firstTitle = this._convertBindToTitle(firstColumn.bind);
            //const secondTitle = this._convertBindToTitle(secondColumn.bind);

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

            // TODO Issue: If packingUnit is the first adc setting, then the quantityInPackingUnit column will appear at the top-left instead
        },
        mapServerRecord(record: Partial<Stock>) {
            const _quantityInPackingUnit = this._getResidualQuantity(record).toString();
            const _record = {
                ...record,
                quantityInPackingUnit: _quantityInPackingUnit,
            };
            return _record;
        },

        async onRowClick(recordId: string, rowItem: Stock) {
            this.stockDetails.value = [rowItem]; // populate details list
            this.quantityBlock.selectedRecordId = recordId; // populate grid row block
            this._stockId.value = rowItem.stockId;
            this.quantityInPackingUnit.value = Number(
                this.stock.getRecordValue(this.quantityBlock.selectedRecordId)?.quantityInPackingUnit,
            );

            //singleProduct
            if (
                this._licensePlateNumberDestination?.isSingleProduct &&
                !(await this._validateSingleProduct(this.product.value?.code))
            ) {
                throw new Error('@sage/x3-stock/pages_mobile_lpn_splitting_destination_lpn_single_product');
            }

            //singlelot
            if (this._licensePlateNumberDestination?.isSingleLot && !(await this._validateSingleLot(rowItem.lot))) {
                throw new Error('@sage/x3-stock/pages_mobile_lpn_splitting_destination_lpn_single_lot');
            }

            //quantity
            if (Number((rowItem as any).quantityInPackingUnitOrigin) <= 0) {
                throw new Error(
                    '@sage/x3-stock/pages_mobile_lpn_splitting_stock_lines__quantityInPackingUnit_must_be_greater_than_0',
                );
            }

            const lineIndex = this._stockChangeLines.findIndex(
                line => Number(line.stockId) === Number(rowItem.stockId) && line.lineNumber === this._currentOperation,
            );
            if (lineIndex > -1) {
                this._currentLine = lineIndex;
                if (this._productSite.product.serialNumberManagementMode === 'globalReceivedIssued') {
                    this.serialNumberLines.isHidden = false;
                    this.serialNumberLines.value = this._stockChangeLines[this._currentLine].stockDetails.map(line => ({
                        ...line,
                        _id: this.serialNumberLines.generateRecordId(),
                        startingSerialNumber: line.serialNumber,
                        endingSerialNumber: this._calculateEndingSerialNumber(
                            line.serialNumber,
                            Number(line.quantityInPackingUnit),
                        ),
                        quantity: line.quantityInPackingUnit,
                    }));
                    let currentRecord = this.stock.getRecordValue(this.quantityBlock.selectedRecordId);
                    currentRecord.quantityInPackingUnit = String(0);
                    this.quantityInPackingUnit.value = 0;
                    this.stock.setRecordValue(currentRecord);
                }
            } else {
                if (Number(this._savedStockId) !== Number(rowItem.stockId)) {
                    this._currentLine = this._stockChangeLines.length;
                    this._stockChangeLines.push({
                        stockDetails: [],
                    });
                    this._savedStockId = rowItem.stockId;
                    if (this._productSite.product.serialNumberManagementMode === 'globalReceivedIssued') {
                        this.serialNumberLines.value = [];
                    }
                }
            }
            this.startingSerialNumber.value = null;
            this.endingSerialNumber.value = null;

            // to remove any residual validation error from the previous onRowClick: user inputs an invalid quantity and then clicks Cancel
            await this.$.commitValueAndPropertyChanges();
            await this.stock.validateWithDetails();

            this.$.detailPanel.isHidden = false;

            // TODO Issue: page-level businessAction buttons will overlay on top of any detailPanel footer buttons. And footer buttons are still be partially obscured
            this.nextButton.isHidden = true;
        },
    })
    stock: ui.fields.Table<Stock>;

    /*
     *
     *  Detail panel fields
     *
     */

    @ui.decorators.detailListField<MobileLpnSplittingStockLines, Stock>({
        parent() {
            return this.detailsBlock;
        },
        node: '@sage/x3-stock-data/Stock',
        isTransient: true,
        isFullWidth: true,
        isTitleHidden: true,
        //title: 'Stock details',
        fields: [
            ui.nestedFields.reference<MobileLpnSplittingStockLines, Stock, ProductSite>({
                bind: 'product',
                valueField: { product: { code: true } },
                node: '@sage/x3-master-data/ProductSite',
                title: 'Product',
                isReadOnly: true,
                isHidden: false,
            }),
            ui.nestedFields.reference<MobileLpnSplittingStockLines, Stock, Location>({
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
            ui.nestedFields.reference<MobileLpnSplittingStockLines, Stock, Lot>({
                node: '@sage/x3-stock-data/Lot',
                bind: 'lotReference',
                valueField: { majorVersion: { code: true } },
                title: 'Major version',
                isReadOnly: true,
                isHidden: (value: Lot) => {
                    return !value?.majorVersion;
                },
            }),
            ui.nestedFields.reference<MobileLpnSplittingStockLines, Stock, Lot>({
                node: '@sage/x3-stock-data/Lot',
                bind: 'lotReference',
                valueField: 'expirationDate',
                title: 'Expiration date',
                isReadOnly: true,
                // (X3-252730) TODO Issue: Even though there is a value and so it return backs false for isHidden, reference value does not show up
                isHidden(value: Lot) {
                    return (
                        this.product?.value?.expirationManagementMode === 'notManaged' ||
                        !value?.expirationDate ||
                        Date.parse(value.expirationDate) > Date.now()
                    ); // TODO Issue: What's the best way to check if date is null or invalid?
                },
            }),
            ui.nestedFields.reference<MobileLpnSplittingStockLines, Stock, Lot>({
                node: '@sage/x3-stock-data/Lot',
                bind: 'lotReference',
                valueField: 'useByDate',
                title: 'Use-by date',
                isReadOnly: true,
                // (X3-252730) TODO Issue: Even though there is a value and so it return backs false for isHidden, reference value does not show up
                isHidden(value: Lot) {
                    return (
                        this.product.value.expirationManagementMode === 'notManaged' ||
                        !value?.useByDate ||
                        Date.parse(value.useByDate) > Date.now()
                    );
                },
            }),
            ui.nestedFields.reference<MobileLpnSplittingStockLines, Stock, Lot>({
                node: '@sage/x3-stock-data/Lot',
                bind: 'lotReference',
                valueField: 'lotCustomField1',
                title: 'Lot custom field 1',
                isReadOnly: true,
                isHidden(value: Lot) {
                    return !value?.lotCustomField1;
                },
            }),
            ui.nestedFields.reference<MobileLpnSplittingStockLines, Stock, Lot>({
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
                    return rowValue.packingUnit.code;
                },
                scale(value, rowValue?: Dict<any>) {
                    return rowValue?.packingUnit?.numberOfDecimals ?? 0;
                },
            }),
            ui.nestedFields.numeric({
                bind: 'quantityInStockUnit',
                title: 'Stock qty.',
                isReadOnly: true,
                isHidden: hideWhenEmptyValue,
                postfix() {
                    // TODO Verify: Is it safe to assume stock unit is the same for all stock based on the selected product's stock unit code?
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
                    // TODO Verify: Is it safe to assume stock unit is the same for all stock based on the selected product's stock unit code?
                    return this.product.value?.stockUnit?.code ?? '';
                },
                scale() {
                    return this.product.value?.stockUnit?.numberOfDecimals ?? 0;
                },
            }),
            ui.nestedFields.reference<MobileLpnSplittingStockLines, Stock, StockStatus>({
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

    @ui.decorators.numericField<MobileLpnSplittingStockLines>({
        parent() {
            return this.quantityInPackingUnitBlock;
        },
        postfix(value, rowValue?: Dict<any>) {
            return `/ ${ui.formatNumberToCurrentLocale(
                this.$.detailPanel.isHidden
                    ? (this.stock.getRecordValue(this.quantityBlock.selectedRecordId) as any)
                          ?.quantityInPackingUnitOrigin
                    : (this.stock.getRecordValue(this.quantityBlock.selectedRecordId) as any)
                          ?.quantityInPackingUnitCopy,
                this.stock.getRecordValue(this.quantityBlock.selectedRecordId)?.packingUnit.numberOfDecimals,
            )} ${this.stock.getRecordValue(this.quantityBlock.selectedRecordId)?.packingUnit.code}`;
        },
        title: 'Quantity to split', // this is important to display a title in the grid row block
        isMandatory: true,
        isFullWidth: true,
        isTransient: true,
        max() {
            return (this.stock.getRecordValue(this.quantityBlock.selectedRecordId) as any)?.quantityInPackingUnitCopy;
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

    @ui.decorators.referenceField<MobileLpnSplittingStockLines, SerialNumber>({
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
                _and: [{ product: { code: this.product.value.code } }, { stockId: this._stockId.value }],
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
            ui.nestedFields.text({
                bind: 'stockId',
                title: 'Stock ID',
                isReadOnly: true,
                isHidden: true,
            }),
        ],
    })
    startingSerialNumber: ui.fields.Reference<SerialNumber>;

    @ui.decorators.textField<MobileLpnSplittingStockLines>({
        parent() {
            return this.serialNumberBlock;
        },
        title: 'Ending serial number',
        isMandatory: true,
        isTransient: true,
        isReadOnly: true,
        isFullWidth: true,
        async validation(value: string) {
            if (this._productSite.product.serialNumberManagementMode !== 'globalReceivedIssued' || !value) return;
            let currentRecord = this.stock.getRecordValue(this.quantityBlock.selectedRecordId ?? '');
            let currentQty = Number(currentRecord?.quantityInPackingUnit);

            if (
                (await getCountSerialNumber(
                    this,
                    this.product.value?.code ?? '',
                    this._stockSite.code,
                    this._stockId.value ?? '',
                    this.startingSerialNumber.value?.code ?? '',
                    this.endingSerialNumber.value ?? '',
                    value,
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

    @ui.decorators.textField<MobileLpnSplittingStockLines>({
        parent() {
            return this.serialNumberBlock;
        },
        isTransient: true,
        isHidden: true,
    })
    _stockId: ui.fields.Text;

    @ui.decorators.tableField<MobileLpnSplittingStockLines>({
        parent() {
            return this.serialNumberBlock;
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
                postfix(value, rowValue?: Dict<any>) {
                    return this.stock.getRecordValue(this.quantityBlock.selectedRecordId).packingUnit.code;
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
                    const removedIndexSerialNumber = this._stockChangeLines[this._currentLine].stockDetails.findIndex(
                        number => number.serialNumber === removedRecordSerialNumber.startingSerialNumber,
                    );
                    this._stockChangeLines[this._currentLine].stockDetails.splice(removedIndexSerialNumber, 1);
                    this._saveDetail();
                    //calculation of the new qty
                    let currentRecord = this.stock.getRecordValue(this.quantityBlock.selectedRecordId);
                    const qtyTotal = this._stockChangeLines[this._currentLine].stockDetails.reduce<decimal>(
                        (acc, curr) => {
                            return acc + Number(curr.quantityInPackingUnit);
                        },
                        0,
                    );
                    currentRecord.quantityInPackingUnit = String(0);
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
     *  Helper Functions
     *
     */
    // should always display quantity and packing display top-right regardless of settings
    // FUNADCSEARCH, click on maginfying glass and input DIRECT CALL and click the icon
    private _formatUnit(value: ExtractEdgesPartial<ProductPackingUnits>) {
        return value?.packingUnit?.code === this.product?.value?.stockUnit?.code &&
            value.packingUnitToStockUnitConversionFactor === '1'
            ? value?.packingUnit?.code
            : `${value?.packingUnit?.code} = ${value.packingUnitToStockUnitConversionFactor} ${this.product?.value?.stockUnit?.code}`;
    }

    // TODO Obsolete: no way to fetch nested collection property in a non-transient way
    private async _fetchProductPackingUnits(
        product: ExtractEdgesPartial<Product>,
    ): Promise<ExtractEdgesPartial<Product>> {
        const response = await this.$.graph
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
            .execute();

        if (!response) {
            return null;
        }

        return {
            packingUnits: extractEdges(response.packingUnits.query as Edges<ProductPackingUnits>),
        };
    }

    private _getSavedInputs() {
        return JSON.parse(this.$.storage.get('mobile-lpnOperations') as string) as inputsLpnSplitting;
    }

    private _saveDetail() {
        const currentstockChangeLines = this._stockChangeLines[this._currentLine];

        this._stockChangeLines[this._currentLine] = {
            ...currentstockChangeLines,
        };

        this._savelpnOperations();
    }

    private async _createDetail() {
        this.stock.selectedRecords.forEach(rowId => {
            const stockRecord = this.stock.getRecordValue(rowId);
            const lineIndex = this._stockChangeLines.findIndex(
                line =>
                    Number(line.stockId) === Number(stockRecord.stockId) && line.lineNumber === this._currentOperation,
            );
            if (lineIndex === -1) {
                if (!this._stockChangeLines[this._stockChangeLines.length]) {
                    this._stockChangeLines.push({
                        stockDetails: [],
                    });
                    this._stockChangeLines[this._stockChangeLines.length - 1].stockDetails.push({
                        quantityInPackingUnit: stockRecord.quantityInPackingUnit,
                        packingUnit: stockRecord.packingUnit.code,
                        quantityInStockUnit:
                            Number(stockRecord.quantityInPackingUnit) *
                            Number(stockRecord.packingUnitToStockUnitConversionFactor),
                        lot: stockRecord?.lot,
                        serialNumber: stockRecord.serialNumber ? stockRecord.serialNumber : null,
                    });
                }
                this._stockChangeLines[this._stockChangeLines.length - 1] = {
                    ...this._stockChangeLines[this._stockChangeLines.length - 1],
                    stockId: String(stockRecord.stockId),
                    product: this.product.value.code,
                    lineNumber: this._currentOperation,
                };
                this._saveDetail();
            }
        });
    }

    private async _initstockChangeLines(): Promise<void> {
        if (this._stockChangeLines.length === 0 || this._stockChangeLines[this._currentLine] === undefined) return;

        if (this._stockChangeLines[this._currentLine].stockDetails.length === 0) {
            this._stockChangeLines[this._currentLine] = {
                ...this._stockChangeLines[this._currentLine],
            };
        } else {
            this.serialNumberLines.isHidden = false;
            this.serialNumberLines.value = this._stockChangeLines[this._currentLine].stockDetails.map(line => ({
                ...line,
                _id: this.serialNumberLines.generateRecordId(),
            }));
        }
        await this.stock.refresh();
    }

    private _getResidualQuantity(record: Partial<Stock>): number {
        const _savedInputs: inputsLpnSplitting = this._getSavedInputs();
        if (this._stockChangeLines === undefined) {
            this._stockChangeLines = _savedInputs.lpnOperations?.stockChangeLines ?? [];
        }
        if (this._currentLine === undefined) {
            this._currentLine = Number(_savedInputs.currentLine);
        }
        if (this._currentOperation === undefined) {
            this._currentOperation = Number(_savedInputs.currentOperation);
        }
        if (!(record as any).quantityInPackingUnitOrigin) {
            let _quantityInPackingUnitOrigin = Number(record.quantityInPackingUnit);
            this._stockChangeLines?.forEach(line => {
                if (Number(line.stockId) === Number(record.stockId) && line.lineNumber !== this._currentOperation) {
                    line.stockDetails?.forEach(lineDetail => {
                        _quantityInPackingUnitOrigin =
                            Number(_quantityInPackingUnitOrigin) - Number(lineDetail.quantityInPackingUnit);
                    });
                }
            });
            (record as any).quantityInPackingUnitOrigin = _quantityInPackingUnitOrigin;
        }
        let _quantityInPackingUnit = Number(record.quantityInPackingUnit);
        let _quantityInPackingUnitCopy = Number((record as any).quantityInPackingUnitOrigin);
        if (this._stockChangeLines?.length > 0) {
            if (record.product?.product?.serialNumberManagementMode === 'globalReceivedIssued') {
                this._stockChangeLines?.forEach(line => {
                    if (Number(line.stockId) === Number(record.stockId) && line.lineNumber === this._currentOperation) {
                        line.stockDetails?.forEach(lineDetail => {
                            _quantityInPackingUnitCopy =
                                Number(_quantityInPackingUnitCopy) - Number(lineDetail.quantityInPackingUnit);
                        });
                    }
                });
            } else {
                this._stockChangeLines?.forEach(line => {
                    if (Number(line.stockId) === Number(record.stockId) && line.lineNumber === this._currentOperation) {
                        _quantityInPackingUnit = 0;
                        line.stockDetails?.forEach(lineDetail => {
                            _quantityInPackingUnit =
                                Number(_quantityInPackingUnit) + Number(lineDetail.quantityInPackingUnit);
                        });
                    }
                });
            }
        }
        if (Number(_quantityInPackingUnit) > Number(_quantityInPackingUnitCopy)) {
            _quantityInPackingUnit = Number(_quantityInPackingUnitCopy);
        }
        (record as any).quantityInPackingUnitCopy = _quantityInPackingUnitCopy;
        return _quantityInPackingUnit;
    }

    private _savelpnOperations() {
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
                    '@sage/x3-stock/pages_mobile_lpn_splitting_stock_lines__notification__invalid_stock_status_error',
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
    }

    private async _onChangeBody() {
        let currentRecord = this.stock.getRecordValue(this.quantityBlock.selectedRecordId);
        let currentQty = Number(currentRecord.quantityInPackingUnit);
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
        const qtyTotal = this._stockChangeLines[this._currentLine].stockDetails.reduce<decimal>((acc, curr) => {
            return acc + Number(curr.quantityInPackingUnit);
        }, 0);
        if (qtyTotal + currentQty > (currentRecord as any).quantityInPackingUnitOrigin)
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

    private async _onQuantityInPackingUnit() {
        let currentRecord = this.stock.getRecordValue(this.quantityBlock.selectedRecordId);
        currentRecord.quantityInPackingUnit = String(this.quantityInPackingUnit.value);
        this.stock.setRecordValue(currentRecord);
        await this.$.commitValueAndPropertyChanges();
    }

    private async _validateSingleProduct(codeProduct: string): Promise<boolean> {
        let resultReturn: boolean = true;
        this._stockChangeLines.forEach(line => {
            if (line.product !== codeProduct) {
                resultReturn = false;
            }
        });
        if (resultReturn) {
            const response = await this.$.graph
                .node('@sage/x3-stock-data/Stock')
                .query(
                    ui.queryUtils.edgesSelector<Stock>(
                        { _id: true },
                        {
                            filter: {
                                product: { product: { code: { _ne: codeProduct } } },
                                licensePlateNumber: this._licensePlateNumberDestination.code,
                            },
                        },
                    ),
                )
                .execute();
            resultReturn = response.edges.length === 0;
        }
        return resultReturn;
    }

    private async _validateSingleLot(codeLot: string): Promise<boolean> {
        let resultReturn: boolean = true;
        this.stock.selectedRecords.forEach(rowId => {
            if (this.stock.getRecordValue(rowId)?.lot !== codeLot) {
                resultReturn = false;
            }
        });
        if (resultReturn) {
            this._stockChangeLines.forEach(line => {
                line.stockDetails.forEach(lineDetail => {
                    if (lineDetail.lot !== codeLot) {
                        resultReturn = false;
                    }
                });
            });
        }
        if (resultReturn) {
            const response = await this.$.graph
                .node('@sage/x3-stock-data/Stock')
                .query(
                    ui.queryUtils.edgesSelector<Stock>(
                        { _id: true },
                        {
                            filter: {
                                lot: { _ne: codeLot },
                                licensePlateNumber: this._licensePlateNumberDestination.code,
                            },
                        },
                    ),
                )
                .execute();
            resultReturn = response.edges.length === 0;
        }
        return resultReturn;
    }

    private _calculateEndingSerialNumber(startingSerialNumber: string, quantity: number): string {
        return startingSerialNumber.replace(/\d+$/, match => {
            const endingNumber = (Number(match) + quantity - 1).toString();
            const lengthDiff = Math.max(endingNumber.length - match.length, 0);
            return endingNumber.padStart(match.length + lengthDiff, '0');
        });
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

            // If an error occurred during the API call
            if (!productSiteToReceive) {
                await this._notifier.showAndWait(
                    ui.localize(
                        '@sage/x3-stock/pages_mobile_stock_change_details__notification__invalid_product_site_error',
                        `Could not retrieve your product {{ productCode }} for the site {{ siteCode }}`,
                        {
                            productCode: this.product.value,
                            siteCode: this._stockSite.code,
                        },
                    ),
                    'error',
                );
                this.$.setPageClean();
                return this.$.router.goTo('@sage/x3-stock/MobileStockChange', { ReturnFromDetail: 'yes' });
            }

            return productSiteToReceive as any;
        }
    }

    private async _readStockIdFromSerialNumber(serialNumber: string | null, product: string | null) {
        if (serialNumber === null) return;
        try {
            const serialNumberNode = await this.$.graph
                .node('@sage/x3-stock-data/SerialNumber')
                .read(
                    {
                        stockId: true,
                    },
                    `${product}|${serialNumber}`,
                )
                .execute();
            return serialNumberNode.stockId;
        } catch (e) {
            await dialogMessage(
                this,
                'error',
                ui.localize('@sage/x3-stock/error-loading-serial-number', 'Error loading serial number'),
                String(e),
            );
        }
    }
}
