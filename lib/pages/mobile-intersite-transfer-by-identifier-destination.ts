import { onGoto } from '@sage/x3-master-data/lib/client-functions/on-goto';
import { Location, StockStatus } from '@sage/x3-stock-data-api';
import { extractEdges } from '@sage/xtrem-client';
import * as ui from '@sage/xtrem-ui';
import { validateWithDetails } from '../client-functions/control';
import { inputsIntersiteTransfer } from './mobile-intersite-transfer-by-identifier';
@ui.decorators.page<MobileIntersiteTransferByIdentifierDestination>({
    title: 'Intersite transfer',
    subtitle: 'Enter destination',
    mode: 'default',
    isTransient: false,
    isTitleHidden: true,
    headerCard() {
        return {
            title: this._identifier1,
            line2: this._identifier2,
            line3: this._identifier3,
        };
    },
    async onLoad() {
        const _siteCode = this._getSavedInputs()?.siteDestination?.code;
        const identifierValues = (this.$.queryParameters.identifierValues as string).split(',', 3);
        if (identifierValues.length > 0) {
            this._identifier1.value = identifierValues[0];
        }
        if (identifierValues.length > 1) {
            this._identifier2.value = identifierValues[1];
        }
        if (identifierValues.length > 2) {
            this._identifier3.value = identifierValues[2];
        }
        this._site.value = _siteCode;
        await this._DisplayFieldsByTransaction();
        this.statusDestination.options = await this._getStockStatuses();
    },
    businessActions() {
        return [this.nextButton];
    },
})
export class MobileIntersiteTransferByIdentifierDestination extends ui.Page {
    @ui.decorators.pageAction<MobileIntersiteTransferByIdentifierDestination>({
        title: 'Next',
        buttonType: 'primary',
        shortcut: ['f3'],
        isDisabled: true,
        async onClick() {
            if (!(await validateWithDetails(this))) return;
            this._saveStockChange();
            onGoto(this, '@sage/x3-stock/MobileIntersiteTransferByIdentifier', {
                ReturnFromDetail: 'yes',
                locationDestination: !this.locationDestination.isHidden && this.locationDestination.value?.code,
                statusDestination: !this.statusDestination.isHidden && (this.statusDestination.value as any),
            });
        },
    })
    nextButton: ui.PageAction;

    @ui.decorators.section<MobileIntersiteTransferByIdentifierDestination>({
        isTitleHidden: true,
    })
    section: ui.containers.Section;

    @ui.decorators.block<MobileIntersiteTransferByIdentifierDestination>({
        parent() {
            return this.section;
        },
        isTitleHidden: true,
    })
    block: ui.containers.Block;

    /**
     * Technical fields
     */
    @ui.decorators.textField<MobileIntersiteTransferByIdentifierDestination>({
        isTransient: true,
        isReadOnly: true,
    })
    _site: ui.fields.Text;

    @ui.decorators.textField<MobileIntersiteTransferByIdentifierDestination>({
        isTransient: true,
        isReadOnly: true,
    })
    _identifier1: ui.fields.Text;

    @ui.decorators.textField<MobileIntersiteTransferByIdentifierDestination>({
        isTransient: true,
        isReadOnly: true,
    })
    _identifier2: ui.fields.Text;

    @ui.decorators.textField<MobileIntersiteTransferByIdentifierDestination>({
        isTransient: true,
        isReadOnly: true,
    })
    _identifier3: ui.fields.Text;

    /**
     * Page fields
     */

    @ui.decorators.referenceField<MobileIntersiteTransferByIdentifierDestination, Location>({
        parent() {
            return this.block;
        },
        title: 'Destination location',
        node: '@sage/x3-stock-data/Location',
        valueField: 'code',
        placeholder: 'Scan or select...',
        isMandatory: false,
        isAutoSelectEnabled: true,
        isFullWidth: true,
        isHidden: false,
        canFilter: false,
        filter() {
            const locationFilter: any = {
                stockSite: { code: this._site.value },
                category: { _nin: ['subcontract', 'customer'] },
            };
            return locationFilter;
        },
        async onChange() {
            const _stockChangeLines = this._getSavedInputs()?.intersiteTransfer?.stockChangeLines;
            let _sameLocationOrStatus = false;

            if (this.locationDestination.value?.code) {
                if (_stockChangeLines) {
                    _sameLocationOrStatus = _stockChangeLines.some(_ => {
                        return _.stockDetails?.some(_stockDetail => {
                            return _stockDetail.location === this.locationDestination.value?.code &&
                                _stockDetail.stockSite === this.locationDestination.value?.stockSite
                        });
                    });

                    if (this.statusDestination?.value && _sameLocationOrStatus) {
                        _sameLocationOrStatus = _stockChangeLines.some(_ => {
                            return _.stockDetails?.some(_stockDetail => {
                                return _stockDetail.status === this.statusDestination.value;
                            });
                        });
                    }
                    if (!_sameLocationOrStatus) {
                        await this.$.commitValueAndPropertyChanges();
                        this.nextButton.isDisabled = !this.locationDestination.value;
                        this.locationDestination.getNextField(true)?.focus();
                    } else {
                        this.$.showToast(
                            ui.localize(
                                '@sage/x3-stock/pages__mobile_intersite_transfer_by_identifier_destination__notification__invalid_stock_location_destination__error',
                                'The destination location code and the original destination code are the same: {{ code }}.',
                                { code: this.locationDestination?.value?.code },
                            ),
                            { type: 'error' },
                        );
                        this.locationDestination.focus();
                        this.nextButton.isDisabled = true;
                        return;
                    }
                }
            } else {

                this.nextButton.isDisabled = true;
            }
        },

        columns: [
            ui.nestedFields.text({
                bind: 'code',
                title: 'Code',
            }),
            ui.nestedFields.reference({
                node: '@sage/x3-system/Site',
                bind: 'stockSite',
                valueField: 'code',
                isHidden: true,
            }),
            ui.nestedFields.text({
                bind: 'type',
                title: 'Type',
            }),
        ],
    })
    locationDestination: ui.fields.Reference;

    @ui.decorators.selectField<MobileIntersiteTransferByIdentifierDestination>({
        parent() {
            return this.block;
        },
        title: 'Destination status',
        isMandatory: false,
        isTransient: true,
        isHidden: false,
        async onChange() {
            const _stockChangeLines = this._getSavedInputs()?.intersiteTransfer?.stockChangeLines;
            let _sameLocationOrStatus = false;

            if (this.statusDestination.value) {
                if (_stockChangeLines) {
                    _sameLocationOrStatus = _stockChangeLines.some(_ => {
                        return _.stockDetails?.some(_stockDetail => {
                            return _stockDetail.status === this.statusDestination.value;
                        });
                    });

                    if (this.locationDestination.value?.code && _sameLocationOrStatus) {
                        _sameLocationOrStatus = _stockChangeLines.some(_ => {
                            return _.stockDetails?.some(_stockDetail => {
                                return _stockDetail.location === this.locationDestination.value?.code;
                            });
                        });
                    }

                    if (!_sameLocationOrStatus) {
                        await this.$.commitValueAndPropertyChanges();
                        this.nextButton.isDisabled = !(this.statusDestination.value && this.locationDestination.value);
                    } else {
                        this.$.showToast(
                            ui.localize(
                                '@sage/x3-stock/pages__mobile_intersite_transfer_by_identifier_destination__notification__invalid_stock_status_destination__error',
                                'The destination status code and the original destination code are the same: {{ status }}.',
                                { status: this.statusDestination.value },
                            ),
                            { type: 'error' },
                        );
                        this.statusDestination.focus();
                        this.nextButton.isDisabled = true;
                        return;
                    }
                }
            } else {
                if (_stockChangeLines && this.locationDestination.value?.code) {
                    _sameLocationOrStatus = _stockChangeLines.some(_ => {
                        return _.stockDetails?.some(_stockDetail => {
                            return _stockDetail.location === this.locationDestination.value?.code;
                        });
                    });
                }
                this.nextButton.isDisabled = !(this.locationDestination.value && !_sameLocationOrStatus);
            }
        },
    })
    statusDestination: ui.fields.Select;

    private async _getStockStatuses(): Promise<string[]> {
        try {
            return extractEdges<StockStatus>(
                await this.$.graph
                    .node('@sage/x3-stock-data/StockStatus')
                    .query(
                        ui.queryUtils.edgesSelector<StockStatus>({
                            code: true,
                        }),
                    )
                    .execute(),
            ).map((status: StockStatus) => status.code);
        } catch (err) {
            this.$.dialog.message(
                'error',
                ui.localize(
                    '@sage/x3-stock/pages__mobile_intersite_transfer_by_identifier_destination__notification__invalid_stock_status_error',
                    'No stock status',
                ),
                String(err),
            );
            return [''];
        }
    }

    private _getSavedInputs() {
        return JSON.parse(this.$.storage.get('mobile-intersiteTransferByIdentifier') as string) as inputsIntersiteTransfer;
    }

    private _saveStockChange() {
        const _savedInputs = this._getSavedInputs();
        const _stockChangeLines = _savedInputs?.intersiteTransfer?.stockChangeLines;
        if (_stockChangeLines) {
            const _status = !this.statusDestination.isHidden ? this.statusDestination.value ?? undefined : undefined;
            const _location: string | undefined = !this.locationDestination.isHidden
                ? this.locationDestination.value?.code
                : undefined;
            _stockChangeLines.forEach(_ => {
                // For transaction card display only
                if (_status) {
                    _.statusDestination = _status;
                }
                if (_location) {
                    _.locationDestination = _location;
                }
                // For transaction herself
                _?.stockDetails?.forEach(_stockDetail => {
                    if (_status) {
                        _stockDetail.status = _status;
                    }
                    if (_location) {
                        _stockDetail.location = _location;
                    }
                });
            });

            this.$.storage.set('mobile-intersiteTransferByIdentifier', JSON.stringify(_savedInputs));
        }
    }

    private async _DisplayFieldsByTransaction() {
        const _transaction = this._getSavedInputs()?.selectedTransaction;
        this.statusDestination.isHidden = _transaction ? !_transaction.isStatusChange : true;
    }
}
