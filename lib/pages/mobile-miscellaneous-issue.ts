import { Product, ProductInput } from '@sage/x3-master-data-api';
import { UnitOfMeasure } from '@sage/x3-master-data-api-partial';
import { dialogConfirmation, dialogMessage } from '@sage/x3-master-data/lib/client-functions/dialogs';
import { getPageValuesNotTransient } from '@sage/x3-master-data/lib/client-functions/get-page-values-not-transient';
import { getSelectedStockSite } from '@sage/x3-master-data/lib/client-functions/get-selected-stock-site';
import { MiscellaneousIssueInput, MiscellaneousIssueLineInput, StockEntryTransaction } from '@sage/x3-stock-api';
import { MobileSettings } from '@sage/x3-stock-data-api';
import { other } from '@sage/x3-stock-data/build/lib/menu-items/other';
import { ExtractEdgesPartial, extractEdges } from '@sage/xtrem-client';
import { DateValue } from '@sage/xtrem-date-time';
import { MAX_INT_32 } from '@sage/xtrem-shared';
import * as ui from '@sage/xtrem-ui';
import { NotifyAndWait } from '../client-functions/display';
import { getNumberOfDecimal, getUnitNumberOfDecimalList } from '../client-functions/get-unit-number-decimals';

type DeepPartial<T> = T extends Object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;
type PartialStockEntryTransaction = DeepPartial<StockEntryTransaction>;

export type inputsMiscIssue = {
    miscellaneousIssue: MiscellaneousIssueInput & {
        id: string;
    };
    username: string;
    currentLine?: number;
    currentDetail?: number;
    currentOperation?: number;
    started: boolean;
    selectedTransaction: PartialStockEntryTransaction;
    selectedProduct?: ProductInput;
    destination?: string;
    printingMode?: string;
};

@ui.decorators.page<MobileMiscellaneousIssue>({
    title: 'Miscellaneous issue',
    module: 'x3-stock',
    mode: 'default',
    menuItem: other,
    priority: 200,
    isTitleHidden: true,
    authorizationCode: 'CWSSMO',
    access: { node: '@sage/x3-stock/MiscellaneousIssue' },
    skipDirtyCheck: true,
    async onLoad() {
        const returnFromDetail = this.$.queryParameters['ReturnFromDetail'] as string;
        returnFromDetail != 'yes'
            ? this.$.storage.remove('mobile-miscellaneousIssue')
            : (this.transaction.isDisabled = true);
        this._currentOperation = 0;
        this._isGoto = false;
        await this._init();
    },
    onDirtyStateUpdated(isDirty: boolean) {
        const isNotMiscLinesCreated = this.savedObject?.miscellaneousIssue?.miscellaneousIssueLines?.length === 0;
        this.createButton.isDisabled = isNotMiscLinesCreated;
    },
    businessActions() {
        return [this.createButton];
    },
})
export class MobileMiscellaneousIssue extends ui.Page {
    public savedObject: inputsMiscIssue;
    private _transactions: PartialStockEntryTransaction[];
    private _notifier = new NotifyAndWait(this);
    private _mobileSettingsIssue: MobileSettings;
    private _numberOfDecimalList: ExtractEdgesPartial<UnitOfMeasure>[];
    _currentOperation: number;
    _isGoto: boolean;

    @ui.decorators.textField<MobileMiscellaneousIssue>({
        isHidden: true,
    })
    stockSite: ui.fields.Text;

    /*
     *
     *  Technical properties
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
            this.$.storage.remove('mobile-miscellaneousIssue');
            await this.$.router.emptyPage();
        }
    }

    private async _showSuccess(_id: string) {
        const options: ui.dialogs.DialogOptions = {
            acceptButton: {
                text: ui.localize('@sage/x3-stock/button-accept-ok', 'OK'),
            },
        };
        this.$.storage.remove('mobile-miscellaneousIssue');
        await this.$.sound.success();
        await dialogMessage(
            this,
            'success',
            ui.localize('@sage/x3-stock/dialog-success-title', 'Success'),
            ui.localize(
                '@sage/x3-stock/pages__miscellaneous_issue__notification__creation_success',
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
            '@sage/x3-stock/pages__mobile_miscellaneous_issue__notification__creation_error',
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
            this.$.storage.remove('mobile-miscellaneousIssue');
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
        this.$.storage.remove('mobile-miscellaneousIssue');
        await this.$.sound.success();

        const messageArray: string[] = _result.errors[0].extensions.diagnoses[0].message.split(`\n`);
        let message = `**${ui.localize(
            '@sage/x3-stock/pages__mobile_miscellaneous_issue__notification__creation_success',
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

    @ui.decorators.pageAction<MobileMiscellaneousIssue>({
        title: 'Create',
        buttonType: 'primary',
        isDisabled: true,
        async onClick() {
            if (this.savedObject.miscellaneousIssue.miscellaneousIssueLines?.length ?? 0 > 0) {
                this.prepareDataMutation();
                //to disable the create button
                this.$.loader.isHidden = false;
                const result = await this._callCreationAPI();
                //to enable the create button
                this.$.loader.isHidden = true;

                // Special case unable to connect check type of error
                if ((!result.errors || !result.errors.length) && result instanceof Error) {
                    await this._showErrors();
                }

                if ((!result.errors || !result.errors.length || result.errors.length === 0) && !result.message) {
                    await this._showSuccess(result.id);
                } else {
                    //severity 3 and 4
                    if (
                        result.errors[0].extensions.diagnoses.filter(
                            (d: { severity: number; message: any }) => d.severity > 2 && d.message,
                        ).length !== 0 ||
                        result.message
                    ) {
                        await this._showSeverityThreeAndFour(result);
                    } else {
                        await this._showSeverityOneAndTwo(result);
                    }
                }
            } else {
                this._notifier.show(
                    ui.localize(
                        '@sage/x3-stock/pages__miscellaneous_issue__notification__no_products_error',
                        `Enter at least one product.`,
                    ),
                    'error',
                );
            }
        },
    })
    createButton: ui.PageAction;

    @ui.decorators.section<MobileMiscellaneousIssue>({
        isTitleHidden: true,
    })
    mainSection: ui.containers.Section;

    // First Block - Date and Transaction

    @ui.decorators.block<MobileMiscellaneousIssue>({
        parent() {
            return this.mainSection;
        },
        width: 'extra-large',
        isTitleHidden: true,
    })
    transactionBlock: ui.containers.Block;

    @ui.decorators.dateField<MobileMiscellaneousIssue>({
        parent() {
            return this.transactionBlock;
        },
        title: 'Issue date',
        isMandatory: true,
        width: 'small',
        maxDate: DateValue.today().toString(),
        placeholder: 'Enter...',
        onChange() {},
    })
    effectiveDate: ui.fields.Date;

    @ui.decorators.dropdownListField<MobileMiscellaneousIssue>({
        parent() {
            return this.transactionBlock;
        },
        title: 'Transaction',
        //options: ['ALL'],
        isTransient: true,
        placeholder: 'Scan or select...',
        onChange() {
            if (this.transaction.value) {
                const transaction = this._transactions.find(trs => trs.code === this.transaction.value);
                if (transaction) this._setTransaction(transaction, false, false);
            } else {
                this.product.isDisabled = true;
            }
        },
    })
    transaction: ui.fields.DropdownList;

    // Second block - Product

    @ui.decorators.block<MobileMiscellaneousIssue>({
        parent() {
            return this.mainSection;
        },
        width: 'extra-large',
        isTitleHidden: true,
    })
    thirdBlock: ui.containers.Block;

    @ui.decorators.referenceField<MobileMiscellaneousIssue, Product>({
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
                    { productSites: { _atLeast: 1, stockSite: { code: this.stockSite.value ?? '' } } },
                ],
            };
        },
        async onChange() {
            if (!this._isGoto && (await this.product.value?.code)) {
                this._isGoto = true;

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

                if (
                    (response.length !== 0 &&
                        response.edges[0].node.isBeingCounted === true &&
                        (await dialogConfirmation(
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
                        ))) ||
                    (response.length !== 0 && response.edges[0].node.isBeingCounted !== true)
                ) {
                    const returnFromDetail = this.$.queryParameters['ReturnFromDetail'] as string;
                    this._currentOperation =
                        returnFromDetail === 'yes' && this.savedObject.currentOperation !== undefined
                            ? this.savedObject.currentOperation + 1
                            : 0;
                    const values = getPageValuesNotTransient(this);
                    this.savedObject = {
                        ...this.savedObject,
                        miscellaneousIssue: {
                            ...this.savedObject.miscellaneousIssue,
                            ...values,
                        },
                        started: true,
                        selectedProduct: this.product.value ? this.product.value : undefined,
                        currentOperation: this._currentOperation,
                    };
                    this._saveMiscIssue();
                    this.$.setPageClean();
                    this.$.router.goTo('@sage/x3-stock/MobileMiscellaneousIssueDetails', {
                        _id: `${this.product.value?.code ?? ''}|${this.stockSite.value}`, // necessary for loading data in a non-transient way
                        mobileSettings: JSON.stringify({ ...this._mobileSettingsIssue }),
                        stockSite: JSON.stringify({ code: this.stockSite.value }),
                        globalTradeItemNumber: '',
                    });
                } else {
                    this.product.value = null;
                    this.product.focus();
                }
            }
            this._isGoto = false;
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

    @ui.decorators.block<MobileMiscellaneousIssue>({
        parent() {
            return this.mainSection;
        },
        title: 'Products',
        width: 'extra-large',
        isHidden: true,
    })
    miscIssueLinesBlock: ui.containers.Block;

    @ui.decorators.tableField<MobileMiscellaneousIssue>({
        parent() {
            return this.miscIssueLinesBlock;
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
                    this.savedObject.miscellaneousIssue.miscellaneousIssueLines?.splice(rowId, 1);
                    if (this.savedObject.miscellaneousIssue.miscellaneousIssueLines?.length === 0) {
                        // Cancelling isDirty flag to prevent unexpected message
                        this.miscellaneousIssueLines.isDirty = false;
                        this._initStorage();
                        this.createButton.isDisabled = true;
                        this.$.router.goTo('@sage/x3-stock/MobileMiscellaneousIssue', {
                            _id: `${this.product.value?.code ?? ''}|${this.stockSite.value}`,
                            mobileSettings: JSON.stringify({ ...this._mobileSettingsIssue }),
                            stockSite: JSON.stringify({ code: this.stockSite.value }),
                            globalTradeItemNumber: '',
                        });
                    } else {
                        this.miscellaneousIssueLines.value = this._mapMiscIssue(
                            this.savedObject.miscellaneousIssue.miscellaneousIssueLines,
                        );
                        this.miscellaneousIssueLines.title = this.miscellaneousIssueLines.title?.replace(
                            /[0-9]/,
                            this.miscellaneousIssueLines.value.length.toString(),
                        );
                        const values = getPageValuesNotTransient(this);
                        // don't forget to update session storage or deleted lines will reappear if user refreshes the page
                        this.savedObject = {
                            ...this.savedObject,
                            miscellaneousIssue: { ...this.savedObject.miscellaneousIssue, ...values },
                        };
                        this._saveMiscIssue();
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
    miscellaneousIssueLines: ui.fields.Table<any>;

    /*
     *
     *  Init functions
     *
     */
    private async _init(): Promise<boolean> {
        await this._readSavedObject();
        await this._initSite();
        if (this.stockSite.value && this._mobileSettingsIssue.stockField1) {
            this._initDestination();
            await this._initTransaction();
            this._numberOfDecimalList = await getUnitNumberOfDecimalList(this);
            this._initMiscIssueLines();
            this._postInitMiscIssueLines();
            return true;
        } else {
            this._disablePage();
            return false;
        }
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
            this._mobileSettingsIssue = JSON.parse(this.$.storage.get('mobile-settings-issue') as string);

            if (!this._mobileSettingsIssue.stockField1) {
                dialogMessage(
                    this,
                    'error',
                    ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                    ui.localize(
                        '@sage/x3-stock/pages__you_need_to_select_stock_search_parameters_to_set_up_Mobile_Automation_FUNADCSEARCH_function',
                        'You need to select stock search parameters to set up Mobile Automation - FUNADCSEARCH function.',
                    ),
                );
            }
        }
    }

    private _initDestination() {
        //  TODO: when the selected destination will be implemented
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
                                    transactionType: 'miscellaneousIssue',
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
        if (this._transactions) this.transaction.options = this._transactions.map(trs => trs.code ?? '');
        this.transaction.value = transaction.code ?? null;
        this.transaction.isHidden = hideTransaction;

        this.savedObject = {
            ...this.savedObject,
            selectedTransaction: transaction,
        };

        this.product.isDisabled = disableProduct;
    }

    private async _readSavedObject() {
        const storedString = this.$.storage.get('mobile-miscellaneousIssue') as string;

        if (!storedString) {
            this._initStorage();
        } else {
            this.savedObject = JSON.parse(
                this.$.storage.get('mobile-miscellaneousIssue') as string,
            ) as inputsMiscIssue;

            if (!this._checkStorage()) {
                await this._reInitStorage();
            }
        }
    }

    /*
    storage functions
    */

    private _checkStorage() {
        if (!this.savedObject.miscellaneousIssue.miscellaneousIssueLines) {
            return false;
        }

        if (this.savedObject.username !== this.$.userCode) {
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
                '@sage/x3-stock/pages__miscellaneous_issue__notification__storage_error',
                `An error occurred loading the storage, the page will restart to cleanup`,
            ),
            'error',
        );
        this._initStorage();
        this.$.router.goTo('@sage/x3-stock/MobileMiscellaneousIssue');
    }

    private _initStorage() {
        this.savedObject = {
            miscellaneousIssue: {
                id: '',
                miscellaneousIssueLines: new Array<MiscellaneousIssueLineInput>(),
                entryType: 'miscellaneousIssue',
            },
            username: this.$.userCode ? this.$.userCode : '',
            started: false,
            selectedTransaction: {} as PartialStockEntryTransaction,
        };
        this._saveMiscIssue(this.savedObject);
    }

    private _saveMiscIssue(data = this.savedObject) {
        this.$.storage.set('mobile-miscellaneousIssue', JSON.stringify({ ...data }));
    }

    private _mapMiscIssue(issue: Partial<MiscellaneousIssueLineInput>[] | undefined) {
        let rowCount = 0;
        if (!issue) {
            return [];
        }
        return issue.map((line: MiscellaneousIssueLineInput) => {
            return {
                _id: String(rowCount++), // this defines the rowId parameter in dropdownActions onClick() event
                productDescription: line.productDescription,
                product: line.product,
                quantityAndStockUnit: `${Number(line.quantityInPackingUnit).toFixed(
                    getNumberOfDecimal(this._numberOfDecimalList, line.packingUnit),
                )} ${line.packingUnit}`,
                //                stockSite: this.stockSite.value,
            };
        });
    }




    private _initMiscIssueLines() {
          const  getUniqueValues = <T>(arr: T[], key: keyof T): any[] => {
            const values = arr.map(item => item[key]);
            return Array.from(new Set(values));
          }

        if (this.savedObject.miscellaneousIssue.miscellaneousIssueLines) {
            this.savedObject.miscellaneousIssue.miscellaneousIssueLines.forEach(line => {
                const sumQuantityInStockUnitInDetails = line?.stockDetails?.reduce((acc, item) => acc + (item['quantityInStockUnit'] as number), 0);
                const stockUnitValues = getUniqueValues(line.stockDetails ?? [], 'stockUnit');
                const hasMatchingInnerValues = this.savedObject.miscellaneousIssue.miscellaneousIssueLines?.every(item => {
                    const outerValue = item['packingUnit'];
                    const innerItems = item['stockDetails'] as any[];
                    return innerItems.every(innerItem => innerItem['packingUnit'] === outerValue);
                  });

                  if (!hasMatchingInnerValues) {
                    line.packingUnit = stockUnitValues[0];
                    line.quantityInPackingUnit = sumQuantityInStockUnitInDetails;
                    line.packingUnitToStockUnitConversionFactor = 1;
                }
            });
        }

        if (this.savedObject.miscellaneousIssue.miscellaneousIssueLines) {
            this.savedObject.miscellaneousIssue.miscellaneousIssueLines =
                this.savedObject.miscellaneousIssue.miscellaneousIssueLines.map(
                    (line: MiscellaneousIssueLineInput) => {
                        return {
                            ...line,
                            quantityAndStockUnit: `${line.quantityInPackingUnit?.toString()}  ${line.packingUnit}`,
                            //                           stockSite: this.stockSite.value,
                        };
                    },
                );
        }

        if (this.savedObject.miscellaneousIssue.miscellaneousIssueLines?.length ?? 0 > 0) {
            this.miscIssueLinesBlock.isHidden = false;
            this.miscellaneousIssueLines.value =
                this.savedObject.miscellaneousIssue?.miscellaneousIssueLines?.map(line => ({
                    ...(line as MiscellaneousIssueLineInput),
                    _id: this.miscellaneousIssueLines.generateRecordId(),
                })) ?? [];
            this.miscellaneousIssueLines.title = `${
                this.miscellaneousIssueLines.title
            } ${this.miscellaneousIssueLines.value.length.toString()}`;
            this.miscellaneousIssueLines.isDirty = true;
        }
    }

    private _postInitMiscIssueLines() {
        if (this.savedObject.miscellaneousIssue.effectiveDate) {
            this.effectiveDate.value = this.savedObject.miscellaneousIssue.effectiveDate;
        } else {
            this.effectiveDate.value = DateValue.today().toString();
        }

        if (this.savedObject.miscellaneousIssue.miscellaneousIssueLines?.length ?? 0 > 0) {
            this.createButton.isDisabled = false;
            //to resynchronise the _id for the delete action
            this.miscellaneousIssueLines.value = this._mapMiscIssue(
                this.savedObject.miscellaneousIssue.miscellaneousIssueLines,
            );
        }
    }
    public prepareDataMutation() {
        // delete this.savedObject.miscellaneousIssue.id;

        if (this.savedObject.selectedTransaction.stockAutomaticJournal) {
            this.savedObject.miscellaneousIssue.stockAutomaticJournal =
                this.savedObject.selectedTransaction.stockAutomaticJournal.code;
        }
        if (this.savedObject.selectedTransaction.stockMovementCode) {
            this.savedObject.miscellaneousIssue.stockMovementCode =
                this.savedObject.selectedTransaction.stockMovementCode.code;
        }
        if (this.savedObject.selectedTransaction.defaultStockMovementGroup) {
            this.savedObject.miscellaneousIssue.stockMovementGroup =
                this.savedObject.selectedTransaction.defaultStockMovementGroup.code;
        }

        this.savedObject.miscellaneousIssue.miscellaneousIssueLines =
            this.savedObject.miscellaneousIssue.miscellaneousIssueLines?.map((line: any) => {
                delete line.quantityAndStockUnit;
                (line as any).lineNumber = Number(Math.floor(Math.random() * MAX_INT_32));
                return line;
            });
        if (this.savedObject.destination) {
            this.savedObject.miscellaneousIssue.destination = this.savedObject.destination;
        }
        if (this.savedObject.selectedTransaction.printingMode) {
            this.savedObject.printingMode = this.savedObject.selectedTransaction.printingMode;
        }
    }

    private async _callCreationAPI(): Promise<any | Error> {
        const _miscellaneousIssueArgs = this.savedObject.miscellaneousIssue;
        let result: any;

        try {
            result = await this.$.graph
                .node('@sage/x3-stock/MiscellaneousIssue')
                .mutations.create(
                    {
                        id: true,
                    },
                    {
                        data: _miscellaneousIssueArgs,
                    },
                )
                .execute();
            if (!result) {
                throw Error(
                    ui.localize(
                        '@sage/x3-stock/pages__miscellaneous_issue__notification__no_create_results_error',
                        'No results received for the creation',
                    ),
                );
            }
        } catch (error) {
            return error;
        }
        return result;
    }
}
