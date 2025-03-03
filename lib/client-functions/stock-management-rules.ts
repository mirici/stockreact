import { ProductCategory, ProductSite } from '@sage/x3-master-data-api';
import {
    ProductCategoryDefaultLocations,
    ProductSiteDefaultLocations,
    StockManagementRules,
} from '@sage/x3-stock-data-api';
import * as ui from '@sage/xtrem-ui';

async function _readStockManagementRules(
    stockSite: string | null,
    productCategory: string | null,
    transactionType: string,
    stockMovementCode: string | null,
    pageInstance: ui.Page,
) {
    try {
        //read the stock management rules
        const stockManagementRules = await pageInstance.$.graph
            .node('@sage/x3-stock-data/StockManagementRules')
            .query(
                ui.queryUtils.edgesSelector(
                    {
                        productCategory: { code: true },
                        stockSite: { code: true },
                        transactionType: true,
                        stockMovementCode: { code: true },
                        defaultStatus: true,
                        locationNumber: true,
                        locationNumber2: true,
                        locationNumber3: true,
                        authorizedStatus: true,
                        authorizedSubstatus: true,
                        hasAnalysisRequest: true,
                        lotEntry: true,
                        lotByDefault: true,
                        outputLot: true,
                        isExclusiveEntryVersion: true,
                        activeVersion: true,
                        licensePlateNumberEntry: true,
                        versionStopped: true,
                        prototypeVersion: true,
                    },
                    {
                        filter: {
                            productCategory: { code: productCategory },
                            stockSite: { code: stockSite },
                            transactionType: transactionType,
                            stockMovementCode: { code: stockMovementCode },
                        },
                    },
                ),
            )
            .execute();
        if (stockManagementRules.edges.length > 0) return stockManagementRules.edges[0].node;
        else return null;
    } catch (e) {}
}

export async function findStockManagementRules(
    stockSite: string,
    productCategory: string,
    transactionType: string, //TRSTYP, menu 704
    stockMovementCode: string | null, //TRSCOD
    pageInstance: ui.Page,
) {
    // for the stock site, the product category and the movement code
    let stockManagementRules = await _readStockManagementRules(
        stockSite,
        productCategory,
        transactionType,
        stockMovementCode,
        pageInstance,
    );
    if (stockManagementRules) return stockManagementRules;
    // for stock site and product category
    stockManagementRules = await _readStockManagementRules(
        stockSite,
        productCategory,
        transactionType,
        null,
        pageInstance,
    );
    if (stockManagementRules) return stockManagementRules;
    // for product category and movement code
    stockManagementRules = await _readStockManagementRules(
        null,
        productCategory,
        transactionType,
        stockMovementCode,
        pageInstance,
    );
    if (stockManagementRules) return stockManagementRules;
    // for product category
    stockManagementRules = await _readStockManagementRules(null, productCategory, transactionType, null, pageInstance);
    if (stockManagementRules) return stockManagementRules;
    // general rules
    stockManagementRules = await _readStockManagementRules(null, null, transactionType, null, pageInstance);
    if (stockManagementRules) return stockManagementRules;
    throw new Error(
        ui.localize(
            '@sage/x3-stock/stock_management_rules__notification__no_management_rules_error',
            `Could not retrieve the management rules for your product category {{ productCategory }} and for the site {{ siteCode }}`,
            { productCategory: productCategory, siteCode: stockSite },
        ),
    );
}

async function _readProductCategorySite(
    stockSite: string,
    productCategory: string,
    pageInstance: ui.Page,
): Promise<ProductCategory | null> {
    try {
        //read the product category site
        const productCategorySite = await pageInstance.$.graph
            .node('@sage/x3-master-data/productCategory')
            .read(
                {
                    stockSite: { code: true },
                    code: true,
                    defaultLocations: {
                        query: {
                            edges: {
                                node: {
                                    defaultLocation: true,
                                    locationNumber: true,
                                    defaultLocationType: true,
                                },
                            },
                        },
                    },
                },
                // TODO: find a better way if possible
                `${stockSite}|${productCategory}`,
            )
            .execute();
        return productCategorySite ?? null;
    } catch (e) {
        return null;
    }
}

export async function findDefaultLocation(
    productSite: ProductSite,
    stockManagementRules: StockManagementRules,
    pageInstance: ui.Page,
) {
    // find the default location for the product site

    const defaultLocation = productSite.defaultLocations.query.edges.find(
        loc => (loc.node as ProductSiteDefaultLocations).locationNumber === stockManagementRules.locationNumber,
    );
    if (
        defaultLocation &&
        defaultLocation.node.defaultLocation &&
        !defaultLocation.node.defaultLocation.match(/[* ! # ?]/)
    )
        return defaultLocation.node.defaultLocation;

    // find the default location for the product category site
    const ProductCategorySite = await _readProductCategorySite(
        productSite.stockSite.code,
        productSite.product.productCategory.code,
        pageInstance,
    );
    if (ProductCategorySite) {
        const defaultLocationCateg = ProductCategorySite.defaultLocations.query.edges.find(
            loc => (loc.node as ProductCategoryDefaultLocations).locationNumber === stockManagementRules.locationNumber,
        );
        if (
            defaultLocationCateg &&
            defaultLocationCateg.node.defaultLocation &&
            !defaultLocationCateg.node.defaultLocation.match(/[* ! # ?]/)
        )
            return defaultLocationCateg.node.defaultLocation;
    }
    return null;
}
