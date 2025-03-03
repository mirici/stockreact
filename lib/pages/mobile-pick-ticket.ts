import { dialogMessage } from '@sage/x3-master-data/lib/client-functions/dialogs';
import { getSelectedStockSite } from '@sage/x3-master-data/lib/client-functions/get-selected-stock-site';
import { GraphApi, PickList, PickTicket } from '@sage/x3-stock-api';
import { Location, MobileSettings } from '@sage/x3-stock-data-api';
import { picking } from '@sage/x3-stock-data/build/lib/menu-items/picking';
import { AggregateGroupSelector, AggregateValuesSelector, aggregateEdgesSelector } from '@sage/xtrem-client';
import * as ui from '@sage/xtrem-ui';
interface EntryTransactions {
    code: string;
    isEnterableDestinationLocation?: boolean;
}
@ui.decorators.page<MobilePickTicket>({
    title: 'Pick ticket',
    mode: 'default',
    isTransient: false,
    isTitleHidden: true,
    menuItem: picking,
    priority: 100,
    authorizationCode: 'CWSPRH',
    access: { node: '@sage/x3-stock/PickTicket' },
    skipDirtyCheck: true,
    async onLoad() {
        let displayDestination = true;
        const storageEntryTransaction = this.$.storage.get(MobilePickTicket.TRANSACTION_KEY) as string;
        if (storageEntryTransaction) {
            displayDestination = this.$.storage.get(MobilePickTicket.DESTINATION_DISPLAY_KEY)?.toString() === '0';
        }

        // Site and Entry transactions
        await this._init();

        if (this.stockSite.value && this._mobileSettings.stockField1 && storageEntryTransaction) {
            // Are we returning to the first page, if so, clear out some values, reinstate others

            this.$.storage.remove(MobilePickTicket.DESTINATION_KEY);
            // Reinstate previously entered entry transaction
            this.transaction.value = storageEntryTransaction;
            this.destinationLocation.isHidden = displayDestination;
        }
    },
    businessActions() {
        return [this.nextButton];
    },
})
export class MobilePickTicket extends ui.Page<GraphApi> {
    /*
     * Technical fields
     */
    private static readonly TRANSACTION_KEY: string = 'mobile-pick-ticket-entry-transaction';
    private static readonly DESTINATION_KEY: string = 'mobile-pick-ticket-destination-location';
    private static readonly DESTINATION_DISPLAY_KEY: string = 'mobile-pick-ticket-destination-location-display';
    private static readonly PICK_LIST_KEY: string = 'mobile-pick-ticket-pick-list';
    private static readonly PICK_TICKET_KEY: string = 'mobile-pick-ticket';
    private _entryTransactions: EntryTransactions[];
    private _mobileSettings: MobileSettings;

    @ui.decorators.textField<MobilePickTicket>({
        isHidden: true,
    })
    stockSite: ui.fields.Text;

    /*
     *
     *  Page Actions
     *
     */
    @ui.decorators.pageAction<MobilePickTicket>({
        title: 'Next',
        shortcut: ['f3'],
        buttonType: 'primary',
        async onClick() {
            this._gotoPageTwo();
        },
    })
    nextButton: ui.PageAction;

    /*
     *
     *  Sections
     *
     */
    @ui.decorators.section<MobilePickTicket>({
        isTitleHidden: true,
    })
    mainSection: ui.containers.Section;

    /*
     *
     *  Blocks
     *
     */
    @ui.decorators.block<MobilePickTicket>({
        parent() {
            return this.mainSection;
        },
        width: 'large',
        isTitleHidden: true,
    })
    dataInputBlock: ui.containers.Block;

    /*
     *
     *  Fields
     *
     */
    @ui.decorators.dropdownListField<MobilePickTicket>({
        parent() {
            return this.dataInputBlock;
        },
        title: 'Transaction',
        isTransient: true,
        isMandatory: true,
        onChange() {
            if (this.transaction.value) {
                let pos = 0;
                pos = this._entryTransactions
                    .map(function (e) {
                        return e.code;
                    })
                    .indexOf(this.transaction.value);
                if (pos !== -1) {
                    this.destinationLocation.isHidden = !this._entryTransactions[pos].isEnterableDestinationLocation;
                    this.$.storage.set(
                        MobilePickTicket.DESTINATION_DISPLAY_KEY,
                        this._entryTransactions[pos].isEnterableDestinationLocation ? '1' : '0',
                    );
                }
            }
        },
    })
    transaction: ui.fields.DropdownList;

    @ui.decorators.selectField<MobilePickTicket>({
        parent() {
            return this.dataInputBlock;
        },
        title: 'Pick list',
        placeholder: 'Scan or select...',
        isMandatory: false,
        isFullWidth: true,
        async onChange() {
            if (this.pickList.value) {
                this.pickTicket.isReadOnly = true;
                if (this.destinationLocation.isHidden === true) {
                    this._gotoPageTwo();
                } else {
                    this.destinationLocation.focus();
                }
            } else {
                this.pickTicket.isReadOnly = false;
            }
        },
    })
    pickList: ui.fields.Select;

    @ui.decorators.referenceField<MobilePickTicket, PickTicket>({
        parent() {
            return this.dataInputBlock;
        },
        title: 'Pick ticket',
        placeholder: 'Scan or select...',
        node: '@sage/x3-stock/PickTicket',
        valueField: 'id',
        isTransient: true,
        isMandatory: false,
        canFilter: false,
        isAutoSelectEnabled: true,
        isFullWidth: true,
        filter() {
            return {
                stockSite: { code: this.stockSite.value },
                pickTicketStatus: 'inProcess',
                pickTicketLines: { _atLeast: 1, adcPickedLine: 0 },
            };
        },
        orderBy: {
            _id: -1,
        },
        async onChange() {
            if (this.pickTicket.value) {
                this.pickList.isReadOnly = true;
                if (this.destinationLocation.isHidden === true) {
                    this._gotoPageTwo();
                } else {
                    this.destinationLocation.focus();
                }
            } else {
                this.pickList.isReadOnly = false;
            }
        },
        columns: [
            ui.nestedFields.text({
                bind: 'id',
                title: 'Pick ticket',
                isReadOnly: true,
            }),
            ui.nestedFields.text({
                bind: 'pickListNumber',
                title: 'Pick list',
                isReadOnly: true,
            }),
            ui.nestedFields.reference({
                bind: 'picker',
                title: 'Picker',
                node: '@sage/x3-system/User',
                valueField: 'code',
            }),
            // (X3-227347) TODO Obsolete: Having to specify & hide fields used in filter that don't need to be displayed
            ui.nestedFields.text({
                bind: 'pickTicketStatus',
                isHidden: true,
            }),
            ui.nestedFields.reference({
                bind: 'stockSite',
                node: '@sage/x3-system/Site',
                valueField: 'code',
                isHidden: true,
            }),
        ],
    })
    pickTicket: ui.fields.Reference;

    @ui.decorators.referenceField<MobilePickTicket, Location>({
        parent() {
            return this.dataInputBlock;
        },
        title: 'Destination location',
        placeholder: 'Scan or select...',
        node: '@sage/x3-stock-data/Location',
        valueField: 'code',
        isAutoSelectEnabled: true,
        isFullWidth: true,
        minLookupCharacters: 1,
        isMandatory: false,
        canFilter: false,
        filter() {
            return {
                stockSite: { code: this.stockSite.value },
                category: 'internal',
                isBlocked: false,
                isBeingCounted: false,
            };
        },
        columns: [
            ui.nestedFields.text({
                bind: 'code',
                title: 'Code',
                isReadOnly: true,
            }),
            ui.nestedFields.text({
                bind: 'type',
                title: 'Type',
                isReadOnly: true,
            }),
        ],
        onChange() {
            if (this.destinationLocation.value && (this.pickTicket.value || this.pickList.value)) {
                this._gotoPageTwo();
            }
        },
    })
    destinationLocation: ui.fields.Reference;

    /*
     *
     *  Init functions
     *
     */
    private async _init(): Promise<void> {
        try {
            await this._initSite();
            if (this.stockSite.value && this._mobileSettings.stockField1) {
                this._entryTransactions = [];
                this.transaction.options = await this._getEntryTransactionOptions();
                this.transaction.value = this.transaction.options[0];
                if (this.transaction.options.length == 1) {
                    this.transaction.isDisabled = true;
                }
                this.pickList.options = await this._getPickLists(); //* populate picking list selection
            } else {
                this._disablePage();
            }
        } catch (e) {
            ui.console.error(e);
        }
    }

    private async _initSite(): Promise<void> {
        this.stockSite.value = await getSelectedStockSite(
            this,
            ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
            ui.localize(
                '@sage/x3-stock/dialog-error-location-inquiry-set-site',
                'Define a default stock site on the user function profile.',
            ),
        );

        if (this.stockSite.value) {
            this._mobileSettings = JSON.parse(this.$.storage.get('mobile-settings-pick-ticket') as string);

            if (!this._mobileSettings.stockField1) {
                dialogMessage(
                    this,
                    'error',
                    ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                    ui.localize(
                        '@sage/x3-stock/pages__mobile_you_need_to_select_stock_search_parameters_to_set_up_Mobile_Automation_FUNADCSEARCH_function',
                        'You need to select stock search parameters to set up Mobile Automation - FUNADCSEARCH function.',
                    ),
                );
            }
        }
    }

    private async _getEntryTransactionOptions(): Promise<string[]> {
        try {
            const response = await this.$.graph
                .node('@sage/x3-stock/StockEntryTransaction')
                .query(
                    ui.queryUtils.edgesSelector(
                        {
                            _id: true,
                            code: true,
                            isEnterableDestinationLocation: true,
                        },
                        {
                            filter: {
                                transactionType: 'pickTickets',
                                isActive: true,
                            },
                        },
                    ),
                )
                .execute();

            if (!response.edges || response.edges.length === 0) {
                this._disablePage();
                return [];
            }
            if (response.edges.length === 1) {
                this.transaction.isHidden = true;
            }
            for (const transactions of response.edges) {
                this._entryTransactions.push({
                    code: transactions.node.code,
                    isEnterableDestinationLocation: transactions.node.isEnterableDestinationLocation,
                });
            }
            this.destinationLocation.isHidden = !this._entryTransactions[0].isEnterableDestinationLocation;
            this.$.storage.set(
                MobilePickTicket.DESTINATION_DISPLAY_KEY,
                this._entryTransactions[0].isEnterableDestinationLocation ? '1' : '0',
            );
            return this._entryTransactions.map((theTransactions: any) => {
                return theTransactions.code;
            });
        } catch (e) {
            await dialogMessage(
                this,
                'error',
                ui.localize('@sage/x3-stock/error-loading-transaction-codes', 'Error loading transaction codes'),
                String(e),
            );
        }
        return [];
    }
    private _disablePage(): void {
        this.pickList.isDisabled = true;
        this.pickTicket.isDisabled = true;
        this.destinationLocation.isDisabled = true;
        this.nextButton.isDisabled = true;
        this.transaction.isDisabled = true;
    }

    private async _gotoPageTwo(): Promise<void> {
        const errors = await this.$.page.validate();
        if (errors.length === 0) {
            this.$.storage.set(
                MobilePickTicket.DESTINATION_KEY,
                this.destinationLocation.value ? this.destinationLocation.value.code : '',
            );
            this.$.setPageClean();
            if (this.pickTicket.value) {
                this.$.storage.set(MobilePickTicket.TRANSACTION_KEY, this.transaction.value ?? '');
                this.$.storage.set(MobilePickTicket.PICK_TICKET_KEY, this.pickTicket.value._id);
                this.$.storage.set(MobilePickTicket.PICK_LIST_KEY, '');
                this.$.router.goTo('@sage/x3-stock/MobilePickTicketSelectFromTicket', {
                    mobileSettings: JSON.stringify(this._mobileSettings),
                });
            } else if (this.pickList.value) {
                this.$.storage.set(MobilePickTicket.TRANSACTION_KEY, this.transaction.value ?? '');
                this.$.storage.set(MobilePickTicket.PICK_TICKET_KEY, '');
                this.$.storage.set(MobilePickTicket.PICK_LIST_KEY, this.pickList.value);
                this.$.router.goTo('@sage/x3-stock/MobilePickTicketSelectFromList', {
                    mobileSettings: JSON.stringify(this._mobileSettings),
                });
            }
        } else {
            this.$.showToast(`${ui.localize('@sage/x3-stock/dialog-error-title', 'Error')}: ${errors[0]}`, {
                type: 'error',
                timeout: 30000,
            });
        }
    }
    /*
     *
     * Read the Shipment Preparation Lists node, grouping by preparationList
     *
     */
    private async _getPickLists(): Promise<string[]> {
        try {
            const response = await this.$.graph
                .node('@sage/x3-stock/PickList')
                .aggregate.query(
                    aggregateEdgesSelector<
                        PickList,
                        AggregateGroupSelector<PickList>,
                        AggregateValuesSelector<PickList>
                    >(
                        {
                            group: {
                                preparationList: {
                                    _by: 'value',
                                },
                            },
                            values: {
                                preparationListSequenceNumber: {
                                    min: true,
                                    max: false,
                                    sum: false,
                                    avg: false,
                                    distinctCount: false,
                                },
                            },
                        },
                        {
                            filter: {
                                stockSite: this.stockSite.value,
                                pickTicket: { pickTicketStatus: { _eq: 'inProcess' } },
                                pickTicketLine: { adcPickedLine: 0 },
                            },
                            // orderBy: { preparationList: -1 },
                            first: 500,
                        },
                    ),
                )
                .execute();

            // transform response into a string array
            let theOptions = response.edges.map((pickLists: any) => {
                return pickLists.node.group.preparationList;
            });
            return theOptions.reverse(); // Sort it
        } catch (e) {
            await dialogMessage(
                this,
                'error',
                ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                ui.localize(
                    '@sage/x3-stock/dialog-error-reading-preparation-lists',
                    'Error while reading the pick lists',
                ) + String(e),
            );
            return [];
        }
    }
}
