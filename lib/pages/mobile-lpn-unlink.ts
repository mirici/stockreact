import { ProductInput, ProductSite } from '@sage/x3-master-data-api';
import { dialogConfirmation, dialogMessage } from '@sage/x3-master-data/lib/client-functions/dialogs';
import { getSelectedStockSite } from '@sage/x3-master-data/lib/client-functions/get-selected-stock-site';
import { LpnOperations, LpnOperationsInput, LpnOperationsLineInput } from '@sage/x3-stock-api';
import {
    LicensePlateNumber,
    LicensePlateNumberInput,
    Location,
    LocationInput,
    MobileSettings,
    SerialNumber,
    Stock,
} from '@sage/x3-stock-data-api';
import { lpn } from '@sage/x3-stock-data/build/lib/menu-items/lpn';
import { ExtractEdges, Filter, extractEdges } from '@sage/xtrem-client';
import { DateValue } from '@sage/xtrem-date-time';
import { MAX_INT_32 } from '@sage/xtrem-shared';
import * as ui from '@sage/xtrem-ui';
import { NotifyAndWait } from '../client-functions/display';

export type inputsLpnUnlink = {
    lpnOperations: LpnOperationsInput & {
        // Must be optional for delete operation
        id?: string;
    };
    username: string;
    currentLine?: number;
    currentOperation?: number;
    started: boolean;
    selectedLicensePlateNumber?: LicensePlateNumberInput;
    selectedLocation?: LocationInput;
    selectedProduct?: ProductInput;
    destinationCode?: string;
    //stockSite: string;
};

@ui.decorators.page<MobileLpnUnlink>({
    title: 'LPN unlinking',
    mode: 'default',
    menuItem: lpn,
    priority: 300,
    isTransient: false,
    isTitleHidden: true,
    authorizationCode: 'CWSLPNU',
    access: { node: '@sage/x3-stock-data/LicensePlateNumber' },
    skipDirtyCheck: true,
    async onLoad() {
        const returnFromDetail = this.$.queryParameters['ReturnFromDetail'] as string;
        if (returnFromDetail != 'yes') this.$.storage.remove('mobile-lpnOperations');
        this._currentOperation = 0;
        await this._init();
        this.effectiveDate.value = DateValue.today().toString();
        this.unlinkAllSwitch.value = false;
        this._showLayout();
    },
    businessActions() {
        return [this.createButton, this.nextButton];
    },
})
export class MobileLpnUnlink extends ui.Page {
    private _mobileSettings: MobileSettings; // MobileSettings
    public savedObject: inputsLpnUnlink;
    private _notifier = new NotifyAndWait(this);
    private _currentOperation: number;

    @ui.decorators.textField<MobileLpnUnlink>({
        isHidden: true,
    })
    stockSite: ui.fields.Text;

    @ui.decorators.pageAction<MobileLpnUnlink>({
        title: 'Next',
        isHidden: true,
        buttonType: 'primary',
        async onClick() {
            if (this.product.value) {
                const returnFromDetail = this.$.queryParameters['ReturnFromDetail'] as string;
                const curLine = returnFromDetail === 'yes' ? Number(this.savedObject?.currentLine) : 0;

                returnFromDetail === 'yes' && this.savedObject.currentOperation !== undefined
                    ? (this._currentOperation = this.savedObject.currentOperation + 1)
                    : (this._currentOperation = 0);
                this.savedObject = {
                    ...this.savedObject,
                    lpnOperations: {
                        ...this.savedObject.lpnOperations,
                        effectiveDate: this.effectiveDate.value ?? undefined,
                    },
                    started: true,
                    selectedLicensePlateNumber: this.licensePlateNumber.value ?? undefined,
                    selectedLocation: this.location.value ?? undefined,
                    selectedProduct: this.product.value?.product,
                    currentOperation: this._currentOperation,
                };
                this._saveLpnOperations();
                this.$.setPageClean();
                let licensePlateNumberOrigin: string = this.licensePlateNumber.value?.code ?? '';
                let location: string = this.location.value?.code;

                this.$.router.goTo('@sage/x3-stock/MobileLpnUnlinkStockLines', {
                    _id: `${this.product.value.product.code}|${this.stockSite.value}`, // necessary for loading data in a non-transient way
                    mobileSettings: JSON.stringify({ ...this._mobileSettings }),
                    lpnOperations: JSON.stringify({
                        stockSite: { code: this.stockSite.value },
                        licensePlateNumberDestination: this.licensePlateNumber.value?.code,
                        locationDestination: this.location.value?.code,
                    } as ExtractEdges<LpnOperations>),
                    ...(this.singleLot.value && {
                        lot: this.singleLot.value,
                    }),
                    licensePlateNumberOrigin: licensePlateNumberOrigin,
                    location: location,
                });
            } else {
                await dialogMessage(
                    this,
                    'error',
                    ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                    ui.localize(
                        '@sage/x3-stock/pages__mobile_stock_change_by_lpn__notification__no_products_error',
                        `Enter at least one product.`,
                    ),
                );
            }
        },
    })
    nextButton: ui.PageAction;

    @ui.decorators.pageAction<MobileLpnUnlink>({
        title: 'Create',
        buttonType: 'primary',
        isHidden: false,
        async onClick() {
            this.product.isDirty = false;
            if (this.unlinkAllSwitch.value) {
                if (!(await this._getUnLinkAll())) {
                    return;
                }
            }
            if (
                this.savedObject?.lpnOperations?.stockChangeLines &&
                this.savedObject.lpnOperations.stockChangeLines.length > 50
            ) {
                const options: ui.dialogs.DialogOptions = {
                    acceptButton: {
                        text: ui.localize('@sage/x3-stock/button-accept-ok', 'OK'),
                    },
                };
                await this.$.sound.error();
                await dialogMessage(
                    this,
                    'error',
                    ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                    ui.localize(
                        '@sage/x3-stock/pages__mobile_lpn_unlink__notification__this_transaction_has_more_seventy_stock_lines',
                        'This transaction has more than 50 stock lines. The document will not be created.',
                    ),
                    options,
                );
                return;
            }
            if (
                this.savedObject?.lpnOperations?.stockChangeLines &&
                this.savedObject.lpnOperations.stockChangeLines.length > 0
            ) {
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
                    } else {
                        this.$.storage.remove('mobile-lpnOperations');
                        await this.$.router.emptyPage();
                    }
                    await this.$.router.refresh();
                    return;
                }

                if ((!result.errors || !result.errors.length || result.errors.length === 0) && !result.message) {
                    const options: ui.dialogs.DialogOptions = {
                        acceptButton: {
                            text: ui.localize('@sage/x3-stock/button-accept-ok', 'OK'),
                        },
                    };
                    this.$.storage.remove('mobile-lpnOperations');
                    await this.$.sound.success();
                    await dialogMessage(
                        this,
                        'success',
                        ui.localize('@sage/x3-stock/dialog-success-title', 'Success'),
                        ui.localize(
                            '@sage/x3-stock/pages__mobile_lpn_unlink__notification__creation_success',
                            'Document no. {{documentId}} created.',
                            { documentId: result.id },
                        ),
                        options,
                    );
                    await this.$.router.emptyPage();
                } else {
                    //severity 3 and 4
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
                            '@sage/x3-stock/pages__mobile_lpn_unlink__notification__creation_error',
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
                            ).catch(() => {})
                        ) {
                            await this.$.router.refresh();
                        } else {
                            this.$.storage.remove('mobile-lpnOperations');
                            await this.$.router.emptyPage();
                        }
                    } else {
                        //severity 1 and 2
                        const options: ui.dialogs.DialogOptions = {
                            acceptButton: {
                                text: ui.localize('@sage/x3-stock/button-accept-ok', 'OK'),
                            },
                            mdContent: true,
                        };
                        this.$.storage.remove('mobile-lpnOperations');
                        await this.$.sound.success();

                        const messageArray: string[] = result.errors[0].extensions.diagnoses[0].message.split(`\n`);
                        let message = `**${ui.localize(
                            '@sage/x3-stock/pages__mobile_lpn_unlink__notification__creation_success',
                            'Document no. {{documentId}} created.',
                            { documentId: result.id },
                        )}**\n\n`;
                        if (messageArray.length === 1) {
                            message += `${messageArray[0]}`;
                        } else {
                            message += messageArray.map(item => `* ${item}`).join('\n');
                        }

                        if (
                            await dialogMessage(
                                this,
                                'success',
                                ui.localize('@sage/x3-stock/dialog-success-title', 'Success'),
                                `${message}`,
                                options,
                            )
                        ) {
                            await this.$.router.refresh();
                        } else {
                            this.$.storage.remove('mobile-lpnOperations');
                            await this.$.router.emptyPage();
                        }
                    }
                }
            } else {
                // don't want to wait for this one
                await this.$.sound.error();
                this._notifier.show(
                    ui.localize(
                        '@sage/x3-stock/pages__mobile_lpn_unlink__notification__no_products_error',
                        `Enter at least one product.`,
                    ),
                    'error',
                );
            }
        },
    })
    createButton: ui.PageAction;

    @ui.decorators.section<MobileLpnUnlink>({
        isTitleHidden: true,
    })
    mainSection: ui.containers.Section;

    @ui.decorators.block<MobileLpnUnlink>({
        parent() {
            return this.mainSection;
        },
        isTitleHidden: true,
    })
    mainBlock: ui.containers.Block;

    @ui.decorators.dateField<MobileLpnUnlink>({
        parent() {
            return this.mainBlock;
        },
        title: 'Change date',
        isMandatory: true,
        maxDate: DateValue.today().toString(),
    })
    effectiveDate: ui.fields.Date;

    @ui.decorators.switchField<MobileLpnUnlink>({
        parent() {
            return this.mainBlock;
        },
        isDisabled: false,
        isHidden: false,
        isReadOnly: false,
        title: 'Unlink all',
        async onChange() {
            if (!this.unlinkAllSwitch.value) {
                if (this.licensePlateNumber.value?.code) {
                    if (this.licensePlateNumber.value.isSingleProduct) {
                        await this._getProductOrLot(
                            this.licensePlateNumber.value.isSingleLot,
                            this.licensePlateNumber.value.code,
                            this.licensePlateNumber.value.location.code,
                        );
                    }
                }
            }
            if (this.unlinkAllSwitch.value) {
                this._initStorage();
                this.stockChangeLines.value = this._mapStockChange(
                    this.savedObject?.lpnOperations?.stockChangeLines ?? [],
                );
            }
            this._showLayout();
            await this.$.commitValueAndPropertyChanges();
        },
    })
    unlinkAllSwitch: ui.fields.Switch;

    @ui.decorators.referenceField<MobileLpnUnlink, LicensePlateNumber>({
        parent() {
            return this.mainBlock;
        },
        title: 'License plate number',
        valueField: 'code',
        node: '@sage/x3-stock-data/LicensePlateNumber',
        placeholder: 'Scan or select...',
        isMandatory: true,
        isTransient: false,
        isFullWidth: true,
        isAutoSelectEnabled: true,
        shouldSuggestionsIncludeColumns: true,
        canFilter: false,
        filter() {
            return {
                _and: [{ status: 'inStock' }, { stockSite: { code: this.stockSite.value ?? undefined } }],
            };
        },
        async onChange() {
            if (this.licensePlateNumber.value?.code) {
                if (this.licensePlateNumber.value.isSingleProduct) {
                    await this._getProductOrLot(
                        this.licensePlateNumber.value.isSingleLot,
                        this.licensePlateNumber.value.code,
                        this.licensePlateNumber.value.location.code,
                    );
                }
            }
            this._showLayout();
            await this.$.commitValueAndPropertyChanges();

            if (this.licensePlateNumber.value?.code) {
                this.licensePlateNumber.getNextField(true)?.focus();
            }
        },
        columns: [
            ui.nestedFields.text({
                bind: 'code',
            }),
            ui.nestedFields.reference({
                bind: 'location',
                valueField: 'code',
                node: '@sage/x3-stock-data/Location',
            }),
            ui.nestedFields.text({
                bind: 'status',
                title: 'Status',
                isHidden: true,
            }),
            ui.nestedFields.checkbox({
                bind: 'isSingleProduct',
                isHidden: true,
            }),
            ui.nestedFields.checkbox({
                bind: 'isSingleLot',
                isHidden: true,
            }),
        ],
    })
    licensePlateNumber: ui.fields.Reference;

    @ui.decorators.textField<MobileLpnUnlink>({
        isTransient: true,
    })
    singleLot: ui.fields.Text;

    @ui.decorators.referenceField<MobileLpnUnlink, ProductSite>({
        parent() {
            return this.mainBlock;
        },
        title: 'Product',
        node: '@sage/x3-master-data/ProductSite',
        valueField: { product: { code: true } },
        helperTextField: { product: { upc: true } },
        placeholder: 'Scan or select…',
        isTransient: true,
        canFilter: false,
        isAutoSelectEnabled: true,
        isFullWidth: true,
        shouldSuggestionsIncludeColumns: true,
        isDisabled: true,
        isMandatory: false,
        filter() {
            return {
                stockSite: { code: this.stockSite.value ?? undefined },
                stock: {
                    _atLeast: 1,
                    licensePlateNumber: this.licensePlateNumber.value?.code,
                    stockSite: this.stockSite.value ?? undefined,
                },
            };
        },
        async onChange() {
            if (await this.product.value?.product?.code) {
                const _productSites = extractEdges<ProductSite>(
                    await this.$.graph
                        .node('@sage/x3-master-data/ProductSite')
                        .query(
                            ui.queryUtils.edgesSelector<ProductSite>(
                                {
                                    isBeingCounted: true,
                                },
                                {
                                    filter: {
                                        product: {
                                            code: this.product.value?.product?.code,
                                        },
                                        stockSite: {
                                            code: this.stockSite.value ?? undefined,
                                        },
                                    },
                                },
                            ),
                        )
                        .execute(),
                );
                if (_productSites.length && _productSites[0].isBeingCounted === true) {
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
                        this.nextButton.isHidden = false;
                        this.product.getNextField(true)?.focus();
                    } else {
                        this.nextButton.isHidden = true;
                        this.product.value = null;
                        this.product.focus();
                    }
                } else {
                    this.nextButton.isHidden = false;
                    this.product.getNextField(true)?.focus();
                }
            } else {
                this.nextButton.isHidden = true;
            }
            this._showLayout();
            await this.$.commitValueAndPropertyChanges();
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

    @ui.decorators.referenceField<MobileLpnUnlink, Location>({
        parent() {
            return this.mainBlock;
        },
        title: 'Destination location',
        node: '@sage/x3-stock-data/Location',
        valueField: 'code',
        isMandatory: false,
        placeholder: 'Scan or select…',
        isAutoSelectEnabled: true,
        isFullWidth: true,
        canFilter: false,
        filter() {
            const locationFilter: any = {
                stockSite: { code: this.stockSite.value },
                category: { _nin: ['subcontract', 'customer'] },
            };
            return locationFilter;
        },
        async onChange() {
            if (await this.location.value?.code) {
                this.location.getNextField(true)?.focus();
            }
            this._showLayout();
            await this.$.commitValueAndPropertyChanges();
        },
        columns: [
            ui.nestedFields.text({
                bind: 'code',
                title: 'Code',
            }),
            ui.nestedFields.reference({
                node: '@sage/x3-system/Site',
                bind: 'stockSite',
                valueField: 'code',
                isHidden: true,
            }),
            ui.nestedFields.text({
                bind: 'type',
                title: 'Type',
            }),
        ],
    })
    location: ui.fields.Reference;

    @ui.decorators.block<MobileLpnUnlink>({
        parent() {
            return this.mainSection;
        },
        title: 'Unlinking in progress',
        width: 'extra-large',
        isHidden: true,
    })
    stockChangeLinesBlock: ui.containers.Block;

    @ui.decorators.tableField<MobileLpnUnlink>({
        parent() {
            return this.stockChangeLinesBlock;
        },
        title: 'Unlinks:',
        isTransient: true,
        canSelect: false,
        canFilter: false,
        columns: [
            ui.nestedFields.text({
                bind: 'product',
                title: 'Product',
            }),
            ui.nestedFields.text({
                bind: 'location',
                title: 'Location',
            }),
        ],
        dropdownActions: [
            {
                icon: 'delete',
                title: 'Delete',
                onClick(rowId: any) {
                    const _stockChangeLines = this.savedObject?.lpnOperations?.stockChangeLines;
                    _stockChangeLines?.splice(rowId, 1);

                    if (!_stockChangeLines || Number(_stockChangeLines.length) === 0) {
                        this._initStorage();
                        this.createButton.isDisabled = true;
                        this.$.router.goTo('@sage/x3-stock/MobileLpnUnlink');
                    } else {
                        this.stockChangeLines.value = this._mapStockChange(_stockChangeLines);
                        this.stockChangeLines.title = ui.localize(
                            '@sage/x3-stock/pages__mobile_lpn_unlinking__title_table',
                            'Unlinks: {{ title }}',
                            {
                                title: this.stockChangeLines.value.length.toString(),
                            },
                        );

                        // don't forget to update session storage or deleted lines will reappear if user refreshes the page
                        this.savedObject = {
                            ...this.savedObject,
                            lpnOperations: {
                                ...this.savedObject.lpnOperations,
                                effectiveDate: this.effectiveDate.value ?? undefined,
                            },
                        };

                        this._saveLpnOperations();
                    }
                },
            },
        ],
        mobileCard: {
            title: ui.nestedFields.text({
                bind: 'product',
            }),
            titleRight: ui.nestedFields.text({
                bind: 'location',
            }),
        },
    })
    stockChangeLines: ui.fields.Table<any>;

    private async _init(): Promise<void> {
        await this._readSavedObject();
        await this._initSite();

        if (this.stockSite.value && this._mobileSettings.stockField1) {
            this._initStockChangeLines();
            this._postInitStockChangeLines();
            if (this.savedObject.selectedLicensePlateNumber) {
                this.licensePlateNumber.value = this.savedObject.selectedLicensePlateNumber;
                this.licensePlateNumber.isDisabled = true;
                if (this.savedObject.selectedLocation) this.location.value = this.savedObject.selectedLocation;
                if (this.licensePlateNumber.value.isSingleProduct) {
                    this.product.value = { product: this.savedObject.selectedProduct, site: this.stockSite.value };
                    this.product.isDisabled = true;
                } else this.product.isDisabled = false;
            }

            if (this.licensePlateNumber.isDisabled) {
                this.licensePlateNumber.getNextField(true)?.focus();
            } else {
                this.licensePlateNumber.focus();
            }
        } else {
            this._disablePage();
        }
    }

    private _saveLpnOperations(data = this.savedObject) {
        this.$.storage.set('mobile-lpnOperations', JSON.stringify({ ...data }));
    }

    private _mapStockChange(change: Partial<LpnOperationsLineInput>[]) {
        let rowCount = 0;
        return change.map((line: LpnOperationsLineInput) => {
            const _stockDetails = line?.stockDetails;
            const _location = _stockDetails?.length ? _stockDetails[0].location : undefined;
            return {
                _id: String(rowCount++), // this defines the rowId parameter in dropdownActions onClick() event
                //licensePlateNumber: _stockDetails[0].licensePlateNumber,
                product: line.product,
                location: _location ? `${_location}` : null,
                //status: line.status ? `To ${line.status}` : null,
                stockSite: this.stockSite.value,
            };
        });
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
            this._mobileSettings = JSON.parse(this.$.storage.get('mobile-settings-lpn-operation') as string);

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

    private async _readSavedObject() {
        const storedString = this.$.storage.get('mobile-lpnOperations') as string | undefined;

        if (!storedString) {
            this._initStorage();
        } else {
            this.savedObject = JSON.parse(storedString) as inputsLpnUnlink;

            if (!this._checkStorage()) {
                await this._reInitStorage();
            }
        }
    }

    private _disablePage(): void {
        this.effectiveDate.isDisabled = true;
        this.licensePlateNumber.isDisabled = true;
        this.product.isDisabled = true;
        this.unlinkAllSwitch.isDisabled = true;
        this.location.isDisabled = true;
    }

    private _checkStorage() {
        if (!this.savedObject.lpnOperations.stockChangeLines) {
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
        this.$.router.goTo('@sage/x3-stock/MobileLpnUnlink');
    }

    private _initStorage() {
        this.savedObject = {
            lpnOperations: {
                id: '',
                stockChangeLines: new Array<LpnOperationsLineInput>(),
            },
            currentLine: 0,
            username: this.$.userCode ?? '',
            started: false,
            selectedLicensePlateNumber: undefined,
            selectedLocation: undefined,
            selectedProduct: undefined,
        };
        this._saveLpnOperations(this.savedObject);
    }

    private _initStockChangeLines() {
        const _lpnOperations = this.savedObject?.lpnOperations;

        if (_lpnOperations) {
            _lpnOperations.licensePlateNumberOperationMode = 3;
            _lpnOperations.stockSite = this.stockSite.value ?? undefined;

            if (_lpnOperations.stockChangeLines) {
                _lpnOperations.stockChangeLines = _lpnOperations.stockChangeLines.map(
                    (line: LpnOperationsLineInput) => {
                        return {
                            ...line,
                            stockSite: this.stockSite.value ?? undefined,
                        };
                    },
                );
            }

            if (_lpnOperations?.stockChangeLines && _lpnOperations?.stockChangeLines?.length > 0) {
                this.stockChangeLinesBlock.isHidden = false;
                this.stockChangeLines.value =
                    this.savedObject.lpnOperations.stockChangeLines?.map(line => ({
                        ...line,
                        _id: this.stockChangeLines.generateRecordId(),
                    })) ?? [];
                this.stockChangeLines.title = ui.localize(
                    '@sage/x3-stock/pages__mobile_lpn_unlinking__title_table',
                    'Unlinks: {{ title }}',
                    {
                        title: this.stockChangeLines.value.length.toString(),
                    },
                );
            }
        }
    }

    private _postInitStockChangeLines() {
        if (this.savedObject.lpnOperations.effectiveDate) {
            this.effectiveDate.value = this.savedObject.lpnOperations.effectiveDate;
        } else {
            this.effectiveDate.value = DateValue.today().toString();
        }

        if ((this.savedObject?.lpnOperations?.stockChangeLines?.length ?? 0) > 0) {
            this.createButton.isDisabled = false;
            //to resynchronize the _id for the delete action
            // this.stockChangeLines.value = this._mapStockChange(this.savedObject.lpnOperations.stockChangeLines);
        }
    }

    public prepareDataMutation(): LpnOperationsInput {
        const _lpnOperations = this.savedObject?.lpnOperations;
        delete _lpnOperations.id;
        _lpnOperations.stockChangeLines =
            _lpnOperations.stockChangeLines?.map((line: any) => {
                (line as any).lineNumber = Number(Math.floor(Math.random() * MAX_INT_32));
                return line;
            }) ?? [];
        return _lpnOperations;
    }

    private async _callCreationAPI(): Promise<any> {
        const _lpnOperations = this.prepareDataMutation();
        let result: any;

        try {
            result = await this.$.graph
                .node('@sage/x3-stock/LpnOperations')
                .mutations.lpnOperations(
                    {
                        id: true,
                    },
                    {
                        parameter: _lpnOperations,
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

    private _showLayout() {
        this.product.isDisabled = this.unlinkAllSwitch.value || !this.licensePlateNumber.value;
        if (this.product.isDisabled) {
            this.product.value = null;
        }
        this.nextButton.isHidden =
            this.unlinkAllSwitch.value || !this.licensePlateNumber.value || !this.product.value?.product.code;
        this.stockChangeLinesBlock.isHidden = this.savedObject.lpnOperations.stockChangeLines?.length === 0;
        this.createButton.isDisabled =
            (!this.unlinkAllSwitch.value && this.savedObject.lpnOperations.stockChangeLines?.length == 0) ||
            (this.unlinkAllSwitch.value && !this.location.value) ||
            !this.licensePlateNumber.value;
    }

    /*
     * Read the stock node to ensure there is some inventory for the entered details
     */
    private async _getProductOrLot(singleLot: boolean, lpnDestination: string, location: string) {
        try {
            const stockFilter: Filter<Stock> = {
                stockSite: this.stockSite.value ?? undefined,
                licensePlateNumber: lpnDestination,
                location: location,
            };
            const _stocks = extractEdges<Stock>(
                await this.$.graph
                    .node('@sage/x3-stock-data/Stock')
                    .query(
                        ui.queryUtils.edgesSelector<Stock>(
                            {
                                product: {
                                    product: {
                                        code: true,
                                    },
                                },
                                location: {
                                    code: true,
                                },
                                lot: true,
                            },
                            {
                                filter: stockFilter,
                                first: 1,
                            },
                        ),
                    )
                    .execute(),
            );

            if (_stocks.length >= 1) {
                this.singleLot.value = singleLot ? _stocks[0].lot : null;
                this.product.value = await this._fetchProductSite(_stocks[0]?.product?.product?.code);
                this.product.isDisabled = true;
            }
            return;
        } catch (e) {
            await dialogMessage(
                this,
                'error',
                ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                ui.localize('@sage/x3-stock/dialog-error-reading-stock', 'Reading stock record: ') + String(e),
            );
            return;
        }
    }
    private async _fetchProductSite(productCode: string): Promise<ProductSite> {
        // read product site record
        const response = await this.$.graph
            .node('@sage/x3-master-data/ProductSite')
            .read(
                {
                    product: {
                        code: true,
                        localizedDescription1: true,
                    },
                    stockSite: {
                        code: true,
                    },
                },
                `${productCode}|${this.stockSite.value}`,
            )
            .execute();

        // If an error occurred
        if (!response) {
            throw new Error(
                ui.localize(
                    '@sage/x3-stock/pages__mobile_notification__invalid_product_site_error',
                    `Could not retrieve your product {{ productCode }} for the site {{ siteCode }}`,
                    {
                        productCode: productCode,
                        siteCode: this.stockSite.value,
                    },
                ),
            );
        }
        return response;
    }

    private async _getUnLinkAll(): Promise<boolean> {
        const response = extractEdges<Stock>(
            await this.$.graph
                .node('@sage/x3-stock-data/Stock')
                .query(
                    ui.queryUtils.edgesSelector<Stock>(
                        {
                            product: {
                                product: {
                                    code: true,
                                    serialNumberManagementMode: true,
                                },
                            },
                            packingUnit: {
                                code: true,
                            },
                            quantityInPackingUnit: true,
                            packingUnitToStockUnitConversionFactor: true,
                            stockId: true,
                            serialNumber: true,
                            isBeingCounted: true,
                        },
                        {
                            filter: {
                                licensePlateNumber: this.licensePlateNumber.value?.code,
                                stockSite: { code: this.stockSite.value ?? undefined },
                            },
                            first: 51,
                        },
                    ),
                )
                .execute(),
        );
        if (response.length > 50) {
            const options: ui.dialogs.DialogOptions = {
                acceptButton: {
                    text: ui.localize('@sage/x3-stock/button-accept-ok', 'OK'),
                },
            };
            await dialogMessage(
                this,
                'error',
                ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                ui.localize(
                    '@sage/x3-stock/pages__mobile_lpn_unlink__notification__this_transaction_has_more_seventy_stock_lines',
                    'This transaction has more than 50 stock lines. The document will not be created.',
                ),
                options,
            );
            return false;
        }

        this.savedObject = {
            lpnOperations: {
                id: '',
                stockChangeLines: [],
                stockSite: this.stockSite.value ?? undefined,
                licensePlateNumberOperationMode: 3,
                effectiveDate: this.effectiveDate.value ?? undefined,
            },
            currentLine: 0,
            username: this.$.userCode ?? '',
            started: true,
            selectedLicensePlateNumber: this.licensePlateNumber.value ?? undefined,
            selectedLocation: this.location.value ?? undefined,
            selectedProduct: undefined,
        };

        const _stockChangeLines = this.savedObject?.lpnOperations?.stockChangeLines;

        for (const item of response) {
            if (item.isBeingCounted) {
                const options: ui.dialogs.DialogOptions = {
                    acceptButton: {
                        text: ui.localize('@sage/x3-stock/button-accept-ok', 'OK'),
                    },
                };
                await dialogMessage(
                    this,
                    'error',
                    ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                    ui.localize(
                        '@sage/x3-stock/pages__mobile_lpn_unlink__notification__stock_line_in_stock_count',
                        'Stock line in stock count. The document will not be created.',
                    ),
                    options,
                );
                return false;
            }

            if (_stockChangeLines) {
                _stockChangeLines.push({
                    stockDetails: [],
                    stockId: String(item.stockId),
                    product: item.product?.product?.code,
                    stockSite: this.stockSite.value ?? undefined,
                    location: this.location.value?.code,
                });

                if (item?.product?.product?.serialNumberManagementMode === 'globalReceivedIssued') {
                    const responseSerialNumber = extractEdges<SerialNumber>(
                        await this.$.graph
                            .node('@sage/x3-stock-data/SerialNumber')
                            .query(
                                ui.queryUtils.edgesSelector<SerialNumber>(
                                    {
                                        code: true,
                                    },
                                    {
                                        filter: {
                                            stockId: item.stockId,
                                            product: { code: item.product?.product?.code },
                                            stockSite: { code: this.stockSite.value ?? undefined },
                                        },
                                        first: 1001,
                                    },
                                ),
                            )
                            .execute(),
                    );

                    let currentSerialNumber = '';
                    let beginSerialNumber = '';
                    let quantitySerialNumber = 0;

                    for (const itemSerialNumber of responseSerialNumber) {
                        if (beginSerialNumber === '') {
                            beginSerialNumber = itemSerialNumber.code;
                            currentSerialNumber = itemSerialNumber.code;
                            quantitySerialNumber = 1;
                        } else {
                            if (itemSerialNumber.code === this._nextSerialNumber(currentSerialNumber)) {
                                currentSerialNumber = itemSerialNumber.code;
                                quantitySerialNumber++;
                            } else {
                                _stockChangeLines[_stockChangeLines.length - 1].stockDetails?.push({
                                    quantityInPackingUnit: quantitySerialNumber,
                                    packingUnit: item.packingUnit?.code,
                                    // licensePlateNumber: undefined,
                                    quantityInStockUnit:
                                        quantitySerialNumber * Number(item.packingUnitToStockUnitConversionFactor),
                                    location: this.location.value?.code,
                                    // stockSite: this.stockSite.value,
                                    serialNumber: beginSerialNumber,
                                });
                                beginSerialNumber = itemSerialNumber.code;
                                currentSerialNumber = itemSerialNumber.code;
                                quantitySerialNumber = 1;
                            }
                        }
                    }

                    if (beginSerialNumber !== '' && quantitySerialNumber != 0) {
                        _stockChangeLines[_stockChangeLines.length - 1].stockDetails?.push({
                            quantityInPackingUnit: quantitySerialNumber,
                            packingUnit: item.packingUnit?.code,
                            // licensePlateNumber: undefined,
                            quantityInStockUnit:
                                quantitySerialNumber * Number(item.packingUnitToStockUnitConversionFactor),
                            location: this.location.value?.code,
                            // stockSite: this.stockSite.value,
                            serialNumber: beginSerialNumber,
                        });
                    }
                } else {
                    _stockChangeLines[_stockChangeLines.length - 1].stockDetails?.push({
                        quantityInPackingUnit: item.quantityInPackingUnit,
                        packingUnit: item.packingUnit?.code,
                        // licensePlateNumber: undefined,
                        quantityInStockUnit:
                            Number(item.quantityInPackingUnit) * Number(item.packingUnitToStockUnitConversionFactor),
                        location: this.location.value?.code,
                        stockSite: this.stockSite.value ?? undefined,
                        serialNumber: item.serialNumber ?? undefined,
                    });
                }
            }
        }
        this._saveLpnOperations(this.savedObject);
        this.$.setPageClean();
        return true;
    }

    private _nextSerialNumber(currentSerialNumber: string): string {
        return currentSerialNumber.replace(/\d+$/, match => {
            const nextSerialNumber = (Number(match) + 1).toString();
            const lengthDiff = Math.max(nextSerialNumber.length - match.length, 0);
            return nextSerialNumber.padStart(match.length + lengthDiff, '0');
        });
    }
}
