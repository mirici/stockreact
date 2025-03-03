import { dialogConfirmation, dialogMessage } from '@sage/x3-master-data/lib/client-functions/dialogs';
import { getPageValuesNotTransient } from '@sage/x3-master-data/lib/client-functions/get-page-values-not-transient';
import { getSelectedStockSite } from '@sage/x3-master-data/lib/client-functions/get-selected-stock-site';
import { onGoto } from '@sage/x3-master-data/lib/client-functions/on-goto';
import { StockChangeByLpnInput, StockChangeLineByLpnInput, StockEntryTransaction } from '@sage/x3-stock-api';
import { LicensePlateNumber, LicensePlateNumberInput } from '@sage/x3-stock-data-api';
import { stockControl } from '@sage/x3-stock-data/build/lib/menu-items/stock-control';
import { extractEdges } from '@sage/xtrem-client';
import { DateValue } from '@sage/xtrem-date-time';
import { MAX_INT_32 } from '@sage/xtrem-shared';
import * as ui from '@sage/xtrem-ui';
import { NotifyAndWait } from '../client-functions/display';

type DeepPartial<T> = T extends Object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;
type PartialStockTransaction = DeepPartial<StockEntryTransaction>;

export type inputsStockChangeByLpn = {
    stockChangeByLpn: StockChangeByLpnInput & {
        id?: string;
    };
    username: string;
    currentLine?: number;
    started: boolean;
    selectedTransaction?: PartialStockTransaction;
    selectedLicensePlateNumber?: LicensePlateNumberInput;
    destination?: string;
    printingMode?: string;
};

@ui.decorators.page<MobileStockChangeByLpn>({
    title: 'Stock change by LPN',
    mode: 'default',
    menuItem: stockControl,
    priority: 200,
    isTransient: false,
    isTitleHidden: true,
    authorizationCode: 'CWSSCSL',
    access: { node: '@sage/x3-stock/StockChangeByLpn' },
    skipDirtyCheck: true,
    async onLoad() {
        this.transaction.isDisabled = false;
        const returnFromDetail = this.$.queryParameters['ReturnFromDetail'] as string;
        if (returnFromDetail != 'yes') this.$.storage.remove('mobile-stockChangeByLpn');
        await this._init();
    },
    businessActions() {
        return [this.createButton];
    },
})
export class MobileStockChangeByLpn extends ui.Page {
    public savedObject: inputsStockChangeByLpn;
    private _transactions: PartialStockTransaction[];
    private _notifier = new NotifyAndWait(this);

    /*
     *  Technical properties
     */

    @ui.decorators.textField<MobileStockChangeByLpn>({
        isHidden: true,
    })
    stockSite: ui.fields.Text;

    @ui.decorators.pageAction<MobileStockChangeByLpn>({
        title: 'Create',
        buttonType: 'primary',
        isDisabled: true,
        async onClick() {
            if (Number(this.savedObject?.stockChangeByLpn?.stockChangeLines?.length) > 0) {
                //to disable the create button
                this.$.loader.isHidden = false;
                const result = await this._callCreationAPI();
                //to enable the create button
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
                            '@sage/x3-stock/pages__mobile_stock_change_by_lpn__notification__creation_error',
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
                        this.$.storage.remove('mobile-stockChangeByLpn');
                        await this.$.router.emptyPage();
                    }
                } else {
                    const options: ui.dialogs.DialogOptions = {
                        acceptButton: {
                            text: ui.localize('@sage/x3-stock/button-accept-ok', 'OK'),
                        },
                    };
                    this.$.storage.remove('mobile-stockChangeByLpn');
                    await this.$.sound.success();

                    await dialogMessage(
                        this,
                        'success',
                        ui.localize('@sage/x3-stock/dialog-success-title', 'Success'),
                        ui.localize(
                            '@sage/x3-stock/pages__mobile_stock_change_by_lpn__notification__creation_success',
                            'Document no. {{documentId}} created.',
                            { documentId: result.id },
                        ),
                        options,
                    );
                    await this.$.router.emptyPage();
                }
            } else {
                // don't want to wait for this one
                this._notifier.show(
                    ui.localize(
                        '@sage/x3-stock/pages__mobile_stock_change_by_lpn__notification__no_products_error',
                        `Enter at least one product.`,
                    ),
                    'error',
                );
            }
        },
    })
    createButton: ui.PageAction;

    @ui.decorators.section<MobileStockChangeByLpn>({
        isTitleHidden: true,
    })
    mainSection: ui.containers.Section;

    // First Block Date / Transaction

    @ui.decorators.block<MobileStockChangeByLpn>({
        parent() {
            return this.mainSection;
        },
        width: 'extra-large',
        isTitleHidden: true,
    })
    firstLineBlock: ui.containers.Block;

    @ui.decorators.dateField<MobileStockChangeByLpn>({
        parent() {
            return this.firstLineBlock;
        },
        title: 'Change date',
        isMandatory: true,
        width: 'small',
        maxDate: DateValue.today().toString(),
        onChange() {},
    })
    effectiveDate: ui.fields.Date;

    @ui.decorators.dropdownListField<MobileStockChangeByLpn>({
        parent() {
            return this.firstLineBlock;
        },
        title: 'Transaction',
        //options: ['ALL'],
        isTransient: true,
        async onChange() {
            if (this.transaction.value) {
                let _theTransaction = this.transaction.value;
                if (this.transaction.value.search(':') !== 0) {
                    const _transaction = this.transaction.value.split(':');
                    _theTransaction = _transaction[0];
                }
                const _transaction = this._transactions.find(trs => trs.code === _theTransaction) ?? {};
                this._setTransaction(_transaction, false, false);
                await this.$.commitValueAndPropertyChanges();
                this.transaction.getNextField(true)?.focus();
            } else {
                this.licensePlateNumber.isDisabled = true;
            }
        },
    })
    transaction: ui.fields.DropdownList;

    // Second block - License Plate Number

    @ui.decorators.block<MobileStockChangeByLpn>({
        parent() {
            return this.mainSection;
        },
        width: 'extra-large',
        isTitleHidden: true,
    })
    thirdBlock: ui.containers.Block;

    @ui.decorators.referenceField<MobileStockChangeByLpn, LicensePlateNumber>({
        parent() {
            return this.thirdBlock;
        },
        title: 'License plate number',
        node: '@sage/x3-stock-data/LicensePlateNumber',
        valueField: 'code',
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
                _and: [
                    { isActive: true },
                    { status: 'inStock' },
                    { stockSite: { code: this.stockSite.value ?? undefined } },
                ],
            };
        },
        onChange() {
            if (this.licensePlateNumber.value?.code) {
                const lpnIndex =
                    this.savedObject.stockChangeByLpn?.stockChangeLines
                        ?.map(lpn => lpn.licensePlateNumber)
                        .indexOf(this.licensePlateNumber.value.code) ?? -1;
                if (lpnIndex !== -1) {
                    this.$.showToast(
                        ui.localize(
                            '@sage/x3-stock/notification-error-stock-change-by-lpn-invalid-lpn',
                            'The lpn is already on the stock change',
                        ),
                        { type: 'error' },
                    );
                    return;
                } else {
                    const values = getPageValuesNotTransient(this);
                    this.savedObject = {
                        ...this.savedObject,
                        stockChangeByLpn: { ...this.savedObject.stockChangeByLpn, ...values },
                        started: true,
                        selectedLicensePlateNumber: this.licensePlateNumber.value,
                    };
                    this._saveStockChangeByLpn();
                    onGoto(this, '@sage/x3-stock/MobileStockChangeByLpnDestination');
                }
            }
        },
        columns: [
            ui.nestedFields.text({
                bind: 'code',
            }),
        ],
    })
    licensePlateNumber: ui.fields.Reference;

    //fourth block : product card

    @ui.decorators.block<MobileStockChangeByLpn>({
        parent() {
            return this.mainSection;
        },
        title: 'LPN in progress',
        width: 'extra-large',
        isHidden: true,
    })
    stockChangeLinesBlock: ui.containers.Block;

    @ui.decorators.tableField<MobileStockChangeByLpn>({
        parent() {
            return this.stockChangeLinesBlock;
        },
        title: 'LPNs:',
        isTransient: true,
        canSelect: false,
        canFilter: false,
        columns: [
            ui.nestedFields.text({
                bind: 'product',
                title: 'LPN',
            }),
            ui.nestedFields.text({
                bind: 'location',
                title: 'Location',
            }),
            ui.nestedFields.text({
                bind: 'status',
                title: 'Status',
            }),
        ],
        dropdownActions: [
            {
                icon: 'delete',
                title: 'Delete',
                onClick(rowId: any) {
                    const _stockChangeLines = this.savedObject.stockChangeByLpn?.stockChangeLines ?? [];
                    _stockChangeLines.splice(rowId, 1);

                    if (!_stockChangeLines.length) {
                        this._initStorage();
                        this.createButton.isDisabled = true;
                        onGoto(this, '@sage/x3-stock/MobileStockChangeByLpn');
                    } else {
                        this.stockChangeLines.value = this._mapStockChange(_stockChangeLines);
                        this.stockChangeLines.title = this.stockChangeLines.title?.replace(
                            /\d/,
                            this.stockChangeLines.value.length.toString(),
                        );
                        const values = getPageValuesNotTransient(this);
                        // don't forget to update session storage or deleted lines will reappear if user refreshes the page
                        this.savedObject = {
                            ...this.savedObject,
                            stockChangeByLpn: { ...this.savedObject.stockChangeByLpn, ...values },
                        };
                        this._saveStockChangeByLpn();
                    }
                },
            },
        ],
        mobileCard: {
            title: ui.nestedFields.text({
                bind: 'licensePlateNumber',
            }),
            titleRight: ui.nestedFields.text({
                bind: 'location',
            }),
            line2Right: ui.nestedFields.text({
                bind: 'status',
            }),
        },
    })
    stockChangeLines: ui.fields.Table<any>;

    /*
     *  Init functions
     */

    private async _init(): Promise<void> {
        await this._readSavedObject();
        await this._initSite();
        if (this.stockSite.value) {
            this._initDestination();
            await this._initTransaction();
            this._initStockChangeLines();
            this._postInitStockChangeLines();
        } else {
            this._disablePage();
        }
    }

    private _disablePage(): void {
        this.effectiveDate.isDisabled = true;
        this.transaction.isDisabled = true;
        this.licensePlateNumber.isDisabled = true;
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
        let hideTransaction = this.savedObject.started;

        try {
            this._transactions = extractEdges<StockEntryTransaction>(
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
                                    stockChangeDestination: 'internal',
                                    stockChangeAccessMode: { _eq: 'containerNumber' },
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
                    return trs.code === transaction?.code;
                })
            ) {
                this.effectiveDate.isDisabled = true;
                this.transaction.isDisabled = true;
                this.licensePlateNumber.isDisabled = true;
                throw new Error('Transaction not authorized, cannot continue');
            }
        } else {
            if (!this._transactions || this._transactions.length === 0) {
                this.effectiveDate.isDisabled = true;
                this.transaction.isDisabled = true;
                this.licensePlateNumber.isDisabled = true;
                throw new Error('No transaction, cannot continue');
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

        this.licensePlateNumber.isDisabled = disableProduct;
    }

    private async _readSavedObject() {
        const _storedString = this.$.storage.get('mobile-stockChangeByLpn') as string | undefined;

        if (!_storedString) {
            this._initStorage();
        } else {
            this.savedObject = JSON.parse(_storedString) as inputsStockChangeByLpn;

            if (!this._checkStorage()) {
                await this._reInitStorage();
            }
        }
    }

    /*
    storage functions
    */

    private _checkStorage() {
        if (!this.savedObject.stockChangeByLpn?.stockChangeLines) {
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
                '@sage/x3-stock/pages__mobile_stock_change_by_lpn__notification__storage_error',
                `An error occurred loading the storage, the page will restart to cleanup`,
            ),
            'error',
        );
        this._initStorage();
        onGoto(this, '@sage/x3-stock/MobileStockChangeByLpn');
    }

    private _initStorage() {
        this.savedObject = {
            stockChangeByLpn: {
                id: '',
                stockChangeLines: new Array<StockChangeLineByLpnInput>(),
            },
            currentLine: 0,
            username: this.$.userCode ?? '',
            started: false,
            selectedTransaction: undefined,
            selectedLicensePlateNumber: undefined,
        };
        this._saveStockChangeByLpn(this.savedObject);
    }

    private _saveStockChangeByLpn(data = this.savedObject) {
        this.$.storage.set('mobile-stockChangeByLpn', JSON.stringify({ ...data }));
    }

    private _mapStockChange(change: Partial<StockChangeLineByLpnInput>[]) {
        let rowCount = 0;
        return change.map((line: StockChangeLineByLpnInput) => {
            return {
                _id: String(rowCount++), // this defines the rowId parameter in dropdownActions onClick() event
                licensePlateNumber: line.licensePlateNumber,
                location: line.location ? `To ${line.location}` : null,
                status: line.status ? `To ${line.status}` : null,
                stockSite: this.stockSite.value,
            };
        });
    }
    private _initStockChangeLines() {
        if (this.savedObject.stockChangeByLpn.stockChangeLines) {
            this.savedObject.stockChangeByLpn.stockChangeLines =
                this.savedObject.stockChangeByLpn.stockChangeLines.map((line: StockChangeLineByLpnInput) => {
                    return {
                        ...line,
                        stockSite: this.stockSite.value ?? undefined,
                    };
                });
        }

        if (Number(this.savedObject.stockChangeByLpn?.stockChangeLines?.length) > 0) {
            this.stockChangeLinesBlock.isHidden = false;
            this.transaction.isDisabled = true;
            this.stockChangeLines.value =
                this.savedObject.stockChangeByLpn?.stockChangeLines?.map(line => ({
                    ...line,
                    _id: this.stockChangeLines.generateRecordId(),
                })) ?? [];
            this.stockChangeLines.title = ` ${
                this.stockChangeLines.title
            } ${this.stockChangeLines.value.length.toString()}`;
        }
    }

    private _postInitStockChangeLines() {
        if (this.savedObject.stockChangeByLpn.effectiveDate) {
            this.effectiveDate.value = this.savedObject.stockChangeByLpn.effectiveDate;
        } else {
            this.effectiveDate.value = DateValue.today().toString();
        }

        if (Number(this.savedObject.stockChangeByLpn?.stockChangeLines?.length) > 0) {
            this.createButton.isDisabled = false;
            //to resynchronize the _id for the delete action
            this.stockChangeLines.value = this._mapStockChange(
                this.savedObject.stockChangeByLpn?.stockChangeLines ?? [],
            );
        }
    }

    public prepareDataMutation(): StockChangeByLpnInput {
        const savedObject = this.savedObject;
        const _selectedTransaction = savedObject?.selectedTransaction;
        // not swallowing, need a new arrays

        const _stockChangeLines =
            this.savedObject.stockChangeByLpn?.stockChangeLines?.map<Partial<StockChangeLineByLpnInput>>(line => {
                const _line = <Partial<StockChangeLineByLpnInput>>{
                    ...line,
                    lineNumber: Number(Math.floor(Math.random() * MAX_INT_32)),
                };
                delete _line.stockId;
                delete _line.stockSite;
                return _line;
            }) ?? [];

        const _stockChangeByLpn = <StockChangeByLpnInput>{
            ...savedObject?.stockChangeByLpn,
            stockChangeDestination: 'internal',
            ...(this.savedObject?.destination && { destination: this.savedObject.destination }),
            ...(_selectedTransaction?.stockMovementCode?.code && {
                stockMovementCode: _selectedTransaction.stockMovementCode.code,
            }),
            ...(_selectedTransaction?.defaultStockMovementGroup?.code && {
                stockMovementGroup: _selectedTransaction.defaultStockMovementGroup.code,
            }),
            ...(_selectedTransaction?.code && { transaction: _selectedTransaction.code }),
            stockChangeLines: _stockChangeLines,
        };

        delete _stockChangeByLpn.id;

        return _stockChangeByLpn ?? {};
    }

    private async _callCreationAPI(): Promise<any | Error> {
        const _stockChangeByLpnArgs = this.prepareDataMutation();

        let _result: any;
        try {
            _result = await this.$.graph
                .node('@sage/x3-stock/StockChangeByLpn')
                .mutations.stockChangeByLpn(
                    {
                        id: true,
                    },
                    {
                        parameter: _stockChangeByLpnArgs,
                    },
                )
                .execute();
            if (!_result) {
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
        return _result;
    }
}
