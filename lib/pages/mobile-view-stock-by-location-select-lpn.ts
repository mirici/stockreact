import { GraphApi } from '@sage/x3-stock-data-api';
import { extractEdges, ExtractEdgesPartial } from '@sage/xtrem-client';
import * as ui from '@sage/xtrem-ui';
import { UnitOfMeasure } from '@sage/x3-master-data-api-partial';
import { getUnitNumberOfDecimalList, getNumberOfDecimal } from '../client-functions/get-unit-number-decimals';

// TODO: use lot management enum. See Jira ticket X3-162570.
const notManaged = 'notManaged';

@ui.decorators.page<MobileViewStockByLocationSelectLPN>({
    title: 'Stock by location',
    subtitle: 'Select an LPN',
    isTitleHidden: true, // hide the page's title and render that title only in the feature header instead of in both places (see X3-177000 & https://github.com/Sage-ERP-X3/etna/pull/1785)
    node: '@sage/x3-stock-data/Location',
    mode: 'default',
    skipDirtyCheck: true,
    navigationPanel: undefined,
    headerCard() {
        // TODO Issue: Header Card doesn't support Reference control
        return {
            title: this.product,
            titleRight: this.stockQuantity,
            line2: this.localizedDescription1,
        };
    },
    async onLoad() {
        // Requires a selected location & product in the query parameters
        const productParameter: string | number | boolean = this.$.queryParameters['product'];
        const localizedDescription1Parameter: string | number | boolean = this.$.queryParameters.localizedDescription1;
        const stockQuantityParameter: string | number | boolean = this.$.queryParameters['stockQuantity'];
        const stockUnitParameter: string | number | boolean = this.$.queryParameters['stockUnit'];
        const lotManagementModeParameter: string | number | boolean = this.$.queryParameters['lotManagementMode'] ?? '';

        if (!this.code.value || !productParameter || !stockQuantityParameter || !stockUnitParameter) {
            this.$.showToast(
                ui.localize(
                    '@sage/x3-stock/notification-error-location-inquiry-level3-missing-params',
                    'A selected location & product are required',
                ),
                { type: 'error' },
            );
            this.$.router.goTo('@sage/x3-stock/MobileViewStockByLocation');
            return;
        }

        this._numberOfDecimalList = await getUnitNumberOfDecimalList(this);
        const numberDecimal: number = getNumberOfDecimal(this._numberOfDecimalList,stockUnitParameter.toString());

        this.product.value = productParameter.toString();
        this.localizedDescription1.value = localizedDescription1Parameter.toString();
        this.stockQuantity.value = Number(stockQuantityParameter).toFixed(numberDecimal);
        this.stockQuantity.postfix = stockUnitParameter.toString();
        this.lotManagementMode.value = lotManagementModeParameter.toString();

        const aggregateResult = extractEdges(
            await this.$.graph
                .node('@sage/x3-stock-data/Stock')
                .aggregate.query(
                    ui.queryUtils.edgesSelector(
                        {
                            group: {
                                licensePlateNumber: {
                                    code: {
                                        _by: 'value',
                                    },
                                },
                            },
                            values: {
                                quantityInStockUnit: { sum: true },
                                lot: { distinctCount: true },
                            },
                        },
                        {
                            filter: {
                                location: { code: this.code.value },
                                stockSite: this.$.storage.get('mobile-selected-stock-site') as string,
                                product: { product: { code: this.product.value } },
                            },
                            first: 500, // (X3-197381) TODO: Have to set some sort of hard limit. To be superseded in non-transient way
                        },
                    ),
                )
                .execute(),
        );

        let hasNull = false;
        this.licensePlateNumberLines.value = aggregateResult.map(
            (
                value: any,
            ): {
                _id: string;
                licensePlateNumber: string;
                lotCount: string;
                stockQuantity: number;
                stockUnit: string | number | boolean;
            } => {
                if (!hasNull && !value.group.licensePlateNumber) hasNull = true;

                return {
                    _id: !value.group.licensePlateNumber.code ? '' : value.group.licensePlateNumber.code,
                    licensePlateNumber: !value.group.licensePlateNumber.code ? '' : value.group.licensePlateNumber.code,
                    lotCount:
                        this.lotManagementMode.value !== notManaged
                            ? ui.localize('@sage/x3-stock/location-inquiry-lot', 'Lots: {{code}}', {
                                  code: value.values.lot.distinctCount,
                              })
                            : '',
                    stockQuantity: value.values.quantityInStockUnit.sum,
                    stockUnit: stockUnitParameter,
                };
            },
        );

        this.mainBlock.title = ui.localize(
            '@sage/x3-stock/location-inquiry-license-plate-number',
            'License plate numbers: {{code}}',
            { code: aggregateResult.length - (hasNull ? 1 : 0) },
        );
    },
})
export class MobileViewStockByLocationSelectLPN extends ui.Page<GraphApi> {
    private _numberOfDecimalList: ExtractEdgesPartial<UnitOfMeasure>[];

    @ui.decorators.section<MobileViewStockByLocationSelectLPN>({
        isTitleHidden: true,
    })
    mainSection: ui.containers.Section;

    @ui.decorators.block<MobileViewStockByLocationSelectLPN>({
        parent() {
            return this.mainSection;
        },
    })
    mainBlock: ui.containers.Block;

    @ui.decorators.textField<MobileViewStockByLocationSelectLPN>({
        isTransient: true,
        isReadOnly: true,
    })
    product: ui.fields.Text;

    @ui.decorators.textField<MobileViewStockByLocationSelectLPN>({
        isTransient: true,
        isReadOnly: true,
    })
    localizedDescription1: ui.fields.Text;

    @ui.decorators.textField<MobileViewStockByLocationSelectLPN>({
        isTransient: true,
        isReadOnly: true,
    })
    stockQuantity: ui.fields.Text;

    @ui.decorators.textField<MobileViewStockByLocationSelectLPN>({
        isTransient: true,
        isReadOnly: true,
    })
    lotManagementMode: ui.fields.Text;

    @ui.decorators.tableField<MobileViewStockByLocationSelectLPN>({
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
            if (rowItem.licensePlateNumber) {
                this.$.router.goTo('@sage/x3-stock/MobileViewStockByLocationProductDetails', {
                    _id: this._id.value as string,
                    product: this.product.value as string,
                    licensePlateNumber: rowItem.licensePlateNumber,
                    lotCount: rowItem.lotCount,
                    stockQuantity: rowItem.stockQuantity,
                    stockUnit: rowItem.stockUnit,
                });
            } else {
                this.$.router.goTo('@sage/x3-stock/MobileViewStockByLocationProductDetails', {
                    _id: this._id.value as string,
                    product: this.product.value as string,
                    lotCount: rowItem.lotCount,
                    stockQuantity: rowItem.stockQuantity,
                    stockUnit: rowItem.stockUnit,
                });
            }
        },
        columns: [
            ui.nestedFields.text({
                bind: 'licensePlateNumber',
                canFilter: true,
                isReadOnly: true,
                prefix: 'LPN',
            }),
            ui.nestedFields.text({
                bind: 'stockQuantity',
                isReadOnly: true,
                postfix(value: any, rowData?: any) {
                    return rowData?.stockUnit;
                },
            }),
            ui.nestedFields.text({
                bind: 'lotCount',
                canFilter: true,
                isReadOnly: true,
            }),
        ],
    })
    licensePlateNumberLines: ui.fields.Table<any>;

    @ui.decorators.textField<MobileViewStockByLocationSelectLPN>({
        isTransient: false,
        isReadOnly: true,
    })
    code: ui.fields.Text;

    @ui.decorators.labelField<MobileViewStockByLocationSelectLPN>({
        isTransient: false,
        isHidden: true,
    })
    _id: ui.fields.Label;
}
