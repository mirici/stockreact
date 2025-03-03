import { Product, ProductSite, UnitOfMeasure } from '@sage/x3-master-data-api';
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
    StockJournalInput,
    StockStatus,
} from '@sage/x3-stock-data-api';
import { getCountSerialNumber } from '@sage/x3-stock-data/lib/client-functions/get-count-serial-number';
import { Site } from '@sage/x3-system-api';
import { Dict, Filter, decimal } from '@sage/xtrem-client';
import * as ui from '@sage/xtrem-ui';
import { NotifyAndWait } from '../client-functions/display';
import { generateStockTableFilter } from '../client-functions/manage-pages';
import {
    addValueToSelectedIdentifier,
    calculateEndingSerialNumber,
    disableButton,
    getIdentifierFieldsCount,
    getIdentifierValues,
    getStockResults,
    initFieldsToBeVisible,
    isProductGlobalReceivedIssuedInStock,
    onChangeFilterStock,
} from '../client-functions/stock-change-by-identifier-details-control';
import { inputsIntersiteTransfer } from './mobile-intersite-transfer-by-identifier';

const hideWhenEmptyValue = (value: any, _rowValue?: Dict<Stock>) => {
    return typeof value !== 'number' && !value;
};

type packingUnit = {
    node: {
        unit: {
            code: string;
            numberOfDecimals: number;
        };
        packingUnitToStockUnitConversionFactor: string;
        isPackingFactorEntryAllowed: boolean;
    };
};

@ui.decorators.page<MobileIntersiteTransferByIdentifierDetails>({
    title: 'Intersite transfer',
    subtitle: 'Select by identifier',
    mode: 'default',
    isTitleHidden: true,
    isTransient: false,
    businessActions() {
        return [this.nextButton, this.searchButton];
    },
    async onLoad() {
        this._stockSite = JSON.parse(this.$.queryParameters.stockSite as string);
        this._identifier = this.$.queryParameters.identifier as string;
        await this._init();
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
export class MobileIntersiteTransferByIdentifierDetails extends ui.Page<GraphApi> {
    /*
     *  Technical properties
     */

    _packingUnits: packingUnit[];
    private _stockChangeLines: Partial<StockChangeLineInput>[];
    private _stockSite: Site;
    private _identifier: string;
    private _selectedLineIndex = -1;
    private _selectedLineId = '-1';
    private _stockQueryResult: ui.PartialNodeWithId<Stock>[];
    private _notifier = new NotifyAndWait(this);
    private _selectedIdentifierValues: string | undefined;

    /*
     *  Technical fields
     */

    @ui.decorators.textField<MobileIntersiteTransferByIdentifierDetails>({
        isDisabled: true,
        isTransient: true,
        prefix: 'Site',
    })
    site: ui.fields.Text;

    /*
     *  Page Actions
     */

    @ui.decorators.pageAction<MobileIntersiteTransferByIdentifierDetails>({
        title: 'Next',
        shortcut: ['f2'],
        buttonType: 'secondary',
        isDisabled: true,
        async onClick() {
            if (!this.stock.selectedRecords.length) {
                this.$.loader.isHidden = false;
                await this._onSearch(generateStockTableFilter(this));
                if (this.stock.value.length) {
                    const _siteDestination = this._getSavedInputs()?.siteDestination?.code;
                    const isProductManagedInSite =
                        this.stock.value.some(stockItem =>
                            stockItem?.product?.product?.productSites?.some(
                                productItem => productItem?.stockSite?.code === _siteDestination,
                            ),
                        ) ?? false;
                    if (!isProductManagedInSite) {
                        this.$.loader.isHidden = true;
                        this._notifier.show(
                            ui.localize(
                                '@sage/x3-stock/pages__mobile_intersite_transfer_by_identifier_lines__notification__product_not_managed_in_stock_for_the_site',
                                'Select all action not available for this selection: at least one product is not managed in stock for the site: {{site}}.',
                                { site: _siteDestination },
                            ),
                            'error',
                        );
                        this.selectAllSwitch.value = false;
                        this.nextButton.isDisabled = true;
                    } else if (!isProductGlobalReceivedIssuedInStock(this)) {
                        this._onSelectAllLines();
                        this.stock.isHidden = true;
                        await this.$.commitValueAndPropertyChanges();
                        const savedInputs = this._getSavedInputs();
                        this.$.storage.set('mobile-intersiteTransferByIdentifier', JSON.stringify(savedInputs));
                        onGoto(this, '@sage/x3-stock/MobileIntersiteTransferByIdentifierDestination', {
                            identifierValues: `${getIdentifierValues(this, this._identifier)}`,
                        });
                    } else {
                        this.$.loader.isHidden = true;
                        this._notifier.show(
                            ui.localize(
                                '@sage/x3-stock/pages__mobile_intersite_transfer_by_identifier_lines__notification__product_is_global_serial_number_managed',
                                'Select all action not available for this selection: at least one product is global serial number managed.',
                            ),
                            'error',
                        );
                        this.selectAllSwitch.value = false;
                        this.nextButton.isDisabled = true;
                    }
                } else {
                    this.$.loader.isHidden = true;
                    this._notifier.show(
                        ui.localize(
                            '@sage/x3-stock/pages__mobile_intersite_transfer_by_identifier_lines__notification__stock_is_empty',
                            'There are no lines in stock that match the search identifiers.',
                        ),
                        'error',
                    );
                    this.selectAllSwitch.value = false;
                    this.nextButton.isDisabled = true;
                }
                this.$.loader.isHidden = true;
            } else if (this.stock.selectedRecords.length) {
                await this.$.commitValueAndPropertyChanges();
                const savedInputs = this._getSavedInputs();
                this.$.storage.set('mobile-intersiteTransferByIdentifier', JSON.stringify(savedInputs));
                onGoto(this, '@sage/x3-stock/MobileIntersiteTransferByIdentifierDestination', {
                    identifierValues: `${getIdentifierValues(this, this._identifier)}`,
                });
            } else {
                await dialogMessage(
                    this,
                    'error',
                    ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                    ui.localize(
                        '@sage/x3-stock/pages__mobile_intersite_transfer_by_identifier_lines__notification__no_stock_error',
                        `Select at least one stock line.`,
                    ),
                );
            }
        },
    })
    nextButton: ui.PageAction;

    @ui.decorators.pageAction<MobileIntersiteTransferByIdentifierDetails>({
        title: 'Search',
        shortcut: ['f3'],
        buttonType: 'primary',
        isDisabled: true,
        async onClick() {
            this.$.loader.isHidden = false;
            await this._onSearch(generateStockTableFilter(this));
            this.$.setPageClean();
            this.$.loader.isHidden = true;
        },
    })
    searchButton: ui.PageAction;

    @ui.decorators.pageAction<MobileIntersiteTransferByIdentifierDetails>({
        title: 'Cancel',
        buttonType: 'secondary',
        async onClick() {
            await this._onDeselect(this._selectedLineId, this._selectedLineIndex);
            if (this.$.detailPanel) {
                this.$.detailPanel.isHidden = true;
            }
            this.nextButton.isDisabled = !this.stock.selectedRecords.length;
        },
    })
    helperCancelButton: ui.PageAction;

    @ui.decorators.pageAction<MobileIntersiteTransferByIdentifierDetails>({
        title: 'Select',
        buttonType: 'primary',
        async onClick() {
            await this.$.commitValueAndPropertyChanges();
            const errors: ui.ValidationResult[] = await this.stock.validateWithDetails();
            if (!errors.length) {
                const currentRecord = this.stock.getRecordValue(this._selectedLineId);
                if (currentRecord?.product?.product?.serialNumberManagementMode === 'globalReceivedIssued') {
                    if (!this.serialNumberLines.value.length) {
                        throw new Error(
                            '@sage/x3-stock/pages__mobile_intersite_transfer_by_identifier_lines__notification__error_startingSerialNumberMandatory',
                        );
                    }
                } else if (Number(this.quantityToMove.value) <= 0) {
                    await dialogMessage(
                        this,
                        'error',
                        ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                        ui.localize(
                            '@sage/x3-stock/pages__mobile_intersite_transfer_by_identifier_lines__quantityInPackingUnitDestination_must_be_greater_than_0',
                            'The quantity to move must be greater than 0',
                        ),
                    );
                    return;
                }
                if (Number(this.quantityToMove.value) > Number((currentRecord as any).quantityInPackingUnitRest)) {
                    await dialogMessage(
                        this,
                        'error',
                        ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                        `${ui.localize(
                            '@sage/x3-stock/pages__mobile_intersite_transfer_by_identifier_lines__enter_a_quantity_less_than_or_equal_to_the_stock_quantity',
                            'Enter a quantity less than or equal to the stock quantity',
                        )}`,
                    );
                    return;
                }
                await this._onSelect(this._selectedLineId, this._selectedLineIndex);
                this._saveDetail(this._selectedLineId, this._selectedLineIndex);
            }
            if (this.$.detailPanel) {
                this.$.detailPanel.isHidden = true;
            }
            this.nextButton.isDisabled = false;
        },
    })
    helperSelectButton: ui.PageAction;

    @ui.decorators.pageAction<MobileIntersiteTransferByIdentifierDetails>({
        icon: 'add',
        title: 'Add...',
        isHidden() {
            return (
                this.stock.getRecordValue(this._selectedLineId)?.product?.product?.serialNumberManagementMode !==
                'globalReceivedIssued'
            );
        },
        onError(error) {
            switch (error.message) {
                case '@sage/x3-stock/pages__mobile_intersite_transfer_by_identifier_lines__notification__error_startingSerialNumber': {
                    return ui.localize(
                        '@sage/x3-stock/pages__mobile_intersite_transfer_by_identifier_lines__notification__error_startingSerialNumber',
                        'The serial number is mandatory',
                    );
                }
                case '@sage/x3-stock/serial-number-range-overlap': {
                    return ui.localize(
                        '@sage/x3-stock/serial-number-range-overlap',
                        'The serial numbers are overlapping. Enter another starting or ending serial number.',
                    );
                }
                case '@sage/x3-stock/pages__mobile_intersite_transfer_by_identifier__same-amount-serial-numbers-in-the-range-to-match-quantity-to-move': {
                    return ui.localize(
                        '@sage/x3-stock/pages__mobile_intersite_transfer_by_identifier__same-amount-serial-numbers-in-the-range-to-match-quantity-to-move',
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
            if (!this.startingSerialNumber.value?.code) {
                throw new Error(
                    '@sage/x3-stock/pages__mobile_intersite_transfer_by_identifier_lines__notification__error_startingSerialNumber',
                );
            }

            const _currentRecord = this.stock.getRecordValue(this._selectedLineId);
            if (_currentRecord) {
                const _productCode = String(_currentRecord.product?.product?.code);
                const _stockChangeLines = this._stockChangeLines;
                const _quantityInPackingUnit = Number(_currentRecord?.quantityInPackingUnit);

                // check that this will add any duplicates
                const startNumberToAdd = this.startingSerialNumber.value.code.match(/\d+$/);
                const endNumberToAdd = Number(this.endingSerialNumber.value?.match(/\d+$/));
                let serialNumberAlreadyUsed = false;

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
                            this.startingSerialNumber?.value?.code?.substring(
                                0,
                                this.startingSerialNumber.value?.code?.length -
                                    Number(startNumberToAdd?.toString().length),
                            )
                        ) {
                            return false;
                        }
                        return Number(startNumberToAdd) <= rowEndMatch && endNumberToAdd >= Number(rowStartMatch);
                    })
                ) {
                    serialNumberAlreadyUsed = true;
                }

                if (!serialNumberAlreadyUsed && _stockChangeLines.length) {
                    serialNumberAlreadyUsed = _stockChangeLines
                        .filter(_ => !!_.serialNumber && _.product === _productCode)
                        .some(_line =>
                            _line?.stockDetails?.some(_stockDetail => {
                                const _startingSerialNumber = Number(_stockDetail?.serialNumber?.match(/\d+$/));
                                const _endingSerialNumber = Number(_stockDetail?.endingSerialNumber?.match(/\d+$/));
                                return (
                                    Number(startNumberToAdd) <= _endingSerialNumber &&
                                    Number(endNumberToAdd) >= _startingSerialNumber
                                );
                            }),
                        );
                }

                if (serialNumberAlreadyUsed) {
                    throw new Error('@sage/x3-stock/serial-number-range-overlap');
                }

                if (
                    this.endingSerialNumber.value !==
                    calculateEndingSerialNumber(
                        String(this.startingSerialNumber?.value?.code),
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
                        _productCode,
                        String(this._stockSite?.code),
                        _currentRecord?.stockId,
                        String(this.startingSerialNumber.value?.code),
                        this.endingSerialNumber.value,
                    )) !== Number(this.quantityToMove.value)
                ) {
                    throw new Error('@sage/x3-stock/serial-number-not-sequential');
                }

                this.serialNumberLines.addRecord({
                    quantity: this.quantityToMove.value,
                    startingSerialNumber: this.startingSerialNumber.value.code,
                    endingSerialNumber: this.endingSerialNumber.value,
                });

                let _stockChangeLine = _stockChangeLines.find(
                    _ =>
                        Number(_.stockId) === Number(_currentRecord?.stockId) &&
                        _.lineNumber === this._selectedLineIndex,
                );

                if (!_stockChangeLine) {
                    _stockChangeLine = <Partial<StockChangeLineInput>>{
                        product: String(_currentRecord?.product?.product?.code),
                        stockId: String(_currentRecord?.stockId),
                        packingUnit: _currentRecord?.packingUnit?.code,
                        quantityInPackingUnit: _quantityInPackingUnit,
                        packingUnitToStockUnitConversionFactor: Number(
                            _currentRecord?.packingUnitToStockUnitConversionFactor,
                        ),
                        lineNumber: this._selectedLineIndex,
                        licensePlateNumber: _currentRecord?.licensePlateNumber?.code,
                        lot: _currentRecord?.lot,
                        sublot: _currentRecord?.sublot,
                        stockDetails: [],
                    };
                    _stockChangeLines.push(_stockChangeLine);
                }

                // Store information
                _stockChangeLine.stockDetails ??= [];

                // Total quantity to come
                const _totalQuantityInPackingUnit =
                    Number(this.quantityToMove.value) + this._getStockDetailToMoveInPackingUnit(_stockChangeLine);

                _stockChangeLine.packingUnitDestination = _currentRecord?.packingUnit?.code;
                _stockChangeLine.quantityInPackingUnit = _totalQuantityInPackingUnit;

                _stockChangeLine.stockDetails.push(<Partial<StockJournalInput>>{
                    serialNumber: this.startingSerialNumber.value?.code,
                    endingSerialNumber: this.endingSerialNumber.value ?? undefined,
                    packingUnit: _currentRecord?.packingUnit?.code,
                    packingUnitToStockUnitConversionFactor: Number(
                        _currentRecord?.packingUnitToStockUnitConversionFactor,
                    ),
                    quantityInPackingUnit: Number(this.quantityToMove.value),
                    quantityInStockUnit:
                        Number(this.quantityToMove.value) *
                        Number(_currentRecord?.packingUnitToStockUnitConversionFactor),
                    location: _currentRecord?.location?.code,
                    status: _currentRecord?.status?.code,
                    identifier1: _currentRecord?.identifier1,
                    identifier2: _currentRecord?.identifier2,
                });

                _stockChangeLine.serialNumber = _stockChangeLine.stockDetails[0].serialNumber;

                this._saveDetail(this._selectedLineId, this._selectedLineIndex);

                const _quantityToMove = Math.max(
                    Number((_currentRecord as any).quantityInPackingUnitOrigin) - _totalQuantityInPackingUnit,
                    0,
                );

                (_currentRecord as any).quantityToMove = _quantityToMove;
                this.stock.setRecordValue(_currentRecord as any);
                this.quantityToMove.value = _quantityToMove;
                this.startingSerialNumber.value = null;
                this.endingSerialNumber.value = null;
                this.helperSelectButton.isDisabled = false;

                await this.$.commitValueAndPropertyChanges();
            }
        },
    })
    addSerialRange: ui.PageAction;

    /*
     *  Sections
     */

    @ui.decorators.section<MobileIntersiteTransferByIdentifierDetails>({
        isTitleHidden: true,
    })
    mainSection: ui.containers.Section;

    @ui.decorators.section<MobileIntersiteTransferByIdentifierDetails>({
        title: 'Stock change',
        isTitleHidden: true,
    })
    detailPanelSection: ui.containers.Section;

    /*
     *  Blocks
     */

    @ui.decorators.block<MobileIntersiteTransferByIdentifierDetails>({
        isTitleHidden: true,
        width: 'extra-large',
        parent() {
            return this.mainSection;
        },
    })
    bodyBlock: ui.containers.Block;

    @ui.decorators.block<MobileIntersiteTransferByIdentifierDetails>({
        isTitleHidden: true,
        parent() {
            return this.detailPanelSection;
        },
    })
    detailsBlock: ui.containers.Block;

    @ui.decorators.block<MobileIntersiteTransferByIdentifierDetails>({
        isTitleHidden: true,
        parent() {
            return this.detailPanelSection;
        },
    })
    quantityBlock: ui.containers.Block;

    @ui.decorators.block<MobileIntersiteTransferByIdentifierDetails>({
        isTitleHidden: true,
        parent() {
            return this.detailPanelSection;
        },
    })
    numberSerialBlock: ui.containers.Block;

    @ui.decorators.block<MobileIntersiteTransferByIdentifierDetails>({
        isTitleHidden: true,
        parent() {
            return this.detailPanelSection;
        },
    })
    listSerialNumberBlock: ui.containers.Block;

    /*
     *  Fields
     */

    @ui.decorators.referenceField<MobileIntersiteTransferByIdentifierDetails, Product>({
        parent() {
            return this.bodyBlock;
        },
        title: 'Product',
        node: '@sage/x3-master-data/Product',
        valueField: 'code',
        helperTextField: 'upc',
        placeholder: 'Scan or select...',
        isMandatory: false,
        isTransient: true,
        canFilter: false,
        isAutoSelectEnabled: true,
        isDisabled: false,
        isFullWidth: true,
        isHidden: true,
        shouldSuggestionsIncludeColumns: true,
        filter() {
            return {
                productStatus: { _ne: 'notUsable' },
                _and: [
                    { stockManagementMode: { _ne: 'notManaged' } },
                    { productSites: { _atLeast: 1, stockSite: { code: this._stockSite.code } } },
                ],
            };
        },
        async onInputValueChange(this, rawData: string) {
            await this._activeSwitchAndButtonSearch(!rawData);
        },
        async onChange() {
            if (this.product?.value?.code) {
                addValueToSelectedIdentifier(this, 'product', this.product?.value?.code);
            }
            await this._activeSwitchAndButtonSearch(!this.product?.value?.code);
        },
        columns: [
            ui.nestedFields.text({
                bind: 'code',
            }),
            ui.nestedFields.text({
                bind: 'localizedDescription1',
            }),
            ui.nestedFields.text({
                bind: 'upc',
                prefix: 'UPC:',
            }),
            ui.nestedFields.text({
                bind: 'globalTradeItemNumber',
                title: 'GTIN',
                isReadOnly: true,
                isHidden: true,
            }),
            ui.nestedFields.text({
                bind: 'serialNumberManagementMode',
                isHidden: true,
            }),
        ],
    })
    product: ui.fields.Reference;

    @ui.decorators.referenceField<MobileIntersiteTransferByIdentifierDetails, LotsSites>({
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
        isHidden: true,
        filter() {
            const lotFilter: any = {
                product: { code: this.product.value ? this.product.value.code : { _nin: [null, ''] } },
                storageSite: { code: this._stockSite.code },
                lot: { _nin: [null, ''] },
            };
            return lotFilter;
        },
        async onInputValueChange(this, rawData: string) {
            await this._activeSwitchAndButtonSearch(!rawData);
        },
        async onChange() {
            if (this.lot.value?.lot) {
                addValueToSelectedIdentifier(this, 'lot', this.lot.value.lot);
                if (!this.sublot.isHidden) {
                    this.sublot.value = this.lot.value?.sublot ?? '';
                    addValueToSelectedIdentifier(this, 'sublot', this.sublot.value);
                }
            } else {
                this.sublot.value = null;
            }
            await this._activeSwitchAndButtonSearch(!this.lot.value?.lot);
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

    @ui.decorators.textField<MobileIntersiteTransferByIdentifierDetails>({
        parent() {
            return this.bodyBlock;
        },
        placeholder: 'Scan a sublot',
        title: 'Sublot',
        isTransient: true,
        isMandatory: false,
        isDisabled: true,
        isFullWidth: true,
        isHidden: true,
        async onInputValueChange(this, rawData: string) {
            await this._activeSwitchAndButtonSearch(!rawData);
        },
        async onChange() {
            await this._activeSwitchAndButtonSearch(!this.sublot?.value);
        },
    })
    sublot: ui.fields.Text;

    @ui.decorators.referenceField<MobileIntersiteTransferByIdentifierDetails, SerialNumber>({
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
        isHidden: true,
        filter() {
            const serialNumberFilter: any = {
                stockSite: { code: this._stockSite.code },
                issueDocumentId: '',
            };
            return serialNumberFilter;
        },
        async onInputValueChange(this, rawData: string) {
            await this._activeSwitchAndButtonSearch(!rawData);
        },
        async onChange() {
            if (this.serialNumber?.value?.code) {
                addValueToSelectedIdentifier(this, 'serialNumber', this.serialNumber?.value?.code);
            }
            await this._activeSwitchAndButtonSearch(!this.serialNumber?.value?.code);
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

    @ui.decorators.referenceField<MobileIntersiteTransferByIdentifierDetails, Location>({
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
        isHidden: true,
        filter() {
            const locationFilter: any = {
                stockSite: { code: this._stockSite.code },
                category: { _nin: ['subcontract', 'customer'] },
            };
            return locationFilter;
        },
        async onInputValueChange(this, rawData: string) {
            await this._activeSwitchAndButtonSearch(!rawData);
        },
        async onChange() {
            if (this.location?.value?.code) {
                addValueToSelectedIdentifier(this, 'location', this.location?.value?.code);
            }
            await this._activeSwitchAndButtonSearch(!this.location?.value?.code);
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

    @ui.decorators.textField<MobileIntersiteTransferByIdentifierDetails>({
        parent() {
            return this.bodyBlock;
        },
        title: 'Identifier 1',
        placeholder: 'Scan...',
        validation: /^$|^[^|]+$/,
        isTransient: true,
        isMandatory: false,
        isFullWidth: true,
        isHidden: true,
        async onInputValueChange(this, rawData: string) {
            await this._activeSwitchAndButtonSearch(!rawData);
        },
        async onChange() {
            if (this.identifier1?.value) {
                addValueToSelectedIdentifier(this, 'identifier1', this.identifier1?.value);
            }
            await this._activeSwitchAndButtonSearch(!this.identifier1?.value);
        },
    })
    identifier1: ui.fields.Text;

    @ui.decorators.textField<MobileIntersiteTransferByIdentifierDetails>({
        parent() {
            return this.bodyBlock;
        },
        title: 'Identifier 2',
        placeholder: 'Scan...',
        validation: /^$|^[^|]+$/,
        isTransient: true,
        isMandatory: false,
        isFullWidth: true,
        isHidden: true,
        async onInputValueChange(this, rawData: string) {
            await this._activeSwitchAndButtonSearch(!rawData);
        },
        async onChange() {
            if (this.identifier2?.value) {
                addValueToSelectedIdentifier(this, 'identifier2', this.identifier2?.value);
            }
            await this._activeSwitchAndButtonSearch(!this.identifier2?.value);
        },
    })
    identifier2: ui.fields.Text;

    @ui.decorators.referenceField<MobileIntersiteTransferByIdentifierDetails, LicensePlateNumber>({
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
        isHidden: true,
        filter() {
            return {
                _and: [{ status: 'inStock' }, { stockSite: { code: this._stockSite.code } }],
            };
        },
        async onInputValueChange(this, rawData: string) {
            await this._activeSwitchAndButtonSearch(!rawData);
        },
        async onChange() {
            if (this.licensePlateNumber?.value?.code) {
                addValueToSelectedIdentifier(this, 'licensePlateNumber', this.licensePlateNumber?.value?.code);
            }
            await this._activeSwitchAndButtonSearch(!this.licensePlateNumber?.value?.code);
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

    @ui.decorators.selectField<MobileIntersiteTransferByIdentifierDetails>({
        parent() {
            return this.bodyBlock;
        },
        title: 'Status',
        placeholder: 'Scan or select...',
        isTransient: true,
        isMandatory: false,
        isFullWidth: true,
        isHidden: true,
    })
    status: ui.fields.Select;

    @ui.decorators.selectField<MobileIntersiteTransferByIdentifierDetails>({
        parent() {
            return this.bodyBlock;
        },
        title: 'Unit',
        placeholder: 'Scan or select...',
        isTransient: true,
        isMandatory: false,
        isFullWidth: true,
        isHidden: true,
    })
    packingUnit: ui.fields.Select;

    @ui.decorators.numericField<MobileIntersiteTransferByIdentifierDetails>({
        parent() {
            return this.bodyBlock;
        },
        title: 'Conversion factor',
        placeholder: 'Scan...',
        isTransient: true,
        isMandatory: false,
        isFullWidth: true,
        isHidden: true,
        min: 0,
    })
    packingUnitToStockUnitConversionFactor: ui.fields.Numeric;

    @ui.decorators.textField<MobileIntersiteTransferByIdentifierDetails>({
        parent() {
            return this.bodyBlock;
        },
        title: 'Stock custom field 1',
        placeholder: 'Scan...',
        validation: /^$|^[^|]+$/,
        isTransient: true,
        isMandatory: false,
        isFullWidth: true,
        isHidden: true,
    })
    stockCustomField1: ui.fields.Text;

    @ui.decorators.textField<MobileIntersiteTransferByIdentifierDetails>({
        parent() {
            return this.bodyBlock;
        },
        title: 'Stock custom field 2',
        placeholder: 'Scan...',
        validation: /^$|^[^|]+$/,
        isTransient: true,
        isMandatory: false,
        isFullWidth: true,
        isHidden: true,
    })
    stockCustomField2: ui.fields.Text;

    @ui.decorators.switchField<MobileIntersiteTransferByIdentifierDetails>({
        parent() {
            return this.bodyBlock;
        },
        title: 'Select all',
        isDisabled: false,
        isHidden: false,
        isReadOnly: false,
        isFullWidth: true,
        async onChange() {
            this.$.loader.isHidden = false;
            if (this.selectAllSwitch.value) {
                if (this.stock.value.length > 0) {
                    const _siteDestination = this._getSavedInputs()?.siteDestination?.code;
                    const isProductManagedInSite =
                        this.stock.value.some(stockItem =>
                            stockItem?.product?.product?.productSites?.some(
                                productItem => productItem?.stockSite?.code === _siteDestination,
                            ),
                        ) ?? false;
                    if (!isProductManagedInSite) {
                        this._notifier.show(
                            ui.localize(
                                '@sage/x3-stock/pages__mobile_intersite_transfer_by_identifier_lines__notification__product_not_managed_in_stock_for_the_site',
                                'Select all action not available for this selection: at least one product is not managed in stock for the site: {{site}}.',
                                { site: _siteDestination },
                            ),
                            'error',
                        );
                        this.selectAllSwitch.value = false;
                        this.nextButton.isDisabled = true;
                    } else if (!isProductGlobalReceivedIssuedInStock(this)) {
                        this._onSelectAllLines();
                        this.nextButton.isDisabled = false;
                    } else {
                        this._notifier.show(
                            ui.localize(
                                '@sage/x3-stock/pages__mobile_intersite_transfer_by_identifier_lines__notification__product_is_global_serial_number_managed',
                                'Select all action not available for this selection: at least one product is global serial number managed.',
                            ),
                            'error',
                        );
                        this.selectAllSwitch.value = false;
                        this.nextButton.isDisabled = true;
                    }
                } else {
                    this.searchButton.isDisabled = true;
                    this.nextButton.isDisabled = false;
                }
            } else {
                this.searchButton.isDisabled = false;
                this._onDeselectAllLines();
            }
            this.$.loader.isHidden = true;
        },
    })
    selectAllSwitch: ui.fields.Switch;

    @ui.decorators.separatorField<MobileIntersiteTransferByIdentifierDetails>({
        parent() {
            return this.bodyBlock;
        },
        isFullWidth: true,
        isInvisible: true,
    })
    lineSeparator: ui.fields.Separator;

    @ui.decorators.tableField<MobileIntersiteTransferByIdentifierDetails, Stock>({
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
        columns: [
            ui.nestedFields.numeric({
                bind: 'quantityToMove' as any,
                isReadOnly: true,
                isHidden: false,
                isTransient: true,
                title: 'Quantity to move',
                isTitleHidden: false,
                isMandatory: false,
                isFullWidth: true,
                postfix(_value, rowValue?: Dict<any>) {
                    return `/ ${ui.formatNumberToCurrentLocale(
                        Number(rowValue?.quantityInPackingUnitOrigin ?? 0),
                        rowValue?.packingUnit?.numberOfDecimals,
                    )} ${rowValue?.packingUnit?.code ?? ''}`;
                },
                max(rowValue?: Dict<any>) {
                    return (rowValue as any).quantityInPackingUnitOrigin;
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
            ui.nestedFields.reference<MobileIntersiteTransferByIdentifierDetails, Stock, ProductSite>({
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
            ui.nestedFields.reference<MobileIntersiteTransferByIdentifierDetails, Stock, LicensePlateNumber>({
                bind: 'licensePlateNumber',
                valueField: 'code',
                node: '@sage/x3-stock-data/LicensePlateNumber',
                isReadOnly: true,
                isHidden: true,
            }),
            ui.nestedFields.reference<MobileIntersiteTransferByIdentifierDetails, Stock, Location>({
                bind: 'location',
                valueField: 'code',
                node: '@sage/x3-stock-data/Location',
                isReadOnly: true,
                isHidden: false,
            }),
            ui.nestedFields.reference<MobileIntersiteTransferByIdentifierDetails, Stock, Location>({
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
                    return this.lot.isHidden ?? true;
                },
            }),
            ui.nestedFields.text({
                bind: 'sublot',
                isReadOnly: true,
                isHidden() {
                    return this.sublot.isHidden ?? true;
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
                    return this.serialNumber.isHidden ?? true;
                },
            }),
            ui.nestedFields.reference<MobileIntersiteTransferByIdentifierDetails, Stock, StockStatus>({
                bind: 'status',
                valueField: 'code',
                node: '@sage/x3-stock-data/StockStatus',
                isReadOnly: true,
                isHidden: true,
            }),
            ui.nestedFields.text({
                bind: 'statusDestination' as any,
                isReadOnly: true,
                isTransient: true,
                isHidden: true,
            }),
            ui.nestedFields.technical<MobileIntersiteTransferByIdentifierDetails, Stock, UnitOfMeasure>({
                bind: 'packingUnit',
                node: '@sage/x3-master-data/UnitOfMeasure',
                nestedFields: [
                    ui.nestedFields.text({
                        bind: 'code',
                    }),
                    ui.nestedFields.numeric({ bind: 'numberOfDecimals' }),
                ],
            }),
            ui.nestedFields.technical<MobileIntersiteTransferByIdentifierDetails, Stock, UnitOfMeasure>({
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
                isHidden: true,
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
                    return this.identifier1.isHidden ?? true;
                },
            }),
            ui.nestedFields.text({
                bind: 'identifier1Destination' as any,
                isReadOnly: true,
                isTransient: true,
                isHidden: true,
            }),
            ui.nestedFields.text({
                bind: 'identifier2',
                isReadOnly: true,
                isHidden() {
                    return this.identifier2.isHidden ?? true;
                },
            }),
            ui.nestedFields.text({
                bind: 'identifier2Destination' as any,
                isReadOnly: true,
                isTransient: true,
                isHidden: true,
            }),
            ui.nestedFields.text({
                bind: 'stockCustomField1',
                isReadOnly: true,
                isHidden: true,
            }),
            ui.nestedFields.text({
                bind: 'stockCustomField2',
                isReadOnly: true,
                isHidden: true,
            }),
            ui.nestedFields.technical({
                bind: 'stockId',
            }),
            ui.nestedFields.technical<MobileIntersiteTransferByIdentifierDetails, Stock, Lot>({
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
        async onRowSelected(recordId: string, rowItem: Stock) {
            this._selectedLineId = recordId;
            this._selectedLineIndex = this._getLineIndex(recordId);
            const _siteDestination = this._getSavedInputs()?.siteDestination?.code;
            const _currentRecord = this.stock.getRecordValue(recordId);
            const isProductManagedInSite =
                _currentRecord?.product?.product?.productSites?.some(
                    productItem => productItem?.stockSite?.code === _siteDestination,
                ) ?? false;
            if (!isProductManagedInSite) {
                this._notifier.show(
                    ui.localize(
                        '@sage/x3-stock/pages__mobile_intersite_transfer_by_identifier_lines__product_not_managed_in_stock_for_the_site',
                        '{{ product }}: product not managed in stock for the site: {{site}}.',
                        { product: _currentRecord?.product?.product?.code, site: _siteDestination },
                    ),
                    'error',
                );
                await this._onDeselect(recordId, this._selectedLineIndex);
                return;
            }

            if (rowItem.product?.product?.serialNumberManagementMode !== 'globalReceivedIssued') {
                await this._onSelect(recordId, this._selectedLineIndex, true);
                this._saveDetail(recordId, this._selectedLineIndex);
                this.nextButton.isDisabled = false;
            } else {
                await this._onRowClick(recordId, this._selectedLineIndex, rowItem);
            }
        },
        async onRowUnselected(recordId: string, rowItem: Stock) {
            this._selectedLineId = recordId;
            this._selectedLineIndex = this._getLineIndex(recordId);
            await this._onDeselect(recordId, this._selectedLineIndex);
            if (rowItem.product?.product?.serialNumberManagementMode === 'globalReceivedIssued') {
                await this._onRowClick(recordId, this._selectedLineIndex, rowItem);
            }
        },
        mapServerRecord(record: Partial<Stock>) {
            return {
                ...record,
                quantityInPackingUnitOrigin: this._getQuantityInPackingUnitOrigin(record),
                quantityInPackingUnitRest: this._getQuantityInPackingUnitRest(record),
                quantityToMove: this._getQuantityToMove(record),
                locationDestination: this._getLocationDestination(record),
                statusDestination: this._getStatusDestination(record),
                packingUnitDestination: this._getPackingUnitDestination(record),
                identifier1Destination: this._getIdentifier1Destination(record),
                identifier2Destination: this._getIdentifier2Destination(record),
                lotReferenceExpirationDate: record.lotReference?.expirationDate,
                lotReferenceMajorVersion: record.lotReference?.majorVersion?.code,
                lotReferenceUseByDate: record.lotReference?.useByDate,
                globalSerialNumber: ui.localize('@sage/x3-stock/label-view-all', 'View list'),
            };
        },
        async onRowClick(recordId: string, rowItem: Stock) {
            this._selectedLineId = recordId;
            this._selectedLineIndex = this._getLineIndex(recordId);
            const _siteDestination = this._getSavedInputs()?.siteDestination?.code;
            const _currentRecord = this.stock.getRecordValue(recordId);
            const isProductManagedInSite =
                _currentRecord?.product?.product?.productSites?.some(
                    productItem => productItem?.stockSite?.code === _siteDestination,
                ) ?? false;
            if (!isProductManagedInSite) {
                this._notifier.show(
                    ui.localize(
                        '@sage/x3-stock/pages__mobile_intersite_transfer_by_identifier_lines__notification__product_not_managed_in_stock_for_the_destination_site',
                        '{{ product }}: product not managed in stock for the site: {{site}}.',
                        { product: _currentRecord?.product?.product?.code, site: _siteDestination },
                    ),
                    'error',
                );
            } else {
                await this._onRowClick(recordId, this._selectedLineIndex, rowItem);
            }
        },
    })
    stock: ui.fields.Table<Stock>;

    @ui.decorators.detailListField<MobileIntersiteTransferByIdentifierDetails, Stock>({
        parent() {
            return this.detailsBlock;
        },
        node: '@sage/x3-stock-data/Stock',
        isTransient: true,
        isFullWidth: true,
        isTitleHidden: true,
        fields: [
            ui.nestedFields.reference<MobileIntersiteTransferByIdentifierDetails, Stock, ProductSite>({
                bind: 'product',
                valueField: { product: { code: true } },
                node: '@sage/x3-master-data/ProductSite',
                title: 'Product',
                isReadOnly: true,
                isHidden: false,
            }),
            ui.nestedFields.reference<MobileIntersiteTransferByIdentifierDetails, Stock, LicensePlateNumber>({
                bind: 'licensePlateNumber',
                title: 'License plate number',
                valueField: 'code',
                node: '@sage/x3-stock-data/LicensePlateNumber',
                isReadOnly: true,
                isHidden: hideWhenEmptyValue,
            }),
            ui.nestedFields.reference<MobileIntersiteTransferByIdentifierDetails, Stock, Location>({
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
                    return (
                        this.stock.getRecordValue(this._selectedLineId)?.product?.product?.expirationManagementMode ===
                            'notManaged' || !value
                    );
                },
            }),
            ui.nestedFields.date({
                bind: 'lotReferenceUseByDate' as any,
                title: 'Use-by date',
                isReadOnly: true,
                isHidden(value: Date) {
                    return (
                        this.stock.getRecordValue(this._selectedLineId)?.product?.product?.expirationManagementMode ===
                            'notManaged' || !value
                    );
                },
            }),
            ui.nestedFields.reference<MobileIntersiteTransferByIdentifierDetails, Stock, Lot>({
                node: '@sage/x3-stock-data/Lot',
                bind: 'lotReference',
                valueField: 'lotCustomField1',
                title: 'Lot custom field 1',
                isReadOnly: true,
                isHidden(value: Lot) {
                    return !value?.lotCustomField1;
                },
            }),
            ui.nestedFields.reference<MobileIntersiteTransferByIdentifierDetails, Stock, Lot>({
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
                    return (
                        this.stock.getRecordValue(this._selectedLineId)?.product?.product
                            ?.serialNumberManagementMode !== 'globalReceivedIssued'
                    );
                },
                async onClick(_id, rowData: any) {
                    const options: ui.dialogs.PageDialogOptions = {
                        resolveOnCancel: true,
                    };
                    try {
                        await this.$.dialog.page(
                            '@sage/x3-stock/MobileGlobalSerialDetails',
                            {
                                product: rowData?.product?.product?.code,
                                stockId: rowData?.stockId,
                                subtitle:
                                    this.stock.getRecordValue(this._selectedLineId)?.product?.product
                                        ?.localizedDescription1 ?? '',
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
                postfix(rowValue?: Dict<any>) {
                    return rowValue?.packingUnit?.code ?? '';
                },
            }),
            ui.nestedFields.numeric({
                bind: 'quantityInPackingUnit',
                title: 'Packing qty.',
                isReadOnly: true,
                isHidden: false,
                postfix() {
                    return this.stock.getRecordValue(this._selectedLineId)?.packingUnit?.code ?? '';
                },
                scale() {
                    return this.stock.getRecordValue(this._selectedLineId)?.packingUnit?.numberOfDecimals ?? 0;
                },
            }),
            ui.nestedFields.reference<MobileIntersiteTransferByIdentifierDetails, Stock, UnitOfMeasure>({
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
                    return this.stock.getRecordValue(this._selectedLineId)?.product?.product?.stockUnit?.code ?? '';
                },
                scale() {
                    return (
                        this.stock.getRecordValue(this._selectedLineId)?.product?.product?.stockUnit
                            ?.numberOfDecimals ?? 0
                    );
                },
            }),
            ui.nestedFields.numeric({
                bind: 'allocatedQuantity',
                title: 'Allocated qty.',
                isReadOnly: true,
                isHidden: hideWhenEmptyValue,
                postfix() {
                    return this.stock.getRecordValue(this._selectedLineId)?.product?.product?.stockUnit?.code ?? '';
                },
                scale() {
                    return (
                        this.stock.getRecordValue(this._selectedLineId)?.product?.product?.stockUnit
                            ?.numberOfDecimals ?? 0
                    );
                },
            }),
            ui.nestedFields.reference<MobileIntersiteTransferByIdentifierDetails, Stock, StockStatus>({
                bind: 'status',
                title: 'Status',
                valueField: 'code',
                node: '@sage/x3-stock-data/StockStatus',
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

    @ui.decorators.numericField<MobileIntersiteTransferByIdentifierDetails>({
        parent() {
            return this.quantityBlock;
        },
        postfix() {
            const rowId = this._selectedLineId;
            const _record = this.stock.getRecordValue(rowId) as any;
            return `/ ${ui.formatNumberToCurrentLocale(
                Number(_record?.quantityInPackingUnitOrigin ?? 0),
                _record?.packingUnit?.numberOfDecimals,
            )} ${String(_record?.packingUnit?.code)}`;
        },
        title: 'Quantity to move', // this is important to display a title in the grid row block
        isMandatory: false,
        isFullWidth: true,
        isTransient: true,
        max() {
            return (this.stock.getRecordValue(this._selectedLineId) as any)?.quantityInPackingUnitRest;
        },
        scale() {
            const rowId = this._selectedLineId;
            const _record = this.stock.getRecordValue(rowId) as any;
            return _record?.packingUnit?.numberOfDecimals;
        },
        async onChange() {
            const _currentRecord = this.stock.getRecordValue(this._selectedLineId);
            if (_currentRecord) {
                // Total quantity to move for this line
                (_currentRecord as any).quantityToMove =
                    Number(this.quantityToMove.value) +
                    this._calcQuantityRemaining(_currentRecord, this._getStockChangeLines());
                this.stock.setRecordValue(_currentRecord);
                await this.$.commitValueAndPropertyChanges();
                await this._onChangeBody();
            }
        },
    })
    quantityToMove: ui.fields.Numeric;

    @ui.decorators.referenceField<MobileIntersiteTransferByIdentifierDetails, SerialNumber>({
        parent() {
            return this.numberSerialBlock;
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
            const _record = this.stock.getRecordValue(this._selectedLineId);
            return {
                _and: [{ product: { code: _record?.product?.product?.code } }, { stockId: _record?.stockId }],
            };
        },
        isHidden() {
            return (
                this.stock.getRecordValue(this._selectedLineId)?.product?.product?.serialNumberManagementMode !==
                'globalReceivedIssued'
            );
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

    @ui.decorators.textField<MobileIntersiteTransferByIdentifierDetails>({
        parent() {
            return this.numberSerialBlock;
        },
        title: 'Ending serial number',
        isMandatory: false,
        isTransient: true,
        isReadOnly: true,
        isFullWidth: true,
        isHidden() {
            return (
                this.stock.getRecordValue(this._selectedLineId)?.product?.product?.serialNumberManagementMode !==
                'globalReceivedIssued'
            );
        },
    })
    endingSerialNumber: ui.fields.Text;

    @ui.decorators.tableField<MobileIntersiteTransferByIdentifierDetails>({
        parent() {
            return this.listSerialNumberBlock;
        },
        title: 'Serial number(s) to move ',
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
            ui.nestedFields.text({
                bind: 'quantity',
                title: 'Quantity',
                isReadOnly: true,
                postfix() {
                    return this.stock.getRecordValue(this._selectedLineId)?.packingUnit?.code ?? '';
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
                    const _removedRecordSerialNumber = this.serialNumberLines.getRecordValue(recordId);
                    let _quantityInPackingUnit = 0;
                    if (_removedRecordSerialNumber) {
                        const _startingSerialNumber = String(_removedRecordSerialNumber?.startingSerialNumber);
                        const _currentStockChangeLine = this._stockChangeLines.find(_ =>
                            _.stockDetails?.some(_ => _.serialNumber === _startingSerialNumber),
                        );
                        if (_currentStockChangeLine) {
                            const _stockDetails = _currentStockChangeLine.stockDetails;
                            const _removedIndexSerialNumber = _stockDetails?.findIndex(
                                _ => _.serialNumber === _startingSerialNumber,
                            );
                            if (_removedIndexSerialNumber !== undefined) {
                                _stockDetails?.splice(_removedIndexSerialNumber, 1);
                                _currentStockChangeLine.serialNumber = _stockDetails?.length
                                    ? _stockDetails[0].serialNumber
                                    : undefined;
                                _quantityInPackingUnit =
                                    this._getStockDetailToMoveInPackingUnit(_currentStockChangeLine);
                                _currentStockChangeLine.quantityInPackingUnitDestination = _quantityInPackingUnit;
                                this._saveStockChange();
                            }
                        }
                        this.serialNumberLines.removeRecord(recordId);
                    }

                    const _currentRecord = this.stock.getRecordValue(this._selectedLineId);
                    if (_currentRecord) {
                        const _quantityToMove = Math.max(
                            Number((_currentRecord as any).quantityInPackingUnitOrigin) - _quantityInPackingUnit,
                            0,
                        );
                        (_currentRecord as any).quantityToMove = _quantityToMove;
                        this.stock.setRecordValue(_currentRecord as any);
                    }
                    this.startingSerialNumber.isDisabled = false;
                },
            },
        ],
        fieldActions() {
            return [this.addSerialRange];
        },
        isHidden() {
            return (
                this.stock.getRecordValue(this._selectedLineId)?.product?.product?.serialNumberManagementMode !==
                'globalReceivedIssued'
            );
        },
    })
    serialNumberLines: ui.fields.Table<any>;

    private _activeSelectButton() {
        if (
            this.stock.getRecordValue(this._selectedLineId)?.product?.product?.serialNumberManagementMode ===
            'globalReceivedIssued'
        ) {
            this.helperSelectButton.isDisabled = !this.serialNumberLines.value.length;
        } else {
            this.helperSelectButton.isDisabled = !this.quantityToMove.value;
        }
    }

    /*
     *  Init functions
     */

    private async _init() {
        const _savedInputs = this._getSavedInputs();
        this._selectedIdentifierValues = _savedInputs?.selectedIdentifierValues;
        this._initSiteCodeField();
        await initFieldsToBeVisible(this, this._identifier);
        if (Number(_savedInputs?.intersiteTransfer?.stockChangeLines?.length) > 0) {
            this._stockChangeLines = [];
            this.$.loader.isHidden = false;
            await this._onSearch(generateStockTableFilter(this));
            this.$.setPageClean();
            this.$.loader.isHidden = true;
            this.searchButton.isDisabled = false;
        } else {
            disableButton(this);
        }
    }

    private _getSavedInputs(): inputsIntersiteTransfer {
        return JSON.parse(
            this.$.storage.get('mobile-intersiteTransferByIdentifier') as string,
        ) as inputsIntersiteTransfer;
    }

    private _initSiteCodeField() {
        const siteCode = this.$.storage.get('mobile-selected-stock-site') as string;
        if (siteCode) {
            this.site.value = siteCode;
        }
    }

    private async _onChangeBody() {
        const _currentRecord = this.stock.getRecordValue(this._selectedLineId);
        const _currentQty = Number(this.quantityToMove.value);
        if (!_currentRecord || !_currentQty || !this.startingSerialNumber.value?.code) {
            this.endingSerialNumber.value = null;
            return;
        }
        this.startingSerialNumber.value.code = this.startingSerialNumber.value.code.toUpperCase();
        if (_currentQty > 1) {
            this.endingSerialNumber.value = calculateEndingSerialNumber(
                String(this.startingSerialNumber.value.code),
                _currentQty,
            );
        } else {
            this.endingSerialNumber.value = this.startingSerialNumber.value.code;
        }

        this.addSerialRange.isHidden = _currentQty > Number((_currentRecord as any).quantityInPackingUnitOrigin);

        await this.$.commitValueAndPropertyChanges();
    }

    /**
     * Select or create stockChangeLine from current card item with(out) global serialization
     * before to allow edit in detail grid :
     * - initialize quantity to move, stockDetails with row...
     * - Search existing line(s) in stockChangeLines array
     * - for product with global serial : retrieve all existing serials numbers.
     * - for other product, create line when missing.
     * @param recordId Current record ID
     * @param recordIndex Current record index
     * @param rowItem Current stock record
     */
    private async _onRowClick(recordId: string, recordIndex: number, rowItem: Stock) {
        const _currentRecord = this.stock.getRecordValue(recordId);

        if (_currentRecord) {
            this.quantityToMove.value = Number((_currentRecord as any)?.quantityToMove);
            this.stockDetails.value = [rowItem];
            this.serialNumberLines.value = [];
            this.serialNumberLines.isHidden = true;

            const _stockChangeLines = this._stockChangeLines?.filter(
                _ => Number(_.stockId) === Number(rowItem.stockId) && _.lineNumber === recordIndex,
            );

            const _stockChangeLine = _stockChangeLines.length ? _stockChangeLines[0] : undefined;

            if (_currentRecord.product?.product?.serialNumberManagementMode === 'globalReceivedIssued') {
                this.serialNumberLines.isHidden = false;

                _stockChangeLines.forEach(line =>
                    line.stockDetails?.forEach(stockDetail => {
                        this.serialNumberLines.addRecord({
                            quantity: Number(stockDetail.quantityInPackingUnit),
                            startingSerialNumber: stockDetail.serialNumber,
                            endingSerialNumber: stockDetail.endingSerialNumber,
                        });
                    }),
                );

                this.stock.setRecordValue(_currentRecord);
            } else if (!_stockChangeLine) {
                this._stockChangeLines.push({
                    product: String(_currentRecord?.product?.product?.code),
                    stockId: String(rowItem?.stockId),
                    packingUnit: _currentRecord?.packingUnit?.code,
                    quantityInPackingUnit: Number(rowItem?.quantityInPackingUnit),
                    packingUnitToStockUnitConversionFactor: rowItem.packingUnitToStockUnitConversionFactor,
                    lineNumber: recordIndex,
                    packingUnitDestination: _currentRecord?.packingUnit?.code,
                    licensePlateNumber: _currentRecord?.licensePlateNumber?.code,
                    lot: _currentRecord?.lot,
                    sublot: _currentRecord?.sublot,
                    serialNumber: _currentRecord?.serialNumber,
                    stockDetails: [
                        {
                            serialNumber: _currentRecord?.serialNumber,
                            endingSerialNumber: undefined,
                            packingUnit: _currentRecord?.packingUnit?.code,
                            packingUnitToStockUnitConversionFactor: Number(
                                rowItem?.packingUnitToStockUnitConversionFactor,
                            ),
                            quantityInPackingUnit: Number(rowItem.quantityInPackingUnit),
                            quantityInStockUnit:
                                Number(rowItem.quantityInPackingUnit) *
                                Number(rowItem?.packingUnitToStockUnitConversionFactor),
                            location: _currentRecord?.location?.code,
                            status: _currentRecord?.status?.code,
                            identifier1: rowItem?.identifier1,
                            identifier2: rowItem?.identifier2,
                        },
                    ],
                });
            }
            this._activeSelectButton();
            await this.$.commitValueAndPropertyChanges();
            await this.stock.validateWithDetails();
            if (this.$.detailPanel) {
                this.$.detailPanel.isHidden = false;
            }
        }
    }

    /**
     * Select or create stockChangeLine from current card item without global serialization
     * - Select current record with optional autoSelect
     * - update or create line for card without global serialization (unique stock detail)
     * - update record information
     * @param recordId Current record ID
     * @param recordIndex Current record index
     * @param autoSelect  True for init quantity to move from record
     */
    private async _onSelect(recordId: string, recordIndex: number, autoSelect = false) {
        const _currentRecord = this.stock.getRecordValue(recordId);

        if (_currentRecord) {
            const _stockChangeLines = this._stockChangeLines;
            const _quantityInPackingUnitOrigin = (<any>_currentRecord)?.quantityInPackingUnitOrigin;

            this.stock.selectRecord(recordId);
            if (autoSelect) {
                this.quantityToMove.value = Number((_currentRecord as any)?.quantityToMove);
            }

            if (_currentRecord?.product?.product?.serialNumberManagementMode !== 'globalReceivedIssued') {
                if (_stockChangeLines) {
                    const _stockJournal = <Partial<StockJournalInput>>{
                        packingUnit: _currentRecord?.packingUnit?.code,
                        packingUnitToStockUnitConversionFactor: Number(
                            _currentRecord?.packingUnitToStockUnitConversionFactor,
                        ),
                        quantityInPackingUnit: Number(this.quantityToMove.value),
                        quantityInStockUnit:
                            Number(this.quantityToMove.value) *
                            Number(_currentRecord?.packingUnitToStockUnitConversionFactor),
                        location: _currentRecord?.location?.code,
                        status: _currentRecord?.status?.code,
                        serialNumber: _currentRecord?.serialNumber,
                        endingSerialNumber: undefined,
                        identifier1: _currentRecord?.identifier1,
                        identifier2: _currentRecord?.identifier2,
                    };

                    let _stockChangeLine = _stockChangeLines.find(
                        _ => Number(_.stockId) === Number(_currentRecord?.stockId) && _.lineNumber === recordIndex,
                    );

                    if (_stockChangeLine) {
                        _stockChangeLine.quantityInPackingUnit = Number(this.quantityToMove.value);
                    } else {
                        _stockChangeLine = <Partial<StockChangeLineInput>>{
                            product: String(_currentRecord?.product?.product?.code),
                            stockId: String(_currentRecord?.stockId),
                            packingUnit: _currentRecord?.packingUnit?.code,
                            quantityInPackingUnit: Number(this.quantityToMove.value),
                            packingUnitToStockUnitConversionFactor:
                                _currentRecord?.packingUnitToStockUnitConversionFactor,
                            lineNumber: recordIndex,
                            packingUnitDestination: _currentRecord?.packingUnit?.code,
                            licensePlateNumber: _currentRecord?.licensePlateNumber?.code,
                            lot: _currentRecord?.lot,
                            sublot: _currentRecord?.sublot,
                            serialNumber: _currentRecord?.serialNumber,
                        };
                        _stockChangeLines.push(_stockChangeLine);
                    }
                    _stockChangeLine.stockDetails = [_stockJournal];
                }
            }

            const _qtyTotalRemaining = this._calcQuantityRemaining(_currentRecord, _stockChangeLines);
            this.quantityToMove.value = _qtyTotalRemaining;
            (_currentRecord as any).quantityToMove = Math.max(_quantityInPackingUnitOrigin - _qtyTotalRemaining, 0);

            this.stock.setRecordValue(_currentRecord);
        }
    }

    /**
     * Calculated total quantity remaining for given record
     * @param _currentRecord Calculate remaining quantity to move for current stock record
     * @param _stockChangeLines Stock change lines to reevaluate
     * @returns quantity remaining
     */
    private _calcQuantityRemaining(_currentRecord: any, _stockChangeLines: Partial<StockChangeLineInput>[]): number {
        if (_currentRecord && _stockChangeLines) {
            const _quantityInPackingUnitOrigin = Number(_currentRecord?.quantityInPackingUnit);
            const _lineNumber = this._selectedLineIndex;
            const _stockId = Number(_currentRecord.stockId);
            return _stockChangeLines
                .filter(_ => Number(_.stockId) === _stockId && _.lineNumber === _lineNumber)
                .reduce<decimal>((acc, _line) => {
                    return acc - this._getStockDetailToMoveInPackingUnit(_line);
                }, _quantityInPackingUnitOrigin);
        }
        return 0;
    }

    /**
     * Unselect stockRecord from current card item without global serialization
     * @param recordId Current record ID
     * @param recordIndex Current record index
     */
    private async _onDeselect(recordId: string, recordIndex: number) {
        const stockRecord = this.stock.getRecordValue(recordId);
        this.stock.unselectRecord(recordId);
        if (stockRecord && this._stockChangeLines?.length) {
            this._stockChangeLines = this._stockChangeLines.filter(
                _ => Number(_.stockId) !== Number(stockRecord.stockId) || Number(_.lineNumber) !== recordIndex,
            );

            (stockRecord as any).quantityToMove = Number((stockRecord as any).quantityInPackingUnitOrigin);
            this.stock.setRecordValue(stockRecord);
            this._saveStockChange();
        }
        this.nextButton.isDisabled = !this.stock.selectedRecords.length;
    }

    private _saveDetail(recordId: string, recordIndex: number) {
        const _currentRecord = this.stock.getRecordValue(recordId);
        if (this._stockChangeLines) {
            const _lineIndex =
                this._stockChangeLines?.findIndex(
                    _ => Number(_.stockId) === Number(_currentRecord?.stockId) && _.lineNumber === recordIndex,
                ) ?? -1;

            if (_lineIndex > -1) {
                const _currentStockChangeLines = this._stockChangeLines[_lineIndex];
                this._stockChangeLines[_lineIndex] = {
                    ..._currentStockChangeLines,
                };

                this._saveStockChange();
            }
        }
    }

    private _saveStockChange() {
        const savedInputs = this._getSavedInputs();
        savedInputs.intersiteTransfer.stockChangeLines = this._stockChangeLines;
        savedInputs.selectedIdentifierValues = this._selectedIdentifierValues;
        this.$.storage.set('mobile-intersiteTransferByIdentifier', JSON.stringify(savedInputs));
    }

    private _getStockChangeLines(): Partial<StockChangeLineInput>[] {
        this._stockChangeLines ??= this._getSavedInputs().intersiteTransfer?.stockChangeLines ?? [];
        return this._stockChangeLines;
    }

    private _getQuantityInPackingUnitOrigin(record: Partial<Stock>): number {
        if ((record as any).quantityInPackingUnitOrigin) {
            return (record as any).quantityInPackingUnitOrigin;
        } else {
            return Number(record.quantityInPackingUnit);
            // const _quantityInPackingUnitOrigin = Number(record.quantityInPackingUnit);
            // return this._getStockChangeLines()
            //     .filter(_ => Number(_.stockId) === Number(record.stockId) && _.lineNumber !== this._selectedLineIndex)
            //     .reduce<decimal>((_acc, _line) => {
            //         return _acc - this._getStockDetailToMoveInPackingUnit(_line);
            //     }, _quantityInPackingUnitOrigin);
        }
    }

    private _getQuantityInPackingUnitRest(record: Partial<Stock>): number {
        const _quantityInPackingUnitOrigin = Number(this._getQuantityInPackingUnitOrigin(record));
        let _quantityInPackingUnitRest: number | undefined = undefined;
        if (record?.product?.product?.serialNumberManagementMode === 'globalReceivedIssued') {
            _quantityInPackingUnitRest = this._getStockChangeLines()
                .filter(_ => Number(_.stockId) === Number(record.stockId) && _.lineNumber === this._selectedLineIndex)
                .reduce<decimal>((_acc, _line) => {
                    return _acc - this._getStockDetailToMoveInPackingUnit(_line);
                }, _quantityInPackingUnitOrigin);
        }
        return _quantityInPackingUnitRest ?? _quantityInPackingUnitOrigin;
    }

    /**
     * Return cumulated stock quantities to move for current line
     * @param _currentStockChangeLine current stock change line
     * @returns cumulated quantities
     */
    private _getStockDetailToMoveInPackingUnit(_currentStockChangeLine: Partial<StockChangeLineInput>): number {
        return Number(
            _currentStockChangeLine.stockDetails?.reduce<decimal>((_acc, stockDetail) => {
                return _acc + Number(stockDetail.quantityInPackingUnit);
            }, 0),
        );
    }

    private _getStockChangeLine(record: Partial<Stock>): Partial<StockChangeLineInput> | undefined {
        return this._getStockChangeLines().find(
            line => Number(line.stockId) === Number(record.stockId) && line.lineNumber === this._selectedLineIndex,
        );
    }

    private _getQuantityToMove(record: Partial<Stock>): number {
        const _line = this._getStockChangeLine(record);
        const _quantityToMove = _line ? Number(_line.quantityInPackingUnit) : Number(record.quantityInPackingUnit);

        return Math.min(_quantityToMove, Number(this._getQuantityInPackingUnitRest(record)));
    }

    private _getLocationDestination(record: Partial<Stock>): string | undefined {
        const line = this._getStockChangeLine(record)?.locationDestination;
        return (line ?? String(record.licensePlateNumber?.code) !== '') ? String(record.location?.code) : '';
    }

    private _getIdentifier1Destination(record: Partial<Stock>): string | undefined {
        return this._getStockChangeLine(record)?.identifier1Destination ?? record.identifier1;
    }

    private _getIdentifier2Destination(record: Partial<Stock>): string | undefined {
        return this._getStockChangeLine(record)?.identifier2Destination ?? record.identifier2;
    }

    private _getPackingUnitDestination(record: Partial<Stock>): Partial<UnitOfMeasure> | undefined {
        const line = this._getStockChangeLine(record);
        return line ? { code: line.packingUnitDestination } : undefined;
    }

    private _getStatusDestination(record: Partial<Stock>): string | undefined {
        const _stockChangeLine = this._getStockChangeLine(record);
        return _stockChangeLine?.statusDestination ?? _stockChangeLine?.stockDetails?.[0]?.status;
    }

    private async _onSearch(filter: Filter<Stock>) {
        this.stock.value = [];
        this._stockQueryResult = [];
        const stockFilter = await onChangeFilterStock(this, filter);
        this.stock.value = await getStockResults(this, stockFilter);
        this._stockQueryResult = this.stock.value;
        if (this._stockQueryResult) {
            this._stockQueryResult.sort((currentLine, nextLine) => {
                const _currentLineCode = String(currentLine?.product?.product?.code);
                const _nextLineCode = String(nextLine?.product?.product?.code);
                return _currentLineCode > _nextLineCode ||
                    (_currentLineCode === _nextLineCode && String(currentLine?.stockId) > String(nextLine?.stockId))
                    ? 1
                    : -1;
            });
        }
    }

    private async _onSelectAllLines() {
        if (this.stock.value.length) {
            if (this.selectAllSwitch.value) {
                for (const row of this.stock.value) {
                    this._selectedLineId = row._id;
                    this._selectedLineIndex = this._getLineIndex(row._id);
                    await this._onSelect(row._id, this._selectedLineIndex, true);
                    this._saveDetail(row._id, this._selectedLineIndex);
                }
            }
        }
        this.nextButton.isDisabled = false;
    }

    private async _onDeselectAllLines() {
        if (this.stock.value.length) {
            if (!this.selectAllSwitch.value) {
                for (const row of this.stock.value) {
                    await this._onDeselect(row._id, this._getLineIndex(row._id));
                }
            }
        }
        this.nextButton.isDisabled = true;
    }

    private async _activeSwitchAndButtonSearch(active: boolean) {
        const arrayValues = getIdentifierValues(this, this._identifier);
        const fieldsCount = getIdentifierFieldsCount(this._identifier);
        const disabled = active || arrayValues?.length < fieldsCount;
        this.selectAllSwitch.isDisabled = disabled;
        this.searchButton.isDisabled = disabled;
        this.stock.value = [];
        this.stock.selectedRecords = [];
        this.selectAllSwitch.value = false;
        this.nextButton.isDisabled = true;
        await this.$.commitValueAndPropertyChanges();
    }

    /**
     * Return a index of record sorted stock table.
     * @param recordId Current record ID
     * @returns index in sorted array
     */
    private _getLineIndex(recordId: string): number {
        const stockRecord = this.stock.getRecordValue(recordId);
        let _index = -1;
        if (stockRecord) {
            _index = this._stockQueryResult.findIndex(_ => Number(_.stockId) === Number(stockRecord.stockId));
        }
        return _index < 0 ? -1 : _index + 1;
    }
}
