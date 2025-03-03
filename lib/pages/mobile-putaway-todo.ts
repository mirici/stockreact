import { extractEdges, ExtractEdges } from '@sage/xtrem-client';
import { Decimal } from '@sage/xtrem-decimal';
import * as ui from '@sage/xtrem-ui';
import { GraphApi, Storage, StorageDetails } from '@sage/x3-stock-api';

@ui.decorators.page<MobilePutawayTodo>({
    title: 'Putaway',
    subtitle: 'Select a product',
    isTitleHidden: true,
    isTransient: true,
    mode: 'default',
    skipDirtyCheck: true,
    async onLoad() {
        if (
            !this.$.queryParameters.site ||
            !this.$.queryParameters.storageListNumber ||
            !this.$.queryParameters.stockTransaction
        ) {
            this.$.showToast(
                ui.localize('@sage/x3-stock/notification-error-missing-params', 'Missing required parameters'),
                { type: 'error' },
            );
            this.$.router.goTo('@sage/x3-stock/MobilePutaway');
            return;
        }

        this._stockTransaction = this.$.queryParameters.stockTransaction as string;
        this._storageListNumber.value = this.$.queryParameters.storageListNumber as string;
        this.lines.value = extractEdges(
            await this.$.graph
                .node('@sage/x3-stock/StorageDetails')
                .query(
                    ui.queryUtils.edgesSelector<StorageDetails>(
                        {
                            _id: true,
                            stockId: true,
                            documentType: true,
                            documentNumber: true,
                            documentLineNumber: true,
                            storageSequenceNumber: true,
                            packingUnit: {
                                code: true,
                                numberOfDecimals: true,
                            },
                            quantityInPackingUnit: true,
                            packingUnitToStockUnitConversionFactor: true,
                            status: {
                                code: true,
                                description: true,
                                shortDescription: true,
                                localizedShortDescription: true,
                            },
                            location: {
                                code: true, // to location
                                type: true,
                            },
                            lot: true,
                            sublot: true,
                            startingSerialNumber: true,
                            endingSerialNumber: true,
                            licensePlateNumber: {
                                code: true,
                                status: true,
                                location: {
                                    code: true,
                                },
                                container: {
                                    code: true,
                                },
                            },
                            storage: {
                                product: {
                                    code: true,
                                    localizedDescription1: true,
                                    lotManagementMode: true, // whether sub/lot should be displayed
                                    lotSequenceNumber: true, // whether lot should be optional
                                    serialNumberManagementMode: true, // whether serial should be displayed
                                    serialSequenceNumber: true, // whether serial should be optional
                                    productSites: {
                                        query: {
                                            edges: {
                                                node: {
                                                    isLicensePlateNumberManaged: true, // whether LPN & Container should be displayed
                                                },
                                            },
                                            __args: {
                                                filter: JSON.stringify({
                                                    stockSite: {
                                                        code: this.$.queryParameters.site,
                                                    },
                                                }),
                                            },
                                        },
                                    },
                                    upc: true,
                                },
                                status: {
                                    code: true,
                                },
                                location: {
                                    code: true, // from location
                                },
                            },
                        },
                        {
                            filter: {
                                storageListNumber: this.$.queryParameters.storageListNumber as string,
                                storageSite: {
                                    code: this.$.queryParameters.site as string,
                                },
                            },
                        },
                    ),
                )
                .execute(),
        ).reduce<ExtractEdges<StorageDetails>[]>(
            (previousValue: ExtractEdges<StorageDetails>[], currentValue: ExtractEdges<StorageDetails>) => {
                if (
                    currentValue.storage.product.serialNumberManagementMode !== 'receivedIssued' ||
                    !currentValue.startingSerialNumber ||
                    !currentValue.endingSerialNumber ||
                    Number(currentValue.quantityInPackingUnit) <= 1
                ) {
                    previousValue.push({
                        ...currentValue,
                        // to format quantityInPackingUnit based on unit of measure's number of decimals
                        quantityInPackingUnitFormatted:
                            currentValue.packingUnit.numberOfDecimals === 0
                                ? currentValue.quantityInPackingUnit
                                : Decimal.make(currentValue.quantityInPackingUnit)
                                      .toDecimalPlaces(currentValue.packingUnit.numberOfDecimals)
                                      .toString(),
                        _id: `${currentValue.storage.product.code}!${currentValue.storage.product.localizedDescription1}!${currentValue.storage.product.upc}!${currentValue.storage.location.code}!${currentValue.packingUnit.code}!${currentValue.startingSerialNumber}!${currentValue._id}`,
                    } as any); // TODO Issue: Have to use 'any' to allow custom formatting
                } else {
                    const totalQuantity = Number(currentValue.quantityInPackingUnit);
                    let index = 0;
                    let currSerialNumber: string = currentValue.startingSerialNumber;

                    do {
                        // TODO Issue: Have to use 'any' to allow custom formatting
                        const shallowCopy: any = { ...currentValue }; // Only need to modify quantity, starting, & ending serial number, while the rest should be the same. So a 'spread' copy should suffice + the user can only update one line at a time
                        shallowCopy._id = this.lines.generateRecordId();
                        shallowCopy.quantityInPackingUnit = String(1);
                        shallowCopy.quantityInPackingUnitFormatted = String(1);
                        shallowCopy.startingSerialNumber = shallowCopy.endingSerialNumber = currSerialNumber;

                        previousValue.push(shallowCopy);
                    } while (
                        ++index < totalQuantity &&
                        (currSerialNumber = currSerialNumber.replace(/\d+$/, match => {
                            return (Number(match) + 1).toString().padStart(match.length, '0');
                        }))
                    );
                }
                return previousValue;
            },
            [],
        );

        // To handle some extreme, but rare scenarios of being routed to this page, yet at this time there are no more lines to process for this storage list #
        if (this.lines.value.length === 0) {
            this.$.showToast(
                ui.localize(
                    '@sage/x3-stock/notification-warning-no-storage-lines',
                    'No more lines to process for {{code}} ',
                    { code: this._storageListNumber.value },
                ),
                { type: 'warning', timeout: 30000 },
            );
            this.$.router.goTo('@sage/x3-stock/MobilePutaway');
        }
    },
    headerCard() {
        return {
            title: this._storageListNumber,
        };
    },
})
export class MobilePutawayTodo extends ui.Page<GraphApi> {
    private _stockTransaction: string;

    @ui.decorators.textField<MobilePutawayTodo>({
        isTransient: true,
        isHidden: false,
    })
    _storageListNumber: ui.fields.Text;

    @ui.decorators.section<MobilePutawayTodo>({
        isTitleHidden: true,
    })
    mainSection: ui.containers.Section;

    @ui.decorators.block<MobilePutawayTodo>({
        parent() {
            return this.mainSection;
        },
    })
    mainBlock: ui.containers.Block;

    @ui.decorators.tableField<MobilePutawayTodo>({
        parent() {
            return this.mainBlock;
        },
        node: '@sage/x3-stock/StorageDetails',
        isTransient: true,
        isFullWidth: true,
        isTitleHidden: false,
        canFilter: false,
        canSelect: false,
        canExport: false,
        canUserHideColumns: false,
        hasSearchBoxMobile: true,
        orderBy: {
            // this needed because additional rows may be created in a transient matter for product that is receivedIssued serial managed
            stockId: +1,
            documentType: +1,
            documentNumber: +1,
            documentLineNumber: +1,
            storageSequenceNumber: +1,
            startingSerialNumber: +1,
        },
        onRowClick(rowId: string, rowItem: ExtractEdges<StorageDetails>) {
            this.$.storage.set(
                this.$.page.id,
                JSON.stringify({
                    ...rowItem,
                    storageListNumber: this.$.queryParameters.storageListNumber,
                    storageSite: {
                        code: this.$.queryParameters.site,
                    },
                }),
            );
            this.$.router.goTo('@sage/x3-stock/MobilePutawayDetail', {
                stockTransaction: this._stockTransaction,
                totalCount: this.lines.value.length,
            });
        },
        columns: [
            ui.nestedFields.reference<MobilePutawayTodo, StorageDetails, Storage>({
                bind: 'storage',
                valueField: { product: { code: true } },
                node: '@sage/x3-stock/Storage',
            }),
            ui.nestedFields.reference<MobilePutawayTodo, StorageDetails, Storage>({
                bind: 'storage',
                valueField: { product: { upc: true } },
                node: '@sage/x3-stock/Storage',
            }),
            ui.nestedFields.text({
                bind: 'quantityInPackingUnitFormatted',
                postfix(v, rowValue) {
                    return rowValue.packingUnit.code;
                },
            }),
            ui.nestedFields.reference<MobilePutawayTodo, StorageDetails, Storage>({
                bind: 'storage',
                valueField: { location: { code: true } },
                node: '@sage/x3-stock/Storage',
            }),
            ui.nestedFields.text<MobilePutawayTodo, StorageDetails>({
                bind: 'startingSerialNumber',
                isReadOnly: true,
            }),
            ui.nestedFields.text({
                bind: '_id',
            }),
        ],
        cardView: true,
        mobileCard: {
            title: ui.nestedFields.reference<MobilePutawayTodo, StorageDetails, Storage>({
                bind: 'storage',
                valueField: { product: { code: true } },
                node: '@sage/x3-stock/Storage',
            }),
            titleRight: ui.nestedFields.text({
                bind: 'quantityInPackingUnitFormatted',
                postfix(v, rowValue) {
                    return rowValue.packingUnit.code;
                },
            }),
            line2: ui.nestedFields.reference<MobilePutawayTodo, StorageDetails, Storage>({
                bind: 'storage',
                valueField: { product: { localizedDescription1: true } },
                node: '@sage/x3-stock/Storage',
            }),
            line2Right: ui.nestedFields.reference<MobilePutawayTodo, StorageDetails, Storage>({
                bind: 'storage',
                valueField: { product: { upc: true } },
                node: '@sage/x3-stock/Storage',
            }),
            line3: ui.nestedFields.reference<MobilePutawayTodo, StorageDetails, Storage>({
                bind: 'storage',
                valueField: { location: { code: true } },
                node: '@sage/x3-stock/Storage',
            }),
            line3Right: ui.nestedFields.text<MobilePutawayTodo, StorageDetails>({
                bind: 'startingSerialNumber',
                isReadOnly: true,
                isHidden(value) {
                    return !value;
                },
            }),
        },
    })
    lines: ui.fields.Table<StorageDetails>;
}
