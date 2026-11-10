import { buildXmlRpcResponse, parseXmlRpcRequest } from './xmlrpc.util';

describe('xmlrpc.util', () => {
  it('parses method and params', () => {
    const xml = `<?xml version="1.0"?>
      <methodCall>
        <methodName>common.authenticate</methodName>
        <params>
          <param><value><string>admin@x.com</string></value></param>
          <param><value><string>secret</string></value></param>
        </params>
      </methodCall>`;
    const result = parseXmlRpcRequest(xml);
    expect(result.methodName).toBe('common.authenticate');
    expect(result.params).toEqual(['admin@x.com', 'secret']);
  });

  it('builds xml response', () => {
    const xml = buildXmlRpcResponse({ ok: true, total: 2 });
    expect(xml).toContain('<methodResponse>');
    expect(xml).toContain('<name>ok</name>');
    expect(xml).toContain('<boolean>1</boolean>');
  });
});
