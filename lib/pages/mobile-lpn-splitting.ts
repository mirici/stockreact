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
    Stock,
} from '@sage/x3-stock-data-api';
import { lpn } from '@sage/x3-stock-data/build/lib/menu-items/lpn';
import { ExtractEdges, Filter, extractEdges } from '@sage/xtrem-client';
import { DateValue } from '@sage/xtrem-date-time';
import { MAX_INT_32 } from '@sage/xtrem-shared';
import * as ui from '@sage/xtrem-ui';
import { NotifyAndWait } from '../client-functions/display';

export type inputsLpnSplitting = {
    lpnOperations: LpnOperationsInput & {
        id?: string;
    };
    username: string;
    currentLine?: number;
    currentOperation?: number;
    started: boolean;
    selectedLicensePlateNumber: LicensePlateNumberInput;
    selectedProduct: ProductInput;
    licensePlateNumberDestination: LicensePlateNumberInput;
    locationDestination?: LocationInput;
};

@ui.decorators.page<MobileLpnSplitting>({
    title: 'LPN splitting',
    mode: 'default',
    menuItem: lpn,
    priority: 300,
    isTransient: false,
    isTitleHidden: true,
    authorizationCode: 'CWSLPNS',
    access: { node: '@sage/x3-stock-data/LicensePlateNumber' },
    skipDirtyCheck: true,
    async onLoad() {
        const returnFromDetail = this.$.queryParameters['ReturnFromDetail'] as string;
        if (returnFromDetail != 'yes') this.$.storage.remove('mobile-lpnOperations');
        this._currentOperation = 0;
        await this._init();
        this.effectiveDate.value = DateValue.today().toString();
        this._showLpnLocationDestination();
        this._showLayout();
    },
    businessActions() {
        return [this.createButton, this.nextButton];
    },
})
export class MobileLpnSplitting extends ui.Page {
    private _mobileSettings: MobileSettings;
    public savedObject: inputsLpnSplitting;
    private _notifier = new NotifyAndWait(this);
    private _currentOperation: number;

    @ui.decorators.textField<MobileLpnSplitting>({
        isHidden: true,
    })
    stockSite: ui.fields.Text;

    @ui.decorators.pageAction<MobileLpnSplitting>({
        title: 'Next',
        isHidden: true,
        buttonType: 'primary',
        async onClick() {
            if (this.product.value) {
                const returnFromDetail = this.$.queryParameters['ReturnFromDetail'] as string;
                let curLine = 0;
                returnFromDetail === 'yes' ? (curLine = this.savedObject.currentLine) : (curLine = 0);
                returnFromDetail === 'yes' && this.savedObject.currentOperation !== undefined
                    ? (this._currentOperation = this.savedObject.currentOperation + 1)
                    : (this._currentOperation = 0);
                this.savedObject = {
                    ...this.savedObject,
                    lpnOperations: {
                        ...this.savedObject.lpnOperations,
                        effectiveDate: this.effectiveDate.value,
                    },
                    started: true,
                    selectedLicensePlateNumber: this.licensePlateNumber.value,
                    selectedProduct: this.product.value.product,
                    licensePlateNumberDestination: this.licensePlateNumberDestination.value,
                    locationDestination: this.locationDestination.value,
                    currentOperation: this._currentOperation,
                };
                this._saveLpnOperations();
                this.$.setPageClean();
                let licensePlateNumberOrigin: string = this.licensePlateNumber.value?.code;
                let location: string = this.locationDestination.value?.code;

                this.$.router.goTo('@sage/x3-stock/MobileLpnSplittingStockLines', {
                    _id: `${this.product.value.product.code}|${this.stockSite.value}`, // necessary for loading data in a non-transient way
                    mobileSettings: JSON.stringify({ ...this._mobileSettings }),
                    lpnOperations: JSON.stringify({
                        stockSite: { code: this.stockSite.value },
                        licensePlateNumberDestination: this.licensePlateNumberDestination.value?.code,
                        locationDestination: this.locationDestination.value?.code,
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
                        '@sage/x3-stock/pages_mobile_stock_change_by_lpn__notification__no_products_error',
                        `Enter at least one product.`,
                    ),
                );
            }
        },
    })
    nextButton: ui.PageAction;

    @ui.decorators.pageAction<MobileLpnSplitting>({
        title: 'Create',
        buttonType: 'primary',
        isHidden: false,
        async onClick() {
            this.licensePlateNumberDestination.isDirty = false;
            this.locationDestination.isDirty = false;
            this.product.isDirty = false;
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
                        '@sage/x3-stock/pages_mobile_lpn_unlink__notification__this_transaction_has_more_seventy_stock_lines',
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
                        await this.$.router.refresh();
                    } else {
                        this.$.storage.remove('mobile-lpnOperations');
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
                    this.$.storage.remove('mobile-lpnOperations');
                    await this.$.sound.success();
                    await dialogMessage(
                        this,
                        'success',
                        ui.localize('@sage/x3-stock/dialog-success-title', 'Success'),
                        ui.localize(
                            '@sage/x3-stock/pages_mobile_lpn_splitting__notification__creation_success',
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
                            '@sage/x3-stock/pages_mobile_lpn_splitting__notification__creation_error',
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
                            '@sage/x3-stock/pages_mobile_lpn_splitting__notification__creation_success',
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
                        '@sage/x3-stock/pages_mobile_lpn_splitting__notification__no_products_error',
                        `Enter at least one product.`,
                    ),
                    'error',
                );
            }
        },
    })
    createButton: ui.PageAction;

    @ui.decorators.section<MobileLpnSplitting>({
        isTitleHidden: true,
    })
    mainSection: ui.containers.Section;

    @ui.decorators.block<MobileLpnSplitting>({
        parent() {
            return this.mainSection;
        },
        isTitleHidden: true,
    })
    mainBlock: ui.containers.Block;

    @ui.decorators.dateField<MobileLpnSplitting>({
        parent() {
            return this.mainBlock;
        },
        title: 'Change date',
        isMandatory: true,
        maxDate: DateValue.today().toString(),
    })
    effectiveDate: ui.fields.Date;

    @ui.decorators.referenceField<MobileLpnSplitting, LicensePlateNumber>({
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
            this.$.commitValueAndPropertyChanges();
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

    @ui.decorators.textField<MobileLpnSplitting>({
        isTransient: true,
    })
    singleLot: ui.fields.Text;

    @ui.decorators.referenceField<MobileLpnSplitting, ProductSite>({
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
        isMandatory: true,
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
            if (await this.product.value?.product.code) {
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
                if (
                    this.licensePlateNumberDestination.value?.isSingleProduct &&
                    !(await this._validateSingleProduct())
                ) {
                    await dialogMessage(
                        this,
                        'error',
                        ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                        ui.localize(
                            '@sage/x3-stock/pages_mobile_lpn_splitting_destination_lpn_single_product',
                            `The Destination License plate number is single product.`,
                        ),
                    );
                    this.nextButton.isHidden = true;
                    this.product.value = null;
                    this.product.focus();
                }
            } else {
                this.nextButton.isHidden = true;
            }
            this._showLayout();
            this.$.commitValueAndPropertyChanges();
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

    @ui.decorators.referenceField<MobileLpnSplitting, LicensePlateNumber>({
        parent() {
            return this.mainBlock;
        },
        title: 'Destination license plate number',
        valueField: 'code',
        node: '@sage/x3-stock-data/LicensePlateNumber',
        placeholder: 'Scan or select...',
        isMandatory: false,
        isTransient: false,
        isFullWidth: true,
        isAutoSelectEnabled: true,
        shouldSuggestionsIncludeColumns: true,
        canFilter: false,
        filter() {
            return {
                _and: [{ isActive: true }, { stockSite: { code: this.stockSite.value ?? undefined } }],
            };
        },
        async onChange() {
            if (this.licensePlateNumberDestination.value?.isSingleProduct && !(await this._validateSingleProduct())) {
                await dialogMessage(
                    this,
                    'error',
                    ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                    ui.localize(
                        '@sage/x3-stock/pages_mobile_lpn_splitting_destination_lpn_single_product',
                        `The Destination License plate number is single product.`,
                    ),
                );
                this.licensePlateNumberDestination.value = null;
                this.licensePlateNumberDestination.focus();
            }
            if (await this.licensePlateNumberDestination.value?.isSingleLot) {
                let resultSingleLot: boolean = true;
                let resultLot: string | undefined = undefined;
                this.savedObject.lpnOperations?.stockChangeLines?.forEach(line => {
                    line.stockDetails?.forEach(lineDetail => {
                        if (resultLot) {
                            if (lineDetail.lot !== resultLot) {
                                resultSingleLot = false;
                            }
                        } else {
                            resultLot = lineDetail.lot;
                        }
                    });
                });
                if (resultSingleLot && resultLot) {
                    const response = await this.$.graph
                        .node('@sage/x3-stock-data/Stock')
                        .query(
                            ui.queryUtils.edgesSelector<Stock>(
                                { _id: true },
                                {
                                    filter: {
                                        lot: { _ne: resultLot },
                                        licensePlateNumber: this.licensePlateNumberDestination.value?.code,
                                    },
                                },
                            ),
                        )
                        .execute();
                    resultSingleLot = response.edges.length === 0;
                }
                if (!resultSingleLot) {
                    await dialogMessage(
                        this,
                        'error',
                        ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                        ui.localize(
                            '@sage/x3-stock/pages_mobile_lpn_splitting_destination_lpn_single_lot',
                            `The Destination License plate number is single lot.`,
                        ),
                    );
                    this.licensePlateNumberDestination.value = null;
                    this.licensePlateNumberDestination.focus();
                }
            }
            if (this.licensePlateNumberDestination.value?.code) {
                if (this.licensePlateNumberDestination.value.location) {
                    this.locationDestination.value = this.licensePlateNumberDestination.value.location;
                    this.locationDestination.isDisabled = this.licensePlateNumberDestination.value.status === 'inStock';
                } else {
                    this.locationDestination.value = null;
                    this.locationDestination.isDisabled = false;
                }
            } else {
                this.locationDestination.value = null;
                this.locationDestination.isDisabled = false;
            }
            this._showLpnLocationDestination();
            this.$.commitValueAndPropertyChanges();
            this._showLayout();
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
                isHidden: false,
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
    licensePlateNumberDestination: ui.fields.Reference;

    @ui.decorators.referenceField<MobileLpnSplitting, Location>({
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
            if (await this.locationDestination.value?.code) {
                this.locationDestination.getNextField(true)?.focus();
            }
            this._showLpnLocationDestination();
            this._showLayout();
            this.$.commitValueAndPropertyChanges();
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
    locationDestination: ui.fields.Reference;

    @ui.decorators.block<MobileLpnSplitting>({
        parent() {
            return this.mainSection;
        },
        title: 'Splitting in progress',
        width: 'extra-large',
        isHidden: true,
    })
    stockChangeLinesBlock: ui.containers.Block;

    @ui.decorators.tableField<MobileLpnSplitting>({
        parent() {
            return this.stockChangeLinesBlock;
        },
        title: 'Splitting:',
        isTransient: true,
        canSelect: false,
        canFilter: false,
        columns: [
            ui.nestedFields.text({
                bind: 'product',
                title: 'Product',
            }),
            ui.nestedFields.text({
                bind: 'licensePlateNumber',
                title: 'License plate number',
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
                        this.$.router.goTo('@sage/x3-stock/MobileLpnSplitting');
                    } else {
                        this.stockChangeLines.value = this._mapStockChange(_stockChangeLines);
                        this.stockChangeLines.title = ui.localize(
                            '@sage/x3-stock/pages_mobile_lpn_splitting__title_table',
                            'Splitting: {{ title }}',
                            {
                                title: this.stockChangeLines.value.length.toString(),
                            },
                        );
                        // don't forget to update session storage or deleted lines will reappear if user refreshes the page
                        this.savedObject = {
                            ...this.savedObject,
                            lpnOperations: {
                                ...this.savedObject.lpnOperations,
                                effectiveDate: this.effectiveDate.value,
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
                bind: 'licensePlateNumber',
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
                if (this.savedObject.licensePlateNumberDestination) {
                    this.licensePlateNumberDestination.value = this.savedObject.licensePlateNumberDestination;
                    this.licensePlateNumberDestination.isDisabled = true;
                }
                if (this.savedObject.locationDestination) {
                    this.locationDestination.value = this.savedObject.locationDestination;
                    this.locationDestination.isDisabled =
                        this.licensePlateNumberDestination.value?.status === 'inStock';
                }
                if (this.licensePlateNumber.value.isSingleProduct) {
                    this.product.value = { product: this.savedObject.selectedProduct, site: this.stockSite.value };
                    this.product.isDisabled = true;
                } else this.product.isDisabled = false;
            }
            this.licensePlateNumber.focus();
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
            return {
                _id: String(rowCount++), // this defines the rowId parameter in dropdownActions onClick() event
                //licensePlateNumber: line.stockDetails[0].licensePlateNumber,
                product: line.product,
                location: line.stockDetails[0].location ? `${line.stockDetails[0].location}` : null,
                licensePlateNumber: line.stockDetails[0].licensePlateNumber
                    ? `${line.stockDetails[0].licensePlateNumber}`
                    : null,
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
                        '@sage/x3-stock/pages_mobile_you_need_to_select_stock_search_parameters_to_set_up_Mobile_Automation_FUNADCSEARCH_function',
                        'You need to select stock search parameters to set up Mobile Automation - FUNADCSEARCH function.',
                    ),
                );
            }
        }
    }

    private async _readSavedObject() {
        const storedString = this.$.storage.get('mobile-lpnOperations') as string;

        if (!storedString) {
            this._initStorage();
        } else {
            this.savedObject = JSON.parse(this.$.storage.get('mobile-lpnOperations') as string) as inputsLpnSplitting;

            if (!this._checkStorage()) {
                await this._reInitStorage();
            }
        }
    }

    private _disablePage(): void {
        this.effectiveDate.isDisabled = true;
        this.licensePlateNumber.isDisabled = true;
        this.product.isDisabled = true;
        this.licensePlateNumberDestination.isDisabled = true;
        this.locationDestination.isDisabled = true;
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
                '@sage/x3-stock/pages_mobile_stock_change_by_lpn__notification__storage_error',
                `An error occurred loading the storage, the page will restart to cleanup`,
            ),
            'error',
        );
        this._initStorage();
        this.$.router.goTo('@sage/x3-stock/MobileLpnSplitting');
    }

    private _initStorage() {
        this.savedObject = {
            lpnOperations: {
                id: '',
                stockChangeLines: new Array<LpnOperationsLineInput>(),
            },
            currentLine: 0,
            username: this.$.userCode,
            started: false,
            selectedLicensePlateNumber: null,
            selectedProduct: null,
            licensePlateNumberDestination: null,
            locationDestination: null,
        };
        this._saveLpnOperations(this.savedObject);
    }

    private _initStockChangeLines() {
        this.savedObject.lpnOperations.licensePlateNumberOperationMode = 2;
        this.savedObject.lpnOperations.stockSite = this.stockSite.value;

        if (this.savedObject.lpnOperations.stockChangeLines) {
            this.savedObject.lpnOperations.stockChangeLines = this.savedObject.lpnOperations.stockChangeLines.map(
                (line: LpnOperationsLineInput) => {
                    return {
                        ...line,
                        stockSite: this.stockSite.value,
                    };
                },
            );
        }

        if (this.savedObject.lpnOperations.stockChangeLines.length > 0) {
            this.stockChangeLinesBlock.isHidden = false;
            this.stockChangeLines.value = this.savedObject.lpnOperations.stockChangeLines.map(line => ({
                ...line,
                _id: this.stockChangeLines.generateRecordId(),
            }));
            this.stockChangeLines.title = ui.localize(
                '@sage/x3-stock/pages_mobile_lpn_splitting__title_table',
                'Splitting: {{ title }}',
                {
                    title: this.stockChangeLines.value.length.toString(),
                },
            );
        }
    }

    private _postInitStockChangeLines() {
        if (this.savedObject.lpnOperations.effectiveDate) {
            this.effectiveDate.value = this.savedObject.lpnOperations.effectiveDate;
        } else {
            this.effectiveDate.value = DateValue.today().toString();
        }

        if (this.savedObject.lpnOperations.stockChangeLines.length > 0) {
            this._showLayout();
            //to resynchronise the _id for the delete action
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
        this.product.isDisabled = !this.licensePlateNumber.value;
        if (this.product.isDisabled) {
            this.product.value = null;
        }
        this.nextButton.isHidden = !this.licensePlateNumber.value || !this.product.value?.product.code;
        this.createButton.isDisabled =
            this.savedObject.lpnOperations.stockChangeLines.length == 0 ||
            !this.licensePlateNumber.value ||
            !this.licensePlateNumberDestination.value ||
            !this.locationDestination.value ||
            !this.locationDestination.value?.code;
    }

    private _showLpnLocationDestination() {
        this.savedObject.lpnOperations.licensePlateNumberDestination = this.licensePlateNumberDestination.value?.code;
        this.savedObject.lpnOperations.locationDestination = this.locationDestination.value?.code;
        this.savedObject.lpnOperations?.stockChangeLines?.forEach(line => {
            line.licensePlateNumber = this.licensePlateNumberDestination.value?.code;
            line.location = this.locationDestination.value?.code;
            line.stockDetails?.forEach(item => {
                item.licensePlateNumber = this.licensePlateNumberDestination.value?.code;
                item.location = this.locationDestination.value?.code;
            });
        });
        this.stockChangeLines.value = this.savedObject.lpnOperations.stockChangeLines.map(line => ({
            ...line,
            _id: this.stockChangeLines.generateRecordId(),
        }));
    }

    /*
     * Read the stock node to ensure there is some inventory for the entered details
     */
    private async _getProductOrLot(singleLot: boolean, lpnDestination: string, location: string) {
        try {
            const stockFilter: Filter<Stock> = {
                stockSite: this.stockSite.value,
                licensePlateNumber: lpnDestination,
                location: location,
            };
            const result = extractEdges(
                await this.$.graph
                    .node('@sage/x3-stock-data/Stock')
                    .query(
                        ui.queryUtils.edgesSelector(
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
            ) as ExtractEdges<Stock>[];

            if (result.length >= 1) {
                this.singleLot.value = singleLot ? result[0].lot : null;
                this.product.value = await this._fetchProductSite(result[0].product.product.code);
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
                    '@sage/x3-stock/pages_mobile_notification__invalid_product_site_error',
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

    private async _validateSingleProduct(): Promise<boolean> {
        let resultReturn: boolean = true;
        let resultProduct: string | undefined = this.product.value?.product.code;
        this.savedObject.lpnOperations?.stockChangeLines?.forEach(line => {
            if (resultProduct) {
                if (line.product !== resultProduct) {
                    resultReturn = false;
                }
            } else {
                resultProduct = line.product;
            }
        });
        if (resultReturn && resultProduct) {
            const response = await this.$.graph
                .node('@sage/x3-stock-data/Stock')
                .query(
                    ui.queryUtils.edgesSelector<Stock>(
                        { _id: true },
                        {
                            filter: {
                                product: { product: { code: { _ne: resultProduct } } },
                                licensePlateNumber: this.licensePlateNumberDestination.value?.code,
                            },
                        },
                    ),
                )
                .execute();
            resultReturn = response.edges.length === 0;
        }
        return resultReturn;
    }
}
