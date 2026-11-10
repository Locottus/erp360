"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DominicanRepublicEcfAdapter = exports.ElSalvadorDteAdapter = exports.GuatemalaFelAdapter = void 0;
exports.buildFiscalAdapter = buildFiscalAdapter;
class BaseSandboxAdapter {
    async submit(payload, config) {
        const control = String(payload['controlNumber'] ?? '');
        const track = `${this.country}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
        const accepted = config.environment === 'sandbox' || control.length > 4;
        return {
            status: accepted ? 'accepted' : 'submitted',
            providerTrackId: track,
            message: accepted ? 'Documento aceptado en ambiente de homologacion.' : 'Documento enviado y pendiente.',
            responsePayload: {
                adapter_country: this.country,
                provider: config.providerCode,
                environment: config.environment,
                endpoint: config.endpointUrl,
            },
        };
    }
}
class GuatemalaFelAdapter extends BaseSandboxAdapter {
    country = 'GT';
}
exports.GuatemalaFelAdapter = GuatemalaFelAdapter;
class ElSalvadorDteAdapter extends BaseSandboxAdapter {
    country = 'SV';
}
exports.ElSalvadorDteAdapter = ElSalvadorDteAdapter;
class DominicanRepublicEcfAdapter extends BaseSandboxAdapter {
    country = 'DO';
}
exports.DominicanRepublicEcfAdapter = DominicanRepublicEcfAdapter;
function buildFiscalAdapter(country) {
    switch (country) {
        case 'GT':
            return new GuatemalaFelAdapter();
        case 'SV':
            return new ElSalvadorDteAdapter();
        case 'DO':
            return new DominicanRepublicEcfAdapter();
        default:
            throw new Error(`Unsupported fiscal country: ${country}`);
    }
}
//# sourceMappingURL=fiscal.adapters.js.map