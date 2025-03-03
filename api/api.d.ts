declare module '@sage/x3-stock-api-partial' {
    import type {
        AutomaticJournal,
        Dimension,
        DimensionType,
        Package as SageX3FinanceData$Package,
    } from '@sage/x3-finance-data-api';
    import type { Package as SageX3InvoicingData$Package, TaxRule } from '@sage/x3-invoicing-data-api';
    import type { Package as SageX3ManufacturingData$Package } from '@sage/x3-manufacturing-data-api';
    import type {
        Address,
        BomRouting,
        BusinessPartner,
        Carrier,
        CommonText,
        Container,
        Currency,
        Customer,
        CustomerAddress,
        Incoterm,
        Package as SageX3MasterData$Package,
        Product,
        ProductCategory,
        ProductSiteInput,
        ShipToCustomerAddress,
        ShipToCustomerAddressCompanyNames,
        ShipToCustomerAddressCompanyNamesBinding,
        ShipToCustomerAddressCompanyNamesInput,
        ShipToCustomerAddressInput,
        ShipToCustomerAddressSalesReps,
        ShipToCustomerAddressSalesRepsBinding,
        ShipToCustomerAddressSalesRepsInput,
        UnavailablePeriods,
        UnitOfMeasure,
    } from '@sage/x3-master-data-api';
    import type { Package as SageX3PhysicalFlowsData$Package, Packaging } from '@sage/x3-physical-flows-data-api';
    import type {
        Package as SageX3ProjectManagementData$Package,
        ProjectLink,
    } from '@sage/x3-project-management-data-api';
    import type { Package as SageX3SalesData$Package, SalesDeliveryType } from '@sage/x3-sales-data-api';
    import type {
        LicensePlateNumber,
        Location,
        MajorVersionStatus,
        Package as SageX3StockData$Package,
        ProductSiteDefaultLocations,
        ProductSiteDefaultLocationsBinding,
        ProductSiteDefaultLocationsInput,
        ProductSiteInternalContainers,
        ProductSiteInternalContainersBinding,
        ProductSiteInternalContainersInput,
        Stock,
        StockJournal,
        StockJournalInput,
        StockStatus,
        Warehouse,
    } from '@sage/x3-stock-data-api';
    import type { Package as SageX3Structure$Package, SiteGroupings } from '@sage/x3-structure-api';
    import type {
        Access,
        Company,
        GenericPrintReport,
        Language,
        MiscellaneousTable,
        Package as SageX3System$Package,
        Site,
        User,
    } from '@sage/x3-system-api';
    import type { Package as SageXtremAppMetadata$Package } from '@sage/xtrem-app-metadata-api';
    import type { Package as SageXtremX3SystemUtils$Package, SysUser } from '@sage/xtrem-x3-system-utils-api';
    import type {
        AggregateQueryOperation,
        AggregateReadOperation,
        ClientCollection,
        ClientNode,
        ClientNodeInput,
        CreateOperation,
        GetDefaultsOperation,
        GetDuplicateOperation,
        Operation as Node$Operation,
        QueryOperation,
        ReadOperation,
        TextStream,
        VitalClientNode,
        VitalClientNodeInput,
        decimal,
        integer,
    } from '@sage/xtrem-client';
    export interface BlockedStock$Enum {
        no: 1;
        yes: 2;
        partial: 3;
    }
    export type BlockedStock = keyof BlockedStock$Enum;
    export interface DestinationChoice$Enum {
        internal: 1;
        intersite: 2;
        customer: 3;
        subcontractTransfer: 4;
        subcontractReturn: 5;
    }
    export type DestinationChoice = keyof DestinationChoice$Enum;
    export interface EnteredStockLineStatus$Enum {
        newLine: 1;
        oldLine: 2;
        changedUnit: 3;
        notControlled: 4;
        controlled: 5;
        analysisRequested: 6;
        suspended: 7;
    }
    export type EnteredStockLineStatus = keyof EnteredStockLineStatus$Enum;
    export interface OriginOfPutAwayPlan$Enum {
        awaitingPutAway: 1;
        replenishment: 2;
    }
    export type OriginOfPutAwayPlan = keyof OriginOfPutAwayPlan$Enum;
    export interface PickingNoteSource$Enum {
        order: 1;
        loanOrder: 2;
        subcontractRequirement: 3;
    }
    export type PickingNoteSource = keyof PickingNoteSource$Enum;
    export interface PickingNoteStatus$Enum {
        inProcess: 1;
        deliverable: 2;
        delivered: 3;
        canceled: 4;
    }
    export type PickingNoteStatus = keyof PickingNoteStatus$Enum;
    export interface PreparationSource$Enum {
        order: 1;
        loanOrder: 2;
        subcontractRepl: 3;
        subcontractShortage: 4;
    }
    export type PreparationSource = keyof PreparationSource$Enum;
    export interface PutAwayPlanSituation$Enum {
        awaitingPutAway: 1;
        putAwayPlan: 2;
    }
    export type PutAwayPlanSituation = keyof PutAwayPlanSituation$Enum;
    export interface QtyPreCharged$Enum {
        allNotAllocatedAllocated: 1;
        notAllocated: 2;
        allocated: 3;
    }
    export type QtyPreCharged = keyof QtyPreCharged$Enum;
    export interface ReorderSituation$Enum {
        waitingReorder: 1;
        reorderPlan: 2;
    }
    export type ReorderSituation = keyof ReorderSituation$Enum;
    export interface StockChangeAccess$Enum {
        stockLine: 1;
        containerNumber: 2;
    }
    export type StockChangeAccess = keyof StockChangeAccess$Enum;
    export interface StockCountDetailStatus$Enum {
        toBeCounted: 1;
        counted: 2;
        abandoned: 3;
        validated: 4;
    }
    export type StockCountDetailStatus = keyof StockCountDetailStatus$Enum;
    export interface StockCountListChoice$Enum {
        manualSelection: 1;
        cycleStockCount: 2;
        annualStockCount: 3;
    }
    export type StockCountListChoice = keyof StockCountListChoice$Enum;
    export interface StockCountSessionStatus$Enum {
        inCreation: 1;
        toBeCounted: 2;
        closed: 3;
    }
    export type StockCountSessionStatus = keyof StockCountSessionStatus$Enum;
    export interface StockCountStatusList$Enum {
        toBeCounted: 1;
        cancelled: 2;
        counted: 3;
        partialValidation: 4;
        validated: 5;
        closed: 6;
    }
    export type StockCountStatusList = keyof StockCountStatusList$Enum;
    export interface StockCountType$Enum {
        product: 1;
        locations: 2;
    }
    export type StockCountType = keyof StockCountType$Enum;
    export interface StockIdentifierSelection$Enum {
        productLotSublot: 1;
        productLot: 2;
        lotSublot: 3;
        lot: 4;
        productSerialNumber: 5;
        serialNumber: 6;
        productLocation: 7;
        location: 8;
        productIdentifier1: 9;
        identifier1: 10;
        productLicensePlateNumber: 11;
        licensePlateNumber: 12;
    }
    export type StockIdentifierSelection = keyof StockIdentifierSelection$Enum;
    export interface StockTakeSequence$Enum {
        productLocation: 1;
        locationProduct: 2;
    }
    export type StockTakeSequence = keyof StockTakeSequence$Enum;
    export interface TypeOfStockTransaction$Enum {
        miscellaneousReceipt: 1;
        miscellaneousIssue: 2;
        stockChange: 3;
        lotModification: 4;
        putawayPlan: 5;
        counting: 6;
        assemblyDisassembly: 7;
        qualityControl: 8;
        reorderPlan: 9;
        shipmentPickingPlan: 10;
        packing: 11;
        pickTickets: 12;
    }
    export type TypeOfStockTransaction = keyof TypeOfStockTransaction$Enum;
    export interface Allocation extends ClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        stockSite: Site;
        product: Product;
        stockId: string;
        sequenceNumber: integer;
        allocationEndDate: string;
        allocationType: TypeOfAllocation;
        documentType: EntryTypeEnum;
        documentNumber: string;
        documentLineNumber: integer;
        documentSequenceNumber: integer;
        quantityInStockUnit: string;
        activeQuantityInStockUnit: string;
        warehouse: string;
        location: string;
        lot: string;
        sublot: string;
        status: string;
        serialNumber: string;
        consumptionLocation: string;
        defaultWarehouse: string;
        defaultLocation: string;
        defaultLocationType: string;
        storageQuantityInStockUnit: string;
        storageListNumber: string;
        storageListLineNumber: integer;
        pickingNumber: string;
        requirementDate: string;
        transactionDescription: string;
        businessPartner: BusinessPartner;
        deliveryAddress: ShipToCustomerAddress;
        typeOfSupply: MaterialReplenishType;
        majorVersion: MajorVersionStatus;
        stockLine: Stock;
        reorderLine: ClientCollection<StockReorder>;
    }
    export interface AllocationInput extends ClientNodeInput {
        stockSite?: string;
        product?: string;
        stockId?: decimal | string;
        sequenceNumber?: integer | string;
        allocationEndDate?: string;
        allocationType?: TypeOfAllocation;
        documentType?: EntryTypeEnum;
        documentNumber?: string;
        documentLineNumber?: integer | string;
        documentSequenceNumber?: integer | string;
        quantityInStockUnit?: decimal | string;
        activeQuantityInStockUnit?: decimal | string;
        warehouse?: string;
        location?: string;
        lot?: string;
        sublot?: string;
        status?: string;
        serialNumber?: string;
        consumptionLocation?: string;
        defaultWarehouse?: string;
        defaultLocation?: string;
        defaultLocationType?: string;
        storageQuantityInStockUnit?: decimal | string;
        storageListNumber?: string;
        storageListLineNumber?: integer | string;
        pickingNumber?: string;
        requirementDate?: string;
        transactionDescription?: string;
        businessPartner?: string;
        deliveryAddress?: string;
        typeOfSupply?: MaterialReplenishType;
        majorVersion?: string;
        stockLine?: decimal | string;
    }
    export interface AllocationBinding extends ClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        stockSite: Site;
        product: Product;
        stockId: string;
        sequenceNumber: integer;
        allocationEndDate: string;
        allocationType: TypeOfAllocation;
        documentType: EntryTypeEnum;
        documentNumber: string;
        documentLineNumber: integer;
        documentSequenceNumber: integer;
        quantityInStockUnit: string;
        activeQuantityInStockUnit: string;
        warehouse: string;
        location: string;
        lot: string;
        sublot: string;
        status: string;
        serialNumber: string;
        consumptionLocation: string;
        defaultWarehouse: string;
        defaultLocation: string;
        defaultLocationType: string;
        storageQuantityInStockUnit: string;
        storageListNumber: string;
        storageListLineNumber: integer;
        pickingNumber: string;
        requirementDate: string;
        transactionDescription: string;
        businessPartner: BusinessPartner;
        deliveryAddress: ShipToCustomerAddress;
        typeOfSupply: MaterialReplenishType;
        majorVersion: MajorVersionStatus;
        stockLine: Stock;
        reorderLine: ClientCollection<StockReorder>;
    }
    export interface Allocation$Lookups {
        stockSite: QueryOperation<Site>;
        product: QueryOperation<Product>;
        businessPartner: QueryOperation<BusinessPartner>;
        deliveryAddress: QueryOperation<ShipToCustomerAddress>;
        majorVersion: QueryOperation<MajorVersionStatus>;
        stockLine: QueryOperation<Stock>;
    }
    export interface Allocation$Operations {
        query: QueryOperation<Allocation>;
        read: ReadOperation<Allocation>;
        aggregate: {
            read: AggregateReadOperation<Allocation>;
            query: AggregateQueryOperation<Allocation>;
        };
        lookups(dataOrId: string | { data: AllocationInput }): Allocation$Lookups;
        getDefaults: GetDefaultsOperation<Allocation>;
    }
    export interface LpnOperationsLine extends ClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        stockChangeId: string;
        lineNumber: integer;
        product: Product;
        productDescription: string;
        owner: string;
        packingUnit: UnitOfMeasure;
        quantityInPackingUnit: string;
        packingUnitToStockUnitConversionFactor: string;
        status: StockStatus;
        locationType: string;
        location: Location;
        lot: string;
        sublot: string;
        serialNumber: string;
        endingSerialNumber: string;
        identifier1: string;
        identifier2: string;
        qualityAnalysisRequestId: string;
        packingUnitDestination: string;
        quantityInPackingUnitDestination: string;
        packingUnitToStockUnitConversionFactorDestination: string;
        quantityInStockUnitDestination: string;
        isQualityAnalysisRequested: boolean;
        warehouse: Warehouse;
        importLine: integer;
        stockCustomField1: string;
        stockCustomField2: string;
        licensePlateNumber: LicensePlateNumber;
        lpnOperations: LpnOperations;
        stockDetails: ClientCollection<StockJournal>;
    }
    export interface LpnOperationsLineInput extends ClientNodeInput {
        stockChangeId?: string;
        lineNumber?: integer | string;
        product?: string;
        productDescription?: string;
        owner?: string;
        packingUnit?: string;
        quantityInPackingUnit?: decimal | string;
        packingUnitToStockUnitConversionFactor?: decimal | string;
        status?: string;
        locationType?: string;
        location?: string;
        lot?: string;
        sublot?: string;
        serialNumber?: string;
        endingSerialNumber?: string;
        identifier1?: string;
        identifier2?: string;
        qualityAnalysisRequestId?: string;
        packingUnitDestination?: string;
        quantityInPackingUnitDestination?: decimal | string;
        packingUnitToStockUnitConversionFactorDestination?: decimal | string;
        quantityInStockUnitDestination?: decimal | string;
        isQualityAnalysisRequested?: boolean | string;
        warehouse?: string;
        importLine?: integer | string;
        stockCustomField1?: string;
        stockCustomField2?: string;
        licensePlateNumber?: string;
        lpnOperations?: string;
        stockDetails?: Partial<StockJournalInput>[];
        stockId?: string;
        stockSite?: string;
    }
    export interface LpnOperationsLineBinding extends ClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        stockChangeId: string;
        lineNumber: integer;
        product: Product;
        productDescription: string;
        owner: string;
        packingUnit: UnitOfMeasure;
        quantityInPackingUnit: string;
        packingUnitToStockUnitConversionFactor: string;
        status: StockStatus;
        locationType: string;
        location: Location;
        lot: string;
        sublot: string;
        serialNumber: string;
        endingSerialNumber: string;
        identifier1: string;
        identifier2: string;
        qualityAnalysisRequestId: string;
        packingUnitDestination: string;
        quantityInPackingUnitDestination: string;
        packingUnitToStockUnitConversionFactorDestination: string;
        quantityInStockUnitDestination: string;
        isQualityAnalysisRequested: boolean;
        warehouse: Warehouse;
        importLine: integer;
        stockCustomField1: string;
        stockCustomField2: string;
        licensePlateNumber: LicensePlateNumber;
        lpnOperations: LpnOperations;
        stockDetails: ClientCollection<StockJournal>;
        stockId: string;
        stockSite: string;
    }
    export interface LpnOperationsLine$Lookups {
        product: QueryOperation<Product>;
        packingUnit: QueryOperation<UnitOfMeasure>;
        status: QueryOperation<StockStatus>;
        location: QueryOperation<Location>;
        warehouse: QueryOperation<Warehouse>;
        licensePlateNumber: QueryOperation<LicensePlateNumber>;
        lpnOperations: QueryOperation<LpnOperations>;
    }
    export interface LpnOperationsLine$Operations {
        query: QueryOperation<LpnOperationsLine>;
        read: ReadOperation<LpnOperationsLine>;
        aggregate: {
            read: AggregateReadOperation<LpnOperationsLine>;
            query: AggregateQueryOperation<LpnOperationsLine>;
        };
        lookups(dataOrId: string | { data: LpnOperationsLineInput }): LpnOperationsLine$Lookups;
        getDefaults: GetDefaultsOperation<LpnOperationsLine>;
    }
    export interface LpnOperations extends ClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        id: string;
        stockChangeDestination: DestinationChoice;
        stockSite: Site;
        stockSiteDestination: Site;
        purchaseSite: Site;
        salesSite: Site;
        receiptStockSiteAddress: Address;
        subcontractor: BusinessPartner;
        subcontractorAddress: Address;
        subcontractLocation: Location;
        project: ProjectLink;
        customer: BusinessPartner;
        customerCurrency: Currency;
        isIntercompany: boolean;
        mustBeInvoiced: boolean;
        isInvoiced: boolean;
        salesInvoiceNumber: string;
        effectiveDate: string;
        documentDescription: string;
        stockMovementGroup: MiscellaneousTable;
        transactionType: StockTransactionType;
        stockMovementCode: MiscellaneousTable;
        stockAutomaticJournal: AutomaticJournal;
        importLine: integer;
        isSigned: boolean;
        transportDocumentType: string;
        temporaryDocumentId: string;
        manualDocument: string;
        atCode: string;
        departureDate: string;
        departureTime: string;
        arrivalDate: string;
        arrivalTime: string;
        registration: string;
        trailerRegistration: string;
        licensePlateNumberOperationMode: integer;
        stockChangeByLicencePlateNumberOrigin: integer;
        licensePlateNumberDestination: LicensePlateNumber;
        locationDestination: string;
        stockChangeLines: ClientCollection<LpnOperationsLine>;
    }
    export interface LpnOperationsInput extends ClientNodeInput {
        id?: string;
        stockChangeDestination?: DestinationChoice;
        stockSite?: string;
        stockSiteDestination?: string;
        purchaseSite?: string;
        salesSite?: string;
        receiptStockSiteAddress?: string;
        subcontractor?: string;
        subcontractorAddress?: string;
        subcontractLocation?: string;
        project?: string;
        customer?: string;
        customerCurrency?: string;
        isIntercompany?: boolean | string;
        mustBeInvoiced?: boolean | string;
        isInvoiced?: boolean | string;
        salesInvoiceNumber?: string;
        effectiveDate?: string;
        documentDescription?: string;
        stockMovementGroup?: string;
        transactionType?: StockTransactionType;
        stockMovementCode?: string;
        stockAutomaticJournal?: string;
        importLine?: integer | string;
        isSigned?: boolean | string;
        transportDocumentType?: string;
        temporaryDocumentId?: string;
        manualDocument?: string;
        atCode?: string;
        departureDate?: string;
        departureTime?: string;
        arrivalDate?: string;
        arrivalTime?: string;
        registration?: string;
        trailerRegistration?: string;
        licensePlateNumberOperationMode?: integer | string;
        stockChangeByLicencePlateNumberOrigin?: integer | string;
        licensePlateNumberDestination?: string;
        locationDestination?: string;
        stockChangeLines?: Partial<LpnOperationsLineInput>[];
    }
    export interface LpnOperationsBinding extends ClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        id: string;
        stockChangeDestination: DestinationChoice;
        stockSite: Site;
        stockSiteDestination: Site;
        purchaseSite: Site;
        salesSite: Site;
        receiptStockSiteAddress: Address;
        subcontractor: BusinessPartner;
        subcontractorAddress: Address;
        subcontractLocation: Location;
        project: ProjectLink;
        customer: BusinessPartner;
        customerCurrency: Currency;
        isIntercompany: boolean;
        mustBeInvoiced: boolean;
        isInvoiced: boolean;
        salesInvoiceNumber: string;
        effectiveDate: string;
        documentDescription: string;
        stockMovementGroup: MiscellaneousTable;
        transactionType: StockTransactionType;
        stockMovementCode: MiscellaneousTable;
        stockAutomaticJournal: AutomaticJournal;
        importLine: integer;
        isSigned: boolean;
        transportDocumentType: string;
        temporaryDocumentId: string;
        manualDocument: string;
        atCode: string;
        departureDate: string;
        departureTime: string;
        arrivalDate: string;
        arrivalTime: string;
        registration: string;
        trailerRegistration: string;
        licensePlateNumberOperationMode: integer;
        stockChangeByLicencePlateNumberOrigin: integer;
        licensePlateNumberDestination: LicensePlateNumber;
        locationDestination: string;
        stockChangeLines: ClientCollection<LpnOperationsLine>;
    }
    export interface LpnOperations$Mutations {
        lpnOperations: Node$Operation<
            {
                parameter?: LpnOperationsInput;
            },
            LpnOperations
        >;
    }
    export interface LpnOperations$Lookups {
        stockSite: QueryOperation<Site>;
        stockSiteDestination: QueryOperation<Site>;
        purchaseSite: QueryOperation<Site>;
        salesSite: QueryOperation<Site>;
        receiptStockSiteAddress: QueryOperation<Address>;
        subcontractor: QueryOperation<BusinessPartner>;
        subcontractorAddress: QueryOperation<Address>;
        subcontractLocation: QueryOperation<Location>;
        project: QueryOperation<ProjectLink>;
        customer: QueryOperation<BusinessPartner>;
        customerCurrency: QueryOperation<Currency>;
        stockMovementGroup: QueryOperation<MiscellaneousTable>;
        stockMovementCode: QueryOperation<MiscellaneousTable>;
        stockAutomaticJournal: QueryOperation<AutomaticJournal>;
        licensePlateNumberDestination: QueryOperation<LicensePlateNumber>;
    }
    export interface LpnOperations$Operations {
        query: QueryOperation<LpnOperations>;
        read: ReadOperation<LpnOperations>;
        aggregate: {
            read: AggregateReadOperation<LpnOperations>;
            query: AggregateQueryOperation<LpnOperations>;
        };
        mutations: LpnOperations$Mutations;
        lookups(dataOrId: string | { data: LpnOperationsInput }): LpnOperations$Lookups;
        getDefaults: GetDefaultsOperation<LpnOperations>;
    }
    export interface MiscellaneousIssueDimensions extends VitalClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        denormalizedIndex: integer;
        entryType: EntryTypeEnum;
        id: string;
        dimensionType: DimensionType;
        dimension: Dimension;
    }
    export interface MiscellaneousIssueDimensionsInput extends VitalClientNodeInput {
        denormalizedIndex?: integer | string;
        entryType?: EntryTypeEnum;
        id?: string;
        dimensionType?: string;
        dimension?: string;
    }
    export interface MiscellaneousIssueDimensionsBinding extends VitalClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        denormalizedIndex: integer;
        entryType: EntryTypeEnum;
        id: string;
        dimensionType: DimensionType;
        dimension: Dimension;
    }
    export interface MiscellaneousIssueDimensions$Lookups {
        dimensionType: QueryOperation<DimensionType>;
        dimension: QueryOperation<Dimension>;
    }
    export interface MiscellaneousIssueDimensions$Operations {
        query: QueryOperation<MiscellaneousIssueDimensions>;
        read: ReadOperation<MiscellaneousIssueDimensions>;
        aggregate: {
            read: AggregateReadOperation<MiscellaneousIssueDimensions>;
            query: AggregateQueryOperation<MiscellaneousIssueDimensions>;
        };
        lookups(dataOrId: string | { data: MiscellaneousIssueDimensionsInput }): MiscellaneousIssueDimensions$Lookups;
        getDefaults: GetDefaultsOperation<MiscellaneousIssueDimensions>;
    }
    export interface MiscellaneousIssueLine extends ClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        entryType: EntryTypeEnum;
        id: string;
        lineNumber: integer;
        product: Product;
        productDescription: string;
        packingUnit: UnitOfMeasure;
        quantityInPackingUnit: string;
        packingUnitToStockUnitConversionFactor: string;
        quantityInStockUnit: string;
        price: string;
        majorVersion: MajorVersionStatus;
        minorVersion: string;
        miscellaneousIssue: MiscellaneousIssue;
        stockDetails: ClientCollection<StockJournal>;
    }
    export interface MiscellaneousIssueLineInput extends ClientNodeInput {
        entryType?: EntryTypeEnum;
        id?: string;
        lineNumber?: integer | string;
        product?: string;
        productDescription?: string;
        packingUnit?: string;
        quantityInPackingUnit?: decimal | string;
        packingUnitToStockUnitConversionFactor?: decimal | string;
        quantityInStockUnit?: decimal | string;
        price?: decimal | string;
        majorVersion?: string;
        minorVersion?: string;
        miscellaneousIssue?: string;
        stockDetails?: Partial<StockJournalInput>[];
        container?: string;
    }
    export interface MiscellaneousIssueLineBinding extends ClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        entryType: EntryTypeEnum;
        id: string;
        lineNumber: integer;
        product: Product;
        productDescription: string;
        packingUnit: UnitOfMeasure;
        quantityInPackingUnit: string;
        packingUnitToStockUnitConversionFactor: string;
        quantityInStockUnit: string;
        price: string;
        majorVersion: MajorVersionStatus;
        minorVersion: string;
        miscellaneousIssue: MiscellaneousIssue;
        stockDetails: ClientCollection<StockJournal>;
        container: string;
    }
    export interface MiscellaneousIssueLine$Lookups {
        product: QueryOperation<Product>;
        packingUnit: QueryOperation<UnitOfMeasure>;
        majorVersion: QueryOperation<MajorVersionStatus>;
        miscellaneousIssue: QueryOperation<MiscellaneousIssue>;
    }
    export interface MiscellaneousIssueLine$Operations {
        query: QueryOperation<MiscellaneousIssueLine>;
        read: ReadOperation<MiscellaneousIssueLine>;
        aggregate: {
            read: AggregateReadOperation<MiscellaneousIssueLine>;
            query: AggregateQueryOperation<MiscellaneousIssueLine>;
        };
        lookups(dataOrId: string | { data: MiscellaneousIssueLineInput }): MiscellaneousIssueLine$Lookups;
        getDefaults: GetDefaultsOperation<MiscellaneousIssueLine>;
    }
    export interface MiscellaneousIssue extends ClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        entryType: EntryTypeEnum;
        id: string;
        stockSite: Site;
        effectiveDate: string;
        documentDescription: string;
        project: ProjectLink;
        stockMovementGroup: MiscellaneousTable;
        stockMovementCode: MiscellaneousTable;
        stockAutomaticJournal: AutomaticJournal;
        sourceDocumentType: EntryTypeEnum;
        sourceDocumentId: string;
        isDisassembly: boolean;
        warehouse: Warehouse;
        disassemblyValue: string;
        miscellaneousIssueLines: ClientCollection<MiscellaneousIssueLine>;
        dimensions: ClientCollection<MiscellaneousIssueDimensions>;
    }
    export interface MiscellaneousIssueInput extends ClientNodeInput {
        entryType?: EntryTypeEnum;
        id?: string;
        stockSite?: string;
        effectiveDate?: string;
        documentDescription?: string;
        project?: string;
        stockMovementGroup?: string;
        stockMovementCode?: string;
        stockAutomaticJournal?: string;
        sourceDocumentType?: EntryTypeEnum;
        sourceDocumentId?: string;
        isDisassembly?: boolean | string;
        warehouse?: string;
        disassemblyValue?: decimal | string;
        miscellaneousIssueLines?: Partial<MiscellaneousIssueLineInput>[];
        destination?: string;
        transaction?: string;
        dimensions?: Partial<MiscellaneousIssueDimensionsInput>[];
    }
    export interface MiscellaneousIssueBinding extends ClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        entryType: EntryTypeEnum;
        id: string;
        stockSite: Site;
        effectiveDate: string;
        documentDescription: string;
        project: ProjectLink;
        stockMovementGroup: MiscellaneousTable;
        stockMovementCode: MiscellaneousTable;
        stockAutomaticJournal: AutomaticJournal;
        sourceDocumentType: EntryTypeEnum;
        sourceDocumentId: string;
        isDisassembly: boolean;
        warehouse: Warehouse;
        disassemblyValue: string;
        miscellaneousIssueLines: ClientCollection<MiscellaneousIssueLine>;
        destination: string;
        transaction: string;
        dimensions: ClientCollection<MiscellaneousIssueDimensionsBinding>;
    }
    export interface MiscellaneousIssue$Lookups {
        stockSite: QueryOperation<Site>;
        project: QueryOperation<ProjectLink>;
        stockMovementGroup: QueryOperation<MiscellaneousTable>;
        stockMovementCode: QueryOperation<MiscellaneousTable>;
        stockAutomaticJournal: QueryOperation<AutomaticJournal>;
        warehouse: QueryOperation<Warehouse>;
    }
    export interface MiscellaneousIssue$Operations {
        query: QueryOperation<MiscellaneousIssue>;
        read: ReadOperation<MiscellaneousIssue>;
        aggregate: {
            read: AggregateReadOperation<MiscellaneousIssue>;
            query: AggregateQueryOperation<MiscellaneousIssue>;
        };
        create: CreateOperation<MiscellaneousIssueInput, MiscellaneousIssue>;
        getDuplicate: GetDuplicateOperation<MiscellaneousIssue>;
        lookups(dataOrId: string | { data: MiscellaneousIssueInput }): MiscellaneousIssue$Lookups;
        getDefaults: GetDefaultsOperation<MiscellaneousIssue>;
    }
    export interface MiscellaneousReceiptDimensions extends VitalClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        denormalizedIndex: integer;
        entryType: EntryTypeEnum;
        id: string;
        dimensionType: DimensionType;
        dimension: Dimension;
    }
    export interface MiscellaneousReceiptDimensionsInput extends VitalClientNodeInput {
        denormalizedIndex?: integer | string;
        entryType?: EntryTypeEnum;
        id?: string;
        dimensionType?: string;
        dimension?: string;
    }
    export interface MiscellaneousReceiptDimensionsBinding extends VitalClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        denormalizedIndex: integer;
        entryType: EntryTypeEnum;
        id: string;
        dimensionType: DimensionType;
        dimension: Dimension;
    }
    export interface MiscellaneousReceiptDimensions$Lookups {
        dimensionType: QueryOperation<DimensionType>;
        dimension: QueryOperation<Dimension>;
    }
    export interface MiscellaneousReceiptDimensions$Operations {
        query: QueryOperation<MiscellaneousReceiptDimensions>;
        read: ReadOperation<MiscellaneousReceiptDimensions>;
        aggregate: {
            read: AggregateReadOperation<MiscellaneousReceiptDimensions>;
            query: AggregateQueryOperation<MiscellaneousReceiptDimensions>;
        };
        lookups(
            dataOrId: string | { data: MiscellaneousReceiptDimensionsInput },
        ): MiscellaneousReceiptDimensions$Lookups;
        getDefaults: GetDefaultsOperation<MiscellaneousReceiptDimensions>;
    }
    export interface MiscellaneousReceiptLine extends ClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        entryType: EntryTypeEnum;
        id: string;
        lineNumber: integer;
        product: Product;
        productDescription: string;
        packingUnit: UnitOfMeasure;
        quantityInPackingUnit: string;
        packingUnitToStockUnitConversionFactor: string;
        quantityInStockUnit: string;
        price: string;
        majorVersion: MajorVersionStatus;
        minorVersion: string;
        miscellaneousReceipt: MiscellaneousReceipt;
        stockDetails: ClientCollection<StockJournal>;
    }
    export interface MiscellaneousReceiptLineInput extends ClientNodeInput {
        entryType?: EntryTypeEnum;
        id?: string;
        lineNumber?: integer | string;
        product?: string;
        productDescription?: string;
        packingUnit?: string;
        quantityInPackingUnit?: decimal | string;
        packingUnitToStockUnitConversionFactor?: decimal | string;
        quantityInStockUnit?: decimal | string;
        price?: decimal | string;
        majorVersion?: string;
        minorVersion?: string;
        miscellaneousReceipt?: string;
        stockDetails?: Partial<StockJournalInput>[];
        container?: string;
    }
    export interface MiscellaneousReceiptLineBinding extends ClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        entryType: EntryTypeEnum;
        id: string;
        lineNumber: integer;
        product: Product;
        productDescription: string;
        packingUnit: UnitOfMeasure;
        quantityInPackingUnit: string;
        packingUnitToStockUnitConversionFactor: string;
        quantityInStockUnit: string;
        price: string;
        majorVersion: MajorVersionStatus;
        minorVersion: string;
        miscellaneousReceipt: MiscellaneousReceipt;
        stockDetails: ClientCollection<StockJournal>;
        container: string;
    }
    export interface MiscellaneousReceiptLine$Lookups {
        product: QueryOperation<Product>;
        packingUnit: QueryOperation<UnitOfMeasure>;
        majorVersion: QueryOperation<MajorVersionStatus>;
        miscellaneousReceipt: QueryOperation<MiscellaneousReceipt>;
    }
    export interface MiscellaneousReceiptLine$Operations {
        query: QueryOperation<MiscellaneousReceiptLine>;
        read: ReadOperation<MiscellaneousReceiptLine>;
        aggregate: {
            read: AggregateReadOperation<MiscellaneousReceiptLine>;
            query: AggregateQueryOperation<MiscellaneousReceiptLine>;
        };
        lookups(dataOrId: string | { data: MiscellaneousReceiptLineInput }): MiscellaneousReceiptLine$Lookups;
        getDefaults: GetDefaultsOperation<MiscellaneousReceiptLine>;
    }
    export interface MiscellaneousReceipt extends ClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        entryType: EntryTypeEnum;
        id: string;
        stockSite: Site;
        effectiveDate: string;
        documentDescription: string;
        project: ProjectLink;
        stockMovementGroup: MiscellaneousTable;
        stockMovementCode: MiscellaneousTable;
        stockAutomaticJournal: AutomaticJournal;
        sourceDocumentType: EntryTypeEnum;
        sourceDocumentId: string;
        isDisassembly: boolean;
        warehouse: Warehouse;
        disassemblyValue: string;
        miscellaneousReceiptLines: ClientCollection<MiscellaneousReceiptLine>;
        dimensions: ClientCollection<MiscellaneousReceiptDimensions>;
    }
    export interface MiscellaneousReceiptInput extends ClientNodeInput {
        entryType?: EntryTypeEnum;
        id?: string;
        stockSite?: string;
        effectiveDate?: string;
        documentDescription?: string;
        project?: string;
        stockMovementGroup?: string;
        stockMovementCode?: string;
        stockAutomaticJournal?: string;
        sourceDocumentType?: EntryTypeEnum;
        sourceDocumentId?: string;
        isDisassembly?: boolean | string;
        warehouse?: string;
        disassemblyValue?: decimal | string;
        miscellaneousReceiptLines?: Partial<MiscellaneousReceiptLineInput>[];
        destination?: string;
        transaction?: string;
        dimensions?: Partial<MiscellaneousReceiptDimensionsInput>[];
    }
    export interface MiscellaneousReceiptBinding extends ClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        entryType: EntryTypeEnum;
        id: string;
        stockSite: Site;
        effectiveDate: string;
        documentDescription: string;
        project: ProjectLink;
        stockMovementGroup: MiscellaneousTable;
        stockMovementCode: MiscellaneousTable;
        stockAutomaticJournal: AutomaticJournal;
        sourceDocumentType: EntryTypeEnum;
        sourceDocumentId: string;
        isDisassembly: boolean;
        warehouse: Warehouse;
        disassemblyValue: string;
        miscellaneousReceiptLines: ClientCollection<MiscellaneousReceiptLine>;
        destination: string;
        transaction: string;
        dimensions: ClientCollection<MiscellaneousReceiptDimensionsBinding>;
    }
    export interface MiscellaneousReceipt$Lookups {
        stockSite: QueryOperation<Site>;
        project: QueryOperation<ProjectLink>;
        stockMovementGroup: QueryOperation<MiscellaneousTable>;
        stockMovementCode: QueryOperation<MiscellaneousTable>;
        stockAutomaticJournal: QueryOperation<AutomaticJournal>;
        warehouse: QueryOperation<Warehouse>;
    }
    export interface MiscellaneousReceipt$Operations {
        query: QueryOperation<MiscellaneousReceipt>;
        read: ReadOperation<MiscellaneousReceipt>;
        aggregate: {
            read: AggregateReadOperation<MiscellaneousReceipt>;
            query: AggregateQueryOperation<MiscellaneousReceipt>;
        };
        create: CreateOperation<MiscellaneousReceiptInput, MiscellaneousReceipt>;
        getDuplicate: GetDuplicateOperation<MiscellaneousReceipt>;
        lookups(dataOrId: string | { data: MiscellaneousReceiptInput }): MiscellaneousReceipt$Lookups;
        getDefaults: GetDefaultsOperation<MiscellaneousReceipt>;
    }
    export interface PickList extends ClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        preparationList: string;
        preparationListSequenceNumber: integer;
        pickTicket: PickTicket;
        pickTicketLine: PickTicketLine;
        sourcePickTicketType: PreparationSource;
        sourcePickTicket: string;
        sourcePickTicketLine: integer;
        sourcePickTicketSequenceNumber: integer;
        lineType: LineType;
        stockSite: Site;
        product: Product;
        subcontractReorderLocation: string;
        allocationSequence: integer;
        requirementDate: string;
        deliveryDate: string;
        quantityInStockUnit: string;
        stockUnit: UnitOfMeasure;
        packingUnit: UnitOfMeasure;
        packingUnitToStockUnitConversionFactor: string;
        soldToCustomer: BusinessPartner;
        deliveryAddress: ShipToCustomerAddress;
        carrier: Carrier;
        packagingCapacity: string;
        picker: User;
        isPacked: boolean;
    }
    export interface PickListInput extends ClientNodeInput {
        preparationList?: string;
        preparationListSequenceNumber?: integer | string;
        pickTicket?: string;
        pickTicketLine?: integer | string;
        sourcePickTicketType?: PreparationSource;
        sourcePickTicket?: string;
        sourcePickTicketLine?: integer | string;
        sourcePickTicketSequenceNumber?: integer | string;
        lineType?: LineType;
        stockSite?: string;
        product?: string;
        subcontractReorderLocation?: string;
        allocationSequence?: integer | string;
        requirementDate?: string;
        deliveryDate?: string;
        quantityInStockUnit?: decimal | string;
        stockUnit?: string;
        packingUnit?: string;
        packingUnitToStockUnitConversionFactor?: decimal | string;
        soldToCustomer?: string;
        deliveryAddress?: string;
        carrier?: string;
        packagingCapacity?: decimal | string;
        picker?: string;
        isPacked?: boolean | string;
    }
    export interface PickListBinding extends ClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        preparationList: string;
        preparationListSequenceNumber: integer;
        pickTicket: PickTicket;
        pickTicketLine: PickTicketLine;
        sourcePickTicketType: PreparationSource;
        sourcePickTicket: string;
        sourcePickTicketLine: integer;
        sourcePickTicketSequenceNumber: integer;
        lineType: LineType;
        stockSite: Site;
        product: Product;
        subcontractReorderLocation: string;
        allocationSequence: integer;
        requirementDate: string;
        deliveryDate: string;
        quantityInStockUnit: string;
        stockUnit: UnitOfMeasure;
        packingUnit: UnitOfMeasure;
        packingUnitToStockUnitConversionFactor: string;
        soldToCustomer: BusinessPartner;
        deliveryAddress: ShipToCustomerAddress;
        carrier: Carrier;
        packagingCapacity: string;
        picker: User;
        isPacked: boolean;
    }
    export interface PickList$Lookups {
        pickTicket: QueryOperation<PickTicket>;
        pickTicketLine: QueryOperation<PickTicketLine>;
        stockSite: QueryOperation<Site>;
        product: QueryOperation<Product>;
        stockUnit: QueryOperation<UnitOfMeasure>;
        packingUnit: QueryOperation<UnitOfMeasure>;
        soldToCustomer: QueryOperation<BusinessPartner>;
        deliveryAddress: QueryOperation<ShipToCustomerAddress>;
        carrier: QueryOperation<Carrier>;
        picker: QueryOperation<User>;
    }
    export interface PickList$Operations {
        query: QueryOperation<PickList>;
        read: ReadOperation<PickList>;
        aggregate: {
            read: AggregateReadOperation<PickList>;
            query: AggregateQueryOperation<PickList>;
        };
        lookups(dataOrId: string | { data: PickListInput }): PickList$Lookups;
        getDefaults: GetDefaultsOperation<PickList>;
    }
    export interface PickTicketLine extends ClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        pickTicket: string;
        pickTicketLine: integer;
        sourcePickTicketType: PreparationSource;
        sourcePickTicket: string;
        sourcePickTicketLine: integer;
        sourcePickTicketSequenceNumber: integer;
        sourcePickTicketSubcontractType: integer;
        product: Product;
        productDescription: string;
        subcontractReorderLocation: string;
        allocationSequence: integer;
        quantityInStockUnit: string;
        packedQuantityInStockUnit: string;
        stockUnit: UnitOfMeasure;
        allocatedQuantity: string;
        shortageQuantity: string;
        allocationType: TypeOfAllocation;
        quantityAllocatedOnSalesOrderInStockUnit: string;
        stockManagementMode: StockManagement;
        packingUnit: UnitOfMeasure;
        packingUnitToStockUnitConversionFactor: string;
        destinationLocation: string;
        destinationLocationType: string;
        packaging: Packaging;
        packagingCapacity: string;
        pickTicketLineText: string;
        adcPickedLine: integer;
        canceledLine: integer;
        isPacked: boolean;
        allocatedLines: ClientCollection<Allocation>;
    }
    export interface PickTicketLineInput extends ClientNodeInput {
        pickTicket?: string;
        pickTicketLine?: integer | string;
        sourcePickTicketType?: PreparationSource;
        sourcePickTicket?: string;
        sourcePickTicketLine?: integer | string;
        sourcePickTicketSequenceNumber?: integer | string;
        sourcePickTicketSubcontractType?: integer | string;
        product?: string;
        productDescription?: string;
        subcontractReorderLocation?: string;
        allocationSequence?: integer | string;
        quantityInStockUnit?: decimal | string;
        packedQuantityInStockUnit?: decimal | string;
        stockUnit?: string;
        allocatedQuantity?: decimal | string;
        shortageQuantity?: decimal | string;
        allocationType?: TypeOfAllocation;
        quantityAllocatedOnSalesOrderInStockUnit?: decimal | string;
        stockManagementMode?: StockManagement;
        packingUnit?: string;
        packingUnitToStockUnitConversionFactor?: decimal | string;
        destinationLocation?: string;
        destinationLocationType?: string;
        packaging?: string;
        packagingCapacity?: decimal | string;
        pickTicketLineText?: string;
        adcPickedLine?: integer | string;
        canceledLine?: integer | string;
        isPacked?: boolean | string;
        allocatedLines?: Partial<AllocationInput>[];
    }
    export interface PickTicketLineBinding extends ClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        pickTicket: string;
        pickTicketLine: integer;
        sourcePickTicketType: PreparationSource;
        sourcePickTicket: string;
        sourcePickTicketLine: integer;
        sourcePickTicketSequenceNumber: integer;
        sourcePickTicketSubcontractType: integer;
        product: Product;
        productDescription: string;
        subcontractReorderLocation: string;
        allocationSequence: integer;
        quantityInStockUnit: string;
        packedQuantityInStockUnit: string;
        stockUnit: UnitOfMeasure;
        allocatedQuantity: string;
        shortageQuantity: string;
        allocationType: TypeOfAllocation;
        quantityAllocatedOnSalesOrderInStockUnit: string;
        stockManagementMode: StockManagement;
        packingUnit: UnitOfMeasure;
        packingUnitToStockUnitConversionFactor: string;
        destinationLocation: string;
        destinationLocationType: string;
        packaging: Packaging;
        packagingCapacity: string;
        pickTicketLineText: string;
        adcPickedLine: integer;
        canceledLine: integer;
        isPacked: boolean;
        allocatedLines: ClientCollection<Allocation>;
    }
    export interface PickTicketLine$Mutations {
        updatePickTicketLine: Node$Operation<
            {
                parameters?: {
                    entryTransaction: string;
                    pickTicket: string;
                    pickTicketLine: integer | string;
                    destinationLocation: string;
                    product: string;
                    shortPick: boolean | string;
                    deliverable: boolean | string;
                    documentDestination: string;
                    packingUnit: string[];
                    packingUnitToStockUnitConversionFactor: (decimal | string)[];
                    quantityInPackingUnit: (decimal | string)[];
                    quantityInStockUnit: (decimal | string)[];
                    location: string[];
                    lot: string[];
                    sublot: string[];
                    serialNumber: string[];
                    status: string[];
                    stockId: (integer | string)[];
                    customBoolean: boolean | string;
                    customDecimal: decimal | string;
                    customString: string;
                    customDate: string;
                };
            },
            {
                pickTicket: string;
                pickTicketLine: integer;
            }
        >;
    }
    export interface PickTicketLine$Lookups {
        product: QueryOperation<Product>;
        stockUnit: QueryOperation<UnitOfMeasure>;
        packingUnit: QueryOperation<UnitOfMeasure>;
        packaging: QueryOperation<Packaging>;
    }
    export interface PickTicketLine$Operations {
        query: QueryOperation<PickTicketLine>;
        read: ReadOperation<PickTicketLine>;
        aggregate: {
            read: AggregateReadOperation<PickTicketLine>;
            query: AggregateQueryOperation<PickTicketLine>;
        };
        mutations: PickTicketLine$Mutations;
        lookups(dataOrId: string | { data: PickTicketLineInput }): PickTicketLine$Lookups;
        getDefaults: GetDefaultsOperation<PickTicketLine>;
    }
    export interface PickTicket extends ClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        id: string;
        stockSite: Site;
        company: Company;
        sourcePickTicket: PickingNoteSource;
        pickListNumber: string;
        salesDelivery: string;
        deliveryType: SalesDeliveryType;
        soldToCustomer: BusinessPartner;
        shipToCustomerAddress: ShipToCustomerAddress;
        shipmentDate: string;
        deliveryDate: string;
        carrier: Carrier;
        routeNumber: RouteCode;
        preparationCode: string;
        pickTicketStatus: PickingNoteStatus;
        isPacked: boolean;
        numberOfPackages: integer;
        isPickTicketPrinted: boolean;
        stockMovementCode: MiscellaneousTable;
        weightUnit: UnitOfMeasure;
        grossWeight: string;
        netWeight: string;
        pickTicketHeaderText: string;
        pickTicketFooterText: string;
        picker: User;
        pickTicketLines: ClientCollection<PickTicketLine>;
    }
    export interface PickTicketInput extends ClientNodeInput {
        id?: string;
        stockSite?: string;
        company?: string;
        sourcePickTicket?: PickingNoteSource;
        pickListNumber?: string;
        salesDelivery?: string;
        deliveryType?: string;
        soldToCustomer?: string;
        shipToCustomerAddress?: string;
        shipmentDate?: string;
        deliveryDate?: string;
        carrier?: string;
        routeNumber?: RouteCode;
        preparationCode?: string;
        pickTicketStatus?: PickingNoteStatus;
        isPacked?: boolean | string;
        numberOfPackages?: integer | string;
        isPickTicketPrinted?: boolean | string;
        stockMovementCode?: string;
        weightUnit?: string;
        grossWeight?: decimal | string;
        netWeight?: decimal | string;
        pickTicketHeaderText?: string;
        pickTicketFooterText?: string;
        picker?: string;
        pickTicketLines?: Partial<PickTicketLineInput>[];
    }
    export interface PickTicketBinding extends ClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        id: string;
        stockSite: Site;
        company: Company;
        sourcePickTicket: PickingNoteSource;
        pickListNumber: string;
        salesDelivery: string;
        deliveryType: SalesDeliveryType;
        soldToCustomer: BusinessPartner;
        shipToCustomerAddress: ShipToCustomerAddress;
        shipmentDate: string;
        deliveryDate: string;
        carrier: Carrier;
        routeNumber: RouteCode;
        preparationCode: string;
        pickTicketStatus: PickingNoteStatus;
        isPacked: boolean;
        numberOfPackages: integer;
        isPickTicketPrinted: boolean;
        stockMovementCode: MiscellaneousTable;
        weightUnit: UnitOfMeasure;
        grossWeight: string;
        netWeight: string;
        pickTicketHeaderText: string;
        pickTicketFooterText: string;
        picker: User;
        pickTicketLines: ClientCollection<PickTicketLine>;
    }
    export interface PickTicket$Lookups {
        stockSite: QueryOperation<Site>;
        company: QueryOperation<Company>;
        deliveryType: QueryOperation<SalesDeliveryType>;
        soldToCustomer: QueryOperation<BusinessPartner>;
        shipToCustomerAddress: QueryOperation<ShipToCustomerAddress>;
        carrier: QueryOperation<Carrier>;
        stockMovementCode: QueryOperation<MiscellaneousTable>;
        weightUnit: QueryOperation<UnitOfMeasure>;
        picker: QueryOperation<User>;
    }
    export interface PickTicket$Operations {
        query: QueryOperation<PickTicket>;
        read: ReadOperation<PickTicket>;
        aggregate: {
            read: AggregateReadOperation<PickTicket>;
            query: AggregateQueryOperation<PickTicket>;
        };
        lookups(dataOrId: string | { data: PickTicketInput }): PickTicket$Lookups;
        getDefaults: GetDefaultsOperation<PickTicket>;
    }
    export interface StockChangeByLpn extends ClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        id: string;
        stockChangeDestination: DestinationChoice;
        stockSite: Site;
        stockSiteDestination: Site;
        purchaseSite: Site;
        salesSite: Site;
        receiptStockSiteAddress: Address;
        subcontractor: BusinessPartner;
        subcontractorAddress: Address;
        subcontractLocation: Location;
        project: ProjectLink;
        customer: BusinessPartner;
        customerCurrency: Currency;
        isIntercompany: boolean;
        mustBeInvoiced: boolean;
        isInvoiced: boolean;
        salesInvoiceNumber: string;
        effectiveDate: string;
        documentDescription: string;
        stockMovementGroup: MiscellaneousTable;
        transactionType: StockTransactionType;
        stockMovementCode: MiscellaneousTable;
        stockAutomaticJournal: AutomaticJournal;
        importLine: integer;
        isSigned: boolean;
        transportDocumentType: string;
        temporaryDocumentId: string;
        manualDocument: string;
        atCode: string;
        departureDate: string;
        departureTime: string;
        arrivalDate: string;
        arrivalTime: string;
        registration: string;
        trailerRegistration: string;
        licensePlateNumberOperationMode: integer;
        stockChangeByLicencePlateNumberOrigin: integer;
        licensePlateNumberDestination: LicensePlateNumber;
        locationDestination: string;
        stockChangeLines: ClientCollection<StockChangeLineByLpn>;
    }
    export interface StockChangeByLpnInput extends ClientNodeInput {
        id?: string;
        stockChangeDestination?: DestinationChoice;
        stockSite?: string;
        stockSiteDestination?: string;
        purchaseSite?: string;
        salesSite?: string;
        receiptStockSiteAddress?: string;
        subcontractor?: string;
        subcontractorAddress?: string;
        subcontractLocation?: string;
        project?: string;
        customer?: string;
        customerCurrency?: string;
        isIntercompany?: boolean | string;
        mustBeInvoiced?: boolean | string;
        isInvoiced?: boolean | string;
        salesInvoiceNumber?: string;
        effectiveDate?: string;
        documentDescription?: string;
        stockMovementGroup?: string;
        transactionType?: StockTransactionType;
        stockMovementCode?: string;
        stockAutomaticJournal?: string;
        importLine?: integer | string;
        isSigned?: boolean | string;
        transportDocumentType?: string;
        temporaryDocumentId?: string;
        manualDocument?: string;
        atCode?: string;
        departureDate?: string;
        departureTime?: string;
        arrivalDate?: string;
        arrivalTime?: string;
        registration?: string;
        trailerRegistration?: string;
        licensePlateNumberOperationMode?: integer | string;
        stockChangeByLicencePlateNumberOrigin?: integer | string;
        licensePlateNumberDestination?: string;
        locationDestination?: string;
        stockChangeLines?: Partial<StockChangeLineByLpnInput>[];
        destination?: string;
        transaction?: string;
    }
    export interface StockChangeByLpnBinding extends ClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        id: string;
        stockChangeDestination: DestinationChoice;
        stockSite: Site;
        stockSiteDestination: Site;
        purchaseSite: Site;
        salesSite: Site;
        receiptStockSiteAddress: Address;
        subcontractor: BusinessPartner;
        subcontractorAddress: Address;
        subcontractLocation: Location;
        project: ProjectLink;
        customer: BusinessPartner;
        customerCurrency: Currency;
        isIntercompany: boolean;
        mustBeInvoiced: boolean;
        isInvoiced: boolean;
        salesInvoiceNumber: string;
        effectiveDate: string;
        documentDescription: string;
        stockMovementGroup: MiscellaneousTable;
        transactionType: StockTransactionType;
        stockMovementCode: MiscellaneousTable;
        stockAutomaticJournal: AutomaticJournal;
        importLine: integer;
        isSigned: boolean;
        transportDocumentType: string;
        temporaryDocumentId: string;
        manualDocument: string;
        atCode: string;
        departureDate: string;
        departureTime: string;
        arrivalDate: string;
        arrivalTime: string;
        registration: string;
        trailerRegistration: string;
        licensePlateNumberOperationMode: integer;
        stockChangeByLicencePlateNumberOrigin: integer;
        licensePlateNumberDestination: LicensePlateNumber;
        locationDestination: string;
        stockChangeLines: ClientCollection<StockChangeLineByLpn>;
        destination: string;
        transaction: string;
    }
    export interface StockChangeByLpn$Mutations {
        lpnGrouping: Node$Operation<
            {
                parameter?: StockChangeByLpnInput;
            },
            StockChangeByLpn
        >;
        stockChangeByLpn: Node$Operation<
            {
                parameter?: StockChangeByLpnInput;
            },
            StockChangeByLpn
        >;
    }
    export interface StockChangeByLpn$Lookups {
        stockSite: QueryOperation<Site>;
        stockSiteDestination: QueryOperation<Site>;
        purchaseSite: QueryOperation<Site>;
        salesSite: QueryOperation<Site>;
        receiptStockSiteAddress: QueryOperation<Address>;
        subcontractor: QueryOperation<BusinessPartner>;
        subcontractorAddress: QueryOperation<Address>;
        subcontractLocation: QueryOperation<Location>;
        project: QueryOperation<ProjectLink>;
        customer: QueryOperation<BusinessPartner>;
        customerCurrency: QueryOperation<Currency>;
        stockMovementGroup: QueryOperation<MiscellaneousTable>;
        stockMovementCode: QueryOperation<MiscellaneousTable>;
        stockAutomaticJournal: QueryOperation<AutomaticJournal>;
        licensePlateNumberDestination: QueryOperation<LicensePlateNumber>;
    }
    export interface StockChangeByLpn$Operations {
        query: QueryOperation<StockChangeByLpn>;
        read: ReadOperation<StockChangeByLpn>;
        aggregate: {
            read: AggregateReadOperation<StockChangeByLpn>;
            query: AggregateQueryOperation<StockChangeByLpn>;
        };
        mutations: StockChangeByLpn$Mutations;
        lookups(dataOrId: string | { data: StockChangeByLpnInput }): StockChangeByLpn$Lookups;
        getDefaults: GetDefaultsOperation<StockChangeByLpn>;
    }
    export interface StockChangeLineByLpn extends ClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        stockChangeId: string;
        lineNumber: integer;
        product: Product;
        productDescription: string;
        owner: string;
        packingUnit: UnitOfMeasure;
        quantityInPackingUnit: string;
        packingUnitToStockUnitConversionFactor: string;
        status: StockStatus;
        locationType: string;
        location: Location;
        lot: string;
        sublot: string;
        serialNumber: string;
        endingSerialNumber: string;
        identifier1: string;
        identifier2: string;
        qualityAnalysisRequestId: string;
        packingUnitDestination: string;
        quantityInPackingUnitDestination: string;
        packingUnitToStockUnitConversionFactorDestination: string;
        quantityInStockUnitDestination: string;
        isQualityAnalysisRequested: boolean;
        warehouse: Warehouse;
        importLine: integer;
        stockCustomField1: string;
        stockCustomField2: string;
        licensePlateNumber: LicensePlateNumber;
        stockChangeByLpn: StockChangeByLpn;
        stockDetails: ClientCollection<StockJournal>;
    }
    export interface StockChangeLineByLpnInput extends ClientNodeInput {
        stockChangeId?: string;
        lineNumber?: integer | string;
        product?: string;
        productDescription?: string;
        owner?: string;
        packingUnit?: string;
        quantityInPackingUnit?: decimal | string;
        packingUnitToStockUnitConversionFactor?: decimal | string;
        status?: string;
        locationType?: string;
        location?: string;
        lot?: string;
        sublot?: string;
        serialNumber?: string;
        endingSerialNumber?: string;
        identifier1?: string;
        identifier2?: string;
        qualityAnalysisRequestId?: string;
        packingUnitDestination?: string;
        quantityInPackingUnitDestination?: decimal | string;
        packingUnitToStockUnitConversionFactorDestination?: decimal | string;
        quantityInStockUnitDestination?: decimal | string;
        isQualityAnalysisRequested?: boolean | string;
        warehouse?: string;
        importLine?: integer | string;
        stockCustomField1?: string;
        stockCustomField2?: string;
        licensePlateNumber?: string;
        stockChangeByLpn?: string;
        stockDetails?: Partial<StockJournalInput>[];
        stockId?: string;
        stockSite?: string;
    }
    export interface StockChangeLineByLpnBinding extends ClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        stockChangeId: string;
        lineNumber: integer;
        product: Product;
        productDescription: string;
        owner: string;
        packingUnit: UnitOfMeasure;
        quantityInPackingUnit: string;
        packingUnitToStockUnitConversionFactor: string;
        status: StockStatus;
        locationType: string;
        location: Location;
        lot: string;
        sublot: string;
        serialNumber: string;
        endingSerialNumber: string;
        identifier1: string;
        identifier2: string;
        qualityAnalysisRequestId: string;
        packingUnitDestination: string;
        quantityInPackingUnitDestination: string;
        packingUnitToStockUnitConversionFactorDestination: string;
        quantityInStockUnitDestination: string;
        isQualityAnalysisRequested: boolean;
        warehouse: Warehouse;
        importLine: integer;
        stockCustomField1: string;
        stockCustomField2: string;
        licensePlateNumber: LicensePlateNumber;
        stockChangeByLpn: StockChangeByLpn;
        stockDetails: ClientCollection<StockJournal>;
        stockId: string;
        stockSite: string;
    }
    export interface StockChangeLineByLpn$Lookups {
        product: QueryOperation<Product>;
        packingUnit: QueryOperation<UnitOfMeasure>;
        status: QueryOperation<StockStatus>;
        location: QueryOperation<Location>;
        warehouse: QueryOperation<Warehouse>;
        licensePlateNumber: QueryOperation<LicensePlateNumber>;
        stockChangeByLpn: QueryOperation<StockChangeByLpn>;
    }
    export interface StockChangeLineByLpn$Operations {
        query: QueryOperation<StockChangeLineByLpn>;
        read: ReadOperation<StockChangeLineByLpn>;
        aggregate: {
            read: AggregateReadOperation<StockChangeLineByLpn>;
            query: AggregateQueryOperation<StockChangeLineByLpn>;
        };
        lookups(dataOrId: string | { data: StockChangeLineByLpnInput }): StockChangeLineByLpn$Lookups;
        getDefaults: GetDefaultsOperation<StockChangeLineByLpn>;
    }
    export interface StockChangeLine extends ClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        stockChangeId: string;
        lineNumber: integer;
        product: Product;
        productDescription: string;
        owner: string;
        packingUnit: UnitOfMeasure;
        quantityInPackingUnit: string;
        packingUnitToStockUnitConversionFactor: string;
        status: StockStatus;
        locationType: string;
        location: Location;
        lot: string;
        sublot: string;
        serialNumber: string;
        endingSerialNumber: string;
        identifier1: string;
        identifier2: string;
        qualityAnalysisRequestId: string;
        packingUnitDestination: string;
        quantityInPackingUnitDestination: string;
        packingUnitToStockUnitConversionFactorDestination: string;
        quantityInStockUnitDestination: string;
        isQualityAnalysisRequested: boolean;
        warehouse: Warehouse;
        importLine: integer;
        stockCustomField1: string;
        stockCustomField2: string;
        licensePlateNumber: LicensePlateNumber;
        stockChange: StockChange;
        stockDetails: ClientCollection<StockJournal>;
    }
    export interface StockChangeLineInput extends ClientNodeInput {
        stockChangeId?: string;
        lineNumber?: integer | string;
        product?: string;
        productDescription?: string;
        owner?: string;
        packingUnit?: string;
        quantityInPackingUnit?: decimal | string;
        packingUnitToStockUnitConversionFactor?: decimal | string;
        status?: string;
        locationType?: string;
        location?: string;
        lot?: string;
        sublot?: string;
        serialNumber?: string;
        endingSerialNumber?: string;
        identifier1?: string;
        identifier2?: string;
        qualityAnalysisRequestId?: string;
        packingUnitDestination?: string;
        quantityInPackingUnitDestination?: decimal | string;
        packingUnitToStockUnitConversionFactorDestination?: decimal | string;
        quantityInStockUnitDestination?: decimal | string;
        isQualityAnalysisRequested?: boolean | string;
        warehouse?: string;
        importLine?: integer | string;
        stockCustomField1?: string;
        stockCustomField2?: string;
        licensePlateNumber?: string;
        stockChange?: string;
        stockDetails?: Partial<StockJournalInput>[];
        identifier1Destination?: string;
        identifier2Destination?: string;
        licensePlateNumberDestination?: string;
        locationDestination?: string;
        movementDescription?: string;
        statusDestination?: string;
        stockId?: decimal | string;
        stockSite?: string;
    }
    export interface StockChangeLineBinding extends ClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        stockChangeId: string;
        lineNumber: integer;
        product: Product;
        productDescription: string;
        owner: string;
        packingUnit: UnitOfMeasure;
        quantityInPackingUnit: string;
        packingUnitToStockUnitConversionFactor: string;
        status: StockStatus;
        locationType: string;
        location: Location;
        lot: string;
        sublot: string;
        serialNumber: string;
        endingSerialNumber: string;
        identifier1: string;
        identifier2: string;
        qualityAnalysisRequestId: string;
        packingUnitDestination: string;
        quantityInPackingUnitDestination: string;
        packingUnitToStockUnitConversionFactorDestination: string;
        quantityInStockUnitDestination: string;
        isQualityAnalysisRequested: boolean;
        warehouse: Warehouse;
        importLine: integer;
        stockCustomField1: string;
        stockCustomField2: string;
        licensePlateNumber: LicensePlateNumber;
        stockChange: StockChange;
        stockDetails: ClientCollection<StockJournal>;
        identifier1Destination: string;
        identifier2Destination: string;
        licensePlateNumberDestination: string;
        locationDestination: string;
        movementDescription: string;
        statusDestination: string;
        stockId: string;
        stockSite: string;
    }
    export interface StockChangeLine$Lookups {
        product: QueryOperation<Product>;
        packingUnit: QueryOperation<UnitOfMeasure>;
        status: QueryOperation<StockStatus>;
        location: QueryOperation<Location>;
        warehouse: QueryOperation<Warehouse>;
        licensePlateNumber: QueryOperation<LicensePlateNumber>;
        stockChange: QueryOperation<StockChange>;
    }
    export interface StockChangeLine$Operations {
        query: QueryOperation<StockChangeLine>;
        read: ReadOperation<StockChangeLine>;
        aggregate: {
            read: AggregateReadOperation<StockChangeLine>;
            query: AggregateQueryOperation<StockChangeLine>;
        };
        lookups(dataOrId: string | { data: StockChangeLineInput }): StockChangeLine$Lookups;
        getDefaults: GetDefaultsOperation<StockChangeLine>;
    }
    export interface StockChange extends ClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        id: string;
        stockChangeDestination: DestinationChoice;
        stockSite: Site;
        stockSiteDestination: Site;
        purchaseSite: Site;
        salesSite: Site;
        receiptStockSiteAddress: Address;
        subcontractor: BusinessPartner;
        subcontractorAddress: Address;
        subcontractLocation: Location;
        project: ProjectLink;
        customer: BusinessPartner;
        customerCurrency: Currency;
        isIntercompany: boolean;
        mustBeInvoiced: boolean;
        isInvoiced: boolean;
        salesInvoiceNumber: string;
        effectiveDate: string;
        documentDescription: string;
        stockMovementGroup: MiscellaneousTable;
        transactionType: StockTransactionType;
        stockMovementCode: MiscellaneousTable;
        stockAutomaticJournal: AutomaticJournal;
        importLine: integer;
        isSigned: boolean;
        transportDocumentType: string;
        temporaryDocumentId: string;
        manualDocument: string;
        atCode: string;
        departureDate: string;
        departureTime: string;
        arrivalDate: string;
        arrivalTime: string;
        registration: string;
        trailerRegistration: string;
        licensePlateNumberOperationMode: integer;
        stockChangeByLicencePlateNumberOrigin: integer;
        licensePlateNumberDestination: LicensePlateNumber;
        locationDestination: string;
        stockChangeLines: ClientCollection<StockChangeLine>;
    }
    export interface StockChangeInput extends ClientNodeInput {
        id?: string;
        stockChangeDestination?: DestinationChoice;
        stockSite?: string;
        stockSiteDestination?: string;
        purchaseSite?: string;
        salesSite?: string;
        receiptStockSiteAddress?: string;
        subcontractor?: string;
        subcontractorAddress?: string;
        subcontractLocation?: string;
        project?: string;
        customer?: string;
        customerCurrency?: string;
        isIntercompany?: boolean | string;
        mustBeInvoiced?: boolean | string;
        isInvoiced?: boolean | string;
        salesInvoiceNumber?: string;
        effectiveDate?: string;
        documentDescription?: string;
        stockMovementGroup?: string;
        transactionType?: StockTransactionType;
        stockMovementCode?: string;
        stockAutomaticJournal?: string;
        importLine?: integer | string;
        isSigned?: boolean | string;
        transportDocumentType?: string;
        temporaryDocumentId?: string;
        manualDocument?: string;
        atCode?: string;
        departureDate?: string;
        departureTime?: string;
        arrivalDate?: string;
        arrivalTime?: string;
        registration?: string;
        trailerRegistration?: string;
        licensePlateNumberOperationMode?: integer | string;
        stockChangeByLicencePlateNumberOrigin?: integer | string;
        licensePlateNumberDestination?: string;
        locationDestination?: string;
        stockChangeLines?: Partial<StockChangeLineInput>[];
        destination?: string;
        printingMode?: string;
        transaction?: string;
    }
    export interface StockChangeBinding extends ClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        id: string;
        stockChangeDestination: DestinationChoice;
        stockSite: Site;
        stockSiteDestination: Site;
        purchaseSite: Site;
        salesSite: Site;
        receiptStockSiteAddress: Address;
        subcontractor: BusinessPartner;
        subcontractorAddress: Address;
        subcontractLocation: Location;
        project: ProjectLink;
        customer: BusinessPartner;
        customerCurrency: Currency;
        isIntercompany: boolean;
        mustBeInvoiced: boolean;
        isInvoiced: boolean;
        salesInvoiceNumber: string;
        effectiveDate: string;
        documentDescription: string;
        stockMovementGroup: MiscellaneousTable;
        transactionType: StockTransactionType;
        stockMovementCode: MiscellaneousTable;
        stockAutomaticJournal: AutomaticJournal;
        importLine: integer;
        isSigned: boolean;
        transportDocumentType: string;
        temporaryDocumentId: string;
        manualDocument: string;
        atCode: string;
        departureDate: string;
        departureTime: string;
        arrivalDate: string;
        arrivalTime: string;
        registration: string;
        trailerRegistration: string;
        licensePlateNumberOperationMode: integer;
        stockChangeByLicencePlateNumberOrigin: integer;
        licensePlateNumberDestination: LicensePlateNumber;
        locationDestination: string;
        stockChangeLines: ClientCollection<StockChangeLine>;
        destination: string;
        printingMode: string;
        transaction: string;
    }
    export interface StockChange$Mutations {
        intersiteTransfer: Node$Operation<
            {
                parameter?: StockChangeInput;
            },
            StockChange
        >;
        stockChange: Node$Operation<
            {
                parameter?: StockChangeInput;
            },
            StockChange
        >;
        subcontractTransfer: Node$Operation<
            {
                parameter?: StockChangeInput;
            },
            StockChange
        >;
    }
    export interface StockChange$Lookups {
        stockSite: QueryOperation<Site>;
        stockSiteDestination: QueryOperation<Site>;
        purchaseSite: QueryOperation<Site>;
        salesSite: QueryOperation<Site>;
        receiptStockSiteAddress: QueryOperation<Address>;
        subcontractor: QueryOperation<BusinessPartner>;
        subcontractorAddress: QueryOperation<Address>;
        subcontractLocation: QueryOperation<Location>;
        project: QueryOperation<ProjectLink>;
        customer: QueryOperation<BusinessPartner>;
        customerCurrency: QueryOperation<Currency>;
        stockMovementGroup: QueryOperation<MiscellaneousTable>;
        stockMovementCode: QueryOperation<MiscellaneousTable>;
        stockAutomaticJournal: QueryOperation<AutomaticJournal>;
        licensePlateNumberDestination: QueryOperation<LicensePlateNumber>;
    }
    export interface StockChange$Operations {
        query: QueryOperation<StockChange>;
        read: ReadOperation<StockChange>;
        aggregate: {
            read: AggregateReadOperation<StockChange>;
            query: AggregateQueryOperation<StockChange>;
        };
        mutations: StockChange$Mutations;
        lookups(dataOrId: string | { data: StockChangeInput }): StockChange$Lookups;
        getDefaults: GetDefaultsOperation<StockChange>;
    }
    export interface StockCountListDetail extends ClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        stockCountSessionNumber: string;
        stockCountList: StockCountList;
        productRankNumber: integer;
        stockSite: Site;
        owner: string;
        product: Product;
        lot: string;
        sublot: string;
        location: Location;
        status: string;
        abcClass: ProductAbcClass;
        stockCountDate: string;
        packingUnit: UnitOfMeasure;
        countedStockInPackingUnit: string;
        countedStockInStockUnit: string;
        isZeroStock: boolean;
        quantityInPackingUnit: string;
        packingUnitToStockUnitConversionFactor: string;
        quantityInStockUnit: string;
        isOriginOfLineNote: EnteredStockLineStatus;
        stockId: string;
        stockCountCostCode: CostSource;
        stockCountUnitCost: string;
        stockCountNetCost: string;
        allocationDate: string;
        serialNumber: string;
        isStockCountLocked: BlockedStock;
        stockCountListStatus: StockCountDetailStatus;
        identifier1: string;
        identifier2: string;
        qualityAnalysisRequestId: string;
        orderPrice: string;
        potency: string;
        expirationReferenceDate: string;
        expirationDate: string;
        useByDate: string;
        recontrolDate: string;
        warehouse: Warehouse;
        majorVersion: MajorVersionStatus;
        minorVersion: string;
        stockUserArea1: string;
        stockUserArea2: string;
        countedStockInPackingUnit1: string;
        countedStockInStockUnit1: string;
        isZeroStock1: boolean;
        countedStockInPackingUnit2: string;
        countedStockInStockUnit2: string;
        isZeroStock2: boolean;
        serialNumberSequenceNumber: integer;
        licensePlateNumber: LicensePlateNumber;
        serialNumberLines: ClientCollection<StockCountSerialNumber>;
        stockCountSession: StockCountSession;
        stockLine: Stock;
    }
    export interface StockCountListDetailInput extends ClientNodeInput {
        stockCountSessionNumber?: string;
        stockCountList?: string;
        productRankNumber?: integer | string;
        stockSite?: string;
        owner?: string;
        product?: string;
        lot?: string;
        sublot?: string;
        location?: string;
        status?: string;
        abcClass?: ProductAbcClass;
        stockCountDate?: string;
        packingUnit?: string;
        countedStockInPackingUnit?: decimal | string;
        countedStockInStockUnit?: decimal | string;
        isZeroStock?: boolean | string;
        quantityInPackingUnit?: decimal | string;
        packingUnitToStockUnitConversionFactor?: decimal | string;
        quantityInStockUnit?: decimal | string;
        isOriginOfLineNote?: EnteredStockLineStatus;
        stockId?: decimal | string;
        stockCountCostCode?: CostSource;
        stockCountUnitCost?: decimal | string;
        stockCountNetCost?: decimal | string;
        allocationDate?: string;
        serialNumber?: string;
        isStockCountLocked?: BlockedStock;
        stockCountListStatus?: StockCountDetailStatus;
        identifier1?: string;
        identifier2?: string;
        qualityAnalysisRequestId?: string;
        orderPrice?: decimal | string;
        potency?: decimal | string;
        expirationReferenceDate?: string;
        expirationDate?: string;
        useByDate?: string;
        recontrolDate?: string;
        warehouse?: string;
        majorVersion?: string;
        minorVersion?: string;
        stockUserArea1?: string;
        stockUserArea2?: string;
        countedStockInPackingUnit1?: decimal | string;
        countedStockInStockUnit1?: decimal | string;
        isZeroStock1?: boolean | string;
        countedStockInPackingUnit2?: decimal | string;
        countedStockInStockUnit2?: decimal | string;
        isZeroStock2?: boolean | string;
        serialNumberSequenceNumber?: integer | string;
        licensePlateNumber?: string;
        stockCountSession?: string;
        stockLine?: decimal | string;
    }
    export interface StockCountListDetailBinding extends ClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        stockCountSessionNumber: string;
        stockCountList: StockCountList;
        productRankNumber: integer;
        stockSite: Site;
        owner: string;
        product: Product;
        lot: string;
        sublot: string;
        location: Location;
        status: string;
        abcClass: ProductAbcClass;
        stockCountDate: string;
        packingUnit: UnitOfMeasure;
        countedStockInPackingUnit: string;
        countedStockInStockUnit: string;
        isZeroStock: boolean;
        quantityInPackingUnit: string;
        packingUnitToStockUnitConversionFactor: string;
        quantityInStockUnit: string;
        isOriginOfLineNote: EnteredStockLineStatus;
        stockId: string;
        stockCountCostCode: CostSource;
        stockCountUnitCost: string;
        stockCountNetCost: string;
        allocationDate: string;
        serialNumber: string;
        isStockCountLocked: BlockedStock;
        stockCountListStatus: StockCountDetailStatus;
        identifier1: string;
        identifier2: string;
        qualityAnalysisRequestId: string;
        orderPrice: string;
        potency: string;
        expirationReferenceDate: string;
        expirationDate: string;
        useByDate: string;
        recontrolDate: string;
        warehouse: Warehouse;
        majorVersion: MajorVersionStatus;
        minorVersion: string;
        stockUserArea1: string;
        stockUserArea2: string;
        countedStockInPackingUnit1: string;
        countedStockInStockUnit1: string;
        isZeroStock1: boolean;
        countedStockInPackingUnit2: string;
        countedStockInStockUnit2: string;
        isZeroStock2: boolean;
        serialNumberSequenceNumber: integer;
        licensePlateNumber: LicensePlateNumber;
        serialNumberLines: ClientCollection<StockCountSerialNumber>;
        stockCountSession: StockCountSession;
        stockLine: Stock;
    }
    export interface StockCountListDetail$Mutations {
        processCount: Node$Operation<
            {
                parameters?: {
                    stockCountSessionNumber: string;
                    stockCountListNumber: string;
                    productRankNumber: integer | string;
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
                    countedStockInPackingUnit: decimal | string;
                    packingUnitToStockUnitConversionFactor: decimal | string;
                    multiCountNumber: integer | string;
                    serialNumberQuantity: (decimal | string)[];
                    startingSerialNumber: string[];
                    endingSerialNumber: string[];
                    serialNumberVariance: string[];
                };
            },
            {
                stockCountSessionNumber: string;
                stockCountListNumber: string;
            }
        >;
        renumberCountList: Node$Operation<
            {
                parameters?: {
                    stockCountSessionNumber: string;
                    stockCountListNumber: string;
                };
            },
            {
                stockCountSessionNumber: string;
                stockCountListNumber: string;
            }
        >;
    }
    export interface StockCountListDetail$Lookups {
        stockCountList: QueryOperation<StockCountList>;
        stockSite: QueryOperation<Site>;
        product: QueryOperation<Product>;
        location: QueryOperation<Location>;
        packingUnit: QueryOperation<UnitOfMeasure>;
        warehouse: QueryOperation<Warehouse>;
        majorVersion: QueryOperation<MajorVersionStatus>;
        licensePlateNumber: QueryOperation<LicensePlateNumber>;
        stockCountSession: QueryOperation<StockCountSession>;
        stockLine: QueryOperation<Stock>;
    }
    export interface StockCountListDetail$Operations {
        query: QueryOperation<StockCountListDetail>;
        read: ReadOperation<StockCountListDetail>;
        aggregate: {
            read: AggregateReadOperation<StockCountListDetail>;
            query: AggregateQueryOperation<StockCountListDetail>;
        };
        mutations: StockCountListDetail$Mutations;
        lookups(dataOrId: string | { data: StockCountListDetailInput }): StockCountListDetail$Lookups;
        getDefaults: GetDefaultsOperation<StockCountListDetail>;
    }
    export interface StockCountList extends ClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        stockCountSessionNumber: string;
        stockCountListNumber: string;
        stockCountListDescription: string;
        stockCountDate: string;
        stockSite: Site;
        stockCountListStatus: StockCountStatusList;
        stockCountListStatusDate: string;
        isStockCountLocked: BlockedStock;
        numberOfLines: integer;
        stockCountOperator: string;
        allocationDate: string;
        movementDescription: string;
        warehouse: Warehouse;
        lastAllocationDate: string;
        stockCountSession: StockCountSession;
    }
    export interface StockCountListInput extends ClientNodeInput {
        stockCountSessionNumber?: string;
        stockCountListNumber?: string;
        stockCountListDescription?: string;
        stockCountDate?: string;
        stockSite?: string;
        stockCountListStatus?: StockCountStatusList;
        stockCountListStatusDate?: string;
        isStockCountLocked?: BlockedStock;
        numberOfLines?: integer | string;
        stockCountOperator?: string;
        allocationDate?: string;
        movementDescription?: string;
        warehouse?: string;
        lastAllocationDate?: string;
        stockCountSession?: string;
    }
    export interface StockCountListBinding extends ClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        stockCountSessionNumber: string;
        stockCountListNumber: string;
        stockCountListDescription: string;
        stockCountDate: string;
        stockSite: Site;
        stockCountListStatus: StockCountStatusList;
        stockCountListStatusDate: string;
        isStockCountLocked: BlockedStock;
        numberOfLines: integer;
        stockCountOperator: string;
        allocationDate: string;
        movementDescription: string;
        warehouse: Warehouse;
        lastAllocationDate: string;
        stockCountSession: StockCountSession;
    }
    export interface StockCountList$Lookups {
        stockSite: QueryOperation<Site>;
        warehouse: QueryOperation<Warehouse>;
        stockCountSession: QueryOperation<StockCountSession>;
    }
    export interface StockCountList$Operations {
        query: QueryOperation<StockCountList>;
        read: ReadOperation<StockCountList>;
        aggregate: {
            read: AggregateReadOperation<StockCountList>;
            query: AggregateQueryOperation<StockCountList>;
        };
        lookups(dataOrId: string | { data: StockCountListInput }): StockCountList$Lookups;
        getDefaults: GetDefaultsOperation<StockCountList>;
    }
    export interface StockCountSerialNumber extends ClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        stockCountSessionNumber: string;
        stockCountListNumber: StockCountList;
        serialNumberSequenceNumber: integer;
        serialNumberIndexNumber: integer;
        startingSerialNumber: string;
        endingSerialNumber: string;
        quantity: integer;
        stockCountVariance: string;
        stockSite: Site;
    }
    export interface StockCountSerialNumberInput extends ClientNodeInput {
        stockCountSessionNumber?: string;
        stockCountListNumber?: string;
        serialNumberSequenceNumber?: integer | string;
        serialNumberIndexNumber?: integer | string;
        startingSerialNumber?: string;
        endingSerialNumber?: string;
        quantity?: integer | string;
        stockCountVariance?: string;
        stockSite?: string;
    }
    export interface StockCountSerialNumberBinding extends ClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        stockCountSessionNumber: string;
        stockCountListNumber: StockCountList;
        serialNumberSequenceNumber: integer;
        serialNumberIndexNumber: integer;
        startingSerialNumber: string;
        endingSerialNumber: string;
        quantity: integer;
        stockCountVariance: string;
        stockSite: Site;
    }
    export interface StockCountSerialNumber$Lookups {
        stockCountListNumber: QueryOperation<StockCountList>;
        stockSite: QueryOperation<Site>;
    }
    export interface StockCountSerialNumber$Operations {
        query: QueryOperation<StockCountSerialNumber>;
        read: ReadOperation<StockCountSerialNumber>;
        aggregate: {
            read: AggregateReadOperation<StockCountSerialNumber>;
            query: AggregateQueryOperation<StockCountSerialNumber>;
        };
        lookups(dataOrId: string | { data: StockCountSerialNumberInput }): StockCountSerialNumber$Lookups;
        getDefaults: GetDefaultsOperation<StockCountSerialNumber>;
    }
    export interface StockCountSessionFromStatisticalGroups extends VitalClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        denormalizedIndex: integer;
        stockCountSession: string;
        fromStatisticalGroup: MiscellaneousTable;
    }
    export interface StockCountSessionFromStatisticalGroupsInput extends VitalClientNodeInput {
        denormalizedIndex?: integer | string;
        stockCountSession?: string;
        fromStatisticalGroup?: string;
    }
    export interface StockCountSessionFromStatisticalGroupsBinding extends VitalClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        denormalizedIndex: integer;
        stockCountSession: string;
        fromStatisticalGroup: MiscellaneousTable;
    }
    export interface StockCountSessionFromStatisticalGroups$Lookups {
        fromStatisticalGroup: QueryOperation<MiscellaneousTable>;
    }
    export interface StockCountSessionFromStatisticalGroups$Operations {
        query: QueryOperation<StockCountSessionFromStatisticalGroups>;
        read: ReadOperation<StockCountSessionFromStatisticalGroups>;
        aggregate: {
            read: AggregateReadOperation<StockCountSessionFromStatisticalGroups>;
            query: AggregateQueryOperation<StockCountSessionFromStatisticalGroups>;
        };
        lookups(
            dataOrId: string | { data: StockCountSessionFromStatisticalGroupsInput },
        ): StockCountSessionFromStatisticalGroups$Lookups;
        getDefaults: GetDefaultsOperation<StockCountSessionFromStatisticalGroups>;
    }
    export interface StockCountSessionToStatisticalGroups extends VitalClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        denormalizedIndex: integer;
        stockCountSession: string;
        toStatisticalGroup: MiscellaneousTable;
    }
    export interface StockCountSessionToStatisticalGroupsInput extends VitalClientNodeInput {
        denormalizedIndex?: integer | string;
        stockCountSession?: string;
        toStatisticalGroup?: string;
    }
    export interface StockCountSessionToStatisticalGroupsBinding extends VitalClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        denormalizedIndex: integer;
        stockCountSession: string;
        toStatisticalGroup: MiscellaneousTable;
    }
    export interface StockCountSessionToStatisticalGroups$Lookups {
        toStatisticalGroup: QueryOperation<MiscellaneousTable>;
    }
    export interface StockCountSessionToStatisticalGroups$Operations {
        query: QueryOperation<StockCountSessionToStatisticalGroups>;
        read: ReadOperation<StockCountSessionToStatisticalGroups>;
        aggregate: {
            read: AggregateReadOperation<StockCountSessionToStatisticalGroups>;
            query: AggregateQueryOperation<StockCountSessionToStatisticalGroups>;
        };
        lookups(
            dataOrId: string | { data: StockCountSessionToStatisticalGroupsInput },
        ): StockCountSessionToStatisticalGroups$Lookups;
        getDefaults: GetDefaultsOperation<StockCountSessionToStatisticalGroups>;
    }
    export interface StockCountSession extends ClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        stockCountSession: string;
        stockCountSessionDescription: string;
        stockCountSessionType: StockCountType;
        stockCountSessionMode: StockCountListChoice;
        stockCountSessionStatus: StockCountSessionStatus;
        stockCountDate: string;
        stockCountSortCode: StockTakeSequence;
        isGlobal: boolean;
        maximumNumberOfLines: integer;
        maximumPercentLimit: integer;
        numberOfProducts: integer;
        numberOfPositionsInLocationCode: integer;
        productFormula: string;
        fromProduct: Product;
        toProduct: Product;
        isNonUsableProductSelected: boolean;
        fromLocationType: string;
        toLocationType: string;
        fromLocation: Location;
        toLocation: Location;
        fromCategory: ProductCategory;
        toCategory: ProductCategory;
        fromBusinessPartner: BusinessPartner;
        toBusinessPartner: BusinessPartner;
        fromBuyer: User;
        toBuyer: User;
        fromLot: string;
        toLot: string;
        stockSite: Site;
        stockCycleCountClassA: boolean;
        numberOfProductsSelectedInClassA: integer;
        numberOfCountsInClassA: integer;
        stockCycleCountClassB: boolean;
        numberOfProductsSelectedInClassB: integer;
        numberOfCountsInClassB: integer;
        stockCycleCountClassC: boolean;
        numberOfProductsSelectedInClassC: integer;
        numberOfCountsInClassC: integer;
        stockCycleCountClassD: boolean;
        numberOfProductsSelectedInClassD: integer;
        numberOfCountsInClassD: integer;
        isReceiptLocation: boolean;
        isStorageLocation: boolean;
        isPickingLocation: boolean;
        isWorkStationLocation: boolean;
        isDockLocation: boolean;
        isShopLocation: boolean;
        isReturnLocation: boolean;
        productsWithZeroStock: boolean;
        isMultilist: boolean;
        productFormula2: string;
        stockFormula: string;
        locationFormula: string;
        warehouseFormula: string;
        productWarehouseFormula: string;
        fromWarehouse: Warehouse;
        toWarehouse: Warehouse;
        productWarehouse: boolean;
        isMultipleCount: boolean;
        fromStatisticalGroups: ClientCollection<StockCountSessionFromStatisticalGroups>;
        toStatisticalGroups: ClientCollection<StockCountSessionToStatisticalGroups>;
    }
    export interface StockCountSessionInput extends ClientNodeInput {
        stockCountSession?: string;
        stockCountSessionDescription?: string;
        stockCountSessionType?: StockCountType;
        stockCountSessionMode?: StockCountListChoice;
        stockCountSessionStatus?: StockCountSessionStatus;
        stockCountDate?: string;
        stockCountSortCode?: StockTakeSequence;
        isGlobal?: boolean | string;
        maximumNumberOfLines?: integer | string;
        maximumPercentLimit?: integer | string;
        numberOfProducts?: integer | string;
        numberOfPositionsInLocationCode?: integer | string;
        productFormula?: string;
        fromProduct?: string;
        toProduct?: string;
        isNonUsableProductSelected?: boolean | string;
        fromLocationType?: string;
        toLocationType?: string;
        fromLocation?: string;
        toLocation?: string;
        fromCategory?: string;
        toCategory?: string;
        fromBusinessPartner?: string;
        toBusinessPartner?: string;
        fromBuyer?: string;
        toBuyer?: string;
        fromLot?: string;
        toLot?: string;
        stockSite?: string;
        stockCycleCountClassA?: boolean | string;
        numberOfProductsSelectedInClassA?: integer | string;
        numberOfCountsInClassA?: integer | string;
        stockCycleCountClassB?: boolean | string;
        numberOfProductsSelectedInClassB?: integer | string;
        numberOfCountsInClassB?: integer | string;
        stockCycleCountClassC?: boolean | string;
        numberOfProductsSelectedInClassC?: integer | string;
        numberOfCountsInClassC?: integer | string;
        stockCycleCountClassD?: boolean | string;
        numberOfProductsSelectedInClassD?: integer | string;
        numberOfCountsInClassD?: integer | string;
        isReceiptLocation?: boolean | string;
        isStorageLocation?: boolean | string;
        isPickingLocation?: boolean | string;
        isWorkStationLocation?: boolean | string;
        isDockLocation?: boolean | string;
        isShopLocation?: boolean | string;
        isReturnLocation?: boolean | string;
        productsWithZeroStock?: boolean | string;
        isMultilist?: boolean | string;
        productFormula2?: string;
        stockFormula?: string;
        locationFormula?: string;
        warehouseFormula?: string;
        productWarehouseFormula?: string;
        fromWarehouse?: string;
        toWarehouse?: string;
        productWarehouse?: boolean | string;
        isMultipleCount?: boolean | string;
        fromStatisticalGroups?: Partial<StockCountSessionFromStatisticalGroupsInput>[];
        toStatisticalGroups?: Partial<StockCountSessionToStatisticalGroupsInput>[];
    }
    export interface StockCountSessionBinding extends ClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        stockCountSession: string;
        stockCountSessionDescription: string;
        stockCountSessionType: StockCountType;
        stockCountSessionMode: StockCountListChoice;
        stockCountSessionStatus: StockCountSessionStatus;
        stockCountDate: string;
        stockCountSortCode: StockTakeSequence;
        isGlobal: boolean;
        maximumNumberOfLines: integer;
        maximumPercentLimit: integer;
        numberOfProducts: integer;
        numberOfPositionsInLocationCode: integer;
        productFormula: string;
        fromProduct: Product;
        toProduct: Product;
        isNonUsableProductSelected: boolean;
        fromLocationType: string;
        toLocationType: string;
        fromLocation: Location;
        toLocation: Location;
        fromCategory: ProductCategory;
        toCategory: ProductCategory;
        fromBusinessPartner: BusinessPartner;
        toBusinessPartner: BusinessPartner;
        fromBuyer: User;
        toBuyer: User;
        fromLot: string;
        toLot: string;
        stockSite: Site;
        stockCycleCountClassA: boolean;
        numberOfProductsSelectedInClassA: integer;
        numberOfCountsInClassA: integer;
        stockCycleCountClassB: boolean;
        numberOfProductsSelectedInClassB: integer;
        numberOfCountsInClassB: integer;
        stockCycleCountClassC: boolean;
        numberOfProductsSelectedInClassC: integer;
        numberOfCountsInClassC: integer;
        stockCycleCountClassD: boolean;
        numberOfProductsSelectedInClassD: integer;
        numberOfCountsInClassD: integer;
        isReceiptLocation: boolean;
        isStorageLocation: boolean;
        isPickingLocation: boolean;
        isWorkStationLocation: boolean;
        isDockLocation: boolean;
        isShopLocation: boolean;
        isReturnLocation: boolean;
        productsWithZeroStock: boolean;
        isMultilist: boolean;
        productFormula2: string;
        stockFormula: string;
        locationFormula: string;
        warehouseFormula: string;
        productWarehouseFormula: string;
        fromWarehouse: Warehouse;
        toWarehouse: Warehouse;
        productWarehouse: boolean;
        isMultipleCount: boolean;
        fromStatisticalGroups: ClientCollection<StockCountSessionFromStatisticalGroupsBinding>;
        toStatisticalGroups: ClientCollection<StockCountSessionToStatisticalGroupsBinding>;
    }
    export interface StockCountSession$Lookups {
        fromProduct: QueryOperation<Product>;
        toProduct: QueryOperation<Product>;
        fromLocation: QueryOperation<Location>;
        toLocation: QueryOperation<Location>;
        fromCategory: QueryOperation<ProductCategory>;
        toCategory: QueryOperation<ProductCategory>;
        fromBusinessPartner: QueryOperation<BusinessPartner>;
        toBusinessPartner: QueryOperation<BusinessPartner>;
        fromBuyer: QueryOperation<User>;
        toBuyer: QueryOperation<User>;
        stockSite: QueryOperation<Site>;
        fromWarehouse: QueryOperation<Warehouse>;
        toWarehouse: QueryOperation<Warehouse>;
    }
    export interface StockCountSession$Operations {
        query: QueryOperation<StockCountSession>;
        read: ReadOperation<StockCountSession>;
        aggregate: {
            read: AggregateReadOperation<StockCountSession>;
            query: AggregateQueryOperation<StockCountSession>;
        };
        lookups(dataOrId: string | { data: StockCountSessionInput }): StockCountSession$Lookups;
        getDefaults: GetDefaultsOperation<StockCountSession>;
    }
    export interface StockEntryTransaction extends ClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        transactionType: TypeOfStockTransaction;
        code: string;
        localizedDescription: string;
        accessCode: Access;
        stockMovementCode: MiscellaneousTable;
        document: GenericPrintReport;
        isAutomaticallyPrinted: boolean;
        defaultStockMovementGroup: MiscellaneousTable;
        supplierLot: EntryMode;
        identifier1Detail: EntryMode;
        identifier2Detail: EntryMode;
        printingMode: LabelPrinting;
        isLotExpirationDateAllowed: boolean;
        isLotPotencyAllowed: boolean;
        isLotCustomField1Allowed: boolean;
        isLotCustomField2Allowed: boolean;
        isLotCustomField3Allowed: boolean;
        isLotCustomField4Allowed: boolean;
        stockAutomaticJournal: AutomaticJournal;
        isActive: boolean;
        companyOrSiteGroup: SiteGroupings;
        isAutomaticDetermination: boolean;
        stockChangeDestination: DestinationChoice;
        isLocationChange: boolean;
        isStatusChange: boolean;
        isUnitChange: boolean;
        ischangeInMass: boolean;
        preloadedQuantity: QtyPreCharged;
        stockMovementGroup: MiscellaneousTable;
        identifier1Destination: EntryMode;
        identifier2Destination: EntryMode;
        isLocationReplenishable: boolean;
        isConsumptionArea: boolean;
        isShortages: boolean;
        identifier1Entry: EntryMode;
        identifier2Entry: EntryMode;
        isEnterableDestinationLocation: boolean;
        isEnterableDestinationWarehouse: boolean;
        stockChangeAccessMode: StockChangeAccess;
    }
    export interface StockEntryTransactionInput extends ClientNodeInput {
        transactionType?: TypeOfStockTransaction;
        code?: string;
        localizedDescription?: string;
        accessCode?: string;
        stockMovementCode?: string;
        document?: string;
        isAutomaticallyPrinted?: boolean | string;
        defaultStockMovementGroup?: string;
        supplierLot?: EntryMode;
        identifier1Detail?: EntryMode;
        identifier2Detail?: EntryMode;
        printingMode?: LabelPrinting;
        isLotExpirationDateAllowed?: boolean | string;
        isLotPotencyAllowed?: boolean | string;
        isLotCustomField1Allowed?: boolean | string;
        isLotCustomField2Allowed?: boolean | string;
        isLotCustomField3Allowed?: boolean | string;
        isLotCustomField4Allowed?: boolean | string;
        stockAutomaticJournal?: string;
        isActive?: boolean | string;
        companyOrSiteGroup?: string;
        isAutomaticDetermination?: boolean | string;
        stockChangeDestination?: DestinationChoice;
        isLocationChange?: boolean | string;
        isStatusChange?: boolean | string;
        isUnitChange?: boolean | string;
        ischangeInMass?: boolean | string;
        preloadedQuantity?: QtyPreCharged;
        stockMovementGroup?: string;
        identifier1Destination?: EntryMode;
        identifier2Destination?: EntryMode;
        isLocationReplenishable?: boolean | string;
        isConsumptionArea?: boolean | string;
        isShortages?: boolean | string;
        identifier1Entry?: EntryMode;
        identifier2Entry?: EntryMode;
        isEnterableDestinationLocation?: boolean | string;
        isEnterableDestinationWarehouse?: boolean | string;
        stockChangeAccessMode?: StockChangeAccess;
    }
    export interface StockEntryTransactionBinding extends ClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        transactionType: TypeOfStockTransaction;
        code: string;
        localizedDescription: string;
        accessCode: Access;
        stockMovementCode: MiscellaneousTable;
        document: GenericPrintReport;
        isAutomaticallyPrinted: boolean;
        defaultStockMovementGroup: MiscellaneousTable;
        supplierLot: EntryMode;
        identifier1Detail: EntryMode;
        identifier2Detail: EntryMode;
        printingMode: LabelPrinting;
        isLotExpirationDateAllowed: boolean;
        isLotPotencyAllowed: boolean;
        isLotCustomField1Allowed: boolean;
        isLotCustomField2Allowed: boolean;
        isLotCustomField3Allowed: boolean;
        isLotCustomField4Allowed: boolean;
        stockAutomaticJournal: AutomaticJournal;
        isActive: boolean;
        companyOrSiteGroup: SiteGroupings;
        isAutomaticDetermination: boolean;
        stockChangeDestination: DestinationChoice;
        isLocationChange: boolean;
        isStatusChange: boolean;
        isUnitChange: boolean;
        ischangeInMass: boolean;
        preloadedQuantity: QtyPreCharged;
        stockMovementGroup: MiscellaneousTable;
        identifier1Destination: EntryMode;
        identifier2Destination: EntryMode;
        isLocationReplenishable: boolean;
        isConsumptionArea: boolean;
        isShortages: boolean;
        identifier1Entry: EntryMode;
        identifier2Entry: EntryMode;
        isEnterableDestinationLocation: boolean;
        isEnterableDestinationWarehouse: boolean;
        stockChangeAccessMode: StockChangeAccess;
    }
    export interface StockEntryTransaction$Lookups {
        accessCode: QueryOperation<Access>;
        stockMovementCode: QueryOperation<MiscellaneousTable>;
        document: QueryOperation<GenericPrintReport>;
        defaultStockMovementGroup: QueryOperation<MiscellaneousTable>;
        stockAutomaticJournal: QueryOperation<AutomaticJournal>;
        companyOrSiteGroup: QueryOperation<SiteGroupings>;
        stockMovementGroup: QueryOperation<MiscellaneousTable>;
    }
    export interface StockEntryTransaction$Operations {
        query: QueryOperation<StockEntryTransaction>;
        read: ReadOperation<StockEntryTransaction>;
        aggregate: {
            read: AggregateReadOperation<StockEntryTransaction>;
            query: AggregateQueryOperation<StockEntryTransaction>;
        };
        lookups(dataOrId: string | { data: StockEntryTransactionInput }): StockEntryTransaction$Lookups;
        getDefaults: GetDefaultsOperation<StockEntryTransaction>;
    }
    export interface StockReorder extends ClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        stockSite: Site;
        destinationLocation: string;
        product: Product;
        category: LocationCategory;
        warehouse: Warehouse;
        documentType: EntryTypeEnum;
        documentNumber: string;
        documentLineNumber: integer;
        packingUnit: UnitOfMeasure;
        quantityInPackingUnit: string;
        potencyDefault: string;
        packingUnitToStockUnitConversionFactor: string;
        stockUnit: UnitOfMeasure;
        quantityInStockUnit: string;
        activeQuantityInStockUnit: string;
        requirementDate: string;
        status: ReorderSituation;
        activeOriginalStockQuantity: string;
        isClosed: boolean;
        processingTime: string;
        movementDescription: string;
    }
    export interface StockReorderInput extends ClientNodeInput {
        stockSite?: string;
        destinationLocation?: string;
        product?: string;
        category?: LocationCategory;
        warehouse?: string;
        documentType?: EntryTypeEnum;
        documentNumber?: string;
        documentLineNumber?: integer | string;
        packingUnit?: string;
        quantityInPackingUnit?: decimal | string;
        potencyDefault?: decimal | string;
        packingUnitToStockUnitConversionFactor?: decimal | string;
        stockUnit?: string;
        quantityInStockUnit?: decimal | string;
        activeQuantityInStockUnit?: decimal | string;
        requirementDate?: string;
        status?: ReorderSituation;
        activeOriginalStockQuantity?: decimal | string;
        isClosed?: boolean | string;
        processingTime?: string;
        movementDescription?: string;
    }
    export interface StockReorderBinding extends ClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        stockSite: Site;
        destinationLocation: string;
        product: Product;
        category: LocationCategory;
        warehouse: Warehouse;
        documentType: EntryTypeEnum;
        documentNumber: string;
        documentLineNumber: integer;
        packingUnit: UnitOfMeasure;
        quantityInPackingUnit: string;
        potencyDefault: string;
        packingUnitToStockUnitConversionFactor: string;
        stockUnit: UnitOfMeasure;
        quantityInStockUnit: string;
        activeQuantityInStockUnit: string;
        requirementDate: string;
        status: ReorderSituation;
        activeOriginalStockQuantity: string;
        isClosed: boolean;
        processingTime: string;
        movementDescription: string;
    }
    export interface StockReorder$Mutations {
        processReorder: Node$Operation<
            {
                parameters?: {
                    stockEntryTransaction: string;
                    documentNumber: string;
                    documentLine: integer | string;
                    stockSite: string;
                    destinationLocation: string;
                    source: integer | string;
                    stockId: integer | string;
                    stockSequence: integer | string;
                    product: string;
                    fromLocation: string;
                    lot: string;
                    sublot: string;
                    serialNumber: string;
                    status: string;
                    identifier1: string;
                    identifier2: string;
                    licensePlateNumber: string;
                    packingUnit: string;
                    packingUnitToStockUnitConversionFactor: decimal | string;
                    packingQuantity: decimal | string;
                };
            },
            {
                stockEntryTransaction: string;
                documentNumber: string;
                documentLine: integer;
                stockSite: string;
                destinationLocation: string;
                source: integer;
                stockId: integer;
                stockSequence: integer;
                product: string;
                fromLocation: string;
                lot: string;
                sublot: string;
                serialNumber: string;
                status: string;
                identifier1: string;
                identifier2: string;
                licensePlateNumber: string;
                packingUnit: string;
                packingUnitToStockUnitConversionFactor: string;
                packingQuantity: string;
            }
        >;
    }
    export interface StockReorder$Lookups {
        stockSite: QueryOperation<Site>;
        product: QueryOperation<Product>;
        warehouse: QueryOperation<Warehouse>;
        packingUnit: QueryOperation<UnitOfMeasure>;
        stockUnit: QueryOperation<UnitOfMeasure>;
    }
    export interface StockReorder$Operations {
        query: QueryOperation<StockReorder>;
        read: ReadOperation<StockReorder>;
        aggregate: {
            read: AggregateReadOperation<StockReorder>;
            query: AggregateQueryOperation<StockReorder>;
        };
        mutations: StockReorder$Mutations;
        lookups(dataOrId: string | { data: StockReorderInput }): StockReorder$Lookups;
        getDefaults: GetDefaultsOperation<StockReorder>;
    }
    export interface StorageDetails extends ClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        stockId: string;
        documentType: EntryTypeEnum;
        documentNumber: string;
        documentLineNumber: integer;
        storageSequenceNumber: integer;
        storageTWSSequenceNumber: integer;
        storageSite: Site;
        originSource: OriginOfPutAwayPlan;
        storageListNumber: string;
        StorageDetailsListDate: string;
        supplierLot: string;
        lot: string;
        sublot: string;
        status: StockStatus;
        locationType: string;
        location: Location;
        startingSerialNumber: string;
        endingSerialNumber: string;
        packingUnit: UnitOfMeasure;
        quantityInPackingUnit: string;
        packingUnitToStockUnitConversionFactor: string;
        stockUnit: UnitOfMeasure;
        quantityInStockUnit: string;
        expirationDate: string;
        entryOkIndicator: integer;
        lotSource: string;
        potency: string;
        internationalUnitPotency: string;
        expirationReference: string;
        shelfLife: integer;
        lotUserArea1: string;
        lotUserArea2: string;
        lotUserArea3: string;
        lotUserArea4: string;
        activeQuantity: string;
        identifier1: string;
        identifier2: string;
        warehouse: Warehouse;
        stockUserArea1: string;
        stockUserArea2: string;
        majorVersion: MajorVersionStatus;
        minorVersion: string;
        licensePlateNumber: LicensePlateNumber;
        storage: Storage;
    }
    export interface StorageDetailsInput extends ClientNodeInput {
        stockId?: decimal | string;
        documentType?: EntryTypeEnum;
        documentNumber?: string;
        documentLineNumber?: integer | string;
        storageSequenceNumber?: integer | string;
        storageTWSSequenceNumber?: integer | string;
        storageSite?: string;
        originSource?: OriginOfPutAwayPlan;
        storageListNumber?: string;
        StorageDetailsListDate?: string;
        supplierLot?: string;
        lot?: string;
        sublot?: string;
        status?: string;
        locationType?: string;
        location?: string;
        startingSerialNumber?: string;
        endingSerialNumber?: string;
        packingUnit?: string;
        quantityInPackingUnit?: decimal | string;
        packingUnitToStockUnitConversionFactor?: decimal | string;
        stockUnit?: string;
        quantityInStockUnit?: decimal | string;
        expirationDate?: string;
        entryOkIndicator?: integer | string;
        lotSource?: string;
        potency?: decimal | string;
        internationalUnitPotency?: decimal | string;
        expirationReference?: string;
        shelfLife?: integer | string;
        lotUserArea1?: string;
        lotUserArea2?: string;
        lotUserArea3?: decimal | string;
        lotUserArea4?: string;
        activeQuantity?: decimal | string;
        identifier1?: string;
        identifier2?: string;
        warehouse?: string;
        stockUserArea1?: string;
        stockUserArea2?: string;
        majorVersion?: string;
        minorVersion?: string;
        licensePlateNumber?: string;
        storage?: integer | string;
    }
    export interface StorageDetailsBinding extends ClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        stockId: string;
        documentType: EntryTypeEnum;
        documentNumber: string;
        documentLineNumber: integer;
        storageSequenceNumber: integer;
        storageTWSSequenceNumber: integer;
        storageSite: Site;
        originSource: OriginOfPutAwayPlan;
        storageListNumber: string;
        StorageDetailsListDate: string;
        supplierLot: string;
        lot: string;
        sublot: string;
        status: StockStatus;
        locationType: string;
        location: Location;
        startingSerialNumber: string;
        endingSerialNumber: string;
        packingUnit: UnitOfMeasure;
        quantityInPackingUnit: string;
        packingUnitToStockUnitConversionFactor: string;
        stockUnit: UnitOfMeasure;
        quantityInStockUnit: string;
        expirationDate: string;
        entryOkIndicator: integer;
        lotSource: string;
        potency: string;
        internationalUnitPotency: string;
        expirationReference: string;
        shelfLife: integer;
        lotUserArea1: string;
        lotUserArea2: string;
        lotUserArea3: string;
        lotUserArea4: string;
        activeQuantity: string;
        identifier1: string;
        identifier2: string;
        warehouse: Warehouse;
        stockUserArea1: string;
        stockUserArea2: string;
        majorVersion: MajorVersionStatus;
        minorVersion: string;
        licensePlateNumber: LicensePlateNumber;
        storage: Storage;
    }
    export interface StorageDetails$Mutations {
        processPutaway: Node$Operation<
            {
                parameters?: {
                    stockEntryTransaction: string;
                    storageSite: string;
                    stockId: decimal | string;
                    documentType: EntryTypeEnum;
                    documentNumber: string;
                    documentLineNumber: integer | string;
                    storageSequenceNumber: integer | string;
                    quantityInPackingUnit: decimal | string;
                    lot: string;
                    sublot: string;
                    startingSerialNumber: string;
                    endingSerialNumber: string;
                    status: string;
                    container: string;
                    licensePlateNumber: string;
                    location: string;
                    locationType: string;
                    quantityInStockUnit: decimal | string;
                    labelDestination: string;
                };
            },
            {
                stockEntryTransaction: string;
                storageSite: string;
                stockId: string;
                documentType: EntryTypeEnum;
                documentNumber: string;
                documentLineNumber: integer;
                storageSequenceNumber: integer;
                quantityInPackingUnit: string;
                lot: string;
                sublot: string;
                startingSerialNumber: string;
                endingSerialNumber: string;
                status: string;
                container: string;
                licensePlateNumber: string;
                location: string;
                locationType: string;
                quantityInStockUnit: string;
                labelDestination: string;
            }
        >;
    }
    export interface StorageDetails$Lookups {
        storageSite: QueryOperation<Site>;
        status: QueryOperation<StockStatus>;
        location: QueryOperation<Location>;
        packingUnit: QueryOperation<UnitOfMeasure>;
        stockUnit: QueryOperation<UnitOfMeasure>;
        warehouse: QueryOperation<Warehouse>;
        majorVersion: QueryOperation<MajorVersionStatus>;
        licensePlateNumber: QueryOperation<LicensePlateNumber>;
        storage: QueryOperation<Storage>;
    }
    export interface StorageDetails$Operations {
        query: QueryOperation<StorageDetails>;
        read: ReadOperation<StorageDetails>;
        aggregate: {
            read: AggregateReadOperation<StorageDetails>;
            query: AggregateQueryOperation<StorageDetails>;
        };
        mutations: StorageDetails$Mutations;
        lookups(dataOrId: string | { data: StorageDetailsInput }): StorageDetails$Lookups;
        getDefaults: GetDefaultsOperation<StorageDetails>;
    }
    export interface Storage extends ClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        stockId: string;
        documentType: EntryTypeEnum;
        documentNumber: string;
        documentLineNumber: integer;
        storageSite: Site;
        originOfPutaway: OriginOfPutAwayPlan;
        sourceDocumentType: EntryTypeEnum;
        sourceDocumentNumber: string;
        transactionType: StockTransactionType;
        allocationDate: string;
        status: StockStatus;
        location: Location;
        product: Product;
        activeQuantityInStockUnit: string;
        putawayStatus: PutAwayPlanSituation;
        storageListNumber: string;
        packingUnit: UnitOfMeasure;
        quantityInPackingUnit: string;
        packingUnitToStockUnitConversionFactor: string;
        quantityInStockUnit: string;
        storageListDate: string;
        movementDescription: string;
        project: ProjectLink;
        businessPartner: BusinessPartner;
        isQualityControlManagement: SubjectToControl;
        qualityControlFrequency: integer;
        warehouse: Warehouse;
    }
    export interface StorageInput extends ClientNodeInput {
        stockId?: decimal | string;
        documentType?: EntryTypeEnum;
        documentNumber?: string;
        documentLineNumber?: integer | string;
        storageSite?: string;
        originOfPutaway?: OriginOfPutAwayPlan;
        sourceDocumentType?: EntryTypeEnum;
        sourceDocumentNumber?: string;
        transactionType?: StockTransactionType;
        allocationDate?: string;
        status?: string;
        location?: string;
        product?: string;
        activeQuantityInStockUnit?: decimal | string;
        putawayStatus?: PutAwayPlanSituation;
        storageListNumber?: string;
        packingUnit?: string;
        quantityInPackingUnit?: decimal | string;
        packingUnitToStockUnitConversionFactor?: decimal | string;
        quantityInStockUnit?: decimal | string;
        storageListDate?: string;
        movementDescription?: string;
        project?: string;
        businessPartner?: string;
        isQualityControlManagement?: SubjectToControl;
        qualityControlFrequency?: integer | string;
        warehouse?: string;
    }
    export interface StorageBinding extends ClientNode {
        _updateUser: SysUser;
        _createUser: SysUser;
        stockId: string;
        documentType: EntryTypeEnum;
        documentNumber: string;
        documentLineNumber: integer;
        storageSite: Site;
        originOfPutaway: OriginOfPutAwayPlan;
        sourceDocumentType: EntryTypeEnum;
        sourceDocumentNumber: string;
        transactionType: StockTransactionType;
        allocationDate: string;
        status: StockStatus;
        location: Location;
        product: Product;
        activeQuantityInStockUnit: string;
        putawayStatus: PutAwayPlanSituation;
        storageListNumber: string;
        packingUnit: UnitOfMeasure;
        quantityInPackingUnit: string;
        packingUnitToStockUnitConversionFactor: string;
        quantityInStockUnit: string;
        storageListDate: string;
        movementDescription: string;
        project: ProjectLink;
        businessPartner: BusinessPartner;
        isQualityControlManagement: SubjectToControl;
        qualityControlFrequency: integer;
        warehouse: Warehouse;
    }
    export interface Storage$Lookups {
        storageSite: QueryOperation<Site>;
        status: QueryOperation<StockStatus>;
        location: QueryOperation<Location>;
        product: QueryOperation<Product>;
        packingUnit: QueryOperation<UnitOfMeasure>;
        project: QueryOperation<ProjectLink>;
        businessPartner: QueryOperation<BusinessPartner>;
        warehouse: QueryOperation<Warehouse>;
    }
    export interface Storage$Operations {
        query: QueryOperation<Storage>;
        read: ReadOperation<Storage>;
        aggregate: {
            read: AggregateReadOperation<Storage>;
            query: AggregateQueryOperation<Storage>;
        };
        lookups(dataOrId: string | { data: StorageInput }): Storage$Lookups;
        getDefaults: GetDefaultsOperation<Storage>;
    }
    export interface ProductSiteExtension {
        _updateUser: SysUser;
        _createUser: SysUser;
        product: Product;
        stockSite: Site;
        isBeingCounted: boolean;
        countWorksheet: string;
        abcClass: ProductAbcClass;
        isLocationManaged: boolean;
        stockWithdrawalMode: StockWithdrawal;
        countManagementMode: Count;
        trendProfile: string;
        numberOfStockCoverageWeeks: integer;
        multilevelLeadTime: string;
        qualityControlLeadTime: string;
        planningFirmHorizon: integer;
        planningFirmHorizonTimeUnit: LeadTimeUnit;
        planningDemandHorizon: integer;
        planningDemandHorizonTimeUnit: LeadTimeUnit;
        reorderLeadTime: string;
        productionLeadTime: string;
        pickingLeadTime: string;
        reductionFactor: integer;
        reorderingPeriodicity: integer;
        reorderingSuggestionType: SuggestionType;
        reorderingSite: Site;
        reorderingPolicy: string;
        safetyStock: string;
        calculatedSafetyStock: string;
        reorderingThreshold: string;
        calculatedReorderingThreshold: string;
        reorderingMaximumStock: string;
        calculatedReorderingMaximumStock: string;
        economicOrderQuantity: string;
        calculatedEconomicOrderQuantity: string;
        technicalLotQuantity: string;
        shrinkagePercentage: string;
        planner: User;
        buyer: User;
        standardCostUpdate: PriceUpdateMode;
        revisedStandardCostUpdate: PriceUpdateMode;
        budgetStandardCostUpdate: PriceUpdateMode;
        simulatedCostUpdate: PriceUpdateMode;
        productionRouting: string;
        costRouting: string;
        roughCut: string;
        productionRoutingCode: BomRouting;
        costRoutingCode: BomRouting;
        roughCutCapacityPlanningRoutingCode: BomRouting;
        isReleasedIfShortage: boolean;
        isShrinkedWithRelease: boolean;
        yearOfLastMonthlyUpdate: integer;
        monthOfLastMonthlyUpdate: integer;
        lastAnnualUpdate: integer;
        automaticClosingPercentage: string;
        configurationCode: string;
        storageHandling: string;
        weighingAccessCode: string;
        weighingTolerance: string;
        productTolerance: string;
        valuationMethod: string;
        prorataQuantityAdjustment: string;
        protectionWip: boolean;
        packagingCapacity: string;
        stockManagementMode: StockManagement;
        assignmentRule: string;
        isStockDetailedInPacking: boolean;
        qualityControlManagementMode: SubjectToControl;
        qualityControlAccessCode: string;
        qualityControlFrequency: integer;
        numberOfEntriesSinceLastQualityControl: integer;
        sampling: SamplingType;
        samplingMode: SamplingMode;
        samplingGeneralCheckLevel: GeneralControlLevel;
        samplingAcceptableQualityLevel: AcceptableQualityLevel;
        qualityControlFrequencyToReview: integer;
        qualityEntriesProcess: integer;
        recontrolLeadTime: integer;
        newStockStatusAfterRecontrol: string;
        useByDateCoefficient: string;
        orderWarehouse: string;
        workOrderWarehouse: string;
        shippingWarehouse: string;
        materialConsumptionsWarehouse: string;
        internalMovementWarehouse: string;
        subcontractShipmentWarehouse: string;
        subcontractConsumptionWarehouse: string;
        isPackingManaged: boolean;
        freightClass: string;
        freightCommodityCode: string;
        isLicensePlateNumberManaged: boolean;
        products: ClientCollection<Product>;
        reorderingManagementMode: ReorderingManagementMode;
        recontrolTimeUnit: ExpirationLeadTimeUnits;
        defaultInternalContainer: Container;
        defaultLocations: ClientCollection<ProductSiteDefaultLocations>;
        internalContainers: ClientCollection<ProductSiteInternalContainers>;
        packaging: Packaging;
        stock: ClientCollection<Stock>;
        countOfStockRecords: integer;
        distinctCountOfLocations: integer;
        distinctCountOfLots: integer;
        distinctCountOfStockQuantity: string;
        distinctCountOfSublots: integer;
        stockUnitCode: string;
    }
    export interface ProductSiteInputExtension {
        product?: string;
        stockSite?: string;
        isBeingCounted?: boolean | string;
        countWorksheet?: string;
        abcClass?: ProductAbcClass;
        isLocationManaged?: boolean | string;
        stockWithdrawalMode?: StockWithdrawal;
        countManagementMode?: Count;
        trendProfile?: string;
        numberOfStockCoverageWeeks?: integer | string;
        multilevelLeadTime?: decimal | string;
        qualityControlLeadTime?: decimal | string;
        planningFirmHorizon?: integer | string;
        planningFirmHorizonTimeUnit?: LeadTimeUnit;
        planningDemandHorizon?: integer | string;
        planningDemandHorizonTimeUnit?: LeadTimeUnit;
        reorderLeadTime?: decimal | string;
        productionLeadTime?: decimal | string;
        pickingLeadTime?: decimal | string;
        reductionFactor?: integer | string;
        reorderingPeriodicity?: integer | string;
        reorderingSuggestionType?: SuggestionType;
        reorderingSite?: string;
        reorderingPolicy?: string;
        safetyStock?: decimal | string;
        calculatedSafetyStock?: decimal | string;
        reorderingThreshold?: decimal | string;
        calculatedReorderingThreshold?: decimal | string;
        reorderingMaximumStock?: decimal | string;
        calculatedReorderingMaximumStock?: decimal | string;
        economicOrderQuantity?: decimal | string;
        calculatedEconomicOrderQuantity?: decimal | string;
        technicalLotQuantity?: decimal | string;
        shrinkagePercentage?: decimal | string;
        planner?: string;
        buyer?: string;
        standardCostUpdate?: PriceUpdateMode;
        revisedStandardCostUpdate?: PriceUpdateMode;
        budgetStandardCostUpdate?: PriceUpdateMode;
        simulatedCostUpdate?: PriceUpdateMode;
        productionRouting?: string;
        costRouting?: string;
        roughCut?: string;
        productionRoutingCode?: integer | string;
        costRoutingCode?: integer | string;
        roughCutCapacityPlanningRoutingCode?: integer | string;
        isReleasedIfShortage?: boolean | string;
        isShrinkedWithRelease?: boolean | string;
        yearOfLastMonthlyUpdate?: integer | string;
        monthOfLastMonthlyUpdate?: integer | string;
        lastAnnualUpdate?: integer | string;
        automaticClosingPercentage?: decimal | string;
        configurationCode?: string;
        storageHandling?: string;
        weighingAccessCode?: string;
        weighingTolerance?: decimal | string;
        productTolerance?: decimal | string;
        valuationMethod?: string;
        prorataQuantityAdjustment?: decimal | string;
        protectionWip?: boolean | string;
        packagingCapacity?: decimal | string;
        stockManagementMode?: StockManagement;
        assignmentRule?: string;
        isStockDetailedInPacking?: boolean | string;
        qualityControlManagementMode?: SubjectToControl;
        qualityControlAccessCode?: string;
        qualityControlFrequency?: integer | string;
        numberOfEntriesSinceLastQualityControl?: integer | string;
        sampling?: SamplingType;
        samplingMode?: SamplingMode;
        samplingGeneralCheckLevel?: GeneralControlLevel;
        samplingAcceptableQualityLevel?: AcceptableQualityLevel;
        qualityControlFrequencyToReview?: integer | string;
        qualityEntriesProcess?: integer | string;
        recontrolLeadTime?: integer | string;
        newStockStatusAfterRecontrol?: string;
        useByDateCoefficient?: decimal | string;
        orderWarehouse?: string;
        workOrderWarehouse?: string;
        shippingWarehouse?: string;
        materialConsumptionsWarehouse?: string;
        internalMovementWarehouse?: string;
        subcontractShipmentWarehouse?: string;
        subcontractConsumptionWarehouse?: string;
        isPackingManaged?: boolean | string;
        freightClass?: string;
        freightCommodityCode?: string;
        isLicensePlateNumberManaged?: boolean | string;
        reorderingManagementMode?: ReorderingManagementMode;
        recontrolTimeUnit?: ExpirationLeadTimeUnits;
        defaultInternalContainer?: string;
        defaultLocations?: Partial<ProductSiteDefaultLocationsInput>[];
        internalContainers?: Partial<ProductSiteInternalContainersInput>[];
        packaging?: string;
    }
    export interface ProductSiteBindingExtension {
        _updateUser: SysUser;
        _createUser: SysUser;
        product: Product;
        stockSite: Site;
        isBeingCounted: boolean;
        countWorksheet: string;
        abcClass: ProductAbcClass;
        isLocationManaged: boolean;
        stockWithdrawalMode: StockWithdrawal;
        countManagementMode: Count;
        trendProfile: string;
        numberOfStockCoverageWeeks: integer;
        multilevelLeadTime: string;
        qualityControlLeadTime: string;
        planningFirmHorizon: integer;
        planningFirmHorizonTimeUnit: LeadTimeUnit;
        planningDemandHorizon: integer;
        planningDemandHorizonTimeUnit: LeadTimeUnit;
        reorderLeadTime: string;
        productionLeadTime: string;
        pickingLeadTime: string;
        reductionFactor: integer;
        reorderingPeriodicity: integer;
        reorderingSuggestionType: SuggestionType;
        reorderingSite: Site;
        reorderingPolicy: string;
        safetyStock: string;
        calculatedSafetyStock: string;
        reorderingThreshold: string;
        calculatedReorderingThreshold: string;
        reorderingMaximumStock: string;
        calculatedReorderingMaximumStock: string;
        economicOrderQuantity: string;
        calculatedEconomicOrderQuantity: string;
        technicalLotQuantity: string;
        shrinkagePercentage: string;
        planner: User;
        buyer: User;
        standardCostUpdate: PriceUpdateMode;
        revisedStandardCostUpdate: PriceUpdateMode;
        budgetStandardCostUpdate: PriceUpdateMode;
        simulatedCostUpdate: PriceUpdateMode;
        productionRouting: string;
        costRouting: string;
        roughCut: string;
        productionRoutingCode: BomRouting;
        costRoutingCode: BomRouting;
        roughCutCapacityPlanningRoutingCode: BomRouting;
        isReleasedIfShortage: boolean;
        isShrinkedWithRelease: boolean;
        yearOfLastMonthlyUpdate: integer;
        monthOfLastMonthlyUpdate: integer;
        lastAnnualUpdate: integer;
        automaticClosingPercentage: string;
        configurationCode: string;
        storageHandling: string;
        weighingAccessCode: string;
        weighingTolerance: string;
        productTolerance: string;
        valuationMethod: string;
        prorataQuantityAdjustment: string;
        protectionWip: boolean;
        packagingCapacity: string;
        stockManagementMode: StockManagement;
        assignmentRule: string;
        isStockDetailedInPacking: boolean;
        qualityControlManagementMode: SubjectToControl;
        qualityControlAccessCode: string;
        qualityControlFrequency: integer;
        numberOfEntriesSinceLastQualityControl: integer;
        sampling: SamplingType;
        samplingMode: SamplingMode;
        samplingGeneralCheckLevel: GeneralControlLevel;
        samplingAcceptableQualityLevel: AcceptableQualityLevel;
        qualityControlFrequencyToReview: integer;
        qualityEntriesProcess: integer;
        recontrolLeadTime: integer;
        newStockStatusAfterRecontrol: string;
        useByDateCoefficient: string;
        orderWarehouse: string;
        workOrderWarehouse: string;
        shippingWarehouse: string;
        materialConsumptionsWarehouse: string;
        internalMovementWarehouse: string;
        subcontractShipmentWarehouse: string;
        subcontractConsumptionWarehouse: string;
        isPackingManaged: boolean;
        freightClass: string;
        freightCommodityCode: string;
        isLicensePlateNumberManaged: boolean;
        products: ClientCollection<Product>;
        reorderingManagementMode: ReorderingManagementMode;
        recontrolTimeUnit: ExpirationLeadTimeUnits;
        defaultInternalContainer: Container;
        defaultLocations: ClientCollection<ProductSiteDefaultLocationsBinding>;
        internalContainers: ClientCollection<ProductSiteInternalContainersBinding>;
        packaging: Packaging;
        stock: ClientCollection<Stock>;
        countOfStockRecords: integer;
        distinctCountOfLocations: integer;
        distinctCountOfLots: integer;
        distinctCountOfStockQuantity: string;
        distinctCountOfSublots: integer;
        stockUnitCode: string;
    }
    export interface ProductSiteExtension$Lookups {
        packaging: QueryOperation<Packaging>;
    }
    export interface ProductSiteExtension$Operations {
        lookups(dataOrId: string | { data: ProductSiteInput }): ProductSiteExtension$Lookups;
    }
    export interface ShipToCustomerAddressExtension {
        _updateUser: SysUser;
        _createUser: SysUser;
        customer: Customer;
        shipToAddress: CustomerAddress;
        company: Company;
        isActive: boolean;
        shippingSite: Site;
        receiptSite: Site;
        language: Language;
        carrier: Carrier;
        incoterm: Incoterm;
        intrastatTransportLocation: CountryLocation;
        deliveryLeadTime: integer;
        isMondayWorkday: boolean;
        isTuesdayWorkday: boolean;
        isWednesdayWorkday: boolean;
        isThursdayWorkday: boolean;
        isFridayWorkday: boolean;
        isSaturdayWorkday: boolean;
        isSundayWorkday: boolean;
        unavailablePeriod: UnavailablePeriods;
        intrastatIncreaseCoefficient: string;
        europeanUnionVatNumber: string;
        incotermTown: string;
        forwardingAgent: Carrier;
        forwardingAgentAddress: Address;
        geographicCode: string;
        insideCityLimits: string;
        taxExemptionNumber: string;
        exemptionFlag: string;
        mustPrintPickTicket: boolean;
        mustPrintPackingSlip: boolean;
        entityUse: MiscellaneousTable;
        _pickingHeaderText: CommonText;
        _deliveryHeaderText: CommonText;
        deliveryHeaderText: TextStream;
        pickingHeaderText: TextStream;
        _nodeStatus: string;
        companyNames: ClientCollection<ShipToCustomerAddressCompanyNames>;
        salesReps: ClientCollection<ShipToCustomerAddressSalesReps>;
        taxRule: TaxRule;
        routeCode: RouteCode;
        deliveryPriority: DeliveryPriority;
        loanLocation: Location;
        subcontractLocation: Location;
    }
    export interface ShipToCustomerAddressInputExtension {
        customer?: string;
        shipToAddress?: string;
        company?: string;
        isActive?: boolean | string;
        shippingSite?: string;
        receiptSite?: string;
        language?: string;
        carrier?: string;
        incoterm?: string;
        intrastatTransportLocation?: CountryLocation;
        deliveryLeadTime?: integer | string;
        isMondayWorkday?: boolean | string;
        isTuesdayWorkday?: boolean | string;
        isWednesdayWorkday?: boolean | string;
        isThursdayWorkday?: boolean | string;
        isFridayWorkday?: boolean | string;
        isSaturdayWorkday?: boolean | string;
        isSundayWorkday?: boolean | string;
        unavailablePeriod?: string;
        intrastatIncreaseCoefficient?: decimal | string;
        europeanUnionVatNumber?: string;
        incotermTown?: string;
        forwardingAgent?: string;
        forwardingAgentAddress?: string;
        geographicCode?: string;
        insideCityLimits?: string;
        taxExemptionNumber?: string;
        exemptionFlag?: string;
        mustPrintPickTicket?: boolean | string;
        mustPrintPackingSlip?: boolean | string;
        entityUse?: string;
        _pickingHeaderText?: string;
        _deliveryHeaderText?: string;
        deliveryHeaderText?: TextStream;
        pickingHeaderText?: TextStream;
        companyNames?: Partial<ShipToCustomerAddressCompanyNamesInput>[];
        salesReps?: Partial<ShipToCustomerAddressSalesRepsInput>[];
        taxRule?: string;
        routeCode?: RouteCode;
        deliveryPriority?: DeliveryPriority;
        loanLocation?: string;
        subcontractLocation?: string;
    }
    export interface ShipToCustomerAddressBindingExtension {
        _updateUser: SysUser;
        _createUser: SysUser;
        customer: Customer;
        shipToAddress: CustomerAddress;
        company: Company;
        isActive: boolean;
        shippingSite: Site;
        receiptSite: Site;
        language: Language;
        carrier: Carrier;
        incoterm: Incoterm;
        intrastatTransportLocation: CountryLocation;
        deliveryLeadTime: integer;
        isMondayWorkday: boolean;
        isTuesdayWorkday: boolean;
        isWednesdayWorkday: boolean;
        isThursdayWorkday: boolean;
        isFridayWorkday: boolean;
        isSaturdayWorkday: boolean;
        isSundayWorkday: boolean;
        unavailablePeriod: UnavailablePeriods;
        intrastatIncreaseCoefficient: string;
        europeanUnionVatNumber: string;
        incotermTown: string;
        forwardingAgent: Carrier;
        forwardingAgentAddress: Address;
        geographicCode: string;
        insideCityLimits: string;
        taxExemptionNumber: string;
        exemptionFlag: string;
        mustPrintPickTicket: boolean;
        mustPrintPackingSlip: boolean;
        entityUse: MiscellaneousTable;
        _pickingHeaderText: CommonText;
        _deliveryHeaderText: CommonText;
        deliveryHeaderText: TextStream;
        pickingHeaderText: TextStream;
        _nodeStatus: string;
        companyNames: ClientCollection<ShipToCustomerAddressCompanyNamesBinding>;
        salesReps: ClientCollection<ShipToCustomerAddressSalesRepsBinding>;
        taxRule: TaxRule;
        routeCode: RouteCode;
        deliveryPriority: DeliveryPriority;
        loanLocation: Location;
        subcontractLocation: Location;
    }
    export interface ShipToCustomerAddressExtension$Lookups {
        loanLocation: QueryOperation<Location>;
        subcontractLocation: QueryOperation<Location>;
    }
    export interface ShipToCustomerAddressExtension$Operations {
        lookups(dataOrId: string | { data: ShipToCustomerAddressInput }): ShipToCustomerAddressExtension$Lookups;
    }
    export interface Package {
        '@sage/x3-stock/Allocation': Allocation$Operations;
        '@sage/x3-stock/LpnOperationsLine': LpnOperationsLine$Operations;
        '@sage/x3-stock/LpnOperations': LpnOperations$Operations;
        '@sage/x3-stock/MiscellaneousIssueDimensions': MiscellaneousIssueDimensions$Operations;
        '@sage/x3-stock/MiscellaneousIssueLine': MiscellaneousIssueLine$Operations;
        '@sage/x3-stock/MiscellaneousIssue': MiscellaneousIssue$Operations;
        '@sage/x3-stock/MiscellaneousReceiptDimensions': MiscellaneousReceiptDimensions$Operations;
        '@sage/x3-stock/MiscellaneousReceiptLine': MiscellaneousReceiptLine$Operations;
        '@sage/x3-stock/MiscellaneousReceipt': MiscellaneousReceipt$Operations;
        '@sage/x3-stock/PickList': PickList$Operations;
        '@sage/x3-stock/PickTicketLine': PickTicketLine$Operations;
        '@sage/x3-stock/PickTicket': PickTicket$Operations;
        '@sage/x3-stock/StockChangeByLpn': StockChangeByLpn$Operations;
        '@sage/x3-stock/StockChangeLineByLpn': StockChangeLineByLpn$Operations;
        '@sage/x3-stock/StockChangeLine': StockChangeLine$Operations;
        '@sage/x3-stock/StockChange': StockChange$Operations;
        '@sage/x3-stock/StockCountListDetail': StockCountListDetail$Operations;
        '@sage/x3-stock/StockCountList': StockCountList$Operations;
        '@sage/x3-stock/StockCountSerialNumber': StockCountSerialNumber$Operations;
        '@sage/x3-stock/StockCountSessionFromStatisticalGroups': StockCountSessionFromStatisticalGroups$Operations;
        '@sage/x3-stock/StockCountSessionToStatisticalGroups': StockCountSessionToStatisticalGroups$Operations;
        '@sage/x3-stock/StockCountSession': StockCountSession$Operations;
        '@sage/x3-stock/StockEntryTransaction': StockEntryTransaction$Operations;
        '@sage/x3-stock/StockReorder': StockReorder$Operations;
        '@sage/x3-stock/StorageDetails': StorageDetails$Operations;
        '@sage/x3-stock/Storage': Storage$Operations;
    }
    export interface GraphApi
        extends Package,
            SageX3FinanceData$Package,
            SageX3InvoicingData$Package,
            SageX3ManufacturingData$Package,
            SageX3MasterData$Package,
            SageX3PhysicalFlowsData$Package,
            SageX3ProjectManagementData$Package,
            SageX3SalesData$Package,
            SageX3StockData$Package,
            SageX3Structure$Package,
            SageX3System$Package,
            SageXtremAppMetadata$Package,
            SageXtremX3SystemUtils$Package {}
}
declare module '@sage/x3-stock-api' {
    export type * from '@sage/x3-stock-api-partial';
}
declare module '@sage/x3-finance-data-api-partial' {
    import type { GraphApi as GraphApiExtension } from '@sage/x3-stock-api';
    export interface GraphApi extends GraphApiExtension {}
}
declare module '@sage/x3-invoicing-data-api-partial' {
    import type { GraphApi as GraphApiExtension } from '@sage/x3-stock-api';
    export interface GraphApi extends GraphApiExtension {}
}
declare module '@sage/x3-manufacturing-data-api-partial' {
    import type { GraphApi as GraphApiExtension } from '@sage/x3-stock-api';
    export interface GraphApi extends GraphApiExtension {}
}
declare module '@sage/x3-master-data-api-partial' {
    import type { GraphApi as GraphApiExtension } from '@sage/x3-stock-api';
    export interface GraphApi extends GraphApiExtension {}
}
declare module '@sage/x3-physical-flows-data-api-partial' {
    import type { GraphApi as GraphApiExtension } from '@sage/x3-stock-api';
    export interface GraphApi extends GraphApiExtension {}
}
declare module '@sage/x3-project-management-data-api-partial' {
    import type { GraphApi as GraphApiExtension } from '@sage/x3-stock-api';
    export interface GraphApi extends GraphApiExtension {}
}
declare module '@sage/x3-sales-data-api-partial' {
    import type { GraphApi as GraphApiExtension } from '@sage/x3-stock-api';
    export interface GraphApi extends GraphApiExtension {}
}
declare module '@sage/x3-stock-data-api-partial' {
    import type { GraphApi as GraphApiExtension } from '@sage/x3-stock-api';
    export interface GraphApi extends GraphApiExtension {}
}
declare module '@sage/x3-structure-api-partial' {
    import type { GraphApi as GraphApiExtension } from '@sage/x3-stock-api';
    export interface GraphApi extends GraphApiExtension {}
}
declare module '@sage/x3-system-api-partial' {
    import type { GraphApi as GraphApiExtension } from '@sage/x3-stock-api';
    export interface GraphApi extends GraphApiExtension {}
}
declare module '@sage/xtrem-app-metadata-api-partial' {
    import type { GraphApi as GraphApiExtension } from '@sage/x3-stock-api';
    export interface GraphApi extends GraphApiExtension {}
}
declare module '@sage/xtrem-x3-system-utils-api-partial' {
    import type { GraphApi as GraphApiExtension } from '@sage/x3-stock-api';
    export interface GraphApi extends GraphApiExtension {}
}
declare module '@sage/x3-master-data-api-partial' {
    import type {
        ProductSiteBindingExtension,
        ProductSiteExtension,
        ProductSiteExtension$Lookups,
        ProductSiteExtension$Operations,
        ProductSiteInputExtension,
        ShipToCustomerAddressBindingExtension,
        ShipToCustomerAddressExtension,
        ShipToCustomerAddressExtension$Lookups,
        ShipToCustomerAddressExtension$Operations,
        ShipToCustomerAddressInputExtension,
    } from '@sage/x3-stock-api';
    export interface ProductSite extends ProductSiteExtension {}
    export interface ProductSiteBinding extends ProductSiteBindingExtension {}
    export interface ProductSiteInput extends ProductSiteInputExtension {}
    export interface ProductSite$Lookups extends ProductSiteExtension$Lookups {}
    export interface ProductSite$Operations extends ProductSiteExtension$Operations {}
    export interface ShipToCustomerAddress extends ShipToCustomerAddressExtension {}
    export interface ShipToCustomerAddressBinding extends ShipToCustomerAddressBindingExtension {}
    export interface ShipToCustomerAddressInput extends ShipToCustomerAddressInputExtension {}
    export interface ShipToCustomerAddress$Lookups extends ShipToCustomerAddressExtension$Lookups {}
    export interface ShipToCustomerAddress$Operations extends ShipToCustomerAddressExtension$Operations {}
}
