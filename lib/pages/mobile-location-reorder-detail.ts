import { dialogConfirmation, dialogMessage } from '@sage/x3-master-data/lib/client-functions/dialogs';
import { GraphApi } from '@sage/x3-stock-api';
import { ClientError, ErrorDetail } from '@sage/xtrem-client';
import { ApiError } from '@sage/xtrem-shared';
import * as ui from '@sage/xtrem-ui';
import { validateWithDetails } from '../client-functions/control';

enum Source {
    replenishment = 1,
    consumption = 2,
    shortage = 3,
}

interface ProductSetting {
    displayLot: boolean;
    displaySublot: boolean;
    displaySerial: boolean;
}

@ui.decorators.page<MobileLocationReorderDetail>({
    title: 'Location reordering',
    subtitle: 'Enter quantity',
    isTitleHidden: true,
    isTransient: true,
    headerCard() {
        return {
            title: this.storageListNumber,
            line2: this.productAndSource,
            line3: this.localizedDescription1,
        };
    },
    businessActions() {
        return [this.previousButton, this.submitButton];
    },
    async onLoad() {
        const productSetting: ProductSetting = await this.getProductSettings();
        if (!productSetting.displayLot) {
            this.lotField.isHidden = true;
        }
        if (!productSetting.displaySublot) {
            this.sublotField.isHidden = true;
        }
        if (!productSetting.displaySerial) {
            this.serialNumberField.isHidden = true;
        }

        this.$.setPageClean();
        this.storageListNumber.value = String(this.$.queryParameters.storageListNumber);
        this.productAndSource.value =
            String(this.$.queryParameters.product) + ' (' + String(this.$.queryParameters.source) + ')';
        this.stockSite = String(this.$.queryParameters.stockSite);
        this.transaction = String(this.$.queryParameters.entryTransaction);
        this.fromLocation.value = String(this.$.queryParameters.fromLocation);
        this.toLocation.value = String(this.$.queryParameters.toLocation);
        this.lotField.value = String(this.$.queryParameters.lot);
        this.sublotField.value = String(this.$.queryParameters.sublot);
        this.serialNumberField.value = String(this.$.queryParameters.serialNumber);
        this.unitField.value = String(this.$.queryParameters.reorderUnit);
        this.quantityField.value = Number(this.$.queryParameters.reorderQuantity);
        this.statusField.value = String(this.$.queryParameters.status);
        this.reorderQuantityField.value = Number(this.$.queryParameters.reorderQuantity);

        this.documentLine = String(this.$.queryParameters.documentLineNumber);
        this.stockId = String(this.$.queryParameters.stockId);
        this.stockSequence = String(this.$.queryParameters.stockSequence);
        this.identifier1 = String(this.$.queryParameters.identifier1);
        this.identifier2 = String(this.$.queryParameters.identifier2);
        this.licensePlateNumber = String(this.$.queryParameters.licensePlateNumber);
        this.packingUnitToStockUnitConversionFactor = String(
            this.$.queryParameters.packingUnitToStockUnitConversionFactor,
        );

        this.size = Number(this.$.queryParameters.size);
        this.quantityField.scale = Number(this.$.queryParameters.decimalPrecision);
        this.reorderQuantityField.scale = Number(this.$.queryParameters.decimalPrecision);
        this.reorderQuantityField.max = this.reorderQuantityField.value;
        this.reorderQuantityField.focus();
    },
})
export class MobileLocationReorderDetail extends ui.Page<GraphApi> {
    private transaction: string = '';
    private stockSite: string = '';
    private documentLine: string = '';
    private stockId: string = '';
    private stockSequence: string = '';
    private identifier1: string = '';
    private identifier2: string = '';
    private licensePlateNumber: string = '';
    private packingUnitToStockUnitConversionFactor: string = '';
    private size: number = -1;

    private async getProductSettings(): Promise<ProductSetting> {
        const response = await this.$.graph
            .node('@sage/x3-master-data/Product')
            .query(
                ui.queryUtils.edgesSelector(
                    {
                        lotManagementMode: true,
                        serialNumberManagementMode: true,
                        localizedDescription1: true,
                    },
                    {
                        filter: {
                            code: this.$.queryParameters.product,
                        },
                    },
                ),
            )
            .execute();

        let productSetting: ProductSetting = {
            displayLot: true,
            displaySublot: true,
            displaySerial: true,
        };

        for (let item of response.edges) {
            if (item.node.lotManagementMode == 'notManaged') {
                productSetting.displayLot = false;
            }
            if (item.node.lotManagementMode != 'lotAndSublot') {
                productSetting.displaySublot = false;
            }
            if (
                item.node.serialNumberManagementMode == 'notManaged' ||
                item.node.serialNumberManagementMode == 'issued'
            ) {
                productSetting.displaySerial = false;
            }
        }

        // TODO: Some refactoring should be done. GraphQL to product node should be a read request because it is uniquely indexed by code
        this.localizedDescription1.value = response.edges[0].node.localizedDescription1;

        return productSetting;
    }

    @ui.decorators.textField<MobileLocationReorderDetail>({
        isTransient: false,
        isReadOnly: true,
    })
    storageListNumber: ui.fields.Text;

    @ui.decorators.textField<MobileLocationReorderDetail>({
        isTransient: false,
        isReadOnly: true,
    })
    productAndSource: ui.fields.Text;

    @ui.decorators.textField<MobileLocationReorderDetail>({
        isReadOnly: true,
    })
    localizedDescription1: ui.fields.Text;

    @ui.decorators.section<MobileLocationReorderDetail>({
        isTitleHidden: true,
        isHidden: false,
    })
    mainSection: ui.containers.Section;

    @ui.decorators.block<MobileLocationReorderDetail>({
        parent() {
            return this.mainSection;
        },
    })
    mainBlock: ui.containers.Block;

    @ui.decorators.textField<MobileLocationReorderDetail>({
        isTransient: false,
        isReadOnly: true,
        parent() {
            return this.mainBlock;
        },
        title: 'From location',
    })
    fromLocation: ui.fields.Text;

    @ui.decorators.textField<MobileLocationReorderDetail>({
        isTransient: false,
        isReadOnly: true,
        parent() {
            return this.mainBlock;
        },
        title: 'To location',
    })
    toLocation: ui.fields.Text;

    @ui.decorators.textField<MobileLocationReorderDetail>({
        isFullWidth: true,
        isReadOnly: true,
        parent() {
            return this.mainBlock;
        },
        title: 'Lot',
    })
    lotField: ui.fields.Text;

    @ui.decorators.textField<MobileLocationReorderDetail>({
        isFullWidth: true,
        isReadOnly: true,
        parent() {
            return this.mainBlock;
        },
        title: 'Sublot',
    })
    sublotField: ui.fields.Text;

    @ui.decorators.textField<MobileLocationReorderDetail>({
        isFullWidth: true,
        isReadOnly: true,
        parent() {
            return this.mainBlock;
        },
        title: 'Serial number',
    })
    serialNumberField: ui.fields.Text;

    @ui.decorators.textField<MobileLocationReorderDetail>({
        isReadOnly: true,
        parent() {
            return this.mainBlock;
        },
        title: 'Unit',
    })
    unitField: ui.fields.Text;

    @ui.decorators.numericField<MobileLocationReorderDetail>({
        isReadOnly: true,
        parent() {
            return this.mainBlock;
        },
        title: 'Quantity',
    })
    quantityField: ui.fields.Numeric;

    @ui.decorators.textField<MobileLocationReorderDetail>({
        isReadOnly: true,
        parent() {
            return this.mainBlock;
        },
        title: 'Status',
    })
    statusField: ui.fields.Text;

    @ui.decorators.numericField<MobileLocationReorderDetail>({
        parent() {
            return this.mainBlock;
        },
        title: 'Reorder quantity',
        isMandatory: true,
        placeholder: 'Enter a quantity',
        min: 0,
        isNotZero: true,
    })
    reorderQuantityField: ui.fields.Numeric;

    @ui.decorators.pageAction<MobileLocationReorderDetail>({
        title: 'Previous',
        shortcut: ['f4'],
        buttonType: 'secondary',
        async onClick() {
            this.$.setPageClean();
            this.$.router.goTo('@sage/x3-stock/MobileLocationReorderTodo', {
                stockSite: this.stockSite,
                storageListNumber: this.storageListNumber.value,
                entryTransaction: this.transaction,
            });
        },
    })
    previousButton: ui.PageAction;

    @ui.decorators.pageAction<MobileLocationReorderDetail>({
        title: 'Submit',
        shortcut: ['f2'],
        buttonType: 'primary',
        isDisabled: false,
        async onClick() {
            if (!(await validateWithDetails(this))) return;
            this.submitButton.isDisabled = true;
            this.previousButton.isDisabled = true;
            this.$.loader.isHidden = false;
            const result = await this.callLocationReorderApi();
            this.$.loader.isHidden = true;

            // Special case unable to connect check type of error :
            if (this.isWebServiceError(result)) {
                await this.$.sound.error();
                if (
                    await dialogConfirmation(
                        this,
                        'error',
                        ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                        ui.localize(
                            '@sage/x3-stock/pages_creation_error_connexion_webservice_contact_administrator',
                            'An error has occurred (connection or webservice error). Please contact your administrator.',
                        ),
                        {
                            acceptButton: {
                                text: ui.localize('@sage/x3-stock/button-goback', 'Go back'),
                            },
                            cancelButton: {
                                text: ui.localize('@sage/x3-stock/button-cancel', 'Cancel'),
                            },
                            size: 'small',
                        },
                    )
                ) {
                    await this.$.router.refresh();
                } else {
                    await this.$.router.emptyPage();
                    this.$.router.goTo('@sage/x3-stock/MobileLocationReorder');
                }

                return;
            }

            if (!(result instanceof Error)) {
                this.$.setPageClean();
                await this.$.sound.success();
                if (this.size == 1) {
                    await dialogMessage(
                        this,
                        'success',
                        ui.localize('@sage/x3-stock/dialog-success-title', 'Success'),
                        ui.localize(
                            '@sage/x3-stock/dialog-success-location-reorder-complete',
                            'Location reorder complete',
                        ),
                    );

                    this.$.router.goTo('@sage/x3-stock/MobileLocationReorder');
                } else {
                    this.$.router.goTo('@sage/x3-stock/MobileLocationReorderTodo', {
                        stockSite: this.stockSite,
                        storageListNumber: this.storageListNumber.value,
                        entryTransaction: this.transaction,
                    });
                }
            } else {
                const errorIndex = result.message.indexOf(':');
                await this.$.sound.error();
                if (
                    await dialogConfirmation(
                        this,
                        'error',
                        ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                        `${ui.localize('@sage/x3-stock/dialog-error-location-reorder-update', 'An error occurred')}: ${
                            errorIndex === -1 ? result.message : result.message.substring(errorIndex + 1)
                        }`,
                        {
                            fullScreen: true,
                            acceptButton: {
                                text: ui.localize('@sage/x3-stock/button-goback', 'Go back'),
                            },
                            cancelButton: {
                                text: ui.localize('@sage/x3-stock/button-cancel', 'Cancel'),
                            },
                            size: 'small',
                        },
                    )
                ) {
                    //accept button clicked
                    this.$.setPageClean();
                    this.submitButton.isDisabled = false;
                    this.previousButton.isDisabled = false;
                } else {
                    //cancel button clicked
                    //Return to page 2
                    this.$.setPageClean();
                    this.$.router.goTo('@sage/x3-stock/MobileLocationReorderTodo', {
                        stockSite: this.stockSite,
                        storageListNumber: this.storageListNumber.value,
                        entryTransaction: this.transaction,
                    });
                }
            }
        },
    })
    submitButton: ui.PageAction;

    private async callLocationReorderApi(): Promise<any> {
        this.$.removeToasts();

        const reorderArgs: any = {
            stockEntryTransaction: this.transaction,
            documentNumber: this.storageListNumber.value,
            documentLine: Number(this.documentLine),
            stockSite: this.stockSite,
            destinationLocation: this.toLocation.value,
            source: '',
            stockId: Number(this.stockId),
            stockSequence: Number(this.stockSequence),
            product: this.$.queryParameters.product.toString(),
            fromLocation: this.fromLocation.value,
            lot: this.lotField.value,
            sublot: this.sublotField.value,
            serialNumber: this.serialNumberField.value,
            status: this.statusField.value,
            identifier1: this.identifier1,
            identifier2: this.identifier2,
            licensePlateNumber: this.licensePlateNumber,
            packingUnit: this.unitField.value,
            packingUnitToStockUnitConversionFactor: Number(this.packingUnitToStockUnitConversionFactor),
            packingQuantity: Number(this.reorderQuantityField.value),
        };

        const tempSource: string = this.$.queryParameters.source.toString();
        if (tempSource == 'Replenishment') {
            reorderArgs.source = Source.replenishment;
        } else if (tempSource == 'Consumption') {
            reorderArgs.source = Source.consumption;
        } else {
            reorderArgs.source = Source.shortage;
        }

        try {
            return await this.$.graph
                .node('@sage/x3-stock/StockReorder')
                .mutations.processReorder(
                    {
                        stockEntryTransaction: true,
                        documentNumber: true,
                        documentLine: true,
                        stockSite: true,
                        destinationLocation: true,
                        source: true,
                        stockId: true,
                        stockSequence: true,
                        product: true,
                        fromLocation: true,
                        lot: true,
                        sublot: true,
                        serialNumber: true,
                        status: true,
                        identifier1: true,
                        identifier2: true,
                        licensePlateNumber: true,
                        packingUnit: true,
                        packingUnitToStockUnitConversionFactor: true,
                        packingQuantity: true,
                    },
                    {
                        parameters: reorderArgs,
                    },
                )
                .execute();
        } catch (error) {
            return error;
        }
    }

    /** @internal */
    private isWebServiceError(error: any): boolean {
        // errors contains a array or undefined when is not class ClientError
        // diagnoses contains a array or undefined when is not class ApiError
        // TODO:  See to increase this feature
        const diagnoses = (<ApiError>error)?.diagnoses;
        const errors: ErrorDetail[] = (<ClientError>error)?.errors;

        return (
            error instanceof Error &&
            ((diagnoses && diagnoses.length === 0) ||
                (errors &&
                    errors.length > 0 &&
                    errors.some(
                        detail =>
                            detail?.extensions?.code === 'business-rule-error' &&
                            (detail.message.startsWith('Failed to get description for web service') ||
                                detail.message.endsWith('Channel allocation refused')),
                    )))
        );
    }
}
