import { Address, ProductInput, ProductSite, Supplier } from '@sage/x3-master-data-api';
import { UnitOfMeasure } from '@sage/x3-master-data-api-partial';
import { dialogConfirmation, dialogMessage } from '@sage/x3-master-data/lib/client-functions/dialogs';
import { getPageValuesNotTransient } from '@sage/x3-master-data/lib/client-functions/get-page-values-not-transient';
import { getSelectedStockSite } from '@sage/x3-master-data/lib/client-functions/get-selected-stock-site';
import { StockChangeInput, StockChangeLineInput, StockEntryTransaction } from '@sage/x3-stock-api';
import { Location, MobileSettings } from '@sage/x3-stock-data-api';
import { transfer } from '@sage/x3-stock-data/build/lib/menu-items/transfer';
import { ExtractEdgesPartial, extractEdges } from '@sage/xtrem-client';
import { DateValue } from '@sage/xtrem-date-time';
import { MAX_INT_32 } from '@sage/xtrem-shared';
import * as ui from '@sage/xtrem-ui';
import { NotifyAndWait } from '../client-functions/display';
import { getNumberOfDecimal, getUnitNumberOfDecimalList } from '../client-functions/get-unit-number-decimals';

type DeepPartial<T> = T extends Object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;
type PartialStockTransaction = DeepPartial<StockEntryTransaction>;

export type inputsSubcontractTransfer = {
    subcontractTransfer: StockChangeInput & {
        id?: string;
    };
    username: string;
    currentLine?: number;
    currentOperation?: number;
    started: boolean;
    selectedTransaction: PartialStockTransaction;
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

@ui.decorators.page<MobileSubcontractTransfer>({
    title: 'Subcontracting',
    mode: 'default',
    menuItem: transfer,
    priority: 200,
    authorizationCode: 'CWSSST',
    access: { node: '@sage/x3-stock/StockChange' },
    isTransient: false,
    isTitleHidden: true,
    skipDirtyCheck: true,
    async onLoad() {
        const returnFromDetail = this.$.queryParameters['ReturnFromDetail'] as string;
        returnFromDetail != 'yes'
            ? this.$.storage.remove('mobile-subcontractTransfer')
            : (this.transaction.isDisabled = true);
        this._currentOperation = 0;
        await this._init();
    },
    businessActions() {
        return [this.createButton];
    },
})
export class MobileSubcontractTransfer extends ui.Page {
    public savedObject: inputsSubcontractTransfer;
    private _transactions: PartialStockTransaction[];
    private _notifier = new NotifyAndWait(this);
    private _mobileSettings: MobileSettings;
    private _currentOperation: number;
    private _numberOfDecimalList: ExtractEdgesPartial<UnitOfMeasure>[];

    @ui.decorators.textField<MobileSubcontractTransfer>({
        isHidden: true,
    })
    stockSite: ui.fields.Text;

    @ui.decorators.pageAction<MobileSubcontractTransfer>({
        title: 'Create',
        buttonType: 'primary',
        shortcut: ['f2'],
        isDisabled: true,
        async onClick() {
            if (
                this.savedObject.subcontractTransfer?.stockChangeLines &&
                this.savedObject.subcontractTransfer?.stockChangeLines?.length > 0
            ) {
                this.prepareDataMutation();
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
                            '@sage/x3-stock/dialog-error-subcontract-transfer-creation',
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
                            `${message}`,
                            options,
                        )
                    ) {
                        await this.$.router.refresh();
                    } else {
                        this.$.storage.remove('mobile-subcontractTransfer');
                        await this.$.router.emptyPage();
                    }
                    return;
                } else {
                    const options: ui.dialogs.DialogOptions = {
                        acceptButton: {
                            text: ui.localize('@sage/x3-stock/button-accept-ok', 'OK'),
                        },
                    };
                    this.$.storage.remove('mobile-subcontractTransfer');
                    await this.$.sound.success();

                    await dialogMessage(
                        this,
                        'success',
                        ui.localize('@sage/x3-stock/dialog-success-title', 'Success'),
                        ui.localize(
                            '@sage/x3-stock/pages__mobile_subcontract_transfer__notification__creation_success',
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
                        '@sage/x3-stock/pages__mobile_subcontract_transfer__notification__no_products_error',
                        `Enter at least one product.`,
                    ),
                    'error',
                );
            }
        },
    })
    createButton: ui.PageAction;

    @ui.decorators.section<MobileSubcontractTransfer>({
        isTitleHidden: true,
    })
    mainSection: ui.containers.Section;

    // First Block Date & Site

    @ui.decorators.block<MobileSubcontractTransfer>({
        parent() {
            return this.mainSection;
        },
        width: 'extra-large',
        isTitleHidden: true,
    })
    firstLineBlock: ui.containers.Block;

    @ui.decorators.dateField<MobileSubcontractTransfer>({
        parent() {
            return this.firstLineBlock;
        },
        title: 'Transfer date',
        isMandatory: true,
        width: 'small',
        maxDate: DateValue.today().toString(),
        onChange() {
            const values = getPageValuesNotTransient(this);
            this.savedObject = {
                ...this.savedObject,
                subcontractTransfer: { ...this.savedObject.subcontractTransfer, ...values },
            };
            this._saveSubcontractTransfer();
        },
    })
    effectiveDate: ui.fields.Date;

    @ui.decorators.dropdownListField<MobileSubcontractTransfer>({
        parent() {
            return this.firstLineBlock;
        },
        title: 'Transaction',
        //options: ['TRF'],
        isTransient: true,
        onChange() {
            if (this.transaction.value) {
                if (this.transaction.value.search(':') !== 0) {
                    const selectedTransaction = this.transaction.value.split(':');
                    this.transaction.value = selectedTransaction[0];
                }
                const transaction = this._transactions.find(trs => trs.code === this.transaction.value) ?? undefined;
                if (transaction) {
                    this._setTransaction(transaction, false);
                }
                this.subcontractor.focus();
            } else {
                this.product.isDisabled = true;
            }
        },
        isMandatory: true,
    })
    transaction: ui.fields.DropdownList;

    // Second block - Subcontractor & Address

    @ui.decorators.block<MobileSubcontractTransfer>({
        parent() {
            return this.mainSection;
        },
        width: 'extra-large',
        isTitleHidden: true,
    })
    secondBlock: ui.containers.Block;

    @ui.decorators.referenceField<MobileSubcontractTransfer, Supplier>({
        parent() {
            return this.secondBlock;
        },
        title: 'Subcontractor',
        node: '@sage/x3-master-data/Supplier',
        valueField: '_id', // { code: { code: true } },
        placeholder: 'Scan or select…',
        isTransient: true,
        isMandatory: true,
        canFilter: false,
        isAutoSelectEnabled: true,
        // shouldSuggestionsIncludeColumns: true,
        filter() {
            return {
                isActive: { _eq: true },
            };
        },
        columns: [
            ui.nestedFields.text({
                bind: '_id',
                title: 'code',
            }),
            ui.nestedFields.text({
                bind: 'shortCompanyName',
                canFilter: false,
            }),
        ],
        async onChange() {
            if (this.subcontractor.value) {
                try {
                    this.subcontractor.value = (await this._getSubcontractor(this.subcontractor.value._id)) ?? null;
                    this.subcontractorAddress.value = {
                        _id: this.subcontractor.value?._id,
                        code: this.subcontractor.value?.addressByDefault?.code,
                    };
                    this.subcontractorAddress.isDisabled = false;
                    const selectedSubContractLocation = await this._getSubContractLocation();
                    this._manageSubcontractorFields(selectedSubContractLocation);
                } catch (e) {
                    await dialogMessage(
                        this,
                        'error',
                        ui.localize('@sage/x3-stock/error-loading-address', 'Error loading address'),
                        String(e),
                    );
                }
            } else {
                this.subcontractorAddress.value = null;
                this.subcontractorAddress.isDisabled = true;
                this.subcontractLocation.value = null;
                this.subcontractLocation.isDisabled = true;
                this.subcontractLocationDummy.value = null;
                this.product.isDisabled = true;
            }
        },
    })
    subcontractor: ui.fields.Reference;

    @ui.decorators.textField<MobileSubcontractTransfer>({
        parent() {
            return this.secondBlock;
        },
        title: 'Subcontractor',
        isHidden: true,
        isDisabled: true,
        isTransient: true,
    })
    subcontractorDummy: ui.fields.Text;

    @ui.decorators.referenceField<MobileSubcontractTransfer, Address>({
        parent() {
            return this.secondBlock;
        },
        title: 'Address',
        node: '@sage/x3-master-data/Address',
        valueField: 'code',
        placeholder: 'Scan or select…',
        isMandatory: true,
        minLookupCharacters: 1,
        isTransient: true,
        isDisabled: true,
        canFilter: false,
        isAutoSelectEnabled: true,
        filter() {
            const locationFilter: any = {
                entityNumber: this.subcontractor?.value?.code?.code,
                entityType: 'businessPartner',
            };
            if (this.subcontractor.value) {
                return locationFilter;
            }
        },
        async onChange() {
            if (this.subcontractorAddress.value) {
                const selectedSubContractLocation = await this._getSubContractLocation();
                this._manageSubcontractorFields(selectedSubContractLocation);
                this.subcontractorAddress.getNextField(true)?.focus();
            } else {
                this.subcontractLocation.value = null;
                this.subcontractLocation.isDisabled = true;
                this.subcontractLocationDummy.value = null;
                this.product.isDisabled = true;
            }
        },
        columns: [
            ui.nestedFields.text({
                bind: 'code',
            }),
            ui.nestedFields.text({
                bind: 'description',
            }),
        ],
    })
    subcontractorAddress: ui.fields.Reference;

    @ui.decorators.textField<MobileSubcontractTransfer>({
        parent() {
            return this.secondBlock;
        },
        title: 'Address',
        isHidden: true,
        isDisabled: true,
        isTransient: true,
    })
    subcontractorAddressDummy: ui.fields.Text;

    @ui.decorators.referenceField<MobileSubcontractTransfer, Location>({
        parent() {
            return this.secondBlock;
        },
        title: 'Subcontract location',
        node: '@sage/x3-stock-data/Location',
        valueField: 'code',
        placeholder: 'Scan or select…',
        isMandatory: true,
        isFullWidth: true,
        canFilter: false,
        filter() {
            const locationFilter: any = {
                stockSite: { code: this.stockSite.value },
                category: { _eq: 'subcontract' },
            };
            return locationFilter;
        },
        isHidden: true,
        isDisabled: false,
        async onChange() {
            if (this.subcontractLocation.value) {
                this.product.isDisabled = false;
                this.product.focus();
            } else {
                this.product.isDisabled = true;
            }
        },
    })
    subcontractLocation: ui.fields.Reference;

    @ui.decorators.textField<MobileSubcontractTransfer>({
        parent() {
            return this.secondBlock;
        },
        title: 'Subcontract location',
        isFullWidth: true,
        isHidden: false,
        isDisabled: true,
        isTransient: true,
    })
    subcontractLocationDummy: ui.fields.Text;

    // Fourth Block - Product

    @ui.decorators.block<MobileSubcontractTransfer>({
        parent() {
            return this.mainSection;
        },
        width: 'extra-large',
        isTitleHidden: true,
    })
    fourthBlock: ui.containers.Block;

    @ui.decorators.referenceField<MobileSubcontractTransfer, ProductSite>({
        parent() {
            return this.secondBlock;
        },
        title: 'Product',
        node: '@sage/x3-master-data/ProductSite',
        valueField: { product: { code: true } },
        helperTextField: { product: { upc: true } },
        placeholder: 'Scan or select...',
        isMandatory: true,
        isDisabled: true,
        isTransient: true,
        canFilter: false,
        isAutoSelectEnabled: true,
        isFullWidth: true,
        shouldSuggestionsIncludeColumns: true,
        filter() {
            return {
                product: {
                    productStatus: { _ne: 'notUsable' },
                    stockManagementMode: { _ne: 'notManaged' },
                },
                stockSite: { code: this.stockSite.value ?? '' },
                isLocationManaged: true,
            };
        },
        async onChange() {
            if (this.product?.value?.product?.code) {
                if (this.product?.value?.isBeingCounted === true) {
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
                        this._saveSubcontractTransfer();
                        this.$.setPageClean();
                        this.$.router.goTo('@sage/x3-stock/MobileSubcontractTransferDetails', {
                            _id: `${this.product.value?.product?.code}|${this.stockSite.value}`,
                            mobileSettings: JSON.stringify({ ...this._mobileSettings }),
                            stockSite: JSON.stringify({ code: this.stockSite.value }),
                            selectedProduct: JSON.stringify(this.product?.value),
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
                    this._saveSubcontractTransfer();
                    this.$.setPageClean();
                    this.$.router.goTo('@sage/x3-stock/MobileSubcontractTransferDetails', {
                        _id: `${this.product.value?.product?.code}|${this.stockSite.value}`,
                        mobileSettings: JSON.stringify({ ...this._mobileSettings }),
                        stockSite: JSON.stringify({ code: this.stockSite.value }),
                        selectedProduct: JSON.stringify(this.product?.value),
                    });
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
            ui.nestedFields.text({
                bind: { product: { serialNumberManagementMode: true } },
                isHidden: true,
            }),
            ui.nestedFields.technical({
                bind: 'isBeingCounted',
            }),
        ],
    })
    product: ui.fields.Reference;

    @ui.decorators.block<MobileSubcontractTransfer>({
        parent() {
            return this.mainSection;
        },
        title: 'Products in progress',
        width: 'extra-large',
        isHidden: true,
    })
    subcontractTransferLinesBlock: ui.containers.Block;

    @ui.decorators.tableField<MobileSubcontractTransfer>({
        parent() {
            return this.subcontractTransferLinesBlock;
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
                    const _stockChangeLines = this.savedObject?.subcontractTransfer?.stockChangeLines;
                    _stockChangeLines?.splice(rowId, 1);

                    if (!_stockChangeLines || Number(_stockChangeLines.length) === 0) {
                        this._initStorage();
                        this.createButton.isDisabled = true;
                        this.$.router.goTo('@sage/x3-stock/MobileSubcontractTransfer');
                    } else {
                        this.subcontractTransferLines.value = this._mapSubcontractTransfer(_stockChangeLines);
                        this.subcontractTransferLines.title = this.subcontractTransferLines.title?.replace(
                            /[0-9]/,
                            this.subcontractTransferLines.value.length.toString(),
                        );

                        // don't forget to update session storage or deleted lines will reappear if user refreshes the page
                        const values = getPageValuesNotTransient(this);
                        this.savedObject = {
                            ...this.savedObject,
                            subcontractTransfer: { ...this.savedObject.subcontractTransfer, ...values },
                        };
                        this._saveSubcontractTransfer();
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
    subcontractTransferLines: ui.fields.Table<any>;

    private async _init(): Promise<void> {
        await this._readSavedObject();
        await this._initSite();

        if (this.stockSite.value && this._mobileSettings.stockField1) {
            this._initDestination();
            this._initTransaction();
            this._numberOfDecimalList = await getUnitNumberOfDecimalList(this);
            this._initSubcontractor();
            this._initStockChangeLines();
            this._postInitStockChangeLines();
        } else {
            this._disablePage();
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
            this._mobileSettings = JSON.parse(this.$.storage.get('mobile-settings-stock-change') as string);

            if (!this._mobileSettings.stockField1) {
                dialogMessage(
                    this,
                    'error',
                    ui.localize(
                        '@sage/x3-stock/pages__mobile_internal_stock_change__mobile_stock_settings_error',
                        'Error',
                    ),
                    ui.localize(
                        '@sage/x3-stock/pages__mobile_you_need_to_select_stock_search_parameters_to_set_up_Mobile_Automation_FUNADCSEARCH_function',
                        'You need to select stock search parameters to set up Mobile Automation - FUNADCSEARCH function.',
                    ),
                );
            }
        }
    }

    private _initDestination() {
        const destination = this.$.storage.get('mobile-label-destination') as string;
        if (destination) {
            this.savedObject.destination = destination;
        }
    }

    private _disablePage(): void {
        this.effectiveDate.isDisabled = true;
        this.transaction.isDisabled = true;
        this.subcontractor.isDisabled = true;
        this.product.isDisabled = true;
    }

    private async _initSubcontractor() {
        let disableField = this.savedObject.started;
        if (this.savedObject.subcontractTransfer.subcontractor) {
            this.subcontractorDummy.isHidden = false;
            this.subcontractorDummy.value = this.savedObject.subcontractTransfer.subcontractor;
            this.subcontractor.isHidden = true;
            this.subcontractor.isDisabled = disableField;
        }
        if (this.savedObject.subcontractTransfer.subcontractorAddress) {
            this.subcontractorAddressDummy.isHidden = false;
            this.subcontractorAddressDummy.value = this.savedObject.subcontractTransfer.subcontractorAddress;
            this.subcontractorAddress.isHidden = true;
            this.subcontractorAddress.isDisabled = disableField;
        }
        if (this.savedObject.subcontractTransfer.subcontractLocation) {
            this.subcontractLocationDummy.value = this.savedObject.subcontractTransfer.subcontractLocation;
            this.subcontractLocation.isHidden = true;
            this.subcontractLocationDummy.isDisabled = disableField;
            this.product.isDisabled = false;
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
                                    stockChangeDestination: 'subcontractTransfer',
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
                this.effectiveDate.isDisabled = true;
                this.transaction.isDisabled = true;
                this.product.isDisabled = true;
                this.subcontractor.isDisabled = true;
                throw new Error('Transaction not authorized, cannot continue');
            }
        } else {
            if (!this._transactions || this._transactions.length === 0) {
                this.effectiveDate.isDisabled = true;
                this.transaction.isDisabled = true;
                this.product.isDisabled = true;
                this.subcontractor.isDisabled = true;
                throw new Error('No transaction, cannot continue');
            } else {
                transaction = this._transactions[0];
                this.transaction.isDisabled = false;
            }
        }
        hideTransaction = this._transactions.length <= 1;
        this._setTransaction(transaction, hideTransaction);
    }

    private _setTransaction(transaction: PartialStockTransaction, hideTransaction = false) {
        if (this._transactions) this.transaction.options = this._transactions?.map(trs => trs.code ?? '') ?? [];
        this.transaction.value = transaction.code ?? null;
        this.transaction.isHidden = hideTransaction;

        this.savedObject = {
            ...this.savedObject,
            selectedTransaction: transaction,
        };
    }
    private async _readSavedObject() {
        const storedString = this.$.storage.get('mobile-subcontractTransfer') as string;

        if (!storedString) {
            this._initStorage();
        } else {
            this.savedObject = JSON.parse(
                this.$.storage.get('mobile-subcontractTransfer') as string,
            ) as inputsSubcontractTransfer;

            if (!this._checkStorage()) {
                await this._reInitStorage();
            }
        }
    }

    /*
    storage functions
    */

    private _checkStorage() {
        if (!this.savedObject.subcontractTransfer.stockChangeLines) {
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
                '@sage/x3-stock/pages__mobile_subcontract_transfer__notification__storage_error',
                `An error occurred loading the storage, the page will restart to cleanup`,
            ),
            'error',
        );
        this._initStorage();
        this.$.router.goTo('@sage/x3-stock/MobileSubcontractTransfer');
    }

    private _initStorage() {
        this.savedObject = {
            subcontractTransfer: {
                id: '',
                stockChangeLines: new Array<StockChangeLineInput>(),
            },
            currentLine: 0,
            username: this.$.userCode ?? '',
            started: false,
            selectedTransaction: {} as PartialStockTransaction,
        };
        this._saveSubcontractTransfer(this.savedObject);
    }

    private _saveSubcontractTransfer(data = this.savedObject) {
        this.$.storage.set('mobile-subcontractTransfer', JSON.stringify({ ...data }));
    }
    private _initStockChangeLines() {
        const _subcontractTransfer = this.savedObject?.subcontractTransfer;
        if (_subcontractTransfer) {
            if (_subcontractTransfer.stockChangeLines) {
                _subcontractTransfer.stockChangeLines = _subcontractTransfer.stockChangeLines.map(
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

            if (_subcontractTransfer.stockChangeLines && _subcontractTransfer.stockChangeLines.length > 0) {
                this.subcontractTransferLinesBlock.isHidden = false;
                this.subcontractTransferLines.value = _subcontractTransfer.stockChangeLines.map(line => ({
                    ...line,
                    _id: this.subcontractTransferLines.generateRecordId(),
                }));
                this.subcontractTransferLines.title = `${
                    this.subcontractTransferLines.title
                } ${this.subcontractTransferLines.value.length.toString()} `;
            }
        }
    }

    private _mapSubcontractTransfer(change: Partial<StockChangeLineInput>[]) {
        let rowCount = 0;
        return change.map((line: StockChangeLineInput) => {
            return {
                _id: String(rowCount++),
                productDescription: line.productDescription,
                product: line.product,
                quantityAndStockUnit: `${Number(line.quantityInPackingUnitDestination).toFixed(
                    getNumberOfDecimal(this._numberOfDecimalList, line.packingUnitDestination),
                )} ${line.packingUnitDestination}`,
                stockSite: this.stockSite.value,
            };
        });
    }

    private _postInitStockChangeLines() {
        if (this.savedObject.subcontractTransfer.effectiveDate) {
            this.effectiveDate.value = this.savedObject.subcontractTransfer.effectiveDate;
        } else {
            this.effectiveDate.value = DateValue.today().toString();
        }

        if (
            this.savedObject.subcontractTransfer.stockChangeLines &&
            this.savedObject.subcontractTransfer.stockChangeLines.length > 0
        ) {
            this.createButton.isDisabled = false;
            this.subcontractTransferLines.value = this._mapSubcontractTransfer(
                this.savedObject.subcontractTransfer.stockChangeLines ?? [],
            );
        }
    }
    public prepareDataMutation() {
        const _transaction = this.savedObject?.selectedTransaction;
        const _subcontractTransfer = this.savedObject.subcontractTransfer;

        delete _subcontractTransfer.id;

        if (_transaction.stockAutomaticJournal) {
            _subcontractTransfer.stockAutomaticJournal = _transaction.stockAutomaticJournal.code;
        }
        if (_transaction.stockMovementCode) {
            _subcontractTransfer.stockMovementCode = _transaction.stockMovementCode.code;
        }
        if (_transaction.defaultStockMovementGroup) {
            _subcontractTransfer.stockMovementGroup = _transaction.defaultStockMovementGroup.code;
        }
        _subcontractTransfer.stockChangeDestination = 'subcontractTransfer';

        _subcontractTransfer.stockChangeLines = _subcontractTransfer.stockChangeLines?.map((line: any) => {
            delete line.stockSite;
            delete line.quantityAndStockUnit;
            (line as any).lineNumber = Number(Math.floor(Math.random() * MAX_INT_32));
            return line;
        });
        if (this.savedObject.destination) {
            _subcontractTransfer.destination = this.savedObject.destination;
        }
        if (_transaction.printingMode) {
            _subcontractTransfer.printingMode = String(
                PrintingModeEnum[this.savedObject.selectedTransaction.printingMode],
            );
        }
        if (this.subcontractor.value?.code) {
            _subcontractTransfer.subcontractor = this.subcontractor.value.code;
        }
        if (this.subcontractLocation.value?.code) {
            _subcontractTransfer.subcontractLocation = this.subcontractLocation.value.code;
        }
        if (this.subcontractLocationDummy.value) {
            _subcontractTransfer.subcontractLocation = this.subcontractLocationDummy.value;
        }
        return _subcontractTransfer;
    }

    private async _callCreationAPI(): Promise<any> {
        const _subcontractTransfer = this.prepareDataMutation();
        let result: any;

        try {
            result = await this.$.graph
                .node('@sage/x3-stock/StockChange')
                .mutations.subcontractTransfer(
                    {
                        id: true,
                    },
                    {
                        parameter: _subcontractTransfer,
                    },
                )
                .execute();
            if (!result) {
                throw Error(
                    ui.localize(
                        '@sage/x3-stock/pages__mobile-subcontrat_transfer__notification__no_create_results_error',
                        'No results received for the creation',
                    ),
                );
            }
        } catch (error) {
            return error;
        }
        return result;
    }

    private async _getSubcontractor(_id: string): Promise<Supplier | undefined> {
        try {
            const selectedSupplier = await this.$.graph
                .node('@sage/x3-master-data/Supplier')
                .read(
                    {
                        code: {
                            code: true,
                        },
                        shortCompanyName: true,
                        addressByDefault: {
                            code: true,
                        },
                        _id: true,
                    },
                    `${_id}`,
                )
                .execute();
            return selectedSupplier;
        } catch (e) {
            await dialogMessage(
                this,
                'error',
                ui.localize('@sage/x3-stock/error-loading-supplier', 'Error loading supplier'),
                String(e),
            );
            return undefined;
        }
    }

    private async _getSubContractLocation(): Promise<string | undefined> {
        try {
            const selectedCustomer = await this.$.graph
                .node('@sage/x3-master-data/ShipToCustomerAddress')
                .read(
                    {
                        subcontractLocation: { code: true },
                    },
                    `${this.subcontractor.value?.code?.code}|${this.subcontractorAddress.value?.code}`,
                )
                .execute();

            if (selectedCustomer && selectedCustomer.subcontractLocation) {
                const location = await this.$.graph
                    .node('@sage/x3-stock-data/Location')
                    .read(
                        {
                            code: true,
                        },
                        `${this.stockSite.value}|${selectedCustomer.subcontractLocation.code}`,
                    )
                    .execute();
                if (location) return selectedCustomer.subcontractLocation.code;
                else {
                    await this._notifier.showAndWait(
                        ui.localize(
                            '@sage/x3-stock/pages__mobile_subcontract_transfer__notification__site_location_error',
                            '{{location}}: location not created for the site {{site}}',
                            { location: selectedCustomer.subcontractLocation.code, site: this.stockSite.value },
                        ),
                        'error',
                    );
                }
            } else {
                return this._getSubContractLocationFromSupplier();
            }
        } catch (e) {
            return this._getSubContractLocationFromSupplier();
        }
    }
    private async _getSubContractLocationFromSupplier(): Promise<string | undefined> {
        try {
            const selectedSupplier = await this.$.graph
                .node('@sage/x3-master-data/Supplier')
                .read(
                    {
                        location: true,
                    },
                    `${this.subcontractor.value?.code?.code}`,
                )
                .execute();
            if (selectedSupplier.location) {
                const location = await this.$.graph
                    .node('@sage/x3-stock-data/Location')
                    .read(
                        {
                            code: true,
                        },
                        `${this.stockSite.value}|${selectedSupplier.location}`,
                    )
                    .execute();
                if (location) return selectedSupplier.location;
                else {
                    await this._notifier.showAndWait(
                        ui.localize(
                            '@sage/x3-stock/pages__mobile_subcontract_transfer__notification__site_location_error',
                            '{{location}}: location not created for the site {{site}}',
                            { location: selectedSupplier.location, site: this.stockSite.value },
                        ),
                        'error',
                    );
                }
            } else {
                return undefined;
            }
        } catch (e) {
            await dialogMessage(
                this,
                'error',
                ui.localize('@sage/x3-stock/error-loading-supplier', 'Error loading supplier'),
                String(e),
            );
            return '';
        }
    }
    private _createValues() {
        const values = getPageValuesNotTransient(this);

        if (this.subcontractor.value?.code) {
            values.subcontractor = this.subcontractor.value.code.code;
        }
        if (this.subcontractorDummy.value) {
            values.subcontractor = this.subcontractorDummy.value;
        }
        if (this.subcontractorAddress.value?.code) {
            values.subcontractorAddress = this.subcontractorAddress.value.code;
        }
        if (this.subcontractorAddressDummy.value) {
            values.subcontractorAddress = this.subcontractorAddressDummy.value;
        }
        if (this.subcontractLocation.value?.code) {
            values.subcontractLocation = this.subcontractLocation.value.code;
        }
        if (this.subcontractLocationDummy.value) {
            values.subcontractLocation = this.subcontractLocationDummy.value;
        }

        this.savedObject = {
            ...this.savedObject,
            subcontractTransfer: { ...this.savedObject.subcontractTransfer, ...values },
            started: true,
            selectedProduct: this.product.value?.product ?? undefined,
            currentOperation: this._currentOperation,
        };
    }
    private async _manageSubcontractorFields(selectedSubContractLocation: string | undefined) {
        if (selectedSubContractLocation) {
            this.subcontractLocationDummy.value = selectedSubContractLocation;
            this.subcontractLocationDummy.isHidden = false;
            this.subcontractLocationDummy.isDisabled = true;
            this.subcontractLocation.isHidden = true;
            this.product.isDisabled = false;
            this.product.focus();
        } else {
            this.subcontractLocationDummy.value = null;
            this.subcontractLocationDummy.isHidden = true;
            this.subcontractLocation.value = null;
            this.subcontractLocation.isHidden = false;
            this.subcontractLocation.isDisabled = false;
            this.product.isDisabled = true;
            this.subcontractLocation.focus();
        }
        await this.$.commitValueAndPropertyChanges();
    }
}
