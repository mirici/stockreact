import * as ui from '@sage/xtrem-ui';
import { GraphApi, Allocation, StockEntryTransaction } from '@sage/x3-stock-api';
import { decimal, integer } from '@sage/xtrem-shared';
import { ExtractEdges, extractEdges } from '@sage/xtrem-client';
interface LocationReorders {
    product: string;
    localizedDescription1: string;
    upc: string;
    source: string;
    reorderQuantity: string;
    reorderUnit: string;
    decimalPrecision: string;
    fromLocation: string | undefined;
    toLocation: string | undefined;
    lot: string;
    sublot: string;
    serialNumber: string;
    status: string;
    documentLine: string;
    stockId: string;
    stockSequence: string;
    identifier1: string;
    identifier2: string;
    licensePlateNumber: string;
    packingUnitToStockUnitConversionFactor: string;
}

@ui.decorators.page<MobileLocationReorderTodo>({
    title: 'Location reordering',
    subtitle: 'Select a product',
    isTitleHidden: true,
    isTransient: true,
    skipDirtyCheck: true,
    headerCard() {
        return {
            title: this.storageListNumber,
        };
    },
    async onLoad() {
        let stockSite: string = String(this.$.queryParameters.stockSite);
        let storageListNumber: string = String(this.$.queryParameters.storageListNumber);
        let entryTransaction: string = String(this.$.queryParameters.entryTransaction);

        this.storageListNumber.value = storageListNumber;
        this.stockSite = stockSite;
        this.transaction = entryTransaction;

        this.locationReorders = await this.searchLocationReorders(stockSite,storageListNumber,entryTransaction);

        let counter: number = 0;
        this.reorders.value = this.locationReorders.map((currentRecord: any) => {
            return {
                _id: String(counter++),
                product: currentRecord.product,
                localizedDescription1: currentRecord.localizedDescription1,
                upc: currentRecord.upc,
                quantityAndUnit: currentRecord.reorderQuantity + ' ' + currentRecord.reorderUnit,
                fromLocation: currentRecord.fromLocation,
                serialNumber: currentRecord.serialNumber,
            };
        });
    },
})
export class MobileLocationReorderTodo extends ui.Page<GraphApi> {
    private stockSite: string;
    private transaction: string;

    private locationReorders: LocationReorders[] = [];

    @ui.decorators.textField<MobileLocationReorderTodo>({
        isTransient: false,
        isReadOnly: true,
    })
    storageListNumber: ui.fields.Text;

    @ui.decorators.section<MobileLocationReorderTodo>({
        isTitleHidden: true,
        isHidden: false,
    })
    mainSection: ui.containers.Section;

    @ui.decorators.block<MobileLocationReorderTodo>({
        parent() {
            return this.mainSection;
        },
    })
    mainBlock: ui.containers.Block;

    @ui.decorators.tableField<MobileLocationReorderTodo>({
        parent() {
            return this.mainBlock;
        },
        isHelperTextHidden: true,
        canSelect: false,
        canFilter: false,
        canUserHideColumns: false,
        hasSearchBoxMobile: true,
        cardView: true,
        mobileCard: {
            title: ui.nestedFields.text({
                title: 'Product',
                bind: 'product',
                isReadOnly: true,
            }),
            titleRight: ui.nestedFields.text({
                title: 'Quantity and unit',
                bind: 'quantityAndUnit',
                isReadOnly: true,
            }),
            line2: ui.nestedFields.text({
                bind: 'localizedDescription1',
                isReadOnly: true,
            }),
            line2Right: ui.nestedFields.text({
                title: 'UPC code',
                bind: 'upc',
                isReadOnly: true,
            }),
            line3: ui.nestedFields.text({
                title: 'From location',
                bind: 'fromLocation',
                isReadOnly: true,
            }),
            line3Right: ui.nestedFields.text({
                title: 'Serial number',
                bind: 'serialNumber',
                isReadOnly: true,
            }),
        },
        columns: [
            ui.nestedFields.text({
                title: 'Product',
                bind: 'product',
                isReadOnly: true,
            }),
            ui.nestedFields.text({
                title: 'UPC code',
                bind: 'upc',
                isReadOnly: true,
            }),
            ui.nestedFields.text({
                title: 'Quantity and unit',
                bind: 'quantityAndUnit',
                prefix: 'Quantity and unit',
                isReadOnly: true,
            }),
            ui.nestedFields.text({
                title: 'From location',
                bind: 'fromLocation',
                prefix: 'From location:',
                isReadOnly: true,
            }),
            ui.nestedFields.text({
                title: 'Serial number',
                prefix: 'Serial number:',
                bind: 'serialNumber',
                isReadOnly: true,
            }),
        ],
        onRowClick(rowId: string, rowItem: any) {
            const rowIdNum: number = parseInt(rowId);
            this.$.router.goTo('@sage/x3-stock/MobileLocationReorderDetail', {
                entryTransaction: this.transaction,
                stockSite: this.stockSite,
                storageListNumber: this.storageListNumber.value,
                product: this.locationReorders[rowIdNum].product,
                toLocation: this.locationReorders[rowIdNum].toLocation,
                fromLocation: this.locationReorders[rowIdNum].fromLocation,
                source: this.locationReorders[rowIdNum].source,
                reorderQuantity: this.locationReorders[rowIdNum].reorderQuantity,
                reorderUnit: this.locationReorders[rowIdNum].reorderUnit,
                decimalPrecision: this.locationReorders[rowIdNum].decimalPrecision,
                lot: this.locationReorders[rowIdNum].lot,
                sublot: this.locationReorders[rowIdNum].sublot,
                serialNumber: this.locationReorders[rowIdNum].serialNumber,
                status: this.locationReorders[rowIdNum].status,
                documentLineNumber: this.locationReorders[rowIdNum].documentLine,
                stockId: this.locationReorders[rowIdNum].stockId,
                stockSequence: this.locationReorders[rowIdNum].stockSequence,
                identifier1: this.locationReorders[rowIdNum].identifier1,
                identifier2: this.locationReorders[rowIdNum].identifier2,
                licensePlateNumber: this.locationReorders[rowIdNum].licensePlateNumber,
                packingUnitToStockUnitConversionFactor:
                    this.locationReorders[rowIdNum].packingUnitToStockUnitConversionFactor,
                size: this.locationReorders.length,
            });
        },
    })
    reorders: ui.fields.Table;

    private async searchLocationReorders(
        stockSite: string,
        storageListNumber: string,
        transactionCode: string,
    ): Promise<LocationReorders[]> {
        const rawAllocationRecords = extractEdges(
        await this.$.graph
            .node('@sage/x3-stock/Allocation')
            .query(
                ui.queryUtils.edgesSelector(
                    {
                        stockSite: {
                            code : true,
                        },
                        product: {
                            code : true,
                            localizedDescription1: true,
                            serialNumberManagementMode: true,
                            upc: true,
                        },
                        stockId: true,
                        sequenceNumber: true,
                        allocationType: true,
                        documentType: true,
                        documentNumber: true,
                        documentLineNumber: true,
                        documentSequenceNumber: true,
                        quantityInStockUnit: true,
                        activeQuantityInStockUnit: true,
                        warehouse: true,
                        location: true,
                        lot: true,
                        sublot: true,
                        status: true,
                        serialNumber: true,
                        majorVersion: {
                            code: true,
                        },
                        consumptionLocation: true,
                        defaultWarehouse: true,
                        defaultLocation: true,
                        defaultLocationType: true,
                        storageQuantityInStockUnit: true,
                        storageListNumber: true,
                        storageListLineNumber: true,
                        pickingNumber: true,
                        requirementDate: true,
                        transactionDescription: true,
                        businessPartner: {
                            code: true,
                        },
                        deliveryAddress: {
                            shipToAddress: {
                                code: true,
                            }
                        },
                        stockLine: {
                            stockId: true,
                            location: {
                                code: true,
                            },
                            packingUnitToStockUnitConversionFactor: true,
                            packingUnit: {
                              code: true,
                              numberOfDecimals: true,
                            },
                           lot: true,
                           sublot: true,
                           serialNumber: true,
                           status: {
                            code: true,
                          },
                          identifier1: true,
                          identifier2: true,
                          licensePlateNumber: {
                            code: true,
                          },
                        },
                        reorderLine: {
                            query: {
                                edges: {
                                    node: {
                                        _id: true,
                                        destinationLocation: true,
                                    },
                                },
                            },
                         },
                    },
                    {
                        filter: {
                            stockSite: stockSite,
                            storageListNumber: storageListNumber,
                        },
                    },
                ),
            )
            .execute(),
        ) as ExtractEdges<Allocation>[];

        const allocationRecords = await rawAllocationRecords
        .sort((a, b) => ((a.storageListLineNumber) > (b.storageListLineNumber) ? 1 : -1));

        const map: Map<integer, any> = await this.getShortagesDetailed(allocationRecords);

        const locationReorder: LocationReorders[] = [];

        allocationRecords.forEach((element: any) => {
            if (element.reorderLine?.length) {
                // replenishment type

                // Get 'product' for replenishment reorder type
                const product = element.product?.code;
                const localizedDescription1 = element.product?.localizedDescription1;
                const upc = element.product?.upc;

                // Get 'toLocation'  for replenishment reorder type
                const toLocation = element.reorderLine[0]?.destinationLocation;
                const fromLocation = (element.stockLine?.location)
                    ? element.stockLine?.location?.code : '';

                // Get 'packingUnitToStockUnitConversionFactor' for replenishment reorder type
                let packingUnitToStockUnitConversionFactor = element.stockLine?.packingUnitToStockUnitConversionFactor;

                // Get 'reorderQuantity' for replenishment reorder type
                let reorderQuantity: string | undefined;
                if (packingUnitToStockUnitConversionFactor) {
                    reorderQuantity = (Number(element.quantityInStockUnit) / Number(packingUnitToStockUnitConversionFactor)).toString();
                } else {
                    reorderQuantity = element.quantityInStockUnit.toString();
                    packingUnitToStockUnitConversionFactor = '1';
                }

                // Get 'decimalPrecision' for replenishment reorder type
                const decimalPrecision = (element.stockLine?.packingUnit)
                    ? element.stockLine?.packingUnit?.numberOfDecimals?.toString()
                    : '0';

                // round 'reorderQuantity'
                reorderQuantity = this.round(Number(reorderQuantity), Number(decimalPrecision)).toString();

                // Get 'reorderUnit' for replenishment reorder type
                const reorderUnit = (element.stockLine?.packingUnit)
                    ? element.stockLine?.packingUnit?.code
                    : '';

                // Get 'lot' for replenishment reorder type
                const lot = (element.stockLine?.lot) ? element.stockLine?.lot?.toString() : '';

                // Get 'sublot' for replenishment reorder type
                const sublot = (element.stockLine?.sublot) ? element.stockLine?.sublot?.toString() : '';

                // Get 'serialNumber' for replenishment reorder type
                const serialNumber = this.getSerialNumber(element);

                // Get 'status' for replenishment reorder type
                const status = (element.stockLine)? element.stockLine?.status?.code : '';

                // Get 'documentLine' for replenishment reorder type
                const documentLine = element.documentLineNumber?.toString() || '';

                // Get 'stockId' for replenishment reorder type
                const stockId = element.stockId?.toString() || '';

                // Get 'stockSequence' for replenishment reorder type
                const stockSequence: string = element.sequenceNumber?.toString() || '';

                // Get 'identifier1' for replenishment reorder type
                const identifier1 = (element.stockLine) ? element.stockLine.identifier1?.toString() : '';

                // Get 'identifier2' for replenishment reorder type
                const identifier2 = (element.stockLine) ? element.stockLine.identifier2?.toString() : '';

                // Get 'licensePlateNumber' for replenishment reorder type
                const licensePlateNumber = (element.stockLine) ? element.stockLine.licensePlateNumber?.code?.toString() : '';

                if (reorderQuantity !== undefined && reorderUnit !== undefined) {
                    const locationReorderInstance: LocationReorders = {
                        product,
                        localizedDescription1,
                        upc,
                        toLocation,
                        fromLocation,
                        reorderQuantity,
                        reorderUnit,
                        decimalPrecision,
                        source: 'Replenishment',
                        lot,
                        sublot,
                        serialNumber,
                        status,
                        documentLine,
                        stockId,
                        stockSequence,
                        identifier1,
                        identifier2,
                        licensePlateNumber,
                        packingUnitToStockUnitConversionFactor: packingUnitToStockUnitConversionFactor.toString(),
                    };

                    locationReorder.push(locationReorderInstance);
                }

            } else if (element.consumptionLocation) {
                // consumption type

                // Get 'product' for consumptions reorder type
                const product = element.product?.code;
                const localizedDescription1 = element.product?.localizedDescription1;
                const upc = element.product?.upc;

                // Get 'toLocation' for consumptions reorder type
                const toLocation = element.consumptionLocation;

                // Get 'fromLocation' for consumptions reorder type
                const fromLocation = (element.stockLine?.location)
                    ? element.stockLine?.location?.code?.toString()
                    : '';

                // Get 'packingUnitToStockUnitConversionFactor' for consumptions reorder type
                let packingUnitToStockUnitConversionFactor = element.stockLine?.packingUnitToStockUnitConversionFactor;

                // Get 'reorderQuantity' for consumptions reorder type
                let reorderQuantity: string | undefined;
                if (packingUnitToStockUnitConversionFactor) {
                    reorderQuantity = (Number(element.quantityInStockUnit) / Number(packingUnitToStockUnitConversionFactor)).toString();
                } else {
                    reorderQuantity = element.quantityInStockUnit?.toString();
                    packingUnitToStockUnitConversionFactor = '1';
                }

                // Get 'decimalPrecision' for consumptions reorder type
                let decimalPrecision = (element.stockLine?.packingUnit)
                    ? element.stockLine?.packingUnit?.numberOfDecimals?.toString()
                    : '0';

                reorderQuantity = this.round(Number(reorderQuantity), Number(decimalPrecision)).toString();

                // Get 'reorderUnit' for consumptions reorder type
                const reorderUnit = (element.stockLine?.packingUnit) ? element.stockLine?.packingUnit?.code: '';

                // Get 'lot' for consumptions reorder type
                const lot = (element.stockLine)? element.stockLine?.lot?.toString() : '';

                // Get 'sublot' for consumptions reorder type
                const sublot = (element.stockLine) ? element.stockLine?.sublot?.toString() : '';

                // Get 'serialNumber' for consumptions reorder type
                const serialNumber = this.getSerialNumber(element);

                // Get 'status' for consumptions reorder type
                const status = (element.stockLine) ? element.stockLine?.status?.code?.toString() : '';

                // Get 'documentLine' for consumptions reorder type
                const documentLine = element.documentLineNumber?.toString();

                // Get 'stockId' for consumptions reorder type
                const stockId = element.stockId?.toString();

                // Get 'stockSequence' for consumptions reorder type
                const stockSequence = element.sequenceNumber?.toString();

                // Get 'identifier1' for consumptions reorder type
                const identifier1 = (element.stockLine) ? element.stockLine.identifier1?.toString() : '';

                // Get 'identifier2' for consumptions reorder type
                const identifier2 = (element.stockLine) ? element.stockLine.identifier2?.toString() : '';

                // Get 'licensePlateNumber' for consumptions reorder type
                const licensePlateNumber = (element.stockLine) ? element.stockLine.licensePlateNumber?.code?.toString() : '';

                if (reorderQuantity !== undefined && reorderUnit !== undefined) {
                    const locationReorderInstance: LocationReorders = {
                        product,
                        localizedDescription1,
                        upc,
                        toLocation,
                        fromLocation,
                        reorderQuantity,
                        reorderUnit,
                        decimalPrecision,
                        source: 'Consumption',
                        lot,
                        sublot,
                        serialNumber,
                        status,
                        documentLine,
                        stockId,
                        stockSequence,
                        identifier1,
                        identifier2,
                        licensePlateNumber,
                        packingUnitToStockUnitConversionFactor: packingUnitToStockUnitConversionFactor.toString(),
                    };
                    locationReorder.push(locationReorderInstance);
                }
            } else if (element.allocationType !== 'detailedShortage') {
                // shortage type
                // Get 'product' for shortage reorder type
                const product = element.product?.code;
                const localizedDescription1 = element.product?.localizedDescription1;
                const upc = element.product?.upc;

                // Get 'documentLine' for shortage reorder type
                const documentLine = element.documentLineNumber?.toString();

                // Get 'stockSequence' for shortage reorder type
                const stockSequence = element.sequenceNumber?.toString();

                // The following variables will be retrieved depending on whether the allocation type is 'shortagesDetailed' or 'detailed'
                const toLocation = map.get(element.storageListLineNumber)?.location;
                // inside location.code property of 'shortages detailed' allocation type record
                const fromLocation = (element.stockLine?.location)
                    ? element.stockLine?.location?.code?.toString()
                    : ''; // inside stock line property of 'detailed' allocation type record
                let packingUnitToStockUnitConversionFactor: number;
                let reorderQuantity: string; // inside stock line property of 'detailed' allocation type record
                const reorderUnit = element.stockLine?.packingUnit?.code;
                // inside stock line property of 'detailed' allocation type record
                let decimalPrecision: string;
                let lot: string; // inside stock line property of 'detailed' allocation type record
                let sublot: string; // inside stock line property of 'detailed' allocation type record
                let serialNumber: string; // inside stock line property of 'detailed' allocation type record
                let status: string; // inside stock line property of 'detailed' allocation type record
                let stockId: string;
                let identifier1: string;
                let identifier2: string;
                let licensePlateNumber: string;

                packingUnitToStockUnitConversionFactor = Number(element.stockLine?.packingUnitToStockUnitConversionFactor);
                if (packingUnitToStockUnitConversionFactor !== undefined) {
                    reorderQuantity = (Number(element.quantityInStockUnit) / Number(packingUnitToStockUnitConversionFactor)).toString();
                } else {
                    reorderQuantity = element.quantityInStockUnit?.toString();
                    packingUnitToStockUnitConversionFactor = 1;
                }
                decimalPrecision = (element.stockLine) ? element.stockLine.packingUnit?.numberOfDecimals?.toString() : '0';
                reorderQuantity = this.round(Number(reorderQuantity), Number(decimalPrecision)).toString();
                lot = (element.stockLine) ? element.stockLine.lot?.toString() : '';
                sublot = (element.stockLine) ? element.stockLine.sublot?.toString() : '';

                if (element.product?.serialNumberManagementMode === 'receivedIssued') {
                    serialNumber = (element.stockLine) ? element.stockLine.serialNumber?.toString() : '';
                } else if (element.product?.serialNumberManagementMode === 'globalReceivedIssued') {
                    serialNumber = element.serialNumber;
                }
                status = (element.stockLine) ? element.stockLine.status?.code?.toString() : '';
                stockId = (element.stockLine) ? element.stockLine.stockId?.toString() : '';
                identifier1 = (element.stockLine) ? element.stockLine.identifier1?.toString() : '';
                identifier2 = (element.stockLine) ? element.stockLine.identifier2?.toString() : '';
                licensePlateNumber = (element.stockLine) ? element.stockLine.licensePlateNumber?.code?.toString() : '';

                if (reorderQuantity !== undefined && reorderUnit !== undefined) {
                    const locationReorderInstance: LocationReorders = {
                        product,
                        localizedDescription1,
                        upc,
                        toLocation,
                        fromLocation,
                        reorderQuantity,
                        reorderUnit,
                        decimalPrecision,
                        source: 'Shortage',
                        lot,
                        sublot,
                        serialNumber,
                        status,
                        documentLine,
                        stockId,
                        stockSequence,
                        identifier1,
                        identifier2,
                        licensePlateNumber,
                        packingUnitToStockUnitConversionFactor: packingUnitToStockUnitConversionFactor.toString(),
                    };
                    locationReorder.push(locationReorderInstance);
                }
            }
        });

        const stockEntryTransaction = extractEdges(
            await this.$.graph
                .node('@sage/x3-stock/StockEntryTransaction')
                .query(
                    ui.queryUtils.edgesSelector(
                        {
                            _id: true,
                            code: true,
                            isLocationReplenishable: true,
                            isConsumptionArea: true,
                            isShortages: true,
                        },
                        {
                            filter: {
                                code: transactionCode,
                                transactionType: 'reorderPlan',
                            },
                        },
                    ),
                )
                .execute(),
        ) as ExtractEdges<StockEntryTransaction>[];
        // filter locationReorders
        if (!(await stockEntryTransaction[0].isLocationReplenishable)) {
            // If the transaction is not replenishable, pop out replenishment records
            for (let i = 0; i < locationReorder.length; i += 1) {
                if (locationReorder[i] !== undefined) {
                    if (locationReorder[i].source === 'Replenishment') {
                        delete locationReorder[i];
                    }
                }
            }
        }

        if (!(await stockEntryTransaction[0].isConsumptionArea)) {
            // If the transaction is not consumptions, pop out consumption records
            for (let i = 0; i < locationReorder.length; i += 1) {
                if (locationReorder[i] !== undefined) {
                    if (locationReorder[i].source === 'Consumption') {
                        delete locationReorder[i];
                    }
                }
            }
        }
        if (!(await stockEntryTransaction[0].isShortages)) {
            // If the transaction is not shortages, pop out shortages records
            for (let i = 0; i < locationReorder.length; i += 1) {
                if (locationReorder[i] !== undefined) {
                    if (locationReorder[i].source === 'Shortage') {
                        delete locationReorder[i];
                    }
                }
            }
        }
        locationReorder.sort((a, b) => {
            // Sort by product first
            if (a.product > b.product) return 1;
            if (a.product < b.product) return -1;
            // If product is the same, sort by serial number
            if (a.serialNumber > b.serialNumber) return 1;
            if (a.serialNumber < b.serialNumber) return -1;
            return 0;
        });
        return locationReorder;
    }

    private round(reorderQuantity: number, decimalPrecision: number): number {
        const factorOfTen: number = 10 ** decimalPrecision;
        return Math.round(reorderQuantity * factorOfTen) / factorOfTen;
    }

    private async getShortagesDetailed(allocationRecords: any[]): Promise<Map<integer, any>> {
        const map = new Map<integer, any>();
        for (let i = 0; i < allocationRecords.length; i += 1) {
            if ((await allocationRecords[i].allocationType) === 'detailedShortage') {
                map.set(await allocationRecords[i].storageListLineNumber, allocationRecords[i]);
            }
        }
        return map;
    }

    private getSerialNumber(element:any): string {
        if (element.product?.serialNumberManagementMode === 'receivedIssued') {
          return (element.stockLine)? element.stockLine?.serialNumber?.toString(): '';
        }
        return (element.product?.serialNumberManagementMode === 'globalReceivedIssued') ? element.serialNumber : '';
    }

}
