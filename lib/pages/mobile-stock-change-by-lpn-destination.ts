import { dialogMessage } from '@sage/x3-master-data/lib/client-functions/dialogs';
import { getPageValuesNotTransient } from '@sage/x3-master-data/lib/client-functions/get-page-values-not-transient';
import { onGoto } from '@sage/x3-master-data/lib/client-functions/on-goto';
import { StockChangeLineByLpnInput } from '@sage/x3-stock-api';
import { LicensePlateNumber, Location, Stock, StockStatus } from '@sage/x3-stock-data-api';
import { extractEdges } from '@sage/xtrem-client';
import * as ui from '@sage/xtrem-ui';
import { inputsStockChangeByLpn } from './mobile-stock-change-by-lpn';

@ui.decorators.page<MobileStockChangeByLpnDestination>({
    title: 'Stock change by LPN',
    subtitle: 'Enter destination',
    mode: 'default',
    isTransient: false,
    isTitleHidden: true,
    headerCard() {
        return {
            title: this.licensePlateNumber,
            titleRight: this.location,
            line2: this.product,
            line2Right: this.lot,
        };
    },
    async onLoad() {
        // TODO: Insert logic here to populate values on the header card based on user inputs from MobileInternalStockChangeByLpn page
        this.stockSite.value = this.$.storage.get('mobile-selected-stock-site') as string;
        const _inputStockChangeByLpn = this._getSavedInputs();

        if (!_inputStockChangeByLpn?.selectedLicensePlateNumber?.code) {
            this.nextButton.isHidden = true;
            this.viewStockByLpn.isHidden = true;
            this.block.isHidden = true;
            return;
        }

        this._stockChangeLines = _inputStockChangeByLpn?.stockChangeByLpn?.stockChangeLines ?? [];

        //const currentLine = inputStockChangeByLpn.currentLine;

        this.licensePlateNumber.value = _inputStockChangeByLpn?.selectedLicensePlateNumber?.code ?? null;

        this._licensePlateNumber = await this._fetchLicensePlateNumber(this.licensePlateNumber.value ?? '');

        this.location.value = this._licensePlateNumber?.location?.code ?? null;

        if (this._licensePlateNumber.isSingleProduct) {
            this._LoadProductLotLpn();
        }

        this.statusDestination.options = await this._fetchStockStatuses();

        await this._fieldChangeTransactionLogic();
    },

    businessActions() {
        return [this.viewStockByLpn, this.nextButton];
    },
})
export class MobileStockChangeByLpnDestination extends ui.Page {
    /*
     *  Technical properties
     */
    private _licensePlateNumber: LicensePlateNumber;
    private _currentLine = 0;
    private _stockChangeLines: StockChangeLineByLpnInput[];
    /*
     * Technical fields
     */
    @ui.decorators.textField<MobileStockChangeByLpnDestination>({
        isTransient: true,
        isReadOnly: true,
    })
    licensePlateNumber: ui.fields.Text;

    @ui.decorators.textField<MobileStockChangeByLpnDestination>({
        isTransient: true,
        isReadOnly: true,
    })
    location: ui.fields.Text;

    @ui.decorators.textField<MobileStockChangeByLpnDestination>({
        isTransient: true,
        isReadOnly: true,
    })
    product: ui.fields.Text;

    @ui.decorators.textField<MobileStockChangeByLpnDestination>({
        isTransient: true,
        isReadOnly: true,
    })
    lot: ui.fields.Text;

    @ui.decorators.textField<MobileStockChangeByLpnDestination>({
        isTransient: true,
        isReadOnly: true,
    })
    stockSite: ui.fields.Text;
    /*
     *  Page Actions
     */
    @ui.decorators.pageAction<MobileStockChangeByLpnDestination>({
        title: 'View LPN',
        buttonType: 'secondary',
        isDisabled: false,
        async onClick() {
            // this._createDetail();
            this.$.setPageClean();
            const stockSite = String(this.stockSite.value);
            const location = String(this.location.value);
            const licensePlateNumber = this.licensePlateNumber.value ?? undefined;

            const response = extractEdges(
                await this.$.graph
                    .node('@sage/x3-stock-data/Stock')
                    .aggregate.query(
                        ui.queryUtils.edgesSelector(
                            {
                                group: {
                                    product: {
                                        product: {
                                            code: true,
                                        },
                                    },
                                },
                            },
                            {
                                filter: {
                                    stockSite: {
                                        code: stockSite,
                                    },
                                    location: {
                                        code: location,
                                    },
                                    licensePlateNumber: licensePlateNumber,
                                },
                            },
                        ),
                    )
                    .execute(),
            );
            onGoto(this, '@sage/x3-stock/MobileViewStockByLpnSelectProduct', {
                licensePlateNumber: licensePlateNumber ?? '',
                location: location.toString(),
                distinctProductCount: response.length,
            });
        },
    })
    viewStockByLpn: ui.PageAction;

    @ui.decorators.pageAction<MobileStockChangeByLpnDestination>({
        title: 'Next',
        buttonType: 'primary',
        isDisabled: true,
        onClick() {
            this._createDetail();
            onGoto(this, '@sage/x3-stock/MobileStockChangeByLpn', { ReturnFromDetail: 'yes' });
        },
    })
    nextButton: ui.PageAction;
    /*
     *  Sections
     */
    @ui.decorators.section<MobileStockChangeByLpnDestination>({
        isTitleHidden: true,
    })
    section: ui.containers.Section;
    /*
     *  Blocks
     */
    @ui.decorators.block<MobileStockChangeByLpnDestination>({
        parent() {
            return this.section;
        },
        isTitleHidden: true,
    })
    block: ui.containers.Block;
    /*
     * Page fields
     */
    @ui.decorators.referenceField<MobileStockChangeByLpnDestination, Location>({
        parent() {
            return this.block;
        },
        title: 'Destination location',
        node: '@sage/x3-stock-data/Location',
        valueField: 'code',
        placeholder: 'Scan or select...',
        isTransient: true,
        //isMandatory: true,
        isAutoSelectEnabled: true,
        isFullWidth: true,
        isHidden: true,
        canFilter: false,
        filter() {
            return {
                stockSite: { code: this.stockSite.value ?? undefined },
                category: { _nin: ['subcontract', 'customer'] },
            };
        },
        async onChange() {
            this.nextButton.isDisabled = !this.locationDestination.value;
            await this.$.commitValueAndPropertyChanges();
            this.locationDestination.getNextField(true)?.focus();
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

    @ui.decorators.selectField<MobileStockChangeByLpnDestination>({
        parent() {
            return this.block;
        },
        title: 'Destination status',
        //isMandatory: true,
        isTransient: true,
        isHidden: true,
        onChange() {
            this.nextButton.isDisabled = !this.statusDestination.value;
        },
    })
    statusDestination: ui.fields.Select;

    /*
     *  Functions
     */

    private async _fetchLicensePlateNumber(licensePlateNumberCode: string): Promise<LicensePlateNumber | never> {
        // read license plate number record
        const response = await this.$.graph
            .node('@sage/x3-stock-data/LicensePlateNumber')
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

        // If an error occurred during the API call
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

    private async _fetchStockStatuses(): Promise<string[] | never> {
        const response = extractEdges<StockStatus>(
            await this.$.graph
                .node('@sage/x3-stock-data/StockStatus')
                .query(
                    ui.queryUtils.edgesSelector<StockStatus>({
                        _id: true,
                        code: true,
                    }),
                )
                .execute(),
        );
        if (!response || response.length === 0) {
            throw new Error(
                ui.localize(
                    '@sage/x3-stock/pages__mobile_stock_change_destination__notification__invalid_stock_status_error',
                    'No stock status',
                ),
            );
        }
        return response.map((stockStatus: StockStatus) => stockStatus.code);
    }

    private async _LoadProductLotLpn(): Promise<void> {
        try {
            const _stocks = extractEdges<Stock>(
                await this.$.graph
                    .node('@sage/x3-stock-data/Stock')
                    .query(
                        ui.queryUtils.edgesSelector<Stock>(
                            {
                                product: { product: { code: true } },
                                lot: true,
                            },
                            {
                                filter: { licensePlateNumber: this.licensePlateNumber.value ?? undefined },
                            },
                        ),
                    )
                    .execute(),
            );

            if (_stocks.length) {
                this.product.value = _stocks[0].product?.product?.code ? _stocks[0].product.product.code : '';
                if (this._licensePlateNumber.isSingleLot) {
                    this.lot.value = _stocks[0].lot ? _stocks[0].lot : '';
                } else {
                    this.lot.value = null;
                }
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

    private _getSavedInputs(): inputsStockChangeByLpn {
        return JSON.parse(this.$.storage.get('mobile-stockChangeByLpn') as string) as inputsStockChangeByLpn;
    }

    private _createDetail() {
        const values = getPageValuesNotTransient(this);

        this._currentLine = this._stockChangeLines.push(values) - 1;

        this._saveDetail();
    }

    private _saveDetail() {
        const currentStockChangeLines = this._stockChangeLines[this._currentLine];
        this._stockChangeLines[this._currentLine] = {
            ...currentStockChangeLines,
        };
        this._saveStockChange();
    }

    private _saveStockChange() {
        const _savedInputs = this._getSavedInputs();
        _savedInputs.stockChangeByLpn.stockChangeLines = this._stockChangeLines;
        _savedInputs.currentLine = this._currentLine;

        const currentLine = _savedInputs.currentLine;

        _savedInputs.stockChangeByLpn.stockChangeLines[currentLine].licensePlateNumber =
            this.licensePlateNumber.value ?? undefined;

        if (!this.statusDestination.isHidden) {
            _savedInputs.stockChangeByLpn.stockChangeLines[currentLine].status = this.statusDestination.value
                ? this.statusDestination.value
                : '';
        }
        if (!this.locationDestination.isHidden) {
            _savedInputs.stockChangeByLpn.stockChangeLines[currentLine].location = this.locationDestination.value
                ? this.locationDestination.value.code
                : '';
        }

        _savedInputs.stockChangeByLpn.stockChangeLines[currentLine] = {
            ..._savedInputs.stockChangeByLpn.stockChangeLines[currentLine],
        };

        this.$.storage.set('mobile-stockChangeByLpn', JSON.stringify(_savedInputs));
    }

    private async _fieldChangeTransactionLogic() {
        const _savedInputs = this._getSavedInputs();
        const transaction = _savedInputs.selectedTransaction;
        this.locationDestination.isHidden = !transaction.isLocationChange;
        this.locationDestination.isMandatory = !transaction.isLocationChange;
        this.statusDestination.isHidden = !transaction.isStatusChange;
        this.statusDestination.isMandatory = !transaction.isStatusChange;
    }
}
