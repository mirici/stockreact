import { Product, ProductSite, SerialNumberManagement, UnitOfMeasure } from '@sage/x3-master-data-api';
import { dialogConfirmation, dialogMessage } from '@sage/x3-master-data/lib/client-functions/dialogs';
import { GraphApi, PickTicketLine, StockEntryTransaction } from '@sage/x3-stock-api';
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
import { getRegExp } from '@sage/x3-system/lib/shared-functions/pat-converter';
import { Dict, extractEdges } from '@sage/xtrem-client';
import * as ui from '@sage/xtrem-ui';
import { generateStockTableFilter, handleFilterOnChange, managePages } from '../client-functions/manage-pages';
import { findStockManagementRules } from '../client-functions/stock-management-rules';

type DeepPartial<T> = T extends Object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;
type PartialLocation = DeepPartial<Location>;
type PartialPickTicketLine = DeepPartial<PickTicketLine>;
type PartialStockEntryTransaction = DeepPartial<StockEntryTransaction>;
type PartialProductSite = DeepPartial<ProductSite>;
type PartialSite = DeepPartial<Site>;

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

type PickStockLine = {
    packingUnit?: string;
    quantityInPackingUnit: number;
    packingUnitToStockUnitConversionFactor: number;
    quantityInStockUnit: number;
    location?: string;
    lot?: string;
    sublot?: string;
    serialNumber?: string;
    status?: string;
    stockId: number;
};

@ui.decorators.page<MobilePickTicketViewPickTicketLineGlobal>({
    title: 'Pick ticket',
    subtitle: 'Select stock',
    node: '@sage/x3-master-data/ProductSite',
    mode: 'default',
    isTitleHidden: true,
    isTransient: false,
    navigationPanel: undefined,
    headerCard() {
        return {
            title: this.pickTicket,
            titleRight: this.pickTicketLine,
            line2: this.product,
            line2Right: this.localizedDescription1,
            line3: this.titleQuantityToPick,
            line3Right: this.quantityToPick,
        };
    },
    businessActions() {
        if (this.$.detailPanel?.isHidden) {
            return [];
        } else {
            return [this.pickButton];
        }
    },
    async onLoad() {
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
            this.stockSite.value,
            { ...this.$.values, product: { ...this.product.value } },
            '4',
            ui.localize(
                '@sage/x3-stock/pages__mobile-settings__mandatory-settings-missing',
                'Mandatory settings missing.',
            ),
            this._stockFieldSettings,
        );
        // await this._getStock();
        await this.stock.refresh();
        await this._removeStockNotAvailable();
    },
    detailPanel() {
        return {
            isCloseButtonHidden: true,
            isTitleHidden: true,
            isHidden: true,
            isTransient: true,
            header: this.detailPanelSection,
            sections: [],
            footerActions: [this.pickButton],
        };
    },
})
export class MobilePickTicketViewPickTicketLineGlobal extends ui.Page<GraphApi> {
    private static readonly TRANSACTION_KEY: string = 'mobile-pick-ticket-entry-transaction';
    private static readonly DESTINATION_KEY: string = 'mobile-pick-ticket-destination-location';
    private static readonly DESTINATION_DISPLAY_KEY: string = 'mobile-pick-ticket-destination-location-display';
    private static readonly PICK_LIST_KEY: string = 'mobile-pick-ticket-pick-list';
    private static readonly PICK_TICKET_KEY: string = 'mobile-pick-ticket';
    private static readonly PICK_TICKET_LINE_KEY: string = 'mobile-pick-ticket-line';

    private _pickTicketLine: PartialPickTicketLine;
    private _productSite: ProductSite;
    private _transaction: PartialStockEntryTransaction;
    private _stockSite: PartialSite;
    _packingUnits: packingUnit[];

    private _pickStockLines: PickStockLine[];
    private _currentOperation: number;
    private _selectedLocation: PartialLocation;
    private _stockFieldSettings: StockSearchFilter[] = [];
    private _serialNumberManagementMode: SerialNumberManagement;
    private _selectedStockManagementRules: StockManagementRules;
    private _currentPickStockLine: number;
    private _mobileSettings: MobileSettings;
    _quantityToPick: number;
    _isFilterSerialNumber: boolean;

    @ui.decorators.textField<MobilePickTicketViewPickTicketLineGlobal>({
        title: 'Pick ticket',
        isReadOnly: true,
        isTransient: true,
    })
    pickTicket: ui.fields.Text;

    @ui.decorators.textField<MobilePickTicketViewPickTicketLineGlobal>({
        title: 'Line',
        isReadOnly: true,
        isTransient: true,
    })
    pickTicketLine: ui.fields.Text;

    @ui.decorators.textField<MobilePickTicketViewPickTicketLineGlobal>({
        isReadOnly: true,
        isTransient: true,
    })
    localizedDescription1: ui.fields.Text;

    @ui.decorators.textField<MobilePickTicketViewPickTicketLineGlobal>({
        isDisabled: true,
        isTransient: true,
    })
    stockSite: ui.fields.Text;

    @ui.decorators.textField<MobilePickTicketViewPickTicketLineGlobal>({
        isDisabled: true,
        isTransient: true,
    })
    transaction: ui.fields.Text;

    @ui.decorators.textField<MobilePickTicketViewPickTicketLineGlobal>({
        isDisabled: true,
        isTransient: true,
    })
    pickList: ui.fields.Text;

    @ui.decorators.textField<MobilePickTicketViewPickTicketLineGlobal>({
        isReadOnly: true,
        isTransient: true,
    })
    quantityToPick: ui.fields.Text;

    @ui.decorators.textField<MobilePickTicketViewPickTicketLineGlobal>({
        isReadOnly: true,
        isTransient: true,
    })
    titleQuantityToPick: ui.fields.Text;

    @ui.decorators.referenceField<MobilePickTicketViewPickTicketLineGlobal, Product>({
        node: '@sage/x3-master-data/Product',
        valueField: 'code',
        isTransient: false,
        isTitleHidden: true,
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
            ui.nestedFields.reference<MobilePickTicketViewPickTicketLineGlobal, Product, UnitOfMeasure>({
                node: '@sage/x3-master-data/UnitOfMeasure',
                bind: 'stockUnit',
                valueField: 'code',
                isHidden: true,
            }),
            ui.nestedFields.reference<MobilePickTicketViewPickTicketLineGlobal, Product, UnitOfMeasure>({
                node: '@sage/x3-master-data/UnitOfMeasure',
                bind: 'stockUnit',
                valueField: 'numberOfDecimals',
                isHidden: true,
            }),
            ui.nestedFields.checkbox({
                bind: 'isNegativeStockAuthorized',
                isHidden: true,
            }),
        ],
    })
    product: ui.fields.Reference<Product>;

    @ui.decorators.checkboxField<MobilePickTicketViewPickTicketLineGlobal>({
        bind: 'isLocationManaged',
        isTransient: false,
        isHidden: true,
    })
    isLocationManaged: ui.fields.Checkbox;

    @ui.decorators.checkboxField<MobilePickTicketViewPickTicketLineGlobal>({
        bind: 'isLicensePlateNumberManaged',
        isTransient: false,
        isHidden: true,
    })
    isLicensePlateNumberManaged: ui.fields.Checkbox;

    /*
     *
     *  Page Actions
     *
     */

    @ui.decorators.pageAction<MobilePickTicketViewPickTicketLineGlobal>({
        title: 'Submit',
        shortcut: ['f2'],
        buttonType: 'primary',
        async onClick() {
            if (this.product.value.serialNumberManagementMode === 'globalReceivedIssued') {
                if (!this.serialNumberLines.value.length) {
                    await dialogMessage(
                        this,
                        'error',
                        ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                        ui.localize(
                            '@sage/x3-stock/pages__mobile_pick_ticket_lines__notification__error_startingSerialNumberMandatory',
                            'You need to select the serial number and add it first.',
                        ),
                    );
                    return;
                }
            } else {
                if (Number(this.quantityInPackingUnitDestination.value) <= 0) {
                    await dialogMessage(
                        this,
                        'error',
                        ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                        ui.localize(
                            '@sage/x3-stock/pages__mobile_pick_ticket_lines__quantityInPackingUnitDestination_must_be_greater_than_0',
                            'The quantity to move must be greater than 0.',
                        ),
                    );
                    return;
                }
            }
            if (this.product.value.serialNumberManagementMode === 'globalReceivedIssued') {
                this._pickStockLines.pop();
                this._currentPickStockLine = this._pickStockLines.length - 1;
            } else if (
                this.product.value.serialNumberManagementMode === 'receivedIssued' &&
                this._isFilterSerialNumber
            ) {
                if (
                    !(await dialogConfirmation(
                        this,
                        'warn',
                        ui.localize('@sage/x3-stock/dialog-warning-title', 'Warning'),
                        ui.localize(
                            '@sage/x3-stock/dialog-confirmation-do-you-submit-the-range-of-the-selected-serial-number',
                            `Do you want to submit the range of the selected serial number ?`,
                        ),
                        {
                            fullScreen: true,
                            acceptButton: {
                                text: ui.localize('@sage/x3-stock/button-accept-yes', 'Yes'),
                            },
                            cancelButton: {
                                text: ui.localize('@sage/x3-stock/button-cancel-no', 'No'),
                            },
                        },
                    ))
                ) {
                    const savpickStockLines = this._pickStockLines;
                    const _pickStockLine = savpickStockLines.find(
                        pickStockLine => Number(pickStockLine.stockId) === Number(this._stockId.value),
                    );
                    if (_pickStockLine) {
                        this._pickStockLines = [_pickStockLine];
                        this._currentPickStockLine = 0;
                        this._pickStockLines[0].packingUnit = this.packingUnitDestination.value ?? undefined;
                        this._pickStockLines[0].quantityInPackingUnit = Number(
                            this.quantityInPackingUnitDestination.value,
                        );
                        this._pickStockLines[0].packingUnitToStockUnitConversionFactor = Number(
                            this.packingUnitToStockUnitConversionFactorDestination.value,
                        );
                        this._pickStockLines[0].quantityInStockUnit = Number(this.quantityInStockUnitDestination.value);
                    }
                    this.$.detailPanel.isHidden = true;
                    this.pickButton.isHidden = true;
                    this.shortageSwitch.isDisabled = false;
                    this.locationDestination.isDisabled = true;
                    this.stock.selectedRecords = [this.stock.getRecordValue(this.gridBlock.selectedRecordId)?._id];
                    this.serialNumber.value = null;
                    this._isFilterSerialNumber = false;
                    await handleFilterOnChange(this, this.serialNumber, this.serialNumber.value?.code);
                    // await this._getStock();
                    await this.stock.refresh();
                    await this._removeStockNotAvailable();
                }
            } else {
                this._pickStockLines[this._currentPickStockLine].packingUnit =
                    this.packingUnitDestination.value ?? undefined;
                this._pickStockLines[this._currentPickStockLine].quantityInPackingUnit = Number(
                    this.quantityInPackingUnitDestination.value,
                );
                this._pickStockLines[this._currentPickStockLine].packingUnitToStockUnitConversionFactor = Number(
                    this.packingUnitToStockUnitConversionFactorDestination.value,
                );
                this._pickStockLines[this._currentPickStockLine].quantityInStockUnit = Number(
                    this.quantityInStockUnitDestination.value,
                );
            }
            this._displayPickedQuantity();
            if (Number(this._pickTicketLine.quantityInStockUnit) - this._getPickedQuantityInStockUnit() > 0) {
                this.stock.selectRecord(this.gridBlock.selectedRecordId);
                const currentRecord = this.stock.getRecordValue(this.gridBlock.selectedRecordId) as any;
                let totalQuantityInPackingUnitDestination: number;
                let totalQuantityInStockUnitDestination: number;
                totalQuantityInPackingUnitDestination = 0;
                totalQuantityInStockUnitDestination = 0;
                this._pickStockLines.forEach(pickStockLine => {
                    if (Number(pickStockLine.stockId) === Number(currentRecord.stockId)) {
                        totalQuantityInPackingUnitDestination += pickStockLine.quantityInPackingUnit;
                        totalQuantityInStockUnitDestination += pickStockLine.quantityInStockUnit;
                    }
                });
                currentRecord.quantityInPackingUnitDestination = totalQuantityInPackingUnitDestination;
                currentRecord.quantityInStockUnitDestination = totalQuantityInStockUnitDestination;
                this.stock.setRecordValue(currentRecord);
                this._displayPickedQuantity();
                this.$.detailPanel.isHidden = true;
                this.pickButton.isHidden = true;
                this.shortageSwitch.isDisabled = false;
                this.locationDestination.isDisabled = true;
                await this.$.commitValueAndPropertyChanges();
            } else {
                await this._processPickPicket(false);
            }
        },
    })
    pickButton: ui.PageAction;

    @ui.decorators.pageAction<MobilePickTicketViewPickTicketLineGlobal>({
        icon: 'add',
        title: 'Add...',
        onError(error) {
            switch (error.message) {
                case '@sage/x3-stock/pages__mobile_pick_ticket_lines__notification__error_startingSerialNumber': {
                    return ui.localize(
                        '@sage/x3-stock/pages__mobile_pick_ticket_lines__notification__error_startingSerialNumber',
                        'The serial number is mandatory',
                    );
                }
                case '@sage/x3-stock/serial-number-range-overlap': {
                    return ui.localize(
                        '@sage/x3-stock/serial-number-range-overlap',
                        'The serial numbers are overlapping. Enter another starting or ending serial number.',
                    );
                }
                case '@sage/x3-stock/pages__mobile_pick_ticket__same-amount-serial-numbers-in-the-range-to-match-quantity-to-move': {
                    return ui.localize(
                        '@sage/x3-stock/pages__mobile_pick_ticket__same-amount-serial-numbers-in-the-range-to-match-quantity-to-move',
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
                    '@sage/x3-stock/pages__mobile_pick_ticket_lines__notification__error_startingSerialNumber',
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
            this._pickStockLines.forEach(line => {
                if (line.serialNumber) {
                    const startingSerialNumber = Number(line.serialNumber.match(/\d+$/));
                    const endingSerialNumber = Number(
                        this._calculateEndingSerialNumber(line.serialNumber, Number(line.quantityInPackingUnit)).match(
                            /\d+$/,
                        ),
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
                    Number(this.quantityInPackingUnitDestination.value),
                )
            ) {
                throw new Error(
                    '@sage/x3-stock/pages__mobile_pick_ticket__same-amount-serial-numbers-in-the-range-to-match-quantity-to-move',
                );
            }
            if (
                (await getCountSerialNumber(
                    this,
                    this.product.value?.code ?? '',
                    this.stockSite.value,
                    this._stockId.value,
                    this.startingSerialNumber.value?.code ?? '',
                    this.endingSerialNumber.value ?? '',
                )) !== Number(this.quantityInPackingUnitDestination.value)
            ) {
                throw new Error('@sage/x3-stock/serial-number-not-sequential');
            }

            let currentRecord = this.stock.getRecordValue(this.gridBlock.selectedRecordId);
            this.serialNumberLines.addRecord({
                quantity: this.quantityInPackingUnitDestination.value,
                startingSerialNumber: this.startingSerialNumber.value.code,
                endingSerialNumber: this.endingSerialNumber.value,
            });

            this._pickStockLines[this._currentPickStockLine].packingUnit =
                this.packingUnitDestination.value ?? undefined;
            this._pickStockLines[this._currentPickStockLine].quantityInPackingUnit = Number(
                this.quantityInPackingUnitDestination.value,
            );
            this._pickStockLines[this._currentPickStockLine].packingUnitToStockUnitConversionFactor = Number(
                this.packingUnitToStockUnitConversionFactorDestination.value,
            );
            this._pickStockLines[this._currentPickStockLine].quantityInStockUnit = Number(
                this.quantityInStockUnitDestination.value,
            );
            this._pickStockLines[this._currentPickStockLine].serialNumber = this.startingSerialNumber.value.code;

            this.quantityInPackingUnitDestination.value = 0;
            this.quantityInStockUnitDestination.value = 0;
            this._pickStockLines.push({
                packingUnit: this.packingUnitDestination.value ?? undefined,
                quantityInPackingUnit: Number(this.quantityInPackingUnitDestination.value),
                packingUnitToStockUnitConversionFactor: Number(
                    this.packingUnitToStockUnitConversionFactorDestination.value,
                ),
                quantityInStockUnit: Number(this.quantityInStockUnitDestination.value),
                location: currentRecord?.location?.code,
                lot: currentRecord?.lot,
                sublot: currentRecord?.sublot,
                serialNumber: '',
                status: currentRecord?.status?.code,
                stockId: Number(currentRecord?.stockId),
            });
            this._currentPickStockLine = this._pickStockLines.length - 1;
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

    @ui.decorators.section<MobilePickTicketViewPickTicketLineGlobal>({
        isTitleHidden: true,
    })
    mainSection: ui.containers.Section;

    @ui.decorators.section<MobilePickTicketViewPickTicketLineGlobal>({
        isTitleHidden: true,
    })
    detailPanelSection: ui.containers.Section;

    @ui.decorators.section<MobilePickTicketViewPickTicketLineGlobal>({
        isTitleHidden: true,
    })
    sectionHeader: ui.containers.Section;

    /*
     *
     *  Blocks
     *
     */

    @ui.decorators.block<MobilePickTicketViewPickTicketLineGlobal>({
        isTitleHidden: true,
        parent() {
            return this.mainSection;
        },
    })
    pickedBlock: ui.containers.Block;

    @ui.decorators.block<MobilePickTicketViewPickTicketLineGlobal>({
        isTitleHidden: true,
        parent() {
            return this.mainSection;
        },
    })
    bodyBlock: ui.containers.Block;

    @ui.decorators.block<MobilePickTicketViewPickTicketLineGlobal>({
        isTitleHidden: true,
        parent() {
            return this.detailPanelSection;
        },
    })
    detailsBlock: ui.containers.Block;

    @ui.decorators.gridRowBlock<MobilePickTicketViewPickTicketLineGlobal>({
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

    @ui.decorators.block<MobilePickTicketViewPickTicketLineGlobal>({
        isTitleHidden: true,
        parent() {
            return this.detailPanelSection;
        },
    })
    quantityBlock: ui.containers.Block;

    @ui.decorators.block<MobilePickTicketViewPickTicketLineGlobal>({
        isTitleHidden: true,
        parent() {
            return this.detailPanelSection;
        },
    })
    serialNumberBlock: ui.containers.Block;

    @ui.decorators.block<MobilePickTicketViewPickTicketLineGlobal>({
        isTitleHidden: true,
        parent() {
            return this.detailPanelSection;
        },
    })
    destinationBlock: ui.containers.Block;

    @ui.decorators.block<MobilePickTicketViewPickTicketLineGlobal>({
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

    @ui.decorators.textField<MobilePickTicketViewPickTicketLineGlobal>({
        parent() {
            return this.pickedBlock;
        },
        isTitleHidden: true,
        isReadOnly: true,
        isTransient: true,
        isFullWidth: true,
    })
    pickedQuantity: ui.fields.Text;

    @ui.decorators.switchField<MobilePickTicketViewPickTicketLineGlobal>({
        parent() {
            return this.pickedBlock;
        },
        isDisabled: false,
        isHidden: false,
        isReadOnly: false,
        isTransient: true,
        size: 'small',
        title: 'Shortage',
        async onChange() {
            if (this.shortageSwitch.value) {
                const shortPick = await dialogConfirmation(
                    this,
                    'info',
                    ui.localize('@sage/x3-stock/dialog-information-title', 'Information'),
                    ui.localize(
                        '@sage/x3-stock/dialog-confirmation-pick-ticket-shortage-message',
                        'Create a shortage?',
                    ),
                    {
                        fullScreen: true,
                        acceptButton: {
                            text: ui.localize('@sage/x3-stock/button-accept-yes', 'Yes'),
                        },
                        cancelButton: {
                            text: ui.localize('@sage/x3-stock/button-cancel-no', 'No'),
                        },
                    },
                );
                if (shortPick) {
                    await this._processPickPicket(true);
                }
                this.shortageSwitch.value = false;
            }
        },
    })
    shortageSwitch: ui.fields.Switch;

    @ui.decorators.referenceField<MobilePickTicketViewPickTicketLineGlobal, LicensePlateNumber>({
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
                _and: [{ status: 'inStock' }, { stockSite: { code: this.stockSite.value } }],
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

    @ui.decorators.referenceField<MobilePickTicketViewPickTicketLineGlobal, Location>({
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
                stockSite: { code: this.stockSite.value },
                category: { _nin: ['subcontract', 'customer'] },
            };
            return locationFilter;
        },
        async onChange() {
            await handleFilterOnChange<Location>(this, this.location);
            // await this._getStock();
            await this.stock.refresh();
            await this._removeStockNotAvailable();
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

    @ui.decorators.referenceField<MobilePickTicketViewPickTicketLineGlobal, LotsSites>({
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
                storageSite: { code: this.stockSite.value ?? undefined },
            };
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

    @ui.decorators.referenceField<MobilePickTicketViewPickTicketLineGlobal, LotsSites>({
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
                storageSite: { code: this.stockSite.value ?? undefined },
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

    @ui.decorators.referenceField<MobilePickTicketViewPickTicketLineGlobal, SerialNumber>({
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
                stockSite: { code: this.stockSite.value ?? undefined },
                issueDocumentId: '',
            };
        },
        async onChange() {
            if (this.serialNumber.value && this.product.value?.serialNumberManagementMode === 'receivedIssued') {
                this._isFilterSerialNumber = await dialogConfirmation(
                    this,
                    'warn',
                    ui.localize('@sage/x3-stock/dialog-warning-title', 'Warning'),
                    ui.localize(
                        '@sage/x3-stock/dialog-confirmation-do-you-want-to-take-the-following-serial-number-until-the-quantity-to-pick',
                        `Do you want to take the following serial number until the quantity to pick ?`,
                    ),
                    {
                        fullScreen: true,
                        acceptButton: {
                            text: ui.localize('@sage/x3-stock/button-accept-yes', 'Yes'),
                        },
                        cancelButton: {
                            text: ui.localize('@sage/x3-stock/button-cancel-no', 'No'),
                        },
                    },
                );
                await handleFilterOnChange(this, this.serialNumber, this.serialNumber.value?.code);
                // await this._getStock();
                await this.stock.refresh();
                await this._removeStockNotAvailable();
                this.stock.value.forEach(line => {
                    const currentRecord = this.stock.getRecordValue(line._id);
                    this.stock.selectRecord(line._id);
                    if (
                        currentRecord &&
                        !this._pickStockLines.find(
                            pickStockLine => Number(pickStockLine.stockId) === Number(currentRecord.stockId),
                        )
                    ) {
                        this._pickStockLines.push({
                            packingUnit: currentRecord.packingUnit?.code,
                            quantityInPackingUnit: Number(currentRecord.quantityInPackingUnit),
                            packingUnitToStockUnitConversionFactor: Number(
                                currentRecord.packingUnitToStockUnitConversionFactor,
                            ),
                            quantityInStockUnit: Number(currentRecord.quantityInStockUnit),
                            location: currentRecord.location?.code,
                            lot: currentRecord.lot,
                            sublot: currentRecord.sublot,
                            serialNumber: currentRecord.serialNumber,
                            status: currentRecord.status?.code,
                            stockId: Number(currentRecord.stockId),
                        });
                        (currentRecord as any).quantityInPackingUnitDestination = 1;
                        (currentRecord as any).quantityInStockUnitDestination = 1;
                        this.stock.setRecordValue(currentRecord);
                    }
                });
                this._displayPickedQuantity();
            } else {
                this._isFilterSerialNumber = false;
                await handleFilterOnChange(this, this.serialNumber, this.serialNumber.value?.code);
                // await this._getStock();
                await this.stock.refresh();
                await this._removeStockNotAvailable();
            }
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

    @ui.decorators.selectField<MobilePickTicketViewPickTicketLineGlobal>({
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
            // await this._getStock();
            await this.stock.refresh();
            await this._removeStockNotAvailable();
        },
    })
    status: ui.fields.Select;

    @ui.decorators.selectField<MobilePickTicketViewPickTicketLineGlobal>({
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
            // await this._getStock();
            await this.stock.refresh();
            await this._removeStockNotAvailable();
        },
    })
    packingUnit: ui.fields.Select;

    @ui.decorators.numericField<MobilePickTicketViewPickTicketLineGlobal>({
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
            // await this._getStock();
            await this.stock.refresh();
            await this._removeStockNotAvailable();
        },
    })
    packingUnitToStockUnitConversionFactor: ui.fields.Numeric;

    @ui.decorators.textField<MobilePickTicketViewPickTicketLineGlobal>({
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
            // await this._getStock();
            await this.stock.refresh();
            await this._removeStockNotAvailable();
        },
    })
    identifier1: ui.fields.Text;

    @ui.decorators.textField<MobilePickTicketViewPickTicketLineGlobal>({
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
            // await this._getStock();
            this._removeStockNotAvailable();
        },
    })
    identifier2: ui.fields.Text;

    @ui.decorators.textField<MobilePickTicketViewPickTicketLineGlobal>({
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
            // await this._getStock();
            await this.stock.refresh();
            await this._removeStockNotAvailable();
        },
    })
    stockCustomField1: ui.fields.Text;

    @ui.decorators.textField<MobilePickTicketViewPickTicketLineGlobal>({
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
            // await this._getStock();
            await this.stock.refresh();
            await this._removeStockNotAvailable();
        },
    })
    stockCustomField2: ui.fields.Text;

    @ui.decorators.tableField<MobilePickTicketViewPickTicketLineGlobal, Stock>({
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
        pageSize: 500,
        orderBy: {
            stockSite: 1,
            stockId: 1,
        },
        filter() {
            return {
                ...generateStockTableFilter(this),
                ...{ location: { category: { _nin: ['subcontract', 'customer'] } } },
                ...{ qualityAnalysisRequestId: { _eq: '' } },
            };
        },
        columns: [
            ui.nestedFields.numeric({
                bind: 'quantityInPackingUnitDestination' as any,
                isReadOnly: true,
                isHidden: false,
                isTransient: true,
                postfix(value, rowValue?: Dict<any>) {
                    return `/ ${ui.formatNumberToCurrentLocale(
                        Number(rowValue?.availableQuantityInPackingUnit),
                        Number(rowValue?.packingUnitDestination?.numberOfDecimals),
                    )} ${String(rowValue?.packingUnitDestination?.code)}`;
                },
                title: 'PAC quantity',
                isTitleHidden: false,
                isMandatory: false,
                isFullWidth: true,
                scale(value, rowValue?: Dict<any>) {
                    return rowValue?.packingUnitDestination?.numberOfDecimals ?? 0;
                },
            }),
            ui.nestedFields.numeric({
                bind: 'quantityInPackingUnit',
                isHidden: true,
                isTitleHidden: true,
                isTransient: false,
            }),
            ui.nestedFields.numeric({
                bind: 'allocatedQuantity',
                isHidden: true,
                isTitleHidden: true,
                isTransient: false,
            }),
            ui.nestedFields.numeric({
                bind: 'availableQuantityInPackingUnit' as any,
                isHidden: true,
                isTitleHidden: true,
                isTransient: true,
            }),
            ui.nestedFields.numeric({
                bind: 'quantityInStockUnitDestination' as any,
                isReadOnly: true,
                isHidden: true,
                isTransient: true,
                postfix(value, rowValue?: Dict<any>) {
                    return `/ ${ui.formatNumberToCurrentLocale(
                        Number(rowValue?.availableQuantityInStockUnit),
                        Number(rowValue?.stockUnit.numberOfDecimals),
                    )} ${String(rowValue?.stockUnit.code)}`;
                },
                scale(value, rowValue?: Dict<any>) {
                    return rowValue?.stockUnit.numberOfDecimals ?? 0;
                },
                title: 'stock quantity',
                isTitleHidden: false,
                isMandatory: false,
                isFullWidth: true,
            }),
            ui.nestedFields.numeric({
                bind: 'quantityInStockUnit',
                isHidden: true,
                isTitleHidden: true,
                isTransient: false,
            }),
            ui.nestedFields.numeric({
                bind: 'availableQuantityInStockUnit' as any,
                isHidden: true,
                isTitleHidden: true,
                isTransient: true,
            }),
            ui.nestedFields.reference<MobilePickTicketViewPickTicketLineGlobal, Stock, ProductSite>({
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
                    ui.nestedFields.text({
                        bind: { product: { stockUnit: { code: true } } },
                    }),
                    ui.nestedFields.numeric({
                        bind: { product: { stockUnit: { numberOfDecimals: true } } },
                    }),
                ],
            }),
            ui.nestedFields.reference<MobilePickTicketViewPickTicketLineGlobal, Stock, LicensePlateNumber>({
                bind: 'licensePlateNumber',
                valueField: 'code',
                node: '@sage/x3-stock-data/LicensePlateNumber',
                isReadOnly: true,
                isHidden() {
                    return this.licensePlateNumber.isHidden ?? false;
                },
            }),
            ui.nestedFields.reference<MobilePickTicketViewPickTicketLineGlobal, Stock, Location>({
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
                isFullWidth: true,
                maxLength: 20,
                isHidden() {
                    return this.serialNumber.isHidden ?? false;
                },
            }),
            ui.nestedFields.reference<MobilePickTicketViewPickTicketLineGlobal, Stock, StockStatus>({
                bind: 'status',
                valueField: 'code',
                node: '@sage/x3-stock-data/StockStatus',
                isReadOnly: true,
                isHidden() {
                    return this.status.isHidden ?? false;
                },
            }),
            ui.nestedFields.technical<MobilePickTicketViewPickTicketLineGlobal, Stock, UnitOfMeasure>({
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
            ui.nestedFields.technical<MobilePickTicketViewPickTicketLineGlobal, Stock, UnitOfMeasure>({
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
            ui.nestedFields.technical<MobilePickTicketViewPickTicketLineGlobal, Stock, UnitOfMeasure>({
                bind: 'stockUnit' as any,
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
            ui.nestedFields.technical<MobilePickTicketViewPickTicketLineGlobal, Stock, Lot>({
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
            let currentRecord = this.stock.getRecordValue(recordId);
            if (currentRecord) {
                let i: number = 0;
                while (i < this._pickStockLines.length) {
                    if (Number(this._pickStockLines[i].stockId) === Number(currentRecord.stockId)) {
                        this._pickStockLines.splice(i, 1);
                    } else {
                        i += 1;
                    }
                }
                this._displayPickedQuantity();
                (currentRecord as any).quantityInPackingUnitDestination = (
                    currentRecord as any
                ).availableQuantityInPackingUnit;
                (currentRecord as any).quantityInStockUnitDestination = (
                    currentRecord as any
                ).availableQuantityInStockUnit;
                this.stock.setRecordValue(currentRecord);
                this._isFilterSerialNumber = false;
            }
        },
        sortColumns(firstColumn, secondColumn) {
            if (firstColumn.bind === secondColumn.bind) return 0;
            if (firstColumn.bind === 'quantityInPackingUnitDestination') {
                return secondColumn.bind === (this._stockFieldSettings[0] as string) ? 1 : -1;
            } else if (secondColumn.bind === 'quantityInPackingUnitDestination') {
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
                quantityInPackingUnitDestination: this._getQuantityInPackingUnitDestination(record).toString(),
                quantityInStockUnitDestination: this._getQuantityInStockUnitDestination(record).toString(),
                availableQuantityInPackingUnit: this._getAvailableQuantityInPackingUnit(record).toString(),
                availableQuantityInStockUnit: this._getAvailableQuantityInStockUnit(record).toString(),
                packingUnitDestination: this._getPackingUnitDestination(record),
                packingUnitToStockUnitConversionFactorDestination:
                    this._getPackingUnitToStockUnitConversionFactorDestination(record),
                lotReferenceExpirationDate: record.lotReference?.expirationDate,
                lotReferenceMajorVersion: record.lotReference?.majorVersion?.code,
                lotReferenceUseByDate: record.lotReference?.useByDate,
                stockUnit: record.product?.product.stockUnit,
                globalSerialNumber: ui.localize('@sage/x3-stock/label-view-all', 'View list'),
            };
            return _record;
        },

        async onRowClick(recordId: string, rowItem: Stock) {
            await this._onRowClick(recordId, rowItem);
        },
    })
    stock: ui.fields.Table<Stock>;

    private async _getStock() {
        this.stock.value = extractEdges(
            await this.$.graph
                .node('@sage/x3-stock-data/Stock')
                .query(
                    ui.queryUtils.edgesSelector<Stock>(
                        {
                            quantityInPackingUnit: true,
                            allocatedQuantity: true,
                            quantityInStockUnit: true,
                            product: {
                                product: {
                                    code: true,
                                    serialNumberManagementMode: true,
                                    stockUnit: {
                                        code: true,
                                        numberOfDecimals: true,
                                    },
                                },
                            },
                            licensePlateNumber: {
                                code: true,
                            },
                            location: {
                                code: true,
                            },
                            lot: true,
                            sublot: true,
                            serialNumber: true,
                            status: {
                                code: true,
                            },
                            packingUnit: {
                                code: true,
                                numberOfDecimals: true,
                            },
                            packingUnitToStockUnitConversionFactor: true,
                            identifier1: true,
                            identifier2: true,
                            stockCustomField1: true,
                            stockCustomField2: true,
                            stockId: true,
                            lotReference: {
                                expirationDate: true,
                                useByDate: true,
                                lotCustomField1: true,
                                lotCustomField2: true,
                                majorVersion: {
                                    code: true,
                                },
                            },
                            owner: true,
                        },
                        {
                            filter: {
                                ...generateStockTableFilter(this),
                                ...{ location: { category: { _nin: ['subcontract', 'customer'] } } },
                                ...{ qualityAnalysisRequestId: { _eq: '' } },
                            },
                            first: 500,
                            orderBy: {
                                stockSite: 1,
                                stockId: 1,
                            },
                        },
                    ),
                )
                .execute(),
        );
    }

    @ui.decorators.detailListField<MobilePickTicketViewPickTicketLineGlobal, Stock>({
        parent() {
            return this.detailsBlock;
        },
        node: '@sage/x3-stock-data/Stock',
        isTransient: true,
        isFullWidth: true,
        isTitleHidden: true,
        fields: [
            ui.nestedFields.reference<MobilePickTicketViewPickTicketLineGlobal, Stock, ProductSite>({
                bind: 'product',
                valueField: { product: { code: true } },
                node: '@sage/x3-master-data/ProductSite',
                title: 'Product',
                isReadOnly: true,
                isHidden: false,
            }),
            ui.nestedFields.reference<MobilePickTicketViewPickTicketLineGlobal, Stock, LicensePlateNumber>({
                bind: 'licensePlateNumber',
                title: 'License plate number',
                valueField: 'code',
                node: '@sage/x3-stock-data/LicensePlateNumber',
                isReadOnly: true,
                isHidden: hideWhenEmptyValue,
            }),
            ui.nestedFields.reference<MobilePickTicketViewPickTicketLineGlobal, Stock, Location>({
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
            ui.nestedFields.reference<MobilePickTicketViewPickTicketLineGlobal, Stock, Lot>({
                node: '@sage/x3-stock-data/Lot',
                bind: 'lotReference',
                valueField: 'lotCustomField1',
                title: 'Lot custom field 1',
                isReadOnly: true,
                isHidden(value: Lot) {
                    return !value?.lotCustomField1;
                },
            }),
            ui.nestedFields.reference<MobilePickTicketViewPickTicketLineGlobal, Stock, Lot>({
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
                                subtitle: this.localizedDescription1.value ?? '',
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
                bind: 'quantityInPackingUnitDestination' as any,
                title: 'PAC quantity',
                isReadOnly: true,
                isTransient: true,
                isHidden: true,
                postfix(value, rowValue?: Dict<any>) {
                    return rowValue?.packingUnit.code;
                },
                scale(value, rowValue?: Dict<any>) {
                    return rowValue?.packingUnit.numberOfDecimals ?? 0;
                },
            }),
            ui.nestedFields.numeric({
                bind: 'availableQuantityInPackingUnit' as any,
                title: 'Packing qty.',
                isReadOnly: true,
                isHidden: false,
                postfix() {
                    return this.stock.getRecordValue(this.gridBlock.selectedRecordId).packingUnit?.code;
                },
                scale() {
                    return (
                        this.stock.getRecordValue(this.gridBlock.selectedRecordId).packingUnit?.numberOfDecimals ?? 0
                    );
                },
            }),
            ui.nestedFields.reference<MobilePickTicketViewPickTicketLineGlobal, Stock, UnitOfMeasure>({
                bind: 'packingUnit',
                node: '@sage/x3-master-data/UnitOfMeasure',
                valueField: 'code',
                title: 'Unit',
                isReadOnly: true,
                isHidden: true,
            }),
            ui.nestedFields.reference<MobilePickTicketViewPickTicketLineGlobal, Stock, UnitOfMeasure>({
                bind: 'packingUnit',
                node: '@sage/x3-master-data/UnitOfMeasure',
                valueField: 'numberOfDecimals',
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
                bind: 'availableQuantityInStockUnit' as any,
                title: 'Stock qty.',
                isReadOnly: true,
                isHidden: false,
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
                isHidden: false,
                postfix() {
                    return this.product.value?.stockUnit?.code ?? '';
                },
                scale() {
                    return this.product.value?.stockUnit?.numberOfDecimals ?? 0;
                },
            }),
            ui.nestedFields.reference<MobilePickTicketViewPickTicketLineGlobal, Stock, StockStatus>({
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
        ],
    })
    stockDetails: ui.fields.DetailList<Stock>;

    @ui.decorators.dropdownListField<MobilePickTicketViewPickTicketLineGlobal>({
        parent() {
            return this.quantityBlock;
        },
        title: 'PAC unit',
        width: 'small',
        isMandatory: true,
        isTransient: true,
        async onChange() {
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
                this.packingUnitDestinationDecimales.value = selectedUnit.packingUnit.numberOfDecimals;
            } else {
                this.packingUnitToStockUnitConversionFactorDestination.value = 1;
                this.packingUnitToStockUnitConversionFactorDestination.isDisabled = true;
                this.packingUnitDestinationDecimales.value = 0;
            }
            if (this.packingUnitToStockUnitConversionFactorDestination.value > 0) {
                this.quantityInPackingUnitDestination.value =
                    this.quantityInStockUnitDestination.value /
                    this.packingUnitToStockUnitConversionFactorDestination.value;
                this.quantityInPackingUnitDestination.value = Number.parseFloat(
                    this.quantityInPackingUnitDestination.value.toFixed(
                        this.packingUnitDestinationDecimales.value ?? 0,
                    ),
                );
            }
            this.quantityInPackingUnitDestination.scale = this.packingUnitDestinationDecimales.value ?? 0;
            this.packingUnitDestination.getNextField(true)?.focus();
        },
    })
    packingUnitDestination: ui.fields.DropdownList;

    @ui.decorators.numericField<MobilePickTicketViewPickTicketLineGlobal>({
        parent() {
            return this.quantityBlock;
        },
        isTransient: true,
        isHidden: true,
    })
    packingUnitDestinationDecimales: ui.fields.Numeric;

    @ui.decorators.numericField<MobilePickTicketViewPickTicketLineGlobal>({
        parent() {
            return this.quantityBlock;
        },
        postfix(value, rowValue?: Dict<any>) {
            return `/ ${ui.formatNumberToCurrentLocale(
                this._getQuantityInPackingUnitToPick(),
                this.packingUnitDestinationDecimales.value ?? 0,
            )} ${this.packingUnitDestination.value}`;
        },
        title: 'PAC quantity',
        isTransient: true,
        isFullWidth: true,
        max() {
            return this._getQuantityInPackingUnitToPick();
        },
        scale() {
            return (
                (<any>(<unknown>this.stock.getRecordValue(this.gridBlock?.selectedRecordId)))?.packingUnit
                    ?.numberOfDecimals ?? 0
            );
        },
        async onChange() {
            if (this.packingUnitToStockUnitConversionFactorDestination.value > 0) {
                this.quantityInStockUnitDestination.value =
                    this.quantityInPackingUnitDestination.value *
                    this.packingUnitToStockUnitConversionFactorDestination.value;
                this.quantityInStockUnitDestination.value = Number.parseFloat(
                    this.quantityInStockUnitDestination.value.toFixed(
                        (this.stock.getRecordValue(this.gridBlock.selectedRecordId) as any)?.stockUnit
                            ?.numberOfDecimals,
                    ),
                );
            }
        },
    })
    quantityInPackingUnitDestination: ui.fields.Numeric;

    @ui.decorators.numericField<MobilePickTicketViewPickTicketLineGlobal>({
        parent() {
            return this.quantityBlock;
        },
        title: 'conversion factor',
        isDisabled: true,
        isMandatory: true,
        isTransient: true,
        isFullWidth: true,
        scale: 5,
        onChange() {
            if (this.packingUnitToStockUnitConversionFactorDestination.value > 0) {
                this.quantityInStockUnitDestination.value =
                    this.quantityInPackingUnitDestination.value *
                    this.packingUnitToStockUnitConversionFactorDestination.value;
                this.quantityInStockUnitDestination.value = Number.parseFloat(
                    this.quantityInStockUnitDestination.value.toFixed(
                        (this.stock.getRecordValue(this.gridBlock.selectedRecordId) as any)?.stockUnit
                            ?.numberOfDecimals,
                    ),
                );
            }
        },
    })
    packingUnitToStockUnitConversionFactorDestination: ui.fields.Numeric;

    @ui.decorators.textField<MobilePickTicketViewPickTicketLineGlobal>({
        title: 'Stock unit',
        isDisabled: true,
        isTransient: true,
        parent() {
            return this.quantityBlock;
        },
    })
    stockUnit: ui.fields.Text;

    @ui.decorators.numericField<MobilePickTicketViewPickTicketLineGlobal>({
        parent() {
            return this.quantityBlock;
        },
        postfix(value, rowValue?: Dict<any>) {
            return `/ ${ui.formatNumberToCurrentLocale(
                this._getQuantityInStockUnitToPick(),
                this._productSite.product.stockUnit.numberOfDecimals,
            )} ${this._productSite.product.stockUnit.code}`;
        },
        title: 'Stock quantity',
        isMandatory: true,
        isFullWidth: true,
        isTransient: true,
        validation: /^([0-9]*(\.[0-9]+)?|[0]+\.[0-9]*[1-9][0-9]*)$/, // reg ex for any positive numbers (integers or decimals)
        min: 0,
        scale() {
            return this._productSite.product.stockUnit.numberOfDecimals ?? 0;
        },
        max() {
            return this._getQuantityInStockUnitToPick();
        },
        async onChange() {
            if (this.packingUnitToStockUnitConversionFactorDestination.value > 0) {
                this.quantityInPackingUnitDestination.value =
                    this.quantityInStockUnitDestination.value /
                    this.packingUnitToStockUnitConversionFactorDestination.value;
                this.quantityInPackingUnitDestination.value = Number.parseFloat(
                    this.quantityInPackingUnitDestination.value.toFixed(
                        this.packingUnitDestinationDecimales.value ?? 0,
                    ),
                );
            }
        },
    })
    quantityInStockUnitDestination: ui.fields.Numeric;

    @ui.decorators.referenceField<MobilePickTicketViewPickTicketLineGlobal, SerialNumber>({
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

    @ui.decorators.textField<MobilePickTicketViewPickTicketLineGlobal>({
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
            let currentQty = Number(this.quantityInPackingUnitDestination.value);
            if (
                (await getCountSerialNumber(
                    this,
                    this.product.value?.code ?? '',
                    this.stockSite.value ?? '',
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

    @ui.decorators.referenceField<MobilePickTicketViewPickTicketLineGlobal, Location>({
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
                stockSite: { code: this._stockSite.code },
                category: { _nin: ['subcontract', 'customer'] },
            };
            return locationFilter;
        },
        async onChange() {
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

    // technical fields for customization
    @ui.decorators.checkboxField<MobilePickTicketViewPickTicketLineGlobal>({
        parent() {
            return this.destinationBlock;
        },
        isHidden: true,
        isReadOnly: true,
        title: 'custom boolean',
        isTransient: true,
    })
    customBoolean: ui.fields.Checkbox;
    @ui.decorators.numericField<MobilePickTicketViewPickTicketLineGlobal>({
        parent() {
            return this.destinationBlock;
        },
        isHidden: true,
        isReadOnly: true,
        title: 'custom decimal',
        isTransient: true,
    })
    customDecimal: ui.fields.Numeric;
    @ui.decorators.textField<MobilePickTicketViewPickTicketLineGlobal>({
        parent() {
            return this.destinationBlock;
        },
        isHidden: true,
        isReadOnly: true,
        title: 'custom text',
        isTransient: true,
    })
    customString: ui.fields.Text;
    //

    @ui.decorators.dateField<MobilePickTicketViewPickTicketLineGlobal>({
        parent() {
            return this.destinationBlock;
        },
        isHidden: true,
        isReadOnly: true,
        title: 'custom date',
        isTransient: true,
    })
    customDate: ui.fields.Date;

    @ui.decorators.textField<MobilePickTicketViewPickTicketLineGlobal>({
        parent() {
            return this.serialNumberBlock;
        },
        isTransient: true,
        isHidden: true,
    })
    _stockId: ui.fields.Text;

    @ui.decorators.tableField<MobilePickTicketViewPickTicketLineGlobal>({
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
        mobileCard: undefined,
        node: '@sage/x3-stock/StockCountSerialNumber',
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
                    return this.stock.getRecordValue(this.gridBlock.selectedRecordId).packingUnit?.code;
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
                async onClick(recordId: string) {
                    const removedRecordSerialNumber = this.serialNumberLines.getRecordValue(recordId);
                    const removedIndexSerialNumber = this._pickStockLines.findIndex(
                        number => number.serialNumber === removedRecordSerialNumber.startingSerialNumber,
                    );
                    this._pickStockLines.splice(removedIndexSerialNumber, 1);
                    this.quantityInPackingUnitDestination.value = 0;
                    this.quantityInStockUnitDestination.value = 0;

                    this.serialNumberLines.removeRecord(recordId);
                    this.startingSerialNumber.isDisabled = false;
                    this._currentPickStockLine -= 1;
                    await this.$.commitValueAndPropertyChanges();
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
        this.pickTicket.value = this.$.storage.get(MobilePickTicketViewPickTicketLineGlobal.PICK_TICKET_KEY).toString();
        this.pickTicketLine.value = this.$.storage
            .get(MobilePickTicketViewPickTicketLineGlobal.PICK_TICKET_LINE_KEY)
            .toString();
        this.stockSite.value = this.$.storage.get('mobile-selected-stock-site').toString();
        this.pickList.value = this.$.storage.get(MobilePickTicketViewPickTicketLineGlobal.PICK_LIST_KEY).toString();
        this.transaction.value = this.$.storage
            .get(MobilePickTicketViewPickTicketLineGlobal.TRANSACTION_KEY)
            .toString();
        this.locationDestination.value = {
            code: this.$.storage.get(MobilePickTicketViewPickTicketLineGlobal.DESTINATION_KEY).toString(),
        };
        this._mobileSettings = JSON.parse(this.$.queryParameters?.mobileSettings as string);

        this._pickTicketLine = await this._getPickTicketLine();
        this._productSite = await this._getProductSite(this._pickTicketLine.product.code);
        this._transaction = await this._getTransaction(this.transaction.value);
        this._stockSite = { code: this.stockSite.value };
        this.stockUnit.value = this._productSite.product.stockUnit.code;
        await this._getUnitDestinations(this._pickTicketLine.product.code);
        this._currentPickStockLine = 0;
        this._isFilterSerialNumber = false;

        this._initTechnicalProperties();
        await this._fieldsManagement();

        this._pickStockLines = this.$.queryParameters.pickStockLines
            ? JSON.parse(this.$.queryParameters.pickStockLines as string)
            : [];
        this._pickStockLines.forEach(pickStockLine => {
            const _stock = this.stock.value.find(
                item =>
                    (pickStockLine.stockId && Number(pickStockLine.stockId) === Number(item.stockId)) ||
                    (!pickStockLine.stockId &&
                        (!pickStockLine.packingUnit || pickStockLine.packingUnit === item.packingUnit?.code) &&
                        (!pickStockLine.location || pickStockLine.location === item.location?.code) &&
                        (!pickStockLine.lot || pickStockLine.lot === item.lot) &&
                        (!pickStockLine.sublot || pickStockLine.sublot === item.sublot) &&
                        (!pickStockLine.serialNumber || pickStockLine.serialNumber === item.serialNumber) &&
                        (!pickStockLine.status || pickStockLine.status === item.status?.code)),
            );
            if (_stock) {
                const _record = this.stock.getRecordValue(_stock._id);
                if (_record) {
                    this.stock.selectRecord(_stock._id);
                }
            }
        });

        this._displayPickedQuantity();
        this.pickButton.isHidden = true;
        this.shortageSwitch.isDisabled = true;
    }

    private async _removeStockNotAvailable() {
        let recordIndex: number;
        recordIndex = 0;
        while (recordIndex < this.stock.value.length) {
            const record = this.stock.value[recordIndex] as any;
            if (Number(record.availableQuantityInStockUnit) > 0) {
                if (this._isFilterSerialNumber) {
                    if (recordIndex >= this._quantityToPick) {
                        this.stock.removeRecord(record._id);
                    } else {
                        recordIndex++;
                    }
                } else {
                    recordIndex++;
                }
            } else {
                this.stock.removeRecord(record._id);
            }
        }
    }

    private _displayPickedQuantity() {
        this.titleQuantityToPick.value = 'Quantity to pick:';
        this.quantityToPick.value = `${Number(this._pickTicketLine.quantityInStockUnit).toFixed(
            this._pickTicketLine.stockUnit?.numberOfDecimals,
        )} ${this.stockUnit.value}`;
        this.pickedQuantity.value = `Picked quantity: ${Number(this._getPickedQuantityInStockUnit()).toFixed(
            this._pickTicketLine.stockUnit?.numberOfDecimals,
        )} ${this.stockUnit.value}`;
        this._quantityToPick =
            Number(this._pickTicketLine.quantityInStockUnit) - Number(this._getPickedQuantityInStockUnit());
    }

    private _getPickedQuantityInStockUnit(): number {
        let pickedQuantity: number;
        pickedQuantity = 0;
        this._pickStockLines.forEach(pickStockLine => {
            pickedQuantity += pickStockLine.quantityInStockUnit;
        });
        return pickedQuantity;
    }

    private _getPickedQuantityInStockInStockUnit(): number {
        let pickedQuantity: number;
        pickedQuantity = 0;
        this._pickStockLines.forEach(pickStockLine => {
            if (
                Number(pickStockLine.stockId) ===
                Number(this.stock.getRecordValue(this.gridBlock.selectedRecordId)?.stockId)
            ) {
                pickedQuantity += pickStockLine.quantityInStockUnit;
            }
        });
        return pickedQuantity;
    }

    private _getQuantityInStockUnitToPick(): number {
        return Math.min(
            Number((this.stock.getRecordValue(this.gridBlock.selectedRecordId) as any)?.availableQuantityInStockUnit) -
                (this.product.value?.serialNumberManagementMode === 'receivedIssued'
                    ? 0
                    : this._getPickedQuantityInStockInStockUnit()),
            Number(this._pickTicketLine.quantityInStockUnit) -
                (this.product.value?.serialNumberManagementMode === 'receivedIssued'
                    ? 0
                    : this._getPickedQuantityInStockUnit()),
        );
    }

    private _getQuantityInPackingUnitToPick(): number {
        return (
            this._getQuantityInStockUnitToPick() / Number(this.packingUnitToStockUnitConversionFactorDestination.value)
        );
    }

    private async _getPickTicketLine(): Promise<PartialPickTicketLine> {
        const response = await this.$.graph
            .node('@sage/x3-stock/PickTicketLine')
            .query(
                ui.queryUtils.edgesSelector(
                    {
                        pickTicket: true,
                        pickTicketLine: true,
                        product: {
                            code: true,
                            localizedDescription1: true,
                            lotManagementMode: true,
                            serialNumberManagementMode: true,
                            isNegativeStockAuthorized: true,
                        },
                        quantityInStockUnit: true,
                        stockUnit: {
                            code: true,
                            numberOfDecimals: true,
                        },
                        packingUnitToStockUnitConversionFactor: true,
                        packingUnit: {
                            code: true,
                            numberOfDecimals: true,
                        },
                        allocatedQuantity: true,
                        shortageQuantity: true,
                        adcPickedLine: true,
                        allocatedLines: {
                            query: {
                                edges: {
                                    node: {
                                        stockId: true,
                                        quantityInStockUnit: true,
                                        serialNumber: true,
                                        allocationType: true,
                                        stockLine: {
                                            lot: true,
                                            status: { code: true },
                                            sublot: true,
                                            serialNumber: true,
                                            location: {
                                                code: true,
                                            },
                                            quantityInPackingUnit: true,
                                            quantityInStockUnit: true,
                                            packingUnitToStockUnitConversionFactor: true,
                                            packingUnit: {
                                                code: true,
                                            },
                                            licensePlateNumber: { code: true },
                                            identifier1: true,
                                            identifier2: true,
                                        },
                                    },
                                },
                                __args: {
                                    first: 500,
                                },
                            },
                        },
                    },
                    {
                        filter: {
                            pickTicket: { _eq: this.pickTicket.value },
                            pickTicketLine: Number(this.pickTicketLine.value),
                        },
                    },
                ),
            )
            .execute();

        if (!response.edges || response.edges.length === 0) {
            throw new Error(
                ui.localize('@sage/x3-stock/notification-error-no-pick-ticket-line', 'Pick ticket line does not exist'),
            );
        }

        return response.edges[0].node;
    }

    private async _getProductSite(productCode: string) /*: Promise<PartialProductSite>*/ {
        const response = await this.$.graph
            .node('@sage/x3-master-data/ProductSite')
            .query(
                ui.queryUtils.edgesSelector(
                    {
                        isLocationManaged: true,
                        isLicensePlateNumberManaged: true,
                        defaultInternalContainer: {
                            code: true,
                        },
                        stockSite: {
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
                            isNegativeStockAuthorized: true,
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
                    {
                        filter: {
                            product: {
                                code: productCode,
                            },
                            stockSite: {
                                code: this.stockSite.value,
                            },
                        },
                    },
                ),
            )
            .execute();

        if (!response.edges || response.edges.length === 0) {
            throw new Error(
                ui.localize('@sage/x3-stock/notification-error-no-product-site', 'Product site does not exist'),
            );
        }

        return response.edges[0].node as any;
    }

    private async _getUnitDestinations(productCode: string) {
        const response = await this.$.graph
            .node('@sage/x3-master-data/ProductPackingUnits')
            .query(
                ui.queryUtils.edgesSelector(
                    {
                        code: true,
                        packingUnit: {
                            code: true,
                        },
                    },
                    {
                        filter: {
                            code: productCode,
                        },
                    },
                ),
            )
            .execute();

        const options: string[] = [];
        options.push(this.stockUnit.value);
        if (response.edges && response.edges.length > 0) {
            response.edges.forEach(edge => {
                options.push(edge.node.packingUnit.code);
            });
        }
        this.packingUnit.options = options;
        this.packingUnitDestination.options = options;
    }

    private async _getTransaction(transactionCode: string): Promise<PartialStockEntryTransaction> {
        const response = await this.$.graph
            .node('@sage/x3-stock/StockEntryTransaction')
            .query(
                ui.queryUtils.edgesSelector(
                    {
                        _id: true,
                        code: true,
                        isEnterableDestinationLocation: true,
                        identifier1Destination: true,
                        identifier2Destination: true,
                        stockMovementCode: {
                            code: true,
                        },
                    },
                    {
                        filter: {
                            transactionType: 'pickTickets',
                            code: transactionCode,
                            isActive: true,
                        },
                    },
                ),
            )
            .execute();

        if (!response.edges || response.edges.length === 0) {
            throw new Error(
                ui.localize('@sage/x3-stock/notification-error-no-transaction', 'Transaction does not exist'),
            );
        }

        return response.edges[0].node;
    }

    private async _getLastLine(): Promise<boolean> {
        const response = await this.$.graph
            .node('@sage/x3-stock/PickTicketLine')
            .aggregate.read(
                {
                    _id: {
                        distinctCount: true,
                    },
                },
                {
                    filter: {
                        pickTicket: { _eq: this.pickTicket.value },
                        pickTicketLine: { _ne: Number(this.pickTicketLine.value) },
                        adcPickedLine: { _eq: 0 },
                    },
                },
            )
            .execute();

        return response._id?.distinctCount === 0;
    }

    private async _getShortage(): Promise<boolean> {
        const response = await this.$.graph
            .node('@sage/x3-stock/PickTicketLine')
            .aggregate.read(
                {
                    _id: {
                        distinctCount: true,
                    },
                },
                {
                    filter: {
                        pickTicket: { _eq: this.pickTicket.value },
                        //   product: { isNegativeStockAuthorized: false },
                        shortageQuantity: { _ne: '0' },
                    },
                },
            )
            .execute();

        return response._id?.distinctCount !== 0;
    }

    private async _getLastTicket(): Promise<boolean> {
        const response = await this.$.graph
            .node('@sage/x3-stock/PickList')
            .aggregate.read(
                {
                    _id: {
                        distinctCount: true,
                    },
                },
                {
                    filter: {
                        preparationList: { _eq: this.pickList.value },
                        _or: [
                            {
                                pickTicketLine: {
                                    pickTicket: { _ne: this.pickTicket.value },
                                },
                            },
                            {
                                pickTicketLine: {
                                    pickTicketLine: { _ne: Number(this.pickTicketLine.value) },
                                },
                            },
                        ],
                        pickTicketLine: {
                            adcPickedLine: { _eq: 0 },
                        },
                    },
                },
            )
            .execute();

        return response._id?.distinctCount === 0;
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
            isNegativeStockAuthorized: this._productSite.product.isNegativeStockAuthorized,
        };
        this.localizedDescription1.value = this._productSite.product.localizedDescription1;
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
        const currentRecord = this.stock.getRecordValue(this.gridBlock.selectedRecordId);

        if (this.product.value.serialNumberManagementMode === 'receivedIssued' && this._isFilterSerialNumber) {
            const currentPickStockLine = this._pickStockLines.findIndex(
                line => Number(line.stockId) === Number(rowItem.stockId),
            );
            if (currentPickStockLine !== -1) {
                this._currentPickStockLine = currentPickStockLine;
                this.stockUnit.value = currentRecord?.product?.product?.stockUnit.code ?? null;
                this.quantityInStockUnitDestination.value = this._getQuantityInStockUnitToPick();
                this.packingUnitDestination.value = currentRecord?.packingUnit?.code;
                this.packingUnitDestinationDecimales.value = currentRecord?.packingUnit?.numberOfDecimals;
                this.packingUnitToStockUnitConversionFactorDestination.value = Number(
                    currentRecord?.packingUnitToStockUnitConversionFactor,
                );
                this.quantityInPackingUnitDestination.value = this._getQuantityInPackingUnitToPick();
                this._stockId.value = currentRecord?.stockId ?? null;
                await this.$.commitValueAndPropertyChanges();
                await this.stock.validateWithDetails();
                this.$.detailPanel.isHidden = false;
                this.pickButton.isHidden = false;
                return;
            }
        }

        if (this._pickStockLines.find(line => Number(line.stockId) === Number(rowItem.stockId))) {
            return;
        }

        this._pickStockLines.push({
            packingUnit: currentRecord?.packingUnit?.code, //rowItem.packingUnit.code,
            quantityInPackingUnit: 0, // Number(currentRecord?.quantityInPackingUnit), //Number(rowItem.quantityInPackingUnit),
            packingUnitToStockUnitConversionFactor: Number(currentRecord?.packingUnitToStockUnitConversionFactor), //Number(rowItem.packingUnitToStockUnitConversionFactor),
            quantityInStockUnit: 0, // Number(currentRecord?.quantityInStockUnit), //Number(rowItem.quantityInStockUnit),
            location: currentRecord?.location?.code,
            lot: currentRecord?.lot,
            sublot: currentRecord?.sublot,
            serialNumber: currentRecord?.serialNumber,
            status: currentRecord?.status?.code,
            stockId: Number(currentRecord?.stockId),
        });
        this._currentPickStockLine = this._pickStockLines.length - 1;
        this.stockUnit.value = currentRecord?.product?.product?.stockUnit.code ?? null;
        this.quantityInStockUnitDestination.value = this._getQuantityInStockUnitToPick();
        this.packingUnitDestination.value = currentRecord?.packingUnit?.code;
        this.packingUnitDestinationDecimales.value = currentRecord?.packingUnit?.numberOfDecimals;
        this.packingUnitToStockUnitConversionFactorDestination.value = Number(
            currentRecord?.packingUnitToStockUnitConversionFactor,
        );
        this.quantityInPackingUnitDestination.value = this._getQuantityInPackingUnitToPick();
        this._stockId.value = currentRecord?.stockId ?? null;

        if (this.product.value.serialNumberManagementMode === 'globalReceivedIssued') {
            this.serialNumberLines.isHidden = false;
            this.serialNumberLines.value = [];
            this._pickStockLines.forEach(line => {
                if (Number(line.stockId) === Number(rowItem.stockId) && line.serialNumber) {
                    this.serialNumberLines.addRecord({
                        quantity: Number(line.quantityInPackingUnit),
                        startingSerialNumber: line.serialNumber,
                        endingSerialNumber: Number(
                            this._calculateEndingSerialNumber(
                                line.serialNumber,
                                Number(line.quantityInPackingUnit),
                            ).match(/\d+$/),
                        ),
                    });
                }
            });
        }
        await this.$.commitValueAndPropertyChanges();
        await this.stock.validateWithDetails();
        this.$.detailPanel.isHidden = false;
        this.pickButton.isHidden = false;
    }

    private async _fieldsManagement() {
        this._lotManagement();
        await this._miscellaneousFieldsManagement();
        this._serialNumberManagement();
        let productPackingList = extractEdges(this._productSite.product.packingUnits.query).filter(productPacking => {
            return !!productPacking.packingUnit?.code;
        });
        this._packingUnits = productPackingList.map(productPacking => {
            return { node: productPacking };
        });
    }

    private async onChangeBody() {
        let currentRecord = this.stock.getRecordValue(this.gridBlock.selectedRecordId);
        let currentQty = Number(this.quantityInPackingUnitDestination.value);
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
        if (await this._isSerialNumberAllocated(this.startingSerialNumber.value.code, this.endingSerialNumber.value)) {
            await dialogMessage(
                this,
                'error',
                ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                ui.localize(
                    '@sage/x3-stock/pages__mobile_pick_ticket_lines__the_serial_number_already_allocated',
                    'Serial number already allocated.',
                ),
            );
            this.startingSerialNumber.value = null;
            this.endingSerialNumber.value = null;
            this.startingSerialNumber.focus();
            return;
        }

        if (currentQty > (currentRecord as any).quantityInPackingUnit) this.addSerialRange.isHidden = true;
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

    private async _miscellaneousFieldsManagement() {
        if (
            !(this.lot.isHidden || !!this._productSite.product.lotSequenceNumber) &&
            ['lotAndSublot', 'mandatoryLot'].includes(this._productSite.product.lotManagementMode)
        )
            this.lot.isMandatory = true;

        this._selectedStockManagementRules = await findStockManagementRules(
            this.stockSite.value,
            this._productSite.product.productCategory.code,
            '26',
            this._transaction.stockMovementCode?.code,
            this,
        );
        this.status.options = await this._getStockStatus();
    }

    private _serialNumberManagement() {
        this.serialNumber.isHidden = ['notManaged', 'issued'].includes(
            this._productSite.product.serialNumberManagementMode,
        );

        if (['receivedIssued', 'globalReceivedIssued'].includes(this._productSite.product.serialNumberManagementMode)) {
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

    private _getQuantityInPackingUnitDestination(record: Partial<Stock>): Number {
        if ((record as any).quantityInPackingUnitDestination) {
            return Number((record as any).quantityInPackingUnitDestination);
        } else {
            const packingUnitToStockUnitConversionFactor: Number = Number(
                this._getPackingUnitToStockUnitConversionFactorDestination(record),
            );
            return packingUnitToStockUnitConversionFactor
                ? Number(this._getQuantityInStockUnitDestination(record)) /
                      Number(packingUnitToStockUnitConversionFactor)
                : Number(this._getQuantityInStockUnitDestination(record));
        }
    }

    private _getQuantityInStockUnitDestination(record: Partial<Stock>): Number {
        if ((record as any).quantityInStockUnitDestination) {
            return Number((record as any).quantityInStockUnitDestination);
        } else {
            let quantity: Number;
            quantity = this._getAvailableQuantityInStockUnit(record);

            const pickStockLines: PickStockLine[] = this.$.queryParameters.pickStockLines
                ? JSON.parse(this.$.queryParameters.pickStockLines as string)
                : [];
            const pickStockLine = pickStockLines.find(
                item =>
                    (item.stockId && Number(item.stockId) === Number(record.stockId)) ||
                    (!item.stockId &&
                        (!item.packingUnit || item.packingUnit === record.packingUnit?.code) &&
                        (!item.location || item.location === record.location?.code) &&
                        (!item.lot || item.lot === record.lot) &&
                        (!item.sublot || item.sublot === record.sublot) &&
                        (!item.serialNumber || item.serialNumber === record.serialNumber) &&
                        (!item.status || item.status === record.status?.code)),
            );
            if (pickStockLine) {
                quantity = Number(pickStockLine.quantityInStockUnit);
            }
            return quantity;
        }
    }

    private _getAvailableQuantityInPackingUnit(record: Partial<Stock>): Number {
        const packingUnitToStockUnitConversionFactor: Number = Number(
            this._getPackingUnitToStockUnitConversionFactorDestination(record),
        );
        return packingUnitToStockUnitConversionFactor
            ? Number(this._getAvailableQuantityInStockUnit(record)) / Number(packingUnitToStockUnitConversionFactor)
            : Number(record.quantityInPackingUnit);
    }

    private _getAvailableQuantityInStockUnit(record: Partial<Stock>): Number {
        if ((record as any).availableQuantityInStockUnit) {
            return Number((record as any).availableQuantityInStockUnit);
        } else {
            return Number(record.quantityInStockUnit) - Number(record.allocatedQuantity);
        }
    }

    private _getPackingUnitToStockUnitConversionFactorDestination(record: Partial<Stock>): Number {
        if ((record as any).packingUnitToStockUnitConversionFactorDestination) {
            return Number((record as any).packingUnitToStockUnitConversionFactorDestination);
        } else {
            return Number(record.packingUnitToStockUnitConversionFactor);
        }
    }

    private _getPackingUnitDestination(record: Partial<Stock>): Partial<UnitOfMeasure> {
        if ((record as any).packingUnitDestination) {
            return (record as any).packingUnitDestination;
        } else {
            return record.packingUnit;
        }
    }

    private _calculateEndingSerialNumber(startingSerialNumber: string, quantity: number): string {
        return startingSerialNumber.replace(/\d+$/, match => {
            const endingNumber = (Number(match) + quantity - 1).toString();
            const lengthDiff = Math.max(endingNumber.length - match.length, 0);
            return endingNumber.padStart(match.length + lengthDiff, '0');
        });
    }

    private async _isSerialNumberAllocated(startingSerialNumber: string, endingSerialNumber: string): Promise<boolean> {
        const response = await this.$.graph
            .node('@sage/x3-stock/Allocation')
            .query(
                ui.queryUtils.edgesSelector(
                    {
                        _id: true,
                        serialNumber: true,
                        quantityInStockUnit: true,
                    },
                    {
                        filter: {
                            stockSite: { code: this.stockSite.value },
                            product: { code: this.product.value?.code },
                        },
                        first: 500,
                    },
                ),
            )
            .execute();
        let result: boolean;
        result = false;
        response.edges.forEach(item => {
            if (
                (startingSerialNumber >= item.node.serialNumber &&
                    startingSerialNumber <=
                        this._calculateEndingSerialNumber(
                            item.node.serialNumber,
                            Number(item.node.quantityInStockUnit),
                        )) ||
                (endingSerialNumber >= item.node.serialNumber &&
                    endingSerialNumber <=
                        this._calculateEndingSerialNumber(
                            item.node.serialNumber,
                            Number(item.node.quantityInStockUnit),
                        )) ||
                (item.node.serialNumber >= startingSerialNumber && item.node.serialNumber <= endingSerialNumber)
            ) {
                result = true;
            }
        });
        return result;
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

    private async onChangeLot() {
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

    private async _processPickPicket(isShortPick: boolean) {
        this.$.storage.set(
            MobilePickTicketViewPickTicketLineGlobal.DESTINATION_KEY,
            this.locationDestination.value ? this.locationDestination.value.code : '',
        );
        let isDeliverable: boolean;
        isDeliverable = false;
        let isNotSetDelivrable: boolean;
        isNotSetDelivrable = false;
        const isLastLine = await this._getLastLine();
        const isLastTicket = this.pickList.value ? await this._getLastTicket() : true;
        if (isLastLine) {
            isDeliverable = await dialogConfirmation(
                this,
                'warn',
                ui.localize('@sage/x3-stock/dialog-warning-title', 'Warning'),
                ui.localize(
                    '@sage/x3-stock/dialog-confirmation-set-the-pick-ticket-to-deliverable',
                    `Set the pick ticket to 'Deliverable' ?`,
                ),
                {
                    fullScreen: true,
                    acceptButton: {
                        text: ui.localize('@sage/x3-stock/button-accept-yes', 'Yes'),
                    },
                    cancelButton: {
                        text: ui.localize('@sage/x3-stock/button-cancel-no', 'No'),
                    },
                },
            );
        }

        if (isDeliverable) {
            if (!this.product.value.isNegativeStockAuthorized && (isShortPick || (await this._getShortage()))) {
                await dialogMessage(
                    this,
                    'error',
                    ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                    ui.localize(
                        '@sage/x3-stock/pages__mobile_pick_ticket_lines__the_picking_line_is_in_shortage_and_negative_stock_is_prohibited',
                        'The picking line is in shortage and negative stock is prohibited.',
                    ),
                );
                isDeliverable = false;
                isNotSetDelivrable = true;
            } else if (isShortPick && this.locationDestination.value && this.locationDestination.value.code != '') {
                await dialogMessage(
                    this,
                    'error',
                    ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                    ui.localize(
                        '@sage/x3-stock/pages__mobile_pick_ticket_lines__a_location_can_not_be_modified_for_a_stock_out_line',
                        'A location can not be modified for a stock-out line.',
                    ),
                );
                isDeliverable = false;
                isNotSetDelivrable = true;
            }
        }

        const result = await this._callProcessPickAPI(isDeliverable, isShortPick);

        this.$.loader.isHidden = true;

        if (!result || result instanceof Error) {
            const options: ui.dialogs.DialogOptions = {
                acceptButton: {
                    text: ui.localize('@sage/x3-stock/button-goback', 'Go back'),
                },
                cancelButton: {
                    text: ui.localize('@sage/x3-stock/button-cancel', 'Cancel'),
                },
                size: 'small',
                mdContent: true,
            };
            let message = '';

            if (!result?.message) {
                await this.$.sound.error();
                if (
                    await dialogConfirmation(
                        this,
                        'error',
                        ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                        ui.localize(
                            '@sage/x3-stock/pages_creation_error_connexion_webservice_contact_administrator',
                            'An error has occurred (connection or webservice error). Please contact your administrator.',
                        ),
                        options,
                    )
                ) {
                    await this.$.router.refresh();
                } else {
                    await this.$.router.emptyPage();
                    this.$.router.goTo('@sage/x3-stock/MobilePickTicket');
                }
                return;
            } else {
                const _messages = <string[]>[];
                const _results = <any>result;
                let _diagnoses = _results?.diagnoses;
                if (_diagnoses?.length > 1) {
                    _diagnoses = _diagnoses.splice(0, _diagnoses.length - 1);
                }

                (
                    (_results?.errors
                        ? _results.errors[0]?.extensions?.diagnoses
                        : (_results?.innerError?.errors[0]?.extensions?.diagnoses ??
                          _results.extensions?.diagnoses ??
                          _diagnoses)) ?? []
                )
                    .filter((d: { severity: number; message: any }) => d.severity > 2 && d.message)
                    .forEach((d: { message: any }) => {
                        const _message = d.message.split(`\n`);
                        _messages.push(..._message);
                    });

                const _result = _messages.length ? <string[]>_messages : <string[]>result.message.split(`\n`);

                message = `**${ui.localize(
                    '@sage/x3-stock/pages__mobile_pick_ticket_line__notification__update_error',
                    'An error has occurred',
                )}**\n\n`;

                if (_result.length === 1) {
                    message += `${_result[0]}`;
                } else {
                    message += _result.map(item => `* ${item}`).join('\n');
                }

                if (result instanceof Error) {
                    this.$.loader.isHidden = true;
                }
            }

            await this.$.sound.error();
            if (
                await dialogConfirmation(
                    this,
                    'error',
                    ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                    message,
                    options,
                )
            ) {
                return;
            }
            await this.$.router.emptyPage();
            this.$.router.goTo('@sage/x3-stock/MobilePickTicket');
        } else {
            this.$.storage.remove(MobilePickTicketViewPickTicketLineGlobal.PICK_TICKET_LINE_KEY);

            if (isLastLine) {
                await dialogMessage(
                    this,
                    'info',
                    ui.localize('@sage/x3-stock/dialog-information-title', 'Information'),
                    isNotSetDelivrable
                        ? ui.localize(
                              '@sage/x3-stock/dialog-message-pick-ticket-has-been-submitted-but-not-set-as-deliverable',
                              'The pick ticket has been updated but it is not set as deliverable.',
                          )
                        : isDeliverable
                          ? ui.localize(
                                '@sage/x3-stock/dialog-message-pick-ticket-is-deliverable',
                                'The pick ticket is now set as deliverable.',
                            )
                          : ui.localize(
                                '@sage/x3-stock/dialog-message-pick-ticket-not-deliverable',
                                'The pick ticket is not set as deliverable.',
                            ),
                );
            }

            this.$.setPageClean();
            await this.$.sound.success();

            if (isLastLine && isLastTicket) {
                this.$.router.goTo('@sage/x3-stock/MobilePickTicket');
            } else if (this.pickList.value === '') {
                this.$.router.goTo('@sage/x3-stock/MobilePickTicketSelectFromTicket', {
                    mobileSettings: JSON.stringify(this._mobileSettings),
                });
            } else {
                this.$.router.goTo('@sage/x3-stock/MobilePickTicketSelectFromList', {
                    mobileSettings: JSON.stringify(this._mobileSettings),
                });
            }
        }
    }

    private async _callProcessPickAPI(isDeliverable: boolean, isShortPick: boolean): Promise<any> {
        this.$.loader.isHidden = false;

        const _packingUnit: (string | undefined)[] = [];
        const _packingUnitToStockUnitConversionFactor: (number | undefined)[] = [];
        const _quantityInPackingUnit: (number | undefined)[] = [];
        const _quantityInStockUnit: (number | undefined)[] = [];
        const _location: (string | undefined)[] = [];
        const _lot: (string | undefined)[] = [];
        const _sublot: (string | undefined)[] = [];
        const _serialNumber: (string | undefined)[] = [];
        const _status: (string | undefined)[] = [];
        const _stockId: (number | undefined)[] = [];
        this._pickStockLines.forEach(pickStockLine => {
            _packingUnit.push(pickStockLine.packingUnit);
            _packingUnitToStockUnitConversionFactor.push(pickStockLine.packingUnitToStockUnitConversionFactor);
            _quantityInPackingUnit.push(pickStockLine.quantityInPackingUnit);
            _quantityInStockUnit.push(pickStockLine.quantityInStockUnit);
            _location.push(pickStockLine.location);
            _lot.push(pickStockLine.lot);
            _sublot.push(pickStockLine.sublot);
            _serialNumber.push(pickStockLine.serialNumber);
            _status.push(pickStockLine.status);
            _stockId.push(pickStockLine.stockId);
        });

        const pickTicketArgs: any = {
            entryTransaction: this.transaction.value,
            pickTicket: this._pickTicketLine.pickTicket,
            pickTicketLine: this._pickTicketLine.pickTicketLine,
            destinationLocation: this.locationDestination.value ? this.locationDestination.value.code : '',
            product: this.product.value?.code,
            shortPick: isShortPick,
            deliverable: isDeliverable,
            documentDestination: (this.$.storage.get('mobile-document-destination') as string) ?? '',
            packingUnit: _packingUnit,
            packingUnitToStockUnitConversionFactor: _packingUnitToStockUnitConversionFactor,
            quantityInPackingUnit: _quantityInPackingUnit,
            quantityInStockUnit: _quantityInStockUnit,
            location: _location,
            lot: _lot,
            sublot: _sublot,
            serialNumber: _serialNumber,
            status: _status,
            stockId: _stockId,
            customBoolean: this.customBoolean.value ? this.customBoolean.value : null,
            customDecimal: this.customDecimal.value ? this.customDecimal.value : null,
            customString: this.customString.value ? this.customString.value : null,
            customDate: this.customDate.value ? this.customDate.value : null,
        };

        try {
            return await this.$.graph
                .node('@sage/x3-stock/PickTicketLine')
                .mutations.updatePickTicketLine(
                    { pickTicket: true, pickTicketLine: true },
                    { parameters: pickTicketArgs },
                )
                .execute();
        } catch (error) {
            return error;
        }
    }
}
