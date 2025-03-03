import { Product, ProductInput } from '@sage/x3-master-data-api';
import { UnitOfMeasure } from '@sage/x3-master-data-api-partial';
import { dialogConfirmation, dialogMessage } from '@sage/x3-master-data/lib/client-functions/dialogs';
import { getPageValuesNotTransient } from '@sage/x3-master-data/lib/client-functions/get-page-values-not-transient';
import { getSelectedStockSite } from '@sage/x3-master-data/lib/client-functions/get-selected-stock-site';
import {
    GraphApi,
    MiscellaneousReceiptInput,
    MiscellaneousReceiptLineInput,
    StockEntryTransaction,
} from '@sage/x3-stock-api';
import { other } from '@sage/x3-stock-data/build/lib/menu-items/other';
import { ExtractEdgesPartial, extractEdges } from '@sage/xtrem-client';
import { DateValue } from '@sage/xtrem-date-time';
import { MAX_INT_32 } from '@sage/xtrem-shared';
import * as ui from '@sage/xtrem-ui';
import { NotifyAndWait } from '../client-functions/display';
import { getNumberOfDecimal, getUnitNumberOfDecimalList } from '../client-functions/get-unit-number-decimals';

export type DeepPartial<T> = T extends Object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;
type PartialStockEntryTransaction = DeepPartial<StockEntryTransaction>;

export type inputs = {
    miscellaneousReceipt: MiscellaneousReceiptInput & {
        id: string;
    };
    username: string;
    started: boolean;
    selectedTransaction: PartialStockEntryTransaction;
    selectedProduct?: ProductInput;
    destination?: string;
};

/** Created with X3 Etna Studio at 2020-01-21T16:10:32.247Z */
@ui.decorators.page<MobileMiscellaneousReceipt>({
    title: 'Miscellaneous receipt',
    module: 'xtrem-x3-stock',
    mode: 'default',
    menuItem: other,
    priority: 100,
    isTitleHidden: true,
    authorizationCode: 'CWSSMR',
    access: { node: '@sage/x3-stock/MiscellaneousReceipt' },
    skipDirtyCheck: true,
    async onLoad() {
        const returnFromDetail = this.$.queryParameters['ReturnFromDetail'] as string;
        returnFromDetail != 'yes'
            ? this.$.storage.remove('miscellaneousReceipt')
            : (this.transaction.isDisabled = true);
        await this._init();
    },
    onDirtyStateUpdated(isDirty: boolean) {
        const isNotMiscLinesCreated = this.savedObject?.miscellaneousReceipt?.miscellaneousReceiptLines?.length === 0;
        this.createButton.isDisabled = isNotMiscLinesCreated;
    },
    businessActions() {
        return [this.createButton];
    },
})
export class MobileMiscellaneousReceipt extends ui.Page<GraphApi> {
    /*
     *
     *  Technical properties
     *
     */

    public savedObject: inputs;
    private _notifier = new NotifyAndWait(this);
    private _transactions: PartialStockEntryTransaction[];
    private _numberOfDecimalList: ExtractEdgesPartial<UnitOfMeasure>[];
    private _isLocationPreloaded: boolean;
    /*
     *
     *  Technical fields
     *
     */

    @ui.decorators.textField<MobileMiscellaneousReceipt>({
        isHidden: true,
    })
    stockSite: ui.fields.Text;

    /*
     *
     *  Page Actions
     *
     */
    private async _showErrors() {
        this.$.loader.isHidden = true;
        const options: ui.dialogs.DialogOptions = {
            acceptButton: {
                text: ui.localize('@sage/x3-stock/button-goback', 'Go back'),
            },
            cancelButton: {
                text: ui.localize('@sage/x3-stock/button-cancel', 'Cancel'),
            },
            size: 'small',
        };
        await this.$.sound.error();

        if (
            await dialogConfirmation(
                this,
                'error',
                ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                `${ui.localize(
                    '@sage/x3-stock/pages_creation_error_connexion_webservice_contact_administrator',
                    'An error has occurred (connection or webservice error). Please contact your administrator.',
                )}`,
                options,
            )
        ) {
            await this.$.router.refresh();
        } else {
            this.$.storage.remove('miscellaneousReceipt');
            await this.$.router.emptyPage();
        }
    }

    private async _showSuccess(_id: string) {
        const options: ui.dialogs.DialogOptions = {
            acceptButton: {
                text: ui.localize('@sage/x3-stock/button-accept-ok', 'OK'),
            },
        };
        this.$.storage.remove('miscellaneousReceipt');
        await this.$.sound.success();

        await dialogMessage(
            this,
            'success',
            ui.localize('@sage/x3-stock/dialog-success-title', 'Success'),
            ui.localize(
                '@sage/x3-stock/pages__miscellaneous_receipt__notification__creation_success',
                'Document no. {{documentId}} created.',
                { documentId: _id },
            ),
            options,
        );
        await this.$.router.emptyPage();
    }

    private async _showSeverityThreeAndFour(_result: any) {
        this.$.loader.isHidden = true;
        const options: ui.dialogs.DialogOptions = {
            acceptButton: {
                text: ui.localize('@sage/x3-stock/button-goback', 'Go back'),
            },
            cancelButton: {
                text: ui.localize('@sage/x3-stock/button-cancel', 'Cancel'),
            },
            size: 'small',
            mdContent: true,
        };
        await this.$.sound.error();

        const messageArray: string[] = _result.errors[0].extensions.diagnoses[0].message.split(`\n`);
        let message = `**${ui.localize(
            '@sage/x3-stock/pages__mobile_miscellaneous_receipt__notification__creation_error',
            'An error has occurred',
        )}**\n\n`;
        if (messageArray.length === 1) {
            message += `${messageArray[0]}`;
        } else {
            message += messageArray.map(item => `* ${item}`).join('\n');
        }

        if (
            await dialogConfirmation(
                this,
                'error',
                ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                `${message}`,
                options,
            )
        ) {
            await this.$.router.refresh();
        } else {
            this.$.storage.remove('miscellaneousReceipt');
            await this.$.router.emptyPage();
        }
    }

    private async _showSeverityOneAndTwo(_result: any) {
        const options: ui.dialogs.DialogOptions = {
            acceptButton: {
                text: ui.localize('@sage/x3-stock/button-accept-ok', 'OK'),
            },
            mdContent: true,
        };
        this.$.storage.remove('miscellaneousReceipt');
        await this.$.sound.success();

        const messageArray: string[] = _result.errors[0].extensions.diagnoses[0].message.split(`\n`);
        let message = `**${ui.localize(
            '@sage/x3-stock/pages__mobile_miscellaneous_receipt__notification__creation_success',
            'Document no. {{documentId}} created.',
            { documentId: _result.id },
        )}**\n\n`;
        if (messageArray.length === 1) {
            message += `${messageArray[0]}`;
        } else {
            message += messageArray.map(item => `* ${item}`).join('\n');
        }
        await dialogMessage(
            this,
            'success',
            ui.localize('@sage/x3-stock/dialog-success-title', 'Success'),
            `${message}`,
            options,
        );
        await this.$.router.emptyPage();
    }

    @ui.decorators.pageAction<MobileMiscellaneousReceipt>({
        title: 'Create',
        buttonType: 'primary',
        isDisabled: true,
        shortcut: ['f2'],
        async onClick() {
            if (this.savedObject.miscellaneousReceipt?.miscellaneousReceiptLines?.length > 0) {
                this.prepareDataMutation();
                this.$.loader.isHidden = false;
                const result = await this._callCreationAPI();
                this.$.loader.isHidden = true;
                ui.console.warn('result=', result);
                if ((!result.errors || !result.errors.length) && result instanceof Error) {
                    await this._showErrors();
                    return;
                }

                if ((!result.errors || !result.errors.length || result.errors.length === 0) && !result.message) {
                    await this._showSuccess(result.id);
                } else {
                    if (
                        result.errors[0].extensions.diagnoses.filter(
                            (d: { severity: number; message: any }) => d.severity > 2 && d.message,
                        ).length !== 0
                    ) {
                        await this._showSeverityThreeAndFour(result);
                    } else {
                        await this._showSeverityOneAndTwo(result);
                    }
                }
            } else {
                this._notifier.show(
                    ui.localize(
                        '@sage/x3-stock/pages__miscellaneous_receipt__notification__no_products_error',
                        `Enter at least one product.`,
                    ),
                    'error',
                );
            }
        },
    })
    createButton: ui.PageAction;

    /*
     *
     *  Sections
     *
     */

    @ui.decorators.section<MobileMiscellaneousReceipt>({
        isTitleHidden: true,
    })
    mainSection: ui.containers.Section;

    /*
     *
     *  Blocks
     *
     */

    @ui.decorators.block<MobileMiscellaneousReceipt>({
        parent() {
            return this.mainSection;
        },
        width: 'small',
        isTitleHidden: true,
    })
    transactionBlock: ui.containers.Block;

    @ui.decorators.block<MobileMiscellaneousReceipt>({
        parent() {
            return this.mainSection;
        },
        width: 'extra-large',
        isTitleHidden: true,
    })
    productBlock: ui.containers.Block;

    @ui.decorators.block<MobileMiscellaneousReceipt>({
        parent() {
            return this.mainSection;
        },
        title: 'Products in receipt',
        width: 'extra-large',
        isHidden: true,
    })
    miscellaneousReceiptLinesBlock: ui.containers.Block;

    /*
     *
     *  Fields
     *
     */

    @ui.decorators.dateField<MobileMiscellaneousReceipt>({
        parent() {
            return this.transactionBlock;
        },
        title: 'Receipt date',
        isMandatory: true,
        width: 'small',
        placeholder: 'Enter...',
        maxDate: DateValue.today().toString(),
        onChange() {
            if (this.effectiveDate.value) {
                const values = getPageValuesNotTransient(this);
                this.savedObject = {
                    ...this.savedObject,
                    miscellaneousReceipt: { ...this.savedObject.miscellaneousReceipt, ...values },
                };
                this._saveMiscellaneousReceipt();
            }
        },
    })
    effectiveDate: ui.fields.Date;

    @ui.decorators.dropdownListField<MobileMiscellaneousReceipt>({
        parent() {
            return this.transactionBlock;
        },
        title: 'Transaction',
        //options: ['ALL'],
        isTransient: true,
        onChange() {
            if (this.transaction.value) {
                const transaction = this._transactions.find(trs => trs.code === this.transaction.value);
                this._setTransaction(transaction, false, false);
            } else {
                this.product.isDisabled = true;
            }
        },
    })
    transaction: ui.fields.DropdownList;

    @ui.decorators.referenceField<MobileMiscellaneousReceipt, Product>({
        parent() {
            return this.productBlock;
        },
        title: 'Product',
        node: '@sage/x3-master-data/Product',
        valueField: 'code',
        helperTextField: 'upc',
        placeholder: 'Scan or select...',
        isTransient: true,
        canFilter: false,
        isAutoSelectEnabled: true,
        isDisabled: true,
        isFullWidth: true,
        shouldSuggestionsIncludeColumns: true,
        filter() {
            return {
                productStatus: { _ne: 'notUsable' },
                _and: [
                    { stockManagementMode: { _ne: 'notManaged' } },
                    {
                        productSites: {
                            _atLeast: 1,
                            stockSite: { code: this.stockSite.value },
                            stockManagementMode: { _ne: 'notManaged' },
                        },
                    },
                ],
            };
        },
        async onChange() {
            if (await this.product.value?.code) {
                const response = await this.$.graph
                    .node('@sage/x3-master-data/ProductSite')
                    .query(
                        ui.queryUtils.edgesSelector(
                            {
                                isBeingCounted: true,
                            },
                            {
                                filter: {
                                    product: {
                                        code: this.product.value?.code,
                                    },
                                    stockSite: {
                                        code: this.stockSite.value,
                                    },
                                },
                            },
                        ),
                    )
                    .execute();

                if (response.edges[0].node.isBeingCounted === true) {
                    if (
                        await dialogConfirmation(
                            this,
                            'warn',
                            ui.localize('@sage/x3-stock/dialog-warning-title', 'Warning'),
                            ui.localize(
                                '@sage/x3-stock/product-blocked-by-count-continue',
                                'Product blocked by count. Do you want to continue?',
                            ),
                            {
                                acceptButton: {
                                    text: ui.localize('@sage/x3-stock/button-accept-yes', 'Yes'),
                                },
                                cancelButton: {
                                    text: ui.localize('@sage/x3-stock/button-cancel-no', 'No'),
                                },
                            },
                        )
                    ) {
                        const values = getPageValuesNotTransient(this);
                        // this.savedObject = {
                        //     ...this.savedObject,
                        //     miscellaneousReceipt: { ...this.savedObject.miscellaneousReceipt, ...this.$.values },
                        //     started: true,
                        // };
                        this.savedObject = {
                            ...this.savedObject,
                            miscellaneousReceipt: { ...this.savedObject.miscellaneousReceipt, ...values },
                            started: true,
                        };
                        this._saveMiscellaneousReceipt();

                        // TODO: Uncomment when the detail page is done
                        this.$.setPageClean();
                        this.$.router.goTo('@sage/x3-stock/MobileMiscellaneousReceiptDetails', {
                            productSite: this.product.value.code,
                            isLocationPreloaded: this._isLocationPreloaded ? '1' : '0',
                        });
                    } else {
                        this.product.value = null;
                        this.product.focus();
                        return;
                    }
                } else {
                    const values = getPageValuesNotTransient(this);
                    this.savedObject = {
                        ...this.savedObject,
                        miscellaneousReceipt: { ...this.savedObject.miscellaneousReceipt, ...values },
                        started: true,
                    };
                    this._saveMiscellaneousReceipt();

                    // TODO: Uncomment when the detail page is done
                    this.$.setPageClean();
                    if (this.product.value)
                        this.$.router.goTo('@sage/x3-stock/MobileMiscellaneousReceiptDetails', {
                            productSite: this.product.value.code,
                            isLocationPreloaded: this._isLocationPreloaded ? '1' : '0',
                        });
                }
            }
        },
        columns: [
            ui.nestedFields.text({
                bind: 'code',
            }),
            ui.nestedFields.text({
                bind: 'localizedDescription1',
            }),
            ui.nestedFields.text({
                bind: 'upc',
                prefix: 'UPC:',
            }),
        ],
    })
    product: ui.fields.Reference;

    @ui.decorators.tableField<MobileMiscellaneousReceipt>({
        parent() {
            return this.miscellaneousReceiptLinesBlock;
        },
        title: 'Products:',
        isTransient: true,
        canSelect: false,
        canFilter: false,
        columns: [
            ui.nestedFields.text({
                bind: 'product',
                title: 'Product',
            }),
            ui.nestedFields.text({
                bind: 'productDescription',
                title: 'Description',
            }),
            ui.nestedFields.text({
                bind: 'quantityAndStockUnit',
                title: 'Quantity',
            }),
        ],
        dropdownActions: [
            {
                icon: 'delete',
                title: 'Delete',
                onClick(rowId: any) {
                    this.savedObject.miscellaneousReceipt.miscellaneousReceiptLines?.splice(rowId, 1);
                    if (this.savedObject.miscellaneousReceipt.miscellaneousReceiptLines?.length === 0) {
                        // Cancelling isDirty flag to prevent unexpected message
                        this.miscellaneousReceiptLines.isDirty = false;
                        this._initStorage();
                        this.createButton.isDisabled = true;
                        this.$.router.goTo('@sage/x3-stock/MobileMiscellaneousReceipt');
                    } else {
                        this.miscellaneousReceiptLines.value = this._mapMiscellaneousReceipt(
                            this.savedObject.miscellaneousReceipt.miscellaneousReceiptLines,
                        );
                        this.miscellaneousReceiptLines.title = this.miscellaneousReceiptLines.title?.replace(
                            /[0-9]/,
                            this.miscellaneousReceiptLines.value.length.toString(),
                        );

                        // don't forget to update session storage or deleted lines will reappear if user refreshes the page
                        const values = getPageValuesNotTransient(this);
                        this.savedObject = {
                            ...this.savedObject,
                            miscellaneousReceipt: { ...this.savedObject.miscellaneousReceipt, ...values },
                        };
                        this._saveMiscellaneousReceipt();
                    }
                },
            },
        ],
        mobileCard: {
            title: ui.nestedFields.text({
                bind: 'product',
            }),
            line2: ui.nestedFields.text({
                bind: 'productDescription',
            }),
            titleRight: ui.nestedFields.text({
                bind: 'quantityAndStockUnit',
            }),
        },
    })
    miscellaneousReceiptLines: ui.fields.Table<any>;

    /*
     *
     *  Init functions
     *
     */

    private async _init(): Promise<void> {
        await this._readSavedObject();
        await this._initSite();
        await this._getIsLocationPreloaded();

        if (this.stockSite.value) {
            this._initDestination();

            try {
                await this._initTransaction();
                this._numberOfDecimalList = await getUnitNumberOfDecimalList(this);
            } catch (e) {
                ui.console.error(e);
            }

            this._initmiscellaneousReceiptLines();
            this._postInitmiscellaneousReceiptLines();
        } else {
            this._disablePage();
        }
    }

    private _disablePage(): void {
        this.effectiveDate.isDisabled = true;
        this.transaction.isDisabled = true;
        this.product.isDisabled = true;
    }

    private async _readSavedObject() {
        const storedString = this.$.storage.get('miscellaneousReceipt') as string;

        if (!storedString) {
            this._initStorage();
        } else {
            this.savedObject = JSON.parse(storedString) as inputs;

            if (!this._checkStorage()) {
                await this._reInitStorage();
            }
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
    }

    private async _getIsLocationPreloaded() {
        const responseSite = await this.$.graph
            .node('@sage/x3-master-data/MobileAutomationSetup')
            .query(
                ui.queryUtils.edgesSelector(
                    {
                        isLocationPreloaded: true,
                    },
                    {
                        filter: {
                            site: { code: this.stockSite.value },
                        },
                    },
                ),
            )
            .execute();
        if (responseSite.edges.length !== 0) {
            responseSite.edges.some(edge => {
                this._isLocationPreloaded = edge.node.isLocationPreloaded;
            });
        } else {
            const response = await this.$.graph
                .node('@sage/x3-master-data/MobileAutomationSetup')
                .query(
                    ui.queryUtils.edgesSelector(
                        {
                            isLocationPreloaded: true,
                        },
                        {
                            filter: {
                                site: null,
                            },
                        },
                    ),
                )
                .execute();
            if (response.edges.length !== 0) {
                response.edges.some(edge => {
                    this._isLocationPreloaded = edge.node.isLocationPreloaded;
                });
            } else {
                this._isLocationPreloaded = true;
            }
        }
    }
    private _initDestination() {
        //TODO: when the selected destination will be implemented
        const destination = this.$.storage.get('mobile-label-destination') as string;
        if (destination) {
            this.savedObject.destination = destination;
        }
    }

    private async _initTransaction() {
        let transaction = this.savedObject.selectedTransaction;
        let hideTransaction = this.savedObject.started;

        try {
            this._transactions = extractEdges(
                await this.$.graph
                    .node('@sage/x3-stock/StockEntryTransaction')
                    .query(
                        ui.queryUtils.edgesSelector(
                            {
                                code: true,
                                isActive: true,
                                stockAutomaticJournal: {
                                    code: true,
                                },
                                localizedDescription: true,
                                transactionType: true,
                                isLotCustomField1Allowed: true,
                                isLotCustomField2Allowed: true,
                                isLotCustomField3Allowed: true,
                                isLotCustomField4Allowed: true,
                                isLotPotencyAllowed: true,
                                identifier1Detail: true,
                                identifier2Detail: true,
                                supplierLot: true,
                                isLotExpirationDateAllowed: true,
                                defaultStockMovementGroup: {
                                    code: true,
                                },
                                stockMovementCode: {
                                    code: true,
                                },
                                companyOrSiteGroup: {
                                    group: true,
                                },
                            },
                            {
                                filter: {
                                    transactionType: 'miscellaneousReceipt',
                                    isActive: true,
                                },
                            },
                        ),
                    )
                    .execute(),
            );
        } catch (err) {
            ui.console.error(err);
        }

        if (transaction?.code) {
            if (
                !this._transactions.some(trs => {
                    return trs.code === transaction.code;
                })
            ) {
                this.effectiveDate.isDisabled = true;
                this.transaction.isDisabled = true;
                this.product.isDisabled = true;
                throw new Error('Transaction not authorized, cannot continue');
            }
        } else {
            if (!this._transactions || this._transactions.length === 0) {
                this.effectiveDate.isDisabled = true;
                this.transaction.isDisabled = true;
                this.product.isDisabled = true;
                throw new Error('No transaction, cannot continue');
            } else {
                transaction = this._transactions[0];
                this.transaction.isDisabled = false;
            }
        }
        hideTransaction = this._transactions.length <= 1;
        hideTransaction ? (this.transactionBlock.isHidden = true) : null;

        this._setTransaction(transaction, hideTransaction, false);
    }

    private _initmiscellaneousReceiptLines() {
        if (this.savedObject.miscellaneousReceipt.miscellaneousReceiptLines) {
            this.savedObject.miscellaneousReceipt.miscellaneousReceiptLines =
                this.savedObject.miscellaneousReceipt.miscellaneousReceiptLines.map(
                    (line: MiscellaneousReceiptLineInput) => {
                        return {
                            ...line,
                            quantityAndStockUnit: `${line.quantityInStockUnit.toString()} ${line.packingUnit}`,
                            //    stockSite: this.stockSite.value,
                        };
                    },
                );
        }

        if (this.savedObject.miscellaneousReceipt.miscellaneousReceiptLines.length > 0) {
            this.miscellaneousReceiptLinesBlock.isHidden = false;
            this.miscellaneousReceiptLines.value = this.savedObject.miscellaneousReceipt.miscellaneousReceiptLines.map(
                line => ({
                    ...line,
                    _id: this.miscellaneousReceiptLines.generateRecordId(),
                }),
            );
            this.miscellaneousReceiptLines.title = `${
                this.miscellaneousReceiptLines.title
            } ${this.miscellaneousReceiptLines.value.length.toString()}`;
            this.miscellaneousReceiptLines.isDirty = true;
        }
    }

    private _postInitmiscellaneousReceiptLines() {
        if (this.savedObject.miscellaneousReceipt.effectiveDate) {
            this.effectiveDate.value = this.savedObject.miscellaneousReceipt.effectiveDate;
        } else {
            this.effectiveDate.value = DateValue.today().toString();
        }

        if (this.savedObject.miscellaneousReceipt.miscellaneousReceiptLines.length > 0) {
            this.createButton.isDisabled = false;
            //to resynchronize the _id for the delete action
            this.miscellaneousReceiptLines.value = this._mapMiscellaneousReceipt(
                this.savedObject.miscellaneousReceipt.miscellaneousReceiptLines,
            );
        }
    }

    private _setTransaction(transaction: PartialStockEntryTransaction, hideTransaction = false, disableProduct = true) {
        if (this._transactions) this.transaction.options = this._transactions.map(trs => trs.code);

        this.transaction.value = transaction.code;
        this.transaction.isHidden = hideTransaction;

        this.savedObject = {
            ...this.savedObject,
            selectedTransaction: transaction,
        };

        this._saveMiscellaneousReceipt();
        this.product.isDisabled = disableProduct;
    }

    private _checkStorage() {
        if (!this.savedObject.miscellaneousReceipt.miscellaneousReceiptLines) {
            return false;
        }

        if (this.savedObject.username !== this.$.userCode) {
            return false;
        }

        if (
            !this.savedObject.username ||
            this.savedObject.selectedTransaction === undefined ||
            this.savedObject.started === undefined
        ) {
            return false;
        }

        return !this.savedObject.miscellaneousReceipt.miscellaneousReceiptLines.some(line => {
            return [line.quantityInStockUnit, line.packingUnit].some(item => item == null || item === '');
        });
    }

    private async _reInitStorage() {
        await this._notifier.showAndWait(
            ui.localize(
                '@sage/x3-stock/pages__miscellaneous_receipt__notification__storage_error',
                `An error occurred loading the storage, the page will restart to cleanup`,
            ),
            'error',
        );
        this._initStorage();
        this.$.router.goTo('@sage/x3-stock/MobileMiscellaneousReceipt');
    }

    private _initStorage() {
        this.savedObject = {
            miscellaneousReceipt: {
                id: '',
                entryType: 'miscellaneousReceipt',
                miscellaneousReceiptLines: new Array<MiscellaneousReceiptLineInput>(),
            },
            username: this.$.userCode,
            started: false,
            selectedTransaction: {} as PartialStockEntryTransaction,
        };
        this._saveMiscellaneousReceipt(this.savedObject);
    }

    private _saveMiscellaneousReceipt(data = this.savedObject) {
        this.$.storage.set('miscellaneousReceipt', JSON.stringify({ ...data }));
    }

    /*
     *
     *  Create functions
     *
     */

    public prepareDataMutation() {
        delete this.savedObject.miscellaneousReceipt.id;

        if (this.savedObject.selectedTransaction.stockAutomaticJournal) {
            this.savedObject.miscellaneousReceipt.stockAutomaticJournal =
                this.savedObject.selectedTransaction.stockAutomaticJournal.code;
        }
        if (this.savedObject.selectedTransaction.stockMovementCode) {
            this.savedObject.miscellaneousReceipt.stockMovementCode =
                this.savedObject.selectedTransaction.stockMovementCode.code;
        }
        if (this.savedObject.selectedTransaction.defaultStockMovementGroup) {
            this.savedObject.miscellaneousReceipt.stockMovementGroup =
                this.savedObject.selectedTransaction.defaultStockMovementGroup.code;
        }
        if (this.savedObject.selectedTransaction.code) {
            this.savedObject.miscellaneousReceipt.transaction = this.savedObject.selectedTransaction.code;
        }

        this.savedObject.miscellaneousReceipt.miscellaneousReceiptLines =
            this.savedObject.miscellaneousReceipt.miscellaneousReceiptLines.map((line: any) => {
                delete line.quantityAndStockUnit;
                (line as any).lineNumber = Number(Math.floor(Math.random() * MAX_INT_32));
                return line;
            });
        if (this.savedObject.destination) {
            this.savedObject.miscellaneousReceipt.destination = this.savedObject.destination;
        }
    }

    private async _callCreationAPI(): Promise<any | Error> {
        const _miscellaneousReceiptArgs = this.savedObject.miscellaneousReceipt;
        let result: any;

        try {
            result = await this.$.graph
                .node('@sage/x3-stock/MiscellaneousReceipt')
                .create(
                    {
                        id: true,
                    },
                    {
                        data: _miscellaneousReceiptArgs,
                    },
                )
                .execute();
            if (!result) {
                throw Error(
                    ui.localize(
                        '@sage/x3-stock/pages__miscellaneous_receipt__notification__no_create_results_error',
                        'No results received for the creation',
                    ),
                );
            }
        } catch (error) {
            return error;
        }
        return result;
    }

    private _mapMiscellaneousReceipt(receipt: Partial<MiscellaneousReceiptLineInput>[]) {
        let rowCount = 0;
        return receipt.map((line: MiscellaneousReceiptLineInput) => {
            return {
                _id: String(rowCount++), // this defines the rowId parameter in dropdownActions onClick() event
                productDescription: line.productDescription,
                product: line.product,
                quantityAndStockUnit: `${Number(line.quantityInStockUnit).toFixed(
                    getNumberOfDecimal(this._numberOfDecimalList, line.packingUnit),
                )} ${line.packingUnit}`,
                //          stockSite: this.stockSite.value,
            };
        });
    }
}
