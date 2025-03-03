import { dialogConfirmation, dialogMessage } from '@sage/x3-master-data/lib/client-functions/dialogs';
import { getPageValuesNotTransient } from '@sage/x3-master-data/lib/client-functions/get-page-values-not-transient';
import { StockChangeLineByLpnInput } from '@sage/x3-stock-api';
import { LicensePlateNumber, Stock } from '@sage/x3-stock-data-api';
import { ExtractEdges, extractEdges } from '@sage/xtrem-client';
import * as ui from '@sage/xtrem-ui';
import { inputsLpnGrouping } from './mobile-lpn-grouping';

@ui.decorators.page<MobileLpnGroupingSelectLpn>({
    title: 'LPN grouping',
    subtitle: 'Select LPN',
    mode: 'default',
    isTransient: false,
    isTitleHidden: true,
    headerCard() {
        return {
            title: this.licensePlateNumberDestination,
            titleRight: this.location,
            line2: this.product,
            line2Right: this.lot,
        };
    },
    async onLoad() {
        this.stockSite.value = this.$.storage.get('mobile-selected-stock-site') as string;
        const inputStockChangeByLpn = this._getSavedInputs();

        if (!this.stockSite.value || !inputStockChangeByLpn?.selectedDestinationLPN?.code) {
            this.nextButton.isHidden = true;
            this.viewStockByLpn.isHidden = true;
            this.block.isHidden = true;
            return;
        }

        this._stockChangeLines = inputStockChangeByLpn?.stockChangeByLpn?.stockChangeLines;
        this.licensePlateNumberDestination.value = inputStockChangeByLpn?.selectedDestinationLPN?.code;
        this._licensePlateNumber = await this._fetchLicensePlateNumber(this.licensePlateNumberDestination.value ?? '');
        this.location.value = this._licensePlateNumber?.location
            ? this._licensePlateNumber?.location?.code ?? null
            : inputStockChangeByLpn?.destinationLocation ?? null;

        if (this._licensePlateNumber?.isSingleProduct) {
            await this._loadProductLotLpn();
        }
        this.licensePlateNumber.focus();
    },
    businessActions() {
        return [this.nextButton, this.moreButton, this.viewStockByLpn];
    },
})
export class MobileLpnGroupingSelectLpn extends ui.Page {
    /*
     *  Technical properties
     */
    private _licensePlateNumber: LicensePlateNumber;
    private _currentLine = 0;
    private _stockChangeLines: StockChangeLineByLpnInput[];
    /*
     * Technical fields
     */
    @ui.decorators.textField<MobileLpnGroupingSelectLpn>({
        isTransient: true,
        isReadOnly: true,
    })
    licensePlateNumberDestination: ui.fields.Text;

    @ui.decorators.textField<MobileLpnGroupingSelectLpn>({
        isTransient: true,
        isReadOnly: true,
    })
    location: ui.fields.Text;

    @ui.decorators.textField<MobileLpnGroupingSelectLpn>({
        isTransient: true,
        isReadOnly: true,
    })
    product: ui.fields.Text;

    @ui.decorators.textField<MobileLpnGroupingSelectLpn>({
        isTransient: true,
        isReadOnly: true,
    })
    lot: ui.fields.Text;

    @ui.decorators.textField<MobileLpnGroupingSelectLpn>({
        isTransient: true,
        isReadOnly: true,
    })
    stockSite: ui.fields.Text;
    /*
     *  Page Actions
     */
    @ui.decorators.pageAction<MobileLpnGroupingSelectLpn>({
        title: 'Next',
        buttonType: 'primary',
        isDisabled: true,
        shortcut: ['f3'],
        async onClick() {
            if (this.licensePlateNumber.value?.code) {
                this._createDetail();
            }
            this.$.setPageClean();
            this.$.router.goTo('@sage/x3-stock/MobileLpnGrouping', { ReturnFromDetail: 'yes' });
        },
    })
    nextButton: ui.PageAction;

    @ui.decorators.pageAction<MobileLpnGroupingSelectLpn>({
        title: 'Add LPN',
        buttonType: 'secondary',
        isDisabled: true,
        shortcut: ['f7'],
        async onClick() {
            if (this.licensePlateNumber.value?.code) {
                this._createDetail();
                this.licensePlateNumber.value = null;
                this.licensePlateNumber.focus();
                await this.$.commitValueAndPropertyChanges();
            }
        },
    })
    moreButton: ui.PageAction;

    @ui.decorators.pageAction<MobileLpnGroupingSelectLpn>({
        title: 'View stock by LPN',
        buttonType: 'secondary',
        isDisabled: false,
        async onClick() {
            this.$.setPageClean();
            this.$.router.goTo('@sage/x3-stock/MobileViewStockByLpn');
        },
    })
    viewStockByLpn: ui.PageAction;

    /*
     *  Sections
     */
    @ui.decorators.section<MobileLpnGroupingSelectLpn>({
        isTitleHidden: true,
    })
    section: ui.containers.Section;
    /*
     *  Blocks
     */
    @ui.decorators.block<MobileLpnGroupingSelectLpn>({
        parent() {
            return this.section;
        },
        isTitleHidden: true,
    })
    block: ui.containers.Block;

    /*
     * Page fields
     */

    @ui.decorators.referenceField<MobileLpnGroupingSelectLpn, LicensePlateNumber>({
        parent() {
            return this.block;
        },
        title: 'License plate number to group',
        node: '@sage/x3-stock-data/LicensePlateNumber',
        valueField: 'code',
        placeholder: 'Scan or select…',
        isMandatory: true,
        isTransient: true,
        canFilter: false,
        isAutoSelectEnabled: true,
        isDisabled: false,
        isFullWidth: true,
        shouldSuggestionsIncludeColumns: true,
        filter() {
            return {
                _and: [
                    { isActive: true },
                    { status: { _eq: 'inStock' } },
                    { stockSite: { code: this.stockSite.value } },
                    // { code: { _ne: this.licensePlateNumberDestination.value } },
                ],
            };
        },
        async onChange() {
            if (this.licensePlateNumber.value?.code) {
                // Make sure they didn't enter the destination LPN
                if (this.licensePlateNumber.value.code === this.licensePlateNumberDestination.value) {
                    this.$.showToast(
                        ui.localize(
                            '@sage/x3-stock/dialog-error-same-as-destination-lpn',
                            'LPN selected is the LPN destination',
                        ),
                        { type: 'error' },
                    );
                    this.licensePlateNumber.value = null;
                    this.licensePlateNumber.focus();
                    return;
                }
                // See if we need to check the product and lot
                // associated with the LPN to group
                if (this.product.value || this.lot.value) {
                    if (!(await this._checkStock())) {
                        this.licensePlateNumber.value = null;
                        this.licensePlateNumber.focus();
                        return;
                    }

                    //check if product is blocked by count
                    const response = await this.$.graph
                        .node('@sage/x3-master-data/ProductSite')
                        .query(
                            ui.queryUtils.edgesSelector(
                                {
                                    isBeingCounted: true,
                                },
                                {
                                    filter: {
                                        product: {
                                            code: this.product.value,
                                        },
                                        stockSite: {
                                            code: this.stockSite.value,
                                        },
                                    },
                                },
                            ),
                        )
                        .execute();

                    if (response.edges[0].node?.isBeingCounted === true) {
                        if (
                            !(await dialogConfirmation(
                                this,
                                'warn',
                                ui.localize('@sage/x3-stock/dialog-warning-title', 'Warning'),
                                ui.localize(
                                    '@sage/x3-stock/product-blocked-by-count-continue',
                                    'Product blocked by count. Do you want to continue?',
                                ),
                                {
                                    acceptButton: {
                                        text: ui.localize('@sage/x3-stock/button-accept-yes', 'Yes'),
                                    },
                                    cancelButton: {
                                        text: ui.localize('@sage/x3-stock/button-cancel-no', 'No'),
                                    },
                                },
                            ))
                        ) {
                            this.licensePlateNumber.value = null;
                            this.licensePlateNumber.focus();
                            return;
                        }
                    }
                }
                // Check to see if the user already chose this LPN
                // Don't allow them to add a duplicate LPN
                if (
                    this._stockChangeLines.find(lpn => lpn.licensePlateNumber === this.licensePlateNumber.value?.code)
                ) {
                    this.$.showToast(
                        ui.localize('@sage/x3-stock/dialog-error-lpn-already-in-use', 'LPN already in use'),
                        { type: 'error' },
                    );
                    this.licensePlateNumber.value = null;
                    this.licensePlateNumber.focus();
                    return;
                }
                this.moreButton.isDisabled = false;
                this.nextButton.isDisabled = false;
            } else {
                this.moreButton.isDisabled = true;
                this.nextButton.isDisabled = true;
            }
        },
        columns: [
            ui.nestedFields.text({
                bind: 'code',
                title: 'License plate number to group',
            }),
            ui.nestedFields.reference({
                node: '@sage/x3-stock-data/Location',
                title: 'Location',
                bind: 'location',
                valueField: 'code',
                isHidden: false,
            }),
            ui.nestedFields.text({
                bind: 'status',
                title: 'Status',
                isHidden: false,
            }),
            ui.nestedFields.checkbox({
                title: 'Single product',
                bind: 'isSingleProduct',
                isHidden: true,
            }),
            ui.nestedFields.checkbox({
                title: 'Single lot',
                bind: 'isSingleLot',
                isHidden: true,
            }),
        ],
    })
    licensePlateNumber: ui.fields.Reference;

    /*
     *  Functions
     */

    private async _fetchLicensePlateNumber(licensePlateNumberCode: string): Promise<LicensePlateNumber | never> {
        // read license plate number record
        const response = await this.$.graph
            .node('@sage/x3-stock-data/license-plate-number')
            .read(
                {
                    code: true,
                    location: {
                        code: true,
                    },
                    isSingleProduct: true,
                    isSingleLot: true,
                    status: true,
                    container: {
                        code: true,
                    },
                    stockSite: {
                        code: true,
                    },
                },
                `${licensePlateNumberCode}`,
            )
            .execute();

        // If an error occurred
        if (!response) {
            throw new Error(
                ui.localize(
                    '@sage/x3-stock/pages__mobile_stock_change_by_lpn_destination__notification__invalid_license_plate_number_error',
                    `Could not retrieve your licensePlateNumber {{ licensePlateNumberCode }}`,
                    {
                        licensePlateNumberCode: licensePlateNumberCode,
                    },
                ),
            );
        }
        return response;
    }

    private async _loadProductLotLpn(): Promise<void> {
        try {
            const result = extractEdges(
                await this.$.graph
                    .node('@sage/x3-stock-data/Stock')
                    .query(
                        ui.queryUtils.edgesSelector(
                            {
                                product: { product: { code: true } },
                                lot: true,
                            },
                            {
                                filter: { licensePlateNumber: this.licensePlateNumberDestination.value },
                                first: 1,
                            },
                        ),
                    )
                    .execute(),
            ) as ExtractEdges<Stock>[];
            if (result.length !== 0) {
                this.product.value = result[0].product?.product?.code ?? '';
                this.lot.value = this._licensePlateNumber?.isSingleLot ? result[0]?.lot ?? '' : null;
            }
            return;
        } catch (e) {
            await dialogMessage(
                this,
                'error',
                ui.localize('@sage/x3-stock/error-loading-stock', 'Error loading stock'),
                String(e),
            );
            return;
        }
    }

    private _getSavedInputs(): inputsLpnGrouping {
        return JSON.parse(this.$.storage.get('mobile-lpnGrouping') as string) as inputsLpnGrouping;
    }

    private _createDetail() {
        const values = getPageValuesNotTransient(this);
        this._currentLine = this._stockChangeLines.push(values) - 1;
        this._saveDetail();
    }

    private _saveDetail() {
        let currentStockChangeLines = this._stockChangeLines[this._currentLine];
        this._stockChangeLines[this._currentLine] = {
            ...currentStockChangeLines,
        };
        this._saveStockChange();
    }

    private _saveStockChange() {
        let savedInputs = this._getSavedInputs();

        savedInputs.stockChangeByLpn.stockChangeLines = this._stockChangeLines;
        savedInputs.currentLine = this._currentLine;

        const currentLine = savedInputs.currentLine;

        savedInputs.stockChangeByLpn.stockChangeLines[currentLine].licensePlateNumber =
            this.licensePlateNumber.value?.code;

        savedInputs.stockChangeByLpn.stockChangeLines[currentLine] = {
            ...savedInputs.stockChangeByLpn.stockChangeLines[currentLine],
        };

        this.$.storage.set('mobile-lpnGrouping', JSON.stringify(savedInputs));
    }
    /*
     * Check the stock records for the entered LPN to ensure it doesn't contain
     * product(s) or lot(s) that conflict with the destination LPN
     */
    private async _checkStock(): Promise<boolean> {
        try {
            let stockFilter: any;
            if (this.lot.value) {
                stockFilter = {
                    stockSite: this.stockSite.value,
                    licensePlateNumber: this.licensePlateNumber.value?.code,
                    _or: [{ product: { _ne: this.product.value } }, { lot: { _ne: this.lot.value } }],
                };
            } else {
                stockFilter = {
                    stockSite: this.stockSite.value,
                    licensePlateNumber: this.licensePlateNumber.value?.code,
                    product: { _ne: this.product.value },
                };
            }

            const result = await this.$.graph
                .node('@sage/x3-stock-data/Stock')
                .query(
                    ui.queryUtils.edgesSelector(
                        {
                            product: { product: { code: true } },
                            lot: true,
                        },
                        {
                            filter: stockFilter,
                        },
                    ),
                )
                .execute();
            if (result.edges.length > 0) {
                this.$.removeToasts();
                this.$.showToast(
                    ui.localize(
                        '@sage/x3-stock/dialog-error-singleProductOrLot',
                        'LPN contains product(s) or lot(s) that cannot be grouped',
                    ),
                    { type: 'error' },
                );
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
}
