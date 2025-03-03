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
    ExtractEdgesPartial
} from '@sage/xtrem-client';
import * as ui from '@sage/xtrem-ui';
import { UnitOfMeasure } from '@sage/x3-master-data-api-partial';
import { getUnitNumberOfDecimalList, getNumberOfDecimal } from '../client-functions/get-unit-number-decimals';

interface LPNAggregations {
    stockQuantity: number;
    distinctLotCount: string;
}

// TODO: use lot management enum. See Jira ticket X3-162570.
const lotNotManaged = 'notManaged';

@ui.decorators.page<MobileViewStockByProductSiteSelectALpn>({
    isTitleHidden: true,
    title: 'Stock by product-site',
    subtitle: 'Select an LPN',
    isTransient: true,
    skipDirtyCheck: true,
    headerCard() {
        return {
            title: this.location,
            titleRight: this.stockQuantity,
            line2: this.product,
        };
    },
    async onLoad() {
        // Requires a selected location in the query parameters.  Should always exist unless user manually
        // navigates to this page.
        const locationParameter: string | number | boolean = this.$.queryParameters.location;
        if (!locationParameter) {
            this.$.showToast(ui.localize('@sage/x3-stock/location-required', 'Selected location is required'), {
                type: 'warning',
            });
            this.$.router.goTo(`@sage/x3-stock/MobileViewStockByProductSite`);
            return;
        }
        const siteParameter: string | number | boolean = this.$.queryParameters.site;
        const productParameter: string | number | boolean = this.$.queryParameters.product;
        const stockUnitParameter: string | number | boolean = this.$.queryParameters.stockUnit;
        const lotManagementMode: string | number | boolean = this.$.queryParameters.lotManagementMode;

        this._numberOfDecimalList = await getUnitNumberOfDecimalList(this);
        const numberDecimal: number = getNumberOfDecimal(this._numberOfDecimalList,stockUnitParameter.toString());

        this.product.value = productParameter.toString();
        this.location.value = locationParameter.toString();
        this.site.value = siteParameter.toString();
        this.stockUnit.value = stockUnitParameter.toString();
        this.lotManagementMode.value = lotManagementMode.toString();
        await this._getLocationQuantity();

        const aggregatedResults = await this.batchAggregateRequests();

        const aggregationsLPNMap = new Map<string /*key is LPN*/, LPNAggregations>();

        // populate map with all existing LPN's in the stock records for this selected product
        // we can use aggregated values of stock quantity sums because in the request, no stock records are omitted unlike for distinct lots
        aggregatedResults.aggregateSumStockQuantity.edges.forEach(lpn => {
            aggregationsLPNMap.set(lpn.node.group.licensePlateNumber.code, {
                stockQuantity: Number(lpn.node.values.quantityInStockUnit.sum),
                // Added conditional labeling logic here for the case where a product location is lot tracked but contains no lots
                distinctLotCount:
                    this.lotManagementMode.value !== lotNotManaged
                        ? ui.localize('@sage/x3-stock/lots-title', 'Lots: {{code}}', { code: 0 })
                        : '',
            });
        });

        // make all forEach() calls optional because there can be no stock records with any lots for a particular product's lpn
        // Added logic to conditionally hide lot count for items that are not lot tracked
        aggregatedResults.aggregateDistinctLots.edges?.forEach(lpn => {
            if (aggregationsLPNMap.has(lpn.node.group.licensePlateNumber.code)) {
                aggregationsLPNMap.get(lpn.node.group.licensePlateNumber.code).distinctLotCount =
                    this.lotManagementMode.value !== lotNotManaged
                        ? ui.localize('@sage/x3-stock/lots-title', 'Lots: {{code}}', {
                              code: lpn.node.values.lot.distinctCount,
                          })
                        : '';
            }
        });

        // index for map.forEach in aggregationsLPNMap
        let index = 0;

        const lpnLinesValue = new Array<{
            _id: string;
            licensePlateNumber: string;
            lotCount: string;
            stockQuantity: string;
            stockUnit: string | number | boolean;
        }>();
        aggregationsLPNMap.forEach((value: LPNAggregations, key: string) => {
            const locationKey = `LOCATION${index++}` as string;
            lpnLinesValue.push({
                _id: !key ? locationKey : key,
                licensePlateNumber: key,
                lotCount: value.distinctLotCount,
                stockQuantity: `${value.stockQuantity} ${this.stockUnit.value}`,
                stockUnit: stockUnitParameter,
            });
        });
        this.mainBlock.title = ui.localize('@sage/x3-stock/license-plate-number-title', 'LPNs: {{code}}', {
            code: lpnLinesValue.filter(lpnLine => lpnLine.licensePlateNumber).length,
        });
        this.licensePlateNumberLines.value = lpnLinesValue;
    },
})
export class MobileViewStockByProductSiteSelectALpn extends ui.Page<GraphApi> {
    private _numberOfDecimalList: ExtractEdgesPartial<UnitOfMeasure>[];

    @ui.decorators.section<MobileViewStockByProductSiteSelectALpn>({
        isTitleHidden: true,
    })
    mainSection: ui.containers.Section;

    @ui.decorators.block<MobileViewStockByProductSiteSelectALpn>({
        parent() {
            return this.mainSection;
        },
        isTitleHidden: false,
    })
    mainBlock: ui.containers.Block;

    @ui.decorators.textField<MobileViewStockByProductSiteSelectALpn>({
        isTransient: true,
        isReadOnly: true,
    })
    site: ui.fields.Text;

    @ui.decorators.textField<MobileViewStockByProductSiteSelectALpn>({
        isTransient: true,
        isReadOnly: true,
    })
    product: ui.fields.Text;

    @ui.decorators.textField<MobileViewStockByProductSiteSelectALpn>({
        isTransient: true,
        isReadOnly: true,
    })
    location: ui.fields.Text;

    @ui.decorators.textField<MobileViewStockByProductSiteSelectALpn>({
        isTransient: true,
        isReadOnly: true,
    })
    stockQuantity: ui.fields.Text;

    @ui.decorators.textField<MobileViewStockByProductSiteSelectALpn>({
        isTransient: true,
        isReadOnly: true,
    })
    stockUnit: ui.fields.Text;

    @ui.decorators.textField<MobileViewStockByProductSiteSelectALpn>({
        isTransient: true,
        isReadOnly: true,
    })
    lotManagementMode: ui.fields.Text;

    @ui.decorators.tableField<MobileViewStockByProductSiteSelectALpn>({
        parent() {
            return this.mainBlock;
        },
        canSelect: false,
        canUserHideColumns: false,
        canFilter: false,
        isTransient: true,
        displayMode: ui.fields.TableDisplayMode.comfortable,
        mobileCard: undefined,
        onRowClick(_id: string, rowItem) {
            this.$.router.goTo(`@sage/x3-stock/MobileViewStockByProductSiteProductDetails`, {
                site: this.site.value as string,
                location: this.location.value as string,
                product: this.product.value as string,
                licensePlateNumber: rowItem.licensePlateNumber as string,
            });
        },
        columns: [
            ui.nestedFields.text({
                bind: 'licensePlateNumber',
                prefix: 'LPN:',
                canFilter: true,
                isReadOnly: true,
            }),
            ui.nestedFields.text({
                bind: 'stockQuantity',
                isReadOnly: true,
            }),
            ui.nestedFields.text({
                bind: 'lotCount',
                canFilter: true,
                isReadOnly: true,
            }),
        ],
    })
    licensePlateNumberLines: ui.fields.Table<any>;

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
        const groupByLPN: AggregateGroupSelector<Stock> = {
            licensePlateNumber: {
                code: {
                    _by: 'value',
                },
            },
        };
        const filterByProduct = {
            location: { code: this.location.value as string },
            stockSite: { code: this.site.value as string },
            product: { product: { code: this.product.value as string } },
        };

        const requests = {
            aggregateSumStockQuantity: this.generateAggregateStockRequest<Stock>(
                {
                    group: groupByLPN,
                    values: {
                        quantityInStockUnit: {
                            sum: true,
                        },
                    },
                },
                {
                    filter: filterByProduct,
                },
            ),
            aggregateDistinctLots: this.generateAggregateStockRequest<Stock>(
                {
                    group: groupByLPN,
                    values: {
                        lot: {
                            distinctCount: true,
                        },
                    },
                },
                {
                    filter: {
                        ...filterByProduct,
                        lot: { _ne: null },
                    },
                },
            ),
        };

        return await new ui.queryUtils.BatchRequest(requests).execute();
    }

    private async _getLocationQuantity() {
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
        const filterByLocation = {
            product: { product: { code: this.product.value as string } },
            stockSite: { code: this.site.value as string },
            location: { code: this.location.value as string },
        };
        const requests = {
            aggregateSumStockQuantity: this.generateAggregateStockRequest<Stock>(
                {
                    group: groupByLocation,
                    values: {
                        quantityInStockUnit: { sum: true },
                    },
                },
                {
                    filter: filterByLocation,
                },
            ),
        };
        const aggregateRequest = await new ui.queryUtils.BatchRequest(requests).execute();
        extractEdges(aggregateRequest.aggregateSumStockQuantity as Edges<any>).forEach(aggregation => {
            this.stockQuantity.value = `${aggregation.values.quantityInStockUnit.sum} ${aggregation.group.product.product.stockUnit.code}`;
        });
    }
}
