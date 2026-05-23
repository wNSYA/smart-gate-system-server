import { Injectable, HttpException, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';
import * as https from 'https';
import { Builder } from 'xml2js';

@Injectable()
export class DeviceApiService {
  private readonly logger = new Logger(DeviceApiService.name);
  private readonly httpsAgent = new https.Agent({ rejectUnauthorized: false });
  private readonly xmlBuilder = new Builder({
    renderOpts: { pretty: true, indent: '  ', newline: '\n' },
    xmldec: { version: '1.0', encoding: 'UTF-8' },
  });

  constructor(private readonly httpService: HttpService) {}

  async sendCommand(
    ipAddress: string,
    route: string,
    method: 'GET' | 'PUT' | 'POST',
    user: string,
    pass: string,
    payload?: any,
    contentType: 'json' | 'xml' = 'json',
  ) {
    const formattedIp = ipAddress.startsWith('http')
      ? ipAddress
      : `http://${ipAddress}`;

    const url = `${formattedIp.replace(/\/$/, '')}${route.startsWith('/') ? route : `/${route}`}`;

    try {
      return await this.executeHttp(url, method, payload, undefined, 'json', contentType);
    } catch (error: any) {
      if (error.response?.status === 401 && error.response.headers['www-authenticate']) {
        const authHeader = error.response.headers['www-authenticate'];
        const digest = this.generateDigestAuth(authHeader, url, method, user, pass);
        return await this.executeHttp(url, method, payload, digest, 'json', contentType);
      }

      throw new HttpException(
        `Device Error: ${error.message || 'Unknown network error'}`,
        error.response?.status || 500,
      );
    }
  }

  private serializePayload(data: any, contentType: 'json' | 'xml'): string | object {
    if (contentType !== 'xml') return data;

    // Already a raw XML string — pass through untouched
    if (typeof data === 'string') return data;

    // Object → XML via xml2js Builder
    return this.xmlBuilder.buildObject(data);
  }

  private async executeHttp(
    url: string,
    method: string,
    data?: any,
    authHeader?: string,
    responseType: 'json' | 'arraybuffer' = 'json',
    contentType: 'json' | 'xml' = 'json',
  ) {
    const headers: Record<string, string> = {};
    if (authHeader) headers['Authorization'] = authHeader;

    let body = data;

    if (data) {
      if (contentType === 'xml') {
        headers['Content-Type'] = 'application/xml';
        body = this.serializePayload(data, 'xml');
      } else {
        headers['Content-Type'] = 'application/json';
      }
    }

    const response = await firstValueFrom(
      this.httpService.request({
        url,
        method,
        data: body,
        headers,
        responseType,
        httpsAgent: this.httpsAgent,
        timeout: 10000,
      }),
    );

    return response.data;
  }

  async downloadBinary(
    ipAddress: string,
    route: string,
    user: string,
    pass: string,
  ): Promise<Buffer> {
    const formattedIp = ipAddress.startsWith('http') ? ipAddress : `http://${ipAddress}`;
    const url = `${formattedIp.replace(/\/$/, '')}${route.startsWith('/') ? route : `/${route}`}`;

    try {
      const data = await this.executeHttp(url, 'GET', null, undefined, 'arraybuffer');
      return Buffer.from(data);
    } catch (error: any) {
      if (error.response?.status === 401 && error.response.headers['www-authenticate']) {
        const authHeader = error.response.headers['www-authenticate'];
        const digest = this.generateDigestAuth(authHeader, url, 'GET', user, pass);
        const data = await this.executeHttp(url, 'GET', null, digest, 'arraybuffer');
        return Buffer.from(data);
      }
      throw error;
    }
  }

  private generateDigestAuth(authHeader: string, uri: string, method: string, user: string, pass: string): string {
    const getMatch = (regex: RegExp) => (authHeader.match(regex) || [])[1];
    const realm = getMatch(/realm="([^"]+)"/);
    const nonce = getMatch(/nonce="([^"]+)"/);
    const qop = getMatch(/qop="([^"]+)"/) || getMatch(/qop=([^,]+)/);

    const md5 = (str: string) => crypto.createHash('md5').update(str).digest('hex');
    const ha1 = md5(`${user}:${realm}:${pass}`);
    const ha2 = md5(`${method}:${uri}`);
    const nc = '00000001';
    const cnonce = crypto.randomBytes(8).toString('hex');

    const response = qop
      ? md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
      : md5(`${ha1}:${nonce}:${ha2}`);

    let digest = `Digest username="${user}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${response}"`;
    if (qop) digest += `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;

    return digest;
  }
}