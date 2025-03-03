import { getSelectedStockSite } from '@sage/x3-master-data/lib/client-functions/get-selected-stock-site';
import { Allocation, GraphApi, StockReorder } from '@sage/x3-stock-api';
import { stockControl } from '@sage/x3-stock-data/build/lib/menu-items/stock-control';
import { AggregateGroupSelector, AggregateValuesSelector, aggregateEdgesSelector } from '@sage/xtrem-client';
import * as ui from '@sage/xtrem-ui';

interface EntryTransactions {
    code: string;
    isLocationReplenishable: boolean;
    isConsumptions: boolean;
    isShortages: boolean;
}

@ui.decorators.page<MobileLocationReorder>({
    isTitleHidden: true,
    title: 'Location reordering',
    menuItem: stockControl,
    priority: 300,
    isTransient: false,
    authorizationCode: 'CWSALR',
    access: { node: '@sage/x3-inventory/StockReorder' },
    skipDirtyCheck: true,
    async onLoad() {
        await this._initializePage();
    },
})
export class MobileLocationReorder extends ui.Page<GraphApi> {
    private entryTransactions: EntryTransactions[] = [];

    private async _initializePage(): Promise<void> {
        await this._initializeSite();
        //Only initialize the rest of the page if the siteField is defined
        if (this.siteField.value) {
            await this.initializeTransactions();
            await this.initializeStorageList();
            this._showPage();
        } else {
            this._disablePage();
        }
    }

    private _showPage(): void {
        this.mainSection.isHidden = false;
    }

    private _disablePage(): void {
        this.mainSection.isHidden = false;
        this.transaction.isDisabled = true;
        this.storageList.isDisabled = true;
    }

    private async _initializeSite(): Promise<void> {
        this.siteField.value = await getSelectedStockSite(
            this,
            ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
            ui.localize(
                '@sage/x3-stock/dialog-error-location-inquiry-set-site',
                'Define a default stock site on the user function profile.',
            ),
        );
    }

    private async initializeTransactions(): Promise<void> {
        await this.getTransactions();
        this.setTransactions();
    }

    private async getTransactions(): Promise<void> {
        const response = await this.$.graph
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
                            transactionType: 'reorderPlan',
                            isAutomaticDetermination: false,
                            isActive: true,
                        },
                    },
                ),
            )
            .execute();

        for (const transactions of response.edges) {
            this.entryTransactions.push({
                code: transactions.node.code,
                isLocationReplenishable: transactions.node.isLocationReplenishable,
                isConsumptions: transactions.node.isConsumptionArea,
                isShortages: transactions.node.isShortages,
            });
        }
    }

    private setTransactions(): void {
        let transactionCodes: string[] = [];
        for (const singleTransaction of this.entryTransactions) {
            transactionCodes.push(singleTransaction.code);
        }
        if (transactionCodes.length === 0) {
            this._disablePage();
        } else {
            this.transaction.options = transactionCodes;
            this.transaction.value = this.transaction.options[0];
            if (this.entryTransactions.length == 1) {
                this.transaction.isHidden = true;
                this.storageList.focus();
            }
        }
        this.transaction.focus();
    }

    private async initializeStorageList() {
        let replenishableTransactions = new Set();
        let consumptionTransactions = new Set();
        let shortagesTransactions = new Set();
        for (const transactions of this.entryTransactions) {
            if (transactions.isLocationReplenishable) {
                replenishableTransactions.add(transactions.code);
            }
            if (transactions.isConsumptions) {
                consumptionTransactions.add(transactions.code);
            }
            if (transactions.isShortages) {
                shortagesTransactions.add(transactions.code);
            }
        }

        let replenishableStorageListNumbers: string[] = [];
        let consumptionsStorageListNumbers: string[] = [];
        let shortagesStorageListNumers: string[] = [];
        if (replenishableTransactions.has(this.transaction.value)) {
            replenishableStorageListNumbers = await this.getReplenishableStorageListNumbers();
        }
        if (consumptionTransactions.has(this.transaction.value)) {
            consumptionsStorageListNumbers = await this.getConsumptionsStorageListNumbers();
        }
        if (shortagesTransactions.has(this.transaction.value)) {
            shortagesStorageListNumers = await this.getShortagesStorageListNumbers();
        }
        let storageListNumbers: string[] = this.removeDuplicates(
            replenishableStorageListNumbers,
            consumptionsStorageListNumbers,
            shortagesStorageListNumers,
        );
        storageListNumbers.sort();
        return (this.storageList.options = storageListNumbers);
    }

    private async getReplenishableStorageListNumbers(): Promise<string[]> {
        const response = await this.$.graph
            .node('@sage/x3-stock/StockReorder')
            .aggregate.query(
                aggregateEdgesSelector<
                    StockReorder,
                    AggregateGroupSelector<StockReorder>,
                    AggregateValuesSelector<StockReorder>
                >(
                    {
                        group: {
                            documentNumber: {
                                _by: 'value',
                            },
                        },
                        values: {
                            documentNumber: {
                                min: false,
                                max: false,
                                sum: false,
                                avg: false,
                                distinctCount: true,
                            },
                        },
                    },
                    {
                        filter: {
                            stockSite: this.siteField.value,
                            documentNumber: {
                                _ne: '',
                            },
                        },
                        first: 500,
                    },
                ),
            )
            .execute();

        let storageLists: string[] = [];
        for (const storagelist of response.edges) {
            storageLists.push(storagelist.node.group.documentNumber);
        }

        return storageLists;
    }

    private async getConsumptionsStorageListNumbers(): Promise<string[]> {
        const response = await this.$.graph
            .node('@sage/x3-stock/Allocation')
            .aggregate.query(
                aggregateEdgesSelector<
                    Allocation,
                    AggregateGroupSelector<Allocation>,
                    AggregateValuesSelector<Allocation>
                >(
                    {
                        group: {
                            storageListNumber: {
                                _by: 'value',
                            },
                        },
                        values: {
                            storageListNumber: {
                                min: false,
                                max: false,
                                sum: false,
                                avg: false,
                                distinctCount: true,
                            },
                        },
                    },
                    {
                        filter: {
                            stockSite: {
                                code: this.siteField.value,
                            },
                            allocationType: 'detailed',
                            storageListNumber: {
                                _ne: '',
                            },
                            documentNumber: {
                                _ne: '',
                            },
                            documentType: {
                                _in: ['salesOrder', 'workOrder', 'subcontractOrder'],
                            },

                            _or: [
                                {
                                    defaultLocation: {
                                        _ne: '',
                                    },
                                },
                                {
                                    defaultLocationType: {
                                        _ne: '',
                                    },
                                },
                            ],
                        },
                        first: 500,
                    },
                ),
            )
            .execute();

        let storageLists: string[] = [];
        for (const storagelist of response.edges) {
            storageLists.push(storagelist.node.group.storageListNumber);
        }

        return storageLists;
    }

    private async getShortagesStorageListNumbers(): Promise<string[]> {
        const response = await this.$.graph
            .node('@sage/x3-stock/Allocation')
            .aggregate.query(
                aggregateEdgesSelector<
                    Allocation,
                    AggregateGroupSelector<Allocation>,
                    AggregateValuesSelector<Allocation>
                >(
                    {
                        group: {
                            storageListNumber: {
                                _by: 'value',
                            },
                        },
                        values: {
                            storageListNumber: {
                                min: false,
                                max: false,
                                sum: false,
                                avg: false,
                                distinctCount: true,
                            },
                        },
                    },
                    {
                        filter: {
                            stockSite: this.siteField.value,
                            storageListNumber: {
                                _ne: '',
                            },
                            documentNumber: {
                                _ne: '',
                            },
                            allocationType: 'detailedShortage',
                            location: {
                                _ne: '',
                            },
                        },
                        first: 500,
                    },
                ),
            )
            .execute();

        let storageLists: string[] = [];
        for (const storagelist of response.edges) {
            storageLists.push(storagelist.node.group.storageListNumber);
        }

        return storageLists;
    }

    private removeDuplicates(
        replenishableStorageListNumbers: string[],
        consumptionsStorageListNumbers: string[],
        shortagesStorageListNumers: string[],
    ): string[] {
        let set = new Set<string>();
        for (const item of replenishableStorageListNumbers) {
            set.add(item);
        }
        for (const item of consumptionsStorageListNumbers) {
            set.add(item);
        }
        for (const item of shortagesStorageListNumers) {
            set.add(item);
        }

        return Array.from(set);
    }

    @ui.decorators.section<MobileLocationReorder>({
        isTitleHidden: true,
        isHidden: true,
    })
    mainSection: ui.containers.Section;

    @ui.decorators.block<MobileLocationReorder>({
        parent() {
            return this.mainSection;
        },
    })
    mainBlock: ui.containers.Block;

    @ui.decorators.dropdownListField<MobileLocationReorder>({
        parent() {
            return this.mainBlock;
        },
        title: 'Transaction',
        isMandatory: true,
        isTransient: true,
        isHidden: false,
        isDisabled: false,
        onChange() {
            this.initializeStorageList();
        },
    })
    transaction: ui.fields.DropdownList;

    @ui.decorators.textField<MobileLocationReorder>({
        parent() {
            return this.mainBlock;
        },
        isHidden: true,
    })
    siteField: ui.fields.Text;

    @ui.decorators.selectField<MobileLocationReorder>({
        parent() {
            return this.mainBlock;
        },
        title: 'Storage list',
        isMandatory: true,
        isTransient: true,
        isHidden: false,
        placeholder: 'Scan or select...',
        isFullWidth: true,
        async onChange() {
            if (!this.storageList.value) return;
            await this.initializeStorageList();
            await this._tryToRoute();
        },
    })
    storageList: ui.fields.Select;

    private async _tryToRoute() {
        this.$.setPageClean();
        this.$.router.goTo('@sage/x3-stock/MobileLocationReorderTodo', {
            stockSite: this.siteField.value,
            storageListNumber: this.storageList.value,
            entryTransaction: this.transaction.value,
        });
    }
}
