import { Container, Product, ProductPackingUnits, ProductSite, UnitOfMeasure } from '@sage/x3-master-data-api';
import { dialogConfirmation, dialogMessage } from '@sage/x3-master-data/lib/client-functions/dialogs';
import { onGoto } from '@sage/x3-master-data/lib/client-functions/on-goto';
import {
    GraphApi,
    StockCountList,
    StockCountListDetail,
    StockCountSerialNumberInput,
    StockCountSession,
} from '@sage/x3-stock-api';
import { LicensePlateNumber, Location, Lot, MajorVersionStatus, Stock, StockStatus } from '@sage/x3-stock-data-api';
import { Site } from '@sage/x3-system-api';
import { Edges, ExtractEdges, ExtractEdgesPartial, Filter, decimal, extractEdges } from '@sage/xtrem-client';
import { ApiError } from '@sage/xtrem-shared';
import * as ui from '@sage/xtrem-ui';
import { validateWithDetails } from '../client-functions/control';

enum MobileStockCountDetailPageMode {
    update,
    create,
}

/** @internal */
function generateDetailFilter(
    selectedStockCountListDetail: ExtractEdgesPartial<StockCountListDetail>,
    excludeCountedLines: boolean,
): Filter<StockCountListDetail> {
    let stockCountListDetailFilter: Filter<StockCountListDetail> = {
        stockCountSessionNumber: selectedStockCountListDetail.stockCountSessionNumber,
        stockCountList: {
            stockCountListNumber: selectedStockCountListDetail.stockCountList?.stockCountListNumber,
        },
        stockCountListStatus: {
            _in: ['toBeCounted', 'counted'],
        },
        countedStockInPackingUnit: '0',
        isZeroStock: false,
    };

    if (!excludeCountedLines) {
        delete stockCountListDetailFilter.countedStockInPackingUnit;
        delete stockCountListDetailFilter.isZeroStock;
    }

    if (selectedStockCountListDetail.stockCountSession?.isMultipleCount) {
        if (
            Number(selectedStockCountListDetail.countedStockInPackingUnit1) === 0 &&
            !selectedStockCountListDetail.isZeroStock1
        ) {
            stockCountListDetailFilter.countedStockInPackingUnit1 = '0';
            stockCountListDetailFilter.isZeroStock1 = false;
        } else if (
            Number(selectedStockCountListDetail.countedStockInPackingUnit2) === 0 &&
            !selectedStockCountListDetail.isZeroStock2
        ) {
            stockCountListDetailFilter.countedStockInPackingUnit2 = '0';
            stockCountListDetailFilter.isZeroStock2 = false;
        }
    }
    return stockCountListDetailFilter;
}

@ui.decorators.page<MobileStockCountDetail>({
    title: 'Stock count',
    subtitle: 'Enter stock details',
    isTitleHidden: true,
    isTransient: false,
    skipDirtyCheck: true, // (X3-250910) TODO: Obsolete: Un-dirty specific field components. Like Line number field
    node: '@sage/x3-stock/StockCountListDetail',
    mode: 'default',
    navigationPanel: {
        canFilter: false,
        isHeaderHidden: true,
        listItem: {
            title: ui.nestedFields.numeric({ bind: 'productRankNumber' }), // this is needed because entries is ordered by node property specified specified by titleLine
            line2: ui.nestedFields.text({ bind: '_id' }),
        },
        optionsMenu: [
            {
                title: '',
                graphQLFilter: (storage: any, queryParameters: any) =>
                    generateDetailFilter(
                        JSON.parse(
                            queryParameters.stockCountListDetail as string,
                        ) as ExtractEdgesPartial<StockCountListDetail>,
                        queryParameters.excludeCountedLines === 'true',
                    ),
            },
        ],
    },

    async onLoad() {
        try {
            this.$.isNavigationPanelHidden = true;
            this._mapMultiCountMode();
            await this._initializePage(MobileStockCountDetailPageMode.update, this.product.value.code);
        } catch (e) {
            // TODO: Verify: Is this try/catch necessary for a non-transient page
            this.$.showToast(
                ui.localize('@sage/x3-stock/notification-error-missing-params', 'Missing required parameters'),
                { type: 'error' },
            );
            this.$.router.goTo('@sage/x3-stock/MobileStockCount');
        }
    },
    headerCard() {
        return {
            title: this.headerStockCountSessionNumber,
            titleRight: this.headerStockCountListNumber,
            line2: this.headerProductCode,
            line2Right: this.headerProductDescription,
            ...(this.multiCountMode.value && { line3: this.multiCountMode }),
        };
    },
    businessActions() {
        return [
            this.updateButton,
            this.newButton,
            this.nextButton,
            this.viewCountsButton,
            this.cancelButton,
            this.createButton,
        ];
    },
})
export class MobileStockCountDetail extends ui.Page<GraphApi> {
    private _unitMap: Map<string, ExtractEdgesPartial<ProductPackingUnits>> = new Map<
        string,
        ExtractEdgesPartial<ProductPackingUnits>
    >();

    _isTheoreticalQuantityDisplayed: boolean;
    /*
     *
     *  Header card fields & hidden fields
     *
     */

    @ui.decorators.referenceField<MobileStockCountDetail, Site>({
        isTitleHidden: true,
        isHidden: true,
        isReadOnly: true,
        node: '@sage/x3-system/Site',
        valueField: 'code',
        canFilter: false,
    })
    stockSite: ui.fields.Reference<Site>;

    @ui.decorators.referenceField<MobileStockCountDetail, StockCountSession>({
        isTitleHidden: true,
        isReadOnly: true,
        node: '@sage/x3-stock/StockCountSession',
        valueField: 'stockCountSession',
        canFilter: false,
        columns: [
            ui.nestedFields.checkbox({
                bind: 'isMultipleCount',
                isHidden: true,
            }),
            ui.nestedFields.checkbox({
                bind: 'isNonUsableProductSelected',
                isHidden: true,
            }),
            ui.nestedFields.label({
                bind: 'stockCountSessionMode',
                isHidden: true,
            }),
            ui.nestedFields.checkbox({
                bind: 'stockCycleCountClassA',
                isHidden: true,
            }),
            ui.nestedFields.checkbox({
                bind: 'stockCycleCountClassB',
                isHidden: true,
            }),
            ui.nestedFields.checkbox({
                bind: 'stockCycleCountClassC',
                isHidden: true,
            }),
            ui.nestedFields.checkbox({
                bind: 'stockCycleCountClassD',
                isHidden: true,
            }),
        ],
    })
    stockCountSession: ui.fields.Reference<StockCountSession>;

    @ui.decorators.textField<MobileStockCountDetail>({
        isTransient: true,
        isTitleHidden: true,
        isReadOnly: true,
    })
    headerStockCountSessionNumber: ui.fields.Text;

    @ui.decorators.referenceField<MobileStockCountDetail, StockCountList>({
        isTitleHidden: true,
        isReadOnly: true,
        node: '@sage/x3-stock/StockCountList',
        valueField: 'stockCountListNumber',
        canFilter: false,
    })
    stockCountList: ui.fields.Reference<StockCountList>;

    @ui.decorators.textField<MobileStockCountDetail>({
        isTransient: true,
        isTitleHidden: true,
        isReadOnly: true,
    })
    headerStockCountListNumber: ui.fields.Text;

    @ui.decorators.textField<MobileStockCountDetail>({
        isTransient: true,
        isTitleHidden: true,
        isReadOnly: true,
    })
    headerProductCode: ui.fields.Text;

    @ui.decorators.textField<MobileStockCountDetail>({
        isTransient: true,
        isTitleHidden: true,
        isReadOnly: true,
    })
    headerProductDescription: ui.fields.Text;

    @ui.decorators.numericField<MobileStockCountDetail>({
        isHidden: true,
        isDisabled: true,
    })
    productRankNumber: ui.fields.Numeric;

    @ui.decorators.textField<MobileStockCountDetail>({
        isHidden: true,
        isDisabled: true,
    })
    _id: ui.fields.Text;

    @ui.decorators.numericField<MobileStockCountDetail>({
        isHidden: true,
        isDisabled: true,
        bind: 'countedStockInPackingUnit',
    })
    oldCountedStockInPackingUnit: ui.fields.Numeric;

    @ui.decorators.numericField<MobileStockCountDetail>({
        isHidden: true,
        isDisabled: true,
    })
    countedStockInPackingUnit1: ui.fields.Numeric;

    @ui.decorators.numericField<MobileStockCountDetail>({
        isHidden: true,
        isDisabled: true,
    })
    countedStockInPackingUnit2: ui.fields.Numeric;

    @ui.decorators.checkboxField<MobileStockCountDetail>({
        isHidden: true,
        isDisabled: true,
    })
    isZeroStock1: ui.fields.Checkbox;

    @ui.decorators.checkboxField<MobileStockCountDetail>({
        isHidden: true,
        isDisabled: true,
    })
    isZeroStock2: ui.fields.Checkbox;

    @ui.decorators.numericField<MobileStockCountDetail>({
        isHidden: true,
        isDisabled: true,
    })
    packingUnitToStockUnitConversionFactor: ui.fields.Numeric;

    @ui.decorators.referenceField<MobileStockCountDetail, Stock>({
        isHidden: true,
        isDisabled: true,
        node: '@sage/x3-stock-data/Stock',
        bind: 'stockLine',
        valueField: 'stockId',
        canFilter: false,
        columns: [
            ui.nestedFields.numeric({
                bind: 'allocatedQuantity',
                isHidden: true,
            }),
        ],
    })
    stockLine: ui.fields.Reference<Stock>;

    @ui.decorators.referenceField<MobileStockCountDetail, LicensePlateNumber>({
        isHidden: true,
        isDisabled: true,
        node: '@sage/x3-stock-data/LicensePlateNumber',
        valueField: 'code',
        canFilter: false,
    })
    licensePlateNumber: ui.fields.Reference<LicensePlateNumber>;

    // (X3-248932) TODO: Issue: auto-populating non-transient filterSelect causes a Bad Request. Remove this workaround
    @ui.decorators.textField<MobileStockCountDetail>({
        isHidden: true,
        isDisabled: true,
    })
    lot: ui.fields.Text;

    @ui.decorators.numericField<MobileStockCountDetail>({
        isHidden: true,
        isDisabled: true,
        isTransient: true, // transient input for processCount
    })
    multiCountNumber: ui.fields.Numeric;

    @ui.decorators.textField<MobileStockCountDetail>({
        isTransient: true,
        isReadOnly: true,
    })
    multiCountMode: ui.fields.Text; // the user friendly version of multiCountNumber

    /*
     *
     *  Section
     *
     */

    @ui.decorators.section<MobileStockCountDetail>({
        isTitleHidden: true,
    })
    mainSection: ui.containers.Section;

    /*
     *
     *  Blocks
     *
     */

    @ui.decorators.block<MobileStockCountDetail>({
        isTitleHidden: true,
        parent() {
            return this.mainSection;
        },
    })
    lineNumberBlock: ui.containers.Block;

    @ui.decorators.block<MobileStockCountDetail>({
        isTitleHidden: true,
        parent() {
            return this.mainSection;
        },
    })
    updateBlock: ui.containers.Block;

    /**
     * To decouple logic between update and new, arguably:
     *
     * (Downside) This roughly doubles the number of ui components to implement, but not particularly difficult to just
     * implement non-transient version of each property field
     *
     * (Upside) Potentially avoids a server-side call when transitioning back from New to Update mode.
     * Also simplifies dynamic ui logic by hiding/unhiding entire block rather than individual ui components
     * as well as not having to write logic that heavily depends on what mode the page is transitioning from/to and
     * the current state of each ui component (ex. transitioning from New, while having a non-lpn managed product that is selected)
     */
    @ui.decorators.block<MobileStockCountDetail>({
        isTitleHidden: true,
        parent() {
            return this.mainSection;
        },
    })
    newBlock: ui.containers.Block;

    /*
     *
     *  Fields for Line number block
     *
     */

    @ui.decorators.referenceField<MobileStockCountDetail, StockCountListDetail>({
        parent() {
            return this.lineNumberBlock;
        },
        title: 'Line number',
        placeholder: 'Scan or select…',
        node: '@sage/x3-stock/StockCountListDetail',
        valueField: 'productRankNumber',
        isTransient: true,
        isAutoSelectEnabled: true,
        isDropdownDisabled: false,
        isFullWidth: false,
        minLookupCharacters: 1,
        shouldSuggestionsIncludeColumns: true,
        canFilter: false,
        filter() {
            return generateDetailFilter(
                JSON.parse(
                    this.$.queryParameters.stockCountListDetail as string,
                ) as ExtractEdgesPartial<StockCountListDetail>,
                this.$.queryParameters.excludeCountedLines === 'true',
            );
        },
        columns: [
            ui.nestedFields.numeric({
                bind: 'productRankNumber',
                title: 'Line Number',
                isReadOnly: true,
            }),
            ui.nestedFields.reference<MobileStockCountDetail, StockCountListDetail, Product>({
                node: '@sage/x3-master-data/Product',
                bind: 'product',
                valueField: 'code',
                title: 'Product',
                isReadOnly: true,
            }),
            ui.nestedFields.reference<MobileStockCountDetail, StockCountListDetail, Product>({
                node: '@sage/x3-master-data/Product',
                bind: 'product',
                valueField: 'localizedDescription1',
                title: 'Description',
                isReadOnly: true,
            }),
            ui.nestedFields.reference<MobileStockCountDetail, StockCountListDetail, Product>({
                node: '@sage/x3-master-data/Product',
                bind: 'product',
                valueField: 'upc',
                title: 'UPC',
                isReadOnly: true,
            }),
            ui.nestedFields.text({
                bind: 'lot',
                isReadOnly: true,
                isHidden: false,
            }),
            ui.nestedFields.text({
                bind: 'sublot',
                isReadOnly: true,
                isHidden: true,
            }),
            ui.nestedFields.text({
                bind: 'serialNumber',
                isReadOnly: true,
                isHidden: false,
            }),
            ui.nestedFields.text({
                bind: '_id',
                isReadOnly: true,
                isHidden: true,
            }),
        ],
        async onChange() {
            if (!this.stockCountListDetailLineNumbers.value) return;
            await this.$.router.selectRecord(this.stockCountListDetailLineNumbers.value._id);
        },
    })
    stockCountListDetailLineNumbers: ui.fields.Reference<StockCountListDetail>;

    /*
     *
     *  Fields for Update block
     *
     */

    @ui.decorators.referenceField<MobileStockCountDetail, Product>({
        parent() {
            return this.updateBlock;
        },
        title: 'Product',
        node: '@sage/x3-master-data/Product',
        valueField: 'code',
        isReadOnly: true,
        isFullWidth: true,
        isHidden: true,
        canFilter: false,
        columns: [
            ui.nestedFields.select({
                bind: 'serialNumberManagementMode',
                optionType: '@sage/x3-master-data/SerialNumberManagement',
                isHidden: true,
            }),
        ],
    })
    product: ui.fields.Reference<Product>;

    @ui.decorators.referenceField<MobileStockCountDetail, Product>({
        parent() {
            return this.updateBlock;
        },
        title: 'Product description',
        node: '@sage/x3-master-data/Product',
        bind: 'product',
        valueField: 'localizedDescription1',
        isReadOnly: true,
        isFullWidth: true,
        isHidden: true,
        canFilter: false,
    })
    productLocalizedDescription1: ui.fields.Reference<Product>;

    @ui.decorators.referenceField<MobileStockCountDetail, LicensePlateNumber>({
        parent() {
            return this.updateBlock;
        },
        title: 'License plate number',
        placeholder: 'Scan or select…',
        node: '@sage/x3-stock-data/LicensePlateNumber',
        valueField: 'code',
        isMandatory: false,
        isTransient: true,
        isFullWidth: true,
        isHidden: true, // this is important, otherwise field will still show up briefly before it is determined to be enabled/disabled during onLoad
        isAutoSelectEnabled: true,
        shouldSuggestionsIncludeColumns: true,
        canFilter: false,
        // (X3-237456) TODO: Issue: Lookup panel's load more button does not work for licensePlateNumber reference field
        filter() {
            return this._filterLicensePlateNumber(this.product.value.code, this.location.value?.code);
        },
        async onChange() {
            await this._onChangeLicensePlateNumber(this.editableLicensePlateNumber, this.location);
        },
        columns: [
            ui.nestedFields.text({
                bind: 'code',
                title: 'License Plate Number',
                isReadOnly: true,
            }),
            ui.nestedFields.reference<MobileStockCountDetail, LicensePlateNumber, Location>({
                node: '@sage/x3-stock-data/Location',
                bind: 'location',
                valueField: 'code',
                title: 'Location',
                isReadOnly: true,
            }),
            ui.nestedFields.reference<MobileStockCountDetail, LicensePlateNumber, Container>({
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
                optionType: '@sage/x3-stock-data/ContainerStatus',
            }),
        ],
    })
    editableLicensePlateNumber: ui.fields.Reference<LicensePlateNumber>; // need a transient field because licensePlateNumber is a string property, not a reference property in StockCountListDetail node

    @ui.decorators.referenceField<MobileStockCountDetail, Location>({
        parent() {
            return this.updateBlock;
        },
        title: 'Location',
        placeholder: 'Scan or select…',
        node: '@sage/x3-stock-data/Location',
        valueField: 'code',
        isMandatory: true,
        isFullWidth: true,
        isHidden: true,
        isAutoSelectEnabled: true,
        shouldSuggestionsIncludeColumns: true,
        canFilter: false,
        filter() {
            return { stockSite: { code: this.stockSite.value.code } };
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
            ui.nestedFields.text({
                bind: 'category',
                title: 'Category',
                isReadOnly: true,
            }),
            // (X3-227347) TODO: Obsolete: Having to specify & hide fields used in filter that don't need to be displayed
            ui.nestedFields.reference<MobileStockCountDetail, Location, Site>({
                node: '@sage/x3-system/Site',
                bind: 'stockSite',
                valueField: 'code',
                isHidden: true,
            }),
        ],
    })
    location: ui.fields.Reference<Location>;

    // (X3-248932) TODO: Issue: auto-populating non-transient filterSelect causes a Bad Request. Remove this workaround
    // TODO: Issue: Scanning an existing value that yields 1 exact match will cause lookup panel to appear
    @ui.decorators.filterSelectField<MobileStockCountDetail, Lot>({
        parent() {
            return this.updateBlock;
        },
        title: 'Lot',
        placeholder: 'Scan or select…',
        node: '@sage/x3-stock-data/Lot',
        valueField: 'code',
        helperText: 'sublot', // TODO: Preload sublot based on selected lot
        isHelperTextHidden: true,
        isFullWidth: true,
        isNewEnabled: true,
        isTransient: true, // (X3-248932) TODO: Issue: auto-populating non-transient filterSelect causes a Bad Request. Remove this workaround
        isHidden: true,
        validation: /^$|^[^|a-z]+$/, // added a check for negating lower-case characters to avoid edge cases
        minLookupCharacters: 1,
        canFilter: false,
        filter() {
            return {
                product: { code: this.product.value.code },
            };
        },
        columns: [
            ui.nestedFields.text({
                bind: 'code',
                title: 'Lot',
                isReadOnly: true,
            }),
            ui.nestedFields.text({
                bind: 'sublot',
                title: 'Sublot',
                isReadOnly: true,
            }),
        ],
        async onChange() {
            await this._onChangeLot(
                this.editableLot,
                this.sublot,
                this.majorVersion,
                this.minorVersion,
                this.product.value.code,
            );
        },
    })
    editableLot: ui.fields.FilterSelect<Lot>;

    @ui.decorators.textField<MobileStockCountDetail>({
        parent() {
            return this.updateBlock;
        },
        title: 'Sublot',
        placeholder: 'Scan or select...',
        isMandatory: true,
        isFullWidth: false,
        isHidden: true,
        validation: /^$|^[^|a-z]+$/,
        async onChange() {
            await this._onChangeSublot(
                this.editableLot,
                this.sublot,
                this.majorVersion,
                this.minorVersion,
                this.product.value.code,
            );
        },
    })
    sublot: ui.fields.Text;

    @ui.decorators.textField<MobileStockCountDetail>({
        parent() {
            return this.updateBlock;
        },
        title: 'Serial number',
        placeholder: 'Scan or select…',
        isMandatory: true, // No support of auto generating serial numbers in ADC counts so if a serial number is required, it must be manually entered
        isFullWidth: true,
        isHidden: true,
        validation: /^$|^[^|]+$/,
    })
    serialNumber: ui.fields.Text;

    @ui.decorators.referenceField<MobileStockCountDetail, MajorVersionStatus>({
        parent() {
            return this.updateBlock;
        },
        title: 'Major version',
        isHidden: true,
        isDisabled: true,
        isFullWidth: false,
        node: '@sage/x3-stock-data/MajorVersionStatus',
        valueField: 'code',
    })
    majorVersion: ui.fields.Reference<MajorVersionStatus>;

    @ui.decorators.textField<MobileStockCountDetail>({
        parent() {
            return this.updateBlock;
        },
        title: 'Minor version',
        isReadOnly: true,
        isFullWidth: false,
        isHidden: true,
    })
    minorVersion: ui.fields.Text;

    @ui.decorators.referenceField<MobileStockCountDetail, UnitOfMeasure>({
        parent() {
            return this.updateBlock;
        },
        title: 'Unit',
        node: '@sage/x3-master-data/UnitOfMeasure',
        valueField: 'code',
        isReadOnly: true,
        isFullWidth: false,
        isHidden: true,
        canFilter: false,
        columns: [
            ui.nestedFields.numeric({
                bind: 'numberOfDecimals',
                isHidden: true,
            }),
        ],
    })
    packingUnit: ui.fields.Reference<UnitOfMeasure>;

    @ui.decorators.textField<MobileStockCountDetail>({
        parent() {
            return this.updateBlock;
        },
        title: 'Status',
        isReadOnly: true,
        isFullWidth: false,
        isHidden: true,
    })
    status: ui.fields.Text;

    @ui.decorators.textField<MobileStockCountDetail>({
        parent() {
            return this.updateBlock;
        },
        title: 'Identifier 1',
        isReadOnly: true,
        isFullWidth: false,
        isHidden: true,
    })
    identifier1: ui.fields.Text;

    @ui.decorators.textField<MobileStockCountDetail>({
        parent() {
            return this.updateBlock;
        },
        title: 'Identifier 2',
        isReadOnly: true,
        isFullWidth: false,
        isHidden: true,
    })
    identifier2: ui.fields.Text;

    @ui.decorators.numericField<MobileStockCountDetail>({
        parent() {
            return this.updateBlock;
        },
        title: 'Stock',
        isReadOnly: true,
        isFullWidth: false,
        isHidden: true,
    })
    quantityInPackingUnit: ui.fields.Numeric;

    @ui.decorators.labelField<MobileStockCountDetail>({
        parent() {
            return this.updateBlock;
        },
        title: 'Zero stock',
        isFullWidth: false,
        isHidden: true,
        borderColor: ui.tokens.colorsUtilityMajor025,
        map(value?: any, rowValue?: any) {
            return value === true ? 'Yes' : 'No';
        },
    })
    isZeroStock: ui.fields.Label;

    @ui.decorators.numericField<MobileStockCountDetail>({
        parent() {
            return this.updateBlock;
        },
        title: 'Counted quantity',
        placeholder: 'Enter quantity',
        isMandatory: false,
        isFullWidth: true,
        isNotZero: false,
        isHidden: true,
        min: 0,
    })
    countedStockInPackingUnit: ui.fields.Numeric;

    /*
     *
     *  Fields for New block
     *
     */

    @ui.decorators.referenceField<MobileStockCountDetail, Product>({
        parent() {
            return this.newBlock;
        },
        title: 'Product',
        placeholder: 'Scan or select…',
        node: '@sage/x3-master-data/Product',
        valueField: 'code',
        helperTextField: 'upc',
        isTransient: true,
        isMandatory: true,
        isFullWidth: true,
        isAutoSelectEnabled: true,
        isHelperTextHidden: true,
        shouldSuggestionsIncludeColumns: true,
        canFilter: false,
        filter() {
            // Criterion for isNonUsableProductSelected (if CUNSESSION.ITMSTA006 = 1, then ITMSTA <> 6)
            let stockCountSessionFilter: Filter<Product> = !this.stockCountSession.value.isNonUsableProductSelected
                ? { productStatus: { _nin: ['notUsable'] } }
                : {};

            // Criterion for stockCountSessionMode
            let productSiteFilter: Filter<ProductSite> = {};
            switch (this.stockCountSession.value.stockCountSessionMode) {
                case 'manualSelection': {
                    // then product site ITMFACILIT.CUNDOD must <> 3 (noCount)
                    productSiteFilter.countManagementMode = {
                        _nin: ['notCounted'],
                    };
                    break;
                }
                case 'cycleStockCount': {
                    // then product site ITMFACILIT.CUNDOD must = 1 (cycleCount)
                    productSiteFilter.countManagementMode = 'cycleCount';
                    break;
                }
                case 'annualStockCount': {
                    // then product site ITMFACILIT.CUNDOD must = 2 (annualCount)
                    productSiteFilter.countManagementMode = 'annualCount';
                    break;
                }
            }

            // Criterion for ADC class
            productSiteFilter.abcClass = { _in: [null] };
            if (this.stockCountSession.value.stockCycleCountClassA) {
                productSiteFilter.abcClass._in.push('classA');
            }
            if (this.stockCountSession.value.stockCycleCountClassB) {
                productSiteFilter.abcClass._in.push('classB');
            }
            if (this.stockCountSession.value.stockCycleCountClassC) {
                productSiteFilter.abcClass._in.push('classC');
            }
            if (this.stockCountSession.value.stockCycleCountClassD) {
                productSiteFilter.abcClass._in.push('classD');
            }

            return {
                ...stockCountSessionFilter,
                productSites: { _atLeast: 1, stockSite: { code: this.stockSite.value.code }, ...productSiteFilter },
                stockManagementMode: { _ne: 'notManaged' }, // STOMGTCOD = 2
                _or: [
                    { stockVersionMode: { _in: ['no', null] } },
                    {
                        // if ECCSTO > 1, then LOAECCFLG must = 2
                        stockVersionMode: { _nin: ['no'] }, // this checks if product is version managed
                        isVersionPreloaded: true,
                    },
                ],
            };
        },
        async onChange() {
            await this._initializeNewBlock(this.newProduct.value?.code);
        },
        columns: [
            ui.nestedFields.text({
                bind: 'code',
                title: 'Product',
                isReadOnly: true,
            }),
            ui.nestedFields.text({
                bind: 'upc',
                title: 'UPC',
                isReadOnly: true,
            }),
            ui.nestedFields.text({
                bind: 'localizedDescription1',
                title: 'Description',
                isReadOnly: true,
            }),
            // hidden column for internal use (in particular formatting options in unit field)
            ui.nestedFields.reference<MobileStockCountDetail, Product, UnitOfMeasure>({
                node: '@sage/x3-master-data/UnitOfMeasure',
                bind: 'stockUnit',
                valueField: 'code',
                isHidden: true,
            }),
            ui.nestedFields.select({
                bind: 'serialNumberManagementMode',
                optionType: '@sage/x3-master-data/SerialNumberManagement',
                isHidden: true,
            }),
        ],
    })
    newProduct: ui.fields.Reference<Product>;

    @ui.decorators.referenceField<MobileStockCountDetail, LicensePlateNumber>({
        parent() {
            return this.newBlock;
        },
        title: 'License plate number',
        placeholder: 'Scan or select…',
        node: '@sage/x3-stock-data/LicensePlateNumber',
        valueField: 'code',
        isMandatory: false,
        isTransient: true,
        isFullWidth: true,
        isAutoSelectEnabled: true,
        shouldSuggestionsIncludeColumns: true,
        canFilter: false,
        // (X3-237456) TODO: Issue: Lookup panel's load more button does not work for licensePlateNumber reference field
        filter() {
            return this._filterLicensePlateNumber(this.newProduct.value.code, this.newLocation.value?.code);
        },
        async onChange() {
            await this._onChangeLicensePlateNumber(this.newLicensePlateNumber, this.newLocation);
        },
        columns: [
            ui.nestedFields.text({
                bind: 'code',
                title: 'License Plate Number',
                isReadOnly: true,
            }),
            ui.nestedFields.reference<MobileStockCountDetail, LicensePlateNumber, Location>({
                node: '@sage/x3-stock-data/Location',
                bind: 'location',
                valueField: 'code',
                title: 'Location',
                isReadOnly: true,
            }),
            ui.nestedFields.reference<MobileStockCountDetail, LicensePlateNumber, Container>({
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
                optionType: '@sage/x3-stock-data/ContainerStatus',
            }),
        ],
    })
    newLicensePlateNumber: ui.fields.Reference<LicensePlateNumber>;

    @ui.decorators.referenceField<MobileStockCountDetail, Location>({
        parent() {
            return this.newBlock;
        },
        title: 'Location',
        placeholder: 'Scan or select…',
        node: '@sage/x3-stock-data/Location',
        valueField: 'code',
        isMandatory: true,
        isTransient: true,
        isFullWidth: true,
        isAutoSelectEnabled: true,
        shouldSuggestionsIncludeColumns: true,
        canFilter: false,
        filter() {
            return {
                stockSite: { code: this.stockSite.value.code },
                // TODO: Implement: To be used for location 'suggestions'
                // at least 1 stock record must exist for the product & site
                // stock: {
                //     _atLeast: 1,
                //     // stockSite: { code: this.stockSite.value.code }, // TODO: Verify: is this redundant?
                //     product: { code: this.newProduct.value.code },
                //     isBeingCounted: { _ne: true }, // TODO: Verify: to include both false & null(?)
                //     // (XT-1401 & XT-5527) TODO: Issue: Computational value on the right-hand side of graphql logical operator
                //     //quantityInStockUnit: { _gt (allocatedQuantity + inProcessQuantity) },
                //     remainingQuantity: { _gt: '0' }, // workaround for computational value by creating a non-stored computed property
                // },
            };
        },
        onChange() {
            if (this.newLocation.value) this.newLocation.getNextField(true)?.focus();
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
            ui.nestedFields.text({
                bind: 'category',
                title: 'Category',
                isReadOnly: true,
            }),
            // (X3-227347) TODO: Obsolete: Having to specify & hide fields used in filter that don't need to be displayed
            ui.nestedFields.reference<MobileStockCountDetail, Location, Site>({
                node: '@sage/x3-system/Site',
                bind: 'stockSite',
                valueField: 'code',
                isHidden: true,
            }),
        ],
    })
    newLocation: ui.fields.Reference<Location>;

    @ui.decorators.filterSelectField<MobileStockCountDetail, Lot>({
        parent() {
            return this.newBlock;
        },
        title: 'Lot',
        placeholder: 'Scan or select…',
        node: '@sage/x3-stock-data/Lot',
        valueField: 'code',
        helperText: 'sublot', // TODO: Preload sublot based on selected lot
        isHelperTextHidden: true,
        isTransient: true,
        isFullWidth: true,
        isNewEnabled: true,
        validation: /^$|^[^|a-z]+$/, // added a check for negating lower-case characters to avoid edge cases
        minLookupCharacters: 1,
        canFilter: false,
        filter() {
            return {
                product: { code: this.newProduct.value.code },
            };
        },
        columns: [
            ui.nestedFields.text({
                bind: 'code',
                title: 'Lot',
                isReadOnly: true,
            }),
            ui.nestedFields.text({
                bind: 'sublot',
                title: 'Sublot',
                isReadOnly: true,
            }),
        ],
        async onChange() {
            await this._onChangeLot(
                this.newLot,
                this.newSublot,
                this.newMajorVersion,
                this.newMinorVersion,
                this.newProduct.value.code,
            );
        },
    })
    newLot: ui.fields.FilterSelect<Lot>;

    @ui.decorators.textField<MobileStockCountDetail>({
        parent() {
            return this.newBlock;
        },
        title: 'Sublot',
        placeholder: 'Scan or select...',
        isTransient: true,
        isMandatory: true,
        isFullWidth: false,
        validation: /^$|^[^|a-z]+$/,
        async onChange() {
            await this._onChangeSublot(
                this.newLot,
                this.newSublot,
                this.newMajorVersion,
                this.newMinorVersion,
                this.newProduct.value?.code ?? '',
            );
        },
    })
    newSublot: ui.fields.Text;

    @ui.decorators.textField<MobileStockCountDetail>({
        parent() {
            return this.newBlock;
        },
        title: 'Serial number',
        placeholder: 'Scan or select…',
        isTransient: true,
        isMandatory: true, // No support of auto generating serial numbers in ADC counts so if a serial number is required, it must be manually entered
        isFullWidth: true,
        validation: /^$|^[^|]+$/,
    })
    newSerialNumber: ui.fields.Text;

    /*
    // for ADC count, major & minor versions cannot be editable
    @ui.decorators.textField<MobileStockCountDetail>({
        parent() {
            return this.newBlock;
        },
        title: 'Major version',
        isTransient: true,
        isReadOnly: true,
        isFullWidth: false,
    })
    newMajorVersion: ui.fields.Text;
    */

    @ui.decorators.referenceField<MobileStockCountDetail, MajorVersionStatus>({
        parent() {
            return this.newBlock;
        },
        isTransient: true,
        isReadOnly: true,
        isFullWidth: false,
        node: '@sage/x3-stock-data/MajorVersionStatus',
        valueField: 'code',
    })
    newMajorVersion: ui.fields.Reference<MajorVersionStatus>;

    @ui.decorators.textField<MobileStockCountDetail>({
        parent() {
            return this.newBlock;
        },
        title: 'Minor version',
        isTransient: true,
        isReadOnly: true,
        isFullWidth: false,
    })
    newMinorVersion: ui.fields.Text;

    @ui.decorators.selectField<MobileStockCountDetail>({
        parent() {
            return this.newBlock;
        },
        title: 'Unit',
        isTransient: true,
        isMandatory: true,
        isFullWidth: false,
        onChange() {
            this._onChangeNewPackingUnit(this.newPackingUnit, true, this.newProduct.value.code);
            // this.newPackingUnit.getNextField(true)?.focus();
        },
    })
    newPackingUnit: ui.fields.Select;

    @ui.decorators.referenceField<MobileStockCountDetail, StockStatus>({
        parent() {
            return this.newBlock;
        },
        title: 'Status',
        placeholder: 'Enter status',
        node: '@sage/x3-stock-data/StockStatus',
        valueField: 'code',
        isTransient: true,
        isMandatory: true,
        isFullWidth: false,
        isAutoSelectEnabled: true,
        isDropdownDisabled: false,
        minLookupCharacters: 1,
        canFilter: false,
        // filter() {}, // (X3-240602) TODO: Issue: Add filter for status according to stock management rules
        columns: [
            ui.nestedFields.text({
                bind: 'code',
                title: 'Status',
                isReadOnly: true,
            }),
        ],
        onChange() {
            this.newStatus.getNextField(true)?.focus();
        },
    })
    newStatus: ui.fields.Reference<StockStatus>;

    @ui.decorators.numericField<MobileStockCountDetail>({
        parent() {
            return this.newBlock;
        },
        title: 'Counted quantity',
        placeholder: 'Enter quantity',
        isTransient: true,
        isMandatory: true,
        isFullWidth: true,
        isNotZero: true,
        scale: 5,
        min: 0,
    })
    newCountedStockInPackingUnit: ui.fields.Numeric;

    /*
     *
     *  Page Actions
     *
     */

    @ui.decorators.pageAction<MobileStockCountDetail>({
        title: 'Next',
        shortcut: ['f3'],
        buttonType: 'secondary',
        isDisabled: true,
        async onClick() {
            if (!(await this.$.router.hasNextRecord())) {
                // // Loop back to the 1st record of the selected stock count list
                // const nextRecordId = (
                //     await this.$.graph
                //         .node('@sage/x3-stock/StockCountListDetail')
                //         .queries.getFirstAvailableCountRecord(
                //             { _id: true },
                //             {
                //                 // TODO: Issue: ERROR 'Expected type IntReference'. Cannot specify a StockCountList reference type parameter because _id is string in Sage X3 tables but expects int
                //                 stockCountSessionNumber: this.stockCountSessionNumber.value.stockCountSession,
                //                 stockCountListNumber: this.stockCountListNumber.value.stockCountListNumber,
                //                 excludeCountedLines: this.$.queryParameters.excludeCountedLines === 'true',
                //             },
                //         )
                //         .execute()
                // )._id;

                // // handle edgy case of the selected stock count list containing
                // if (nextRecordId && nextRecordId !== this._id.value) {
                //     await this.$.router.selectRecord(nextRecordId);
                // }

                if (
                    await dialogMessage(
                        this,
                        'info',
                        ui.localize('@sage/x3-stock/dialog-information-title', 'Information'),
                        ui.localize('@sage/x3-stock/end-of-count-list', 'End of count list'),
                        {
                            fullScreen: true,
                            rightAligned: false,
                            acceptButton: {
                                isDisabled: false,
                                isHidden: false,
                                text: ui.localize('@sage/x3-stock/button-accept-ok', 'OK'),
                            },
                        },
                    )
                ) {
                    this.$.router.goTo('@sage/x3-stock/MobileStockCount');
                }
                return;
            }
            await this.$.router.nextRecord();
        },
    })
    nextButton: ui.PageAction;

    @ui.decorators.pageAction<MobileStockCountDetail>({
        title: 'Submit',
        buttonType: 'primary',
        isDisabled: true,
        async onClick() {
            if (!this.countedStockInPackingUnit?.value || this.countedStockInPackingUnit?.value === 0) {
                if (
                    await dialogConfirmation(
                        this,
                        'warn',
                        ui.localize('@sage/x3-stock/dialog-warning-title', 'Warning'),
                        ui.localize(
                            '@sage/x3-stock/dialog-warn-stock-count-details-zero-stock-quantity',
                            'Zero stock?',
                        ),
                        {
                            fullScreen: true,
                            acceptButton: {
                                text: ui.localize('@sage/x3-stock/button-accept-yes', 'Yes'),
                            },
                            cancelButton: {
                                text: ui.localize('@sage/x3-stock/button-cancel-no', 'No'),
                            },
                        },
                    )
                ) {
                    this.countedStockInPackingUnit.value = 0;
                } else {
                    this.countedStockInPackingUnit.focus();
                    return;
                }
            }
            if (this.countedStockInPackingUnit?.value < 0) {
                return;
            }
            const valid: boolean = await this._validateCount(this.countedStockInPackingUnit.value);
            if (!valid) {
                this.countedStockInPackingUnit.focus();
                return;
            }

            await this._onClickUpdate();
        },
    })
    updateButton: ui.PageAction;

    @ui.decorators.pageAction<MobileStockCountDetail>({
        title: 'Add line',
        onClick() {
            this._initializePage(MobileStockCountDetailPageMode.create);
        },
    })
    newButton: ui.PageAction;

    @ui.decorators.pageAction<MobileStockCountDetail>({
        title: 'View count',
        onClick() {
            this.$.router.goTo('@sage/x3-stock/MobileViewCountList', {});
        },
    })
    viewCountsButton: ui.PageAction;

    @ui.decorators.pageAction<MobileStockCountDetail>({
        title: 'Cancel',
        shortcut: ['f4'],
        buttonType: 'secondary',
        onClick() {
            this._initializePage(MobileStockCountDetailPageMode.update);
        },
    })
    cancelButton: ui.PageAction;

    @ui.decorators.pageAction<MobileStockCountDetail>({
        title: 'Create',
        buttonType: 'primary',
        async onClick() {
            await this._onClickCreate();
        },
    })
    createButton: ui.PageAction;

    // The purpose of this hidden business action button is to cleverly act as if the same shortcut key 'F2' is assigned to multiple buttons: Submit & Create
    @ui.decorators.pageAction<MobileStockCountDetail>({
        isTitleHidden: true,
        isHidden: true,
        shortcut: ['f2'],
        async onClick() {
            await (this.updateButton.isHidden ? this._onClickCreate() : this._onClickUpdate());
        },
    })
    hiddenShortcutButton: ui.PageAction;

    /*
     *
     *  Helper Functions
     *
     */

    private async _preloadVersion(
        productCode: string,
        lot: ui.fields.FilterSelect<Lot>,
        sublot: ui.fields.Text,
        majorVersion: ui.fields.Reference,
        minorVersion: ui.fields.Text,
    ) {
        let record; // TODO: Issue: Cannot read a record that contains 'empty' for a key index (ex. a lot record without a sublot)

        // if this is lot & sublot tracked product + user input is a lot record that exists
        if (
            lot.value &&
            sublot.value &&
            (record = await this.$.graph
                .node('@sage/x3-stock-data/Lot')
                .read(
                    { _id: true, majorVersion: { code: true }, minorVersion: true },
                    `${productCode}|${lot.value}|${sublot.value}`,
                )
                .execute())
        ) {
            // if lot record exists, preload verions based from the lot record
            majorVersion.value = record.majorVersion;
            minorVersion.value = record.minorVersion ?? '';
            sublot.getNextField(true)?.focus();
        } else if (
            lot.value &&
            !sublot.value &&
            (record = extractEdges(
                await this.$.graph
                    .node('@sage/x3-stock-data/Lot')
                    .query(
                        ui.queryUtils.edgesSelector<Lot>(
                            {
                                majorVersion: { code: true },
                                minorVersion: true,
                            },
                            {
                                filter: {
                                    product: { code: productCode },
                                    code: lot.value,
                                    sublot: '', // TODO: Verify: to filter on 'empty', use empty string or null?
                                },
                            },
                        ),
                    )
                    .execute(),
            )[0])
        ) {
            majorVersion.value = record.majorVersion;
            minorVersion.value = record.minorVersion ?? '';
            lot.getNextField(true)?.focus();
        } else {
            if (
                await dialogConfirmation(
                    this,
                    'warn',
                    ui.localize('@sage/x3-stock/dialog-warning-title', 'Warning'),
                    ui.localize(
                        '@sage/x3-stock/dialog-message-warning-inquiry-item-does-not-exist',
                        '{{item}} does not exist.  Do you want to continue?',
                        {
                            item: `${sublot.value ? `${lot.value} : ${sublot.value}` : lot.value}`,
                        },
                    ),
                    {
                        acceptButton: { text: ui.localize('@sage/x3-stock/button-accept-yes', 'Yes') },
                        cancelButton: { text: ui.localize('@sage/x3-stock/button-cancel-no', 'No') },
                    },
                )
            ) {
                // preload version from version-related nodes based on selected product
                const versionRecord: ExtractEdges<MajorVersionStatus> = extractEdges(
                    await this.$.graph
                        .node('@sage/x3-stock-data/MajorVersionStatus')
                        .query(
                            ui.queryUtils.edgesSelector<MajorVersionStatus>(
                                {
                                    code: true,
                                    minorVersions: {
                                        query: {
                                            edges: {
                                                node: {
                                                    minorVersion: true,
                                                },
                                            },
                                            __args: {
                                                filter: JSON.stringify({ type: 'stock' }),
                                                orderBy: JSON.stringify({ minorVersion: -1 }),
                                            },
                                        },
                                    },
                                },
                                {
                                    filter: {
                                        product: { code: productCode },
                                        status: { _in: ['Active', 'Stopped'] },
                                    },
                                    orderBy: { status: +1 },
                                },
                            ),
                        )
                        .execute(),
                )[0] as ExtractEdges<MajorVersionStatus>;
                majorVersion.value = versionRecord;
                minorVersion.value = versionRecord?.minorVersions[0]?.minorVersion ?? '';
                sublot.value ? sublot.getNextField(true)?.focus() : lot.getNextField(true)?.focus();
            } else {
                // clear out values
                lot.value = '';
                sublot.value = '';
                majorVersion.value = null;
                minorVersion.value = '';
                lot.focus();
                return;
            }
        }
    }

    /**
     * Initialize the states of fields on the ADC Count Detail page
     * @param mode - specify whether to be in update or new (aka. create) mode
     * @param productCode - (optional) specify a productCode to refresh and set the state of the specified mode (update or new) based on the productCode's product settings.
     * If you merely switching back to the previous mode, don't specify this parameter to avoid a server-side call
     */
    private async _initializePage(mode: MobileStockCountDetailPageMode, productCode?: string) {
        const updateMode = mode === MobileStockCountDetailPageMode.update;

        // Initialize line number field
        this.stockCountListDetailLineNumbers.isHidden = this.stockCountListDetailLineNumbers.isDisabled = !updateMode;
        this.stockCountListDetailLineNumbers.value = updateMode
            ? {
                  productRankNumber: this.productRankNumber.value,
                  _id: this._id.value,
              }
            : null;

        //header fields
        this.headerStockCountListNumber.value = this.stockCountList.value.stockCountListNumber;
        this.headerStockCountSessionNumber.value = this.stockCountSession.value.stockCountSession;
        this.headerProductCode.value = this.product.value.code;
        this.headerProductDescription.value = this.productLocalizedDescription1.value.localizedDescription1;
        this.headerProductCode.isHidden = !updateMode;
        this.headerProductDescription.isHidden = !updateMode;

        // Hide/unhide blocks & initialize the block being displayed
        this.updateBlock.isHidden = !updateMode;
        this.newBlock.isHidden = updateMode;
        await this._getIsTheoreticalQuantityDisplayed();
        if (!this.newBlock.isHidden) {
            await this._initializeNewBlock(productCode);
        } else {
            // skip initializing update block when simply transitioning from new to update mode
            await this._initializeUpdateBlock(productCode);
        }

        // Initialize Business Action buttons
        this.nextButton.isHidden = this.nextButton.isDisabled = !updateMode;
        this.updateButton.isHidden = this.updateButton.isDisabled = !updateMode;
        this.newButton.isHidden = this.newButton.isDisabled = !updateMode;
        this.viewCountsButton.isHidden = this.viewCountsButton.isDisabled = !updateMode;
        this.cancelButton.isHidden = this.cancelButton.isDisabled = updateMode;
        this.createButton.isHidden = this.createButton.isDisabled = updateMode;

        this.$.removeToasts(); // to remove any lingering notifications due to page validations
    }

    private async _initializeNewBlock(productCode?: string) {
        // TODO: Verify: Is there a way and is it more efficiency to be able to retrieve isLicensePlateNumberManaged & isLocationManaged from the product reference field
        let productSiteSettings: ExtractEdgesPartial<ProductSite> =
            productCode && this.stockSite.value?.code ? await this._fetchProductSettings(productCode) : null;

        // Enable/disable fields based on selected product's settings (or if not provided, disable everything)
        this.newLocation.isHidden = this.newLocation.isDisabled = !productSiteSettings?.isLocationManaged;
        this.newLicensePlateNumber.isHidden = this.newLicensePlateNumber.isDisabled =
            !productSiteSettings?.isLicensePlateNumberManaged;
        this.newLot.isHidden = this.newLot.isDisabled =
            !productSiteSettings?.product.lotManagementMode ||
            productSiteSettings.product.lotManagementMode === 'notManaged';
        this.newSublot.isHidden = this.newSublot.isDisabled =
            !productSiteSettings?.product.lotManagementMode ||
            productSiteSettings.product.lotManagementMode !== 'lotAndSublot';
        this.newSerialNumber.isHidden = this.newSerialNumber.isDisabled =
            !productSiteSettings?.product.serialNumberManagementMode ||
            productSiteSettings.product.serialNumberManagementMode !== 'receivedIssued';

        // Version is never editable. It is preloaded based on selected product.
        // However version fields should be only hidden based on product's settings
        this.newMajorVersion.isHidden =
            !productSiteSettings?.product.stockVersionMode || productSiteSettings.product.stockVersionMode === 'no';
        this.newMinorVersion.isHidden =
            !productSiteSettings?.product.stockVersionMode ||
            productSiteSettings.product.stockVersionMode !== 'majorAndMinor';

        this.newPackingUnit.isHidden = this.newPackingUnit.isDisabled = !productSiteSettings;
        //packingUnit is disable if product managed by serial number
        this.newPackingUnit.isReadOnly =
            !productSiteSettings?.product.serialNumberManagementMode ||
            !['notManaged', 'receivedIssued'].includes(productSiteSettings.product.serialNumberManagementMode);
        this.newStatus.isHidden = this.newStatus.isDisabled = !productSiteSettings;
        this.newCountedStockInPackingUnit.isHidden = this.newCountedStockInPackingUnit.isDisabled =
            !productSiteSettings;

        // Clear values + any value initializations
        if (!productSiteSettings) {
            this.newProduct.value = null;
            this.newProduct.focus();
        } else {
            this.newLicensePlateNumber.value = null;
            this.newLocation.value = null;
            this.newLot.value = '';
            this.newSublot.value = '';
            this.newSerialNumber.value = '';
            this.newMajorVersion.value = null;
            this.newMinorVersion.value = '';
            this.newPackingUnit.options = [];
            this.newPackingUnit.value = null;
            this._unitMap.clear();
            this.newStatus.value = { code: 'A' }; // (X3-240602) TODO: Issue:  Implement default values from TABSTORUL
            this.newCountedStockInPackingUnit.value = null;

            // Other component-level initializations
            this.newLot.isMandatory =
                !this.newLot.isDisabled &&
                ['mandatoryLot', 'lotAndSublot'].includes(productSiteSettings.product.lotManagementMode);

            if (!this.packingUnit.isHidden)
                if (!this.newPackingUnit.isDisabled) {
                    this._onChangeNewPackingUnit(this.newPackingUnit, false, productCode);
                    // let productPackingList = productSiteSettings.product.packingUnits;

                    // let productPackingUnitSelectValues = productPackingList.map(productPacking => {
                    //     return `${productPacking.packingUnit.code}`;
                    // });

                    // this.newPackingUnit.options = [
                    //     productSiteSettings.product.stockUnit.code,
                    //     ...productPackingUnitSelectValues,
                    // ];
                    // this.newPackingUnit.value = this.newPackingUnit.options[0];
                    // if (this.newPackingUnit.value !== productSiteSettings.product.stockUnit.code) {
                    //     let _index = productPackingList.findIndex(
                    //         unit => (unit.unit.code = this.newPackingUnit.options[0]),
                    //     );
                    //     _index > -1
                    //         ? (this.packingUnitToStockUnitConversionFactor.value = Number(
                    //               productPackingList[_index].packingUnitToStockUnitConversionFactor,
                    //           ))
                    //         : (this.packingUnitToStockUnitConversionFactor.value = 1);
                    // } else this.packingUnitToStockUnitConversionFactor.value = 1;
                }

            //if item is serial tracked, quantity must be 0 or 1
            this.newCountedStockInPackingUnit.max = !this.newSerialNumber.isDisabled ? 1 : undefined;

            // focus logic
            await this.$.commitValueAndPropertyChanges();
            this.newProduct.getNextField(true)?.focus(); // (X3-249511) TODO: Issue: Selecting certain products will cause unexpected UI behavior like getNextField returning null
        }
    }

    private async _initializeUpdateBlock(productCode?: string) {
        if (!productCode) return;

        let productSiteSettings: ExtractEdgesPartial<ProductSite> = await this._fetchProductSettings(productCode);
        const isEditable = !this.stockLine.value; // make certain fields 'editable' if record is not associated to any stock record, meaning a record that was created via 'Add line' functionality

        // Display/Hide fields based on current count record product's settings
        if (!productSiteSettings.isLocationManaged) {
            this.location.isHidden = true;
        } else {
            this.location.isHidden = false;
            this.location.isReadOnly = !isEditable;
        }
        if (!productSiteSettings.isLicensePlateNumberManaged) {
            this.editableLicensePlateNumber.isHidden = true;
        } else {
            this.editableLicensePlateNumber.isHidden = false;
            this.editableLicensePlateNumber.value = this.licensePlateNumber.value?.code
                ? { code: this.licensePlateNumber.value.code }
                : null; // special logic here to copy non-transient value to a transient field
            this.editableLicensePlateNumber.isReadOnly = !isEditable;
        }
        if (productSiteSettings.product.lotManagementMode === 'notManaged') {
            this.editableLot.isHidden = true;
            this.editableLot.isMandatory = false;
        } else {
            this.editableLot.isHidden = false;
            this.editableLot.value = this.lot.value;
            this.editableLot.isReadOnly = !isEditable;
            // this.editableLot.isMandatory = productSiteSettings.product.lotManagementMode !== 'optionalLot'; // bug isMandatory with transient field
        }
        if (productSiteSettings.product.lotManagementMode !== 'lotAndSublot') {
            this.sublot.isHidden = true;
        } else {
            this.sublot.isHidden = false;
            this.sublot.isReadOnly = !isEditable;
        }
        if (productSiteSettings.product.serialNumberManagementMode !== 'receivedIssued') {
            this.serialNumber.isHidden = true;
        } else {
            this.serialNumber.isHidden = false;
            this.serialNumber.isReadOnly = !isEditable;
        }
        this.majorVersion.isHidden = productSiteSettings.product.stockVersionMode === 'no';
        this.minorVersion.isHidden = productSiteSettings.product.stockVersionMode !== 'majorAndMinor';

        this.packingUnit.isHidden = false;
        this.status.isHidden = false;
        this.identifier1.isHidden = !this.identifier1.value;
        this.identifier2.isHidden = !this.identifier2.value;
        this.quantityInPackingUnit.isHidden = !this._isTheoreticalQuantityDisplayed;
        this.isZeroStock.isHidden = true;
        this.countedStockInPackingUnit.isHidden = false;

        if (!this.stockLine.value) this.quantityInPackingUnit.value = null;

        this.quantityInPackingUnit.scale = this.packingUnit.value.numberOfDecimals; // also display quantity in decimals
        this.countedStockInPackingUnit.scale = this.packingUnit.value.numberOfDecimals;
        this.countedStockInPackingUnit.value =
            this.countedStockInPackingUnit.value !== 0 || this.isZeroStock.value
                ? this.countedStockInPackingUnit.value
                : null;
        //if item is serial tracked, quantity must be 0 or 1
        this.countedStockInPackingUnit.max = !this.serialNumber.isHidden ? 1 : undefined;
        this.countedStockInPackingUnit.focus();
    }

    private async _fetchProductSettings(productCode: string): Promise<ExtractEdgesPartial<ProductSite>> {
        const response = await this.$.graph
            .node('@sage/x3-master-data/ProductSite')
            .read(
                {
                    isLicensePlateNumberManaged: true, // determine is LPN should be displayed
                    isLocationManaged: true,
                    product: {
                        lotManagementMode: true,
                        serialNumberManagementMode: true,
                        stockVersionMode: true,
                        stockUnit: {
                            code: true,
                            numberOfDecimals: true,
                        },
                        packingUnits: {
                            query: {
                                edges: {
                                    node: {
                                        packingUnit: {
                                            code: true,
                                            numberOfDecimals: true,
                                        },
                                        packingUnitToStockUnitConversionFactor: true,
                                        isPackingFactorEntryAllowed: true,
                                    },
                                },
                            },
                        },
                    },
                },
                `${productCode}|${this.stockSite.value.code}`,
            )
            .execute();

        // TODO: Verify: This check is probably not needed
        if (!response) {
            throw new Error(`Nonexistent product code: ${productCode}`);
        }

        return {
            ...response,
            product: {
                ...response.product,
                packingUnits: extractEdges(response.product.packingUnits.query as Edges<ProductPackingUnits>),
            },
        };
    }

    private _mapMultiCountMode() {
        if (!this.stockCountSession.value.isMultipleCount) {
            this.multiCountNumber.value = 0;
            return;
        }

        if (this.countedStockInPackingUnit1.value === 0 && !this.isZeroStock1.value) {
            this.multiCountNumber.value = 1;
            this.multiCountMode.value = ui.localize(
                '@sage/x3-stock/constant-stock-count-details__count',
                'Count {{count}}',
                {
                    count: this.multiCountNumber.value,
                },
            );
        } else if (this.countedStockInPackingUnit2.value === 0 && !this.isZeroStock2.value) {
            this.multiCountNumber.value = 2;
            this.multiCountMode.value = ui.localize(
                '@sage/x3-stock/constant-stock-count-details__count',
                'Count {{count}}',
                {
                    count: this.multiCountNumber.value,
                },
            );
        } else if (this.countedStockInPackingUnit.value === 0 && !this.isZeroStock.value) {
            this.multiCountMode.value = ui.localize(
                '@sage/x3-stock/constant-stock-count-details__final-count',
                'Final count',
            );
            this.multiCountNumber.value = 0;
        } else {
            this.multiCountMode.value = ui.localize('@sage/x3-stock/constant__counted-literal', 'Counted');
            this.multiCountNumber.value = 0;
        }
    }

    /** @internal */
    private async _callProcessCountAPI(
        mode: MobileStockCountDetailPageMode,
        serialNumberRanges: StockCountSerialNumberInput[],
    ): Promise<any> {
        // if parameter value like licensePlateNumber is not applicable (i.e. selected product is not lpn managed),
        // parameter should still be specified but set to empty (not null)
        // Warning : this anonymous parameters block is mirror of mutation
        let _processCountArgs: {
            stockCountSessionNumber: string;
            stockCountListNumber: string;
            productRankNumber: number;
            product: string;
            licensePlateNumber: string;
            location: string;
            lot: string;
            sublot: string;
            serialNumber: string;
            status: string;
            majorVersion: string;
            minorVersion: string;
            packingUnit: string;
            countedStockInPackingUnit: decimal;
            packingUnitToStockUnitConversionFactor: decimal;
            multiCountNumber: number;
            serialNumberQuantity: decimal[];
            startingSerialNumber: string[];
            endingSerialNumber: string[];
            serialNumberVariance: string[];
        };
        if (mode === MobileStockCountDetailPageMode.update) {
            _processCountArgs = {
                stockCountSessionNumber: this.stockCountSession.value?.stockCountSession ?? '',
                stockCountListNumber: this.stockCountList.value?.stockCountListNumber ?? '',
                productRankNumber: Number(this.productRankNumber.value),
                product: this.product.value?.code ?? '',
                licensePlateNumber: this.editableLicensePlateNumber.value?.code ?? '',
                location: this.location.value?.code ?? '',
                // apparently if value of non-transient filterSelect is empty, it becomes undefined
                lot: this.editableLot.value ?? '',
                sublot: this.sublot.value ?? '',
                serialNumber: this.serialNumber.value ?? '',
                status: this.status.value ?? '',
                majorVersion: this.majorVersion.value?.code ?? '',
                minorVersion: this.minorVersion.value ?? '',
                packingUnit: this.packingUnit.value.code,
                countedStockInPackingUnit: Number(this.countedStockInPackingUnit.value),
                packingUnitToStockUnitConversionFactor: Number(this.packingUnitToStockUnitConversionFactor.value),
                multiCountNumber: Number(this.multiCountNumber.value),
                serialNumberQuantity: [],
                startingSerialNumber: [],
                endingSerialNumber: [],
                serialNumberVariance: [],
            };
        } else {
            // if in create mode
            _processCountArgs = {
                stockCountSessionNumber: this.stockCountSession.value?.stockCountSession ?? '',
                stockCountListNumber: this.stockCountList.value?.stockCountListNumber ?? '',
                productRankNumber: 0,
                product: this.newProduct.value?.code ?? '',
                licensePlateNumber: this.newLicensePlateNumber.value?.code ?? '',
                location: this.newLocation.value?.code ?? '',
                lot: this.newLot.value ?? '',
                sublot: this.newSublot.value ?? '',
                serialNumber: this.newSerialNumber.value ?? '',
                status: this.newStatus.value.code,
                majorVersion: this.newMajorVersion.value?.code ?? '',
                minorVersion: this.newMinorVersion.value ?? '',
                packingUnit: this.newPackingUnit.value ?? '',
                countedStockInPackingUnit: Number(this.newCountedStockInPackingUnit.value),
                packingUnitToStockUnitConversionFactor: Number(this.packingUnitToStockUnitConversionFactor.value),
                multiCountNumber: Number(this.multiCountNumber.value),
                serialNumberQuantity: [],
                startingSerialNumber: [],
                endingSerialNumber: [],
                serialNumberVariance: [],
            };
        }

        // Arrays must contain an element, even if empty.
        if (serialNumberRanges.length) {
            serialNumberRanges.forEach(_ => {
                _processCountArgs.serialNumberQuantity.push(Number(_.quantity));
                _processCountArgs.startingSerialNumber.push(_.startingSerialNumber);
                _processCountArgs.endingSerialNumber.push(_.endingSerialNumber);
                _processCountArgs.serialNumberVariance.push(_.stockCountVariance);
            });
        } else {
            _processCountArgs.serialNumberQuantity.push(0);
            _processCountArgs.startingSerialNumber.push('');
            _processCountArgs.endingSerialNumber.push('');
            _processCountArgs.serialNumberVariance.push('');
        }

        try {
            const response = (await this.$.graph
                .node('@sage/x3-stock/StockCountListDetail')
                .mutations.processCount(
                    {
                        stockCountSessionNumber: true,
                        stockCountListNumber: true,
                    },
                    { parameters: _processCountArgs },
                )
                .execute()) as any;

            if (!response?.stockCountSessionNumber) {
                return new ApiError(`Mutation response is empty`, []);
            }
            return response;
        } catch (error) {
            return error;
        }
    }

    private _filterLicensePlateNumber(productCode: string, locationCode?: string): Filter<LicensePlateNumber> {
        let filter: Filter<LicensePlateNumber> = {
            // TODO: Add site criterion to filter for LPNs
            stockSite: { code: this.stockSite.value?.code ?? undefined },
            isActive: true,
            _and: [
                {
                    _or: [
                        { isSingleProduct: { _eq: false } },
                        {
                            isSingleProduct: { _eq: true }, // to not imply isSingleProduct is true here because this property is nullable
                            stock: { _atLeast: 1, product: { product: { code: productCode } } },
                        },
                        {
                            isSingleProduct: { _eq: true }, // to not imply isSingleProduct is true here because this property is nullable
                            stock: { _none: true }, // TODO: Verify: Does this do what it was intended for? Filter for empty collection
                        },
                    ],
                },
            ],
            // NOTE: No filter criterion on location category because for ADC Counts it can be any location category
        };

        // TODO: Add the container filter
        // if (this.container.value?.code) {
        //     filter.container = { code: this.container.value.code };
        // }

        if (locationCode) {
            filter._and.push({
                _or: [
                    { location: { code: locationCode } },
                    {
                        // to also include entries without location that have 'free' status
                        location: { code: null },
                        status: 'free',
                    },
                ],
            });
        }

        return filter;
    }

    private async _onChangeLicensePlateNumber(
        licensePlateNumber: ui.fields.Reference<LicensePlateNumber>,
        location: ui.fields.Reference<Location>,
    ) {
        if (!licensePlateNumber.value) {
            location.isDisabled = false;
            location.value = null;
            return;
        }

        // Populate and disable To Location field if selected LPN is associated with a location
        if (licensePlateNumber.value?.location) {
            // LPN can be associated with or without a location
            location.value = licensePlateNumber.value.location;
            location.isDisabled = true;
        } else {
            location.isDisabled = false; // should be enabled if LPN is 'free' status (i.e. can be associated to any location)
            location.value = null;
        }

        await this.$.commitValueAndPropertyChanges();
        licensePlateNumber.getNextField(true)?.focus();
    }

    private async _onChangeNewPackingUnit(newPackingUnit: ui.fields.Select, update: boolean, productCode?: string) {
        // if (!newPackingUnit.value) {
        //     return;
        // }
        let productSiteSettings: ExtractEdgesPartial<ProductSite> = await this._fetchProductSettings(productCode ?? '');

        let productPackingList = productSiteSettings.product.packingUnits;

        let productPackingUnitSelectValues = productPackingList.map(productPacking => {
            return `${productPacking.packingUnit.code}`;
        });

        this.newPackingUnit.options = [productSiteSettings.product.stockUnit.code, ...productPackingUnitSelectValues];
        if (!update) this.newPackingUnit.value = this.newPackingUnit.options[0];
        if (this.newPackingUnit.value !== productSiteSettings.product.stockUnit.code) {
            let _index = productPackingList.findIndex(unit => unit.packingUnit.code === this.newPackingUnit.value);
            _index > -1
                ? (this.packingUnitToStockUnitConversionFactor.value = Number(
                      productPackingList[_index].packingUnitToStockUnitConversionFactor,
                  ))
                : (this.packingUnitToStockUnitConversionFactor.value = 1);
        } else this.packingUnitToStockUnitConversionFactor.value = 1;

        await this.$.commitValueAndPropertyChanges();
        newPackingUnit.getNextField(true)?.focus();
    }

    private async _onChangeLot(
        lot: ui.fields.FilterSelect<Lot>,
        sublot: ui.fields.Text,
        majorVersion: ui.fields.Reference,
        minorVersion: ui.fields.Text,
        productCode: string,
    ) {
        // if lot is manually cleared out, then clear out sublot as well ONLY if it doesn't have a pre-populated sublot
        if (!lot.value) {
            sublot.value = '';
            majorVersion.value = null;
            minorVersion.value = '';
            return;
        }

        lot.value = lot.value.toUpperCase();
        await this.$.commitValueAndPropertyChanges(); // to commit the programmatic text changes for validation (otherwise, an error icon may appear despite the value appearing to be valid)
        await lot.validate();

        // TODO: Implement: Preload sublot based on selected lot
        // TODO: Verify: This is not possible to do due to X3-240877
        // if (this.newLot.value.sublot) {
        //     // if lot has an associated sublot, then populate sublot and disable it
        //     this.newSublot.value = this.newLot.helperText;
        //     this.newSublot.isDisabled = true;
        // }

        if (sublot.isHidden || sublot.value) {
            // preload version if current product is not sublot tracked or has a non-empty value for sublot
            await this._preloadVersion(productCode, lot, sublot, majorVersion, minorVersion);
        } else {
            lot.getNextField(true)?.focus();
        }
    }

    private async _onChangeSublot(
        lot: ui.fields.FilterSelect<Lot>,
        sublot: ui.fields.Text,
        majorVersion: ui.fields.Reference,
        minorVersion: ui.fields.Text,
        productCode: string,
    ) {
        if (!sublot.value) return;

        sublot.value = sublot.value.toUpperCase();
        await this.$.commitValueAndPropertyChanges();
        await sublot.validate();

        // If the lot/sublot combination is new, pop-up a warning dialog message
        if (lot.value && sublot.value) {
            await this._preloadVersion(productCode, lot, sublot, majorVersion, minorVersion);
        }
    }

    private async _onClickUpdate() {
        // perform client-side validation
        if (!(await validateWithDetails(this))) return;

        // before even proceeding to the update process, check if the product is global serial tracked. If so, then user must provide additional information i.e. serial number ranges
        let globalSerialRanges: StockCountSerialNumberInput[] = [];
        if (
            this.product.value?.serialNumberManagementMode === 'globalReceivedIssued' &&
            this.multiCountNumber.value === 0 &&
            this.quantityInPackingUnit.value !== this.countedStockInPackingUnit.value &&
            !(globalSerialRanges = await this.$.dialog
                .page('@sage/x3-stock/MobileStockCountSerialPanel', {
                    stockCountListDetail: JSON.stringify({
                        stockSite: this.stockSite.value,
                        stockCountSession: this.stockCountSession.value,
                        stockCountList: this.stockCountList.value,
                        stockLine: this.stockLine.value,
                        product: this.product.value,
                        location: this.location.value,
                        status: this.status.value,
                        identifier1: this.identifier1.value,
                        identifier2: this.identifier2.value,
                        quantityInPackingUnit: String(this.quantityInPackingUnit.value),
                        packingUnit: this.packingUnit.value,
                        countedStockInPackingUnit: String(this.countedStockInPackingUnit.value),
                    } as ExtractEdges<StockCountListDetail>),
                    ...(this.oldCountedStockInPackingUnit.value == this.countedStockInPackingUnit.value && {
                        _id: this._id.value ?? '',
                    }),
                })
                .catch(() => {
                    /* to swallow up any error */
                }))
        ) {
            await this.$.sound.success();
            this.countedStockInPackingUnit.focus();
            return;
        }

        // to prevent extreme scenarios from rapidly clicking the update button multiple times
        this.updateButton.isDisabled = true;
        this.nextButton.isDisabled = true;
        this.newButton.isDisabled = true;
        this.viewCountsButton.isDisabled = true;

        this.$.loader.isHidden = false;
        const result = await this._callProcessCountAPI(MobileStockCountDetailPageMode.update, globalSerialRanges);
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
            };
            let message = '';

            await this.$.sound.error();

            if (!result?.message) {
                message = `${ui.localize(
                    '@sage/x3-stock/pages_creation_error_connexion_webservice_contact_administrator',
                    'An error has occurred (connection or webservice error). Please contact your administrator.',
                )}`;

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
                    await this.$.router.emptyPage();
                    onGoto(this, '@sage/x3-stock/MobileStockCount');
                }
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

                message = `**${ui.localize(
                    '@sage/x3-stock/dialog-error-stock-count-update',
                    'An error occurred',
                )}**\n\n`;

                if (_result.length === 1) {
                    message += `${_result[0]}`;
                } else {
                    message += _result.map(item => `* ${item}`).join('\n');
                }
            }

            if (
                !(await dialogConfirmation(
                    this,
                    'error',
                    ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                    message,
                    options,
                ))
            ) {
                this.$.setPageClean();
            }

            this.updateButton.isDisabled = false;
            this.nextButton.isDisabled = false;
            this.newButton.isDisabled = false;
            this.viewCountsButton.isDisabled = false;
        } else {
            // if success, do NOT display any dialog message
            this.$.setPageClean();
            await this.$.sound.success();

            if (!(await this.$.router.hasNextRecord())) {
                const options: ui.dialogs.DialogOptions = {
                    fullScreen: true,
                    rightAligned: false,
                    acceptButton: {
                        isDisabled: false,
                        isHidden: false,
                        text: ui.localize('@sage/x3-stock/button-accept-ok', 'OK'),
                    },
                };

                await dialogMessage(
                    this,
                    'info',
                    ui.localize('@sage/x3-stock/dialog-information-title', 'Information'),
                    ui.localize('@sage/x3-stock/end-of-count-list', 'End of count list'),
                    options,
                );
                onGoto(this, '@sage/x3-stock/MobileStockCount');
            } else {
                await this.$.router.nextRecord();
            }
        }
    }

    private async _onClickCreate() {
        // perform client-side validation
        if (!(await validateWithDetails(this))) return;

        let globalSerialRanges: StockCountSerialNumberInput[] = [];
        if (
            this.newProduct.value?.serialNumberManagementMode === 'globalReceivedIssued' &&
            this.multiCountNumber.value === 0 &&
            // quantity is always considered an overage
            !(globalSerialRanges = await this.$.dialog
                .page('@sage/x3-stock/MobileStockCountSerialPanel', {
                    stockCountListDetail: JSON.stringify({
                        stockSite: this.stockSite.value,
                        stockCountSession: this.stockCountSession.value,
                        stockCountList: this.stockCountList.value,
                        product: this.newProduct.value,
                        location: this.newLocation.value,
                        status: this.newStatus.value?.code,
                        quantityInPackingUnit: '0',
                        packingUnit: { code: this.newPackingUnit.value },
                        countedStockInPackingUnit: String(this.newCountedStockInPackingUnit.value),
                    } as ExtractEdges<StockCountListDetail>),
                })
                .catch(() => {
                    /* to swallow up any error */
                }))
        ) {
            this.newCountedStockInPackingUnit.focus();
            return;
        }

        // to prevent extreme scenarios from rapidly clicking the update button multiple times
        this.createButton.isDisabled = true;
        this.cancelButton.isDisabled = true;

        this.$.loader.isHidden = false;
        const result = await this._callProcessCountAPI(MobileStockCountDetailPageMode.create, globalSerialRanges);
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
            };
            let message = '';

            await this.$.sound.error();

            if (!result?.message) {
                message = `${ui.localize(
                    '@sage/x3-stock/pages_creation_error_connexion_webservice_contact_administrator',
                    'An error has occurred (connection or webservice error). Please contact your administrator.',
                )}`;

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
                    await this.$.router.emptyPage();
                    onGoto(this, '@sage/x3-stock/MobileStockCount');
                }
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

                message = `**${ui.localize(
                    '@sage/x3-stock/dialog-error-stock-count-create',
                    'An error occurred',
                )}**\n\n`;

                if (_result.length === 1) {
                    message += `${_result[0]}`;
                } else {
                    message += _result.map(item => `* ${item}`).join('\n');
                }
            }

            if (
                !(await dialogConfirmation(
                    this,
                    'error',
                    ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                    message,
                    options,
                ))
            ) {
                this.$.setPageClean();
            }

            this.createButton.isDisabled = false;
            this.cancelButton.isDisabled = false;
        } else {
            await this.$.sound.success();
            // go to back to Update mode
            this._initializePage(MobileStockCountDetailPageMode.update);
        }
    }

    private async _validateCount(counted: number): Promise<boolean> {
        if (!counted) counted = 0;
        if (!this.stockLine.value) return true;
        const validate: boolean =
            counted * (this.packingUnitToStockUnitConversionFactor?.value ?? 0) >=
            Number(this.stockLine.value.allocatedQuantity);
        if (!validate) {
            await dialogMessage(
                this,
                'error',
                ui.localize('@sage/x3-stock/dialog-error-title', 'Error'),
                ui.localize(
                    '@sage/x3-stock/dialog-error-stock-count-details-quantity-message',
                    'Counted quantity cannot be less than allocated quantity',
                ),
            );
        }
        return validate;
    }

    private async _getIsTheoreticalQuantityDisplayed() {
        const responseSite = await this.$.graph
            .node('@sage/x3-master-data/MobileAutomationSetup')
            .query(
                ui.queryUtils.edgesSelector(
                    {
                        isTheoreticalQuantityDisplayed: true,
                    },
                    {
                        filter: {
                            site: this.stockSite.value,
                        },
                    },
                ),
            )
            .execute();
        if (responseSite.edges.length !== 0) {
            responseSite.edges.some(edge => {
                this._isTheoreticalQuantityDisplayed = edge.node.isTheoreticalQuantityDisplayed;
            });
        } else {
            const response = await this.$.graph
                .node('@sage/x3-master-data/MobileAutomationSetup')
                .query(
                    ui.queryUtils.edgesSelector(
                        {
                            isTheoreticalQuantityDisplayed: true,
                        },
                        {
                            filter: {
                                site: null,
                            },
                        },
                    ),
                )
                .execute();
            if (response.edges.length !== 0) {
                response.edges.some(edge => {
                    this._isTheoreticalQuantityDisplayed = edge.node.isTheoreticalQuantityDisplayed;
                });
            } else {
                this._isTheoreticalQuantityDisplayed = false;
            }
        }
    }
}
