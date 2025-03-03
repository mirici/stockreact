import { ExpirationManagement } from '@sage/x3-master-data-api';
import { ExpirationLeadTimeUnits } from '@sage/x3-stock-data-api';
import { date, DateValue } from '@sage/xtrem-date-time';

/**
 * Return the default value corresponding to the product rule for the expiry date
 * @param product
 * @param effectiveDate
 * @return
 */
export function expirationDateDefaultValue(
    productExpirationManagement: ExpirationManagement,
    productExpirationLeadTime: number,
    productExpirationLeadTimeUnit: ExpirationLeadTimeUnits,
    effectiveDate: string,
): string | null {
    let _tmpDate = effectiveDate ? date.parse(effectiveDate) : null;
    let expiryDate: DateValue | null;

    if (_tmpDate === null) return null;

    if (productExpirationManagement !== null) {
        // Check if the product is not managed in expiration mode
        if (productExpirationManagement === 'notManaged' || productExpirationManagement === 'manualEntry') {
            // returns 2999-12-31
            //expiryDate = date.make(2999, 12, 31);
            return null;
        } else {
            expiryDate = null;
            if (productExpirationLeadTimeUnit === 'calendarDays') {
                // the expiry date is effectiveDate + expirationLeadTime duration value in days
                expiryDate = _tmpDate.addDays(productExpirationLeadTime);
            }

            // Check if expiration time unit is months
            if (productExpirationLeadTimeUnit === 'month') {
                // the expiry date is effectiveDate + expirationLeadTime in months
                expiryDate = _tmpDate.addMonths(productExpirationLeadTime);
            }
            if (
                productExpirationManagement === 'roundingMonthEnd' ||
                productExpirationManagement === 'roundingBeginningMonth1'
            ) {
                // Check if the product expiration mode indicate a rounding rule
                if (productExpirationManagement === 'roundingMonthEnd') {
                    // if the rounding rule is month end
                    expiryDate = _tmpDate.endOfMonth();
                } else if (productExpirationManagement === 'roundingBeginningMonth1') {
                    // if the rounding rule is next month begin
                    expiryDate = _tmpDate.begOfMonth().addMonths(1);
                }
            }
        }
    } else {
        return null;
    }

    // if none of the above conditions are met:
    return expiryDate ? expiryDate.format('YYYY-MM-DD') : null;
}

export function useByDateDefaultValue(
    expirationDate: string | null,
    referenceDate: string | null,
    productExpirationManagement: ExpirationManagement,
    useByDateCoefficient: number,
): string | null {
    let _tmpExpirationDate = expirationDate ? date.parse(expirationDate) : null;
    let _tmpReferenceDate = referenceDate ? date.parse(referenceDate) : null;
    let useByDate: DateValue;
    if (_tmpExpirationDate === null && _tmpReferenceDate === null) return null;
    if (productExpirationManagement !== null) {
        // Check if the product is not managed in expiration mode
        if (productExpirationManagement === 'notManaged' || productExpirationManagement === 'manualEntry') {
            return null;
        }
        if (useByDateCoefficient > 1 || useByDateCoefficient === 0 || useByDateCoefficient < 0) {
            useByDateCoefficient = 1;
        }
        if (_tmpExpirationDate) {
            if (_tmpReferenceDate && _tmpExpirationDate > _tmpReferenceDate) {
                const delay = Math.round(useByDateCoefficient * _tmpExpirationDate.daysDiff(_tmpReferenceDate));
                useByDate = _tmpReferenceDate.addDays(delay);
            } else {
                useByDate = _tmpExpirationDate;
            }
        } else {
            return null;
        }
    } else {
        return null;
    }
    return useByDate.format('YYYY-MM-DD');
}
