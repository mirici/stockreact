import { GraphApi, Stock } from '@sage/x3-stock-data-api';
import {
    AggregateEdgesSelector,
    AggregateGroupSelector,
    AggregateQueryOptions,
    AggregateQuerySelector,
    AggregateValuesSelector,
    ClientNode,
    Edges,
    aggregateEdgesSelector,
    extractEdges,
    integer,
} from '@sage/xtrem-client';
import * as ui from '@sage/xtrem-ui';

interface LocationAggregations {
    stockUnit: string;
    stockQuantity: number;
    distinctLotCount: number;
    distinctLpnCount: number;
}

// TODO: use lot management enum. See Jira ticket X3-162570.
const lotNotManaged = 'notManaged';

@ui.decorators.page<MobileViewStockByProductSiteSelectLocation>({
    node: '@sage/x3-master-data/ProductSite',
    mode: 'default',
    isTitleHidden: true,
    title: 'Stock by product-site',
    subtitle: 'Select a location',
    skipDirtyCheck: true,
    navigationPanel: undefined,
    headerCard() {
        return {
            title: this.product,
            titleRight: this.distinctLocations,
            line2: this.lotsAndSublots,
            line2Right: this.locationTitleLpnCounter,
        };
    },

    async onLoad() {
        // Requires a selected product in the query parameters.  This should not occur unless user manually
        // directs themselves to this page
        const productParameter: string | number | boolean = this.$.queryParameters.product;
        const mess: string = ui.localize('@sage/x3-stock/product-required', 'Selected product is required');
        if (!productParameter) {
            this.$.showToast(mess, { type: 'warning' });
            this.$.router.goTo(`@sage/x3-stock/MobileViewStockByProductSite`);
            return;
        }

        this.product.value = productParameter.toString();
        this.site.value = String(this.$.queryParameters.site);
        await this._getProductSite();
        this.isLicensePlateNumberManaged.value = String(this.$.queryParameters.isLicensePlateNumberManaged);
        this.lotManagementMode.value = String(this.$.queryParameters.lotManagementMode);

        this.mainBlock.title = this.distinctLocations.value as string;

        const aggregatedResults = await this.batchAggregateRequests();

        // Redirect user to first page if selected product yields no records.  User should not get to this page
        // if no stock records unless manually entering page.
        if (!aggregatedResults.aggregateSumStockQuantity.edges) {
            this.$.showToast(
                ui.localize(
                    '@sage/x3-stock/notification-warning-product-inquiry-zero-products',
                    'Product {{code}} has zero locations(s)',
                    { code: this.product.value },
                ),
                { type: 'error' },
            );
            this.$.router.goTo('@sage/x3-stock/MobileViewStockByProductSite');
            return;
        }

        // initialize data structure map (aka. dictionary) to consolidate and store aggregated values to the corresponding location
        const aggregationsLocationMap = new Map<string /*key is location code*/, LocationAggregations>();

        // populate map with all existing locations (+ products' stock units) in stock node given selected default site & product
        extractEdges(aggregatedResults.aggregateSumStockQuantity as Edges<any>).forEach(aggregation => {
            aggregationsLocationMap.set(aggregation.group.location.code, {
                stockUnit: aggregation.group.product.product.stockUnit.code,
                stockQuantity: Number(aggregation.values.quantityInStockUnit.sum),
                distinctLotCount: 0,
                distinctLpnCount: 0,
            });
        });

        // make all forEach() calls optional because there can be no stock records with any lots for a location
        extractEdges(aggregatedResults.aggregateDistinctLots as Edges<any>)?.forEach(aggregation => {
            if (aggregationsLocationMap.has(aggregation.group.location.code)) {
                aggregationsLocationMap.get(aggregation.group.location.code).distinctLotCount =
                    aggregation.values.lot.distinctCount;
            }
        });

        let lpnCounter: integer = 0;
        extractEdges(aggregatedResults.aggregateDistinctLpn as Edges<any>)?.forEach(aggregation => {
            if (aggregationsLocationMap.has(aggregation.group.location.code)) {
                aggregationsLocationMap.get(aggregation.group.location.code).distinctLpnCount =
                    aggregation.values.licensePlateNumber.code.distinctCount;
                lpnCounter = lpnCounter + aggregation.values.licensePlateNumber.code.distinctCount;
            }
        });

        if (this.isLicensePlateNumberManaged.value === 'true') {
            this.locationTitleLpnCounter.value = ui.localize('@sage/x3-stock/locations-title', 'LPNs: {{counter}}', {
                counter: lpnCounter,
            });
        }

        const locationsValue = new Array<{
            _id: string;
            location: string;
            stockQuantity: string;
            stockUnit: string;
            distinctLotCount: number;
            numberOfLPN: string;
        }>();
        aggregationsLocationMap.forEach((value: LocationAggregations, key: string) => {
            locationsValue.push({
                _id: key, // this is required, otherwise during onRowClick, rowItem will be blank
                location: key,
                stockQuantity: `${value.stockQuantity.toString()} ${value.stockUnit}`,
                stockUnit: value.stockUnit,
                distinctLotCount: value.distinctLotCount,
                numberOfLPN:
                    value.distinctLpnCount > 0
                        ? ui.localize('@sage/x3-stock/number-of-lpn', '{{distinctLpnCount}} LPN', {
                              distinctLpnCount: value.distinctLpnCount,
                          })
                        : '',
            });
        });
        if (locationsValue.length === 0) {
            setTimeout(
                () =>
                    this.$.showToast(
                        ui.localize(
                            '@sage/x3-stock/selected-product-no-results',
                            'Product {{code}} has no stock records.',
                            {
                                code: productParameter as string,
                            },
                        ),
                        { type: 'info' },
                    ),
                10,
            );
            this.$.router.goTo(`@sage/x3-stock/MobileViewStockByProductSite`);
            return;
        }
        this.locations.value = locationsValue;
    },
})
export class MobileViewStockByProductSiteSelectLocation extends ui.Page<GraphApi> {
    @ui.decorators.section<MobileViewStockByProductSiteSelectLocation>({
        isTitleHidden: true,
    })
    mainSection: ui.containers.Section;

    @ui.decorators.block<MobileViewStockByProductSiteSelectLocation>({
        parent() {
            return this.mainSection;
        },
        isTitleHidden: false,
    })
    mainBlock: ui.containers.Block;

    @ui.decorators.textField<MobileViewStockByProductSiteSelectLocation>({
        isTransient: true,
        isReadOnly: true,
    })
    site: ui.fields.Text;

    @ui.decorators.textField<MobileViewStockByProductSiteSelectLocation>({
        isTransient: true,
        isReadOnly: true,
    })
    product: ui.fields.Text;

    @ui.decorators.textField<MobileViewStockByProductSiteSelectLocation>({
        isTransient: true,
        isReadOnly: true,
    })
    distinctLocations: ui.fields.Text;

    @ui.decorators.textField<MobileViewStockByProductSiteSelectLocation>({
        isTransient: true,
        isReadOnly: true,
    })
    lotsAndSublots: ui.fields.Text;

    @ui.decorators.textField<MobileViewStockByProductSiteSelectLocation>({
        isTransient: true,
        isReadOnly: true,
    })
    locationTitleLpnCounter: ui.fields.Text;

    @ui.decorators.textField<MobileViewStockByProductSiteSelectLocation>({
        isTransient: true,
        isReadOnly: true,
    })
    distinctLots: ui.fields.Text;

    @ui.decorators.textField<MobileViewStockByProductSiteSelectLocation>({
        isTransient: true,
        isReadOnly: true,
    })
    isLicensePlateNumberManaged: ui.fields.Text;

    @ui.decorators.textField<MobileViewStockByProductSiteSelectLocation>({
        isReadOnly: true,
        isTransient: true,
    })
    lotManagementMode: ui.fields.Text;

    @ui.decorators.tableField<MobileViewStockByProductSiteSelectLocation>({
        parent() {
            return this.mainBlock;
        },
        canSelect: false,
        canUserHideColumns: false,
        canFilter: false,
        isTransient: true,
        displayMode: ui.fields.TableDisplayMode.comfortable,
        mobileCard: undefined,
        async onRowClick(_id: string, rowItem) {
            if (
                this.isLicensePlateNumberManaged.value === 'true' &&
                (await this.confirmLicensePlates(this.product.value as string, rowItem.location))
            ) {
                this.$.router.goTo(`@sage/x3-stock/MobileViewStockByProductSiteSelectALpn`, {
                    site: this.site.value as string,
                    product: this.product.value as string,
                    location: rowItem.location,
                    stockUnit: rowItem.stockUnit,
                    lotManagementMode: this.lotManagementMode.value as string,
                });
            } else if (this.lotManagementMode.value === lotNotManaged) {
                this.$.router.goTo(`@sage/x3-stock/MobileViewStockByProductSiteProductDetails`, {
                    site: this.site.value as string,
                    product: this.product.value as string,
                    location: rowItem.location,
                    stockUnit: rowItem.stockUnit,
                    licensePlateNumber: '',
                });
            } else {
                this.$.router.goTo(`@sage/x3-stock/MobileViewStockByProductSiteProductDetails`, {
                    site: this.site.value as string,
                    product: this.product.value as string,
                    location: rowItem.location,
                    stockUnit: rowItem.stockUnit,
                    licensePlateNumber: '',
                });
            }
        },
        columns: [
            ui.nestedFields.text({
                bind: 'location',
                isReadOnly: true,
            }),
            ui.nestedFields.text({
                bind: 'stockQuantity',
                isReadOnly: true,
            }),
            ui.nestedFields.text({
                bind: 'stockUnit',
                isReadOnly: true,
                isHidden: true,
            }),
            ui.nestedFields.text({
                bind: 'distinctLotCount',
                isReadOnly: true,
                isHidden: true,
            }),
            ui.nestedFields.text({
                bind: 'numberOfLPN',
                isReadOnly: true,
            }),
        ],
    })
    locations: ui.fields.Table<any>;

    private generateAggregateStockRequest<T extends ClientNode>(
        selector: AggregateQuerySelector<T, AggregateGroupSelector<T>, AggregateValuesSelector<T>>,
        filter: AggregateQueryOptions<T>,
        numberOfRecords = 500,
    ) {
        const tempAggregateRequest: AggregateEdgesSelector<
            T,
            AggregateGroupSelector<T>,
            AggregateValuesSelector<T>
        > = aggregateEdgesSelector<T, AggregateGroupSelector<T>, AggregateValuesSelector<T>>(selector, filter);
        tempAggregateRequest.__args.first = numberOfRecords; // (X3-197381) TODO: Have to set some sort of hard limit. To be superseded in non-transient way
        return this.$.graph.node('@sage/x3-stock-data/Stock').aggregate.query(tempAggregateRequest);
    }

    private async batchAggregateRequests() {
        const groupByLocation: AggregateGroupSelector<Stock> = {
            location: {
                code: {
                    _by: 'value',
                },
            },
            product: {
                product: {
                    stockUnit: {
                        code: {
                            _by: 'value',
                        },
                    },
                },
            },
        };
        const filterByProduct = {
            product: { product: { code: this.product.value as string } },
            stockSite: this.$.storage.get('mobile-selected-stock-site') as string,
        };

        // Separate aggregate calls in order to exclude blank lots from distinct count
        const requests = {
            aggregateSumStockQuantity: this.generateAggregateStockRequest<Stock>(
                {
                    group: groupByLocation,
                    values: {
                        quantityInStockUnit: { sum: true },
                    },
                },
                {
                    filter: filterByProduct,
                },
            ),
            aggregateDistinctLots: this.generateAggregateStockRequest<Stock>(
                {
                    group: groupByLocation,
                    values: {
                        lot: { distinctCount: true },
                    },
                },
                {
                    filter: {
                        ...filterByProduct,
                        lot: { _ne: ' ' },
                    },
                },
            ),
            aggregateDistinctLpn: this.generateAggregateStockRequest<Stock>(
                {
                    group: groupByLocation,
                    values: {
                        licensePlateNumber: { code: { distinctCount: true } },
                    },
                },
                {
                    filter: {
                        ...filterByProduct,
                        licensePlateNumber: { code: { _ne: ' ' } },
                    },
                },
            ),
        };

        return await new ui.queryUtils.BatchRequest(requests).execute();
    }

    private async confirmLicensePlates(product: string, location: string): Promise<boolean> {
        const response = await this.$.graph
            .node('@sage/x3-stock-data/Stock')
            .query(
                ui.queryUtils.edgesSelector(
                    {
                        _id: true,
                        product: {
                            product: {
                                code: true,
                            },
                        },
                        location: {
                            code: true,
                        },
                        licensePlateNumber: {
                            code: true,
                        },
                    },
                    {
                        filter: {
                            location: {
                                code: location,
                            },
                            product: {
                                product: {
                                    code: product,
                                },
                            },
                            stockSite: {
                                code: this.site.value,
                            },
                        },
                    },
                ),
            )
            .execute();

        for (const currentRecord of response.edges) {
            if ((currentRecord.node.licensePlateNumber?.code ?? '') !== '') {
                // if there is atleast one stock record with a license plate number then return true to go to the lpn page
                return true;
            }
        }
        return false; // if all returned stock records for the product and location don't have an lpn then return false to go to the product details page
    }

    private async _getProductSite() {
        const _productSite = await this.$.graph
            .node('@sage/x3-master-data/ProductSite')
            .read(
                {
                    _id: true,
                    isLocationManaged: true,
                    isLicensePlateNumberManaged: true,
                    distinctCountOfLocations: true,
                    countOfStockRecords: true,
                    distinctCountOfStockQuantity: true,
                    distinctCountOfLots: true,
                    distinctCountOfSublots: true,
                    stockUnitCode: true,
                    product: {
                        code: true,
                        localizedDescription1: true,
                        upc: true,
                        lotManagementMode: true,
                    },
                    stockSite: {
                        code: true,
                    },
                },
                // TODO: find a better way if possible
                `${this.product.value}|${this.site.value}`,
            )
            .execute();

        if (_productSite.product.lotManagementMode === 'lotAndSublot') {
            this.lotsAndSublots.value = `${ui.localize('@sage/x3-stock/stock-by-product-site-lot', 'Lots: {{code}}', {
                code: _productSite.distinctCountOfLots,
            })} ${ui.localize('@sage/x3-stock/stock-by-product-site-sublots', 'Sublots: {{code}}', {
                code: _productSite.distinctCountOfSublots,
            })}`;
        } else if (_productSite.product.lotManagementMode === 'notManaged') {
            this.lotsAndSublots.value = '';
        } else {
            this.lotsAndSublots.value = `${ui.localize('@sage/x3-stock/stock-by-product-site-lot', 'Lots: {{code}}', {
                code: _productSite.distinctCountOfLots,
            })}`;
        }

        this.distinctLocations.value = ui.localize('@sage/x3-stock/location-title', 'Locations: {{code}}', {
            code: String(_productSite.distinctCountOfLocations),
        });
    }
}
