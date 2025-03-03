import { ProductInput, ProductSite } from '@sage/x3-master-data-api';
import { UnitOfMeasure } from '@sage/x3-master-data-api-partial';
import { dialogConfirmation, dialogMessage } from '@sage/x3-master-data/lib/client-functions/dialogs';
import { getPageValuesNotTransient } from '@sage/x3-master-data/lib/client-functions/get-page-values-not-transient';
import { getSelectedStockSite } from '@sage/x3-master-data/lib/client-functions/get-selected-stock-site';
import { StockChangeInput, StockChangeLineInput, StockEntryTransaction } from '@sage/x3-stock-api';
import { MobileSettings } from '@sage/x3-stock-data-api';
import { transfer } from '@sage/x3-stock-data/build/lib/menu-items/transfer';
import { SiteInput } from '@sage/x3-system-api';
import { Site } from '@sage/x3-system-api-partial';
import { ExtractEdgesPartial, extractEdges } from '@sage/xtrem-client';
import { DateValue } from '@sage/xtrem-date-time';
import { MAX_INT_32 } from '@sage/xtrem-shared';
import * as ui from '@sage/xtrem-ui';
import { NotifyAndWait } from '../client-functions/display';
import { getNumberOfDecimal, getUnitNumberOfDecimalList } from '../client-functions/get-unit-number-decimals';
import { linkFieldOverride } from '@sage/xtrem-ui/build/lib/component/decorators';

type DeepPartial<T> = T extends Object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;
type PartialStockTransaction = DeepPartial<StockEntryTransaction>;

export type inputsIntersiteTransfer = {
    intersiteTransfer: StockChangeInput & {
        id?: string;
    };
    username: string;
    currentLine?: number;
    currentOperation?: number;
    started: boolean;
    selectedTransaction: PartialStockTransaction;
    selectedProduct?: ProductInput;
    destinationCode?: string;
    printingMode?: string;
    siteDestination?: SiteInput;
};

@ui.decorators.page<MobileIntersiteTransfer>({
    title: 'Intersite',
    module: 'x3-stock',
    mode: 'default',
    menuItem: transfer,
    priority: 100,
    authorizationCode: 'CWSSIS',
    access: { node: '@sage/x3-stock/StockChange' },
    isTransient: false,
    isTitleHidden: true,
    skipDirtyCheck: true,
    async onLoad() {
        this.siteDestination.isReadOnly = false;
        this.transaction.isDisabled = false;
        const returnFromDetail = this.$.queryParameters['ReturnFromDetail'] as string;
        if (returnFromDetail != 'yes') this.$.storage.remove('mobile-intersiteTransfer');
        this._currentOperation = 0;
        await this._init();

        if (!this.siteDestination.value) {
            this.product.isReadOnly = true;
        }
    },
    businessActions() {
        return [this.createButton];
    },
})
export class MobileIntersiteTransfer extends ui.Page {
    public savedObject: inputsIntersiteTransfer;
    private _transactions: PartialStockTransaction[];
    private _matchSiteDestination: ProductSite;
    private _notifier = new NotifyAndWait(this);
    private _mobileSettings: MobileSettings;
    private _currentOperation: number;
    private _numberOfDecimalList: ExtractEdgesPartial<UnitOfMeasure>[];

    @ui.decorators.textField<MobileIntersiteTransfer>({
        isHidden: true,
    })
    stockSite: ui.fields.Text;

    @ui.decorators.pageAction<MobileIntersiteTransfer>({
        title: 'Create',
        isDisabled: true,
        buttonType: 'primary',
        shortcut: ['f2'],
        async onClick() {
            if (
                this.savedObject.intersiteTransfer?.stockChangeLines &&
                this.savedObject.intersiteTransfer?.stockChangeLines?.length > 0
            ) {
                // this.prepareDataMutation();
                //to disable the create button
                this.$.loader.isHidden = false;
                const result = await this._callCreationAPI();
                //to enable the create button
                this.$.loader.isHidden = true;

                // Special case unable to connect check type of error
                if (!result || result instanceof Error) {
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

                    let message = '';

                    if (!result?.message) {
                        message = `${ui.localize(
                            '@sage/x3-stock/pages_creation_error_connexion_webservice_contact_administrator',
                            'An error has occurred (connection or webservice error). Please contact your administrator.',
                        )}`;
                    } else {
                        const _messages = <string[]>[];
                        const _results = <any>result;
                        let _diagnoses = _results?.diagnoses;
                        if (_diagnoses?.length > 1) {
                            _diagnoses = _diagnoses.splice(0, _diagnoses.length - 1);
                        }

                        (
                            (_results?.errors
                                ? _results.errors[0]?.extensions?.diagnoses
                                : (_results?.innerError?.errors[0]?.extensions?.diagnoses ??
                                  _results.extensions?.diagnoses ??
                                  _diagnoses)) ?? []
                        )
                            .filter((d: { severity: number; message: any }) => d.severity > 2 && d.message)
                            .forEach((d: { message: any }) => {
                                const _message = d.message.split(`\n`);
                                _messages.push(..._message);
                            });

                        const _result = _messages.length ? <string[]>_messages : <string[]>result.message.split(`\n`);

                        message = `**${ui.localize(
                            '@sage/x3-stock/dialog-error-intersite-transfer-creation',
                            'An error occurred',
                        )}**\n\n`;

                        if (_result.length === 1) {
                            message += `${_result[0]}`;
                        } else {
                            message += _result.map(item => `* ${item}`).join('\n');
                        }
                    }
                    await this.$.sound.error();

                    if (
                        await dialogConfirmation(
                            this,
                            'error',
                            ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                            message,
                            options,
                        )
                    ) {
                        await this.$.router.refresh();
                    } else {
                        this.$.storage.remove('mobile-intersiteTransfer');
                        await this.$.router.emptyPage();
                    }
                    return;
                } else {
                    const options: ui.dialogs.DialogOptions = {
                        acceptButton: {
                            text: ui.localize('@sage/x3-stock/button-accept-ok', 'OK'),
                        },
                    };
                    this.$.storage.remove('mobile-intersiteTransfer');
                    await this.$.sound.success();

                    await dialogMessage(
                        this,
                        'success',
                        ui.localize('@sage/x3-stock/dialog-success-title', 'Success'),
                        ui.localize(
                            '@sage/x3-stock/pages__mobile-intersite_transfer__notification__creation_success',
                            'Document no. {{documentId}} created.',
                            { documentId: result.id },
                        ),
                        options,
                    );
                    await this.$.router.emptyPage();
                }
            } else {
                this._notifier.show(
                    ui.localize(
                        '@sage/x3-stock/pages__mobile-intersite_transfer__notification__no_products_error',
                        `Enter at least one product.`,
                    ),
                    'error',
                );
            }
        },
    })
    createButton: ui.PageAction;

    @ui.decorators.section<MobileIntersiteTransfer>({
        isTitleHidden: true,
    })
    mainSection: ui.containers.Section;

    // First Block Date / Transaction

    @ui.decorators.block<MobileIntersiteTransfer>({
        parent() {
            return this.mainSection;
        },
        width: 'extra-large',
        isTitleHidden: true,
    })
    firstBlock: ui.containers.Block;

    @ui.decorators.dateField<MobileIntersiteTransfer>({
        parent() {
            return this.firstBlock;
        },
        title: 'Transfer date',
        isMandatory: true,
        width: 'small',
        maxDate: DateValue.today().toString(),
        onChange() {
            if (this.effectiveDate.value) {
                const values = getPageValuesNotTransient(this);
                this.savedObject = {
                    ...this.savedObject,
                    intersiteTransfer: { ...this.savedObject.intersiteTransfer, ...values },
                };
                this.savedObject.intersiteTransfer.effectiveDate = this.effectiveDate.value;
                this._saveInterSiteTransfer();
            }
        },
    })
    effectiveDate: ui.fields.Date;

    @ui.decorators.dropdownListField<MobileIntersiteTransfer>({
        parent() {
            return this.firstBlock;
        },
        title: 'Transaction',
        isTransient: true,
        onChange() {
            if (this.transaction.value) {
                let theTransaction = this.transaction.value;
                if (this.transaction.value.search(':') !== 0) {
                    const transac = this.transaction.value.split(':');
                    theTransaction = transac[0];
                }
                const transaction = this._transactions.find(trs => trs.code === theTransaction) ?? undefined;
                if (transaction) {
                    this._setTransaction(transaction, false, false);
                }
                this.siteDestination.focus();
            } else {
                this.product.isDisabled = true;
            }
        },
    })
    transaction: ui.fields.DropdownList;

    // Second block - data typically entered

    @ui.decorators.block<MobileIntersiteTransfer>({
        parent() {
            return this.mainSection;
        },
        width: 'extra-large',
        isTitleHidden: true,
    })
    secondBlock: ui.containers.Block;

    @ui.decorators.referenceField<MobileIntersiteTransfer, Site>({
        parent() {
            return this.secondBlock;
        },
        title: 'Destination site',
        node: '@sage/x3-system/Site',
        valueField: 'code',
        isTransient: true,
        isMandatory: true,
        placeholder: 'Scan or select…',
        isFullWidth: true,
        isAutoSelectEnabled: true,
        canFilter: false,
        filter() {
            const destinationSiteFilter: any = {
                code: { _ne: this.stockSite.value },
            };
            return destinationSiteFilter;
        },
        async onChange() {
            if (this.siteDestination.value) {
                this.product.isReadOnly = false;
                this.product.focus();
            } else {
                this.product.isReadOnly = true;
            }
        },
        columns: [
            ui.nestedFields.text({
                bind: 'code',
            }),
            ui.nestedFields.text({
                bind: 'name',
            }),
            ui.nestedFields.reference({
                bind: 'legalCompany',
                node: '@sage/x3-system/Site',
                valueField: 'code',
                isHidden: true,
            }),
            ui.nestedFields.reference({
                bind: 'legalCompany',
                node: '@sage/x3-system/Site',
                valueField: 'isLegalCompany',
                isHidden: true,
            }),
        ],
    })
    siteDestination: ui.fields.Reference;

    @ui.decorators.referenceField<MobileIntersiteTransfer, ProductSite>({
        parent() {
            return this.secondBlock;
        },
        title: 'Product',
        node: '@sage/x3-master-data/ProductSite',
        valueField: { product: { code: true } },
        helperTextField: { product: { upc: true } },
        placeholder: 'Scan or select…',
        isMandatory: true,
        isTransient: true,
        canFilter: false,
        isAutoSelectEnabled: true,
        isFullWidth: true,
        shouldSuggestionsIncludeColumns: true,
        filter() {
            return {
                stockSite: { code: this.stockSite.value ?? undefined },
                stock: {
                    _atLeast: 1,
                    stockSite: this.stockSite.value ?? undefined,
                },
                product: {
                    productStatus: { _ne: 'notUsable' },
                },
            };
        },
        onError(error: any, originScreenId: string, originElementId: string) {
            ui.console.warn(`Error on ${originScreenId} ${originElementId}: ${error.message || error}`);
        },
        async onChange() {
            if (this.product.value?.product?.code) {
                this._matchSiteDestination = await this._fetchSiteDestination(
                    this.product.value?.product?.code,
                    this.siteDestination.value?.code,
                );
                if (this._matchSiteDestination) {
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
                                            code: this.product.value?.product?.code,
                                        },
                                        stockSite: {
                                            code: this.stockSite.value,
                                        },
                                    },
                                },
                            ),
                        )
                        .execute();
                    if (response?.edges[0]?.node?.isBeingCounted === true) {
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
                            const returnFromDetail = this.$.queryParameters['ReturnFromDetail'] as string;
                            if (returnFromDetail === 'yes' && this.savedObject.currentOperation !== undefined) {
                                this._currentOperation = this.savedObject.currentOperation + 1;
                            } else {
                                this._currentOperation = 0;
                            }
                            this._createValues();
                            this._saveInterSiteTransfer();
                            this.$.setPageClean();
                            this.$.router.goTo('@sage/x3-stock/MobileIntersiteTransferDetails', {
                                _id: `${this.product.value?.product?.code}|${this.stockSite.value}`,
                                mobileSettings: JSON.stringify({ ...this._mobileSettings }),
                                stockSite: JSON.stringify({ code: this.stockSite.value }),
                                selectedProduct: response.edges[0].node,
                            });
                        } else {
                            this.product.value = null;
                            this.product.focus();
                            return;
                        }
                    } else {
                        const returnFromDetail = this.$.queryParameters['ReturnFromDetail'] as string;
                        if (returnFromDetail === 'yes' && this.savedObject.currentOperation !== undefined) {
                            this._currentOperation = this.savedObject.currentOperation + 1;
                        } else {
                            this._currentOperation = 0;
                        }
                        this._createValues();
                        this._saveInterSiteTransfer();
                        this.$.setPageClean();
                        this.$.router.goTo('@sage/x3-stock/MobileIntersiteTransferDetails', {
                            _id: `${this.product.value?.product?.code}|${this.stockSite.value}`,
                            mobileSettings: JSON.stringify({ ...this._mobileSettings }),
                            stockSite: JSON.stringify({ code: this.stockSite.value }),
                            selectedProduct: response.edges[0].node,
                        });
                    }
                } else {
                    this.$.removeToasts();
                    this.$.showToast(
                        ui.localize(
                            '@sage/x3-stock/notification-error-interSite-change-invalid-site-destination-product',
                            "Product {{productCode}} doesn't exist on stock destination site {{siteCode}}",
                            {
                                productCode: this.product.value?.product?.code,
                                siteCode: this.siteDestination.value?.code,
                            },
                        ),
                        { type: 'warning' },
                    );
                    this.product.value = null;
                    await this.$.commitValueAndPropertyChanges();
                    this.product.focus();
                }
            }
        },
        columns: [
            ui.nestedFields.reference({
                bind: 'product',
                valueField: 'code',
                node: '@sage/x3-master-data/Product',
            }),
            ui.nestedFields.reference({
                bind: 'product',
                valueField: 'localizedDescription1',
                node: '@sage/x3-master-data/Product',
            }),
            ui.nestedFields.reference({
                bind: 'product',
                valueField: 'upc',
                node: '@sage/x3-master-data/Product',
            }),
        ],
    })
    product: ui.fields.Reference;

    // Product card

    @ui.decorators.block<MobileIntersiteTransfer>({
        parent() {
            return this.mainSection;
        },
        title: 'Products in progress',
        width: 'extra-large',
        isHidden: true,
    })
    intersiteTransferLinesBlock: ui.containers.Block;

    @ui.decorators.tableField<MobileIntersiteTransfer>({
        parent() {
            return this.intersiteTransferLinesBlock;
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
                    const _stockChangeLines = this.savedObject?.intersiteTransfer?.stockChangeLines;
                    _stockChangeLines?.splice(rowId, 1);

                    if (!_stockChangeLines || Number(_stockChangeLines.length) === 0) {
                        this._initStorage();
                        this.createButton.isDisabled = true;
                        this.$.router.goTo('@sage/x3-stock/MobileIntersiteTransfer');
                    } else {
                        this.intersiteTransferLines.value = this._mapIntersiteTransfer(_stockChangeLines);
                        this.intersiteTransferLines.title = this.intersiteTransferLines?.title?.replace(
                            /[0-9]/,
                            this.intersiteTransferLines.value.length.toString(),
                        );

                        // don't forget to update session storage or deleted lines will reappear if user refreshes the page
                        const values = getPageValuesNotTransient(this);
                        this.savedObject = {
                            ...this.savedObject,
                            intersiteTransfer: { ...this.savedObject.intersiteTransfer, ...values },
                        };
                        this._saveInterSiteTransfer();
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
    intersiteTransferLines: ui.fields.Table<any>;

    private async _init(): Promise<void> {
        await this._readSavedObject();
        await this._initSite();
        if (this.stockSite.value && this._mobileSettings.stockField1) {
            this._initTransaction();
            this._numberOfDecimalList = await getUnitNumberOfDecimalList(this);
            this._initStockChangeLines();
            this._postInitStockChangeLines();
        } else {
            this._disablePage();
        }
    }

    private _disablePage(): void {
        this.effectiveDate.isDisabled = true;
        this.transaction.isDisabled = true;
        this.siteDestination.isDisabled = true;
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
                    ui.localize(
                        '@sage/x3-stock/pages__mobile-internal_stock_change__mobile-stock_settings_error',
                        'Error',
                    ),
                    ui.localize(
                        '@sage/x3-stock/pages__mobile-you_need_to_select_stock_search_parameters_to_set_up_Mobile_Automation_FUNADCSEARCH_function',
                        'You need to select stock search parameters to set up Mobile Automation - FUNADCSEARCH function.',
                    ),
                );
            }
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
                                isLocationChange: true,
                                isStatusChange: true,
                                isUnitChange: true,
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
                                    stockChangeDestination: 'intersite',
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
                this.$.removeToasts();
                this.$.showToast(
                    ui.localize(
                        '@sage/x3-stock/notification-error-interSite-transaction-not-authorized',
                        'Transaction not authorized, cannot continue',
                    ),
                    { type: 'error' },
                );
            }
        } else {
            if (!this._transactions || this._transactions.length === 0) {
                this._disablePage();
                this.$.removeToasts();
                this.$.showToast(
                    ui.localize(
                        '@sage/x3-stock/notification-error-interSite-no-transaction',
                        'No transaction, cannot continue',
                    ),
                    { type: 'error' },
                );
            } else {
                transaction = this._transactions[0];
            }
        }
        hideTransaction = this._transactions.length <= 1;
        this._setTransaction(transaction, hideTransaction, false);
    }

    private _setTransaction(transaction: PartialStockTransaction, hideTransaction = false, disableProduct = true) {
        if (this._transactions) this.transaction.options = this._transactions?.map(trs => trs.code ?? '') ?? [];
        this.transaction.value = transaction.code ?? null;
        this.transaction.isHidden = hideTransaction;

        this.savedObject = {
            ...this.savedObject,
            selectedTransaction: transaction,
        };

        this.product.isDisabled = disableProduct;
    }

    private async _readSavedObject() {
        const storedString = this.$.storage.get('mobile-intersiteTransfer') as string;
        if (!storedString) {
            this._initStorage();
        } else {
            this.savedObject = JSON.parse(
                this.$.storage.get('mobile-intersiteTransfer') as string,
            ) as inputsIntersiteTransfer;
            if (!this._checkStorage()) {
                await this._reInitStorage();
            }
        }
    }

    /*
    storage functions
    */

    private _checkStorage() {
        if (!this.savedObject.intersiteTransfer.stockChangeLines) {
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
                '@sage/x3-stock/pages__mobile-intersite_transfer__notification__storage_error',
                `An error occurred loading the storage, the page will restart to cleanup`,
            ),
            'error',
        );
        this._initStorage();
        this.$.router.goTo('@sage/x3-stock/MobileIntersiteTransfer');
    }

    private _initStorage() {
        this.savedObject = {
            intersiteTransfer: {
                id: '',
                stockChangeLines: new Array<StockChangeLineInput>(),
            },
            currentLine: 0,
            username: this.$.userCode ?? '',
            started: false,
            selectedTransaction: {} as PartialStockTransaction,
            siteDestination: undefined,
        };
        this._saveInterSiteTransfer(this.savedObject);
    }

    private _saveInterSiteTransfer(data = this.savedObject) {
        this.$.storage.set('mobile-intersiteTransfer', JSON.stringify({ ...data }));
    }

    private _initStockChangeLines() {

        const  getUniqueValues = <T>(arr: T[], key: keyof T): any[] => {
            const values = arr.map(item => item[key]);
            return Array.from(new Set(values));
          }

        const _intersiteTransfer = this.savedObject?.intersiteTransfer;
        if (_intersiteTransfer) {
            if (_intersiteTransfer.stockChangeLines) {
                _intersiteTransfer.stockChangeLines.forEach(line => {
                    const sumQuantityInStockUnitInDetails = line?.stockDetails?.reduce((acc, item) => acc + (item['quantityInStockUnit'] as number), 0);
                    const stockUnitValues = getUniqueValues(line.stockDetails ?? [], 'stockUnit');
                    const hasMatchingInnerValues = _intersiteTransfer.stockChangeLines?.every(item => {
                        const outerValue = item.packingUnit;
                        const innerItems = item.stockDetails;
                        return innerItems?.every(innerItem => innerItem.packingUnit === outerValue);
                      });

                      if (!hasMatchingInnerValues) {
                        line.packingUnit = stockUnitValues[0];
                        line.quantityInPackingUnit = sumQuantityInStockUnitInDetails;
                        line.packingUnitToStockUnitConversionFactor = 1;


                    }
                });

                _intersiteTransfer.stockChangeLines = _intersiteTransfer.stockChangeLines.map(
                    (line: StockChangeLineInput) => {
                        return {
                            ...line,
                            quantityAndStockUnit: `${line.quantityInPackingUnit?.toString()} ${line.packingUnit}`,
                            stockSite: this.stockSite.value,
                        };
                    },
                );
            }

            if (_intersiteTransfer?.stockChangeLines && _intersiteTransfer.stockChangeLines.length > 0) {
                this.intersiteTransferLinesBlock.isHidden = false;
                this.intersiteTransferLines.value = _intersiteTransfer.stockChangeLines.map(line => ({
                    ...line,
                    _id: this.intersiteTransferLines.generateRecordId(),
                }));
                this.intersiteTransferLines.title = `${
                    this.intersiteTransferLines.title
                } ${this.intersiteTransferLines.value.length.toString()}`;
            }
        }
    }

    private _mapIntersiteTransfer(change: Partial<StockChangeLineInput>[]) {
        let rowCount = 0;
        return change.map((line: StockChangeLineInput) => {
            return {
                _id: String(rowCount++), // this defines the rowId parameter in dropdownActions onClick() event
                productDescription: line.productDescription,
                product: line.product,
                quantityAndStockUnit: `${Number(line.quantityInPackingUnit).toFixed(
                    getNumberOfDecimal(this._numberOfDecimalList, line.packingUnit),
                )} ${line.packingUnit}`,
                stockSite: this.stockSite.value,
            };
        });
    }

    private _postInitStockChangeLines() {
        if (this.savedObject.intersiteTransfer.effectiveDate) {
            this.effectiveDate.value = this.savedObject.intersiteTransfer.effectiveDate;
        } else {
            this.effectiveDate.value = DateValue.today().toString();
        }

        if (this.savedObject.siteDestination) {
            this.siteDestination.value = this.savedObject.siteDestination;
        }
        if ((this.savedObject?.intersiteTransfer?.stockChangeLines?.length ?? 0) > 0) {
            this.createButton.isDisabled = false;
            this.siteDestination.isReadOnly = true;
            this.transaction.isDisabled = true;
            this.product.focus();
            //to resynchronise the _id for the delete action
            this.intersiteTransferLines.value = this._mapIntersiteTransfer(
                this.savedObject?.intersiteTransfer?.stockChangeLines ?? [],
            );
        }
    }

    private _createValues() {
        const values = getPageValuesNotTransient(this);
        this.savedObject = {
            ...this.savedObject,
            intersiteTransfer: { ...this.savedObject.intersiteTransfer, ...values },
            started: true,
            selectedProduct: this.product.value?.product ?? undefined,
            siteDestination: this.siteDestination?.value ?? undefined,
            currentOperation: this._currentOperation,
        };
    }

    private async _fetchSiteDestination(currentProduct: string, siteDestination: string): Promise<ProductSite> {
        const response = this.$.graph
            .node('@sage/x3-master-data/ProductSite')
            .read(
                {
                    isLocationManaged: true,
                    isLicensePlateNumberManaged: true,
                    defaultInternalContainer: {
                        code: true,
                    },
                    stockSite: {
                        code: true,
                    },
                    product: {
                        code: true,
                        stockUnit: {
                            code: true,
                        },
                    },
                },
                `${currentProduct}|${siteDestination}`,
            )
            .execute();
        return response;
    }

    public prepareDataMutation(): StockChangeInput {
        const _transaction = this.savedObject?.selectedTransaction;
        const _intersiteTransfer = this.savedObject.intersiteTransfer;

        delete this.savedObject.intersiteTransfer.id;
        if (_transaction.stockAutomaticJournal) {
            _intersiteTransfer.stockAutomaticJournal = _transaction.stockAutomaticJournal.code;
        }
        if (_transaction.stockMovementCode) {
            _intersiteTransfer.stockMovementCode = _transaction.stockMovementCode.code;
        }
        if (_transaction.defaultStockMovementGroup) {
            _intersiteTransfer.stockMovementGroup = _transaction.defaultStockMovementGroup.code;
        }
        _intersiteTransfer.destination = !this.$.storage.get('mobile-label-destination')
            ? ''
            : String(this.$.storage.get('mobile-label-destination'));
        if (_transaction.code) {
            _intersiteTransfer.transaction = _transaction.code;
        }
        _intersiteTransfer.stockSite = this.stockSite?.value ?? '';
        _intersiteTransfer.effectiveDate = this.effectiveDate?.value ?? '';
        _intersiteTransfer.stockChangeLines = _intersiteTransfer.stockChangeLines?.map((line: any) => {
            delete line.quantityAndStockUnit;
            (line as any).lineNumber = Number(Math.floor(Math.random() * MAX_INT_32));
            return line;
        });
        _intersiteTransfer.stockChangeDestination = 'intersite';
        _intersiteTransfer.stockSiteDestination = this.savedObject.siteDestination?.code;

        return _intersiteTransfer;
    }

    private async _callCreationAPI(): Promise<any> {
        const _intersiteTransfer = this.prepareDataMutation();
        let result: any;

        try {
            result = await this.$.graph
                .node('@sage/x3-stock/StockChange')
                .mutations.intersiteTransfer(
                    {
                        id: true,
                    },
                    {
                        parameter: _intersiteTransfer,
                    },
                )
                .execute();
            if (!result) {
                throw Error(
                    ui.localize(
                        '@sage/x3-stock/pages__mobile-intersite_transfer__notification__no_create_results_error',
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
