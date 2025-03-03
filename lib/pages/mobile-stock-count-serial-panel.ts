import { Product, UnitOfMeasure } from '@sage/x3-master-data-api';
import {
    GraphApi,
    StockCountList,
    StockCountListDetail,
    StockCountSerialNumber,
    StockCountSession,
} from '@sage/x3-stock-api';
import { Location, SerialNumber, Stock } from '@sage/x3-stock-data-api';
import { getCountSerialNumber } from '@sage/x3-stock-data/lib/client-functions/get-count-serial-number';
import { Site } from '@sage/x3-system-api';
import { ExtractEdges } from '@sage/xtrem-client';
import * as ui from '@sage/xtrem-ui';
import { validateWithDetails } from '../client-functions/control';

@ui.decorators.page<MobileStockCountSerialPanel>({
    title: 'Stock count',
    subtitle: 'Enter serial number',
    isTitleHidden: true,
    isTransient: false, // the only non-transient is serialNumberLines (the serial number range table)
    node: '@sage/x3-stock/StockCountListDetail',
    mode: 'default',
    navigationPanel: undefined,
    async onLoad() {
        const stockCountListDetail = JSON.parse(
            this.$.queryParameters.stockCountListDetail as string,
        ) as ExtractEdges<StockCountListDetail>;

        // before even proceeding to the update process, check if the product is global serial tracked. If so, then user must provide additional information i.e. serial number ranges
        this._stockSite = stockCountListDetail.stockSite as unknown as Site;
        this.stockCountSession.value = stockCountListDetail.stockCountSession;
        this.headerStockCountSessionNumber.value = this.stockCountSession.value.stockCountSession || '';
        this.stockCountList.value = stockCountListDetail.stockCountList;
        this.headerStockCountListNumber.value = this.stockCountList.value.stockCountListNumber || '';
        this.stockId.value = stockCountListDetail.stockLine;
        this.product.value = stockCountListDetail.product;
        this.headerProduct.value = this.product.value.code || '';
        this.location.value = stockCountListDetail.location;
        this.location.isHidden = !this.location.value;
        this.status.value = stockCountListDetail.status;
        this.quantityInPackingUnit.value = Number(stockCountListDetail.quantityInPackingUnit);
        this.packingUnit.value = stockCountListDetail.packingUnit;
        if (!this.quantityInPackingUnit.value) {
            this.quantityInPackingUnit.isHidden = this.packingUnit.isHidden = true;
        }

        this.countedStockInPackingUnit.value = Number(stockCountListDetail.countedStockInPackingUnit);

        const projectedBalance =
            this.countedStockInPackingUnit.value - Number(stockCountListDetail.quantityInPackingUnit);
        this.startingSerialNumber.isNewEnabled = projectedBalance > 0; // first, determine if this is to receive (overage) or issue (under) serial numbers
        this.projectedBalance.value =
            projectedBalance -
            (this.serialNumberLines.value.reduce(
                (a, serialRange) => a + (serialRange.quantity ? serialRange.quantity : 0),
                0,
            ) ?? 0) *
                (this.startingSerialNumber.isNewEnabled ? 1 : -1); // then calculate actual projectedBalance by including any previously inputted serial ranges
        this.quantity.value = this.quantity.max = Math.abs(this.projectedBalance.value);

        this.serialNumberLines.title =
            'Serial number(s) to ' + (this.startingSerialNumber.isNewEnabled ? 'receive' : 'issue');
    },
    headerCard() {
        return {
            title: this.headerStockCountSessionNumber,
            titleRight: this.headerStockCountListNumber,
            line2: this.headerProduct,
        };
    },
    businessActions() {
        return [this.cancel, this.save];
    },
})
export class MobileStockCountSerialPanel extends ui.Page<GraphApi> {
    private _stockSite: Site;
    private _serialNumberRegExp1: RegExp = /^$|^[^|]+$/;
    private _serialNumberRegExp2: RegExp = /\d$/; // want to distinguish the error of serial number not ending with a number

    /*
     *
     *  Hidden fields
     *
     */

    @ui.decorators.referenceField<MobileStockCountSerialPanel, StockCountSession>({
        isTitleHidden: true,
        isReadOnly: true,
        isTransient: true,
        node: '@sage/x3-stock/StockCountSession',
        valueField: 'stockCountSession',
        canFilter: false,
    })
    stockCountSession: ui.fields.Reference<StockCountSession>;

    @ui.decorators.referenceField<MobileStockCountSerialPanel, StockCountList>({
        isTitleHidden: true,
        isReadOnly: true,
        isTransient: true,
        node: '@sage/x3-stock/StockCountList',
        valueField: 'stockCountListNumber',
        canFilter: false,
    })
    stockCountList: ui.fields.Reference<StockCountList>;

    @ui.decorators.referenceField<MobileStockCountSerialPanel, Product>({
        // parent() {
        //     return this.bodyBlock;
        // },
        title: 'Product',
        node: '@sage/x3-master-data/Product',
        valueField: 'code',
        isReadOnly: true,
        //isFullWidth: true,
        isTransient: true,
        canFilter: false,
    })
    product: ui.fields.Reference<Product>;

    // for the header
    @ui.decorators.textField<MobileStockCountSerialPanel>({
        isTitleHidden: true,
        isReadOnly: true,
        isTransient: true,
    })
    headerStockCountSessionNumber: ui.fields.Text;

    @ui.decorators.textField<MobileStockCountSerialPanel>({
        isTitleHidden: true,
        isReadOnly: true,
        isTransient: true,
    })
    headerStockCountListNumber: ui.fields.Text;

    @ui.decorators.textField<MobileStockCountSerialPanel>({
        isTitleHidden: true,
        isReadOnly: true,
        isTransient: true,
    })
    headerProduct: ui.fields.Text;

    @ui.decorators.referenceField<MobileStockCountSerialPanel, Stock>({
        isHidden: true,
        isDisabled: true,
        isTransient: true,
        node: '@sage/x3-stock-data/Stock',
        valueField: 'stockId',
        canFilter: false,
        columns: [
            ui.nestedFields.numeric({
                bind: 'allocatedQuantity',
                isHidden: true,
            }),
        ],
    })
    stockId: ui.fields.Reference<Stock>;

    /*
     *
     *  Section
     *
     */

    @ui.decorators.section<MobileStockCountSerialPanel>({
        isTitleHidden: true,
    })
    section: ui.containers.Section;

    /*
     *
     *  Blocks
     *
     */

    @ui.decorators.block<MobileStockCountSerialPanel>({
        isTitleHidden: true,
        parent() {
            return this.section;
        },
    })
    bodyBlock: ui.containers.Block;

    /*
     *
     *  Fields for Header block
     *
     */

    @ui.decorators.textField<MobileStockCountSerialPanel>({
        parent() {
            return this.bodyBlock;
        },
        title: 'Status',
        isReadOnly: true,
        isFullWidth: false,
        isTransient: true,
    })
    status: ui.fields.Text;

    @ui.decorators.referenceField<MobileStockCountSerialPanel, Location>({
        parent() {
            return this.bodyBlock;
        },
        title: 'Location',
        node: '@sage/x3-stock-data/Location',
        valueField: 'code',
        isReadOnly: true,
        isFullWidth: false,
        isTransient: true,
        canFilter: false,
    })
    location: ui.fields.Reference<Location>;

    @ui.decorators.referenceField<MobileStockCountSerialPanel, UnitOfMeasure>({
        parent() {
            return this.bodyBlock;
        },
        title: 'Unit',
        node: '@sage/x3-master-data/UnitOfMeasure',
        valueField: 'code',
        isReadOnly: true,
        isFullWidth: false,
        isTransient: true,
        canFilter: false,
    })
    packingUnit: ui.fields.Reference<UnitOfMeasure>;

    @ui.decorators.numericField<MobileStockCountSerialPanel>({
        parent() {
            return this.bodyBlock;
        },
        title: 'Stock',
        isReadOnly: true,
        isFullWidth: false,
        isTransient: true,
    })
    quantityInPackingUnit: ui.fields.Numeric;

    @ui.decorators.numericField<MobileStockCountSerialPanel>({
        parent() {
            return this.bodyBlock;
        },
        title: 'Counted quantity',
        isReadOnly: true,
        isFullWidth: true,
        isTransient: true,
    })
    countedStockInPackingUnit: ui.fields.Numeric;

    /*
     *
     *  Fields for Global Serial Number block
     *
     */

    @ui.decorators.numericField<MobileStockCountSerialPanel>({
        parent() {
            return this.bodyBlock;
        },
        title: 'Projected balance',
        isReadOnly: true,
        isFullWidth: true,
        isTransient: true,
    })
    projectedBalance: ui.fields.Numeric;

    @ui.decorators.numericField<MobileStockCountSerialPanel>({
        parent() {
            return this.bodyBlock;
        },
        title: 'Quantity',
        isFullWidth: true,
        isMandatory: true,
        isTransient: true,
        min: 1,
        isDisabled() {
            return this.projectedBalance.value === 0;
        },
        async onChange() {
            await this._onChangeBody();
        },
    })
    quantity: ui.fields.Numeric;

    @ui.decorators.filterSelectField<MobileStockCountSerialPanel, SerialNumber>({
        parent() {
            return this.bodyBlock;
        },
        title: 'Starting serial number',
        placeholder: 'Scan or select…',
        node: '@sage/x3-stock-data/SerialNumber',
        valueField: 'code',
        isMandatory: true,
        isTransient: true,
        isFullWidth: true,
        canFilter: false,
        async validation(value: string) {
            if (!this._serialNumberRegExp1.test(value)) {
                return ui.localize(
                    '@sage/x3-stock/serial-number-range-regular-expression-validation-1',
                    'Invalid value',
                );
            }

            if (!this._serialNumberRegExp2.test(value)) {
                return ui.localize(
                    '@sage/x3-stock/serial-number-range-regular-expression-validation-2',
                    'Error in incrementing the serial numbers',
                );
            }
        },
        filter() {
            if (this.product.value && this.stockId.value)
                return {
                    product: { code: this.product.value.code },
                    stockSite: { code: this._stockSite.code || '' },
                    ...(!this.startingSerialNumber.isNewEnabled && {
                        issueDate: null,
                        issueDocumentId: { _in: [null, ''] },
                        stockId: this.stockId.value.stockId,
                    }),
                };
        },
        isDisabled() {
            return this.projectedBalance.value === 0;
        },
        async onChange() {
            await this._onChangeBody();
        },
    })
    startingSerialNumber: ui.fields.FilterSelect<SerialNumber>;

    @ui.decorators.textField<MobileStockCountSerialPanel>({
        parent() {
            return this.bodyBlock;
        },
        title: 'Ending serial number',
        isMandatory: true,
        isTransient: true,
        isReadOnly: true,
        isFullWidth: true,
        async validation(value: string) {
            const _countedSerialNumber = await getCountSerialNumber(
                this,
                this.product.value?.code ?? '',
                this._stockSite.code ?? '',
                undefined,
                this.startingSerialNumber.value ?? '',
                this.endingSerialNumber.value ?? '',
                value,
            );

            if (this.startingSerialNumber.isNewEnabled && _countedSerialNumber) {
                return ui.localize(
                    '@sage/x3-stock/serial-number-range-contains-existing',
                    'Range contains existing serial number(s)',
                );
            } else if (!this.startingSerialNumber.isNewEnabled && _countedSerialNumber !== this.quantity.value) {
                return ui.localize(
                    '@sage/x3-stock/serial-number-range-contains-non-existent',
                    'Range contains non-existent serial number(s)',
                );
            }
        },
    })
    endingSerialNumber: ui.fields.Text;

    @ui.decorators.tableField<MobileStockCountSerialPanel, StockCountSerialNumber>({
        parent() {
            return this.bodyBlock;
        },
        canFilter: false,
        canSelect: false,
        canExport: false,
        canResizeColumns: false,
        canUserHideColumns: false,
        isTitleHidden: false,
        //isTransient: false,
        isTransient: true, // (X3-257606) TODO Issue: Deleting table row(s) that are loaded in a non-transient causes errors. After this is fixed, change this table back to isTransient: false
        isFullWidth: true,
        isDisabled: false,
        node: '@sage/x3-stock/StockCountSerialNumber',
        mobileCard: undefined,
        columns: [
            ui.nestedFields.reference<MobileStockCountSerialPanel, StockCountSerialNumber, StockCountList>({
                bind: 'stockCountListNumber',
                valueField: 'stockCountListNumber',
                title: 'Stock Count List Number',
                node: '@sage/x3-stock/StockCountList',
                isReadOnly: true,
            }),
            ui.nestedFields.numeric({
                bind: 'quantity',
                title: 'Quantity',
                isReadOnly: true,
                postfix() {
                    return this.packingUnit.value?.code || '';
                },
                scale() {
                    return this.packingUnit.value?.numberOfDecimals ?? 0;
                },
            }),
            ui.nestedFields.text({
                bind: 'startingSerialNumber',
                title: 'Starting serial Number',
                isReadOnly: true,
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
                onClick(recordId, rowItem) {
                    if (this.projectedBalance.value)
                        this.projectedBalance.value +=
                            (rowItem.quantity ? rowItem.quantity : 0) *
                            (this.startingSerialNumber.isNewEnabled ? 1 : -1);
                    this.quantity.max = this.quantity.value = Math.abs(
                        this.projectedBalance.value ? this.projectedBalance.value : 0,
                    );
                    this.serialNumberLines.removeRecord(recordId);
                    this.startingSerialNumber.isDisabled = false;
                },
            },
        ],
        fieldActions() {
            return [this.addSerialRange];
        },
    })
    serialNumberLines: ui.fields.Table<StockCountSerialNumber>;

    /*
     *
     *  Page Actions
     *
     */

    @ui.decorators.pageAction<MobileStockCountSerialPanel>({
        title: 'Cancel',
        shortcut: ['f4'],
        buttonType: 'secondary',
        isTransient: true,
        onClick() {
            this.$.finish();
        },
    })
    cancel: ui.PageAction;

    @ui.decorators.pageAction<MobileStockCountSerialPanel>({
        title: 'Save',
        buttonType: 'primary',
        isTransient: true,
        shortcut: ['f2'],
        isDisabled() {
            return this.projectedBalance.value !== 0;
        },
        async onClick() {
            let indexNumber = 0;
            this.$.finish(
                this.serialNumberLines.value.map(serialNumberLine => {
                    return {
                        //E = Quantity is over
                        // S = Quantity is short
                        stockCountVariance: this.startingSerialNumber.isNewEnabled ? 'E' : 'S',
                        serialNumberIndexNumber: ++indexNumber,
                        quantity: serialNumberLine.quantity,
                        startingSerialNumber: serialNumberLine.startingSerialNumber,
                        endingSerialNumber: serialNumberLine.endingSerialNumber,
                        stockSite: serialNumberLine.stockSite?.code,
                    };
                }),
            );
        },
    })
    save: ui.PageAction;

    @ui.decorators.pageAction<MobileStockCountSerialPanel>({
        icon: 'add',
        title: 'Add',
        isTransient: true,
        isDisabled() {
            return this.projectedBalance.value === 0;
        },
        async onClick() {
            if (!(await validateWithDetails(this))) return;

            // check that this will add any duplicates
            const startNumberToAdd = this.startingSerialNumber.value?.match(/\d+$/);
            const endNumberToAdd = Number(this.endingSerialNumber.value?.match(/\d+$/));
            if (
                this.serialNumberLines.value.some(row => {
                    const rowStartMatch = row.startingSerialNumber?.match(/\d+$/);
                    const rowEndMatch = Number(row.endingSerialNumber?.match(/\d+$/));

                    // check if the 'beginning part' of the serial matches
                    if (
                        startNumberToAdd &&
                        rowStartMatch &&
                        this.startingSerialNumber.value &&
                        row.startingSerialNumber?.substring(
                            0,
                            row.startingSerialNumber.length - rowStartMatch.toString().length,
                        ) !==
                            this.startingSerialNumber.value.substring(
                                0,
                                this.startingSerialNumber.value.length - startNumberToAdd.toString().length,
                            )
                    )
                        return false;

                    //https://stackoverflow.com/questions/36035074/how-can-i-find-an-overlap-between-two-given-ranges/36035369
                    return Number(startNumberToAdd) <= rowEndMatch && endNumberToAdd >= Number(rowStartMatch);
                })
            ) {
                this.$.showToast(
                    ui.localize(
                        '@sage/x3-stock/serial-number-range-overlap',
                        'The serial numbers are overlapping. Enter another starting or ending serial number.',
                    ),
                    { type: 'error' },
                );
                return;
            }

            if (
                this.stockCountList.value &&
                this.quantity.value &&
                this.startingSerialNumber.value &&
                this.endingSerialNumber.value
            ) {
                this.serialNumberLines.addRecord({
                    stockCountListNumber: this.stockCountList.value,
                    quantity: this.quantity.value,
                    startingSerialNumber: this.startingSerialNumber.value,
                    endingSerialNumber: this.endingSerialNumber.value,
                    stockSite: { code: this._stockSite.code },
                });
            }

            if (this.projectedBalance.value)
                this.projectedBalance.value -=
                    (this.quantity.value ? this.quantity.value : 0) * (this.startingSerialNumber.isNewEnabled ? 1 : -1);
            this.startingSerialNumber.value = this.endingSerialNumber.value = null;
            this.quantity.max = this.quantity.value = Math.abs(
                this.projectedBalance.value ? this.projectedBalance.value : 0,
            );
            if (!this.quantity.value) this.quantity.value = null;
        },
    })
    addSerialRange: ui.PageAction;

    /*
     *
     *  Helper Functions
     *
     */

    private async _onChangeBody() {
        if (
            !this.quantity.value ||
            !this.startingSerialNumber.value ||
            (await this.quantity.validate()) ||
            (await this.startingSerialNumber.validate())
        ) {
            this.endingSerialNumber.value = null;
            return;
        }

        this.startingSerialNumber.value = this.startingSerialNumber.value.toUpperCase();
        if (this.quantity.value > 1) {
            this.endingSerialNumber.value = this._calculateEndingSerialNumber(
                this.startingSerialNumber.value,
                this.quantity.value,
            );
        } else {
            this.endingSerialNumber.value = this.startingSerialNumber.value;
        }

        // validate range does not contain existing or non-existent serial numbers
        await this.$.commitValueAndPropertyChanges();
        let validationResult;
        if ((validationResult = await this.endingSerialNumber.validate())) {
            this.$.showToast(validationResult, { type: 'warning' });
        }
    }

    private _calculateEndingSerialNumber(startingSerialNumber: string, quantity: number): string {
        return startingSerialNumber.replace(/\d+$/, match => {
            const endingNumber = (Number(match) + quantity - 1).toString();
            const lengthDiff = Math.max(endingNumber.length - match.length, 0);
            return endingNumber.padStart(match.length + lengthDiff, '0');
        });
    }
}
