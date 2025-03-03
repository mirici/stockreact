import { Product, ProductSite, UnitOfMeasure } from '@sage/x3-master-data-api';
import { dialogMessage } from '@sage/x3-master-data/lib/client-functions/dialogs';
import { onGoto } from '@sage/x3-master-data/lib/client-functions/on-goto';
import { GraphApi, MiscellaneousIssueLineInput } from '@sage/x3-stock-api';
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
import { Dict, ExtractEdges, Filter, decimal, extractEdges } from '@sage/xtrem-client';
import * as ui from '@sage/xtrem-ui';
import { NotifyAndWait } from '../client-functions/display';
import { generateStockTableFilter } from '../client-functions/manage-pages';
import { isSerialNumberAllocated } from '../client-functions/read-serial-number-from-stock-id';
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
    originalStockLine,
    packingUnit,
    isStockJournalInRecord,
} from '../client-functions/stock-change-by-identifier-details-control';
import { inputsMiscIssue } from './mobile-miscellaneous-issue-by-identifier';
import { getProductSite } from '../client-functions/get-product-site';
import { GetNumberOfDecimals } from '../client-functions/get-unit-number-decimals';

const hideWhenEmptyValue = (value: any, _rowValue?: Dict<Stock>) => {
    return typeof value !== 'number' && !value;
};

@ui.decorators.page<MobileMiscellaneousIssueByIdentifierDetails>({
    title: 'Miscellaneous issue',
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
export class MobileMiscellaneousIssueByIdentifierDetails extends ui.Page<GraphApi> {
    /*
     *  Technical properties
     */

    private _packingUnits: packingUnit[];
    private _productSite: ProductSite;
    private _miscellaneousIssueLines: Partial<MiscellaneousIssueLineInput>[];
    private _stockSite: Site;
    private _identifier: string;
    private _selectedLineIndex = -1;
    private _selectedLineId = '-1';
    private _stockQueryResult: ui.PartialNodeWithId<Stock>[];
    private _notifier = new NotifyAndWait(this);
    private _selectedIdentifierValues: string | undefined;
    private _originalStockLines: originalStockLine[];

    /*
     *  Technical fields
     */

    @ui.decorators.textField<MobileMiscellaneousIssueByIdentifierDetails>({
        isDisabled: true,
        isTransient: true,
    })
    site: ui.fields.Text;

    /*
     *  Page Actions
     */

    @ui.decorators.pageAction<MobileMiscellaneousIssueByIdentifierDetails>({
        title: 'Next',
        shortcut: ['f2'],
        buttonType: 'secondary',
        isDisabled: true,
        async onClick() {
            if (!this.stock.selectedRecords.length) {
                this.$.loader.isHidden = false;
                await this._onSearch(generateStockTableFilter(this));
                if (this.stock.value.length) {
                    if (!isProductGlobalReceivedIssuedInStock(this)) {
                        this._onSelectAllLines();
                        this.stock.isHidden = true;
                        await this.$.commitValueAndPropertyChanges();
                        const savedInputs = this._getSavedInputs();
                        this.$.storage.set('mobile-MiscellaneousIssueByIdentifier', JSON.stringify(savedInputs));
                        onGoto(this, '@sage/x3-stock/MobileMiscellaneousIssueByIdentifier', {
                            ReturnFromDetail: 'yes',
                        });
                    } else {
                        this.$.loader.isHidden = true;
                        this._notifier.show(
                            ui.localize(
                                '@sage/x3-stock/pages__mobile_miscellaneous-issue-by-identifier_lines__notification__product_is_global_serial_number_managed',
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
                            '@sage/x3-stock/pages__mobile_miscellaneous-issue-by-identifier_lines__notification__stock_is_empty',
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
                this.$.storage.set('mobile-MiscellaneousIssueByIdentifier', JSON.stringify(savedInputs));
                onGoto(this, '@sage/x3-stock/MobileMiscellaneousIssueByIdentifier', {
                    ReturnFromDetail: 'yes',
                });
            } else {
                await dialogMessage(
                    this,
                    'error',
                    ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                    ui.localize(
                        '@sage/x3-stock/pages__mobile_miscellaneous-issue-by-identifier_lines__notification__no_stock_error',
                        `Select at least one stock line.`,
                    ),
                );
            }
        },
    })
    nextButton: ui.PageAction;

    @ui.decorators.pageAction<MobileMiscellaneousIssueByIdentifierDetails>({
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

    @ui.decorators.pageAction<MobileMiscellaneousIssueByIdentifierDetails>({
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

    @ui.decorators.pageAction<MobileMiscellaneousIssueByIdentifierDetails>({
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
                            '@sage/x3-stock/pages__mobile_miscellaneous-issue-by-identifier_lines__notification__error_startingSerialNumberMandatory',
                        );
                    }
                } else if (Number(this.quantityToMove.value) <= 0) {
                    await dialogMessage(
                        this,
                        'error',
                        ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                        ui.localize(
                            '@sage/x3-stock/pages__mobile_miscellaneous-issue-by-identifier_lines__quantityInPackingUnitDestination_must_be_greater_than_0',
                            'The quantity to issue must be greater than 0',
                        ),
                    );
                    return;
                }
                if (
                    (this.quantityToMove.value ? Number(this.quantityToMove.value) : 0) *
                        (this.packingUnitToStockUnitConversionFactorToIssue.value
                            ? Number(this.packingUnitToStockUnitConversionFactorToIssue.value)
                            : 1) >
                    Number(Number(currentRecord?.quantityInStockUnit) - Number(currentRecord?.allocatedQuantity))
                ) {
                    await dialogMessage(
                        this,
                        'error',
                        ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                        `${ui.localize(
                            '@sage/x3-stock/pages__mobile_miscellaneous-issue-by-identifier_lines__enter_a_quantity_less_than_or_equal_to_the_stock_quantity_minus_allocated_quantity',
                            'Enter a quantity less than or equal to the stock quantity minus the allocated quantity.',
                        )}`,

                    );
                    this.quantityToMove.value = null;
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

    @ui.decorators.pageAction<MobileMiscellaneousIssueByIdentifierDetails>({
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
                case '@sage/x3-stock/pages__mobile_miscellaneous-issue-by-identifier_lines__notification__error_startingSerialNumber': {
                    return ui.localize(
                        '@sage/x3-stock/pages__mobile_miscellaneous-issue-by-identifier_lines__notification__error_startingSerialNumber',
                        'The serial number is mandatory',
                    );
                }
                case '@sage/x3-stock/serial-number-range-overlap': {
                    return ui.localize(
                        '@sage/x3-stock/serial-number-range-overlap',
                        'The serial numbers are overlapping. Enter another starting or ending serial number.',
                    );
                }
                case '@sage/x3-stock/pages__mobile_miscellaneous-issue-by-identifier__same-amount-serial-numbers-in-the-range-to-match-quantity-to-move': {
                    return ui.localize(
                        '@sage/x3-stock/pages__mobile_miscellaneous-issue-by-identifier__same-amount-serial-numbers-in-the-range-to-match-quantity-to-move',
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
            if (!this.startingSerialNumber.value?.code) {
                throw new Error(
                    '@sage/x3-stock/pages__mobile_miscellaneous-issue-by-identifier_lines__notification__error_startingSerialNumber',
                );
            }

            const _currentRecord = this.stock.getRecordValue(this._selectedLineId);
            if (_currentRecord) {
                const _productCode = String(_currentRecord.product?.product?.code);
                const _miscIssueLines = this._miscellaneousIssueLines;
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

                if (!serialNumberAlreadyUsed && _miscIssueLines.length ) {
                    serialNumberAlreadyUsed = _miscIssueLines
                        .filter(_ => !!_.stockDetails?.length && _.stockDetails[0].serialNumber && _.product === _productCode)
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
                        (Number(this.quantityToMove.value) * Number(this.packingUnitToStockUnitConversionFactorToIssue.value)),
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
                    )) !== (Number(this.quantityToMove.value) * Number(this.packingUnitToStockUnitConversionFactorToIssue.value))
                ) {
                    throw new Error('@sage/x3-stock/serial-number-not-sequential');
                }

                this.serialNumberLines.addRecord({
                    quantity: Number(this.quantityToMove.value)  * Number(this.packingUnitToStockUnitConversionFactorToIssue.value),
                    startingSerialNumber: this.startingSerialNumber.value.code,
                    endingSerialNumber: this.endingSerialNumber.value,
                });

                let _miscIssueLine = _miscIssueLines.find(
                    _ => Number(_.id) === Number(_currentRecord?.stockId) && _.lineNumber === this._selectedLineIndex,
                );

                if (!_miscIssueLine) {
                    _miscIssueLine = <Partial<MiscellaneousIssueLineInput>>{
                        product: String(_currentRecord?.product?.product?.code),
                        id: String(_currentRecord?.stockId),
                        quantityInPackingUnit: _quantityInPackingUnit,
                        packingUnit: this.packingUnitToIssue.value
                            ? this.packingUnitToIssue.value : _currentRecord?.packingUnit?.code,
                        packingUnitToStockUnitConversionFactor: Number(
                            this.packingUnitToStockUnitConversionFactorToIssue.value,
                        ),
                        lineNumber: this._selectedLineIndex,
                        stockDetails: [],
                    };
                    _miscIssueLines.push(_miscIssueLine);
                }

                // Store information
                _miscIssueLine.stockDetails ??= [];

                // Total quantity to come
                // const _totalQuantityInPackingUnit =
                //     Number(this.quantityToMove.value) + this._getStockDetailToMoveInPackingUnit(_miscIssueLine);
                _miscIssueLine.packingUnit = this.packingUnitToIssue.value
                    ? this.packingUnitToIssue.value
                    : _currentRecord?.packingUnit?.code;
                _miscIssueLine.packingUnitToStockUnitConversionFactor = Number(
                    this.packingUnitToStockUnitConversionFactorToIssue.value,
                );
                // _miscIssueLine.quantityInPackingUnit = _totalQuantityInPackingUnit;

                _miscIssueLine.stockDetails.push(<Partial<StockJournalInput>>{
                    packingUnit: _currentRecord?.packingUnit?.code,
                    packingUnitToStockUnitConversionFactor: Number(
                        _currentRecord?.packingUnitToStockUnitConversionFactor,
                    ),
                    quantityInPackingUnit:
                        (Number(this.quantityToMove.value) * (this.packingUnitToStockUnitConversionFactorToIssue.value
                                ? this.packingUnitToStockUnitConversionFactorToIssue.value
                                : 0)) /
                        (Number(_currentRecord.packingUnitToStockUnitConversionFactor) ? Number(_currentRecord.packingUnitToStockUnitConversionFactor) : 1),
                    quantityInStockUnit:
                        Number(this.quantityToMove.value) *
                        Number(this.packingUnitToStockUnitConversionFactorToIssue.value),
                    location: _currentRecord?.location?.code,
                    status: _currentRecord?.status?.code,
                    lot: _currentRecord?.lot,
                    sublot: _currentRecord?.sublot,
                    licensePlateNumber: _currentRecord?.licensePlateNumber?.code,
                    serialNumber: this.startingSerialNumber.value?.code ?? undefined,
                    identifier1: _currentRecord?.identifier1,
                    identifier2: _currentRecord?.identifier2,
                    stockCustomField1: _currentRecord?.stockCustomField1,
                    stockCustomField2: _currentRecord?.stockCustomField2,
                    stockUnit: this._productSite.product?.stockUnit?.code,
                });

                this._calculateMiscLineQuantity(_miscIssueLine);
                this._saveDetail(this._selectedLineId, this._selectedLineIndex);

                this.stock.setRecordValue(_currentRecord as any);
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

    @ui.decorators.section<MobileMiscellaneousIssueByIdentifierDetails>({
        isTitleHidden: true,
    })
    mainSection: ui.containers.Section;

    @ui.decorators.section<MobileMiscellaneousIssueByIdentifierDetails>({
        title: 'Stock change',
        isTitleHidden: true,
    })
    detailPanelSection: ui.containers.Section;

    /*
     *  Blocks
     */

    @ui.decorators.block<MobileMiscellaneousIssueByIdentifierDetails>({
        isTitleHidden: true,
        width: 'extra-large',
        parent() {
            return this.mainSection;
        },
    })
    bodyBlock: ui.containers.Block;

    @ui.decorators.block<MobileMiscellaneousIssueByIdentifierDetails>({
        isTitleHidden: true,
        parent() {
            return this.detailPanelSection;
        },
    })
    detailsBlock: ui.containers.Block;

    @ui.decorators.gridRowBlock<MobileMiscellaneousIssueByIdentifierDetails>({
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

    @ui.decorators.block<MobileMiscellaneousIssueByIdentifierDetails>({
        isTitleHidden: true,
        parent() {
            return this.detailPanelSection;
        },
    })
    quantityBlock: ui.containers.Block;

    @ui.decorators.block<MobileMiscellaneousIssueByIdentifierDetails>({
        isTitleHidden: true,
        parent() {
            return this.detailPanelSection;
        },
    })
    numberSerialBlock: ui.containers.Block;

    @ui.decorators.block<MobileMiscellaneousIssueByIdentifierDetails>({
        isTitleHidden: true,
        parent() {
            return this.detailPanelSection;
        },
    })
    listSerialNumberBlock: ui.containers.Block;

    /*
     *  Fields
     */

    @ui.decorators.referenceField<MobileMiscellaneousIssueByIdentifierDetails, Product>({
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
            this.product?.getNextField(true)?.focus();
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
            ui.nestedFields.reference<MobileMiscellaneousIssueByIdentifierDetails, Product, UnitOfMeasure>({
                node: '@sage/x3-master-data/UnitOfMeasure',
                bind: 'stockUnit',
                valueField: 'code',
                isHidden: true,
            }),
            ui.nestedFields.reference<MobileMiscellaneousIssueByIdentifierDetails, Product, UnitOfMeasure>({
                node: '@sage/x3-master-data/UnitOfMeasure',
                bind: 'stockUnit',
                valueField: 'numberOfDecimals',
                isHidden: true,
            }),
        ],
    })
    product: ui.fields.Reference;

    @ui.decorators.referenceField<MobileMiscellaneousIssueByIdentifierDetails, LotsSites>({
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
        helperTextField: 'sublot',
        isHelperTextHidden: true,
        filter() {
            const lotFilter: any = {
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

    @ui.decorators.textField<MobileMiscellaneousIssueByIdentifierDetails>({
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

    @ui.decorators.referenceField<MobileMiscellaneousIssueByIdentifierDetails, SerialNumber>({
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

    @ui.decorators.referenceField<MobileMiscellaneousIssueByIdentifierDetails, Location>({
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

    @ui.decorators.textField<MobileMiscellaneousIssueByIdentifierDetails>({
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

    @ui.decorators.textField<MobileMiscellaneousIssueByIdentifierDetails>({
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

    @ui.decorators.referenceField<MobileMiscellaneousIssueByIdentifierDetails, LicensePlateNumber>({
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

    @ui.decorators.selectField<MobileMiscellaneousIssueByIdentifierDetails>({
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

    @ui.decorators.selectField<MobileMiscellaneousIssueByIdentifierDetails>({
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

    @ui.decorators.numericField<MobileMiscellaneousIssueByIdentifierDetails>({
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

    @ui.decorators.textField<MobileMiscellaneousIssueByIdentifierDetails>({
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

    @ui.decorators.textField<MobileMiscellaneousIssueByIdentifierDetails>({
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

    @ui.decorators.switchField<MobileMiscellaneousIssueByIdentifierDetails>({
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
                    if (!isProductGlobalReceivedIssuedInStock(this)) {
                        this._onSelectAllLines();
                        this.nextButton.isDisabled = false;
                    } else {
                        this._notifier.show(
                            ui.localize(
                                '@sage/x3-stock/pages__mobile_miscellaneous-issue-by-identifier_lines__notification__product_is_global_serial_number_managed',
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

    @ui.decorators.separatorField<MobileMiscellaneousIssueByIdentifierDetails>({
        parent() {
            return this.bodyBlock;
        },
        isFullWidth: true,
        isInvisible: true,
    })
    lineSeparator: ui.fields.Separator;

    @ui.decorators.tableField<MobileMiscellaneousIssueByIdentifierDetails, Stock>({
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
                title: 'Quantity to issue',
                isTitleHidden: false,
                isMandatory: false,
                isFullWidth: true,
                max(rowValue?: Dict<any>) {
                    return (rowValue as any).quantityInPackingUnitOrigin;
                },
                scale(_value, rowValue?: Dict<any>) {
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
            ui.nestedFields.reference<MobileMiscellaneousIssueByIdentifierDetails, Stock, ProductSite>({
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
            ui.nestedFields.reference<MobileMiscellaneousIssueByIdentifierDetails, Stock, LicensePlateNumber>({
                bind: 'licensePlateNumber',
                valueField: 'code',
                node: '@sage/x3-stock-data/LicensePlateNumber',
                isReadOnly: true,
                isHidden: true,
            }),
            ui.nestedFields.reference<MobileMiscellaneousIssueByIdentifierDetails, Stock, Location>({
                bind: 'location',
                valueField: 'code',
                node: '@sage/x3-stock-data/Location',
                isReadOnly: true,
                isHidden: false,
            }),
            ui.nestedFields.reference<MobileMiscellaneousIssueByIdentifierDetails, Stock, Location>({
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
            ui.nestedFields.reference<MobileMiscellaneousIssueByIdentifierDetails, Stock, StockStatus>({
                bind: 'status',
                valueField: 'code',
                node: '@sage/x3-stock-data/StockStatus',
                isReadOnly: true,
                isHidden: true,
            }),
            ui.nestedFields.technical<MobileMiscellaneousIssueByIdentifierDetails, Stock, UnitOfMeasure>({
                bind: 'packingUnit',
                node: '@sage/x3-master-data/UnitOfMeasure',
                nestedFields: [
                    ui.nestedFields.text({
                        bind: 'code',
                    }),
                ],
            }),
            ui.nestedFields.reference<MobileMiscellaneousIssueByIdentifierDetails, Stock, UnitOfMeasure>({
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
                bind: 'identifier2',
                isReadOnly: true,
                isHidden() {
                    return this.identifier2.isHidden ?? true;
                },
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
            ui.nestedFields.technical<MobileMiscellaneousIssueByIdentifierDetails, Stock, Lot>({
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
            this._productSite = await getProductSite(this, rowItem.product?.product?.code, this.site.value ?? '', '');
            this._initPackingUnitFields();
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
                lotReferenceExpirationDate: record.lotReference?.expirationDate,
                lotReferenceMajorVersion: record.lotReference?.majorVersion?.code,
                lotReferenceUseByDate: record.lotReference?.useByDate,
                globalSerialNumber: ui.localize('@sage/x3-stock/label-view-all', 'View list'),
            };
        },
        async onRowClick(recordId: string, rowItem: Stock) {
            this._selectedLineId = recordId;
            this._selectedLineIndex = this._getLineIndex(recordId);
            this._productSite = await getProductSite(this, rowItem.product?.product?.code, this.site.value ?? '', '');
            this._initPackingUnitFields();
            await this._onRowClick(recordId, this._selectedLineIndex, rowItem);
        },
    })
    stock: ui.fields.Table<Stock>;

    @ui.decorators.detailListField<MobileMiscellaneousIssueByIdentifierDetails, Stock>({
        parent() {
            return this.detailsBlock;
        },
        node: '@sage/x3-stock-data/Stock',
        isTransient: true,
        isFullWidth: true,
        isTitleHidden: true,
        fields: [
            ui.nestedFields.reference<MobileMiscellaneousIssueByIdentifierDetails, Stock, ProductSite>({
                bind: 'product',
                valueField: { product: { code: true } },
                node: '@sage/x3-master-data/ProductSite',
                title: 'Product',
                isReadOnly: true,
                isHidden: false,
            }),
            ui.nestedFields.reference<MobileMiscellaneousIssueByIdentifierDetails, Stock, LicensePlateNumber>({
                bind: 'licensePlateNumber',
                title: 'License plate number',
                valueField: 'code',
                node: '@sage/x3-stock-data/LicensePlateNumber',
                isReadOnly: true,
                isHidden: hideWhenEmptyValue,
            }),
            ui.nestedFields.reference<MobileMiscellaneousIssueByIdentifierDetails, Stock, Location>({
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
            ui.nestedFields.reference<MobileMiscellaneousIssueByIdentifierDetails, Stock, Lot>({
                node: '@sage/x3-stock-data/Lot',
                bind: 'lotReference',
                valueField: 'lotCustomField1',
                title: 'Lot custom field 1',
                isReadOnly: true,
                isHidden(value: Lot) {
                    return !value?.lotCustomField1;
                },
            }),
            ui.nestedFields.reference<MobileMiscellaneousIssueByIdentifierDetails, Stock, Lot>({
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
                title: 'Quantity to issue',
                isReadOnly: true,
                isTransient: true,
                isHidden: true,
                postfix(rowValue?: Dict<any>) {
                    return rowValue?.packingUnit?.code ?? '';
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
            ui.nestedFields.reference<MobileMiscellaneousIssueByIdentifierDetails, Stock, UnitOfMeasure>({
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
            ui.nestedFields.reference<MobileMiscellaneousIssueByIdentifierDetails, Stock, StockStatus>({
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

    @ui.decorators.dropdownListField<MobileMiscellaneousIssueByIdentifierDetails>({
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

    @ui.decorators.numericField<MobileMiscellaneousIssueByIdentifierDetails>({
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

    @ui.decorators.numericField<MobileMiscellaneousIssueByIdentifierDetails>({
        parent() {
            return this.quantityBlock;
        },
        postfix() {
            return ` ${this.packingUnitToIssue.value}`;
        },
        title: 'Quantity to issue', // this is important to display a title in the grid row block
        isMandatory: false,
        isFullWidth: true,
        isTransient: true,
        scale() {
            return (
                (<any>(<unknown>this.stock.getRecordValue(this.gridBlock?.selectedRecordId ?? '')))?.packingUnit
                    ?.numberOfDecimals ?? 0
            );
        },
        async onChange() {
            const _currentRecord: any = this.stock.getRecordValue(this.gridBlock.selectedRecordId);
            _currentRecord.quantityToMove = String(this.quantityToMove.value);
            this.stock.setRecordValue(_currentRecord);
            await this.$.commitValueAndPropertyChanges();
            await this._onChangeBody();
            this.helperSelectButton.isDisabled = !this.quantityToMove.value;
        },
    })
    quantityToMove: ui.fields.Numeric;

    @ui.decorators.referenceField<MobileMiscellaneousIssueByIdentifierDetails, SerialNumber>({
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

    @ui.decorators.textField<MobileMiscellaneousIssueByIdentifierDetails>({
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

    @ui.decorators.tableField<MobileMiscellaneousIssueByIdentifierDetails>({
        parent() {
            return this.listSerialNumberBlock;
        },
        title: 'Serial number(s) to issue ',
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
                        const _currentMiscIssueLine = this._miscellaneousIssueLines.find(_ =>
                            _.stockDetails?.some(_ => _.serialNumber === _startingSerialNumber),
                        );
                        if (_currentMiscIssueLine) {
                            const _stockDetails = _currentMiscIssueLine.stockDetails;
                            const _removedIndexSerialNumber = _stockDetails?.findIndex(
                                _ => _.serialNumber === _startingSerialNumber,
                            );
                            if (_removedIndexSerialNumber !== undefined) {
                                _stockDetails?.splice(_removedIndexSerialNumber, 1);
                                _quantityInPackingUnit = this._getStockDetailToMoveInPackingUnit(_currentMiscIssueLine);
                                this._saveMiscIssue();
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
        if (Number(_savedInputs?.miscellaneousIssue?.miscellaneousIssueLines?.length) > 0) {
            this._miscellaneousIssueLines = [];
            this.$.loader.isHidden = false;
            await this._onSearch(generateStockTableFilter(this));
            this.$.setPageClean();
            this.$.loader.isHidden = true;
            this.searchButton.isDisabled = false;
        } else {
            disableButton(this);
        }
    }

    private _getSavedInputs(): inputsMiscIssue {
        return JSON.parse(this.$.storage.get('mobile-MiscellaneousIssueByIdentifier') as string) as inputsMiscIssue;
    }

    private _initSiteCodeField() {
        const siteCode = this.$.storage.get('mobile-selected-stock-site') as string;
        if (siteCode) {
            this.site.value = siteCode;
        }
    }

    private async _onChangeBody() {
        const _currentRecord = this.stock.getRecordValue(this._selectedLineId);
        const _currentQty = Number(this.quantityToMove.value) *  Number(this.packingUnitToStockUnitConversionFactorToIssue.value);
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

        if (
            await isSerialNumberAllocated(
                this,
                this._stockSite.code,
                this.product?.value?.code ?? this._productSite.product.code,
                this.startingSerialNumber.value.code,
                this.endingSerialNumber.value,
            )
        ) {
            await dialogMessage(
                this,
                'error',
                ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                ui.localize(
                    '@sage/x3-stock/pages__mobile_miscellaneous-issue-by-identifier_lines__the_serial_number_already_allocated',
                    'Serial number already allocated.',
                ),
            );
            this.startingSerialNumber.value = null;
            this.endingSerialNumber.value = null;
            this.startingSerialNumber.focus();
            return;
        }

        this.addSerialRange.isHidden = _currentQty > Number((_currentRecord as any).quantityInPackingUnitOrigin);

        await this.$.commitValueAndPropertyChanges();
    }

    /**
     * Select or create miscIssueLine from current card item with(out) global serialization
     * before to allow edit in detail grid :
     * - initialize quantity to issue, stockDetails with row...
     * - Search existing line(s) in miscellaneousIssueLines array
     * - for product with global serial : retrieve all existing serials numbers.
     * - for other product, create line when missing.
     * @param recordId Current record ID
     * @param recordIndex Current record index
     * @param rowItem Current stock record
     */
    private async _onRowClick(recordId: string, recordIndex: number, rowItem: Stock) {
        const _currentRecord = this.stock.getRecordValue(recordId);
        const originalStockLine = this._originalStockLines?.find(line => recordId === line.id);
        if (_currentRecord) {
            this.quantityToMove.value = Number((_currentRecord as any)?.quantityToMove);
            rowItem.quantityInPackingUnit = String(originalStockLine?.quantityInPackingUnit);
            rowItem.quantityInStockUnit = String(originalStockLine?.quantityInStockUnit);
            this.stockDetails.value = [rowItem];
            this.serialNumberLines.value = [];
            this.serialNumberLines.isHidden = true;

            const selectedValue = originalStockLine?.packingUnit.code;
            const packingUnitIndex = this._packingUnits
                .map(packingUnit => packingUnit.node.packingUnit.code)
                .indexOf(selectedValue);
            if (packingUnitIndex !== -1) {
                const selectedUnit = this._packingUnits[packingUnitIndex].node;
                this.packingUnitToStockUnitConversionFactorToIssue.isDisabled =
                    !selectedUnit.isPackingFactorEntryAllowed;
                    this.quantityToMove.scale = selectedUnit.packingUnit.numberOfDecimals;
            } else {
                this.packingUnitToStockUnitConversionFactorToIssue.isDisabled = true;
                this.quantityToMove.scale = 0;
            }

            this.quantityToMove.value = null;
            this.packingUnitToStockUnitConversionFactorToIssue.value = originalStockLine?.packingUnitToStockUnitConversionFactor ?? 1;
            this.packingUnitToIssue.value = originalStockLine?.packingUnit.code;

            const conversionFactor = this.packingUnitToStockUnitConversionFactorToIssue.value.toString();
            const  numberOfDec = (conversionFactor.includes('.')) ? conversionFactor.split('.')[1].length : 0;
            this.packingUnitToStockUnitConversionFactorToIssue.scale = numberOfDec;

            if (this._packingUnits.length) {
                this.packingUnitToIssue.isDisabled = false;
            }

            _currentRecord.quantityInStockUnit = String(originalStockLine?.quantityInStockUnit);
            _currentRecord.packingUnit.code =  originalStockLine?.packingUnit?.code;
            _currentRecord.quantityInPackingUnit =  String(originalStockLine?.quantityInPackingUnit);





            const _miscIssueLines = this._miscellaneousIssueLines?.filter(
                _ => Number(_.id) === Number(rowItem.stockId) && _.lineNumber === recordIndex,
            );

            const _miscIssueLine = _miscIssueLines.length ? _miscIssueLines[0] : undefined;

            if (_currentRecord.product?.product?.serialNumberManagementMode === 'globalReceivedIssued') {
                this.serialNumberLines.isHidden = false;
                this.serialNumberLines.value = [];
            } else if (!_miscIssueLine) {
                this._miscellaneousIssueLines.push({
                    product: String(_currentRecord?.product?.product?.code),
                    id: String(rowItem?.stockId),
                    packingUnit: _currentRecord?.packingUnit?.code,
                    quantityInPackingUnit: Number(rowItem?.quantityInPackingUnit),
                    packingUnitToStockUnitConversionFactor: rowItem.packingUnitToStockUnitConversionFactor,
                    lineNumber: recordIndex,
                    stockDetails: [
                        {
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
                            lot: _currentRecord?.lot,
                            sublot: _currentRecord?.sublot,
                            licensePlateNumber: _currentRecord?.licensePlateNumber?.code,
                            serialNumber: _currentRecord?.serialNumber,
                            identifier1: rowItem?.identifier1,
                            identifier2: rowItem?.identifier2,
                            stockCustomField1: _currentRecord?.stockCustomField1,
                            stockCustomField2: _currentRecord?.stockCustomField2,
                            stockUnit: this.product.value?.stockUnit?.code,
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
            this.stock.setRecordValue(_currentRecord);
            this._saveDetail(recordId, this._selectedLineIndex)
        }
    }

    /**
     * Select or create miscIssueLine from current card item without global serialization
     * - Select current record with optional autoSelect
     * - update or create line for card without global serialization (unique stock detail)
     * - update record information
     * @param recordId Current record ID
     * @param recordIndex Current record index
     * @param autoSelect  True for init quantity to issue from record
     */
    private async _onSelect(recordId: string, recordIndex: number, autoSelect = false) {
        const _currentRecord: any = this.stock.getRecordValue(recordId);

        if (_currentRecord) {
            const _miscIssueLines = this._miscellaneousIssueLines;
            const _quantityInPackingUnitOrigin = (<any>_currentRecord)?.quantityInPackingUnitOrigin;

            this.stock.selectRecord(recordId);
            if (autoSelect) {
                this.quantityToMove.value = Number((_currentRecord as any)?.quantityToMove);
            }

            if (_currentRecord?.product?.product?.serialNumberManagementMode !== 'globalReceivedIssued') {
                let lineIndex = this._miscellaneousIssueLines.findIndex(
                    line => Number(line?.id) === Number(_currentRecord.stockId) && line.lineNumber === recordIndex,
                );
                if (lineIndex === -1) {
                    lineIndex =
                        this._miscellaneousIssueLines.push({
                            product: String(_currentRecord?.product?.product?.code),
                            id: String(_currentRecord?.stockId),
                            packingUnit: this.packingUnitToIssue.value
                            ? this.packingUnitToIssue.value
                            : _currentRecord?.packingUnit?.code,
                            quantityInPackingUnit: Number(this.quantityToMove.value),
                            packingUnitToStockUnitConversionFactor: Number(
                                this.packingUnitToStockUnitConversionFactorToIssue.value,
                            ),
                            lineNumber: recordIndex,
                            stockDetails: [],
                        }) - 1;
                } else {
                    this._miscellaneousIssueLines[lineIndex].packingUnit = this.packingUnitToIssue.value
                        ? this.packingUnitToIssue.value
                        : _currentRecord.packingUnit.code;
                    this._miscellaneousIssueLines[lineIndex].packingUnitToStockUnitConversionFactor = Number(
                        this.packingUnitToStockUnitConversionFactorToIssue.value,
                    );
                    this._miscellaneousIssueLines[lineIndex].quantityInPackingUnit = Number(
                        this.quantityToMove.value,
                    );
                }
                const detailIndex = this._miscellaneousIssueLines[lineIndex]?.stockDetails?.findIndex(detail =>
                    isStockJournalInRecord(_currentRecord, detail),
                );

                if (detailIndex > -1) {
                    this._miscellaneousIssueLines[lineIndex].stockDetails[detailIndex].quantityInPackingUnit =
                    (Number(this.quantityToMove.value) *
                        (this.packingUnitToStockUnitConversionFactorToIssue.value
                            ? this.packingUnitToStockUnitConversionFactorToIssue.value
                            : 0)) /
                        (_currentRecord.packingUnitToStockUnitConversionFactor
                            ? _currentRecord.packingUnitToStockUnitConversionFactor
                            : 1),
                        (this._miscellaneousIssueLines[lineIndex].stockDetails[detailIndex].quantityInStockUnit =
                            Number(this.quantityToMove.value) *
                            Number(this.packingUnitToStockUnitConversionFactorToIssue.value));
                } else {
                    this._miscellaneousIssueLines[lineIndex].stockDetails?.push({
                        packingUnit: _currentRecord.packingUnit?.code,
                        packingUnitToStockUnitConversionFactor:
                        _currentRecord.packingUnitToStockUnitConversionFactor,
                        quantityInPackingUnit:
                            Number(this.quantityToMove.value),
                        quantityInStockUnit:
                            Number(this.quantityToMove.value) *
                            Number(this.packingUnitToStockUnitConversionFactorToIssue.value),
                        location: _currentRecord.location?.code,
                        licensePlateNumber: _currentRecord.licensePlateNumber?.code ?? undefined,
                        lot: _currentRecord.lot ?? undefined,
                        status: _currentRecord.status?.code ?? undefined,
                        sublot: _currentRecord.sublot ?? undefined,
                        serialNumber: _currentRecord.serialNumber ?? undefined,
                        identifier1: _currentRecord.identifier1 ?? undefined,
                        identifier2: _currentRecord.identifier2 ?? undefined,
                        stockCustomField1: _currentRecord.stockCustomField1 ?? undefined,
                        stockCustomField2: _currentRecord.stockCustomField2 ?? undefined,
                        stockUnit: this.product.value?.stockUnit?.code,
                    });
                }
            }

            let qtyTotalInPackingUnit = 0;
            let qtyTotalInStockUnit = 0;
            this._miscellaneousIssueLines.forEach(line => {
                if (
                    Number(line.id) === Number(_currentRecord.stockId) &&
                    line.lineNumber === recordIndex
                ) {
                    line.stockDetails?.forEach(stockLine => {
                        qtyTotalInStockUnit = qtyTotalInStockUnit + Number(stockLine.quantityInStockUnit);
                        qtyTotalInPackingUnit =
                        qtyTotalInPackingUnit +
                            (Number(Number(stockLine.quantityInPackingUnit)) *
                                Number(stockLine.packingUnitToStockUnitConversionFactor)) /
                                Number(line.packingUnitToStockUnitConversionFactor);
                    });
                    line.quantityInPackingUnit = qtyTotalInPackingUnit;
                }
            });

            this._saveDetail(recordId, this._selectedLineIndex)

            const originalStockLine = this._originalStockLines?.find(line => recordId === line.id);
            (_currentRecord as any).quantityToMove = qtyTotalInPackingUnit;
            (_currentRecord as any).quantityInPackingUnit = originalStockLine?.quantityInPackingUnit;

            (_currentRecord as any).quantityInStockUnit = qtyTotalInStockUnit;
            const packingUnitIndex = this._packingUnits
                .map(packingUnit => packingUnit.node.packingUnit.code)
                .indexOf(this.packingUnitToIssue.value ?? '');
            if (packingUnitIndex !== -1) {
                const selectedUnit = this._packingUnits[packingUnitIndex].node;
                (_currentRecord as any).packingUnit = selectedUnit.packingUnit;
                (_currentRecord as any).quantityToMove = Number(qtyTotalInStockUnit / Number(selectedUnit.packingUnitToStockUnitConversionFactor));
            } else {
                (_currentRecord as any).packingUnit.code = this.packingUnitToIssue.value;
            }

            this.stock.setRecordValue(_currentRecord);
            this.packingUnitToIssue.value = null;
        }
    }

    /**
     * Calculated total quantity remaining for given record
     * @param _currentRecord Calculate remaining quantity to issue for current stock record
     * @param _miscIssueLines Stock change lines to reevaluate
     * @returns quantity remaining
     */
    private _calcQuantityRemaining(
        _currentRecord: any,
        _miscIssueLines: Partial<MiscellaneousIssueLineInput>[],
    ): number {
        if (_currentRecord && _miscIssueLines) {
            const _quantityInPackingUnitOrigin = Number(_currentRecord?.quantityInPackingUnit);
            const _lineNumber = this._selectedLineIndex;
            const _stockId = Number(_currentRecord.stockId);
            return _miscIssueLines
                .filter(_ => Number(_.id) === _stockId && _.lineNumber === _lineNumber)
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
        this.serialNumberLines.value = [];
        if (stockRecord && this._miscellaneousIssueLines?.length) {
            const lineIndex = this._miscellaneousIssueLines.findIndex(
                line => Number(line?.id) === Number(stockRecord.stockId) && line.lineNumber === recordIndex,
            );
            this._miscellaneousIssueLines.splice(lineIndex, 1);
            this._saveMiscIssue();

            const originalStockLine = this._originalStockLines.find(line => stockRecord?._id === line.id);
            (stockRecord as any).quantityToMove = originalStockLine?.quantityInPackingUnit;
            (stockRecord as any).packingUnit = originalStockLine?.packingUnit;
            (stockRecord as any).stockRecord = originalStockLine?.quantityInStockUnit;
            this.packingUnitToIssue.value = null;
            this.stock.setRecordValue(stockRecord);
        }
        this.nextButton.isDisabled = !this.stock.selectedRecords.length;
    }

    private _saveDetail(recordId: string, recordIndex: number) {
        const _currentRecord = this.stock.getRecordValue(recordId);
        if (this._miscellaneousIssueLines) {
            const _lineIndex =
                this._miscellaneousIssueLines?.findIndex(
                    _ => Number(_.id) === Number(_currentRecord?.stockId) && _.lineNumber === recordIndex,
                ) ?? -1;

            if (_lineIndex > -1) {
                const _currentMiscIssueLines = this._miscellaneousIssueLines[_lineIndex];
                this._miscellaneousIssueLines[_lineIndex] = {
                    ..._currentMiscIssueLines,
                };

                this._saveMiscIssue();
            }
        }
    }

    private _saveMiscIssue() {
        const savedInputs = this._getSavedInputs();
        savedInputs.miscellaneousIssue.miscellaneousIssueLines = this._miscellaneousIssueLines;
        savedInputs.selectedIdentifierValues = this._selectedIdentifierValues;
        this.$.storage.set('mobile-MiscellaneousIssueByIdentifier', JSON.stringify(savedInputs));
    }

    private  _calculateMiscLineQuantity(
        line: Partial<MiscellaneousIssueLineInput>
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
                (this.packingUnitToStockUnitConversionFactorToIssue.value
                    ? this.packingUnitToStockUnitConversionFactorToIssue.value
                    : 1);
        });
    }

    private _getMiscIssueLines(): Partial<MiscellaneousIssueLineInput>[] {
        this._miscellaneousIssueLines ??= this._getSavedInputs().miscellaneousIssue?.miscellaneousIssueLines ?? [];
        return this._miscellaneousIssueLines;
    }

    private _getQuantityInPackingUnitOrigin(record: Partial<Stock>): number {
        if ((record as any).quantityInPackingUnitOrigin) {
            return (record as any).quantityInPackingUnitOrigin;
        } else {
            return Number(record.quantityInPackingUnit);
            // const _quantityInPackingUnitOrigin = Number(record.quantityInPackingUnit);
            // return this._getMiscIssueLines()
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
            _quantityInPackingUnitRest = this._getMiscIssueLines()
                .filter(_ => Number(_.id) === Number(record.stockId) && _.lineNumber === this._selectedLineIndex)
                .reduce<decimal>((_acc, _line) => {
                    return _acc - this._getStockDetailToMoveInPackingUnit(_line);
                }, _quantityInPackingUnitOrigin);
        }
        return _quantityInPackingUnitRest ?? _quantityInPackingUnitOrigin;
    }

    /**
     * Return cumulated stock quantities to issue for current line
     * @param _currentMiscIssueLine current stock change line
     * @returns cumulated quantities
     */
    private _getStockDetailToMoveInPackingUnit(_currentMiscIssueLine: Partial<MiscellaneousIssueLineInput>): number {
        return Number(
            _currentMiscIssueLine.stockDetails?.reduce<decimal>((_acc, stockDetail) => {
                return _acc + Number(stockDetail.quantityInPackingUnit);
            }, 0),
        );
    }

    private _getMiscIssueLine(record: Partial<Stock>): Partial<MiscellaneousIssueLineInput> | undefined {
        return this._getMiscIssueLines().find(
            line => Number(line.id) === Number(record.stockId) && line.lineNumber === this._selectedLineIndex,
        );
    }

    private _getQuantityToMove(record: Partial<Stock>): number {
        const _line = this._getMiscIssueLine(record);
        const _quantityToMove = _line ? Number(_line.quantityInPackingUnit) : Number(record.quantityInPackingUnit);

        return Math.min(_quantityToMove, Number(this._getQuantityInPackingUnitRest(record)));
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

        this._originalStockLines = [{} as originalStockLine];
        this._stockQueryResult.forEach((line:ui.PartialNodeWithId<Stock>) => {
            if (this._originalStockLines.findIndex((element:originalStockLine) => element.id === line._id)<0) {
                this._originalStockLines.push({
                    id: line._id ?? '',
                    stockId: line.stockId ?? '',
                    packingUnit: line.packingUnit,
                    packingUnitToStockUnitConversionFactor: Number(line.packingUnitToStockUnitConversionFactor),
                    quantityInStockUnit: Number(line.quantityInStockUnit),
                    quantityInPackingUnit: Number(line.quantityInPackingUnit),
                    quantityInPackingUnitIssue: 0
                });
            }

        });
        this._originalStockLines.splice(0,1);
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
