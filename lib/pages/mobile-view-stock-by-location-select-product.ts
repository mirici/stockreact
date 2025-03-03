import { Product } from '@sage/x3-master-data-api';
import { GraphApi, Stock } from '@sage/x3-stock-data-api';
import { ExtractEdges, aggregateEdgesSelector, extractEdges } from '@sage/xtrem-client';
import * as ui from '@sage/xtrem-ui';

// TODO: use lot management enum. See Jira ticket X3-162570.
const notManaged = 'notManaged';
const lotAndSublot = 'lotAndSublot';

@ui.decorators.page<MobileViewStockByLocationSelectProduct>({
    title: 'Stock by location',
    subtitle: 'Select a product',
    isTitleHidden: true, // hide the page's title and render that title only in the feature header instead of in both places (see X3-177000 & https://github.com/Sage-ERP-X3/etna/pull/1785)
    node: '@sage/x3-stock-data/Location',
    mode: 'default',
    skipDirtyCheck: true,
    navigationPanel: undefined,
    headerCard() {
        return {
            title: this.code,
            titleRight: this.distinctProductCount,
        };
    },
    async onLoad() {
        const aggregateResult = extractEdges(
            await this.$.graph
                .node('@sage/x3-stock-data/Stock')
                .aggregate.query(
                    aggregateEdgesSelector<Stock>(
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
                                lot: { distinctCount: true },
                                sublot: { distinctCount: true },
                                licensePlateNumber: { code: { distinctCount: true } },
                            },
                        },
                        {
                            first: 500, // (X3-197381) TODO: Have to set some sort of hard limit. To be superseded in non-transient way
                            filter: {
                                location: { code: this.code.value as string },
                                stockSite: { code: this.$.storage.get('mobile-selected-stock-site') as string },
                            },
                            orderBy: { product: { product: { code: +1 } } },
                        },
                    ),
                )
                .execute(),
        );

        this.distinctProductCount.value = aggregateResult.length.toString();
        this.distinctProductCount.prefix = ui.localize('@sage/x3-stock/location-inquiry-product', 'Products:');
        this.mainBlock.title = `${this.distinctProductCount.prefix} ${this.distinctProductCount.value} `;

        // Verify if selected location yields at least one result by checking the existence of any aggregated stock quantity sum
        // if not, automatically redirect the user back previous screen
        // (practically should never occur as long as user isn't trying to manually direct himself/herself to this screen)
        if (aggregateResult.length === 0) {
            this.$.showToast(
                ui.localize(
                    '@sage/x3-stock/notification-warning-location-inquiry-zero-products',
                    'The {{code}} location has no products.',
                    { code: this.code.value },
                ),
                { type: 'error' },
            );
            this.$.router.goTo('@sage/x3-stock/MobileViewStockByLocation');
            return;
        }

        // TODO Issue: By simply adding localizedDescription1 to the aggregate request, the error 'Error: ORA-22818: subquery expressions not allowed here' occurs
        // So implementing this workaround to retrieve localizedDescription1 in another request
        const localizedDescriptions = extractEdges(
            await this.$.graph
                .node('@sage/x3-master-data/Product')
                .query(
                    ui.queryUtils.edgesSelector<Product>(
                        {
                            code: true,
                            localizedDescription1: true,
                        },
                        {
                            first: 500, // TODO Issue: Need a table-like ui component that can bind & aggregate on a collection property in a non-transient way
                            filter: {
                                code: {
                                    _in: aggregateResult.map<string>(
                                        record => (record as any).group.product.product.code,
                                    ),
                                }, //group
                            },
                            orderBy: { code: +1 },
                        },
                    ),
                )
                .execute(),
        ) as ExtractEdges<Product>[];

        aggregateResult.forEach((record, index) => {
            (record as any).group.product.product.localizedDescription1 =
                localizedDescriptions[index].localizedDescription1;
        });

        this.productLines.value = aggregateResult.map(
            (
                value: any,
            ): {
                _id: string;
                product: string;
                localizedDescription1: string;
                lotManagementMode: string;
                stockQuantity: number;
                stockUnit: string;
                lotAndSublot: string;
                lotCount: number;
                lpnCount: number;
            } => {
                let lotAndSublotCount = '';
                switch (value.group.product.product.lotManagementMode) {
                    case lotAndSublot:
                        lotAndSublotCount = `${ui.localize('@sage/x3-stock/location-inquiry-lot', 'Lots: {{code}}', {
                            code: value.values.lot.distinctCount,
                        })} and ${ui.localize('@sage/x3-stock/location-inquiry-sublot', 'Sublots: {{code}}', {
                            code: value.values.sublot.distinctCount,
                        })}`;
                        break;
                    case notManaged:
                        lotAndSublotCount = '';
                        break;
                    default:
                        lotAndSublotCount = ui.localize('@sage/x3-stock/location-inquiry-lot', 'Lots: {{code}}', {
                            code: value.values.lot.distinctCount,
                        });
                }

                return {
                    _id: value.group.product.product.code, // this is required, otherwise during onRowClick, rowItem will be blank
                    product: value.group.product.product.code,
                    localizedDescription1: value.group.product.product.localizedDescription1,
                    lotManagementMode: value.group.product.product.lotManagementMode,
                    stockQuantity: value.values.quantityInStockUnit.sum,
                    stockUnit: value.group.product.product.stockUnit.code,
                    lotAndSublot: lotAndSublotCount,
                    lotCount: value.values.lot.distinctCount,
                    lpnCount: value.values.licensePlateNumber.code.distinctCount,
                };
            },
        );
    },
})
export class MobileViewStockByLocationSelectProduct extends ui.Page<GraphApi> {
    @ui.decorators.section<MobileViewStockByLocationSelectProduct>({
        isTitleHidden: true,
    })
    mainSection: ui.containers.Section;

    @ui.decorators.block<MobileViewStockByLocationSelectProduct>({
        parent() {
            return this.mainSection;
        },
    })
    mainBlock: ui.containers.Block;

    @ui.decorators.textField<MobileViewStockByLocationSelectProduct>({
        isTransient: false,
        //bind: 'code', //TODO Issue: if this is specified, then it will prevent the value field from being manually set during onLoad()
        isReadOnly: true,
    })
    code: ui.fields.Text;

    @ui.decorators.textField<MobileViewStockByLocationSelectProduct>({
        isTransient: true,
        isReadOnly: true,
    })
    distinctProductCount: ui.fields.Text;

    // This transient table is for populating the data & formatted in a UI friendly way
    @ui.decorators.tableField<MobileViewStockByLocationSelectProduct>({
        parent() {
            return this.mainBlock;
        },
        canSelect: false,
        canUserHideColumns: false,
        canFilter: false,
        isTransient: true,
        displayMode: ui.fields.TableDisplayMode.comfortable,
        onRowClick(_id: string, rowItem) {
            if (rowItem.lpnCount !== 0) {
                this.$.router.goTo('@sage/x3-stock/MobileViewStockByLocationSelectLPN', {
                    _id: this._id.value as string, // this is the id of the location record, not the selection of the product
                    product: rowItem.product,
                    localizedDescription1: rowItem.localizedDescription1,
                    stockQuantity: rowItem.stockQuantity,
                    stockUnit: rowItem.stockUnit,
                    lotManagementMode: rowItem.lotManagementMode,
                });
            } else {
                // otherwise skip level 3 if selected product has no license plate numbers
                const lotCount =
                    rowItem.lotManagementMode !== notManaged
                        ? ui.localize('@sage/x3-stock/lots-title', 'Lots: {{code}}', {
                              code: rowItem.lotCount,
                          })
                        : '';
                this.$.router.goTo('@sage/x3-stock/MobileViewStockByLocationProductDetails', {
                    _id: this._id.value as string,
                    product: rowItem.product,
                    lotCount: lotCount,
                    stockQuantity: rowItem.stockQuantity,
                    stockUnit: rowItem.stockUnit,
                });
            }
        },
        columns: [
            ui.nestedFields.text({
                bind: 'product',
                isReadOnly: true,
                canFilter: true,
            }),
            ui.nestedFields.text({
                bind: 'stockQuantity',
                isReadOnly: true,
                postfix(value: any, rowData?: any) {
                    return rowData?.stockUnit;
                },
            }),
            ui.nestedFields.text({
                bind: 'lotAndSublot',
                isReadOnly: true,
            }),
        ],
        cardView: true,
        mobileCard: {
            title: ui.nestedFields.text({
                bind: 'product',
                isReadOnly: true,
                canFilter: true,
            }),
            titleRight: ui.nestedFields.text({
                bind: 'stockQuantity',
                isReadOnly: true,
                postfix(value: any, rowData?: any) {
                    return rowData?.stockUnit;
                },
            }),
            line2: ui.nestedFields.text({
                bind: 'localizedDescription1',
                isReadOnly: true,
            }),
            line3: ui.nestedFields.text({
                bind: 'lotAndSublot',
                isReadOnly: true,
                isHidden(value) {
                    return !value;
                },
            }),
        },
    })
    productLines: ui.fields.Table<any>;

    @ui.decorators.labelField<MobileViewStockByLocationSelectProduct>({
        isTransient: false,
        isHidden: true,
        //bind: '_id', //TODO Issue: if this is specified, then it will prevent the value field from being manually set during onLoad()
    })
    _id: ui.fields.Label;
}
