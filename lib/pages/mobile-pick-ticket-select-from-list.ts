import { GraphApi, PickList } from '@sage/x3-stock-api';
import { MobileSettings } from '@sage/x3-stock-data-api';
import * as ui from '@sage/xtrem-ui';

@ui.decorators.page<MobilePickTicketSelectFromList, PickList>({
    isTitleHidden: true,
    title: 'Pick ticket',
    subtitle: 'Select a line',
    node: '@sage/x3-stock/PickList',
    isTransient: false,
    skipDirtyCheck: true,
    async onLoad() {
        // To To protect yourself from the return of the line, the ticket must be cancelled.
        this.$.storage.set(MobilePickTicketSelectFromList.PICK_TICKET_KEY, '');
        let pickList = this.$.storage.get(MobilePickTicketSelectFromList.PICK_LIST_KEY);
        if (pickList) {
            this.preparationListField.value = pickList.toString();
        } else {
            const mess: string = ui.localize('@sage/x3-stock/pickList-required', 'Pick list is required');
            this.$.showToast(mess, { type: 'warning' });
        }
        this._mobileSettings = JSON.parse(this.$.queryParameters?.mobileSettings as string);
    },
    navigationPanel: {
        canFilter: false,
        isHeaderHidden: true,
        isAutoSelectEnabled: true,
        menuType: 'toggle',
        isFirstLetterSeparatorHidden: true,
        listItem: {
            title: ui.nestedFields.reference({
                node: '@sage/x3-stock/PickTicket',
                bind: 'pickTicket',
                valueField: 'id',
                canFilter: true,
            }),
            titleRight: ui.nestedFields.numeric({
                bind: 'quantityInStockUnit',
                canFilter: false,
                postfix(value: any, rowData?: any) {
                    return rowData?.stockUnit.code;
                },
                scale(value, rowData?: any) {
                    return rowData?.stockUnit?.numberOfDecimals ?? 0;
                },
            }),
            line2: ui.nestedFields.reference({
                node: '@sage/x3-master-data/Product',
                bind: 'product',
                valueField: 'code',
                canFilter: true,
            }),
            line3: ui.nestedFields.reference({
                node: '@sage/x3-master-data/Product',
                bind: 'product',
                valueField: 'localizedDescription1',
                canFilter: true,
            }),
            line4: ui.nestedFields.reference({
                node: '@sage/x3-master-data/UnitOfMeasure',
                bind: 'stockUnit',
                valueField: 'code',
                canFilter: false,
                isHidden: true,
            }),
            line5: ui.nestedFields.reference({
                node: '@sage/x3-stock/PickTicketLine',
                bind: 'pickTicketLine',
                valueField: 'pickTicketLine',
                canFilter: false,
                isHidden: true,
            }),
            line6: ui.nestedFields.reference({
                node: '@sage/x3-master-data/Product',
                bind: 'product',
                valueField: 'upc',
                isHidden: true,
            }),
            line7: ui.nestedFields.reference({
                node: '@sage/x3-stock/PickTicketLine',
                bind: 'pickTicketLine',
                valueField: 'adcPickedLine',
                canFilter: false,
                isHidden: true,
            }),
            line8: ui.nestedFields.reference({
                node: '@sage/x3-stock/PickTicketLine',
                bind: 'pickTicketLine',
                valueField: 'allocationType',
                canFilter: false,
                isHidden: true,
            }),
            line9: ui.nestedFields.reference({
                node: '@sage/x3-stock/PickTicketLine',
                bind: 'pickTicketLine',
                valueField: 'pickTicketLineText',
                canFilter: false,
                isHidden: true,
            }),
            line10: ui.nestedFields.reference({
                node: '@sage/x3-master-data/UnitOfMeasure',
                bind: 'stockUnit',
                valueField: 'numberOfDecimals',
                canFilter: false,
                isHidden: true,
            }),
        },
        orderBy: {
            pickTicket: 1,
            pickTicketLine: 1,
        },
        optionsMenu: [
            {
                title: 'To do',
                graphQLFilter: storage => ({
                    stockSite: { code: String(storage.get('mobile-selected-stock-site')) },
                    preparationList: { _eq: String(storage.get(MobilePickTicketSelectFromList.PICK_LIST_KEY)) },
                    pickTicket: { pickTicketStatus: { _eq: 'inProcess' } },
                    pickTicketLine: { adcPickedLine: { _eq: 0 } },
                }),
            },
            {
                title: 'Done',
                graphQLFilter: storage => ({
                    stockSite: { code: String(storage.get('mobile-selected-stock-site')) },
                    preparationList: { _eq: String(storage.get(MobilePickTicketSelectFromList.PICK_LIST_KEY)) },
                    pickTicketLine: { adcPickedLine: { _eq: 1 } },
                }),
            },
        ],
        onSelect(listItemValue: any) {
            if (listItemValue.pickTicketLine.adcPickedLine === 0) {
                this.$.storage.set(MobilePickTicketSelectFromList.PICK_TICKET_KEY, listItemValue.pickTicket.id);
                this.$.storage.set(
                    MobilePickTicketSelectFromList.PICK_TICKET_LINE_KEY,
                    listItemValue.pickTicketLine.pickTicketLine,
                );
                this.$.storage.set(
                    MobilePickTicketSelectFromList.PICK_TICKET_LINE_TEXT,
                    listItemValue.pickTicketLine.pickTicketLineText,
                );
                if (listItemValue.pickTicketLine.allocationType === 'global') {
                    this.$.router.goTo(`@sage/x3-stock/MobilePickTicketViewPickTicketLineGlobal`, {
                        _id: `${listItemValue.product.code ?? ''}|${String(this.$.storage.get('mobile-selected-stock-site'))}`,
                        mobileSettings: JSON.stringify(this._mobileSettings),
                    });
                } else {
                    this.$.router.goTo(`@sage/x3-stock/MobilePickTicketViewPickTicketLine`, {
                        _id: `${listItemValue.product.code ?? ''}|${String(this.$.storage.get('mobile-selected-stock-site'))}`,
                        mobileSettings: JSON.stringify(this._mobileSettings),
                    });
                }
            }
            return true;
        },
    },
})
export class MobilePickTicketSelectFromList extends ui.Page<GraphApi> {
    private static readonly PICK_LIST_KEY: string = 'mobile-pick-ticket-pick-list';
    private static readonly PICK_TICKET_KEY: string = 'mobile-pick-ticket';
    private static readonly PICK_TICKET_LINE_KEY: string = 'mobile-pick-ticket-line';
    private static readonly PICK_TICKET_LINE_TEXT: string = 'mobile-pick-ticket-line-text';
    private _mobileSettings: MobileSettings;

    @ui.decorators.section<MobilePickTicketSelectFromList>({
        isTitleHidden: true,
        isHidden: true,
    })
    mainSection: ui.containers.Section;

    @ui.decorators.block<MobilePickTicketSelectFromList>({
        parent() {
            return this.mainSection;
        },
    })
    mainBlock: ui.containers.Block;

    @ui.decorators.textField<MobilePickTicketSelectFromList>({
        parent() {
            return this.mainBlock;
        },
        isTransient: true,
    })
    preparationListField: ui.fields.Text;
}
