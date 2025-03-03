import { ProductSite } from '@sage/x3-master-data-api';
import { getSelectedStockSite } from '@sage/x3-master-data/lib/client-functions/get-selected-stock-site';
import { GraphApi } from '@sage/x3-stock-data-api';
import { stockControl } from '@sage/x3-stock-data/build/lib/menu-items/stock-control';
import * as ui from '@sage/xtrem-ui';

// TODO: use lot management enum. See Jira ticket X3-162570.
const lotNotManaged = 'notManaged';

@ui.decorators.page<MobileViewStockByProductSite, ProductSite>({
    isTitleHidden: true,
    title: 'View stock by product-site',
    menuItem: stockControl,
    priority: 500,
    node: '@sage/x3-master-data/ProductSite',
    authorizationCode: 'INQSTOPRO',
    skipDirtyCheck: true,
    mode: 'default',
    async onLoad() {
        this.siteField.value  = await getSelectedStockSite(
            this,
            ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
            ui.localize(
                '@sage/x3-stock/dialog-error-location-inquiry-set-site',
                'Define a default stock site on the user function profile.',
            ),
        );
    },
    headerCard() {
        return {
            title: this.siteField,
        };
    },
    navigationPanel: {
        canFilter: false,
        isHeaderHidden: true,
        isAutoSelectEnabled: true,
        listItem: {
            title: ui.nestedFields.reference({
                node: '@sage/x3-master-data/Product',
                bind: 'product',
                valueField: 'code',
            }),
            line2: ui.nestedFields.reference({
                node: '@sage/x3-master-data/Product',
                bind: 'product',
                valueField: 'localizedDescription1',
            }),
            line3: ui.nestedFields.numeric({
                bind: '_id',
                canFilter: false,
                isHidden: true,
            }),
            line4: ui.nestedFields.checkbox({
                bind: 'isLocationManaged',
                canFilter: false,
                isHidden: true,
            }),
            line5: ui.nestedFields.checkbox({
                bind: 'isLicensePlateNumberManaged',
                canFilter: false,
                isHidden: true,
            }),
            line6: ui.nestedFields.reference({
                node: '@sage/x3-master-data/Product',
                bind: 'product',
                valueField: 'lotManagementMode',
                isHidden: true,
            }),
        },
        optionsMenu: [
            {
                title: 'Site: ', //+ this.$.storage.get('adc-selected-site').toString(),
                graphQLFilter: storage => ({ stockSite: { code: String(storage.get('mobile-selected-stock-site')) } }),
            },
        ],
        onSelect(listItemValue: any) {
            if (!listItemValue.isLocationManaged) {
                this.$.router.goTo(`@sage/x3-stock/MobileViewStockByProductSiteProductDetails`, {
                    site: this.siteField.value as string,
                    location: '',
                    product: listItemValue.product.code,
                    licensePlateNumber: '',
                });
            } else {
                this.$.router.goTo(`@sage/x3-stock/MobileViewStockByProductSiteSelectLocation`, {
                    _id: listItemValue._id,
                    product: listItemValue.product.code,
                    site: this.siteField.value as string,
                    isLicensePlateNumberManaged: String(listItemValue.isLicensePlateNumberManaged),
                    lotManagementMode: listItemValue.product.lotManagementMode,
                });
            }
            return true;
        },
    },
})
export class MobileViewStockByProductSite extends ui.Page<GraphApi> {
    @ui.decorators.section<MobileViewStockByProductSite>({
        isTitleHidden: true,
        isHidden: true,
    })
    mainSection: ui.containers.Section;

    @ui.decorators.block<MobileViewStockByProductSite>({
        parent() {
            return this.mainSection;
        },
    })
    mainBlock: ui.containers.Block;

    @ui.decorators.labelField<MobileViewStockByProductSite>({
        parent() {
            return this.mainBlock;
        },
        isTransient: true,
    })
    stockUnit: ui.fields.Label;

    @ui.decorators.labelField<MobileViewStockByProductSite>({
        parent() {
            return this.mainBlock;
        },
        isTransient: true,
    })
    siteField: ui.fields.Label;
}
