import { Container, Product, UnitOfMeasure } from '@sage/x3-master-data-api';
import { dialogConfirmation, dialogMessage } from '@sage/x3-master-data/lib/client-functions/dialogs';
import { GraphApi, StorageDetails } from '@sage/x3-stock-api';
import { LicensePlateNumber, Location, Lot, StockStatusInput } from '@sage/x3-stock-data-api';
import { Site } from '@sage/x3-system-api';
import { ClientError, ErrorDetail, ExtractEdgesPartial, Filter, extractEdges } from '@sage/xtrem-client';
import { Decimal } from '@sage/xtrem-decimal';
import { ApiError } from '@sage/xtrem-shared';
import * as ui from '@sage/xtrem-ui';
import { validateWithDetails } from '../client-functions/control';

@ui.decorators.page<MobilePutawayDetail>({
    title: 'Putaway',
    subtitle: 'Enter details',
    isTitleHidden: true,
    isTransient: true, // make this a fully transient page by deriving all necessary data from current session
    mode: 'default',
    async onLoad() {
        try {
            this._totalCount = (this.$.queryParameters.totalCount as number) ?? 0;
            // TODO Issue: The serialized object is actually of type ExtractEdges<StorageDetails>, not StorageDetails
            await this._initializePage(
                this.$.queryParameters.stockTransaction as string,
                JSON.parse(this.$.storage.get('MobilePutawayTodo') as string),
            );
        } catch (e) {
            // If session got corrupted or retired, then return back to 1st page
            ui.console.log(`Missing required parameters due to\\n${e}`);

            this.$.showToast(
                ui.localize('@sage/x3-stock/notification-error-missing-params', 'Missing required parameters'),
                { type: 'error' },
            );
            this.$.router.goTo('@sage/x3-stock/MobilePutaway');
            return;
        }
    },
    headerCard() {
        return {
            title: this._storageListNumber,
            line2: this.headerProduct,
            line3: this._localizedDescription1,
        };
    },
    businessActions() {
        return [this.previousButton, this.submitButton];
    },
})
export class MobilePutawayDetail extends ui.Page<GraphApi> {
    private _totalCount: number; // total remaining storage worksheet lines to process, including this one currently shown to the user
    private _stockTransaction: string;
    private _storageDetails: ExtractEdgesPartial<StorageDetails>;

    @ui.decorators.referenceField<MobilePutawayDetail, Site>({
        isTransient: true,
        isHidden: true,
        node: '@sage/x3-system/Site',
        valueField: 'code',
        canFilter: false,
    })
    _site: ui.fields.Reference<Site>;

    @ui.decorators.textField<MobilePutawayDetail>({
        isTransient: true,
        isHidden: false,
        isReadOnly: true,
    })
    _storageListNumber: ui.fields.Text;

    @ui.decorators.referenceField<MobilePutawayDetail, Product>({
        isTransient: true,
        isHidden: false,
        isReadOnly: true,
        node: '@sage/x3-master-data/Product',
        valueField: 'code',
        canFilter: false,
    })
    _product: ui.fields.Reference<Product>;

    @ui.decorators.textField<MobilePutawayDetail>({
        isTransient: true,
        isHidden: false,
        isReadOnly: true,
    })
    headerProduct: ui.fields.Text;

    @ui.decorators.textField<MobilePutawayDetail>({
        isTransient: true,
        isHidden: false,
        isReadOnly: true,
        // node: '@sage/xtrem-x3-master-data/Product',
        // valueField: 'localizedDescription1',
    })
    _localizedDescription1: ui.fields.Text;

    /*
     *
     *  Page Actions
     *
     */

    @ui.decorators.pageAction<MobilePutawayDetail>({
        title: 'Previous',
        shortcut: ['f4'],
        buttonType: 'secondary',
        onClick() {
            this.$.router.goTo('@sage/x3-stock/MobilePutawayTodo', {
                site: this._site.value.code,
                storageListNumber: this._storageListNumber.value,
                stockTransaction: this._stockTransaction,
            });
        },
    })
    previousButton: ui.PageAction;

    @ui.decorators.pageAction<MobilePutawayDetail>({
        title: 'Submit',
        shortcut: ['f2'],
        buttonType: 'primary',
        async onClick() {
            // perform client-side validation
            if (!(await validateWithDetails(this))) return;

            // to prevent extreme scenarios from rapidly clicking the update button multiple times
            this.submitButton.isDisabled = true;
            this.previousButton.isDisabled = true;
            this.$.loader.isHidden = false;
            const result = await this._callProcessAPI();
            this.submitButton.isDisabled = false;
            this.previousButton.isDisabled = false;
            this.$.loader.isHidden = true;

            if ((!result.errors || !result.errors.length) && result instanceof Error) {
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
                    this.$.router.goTo('@sage/x3-stock/MobilePutaway');
                }
                return;
            }

            if ((!result.errors || !result.errors.length || result.errors.length === 0) && !result.message) {
                this.$.setPageClean();
                if (
                    // to handle the edgy case of directing user back to 2nd, not 1st, page if user is doing a partial update
                    this.quantityInPackingUnit.value === this.quantityInPackingUnit.max
                ) {
                    this._totalCount--;
                }
            } else {
                //severity 3 and 4 - error
                if (
                    result.errors[0].extensions.diagnoses.filter(
                        (d: { severity: number; message: any }) => d.severity > 2 && d.message,
                    ).length !== 0
                ) {
                    await this.$.sound.error();

                    const messageArray: string[] = result.errors[0].extensions.diagnoses[0].message.split(`\n`);
                    let message = `**${ui.localize(
                        '@sage/x3-stock/dialog-error-putaway-update',
                        'An error has occurred during Putaway update',
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
                            {
                                fullScreen: true,
                                acceptButton: {
                                    text: ui.localize('@sage/x3-stock/button-goback', 'Go back'),
                                },
                                cancelButton: {
                                    text: ui.localize('@sage/x3-stock/button-cancel', 'Cancel'),
                                },
                                size: 'small',
                                mdContent: true,
                            },
                        )
                    ) {
                        return;
                    }
                } else {
                    await this.$.sound.success();

                    const messageArray: string[] = result.errors[0].extensions.diagnoses[0].message.split(`\n`);
                    let message = `**${ui.localize('@sage/x3-stock/dialog-warning-title', 'Warning')}**\n\n`;
                    if (messageArray.length === 1) {
                        message += `${messageArray[0]}`;
                    } else {
                        message += messageArray.map(item => `* ${item}`).join('\n');
                    }

                    await dialogMessage(
                        this,
                        'warn',
                        ui.localize('@sage/x3-stock/dialog-warning-title', 'Warning'),
                        `${message}`,
                        {
                            acceptButton: {
                                text: ui.localize('@sage/x3-stock/button-accept-ok', 'OK'),
                            },
                            size: 'small',
                            mdContent: true,
                        },
                    );

                    if (
                        // to handle the edgy case of directing user back to 2nd, not 1st, page if user is doing a partial update
                        this.quantityInPackingUnit.value === this.quantityInPackingUnit.max
                    ) {
                        this._totalCount--;
                    }
                }
            }
            if (this._totalCount > 0) {
                this.$.router.goTo('@sage/x3-stock/MobilePutawayTodo', {
                    site: this._site.value.code,
                    storageListNumber: this._storageListNumber.value,
                    stockTransaction: this._stockTransaction,
                });
            } else {
                await dialogMessage(
                    this,
                    'success',
                    ui.localize('@sage/x3-stock/dialog-success-title', 'Success'),
                    ui.localize('@sage/x3-stock/dialog-success-putaway-complete', 'Putaway complete'),
                );
                this.$.router.goTo('@sage/x3-stock/MobilePutaway');
            }
        },
    })
    submitButton: ui.PageAction;

    @ui.decorators.section<MobilePutawayDetail>({
        isTitleHidden: true,
    })
    mainSection: ui.containers.Section;

    @ui.decorators.block<MobilePutawayDetail>({
        isTitleHidden: true,
        parent() {
            return this.mainSection;
        },
    })
    mainBlock: ui.containers.Block;

    @ui.decorators.referenceField<MobilePutawayDetail, Location>({
        parent() {
            return this.mainBlock;
        },
        title: 'From location',
        node: '@sage/x3-stock-data/Location',
        valueField: 'code',
        isTransient: true,
        isReadOnly: true,
        canFilter: false,
    })
    fromLocation: ui.fields.Reference<Location>;

    @ui.decorators.textField<MobilePutawayDetail>({
        parent() {
            return this.mainBlock;
        },
        title: 'From status',
        isTransient: true,
        isReadOnly: true,
    })
    fromStatus: ui.fields.Text;

    @ui.decorators.referenceField<MobilePutawayDetail, UnitOfMeasure>({
        parent() {
            return this.mainBlock;
        },
        title: 'Packing unit',
        node: '@sage/x3-master-data/UnitOfMeasure',
        valueField: 'code',
        isTransient: true,
        isReadOnly: true,
        canFilter: false,
    })
    packingUnit: ui.fields.Reference<UnitOfMeasure>;

    @ui.decorators.numericField<MobilePutawayDetail>({
        parent() {
            return this.mainBlock;
        },
        title: 'Packing quantity',
        placeholder: 'Enter quantity',
        isTransient: true,
        isMandatory: true,
        isNotZero: true,
        min: 0,
    })
    quantityInPackingUnit: ui.fields.Numeric;

    @ui.decorators.selectField<MobilePutawayDetail>({
        parent() {
            return this.mainBlock;
        },
        title: 'To status',
        placeholder: 'Enter status',
        isMandatory: true,
        isFullWidth: true,
        onChange() {
            this.toStatus.getNextField(true)?.focus();
        },
    })
    toStatus: ui.fields.Select;

    @ui.decorators.referenceField<MobilePutawayDetail, LicensePlateNumber>({
        parent() {
            return this.mainBlock;
        },
        title: 'To license plate number',
        placeholder: 'Scan or select...',
        node: '@sage/x3-stock-data/LicensePlateNumber',
        valueField: 'code',
        isTransient: true,
        isMandatory: false,
        isFullWidth: true,
        isAutoSelectEnabled: true,
        shouldSuggestionsIncludeColumns: true,
        canFilter: false,
        // (X3-237456) TODO Issue: Lookup panel's load more button does not work for licensePlateNumber reference field
        filter() {
            const filter: Filter<LicensePlateNumber> = {
                stockSite: { code: this._site.value.code },
                location: { category: { _nin: ['dock'] } }, // location category must not be a dock type
                isActive: { _eq: true },
                // TODO: LPN filter criteria on single-product & single-lot managed lpns
                _and: [
                    {
                        _or: [
                            { isSingleProduct: { _eq: false } },
                            {
                                isSingleProduct: { _eq: true }, // to not imply isSingleProduct is true here because this property is nullable
                                stock: { _atLeast: 1, product: this._product?.value?.code },
                            },
                            {
                                isSingleProduct: { _eq: true }, // to not imply isSingleProduct is true here because this property is nullable
                                stock: { _none: true },
                            },
                        ],
                    },
                ],
            };

            // TODO: Add the container filter
            // if (this.container.value?.code) {
            //     filter.container = { code: this.container.value.code };
            // }

            if (this.toLocation.value?.code) {
                filter._and.push({
                    _or: [
                        {
                            location: { code: this.toLocation.value.code },
                        },
                        {
                            // to also include entries without location that have 'free' status
                            _and: [{ location: { code: null } }, { status: 'free' }],
                        },
                    ],
                });
            }

            return filter;
        },
        async onChange() {
            if (!this.licensePlateNumber.value) {
                this.toLocation.isDisabled = false;
                this.toLocation.value = null;
                this.container.value = null;
                await this.$.commitValueAndPropertyChanges(); // without this, when you clear out LPN and then, without tabbing out, click Location's lookup button directly, nothing will happen
                return;
            }

            // Populate and disable To Location field if selected LPN is associated with a location
            // if location is NOT populated manually by the user
            if (!this.toLocation.value) {
                this.toLocation.value = this.licensePlateNumber.value.location;
            }
            this.toLocation.isDisabled = !!this.licensePlateNumber.value.location;

            if (this.licensePlateNumber.value?.container) {
                this.container.value = this.licensePlateNumber.value.container;
            }

            await this.$.commitValueAndPropertyChanges();
            this.licensePlateNumber.getNextField(true)?.focus();
        },
        columns: [
            ui.nestedFields.text({
                bind: 'code',
                title: 'License Plate Number',
                isReadOnly: true,
            }),
            ui.nestedFields.reference({
                node: '@sage/x3-stock-data/Location',
                bind: 'location',
                valueField: 'code',
                title: 'Location',
                isReadOnly: true,
            }),
            ui.nestedFields.reference({
                node: '@sage/x3-master-data/Container',
                bind: 'container',
                valueField: 'code',
                title: 'Container',
                isReadOnly: true,
            }),
            ui.nestedFields.label({
                bind: 'status',
                title: 'Status',
                map(value: any, rowData: LicensePlateNumber) {
                    switch (value) {
                        case 'free':
                            return 'Free';
                        case 'inStock':
                            return 'In Stock';
                        default:
                            return '';
                    }
                },
                borderColor: ui.tokens.colorsYang100,
                optionType: '@sage/x3-stock/ContainerStatus',
            }),
            // hidden location type column in order to auto-populate toLocation field with BOTH code & type during onChange()
            ui.nestedFields.reference<MobilePutawayDetail, LicensePlateNumber, Location>({
                node: '@sage/x3-stock-data/Location',
                bind: 'location',
                valueField: 'type',
                isHidden: true,
            }),
        ],
    })
    licensePlateNumber: ui.fields.Reference<LicensePlateNumber>;

    @ui.decorators.referenceField<MobilePutawayDetail, Container>({
        parent() {
            return this.mainBlock;
        },
        title: 'To container',
        node: '@sage/x3-master-data/Container',
        valueField: 'code',
        isTransient: true,
        isReadOnly: true,
        isMandatory: false,
        isFullWidth: true,
        canFilter: false,
    })
    container: ui.fields.Reference<Container>;

    @ui.decorators.referenceField<MobilePutawayDetail, Location>({
        parent() {
            return this.mainBlock;
        },
        title: 'To location',
        placeholder: 'Scan or select...',
        node: '@sage/x3-stock-data/Location',
        valueField: 'code',
        isTransient: true,
        isMandatory: true,
        isFullWidth: true,
        isAutoSelectEnabled: true,
        //minLookupCharacters: 1,
        shouldSuggestionsIncludeColumns: true,
        canFilter: false,
        filter() {
            return {
                stockSite: { code: this._site.value.code },
                // TODO Issue: Not sure why this is having build-time errors. There exist working filter criteria on enum using _ne operator...
                //category: { _ne: 'dock' },
                category: { _nin: ['dock'] }, // cannot be a dock location
            };
        },
        onChange() {
            try {
                if (this.toLocation.value) this.toLocation.getNextField(true)?.focus();
            } catch (e) {}
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
            // (X3-227347) TODO Obsolete: Having to specify & hide fields used in filter that don't need to be displayed
            ui.nestedFields.reference<MobilePutawayDetail, Location, Site>({
                node: '@sage/x3-system/Site',
                bind: 'stockSite',
                valueField: 'code',
                isHidden: true,
            }),
        ],
    })
    toLocation: ui.fields.Reference<Location>;

    @ui.decorators.filterSelectField<MobilePutawayDetail, Lot>({
        parent() {
            return this.mainBlock;
        },
        title: 'Lot',
        placeholder: 'Scan or select...',
        node: '@sage/x3-stock-data/Lot',
        valueField: 'code',
        //helperText: 'sublot', // TODO: Preload sublot based on selected lot
        isHelperTextHidden: true,
        isTransient: true,
        isFullWidth: true,
        isNewEnabled: true,
        validation: /^$|^[^|a-z]+$/, // added a check for negating lower-case characters to avoid edge cases
        minLookupCharacters: 1,
        canFilter: false,
        filter() {
            return {
                product: { code: this._product.value.code },
            };
        },
        async onChange() {
            if (!this.lot.value) {
                // if lot is manually cleared out, then clear out sublot as well ONLY if this storage detail line doesn't have a pre-populated sublot
                if (!this.sublot.isHidden && !this._storageDetails.sublot) {
                    this.sublot.value = null;
                    this.sublot.isDisabled = false;
                }
                return;
            }

            this.lot.value = this.lot.value.toUpperCase();
            await this.$.commitValueAndPropertyChanges();
            await this.lot.validate();
            this.lot.getNextField(true)?.focus();

            // TODO: Preload sublot based on selected lot
            // if (this.lot.helperText) {
            //     // if lot has an associated sublot, then populate sublot and disable it
            //     this.sublot.value = this.lot.helperText;
            //     this.sublot.isDisabled = true;
            // }
        },
    })
    lot: ui.fields.FilterSelect<Lot>;

    @ui.decorators.textField<MobilePutawayDetail>({
        parent() {
            return this.mainBlock;
        },
        title: 'Sublot',
        placeholder: 'Scan a sublot',
        isTransient: true,
        isFullWidth: true,
        validation: /^$|^[^|]+$/,
        onChange() {
            if (this.sublot.value) this.sublot.value = this.sublot.value.toUpperCase();
        },
    })
    sublot: ui.fields.Text;

    @ui.decorators.textField<MobilePutawayDetail>({
        parent() {
            return this.mainBlock;
        },
        title: 'Serial number',
        placeholder: 'Scan a serial number',
        isTransient: true,
        isFullWidth: true,
        validation: /^$|^[^|]+$/,
    })
    serialNumber: ui.fields.Text;

    private async _initializePage(stockTransaction: string, storageDetails: ExtractEdgesPartial<StorageDetails>) {
        if (!stockTransaction) throw new Error('Invalid Stock Transaction');

        this._stockTransaction = stockTransaction;
        this._storageDetails = storageDetails;
        this._site.value = storageDetails.storageSite;

        // header card
        this._storageListNumber.value = storageDetails.storageListNumber;
        this._product.value = storageDetails.storage.product;
        this.headerProduct.value = this._product.value.code;
        this._localizedDescription1.value = storageDetails.storage.product.localizedDescription1;

        // main block
        this.packingUnit.value = storageDetails.packingUnit;
        this.quantityInPackingUnit.value = this.quantityInPackingUnit.max = Number(
            storageDetails.quantityInPackingUnit,
        );
        this.quantityInPackingUnit.scale = storageDetails.packingUnit.numberOfDecimals; // enforce precision based on packing unit
        this.fromStatus.value = storageDetails.storage.status.code;
        this.toStatus.options = await this._fetchStatuses();
        this.toStatus.value = storageDetails.status.code;
        this.fromLocation.value = storageDetails.storage.location;
        this.toLocation.value = storageDetails.location; // no need to worry about products that are not location managed

        this.lot.isHidden = storageDetails.storage.product.lotManagementMode === 'notManaged'; // lot is hidden if product is not lot managed
        this.lot.isMandatory =
            !this.lot.isHidden &&
            !storageDetails.storage.product.lotSequenceNumber &&
            storageDetails.storage.product.lotManagementMode !== 'optionalLot'; // lot is mandatory only if lot is NOT hidden, does NOT have lot seq # & product is lot managed, but NOT optional
        if (!this.lot.isHidden) this.lot.value = storageDetails.lot;
        this.lot.isDisabled = !!this.lot.value; // disable lot if this storage detail line already has a lot specified

        this.sublot.isHidden = storageDetails.storage.product.lotManagementMode !== 'lotAndSublot'; // sublot is hidden if product is not both lot & sublot managed
        this.sublot.isMandatory = !this.sublot.isHidden; // sublot is mandatory only if it is not hidden
        if (!this.sublot.isHidden) this.sublot.value = storageDetails.sublot;
        this.sublot.isDisabled = !!this.sublot.value; // disable sublot if this storage detail line already has a sublot specified

        this.serialNumber.isHidden = ['notManaged', 'issued'].includes(
            storageDetails.storage.product.serialNumberManagementMode,
        ); // serial is hidden if product is not serial managed or issued
        this.serialNumber.isMandatory =
            !this.serialNumber.isHidden && !storageDetails.storage.product.serialSequenceNumber; // serial is mandatory only if serial is NOT hidden, does NOT have serial seq #
        if (!this.serialNumber.isHidden) this.serialNumber.value = storageDetails.startingSerialNumber;
        this.serialNumber.isDisabled = !!this.serialNumber.value; // disable serial if this storage detail line already has a serial number specified

        this.licensePlateNumber.isHidden = this.container.isHidden = !Boolean(
            storageDetails.storage.product.productSites?.[0]?.isLicensePlateNumberManaged,
        );
        if (!this.licensePlateNumber.isHidden) {
            this.licensePlateNumber.value = storageDetails.licensePlateNumber;
            this.container.value = storageDetails.licensePlateNumber?.container;

            // if provided lpn in storage worksheet (detail) line and...
            // 1) lpn has status 'inStock' (which is always associated to a location), then toLocation must be disabled
            // 2) lpn has status 'free' but no location associated, then toLocation must be enabled
            // 3) lpn has status 'free' but has a location associated, then toLocation must be disabled
            // NOTE: toLocation provided in storage worksheet (detail) line should be the same as provided lpn's location
            this.toLocation.isDisabled = !!this.licensePlateNumber.value?.location?.code;
        }
        this.licensePlateNumber.isDisabled = !!this.licensePlateNumber.value; // if lpn is provided, disable

        this.quantityInPackingUnit.focus();
    }

    private async _fetchStatuses(): Promise<string[]> {
        return extractEdges<StockStatusInput>(
            await this.$.graph
                .node('@sage/x3-stock-data/StockStatus')
                .query(
                    ui.queryUtils.edgesSelector({
                        code: true,
                    }),
                )
                .execute(),
        ).map(status => status.code);
    }

    private async _callProcessAPI(): Promise<any> {
        // Populate required arguments
        const putawayArgs: any = {
            stockEntryTransaction: this._stockTransaction,
            storageSite: this._storageDetails.storageSite.code,
            stockId: this._storageDetails.stockId,
            documentType: this._storageDetails.documentType,
            documentNumber: this._storageDetails.documentNumber,
            documentLineNumber: this._storageDetails.documentLineNumber,
            storageSequenceNumber: this._storageDetails.storageSequenceNumber,
            quantityInPackingUnit: this.quantityInPackingUnit.value,
            quantityInStockUnit: Decimal.make(this.quantityInPackingUnit.value)
                .mul(this._storageDetails.packingUnitToStockUnitConversionFactor)
                .toNumber(),
            status: this.toStatus.value,
            location: this.toLocation.value.code,
            locationType: this.toLocation.value.type,
        };

        // (X3-237016) TODO Issue: Have to specify all optional parameters in the processPutaway mutation due to a bug
        // Populate situational arguments
        // if (!this.lot.isHidden && this.lot.value) putawayArgs.lot = this.lot.value;
        // if (!this.sublot.isHidden && this.sublot.value) putawayArgs.sublot = this.sublot.value;
        // if (!this.serialNumber.isHidden && this.serialNumber.value) {
        //     putawayArgs.startingSerialNumber = this.serialNumber.value;
        //     putawayArgs.endingSerialNumber = this._storageDetails.endingSerialNumber;
        // }
        // if (!this.licensePlateNumber.isHidden && this.licensePlateNumber.value?.code) {
        //     putawayArgs.licensePlateNumber = this.licensePlateNumber.value.code;
        //     if (this.container.value?.code) putawayArgs.container = this.container.value.code;
        // }
        // let labelDestination: string = this.$.storage.get('adc-label-destination') as string;
        // if (labelDestination) {
        //     putawayArgs.labelDestination = labelDestination;
        // }

        // (X3-237016) TODO Issue: Have to specify ALL optional parameters in the processPutaway mutation due to a bug
        putawayArgs.lot = !this.lot.isHidden && this.lot.value ? this.lot.value : '';
        putawayArgs.sublot = !this.sublot.isHidden && this.sublot.value ? this.sublot.value : '';
        putawayArgs.startingSerialNumber =
            !this.serialNumber.isHidden && this.serialNumber.value ? this.serialNumber.value : '';
        putawayArgs.endingSerialNumber =
            !this.serialNumber.isHidden &&
            this.serialNumber.value &&
            // if product is serial tracked & globalReceivedIssued and the user is attempting to do a partial quantity, then do not pass any ending serial number from this storage worksheet (detail) line
            (this._storageDetails.storage.product.serialNumberManagementMode !== 'globalReceivedIssued' ||
                this.quantityInPackingUnit.value === this.quantityInPackingUnit.max)
                ? this._storageDetails.endingSerialNumber
                : '';
        putawayArgs.licensePlateNumber =
            !this.licensePlateNumber.isHidden && this.licensePlateNumber.value?.code
                ? this.licensePlateNumber.value.code
                : '';
        putawayArgs.container =
            !!putawayArgs.licensePlateNumber && this.container.value?.code ? this.container.value.code : '';
        putawayArgs.labelDestination = (this.$.storage.get('mobile-label-destination') as string) ?? '';

        // Generate Putaway mutation request
        try {
            return await this.$.graph
                .node('@sage/x3-stock/StorageDetails')
                .mutations.processPutaway(
                    {
                        stockEntryTransaction: true,
                        storageSite: true,
                        stockId: true,
                        documentType: true,
                        documentNumber: true,
                        documentLineNumber: true,
                        storageSequenceNumber: true,
                        quantityInPackingUnit: true,
                        lot: true,
                        sublot: true,
                        startingSerialNumber: true,
                        endingSerialNumber: true,
                        status: true,
                        container: true,
                        licensePlateNumber: true,
                        location: true,
                        locationType: true,
                        quantityInStockUnit: true,
                        labelDestination: true,
                    },
                    {
                        parameters: putawayArgs,
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
