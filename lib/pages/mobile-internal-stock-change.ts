import { Product, ProductInput, ProductSite } from '@sage/x3-master-data-api';
import { UnitOfMeasure } from '@sage/x3-master-data-api-partial';
import { dialogConfirmation, dialogMessage } from '@sage/x3-master-data/lib/client-functions/dialogs';
import { getPageValuesNotTransient } from '@sage/x3-master-data/lib/client-functions/get-page-values-not-transient';
import { getSelectedStockSite } from '@sage/x3-master-data/lib/client-functions/get-selected-stock-site';
import { onGoto } from '@sage/x3-master-data/lib/client-functions/on-goto';
import { GraphApi, StockChangeInput, StockChangeLineInput, StockEntryTransaction } from '@sage/x3-stock-api';
import { MobileSettings } from '@sage/x3-stock-data-api';
import { stockControl } from '@sage/x3-stock-data/build/lib/menu-items/stock-control';
import {
    AsyncVoidFunction,
    DictionaryFieldSupported,
    VoidFunction,
} from '@sage/x3-system/lib/client-functions/screen-management-gs-1';
import { SupportServiceManagementGs1Page } from '@sage/x3-system/lib/client-functions/support-service-management-gs-1-page';
import { DataTitle } from '@sage/x3-system/lib/shared-functions/parsed-element';
import { ExtractEdgesPartial, extractEdges, withoutEdges } from '@sage/xtrem-client';
import { DateValue } from '@sage/xtrem-date-time';
import { MAX_INT_32 } from '@sage/xtrem-shared';
import * as ui from '@sage/xtrem-ui';
import { NotifyAndWait } from '../client-functions/display';
import { getNumberOfDecimal, getUnitNumberOfDecimalList } from '../client-functions/get-unit-number-decimals';

// Key to use with Composite Data Gs1 for this application
export const mobileApplicationGs1Key = 'MobileInventoryStockChangeGs1Key';

type DeepPartial<T> = T extends Object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;
type PartialStockEntryTransaction = DeepPartial<StockEntryTransaction>;

export type inputsStockChange = {
    stockChange: StockChangeInput & {
        id?: string;
    };
    username: string;
    currentLine?: number;
    currentOperation?: number;
    started: boolean;
    selectedTransaction?: PartialStockEntryTransaction;
    selectedProduct?: ProductInput;
    destination?: string;
    printingMode?: string;
};

export enum PrintingModeEnum {
    noPrint = 1,
    stockLabel = 2,
    substituteValue3 = 3,
    transfertDocument = 4,
    analysisDocument = 5,
    createdContainerLabel = 6,
    stockLabelAndCreatedContainerLabel = 7,
}
@ui.decorators.page<MobileInternalStockChange>({
    title: 'Stock change',
    module: 'x3-stock',
    mode: 'default',
    menuItem: stockControl,
    priority: 100,
    isTitleHidden: true,
    authorizationCode: 'CWSSCS',
    access: { node: '@sage/x3-stock/StockChange' },
    skipDirtyCheck: true,
    async onLoad() {
        const returnFromDetail = this.$.queryParameters['ReturnFromDetail'] as string;
        returnFromDetail != 'yes' ? this.$.storage.remove('mobile-stockChange') : (this.transaction.isDisabled = true);
        this._currentOperation = 0;
        if (!(await this._init())) {
            this._disablePage();
        }
    },
    businessActions() {
        return [this.createButton];
    },
})
export class MobileInternalStockChange extends SupportServiceManagementGs1Page<GraphApi> {
    public savedObject: inputsStockChange;
    private _transactions: PartialStockEntryTransaction[];
    private _notifier = new NotifyAndWait(this);
    private _mobileSettings: MobileSettings;
    private _currentOperation: number;
    private _isGoto: boolean = false;
    /* @internal */
    private _globalTradeItemNumber: string | null = null;
    /* @internal */
    private _productSite: ExtractEdgesPartial<ProductSite>;
    private _numberOfDecimalList: ExtractEdgesPartial<UnitOfMeasure>[];

    /*
     *
     *  Technical properties
     *
     */

    @ui.decorators.textField<MobileInternalStockChange>({
        isHidden: true,
    })
    stockSite: ui.fields.Text;

    @ui.decorators.pageAction<MobileInternalStockChange>({
        title: 'Create',
        buttonType: 'primary',
        isDisabled: true,
        shortcut: ['f2'],
        async onClick() {
            if (this.savedObject?.stockChange?.stockChangeLines?.length) {
                this.prepareDataMutation();
                //to disable the create button
                this.$.loader.isHidden = false;
                const result = await this._callCreationAPI();
                //to enable the create button
                this.$.loader.isHidden = true;

                // Special case unable to connect check type of error
                if ((!result.errors || !result.errors.length) && result instanceof Error) {
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

                    let message = '';

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
                        this.$.storage.remove('mobile-stockChange');
                        await this.$.router.emptyPage();
                    }
                    return;
                }

                if ((!result.errors || !result.errors.length || result.errors.length === 0) && !result.message) {
                    const options: ui.dialogs.DialogOptions = {
                        acceptButton: {
                            text: ui.localize('@sage/x3-stock/button-accept-ok', 'OK'),
                        },
                    };
                    this.$.storage.remove('mobile-stockChange');
                    await this.$.sound.success();

                    await dialogMessage(
                        this,
                        'success',
                        ui.localize('@sage/x3-stock/dialog-success-title', 'Success'),
                        ui.localize(
                            '@sage/x3-stock/pages__mobile_stock_change__notification__creation_success',
                            'Document no. {{documentId}} created.',
                            { documentId: result.id },
                        ),
                        options,
                    );
                    await this.$.router.emptyPage();
                } else {
                    //severity 3 and 4 - error
                    if (
                        result.errors[0].extensions.diagnoses.filter(
                            (d: { severity: number; message: any }) => d.severity > 2 && d.message,
                        ).length !== 0
                    ) {
                        this.$.loader.isHidden = true;
                        this.createButton.isDisabled = false;
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

                        const messageArray: string[] = result.errors[0].extensions.diagnoses[0].message.split(`\n`);
                        let message = `**${ui.localize(
                            '@sage/x3-stock/dialog-error-stock-change-creation',
                            'An error occurred while creating the stock change',
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
                            this.$.storage.remove('mobile-stockChange');
                            await this.$.router.emptyPage();
                        }
                    } else {
                        //severity 1 and 2 - warning
                        this.$.storage.remove('mobile-stockChange');
                        await this.$.sound.success();

                        const messageArray: string[] = result.errors[0].extensions.diagnoses[0].message.split(`\n`);
                        let message = `**${ui.localize(
                            '@sage/x3-stock/dialog-success-purchase-receipt-creation',
                            'Document no. {{documentId}} created.',
                            { documentId: result.id },
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
                            {
                                fullScreen: true,
                                acceptButton: { text: ui.localize('@sage/x3-stock/button-accept-ok', 'OK') },
                            },
                        );
                        await this.$.router.emptyPage();
                    }
                }
            } else {
                // don't want to wait for this one
                this._notifier.show(
                    ui.localize(
                        '@sage/x3-stock/pages__mobile_stock_change__notification__no_products_error',
                        `Enter at least one product.`,
                    ),
                    'error',
                );
            }
        },
    })
    createButton: ui.PageAction;

    @ui.decorators.section<MobileInternalStockChange>({
        isTitleHidden: true,
    })
    mainSection: ui.containers.Section;

    //  Block - Date / Transaction

    @ui.decorators.block<MobileInternalStockChange>({
        parent() {
            return this.mainSection;
        },
        width: 'extra-large',
        isTitleHidden: true,
    })
    transactionBlock: ui.containers.Block;

    @ui.decorators.dateField<MobileInternalStockChange>({
        parent() {
            return this.transactionBlock;
        },
        title: 'Change date',
        isMandatory: true,
        width: 'small',
        maxDate: DateValue.today().toString(),
        onChange() {},
    })
    effectiveDate: ui.fields.Date;

    @ui.decorators.dropdownListField<MobileInternalStockChange>({
        parent() {
            return this.transactionBlock;
        },
        title: 'Transaction',
        //options: ['ALL'],
        isTransient: true,
        onChange() {
            if (this.transaction.value) {
                // if (this.transaction.value.search(':') !== 0) {
                //     const transac = this.transaction.value.split(':');
                //     this.transaction.value = transac[0];
                // }
                const transaction = this._transactions.find(trs => trs.code === this.transaction.value);
                this._setTransaction(transaction, false, false);
            } else {
                this.product.isDisabled = true;
            }
        },
    })
    transaction: ui.fields.DropdownList;

    // Third block - Product

    @ui.decorators.block<MobileInternalStockChange>({
        parent() {
            return this.mainSection;
        },
        width: 'extra-large',
        isTitleHidden: true,
    })
    thirdBlock: ui.containers.Block;

    @ui.decorators.referenceField<MobileInternalStockChange, Product>({
        parent() {
            return this.thirdBlock;
        },
        title: 'Product',
        node: '@sage/x3-master-data/Product',
        valueField: 'code',
        helperTextField: 'upc',
        placeholder: 'Scan or select...',
        isMandatory: true,
        isTransient: true,
        canFilter: false,
        isAutoSelectEnabled: true,
        isDisabled: false,
        isFullWidth: true,
        shouldSuggestionsIncludeColumns: true,
        filter() {
            return {
                productStatus: { _ne: 'notUsable' },
                _and: [
                    { stockManagementMode: { _ne: 'notManaged' } },
                    { productSites: { _atLeast: 1, stockSite: { code: this.stockSite.value ?? undefined } } },
                ],
            };
        },
        async onInputValueChange(this, rawData: string): Promise<void> {
            await this.scanBarCode(this.product, rawData);
        },
        async onChange() {
            await this._onChange_product();
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
            ui.nestedFields.text({
                bind: 'globalTradeItemNumber',
                title: 'GTIN',
                isReadOnly: true,
                isHidden: true,
            }),
            ui.nestedFields.text({
                bind: 'serialNumberManagementMode',
                isHidden: true,
            }),
        ],
    })
    product: ui.fields.Reference;

    //fourth block : product card

    @ui.decorators.block<MobileInternalStockChange>({
        parent() {
            return this.mainSection;
        },
        title: 'Products in change',
        width: 'extra-large',
        isHidden: true,
    })
    stockChangeLinesBlock: ui.containers.Block;

    @ui.decorators.tableField<MobileInternalStockChange>({
        parent() {
            return this.stockChangeLinesBlock;
        },
        title: 'Products in stock change:',
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
                    this.savedObject.stockChange.stockChangeLines.splice(rowId, 1);
                    if (this.savedObject.stockChange.stockChangeLines.length === 0) {
                        this._initStorage();
                        this.createButton.isDisabled = true;
                        onGoto(this, '@sage/x3-stock/MobileInternalStockChange');
                    } else {
                        this.stockChangeLines.value = this._mapStockChange(
                            this.savedObject.stockChange.stockChangeLines,
                        );
                        this.stockChangeLines.title = this.stockChangeLines.title.replace(
                            /[0-9]/,
                            this.stockChangeLines.value.length.toString(),
                        );

                        // don't forget to update session storage or deleted lines will reappear if user refreshes the page
                        const values = getPageValuesNotTransient(this);
                        this.savedObject = {
                            ...this.savedObject,
                            stockChange: { ...this.savedObject.stockChange, ...values },
                        };
                        this._saveStockChange();
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
    stockChangeLines: ui.fields.Table<any>;

    /*
     *
     *  Init functions
     *
     */
    private async _init(): Promise<boolean> {
        await this._readSavedObject();
        await this._initSite();
        if (this.stockSite.value && this._mobileSettings.stockField1) {
            this._initDestination();
            await this._initTransaction();
            this._numberOfDecimalList = await getUnitNumberOfDecimalList(this);
            this._initStockChangeLines();
            this._postInitStockChangeLines();
        } else {
            return false;
        }

        return await this._initControlManagerGs1(this.stockSite.value);
    }

    /**
     * Initialize ControlManagerGs1
     * @returns true when ControlManagerGs1 has usable
     */
    private async _initControlManagerGs1(site: string): Promise<boolean> {
        return await this.createAndInitServiceGs1(site, mobileApplicationGs1Key, {
            [DataTitle.gtin]: {
                mainField: this.product,
                onChangeMainField: this._onChange_product,
            },
        } as DictionaryFieldSupported);
    }

    private _disablePage(): void {
        this.effectiveDate.isDisabled = true;
        this.transaction.isDisabled = true;
        this.product.isDisabled = true;
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
            this._mobileSettings = JSON.parse(this.$.storage.get('mobile-settings-stock-change') as string);

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

    private _initDestination() {
        //TODO: when the selected destination will be implemented
        const destination = this.$.storage.get('mobile-label-destination') as string;
        if (destination) {
            this.savedObject.destination = destination;
        }
    }

    private async _initTransaction(): Promise<void | never> {
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
                                identifier1Destination: true,
                                identifier2Destination: true,
                                identifier1Detail: true,
                                identifier2Detail: true,
                                printingMode: true,
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
                                    transactionType: 'stockChange',
                                    isActive: true,
                                    stockChangeDestination: 'internal',
                                    stockChangeAccessMode: { _ne: 'containerNumber' },
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
                this._disablePage();
                throw new Error('Transaction not authorized, cannot continue');
            }
        } else {
            if (!this._transactions || this._transactions.length === 0) {
                this._disablePage();
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

    private _setTransaction(transaction: PartialStockEntryTransaction, hideTransaction = false, disableProduct = true) {
        if (this._transactions) this.transaction.options = this._transactions.map(trs => trs.code);

        this.transaction.value = transaction.code;
        this.transaction.isHidden = hideTransaction;

        this.savedObject = {
            ...this.savedObject,
            selectedTransaction: transaction,
        };

        this.product.isDisabled = disableProduct;
    }

    private async _readSavedObject() {
        const _storedString = this.$.storage.get('mobile-stockChange') as string;

        if (!_storedString) {
            this._initStorage();
        } else {
            this.savedObject = JSON.parse(_storedString) as inputsStockChange;

            if (!this._checkStorage()) {
                await this._reInitStorage();
            }
        }
    }

    /*
    storage functions
    */

    private _checkStorage() {
        if (!this.savedObject.stockChange.stockChangeLines) {
            return false;
        }

        if (this.savedObject.username !== this.$.username) {
            return false;
        }

        if (!this.savedObject.username) {
            return false;
        }
        return true;
    }

    private async _reInitStorage() {
        await this._notifier.showAndWait(
            ui.localize(
                '@sage/x3-stock/pages__mobile_stock_change__notification__storage_error',
                `An error occurred loading the storage, the page will restart to cleanup`,
            ),
            'error',
        );
        this._initStorage();
        onGoto(this, '@sage/x3-stock/MobileInternalStockChange');
    }

    private _initStorage() {
        this.savedObject = {
            stockChange: {
                id: '',
                stockChangeLines: new Array<StockChangeLineInput>(),
            },
            currentLine: 0,
            username: this.$.username,
            started: false,
            selectedTransaction: {} as PartialStockEntryTransaction,
        };
        this._saveStockChange(this.savedObject);
    }

    private _saveStockChange(data = this.savedObject) {
        this.$.storage.set('mobile-stockChange', JSON.stringify({ ...data }));
    }

    private _mapStockChange(change: Partial<StockChangeLineInput>[]) {
        let rowCount = 0;
        return change.map((line: StockChangeLineInput) => {
            return {
                _id: String(rowCount++), // this defines the rowId parameter in dropdownActions onClick() event
                productDescription: line.productDescription,
                product: line.product,
                quantityAndStockUnit: `${Number(line.stockDetails[0].quantityInPackingUnit).toFixed(
                    getNumberOfDecimal(this._numberOfDecimalList, line.stockDetails[0].packingUnit),
                )} ${line.stockDetails[0].packingUnit}`,
                stockSite: this.stockSite.value,
            };
        });
    }
    private _initStockChangeLines() {
        if (this.savedObject.stockChange.stockChangeLines) {
            this.savedObject.stockChange.stockChangeLines = this.savedObject.stockChange.stockChangeLines.map(
                (line: StockChangeLineInput) => {
                    return {
                        ...line,
                        quantityAndStockUnit: `${line.quantityInPackingUnitDestination?.toString()} ${
                            line.packingUnitDestination
                        }`,
                        stockSite: this.stockSite.value,
                    };
                },
            );
        }

        if (this.savedObject.stockChange.stockChangeLines.length > 0) {
            this.stockChangeLinesBlock.isHidden = false;
            this.stockChangeLines.value = this.savedObject.stockChange.stockChangeLines.map(line => ({
                ...line,
                _id: this.stockChangeLines.generateRecordId(),
            }));
            // this.stockChangeLines.title = `${this.stockChangeLines.value.length.toString()} ${
            //     this.stockChangeLines.title
            // }`;
            this.stockChangeLines.title = `${
                this.stockChangeLines.title
            } ${this.stockChangeLines.value.length.toString()}`;
        }
    }

    private _postInitStockChangeLines() {
        if (this.savedObject.stockChange.effectiveDate) {
            this.effectiveDate.value = this.savedObject.stockChange.effectiveDate;
        } else {
            this.effectiveDate.value = DateValue.today().toString();
        }

        if (this.savedObject.stockChange.stockChangeLines.length > 0) {
            this.createButton.isDisabled = false;
            //to resynchronise the _id for the delete action
            this.stockChangeLines.value = this._mapStockChange(this.savedObject.stockChange.stockChangeLines);
        }
    }
    public prepareDataMutation() {
        delete this.savedObject.stockChange.id;

        if (this.savedObject?.selectedTransaction?.stockAutomaticJournal) {
            this.savedObject.stockChange.stockAutomaticJournal =
                this.savedObject.selectedTransaction?.stockAutomaticJournal.code;
        }
        if (this.savedObject?.selectedTransaction?.stockMovementCode) {
            this.savedObject.stockChange.stockMovementCode =
                this.savedObject.selectedTransaction.stockMovementCode.code;
        }
        if (this.savedObject?.selectedTransaction?.defaultStockMovementGroup) {
            this.savedObject.stockChange.stockMovementGroup =
                this.savedObject.selectedTransaction.defaultStockMovementGroup.code;
        }

        this.savedObject.stockChange.stockChangeDestination = 'internal';

        this.savedObject.stockChange.stockChangeLines = this.savedObject?.stockChange?.stockChangeLines?.map(
            (line: any) => {
                delete line.stockSite;
                delete line.quantityAndStockUnit;
                (line as any).lineNumber = Number(Math.floor(Math.random() * MAX_INT_32));
                return line;
            },
        );
        if (this.savedObject?.destination) {
            this.savedObject.stockChange.destination = this.savedObject.destination;
        }
        if (this.savedObject?.selectedTransaction?.printingMode) {
            this.savedObject.stockChange.printingMode = String(
                PrintingModeEnum[this.savedObject.selectedTransaction.printingMode],
            );
        }
    }

    private async _callCreationAPI(): Promise<any> {
        const _stockChangeArgs = this.savedObject.stockChange;
        let result: any;
        try {
            result = await this.$.graph
                .node('@sage/x3-stock/StockChange')
                .mutations.stockChange(
                    {
                        id: true,
                    },
                    {
                        parameter: _stockChangeArgs,
                    },
                )
                .execute();
            if (!result) {
                throw Error(
                    ui.localize(
                        '@sage/x3-stock/pages__mobile_stock_change__notification__no_create_results_error',
                        'No results received for the creation',
                    ),
                );
            }
        } catch (error) {
            return error;
        }
        return result;
    }

    /**
     * OnChange readonly process
     *
     * Used both decorator and bar code manager.
     * @returns Promise<void>
     */

    /** @internal */
    private readonly _onChange_product: AsyncVoidFunction = async () => {
        if (this._isGoto) return;
        this._isGoto = true;
        this._globalTradeItemNumber = null;

        if (await this.product.value?.code) {
            const result = withoutEdges(
                await this.$.graph
                    .node('@sage/x3-master-data/ProductSite')
                    .query(
                        ui.queryUtils.edgesSelector(
                            {
                                isBeingCounted: true,
                                product: {
                                    globalTradeItemNumber: true,
                                },
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
                    .execute(),
                //            ) as Partial<ProductSite>[];
            ) as ExtractEdgesPartial<ProductSite>[];

            if (result.length === 0) {
                this.product.value = null;
                this.product.focus();
                this._isGoto = false;
            }

            if (result[0].isBeingCounted === true) {
                if (
                    !(await this.$.dialog
                        .confirmation(
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
                        .catch(error => false))
                ) {
                    this.product.value = null;
                    this.product.focus();
                    this._isGoto = false;
                    return;
                }
            }

            const returnFromDetail = this.$.queryParameters['ReturnFromDetail'] as string;
            let curLine = 0;
            if (returnFromDetail === 'yes') {
                curLine = this.savedObject.currentLine ?? 0;
            } else {
                curLine = 0;
            }
            if (returnFromDetail === 'yes' && this.savedObject.currentOperation !== undefined) {
                this._currentOperation = this.savedObject.currentOperation + 1;
            } else {
                this._currentOperation = 0;
            }
            const values = getPageValuesNotTransient(this);
            this.savedObject = {
                ...this.savedObject,
                stockChange: { ...this.savedObject.stockChange, ...values },
                started: true,
                selectedProduct: this.product.value ?? undefined,
                currentOperation: this._currentOperation,
            };
            this.goToDetailsPage(result[0], result[0].product?.globalTradeItemNumber);
        }
        this._isGoto = false;
    };

    /** @internal */
    private goToDetailsPage(
        productSite: ExtractEdgesPartial<ProductSite>,
        globalTradeItemNumber: string | null | undefined,
    ) {
        // Store globalTradeItemNumber for postDone action
        this._globalTradeItemNumber = globalTradeItemNumber ?? '';
        this._productSite = productSite;

        this._saveStockChange();

        // saving data and aborting dispatch is not enough :
        // the page has changed before dispatching has aborted !
        this.saveCompositeData();

        // If we are in the process of dispatching, we must delay the change of page
        if (this.controlManagerGs1.isDispatchInProgress) {
            this.controlManagerGs1.abortDispatch(this._postDoneDetailPage);
        } else if (!this.controlManagerGs1.isInitializationInProgress) {
            this._postDoneDetailPage();
        }
    }

    /**
     * This function is already delayed by the controlManagerGs1
     * onGoto is not necessary here
     */
    /** @internal */
    private readonly _postDoneDetailPage: VoidFunction = () => {
        this.$.removeToasts();
        this.$.setPageClean();

        // necessary for loading data in a non-transient way
        this.$.router.goTo('@sage/x3-stock/MobileInternalStockChangeDetails', {
            _id: `${this.product.value?.code ?? ''}|${this.stockSite.value}`,
            mobileSettings: JSON.stringify({ ...this._mobileSettings }),
            stockSite: JSON.stringify({ code: this.stockSite.value }),
            selectedProduct: JSON.stringify(this._productSite),
            globalTradeItemNumber: `${this._globalTradeItemNumber ?? ''}`,
        });
    };
}
