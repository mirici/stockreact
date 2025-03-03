import { UnitOfMeasure } from '@sage/x3-master-data-api-partial';
import { dialogConfirmation, dialogMessage } from '@sage/x3-master-data/lib/client-functions/dialogs';
import { getPageValuesNotTransient } from '@sage/x3-master-data/lib/client-functions/get-page-values-not-transient';
import { getSelectedStockSite } from '@sage/x3-master-data/lib/client-functions/get-selected-stock-site';
import { onGoto } from '@sage/x3-master-data/lib/client-functions/on-goto';
import { GraphApi, StockChangeInput, StockChangeLineInput, StockEntryTransaction } from '@sage/x3-stock-api';
import { stockByIdentifier } from '@sage/x3-stock-data/build/lib/menu-items/stock-identifier';
import { Site, SiteInput } from '@sage/x3-system-api';
import { Dict, ExtractEdgesPartial, extractEdges } from '@sage/xtrem-client';
import { DateValue } from '@sage/xtrem-date-time';
import { MAX_INT_32 } from '@sage/xtrem-shared';
import * as ui from '@sage/xtrem-ui';
import { NotifyAndWait } from '../client-functions/display';
import { getNumberOfDecimal, getUnitNumberOfDecimalList } from '../client-functions/get-unit-number-decimals';
import {
    checkIdentifierField,
    optionsIdentifier,
} from '../client-functions/stock-change-by-identifier-details-control';

type DeepPartial<T> = T extends Object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;
type PartialStockEntryTransaction = DeepPartial<StockEntryTransaction>;

export type inputsIntersiteTransfer = {
    intersiteTransfer: StockChangeInput & {
        id?: string;
    };
    username: string;
    started: boolean;
    selectedTransaction?: PartialStockEntryTransaction;
    destination?: string;
    printingMode?: string;
    selectedIdentifier?: string;
    selectedIdentifierValues?: string;
    siteDestination?: SiteInput;
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

@ui.decorators.page<MobileIntersiteTransferByIdentifier>({
    title: 'Intersite transfer',
    subtitle: 'Select by identifier',
    mode: 'default',
    menuItem: stockByIdentifier,
    priority: 200,
    isTransient: false,
    isTitleHidden: true,
    authorizationCode: 'CWSBSIS',
    access: { node: '@sage/x3-stock/StockChange' },
    skipDirtyCheck: true,
    async onLoad() {
        this.siteDestination.isDisabled = false;
        const returnFromDetail = this.$.queryParameters['ReturnFromDetail'] as string;
        if (returnFromDetail === 'yes') {
            this._disablePage();
        } else {
            this.$.storage.remove('mobile-intersiteTransferByIdentifier');
        }
        if (!(await this._init())) {
            this._disablePage();
        }
    },
    businessActions() {
        return [this.createButton, this.nextButton];
    },
})
export class MobileIntersiteTransferByIdentifier extends ui.Page<GraphApi> {

    /*
     *  Technical properties
     */

    public savedObject: inputsIntersiteTransfer;
    private _transactions: PartialStockEntryTransaction[];
    private _notifier = new NotifyAndWait(this);
    private _numberOfDecimalList: ExtractEdgesPartial<UnitOfMeasure>[];

    /*
     *  Technical fields
     */

    @ui.decorators.textField<MobileIntersiteTransferByIdentifier>({
        isHidden: true,
    })
    stockSite: ui.fields.Text;

    /*
     *  Page Actions
     */

    @ui.decorators.pageAction<MobileIntersiteTransferByIdentifier>({
        title: 'Create',
        buttonType: 'primary',
        isHidden: true,
        shortcut: ['f2'],
        async onClick() {
            if (this.savedObject.intersiteTransfer?.stockChangeLines?.length) {
                this.$.loader.isHidden = false;
                const result = await this._callCreationAPI();
                this.$.loader.isHidden = true;

                if (!result || result instanceof Error) {
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
                            '@sage/x3-stock/pages__mobile_intersite_transfer_by_identifier__notification__creation_error',
                            'An error has occurred',
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
                        this.$.storage.remove('mobile-intersiteTransferByIdentifier');
                        await this.$.router.emptyPage();
                    }
                } else {
                    const options: ui.dialogs.DialogOptions = {
                        acceptButton: {
                            text: ui.localize('@sage/x3-stock/button-accept-ok', 'OK'),
                        },
                    };
                    this.$.storage.remove('mobile-intersiteTransferByIdentifier');
                    await this.$.sound.success();

                    await dialogMessage(
                        this,
                        'success',
                        ui.localize('@sage/x3-stock/dialog-success-title', 'Success'),
                        ui.localize(
                            '@sage/x3-stock/pages__mobile_intersite_transfer_by_identifier__notification__creation_success',
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
                        '@sage/x3-stock/pages__mobile_intersite_transfer_by_identifier__notification__no_products_error',
                        `Select at least one stock line.`,
                    ),
                    'error',
                );
            }
        },
    })
    createButton: ui.PageAction;

    @ui.decorators.pageAction<MobileIntersiteTransferByIdentifier>({
        title: 'Next',
        buttonType: 'primary',
        isHidden: false,
        isDisabled: true,
        async onClick() {
            if (this.identifier.value) {
                this.goToDetailsPage();
            } else {
                await dialogMessage(
                    this,
                    'error',
                    ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                    ui.localize(
                        '@sage/x3-stock/pages__mobile_intersite_transfer_by_identifier__notification__no_identifier_error',
                        `Enter at least one identifier.`,
                    ),
                );
            }
        },
    })
    nextButton: ui.PageAction;

    @ui.decorators.section<MobileIntersiteTransferByIdentifier>({
        isTitleHidden: true,
    })
    mainSection: ui.containers.Section;

    @ui.decorators.block<MobileIntersiteTransferByIdentifier>({
        parent() {
            return this.mainSection;
        },
        width: 'extra-large',
        isTitleHidden: true,
    })
    transactionBlock: ui.containers.Block;

    @ui.decorators.dateField<MobileIntersiteTransferByIdentifier>({
        parent() {
            return this.transactionBlock;
        },
        title: 'Change date',
        isMandatory: true,
        width: 'small',
        isDisabled: false,
        maxDate: DateValue.today().toString(),
        onChange() {},
    })
    effectiveDate: ui.fields.Date;

    @ui.decorators.dropdownListField<MobileIntersiteTransferByIdentifier>({
        parent() {
            return this.transactionBlock;
        },
        title: 'Transaction',
        isTransient: true,
        async onChange() {
            if (this.transaction.value) {
                const transaction = this._transactions.find(trs => trs.code === this.transaction.value);
                if (transaction) {
                    this._setTransaction(transaction, false, false);
                }
                await this.$.commitValueAndPropertyChanges();
            } else {
                this.identifier.isDisabled = true;
            }
        },
    })
    transaction: ui.fields.DropdownList;

    @ui.decorators.block<MobileIntersiteTransferByIdentifier>({
        parent() {
            return this.mainSection;
        },
        width: 'extra-large',
        isTitleHidden: true,
    })
    identifierBlock: ui.containers.Block;

    @ui.decorators.dropdownListField<MobileIntersiteTransferByIdentifier>({
        parent() {
            return this.identifierBlock;
        },
        title: 'Stock filters',
        optionType: '@sage/x3-stock/StockIdentifierSelection',
        options: optionsIdentifier,
        isSortedAlphabetically: false,
        isTransient: true,
        width: 'medium',
        async onChange() {
            if (this.identifier.value) {
                this.siteDestination.isDisabled = false;
                this.siteDestination.focus();
            }
        },
    })
    identifier: ui.fields.DropdownList;

    @ui.decorators.referenceField<MobileIntersiteTransferByIdentifier, Site>({
        parent() {
            return this.identifierBlock;
        },
        title: 'Destination site',
        node: '@sage/x3-system/Site',
        valueField: 'code',
        helperTextField: { name: true },
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
                this.nextButton.isDisabled = false;
            } else {
                this.nextButton.isDisabled = true;
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

    @ui.decorators.block<MobileIntersiteTransferByIdentifier>({
        parent() {
            return this.mainSection;
        },
        title: 'Stock lines',
        width: 'extra-large',
        isHidden: true,
    })
    stockChangeLinesBlock: ui.containers.Block;

    @ui.decorators.tableField<MobileIntersiteTransferByIdentifier>({
        parent() {
            return this.stockChangeLinesBlock;
        },
        title: 'Stock lines',
        isChangeIndicatorDisabled: false,
        canFilter: false,
        canSelect: false,
        canExport: false,
        canResizeColumns: false,
        canUserHideColumns: false,
        isTitleHidden: true,
        isTransient: false,
        isFullWidth: true,
        isDisabled: false,
        hasSearchBoxMobile: false,
        cardView: true,
        displayMode: ui.fields.TableDisplayMode.compact,
        mobileCard: undefined,
        orderBy: {
            stockSite: 1,
            stockId: 1,
        },
        columns: [
            ui.nestedFields.text({
                bind: 'product',
                title: 'Product',
                isHidden(value: any, _rowValue?: Dict<any>) {
                    return !checkIdentifierField('product', this.identifier?.value);
                },
            }),
            ui.nestedFields.text({
                bind: 'location',
                title: 'Location',
                isHidden(value: any, _rowValue?: Dict<any>) {
                    return !value || !checkIdentifierField('location', this.identifier?.value);
                },
            }),
            ui.nestedFields.text({
                bind: 'lot',
                title: 'Lot',
                isHidden(value: any, _rowValue?: Dict<any>) {
                    return !checkIdentifierField('lot', this.identifier?.value);
                },
            }),
            ui.nestedFields.text({
                bind: 'sublot',
                title: 'Sublot',
                isHidden(value: any, _rowValue?: Dict<any>) {
                    return !checkIdentifierField('sublot', this.identifier?.value);
                },
            }),
            ui.nestedFields.text({
                bind: 'serialNumber',
                title: 'Serial number',
                isHidden(value: any, _rowValue?: Dict<any>) {
                    return !checkIdentifierField('serial number', this.identifier?.value);
                },
            }),
            ui.nestedFields.text({
                bind: 'licensePlateNumber',
                title: 'License plate number',
                isHidden(value: any, _rowValue?: Dict<any>) {
                    return !checkIdentifierField('license plate number', this.identifier?.value);
                },
            }),
            ui.nestedFields.text({
                bind: 'identifier1Destination',
                title: 'Identifier 1',
                isHidden(value: any, _rowValue?: Dict<any>) {
                    return !checkIdentifierField('identifier1', this.identifier?.value);
                },
            }),
            ui.nestedFields.text({
                bind: 'identifier2Destination',
                title: 'Identifier 2',
                isHidden(value: any, _rowValue?: Dict<any>) {
                    return !checkIdentifierField('identifier2', this.identifier?.value);
                },
            }),
            ui.nestedFields.text({
                bind: 'locationDestination',
                title: 'Destination location',
            }),
            ui.nestedFields.text({
                bind: 'quantityAndStockUnit',
            }),
            ui.nestedFields.text({
                bind: 'statusDestination',
                title: 'Destination status',
            }),
        ],
        dropdownActions: [
            {
                icon: 'delete',
                title: 'Delete',
                onClick(rowId: any, rowItem?: any) {
                    // Never assume that a table's id matches the table's index
                    const _lineNumber = rowItem?._id === rowId ? rowItem?.lineNumber : undefined;
                    if (_lineNumber) {
                        const _stockChangeLines = this.savedObject?.intersiteTransfer?.stockChangeLines ?? [];
                        const _index = _stockChangeLines.findIndex(_ => _.lineNumber === _lineNumber);
                        if (_index >= 0) {
                            _stockChangeLines?.splice(_index, 1);
                            if (!_stockChangeLines.length) {
                                this._initStorage();
                                this.createButton.isHidden = true;
                                onGoto(this, '@sage/x3-stock/MobileIntersiteTransferByIdentifier');
                                return;
                            } else {
                                this.stockChangeLines.value = _stockChangeLines?.map(line => ({
                                    ...line,
                                    _id: this.stockChangeLines.generateRecordId(),
                                }));
                                this.stockChangeLinesBlock.title = this.stockChangeLinesBlock?.title?.replace(
                                    /\d+/g,
                                    this.stockChangeLines.value.length.toString(),
                                );

                                const values = getPageValuesNotTransient(this);
                                this.savedObject = {
                                    ...this.savedObject,
                                    intersiteTransfer: { ...this.savedObject.intersiteTransfer, ...values },
                                };
                                this._saveStockChange();
                            }
                        }
                    }
                },
            },
        ],
    })
    stockChangeLines: ui.fields.Table<any>;

    /*
     *  Init functions
     */

    private async _init(): Promise<boolean> {
        await this._readSavedObject();
        await this._initSite();
        if (this.stockSite.value) {
            this._initDestination();
            await this._initTransaction();
            this._numberOfDecimalList = await getUnitNumberOfDecimalList(this);
            this._initIdentifierList();
            this._initStockChangeLines();
            this._postInitStockChangeLines();
        } else {
            return false;
        }
        return true;
    }

    private _disablePage(): void {
        this.transaction.isDisabled = true;
        this.identifier.isDisabled = true;
        this.siteDestination.isDisabled = true;
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

    private _initDestination() {
        const destination = this.$.storage.get('mobile-label-destination') as string;
        if (destination) {
            this.savedObject.destination = destination;
        }
    }

    private async _initTransaction(): Promise<void | never> {
        let transaction = this.savedObject.selectedTransaction;

        try {
            this._transactions = extractEdges<any>(
                await this.$.graph
                    .node('@sage/x3-stock/StockEntryTransaction')
                    .query(
                        ui.queryUtils.edgesSelector<StockEntryTransaction>(
                            {
                                code: true,
                                isActive: true,
                                stockAutomaticJournal: { code: false },
                                localizedDescription: true,
                                isLocationChange: true,
                                isStatusChange: true,
                                isUnitChange: false,
                                transactionType: true,
                                identifier1Destination: false,
                                identifier2Destination: false,
                                identifier1Detail: false,
                                identifier2Detail: false,
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
            ).filter(_ => _.isStatusChange || _.isLocationChange);
        } catch (err) {
            ui.console.error(err);
        }

        if (transaction?.code) {
            if (!this._transactions.some(_ => _.code === transaction?.code)) {
                this._disablePage();
                throw new Error('Transaction not authorized, cannot continue');
            }
        } else if (!this._transactions?.length) {
            this._disablePage();
            throw new Error('No transaction, cannot continue');
        } else {
            transaction = this._transactions[0];
            this.transaction.isDisabled = false;
        }

        const hideTransaction = this.transactionBlock.isHidden;
        this._setTransaction(transaction, hideTransaction, this.transaction.isDisabled);
    }

    private _setTransaction(
        transaction: PartialStockEntryTransaction,
        hideTransaction = false,
        disableIdentifier = true,
    ) {
        if (this._transactions) {
            this.transaction.options = this._transactions.map(trs => trs.code ?? '');
        }

        this.transaction.value = transaction.code ?? '';
        this.transaction.isHidden = hideTransaction;

        this.savedObject = {
            ...this.savedObject,
            selectedTransaction: transaction,
        };

        this.identifier.isDisabled = disableIdentifier;
        this.siteDestination.isDisabled = disableIdentifier;
    }

    private async _readSavedObject() {
        const _storedString = this.$.storage.get('mobile-intersiteTransferByIdentifier') as string;

        if (!_storedString) {
            this._initStorage();
        } else {
            this.savedObject = JSON.parse(_storedString) as inputsIntersiteTransfer;

            if (!this._checkStorage()) {
                await this._reInitStorage();
            }
        }
    }

    /*
     * storage functions
     */

    private _checkStorage() {
        if (!this.savedObject?.intersiteTransfer?.stockChangeLines) {
            return false;
        }

        if (!this.savedObject?.username) {
            return false;
        }
        if (this.savedObject.username !== this.$.username) {
            return false;
        }

        return true;
    }

    private async _reInitStorage() {
        await this._notifier.showAndWait(
            ui.localize(
                '@sage/x3-stock/pages__mobile_intersite_transfer_by_identifier__notification__storage_error',
                `An error occurred loading the storage, the page will restart to cleanup`,
            ),
            'error',
        );
        this._initStorage();
        onGoto(this, '@sage/x3-stock/MobileIntersiteTransferByIdentifier');
    }

    private _initStorage() {
        const stockChangeLine: StockChangeLineInput[] = [];
        this.savedObject = {
            intersiteTransfer: {
                id: '',
                stockChangeLines: stockChangeLine,
            },
            username: this.$.username ?? '',
            started: false,
            selectedTransaction: undefined,
            selectedIdentifier: undefined,
            selectedIdentifierValues: undefined,
            siteDestination: undefined,
        };
        this._saveStockChange(this.savedObject);
    }

    private _saveStockChange(data = this.savedObject) {
        this.$.storage.set('mobile-intersiteTransferByIdentifier', JSON.stringify({ ...data }));
    }

    private _initStockChangeLines() {
        const _stockChange = this.savedObject?.intersiteTransfer;
        const _stockChangeLines = _stockChange?.stockChangeLines;
        if (_stockChangeLines?.length) {
            _stockChange.stockChangeLines = _stockChangeLines.map((line: StockChangeLineInput) => {
                return {
                    ...line,
                    quantityAndStockUnit: `${Number(line.quantityInPackingUnit).toFixed(
                        getNumberOfDecimal(this._numberOfDecimalList, line.packingUnit),
                    )} ${String(line.packingUnit)}`,
                };
            });

            this.stockChangeLinesBlock.isHidden = false;
            this.stockChangeLines.value = _stockChange.stockChangeLines.map(line => ({
                ...line,
                _id: this.stockChangeLines.generateRecordId(),
            }));
        }

        if (this.savedObject.selectedIdentifier) {
            this.identifier.options = [this.savedObject.selectedIdentifier ?? ''];
            this.identifier.value = this.savedObject.selectedIdentifier ?? '';
        }

        if (this.savedObject.siteDestination) {
            this.siteDestination.value = this.savedObject.siteDestination;
        }
    }

    private _postInitStockChangeLines() {
        if (this.savedObject?.intersiteTransfer?.effectiveDate) {
            this.effectiveDate.value = this.savedObject.intersiteTransfer.effectiveDate;
        } else {
            this.effectiveDate.value = DateValue.today().toString();
        }

        if (this.savedObject.siteDestination) {
            this.siteDestination.value = this.savedObject.siteDestination;
        }

        if (this.savedObject?.intersiteTransfer?.stockChangeLines?.length) {
            this.createButton.isHidden = false;
            this.nextButton.isHidden = true;
        }
    }

    /**
     * return a clean copy ready for the translation
     * @returns
     */
    public prepareDataMutation(): StockChangeInput {
        const _selectedTransaction = this.savedObject?.selectedTransaction;

        const _stockChangeLines =
            this.savedObject.intersiteTransfer?.stockChangeLines?.map((line: any) => {
                const _line = <Partial<StockChangeLineInput & { quantityAndStockUnit?: string }>>{
                    ...line,
                    lineNumber: Number(Math.floor(Math.random() * MAX_INT_32)),
                };
                delete _line.quantityAndStockUnit;
                delete _line.licensePlateNumber;
                delete _line.lot;
                delete _line.sublot;

                return _line;
            }) ?? [];

        const _stockChange = <StockChangeInput>{
            ...this.savedObject.intersiteTransfer,
            stockChangeDestination: 'intersite',
            stockSiteDestination: this.savedObject.siteDestination?.code,
            ...(this.savedObject?.destination && { destination: this.savedObject.destination }),
            ...(_selectedTransaction?.stockAutomaticJournal?.code && {
                stockAutomaticJournal: _selectedTransaction.stockAutomaticJournal.code,
            }),
            ...(_selectedTransaction?.stockMovementCode?.code && {
                stockMovementCode: _selectedTransaction.stockMovementCode.code,
            }),
            ...(_selectedTransaction?.defaultStockMovementGroup?.code && {
                stockMovementGroup: _selectedTransaction.defaultStockMovementGroup.code,
            }),
            ...(_selectedTransaction?.printingMode && {
                printingMode: String(PrintingModeEnum[_selectedTransaction.printingMode]),
            }),
            stockChangeLines: _stockChangeLines,
        };

        delete _stockChange.id;

        return _stockChange;
    }

    private async _callCreationAPI(): Promise<any> {
        const _stockChangeArgs = this.prepareDataMutation();

        let _result: any;
        try {
            _result = await this.$.graph
                .node('@sage/x3-stock/StockChange')
                .mutations.intersiteTransfer(
                    {
                        id: true,
                    },
                    {
                        parameter: _stockChangeArgs,
                    },
                )
                .execute();
            if (!_result) {
                throw Error(
                    ui.localize(
                        '@sage/x3-stock/pages__mobile_intersite_transfer_by_identifier__notification__no_create_results_error',
                        'No results received for the creation',
                    ),
                );
            }
        } catch (error) {
            return error;
        }
        return _result;
    }

    private goToDetailsPage() {
        const values = getPageValuesNotTransient(this);
        this.savedObject = {
            ...this.savedObject,
            intersiteTransfer: { ...this.savedObject.intersiteTransfer, ...values },
            started: true,
            selectedIdentifier: this.identifier.value ?? '',
            selectedIdentifierValues: '',
            siteDestination: this.siteDestination?.value ?? undefined,
        };
        this._saveStockChange();
        onGoto(this, '@sage/x3-stock/MobileIntersiteTransferByIdentifierDetails', {
            _id: `${this.stockSite.value}`,
            stockSite: JSON.stringify({ code: this.stockSite.value }),
            identifier: `${this.identifier?.value}`,
        });
    }

    private _initIdentifierList() {
        this.identifier.value =
            this.identifier.value && this.identifier.value === optionsIdentifier[0]
                ? optionsIdentifier[1]
                : optionsIdentifier[0];
    }
}
