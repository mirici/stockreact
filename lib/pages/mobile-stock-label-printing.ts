import { MobileAutomationSetup, Product, UnitOfMeasure } from '@sage/x3-master-data-api';
import { dialogConfirmation, dialogMessage } from '@sage/x3-master-data/lib/client-functions/dialogs';
import { getSelectedStockSite } from '@sage/x3-master-data/lib/client-functions/get-selected-stock-site';
import { GraphApi } from '@sage/x3-stock-api';
import { Location, StockStatus } from '@sage/x3-stock-data-api';
import { other } from '@sage/x3-stock-data/build/lib/menu-items/other';
import { Destination } from '@sage/x3-system-api';
import { genericPrintReport } from '@sage/x3-system/lib/client-functions/generic-print-report';
import { ExtractEdges, extractEdges } from '@sage/xtrem-client';
import { DateValue } from '@sage/xtrem-date-time';
import * as ui from '@sage/xtrem-ui';
import { validateWithDetails } from '../client-functions/control';

@ui.decorators.page<MobileStockLabelPrinting>({
    title: 'Stock label printing',
    mode: 'default',
    menuItem: other,
    priority: 300,
    isTransient: false,
    isTitleHidden: true,
    authorizationCode: 'CWSSLP',
    access: { node: '@sage/x3-system/GenericPrintReport' },
    async onLoad() {
        if (!(await this._init())) {
            this._disablePage();
        }
    },
    businessActions() {
        return [this.printButton];
    },
})
export class MobileStockLabelPrinting extends ui.Page<GraphApi> {
    stockLabel = '';
    isAlwaysLabelDestination: boolean | null;

    @ui.decorators.textField<MobileStockLabelPrinting>({
        isHidden: true,
    })
    site: ui.fields.Text;

    @ui.decorators.pageAction<MobileStockLabelPrinting>({
        title: 'Print',
        buttonType: 'primary',
        shortcut: ['f2'],
        isDisabled: true,
        async onClick() {
            if (!(await validateWithDetails(this))) return;
            this.printButton.isDisabled = true;
            this.$.loader.isHidden = false;
            const result = await this._callPrintAPI();
            this.$.loader.isHidden = true;

            if ((!result && result !== 0) || result instanceof Error) {
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

                    // This is used to retrieve messages from the Client() class otherwise BusinessRuleError

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

                    options.mdContent = true;

                    message = `**${ui.localize('@sage/x3-stock/dialog-print-an-error-occurred', 'An error occurred.')}**\n\n`;

                    if (_result.length === 1) {
                        message += `${_result[0]}`;
                    } else {
                        message += _result.map(item => `* ${item}`).join('\n');
                    }
                }

                this.$.loader.isHidden = true;
                this.printButton.isDisabled = false;

                await this.$.sound.error();

                if (
                    !(await dialogConfirmation(
                        this,
                        'error',
                        ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                        message,
                        options,
                    ))
                ) {
                    return;
                }
            } else {
                // if success, first clean up session & reload the page, then display success message
                const options: ui.dialogs.DialogOptions = {
                    acceptButton: {
                        text: ui.localize('@sage/x3-stock/button-accept-ok', 'OK'),
                    },
                };

                await this.$.sound.success();

                await dialogMessage(
                    this,
                    'success',
                    ui.localize('@sage/x3-stock/dialog-success-title', 'Success'),
                    ui.localize(
                        '@sage/x3-stock/dialog-success-stock-labels-printed',
                        'Labels printed: {{stockLabel}}.',
                        {
                            stockLabel: this.stockLabel,
                        },
                    ),
                    options,
                );

                this.$.setPageClean();
                await this.$.router.refresh();
                this.product.focus();
            }

            this._setPrintButtonEnabled();
        },
    })
    printButton: ui.PageAction;

    @ui.decorators.section<MobileStockLabelPrinting>({
        isTitleHidden: true,
    })
    mainSection: ui.containers.Section;

    @ui.decorators.block<MobileStockLabelPrinting>({
        parent() {
            return this.mainSection;
        },
        isTitleHidden: true,
    })
    productBlock: ui.containers.Block;

    @ui.decorators.block<MobileStockLabelPrinting>({
        parent() {
            return this.mainSection;
        },
        isTitleHidden: true,
    })
    parametersBlock: ui.containers.Block;

    @ui.decorators.referenceField<MobileStockLabelPrinting, Product>({
        parent() {
            return this.productBlock;
        },
        title: 'Product',
        placeholder: 'Scan or select...',
        node: '@sage/x3-master-data/Product',
        valueField: 'code',
        helperTextField: 'description1',
        filter() {
            return {
                productSites: {
                    _atLeast: 1,
                    stockSite: this.site.value ?? undefined,
                },
            };
        },
        onChange() {
            this._setPrintButtonEnabled();
        },
        onError(error: any, originScreenId: string, originElementId: string) {
            ui.console.warn(`Error on ${originScreenId} ${originElementId}: ${error.message || error}`);
        },
        isAutoSelectEnabled: true,
        isTransient: true,
        isMandatory: true,
        canFilter: false,
        columns: [
            ui.nestedFields.text({
                bind: 'code',
                title: 'Product',
                isReadOnly: true,
                isTitleHidden: true,
            }),
            ui.nestedFields.text({
                bind: 'description1',
                title: 'Description',
                isReadOnly: true,
                isTitleHidden: true,
            }),
            ui.nestedFields.reference({
                node: '@sage/x3-master-data/ProductCategory',
                bind: 'productCategory',
                valueField: 'code',
                title: 'Category',
                isReadOnly: true,
                isTitleHidden: true,
            }),
            ui.nestedFields.text({
                bind: 'productStatus',
                title: 'Status',
                isReadOnly: true,
                isTitleHidden: true,
            }),
            ui.nestedFields.text({
                bind: 'upc',
                title: 'UPC code',
                isReadOnly: true,
                isTitleHidden: false,
            }),
        ],
    })
    product: ui.fields.Reference;

    @ui.decorators.textField<MobileStockLabelPrinting>({
        parent() {
            return this.parametersBlock;
        },
        title: 'Entry no.',
        isMandatory: false,
        maxLength: 20,
    })
    entryNumber: ui.fields.Text;

    @ui.decorators.selectField<MobileStockLabelPrinting>({
        parent() {
            return this.parametersBlock;
        },
        title: 'Stock unit',
        isMandatory: true,
        onChange() {
            this.stockUnit.getNextField(true)?.focus();
        },
    })
    stockUnit: ui.fields.Select;

    @ui.decorators.referenceField<MobileStockLabelPrinting, Location>({
        parent() {
            return this.parametersBlock;
        },
        title: 'Location',
        placeholder: 'Scan or select...',
        node: '@sage/x3-stock-data/Location',
        isAutoSelectEnabled: true,
        valueField: 'code',
        filter() {
            return {
                stockSite: { code: this.site.value ?? undefined },
            };
        },
        onChange() {
            if (this.location.value) this.location.getNextField(true)?.focus();
        },
        columns: [
            ui.nestedFields.text({
                bind: 'code',
                title: 'Code',
                isReadOnly: true,
            }),
            ui.nestedFields.text({
                bind: 'type',
                title: 'Type',
                isReadOnly: true,
            }),
        ],
        minLookupCharacters: 1,
        isMandatory: false,
        canFilter: false,
    })
    location: ui.fields.Reference;

    @ui.decorators.textField<MobileStockLabelPrinting>({
        parent() {
            return this.parametersBlock;
        },
        title: 'Lot',
        maxLength: 15,
        isMandatory: false,
    })
    lot: ui.fields.Text;

    @ui.decorators.textField<MobileStockLabelPrinting>({
        parent() {
            return this.parametersBlock;
        },
        title: 'Sub-lot',
        maxLength: 5,
        isMandatory: false,
    })
    subLot: ui.fields.Text;

    @ui.decorators.selectField<MobileStockLabelPrinting>({
        parent() {
            return this.parametersBlock;
        },
        title: 'Stock status',
        isMandatory: false,
        onChange() {
            this.stockStatus.getNextField(true)?.focus();
        },
    })
    stockStatus: ui.fields.Select;

    @ui.decorators.numericField<MobileStockLabelPrinting>({
        parent() {
            return this.parametersBlock;
        },
        title: 'Receipt quantity',
        isMandatory: true,
        validation: /^([1-9][0-9]*(\.[0-9]+)?|[0]+\.[0-9]*[1-9][0-9]*)$/, // reg ex for any positive numbers (integers or decimals) excluding 0
        min: 0,
    })
    receiptQuantity: ui.fields.Numeric;

    @ui.decorators.dateField<MobileStockLabelPrinting>({
        parent() {
            return this.parametersBlock;
        },
        title: 'Receipt date',
        isTransient: true,
        isMandatory: false,
    })
    receiptDate: ui.fields.Date;

    @ui.decorators.dateField<MobileStockLabelPrinting>({
        parent() {
            return this.parametersBlock;
        },
        title: 'Expiration date',
        isTransient: true,
        isMandatory: false,
    })
    expirationDate: ui.fields.Date;

    @ui.decorators.numericField<MobileStockLabelPrinting>({
        parent() {
            return this.parametersBlock;
        },
        title: 'Number of labels',
        isMandatory: true,
        validation: /^([1-9][0-9]*(\.[0-9]+)?|[0]+\.[0-9]*[1-9][0-9]*)$/, // reg ex for any positive numbers (integers or decimals) excluding 0
        min: 1,
    })
    numberOfLabel: ui.fields.Numeric;

    @ui.decorators.referenceField<MobileStockLabelPrinting, Destination>({
        node: '@sage/x3-system/Destination',
        filter() {
            return {
                isActive: true,
                destination: { _in: ['printer', 'zplPrinter'] },
            };
        },
        valueField: 'code',
        columns: [
            ui.nestedFields.text({ bind: 'code', title: 'Code', canFilter: true }),
            ui.nestedFields.text({ bind: 'description', title: 'Description', canFilter: true }),
            ui.nestedFields.text({ bind: 'destination', title: 'Type', canFilter: true }),
            ui.nestedFields.text({ bind: 'printerName', title: 'Name', canFilter: true }),
            ui.nestedFields.checkbox({ bind: 'isActive', isHidden: true }),
            ui.nestedFields.text({ bind: 'destination', isHidden: true }),
        ],
        isAutoSelectEnabled: true,
        title: 'Label destination',
        helperTextField: 'description',
        canFilter: false,
        parent() {
            return this.parametersBlock;
        },
        onChange() {
            this._setPrintButtonEnabled();
        },
    })
    destination: ui.fields.Reference;

    private async _init(): Promise<boolean> {
        await this._initSite();
        if (this.site.value) {
            this.numberOfLabel.value = 1;
            this.expirationDate.value = await this._getDate();
            this.receiptDate.value = await this._getDate();
            if (await this._getLabel()) {
                this._setPrintButtonEnabled();
                await this._getListStockUnit();
                await this._getListStockStatus();
                return true;
            }
        }

        return false;
    }

    private _disablePage(): void {
        this.product.isDisabled = true;
        this.entryNumber.isDisabled = true;
        this.stockUnit.isDisabled = true;
        this.location.isDisabled = true;
        this.lot.isDisabled = true;
        this.subLot.isDisabled = true;
        this.stockStatus.isDisabled = true;
        this.receiptQuantity.isDisabled = true;
        this.receiptDate.isDisabled = true;
        this.expirationDate.isDisabled = true;
        this.numberOfLabel.isDisabled = true;
        this.destination.isDisabled = true;
    }

    private async _initSite(): Promise<void> {
        this.site.value = await getSelectedStockSite(
            this,
            ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
            ui.localize(
                '@sage/x3-stock/dialog-error-location-inquiry-set-site',
                'Define a default stock site on the user function profile.',
            ),
        );
    }

    private _setPrintButtonEnabled() {
        this.printButton.isDisabled =
            this.product.value === null ||
            this.destination.value === null ||
            this.stockUnit.value === '' ||
            this.numberOfLabel.value === 0;
    }

    private async _getDate(): Promise<string> {
        return DateValue.today().toString();
    }

    private async _getLabel(): Promise<boolean> {
        const options: ui.dialogs.DialogOptions = {
            acceptButton: {
                text: ui.localize('@sage/x3-stock/button-accept-ok', 'OK'),
            },
        };

        const _response = extractEdges<any>(
            await this.$.graph
                .node('@sage/x3-master-data/MobileAutomationSetup')
                .query(
                    ui.queryUtils.edgesSelector<MobileAutomationSetup>(
                        {
                            stockLabel: { reportName: true },
                            isAlwaysLabelDestination: true,
                        },
                        {
                            filter: {
                                _and: [
                                    { site: { code: this.site.value ?? '' } },
                                    { stockLabel: { reportName: { _ne: null } } },
                                ],
                            },
                            orderBy: { site: { code: -1 } },
                        },
                    ),
                )
                .execute(),
        );

        if (!this._assignLabelWhenExisting(_response)) {
            const _response = extractEdges<any>(
                await this.$.graph
                    .node('@sage/x3-master-data/MobileAutomationSetup')
                    .query(
                        ui.queryUtils.edgesSelector<MobileAutomationSetup>(
                            {
                                stockLabel: { reportName: true },
                                isAlwaysLabelDestination: true,
                            },
                            {
                                filter: {
                                    _and: [{ site: '' }, { stockLabel: { reportName: { _ne: null } } }],
                                },
                            },
                        ),
                    )
                    .execute(),
            );
            if (!this.site.value || !this._assignLabelWhenExisting(_response)) {
                this.stockLabel = '';
                this.isAlwaysLabelDestination = false;
            }
        }

        if (this.stockLabel === '') {
            // CAUTION: Do not use await here
            dialogMessage(
                this,
                'error',
                ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                ui.localize('@sage/x3-stock/dialog-error-no-stock-label-setup', 'No stock label setup'),
                options,
            );
            return false;
        }
        const mobileLabelDestination = this.$.storage.get('mobile-label-destination') as string;
        if (this.isAlwaysLabelDestination) {
            if (!mobileLabelDestination) {
                // CAUTION: Do not use await here
                dialogMessage(
                    this,
                    'error',
                    ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                    ui.localize(
                        '@sage/x3-stock/dialog-error-no-label-destination-defined',
                        'No label destination defined',
                    ),
                    options,
                );
                return false;
            } else {
                this.destination.isDisabled = true;
                this.destination.value = { code: mobileLabelDestination };
            }
        } else {
            if (this.stockLabel !== '') {
                this.destination.isDisabled = false;
            }
            if (mobileLabelDestination) {
                this.destination.value = { code: mobileLabelDestination };
            }
        }
        return true;
    }

    /**
     * assign label when existing.
     * @param _response
     * @returns true when label assigned
     */
    private _assignLabelWhenExisting(_response: ExtractEdges<any>[]): boolean {
        return (
            !!_response?.length &&
            _response.some(edge => {
                const _label = edge.stockLabel?.reportName;
                if (_label) {
                    this.stockLabel = _label ?? '';
                    this.isAlwaysLabelDestination = edge.isAlwaysLabelDestination;
                }
                return !!_label;
            })
        );
    }

    private async _getListStockUnit(): Promise<void> {
        const response = extractEdges<any>(
            await this.$.graph
                .node('@sage/x3-master-data/UnitOfMeasure')
                .query(
                    ui.queryUtils.edgesSelector<UnitOfMeasure>(
                        {
                            code: true,
                        },
                        {
                            first: 500,
                        },
                    ),
                )
                .execute(),
        );

        if (response.length) {
            const stockUnits: string[] = [];
            response.some(edge => {
                stockUnits.push(edge.code);
            });
            this.stockUnit.options = stockUnits;
        }
    }

    private async _getListStockStatus(): Promise<void> {
        const response = extractEdges<any>(
            await this.$.graph
                .node('@sage/x3-stock-data/StockStatus')
                .query(
                    ui.queryUtils.edgesSelector<StockStatus>(
                        {
                            code: true,
                        },
                        {
                            first: 500,
                        },
                    ),
                )
                .execute(),
        );

        if (response.length) {
            const stockStatus: string[] = [];
            response.some(edge => {
                stockStatus.push(edge.code);
            });
            this.stockStatus.options = stockStatus;
        }
    }

    private async _callPrintAPI(): Promise<any> {
        let result: number;

        const customParameters = {
            site: this.site.value,
            product: this.product?.value?.code,
            entry: this.entryNumber.value,
            stockunit: this.stockUnit.value,
            location: this.location?.value?.code,
            lot: this.lot.value,
            sublot: this.subLot.value,
            status: this.stockStatus.value,
            receiptdate: this.receiptDate.value,
            receiptquantity: this.receiptQuantity.value,
            expirationdate: this.expirationDate.value,
            numberoflabels: this.numberOfLabel.value,
        };

        try {
            result = await genericPrintReport(
                this,
                this.stockLabel,
                '',
                this.destination.value?.code ?? '',
                customParameters,
            );
        } catch (error) {
            return error;
        }

        return result;
    }
}
