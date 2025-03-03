import { extractEdges } from '@sage/xtrem-client';
import * as ui from '@sage/xtrem-ui';

export type fieldData = {
    fieldIsHidden: boolean;
    fieldValue: any;
    fieldName?: string;
    validate?: string;
};

export function validate(pageInstance: ui.Page, isPageValid: boolean, fieldsData: fieldData[]) {
    const fieldErrors = new Array<string>();
    let areAllFieldsValid = true;
    fieldsData.forEach(field => {
        if (!_validateField(field)) {
            areAllFieldsValid = false;
            fieldErrors.push(field.fieldName ?? '');
        }
    });

    if (fieldErrors.length >= 1) _notifyFieldNotValid(pageInstance, fieldErrors);

    return isPageValid && areAllFieldsValid;
}

function _validateField(data: fieldData) {
    return !data.validate ? true : false;
}

function _notifyFieldNotValid(pageInstance: ui.Page, fields: string[]) {
    pageInstance.$.removeToasts();
    pageInstance.$.showToast(
        ui.localize(
            '@sage/x3-stock/pages__utils__notification__invalid_inputs_error',
            `Check your entry for {{#each fieldNames}}\n - {{this}}{{/each}}`,
            { fieldNames: fields.map(field => (pageInstance as any)[field].title) },
        ),
        { type: 'error', timeout: 5000 },
    );
}

export async function validatePage(pageInstance: ui.Page): Promise<boolean> {
    const errors = await pageInstance.$.page.validate();
    if (errors.length === 0) {
        return true;
    }

    pageInstance.$.removeToasts();
    pageInstance.$.showToast(`${ui.localize('@sage/x3-stock/notification-validation-error', 'Error')}: ${errors[0]}`, {
        type: 'error',
        timeout: 30000,
    });

    return false;
}

export async function validateWithDetails(pageInstance: ui.Page): Promise<boolean> {
    // to handle such edgy cases as user clearing an input from a field and then directly clicking on a button without blurring that field
    await pageInstance.$.commitValueAndPropertyChanges();
    const errors: ui.ValidationResult[] = await pageInstance.$.page.validateWithDetails();
    if (errors.length === 0) {
        return true;
    }

    pageInstance.$.removeToasts();
    pageInstance.$.showToast(
        ui.localize(
            '@sage/x3-stock/pages__utils__notification__invalid_inputs_error',
            `Check your entry for {{#each fieldNames}}\n - {{this}}{{/each}}`,
            {
                // TODO: Issue: Perhaps a better way in Typescript to dynamically retrieve a page's components rather than to cast it to 'any' type
                fieldNames: errors.map(
                    (error: ui.ValidationResult) =>
                        `${(pageInstance as any)[error.elementId]?.title ?? error.elementId}`,
                ),
            },
        ),
        { type: 'error', timeout: 5000 },
    );

    return false;
}

// Decision made to not present an error to the user if one occurs during renumbering
export async function renumberStockCountList(
    stockCountSessionNumber: string,
    stockCountListNumber: string,
    page: ui.Page,
): Promise<void> {
    try {
        const _renumberListArgs = {
            stockCountSessionNumber: stockCountSessionNumber,
            stockCountListNumber: stockCountListNumber,
        };
        await page.$.graph
            .node('@sage/x3-stock/StockCountListDetail')
            .mutations.renumberCountList(
                {
                    stockCountSessionNumber: true,
                    stockCountListNumber: true,
                },
                {
                    parameters: _renumberListArgs,
                },
            )
            .execute();
    } catch (e) {
        ui.console.error(`renumberCountList :\n${JSON.stringify(e)}`);
    }
}

export async function controlLotReceipt(
    pageInstance: ui.Page,
    lot: string,
    product: string,
    entryType: string,
    site: string | null,
): Promise<boolean> {
    if (!lot || !product || !entryType) throw new Error('Invalid arguments');
    let stockJournalFilter = {
        stockSite: site,
        documentType: entryType,
        product: { code: product },
        isUpdated: true,
        lot: lot,
    };

    const response = extractEdges(
        await pageInstance.$.graph
            .node('@sage/x3-stock/StockJournal')
            .query(
                ui.queryUtils.edgesSelector(
                    {
                        lot: true,
                        sublot: true,
                    },
                    {
                        filter: stockJournalFilter,
                    },
                ),
            )
            .execute(),
    );

    if (response.length > 0) {
        pageInstance.$.showToast(
            ui.localize(
                '@sage/x3-stock/notification-error-receipt-lot',
                'The lot number {{ lot }} already exists for this product.',
                { lot: lot },
            ),
            { type: 'error' },
        );
        return false;
    }
    return true;
}
