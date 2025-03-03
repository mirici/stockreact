import { dialogConfirmation, dialogMessage } from '@sage/x3-master-data/lib/client-functions/dialogs';
import { getPageValuesNotTransient } from '@sage/x3-master-data/lib/client-functions/get-page-values-not-transient';
import { getSelectedStockSite } from '@sage/x3-master-data/lib/client-functions/get-selected-stock-site';
import { StockChangeByLpnInput, StockChangeLineByLpnInput } from '@sage/x3-stock-api';
import { LicensePlateNumber, LicensePlateNumberInput, Location } from '@sage/x3-stock-data-api';
import { lpn } from '@sage/x3-stock-data/build/lib/menu-items/lpn';
import { DateValue } from '@sage/xtrem-date-time';
import * as ui from '@sage/xtrem-ui';
import { NotifyAndWait } from '../client-functions/display';

export type inputsLpnGrouping = {
    stockChangeByLpn: StockChangeByLpnInput & {
        id: string;
    };
    username: string;
    currentLine?: number;
    started: boolean;
    selectedDestinationLPN: LicensePlateNumberInput;
    destinationLocation?: string;
};

@ui.decorators.page<MobileLpnGrouping>({
    title: 'LPN Grouping',
    mode: 'default',
    menuItem: lpn,
    priority: 100,
    isTransient: false,
    isTitleHidden: true,
    authorizationCode: 'CWSLPNG',
    access: { node: '@sage/x3-stock/StockChangeByLpn' },
    skipDirtyCheck: true,
    async onLoad() {
        this.licensePlateNumberOperationMode.value = 1;
        const returnFromDetail = this.$.queryParameters['ReturnFromDetail'] as string;
        if (returnFromDetail != 'yes') this.$.storage.remove('mobile-lpnGrouping');
        await this._init();

        this.effectiveDate.value = DateValue.today().toString();
    },
    businessActions() {
        return [this.createButton];
    },
})
export class MobileLpnGrouping extends ui.Page {
    [x: string]: any;
    public savedObject: inputsLpnGrouping;
    private _notifier = new NotifyAndWait(this);

    @ui.decorators.textField<MobileLpnGrouping>({
        isHidden: true,
    })
    stockSite: ui.fields.Text;

    /*
     *  Technical properties
     */

    @ui.decorators.pageAction<MobileLpnGrouping>({
        title: 'Create',
        isDisabled: true,
        buttonType: 'primary',
        shortcut: ['f2'],
        async onClick() {
            if (this.savedObject?.stockChangeByLpn?.stockChangeLines?.length > 0) {
                this.prepareDataMutation();
                //to disable the create button
                this.$.loader.isHidden = false;
                const result = await this._callCreationAPI();
                this.$.loader.isHidden = true;

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
                        this.$.storage.remove('mobile-lpnGrouping');
                        await this.$.router.emptyPage();
                    }

                    return;
                }

                // No errors or warnings
                if ((!result.errors || !result.errors.length || result.errors.length === 0) && !result.message) {
                    const options: ui.dialogs.DialogOptions = {
                        acceptButton: {
                            text: ui.localize('@sage/x3-stock/button-accept-ok', 'OK'),
                        },
                    };
                    this.$.storage.remove('mobile-lpnGrouping');
                    await this.$.sound.success();
                    await dialogMessage(
                        this,
                        'success',
                        ui.localize('@sage/x3-stock/dialog-success-title', 'Success'),
                        ui.localize(
                            '@sage/x3-stock/pages__mobile_lpn_grouping__notification__creation_success',
                            'Document no. {{documentId}} created.',
                            { documentId: result.id },
                        ),
                        options,
                    );
                    this.$.storage.remove('mobile-lpnGrouping');
                    await this.$.router.emptyPage();
                } else {
                    //severity 3 and 4 - error
                    if (
                        result.errors[0].extensions.diagnoses.filter(
                            (d: { severity: number; message: any }) => d.severity > 2 && d.message,
                        ).length !== 0
                    ) {
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

                        const messageArray: string[] = result.errors[0].extensions.diagnoses[0].message.split(`\n`);
                        let message = `**${ui.localize(
                            '@sage/x3-stock/pages__mobile_lpn_grouping__notification__creation_error',
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
                            this.$.storage.remove('mobile-lpnGrouping');
                            await this.$.router.emptyPage();
                        }
                    } else {
                        //severity 1 and 2 - warning
                        const options: ui.dialogs.DialogOptions = {
                            acceptButton: {
                                text: ui.localize('@sage/x3-stock/button-accept-ok', 'OK'),
                            },
                            mdContent: true,
                        };
                        this.$.storage.remove('mobile-lpnGrouping');
                        await this.$.sound.success();

                        const messageArray: string[] = result.errors[0].extensions.diagnoses[0].message.split(`\n`);
                        let message = `**${ui.localize(
                            '@sage/x3-stock/pages__mobile_lpn_grouping__notification__creation_success',
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
                            options,
                        );
                        await this.$.router.emptyPage();
                    }
                }
            } else {
                // don't want to wait for this one
                await this.$.sound.error();
                this._notifier.show(
                    ui.localize(
                        '@sage/x3-stock/pages__mobile_lpn_grouping__notification__no_products_error',
                        `Enter at least one product.`,
                    ),
                    'error',
                );
            }
        },
    })
    createButton: ui.PageAction;

    @ui.decorators.section<MobileLpnGrouping>({
        isTitleHidden: true,
    })
    mainSection: ui.containers.Section;

    @ui.decorators.block<MobileLpnGrouping>({
        parent() {
            return this.mainSection;
        },
        isTitleHidden: true,
    })
    entryBlock: ui.containers.Block;

    @ui.decorators.dateField<MobileLpnGrouping>({
        parent() {
            return this.entryBlock;
        },
        title: 'Change date',
        isMandatory: true,
        maxDate: DateValue.today().toString(),
    })
    effectiveDate: ui.fields.Date;

    @ui.decorators.numericField<MobileLpnGrouping>({})
    licensePlateNumberOperationMode: ui.fields.Numeric;

    @ui.decorators.referenceField<MobileLpnGrouping, LicensePlateNumber>({
        parent() {
            return this.entryBlock;
        },
        title: 'Destination License plate number',
        node: '@sage/x3-stock-data/LicensePlateNumber',
        valueField: 'code',
        placeholder: 'Scan or select…',
        isMandatory: true,
        isFullWidth: true,
        canFilter: false,
        isTransient: true,
        isAutoSelectEnabled: true,
        shouldSuggestionsIncludeColumns: true,
        isDisabled: false,
        filter() {
            return {
                _and: [{ isActive: true }, { stockSite: { code: this.stockSite.value } }],
            };
        },
        async onChange() {
            const lpnVal = this.licensePlateNumber.value;
            if (!lpnVal) {
                this.locationDestination.isReadOnly = true;
                this.locationDestination.value = null;
            } else if (!lpnVal?.location) {
                this.locationDestination.isReadOnly = false;
                await this.$.commitValueAndPropertyChanges();
                this.licensePlateNumber.getNextField(true)?.focus();
            } else {
                this.locationDestination.value = lpnVal.location;
                this._goToDetailPage();
            }
        },
        columns: [
            ui.nestedFields.text({
                bind: 'code',
                title: 'License plate number',
            }),
            ui.nestedFields.reference({
                node: '@sage/x3-stock-data/Location',
                title: 'Location',
                bind: 'location',
                valueField: 'code',
                isHidden: false,
            }),
            ui.nestedFields.text({
                bind: 'status',
                title: 'Status',
                isHidden: false,
            }),
        ],
    })
    licensePlateNumber: ui.fields.Reference;

    @ui.decorators.referenceField<MobileLpnGrouping, Location>({
        parent() {
            return this.entryBlock;
        },
        title: 'Destination location',
        node: '@sage/x3-stock-data/Location',
        valueField: 'code',
        placeholder: 'Scan or select…',
        isMandatory: true,
        isFullWidth: true,
        isReadOnly: true,
        canFilter: false,
        isAutoSelectEnabled: true,
        filter() {
            return {
                stockSite: { code: this.stockSite.value },
            };
        },
        async onChange() {
            if (await this.locationDestination.value?.code) {
                this._goToDetailPage();
            }
        },
        columns: [
            ui.nestedFields.text({
                bind: 'code',
                title: 'Code',
            }),
            ui.nestedFields.reference({
                node: '@sage/x3-system/Site',
                bind: 'code',
                valueField: 'code',
                isHidden: true,
            }),
            ui.nestedFields.text({
                bind: 'type',
                title: 'Type',
            }),
        ],
    })
    locationDestination: ui.fields.Reference;

    // List of LPNs to group with the destination LPN
    @ui.decorators.block<MobileLpnGrouping>({
        parent() {
            return this.mainSection;
        },
        title: 'LPN in progress',
        width: 'extra-large',
        isHidden: true,
    })
    stockChangeLinesBlock: ui.containers.Block;

    @ui.decorators.tableField<MobileLpnGrouping>({
        parent() {
            return this.stockChangeLinesBlock;
        },
        title: 'LPN(s)',
        isTransient: true,
        canSelect: false,
        canFilter: false,
        columns: [
            ui.nestedFields.text({
                bind: 'product',
                title: 'LPN',
            }),
        ],
        dropdownActions: [
            {
                icon: 'delete',
                title: 'Delete',
                onClick(rowId: any) {
                    this.savedObject.stockChangeByLpn.stockChangeLines.splice(rowId, 1);
                    if (this.savedObject.stockChangeByLpn.stockChangeLines.length === 0) {
                        this._initStorage();
                        this.createButton.isDisabled = true;
                        this.$.router.goTo('@sage/x3-stock/MobileLpnGrouping');
                    } else {
                        this.stockChangeLines.value = this._mapStockChange(
                            this.savedObject.stockChangeByLpn.stockChangeLines,
                        );
                        this.stockChangeLines.title = this.stockChangeLines?.title?.replace(
                            /\d/,
                            this.stockChangeLines.value.length.toString(),
                        );

                        // don't forget to update session storage or deleted lines will reappear if user refreshes the page
                        const values = getPageValuesNotTransient(this);
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
        },
    })
    stockChangeLines: ui.fields.Table<any>;

    private async _init(): Promise<void> {
        await this._readSavedObject();
        await this._initSite();
        if (this.stockSite.value) {
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
    }

    private _disablePage(): void {
        this.effectiveDate.isDisabled = true;
        this.locationDestination.isDisabled = true;
        this.licensePlateNumber.isDisabled = true;
        this.createButton.isDisabled = true;
    }

    private async _readSavedObject() {
        const storedString = this.$.storage.get('mobile-lpnGrouping') as string;

        if (!storedString) {
            this._initStorage();
        } else {
            this.savedObject = JSON.parse(this.$.storage.get('mobile-lpnGrouping') as string) as inputsLpnGrouping;

            if (!this._checkStorage()) {
                await this._reInitStorage();
            }
        }
    }

    private _postInitStockChangeLines() {
        if (this.savedObject.stockChangeByLpn.effectiveDate) {
            this.effectiveDate.value = this.savedObject.stockChangeByLpn.effectiveDate;
        } else {
            this.effectiveDate.value = DateValue.today().toString();
        }

        if (this.savedObject.selectedDestinationLPN.code) {
            this.licensePlateNumber.value = this.savedObject.selectedDestinationLPN;
            this.locationDestination.value = { code: this.savedObject.destinationLocation };
        }

        if (this.savedObject.stockChangeByLpn.stockChangeLines.length > 0) {
            this.stockChangeLinesBlock.isHidden = false;
            this.stockChangeLines.title = `${this.savedObject.stockChangeByLpn.stockChangeLines.length.toString()} ${
                this.stockChangeLines.title
            }`;
            this.createButton.isDisabled = false;
            this.licensePlateNumber.isReadOnly = true;
            this.stockChangeLines.value = this._mapStockChange(this.savedObject.stockChangeByLpn.stockChangeLines);
        } else {
            this.licensePlateNumber.focus();
        }
    }
    private _mapStockChange(change: Partial<StockChangeLineByLpnInput>[]) {
        let rowCount = 0;
        return change.map((line: StockChangeLineByLpnInput) => {
            return {
                _id: String(rowCount++),
                licensePlateNumber: line.licensePlateNumber,
                stockSite: this.stockSite.value,
            };
        });
    }

    /*
    storage functions
    */

    private _checkStorage() {
        if (!this.savedObject.stockChangeByLpn.stockChangeLines) {
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

    private _goToDetailPage() {
        const values = getPageValuesNotTransient(this);
        this.savedObject = {
            ...this.savedObject,
            stockChangeByLpn: { ...this.savedObject.stockChangeByLpn, ...values },
            started: true,
            selectedDestinationLPN: this.licensePlateNumber.value,
            destinationLocation: this.locationDestination.value?.code,
        };
        this._saveStockChangeByLpn();
        this.$.setPageClean();
        this.$.router.goTo('@sage/x3-stock/MobileLpnGroupingSelectLpn');
    }

    private async _reInitStorage() {
        await this._notifier.showAndWait(
            ui.localize(
                '@sage/x3-stock/pages__mobile_lpn_grouping__notification__storage_error',
                `An error occurred loading the storage, the page will restart to cleanup`,
            ),
            'error',
        );

        this._initStorage();
        this.$.router.goTo('@sage/x3-stock/MobileLpnGrouping');
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
            selectedDestinationLPN: {} as LicensePlateNumberInput,
            //stockSite: this.stockSite.value,
        };
        this._saveStockChangeByLpn(this.savedObject);
    }

    private _saveStockChangeByLpn(data = this.savedObject) {
        this.$.storage.set('mobile-lpnGrouping', JSON.stringify({ ...data }));
    }

    private _initStockChangeLines() {
        if (this.savedObject.stockChangeByLpn.stockChangeLines) {
            this.savedObject.stockChangeByLpn.stockChangeLines =
                this.savedObject.stockChangeByLpn.stockChangeLines.map((line: StockChangeLineByLpnInput) => {
                    return {
                        ...line,
                        stockSite: this.stockSite.value,
                    };
                });
        }
    }

    public prepareDataMutation() {
        delete this.savedObject.stockChangeByLpn.id;

        this.savedObject.stockChangeByLpn.stockChangeDestination = 'internal'; //??
        this.savedObject.stockChangeByLpn.licensePlateNumberDestination =
            this.savedObject.selectedDestinationLPN.code;
        this.savedObject.stockChangeByLpn.locationDestination = this.savedObject.destinationLocation;
        let lineCounter = 0;
        this.savedObject.stockChangeByLpn.stockChangeLines = this.savedObject.stockChangeByLpn.stockChangeLines.map(
            (line: any) => {
                delete line.stockSite;
                lineCounter += 1;
                (line as any).lineNumber = lineCounter;
                return line;
            },
        );
    }

    private async _callCreationAPI(): Promise<any> {
        const _stockChangeByLpnArgs = this.savedObject.stockChangeByLpn;
        let result: any;

        try {
            result = await this.$.graph
                .node('@sage/x3-stock/StockChangeByLpn')
                .mutations.lpnGrouping(
                    {
                        id: true,
                        stockSite: {
                            code: true,
                        },
                        effectiveDate: true,
                        project: {
                            id: true,
                        },
                        documentDescription: true,
                        licensePlateNumberOperationMode: true,
                        licensePlateNumberDestination: {
                            code: true,
                        },
                        locationDestination: true,
                        stockChangeLines: {
                            query: {
                                edges: {
                                    node: {
                                        stockChangeId: true,
                                        lineNumber: true,
                                    },
                                },
                            },
                        },
                    },
                    {
                        parameter: _stockChangeByLpnArgs,
                    },
                )
                .execute();
            ui.console.warn('result=', result);
            if (!result) {
                throw Error(
                    ui.localize(
                        '@sage/x3-stock/pages__mobile_lpn_grouping__notification__no_create_results_error',
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
