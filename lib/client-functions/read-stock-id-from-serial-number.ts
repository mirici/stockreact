import { dialogMessage } from '@sage/x3-master-data/lib/client-functions/dialogs';
import * as ui from '@sage/xtrem-ui';

export async function readStockIdFromSerialNumber(
    pageInstance: ui.Page,
    serialNumber: string,
    product: string | null,
): Promise<number | null> {
    try {
        const serialNumberNode = await pageInstance.$.graph
            .node('@sage/x3-stock-data/SerialNumber')
            .read(
                {
                    stockId: true,
                },
                `${product}|${serialNumber}`,
            )
            .execute();
        return serialNumberNode?.stockId;
    } catch (e) {
        await dialogMessage(
            pageInstance,
            'error',
            ui.localize('@sage/x3-stock/error-loading-serial-number', 'Error loading serial number'),
            String(e),
        );
    }
    return null;
}
