import * as ui from '@sage/xtrem-ui';

export async function getProductSite(
    pageInstance: ui.Page,
    productCode: string,
    siteCode: string,
    storageProductSite: string,
) {
    if (!storageProductSite) {
        // read product site record
        const productSiteToReceive = await pageInstance.$.graph
            .node('@sage/x3-master-data/ProductSite')
            .read(
                {
                    stockSite: { code: true },
                    isLocationManaged: true,
                    isLicensePlateNumberManaged: true,
                    defaultInternalContainer: {
                        code: true,
                    },
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
                    product: {
                        code: true,
                        localizedDescription1: true,
                        productCategory: {
                            code: true,
                        },
                        lotManagementMode: true,
                        serialNumberManagementMode: true,
                        stockVersionMode: true,
                        expirationManagementMode: true,
                        serialSequenceNumber: true,
                        lotSequenceNumber: true,
                        stockManagementMode: true,
                        defaultPotencyInPercentage: true,
                        expirationLeadTime: true,
                        expirationTimeUnit: true,
                        useByDateCoefficient: true,
                        stockUnit: {
                            code: true,
                            numberOfDecimals: true,
                        },
                        packingUnits: {
                            query: {
                                edges: {
                                    node: {
                                        packingUnit: {
                                            code: true,
                                            numberOfDecimals: true,
                                        },
                                        packingUnitToStockUnitConversionFactor: true,
                                        isPackingFactorEntryAllowed: true,
                                    },
                                },
                            },
                        },
                    },
                },
                // TODO: find a better way if possible
                `${productCode}|${siteCode}`,
            )
            .execute();

        // If an error occurred during the API call
        if (!productSiteToReceive) {
            pageInstance.$.showToast(
                ui.localize(
                    '@sage/x3-stock/pages__miscellaneous_receipt_details__notification__invalid_product_site_error',
                    `Could not retrieve your product {{ productCode }} for the site {{ siteCode }}`,
                    {
                        productCode: productCode,
                        siteCode: siteCode,
                    },
                ),
                {
                    type: 'error',
                    timeout: 5000,
                },
            );
            return pageInstance.$.router.goTo('@sage/x3-stock/MobileMiscellaneousReceipt', {
                ReturnFromDetail: 'yes',
            });
        }

        return productSiteToReceive as any;
    } else {
        pageInstance.$.storage.remove('productSite');
        return JSON.parse(storageProductSite);
    }
}
