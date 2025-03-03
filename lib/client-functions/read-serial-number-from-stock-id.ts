import { dialogMessage } from '@sage/x3-master-data/lib/client-functions/dialogs';
import { SerialNumber } from '@sage/x3-stock-data-api';
import { extractEdges, ExtractEdges } from '@sage/xtrem-client';
import * as ui from '@sage/xtrem-ui';

export async function readSerialNumberFromStockId(
    pageInstance: ui.Page,
    stockId: string,
    orderBy: number,
): Promise<ExtractEdges<SerialNumber> | null> {
    if (stockId) {
        try {
            const serialNumber = extractEdges(
                await pageInstance.$.graph
                    .node('@sage/x3-stock-data/SerialNumber')
                    .query(
                        ui.queryUtils.edgesSelector(
                            {
                                code: true,
                            },
                            {
                                filter: { stockId },
                                orderBy: { code: orderBy },
                            },
                        ),
                    )
                    .execute(),
            ) as ExtractEdges<SerialNumber>[];
            if (serialNumber[0]) {
                return serialNumber[0];
            }
        } catch (e) {
            await dialogMessage(
                pageInstance,
                'error',
                ui.localize('@sage/x3-stock/error-loading-serial-number-node', 'Error loading serial number node'),
                String(e),
            );
        }
    }

    return null;
}

export async function isSerialNumberAllocated(
    pageInstance: ui.Page,
    stockSite: string,
    product: string,
    startingSerialNumber: string, endingSerialNumber: string): Promise<boolean> {
    const response = await pageInstance.$.graph
        .node('@sage/x3-stock/Allocation')
        .query(
            ui.queryUtils.edgesSelector(
                {
                    _id: true,
                    serialNumber: true,
                    quantityInStockUnit: true,
                },
                {
                    filter: {
                        stockSite: { code: stockSite},
                        product: { code: product},
                    },
                    first: 500,
                },
            ),
        )
        .execute();
    let result: boolean;
    result = false;
    response.edges.forEach((item:any) => {
        if (
            (startingSerialNumber >= item.node.serialNumber &&
                startingSerialNumber <=
                    calculateEndingSerialNumber(
                        item.node.serialNumber,
                        Number(item.node.quantityInStockUnit),
                    )) ||
            (endingSerialNumber >= item.node.serialNumber &&
                endingSerialNumber <=
                    calculateEndingSerialNumber(
                        item.node.serialNumber,
                        Number(item.node.quantityInStockUnit),
                    )) ||
            (item.node.serialNumber >= startingSerialNumber && item.node.serialNumber <= endingSerialNumber)
        ) {
            result = true;
        }
    });
    return result;
}

export function calculateEndingSerialNumber(startingSerialNumber: string, quantity: number): string {
    return startingSerialNumber.replace(/\d+$/, match => {
        const endingNumber = (Number(match) + quantity - 1).toString();
        const lengthDiff = Math.max(endingNumber.length - match.length, 0);
        return endingNumber.padStart(match.length + lengthDiff, '0');
    });
}
