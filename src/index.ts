import net from 'net';
import tls from 'tls';
import { Url } from 'url';
import url from 'url';
import once from '@tootallnate/once';
import { Agent, ClientRequest, RequestOptions, AgentOptions } from 'agent-base';


export interface BaseHttpProxyAgentOptions {
  secureProxy?: boolean;
  host?: string | null;
  path?: string | null;
  port?: string | number | null;
}

export interface HttpProxyAgentOptions extends AgentOptions, BaseHttpProxyAgentOptions,
  Partial<
  Omit<
    Url & net.NetConnectOpts & tls.ConnectionOptions,
    keyof BaseHttpProxyAgentOptions
  >
  > { }


interface HttpProxyAgentClientRequest extends ClientRequest {
  path: string;
  output?: string[];
  outputData?: {
    data: string;
  }[];
  _header?: string | null;
  _implicitHeader(): void;
}

function isHTTPS(protocol?: string | null): boolean {
  return typeof protocol === 'string' ? /^https:?$/i.test(protocol) : false;
}


export default class HttpProxyAgent extends Agent {
  private secureProxy: boolean;
  private proxy: HttpProxyAgentOptions;

  constructor(_opts: string | HttpProxyAgentOptions) {
    let opts: HttpProxyAgentOptions;
    if (typeof _opts === 'string') {
      opts = url.parse(_opts);
    } else {
      opts = _opts;
    }
    if (!opts) {
      throw new Error(
        'an HTTP(S) proxy server `host` and `port` must be specified!'
      );
    }
    super(opts);

    const proxy: HttpProxyAgentOptions = { ...opts };

    // If `true`, then connect to the proxy server over TLS.
    // Defaults to `false`.
    this.secureProxy = opts.secureProxy || isHTTPS(proxy.protocol);

    // Prefer `hostname` over `host`, and set the `port` if needed.
    proxy.host = proxy.hostname || proxy.host;
    if (typeof proxy.port === 'string') {
      proxy.port = parseInt(proxy.port, 10);
    }
    if (!proxy.port && proxy.host) {
      proxy.port = this.secureProxy ? 443 : 80;
    }

    if (proxy.host && proxy.path) {
      // If both a `host` and `path` are specified then it's most likely
      // the result of a `url.parse()` call... we need to remove the
      // `path` portion so that `net.connect()` doesn't attempt to open
      // that as a Unix socket file.
      delete proxy.path;
      delete proxy.pathname;
    }

    this.proxy = proxy;
  }

  /**
   * Called when the node-core HTTP client library is creating a
   * new HTTP request.
   *
   * @api protected
   */
  async callback(
    req: HttpProxyAgentClientRequest,
    opts: RequestOptions
  ): Promise<net.Socket> {
    const { proxy, secureProxy } = this;
    const parsed = url.parse(req.path);

    if (!parsed.protocol) {
      parsed.protocol = 'http:';
    }

    if (!parsed.hostname) {
      parsed.hostname = opts.hostname || opts.host || null;
    }

    if (parsed.port == null && typeof opts.port) {
      parsed.port = String(opts.port);
    }

    if (parsed.port === '80') {
      // if port is 80, then we can remove the port so that the
      // ":80" portion is not on the produced URL
      parsed.port = '';
    }

    // Change the `http.ClientRequest` instance's "path" field
    // to the absolute path of the URL that will be requested.
    req.path = url.format(parsed);

    // Inject the `Proxy-Authorization` header if necessary.
    if (proxy.auth) {
      req.setHeader(
        'Proxy-Authorization',
        `Basic ${Buffer.from(proxy.auth).toString('base64')}`
      );
    }

    // Create a socket connection to the proxy server.
    let socket: net.Socket;
    if (secureProxy) {
      socket = tls.connect(proxy as tls.ConnectionOptions);
    } else {
      socket = net.connect(proxy as net.NetConnectOpts);
    }

    // At this point, the http ClientRequest's internal `_header` field
    // might have already been set. If this is the case then we'll need
    // to re-generate the string since we just changed the `req.path`.
    if (req._header) {
      let first: string;
      let endOfHeaders: number;
      req._header = null;
      req._implicitHeader();
      if (req.output && req.output.length > 0) {
        // Node < 12
        first = req.output[0];
        endOfHeaders = first.indexOf('\r\n\r\n') + 4;
        req.output[0] = req._header + first.substring(endOfHeaders);
      } else if (req.outputData && req.outputData.length > 0) {
        // Node >= 12

        first = req.outputData[0].data;
        endOfHeaders = first.indexOf('\r\n\r\n') + 4;
        req.outputData[0].data =
          req._header + first.substring(endOfHeaders);
      }
    }

    // Wait for the socket's `connect` event, so that this `callback()`
    // function throws instead of the `http` request machinery. This is
    // important for i.e. `PacProxyAgent` which determines a failed proxy
    // connection via the `callback()` function throwing.
    await once(socket, 'connect');

    return socket;
  }
}

