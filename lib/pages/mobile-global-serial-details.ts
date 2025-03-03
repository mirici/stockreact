import { GraphApi, SerialNumber } from '@sage/x3-stock-data-api';
import { extractEdges } from '@sage/xtrem-client';
import * as ui from '@sage/xtrem-ui';

@ui.decorators.page<MobileGlobalSerialDetails>({
    title: 'Serial number',
    isTitleHidden: true, // hide the page's title and render that title only in the feature header instead of in both places (see X3-177000 & https://github.com/Sage-ERP-X3/etna/pull/1785)
    node: '@sage/x3-stock-data/SerialNumber',
    mode: 'default',
    isTransient: true,
    navigationPanel: undefined,
    headerCard() {
        return {
            title: this.product,
            line2: this.line2,
        };
    },
    async onLoad() {
        // Requires product and stock id
        const productParameter: string | number | boolean = this.$.queryParameters['product'];
        const stockIdParameter: string | number | boolean = this.$.queryParameters['stockId'];
        const subtitleParameter: string | number | boolean = this.$.queryParameters['subtitle'];

        if (productParameter && stockIdParameter) {
            // Fill out header card
            this.product.value = productParameter.toString();
            this.stockId.value = Number(stockIdParameter);
            if (subtitleParameter) {
                this.line2.value = subtitleParameter.toString();
            }
            this.globalSerialNumbers.value = extractEdges(
                await this.$.graph
                    .node('@sage/x3-stock-data/SerialNumber')
                    .query(
                        ui.queryUtils.edgesSelector<SerialNumber>(
                            {
                                code: true,
                            },
                            {
                                filter: {
                                    stockSite: this.$.storage.get('mobile-selected-stock-site') as string,
                                    product: this.product.value,
                                    stockId: this.stockId.value as any,
                                },
                                first: 500,
                                orderBy: { code: 1 },
                            },
                        ),
                    )
                    .execute(),
            );
        } else {
            this.$.showToast(
                ui.localize('@sage/x3-stock/notification-error-missing-params', 'Missing required parameters'),
                { type: 'error' },
            );
        }
    },
})
export class MobileGlobalSerialDetails extends ui.Page<GraphApi> {
    @ui.decorators.section<MobileGlobalSerialDetails>({
        isTitleHidden: true,
        // title: 'Serial Numbers',
    })
    mainSection: ui.containers.Section;

    @ui.decorators.block<MobileGlobalSerialDetails>({
        parent() {
            return this.mainSection;
        },
    })
    mainBlock: ui.containers.Block;

    @ui.decorators.textField<MobileGlobalSerialDetails>({
        isTransient: true,
        isReadOnly: true,
    })
    product: ui.fields.Text;

    @ui.decorators.textField<MobileGlobalSerialDetails>({
        isTransient: true,
        isReadOnly: true,
    })
    line2: ui.fields.Text;

    @ui.decorators.numericField<MobileGlobalSerialDetails>({
        isTransient: true,
        isReadOnly: true,
    })
    stockId: ui.fields.Numeric;

    @ui.decorators.tableField<MobileGlobalSerialDetails>({
        parent() {
            return this.mainBlock;
        },
        node: '@sage/x3-stock-data/SerialNumber',
        isTransient: true,
        isFullWidth: true,
        isTitleHidden: false,
        canFilter: false,
        canSelect: false,
        canExport: false,
        canUserHideColumns: false,
        mobileCard: undefined,
        columns: [
            ui.nestedFields.text({
                bind: 'code',
                isReadOnly: true,
            }),
        ],
    })
    globalSerialNumbers: ui.fields.Table<SerialNumber>;
}
