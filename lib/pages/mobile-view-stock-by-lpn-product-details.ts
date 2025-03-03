import { GraphApi, Stock } from '@sage/x3-stock-data-api';
import { ExtractEdges, extractEdges, ExtractEdgesPartial } from '@sage/xtrem-client';
import * as ui from '@sage/xtrem-ui';
import { UnitOfMeasure } from '@sage/x3-master-data-api-partial';
import { getUnitNumberOfDecimalList, getNumberOfDecimal } from '../client-functions/get-unit-number-decimals';

@ui.decorators.page<MobileViewStockByLpnProductDetails>({
    title: 'Stock by LPN',
    subtitle: 'Product details',
    isTitleHidden: true, // hide the page's title and render that title only in the feature header instead of in both places (see X3-177000 & https://github.com/Sage-ERP-X3/etna/pull/1785)
    node: '@sage/x3-stock-data/LicensePlateNumber',
    mode: 'default',
    skipDirtyCheck: true,
    navigationPanel: undefined,
    headerCard() {
        return {
            title: this.product,
            titleRight: this.stockQuantity,
            line2: this.localizedDescription1,
            line3: this.lpn,
            line3Right: this.location,
        };
    },
    async onLoad() {
        // Requires a selected location, product, & lpn in the query parameters
        const lpnParameter: string | number | boolean = this.$.queryParameters['licensePlateNumber'];
        const productParameter: string | number | boolean = this.$.queryParameters['product'];
        const stockQuantityParameter: string | number | boolean = this.$.queryParameters['stockQuantity'];
        const stockUnitParameter: string | number | boolean = this.$.queryParameters['stockUnit'];
        const locationParameter: string | number | boolean = this.$.queryParameters['location'];
        if (
            !lpnParameter ||
            !productParameter ||
            !locationParameter ||
            !stockQuantityParameter ||
            !stockUnitParameter
        ) {
            this.$.showToast(
                ui.localize(
                    '@sage/x3-stock/notification-error-lpn-inquiry-level3-missing-params',
                    'A selected license plate number and product are required',
                ),
                { type: 'error' },
            );
            this.$.router.goTo('@sage/x3-stock/MobileViewStockByLpn');
            return;
        }

        // Fill out header card
        this._numberOfDecimalList = await getUnitNumberOfDecimalList(this);
        const numberDecimal: number = getNumberOfDecimal(this._numberOfDecimalList,stockUnitParameter.toString());

        this.product.value = productParameter.toString();
        this.stockQuantity.value = Number(stockQuantityParameter).toFixed(numberDecimal);
        this.stockQuantity.postfix = stockUnitParameter.toString();
        this.location.value = locationParameter.toString();

        this.lpn.prefix = ui.localize('@sage/x3-stock/lpn-inquiry-license-plate-number-prefix', 'LPN');

        if (lpnParameter) {
            this.lpn.value = String(lpnParameter);
        }

        const response = extractEdges(
            await this.$.graph
                .node('@sage/x3-stock-data/Stock')
                .query(
                    ui.queryUtils.edgesSelector<Stock>(
                        {
                            _id: true,
                            lot: true,
                            sublot: true,
                            quantityInPackingUnit: true,
                            packingUnit: {
                                code: true,
                            },
                            quantityInStockUnit: true,
                            product: {
                                product: {
                                    stockUnit: {
                                        code: true,
                                    },
                                    serialNumberManagementMode: true,
                                    lotManagementMode: true,
                                    code: true,
                                    localizedDescription1: true,
                                    expirationManagementMode: true,
                                },
                            },
                            allocatedQuantity: true,
                            serialNumber: true,
                            status: { code: true },
                            identifier1: true,
                            identifier2: true,
                            qualityAnalysisRequestId: true,
                            owner: true,
                            isBeingCounted: true,
                            packingUnitToStockUnitConversionFactor: true,
                            stockId: true,
                            lotReference: {
                                expirationDate: true,
                                useByDate: true,
                                lotCustomField1: true,
                                lotCustomField2: true,
                                majorVersion: { code: true },
                            },
                        },
                        {
                            first: 500,
                            filter: {
                                stockSite: { code: this.$.storage.get('mobile-selected-stock-site') as string },
                                product: { product: productParameter as string },
                                licensePlateNumber: { code: lpnParameter as string },
                            },
                            orderBy: {
                                lot: 1,
                                serialNumber: 1,
                            },
                        },
                    ),
                )
                .execute(),
        );

        // Display product picture
        const productPicture = await this.$.graph
            .node('@sage/x3-master-data/Product')
            .read({_picture: {identifier1: true, data: { value: true } } }, `${this.product.value}| `)
            .execute();
        this.image.value = productPicture?._picture?.data ?? undefined;

        this.$.setPageClean();
        this.localizedDescription1.value = (response[0] as ExtractEdges<Stock>).product.product.localizedDescription1;
        this.stockDetailLines.value = response.map((currentRecord: ExtractEdges<Stock>) => {
            return {
                _id: currentRecord._id,
                stockId: currentRecord.stockId,
                globalSerial:
                    currentRecord.product.product.serialNumberManagementMode === 'globalReceivedIssued' ? 1 : 0,
                otherSerial:
                    currentRecord.product.product.serialNumberManagementMode === 'receivedIssued' ||
                    currentRecord.product.product.serialNumberManagementMode === 'issued'
                        ? 1
                        : 0,
                lotManaged: currentRecord.product.product.lotManagementMode === 'notManaged' ? 0 : 1,
                sublotManaged: currentRecord.product.product.lotManagementMode === 'lotAndSublot' ? 1 : 0,
                lot: currentRecord.lot,
                sublot: currentRecord.sublot,
                majorVersion: currentRecord.lotReference.majorVersion
                    ? currentRecord.lotReference.majorVersion.code
                    : null,
                expirationDate:
                    currentRecord.product.product.expirationManagementMode === 'notManaged'
                        ? null
                        : currentRecord.lotReference.expirationDate,
                useByDate:
                    currentRecord.product.product.expirationManagementMode === 'notManaged'
                        ? null
                        : currentRecord.lotReference.useByDate,
                custom1: currentRecord.lotReference.lotCustomField1,
                custom2: currentRecord.lotReference.lotCustomField2,
                quantityInPackingUnit: `${currentRecord.quantityInPackingUnit} ${currentRecord.packingUnit.code}`,
                quantityInStockUnit: `${currentRecord.quantityInStockUnit} ${currentRecord.product.product.stockUnit.code}`,
                allocatedQuantity: `${currentRecord.allocatedQuantity === null ? 0 : currentRecord.allocatedQuantity} ${
                    currentRecord.product.product.stockUnit.code
                }`,
                serialNumber: currentRecord.serialNumber,
                globalSerialNumber: ui.localize('@sage/x3-stock/label-view-all', 'View list'),
                status: currentRecord.status.code,
                identifier1: currentRecord.identifier1,
                identifier2: currentRecord.identifier2,
                qualityAnalysisRequestId: currentRecord.qualityAnalysisRequestId,
                countInProgress: currentRecord.isBeingCounted
                    ? ui.localize('@sage/x3-stock/label-yes', 'Yes')
                    : ui.localize('@sage/x3-stock/label-no', 'No'),
                owner: currentRecord.owner,
                localizedDescription1: currentRecord.product.product.localizedDescription1,
            };
        });
    },
})
export class MobileViewStockByLpnProductDetails extends ui.Page<GraphApi> {
    private _numberOfDecimalList: ExtractEdgesPartial<UnitOfMeasure>[];

    @ui.decorators.section<MobileViewStockByLpnProductDetails>({
        isTitleHidden: true,
    })
    mainSection: ui.containers.Section;

    @ui.decorators.block<MobileViewStockByLpnProductDetails>({
        parent() {
            return this.mainSection;
        },
    })
    mainBlock: ui.containers.Block;

    @ui.decorators.textField<MobileViewStockByLpnProductDetails>({
        isTransient: true,
        isReadOnly: true,
    })
    product: ui.fields.Text;

    @ui.decorators.textField<MobileViewStockByLpnProductDetails>({
        isTransient: true,
        isReadOnly: true,
    })
    localizedDescription1: ui.fields.Text;

    @ui.decorators.textField<MobileViewStockByLpnProductDetails>({
        isTransient: true,
        isReadOnly: true,
    })
    lpn: ui.fields.Text;

    @ui.decorators.textField<MobileViewStockByLpnProductDetails>({
        isTransient: true,
        isReadOnly: true,
    })
    location: ui.fields.Text;

    @ui.decorators.imageField<MobileViewStockByLpnProductDetails>({
        parent() {
            return this.mainBlock;
        },
        isTransient: true,
        isReadOnly: true,
        width: 'medium',
        height: 'medium',
    })
    image: ui.fields.Image;

    @ui.decorators.textField<MobileViewStockByLpnProductDetails>({
        isTransient: true,
        isReadOnly: true,
    })
    stockQuantity: ui.fields.Text;

    @ui.decorators.detailListField<MobileViewStockByLpnProductDetails>({
        parent() {
            return this.mainBlock;
        },
        //bind: 'stock',
        isTransient: true,
        fields: [
            ui.nestedFields.numeric({
                bind: 'stockId',
                isHidden: true,
                isTransient: true,
            }),
            ui.nestedFields.numeric({
                bind: 'globalSerial',
                isHidden: true,
                isTransient: true,
            }),
            ui.nestedFields.numeric({
                bind: 'otherSerial',
                isHidden: true,
                isTransient: true,
            }),
            ui.nestedFields.numeric({
                bind: 'lotManaged',
                isHidden: true,
                isTransient: true,
            }),
            ui.nestedFields.numeric({
                bind: 'sublotManaged',
                isHidden: true,
                isTransient: true,
            }),
            //display a blank line at the top
            ui.nestedFields.text({
                bind: '_spacerColumn',
                isReadOnly: true,
                isTransient: true,
            }),
            // Display a blank lot for the first field when the
            // product is neither lot controlled or serial controlled.
            // It simply looks better.
            ui.nestedFields.text({
                bind: 'lot',
                isReadOnly: true,
                isTransient: false,
                isHidden(value, rowData) {
                    return rowData?.lotManaged || rowData?.otherSerial | rowData?.globalSerial;
                },
            }),
            ui.nestedFields.text({
                bind: 'lot',
                title: 'Lot',
                isReadOnly: true,
                isTransient: false,
                isHidden(value, rowData) {
                    return rowData?.lotManaged === 0;
                },
            }),
            ui.nestedFields.text({
                bind: 'sublot',
                title: 'Sublot',
                isReadOnly: true,
                isTransient: false,
                isHidden(value, rowData) {
                    return rowData?.sublotManaged === 0;
                },
            }),
            ui.nestedFields.text({
                bind: 'majorVersion',
                title: 'Major version',
                isReadOnly: true,
                isTransient: false,
                isHidden(value, rowData) {
                    return rowData?.lotManaged === 0;
                },
            }),
            ui.nestedFields.date({
                bind: 'expirationDate',
                title: 'Expiration date',
                isReadOnly: true,
                isTransient: false,
                isHidden(value, rowData) {
                    return rowData?.lotManaged === 0;
                },
            }),
            ui.nestedFields.date({
                bind: 'useByDate',
                title: 'Use-by date',
                isReadOnly: true,
                isTransient: false,
                isHidden(value, rowData) {
                    return rowData?.lotManaged === 0;
                },
            }),
            ui.nestedFields.text({
                bind: 'custom1',
                title: 'Lot custom field 1',
                isReadOnly: true,
                isTransient: false,
                isHidden(value, rowData) {
                    return rowData?.lotManaged === 0;
                },
            }),
            ui.nestedFields.text({
                bind: 'custom2',
                title: 'Lot custom field 2',
                isReadOnly: true,
                isTransient: false,
                isHidden(value, rowData) {
                    return rowData?.lotManaged === 0;
                },
            }),
            ui.nestedFields.text({
                bind: 'serialNumber',
                title: 'Serial no.',
                isReadOnly: true,
                isTransient: false,
                isHidden(value, rowData) {
                    return rowData?.otherSerial === 0;
                },
            }),
            ui.nestedFields.link({
                bind: 'globalSerialNumber',
                title: 'Serial no.',
                isHidden(value, rowData) {
                    return rowData?.globalSerial === 0;
                },
                async onClick(_id, rowData: any) {
                    this.$.setPageClean();
                    this.$.router.goTo('@sage/x3-stock/MobileGlobalSerialDetails', {
                        product: this.product.value as string,
                        stockId: rowData.stockId,
                        subtitle: rowData.localizedDescription1,
                    });
                },
            }),
            ui.nestedFields.text({
                bind: 'quantityInPackingUnit',
                title: 'Packing qty.',
                isTransient: false,
            }),
            ui.nestedFields.text({
                bind: 'quantityInStockUnit',
                title: 'Stock qty.',
                isTransient: false,
            }),

            ui.nestedFields.text({
                bind: 'allocatedQuantity',
                title: 'Allocated qty.',
                isTransient: false,
            }),
            ui.nestedFields.text({
                bind: 'status',
                title: 'Status',
                isReadOnly: true,
                isTransient: false,
            }),
            ui.nestedFields.text({
                bind: 'identifier1',
                title: 'Identifier 1',
                isReadOnly: true,
                isTransient: false,
            }),
            ui.nestedFields.text({
                bind: 'identifier2',
                title: 'Identifier 2',
                isReadOnly: true,
                isTransient: false,
            }),
            ui.nestedFields.text({
                bind: 'qualityAnalysisRequestId',
                title: 'Analysis req.',
                isReadOnly: true,
                isTransient: false,
            }),
            ui.nestedFields.text({
                bind: 'countInProgress',
                title: 'Count in progress',
                isReadOnly: true,
                isTransient: false,
            }),
            ui.nestedFields.text({
                bind: 'owner',
                title: 'Owner',
                isReadOnly: true,
                isTransient: false,
            }),
            ui.nestedFields.text({
                bind: 'localizedDescription1',
                isHidden: true,
            }),
        ],
    })
    stockDetailLines: ui.fields.DetailList;

    @ui.decorators.textField<MobileViewStockByLpnProductDetails>({
        isTransient: false,
        isReadOnly: true,
        isHidden: true,
    })
    code: ui.fields.Text;
}
