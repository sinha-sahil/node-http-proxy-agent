/// <reference types="node" />
/// <reference types="node" />
/// <reference types="node" />
import net from 'net';
import tls from 'tls';
import { Url } from 'url';
import { Agent, ClientRequest, RequestOptions, AgentOptions } from 'agent-base';
export interface BaseHttpProxyAgentOptions {
    secureProxy?: boolean;
    host?: string | null;
    path?: string | null;
    port?: string | number | null;
}
export interface HttpProxyAgentOptions extends AgentOptions, BaseHttpProxyAgentOptions, Partial<Omit<Url & net.NetConnectOpts & tls.ConnectionOptions, keyof BaseHttpProxyAgentOptions>> {
}
interface HttpProxyAgentClientRequest extends ClientRequest {
    path: string;
    output?: string[];
    outputData?: {
        data: string;
    }[];
    _header?: string | null;
    _implicitHeader(): void;
}
export default class HttpProxyAgent extends Agent {
    private secureProxy;
    private proxy;
    constructor(_opts: string | HttpProxyAgentOptions);
    /**
     * Called when the node-core HTTP client library is creating a
     * new HTTP request.
     *
     * @api protected
     */
    callback(req: HttpProxyAgentClientRequest, opts: RequestOptions): Promise<net.Socket>;
}
export {};
