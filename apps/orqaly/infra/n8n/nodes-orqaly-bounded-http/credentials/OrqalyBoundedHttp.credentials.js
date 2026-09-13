'use strict';
class OrqalyBoundedHttp {
  constructor() {
    this.name = 'orqalyBoundedHttp'; this.displayName = 'Orqaly bounded HTTPS connection';
    this.documentationUrl = 'https://orqaly.com';
    // No arbitrary authentication helper; only our node may read this encrypted
    // data. In-product secure forms use the server adapter, not this native form.
    this.properties = [
      { displayName: 'Connection ID', name: 'connectionId', type: 'string', default: '', required: true },
      { displayName: 'Frozen Scope', name: 'scope', type: 'string', default: '', required: true },
      { displayName: 'Header Name', name: 'headerName', type: 'string', default: '', required: true },
      { displayName: 'Header Value', name: 'headerValue', type: 'string', typeOptions: { password: true }, default: '', required: true },
    ];
  }
}
module.exports = { OrqalyBoundedHttp };
