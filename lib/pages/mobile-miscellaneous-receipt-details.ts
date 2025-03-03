import { Container, ProductSite, ProductVersion } from '@sage/x3-master-data-api';
import { dialogMessage } from '@sage/x3-master-data/lib/client-functions/dialogs';
import { getPageValuesNotTransient } from '@sage/x3-master-data/lib/client-functions/get-page-values-not-transient';
import { GraphApi, MiscellaneousReceiptLineInput, StockEntryTransaction } from '@sage/x3-stock-api';
import {
    LicensePlateNumber,
    Location,
    Lot,
    LotsSites,
    MajorVersionStatus,
    StockManagementRules,
    Warehouse,
} from '@sage/x3-stock-data-api';
import { getRegExp } from '@sage/x3-system/lib/shared-functions/pat-converter';
import { ExtractEdges, Filter, extractEdges } from '@sage/xtrem-client';
import { DateValue } from '@sage/xtrem-date-time';
import * as ui from '@sage/xtrem-ui';
import { controlLotReceipt, fieldData, validate } from '../client-functions/control';
import { expirationDateDefaultValue, useByDateDefaultValue } from '../client-functions/defaultValue';
import { NotifyAndWait } from '../client-functions/display';
import { getProductSite } from '../client-functions/get-product-site';
import { findDefaultLocation, findStockManagementRules } from '../client-functions/stock-management-rules';
import { inputs } from './mobile-miscellaneous-receipt';

type DeepPartial<T> = T extends Object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;
type PartialStockEntryTransaction = DeepPartial<StockEntryTransaction>;
type PartialLot = DeepPartial<Lot>;
type PartialLocation = DeepPartial<Location>;

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

/** Created with X3 Etna Studio at 2020-01-20T10:46:11.764Z */
@ui.decorators.page<MobileMiscellaneousReceiptDetails>({
    title: 'Miscellaneous receipt',
    subtitle: 'Enter stock details',
    module: 'x3-stock',
    mode: 'default',
    isTitleHidden: true,
    headerCard() {
        return {
            title: this.product,
            line2: this.localizedDescription,
        };
    },
    businessActions() {
        return [this.addDetails, this.addProduct];
    },
    async onLoad() {
        if (
            (!this.$.queryParameters['productSite'] && !this.$.storage.get('productSite')) ||
            !this._getSavedInputs()?.miscellaneousReceipt.miscellaneousReceiptLines
        ) {
            this.addProduct.isHidden = true;
            this.addDetails.isHidden = true;
            this.firstLineBlock.isHidden = true;
            return;
        }
        await this._init();
        this.status.options = await this._getStockStatus();
        this.status.value = this._selectedStockManagementRules.defaultStatus;
        if (!this.suggestedLocation.isHidden) {
            this.suggestedLocation.value = await findDefaultLocation(
                this._productSite,
                this._selectedStockManagementRules,
                this,
            );
            if (!this.suggestedLocation.value) this.suggestedLocation.isHidden = true;
            else if (this._isLocationPreloaded) {
                this.location.value = {
                    code: this.suggestedLocation.value,
                    stockSite: {
                        code: this.site.value,
                    },
                };
            }
        }
        //this.status.value = this.status.options[0];
        if (!this.expirationDate.isHidden) {
            this.expirationDate.value = expirationDateDefaultValue(
                this._productSite.product.expirationManagementMode,
                this._productSite.product.expirationLeadTime,
                this._productSite.product.expirationTimeUnit,
                this._effectiveDate,
            );

            this.useByDate.value = useByDateDefaultValue(
                this.expirationDate.value,
                this._effectiveDate,
                this._productSite.product.expirationManagementMode,
                Number(this._productSite.product.useByDateCoefficient),
            );
            this.useByDate.maxDate = this.expirationDate.value ?? undefined;
        }
        this.packingUnit.isReadOnly = this.packingUnit.options.length <= 1;
        this.packingUnit.options.length > 1 ? this.packingUnit.focus() : this.quantityInPackingUnit.focus();

        this._newDetail = String(this.$.queryParameters['NewDetail']) === 'Yes';
        if (this._newDetail) {
            const storageLocation = this.$.storage.get('miscellaneous-receipt-details-location') as string;
            this.location.value = JSON.parse(storageLocation);
        }
        if (!this.container.isHidden) {
            if (this._newDetail) {
                const storageContainer = this.$.storage.get('miscellaneous-receipt-details-container') as string;
                const storageLpn = this.$.storage.get('miscellaneous-receipt-details-licensePlateNumber') as string;
                this.container.value = JSON.parse(storageContainer);
                if (this.container.value) {
                    this.container.isDisabled = true;
                } else if (storageLpn) {
                    this.container.isDisabled = true;
                } else {
                    this.container.value = this._productSite.defaultInternalContainer;
                    this.container.isDisabled = false;
                }
                this.licensePlateNumber.isDisabled = storageLpn === 'null';
            } else {
                this.container.value = this._productSite.defaultInternalContainer;
            }
        }
        await this.$.commitValueAndPropertyChanges();
    },
})
export class MobileMiscellaneousReceiptDetails extends ui.Page<GraphApi> {
    /*
     *
     *  Technical properties
     *
     */

    _packingUnits: packingUnit[];
    private _productSite: ProductSite;
    private _currentLine = 0;
    private _miscellaneousReceiptLines: MiscellaneousReceiptLineInput[];
    private _selectedLot: PartialLot;
    private _selectedTransaction: PartialStockEntryTransaction;
    private _selectedLocation: PartialLocation;
    private _effectiveDate = DateValue.today().toString();
    private _selectedStockManagementRules: StockManagementRules;
    private _newDetail: boolean = false;
    private _isLocationPreloaded: boolean;
    private _isPageActive: boolean;
    private async _fieldsData(validateField: boolean): Promise<fieldData[]> {
        return [
            {
                fieldIsHidden: this.packingUnit.isHidden ?? false,
                fieldValue: this.packingUnit.value,
                fieldName: 'packingUnit',
                validate: validateField ? await this.packingUnit.validate() : undefined,
            },
            {
                fieldIsHidden: this.quantityInPackingUnit.isHidden ?? false,
                fieldValue: this.quantityInPackingUnit.value,
                fieldName: 'quantityInPackingUnit',
                validate: validateField ? await this.quantityInPackingUnit.validate() : undefined,
            },
            {
                fieldIsHidden: this.packingUnitToStockUnitConversionFactor.isHidden ?? false,
                fieldValue: this.packingUnitToStockUnitConversionFactor.value,
                fieldName: 'packingUnitToStockUnitConversionFactor',
                validate: validateField ? await this.packingUnitToStockUnitConversionFactor.validate() : undefined,
            },
            {
                fieldIsHidden: this.status.isHidden ?? false,
                fieldValue: this.status.value,
                fieldName: 'status',
                validate: validateField ? await this.status.validate() : undefined,
            },
            {
                fieldIsHidden: this.licensePlateNumber.isHidden ?? false,
                fieldValue: this.licensePlateNumber.value,
                fieldName: 'licensePlateNumber',
                validate: validateField ? await this.licensePlateNumber.validate() : undefined,
            },
            {
                fieldIsHidden: this.container.isHidden ?? false,
                fieldValue: this.container.value,
                fieldName: 'container',
                validate: validateField ? await this.container.validate() : undefined,
            },
            {
                fieldIsHidden: this.location.isHidden ?? false,
                fieldValue: this.location.value,
                fieldName: 'location',
                validate: validateField ? await this.location.validate() : undefined,
            },
            {
                fieldIsHidden: this.serialNumber.isHidden ?? false,
                fieldValue: this.serialNumber.value,
                fieldName: 'serialNumber',
                validate: validateField ? await this.serialNumber.validate() : undefined,
            },
            {
                fieldIsHidden: this.supplierLot.isHidden ?? false,
                fieldValue: this.supplierLot.value,
                fieldName: 'supplierLot',
                validate: validateField ? await this.supplierLot.validate() : undefined,
            },
            {
                fieldIsHidden: this.lot.isHidden ?? false,
                fieldValue: this.lot.value,
                fieldName: 'lot',
                validate: validateField ? await this.lot.validate() : undefined,
            },
            {
                fieldIsHidden: this.sublot.isHidden ?? false,
                fieldValue: this.sublot.value,
                fieldName: 'sublot',
                validate: validateField ? await this.sublot.validate() : undefined,
            },
            {
                fieldIsHidden: this.majorVersion.isHidden ?? false,
                fieldValue: this.majorVersion.value,
                fieldName: 'majorVersion',
                validate: validateField ? await this.majorVersion.validate() : undefined,
            },
            {
                fieldIsHidden: this.minorVersion.isHidden ?? false,
                fieldValue: this.minorVersion.value,
                fieldName: 'minorVersion',
                validate: validateField ? await this.minorVersion.validate() : undefined,
            },
            {
                fieldIsHidden: this.potency.isHidden ?? false,
                fieldValue: this.potency.value,
                fieldName: 'potency',
                validate: validateField ? await this.potency.validate() : undefined,
            },

            {
                fieldIsHidden: this.expirationDate.isHidden ?? false,
                fieldValue: this.expirationDate.value,
                fieldName: 'expirationDate',
                validate: validateField ? await this.expirationDate.validate() : undefined,
            },
            {
                fieldIsHidden: this.lotCustomField1.isHidden ?? false,
                fieldValue: this.lotCustomField1.value,
                fieldName: 'lotCustomField1',
                validate: validateField ? await this.lotCustomField1.validate() : undefined,
            },
            {
                fieldIsHidden: this.lotCustomField2.isHidden ?? false,
                fieldValue: this.lotCustomField2.value,
                fieldName: 'lotCustomField2',
                validate: validateField ? await this.lotCustomField2.validate() : undefined,
            },
            {
                fieldIsHidden: this.lotCustomField3.isHidden ?? false,
                fieldValue: this.lotCustomField3.value,
                fieldName: 'lotCustomField3',
                validate: validateField ? await this.lotCustomField3.validate() : undefined,
            },
            {
                fieldIsHidden: this.lotCustomField4.isHidden ?? false,
                fieldValue: this.lotCustomField4.value,
                fieldName: 'lotCustomField4',
                validate: validateField ? await this.lotCustomField4.validate() : undefined,
            },
            {
                fieldIsHidden: this.identifier1.isHidden ?? false,
                fieldValue: this.identifier1.value,
                fieldName: 'identifier1',
                validate: validateField ? await this.identifier1.validate() : undefined,
            },
            {
                fieldIsHidden: this.identifier2.isHidden ?? false,
                fieldValue: this.identifier2.value,
                fieldName: 'identifier2',
                validate: validateField ? await this.identifier2.validate() : undefined,
            },
            {
                fieldIsHidden: this.useByDate.isHidden ?? false,
                fieldValue: this.useByDate.value,
                fieldName: 'useByDate',
                validate: validateField ? await this.useByDate.validate() : undefined,
            },
        ];
    }
    private _notifier = new NotifyAndWait(this);

    /*
     *
     *  Technical fields
     *
     */
    @ui.decorators.textField<MobileMiscellaneousReceiptDetails>({
        isDisabled: true,
    })
    product: ui.fields.Text;

    @ui.decorators.textField<MobileMiscellaneousReceiptDetails>({
        isDisabled: true,
        isTransient: true,
        size: 'small',
    })
    localizedDescription: ui.fields.Text;

    @ui.decorators.textField<MobileMiscellaneousReceiptDetails>({
        isDisabled: true,
        isTransient: true,
        prefix: 'Site:',
    })
    site: ui.fields.Text;

    @ui.decorators.referenceField<MobileMiscellaneousReceiptDetails, Warehouse>({
        parent() {
            return this.firstLineBlock;
        },
        node: '@sage/x3-stock-data/Warehouse',
        valueField: 'code',
        placeholder: 'Scan or select...',
        isHidden: true,
        canFilter: false,
        filter() {
            return {
                stockSite: { _id: { _eq: this.site.value } },
            };
        },
    })
    warehouse: ui.fields.Reference;

    /*
     *
     *  Page Actions
     *
     */

    @ui.decorators.pageAction<MobileMiscellaneousReceiptDetails>({
        title: 'Add quantity',
        buttonType: 'secondary',
        async onClick() {
            if (await this._isEmptyLpnAndContainerValues()) {
                return;
            }
            if (validate(this, await this.$.page.isValid, await this._fieldsData(true))) {
                this._createDetail();
                this.$.storage.set('productSite', JSON.stringify(this._productSite));
                this.$.storage.set('miscellaneous-receipt-details-container', JSON.stringify(this.container.value));
                this.$.storage.set('miscellaneous-receipt-details-location', JSON.stringify(this.location.value));
                this.$.storage.set(
                    'miscellaneous-receipt-details-licensePlateNumber',
                    JSON.stringify(this.licensePlateNumber.value),
                );
                await this._notifier.showAndWait(
                    ui.localize(
                        '@sage/x3-stock/pages__miscellaneous_receipt_details__notification__quantity_added',
                        'Quantity added',
                    ),
                    'success',
                    3000,
                );
                this.$.setPageClean();
                this.$.router.goTo('@sage/x3-stock/MobileMiscellaneousReceiptDetails', { NewDetail: 'Yes' });
            }
        },
    })
    addDetails: ui.PageAction;

    @ui.decorators.pageAction<MobileMiscellaneousReceiptDetails>({
        title: 'Next',
        buttonType: 'primary',
        shortcut: ['f3'],
        async onClick() {
            if (await this._isEmptyLpnAndContainerValues()) {
                return;
            }
            if (validate(this, await this.$.page.isValid, await this._fieldsData(true))) {
                this._createDetail();
                this.$.setPageClean();
                this._isPageActive = false;
                this.$.router.goTo('@sage/x3-stock/MobileMiscellaneousReceipt', { ReturnFromDetail: 'yes' });
            }
        },
    })
    addProduct: ui.PageAction;

    /*
     *
     *  Sections
     *
     */

    @ui.decorators.section<MobileMiscellaneousReceiptDetails>({
        isTitleHidden: true,
    })
    sectionHeader: ui.containers.Section;

    /*
     *
     *  Blocks
     *
     */
    @ui.decorators.block<MobileMiscellaneousReceiptDetails>({
        parent() {
            return this.sectionHeader;
        },
        width: 'extra-large',
        isTitleHidden: true,
    })
    firstLineBlock: ui.containers.Block;

    /*
     *
     *  Fields
     *
     */

    @ui.decorators.selectField<MobileMiscellaneousReceiptDetails>({
        parent() {
            return this.firstLineBlock;
        },
        title: 'Unit',
        width: 'small',
        options: ['UN'],
        placeholder: 'Select...',
        isMandatory: true,
        async onChange() {
            if (!this.packingUnit.value) return;
            const selectedValue = this.packingUnit.value;
            const packingUnitIndex = this._packingUnits
                .map(packingUnit => packingUnit.node.packingUnit.code)
                .indexOf(selectedValue);
            if (packingUnitIndex !== -1) {
                const selectedUnit = this._packingUnits[packingUnitIndex].node;
                this.packingUnitToStockUnitConversionFactor.value = Number(
                    selectedUnit.packingUnitToStockUnitConversionFactor,
                );
                this.packingUnitToStockUnitConversionFactor.isDisabled = !selectedUnit.isPackingFactorEntryAllowed;
                this.quantityInPackingUnit.scale = selectedUnit.packingUnit.numberOfDecimals;
            } else {
                this.packingUnitToStockUnitConversionFactor.value = 1;
                this.packingUnitToStockUnitConversionFactor.isDisabled = true;
                if (this.packingUnit.value) this._GetNumberOfDecimals();
            }
        },
    })
    packingUnit: ui.fields.Select;

    @ui.decorators.numericField<MobileMiscellaneousReceiptDetails>({
        parent() {
            return this.firstLineBlock;
        },
        title: 'Quantity',
        placeholder: 'Enter...',
        width: 'small',
        isMandatory: true,
        validation: /[0-9]{1,}/,
        min: 0,
        isNotZero: true,
    })
    quantityInPackingUnit: ui.fields.Numeric;

    @ui.decorators.numericField<MobileMiscellaneousReceiptDetails>({
        parent() {
            return this.firstLineBlock;
        },
        title: 'Conversion factor',
        isDisabled: true,
        isMandatory: true,
        placeholder: 'Enter...',
    })
    packingUnitToStockUnitConversionFactor: ui.fields.Numeric;

    @ui.decorators.selectField<MobileMiscellaneousReceiptDetails>({
        parent() {
            return this.firstLineBlock;
        },
        title: 'Status',
        isMandatory: true,
        options: ['A'],
        placeholder: 'Scan or select...',
        onChange() {},
    })
    status: ui.fields.Select;

    @ui.decorators.referenceField<MobileMiscellaneousReceiptDetails, Container>({
        parent() {
            return this.firstLineBlock;
        },
        title: 'Container',
        node: '@sage/x3-master-data/Container',
        valueField: 'code',
        isAutoSelectEnabled: true,
        placeholder: 'Scan or select...',
        width: 'large',
        isTransient: true,
        canFilter: false,
        filter() {
            return {
                isInternal: { _eq: true },
                isActive: { _eq: true },
            };
        },
        columns: [
            ui.nestedFields.text({
                bind: 'code',
                title: 'Code',
            }),
            ui.nestedFields.text({
                bind: 'containerType',
                title: 'Type',
            }),
            ui.nestedFields.text({
                bind: 'description',
                title: 'Description',
            }),
        ],
    })
    container: ui.fields.Reference;

    @ui.decorators.referenceField<MobileMiscellaneousReceiptDetails, LicensePlateNumber>({
        parent() {
            return this.firstLineBlock;
        },
        title: 'License Plate Number',
        node: '@sage/x3-stock-data/LicensePlateNumber',
        valueField: 'code',
        isAutoSelectEnabled: true,
        placeholder: 'Scan or select...',
        width: 'large',
        canFilter: false,
        filter() {
            let licensePlateNumberFilter: Filter<any> = {
                stockSite: { code: this.site.value },
                isActive: { _eq: true },
                _or: [
                    {
                        isSingleProduct: { _eq: true },
                        stock: { _atLeast: 1, product: { product: { code: this.product.value } } },
                    },
                    { isSingleProduct: { _eq: true }, stock: { _none: true } },
                    // { isSingleProduct: { _eq: false } },
                    { isSingleProduct: { _in: [false, null] } },
                ],
            };
            if (this.container.value) {
                licensePlateNumberFilter = {
                    ...licensePlateNumberFilter,
                    container: { code: (this.container.value as Container)?.code },
                };
            }
            return licensePlateNumberFilter;
        },
        columns: [
            ui.nestedFields.text({
                bind: 'code',
                title: 'Code',
            }),
            ui.nestedFields.reference({
                node: '@sage/x3-stock-data/Location',
                bind: 'location',
                valueField: 'code',
                title: 'Location',
            }),
            ui.nestedFields.reference({
                node: '@sage/x3-master-data/Container',
                bind: 'container',
                valueField: 'code',
                title: 'Container',
            }),
            ui.nestedFields.text({
                bind: 'status',
                title: 'Status',
            }),
            // (X3-227347) TODO: Obsolete: Having to specify & hide fields used in filter that don't need to be displayed
            ui.nestedFields.reference({
                node: '@sage/x3-system/Site',
                bind: 'stockSite',
                valueField: 'code',
                isHidden: true,
            }),
            ui.nestedFields.checkbox({
                bind: 'isActive',
                isHidden: true,
            }),
            ui.nestedFields.checkbox({
                bind: 'isSingleProduct',
                isHidden: true,
            }),
        ],
        async onChange() {
            if (await this.licensePlateNumber.value?.code) {
                this._manageLicensePlateNumberLocation();
                if ((this.licensePlateNumber.value as LicensePlateNumber).container) {
                    this.container.value = (this.licensePlateNumber.value as LicensePlateNumber).container;
                    this.container.isDisabled = true;
                } else {
                    this.container.isDisabled = false;
                }
            } else {
                this.location.isHidden = false;
                this.location.isDisabled = false;
                this.location.value = null;
                this.dummyLocation.isHidden = true;
                this.dummyLocation.value = null;
                this.container.isDisabled = this._newDetail;
            }
            if (this.location.value && this.location.value.code) this._getWarehouseFromLocation();
            await this.$.commitValueAndPropertyChanges();
            this.licensePlateNumber.getNextField(true)?.focus();
        },
    })
    licensePlateNumber: ui.fields.Reference;

    @ui.decorators.textField<MobileMiscellaneousReceiptDetails>({
        parent() {
            return this.firstLineBlock;
        },
        title: 'Suggested location',
        isReadOnly: true,
        width: 'large',
        isTransient: true,
    })
    suggestedLocation: ui.fields.Text;

    @ui.decorators.referenceField<MobileMiscellaneousReceiptDetails, Location>({
        parent() {
            return this.firstLineBlock;
        },
        title: 'Location',
        node: '@sage/x3-stock-data/Location',
        valueField: 'code',
        isMandatory: true,
        placeholder: 'Scan or select...',
        isAutoSelectEnabled: true,
        width: 'large',
        canFilter: false,
        filter() {
            return {
                stockSite: { code: this.site.value },
                category: { _nin: ['subcontract', 'customer'] },
            };
        },
        async onChange() {
            if (this.location.value) this._getWarehouseFromLocation();
            await this.$.commitValueAndPropertyChanges();
            if (this.location.value) this.location.getNextField(true)?.focus();
        },
        columns: [
            ui.nestedFields.text({
                bind: 'code',
                title: 'Code',
            }),
            // (X3-227347) TODO: Obsolete: Having to specify & hide fields used in filter that don't need to be displayed
            ui.nestedFields.reference({
                node: '@sage/x3-system/Site',
                bind: 'stockSite',
                valueField: 'code',
                isHidden: true,
            }),
        ],
    })
    location: ui.fields.Reference;

    // dummy location field
    @ui.decorators.textField<MobileMiscellaneousReceiptDetails>({
        parent() {
            return this.firstLineBlock;
        },
        title: 'Location',
        isMandatory: true,
        isHidden: true,
        isDisabled: true,
        isTransient: true,
        width: 'large',
    })
    dummyLocation: ui.fields.Text;

    @ui.decorators.textField<MobileMiscellaneousReceiptDetails>({
        parent() {
            return this.firstLineBlock;
        },
        title: 'Serial number',
        width: 'large',
        placeholder: 'Scan...',
        validation: /^$|^[^|]+$/,
    })
    serialNumber: ui.fields.Text;

    @ui.decorators.textField<MobileMiscellaneousReceiptDetails>({
        parent() {
            return this.firstLineBlock;
        },
        title: 'Supplier lot',
        width: 'large',
        placeholder: 'Scan...',
        validation: /^$|^[^|]+$/,
        async onChange() {
            this.supplierLot.value ? (this.supplierLot.value = this.supplierLot.value.toUpperCase()) : '';
            if (
                this.supplierLot.value &&
                this._selectedStockManagementRules.lotByDefault === 'supplierLot' &&
                this._selectedStockManagementRules.lotEntry === 'newLot'
            ) {
                if (
                    (await controlLotReceipt(
                        this,
                        this.supplierLot.value,
                        this._productSite.product.code,
                        '19',
                        this.site.value,
                    )) === false
                ) {
                    this.supplierLot.value = null;
                    this.supplierLot.focus();
                }
            }
            this.lot.value = this.supplierLot.value;
            await this.$.commitValueAndPropertyChanges();
        },
    })
    supplierLot: ui.fields.Text;

    @ui.decorators.filterSelectField<MobileMiscellaneousReceiptDetails, LotsSites>({
        node: '@sage/x3-stock-data/LotsSites',
        title: 'Lot',
        valueField: 'lot',
        isNewEnabled: true,
        placeholder: 'Scan or select...',
        canFilter: false,
        parent() {
            return this.firstLineBlock;
        },
        validation: /^$|^[^|]+$/,
        filter() {
            return {
                product: { code: this.product.value },
                storageSite: { code: this.site.value },
                stock: { _atLeast: 1 },
            };
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

        async onChange() {
            this.lot.value = this.lot.value.toUpperCase();
            if (
                this.lot.value &&
                this._selectedStockManagementRules.lotEntry === 'newLot' &&
                (await controlLotReceipt(
                    this,
                    this.lot.value,
                    this._productSite.product.code,
                    '19',
                    this.site.value,
                )) === false
            ) {
                this.lot.value = null;
                this.lot.focus();
            }
            this.sublot.value && !this.sublot.isHidden && this.svgLot.value !== this.lot.value
                ? (this.sublot.value = null)
                : null;
            await this._getLotValues();
            this.svgLot.value = this.lot.value;

            if (this.lot.value) {
                this._getNextField(this.lot)?.focus();
            }
        },
    })
    lot: ui.fields.FilterSelect;

    @ui.decorators.textField<MobileMiscellaneousReceiptDetails>({
        parent() {
            return this.firstLineBlock;
        },
        isHidden: true,
        isTransient: true,
    })
    svgLot: ui.fields.Text;

    @ui.decorators.textField<MobileMiscellaneousReceiptDetails>({
        parent() {
            return this.firstLineBlock;
        },
        placeholder: 'Scan...',
        title: 'Sublot',
        validation: /^$|^[^|]+$/,
        isMandatory: true,
        async onInputValueChange(this, rawData: string): Promise<void> {
            this.expirationDate.isDisabled = true;
            this.useByDate.isDisabled = true;
        },
        async onChange() {
            // this.sublot.value ? (this.sublot.value = this.sublot.value.toUpperCase()) : '';
            // this._InitLotFields();
            // await this.$.commitValueAndPropertyChanges();
            // this.sublot.getNextField(true)?.focus();
            this.sublot.value ? (this.sublot.value = this.sublot.value.toUpperCase()) : '';
            await this._getLotValues();
            this._getNextField(this.sublot)?.focus();
        },
    })
    sublot: ui.fields.Text;

    @ui.decorators.referenceField<MobileMiscellaneousReceiptDetails, MajorVersionStatus>({
        parent() {
            return this.firstLineBlock;
        },
        placeholder: 'Scan or select...',
        title: 'Major version',
        isMandatory: true,
        node: '@sage/x3-stock-data/MajorVersionStatus',
        valueField: 'code',
        isAutoSelectEnabled: true,
        canFilter: false,
        filter() {
            return {
                product: { code: this.product.value },
                // (X3-227355) TODO: Issue: Cannot use the less verbose _in operator instead of individual _or filter criterion
                _or: [{ status: 'prototypeVersion' }, { status: 'activeVersion' }, { status: 'stoppedVersion' }],
            };
        },
        async onChange() {
            // if not major & minor version managed
            if (this.minorVersion.isHidden) {
                if (this.majorVersion.value) {
                    await this.$.commitValueAndPropertyChanges();
                    this._getNextField(this.majorVersion)?.focus();
                }
            }
            // if major version is cleared out, clear out minor version if any as well
            else if ((this.minorVersion.isDisabled = !this.majorVersion.value)) {
                this.minorVersion.value = null;
            } else {
                // Auto-populate minor version based on the last minor version available
                const minorVersions = await this._getMinorVersions(this.majorVersion.value.code);
                this.minorVersion.value = {
                    _id: minorVersions[minorVersions.length - 1]._id,
                    minorVersion: minorVersions[minorVersions.length - 1].minorVersion,
                };
                await this.$.commitValueAndPropertyChanges();
                this._getNextField(this.majorVersion)?.focus();
            }
        },
        columns: [
            ui.nestedFields.text({
                bind: 'code',
                title: 'Major Version',
            }),
            ui.nestedFields.text({
                bind: 'status',
                title: 'Status',
            }),
            // (X3-227347) TODO: Obsolete: Having to specify & hide fields used in filter that don't need to be displayed
            ui.nestedFields.reference({
                node: '@sage/x3-master-data/Product',
                bind: 'product',
                valueField: 'code',
                isHidden: true,
            }),
        ],
    })
    majorVersion: ui.fields.Reference;

    @ui.decorators.referenceField<MobileMiscellaneousReceiptDetails, ProductVersion>({
        parent() {
            return this.firstLineBlock;
        },
        placeholder: 'Scan or select...',
        isHidden: true,
        title: 'Minor version',
        isMandatory: true,
        node: '@sage/x3-master-data/ProductVersion',
        valueField: 'minorVersion',
        isAutoSelectEnabled: true,
        canFilter: false,
        filter() {
            // to handle extreme case of user clearing out major version and then directly clicking on minor version's lookup button
            if (!this.majorVersion.value) {
                return;
            }

            return {
                product: { code: this.product.value },
                majorVersion: this.majorVersion.value.code,
                type: 'stock',
                useStatus: 'availableToUse',
            };
        },
        columns: [
            ui.nestedFields.text({
                bind: 'minorVersion',
                title: 'Minor version',
                isReadOnly: true,
            }),
            // (X3-227347) TODO: Obsolete: Having to specify & hide fields used in filter that don't need to be displayed
            ui.nestedFields.reference({
                node: '@sage/x3-master-data/Product',
                bind: 'product',
                valueField: 'code',
                isHidden: true,
            }),
            ui.nestedFields.text({
                bind: 'majorVersion',
                isHidden: true,
            }),
            ui.nestedFields.text({
                bind: 'type',
                isHidden: true,
            }),
            ui.nestedFields.text({
                bind: 'useStatus',
                isHidden: true,
            }),
        ],
    })
    minorVersion: ui.fields.Reference;

    @ui.decorators.numericField<MobileMiscellaneousReceiptDetails>({
        parent() {
            return this.firstLineBlock;
        },
        placeholder: 'Scan...',
        title: 'potency %',
        isMandatory: true,
        scale: 4,
        validation: /^([1-9][0-9]*(\.[0-9]+)?|[0]+\.[0-9]*[1-9][0-9]*)$/, // reg ex for any positive numbers (integers or decimals) excluding 0
        min: 0,
        max: 100,
    })
    potency: ui.fields.Numeric;

    @ui.decorators.dateField<MobileMiscellaneousReceiptDetails>({
        parent() {
            return this.firstLineBlock;
        },
        placeholder: 'Enter...',
        title: 'Expiration date',
        isMandatory: true,
        onChange() {
            this.useByDate.value = useByDateDefaultValue(
                this.expirationDate.value,
                this._effectiveDate,
                this._productSite.product.expirationManagementMode,
                Number(this._productSite.product.useByDateCoefficient),
            );
            this.useByDate.maxDate = this.expirationDate.value ?? undefined;
        },
    })
    expirationDate: ui.fields.Date;

    @ui.decorators.dateField<MobileMiscellaneousReceiptDetails>({
        parent() {
            return this.firstLineBlock;
        },
        placeholder: 'Enter...',
        title: 'Use-by date',
        isMandatory: true,
    })
    useByDate: ui.fields.Date;

    // FIXME: Find out the need
    // @ui.decorators.textField<MobileMiscellaneousReceiptDetails>({
    //     parent() {
    //         return this.firstLineBlock;
    //     },
    //     isHidden: true,
    // })
    // technicalField: ui.fields.Text;

    @ui.decorators.textField<MobileMiscellaneousReceiptDetails>({
        parent() {
            return this.firstLineBlock;
        },
        placeholder: 'Scan...',
        title: 'Lot custom text 1',
        validation: /^$|^[^|]+$/,
    })
    lotCustomField1: ui.fields.Text;

    @ui.decorators.textField<MobileMiscellaneousReceiptDetails>({
        parent() {
            return this.firstLineBlock;
        },
        placeholder: 'Scan...',
        title: 'Lot custom text 2',
        validation: /^$|^[^|]+$/,
    })
    lotCustomField2: ui.fields.Text;

    @ui.decorators.numericField<MobileMiscellaneousReceiptDetails>({
        parent() {
            return this.firstLineBlock;
        },
        placeholder: 'Enter...',
        title: 'Lot custom number',
    })
    lotCustomField3: ui.fields.Numeric;

    @ui.decorators.dateField<MobileMiscellaneousReceiptDetails>({
        parent() {
            return this.firstLineBlock;
        },
        placeholder: 'Enter...',
        title: 'Lot custom date',
    })
    lotCustomField4: ui.fields.Date;

    @ui.decorators.textField<MobileMiscellaneousReceiptDetails>({
        parent() {
            return this.firstLineBlock;
        },
        placeholder: 'Scan...',
        title: 'Identifier 1',
        validation: /^$|^[^|]+$/,
    })
    identifier1: ui.fields.Text;

    @ui.decorators.textField<MobileMiscellaneousReceiptDetails>({
        parent() {
            return this.firstLineBlock;
        },
        placeholder: 'Scan...',
        title: 'Identifier 2',
        validation: /^$|^[^|]+$/,
    })
    identifier2: ui.fields.Text;

    /*
     *
     *  Init functions
     *
     */

    private async _init() {
        const storageProductSite = this.$.storage.get('productSite') as string;
        this._isPageActive = true;
        this._miscellaneousReceiptLines = this._getSavedInputs().miscellaneousReceipt.miscellaneousReceiptLines ?? [];

        this._initSiteCodeField();
        this._isLocationPreloaded = this.$.queryParameters['isLocationPreloaded'] === '1' ? true : false;

        this._productSite = await getProductSite(
            this,
            this.$.queryParameters['productSite'] as string,
            this.site.value as string,
            storageProductSite,
        );
        this._initmiscellaneousReceiptLines(!!storageProductSite);

        await this._initDirty();
        this._initTechnicalProperties();
        this._fieldsManagement();
        this._selectedStockManagementRules = await findStockManagementRules(
            this.site.value ?? '',
            this._productSite.product.productCategory.code,
            '1',
            this._selectedTransaction.stockMovementCode?.code ?? null,
            this,
        );
        this._miscellaneousFieldsManagement();
    }

    private async _initDirty(forceDirty = false): Promise<boolean> {
        let isDirty =
            forceDirty || (this._getSavedInputs()?.miscellaneousReceipt?.miscellaneousReceiptLines ?? []).length > 0;
        // Ignore empty new row
        if (isDirty) {
            this.product.isDirty = true;
        }
        return isDirty;
    }

    private _getSavedInputs() {
        return JSON.parse(this.$.storage.get('miscellaneousReceipt') as string) as inputs;
    }

    private _initmiscellaneousReceiptLines(newDetail = false) {
        if (!newDetail) {
            this._miscellaneousReceiptLines.push({
                stockDetails: [],
            });
        }

        this._currentLine = this._miscellaneousReceiptLines.length - 1;

        if (this._miscellaneousReceiptLines[this._currentLine].stockDetails.length === 0) {
            this._miscellaneousReceiptLines[this._currentLine] = {
                ...this._miscellaneousReceiptLines[this._currentLine],
                product: this.product.value,
                packingUnitToStockUnitConversionFactor: 1,
                packingUnit: this._productSite.product.stockUnit.code,
            };
        }
        this.potency.value = Number(this._productSite.product.defaultPotencyInPercentage);
    }

    private _initSiteCodeField() {
        // assign site code
        const siteCode = this.$.storage.get('mobile-selected-stock-site') as string;
        if (siteCode) {
            this.site.value = siteCode;
        }
    }

    private _initTechnicalProperties() {
        this.product.value = this._productSite.product.code;
        this.localizedDescription.value = this._productSite.product.localizedDescription1;
    }

    /*
     *
     *  Fields management functions
     *
     */

    private async _fieldsManagement() {
        this._selectedTransaction = this._getSavedInputs().selectedTransaction;
        this._lotManagement();

        this._initPackingUnitFields();
    }

    private _lotManagement() {
        const lotManagement = this._productSite.product.lotManagementMode;

        const lotNotManaged = lotManagement === 'notManaged';

        this.lot.isHidden = lotNotManaged;
        this.sublot.isHidden = lotNotManaged;
        //user lot area
        this.lotCustomField1.isHidden = lotNotManaged || !this._selectedTransaction.isLotCustomField1Allowed;
        this.lotCustomField2.isHidden = lotNotManaged || !this._selectedTransaction.isLotCustomField2Allowed;
        this.lotCustomField3.isHidden = lotNotManaged || !this._selectedTransaction.isLotCustomField3Allowed;
        this.lotCustomField4.isHidden = lotNotManaged || !this._selectedTransaction.isLotCustomField4Allowed;
        //Supplier Lot
        switch (this._selectedTransaction.supplierLot) {
            case 'entered': {
                this.supplierLot.isHidden = lotNotManaged || false;
                this.supplierLot.isDisabled = false;
                break;
            }
            case 'displayed': {
                this.supplierLot.isHidden = lotNotManaged || false;
                this.supplierLot.isDisabled = true;
                break;
            }
            default: {
                this.supplierLot.isHidden = lotNotManaged || true;
            }
        }

        //Potency management
        const potencyManagement = this._productSite.product.stockManagementMode;
        this.potency.isHidden =
            lotNotManaged || !this._selectedTransaction.isLotPotencyAllowed || potencyManagement !== 'potencyManaged';

        //Expiration Date
        const expirationManagement = this._productSite.product.expirationManagementMode;

        this.expirationDate.isHidden =
            lotNotManaged ||
            expirationManagement === 'notManaged' ||
            (!this._selectedTransaction.isLotExpirationDateAllowed &&
                expirationManagement !== 'manualEntry' &&
                expirationManagement !== 'mandatoryEntry');
        this.useByDate.isHidden = this.expirationDate.isHidden;
        //disable useByDate field
        if (['roundingBeginningMonth1', 'roundingMonthEnd'].includes(expirationManagement))
            this.useByDate.isDisabled = true;

        //version
        const versionManagementMode = this._productSite.product.stockVersionMode;
        this.majorVersion.isHidden =
            lotNotManaged || !this._productSite.product.stockVersionMode || versionManagementMode === 'no';
        this.minorVersion.isHidden = lotNotManaged || versionManagementMode !== 'majorAndMinor';

        this.sublot.isHidden = lotManagement !== 'lotAndSublot';
    }

    private _initPackingUnitFields() {
        let productPackingList = extractEdges(this._productSite.product.packingUnits.query).filter(productPacking => {
            return !!productPacking.packingUnit?.code;
        });
        this._packingUnits = productPackingList.map(productPacking => {
            return { node: productPacking };
        });

        let productPakingUnitSelectValues = productPackingList.map(productPacking => {
            //return `${productPacking.packingUnit.code} = ${productPacking.packingUnitToStockUnitConversionFactor} ${this._productSite.product.stockUnit.code}`;
            return `${productPacking.packingUnit.code}`;
        });

        this.packingUnit.options = [this._productSite.product.stockUnit.code, ...productPakingUnitSelectValues];
        this.packingUnit.value = this.packingUnit.options[0];
        this.packingUnitToStockUnitConversionFactor.value = 1;

        this._GetNumberOfDecimals();
    }

    private _miscellaneousFieldsManagement() {
        //location fields
        this.location.isHidden = !this._productSite.isLocationManaged;
        this.suggestedLocation.isHidden = this.location.isHidden;

        //serial number fields
        const serialNumberManagement = this._productSite.product.serialNumberManagementMode;
        this.serialNumber.isHidden = ['notManaged', 'issued'].includes(serialNumberManagement);
        //mandatory if no sequence number
        if (!(this.serialNumber.isHidden || !!this._productSite.product.serialSequenceNumber))
            this.serialNumber.isMandatory = true;
        //lot field: mandatory if no sequence number
        if (this._selectedStockManagementRules.lotEntry === 'no') {
            this.lot.isDisabled = true;
            if (this.sublot.isHidden === false) {
                this.sublot.value = '00001';
                this.sublot.isDisabled = true;
            }
        } else if (this._selectedStockManagementRules.lotEntry === 'newLot') {
            if (this.sublot.isHidden === false) this.sublot.value = '00001';
        } else if (
            this._selectedStockManagementRules.lotEntry === 'free' &&
            this._selectedStockManagementRules.lotByDefault === 'documentNumber'
        ) {
            if (this.sublot.isHidden === false) this.sublot.value = '00001';
        }

        const lotManagementMode = this._productSite.product.lotManagementMode;
        if (
            !(this.lot.isHidden || !!this._productSite.product.lotSequenceNumber) &&
            ['lotAndSublot', 'mandatoryLot'].includes(lotManagementMode) &&
            this._selectedStockManagementRules.lotByDefault !== 'documentNumber'
        )
            this.lot.isMandatory = true;

        //container field
        this.container.isHidden =
            this._selectedStockManagementRules.licensePlateNumberEntry !== 'mandatory' ||
            !this._productSite.isLicensePlateNumberManaged;
        //license plate number fields
        this.licensePlateNumber.isHidden = !this._productSite.isLicensePlateNumberManaged;

        //identifier 1 and identifier 2
        switch (this._selectedTransaction.identifier1Detail) {
            case 'entered': {
                this.identifier1.isHidden = false;
                this.identifier1.isDisabled = false;
                break;
            }
            case 'displayed': {
                this.identifier1.isHidden = false;
                this.identifier1.isDisabled = true;
                break;
            }
            default: {
                this.identifier1.isHidden = true;
            }
        }

        switch (this._selectedTransaction.identifier2Detail) {
            case 'entered': {
                this.identifier2.isHidden = false;
                this.identifier2.isDisabled = false;
                break;
            }
            case 'displayed': {
                this.identifier2.isHidden = false;
                this.identifier2.isDisabled = true;
                break;
            }
            default: {
                this.identifier2.isHidden = true;
            }
        }
    }

    private _getNextField(field: any) {
        if (!this._isPageActive) {
            return field;
        }
        let _nextField = field.getNextField(true);
        if (this._productSite.product.expirationManagementMode !== 'manualEntry') {
            while (_nextField === this.expirationDate || _nextField === this.useByDate) {
                _nextField = _nextField.getNextField(true);
            }
        }
        return _nextField;
    }

    /*
     *
     *  record management functions
     *
     */

    private _createDetail() {
        const values = getPageValuesNotTransient(this);
        Object.keys(values).forEach(elementId => {
            if (!values[elementId]) values[elementId] = undefined;
        });

        if (this.location.value?.code) {
            values.location = this.location.value.code;
        }
        if (this.licensePlateNumber.value?.code) {
            values.licensePlateNumber = this.licensePlateNumber.value.code;
        }
        if (this.warehouse.value?.code) {
            values.warehouse = this.warehouse.value.code;
        }

        if (this.majorVersion.value?.code) {
            values.majorVersion = this.majorVersion.value.code;
        }
        if (this.minorVersion.value?.minorVersion) {
            values.minorVersion = this.minorVersion.value.minorVersion;
        }

        this._miscellaneousReceiptLines[this._currentLine].stockDetails.push(values);

        if (this.container.value?.code) {
            this._miscellaneousReceiptLines[this._currentLine].container = this.container.value.code;
        }

        this._saveDetail();
    }

    /* private _createDetail() {
        this._miscellaneousReceiptLines[this._currentLine].stockDetails.push({
            packingUnit: this.packingUnit.value ?? undefined,
            packingUnitToStockUnitConversionFactor: this.packingUnitToStockUnitConversionFactor.value ?? undefined,
            quantityInPackingUnit: Number(this.quantityInPackingUnit.value),
            quantityInStockUnit:
                Number(this.quantityInPackingUnit.value) * Number(this.packingUnitToStockUnitConversionFactor.value),
            location: this.location.value?.code ?? undefined,
            licensePlateNumber: this.licensePlateNumber.value?.code ?? undefined,
            lot: this.lot.value ?? undefined,
            status: this.status.value ?? undefined,
            sublot: this.sublot.value ?? undefined,
            serialNumber: this.serialNumber.value ?? undefined,
            identifier1: this.identifier1.value ?? undefined,
            identifier2: this.identifier2.value ?? undefined,
            potency: this.potency.value ?? undefined,
            expirationDate: this.expirationDate.value ?? undefined,
            useByDate: this.useByDate.value ?? undefined,
            lotCustomField1: this.lotCustomField1.value ?? undefined,
            lotCustomField2: this.lotCustomField2.value ?? undefined,
            lotCustomField3: this.lotCustomField3.value ?? undefined,
            lotCustomField4: this.lotCustomField4.value ?? undefined,
            majorVersion: this.majorVersion.value?.code ?? undefined,
            minorVersion: this.minorVersion.value?.minorVersion ?? undefined,
            warehouse: this.warehouse.value?.code ?? undefined,
        });

        if (this.container.value?.code) {
            this._miscellaneousReceiptLines[this._currentLine].container = this.container.value.code;
        }

        this._saveDetail();
    } */

    private _saveDetail() {
        const currentmiscellaneousReceiptLines = this._miscellaneousReceiptLines[this._currentLine];

        this._miscellaneousReceiptLines[this._currentLine] = {
            ...currentmiscellaneousReceiptLines,
            ...this._aggregateDetailsQuantity(currentmiscellaneousReceiptLines),
        };

        this._saveMiscellaneousReceipt();
    }

    private _aggregateDetailsQuantity(line: MiscellaneousReceiptLineInput) {
        return line.stockDetails.reduce(
            (accumulator, detail) => {
                const quantityInStockUnit =
                    +accumulator.quantityInStockUnit +
                    +detail.quantityInPackingUnit * +detail.packingUnitToStockUnitConversionFactor;
                return {
                    ...accumulator,
                    product: (detail as any).product,
                    quantityInStockUnit: quantityInStockUnit,
                    quantityInPackingUnit: quantityInStockUnit,
                };
            },
            { quantityInStockUnit: 0, packingUnit: this._productSite.product.stockUnit.code },
        ) as MiscellaneousReceiptLineInput;
    }

    private _saveMiscellaneousReceipt() {
        const savedInputs = this._getSavedInputs();
        savedInputs.miscellaneousReceipt.miscellaneousReceiptLines = this._miscellaneousReceiptLines;
        this.$.storage.set('miscellaneousReceipt', JSON.stringify(savedInputs));
    }

    private async _getStockStatus(): Promise<string[]> {
        const selectedStatus: { _regex: string }[] = [];
        this._selectedStockManagementRules.authorizedSubstatus.split(',').forEach(function (status) {
            selectedStatus.push({ _regex: getRegExp(status).source });
        });
        const response = await this.$.graph
            // with 'provides' property defined in accessCode of this node, should automatically return only transactions that are accessible for the current user
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
                    '@sage/x3-stock/pages__miscellaneous_receipt_details__notification__invalid_stock_status_error',
                    'No stock status',
                ),
            );
        }

        // transform Stock status response into a string array
        return response.edges.map((stockStatus: any) => {
            return stockStatus.node.code;
        });
    }
    private _enableLotFields() {
        this.supplierLot.isDisabled = false;
        //set the default values for expiration date and use by date
        this.expirationDate.value = expirationDateDefaultValue(
            this._productSite.product.expirationManagementMode,
            this._productSite.product.expirationLeadTime,
            this._productSite.product.expirationTimeUnit,
            this._effectiveDate,
        );
        this.useByDate.value = useByDateDefaultValue(
            this.expirationDate.value,
            this._effectiveDate,
            this._productSite.product.expirationManagementMode,
            Number(this._productSite.product.useByDateCoefficient),
        );
        this.useByDate.maxDate = this.expirationDate.value ?? undefined;
        this.expirationDate.isDisabled = false;
        //Expiration Date
        const expirationManagement = this._productSite.product.expirationManagementMode;
        //disable useByDate field
        this.useByDate.isDisabled = ['roundingBeginningMonth1', 'roundingMonthEnd'].includes(expirationManagement);
        this.lotCustomField1.value = null;
        this.lotCustomField1.isDisabled = false;
        this.lotCustomField2.value = null;
        this.lotCustomField2.isDisabled = false;
        this.lotCustomField3.value = null;
        this.lotCustomField3.isDisabled = false;
        this.lotCustomField4.value = null;
        this.lotCustomField4.isDisabled = false;
        this.potency.value = Number(this._productSite.product.defaultPotencyInPercentage);
        this.potency.isDisabled = false;
        this.majorVersion.value = null;
        this.majorVersion.isDisabled = false;
        this.minorVersion.value = null;
        this.minorVersion.isDisabled = !this.majorVersion.value;
        //this.minorVersion.isDisabled = false;
    }
    private _disableLotField() {
        if (!this.identifier1.isHidden) this.identifier1.focus();
        else if (!this.identifier2.isHidden) this.identifier2.focus();
        this.supplierLot.value = this._selectedLot.supplierLot ?? null;
        this.supplierLot.isDisabled = true;
        this.expirationDate.value = this._selectedLot.expirationDate ?? null;
        this.expirationDate.isDisabled = true;
        this.useByDate.value = this._selectedLot.useByDate ?? null;
        this.useByDate.isDisabled = true;
        this.lotCustomField1.value = this._selectedLot.lotCustomField1 ?? null;
        this.lotCustomField1.isDisabled = true;
        this.lotCustomField2.value = this._selectedLot.lotCustomField2 ?? null;
        this.lotCustomField2.isDisabled = true;
        this.lotCustomField3.value = Number(this._selectedLot.lotCustomField3);
        this.lotCustomField3.isDisabled = true;
        if (!!this._selectedLot.lotCustomField4 && !this._selectedLot.lotCustomField4.startsWith('1599')) {
            this.lotCustomField4.value = this._selectedLot.lotCustomField4;
        }
        this.lotCustomField4.isDisabled = true;
        this.potency.value = Number(this._selectedLot.potency);
        this.potency.isDisabled = true;
        if (!this.majorVersion.isHidden) {
            this.majorVersion.value = this._selectedLot.majorVersion ?? null;
            this.majorVersion.isDisabled = true;
        }
        if (!this.minorVersion.isHidden) {
            this.minorVersion.value = { code: this._selectedLot.minorVersion ?? null };
            this.minorVersion.isDisabled = true;
        }
    }
    private async _InitLotFields() {
        try {
            this._selectedLot = await this.$.graph
                .node('@sage/x3-stock-data/Lot')
                .read(
                    {
                        expirationDate: true,
                        lotCustomField1: true,
                        lotCustomField2: true,
                        lotCustomField3: true,
                        lotCustomField4: true,
                        potency: true,
                        useByDate: true,
                        supplierLot: true,
                        majorVersion: { code: true },
                        minorVersion: true,
                    },
                    `${this._productSite.product.code}|${this.lot.value}|${
                        this.sublot.value ? this.sublot.value : ' '
                    }`,
                )
                .execute();
        } catch (e) {
            await dialogMessage(
                this,
                'error',
                ui.localize('@sage/x3-stock/error-loading-lot', 'Error loading lot'),
                String(e),
            );
        }

        if (this._selectedLot) {
            this._disableLotField();
        } else {
            this._enableLotFields();
        }
    }

    private async _getMinorVersions(majorVersion: string): Promise<ExtractEdges<ProductVersion>[]> {
        return extractEdges(
            await this.$.graph
                .node('@sage/x3-master-data/ProductVersion')
                .query(
                    ui.queryUtils.edgesSelector(
                        {
                            _id: true,
                            minorVersion: true,
                        },
                        {
                            filter: {
                                product: this.product.value,
                                majorVersion: this.majorVersion.value?.code,
                                type: { _eq: 'stock' },
                                useStatus: { _eq: 'availableToUse' },
                            },
                            orderBy: {
                                minorVersion: 1,
                            },
                        },
                    ),
                )
                .execute(),
        ) as ExtractEdges<ProductVersion>[];
    }

    private async _getWarehouseFromLocation() {
        try {
            this._selectedLocation = await this.$.graph
                .node('@sage/x3-stock-data/Location')
                .read(
                    {
                        warehouse: { code: true },
                    },
                    `${this.site.value}|${this.location.value.code}`,
                )
                .execute();
            this.warehouse.value = this._selectedLocation.warehouse ?? null;
        } catch (e) {
            await dialogMessage(
                this,
                'error',
                ui.localize('@sage/x3-stock/error-loading-location', 'Error loading location'),
                String(e),
            );
        }
    }
    private async _GetNumberOfDecimals() {
        try {
            const NumberofDecimals = await this.$.graph
                .node('@sage/x3-master-data/UnitOfMeasure')
                .read(
                    {
                        _id: true,
                        numberOfDecimals: true,
                    },
                    `${this.packingUnit.value}`,
                )
                .execute();

            this.quantityInPackingUnit.scale = NumberofDecimals.numberOfDecimals;
        } catch (e) {
            await dialogMessage(
                this,
                'error',
                ui.localize('@sage/x3-stock/error-loading-unit', 'Error loading unit'),
                String(e),
            );
        }
    }
    private _manageLicensePlateNumberLocation() {
        if (!!this.licensePlateNumber.value?.location?.code) {
            this.location.value = this.licensePlateNumber.value.location;
            this.location.isHidden = true;

            this.dummyLocation.value = this.licensePlateNumber.value.location.code;
            this.dummyLocation.isHidden = false;
        } else {
            if (
                !this._miscellaneousReceiptLines.find(line => {
                    return line.stockDetails?.find(detail => {
                        if (detail.licensePlateNumber === this.licensePlateNumber.value?.code) {
                            this.location.value = { code: detail.location };
                            this.location.isDisabled = true;
                            return true;
                        } else {
                            return false;
                        }
                    });
                })
            ) {
                this.location.value = null;
                this.location.isDisabled = false;
                this.location.isHidden = false;
                this.dummyLocation.value = null;
                this.dummyLocation.isHidden = true;
            }
        }
    }
    private async _getLotValues() {
        if (this.lot.value && (this.sublot.isHidden || this.sublot.value)) {
            try {
                const result = extractEdges(
                    await this.$.graph
                        .node('@sage/x3-stock-data/Lot')
                        .query(
                            ui.queryUtils.edgesSelector(
                                {
                                    code: true,
                                    product: {
                                        code: true,
                                    },
                                    sublot: true,
                                    supplierLot: true,
                                    expirationDate: true,
                                    lotCustomField1: true,
                                    lotCustomField2: true,
                                    lotCustomField3: true,
                                    lotCustomField4: true,
                                    majorVersion: {
                                        code: true,
                                    },
                                    minorVersion: true,
                                    potency: true,
                                    useByDate: true,
                                },
                                {
                                    filter: {
                                        product: this.product.value,
                                        code: this.lot.value,
                                        sublot: this.sublot.value === null ? '' : this.sublot.value,
                                    },
                                },
                            ),
                        )
                        .execute(),
                ) as ExtractEdges<Lot>[];
                if (result.length !== 0) {
                    this._setLotValues(result);
                } else {
                    this._initLotValues();
                }
            } catch (e) {
                await dialogMessage(
                    this,
                    'error',
                    ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                    ui.localize('@sage/x3-stock/dialog-error-set-expdate', 'Error while reading the lot information') +
                        String(e),
                );
                return;
            }
        } else {
            this._initLotValues();
        }
    }

    private async _setLotValues(lotValues: ExtractEdges<Lot>[]) {
        if (!this.expirationDate.isHidden) {
            this.expirationDate.value = lotValues[0].expirationDate;
        }
        this.useByDate.value = lotValues[0].useByDate;
        this.supplierLot.value = lotValues[0].supplierLot;
        this.lotCustomField1.value = lotValues[0].lotCustomField1;
        this.lotCustomField2.value = lotValues[0].lotCustomField2;
        this.lotCustomField3.value = Number(lotValues[0].lotCustomField3);
        this.lotCustomField4.value = lotValues[0].lotCustomField4;
        this.majorVersion.value = null;
        this.minorVersion.value = null;
        this.$.commitValueAndPropertyChanges();
        this.majorVersion.value = { code: lotValues[0].majorVersion ? lotValues[0].majorVersion.code : null };
        this.minorVersion.value = {
            minorVersion: lotValues[0].minorVersion ? lotValues[0].minorVersion : null,
        };
        this.potency.value = Number(lotValues[0].potency);
        this.supplierLot.isDisabled = true;
        this.lotCustomField1.isDisabled = true;
        this.lotCustomField2.isDisabled = true;
        this.lotCustomField3.isDisabled = true;
        this.lotCustomField4.isDisabled = true;
        this.majorVersion.isDisabled = true;
        this.minorVersion.isDisabled = true;
        this.potency.isDisabled = true;
        this.expirationDate.isDisabled = true;
        this.useByDate.isDisabled = true;
    }

    private async _initLotValues() {
        const expirationManagement = this._productSite.product.expirationManagementMode;
        if (!this.expirationDate.value) {
            this.expirationDate.value = this.useByDate.value = null;

            this.expirationDate.value = expirationDateDefaultValue(
                this._productSite.product.expirationManagementMode,
                this._productSite.product.expirationLeadTime,
                this._productSite.product.expirationTimeUnit,
                this._effectiveDate,
            );
        }
        if (!this.useByDate.value) {
            this.useByDate.value = useByDateDefaultValue(
                this.expirationDate.value,
                this._effectiveDate,
                this._productSite.product.expirationManagementMode,
                Number(this._productSite.product.useByDateCoefficient),
            );
        }
        //disable expirationDate field
        this.expirationDate.isDisabled = false;

        //disable useByDate field
        this.useByDate.isDisabled = ['roundingBeginningMonth1', 'roundingMonthEnd'].includes(expirationManagement);

        this.lotCustomField1.value = null;
        this.lotCustomField2.value = null;
        this.lotCustomField3.value = null;
        this.lotCustomField4.value = null;
        this.potency.value = Number(this._productSite.product.defaultPotencyInPercentage);
        this.supplierLot.isDisabled = false;
        this.lotCustomField1.isDisabled = false;
        this.lotCustomField2.isDisabled = false;
        this.lotCustomField3.isDisabled = false;
        this.lotCustomField4.isDisabled = false;
        this.majorVersion.isDisabled = false;
        this.minorVersion.isDisabled = !this.majorVersion.value;
        this.potency.isDisabled = false;
    }
    private async _isEmptyLpnAndContainerValues(): Promise<boolean> {
        if (
            !this.container.isHidden &&
            !this.licensePlateNumber.isHidden &&
            (!this.container.value || this.container.value?.code === '') &&
            (!this.licensePlateNumber.value || this.licensePlateNumber.value?.code === '')
        ) {
            await dialogMessage(
                this,
                'error',
                ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                ui.localize(
                    '@sage/x3-stock/pages__miscellaneous_receipt_details__notification__container_license_plate_number_mandatory_error',
                    'Container or license plate number is mandatory',
                ),
            );
            return true;
        } else {
            return false;
        }
    }
}
