import { Product } from '@sage/x3-master-data-api';
import { GraphApi, Stock } from '@sage/x3-stock-data-api';
import { ExtractEdges, aggregateEdgesSelector, extractEdges } from '@sage/xtrem-client';
import * as ui from '@sage/xtrem-ui';

// TODO: use lot management enum. See Jira ticket X3-162570.
const notManaged = 'notManaged';
const lotAndSublot = 'lotAndSublot';

@ui.decorators.page<MobileViewStockByLpnSelectProduct>({
    title: 'Stock by LPN',
    subtitle: 'Select a product',
    isTitleHidden: true, // hide the page's title and render that title only in the feature header instead of in both places (see X3-177000 & https://github.com/Sage-ERP-X3/etna/pull/1785)
    node: '@sage/x3-stock-data/LicensePlateNumber',
    mode: 'default',
    skipDirtyCheck: true,
    navigationPanel: undefined,
    headerCard() {
        return {
            title: this.code,
            titleRight: this.distinctProductCount,
            line2: this.location,
        };
    },
    async onLoad() {
        if (this.$.queryParameters['licensePlateNumber']) {
            this.code.value = this.$.queryParameters['licensePlateNumber'] as string;
        }
        const locationParameter: string | number | boolean = this.$.queryParameters['location'];

        // Use the aggregated value passed in to fill out the header card
        this.location.value = locationParameter.toString();

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
                            },
                        },
                        {
                            first: 500, // TODO Issue: Need a table-like ui component that can bind & aggregate on a collection property in a non-transient way
                            filter: {
                                licensePlateNumber: { code: this.code.value as string },
                                stockSite: { code: this.$.storage.get('mobile-selected-stock-site') as string },
                            },
                            orderBy: { product: { product: { code: +1 } } },
                        },
                    ),
                )
                .execute(),
        );

        this.distinctProductCount.value = aggregateResult.length.toString();
        this.distinctProductCount.prefix = ui.localize('@sage/x3-stock/lpn-inquiry-product', 'Products:');
        this.mainBlock.title = `${this.distinctProductCount.prefix} ${this.distinctProductCount.value}`;

        // Verify if selected lpn yields at least one result by checking the existence of any aggregated stock quantity sum
        // if not, automatically redirect the user back previous screen
        // (practically should never occur as long as user isn't trying to manually direct himself/herself to this screen)
        if (aggregateResult.length === 0) {
            this.$.showToast(
                ui.localize(
                    '@sage/x3-stock/notification-warning-lpn-inquiry-zero-products',
                    'The {{code}} LPN has no products.',
                    { code: this.code.value },
                ),
                { type: 'error' },
            );
            this.$.router.goTo('@sage/x3-stock/MobileViewStockByLpn');
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
                                },
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
            } => {
                let lotAndSublotCount = '';
                switch (value.group.product.product.lotManagementMode) {
                    case lotAndSublot:
                        lotAndSublotCount = ui.localize(
                            '@sage/x3-stock/lpn-inquiry-lot-and-sublot',
                            'Lots: {{lotCode}} Sublots: {{code}}',
                            {
                                lotCode: value.values.lot.distinctCount,
                                code: value.values.sublot.distinctCount,
                            },
                        );
                        break;
                    case notManaged:
                        lotAndSublotCount = '';
                        break;
                    default:
                        lotAndSublotCount = ui.localize('@sage/x3-stock/lpn-inquiry-lot', 'Lots: {{code}}', {
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
                };
            },
        );
    },
})
export class MobileViewStockByLpnSelectProduct extends ui.Page<GraphApi> {
    @ui.decorators.section<MobileViewStockByLpnSelectProduct>({
        isTitleHidden: true,
    })
    mainSection: ui.containers.Section;

    @ui.decorators.block<MobileViewStockByLpnSelectProduct>({
        parent() {
            return this.mainSection;
        },
    })
    mainBlock: ui.containers.Block;

    @ui.decorators.textField<MobileViewStockByLpnSelectProduct>({
        isTransient: false,
        isReadOnly: true,
    })
    code: ui.fields.Text;

    @ui.decorators.textField<MobileViewStockByLpnSelectProduct>({
        isTransient: true,
        isReadOnly: true,
    })
    distinctProductCount: ui.fields.Text;

    @ui.decorators.textField<MobileViewStockByLpnSelectProduct>({
        isTransient: true,
        isReadOnly: true,
    })
    location: ui.fields.Text;

    // This transient table is for populating the data & formatted in a UI friendly way
    @ui.decorators.tableField<MobileViewStockByLpnSelectProduct>({
        parent() {
            return this.mainBlock;
        },
        canSelect: false,
        canUserHideColumns: false,
        canFilter: false,
        isTransient: true,
        displayMode: ui.fields.TableDisplayMode.comfortable,
        onRowClick(_id: string, rowItem) {
            //
            this.$.router.goTo('@sage/x3-stock/MobileViewStockByLpnProductDetails', {
                _id: this._id.value as string,
                licensePlateNumber: this.code.value as string,
                product: rowItem.product,
                stockQuantity: rowItem.stockQuantity,
                stockUnit: rowItem.stockUnit,
                location: this.location.value as string,
            });
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
            }),
        },
    })
    productLines: ui.fields.Table<any>;

    @ui.decorators.labelField<MobileViewStockByLpnSelectProduct>({
        isTransient: false,
        isHidden: true,
    })
    _id: ui.fields.Label;
}
