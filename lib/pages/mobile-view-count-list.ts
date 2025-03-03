import { GraphApi, StockCountListDetail } from '@sage/x3-stock-api';
import * as ui from '@sage/xtrem-ui';

@ui.decorators.page<MobileViewCountList, StockCountListDetail>({
    isTitleHidden: true,
    title: 'View stock count',
    node: '@sage/x3-stock/StockCountListDetail',
    isTransient: false,
    skipDirtyCheck: true,
    navigationPanel: {
        canFilter: false,
        isHeaderHidden: true,
        isFirstLetterSeparatorHidden: true,
        listItem: {
            title: ui.nestedFields.numeric({
                title: 'Line number',
                bind: 'productRankNumber',
                isReadOnly: true,
            }),
            titleRight: ui.nestedFields.text({
                title: 'Line status',
                bind: 'stockCountListStatus',
                isReadOnly: true,
            }),
            line2: ui.nestedFields.reference({
                node: '@sage/x3-master-data/Product',
                bind: 'product',
                valueField: 'code',
            }),
            line3: ui.nestedFields.text({
                title: 'Packing quantity and packing unit',
                bind: 'quantityInPackingUnit',
                isReadOnly: true,
                postfix(_value, rowValue) {
                    return rowValue.packingUnit.code;
                },
            }),
            line4: ui.nestedFields.reference({
                node: '@sage/x3-master-data/Product',
                bind: 'product',
                valueField: 'upc',
            }),
            line3Right: ui.nestedFields.reference({
                node: '@sage/x3-master-data/UnitOfMeasure',
                bind: 'packingUnit',
                valueField: 'code',
                isHidden: true,
            }),
        },
        optionsMenu: [
            {
                title: 'Stock count list detail',
                graphQLFilter: storage => ({
                    stockCountSessionNumber: String(storage.get('mobile-selected-session')),
                    stockCountList: { stockCountListNumber: String(storage.get('mobile-selected-list')) },
                    stockCountListStatus: { _in: ['toBeCounted', 'counted'] },
                }),
            },
        ],
        onSelect() {
            return true;
        },
    },
    async onLoad() {},
})
export class MobileViewCountList extends ui.Page<GraphApi> {}
