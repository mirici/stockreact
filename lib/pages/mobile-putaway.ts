import { dialogMessage } from '@sage/x3-master-data/lib/client-functions/dialogs';
import { getSelectedStockSite } from '@sage/x3-master-data/lib/client-functions/get-selected-stock-site';
import { GraphApi, StockEntryTransaction, Storage } from '@sage/x3-stock-api';
import { receipt } from '@sage/x3-stock-data/build/lib/menu-items/receipt';
import {
    AggregateGroupSelector,
    AggregateResultValues,
    AggregateValuesSelector,
    OnlySelected,
    WithoutEdges,
    aggregateEdgesSelector,
    withoutEdges,
} from '@sage/xtrem-client';
import * as ui from '@sage/xtrem-ui';
import { validatePage } from '../client-functions/control';

type AggregatedStorage = WithoutEdges<{
    group: OnlySelected<Storage, AggregateGroupSelector<Storage>>;
    values: OnlySelected<AggregateResultValues<Storage>, AggregateValuesSelector<Storage>>;
}>;

@ui.decorators.page<MobilePutaway>({
    title: 'Putaway',
    menuItem: receipt,
    priority: 200,
    isTitleHidden: true,
    isTransient: true,
    mode: 'default',
    authorizationCode: 'CWSSSL',
    access: { node: '@sage/x3-stock/StorageDetails' },
    skipDirtyCheck: true,
    //node: '@sage/xtrem-x3-inventory/Storage', // TODO Issue: Make this page transient for now until there is such a component that can aggregate storageListNumber + be scannable
    async onLoad() {
        await this._initializePage();
    },
})
export class MobilePutaway extends ui.Page<GraphApi> {
    //private _stockTransactionMap: Map<string, StockTransaction>; // improve performance by storing all information during the 1st time StockTransaction is queried

    @ui.decorators.section<MobilePutaway>({
        isTitleHidden: true,
    })
    mainSection: ui.containers.Section;

    @ui.decorators.block<MobilePutaway>({
        parent() {
            return this.mainSection;
        },
    })
    mainBlock: ui.containers.Block;

    @ui.decorators.dropdownListField<MobilePutaway>({
        parent() {
            return this.mainBlock;
        },
        title: 'Transaction',
        isMandatory: true,
        isTransient: true,
        onChange() {
            if (this.transaction.value) this.storageList.focus();
        },
    })
    transaction: ui.fields.DropdownList;

    @ui.decorators.labelField<MobilePutaway>({
        parent() {
            return this.mainBlock;
        },
        title: 'Site',
        isTransient: true,
    })
    site: ui.fields.Label;

    @ui.decorators.selectField<MobilePutaway>({
        parent() {
            return this.mainBlock;
        },
        title: 'Storage list',
        placeholder: 'Scan or select...',
        isMandatory: true,
        isTransient: true,
        isFullWidth: true,
        async onChange() {
            if (!this.storageList.value) return;

            await this._tryToRoute();
        },
    })
    storageList: ui.fields.Select;

    private async _initializePage(): Promise<void> {
        // Disable the page if user profile's site is blank or there are no applicable putAway transactions
        await this._initSite();
        if (!this.site.value) {
            this._disablePage();
            return;
        }
        const data = await this._fetchPutawayData();
        const stockTransactions = withoutEdges(data.queryStockTransaction) as StockEntryTransaction[];
        if (!stockTransactions || stockTransactions.length === 0) {
            this._disablePage();
            return;
        }

        //this._stockTransactionMap = new Map<string, StockTransaction>();
        this.transaction.options = stockTransactions.map<string>((stockTransaction: StockEntryTransaction) => {
            //this._stockTransactionMap.set(stockTransaction.code, stockTransaction);
            return stockTransaction.code;
        });
        this.transaction.value = this.transaction.options[0];
        this.transaction.isHidden = this.transaction.options.length === 1; // read only if only 1 stock transaction exists

        this.storageList.options = withoutEdges(data.aggregateStorage).map<string>(
            (storage: AggregatedStorage) => storage.group.storageListNumber,
        );
        this.transaction.isHidden ? this.storageList.focus() : this.transaction.focus();
    }

    private async _initSite(): Promise<void> {
        this.site.value = await getSelectedStockSite(
            this,
            ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
            ui.localize(
                '@sage/x3-stock/dialog-error-location-inquiry-set-site',
                'Define a default stock site on the user function profile.',
            ),
        );
    }

    private async _fetchPutawayData() {
        return await new ui.queryUtils.BatchRequest({
            queryStockTransaction: this.$.graph.node('@sage/x3-stock/StockEntryTransaction').query(
                ui.queryUtils.edgesSelector(
                    {
                        _id: true,
                        code: true,
                    },
                    {
                        filter: {
                            transactionType: 'putawayPlan',
                            isActive: true,
                            isLotPotencyAllowed: false,
                            isLotExpirationDateAllowed: false,
                            isLotCustomField1Allowed: false,
                            isLotCustomField2Allowed: false,
                            isLotCustomField3Allowed: false,
                            isLotCustomField4Allowed: false,
                            stockChangeAccessMode: { _ne: 'containerNumber' }, // cannot equal Container number
                        },
                    },
                ),
            ),
            aggregateStorage: this.$.graph.node('@sage/x3-stock/Storage').aggregate.query(
                aggregateEdgesSelector<Storage, AggregateGroupSelector<Storage>, AggregateValuesSelector<Storage>>(
                    {
                        group: {
                            storageListNumber: {
                                _by: 'value',
                            },
                        },
                        // TODO Issue: Specifying values should not be required
                        values: {
                            storageListNumber: { distinctCount: true },
                        },
                    },
                    {
                        filter: {
                            storageSite: { code: this.site.value },
                            originOfPutaway: 'awaitingPutAway',
                            storageListNumber: { _ne: null },
                        },
                        first: 500,
                    },
                ),
            ),
        }).execute();
    }

    private async _disablePage(errorMsg: string = '') {
        if (errorMsg) {
            await dialogMessage(this, 'error', ui.localize('@sage/x3-stock/dialog-error-title', 'Error'), errorMsg);
        }
        this.transaction.isDisabled = true;
        this.storageList.isDisabled = true;
    }

    private async _tryToRoute() {
        if (!(await validatePage(this))) return;

        this.$.setPageClean();
        this.$.router.goTo('@sage/x3-stock/MobilePutawayTodo', {
            site: this.site.value,
            storageListNumber: this.storageList.value,
            stockTransaction: this.transaction.value,
            //stockTransaction: JSON.stringify(this._stockTransactionMap.get(this.transaction.value)),
        });
    }
}
