import { GraphApi, Stock } from '@sage/x3-stock-data-api';
import {
    AggregateEdgesSelector,
    AggregateGroupSelector,
    AggregateQueryOptions,
    AggregateQuerySelector,
    AggregateValuesSelector,
    ClientNode,
    Edges,
    ExtractEdges,
    aggregateEdgesSelector,
    extractEdges,
} from '@sage/xtrem-client';
import * as ui from '@sage/xtrem-ui';

@ui.decorators.page<MobileViewStockByProductSiteProductDetails>({
    isTitleHidden: true,
    title: 'Stock by product-site',
    subtitle: 'Product details',
    isTransient: true,
    skipDirtyCheck: true,
    headerCard() {
        return {
            title: this.product,
            titleRight: this.stockQuantity,
            line2: this.localizedDescription1,
            line3: this.lpnOrLocation,
            line3Right: this.lotCount,
        };
    },
    async onLoad() {
        const siteParameter: string | number | boolean = this.$.queryParameters.site;
        const locationParameter: string | number | boolean = this.$.queryParameters.location;
        const productParameter: string | number | boolean = this.$.queryParameters.product;
        const lpnParameter: string | number | boolean = this.$.queryParameters['licensePlateNumber'];

        const mess: string = ui.localize(
            '@sage/x3-stock/license-plate-number-required',
            'Selected license plate number is required',
        );
        if (productParameter === null || productParameter === undefined) {
            this.$.showToast(mess, { type: 'warning' });
            this.$.router.goTo(`@sage/x3-stock/MobileViewStockByProductSite`);
            return;
        }

        this.site.value = siteParameter.toString();
        this.product.value = productParameter.toString();
        this.location.value = locationParameter.toString();
        this.licensePlateNumber.value = lpnParameter.toString();
        await this._getProductSite();

        if (this.licensePlateNumber.value && String(this.licensePlateNumber.value) != '') {
            this.lpnOrLocation.prefix = ui.localize(
                '@sage/x3-stock/location-inquiry-license-plate-number-prefix',
                'LPN',
            );
            this.lpnOrLocation.value = String(lpnParameter);
            await this._getLicensePlateNumberQuantity();
        } else if (this.location.value && String(this.location.value) != '') {
            this.lpnOrLocation.prefix = ui.localize('@sage/x3-stock/location-inquiry-location-prefix', 'Location');
            this.lpnOrLocation.value = String(this.location.value);
            await this._getLocationQuantity();
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
                                stockSite: { code: siteParameter as string },
                                location: { code: this.location.value as string },
                                product: { product: { code: productParameter as string } },
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
            setTimeout(
                () =>
                    this.$.showToast(
                        ui.localize(
                            '@sage/x3-stock/selected-product-no-results',
                            'Product {{code}} has no stock records.',
                            {
                                code: productParameter as string,
                            },
                        ),
                        { type: 'info' },
                    ),
                10,
            );
            this.$.router.goTo(`@sage/x3-stock/MobileViewStockByProductSite`);
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
            };
        });
    },
})
export class MobileViewStockByProductSiteProductDetails extends ui.Page<GraphApi> {
    rowCounter: number;
    _productSiteLotManagement: String;

    @ui.decorators.section<MobileViewStockByProductSiteProductDetails>({
        isTitleHidden: true,
    })
    mainSection: ui.containers.Section;

    @ui.decorators.block<MobileViewStockByProductSiteProductDetails>({
        parent() {
            return this.mainSection;
        },
    })
    mainBlock: ui.containers.Block;

    @ui.decorators.textField<MobileViewStockByProductSiteProductDetails>({
        isTransient: true,
        isReadOnly: true,
    })
    site: ui.fields.Text;

    @ui.decorators.textField<MobileViewStockByProductSiteProductDetails>({
        isTransient: true,
        isReadOnly: true,
    })
    location: ui.fields.Text;

    @ui.decorators.textField<MobileViewStockByProductSiteProductDetails>({
        isTransient: true,
        isReadOnly: true,
        isHidden: true,
    })
    licensePlateNumber: ui.fields.Text;

    @ui.decorators.textField<MobileViewStockByProductSiteProductDetails>({
        isTransient: true,
        isReadOnly: true,
    })
    product: ui.fields.Text;

    @ui.decorators.textField<MobileViewStockByProductSiteProductDetails>({
        isTransient: true,
        isReadOnly: true,
    })
    lpnOrLocation: ui.fields.Text;

    @ui.decorators.textField<MobileViewStockByProductSiteProductDetails>({
        isTransient: true,
        isReadOnly: true,
    })
    lotCount: ui.fields.Text;

    @ui.decorators.imageField<MobileViewStockByProductSiteProductDetails>({
        parent() {
            return this.mainBlock;
        },
        isTransient: true,
        isReadOnly: true,
        width: 'medium',
        height: 'medium',
    })
    image: ui.fields.Image;

    @ui.decorators.textField<MobileViewStockByProductSiteProductDetails>({
        isTransient: true,
        isReadOnly: true,
    })
    stockQuantity: ui.fields.Text;

    @ui.decorators.numericField<MobileViewStockByProductSiteProductDetails>({
        isTransient: true,
        isReadOnly: true,
    })
    globalSerial: ui.fields.Numeric;

    @ui.decorators.numericField<MobileViewStockByProductSiteProductDetails>({
        isTransient: true,
        isReadOnly: true,
    })
    otherSerial: ui.fields.Numeric;

    @ui.decorators.numericField<MobileViewStockByProductSiteProductDetails>({
        isTransient: true,
        isReadOnly: true,
    })
    lotManaged: ui.fields.Numeric;

    @ui.decorators.numericField<MobileViewStockByProductSiteProductDetails>({
        isTransient: true,
        isReadOnly: true,
    })
    sublotManaged: ui.fields.Numeric;

    @ui.decorators.textField<MobileViewStockByProductSiteProductDetails>({
        isTransient: true,
        isReadOnly: true,
    })
    localizedDescription1: ui.fields.Text;

    @ui.decorators.detailListField<MobileViewStockByProductSiteProductDetails>({
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

    private async _getProductSite() {
        const _productSite = await this.$.graph
            .node('@sage/x3-master-data/ProductSite')
            .read(
                {
                    _id: true,
                    isLocationManaged: true,
                    isLicensePlateNumberManaged: true,
                    distinctCountOfLocations: true,
                    countOfStockRecords: true,
                    distinctCountOfStockQuantity: true,
                    distinctCountOfLots: true,
                    distinctCountOfSublots: true,
                    stockUnitCode: true,
                    product: {
                        code: true,
                        localizedDescription1: true,
                        upc: true,
                        lotManagementMode: true,
                    },
                    stockSite: {
                        code: true,
                    },
                },
                // TODO: find a better way if possible
                `${this.product.value}|${this.site.value}`,
            )
            .execute();

        this._productSiteLotManagement = _productSite.product.lotManagementMode;

        this.lotCount.value =
            this._productSiteLotManagement !== 'notManaged'
                ? ui.localize('@sage/x3-stock/lots-title', 'Lots: {{code}}', {
                      code: _productSite.distinctCountOfLots,
                  })
                : '';
        this.stockQuantity.value = `${_productSite.distinctCountOfStockQuantity} ${_productSite.stockUnitCode}`;
    }

    private generateAggregateStockRequest<T extends ClientNode>(
        selector: AggregateQuerySelector<T, AggregateGroupSelector<T>, AggregateValuesSelector<T>>,
        filter: AggregateQueryOptions<T>,
        numberOfRecords = 1000,
    ) {
        const tempAggregateRequest: AggregateEdgesSelector<
            T,
            AggregateGroupSelector<T>,
            AggregateValuesSelector<T>
        > = aggregateEdgesSelector<T, AggregateGroupSelector<T>, AggregateValuesSelector<T>>(selector, filter);
        tempAggregateRequest.__args.first = numberOfRecords;
        return this.$.graph.node('@sage/x3-stock-data/Stock').aggregate.query(tempAggregateRequest);
    }

    private async _getLocationQuantity() {
        const groupByLocation: AggregateGroupSelector<Stock> = {
            location: {
                code: {
                    _by: 'value',
                },
            },
            product: {
                product: {
                    stockUnit: {
                        code: {
                            _by: 'value',
                        },
                    },
                },
            },
        };
        const filterByLocation = {
            product: { product: { code: this.product.value as string } },
            stockSite: { code: this.site.value as string },
            location: { code: this.location.value as string },
        };
        const requests = {
            aggregateSumStockQuantity: this.generateAggregateStockRequest<Stock>(
                {
                    group: groupByLocation,
                    values: {
                        quantityInStockUnit: { sum: true },
                        lot: { distinctCount: true },
                    },
                },
                {
                    filter: filterByLocation,
                },
            ),
        };
        const aggregateRequest = await new ui.queryUtils.BatchRequest(requests).execute();
        extractEdges(aggregateRequest.aggregateSumStockQuantity as Edges<any>).forEach(aggregation => {
            this.stockQuantity.value = `${aggregation.values.quantityInStockUnit.sum} ${aggregation.group.product.product.stockUnit.code}`;
            this.lotCount.value =
                this._productSiteLotManagement !== 'notManaged'
                    ? ui.localize('@sage/x3-stock/lots-title', 'Lots: {{code}}', {
                          code: aggregation.values.lot.distinctCount,
                      })
                    : '';
        });
    }

    private async _getLicensePlateNumberQuantity() {
        const groupByLPN: AggregateGroupSelector<Stock> = {
            licensePlateNumber: {
                code: {
                    _by: 'value',
                },
            },
            product: {
                product: {
                    stockUnit: {
                        code: {
                            _by: 'value',
                        },
                    },
                },
            },
        };
        const filterByLPN = {
            product: { product: { code: this.product.value as string } },
            stockSite: { code: this.site.value as string },
            licensePlateNumber: this.licensePlateNumber.value
                ? { code: this.licensePlateNumber.value as string }
                : undefined,
        };
        const requests = {
            aggregateSumStockQuantity: this.generateAggregateStockRequest<Stock>(
                {
                    group: groupByLPN,
                    values: {
                        quantityInStockUnit: { sum: true },
                        lot: { distinctCount: true },
                    },
                },
                {
                    filter: filterByLPN,
                },
            ),
        };
        const aggregateRequest = await new ui.queryUtils.BatchRequest(requests).execute();
        extractEdges(aggregateRequest.aggregateSumStockQuantity as Edges<any>).forEach(aggregation => {
            this.stockQuantity.value = `${aggregation.values.quantityInStockUnit.sum} ${aggregation.group.product.product.stockUnit.code}`;
            this.lotCount.value =
                this._productSiteLotManagement !== 'notManaged'
                    ? ui.localize('@sage/x3-stock/lots-title', 'Lots: {{code}}', {
                          code: aggregation.values.lot.distinctCount,
                      })
                    : '';
        });
    }
}
