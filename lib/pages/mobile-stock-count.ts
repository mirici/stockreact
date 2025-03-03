import { getSelectedStockSite } from '@sage/x3-master-data/lib/client-functions/get-selected-stock-site';
import { GraphApi, StockCountList, StockCountListDetail, StockCountSession } from '@sage/x3-stock-api';
import { stockControl } from '@sage/x3-stock-data/build/lib/menu-items/stock-control';
import { ExtractEdges, ExtractEdgesPartial, Filter, extractEdges } from '@sage/xtrem-client';
import * as ui from '@sage/xtrem-ui';
import { renumberStockCountList } from '../client-functions/control';

@ui.decorators.page<MobileStockCount>({
    isTitleHidden: true,
    title: 'Stock count',
    menuItem: stockControl,
    priority: 700,
    isTransient: true,
    authorizationCode: 'CWSACC',
    access: { node: '@sage/x3-stock/StockCountList' },
    skipDirtyCheck: true,
    async onLoad() {
        await this._initializePage();
    },
})
export class MobileStockCount extends ui.Page<GraphApi> {
    private async _initializePage(): Promise<void> {
        await this._initializeSite();
        //Only initialize the rest of the page if the siteField is defined
        if (this.siteField.value) {
            this.excludeCountedLines.value = true;
            this.multiCountLabel.value = ui.localize('@sage/x3-stock/multiple-counts-label', 'Multiple counts');
            this.stockCountSession.focus();
        } else {
            this._disablePage();
        }
    }

    private _disablePage(): void {
        this.excludeCountedLines.isDisabled = true;
        this.stockCountSession.isDisabled = true;
        this.stockCountSessionList.isDisabled = true;
    }

    private async _initializeSite(): Promise<void> {
        await this._initSite();

        // If coming back to this page from the detail page, renumber the stock count list
        if (
            this.siteField.value &&
            this.$.storage.get('mobile-selected-session') &&
            this.$.storage.get('mobile-selected-list')
        ) {
            await renumberStockCountList(
                this.$.storage.get('mobile-selected-session') as string,
                this.$.storage.get('mobile-selected-list') as string,
                this,
            );
        }
    }

    private async _initSite(): Promise<void> {
        this.siteField.value = await getSelectedStockSite(
            this,
            ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
            ui.localize(
                '@sage/x3-stock/dialog-error-location-inquiry-set-site',
                'Define a default stock site on the user function profile.',
            ),
        );
    }

    private async _searchStockCountSessionWorksheets(
        stockCountSession: string,
    ): Promise<ExtractEdges<StockCountList>[]> {
        return extractEdges(
            await this.$.graph
                .node('@sage/x3-stock/StockCountList')
                .query(
                    ui.queryUtils.edgesSelector<StockCountList>(
                        {
                            _id: true,
                            stockCountSessionNumber: true,
                            stockCountListNumber: true,
                            numberOfLines: true,
                            stockCountListStatus: true,
                            isStockCountLocked: true,
                        },
                        {
                            filter: {
                                stockCountSessionNumber: stockCountSession,
                                stockCountListStatus: {
                                    _in: ['toBeCounted', 'cancelled', 'counted', 'partialValidation', 'validated'],
                                },
                            },
                        },
                    ),
                )
                .execute(),
        ) as ExtractEdges<StockCountList>[];
    }

    @ui.decorators.textField<MobileStockCount>({
        isHidden: true,
    })
    siteField: ui.fields.Text;

    @ui.decorators.section<MobileStockCount>({
        isTitleHidden: true,
    })
    mainSection: ui.containers.Section;

    @ui.decorators.block<MobileStockCount>({
        parent() {
            return this.mainSection;
        },
    })
    mainBlock: ui.containers.Block;

    @ui.decorators.separatorField<MobileStockCount>({
        parent() {
            return this.mainBlock;
        },
        isInvisible: true,
    })
    separatorField: ui.fields.Separator;

    @ui.decorators.checkboxField<MobileStockCount>({
        parent() {
            return this.mainBlock;
        },
        title: 'Exclude counted lines',
        isFullWidth: true,
    })
    excludeCountedLines: ui.fields.Checkbox;

    @ui.decorators.referenceField<MobileStockCount, StockCountSession>({
        parent() {
            return this.mainBlock;
        },
        title: 'Stock count session',
        placeholder: 'Scan or select...',
        node: '@sage/x3-stock/StockCountSession',
        valueField: 'stockCountSession',
        isMandatory: true,
        canFilter: false,
        isAutoSelectEnabled: true,
        isFullWidth: true,
        filter() {
            return {
                stockSite: {
                    code: this.siteField.value,
                },
                stockCountSessionStatus: 'toBeCounted',
            };
        },
        async onChange() {
            if (this.stockCountSession.value) {
                this.multiCountLabel.isHidden = !this.stockCountSession.value.isMultipleCount;
                await this._processSelectedStockCountSession(this.stockCountSession.value);
            } else {
                this.multiCountLabel.isHidden = true;
                this.stockCountSessionList.isDisabled = this.stockCountSessionList.isReadOnly = true;
                this.stockCountSessionList.value = null;
                await this.$.commitValueAndPropertyChanges();
            }
        },
        columns: [
            ui.nestedFields.text({
                bind: 'stockCountSession',
                title: 'Stock Count Session Number',
                isReadOnly: true,
            }),
            ui.nestedFields.text({
                bind: 'stockCountSessionStatus',
                title: 'Stock Count Session Status',
                isReadOnly: true,
            }),
            ui.nestedFields.text({
                bind: 'stockCountSessionDescription',
                title: 'Stock Count Session Description',
                isReadOnly: true,
            }),
            ui.nestedFields.checkbox({
                bind: 'isMultipleCount',
                isHidden: true,
            }),
        ],
    })
    stockCountSession: ui.fields.Reference<StockCountSession>;

    @ui.decorators.referenceField<MobileStockCount, StockCountList>({
        parent() {
            return this.mainBlock;
        },
        title: 'Stock count session list',
        placeholder: 'Scan or select...',
        node: '@sage/x3-stock/StockCountList',
        valueField: 'stockCountListNumber',
        isMandatory: true,
        canFilter: false,
        isReadOnly: true,
        isAutoSelectEnabled: true,
        isFullWidth: true,
        filter() {
            return {
                stockCountSessionNumber: this.stockCountSession.value?.stockCountSession,
                stockCountListStatus: {
                    _in: ['toBeCounted', 'cancelled', 'counted', 'partialValidation', 'validated'],
                },
            };
        },
        async onChange() {
            if (this.stockCountSessionList.value) {
                await this._processSelectedStockCountList(this.stockCountSessionList.value);
            }
        },
        columns: [
            ui.nestedFields.text({
                bind: 'stockCountListNumber',
                title: 'Stock Count List Number',
                isReadOnly: true,
            }),
            ui.nestedFields.text({
                bind: 'stockCountListStatus',
                title: 'Stock Count List Status',
                isReadOnly: true,
            }),
            ui.nestedFields.text({
                bind: 'stockCountListDescription',
                title: 'Stock Count Session Worksheet Description',
            }),
            ui.nestedFields.text({
                bind: 'numberOfLines',
                title: 'Number of Lines to be Counted',
                isReadOnly: true,
            }),
        ],
    })
    stockCountSessionList: ui.fields.Reference<StockCountList>;

    @ui.decorators.textField<MobileStockCount>({
        parent() {
            return this.mainBlock;
        },
        isHidden: true,
        isDisabled: true,
    })
    multiCountLabel: ui.fields.Text;

    private async _processSelectedStockCountSession(value: ExtractEdgesPartial<StockCountSession>) {
        let worksheets: ExtractEdgesPartial<StockCountList>[] = await this._searchStockCountSessionWorksheets(
            value.stockCountSession,
        );
        if (worksheets.length === 1) {
            this.stockCountSessionList.isDisabled = this.stockCountSessionList.isReadOnly = true;
            this.stockCountSessionList.value = worksheets[0];
            await this._processSelectedStockCountList(worksheets[0]);
        } else {
            this.stockCountSessionList.isDisabled = this.stockCountSessionList.isReadOnly = false;
            this.stockCountSessionList.focus();
            this.stockCountSessionList.value = null;
        }
    }

    private async _processSelectedStockCountList(value: ExtractEdgesPartial<StockCountList>): Promise<boolean | never> {
        await renumberStockCountList(value.stockCountSessionNumber, value.stockCountListNumber, this);
        this.$.storage.set('mobile-selected-session', value.stockCountSessionNumber);
        this.$.storage.set('mobile-selected-list', value.stockCountListNumber);

        const firstAvailableCountRecord: ExtractEdgesPartial<StockCountListDetail> =
            (await this._getFirstAvailableCountRecord(
                this,
                value.stockCountSessionNumber,
                value.stockCountListNumber,
                this.excludeCountedLines.value ?? true,
            )) as ExtractEdgesPartial<StockCountListDetail>;

        if (!firstAvailableCountRecord) {
            this.$.showToast(
                ui.localize(
                    '@sage/x3-stock/notification-selected-stock-session-already-fully-counted',
                    'The selected Stock count session list is already fully counted',
                ),
                {
                    type: 'warning',
                },
            );
            return false;
        }

        this.$.setPageClean();
        this.$.router.goTo('@sage/x3-stock/MobileStockCountDetail', {
            _id: firstAvailableCountRecord._id,
            stockCountListDetail: JSON.stringify(firstAvailableCountRecord),
            excludeCountedLines: (this.excludeCountedLines.value ?? true).toString(),
        });
        return true;
    }

    /** @internal */
    private async _getFirstAvailableCountRecord(
        pageInstance: ui.Page,
        stockCountSessionNumber: string,
        stockCountListNumber: string,
        excludeCountedLines: boolean = true,
    ): Promise<ExtractEdgesPartial<StockCountListDetail> | undefined> {
        const stockCountListDetailFilter: Filter<StockCountListDetail> = {
            stockCountSessionNumber: stockCountSessionNumber,
            stockCountList: { stockCountListNumber: stockCountListNumber },
            stockCountListStatus: {
                _in: ['toBeCounted', 'counted'],
            },
        };
        let result = undefined;

        if (excludeCountedLines) {
            stockCountListDetailFilter._and = [
                {
                    _or: [
                        {
                            countedStockInPackingUnit: '0',
                            isZeroStock: false,
                        },
                        {
                            stockCountSession: { isMultipleCount: true },
                            countedStockInPackingUnit1: '0',
                            isZeroStock1: false,
                        },
                        {
                            stockCountSession: { isMultipleCount: true },
                            countedStockInPackingUnit2: '0',
                            isZeroStock2: false,
                        },
                    ],
                },
            ];
        }

        // retrieve all detail records given the count session list (optionally exclude fully counted records)
        const stockCountListDetailRecords: ExtractEdgesPartial<StockCountListDetail>[] = extractEdges(
            (await pageInstance.$.graph
                .node('@sage/x3-stock/StockCountListDetail')
                .query(
                    ui.queryUtils.edgesSelector<StockCountListDetail>(
                        {
                            _id: true,
                            stockCountSessionNumber: true,
                            stockCountSession: { isMultipleCount: true },
                            stockCountList: { stockCountListNumber: true },
                            countedStockInPackingUnit: true,
                            countedStockInPackingUnit1: true,
                            countedStockInPackingUnit2: true,
                            isZeroStock: true,
                            isZeroStock1: true,
                            isZeroStock2: true,
                        },
                        {
                            filter: stockCountListDetailFilter,
                            orderBy: {
                                // most importantly, order the detail records by productRankNumber
                                productRankNumber: +1,
                            },
                        },
                    ),
                )
                .execute()) ?? [],
        );

        // if every record has already been counted & verified(?)
        if (stockCountListDetailRecords.length !== 0) {
            if (stockCountListDetailRecords[0].stockCountSession.isMultipleCount) {
                // NOTE: If a 'multi count' worksheet is not on the final count, any fully counted lines will be omitted despite whether excludeCountedLines is set to false or not

                // if any record has countedStockInPackingUnit1 = 0 and isZeroStock1 = false, then this stock count list worksheet is currently on count #1
                result = stockCountListDetailRecords.find(
                    _ => Number(_.countedStockInPackingUnit1) === 0 && !_.isZeroStock1,
                ); // iterate for any record has not been counted for the first time

                if (!result) {
                    result = stockCountListDetailRecords.find(
                        _ => Number(_.countedStockInPackingUnit2) === 0 && !_.isZeroStock2,
                    ); // iterate for any record has not been counted for the second time
                }
            }

            return result ?? stockCountListDetailRecords[0];
        }

        return undefined;
    }
}
