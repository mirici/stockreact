import { GraphApi, PickTicketLine } from '@sage/x3-stock-api';
import { MobileSettings } from '@sage/x3-stock-data-api';
import * as ui from '@sage/xtrem-ui';
@ui.decorators.page<MobilePickTicketSelectFromTicket, PickTicketLine>({
    isTitleHidden: true,
    title: 'Pick ticket',
    subtitle: 'Select a line',
    node: '@sage/x3-stock/PickTicketLine',
    isTransient: false,
    skipDirtyCheck: true,
    async onLoad() {
        let pickTicket = this.$.storage.get(MobilePickTicketSelectFromTicket.PICK_TICKET_KEY);
        if (pickTicket) {
            this.pickTicketField.value = pickTicket.toString();
        } else {
            const mess: string = ui.localize('@sage/x3-stock/pickTicket-required', 'Pick ticket is required');
            this.$.showToast(mess, { type: 'error' });
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
            title: ui.nestedFields.text({
                bind: 'pickTicket',
                canFilter: true,
                isHidden: false,
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
            line5: ui.nestedFields.numeric({
                bind: 'pickTicketLine',
                canFilter: false,
                isHidden: true,
            }),
            line6: ui.nestedFields.reference({
                node: '@sage/x3-master-data/Product',
                bind: 'product',
                valueField: 'upc',
                isHidden: true,
                canFilter: true,
            }),
            line7: ui.nestedFields.numeric({
                bind: 'adcPickedLine',
                canFilter: false,
                isHidden: true,
            }),
            line8: ui.nestedFields.dropdownList({
                bind: 'allocationType',
                canFilter: false,
                isHidden: true,
            }),
            line9: ui.nestedFields.text({
                bind: 'pickTicketLineText',
                canFilter: true,
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
                    pickTicket: { _eq: String(storage.get(MobilePickTicketSelectFromTicket.PICK_TICKET_KEY)) },
                    adcPickedLine: { _eq: 0 },
                }),
            },
            {
                title: 'Done',
                graphQLFilter: storage => ({
                    pickTicket: { _eq: String(storage.get(MobilePickTicketSelectFromTicket.PICK_TICKET_KEY)) },
                    adcPickedLine: { _eq: 1 },
                }),
            },
        ],
        onSelect(listItemValue: any) {
            if (listItemValue.adcPickedLine === 0) {
                this.$.storage.set(MobilePickTicketSelectFromTicket.PICK_TICKET_KEY, listItemValue.pickTicket);
                this.$.storage.set(MobilePickTicketSelectFromTicket.PICK_TICKET_LINE_KEY, listItemValue.pickTicketLine);
                this.$.storage.set(
                    MobilePickTicketSelectFromTicket.PICK_TICKET_LINE_TEXT,
                    listItemValue.pickTicketLineText,
                );
                if (listItemValue.allocationType === 'global') {
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
export class MobilePickTicketSelectFromTicket extends ui.Page<GraphApi> {
    private static readonly PICK_TICKET_KEY: string = 'mobile-pick-ticket';
    private static readonly PICK_TICKET_LINE_KEY: string = 'mobile-pick-ticket-line';
    private static readonly PICK_TICKET_LINE_TEXT: string = 'mobile-pick-ticket-line-text';
    private _mobileSettings: MobileSettings;

    @ui.decorators.section<MobilePickTicketSelectFromTicket>({
        isTitleHidden: true,
        isHidden: true,
    })
    mainSection: ui.containers.Section;

    @ui.decorators.block<MobilePickTicketSelectFromTicket>({
        parent() {
            return this.mainSection;
        },
    })
    mainBlock: ui.containers.Block;

    @ui.decorators.textField<MobilePickTicketSelectFromTicket>({
        parent() {
            return this.mainBlock;
        },
        isTransient: true,
    })
    pickTicketField: ui.fields.Text;
}
