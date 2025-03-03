import { getSelectedStockSite } from '@sage/x3-master-data/lib/client-functions/get-selected-stock-site';
import { GraphApi, Location } from '@sage/x3-stock-data-api';
import { stockControl } from '@sage/x3-stock-data/build/lib/menu-items/stock-control';
import * as ui from '@sage/xtrem-ui';

// TODO Verify: Changing a sticker setting at this page doesn't invoke onLoad() to update the data shown. Have to manually refresh the browser or switch to a different page and back?
@ui.decorators.page<MobileViewStockByLocation, Location>({
    title: 'View stock by location', // this value is used to integrate with the feature header's name and in the landing page's menu
    isTitleHidden: true, // hide the page's title and render that title only in the feature header instead of in both places (see X3-177000 & https://github.com/Sage-ERP-X3/etna/pull/1785)
    menuItem: stockControl,
    priority: 400,
    node: '@sage/x3-stock-data/Location',
    mode: 'default',
    authorizationCode: 'INQSTOLOC',
    skipDirtyCheck: true,
    async onLoad() {
        await this._init();
    },
    navigationPanel: {
        isHeaderHidden: true, // TODO Issue: Tooltip is misleading stating this defaults to true
        canFilter: false,
        isAutoSelectEnabled: true,
        listItem: {
            title: ui.nestedFields.text({ bind: 'code' }),
            titleRight: ui.nestedFields.text({ bind: 'type' }),
        },
        optionsMenu: [
            {
                title: 'Default Site',
                graphQLFilter: storage => ({ stockSite: { code: String(storage.get('mobile-selected-stock-site')) } }),
            },
        ],
        onSelect(listItemValue: any) {
            this.$.router.goTo('@sage/x3-stock/MobileViewStockByLocationSelectProduct', {
                _id: listItemValue._id,
            });
            return true;
        },
    },
    //areNavigationTabsHidden: true, // not sure what this does
})
export class MobileViewStockByLocation extends ui.Page<GraphApi> {
    @ui.decorators.section<MobileViewStockByLocation>({
        isHidden: true,
    })
    mainSection: ui.containers.Section;

    @ui.decorators.block<MobileViewStockByLocation>({
        parent() {
            return this.mainSection;
        },
    })
    mainBlock: ui.containers.Block;

    @ui.decorators.labelField<MobileViewStockByLocation>({
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
}
