import { GraphApi, Stock } from '@sage/x3-stock-data-api';
// import { GraphApi } from '@sage/x3-stock-api';
import { ExtractEdges, extractEdges, ExtractEdgesPartial } from '@sage/xtrem-client';
import * as ui from '@sage/xtrem-ui';
import { UnitOfMeasure } from '@sage/x3-master-data-api-partial';
import { getUnitNumberOfDecimalList, getNumberOfDecimal } from '../client-functions/get-unit-number-decimals';

@ui.decorators.page<MobileViewStockByLocationProductDetails>({
    title: 'Stock by location',
    subtitle: 'Product details',
    isTitleHidden: true, // hide the page's title and render that title only in the feature header instead of in both places (see X3-177000 & https://github.com/Sage-ERP-X3/etna/pull/1785)
    node: '@sage/x3-stock-data/Location',
    mode: 'default',
    skipDirtyCheck: true,
    navigationPanel: undefined,
    headerCard() {
        // TODO Issue: Header Card doesn't support Reference or Numeric control
        return {
            title: this.product,
            titleRight: this.stockQuantity,
            line2: this.localizedDescription1,
            line3: this.lpnOrLocation,
            line3Right: this.lotCount,
        };
    },
    async onLoad() {
        // Requires a selected location, product, & lpn in the query parameters
        const productParameter: string | number | boolean = this.$.queryParameters['product'];
        const lotCountParameter: string | number | boolean = this.$.queryParameters['lotCount'];
        const stockQuantityParameter: string | number | boolean = this.$.queryParameters['stockQuantity'];
        const stockUnitParameter: string | number | boolean = this.$.queryParameters['stockUnit'];

        if (
            !this.code.value ||
            !productParameter ||
            lotCountParameter === null || // because we want to allow possibility of 0 lot count
            lotCountParameter === undefined ||
            !stockQuantityParameter ||
            !stockUnitParameter
        ) {
            this.$.showToast(
                ui.localize(
                    '@sage/x3-stock/notification-error-location-inquiry-level4-missing-params',
                    'A selected location, product, & license plate number are required',
                ),
                { type: 'error' },
            );
            this.$.router.goTo('@sage/x3-stock/MobileViewStockByLocation');
            return;
        }

        // Fill out header card
        this._numberOfDecimalList = await getUnitNumberOfDecimalList(this);
        const numberDecimal: number = getNumberOfDecimal(this._numberOfDecimalList,stockUnitParameter.toString());

        this.product.value = productParameter.toString();
        this.stockQuantity.value = Number(stockQuantityParameter).toFixed(numberDecimal);
        this.stockQuantity.postfix = stockUnitParameter.toString();
        this.lotCount.value = lotCountParameter.toString();

        const lpnParameter: string | number | boolean = this.$.queryParameters['licensePlateNumber'];
        if (lpnParameter) {
            this.lpnOrLocation.prefix = ui.localize(
                '@sage/x3-stock/location-inquiry-license-plate-number-prefix',
                'LPN',
            );
            this.lpnOrLocation.value = String(lpnParameter);
        } else {
            this.lpnOrLocation.prefix = ui.localize('@sage/x3-stock/location-inquiry-location-prefix', 'Location');
            this.lpnOrLocation.value = this.code.value;
        }

        // Apply filter to the detailed list component
        // TODO Issue: Unnecessary non-transient call is made when trying to apply a filter in a dynamic way
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
                            status: {
                                code: true,
                            },
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
                                location: { code: this.code.value },
                                product: { product: productParameter as string },
                                licensePlateNumber: lpnParameter ? (lpnParameter as string) : '',
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
        // Should never happen
        if (response.length === 0) {
            return;
        }
        this.globalSerial.value =
            (response[0] as ExtractEdges<Stock>).product.product.serialNumberManagementMode === 'globalReceivedIssued'
                ? 1
                : 0;
        this.otherSerial.value =
            (response[0] as ExtractEdges<Stock>).product.product.serialNumberManagementMode === 'receivedIssued' ||
            (response[0] as ExtractEdges<Stock>).product.product.serialNumberManagementMode === 'issued'
                ? 1
                : 0;
        this.lotManaged.value =
            (response[0] as ExtractEdges<Stock>).product.product.lotManagementMode === 'notManaged' ? 0 : 1;
        this.sublotManaged.value =
            (response[0] as ExtractEdges<Stock>).product.product.lotManagementMode === 'lotAndSublot' ? 1 : 0;
        this.localizedDescription1.value = (response[0] as ExtractEdges<Stock>).product.product.localizedDescription1;

        // Display product picture
        const productPicture = await this.$.graph
            .node('@sage/x3-master-data/Product')
            .read({_picture: {identifier1: true, data: { value: true } } }, `${this.product.value}| `)
            .execute();
        this.image.value = productPicture?._picture?.data ?? undefined;
        this.$.setPageClean();

        this.stockDetailLines.value = await response.map((currentRecord: ExtractEdges<Stock>) => {
            return {
                _id: currentRecord._id,
                stockId: currentRecord.stockId,
                lot: currentRecord.lot,
                sublot: currentRecord.sublot,
                majorVersion: currentRecord.lotReference?.majorVersion
                    ? currentRecord.lotReference.majorVersion?.code
                    : null,
                expirationDate:
                    currentRecord.product.product.expirationManagementMode === 'notManaged'
                        ? null
                        : currentRecord.lotReference?.expirationDate,
                useByDate:
                    currentRecord.product.product.expirationManagementMode === 'notManaged'
                        ? null
                        : currentRecord.lotReference?.useByDate,
                custom1: currentRecord.lotReference?.lotCustomField1,
                custom2: currentRecord.lotReference?.lotCustomField2,
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
            };
        });
    },
})
export class MobileViewStockByLocationProductDetails extends ui.Page<GraphApi> {
    private _numberOfDecimalList: ExtractEdgesPartial<UnitOfMeasure>[];

    @ui.decorators.section<MobileViewStockByLocationProductDetails>({
        isTitleHidden: true,
    })
    mainSection: ui.containers.Section;

    @ui.decorators.block<MobileViewStockByLocationProductDetails>({
        parent() {
            return this.mainSection;
        },
    })
    mainBlock: ui.containers.Block;

    @ui.decorators.textField<MobileViewStockByLocationProductDetails>({
        isTransient: true,
        isReadOnly: true,
    })
    product: ui.fields.Text;

    @ui.decorators.textField<MobileViewStockByLocationProductDetails>({
        isTransient: true,
        isReadOnly: true,
    })
    lpnOrLocation: ui.fields.Text;

    @ui.decorators.textField<MobileViewStockByLocationProductDetails>({
        isTransient: true,
        isReadOnly: true,
    })
    lotCount: ui.fields.Text;

    @ui.decorators.imageField<MobileViewStockByLocationProductDetails>({
        parent() {
            return this.mainBlock;
        },
        isTransient: true,
        isReadOnly: true,
        width: 'medium',
        height: 'medium',
    })
    image: ui.fields.Image;

    @ui.decorators.textField<MobileViewStockByLocationProductDetails>({
        isTransient: true,
        isReadOnly: true,
    })
    stockQuantity: ui.fields.Text;

    @ui.decorators.numericField<MobileViewStockByLocationProductDetails>({
        isTransient: true,
        isReadOnly: true,
    })
    globalSerial: ui.fields.Numeric;

    @ui.decorators.numericField<MobileViewStockByLocationProductDetails>({
        isTransient: true,
        isReadOnly: true,
    })
    otherSerial: ui.fields.Numeric;

    @ui.decorators.numericField<MobileViewStockByLocationProductDetails>({
        isTransient: true,
        isReadOnly: true,
    })
    lotManaged: ui.fields.Numeric;

    @ui.decorators.numericField<MobileViewStockByLocationProductDetails>({
        isTransient: true,
        isReadOnly: true,
    })
    sublotManaged: ui.fields.Numeric;

    @ui.decorators.textField<MobileViewStockByLocationProductDetails>({
        isTransient: true,
        isReadOnly: true,
    })
    localizedDescription1: ui.fields.Text;

    @ui.decorators.detailListField<MobileViewStockByLocationProductDetails>({
        parent() {
            return this.mainBlock;
        },
        isTransient: true,
        fields: [
            ui.nestedFields.numeric({
                bind: 'stockId',
                isHidden: true,
                isTransient: true,
            }),
            //display a blank line at the top
            ui.nestedFields.text({
                bind: '_spacerColumn',
                isReadOnly: true,
                isTransient: true,
            }),
            // Blank header when no serial or lot
            ui.nestedFields.text({
                bind: 'lot',
                isReadOnly: true,
                isTransient: false,
                isHidden() {
                    return this.lotManaged.value === 1 || this.otherSerial.value === 1 || this.globalSerial.value === 1;
                },
            }),
            ui.nestedFields.text({
                bind: 'lot',
                title: 'Lot',
                isReadOnly: true,
                isTransient: false,
                isHidden() {
                    return this.lotManaged.value === 0;
                },
            }),
            ui.nestedFields.text({
                bind: 'sublot',
                title: 'Sublot',
                isReadOnly: true,
                isTransient: false,
                isHidden() {
                    return this.sublotManaged.value === 0;
                },
            }),
            ui.nestedFields.text({
                bind: 'majorVersion',
                title: 'Major version',
                isReadOnly: true,
                isTransient: false,
                isHidden() {
                    return this.lotManaged.value === 0;
                },
            }),
            ui.nestedFields.date({
                bind: 'expirationDate',
                title: 'Expiration date',
                isReadOnly: true,
                isTransient: false,
                isHidden() {
                    return this.lotManaged.value === 0;
                },
            }),
            ui.nestedFields.date({
                bind: 'useByDate',
                title: 'Use-by date',
                isReadOnly: true,
                isTransient: false,
                isHidden() {
                    return this.lotManaged.value === 0;
                },
            }),
            ui.nestedFields.text({
                bind: 'custom1',
                title: 'Lot custom field 1',
                isReadOnly: true,
                isTransient: false,
                isHidden() {
                    return this.lotManaged.value === 0;
                },
            }),
            ui.nestedFields.text({
                bind: 'custom2',
                title: 'Lot custom field 2',
                isReadOnly: true,
                isTransient: false,
                isHidden() {
                    return this.lotManaged.value === 0;
                },
            }),
            ui.nestedFields.text({
                bind: 'serialNumber',
                title: 'Serial no.',
                isReadOnly: true,
                isTransient: false,
                isHidden() {
                    return this.otherSerial.value === 0;
                },
            }),
            ui.nestedFields.link({
                bind: 'globalSerialNumber',
                title: 'Serial no.',
                isHidden() {
                    return this.globalSerial.value === 0;
                },
                async onClick(_id, rowData: any) {
                    this.$.setPageClean();
                    this.$.router.goTo('@sage/x3-stock/MobileGlobalSerialDetails', {
                        product: this.product.value as string,
                        stockId: rowData.stockId,
                        subtitle: this.localizedDescription1.value as string,
                    });
                },
            }),
            ui.nestedFields.text({
                // TODO Issue: No way to bind to multiple node fields to display packing unit or set postfix in a dynamic way
                bind: 'quantityInPackingUnit',
                title: 'Packing qty.',
                isTransient: false,
            }),
            ui.nestedFields.text({
                // TODO Issue: No way to bind to multiple node fields to display stock unit or set postfix in a dynamic way
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
        ],
    })
    stockDetailLines: ui.fields.DetailList;

    @ui.decorators.textField<MobileViewStockByLocationProductDetails>({
        isTransient: false,
        isReadOnly: true,
        isHidden: true,
    })
    code: ui.fields.Text;
}
