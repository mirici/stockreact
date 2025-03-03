import { UnitOfMeasure } from '@sage/x3-master-data-api';
import { dialogMessage } from '@sage/x3-master-data/lib/client-functions/dialogs';
import { ExtractEdges, extractEdges, ExtractEdgesPartial } from '@sage/xtrem-client';
import * as ui from '@sage/xtrem-ui';

export async function getUnitNumberOfDecimalList(pageInstance: ui.Page): Promise<ExtractEdges<UnitOfMeasure>[]> {
    try {
        const numberOfDecimalList = extractEdges<UnitOfMeasure>(
            await pageInstance.$.graph
                .node('@sage/x3-master-data/UnitOfMeasure')
                .query(
                    ui.queryUtils.edgesSelector(
                        {
                            code: true,
                            numberOfDecimals: true,
                        },
                        {
                            first: 1000,
                        },
                    ),
                )
                .execute(),
        );
        return numberOfDecimalList;
    } catch (e) {
        pageInstance.$.dialog.message(
            'error',
            ui.localize('@sage/x3-stock/pages__utils__get_unit_number_decimals_error', 'Error loading unit'),
            String(e),
        );
        return [];
    }
}

export function getNumberOfDecimal(list: ExtractEdgesPartial<UnitOfMeasure>[] | undefined, unit: string | undefined) {
    if (unit && list) {
        const _unitOfMeasure = list.filter(uom => uom.code === unit);
        return _unitOfMeasure[0]?.numberOfDecimals ?? 0;
    }
    return 0;
}
export function GetNumberOfDecimals(pageInstance: ui.Page, Unit: string) {
    try {
        const numberOfDecimals = pageInstance.$.graph
            .node('@sage/x3-master-data/UnitOfMeasure')
            .read(
                {
                    _id: true,
                    numberOfDecimals: true,
                },
                `${Unit}`,
            )
            .execute();

        return numberOfDecimals.numberOfDecimals;
    } catch (e) {
        dialogMessage(
            pageInstance,
            'error',
            ui.localize('@sage/x3-stock/error-loading-unit', 'Error loading unit'),
            String(e),
        );
    }
}
