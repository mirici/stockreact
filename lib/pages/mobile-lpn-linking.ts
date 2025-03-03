import { Product, ProductInput, ProductSite } from '@sage/x3-master-data-api';
import { dialogConfirmation, dialogMessage } from '@sage/x3-master-data/lib/client-functions/dialogs';
import { getPageValuesNotTransient } from '@sage/x3-master-data/lib/client-functions/get-page-values-not-transient';
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
import { ExtractEdgesPartial, extractEdges } from '@sage/xtrem-client';
import { DateValue } from '@sage/xtrem-date-time';
import { MAX_INT_32 } from '@sage/xtrem-shared';
import * as ui from '@sage/xtrem-ui';
import { NotifyAndWait } from '../client-functions/display';
import { findSetting } from '../client-functions/manage-pages';

export type inputsLpnLinking = {
    lpnOperations: LpnOperationsInput & {
        id?: string;
    };
    username: string;
    currentLine?: number;
    started: boolean;
    selectedLicensePlateNumber: LicensePlateNumberInput;
    selectedLocation: LocationInput;
    selectedProduct: ProductInput;
    destinationCode?: string;
    //stockSite: string;
};

@ui.decorators.page<MobileLpnLinking>({
    title: 'LPN linking',
    mode: 'default',
    menuItem: lpn,
    priority: 200,
    isTransient: false,
    isTitleHidden: true,
    authorizationCode: 'CWSLPNA',
    access: { node: '@sage/x3-stock/LpnOperations' },
    skipDirtyCheck: true,
    async onLoad() {
        const returnFromDetail = this.$.queryParameters['ReturnFromDetail'] as string;
        if (returnFromDetail != 'yes') this.$.storage.remove('mobile-lpnOperations');
        await this._init();
    },
    businessActions() {
        return [this.createButton, this.nextButton];
    },
})
export class MobileLpnLinking extends ui.Page {
    private _mobileSettings: MobileSettings;
    public savedObject: inputsLpnLinking;
    private _notifier = new NotifyAndWait(this);

    @ui.decorators.textField<MobileLpnLinking>({
        isHidden: true,
    })
    stockSite: ui.fields.Text;

    /*
     *  Technical properties
     */
    @ui.decorators.pageAction<MobileLpnLinking>({
        title: 'Next',
        buttonType: 'primary',
        isHidden: true,
        async onClick() {
            if (this.product.value) {
                const returnFromDetail = this.$.queryParameters['ReturnFromDetail'] as string;
                let curLine = 0;
                returnFromDetail === 'yes' ? (curLine = this.savedObject?.currentLine ?? 0) : (curLine = 0);
                const values = getPageValuesNotTransient(this);
                this.savedObject = {
                    ...this.savedObject,
                    lpnOperations: {
                        ...this.savedObject.lpnOperations,
                        ...values,
                    },
                    started: true,
                    selectedLicensePlateNumber: this.licensePlateNumber.value,
                    selectedLocation: this.locationDestination.value,
                    selectedProduct: this.product.value,
                    // currentLine: curLine,
                };
                this._saveLpnOperations();
                this.$.setPageClean();
                let location = this.location.value?.code ?? '';
                return this.$.router.goTo('@sage/x3-stock/MobileLpnLinkingStockLine', {
                    _id: `${this.product.value.code}|${this.stockSite.value}`, // necessary for loading data in a non-transient way
                    mobileSettings: JSON.stringify({ ...this._mobileSettings }),
                    lpnOperations: JSON.stringify({
                        stockSite: { code: this.stockSite.value },
                        licensePlateNumberDestination: this.licensePlateNumber?.value?.code ?? undefined,
                        locationDestination: this.locationDestination.value?.code ?? undefined,
                    } as ExtractEdgesPartial<LpnOperations>),
                    ...(this.singleLot.value && {
                        lot: this.singleLot.value,
                    }),
                    location: location,
                    licensePlateNumberOrigin: '',
                });
            } else {
                await dialogMessage(
                    this,
                    'error',
                    ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                    ui.localize(
                        '@sage/x3-stock/pages__mobile_lpn_linking__notification__no_products_error',
                        `Enter at least one product.`,
                    ),
                );
            }
        },
    })
    nextButton: ui.PageAction;

    @ui.decorators.pageAction<MobileLpnLinking>({
        title: 'Create',
        buttonType: 'primary',
        isHidden: false,
        isDisabled: true,
        async onClick() {
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

                await dialogConfirmation(
                    this,
                    'error',
                    ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                    ui.localize(
                        '@sage/x3-stock/pages__mobile_lpn_linking__notification__this_transaction_has_more_seventy_stock_lines',
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
                            '@sage/x3-stock/pages__mobile_lpn_linking__notification__creation_success',
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
                            '@sage/x3-stock/pages__mobile_lpn_linking__notification__creation_error',
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
                                message,
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
                            '@sage/x3-stock/pages__mobile_lpn_linking__notification__creation_success',
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
                        '@sage/x3-stock/pages__mobile_lpn_linking__notification__no_products_error',
                        `Enter at least one product.`,
                    ),
                    'error',
                );
            }
        },
    })
    createButton: ui.PageAction;

    @ui.decorators.section<MobileLpnLinking>({
        isTitleHidden: true,
    })
    mainSection: ui.containers.Section;

    // Date, Site, LPN and location destination, Product and possibly location

    @ui.decorators.block<MobileLpnLinking>({
        parent() {
            return this.mainSection;
        },
        isTitleHidden: true,
    })
    entryBlock: ui.containers.Block;

    @ui.decorators.dateField<MobileLpnLinking>({
        parent() {
            return this.entryBlock;
        },
        title: 'Change date',
        isMandatory: true,
        maxDate: DateValue.today().toString(),
        onChange() {
            if (this.effectiveDate.value) {
                const values = getPageValuesNotTransient(this);
                this.savedObject = {
                    ...this.savedObject,
                    lpnOperations: { ...this.savedObject.lpnOperations, ...values },
                };
                this._saveLpnOperations();
            }
        },
    })
    effectiveDate: ui.fields.Date;

    @ui.decorators.referenceField<MobileLpnLinking, LicensePlateNumber>({
        parent() {
            return this.entryBlock;
        },
        title: 'Destination license plate number',
        node: '@sage/x3-stock-data/LicensePlateNumber',
        valueField: 'code',
        placeholder: 'Scan or select…',
        isMandatory: true,
        isTransient: true,
        canFilter: false,
        isAutoSelectEnabled: true,
        isDisabled: false,
        isFullWidth: true,
        shouldSuggestionsIncludeColumns: true,
        filter() {
            return {
                _and: [{ isActive: true }, { stockSite: { code: this.stockSite.value ?? '' } }],
            };
        },
        async onChange() {
            this.nextButton.isHidden = true;
            if (this.licensePlateNumber.value?.code) {
                if (this.licensePlateNumber.value?.location?.code) {
                    this.product.isDisabled = false;
                    this.product.value = null;
                    if (this.locationDestination.isReadOnly) {
                        this.locationDestination.isReadOnly = false;
                        await this.$.commitValueAndPropertyChanges();
                    }
                    if (
                        this.licensePlateNumber.value?.status === 'inStock' &&
                        (this.licensePlateNumber.value.isSingleLot || this.licensePlateNumber.value.isSingleProduct)
                    ) {
                        await this._getProductOrLot(
                            this.licensePlateNumber.value.isSingleLot,
                            this.licensePlateNumber.value.code,
                            this.licensePlateNumber.value.location.code,
                        );
                    } else {
                        this.product.value = null;
                        this.locationDestination.value = null;
                    }
                    this.locationDestination.value = { code: this.licensePlateNumber.value.location?.code };
                    this.licensePlateNumber.value.status === 'inStock'
                        ? (this.locationDestination.isReadOnly = true)
                        : (this.locationDestination.isReadOnly = false);
                    // this.locationDestination.isReadOnly = true;
                    this.location.isDisabled = false;
                    await this.$.commitValueAndPropertyChanges();
                    this.locationDestination.getNextField(true)?.focus();
                } else {
                    this.locationDestination.value = null;
                    this.locationDestination.isReadOnly = false;
                    this.product.value = null;
                    this.product.isDisabled = true;
                    await this.$.commitValueAndPropertyChanges();
                    this.licensePlateNumber.getNextField(true)?.focus();
                }
            } else {
                this.locationDestination.value = null;
                this.locationDestination.isReadOnly = false;
                this.product.value = null;
                this.product.isDisabled = true;
                await this.$.commitValueAndPropertyChanges();
                this.licensePlateNumber.focus();
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
            ui.nestedFields.checkbox({
                title: 'Single product',
                bind: 'isSingleProduct',
                isHidden: true,
            }),
            ui.nestedFields.checkbox({
                title: 'Single lot',
                bind: 'isSingleLot',
                isHidden: true,
            }),
        ],
    })
    licensePlateNumber: ui.fields.Reference;

    @ui.decorators.referenceField<MobileLpnLinking, Location>({
        parent() {
            return this.entryBlock;
        },
        title: 'Destination location',
        node: '@sage/x3-stock-data/Location',
        valueField: 'code',
        isMandatory: true,
        placeholder: 'Scan or select…',
        isAutoSelectEnabled: true,
        isFullWidth: true,
        isReadOnly: true,
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
                this.product.isDisabled = false;
                this.location.isDisabled = false;
                await this.$.commitValueAndPropertyChanges();
                this.locationDestination.getNextField(true)?.focus();
            }
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

    @ui.decorators.textField<MobileLpnLinking>({
        isTransient: true,
    })
    singleLot: ui.fields.Text;

    @ui.decorators.referenceField<MobileLpnLinking, Product>({
        parent() {
            return this.entryBlock;
        },
        title: 'Product',
        node: '@sage/x3-master-data/Product',
        valueField: 'code',
        helperTextField: 'upc',
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
                productStatus: { _ne: 'notUsable' },
                _and: [
                    { stockManagementMode: { _ne: 'notManaged' } },
                    {
                        productSites: {
                            _atLeast: 1,
                            stockSite: { code: this.stockSite.value ?? undefined },
                            isLocationManaged: true,
                            isLicensePlateNumberManaged: true,
                        },
                    },
                ],
            };
        },
        async onChange() {
            if (await this.product.value?.code) {
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
                                            code: this.product.value?.code,
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
        },
        columns: [
            ui.nestedFields.text({
                bind: 'code',
                title: 'Code',
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

    @ui.decorators.referenceField<MobileLpnLinking, Location>({
        parent() {
            return this.entryBlock;
        },
        title: 'Location',
        node: '@sage/x3-stock-data/Location',
        valueField: 'code',
        isDisabled: true,
        isMandatory: false,
        placeholder: 'Scan or select…',
        isAutoSelectEnabled: true,
        isFullWidth: true,
        isTransient: true,
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
                this.location.getNextField(true)?.focus();
            }
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

    @ui.decorators.block<MobileLpnLinking>({
        parent() {
            return this.mainSection;
        },
        title: 'Linking in progress',
        width: 'extra-large',
        isHidden: true,
    })
    stockChangeLinesBlock: ui.containers.Block;

    @ui.decorators.tableField<MobileLpnLinking>({
        parent() {
            return this.stockChangeLinesBlock;
        },
        title: 'Links:',
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
                    const _stockLines = this.savedObject?.lpnOperations?.stockChangeLines;
                    if (_stockLines) {
                        _stockLines.splice(rowId, 1);
                        if (_stockLines.length === 0) {
                            this._initStorage();
                            this.createButton.isDisabled = true;
                            return this.$.router.goTo('@sage/x3-stock/MobileLpnLinking');
                        } else {
                            this.stockChangeLines.value = this._mapStockChange(_stockLines);
                            this.stockChangeLines.title = ui.localize(
                                '@sage/x3-stock/pages__mobile_lpn_linking__title_table',
                                'Links: {{ title }}',
                                {
                                    title: this.stockChangeLines.value?.length.toString(),
                                },
                            );
                            // don't forget to update session storage or deleted lines will reappear if user refreshes the page
                            const values = getPageValuesNotTransient(this);
                            this.savedObject = {
                                ...this.savedObject,
                                lpnOperations: { ...this.savedObject.lpnOperations, ...values },
                            };
                            this._saveLpnOperations();
                        }
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

    /*
     *  Init functions
     */

    private async _init(): Promise<void> {
        await this._readSavedObject();
        await this._initSite();

        if (this.stockSite.value && this._mobileSettings.stockField1) {
            this._initLocationField();
            this._initStockChangeLines();
            this._postInitStockChangeLines();
            if (this.savedObject.selectedLicensePlateNumber) {
                this.licensePlateNumber.value = this.savedObject.selectedLicensePlateNumber;
                this.licensePlateNumber.isDisabled = true;
                if (this.savedObject.selectedLocation)
                    this.locationDestination.value = this.savedObject.selectedLocation;
                if (this.licensePlateNumber.value.isSingleProduct) {
                    this.product.value = this.savedObject.selectedProduct;
                    this.product.isDisabled = true;
                } else this.product.isDisabled = false;
            }
            this.location.isDisabled = false;

            if (this.licensePlateNumber.isDisabled) {
                this.licensePlateNumber.getNextField(true)?.focus();
            } else {
                this.licensePlateNumber.focus();
            }
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

    private _initLocationField() {
        const _stockFieldSettings = [
            this._mobileSettings.stockField1,
            this._mobileSettings.stockField2,
            this._mobileSettings.stockField3,
            this._mobileSettings.stockField4,
            this._mobileSettings.stockField5,
            this._mobileSettings.stockField6,
            this._mobileSettings.stockField7,
            this._mobileSettings.stockField8,
        ];
        if (findSetting('location', _stockFieldSettings) === false) {
            this.location.isHidden = true;
        }
    }

    private async _readSavedObject(): Promise<void> {
        const storedString = this.$.storage.get('mobile-lpnOperations') as string;

        if (!storedString) {
            this._initStorage();
        } else {
            this.savedObject = JSON.parse(storedString) as inputsLpnLinking;

            if (!this._checkStorage()) {
                return await this._reInitStorage();
            }
        }
    }

    private _disablePage(): void {
        this.effectiveDate.isDisabled = true;
        this.licensePlateNumber.isDisabled = true;
        this.locationDestination.isDisabled = true;
    }

    /*
    storage functions
    */

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

    private async _reInitStorage(): Promise<void> {
        await this._notifier.showAndWait(
            ui.localize(
                '@sage/x3-stock/pages__mobile_lpn_linking__notification__storage_error',
                `An error occurred loading the storage, the page will restart to cleanup`,
            ),
            'error',
        );
        this._initStorage();
        return this.$.router.goTo('@sage/x3-stock/MobileLpnLinking');
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

    private _saveLpnOperations(data = this.savedObject) {
        this.$.storage.set('mobile-lpnOperations', JSON.stringify({ ...data }));
    }

    private _mapStockChange(change: Partial<LpnOperationsLineInput>[]) {
        let rowCount = 0;
        return change.map((line: LpnOperationsLineInput) => {
            const _stockDetail = line?.stockDetails;
            const _location = _stockDetail ? _stockDetail[0]?.location : null;
            return {
                _id: String(rowCount++), // this defines the rowId parameter in dropdownActions onClick() event
                //licensePlateNumber: line.stockDetails[0].licensePlateNumber,
                product: line.product,
                location: _location ? `${_location}` : null,
                //status: line.status ? `To ${line.status}` : null,
                stockSite: this.stockSite.value,
            };
        });
    }
    private _initStockChangeLines() {
        this.savedObject.lpnOperations.licensePlateNumberOperationMode = 4;
        this.savedObject.lpnOperations.stockSite = this.stockSite.value ?? undefined;

        if (this.savedObject.lpnOperations.stockChangeLines) {
            this.savedObject.lpnOperations.stockChangeLines = this.savedObject.lpnOperations.stockChangeLines.map(
                (line: LpnOperationsLineInput) => {
                    return {
                        ...line,
                        stockSite: this.stockSite.value ?? undefined,
                    };
                },
            );
        }

        if (
            this.savedObject?.lpnOperations?.stockChangeLines &&
            this.savedObject.lpnOperations.stockChangeLines.length > 0
        ) {
            this.stockChangeLinesBlock.isHidden = false;
            this.stockChangeLines.value =
                this.savedObject.lpnOperations.stockChangeLines?.map(line => ({
                    ...line,
                    _id: this.stockChangeLines.generateRecordId(),
                })) ?? [];
            this.stockChangeLines.title = ui.localize(
                '@sage/x3-stock/pages__mobile_lpn_linking__title_table',
                'Links: {{ title }}',
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

        if (
            this.savedObject?.lpnOperations?.stockChangeLines &&
            this.savedObject.lpnOperations.stockChangeLines?.length > 0
        ) {
            this.createButton.isDisabled = false;
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

    /*
     * Read the stock node to ensure there is some inventory for the entered details
     */
    private async _getProductOrLot(singleLot: boolean, lpnDestination: string, locationDestination: string) {
        try {
            const stockFilter: any = {
                stockSite: this.stockSite.value,
                licensePlateNumber: lpnDestination,
                location: locationDestination,
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
                this.product.value = { code: _stocks[0].product?.product?.code ?? null };
                const _productSite = extractEdges<ProductSite>(
                    await this.$.graph
                        .node('@sage/x3-master-data/ProductSite')
                        .query(
                            ui.queryUtils.edgesSelector(
                                {
                                    isBeingCounted: true,
                                },
                                {
                                    filter: {
                                        product: {
                                            code: this.product.value.code,
                                        },
                                        stockSite: {
                                            code: this.stockSite.value,
                                        },
                                    },
                                },
                            ),
                        )
                        .execute(),
                );

                if (_productSite.length && _productSite[0].isBeingCounted === true) {
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
                        this.product.isDisabled = true;
                        this.nextButton.isHidden = false;
                    } else {
                        this.product.value = null;
                        this.locationDestination.value = null;
                        this.licensePlateNumber.value = null;
                        this.licensePlateNumber.focus();
                    }
                } else {
                    this.product.isDisabled = true;
                    this.nextButton.isHidden = false;
                }

                await this.$.commitValueAndPropertyChanges();
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
}
