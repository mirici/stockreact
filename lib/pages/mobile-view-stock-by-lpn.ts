import { getSelectedStockSite } from '@sage/x3-master-data/lib/client-functions/get-selected-stock-site';
import { GraphApi, LicensePlateNumber } from '@sage/x3-stock-data-api';
import { stockControl } from '@sage/x3-stock-data/build/lib/menu-items/stock-control';
import { extractEdges } from '@sage/xtrem-client';
import * as ui from '@sage/xtrem-ui';

@ui.decorators.page<MobileViewStockByLpn, LicensePlateNumber>({
    title: 'View stock by LPN', // this value is used to integrate with the feature header's name and in the landing page's menu
    isTitleHidden: true, // hide the page's title and render that title only in the feature header instead of in both places (see X3-177000 & https://github.com/Sage-ERP-X3/etna/pull/1785)
    menuItem: stockControl,
    priority: 600,
    node: '@sage/x3-stock-data/LicensePlateNumber',
    mode: 'default',
    authorizationCode: 'INQSTOLPN',
    skipDirtyCheck: true,
    async onLoad() {
        await this._init();
    },
    navigationPanel: {
        isHeaderHidden: true,
        canFilter: false,
        isAutoSelectEnabled: true,
        listItem: {
            title: ui.nestedFields.text({ bind: 'code' }),
            line2: ui.nestedFields.text({ bind: 'status' }),
            line3: ui.nestedFields.reference({
                node: '@sage/x3-stock-data/Location',
                bind: 'location',
                valueField: 'code',
            }),
            line4: ui.nestedFields.checkbox({ bind: 'isActive', isHidden: true }),
            line5: ui.nestedFields.checkbox({ bind: 'isSingleProduct', isHidden: true }),
        },
        optionsMenu: [
            {
                title: 'Default Site',
                graphQLFilter: storage => ({ stockSite: { code: String(storage.get('mobile-selected-stock-site')) } }),
            },
        ],
        onSelect(listItemValue: any) {
            // If the selected LPN has zero products or is inactive, then display an informational message
            if (!listItemValue.isActive) {
                this.$.removeToasts();
                setTimeout(
                    () =>
                        this.$.showToast(
                            ui.localize(
                                '@sage/x3-stock/notification-warning-lpn-inquiry-inactive-lpn',
                                'LPN {{code}} is inactive',
                                { code: listItemValue.code },
                            ),
                            { type: 'info' },
                        ),
                    10,
                );
            } else {
                // Go to the second page to select a product
                this.$.router.goTo('@sage/x3-stock/MobileViewStockByLpnSelectProduct', {
                    _id: listItemValue._id,
                    location: listItemValue.location?.code ?? '',
                });
            }

            return true;
        },
    },
})
export class MobileViewStockByLpn extends ui.Page<GraphApi> {
    @ui.decorators.section<MobileViewStockByLpn>({
        isHidden: true,
    })
    mainSection: ui.containers.Section;

    @ui.decorators.block<MobileViewStockByLpn>({
        parent() {
            return this.mainSection;
        },
    })
    mainBlock: ui.containers.Block;

    @ui.decorators.labelField<MobileViewStockByLpn>({
        parent() {
            return this.mainBlock;
        },
        isTransient: true,
        isHidden: true,
    })
    stockSite: ui.fields.Label;

    private async _init(): Promise<void> {
        await this._initSite();
    }

    private async _initSite(): Promise<void> {
        this.stockSite.value = await getSelectedStockSite(
            this,
            ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
            ui.localize(
                '@sage/x3-stock/dialog-error-location-inquiry-set-site',
                'Define a default stock site on the user function profile.',
            ),
        );
    }

    private async _goToProductDetailsPage(
        licensePlate: string,
        identifier: string,
        locationCode: string,
    ): Promise<any | Error> {
        const aggregateResult = extractEdges(
            await this.$.graph
                .node('@sage/x3-stock-data/Stock')
                .aggregate.query(
                    ui.queryUtils.edgesSelector(
                        {
                            group: {
                                product: {
                                    product: {
                                        code: {
                                            _by: 'value',
                                        },
                                        lotManagementMode: {
                                            _by: 'value',
                                        },
                                        stockUnit: {
                                            code: {
                                                _by: 'value',
                                            },
                                        },
                                    },
                                },
                            },
                            values: {
                                quantityInStockUnit: { sum: true },
                            },
                        },
                        {
                            filter: {
                                licensePlateNumber: { code: licensePlate },
                                stockSite: this.stockSite.value,
                            },
                            first: 500,
                        },
                    ),
                )
                .execute(),
        );

        // Verify if selected lpn yields at least one result by checking the existence of any aggregated stock quantity sum
        // if not, reload this page
        if (aggregateResult.length === 0) {
            this.$.showToast(
                ui.localize(
                    '@sage/x3-stock/notification-warning-lpn-inquiry-zero-products',
                    'The {{code}} LPN has no products.',
                    { code: licensePlate },
                ),
                { type: 'info' },
            );
            this.$.router.goTo('@sage/x3-stock/MobileViewStockByLpn');
            return;
        }

        // Rare, but another product could have been added since the entry was displayed on the screen
        // If so, then go to the second page instead of the third
        if (aggregateResult.length > 1) {
            // Go to the second page to select a product
            this.$.router.goTo('@sage/x3-stock/MobileViewStockByLpnSelectProduct', {
                _id: identifier,
                distinctProductCount: aggregateResult.length,
                location: locationCode,
            });
        }

        // Go to 3rd page
        let productDetails: any;
        productDetails = aggregateResult.map(
            (
                value: any,
            ): {
                product: string;
                stockQuantity: number;
                stockUnit: string;
            } => {
                return {
                    product: value.group.product.product.code,
                    stockQuantity: value.values.quantityInStockUnit.sum,
                    stockUnit: value.group.product.product.stockUnit.code,
                };
            },
        );

        this.$.router.goTo('@sage/x3-stock/MobileViewStockByLpnProductDetails', {
            licensePlateNumber: licensePlate,
            product: productDetails[0].product,
            stockQuantity: productDetails[0].stockQuantity,
            stockUnit: productDetails[0].stockUnit,
            location: locationCode,
        });
    }
}
