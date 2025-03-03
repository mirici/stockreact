import { Product, ProductSite, SerialNumberManagement, StockManagement } from '@sage/x3-master-data-api';
import { dialogConfirmation, dialogMessage } from '@sage/x3-master-data/lib/client-functions/dialogs';
import { GraphApi } from '@sage/x3-stock-api';
import { Location, LotManagementMode, MobileSettings, SerialNumber, Stock } from '@sage/x3-stock-data-api';
import { AggregateGroupSelector, AggregateValuesSelector, Filter, aggregateEdgesSelector } from '@sage/xtrem-client';
import * as ui from '@sage/xtrem-ui';
import { validateWithDetails } from '../client-functions/control';
import { NotifyAndWait } from '../client-functions/display';

interface Picks {
    detailedAllocation?: number;
    allocatedQuantity?: number;
    shortageQuantity?: number;
    adcPickedLine?: number;
    shortPick?: boolean;
    stockUnit?: string;
    quantityInStockUnit?: number;
    quantityInPackingUnit?: number;
    packingUnit?: string;
    packingUnitCode: string;
    packingUnitToStockUnitConversionFactor?: number;
    stockId?: number;
    location?: string;
    lot?: string;
    sublot?: string;
    status?: string;
    serialNumber?: string;
    confirmed?: number;
    licensePlateNumber: string | null;
    identifier1?: string;
    identifier2?: string;
}
interface PickLines {
    quantityInStockUnit?: number;
    stockId?: number;
    location?: string;
    lot?: string;
    sublot?: string;
    status?: string;
    serialNumber?: string;
    quantityInPackingUnit?: number;
    packingUnitToStockUnitConversionFactor?: number;
    packingUnit: string;
    licensePlateNumber?: string;
    identifier1?: string;
    identifier2?: string;
}

interface UnitsOfMeasure {
    unit: string;
    numberOfDecimals?: number;
    unitToStockUnitConversionFactor?: number;
    isPackingFactorEntryAllowed?: boolean;
}

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

@ui.decorators.page<MobilePickTicketViewPickTicketLine>({
    title: 'Pick ticket',
    subtitle: 'Enter line details',
    mode: 'default',
    isTransient: true,
    isTitleHidden: true,
    headerCard() {
        return {
            title: this.pickTicket,
            titleRight: this.pickTicketLine,
            line2: this.product,
            line2Right: this.localizedDescription1,
            line3: this.textQuantityToBePicked,
            line3Right: this.displayQuantityToBePicked,
        };
    },
    async onLoad() {
        let ticketLine = this.$.storage.get(MobilePickTicketViewPickTicketLine.PICK_TICKET_LINE_KEY);
        if (ticketLine) {
            await this._init();
            if (this._allPicks.length <= 1) {
                this.nextButton.isDisabled = true;
            }
            await this._displayPick();
        } else {
            this._disablePage();
        }
    },
    businessActions() {
        return [this.pickButton, this.nextButton, this.shortageButton, this.chooseStockButton];
    },
})
export class MobilePickTicketViewPickTicketLine extends ui.Page<GraphApi> {
    /*
     *
     *  Technical properties
     *
     */
    private _notifier = new NotifyAndWait(this);
    private _allPicks: Picks[];
    private _pickLines: PickLines[];
    private _productSite: ProductSite;
    private _product: Product;
    private _unitsOfMeasure: UnitsOfMeasure[];
    private _lotManagementMode: LotManagementMode;
    private _serialNumberManagementMode: SerialNumberManagement;
    private _stockManagementMode: StockManagement;
    private _isLocationManaged: boolean;
    private _isLicensePlateNumberManaged: boolean;
    private _isNegativeStockAuthorized: boolean;
    private _mobileSettings: MobileSettings;
    private _unitStockNumberOfDecimals: Number;
    currentPick: number;
    confirmedPicks: number;
    numberOfPicks: number;
    newPick: boolean;
    shortPick: boolean;

    /*
     *  Technical fields
     */
    private static readonly TRANSACTION_KEY: string = 'mobile-pick-ticket-entry-transaction';
    private static readonly DESTINATION_KEY: string = 'mobile-pick-ticket-destination-location';
    private static readonly DESTINATION_DISPLAY_KEY: string = 'mobile-pick-ticket-destination-location-display';
    private static readonly PICK_LIST_KEY: string = 'mobile-pick-ticket-pick-list';
    private static readonly PICK_TICKET_KEY: string = 'mobile-pick-ticket';
    private static readonly PICK_TICKET_LINE_KEY: string = 'mobile-pick-ticket-line';
    private static readonly PICK_TICKET_LINE_TEXT: string = 'mobile-pick-ticket-line-text';

    @ui.decorators.textField<MobilePickTicketViewPickTicketLine>({
        isDisabled: true,
    })
    stockSite: ui.fields.Text;

    @ui.decorators.textField<MobilePickTicketViewPickTicketLine>({
        isDisabled: true,
    })
    transaction: ui.fields.Text;

    @ui.decorators.textField<MobilePickTicketViewPickTicketLine>({
        isDisabled: true,
    })
    pickList: ui.fields.Text;

    /*
     *  Page Actions
     */
    @ui.decorators.pageAction<MobilePickTicketViewPickTicketLine>({
        title: 'Submit',
        shortcut: ['f2'],
        buttonType: 'primary',
        async onClick() {
            await this.onSubmit(false);
        },
    })
    pickButton: ui.PageAction;

    @ui.decorators.pageAction<MobilePickTicketViewPickTicketLine>({
        title: 'Next',
        shortcut: ['f3'],
        buttonType: 'secondary',
        async onClick() {
            await this.$.commitValueAndPropertyChanges();
            await this._nextPick();
        },
    })
    nextButton: ui.PageAction;

    @ui.decorators.pageAction<MobilePickTicketViewPickTicketLine>({
        title: 'Shortage',
        shortcut: ['f4'],
        buttonType: 'secondary',
        isDisabled: true,
        async onClick() {
            await this.onSubmit(true);
        },
    })
    shortageButton: ui.PageAction;

    @ui.decorators.pageAction<MobilePickTicketViewPickTicketLine>({
        title: 'Choose stock',
        shortcut: ['f2'],
        buttonType: 'secondary',
        async onClick() {
            const pickStockLines: PickStockLine[] = this._allPicks
                .filter(allPick => allPick.confirmed)
                .map(allPick => {
                    return {
                        packingUnit: allPick.packingUnit,
                        quantityInPackingUnit: allPick.quantityInPackingUnit,
                        packingUnitToStockUnitConversionFactor: allPick.packingUnitToStockUnitConversionFactor,
                        quantityInStockUnit: allPick.quantityInStockUnit,
                        location: allPick.location,
                        lot: allPick.lot,
                        sublot: allPick.sublot,
                        serialNumber: allPick.serialNumber,
                        status: allPick.status,
                        stockId: allPick.stockId,
                    };
                });
            this.packingUnit.isDirty = false;
            this.quantityInPackingUnit.isDirty = false;
            this.packingUnitToStockUnitConversionFactor.isDirty = false;
            this.stockUnit.isDirty = false;
            this.quantityInStockUnit.isDirty = false;
            this.licensePlateNumber.isDirty = false;
            this.location.isDirty = false;
            this.lot.isDirty = false;
            this.sublot.isDirty = false;
            this.serialNumber.isDirty = false;
            this.serialNumberReceived.isDirty = false;
            this.status.isDirty = false;
            this.identifier1.isDirty = false;
            this.identifier2.isDirty = false;
            this.destinationLocation.isDirty = false;
            this.$.router.goTo(`@sage/x3-stock/MobilePickTicketViewPickTicketLineGlobal`, {
                _id: `${this.product.value}|${String(this.$.storage.get('mobile-selected-stock-site'))}`,
                mobileSettings: JSON.stringify(this._mobileSettings),
                pickStockLines: JSON.stringify(pickStockLines),
            });
        },
    })
    chooseStockButton: ui.PageAction;

    /*
     *  Sections
     */
    @ui.decorators.section<MobilePickTicketViewPickTicketLine>({
        isTitleHidden: true,
    })
    mainSection: ui.containers.Section;

    /*
     *  Blocks
     */
    @ui.decorators.block<MobilePickTicketViewPickTicketLine>({
        parent() {
            return this.mainSection;
        },
        isTitleHidden: true,
    })
    detailBlock: ui.containers.Block;

    @ui.decorators.block<MobilePickTicketViewPickTicketLine>({
        parent() {
            return this.mainSection;
        },
        title: 'Stock picked',
    })
    stockPickedBlock: ui.containers.Block;

    @ui.decorators.block<MobilePickTicketViewPickTicketLine>({
        parent() {
            return this.mainSection;
        },
        title: 'To location',
    })
    destinationBlock: ui.containers.Block;

    /*
     *  Fields
     */
    @ui.decorators.textField<MobilePickTicketViewPickTicketLine>({
        title: 'Pick ticket',
        isReadOnly: true,
    })
    pickTicket: ui.fields.Text;

    @ui.decorators.textField<MobilePickTicketViewPickTicketLine>({
        title: 'Line',
        isReadOnly: true,
    })
    pickTicketLine: ui.fields.Text;

    @ui.decorators.textField<MobilePickTicketViewPickTicketLine>({
        title: 'Product',
        isReadOnly: true,
    })
    product: ui.fields.Text;

    @ui.decorators.textField<MobilePickTicketViewPickTicketLine>({
        isReadOnly: true,
    })
    localizedDescription1: ui.fields.Text;

    @ui.decorators.textField<MobilePickTicketViewPickTicketLine>({
        title: 'Line quantity in stock unit',
        isReadOnly: true,
    })
    displayQuantityToBePicked: ui.fields.Text;

    @ui.decorators.textField<MobilePickTicketViewPickTicketLine>({
        title: 'Line quantity in stock unit',
        isReadOnly: true,
    })
    textQuantityToBePicked: ui.fields.Text;

    /*
     *  Detail block
     */

    @ui.decorators.textField<MobilePickTicketViewPickTicketLine>({
        isReadOnly: true,
        parent() {
            return this.detailBlock;
        },
        isFullWidth: true,
    })
    displayQuantityPicked: ui.fields.Text;

    @ui.decorators.numericField<MobilePickTicketViewPickTicketLine>({
        parent() {
            return this.detailBlock;
        },
        title: 'Quantity to pick',
        isReadOnly: true,
        isFullWidth: false,
        isHidden: true,
    })
    quantityToPick: ui.fields.Numeric;

    @ui.decorators.numericField<MobilePickTicketViewPickTicketLine>({
        parent() {
            return this.detailBlock;
        },
        title: 'Quantity picked',
        isReadOnly: true,
        isFullWidth: false,
        isHidden: true,
    })
    quantityPicked: ui.fields.Numeric;

    @ui.decorators.dropdownListField<MobilePickTicketViewPickTicketLine>({
        parent() {
            return this.stockPickedBlock;
        },
        title: 'PAC Unit',
        isMandatory: true,
        async onChange() {
            if (this.packingUnit.value) {
                let pos = 0;
                let oldConversionFactor = this.packingUnitToStockUnitConversionFactor.value;
                const selectedValue = this.packingUnit.value;
                pos = this._unitsOfMeasure
                    .map(function (e) {
                        return e.unit;
                    })
                    .indexOf(selectedValue);
                if (pos !== -1) {
                    this.quantityInPackingUnit.scale = this._unitsOfMeasure[pos].numberOfDecimals;
                    this.packingUnitToStockUnitConversionFactor.value =
                        this._unitsOfMeasure[pos].unitToStockUnitConversionFactor;
                    if (this.currentPackingUnitCode.value == this.stockUnit.value) {
                        this.quantityInPackingUnit.value =
                            this.quantityInPackingUnit.value / this.packingUnitToStockUnitConversionFactor.value;
                    } else {
                        if (this.packingUnit.value == this.stockUnit.value) {
                            this.quantityInPackingUnit.value = this.quantityInPackingUnit.value * oldConversionFactor;
                        } else {
                            this.quantityInPackingUnit.value =
                                (this.quantityInPackingUnit.value * oldConversionFactor) /
                                this.packingUnitToStockUnitConversionFactor.value;
                        }
                    }
                    let unroundedQuantity = this.quantityInPackingUnit.value;
                    this.quantityInPackingUnit.value = Number.parseFloat(
                        this.quantityInPackingUnit.value.toFixed(this._unitsOfMeasure[pos].numberOfDecimals),
                    );
                    if (this.quantityInPackingUnit.value - unroundedQuantity > 0) {
                        switch (this._unitsOfMeasure[pos].numberOfDecimals) {
                            case 0:
                                this.quantityInPackingUnit.value = this.quantityInPackingUnit.value - 1;
                                break;
                            case 1:
                                this.quantityInPackingUnit.value = this.quantityInPackingUnit.value - 0.1;
                                break;
                            case 2:
                                this.quantityInPackingUnit.value = this.quantityInPackingUnit.value - 0.01;
                                break;
                            case 3:
                                this.quantityInPackingUnit.value = this.quantityInPackingUnit.value - 0.001;
                                break;
                            case 4:
                                this.quantityInPackingUnit.value = this.quantityInPackingUnit.value - 0.0001;
                                break;
                            case 5:
                                this.quantityInPackingUnit.value = this.quantityInPackingUnit.value - 0.00001;
                                break;
                            case 6:
                                this.quantityInPackingUnit.value = this.quantityInPackingUnit.value - 0.000001;
                                break;
                        }
                    }

                    this.quantityInStockUnit.value = Number.parseFloat(
                        (this.quantityInPackingUnit.value * this.packingUnitToStockUnitConversionFactor.value).toFixed(
                            this._unitsOfMeasure[pos].numberOfDecimals,
                        ),
                    );
                    this.packingUnitToStockUnitConversionFactor.isDisabled =
                        this.packingUnit.value === this.stockUnit.value ||
                        !this._unitsOfMeasure[pos].isPackingFactorEntryAllowed;
                    this.currentPackingUnitCode.value = selectedValue;
                    this._computeQuantityMax();
                } else {
                    this.packingUnit.value = this.currentPackingUnitCode.value;
                }
            }
            this.shortageButton.isDisabled = this.quantityInPackingUnit.value !== 0;
        },
    })
    packingUnit: ui.fields.DropdownList;

    @ui.decorators.numericField<MobilePickTicketViewPickTicketLine>({
        parent() {
            return this.stockPickedBlock;
        },
        title: 'PAC Qty',
        isMandatory: true,
        isFullWidth: false,
        validation: /^([0-9]*(\.[0-9]+)?|[0]+\.[0-9]*[1-9][0-9]*)$/, // reg ex for any positive numbers (integers or decimals)
        min: 0,
        scale() {
            const pos = this._unitsOfMeasure
                .map(function (e) {
                    return e.unit;
                })
                .indexOf(this.stockUnit?.value);
            return this._unitsOfMeasure[pos]?.numberOfDecimals ?? 0;
        },
        onChange() {
            if (this.quantityInPackingUnit.value != null) {
                let pos = this._unitsOfMeasure
                    .map(function (e) {
                        return e.unit;
                    })
                    .indexOf(this.stockUnit.value);
                // Calculate the new stock quantity
                let newStockUnitQuantity = Number.parseFloat(
                    (this.quantityInPackingUnit.value * this.packingUnitToStockUnitConversionFactor.value).toFixed(
                        this._unitsOfMeasure[pos].numberOfDecimals,
                    ),
                );
                if (
                    this.quantityInStockUnit.max === undefined ||
                    newStockUnitQuantity <= this.quantityInStockUnit.max
                ) {
                    this.quantityInStockUnit.value = newStockUnitQuantity;
                }
            }
            this.shortageButton.isDisabled = this.quantityInPackingUnit.value !== 0;
        },
    })
    quantityInPackingUnit: ui.fields.Numeric;

    @ui.decorators.numericField<MobilePickTicketViewPickTicketLine>({
        parent() {
            return this.stockPickedBlock;
        },
        title: 'Conversion factor',
        isMandatory: true,
        scale: 6,
        validation: /^([1-9][0-9]*(\.[0-9]+)?|[0]+\.[0-9]*[1-9][0-9]*)$/, // reg ex for any positive numbers (integers or decimals) except 0
        min: 0.000001,
        isFullWidth: true,
        onChange() {
            if (this.packingUnitToStockUnitConversionFactor.value) {
                let pos = this._unitsOfMeasure
                    .map(function (e) {
                        return e.unit;
                    })
                    .indexOf(this.stockUnit.value);
                let oldQuantityInStockUnit = this.quantityInStockUnit.value;
                this.quantityInStockUnit.value = Number.parseFloat(
                    (this.quantityInPackingUnit.value * this.packingUnitToStockUnitConversionFactor.value).toFixed(
                        this._unitsOfMeasure[pos].numberOfDecimals,
                    ),
                );
                if (this.quantityInStockUnit.value + this.quantityPicked.value > this.quantityToPick.value) {
                    this.$.removeToasts();
                    this.$.showToast(
                        ui.localize(
                            '@sage/x3-stock/dialog-error-quantity-pick',
                            'Quantity greater than quantity to be picked',
                        ),
                        { type: 'error' },
                    );
                    this.quantityInStockUnit.value = oldQuantityInStockUnit;
                    this.packingUnitToStockUnitConversionFactor.focus();
                }
                this._computeQuantityMax();
            }
            this.shortageButton.isDisabled = this.quantityInPackingUnit.value !== 0;
        },
    })
    packingUnitToStockUnitConversionFactor: ui.fields.Numeric;

    @ui.decorators.textField<MobilePickTicketViewPickTicketLine>({
        parent() {
            return this.stockPickedBlock;
        },
        isHidden: true,
    })
    currentPackingUnitCode: ui.fields.Text;

    @ui.decorators.textField<MobilePickTicketViewPickTicketLine>({
        title: 'Stock unit',
        isReadOnly: true,
        parent() {
            return this.stockPickedBlock;
        },
    })
    stockUnit: ui.fields.Text;

    @ui.decorators.numericField<MobilePickTicketViewPickTicketLine>({
        parent() {
            return this.stockPickedBlock;
        },
        title: 'Stock quantity',
        isMandatory: true,
        isFullWidth: false,
        validation: /^([0-9]*(\.[0-9]+)?|[0]+\.[0-9]*[1-9][0-9]*)$/, // reg ex for any positive numbers (integers or decimals)
        min: 0,
        scale() {
            const pos = this._unitsOfMeasure
                .map(function (e) {
                    return e.unit;
                })
                .indexOf(String(this.currentPackingUnitCode.value) ?? '');
            return this._unitsOfMeasure[pos]?.numberOfDecimals ?? 0;
        },
        onChange() {
            if (
                this.quantityInStockUnit.value != null &&
                this.quantityInStockUnit.value <= this.quantityInStockUnit.max
            ) {
                if (this.packingUnitToStockUnitConversionFactor.value > 0) {
                    let pos = this._unitsOfMeasure
                        .map(function (e) {
                            return e.unit;
                        })
                        .indexOf(this.currentPackingUnitCode.value);
                    this.quantityInPackingUnit.value =
                        this.quantityInStockUnit.value / this.packingUnitToStockUnitConversionFactor.value;
                    this.quantityInPackingUnit.value = Number.parseFloat(
                        this.quantityInPackingUnit.value.toFixed(this._unitsOfMeasure[pos].numberOfDecimals),
                    );
                }
            }
            this.shortageButton.isDisabled = this.quantityInStockUnit.value !== 0;
        },
    })
    quantityInStockUnit: ui.fields.Numeric;

    @ui.decorators.textField<MobilePickTicketViewPickTicketLine>({
        title: 'License Plate Number',
        isReadOnly: true,
        isFullWidth: true,
        parent() {
            return this.stockPickedBlock;
        },
    })
    licensePlateNumber: ui.fields.Text;

    @ui.decorators.referenceField<MobilePickTicketViewPickTicketLine, Location>({
        parent() {
            return this.stockPickedBlock;
        },
        title: 'Location',
        placeholder: 'Scan or select...',
        node: '@sage/x3-stock-data/Location',
        valueField: 'code',
        isAutoSelectEnabled: true,
        minLookupCharacters: 1,
        isFullWidth: true,
        isMandatory: true,
        canFilter: false,
        filter() {
            return {
                stockSite: { code: this.stockSite.value },
                stock: {
                    _atLeast: 1,
                    product: {
                        product: { code: this.product.value },
                    },
                },
            };
        },
        columns: [
            ui.nestedFields.text({
                bind: 'code',
                title: 'Code',
                isReadOnly: true,
            }),
            ui.nestedFields.text({
                bind: 'type',
                title: 'Type',
                isReadOnly: true,
            }),
            // (X3-227347) TODO Obsolete: Having to specify & hide fields used in filter that don't need to be displayed
            ui.nestedFields.reference({
                node: '@sage/x3-system/Site',
                bind: 'stockSite',
                valueField: 'code',
                isHidden: true,
            }),
        ],
        async onChange() {
            if (await this.location.value?.code) {
                if (!(await this._validateStock(this.location?.title ?? ''))) {
                    this.location.focus();
                } else {
                    this.location.getNextField(true)?.focus();
                }
            }
        },
    })
    location: ui.fields.Reference;

    @ui.decorators.referenceField<MobilePickTicketViewPickTicketLine, Stock>({
        parent() {
            return this.stockPickedBlock;
        },
        title: 'Lot',
        isMandatory: true,
        isFullWidth: true,
        isAutoSelectEnabled: true,
        placeholder: 'Scan or select…',
        node: '@sage/x3-stock-data/Stock',
        valueField: 'lot',
        canFilter: false,
        filter() {
            const filter: Filter<Stock> = {
                stockSite: { code: this.stockSite.value },
                product: { product: { code: this.product.value } },
                isBeingCounted: false,
            };
            if (this.location.value?.code) {
                filter.location = { code: this.location.value.code };
            }
            if (this.sublot.value?.sublot) {
                filter.sublot = this.sublot.value.sublot;
            }
            return filter;
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
            ui.nestedFields.reference({
                node: '@sage/x3-stock-data/StockStatus',
                bind: 'status',
                valueField: 'code',
                isHidden: true,
            }),
            ui.nestedFields.text({
                bind: 'identifier1',
                title: 'Identifier 1',
                isHidden: true,
            }),
            ui.nestedFields.text({
                bind: 'identifier2',
                title: 'Identifier 2',
                isHidden: true,
            }),
            ui.nestedFields.numeric({
                bind: 'stockId',
                title: 'Stock Id',
                isHidden: true,
            }),
        ],
        async onChange() {
            if (await this.lot.value?.lot) {
                if (!this.sublot.isHidden) {
                    this.sublot.value = { sublot: this.lot.value.sublot };
                }
                if (!(await this._validateStock(this.lot.title))) {
                    this.lot.value = null;
                    if (!this.sublot.isHidden) {
                        this.sublot.value = null;
                    }
                    this.lot.focus();
                } else {
                    this.lot.getNextField(true)?.focus();
                }
            } else {
                this.lot.value = null;
                if (!this.sublot.isHidden) {
                    this.sublot.value = null;
                }
            }
        },
    })
    lot: ui.fields.Reference;

    @ui.decorators.referenceField<MobilePickTicketViewPickTicketLine, Stock>({
        parent() {
            return this.stockPickedBlock;
        },
        title: 'Sublot',
        isMandatory: true,
        isFullWidth: true,
        isAutoSelectEnabled: true,
        placeholder: 'Scan or select a sublot',
        node: '@sage/x3-stock-data/Stock',
        valueField: 'sublot',
        canFilter: false,
        filter() {
            const filter: Filter<Stock> = {
                stockSite: { code: this.stockSite.value },
                product: { product: { code: this.product.value } },
                isBeingCounted: false,
            };
            if (this.lot.value?.lot) {
                filter.lot = this.lot.value.lot;
            }
            if (this.location.value?.code) {
                filter.location = { code: this.location.value.code };
            }
            return filter;
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
            ui.nestedFields.reference({
                node: '@sage/x3-stock-data/StockStatus',
                bind: 'status',
                valueField: 'code',
                isHidden: true,
            }),
            ui.nestedFields.text({
                bind: 'identifier1',
                title: 'Identifier 1',
                isHidden: true,
            }),
            ui.nestedFields.text({
                bind: 'identifier2',
                title: 'Identifier 2',
                isHidden: true,
            }),
            ui.nestedFields.numeric({
                bind: 'stockId',
                title: 'Stock Id',
                isHidden: true,
            }),
        ],
        async onChange() {
            if (await this.sublot.value?.sublot) {
                if (!(await this._validateStock(this.sublot.title))) {
                    this.sublot.value = null;
                    this.sublot.focus();
                } else {
                    this.sublot.getNextField(true)?.focus();
                }
            }
        },
    })
    sublot: ui.fields.Reference;

    @ui.decorators.referenceField<MobilePickTicketViewPickTicketLine, SerialNumber>({
        parent() {
            return this.stockPickedBlock;
        },
        title: 'Serial number',
        isMandatory: true,
        isFullWidth: true,
        isAutoSelectEnabled: true,
        placeholder: 'Scan a serial number',
        node: '@sage/x3-stock-data/SerialNumber',
        valueField: 'code',
        canFilter: false,
        filter() {
            const filter: Filter<SerialNumber> = {
                product: { code: this.product.value },
                stockSite: { code: this.stockSite.value },
            };
            if (this.location.value?.code) {
                filter.stockLine = { location: { code: this.location.value.code } };
            }
            return filter;
        },
        columns: [
            ui.nestedFields.text({
                bind: 'code',
                title: 'Serial number',
                isReadOnly: true,
            }),
            ui.nestedFields.reference({
                node: '@sage/x3-stock-data/Stock',
                bind: 'stockLine',
                valueField: 'status.code',
                isHidden: false,
            }),
            ui.nestedFields.numeric({
                bind: 'stockId',
                title: 'Stock Id',
                isHidden: true,
            }),
        ],
        async onChange() {
            if (await this.serialNumber.value?.code) {
                if (!(await this._validateStock(this.serialNumber.title, this.serialNumber.value.stockId))) {
                    this.serialNumber.value = null;
                    this.serialNumber.focus();
                } else {
                    this.serialNumber.getNextField(true)?.focus();
                }
            }
        },
    })
    serialNumber: ui.fields.Reference;

    @ui.decorators.referenceField<MobilePickTicketViewPickTicketLine, Stock>({
        parent() {
            return this.stockPickedBlock;
        },
        title: 'Serial number',
        isMandatory: true,
        isFullWidth: true,
        isAutoSelectEnabled: true,
        placeholder: 'Scan a serial number',
        node: '@sage/x3-stock-data/Stock',
        valueField: 'serialNumber',
        canFilter: false,
        filter() {
            const filter: Filter<Stock> = {
                stockSite: { code: this.stockSite.value },
                product: { product: { code: this.product.value } },
                isBeingCounted: false,
                allocatedQuantity: '0',
            };
            if (this.location.value?.code) {
                filter.location = { code: this.location.value.code };
            }
            if (this.lot.value?.lot) {
                filter.lot = this.lot.value.lot;
            }
            if (this.sublot.value?.sublot) {
                filter.sublot = this.sublot.value.sublot;
            }
            return filter;
        },
        columns: [
            ui.nestedFields.text({
                bind: 'serialNumber',
                title: 'Serial number',
                isReadOnly: true,
            }),
            ui.nestedFields.reference({
                node: '@sage/x3-stock-data/StockStatus',
                bind: 'status',
                valueField: 'code',
                isHidden: true,
            }),
            ui.nestedFields.text({
                bind: 'identifier1',
                title: 'Identifier 1',
                isHidden: true,
            }),
            ui.nestedFields.text({
                bind: 'identifier2',
                title: 'Identifier 2',
                isHidden: true,
            }),
            ui.nestedFields.numeric({
                bind: 'stockId',
                title: 'Stock Id',
                isHidden: true,
            }),
        ],
        async onChange() {
            if (await this.serialNumberReceived.value?.serialNumber) {
                if (!(await this._validateStock(this.serialNumberReceived.title))) {
                    this.serialNumberReceived.value = null;
                    this.serialNumberReceived.focus();
                } else {
                    this.serialNumberReceived.getNextField(true)?.focus();
                }
            }
        },
    })
    serialNumberReceived: ui.fields.Reference;

    @ui.decorators.selectField<MobilePickTicketViewPickTicketLine>({
        parent() {
            return this.stockPickedBlock;
        },
        title: 'Status',
        isMandatory: true,
        async onChange() {
            if (this.status.value) {
                if (!(await this._validateStock(this.status.title))) {
                    this.status.focus();
                } else {
                    this.status.getNextField(true)?.focus();
                }
            }
        },
    })
    status: ui.fields.Select;

    @ui.decorators.textField<MobilePickTicketViewPickTicketLine>({
        parent() {
            return this.stockPickedBlock;
        },
        title: 'Identifier 1',
    })
    identifier1: ui.fields.Text;

    @ui.decorators.textField<MobilePickTicketViewPickTicketLine>({
        parent() {
            return this.stockPickedBlock;
        },
        title: 'Identifier 2',
    })
    identifier2: ui.fields.Text;

    /*
     * Destination location block
     */
    @ui.decorators.referenceField<MobilePickTicketViewPickTicketLine, Location>({
        parent() {
            return this.destinationBlock;
        },
        title: 'Destination location',
        placeholder: 'Scan or select...',
        node: '@sage/x3-stock-data/Location',
        valueField: 'code',
        canFilter: false,
        isAutoSelectEnabled: true,
        isTitleHidden: true,
        filter() {
            return {
                stockSite: { code: this.stockSite.value },
                category: 'internal',
                isBlocked: { _eq: false },
                isBeingCounted: { _eq: false },
            };
        },
        columns: [
            ui.nestedFields.text({
                bind: 'code',
                title: 'Code',
                isReadOnly: true,
            }),
            ui.nestedFields.text({
                bind: 'type',
                title: 'Type',
                isReadOnly: true,
            }),
        ],
        minLookupCharacters: 1,
        isMandatory: false,
        isFullWidth: true,
    })
    destinationLocation: ui.fields.Reference;

    /*
     * The following fields have been added to simplify customization by providing access to the details of the selected pick-ticket
     */
    @ui.decorators.textField<MobilePickTicketViewPickTicketLine>({
        isHidden: true,
        isReadOnly: true,
    })
    sourcePickTicketType: ui.fields.Text;

    @ui.decorators.textField<MobilePickTicketViewPickTicketLine>({
        isHidden: true,
        isReadOnly: true,
    })
    sourcePickTicket: ui.fields.Text;

    @ui.decorators.numericField<MobilePickTicketViewPickTicketLine>({
        isHidden: true,
        isReadOnly: true,
    })
    sourcePickTicketLine: ui.fields.Numeric;

    @ui.decorators.numericField<MobilePickTicketViewPickTicketLine>({
        isHidden: true,
        isReadOnly: true,
    })
    sourcePickTicketSequenceNumber: ui.fields.Numeric;

    @ui.decorators.numericField<MobilePickTicketViewPickTicketLine>({
        isHidden: true,
        isReadOnly: true,
    })
    sourcePickTicketSubcontractType: ui.fields.Numeric;

    @ui.decorators.textField<MobilePickTicketViewPickTicketLine>({
        isHidden: true,
        isReadOnly: true,
    })
    subcontractReorderLocation: ui.fields.Text;

    // technical fields for customization
    @ui.decorators.checkboxField<MobilePickTicketViewPickTicketLine>({
        parent() {
            return this.stockPickedBlock;
        },
        isHidden: true,
        isReadOnly: true,
        title: 'custom boolean',
    })
    customBoolean: ui.fields.Checkbox;
    @ui.decorators.numericField<MobilePickTicketViewPickTicketLine>({
        parent() {
            return this.stockPickedBlock;
        },
        isHidden: true,
        isReadOnly: true,
        title: 'custom decimal',
    })
    customDecimal: ui.fields.Numeric;
    @ui.decorators.textField<MobilePickTicketViewPickTicketLine>({
        parent() {
            return this.stockPickedBlock;
        },
        isHidden: true,
        isReadOnly: true,
        title: 'custom text',
    })
    customString: ui.fields.Text;
    @ui.decorators.dateField<MobilePickTicketViewPickTicketLine>({
        parent() {
            return this.stockPickedBlock;
        },
        isHidden: true,
        isReadOnly: true,
        title: 'custom date',
    })
    customDate: ui.fields.Date;

    private _disablePage(): void {
        this.nextButton.isHidden = true;
        this.pickButton.isHidden = true;
        this.shortageButton.isHidden = true;
        this.chooseStockButton.isHidden = true;
        this.quantityPicked.isHidden = true;
        this.quantityToPick.isHidden = true;
        this.quantityInPackingUnit.isHidden = true;
        this.quantityInStockUnit.isHidden = true;
        this.location.isHidden = true;
        this.lot.isHidden = true;
        this.sublot.isHidden = true;
        this.serialNumber.isHidden = true;
        this.serialNumberReceived.isHidden = true;
        this.packingUnit.isHidden = true;
        this.packingUnitToStockUnitConversionFactor.isHidden = true;
        this.status.isHidden = true;
        this.destinationLocation.isHidden = true;
        this.licensePlateNumber.isHidden = true;
        this.identifier1.isHidden = true;
        this.identifier2.isHidden = true;
        this.$.finish();
    }

    /*
     *  Init functions
     */

    private async _init() {
        /*
         * Retrieve storage parameters
         */

        this.pickTicket.value = this.$.storage.get(MobilePickTicketViewPickTicketLine.PICK_TICKET_KEY).toString();
        this.pickTicketLine.value = this.$.storage
            .get(MobilePickTicketViewPickTicketLine.PICK_TICKET_LINE_KEY)
            .toString();
        this.destinationLocation.isHidden =
            this.$.storage.get(MobilePickTicketViewPickTicketLine.DESTINATION_DISPLAY_KEY).toString() === '0'
                ? true
                : false;
        this.destinationLocation.value = {
            code: this.$.storage.get(MobilePickTicketViewPickTicketLine.DESTINATION_KEY).toString(),
        };
        this.stockSite.value = this.$.storage.get('mobile-selected-stock-site').toString();
        this.pickList.value = this.$.storage.get(MobilePickTicketViewPickTicketLine.PICK_LIST_KEY).toString();
        this.transaction.value = this.$.storage.get(MobilePickTicketViewPickTicketLine.TRANSACTION_KEY).toString();
        this._mobileSettings = JSON.parse(this.$.queryParameters?.mobileSettings as string);
        this._allPicks = [];
        this.confirmedPicks = 0;
        this.quantityToPick.value = 0;
        this.quantityPicked.value = 0;
        this.currentPick = 0;
        this.numberOfPicks = 0;
        this.newPick = false;
        this._unitsOfMeasure = [];
        this.status.options = await this._getStockStatus();
        if (this.pickTicket.value) {
            try {
                await this._initTicketLine(); // populate array of picks
            } catch (e) {
                ui.console.error(e);
            }
        }
        if (this._allPicks.length === 0) {
            await dialogMessage(
                this,
                'error',
                ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                ui.localize('@sage/x3-stock/dialog-error-pick-ticket-no-picks', 'No pick list to process.'),
            );
            this.$.finish();
        } else {
            try {
                this.packingUnit.options = await this._initUnits();
            } catch (e) {
                ui.console.error(e);
            }
        }
    }

    /*
     * Load All the Picks based on the Pick Ticket Line
     */
    private async _initTicketLine() {
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
                        sourcePickTicketType: true,
                        sourcePickTicket: true,
                        sourcePickTicketLine: true,
                        sourcePickTicketSequenceNumber: true,
                        sourcePickTicketSubcontractType: true,
                        subcontractReorderLocation: true,
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

        /*
         * Capture all the picks for the pick ticket line
         */
        let detailed = 0;
        const ticketLine = response.edges[0];
        this.product.value = ticketLine.node.product.code;
        this.localizedDescription1.value = ticketLine.node.product.localizedDescription1;
        this.stockUnit.value = ticketLine.node.stockUnit.code;
        this.quantityInPackingUnit.scale = ticketLine.node.packingUnit.numberOfDecimals;
        this.quantityInStockUnit.scale = ticketLine.node.stockUnit.numberOfDecimals;
        this.displayQuantityToBePicked.value =
            Number(ticketLine.node.quantityInStockUnit).toFixed(ticketLine.node.stockUnit.numberOfDecimals) +
            ' ' +
            this.stockUnit.value;
        this.textQuantityToBePicked.value = ui.localize('@sage/x3-stock/quantityToPick', 'Quantity to pick: ');
        this.displayQuantityPicked.value =
            ui.localize('@sage/x3-stock/pickedQuantity', 'Picked quantity: ') +
            Number(this.quantityPicked.value).toFixed(ticketLine.node.stockUnit.numberOfDecimals) +
            ' ' +
            this.stockUnit.value;
        this.sourcePickTicketType.value = ticketLine.node.sourcePickTicketType;
        this.sourcePickTicket.value = ticketLine.node.sourcePickTicket;
        this.sourcePickTicketLine.value = ticketLine.node.sourcePickTicketLine;
        this.sourcePickTicketSequenceNumber.value = ticketLine.node.sourcePickTicketSequenceNumber;
        this.sourcePickTicketSubcontractType.value = ticketLine.node.sourcePickTicketSubcontractType;
        this.subcontractReorderLocation.value = ticketLine.node.subcontractReorderLocation;

        await this._readProductData(ticketLine.node.product.code);

        if (this._product.stockManagementMode === 'notManaged') {
            this._lotManagementMode = this._product.lotManagementMode;
            this._serialNumberManagementMode = this._product.serialNumberManagementMode;
            this._isLocationManaged = false;
            this._stockManagementMode = this._product.stockManagementMode;
            this._isLicensePlateNumberManaged = false;
            this._isNegativeStockAuthorized = this._product.isNegativeStockAuthorized;
        } else {
            await this._readProductSiteData(ticketLine.node.product.code);
            this._lotManagementMode = this._productSite.product.lotManagementMode;
            this._serialNumberManagementMode = this._productSite.product.serialNumberManagementMode;
            this._isLocationManaged = this._productSite.isLocationManaged;
            this._stockManagementMode = this._productSite.product.stockManagementMode;
            this._isLicensePlateNumberManaged = this._productSite.isLicensePlateNumberManaged;
            this._isNegativeStockAuthorized = this._productSite.product.isNegativeStockAuthorized;
        }
        this.quantityToPick.value = Number(ticketLine.node.quantityInStockUnit);

        /*
         * Loop through the allocations for this ticket line and populate the picks array
         *
         */
        for (const lineAllocations of ticketLine.node.allocatedLines.query.edges) {
            if (String(lineAllocations.node.allocationType) != 'shortagesDetailed') {
                detailed = lineAllocations.node.stockLine ? 1 : 0;
                this._allPicks.push({
                    adcPickedLine: ticketLine.node.adcPickedLine,
                    detailedAllocation: detailed,
                    allocatedQuantity: Number(ticketLine.node.allocatedQuantity),
                    shortageQuantity: Number(ticketLine.node.shortageQuantity),
                    quantityInStockUnit: detailed
                        ? Number(lineAllocations.node.quantityInStockUnit)
                        : Number(ticketLine.node.quantityInStockUnit),
                    stockId: Number(lineAllocations.node.stockId),
                    packingUnit: detailed
                        ? lineAllocations.node.stockLine.packingUnit.code
                        : ticketLine.node.stockUnit.code,
                    packingUnitCode: detailed
                        ? lineAllocations.node.stockLine.packingUnit.code
                        : ticketLine.node.stockUnit.code,
                    packingUnitToStockUnitConversionFactor: detailed
                        ? Number(lineAllocations.node.stockLine.packingUnitToStockUnitConversionFactor)
                        : 1,
                    quantityInPackingUnit: detailed
                        ? Number.parseFloat(
                              Number(
                                  Number(lineAllocations.node.quantityInStockUnit) /
                                      Number(lineAllocations.node.stockLine.packingUnitToStockUnitConversionFactor),
                              ).toFixed(this.quantityInPackingUnit.scale),
                          )
                        : Number(ticketLine.node.quantityInStockUnit),
                    lot: detailed ? lineAllocations.node.stockLine.lot : null,
                    sublot: detailed ? lineAllocations.node.stockLine.sublot : null,
                    serialNumber: detailed
                        ? this._serialNumberManagementMode === 'globalReceivedIssued'
                            ? lineAllocations.node.serialNumber
                            : lineAllocations.node.stockLine.serialNumber
                        : null,
                    status: detailed ? lineAllocations.node.stockLine.status?.code : null,
                    location:
                        detailed && lineAllocations.node.stockLine.location
                            ? lineAllocations.node.stockLine.location?.code
                            : null,
                    confirmed: 0,
                    licensePlateNumber: detailed ? lineAllocations.node.stockLine.licensePlateNumber?.code : null,
                    identifier1: detailed ? lineAllocations.node.stockLine.identifier1 : null,
                    identifier2: detailed ? lineAllocations.node.stockLine.identifier2 : null,
                });
                this.numberOfPicks += 1;
            }
        }
        if (this.numberOfPicks === 0) {
            this._allPicks.push({
                adcPickedLine: ticketLine.node.adcPickedLine,
                detailedAllocation: 0,
                allocatedQuantity: Number(ticketLine.node.allocatedQuantity),
                shortageQuantity: Number(ticketLine.node.shortageQuantity),
                quantityInStockUnit: Number(ticketLine.node.quantityInStockUnit),
                stockId: 0,
                packingUnit: ticketLine.node.stockUnit?.code,
                packingUnitCode: ticketLine.node.stockUnit?.code,
                packingUnitToStockUnitConversionFactor: 1,
                quantityInPackingUnit: Number(ticketLine.node.quantityInStockUnit),
                lot: null,
                sublot: null,
                serialNumber: null,
                status: null,
                location: null,
                confirmed: 0,
                licensePlateNumber: null,
            });
            this.numberOfPicks += 1;
        }
    }

    /*
     * Get all the units for this product
     */
    private async _initUnits(): Promise<string[]> {
        this._unitsOfMeasure.push({
            unit: this._product.stockUnit.code,
            unitToStockUnitConversionFactor: 1,
            numberOfDecimals: this._product.stockUnit.numberOfDecimals,
            isPackingFactorEntryAllowed: false,
        });
        this.quantityToPick.scale =
            this.quantityPicked.scale =
            this.quantityInStockUnit.scale =
                this._product.stockUnit.numberOfDecimals;
        for (const packUnits of this._product.packingUnits.query.edges) {
            if (
                packUnits.node.packingUnit &&
                this._unitsOfMeasure.filter(unit => unit.unit == packUnits.node.packingUnit.code).length == 0
            ) {
                this._unitsOfMeasure.push({
                    unit: packUnits.node.packingUnit.code,
                    unitToStockUnitConversionFactor: Number(packUnits.node.packingUnitToStockUnitConversionFactor),
                    numberOfDecimals: packUnits.node.packingUnit.numberOfDecimals,
                    isPackingFactorEntryAllowed: true,
                });
            }
        }
        if (this.packingUnit.value === this.stockUnit.value) {
            this.quantityInPackingUnit.scale = this.quantityInStockUnit.scale;
        } else {
            let unitPosition = this._unitsOfMeasure
                .map(function (e) {
                    return e.unit;
                })
                .indexOf(this.packingUnit.value);
            if (unitPosition !== -1) {
                this.quantityInPackingUnit.scale = this._unitsOfMeasure[unitPosition].numberOfDecimals;
            }
        }

        return this._unitsOfMeasure.map((theUnits: any) => {
            return theUnits.unit;
        });
    }

    /*
     * Move to the next unconfirmed pick in the pick array
     */
    private async _nextPick(): Promise<void> {
        let startingPosition = this.currentPick;
        let lookForPicks = true;
        while (lookForPicks) {
            if (this._allPicks.length - 1 > this.currentPick) {
                this.currentPick += 1;
            } else {
                this.currentPick = 0;
            }
            if (this._allPicks[this.currentPick].confirmed === 0) {
                lookForPicks = false;
            }
            if (this.currentPick === startingPosition) {
                lookForPicks = false;
                this.nextButton.isDisabled = true;
            }
        }
        await this._displayPick();
        this.quantityInPackingUnit.focus();
    }

    /*
     * If they haven't picked the full quantity we need to create a new pick
     * for them to finish or to initiate a shortage
     */
    private _createNewPick(newQuantity: number) {
        this._allPicks.push({
            adcPickedLine: 0,
            detailedAllocation: 0,
            allocatedQuantity: 0,
            shortageQuantity: 0,
            stockUnit: this.stockUnit.value,
            stockId: 0,
            packingUnit: this.stockUnit.value,
            packingUnitCode: this.stockUnit.value,
            packingUnitToStockUnitConversionFactor: 1,
            quantityInStockUnit: Number.parseFloat(newQuantity.toFixed(this.quantityInStockUnit.scale)),
            quantityInPackingUnit: Number.parseFloat(newQuantity.toFixed(this.quantityInStockUnit.scale)),
            lot: null,
            sublot: null,
            serialNumber: null,
            status: null,
            location: null,
            confirmed: 0,
            licensePlateNumber: null,
        });
        this.numberOfPicks += 1;
        this.newPick = true;
        this.quantityInPackingUnit.scale = this.quantityInStockUnit.scale;
        this._computeQuantityMax();
    }

    private _computeQuantityMax() {
        this.quantityInStockUnit.max = this.quantityToPick.value - this.quantityPicked.value;
        if (this.packingUnit.value === this.stockUnit.value) {
            this.quantityInPackingUnit.max = this.quantityInStockUnit.max;
        } else {
            let unroundedMax = this.quantityInStockUnit.max / this.packingUnitToStockUnitConversionFactor.value;
            this.quantityInPackingUnit.max = Number.parseFloat(unroundedMax.toFixed(this.quantityInPackingUnit.scale));
        }
    }
    /*
     * Display current pick on the page (disabling/hiding when appropriate)
     */
    private async _displayPick(): Promise<void> {
        // reset old values X3-269771
        this.location.value = null;
        this.packingUnit.value = null;
        this.currentPackingUnitCode.value = null;
        this.packingUnitToStockUnitConversionFactor.value = null;
        this.lot.value = null;
        this.sublot.value = null;
        if (this._serialNumberManagementMode === 'receivedIssued') {
            this.serialNumberReceived.value = null;
        } else if (this._serialNumberManagementMode === 'globalReceivedIssued') {
            this.serialNumber.value = null;
        }
        this.status.value = null;
        this.identifier1.value = null;
        this.identifier2.value = null;
        await this.$.commitValueAndPropertyChanges();
        //
        const currentPick = this._allPicks[this.currentPick];
        this.location.value = currentPick.location ? { code: currentPick.location } : null;
        this.packingUnit.isReadOnly = false;
        this.packingUnit.value = this._allPicks[this.currentPick].packingUnit;
        this.currentPackingUnitCode.value = this._allPicks[this.currentPick].packingUnitCode;
        this.packingUnitToStockUnitConversionFactor.value =
            this._allPicks[this.currentPick].packingUnitToStockUnitConversionFactor;

        this.quantityInStockUnit.value = this._allPicks[this.currentPick].quantityInStockUnit;
        this.quantityInPackingUnit.value = this._allPicks[this.currentPick].quantityInPackingUnit;
        this.lot.value = this._allPicks[this.currentPick].lot ? { lot: this._allPicks[this.currentPick].lot } : null;
        this.sublot.value = this._allPicks[this.currentPick].sublot
            ? { sublot: this._allPicks[this.currentPick].sublot }
            : null;
        if (this._serialNumberManagementMode === 'receivedIssued') {
            this.serialNumberReceived.value = this._allPicks[this.currentPick].serialNumber
                ? { serialNumber: this._allPicks[this.currentPick].serialNumber }
                : null;
        } else if (this._serialNumberManagementMode === 'globalReceivedIssued') {
            this.serialNumber.value = this._allPicks[this.currentPick].serialNumber
                ? { code: this._allPicks[this.currentPick].serialNumber }
                : null;
        }
        if (this._allPicks[this.currentPick].status) {
            var index = this.status.options.indexOf(this._allPicks[this.currentPick].status);
            if (index >= 0) {
                this.status.value = this.status.options[index];
            }
        }
        if (!this.packingUnit.value) {
            this.packingUnitToStockUnitConversionFactor.value = 1;
            this.packingUnit.value = this.stockUnit.value;
        }
        this.licensePlateNumber.value = this._allPicks[this.currentPick].licensePlateNumber;
        this.identifier1.value = this._allPicks[this.currentPick].identifier1;
        this.identifier2.value = this._allPicks[this.currentPick].identifier2;
        this.shortageButton.isDisabled = this.quantityInPackingUnit.value !== 0;
        await this.$.commitValueAndPropertyChanges();
        if (this._stockManagementMode === 'notManaged') {
            this.location.isHidden = true;
            this.destinationLocation.isHidden = true;
            this.lot.isHidden = true;
            this.sublot.isHidden = true;
            this.serialNumber.isHidden = true;
            this.serialNumberReceived.isHidden = true;
            this.status.isHidden = true;
            this.licensePlateNumber.isHidden = true;
            this.identifier1.isHidden = true;
            this.identifier2.isHidden = true;
        } else {
            if (currentPick.detailedAllocation === 1) {
                this.lot.isReadOnly = true;
                this.sublot.isReadOnly = true;
                this.serialNumber.isReadOnly = true;
                this.serialNumberReceived.isReadOnly = true;
                this.status.isReadOnly = true;
                this.location.isReadOnly = true;
                this.packingUnit.isReadOnly = true;
                this.packingUnitToStockUnitConversionFactor.isReadOnly = true;
                this.identifier1.isReadOnly = true;
                this.identifier2.isReadOnly = true;
            } else {
                this.lot.isReadOnly = false;
                this.sublot.isReadOnly = false;
                this.serialNumber.isReadOnly = false;
                this.serialNumberReceived.isReadOnly = false;
                this.status.isReadOnly = false;
                this.location.isReadOnly = false;
                this.packingUnit.isReadOnly = false;
                this.packingUnitToStockUnitConversionFactor.isDisabled =
                    this.packingUnit.value === this.stockUnit.value;
            }
            this.lot.isHidden = this._lotManagementMode === 'notManaged';
            this.sublot.isHidden =
                this._lotManagementMode === 'notManaged' ||
                this._lotManagementMode === 'optionalLot' ||
                this._lotManagementMode === 'mandatoryLot';
            this.lot.isMandatory =
                this._lotManagementMode === 'mandatoryLot' || this._lotManagementMode === 'lotAndSublot';
            this.sublot.isMandatory = this.lot.isMandatory;
            this.serialNumber.isHidden =
                this._serialNumberManagementMode === 'notManaged' ||
                this._serialNumberManagementMode === 'issued' ||
                this._serialNumberManagementMode === 'receivedIssued';
            this.serialNumberReceived.isHidden =
                this._serialNumberManagementMode === 'notManaged' ||
                this._serialNumberManagementMode === 'issued' ||
                this._serialNumberManagementMode === 'globalReceivedIssued';
            this.location.isHidden = !this._isLocationManaged;
            this.licensePlateNumber.isHidden = !(
                currentPick.detailedAllocation === 1 && this._isLicensePlateNumberManaged
            );
            this.identifier1.isHidden = !(currentPick.detailedAllocation === 1 && this.identifier1.value);
            this.identifier2.isHidden = !(currentPick.detailedAllocation === 1 && this.identifier2.value);
        }
        if (this.confirmedPicks + 1 === this.numberOfPicks) {
            this.nextButton.isDisabled = true;
        }
        this._computeQuantityMax();
    }

    /*
     * Copy page values to the Pick array
     */
    private _updatePickFromPage() {
        this._allPicks[this.currentPick].location = this.location.value ? this.location.value.code : null;
        this._allPicks[this.currentPick].lot = this.lot.value ? this.lot.value.lot : null;
        this._allPicks[this.currentPick].sublot = this.sublot.value ? this.sublot.value.sublot : null;
        if (this._serialNumberManagementMode === 'globalReceivedIssued') {
            this._allPicks[this.currentPick].serialNumber = this.serialNumber.value
                ? this.serialNumber.value.code
                : null;
        } else {
            this._allPicks[this.currentPick].serialNumber = this.serialNumberReceived.value
                ? this.serialNumberReceived.value.serialNumber
                : null;
        }
        this._allPicks[this.currentPick].status = this.status.value;
        this._allPicks[this.currentPick].quantityInStockUnit = this.quantityInStockUnit.value;
        this._allPicks[this.currentPick].packingUnitCode = this.currentPackingUnitCode.value;
        this._allPicks[this.currentPick].packingUnit = this.packingUnit.value;
        this._allPicks[this.currentPick].packingUnitToStockUnitConversionFactor =
            this.packingUnitToStockUnitConversionFactor.value;
        this._allPicks[this.currentPick].quantityInPackingUnit = this.quantityInPackingUnit.value;
        this._allPicks[this.currentPick].identifier1 = this.identifier1.value;
        this._allPicks[this.currentPick].identifier2 = this.identifier2.value;
    }

    /*
     * Read the stock node to ensure there is some inventory for the entered details
     */
    private async _validateStock(pageField: string, stockId?: number): Promise<boolean | Error> {
        try {
            const stockFilter: any = {
                stockSite: this.stockSite.value,
                product: this.product.value,
            };
            if (stockId && stockId > 0) {
                stockFilter.stockId = stockId;
            }
            if (this.location.value && this.location.value.code) {
                stockFilter.location = this.location.value.code;
            }
            if (this.status.value) {
                stockFilter.status = this.status.value;
            }
            if (this.lot.value && this.lot.value.lot) {
                stockFilter.lot = this.lot.value.lot;
            }
            if (this.sublot.value && this.sublot.value.sublot) {
                stockFilter.sublot = this.sublot.value.sublot;
            }
            if (this.serialNumberReceived.value && this.serialNumberReceived.value.serialNumber) {
                stockFilter.serialNumber = this.serialNumberReceived.value.serialNumber;
            }

            const result = await this.$.graph
                .node('@sage/x3-stock-data/Stock')
                .query(
                    ui.queryUtils.edgesSelector(
                        {
                            product: {
                                product: {
                                    code: true,
                                },
                            },
                            packingUnit: {
                                code: true,
                            },
                            packingUnitToStockUnitConversionFactor: true,
                            status: {
                                code: true,
                            },
                            location: {
                                code: true,
                            },
                            lot: true,
                            sublot: true,
                            serialNumber: true,
                            identifier1: true,
                            identifier2: true,
                        },
                        {
                            filter: stockFilter,
                        },
                    ),
                )
                .execute();
            if (result.edges.length === 0) {
                if (pageField === this.location.title) {
                    this.location.value.code = null;
                } else if (pageField === this.status.title) {
                    this.status.value = null;
                } else if (pageField === this.lot.title) {
                    this.lot.value.lot = null;
                } else if (pageField === this.sublot.title) {
                    this.sublot.value.sublot = null;
                } else if (pageField === this.serialNumber.title && stockId && stockId > 0) {
                    this.serialNumber.value.code = null;
                } else if (pageField === this.serialNumber.title) {
                    this.serialNumberReceived.value.serialNumber = null;
                }
                this.$.removeToasts();
                this.$.showToast(
                    ui.localize('@sage/x3-stock/dialog-error-stock-availability', 'No stock matching the entry'),
                    { type: 'error' },
                );
                return false;
            }
            if (
                result.edges.length === 1 &&
                (pageField === this.lot.title ||
                    pageField === this.sublot.title ||
                    pageField === this.serialNumber.title)
            ) {
                if (this.status.value === null) {
                    this.status.value = result.edges[0].node.status?.code;
                }
                if (this.location.value === null || this.location.value.code === null) {
                    this.location.value = { code: result.edges[0].node.location?.code };
                }
                if (this.sublot.value === null || this.sublot.value.sublot === null) {
                    this.sublot.value = { sublot: result.edges[0].node.sublot };
                }
                if (this.lot.value === null || this.lot.value.lot === null) {
                    this.lot.value = { lot: result.edges[0].node.lot };
                }
                this.identifier1.value = result.edges[0].node.identifier1;
                this.identifier2.value = result.edges[0].node.identifier2;

                await this.$.commitValueAndPropertyChanges();
            }
            return true;
        } catch (e) {
            await dialogMessage(
                this,
                'error',
                ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                ui.localize('@sage/x3-stock/dialog-error-reading-stock', 'Reading stock record: ') + String(e),
            );
            return false;
        }
    }

    /*
     * Read the stock node to ensure there is some inventory for the entered details
     */
    private async _checkStockQuantity(stockId?: number): Promise<boolean | Error> {
        try {
            const stockFilter: any = {
                stockSite: this.stockSite.value,
                product: this.product.value,
            };
            if (stockId) {
                stockFilter.stockId = stockId;
            }
            if (this.location.value && this.location.value.code) {
                stockFilter.location = this.location.value.code;
            }
            if (this.status.value) {
                stockFilter.status = this.status.value;
            }
            if (this.lot.value && this.lot.value.lot) {
                stockFilter.lot = this.lot.value.lot;
            }
            if (this.sublot.value && this.sublot.value.sublot) {
                stockFilter.sublot = this.sublot.value.sublot;
            }
            if (this.serialNumberReceived.value && this.serialNumberReceived.value.serialNumber) {
                stockFilter.serialNumber = this.serialNumberReceived.value.serialNumber;
            }

            const result = await this.$.graph
                .node('@sage/x3-stock-data/Stock')
                .aggregate.query(
                    aggregateEdgesSelector<Stock, AggregateGroupSelector<Stock>, AggregateValuesSelector<Stock>>(
                        {
                            group: {
                                product: {
                                    product: {
                                        code: {
                                            _by: 'value',
                                        },
                                    },
                                },
                            },
                            values: {
                                quantityInStockUnit: {
                                    min: false,
                                    max: false,
                                    sum: true,
                                    avg: false,
                                    distinctCount: false,
                                },
                            },
                        },
                        {
                            filter: stockFilter,
                        },
                    ),
                )
                .execute();
            if (result.edges.length === 0) {
                return false;
            } else if (
                this._allPicks[this.currentPick].detailedAllocation === 0 &&
                this.serialNumberReceived.value &&
                this.serialNumberReceived.value.serialNumber &&
                Number(result.edges[0].node.values.quantityInStockUnit.sum) > 0
            ) {
                return true;
            } else if (Number(result.edges[0].node.values.quantityInStockUnit.sum) < this.quantityInStockUnit.value) {
                return false;
            }
            return true;
        } catch (e) {
            await dialogMessage(
                this,
                'error',
                ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                ui.localize('@sage/x3-stock/dialog-error-reading-stock', 'Reading stock record: ') + String(e),
            );
            return false;
        }
    }
    /*
     * Read the product site node to get critical parameterization
     */
    private async _readProductSiteData(productCode: string): Promise<any | Error> {
        try {
            const productSiteData = await this.$.graph
                .node('@sage/x3-master-data/ProductSite')
                .read(
                    {
                        isLicensePlateNumberManaged: true,
                        isLocationManaged: true,
                        stockSite: {
                            code: true,
                        },
                        product: {
                            code: true,
                            serialNumberManagementMode: true,
                            localizedDescription1: true,
                            lotManagementMode: true,
                            stockUnit: {
                                code: true,
                                numberOfDecimals: true,
                            },
                            isNegativeStockAuthorized: true,
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
                    `${productCode}|${this.stockSite.value}`,
                )
                .execute();
            // If an error occurred during the API call
            if (!productSiteData) {
                await this._notifier.showAndWait(
                    ui.localize(
                        '@sage/x3-stock/pages__adc_notification__invalid_product_site_error',
                        `Could not retrieve your product {{ productCode }} for the site {{ siteCode }}`,
                        {
                            productCode: this.product.value,
                            siteCode: this.stockSite.value,
                        },
                    ),
                    'error',
                );
                return this.$.router.goTo('@sage/x3-stock/MobilePickTicket');
            }
            this._productSite = productSiteData as any;
        } catch (e) {
            await dialogMessage(
                this,
                'error',
                ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                ui.localize('@sage/x3-stock/dialog-error-reading-product-site', 'reading product site record') +
                    String(e),
            );
        }
    }
    private async _readProductData(productCode: string): Promise<any | Error> {
        try {
            const productData = await this.$.graph
                .node('@sage/x3-master-data/Product')
                .read(
                    {
                        code: true,
                        serialNumberManagementMode: true,
                        stockManagementMode: true,
                        localizedDescription1: true,
                        lotManagementMode: true,
                        isNegativeStockAuthorized: true,
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
                    `${productCode}`,
                )
                .execute();
            // If an error occurred during the API call
            if (!productData) {
                await this._notifier.showAndWait(
                    ui.localize(
                        '@sage/x3-stock/pages__adc_notification__invalid_product_error',
                        `Could not retrieve your product {{ productCode }}`,
                        {
                            productCode: this.product.value,
                        },
                    ),
                    'error',
                );
                return this.$.router.goTo('@sage/x3-stock/MobilePickTicket');
            }
            this._product = productData as any;
            this._unitStockNumberOfDecimals = productData.stockUnit.numberOfDecimals;
        } catch (e) {
            await dialogMessage(
                this,
                'error',
                ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                ui.localize('@sage/x3-stock/dialog-error-reading-product', 'reading product record') + String(e),
            );
        }
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
                    '@sage/x3-stock/pages__adc_miscellaneous_receipt_details__notification__invalid_stock_status_error',
                    'No stock status',
                ),
            );
        }

        // transform Stock status response into a string array
        return response.edges.map((stockStatus: any) => {
            return stockStatus.node.code;
        });
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
                        shortageQuantity: { _ne: '0' },
                    },
                },
            )
            .execute();

        return response._id?.distinctCount !== 0;
    }

    private async onSubmit(isShortage: boolean) {
        if (isShortage) {
            this.quantityInStockUnit.value = 0;
            this.quantityInPackingUnit.value = 0;
        }

        if (!isShortage && (this.quantityInStockUnit.value > 0 || this.quantityInPackingUnit.value > 0)) {
            // perform client-side validation
            if (!(await validateWithDetails(this))) return;
        }

        /*
         * Check for over picking
         */
        if (
            Number(this.quantityInStockUnit.value) + this.quantityPicked.value > this.quantityToPick.value ||
            (this.packingUnit.value === this.stockUnit.value &&
                Number(this.quantityInPackingUnit.value) + this.quantityPicked.value > this.quantityToPick.value)
        ) {
            this.$.removeToasts();
            await this.$.sound.error();
            this.$.showToast(
                ui.localize('@sage/x3-stock/dialog-error-quantity-pick', 'Quantity greater than quantity to be picked'),
                { type: 'error', timeout: 5000 },
            );
            return;
        }

        /*
         * Check for "enough" inventory
         */
        if (
            this._allPicks[this.currentPick].detailedAllocation === 0 &&
            this.quantityInStockUnit.value > 0 &&
            this._stockManagementMode !== 'notManaged'
        ) {
            const enoughStock = await this._checkStockQuantity(
                this.serialNumber.value ? this.serialNumber.value.stockId : 0,
            );
            if (enoughStock instanceof Error || !enoughStock) {
                this.$.removeToasts();
                await this.$.sound.error();
                this.$.showToast(
                    ui.localize(
                        '@sage/x3-stock/dialog-error-insufficient-stock-quantity',
                        'Insufficient stock matching the entry',
                    ),
                    { type: 'error', timeout: 5000 },
                );
                return;
            }
        }

        this._updatePickFromPage(); // Update array
        this.shortPick = false;

        /*
         * Special case where it appears they want to short pick
         */
        if (isShortage && this.quantityPicked.value < this.quantityToPick.value) {
            this.shortPick = await dialogConfirmation(
                this,
                'info',
                ui.localize('@sage/x3-stock/dialog-information-title', 'Information'),
                ui.localize('@sage/x3-stock/dialog-confirmation-pick-ticket-shortage-message', 'Create a shortage?'),
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
            if (!this.shortPick) {
                return;
            }
        }

        if (!this.shortPick) {
            this._allPicks[this.currentPick].confirmed = 1;
            this.confirmedPicks += 1;
        }

        /*
         * See if even after this pick is confirmed do we still have more to pick
         * There is a special case:  Short picks cannot be made deliverable, so don't ask
         */
        if (
            !this.shortPick &&
            Number(this.quantityInStockUnit.value) + this.quantityPicked.value < this.quantityToPick.value
        ) {
            this.quantityPicked.value += this.quantityInStockUnit.value;
            this.displayQuantityPicked.value =
                ui.localize('@sage/x3-stock/quantityPrepared', 'Picked quantity: ') +
                `${ui.formatNumberToCurrentLocale(
                    Number(this.quantityPicked.value),
                    Number(this._unitStockNumberOfDecimals),
                )} ${this.stockUnit.value}`;
            if (this.numberOfPicks === this.confirmedPicks) {
                this._createNewPick(this.quantityToPick.value - this.quantityPicked.value);
            }
            await this._nextPick();
        } else {
            // Ready to process the pick
            let result;
            let isDeliverable = false;
            let isNotSetDelivrable = false;
            let lastLine = 0;

            // aggregate all lines from this pick ticket except the user's selected line for the minimum adcPickedLine (0 = at least 1 is not picked)
            const aggregatedAdcPickedLine = await this.$.graph
                .node('@sage/x3-stock/PickTicketLine')
                .aggregate.read(
                    {
                        adcPickedLine: {
                            min: true,
                            distinctCount: true, // to handle edgy case of pick ticket containing only 1 line, which in this case this will aggregate 0 records
                        },
                    },
                    {
                        filter: {
                            // get all lines from this pick ticket except the user's selected line
                            pickTicket: { _eq: this.pickTicket.value },
                            pickTicketLine: { _ne: Number(this.pickTicketLine.value) },
                        },
                    },
                )
                .execute();

            if (
                aggregatedAdcPickedLine.adcPickedLine.distinctCount === 0 || // deliverable if this is the only line in this pick ticket
                aggregatedAdcPickedLine.adcPickedLine.min !== 0 // deliverable if all other pick ticket lines have adcPickedLine = 1
            ) {
                lastLine = 1;
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
                if (!this._isNegativeStockAuthorized && (this.shortPick || (await this._getShortage()))) {
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
                } else if (
                    this.shortPick &&
                    this.destinationLocation.value &&
                    this.destinationLocation.value.code != ''
                ) {
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

            result = await this._callProcessPickAPI(isDeliverable); // Call API
            this.$.loader.isHidden = true;

            // Special case unable to connect check type of error :
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
                        this._allPicks.forEach(function (pick) {
                            pick.confirmed = 0;
                        });
                        this.confirmedPicks = 0;
                        this.quantityPicked.value = 0;
                        this.displayQuantityPicked.value =
                            ui.localize('@sage/x3-stock/quantityPrepared', 'Picked quantity: ') +
                            `${ui.formatNumberToCurrentLocale(
                                Number(this.quantityPicked.value),
                                Number(this._unitStockNumberOfDecimals),
                            )} ${this.stockUnit.value}`;
                        if (this._allPicks.length > 1) {
                            this.nextButton.isDisabled = false;
                        }
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
            }

            // If we came from preparation list see if the list is done
            // Change lastLine to 0 if it is not done
            if (lastLine && this.pickList.value != '') {
                const aggregatedList = await this.$.graph
                    .node('@sage/x3-stock/PickList')
                    .aggregate.read(
                        {
                            preparationListSequenceNumber: {
                                distinctCount: true,
                            },
                        },
                        {
                            filter: {
                                preparationList: this.pickList.value,
                                pickTicketLine: { adcPickedLine: 0 },
                            },
                        },
                    )
                    .execute();
                if (aggregatedList.preparationListSequenceNumber.distinctCount !== 0) {
                    lastLine = 0;
                }
            }
            this.$.storage.remove(MobilePickTicketViewPickTicketLine.PICK_TICKET_LINE_KEY);

            /*
             * Display information when pick ticket is or not deliverable
             */

            if (lastLine && isDeliverable !== undefined) {
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

            /*
             * Return to get another pick ticket line or go back to page one
             */
            this.$.setPageClean();
            await this.$.sound.success();

            if (lastLine) {
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

    /*
     * Call the updatePickTicketLine mutation on the Pick Ticket Line node
     */
    private async _callProcessPickAPI(isDeliverable: boolean): Promise<any> {
        this.$.loader.isHidden = false;
        /*
         * push the picks to the pickLines array
         */
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
        for (const pick of this._allPicks) {
            if (pick.confirmed && pick.quantityInStockUnit > 0) {
                _packingUnit.push(pick.packingUnitCode);
                _packingUnitToStockUnitConversionFactor.push(pick.packingUnitToStockUnitConversionFactor);
                _quantityInPackingUnit.push(pick.quantityInPackingUnit);
                _quantityInStockUnit.push(pick.quantityInStockUnit);
                _location.push(pick.location ?? '');
                _lot.push(pick.lot ?? '');
                _sublot.push(pick.sublot ?? '');
                _serialNumber.push(pick.serialNumber ?? '');
                _status.push(pick.status);
                _stockId.push(pick.stockId);
            }
        }

        /*
         * Make the mutation call
         */
        const pickTicketArgs: any = {
            entryTransaction: this.transaction.value,
            pickTicket: this.pickTicket.value,
            pickTicketLine: this.pickTicketLine.value,
            destinationLocation: this.destinationLocation.value ? this.destinationLocation.value.code : '',
            product: this.product.value,
            shortPick: this.shortPick,
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
